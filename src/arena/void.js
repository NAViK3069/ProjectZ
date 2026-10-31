// The murasaki skill's look: black-hole orbs in pixels (a black core, a rim
// in the orb's colour with a bright crescent turning round it, motes spiralling
// in, a glow) and the purple lightning that crackles off them; and the purple
// one itself, once red and blue have made it, as a black hole (drawVoidHole).

import { palette, drawPixels, glowAt } from './pixfx.js';

export const ORB = {
  red: { core: '#12000a', rim: '#ff2a3a', hi: '#ffb0b0', glow: '255, 60, 70' },
  blue: { core: '#000a1c', rim: '#2a8aff', hi: '#b8e4ff', glow: '60, 150, 255' },
  purple: { core: '#0c0018', rim: '#a43aff', hi: '#ecc8ff', glow: '170, 70, 255' },
};

// a little seeded random, so lightning holds its shape for a frame or two
const rng = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

// An orb of radius R at (x, y) in palette P (one of ORB); t: time, for the turning.
export function drawOrb(ctx, x, y, R, P, t) {
  if (R <= 0.3) return;
  const cx = Math.round(x), cy = Math.round(y), box = Math.ceil(R + 3);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 3.2);
  gr.addColorStop(0, `rgba(${P.glow}, 0.55)`);
  gr.addColorStop(0.45, `rgba(${P.glow}, 0.22)`);
  gr.addColorStop(1, `rgba(${P.glow}, 0)`);
  ctx.fillStyle = gr;
  ctx.fillRect(cx - R * 3.2, cy - R * 3.2, R * 6.4, R * 6.4);
  ctx.restore();
  for (let j = -box; j <= box; j++) for (let i = -box; i <= box; i++) {
    const d = Math.hypot(i, j);
    if (d > R + 1.3) continue;
    const a = Math.atan2(j, i), lit = Math.cos(a - t * 7) > 0.55;
    let col;
    if (d <= R - 1.6) col = d > R - 2.8 && lit ? P.rim : P.core;   // the core, a sliver of light round its inside edge
    else if (d <= R) col = lit ? P.hi : P.rim;
    else { ctx.globalAlpha = 0.75; col = P.hi; }
    ctx.fillStyle = col;
    ctx.fillRect(cx + i, cy + j, 1, 1);
    ctx.globalAlpha = 1;
  }
  // motes spiralling in
  ctx.fillStyle = P.hi;
  for (let k = 0; k < 8; k++) {
    const ph = (t * 1.8 + k / 8) % 1, ang = t * 6 + k * 0.785 + ph * 3, r = R + 2 + (1 - ph) * R * 0.9;
    ctx.globalAlpha = ph;
    ctx.fillRect(Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r), 1, 1);
  }
  ctx.globalAlpha = 1;
}

// Lightning crackling round an orb: n bolts, re-formed many times a second
// and flickering on and off - some arcing tight over its surface, some forking
// out into the air. Each a one-pixel white-lavender line with a soft purple
// glow round it (added on, so it lights what it's over).
export function drawBolts(ctx, x, y, R, n, t, reach = 14) {
  const r = rng(Math.floor(t * 18) * 7919 + Math.round(x * 0.1) * 31);
  // a jagged line from a to b: its middle pushed off to one side, then each half the same, and again
  const jag = (a, b, depth) => {
    if (depth === 0) return [a, b];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const off = (r() - 0.5) * len * 0.45, m = [mx - ((b[1] - a[1]) / len) * off, my + ((b[0] - a[0]) / len) * off];
    return [...jag(a, m, depth - 1).slice(0, -1), ...jag(m, b, depth - 1)];
  };
  const bolts = [];
  for (let b = 0; b < n; b++) {
    if (r() < 0.22) continue;   // a flicker: this one's out for now
    const a0 = r() * Math.PI * 2;
    if (r() < 0.5) {
      // an arc over the surface
      const span = 0.6 + r() * 0.9, rr = R + 1 + r() * 2, pts = [];
      for (let k = 0; k <= 6; k++) { const a = a0 + (span * k) / 6, d = rr + (k % 2 ? 1 : -0.5) * (0.5 + r() * 1.5); pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d]); }
      bolts.push(pts);
    } else {
      // a fork reaching out, with a branch off it
      const s0 = [x + Math.cos(a0) * R, y + Math.sin(a0) * R], len = reach * (0.6 + r() * 0.5), a1 = a0 + (r() - 0.5) * 0.6;
      const end = [s0[0] + Math.cos(a1) * len, s0[1] + Math.sin(a1) * len], main = jag(s0, end, 3);
      bolts.push(main);
      const at = main[3 + Math.floor(r() * 3)], a2 = a1 + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.5), bl = len * 0.45;
      bolts.push(jag(at, [at[0] + Math.cos(a2) * bl, at[1] + Math.sin(a2) * bl], 2));
    }
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';
  for (const [w, col] of [[4, 'rgba(150, 60, 255, 0.22)'], [2, 'rgba(200, 140, 255, 0.4)']]) {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    for (const pts of bolts) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
      ctx.stroke();
    }
  }
  ctx.restore();
  for (const pts of bolts) for (let s = 1; s < pts.length; s++) {
    const [x0, y0] = pts[s - 1], [x1, y1] = pts[s], m = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    ctx.fillStyle = s < pts.length / 2 ? '#ffffff' : '#e6d0ff';
    for (let k = 0; k <= m; k++) ctx.fillRect(Math.round(x0 + ((x1 - x0) * k) / m), Math.round(y0 + ((y1 - y0) * k) / m), 1, 1);
  }
}

