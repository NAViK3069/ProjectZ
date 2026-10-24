// The player: movement, collision, weapons, gear, health and a layered sprite
// (legs, body, head) animated by moving each part a pixel or two. Rig details
// (walk tables) are in rig.js. The art faces right; facing left mirrors it.
//
// Guns are drawn in "gun space": translated to the grip, rotated to the aim
// and mirrored when facing left. The hands holding them are drawn in the same
// space, so they turn with the gun - a trigger hand with its finger along the
// guard, and a half-fist support hand under the handguard.

import { makeCanvas, makeShadow, spriteFromRows } from '../engine/pixel.js';
import { Weapon, WEAPONS, RELOAD_EVENTS, SHELL_IN } from '../combat/weapons.js';
import { MeleeWeapon, MELEE, FISTS, WIND, STRIKE } from '../combat/melee.js';
import { THROWABLE_IDS } from '../combat/throwables.js';
import { SpecWeapon, specAct, isSpec, spinHead } from '../combat/spec.js';
import { HANDS, part, GUN_PAL } from '../combat/gunart.js';
import { Inventory, newItem } from '../game/inventory.js';
import { ORIGIN_X, ORIGIN_Y, WALK_BODY, WALK_HEAD, STEP_FRAMES, walkLegs, enterFacing } from './rig.js';

const MAX_SPEED = 82;      // px/s
const SPRINT = 1.5;        // speed multiplier while sprinting
const ACCEL = 950;
const DECEL = 1250;
const HALF_W = 5;          // feet hitbox
const HEIGHT = 6;
const NUDGE = 5;           // corner assist: px we may slide sideways around an edge

export const MAX_HP = 100;
const REGEN_DELAY = 5;     // seconds after a hit before health starts coming back
const REGEN_RATE = 4;      // hp/s - slow; meds are the real healing
const HURT_INVULN = 0.6;
export const MAX_STAMINA = 100;
const STAMINA_DRAIN = 32;  // per second sprinting
const STAMINA_REGEN = 24;
const STAMINA_DELAY = 0.7;
// Double-tap a direction: a dodge roll - curl up and tumble a full turn along the way
// you're walking, untouchable for most of it
const ROLL_TIME = 0.4;
const ROLL_SPEED = 250;    // px/s at the start, easing off to ~40% by the end (~70 px in all)
const ROLL_COST = 20;      // stamina
const ROLL_COOLDOWN = 0.2;
const ROLL_SAFE = 0.8;     // the first 80% of the roll can't be hit

const WALK_FPS = 16;
const IDLE_PERIOD = 1.5;   // slow breathing: the head dips a pixel on the exhale
const SETTLE_TIME = 0.1;   // body dips a pixel when stopping or turning

// Feet x positions relative to the anchor (for footstep dust).
const FOOT_X = { L: -3.5, R: 4.5 };

// Weapon: held at chest height, a few px out from the body toward the aim.
const GUN_HEIGHT = 9;      // pivot height above the feet
const STANCE_HEIGHT = 5;   // a melee weapon at rest is held lower, at the waist
const GUN_REACH = 4;       // pivot -> grip distance
const RELOAD_TILT = 0.55;  // radians the muzzle tips up mid-reload
const SHELL_TILT = -0.4;   // muzzle tipped down while feeding shells
const RAISE_TILT = -1.1;   // gun starts pointing at the floor when you switch to it
const LASER_TRUE_SHOTS = 2;   // with a laser on, this many shots after a pause have no spread
const CLIMB_KEEP = 0.35;   // how much of the muzzle climb still sends bullets high (auto fire creeps up a bit)
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
export const MAX_WEAPONS = 2;
const BELT = { x: -2, y: -5 };   // where the hand grabs a fresh mag (body-local)

// Off-hand paths during a reload: [time, key] - see reloadHand().
const RELOAD_PATH = [
  [0, 'rest'], [0.12, 'well'], [0.18, 'well'], [0.38, 'belt'], [0.45, 'belt'],
  [0.6, 'well'], [0.68, 'wellUp'], [0.8, 'handle'], [RELOAD_EVENTS.rack, 'handleBack'], [1, 'rest'],
];
// One shell: belt -> loading port -> push it in. The first one starts from the pump.
const SHELL_PATH = [[0, 'well'], [0.3, 'belt'], [0.42, 'belt'], [0.72, 'well'], [SHELL_IN, 'wellUp'], [1, 'well']];
const FIRST_SHELL_PATH = [[0, 'rest'], ...SHELL_PATH.slice(1)];
// Guns whose bolt is worked after the reload (sniper) skip the rack at the end.
const NO_RACK_PATH = [...RELOAD_PATH.slice(0, 7), [1, 'rest']];

// Which hand shape the off hand makes on the way from point `from` to `to`
// (k = 0..1 along the way): it lets go of the gun (support -> open), carries
// the mag / shell open, closes upright round the charging handle to pull it
// (grab), opens again, and wraps back under the handguard (support).
function reloadPose(from, to, k) {
  if (from === 'rest' && to === 'rest') return 'support';         // holding the gun while it's broken open
  if (to === 'barrel') return k > 0.6 ? 'support' : 'open';       // palm on the barrels to snap them shut
  if (from === 'barrel') return to === 'barrel' ? 'support' : k > 0.9 ? 'support' : 'open';
  if (to === 'handle') return k > 0.7 ? 'grab' : 'open';
  if (from === 'handle') return 'grab';
  if (from === 'handleBack') return k < 0.25 ? 'grab' : k > 0.9 ? 'support' : 'open';
  if (to === 'rest') return k > 0.9 ? 'support' : 'open';
  if (from === 'rest') return k < 0.15 ? 'support' : 'open';
  return 'open';
}

// What the off hand carries in during a reload (outlined, lying along the gun).
const HELD = {
  shell: part(['yrrr', 'yRRr'], GUN_PAL),          // shotgun shell: brass base, red hull
  round: part(['yyyW'], GUN_PAL),                   // rifle cartridge
  loader: part(['.yyy.', 'yhyhy', '.yyy.'], GUN_PAL),   // revolver speedloader
};
const STEP_TILT = -0.3;    // muzzle tipped down while a break action is open

// Draw hand `name` with its anchor pixel on (x, y) of the current transform.
function drawHand(ctx, name, x, y) {
  const h = HANDS[name];
  ctx.drawImage(h.img, x - h.at.x - 1, y - h.at.y - 1);
}

// Eye pixels in head.png (2x3 each at y 14..16) - covered to draw a blink.
const EYES_X = [15, 20];
const SKIN = 'rgb(249, 226, 219)';
const LID = 'rgb(24, 22, 22)';

// Gear drawn over the character (32x32 sprite space, facing right).
const GEAR_PAL = { K: '#000000', m: '#4a5240', M: '#5d6750', n: '#3a4032', p: '#3e4a2c', P: '#56643c', q: '#2b331f', b: '#5d5040', B: '#6f6050', d: '#4a3f32' };
const HELMET = spriteFromRows([
  '.......KKKKKKKK.......',
  '....KKKmmmMMmmmKKK....',
  '...KmmmmmmmmMmmmmmK...',
  '..KmmmmmmmmmmmmmmmmK..',
  '.KmmmmmmmmmmmmmmmmmmK.',
  '.KmmmmmmmmmmmmmmmmmnK.',
  'KnnnnnnnnnnnnnnnnnnnnK',
  'KKKKKKKKKKKKKKKKKKKKKK',
], GEAR_PAL, { w: 32, h: 32, x: 5, y: -1 });
const VEST = spriteFromRows([
  'KKKKKKKKKKKKK',
  'KpPPpppppPPpK',
  'KppqqppppqqpK',
  'KpKKKpKKKpppK',
  'KpKPKpKPKpppK',
  'KpKKKpKKKpppK',
  'KKKKKKKKKKKKK',
], GEAR_PAL, { w: 32, h: 32, x: 10, y: 19 });
const BACKPACK = spriteFromRows([
  '.KKKKK',
  'KBBbbK',
  'KbbbbK',
  'KbddbK',
  'KbbbbK',
  'KbbbbK',
  'KKKKKK',
], GEAR_PAL, { w: 32, h: 32, x: 5, y: 18 });

function makeBlinkHead(head) {
  const [c, g] = makeCanvas(head.width, head.height);
  g.drawImage(head, 0, 0);
  for (const ex of EYES_X) {
    g.fillStyle = SKIN;
    g.fillRect(ex, 14, 2, 3);
    g.fillStyle = LID;
    g.fillRect(ex, 15, 2, 1);
  }
  return c;
}

