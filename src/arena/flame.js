// The flame fist skill's look: pixel fire - a flickering tongue of flame
// (white-hot at the heart, yellow, orange, red at the ragged edge) streaming
// off whatever's burning, a soft glow round it - and the burst where the
// punch lands.

import { palette, drawPixels } from './pixfx.js';

const HEAT = [
  [0.78, '#fffbe0'],
  [0.6, '#ffe066'],
  [0.42, '#ffa92a'],
  [0.26, '#ff6a1a'],
  [0.12, '#d8341a'],
  [0, '#7a1c12'],
];

// a hash 0..1 of three numbers (the flicker)
const hash = (a, b, c) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return v - Math.floor(v);
};

// A flame of radius r at (x, y), streaming toward (tx, ty) - straight up for
// something just burning, out behind for something moving fast. len: how far
// the tongue runs (in r). t: time; seed: so two flames don't flicker together.
export function drawFlame(ctx, x, y, r, t, seed = 0, tx = 0, ty = -1, len = 2.2) {
  if (r < 0.8) return;
  const cx = Math.round(x), cy = Math.round(y), L = r * len, box = Math.ceil(L + r + 1);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 3.4);
  gr.addColorStop(0, 'rgba(255, 150, 50, 0.5)');
  gr.addColorStop(0.45, 'rgba(255, 90, 20, 0.18)');
  gr.addColorStop(1, 'rgba(255, 60, 0, 0)');
  ctx.fillStyle = gr;
  ctx.fillRect(cx - r * 3.4, cy - r * 3.4, r * 6.8, r * 6.8);
  ctx.restore();
  const tick = Math.floor(t * 24);
  for (let j = -box; j <= box; j++) for (let i = -box; i <= box; i++) {
    const u = i * tx + j * ty, v = -i * ty + j * tx;   // along the stream, across it
    // a teardrop: round at the root, narrowing to a point down the stream
    const w = u < 0 ? Math.sqrt(Math.max(0, r * r - u * u)) : r * (1 - u / L);
    if (w <= 0.2) continue;
    // licking tongues: noise that runs down the stream, a wave across it
    const n = hash(Math.round(u - t * 26), Math.round(v * 0.8), seed + tick * 0.13);
    const wave = Math.sin(u * 0.7 - t * 16 + seed * 3 + v * 0.9) * 0.18;
    const heat = 1 - Math.abs(v) / w - Math.max(0, u) / L * 0.75 + (n - 0.5) * 0.55 + wave;
    if (heat <= 0.02) continue;
    let col = HEAT[HEAT.length - 1][1];
    for (const [h, c] of HEAT) if (heat >= h) { col = c; break; }
    ctx.fillStyle = col;
    ctx.fillRect(cx + i, cy + j, 1, 1);
  }
}

// Where the flame fist lands, all along the line of the punch: a great
// orange fireball round the fist, white-hot at its heart; white shock-waves
// curving out ahead of it like a bow wave; then a white burst bursting out
// past it - a star of jagged spikes, longest straight on - with white
// splinters flung out from it and streaks of speed running back along the
// line. k: 0 .. 1 over its life; (ax, ay): the way the punch went.
//
// It's pixel art like everything else (see pixfx.js): the fire's palette, so
// the fireball comes out in bands. Only the soft glow behind it is smooth.
const FIRE = palette(['#ffffff', '#fff4dc', '#ffe27a', '#ffc04a', '#ffa52a', '#f2661a', '#c8381a', '#7a1c12', '#ff8c7c', '#e8463a']);

