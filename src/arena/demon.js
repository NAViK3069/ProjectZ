// The summon skill's look, as pixel art (see pixfx.js), in black and violet:
// the Abyss Golem - a hulk of black obsidian burning from inside with
// black-violet fire. An angular skull of a head with two horns swept back,
// eyes like white-hot slits and a maw glowing through its teeth, a crown of
// dark flame behind it; armour plates of rock across its chest, cracked, the
// fire showing violet through the cracks, a heart of it - a burning crystal -
// pulsing in the middle; great rock pauldrons with fire bursting off them;
// no legs: below the waist it's a whirlwind of dark fire spinning down to a
// point. Shards of obsidian orbit it; embers drift up off it. Its fists are
// apart from it - huge stone gauntlets, cracked and burning - floating at its
// sides, and it flings them at whoever's near. Also the circle it's called up
// out of, the fists' trails and the bursts where they land.

import { palette, drawPixels, glowAt } from './pixfx.js';

const P = {
  ink: '#0c0612', deep: '#1e0a33', dark: '#2e1052', plum: '#4a1c80', purple: '#6a22b0',
  violet: '#a24ef0', lilac: '#d49cff', pale: '#f4e6ff', white: '#ffffff',
};
const ABYSS = palette(Object.values(P));

const hash = (a, b, c) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
const span = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));

// a closed shape through pts, outlined in ink, filled
function shape(g, pts, fill, outline = 1.4) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  if (outline) {
    g.strokeStyle = P.ink;
    g.lineWidth = outline;
    g.lineJoin = 'round';
    g.stroke();
  }
  g.fillStyle = fill;
  g.fill();
}
// a jagged line through pts (a crack, an edge)
function line(g, pts, col, w) {
  g.strokeStyle = col;
  g.lineWidth = w;
  g.lineJoin = 'miter';
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
}

// smooth noise (0..1): values at whole-number points (a cheap integer hash), eased between them
const smooth = (v) => v * v * (3 - 2 * v);
const ihash = (x, y) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), u = smooth(x - xi), v = smooth(y - yi);
  const a = ihash(xi, yi), b = ihash(xi + 1, yi), c = ihash(xi, yi + 1), d = ihash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// how hot the fire is, and the colour it shows at that heat
const HEAT = [[0.82, P.pale], [0.64, P.lilac], [0.46, P.violet], [0.3, P.purple], [0.16, P.dark], [0.06, P.ink]];

// A flame of black-violet fire from a base at (x, y), h tall and w wide at its
// root, leaning by `lean` (its top that far over per unit of height). Worked
// out pixel by pixel (at the effect's fine pixels, each square on the grid):
// a flame shape - round at the root, narrowing up to a point - its heat
// broken up by noise rising up through it, so it licks and flickers, tears at
// its edges and throws off flakes off the top; coloured by heat, white at the
// heart out through lilac, violet and purple to a smoky black edge.
function tongue(g, x, y, w, h, t, seed, lean = 0) {
  const step = 0.5, hw = w / 2, rise = t * 6, sd = (seed * 13.7) % 97;
  const bx = Math.round(x / step) * step, by = Math.round(y / step) * step;
  const top = Math.floor((-h * 1.25) / step) * step;
  for (let py = top; py <= hw; py += step) {
    const u = -py / h;   // 0 at the root .. 1 at the top
    const half = u < 0 ? Math.sqrt(Math.max(0, hw * hw - py * py)) : hw * Math.pow(Math.max(0, 1 - u), 0.5);
    // the higher up, the more it sways from side to side - licking
    const sway = Math.sin(-py * 0.3 + t * 7 + sd) * Math.max(0, u) * hw * 0.55;
    const mid = lean * Math.max(0, -py) + sway, reach = half + 3;
    const x0 = Math.floor((mid - reach) / step) * step, x1 = mid + reach;
    for (let px = x0; px <= x1; px += step) {
      const sx = px - mid;   // (straightened out)
      const n = noise(sx * 0.24 + sd, py * 0.16 + rise + sd);
      // (the noise tears at it more toward the top: flakes come off it)
      const heat = 1.15 - Math.abs(sx) / (half + 1.2) - Math.max(0, u) * 0.45 + (n - 0.5) * (0.7 + 0.9 * Math.max(0, u));
      if (heat <= 0.06) continue;
      let col = P.ink;
      for (const [hh, c] of HEAT) if (heat >= hh) { col = c; break; }
      g.fillStyle = col;
      g.fillRect(bx + px, by + py, step, step);
    }
  }
}
// embers drifting up and going out
function embers(g, x, y, spread, n, t, seed) {
  for (let i = 0; i < n; i++) {
    const ph = (t * 0.7 + hash(i, 1, seed)) % 1, px = x + (hash(i, 2, seed) - 0.5) * spread + Math.sin(t * 3 + i) * 2.5, py = y - ph * 22;
    g.globalAlpha = 1 - ph;
    g.fillStyle = [P.violet, P.lilac, P.purple][i % 3];
    g.fillRect(px - 0.75, py - 0.75, 1.5, 1.5);
  }
  g.globalAlpha = 1;
}
// a shard of obsidian, a crack of fire across it
function shard(g, x, y, s, rot) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  shape(g, [[-s, -s * 0.4], [0, -s], [s * 0.9, -s * 0.1], [s * 0.3, s * 0.9], [-s * 0.7, s * 0.6]], P.dark, 1);
  line(g, [[-s * 0.5, -s * 0.5], [0, -s * 0.8], [s * 0.6, -s * 0.2]], P.plum, 0.8);
  line(g, [[-s * 0.3, s * 0.2], [s * 0.2, 0]], P.violet, 0.7);
  g.restore();
}