// ---------- the hollow purple ----------
// The purple, once red and blue have made it: a sphere of violet light of
// radius R at (x, y), in pixels (see pixfx.js) - deep purple through violet
// and lilac to a blaze of white at its heart, a bright rim round its edge,
// rays of white light bursting out from the middle and on past its edge,
// flickering, and specks of light glittering all through it. Drawn on ctx,
// its glow on gl. `cache`: an object of the caller's to keep its pixels in
// between (they're worked out 20 times a second).
const PURPLE = palette(['#14042a', '#3a0f78', '#6a22c0', '#a24ef0', '#d8a8ff', '#f6eaff', '#ffffff']);
const PHEAT = [[0.86, '#ffffff'], [0.72, '#f6eaff'], [0.56, '#d8a8ff'], [0.4, '#a24ef0'], [0.24, '#6a22c0'], [0.1, '#3a0f78']];
const heatCol = (h) => { for (const [k, c] of PHEAT) if (h >= k) return c; return '#14042a'; };
const ih = (x, y) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export function drawVoidHole(ctx, gl, x, y, R, t, seed = 0, cache = null) {
  if (R <= 0.5) return;
  glowAt(gl, x, y, R * 3.4, [[0, 'rgba(255, 240, 255, 0.55)'], [0.25, 'rgba(200, 120, 255, 0.35)'], [0.6, 'rgba(140, 60, 240, 0.14)'], [1, 'rgba(90, 20, 200, 0)']]);
  t = Math.floor(t * 20) / 20;
  const size = Math.ceil(R * 5.4);
  drawPixels(ctx, x, y, size, PURPLE, (g) => {
    const step = 0.5, tick = Math.floor(t * 20), lim = Math.floor((R + 1) / step) * step;
    // the rays: a few long ones bursting out past its edge, flickering
    for (let i = 0; i < 9; i++) {
      if (ih(i + tick * 3, 7) < 0.3) continue;
      const a = ih(i, 11 + Math.floor(t * 4)) * Math.PI * 2 + t * 0.6, len = R * (1.4 + ih(i, tick) * 1.3);
      g.strokeStyle = i % 3 ? '#d8a8ff' : '#ffffff';
      g.lineWidth = 0.6 + ih(i, 5) * 0.6;
      g.beginPath();
      g.moveTo(Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3);
      g.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      g.stroke();
    }
    // the sphere, pixel by pixel
    for (let py = -lim; py <= lim; py += step) for (let px = -lim; px <= lim; px += step) {
      const r = Math.hypot(px, py), d = r / R;
      if (d > 1) continue;
      const th = Math.atan2(py, px);
      const core = Math.pow(Math.max(0, 1 - d), 1.1) * 1.4;   // the blaze in the middle
      const rim = Math.max(0, 1 - Math.abs(d - 0.93) / 0.08) * 0.32;   // its bright edge
      const rays = Math.pow(Math.max(0, Math.sin(th * 7 + seed + t * 1.5)), 12) * (1 - d) * 0.6;   // light bursting out of the heart
      const speck = ih(Math.round(px * 2) + tick * 131, Math.round(py * 2) + 17) > 0.975 ? 0.5 : 0;   // glittering
      g.fillStyle = heatCol(0.26 + core + rim + rays + speck - d * 0.08);
      g.fillRect(px, py, step, step);
    }
  }, cache, `${t}|${R.toFixed(1)}`);
}
