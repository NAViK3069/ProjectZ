// Modular gun art. Every gun is assembled from separate parts (stock,
// receiver, handguard, barrel, grip, trigger, magazine, bolt carrier,
// charging handle, sights...) so they can move on their own - the bolt
// carrier slides back in the ejection port on every shot, the trigger
// moves, the mag drops out, and so on. Attachments (sights, muzzle devices,
// grips, mags, stocks) snap onto slots and replace or add parts.
//
// Parts are written as rows of palette letters ('.' = empty); each part gets
// its own 1px black outline, which also draws the seams between parts.
// Coordinates are gun pixels; guns point right.

import { makeCanvas } from '../engine/pixel.js';
import { CATALOG } from './catalog.js';
import { longGun, handgun } from './gunbuild.js';
import { CUSTOM_GUNS } from './customguns.js';

const K = '#000000';
// gunmetal greys (darkest to lightest), plus furniture and details
export const GUN_PAL = {
  h: '#111316', f: '#1c2221', g: '#2b2e2f', e: '#343a3a', d: '#4c5455', c: '#657575', l: '#8d9c9c',
  o: '#3f4a24', O: '#5a6a33', P: '#73843f',            // olive polymer
  v: '#4a2f19', w: '#6e4426', W: '#93613a',            // wood
  u: '#5e4e33', t: '#857150', T: '#a8936a',            // tan polymer
  S: '#c3cdcd', R: '#9e2128',                          // polished steel, dark red paint
  a: '#c4561f', A: '#ec8a34',                          // orange (chainsaw body)
  r: '#d7313d', y: '#e8b84a', L: '#fff3c4', b: '#7fb7d9', s: '#c23a2e',
};

// A part sprite with an automatic outline. Returns { img, w, h } where img is
// 2px bigger than the rows (1px outline all round).
export function part(rows, pal = GUN_PAL) {
  const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
  const W = w + 2, H = h + 2;
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? rows[y][x] ?? '.' : '.');
  const [c, g] = makeCanvas(W, H);
  for (let y = -1; y <= h; y++) {
    for (let x = -1; x <= w; x++) {
      const ch = at(x, y);
      let color = ch !== '.' ? pal[ch] : null;
      if (!color && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy) !== '.')) color = K;
      if (color) {
        g.fillStyle = color;
        g.fillRect(x + 1, y + 1, 1, 1);
      }
    }
  }
  return { img: c, w, h };
}

// Skin for the hands that hold the guns (matches the player's face).
const SKIN = { i: '#efc6ba', I: '#f9e2db', j: '#d9ada0' };
// Trigger hand: a fist round the grip with the index finger along the trigger guard.
export const HAND_TRIGGER = part([
  'iiII.',
  'iiiiI',
  'jiij.',
  '.jj..',
], SKIN);
// Support hand: a half fist wrapped under the handguard / round a mag.
export const HAND_SUPPORT = part([
  'IiiI',
  'jiij',
  '.jj.',
], SKIN);
// Open hand: a relaxed, rounded hand - fetching a mag or a shell, coming
// back from the charging handle, the free hand with a one-handed weapon.
export const HAND_OPEN = part([
  '.iII.',
  'iiiIi',
  'jiiij',
  '.jjj.',
], SKIN);
// Grab: an upright fist, closed round the charging handle / slide / bolt
// knob while it's pulled back (stands across the gun, like a short cylinder).
export const HAND_GRAB = part([
  'IiI',
  'iij',
  'iij',
  'iij',
  'jjj',
], SKIN);

// Each hand and the pixel of it that sits on the point it holds.
export const HANDS = {
  trigger: { ...HAND_TRIGGER, at: { x: 2, y: 1 } },
  support: { ...HAND_SUPPORT, at: { x: 2.5, y: 1.5 } },
  open: { ...HAND_OPEN, at: { x: 2.5, y: 2 } },
  grab: { ...HAND_GRAB, at: { x: 1.5, y: 2.5 } },
};

