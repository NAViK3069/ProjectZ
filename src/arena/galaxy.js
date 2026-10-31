// The galaxy skill's look, as pixel art (see pixfx.js): the magic circle it's
// cast with, then the black hole - in five flat colours, indigo, blue,
// violet, cyan and white, like the sprite it's drawn from. A glint, a
// four-pointed star with the hole opening in it, then the hole: a deep indigo
// sphere ringed by a thick, churning band of violet, blue and cyan streaks,
// a galaxy turning inside it, and a ragged blade of white light torn right
// through it, light being drawn in. When it goes it's a flash, then a
// whirlpool - the sphere wound up into thick spiral arms - with the blade
// shattering into shards that scatter and go out, and last a little ring of
// cyan at the heart with crescents of it spinning away.
//
// Each is drawn on `ctx`, its soft glow on `gl` (so the shapes can go on a
// layer of their own, under the fighters, and the glow straight on the scene).

import { palette, drawPixels, glowAt } from './pixfx.js';

const CIRCLE = palette(['#ffffff', '#c8fbff', '#7af0ff', '#5ab4ff', '#4a5aff', '#6a4aff', '#b67aff', '#3a1aa0']);
const C = { white: '#ffffff', cyan: '#66f0fd', violet: '#bd7afe', blue: '#4654eb', core: '#330294', deep: '#1e0866' };
const SPACE = palette(Object.values(C));
const SLASH_A = -0.42;   // the blade runs from low on the left to high on the right

const hash = (a, b, c) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
const span = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
const ease = (k) => 1 - Math.pow(1 - k, 3);

// ---------- the magic circle ----------
// An outer blue ring with eight diamond studs round it, turning one way; an
// inner cyan ring with eight small notches in it, turning the other. Opens
// out from nothing (k: 0 .. 1), and fades (alpha).
export function drawCircle(ctx, gl, x, y, R, k, t, alpha = 1) {
  const r = R * ease(Math.min(1, k * 1.6));
  if (r < 1) return;
  glowAt(gl, x, y, r * 1.7, [[0, `rgba(90, 160, 255, ${0.22 * alpha})`], [0.6, `rgba(110, 90, 255, ${0.12 * alpha})`], [1, 'rgba(80, 60, 255, 0)']]);
  drawPixels(ctx, x, y, Math.ceil(R * 2.6), CIRCLE, (g) => {
    g.globalAlpha = alpha;
    // the outer ring and its studs
    g.save();
    g.rotate(t * 0.7);
    g.strokeStyle = '#5ab4ff';
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 8; i++) {
      g.save();
      g.rotate((i / 8) * Math.PI * 2);
      g.beginPath();
      g.moveTo(r + 3.6, 0);
      g.lineTo(r, 2.6);
      g.lineTo(r - 2.6, 0);
      g.lineTo(r, -2.6);
      g.closePath();
      g.fillStyle = '#6a4aff';
      g.fill();
      g.strokeStyle = '#5ab4ff';
      g.lineWidth = 0.6;
      g.stroke();
      g.restore();
    }
    g.restore();
    // the inner ring, its notches between the studs
    const ri = r * 0.78;
    g.save();
    g.rotate(-t * 1.1 + Math.PI / 8);
    g.strokeStyle = '#7af0ff';
    g.lineWidth = 1.1;
    g.beginPath();
    g.arc(0, 0, ri, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#c8fbff';
    for (let i = 0; i < 8; i++) {
      g.save();
      g.rotate((i / 8) * Math.PI * 2);
      g.beginPath();
      g.moveTo(ri - 2.2, 0);
      g.lineTo(ri + 0.8, -1.6);
      g.lineTo(ri + 0.8, 1.6);
      g.closePath();
      g.fill();
      g.restore();
    }
    g.restore();
    // a faint third ring of dots inside, turning slowly
    g.fillStyle = '#4a5aff';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + t * 0.4;
      g.fillRect(Math.cos(a) * r * 0.55 - 0.5, Math.sin(a) * r * 0.55 - 0.5, 1, 1);
    }
  });
}

