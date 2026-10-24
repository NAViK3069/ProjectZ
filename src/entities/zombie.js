// Zombies, following the design sheet. Every one shambles toward the player
// along the flow field with its floating clawed hands held up, winds up and
// swipes when close. Types add their own twist:
//   common   - ten everyday looks (worker, police, scientist, prisoner...)
//   runner   - fast;  leaper - pounces from a distance
//   spitter  - keeps its distance and lobs acid;  suicide - rushes in and explodes
//   armored  - riot shield blocks shots from the front;  tank - big, slow, hits like a truck
//   burned / toxic - burst into flames / a gas cloud when they die;  frozen - its hits slow you
//   brute    - boss: huge, smashes the floor with a shockwave
//
// Deaths depend on what killed them: a headshot bursts the head, a body kill
// tears the torso apart, a blast blows them to pieces (see gore()).

import { makeCanvas, makeShadow } from '../engine/pixel.js';
import { WALK_BODY, WALK_HEAD, walkLegs } from './rig.js';
import { zombieArt, COMMON_LOOKS } from './zombieart.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[(Math.random() * list.length) | 0];

// hp/speed are multipliers on the round's base numbers; size: art size class
export const TYPES = {
  common: { looks: COMMON_LOOKS, hp: 1, speed: 1, damage: 22 },
  runner: { looks: ['runner', 'infected'], hp: 0.7, speed: 2.2, damage: 15 },
  leaper: { looks: ['leaper'], hp: 0.8, speed: 1.2, damage: 20, leap: true },
  spitter: { looks: ['spitter'], hp: 0.8, speed: 0.9, damage: 15, spit: true },
  suicide: { looks: ['suicide'], hp: 0.6, speed: 1.9, damage: 0, bomb: true },
  armored: { looks: ['armored'], hp: 1.4, speed: 0.8, damage: 25, shield: true },
  tank: { looks: ['tank'], hp: 5, speed: 0.7, damage: 38, knock: 320 },
  burned: { looks: ['burned'], hp: 1.2, speed: 1.05, damage: 22, onDeath: 'fire' },
  frozen: { looks: ['frozen'], hp: 1.2, speed: 0.95, damage: 18, chill: 2.5 },
  toxic: { looks: ['toxic'], hp: 1.1, speed: 0.95, damage: 18, onDeath: 'gas' },
  brute: { looks: ['brute'], hp: 18, speed: 0.75, damage: 50, knock: 420, boss: true, smash: true },
};

const SIZE = {
  normal: { halfW: 6, reach: 20, range: 16, shadow: [15, 5], gore: 1 },
  big: { halfW: 9, reach: 26, range: 22, shadow: [24, 7], gore: 1.4 },
  huge: { halfW: 13, reach: 34, range: 28, shadow: [34, 9], gore: 1.9 },
};
const SHADOWS = {};

const WALK_FPS = 10;
const HIT_FLASH = 0.08;
const HEADSHOT = 2.5;
// attack: hands go up and back, then sweep forward and down
const WINDUP = 0.35, SWIPE = 0.13, RECOVER = 0.25, COOLDOWN = 0.8;
const DIE_TIME = { head: 0.45, body: 0.35, explode: 0 };
const FLESH = ['#849671', '#627356', '#8f1b1b', '#6a1010', '#c46a6a'];
const BONE = ['#d9d2b5', '#b9b296', '#8f1b1b', '#c46a6a'];
const ease = (t) => t * t * (3 - 2 * t);

export class Zombie {
  // opts: { type, hp, speed, damage }; env: { particles, explosives, hazards }
  constructor(x, y, opts, env) {
    const T = TYPES[opts.type ?? 'common'];
    this.type = opts.type ?? 'common';
    this.T = T;
    this.env = env;
    this.look = pick(T.looks);
    this.art = zombieArt(this.look);
    this.size = SIZE[this.art.W > 50 ? 'huge' : this.art.W > 40 ? 'big' : 'normal'];
    this.x = x;
    this.y = y;
    this.halfW = this.size.halfW;
    this.height = 6;
    this.vx = 0;
    this.vy = 0;
    this.kx = 0;          // knockback velocity
    this.ky = 0;
    this.hp = opts.hp;
    this.maxHp = opts.hp;
    this.speed = opts.speed;
    this.damage = opts.damage ?? T.damage;
    this.facing = 1;
    this.animTime = Math.random();
    this.frame = 0;
    this.flash = 0;
    this.attack = -1;     // time into the current attack, -1 when not attacking
    this.hitDone = false;
    this.cooldown = 0;
    this.special = rand(1, 2.5);   // countdown for spit / leap
    this.leaping = null;  // { t, vx, vy }
    this.crouch = 0;
    this.fuse = -1;       // suicide: arming countdown
    this.dying = -1;      // time since death, -1 while alive
    this.deathType = null;
    this.dead = false;    // fully gone (baked into the floor)
    this.wobble = Math.random() * Math.PI * 2;
    this.rise = 0.35;     // spawn: fade in out of the dark
    this.lift = 0;        // height off the ground (leaping)
    this.aggro = opts.aggro ?? Infinity;   // how close you have to be for it to notice you
    this.alert = this.aggro === Infinity;  // after you (or still wandering about)
    const sh = this.size.shadow.join('x');
    SHADOWS[sh] ??= makeShadow(...this.size.shadow);
    this.shadow = SHADOWS[sh];
  }

