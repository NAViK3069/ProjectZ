// Deflect's dragon, all in pixels: as you dash, a long dragon of jade light flies with you - its head out in front,
// jaws snapping open and shut, gold horns swept back, an eye burning, a mane of flame, long whiskers streaming; a pearl
// of light just ahead of its mouth - and its body, jade scales and a gold belly, flames along its back, winding back
// along the way you came to a tail of fire.

import { glowAt } from './pixfx.js';

const hash = (a, b, c = 0) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
const D = { ink: '#06301e', dark: '#127a52', jade: '#2ad08a', hi: '#8affc8', gold: '#ffd25a', goldLo: '#c88a1a', red: '#ff5a3a', flame: '#ffa92a', mouth: '#5a0a14', tooth: '#fff6e8', eye: '#ffe066', white: '#ffffff' };

// a set of world pixels, each with its colour, outlined in ink once all are in
function pixels() {
  const cells = new Map();
  return {
    set(x, y, col) { cells.set(`${x},${y}`, [x, y, col]); },
    draw(ctx, alpha = 1, outline = true) {
      ctx.save();
      ctx.globalAlpha = alpha;
      if (outline) {
        ctx.fillStyle = D.ink;
        for (const [x, y] of cells.values()) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!cells.has(`${x + dx},${y + dy}`)) ctx.fillRect(x + dx, y + dy, 1, 1);
      }
      for (const [x, y, col] of cells.values()) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
      ctx.restore();
    },
  };
}

