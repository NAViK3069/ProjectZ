// Melee weapons (slot 1): knives, bats, axes, a katana, a chainsaw...
//
// Three ways to attack:
//   swing - wind up, sweep through an arc (hits everything in it), recover;
//           swings alternate forehand / backhand
//   stab  - pull back and thrust straight out (hits the first thing in line)
//   saw   - hold to keep cutting whatever is in front (chainsaw)
//
// A melee weapon looks like a gun to the player's rig: it has a grip point
// and is drawn in gun space, and its swing is expressed as `climb` (the
// angle it's raised by) and `recoil` (how far it's pulled back / thrust out),
// which the rig already applies to whatever is in hand.

import { part, GUN_PAL, RES, artW, artH } from './gunart.js';
import { Sketch } from './gunbuild.js';
import { makeCanvas } from '../engine/pixel.js';

// style, damage, time (s per attack), reach (px from the body), arc (radians),
// knock (knockback), lunge (stab thrust px), hands (1/2)
export const MELEE = {
  knife: {
    name: 'KNIFE', style: 'stab', damage: 45, time: 0.3, reach: 20, arc: 0.9, knock: 40, lunge: 7, hands: 1,
  },
  tacknife: {
    name: 'TACTICAL KNIFE', style: 'stab', damage: 55, time: 0.3, reach: 22, arc: 0.9, knock: 50, lunge: 8, hands: 1,
  },
  bat: {
    name: 'BAT', style: 'swing', damage: 60, time: 0.55, reach: 26, arc: 2.2, knock: 170, hands: 2,
  },
  crowbar: {
    name: 'CROWBAR', style: 'swing', damage: 55, time: 0.48, reach: 24, arc: 1.9, knock: 110, hands: 1,
  },
  // a long-hafted battle axe: capped haft with a wrapped grip, a steel head with
  // a spike on top and a wide crescent blade hanging below
  axe: {
    name: 'AXE', style: 'swing', damage: 85, time: 0.62, reach: 28, arc: 1.8, knock: 120, hands: 2,
  },
  hammer: {
    name: 'HAMMER', style: 'swing', damage: 115, time: 0.85, reach: 26, arc: 2.0, knock: 240, hands: 2,
  },
  // brass pommel, a grip wrapped in worn steel-blue diamonds, brass guard and
  // collar, then a long blade - dark spine, bright edge, tip turned up
  katana: {
    name: 'KATANA', style: 'swing', damage: 75, time: 0.4, reach: 34, arc: 2.4, knock: 70, hands: 2,
  },
  machete: {
    name: 'MACHETE', style: 'swing', damage: 65, time: 0.42, reach: 24, arc: 2.0, knock: 80, hands: 1,
  },
  spear: {
    name: 'SPEAR', style: 'stab', damage: 70, time: 0.5, reach: 38, arc: 0.5, knock: 90, lunge: 12, hands: 2,
  },
  shovel: {
    name: 'SHOVEL', style: 'swing', damage: 65, time: 0.6, reach: 27, arc: 2.0, knock: 150, hands: 2,
  },
  chainsaw: {
    name: 'CHAINSAW', style: 'saw', damage: 14, time: 0.08, reach: 27, arc: 1.0, knock: 25, hands: 2, speedMul: 0.9, battery: true,
  },
  fireaxe: {
    name: 'FIRE AXE', style: 'swing', damage: 100, time: 0.72, reach: 29, arc: 2.0, knock: 180, hands: 2,
  },
};

// How each weapon is held at rest - its stance (radians raised above level,
// facing the way you face). It doesn't follow the mouse until you attack.
const STANCE = {
  fists: 0, knife: -0.55, tacknife: -0.55, machete: -0.45, crowbar: 0.25, bat: 0.5, axe: 0.5, hammer: 0.4,
  katana: 0.55, spear: 0.35, shovel: 0.4, fireaxe: 0.5, chainsaw: 0.1,
};

// Bare hands, when the melee slot is empty: a quick jab (not an item, not for sale).
export const FISTS = {
  name: 'FISTS', style: 'stab', damage: 16, time: 0.4, reach: 20, arc: 0.9, knock: 60, lunge: 7, hands: 1, fists: true,
};