  get boss() {
    return !!this.T.boss;
  }

  get sortY() {
    return this.y;
  }

  get hittable() {
    return this.dying < 0;
  }

  get finished() {
    return this.dying >= DIE_TIME[this.deathType];
  }

  // Which part a bullet at ground (x, y) and height z hits, judged on screen.
  hitPart(x, y, z) {
    if (Math.abs(y - this.y) > 26 + this.halfW) return null;
    const dx = x - this.x, sy = y - z - this.y + this.lift;
    const { headBox: H, bodyBox: B } = this.art;
    if (Math.abs(dx) <= H.half && sy >= H.top && sy < H.bottom) return 'head';
    if (Math.abs(dx) <= B.half && sy >= B.top && sy <= B.bottom) return 'body';
    return null;
  }

  // part: 'head' | 'body' | 'blast'. Returns what happened, for effects/scoring.
  hit(damage, dirX, dirY, z, part) {
    const sp = Math.hypot(dirX, dirY) || 1, nx = dirX / sp, ny = dirY / sp;
    const res = { armor: false, killed: false, part, x: this.x, y: this.y, z, nx, ny };
    // a riot shield stops anything coming at its front (not blasts)
    if (this.T.shield && part !== 'blast' && part !== 'fire' && nx * this.facing < -0.25) {
      res.armor = true;
      this.kx += nx * 20;
      this.ky += ny * 20;
      return res;
    }
    this.flash = HIT_FLASH;
    this.hp -= damage * (part === 'head' ? HEADSHOT : 1);
    const push = part === 'fire' ? 0 : (part === 'blast' ? 160 : part === 'melee' ? (this.meleeKnock ?? 70) : 70) / (this.boss ? 4 : this.size.gore);
    this.kx += nx * push;
    this.ky += ny * push;
    if (this.hp <= 0) {
      res.killed = true;
      this.dying = 0;
      this.deathType = part === 'head' ? 'head' : part === 'blast' || this.T.bomb ? 'explode' : 'body';
      this.stunT = 0;
      this.fallDir = nx >= 0 ? 1 : -1;
      this.hitDir = { x: nx, y: ny };
    }
    return res;
  }

  // Flashbangs, stun grenades and tasers: stands there twitching for t seconds.
  stun(t, kind = 'flash') {
    if (this.boss) t *= 0.4;
    this.stunT = Math.max(this.stunT ?? 0, t);
    this.stunKind = kind;
    this.attack = -1;
    this.spitWind = 0;
    this.crouch = 0;
  }

  // In smoke: can't see you, stumbles about.
  confuse(t) {
    this.confT = Math.max(this.confT ?? 0, t);
  }

