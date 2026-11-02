// The shadow kill's looks, all in pixels. Going in: the body torn into dark slices flung apart, violet at their edges.
// On whoever's caught: a violet ring at their feet, a red mark over the head. The shadows: black copies of the
// fighter, blade in hand, red-eyed, rimmed in violet, that come out of nowhere on one side of a foe and are through
// them to the other in a blink - a streak of afterimages behind, and the cut left hanging in the air across them,
// white at the heart, a flash and shards where it went in. The last one: the fighter back behind them, a great
// crescent of a cut and a thin white line right across, a dark ring going out.

import { pixLine, pixArc, glowAt } from './pixfx.js';

const hash = (a, b, c) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
const P = { ink: '#0a0412', deep: '#3a0a5a', mid: '#9a3aff', pale: '#d8b0ff', core: '#ffe8ff', red: '#ff2a4a' };
const lit = (ctx, fn) => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; fn(); ctx.restore(); };
const DASH = 0.09, CUT_LIFE = 0.34;   // a shadow going through, how long its cut hangs there

// the shadow's violet rim: the same picture, violet (one canvas, done over for each)
let rimC = null;
function rimOf(img) {
  if (!rimC) { rimC = document.createElement('canvas'); rimC.width = rimC.height = 64; }
  const g = rimC.getContext('2d');
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, 64, 64);
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = P.mid;
  g.fillRect(0, 0, 64, 64);
  g.globalCompositeOperation = 'source-over';
  return rimC;
}
// One shadow, its feet at (x, y), facing dir (img faces face): the violet rim a pixel out all round, the black body,
// two red eyes.
function shade(ctx, img, rim, x, y, dir, face, a, ghost = false) {
  const X = Math.round(x), Y = Math.round(y), flip = dir !== face;
  ctx.save();
  ctx.translate(flip ? X + 1 : X, Y);
  if (flip) ctx.scale(-1, 1);
  if (!ghost) {
    // (the rim: the violet copy a pixel out behind the body, only where the body doesn't cover it)
    ctx.globalAlpha = a * 0.9;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1]]) ctx.drawImage(rim, -32 + dx, -50 + dy);
  }
  ctx.globalAlpha = a;
  ctx.drawImage(img, -32, -50);
  ctx.restore();
  if (ghost) return;   // (an afterimage: just the dark of it)
  lit(ctx, () => {
    ctx.globalAlpha = a;
    ctx.fillStyle = P.red;
    ctx.fillRect(X + dir * 2, Y - 22, 2, 1);
    ctx.fillStyle = '#ffd0d8';
    ctx.fillRect(X + dir * 3, Y - 22, 1, 1);
  });
}

