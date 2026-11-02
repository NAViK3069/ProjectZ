// The shadow kill's looks, all in pixels. First the sword drawn, the eyes lit red. Going in: the body torn into dark slices flung apart, violet at their edges.
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
const DASH = 0.07, CUT_LIFE = 0.34;   // a shadow going through, how long its cut hangs there

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

// Before it all, the sword drawn - just a little, a click of it out of the scabbard (the sword and the hands: the
// fighter's own, as deflect's). Feet at (x, y), eyes at height ey, facing face; k 0 .. 1 of it; (mx, my) the
// scabbard's mouth, a the way the scabbard points, pull how far the blade's out. The eye lights red, a streak of it
// flaring back; red light seeps from the mouth, sparks rising; at the click, a flash there and a thin red slit of
// steel showing, a glint running along it.
const ease3 = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
export function drawReapDraw(ctx, x, y, ey, face, k, t, seed, mx, my, a, pull) {
  const X = Math.round(x), f = face, ux = Math.cos(a), uy = Math.sin(a);
  lit(ctx, () => {
    // red light seeping from the mouth, sparks going up off it and off the body
    const leak = Math.min(1, k / 0.45);
    for (let i = 0; i < 10; i++) {
      const ph = (t * 2.4 + hash(i, 1, seed)) % 1, near = i < 5;
      const sx = near ? mx + (hash(i, 2, seed) - 0.5) * 6 : x + (hash(i, 2, seed) - 0.5) * 16, sy = near ? my : y - 4 - hash(i, 4, seed) * 20;
      ctx.globalAlpha = leak * Math.sin(ph * Math.PI);
      ctx.fillStyle = i % 3 ? '#ff2a4a' : '#ffd0d8';
      ctx.fillRect(Math.round(sx), Math.round(sy - ph * 16), 1, i % 2 ? 2 : 1);
    }
    // the steel out of the scabbard: from the mouth back along the blade toward the hilt, white-hot at the edge
    if (pull > 0) {
      for (let i = 0; i <= pull + 1; i++) {
        const px = mx - ux * i, py = my - uy * i;
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
        ctx.fillStyle = '#ff2a4a';
        ctx.fillRect(Math.round(px - uy), Math.round(py + ux), 1, 1);
      }
      // a glint running along it, now and then
      const g = ((t * 2.5) % 1) * (pull + 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(mx - ux * g) - 1, Math.round(my - uy * g), 3, 1);
      ctx.fillRect(Math.round(mx - ux * g), Math.round(my - uy * g) - 1, 1, 3);
    }
    // the click: a star of light at the mouth, a ring out from it
    const cl = (k - 0.5) / 0.22;
    if (cl > 0 && cl < 1) {
      const s = Math.round(9 * Math.sin(Math.PI * Math.min(1, cl * 1.6)));
      ctx.globalAlpha = 1 - cl * 0.5;
      ctx.fillStyle = '#ff8a9a';
      ctx.fillRect(Math.round(mx) - s, Math.round(my), s * 2 + 1, 1);
      ctx.fillRect(Math.round(mx), Math.round(my) - Math.round(s * 0.6), 1, Math.round(s * 1.2) + 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(mx) - 1, Math.round(my) - 1, 3, 3);
      ctx.globalAlpha = 1 - cl;
      ctx.fillStyle = '#ff2a4a';
      pixArc(ctx, Math.round(mx), Math.round(my), 3 + cl * 16, 2 + cl * 8, 0, 0, Math.PI * 2);
    }
    // the eye: lit red, a streak of it flaring back, two rows thick near it, flickering
    const eyeOn = Math.min(1, k / 0.12), ex = X + f * 3, EY = Math.round(ey);
    if (eyeOn > 0) {
      const flick = Math.floor(t * 40) % 5 ? 1 : 0.7, len = Math.round(4 + 14 * ease3(k / 0.3));
      for (let i = 0; i <= len; i++) {
        const al = eyeOn * flick * (1 - i / (len + 1)), lift = i > len * 0.6 ? 1 : 0;
        ctx.globalAlpha = al;
        ctx.fillStyle = i < 2 ? '#ffffff' : i < 5 ? '#ff8a9a' : '#ff2a4a';
        ctx.fillRect(Math.round(ex - f * i), EY - lift, 1, 1);
        if (i < len * 0.55) { ctx.globalAlpha = al * 0.8; ctx.fillStyle = '#ff2a4a'; ctx.fillRect(Math.round(ex - f * i), EY + 1, 1, 1); }
      }
      ctx.globalAlpha = eyeOn;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(f > 0 ? ex : ex - 1, EY, 2, 1);
      ctx.fillStyle = '#ff2a4a';
      ctx.fillRect(f > 0 ? ex : ex - 1, EY + 1, 2, 1);
      const fl = k / 0.18;
      if (fl > 0.2 && fl < 1) { const s = Math.round(5 * Math.sin(Math.PI * fl)); ctx.globalAlpha = 1; ctx.fillStyle = '#ff6a7a'; ctx.fillRect(ex - s, EY, s * 2 + 1, 1); ctx.fillRect(ex, EY - s, 1, s * 2 + 1); ctx.fillStyle = '#ffffff'; ctx.fillRect(ex, EY, 1, 1); }
    }
  });
  glowAt(ctx, mx, my, 10 + 10 * Math.max(0, Math.min(1, (k - 0.5) / 0.2)), [[0, `rgba(255, 60, 90, ${0.1 + 0.25 * Math.min(1, k / 0.5)})`], [1, 'rgba(160, 0, 40, 0)']]);
  glowAt(ctx, X + f * 3, ey, 7, [[0, `rgba(255, 50, 80, ${Math.min(1, k / 0.12) * 0.5})`], [1, 'rgba(160, 0, 40, 0)']]);
}