// The gun palette, plus a couple of colours only melee weapons use.
const MELEE_PAL = { ...GUN_PAL, N: '#3a5064' };   // N: the katana's steel-blue grip wrap

// ---------- the art ----------
// Drawn on the fine gun grid (RES gun pixels to a world pixel), each weapon
// pointing right, with the same lighting pass as the guns (a lit top edge and
// a shadowed bottom edge on every part). HOLD: where the hands go, in gun pixels.

const hash = (x, y) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// A blade from x0, L long, between rows y0 (spine) and y1 (edge); the last
// `tip` columns sweep the spine down to the point. clip: the edge rises to the
// point instead (a clip point / katana tip). Spine dark, flat bright, edge brightest.
function blade(s, x0, L, y0, y1, tip, { spine = 'c', flat = 'l', edge = 'S', clip = false, fuller = false } = {}) {
  for (let i = 0; i < L; i++) {
    const x = x0 + i, k = Math.max(0, i - (L - tip)) / tip;
    let top = y0, bot = y1;
    if (clip) bot = Math.round(y1 - (y1 - y0) * k * k);
    else top = Math.round(y0 + (y1 - y0) * k * k);
    if (top > bot) continue;
    for (let y = top; y <= bot; y++) s.set(x, y, y === top ? spine : y === bot ? edge : flat);
    if (fuller && bot - top > 3 && i > 2 && i < L - tip) s.set(x, top + 1, 'c');
  }
}
// A round haft from x0 to x1 on centre row cy, `r` px either side, wood (or anything).
function haft(s, x0, x1, cy, r, [lo, mid, hi, top] = ['v', 'w', 'W', 'x'], grain = true) {
  for (let x = x0; x <= x1; x++) for (let y = cy - r; y <= cy + r; y++) {
    let c = y === cy - r ? top : y === cy + r ? lo : y < cy ? hi : mid;
    if (grain && c === mid && hash(x >> 2, y) < 0.25) c = lo;
    s.set(x, y, c);
  }
}
// grip wrap: crossing bands
function wrap(s, x0, x1, cy, r, a = 'g', b = 'f') {
  for (let x = x0; x <= x1; x++) for (let y = cy - r; y <= cy + r; y++) s.set(x, y, (x + y) % 3 === 0 ? b : a);
}