// ---------- the golem ----------
// Drawn facing right with (0, 0) at its chest; t: time (it bobs, burns, spins).
function body(g, t, seed) {
  const pulse = 0.5 + 0.5 * Math.sin(t * 4.2);
  const crack = pulse > 0.55 ? P.lilac : P.violet;
  // the shards in orbit: the ones round the back first
  const orbit = [];
  for (let i = 0; i < 6; i++) {
    const a = t * 1.1 + (i / 6) * Math.PI * 2;
    orbit.push({ x: Math.cos(a) * 25, y: -3 + Math.sin(a) * 7 + Math.sin(t * 2 + i) * 1.5, back: Math.sin(a) < 0, s: 1.6 + hash(i, 5, seed) * 1.4, rot: t * 2 + i });
  }
  for (const o of orbit) if (o.back) shard(g, o.x, o.y, o.s, o.rot);

  // its mane of fire, behind its head, and the fire off the far shoulder
  mane(g, t, seed);
  tongue(g, -14, -15, 15, 19, t, seed + 4, -0.3);

  // below the waist: a tornado of dark fire, spinning down to a point
  tornado(g, t, seed);

  // the torso: armour plates of rock, cracked, the fire showing through
  shape(g, [[-13, -8], [-9, -13], [-3, -14], [4, -14], [10, -13], [14, -8], [12, -1], [8, 5], [-8, 5], [-12, -1]], P.deep, 1.6);
  shape(g, [[-11, -9], [-3, -12], [-1, -5], [-7, -2], [-11, -4]], P.dark, 0.9);
  shape(g, [[1, -12], [10, -10], [12, -5], [7, -2], [2, -5]], P.dark, 0.9);
  for (const [x, y, w] of [[-7, 0, 6], [1, 0, 6], [-6, 3, 5], [1, 3, 5]]) shape(g, [[x, y], [x + w, y], [x + w - 0.5, y + 2], [x + 0.5, y + 2]], P.dark, 0.7);
  line(g, [[-11, -9], [-3, -12]], P.plum, 0.9);
  line(g, [[1, -12], [10, -10]], P.plum, 0.9);
  line(g, [[0, -4], [-3, -7], [-5, -6], [-8, -9]], crack, 0.9);
  line(g, [[0, -4], [4, -6], [6, -5], [9, -8]], crack, 0.9);
  line(g, [[0, -2], [-1, 1], [1, 3], [0, 5]], crack, 0.8);
  line(g, [[-10, -3], [-11, 0], [-9, 2]], P.violet, 0.7);
  // the heart: a crystal of white-hot fire, pulsing
  const hs = 2.6 + pulse * 0.8;
  shape(g, [[0, -4 - hs * 1.3], [hs, -4], [0, -4 + hs * 1.3], [-hs, -4]], P.violet, 1.2);
  shape(g, [[0, -4 - hs * 0.8], [hs * 0.55, -4], [0, -4 + hs * 0.8], [-hs * 0.55, -4]], pulse > 0.5 ? P.white : P.pale, 0);

  // the pauldrons, fire bursting off them
  for (const side of [-1, 1]) {
    const k = side < 0 ? 1.15 : 1;
    shape(g, [[side * 7, -14], [side * 12, -17.5 * k], [side * 18 * k, -15], [side * 19.5 * k, -9], [side * 16, -5], [side * 9, -8]], P.dark, 1.5);
    line(g, [[side * 8, -14], [side * 12, -17 * k], [side * 17 * k, -15]], P.plum, 1);
    line(g, [[side * 11, -12], [side * 14, -10], [side * 16, -11]], crack, 0.8);
  }
  tongue(g, 15, -15, 10, 12, t, seed + 5, 0.3);

  // the head: an angular skull, horns swept back
  line(g, [[-2, -25], [-6, -30], [-11, -32], [-14, -36]], P.ink, 3.4);
  line(g, [[-2, -25], [-6, -30], [-11, -32], [-14, -36]], P.dark, 2);
  line(g, [[-10, -32], [-14, -36]], P.violet, 1);
  line(g, [[3, -26], [1, -31], [-3, -35], [-5, -39]], P.ink, 3.4);
  line(g, [[3, -26], [1, -31], [-3, -35], [-5, -39]], P.dark, 2);
  line(g, [[-3, -35], [-5, -39]], P.violet, 1);
  shape(g, [[-5, -19], [-4, -25], [0, -27.5], [5, -26.5], [8.5, -22], [9.5, -18], [7.5, -14.5], [2, -13.5], [-3, -15]], P.dark, 1.6);
  line(g, [[-4, -24], [0, -27], [5, -26]], P.plum, 0.9);
  shape(g, [[-1, -22.5], [9, -22.5], [9.5, -20.5], [-1, -20.5]], P.ink, 0);   // the brow's shadow
  // the eyes: white-hot slits in a violet haze
  for (const ex of [1.5, 5.8]) {
    shape(g, [[ex - 1, -21], [ex + 2.8, -21.8], [ex + 2.4, -20.2], [ex - 0.6, -19.8]], P.violet, 0);
    shape(g, [[ex - 0.3, -20.8], [ex + 2.2, -21.3], [ex + 1.9, -20.4], [ex, -20.2]], P.white, 0);
  }
  // the maw, glowing through its teeth
  shape(g, [[0.5, -17.5], [8.5, -17.8], [7.5, -15.2], [1.5, -15]], P.purple, 0);
  g.fillStyle = P.lilac;
  for (let i = 0; i < 4; i++) g.fillRect(1.5 + i * 1.8, -17.3, 0.9, 1.2 + (i % 2) * 0.6);
  g.fillStyle = P.pale;
  g.fillRect(2, -16, 5.5, 0.6);

  // the front shards, and embers rising off it all
  for (const o of orbit) if (!o.back) shard(g, o.x, o.y, o.s, o.rot);
  embers(g, -2, -30, 30, 9, t, seed);
}