// Going into shadow: k 0 .. 1. img: the dark picture of the fighter, feet at (x, y); (tx, ty) whoever it's going for.
// A white flash, and the body torn into slices flung apart; a pillar of violet light shooting up through where it
// stood, a ring of it going out along the floor; four shadows of it bursting off every way; shards; and streaks of
// light zipping off to whoever it's going for, one after another.
export function drawReapIn(ctx, img, x, y, k, t, seed, tx, ty, face = 1) {
  const X = Math.round(x), Y = Math.round(y), rim = rimOf(img), e = ease3(k), fade = 1 - k;
  glowAt(ctx, X, Y - 14, 60 * fade + 10, [[0, `rgba(220, 160, 255, ${0.6 * fade})`], [0.4, `rgba(140, 50, 255, ${0.3 * fade})`], [1, 'rgba(60, 0, 140, 0)']]);
  // the shadows bursting off every way
  for (const [dx, dy] of [[-1, 0], [1, 0], [-0.7, -0.5], [0.7, -0.5]]) {
    const d = 10 + e * 46;
    shade(ctx, img, rim, X + dx * d, Y + dy * d, dx > 0 ? 1 : -1, face, 0.55 * fade, true);
  }
  // the body itself, coming apart in slices flung sideways
  for (let r = 0; r < 64; r += 2) {
    const off = Math.round((hash(r, 1, seed) - 0.5) * 80 * e), up = Math.round(hash(r, 2, seed) * 14 * e);
    if (hash(r, 3, seed) < k) continue;
    ctx.globalAlpha = 1 - k * 0.5;
    ctx.drawImage(img, 0, r, 64, 2, X - 32 + off, Y - 50 + r - up, 64, 2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.8 * fade;
    ctx.drawImage(rim, 0, r, 64, 1, X - 32 + off, Y - 50 + r - up, 64, 1);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  lit(ctx, () => {
    // the flash: a star of white at the heart of it
    if (k < 0.3) {
      const f = 1 - k / 0.3, s = Math.round(22 * f + 4);
      ctx.globalAlpha = f;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(X - s, Y - 15, s * 2 + 1, 2);
      ctx.fillRect(X - 1, Y - 14 - s, 2, s * 2);
      ctx.fillStyle = P.pale;
      ctx.fillRect(X - 3, Y - 17, 7, 6);
    }
    // the pillar: up through where it stood, narrowing to a thread, motes running up it
    const w = Math.round(3 * fade), top = Y - 20 - e * 70;
    ctx.globalAlpha = fade;
    ctx.fillStyle = P.mid;
    ctx.fillRect(X - w - 1, Math.round(top), w * 2 + 3, Y - Math.round(top));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(X - Math.max(0, w - 1), Math.round(top), Math.max(1, w * 2 - 1), Y - Math.round(top));
    for (let i = 0; i < 10; i++) {
      const ph = (k * 1.5 + hash(i, 4, seed)) % 1;
      ctx.globalAlpha = fade * Math.sin(ph * Math.PI);
      ctx.fillStyle = i % 2 ? P.core : P.mid;
      ctx.fillRect(X + Math.round((hash(i, 5, seed) - 0.5) * 12), Math.round(Y - ph * 80), 1, 3);
    }
    // the ring along the floor, two of them
    ctx.globalAlpha = fade;
    ctx.fillStyle = P.pale;
    pixArc(ctx, X, Y, 4 + e * 48, 2 + e * 9, 0, 0, Math.PI * 2);
    ctx.fillStyle = P.mid;
    pixArc(ctx, X, Y, 2 + e * 30, 1 + e * 6, 0, 0, Math.PI * 2);
    // shards out every way
    for (let i = 0; i < 20; i++) {
      const b = hash(i, 6, seed) * Math.PI * 2, d = 4 + e * (16 + hash(i, 7, seed) * 40);
      ctx.globalAlpha = fade;
      ctx.fillStyle = i % 4 === 0 ? '#ffffff' : i % 3 === 0 ? P.red : P.mid;
      const sx = X + Math.cos(b) * d, sy = Y - 14 + Math.sin(b) * d * 0.7;
      ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
      ctx.fillRect(Math.round(sx - Math.cos(b) * 2), Math.round(sy - Math.sin(b) * 1.4), 1, 1);
    }
    // the streaks of light zipping off to them
    if (tx !== undefined) {
      const dx = tx - X, dy = ty - (Y - 14), L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      for (let i = 0; i < 6; i++) {
        const st = hash(i, 8, seed) * 0.4, ph = (k - st) / 0.5;
        if (ph <= 0 || ph >= 1.3) continue;
        const head = Math.min(1, ph), tail = Math.max(0, ph - 0.35), o = (hash(i, 9, seed) - 0.5) * 18 * (1 - head * 0.6);
        ctx.globalAlpha = Math.min(1, 1.3 - ph);
        ctx.fillStyle = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? P.pale : P.mid;
        pixLine(ctx, X + dx * tail + nx * o, Y - 14 + dy * tail + ny * o, X + dx * head + nx * o * 0.3, Y - 14 + dy * head + ny * o * 0.3);
      }
    }
  });
}

// A star of light winking: four arms (size long) round a white heart. a: how bright.
function twinkle(ctx, x, y, size, a, col) {
  const X = Math.round(x), Y = Math.round(y);
  ctx.globalAlpha = a;
  ctx.fillStyle = col;
  ctx.fillRect(X - size, Y, size * 2 + 1, 1);
  ctx.fillRect(X, Y - size, 1, size * 2 + 1);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(X, Y, 1, 1);
  if (size > 1) { ctx.globalAlpha = a * 0.6; ctx.fillRect(X - 1, Y, 3, 1); ctx.fillRect(X, Y - 1, 1, 3); }
}

// Over whoever's being cut: a ring of violet at the feet, turning, broken; stars of light winking round them; a red
// mark over the head, blinking. k: how far it's come in (0 .. 1).
export function drawReapMarks(ctx, targets, t, k = 1) {
  lit(ctx, () => {
    for (const v of targets) for (let i = 0; i < 7; i++) {
      const ph = (t * 1.7 + hash(i, 1, 3)) % 1, on = Math.sin(ph * Math.PI), a = t * 1.3 + (i / 7) * Math.PI * 2;
      twinkle(ctx, v.x + Math.cos(a) * (14 + hash(i, 2, 3) * 8), v.y - 14 + Math.sin(a) * 14 - ph * 6, hash(i, 3, 3) > 0.6 ? 2 : 1, on * 0.9 * k, i % 3 ? P.pale : P.mid);
    }
  });
  lit(ctx, () => {
    for (const v of targets) {
      const X = Math.round(v.x), Y = Math.round(v.y);
      ctx.globalAlpha = 0.9 * k;
      ctx.fillStyle = P.mid;
      for (let i = 0; i < 3; i++) { const a = t * 5 + (i * Math.PI * 2) / 3; pixArc(ctx, X, Y, 15, 3.5, 0, a, a + 1.3); }
      ctx.fillStyle = P.pale;
      pixArc(ctx, X, Y, 10, 2.5, 0, -t * 7, -t * 7 + 0.9);
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

// One cut as a blade of light: from tail to head along it (0 .. 1), bowed by q.b, widest (w) in the middle and down to
// a fine point at both ends - white at the heart, pale violet, violet at its edges, a red one down one side.
// Each pixel the once, the brightest that falls on it.
const RANK = { '#ff2a4a': 1, [P.mid]: 2, [P.pale]: 3, '#ffffff': 4 };
function blade(ctx, q, tail, head, w, a) {
  const dx = q.x1 - q.x0, dy = q.y1 - q.y0, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const px = new Map();
  const put = (x, y, col) => { const k = (x + 2048) * 4096 + (y + 2048), was = px.get(k); if (!was || RANK[was[2]] < RANK[col]) px.set(k, [x, y, col]); };
  for (let i = tail * L; i <= head * L; i += 0.5) {
    const s = i / L, hw = w * Math.pow(Math.sin(Math.PI * s), 1.1), off = (q.b ?? 0) * Math.sin(Math.PI * s);
    const cx = q.x0 + ux * i + nx * off, cy = q.y0 + uy * i + ny * off, red = s > 0.25 && s < 0.75;
    for (let j = -hw; j <= hw + (red ? 1 : 0); j += 0.5) {
      const r = Math.abs(j) / Math.max(0.01, hw);
      const col = j > hw ? '#ff2a4a' : r < 0.4 ? '#ffffff' : r < 0.75 ? P.pale : P.mid;
      put(Math.round(cx + nx * j), Math.round(cy + ny * j), col);
    }
  }
  ctx.save();
  ctx.globalAlpha = a;
  for (const [x, y, col] of px.values()) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
  ctx.restore();
}

// The shadows going through, and their cuts. cuts: [{ x0, y0, x1, y1 (the cut, across the chest), b (its bow), t, s }]
// Each: a tear in the air where the shadow comes out; the shadow across in a blink, speed lines streaming off it; the
// cut drawn after it as a blade of light, a burst of light where it goes through them - long rays, a ring, shards
// flung on - then the cut thinning to a hair and drawing in from its tail till it's gone.
export function drawShades(ctx, img, cuts, t, face = 1) {
  const rim = rimOf(img);
  // the cuts, then the shadows, then the bursts of light over it all
  for (const q of cuts) {
    const head = 1 - Math.pow(1 - Math.min(1, q.t / DASH), 2), tail = Math.max(0, Math.min(1, (q.t - DASH - 0.05) / 0.2));
    if (tail >= head) continue;
    const thin = Math.max(0, 1 - Math.max(0, q.t - DASH) / (CUT_LIFE - DASH));
    const mx = (q.x0 + q.x1) / 2, my = (q.y0 + q.y1) / 2;
    glowAt(ctx, mx, my, 28 * thin + 6, [[0, `rgba(200, 140, 255, ${0.4 * thin})`], [1, 'rgba(120, 40, 255, 0)']]);
    blade(ctx, q, tail, head, 0.3 + 1.5 * Math.pow(thin, 0.6), Math.min(1, 0.35 + thin));
  }
  for (const q of cuts) {
    if (q.t >= DASH + 0.08) continue;
    const k = Math.min(1, q.t / DASH), dir = Math.sign(q.x1 - q.x0) || 1, at = (j) => [q.x0 + (q.x1 - q.x0) * j, q.y0 + (q.y1 - q.y0) * j];
    const dx = q.x1 - q.x0, dy = q.y1 - q.y0, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const gone = q.t < DASH ? 1 : Math.max(0, 1 - (q.t - DASH) / 0.08);
    // the tear it comes out of: a slit of violet stood up in the air, closing
    if (q.t < 0.07) lit(ctx, () => {
      const f = 1 - q.t / 0.07, X = Math.round(q.x0), Y = Math.round(q.y0), hh = Math.round(16 * f + 3);
      ctx.globalAlpha = f;
      ctx.fillStyle = P.mid;
      ctx.fillRect(X - 1, Y - hh, 3, hh * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(X, Y - hh + 2, 1, hh * 2 - 4);
    });
    // speed lines streaming back off it
    lit(ctx, () => {
      const [hx, hy] = at(k);
      for (let i = 0; i < 7; i++) {
        const o = (hash(i, 5, q.s) - 0.5) * 26, len = (0.35 + hash(i, 6, q.s) * 0.65) * L * k;
        ctx.globalAlpha = gone * (0.35 + 0.45 * hash(i, 7, q.s));
        ctx.fillStyle = Math.abs(o) < 5 ? '#ffffff' : P.mid;
        pixLine(ctx, hx + nx * o - ux * len, hy + ny * o - uy * len, hx + nx * o - ux * 4, hy + ny * o - uy * 4);
      }
    });
    // two dark afterimages, then the shadow itself (its feet 14 under the chest)
    for (const j of [0.45, 0.22]) if (k - j > 0) { const [sx, sy] = at(k - j); shade(ctx, img, rim, sx, sy + 14, dir, face, gone * 0.3, true); }
    const [sx, sy] = at(k);
    shade(ctx, img, rim, sx, sy + 14, dir, face, gone);
  }
  lit(ctx, () => {
    for (const q of cuts) {
      const since = q.t - DASH * 0.45;   // (the moment it's through the middle of them)
      if (since < 0) continue;
      const dx = q.x1 - q.x0, dy = q.y1 - q.y0, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
      const mx = Math.round((q.x0 + q.x1) / 2), my = Math.round((q.y0 + q.y1) / 2);
      // the flash, and the rays: two long along the cut, two across, four short on the slant
      if (since < 0.14) {
        const k = since / 0.14, f = 1 - k;
        ctx.globalAlpha = f;
        if (since < 0.05) { ctx.fillStyle = '#ffffff'; ctx.fillRect(mx - 4, my - 1, 9, 3); ctx.fillRect(mx - 1, my - 4, 3, 9); }
        for (const [ax, ay, len] of [[ux, uy, 34], [-ux, -uy, 34], [nx, ny, 16], [-nx, -ny, 16], [(ux + nx) * 0.7, (uy + ny) * 0.7, 9], [(ux - nx) * 0.7, (uy - ny) * 0.7, 9], [(-ux + nx) * 0.7, (-uy + ny) * 0.7, 9], [(-ux - nx) * 0.7, (-uy - ny) * 0.7, 9]]) {
          const n = Math.round(len * (0.4 + 0.6 * f));
          for (let i = 1; i <= n; i++) {
            ctx.fillStyle = i < n * 0.4 ? '#ffffff' : i < n * 0.75 ? P.pale : P.mid;
            ctx.fillRect(Math.round(mx + ax * i), Math.round(my + ay * i), 1, 1);
          }
        }
        // a ring going out
        ctx.globalAlpha = f * 0.9;
        ctx.fillStyle = P.pale;
        pixArc(ctx, mx, my, 4 + k * 18, 3 + k * 12, Math.atan2(uy, ux), 0, Math.PI * 2);
      }
      // stars of light winking along the cut, one after another, rising a little - still there as it goes
      for (let i = 0; i < 10; i++) {
        const ph = (since - hash(i, 8, q.s) * 0.14) / 0.2;
        if (ph <= 0 || ph >= 1) continue;
        const sa = hash(i, 9, q.s), off = (hash(i, 10, q.s) - 0.5) * 12 + (q.b ?? 0) * Math.sin(Math.PI * sa);
        twinkle(ctx, q.x0 + dx * sa + nx * off, q.y0 + dy * sa + ny * off - ph * 5, hash(i, 11, q.s) > 0.55 ? 2 : 1, Math.sin(ph * Math.PI), i % 4 === 0 ? '#ffb0c0' : i % 2 ? P.pale : P.mid);
      }
      // shards flung on, the way the cut went: short streaks, white, violet, red
      if (since < 0.32) {
        for (let i = 0; i < 12; i++) {
          const side = (hash(i, 3, q.s) - 0.5) * 1.6, sp = 70 + hash(i, 1, q.s) * 170, dirx = ux + nx * side, diry = uy + ny * side;
          const r = since * sp, x = mx + dirx * r, y = my + diry * r + since * since * 90;
          ctx.globalAlpha = Math.max(0, 1 - since / 0.32);
          ctx.fillStyle = i % 4 === 0 ? '#ffffff' : i % 3 === 0 ? P.red : P.pale;
          const tl = i % 2 ? 3 : 2;
          for (let j = 0; j < tl; j++) ctx.fillRect(Math.round(x - dirx * j), Math.round(y - diry * j), 1, 1);
        }
      }
    }
  });
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
