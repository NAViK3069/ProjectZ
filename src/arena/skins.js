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
  // looks put together from drawn parts (PixelLab, each part made on its own from the art above): a head (hair), a
  // body (top) and legs (trousers), any of each - assets/player/parts/<kind>/<name>.png, the part's views side by
  // side on the art's own 32 px frame: head and body front then back, legs leg_l leg_r back_leg_l back_leg_r
  { key: 'doc', name: 'DOC', art: { head: 'doc', body: 'coat', legs: 'grey' } },
  { key: 'blaze', name: 'BLAZE', art: { head: 'blaze', body: 'leather', legs: 'jeans' } },
  { key: 'mint', name: 'MINT', art: { head: 'mint', body: 'hoodie', legs: 'brown' } },
  { key: 'raven', name: 'RAVEN', art: { head: 'raven', body: 'mandarin', legs: 'black' } },
  { key: 'rook', name: 'ROOK', art: { head: 'rook', body: 'camo', legs: 'olive' } },
  { key: 'nova', name: 'NOVA', art: { head: 'nova', body: 'space', legs: 'white' } },
  { key: 'punk', name: 'PUNK', art: { head: 'punk', body: 'studs', legs: 'red' } },
  { key: 'drift', name: 'DRIFT', art: { head: 'drift', body: 'windbreaker', legs: 'black' } },
  { key: 'ace', name: 'ACE', art: { head: 'ace', body: 'suit', legs: 'navy' } },
  { key: 'haze', name: 'HAZE', art: { head: 'haze', body: 'track', legs: 'purple' } },
];
// Every drawn part there is, by kind, with its name in the wardrobe (crimson, jacket and night: the art itself)
export const PARTS = {
  head: { crimson: 'SPIKY', doc: 'HIME CUT', blaze: 'SHORT SPIKES', mint: 'BOB', raven: 'TWIN BUNS', rook: 'BUZZ CUT', nova: 'WAVY', punk: 'MOHAWK', drift: 'CAP', ace: 'SLICKED BACK', haze: 'AFRO' },
  body: { jacket: 'JACKET', coat: 'LAB COAT', leather: 'LEATHER', hoodie: 'HOODIE', mandarin: 'MANDARIN', camo: 'CAMO', space: 'SPACE SUIT', studs: 'STUDDED VEST', windbreaker: 'WINDBREAKER', suit: 'SUIT', track: 'TRACKSUIT' },
  legs: { night: 'DARK', grey: 'GREY', jeans: 'JEANS', brown: 'BROWN', black: 'BLACK', olive: 'OLIVE', white: 'WHITE', red: 'RED', navy: 'NAVY', purple: 'PURPLE' },
};
// the colours the wardrobe offers (null: as it's drawn)
export const COLOURS = {
  hair: [[null, 'AS DRAWN'], ['#26262e', 'BLACK'], ['#5a3a26', 'DARK BROWN'], ['#8a5a32', 'BROWN'], ['#e8c050', 'BLONDE'], ['#ece6d2', 'PLATINUM'], ['#d42a3a', 'RED'],
    ['#f07a2a', 'ORANGE'], ['#ff7ab8', 'PINK'], ['#8a4ad8', 'PURPLE'], ['#3a6ae8', 'BLUE'], ['#2ac8b8', 'TEAL'], ['#4ab84a', 'GREEN'], ['#9a9aa6', 'GREY'], ['#f4f4f8', 'WHITE']],
  eye: [[null, 'AS DRAWN'], ['#d03040', 'RED'], ['#3a7aff', 'BLUE'], ['#3ab84a', 'GREEN'], ['#8a5a2a', 'BROWN'], ['#f0c020', 'GOLD'], ['#a46aff', 'VIOLET'],
    ['#1ab8b0', 'TEAL'], ['#ff5aa0', 'PINK'], ['#8a9aa8', 'GREY'], ['#20202a', 'BLACK']],
  top: [[null, 'AS DRAWN'], ['#26262e', 'BLACK'], ['#eceef2', 'WHITE'], ['#8a8e98', 'GREY'], ['#c42a36', 'RED'], ['#f07a2a', 'ORANGE'], ['#e8c040', 'YELLOW'],
    ['#3aa84a', 'GREEN'], ['#2ab8b0', 'TEAL'], ['#3a6ae8', 'BLUE'], ['#22305a', 'NAVY'], ['#7a42c8', 'PURPLE'], ['#f070b0', 'PINK'], ['#7a5032', 'BROWN']],
};