// Its mane: one great mass of fire growing out of the whole top of its head
// like hair, rising - leaning back only a little - swaying as it goes, and splitting
// toward the top into licking strands - all one fire (worked out pixel by
// pixel like the flames), white at its roots, smoky black at its edges.
function mane(g, t, seed) {
  const step = 0.5, sd = (seed * 5.3) % 71, H = 30, root = -21, W = 11;
  for (let py = Math.floor((root - H * 1.2) * 2) / 2; py <= root + W * 0.6; py += step) {
    const up = root - py, u = Math.max(0, up / H);   // 0 at the scalp .. 1 at the top
    // the line it rises along: up, leaning back a little, swaying
    const c = 1 - Math.max(0, up) * (0.08 + 0.18 * u) + Math.sin(py * 0.2 + t * 3) * 2 * u;
    const half = up < 0 ? Math.sqrt(Math.max(0, W * W - up * up * 2.8)) : W * Math.pow(Math.max(0, 1 - u), 0.55) + 0.8;
    const x0 = Math.floor((c - half - 4) * 2) / 2;
    for (let px = x0; px <= c + half + 4; px += step) {
      const dx = px - c;
      const strands = Math.sin(dx * 0.75 + sd + Math.sin(py * 0.18 + t * 5) * 1.4);   // (parting into strands up top)
      const n = noise(px * 0.3 + sd, py * 0.18 + t * 6 + sd);
      const heat = 1.25 - Math.abs(dx) / (half + 1.4) - u * 0.38 + (n - 0.5) * (0.6 + 0.7 * u) + strands * 0.3 * u;
      if (heat <= 0.06) continue;
      let col = P.ink;
      for (const [hh, cc] of HEAT) if (heat >= hh) { col = cc; break; }
      g.fillStyle = col;
      g.fillRect(px, py, step, step);
    }
  }
}