const ART = {
  knife(s) {
    s.rect(0, 1, 10, 4, 'g').rect(0, 1, 10, 1, 'e').rect(0, 1, 1, 4, 'f');
    for (let i = 2; i < 9; i += 2) s.set(i, 3, 'f');        // grip ridges
    s.rect(10, 0, 2, 6, 'd').rect(10, 0, 2, 1, 'c');         // guard
    blade(s, 12, 13, 1, 4, 5);
  },
  tacknife(s) {
    s.rect(0, 1, 11, 4, 'o').rect(0, 1, 11, 1, 'O').rect(0, 1, 1, 4, 'q');
    for (let i = 2; i < 10; i += 3) s.rect(i, 2, 1, 2, 'q');
    s.rect(11, 0, 2, 7, 'e').rect(11, 0, 2, 1, 'd');
    blade(s, 13, 15, 1, 5, 6, { spine: 'e', flat: 'd', edge: 'S', clip: true });
    for (let x = 14; x < 21; x += 2) s.set(x, 0, 'e');        // saw-back
  },
  bat(s) {
    // a tapered bat: knob, taped handle, the barrel thickening to a rounded end
    const cy = 5;
    for (let x = 0; x < 40; x++) {
      let r = x < 2 ? 2.6 : 1.3 + Math.max(0, x - 10) / 29 * 3.4;
      if (x >= 38) r -= (x - 37) * 1.1;
      const ri = Math.round(r);
      for (let y = cy - ri; y <= cy + ri; y++) {
        let c = y === cy - ri ? 'x' : y === cy + ri ? 'v' : y < cy ? 'W' : 'w';
        if (c === 'w' && hash(x >> 2, y) < 0.2) c = 'v';
        s.set(x, y, c);
      }
    }
    wrap(s, 2, 11, cy, 1);
  },
  crowbar(s) {
    // a red steel bar: flat chisel at the back, the curved claw at the front
    s.rect(0, 4, 3, 2, 'c');
    s.rect(2, 3, 30, 3, 'R').rect(2, 3, 30, 1, 'r').rect(2, 5, 30, 1, 'v');
    for (const [x, y] of [[32, 3], [33, 2], [34, 1], [35, 0], [36, 0], [37, 1], [37, 2], [36, 3]]) s.rect(x, y, 2, 3, 'R');
    s.set(35, 0, 'r').set(36, 0, 'r').rect(37, 4, 2, 1, 'v').set(38, 5, 'c');   // the split claw
  },
  axe(s) {
    haft(s, 4, 38, 11, 1);
    wrap(s, 0, 13, 11, 2, 'g', 'f');
    s.rect(0, 9, 2, 5, 'h');
    // the head: spike on top, crescent blade hanging below
    s.rect(34, 6, 7, 10, 'e').rect(34, 6, 7, 1, 'd');
    s.rect(36, 0, 3, 7, 'd').set(37, 0, 'l');                 // spike
    for (let y = 9; y <= 21; y++) {                           // the bearded blade
      const w = Math.round(3 + Math.sin(((y - 9) / 12) * Math.PI) * 6);
      s.rect(40, y, w, 1, 'd').set(40 + w - 1, y, 'S').set(40 + w - 2, y, 'l');
    }
    s.rect(37, 9, 3, 2, 'c');                                 // a rivet
  },
  hammer(s) {
    haft(s, 0, 26, 6, 1);
    wrap(s, 0, 10, 6, 1, 'f', 'h');
    s.rect(24, 0, 9, 13, 'e').rect(24, 0, 9, 1, 'c').rect(24, 1, 9, 1, 'd').rect(24, 12, 9, 1, 'f');
    s.rect(25, 2, 1, 9, 'd').rect(31, 2, 1, 9, 'f');          // bevelled faces
    s.rect(23, 4, 1, 5, 'f').rect(33, 4, 1, 5, 'g');
  },
  katana(s) {
    // brass pommel, the wrapped grip (diamonds), oval guard, collar, a long curved blade
    s.rect(0, 2, 2, 6, 'y').rect(0, 2, 2, 1, 'Y');
    for (let x = 2; x < 20; x++) for (let y = 2; y <= 7; y++) s.set(x, y, (x + y) % 4 < 2 ? 'N' : (x - y + 8) % 4 < 2 ? 'h' : 'g');
    s.rect(20, 0, 2, 10, 'n').rect(20, 0, 2, 1, 'Y').rect(20, 9, 2, 1, 'n');   // tsuba
    s.rect(22, 2, 3, 6, 'y').rect(22, 2, 3, 1, 'Y');                           // habaki
    // the blade: a gentle upward curve along its length, tip swept up
    for (let i = 0; i < 46; i++) {
      const x = 25 + i, lift = Math.round((i / 46) ** 2 * 3), k = Math.max(0, i - 40) / 6;
      const top = 3 - lift, bot = Math.round(7 - lift - k * k * 4);
      for (let y = top; y <= bot; y++) s.set(x, y, y === top ? 'c' : y === bot ? 'Z' : y === bot - 1 && i % 5 < 3 ? 'S' : 'l');   // spine, flat, wavy hamon, edge
    }
  },
  machete(s) {
    s.rect(0, 2, 10, 4, 'w').rect(0, 2, 10, 1, 'W').rect(0, 5, 10, 1, 'v');
    s.set(3, 3, 'y').set(7, 3, 'y');                          // rivets
    s.rect(10, 1, 2, 6, 'f');
    // a wide blade, widening toward the clipped tip
    for (let i = 0; i < 22; i++) {
      const x = 12 + i, bot = 5 + Math.round(Math.min(i, 16) / 16 * 3) - (i > 18 ? i - 18 : 0), top = i > 17 ? 1 + (i - 17) : 1;
      for (let y = top; y <= bot; y++) s.set(x, y, y === top ? 'c' : y === bot ? 'S' : 'l');
    }
  },
  spear(s) {
    haft(s, 0, 47, 3, 1);
    s.rect(0, 1, 3, 5, 'e').rect(0, 1, 3, 1, 'd');            // butt cap
    s.rect(44, 1, 5, 5, 'e').rect(44, 1, 5, 1, 'd');          // socket
    for (let i = 0; i < 12; i++) {                           // a leaf-shaped head
      const x = 49 + i, w = Math.round(Math.sin(((i + 2) / 13) * Math.PI) * 3.2);
      for (let y = 3 - w; y <= 3 + w; y++) s.set(x, y, y === 3 ? 'S' : y < 3 ? 'l' : 'c');
    }
  },
  shovel(s) {
    // a D-handle, the wooden shaft, the steel spade
    s.rect(0, 0, 2, 9, 'f').rect(0, 0, 5, 2, 'f').rect(0, 7, 5, 2, 'f');
    haft(s, 4, 36, 4, 1);
    s.rect(34, 2, 4, 5, 'e');                                // socket
    for (let i = 0; i < 12; i++) {
      const x = 38 + i, half = 5 - (i > 8 ? i - 8 : 0);
      for (let y = 4 - half; y <= 4 + half; y++) s.set(x, y, y === 4 - half ? 'l' : y === 4 + half ? 'e' : i === 0 ? 'c' : 'd');
    }
    s.rect(40, 3, 8, 1, 'c');                                // the pressed rib down the middle
  },
  fireaxe(s) {
    haft(s, 0, 34, 6, 1);
    s.rect(0, 4, 3, 5, 'R');
    // a red head: the pick behind, the wide blade in front
    s.rect(30, 0, 7, 12, 'R').rect(30, 0, 7, 1, 'r');
    for (let i = 0; i < 6; i++) s.rect(24 + i, 3 + Math.floor(i / 2), 1, 3 - Math.floor(i / 2), 'R');   // pick
    for (let y = 0; y < 16; y++) {
      const w = Math.round(2 + Math.sin((y / 15) * Math.PI) * 4);
      s.rect(37, y, w, 1, 'R').set(37 + w - 1, y, 'S').set(37 + w - 2, y, 'l');
    }
    s.rect(31, 5, 4, 2, 'c');
  },
};
const HOLD = {
  fists: [0, 0],
  knife: [3, 3], tacknife: [3, 3], bat: [5, 5, 15], crowbar: [6, 4], axe: [4, 11, 22], hammer: [4, 6, 15],
  katana: [15, 5, 6], machete: [3, 4], spear: [10, 3, 22], shovel: [9, 4, 20], chainsaw: [7, 15, 14], fireaxe: [4, 6, 16],
};

