// The looks a fighter can wear: the one art (assets/player) drawn again in other colours - its hair, jacket, shirt,
// eyes - and, for some, a few pixels more in the same hand: a headband, cat ears, a ponytail tied with a ribbon.
// (CRIMSON is the art just as it is.) Picked in ROOM SETUP (YOUR LOOK) or tried on in training, at the wardrobe.

import { makeCanvas } from '../engine/pixel.js';

// the art's own colours
const HAIR = ['#ff8193', '#fa5b71', '#fc3450', '#de213b', '#c5122b', '#a1051a'];   // (lightest to darkest)
const IRIS = '#b72a30', SHIRT = '#98a5be';
const KEEP = new Set(['#000000', '#ffffff', '#181616', '#f9e2db', '#efc6ba', '#d9ada0']);   // (outline, eyes, skin)
const CLOTH_MID = 0.15;   // (the jacket's and trousers' own shades are all about this light)
const HEAD = new Set(['head', 'backHead']), BODY = new Set(['body', 'backBody']);

const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
function hsl(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  l = Math.max(0, Math.min(1, l));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const ch = (t) => {
    t = (t + 1) % 1;
    return 255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p);
  };
  return hex(ch(h + 1 / 3), ch(h), ch(h - 1 / 3));
}
const lightOf = (r, g, b) => (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
const rgbOf = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

// six shades of a hair colour, light to dark (the art's own steps), the hue turning a little as it darkens
const STEPS = [0.2, 0.12, 0.05, -0.05, -0.13, -0.22];
const ramp = ([h, s, l, k = 1, turn = 16]) => STEPS.map((d) => hsl(h + d * turn, s, l + d * k));

export const SKINS = [
  { key: 'crimson', name: 'CRIMSON' },
  { key: 'ronin', name: 'RONIN', hair: [215, 0.16, 0.86, 0.7], eye: '#d03040', jacket: [235, 0.08, 0.1, 0.9], shirt: '#5e5e6a', band: ['#16161c', '#3a3a48'] },
  { key: 'shade', name: 'SHADE', hair: [240, 0.18, 0.2, 0.6], eye: '#e03a3a', jacket: [350, 0.12, 0.1, 0.9], shirt: '#d8323e' },
  { key: 'sakura', name: 'SAKURA', hair: [335, 0.92, 0.74, 0.8, -20], eye: '#e04a8a', jacket: [330, 0.3, 0.86, 1.2], shirt: '#ff70ac' },
  { key: 'sol', name: 'SOL', hair: [46, 0.95, 0.62, 0.9, 40], eye: '#2a74e8', jacket: [215, 0.25, 0.86, 1.2], shirt: '#3a7aff' },
  { key: 'neko', name: 'NEKO', hair: [268, 0.38, 0.3, 0.8], eye: '#f0c020', jacket: [265, 0.22, 0.13, 1], shirt: '#a46aff', ears: '#ffa8c8' },
  { key: 'tide', name: 'TIDE', hair: [176, 0.72, 0.46, 0.9, -20], eye: '#1ab8b0', jacket: [195, 0.28, 0.12, 1], shirt: '#2ad8c8' },
  { key: 'blade', name: 'BLADE', hair: [218, 0.12, 0.74, 0.85], eye: '#4a7aa8', jacket: [356, 0.66, 0.34, 1.6], shirt: '#2a2228', band: ['#16161c', '#3a3a48'] },
  { key: 'oak', name: 'OAK', hair: [24, 0.5, 0.36, 0.8, 10], eye: '#a8682a', jacket: [26, 0.42, 0.3, 1.4], shirt: '#f2ece0' },
  { key: 'admiral', name: 'ADMIRAL', hair: [226, 0.55, 0.3, 0.8], eye: '#4a8aff', jacket: [224, 0.5, 0.22, 1.4], shirt: '#6a9aff' },
  { key: 'frost', name: 'FROST', hair: [205, 0.3, 0.88, 0.7], eye: '#3a8aff', jacket: [210, 0.28, 0.88, 1.2], shirt: '#4a8aff', tail: ['#4a8aff', '#2a5ad0'] },
  { key: 'violet', name: 'VIOLET', hair: [276, 0.55, 0.52, 0.9], eye: '#b070ff', jacket: [270, 0.2, 0.13, 1], shirt: '#b070ff', tail: ['#ffd45a', '#d0a030'] },
];
export const skinOf = (key) => SKINS.find((s) => s.key === key && s.hair) ?? null;
export const skinName = (key) => (SKINS.find((s) => s.key === key) ?? SKINS[0]).name;

// The art's parts in a skin: each a canvas. teamHue: in TEAMS, the jacket's in your side's colour (the rest is yours).
export function skinParts(images, skin, teamHue) {
  const hair = ramp(skin.hair), hairOf = new Map(HAIR.map((c, i) => [c, hair[i]]));
  const jacket = teamHue === undefined ? skin.jacket : [teamHue, 0.62, 0.3, 1.5];
  const shirt = teamHue === undefined ? skin.shirt : hsl(teamHue, 0.9, 0.62);
  const cloth = ([h, s, l, k], L) => hsl(h, s, l + (L - CLOTH_MID) * k);
  const out = {};
  for (const [k, src] of Object.entries(PART_FILES)) {
    const img = images[src];
    if (!img) continue;
    const [c, g] = makeCanvas(img.width, img.height);
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      if (!p[i + 3]) continue;
      const was = hex(p[i], p[i + 1], p[i + 2]);
      if (KEEP.has(was)) continue;
      let to = null;
      if (HEAD.has(k)) to = hairOf.get(was) ?? (was === IRIS ? skin.eye : null);
      else if (BODY.has(k)) to = was === SHIRT ? shirt : cloth(jacket, lightOf(p[i], p[i + 1], p[i + 2]));
      else if (skin.pants) to = cloth(skin.pants, lightOf(p[i], p[i + 1], p[i + 2]));
      if (!to) continue;
      [p[i], p[i + 1], p[i + 2]] = rgbOf(to);
    }
    g.putImageData(d, 0, 0);
    out[k] = c;
  }
  if (skin.band) headband(out, skin.band);
  if (skin.ears) catEars(out, hair, skin.ears);
  if (skin.tail) ponytail(out, hair, skin.tail);
  return out;
}
const PART_FILES = { head: 'head', body: 'body', legL: 'legL', legR: 'legR', backHead: 'backHead', backBody: 'backBody', backLegL: 'backLegL', backLegR: 'backLegR' };