// The tornado it has for legs: a funnel of black-violet fire narrowing to a
// point, the point whipping from side to side; worked out pixel by pixel like
// the flames - bands of heat spiralling round it (racing across it on the
// slant, so it turns), its edges torn and licking, white-hot down its middle,
// smoky black at its rim - and sparks swept round and round it, in front of it
// and behind.
function tornado(g, t, seed) {
  const step = 0.5, top = 2, bottom = 36;
  const sparks = [];
  for (let i = 0; i < 12; i++) {
    const v = (i / 12 + t * 0.35) % 1, a = t * 7 + i * 2.39, y = top + 2 + v * (bottom - top - 6);
    const r = 13 * Math.pow(1 - (y - top) / (bottom - top), 0.85) + 3;
    sparks.push({ x: Math.cos(a) * r + Math.sin(y * 0.22 - t * 3) * 3 * v, y, front: Math.sin(a) > 0, c: i % 3 ? P.violet : P.lilac });
  }
  const dot = (sp) => { g.fillStyle = sp.c; g.fillRect(Math.round(sp.x * 2) / 2 - 0.5, Math.round(sp.y * 2) / 2 - 0.5, 1, 1); };
  for (const sp of sparks) if (!sp.front) dot(sp);
  for (let py = top; py <= bottom; py += step) {
    const v = (py - top) / (bottom - top);   // 0 at the waist .. 1 at the point
    const r = 13 * Math.pow(1 - v, 0.85) + 0.8;
    const cx = Math.sin(py * 0.22 - t * 3) * 3 * v;   // (the point whipping about)
    const x0 = Math.floor((cx - r - 3) / step) * step;
    for (let px = x0; px <= cx + r + 3; px += step) {
      const sx = (px - cx) / r;   // -1 .. 1 across it
      if (Math.abs(sx) > 1.35) continue;
      const round = Math.asin(Math.max(-1, Math.min(1, sx)));   // how far round it, seen from the front
      const band = Math.sin(round * 2.2 + py * 0.75 - t * 16 + seed);   // the bands spiralling round
      const n = noise(px * 0.35 + seed, py * 0.3 - t * 6);
      const edge = 1 - Math.abs(sx);
      // dark fire with bright bands winding round it - sharpened, so they show as streaks
      const streak = Math.max(0, band) ** 2;
      const heat = 0.1 + edge * 0.42 + streak * 0.5 * (0.3 + edge) + (n - 0.5) * 0.5 - v * 0.08;
      if (heat <= 0.06) continue;
      let col = P.ink;
      for (const [hh, c] of HEAT) if (heat >= hh) { col = c; break; }
      if (band > 0.94 && edge > 0.2 && n > 0.35) col = P.pale;   // a white-hot line along the crest of each band
      g.fillStyle = col;
      g.fillRect(px, py, step, step);
    }
  }
  for (const sp of sparks) if (sp.front) dot(sp);
}