export function drawBlast(ctx, x, y, k, t, seed, ax, ay) {
  drawPixels(ctx, x, y, 200, FIRE, (g) => paintBlast(ctx, g, Math.round(x), Math.round(y), k, seed, ax, ay));
}
function paintBlast(ctx, g, rx, ry, k, seed, ax, ay) {
  const rnd = (i, j) => hash(i, j, seed);
  const span = (a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));   // 0 .. 1 between k = a and b
  const ang = Math.atan2(ay, ax);
  g.rotate(ang);   // from here on, +x is the way the punch went
  // the glows, smooth, on the scene itself
  const glow = (gx, r, stops) => {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(rx, ry);
    ctx.rotate(ang);
    const gr = ctx.createRadialGradient(gx, 0, 0, gx, 0, r);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    ctx.fillStyle = gr;
    ctx.fillRect(gx - r, -r, r * 2, r * 2);
    ctx.restore();
  };

  // streaks of speed back along the line (solid, and going by getting shorter - a faded one would only dither into dots)
  const sl = 1 - span(0.05, 0.42);
  for (let i = 0; i < 7 && sl > 0; i++) {
    const oy = Math.round((rnd(i, 1) - 0.5) * 24), len = Math.round((55 + rnd(i, 2) * 60) * (0.3 + 0.7 * sl));
    g.fillStyle = i % 2 ? '#fff4dc' : '#ffa52a';
    g.fillRect(Math.round(6 + span(0, 0.42) * 26 - len), oy, len, i % 2 ? 0.5 : 1);   // (the white ones finer)
  }

  // the fireball round the fist: swells, holds, burns away (in bands, once it's snapped to the palette)
  const fb = k < 0.1 ? 0.75 + 2.5 * k : 1 - span(0.1, 0.5);
  if (fb > 0) {
    const R = 4 + 15 * fb, cx = -4;
    glow(cx, R * 2.6, [[0, `rgba(255, 150, 50, ${0.55 * fb})`], [1, 'rgba(255, 80, 0, 0)']]);
    const gr = g.createRadialGradient(cx + R * 0.35, 0, 0, cx, 0, R);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.28, '#ffe27a');
    gr.addColorStop(0.55, '#ffa52a');
    gr.addColorStop(0.8, '#f2661a');
    gr.addColorStop(0.93, '#c8381a');
    gr.addColorStop(1, 'rgba(200, 56, 26, 0)');
    g.globalAlpha = Math.min(1, fb * 1.4);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(cx, 0, R, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }

  // shock-waves: white crescents, bowed out ahead, running on and thinning out
  for (let i = 0; i < 3; i++) {
    const kk = span(i * 0.045, 0.34 + i * 0.05);
    if (kk <= 0 || kk >= 1) continue;
    const fade = 1 - kk, r = 11 + i * 5 + kk * 12;
    crescent(g, -10 + kk * 24 + i * 3, r, 1.05 - i * 0.12, 1.2 + 2.4 * fade, `rgba(255, 255, 255, ${0.95 * fade})`);
  }

  // the burst: a white star of jagged spikes, longest straight on
  const grow = span(0.05, 0.15), keep = 1 - span(0.2, 0.55);
  if (grow > 0 && keep > 0) {
    const sc = grow * (0.7 + 0.3 * keep), bx = 12;
    glow(bx, 46 * sc, [[0, `rgba(255, 245, 230, ${0.7 * keep})`], [0.5, `rgba(255, 150, 120, ${0.25 * keep})`], [1, 'rgba(255, 90, 60, 0)']]);
    // a solid white body with spikes off it: each spike's tip, then the notch between it and the next
    const N = 16, pts = [];
    for (let i = 0; i < N; i++) {
      const a = ((i + 0.5) / N) * Math.PI * 2 - Math.PI + (rnd(i, 4) - 0.5) * 0.2;
      const fwd = Math.max(0, Math.cos(a)), L = (12 + 34 * Math.pow(fwd, 2.5) + rnd(i, 5) * (3 + 12 * fwd)) * sc;
      pts.push([bx + Math.cos(a) * L, Math.sin(a) * L * 0.8]);
      const a2 = a + Math.PI / N, f2 = Math.max(0, Math.cos(a2)), l2 = (8 + 10 * f2) * sc;
      pts.push([bx + Math.cos(a2) * l2, Math.sin(a2) * l2 * 0.8]);
    }
    const shape = (scale) => {
      g.beginPath();
      pts.forEach(([px, py], i) => (i ? g.lineTo : g.moveTo).call(g, bx + (px - bx) * scale, py * scale));
      g.closePath();
    };
    g.globalAlpha = keep;
    shape(1);
    g.lineJoin = 'miter';
    g.strokeStyle = '#ff8c7c';
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = '#fff4dc';
    g.fill();
    shape(0.6);
    g.fillStyle = '#ffffff';
    g.fill();
    g.globalAlpha = 1;
  }

  // white splinters flung out of it
  const sk = span(0.07, 0.55);
  if (sk > 0 && sk < 1) for (let i = 0; i < 7; i++) {
    const a = (rnd(i, 6) < 0.5 ? -1 : 1) * (0.45 + rnd(i, 7) * 1.7), d = 12 + sk * (30 + rnd(i, 8) * 30);
    shard(g, 12 + Math.cos(a) * d, Math.sin(a) * d * 0.85, a, (9 + rnd(i, 9) * 6) * (1 - sk * 0.4), 1 - sk);
  }

}

// A crescent bowed toward +x: the arc of a circle of radius r centred at
// (cx - r, 0), `span` either side, `thick` at its middle and pointed at the ends.
function crescent(ctx, cx, r, span, thick, color) {
  const ox = cx - r;
  ctx.beginPath();
  ctx.arc(ox, 0, r, -span, span);
  ctx.arc(ox - thick, 0, r, span, -span, true);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// A splinter of white lightning at (x, y), pointing along a, length L - a red edge round it.
function shard(ctx, x, y, a, L, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  for (const [px, py] of [[0, 0], [L * 0.5, -2.4], [L * 0.42, -0.4], [L, 0], [L * 0.5, 2.4], [L * 0.58, 0.4]]) ctx.lineTo(px, py);
  ctx.closePath();
  ctx.strokeStyle = '#e8463a';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}
