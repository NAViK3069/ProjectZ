// The cloak skill's look, all in pixels. Going into it, or out of it: stars of light winking round the body. What you
// see of the foe nearest you: the reach of your stab round them, clearer the closer you come, the half of it at their
// back shaded in - that's where a stab counts most - and arrows in to their back. And the stab itself: a slash of
// violet light through them, crossed with gold on a backstab, shards flying on.

import { pixLine, pixArc, glowAt } from './pixfx.js';
import { drawText, textWidth } from '../ui/font.js';

const hash = (a, b, c) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
const P = { white: '#f4eeff', pale: '#d0b8ff', mid: '#a07aff', deep: '#5a34b8', ink: '#120a22', red: '#ff5a6a', gold: '#ffd25a' };
const lit = (ctx, fn) => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; fn(); ctx.restore(); };

// Going into the cloak or coming back out of it: little stars of light winking round the body - four-pointed, white at
// the heart - most of them as it's halfway, rising a little as they go. k: 0 .. 1 of it; rgb the colour of it.
export function drawSparkle(ctx, x, y, k, t, seed, rgb) {
  const X = Math.round(x), Y = Math.round(y), amount = Math.sin(Math.PI * Math.min(1, k * 1.1));
  lit(ctx, () => {
    for (let i = 0; i < 14; i++) {
      const ph = (k * 1.4 + hash(i, 1, seed)) % 1, on = Math.sin(ph * Math.PI);
      if (on <= 0.05) continue;
      const sx = X + Math.round((hash(i, 2, seed) - 0.5) * 22), sy = Y - 3 - Math.round(hash(i, 3, seed) * 30 + ph * 6), big = hash(i, 4, seed) > 0.6;
      ctx.globalAlpha = on * amount;
      ctx.fillStyle = `rgb(${rgb})`;
      ctx.fillRect(sx - (big ? 2 : 1), sy, big ? 5 : 3, 1);
      ctx.fillRect(sx, sy - (big ? 2 : 1), 1, big ? 5 : 3);
      ctx.fillStyle = P.white;
      ctx.fillRect(sx, sy, 1, 1);
    }
  });
}

// One foe near you, while you're cloaked with the stab to use: (x, y) their chest, face the way they look, d how far
// you are, R your stab's reach, behind: you're at their back now, sees: nothing solid between.
export function drawStabRing(ctx, x, y, face, d, R, behind, sees, t) {
  const far = 230, k = Math.max(0, Math.min(1, (far - d) / (far - R))), inReach = d <= R && sees;
  if (k <= 0) return;
  const X = Math.round(x), Y = Math.round(y), pulse = 0.5 + 0.5 * Math.sin(t * 9), vis = (0.3 + 0.7 * k) * (sees ? 1 : 0.45);
  const back0 = face > 0 ? Math.PI / 2 : -Math.PI / 2, back1 = back0 + Math.PI;   // (the half round their back)
  const atBack = (px) => (px - X) * face < 0;
  // the back half, shaded in: a dither of violet over the ground
  ctx.save();
  ctx.globalAlpha = vis * (inReach ? 0.28 + 0.1 * pulse : 0.14);
  ctx.fillStyle = P.mid;
  for (let dy = -R; dy <= R; dy += 2) for (let dx = -R + ((dy / 2) & 1); dx <= R; dx += 2) {
    if (dx * dx + dy * dy > R * R || !atBack(X + dx)) continue;
    ctx.fillRect(X + dx, Y + dy, 1, 1);
  }
  // a dark edge round it all, so it reads on anything
  ctx.globalAlpha = vis * 0.6;
  ctx.fillStyle = P.ink;
  pixArc(ctx, X, Y, R + 1, R + 1, 0, 0, Math.PI * 2);
  pixArc(ctx, X, Y, R - 2, R - 2, back0, back0, back1);
  ctx.restore();
  if (inReach) glowAt(ctx, X - face * 18, Y, R * 0.9, [[0, `rgba(170, 110, 255, ${(behind ? 0.32 : 0.16) * (0.7 + 0.3 * pulse)})`], [1, 'rgba(110, 50, 255, 0)']]);
  lit(ctx, () => {
    // the reach: the back half thick and bright, the front a thin red line
    ctx.globalAlpha = vis;
    ctx.fillStyle = inReach ? P.pale : P.mid;
    pixArc(ctx, X, Y, R, R, 0, back0, back1);
    pixArc(ctx, X, Y, R - 1, R - 1, 0, back0, back1);
    ctx.globalAlpha = vis * 0.55;
    ctx.fillStyle = P.red;
    pixArc(ctx, X, Y, R, R, 0, back1, back0 + Math.PI * 2);
    // runners going round the back half
    ctx.globalAlpha = vis;
    ctx.fillStyle = P.white;
    for (let i = 0; i < 3; i++) { const a = back0 + ((t * 0.35 + i / 3) % 1) * Math.PI; pixArc(ctx, X, Y, R, R, 0, a, a + 0.12); }
    // their back: three chevrons pointing in to it, running in
    ctx.globalAlpha = vis;
    for (let i = 0; i < 3; i++) {
      const ph = (t * 1.6 + i / 3) % 1, ax = X - face * (30 - ph * 14), ay = Y - 2;
      ctx.globalAlpha = vis * Math.sin(ph * Math.PI);
      ctx.fillStyle = behind && inReach ? P.gold : P.pale;
      pixLine(ctx, ax, ay, ax - face * 4, ay - 4);
      pixLine(ctx, ax, ay, ax - face * 4, ay + 4);
      pixLine(ctx, ax + face, ay, ax - face * 3, ay - 4);
      pixLine(ctx, ax + face, ay, ax - face * 3, ay + 4);
    }
  });
  // in reach, at their back: what the stab will do
  if (inReach && behind) {
    const s = 'BACKSTAB X4.5', tx = Math.round(X - textWidth(s) / 2), ty = Math.round(Y - R * 0.55 - 10);
    drawText(ctx, s, tx, ty, 1, Math.sin(t * 14) > -0.3 ? P.gold : '#fff6c8', '#12081e');
  }
}

