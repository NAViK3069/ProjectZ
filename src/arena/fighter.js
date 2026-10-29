// A fighter, seen side on: you and the bots are the same thing, driven by
// different controls. Walks, sprints on stamina, jumps (and jumps again in
// the air), climbs ladders, drops through catwalks, dive-rolls, punches,
// throws grenades and shoots whatever gun it's picked up.
//
// It's the main game's character - the same head / body / legs, recoloured
// per fighter, animated the same way - and it holds its gun exactly like the
// main game's player does: the gun pivots at the chest, the trigger hand on
// the grip and the support hand under the handguard, the gun tipping up for
// a reload while the off hand fetches a fresh mag from the belt (or feeds
// shells, works the pump / bolt, breaks the action open...).

import { makeCanvas } from '../engine/pixel.js';
import { ORIGIN_X, ORIGIN_Y, WALK_BODY, WALK_HEAD, STEP_FRAMES, walkLegs } from '../entities/rig.js';
import { HANDS, part, GUN_PAL, artW, artH } from '../combat/gunart.js';
import { Weapon, RELOAD_EVENTS, SHELL_IN } from '../combat/weapons.js';
import { MeleeWeapon, FISTS, WIND, STRIKE } from '../combat/melee.js';
import { T, SOLID, PLAT, LADDER, ACID } from './level.js';

// movement
const GRAVITY = 720, MAX_FALL = 430, WALK = 86, SPRINT = 1.5, ACCEL = 950, DECEL = 1250, AIR_ACCEL = 650;
const JUMP = 290, JUMP2 = 250, CLIMB = 75, COYOTE = 0.09, BUFFER = 0.12;
export const MAX_STAMINA = 100;
const STAMINA_DRAIN = 30, STAMINA_REGEN = 24, STAMINA_DELAY = 0.7;
// the main game's dodge roll
const ROLL_TIME = 0.4, ROLL_SPEED = 250, ROLL_COST = 20, ROLL_COOLDOWN = 0.2, ROLL_SAFE = 0.8;
// health / damage
export const MAX_HP = 300;
export const DAMAGE = 0.45;    // guns hit for this much of their main-game damage
const HEAD_MUL = 1.3;
// body
const HALF_W = 5, HEIGHT = 28, ROLL_H = 14;
// the main game's gun handling
const GUN_HEIGHT = 9, GUN_REACH = 4, RELOAD_TILT = 0.55, SHELL_TILT = -0.4, RAISE_TILT = -1.1, STEP_TILT = -0.3, CLIMB_KEEP = 0.35;
const WALK_FPS = 16, IDLE_PERIOD = 1.5, SETTLE_TIME = 0.1;
const BELT = { x: -2, y: -5 };
const RELOAD_PATH = [
  [0, 'rest'], [0.12, 'well'], [0.18, 'well'], [0.38, 'belt'], [0.45, 'belt'],
  [0.6, 'well'], [0.68, 'wellUp'], [0.8, 'handle'], [RELOAD_EVENTS.rack, 'handleBack'], [1, 'rest'],
];
const SHELL_PATH = [[0, 'well'], [0.3, 'belt'], [0.42, 'belt'], [0.72, 'well'], [SHELL_IN, 'wellUp'], [1, 'well']];
const FIRST_SHELL_PATH = [[0, 'rest'], ...SHELL_PATH.slice(1)];
const NO_RACK_PATH = [...RELOAD_PATH.slice(0, 7), [1, 'rest']];
const HELD = {
  shell: part(['yrrr', 'yRRr'], GUN_PAL),
  round: part(['yyyW'], GUN_PAL),
  loader: part(['.yyy.', 'yhyhy', '.yyy.'], GUN_PAL),
};
const EYES_X = [15, 20], SKIN = 'rgb(249, 226, 219)', LID = 'rgb(24, 22, 22)';

// bare fists here are quicker than in the main game: a brawler's jab, barely a breath between punches
const ARENA_FISTS = { ...FISTS, time: 0.24, jabRest: 0.03, hookRest: 0.15 };
const STANCE_HEIGHT = 5;   // a melee weapon at rest is held lower, at the waist
// Bare-hand guard (body-local, facing right): right fist forward at chest
// height, left a little lower and back.
const FIST_GUARD = { R: { x: 6, y: -11 }, L: { x: -2, y: -8 } };
const lerpPt = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

// The thrust effect's 3 frames: rows across the thrust (keyed by v, px off its
// line), each a list of [from, to, colour] bars along it (0 = back, 1 = tip).
const TW = '#f4fbff', TC = '#a8e6fb', TB = '#6cd0f2';
const THRUST_FRAMES = [
  // big: an arrowhead swept back into two arms, with a notch in its tail
  Object.fromEntries([[-3, 0.02, 0.38, 2], [-2, 0.18, 0.62, 0.42], [-1, 0.35, 0.88, 0.5], [0, 0.56, 1, 0.62],
    [1, 0.3, 0.9, 0.48], [2, 0.12, 0.66, 0.44], [3, 0, 0.42, 2]].map(([v, back, tip, white]) =>
    [v, [[white, tip, TW], [back, white, Math.abs(v) >= 3 ? TB : TC]]])),
  // medium: a stack of offset bars, white in the middle, cyan outside
  { [-2]: [[0.22, 0.6, TC]], [-1]: [[0.4, 0.88, TW], [0.12, 0.4, TC]], 0: [[0.2, 1, TW], [0, 0.2, TC]], 1: [[0.28, 0.78, TW], [0.18, 0.28, TC]], 2: [[0.3, 0.62, TC]] },
  // small: a thin bar stepping down, and a stray pixel left behind
  { 0: [[0.34, 1, TW]], 1: [[0.34, 0.74, TW], [0.04, 0.09, TW]] },
];
const smooth = (t) => t * t * (3 - 2 * t);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function reloadPose(from, to, k) {
  if (from === 'rest' && to === 'rest') return 'support';
  if (to === 'barrel') return k > 0.6 ? 'support' : 'open';
  if (from === 'barrel') return to === 'barrel' ? 'support' : k > 0.9 ? 'support' : 'open';
  if (to === 'handle') return k > 0.7 ? 'grab' : 'open';
  if (from === 'handle') return 'grab';
  if (from === 'handleBack') return k < 0.25 ? 'grab' : k > 0.9 ? 'support' : 'open';
  if (to === 'rest') return k > 0.9 ? 'support' : 'open';
  if (from === 'rest') return k < 0.15 ? 'support' : 'open';
  return 'open';
}

// Draw hand `name` with its anchor pixel on (x, y) of the current transform (as the main game does).
function drawHand(ctx, name, x, y) {
  const h = HANDS[name];
  ctx.drawImage(h.img, x - h.at.x - 1, y - h.at.y - 1);
}

// Recolour the character art: shirt and hair shift hue. Also a blinking head
// and white copies of everything for the hit flash.
const PARTS = ['head', 'body', 'legL', 'legR', 'backHead', 'backBody', 'backLegL', 'backLegR'];
function tinted(images, hue, sat = 1) {
  const out = {};
  for (const k of PARTS) {
    if (!images[k]) continue;
    const [c, g] = makeCanvas(images[k].width, images[k].height);
    g.filter = hue ? `hue-rotate(${hue}deg) saturate(${sat})` : 'none';
    g.drawImage(images[k], 0, 0);
    out[k] = c;
  }
  const [b, bg] = makeCanvas(32, 32);
  bg.drawImage(out.head, 0, 0);
  for (const ex of EYES_X) {
    bg.fillStyle = SKIN;
    bg.fillRect(ex, 14, 2, 3);
    bg.fillStyle = LID;
    bg.fillRect(ex, 15, 2, 1);
  }
  out.headBlink = b;
  for (const k of PARTS) {
    if (!out[k]) continue;
    const [w, wg] = makeCanvas(32, 32);
    wg.drawImage(out[k], 0, 0);
    wg.globalCompositeOperation = 'source-atop';
    wg.fillStyle = '#ffffff';
    wg.fillRect(0, 0, 32, 32);
    out[k + 'W'] = w;
  }
  out.headBlinkW = out.headW;
  return out;
}