// --- guns --------------------------------------------------------------------
// parts: name -> { x, y, rows } (x, y = top-left of the rows in gun pixels)
// order: back to front
// points: where things attach (gun pixels):
//   grip (trigger hand + rotation pivot), support (second hand), magwell,
//   muzzle, light, port (ejection port centre), trigger
// slots: where attachments go: { sight, muzzle, under, mag, stock } -> { x, y }
// moving parts: bolt (in the port), handle (charging handle), slide, pump

const GUNS = {
  pistol: {
    parts: {
      frame: { x: 2, y: 3, rows: ['gggggggggf', 'eeeeee.ff'] },
      grip: { x: 1, y: 5, rows: ['ggg', 'gfg', 'gfg', 'fff'] },
      trigger: { x: 5, y: 5, rows: ['h'] },
      guard: { x: 4, y: 5, rows: ['..f', '.ff'] },
      barrel: { x: 9, y: 2, rows: ['dd', 'ee'] },
      slide: { x: 0, y: 0, rows: ['cccccccccl', 'dhdhddddrd', 'eeeeeeeeee'] },
      mag: { x: 1, y: 6, rows: ['ee', 'ee', 'ee', 'cd'] },
    },
    order: ['mag', 'barrel', 'frame', 'grip', 'guard', 'trigger', 'slide'],
    points: { grip: { x: 2, y: 6 }, support: { x: 2.5, y: 8.5 }, magwell: { x: 2, y: 8 }, muzzle: { x: 11, y: 1.5 }, light: { x: 10, y: 4.5 }, port: { x: 6, y: 0.5 }, trigger: { x: 5, y: 5 } },
    slots: { sight: { x: 5, y: -1 }, muzzle: { x: 11, y: 1 }, mag: true },
    slide: { travel: 3 },
  },

  smg: {
    parts: {
      stock: { x: 0, y: 2, rows: ['ffff', 'f...', 'ffff'] },
      receiver: { x: 4, y: 1, rows: ['fffffffffff', 'ggcggggggge', 'gggggggggge', 'eeeeeeeeeee'] },
      barrel: { x: 15, y: 2, rows: ['ddd', 'eee'] },
      grip: { x: 6, y: 5, rows: ['gg', 'gf', '.gf', '.ff'] },
      trigger: { x: 8, y: 5, rows: ['h'] },
      mag: { x: 10, y: 5, rows: ['eee', 'eee', 'eee', 'eee', 'cdd'] },
      fore: { x: 13, y: 5, rows: ['gg', 'gf', 'ff'] },
      bolt: { x: 9, y: 2, rows: ['ll'] },
      handle: { x: 4, y: 0, rows: ['cc'] },
    },
    order: ['stock', 'barrel', 'mag', 'receiver', 'grip', 'fore', 'trigger', 'bolt', 'handle'],
    points: { grip: { x: 7, y: 6 }, support: { x: 14, y: 6.5 }, magwell: { x: 11, y: 5 }, muzzle: { x: 18, y: 2.5 }, light: { x: 15, y: 4.5 }, port: { x: 10, y: 2 }, trigger: { x: 8, y: 5 } },
    slots: { sight: { x: 8, y: 0 }, muzzle: { x: 18, y: 2 }, under: { x: 13, y: 5 }, mag: true, stock: true },
    bolt: { travel: 2 },
  },

  rifle: {
    parts: {
      stock: { x: 0, y: 2, rows: ['dddddd', 'd...gg', 'd..gg.', 'ddgg..'] },
      receiver: { x: 6, y: 1, rows: ['fffffffff', 'gcgggggge', 'ggggggggg', 'eeeeeeeee'] },
      handguard: { x: 15, y: 1, rows: ['dddddddd', 'dedededd', 'edededee', 'eeeeeeee'] },
      barrel: { x: 23, y: 2, rows: ['ddd', 'fff'] },
      post: { x: 21, y: 0, rows: ['f'] },
      grip: { x: 7, y: 5, rows: ['ggg', '.gf', '.gf', '..f'] },
      trigger: { x: 10, y: 5, rows: ['h'] },
      guard: { x: 10, y: 5, rows: ['.f', 'ff'] },
      mag: { x: 12, y: 5, rows: ['ddd', 'eed', '.eed', '.eed', '..cd'] },
      bolt: { x: 11, y: 2, rows: ['lll'] },
      handle: { x: 6, y: 0, rows: ['cc'] },
      sight: { x: 8, y: -1, rows: ['f.f'] },
    },
    order: ['stock', 'barrel', 'mag', 'handguard', 'post', 'receiver', 'grip', 'guard', 'trigger', 'bolt', 'handle', 'sight'],
    points: { grip: { x: 8, y: 6 }, support: { x: 19, y: 5.5 }, magwell: { x: 13, y: 5 }, muzzle: { x: 26, y: 2.5 }, light: { x: 22, y: 4.5 }, port: { x: 12, y: 2 }, trigger: { x: 10, y: 5 } },
    slots: { sight: { x: 9, y: 0 }, muzzle: { x: 26, y: 2 }, under: { x: 18, y: 5 }, mag: true, stock: true },
    bolt: { travel: 3 },
  },

  shotgun: {
    parts: {
      stock: { x: 0, y: 2, rows: ['vwwwWW', 'vwwwww', 'vvwwww', '...vww'] },
      receiver: { x: 6, y: 1, rows: ['ffffffff', 'gcgggggg', 'gggggggg', 'eeeeeeee'] },
      barrel: { x: 14, y: 1, rows: ['ccccccccccccc', 'ddddddddddddd'] },
      tube: { x: 14, y: 3, rows: ['eeeeeeeeee'] },
      grip: { x: 6, y: 5, rows: ['ww', '.ww'] },
      trigger: { x: 8, y: 5, rows: ['h'] },
      guard: { x: 8, y: 5, rows: ['.f', 'ff'] },
      pump: { x: 15, y: 3, rows: ['wWWWWw', 'wwwwww', 'vwvwvw'] },
      bead: { x: 26, y: 0, rows: ['l'] },
    },
    order: ['stock', 'tube', 'barrel', 'bead', 'receiver', 'grip', 'guard', 'trigger', 'pump'],
    points: { grip: { x: 7, y: 5.5 }, support: { x: 18, y: 6 }, magwell: { x: 10, y: 5 }, muzzle: { x: 27, y: 1.5 }, light: { x: 24, y: 3.5 }, port: { x: 10, y: 2 }, trigger: { x: 8, y: 5 } },
    slots: { sight: { x: 9, y: 0 }, muzzle: { x: 27, y: 1 }, stock: true },   // a tube magazine: no mag swaps
    pump: { travel: 4 },
    shell: { w: 2, h: 1, color: GUN_PAL.s },
  },

  sniper: {
    parts: {
      stock: { x: 0, y: 2, rows: ['oOOOOOOO', 'oooooooO', 'oo..oooo', 'ooo.....'] },
      receiver: { x: 8, y: 2, rows: ['ffffffff', 'gcgggggg', 'eeeeeeee'] },
      barrel: { x: 16, y: 3, rows: ['dddddddddddddd', 'ffffffffffffff'] },
      brake: { x: 30, y: 2, rows: ['dd', 'ff', 'ff', 'dd'] },
      grip: { x: 8, y: 5, rows: ['oo', '.oo'] },
      trigger: { x: 10, y: 5, rows: ['h'] },
      guard: { x: 10, y: 5, rows: ['.f', 'ff'] },
      mag: { x: 12, y: 5, rows: ['eee', 'cdd'] },
      bolt: { x: 13, y: 4, rows: ['l', 'l', 'cc'] },
      bipod: { x: 20, y: 5, rows: ['ffffff'] },
    },
    order: ['stock', 'barrel', 'brake', 'bipod', 'mag', 'receiver', 'grip', 'guard', 'trigger', 'bolt'],
    points: { grip: { x: 9, y: 6 }, support: { x: 22, y: 5.5 }, magwell: { x: 13, y: 5 }, muzzle: { x: 32, y: 3.5 }, light: { x: 26, y: 5 }, port: { x: 12, y: 2 }, trigger: { x: 10, y: 5 }, handle: { x: 14, y: 7 } },
    slots: { sight: { x: 10, y: 1 }, muzzle: { x: 32, y: 3 }, mag: true, stock: true },
    bolt: { travel: 4, manual: true },   // worked by hand after each shot
  },
};

