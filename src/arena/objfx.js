// What the game modes put in the world, all in pixels: CAPTURE THE FLAG's flags (and the stand each one's kept on),
// DOG TAGS' tags.

import { pixArc, glowAt } from './pixfx.js';

const lit = (ctx, fn) => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; fn(); ctx.restore(); };
const px = (ctx, x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
// a side's colour, darker and lighter
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255, f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
};

// ---------- capture the flag ----------
// A side's stand, its feet at (x, y): a stepped plinth, a ring of its colour turning over it while its flag's at home.
export function drawFlagBase(ctx, x, y, col, t, home) {
  const X = Math.round(x), Y = Math.round(y);
  px(ctx, X - 9, Y - 3, 19, 3, '#1a1f22');
  px(ctx, X - 8, Y - 3, 17, 1, '#4a5458');
  px(ctx, X - 6, Y - 5, 13, 2, '#2a3236');
  px(ctx, X - 5, Y - 5, 11, 1, shade(col, 0.2));
  if (home) lit(ctx, () => {
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = col;
    for (let i = 0; i < 3; i++) { const a = t * 2 + (i * Math.PI * 2) / 3; pixArc(ctx, X, Y - 3, 12, 3, 0, a, a + 1.4); }
  });
}
// A flag on its pole, the pole's foot at (x, y), flying the way `dir` says (1 right, -1 left), its cloth rippling.
export function drawFlag(ctx, x, y, col, t, dir = 1, h = 22) {
  const X = Math.round(x), Y = Math.round(y);
  px(ctx, X, Y - h, 1, h, '#c8ccd0');
  px(ctx, X + (dir > 0 ? 1 : -1), Y - h, 1, h, '#5a6066');
  px(ctx, X - 1, Y - h - 2, 3, 2, '#ffd25a');
  const dark = shade(col, -0.35), lite = shade(col, 0.35);
  for (let i = 1; i <= 11; i++) {
    const wave = Math.round(Math.sin(t * 9 - i * 0.7) * (i / 11) * 1.6), cx = X + dir * i, top = Y - h + 1 + wave;
    for (let j = 0; j < 7; j++) px(ctx, cx, top + j, 1, 1, j === 0 ? lite : j === 6 ? dark : (i + j) % 5 === 0 ? lite : col);
  }
  // a star on it
  const sx = X + dir * 5, sy = Y - h + 4 + Math.round(Math.sin(t * 9 - 3.5) * 0.7);
  px(ctx, sx - 1, sy, 3, 1, '#ffffff'); px(ctx, sx, sy - 1, 1, 3, '#ffffff');
}
// Its glow, after the lighting.
export function drawFlagGlow(ctx, x, y, rgb, k = 1) {
  glowAt(ctx, x + 4, y - 16, 22, [[0, `rgba(${rgb}, ${0.35 * k})`], [1, 'rgba(0, 0, 0, 0)']]);
}

// ---------- dog tags ----------
// A tag on its chain, at (x, y), turning as it bobs, the dead one's side's colour on it.
export function drawTag(ctx, x, y, col, t, seed) {
  const X = Math.round(x), Y = Math.round(y + Math.sin(t * 3 + seed) * 1.5), w = Math.abs(Math.cos(t * 2 + seed)) > 0.35 ? 5 : 2;
  px(ctx, X - 1, Y - 6, 1, 1, '#9aa4a8'); px(ctx, X, Y - 7, 1, 1, '#9aa4a8'); px(ctx, X + 1, Y - 6, 1, 1, '#9aa4a8');
  px(ctx, X - Math.floor(w / 2) - 1, Y - 5, w + 2, 8, '#14181a');
  px(ctx, X - Math.floor(w / 2), Y - 4, w, 6, '#c8d0d4');
  if (w > 2) { px(ctx, X - 2, Y - 4, 5, 2, col); px(ctx, X - 1, Y - 1, 3, 1, '#7a8488'); px(ctx, X - 1, Y + 1, 2, 1, '#7a8488'); }
  lit(ctx, () => { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 6 + seed); px(ctx, X + 1, Y - 3, 1, 1, '#ffffff'); });
}