export class Fighter {
  // opts: { name, color, hue, sat, bot }
  constructor(game, images, opts) {
    this.game = game;
    Object.assign(this, opts);
    this.parts = tinted(images, opts.hue ?? 0, opts.sat ?? 1);
    this.wins = 0;
    this.kills = 0;
    this.reset(0, 0);
  }

  reset(x, y) {
    Object.assign(this, {
      x, y, vx: 0, vy: 0, facing: 1, aim: 0, aimTarget: null, hp: MAX_HP, alive: true,
      stamina: MAX_STAMINA, staminaRest: 0, sprinting: false, rollCool: 0,
      onGround: false, onLadder: false, coyote: 0, jumpBuf: 0, airJumps: 1, dropT: 0,
      roll: null, flash: 0, hurtT: 9, animT: 0, frame: 0, climbT: 0,
      state: 'idle', settle: 0, pose: { legL: [0, 0], legR: [0, 0], body: 0, head: 0, headX: 0 },
      blinkIn: 1 + Math.random() * 3, blinkLeft: 0, tilt: 0, triggerHeld: false,
      weapon: null, reserve: 0, grenades: 1, grenadeCD: 0, killer: null, deadT: 0, corpse: null, lastFireT: 9,
      // the three slots: 1 melee (bare fists to start), 2 the gun, 3 grenades
      slot: 2, melee: new MeleeWeapon(ARENA_FISTS), slashes: [], nade: 'frag', quick: null, throwT: -1, airRoll: true,
    });
    const L = this.game.loadout?.() ?? { gun: 'm9', ammo: 36, grenades: 1, hp: MAX_HP };
    this.maxHp = this.hp = L.hp;
    this.grenades = L.grenades;
    if (L.gun) this.give(L.gun, L.ammo);
    this.slot = this.weapon ? 2 : 1;
  }

  // What's in hand: the melee weapon (slot 1), the gun (slot 2), or nothing (slot 3: a grenade).
  get held() {
    return this.slot === 1 ? this.melee : this.slot === 2 ? this.weapon : null;
  }
  get meleeOut() {
    return this.slot === 1;
  }
  aimOrigin() {
    return { x: this.x, y: this.y - GUN_HEIGHT };
  }

  // Take out slot n (1 melee, 2 gun, 3 grenades); the gun goes on the back.
  select(n) {
    if (n === this.slot || (n === 2 && !this.weapon) || (n === 3 && this.grenades <= 0)) return false;
    if (this.weapon?.reloading) this.weapon.cancelReload();
    this.slot = n;
    this.quick = null;
    this.settle = SETTLE_TIME;
    const h = this.held;
    if (h) h.drawT = 0.25;
    if (n === 2) this.tilt = RAISE_TILT;
    return true;
  }
  // Pick up / swap a melee weapon (def) into slot 1; returns the one it replaced (not fists).
  giveMelee(def) {
    const old = this.melee.def.fists ? null : this.melee;
    this.melee = new MeleeWeapon(def);
    this.melee.drawT = 0.25;
    return old;
  }
  // Knocked out of the hands (or dropped): the gun leaves slot 2.
  dropGun() {
    const w = this.weapon;
    this.weapon = null;
    if (this.slot === 2) this.slot = 1;
    return w;
  }

  get h() {
    return this.roll ? ROLL_H : HEIGHT;
  }
  get box() {
    return { l: this.x - HALF_W, r: this.x + HALF_W, t: this.y - this.h, b: this.y };
  }
  // What a bullet at (x, y) hits: the big head, the body, or nothing (rolling: just the ball).
  hitPart(x, y) {
    const dx = (x - this.x) * this.facing;
    if (this.roll) return Math.abs(dx) <= 7 && y > this.y - ROLL_H && y <= this.y ? 'body' : null;
    if (dx >= -10 && dx <= 9 && y >= this.y - 31 && y < this.y - 14) return 'head';
    if (Math.abs(dx) <= 6 && y >= this.y - 14 && y <= this.y) return 'body';
    return null;
  }
  // the middle of the body (for aiming at)
  get center() {
    return { x: this.x, y: this.y - (this.roll ? 7 : 12) };
  }

  // ---------- weapons ----------

  give(key, ammo) {
    const def = this.game.weapons[key];
    if (!def) return;
    this.weapon = new Weapon(def);
    this.slot = 2;
    this.reserve = ammo;
    this.tilt = RAISE_TILT;
    const self = this;
    this.weapon.ammoSource = {
      count: () => self.reserve,
      take: (c, n) => { const t = Math.min(n, self.reserve); self.reserve -= t; return t; },
      give: (c, n) => { self.reserve += n; },
    };
  }

  // The gun's pivot (chest height, a pixel ahead of the body) - where shots are traced from.
  get shoulder() {
    return { x: this.x + this.facing, y: this.y - GUN_HEIGHT + this.pose.body };
  }

  gunPose() {
    const w = this.held;
    // a melee weapon sits in its stance facing the way you face, and only
    // swings round to the aim while it attacks (engage)
    const front = this.facing > 0 ? 0 : Math.PI, stance = this.meleeOut;
    const base = stance ? front + wrapAngle(this.aim - front) * w.engage : this.zeroAim();
    const a = base - (w.climb + this.tilt) * this.facing;
    const reach = GUN_REACH - w.recoil - (w.reloading ? 1 : 0);
    const rest = w.def.restHeight ?? STANCE_HEIGHT;
    const h = stance ? rest + (GUN_HEIGHT - rest) * w.engage : GUN_HEIGHT;
    const px = this.x + this.facing, py = this.y - h + this.pose.body;
    const flip = this.facing * (stance && w.flipped ? -1 : 1);   // turned over for an upward swing
    return { x: px + Math.cos(a) * reach, y: py + Math.sin(a) * reach, a, base, flip };
  }
  enterGun(ctx, g, x = g.x, y = g.y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(g.a);
    ctx.scale(1, g.flip);
  }
  gunPoint(g, pt) {
    const grip = this.held.art.points.grip;
    const lx = pt.x - grip.x, ly = (pt.y - grip.y) * g.flip, c = Math.cos(g.a), s = Math.sin(g.a);
    return { x: g.x + lx * c - ly * s, y: g.y + lx * s + ly * c };
  }
  gunDir(g, dx, dy) {
    const ly = dy * g.flip, c = Math.cos(g.a), s = Math.sin(g.a);
    return { x: dx * c - ly * s, y: dx * s + ly * c };
  }
  bodyPoint(x, y, pt) {
    return { x: x + (this.facing < 0 ? 1 - pt.x : pt.x), y: y + pt.y + this.pose.body };
  }
  get handlePoint() {
    const art = this.weapon.art;
    return art.points.handle ?? art.points.support;   // (worked out in gunart.js)
  }
  breakPoint(pt) {
    const w = this.weapon, h = w.art.hinge, a = w.openAngle;
    if (!h || !a) return pt;
    const dx = pt.x - h.x, dy = pt.y - h.y, c = Math.cos(a), s = Math.sin(a);
    return { x: h.x + dx * c - dy * s, y: h.y + dx * s + dy * c };
  }

  // Converge the barrel on the point aimed at, unless it's right by the gun.
  zeroWeight() {
    const t = this.aimTarget, w = this.weapon;
    if (!t || !w) return 0;
    const o = this.shoulder, d = Math.hypot(t.x - o.x, t.y - o.y);
    const near = GUN_REACH + (w.muzzle.x - w.art.points.grip.x) + 16;
    const k = Math.max(0, Math.min(1, (d - near) / 48));
    return k * k * (3 - 2 * k);
  }
  zeroAim() {
    const t = this.aimTarget, w = this.weapon, k = this.zeroWeight();
    if (!t || !w || k <= 0) return this.aim;
    const L = (w.muzzle.y - w.art.points.grip.y) * this.facing;
    const reach = GUN_REACH - w.recoil - (w.reloading ? 1 : 0);
    const px = this.x + this.facing, py = this.y - GUN_HEIGHT + this.pose.body;
    let a = this.aim;
    for (let i = 0; i < 2; i++) {
      const dx = t.x - (px + Math.cos(a) * reach), dy = t.y - (py + Math.sin(a) * reach), D = Math.hypot(dx, dy);
      if (D <= Math.abs(L) + 1) return this.aim;
      a = Math.atan2(dy, dx) - Math.asin(L / D);
    }
    return this.aim + wrapAngle(a - this.aim) * k;
  }
  shotDir(g, m) {
    const t = this.aimTarget, k = this.zeroWeight();
    if (!t || k <= 0) return g.a;
    let a = Math.atan2(t.y - m.y, t.x - m.x);
    if (Math.cos(a - g.a) <= 0.6) return g.a;
    a += (g.a - g.base) * CLIMB_KEEP;
    return g.a + wrapAngle(a - g.a) * k;
  }

