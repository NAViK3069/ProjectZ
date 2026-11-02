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
import { drawVisor } from './visor.js';
import { drawOctoArms, drawOctoGuns, drawOctoGlow, octoRoot } from './octo.js';
import { drawArcheryCast, drawArcheryMark } from './archery.js';
import { drawPhased } from './rift.js';
import { drawSparkle } from './cloakfx.js';
import { drawAurumCast, drawAurumHum } from './goldfx.js';
import { drawReapIn, drawShades, drawReapMarks, drawReapFinish } from './shadefx.js';
import { GUN_ART } from '../combat/gunart.js';
import { drawShieldBubble, drawCard, drawCardAura, drawCardFan, drawCardFly, CARD_SPOT, drawPowered, drawHackCast, drawHacked, drawGuard, drawBatCast, drawWraith, drawStealTether, drawStolen, drawChidori, drawChidoriStab, drawShocked, drawDeflectField, drawDeflectAim, drawDeflectBar, drawDeflectDash, HACKED_H, CARD_HOLD, SANDE_HUES } from './skillfx.js';

// movement
export const GRAVITY = 720, WALK = 86, AIR_ACCEL = 650, JUMP = 290, JUMP2 = 250, PAD_JUMP = 430;   // (the bots work out their routes by these)
const MAX_FALL = 430, SPRINT = 1.85, ACCEL = 950, DECEL = 1250;
const CLIMB = 75, COYOTE = 0.09, BUFFER = 0.12;
const HELD_SEMI = 0.17;   // a semi-automatic held down: a shot this often at most (clicking can go as fast as the gun)
export const MAX_STAMINA = 100;
const STAMINA_DRAIN = 17, STAMINA_REGEN = 24;   // a full bar runs for about 6 s
const WINDED_DELAY = 0.75, WINDED_UNTIL = 30;   // run out of stamina: this long before it refills, no running till it's this much
// the main game's dodge roll
const ROLL_TIME = 0.4, ROLL_SPEED = 250, ROLL_COST = 20, ROLL_COOLDOWN = 0.2, ROLL_SAFE = 0.8;
const ROLL_CROUCH_IN = 0.6;   // a roll heading in under something low stays down at least this long after
// the grapple (skill, Q): the line's speed and reach, how hard it reels in and
// how fast it can pull, how long it holds on at most, the wait between shots
// (three shots saved up, one coming back each GRAPPLE_CD, a short gap between them; aim within this much of someone and it locks on)
const GRAPPLE_SPEED = 1200, GRAPPLE_RANGE = 360, GRAPPLE_PULL = 2600, GRAPPLE_MAX = 430, GRAPPLE_TIME = 1.6, GRAPPLE_CD = 2.5, GRAPPLE_GAP = 0.2, GRAPPLE_LOCK = 26;
export const GRAPPLE_SHOTS = 2;
const GRAPPLE_CUT = 48, SPIN_R = 30;   // reeled in through (or right up to) a foe: a spinning slash, this much to every foe this close
const GRAPPLE_DRAIN = 0.8;   // (and this much of what it takes out of them comes back to you as health)
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
// the blue shield (skill, Q): how much it takes, for how long, the wait after. Not a free pass: it's only so much, a blow
// from a melee weapon counts double on it and a blast half as much again, your feet and your shots are the weaker
// behind it - and it goes off when it goes, not hard, at whoever's crowding you.
const BARRIER_HP = 110, BARRIER_TIME = 4, BARRIER_CD = 16, BARRIER_SLOW = 0.85, BARRIER_GUN = 0.75, BARRIER_GUARD = 0.5;   // (the moment after it goes: nothing can touch you)
// the buff cards (skill, Q): up over the head, turned over; how long each lasts; the wait after
const CARD_UP = 0.5, CARD_TURN = 0.35, CARD_CD = 18, CARD_WAIT = 4, CARD_FLY = 0.24;   // (the fan: open at most this long; the pick flying up)
export const CARD_LAST = { red: 5, green: 6, blue: 7, purple: 2 };
export const CARD_ALLY = 0.7;   // a teammate near by when the card's turned: this much of its effect, for this much of its time
const CARD_FIRE = 0.6, CARD_MELEE = 0.3, CARD_HEAL = 0.045, CARD_SPEED = 1.3, CARD_DRAIN = 0.4;   // red: guns recover this much faster; green: of full health a second; blue: feet, what running costs
// the shadow clone's charge: the next hit counts this much, for this long once the clone's gone
const POWER_MUL = 1.8, POWER_AFTER = 2;
// the hack (skill, Q): how long it's sent for, the wait after; those it gets: no skill for this long (the reach: see main.js)
const HACK_CAST = 0.35, HACK_CD = 18;
export const HACK_LOCK = 5;
const HACK_JAM = 1.6;   // ...and no shooting for this long (the guns come back before the skills do)
const KICK_CROUCH = 0.7, KICK_WALK = 1.15, KICK_RUN = 1.4, KICK_AIR = 1.6;
// how much of a shot's hit is left at the end of its range, by the sort of gun (it holds up to a third of the way out)
const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);   // (fast, settling)
const OCTO_ICONS = {};
let SHADE_BLADE = null;   // (the shadow kill's shadows: what's in their hands)   // (a gun's picture, for throwing it away)
const FAR_HIT = { sniper: 0.85, rifle: 0.65, lmg: 0.65, smg: 0.5, pistol: 0.55, shotgun: 0.35 };
// Sandevistan (skill, Q): how long it's yours (in your own time), how slow the world goes meanwhile, the wait after
// Sandevistan: as long as the stamina it's set off with - the least, a full bar - and what it needs at all; it all goes
// into it, the bar running down with the time, and starts again from empty after
const SANDE_MIN_T = 0.5, SANDE_MAX_T = 2.6, SANDE_CD = 24, SANDE_SPEED = 1.45, SANDE_COST = 0.15;   // (SANDE_COST: of full health, paid when it ends - low enough, it kills you)
export const SANDE_NEED = 15;   // (SANDE_SPEED: how much quicker in it - on your feet, and the gun and blade in your hands)
export const SANDE_WORLD = 0.06;
// the vampire (skill, Q): the calling, the wait after (the bats: see main.js)
const BAT_CAST = 0.35, BAT_CD = 20, WRAITH_TIME = 2.5, WRAITH_SPEED = 1.5;   // (wraith form: how long at most, how much faster)
// jumper (skill, Q): how long you can be in the other place laying the path, how much quicker there, the wait after
const PHASE_TIME = 4.5, PHASE_SPEED = 1.35, JUMPER_CD = 24;
// skill thief (skill, Q): how far it reaches for someone, how far they can get before it snaps; how long the hack takes;
// the wait after (and after a hack broken off); how long what's taken can be held unused; how long they lose their own
// skill; slower on your feet hacking; skills that can't be taken
const STEAL_RANGE = 150, STEAL_BREAK = 190, STEAL_LOCK = 0.9, STEAL_CD = 14, STEAL_AFTER = 1.15, STEAL_BROKE_CD = 3, STEAL_HOLD = 15, STEAL_HACK = 1.5, STEAL_SLOW = 0.55;
// (STEAL_AFTER: a skill taken and done with, the wait's that skill's own, and this much longer)
const UNSTEALABLE = ['grapple', 'steal'];   // (they can be hacked - cut off a moment - but there's nothing to take)
// octo arms (skill, Q): reaching out for the guns, how long they're out at most, the wait after; how hard their shots
// are next to the same gun in hand; what kinds of gun they grab
const OCTO_REACH = 0.9, OCTO_TIME = 4, OCTO_CD = 22, OCTO_DMG = 0.45, OCTO_GONE = 0.55, OCTO_KINDS = ['pistol', 'smg', 'rifle', 'shotgun', 'lmg'];
// where each gun hangs, from the feet, facing right (x forward): two up over the head, two out behind; and which way each
// arm reaches first, for its gun
const OCTO_SLOTS = [[11, -45], [-9, -50], [-27, -35], [-27, -15]], OCTO_REACH_AT = [[30, -34], [-6, -58], [-44, -30], [-40, 4]];
// chidori (skill, Q): gathering it, how long it's held, the wait after; how hard it goes in; how much quicker on your feet
// with it; the lunge (Q again): how fast, how long
const CHIDORI_CHARGE = 0.45, CHIDORI_TIME = 4, CHIDORI_CD = 16, CHIDORI_RUN = 1.3, CHIDORI_LUNGE = 520, CHIDORI_LUNGE_T = 0.3;
const CHIDORI_STAB = 0.45;   // the moment it's in them: both held there, then they're thrown off it
// deflect (skill, Q): how long the blade's up turning shots back, then the dash - how fast, how far, how hard - the wait after
const DEFLECT_TIME = 1.5, DEFLECT_SPEED = 720, DEFLECT_REACH = 165, DEFLECT_CUT = 70, DEFLECT_CD = 14, DEFLECT_SLOW = 0.75, DEFLECT_FINISH = 0.24;
const HACK_HURT = 1.2;   // someone hacked takes this much more from everything
const FROZEN_TURN = 9;   // caught in someone's Sandevistan: how fast it can turn (rad/s, of its slowed time)
export const SWORD_COST = 20;   // the stamina each sword takes: Q takes the lot, and brings a sword for every 20 of it
// the target lock (skill, Q): how long it lasts, the wait after, how far it reaches; what it takes off the gun's kick
const LOCK_TIME = 3, LOCK_CD = 14, LOCK_RANGE = 480, LOCK_STICK = 18, LOCK_KICK = 0.65;
// golden fangs (skill, Q): out as long as this at most (Q again, or the time's up: they all come back), the wait after
const FANG_TIME = 3, FANG_CD = 12;
// aurum (skill, Q): the gold sniper building in the hands, how long it's yours at most, the wait after (the gun: catalog.js)
export const AURUM_CAST = 0.55;
const AURUM_TIME = 12, AURUM_CD = 20;
// shadow kill (skill, Q): how far it reaches for a foe; how close another has to be to whoever's being cut for the
// shadows to maybe go on to them (and how likely, each cut); going to shadow; the cuts - how many, how often, how
// hard - and the last one; the wait after
const REAP_RANGE = 230, REAP_CHAIN = 60, REAP_HOP = 0.35, REAP_IN = 0.2, REAP_CUTS = 12, REAP_EVERY = 0.11, REAP_HIT = 18, REAP_FINISH = 50, REAP_OUT = 0.4, REAP_CD = 22;
export const SKILL_CD = { grapple: GRAPPLE_CD, cloak: CLOAK_CD, decoy: DECOY_CD, archery: ARCH_CD, murasaki: MURA_CD, blaze: BLAZE_CD, galaxy: GAL_CD, demon: SUM_CD, lock: LOCK_CD, shield: BARRIER_CD, cards: CARD_CD, hack: HACK_CD, sande: SANDE_CD, vampire: BAT_CD, deflect: DEFLECT_CD, chidori: CHIDORI_CD, octo: OCTO_CD, steal: STEAL_CD, jumper: JUMPER_CD, fang: FANG_CD, aurum: AURUM_CD, reap: REAP_CD };
export const SKILL_TIME = { cloak: CLOAK_TIME, decoy: DECOY_LIFE, veil: VEIL_TIME, archery: ARCH_CHARGE, murasaki: MURA_CHARGE, blaze: BLAZE_CHARGE, galaxy: GAL_CAST, demon: SUM_CAST, lock: LOCK_TIME, shield: BARRIER_TIME, hack: HACK_CAST, sande: SANDE_MAX_T, vampire: BAT_CAST, deflect: DEFLECT_TIME, chidori: CHIDORI_TIME, octo: OCTO_TIME, steal: STEAL_LOCK, jumper: PHASE_TIME, fang: FANG_TIME, aurum: AURUM_TIME, reap: REAP_IN + REAP_CUTS * REAP_EVERY + REAP_OUT };
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
// On a wall: in the air, falling, pushed against it - once a jump. It slides slowly down,
// gathering speed gently. Getting on gives the second jump back; a jump off it is that second jump, straight up as usual.
const WALL_GRAVITY = 90, WALL_MAX = 110;
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
      padT: 0, flipT: -1, flipDir: 1, exposeT: 0, swordsOut: false, stamina: MAX_STAMINA, staminaRest: 0, winded: false, sprinting: false, rollCool: 0, rollCrouch: 0, sq: 0, sqV: 0, hook: null, charges: GRAPPLE_SHOTS, hookGap: 0, trail: [], cuts: [], skillCD: 0, boostT: 0, cloak: null, lunge: null, fade: null, veil: null, decoy: null, decoyLife: 0, bow: null, mura: null, blaze: null, gal: null, summon: null, lockOn: null, barrier: null, guardT: 0, card: null, allyCard: null, powered: null, hackCast: null, hackedT: 0, sande: null, batCast: null, deflect: null, shield: 0,
      onGround: false, onLadder: false, ladderCool: 0, coyote: 0, jumpBuf: 0, airJumps: 1, wall: null, wallGrabs: 1, wraith: null, chidori: null, octo: null, steal: null, stolen: null, phase: null, jump: null, riftCool: 0, dropT: 0, fang: null, aurum: null, reap: null, jamT: 0,
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
    if (w.def.skillGun) { this.game.aurumOff?.(this); return null; }   // (the gold sniper's not a thing to drop or throw: it goes back to nothing)
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
  // How much a gun kicks and wanders, by how you're standing: steadiest down low, a little more on the move, more
  // at a run, most in the air. (A target lock steadies any of it.)
  get stanceKick() {
    const m = !this.onGround && !this.onLadder ? KICK_AIR : this.crouch ? KICK_CROUCH : this.sprinting ? KICK_RUN : Math.abs(this.vx) > 25 ? KICK_WALK : 1;
    return m * (this.lockOn ? LOCK_KICK : 1);
  }
  // What a bullet at (x, y) hits: the head (the whole head, as it is under the hair: 16 wide, 15 high, up to
  // 27 over the feet), the body, or nothing (rolling: just the ball).
  hitPart(x, y) {
    const dx = (x - this.x) * this.facing;
    if (this.vanish || this.phantom || this.wraith || this.phase || this.jump || this.shade) return null;   // (shots go right through smoke, the other place, light)
    if (this.roll) return Math.abs(dx) <= 7 && y > this.y - ROLL_H && y <= this.y ? 'body' : null;
    const d = this.crouch ? CROUCH_DROP : 0;   // ducked down: the head's lower, the body shorter
    if (dx >= -8 && dx <= 7 && y >= this.y - 27 + d && y < this.y - 12 + d) return 'head';
    if (Math.abs(dx) <= 6 && y >= this.y - 12 + d && y <= this.y) return 'body';
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
    const a = base - (w.climb * this.stanceKick + this.tilt) * this.facing;
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
    // going through a rift, as light: carried along the path (see main.js: updateRifts), nothing else till it's out
    if (this.jump) {
      this.vx = this.vy = 0;
      this.onLadder = false;
      this.roll = null;
      this.wall = null;
      this.skillCD -= dt * (this.game.cdRate?.() ?? 1);
      return;
    }
    if (this.beamT !== undefined) this.beamT += dt;
    // the spawn shield: running down, and gone the moment you attack
    if (this.shield > 0) this.shield = c.fire || c.melee || c.grenade || c.skill ? 0 : this.shield - dt;
    if (this.hurtT > REGEN_DELAY && this.hp < this.maxHp && !this.isDecoy && this.game.regen !== false) this.hp = Math.min(this.maxHp, this.hp + REGEN * dt);

    // caught in someone's Sandevistan: no rolling out of it, no shooting, hitting, throwing or skills till it's over -
    // but a Sandevistan of your own can be set off in it, and then you're out of it too - and it comes round as
    // slowly as everything else
    const frozen = this.frozen;
    if (frozen) c = { ...c, roll: false, fire: false, melee: false, meleeHeld: false, grenade: false, throwWeapon: false, skill: !!c.skill && this.usingSkill === 'sande' };
    if (c.aim !== null && c.aim !== undefined) {
      if (frozen) { const d = Math.atan2(Math.sin(c.aim - this.aim), Math.cos(c.aim - this.aim)); this.aim += Math.max(-FROZEN_TURN * dt, Math.min(FROZEN_TURN * dt, d)); }
      else this.aim = c.aim;
    }
    this.aimTarget = frozen ? null : c.target ?? null;
    this._cursor = this.aimTarget;   // (where the mouse is: the target lock goes by that)
    const prey = this.lunge?.v ?? this.cloak?.prey;
    if (prey?.alive) { const s = this.seen(prey); this.aim = Math.atan2(s.y - 14 - (this.y - GUN_HEIGHT), s.x - this.x); }
    this.lockAim();
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
      if (this.boostT <= 0 && !this.sande) this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN * dt * (1 - (1 - CARD_DRAIN) * this.cardPower('blue')) * (this.octo ? 2 : 1));   // (the octo arms out: twice as hard going)
      if (this.stamina <= 0) this.windOut();
    } else if ((this.staminaRest -= dt) <= 0) this.stamina = Math.min(MAX_STAMINA, this.stamina + STAMINA_REGEN * dt);

    this.coyote = this.onGround ? COYOTE : this.coyote - dt;
    this.jumpBuf = c.jump ? BUFFER : this.jumpBuf - dt;
    this.dropT -= dt;

    // ladders: grab one by pushing up / down in front of it
    const ladderHere = this.overLadder();
    this.ladderCool -= dt;
    if (!this.onLadder && !this.octo && !this.steal && !this.reap && !(this.bow && !this.bow.fired) && ladderHere && ((c.up && this.ladderAt() && this.ladderCool <= 0) || (c.down && !this.onGround) || (c.down && this.ladderBelow())) && !this.roll) {
      this.onLadder = true;
      this.x += (ladderHere.x - this.x) * 0.6;
      this.vx = 0;
    }
    if (this.onLadder && (!ladderHere || this.jumpBuf > 0)) {
      this.onLadder = false;
      if (this.jumpBuf > 0) { this.vy = -JUMP * 0.8; this.jumpBuf = 0; this.ladderCool = 0.3; }
    }

    // wraith form: shooting, hitting, throwing or rolling isn't to be done in it - to try is to fall out of it, then and there
    if (this.wraith) {
      const w = this.wraith;
      if (!c.fire) w.held = false;   // (the trigger still down from before doesn't count)
      w.age += dt;
      if ((w.t -= dt) <= 0) this.wraith = null;
      else if ((c.fire && !w.held) || c.melee || c.grenade || c.throwWeapon || c.roll) {
        this.wraith = null;
        c = { ...c, fire: false, melee: false, meleeHeld: false, grenade: false, throwWeapon: false, roll: false };
      }
    }
    // dive roll (costs stamina)
    if (c.roll && !this.roll && !this.octo && !this.steal && !this.reap && !(this.bow && !this.bow.fired) && !this.mura && !this.blaze && !this.gal && !this.summon && !this.deflect && (this.onGround || this.airRoll) && !this.onLadder && this.rollCool <= 0 && this.stamina >= ROLL_COST) {
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
    this.skillCD -= dt * (this.game.cdRate?.() ?? 1);   // (the room's SKILL COOLDOWN: see main.js)
    if (this.game.noCooldown?.(this)) this.skillCD = Math.min(this.skillCD, 0);   // (training: skills can go without their wait)
    this.updateBuffs(dt, c);
    if (this.hackedT > 0) { this.hackedT -= dt; c = { ...c, skill: false }; }   // (hacked: Q does nothing)
    const sk = this.usingSkill;   // (their own, or one they've taken)
    if (sk === 'grapple') this.updateGrapple(dt, c);
    else if (sk === 'cloak') this.updateCloak(dt, c);
    else if (sk === 'decoy') this.updateDecoy(dt, c);
    else if (sk === 'archery') this.updateArchery(dt, c);
    else if (sk === 'murasaki') this.updateMurasaki(dt, c);
    else if (sk === 'blaze') this.updateBlaze(dt, c);
    else if (sk === 'galaxy') this.updateGalaxy(dt, c);
    else if (sk === 'demon') this.updateSummon(dt, c);
    else if (sk === 'lock') this.updateLock(dt, c);
    else if (sk === 'shield') this.updateBarrier(dt, c);
    else if (sk === 'cards') this.updateCard(dt, c);
    else if (sk === 'hack') this.updateHack(dt, c);
    else if (sk === 'sande') this.updateSande(dt, c);
    else if (sk === 'vampire') this.updateBats(dt, c);
    else if (sk === 'deflect') this.updateDeflect(dt, c);
    else if (sk === 'chidori') this.updateChidori(dt, c);
    else if (sk === 'octo') this.updateOcto(dt, c);
    else if (sk === 'steal') this.updateSteal(dt, c);
    else if (sk === 'jumper') this.updateJumper(dt, c);
    else if (sk === 'fang') this.updateFang(dt, c);
    else if (sk === 'aurum') this.updateAurum(dt, c);
    else if (sk === 'reap') this.updateReap(dt, c);
    if (this.shade) c = { ...c, move: 0, jump: false, sprint: false, up: false, down: false, crouch: false };   // (a shadow: held where it is - see updateReap)
    // a skill taken: once it's been used and is over (or it's been held too long unused), back to taking them
    const st = this.stolen;
    if (st) {
      st.t += dt;
      if (this.skillCD > 0 || this.skillBusy) st.used = true;
      if (((st.used || (st.left -= dt) <= 0) && !this.skillBusy)) { this.stolen = null; this.skillCD = this.stealWait = (SKILL_CD[st.skill] ?? STEAL_CD) * STEAL_AFTER; }
    }
    if (this.hook?.state !== 'on' && this.trail.length) this.trail.pop();   // the grapple's afterimages catching up once it lets go
    const reeling = this.hook?.state === 'on';
    this.updateWall(c, reeling);
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
    } else if (this.wall) {
      const w = this.wall;
      this.vx = w.dir * 20;   // (kept up against it)
      this.vy = Math.min(WALL_MAX, this.vy + WALL_GRAVITY * dt);
      if ((w.dust -= dt) <= 0) { w.dust = 0.13; this.game.fx.dust(this.x + w.dir * HALF_W, this.y - 6, 1); }
      if (this.jumpBuf > 0 && this.airJumps > 0) {
        this.vx = 0;
        this.vy = -JUMP;
        this.jumpBuf = 0;
        this.airJumps--;
        this.bounce(-95);
        this.game.fx.dust(this.x, this.y, 4);
        this.wall = null;
      } else if (c.down || c.move === -w.dir) {
        this.vx = -w.dir * 30;
        this.wall = null;
      }
    } else {
      const top = WALK * (this.sprinting ? SPRINT : 1) * (this.stealthed ? CLOAK_SPEED : 1) * (this.bow && !this.bow.fired ? 0.5 : 1) * (this.mura ? 0.3 : 1) * (this.blaze ? (this.blaze.phase === 'charge' ? 0.25 : 0.5) : 1) * (this.gal ? 0.35 : 1) * (this.summon ? 0.3 : 1) * (this.deflect ? DEFLECT_SLOW : 1) * (this.chidori ? (this.chidori.phase === 'charge' ? 0.35 : CHIDORI_RUN) : 1) * (this.batCast ? 0.5 : 1) * (this.wraith ? WRAITH_SPEED : 1) * (this.steal ? STEAL_SLOW : 1) * (this.phase ? PHASE_SPEED : 1) * (this.sande ? SANDE_SPEED : 1) * (this.barrier ? BARRIER_SLOW : 1) * (this.hackCast ? 0.5 : 1) * (1 + (CARD_SPEED - 1) * this.cardPower('blue')) * (this.crouch ? 0.45 : 1) * (this.meleeOut && this.melee.t >= 0 ? 0.55 : 1) * (this.held?.def.speedMul ?? 1);
      const want = c.move * top, d = want - this.vx;
      const a = (this.onGround ? (c.move ? ACCEL : DECEL) : AIR_ACCEL) * dt;
      this.vx += Math.max(-a, Math.min(a, d));
      if (this.jumpBuf > 0 && this.coyote > 0) {
        this.vy = -JUMP;
        this.jumpBuf = 0;
        this.coyote = 0;
        this.bounce(-95);   // springs up: stretched
        this.game.fx.dust(this.x, this.y, 4);
      } else if (this.jumpBuf > 0 && this.airJumps > 0 && !this.onGround && !this.octo && !this.steal && !(this.bow && !this.bow.fired)) {
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
    // deflect's dash: straight along the mouse, off the ground
    const cutting = this.deflect?.phase === 'dash';
    if (cutting) {
      const m = this.deflect;
      this.aim = m.a;
      this.vx = Math.cos(m.a) * DEFLECT_SPEED;
      this.vy = Math.sin(m.a) * DEFLECT_SPEED;
      if (this.vy > 100) this.dropT = 0.1;
    }
    // chidori's lunge: straight along the mouse, the hand out in front
    const lunging = this.chidori?.phase === 'lunge' || this.chidori?.phase === 'stab';
    if (this.chidori?.phase === 'lunge') {
      this.aim = this.chidori.a;
      this.vx = Math.cos(this.chidori.a) * CHIDORI_LUNGE;
      this.vy = Math.sin(this.chidori.a) * CHIDORI_LUNGE;
      if (this.vy > 100) this.dropT = 0.1;
    }
    const dashing = this.blaze?.phase === 'dash';
    if (dashing) {
      // the flame fist's dash: straight down the line it was thrown along, no falling
      this.vx = Math.cos(this.blaze.a) * BLAZE_SPEED;
      this.vy = Math.sin(this.blaze.a) * BLAZE_SPEED;
      if (this.vy > 100) this.dropT = 0.1;   // (down through a catwalk too)
    }
    if (!this.onLadder && !this.lunge && !dashing && !cutting && !lunging && !this.wall) this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * (reeling ? 0.25 : 1) * dt);

    const wasGround = this.onGround, fall = this.vy, px = this.x, py = this.y;
    this.move(dt);
    if (dashing) this.blazeStep(Math.hypot(this.x - px, this.y - py), dt);
    if (cutting) this.deflectStep(Math.hypot(this.x - px, this.y - py), dt);
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
    if (this.onGround) { this.airJumps = 1; this.airRoll = true; this.wallGrabs = 1; }
    if (this.onLadder || this.roll || this.wraith || this.octo || this.steal || (this.bow && !this.bow.fired)) this.flipT = -1;
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
    // hacked: the gun won't fire for a moment (the trigger's dead - the rest of it still works)
    if (this.jamT > 0) { this.jamT -= dt; if (this.slot === 2) c = { ...c, fire: false }; }
    if (this.aurum && this.aurum.t < AURUM_CAST) c = { ...c, fire: false, reload: false };   // (the gold sniper's still being built)
    // drawing the archery bow: hands full - no shooting, hitting, throwing or switching till it's loosed
    if ((this.bow && !this.bow.fired) || this.mura || this.blaze || this.gal || this.summon || this.deflect || this.wraith || this.chidori || this.steal || this.phase || this.reap) c = { ...c, fire: false, melee: false, meleeHeld: false, grenade: false, throwWeapon: false, slot: 0, cycle: 0, reload: false };
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
      m.update(dt * (1 + CARD_MELEE * this.cardPower('red')) * (this.sande ? SANDE_SPEED : 1));
      this.tilt += (m.raising * RAISE_TILT - this.tilt) * Math.min(1, dt * 16);
      if (m.events.includes('strike')) {
        this.strike(m);
        if (k) { k.out = true; this.game.cloakStab?.(this, k); }   // the stab gives it away
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
      w.update(dt * (this.sande ? SANDE_SPEED : 1));   // (in a Sandevistan: firing, reloading, working the action, all quicker)
      if (w.cooldown > 0) w.cooldown -= dt * CARD_FIRE * this.cardPower('red');
      for (const e of w.events) this.reloadEvent(e);
      // the main game's tilts: muzzle up mid-reload, down feeding shells, up from the floor when drawn
      let tilt = !w.reloading ? 0
        : w.def.reload === 'shells' ? SHELL_TILT
        : w.def.reload === 'steps' ? (w.openAngle / w.def.openAngle) * STEP_TILT
        : Math.sin(Math.PI * Math.min(1, w.reload * 1.15)) * RELOAD_TILT;
      tilt += w.raising * RAISE_TILT;
      this.tilt += (tilt - this.tilt) * Math.min(1, dt * 16);
      // (a person can hold it down with any gun: a semi-automatic, or a burst, goes again as if clicked - not quicker
      // than HELD_SEMI though, so a pistol's still no SMG. A bot's own hand clicks for itself: see ai.js.)
      const held = !this.bot && this.triggerHeld && !(w.def.auto && !w.def.burst) && !(w.burstLeft > 0);
      const pull = !busy && ((c.fire && ((w.def.auto && !w.def.burst) || !this.triggerHeld || (held && this.game.time - (this.lastShotAt ?? -9) >= Math.max(HELD_SEMI, w.def.fireInterval)))) || w.burstLeft > 0);
      if (pull) {
        const pre = this.gunPose();
        const r = w.tryFire();
        if (r === 'fired') { this.shoot(pre); this.lastShotAt = this.game.time; }
        else if (r === 'empty' && w.reserve <= 0 && !w.reloading && w.ammo <= 0) {
          if (!w.def.skillGun) this.game.fx.thrownGun(this, w);   // out of everything: throw it away (the gold sniper: it just goes)
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
      const ax = Math.sign(v.x - this.x) || this.facing, was = v.hp;
      if (v.hurt(GRAPPLE_CUT, this, ax * 170, -110)) {
        hit = true;
        const got = Math.max(0, was - Math.max(0, v.hp));
        if (got > 0 && !v.isDecoy) this.game.drain?.(this, got * GRAPPLE_DRAIN);
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
    return (!!this.cloak && !this.cloak.out) || !!this.veil || this.phantom;
  }
  get frozen() {   // (the world's stopped, and not for them)
    return (this.game.timeK ?? 1) < 1 && !this.sande;
  }
  get phantom() {   // (the purple card: gone, and nothing can touch you)
    return this.cardPower('purple') > 0;
  }
  // How much of a card's effect this one has: all of it, drawn themselves; a teammate's share of it.
  cardPower(kind) {
    return this.card?.on && this.card.kind === kind ? 1 : this.allyCard?.kind === kind ? CARD_ALLY : 0;
  }
  // Whoever's looking at the screen isn't fooled by this one being unseen: it's them, or someone on their side.
  get seesThrough() {
    const v = this.game.viewer;
    return !!v && (v === this || !this.game.foes(v, this));
  }
  get hidden() {
    return (this.stealthed && !(this.exposeT > 0)) || !!this.jump || this.shade;   // (going through a rift: nothing to see but the light)
  }
  // in the shadow kill, all but its last cut: a shadow - nowhere to be seen, nothing to hit
  get shade() {
    return !!this.reap && this.reap.phase !== 'out';
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
    this.powered = { after: -1, hit: -1 };   // (the next hit counts for more: while the double's up, and a moment after)
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
    if (this.powered && this.powered.after < 0) this.powered.after = POWER_AFTER;
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
  // After the lighting, for everyone to see: the circle of runes at the feet, the sigil where the shot will burst,
  // the lasers to everything locked on and a mark on each (see archery.js).
  drawArchery(ctx) {
    const b = this.bow;
    if (!b || !this.alive) return;
    const k = Math.min(1, b.t / ARCH_CHARGE), t = this.game.time, fade = b.fired ? Math.max(0, 1 - b.out / 0.25) : 1;
    const h = this.bowHand, ny = h.y + CRYSTAL_BOW.tipY + 2 + (b.fired ? 0 : 8 * k);
    drawArcheryCast(ctx, this.x, this.y, h, { x: h.x, y: ny - 26 }, b.point ?? this.burstPoint(), b.fired ? [] : b.locks, k, fade, t, b.fired);
    for (const l of b.locks) drawArcheryMark(ctx, Math.round(l.v.x), Math.round(l.v.y - 14), Math.min(1, l.t / 0.35), t, fade);
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
  // attacking or rolling) - and out of it come swords of light, to hang in a fan behind you and go for whoever
  // comes near, one blow each (see main.js). They're paid for in stamina: the whole bar goes at once, a sword for
  // every 20 of it, up to five. The wait starts when the last of them has gone.

  updateSummon(dt, c) {
    const m = this.summon;
    if (!m) {
      if (c.skill && this.skillCD <= 0 && !this.swordsOut && !this.onLadder && !this.roll && this.alive && this.stamina >= SWORD_COST) {
        this.summon = { t: 0, seed: Math.random() * 100, n: Math.min(5, Math.floor(this.stamina / SWORD_COST)) };
        this.stamina = 0;
        this.sprinting = false;
        if (this.weapon?.reloading) this.weapon.cancelReload();
        this.hook = null;
      }
      return;
    }
    m.t += dt;
    if (m.t >= SUM_CAST) {
      this.game.summonSwords?.(this, m.seed, m.n);
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

  // ---------- target lock (skill, Q) ----------
  // Q: a visor of hologram comes up over the eyes, and for 4 s the sight's on whichever foe is nearest the mouse - point
  // at someone else and it goes to them. Whoever's locked is what the gun goes for, and it kicks less. Everyone sees the
  // mark (see main.js). Not the unseen: nothing to lock on to. Nor through a wall.
  updateLock(dt, c) {
    const m = this.lockOn;
    if (!m) {
      if (c.skill && this.skillCD <= 0 && this.alive) {
        this.lockOn = { t: LOCK_TIME, k: 0, acq: 0, target: null };
        this.game.fx.sparks(this.x + this.facing * 6, this.y - 18, 8, this.facing, 0, '#8fe8ff');
      }
      return;
    }
    m.t -= dt;
    m.k += dt;
    m.acq += dt;
    if (m.t <= 0) { this.lockOn = null; this.skillCD = LOCK_CD; return; }
    const to = this._cursor ?? { x: this.x + Math.cos(this.aim) * 140, y: this.y - GUN_HEIGHT + Math.sin(this.aim) * 140 };
    let best = null, bd = Infinity;
    for (const v of this.game.fighters) {
      if (v === this || !v.alive || v.vanish || v.stealthed || !this.game.foes(this, v)) continue;
      const s = this.seen(v);
      if (Math.hypot(s.x - this.x, s.y - this.y) > LOCK_RANGE || !this.game.los(this.x, this.y - GUN_HEIGHT, s.x, s.y - 12)) continue;
      // (the one it's on: a little harder to take it off, or it flicks between two side by side)
      const d = Math.hypot(s.x - to.x, s.y - 12 - to.y) - (v === m.target ? LOCK_STICK : 0);
      if (d < bd) { bd = d; best = v; }
    }
    if (best !== m.target) { m.target = best; m.acq = 0; }
  }
  // Whoever's locked: the aim's on them.
  lockAim() {
    const v = this.lockOn?.target;
    if (!v?.alive || v.vanish || v.stealthed || this.frozen) return;
    const s = this.seen(v), tx = s.x, ty = s.y - 9;
    let a = Math.atan2(ty - (this.y - GUN_HEIGHT), tx - this.x);
    // (a bot's hand isn't as steady as a machine's)
    if (this.bot) a += Math.sin(this.game.time * 3.3) * 0.05;
    this.aim = a;
    this.aimTarget = this.bot ? null : { x: tx, y: ty };
  }

  // ---------- what's running whatever the skill's doing ----------
  updateBuffs(dt, c) {
    if (this.guardT > 0) this.guardT -= dt;
    const al = this.allyCard;
    if (al) {
      if (al.kind === 'green' && this.game.regen !== false) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * CARD_HEAL * CARD_ALLY * dt);
      if ((al.left -= dt) <= 0 || (al.kind === 'purple' && (c.fire || c.melee || c.grenade))) {
        if (al.kind === 'purple') this.fade = { t: 0, dur: 0.25, out: false, seed: Math.random() * 100, rgb: '180, 110, 255' };
        this.allyCard = null;
      }
    }
    const p = this.powered;
    if (p) {
      if (p.hit >= 0 && (p.hit -= dt) < 0) this.powered = null;
      else if (p.after >= 0 && (p.after -= dt) < 0) this.powered = null;
    }
  }

  // ---------- blue shield (skill, Q) ----------
  // Q: a sphere of blue plates round you. It takes what's thrown at you till it's taken BARRIER_HP or its time's up -
  // then it goes off, a light shove and a little hurt to whoever's close (see main.js). See BARRIER_HP for what it costs.
  updateBarrier(dt, c) {
    const b = this.barrier;
    if (!b) {
      if (c.skill && this.skillCD <= 0 && this.alive) {
        this.barrier = { hp: BARRIER_HP, max: BARRIER_HP, t: BARRIER_TIME, age: 0, hit: 0 };
        this.game.fx.motes(this.x, this.y - 12, 14, ['#ffffff', '#6ad8ff', '#2a8cff']);
      }
      return;
    }
    b.age += dt;
    b.hit = Math.max(0, b.hit - dt * 5);
    if ((b.t -= dt) <= 0) this.breakBarrier(false);
  }
  // It's gone: it goes off, and the wait starts. (Hacked away: it just goes out.)
  breakBarrier(broken, quiet = false) {
    if (!this.barrier) return;
    this.barrier = null;
    this.skillCD = BARRIER_CD;
    if (quiet) return;
    this.guardT = BARRIER_GUARD;
    this.game.barrierBurst?.(this, broken);
  }

  // ---------- buff cards (skill, Q) ----------
  // Q: four cards fan out round the mouse - red up, blue right, green down, purple left - and a drag of the mouse
  // toward one takes it: it flies up over your head and whatever it is, you've got it. Red: your gun recovers faster.
  // Green: health coming back. Blue: quicker feet, and running costs less. Purple: gone for a moment and nothing can
  // touch you - until you attack. Q again (or leaving it) puts them away, with no wait to draw again. On your own
  // screen the fan stays put where the mouse was, whatever the camera does, and which one you lean to is worked out
  // there (main.js: c.cardHover, c.cardPick); everyone else sees it held that far from you (pick.x, y: from the feet).
  updateCard(dt, c) {
    const m = this.card;
    if (!m) {
      if (c.skill && this.skillCD <= 0 && this.alive) {
        const at = c.target ?? { x: this.x + Math.cos(this.aim) * 60, y: this.y - 14 + Math.sin(this.aim) * 60 };
        this.card = { t: 0, kind: null, on: false, left: 0, total: 1, pick: { x: at.x - this.x, y: at.y - this.y, t: 0, hover: null }, fly: null, seed: Math.random() * 100 };
        this.game.fx.sparks(at.x, at.y, 10, 0, -1, '#ffe08a');
      }
      return;
    }
    const p = m.pick;
    if (p) {
      p.t += dt;
      let take = null;
      if (this.bot) take = p.t > 0.35 ? this.botCard() : null;
      else {
        p.hover = c.cardHover ?? null;
        if (c.cardPick && p.t > 0.12) take = c.cardPick;
      }
      if (!take && ((c.skill && p.t > 0.2) || p.t > CARD_WAIT)) { this.card = null; return; }   // put away
      if (take) {
        m.kind = take;
        m.pick = null;
        m.fly = { x: p.x, y: p.y, t: 0 };
        const [ox, oy] = CARD_SPOT[take], at = this.game.cardPin?.(this) ?? { x: this.x + p.x, y: this.y + p.y };
        this.game.fx.sparks(at.x + ox, at.y + oy, 10, ox / 27, oy / 27, '#ffffff');
      }
      return;
    }
    if (m.fly) {
      if ((m.fly.t += dt) < CARD_FLY) return;
      m.fly = null;
      m.t = CARD_UP + CARD_TURN;   // (over the head, face up: the burst as it lands, then the buff)
      m.on = true;
      m.left = m.total = CARD_LAST[m.kind];
      if (m.kind === 'purple') this.fade = { t: 0, dur: 0.3, out: true, seed: Math.random() * 100, rgb: '180, 110, 255' };
      this.game.shareCard?.(this, m.kind);
      return;
    }
    m.t += dt;
    if (m.kind === 'green' && this.game.regen !== false) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * CARD_HEAL * dt);
    // (the phantom: over the moment you attack - nobody gets to shoot from where they can't be touched)
    const ends = (m.left -= dt) <= 0 || (m.kind === 'purple' && (c.fire || c.melee || c.grenade));
    if (ends) {
      if (m.kind === 'purple') this.fade = { t: 0, dur: 0.25, out: false, seed: Math.random() * 100, rgb: '180, 110, 255' };
      this.card = null;
      this.skillCD = CARD_CD;
    }
  }
  // A bot's pick: out of trouble if it's in it, health if it's hurt, the gun if it's been shooting, else its feet.
  botCard() {
    const hpK = this.hp / this.maxHp;
    return hpK < 0.35 && this.hurtT < 1 ? 'purple' : hpK < 0.6 ? 'green' : this.lastFireT < 1.5 ? 'red' : 'blue';
  }

  // ---------- hack (skill, Q) ----------
  // Q: a moment sending, a wave of signal goes out (see main.js: hackBurst), and every foe in reach has whatever
  // they've got going cut off, and no skill for HACK_LOCK. It goes through walls, signal does.
  updateHack(dt, c) {
    const m = this.hackCast;
    if (!m) {
      if (c.skill && this.skillCD <= 0 && this.alive && !this.roll) {
        this.hackCast = { t: 0 };
        this.hook = null;
      }
      return;
    }
    if ((m.t += dt) >= HACK_CAST) {
      this.hackCast = null;
      this.skillCD = HACK_CD;
      this.game.hackBurst?.(this);
    }
  }
  // Got by a hack: everything going is cut off.
  hacked(time) {
    this.hook = null;
    if (this.cloak) this.uncloak();
    if (this.decoy) this.dropDecoy();
    this.bow = null;
    this.mura = null;
    this.blaze = null;
    this.gal = null;
    this.summon = null;
    this.lockOn = null;
    this.hackCast = null;
    this.powered = null;
    this.batCast = null;
    this.wraith = null;
    if (this.deflect) { this.deflect = null; this.skillCD = DEFLECT_CD; }
    if (this.chidori) { this.chidori = null; this.skillCD = CHIDORI_CD; }
    if (this.octo) this.octoEnd();
    this.steal = null;
    this.stolen = null;
    if (this.phase) { this.phase = null; this.skillCD = JUMPER_CD; }   // (the rift's laid as far as it got: see main.js)
    if (this.fang && !this.fang.back) { this.fang.back = true; this.game.recallFangs?.(this); }   // (they come home)
    if (this.aurum) this.game.aurumOff?.(this);
    if (this.reap) { this.reap = null; this.skillCD = REAP_CD; }   // (pulled back out of the shadows, where it was)
    this.jamT = HACK_JAM;
    if (this.sande) { this.sande = null; this.skillCD = SANDE_CD; }
    this.breakBarrier(false, true);
    if (this.allyCard) { this.allyCard = null; }
    if (this.card) { if (this.phantom) this.fade = { t: 0, dur: 0.2, out: false, seed: Math.random() * 100, rgb: '180, 110, 255' }; this.card = null; }
    this.hackedT = time;
    if (this.flash !== undefined) this.flash = 0.06;
  }

  // ---------- Sandevistan (skill, Q) ----------
  // Q: for a moment of your own time - as long as the stamina you've got: SANDE_MIN_T on next to none, SANDE_MAX_T on a
  // full bar, all of it used - the whole world all but stops (see main.js: everyone else, and
  // everything flying, runs at SANDE_WORLD) and you go on as you were. Everyone caught in it can't shoot, hit, throw,
  // roll or use a skill till it's over - but anyone with a Sandevistan of their own can set it off, and move with you.
  // Your shots hang in the air with the rest.
  updateSande(dt, c) {
    const m = this.sande;
    if (!m) {
      if (c.skill && this.skillCD <= 0 && this.alive && this.stamina >= SANDE_NEED) {
        const k = this.stamina / MAX_STAMINA, t = SANDE_MIN_T + (SANDE_MAX_T - SANDE_MIN_T) * k;
        this.sande = { t, total: t, age: 0, from: this.stamina };
      }
      return;
    }
    m.age += dt;
    m.t -= dt;
    // the stamina's what it's running on: the bar going down with the time left
    this.stamina = m.from * Math.max(0, m.t / m.total);
    this.winded = false;
    this.staminaRest = 0.4;
    if (m.t <= 0) {
      this.sande = null;
      this.skillCD = SANDE_CD;
      this.stamina = 0;
      // what it takes out of you, the body pushed past what it can do: paid as it ends, and it can be the end of you
      const d = this.maxHp * SANDE_COST;
      this.hp -= d;
      this.hurtT = 0;
      this.flash = 0.08;
      this.game.onHurt?.(this, d, 'body', this);
      this.game.fx.sparks(this.x, this.y - 16, 10, 0, -1, '#7affc8');
      if (this.immortal) this.hp = Math.max(1, this.hp);
      if (this.hp <= 0) this.die(this, 'BURNED OUT', 0, -40);
    }
  }
  // After-images: every so often a hard-edged copy of the body in the next colour, left where it was, fading.
  drawSandeTrail(ctx) {
    const now = performance.now() / 1000, list = (this._sandeTrail ??= { items: [], pool: [], last: 0, hue: 0 });
    if (this.alive && this.sande && now - list.last > 0.034) {
      list.last = now;
      const it = list.items.length >= 16 ? list.items.shift() : { cv: list.pool.pop() ?? makeCanvas(64, 64) };
      const [c, g] = it.cv, hue = SANDE_HUES[list.hue++ % SANDE_HUES.length];
      const [src] = this.paintSelf(0.7, hue);
      g.globalCompositeOperation = 'copy';
      g.drawImage(src, 0, 0);
      g.globalCompositeOperation = 'source-over';
      it.x = Math.round(this.x); it.y = Math.round(this.y); it.at = now; it.c = c;
      list.items.push(it);
    }
    // (they don't all go at once: each fades, and those past it go back to be used again)
    // (laid over one another as colour, not added up: added, they burnt out white where they crowded over the body)
    const life = 0.55;
    ctx.save();
    for (const it of list.items) {
      const k = 1 - (now - it.at) / life;
      if (k <= 0 || now - it.at < 0.05) continue;
      ctx.globalAlpha = k * 0.62;
      ctx.drawImage(it.c, it.x - 32, it.y - 50);
    }
    ctx.restore();
    while (list.items.length && now - list.items[0].at > life) list.pool.push(list.items.shift().cv);
  }

  // ---------- vampire (skill, Q) ----------
  // Q: a moment calling, then a swarm of bats bursts out every way at once, each to bite whoever it finds and take the
  // blood back to you, health for what it drew (see main.js) - and you go with them: wraith form, a little while as
  // black smoke, seen by all but not to be touched, and faster on your feet. It ends early the moment you attack or roll.
  updateBats(dt, c) {
    const m = this.batCast;
    if (!m) {
      if (c.skill && this.skillCD <= 0 && this.alive && !this.roll && !this.wraith) this.batCast = { t: 0 };
      return;
    }
    if ((m.t += dt) >= BAT_CAST) {
      this.batCast = null;
      this.skillCD = BAT_CD;
      this.game.summonBats?.(this);
      this.wraith = { t: WRAITH_TIME, total: WRAITH_TIME, age: 0, held: !!c.fire };
    }
  }

  // A wall this side of the body, the whole height of the chest?
  wallBeside(dir) {
    const l = dir > 0 ? this.x + HALF_W : this.x - HALF_W - 2;
    return !!this.hits(l, this.y - 24, l + 2, this.y - 8);
  }
  // On to a wall (players only: the bots' routes don't know about it), and off it when it's no longer there or something
  // else has taken over.
  updateWall(c, reeling) {
    const taken = this.onGround || this.onLadder || this.roll || this.lunge || reeling || this.deflect?.phase === 'dash' || this.chidori?.phase === 'lunge' || this.chidori?.phase === 'stab' || this.blaze?.phase === 'dash';
    if (this.wall) {
      if (taken || !this.wallBeside(this.wall.dir)) this.wall = null;
      return;
    }
    const dir = Math.sign(c.move ?? 0);
    if (taken || this.bot || !dir || this.wallGrabs <= 0 || this.vy < -40 || this.crouch || !this.alive || !this.wallBeside(dir)) return;
    if (this.hits(this.x - HALF_W, this.y, this.x + HALF_W, this.y + 10)) return;   // (the floor's right there)
    this.wall = { dir, dust: 0 };
    this.wallGrabs--;
    this.airJumps = 1;
    this.vy = Math.max(0, Math.min(this.vy, 20));
    this.flipT = -1;
    this.bounce(40);
    this.game.fx.dust(this.x + dir * HALF_W, this.y - 10, 4);
  }

  // The skill in use: their own, or one they've taken off someone (skill thief).
  get usingSkill() {
    return this.stolen?.skill ?? this.skill;
  }
  // Anything of a skill still going on - to the very end of it (the bow still there a moment after it's loosed, the
  // time unseen after a shadow clone): a skill taken isn't handed back till all of it's done with, or what's left of
  // it would be left with nothing to finish it.
  get skillBusy() {
    return !!(this.cloak || this.decoy || this.veil || this.lunge || this.bow || this.mura || this.blaze || this.gal || this.summon || this.batCast || this.wraith || this.chidori || this.octo
      || this.deflect || this.sande || this.lockOn || this.barrier || this.card || this.hackCast || this.hook || this.swordsOut || this.steal || this.phase || this.fang || this.aurum || this.reap);
  }

  // ---------- golden fangs (skill, Q) ----------
  // Q: five gold daggers fanned out the way you aim, like a shotgun's shot - each sticks in the first foe it finds (or
  // the wall). Q again, or FANG_TIME, and they all come flying home to you - through walls, through anyone in the way,
  // tearing out of whoever they were in. (The daggers themselves: see main.js, throwFangs.) The wait starts once
  // they're all back.
  updateFang(dt, c) {
    const m = this.fang;
    if (!m) {
      if (c.skill && this.skillCD <= 0 && this.alive && !this.roll) {
        this.fang = { t: 0, back: false };
        this.game.throwFangs?.(this);
      }
      return;
    }
    m.t += dt;
    if (!m.back && ((c.skill && m.t > 0.25) || m.t >= FANG_TIME)) { m.back = true; this.game.recallFangs?.(this); }
    if (m.t > FANG_TIME + 4) { this.fang = null; this.skillCD = FANG_CD; }   // (lost track of them: let it go)
  }

  // ---------- aurum (skill, Q) ----------
  // Q: a gold sniper, violet light running in its lines, builds itself in the hands out of nothing - whatever gun you
  // had goes away meanwhile. Five shots, each a heavy round that goes through people, a violet streak behind it. All
  // fired, Q again, or AURUM_TIME, and it comes apart and your own gun's back. (The swap: main.js, aurumOn / aurumOff.)
  updateAurum(dt, c) {
    const m = this.aurum;
    if (!m) {
      if (c.skill && this.skillCD <= 0 && this.alive && !this.roll) {
        this.aurum = { t: 0 };
        this.game.aurumOn?.(this);
      }
      return;
    }
    m.t += dt;
    if (c.skill && m.t > AURUM_CAST + 0.3) m.quit = true;   // (put away: main.js does it)
  }
  drawAurum(ctx, t) {
    const m = this.aurum;
    if (!m || this.slot !== 2 || this.roll || this.flipT >= 0 || this.onLadder || (this.hidden && !this.seesThrough)) return;
    // (along the gun as it's drawn - tipped up coming out, kicked by a shot - from a little behind the grip)
    const g = this.gunPose(), x = g.x - Math.cos(g.a) * 9, y = g.y - Math.sin(g.a) * 9;
    if (m.t < AURUM_CAST) drawAurumCast(ctx, x, y, g.a, m.t / AURUM_CAST, t);
    else drawAurumHum(ctx, x, y, g.a, t, 1 - m.t / AURUM_TIME);
  }

  // ---------- shadow kill (skill, Q) ----------
  // Q, with a foe near and in sight: you're gone into shadow - nothing to see, nothing to hit - and shadows of you
  // come out of nowhere, one after another, cutting through the nearest of them, wherever they go. Only when someone
  // else comes up close to them (REAP_CHAIN) might the shadows go on to that one instead - and on from them, the same
  // way; and if the one being cut falls, on to whoever's close to where they were. Then you're back, behind the last
  // of them, with one last cut. Nobody near: nothing happens (it isn't spent).
  updateReap(dt, c) {
    let m = this.reap;
    if (!m) {
      if (!c.skill || this.skillCD > 0 || !this.alive || this.roll) return;
      const G = this.game, near = G.fighters.filter((v) => v !== this && v.alive && !v.vanish && !v.shade && G.foes(this, v) && !(v.hidden && !v.glimpsed)
        && Math.hypot(v.x - this.x, v.y - this.y) < REAP_RANGE && G.los(this.x, this.y - 14, v.x, v.y - 14));
      if (!near.length) { if (G.viewer === this) G.fx.motes(this.x, this.y - 16, 6, ['#3a0a5a', '#9a3aff']); return; }
      near.sort((a, b) => Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y));
      m = this.reap = { t: 0, phase: 'in', cur: near[0], n: 0, next: 0, cuts: [], px: this.x, py: this.y, seed: Math.random() * 100 };
      this.hook = null;
      this.onLadder = false;
      this.wall = null;
      if (this.weapon?.reloading) this.weapon.cancelReload();
      G.fx.motes(this.x, this.y - 14, 16, ['#0a0412', '#3a0a5a', '#9a3aff', '#ff3a5a']);
      G.lights.flash(this.x, this.y - 14, 90, '120, 40, 200', 0.15);
      return;
    }
    m.t += dt;
    for (const q of m.cuts) q.t += dt;
    m.cuts = m.cuts.filter((q) => q.t < 0.34);
    const G = this.game, foe = (o) => o && o !== this && o.alive && !o.vanish && !o.shade && G.foes(this, o) && !(o.hidden && !o.glimpsed);
    const h = (k) => { const q = Math.sin(k * 127.1 + m.seed * 311.7) * 43758.5453; return q - Math.floor(q); };
    // the nearest foe to (x, y) within r of it (but not `not`)
    const nearTo = (x, y, r, not) => {
      let best = null, bd = r;
      for (const o of G.fighters) { if (o === not || !foe(o)) continue; const d = Math.hypot(o.x - x, o.y - y); if (d < bd) { bd = d; best = o; } }
      return best;
    };
    if (m.phase === 'in' && m.t >= REAP_IN) m.phase = 'cut';
    if (m.phase === 'cut') {
      // who the next cut's for: the same one - fallen, whoever's close by where they were; someone else up close to
      // them, maybe that one
      if (m.next - dt <= 0 && m.n < REAP_CUTS) {
        if (!foe(m.cur)) m.cur = nearTo(m.cur?.x ?? m.px, m.cur?.y ?? m.py, REAP_CHAIN * 1.5, m.cur);
        else if (m.n > 0 && h(m.n + 3) < REAP_HOP) { const o = nearTo(m.cur.x, m.cur.y, REAP_CHAIN, m.cur); if (o) m.cur = o; }
      }
      const v = m.cur;
      if ((m.next -= dt) <= 0 && m.n < REAP_CUTS && v) {
        const a = h(m.n + 1) * Math.PI * 2, r = 30, cy = v.y - 14, ux = Math.cos(a), uy = Math.sin(a) * 0.55;
        m.cuts.push({ x0: v.x - ux * r, y0: cy - uy * r, x1: v.x + ux * r, y1: cy + uy * r, t: 0, s: h(m.n + 7) * 100 });
        m.n++;
        m.next = REAP_EVERY;
        m.px = v.x;   // (where you are, unseen: with them - the camera goes along)
        m.py = v.y;
        this.game.reapCut?.(this, v, REAP_HIT, ux, uy);
      }
      if (m.n >= REAP_CUTS || !v) {
        // out of the shadows behind the one being cut - with the last cut
        m.phase = 'out';
        m.t = 0;
        if (v) {
          const bx = v.x - v.facing * 16, room = !this.hits(bx - HALF_W, v.y - HEIGHT, bx + HALF_W, v.y - 1);
          m.px = room ? bx : v.x;
          m.py = v.y;
          this.facing = Math.sign(v.x - m.px) || -v.facing;
          m.fin = { x: v.x, y: v.y - 14 };
          this.game.reapCut?.(this, v, REAP_FINISH, this.facing, 0, true);
        }
        this.game.fx.motes(m.px, m.py - 14, 18, ['#0a0412', '#3a0a5a', '#9a3aff', '#ffd8ff']);
      }
    }
    this.x = m.px;
    this.y = m.py;
    this.vx = 0;
    this.vy = 0;
    if (m.phase === 'out' && m.t >= REAP_OUT) { this.reap = null; this.skillCD = REAP_CD; }
  }
  // The shadow kill's looks (after the lighting): going into shadow, the marks on whoever's caught, the shadows
  // cutting through them, the last cut
  drawReap(ctx, t) {
    const m = this.reap;
    if (!m) return;
    const paint = () => {
      // (a shadow of you with a blade, not the gun: a katana's put in its hand for the picture)
      const ms = this.melee, sl = this.slot;
      this.melee = (SHADE_BLADE ??= new MeleeWeapon(MELEE.katana ?? FISTS));
      this.slot = 1;
      try { return this.paintSelf(0.94, '12, 4, 24')[0]; } finally { this.melee = ms; this.slot = sl; }
    };
    if (m.phase === 'in') drawReapIn(ctx, paint(), m.px, m.py, m.t / REAP_IN, t, m.seed);
    if (m.phase !== 'out' && m.cur?.alive) drawReapMarks(ctx, [m.cur], t);
    if (m.cuts.length) drawShades(ctx, paint(), m.cuts, t, this.facing);
    if (m.phase === 'out' && m.fin) drawReapFinish(ctx, m.fin.x, m.fin.y, this.facing, m.t / REAP_OUT, t, m.seed);
  }

  // ---------- jumper (skill, Q) ----------
  // Q: a rift tears open where you stand and you step through it into the other place - nothing touches you there,
  // you're quicker, and you can't shoot - and wherever you go is the path (see main.js: updateRifts, which lays it).
  // Q again, or the time's up, and a second rift opens where you are, the two joined: anyone at all, either side, who
  // steps into one goes along the path as light and out of the other, for as long as the rifts last.
  updateJumper(dt, c) {
    const m = this.phase;
    if (!m) {
      if (c.skill && this.skillCD <= 0 && this.alive && !this.roll && !this.jump) {
        this.phase = { t: PHASE_TIME, age: 0 };
        this.onLadder = false;
        this.game.openRift?.(this);
      }
      return;
    }
    m.age += dt;
    if ((m.t -= dt) <= 0 || (c.skill && m.age > 0.3)) { this.phase = null; this.skillCD = JUMPER_CD; }
  }

  // ---------- skill thief (skill, Q) ----------
  // Q: a hack reaches out for the foe nearest the mouse (in reach, in sight, with a skill worth having) and takes hold:
  // a moment holding it on them - slower on your feet, no shooting, rolling, second jump or ladders - and it's done: they're cut off (whatever they had
  // going stops, no skill of their own for a moment) and you've a copy of their skill for the next Q. Out of sight, or
  // too far, or Q again: it's broken off. Used (or held too long), it's back to taking them.
  updateSteal(dt, c) {
    const m = this.steal;
    if (!m) {
      if (c.skill && this.skillCD <= 0 && this.alive && !this.roll) {
        const v = this.stealTarget(c);
        if (v) { this.steal = { t: 0, target: v, seed: Math.random() * 10 }; this.onLadder = false; }
        else {
          this.skillCD = 0.5;   // (nobody to take from: a fizzle)
          this.game.fx.sparks(this.x + this.facing * 6, this.y - 17, 5, this.facing, -0.5, '#ff6ad8');
        }
      }
      return;
    }
    const v = m.target;
    m.t += dt;
    const ok = v?.alive && !v.vanish && !v.wraith && !(v.hidden && !v.glimpsed) && Math.hypot(v.x - this.x, v.y - this.y) < STEAL_BREAK && this.stealSees(v);
    if (!ok || (c.skill && m.t > 0.2)) {
      this.steal = null;
      this.skillCD = STEAL_BROKE_CD;
      this.game.fx.sparks(this.x + this.facing * 6, this.y - 17, 6, this.facing, -0.5, '#c05aff');
      return;
    }
    if (m.t < STEAL_LOCK) return;
    this.steal = null;
    // a skill that can't be taken (another thief's, a grapple): they're hacked all the same, and that's all - the wait
    if (UNSTEALABLE.includes(v.usingSkill)) this.skillCD = this.stealWait = STEAL_CD;
    else {
      this.stolen = { skill: v.usingSkill, left: STEAL_HOLD, used: false, t: 0 };
      this.skillCD = 0;
    }
    this.game.stealHit?.(this, v);
  }
  // Who a hack could go for: the foes in reach and in sight with a skill (one that can't be taken still gets them hacked).
  stealable() {
    return this.game.fighters.filter((v) => v !== this && v.alive && !v.vanish && !v.wraith && this.game.foes(this, v) && !(v.hidden && !v.glimpsed)
      && v.usingSkill && Math.hypot(v.x - this.x, v.y - this.y) <= STEAL_RANGE && this.stealSees(v));
  }
  // In sight for a hack: a clear line chest to chest, or head to head (over low cover).
  stealSees(v) {
    return this.game.los(this.x, this.y - 17, v.x, v.y - 14) || this.game.los(this.x, this.y - 25, v.x, v.y - 24);
  }
  // ...and which of them it does go for: the one nearest the mouse (at: where that is; else out along the aim).
  stealTarget(c, list = this.stealable()) {
    const at = c.target ?? { x: this.x + Math.cos(this.aim) * 120, y: this.y - 14 + Math.sin(this.aim) * 120 };
    let best = null, bd = Infinity;
    for (const v of list) {
      const d = Math.hypot(v.x - at.x, v.y - 14 - at.y);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  // ---------- octo arms (skill, Q) ----------
  // Q: four steel arms out of the back, each reaching out and pulling a gun - any kind, at random - out of nowhere.
  // Then they hang round you and fire where you aim whenever you do (your own gun too) - held down, every gun goes as
  // fast as it can, a semi-automatic as if you were clicking for it - never running dry, till its time's up or Q again:
  // then they throw their guns away and draw back in. While they're out there's no rolling, no somersault of a second
  // jump, no ladders.
  updateOcto(dt, c) {
    const m = this.octo;
    if (!m) {
      if (c.skill && this.skillCD <= 0 && this.alive && !this.roll) {
        const W = this.game.weapons, pool = Object.keys(W).filter((k) => OCTO_KINDS.includes(W[k].cls) && W[k].art && GUN_ART[W[k].art]);
        const arms = OCTO_SLOTS.map((_, i) => ({ key: pool[Math.floor(Math.random() * pool.length)], cd: 0.05 + i * 0.06, kick: 0 }));
        this.octo = { t: 0, on: false, left: OCTO_TIME, gone: -1, arms, tx: this.x + this.facing * 100, ty: this.y - 14 };
        this.onLadder = false;
      }
      return;
    }
    m.t += dt;
    if (m.gone >= 0) { if ((m.gone += dt) >= OCTO_GONE) this.octo = null; return; }   // (going: see octoEnd)
    const tg = c.target ?? { x: this.x + Math.cos(this.aim) * 200, y: this.y - 14 + Math.sin(this.aim) * 200 };
    m.tx = tg.x;
    m.ty = tg.y;
    if (c.skill && m.t > 0.3) return this.octoEnd();   // (Q again: put away)
    if (!m.on) { if (m.t >= OCTO_REACH) m.on = true; return; }
    if ((m.left -= dt) <= 0) return this.octoEnd();
    const W = this.game.weapons;
    m.arms.forEach((a, i) => {
      a.kick = Math.max(0, a.kick - dt * 9);
      a.cd -= dt;
      const d = W[a.key];
      if (!c.fire || a.cd > 0) return;
      a.cd = d.fireInterval * (1 + Math.random() * 0.15);
      a.kick = 1;
      this.octoFire(i, d);
    });
  }
  // Where arm i's claw is, and which way its gun points (at what's aimed at). Reaching out first, then hanging round
  // you, swaying; going, drawn back in to the root. grow: how far the gun's come into being; held: it's there.
  octoTip(i) {
    const m = this.octo, f = this.facing, t = this.game.time, k = m.t - i * 0.09, a = m.arms[i];
    const root = octoRoot(this), [sx, sy] = OCTO_SLOTS[i], [rx, ry] = OCTO_REACH_AT[i];
    const slot = { x: this.x + f * sx + Math.sin(t * 2.1 + i * 1.7) * 2, y: this.y + sy + Math.cos(t * 1.6 + i) * 2 };
    const reach = { x: this.x + f * rx, y: this.y + ry };
    let x, y;
    if (m.gone >= 0) {
      // (the gun flung off first, then the arm drawn back in, a little after the one before)
      const q = ease(Math.max(0, (m.gone - 0.1 - i * 0.04) / 0.36)), from = m.from?.[i] ? { x: this.x + m.from[i].x, y: this.y + m.from[i].y } : slot;
      x = from.x + (root.x - from.x) * q;
      y = from.y + (root.y - from.y) * q;
    } else if (k < 0.32) { const q = ease(k / 0.32); x = root.x + (reach.x - root.x) * q; y = root.y + (reach.y - root.y) * q; }
    else { const q = ease((k - 0.32) / 0.38); x = reach.x + (slot.x - reach.x) * q; y = reach.y + (slot.y - reach.y) * q; }
    const ang = Math.atan2(m.ty - y, m.tx - x);
    x -= Math.cos(ang) * a.kick * 3;
    y -= Math.sin(ang) * a.kick * 3;
    return { x, y, ang, grow: Math.max(0, Math.min(1, (k - 0.22) / 0.14)), held: k >= 0.22 && m.gone < 0, gone: m.gone >= 0 ? Math.min(1, m.gone / OCTO_GONE) : 0 };
  }
  octoFire(i, d) {
    const tip = this.octoTip(i), art = GUN_ART[d.art], gp = art.points.grip, mp = art.points.muzzle;
    const ux = Math.cos(tip.ang), uy = Math.sin(tip.ang), flip = ux < 0 ? -1 : 1, ox = mp.x - gp.x, oy = (mp.y - gp.y) * flip;
    const mx = tip.x + ux * ox - uy * oy, my = tip.y + uy * ox + ux * oy, pellets = d.pellets ?? 1;
    for (let j = 0; j < pellets; j++) {
      const spread = pellets > 1 ? ((j / (pellets - 1)) * 2 - 1 + (Math.random() - 0.5) * 0.4) * d.spread : (Math.random() * 2 - 1) * d.spread * 1.2;
      this.game.fireBullet(this, mx, my, tip.ang + spread, d.bulletSpeed * (pellets > 1 ? 0.85 + Math.random() * 0.3 : 1), d.damage * DAMAGE * gunMul(d) * (this.game.gunDamage ?? 1) * OCTO_DMG, d.range ?? 520, d.pierce ?? 0, FAR_HIT[d.cls] ?? 0.6);
    }
    this.game.muzzle(mx, my, tip.ang, { suppressed: false, shake: 0.5, def: d }, this);
    if (art.shell) this.game.fx.casing({ x: tip.x, y: tip.y - 1 }, { x: -ux * 0.3, y: -0.8 }, art.shell, 0.8);
    this.lastFireT = 0;
  }
  // Over: each arm flings its gun away, spinning, then they draw back in with a hiss of steam off the back - put away
  // before they'd all got their guns, they're drawn back in from wherever they'd reached. quick: gone at once (dead).
  octoEnd(quick = false) {
    const m = this.octo;
    if (!m) return;
    this.skillCD = OCTO_CD;
    if (quick) { this.octo = null; return; }
    if (m.gone < 0) {
      // (where each claw is now - out reaching still, or hanging in place - for it to be drawn back in from there)
      m.from = m.arms.map((_, i) => { const p = this.octoTip(i); return { x: p.x - this.x, y: p.y - this.y, held: p.held }; });
      m.gone = 0;
      const r = octoRoot(this), W = this.game.weapons;
      this.game.fx.smoke(r.x - this.facing * 4, r.y, 5);
      m.arms.forEach((a, i) => {
        if (!m.from[i].held) return;   // (not got hold of its gun yet: nothing to throw)
        // (thrown out the way the arm was holding it from you, up and spinning)
        const tip = this.octoTip(i), dx = tip.x - r.x, dy = tip.y - r.y, d = Math.hypot(dx, dy) || 1, icon = (OCTO_ICONS[a.key] ??= new Weapon(W[a.key]).icon);
        this.game.fx.add({ x: tip.x, y: tip.y, vx: (dx / d) * (120 + Math.random() * 70), vy: (dy / d) * 90 - 170 - Math.random() * 60, life: 5, img: icon, grav: 700, bounce: 0.3, drag: 0.6, vrot: (Math.random() - 0.5) * 26, kind: 'debris' });
        this.game.fx.sparks(tip.x, tip.y, 4, dx / d, -1, '#ffd0a0');
      });
    }
  }

  // ---------- chidori (skill, Q) ----------
  // Q: a moment gathering it, then lightning crackling in the hand, and quicker on your feet: run into a foe and it's
  // driven through them (see main.js: chidoriStrike). Q again: a lunge along the mouse, the hand out in front, once.
  // No shooting with it in hand. Held too long, it goes out.
  updateChidori(dt, c) {
    const m = this.chidori;
    if (!m) {
      if (c.skill && this.skillCD <= 0 && this.alive && !this.roll) {
        this.chidori = { phase: 'charge', t: 0, a: this.aim, lunged: false };
        if (this.weapon?.reloading) this.weapon.cancelReload();
        this.hook = null;
      }
      return;
    }
    const over = () => { this.chidori = null; this.skillCD = CHIDORI_CD; };
    // turned the way it's going in, whatever the mouse is doing: into them, along the lunge, the way you're running with it
    const face = (d) => { if (d && d !== this.facing) { this.facing = d; this.settle = 0; } };
    if (m.phase === 'stab' || m.phase === 'lunge') { this.aim = m.a; face(Math.sign(Math.cos(m.a))); }
    else if (m.phase === 'hold' && c.move) face(Math.sign(c.move));
    // in them: held there, the two of you, till it throws them off
    if (m.phase === 'stab') {
      this.vx = this.vy = 0;
      this.game.chidoriHold?.(this, m);
      if ((m.t -= dt) <= 0) { this.game.chidoriRelease?.(this, m); over(); }
      return;
    }
    if (m.phase === 'charge') {
      if ((m.t += dt) >= CHIDORI_CHARGE) {
        m.phase = 'hold';
        m.t = CHIDORI_TIME;
        this.game.lights.flash(this.x, this.y - 14, 120, '150, 210, 255', 0.25);
      }
      return;
    }
    if (m.phase === 'lunge') {
      if ((m.t -= dt) <= 0) { m.phase = 'hold'; m.t = Math.max(m.t, m.left); this.vx *= 0.3; this.vy = Math.min(this.vy, 0) * 0.3; }
    } else {
      if ((m.t -= dt) <= 0) return over();
      if (c.skill && !m.lunged) {
        m.phase = 'lunge';
        m.lunged = true;
        m.left = m.t;
        m.t = CHIDORI_LUNGE_T;
        m.a = this.aim;
        this.onLadder = false;
        this.crouch = false;
        this.game.fx.sparks(this.x, this.y - 14, 10, -Math.cos(m.a), -Math.sin(m.a), '#9fe6ff');
      }
    }
    const v = this.game.chidoriStrike?.(this, m);
    if (v) Object.assign(m, { phase: 'stab', t: CHIDORI_STAB, victim: v, a: m.phase === 'lunge' ? m.a : Math.sign(v.x - this.x) >= 0 ? 0 : Math.PI, seed: Math.random() * 100 });
    if (v) { this.aim = m.a; face(Math.sign(Math.cos(m.a))); }
  }
  // Where the lit hand is: out in front, gathering and standing; trailing low behind, running with it; thrust out along
  // the line, lunging.
  chidoriHand() {
    const m = this.chidori, y = this.y + this.pose.body;
    if (m.phase === 'stab') return { x: this.x + Math.cos(m.a) * 12, y: y - 14 + Math.sin(m.a) * 12 };   // (in them, up to the wrist)
    if (m.phase === 'lunge') return { x: this.x + Math.cos(m.a) * 13, y: y - 14 + Math.sin(m.a) * 13 };
    if (m.phase === 'hold' && this.onGround && Math.abs(this.vx) > 40) return { x: this.x - Math.sign(this.vx) * 10, y: y - 5 };
    return { x: this.x + this.facing * 8, y: y - 11 };
  }

  // ---------- deflect (skill, Q) ----------
  // Q: hand on the hilt, the katana still at the hip, and a field of force comes up round the body: any shot that reaches
  // it turns back the way you're aiming (see main.js). No shooting, no rolling, slower on your feet. At the end of it (or
  // Q again) the draw: one dash along the mouse with the blade out, cutting whoever's in the way, and a moment to finish.
  updateDeflect(dt, c) {
    const m = this.deflect;
    if (!m) {
      if (c.skill && this.skillCD <= 0 && !this.onLadder && !this.roll && this.alive) {
        this.deflect = { phase: 'guard', t: DEFLECT_TIME, age: 0, spark: 0, ripples: [], a: this.aim, dist: 0, hit: [], trail: [] };
        if (this.weapon?.reloading) this.weapon.cancelReload();
        this.hook = null;
      }
      return;
    }
    m.spark = Math.max(0, m.spark - dt * 5);
    for (const r of m.ripples) r.t -= dt * 3.2;
    m.ripples = m.ripples.filter((r) => r.t > 0);
    if (m.phase === 'guard') {
      m.age += dt;
      if ((m.t -= dt) <= 0 || (c.skill && m.age > 0.25)) {
        m.phase = 'dash';
        m.a = this.aim;
        m.dist = 0;
        m.x0 = this.x;
        m.y0 = this.y - 14;
        this.onLadder = false;
        this.crouch = false;
        this.game.fx.sparks(this.x, this.y - 14, 12, -Math.cos(m.a), -Math.sin(m.a), '#7affd0');
        this.game.lights.flash(this.x, this.y - 14, 90, '90, 255, 190', 0.15);
        if (this.game.viewer === this) this.game.kick?.(-Math.cos(m.a) * 4, -Math.sin(m.a) * 4);
      }
    } else if (m.phase === 'finish') {
      this.aim = m.a;
      if ((m.t -= dt) <= 0) this.deflect = null;
    }
  }
  deflectStep(moved, dt) {
    const m = this.deflect;
    m.dist += moved;
    m.trail.unshift({ x: this.x, y: this.y - 14 });
    m.trail.length = Math.min(m.trail.length, 14);
    this.game.deflectCut?.(this, m, DEFLECT_CUT);
    // the end of its reach, or a wall: stopped dead, the blade out, the cut left hanging in the air behind
    if (m.dist >= DEFLECT_REACH || moved < DEFLECT_SPEED * dt * 0.3) {
      this.vx *= 0.15;
      this.vy = Math.min(0, this.vy * 0.15);
      this.skillCD = DEFLECT_CD;
      this.game.deflectEnd?.(this, m);
      this.deflect = { ...m, phase: 'finish', t: DEFLECT_FINISH };
    }
  }
  // The katana itself - the real one, as it's carried in hand - at (x, y) along ang as seen facing right.
  // In its scabbard: the hilt showing, black lacquer over the blade with a bright line along it and a cap at the end.
  drawKatanaAt(ctx, x, y, ang, sheathed) {
    const k = (this._kata ??= new MeleeWeapon(MELEE.katana));
    const a = this.facing > 0 ? ang : Math.PI - ang, flip = Math.cos(a) >= 0 ? 1 : -1;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(a);
    ctx.scale(1, flip);
    k.draw(ctx);
    if (sheathed) {
      ctx.fillStyle = '#0b0e12';
      ctx.fillRect(5, -3.5, 25, 6);
      ctx.fillStyle = '#1c232c';
      ctx.fillRect(5, -3, 25, 5);
      ctx.fillStyle = '#46586c';
      ctx.fillRect(6, -2.5, 23, 1);
      ctx.fillStyle = '#c9a83a';
      ctx.fillRect(5, -3, 2, 5);
      ctx.fillRect(28, -3, 2, 5);
      ctx.fillStyle = '#7a2a3a';
      ctx.fillRect(9, -3, 3, 5);
    }
    ctx.restore();
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
    const kickK = this.stanceKick, far = FAR_HIT[d.cls] ?? 0.6, weak = this.barrier ? BARRIER_GUN : 1;
    for (let i = 0; i < pellets; i++) {
      // (a shotgun's fan: only half as much of it, it's a fan whatever you're doing)
      const spread = pellets > 1 ? ((i / (pellets - 1)) * 2 - 1 + (rnd() - 0.5) * 0.4) * w.spread * (1 + (kickK - 1) * 0.5) : (rnd() * 2 - 1) * w.spread * kickK;
      const speed = d.bulletSpeed * (pellets > 1 ? 0.85 + rnd() * 0.3 : 1);
      this.game.fireBullet(this, m.x, m.y, dir + spread, speed, w.damage * DAMAGE * gunMul(d) * (this.game.gunDamage ?? 1) * weak, d.range ?? 520, d.pierce ?? 0, far);
    }
    if (!d.action && !d.keepsShells) this.ejectShell(g);
    this.lastFireT = 0;
    // a shove from the heavy ones, mostly felt in the air
    const kick = Math.min(110, w.damage * DAMAGE * gunMul(d) * pellets * 0.7) * (this.onGround ? 0.25 : 0.8) * (this.lockOn ? LOCK_KICK : 1);
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
    if (this.shield > 0 || this.phantom || this.wraith || this.phase || this.jump || this.guardT > 0 || this.shade) return false;   // just beamed back in; the purple card; the shield just gone
    let d = dmg * (head ? HEAD_MUL : 1) * (this.hackedT > 0 ? HACK_HURT : 1);
    // whoever hit them with a clone's charge on: it counts for more, the once (a shotgun's pellets all count as the one)
    const hitter = from?.powered;
    let charged = false;
    if (hitter) {
      if (hitter.hit < 0) hitter.hit = 0.08;
      d *= POWER_MUL;
      charged = true;
    }
    // the shield takes it first, what's left of it - a melee blow counts double on it, a blast half as much again
    const b = this.barrier;
    if (b) {
      const worth = this.blast ? 1.5 : this.hitHow ? 2 : 1;
      b.hit = 1;
      b.hp -= d * worth;
      this.game.onShieldHit?.(this, d);
      if (b.hp > 0) { this.vx += kx * 0.2; this.vy += ky * 0.2; this.hitBy = from?.isDecoy ? from.owner : from; return true; }
      this.breakBarrier(true);
      return true;   // (what broke it stops there: the moment after, nothing can touch you)
    }
    this.hp -= d;
    this.flash = 0.06;
    this.hurtT = 0;
    this.hitBy = from?.isDecoy ? from.owner : from;   // (the bots: who it was)
    this.vx += kx * (this.dummy ? 0.25 : 1);
    this.vy += ky * (this.dummy ? 0.25 : 1);
    if (this.onLadder && Math.abs(kx) > 80) this.onLadder = false;
    // the damage number that pops up (head / blast / critical / melee / body), training's meter
    this.game.onHurt?.(this, d, charged ? 'crit' : head ? 'head' : this.blast ? 'blast' : this.hitHow === 'BACKSTAB' ? 'crit' : this.hitHow ? 'melee' : 'body', from);
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
    this.lockOn = null;
    this.barrier = null;
    this.guardT = 0;
    this.card = null;
    this.allyCard = null;
    this.powered = null;
    this.hackCast = null;
    this.hackedT = 0;
    this.sande = null;
    this.batCast = null;
    this.wraith = null;
    this.chidori = null;
    if (this.octo) this.octoEnd(true);
    this.steal = null;
    this.stolen = null;
    this.phase = null;
    this.jump = null;
    this.deflect = null;
    this.fang = null;
    this.aurum = null;
    this._prevGun = null;
    this.reap = null;
    this.jamT = 0;
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
    if ((this.wraith || this.phase || this.jump || this.shade) && !this.painting) return;   // (smoke; the other place; light: all drawn after the lighting)
    if (this.hidden && !this.painting) {
      if (this.glimpsed) return;   // (drawn after the lighting, glowing: see drawGlimpse - for you too, the moment you're seen)
      if (!this.seesThrough) return;
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
    if (!this.wraith) this.drawSlung(ctx, x, y);
    if (this.octo) drawOctoArms(ctx, this);
    ctx.save();
    ctx.translate(this.facing < 0 ? x + 1 : x, y);
    if (this.facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(part('legL'), ox + pose.legL[0], oy - pose.legL[1]);
    ctx.drawImage(part('legR'), ox + pose.legR[0], oy - pose.legR[1]);
    ctx.drawImage(part('body'), ox, oy + pose.body);
    ctx.drawImage(part(this.blinkLeft > 0 ? 'headBlink' : 'head'), ox + pose.headX, oy + pose.head);
    ctx.restore();
    if (this.wraith) return;
    if (this.octo) drawOctoGuns(ctx, this, this.game.weapons);
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
    ctx.fillStyle = 'rgba(225, 210, 255, 0.55)';
    ctx.fillRect(x - 7, ly, 15, 1);
    ctx.fillStyle = `rgba(${rgb}, 0.35)`;
    ctx.fillRect(x - 10, ly + 1, 21, 1);
    drawSparkle(ctx, x, y, k, t, F.seed, rgb);
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
  // Whatever's said over someone's head goes above their name and health, one above another: where the top of a
  // thing h high goes, this frame (main.js sets _labelUp back to 0 each frame).
  labelY(h) {
    const y = this.y - (this.bow ? 48 : 36) - 10 - (this._labelUp ?? 0) - h;
    this._labelUp = (this._labelUp ?? 0) + h + 2;
    return y;
  }
  // After the lighting: the newer skills' looks. What's going on with someone unseen is for themselves alone to see.
  drawSkillLooks(ctx) {
    if (!this.alive) return;
    const t = this.game.time, mine = this.seesThrough;
    this.drawReap(ctx, t);
    this.drawAurum(ctx, t);
    // wraith form going on and off: a burst of smoke, on whoever's screen this is. And all the while, more pouring off it.
    const wr = this.wraith, now = performance.now();
    if (!!wr !== !!this._wraithWas) {
      this.game.fx.wraith(this.x, this.y, 26, 10, 70);
      this.game.fx.sparks(this.x, this.y - 16, 12, 0, -1, '#ff2a40');
      this.game.lights.flash(this.x, this.y - 16, 100, '255, 40, 60', 0.2);
    }
    this._wraithWas = wr;
    if (wr) {
      this._wraithSmoke = (this._wraithSmoke ?? 0) + (now - (this._wraithAt ?? now)) / 1000 * 42;
      this._wraithAt = now;
      const n = Math.min(6, Math.floor(this._wraithSmoke));
      this._wraithSmoke -= Math.floor(this._wraithSmoke);
      if (n) this.game.fx.wraith(this.x, this.y, n);
      drawWraith(ctx, this.x, this.y, this.y + this.pose.head - 17, this.facing, wr.age, wr.t, t, this.vx, (tint, rgb) => this.paintSelf(tint, rgb));
    } else this._wraithAt = null;
    if (this.hidden && !mine) return;
    const b = this.barrier;
    if (b) drawShieldBubble(ctx, this.x, this.y - 14, Math.max(0, b.hp / b.max), b.hit, b.age, b.t, t);
    if (this.hackedT > 0) drawHacked(ctx, this.x, this.y, this.hackedT, HACK_LOCK, t, 1, this.labelY(HACKED_H));
    const m = this.card;
    const pin = (m?.pick || m?.fly) && this.game.cardPin?.(this);   // (your own: where it was put on the screen)
    if (m?.pick) drawCardFan(ctx, pin ? pin.x : this.x + m.pick.x, pin ? pin.y : this.y + m.pick.y, m.pick.t, m.pick.hover, t, mine);
    else if (m?.fly) drawCardFly(ctx, pin ? pin.x : this.x + m.fly.x, pin ? pin.y : this.y + m.fly.y, m.kind, this.x, this.labelY(34) + 21, m.fly.t / CARD_FLY, t, m.seed);
    else if (m) {
      if (m.on) drawCardAura(ctx, this.x, this.y, m.kind, t, 1, this.vx, this.facing);
      if (!(m.on && m.kind === 'purple' && !mine)) {
        const flipEnd = CARD_UP + CARD_TURN, full = !m.on || m.t < flipEnd + CARD_HOLD, h = full ? (m.kind ? 34 : 26) : 16;
        drawCard(ctx, this.x, this.labelY(h) + h, m.kind, m.t, CARD_UP, flipEnd, t, m.on ? m.left / m.total : 1);
      }
    }
    const al = this.allyCard;
    if (al) {
      drawCardAura(ctx, this.x, this.y, al.kind, t, 2, this.vx, this.facing);
      if (!(al.kind === 'purple' && !mine)) drawCard(ctx, this.x, this.labelY(16) + 16, al.kind, 99, 0, 0.01, t, al.left / al.total);
    }
    if (this.guardT > 0) drawGuard(ctx, this.x, this.y, this.guardT, t);
    if (this.batCast) drawBatCast(ctx, this.x, this.y - 16, Math.min(1, this.batCast.t / BAT_CAST), t);
    if (this.octo) drawOctoGlow(ctx, this, t);
    if (this.phase) drawPhased(ctx, this.paintSelf(0.85, '150, 90, 255')[0], this.x, this.y, t, mine);
    if (this.steal?.target) {
      const v = this.steal.target;
      drawStealTether(ctx, this.x + this.facing * 6, this.y + this.pose.body - 17, v.x, v.y - 14, Math.min(1, this.steal.t / STEAL_LOCK), t, this.steal.seed ?? 0, v.labelY(8));
    }
    if (this.stolen) drawStolen(ctx, this.x, this.stolen.t < 1.8 ? this.labelY(10) : 0, this.stolen.name ?? this.stolen.skill.toUpperCase(), this.stolen.color, this.stolen.t, t, this.y + this.pose.head - 22);
    const ch = this.chidori;
    if (ch) {
      const h = this.chidoriHand(), tr = (this._zapTrail ??= []), now = performance.now();
      tr.unshift({ x: h.x, y: h.y });
      tr.length = Math.min(tr.length, 12);
      // sparks thrown up off the floor as it's dragged along it
      if (ch.phase === 'hold' && this.onGround && Math.abs(this.vx) > 40 && now - (this._zapSpark ?? 0) > 45) {
        this._zapSpark = now;
        this.game.fx.sparks(h.x, this.y - 1, 2, -Math.sign(this.vx), -0.6, '#9fe6ff');
      }
      if (ch.phase === 'stab') {
        const k = 1 - Math.max(0, ch.t) / CHIDORI_STAB, v = ch.victim;
        if (v?.alive && !v.hidden) drawShocked(ctx, v.x, v.y, t, k, (tint, rgb) => v.paintSelf(tint, rgb));
        drawChidoriStab(ctx, h.x, h.y, ch.a, k, t, ch.seed ?? 0);
      }
      // (in them, it's all gone into the spear: only a small hot knot left at the wrist)
      drawChidori(ctx, h.x, h.y, ch.phase === 'charge' ? Math.min(1, ch.t / CHIDORI_CHARGE) : ch.phase === 'stab' ? 0.35 : 1, t, ch.phase === 'charge', ch.phase === 'stab' ? [] : tr, this.y, ch.phase === 'lunge');
    } else this._zapTrail = null;
    const dm = this.deflect;
    if (dm?.phase === 'guard') {
      drawDeflectField(ctx, this.x, this.y - 14, dm.age, dm.t, t, dm.ripples);
      // the way it's all going, the line stopping at a wall; how near the draw is, over the head
      let len = 0;
      if (this.seesThrough) {
        const L = this.game.level, ux = Math.cos(this.aim), uy = Math.sin(this.aim);
        while (len < DEFLECT_REACH && !L.solidAt(this.x + ux * (len + 4), this.y - 14 + uy * (len + 4))) len += 4;
      }
      drawDeflectAim(ctx, this.x, this.y - 14, this.aim, dm.age, t, dm.spark, len);
      drawDeflectBar(ctx, this.x, Math.round(this.labelY(3)), 1 - dm.t / DEFLECT_TIME, dm.age > 0.25);
    }
    else if (dm?.phase === 'dash' && dm.trail.length) {
      // the band of light, and copies of the body strung along it, in the colour of the field
      const [c0] = this.paintSelf(0.72, '90, 255, 190');
      ctx.save();
      dm.trail.forEach((q, i) => {
        if (i % 3 !== 2) return;
        ctx.globalAlpha = (1 - i / dm.trail.length) * 0.55;
        ctx.drawImage(c0, Math.round(q.x) - 32, Math.round(q.y + 14) - 50);
      });
      ctx.restore();
      drawDeflectDash(ctx, dm.trail.slice(3), dm.a);   // (from just behind the body, not over its face)
    }
    if (this.powered) drawPowered(ctx, this.x + this.facing * 8, this.y - 14, t, 1);
    if (this.hackCast) drawHackCast(ctx, this.x + this.facing * 5, this.y - 22, Math.min(1, this.hackCast.t / HACK_CAST), t);
  }
  // After the lighting: the line glows (a soft cyan along it, brighter at the claw).
  drawHookGlow(ctx) {
    this.drawBlaze(ctx);
    this.drawGalCast(ctx);
    this.drawSumCast(ctx);
    if (this.alive && this.lockOn && !this.roll && this.flipT < 0) {
      // (the cone looks at whoever's locked, while they can be seen; otherwise along the aim)
      const v = this.lockOn.target, y = this.y + this.pose.head - 17, look = v?.alive && !v.vanish && !v.stealthed ? Math.atan2(v.y - 14 - y, v.x - this.x) : this.aim;
      drawVisor(ctx, this.x, y, this.facing, this.lockOn.k, this.lockOn.t, this.game.time, 18, look);
    }
    this.drawSkillLooks(ctx);
    if (this.alive && this.glimpsed) this.drawGlimpse(ctx);   // (you too: so you know you've been seen)
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
    if (!g || (this.slot === 2 && !this.bow && !this.mura && !this.blaze && !this.gal && !this.summon && !this.deflect && !this.chidori)) return;   // (put away too while the archery bow's out)
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
    if (this.chidori) {
      // the lit hand open; the other gripping its wrist, but for when it's running with it or lunging
      const h = this.chidoriHand(), m = this.chidori;
      drawHand(ctx, 'open', Math.round(h.x), Math.round(h.y));
      if (m.phase === 'charge' || (m.phase === 'hold' && Math.abs(this.vx) <= 40) || m.phase === 'stab') drawHand(ctx, 'grab', Math.round(h.x - this.facing * 3), Math.round(h.y + 2));
      return;
    }
    if (this.deflect) {
      const m = this.deflect, y = this.y + this.pose.body, f = this.facing;
      if (m.phase === 'guard') {
        // the stance: the katana at the hip, the blade (in its scabbard) slanting away behind and a little down, the
        // far hand steadying the scabbard, the near hand on the hilt and waiting
        const hx = this.x + f * 5, hy = y - 11;
        drawHand(ctx, 'open', Math.round(this.x - f * 1), hy + 2);
        this.drawKatanaAt(ctx, hx, hy, Math.PI - 0.3, true);
        drawHand(ctx, 'grab', Math.round(hx), hy);
      } else {
        // drawn: straight out along the cut; finishing, swung on through and held low
        const ax = Math.cos(m.a), ay = Math.sin(m.a), done = m.phase === 'finish' ? 1 - m.t / DEFLECT_FINISH : 0;
        const sw = done > 0 ? Math.min(1, done * 3) * 0.9 : 0, ang = (f > 0 ? m.a : Math.PI - m.a) + sw;
        const hx = this.x + ax * 7, hy = y - 14 + ay * 7;
        this.drawKatanaAt(ctx, hx, hy, ang, false);
        drawHand(ctx, 'grab', Math.round(hx), Math.round(hy));
        drawHand(ctx, 'grab', Math.round(hx - ax * 3), Math.round(hy - ay * 3));
      }
      return;
    }
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
