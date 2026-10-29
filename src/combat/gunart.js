// Modular gun art. Every gun is assembled from separate parts (stock,
// receiver, handguard, barrel, grip, trigger, magazine, bolt carrier,
// charging handle, sights...) so they can move on their own - the bolt
// carrier slides back in the ejection port on every shot, the trigger
// moves, the mag drops out, and so on. Attachments (sights, muzzle devices,
// grips, mags, stocks) snap onto slots and replace or add parts.
//
// Guns are drawn finer than the rest of the game: RES gun pixels to a world
// pixel, so there's room for shading and detail. Their source art (parts,
// points, slots, travel) is in gun pixels; GUN_ART exports the points, slots,
// hinge and moving-part travel in world pixels so the code that holds a gun
// (hands, muzzle, port...) works in world units, and drawGun scales the art
// down to match. Gun pictures (gunIcon, part / attachment images) are at gun
// resolution and say so with `img.res` (see artW / artH).
//
// Parts are written as rows of palette letters ('.' = empty); each part gets
// its own 1px black outline, which also draws the seams between parts.
// Guns point right.

import { makeCanvas } from '../engine/pixel.js';
import { CATALOG } from './catalog.js';
import { longGun, handgun, Sketch, paintMag, paintStock, FURN, BODY } from './gunbuild.js';
import { CUSTOM_GUNS } from './customguns.js';

export const RES = 2;   // gun pixels per world pixel

// The size of a picture in world pixels (gun art is drawn finer than 1:1).
export const artW = (img) => img.width / (img.res ?? 1);
export const artH = (img) => img.height / (img.res ?? 1);

const K = '#000000';
// gunmetal greys (darkest to lightest), plus furniture and details
export const GUN_PAL = {
  h: '#111316', f: '#1c2221', g: '#2b2e2f', e: '#343a3a', d: '#4c5455', c: '#657575', l: '#8d9c9c',
  S: '#c3cdcd', Z: '#e6eded', q: '#20262a', k: '#0b0c0d',      // polished steel, near-white glint, blued steel, rubber
  o: '#3f4a24', O: '#5a6a33', P: '#73843f', Q: '#8a9a50',      // olive polymer
  V: '#3a2412', v: '#4a2f19', w: '#6e4426', W: '#93613a', x: '#b37a4a',   // wood
  u: '#5e4e33', t: '#857150', T: '#a8936a', U: '#c2ad82',      // tan polymer
  R: '#9e2128',                                                 // dark red paint
  a: '#c4561f', A: '#ec8a34',                                   // orange (chainsaw body)
  r: '#d7313d', y: '#e8b84a', Y: '#f5d27a', n: '#a8822e', L: '#fff3c4', b: '#7fb7d9', B: '#2f5f80', s: '#c23a2e',
};