  // Burst of gore at the moment of death, plus whatever the type leaves behind.
  gore(particles) {
    const { x, y } = this, { x: nx, y: ny } = this.hitDir, s = this.size.gore;
    const g = this.art.gibs;
    const fly = (img, z, power = 1, up = 1) =>
      particles.gib(img, x + rand(-3, 3) * s, y + rand(-2, 2), z * s, (nx * 60 + rand(-50, 50)) * power, (ny * 40 + rand(-30, 30)) * power, rand(60, 130) * up);

    if (this.deathType === 'head') {
      fly(g.skullL, 24, 0.8, 1.2);
      fly(g.skullR, 24, 0.8, 1.2);
      fly(g.jaw, 20, 0.6);
      particles.bits(x, y, 24 * s, 14 * s, BONE, 0.9);
      particles.blood(x, y, 24 * s, nx, ny, 26 * s, { up: 70, speed: 1.3, spread: 1.6 });
    } else if (this.deathType === 'body') {
      fly(g.head, 22, 0.7, 1.3);
      fly(g.torsoL, 14);
      fly(g.torsoR, 14);
      fly(g.hand, 14, 1.2);
      fly(g.hand, 14, 1.2);
      particles.bits(x, y, 12 * s, 18 * s, FLESH, 1.1);
      particles.blood(x, y, 12 * s, nx, ny, 30 * s, { up: 40, speed: 1.4, spread: 1.4 });
    } else {
      for (const img of [g.head, g.torsoL, g.torsoR, g.hips, g.leg, g.leg, g.hand, g.hand]) fly(img, rand(6, 20), 2, 1.4);
      particles.bits(x, y, 10, 30 * s, FLESH, 1.8);
      particles.blood(x, y, 10, nx, ny, 40 * s, { up: 60, speed: 2.2, spread: Math.PI });
    }
    const env = this.env;
    if (this.T.onDeath && env?.hazards) env.hazards.area(this.T.onDeath, x, y, this.size.gore);
    if (this.T.bomb && env?.explosives && !this.blown) {
      this.blown = true;
      env.explosives.explode(x, y - 3, 1.1);
    }
  }

  update(dt, world, player, zombies, particles) {
    this.flash -= dt;
    if (this.dying >= 0) {
      this.dying += dt;
      this.x += this.kx * dt;
      this.y += this.ky * dt;
      this.kx *= Math.exp(-8 * dt);
      this.ky *= Math.exp(-8 * dt);
      // headless body keeps pumping blood out of the neck for a moment
      if (this.deathType === 'head' && this.dying < 0.35 && Math.random() < 0.6) {
        particles.blood(this.x, this.y, -this.art.neck * (1 - this.dying / DIE_TIME.head), 0, -1, 1, { up: 60, speed: 0.4, spread: 1.2 });
      }
      return;
    }
    if (this.rise > 0) this.rise -= dt;
    const T = this.T;
    const pdx = player.x - this.x, pdy = player.y - this.y, pd = Math.hypot(pdx, pdy);
    if (!this.alert) { if (Math.abs(this.vx) > 2) this.facing = this.vx > 0 ? 1 : -1; }
    else if (Math.abs(pdx) > 2 && !this.leaping) this.facing = pdx > 0 ? 1 : -1;

    if (this.leaping) return this.updateLeap(dt, world, player, pd);

    // stunned: knocked about but otherwise frozen in place
    if (this.stunT > 0) {
      this.stunT -= dt;
      this.kx *= Math.exp(-10 * dt);
      this.ky *= Math.exp(-10 * dt);
      this.vx = this.vy = 0;
      world.slide(this, this.kx * dt, this.ky * dt);
      this.attack = -1;
      return;
    }
    this.confT = Math.max(0, (this.confT ?? 0) - dt);
    // out in the open: it notices you when you come close or hurt it, and
    // loses interest again once you're well away
    if (!this.alert && !player.dead && (pd < this.aggro || this.hp < this.maxHp)) this.alert = true;
    else if (this.alert && this.aggro !== Infinity && pd > this.aggro * 3) this.alert = false;
    const lost = this.confT > 0 || !this.alert;

    // head for the player along the flow field; straight at them when close
    let tx = player.x, ty = player.y;
    if (pd > 24) {
      const step = world.nextStep(this.x, this.y);
      if (step) {
        tx = step.x;
        ty = step.y;
      }
    }
    if (lost) {
      // wander in a slowly turning direction instead
      this.wander = (this.wander ?? Math.random() * 6.3) + (Math.random() - 0.5) * dt * 6;
      tx = this.x + Math.cos(this.wander) * 20;
      ty = this.y + Math.sin(this.wander) * 20;
    }
    let dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    // spitters hang back at range
    if (T.spit && pd < 80) {
      dx = -pdx / pd;
      dy = -pdy / pd;
    }
    // shamble: a little sideways sway
    this.wobble += dt * 3;
    dx += -dy * Math.sin(this.wobble) * 0.25;
    dy += dx * Math.sin(this.wobble) * 0.25;

    // keep apart from each other
    let sx = 0, sy = 0;
    const space = this.halfW * 2 + 2;
    for (const o of zombies) {
      if (o === this || o.dying >= 0) continue;
      const ox = this.x - o.x, oy = this.y - o.y, od = Math.hypot(ox, oy), min = Math.max(space, o.halfW * 2 + 2);
      if (od > 0 && od < min) {
        sx += (ox / od) * (min - od) / min;
        sy += (oy / od) * (min - od) / min;
      }
    }

    const busy = this.attack >= 0 || this.crouch > 0 || this.fuse >= 0;
    const slow = busy ? 0.2 : this.rise > 0 ? 0.3 : 1;
    const want = (player.dead && this.alert ? 0 : this.speed * slow * (lost ? 0.35 : 1) * (T.spit && pd < 140 && pd > 80 ? 0.3 : 1)) * (this.env?.speedAt?.(this) ?? 1);
    this.vx += (dx * want + sx * 40 - this.vx) * Math.min(1, dt * 6);
    this.vy += (dy * want + sy * 40 - this.vy) * Math.min(1, dt * 6);
    this.kx *= Math.exp(-10 * dt);
    this.ky *= Math.exp(-10 * dt);
    world.slide(this, (this.vx + this.kx) * dt, (this.vy + this.ky) * dt);

    if (!lost) {
      this.updateSpecial(dt, player, pd);
      this.updateAttack(dt, player, pd);
    }

    const speed = Math.hypot(this.vx, this.vy);
    this.animTime += dt * (0.3 + speed / 40);
    this.frame = Math.floor(this.animTime * WALK_FPS) % WALK_BODY.length;
  }

