// The jumper skill's look, all in pixels: a rift - an oval tear stood up on end, black inside with stars in it, its rim
// of violet light turning, sparks of it crackling off and motes drawn into it - at each end of a path; the path itself,
// a dotted line of violet with light running along it; the jumper while they're laying it, a glitching violet ghost
// with the void coming off them; and anyone going through, a streak of light running along the path.

import { pixLine, pixArc, glowAt } from './pixfx.js';

const hash = (a, b, c) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
const V = { white: '#ffffff', pink: '#ff9af0', light: '#d0a8ff', mid: '#a05aff', deep: '#5a2ad0', ink: '#0b0418', void: '#1a0a33' };
const lit = (ctx, fn) => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; fn(); ctx.restore(); };

// One rift, its foot at (x, y). k: 0 .. 1 opened; fade: going.
export function drawRiftPortal(ctx, x, y, k, t, seed, fade = 1) {
  const s = ease(k) * fade, rx = 7 * s, ry = 15 * s, X = Math.round(x), Y = Math.round(y - 15);
  if (ry < 1) return;
  const tick = Math.floor(t * 20);
  glowAt(ctx, X, Y, 34 * s, [[0, `rgba(170, 90, 255, ${0.45 * fade})`], [0.5, `rgba(110, 50, 230, ${0.2 * fade})`], [1, 'rgba(60, 20, 160, 0)']]);
  // the black of it, and the stars in it
  ctx.save();
  ctx.globalAlpha = fade;
  for (let dy = -Math.floor(ry); dy <= Math.floor(ry); dy++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / ry) * (dy / ry))));
    ctx.fillStyle = Math.abs(dy) > ry * 0.7 ? V.void : V.ink;
    ctx.fillRect(X - w, Y + dy, w * 2 + 1, 1);
  }
  ctx.restore();
  lit(ctx, () => {
    ctx.globalAlpha = fade;
    for (let i = 0; i < 9; i++) {
      const sx = (hash(i, 1, seed) - 0.5) * rx * 1.4, sy = (hash(i, 2, seed) - 0.5) * ry * 1.6 + Math.sin(t * 1.5 + i) * 2;
      if (hash(i, tick, seed) < 0.3) continue;
      ctx.fillStyle = i % 3 ? V.light : V.white;
      ctx.fillRect(Math.round(X + sx), Math.round(Y + sy), 1, 1);
    }
    // the rim: rings of light turning round it, one way and the other
    for (const [kx, ky, sp, col, parts] of [[1, 1, 2.4, V.mid, 3], [1.15, 1.08, -1.8, V.pink, 2], [0.75, 0.82, 3.2, V.light, 2]]) {
      ctx.fillStyle = col;
      for (let i = 0; i < parts; i++) { const a = t * sp + (i * Math.PI * 2) / parts; pixArc(ctx, X, Y, rx * kx, ry * ky, 0, a, a + 1.7); }
    }
    ctx.fillStyle = V.white;
    pixArc(ctx, X, Y, rx, ry, 0, t * 4, t * 4 + 0.5);
    // sparks of it crackling off the rim
    for (let i = 0; i < 3; i++) {
      const a = hash(tick, i, seed) * 6.28, sx = X + Math.cos(a) * rx, sy = Y + Math.sin(a) * ry;
      let px = sx, py = sy;
      ctx.fillStyle = i % 2 ? V.pink : V.light;
      for (let j = 1; j <= 3; j++) {
        const b = a + (hash(tick, i * 5 + j, seed) - 0.5) * 1.6, nx = px + Math.cos(b) * 3, ny = py + Math.sin(b) * 3;
        pixLine(ctx, px, py, nx, ny);
        px = nx;
        py = ny;
      }
    }
    // motes drawn into it
    for (let i = 0; i < 14; i++) {
      const ph = (t * 1.2 + i / 14) % 1, a = (i / 14) * 6.28 + t * 2, d = (1 - ph) * 16 + 1;
      ctx.globalAlpha = ph * fade;
      ctx.fillStyle = i % 3 ? V.light : V.white;
      ctx.fillRect(Math.round(X + Math.cos(a) * (rx + d)), Math.round(Y + Math.sin(a) * (ry + d * 0.8)), 1, 1);
    }
  });
}