// The cordless chainsaw, drawn from code so the chain can run: a motor body with
// a loop handle on top and a pistol grip at the back, a battery pack slotted
// into its rear, and a bar whose teeth move round it (phase = how far along).
function chainsawArt(s, phase, pack = true) {
  s.rect(8, 0, 12, 2, 'h').rect(6, 2, 2, 2, 'h').rect(20, 2, 2, 2, 'h');          // loop handle
  s.rect(6, 4, 18, 10, 'a').rect(6, 4, 18, 1, 'A').rect(6, 5, 18, 1, 'A').rect(8, 12, 16, 2, 'R');   // motor housing
  for (let x = 10; x < 18; x += 2) s.rect(x, 8, 1, 3, 'f');                       // vents
  s.rect(22, 6, 2, 2, 'h').rect(22, 10, 2, 2, 'h');
  s.rect(2, 14, 10, 2, 'h').rect(2, 12, 2, 2, 'h').rect(10, 12, 2, 2, 'h');       // rear grip + trigger
  if (pack) packArt(s, 0, 4);
  s.rect(24, 8, 30, 6, 'd').rect(24, 8, 30, 1, 'c').rect(24, 10, 30, 2, 'e');     // guide bar
  s.rect(52, 9, 2, 4, 'c');
  // chain teeth: along the top they run out to the tip, along the bottom back in
  for (let x = 24; x < 54; x++) {
    if ((x - phase * 2 + 600) % 6 < 2) s.set(x, 7, 'S');
    if ((x + phase * 2) % 6 < 2) s.set(x, 14, 'S');
  }
  s.rect(54, 9 + (phase % 3) * 2, 1, 2, 'S');
}
function packArt(s, x, y) {
  s.rect(x, y, 6, 10, 'h').rect(x + 2, y + 2, 2, 6, 'y').set(x + 2, y + 2, 'Y');
}

