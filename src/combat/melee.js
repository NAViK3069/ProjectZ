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

import { part, GUN_PAL } from './gunart.js';
import { makeCanvas } from '../engine/pixel.js';

// style, damage, time (s per attack), reach (px from the body), arc (radians),
// knock (knockback), lunge (stab thrust px), hands (1/2)
export const MELEE = {
  knife: {
    name: 'KNIFE', style: 'stab', damage: 45, time: 0.3, reach: 20, arc: 0.9, knock: 40, lunge: 7, hands: 1,
    rows: ['.....clll..', 'ffffhlllllS', '.....cccc..'],
  },
  tacknife: {
    name: 'TACTICAL KNIFE', style: 'stab', damage: 55, time: 0.3, reach: 22, arc: 0.9, knock: 50, lunge: 8, hands: 1,
    rows: ['......clllll.', 'fgfgfhllllllS', '......c.c.cc.'],
  },
  bat: {
    name: 'BAT', style: 'swing', damage: 60, time: 0.55, reach: 26, arc: 2.2, knock: 170, hands: 2,
    rows: ['..............WWWW..', '..........WWWWwwwwW.', 'vwwwwwwwwwwwwwwwwwwW', '..........vvvvwwwwv.', '..............vvvv..'],
  },
  crowbar: {
    name: 'CROWBAR', style: 'swing', damage: 55, time: 0.48, reach: 24, arc: 1.9, knock: 110, hands: 1,
    rows: ['...............RRR', 'dRRRRRRRRRRRRRR..R', '.................R', '................R.'],
  },
  // a long-hafted battle axe: capped haft with a wrapped grip, a steel head with
  // a spike on top and a wide crescent blade hanging below
  axe: {
    name: 'AXE', style: 'swing', damage: 85, time: 0.62, reach: 28, arc: 1.8, knock: 120, hands: 2,
    rows: [
      '..................l',
      '.................dl',
      '.................dld',
      '.................edd',
      '.................edd',
      'hfgfgfgWWWWWWWWWWeddd',
      'hgfgfgfwwvwwwwvwwedde',
      '.................edddd',
      '.................edddddl',
      '................Seeeeeel',
      '................SSSSSSSSl',
    ],
  },
  hammer: {
    name: 'HAMMER', style: 'swing', damage: 115, time: 0.85, reach: 26, arc: 2.0, knock: 240, hands: 2,
    rows: ['............dddd', '............dccd', 'wwwwwwwwwwwwdccd', 'vvvvvvvvvvvvdccd', '............dccd', '............dddd'],
  },
  // brass pommel, a grip wrapped in worn steel-blue diamonds, brass guard and
  // collar, then a long blade - dark spine, bright edge, tip turned up
  katana: {
    name: 'KATANA', style: 'swing', damage: 75, time: 0.4, reach: 34, arc: 2.4, knock: 70, hands: 2,
    rows: [
      '..........t......................cS',
      'yNhNhNhNhNyyccccccccccccccccccccclS',
      'yhNhNhNhNhyylllllllllllllllllllllS',
      'yNhNhNhNhNyySSSSSSSSSSSSSSSSSSS',
      '..........t',
    ],
  },
  machete: {
    name: 'MACHETE', style: 'swing', damage: 65, time: 0.42, reach: 24, arc: 2.0, knock: 80, hands: 1,
    rows: ['.....cccccccccl.', 'ffffhllllllllllS', '.....llllllllll.', '......ccccccc...'],
  },
  spear: {
    name: 'SPEAR', style: 'stab', damage: 70, time: 0.5, reach: 38, arc: 0.5, knock: 90, lunge: 12, hands: 2,
    rows: ['.........................cl..', 'wwwwwwwwwwwwwwwwwwwwwwwwdlllS', '.........................cl..'],
  },
  shovel: {
    name: 'SHOVEL', style: 'swing', damage: 65, time: 0.6, reach: 27, arc: 2.0, knock: 150, hands: 2,
    rows: ['ff................dddd.', 'f.fwwwwwwwwwwwwwwdcccdd', 'ff.vvvvvvvvvvvvvvdcccdd', '..................dddd.'],
  },
  chainsaw: {
    name: 'CHAINSAW', style: 'saw', damage: 14, time: 0.08, reach: 27, arc: 1.0, knock: 25, hands: 2, speedMul: 0.9, battery: true,
    rows: ['..ff.................', '.f..f................', 'aaaaaaeeeeeeeeeeeeee.', 'AAAAAAdlllllllllllllS', 'aaaaaaeeeeeeeeeeeeee.', '.aaaa................'],
  },
  fireaxe: {
    name: 'FIRE AXE', style: 'swing', damage: 100, time: 0.72, reach: 29, arc: 2.0, knock: 180, hands: 2,
    rows: ['.................RRR.', '.................RRRR', 'wwwwwwwwwwwwwwwddRRRl', 'vvvvvvvvvvvvvvvdd.Rll', '.................d.l.'],
  },
};