// A part sprite with an automatic outline. Returns { img, w, h } where img is
// 2px bigger than the rows (1px outline all round). res: what resolution the
// rows are drawn at (gun parts: RES).
export function part(rows, pal = GUN_PAL, res = 1) {
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
  if (res !== 1) c.res = res;
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
// Every gun in the catalog is built from its spec (gunbuild.js).

const GUNS = {};

// --- attachments ---------------------------------------------------------------
// slot: which slot it fits; anchor: which of its pixels sits on the slot point;
// replaces: default part it hides (mag/stock attachments swap the part out).
// Drawn on the gun grid like the guns.

const sketch = (fn) => {
  const s = new Sketch();
  fn(s);
  return s.part().rows;
};
const ATTACH = {
  redDot: {
    slot: 'sight', anchor: { x: 4, y: 7 },
    rows: sketch((s) => {
      s.rect(1, 0, 7, 1, 'd').rect(0, 1, 9, 4, 'e').rect(0, 1, 9, 1, 'c');
      s.rect(7, 1, 2, 4, 'g').rect(1, 2, 6, 2, 'B').rect(2, 2, 2, 1, 'b').set(5, 2, 'r');
      s.rect(0, 5, 9, 1, 'f').rect(2, 6, 5, 2, 'g').rect(2, 6, 5, 1, 'e');
    }),
  },
  holo: {
    slot: 'sight', anchor: { x: 5, y: 8 },
    rows: sketch((s) => {
      s.rect(0, 0, 11, 1, 'd').rect(0, 0, 1, 6, 'e').rect(10, 0, 1, 6, 'g');
      s.set(5, 3, 'r');
      s.rect(0, 5, 11, 2, 'g').rect(0, 5, 11, 1, 'e').rect(8, 5, 2, 1, 'b');
      s.rect(2, 7, 7, 2, 'f').rect(2, 7, 7, 1, 'e');
    }),
  },
  scope: {
    slot: 'sight', anchor: { x: 10, y: 9 },
    rows: sketch((s) => {
      s.rect(5, 2, 12, 5, 'e').rect(5, 2, 12, 1, 'c').rect(5, 3, 12, 1, 'd').rect(5, 6, 12, 1, 'g');   // tube
      s.rect(0, 1, 6, 7, 'e').rect(0, 1, 6, 1, 'd').rect(0, 7, 6, 1, 'f').rect(0, 2, 1, 5, 'B');      // eyepiece
      s.rect(16, 0, 7, 9, 'e').rect(16, 0, 7, 1, 'd').rect(16, 8, 7, 1, 'f').rect(22, 1, 1, 7, 'B').set(22, 2, 'b').set(22, 3, 'L');   // objective
      s.rect(9, 0, 4, 2, 'd').set(10, 0, 'c');                                                        // turret
      s.rect(6, 7, 3, 2, 'f').rect(13, 7, 3, 2, 'f').rect(6, 9, 10, 1, 'g');                           // rings + base
    }),
  },
  suppressor: {
    slot: 'muzzle', anchor: { x: 0, y: 3 },
    rows: sketch((s) => {
      s.rect(0, 0, 16, 7, 'g').rect(0, 0, 16, 1, 'd').rect(0, 1, 16, 1, 'e').rect(0, 6, 16, 1, 'f');
      for (const i of [3, 8, 13]) s.rect(i, 1, 1, 5, 'f');
      s.rect(15, 1, 1, 5, 'e').set(15, 3, 'h');
    }),
  },
  compensator: {
    slot: 'muzzle', anchor: { x: 0, y: 2 },
    rows: sketch((s) => {
      s.rect(0, 0, 7, 5, 'e').rect(0, 0, 7, 1, 'c').rect(0, 4, 7, 1, 'f');
      s.rect(2, 0, 1, 2, 'h').rect(4, 0, 1, 2, 'h').set(6, 2, 'h');
    }),
  },
  vgrip: {
    slot: 'under', anchor: { x: 2, y: 0 },
    rows: sketch((s) => {
      s.rect(0, 0, 6, 2, 'f').rect(0, 0, 6, 1, 'e');
      s.rect(1, 2, 4, 8, 'g').rect(1, 2, 1, 8, 'e').rect(4, 2, 1, 8, 'f');
      for (let j = 4; j < 10; j += 2) s.set(2, j, 'f');
      s.rect(1, 10, 4, 1, 'f');
    }),
  },
  agrip: {
    slot: 'under', anchor: { x: 4, y: 0 },
    rows: sketch((s) => {
      s.rect(0, 0, 9, 2, 'f').rect(0, 0, 9, 1, 'e');
      for (let j = 2; j < 7; j++) s.rect(j - 1, j, 10 - j, 1, j === 2 ? 'e' : 'g').set(8, j, 'f');
    }),
  },
  extMag: { slot: 'mag', rows: sketch((s) => paintMag(s, 'straight', 0, 0, 8, ['e', 'd', 'c'])) },
  drumMag: { slot: 'mag', rows: sketch((s) => paintMag(s, 'drum', 0, 0, 5, ['e', 'd', 'c'])) },
  heavyStock: { slot: 'stock', rows: sketch((s) => paintStock(s, 'solid', 12, 2, 8, FURN.olive, BODY.olive, 0, 'olive')) },
  // side rail, hanging under the front of the handguard; the lens / emitter is at the front
  flashlight: {
    slot: 'side', anchor: { x: 9, y: 0 },
    rows: sketch((s) => s.rect(0, 0, 9, 4, 'e').rect(0, 0, 9, 1, 'c').rect(0, 3, 9, 1, 'f').rect(2, 1, 1, 2, 'g').rect(9, 0, 1, 4, 'L').set(9, 0, 'Y')),
  },
  laser: {
    slot: 'side', anchor: { x: 5, y: 0 },
    rows: sketch((s) => s.rect(0, 0, 5, 3, 'e').rect(0, 0, 5, 1, 'c').rect(0, 2, 5, 1, 'f').rect(5, 0, 1, 3, 'h').set(5, 1, 'r')),
  },
  laserLight: {
    slot: 'side', anchor: { x: 9, y: 0 },
    rows: sketch((s) => s.rect(0, 0, 9, 5, 'e').rect(0, 0, 9, 1, 'c').rect(0, 4, 9, 1, 'f').rect(9, 0, 1, 3, 'L').rect(9, 3, 1, 2, 'h').set(9, 3, 'r').rect(3, 1, 3, 1, 'g')),
  },
};

export const ATTACH_ART = {};
for (const [k, a] of Object.entries(ATTACH)) ATTACH_ART[k] = { ...a, ...part(a.rows, GUN_PAL, RES) };

// The catalog is generated from specs (gunbuild.js).
for (const [key, , , , spec] of CATALOG) {
  GUNS[key] = spec.hand === 'long' ? longGun(spec) : handgun({ ...spec, box: spec.box || spec.hand === 'box' });
}

// A gun drawn before the art went finer (res 1): every pixel becomes RES x RES.
export function upscale(gun) {
  const k = RES / (gun.res ?? 1);
  if (k === 1) return gun;
  const pt = (p) => (p && typeof p === 'object' ? { ...p, x: p.x * k, y: p.y * k } : p);
  const map = (o, f) => o && Object.fromEntries(Object.entries(o).map(([n, v]) => [n, f(v)]));
  const out = { ...gun, res: RES };
  out.parts = map(gun.parts, (p) => ({ ...p, x: p.x * k, y: p.y * k, rows: p.rows.flatMap((r) => Array(k).fill([...r].map((ch) => ch.repeat(k)).join(''))) }));
  out.points = map(gun.points, pt);
  out.slots = map(gun.slots, pt);
  for (const m of ['bolt', 'slide', 'pump']) if (gun[m]) out[m] = { ...gun[m], travel: gun[m].travel * k };
  if (gun.hinge) out.hinge = pt(gun.hinge);
  if (gun.lever) out.lever = { ...gun.lever, pivot: pt(gun.lever.pivot) };
  return out;
}

// Guns from the gun editor (assets/guns/*.json): new ones, or redrawn built-ins.
for (const c of CUSTOM_GUNS) GUNS[c.key] = upscale({ ...c.art, res: c.art.res ?? c.res ?? 1, pal: c.pal });

export const GUN_ART = {};

// Build (or rebuild) one gun's art from its source: { parts: { name: { x, y, rows } },
// order, points, slots, ... , pal? } in gun pixels - parts keep their rows and
// `src` the source as given (the gun editor reads them).
export function buildGunArt(key, gun) {
  gun = upscale({ ...gun, res: gun.res ?? RES });
  const pal = gun.pal ? { ...GUN_PAL, ...gun.pal } : GUN_PAL;
  // every gun takes a light / laser on its side rail, just under where its light point is
  const lp = gun.points.light;
  gun.slots ??= {};
  if (!gun.noRail && lp) gun.slots.side ??= { x: Math.round(lp.x), y: Math.ceil(lp.y) };
  const parts = {};
  for (const [name, p] of Object.entries(gun.parts)) {
    if (!p.rows?.length) continue;
    parts[name] = { x: p.x, y: p.y, rows: p.rows, ...part(p.rows, pal, RES) };
  }
  // where the off hand grabs to rack it: the charging handle, else the slide (gun pixels)
  const ph = gun.parts.handle, ps = gun.parts.slide;
  const rack = gun.points.handle ?? (ph?.rows?.length ? { x: ph.x + 2, y: ph.y + 1 } : ps?.rows?.length ? { x: ps.x + 3, y: ps.y + 2 } : null);
  if (rack) gun.points = { ...gun.points, handle: rack };
  // gun pixels -> world pixels for everything the holding code reads
  const w = (p) => (p && typeof p === 'object' ? { ...p, x: p.x / RES, y: p.y / RES } : p);
  const map = (o) => o && Object.fromEntries(Object.entries(o).map(([n, v]) => [n, w(v)]));
  const travel = (m) => m && { ...m, travel: m.travel / RES };
  GUN_ART[key] = {
    ...gun, src: gun, parts, order: (gun.order ?? Object.keys(parts)).filter((n) => parts[n]),
    points: map(gun.points), slots: map(gun.slots), hinge: w(gun.hinge), lever: gun.lever && { ...gun.lever, pivot: w(gun.lever.pivot) },
    bolt: travel(gun.bolt), slide: travel(gun.slide), pump: travel(gun.pump),
  };
  return GUN_ART[key];
}
for (const [k, gun] of Object.entries(GUNS)) buildGunArt(k, gun);

// Draw a gun on its own grid (gun pixels), grip point at the origin. state as drawGun, in gun pixels.
function drawGunFine(ctx, key, state) {
  const gun = GUN_ART[key], src = gun.src, { grip } = src.points, a = state.attach ?? {};
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
    if (name === 'bolt') x -= state.bolt ?? 0;
    if (name === 'handle') x -= (state.handle ?? 0) + (gun.handleRides ? state.bolt ?? 0 : 0);
    if (name === 'bolt' && src.port) {
      const pr = src.port;
      ctx.save();
      ctx.beginPath();
      ctx.rect(ox + pr.x, oy + pr.y, pr.w, pr.h);
      ctx.clip();
      ctx.drawImage(img, ox + x - 1, oy + y - 1);
      ctx.restore();
      continue;
    }
    if (name === 'slide') x -= state.slide ?? 0;
    if (name === 'pump') x -= state.pump ?? 0;
    if (name === 'trigger') x -= state.trigger ?? 0;
    // parts that swing on a pivot: the barrels of a break action, a loop lever
    const pivot = state.open && gun.breakParts?.includes(name) ? [src.hinge, state.open]
      : state.lever && name === 'lever' ? [src.lever.pivot, state.lever] : null;
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
    const k = a[slot], s = src.slots[slot];
    if (!k || !s) continue;
    const art = ATTACH_ART[k];
    ctx.drawImage(art.img, ox + s.x - art.anchor.x - 1, oy + s.y - art.anchor.y - 1);
  }
}