for (const [key, d] of [...Object.entries(MELEE), ['fists', FISTS]]) {
  d.key = key;
  d.cls = 'melee';
  d.rest = STANCE[key] ?? 0;
  if (['bat', 'crowbar', 'axe', 'hammer', 'shovel', 'fireaxe', 'machete'].includes(key)) d.combo = 'chop';
  // knives already point down, so they stay at chest height; the rest drop to the waist
  if (['knife', 'tacknife', 'machete'].includes(key)) d.restHeight = 9;
  // the art on the gun grid; the points the hands and the rig read are in world pixels
  const draw = (fn) => {
    const sk = new Sketch();
    fn(sk);
    return sk.part();
  };
  const src = key === 'fists' ? { x: 0, y: 0, rows: ['.'] } : key === 'chainsaw' ? draw((sk) => chainsawArt(sk, 0)) : draw(ART[key]);
  const p = part(src.rows, MELEE_PAL, RES);
  const [gx, gy, sx] = HOLD[key].map((v) => v);
  // (the trimmed art may not start at 0, 0: points are relative to its top-left)
  const pt = (x, y) => ({ x: (x - src.x) / RES, y: (y - src.y) / RES });
  d.art = {
    img: p.img,
    points: {
      grip: pt(gx, gy),
      support: sx !== undefined ? pt(sx, gy) : null,
      light: pt(gx + 6, gy + 2),
      muzzle: { x: p.w / RES, y: (gy - src.y) / RES },   // the tip
      port: pt(gx, gy),
    },
  };
  // the chainsaw: three frames of the chain running (without its pack, which
  // is drawn on its own so it can slide out), the top handle for the other hand
  if (key === 'chainsaw') {
    d.art.points.support = pt(14, 1);
    d.art.points.muzzle = pt(55, 11);
    d.art.frames = [0, 1, 2].map((ph) => {
      const f = draw((sk) => chainsawArt(sk, ph, false));
      return { img: part(f.rows, MELEE_PAL, RES).img, x: f.x - src.x, y: f.y - src.y };
    });
    d.art.pack = part(draw((sk) => packArt(sk, 0, 0)).rows, MELEE_PAL, RES).img;
    d.art.packAt = pt(0, 4);
  }
  // icon: the weapon on a transparent canvas (trimmed by part() already)
  d.img = p.img;
}

const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const BATT_TIME = 1.5;    // swapping a battery pack
const DRAIN = 12;         // battery % per second of cutting
const DRAW_TIME = 0.25;
// attack phases (fraction of the attack time)
export const WIND = 0.28, STRIKE = 0.5;
const COMBO_GAP = 0.45;   // attack again within this long after a hit and the combo carries on
// the three hits of a combo, by weapon style
const COMBOS = {
  swing: ['slash', 'slash', 'thrust'],   // a sword: two cuts, then a thrust
  chop: ['slash', 'slash', 'slash'],     // axes, clubs, a shovel, a machete: they can't stab
  stab: ['thrust', 'thrust', 'slash'],
  fists: ['jab', 'jab', 'jab'],
};

export class MeleeWeapon {
  constructor(def) {
    this.def = def;
    this.art = def.art;
    this.attach = {};
    this.t = -1;            // 0..1 through the current attack, -1 idle
    this.side = 1;          // which way a slash sweeps (alternates)
    this.move = null;       // 'slash' | 'thrust' | 'jab' (this hit of the combo)
    this.step = 0;          // 0..2 in the combo
    this.hand = 'R';        // bare hands: which fist is punching
    this.sinceHit = 99;     // seconds since the last attack finished
    this.rest = def.rest ?? 0;
    this.climb = this.rest;
    this.engage = 0;        // 0 = in its stance, 1 = turned toward the cursor to attack
    this.holdT = 0;         // how long it stays turned after an attack
    this.chain = 0;         // chainsaw: how far the chain has run (picks the frame)
    this.charge = def.battery ? 100 : 0;   // battery %, for battery weapons
    this.reload = -1;       // 0..1 through a battery swap, -1 when not swapping
    this.recoil = 0;
    this.drawT = DRAW_TIME;
    this.cooldown = 0;
    this.sawing = 0;        // >0 while the chainsaw is cutting
    this.events = [];
    this.hits = new Set();  // zombies already hit by this swing
  }

