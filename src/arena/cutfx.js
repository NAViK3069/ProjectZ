// Judgement Cut's looks, all in pixels. First a mark where it's going: a ring of blue closing in, turning. Then space
// itself there is cut: a sphere of it torn loose - what's behind it seen through, slipped sideways in bands and gone
// blue and dark, a broken rim of cyan round it - and cut across, again and again, each cut a white line edged in cyan
// that's through it in a blink and hangs a moment; by you, the blur of the sword going in and out. Last, the sword's
// put away - and at the click, the sphere breaks like glass: shards of it flung out, a flash, a ring going out.

import { pixArc, pixLine, glowAt } from './pixfx.js';

const hash = (a, b, c = 0) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const lit = (ctx, fn) => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; fn(); ctx.restore(); };
const C = { void: '#060a1e', navy: '#14245a', blue: '#2a5ad8', cyan: '#5ad8ff', pale: '#bff4ff', core: '#ffffff' };
export const JC_SHARDS = 26;

// The cuts across the sphere (radius R) n of them, one every `every` from the start, `since` that start: each where it
// goes across and how old it is (the same on every screen, from the seed).
export function jcCutList(seed, R, n, every, since) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = (hash(i, seed, 2) - 0.5) * R * 1.3;
    out.push({ t: since - i * every, a: hash(i, seed, 1) * Math.PI + (i % 2 ? 0.4 : -0.4), o, len: 2 * Math.sqrt(Math.max(0, R * R - o * o)) * 1.1 });
  }
  return out;
}

// ---------- the mark ----------
// Where it's going, (x, y), the sphere's radius R; k 0..1 through the stance: a ring closing in, its ticks, the middle.
export function drawJcMark(ctx, x, y, R, k, t) {
  lit(ctx, () => {
    const r = R * (1.7 - 0.7 * k), a = 0.35 + 0.55 * k;
    ctx.globalAlpha = a;
    ctx.fillStyle = C.cyan;
    for (let j = 0; j < 8; j++) { const a0 = t * 3 + (j * Math.PI) / 4; pixArc(ctx, x, y, r, r, 0, a0, a0 + 0.42); }
    ctx.fillStyle = C.blue;
    pixArc(ctx, x, y, r * 0.75, r * 0.75, 0, -t * 4, -t * 4 + Math.PI * 1.4);
    ctx.fillStyle = C.pale;
    for (let j = 0; j < 4; j++) {
      const a0 = (j * Math.PI) / 2 + Math.PI / 4, c = Math.cos(a0), s = Math.sin(a0);
      pixLine(ctx, x + c * (r + 2), y + s * (r + 2), x + c * (r + 7), y + s * (r + 7));
    }
    ctx.fillStyle = C.core;
    ctx.fillRect(Math.round(x) - 3, Math.round(y), 7, 1);
    ctx.fillRect(Math.round(x), Math.round(y) - 3, 1, 7);
    ctx.globalAlpha = 1;
  });
}