// a gauntlet: a great stone fist, knuckles to the right, cracked and burning
// (the fire's worked out on the pixel grid: the fist goes on it too; `fire` false leaves it off -
// a turned fist can't have it, turned it'd fall between the pixels)
function fist(g, x, y, t, seed, fire = true) {
  g.save();
  g.translate(Math.round(x * 2) / 2, Math.round(y * 2) / 2);
  if (fire) tongue(g, -3, 1, 12, 13, t, seed + 7, -0.2);
  shape(g, [[-6, -4.5], [1, -6.5], [6.5, -4.5], [7.5, 2], [3.5, 5.5], [-5.5, 4.5]], P.dark, 1.5);
  shape(g, [[-7.5, -3], [-5, -5], [-4, 4], [-7, 3]], P.deep, 1);   // the cuff
  for (const yy of [-4, -1, 2]) shape(g, [[3.5, yy], [7, yy + 0.3], [7, yy + 2.2], [3.5, yy + 2.2]], P.plum, 0.6);
  line(g, [[-3, -4], [-1, -1], [-3, 2]], P.violet, 0.8);
  g.fillStyle = P.lilac;
  g.fillRect(-6.6, -0.6, 1.2, 1.2);   // a rune on the cuff
  g.restore();
}

// The golem at (x, y) (its chest), facing (1 / -1); `rest`: where its fists at
// its side are, relative to it (any out punching are drawn by drawFist);
// reveal 0 .. 1: risen out of the floor up to there (dithered in), alpha:
// going out. Drawn on ctx, its glow on gl. It moves like pixel art does - its
// picture worked out 20 times a second (kept in `cache` in between), not every frame.
export function drawDemon(ctx, gl, x, y, facing, t, seed, rest, reveal = 1, alpha = 1, cache = null) {
  const k = alpha * reveal;
  glowAt(gl, x, y - 8, 72, [[0, `rgba(150, 70, 255, ${0.3 * k})`], [0.5, `rgba(110, 40, 220, ${0.12 * k})`], [1, 'rgba(80, 20, 200, 0)']]);
  t = Math.floor(t * 20) / 20;
  const key = [t, facing, reveal.toFixed(2), alpha.toFixed(2), ...rest.map((r) => `${Math.round(r.x * 2)},${Math.round(r.y * 2)}`)].join('|');
  drawPixels(ctx, x, y, 124, ABYSS, (g) => {
    g.save();
    g.scale(facing, 1);
    body(g, t, seed);
    for (const r of rest) fist(g, r.x * facing, r.y, t, seed + r.side * 3);
    g.restore();
    if (reveal < 1 || alpha < 1) {
      // rising out of the floor: everything above the line not there yet (soft-edged, so it dithers in)
      g.globalCompositeOperation = 'destination-in';
      const lineY = 36 - reveal * 82, gr = g.createLinearGradient(0, lineY - 8, 0, lineY + 4);
      gr.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gr.addColorStop(1, `rgba(0, 0, 0, ${alpha})`);
      g.fillStyle = gr;
      g.fillRect(-62, -62, 124, 124);
      g.globalCompositeOperation = 'source-over';
    }
  }, cache, key);
}