  // ---------- each frame ----------

  // c: { move (-1..1), up, down, jump (pressed), jumpHeld, sprint, fire, aim, target, reload, roll, melee, grenade }
  update(dt, c) {
    const L = this.game.level;
    this.flash -= dt;
    this.hurtT += dt;
    this.grenadeCD -= dt;
    this.lastFireT += dt;
    this.rollCool -= dt;
    if (!this.alive) return this.updateCorpse(dt);

    if (c.aim !== null && c.aim !== undefined) this.aim = c.aim;
    this.aimTarget = c.target ?? null;
    if (!this.roll) {
      const cs = Math.cos(this.aim), f = cs > 0.15 ? 1 : cs < -0.15 ? -1 : this.facing;
      if (f !== this.facing) { this.facing = f; this.settle = SETTLE_TIME; }
    }

    // sprint burns stamina; it comes back after a short rest
    this.sprinting = !!c.sprint && !!c.move && this.stamina > 0 && !this.onLadder && !this.roll;
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN * dt);
      this.staminaRest = STAMINA_DELAY;
    } else if ((this.staminaRest -= dt) <= 0) this.stamina = Math.min(MAX_STAMINA, this.stamina + STAMINA_REGEN * dt);

    this.coyote = this.onGround ? COYOTE : this.coyote - dt;
    this.jumpBuf = c.jump ? BUFFER : this.jumpBuf - dt;
    this.dropT -= dt;

    // ladders: grab one by pushing up / down in front of it
    const ladderHere = this.overLadder();
    if (!this.onLadder && ladderHere && (c.up || (c.down && !this.onGround) || (c.down && this.ladderBelow())) && !this.roll) {
      this.onLadder = true;
      this.x += (ladderHere.x - this.x) * 0.6;
      this.vx = 0;
    }
    if (this.onLadder && (!ladderHere || this.jumpBuf > 0)) {
      this.onLadder = false;
      if (this.jumpBuf > 0) { this.vy = -JUMP * 0.8; this.jumpBuf = 0; }
    }

    // dive roll (costs stamina)
    if (c.roll && !this.roll && (this.onGround || this.airRoll) && !this.onLadder && this.rollCool <= 0 && this.stamina >= ROLL_COST) {
      const dir = c.move ? Math.sign(c.move) : this.facing;
      if (!this.onGround) this.airRoll = false;   // one roll per jump
      this.roll = { t: 0, dir, spin: dir, trail: [] };
      this.stamina -= ROLL_COST;
      this.staminaRest = STAMINA_DELAY;
      this.quick = null;
      if (this.onGround) this.game.fx.dust(this.x - this.roll.dir * 4, this.y, 6);
      else this.game.fx.puff(this.x, this.y - 8);
    }
    if (this.roll) {
      this.roll.t += dt / ROLL_TIME;
      this.vx = this.roll.dir * ROLL_SPEED * (1 - 0.6 * this.roll.t);
      this.roll.trail.unshift({ x: this.x, y: this.y, t: this.roll.t });   // where it's been, for the afterimages
      this.roll.trail.length = Math.min(this.roll.trail.length, 10);
      if (this.roll.t >= 1) {
        if (this.room(HEIGHT)) {
          this.roll = null;
          this.rollCool = ROLL_COOLDOWN;
          this.settle = SETTLE_TIME;
          this.game.fx.dust(this.x, this.y, 4);
        } else this.roll.t = 0.95;   // stand back up only where there's room
      }
    } else if (this.onLadder) {
      this.vy = (c.up ? -CLIMB : 0) + (c.down ? CLIMB : 0);
      this.vx = c.move * 48;
      this.climbT += Math.abs(this.vy) * dt;
    } else {
      const top = WALK * (this.sprinting ? SPRINT : 1) * (this.meleeOut && this.melee.t >= 0 ? 0.55 : 1) * (this.held?.def.speedMul ?? 1);
      const want = c.move * top, d = want - this.vx;
      const a = (this.onGround ? (c.move ? ACCEL : DECEL) : AIR_ACCEL) * dt;
      this.vx += Math.max(-a, Math.min(a, d));
      if (this.jumpBuf > 0 && this.coyote > 0) {
        this.vy = -JUMP;
        this.jumpBuf = 0;
        this.coyote = 0;
        this.game.fx.dust(this.x, this.y, 4);
      } else if (this.jumpBuf > 0 && this.airJumps > 0 && !this.onGround) {
        this.vy = -JUMP2;
        this.jumpBuf = 0;
        this.airJumps--;
        this.game.fx.puff(this.x, this.y - 2);
      }
      if (!c.jumpHeld && this.vy < -110) this.vy += 1200 * dt;   // let go early: a shorter hop
      if (c.down && this.onGround && this.standingOnPlat()) this.dropT = 0.22;
    }
    if (!this.onLadder) this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);

    const wasGround = this.onGround, fall = this.vy;
    this.move(dt);
    // climbed down to the floor (or walking off along it): off the ladder
    if (this.onLadder && (c.down || (c.move && !c.up)) && this.hits(this.x - HALF_W, this.y, this.x + HALF_W, this.y + 1)) {
      this.onLadder = false;
      this.onGround = true;
    }
    if (this.onGround && !wasGround) {
      this.settle = SETTLE_TIME;
      if (fall > 250) this.game.fx.dust(this.x, this.y, 5);
    }
    if (this.onGround) { this.airJumps = 1; this.airRoll = true; }
    if (L.get(Math.floor(this.x / T), Math.floor((this.y - 2) / T)) === ACID) this.die(null, 'MELTED', 0, -1);

    this.updateCombat(dt, c);
    this.animate(dt);
    if (this.blinkLeft > 0) this.blinkLeft -= dt;
    else if ((this.blinkIn -= dt) <= 0) {
      this.blinkLeft = 0.12;
      this.blinkIn = Math.random() < 0.2 ? 0.22 : 2.2 + Math.random() * 3;
    }
  }

  updateCombat(dt, c) {
    // switching slots (1 / 2 / 3, or the wheel)
    if (c.slot) this.select(c.slot);
    if (c.cycle) for (let i = 1; i <= 3; i++) if (this.select(((this.slot - 1 + c.cycle * i + 9) % 3) + 1)) break;
    if (this.slot === 2 && !this.weapon) this.slot = 1;
    if (this.slot === 3 && this.grenades <= 0 && this.throwT < 0) this.select(this.weapon ? 2 : 1) || (this.slot = 1);
    const busy = this.onLadder || this.roll;

    // a quick melee (F / right click) from the gun or grenade: out with it, hit, back
    if (c.melee && !this.meleeOut && !busy) {
      this.quick = this.slot;
      this.slot = 1;
      this.melee.drawT = 0;
      this.melee.engage = 1;
    }
    for (const sl of this.slashes) sl.t += dt;
    this.slashes = this.slashes.filter((sl) => sl.t < sl.life);

    if (this.slot === 1) {
      const m = this.melee;
      if ((c.fire || c.melee) && !busy) m.attack();
      m.update(dt);
      this.tilt += (m.raising * RAISE_TILT - this.tilt) * Math.min(1, dt * 16);
      if (m.events.includes('strike')) this.strike(m);
      if (m.striking && (m.def.style !== 'saw' || m.events.includes('tick'))) this.game.meleeHit(this, m);
      // a quick hit done: back to what was out
      if (this.quick && m.t < 0) {
        const back = this.quick;
        this.quick = null;
        this.select(back);
      }
    } else if (this.slot === 2) {
      const w = this.weapon;
      if (c.reload) w.startReload();
      w.update(dt);
      for (const e of w.events) this.reloadEvent(e);
      // the main game's tilts: muzzle up mid-reload, down feeding shells, up from the floor when drawn
      let tilt = !w.reloading ? 0
        : w.def.reload === 'shells' ? SHELL_TILT
        : w.def.reload === 'steps' ? (w.openAngle / w.def.openAngle) * STEP_TILT
        : Math.sin(Math.PI * Math.min(1, w.reload * 1.15)) * RELOAD_TILT;
      tilt += w.raising * RAISE_TILT;
      this.tilt += (tilt - this.tilt) * Math.min(1, dt * 16);
      const pull = !busy && ((c.fire && ((w.def.auto && !w.def.burst) || !this.triggerHeld)) || w.burstLeft > 0);
      if (pull) {
        const pre = this.gunPose();
        const r = w.tryFire();
        if (r === 'fired') this.shoot(pre);
        else if (r === 'empty' && this.reserve <= 0 && !w.reloading && w.ammo <= 0) {
          this.game.fx.thrownGun(this, w);   // out of everything: throw it away
          this.dropGun();
        }
      }
    } else if (this.slot === 3 && c.fire && !this.triggerHeld && !busy) this.throwNade();
    this.triggerHeld = !!c.fire;
    // G throws one whatever is out
    if (c.grenade && !busy) this.throwNade();
    if (this.throwT >= 0) {
      this.throwT += dt / 0.35;
      if (this.throwT >= 1) this.throwT = -1;
    }
  }

  // A grenade out of the hand, thrown along the aim.
  throwNade() {
    if (this.grenades <= 0 || this.grenadeCD > 0) return;
    this.grenades--;
    this.grenadeCD = 0.6;
    this.throwT = 0;
    const s = this.shoulder;
    this.game.throwGrenade(this, s.x, s.y - 4, Math.cos(this.aim) * 290 + this.vx * 0.4, Math.sin(this.aim) * 290 - 110, this.nade);
  }

  // A hit goes out: leave its effect - a crescent for a
  // slash, a long streak for a thrust, a little burst for a punch.
  strike(m) {
    const a = this.aim;   // no step forward: every melee attack stands its ground
    const time = m.def.time * (m.move === 'slash' ? 1 : 0.85);
    this.slashes.push({
      kind: m.move, a, dir: m.side * this.facing, arc: m.arc, r: m.reach + 5, t: 0,
      // a slash: 3 frames of 0.07 s after the swing; a thrust: 3 frames of 0.06 s
      grow: time * 0.22, life: m.move === 'slash' ? time * 0.22 + 0.21 : m.move === 'thrust' ? 0.18 : 0.16,
      // a punch: its path (for the swoosh) relative to the aim origin, then a
      // 3-frame impact burst where it lands; the combo's last hit (a hook) is bigger
      path: m.move === 'jab' ? this.punchPath(this.x, this.y, m, true) : null,
      hook: m.move === 'jab' && m.step === 2,
    });
    if (m.move === 'jab') this.slashes.at(-1).life = time * 0.22 + 0.15;
  }

  // A punch, in world space (or relative to the aim origin): the guard it starts
  // from, where it's cocked back to, the bend it travels round and where it lands.
  // Jab and cross go almost straight; the hook swings wide round the side.
  punchPath(x, y, m, local = false) {
    const g = this.bodyPoint(x, y, FIST_GUARD[m.hand]), ox = x, oy = y - GUN_HEIGHT;
    const dx = Math.cos(this.aim), dy = Math.sin(this.aim);
    // a straight punch bows out a touch to its hand's side; the hook comes
    // over the top, swung round from above
    const hook = m.step === 2, side = hook ? -this.facing : (m.hand === 'R' ? 1 : -1) * this.facing;
    const px = -dy * side, py = dx * side;
    const reach = hook ? 17 : m.step === 1 ? 20 : 18;
    const e = { x: ox + dx * reach, y: oy + dy * reach };
    const b = hook ? { x: g.x - dx * 4 + px * 5, y: g.y - dy * 4 + py * 5 } : { x: g.x - dx * 4, y: g.y - dy * 4 };
    const bend = hook ? 10 : 2;
    const c = { x: (b.x + e.x) / 2 + px * bend, y: (b.y + e.y) / 2 + py * bend };
    if (!local) return { g, b, c, e };
    const rel = (p) => ({ x: p.x - ox, y: p.y - oy });
    return { g: rel(g), b: rel(b), c: rel(c), e: rel(e) };
  }

  // Where a fist is now: in its guard, or partway through a punch (cock back,
  // whip round the curve into the hit, hold a beat, then back to the guard).
  // The other hand tucks in to cover while one punches.
  fistPoint(x, y, hand) {
    const m = this.melee, g = this.bodyPoint(x, y, FIST_GUARD[hand]);
    if (m.t < 0) return g;
    const dx = Math.cos(this.aim), dy = Math.sin(this.aim);
    if (hand !== m.hand) return { x: g.x - dx, y: g.y - dy + 1 };
    const { b, c, e } = this.punchPath(x, y, m), t = m.t;
    if (t < WIND) return lerpPt(g, b, smooth(t / WIND));
    if (t < STRIKE) {
      const k = Math.pow((t - WIND) / (STRIKE - WIND), 0.7), j = 1 - k;   // snaps out, fastest at the hit
      return { x: j * j * b.x + 2 * j * k * c.x + k * k * e.x, y: j * j * b.y + 2 * j * k * c.y + k * k * e.y };
    }
    return lerpPt(e, g, smooth(Math.max(0, (t - STRIKE - 0.1) / (0.9 - STRIKE))));
  }

  // Same as the main game: pellets fan out evenly, single shots wobble by the gun's spread.
  shoot(g) {
    const w = this.weapon, d = w.def, m = this.gunPoint(g, w.muzzle);
    const pellets = d.pellets ?? 1, dir = this.shotDir(g, m);
    const air = this.onGround ? 1 : 1.5;
    for (let i = 0; i < pellets; i++) {
      const spread = pellets > 1 ? ((i / (pellets - 1)) * 2 - 1 + (Math.random() - 0.5) * 0.4) * w.spread : (Math.random() * 2 - 1) * w.spread * air;
      const speed = d.bulletSpeed * (pellets > 1 ? 0.85 + Math.random() * 0.3 : 1);
      this.game.fireBullet(this, m.x, m.y, dir + spread, speed, w.damage * DAMAGE * (this.game.gunDamage ?? 1), d.range ?? 520, d.pierce ?? 0);
    }
    if (!d.action && !d.keepsShells) this.ejectShell(g);
    this.lastFireT = 0;
    // a shove from the heavy ones, mostly felt in the air
    const kick = Math.min(110, w.damage * DAMAGE * pellets * 0.7) * (this.onGround ? 0.25 : 0.8);
    this.vx -= Math.cos(g.a) * kick;
    if (!this.onGround) this.vy -= Math.sin(g.a) * kick * 0.4;
    this.game.muzzle(m.x, m.y, g.a, w, this);
  }

  ejectShell(g) {
    const w = this.weapon, p = this.gunPoint(g, w.art.points.port), dir = this.gunDir(g, -0.35 - Math.random() * 0.3, -1);
    this.game.fx.casing(p, dir, w.art.shell);
  }

  reloadEvent(name) {
    const w = this.weapon, g = this.gunPose();
    if (name === 'eject') this.ejectShell(g);
    else if (name === 'dump') {
      const p = this.gunPoint(g, this.breakPoint(w.art.points.breech)), n = Math.min(8, w.spentIn ?? 0);
      for (let i = 0; i < n; i++) this.game.fx.casing(p, w.art.revolver ? this.gunDir(g, -0.3 + Math.random() * 0.3, 0.6) : this.gunDir(g, -1, -0.8 - Math.random() * 0.4), w.art.shell, 0.6);
      w.spentIn = 0;
    } else if (name === 'load' || name === 'loadAll') w.recoil = 0.8;
    else if (name === 'close') { w.recoil = 1.5; w.climb = 0.12; }
    else if (name === 'shellIn' || name === 'action') w.recoil = 1;
    else if (name === 'magOut') {
      const p = this.gunPoint(g, w.art.points.magwell), img = w.magImg;
      if (img) this.game.fx.dropMag(img.img ?? img, p.x, p.y + 2, this.facing);
    } else if (name === 'magIn') w.recoil = 1.5;
    else if (name === 'rack') { w.recoil = 2; w.climb = -0.15; }
  }

  // Where the loading hand is during a reload, what it holds - as the main game.
  reloadHand(g) {
    const w = this.weapon, d = w.def, t = w.reload, pts = w.art.points, hp = this.handlePoint;
    const port = d.loadFrom === 'top' ? { x: pts.port.x, y: pts.port.y + 1 } : pts.magwell;
    const points = {
      rest: this.gunPoint(g, d.loadFrom === 'top' ? pts.grip : pts.support),
      well: this.gunPoint(g, d.loadFrom === 'top' ? { x: port.x, y: port.y - 5 } : { x: port.x, y: port.y + 3 }),
      wellUp: this.gunPoint(g, port),
      belt: this.bodyPoint(this.x, this.y, BELT),
      handle: this.gunPoint(g, hp),
      handleBack: this.gunPoint(g, { x: hp.x - 3, y: hp.y }),
    };
    if (pts.breech) {
      const h = w.art.hinge;
      points.breech = this.gunPoint(g, this.breakPoint(pts.breech));
      points.barrel = this.gunPoint(g, this.breakPoint({ x: h.x + 5, y: h.y - 2 }));
    }
    const shells = d.reload === 'shells', steps = d.reload === 'steps';
    const path = steps ? d.handPath : shells ? (w.cycle === 0 ? FIRST_SHELL_PATH : SHELL_PATH) : d.noRack ? NO_RACK_PATH : RELOAD_PATH;
    let i = 0;
    while (i < path.length - 2 && t > path[i + 1][0]) i++;
    const [t0, k0] = path[i], [t1, k1] = path[i + 1];
    const k = smooth(Math.min(1, Math.max(0, (t - t0) / (t1 - t0))));
    const a = points[k0] ?? points.rest, b = points[k1] ?? points.rest;
    let holding = null;
    if (steps) holding = HELD[d.holding.find(([from, to]) => t > from && t < to)?.[2]] ?? null;
    else if (shells) holding = t > 0.36 && t < SHELL_IN ? (d.cls === 'shotgun' ? HELD.shell : HELD.round).img : null;
    else holding = t > 0.38 && t < 0.58 ? w.magImg : null;
    if (holding && !(holding instanceof HTMLCanvasElement)) holding = holding.img;
    const under = !!holding && (k1 === 'wellUp' || k1 === 'breech') && k > 0.45;
    let pose = reloadPose(k0, k1, k);
    if (d.loadFrom === 'top' && pose === 'support') pose = 'trigger';
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, holding, under, pose, trigger: d.loadFrom === 'top' };
  }

  // ---------- movement against the level ----------

  hits(l, t, r, b) {
    const L = this.game.level;
    for (let cy = Math.floor(t / T); cy <= Math.floor((b - 0.01) / T); cy++)
      for (let cx = Math.floor(l / T); cx <= Math.floor((r - 0.01) / T); cx++) if (L.get(cx, cy) === SOLID) return { l: cx * T, t: cy * T, r: cx * T + T, b: cy * T + T };
    for (const p of this.game.props) if (p.solid && l < p.box.r && r > p.box.l && t < p.box.b && b > p.box.t) return p.box;
    return null;
  }

  room(h) {
    return !this.hits(this.x - HALF_W, this.y - h, this.x + HALF_W, this.y);
  }

  move(dt) {
    const dx = this.vx * dt;
    if (dx) {
      const nx = this.x + dx, b = this.box, hit = this.hits(nx - HALF_W, b.t, nx + HALF_W, b.b - 0.5);
      if (hit) {
        // a step of a few pixels (a curb, a lip) is walked up, not a wall
        const step = (this.onGround || this.onLadder) && b.b - hit.t <= (this.onLadder ? 8 : 5) && !this.hits(nx - HALF_W, hit.t - this.h, nx + HALF_W, hit.t);
        if (step) { this.x = nx; this.y = hit.t; }
        else { this.x = dx > 0 ? hit.l - HALF_W - 0.01 : hit.r + HALF_W + 0.01; this.vx = 0; }
      } else this.x = nx;
    }
    const dy = this.vy * dt, oldB = this.y;
    this.onGround = false;
    if (dy) {
      const ny = this.y + dy, h = this.h, hit = this.hits(this.x - HALF_W, ny - h, this.x + HALF_W, ny);
      if (hit) {
        if (dy > 0) { this.y = hit.t; this.onGround = true; }
        else this.y = hit.b + h + 0.01;
        this.vy = 0;
      } else {
        this.y = ny;
        if (dy > 0 && this.dropT <= 0 && !this.onLadder) {
          const top = this.platTop(oldB, ny);
          if (top !== null) { this.y = top; this.vy = 0; this.onGround = true; }
        }
      }
    } else {
      this.onGround = !!this.hits(this.x - HALF_W, this.y, this.x + HALF_W, this.y + 1) || (this.dropT <= 0 && !this.onLadder && this.platTop(this.y - 0.5, this.y + 1) !== null);
    }
    if (this.onLadder) this.onGround = false;
  }

  platTop(y0, y1) {
    const L = this.game.level;
    for (let cy = Math.floor(y0 / T); cy <= Math.floor(y1 / T); cy++) {
      const top = cy * T;
      if (top < y0 - 0.5 || top > y1) continue;
      for (const cx of [Math.floor((this.x - HALF_W + 1) / T), Math.floor((this.x + HALF_W - 1) / T)]) {
        const v = L.get(cx, cy);
        if (v === PLAT || (v === LADDER && L.get(cx, cy - 1) !== LADDER)) return top;
      }
    }
    return null;
  }

  standingOnPlat() {
    const L = this.game.level, v = L.get(Math.floor(this.x / T), Math.floor((this.y + 1) / T));
    return v === PLAT || v === LADDER;
  }

  overLadder() {
    const L = this.game.level, cx = Math.floor(this.x / T);
    for (const y of [this.y - 2, this.y - 12]) if (L.get(cx, Math.floor(y / T)) === LADDER) return { x: (cx + 0.5) * T };
    if (this.ladderBelow()) return { x: (cx + 0.5) * T };
    return null;
  }
  ladderBelow() {
    return this.game.level.get(Math.floor(this.x / T), Math.floor((this.y + 2) / T)) === LADDER;
  }

  // ---------- being hit ----------

  hurt(dmg, from, kx, ky, head = false) {
    if (!this.alive) return false;
    if (this.roll && this.roll.t < ROLL_SAFE && !this.blast) return false;   // diving under it
    this.hp -= dmg * (head ? HEAD_MUL : 1);
    this.flash = 0.06;
    this.hurtT = 0;
    this.vx += kx;
    this.vy += ky;
    if (this.onLadder && Math.abs(kx) > 80) this.onLadder = false;
    if (this.hp <= 0) this.die(from, head ? 'HEADSHOT' : null, kx, ky);
    return true;
  }

  die(killer, how, kx, ky) {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    this.killer = killer;
    this.deadT = 0;
    this.onLadder = false;
    this.roll = null;
    this.corpse = { x: this.x, y: this.y, vx: this.vx * 0.6 + kx * 0.4, vy: Math.min(-80, this.vy - 120), rot: 0, spin: (Math.sign(kx || this.facing) || 1) * (6 + Math.random() * 4), down: false, melted: how === 'MELTED' };
    if (this.weapon) this.game.fx.thrownGun(this, this.weapon);
    this.weapon = null;
    this.slashes = [];
    this.game.onDeath(this, killer, how);
  }

  updateCorpse(dt) {
    this.deadT += dt;
    const c = this.corpse;
    if (!c || c.down) return;
    c.vy = Math.min(560, c.vy + GRAVITY * dt);
    c.vx *= Math.exp(-1.5 * dt);
    const L = this.game.level;
    let nx = c.x + c.vx * dt;
    if (L.get(Math.floor((nx + Math.sign(c.vx) * 6) / T), Math.floor((c.y - 4) / T)) === SOLID) { c.vx *= -0.3; nx = c.x; }
    c.x = nx;
    const ny = c.y + c.vy * dt, cell = L.get(Math.floor(c.x / T), Math.floor(ny / T));
    if (c.vy > 0 && (cell === SOLID || cell === PLAT || cell === ACID) && Math.floor(ny / T) !== Math.floor(c.y / T)) {
      c.y = Math.floor(ny / T) * T;
      if (Math.abs(c.vy) > 200) { c.vy *= -0.25; c.vx *= 0.5; this.game.fx.blood(c.x, c.y - 3, 6, 0, -1); }
      else { c.down = true; c.melted = c.melted || cell === ACID; }
    } else c.y = ny;
    c.rot += c.spin * dt;
    if (c.down || c.vy === 0) c.spin *= 0.8;
    if (c.down) c.rot = Math.cos(c.rot) >= 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  // ---------- animation (the main game's walk / idle) ----------

  animate(dt) {
    const pose = this.pose;
    pose.headX = 0;
    this.settle = Math.max(0, this.settle - dt);
    if (this.roll) {
      pose.legL = [0, 0];
      pose.legR = [0, 0];
      pose.body = pose.head = 0;
      return;
    }
    if (this.onLadder) {
      const s = Math.floor(this.climbT / 8) % 2;
      pose.legL = [0, s ? 0 : 2];
      pose.legR = [0, s ? 2 : 0];
      pose.body = pose.head = 0;
      return;
    }
    if (!this.onGround) {
      // in the air: knees up going up, legs reaching down coming down
      pose.legL = this.vy < 0 ? [-1, 3] : [-1, 1];
      pose.legR = this.vy < 0 ? [1, 2] : [1, 0];
      pose.body = this.vy < 0 ? -1 : 0;
      pose.head = pose.body;
      return;
    }
    const walking = Math.abs(this.vx) > 8;
    const state = walking ? 'walk' : 'idle';
    if (state !== this.state) {
      if (state === 'walk') this.game.fx.step(this.x, this.y);
      else this.settle = SETTLE_TIME;
      this.state = state;
      this.animT = 0;
      this.frame = -1;
    }
    if (walking) {
      const speed = Math.min(SPRINT, Math.abs(this.vx) / WALK);
      const backward = this.vx * this.facing < -10;
      this.animT += (backward ? -1 : 1) * dt * (0.55 + 0.45 * speed);
      const n = WALK_BODY.length, f = ((Math.floor(this.animT * WALK_FPS) % n) + n) % n;
      if (f !== this.frame) {
        this.frame = f;
        if (STEP_FRAMES[f]) this.game.fx.step(this.x + this.facing * 2, this.y);
      }
      [pose.legL, pose.legR] = walkLegs(f, 1);
      pose.body = WALK_BODY[f];
      pose.head = WALK_HEAD[f];
      if (Math.abs(this.vx) > 20 && !backward) pose.headX = 1;   // lean into the walk
    } else {
      this.animT += dt;
      this.frame = this.animT % IDLE_PERIOD < IDLE_PERIOD / 2 ? 0 : 1;
      pose.legL = [0, 0];
      pose.legR = [0, 0];
      pose.body = 0;
      pose.head = this.frame;
    }
    if (this.settle > 0) pose.body = pose.head = 1;
  }

  // ---------- drawing ----------

  draw(ctx) {
    if (!this.alive) return this.drawCorpse(ctx);
    const P = this.parts, white = this.flash > 0, x = Math.round(this.x), y = Math.round(this.y), pose = this.pose;
    const part = (k) => (white ? P[k + 'W'] : P[k]);
    const ox = -ORIGIN_X, oy = -ORIGIN_Y;
    if (this.roll) return this.drawRoll(ctx, x, y);
    if (this.onLadder && P.backBody) return this.drawClimbing(ctx, x, y, part);
    this.drawSlung(ctx, x, y);
    ctx.save();
    ctx.translate(this.facing < 0 ? x + 1 : x, y);
    if (this.facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(part('legL'), ox + pose.legL[0], oy - pose.legL[1]);
    ctx.drawImage(part('legR'), ox + pose.legR[0], oy - pose.legR[1]);
    ctx.drawImage(part('body'), ox, oy + pose.body);
    ctx.drawImage(part(this.blinkLeft > 0 ? 'headBlink' : 'head'), ox + pose.headX, oy + pose.head);
    ctx.restore();
    this.drawArms(ctx);
    for (const sl of this.slashes) this.drawSlash(ctx, sl);
  }

  // What isn't in hand is carried: the gun slung muzzle-up across the back,
  // a melee weapon (not bare fists) at the hip, pointing back like a sword in its belt.
  drawSlung(ctx, x, y) {
    const put = (obj, ang, ax, ay) => {
      const a = this.facing > 0 ? ang : Math.PI - ang, flip = Math.cos(a) >= 0 ? 1 : -1;
      ctx.save();
      ctx.translate(x - this.facing * ax, y - ay + this.pose.body);
      ctx.rotate(a);
      ctx.scale(1, flip);
      obj.draw(ctx);
      ctx.restore();
    };
    if (!this.meleeOut && !this.melee.def.fists) put(this.melee, Math.PI - 0.12, -2, 9);   // at the hip, pointing back
    if (this.weapon && this.slot !== 2) put(this.weapon, -2.0, 3, 13);
  }

  // The main game's dodge roll: the whole character (gun and all) drawn off to
  // the side, then turned one full somersault about the middle of the body,
  // squashed into a ball mid-turn and dropped low. Behind it: cyan afterimages
  // of where it just was, speed streaks trailing back, and spin lines curling round.
  drawRoll(ctx, x, y) {
    const r = this.roll;
    this.rollCanvas ??= makeCanvas(64, 64);
    this.rollGhost ??= makeCanvas(64, 64);
    const [c, rc] = this.rollCanvas, [gc, gx] = this.rollGhost;
    const FX = 32, FY = 46, MID = 10;   // feet on the off-screen canvas; spin about MID px up
    rc.clearRect(0, 0, 64, 64);
    rc.save();
    rc.translate(FX - x, FY - y);
    const roll = this.roll;
    this.roll = null;
    this.draw(rc);
    this.roll = roll;
    rc.restore();
    gx.globalCompositeOperation = 'copy';
    gx.drawImage(c, 0, 0);
    gx.globalCompositeOperation = 'source-atop';
    gx.fillStyle = '#7fe3ff';
    gx.fillRect(0, 0, 64, 64);
    const pose = (t) => {
      const k = smooth(Math.min(1, t / 0.9)), curl = Math.sin(Math.PI * Math.min(1, t / 0.9));
      return { spin: Math.round((r.spin * k * Math.PI * 2) / (Math.PI / 8)) * (Math.PI / 8), curl };
    };
    const put = (img, px, py, t) => {
      const p = pose(t), cy = py - MID + Math.round(p.curl * 3);
      ctx.save();
      ctx.translate(px, cy);
      ctx.rotate(p.spin);
      ctx.scale(1 - p.curl * 0.1, 1 - p.curl * 0.2);
      ctx.drawImage(img, -FX, -(FY - MID));
      ctx.restore();
      return { cy, ...p };
    };
    const ox = x - this.x, oy = y - this.y;
    const fast = 1 - r.t, back = { x: -r.dir, y: 0 }, rdx = r.dir, rdy = 0;
    if (fast > 0.15) {
      for (const [side, len, col] of [[-6, 16, '#ffffff'], [-2, 24, '#bff2ff'], [3, 20, '#ffffff'], [7, 12, '#7fe3ff']]) {
        const L = Math.round(len * fast), sx = x + back.x * 8 - rdy * side, sy = y - MID + back.y * 8 + rdx * side;
        ctx.fillStyle = col;
        for (let i = 0; i < L; i++) if (i % 7 !== 5) ctx.fillRect(Math.round(sx + back.x * i), Math.round(sy + back.y * i), 1, 1);
      }
    }
    for (const [n, a] of [[6, 0.18], [4, 0.3], [2, 0.45]]) {
      const g = r.trail[n];
      if (!g) continue;
      ctx.globalAlpha = a * (1 - r.t * 0.5);
      put(gc, Math.round(g.x + ox), Math.round(g.y + oy), g.t);
    }
    ctx.globalAlpha = 1;
    const p = put(c, x, y, r.t);
    if (p.curl > 0.25) {
      const R = 13;
      for (const [off, len, col] of [[0, 1.8, '#ffffff'], [Math.PI, 1.2, '#9fe9ff']]) {
        ctx.fillStyle = col;
        for (let i = 0; i < 16; i++) {
          if (i % 5 === 4 && len < 1.5) continue;
          const a = p.spin + off - r.spin * (i / 16) * len - Math.PI / 2;
          ctx.fillRect(Math.round(x + Math.cos(a) * R), Math.round(p.cy + Math.sin(a) * (R - 2)), 1, 1);
        }
      }
    }
  }

  // On a ladder, seen from behind, facing into the wall: the hands go up the
  // rails hand over hand - the one reaching up shows above the head, the
  // other is hidden behind it - and the feet take turns stepping up.
  drawClimbing(ctx, x, y, part) {
    const ox = -ORIGIN_X, oy = -ORIGIN_Y, pose = this.pose;
    const s = Math.floor(this.climbT / 8) % 2, reach = (this.climbT % 8) / 8;
    // hands on the rails at about head height, the reaching one a few pixels higher
    const high = y - 25 - Math.round(reach * 2), low = y - 20;
    drawHand(ctx, 'grab', x - 9, s ? high : low);
    drawHand(ctx, 'grab', x + 10, s ? low : high);
    ctx.drawImage(part('backLegL'), x + ox + pose.legL[0], y + oy - pose.legL[1]);
    ctx.drawImage(part('backLegR'), x + ox + pose.legR[0], y + oy - pose.legR[1]);
    ctx.drawImage(part('backBody'), x + ox, y + oy + pose.body);
    ctx.drawImage(part('backHead'), x + ox, y + oy + pose.head);
  }

  drawArms(ctx) {
    const w = this.weapon, x = Math.round(this.x), y = Math.round(this.y), b = this.pose.body;
    if (this.onLadder) {
      // both hands on the rungs, the gun slung
      const s = Math.floor(this.climbT / 6) % 2;
      drawHand(ctx, 'grab', x - 3, y - 13 - (s ? 2 : 0));
      drawHand(ctx, 'grab', x + 4, y - 13 - (s ? 0 : 2));
      return;
    }
    if (this.slot === 1) return this.drawMelee(ctx, x, y);
    if (this.slot === 3 || !w) {
      // a grenade in the throwing hand, swung over and out when it's thrown
      const t = this.throwT, k = t >= 0 ? Math.sin(Math.PI * t) : 0, s = this.shoulder;
      const hx = s.x + Math.cos(this.aim) * (2 + k * 9) - this.facing * (t >= 0 && t < 0.4 ? 6 * (1 - t / 0.4) : 0);
      const hy = s.y - 2 + Math.sin(this.aim) * (2 + k * 9) - (t >= 0 && t < 0.4 ? 5 : 0);
      if (this.grenades > 0 && (t < 0 || t > 0.6)) ctx.drawImage(this.game.nadeArt(this.nade), Math.round(hx) - 2, Math.round(hy) - 5);
      drawHand(ctx, 'open', Math.round(hx), Math.round(hy));
      drawHand(ctx, 'open', x - this.facing * 2, y - 8 + b);
      return;
    }
    this.drawGun(ctx);
  }

  // Melee weapon in hand: trigger hand on the grip, the other hand further
  // up the handle (two-handed) or hanging by the body.
  drawMelee(ctx, x, y) {
    const m = this.melee, g = this.gunPose(), pts = m.art.points, grip = pts.grip;
    if (m.def.fists) {
      // bare hands in a guard; the punching hand whips out along its path
      for (const hand of ['L', 'R']) {
        const f = this.fistPoint(x, y, hand);
        drawHand(ctx, 'open', Math.round(f.x), Math.round(f.y));
      }
      return;
    }
    if (!pts.support) {
      const h = this.bodyPoint(x, y, { x: -4, y: -8 });
      drawHand(ctx, 'open', h.x, h.y);   // nothing to hold: a relaxed hand by the body
    }
    this.enterGun(ctx, g);
    // hand, weapon, hand: the far hand holds the handle from behind, the near
    // hand wraps over it in front (the chainsaw's top loop is gripped from above)
    const behind = pts.support && m.def.style !== 'saw';
    if (behind) drawHand(ctx, 'support', pts.support.x - grip.x, pts.support.y - grip.y);
    m.draw(ctx);
    drawHand(ctx, 'trigger', 0, 0);
    if (pts.support && !behind) drawHand(ctx, 'support', pts.support.x - grip.x, pts.support.y - grip.y);
    ctx.restore();
  }

  drawSlash(ctx, s) {
    const o = this.aimOrigin(), ox = Math.round(o.x), oy = Math.round(o.y);
    // once it's done it goes away: a slash in three frames (big, medium, small),
    // the streak and punch burst by going see-through
    const after = Math.max(0, s.t - s.grow) / (s.life - s.grow), fade = 1 - after;
    if (fade <= 0) return;
    ctx.save();
    let last = null;
    const dot = (x, y, color) => {
      if (color !== last) ctx.fillStyle = last = color;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    };
    if (s.kind === 'slash') {
      // a slash wave like a comet: a thick white pointed head where the blade
      // is now, and a curved tail sweeping back behind it that thins out and
      // breaks up into stray pixels; cyan on the inside, white on the outer edge
      // grows with the same easing as the swing, so the head stays on the blade
      const grow = smooth(Math.min(1, s.t / s.grow)), a0 = s.a - (s.dir * s.arc) / 2, span = s.arc * grow;
      // after the swing: frame 1 the whole wave, frame 2 a smaller one, frame 3 a
      // small hook at the head - each thinner and shorter, shrinking to the head
      const size = s.t <= s.grow ? 1 : [1, 0.6, 0.3][Math.min(2, Math.floor(after * 3))];
      const from = span * (1 - size);
      // at its head the wave is filled right in to the blade (its leading edge runs
      // along the blade); behind that it tapers off round the arc
      const R = s.r, TH = Math.max(9, R - 11) * Math.max(0.35, size), Rr = Math.ceil(R);
      if (span <= 0.05) {
        ctx.restore();
        return;
      }
      for (let y = -Rr; y <= Rr; y++) {
        for (let x = -Rr; x <= Rr; x++) {
          const d = Math.hypot(x, y);
          if (d > R || d < R - TH) continue;
          let rel = (Math.atan2(y, x) - a0) * s.dir;
          rel = ((rel % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          if (rel > span || rel < from) continue;
          const u = (rel - from) / (span - from);   // 0 at the tail .. 1 at the head
          const w = 1 + (TH - 1) * Math.pow(u, 2.2);
          if (d < R - w) continue;
          // the thin end of the tail is only a scatter of pixels
          if (u < 0.45 && ((((x * 2654435761) ^ (y * 40503)) >>> 0) % 100) / 100 > 0.25 + u * 1.6) continue;
          const v = (R - d) / Math.max(1, w);   // 0 at the outer edge .. 1 at the inner
          dot(x, y, v < 0.22 ? '#f4fbff' : v < 0.5 ? '#c9f0fd' : v < 0.78 ? '#8fdaf6' : '#4cc3ec');
        }
      }
    } else if (s.kind === 'thrust') {
      // a pixel streak in three frames: a big arrowhead with a notched tail, then
      // a stack of offset bars, then a thin bar with a stray pixel behind it.
      // Each frame is rows of bars across the thrust (u 0..1 along it, v across)
      const dx = Math.cos(s.a), dy = Math.sin(s.a);
      const frame = Math.min(2, Math.floor((s.t / s.life) * 3));
      const rows = THRUST_FRAMES[frame];
      const S = 6, L = (s.r - 2) * (0.7 + 0.3 * smooth(Math.min(1, s.t / s.grow))), R = Math.ceil(S + L + 1);
      for (let y = -R; y <= R; y++) {
        for (let x = -R; x <= R; x++) {
          const u = (x * dx + y * dy - S) / L, v = Math.round(-x * dy + y * dx);
          if (u < 0 || u > 1) continue;
          const row = rows[v];
          if (!row) continue;
          for (const [u0, u1, c] of row) {
            if (u >= u0 && u <= u1) {
              dot(x, y, c);
              break;
            }
          }
        }
      }
    } else {
      // a punch: while it flies, a swoosh trailing the fist round its path (a
      // wide arc for the hook, speed lines for a straight one); when it lands, an
      // impact star in 3 frames - a big spiky burst, a ring of sparks, a few last specks
      const { b, c, e } = s.path, at = (k) => {
        const j = 1 - k;
        return { x: j * j * b.x + 2 * j * k * c.x + k * k * e.x, y: j * j * b.y + 2 * j * k * c.y + k * k * e.y };
      };
      const dx = Math.cos(s.a), dy = Math.sin(s.a), big = s.hook ? 1.4 : 1;
      if (s.t <= s.grow + 0.03) {
        const head = Math.pow(Math.min(1, s.t / s.grow), 0.7);
        const W = s.hook ? 3 : 1;
        for (let i = 0; i <= 24; i++) {
          const k = Math.max(0, head - 0.14) * (0.25 + 0.75 * (i / 24)), p = at(k), w = Math.round(W * (i / 24));
          const q = at(Math.min(1, k + 0.02)), tx = q.x - p.x, ty = q.y - p.y, tl = Math.hypot(tx, ty) || 1;
          const nx = -ty / tl, ny = tx / tl;
          for (let j = -w; j <= w; j++) {
            if (!s.hook && j !== 0 && i < 12) continue;
            dot(Math.round(p.x + nx * j), Math.round(p.y + ny * j), Math.abs(j) === w && w > 0 ? '#ffd36b' : '#fff6dc');
          }
        }
        if (!s.hook) {
          // two short speed lines either side of the straight punch
          const f = at(head), n = Math.round(3 + 6 * head);
          for (const side of [-2, 2]) {
            for (let i = 3; i <= n; i++) dot(Math.round(f.x - dx * i - dy * side), Math.round(f.y - dy * i + dx * side), '#ffe9a8');
          }
        }
      } else {
        const frame = Math.min(2, Math.floor(((s.t - s.grow - 0.03) / (s.life - s.grow - 0.03)) * 3));
        const cx = e.x + dx * 2, cy = e.y + dy * 2;
        const ray = (ang, r0, r1, col) => {
          for (let r = r0; r <= r1; r++) dot(Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r), r > r1 - 1.5 ? col : '#fffaf0');
        };
        if (frame === 0) {
          // a hot core and 8 spikes, longest where the punch was going
          for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if (x * y === 0) dot(Math.round(cx) + x, Math.round(cy) + y, '#ffffff');
          for (let i = 0; i < 8; i++) {
            const off = (i / 8) * Math.PI * 2, fw = Math.cos(off);
            ray(s.a + off, 2, Math.round((4 + 3 * Math.max(0, fw)) * big), i % 2 ? '#ffb347' : '#ffd36b');
          }
        } else if (frame === 1) {
          // the spikes break off into a ring of sparks
          for (let i = 0; i < 8; i++) {
            const ang = s.a + (i / 8) * Math.PI * 2 + Math.PI / 8, R = Math.round((5 + (i % 2)) * big);
            ray(ang, R - 1, R, '#ffb347');
          }
          dot(Math.round(cx), Math.round(cy), '#fff6dc');
        } else {
          // a few last specks flying outward
          for (let i = 0; i < 5; i++) {
            const ang = s.a + (i - 2) * 0.55, R = Math.round((7 + (i % 2) * 2) * big);
            dot(Math.round(cx + Math.cos(ang) * R), Math.round(cy + Math.sin(ang) * R), '#ff9b45');
          }
        }
      }
    }
    ctx.restore();
  }



  // The main game's drawGun: gun in gun space with both hands, the reload hand travelling.
  drawGun(ctx) {
    const w = this.weapon, g = this.gunPose(), pts = w.art.points, grip = pts.grip;
    const reloading = w.reloading, h = reloading ? this.reloadHand(g) : null;
    const enter = (px, py) => {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(g.a);
      ctx.scale(1, g.flip);
    };
    if (h?.under && h.holding) {
      enter(h.x, h.y);
      ctx.drawImage(h.holding, -Math.round(artW(h.holding) / 2), -artH(h.holding) + 1, artW(h.holding), artH(h.holding));
      ctx.restore();
    }
    enter(g.x, g.y);
    const act = w.def.action && w.actionProgress >= 0 ? w.actionProgress : -1;
    const spin = act >= 0 && w.def.action.spin ? Math.PI * 2 * smooth(Math.min(1, Math.max(0, (act - 0.08) / 0.8))) : 0;
    if (spin) { ctx.save(); ctx.rotate(-spin); }
    w.draw(ctx);
    if (act >= 0 && w.def.action.hand === 'handle') {
      const reach = smooth(Math.min(1, act / 0.2, (1 - act) / 0.2)), hp = this.handlePoint;
      drawHand(ctx, reach > 0.8 ? 'grab' : 'open', (hp.x - w.actionOffset - grip.x) * reach, (hp.y - grip.y) * reach);
    } else if (!h?.trigger) {
      drawHand(ctx, act >= 0 && w.def.action.part === 'lever' ? 'support' : 'trigger', 0, 0);
    }
    if (spin) ctx.restore();
    if (!reloading || h.trigger) {
      let s = pts.support;
      if (act >= 0 && w.def.action.part === 'pump') s = { x: s.x - w.actionOffset, y: s.y };
      drawHand(ctx, spin ? 'open' : 'support', s.x - grip.x, s.y - grip.y);
    }
    ctx.restore();
    if (reloading) {
      enter(h.x, h.y);
      if (h.holding && !h.under) ctx.drawImage(h.holding, -Math.round(artW(h.holding) / 2), -artH(h.holding) + 1, artW(h.holding), artH(h.holding));
      drawHand(ctx, h.pose, 0, 0);
      ctx.restore();
    }
  }

  // The muzzle flash (drawn after the lighting).
  drawFlash(ctx) {
    const w = this.weapon;
    if (!this.alive || !w || this.slot !== 2 || w.flash <= 0 || this.onLadder) return;
    const g = this.gunPose();
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.a);
    ctx.scale(1, g.flip);
    w.drawFlash(ctx);
    ctx.restore();
  }

  drawCorpse(ctx) {
    const c = this.corpse;
    if (!c) return;
    const P = this.parts, fade = Math.min(1, Math.max(0, 1 - (this.deadT - 25) / 4));
    if (fade <= 0) return;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(Math.round(c.x), Math.round(c.y - (c.down ? 6 : 12)));
    ctx.rotate(c.rot);
    if (c.melted) ctx.filter = 'brightness(0.55) sepia(1) hue-rotate(60deg)';
    ctx.drawImage(P.legL, -ORIGIN_X, -ORIGIN_Y + 12);
    ctx.drawImage(P.legR, -ORIGIN_X, -ORIGIN_Y + 12);
    ctx.drawImage(P.body, -ORIGIN_X, -ORIGIN_Y + 12);
    ctx.drawImage(P.head, -ORIGIN_X, -ORIGIN_Y + 12);
    ctx.restore();
  }
}