const smooth = (t) => t * t * (3 - 2 * t);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Player {
  // env: { particles, bullets, kick(dx, dy), throwGrenade(x, y, z) } - what the player's actions affect
  constructor(images, x, y, env) {
    this.parts = {
      head: images.head,
      headBlink: makeBlinkHead(images.head),
      body: images.body,
      legL: images.legL,
      legR: images.legR,
    };
    this.shadow = makeShadow(13, 5);
    this.env = env;
    this.particles = env.particles;

    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.halfW = HALF_W;
    this.height = HEIGHT;
    this.facing = 1;
    this.aim = 0;          // radians, 0 = right

    // starting kit: a pistol, a couple of boxes of 9mm, bandages and two grenades
    this.inventory = new Inventory();
    for (const [id, n] of [['ammo9', 60], ['ammo9', 36], ['bandage', 3], ['grenade', 2]]) this.inventory.add(newItem(id, n));
    this.ammoSource = this.inventory;   // where guns draw reserve ammo from (training: endless)
    this.infinite = false;              // training: throwables are never used up
    this.weapons = [null, null];        // gun slots 2 and 3 (either can be empty)
    this.slot = 0;
    this.giveWeapon(WEAPONS.m9);
    this.weapon.drawT = 0;
    this.melee = new MeleeWeapon(MELEE.knife);   // slot 1
    this.meleeOut = false;
    this.slashes = [];                  // melee hit effects: crescent slashes, thrust streaks, punch bursts
    this.throwSel = 'grenade';          // which throwable G uses (X cycles)
    this.lightOn = true;                // the gun's flashlight / laser (F switches it off to sneak)
    this.grenadeCooldown = 0;
    this.tilt = 0;         // smoothed reload tilt (radians)
    this.wallTilt = 0;     // weapon raised out of a wall it would poke through
    this.triggerHeld = false;
    this.muzzleLight = 0;
    this.muzzle = { x, y };
    this.using = null;     // { item, t } while using a medkit/bandage

    this.hp = MAX_HP;
    this.hurtTime = 99;    // seconds since last hit
    this.invuln = 0;
    this.dead = false;
    this.stamina = MAX_STAMINA;
    this.staminaRest = 0;
    this.sprinting = false;
    this.roll = null;       // { t: 0..1, dx, dy } while dodge-rolling
    this.rollCool = 0;
    this.dash = null;       // a forced dash (spec weapons): { vx, vy, t, safe, onMove, onEnd }
    this.rollCanvas = makeCanvas(64, 64);
    this.rollGhost = makeCanvas(64, 64);

    this.state = 'idle';
    this.animTime = 0;
    this.frame = 0;
    this.settle = 0;
    this.pose = { body: 0, head: 0, headX: 0, legL: [0, 0], legR: [0, 0] };
    this.blinkIn = 1.5 + Math.random() * 2;
    this.blinkLeft = 0;
  }

  // The current gun (slot 2 or 3) - even while the melee weapon is out.
  get weapon() {
    return this.weapons[this.slot];
  }

  // What's in hand right now: the melee weapon or the gun.
  get held() {
    return this.meleeOut ? this.melee : this.weapon;
  }

  // How many of the selected throwable you have.
  get grenades() {
    return this.infinite ? 9 : this.inventory.countId(this.throwSel);
  }

  // X: next throwable you actually have (all of them in training).
  cycleThrowable() {
    const have = THROWABLE_IDS.filter((id) => this.infinite || this.inventory.countId(id) > 0);
    if (!have.length) return;
    this.throwSel = have[(have.indexOf(this.throwSel) + 1) % have.length];
  }

  get sortY() {
    return this.y;
  }

  box(x = this.x, y = this.y) {
    return { l: x - HALF_W, t: y - HEIGHT, r: x + HALF_W, b: y };
  }

  // Point the gun's pivot is at; aim angles are measured from here.
  aimOrigin() {
    return { x: this.x, y: this.y - GUN_HEIGHT };
  }

  // controls: { move, aim (radians | null), fire, reload, sprint, heal, grenade, switchTo (slot | null), cycle (-1/0/1) }
  update(dt, controls, world) {
    if (this.dead) return;
    const mv = controls.move;
    const moving = Math.hypot(mv.x, mv.y) > 0.1;

    // sprint burns stamina; it comes back after a short rest
    this.sprinting = controls.sprint && moving && this.stamina > 0 && !this.using;
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN * dt);
      this.staminaRest = STAMINA_DELAY;
    } else if ((this.staminaRest -= dt) <= 0) {
      this.stamina = Math.min(MAX_STAMINA, this.stamina + STAMINA_REGEN * dt);
    }
    this.slowT = Math.max(0, (this.slowT ?? 0) - dt);
    this.rollCool -= dt;
    if (controls.roll && moving && !this.roll && !this.dash && this.rollCool <= 0 && !this.using && this.stamina >= ROLL_COST) this.startRoll(mv);
    const top = MAX_SPEED * (this.sprinting ? SPRINT : 1) * (this.using ? 0.5 : 1) * (this.slowT > 0 ? 0.55 : 1) * (this.held.def.speedMul ?? 1);

    // accelerate toward the target velocity (snappy, but not instant)
    const tx = mv.x * top, ty = mv.y * top;
    const dx = tx - this.vx, dy = ty - this.vy, d = Math.hypot(dx, dy);
    const step = (moving ? ACCEL : DECEL) * dt;
    if (this.dash) {
      // a dash carries you at its own speed (its last frame only as far as it has left)
      const k = Math.min(1, this.dash.t / dt);
      this.vx = this.dash.vx * k;
      this.vy = this.dash.vy * k;
    } else if (this.roll) {
      // the roll carries you on its own: fast off the mark, slowing as you uncurl
      const r = this.roll, sp = ROLL_SPEED * (1 - 0.6 * r.t);
      this.vx = r.dx * sp;
      this.vy = r.dy * sp;
      r.t += dt / ROLL_TIME;
      r.trail.unshift({ x: this.x, y: this.y, t: r.t });   // where it's been, for the afterimages
      r.trail.length = Math.min(r.trail.length, 10);
      if (r.t >= 1) this.endRoll();
    } else if (d <= step) {
      this.vx = tx;
      this.vy = ty;
    } else {
      this.vx += (dx / d) * step;
      this.vy += (dy / d) * step;
    }

    const px = this.x, py = this.y, forced = this.roll || this.dash;
    this.moveX(world, this.vx * dt, forced ? 0 : mv.y, dt);
    this.moveY(world, this.vy * dt, forced ? 0 : mv.x, dt);
    if (this.dash) {
      const d = this.dash;
      d.onMove?.(px, py);
      d.t -= dt;
      const blocked = (d.vx && !this.vx) || (d.vy && !this.vy);   // ran into a wall
      if (d.t <= 0 || blocked) {
        this.dash = null;
        this.vx = d.vx * 0.12;
        this.vy = d.vy * 0.12;
        d.onEnd?.();
      }
    }

    // aim at the mouse/stick if there is one, otherwise where we're walking
    if (controls.aim !== null) this.aim = controls.aim;
    else if (moving) this.aim = Math.atan2(mv.y, mv.x);
    this.aimTarget = controls.target ?? null;   // the point under the cursor (mouse only)
    if (controls.toggleLight) this.lightOn = !this.lightOn;   // F: rail light / laser on or off

    // face the aim (with a little dead band around straight up/down)
    const c = Math.cos(this.aim);
    // (a roll keeps the way you face: roll away from it and it's a back roll)
    const f = this.roll ? this.facing : c > 0.15 ? 1 : c < -0.15 ? -1 : this.facing;
    if (f !== this.facing) {
      this.facing = f;
      this.settle = SETTLE_TIME;
      if (this.state === 'walk') this.kickDust(2);
    }

    this.animate(dt, moving);
    this.updateHealing(dt, controls);
    // no shooting, swinging or throwing while curled up in a roll
    this.updateWeapon(dt, this.roll ? { ...controls, fire: false, grenade: false, heal: false } : controls);
    this.updateWallTilt(dt, world);

    this.hurtTime += dt;
    this.invuln -= dt;
    if (this.hurtTime > REGEN_DELAY) this.hp = Math.min(MAX_HP, this.hp + REGEN_RATE * dt);

    if (this.blinkLeft > 0) {
      this.blinkLeft -= dt;
    } else if ((this.blinkIn -= dt) <= 0) {
      this.blinkLeft = 0.12;
      this.blinkIn = Math.random() < 0.2 ? 0.22 : 2.2 + Math.random() * 3;  // sometimes a double blink
    }
  }

  // Up against a tall wall, a long weapon would poke out through the far side:
  // raise it instead, more the further in it would go.
  updateWallTilt(dt, world) {
    let want = 0;
    if (!this.meleeOut && this.weapon) {
      const w = this.weapon, L = GUN_REACH + (w.muzzle.x - w.art.points.grip.x) + 2;
      const free = world.castRay(this.x, this.y - 3, Math.cos(this.aim), Math.sin(this.aim), L, true);
      if (free < L) want = Math.min(1.35, ((L - free) / L) * 2.2);
    }
    this.wallTilt += (want - this.wallTilt) * Math.min(1, dt * 14);
  }

  // ---------- dodge roll ----------

  startRoll(mv) {
    const l = Math.hypot(mv.x, mv.y) || 1;
    const dx = mv.x / l, dy = mv.y / l;
    // it tumbles the way it travels (clockwise going right); straight up or
    // down it goes head over heels the way you face
    this.roll = { t: 0, dx, dy, spin: Math.abs(dx) > 0.2 ? Math.sign(dx) : this.facing, trail: [] };
    this.stamina -= ROLL_COST;
    this.staminaRest = STAMINA_DELAY;
    this.particles.dust(this.x - dx * 4, this.y - 1, 9, -dx, -dy);   // kicked off hard
  }

  endRoll() {
    this.roll = null;
    this.rollCool = ROLL_COOLDOWN;
    this.settle = SETTLE_TIME;   // a little dip as you land back on your feet
    this.particles.dust(this.x, this.y - 1, 5, this.vx / 100, this.vy / 100);   // skid to a stop
  }

  get rolling() { return !!this.roll; }

  // A dash at (vx, vy) px/s for `time` seconds (spec weapons: grapple, dragonblade).
  startDash(vx, vy, time, opts = {}) {
    this.roll = null;
    this.dash = { vx, vy, t: Math.max(0.001, time), ...opts };
  }

  // The character as drawn right now, on a 64x64 canvas with the feet at (32, 46).
  snapshot() {
    const [c, g] = makeCanvas(64, 64);
    this.drawBody(g, 32, 46);
    this.drawGun(g, 32, 46);
    return c;
  }

  // The ODM grapple's cable, from the hip to the hook (null without one out).
  get hookLine() {
    const w = this.weapon;
    if (this.dead || this.meleeOut || w?.def.key !== 'odm' || !w.state.hook) return null;
    const h = w.state.hook, s = this.bodyPoint(this.x, this.y, { x: 1, y: -7 });
    let ex, ey;
    if (h.ax === undefined) {
      ex = h.x0 + h.dx * h.out;
      ey = h.y0 + h.dy * h.out - h.z;
    } else {
      ex = h.grab ? h.grab.x : h.ax;
      ey = h.grab ? h.grab.y - 9 : h.ay - h.z;
    }
    if (h.reel !== undefined) {
      const k = smooth(Math.min(1, h.reel));
      ex += (s.x - ex) * k;
      ey += (s.y - ey) * k;
    }
    const l = Math.hypot(ex - s.x, ey - s.y) || 1;
    return { x0: s.x, y0: s.y, x1: ex, y1: ey, nx: (ex - s.x) / l, ny: (ey - s.y) / l, taut: h.ax !== undefined, t: w.t };
  }

  // ---------- meds ----------

  // Start using a med item (from the H key or the inventory screen).
  useItem(item) {
    if (this.dead || this.using || item.def.type !== 'med' || this.hp >= MAX_HP) return false;
    this.using = { item, t: 0 };
    this.held.cancelReload();
    return true;
  }

  updateHealing(dt, controls) {
    if (controls.heal && !this.using) {
      // the bigger heal when badly hurt, otherwise a bandage
      const inv = this.inventory, missing = MAX_HP - this.hp;
      const kit = inv.all.find((i) => i.id === 'medkit'), band = inv.all.find((i) => i.id === 'bandage');
      const pick = missing > 45 ? kit ?? band : band ?? kit;
      if (pick) this.useItem(pick);
    }
    if (!this.using) return;
    if (controls.fire) {
      this.using = null;   // shooting cancels it
      return;
    }
    this.using.t += dt;
    const { item } = this.using;
    if (this.using.t >= item.def.useTime) {
      this.hp = Math.min(MAX_HP, this.hp + item.def.heal);
      this.inventory.takeId(item.id, 1);
      this.using = null;
    }
  }

  get useProgress() {
    return this.using ? this.using.t / this.using.item.def.useTime : -1;
  }

  // ---------- weapons ----------

  // Slots: 1 = melee, 2 / 3 = guns. Q / the wheel cycles through them.
  updateWeapon(dt, controls) {
    let pick = controls.switchTo;   // 'melee' | gun index | null
    if (controls.cycle) {
      const order = ['melee', ...this.weapons.flatMap((w, i) => (w ? [i] : []))];
      const cur = this.meleeOut ? 0 : order.indexOf(this.slot);
      pick = order[(cur + controls.cycle + order.length * 2) % order.length];
    }
    if (pick === 'melee' && !this.meleeOut) {
      this.weapon?.cancelReload();
      this.meleeOut = true;
      this.melee.drawT = 0.25;
      this.settle = SETTLE_TIME;
    } else if (typeof pick === 'number' && this.weapons[pick] && (this.meleeOut || pick !== this.slot)) {
      this.weapon?.cancelReload();
      this.meleeOut = false;
      this.slot = pick;
      this.weapon.drawT = 0.3;
      this.settle = SETTLE_TIME;
    }

    if (this.meleeOut) this.updateMelee(dt, controls);
    else this.updateGun(dt, controls);
    this.muzzleLight -= dt;

    this.grenadeCooldown -= dt;
    if (controls.cycleThrow) this.cycleThrowable();
    if (!this.infinite && this.inventory.countId(this.throwSel) <= 0) this.cycleThrowable();
    if (controls.grenade && this.grenadeCooldown <= 0 && !this.using && this.env.useThrowable(this.throwSel)) this.grenadeCooldown = 0.5;
  }

  // Spec weapons: R recharges (each its own way, a battery spent), then the
  // weapon does its own thing.
  updateSpec(dt, controls) {
    const w = this.weapon, key = w.def.key, S = this.env.spec, t = w.reload;
    if (controls.reload && !this.using) w.startReload();
    w.update(dt);
    for (const e of w.events) {
      if (e === 'snap') {
        // ODM: the worn blades snap off at the clamp and fall
        for (const [hx, hy] of [[3, -9], [-2, -8]]) {
          const p = this.bodyPoint(this.x, this.y, { x: hx, y: hy });
          this.particles.gib(w.art.blade, p.x + this.facing * 6, p.y + 9, 9, this.facing * (20 + Math.random() * 30), 10 + Math.random() * 20, 30);
        }
        S?.sparkBurst(this.x + this.facing * 4, this.y - 6, 5, '#e8f1f7');
      } else if (e === 'battIn') {
        // the battery's power goes in: each weapon shows it its own way
        if (key === 'odm') for (let i = 0; i < 8; i++) S?.gas(this.x - this.facing * 8, this.y - 1, -this.facing, 0);
        if (key === 'tesla') {
          const g = this.gunPose(this.x, this.y), m = this.gunPoint(g, w.muzzle);
          S?.sparkBurst(m.x, m.y + this.gunZ, 12, '#bff3ff');
          this.env.kick?.(0, -1);
        }
        if (key === 'necro') for (let i = 0; i < 18; i++) S?.mote(this.x + this.facing * 7 + (Math.random() - 0.5) * 16, this.y - 14 + (Math.random() - 0.5) * 8, i % 2 ? '#de7dff' : '#fbe8ff');
        if (key === 'genji') for (let i = 0; i < 14; i++) S?.mote(this.x + this.facing * 5 + (Math.random() - 0.5) * 6, this.y - 10 - Math.random() * 22, i % 2 ? '#8dff8a' : '#f2fff0');
        if (key === 'ray') {
          const g = this.gunPose(this.x, this.y), c = this.gunPoint(g, { x: 13, y: 5 });
          S?.sparkBurst(c.x, c.y + this.gunZ, 10, '#ff9aa8');
        }
      } else if ((e === 'ventOpen' || e === 'ventShut') && key === 'ray') {
        // the fins clack open / shut with a little puff
        const g = this.gunPose(this.x, this.y), c = this.gunPoint(g, { x: 13, y: 1 });
        for (let i = 0; i < 4; i++) S?.gas(c.x, c.y + this.gunZ, 0, -1, ['#d9c9cf', '#a8959d'], this.gunZ + 3);
      } else if (e === 'chargeStart' && key === 'necro') {
        S?.circle(this.x, this.y);   // a rune circle under your feet for the ritual
      }
    }
    // while it charges: gas hissing into the tanks, sparks, souls drawn into the book, power climbing the blade
    if (w.reloading && S) {
      if (key === 'odm' && t > 0.62 && t < 0.86 && Math.random() < dt * 40) S.gas(this.x - this.facing * 8, this.y - 1, -this.facing, -0.3);
      if (key === 'ray' && t > 0.14 && t < 0.86 && Math.random() < dt * 34) {
        // heat pouring off the open fins, red hot at first
        const g = this.gunPose(this.x, this.y), c = this.gunPoint(g, { x: 8 + Math.random() * 11, y: 0 });
        S.gas(c.x, c.y + this.gunZ, 0, -1, t < 0.5 ? ['#ff8fa0', '#d9c9cf'] : ['#d9c9cf', '#a8959d'], this.gunZ + 3);
      }
      if (key === 'tesla' && Math.random() < dt * (6 + 20 * t)) {
        const g = this.gunPose(this.x, this.y), m = this.gunPoint(g, { x: 10 + Math.random() * 12, y: 2 });
        S.sparkBurst(m.x, m.y + this.gunZ, 1, '#bff3ff');
      }
      if (key === 'necro' && Math.random() < dt * 30) {
        const a = Math.random() * Math.PI * 2;
        S.mote(this.x + this.facing * 7 + Math.cos(a) * 16, this.y - 12 + Math.sin(a) * 8, Math.random() < 0.5 ? '#c45cff' : '#f3c9ff');
      }
      if (key === 'genji' && t > 0.12 && Math.random() < dt * 28) S.mote(this.x + this.facing * 5 + (Math.random() - 0.5) * 3, this.y - 10 - Math.random() * 20, Math.random() < 0.5 ? '#8dff8a' : '#f2fff0');
    }
    const lift = w.reloading && (key === 'tesla' || key === 'ray') ? -Math.sin(Math.PI * Math.min(1, t * 1.1)) * 0.22 : 0;   // dipped a little to crank / vent
    const tilt = w.raising * RAISE_TILT + lift;
    this.tilt += (tilt - this.tilt) * Math.min(1, dt * 16);
    this.triggerHeld = controls.fire;
    specAct(w, this, dt, controls, this.env.spec);
  }

  updateGun(dt, controls) {
    const w = this.weapon;
    if (w.def.spec) return this.updateSpec(dt, controls);
    if (controls.reload && !this.using) w.startReload();
    w.update(dt);
    for (const e of w.events) this.reloadEvent(e);
    let tilt = !w.reloading ? 0
      : w.def.reload === 'shells' ? SHELL_TILT
      : w.def.reload === 'steps' ? (w.openAngle / w.def.openAngle) * STEP_TILT
      : Math.sin(Math.PI * Math.min(1, w.reload * 1.15)) * RELOAD_TILT;
    tilt += w.raising * RAISE_TILT;
    this.tilt += (tilt - this.tilt) * Math.min(1, dt * 16);

    // semi-auto guns need the trigger released between shots; a burst finishes on its own
    const pull = !this.using && ((controls.fire && ((w.def.auto && !w.def.burst) || !this.triggerHeld)) || w.burstLeft > 0);
    this.triggerHeld = controls.fire;
    if (pull) {
      const pre = this.gunPose(this.x, this.y);   // where the barrel points before this shot's kick
      if (w.tryFire() === 'fired') this.shoot(pre);
    }
  }

  updateMelee(dt, controls) {
    const m = this.melee;
    this.triggerHeld = controls.fire;
    if (controls.reload && m.def.battery && !this.using && (this.infinite || this.inventory.countId('battery') > 0)) m.startReload();
    if (controls.fire && !this.using) m.attack();
    m.update(dt);
    for (const e of m.events) {
      if (e === 'battOut') {
        // the flat pack drops out of the back
        const g = this.gunPose(this.x, this.y), p = this.gunPoint(g, { x: m.art.packAt.x - 4, y: m.art.packAt.y + 2 }), z = this.gunZ;
        this.particles.gib(m.art.pack, p.x, p.y + z, z, -this.facing * 14, 3, 12);
      } else if (e === 'battIn') {
        if (this.infinite || this.inventory.takeId('battery', 1) > 0) m.charge = 100;
        m.recoil = 1.5;   // clicked home
      }
    }
    this.tilt += (m.raising * RAISE_TILT - this.tilt) * Math.min(1, dt * 16);
    for (const s of this.slashes) s.t += dt;
    this.slashes = this.slashes.filter((s) => s.t < s.life);
    if (m.events.includes('strike')) this.strike(m);
    if (!m.striking) return;
    // the swing hits whatever is in its arc (main.js decides what that is)
    if (m.def.style !== 'saw' || m.events.includes('tick')) this.env.meleeHit?.(this, m);
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

  // Swap in a melee weapon (slot 1) and take it out. Returns the one it
  // replaced (to stow or drop), or null if that was bare fists.
  giveMelee(def) {
    return this.setMelee(new MeleeWeapon(def), true);
  }

  // Put a melee weapon (or null: bare fists) in slot 1. Returns the old one.
  setMelee(m, takeOut = false) {
    const old = this.melee.def.fists ? null : this.melee;
    this.melee = m ?? new MeleeWeapon(FISTS);
    this.melee.drawT = 0.25;
    if (takeOut) this.meleeOut = true;
    this.settle = SETTLE_TIME;
    return old;
  }

  // Put a gun in a particular slot (0 = slot 2, 1 = slot 3) and take it out.
  equipGun(def, slot) {
    const w = new (isSpec(def) ? SpecWeapon : Weapon)(def);
    w.ammoSource = this.ammoSource;
    const i = Math.max(0, Math.min(1, slot));
    const old = this.weapons[i];
    if (old && old.ammo > 0) old.ammoSource?.give(old.def.caliber, old.ammo);
    this.weapons[i] = w;
    this.slot = i;
    this.meleeOut = false;
    this.settle = SETTLE_TIME;
    return w;
  }

  setAmmoSource(src) {
    this.ammoSource = src;
    for (const w of this.weapons) if (w) w.ammoSource = src;
  }

  owns(def) {
    return this.weapons.find((w) => w?.def === def);
  }

  // Pick up a new gun: fills an empty slot, otherwise replaces the one in
  // hand. Returns the gun it replaced (the caller stows or drops it), or null.
  giveWeapon(def) {
    const w = new (isSpec(def) ? SpecWeapon : Weapon)(def);
    let i = this.weapons.indexOf(null), old = null;
    if (i < 0) {
      i = this.meleeOut ? 0 : this.slot;
      old = this.weapons[i];
      old.cancelReload();
    }
    w.ammoSource = this.ammoSource;
    this.weapons[i] = w;
    this.slot = i;
    this.meleeOut = false;
    this.settle = SETTLE_TIME;
    return old;
  }

  // Put a gun (out of a bag, off the floor, or null to empty it) in slot i.
  // Returns the gun that was there.
  setGun(i, w) {
    const old = this.weapons[i];
    old?.cancelReload();
    const hadGuns = this.weapons.some(Boolean);
    this.weapons[i] = w;
    if (w) {
      w.ammoSource = this.ammoSource;
      w.drawT = 0.3;
      if (!hadGuns || (!this.meleeOut && this.slot === i)) {
        this.slot = i;   // it's the only gun, or it replaces the one in hand: take it out
        this.meleeOut = false;
      }
    }
    this.fixHands();
    return old;
  }

  // The slot in hand went empty: take out the other gun, or the melee weapon.
  fixHands() {
    if (this.weapons[this.slot]) return;
    const j = this.weapons.findIndex(Boolean);
    if (j >= 0) this.slot = j;
    else this.meleeOut = true;
  }

  // New round: a box of ammo for each gun you carry, and a grenade.
  resupply() {
    for (const w of this.weapons) if (w) this.inventory.give(w.def.caliber, Math.ceil(w.magSize * 1.5));
    this.inventory.add(newItem('grenade', 1));
  }

  // Frost: slowed for t seconds.
  chill(t) {
    this.slowT = Math.max(this.slowT ?? 0, t);
  }

  // Damage over time from fire / gas / acid (armor doesn't help, no knockback).
  burn(amount, kind) {
    if (this.dead || this.god) return;
    this.hp -= amount;
    this.hurtTime = Math.min(this.hurtTime, 0.4);
    this.burnKind = kind;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
  }

  hurt(damage, fromX, fromY, knock = 160) {
    if (this.dead || this.invuln > 0 || this.god || (this.roll && this.roll.t < ROLL_SAFE) || this.dash?.safe) return false;
    // armor soaks part of the hit while it lasts
    for (const slot of ['armor', 'helmet']) {
      const a = this.inventory.equip[slot];
      if (!a || a.durability <= 0) continue;
      const soaked = damage * a.def.armor;
      a.durability = Math.max(0, a.durability - soaked * 1.5);
      damage -= soaked;
    }
    this.hp -= damage;
    this.hurtTime = 0;
    this.invuln = HURT_INVULN;
    this.using = null;
    const dx = this.x - fromX, dy = this.y - fromY, d = Math.hypot(dx, dy) || 1;
    this.vx += (dx / d) * knock;
    this.vy += (dy / d) * knock;
    this.particles.blood(this.x, this.y, 12, dx / d, dy / d, 8);
    this.env.kick((dx / d) * 4, (dy / d) * 4);
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.particles.blood(this.x, this.y, 10, 0, 1, 20);
    }
    return true;
  }

  // ---------- collision ----------

  moveX(world, dx, inputY, dt) {
    if (!dx) return;
    const nx = this.x + dx;
    const hits = world.solidsIn(this.box(nx, this.y));
    if (!hits.length) {
      this.x = nx;
      return;
    }
    if (Math.abs(inputY) < 0.3 && this.nudge(world, nx, this.y, 0, 1, dt)) return;
    this.x = dx > 0 ? Math.min(...hits.map((h) => h.l)) - HALF_W : Math.max(...hits.map((h) => h.r)) + HALF_W;
    this.vx = 0;
  }

  moveY(world, dy, inputX, dt) {
    if (!dy) return;
    const ny = this.y + dy;
    const hits = world.solidsIn(this.box(this.x, ny));
    if (!hits.length) {
      this.y = ny;
      return;
    }
    if (Math.abs(inputX) < 0.3 && this.nudge(world, this.x, ny, 1, 0, dt)) return;
    this.y = dy > 0 ? Math.min(...hits.map((h) => h.t)) : Math.max(...hits.map((h) => h.b)) + HEIGHT;
    this.vy = 0;
  }

  // Clipping a corner by a few pixels? Slide around it instead of stopping dead.
  nudge(world, nx, ny, ax, ay, dt) {
    for (let n = 1; n <= NUDGE; n++) {
      for (const s of [-1, 1]) {
        if (world.solidsIn(this.box(nx + ax * s * n, ny + ay * s * n)).length) continue;
        const slide = Math.min(n, MAX_SPEED * dt);
        const sx = this.x + ax * s * slide, sy = this.y + ay * s * slide;
        if (world.solidsIn(this.box(sx, sy)).length) continue;
        this.x = sx;
        this.y = sy;
        return true;
      }
    }
    return false;
  }

  // ---------- animation ----------

  animate(dt, moving) {
    const state = moving ? 'walk' : 'idle';
    if (state !== this.state) {
      if (state === 'walk') this.kickDust(3);
      else this.settle = SETTLE_TIME;
      this.state = state;
      this.animTime = 0;
      this.frame = -1;
    }
    this.settle = Math.max(0, this.settle - dt);

    const pose = this.pose;
    pose.headX = 0;
    if (state === 'walk') {
      // cadence follows actual speed so pushing into a wall shuffles slowly
      const speed = Math.min(SPRINT, Math.hypot(this.vx, this.vy) / MAX_SPEED);
      // walking away from where we aim plays the cycle backwards so the feet still push the right way
      const backward = this.vx * this.facing < -10;
      this.animTime += (backward ? -1 : 1) * dt * (0.55 + 0.45 * speed);
      const n = WALK_BODY.length;
      const f = ((Math.floor(this.animTime * WALK_FPS) % n) + n) % n;
      if (f !== this.frame) {
        this.frame = f;
        if (STEP_FRAMES[f]) this.footstep(STEP_FRAMES[f]);
      }
      const side = Math.abs(this.vx) / (Math.hypot(this.vx, this.vy) || 1);
      [pose.legL, pose.legR] = walkLegs(f, side);
      pose.body = WALK_BODY[f];
      pose.head = WALK_HEAD[f];
      if (side > 0.6 && Math.abs(this.vx) > 20 && !backward) pose.headX = 1;  // lean into the walk
    } else {
      this.animTime += dt;
      this.frame = this.animTime % IDLE_PERIOD < IDLE_PERIOD / 2 ? 0 : 1;
      pose.legR = [0, 0];
      pose.legL = [0, 0];
      pose.body = 0;
      pose.head = this.frame;
    }
    if (this.settle > 0) pose.body = pose.head = 1;
  }

  moveDir() {
    const sp = Math.hypot(this.vx, this.vy);
    return sp > 1 ? { x: this.vx / sp, y: this.vy / sp } : { x: this.facing, y: 0 };
  }

  footstep(side) {
    const dir = this.moveDir();
    const footDx = (side === 'L' ? this.pose.legL : this.pose.legR)[0];
    this.particles.dust(this.x + (FOOT_X[side] + footDx) * this.facing, this.y - 1, 1 + (Math.random() < 0.5), dir.x, dir.y);
  }

  kickDust(count) {
    const dir = this.moveDir();
    this.particles.dust(this.x - dir.x * 3, this.y - 1, count, dir.x, dir.y);
  }

  // ---------- gun geometry ----------

  // Where the gun sits when the feet are at (x, y): grip point, angle, and
  // vertical flip (so the gun isn't upside down when aiming left).
  // base: the aim before climb / tilt (zeroed on the cursor, see zeroAim).
  gunPose(x, y) {
    const w = this.held;
    // a melee weapon sits in its stance facing the way you face, and only
    // swings round to the cursor while it attacks (engage)
    const front = this.facing > 0 ? 0 : Math.PI;
    const stance = this.meleeOut || w.def.stance;   // held in a stance (melee, the dragonblade) till it strikes
    const base = stance ? front + wrapAngle(this.aim - front) * w.engage : this.zeroAim(x, y);
    const a = base - (w.climb + this.tilt + (this.meleeOut ? 0 : this.wallTilt)) * this.facing;
    const reach = GUN_REACH - w.recoil - (w.reloading ? 1 : 0);
    const rest = w.def.restHeight ?? STANCE_HEIGHT;
    const h = stance ? rest + (GUN_HEIGHT - rest) * w.engage : GUN_HEIGHT;   // waist at rest (knives: chest), chest to strike
    const px = x + this.facing, py = y - h + this.pose.body;
    const flip = this.facing * (this.meleeOut && w.flipped ? -1 : 1);   // turned over for an upward swing
    return { x: px + Math.cos(a) * reach, y: py + Math.sin(a) * reach, a, base, flip };
  }

  // A point given in gun pixels, in world space.
  gunPoint(g, pt) {
    const grip = this.held.art.points.grip;
    const lx = pt.x - grip.x, ly = (pt.y - grip.y) * g.flip;
    const c = Math.cos(g.a), s = Math.sin(g.a);
    return { x: g.x + lx * c - ly * s, y: g.y + lx * s + ly * c };
  }

  // A direction given in gun space (e.g. "up and back out of the port"), in world space.
  gunDir(g, dx, dy) {
    const ly = dy * g.flip, c = Math.cos(g.a), s = Math.sin(g.a);
    return { x: dx * c - ly * s, y: dx * s + ly * c };
  }

  // A body-local point (facing right, feet at 0,0) in world space.
  bodyPoint(x, y, pt) {
    return { x: x + (this.facing < 0 ? 1 - pt.x : pt.x), y: y + pt.y + this.pose.body };
  }

  // Charging handle / slide / bolt handle, wherever this gun has one.
  get handlePoint() {
    const art = this.weapon.art, p = art.parts;
    if (art.points.handle) return art.points.handle;
    if (p.handle) return { x: p.handle.x + 1, y: p.handle.y };
    if (p.slide) return { x: p.slide.x + 1, y: p.slide.y + 1 };
    return art.points.support;
  }

  // Muzzle height above the ground (for bullets/lights fired from the gun).
  get gunZ() {
    return GUN_HEIGHT - this.pose.body;
  }

  // How much to converge on the cursor: 1 with it well out in front, easing to
  // 0 with it right by the gun - there the gun and the shots just run
  // parallel to the line towards the cursor instead of cutting across it.
  zeroWeight() {
    const t = this.aimTarget, w = this.weapon;
    if (!t || !w) return 0;
    const o = this.aimOrigin(), d = Math.hypot(t.x - o.x, t.y - o.y);
    const near = GUN_REACH + (w.muzzle.x - w.art.points.grip.x) + 16;
    const k = Math.max(0, Math.min(1, (d - near) / 48));
    return k * k * (3 - 2 * k);
  }

  // The angle that runs the gun's aiming line through the cursor: the laser
  // when one is on, otherwise the barrel. Both sit a few pixels off the line
  // from the gun's pivot, so pointing the pivot at the cursor would aim high.
  zeroAim(x, y) {
    const t = this.aimTarget, w = this.weapon, k = this.zeroWeight();
    if (!t || !w || k <= 0) return this.aim;
    const line = this.laserOn ? w.laserEmitter : w.muzzle, L = (line.y - w.art.points.grip.y) * this.facing;
    const reach = GUN_REACH - w.recoil - (w.reloading ? 1 : 0);
    const px = x + this.facing, py = y - GUN_HEIGHT + this.pose.body;
    let a = this.aim;
    for (let i = 0; i < 2; i++) {
      const dx = t.x - (px + Math.cos(a) * reach), dy = t.y - (py + Math.sin(a) * reach), D = Math.hypot(dx, dy);
      if (D <= Math.abs(L) + 1) return this.aim;
      a = Math.atan2(dy, dx) - Math.asin(L / D);
    }
    return this.aim + wrapAngle(a - this.aim) * k;
  }

  // Which way a shot from muzzle point m (gun pose g) goes. Far enough out,
  // at the cursor - or, with a laser, at its dot - keeping only part of the
  // climb from earlier shots (g.a - g.base) so a long burst creeps up some.
  // Right by the gun it simply goes along the barrel. The laser is drawn
  // along the barrel too, so with it on the shots follow it exactly.
  shotDir(g, m) {
    const t = this.aimTarget, k = this.zeroWeight();
    if (!t || k <= 0) return g.a;
    let a;
    if (this.laserOn) {
      // at the laser's dot: the point on the laser line as far out as the cursor
      const e = this.gunPoint(g, this.weapon.laserEmitter), d = Math.hypot(t.x - e.x, t.y - e.y);
      a = Math.atan2(e.y + Math.sin(g.a) * d - m.y, e.x + Math.cos(g.a) * d - m.x);
    } else {
      a = Math.atan2(t.y - m.y, t.x - m.x);
      if (Math.cos(a - g.a) <= 0.6) return g.a;
      a += (g.a - g.base) * CLIMB_KEEP;
    }
    return g.a + wrapAngle(a - g.a) * k;
  }

  // The rail light / laser is switched on (F), and there is one on the gun in hand.
  get laserOn() {
    return this.lightOn && !this.meleeOut && this.weapon.hasLaser;
  }

  shoot(g) {
    const w = this.weapon, d = w.def;
    const m = this.gunPoint(g, w.muzzle);
    const z = this.gunZ;
    const pellets = d.pellets ?? 1;
    const dir = this.shotDir(g, m);
    // with the laser on, the first shot or two after a pause go dead on the
    // dot (a shotgun's pattern centres on it); after that the gun's own spread
    const wobble = this.laserOn && w.heat <= LASER_TRUE_SHOTS ? 0 : 1;
    for (let i = 0; i < pellets; i++) {
      // pellets fan out evenly (with jitter); single bullets just wobble - all along the barrel
      const spread = pellets > 1 ? ((i / (pellets - 1)) * 2 - 1 + (Math.random() - 0.5) * 0.4) * w.spread : (Math.random() * 2 - 1) * w.spread * wobble;
      const speed = d.bulletSpeed * (pellets > 1 ? 0.85 + Math.random() * 0.3 : 1);
      this.env.bullets.spawn(m.x, m.y + z, z, dir + spread, speed, w.damage, d.range, d.pierce ?? 0);
    }
    if (!d.action && !d.keepsShells) this.ejectShell(g);
    if (!w.suppressed) this.particles.smoke(m.x, m.y + z, z, Math.cos(g.a), Math.sin(g.a), d.pellets ? 5 : 2);
    this.env.kick(-Math.cos(g.a) * w.shake, -Math.sin(g.a) * w.shake);
    this.muzzleLight = w.suppressed ? 0.03 : 0.06;
    this.muzzle = { x: m.x, y: m.y };
  }

  // The spent case flies out of the ejection port: up and a little back, spinning.
  ejectShell(g) {
    const w = this.weapon, p = this.gunPoint(g, w.art.points.port), z = this.gunZ;
    const dir = this.gunDir(g, -0.35 - Math.random() * 0.3, -1);
    // its height is measured from the floor at your feet, so it lands on your shadow's line
    const floor = this.y + Math.random() * 3;
    this.particles.eject(p.x, floor, floor - p.y, dir.x, dir.y, w.art.shell);
  }

  reloadEvent(name) {
    const w = this.weapon, g = this.gunPose(this.x, this.y), z = this.gunZ;
    if (name === 'eject') {
      this.ejectShell(g);
    } else if (name === 'dump') {
      // broken open: every spent case comes out of the breech at once - the
      // double's extractors flip them back over the shoulder, the revolver's
      // just drop out of the tipped cylinder
      const p = this.gunPoint(g, this.breakPoint(w.art.points.breech)), n = Math.min(8, w.spentIn ?? 0);
      for (let i = 0; i < n; i++) {
        const dir = w.art.revolver ? this.gunDir(g, -0.3 + Math.random() * 0.3, 0.6) : this.gunDir(g, -1, -0.8 - Math.random() * 0.4);
        const floor = this.y + Math.random() * 3;
        this.particles.eject(p.x, floor, floor - p.y, dir.x, dir.y, w.art.shell, w.art.revolver ? 0.4 : 0.8);
      }
      w.spentIn = 0;
    } else if (name === 'load' || name === 'loadAll') {
      w.recoil = 0.8;
    } else if (name === 'close') {
      w.recoil = 1.5;       // snapped shut
      w.climb = 0.12;
    } else if (name === 'shellIn' || name === 'action') {
      w.recoil = 1;
    } else if (name === 'magOut') {
      // the empty mag (the actual sprite) tumbles to the floor and stays there
      const p = this.gunPoint(g, w.art.points.magwell);
      if (w.magImg) this.particles.gib(w.magImg, p.x, p.y + z + 2, z - 2, this.facing * 12, 4, 10);
    } else if (name === 'magIn') {
      w.recoil = 1.5;       // slap the mag home
    } else if (name === 'rack') {
      w.recoil = 2;
      w.climb = -0.15;
    }
  }

  // A gun point on a part that swings open on the hinge (break actions), where it is now.
  breakPoint(pt) {
    const w = this.weapon, h = w.art.hinge, a = w.openAngle;
    if (!h || !a) return pt;
    const dx = pt.x - h.x, dy = pt.y - h.y, c = Math.cos(a), s = Math.sin(a);
    return { x: h.x + dx * c - dy * s, y: h.y + dx * s + dy * c };
  }

  // Where the loading hand is during a reload (world space), what it holds,
  // and whether that's going in under the gun right now (`under`: a shell
  // pushed into the loading port / chamber disappears inside the gun).
  // Usually that's the support hand; guns loaded through the top of the
  // receiver (M1887, Kar98k) rest on the forend in the support hand while
  // the trigger hand feeds the rounds in (`trigger`).
  reloadHand(x, y, g) {
    const w = this.weapon, d = w.def, t = w.reload, pts = w.art.points, hp = this.handlePoint;
    // shells go in from below (tube loading port) or through the top of the receiver
    const port = d.loadFrom === 'top' ? { x: pts.port.x, y: pts.port.y + 1 } : pts.magwell;
    const points = {
      rest: this.gunPoint(g, d.loadFrom === 'top' ? pts.grip : pts.support),
      well: this.gunPoint(g, d.loadFrom === 'top' ? { x: port.x, y: port.y - 5 } : { x: port.x, y: port.y + 3 }),
      wellUp: this.gunPoint(g, port),
      belt: this.bodyPoint(x, y, BELT),
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
    const a = points[k0], b = points[k1];
    // what's in the hand: a shell / round / speedloader, or the fresh mag (its sprite)
    let holding = null;
    if (steps) holding = HELD[d.holding.find(([from, to]) => t > from && t < to)?.[2]] ?? null;
    else if (shells) holding = t > 0.36 && t < SHELL_IN ? (d.cls === 'shotgun' ? HELD.shell : HELD.round).img : null;
    else holding = t > 0.38 && t < 0.58 ? w.magImg : null;
    if (holding && !(holding instanceof HTMLCanvasElement)) holding = holding.img;
    const under = !!holding && (k1 === 'wellUp' || k1 === 'breech') && k > 0.45;
    let pose = reloadPose(k0, k1, k);
    if (d.loadFrom === 'top' && pose === 'support') pose = 'trigger';   // back on the grip
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, holding, under, pose, trigger: d.loadFrom === 'top' };
  }

  // Weapon light: where the beam starts (on screen, at the gun) and where it
  // points - only with a flashlight on the gun's rail (null otherwise).
  flashlight() {
    if (this.meleeOut || !this.lightOn || !this.weapon.hasLight) return null;
    const g = this.gunPose(this.x, this.y);
    const p = this.gunPoint(g, this.weapon.lightEmitter);
    return { x: p.x, y: p.y, angle: g.a };
  }

  // Laser sight: straight out of the laser module along the gun (which is
  // zeroed so this line crosses the cursor); z is its height off the floor.
  laser() {
    if (this.dead || !this.laserOn) return null;
    const g = this.gunPose(this.x, this.y), e = this.gunPoint(g, this.weapon.laserEmitter);
    return { x: e.x, y: e.y, angle: g.a, z: this.gunZ };
  }

  // ---------- drawing ----------

  draw(ctx, renderer) {
    const x = renderer.snap(this.x), y = renderer.snap(this.y);
    if (this.dead) {
      this.drawDead(ctx, x, y);
      return;
    }
    if (this.roll) return this.drawRoll(ctx, x, y);
    // flicker while invulnerable after a hit
    if (this.invuln > 0 && Math.floor(this.invuln * 20) % 2) ctx.globalAlpha = 0.45;
    // the gun and hands always draw over the body so they never disappear
    this.drawBody(ctx, x, y);
    this.drawGun(ctx, x, y);
    ctx.globalAlpha = 1;
    // melee waves go in with you (lit and darkened like you, hidden by what's in front)
    this.drawEffects(ctx);
    this.env.spec?.drawSpins(ctx, this);
  }

  // A dodge roll: the whole character (gun and all) drawn off to the side, then
  // turned one full somersault about the middle of the body, squashed into a
  // ball mid-turn and dropped low. Behind it: cyan afterimages of where it just
  // was, speed streaks trailing back along the dash, and spin lines curling round.
  drawRoll(ctx, x, y) {
    const r = this.roll, [c, rc] = this.rollCanvas, [gc, gx] = this.rollGhost;
    const FX = 32, FY = 46, MID = 10;   // feet on the off-screen canvas; spin about MID px up
    rc.clearRect(0, 0, 64, 64);
    this.drawBody(rc, FX, FY);
    this.drawGun(rc, FX, FY);
    // a flat cyan copy for the afterimages
    gx.globalCompositeOperation = 'copy';
    gx.drawImage(c, 0, 0);
    gx.globalCompositeOperation = 'source-atop';
    gx.fillStyle = '#7fe3ff';
    gx.fillRect(0, 0, 64, 64);
    const pose = (t) => {
      const k = smooth(Math.min(1, t / 0.9)), curl = Math.sin(Math.PI * Math.min(1, t / 0.9));
      return { spin: Math.round((r.spin * k * Math.PI * 2) / (Math.PI / 8)) * (Math.PI / 8), curl };   // 16 steps a turn
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
    const ox = x - this.x, oy = y - this.y;   // world -> snapped draw offset
    // speed streaks: a few pixel lines trailing back from the ball, longer at the start
    const fast = 1 - r.t, back = { x: -r.dx, y: -r.dy };
    if (fast > 0.15) {
      for (const [side, len, col] of [[-6, 16, '#ffffff'], [-2, 24, '#bff2ff'], [3, 20, '#ffffff'], [7, 12, '#7fe3ff']]) {
        const L = Math.round(len * fast), sx = x + back.x * 8 - r.dy * side, sy = y - MID + back.y * 8 + r.dx * side;
        ctx.fillStyle = col;
        for (let i = 0; i < L; i++) if (i % 7 !== 5) ctx.fillRect(Math.round(sx + back.x * i), Math.round(sy + back.y * i), 1, 1);
      }
    }
    // afterimages, fading the further back they are
    for (const [n, a] of [[6, 0.18], [4, 0.3], [2, 0.45]]) {
      const g = r.trail[n];
      if (!g) continue;
      ctx.globalAlpha = a * (1 - r.t * 0.5);
      put(gc, Math.round(g.x + ox), Math.round(g.y + oy), g.t);
    }
    ctx.globalAlpha = 1;
    const p = put(c, x, y, r.t);
    // spin lines: two arcs of pixels sweeping round behind the turn
    if (p.curl > 0.25) {
      const R = 13;
      for (const [off, len, col] of [[0, 1.8, '#ffffff'], [Math.PI, 1.2, '#9fe9ff']]) {
        ctx.fillStyle = col;
        for (let i = 0; i < 16; i++) {
          if (i % 5 === 4 && len < 1.5) continue;   // the shorter one breaks up
          const a = p.spin + off - r.spin * (i / 16) * len - Math.PI / 2;
          ctx.fillRect(Math.round(x + Math.cos(a) * R), Math.round(p.cy + Math.sin(a) * (R - 2)), 1, 1);
        }
      }
    }
  }

  // On the floor, under everything standing (see main.js).
  drawShadow(ctx, renderer) {
    ctx.drawImage(this.shadow, renderer.snap(this.x) - 6, renderer.snap(this.y) - 3);
  }

  // Enter gun space at gun pose g: origin on the grip, +x along the barrel.
  enterGun(ctx, g, x = g.x, y = g.y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(g.a);
    ctx.scale(1, g.flip);
  }

  // Melee weapon in hand: trigger hand on the grip, the other hand further
  // up the handle (two-handed) or hanging by the body.
  drawMelee(ctx, x, y) {
    const m = this.melee, g = this.gunPose(x, y), pts = m.art.points, grip = pts.grip;
    if (m.def.fists) {
      // bare hands in a guard; the punching hand whips out along its path
      for (const hand of ['L', 'R']) {
        const f = this.fistPoint(x, y, hand);
        drawHand(ctx, 'open', Math.round(f.x), Math.round(f.y));
      }
      return;
    }
    if (m.reloading) return this.drawBatterySwap(ctx, x, y, g);
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

  // A battery swap: the other hand pulls the flat pack out of the back, fetches
  // a fresh one from the belt, pushes it in, and goes back to the top handle.
  drawBatterySwap(ctx, x, y, g) {
    const m = this.melee, pts = m.art.points, grip = pts.grip, t = m.reload;
    const slot = this.gunPoint(g, { x: m.art.packAt.x + 1, y: m.art.packAt.y + 2 });
    const points = { rest: this.gunPoint(g, pts.support), slot, out: this.gunPoint(g, { x: m.art.packAt.x - 5, y: m.art.packAt.y + 2 }), belt: this.bodyPoint(x, y, BELT) };
    const path = [[0, 'rest'], [0.1, 'slot'], [0.18, 'out'], [0.3, 'belt'], [0.42, 'belt'], [0.62, 'out'], [0.78, 'slot'], [0.9, 'rest'], [1, 'rest']];
    let i = 0;
    while (i < path.length - 2 && t > path[i + 1][0]) i++;
    const [t0, k0] = path[i], [t1, k1] = path[i + 1], k = smooth(Math.min(1, Math.max(0, (t - t0) / (t1 - t0))));
    const a = points[k0], b = points[k1], hx = a.x + (b.x - a.x) * k, hy = a.y + (b.y - a.y) * k;
    this.enterGun(ctx, g);
    m.draw(ctx);
    drawHand(ctx, 'trigger', 0, 0);
    ctx.restore();
    this.enterGun(ctx, g, hx, hy);
    if (t > 0.38 && t < 0.65) ctx.drawImage(m.art.pack, -Math.round(m.art.pack.width / 2), -m.art.pack.height + 2);   // the fresh pack
    drawHand(ctx, t < 0.06 || t > 0.9 ? 'support' : t < 0.2 || (t > 0.62 && t < 0.8) ? 'grab' : 'open', 0, 0);
    ctx.restore();
  }

  // Spec weapons in hand. The ODM gear: a blade in each hand, gas canisters on
  // the back of the hips. The book: held up flat on one palm, the other hand
  // raised over it while it reads. The rest: like a gun.
  drawSpec(ctx, x, y) {
    const w = this.weapon, pts = w.art.points, grip = pts.grip, key = w.def.key;
    let g = this.gunPose(x, y);
    if (key === 'odm') return this.drawODM(ctx, x, y, g);
    if (key === 'genji' && w.reloading) return this.drawChannel(ctx, x, y, g);
    if (w.art.book) {
      this.enterBook(ctx, x, y);
      w.draw(ctx);
      w.drawFlash(ctx);   // its glow goes in with the rest of you, so walls in front hide it
      drawHand(ctx, 'open', 1, 1);
      ctx.restore();
      if (w.state.cast || w.reloading) {
        // the other hand raised over the open book (reading it, or the ritual)
        const q = this.bodyPoint(x, y, { x: 12, y: -18 + Math.round(Math.sin(w.t * 18)) - (w.reloading ? 2 : 0) });
        drawHand(ctx, 'open', q.x, q.y);
      } else {
        const q = this.bodyPoint(x, y, { x: -4, y: -8 });
        drawHand(ctx, 'open', q.x, q.y);
      }
      return;
    }
    if (key === 'ray' && Math.abs(x - this.x) < 2 && Math.abs(y - this.y) < 2) {
      // the beam leaves from the muzzle where the gun is drawn; then the gun itself
      // judders while it fires (the beam holds still)
      this.rayMuzzle = this.gunPoint(g, w.muzzle);
      this.rayA = g.a;
      const s = w.firing ? w.state.spin ?? 0 : 0;
      if (s > 0.3) g = { ...g, x: g.x + Math.round(Math.random() * 2 - 1) * 0.5, y: g.y + Math.round(Math.random() * 2 - 1) * 0.5, a: g.a + (Math.random() - 0.5) * 0.06 * s };
    }
    this.enterGun(ctx, g);
    const behind = key === 'genji';
    if (behind) drawHand(ctx, 'support', pts.support.x - grip.x, pts.support.y - grip.y);
    w.draw(ctx);
    w.drawFlash(ctx);
    drawHand(ctx, 'trigger', 0, 0);
    if (pts.support && !behind) {
      if (w.reloading && key === 'tesla') {
        // charging the lance: the other hand goes to the pack under it and cranks it round
        const k = Math.min(1, w.reload / 0.12, (1 - w.reload) / 0.12), a = w.reload * Math.PI * 10;
        const cx = 14 + Math.cos(a) * 1.5, cy = 11 + Math.sin(a) * 1.5;
        drawHand(ctx, k > 0.7 ? 'grab' : 'support', pts.support.x - grip.x + (cx - pts.support.x) * k, pts.support.y - grip.y + (cy - pts.support.y) * k);
      } else {
        drawHand(ctx, 'support', pts.support.x - grip.x, pts.support.y - grip.y);
      }
    }
    ctx.restore();
    if (!pts.support) {
      const q = this.bodyPoint(x, y, { x: -4, y: -8 });
      drawHand(ctx, 'open', q.x, q.y);
    }
  }

  // The Dragonblade's recharge: the blade comes up straight in front of the
  // face, the other hand in a two-finger sign beside it, and power climbs the edge.
  drawChannel(ctx, x, y, g) {
    const w = this.weapon, t = w.reload, f = this.facing;
    const up = smooth(Math.min(1, t / 0.16)) * (1 - smooth(Math.max(0, (t - 0.86) / 0.14)));
    const at = this.bodyPoint(x, y, { x: 5, y: -9 });
    const a = g.a + wrapAngle(-Math.PI / 2 - g.a) * up;
    this.enterGun(ctx, { a, flip: Math.cos(a) >= 0 ? 1 : -1 }, g.x + (at.x - g.x) * up, g.y + (at.y - g.y) * up);
    w.draw(ctx);
    w.drawFlash(ctx);
    drawHand(ctx, 'trigger', 0, 0);
    ctx.restore();
    const q = up > 0.6 ? this.bodyPoint(x, y, { x: 8, y: -15 + Math.round(Math.sin(w.t * 6)) }) : this.bodyPoint(x, y, { x: -4, y: -8 });
    drawHand(ctx, 'open', q.x, q.y);
    void f;
  }

  // ODM gear in hand: a blade in each hand on its cable. Ready stance: the main
  // blade toward the aim, the other held low and back. Flying: both swept back
  // behind you. Spinning: both whirl round with the slash. Recharging: the old
  // blades snap off, both handles go into the thigh boxes and come out with new
  // ones, flicked out with a glint.
  drawODM(ctx, x, y, g, layer = 'front') {
    const w = this.weapon, A = w.art, st = w.state, f = this.facing, grip = A.points.grip, t = w.reload;
    if (layer === 'front') this.drawGearPiece(ctx, A.box, this.bodyPoint(x, y, { x: 0, y: -5 }), 0.3);   // the near thigh's blade box
    // ready stance: both blades out toward the cursor - the main one level with
    // the aim, the other a little lower from the hip, the pair fanned like a pincer
    const breathe = Math.sin(w.t * 2.2) * 0.04;
    const guardMain = { x: g.x, y: g.y, a: g.a - 0.08 * f };
    const hip = this.bodyPoint(x, y, { x: -2, y: -6 });
    const guardOff = { x: hip.x + Math.cos(g.a) * 3, y: hip.y + Math.sin(g.a) * 3, a: g.a + (0.42 + breathe) * f };
    let main = guardMain, off = guardOff, bladed = true;
    const spin = st.spinFx && st.spinFx.t < st.spinFx.life ? spinHead(st.spinFx) : null;
    if (spin !== null) {
      // a real spin: arms flung out, both hands carried round you with the turn,
      // the blades out like spokes so their tips run along the slash
      const c = this.bodyPoint(x, y, { x: 0, y: -9 }), ca = Math.cos(spin), sa = Math.sin(spin);
      main = { x: c.x + ca * 6, y: c.y + sa * 4, a: spin };
      off = { x: c.x - ca * 6, y: c.y - sa * 4, a: spin + Math.PI };
    } else if (st.zip) {
      const back = Math.atan2(-this.vy, -this.vx);
      main = { ...guardMain, a: back - 0.3 };
      off = { ...guardOff, a: back + 0.3 };
    } else if (t >= 0) {
      // into the boxes and out again
      const into = smooth(Math.min(1, t / 0.14)), out = smooth(Math.min(1, Math.max(0, (t - 0.5) / 0.18)));
      const k = into * (1 - out), push = t > 0.16 && t < 0.5 ? 2 : 0;
      const boxN = this.bodyPoint(x, y, { x: 5, y: -6 + push }), boxF = this.bodyPoint(x, y, { x: 2, y: -6 + push });
      const mix = (from, to) => ({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, a: from.a + wrapAngle(Math.PI / 2 - from.a) * k });
      main = mix(guardMain, boxN);
      off = mix(guardOff, boxF);
      bladed = t < 0.14 || t >= 0.5;
    }
    const cable = (h) => {
      // the wire from the back of the handle to the reel at your hip
      const c = Math.cos(h.a), s = Math.sin(h.a), fl = c >= 0 ? 1 : -1;
      const ex = h.x - c * (grip.x + 1) + s * fl, ey = h.y - s * (grip.x + 1) - c * fl, hip = this.bodyPoint(x, y, { x: -5, y: -7 });
      ctx.fillStyle = '#2a2f36';
      const n = Math.max(1, Math.round(Math.hypot(hip.x - ex, hip.y - ey)));
      for (let i = 0; i <= n; i++) {
        const u = i / n, sag = Math.sin(u * Math.PI) * 2;
        ctx.fillRect(Math.round(ex + (hip.x - ex) * u), Math.round(ey + (hip.y - ey) * u + sag), 1, 1);
      }
    };
    const hand = (h) => {
      this.enterGun(ctx, { a: h.a, flip: Math.cos(h.a) >= 0 ? 1 : -1 }, Math.round(h.x), Math.round(h.y));
      ctx.drawImage(bladed ? A.img : A.handle, -grip.x, -grip.y);
      drawHand(ctx, 'trigger', 0, 0);
      // a fresh blade's glint as it's flicked out
      if (t > 0.66 && t < 0.8) {
        const gx = 26 - grip.x - Math.round((t - 0.66) / 0.14 * 14), gy = 2 - grip.y;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(gx, gy - 1, 1, 3);
        ctx.fillRect(gx - 1, gy, 3, 1);
      }
      ctx.restore();
    };
    // mid-spin, a blade on the far side of you goes behind your body
    const far = (h) => spin !== null && Math.sin(h.a) < -0.2;
    for (const h of [off, main]) {
      if ((layer === 'back') !== far(h)) continue;
      cable(h);
      hand(h);
    }
  }

  // A piece of gear worn on the body: centred on p, turned the way you face, tilted.
  drawGearPiece(ctx, img, p, tilt = 0) {
    ctx.save();
    ctx.translate(Math.round(p.x), Math.round(p.y));
    ctx.scale(this.facing, 1);
    ctx.rotate(tilt);
    ctx.drawImage(img, -Math.round(img.width / 2), -Math.round(img.height / 2));
    ctx.restore();
  }

  // Gear worn on the back, drawn behind the body: the ODM's gas tanks across
  // the back of the hips, its reel box, the far thigh's blade box.
  drawBackGear(ctx, x, y) {
    const w = this.weapon;
    if (this.meleeOut || w?.def.key !== 'odm') return;
    this.drawGearPiece(ctx, w.art.box, this.bodyPoint(x, y, { x: -2, y: -6 }), 0.3);
    this.drawGearPiece(ctx, w.art.tank, this.bodyPoint(x, y, { x: -8, y: -10 }), -0.12);
    this.drawGearPiece(ctx, w.art.tank, this.bodyPoint(x, y, { x: -7, y: -7 }), -0.12);
    this.drawGearPiece(ctx, w.art.reel, this.bodyPoint(x, y, { x: -5, y: -9 }));
    this.drawODM(ctx, x, y, this.gunPose(x, y), 'back');   // blades swung round behind you mid-spin
  }

  // The book is held level (it doesn't turn with the aim), out in front at chest
  // height - lifted up during the ritual.
  enterBook(ctx, x, y) {
    const w = this.weapon, up = w.reloading ? Math.sin(Math.PI * Math.min(1, w.reload * 1.05)) : 0;
    // held low on the palm in front (clear of the face); the ritual holds it out further, floating
    const p = this.bodyPoint(x, y, { x: 8 + Math.round(up * 3), y: -5 });
    const lift = Math.round(up * 3 + (w.reloading ? Math.sin(w.t * 5) : 0));
    ctx.save();
    ctx.translate(p.x, p.y + Math.round(w.raising * 4) - lift);
    ctx.scale(this.facing, 1);
  }

  drawGun(ctx, x, y) {
    if (this.meleeOut) return this.drawMelee(ctx, x, y);
    if (this.weapon.def.spec) return this.drawSpec(ctx, x, y);
    const w = this.weapon, g = this.gunPose(x, y), pts = w.art.points, grip = pts.grip;
    const reloading = w.reloading;
    const h = reloading ? this.reloadHand(x, y, g) : null;
    if (h?.under) {
      // a round being pushed into the gun goes in under its art, so it vanishes inside
      this.enterGun(ctx, g, h.x, h.y);
      ctx.drawImage(h.holding, -Math.round(h.holding.width / 2), -h.holding.height + 1);
      ctx.restore();
    }
    this.enterGun(ctx, g);
    const act = w.def.action && w.actionProgress >= 0 ? w.actionProgress : -1;
    // spin-cocking: the whole gun twirls once round the hand on the lever
    const spin = act >= 0 && w.def.action.spin ? Math.PI * 2 * smooth(Math.min(1, Math.max(0, (act - 0.08) / 0.8))) : 0;
    if (spin) {
      ctx.save();
      ctx.rotate(-spin);
    }
    w.draw(ctx);
    // trigger hand on the grip, finger along the guard
    if (act >= 0 && w.def.action.hand === 'handle') {
      // bolt guns: the firing hand leaves the grip, closes upright round the
      // bolt knob and works it; the other hand keeps holding the gun up
      const reach = smooth(Math.min(1, act / 0.2, (1 - act) / 0.2)), hp = this.handlePoint;
      drawHand(ctx, reach > 0.8 ? 'grab' : 'open', (hp.x - w.actionOffset - grip.x) * reach, (hp.y - grip.y) * reach);
    } else if (!h?.trigger) {
      drawHand(ctx, act >= 0 && w.def.action.part === 'lever' ? 'support' : 'trigger', 0, 0);   // fist round the lever
    }
    if (spin) ctx.restore();
    if (!reloading || h.trigger) {
      // support hand: rides the pump (still wrapped round it), lets go while the
      // gun spins, otherwise under the handguard
      let s = pts.support;
      if (act >= 0 && w.def.action.part === 'pump') s = { x: s.x - w.actionOffset, y: s.y };
      drawHand(ctx, spin ? 'open' : 'support', s.x - grip.x, s.y - grip.y);
    }
    ctx.restore();
    if (reloading) {
      // the loading hand travels in the world, still turned the same way as the gun
      this.enterGun(ctx, g, h.x, h.y);
      if (h.holding && !h.under) ctx.drawImage(h.holding, -Math.round(h.holding.width / 2), -h.holding.height + 1);
      drawHand(ctx, h.pose, 0, 0);
      ctx.restore();
    }
  }

  drawBody(ctx, x, y) {
    const P = this.parts, pose = this.pose, eq = this.inventory.equip;
    this.drawBackGear(ctx, x, y);
    enterFacing(ctx, x, y, this.facing);
    const ox = -ORIGIN_X, oy = -ORIGIN_Y;
    if (eq.backpack) ctx.drawImage(BACKPACK, ox, oy + pose.body);
    // feet stay on the ground; a lifted foot tucks up behind the body
    ctx.drawImage(P.legL, ox + pose.legL[0], oy - pose.legL[1]);
    ctx.drawImage(P.legR, ox + pose.legR[0], oy - pose.legR[1]);
    ctx.drawImage(P.body, ox, oy + pose.body);
    if (eq.armor) ctx.drawImage(VEST, ox, oy + pose.body);
    const head = this.blinkLeft > 0 ? P.headBlink : P.head;
    ctx.drawImage(head, ox + pose.headX, oy + pose.head);
    if (eq.helmet) ctx.drawImage(HELMET, ox + pose.headX, oy + pose.head);
    ctx.restore();
  }

  // The character in their gear, standing at the origin facing right (inventory screen).
  drawPreview(ctx) {
    const keep = { x: this.x, y: this.y, aim: this.aim, facing: this.facing, tilt: this.tilt, pose: this.pose };
    Object.assign(this, { x: 0, y: 0, aim: 0, facing: 1, tilt: 0, pose: { ...this.pose, body: 0, head: 0, headX: 0, legL: [0, 0], legR: [0, 0] } });
    this.drawBody(ctx, 0, 0);
    this.drawGun(ctx, 0, 0);
    Object.assign(this, keep);
  }

  drawDead(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y - 3);
    ctx.rotate(-Math.PI / 2 * this.facing);
    ctx.translate(-x, -(y - 3));
    this.drawBody(ctx, x, y);
    ctx.restore();
  }

  // A melee hit's effect, centred on the player (it follows the lunge). Drawn
  // pixel by pixel like the rest of the art; it fades out by dissolving.
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

  // Glowing bits drawn after lighting: the muzzle flash.
  // Melee hit effects (slash waves, thrust streaks, punch bursts). Drawn with
  // the rest of the scene, before lighting, so they're as dark as where they are.
  drawEffects(ctx) {
    if (this.dead || !this.meleeOut) return;
    for (const s of this.slashes) this.drawSlash(ctx, s);
  }

  drawEmissive(ctx, renderer) {
    // (a spec weapon's glow is drawn with the body instead, in depth order,
    // and lit by its own light - see SpecWorld.lights)
    if (this.dead || this.meleeOut || this.weapon.def.spec) return;
    const g = this.gunPose(renderer.snap(this.x), renderer.snap(this.y));
    this.enterGun(ctx, g);
    this.weapon.drawFlash(ctx);
    ctx.restore();
  }

  drawDebug(ctx) {
    const b = this.box();
    ctx.strokeStyle = '#4dff88';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(b.l, b.t, b.r - b.l, b.b - b.t);
    // gun points: muzzle (red), ejection port (yellow), light (white)
    if (this.meleeOut) return;
    const g = this.gunPose(this.x, this.y), w = this.weapon;
    for (const [pt, color] of [[w.muzzle, '#ff3030'], [w.art.points.port, '#ffd030'], [w.art.points.light, '#ffffff']]) {
      const p = this.gunPoint(g, pt);
      ctx.fillStyle = color;
      ctx.fillRect(p.x - 0.5, p.y - 0.5, 1, 1);
    }
  }
}
