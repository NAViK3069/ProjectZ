// Deflect's dragon, all in pixels: as you dash, a great dragon of green light flies with you - a hologram, see-through,
// its edges glowing, scan lines running over it, flickering. Its head out in front, jaws gaping open and snapping,
// long fangs top and bottom; horns swept back, an eye burning white, a mane of flame; whiskers streaming. Its body - scales on it, a paler belly, fins of flame along its back - flowing back along
// the way you came, slow, to a tail of fire.

import { glowAt } from './pixfx.js';

const hash = (a, b, c = 0) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
// the hologram's greens (drawn added on: the dark ones all but see-through, the light ones glowing)
const H = { edge: '#8affc0', fill: '#1f9e5e', fillLo: '#167a48', scale: '#4ae894', hi: '#c8ffe4', belly: '#5af0a8', horn: '#b0ffd4', mane: '#4aff9a', mouth: '#041a0c', tooth: '#f4fff8', eye: '#ffffff' };
const S = 1.7;   // (how much bigger than a fighter's own scale it's drawn)

// a set of world pixels, each with its colour; drawn added on, its edge lit, scan lines running down it
function pixels() {
  const cells = new Map();
  return {
    set(x, y, col) { cells.set(`${x},${y}`, [x, y, col]); },
    draw(ctx, alpha, t, edge = true) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const scan = Math.floor(t * 30), flick = 0.82 + 0.18 * Math.sin(t * 37) * Math.sin(t * 11);
      for (const [x, y, col] of cells.values()) {
        const rim = edge && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !cells.has(`${x + dx},${y + dy}`));
        ctx.globalAlpha = alpha * flick * ((y + scan) % 4 === 0 ? 0.4 : rim ? 1 : 0.7);
        ctx.fillStyle = rim ? H.edge : col;
        ctx.fillRect(x, y, 1, 1);
      }
      ctx.restore();
    },
  };
}