// A fist out on its own, flying at someone: the gauntlet, and a trail of dark
// fire streaming back from it along (vx, vy) - solid blobs (a faded one would
// only dither into dots), shrinking away.
export function drawFist(ctx, gl, x, y, vx, vy, t, seed, trail = 7) {
  const sp = Math.hypot(vx, vy) || 1, ux = vx / sp, uy = vy / sp;
  glowAt(gl, x, y, 30, [[0, 'rgba(170, 90, 255, 0.35)'], [1, 'rgba(100, 30, 220, 0)']]);
  drawPixels(ctx, x, y, 76, ABYSS, (g) => {
    for (let i = trail; i >= 1; i--) {
      const d = i * 4.2, r = 5.2 - i * 0.6, wx = Math.sin(t * 20 + i) * 0.9, wy = Math.cos(t * 17 + i) * 0.9;
      for (const [s, col] of [[1.2, P.ink], [1, i > 4 ? P.dark : P.purple], [0.55, i > 4 ? P.plum : P.violet], [0.25, P.lilac]]) {
        if (s < 0.3 && i > 3) continue;
        g.fillStyle = col;
        g.beginPath();
        g.arc(-ux * d + wx, -uy * d + wy, r * s, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.save();
    g.rotate(Math.atan2(uy, ux));
    fist(g, 0, 0, t, seed, false);   // (its fire's the trail)
    g.restore();
  });
}

// ---------- the summoning circle ----------
// Lying flat on the floor at (x, y): two rings, a five-pointed star in them,
// a ring of runes, turning; dark light rising off it. k: 0 .. 1 opening; alpha: fading.
export function drawSummonCircle(ctx, gl, x, y, k, t, alpha = 1) {
  const R = 22 * (1 - Math.pow(1 - Math.min(1, k * 1.5), 3));
  if (R < 1) return;
  gl.save();
  gl.globalCompositeOperation = 'lighter';
  const gr = gl.createLinearGradient(0, y - 64, 0, y);
  gr.addColorStop(0, 'rgba(140, 60, 255, 0)');
  gr.addColorStop(1, `rgba(140, 60, 255, ${0.38 * alpha})`);
  gl.fillStyle = gr;
  gl.fillRect(x - R, y - 64, R * 2, 64);
  gl.restore();
  glowAt(gl, x, y, R * 1.6, [[0, `rgba(160, 70, 255, ${0.32 * alpha})`], [1, 'rgba(100, 30, 255, 0)']]);
  drawPixels(ctx, x, y, 70, ABYSS, (g) => {
    g.globalAlpha = alpha;
    g.scale(1, 0.32);   // (lying flat)
    g.rotate(t * 0.8);
    g.strokeStyle = P.purple;
    g.lineWidth = 2.4;
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = P.lilac;
    g.lineWidth = 1.3;
    g.beginPath();
    g.arc(0, 0, R * 0.8, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = P.violet;
    g.lineWidth = 1.6;
    g.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * (Math.PI * 2)) / 5;
      i ? g.lineTo(Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8) : g.moveTo(Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8);
    }
    g.stroke();
    g.fillStyle = P.pale;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.fillRect(Math.cos(a) * R * 0.9 - 1, Math.sin(a) * R * 0.9 - 1, 2, 2);
    }
  });
}

// ---------- where a fist lands ----------
// The blow, all along the line it was thrown (ax, ay): a white flash bursting
// into a star of spikes - longest straight on - edged violet; shock-waves
// bowing out ahead of it; a ball of black-violet fire (worked out pixel by
// pixel like the flames) swelling and burning out; a dark ring spreading;
// lines of force shooting out round it; chunks of obsidian knocked flying.
// k: 0 .. 1 over its life.
export function drawPunch(ctx, gl, x, y, k, t, seed, ax = 1, ay = 0) {
  const e = 1 - Math.pow(1 - k, 3), flash = 1 - span(k, 0, 0.2), ang = Math.atan2(ay, ax);
  glowAt(gl, x, y, 56, [[0, `rgba(200, 150, 255, ${0.6 * flash + 0.2 * (1 - k)})`], [0.5, `rgba(130, 60, 255, ${0.2 * (1 - k)})`], [1, 'rgba(90, 30, 220, 0)']]);
  drawPixels(ctx, x, y, 110, ABYSS, (g) => {
    // the ball of dark fire (straight up: fire on the pixel grid can't be turned)
    const fb = k < 0.15 ? 0.6 + k / 0.15 * 0.4 : 1 - span(k, 0.15, 0.85);
    if (fb > 0) fireball(g, ax * 4, ay * 4, 6 + 11 * fb, t, seed, fb);

    g.save();
    g.rotate(ang);   // from here on, +x is the way the blow went
    // the dark ring
    g.globalAlpha = 1 - span(k, 0.4, 1);
    g.strokeStyle = P.ink;
    g.lineWidth = 3 * (1 - k) + 1;
    g.beginPath();
    g.ellipse(0, 0, 6 + e * 26, (6 + e * 26) * 0.8, 0, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = P.violet;
    g.lineWidth = 1.2 * (1 - k) + 0.5;
    g.stroke();
    g.globalAlpha = 1;
    // lines of force shooting out
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + hash(i, 4, seed) * 0.5, fwd = Math.max(0, Math.cos(a));
      const d0 = 8 + e * (16 + fwd * 18), len = (6 + fwd * 10) * (1 - k);
      if (len < 1) continue;
      g.strokeStyle = i % 2 ? P.lilac : P.pale;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(Math.cos(a) * d0, Math.sin(a) * d0);
      g.lineTo(Math.cos(a) * (d0 + len), Math.sin(a) * (d0 + len));
      g.stroke();
    }
    // shock-waves bowing out ahead
    for (let i = 0; i < 2; i++) {
      const kk = span(k, i * 0.06, 0.45 + i * 0.08);
      if (kk <= 0 || kk >= 1) continue;
      const r = 9 + i * 5 + kk * 14, cx = 2 + kk * 18 + i * 3, w = (1 - kk) * 2.6 + 0.6, sp = 0.95 - i * 0.12;
      g.fillStyle = i ? P.lilac : P.pale;
      g.beginPath();
      g.arc(cx - r, 0, r, -sp, sp);
      g.arc(cx - r - w, 0, r, sp, -sp, true);
      g.closePath();
      g.fill();
    }
    // the flash: a white star of spikes, longest straight on, edged violet
    const grow = span(k, 0, 0.1), keep = 1 - span(k, 0.12, 0.45);
    if (grow > 0 && keep > 0) {
      const sc = grow * (0.6 + 0.4 * keep), pts = [], N = 14;
      for (let i = 0; i < N; i++) {
        const a = ((i + 0.5) / N) * Math.PI * 2 - Math.PI + (hash(i, 5, seed) - 0.5) * 0.25, fwd = Math.max(0, Math.cos(a));
        const L = (9 + 26 * Math.pow(fwd, 2.2) + hash(i, 6, seed) * 6) * sc, a2 = a + Math.PI / N, l2 = (5 + 5 * Math.max(0, Math.cos(a2))) * sc;
        pts.push([4 + Math.cos(a) * L, Math.sin(a) * L * 0.8], [4 + Math.cos(a2) * l2, Math.sin(a2) * l2 * 0.8]);
      }
      const star = (s2) => {
        g.beginPath();
        pts.forEach(([px, py], i) => (i ? g.lineTo(4 + (px - 4) * s2, py * s2) : g.moveTo(4 + (px - 4) * s2, py * s2)));
        g.closePath();
      };
      star(1.15);
      g.fillStyle = P.violet;
      g.fill();
      star(1);
      g.fillStyle = P.pale;
      g.fill();
      star(0.55);
      g.fillStyle = P.white;
      g.fill();
    }
    g.restore();
    // chunks of obsidian knocked flying, mostly on along the blow
    for (let i = 0; i < 8; i++) {
      const a = ang + (hash(i, 2, seed) - 0.5) * 2.4, d = 6 + e * (22 + hash(i, 3, seed) * 18);
      shard(g, Math.cos(a) * d, Math.sin(a) * d + e * e * 6, (1.2 + hash(i, 7, seed)) * (1 - k * 0.5), a + t * 9 + i);
    }
  });
}

// A ball of black-violet fire at (x, y), radius r, burning (`life` 1 .. 0 as it
// gutters out): worked out pixel by pixel, its heat broken up by noise rising
// through it, white at the heart, licking up off its top.
function fireball(g, x, y, r, t, seed, life) {
  const step = 0.5, sd = (seed * 7.1) % 89;
  const bx = Math.round(x * 2) / 2, by = Math.round(y * 2) / 2;
  for (let py = -r * 1.7; py <= r * 1.1; py += step) {
    for (let px = -r * 1.2; px <= r * 1.2; px += step) {
      const up = Math.max(0, -py) / (r * 1.7);   // the top licks up
      const d = Math.hypot(px, py * (py < 0 ? 0.6 : 1)) / r;
      const n = noise(px * 0.35 + sd, py * 0.3 + t * 8 + sd);
      const heat = (1.1 - d) * (0.6 + 0.6 * life) + (n - 0.5) * (0.6 + up) - up * 0.4;
      if (heat <= 0.06) continue;
      let col = P.ink;
      for (const [hh, c] of HEAT) if (heat >= hh) { col = c; break; }
      g.fillStyle = col;
      g.fillRect(bx + Math.round(px * 2) / 2, by + Math.round(py * 2) / 2, step, step);
    }
  }
}