// A look of your own, put together in the wardrobe: 'my:<head>.<body>.<legs>.<hair>.<eye>.<top>' (each colour six hex
// digits, or '-' as it's drawn) - a string, so it goes in the settings and over the net as a look's key does.
export const myKey = (m) => 'my:' + [m.head, m.body, m.legs, ...['hair', 'eye', 'top'].map((k) => m[k]?.slice(1) ?? '-')].join('.');
function parseMy(key) {
  const f = key.slice(3).split('.');
  if (f.length !== 6 || !PARTS.head[f[0]] || !PARTS.body[f[1]] || !PARTS.legs[f[2]]) return null;
  const col = (v) => (/^[0-9a-f]{6}$/.test(v) ? '#' + v : null);
  return { head: f[0], body: f[1], legs: f[2], hair: col(f[3]), eye: col(f[4]), top: col(f[5]) };
}
// what any look is made of, as the wardrobe sees it (a look drawn as recolours of the art: the art's own parts)
export function lookOf(key) {
  if (key?.startsWith('my:')) { const m = parseMy(key); if (m) return m; }
  const art = SKINS.find((s) => s.key === key)?.art ?? { head: 'crimson', body: 'jacket', legs: 'night' };
  return { ...art, hair: null, eye: null, top: null };
}
const MINE = new Map();
export function skinOf(key) {
  if (typeof key === 'string' && key.startsWith('my:')) {
    if (!MINE.has(key)) {
      const m = parseMy(key);
      MINE.set(key, m && { key, name: 'CUSTOM', art: { head: m.head, body: m.body, legs: m.legs }, tint: { hair: m.hair, eye: m.eye, top: m.top } });
    }
    return MINE.get(key);
  }
  return SKINS.find((s) => s.key === key && (s.hair || s.art)) ?? null;
}
// every drawn part, for loadImages (as '<kind>:<name>')
export const LOOK_ART = Object.fromEntries(Object.entries(PARTS).flatMap(([kind, names]) => Object.keys(names).map((n) => [`${kind}:${n}`, `assets/player/parts/${kind}/${n}.png`])));
// which view of which part each of the rig's parts is
const ART_VIEWS = { head: ['head', 0], backHead: ['head', 1], body: ['body', 0], backBody: ['body', 1], legL: ['legs', 0], legR: ['legs', 1], backLegL: ['legs', 2], backLegR: ['legs', 3] };
export const skinName = (key) => (key?.startsWith('my:') ? 'CUSTOM' : (SKINS.find((s) => s.key === key) ?? SKINS[0]).name);

// The art's parts in a skin: each a canvas. teamHue: in TEAMS, the jacket's in your side's colour (the rest is yours).
export function skinParts(images, skin, teamHue) {
  if (skin.art) return artParts(images, skin, teamHue);
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

// A look put together from drawn parts: each of the rig's parts, the right view of its head, body or legs. In TEAMS
// its top's in your side's colour, each shade as light as it was (the outline, the whites and any colour the head
// has too - skin, hair - left as they are).
function artParts(images, skin, teamHue) {
  const out = {};
  for (const [k, [kind, view]] of Object.entries(ART_VIEWS)) {
    const sheet = images[`${kind}:${skin.art[kind]}`];
    if (!sheet) return {};
    const [c, g] = makeCanvas(32, 32);
    g.drawImage(sheet, view * 32, 0, 32, 32, 0, 0, 32, 32);
    out[k] = c;
  }
  if (skin.tint) tintLook(out, skin.tint);
  if (teamHue !== undefined) for (const [k, head] of [['body', 'head'], ['backBody', 'backHead']]) {
    const hd = out[head].getContext('2d').getImageData(0, 0, 32, 32).data, own = new Set();
    for (let i = 0; i < hd.length; i += 4) if (hd[i + 3]) own.add(hex(hd[i], hd[i + 1], hd[i + 2]));
    const g = out[k].getContext('2d'), d = g.getImageData(0, 0, 32, 32), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      if (!p[i + 3]) continue;
      const was = hex(p[i], p[i + 1], p[i + 2]), L = lightOf(p[i], p[i + 1], p[i + 2]);
      if (own.has(was) || L < 0.12 || L > 0.9) continue;
      [p[i], p[i + 1], p[i + 2]] = rgbOf(hsl(teamHue, 0.62, 0.3 + (L - CLOTH_MID) * 1.5));
    }
    g.putImageData(d, 0, 0);
  }
  return out;
}