  // Spitting, pouncing, arming the bomb.
  updateSpecial(dt, player, pd) {
    const T = this.T, env = this.env;
    this.special -= dt;
    if (player.dead) return;
    if (T.spit && this.special <= 0 && pd < 170 && pd > 30) {
      this.special = rand(2.2, 3);
      this.attack = -1;
      this.spitWind = 0.4;
    }
    if (this.spitWind > 0 && (this.spitWind -= dt) <= 0) {
      env?.hazards?.spit(this.x + this.facing * 6, this.y, 18, player.x + player.vx * 0.3, player.y + player.vy * 0.3);
    }
    if (T.leap && this.special <= 0 && pd < 95 && pd > 30 && this.attack < 0) {
      this.crouch = 0.35;
      this.special = rand(3, 4);
      this.leapAt = { x: player.x, y: player.y };
    }
    if (this.crouch > 0 && (this.crouch -= dt) <= 0) {
      const lx = this.leapAt.x - this.x, ly = this.leapAt.y - this.y, ld = Math.hypot(lx, ly) || 1;
      const sp = Math.min(260, ld / 0.32);
      this.leaping = { t: 0, vx: (lx / ld) * sp, vy: (ly / ld) * sp };
    }
    if (T.bomb && this.fuse < 0 && pd < 22) this.fuse = 0.45;
    if (this.fuse >= 0 && (this.fuse -= dt) < 0) {
      // boom - it goes with it
      this.hp = 0;
      this.dying = 0;
      this.deathType = 'explode';
      this.fallDir = 1;
      this.hitDir = { x: 0, y: 1 };
      this.gore(env.particles);
    }
  }

  updateLeap(dt, world, player, pd) {
    const L = this.leaping;
    L.t += dt;
    world.slide(this, L.vx * dt, L.vy * dt);
    this.lift = Math.sin(Math.min(1, L.t / 0.32) * Math.PI) * 14;
    if (L.t >= 0.32) {
      this.leaping = null;
      this.lift = 0;
      this.cooldown = 0.6;
      if (pd < this.size.reach) player.hurt(this.damage, this.x, this.y);
      this.env?.particles?.dust(this.x, this.y - 1, 4, 0, 0);
    }
  }

  updateAttack(dt, player, pd) {
    this.cooldown -= dt;
    if (this.attack >= 0) {
      this.attack += dt;
      // the claws land at the start of the swipe
      if (!this.hitDone && this.attack >= WINDUP) {
        this.hitDone = true;
        if (this.T.smash) this.smash(player);
        else if (pd < this.size.reach && !player.dead) {
          if (player.hurt(this.damage, this.x, this.y, this.T.knock) && this.T.chill) player.chill(this.T.chill);
        }
      }
      if (this.attack >= WINDUP + SWIPE + RECOVER) {
        this.attack = -1;
        this.cooldown = COOLDOWN;
      }
    } else if (pd < this.size.range && this.cooldown <= 0 && !player.dead && !this.T.bomb && !this.spitWind) {
      this.attack = 0;
      this.hitDone = false;
    }
  }

