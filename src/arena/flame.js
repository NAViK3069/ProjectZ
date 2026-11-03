// The flame fist skill's look: pixel fire - a flickering tongue of flame
// (white-hot at the heart, yellow, orange, red at the ragged edge) streaming
// off whatever's burning, a soft glow round it - and the burst where the
// punch lands.

import { palette, drawPixels, pixArc, pixLine, glowAt } from './pixfx.js';

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

// ---------- the flame fist, grander ----------
const lit = (ctx, fn) => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; fn(); ctx.restore(); };
const F = { white: '#fffbe0', yellow: '#ffe066', orange: '#ffa92a', deep: '#ff6a1a', red: '#d8341a', ember: '#ffd27a' };

// Charging, round the body at (x, feet y), k 0..1: two ribbons of fire spiralling up round you, turning; a ring of heat
// at the feet with cracks of fire running out from it; embers rising; and round the fist at (fx, fy) a turning ring of
// flame, tightening.
export function drawFireSwirl(ctx, x, y, fx, fy, k, t, seed) {
  glowAt(ctx, x, y - 12, 28 + 20 * k, [[0, `rgba(255, 130, 40, ${0.15 + 0.25 * k})`], [1, 'rgba(255, 70, 0, 0)']]);
  lit(ctx, () => {
    // the ribbons, up and round
    for (let r = 0; r < 2; r++) for (let i = 0; i < 40; i++) {
      const u = i / 40, a = u * Math.PI * 4 + t * (7 + 3 * k) + r * Math.PI, R = (9 + 6 * k) * (1 - u * 0.35);
      const px = x + Math.cos(a) * R, py = y - u * (30 + 10 * k) + Math.sin(a) * R * 0.25, front = Math.sin(a) > 0;
      if (hash(i, r, Math.floor(t * 20)) > 0.45 + 0.5 * k) continue;
      ctx.globalAlpha = (front ? 0.9 : 0.4) * (1 - u * 0.6) * (0.3 + 0.7 * k);
      ctx.fillStyle = u < 0.3 ? F.yellow : u < 0.65 ? F.orange : F.red;
      ctx.fillRect(Math.round(px), Math.round(py), 1, front ? 2 : 1);
    }
    // the ring of heat at the feet, and cracks of fire out from it
    ctx.globalAlpha = 0.4 + 0.5 * k;
    ctx.fillStyle = F.orange;
    pixArc(ctx, x, y - 1, 10 + 12 * k, 2 + 2 * k, 0, t * 3, t * 3 + Math.PI * 1.6);
    ctx.fillStyle = F.yellow;
    pixArc(ctx, x, y - 1, 7 + 8 * k, 1.5 + 1.5 * k, 0, -t * 4, -t * 4 + Math.PI);
    for (let i = 0; i < 6; i++) {
      const dir = i % 2 ? 1 : -1, L = (6 + hash(i, 4, seed) * 14) * k;
      for (let s = 0; s < L; s++) { ctx.globalAlpha = (1 - s / L) * k; ctx.fillStyle = s < 3 ? F.yellow : F.deep; ctx.fillRect(Math.round(x + dir * (8 + s + i)), Math.round(y - (hash(i, s, seed) > 0.7 ? 1 : 0)), 1, 1); }
    }
    // embers rising
    for (let i = 0; i < 10 + 16 * k; i++) {
      const ph = (t * (1 + hash(i, 1, seed)) + hash(i, 2, seed)) % 1;
      ctx.globalAlpha = (1 - ph) * (0.4 + 0.6 * k);
      ctx.fillStyle = hash(i, 3, seed) > 0.5 ? F.ember : F.orange;
      ctx.fillRect(Math.round(x + (hash(i, 5, seed) - 0.5) * 30 + Math.sin(t * 4 + i) * 2), Math.round(y - 2 - ph * 46), 1, 1);
    }
    // round the fist: a ring of flame, turning, tightening
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + t * 12, R = 9 - 4 * k + Math.sin(t * 20 + i) * 0.6;
      ctx.globalAlpha = 0.5 + 0.5 * k;
      ctx.fillStyle = i % 4 === 0 ? F.white : i % 2 ? F.yellow : F.orange;
      ctx.fillRect(Math.round(fx + Math.cos(a) * R), Math.round(fy + Math.sin(a) * R), 1, 1);
    }
    ctx.globalAlpha = 1;
  });
}
// Off: a ring of fire thrown out where the dash starts, at (x, y), k 0..1.
export function drawFireGo(ctx, x, y, a, k) {
  if (k >= 1) return;
  lit(ctx, () => {
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = k < 0.3 ? F.white : F.orange;
    pixArc(ctx, x, y, 6 + 26 * k, 10 + 30 * k, a, 0, Math.PI * 2);
    ctx.fillStyle = F.red;
    pixArc(ctx, x, y, 4 + 18 * k, 7 + 20 * k, a, 0, Math.PI * 2);
    ctx.globalAlpha = 1;
  });
}
// Behind the dash: a helix of fire wound round the way it went (pts: newest first; a: the way it's going).
export function drawFireHelix(ctx, pts, a, t, seed) {
  if (!pts || pts.length < 2) return;
  const nx = -Math.sin(a), ny = Math.cos(a);
  lit(ctx, () => {
    let n = 0;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i], d = Math.hypot(q.x - p.x, q.y - p.y), steps = Math.max(1, Math.ceil(d));
      for (let s = 0; s < steps; s++, n++) {
        const k = 1 - (i - 1 + s / steps) / pts.length, x = p.x + ((q.x - p.x) * s) / steps, y = p.y + ((q.y - p.y) * s) / steps - 15;
        for (let r = 0; r < 2; r++) {
          const w = Math.sin(n * 0.45 - t * 30 + r * Math.PI + seed) * (7 * k + 2);
          ctx.globalAlpha = k;
          ctx.fillStyle = k > 0.7 ? F.white : k > 0.4 ? F.yellow : F.deep;
          ctx.fillRect(Math.round(x + nx * w), Math.round(y + ny * w), 1, 1);
        }
        if (hash(n, 8, seed) > 0.9) { ctx.globalAlpha = k; ctx.fillStyle = F.ember; ctx.fillRect(Math.round(x + nx * (hash(n, 9, seed) - 0.5) * 18), Math.round(y + ny * (hash(n, 9, seed) - 0.5) * 18), 1, 1); }
      }
    }
    ctx.globalAlpha = 1;
  });
}
// Where it lands, at (x, y), the punch going (ax, ay), k 0..1: hit hard enough to crack the world. A flash; jagged
// cracks of white-hot light shot out through the air from it, branching, longest ahead, burning orange at their edges;
// in the middle a rift torn open - dark, red at its heart, a rim of fire round it - closing as it fades; shards of the
// broken air flung out; a thin ring of white going out; fire blooming and embers falling.
export function drawSpaceCrack(ctx, x, y, ax, ay, k, t, seed) {
  if (k >= 1) return;
  const fade = 1 - k, grow = Math.min(1, k * 5), aa = Math.atan2(ay, ax);
  glowAt(ctx, x, y, 26 + 60 * Math.min(1, k * 2), [[0, `rgba(255, 245, 220, ${0.8 * fade * fade})`], [0.3, `rgba(255, 140, 50, ${0.4 * fade})`], [1, 'rgba(255, 70, 0, 0)']]);
  // the rift: dark, ragged, closing
  const R = (5 + 6 * Math.min(1, k * 4)) * (1 - Math.max(0, k - 0.45) / 0.55);
  if (R > 0.6) {
    for (let j = -Math.ceil(R * 1.4); j <= Math.ceil(R * 1.4); j++) for (let i = -Math.ceil(R); i <= Math.ceil(R); i++) {
      const d = Math.hypot(i, j * 0.72) / (R * (0.8 + 0.35 * hash(Math.round(Math.atan2(j, i) * 4), 1, seed)));
      if (d > 1) continue;
      ctx.fillStyle = d < 0.35 ? '#5a0a10' : d < 0.8 ? '#14040a' : '#ff6a1a';
      ctx.fillRect(Math.round(x) + i, Math.round(y) + j, 1, 1);
    }
  }
  lit(ctx, () => {
    // the cracks: jagged, branching, shot out from it
    for (let b = 0; b < 9; b++) {
      const base = aa + (b / 9) * Math.PI * 2 + (hash(b, 2, seed) - 0.5) * 0.5, ahead = Math.max(0, Math.cos(base - aa));
      const segs = Math.round((4 + 4 * hash(b, 3, seed) + 4 * ahead) * grow);
      let px = x, py = y, a = base;
      for (let sgm = 0; sgm < segs; sgm++) {
        a += (hash(b, sgm, seed) - 0.5) * 1.1;
        const L = 5 + 3 * hash(b, sgm + 20, seed), qx = px + Math.cos(a) * L, qy = py + Math.sin(a) * L, far = sgm / 12;
        ctx.globalAlpha = fade * (1 - far * 0.5);
        ctx.fillStyle = '#ff8a2a';
        pixLine(ctx, px + 1, py, qx + 1, qy);
        pixLine(ctx, px, py + 1, qx, qy + 1);
        ctx.fillStyle = far < 0.4 ? '#ffffff' : '#ffe8a8';
        pixLine(ctx, px, py, qx, qy);
        // (a branch off it, now and then)
        if (hash(b, sgm, seed + 9) > 0.72) {
          const ba = a + (hash(b, sgm, 31) > 0.5 ? 0.8 : -0.8), bx = qx + Math.cos(ba) * 7, by = qy + Math.sin(ba) * 7;
          ctx.fillStyle = '#ffb04a';
          pixLine(ctx, qx, qy, bx, by);
        }
        px = qx; py = qy;
      }
    }
    // shards of the broken air, flung out
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + hash(i, 5, seed), d = 6 + k * (40 + 30 * hash(i, 6, seed)), sx = Math.round(x + Math.cos(a) * d), sy = Math.round(y + Math.sin(a) * d + 30 * k * k);
      ctx.globalAlpha = fade;
      ctx.fillStyle = i % 3 ? '#ffe8a8' : '#ffffff';
      const L = 1 + Math.round(2 * hash(i, 7, seed));
      pixLine(ctx, sx, sy, sx + Math.cos(a + 1.2) * L, sy + Math.sin(a + 1.2) * L);
      ctx.fillStyle = '#ff6a1a';
      ctx.fillRect(sx, sy + 1, 1, 1);
    }
    // a thin ring of white going out
    ctx.globalAlpha = fade * 0.8;
    ctx.fillStyle = '#ffffff';
    pixArc(ctx, x, y, 8 + 50 * Math.min(1, k * 2.5), 7 + 42 * Math.min(1, k * 2.5), 0, 0, Math.PI * 2);
    // embers falling
    for (let i = 0; i < 18; i++) {
      const a = -Math.PI / 2 + (hash(i, 8, seed) - 0.5) * 3, sp = 50 + 110 * hash(i, 9, seed), T = k * 0.6;
      ctx.globalAlpha = fade;
      ctx.fillStyle = i % 2 ? '#ffd27a' : '#ff8a2a';
      ctx.fillRect(Math.round(x + Math.cos(a) * sp * T), Math.round(y + Math.sin(a) * sp * T + 150 * T * T), 1, 1);
    }
    ctx.globalAlpha = 1;
  });
  // fire blooming round the rift, dying down
  if (k < 0.6) drawFlame(ctx, x, y, 6 * (1 - k / 0.6), t, seed, -ax * 0.3, -1, 1.6);
}