// A picture of one bit of a look (lookOf's shape), for the wardrobe: 'head', 'body', 'legs' (the pair) or 'eyes' (the
// face, close up) - cut to what's drawn.
const ICON_BOX = { head: [5, 0, 22, 22], body: [10, 18, 13, 10], legs: [10, 27, 13, 5], eyes: [11, 11, 14, 8] };
export function lookIcon(images, look, what) {
  const P = artParts(images, { art: { head: look.head, body: look.body, legs: look.legs }, tint: { hair: look.hair, eye: look.eye, top: look.top } });
  if (!P.head) return null;
  const [x, y, w, h] = ICON_BOX[what], [c, g] = makeCanvas(w, h);
  for (const k of what === 'legs' ? ['legL', 'legR'] : what === 'body' ? ['body'] : ['head']) g.drawImage(P[k], -x, -y);
  return c;
}

// ---- a look's own colours (the wardrobe) ----
const hslOf = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
};
const LINE = 14;   // (as dark as this: the black line round the art, left as it is)
const isLine = (p, i) => Math.max(p[i], p[i + 1], p[i + 2]) <= LINE;
// Pixels (indexes into their data) brought round to a colour: its hue, its saturation, and each one's own light
// moved by as much as the lot of them have to move - so the shading stays as it's drawn, only lighter or darker.
function retone(p, idx, to) {
  if (!idx.length) return;
  const [th, ts, tl] = hslOf(...rgbOf(to)), Ls = idx.map((i) => hslOf(p[i], p[i + 1], p[i + 2])[2]);
  const mean = Ls.reduce((a, b) => a + b, 0) / Ls.length;
  idx.forEach((i, n) => {
    const d = Ls[n] - mean;
    [p[i], p[i + 1], p[i + 2]] = rgbOf(hsl(th - d * 30, ts, Math.max(0.04, Math.min(0.97, tl + d * 1.1))));
  });
}
const EYE_AT = [[16, 16], [21, 16]];   // (the iris, under each eye's white - every head's eyes are where the blink is)
function tintLook(out, tint) {
  const at = (x, y) => (y * 32 + x) * 4;
  if (tint.hair) {
    // the hair: anything on the head that isn't the line, the eyes' whites and irises or the face's own skin (the
    // cheeks under the eyes give its tones)
    const hd = out.head.getContext('2d').getImageData(0, 0, 32, 32).data, skin = [];
    for (let x = 13; x <= 21; x++) for (const y of [17, 18]) { const i = at(x, y); if (hd[i + 3] && !isLine(hd, i)) skin.push([hd[i], hd[i + 1], hd[i + 2]]); }
    const skinny = (p, i) => skin.some(([r, g, b]) => (p[i] - r) ** 2 + (p[i + 1] - g) ** 2 + (p[i + 2] - b) ** 2 < 1600);
    for (const k of ['head', 'backHead']) {
      const g = out[k].getContext('2d'), d = g.getImageData(0, 0, 32, 32), p = d.data, idx = [];
      for (let i = 0; i < p.length; i += 4) {
        if (!p[i + 3] || isLine(p, i) || Math.min(p[i], p[i + 1], p[i + 2]) >= 235 || skinny(p, i)) continue;
        if (k === 'head' && EYE_AT.some(([x, y]) => i === at(x, y) || i === at(x, y - 1))) continue;
        idx.push(i);
      }
      retone(p, idx, tint.hair);
      g.putImageData(d, 0, 0);
    }
  }
  if (tint.eye) {
    const g = out.head.getContext('2d'), d = g.getImageData(0, 0, 32, 32), p = d.data;
    const [r, gg, b] = rgbOf(tint.eye);
    for (const [x, y] of EYE_AT) { const i = at(x, y); if (p[i + 3]) [p[i], p[i + 1], p[i + 2]] = [r, gg, b]; }
    g.putImageData(d, 0, 0);
  }
  if (tint.top) for (const k of ['body', 'backBody']) {
    // the top's main colour (the most of it, by hue - or near black, grey or near white, whatever its tinge): that,
    // not its trim or what's under it
    const g = out[k].getContext('2d'), d = g.getImageData(0, 0, 32, 32), p = d.data, bins = new Map();
    for (let i = 0; i < p.length; i += 4) {
      if (!p[i + 3] || isLine(p, i)) continue;
      const [h, s, l] = hslOf(p[i], p[i + 1], p[i + 2]), bin = l < 0.24 ? 'dark' : l > 0.82 ? 'light' : s < 0.18 ? 'grey' : Math.round(h / 30) % 12;
      if (!bins.has(bin)) bins.set(bin, []);
      bins.get(bin).push(i);
    }
    retone(p, [...bins.values()].sort((a, b) => b.length - a.length)[0] ?? [], tint.top);
    g.putImageData(d, 0, 0);
  }
}

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