// ---------- the black hole ----------
// k: 0 .. 1 over its life (before the blast). R: the sphere's size (its rim reaches past it).
export function drawHole(ctx, gl, x, y, R, k, t, seed) {
  const s = ease(span(k, 0.1, 0.3)), r = R * (0.35 + 0.65 * s) * (1 + 0.03 * Math.sin(t * 9));   // the sphere opening in the star, then breathing
  const open = span(k, 0.08, 0.14);
  glowAt(gl, x, y, R * 2.8, [[0, `rgba(150, 100, 255, ${0.12 + 0.3 * open})`], [0.45, `rgba(90, 120, 255, ${0.14 * open})`], [1, 'rgba(60, 40, 255, 0)']]);
  drawPixels(ctx, x, y, Math.ceil(R * 4.6), SPACE, (g) => {
    // the star it starts as: a glint, then a four-pointed star the hole opens in, gone as it fills out
    const st = span(k, 0, 0.12) * (1 - span(k, 0.2, 0.32));
    if (st > 0) star(g, 4 + R * 1.5 * st, 0.4, st);
    if (open <= 0) return;
    // light drawn in: streaks of it spiralling down into the rim
    for (let i = 0; i < 22; i++) {
      const ph = (t * 0.8 + hash(i, 1, seed)) % 1, a = hash(i, 2, seed) * 6.28 + t * 1.6 + ph * 2.2, d = r * (1.1 + (1 - ph) * 1.6);
      g.strokeStyle = [C.cyan, C.violet, C.blue, C.white][i % 4];
      g.lineWidth = 0.8;
      g.globalAlpha = Math.sin(ph * Math.PI) * open;
      g.beginPath();
      g.arc(0, 0, d, a, a + 0.25 + 0.2 * ph);
      g.stroke();
    }
    g.globalAlpha = open;
    sphere(g, r, t, seed);
    blade(g, SLASH_A, r * 1.65, r * 0.17, 0, t, seed, [C.violet, C.cyan, C.white]);
    g.globalAlpha = 1;
  });
}

// the sphere: a churning rim of violet, blue and cyan round a deep indigo heart with a galaxy turning in it
function sphere(g, r, t, seed) {
  ragged(g, r * 1.14, r * 0.07, C.violet, t, seed, 1);
  ragged(g, r * 1.0, r * 0.05, C.blue, t, seed, 2);
  ragged(g, r * 0.74, r * 0.04, C.core, t, seed, 3);
  g.lineCap = 'round';
  // the galaxy's arms, inside: blue crescents turning
  for (let i = 0; i < 3; i++) {
    const a0 = t * 1.4 + i * 2.09;
    g.strokeStyle = C.blue;
    g.lineWidth = r * 0.09;
    g.beginPath();
    g.arc(0, 0, r * (0.48 + 0.08 * i), a0, a0 + 1.1);
    g.stroke();
  }
  // the rim, churning: streaks of every colour running round it at their own speeds
  for (let i = 0; i < 30; i++) {
    const rr = r * (0.76 + hash(i, 3, seed) * 0.36), a0 = hash(i, 4, seed) * 6.28 + t * (0.9 + hash(i, 5, seed) * 1.4);
    const pick = hash(i, 6, seed);
    g.strokeStyle = pick < 0.34 ? C.cyan : pick < 0.68 ? C.violet : pick < 0.92 ? C.blue : C.white;
    g.lineWidth = r * (0.05 + hash(i, 7, seed) * 0.07);
    g.beginPath();
    g.arc(0, 0, rr, a0, a0 + 0.35 + hash(i, 8, seed) * 0.9);
    g.stroke();
  }
  g.lineCap = 'butt';
}

// a disc of radius r whose edge is torn and flickering (by up to amp)
function ragged(g, r, amp, col, t, seed, layer) {
  const n = 44, tick = Math.floor(t * 12);
  g.fillStyle = col;
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, d = r + (hash(i, tick + layer * 31, seed) - 0.5) * 2 * amp + Math.sin(a * 3 + t * 4 + layer) * amp * 0.6;
    i ? g.lineTo(Math.cos(a) * d, Math.sin(a) * d) : g.moveTo(Math.cos(a) * d, Math.sin(a) * d);
  }
  g.closePath();
  g.fill();
}

