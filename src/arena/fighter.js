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
import { MeleeWeapon, MELEE, FISTS, WIND, STRIKE } from '../combat/melee.js';
import { T, SOLID, PLAT, LADDER, ACID, LOW, LOW_H } from './level.js';
import { ORB, drawOrb, drawBolts, drawVoidHole } from './void.js';
import { drawFlame } from './flame.js';

// movement
export const GRAVITY = 720, WALK = 86, AIR_ACCEL = 650, JUMP = 290, JUMP2 = 250, PAD_JUMP = 430;   // (the bots work out their routes by these)
const MAX_FALL = 430, SPRINT = 1.85, ACCEL = 950, DECEL = 1250;
const CLIMB = 75, COYOTE = 0.09, BUFFER = 0.12;
export const MAX_STAMINA = 100;
const STAMINA_DRAIN = 17, STAMINA_REGEN = 24;   // a full bar runs for about 6 s
const WINDED_DELAY = 0.75, WINDED_UNTIL = 30;   // run out of stamina: this long before it refills, no running till it's this much
// the main game's dodge roll
const ROLL_TIME = 0.4, ROLL_SPEED = 250, ROLL_COST = 20, ROLL_COOLDOWN = 0.2, ROLL_SAFE = 0.8;
const ROLL_CROUCH_IN = 0.6;   // a roll heading in under something low stays down at least this long after
// the grapple (skill, Q): the line's speed and reach, how hard it reels in and
// how fast it can pull, how long it holds on at most, the wait between shots
// (three shots saved up, one coming back each GRAPPLE_CD, a short gap between them; aim within this much of someone and it locks on)
const GRAPPLE_SPEED = 1200, GRAPPLE_RANGE = 360, GRAPPLE_PULL = 2600, GRAPPLE_MAX = 430, GRAPPLE_TIME = 1.6, GRAPPLE_CD = 2.5, GRAPPLE_SHOTS = 3, GRAPPLE_GAP = 0.2, GRAPPLE_LOCK = 26;
const GRAPPLE_CUT = 48, SPIN_R = 30;   // reeled in through (or right up to) a foe: a spinning slash, this much to every foe this close
// the cloak (skill, Q): how long it lasts, the wait after it ends, the dash in
// to a stab (how far it reaches for someone, how fast), and a stab in the back
const CLOAK_TIME = 8, CLOAK_CD = 10, CLOAK_KILL = 0.4;   // (a kill with the stab: only this much of the wait)
export const LUNGE_RANGE = 64;
const LUNGE_SPEED = 420, CLOAK_SPEED = 1.2;   // (cloaked: a fifth quicker on its feet)
const ROLL_STAB_RANGE = 72;   // cloaked, a roll with a foe this close comes up stabbing them
const FLICKER_EVERY = 2.5, FLICKER_TIME = 0.2;   // cloaked: every so often the cloak glitches and shows you, for a moment
export const BACKSTAB = 4.5;
// the cloak's knife: held point down in a reverse grip, one stab (see melee.js)
const SHADE_KNIFE = MELEE.shade;
// the shadow clone (skill, Q): how long you're unseen, how long the double lasts, the wait after it's gone
const VEIL_TIME = 3, DECOY_LIFE = 10, DECOY_CD = 12;
export const SHADOW = '70, 92, 150';   // the shadow clone's colour (mist, dissolve)
// archery (skill, Q): how long the draw takes, how far it locks on, how many it can take at once, the wait after
const ARCH_CHARGE = 1, ARCH_RANGE = 300, ARCH_MAX = 6, ARCH_CD = 14, ARCH_UP = 72;   // (ARCH_UP: how high over the bow the shot bursts, ceiling allowing)