// --- attachments ---------------------------------------------------------------
// slot: which slot it fits; anchor: which of its pixels sits on the slot point;
// replaces: default part it hides (mag/stock attachments swap the part out)

const ATTACH = {
  redDot: { slot: 'sight', anchor: { x: 2, y: 2 }, rows: ['.fff', 'fbbf', 'ffff'] },
  scope: { slot: 'sight', anchor: { x: 4, y: 2 }, rows: ['dfffffffd', 'bggggggggb', '..f...f..'] },
  holo: { slot: 'sight', anchor: { x: 2, y: 2 }, rows: ['ff.f', 'fr.f', 'ffff'] },
  suppressor: { slot: 'muzzle', anchor: { x: 0, y: 1 }, rows: ['dddddd', 'gggggg', 'eeeeee'] },
  compensator: { slot: 'muzzle', anchor: { x: 0, y: 1 }, rows: ['ddd', 'fhf', 'eee'] },
  vgrip: { slot: 'under', anchor: { x: 1, y: 0 }, rows: ['ff', 'gf', 'gf', 'ff'] },
  agrip: { slot: 'under', anchor: { x: 2, y: 0 }, rows: ['fff', '.ff', '..f'] },
  extMag: { slot: 'mag', rows: ['ddd', 'eed', 'eed', 'eed', 'eed', 'cdd'] },
  drumMag: { slot: 'mag', rows: ['.ddd.', 'deeed', 'eeeee', 'deeed', '.ddd.'] },
  heavyStock: { slot: 'stock', rows: ['OOOOOO', 'oooooo', 'oooooo', 'ooo...'] },
  // side rail, hanging under the front of the handguard; the lens / emitter is at the front
  flashlight: { slot: 'side', anchor: { x: 4, y: 0 }, rows: ['ddddl', 'eeeeL'] },
  laser: { slot: 'side', anchor: { x: 2, y: 0 }, rows: ['ddr', 'eeh'] },
  laserLight: { slot: 'side', anchor: { x: 4, y: 0 }, rows: ['dddLr', 'eeeeL'] },
};