// Going into shadow: k 0 .. 1. img: the dark picture of the fighter, feet at (x, y).
export function drawReapIn(ctx, img, x, y, k, t, seed) {
  const X = Math.round(x), Y = Math.round(y), rim = rimOf(img), e = k * k;
  for (let r = 0; r < 64; r += 2) {
    const off = Math.round((hash(r, 1, seed) - 0.5) * 60 * e), up = Math.round(hash(r, 2, seed) * 10 * e);
    if (hash(r, 3, seed) < k * 0.8) continue;   // (slices gone already)
    ctx.globalAlpha = 1 - k * 0.6;
    ctx.drawImage(img, 0, r, 64, 2, X - 32 + off, Y - 50 + r - up, 64, 2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.6 * (1 - k);
    ctx.drawImage(rim, 0, r, 64, 1, X - 32 + off, Y - 50 + r - up, 64, 1);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  glowAt(ctx, X, Y - 14, 34 * (1 - k) + 10, [[0, `rgba(150, 60, 255, ${0.45 * (1 - k)})`], [1, 'rgba(60, 0, 120, 0)']]);
}

// Over everyone caught in it: a ring of violet at the feet, turning, broken; a red mark over the head, blinking.
export function drawReapMarks(ctx, targets, t) {
  lit(ctx, () => {
    for (const v of targets) {
      const X = Math.round(v.x), Y = Math.round(v.y);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = P.mid;
      for (let i = 0; i < 3; i++) { const a = t * 4 + (i * Math.PI * 2) / 3; pixArc(ctx, X, Y, 13, 3, 0, a, a + 1.4); }
      ctx.fillStyle = P.pale;
      pixArc(ctx, X, Y, 9, 2, 0, -t * 6, -t * 6 + 0.8);
      if (Math.sin(t * 18) > -0.4) {
        const my = Math.round(v.y - 40);
        ctx.fillStyle = P.red;
        pixLine(ctx, X - 3, my - 3, X + 3, my + 3);
        pixLine(ctx, X + 3, my - 3, X - 3, my + 3);
        ctx.fillStyle = '#ffd0d8';
        ctx.fillRect(X, my, 1, 1);
      }
    }
  });
}

// The shadows going through, and their cuts. cuts: [{ x0, y0, x1, y1 (the cut, across the chest), t, s }]
export function drawShades(ctx, img, cuts, t, face = 1) {
  const rim = rimOf(img);
  for (const q of cuts) {
    const k = Math.min(1, q.t / DASH), dir = Math.sign(q.x1 - q.x0) || 1, at = (j) => [q.x0 + (q.x1 - q.x0) * j, q.y0 + (q.y1 - q.y0) * j];
    const fade = q.t < DASH ? 1 : Math.max(0, 1 - (q.t - DASH) / (CUT_LIFE - DASH));
    // the cut left in the air: ink outside, violet, a white heart - drawn as far as the shadow's got
    const [ex, ey] = at(Math.min(1, k * 1.15));
    const ux = q.x1 - q.x0, uy = q.y1 - q.y0, d = Math.hypot(ux, uy) || 1, nx = -uy / d, ny = ux / d;
    const w = fade;   // (thinning as it goes)
    ctx.save();
    ctx.globalAlpha = 0.7 * fade;
    ctx.fillStyle = P.ink;
    if (w > 0.5) for (const o of [-2, 2]) pixLine(ctx, q.x0 + nx * o, q.y0 + ny * o, ex + nx * o, ey + ny * o);
    ctx.restore();
    lit(ctx, () => {
      ctx.globalAlpha = fade;
      ctx.fillStyle = P.mid;
      if (w > 0.25) for (const o of [-1, 1]) pixLine(ctx, q.x0 + nx * o, q.y0 + ny * o, ex + nx * o, ey + ny * o);
      ctx.fillStyle = w > 0.6 ? P.core : P.pale;
      pixLine(ctx, q.x0, q.y0, ex, ey);
      // where it went in: a flash, and shards thrown out either side of the cut
      if (k >= 0.5) {
        const mx = (q.x0 + q.x1) / 2, my = (q.y0 + q.y1) / 2, since = q.t - DASH * 0.5;
        if (since < 0.06) { ctx.globalAlpha = 1 - since / 0.06; ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(mx) - 2, Math.round(my) - 2, 5, 5); }
        for (let i = 0; i < 8; i++) {
          const side = i % 2 ? 1 : -1, sp = 6 + hash(i, 1, q.s) * 22, along = (hash(i, 2, q.s) - 0.5) * 0.9;
          const r = since * sp * 6, px = mx + (nx * side + (ux / d) * along) * r, py = my + (ny * side + (uy / d) * along) * r + since * since * 60;
          ctx.globalAlpha = Math.max(0, 1 - since / 0.3);
          ctx.fillStyle = i % 3 ? P.mid : i % 2 ? P.red : P.core;
          ctx.fillRect(Math.round(px), Math.round(py), i % 4 ? 1 : 2, 1);
        }
      }
    });
    // the shadow: afterimages strung back along the way it came, then itself (feet 14 under the chest)
    if (q.t < DASH + 0.12) {
      const gone = q.t < DASH ? 1 : Math.max(0, 1 - (q.t - DASH) / 0.12);
      for (let i = 3; i >= 1; i--) {
        const j = k - i * 0.16;
        if (j < 0) continue;
        const [sx, sy] = at(j);
        shade(ctx, img, rim, sx, sy + 14, dir, face, gone * (0.4 - i * 0.11), true);
      }
      const [sx, sy] = at(k);
      shade(ctx, img, rim, sx, sy + 14, dir, face, gone * (q.t < 0.02 ? q.t / 0.02 : 1));
    }
  }
}

// The last cut, across (x, y): the fighter's back out of the shadows. k: 0 .. 1 of it.
export function drawReapFinish(ctx, x, y, face, k, t, seed) {
  const X = Math.round(x), Y = Math.round(y), e = 1 - Math.pow(1 - Math.min(1, k * 2.2), 3), fade = 1 - k;
  glowAt(ctx, X, Y, 48 * fade + 8, [[0, `rgba(220, 170, 255, ${0.55 * fade})`], [0.5, `rgba(130, 40, 255, ${0.25 * fade})`], [1, 'rgba(60, 0, 120, 0)']]);
  // a dark ring going out
  ctx.save();
  ctx.globalAlpha = 0.6 * fade;
  ctx.fillStyle = P.ink;
  pixArc(ctx, X, Y, 6 + e * 46, 4 + e * 20, 0, 0, Math.PI * 2);
  ctx.restore();
  lit(ctx, () => {
    // the crescent: swept round in front of the fighter, thick, white at the heart
    const a0 = face > 0 ? Math.PI : 0, sweep = 2.4 * e;
    for (const [r, col, a] of [[24, P.deep, 0.8], [23, P.mid, 1], [22, P.mid, 1], [21, P.pale, 1], [20, P.core, 1], [19, P.mid, 0.7]]) {
      ctx.globalAlpha = a * fade;
      ctx.fillStyle = col;
      pixArc(ctx, X, Y, r, r * 0.7, 0, a0 - face * (sweep / 2) - face * 0.2, a0 + face * (sweep / 2) - face * 0.2);
    }
    // one thin white line right across, a flare at its middle
    const L = 18 + e * 70;
    ctx.globalAlpha = fade;
    ctx.fillStyle = P.core;
    ctx.fillRect(X - Math.round(L), Y, Math.round(L * 2), 1);
    ctx.fillStyle = P.mid;
    ctx.fillRect(X - Math.round(L * 0.7), Y - 1, Math.round(L * 1.4), 1);
    ctx.fillRect(X - Math.round(L * 0.7), Y + 1, Math.round(L * 1.4), 1);
    if (k < 0.25) { ctx.globalAlpha = 1 - k / 0.25; ctx.fillStyle = '#ffffff'; ctx.fillRect(X - 1, Y - 6, 3, 13); ctx.fillRect(X - 6, Y - 1, 13, 3); }
    // shards
    for (let i = 0; i < 18; i++) {
      const b = hash(i, 1, seed) * Math.PI * 2, d = 4 + e * (12 + hash(i, 2, seed) * 34);
      ctx.globalAlpha = fade;
      ctx.fillStyle = i % 4 === 0 ? P.core : i % 3 === 0 ? P.red : P.mid;
      ctx.fillRect(Math.round(X + Math.cos(b) * d), Math.round(Y + Math.sin(b) * d * 0.6 + e * e * 8), i % 3 ? 1 : 2, 1);
    }
  });
}