// ---- the pixels added on ----
// Pixels [x, y, colour] put onto a part. behind: only where there's nothing yet (tucked behind what's drawn).
// Then the art's black line round them, wherever they'd meet thin air.
function paint(c, px, { behind = false, line = true } = {}) {
  const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height), p = d.data, W = c.width, H = c.height;
  const at = (x, y) => (y * W + x) * 4, inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const put = [];
  for (const [x, y, col] of px) {
    if (!inside(x, y) || (behind && p[at(x, y) + 3])) continue;
    const [r, gg, b] = rgbOf(col), i = at(x, y);
    p[i] = r; p[i + 1] = gg; p[i + 2] = b; p[i + 3] = 255;
    put.push([x, y]);
  }
  if (line) for (const [x, y] of put) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (!inside(nx, ny) || p[at(nx, ny) + 3]) continue;
    const i = at(nx, ny);
    p[i] = p[i + 1] = p[i + 2] = 0; p[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
}
// recolour the hair of rows y0..y1 (the black line left as it is)
function band(c, rows) {
  const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height), p = d.data;
  for (const [y, col] of rows) {
    const [r, gg, b] = rgbOf(col);
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      if (!p[i + 3] || (p[i] < 8 && p[i + 1] < 8 && p[i + 2] < 8)) continue;
      p[i] = r; p[i + 1] = gg; p[i + 2] = b;
    }
  }
  g.putImageData(d, 0, 0);
}