// ---------- the cut sphere ----------
// The sphere at (x, y), radius R, open (k 0..1 how far it's come: it opens fast), the cuts across it: each { t (its
// age), a (across at), o (off the middle), len }.
let grab = null, grabG = null;
export function drawJcSphere(ctx, x, y, R, open, t, seed, cuts) {
  const r = Math.max(2, R * Math.min(1, open)), cx = Math.round(x), cy = Math.round(y), ri = Math.ceil(r);
  // what's behind it, seen through - slipped sideways in bands (the world's pixels, a band at a time)
  const m = ctx.getTransform(), sc = m.a, dev = m.transformPoint({ x: cx - ri, y: cy - ri }), sz = Math.ceil((ri * 2 + 1) * sc);
  if (!grab || grab.width < sz) { grab = document.createElement('canvas'); grab.width = grab.height = sz; grabG = grab.getContext('2d'); }
  grabG.clearRect(0, 0, sz, sz);
  grabG.drawImage(ctx.canvas, Math.round(dev.x), Math.round(dev.y), sz, sz, 0, 0, sz, sz);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  for (let j = -ri; j <= ri; j++) {
    const w = Math.round(Math.sqrt(Math.max(0, r * r - j * j)));
    if (w <= 0) continue;
    const band = Math.floor((j + 100) / 4), shift = Math.round(Math.sin(band * 1.7 + t * 9 + seed) * 3 * open + (hash(band, Math.floor(t * 14), seed) - 0.5) * 4);
    const sx = (ri - w + shift) * sc, sy = (j + ri) * sc;
    ctx.drawImage(grab, Math.max(0, sx), sy, w * 2 * sc, sc, cx - w, cy + j, w * 2, 1);
  }
  ctx.imageSmoothingEnabled = smooth;
  // gone dark and blue inside, flecked
  for (let j = -ri; j <= ri; j++) {
    const w = Math.round(Math.sqrt(Math.max(0, r * r - j * j)));
    if (w <= 0) continue;
    ctx.fillStyle = 'rgba(8, 18, 60, 0.55)';
    ctx.fillRect(cx - w, cy + j, w * 2, 1);
    for (let i = -w; i < w; i++) {
      const by = BAYER[((cy + j) & 3) * 4 + ((cx + i) & 3)], d = Math.hypot(i, j) / r, n = hash(i + Math.floor(t * 30), j, seed);
      if (n > 0.985) { ctx.fillStyle = C.pale; ctx.fillRect(cx + i, cy + j, 1, 1); }
      else if (d > 0.82 && by < (d - 0.82) * 4) { ctx.fillStyle = C.navy; ctx.fillRect(cx + i, cy + j, 1, 1); }
      else if (n < 0.04) { ctx.fillStyle = C.void; ctx.fillRect(cx + i, cy + j, 1, 1); }
    }
  }
  lit(ctx, () => {
    // the rim: cyan, broken, jittering
    for (let j = 0; j < 10; j++) {
      const a0 = (j / 10) * Math.PI * 2 + t * 1.5, jit = (hash(j, Math.floor(t * 20), seed) - 0.5) * 2;
      ctx.fillStyle = j % 3 ? C.cyan : C.pale;
      pixArc(ctx, cx, cy, r + jit, r + jit, 0, a0, a0 + 0.5);
    }
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = C.blue;
    pixArc(ctx, cx, cy, r + 3, r + 3, 0, -t * 2, -t * 2 + Math.PI * 1.2);
    ctx.globalAlpha = 1;
    // the cuts across it
    for (const q of cuts) {
      const LIFE = 0.3;
      if (q.t < 0) continue;
      const ux = Math.cos(q.a), uy = Math.sin(q.a), nx = -uy, ny = ux, half = q.len / 2;
      if (q.t > LIFE) {
        // what it leaves: a crack across it, faint, flickering - the whole sphere crazed like glass by the end
        const ax = x + nx * q.o - ux * half * 0.92, ay = y + ny * q.o - uy * half * 0.92;
        ctx.globalAlpha = 0.3 + 0.2 * Math.sin(t * 25 + q.a * 9);
        ctx.fillStyle = C.pale;
        pixLine(ctx, ax, ay, ax + ux * q.len * 0.92, ay + uy * q.len * 0.92);
        continue;
      }
      const grow = Math.min(1, q.t / 0.035), fade = 1 - Math.max(0, q.t - 0.06) / (LIFE - 0.06);
      const ax = x + nx * q.o - ux * half, ay = y + ny * q.o - uy * half, bx = ax + ux * q.len * grow, by = ay + uy * q.len * grow;
      ctx.globalAlpha = fade;
      if (q.t < 0.09) {
        ctx.fillStyle = C.cyan;
        pixLine(ctx, ax + nx, ay + ny, bx + nx, by + ny);
        pixLine(ctx, ax - nx, ay - ny, bx - nx, by - ny);
      }
      ctx.fillStyle = q.t < 0.09 ? C.core : C.pale;
      pixLine(ctx, ax, ay, bx, by);
      // sparks thrown off where it comes out
      if (q.t < 0.06) for (let s = 0; s < 4; s++) {
        const d = 2 + hash(s, q.a * 10) * 8, side = s % 2 ? 1 : -1;
        ctx.fillStyle = C.pale;
        ctx.fillRect(Math.round(bx + ux * d + nx * side * hash(s, 3) * 4), Math.round(by + uy * d + ny * side * hash(s, 3) * 4), 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  });
  glowAt(ctx, x, y, r * 1.6, [[0, 'rgba(60, 140, 255, 0.18)'], [1, 'rgba(40, 90, 255, 0)']]);
}

// All round you as it cuts: rings of wind turning about the body at (x, y), leaning this way and that; the cuts in it -
// one each cut (n of them, one every `every`; since: how long it's been cutting), a crescent of white and cyan slashed
// round you somewhere and gone in a moment; and flecks of the wind thrown off, spiralling out.
export function drawJcWind(ctx, x, y, since, t, seed, n, every, until) {
  // (the rings: up at once, held while it cuts, fading slowly after `until`)
  const fade = Math.min(1, since / 0.06) * Math.max(0, Math.min(1, 1 - (since - until) / 0.6));
  lit(ctx, () => {
    for (let j = 0; j < 3; j++) {
      const rx = 20 + j * 7, ry = 6 + j * 2.5, tilt = (j - 1) * 0.3, spin = t * (13 - j * 3) * (j % 2 ? -1 : 1) + seed;
      ctx.globalAlpha = (0.55 - j * 0.12) * fade;
      ctx.fillStyle = j === 0 ? C.pale : C.cyan;
      for (let d = 0; d < 4; d++) { const a0 = spin + d * 1.57; pixArc(ctx, x, y, rx, ry, tilt, a0, a0 + 0.75); }
    }
    for (let i = 0; i < n; i++) {
      const age = since - i * every, LIFE = 0.7;   // (slashed in a blink, then fading slowly)
      if (age < 0 || age >= LIFE) continue;
      const phi = hash(i, seed, 5) * Math.PI * 2, r = 15 + hash(i, seed, 6) * 13, tilt = (hash(i, 7) - 0.5) * 1.4, ry = r * (0.3 + 0.3 * hash(i, 8));
      const grow = Math.min(1, age / 0.035), a0 = phi - 1.2, a1 = a0 + 2.4 * grow;
      ctx.globalAlpha = Math.pow(1 - age / LIFE, 1.6);
      for (let j = 0; j < 3; j++) {
        ctx.fillStyle = j === 0 ? C.core : j === 1 ? C.pale : C.cyan;
        pixArc(ctx, x, y, r - j * 1.5, ry - j * 0.6, tilt, a0 + j * 0.15, a1 - j * 0.1);
      }
    }
    for (let i = 0; i < 26; i++) {
      const ph = (t * 1.6 + hash(i, seed, 9)) % 1, a = hash(i, 10) * Math.PI * 2 + ph * 3.5, d = 10 + ph * 40;
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.45;
      ctx.globalAlpha = (1 - ph) * 0.8 * fade;
      ctx.fillStyle = hash(i, 11) > 0.5 ? C.pale : C.cyan;
      ctx.fillRect(Math.round(px), Math.round(py), 2, 1);
    }
    ctx.globalAlpha = 1;
  });
}
// The ring the blade's point leaves as it spins: its points newest first, each with its age k (0..1), fading off behind.
export function drawJcTrail(ctx, tips) {
  lit(ctx, () => {
    for (let j = 0; j < tips.length - 1; j++) {
      const k = tips[j].k;
      if (Math.hypot(tips[j + 1].x - tips[j].x, tips[j + 1].y - tips[j].y) > 30) continue;   // (a gap in the history)
      ctx.globalAlpha = Math.pow(1 - k, 1.4) * 0.95;
      ctx.fillStyle = k < 0.12 ? C.core : k < 0.45 ? C.pale : C.cyan;
      pixLine(ctx, tips[j].x, tips[j].y, tips[j + 1].x, tips[j + 1].y);
      if (k < 0.35) { ctx.fillStyle = C.cyan; pixLine(ctx, tips[j].x * 0.92 + tips[j + 1].x * 0.08, tips[j].y + 1, tips[j + 1].x, tips[j + 1].y + 1); }
    }
    ctx.globalAlpha = 1;
  });
}

// Snapped shut, at the scabbard's mouth (hx, hy): a sharp star of light and a ring off it, k 0..1 as it goes.
export function drawJcShut(ctx, hx, hy, face, k, t) {
  if (k >= 1 || k < 0) return;
  glowAt(ctx, hx, hy, 10 + 20 * k, [[0, `rgba(220, 245, 255, ${0.7 * (1 - k)})`], [1, 'rgba(90, 190, 255, 0)']]);
  lit(ctx, () => {
    const L = Math.round(3 + 9 * (1 - k) * Math.min(1, k * 8)), x = Math.round(hx), y = Math.round(hy);
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = C.core;
    ctx.fillRect(x - L, y, L * 2 + 1, 1);
    ctx.fillRect(x, y - Math.round(L * 0.6), 1, Math.round(L * 1.2) + 1);
    ctx.fillStyle = C.cyan;
    pixArc(ctx, hx, hy, 3 + 16 * k, 2 + 7 * k, 0, 0, Math.PI * 2);
    ctx.globalAlpha = 1;
  });
}
// The stance's air: a cyan glint at the scabbard's mouth (hx, hy), and wisps of blue rising off the body at (x, y).
export function drawJcAura(ctx, x, y, hx, hy, k, t, seed) {
  lit(ctx, () => {
    for (let i = 0; i < 8 + k * 10; i++) {
      const ph = (t * (1.1 + hash(i, 1)) + hash(i, seed, 2)) % 1, sx = x + (hash(i, 3) - 0.5) * 14 + Math.sin(t * 5 + i) * 1.5, sy = y - 2 - ph * 30;
      ctx.globalAlpha = (1 - ph) * 0.6 * k;
      ctx.fillStyle = hash(i, 4) > 0.5 ? C.cyan : C.blue;
      ctx.fillRect(Math.round(sx), Math.round(sy), 1, 2);
    }
    const g = Math.sin(t * 22) > 0 ? 3 : 2;
    ctx.globalAlpha = 0.5 + 0.5 * k;
    ctx.fillStyle = C.pale;
    ctx.fillRect(Math.round(hx) - g, Math.round(hy), g * 2 + 1, 1);
    ctx.fillRect(Math.round(hx), Math.round(hy) - g, 1, g * 2 + 1);
    ctx.globalAlpha = 1;
  });
}

// ---------- the break ----------
// The sphere at (x, y), radius R, breaking: k 0..1 through it. Shards of it flung out and falling, turning, fading;
// a flash, and a ring of white going out.
function tri(ctx, ax, ay, bx, by, cx, cy) {
  // (a triangle filled a row of pixels at a time)
  const ys = [ay, by, cy], y0 = Math.round(Math.min(...ys)), y1 = Math.round(Math.max(...ys));
  const E = [[ax, ay, bx, by], [bx, by, cx, cy], [cx, cy, ax, ay]];
  for (let y = y0; y <= y1; y++) {
    let lo = Infinity, hi = -Infinity;
    for (const [x0, yA, x1, yB] of E) {
      if ((y < Math.min(yA, yB) - 0.5) || (y > Math.max(yA, yB) + 0.5) || yA === yB) continue;
      const k = Math.max(0, Math.min(1, (y - yA) / (yB - yA))), xx = x0 + (x1 - x0) * k;
      lo = Math.min(lo, xx); hi = Math.max(hi, xx);
    }
    if (lo <= hi) ctx.fillRect(Math.round(lo), y, Math.max(1, Math.round(hi) - Math.round(lo) + 1), 1);
  }
}
export function drawJcShatter(ctx, x, y, R, k, t, seed) {
  const T = k * 0.7;   // (its seconds)
  glowAt(ctx, x, y, R * (1.2 + 2 * k), [[0, `rgba(230, 250, 255, ${0.8 * (1 - k) ** 2})`], [0.4, `rgba(90, 190, 255, ${0.4 * (1 - k)})`], [1, 'rgba(40, 90, 255, 0)']]);
  lit(ctx, () => {
    // the ring going out, and white streaks flung out from the middle
    ctx.globalAlpha = Math.max(0, 1 - k * 1.6);
    ctx.fillStyle = C.core;
    pixArc(ctx, x, y, R + k * 70, R + k * 70, 0, 0, Math.PI * 2);
    ctx.fillStyle = C.cyan;
    pixArc(ctx, x, y, R * 0.8 + k * 50, R * 0.8 + k * 50, 0, 0, Math.PI * 2);
    for (let i = 0; i < 16; i++) {
      const a = hash(i, seed) * Math.PI * 2, d0 = R * 0.3 + k * R * 1.6, d1 = d0 + 10 + 16 * hash(i, 2);
      ctx.fillStyle = i % 2 ? C.pale : C.core;
      pixLine(ctx, x + Math.cos(a) * d0, y + Math.sin(a) * d0, x + Math.cos(a) * d1, y + Math.sin(a) * d1);
    }
    ctx.globalAlpha = 1;
  });
  // the shards
  for (let i = 0; i < JC_SHARDS; i++) {
    const a = hash(i, seed, 1) * Math.PI * 2, d = Math.sqrt(hash(i, seed, 2)) * R * 0.9, sp = 70 + 150 * hash(i, 3);
    const px = x + Math.cos(a) * (d + sp * T), py = y + Math.sin(a) * (d + sp * T) + 160 * T * T;
    const size = 3 + hash(i, 4) * 6, rot = hash(i, 5) * 6 + T * (6 + hash(i, 6) * 10) * (i % 2 ? 1 : -1);
    const pts = [0, 1, 2].map((j) => { const q = rot + j * 2.1 + hash(i, j + 7) * 0.8, s = size * (0.6 + 0.4 * hash(i, j + 10)); return [px + Math.cos(q) * s, py + Math.sin(q) * s * 0.8]; });
    ctx.globalAlpha = Math.max(0, 1 - k * k);
    ctx.fillStyle = i % 3 === 0 ? 'rgba(20, 40, 110, 0.9)' : i % 3 === 1 ? 'rgba(90, 200, 255, 0.75)' : 'rgba(190, 240, 255, 0.8)';
    tri(ctx, ...pts[0], ...pts[1], ...pts[2]);
    ctx.fillStyle = C.core;
    pixLine(ctx, ...pts[0], ...pts[1]);
    if (Math.sin(t * 20 + i * 3) > 0.6) ctx.fillRect(Math.round(pts[2][0]), Math.round(pts[2][1]), 1, 1);   // (a glint off it)
  }
  ctx.globalAlpha = 1;
}