// The cloak's stab going in at (x, y), along a: a flash, a slash of violet light through them - crossed with a second,
// gold, on a backstab - shards flying on the way it went, a ring going out. k: 0 .. 1 of it.
export function drawStabBurst(ctx, x, y, a, k, back, seed) {
  const e = ease(k), X = Math.round(x), Y = Math.round(y), grow = ease(Math.min(1, k / 0.12)), fade = 1 - k;
  glowAt(ctx, X, Y, (back ? 46 : 32) * fade + 6, [[0, back ? `rgba(255, 220, 140, ${0.6 * fade})` : `rgba(200, 160, 255, ${0.6 * fade})`], [0.5, `rgba(140, 80, 255, ${0.3 * fade})`], [1, 'rgba(80, 30, 200, 0)']]);
  lit(ctx, () => {
    const slash = (b, len, cols) => {
      const ux = Math.cos(b), uy = Math.sin(b), nx = -uy, ny = ux, L = len * grow;
      for (const [o, col] of cols) {
        ctx.fillStyle = col;
        for (let i = -L * 0.45; i < L * 0.55; i += 1) {
          const q = (i + L * 0.45) / L, w = Math.sin(q * Math.PI) * 2.2, bend = Math.sin(q * Math.PI) * 3;
          if (Math.abs(o) > w) continue;
          ctx.fillRect(Math.round(X + ux * i + nx * (o + bend)), Math.round(Y + uy * i + ny * (o + bend)), 1, 1);
        }
      }
    };
    ctx.globalAlpha = fade;
    slash(a, 40, [[-2, P.deep], [2, P.deep], [-1, P.mid], [1, P.mid], [0, P.white]]);
    if (back) slash(a + 1.1, 34, [[-1, '#c89a3a'], [1, '#c89a3a'], [0, '#fff6c8']]);
    // a ring going out
    ctx.fillStyle = back ? P.gold : P.pale;
    pixArc(ctx, X, Y, 3 + e * (back ? 26 : 18), 3 + e * (back ? 26 : 18), 0, 0, Math.PI * 2);
    // shards on the way it went
    for (let i = 0; i < (back ? 22 : 14); i++) {
      const b = a + (hash(i, 1, seed) - 0.5) * 1.6, d = 3 + e * (10 + hash(i, 2, seed) * 26);
      ctx.fillStyle = i % 4 === 0 ? P.white : back && i % 3 === 0 ? P.gold : P.mid;
      ctx.fillRect(Math.round(X + Math.cos(b) * d), Math.round(Y + Math.sin(b) * d + e * e * 6), i % 3 ? 1 : 2, 1);
    }
    if (k < 0.1) { ctx.globalAlpha = 1 - k / 0.1; ctx.fillStyle = P.white; ctx.fillRect(X - 2, Y - 2, 5, 5); }
  });
}