// The archery bow, in pixel art (drawn once): a plain recurve, held level
// over the head with its arrow pointing straight up - a wrapped grip in the
// middle, limbs of pale green light curving down and out to where the string's
// tied, their tips flicking back the other way. (String and arrow are drawn on
// their own: they move.)
const CRYSTAL_BOW = (() => {
  const W = 34, H = 12, cx = 17, cy = 3, at = new Map(), set = (x, y, c) => at.set(`${x},${y}`, c);
  const limbY = (i) => (i <= 11 ? cy + Math.round((i * i) / 26) : cy + Math.round(121 / 26) - Math.round((i - 11) * 0.9));
  for (let i = 0; i <= 14; i++) for (const side of [-1, 1]) {
    const x = cx + side * i, y = limbY(i), thick = i < 5 ? 3 : i < 12 ? 2 : 1;
    for (let k = 0; k < thick; k++) set(x, y + k, k === 0 ? (i > 12 ? '#ffffff' : '#d8ffe0') : k === thick - 1 ? '#1a9a44' : '#5aec84');
  }
  // the grip: a dark wrap, an arrow rest on top, a band of light either side
  for (let y = cy - 1; y <= cy + 3; y++) for (let x = cx - 1; x <= cx + 1; x++) set(x, y, y % 2 ? '#1f3a2a' : '#2f5a3e');
  set(cx, cy - 1, '#ffffff');
  for (const side of [-1, 1]) { set(cx + side * 2, cy, '#c8ffd0'); set(cx + side * 2, cy + 1, '#7aff9a'); }
  const [c, g] = makeCanvas(W + 2, H + 2);
  for (let y = -1; y <= H; y++) for (let x = -1; x <= W; x++) {
    let col = at.get(`${x},${y}`);
    if (!col && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at.has(`${x + dx},${y + dy}`))) col = '#04140a';
    if (col) { g.fillStyle = col; g.fillRect(x + 1, y + 1, 1, 1); }
  }
  return { img: c, cx: cx + 1, cy: cy + 1, tipY: limbY(14) - cy };
})();
// murasaki (skill, Q): red and blue come out (until RED_BLUE), close in and hit (MERGE), the purple builds (till MURA_CHARGE) and goes
const RED_BLUE = 0.42, MERGE = 0.74, MURA_CHARGE = 1.1, MURA_CD = 18;
// flame fist (skill, Q): the fire builds on the fists (BLAZE_CHARGE), then the dash - this fast, this far at most -
// and the punch, and a moment to come out of it; the punch's hit; the wait after
const BLAZE_CHARGE = 0.7, BLAZE_SPEED = 560, BLAZE_RANGE = 180, BLAZE_RECOVER = 0.3, BLAZE_DMG = 150, BLAZE_CD = 9;
// galaxy (skill, Q): the cast (at a point this far off at most - where you aim), the wait after; how far short of a wall it opens
const GAL_CAST = 0.8, GAL_RANGE = 240, GAL_CD = 16, GAL_WALL = 8;
// the flying swords (skill, Q): the calling-up, the wait once they're all gone (the swords themselves: see main.js)
const SUM_CAST = 0.6, SUM_CD = 15;
export const SKILL_CD = { grapple: GRAPPLE_CD, cloak: CLOAK_CD, decoy: DECOY_CD, archery: ARCH_CD, murasaki: MURA_CD, blaze: BLAZE_CD, galaxy: GAL_CD, demon: SUM_CD };
export const SKILL_TIME = { cloak: CLOAK_TIME, decoy: DECOY_LIFE, veil: VEIL_TIME, archery: ARCH_CHARGE, murasaki: MURA_CHARGE, blaze: BLAZE_CHARGE, galaxy: GAL_CAST, demon: SUM_CAST };
// health / damage
export const MAX_HP = 300;
export const DAMAGE = 0.36;    // guns hit for this much of their main-game damage
// ...and some harder than that. A sniper: three body shots with a bolt gun, two with a .50. Those that fire quickly have
// less of it, or they'd out-damage everything. A shotgun: all its pellets at close range take well over a third of you
const CLASS_MUL = { sniper: 2, shotgun: 1.7 };
const GUN_MUL = {
  vss: 1.1, dragunov: 1.5, m82a1: 1.5, barrett: 1.5,   // (snipers that don't need the bolt working)
  m1014: 1.1, s12k: 1.1, saiga12: 1.1, aa12: 1, usas12: 0.95, dbs: 1.4, ks23: 1.2,   // (shotguns that don't need the pump working, and the two with the most in one shot)
};
// And these fire too quickly for the fight here: how they handle in this game. (The arena's own: the
// catalog's for the top-down game as well.) A shotgun at its best, or a .50, comes out near the bolt guns' 120-200 a second.
export const GUN_HANDLING = {
  aa12: { fireInterval: 0.3, magSize: 12, spread: 0.26 }, usas12: { fireInterval: 0.32, magSize: 8 },
  saiga12: { fireInterval: 0.36 }, s12k: { fireInterval: 0.36 }, m1014: { fireInterval: 0.38 },
  barrett: { fireInterval: 1, magSize: 5, pierce: 2 }, m82a1: { fireInterval: 1, magSize: 5, pierce: 2 },
  mg42: { fireInterval: 0.07 }, mg3: { fireInterval: 0.07 },
};
export const gunMul = (d) => GUN_MUL[d.key] ?? CLASS_MUL[d.cls] ?? 1;
export const HEAD_MUL = 1.15;
const REGEN_DELAY = 4, REGEN = 15;   // not hurt for 4 s: back 15 HP a second
// body
const MOVE_STEP = 6;   // the most a body moves at a time, however fast it's going: never far enough to pass through something
const UNSTICK = [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];   // (which way out first, when caught inside something)
const HALF_W = 5, HEIGHT = 28, ROLL_H = 14, CROUCH_H = 22, CROUCH_DROP = 5;
const CROUCH_BODY = 3;   // crouched: the body sinks 3 px, the head 2 more (5 in all) - tucked into the shoulders
// the main game's gun handling
const GUN_HEIGHT = 9, GUN_REACH = 4, RELOAD_TILT = 0.55, SHELL_TILT = -0.4, RAISE_TILT = -1.1, STEP_TILT = -0.3, CLIMB_KEEP = 0.35;
const FLIP_TIME = 0.5, FLIP_LAND = 0.12;   // the second jump's somersault; how soon it finishes once it's landed
const WALK_FPS = 16, IDLE_PERIOD = 1.5, SETTLE_TIME = 0.1;
const SPRING_K = 420, SPRING_D = 14;   // the body's squash-and-stretch spring (bouncy: it overshoots)
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
export const ARENA_FISTS = { ...FISTS, time: 0.24, jabRest: 0.03, hookRest: 0.15 };
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
// The same little run of random numbers for the same seed: online, a shot's spread comes out alike
// on the player's screen and on the host's (see Fighter.shoot, shotSeed in online.js).
function seeded(seed) {
  let a = Math.imul(seed, 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
// The hands are those of whoever's being drawn (see Fighter.draw).
let handSet = HANDS;
function drawHand(ctx, name, x, y) {
  const h = handSet[name];
  ctx.drawImage(h.img, x - h.at.x - 1, y - h.at.y - 1);
}
// The hands recoloured like a fighter's skin (a washed-out fighter - the
// training dummies - has hands as grey as its face).
function tintedHands(hue, sat) {
  const out = {};
  for (const [k, h] of Object.entries(HANDS)) {
    const [c, g] = makeCanvas(h.img.width, h.img.height);
    g.filter = `hue-rotate(${hue}deg) saturate(${sat})`;
    g.drawImage(h.img, 0, 0);
    out[k] = { ...h, img: c };
  }
  return out;
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

// A game as a fighter sees it, but with no effects or flashes of its own (see coast).
const QUIET = new Proxy({}, { get: () => () => {} });
const quietGame = (g) => (g.quiet ??= Object.create(g, { fx: { value: QUIET }, lights: { value: QUIET }, kick: { value: () => {} } }));

export class Fighter {
  // opts: { name, color, hue, sat, bot }
  constructor(game, images, opts) {
    this.game = game;
    Object.assign(this, opts);
    this.images = images;   // (a shadow clone is made from the same art)
    this.parts = tinted(images, opts.hue ?? 0, opts.sat ?? 1);
    this.hands = (opts.sat ?? 1) !== 1 ? tintedHands(opts.hue ?? 0, opts.sat) : HANDS;
    this.wins = 0;
    this.kills = 0;
    this.deaths = 0;
    this.reset(0, 0);
  }

  reset(x, y) {
    Object.assign(this, {
      x, y, vx: 0, vy: 0, facing: 1, aim: 0, aimTarget: null, hp: MAX_HP, alive: true,
      padT: 0, flipT: -1, flipDir: 1, exposeT: 0, swordsOut: false, stamina: MAX_STAMINA, staminaRest: 0, winded: false, sprinting: false, rollCool: 0, rollCrouch: 0, sq: 0, sqV: 0, hook: null, charges: GRAPPLE_SHOTS, hookGap: 0, trail: [], cuts: [], skillCD: 0, boostT: 0, cloak: null, lunge: null, fade: null, veil: null, decoy: null, decoyLife: 0, bow: null, mura: null, blaze: null, gal: null, summon: null, shield: 0,
      onGround: false, onLadder: false, ladderCool: 0, coyote: 0, jumpBuf: 0, airJumps: 1, dropT: 0,
      roll: null, flash: 0, hurtT: 9, animT: 0, frame: 0, climbT: 0,
      state: 'idle', settle: 0, pose: { legL: [0, 0], legR: [0, 0], body: 0, head: 0, headX: 0 },
      blinkIn: 1 + Math.random() * 3, blinkLeft: 0, tilt: 0, triggerHeld: false, crouch: false,
      gun: null, grenades: 1, grenadeCD: 0, killer: null, deadT: 0, corpse: null, lastFireT: 9,
      // the three slots: 1 melee (bare fists to start), 2 the gun (one, whatever it is), 3 grenades
      slot: 2, melee: new MeleeWeapon(ARENA_FISTS), slashes: [], nade: 'frag', quick: null, throwT: -1, airRoll: true,
    });
    const L = this.game.loadout?.() ?? { gun: 'm9', ammo: 36, grenades: 1, hp: MAX_HP };
    this.maxHp = this.hp = L.hp;
    this.grenades = L.grenades;
    if (L.gun) this.give(L.gun, L.ammo);
    this.slot = this.gun ? 2 : 1;
  }

  // The gun in slot n (just 2: one gun at a time), the one in hand, and
  // which slot a gun goes in.
  gunIn(n) {
    return n === 2 ? this.gun : null;
  }
  get weapon() {
    return this.gunIn(this.slot);
  }
  slotFor(def) {
    return 2;
  }
  // the gun, while it has ammo
  bestGun() {
    const w = this.gun;
    return w && (w.ammo > 0 || w.reserve > 0) ? w : null;
  }

  // What's in hand: the melee weapon (slot 1), the gun (2), or nothing (slot 3: a grenade).
  get held() {
    return this.slot === 1 ? this.melee : this.weapon;
  }
  get meleeOut() {
    return this.slot === 1;
  }
  aimOrigin() {
    return { x: this.x, y: this.y - GUN_HEIGHT + (this.crouch ? CROUCH_BODY : 0) };
  }

  // Take out slot n (1 melee, 2 the gun, 3 grenades); the gun goes on the back (a pistol on the hip).
  select(n) {
    if (n === this.slot || n < 1 || n > 3 || (n === 2 && !this.gun) || (n === 3 && this.grenades <= 0)) return false;
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
  // Knocked out of the hands (or dropped): the gun's gone, out comes the melee weapon.
  dropGun() {
    const w = this.weapon;
    if (!w) return null;
    this.gun = null;
    this.slot = 1;
    return w;
  }

  get h() {
    return this.roll ? ROLL_H : this.crouch ? CROUCH_H : HEIGHT;
  }
  get box() {
    return { l: this.x - HALF_W, r: this.x + HALF_W, t: this.y - this.h, b: this.y };
  }
  // What a bullet at (x, y) hits: the head (the face and brow - not the big
  // hair over it, which shots go through), the body, or nothing (rolling: just the ball).
  hitPart(x, y) {
    const dx = (x - this.x) * this.facing;
    if (this.vanish) return null;
    if (this.roll) return Math.abs(dx) <= 7 && y > this.y - ROLL_H && y <= this.y ? 'body' : null;
    const d = this.crouch ? CROUCH_DROP + 3 : 0;   // ducked down: the head's lower (and a bit harder to hit)
    if (dx >= -7 && dx <= 6 && y >= this.y - 21 + d && y < this.y - 14 + d) return 'head';
    if (Math.abs(dx) <= 6 && y >= this.y - 14 + d && y <= this.y) return 'body';
    return null;
  }
  // the middle of the body (for aiming at)
  get center() {
    return { x: this.x, y: this.y - (this.roll ? 7 : 12) };
  }

  // ---------- weapons ----------

  give(key, ammo) {
    const def = this.game.weapons[key];
    if (!def) return null;
    // into slot 2, in place of whatever gun was there - whatever's in hand stays in hand
    const w = new Weapon(def), n = 2;
    let left = ammo;   // its spare rounds (w.reserve reads them)
    w.ammoSource = {
      count: () => left,
      take: (c, k) => { const t = Math.min(k, left); left -= t; return t; },
      give: (c, k) => { left += k; },
    };
    this.gun = w;
    if (n === this.slot) this.tilt = RAISE_TILT;
    return w;
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
    // (a reverse grip is held further out, so the blade hangs clear in front of the body)
    const reach = GUN_REACH - w.recoil - (w.reloading ? 1 : 0) + (w.def.reverse ? 3 : 0);
    const rest = w.def.restHeight ?? STANCE_HEIGHT;
    const h = stance ? rest + (GUN_HEIGHT - rest) * w.engage : GUN_HEIGHT;
    const px = this.x + this.facing, py = this.y - h + this.pose.body;
    const flip = this.facing * (stance && w.flipped ? -1 : 1);   // turned over for an upward swing
    // (a reverse grip: the fist goes out along the aim, whichever way the blade's turned in it)
    const out = w.def.reverse ? base : a;
    return { x: px + Math.cos(out) * reach, y: py + Math.sin(out) * reach, a, base, flip };
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
    this.exposeT -= dt;
    if (this.flipT >= 0 && (this.flipT += dt / FLIP_TIME) >= 1) this.flipT = -1;
    if (!this.alive) return this.updateCorpse(dt);
    if (this.beamT !== undefined) this.beamT += dt;
    // the spawn shield: running down, and gone the moment you attack
    if (this.shield > 0) this.shield = c.fire || c.melee || c.grenade || c.skill ? 0 : this.shield - dt;
    if (this.hurtT > REGEN_DELAY && this.hp < this.maxHp && !this.isDecoy && this.game.regen !== false) this.hp = Math.min(this.maxHp, this.hp + REGEN * dt);

    if (c.aim !== null && c.aim !== undefined) this.aim = c.aim;
    this.aimTarget = c.target ?? null;
    const prey = this.lunge?.v ?? this.cloak?.prey;
    if (prey?.alive) { const s = this.seen(prey); this.aim = Math.atan2(s.y - 14 - (this.y - GUN_HEIGHT), s.x - this.x); }
    if (!this.roll) {
      const cs = Math.cos(this.aim), f = cs > 0.15 ? 1 : cs < -0.15 ? -1 : this.facing;
      if (f !== this.facing) { this.facing = f; this.settle = SETTLE_TIME; }
    }

    // S tapped twice (or S + jump) on a catwalk drops through it (S alone crouches)
    if ((c.drop || (c.down && c.jump)) && this.onGround && this.standingOnPlat() && !this.ladderBelow()) {
      this.dropT = 0.22;
      this.jumpBuf = this.coyote = 0;   // (a jump still held over from the air mustn't fire now instead)
      c = { ...c, jump: false, crouch: false };
    } else if (this.dropT > 0 && c.down) c = { ...c, jump: false };   // (S + jump still down a frame later, already through: not a jump off the edge)
    if (c.crouch && this.onGround && !this.onLadder && !this.roll) this.crouch = true;
    else if (this.crouch && this.rollCrouch <= 0 && this.room(HEIGHT)) this.crouch = false;   // stands up only where there's room
    this.rollCrouch -= dt;
    // under a low ceiling there's no jumping (it would only push up into it)
    if (this.crouch && !this.room(HEIGHT)) c = { ...c, jump: false };
    // Stamina comes back the moment you stop running. Run it right out, though,
    // and you're winded: a beat before it starts to refill, and no running
    // until it's partly back (or you let go of run and go again).
    if (this.winded && (!c.sprint || this.stamina >= WINDED_UNTIL)) this.winded = false;
    this.sprinting = !!c.sprint && !!c.move && this.stamina > 0 && !this.winded && !this.onLadder && !this.roll && !this.crouch;
    this.boostT = Math.max(0, this.boostT - dt);   // an energy drink: running costs nothing for a while
    if (this.sprinting) {
      if (this.boostT <= 0) this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN * dt);
      if (this.stamina <= 0) this.windOut();
    } else if ((this.staminaRest -= dt) <= 0) this.stamina = Math.min(MAX_STAMINA, this.stamina + STAMINA_REGEN * dt);

    this.coyote = this.onGround ? COYOTE : this.coyote - dt;
    this.jumpBuf = c.jump ? BUFFER : this.jumpBuf - dt;
    this.dropT -= dt;

    // ladders: grab one by pushing up / down in front of it
    const ladderHere = this.overLadder();
    this.ladderCool -= dt;
    if (!this.onLadder && ladderHere && ((c.up && this.ladderAt() && this.ladderCool <= 0) || (c.down && !this.onGround) || (c.down && this.ladderBelow())) && !this.roll) {
      this.onLadder = true;
      this.x += (ladderHere.x - this.x) * 0.6;
      this.vx = 0;
    }
    if (this.onLadder && (!ladderHere || this.jumpBuf > 0)) {
      this.onLadder = false;
      if (this.jumpBuf > 0) { this.vy = -JUMP * 0.8; this.jumpBuf = 0; this.ladderCool = 0.3; }
    }

    // dive roll (costs stamina)
    if (c.roll && !this.roll && !(this.bow && !this.bow.fired) && !this.mura && !this.blaze && !this.gal && !this.summon && (this.onGround || this.airRoll) && !this.onLadder && this.rollCool <= 0 && this.stamina >= ROLL_COST) {
      const dir = c.move ? Math.sign(c.move) : this.facing;
      // a roll gives a cloak away - unless there's a foe close by: then it stays
      // hidden through the roll and comes up out of it stabbing them (roll past
      // someone and it's their back)
      const k = this.cloak;
      const near = k && !k.out && !k.used ? this.foeNear(ROLL_STAB_RANGE) : null;
      if (near) k.rollStab = near;
      else this.uncloak();
      if (!this.onGround) this.airRoll = false;   // one roll per jump
      this.roll = { t: 0, dir, spin: dir, trail: [] };
      this.stamina -= ROLL_COST;
      if (this.stamina <= 0) this.windOut();
      this.quick = null;
      if (this.onGround) this.game.fx.dust(this.x - this.roll.dir * 4, this.y, 6);
      else this.game.fx.puff(this.x, this.y - 8);
    }
    this.skillCD -= dt;
    if (this.game.noCooldown?.(this)) this.skillCD = Math.min(this.skillCD, 0);   // (training: skills can go without their wait)
    if (this.skill === 'grapple') this.updateGrapple(dt, c);
    else if (this.skill === 'cloak') this.updateCloak(dt, c);
    else if (this.skill === 'decoy') this.updateDecoy(dt, c);
    else if (this.skill === 'archery') this.updateArchery(dt, c);
    else if (this.skill === 'murasaki') this.updateMurasaki(dt, c);
    else if (this.skill === 'blaze') this.updateBlaze(dt, c);
    else if (this.skill === 'galaxy') this.updateGalaxy(dt, c);
    else if (this.skill === 'demon') this.updateSummon(dt, c);
    if (this.hook?.state !== 'on' && this.trail.length) this.trail.pop();   // the grapple's afterimages catching up once it lets go
    const reeling = this.hook?.state === 'on';
    if (this.roll) {
      this.roll.t += dt / ROLL_TIME;
      this.vx = this.roll.dir * ROLL_SPEED * (1 - 0.6 * this.roll.t);
      this.roll.trail.unshift({ x: this.x, y: this.y, t: this.roll.t });   // where it's been, for the afterimages
      this.roll.trail.length = Math.min(this.roll.trail.length, 10);
      if (this.roll.t >= 1) {
        // Out of the roll: straight up onto its feet in the open. Under
        // something low - or heading in under it - it stays down in a crouch
        // (a roll is a crouch) until there's room to stand.
        const fits = (x, h) => !this.hits(x - HALF_W, this.y - h, x + HALF_W, this.y);
        if (fits(this.x, CROUCH_H)) {
          const ahead = this.x + this.roll.dir * 12;
          const low = !fits(this.x, HEIGHT) || (!fits(ahead, HEIGHT) && fits(ahead, CROUCH_H));
          this.rollCrouch = low ? ROLL_CROUCH_IN : 0;
          this.roll = null;
          this.crouch = low;
          this.bounce(low ? 55 : 30);   // comes up with a little give
          this.rollCool = ROLL_COOLDOWN;
          this.settle = SETTLE_TIME;
          this.game.fx.dust(this.x, this.y, 4);
          if (this.cloak?.rollStab) { const v = this.cloak.rollStab; this.cloak.rollStab = null; this.stabAt(v); }
        } else this.roll.t = 0.95;
      }
    } else if (this.onLadder) {
      this.vy = (c.up ? -CLIMB : 0) + (c.down ? CLIMB : 0);
      this.vx = c.move * 48;
      this.climbT += Math.abs(this.vy) * dt;
    } else if (reeling) {
      // on the line: reeled in hard toward the spot (A / D steers a little);
      // speed across the line dies off, so it curves in rather than orbiting
      const h = this.hook, dx = h.tx - this.x, dy = h.ty - (this.y - 14), d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      const along = this.vx * ux + this.vy * uy, damp = Math.exp(-4 * dt);
      this.vx = ux * along + (this.vx - ux * along) * damp + (ux * GRAPPLE_PULL + c.move * 260) * dt;
      this.vy = uy * along + (this.vy - uy * along) * damp + uy * GRAPPLE_PULL * dt;
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > GRAPPLE_MAX) { this.vx *= GRAPPLE_MAX / sp; this.vy *= GRAPPLE_MAX / sp; }
    } else {
      const top = WALK * (this.sprinting ? SPRINT : 1) * (this.stealthed ? CLOAK_SPEED : 1) * (this.bow && !this.bow.fired ? 0.5 : 1) * (this.mura ? 0.3 : 1) * (this.blaze ? (this.blaze.phase === 'charge' ? 0.25 : 0.5) : 1) * (this.gal ? 0.35 : 1) * (this.summon ? 0.3 : 1) * (this.crouch ? 0.45 : 1) * (this.meleeOut && this.melee.t >= 0 ? 0.55 : 1) * (this.held?.def.speedMul ?? 1);
      const want = c.move * top, d = want - this.vx;
      const a = (this.onGround ? (c.move ? ACCEL : DECEL) : AIR_ACCEL) * dt;
      this.vx += Math.max(-a, Math.min(a, d));
      if (this.jumpBuf > 0 && this.coyote > 0) {
        this.vy = -JUMP;
        this.jumpBuf = 0;
        this.coyote = 0;
        this.bounce(-95);   // springs up: stretched
        this.game.fx.dust(this.x, this.y, 4);
      } else if (this.jumpBuf > 0 && this.airJumps > 0 && !this.onGround) {
        this.vy = -JUMP2;
        this.jumpBuf = 0;
        this.airJumps--;
        this.flipT = 0;   // a somersault
        this.flipDir = c.move ? Math.sign(c.move) : this.facing;
        this.bounce(-75);
        this.game.fx.puff(this.x, this.y - 2);
      }
      if (!c.jumpHeld && this.vy < -110 && this.padT <= 0) this.vy += 1200 * dt;   // let go early: a shorter hop (a jump pad's throw is the pad's)
    }
    if (this.lunge) {
      // the cloak's dash in to a stab: straight at their body - along the floor,
      // down off a ledge, up or down through the air - and the knife goes in when it gets there
      const L = this.lunge, at = this.seen(L.v), dx = at.x - this.x, dy = at.y - this.y, d = Math.hypot(dx, dy);
      if ((L.t -= dt) <= 0 || !L.v.alive || d < 13) {
        this.lunge = null;
        this.vx = 0;   // stops right there, at arm's length (none of the dash's speed left to carry it on up)
        this.vy = 0;
        this.melee.attack();
      } else {
        this.vx = (dx / d) * LUNGE_SPEED;
        this.vy = (dy / d) * LUNGE_SPEED;
        if (dy > 4) this.dropT = 0.1;   // down through a catwalk to get at them
      }
    }
    const dashing = this.blaze?.phase === 'dash';
    if (dashing) {
      // the flame fist's dash: straight down the line it was thrown along, no falling
      this.vx = Math.cos(this.blaze.a) * BLAZE_SPEED;
      this.vy = Math.sin(this.blaze.a) * BLAZE_SPEED;
      if (this.vy > 100) this.dropT = 0.1;   // (down through a catwalk too)
    }
    if (!this.onLadder && !this.lunge && !dashing) this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * (reeling ? 0.25 : 1) * dt);

    const wasGround = this.onGround, fall = this.vy, px = this.x, py = this.y;
    this.move(dt);
    if (dashing) this.blazeStep(Math.hypot(this.x - px, this.y - py), dt);
    // climbed down to the floor (or walking off along it): off the ladder
    if (this.onLadder && (c.down || (c.move && !c.up)) && this.hits(this.x - HALF_W, this.y, this.x + HALF_W, this.y + 1)) {
      this.onLadder = false;
      this.onGround = true;
    }
    if (this.onGround && !wasGround) {
      this.settle = SETTLE_TIME;
      this.bounce(Math.min(180, fall * 0.45));   // lands: squashes down and springs back
      if (fall > 250) this.game.fx.dust(this.x, this.y, 5);
    }
    if (this.onGround) { this.airJumps = 1; this.airRoll = true; }
    if (this.onLadder || this.roll) this.flipT = -1;
    else if (this.onGround && this.flipT >= 0 && (this.flipT += dt / FLIP_LAND) >= 1) this.flipT = -1;   // (down part way round: it finishes turning, quickly, rather than snap upright)
    // on a jump pad: up you go
    this.padT -= dt;
    if (this.onGround && !this.onLadder && !this.roll && L.padAt(this.x, this.y)) {
      this.vy = -PAD_JUMP;
      this.onGround = false;
      this.padT = 0.8;
      this.bounce(-95);
      this.game.fx.dust(this.x, this.y, 6);
      this.game.fx.sparks(this.x, this.y - 2, 5, 0, -1, '#7ef0e0');
    }
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
    // drawing the archery bow: hands full - no shooting, hitting, throwing or switching till it's loosed
    if ((this.bow && !this.bow.fired) || this.mura || this.blaze || this.gal || this.summon) c = { ...c, fire: false, melee: false, meleeHeld: false, grenade: false, throwWeapon: false, slot: 0, cycle: 0, reload: false };
    // behind a shadow clone: any attack of your own ends it - the double goes, you're seen
    if (this.decoy && (c.fire || c.melee || c.grenade || c.throwWeapon)) this.dropDecoy();
    // cloaked: the knife and nothing else - no throwing or grenades - and one
    // stab, with a dash in to whoever's close in front. Switching weapons (1-4,
    // the wheel) is allowed, but it gives the cloak up.
    let k = this.cloak;
    if (k && !k.out && (c.slot || c.cycle)) { this.uncloak(); k = null; }
    if (k) {
      const stab = (c.fire || c.melee) && !k.used && !this.roll && !this.onLadder;
      c = { ...c, slot: 0, cycle: 0, throwWeapon: false, grenade: false, reload: false, fire: false, melee: false, meleeHeld: false };
      this.slot = 1;
      if (stab) {
        k.used = true;
        // who it's going for, and whether they've got their back to it - decided
        // now, as the stab starts (not wherever everyone is by the time it lands);
        // someone in reach gets the dash, unless they're at arm's length already
        const v = this.stabVictim(), s = v && this.seen(v);
        k.prey = v;
        k.backstab = v && (this.x - s.x) * (s.facing ?? v.facing) < 0 ? v : null;
        this.lunge = v && Math.hypot(s.x - this.x, s.y - this.y) >= 13 ? { v, t: 0.35 } : null;
        if (!this.lunge) this.melee.attack();
      }
    }
    // switching slots (1 - 3, or the wheel)
    if (c.slot) this.select(c.slot);
    if (c.cycle) for (let i = 1; i <= 3; i++) if (this.select(((this.slot - 1 + c.cycle * i + 9) % 3) + 1)) break;
    if (this.slot === 2 && !this.weapon) this.slot = 1;
    if (this.slot === 3 && this.grenades <= 0 && this.throwT < 0) this.select(this.gun ? 2 : 1) || (this.slot = 1);
    const busy = this.onLadder || this.roll;

    // a quick melee (F / right click) from the gun or grenade: out with it, hit, back
    if (c.melee && !this.meleeOut && !busy) {
      this.quick = this.slot;
      this.slot = 1;
      this.melee.drawT = 0;
      this.melee.engage = 1;
    }
    for (const sl of this.slashes) sl.t += dt;
    for (const c of this.cuts) c.t += dt;
    this.cuts = this.cuts.filter((c) => c.t < 0.3);
    this.slashes = this.slashes.filter((sl) => sl.t < sl.life);

    if (this.slot === 1) {
      const m = this.melee;
      if ((c.fire || c.melee || (this.quick && c.meleeHeld)) && !busy) m.attack();   // F held: keep punching
      m.update(dt);
      this.tilt += (m.raising * RAISE_TILT - this.tilt) * Math.min(1, dt * 16);
      if (m.events.includes('strike')) {
        this.strike(m);
        if (k) k.out = true;   // the stab gives it away
      }
      if (m.striking && (m.def.style !== 'saw' || m.events.includes('tick'))) this.game.meleeHit(this, m);
      if (k?.out && m.t < 0) this.uncloak();
      // a quick hit done: back to what was out
      if (this.quick && m.t < 0 && !c.meleeHeld) {
        const back = this.quick;
        this.quick = null;
        this.select(back);
      }
    } else if (this.weapon) {
      const w = this.weapon;
      // (both hands on the rungs: no reloading, and what was going on stops)
      if (this.onLadder) { w.reloadQueued = false; if (w.reloading) w.cancelReload(); }
      else if (c.reload) w.startReload();
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
        else if (r === 'empty' && w.reserve <= 0 && !w.reloading && w.ammo <= 0) {
          this.game.fx.thrownGun(this, w);   // out of everything: throw it away
          this.dropGun();
        }
      }
    } else if (this.slot === 3 && c.fire && !this.triggerHeld && !busy) this.throwNade();
    this.triggerHeld = !!c.fire;
    // G throws one whatever is out
    if (c.grenade && !busy) this.throwNade();
    if (c.throwWeapon && !busy) this.throwHeld();
    if (this.throwT >= 0) {
      this.throwT += dt / 0.35;
      if (this.throwT >= 1) this.throwT = -1;
    }
  }

  // G: throw what's in hand at someone - a gun, the melee weapon (a grenade from slot 3).
  throwHeld() {
    if (this.slot === 3) return this.throwNade();
    let thing = null;
    if (this.weapon) {
      const w = this.dropGun();
      thing = { kind: 'gun', key: w.def.key, ammo: w.ammo, reserve: w.reserve, img: w.icon, weight: w.def.cls };
    } else if (this.slot === 1 && !this.melee.def.fists) {
      const m = this.melee;
      this.melee = new MeleeWeapon(ARENA_FISTS);
      thing = { kind: 'melee', key: m.def.key, img: m.def.img, weight: m.def.hands > 1 ? 'heavy' : 'light' };
    }
    if (!thing) return;
    this.throwT = 0;
    const s = this.shoulder;
    this.game.throwWeapon(this, thing, s.x, s.y - 2, Math.cos(this.aim) * 340 + this.vx * 0.4, Math.sin(this.aim) * 340 - 60);
  }

  // Stamina all used up: winded for a moment.
  windOut() {
    this.stamina = 0;
    this.winded = true;
    this.staminaRest = WINDED_DELAY;
  }

  // ---------- the grapple (skill, Q) ----------
  // Q shoots a line from the hand along the aim, Spider-Man style. It sticks
  // in the first solid thing it meets (a wall, a ceiling, a ledge, a catwalk
  // from either side) and reels you in, fast, to just off that spot - up onto
  // the ledge, against the wall, under the ceiling - and lets go there with
  // some of the speed still on. A jump lets go early; Q again fires the next line
  // straight off this one (three saved up), or lets go if there are none left.
  // Aimed close to a foe it locks on, and goes for them wherever they go.

  // where the line leaves the hand
  lineFrom() {
    const a = this.hook ? Math.atan2(this.hook.y - (this.y - 10), this.hook.x - this.x) : this.aim;
    return { x: this.x + this.facing + Math.cos(a) * 3, y: this.y - GUN_HEIGHT + this.pose.body + Math.sin(a) * 3 - 1 };
  }
  // what the line bites into at (x, y), coming from (px, py): the surface's normal, or null
  anchorAt(x, y, px, py) {
    const L = this.game.level, solid = (sx, sy) => L.solidAt(sx, sy) || this.game.props.some((p) => p.solid && !p.dead && sx > p.box.l && sx < p.box.r && sy > p.box.t && sy < p.box.b);
    const cy = Math.floor(y / T);
    if (L.get(Math.floor(x / T), cy) === PLAT && y - cy * T < 4) return { x: 0, y: -1 };   // a catwalk: always up onto it
    if (!solid(x, y)) return null;
    // which way it came in decides the face it hit
    if (solid(px, y) || !solid(x, py)) return { x: 0, y: y > py ? -1 : 1 };
    return { x: x > px ? -1 : 1, y: 0 };
  }
  // Who a line shot now would lock on to: a foe it can reach, close to the line of the aim or to the cursor,
  // nothing solid between. Not someone unseen - only in the moment the cloak glitches and shows them.
  hookTarget() {
    if (this.skill !== 'grapple' || !(this.charges > 0)) return null;
    const s = this.lineFrom(), ax = Math.cos(this.aim), ay = Math.sin(this.aim), t = this.aimTarget;
    let best = null, bs = Infinity;
    for (const v of this.game.fighters) {
      if (v === this || !v.alive || v.vanish || (v.hidden && !v.glimpsed) || !this.game.foes(this, v)) continue;
      const p = this.seen(v), cx = p.x, cy = p.y - 14, dx = cx - s.x, dy = cy - s.y;
      if (Math.hypot(dx, dy) > GRAPPLE_RANGE || dx * ax + dy * ay <= 0) continue;
      const off = Math.min(Math.abs(dx * ay - dy * ax), t ? Math.hypot(t.x - cx, t.y - cy) : Infinity);
      if (off > GRAPPLE_LOCK || off >= bs || !this.game.los(s.x, s.y, cx, cy)) continue;
      bs = off;
      best = v;
    }
    return best;
  }
  updateGrapple(dt, c) {
    let h = this.hook;
    if (h) h.snap += dt;
    this.hookGap -= dt;
    // the shots saved up, coming back one at a time
    if (this.charges < GRAPPLE_SHOTS && this.skillCD <= 0) {
      this.charges++;
      if (this.charges < GRAPPLE_SHOTS) this.skillCD = GRAPPLE_CD;
    }
    if (h && (this.roll || this.onLadder)) { this.letGo(); h = this.hook; }
    if (c.skill && this.charges > 0 && this.hookGap <= 0 && !this.onLadder && !this.roll) {
      // (on a line already: the next one straight off it)
      const s = this.lineFrom(), lock = this.hookTarget();
      h = this.hook = { state: 'fly', x: s.x, y: s.y, dx: Math.cos(this.aim), dy: Math.sin(this.aim), len: 0, t: 0, slow: 0, snap: 9, lock, onUnseen: !!lock?.hidden };   // (onUnseen: caught as they glitched - it stays on them when that's over)
      this.charges--;
      this.hookGap = GRAPPLE_GAP;
      if (this.skillCD <= 0) this.skillCD = GRAPPLE_CD;
      this.game.fx.sparks(s.x, s.y, 4, h.dx, h.dy, '#d8f4ff');
    } else if (c.skill && h && h.state !== 'back') { this.letGo(); h = this.hook; }
    if (!h) return;
    h.t += dt;
    if (h.state === 'fly') {
      // out along the aim a few px at a time, until it bites (or runs out of line)
      const step = 3;
      for (let i = Math.ceil((GRAPPLE_SPEED * dt) / step); i > 0; i--) {
        // locked on: it goes for them, wherever they've gone
        const lk = h.lock?.alive && (!h.lock.hidden || h.onUnseen) && !h.lock.vanish ? h.lock : null, lp = lk && this.seen(lk);
        if (lk) {
          const ldx = lp.x - h.x, ldy = lp.y - 14 - h.y, ld = Math.hypot(ldx, ldy) || 1;
          h.dx = ldx / ld;
          h.dy = ldy / ld;
        }
        const nx = h.x + h.dx * step, ny = h.y + h.dy * step;
        // someone in the way: it hooks them, and pulls you to them (they don't budge)
        const there = lk && Math.hypot(nx - lp.x, ny - (lp.y - 14)) < 10;
        const v = there ? lk : this.game.fighters.find((o) => o !== this && o.alive && !o.vanish && (!o.hidden || o.glimpsed) && o.owner !== this && o.hitPart(nx, ny));
        if (v) {
          if (v.hidden) h.onUnseen = true;
          Object.assign(h, { state: 'on', t: 0, x: nx, y: ny, nx: -h.dx, ny: -h.dy, who: v, ox: there ? 0 : nx - v.x, oy: there ? -14 : ny - v.y });
          this.followHooked();
          if (Math.hypot(h.tx - this.x, h.ty - (this.y - 14)) < 14) {
            // right beside you already: no pull - the spin, straight away
            if (this.game.foes(this, v)) this.spinCut();
            h.state = 'back';
            break;
          }
          this.game.fx.sparks(nx, ny, 6, -h.dx, -h.dy, '#9fe6ff');
          if (this.game.viewer === this) this.game.kick?.(h.dx * 2.5, h.dy * 2.5);
          this.airJumps = 1;
          this.airRoll = true;
          this.crouch = false;
          break;
        }
        const n = this.anchorAt(nx, ny, h.x, h.y);
        if (n) {
          // stuck: the spot to be pulled to is just off the surface
          const off = n.y ? 16 : 9, tx = h.x + n.x * off, ty = h.y + n.y * off;
          this.game.fx.impact(h.x, h.y, n.x, n.y, 3);
          this.game.fx.sparks(h.x, h.y, 6, n.x, n.y, '#9fe6ff');
          // already there (the floor underfoot, a wall right beside): nothing to pull - it just springs back
          if (Math.hypot(tx - this.x, ty - (this.y - 14)) < 14) { h.state = 'back'; this.charges = Math.min(GRAPPLE_SHOTS, this.charges + 1); break; }   // (the shot back)
          Object.assign(h, { state: 'on', t: 0, nx: n.x, ny: n.y, tx, ty });
          if (this.game.viewer === this) this.game.kick?.(h.dx * 2.5, h.dy * 2.5);
          if (this.onGround && ty < this.y - 30) this.vy = Math.min(this.vy, -80);   // up off the floor
          this.airJumps = 1;
          this.airRoll = true;
          this.crouch = false;
          break;
        }
        h.x = nx;
        h.y = ny;
        if ((h.len += step) >= GRAPPLE_RANGE) { h.state = 'back'; this.charges = Math.min(GRAPPLE_SHOTS, this.charges + 1); break; }   // (it bit nothing: the shot back)
      }
    } else if (h.state === 'on') {
      if (h.who) {
        // hooked on someone: the claw goes where they go (and lets go if they're gone)
        if (!h.who.alive || h.who.vanish || (h.who.hidden && !h.onUnseen)) { this.letGo(); return; }
        this.followHooked();
      }
      this.trail.unshift({ x: this.x, y: this.y });
      this.trail.length = Math.min(this.trail.length, 9);
      this.grappleCut();
      const dx = h.tx - this.x, dy = h.ty - (this.y - 14), d = Math.hypot(dx, dy);
      h.slow = Math.hypot(this.vx, this.vy) < 40 ? h.slow + dt : 0;
      if (d < 9 || (d < 22 && this.vx * dx + this.vy * dy < 0)) this.letGo(true);   // there
      else if (c.jump || h.t > GRAPPLE_TIME || h.slow > 0.2 || this.lineCut()) this.letGo();
    } else {
      // reeled back into the hand
      const s = this.lineFrom(), dx = s.x - h.x, dy = s.y - h.y, d = Math.hypot(dx, dy);
      if (d < 6) this.hook = null;
      else { const k = Math.min(1, (GRAPPLE_SPEED * 1.4 * dt) / d); h.x += dx * k; h.y += dy * k; }
    }
  }
  // Reeling in: run into a foe at speed - or reach the one it's hooked on, at
  // any speed - and the blade whirls right round the body (see spinCut).
  grappleCut() {
    const h = this.hook, sp = Math.hypot(this.vx, this.vy);
    h.cut ??= new Set();
    const near = (v, r) => Math.hypot(v.x - this.x, v.y - this.y) <= r;
    if (this.game.fighters.some((v) => v !== this && v.alive && !v.vanish && !h.cut.has(v) && this.game.foes(this, v)
      && (v === h.who ? near(v, 26) : sp >= 100 && near(v, 16)))) this.spinCut();
  }
  // The spin: one whirl of the blade round the body, cutting every foe within
  // reach (once each pull) and flinging them away from it.
  spinCut() {
    const h = this.hook;
    h.cut ??= new Set();
    const sp = Math.hypot(this.vx, this.vy), ux = sp > 1 ? this.vx / sp : this.facing, uy = sp > 1 ? this.vy / sp : 0;
    this.slashes.push({ kind: 'slash', spin: true, a: Math.atan2(uy, ux), dir: this.facing, arc: Math.PI * 1.98, r: 25, t: 0, grow: 0.13, life: 0.34 });
    let hit = false;
    for (const v of this.game.fighters) {
      if (v === this || !v.alive || v.vanish || h.cut.has(v) || !this.game.foes(this, v)) continue;
      if (Math.hypot(v.x - this.x, v.y - this.y) > SPIN_R) continue;
      h.cut.add(v);
      v.hitHow = 'GRAPPLE';
      const ax = Math.sign(v.x - this.x) || this.facing;
      if (v.hurt(GRAPPLE_CUT, this, ax * 170, -110)) {
        hit = true;
        this.cuts.push({ v, a: (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.4), t: 0 });   // a flash-cut across them
        this.game.fx.blood(v.x, v.y - 14, 8, ax, -0.4);
        this.game.fx.sparks(v.x, v.y - 14, 6, ax, -0.5, '#9fe6ff');
      }
    }
    this.game.fx.sparks(this.x, this.y - 14, 10, 0, -0.3, '#d8f4ff');
    if (hit && this.game.viewer === this) this.game.kick?.(this.facing * 3, -2);
  }
  // Hooked on someone: the claw rides on them, and the spot to be pulled to is
  // just short of them (beside them, on your side).
  followHooked() {
    const h = this.hook, v = h.who;
    h.x = v.x + h.ox;
    h.y = v.y + h.oy;
    const cx = v.x, cy = v.y - 14, dx = cx - this.x, dy = cy - (this.y - 14), d = Math.hypot(dx, dy) || 1;
    h.tx = cx - (dx / d) * 12;
    h.ty = cy - (dy / d) * 12;
  }
  // something solid has come between the hand and the spot
  lineCut() {
    // (checked up to a couple of px out from the surface along its normal - never into it)
    const h = this.hook, s = this.lineFrom(), dx = h.x + h.nx * 2 - s.x, dy = h.y + h.ny * 2 - s.y, n = Math.ceil(Math.hypot(dx, dy) / 4);
    for (let i = 1; i < n; i++) if (this.game.level.solidAt(s.x + (dx * i) / n, s.y + (dy * i) / n)) return true;
    return false;
  }
  // Let go of the line (it springs back to the hand). Got there: some of the
  // speed carries on - and coming up onto a ledge, a hop up over its lip (not
  // when it was pulled down onto a floor).
  letGo(arrived = false) {
    const h = this.hook;
    if (!h) return;
    if (h.state === 'on' && arrived) {
      // (at someone: it stops beside them, rather than sailing on past)
      const rising = this.vy < -40, keep = h.who ? 0.2 : 0.55;
      this.vx *= keep;
      this.vy *= keep;
      if (h.ny < 0 && rising) this.vy = Math.min(this.vy, -170);
      this.bounce(rising ? -60 : 40);
      this.game.fx.puff(this.x, this.y - 6);
    }
    if (h.state === 'on') h.snap = 0;   // (the whip as it comes away)
    h.state = 'back';
  }

  // ---------- the cloak (skill, Q) ----------
  // Q: gone from sight for a while, a knife in a reverse grip in hand. Anyone
  // watching still sees the dust it kicks up (and will hear the steps), just
  // not who's kicking it. One stab - from close by it dashes in to it - and a
  // stab in the back is a critical. Stabbing, getting hurt or the time running
  // out brings it back into view (Q again does too), with what it had in hand.

  // unseen - unless an archery bow's lock is on them, which shows them to everyone
  get stealthed() {
    return (!!this.cloak && !this.cloak.out) || !!this.veil;
  }
  get hidden() {
    return this.stealthed && !(this.exposeT > 0);
  }
  // the cloak glitching: seen (as a flickering hologram) by everyone, just for a moment
  get glimpsed() {
    return !!this.cloak && !this.cloak.out && this.cloak.flick > 0;
  }
  // (or was just now: online, a player went for them in that moment, and word of it took a moment to get here)
  get glimpsedLately() {
    return !!this.cloak && !this.cloak.out && this.cloak.flick > -0.4;
  }
  updateCloak(dt, c) {
    const k = this.cloak;
    if (!k) {
      if (c.skill && this.skillCD <= 0 && !this.onLadder && this.alive) this.goCloak();
      return;
    }
    if (k.out) return;
    if (c.skill || (k.t -= dt) <= 0) return this.uncloak();
    k.flick -= dt;
    if ((k.flickIn -= dt) <= 0) {
      k.flickIn = FLICKER_EVERY;
      k.flick = FLICKER_TIME;
      this.game.fx.sparks(this.x, this.y - 14, 4, 0, -1, '#c8b4ff');
    }
  }
  goCloak() {
    if (this.weapon?.reloading) this.weapon.cancelReload();
    this.cloak = { t: CLOAK_TIME, saved: this.melee, slot: this.slot, out: false, used: false, prey: null, flick: -9, flickIn: FLICKER_EVERY };
    this.melee = new MeleeWeapon(SHADE_KNIFE);
    this.melee.drawT = 0;   // (out at once)
    this.slot = 1;
    this.quick = null;
    this.hook = null;
    this.fade = { t: 0, dur: 0.45, out: true, seed: Math.random() * 100 };
    this.game.fx.motes(this.x, this.y, 16, ['#b89aff', '#8f6aff', '#e0d4ff']);
  }
  // back into view: the knife goes, what was in hand comes back
  uncloak() {
    const k = this.cloak;
    if (!k) return;
    this.cloak = null;
    this.lunge = null;
    this.melee = k.saved;
    this.slot = k.slot;
    this.skillCD = CLOAK_CD * (k.killed ? CLOAK_KILL : 1);
    this.settle = SETTLE_TIME;
    this.fade = { t: 0, dur: 0.3, out: false, seed: Math.random() * 100 };
    this.game.fx.motes(this.x, this.y, 10, ['#b89aff', '#8f6aff', '#e0d4ff']);
  }
  // The cloak's one stab, at v (out of a roll): turned to face them, a dash in
  // if they're a few steps off, the knife straight in if they're close - a
  // critical if they've got their back to it. Gone out of reach: just seen.
  stabAt(v) {
    const k = this.cloak, s = this.seen(v), dx = s.x - this.x, d = Math.hypot(dx, s.y - this.y);
    if (!k || k.out || !v.alive || d > LUNGE_RANGE + 8) return this.uncloak();
    k.used = true;
    k.prey = v;
    k.backstab = (this.x - s.x) * (s.facing ?? v.facing) < 0 ? v : null;
    this.facing = Math.sign(dx) || this.facing;
    this.aim = Math.atan2(s.y - 14 - (this.y - GUN_HEIGHT), dx);
    if (d >= 13) this.lunge = { v, t: 0.35 };
    else this.melee.attack();
  }
  // The nearest foe within r px - a circle round the body: beside it, above,
  // below, from the air - with nothing solid between (catwalks don't count).
  foeNear(r) {
    let best = null;
    for (const v of this.game.fighters) {
      if (!v.alive || v === this || (v.hidden && !v.glimpsed) || !this.game.foes(this, v)) continue;   // (the unseen: only as the cloak glitches)
      const s = this.seen(v), d = Math.hypot(s.x - this.x, s.y - this.y);
      if (d >= r || !this.game.los(this.x, this.y - 14, s.x, s.y - 14)) continue;
      r = d;
      best = v;
    }
    return best;
  }
  // Where this fighter has v to go by: online, a player goes by where they saw v on their own
  // screen, a moment ago (see pastOf in online.js); anyone else, where v is.
  seen(v) {
    return (this.rewind && this.game.pastOf?.(v, this.rewind)) || v;
  }
  // Who the cloak's stab goes for: the nearest in reach. Online, it's whoever that was on the
  // player's own screen (preyHint; null for nobody), if that's anywhere near right here too.
  stabVictim() {
    const h = this.preyHint;
    if (h === undefined) return this.foeNear(LUNGE_RANGE);
    if (!h?.alive || (h.hidden && !h.glimpsedLately) || !this.game.foes(this, h)) return null;
    const s = this.seen(h);
    return Math.hypot(s.x - this.x, s.y - this.y) < LUNGE_RANGE + 24 && this.game.los(this.x, this.y - 14, s.x, s.y - 14) ? h : null;
  }
  // cloaked, with the stab still to use: who it could dash in on right now (marked with a "!")
  stabTarget() {
    const k = this.cloak;
    return k && !k.out && !k.used && !this.roll ? this.foeNear(LUNGE_RANGE) : null;
  }

  // ---------- the shadow clone (skill, Q) ----------
  // Q: a burst of mist, and out of it a double of you - your gun, your health
  // (as a share of a quarter of yours) - that fights on its own, if not well.
  // You're unseen for a moment (you can roll); when that's up, the double goes
  // too. Hurt: you're seen (the double fights on). Attack, or the double is
  // killed (or runs out): it goes up in mist and you're seen.

  updateDecoy(dt, c) {
    if (this.veil && (this.veil.t -= dt) <= 0) this.dropDecoy();   // your time unseen is up: the double goes with it
    if (this.decoy && (this.decoyLife -= dt) <= 0) this.dropDecoy();
    if (c.skill && !this.decoy && this.skillCD <= 0 && !this.onLadder && this.alive) this.castDecoy();
  }
  castDecoy() {
    const d = this.game.spawnDecoy?.(this);
    if (!d) return;
    this.decoy = d;
    this.decoyLife = DECOY_LIFE;
    this.veil = { t: VEIL_TIME };
    this.hook = null;
    // only you see it happen: to anyone else the double just carries on being you
    this.fade = { t: 0, dur: 0.4, out: true, seed: Math.random() * 100, rgb: SHADOW, secret: true };
    this.game.fx.mist(this.x, this.y, 26, this);
    this.game.fx.motes(this.x, this.y, 10, ['#9aaee8', '#c8d4ff', '#5a6a9a'], this);
  }
  // out of the veil: back into view
  unveil() {
    if (!this.veil) return;
    this.veil = null;
    this.fade = { t: 0, dur: 0.3, out: false, seed: Math.random() * 100, rgb: SHADOW };
    this.game.fx.mist(this.x, this.y, 10);
  }
  // the double goes (and you come out, if you're still unseen); the wait starts
  dropDecoy() {
    const d = this.decoy;
    if (!d) return;
    this.decoy = null;
    this.game.dropDecoy(d);
    this.unveil();
    this.skillCD = DECOY_CD;
  }

  // ---------- archery (skill, Q) ----------
  // Q: a bow of green light drawn back for a second (slowed, hands full) while
  // it locks on to every foe in reach - a green reticle closing on each and a
  // laser to them, for everyone to see. Loosed: one arrow up into the air that
  // bursts into an arrow for each one locked (see main.js: they curve after
  // their targets, but not so hard they can't be dodged, and walls stop them).

  get bowHand() {
    return { x: this.x + this.facing * 3, y: this.y - 32 + this.pose.body };   // (the grip, held up at the top of the head)
  }
  // where the shot bursts: straight up over the bow, under the ceiling if there is one
  burstPoint() {
    const h = this.bowHand, L = this.game.level, top = h.y - 10 - ARCH_UP;
    let y = h.y - 10;
    while (y > top && !L.solidAt(h.x, y - 8)) y -= 2;
    return { x: h.x, y };
  }
  updateArchery(dt, c) {
    const b = this.bow;
    if (!b) {
      if (c.skill && this.skillCD <= 0 && !this.onLadder && this.alive) {
        this.bow = { t: 0, locks: [], fired: false, out: 0 };
        this.game.fx.motes(this.x, this.y, 10, ['#7aff8a', '#c8ffc8', '#2ad05a']);
      }
      return;
    }
    if (b.fired) {
      if ((b.out += dt) > 0.25) this.bow = null;
      return;
    }
    b.t += dt;
    b.point = this.burstPoint();
    for (const v of this.game.fighters) {
      if (b.locks.length >= ARCH_MAX) break;
      if (v === this || !v.alive || v.vanish || !this.game.foes(this, v) || b.locks.some((l) => l.v === v)) continue;   // (the unseen too: see below)
      if (Math.hypot(v.x - this.x, v.y - this.y) <= ARCH_RANGE) b.locks.push({ v, t: 0 });
    }
    b.locks = b.locks.filter((l) => l.v.alive && !l.v.vanish && Math.hypot(l.v.x - this.x, l.v.y - this.y) <= ARCH_RANGE * 1.25);
    for (const l of b.locks) {
      l.t += dt;
      l.v.exposeT = 0.3;   // the lock shows them up, cloak or no cloak, for as long as it's on them
    }
    if (b.t >= ARCH_CHARGE) {
      b.fired = true;
      this.skillCD = ARCH_CD;
      this.game.loose?.(this, b.locks.map((l) => l.v), b.point);
    }
  }
  // After the lighting, for everyone to see: the rune ring at the feet, a star
  // where the shot will burst, green lasers from it to everything locked on, a
  // lock-on mark on each, and the crystal bow.
  drawArchery(ctx) {
    const b = this.bow;
    if (!b || !this.alive) return;
    const k = Math.min(1, b.t / ARCH_CHARGE), t = this.game.time, fade = b.fired ? Math.max(0, 1 - b.out / 0.25) : 1;
    const x = Math.round(this.x), y = Math.round(this.y), h = this.bowHand, P = b.point ?? this.burstPoint();
    const put = (px, py, col, al = 1) => { ctx.globalAlpha = al * fade; ctx.fillStyle = col; ctx.fillRect(Math.round(px), Math.round(py), 1, 1); };
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // a green bloom round the bow, swelling as it draws
    const gr = ctx.createRadialGradient(h.x, h.y + 2, 0, h.x, h.y + 2, 24);
    gr.addColorStop(0, `rgba(150, 255, 170, ${(0.2 + 0.3 * k) * fade})`);
    gr.addColorStop(1, 'rgba(60, 255, 110, 0)');
    ctx.fillStyle = gr;
    ctx.fillRect(h.x - 24, h.y - 22, 48, 48);
    // the rune ring at the feet
    const R = 19 - 7 * k;
    for (let i = 0; i < 44; i++) {
      if ((i + Math.floor(t * 18)) % 5 > 2) continue;
      const a = (i / 44) * Math.PI * 2;
      put(x + Math.cos(a) * R, y - 1 + Math.sin(a) * R * 0.28, i % 5 ? '#5aff7a' : '#d8ffd8', 0.9);
    }
    if (!b.fired) {
      // the burst point: a turning four-point star, and a faint line up to it from the bow
      for (let yy = Math.round(h.y - 24); yy > P.y + 4; yy -= 3) put(h.x, yy, '#5aff7a', 0.35);
      const sa = t * 4, sr = 3 + k * 2;
      for (let q = 0; q < 4; q++) {
        const a = sa + (q * Math.PI) / 2;
        for (let j = 0; j <= sr; j++) put(P.x + Math.cos(a) * j, P.y + Math.sin(a) * j, j < 2 ? '#ffffff' : '#7aff8a');
      }
      const pg = ctx.createRadialGradient(P.x, P.y, 0, P.x, P.y, 10);
      pg.addColorStop(0, `rgba(160, 255, 170, ${0.5 * fade})`);
      pg.addColorStop(1, 'rgba(60, 255, 110, 0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = pg;
      ctx.fillRect(P.x - 10, P.y - 10, 20, 20);
      // the lasers: from the burst point to each one locked, a brighter pulse running down
      for (const l of b.locks) {
        const tx = l.v.x, ty = l.v.y - 14, dx = tx - P.x, dy = ty - P.y, n = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
        const lk = Math.min(1, l.t / 0.35);
        for (let i = 0; i <= n; i++) {
          const pulse = ((i - t * 160) % 16 + 16) % 16 < 3;
          if (!pulse && lk < 1 && (i + Math.floor(t * 40)) % 3 === 0) continue;   // flickering till it's locked
          put(P.x + (dx * i) / n, P.y + (dy * i) / n, pulse ? '#d8ffd8' : '#3aff6a', pulse ? 0.9 : 0.45);
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const l of b.locks) this.drawReticle(ctx, l, fade);
    ctx.restore();
  }
  // A lock-on mark: a ring round them with a cross on it at top, bottom and
  // either side, turning and closing in as the lock takes; locked, it holds
  // still and pulses, a dot at the heart.
  drawReticle(ctx, l, fade) {
    const v = l.v, lk = Math.min(1, l.t / 0.35), t = this.game.time, cx = Math.round(v.x), cy = Math.round(v.y - 14);
    const R = 9 + 7 * (1 - lk) + (lk >= 1 ? Math.sin(t * 12) * 0.6 : 0), rot = (1 - lk) * (Math.PI / 4);
    const pts = new Set();
    const add = (px, py) => pts.add(`${Math.round(px)},${Math.round(py)}`);
    for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; add(cx + Math.cos(a) * R, cy + Math.sin(a) * R); }
    for (let q = 0; q < 4; q++) {
      const a = rot + (q * Math.PI) / 2, mx = cx + Math.cos(a) * R, my = cy + Math.sin(a) * R;
      for (let j = -2; j <= 2; j++) { add(mx + j, my); add(mx, my + j); }
    }
    if (lk >= 1) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) add(cx + dx - 0.5, cy + dy - 0.5);
    ctx.globalAlpha = fade;
    ctx.fillStyle = '#0b100f';
    for (const p of pts) { const [px, py] = p.split(',').map(Number); ctx.fillRect(px + 1, py + 1, 1, 1); }
    ctx.fillStyle = lk >= 1 ? '#7aff8a' : '#3ae06a';
    for (const p of pts) { const [px, py] = p.split(',').map(Number); ctx.fillRect(px, py, 1, 1); }
    ctx.globalAlpha = 1;
  }
  // Drawing the bow (with the body, in place of the arms): the crystal bow held
  // up over the head by its grip, the string pulled down to the chin as it
  // charges with an arrow of light on it, a fist round the grip and the other
  // hand at the string. Loosed: the string springs back, the bow fades.
  drawBowArms(ctx) {
    const b = this.bow, h = this.bowHand, B = CRYSTAL_BOW, k = Math.min(1, b.t / ARCH_CHARGE), fade = b.fired ? Math.max(0, 1 - b.out / 0.25) : 1;
    const put = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); };
    const nx = h.x, ny = h.y + B.tipY + 2 + (b.fired ? 0 : 8 * k);   // the nock, drawn down
    ctx.globalAlpha = fade;
    ctx.drawImage(B.img, Math.round(h.x - B.cx), Math.round(h.y - B.cy));
    for (const side of [-1, 1]) {
      const tx = h.x + side * 14, ty = h.y + B.tipY;
      for (let i = 0; i <= 16; i++) { const u = i / 16; put(tx + (nx - tx) * u, ty + (ny - ty) * u, i % 2 ? '#c8ffd0' : '#f0fff0'); }
    }
    if (!b.fired) {
      for (let i = 0; i <= 26; i++) put(nx, ny - i, i > 23 ? '#ffffff' : i < 3 ? '#2ad05a' : '#b8ffc8');   // the arrow
      const hy = ny - 26;
      for (const side of [-1, 1]) for (let j = 1; j <= 2; j++) put(nx + side * j, hy + j + 1, '#e8ffe8');
      for (const side of [-1, 1]) for (let j = 1; j <= 2; j++) put(nx + side * j, ny - j + 1, '#3ae06a');   // fletching
    }
    ctx.globalAlpha = 1;
    // a fist round the grip, lying flat (the bow's held level); the other upright at the string
    ctx.save();
    ctx.translate(Math.round(h.x), Math.round(h.y));
    ctx.rotate(Math.PI / 2);
    drawHand(ctx, 'grab', 0, 0);
    ctx.restore();
    drawHand(ctx, 'grab', Math.round(nx), Math.round(ny + 1));
  }

  // ---------- murasaki (skill, Q) ----------
  // Q: weapons away, hands out - a red black-hole orb at one side, a blue at
  // the other; they close in, circling each other, and hit (a white flash, a
  // shockwave) and out of that comes a purple one, crackling with lightning,
  // in front of you. Then it goes, straight down the aim (see main.js: it
  // erases everything it passes through, walls no matter). Slowed right down
  // while it builds, and no attacking or rolling.

  muraPoints() {
    const m = this.mura, t = m.t, c = { x: this.x, y: this.y - 17 + this.pose.body }, a = this.aim;
    const front = { x: c.x + Math.cos(a) * 14, y: c.y + Math.sin(a) * 14 };
    const side = (s) => ({ x: c.x + s * 17, y: c.y - 2 });
    if (t < RED_BLUE) return { red: side(-1), blue: side(1), front, grow: Math.min(1, t / 0.28) };
    const k = Math.min(1, (t - RED_BLUE) / (MERGE - RED_BLUE)), e = k * k * (3 - 2 * k);
    // closing in on the point in front, swinging round each other as they go
    const at = (s) => {
      const p = side(s), sw = Math.sin(e * Math.PI) * 7 * s;
      return { x: p.x + (front.x - p.x) * e - Math.sin(a) * sw, y: p.y + (front.y - p.y) * e + Math.cos(a) * sw };
    };
    return { red: at(-1), blue: at(1), front, grow: 1, merged: t >= MERGE };
  }
  updateMurasaki(dt, c) {
    const m = this.mura;
    if (!m) {
      if (c.skill && this.skillCD <= 0 && !this.onLadder && this.alive) this.mura = { t: 0, flash: false };
      return;
    }
    const before = m.t;
    m.t += dt;
    if (before < MERGE && m.t >= MERGE) {
      // the collision: a white flash, a burst of red, blue and purple
      const p = this.muraPoints().front;
      this.game.fx.sparks(p.x, p.y, 14, 0, 0, '#ffffff');
      this.game.fx.sparks(p.x, p.y, 8, -1, 0, '#ff6a7a');
      this.game.fx.sparks(p.x, p.y, 8, 1, 0, '#6ab8ff');
      this.game.lights.flash(p.x, p.y, 80, '200, 140, 255', 0.15);
      if (this.game.viewer === this) this.game.kick?.(0, -3);
      m.flashT = 0;
    }
    if (m.flashT !== undefined) m.flashT += dt;
    if (m.t >= MURA_CHARGE) {
      const p = this.muraPoints().front;
      this.game.hollowPurple?.(this, p.x, p.y, this.aim);
      this.vx -= Math.cos(this.aim) * 140;   // the kick of it
      this.skillCD = MURA_CD;
      this.mura = null;
    }
  }
  // Hands open toward the orbs (each to its own side), then both reaching out to the purple.
  drawMuraArms(ctx) {
    const P = this.muraPoints();
    if (!P.merged) {
      for (const o of [P.red, P.blue]) drawHand(ctx, 'open', Math.round(this.x + (o.x - this.x) * 0.55), Math.round(o.y + 3));
    } else {
      const a = this.aim;
      drawHand(ctx, 'open', Math.round(this.x + Math.cos(a) * 8), Math.round(this.y - 15 + Math.sin(a) * 8));
      drawHand(ctx, 'open', Math.round(this.x + Math.cos(a) * 5 - this.facing), Math.round(this.y - 12 + Math.sin(a) * 5));
    }
  }
  // After the lighting: the orbs, the flash where they meet, the purple and its
  // lightning, and a faint purple line down the aim (anyone can see it coming).
  drawMurasaki(ctx) {
    const m = this.mura;
    if (!m || !this.alive) return;
    const P = this.muraPoints(), t = this.game.time;
    // the aim
    const a = this.aim;
    ctx.fillStyle = '#c070ff';
    for (let i = 12; i < 220; i += 4) {
      ctx.globalAlpha = 0.35 * Math.min(1, m.t / 0.4) * (1 - i / 220);
      ctx.fillRect(Math.round(P.front.x + Math.cos(a) * i), Math.round(P.front.y + Math.sin(a) * i), 2, 1);
    }
    ctx.globalAlpha = 1;
    if (!P.merged) {
      const R = 5 * P.grow;
      drawOrb(ctx, P.red.x, P.red.y, R, ORB.red, t);
      drawOrb(ctx, P.blue.x, P.blue.y, R, ORB.blue, t + 1.3);
      return;
    }
    const k = Math.min(1, (m.t - MERGE) / (MURA_CHARGE - MERGE)), f = m.flashT ?? 9;
    if (f < 0.12) {
      // the flash where they hit: a white disc and a ring thrown off
      ctx.fillStyle = '#ffffff';
      const r = 4 + f * 60;
      for (let i = 0; i < 48; i++) { const q = (i / 48) * Math.PI * 2; ctx.fillRect(Math.round(P.front.x + Math.cos(q) * r), Math.round(P.front.y + Math.sin(q) * r), 1, 1); }
      ctx.beginPath();
      ctx.arc(P.front.x, P.front.y, 7 * (1 - f / 0.12) + 2, 0, Math.PI * 2);
      ctx.fill();
    }
    drawVoidHole(ctx, ctx, P.front.x, P.front.y, 5 + 6 * k, t, 3, (m.pix ??= {}));
    drawBolts(ctx, P.front.x, P.front.y, 5 + 6 * k, 2 + Math.round(k * 4), t, 10 + k * 12);
  }

  // ---------- flame fist (skill, Q) ----------
  // Q: weapons away, fists up in a guard and set alight - the fire builds on
  // them, embers drawn in (slowed right down, no attacking or rolling while it
  // does) - then off like a shot down the aim, a comet of fire, and the first
  // foe in the way takes the punch: a terrible hit and flung away, and it all
  // goes up round them (see main.js: the blast). A wall or the floor in the
  // way, it goes off there; nothing at all, it goes off at the end of the dash.

  updateBlaze(dt, c) {
    const b = this.blaze;
    if (!b) {
      if (c.skill && this.skillCD <= 0 && !this.onLadder && !this.roll && this.alive) {
        this.blaze = { phase: 'charge', t: 0, a: this.aim, dist: 0, trail: [], seed: Math.random() * 100 };
        if (this.weapon?.reloading) this.weapon.cancelReload();
        this.hook = null;
      }
      return;
    }
    b.t += dt;
    if (b.phase === 'charge') {
      b.a = this.aim;
      const p = this.blazeFist();
      if (Math.random() < 12 * dt) this.game.fx.sparks(p.x, p.y, 1, 0, -1, Math.random() < 0.5 ? '#ffd27a' : '#ff8a3a');
      if (b.t >= BLAZE_CHARGE) {
        // off: a burst of flame where it leaves, and a jolt
        b.phase = 'dash';
        b.t = 0;
        this.onLadder = false;
        this.crouch = false;
        this.game.fx.sparks(this.x, this.y - 14, 10, -Math.cos(b.a), -Math.sin(b.a), '#ffb04a');
        this.game.fx.smoke(this.x, this.y - 8, 4);
        this.game.lights.flash(this.x, this.y - 14, 70, '255, 140, 60', 0.15);
        if (this.game.viewer === this) this.game.kick?.(-Math.cos(b.a) * 3, -Math.sin(b.a) * 3);
      }
    } else if (b.phase === 'hit' && b.t >= BLAZE_RECOVER) {
      this.blaze = null;
      this.skillCD = BLAZE_CD;
      return;
    }
    if (b.phase !== 'charge') { this.aim = b.a; this.facing = Math.cos(b.a) >= 0 ? 1 : -1; }   // (locked to the line it went)
  }
  // Each step of the dash (after moving `moved` px): the trail of fire behind, and
  // whether the fist has met someone, or a wall, or the end of its reach.
  blazeStep(moved, dt) {
    const b = this.blaze, ux = Math.cos(b.a), uy = Math.sin(b.a);
    b.dist += moved;
    b.trail.unshift({ x: this.x, y: this.y });
    b.trail.length = Math.min(b.trail.length, 9);
    const p = this.blazeFist();
    for (const v of this.game.fighters) {
      if (v === this || !v.alive || v.vanish || !this.game.foes(this, v)) continue;
      const s = this.seen(v);
      if (Math.abs(s.x - p.x) > 11 || p.y < s.y - 34 || p.y > s.y + 4) continue;   // the fist anywhere on them, head to feet
      return this.blazeLand(p.x, p.y, v);
    }
    if (moved < BLAZE_SPEED * dt * 0.35) return this.blazeLand(p.x + ux * 3, p.y + uy * 3, null);   // into a wall (or the floor)
    if (b.dist >= BLAZE_RANGE) this.blazeLand(p.x, p.y, null);   // as far as it goes: it goes off in the air
  }
  blazeLand(x, y, v) {
    const b = this.blaze, ux = Math.cos(b.a), uy = Math.sin(b.a);
    b.phase = 'hit';
    b.t = 0;
    if (v) {
      v.hitHow = 'FLAME FIST';
      v.hurt(BLAZE_DMG, this, ux * 520, -220 + uy * 160);
    }
    // knocked back off it
    this.vx = -ux * 110;
    this.vy = Math.min(0, -uy * 80) - 90;
    this.game.flameFist?.(this, x, y, b.a, v);
  }
  // where the burning fist is: drawn right back behind you while it charges
  // (the other up in a guard in front), then thrown out down the line (and
  // drawn back in after)
  blazeFist(lead = true) {
    const b = this.blaze, f = this.facing, y = this.y + this.pose.body;
    if (b.phase === 'charge') {
      const k = Math.min(1, b.t / 0.18);   // (pulling back)
      return lead ? { x: this.x + f * (4 - 12 * k), y: y - 14 + k } : { x: this.x + f * 6, y: y - 15 };
    }
    if (!lead) return { x: this.x - f, y: y - 14 };
    const reach = b.phase === 'dash' ? 11 : 11 - 6 * Math.min(1, b.t / BLAZE_RECOVER);
    return { x: this.x + Math.cos(b.a) * reach, y: y - 15 + Math.sin(b.a) * reach };
  }
  // the wind-up (the punching fist back, the other up in front, shaking as the fire grows), then the punch
  drawBlazeArms(ctx) {
    const b = this.blaze, k = b.phase === 'charge' ? Math.min(1, b.t / BLAZE_CHARGE) : 0;
    const sh = () => Math.round((Math.random() - 0.5) * k * 1.6);
    const back = this.blazeFist(false), lead = this.blazeFist(true);
    drawHand(ctx, 'open', Math.round(back.x) + sh(), Math.round(back.y) + sh());
    drawHand(ctx, 'open', Math.round(lead.x) + sh(), Math.round(lead.y) + sh());
  }
  // After the lighting: the fire. Charging: the fists alight and burning
  // higher, a heat-glow round you, embers spiralling in, a faint line of fire
  // down the aim. Dashing: orange afterimages of you down the way you came, the
  // fist a comet of flame streaming back, fire left hanging in the air behind.
  drawBlaze(ctx) {
    const b = this.blaze;
    if (!b || !this.alive) return;
    const t = this.game.time, ux = Math.cos(b.a), uy = Math.sin(b.a), p = this.blazeFist(true);
    if (b.phase === 'charge') {
      const k = Math.min(1, b.t / BLAZE_CHARGE), q = this.blazeFist(false);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(this.x, this.y - 14, 0, this.x, this.y - 14, 36);
      gr.addColorStop(0, `rgba(255, 120, 40, ${0.28 * k})`);
      gr.addColorStop(1, 'rgba(255, 80, 0, 0)');
      ctx.fillStyle = gr;
      ctx.fillRect(this.x - 36, this.y - 50, 72, 72);
      ctx.restore();
      // the aim
      ctx.fillStyle = '#ff9a3a';
      for (let i = 14; i < BLAZE_RANGE; i += 5) {
        ctx.globalAlpha = 0.35 * k * (1 - i / BLAZE_RANGE);
        ctx.fillRect(Math.round(this.x + ux * i), Math.round(this.y - 15 + this.pose.body + uy * i), 2, 1);   // (from the chest)
      }
      // embers drawn in to the fists
      for (let i = 0; i < 12; i++) {
        const ph = (t * 1.7 + i / 12) % 1, ang = i * 2.39 + t * 4, r = 4 + (1 - ph) * 24;
        ctx.globalAlpha = ph * (0.3 + 0.7 * k);
        ctx.fillStyle = i % 3 ? '#ffb04a' : '#fff0b0';
        ctx.fillRect(Math.round(p.x + Math.cos(ang) * r), Math.round(p.y + Math.sin(ang) * r), 1, 1);
      }
      ctx.globalAlpha = 1;
      drawFlame(ctx, q.x, q.y, 0.8 + k * 1.4, t, b.seed + 5);
      drawFlame(ctx, p.x, p.y, 2 + k * 4.5, t, b.seed);
      return;
    }
    if (b.phase === 'dash') {
      // afterimages: you, burned orange, down the way you came
      const [c] = this.paintSelf(0.8, '255, 110, 30');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      b.trail.forEach((q, i) => {
        if (i % 2 === 0 || i > 7) return;
        ctx.globalAlpha = 0.5 * (1 - i / 8);
        ctx.drawImage(c, Math.round(q.x) - 32, Math.round(q.y) - 50);
      });
      ctx.restore();
      // fire left hanging behind
      b.trail.forEach((q, i) => {
        if (i === 0) return;
        drawFlame(ctx, q.x + ux * 11, q.y - 15 + uy * 11, 4.5 * (1 - i / b.trail.length), t, b.seed + i * 7, 0, -1, 1.7);
      });
      // speed lines past you
      ctx.fillStyle = 'rgba(255, 230, 180, 0.7)';
      for (let i = 0; i < 5; i++) {
        const o = (((i * 37 + Math.floor(t * 60)) % 22) - 11), sx = this.x - ux * (14 + i * 6) - uy * o, sy = this.y - 14 - uy * (14 + i * 6) + ux * o;
        for (let s = 0; s < 8; s++) ctx.fillRect(Math.round(sx - ux * s), Math.round(sy - uy * s), 1, 1);
      }
      // the comet: the fist in a great flame streaming back
      drawFlame(ctx, p.x, p.y, 6.5, t, b.seed, -ux, -uy, 4.2);
      return;
    }
    // coming out of it: the fist still burning, going out
    drawFlame(ctx, p.x, p.y, 4 * (1 - b.t / BLAZE_RECOVER), t, b.seed);
  }

  // ---------- galaxy (skill, Q) ----------
  // Q: weapons away, both hands out toward where you aim - a magic circle opens
  // there (as far off as GAL_RANGE) and stays there while it's cast, light
  // streaming from your hands into it (slowed right down, no attacking or
  // rolling); cast, a black hole opens in it, drags everyone near in and goes
  // off (see main.js). You're free the moment it's cast.

  // where it's being cast: the aim point, no further than GAL_RANGE from your chest, and on this side of
  // any wall in the way (catwalks don't count)
  galPoint() {
    const sx = this.x, sy = this.y - 16, t = this.aimTarget ?? { x: sx + Math.cos(this.aim) * 140, y: sy + Math.sin(this.aim) * 140 };
    const dx = t.x - sx, dy = t.y - sy, d = Math.hypot(dx, dy) || 1, r = Math.min(d, GAL_RANGE), L = this.game.level;
    for (let at = 2; at < r + 2; at += 2) {
      if (!L.solidAt(sx + (dx / d) * Math.min(at, r), sy + (dy / d) * Math.min(at, r))) continue;
      const back = Math.max(0, Math.min(at, r) - GAL_WALL);
      return { x: sx + (dx / d) * back, y: sy + (dy / d) * back };
    }
    return { x: sx + (dx / d) * r, y: sy + (dy / d) * r };
  }
  updateGalaxy(dt, c) {
    const m = this.gal;
    if (!m) {
      if (c.skill && this.skillCD <= 0 && !this.onLadder && !this.roll && this.alive) {
        this.gal = { t: 0, ...this.galPoint(), seed: Math.random() * 100 };
        if (this.weapon?.reloading) this.weapon.cancelReload();
        this.hook = null;
      }
      return;
    }
    m.t += dt;   // (where it's going was settled the moment Q went down)
    if (m.t >= GAL_CAST) {
      this.game.galaxy?.(this, m.x, m.y, m.seed);
      this.gal = null;
      this.skillCD = GAL_CD;
    }
  }
  // both hands held out open toward the circle
  drawGalArms(ctx) {
    const m = this.gal, y = this.y + this.pose.body, a = Math.atan2(m.y - (y - 15), m.x - this.x);
    drawHand(ctx, 'open', Math.round(this.x + Math.cos(a) * 8), Math.round(y - 16 + Math.sin(a) * 8));
    drawHand(ctx, 'open', Math.round(this.x + Math.cos(a) * 6 - this.facing), Math.round(y - 12 + Math.sin(a) * 6));
  }
  // After the lighting: light streaming from your hands into the circle being cast (the circle: see main.js).
  drawGalCast(ctx) {
    const m = this.gal;
    if (!m || !this.alive) return;
    const t = this.game.time, y = this.y + this.pose.body - 15, a = Math.atan2(m.y - y, m.x - this.x);
    const hx = this.x + Math.cos(a) * 9, hy = y + Math.sin(a) * 9, d = Math.hypot(m.x - hx, m.y - hy);
    for (let i = 0; i < 14; i++) {
      const ph = (t * 1.8 + i / 14) % 1, w = Math.sin(ph * Math.PI * 3 + i) * 3;
      ctx.globalAlpha = Math.sin(ph * Math.PI) * Math.min(1, m.t * 4);
      ctx.fillStyle = i % 3 ? '#7af0ff' : '#b67aff';
      ctx.fillRect(Math.round(hx + Math.cos(a) * d * ph - Math.sin(a) * w), Math.round(hy + Math.sin(a) * d * ph + Math.cos(a) * w), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- flying swords (skill, Q) ----------
  // Q: weapons away, both hands thrown up - a magic circle opens upright behind you (slowed right down, no
  // attacking or rolling) - and out of it come five swords of light, to hang in a fan behind you and go for
  // whoever comes near, one blow each (see main.js). The wait starts when the last of them has gone.

  updateSummon(dt, c) {
    const m = this.summon;
    if (!m) {
      if (c.skill && this.skillCD <= 0 && !this.swordsOut && !this.onLadder && !this.roll && this.alive) {
        this.summon = { t: 0, seed: Math.random() * 100 };
        if (this.weapon?.reloading) this.weapon.cancelReload();
        this.hook = null;
      }
      return;
    }
    m.t += dt;
    if (m.t >= SUM_CAST) {
      this.game.summonSwords?.(this, m.seed);
      this.summon = null;
      this.swordsOut = true;
    }
  }
  // both hands thrown up overhead, open, trembling with it
  drawSumArms(ctx) {
    const y = this.y + this.pose.body, sh = () => Math.round((Math.random() - 0.5) * 1.2);
    drawHand(ctx, 'open', Math.round(this.x - this.facing * 3) + sh(), y - 27 + sh());
    drawHand(ctx, 'open', Math.round(this.x + this.facing * 5) + sh(), y - 28 + sh());
  }
  // After the lighting: ice-blue light streaming up from your hands and round into the circle (the circle: see main.js).
  drawSumCast(ctx) {
    const m = this.summon;
    if (!m || !this.alive) return;
    const t = this.game.time, hx = this.x + this.facing, hy = this.y + this.pose.body - 29, cy = this.y - 17;
    for (let i = 0; i < 16; i++) {
      const ph = (t * 1.6 + i / 16) % 1, a = (i / 16) * Math.PI * 2 + t * 2, tx = this.x + Math.cos(a) * 24, ty = cy + Math.sin(a) * 24;
      ctx.globalAlpha = Math.sin(ph * Math.PI) * Math.min(1, m.t * 5);
      ctx.fillStyle = i % 3 ? '#8fe0ff' : '#ffffff';
      ctx.fillRect(Math.round(hx + (tx - hx) * ph), Math.round(hy + (ty - hy) * ph), 1, 1);
    }
    ctx.globalAlpha = 1;
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
    const pellets = d.pellets ?? 1, dir = this.shotDir(g, m), rnd = this.shotSeed ? seeded(this.shotSeed) : Math.random;
    const air = this.onGround ? 1 : 1.5;
    for (let i = 0; i < pellets; i++) {
      const spread = pellets > 1 ? ((i / (pellets - 1)) * 2 - 1 + (rnd() - 0.5) * 0.4) * w.spread : (rnd() * 2 - 1) * w.spread * air;
      const speed = d.bulletSpeed * (pellets > 1 ? 0.85 + rnd() * 0.3 : 1);
      this.game.fireBullet(this, m.x, m.y, dir + spread, speed, w.damage * DAMAGE * gunMul(d) * (this.game.gunDamage ?? 1), d.range ?? 520, d.pierce ?? 0);
    }
    if (!d.action && !d.keepsShells) this.ejectShell(g);
    this.lastFireT = 0;
    // a shove from the heavy ones, mostly felt in the air
    const kick = Math.min(110, w.damage * DAMAGE * gunMul(d) * pellets * 0.7) * (this.onGround ? 0.25 : 0.8);
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
      for (let cx = Math.floor(l / T); cx <= Math.floor((r - 0.01) / T); cx++) {
        const v = L.get(cx, cy);
        if (v === SOLID) return { l: cx * T, t: cy * T, r: cx * T + T, b: cy * T + T };
        if (v === LOW && t < cy * T + LOW_H) return { l: cx * T, t: cy * T, r: cx * T + T, b: cy * T + LOW_H };
      }
    for (const p of this.game.props) if (p.solid && l < p.box.r && r > p.box.l && t < p.box.b && b > p.box.t) return p.box;
    return null;
  }

  room(h) {
    return !this.hits(this.x - HALF_W, this.y - h, this.x + HALF_W, this.y);
  }

  move(dt) {
    this.unstick();
    const n = Math.max(1, Math.ceil((Math.max(Math.abs(this.vx), Math.abs(this.vy)) * dt) / MOVE_STEP));
    for (let i = 0; i < n; i++) this.moveStep(dt / n);
  }

  // Caught inside something (a crate thrown onto it, standing up under a ceiling): out to the nearest place the
  // body fits - on this side of the wall, never out through it, unless it's in so deep there's no other way.
  unstick() {
    const h = this.h, fits = (x, y) => !this.hits(x - HALF_W, y - h, x + HALF_W, y);
    if (fits(this.x, this.y)) return;
    const deep = !!this.hits(this.x - HALF_W, this.y - 1, this.x + HALF_W, this.y);
    let any = null;
    for (let r = 2; r <= 40; r += 2) for (const [ux, uy] of UNSTICK) {
      const x = this.x + ux * r, y = this.y + uy * r;
      if (!fits(x, y)) continue;
      if (this.game.los(this.x, this.y - 1, x, y - 1)) { this.x = x; this.y = y; return; }
      any ??= { x, y };
    }
    if (any && deep) { this.x = any.x; this.y = any.y; }
  }

  moveStep(dt) {
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
    if (this.y - this.h < 0) { this.y = this.h; this.vy = Math.max(0, this.vy); }   // the top of the map's as far up as anyone goes (outdoors, there's no roof)
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
  // ladder at the body (to climb up), not only under the feet
  ladderAt() {
    const L = this.game.level, cx = Math.floor(this.x / T);
    return [this.y - 2, this.y - 12].some((y) => L.get(cx, Math.floor(y / T)) === LADDER);
  }
  ladderBelow() {
    return this.game.level.get(Math.floor(this.x / T), Math.floor((this.y + 2) / T)) === LADDER;
  }

  // ---------- being hit ----------

  hurt(dmg, from, kx, ky, head = false) {
    if (!this.alive || this.vanish) return false;
    if (this.roll && this.roll.t < ROLL_SAFE && !this.blast) return false;   // diving under it
    if (this.shield > 0) return false;   // just beamed back in
    const d = dmg * (head ? HEAD_MUL : 1);
    this.hp -= d;
    this.flash = 0.06;
    this.hurtT = 0;
    this.hitBy = from?.isDecoy ? from.owner : from;   // (the bots: who it was)
    this.vx += kx * (this.dummy ? 0.25 : 1);
    this.vy += ky * (this.dummy ? 0.25 : 1);
    if (this.onLadder && Math.abs(kx) > 80) this.onLadder = false;
    // the damage number that pops up (head / blast / critical / melee / body), training's meter
    this.game.onHurt?.(this, d, head ? 'head' : this.blast ? 'blast' : this.hitHow === 'BACKSTAB' ? 'crit' : this.hitHow ? 'melee' : 'body', from);
    if (this.vanish) return false;   // a shadow clone going up in mist
    if (this.veil) this.dropDecoy();   // hurt behind a shadow clone: you're seen, and the double goes (never the two of you at once)
    // hurt while cloaked: seen (a stab already going in finishes first)
    if (this.cloak) { if (this.melee.t >= 0) this.cloak.out = true; else this.uncloak(); }
    if (this.immortal) this.hp = Math.max(1, this.hp);   // training: dummies (and you) can't die
    if (this.hp <= 0) this.die(from, head ? 'HEADSHOT' : null, kx, ky);
    return true;
  }

  die(killer, how, kx, ky) {
    if (!this.alive) return;
    if (this.isDecoy) { this.hp = 0; this.owner?.decoy === this ? this.owner.dropDecoy() : this.game.dropDecoy(this); return; }
    if (this.decoy) { const d = this.decoy; this.decoy = null; this.game.dropDecoy(d); }
    this.veil = null;
    this.bow = null;
    this.mura = null;
    this.blaze = null;
    this.gal = null;
    this.summon = null;
    this.alive = false;
    this.hp = 0;
    this.killer = killer;
    this.deadT = 0;
    this.onLadder = false;
    this.roll = null;
    this.hook = null;
    this.lunge = null;
    if (this.cloak) { this.melee = this.cloak.saved; this.cloak = null; }   // (the shade knife goes with the cloak)
    this.fade = null;
    this.corpse = { x: this.x, y: this.y, vx: this.vx * 0.6 + kx * 0.4, vy: Math.min(-80, this.vy - 120), rot: 0, spin: (Math.sign(kx || this.facing) || 1) * (6 + Math.random() * 4), down: false, melted: how === 'MELTED' };
    if (this.weapon) this.game.fx.thrownGun(this, this.weapon);
    this.gun = null;
    this.slashes = [];
    this.game.onDeath(this, killer, how);
  }

  updateCorpse(dt) {
    this.deadT += dt;
    const c = this.corpse;
    if (!c || c.down) return;
    c.vy = Math.min(560, c.vy + GRAVITY * dt);
    c.vx *= Math.exp(-1.5 * dt);
    const L = this.game.level, H = 10, W = 4;
    const box = (x, y) => this.hits(x - W, y - H, x + W, y);
    // stuck in something (knocked into a wall as it died): up out of it
    for (let k = 0; k < 16 && box(c.x, c.y); k++) c.y -= 1;
    const steps = Math.max(1, Math.ceil((Math.max(Math.abs(c.vx), Math.abs(c.vy)) * dt) / 3));
    for (let i = 0; i < steps && !c.down; i++) {
      const h = (c.vx * dt) / steps, v = (c.vy * dt) / steps;
      if (h) {
        if (box(c.x + h, c.y)) { c.vx *= -0.3; c.spin *= 0.5; }
        else c.x += h;
      }
      if (!v) continue;
      const ny = c.y + v, hit = box(c.x, ny);
      if (v < 0) {
        if (hit) { c.y = hit.b + H + 0.01; c.vy = 0; }   // a ceiling
        else c.y = ny;
        continue;
      }
      // falling: onto something solid, a catwalk or into the acid
      let top = hit ? hit.t : null;
      if (top === null) for (let cy = Math.floor(c.y / T); cy <= Math.floor(ny / T); cy++) {
        const cell = L.get(Math.floor(c.x / T), cy);
        if ((cell === PLAT || cell === ACID) && cy * T >= c.y - 0.01 && cy * T <= ny) { top = cy * T; c.melted = c.melted || cell === ACID; break; }
      }
      if (top === null) { c.y = ny; continue; }
      c.y = top;
      if (Math.abs(c.vy) > 200) { c.vy *= -0.25; c.vx *= 0.5; this.game.fx.blood(c.x, c.y - 3, 6, 0, -1); }
      else c.down = true;
      break;
    }
    c.rot += c.spin * dt;
    if (c.down || c.vy === 0) c.spin *= 0.8;
    if (c.down) c.rot = Math.cos(c.rot) >= 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  // ---------- animation (the main game's walk / idle) ----------

  // A kick to the body's spring: + squashes it down, - stretches it up.
  bounce(v) {
    this.sqV += v;
  }

  animate(dt) {
    const pose = this.pose;
    if (this.fade && (this.fade.t += dt) >= this.fade.dur) this.fade = null;
    pose.headX = 0;
    this.settle = Math.max(0, this.settle - dt);
    // the spring: overshoots and wobbles back a couple of times before it settles
    this.sqV += (-SPRING_K * this.sq - SPRING_D * this.sqV) * dt;
    this.sq = Math.max(-2.5, Math.min(4, this.sq + this.sqV * dt));
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
      // in the air: knees up going up, tucked at the top, legs reaching down coming down
      const top = Math.abs(this.vy) < 70;
      pose.legL = top ? [-1, 3] : this.vy < 0 ? [-1, 2] : [-1, 1];
      pose.legR = top ? [1, 3] : this.vy < 0 ? [1, 1] : [1, 0];
      pose.body = this.vy < -70 ? -1 : 0;
      pose.head = pose.body + (this.vy > 200 ? -1 : 0);   // falling fast: the head lags up a touch
      return this.springPose(pose);
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
        if (STEP_FRAMES[f]) {
          this.game.fx.step(this.x + this.facing * 2, this.y);
          if (this.sprinting) this.game.fx.runDust(this.x, this.y, Math.sign(this.vx));
          this.bounce(this.sprinting ? 30 : 12);   // each footfall gives a little
        }
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
    if (this.crouch) {
      pose.body += CROUCH_BODY;
      pose.head += CROUCH_DROP;
      pose.legL = [pose.legL[0] - 1, 0];
      pose.legR = [pose.legR[0] + 1, 0];
    }
    this.springPose(pose);
  }

  // The spring on top of the pose: squashed, the body sinks and the head sinks
  // further (into the shoulders), the knees spread; stretched, the other way.
  springPose(pose) {
    const s = this.sq;
    if (s > 0) {
      pose.body += Math.round(s * 0.55);
      pose.head += Math.round(s);
      if (s > 1.6) { pose.legL = [pose.legL[0] - 1, pose.legL[1]]; pose.legR = [pose.legR[0] + 1, pose.legR[1]]; }
    } else {
      pose.body += Math.max(-1, Math.round(s * 0.5));
      pose.head += Math.max(-2, Math.round(s));
    }
  }

  // ---------- online: the others' screens ----------
  // Between one state of the game from the host and the next, what only moves with time carried on
  // here - the limbs and the bounce, the gun's kick and flash and the motion of a reload, a swing, a
  // skill building up - so it moves at the screen's own rate, not twenty times a second. Nothing the
  // host decides changes: ammo, health, what's in hand, whether a reload is done. (limbs: false - our
  // own fighter, whose limbs come from its stand-in; see online.js)
  // arms false: what's in hand and its skill are being run already (our own fighter, online: see stepOwn)
  coast(dt, limbs = true, arms = true) {
    const game = this.game;
    this.game = quietGame(game);   // (no dust of its own: the host's effects come with its state)
    try {
      this.hurtT += dt;
      this.lastFireT += dt;
      if (this.beamT !== undefined) this.beamT += dt;
      this.flash -= dt;
      this.exposeT -= dt;
      if (limbs && this.flipT >= 0) { this.flipT += dt / (this.onGround ? FLIP_LAND : FLIP_TIME); if (this.flipT >= 1 || this.onLadder) this.flipT = -1; }
      if (!this.alive) { this.deadT += dt; return; }
      if (limbs) this.animate(dt);
      if (limbs && this.onLadder) this.climbT += Math.abs(this.vy) * dt;
      if (arms && this.hook?.state === 'on') { this.trail.unshift({ x: this.x, y: this.y }); this.trail.length = Math.min(this.trail.length, 9); }
      else if (arms && this.trail.length) this.trail.pop();
      if (arms) {
        if (this.throwT >= 0) { this.throwT += dt / 0.35; if (this.throwT >= 1) this.throwT = -1; }
        if (this.slot === 1) {
          const m = this.melee;
          m.update(dt);
          this.tilt += (m.raising * RAISE_TILT - this.tilt) * Math.min(1, dt * 16);
        } else if (this.weapon) {
          const w = this.weapon, keep = { ammo: w.ammo, reserve: w._reserve, reloading: w.reloading, reload: w.reload };
          w.update(dt);
          w.ammo = keep.ammo;
          w._reserve = keep.reserve;
          if (keep.reloading && !w.reloading) w.reload = keep.reload;   // (done when the host says so - reloading is its progress, -1 when not)
          let tilt = !w.reloading ? 0
            : w.def.reload === 'shells' ? SHELL_TILT
            : w.def.reload === 'steps' ? (w.openAngle / w.def.openAngle) * STEP_TILT
            : Math.sin(Math.PI * Math.min(1, w.reload * 1.15)) * RELOAD_TILT;
          tilt += w.raising * RAISE_TILT;
          this.tilt += (tilt - this.tilt) * Math.min(1, dt * 16);
        }
        for (const sl of this.slashes) sl.t += dt;
        for (const c of this.cuts) c.t += dt;
      }
      if (arms) {
        for (const k of ['bow', 'mura', 'gal', 'summon']) if (this[k] && typeof this[k].t === 'number') this[k].t += dt;
        if (this.blaze?.phase === 'charge') this.blaze.t += dt;
        if (this.cloak && !this.cloak.out) { this.cloak.t -= dt; this.cloak.flick -= dt; }
        if (this.veil) this.veil.t -= dt;
      }
      if (this.roll && limbs) {
        this.roll.t = Math.min(0.99, this.roll.t + dt / ROLL_TIME);
        (this.roll.trail ??= []).unshift({ x: this.x, y: this.y, t: this.roll.t });
        this.roll.trail.length = Math.min(this.roll.trail.length, 10);
      }
    } finally {
      this.game = game;
    }
  }

  // ---------- drawing ----------

  draw(ctx) {
    const prev = handSet;
    handSet = this.hands ?? HANDS;
    try { this.drawBody(ctx); } finally { handSet = prev; }
  }
  drawBody(ctx) {
    if (!this.alive) return this.drawCorpse(ctx);
    if (this.fade && !this.painting && !(this.fade.secret && this.game.viewer !== this)) return this.drawFade(ctx);
    if (this.hidden && !this.painting) {
      if (this.glimpsed) return;   // (drawn after the lighting, glowing: see drawGlimpse)
      if (this.game.viewer !== this) return;
      // you, cloaked: a faint violet ghost of yourself, a band of it flickering sideways now and then
      const [c] = this.paintSelf(0.55, this.veil ? SHADOW : undefined), x = Math.round(this.x), y = Math.round(this.y), t = this.game.time;
      const glitch = Math.sin(t * 3.1) > 0.7 ? Math.floor((t * 20) % 48) : -9;
      ctx.globalAlpha = 0.26 + 0.06 * Math.sin(t * 9);
      for (let r = 0; r < 64; r += 2) ctx.drawImage(c, 0, r, 64, 2, x - 32 + (Math.abs(r - glitch) < 4 ? 2 : 0), y - 50 + r, 64, 2);
      ctx.globalAlpha = 1;
      return;
    }
    const P = this.parts, white = this.flash > 0, x = Math.round(this.x), y = Math.round(this.y), pose = this.pose;
    const part = (k) => (white ? P[k + 'W'] : P[k]);
    const ox = -ORIGIN_X, oy = -ORIGIN_Y;
    if (this.roll) return this.drawRoll(ctx, x, y);
    if (this.flipT >= 0) return this.drawFlip(ctx, x, y);
    if (this.onLadder && P.backBody) return this.drawClimbing(ctx, x, y, part);
    if (this.trail.length > 2 && !this.painting) this.drawTrail(ctx);
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

  // The cloak glitching (after the lighting, so it glows in the dark): a violet
  // hologram of you, there for a blink - torn into slices that jump sideways,
  // scanlines through it, flickering, a scan bar running down it - and gone again.
  drawGlimpse(ctx) {
    const k = this.cloak.flick / FLICKER_TIME, t = this.game.time;   // 1 as it starts .. 0
    const [c] = this.paintSelf(0.6), x = Math.round(this.x), y = Math.round(this.y);
    const seed = Math.floor(t * 30);
    const noise = (r) => { const v = Math.sin(r * 12.9898 + seed * 78.233) * 43758.5453; return v - Math.floor(v); };
    const on = Math.floor(t * 40) % 3 !== 0;   // flickering
    for (let r = 0; r < 64; r += 2) {
      const n = noise(r);
      if (n < 0.12) continue;   // a slice missing
      const off = n > 0.82 ? Math.round((noise(r + 7) - 0.5) * 10) : 0;
      const a = (on ? 0.8 : 0.4) * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, (1 - k) * 1.3 + 0.1))) * (r % 4 ? 1 : 0.5);
      ctx.globalAlpha = a;
      ctx.drawImage(c, 0, r, 64, 2, x - 32 + off, y - 50 + r, 64, 2);
      // and again added on, for the glow
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * 0.45;
      ctx.drawImage(c, 0, r, 64, 2, x - 32 + off, y - 50 + r, 64, 2);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
    // the scan bar running down it
    const sy = Math.round(y - 30 + (1 - k) * 30);
    ctx.fillStyle = 'rgba(230, 220, 255, 0.8)';
    ctx.fillRect(x - 7, sy, 15, 1);
    ctx.fillStyle = 'rgba(150, 110, 255, 0.45)';
    ctx.fillRect(x - 9, sy + 1, 19, 1);
  }

  // This fighter as it looks (no cloak), drawn on its own 64 px canvas - feet
  // at (32, 50) - and washed over in violet by `tint` (0..1).
  paintSelf(tint, rgb = '150, 110, 255') {
    this.selfCanvas ??= makeCanvas(64, 64);
    const [c, g] = this.selfCanvas;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, 64, 64);
    g.save();
    g.translate(32 - Math.round(this.x), 50 - Math.round(this.y));
    this.painting = true;
    this.draw(g);
    this.painting = false;
    g.restore();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = `rgba(${rgb}, ${tint})`;
    g.fillRect(0, 0, 64, 64);
    g.globalCompositeOperation = 'source-over';
    return this.selfCanvas;
  }
  // Going into the cloak, or coming out of it: the body comes apart in violet
  // slices that jitter sideways and drop out one by one, a line of light
  // sweeping up it, a ring opening on the floor - or all that run backwards,
  // as it comes back together.
  drawFade(ctx) {
    const F = this.fade, k = Math.min(1, F.t / F.dur), vis = F.out ? 1 - k : k;
    const x = Math.round(this.x), y = Math.round(this.y), t = this.game.time;
    const rgb = F.rgb ?? '150, 110, 255';
    const [c] = this.paintSelf(0.25 + 0.65 * (1 - vis), rgb);
    const noise = (r) => { const v = Math.sin(r * 12.9898 + F.seed * 78.233) * 43758.5453; return v - Math.floor(v); };
    for (let r = 0; r < 64; r += 2) {
      if (noise(r) > vis * 1.2) continue;   // gone already
      const off = Math.round(Math.sin(r * 1.9 + t * 45 + F.seed) * (1 - vis) * 6);
      ctx.globalAlpha = Math.min(1, 0.3 + vis);
      ctx.drawImage(c, 0, r, 64, 2, x - 32 + off, y - 50 + r, 64, 2);
    }
    ctx.globalAlpha = 1;
    // the line of light: up the body going, down it coming back
    const ly = Math.round(y - 2 - 30 * (F.out ? k : 1 - k));
    ctx.fillStyle = 'rgba(225, 210, 255, 0.95)';
    ctx.fillRect(x - 7, ly, 15, 1);
    ctx.fillStyle = `rgba(${rgb}, 0.55)`;
    ctx.fillRect(x - 10, ly + 1, 21, 1);
    // the ring on the floor
    const R = 4 + k * 15;
    ctx.fillStyle = `rgba(${rgb}, ${0.85 * (1 - k)})`;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      ctx.fillRect(Math.round(x + Math.cos(a) * R), Math.round(y - 1 + Math.sin(a) * R * 0.22), 1, 1);
    }
  }

  // The grapple's line, as pixels from the hand to the hook: rippling as it
  // flies out, pulled tight (and humming) while it reels in, whipping as it
  // comes away and springs back.
  hookLine() {
    const h = this.hook, s = this.lineFrom(), x0 = s.x, y0 = s.y, dx = h.x - x0, dy = h.y - y0, n = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
    const px = -dy / n, py = dx / n, t = h.t;
    const whip = Math.max(0, 1 - h.snap / 0.3);
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n, bell = Math.sin(Math.PI * k);
      const off = h.state === 'fly' ? 1.4 * bell * Math.sin(k * 18 - t * 50)
        : h.state === 'on' ? 0.45 * bell * Math.sin(t * 90 + k * 6)
        : 3.2 * whip * bell * Math.sin(k * 11 - h.snap * 60);
      pts.push([Math.round(x0 + dx * k + px * off), Math.round(y0 + dy * k + py * off)]);
    }
    return pts;
  }
  // The line: a white strand with a cyan edge and a dark shadow; while it's
  // reeling in, flashes of tension race up it to the hand and speed streaks
  // trail off the body. A claw on its end (turned the way it flies, biting
  // into the surface once it's stuck), a flash at the hand as it's shot.
  drawHook(ctx) {
    const h = this.hook;
    if (!h || !this.alive) return;
    const pts = this.hookLine(), n = pts.length - 1;
    ctx.fillStyle = 'rgba(20, 28, 36, 0.75)';
    for (const [x, y] of pts) ctx.fillRect(x, y + 1, 1, 1);
    ctx.fillStyle = 'rgba(90, 200, 255, 0.8)';
    for (const [x, y] of pts) ctx.fillRect(x + 1, y, 1, 1);
    ctx.fillStyle = '#f2faff';
    for (const [x, y] of pts) ctx.fillRect(x, y, 1, 1);
    if (h.state === 'on') {
      for (let p = 0; p < 2; p++) {
        const k = 1 - (((h.t * 3.5 + p / 2) % 1)), c = Math.round(k * n);   // from the hook end in to the hand
        for (let i = -2; i <= 2; i++) {
          const q = pts[c + i];
          if (!q) continue;
          ctx.fillStyle = i ? '#bfefff' : '#ffffff';
          ctx.fillRect(q[0] - (i ? 0 : 1), q[1] - (i ? 0 : 1), i ? 1 : 3, i ? 1 : 3);
        }
      }
      // speed streaks off the body
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > 160) {
        const ux = -this.vx / sp, uy = -this.vy / sp;
        for (const [side, len, col] of [[-5, 12, '#ffffff'], [0, 18, '#bfefff'], [5, 10, '#7fd8ff']]) {
          const sx = this.x - uy * side + ux * 6, sy = this.y - 14 + ux * side + uy * 6;
          ctx.fillStyle = col;
          for (let i = 0; i < len; i++) if ((i + Math.floor(h.t * 30)) % 5 !== 0) ctx.fillRect(Math.round(sx + ux * i), Math.round(sy + uy * i), 1, 1);
        }
      }
    }
    // the claw: three prongs, turned the way it's going (into the surface once it's stuck)
    const a = h.state === 'on' ? Math.atan2(-h.ny, -h.nx) : Math.atan2(h.dy, h.dx);
    const snapA = Math.round(a / (Math.PI / 4)) * (Math.PI / 4), c = Math.cos(snapA), sn = Math.sin(snapA);
    const put = (lx, ly, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(h.x + lx * c - ly * sn), Math.round(h.y + lx * sn + ly * c), 1, 1); };
    for (const [lx, ly] of [[-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [1, -1], [0, -2], [1, 1], [0, 2]]) put(lx, ly, '#2a3440');
    for (const [lx, ly] of [[-1, 0], [0, 0], [1, 0], [2, 0], [0, -1], [0, 1]]) put(lx, ly, '#d8e4ec');
    put(2, 0, '#ffffff');
    // the shot: a ring opening at the hand
    if (h.state === 'fly' && h.t < 0.1) {
      const s = this.lineFrom(), R = 2 + h.t * 50;
      ctx.fillStyle = `rgba(220, 245, 255, ${1 - h.t / 0.1})`;
      for (let i = 0; i < 12; i++) { const r = (i / 12) * Math.PI * 2; ctx.fillRect(Math.round(s.x + Math.cos(r) * R), Math.round(s.y + Math.sin(r) * R), 1, 1); }
    }
  }
  // After the lighting: a soft cyan bloom behind the grapple's spin slash.
  drawSpinGlow(ctx, s) {
    const a = 0.5 * Math.max(0, 1 - s.t / s.life), x = this.x, y = this.y - 12, R = 30;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, R);
    gr.addColorStop(0, `rgba(180, 235, 255, ${a})`);
    gr.addColorStop(0.6, `rgba(80, 190, 255, ${a * 0.5})`);
    gr.addColorStop(1, 'rgba(60, 150, 255, 0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = gr;
    ctx.fillRect(x - R, y - R, R * 2, R * 2);
    ctx.restore();
  }
  // A flash-cut across each foe the spin caught (after the lighting): a white
  // line sliced through them in an instant, cyan either side while it's fresh,
  // a spark at each end - then thinning to a hairline and gone.
  drawCuts(ctx) {
    for (const c of this.cuts) {
      const v = c.v, k = c.t / 0.3, L = 34 * Math.min(1, c.t / 0.035), fresh = c.t < 0.1;
      const x0 = v.x, y0 = v.y - 15, dx = Math.cos(c.a), dy = Math.sin(c.a);
      ctx.globalAlpha = 1 - k * k;
      for (let i = -L / 2; i <= L / 2; i++) {
        const x = Math.round(x0 + dx * i), y = Math.round(y0 + dy * i), end = Math.abs(i) > L / 2 - 5;
        if (fresh && !end) { ctx.fillStyle = '#5ec8f0'; ctx.fillRect(x, y - 1, 1, 3); }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, 1, fresh && !end ? 2 : 1);
      }
      if (fresh) for (const e of [-1, 1]) {
        const ex = Math.round(x0 + dx * e * (L / 2 + 2)), ey = Math.round(y0 + dy * e * (L / 2 + 2));
        ctx.fillStyle = '#e8faff';
        ctx.fillRect(ex - 1, ey, 3, 1);
        ctx.fillRect(ex, ey - 1, 1, 3);
      }
    }
    ctx.globalAlpha = 1;
  }
  // After the lighting: the line glows (a soft cyan along it, brighter at the claw).
  drawHookGlow(ctx) {
    this.drawBlaze(ctx);
    this.drawGalCast(ctx);
    this.drawSumCast(ctx);
    if (this.alive && this.glimpsed) this.drawGlimpse(ctx);
    this.drawArchery(ctx);
    this.drawMurasaki(ctx);
    if (this.alive) for (const sl of this.slashes) if (sl.spin) this.drawSpinGlow(ctx, sl);
    this.drawCuts(ctx);
    const h = this.hook;
    if (!h || !this.alive) return;
    const s = this.lineFrom();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(80, 190, 255, ${h.state === 'on' ? 0.32 : 0.22})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(h.x, h.y);
    ctx.stroke();
    const gr = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, 7);
    gr.addColorStop(0, 'rgba(200, 240, 255, 0.7)');
    gr.addColorStop(1, 'rgba(80, 190, 255, 0)');
    ctx.fillStyle = gr;
    ctx.fillRect(h.x - 7, h.y - 7, 14, 14);
    ctx.restore();
  }
  // Reeling in: cyan afterimages of the body strung out behind it.
  drawTrail(ctx) {
    const [c] = this.paintSelf(0.85, '110, 210, 255');
    ctx.save();
    for (const [i, al] of [[8, 0.12], [6, 0.18], [4, 0.26], [2, 0.34]]) {
      const p = this.trail[i];
      if (!p) continue;
      ctx.globalAlpha = al;
      ctx.drawImage(c, Math.round(p.x) - 32, Math.round(p.y) - 50);
    }
    ctx.restore();
  }

  // The gun, when it isn't in hand, is slung across the back, muzzle up at 45
  // degrees - or, a pistol, sits on the hip, muzzle down.
  // (A melee weapon that isn't out isn't shown.)
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
    const g = this.gun;
    if (!g || (this.slot === 2 && !this.bow && !this.mura && !this.blaze && !this.gal && !this.summon)) return;   // (put away too while the archery bow's out)
    if (g.def.cls === 'pistol') put(g, Math.PI * 0.62, 2, 10);   // holstered
    else put(g, -Math.PI * 0.75, 3, 13);                         // across the back at 45 degrees
  }

  // The second jump's somersault: the whole character drawn off to the side and turned once about the middle of
  // the body - smoothly, slow into it and slow out.
  drawFlip(ctx, x, y) {
    this.rollCanvas ??= makeCanvas(64, 64);
    const [c, rc] = this.rollCanvas, FX = 32, FY = 46, MID = 12, t = this.flipT;
    rc.clearRect(0, 0, 64, 64);
    rc.save();
    rc.translate(FX - x, FY - y);
    this.flipT = -1;
    this.draw(rc);
    this.flipT = t;
    rc.restore();
    ctx.save();
    ctx.translate(x, y - MID);
    ctx.rotate(this.flipDir * smooth(t) * Math.PI * 2);
    ctx.drawImage(c, -FX, -(FY - MID));
    ctx.restore();
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
  // other is hidden behind it - and the feet take turns stepping up. Turned the way it's
  // looking, as ever; the gun's slung across the middle of its back, in plain sight.
  drawClimbing(ctx, x, y, part) {
    const ox = -ORIGIN_X, oy = -ORIGIN_Y, pose = this.pose;
    const s = Math.floor(this.climbT / 8) % 2, reach = (this.climbT % 8) / 8;
    // hands on the rails at about head height, the reaching one a few pixels higher
    const high = -25 - Math.round(reach * 2), low = -20;
    ctx.save();
    ctx.translate(this.facing < 0 ? x + 1 : x, y);
    if (this.facing < 0) ctx.scale(-1, 1);
    drawHand(ctx, 'grab', -9, s ? high : low);
    drawHand(ctx, 'grab', 10, s ? low : high);
    ctx.drawImage(part('backLegL'), ox + pose.legL[0], oy - pose.legL[1]);
    ctx.drawImage(part('backLegR'), ox + pose.legR[0], oy - pose.legR[1]);
    ctx.drawImage(part('backBody'), ox, oy + pose.body);
    ctx.drawImage(part('backHead'), ox, oy + pose.head);
    const g = this.gun;   // (nearest of all, from behind)
    if (g) {
      // by the middle of the gun, not its grip: from the muzzle back half its length
      const { grip } = g.art.points, m = g.muzzle;
      ctx.save();
      ctx.translate(0, -15 + pose.body);
      ctx.rotate(-Math.PI / 4);
      ctx.translate(artW(g.icon) / 2 - (m.x - grip.x), grip.y - m.y);
      g.draw(ctx);
      ctx.restore();
    }
    ctx.restore();
  }

  drawArms(ctx) {
    if (this.bow && !this.onLadder) return this.drawBowArms(ctx);
    if (this.mura) return this.drawMuraArms(ctx);
    if (this.blaze) return this.drawBlazeArms(ctx);
    if (this.gal) return this.drawGalArms(ctx);
    if (this.summon) return this.drawSumArms(ctx);
    const w = this.weapon, x = Math.round(this.x), y = Math.round(this.y), b = this.pose.body;
    if (this.onLadder) {
      // both hands on the rungs, the gun slung
      const s = Math.floor(this.climbT / 6) % 2;
      drawHand(ctx, 'grab', x - 3, y - 13 - (s ? 2 : 0));
      drawHand(ctx, 'grab', x + 4, y - 13 - (s ? 0 : 2));
      return;
    }
    if (this.slot === 1) return this.drawMelee(ctx, x, y);
    if (!w) {
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
    if (m.def.reverse) {
      // A reverse grip: the knife turned in the fist - the pommel out of the top,
      // the blade out of the bottom - and the fist itself upright, not turned with
      // it, held out in front with the blade hanging down, a touch back. The other
      // hand easy by the body.
      const off = this.bodyPoint(x, y, { x: -3, y: -8 });
      drawHand(ctx, 'open', Math.round(off.x), Math.round(off.y));
      this.enterGun(ctx, g);
      m.draw(ctx);
      ctx.restore();
      drawHand(ctx, 'grab', Math.round(g.x), Math.round(g.y));
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
    if (!this.alive || !w || w.flash <= 0 || this.onLadder) return;
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