// The whole dragon: its head at (hx, hy) going along a, its body back along pts (newest first - where it's been);
// fade 0..1 how much of it there is.
export function drawDragon(ctx, hx, hy, a, pts, t, fade, seed) {
  if (fade <= 0.02) return;
  const ux = Math.cos(a), uy = Math.sin(a), top = Math.cos(a) >= 0 ? -1 : 1;   // (which side of it is up)
  const nx = -uy * top, ny = ux * top;   // (up, out of its back)
  // ---- the body: back along the way it came, flowing gently, tapering ----
  const body = [];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i], d = Math.hypot(q.x - p.x, q.y - p.y);
    for (let s = 0; s < d; s += 1) { if ((acc++) % 3 === 0) body.push({ x: p.x + ((q.x - p.x) * s) / d, y: p.y + ((q.y - p.y) * s) / d }); }
  }
  const N = Math.min(body.length, 80);
  const B = pixels();
  for (let i = N - 1; i >= 0; i--) {
    const c = body[i], u = i / Math.max(1, N - 1);
    const wob = Math.sin(i * 0.09 - t * 2.4 + seed) * 4 * Math.min(1, u * 3), cx = c.x - nx * wob, cy = c.y - ny * wob;
    const r = 7.5 * (1 - u * 0.72) + 0.8;
    for (let j = -Math.ceil(r); j <= Math.ceil(r); j++) for (let k = -Math.ceil(r); k <= Math.ceil(r); k++) {
      if (k * k + j * j > r * r) continue;
      const v = (k * nx + j * ny) / r;   // (1: its back, -1: its belly)
      let col;
      if (v < -0.5) col = (i + j) % 3 === 0 ? H.fill : H.belly;                       // (the belly, in bands)
      else if (v > 0.7) col = H.hi;
      else col = Math.floor(i / 1.6 + (v + 1) * 2.6) % 3 === 0 ? H.scale : (v > 0.2 ? H.fill : H.fillLo);   // (scales)
      B.set(Math.round(cx) + k, Math.round(cy) + j, col);
    }
    // fins of flame along its back
    if (i % 5 === 0 && i > 3) {
      const h = 3 + Math.floor(hash(i, Math.floor(t * 10), seed) * 4);
      for (let s = 1; s <= h; s++) B.set(Math.round(cx + nx * (r + s) - ux * s * 0.6), Math.round(cy + ny * (r + s) - uy * s * 0.6), s === h ? H.hi : H.mane);
    }
  }
  // the tail: a tuft of green fire
  if (N > 4) {
    const c = body[N - 1];
    for (let s = 0; s < 10; s++) for (const j of [-1, 0, 1]) B.set(Math.round(c.x - ux * s + nx * (j + Math.sin(t * 9 + s) * 1.5)), Math.round(c.y - uy * s + ny * (j + Math.sin(t * 9 + s) * 1.5)), s < 4 ? H.hi : H.mane);
  }
  glowAt(ctx, hx - ux * 30, hy - uy * 30, 70, [[0, `rgba(60, 255, 150, ${0.16 * fade})`], [1, 'rgba(30, 200, 110, 0)']]);
  B.draw(ctx, fade, t);

  // ---- the head ----
  const Hd = pixels(), jaw = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(t * 14)), cj = Math.cos(jaw), sj = Math.sin(jaw);
  const at = (u, w) => [Math.round(hx + (ux * u - uy * top * w) * S), Math.round(hy + (uy * u + ux * top * w) * S)];   // (u ahead, w up)
  const step = 0.5 / S;
  for (let u = -9; u <= 15; u += step) for (let w = -7; w <= 9; w += step) {
    let col = null;
    // the lower jaw, gaping: in its own frame, swung down about the hinge
    const lu = (u - 2) * cj - (w + 0.5) * sj, lw = (u - 2) * sj + (w + 0.5) * cj;
    const crown = ((u + 0.5) / 6.5) ** 2 + ((w - 1) / 4.6) ** 2 <= 1;
    const snout = u >= 3 && u <= 13 && w >= 0.2 && w <= 3.6 - (u - 3) * 0.13;
    const lower = lu >= 1 && lu <= 10.5 && -lw >= 0 && -lw <= 2.4 - lu * 0.1;
    if (crown) col = w > 3.4 ? H.hi : w < -1.5 ? H.belly : (Math.round(u * 1.4 + w) % 3 === 0 ? H.scale : H.fill);
    else if (snout) col = w > 2.6 ? H.hi : H.fill;
    else if (lower) col = -lw > 1.8 ? H.belly : H.fill;
    else if (lu >= 1 && lu <= 10 && lw > 0 && w < 0.2) col = H.mouth;   // (inside, between the jaws: dark - see-through)
    // the fangs: long ones down off the snout, up off the jaw; small teeth between
    if (u > 3 && u < 13 && w < 0.4 && w > -2.2) { const fu = [5.5, 11]; for (const f of fu) if (Math.abs(u - f) < 0.45 && w > -2.2 + Math.abs(u - f) * 2) col = H.tooth; if (Math.round(u * 2) % 2 === 0 && w > -0.6 && w < 0.2 && !crown) col = H.tooth; }
    if (lu > 3 && lu < 11 && lw > -0.2 && lw < 2.2) { for (const f of [4.5, 9.5]) if (Math.abs(lu - f) < 0.45 && lw < 2.2 - Math.abs(lu - f) * 2) col = H.tooth; }
    if (Math.hypot(u - 12, w - 2.4) < 0.6) col = H.mouth;               // (a nostril)
    // the eye, burning white, and the brow over it
    const e = Math.hypot(u - 3.5, w - 2.9);
    if (e < 1.3) col = H.eye;
    else if (u > 2 && u < 6 && w > 3.6 && w < 4.6) col = H.horn;
    if (col) Hd.set(...at(u, w), col);
  }
  // the horns: swept back
  for (const [u0, w0, u1, w1] of [[-1, 4, -12, 9], [-3, 3.2, -13.5, 5.5]]) for (let s = 0; s <= 1; s += 0.02) {
    const u = u0 + (u1 - u0) * s, w = w0 + (w1 - w0) * s + Math.sin(s * Math.PI) * 1.4;
    Hd.set(...at(u, w), s > 0.85 ? H.eye : H.horn);
    if (s < 0.6) Hd.set(...at(u, w - 0.5), H.horn);
  }
  // the mane: green fire round the back of its head, flickering
  for (let i = 0; i < 30; i++) {
    const ang = Math.PI * 0.5 + (i / 30) * Math.PI * 1.1, L = 2 + hash(i, Math.floor(t * 10), seed) * 5;
    for (let s = 0; s < L; s += 0.5) {
      const u = -1 + Math.cos(ang) * (6.5 + s), w = 1 + Math.sin(ang) * (4.6 + s * 0.8);
      if (u > -0.5) continue;
      Hd.set(...at(u, w), s > L - 1.5 ? H.hi : H.mane);
    }
  }
  Hd.draw(ctx, fade, t);
  // the whiskers: long, streaming back, waving slow
  const Wk = pixels();
  for (const [u0, w0, side] of [[12, 1.6, 1], [11, 0.4, -1]]) for (let s = 0; s < 20; s += 0.3) {
    const u = u0 - s, w = w0 + side * (Math.sin(s * 0.3 - t * 4 + seed) * 1.8 + s * 0.08);
    Wk.set(...at(u, w), s < 10 ? H.hi : H.mane);
  }
  Wk.draw(ctx, fade, t, false);
}