// The whole dragon: its head at (hx, hy) going along a, its body back along pts (newest first - where it's been),
// jaw 0..1 how open; fade 0..1 how much of it there is.
export function drawDragon(ctx, hx, hy, a, pts, t, fade, seed) {
  if (fade <= 0.02) return;
  const ux = Math.cos(a), uy = Math.sin(a), top = Math.cos(a) >= 0 ? -1 : 1;   // (which side of it is up)
  // ---- the body: back along the way it came, winding, tapering ----
  const body = [];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i], d = Math.hypot(q.x - p.x, q.y - p.y);
    for (let s = 0; s < d; s += 1) { if ((acc++) % 3 === 0) body.push({ x: p.x + ((q.x - p.x) * s) / d, y: p.y + ((q.y - p.y) * s) / d }); }
  }
  const N = Math.min(body.length, 60);
  const B = pixels();
  for (let i = N - 1; i >= 0; i--) {
    const c = body[i], nx = -uy * top, ny = ux * top, u = i / Math.max(1, N - 1);   // (n: up, out of its back)
    const wob = Math.sin(i * 0.32 - t * 10 + seed) * 4 * Math.min(1, u * 4), cx = c.x - nx * wob, cy = c.y - ny * wob;
    const r = 4.6 * (1 - u * 0.75) + 0.6;
    for (let j = -Math.ceil(r); j <= Math.ceil(r); j++) for (let k = -Math.ceil(r); k <= Math.ceil(r); k++) {
      if (k * k + j * j > r * r) continue;
      const v = (k * nx + j * ny) / r;   // (1: its back, -1: its belly)
      let col = v > 0.6 ? D.hi : v < -0.45 ? (v < -0.8 ? D.goldLo : D.gold) : (i + Math.floor((v + 1) * 2.2)) % 3 === 0 ? D.dark : D.jade;
      B.set(Math.round(cx) + k, Math.round(cy) + j, col);
    }
    // flames along its back, every few scales, flickering
    if (i % 4 === 0 && i > 2) {
      const h = 2 + Math.floor(hash(i, Math.floor(t * 16), seed) * 3);
      for (let s = 1; s <= h; s++) B.set(Math.round(cx + nx * (r + s)), Math.round(cy + ny * (r + s)), s === h ? D.flame : D.red);
    }
  }
  // the tail: a tuft of flame
  if (N > 4) {
    const c = body[N - 1];
    for (let s = 0; s < 6; s++) B.set(Math.round(c.x - ux * s + Math.sin(t * 20 + s) ), Math.round(c.y - uy * s + Math.cos(t * 17 + s)), s < 2 ? D.flame : D.red);
  }
  glowAt(ctx, hx - ux * 20, hy - uy * 20, 40, [[0, `rgba(80, 255, 180, ${0.18 * fade})`], [1, 'rgba(40, 200, 140, 0)']]);
  B.draw(ctx, fade);

  // ---- the head ----
  const H = pixels(), jaw = 0.18 + 0.32 * (0.5 + 0.5 * Math.sin(t * 22)), cj = Math.cos(jaw), sj = Math.sin(jaw);
  const at = (u, w) => [Math.round(hx + ux * u - uy * top * w), Math.round(hy + uy * u + ux * top * w)];   // (u ahead, w up)
  for (let u = -9; u <= 15; u += 0.5) for (let w = -6; w <= 9; w += 0.5) {
    let col = null;
    // the lower jaw, open: in its own frame, swung down about the hinge
    const lu = (u - 2) * cj - (w + 0.5) * sj, lw = (u - 2) * sj + (w + 0.5) * cj;   // (w down from the hinge: lw > 0)
    const crown = ((u + 0.5) / 6.5) ** 2 + ((w - 1) / 4.6) ** 2 <= 1;
    const snout = u >= 3 && u <= 13 && w >= 0.2 && w <= 3.6 - (u - 3) * 0.13;
    const lower = lu >= 1 && lu <= 10.5 && -lw >= 0 && -lw <= 2.4 - lu * 0.1;
    if (crown) col = w > 3.4 ? D.hi : w < -1.5 ? D.gold : (Math.round(u + w) % 3 === 0 ? D.dark : D.jade);
    else if (snout) col = w < 0.8 ? D.gold : w > 2.6 ? D.hi : D.jade;
    else if (lower) col = -lw < 0.6 && Math.round(lu) % 2 === 0 ? D.tooth : -lw > 1.8 ? D.gold : D.jade;
    else if (lu >= 1 && lu <= 10 && lw > 0 && w < 0.2) col = D.mouth;   // (inside, between the jaws)
    if (snout && w < 0.7 && Math.round(u) % 2 === 1) col = D.tooth;   // (the upper teeth)
    if (Math.hypot(u - 12, w - 2.4) < 0.6) col = D.ink;               // (a nostril)
    // the eye, burning, and the brow over it
    const e = Math.hypot(u - 3.5, w - 2.9);
    if (e < 1.3) col = e < 0.55 ? D.red : D.eye;
    else if (u > 2 && u < 6 && w > 3.6 && w < 4.6) col = D.gold;
    if (col) H.set(...at(u, w), col);
  }
  // the horns: swept back, gold
  for (const [u0, w0, u1, w1] of [[-1, 4, -11, 8.5], [-3, 3.2, -12.5, 5.5]]) for (let s = 0; s <= 1; s += 0.05) {
    const u = u0 + (u1 - u0) * s, w = w0 + (w1 - w0) * s + Math.sin(s * Math.PI) * 1.2;
    H.set(...at(u, w), s > 0.85 ? D.white : D.gold);
    if (s < 0.5) H.set(...at(u, w - 0.7), D.goldLo);
  }
  // the mane: flame round the back of its head, flickering
  for (let i = 0; i < 26; i++) {
    const ang = Math.PI * 0.5 + (i / 26) * Math.PI * 1.1, L = 2 + hash(i, Math.floor(t * 14), seed) * 4;
    for (let s = 0; s < L; s++) {
      const u = -1 + Math.cos(ang) * (6.5 + s), w = 1 + Math.sin(ang) * (4.6 + s * 0.8);
      if (u > -0.5) continue;
      H.set(...at(u, w), s > L - 1.5 ? D.flame : D.red);
    }
  }
  H.draw(ctx, fade);
  // the whiskers: long, streaming back, waving (no outline)
  const Wk = pixels();
  for (const [u0, w0, side] of [[12, 1.6, 1], [11, 0.4, -1]]) for (let s = 0; s < 18; s += 0.5) {
    const u = u0 - s, w = w0 + side * (Math.sin(s * 0.35 - t * 9 + seed) * 1.8 + s * 0.08);
    Wk.set(...at(u, w), s < 9 ? D.gold : D.hi);
  }
  Wk.draw(ctx, fade, false);
  // the pearl it chases, just ahead of its mouth
  const [px, py] = at(17 + Math.sin(t * 6) * 1.2, 0.5 + Math.cos(t * 5) * 1.2);
  glowAt(ctx, px, py, 10, [[0, `rgba(220, 255, 240, ${0.6 * fade})`], [1, 'rgba(80, 255, 180, 0)']]);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = fade;
  ctx.fillStyle = '#d8fff0';
  ctx.fillRect(px - 1, py - 1, 3, 3);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(px, py, 1, 1);
  ctx.restore();
}