export const ATTACH_ART = {};
for (const [k, a] of Object.entries(ATTACH)) ATTACH_ART[k] = { ...a, ...part(a.rows) };

// The rest of the catalog is generated from specs (gunbuild.js).
for (const [key, , , , spec] of CATALOG) {
  if (typeof spec === 'string') continue;   // uses a hand-drawn gun above
  GUNS[key] = spec.hand === 'long' ? longGun(spec) : handgun({ ...spec, box: spec.box || spec.hand === 'box' });
}

// Guns from the gun editor (assets/guns/*.json): new ones, or redrawn built-ins.
for (const c of CUSTOM_GUNS) GUNS[c.key] = { ...c.art, pal: c.pal };

export const GUN_ART = {};

// Build (or rebuild) one gun's art from its source: { parts: { name: { x, y, rows } },
// order, points, slots, ... , pal? } - parts keep their rows (the gun editor reads them).
export function buildGunArt(key, gun) {
  const pal = gun.pal ? { ...GUN_PAL, ...gun.pal } : GUN_PAL;
  // every gun takes a light / laser on its side rail, just under where its light point is
  const lp = gun.points.light;
  gun.slots ??= {};
  if (!gun.noRail && lp) gun.slots.side ??= { x: Math.round(lp.x), y: Math.ceil(lp.y) };
  const parts = {};
  for (const [name, p] of Object.entries(gun.parts)) {
    if (!p.rows?.length) continue;
    parts[name] = { x: p.x, y: p.y, rows: p.rows, ...part(p.rows, pal) };
  }
  GUN_ART[key] = { ...gun, parts, order: (gun.order ?? Object.keys(parts)).filter((n) => parts[n]) };
  return GUN_ART[key];
}
for (const [k, gun] of Object.entries(GUNS)) buildGunArt(k, gun);