// The first rift before the other end's open: only a crack in the air, foot at (x, y) - a jagged split of light stood up
// on end, forks off it, light leaking out round it, widening and closing a little as it pulses. Nothing goes through
// yet. k: 0 .. 1 of it tearing.
export function drawRiftCrack(ctx, x, y, k, t, seed) {
  const X = Math.round(x), top = Math.round(y - 30), tick = Math.floor(t * 12), grow = ease(k), H = 28 * grow;
  if (H < 2) return;
  glowAt(ctx, X, Math.round(y - 15), 18, [[0, `rgba(170, 90, 255, ${0.35 * grow})`], [1, 'rgba(60, 20, 160, 0)']]);
  // the split itself: a zigzag down from the top, a fixed shape that only shivers
  const pts = [];
  for (let i = 0; i <= 7; i++) {
    const q = i / 7, jx = (hash(i, 1, seed) - 0.5) * 6 + (hash(i, tick, seed) - 0.5) * 1;
    pts.push([X + jx * Math.sin(q * Math.PI), top + 2 + (30 - H) / 2 + q * H]);
  }
  const wide = 0.5 + 0.5 * Math.sin(t * 6);
  ctx.save();
  ctx.fillStyle = V.ink;
  for (let i = 1; i < pts.length; i++) for (const o of [-1, 0, 1]) pixLine(ctx, pts[i - 1][0] + o * wide, pts[i - 1][1], pts[i][0] + o * wide, pts[i][1]);
  ctx.restore();
  lit(ctx, () => {
    ctx.globalAlpha = grow;
    for (let i = 1; i < pts.length; i++) {
      ctx.fillStyle = V.mid;
      pixLine(ctx, pts[i - 1][0] - 1 - wide, pts[i - 1][1], pts[i][0] - 1 - wide, pts[i][1]);
      pixLine(ctx, pts[i - 1][0] + 1 + wide, pts[i - 1][1], pts[i][0] + 1 + wide, pts[i][1]);
      ctx.fillStyle = (i + tick) % 3 ? V.light : V.white;
      pixLine(ctx, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    }
    // forks off it
    for (let i = 1; i < pts.length - 1; i++) {
      if (hash(i, 3, seed) < 0.45) continue;
      const side = hash(i, 4, seed) > 0.5 ? 1 : -1, len = 3 + hash(i, 5, seed) * 4;
      ctx.fillStyle = V.pink;
      pixLine(ctx, pts[i][0], pts[i][1], pts[i][0] + side * len, pts[i][1] - len * 0.6);
    }
    // light leaking out of it
    for (let i = 0; i < 10; i++) {
      const ph = (t * 1.3 + hash(i, 6, seed)) % 1, p = pts[Math.floor(hash(i, 7, seed) * pts.length)], side = i % 2 ? 1 : -1;
      ctx.globalAlpha = (1 - ph) * grow;
      ctx.fillStyle = i % 3 ? V.light : V.white;
      ctx.fillRect(Math.round(p[0] + side * (2 + ph * 8)), Math.round(p[1] - ph * 4), 1, 1);
    }
  });
}
// The path between them: dots of violet, light running along it from the first rift to the second.
export function drawRiftPath(ctx, path, t, fade = 1) {
  if (path.length < 2) return;
  const run = (t * 40) % (path.length + 12);
  lit(ctx, () => {
    for (let i = 0; i < path.length; i++) {
      const p = path[i], d = Math.abs(i - run), hot = d < 4;
      if (!hot && i % 2) continue;
      ctx.globalAlpha = (hot ? 1 - d / 4 : 0.6) * fade;
      ctx.fillStyle = hot ? (d < 1.5 ? V.white : V.pink) : V.mid;
      ctx.fillRect(Math.round(p.x), Math.round(p.y - 14), 1, 1);
    }
  });
}

// The one laying the rift, in the other place: a violet ghost of themselves, torn into slices that jump aside now and
// then, with the void coming off them. c: their own 64 px canvas (feet at 32, 50); mine: theirs to see (clearer).
export function drawPhased(ctx, c, x, y, t, mine) {
  const X = Math.round(x), Y = Math.round(y), tick = Math.floor(t * 24);
  glowAt(ctx, X, Y - 14, 26, [[0, `rgba(160, 90, 255, ${mine ? 0.3 : 0.2})`], [1, 'rgba(80, 30, 200, 0)']]);
  ctx.save();
  for (let r = 0; r < 64; r += 2) {
    const off = hash(r, tick, 3) > 0.86 ? Math.round((hash(r, tick, 4) - 0.5) * 8) : 0;
    ctx.globalAlpha = (mine ? 0.75 : 0.5) * (0.75 + 0.25 * Math.sin(t * 9 + r));
    ctx.drawImage(c, 0, r, 64, 2, X - 32 + off, Y - 50 + r, 64, 2);
  }
  ctx.restore();
  lit(ctx, () => {
    for (let i = 0; i < 12; i++) {
      const ph = (t * 1.1 + hash(i, 1, 7)) % 1, a = hash(i, 2, 7) * 6.28;
      ctx.globalAlpha = (1 - ph) * 0.9;
      ctx.fillStyle = i % 3 ? V.mid : V.pink;
      ctx.fillRect(Math.round(X + Math.cos(a) * (6 + ph * 10)), Math.round(Y - 14 + Math.sin(a) * (10 + ph * 6) - ph * 8), 1, 1);
    }
  });
}

// Someone going through: a streak of light at (x, y), along trail (newest first).
export function drawRiftTraveller(ctx, x, y, trail, t) {
  const X = Math.round(x), Y = Math.round(y);
  glowAt(ctx, X, Y, 20, [[0, 'rgba(230, 200, 255, 0.7)'], [0.4, 'rgba(160, 90, 255, 0.35)'], [1, 'rgba(80, 30, 200, 0)']]);
  lit(ctx, () => {
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i], q = i / trail.length;
      ctx.globalAlpha = 1 - q;
      ctx.fillStyle = q < 0.25 ? V.white : q < 0.6 ? V.pink : V.mid;
      pixLine(ctx, a.x, a.y, b.x, b.y);
      if (q < 0.5) { pixLine(ctx, a.x, a.y + 1, b.x, b.y + 1); pixLine(ctx, a.x + 1, a.y, b.x + 1, b.y); }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = V.white;
    ctx.fillRect(X - 1, Y - 1, 3, 3);
    ctx.fillStyle = V.pink;
    for (let i = 0; i < 6; i++) { const a = t * 9 + (i * Math.PI) / 3; ctx.fillRect(Math.round(X + Math.cos(a) * 4), Math.round(Y + Math.sin(a) * 4), 1, 1); }
  });
}

// A rift opening or someone coming out of one: a ring going out, a flash. k: 0 .. 1.
export function drawRiftBurst(ctx, x, y, k) {
  const e = ease(k), X = Math.round(x), Y = Math.round(y);
  glowAt(ctx, X, Y, 36 * (1 - k) + 6, [[0, `rgba(220, 180, 255, ${0.7 * (1 - k)})`], [1, 'rgba(100, 40, 220, 0)']]);
  lit(ctx, () => {
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = V.white;
    pixArc(ctx, X, Y, 4 + e * 24, 6 + e * 30, 0, 0, Math.PI * 2);
    ctx.fillStyle = V.mid;
    pixArc(ctx, X, Y, 2 + e * 14, 3 + e * 18, 0, 0, Math.PI * 2);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + 0.3, r0 = 4 + e * 8, r1 = r0 + (i % 2 ? 6 : 12) * (1 - k * 0.5);
      ctx.fillStyle = i % 2 ? V.pink : V.light;
      pixLine(ctx, X + Math.cos(a) * r0, Y + Math.sin(a) * r0 * 1.3, X + Math.cos(a) * r1, Y + Math.sin(a) * r1 * 1.3);
    }
  });
}