  // Brute: both fists slam the floor - a shockwave around it.
  smash(player) {
    const R = 40, env = this.env;
    env?.particles?.dust(this.x + this.facing * 14, this.y, 14, 0, 0);
    env?.kick?.(0, 5);
    const d = Math.hypot(player.x - this.x, player.y - this.y);
    if (d < R && !player.dead) player.hurt(this.damage * (1 - d / (R * 1.5)), this.x, this.y, this.T.knock);
  }

  // ---------- pose ----------

  pose() {
    const f = this.frame;
    const side = Math.abs(this.vx) / (Math.hypot(this.vx, this.vy) || 1);
    const [legL, legR] = walkLegs(f, side);
    let body = WALK_BODY[f], head = WALK_HEAD[f];
    if (this.crouch > 0) body = head = 2;
    // hands: held up toward the player, bobbing out of step; on an attack they
    // go up and back, then sweep forward and down
    const bob = f < 4 ? 1 : -1;
    let fx = 0, fy = bob, bx = 0, by = -bob;
    if (this.attack >= 0) {
      const t = this.attack;
      if (t < WINDUP) {
        const k = ease(t / WINDUP);
        fx = bx = -4 * k;
        fy = by = -6 * k;
        head = body = -1;
      } else if (t < WINDUP + SWIPE) {
        const k = ease((t - WINDUP) / SWIPE);
        fx = -4 + 11 * k;
        fy = -6 + 10 * k;
        const kb = ease(Math.max(0, (t - WINDUP - 0.04) / SWIPE));
        bx = -4 + 10 * kb;
        by = -6 + 9 * kb;
        if (this.T.smash) fy = by = -6 + 16 * k;
      } else {
        const k = ease((t - WINDUP - SWIPE) / RECOVER);
        fx = 7 * (1 - k);
        fy = 4 * (1 - k);
        bx = 6 * (1 - k);
        by = 3 * (1 - k);
      }
    }
    if (this.spitWind > 0) head = -1;
    return { legL, legR, body, head, hands: { fx, fy, bx, by } };
  }

  // ---------- drawing ----------

  // Local space: feet at the origin, facing +x (leapers rise off the ground).
  enter(ctx, x, y) {
    ctx.save();
    ctx.translate(this.facing < 0 ? x + 1 : x, y - Math.round(this.lift));
    if (this.facing < 0) ctx.scale(-1, 1);
  }

  draw(ctx, renderer) {
    if (this.deathType === 'explode') return;
    const x = renderer.snap(this.x), y = renderer.snap(this.y);
    if (this.dying >= 0) {
      // topple over: headless body, or just the legs once the torso is gone
      const k = Math.min(1, this.dying / DIE_TIME[this.deathType]);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((Math.PI / 2) * k * k * this.fallDir);
      ctx.translate(-x, -y);
      this.drawRig(ctx, x, y, { head: false, torso: this.deathType !== 'body', hands: false });
      ctx.restore();
      return;
    }
    if (this.rise > 0) ctx.globalAlpha = 1 - this.rise / 0.35;
    // a suicide bomber flashes white as the fuse runs down
    if (this.fuse >= 0 && Math.floor(this.fuse * 16) % 2) this.flash = 0.02;
    this.drawRig(ctx, x, y);
    ctx.globalAlpha = 1;
  }

  // On the floor, under everything standing (see main.js).
  drawShadow(ctx, renderer) {
    if (this.deathType === 'explode') return;
    ctx.drawImage(this.shadow, Math.round(renderer.snap(this.x) - this.shadow.width / 2), renderer.snap(this.y) - 3);
  }