// Draw a gun with its grip point at the origin. state (all optional):
//   attach: { slot: attachmentKey }, bolt: px back, slide: px back,
//   pump: px back, magDrop: px (null = no mag), trigger: px pulled,
//   open: radians a break action is hinged open, lever: radians a lever is swung down
export function drawGun(ctx, key, state = {}) {
  const gun = GUN_ART[key], { grip } = gun.points, a = state.attach ?? {};
  const ox = -grip.x, oy = -grip.y;
  const swap = { mag: a.mag && ATTACH_ART[a.mag], stock: a.stock && ATTACH_ART[a.stock] };
  for (const name of gun.order) {
    const p = gun.parts[name];
    let img = p.img, x = p.x, y = p.y;
    if (name === 'mag') {
      if (state.magDrop === null) continue;
      if (swap.mag) img = swap.mag.img;
      y += (state.magDrop ?? 0) * (gun.magDir ?? 1);   // top mags (P90) lift off instead
    }
    if (name === 'stock' && swap.stock) img = swap.stock.img;
    if (name === 'sight' && a.sight) continue;           // iron sights fold away under an optic
    if (name === 'bolt' || name === 'handle') x -= name === 'bolt' ? state.bolt ?? 0 : state.handle ?? 0;
    if (name === 'slide') x -= state.slide ?? 0;
    if (name === 'pump') x -= state.pump ?? 0;
    if (name === 'trigger') x -= state.trigger ?? 0;
    // parts that swing on a pivot: the barrels of a break action, a loop lever
    const pivot = state.open && gun.breakParts?.includes(name) ? [gun.hinge, state.open]
      : state.lever && name === 'lever' ? [gun.lever.pivot, state.lever] : null;
    if (pivot) {
      const [at, ang] = pivot;
      ctx.save();
      ctx.translate(ox + at.x, oy + at.y);
      ctx.rotate(ang);
      ctx.drawImage(img, x - at.x - 1, y - at.y - 1);
      ctx.restore();
      continue;
    }
    ctx.drawImage(img, ox + x - 1, oy + y - 1);
  }
  for (const slot of ['under', 'side', 'muzzle', 'sight']) {
    const k = a[slot], s = gun.slots[slot];
    if (!k || !s) continue;
    const art = ATTACH_ART[k];
    ctx.drawImage(art.img, ox + s.x - art.anchor.x - 1, oy + s.y - art.anchor.y - 1);
  }
}

// How far an attachment moves the muzzle forward (suppressors are long).
export function muzzleOffset(attach) {
  const k = attach?.muzzle;
  return k ? ATTACH_ART[k].w - ATTACH_ART[k].anchor.x : 0;
}

// A finished picture of a gun (for cases, the HUD and the inventory).
export function gunIcon(key, attach = {}) {
  const W = 80, H = 32;
  const [c, g] = makeCanvas(W, H);
  g.translate(16, 12);
  const p = GUN_ART[key].points.grip;
  g.translate(p.x, p.y);
  drawGun(g, key, { attach });
  // trim to the drawn area
  const d = g.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3]) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  if (x1 < x0) return makeCanvas(1, 1)[0];   // nothing drawn yet (a new gun in the editor)
  const [t, tg] = makeCanvas(x1 - x0 + 1, y1 - y0 + 1);
  tg.drawImage(c, -x0, -y0);
  return t;
}