// a four-pointed star (size: to its points), cyan with a white heart and a violet edge
function star(g, size, turn, k) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = turn + (i / 8) * Math.PI * 2, d = i % 2 ? size * 0.2 : size;
    pts.push([Math.cos(a) * d, Math.sin(a) * d]);
  }
  const path = (sc) => {
    g.beginPath();
    pts.forEach(([px, py], i) => (i ? g.lineTo(px * sc, py * sc) : g.moveTo(px * sc, py * sc)));
    g.closePath();
  };
  g.globalAlpha = Math.min(1, k * 2);
  path(1.18);
  g.fillStyle = C.violet;
  g.fill();
  path(1);
  g.fillStyle = C.cyan;
  g.fill();
  path(0.5);
  g.fillStyle = C.white;
  g.fill();
  g.globalAlpha = 1;
}

// The blade of light along angle a: `len` to each end, `w` half-across at its
// middle, tapering to points, its edges torn; layered in `cols` (outermost
// first). gap: how far its two halves have been pulled apart.
function blade(g, a, len, w, gap, t, seed, cols) {
  if (len < 1) return;
  g.save();
  g.rotate(a);
  const tick = Math.floor(t * 14), N = 13;
  for (const side of [-1, 1]) {
    cols.forEach((col, li) => {
      const ww = w * (1 + (cols.length - 1 - li) * 0.45);
      g.beginPath();
      for (let s = 0; s <= N; s++) {
        const u = s / N, e = w * 0.7 * (hash(s, tick + li * 7, seed + side) - 0.5);
        g.lineTo(side * (gap + u * len), -(ww * Math.pow(1 - u, 0.7) + e));
      }
      for (let s = N; s >= 0; s--) {
        const u = s / N, e = w * 0.7 * (hash(s + 40, tick + li * 7, seed + side) - 0.5);
        g.lineTo(side * (gap + u * len), ww * Math.pow(1 - u, 0.7) + e);
      }
      g.closePath();
      g.fillStyle = col;
      g.fill();
    });
  }
  g.restore();
}