// The cordless chainsaw, drawn from code so the chain can run: a motor body with
// a loop handle on top and a pistol grip at the back, a battery pack slotted
// into its rear, and a bar whose teeth move round it (phase = how far along).
function chainsawRows(phase, pack = true) {
  const W = 29, H = 9, g = Array.from({ length: H }, () => Array(W).fill('.'));
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = c; };
  const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c); };
  rect(4, 0, 6, 1, 'h'); set(3, 1, 'h'); set(10, 1, 'h');             // loop handle
  rect(3, 2, 9, 5, 'a'); rect(3, 2, 9, 1, 'A'); rect(4, 6, 8, 1, 'R');  // motor housing
  rect(5, 4, 4, 1, 'f');                                               // vents
  set(11, 3, 'h'); set(11, 5, 'h');
  rect(1, 7, 5, 1, 'h'); set(1, 6, 'h'); set(5, 6, 'h');               // rear grip + trigger
  if (pack) { rect(0, 2, 3, 5, 'h'); rect(1, 3, 1, 3, 'y'); }          // battery pack
  rect(12, 4, 15, 3, 'd'); rect(12, 5, 15, 1, 'e');                     // guide bar
  // chain teeth: along the top they run out to the tip, along the bottom back in
  for (let x = 12; x < 27; x++) {
    if ((x - phase + 300) % 3 === 0) set(x, 3, 'S');
    if ((x + phase) % 3 === 0) set(x, 7, 'S');
  }
  set(27, 4 + (phase % 3), 'S');
  return g.map((r) => r.join(''));
}
MELEE.chainsaw.rows = chainsawRows(0);
const PACK_ROWS = ['hhh', 'hyh', 'hyh', 'hyh', 'hhh'];

// How each weapon is held at rest - its stance (radians raised above level,
// facing the way you face). It doesn't follow the mouse until you attack.
const STANCE = {
  fists: 0, knife: -0.55, tacknife: -0.55, machete: -0.45, crowbar: 0.25, bat: 0.5, axe: 0.5, hammer: 0.4,
  katana: 0.55, spear: 0.35, shovel: 0.4, fireaxe: 0.5, chainsaw: 0.1,
};

// Bare hands, when the melee slot is empty: a quick jab (not an item, not for sale).
export const FISTS = {
  name: 'FISTS', style: 'stab', damage: 16, time: 0.4, reach: 20, arc: 0.9, knock: 60, lunge: 7, hands: 1, fists: true,
  rows: ['.'],
};

// The gun palette, plus a couple of colours only melee weapons use.
const MELEE_PAL = { ...GUN_PAL, N: '#3a5064' };   // N: the katana's steel-blue grip wrap

// where the hands hold it (in the rows' pixels)
const HOLD = {
  fists: [0, 0],
  knife: [1, 1], tacknife: [1, 1], bat: [2, 2, 7], crowbar: [3, 1], axe: [2, 5, 11], hammer: [2, 2, 7],
  katana: [8, 2, 3], machete: [1, 1], spear: [5, 1, 11], shovel: [5, 1, 10], chainsaw: [3, 7, 7], fireaxe: [2, 2, 8],
};

for (const [key, d] of [...Object.entries(MELEE), ['fists', FISTS]]) {
  d.key = key;
  d.cls = 'melee';
  d.rest = STANCE[key] ?? 0;
  if (['bat', 'crowbar', 'axe', 'hammer', 'shovel', 'fireaxe', 'machete'].includes(key)) d.combo = 'chop';
  // knives already point down, so they stay at chest height; the rest drop to the waist
  if (['knife', 'tacknife', 'machete'].includes(key)) d.restHeight = 9;
  const p = part(d.rows, MELEE_PAL);
  const [gx, gy, sx] = HOLD[key];
  d.art = {
    img: p.img,
    points: {
      grip: { x: gx, y: gy },
      support: sx !== undefined ? { x: sx, y: key === 'chainsaw' ? 0 : gy } : null,
      light: { x: gx + 3, y: gy + 1 },
      muzzle: { x: p.w, y: gy },   // the tip
      port: { x: gx, y: gy },
    },
  };
  // the chainsaw: three frames of the chain running (without its pack, which
  // is drawn on its own so it can slide out), the top handle for the other hand
  if (key === 'chainsaw') {
    d.art.points.support = { x: 7, y: 0 };
    d.art.points.muzzle = { x: 28, y: 5 };
    d.art.frames = [0, 1, 2].map((ph) => part(chainsawRows(ph, false), GUN_PAL).img);
    d.art.pack = part(PACK_ROWS, GUN_PAL).img;
    d.art.packAt = { x: 0, y: 2 };
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
      this.cooldown = d.fists ? (this.step === 2 ? 0.4 : 0.1) : 0.04;
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

  // Grip at the origin, pointing along +x.
  draw(ctx) {
    const { grip } = this.art.points;
    if (this.art.frames) {
      ctx.drawImage(this.art.frames[Math.floor(this.chain) % 3], -grip.x - 1, -grip.y - 1);
      const off = this.packOffset;
      if (off !== null) ctx.drawImage(this.art.pack, this.art.packAt.x - grip.x + off - 1, this.art.packAt.y - grip.y - 1);
      return;
    }
    ctx.drawImage(this.art.img, -grip.x - 1, -grip.y - 1);
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
  const s = Math.min(1, w / img.width, h / img.height);
  g.imageSmoothingEnabled = false;
  g.drawImage(img, Math.round((w - img.width * s) / 2), Math.round((h - img.height * s) / 2), Math.round(img.width * s), Math.round(img.height * s));
  return c;
}