  drawRig(ctx, x, y, show = { head: true, torso: true, hands: true }) {
    const a = this.art, p = this.pose(), white = this.flash > 0;
    const parts = white ? a.white : a;
    this.enter(ctx, x, y);
    const ox = -a.ox, oy = -a.H;
    if (a.back && show.torso) ctx.drawImage(a.back, ox, oy + p.body);
    ctx.drawImage(parts.legL, ox + p.legL[0], oy - p.legL[1]);
    ctx.drawImage(parts.legR, ox + p.legR[0], oy - p.legR[1]);
    if (show.torso) ctx.drawImage(parts.body, ox, oy + p.body);
    if (show.head) ctx.drawImage(parts.head, ox, oy + p.head);
    if (show.hands) {
      // two floating fists, always on top: one held close at the chest, one
      // reaching out at the player (that's the one that does the swiping)
      const h = p.hands, at = a.handAt, near = a.handNear, hw = a.hand.width, hh = a.hand.height;
      const nearX = Math.round(near.x + h.bx * 0.5 - hw / 2), nearY = Math.round(near.y + h.by * 0.5 + p.body - hh / 2);
      if (a.shield) {
        ctx.drawImage(a.shield, Math.round(at.x - 6 + h.fx * 0.3), oy + a.H - a.shield.height + 1 + p.body);
        ctx.drawImage(a.hand, nearX + 3, nearY);
      } else {
        ctx.drawImage(a.hand, nearX, nearY);
        ctx.drawImage(a.hand, Math.round(at.x + h.fx - hw / 2), Math.round(at.y + h.fy + p.body - hh / 2));
      }
    }
    ctx.restore();
  }

  // Glowing bits drawn after lighting: red eyes, the claw swipe, a bomb's blinking light.
  drawEmissive(ctx, renderer) {
    if (this.dying >= 0) return;
    const x = renderer.snap(this.x), y = renderer.snap(this.y), p = this.pose(), a = this.art;
    this.enter(ctx, x, y);
    ctx.globalAlpha = this.rise > 0 ? 1 - this.rise / 0.35 : 1;
    ctx.fillStyle = '#ff3b30';
    for (const [ex, ey] of a.eyes) ctx.fillRect(ex, ey + p.head, 1, 1);
    // claw streaks during the swipe
    const st = this.attack - WINDUP;
    if (this.attack >= 0 && st >= 0 && st < SWIPE + 0.06 && !this.T.smash) {
      const k = Math.min(1, st / SWIPE), at = a.handAt;
      ctx.globalAlpha = 1 - Math.max(0, (st - SWIPE) / 0.06);
      ctx.strokeStyle = '#f2e8e0';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(at.x - 6, at.y - 2 + i * 2, 9 + i, -1.1, -1.1 + 1.9 * k);
        ctx.stroke();
      }
    }
    if (this.stunT > 0) {
      // stars (flash) or sparks (shock) circling over the head
      const t = performance.now() / 1000, hy = a.headBox.top - 4 + p.head;
      ctx.fillStyle = this.stunKind === 'shock' ? '#9fd0ff' : '#ffe66a';
      for (let i = 0; i < 3; i++) {
        const ang = t * 6 + (i * Math.PI * 2) / 3;
        ctx.fillRect(Math.round(Math.cos(ang) * 6) - a.ox + a.W / 2, Math.round(hy + Math.sin(ang) * 2), 1, 1);
      }
    }
    if (this.T.bomb && Math.floor((this.fuse >= 0 ? this.fuse * 12 : performance.now() / 300)) % 2 === 0) {
      ctx.fillStyle = '#ff2d24';
      ctx.fillRect(-a.ox + a.W / 2 - 10, -a.H + 18 + p.body, 2, 2);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Leave what's left of the body on the floor for good.
  bakeCorpse(world) {
    const x = Math.round(this.x), y = Math.round(this.y), a = this.art;
    if (this.deathType === 'explode') {
      world.stain((w) => {
        w.fillStyle = 'rgba(70, 10, 10, 0.85)';
        for (let i = 0; i < 9; i++) {
          w.beginPath();
          w.ellipse(x + rand(-14, 14), y + rand(-7, 7), rand(3, 9), rand(2, 5), 0, 0, Math.PI * 2);
          w.fill();
        }
      }, x, y);
      return;
    }
    const [c, g] = makeCanvas(a.W + 16, a.H + 8);
    this.flash = 0;
    this.frame = 0;
    this.attack = -1;
    this.lift = 0;
    this.drawRig(g, a.W / 2 + 8, a.H + 4, { head: false, torso: this.deathType !== 'body', hands: false });
    world.stain((w) => {
      // blood pool, then the body lying on its side, darkened
      w.fillStyle = '#4f0c0c';
      w.beginPath();
      w.ellipse(x + this.fallDir * 6, y - 2, 13 * this.size.gore, 5 * this.size.gore, 0, 0, Math.PI * 2);
      w.fill();
      w.save();
      w.translate(x, y);
      w.rotate((Math.PI / 2) * this.fallDir);
      w.globalAlpha = 0.88;
      w.drawImage(c, -(a.W / 2 + 8), -(a.H + 4));
      w.restore();
    }, x, y);
  }
}