// ---------- the blast ----------
// k: 0 .. 1 over the blast: a flash, the whirlpool, then the ring and the crescents.
export function drawBoom(ctx, gl, x, y, R, k, t, seed) {
  const flash = 1 - span(k, 0, 0.14);
  glowAt(gl, x, y, R * (3 + k * 2), [[0, `rgba(190, 170, 255, ${0.55 * flash + 0.18 * (1 - k)})`], [0.45, `rgba(90, 120, 255, ${0.2 * (1 - k)})`], [1, 'rgba(60, 40, 255, 0)']]);
  drawPixels(ctx, x, y, Math.ceil(R * 6), SPACE, (g) => {
    const whirl = span(k, 0.06, 0.55), after = span(k, 0.42, 1);
    if (k < 0.1) {
      // the flash: the sphere swelling, lit right up
      sphere(g, R * (1 + k), t, seed);
      g.globalAlpha = flash;
      g.fillStyle = C.cyan;
      g.beginPath();
      g.arc(0, 0, R * 0.74 * (1 + k), 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
    if (whirl > 0 && whirl < 1) {
      g.globalAlpha = 1 - span(k, 0.4, 0.55);
      whirlpool(g, R * (1 + 0.3 * whirl), whirl, t, seed);
      g.globalAlpha = 1;
    }
    if (after > 0 && after < 1) remains(g, R, after, t, seed);
    // the blade: whole for a blink, then shattered - shards of it flung every which way, spinning, going out
    if (k < 0.06) blade(g, SLASH_A, R * 1.7, R * 0.19, 0, t, seed, [C.violet, C.cyan, C.white]);
    else shards(g, R * 1.7, R * 0.17, span(k, 0.06, 1), t, seed);
  });
}

// The blade broken up: each piece of it (thicker toward its middle, as it
// was) thrown off - out along it and to either side - spinning, shrinking,
// cooling from white through cyan and violet to blue, and dithering away.
function shards(g, len, w, q, t, seed) {
  const N = 20, e = ease(q);
  g.save();
  g.rotate(SLASH_A);
  g.globalAlpha = 1 - span(q, 0.5, 1);
  const cols = q < 0.25 ? [C.cyan, C.white] : q < 0.5 ? [C.violet, C.cyan] : [C.blue, C.violet];
  for (let i = 0; i < N; i++) {
    const u = ((i + 0.5) / N) * 2 - 1, thick = w * Math.pow(1 - Math.abs(u), 0.7) + 0.8;
    const side = hash(i, 20, seed) < 0.5 ? -1 : 1;
    const x = u * len + u * (0.3 + hash(i, 21, seed) * 0.7) * e * len * 0.9;
    const y = side * (0.15 + hash(i, 22, seed) * 0.85) * e * len * 0.8;
    const size = (1 - 0.65 * q), L = (len / N) * (1.1 + hash(i, 25, seed) * 0.6) * size, h = thick * size;
    g.save();
    g.translate(x, y);
    g.rotate((hash(i, 23, seed) - 0.5) * 9 * e);
    const piece = (sc) => {
      g.beginPath();
      g.moveTo(-L * sc, (hash(i, 26, seed) - 0.5) * h * sc);
      g.lineTo(-L * 0.2 * sc, -h * sc);
      g.lineTo(L * sc, -h * 0.3 * sc);
      g.lineTo(L * 0.6 * sc, h * 0.8 * sc);
      g.lineTo(-L * 0.4 * sc, h * sc);
      g.closePath();
    };
    piece(1.35);
    g.fillStyle = cols[0];
    g.fill();
    piece(0.8);
    g.fillStyle = cols[1];
    g.fill();
    g.restore();
  }
  g.restore();
  g.globalAlpha = 1;
}

// the whirlpool: the sphere wound up - a churning mass of thick arms spiralling in, a deep heart with cyan crescents round it
function whirlpool(g, r, w, t, seed) {
  ragged(g, r * 1.12, r * 0.12, C.blue, t, seed, 4);
  ragged(g, r * 0.9, r * 0.1, C.deep, t, seed, 5);
  g.lineCap = 'round';
  const arms = [C.core, C.blue, C.violet, C.deep, C.blue, C.violet, C.core, C.blue, C.violet, C.deep];
  arms.forEach((col, i) => {
    const a0 = (i / arms.length) * Math.PI * 2 + t * 5 + w * 4;
    g.strokeStyle = col;
    g.lineWidth = r * (0.24 - 0.08 * w) * (0.7 + 0.3 * hash(i, 9, seed));
    g.beginPath();
    for (let s = 0; s <= 14; s++) {
      const u = s / 14, a = a0 + u * 2.4, d = r * (1.15 - 0.75 * u);
      s ? g.lineTo(Math.cos(a) * d, Math.sin(a) * d) : g.moveTo(Math.cos(a) * d, Math.sin(a) * d);
    }
    g.stroke();
  });
  g.fillStyle = C.core;
  g.beginPath();
  g.arc(0, 0, r * 0.42, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = C.cyan;
  g.lineWidth = r * 0.09;
  const a = t * 6;
  g.beginPath();
  g.arc(0, 0, r * 0.4, a, a + 2);
  g.stroke();
  g.beginPath();
  g.arc(0, 0, r * 0.3, a + Math.PI, a + Math.PI + 1.5);
  g.stroke();
  g.lineCap = 'butt';
}

// what's left: a small ring of cyan (violet flecks on it, indigo in it), and crescents spinning away and thinning out
function remains(g, r, q, t, seed) {
  g.globalAlpha = 1 - span(q, 0.5, 1);   // (solid till halfway, then dithering away)
  g.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const rr = r * (0.6 + hash(i, 10, seed) * 0.7) * (1 + q * 0.9), a0 = hash(i, 11, seed) * 6.28 + t * 3;
    g.strokeStyle = [C.deep, C.blue, C.core][i % 3];
    g.lineWidth = r * 0.17 * (1 - 0.4 * q);
    g.beginPath();
    g.arc(0, 0, rr, a0, a0 + 0.45 + hash(i, 12, seed) * 0.4);
    g.stroke();
  }
  g.lineCap = 'butt';
  const rr = r * 0.3 * (1 - 0.4 * q);
  g.fillStyle = C.core;
  g.beginPath();
  g.arc(0, 0, rr, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = C.cyan;
  g.lineWidth = r * 0.12;
  g.stroke();
  g.strokeStyle = C.violet;
  g.lineWidth = r * 0.07;
  for (let i = 0; i < 3; i++) {
    const a = t * 4 + i * 2.1;
    g.beginPath();
    g.arc(0, 0, rr + r * 0.06, a, a + 0.6);
    g.stroke();
  }
  g.globalAlpha = 1;
}