  get icon() { return this.def.img; }
  get reloading() { return this.reload >= 0; }
  get raising() { return Math.max(0, this.drawT / DRAW_TIME); }
  get muzzle() { return this.art.points.muzzle; }
  get striking() {
    if (this.def.style === 'saw') return this.sawing > 0;
    return this.t >= WIND && this.t < STRIKE;
  }

  // This hit's reach, arc and damage: a thrust reaches further down a narrow
  // line and hits one thing; a slash sweeps wide; the last hit of a combo hits harder.
  get reach() { return this.move === 'thrust' ? this.def.reach * 1.2 : this.def.reach; }
  get arc() { return this.move === 'slash' ? Math.max(this.def.arc, 1.8) : Math.min(this.def.arc, 0.7); }
  get damage() { return this.def.damage * (this.step === 2 ? 1.25 : 1); }
  // An upward swing is made with the weapon turned over, so its edge leads the
  // way up; it turns back as it settles into the stance again.
  get flipped() { return this.move === 'slash' && this.side < 0 && this.t >= 0 && this.t < 0.85; }
  get single() { return this.move !== 'slash' && this.def.style !== 'saw'; }

  // Start an attack (or keep sawing). Returns true if something started.
  attack(held) {
    if (this.drawT > 0) return false;
    if (this.def.style === 'saw') {
      if (this.reload >= 0 || (this.def.battery && this.charge <= 0)) return false;   // swapping / flat battery
      this.sawing = 0.12;
      return true;
    }
    if (this.t >= 0 || this.cooldown > 0) return false;
    this.step = this.sinceHit < COMBO_GAP ? (this.step + 1) % 3 : 0;
    this.move = (COMBOS[this.def.fists ? 'fists' : this.def.combo ?? this.def.style] ?? COMBOS.swing)[this.step];
    if (this.move === 'slash') this.side = -this.side;
    if (this.move === 'jab') this.hand = this.step === 1 ? 'L' : 'R';
    this.t = 0;
    this.hits.clear();
    return true;
  }

  update(dt) {
    this.events.length = 0;
    this.drawT -= dt;
    this.cooldown -= dt;
    const d = this.def, rest = this.rest;
    // turned toward the cursor while attacking; back into the stance a moment after
    if (this.t >= 0 || this.sawing > 0) {
      this.engage = Math.min(1, this.engage + dt * 12);
      this.holdT = 0.35;
    } else if ((this.holdT -= dt) <= 0) {
      this.engage = Math.max(0, this.engage - dt * 3);
    }
    if (d.battery) this.updateBattery(dt);
    if (d.style === 'saw') {
      this.sawing -= dt;
      const on = this.sawing > 0;
      // revving: the bar shakes and pushes forward while cutting (and after a fresh battery goes in)
      const rev = on || (this.reload > 0.82 && this.reload < 0.95);
      this.climb = rest + (rev ? (Math.random() - 0.5) * 0.12 : 0);
      this.recoil = on ? -2 + Math.random() : 0;
      if (on && this.cooldown <= 0) {
        this.cooldown = d.time;
        this.hits.clear();
        this.events.push('tick');
      }
      return;
    }
    if (this.t < 0) {
      this.sinceHit += dt;
      this.climb += (rest - this.climb) * Math.min(1, dt * 12);
      this.recoil *= Math.exp(-14 * dt);
      return;
    }
    const before = this.t;
    this.t += dt / (this.move === 'slash' ? d.time : d.time * 0.85);
    if (before < WIND && this.t >= WIND) this.events.push('strike');
    const t = this.t;
    if (this.move === 'slash') {
      // raise to one side, sweep right across to the other, settle back into the guard
      const hi = 1.5 * this.side, lo = -1.4 * this.side;
      if (t < WIND) this.climb = lerp(rest, hi, ease(t / WIND));
      else if (t < STRIKE) this.climb = lerp(hi, lo, ease((t - WIND) / (STRIKE - WIND)));
      else this.climb = lerp(lo, rest, ease((t - STRIKE) / (1 - STRIKE)));
      this.recoil = t >= WIND && t < STRIKE ? -2 : 0;
    } else {
      // thrust / jab: draw back, drive straight out, ease back
      const lunge = this.move === 'jab' ? 7 : d.lunge ?? 10;
      this.climb = d.fists ? 0 : lerp(this.climb, 0.05, Math.min(1, dt * 20));
      if (t < WIND) this.recoil = lerp(0, 3, ease(t / WIND));
      else if (t < STRIKE) this.recoil = lerp(3, -lunge, ease((t - WIND) / (STRIKE - WIND)));
      else this.recoil = lerp(-lunge, 0, ease((t - STRIKE) / (1 - STRIKE)));
    }
    if (this.t >= 1) {
      this.t = -1;
      // bare fists catch a breath between punches, and a longer one after the hook
      this.cooldown = d.fists ? (this.step === 2 ? d.hookRest ?? 0.4 : d.jabRest ?? 0.1) : 0.04;   // (a def can set its own breathers)
      this.sinceHit = 0;
    }
  }