// Draw a gun with its grip point at the origin, in world pixels. state (all optional):
//   attach: { slot: attachmentKey }, bolt: px back, slide: px back,
//   pump: px back, magDrop: px (null = no mag), trigger: px pulled,
//   open: radians a break action is hinged open, lever: radians a lever is swung down
export function drawGun(ctx, key, state = {}) {
  const fine = (v) => (v === null || v === undefined ? v : Math.round(v * RES));
  ctx.save();
  ctx.scale(1 / RES, 1 / RES);
  drawGunFine(ctx, key, {
    ...state, bolt: fine(state.bolt), slide: fine(state.slide), pump: fine(state.pump), handle: fine(state.handle),
    trigger: fine(state.trigger), magDrop: fine(state.magDrop),
  });
  ctx.restore();
}

// How far an attachment moves the muzzle forward (suppressors are long), in world pixels.
export function muzzleOffset(attach) {
  const k = attach?.muzzle;
  return k ? (ATTACH_ART[k].w - ATTACH_ART[k].anchor.x) / RES : 0;
}

// A finished picture of a gun (for cases, the HUD and the inventory), at gun resolution.
export function gunIcon(key, attach = {}) {
  const W = 80 * RES, H = 32 * RES;
  const [c, g] = makeCanvas(W, H);
  const p = GUN_ART[key].src.points.grip;
  g.translate(16 * RES + p.x, 12 * RES + p.y);
  drawGunFine(g, key, { attach });
  // trim to the drawn area
  const d = g.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3]) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  if (x1 < x0) return makeCanvas(1, 1)[0];   // nothing drawn yet (a new gun in the editor)
  const [t, tg] = makeCanvas(x1 - x0 + 1, y1 - y0 + 1);
  tg.drawImage(c, -x0, -y0);
  t.res = RES;
  return t;
}