// A headband round the brow, its two tails streaming out behind - and from behind, the knot and the tails hanging.
function headband(out, [col, hi]) {
  band(out.head, [[9, hi], [10, col]]);
  paint(out.head, [[4, 9, col], [3, 9, col], [2, 8, col], [1, 8, hi], [4, 10, col], [3, 11, col], [2, 11, col], [1, 12, hi]]);
  band(out.backHead, [[9, hi], [10, col]]);
  paint(out.backHead, [[15, 9, hi], [16, 9, hi], [15, 10, hi], [16, 10, hi], [15, 11, col], [14, 12, col], [14, 13, col], [13, 14, hi], [16, 11, col], [17, 12, col], [17, 13, col], [18, 14, hi]], { line: false });
}

// Cat ears up on top, pink inside (from behind, just the backs of them).
function catEars(out, hair, inner) {
  const ear = (rows, pink, col) => rows.flatMap(([y, x0, x1]) => Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y, pink.some(([px, py]) => px === x0 + i && py === y) ? inner : col]));
  paint(out.head, [
    ...ear([[0, 9, 9], [1, 9, 10], [2, 9, 11], [3, 10, 12]], [[10, 2], [10, 3], [11, 3]], hair[3]),
    ...ear([[0, 22, 22], [1, 21, 22], [2, 20, 22], [3, 20, 23]], [[21, 2], [21, 3], [22, 3]], hair[2]),
  ]);
  paint(out.backHead, [
    ...ear([[0, 11, 11], [1, 11, 12], [2, 11, 13]], [[12, 2]], hair[3]),
    ...ear([[0, 20, 20], [1, 19, 20], [2, 18, 20]], [[19, 2]], hair[3]),
  ].map(([x, y, c]) => [x, y, c === inner ? hair[4] : c]));
}

// A ponytail tied high at the back, a ribbon round it: from the side hanging down behind the head, from behind
// falling down the middle of the back.
function ponytail(out, hair, [rib, ribDk]) {
  const side = [];
  for (const [y, x0, x1] of [[5, 4, 6], [6, 3, 6], [7, 2, 6], [8, 1, 5], [9, 1, 4], [10, 1, 4], [11, 1, 4], [12, 1, 4], [13, 1, 4], [14, 2, 4], [15, 2, 4], [16, 2, 4], [17, 3, 4], [18, 3, 4], [19, 4, 4]]) {
    for (let x = x0; x <= x1; x++) side.push([x, y, x === x0 ? hair[3] : x === x1 ? hair[4] : (x + y) % 3 === 0 ? hair[1] : hair[2]]);
  }
  paint(out.head, side, { behind: true });
  paint(out.head, [[5, 4, rib], [6, 4, rib], [4, 5, rib], [5, 5, ribDk], [6, 5, rib], [7, 5, rib], [5, 6, rib], [6, 6, ribDk], [4, 7, rib], [3, 8, ribDk]]);
  const back = [];
  for (let y = 6; y <= 24; y++) {
    const x0 = y > 21 ? 15 : 14, x1 = y > 22 ? 16 : 17;
    for (let x = x0; x <= x1; x++) back.push([x, y, x === x0 || x === x1 ? hair[5] : (x + y) % 3 === 0 ? hair[0] : hair[1]]);
  }
  paint(out.backHead, back, { line: false });
  paint(out.backHead, [[13, 3, rib], [18, 3, rib], [13, 4, rib], [14, 4, rib], [15, 4, ribDk], [16, 4, ribDk], [17, 4, rib], [18, 4, rib], [14, 5, rib], [15, 5, ribDk], [16, 5, ribDk], [17, 5, rib]], { line: false });
  // (the tail below the head, out in the air: lined)
  paint(out.backHead, back.filter(([, y]) => y >= 20), { behind: false });
}