  // Battery weapons: cutting drains the pack and runs the chain (still otherwise). A swap: the old pack slides out of
  // the back and drops (battOut), a new one is pushed in (battIn) and it revs.
  updateBattery(dt) {
    if (this.sawing > 0) this.charge = Math.max(0, this.charge - DRAIN * dt);
    if (this.sawing > 0) this.chain += dt * 45;   // the chain only runs while cutting
    if (this.reload < 0) return;
    const before = this.reload;
    this.reload += dt / BATT_TIME;
    if (before < 0.18 && this.reload >= 0.18) this.events.push('battOut');
    if (before < 0.78 && this.reload >= 0.78) this.events.push('battIn');
    if (this.reload >= 1) this.reload = -1;
    if (this.reload > 0.82 && this.reload < 0.95) this.chain += dt * 45;   // rev it up
  }

  // Start a battery swap (the player checks there's a spare pack first).
  startReload() {
    if (!this.def.battery || this.reload >= 0 || this.charge >= 100) return false;
    this.reload = 0;
    this.sawing = 0;
    return true;
  }

  cancelReload() {
    if (this.reload >= 0 && this.reload < 0.78) this.reload = -1;
  }

  // How far the pack has slid out of the back (px), or null while it's out.
  get packOffset() {
    const t = this.reload;
    if (t < 0) return 0;
    if (t < 0.18) return -6 * (t / 0.18);
    if (t < 0.65) return null;
    if (t < 0.78) return -6 * (1 - (t - 0.65) / 0.13);
    return 0;
  }

  // Grip at the origin, pointing along +x (world pixels; the art is on the finer gun grid).
  draw(ctx) {
    const { grip } = this.art.points, gx = Math.round(grip.x * RES), gy = Math.round(grip.y * RES);
    ctx.save();
    ctx.scale(1 / RES, 1 / RES);
    if (this.art.frames) {
      const f = this.art.frames[Math.floor(this.chain) % 3];
      ctx.drawImage(f.img, f.x - gx - 1, f.y - gy - 1);
      const off = this.packOffset;
      if (off !== null) ctx.drawImage(this.art.pack, Math.round((this.art.packAt.x + off) * RES) - gx - 1, Math.round(this.art.packAt.y * RES) - gy - 1);
    } else ctx.drawImage(this.art.img, -gx - 1, -gy - 1);
    ctx.restore();
  }

  drawFlash() {}
}

// A picture of a melee weapon for menus (same as the art).
export function meleeIcon(key) {
  return MELEE[key].img;
}

// Small helper for menus that want a fixed-size thumbnail.
export function thumb(img, w, h) {
  const [c, g] = makeCanvas(w, h);
  const s = Math.min(1, w / artW(img), h / artH(img));
  g.imageSmoothingEnabled = false;
  g.drawImage(img, Math.round((w - artW(img) * s) / 2), Math.round((h - artH(img) * s) / 2), Math.round(artW(img) * s), Math.round(artH(img) * s));
  return c;
}
