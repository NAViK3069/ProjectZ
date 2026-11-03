// The gold skills' looks, all in pixels. Golden fangs: a gold dagger - a gem at the pommel, a violet wrapped grip, a
// gold guard and a blade with a bright spine down it - and the streak of gold it leaves. Aurum: the gold sniper being
// built in the hands (a violet wireframe of it, a scan of light going along it) and, once it's there, the violet light
// running along its lines; its shot, a white-hot round with a long violet tail.

import { glowAt } from './pixfx.js';

const hash = (a, b, c = 0) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
const G = { ink: '#1e1004', deep: '#8a5a0a', mid: '#e0a820', lite: '#ffd85a', glint: '#fff6c8', grip: '#3a1450', wrap: '#7a3aa8', gem: '#e07aff' };
const V = { deep: '#3a0a7a', mid: '#7a3aff', lite: '#b88aff', pale: '#e8d8ff' };
const lit = (ctx, fn) => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; fn(); ctx.restore(); };

// ---------- golden fangs ----------
// The two daggers, pointing along a (the middle at x, y): each drawn once for each of 32 ways it can point, kept.
// A fang: long and slender, a gold blade sweeping to a point with a white edge and a violet line down it, a swept
// guard, a wrapped grip, a violet stone at the pommel. The mark: a kunai - a leaf of dark steel edged in gold with a
// crimson heart, a short grip bound in red, a gold ring at its end.
const FANG_TURNS = 32, FANG_SIZE = 29, fangArt = { fang: [], mark: [] };
const K = { steel: '#2a2430', steelHi: '#5a5068', red: '#ff3a4a', redLo: '#8a1020', ring: '#ffd25a' };
function daggerCell(kind, s, j) {
  const aj = Math.abs(j);
  if (kind === 'mark') {
    if (s < -6.5) { const r = Math.hypot(s + 8, j); return r > 0.7 && r < 1.9 ? (j < 0 ? G.lite : K.ring) : null; }   // (the ring)
    if (s < -2.5) return aj <= 0.8 ? (Math.round(s * 2) % 2 ? K.redLo : K.red) : null;                               // (the grip, bound in red)
    if (s < -1.5) return aj <= 2.1 ? (aj > 1.5 ? G.deep : G.mid) : null;                                             // (the guard)
    const w = s < 3 ? 1.1 + (s + 1.5) * 0.42 : 3 * (1 - (s - 3) / 7.5);   // (the leaf: widest a third of the way)
    if (aj > w) return null;
    if (aj > w - 0.55) return j < 0 ? G.glint : G.mid;   // (gold edges)
    if (aj < 0.5 && s > -1 && s < 6) return K.red;         // (the crimson heart)
    return j < 0 ? K.steelHi : K.steel;
  }
  if (s < -5.5) return aj <= 0.9 ? '#b88aff' : null;                                                     // (the stone)
  if (s < -2) return aj <= 0.7 ? (Math.round(s * 2) % 2 ? G.wrap : G.grip) : null;                       // (the grip, wrapped)
  if (s < -0.75) return aj <= 2.8 && !(aj > 1.6 && s > -1.25) ? (aj > 2 ? G.deep : s < -1.5 ? G.mid : G.lite) : null;   // (the guard, swept back)
  const w = 1.5 * (1 - s / 11.5) + 0.2 + 0.25 * Math.sin((s / 11) * Math.PI);   // (the blade: slender, swelling a touch, to a point)
  if (aj > w) return null;
  if (aj > w - 0.4 && j < 0) return '#ffffff';   // (the edge, white)
  if (aj < 0.35 && s > 0.5 && s < 8) return '#9a5aff';   // (the violet line down it)
  return j > 0 ? G.deep : G.mid;
}
function daggerCanvas(kind, i) {
  const art = fangArt[kind];
  if (art[i]) return art[i];
  const c = document.createElement('canvas');
  c.width = c.height = FANG_SIZE;
  const g = c.getContext('2d'), a = (i / FANG_TURNS) * Math.PI * 2, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux, mid = (FANG_SIZE - 1) / 2;
  const cells = new Map();
  for (let s = -10; s <= 11.01; s += 0.25) for (let j = -3.25; j <= 3.26; j += 0.25) {
    const col = daggerCell(kind, s, j);
    if (!col) continue;
    const x = Math.round(mid + ux * s + nx * j), y = Math.round(mid + uy * s + ny * j);
    cells.set(`${x},${y}`, [x, y, col]);
  }
  g.fillStyle = G.ink;
  for (const [x, y] of cells.values()) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!cells.has(`${x + dx},${y + dy}`)) g.fillRect(x + dx, y + dy, 1, 1);
  for (const [x, y, col] of cells.values()) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
  return (art[i] = c);
}
export function drawFang(ctx, x, y, a, kind = 'fang') {
  const i = ((Math.round((a / (Math.PI * 2)) * FANG_TURNS) % FANG_TURNS) + FANG_TURNS) % FANG_TURNS;
  ctx.drawImage(daggerCanvas(kind, i), Math.round(x - (FANG_SIZE - 1) / 2), Math.round(y - (FANG_SIZE - 1) / 2));
}
// The glint running down the blade now and then, and a soft gold light round it (after the lighting).
export function drawFangGlow(ctx, x, y, a, t, seed, back) {
  const ux = Math.cos(a), uy = Math.sin(a);
  glowAt(ctx, x + ux * 2, y + uy * 2, back ? 16 : 11, [[0, `rgba(255, 210, 90, ${back ? 0.4 : 0.26})`], [1, 'rgba(255, 170, 40, 0)']]);
  const ph = (t * 1.6 + seed) % 1;
  if (ph < 0.3) lit(ctx, () => {
    const s = -1 + (ph / 0.3) * 9;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(x + ux * s), Math.round(y + uy * s), 1, 1);
    ctx.globalAlpha = 0.6;
    ctx.fillRect(Math.round(x + ux * s) - 1, Math.round(y + uy * s), 3, 1);
    ctx.fillRect(Math.round(x + ux * s), Math.round(y + uy * s) - 1, 1, 3);
  });
}
// Behind one in flight: a streak of gold along where it's been (pts: newest first), thinning and breaking up into
// motes toward the end - brighter and longer on the way home.
export function drawFangTrail(ctx, pts, back, seed, mark = false) {
  if (!pts || pts.length < 2) return;
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.max(1, Math.ceil(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)));
  const second = mark ? '#ff3a4a' : '#9a5aff';
  lit(ctx, () => {
    let n = 0;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i], d = Math.hypot(q.x - p.x, q.y - p.y), steps = Math.max(1, Math.ceil(d)), nx = -(q.y - p.y) / (d || 1), ny = (q.x - p.x) / (d || 1);
      for (let s = 0; s < steps; s++, n++) {
        const k = 1 - n / (total + 1);
        if (k <= 0) return;
        const x = p.x + ((q.x - p.x) * s) / steps, y = p.y + ((q.y - p.y) * s) / steps;
        if (k < 0.4 && hash(n, 3, seed) > k * 2.2) continue;   // (breaking up)
        // two strands wound round the line of it, the gold over, the other under
        const w = Math.sin(n * 0.35 + seed) * (1.6 * k + 0.4);
        ctx.globalAlpha = k * (back ? 1 : 0.85);
        ctx.fillStyle = k > 0.8 ? '#ffffff' : k > 0.45 ? '#ffd25a' : '#c8861a';
        ctx.fillRect(Math.round(x + nx * w), Math.round(y + ny * w), 1, 1);
        ctx.globalAlpha = k * 0.75;
        ctx.fillStyle = second;
        ctx.fillRect(Math.round(x - nx * w), Math.round(y - ny * w), 1, 1);
        if (k > 0.55 && hash(n, 7, seed + Math.floor(n / 9)) > 0.86) {   // (glints thrown off it)
          ctx.globalAlpha = k;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(Math.round(x + nx * 3) - 1, Math.round(y + ny * 3), 3, 1);
          ctx.fillRect(Math.round(x + nx * 3), Math.round(y + ny * 3) - 1, 1, 3);
        }
      }
    }
  });
}
// Thrown: a flash of gold out of the hand
export function drawFangFlash(ctx, x, y, a, k) {
  if (k >= 1) return;
  glowAt(ctx, x, y, 26 * (1 - k) + 4, [[0, `rgba(255, 236, 160, ${0.7 * (1 - k)})`], [1, 'rgba(255, 170, 40, 0)']]);
  lit(ctx, () => {
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = '#fff6c8';
    for (let i = -2; i <= 2; i++) {
      const b = a + i * 0.155, r = 4 + k * 22;
      ctx.fillRect(Math.round(x + Math.cos(b) * r), Math.round(y + Math.sin(b) * r), 2, 1);
    }
  });
}

// The mark on whoever the sixth dagger's in: a gold diamond over them, turning, its corners flicking out, a violet
// heart to it.
// (on them all over: x, feet - a ring of gold turning at their feet, motes rising, a crimson glow)
export function drawFangMarked(ctx, x, feet, t) {
  glowAt(ctx, x, feet - 14, 22, [[0, `rgba(255, 60, 80, ${0.18 + 0.08 * Math.sin(t * 8)})`], [1, 'rgba(255, 40, 60, 0)']]);
  lit(ctx, () => {
    for (let j = 0; j < 6; j++) {
      const a0 = t * 2 + (j * Math.PI) / 3;
      ctx.fillStyle = j % 2 ? '#ffd85a' : '#ff6a7a';
      for (let q = 0; q < 6; q++) { const a = a0 + q * 0.09; ctx.fillRect(Math.round(x + Math.cos(a) * 11), Math.round(feet - 1 + Math.sin(a) * 2.5), 1, 1); }
    }
    for (let i = 0; i < 6; i++) {
      const ph = (t * 1.3 + i / 6) % 1;
      ctx.globalAlpha = 1 - ph;
      ctx.fillStyle = i % 2 ? '#ffd85a' : '#ff6a7a';
      ctx.fillRect(Math.round(x + Math.sin(i * 2.3 + t * 3) * 7), Math.round(feet - 2 - ph * 26), 1, 1);
    }
    ctx.globalAlpha = 1;
  });
}
// The way to whoever's marked, for the one who marked them: a faint dashed line of gold out to them, floating, still.
export function drawFangGuide(ctx, x0, y0, x1, y1, t) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
  if (L < 16) return;
  const ux = dx / L, uy = dy / L, bob = Math.sin(t * 2.5) * 1.2;
  lit(ctx, () => {
    ctx.fillStyle = '#ffd85a';
    for (let s = 12; s < L - 10; s += 1) {
      if (s % 6 > 2) continue;
      ctx.globalAlpha = 0.3 * Math.min(1, s / 30, (L - 10 - s) / 30);
      ctx.fillRect(Math.round(x0 + ux * s), Math.round(y0 + uy * s + bob), 1, 1);
    }
    ctx.globalAlpha = 1;
  });
}
// Behind a thrown dagger, as behind the gold sniper's shot: a long tail of gold, white near the blade, wavering,
// thinning and breaking up toward its end, motes shed off it (the kunai's: gold and crimson).
export function drawGoldShot(ctx, x, y, dx, dy, len, t, seed, mark = false) {
  const nx = -dy, ny = dx, L = Math.max(1, Math.round(len));
  lit(ctx, () => {
    for (let i = 4; i <= L; i++) {
      const k = 1 - i / L, px = x - dx * i, py = y - dy * i;
      const wob = Math.sin(i * 0.28 - t * 30 + seed) * (1 - k) * 1.4;
      if (k < 0.3 && hash(i, 1, seed) > k * 3) continue;
      ctx.globalAlpha = 0.2 + 0.8 * k;
      ctx.fillStyle = k > 0.8 ? '#ffffff' : k > 0.5 ? '#fff6c8' : k > 0.25 ? '#ffd25a' : mark ? '#ff4a5a' : '#c8861a';
      ctx.fillRect(Math.round(px + nx * wob), Math.round(py + ny * wob), 1, 1);
      if (k > 0.6) { ctx.globalAlpha = (k - 0.6) * 1.2; ctx.fillStyle = mark ? '#ff6a7a' : '#ffd25a'; ctx.fillRect(Math.round(px + nx * (wob + 1)), Math.round(py + ny * (wob + 1)), 1, 1); ctx.fillRect(Math.round(px - nx * (1 - wob)), Math.round(py - ny * (1 - wob)), 1, 1); }
      if (hash(i, 2, seed) > 0.95) { ctx.globalAlpha = k; ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(px + nx * 3 * (hash(i, 3, seed) - 0.5) * 2), Math.round(py + ny * 3 * (hash(i, 3, seed) - 0.5) * 2), 1, 1); }
    }
    ctx.globalAlpha = 1;
  });
}
export function drawFangMark(ctx, x, y, t) {
  lit(ctx, () => {
    const R = 5 + Math.sin(t * 6) * 0.8, a = t * 2.5;
    for (let j = 0; j < 4; j++) {
      const q = a + (j * Math.PI) / 2, cx = Math.round(x + Math.cos(q) * R), cy = Math.round(y + Math.sin(q) * R * 0.6);
      ctx.fillStyle = j % 2 ? '#ffd85a' : '#fff6c8';
      ctx.fillRect(cx, cy, 1, 1);
      ctx.fillRect(cx + Math.round(Math.cos(q) * 2), cy + Math.round(Math.sin(q) * 1.2), 1, 1);
    }
    ctx.fillStyle = '#b88aff';
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    // a line of gold dropping from it to them, flickering
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 14);
    ctx.fillStyle = '#ffd85a';
    for (let i = 4; i < 10; i += 2) ctx.fillRect(Math.round(x), Math.round(y) + i, 1, 1);
    ctx.globalAlpha = 1;
  });
}
// The dash, from (x0, y0) to where you are (x, y), k 0..1 through it: a streak of gold the way you went, white near
// you, glinting, and broken up behind.
export function drawFangDash(ctx, x0, y0, x, y, k, t) {
  const dx = x - x0, dy = y - y0, L = Math.hypot(dx, dy);
  if (L < 1) return;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  lit(ctx, () => {
    for (let i = 0; i <= L; i++) {
      const q = i / L;   // (0 at the start, 1 at you)
      if (q < 0.6 && hash(i, 3, Math.floor(t * 20)) > q * 1.6) continue;
      ctx.globalAlpha = 0.25 + 0.75 * q;
      ctx.fillStyle = q > 0.85 ? '#ffffff' : q > 0.5 ? '#fff6c8' : '#ffd85a';
      for (const j of q > 0.7 ? [-1, 0, 1] : [0]) ctx.fillRect(Math.round(x0 + ux * i + nx * j), Math.round(y0 + uy * i + ny * j), 1, 1);
    }
    for (let i = 0; i < 8; i++) {
      const s = hash(i, 5, Math.floor(t * 12)) * L, j = (hash(i, 6) - 0.5) * 12;
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = i % 2 ? '#ffd85a' : '#b88aff';
      ctx.fillRect(Math.round(x0 + ux * s + nx * j), Math.round(y0 + uy * s + ny * j), 1, 1);
    }
    ctx.globalAlpha = 1;
  });
}
// The cut as the dash gets there: a crescent of gold across them, white at its edge, k 0..1.
export function drawFangCut(ctx, x, y, a, k, seed) {
  if (k >= 1) return;
  lit(ctx, () => {
    ctx.globalAlpha = 1 - k;
    for (let j = 0; j < 4; j++) {
      const R = 14 - j * 2 + k * 6;
      ctx.fillStyle = j === 0 ? '#ffffff' : j < 2 ? '#fff6c8' : '#ffd85a';
      for (let i = 0; i <= 24; i++) {
        const q = a - 1.2 + (2.4 * i) / 24;
        ctx.fillRect(Math.round(x + Math.cos(q) * R * 0.6), Math.round(y + Math.sin(q) * R), 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  });
  glowAt(ctx, x, y, 22, [[0, `rgba(255, 220, 140, ${0.5 * (1 - k)})`], [1, 'rgba(255, 200, 90, 0)']]);
}

// ---------- aurum ----------
const GUN_LEN = 42;   // (about how far the sniper reaches, from a little behind the grip)
// Being built: ahead of the scan, a violet wireframe of the gun, flickering; the scan, a bar of white-violet light
// going out along it; motes of violet coming in to it from all round. k: 0 .. 1 of it.
export function drawAurumCast(ctx, sx, sy, aim, k, t) {
  const ux = Math.cos(aim), uy = Math.sin(aim), nx = -uy, ny = ux, at = (s, j) => [Math.round(sx + ux * s + nx * j), Math.round(sy + uy * s + ny * j)];
  const scan = -4 + k * (GUN_LEN + 6);
  lit(ctx, () => {
    // the wireframe: the outline of a long gun - stock, body, barrel - dotted, ahead of the scan
    ctx.fillStyle = V.mid;
    for (let s = -6; s <= GUN_LEN; s += 1) {
      if (s < scan) continue;
      const half = s < 13 ? 3.5 : s < 22 ? 2.5 : 2;   // (the stock, the body, the shroud)
      ctx.globalAlpha = (Math.floor(t * 30 + s) % 3 ? 0.75 : 0.35);
      if ((s & 1) === 0) { const [x, y] = at(s, -half); ctx.fillRect(x, y, 1, 1); const [x2, y2] = at(s, half); ctx.fillRect(x2, y2, 1, 1); }
      if (s % 6 === 0) for (let j = -half; j <= half; j++) { const [x, y] = at(s, j); ctx.fillRect(x, y, 1, 1); }   // (cross-ribs)
    }
    // the scan: a bar across it, white at the heart
    if (scan <= GUN_LEN) {
      for (let j = -5; j <= 5; j++) {
        const [x, y] = at(scan, j);
        ctx.globalAlpha = 1 - Math.abs(j) / 6;
        ctx.fillStyle = Math.abs(j) < 2 ? '#ffffff' : V.lite;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    // motes coming in
    for (let i = 0; i < 12; i++) {
      const s = hash(i, 1, 5) * GUN_LEN, r = (1 - k) * (8 + hash(i, 2, 5) * 22), b = hash(i, 3, 5) * Math.PI * 2;
      const [x, y] = at(s, 0);
      ctx.globalAlpha = 0.4 + 0.6 * k;
      ctx.fillStyle = i % 3 ? V.lite : '#ffd85a';
      ctx.fillRect(Math.round(x + Math.cos(b) * r), Math.round(y + Math.sin(b) * r), 1, 1);
    }
  });
  const [gx, gy] = at(Math.min(scan, GUN_LEN), 0);
  glowAt(ctx, gx, gy, 18, [[0, 'rgba(190, 140, 255, 0.45)'], [1, 'rgba(120, 60, 255, 0)']]);
}
// Built: now and then a pulse of violet light running down its lines to the muzzle, a mote or two coming off it, a
// faint violet glow at the end. left: 1 .. 0 of the time it's got.
export function drawAurumHum(ctx, sx, sy, aim, t, left) {
  const ux = Math.cos(aim), uy = Math.sin(aim), nx = -uy, ny = ux;
  const ph = (t * 1.5) % 1, s = -4 + ph * (GUN_LEN + 4);
  lit(ctx, () => {
    if (ph < 0.8) for (const j of [-1, 1]) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = V.lite;
      ctx.fillRect(Math.round(sx + ux * s + nx * j), Math.round(sy + uy * s + ny * j), 1, 1);
      ctx.globalAlpha = 0.4;
      ctx.fillRect(Math.round(sx + ux * (s - 1) + nx * j), Math.round(sy + uy * (s - 1) + ny * j), 1, 1);
    }
    for (let i = 0; i < 2; i++) {
      const q = (t * 0.9 + i * 0.5) % 1, d = hash(Math.floor(t * 0.9 + i * 0.5), i, 9) * GUN_LEN;
      ctx.globalAlpha = (1 - q) * 0.8;
      ctx.fillStyle = i ? '#ffd85a' : V.lite;
      ctx.fillRect(Math.round(sx + ux * d + nx * 2), Math.round(sy + uy * d + ny * 2 - q * 7), 1, 1);
    }
  });
  // the slots in the shroud: pulsing violet, one after another (where they are along it, from the back)
  for (let i = 0; i < 3; i++) {
    const s = 20.5 + i * 5, p = 0.5 + 0.5 * Math.sin(t * 7 - i * 1.3), x = sx + ux * s, y = sy + uy * s;
    if (left <= 0.15 && Math.sin(t * 30) < 0) continue;
    glowAt(ctx, x, y, 3 + p * 2, [[0, `rgba(200, 150, 255, ${0.12 + 0.18 * p})`], [1, 'rgba(140, 70, 255, 0)']]);
  }

}
// Off the muzzle at (x, y) as it fires along a (k 0..1): rings of violet and gold thrown forward along the shot, each
// further out and wider, thinning out; a flash; sparks of gold.
export function drawVioletMuzzle(ctx, x, y, a, k, t, seed) {
  if (k >= 1) return;
  const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
  glowAt(ctx, x, y, 14 + 10 * k, [[0, `rgba(230, 200, 255, ${0.7 * (1 - k) ** 2})`], [1, 'rgba(160, 90, 255, 0)']]);
  lit(ctx, () => {
    for (let j = 0; j < 3; j++) {
      const q = Math.min(1, k * 1.6 + j * 0.1), d = 3 + j * 7 + q * (8 + j * 6), w = 3 + j * 1.5 + q * (5 + j * 3);
      ctx.globalAlpha = (1 - k) * (1 - j * 0.2);
      ctx.fillStyle = j === 0 ? '#ffffff' : j === 1 ? V.lite : '#ffd85a';
      // (a ring seen edge on: a thin ellipse across the line of the shot)
      for (let i = 0; i < 28; i++) {
        const b = (i / 28) * Math.PI * 2, ex = Math.cos(b) * (1 + q), ey = Math.sin(b) * w;
        ctx.fillRect(Math.round(x + ux * (d + ex) + nx * ey), Math.round(y + uy * (d + ex) + ny * ey), 1, 1);
      }
    }
    for (let i = 0; i < 10; i++) {
      const s = 2 + hash(i, 1, seed) * 26 * Math.min(1, k * 2), j = (hash(i, 2, seed) - 0.5) * 14 * k;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = i % 2 ? '#ffd85a' : V.pale;
      ctx.fillRect(Math.round(x + ux * s + nx * j), Math.round(y + uy * s + ny * j), 1, 1);
    }
    ctx.globalAlpha = 1;
  });
}
// The line a shot leaves from (x0, y0) to where it stopped (x1, y1), lingering, k 0..1 as it goes: a thin violet line
// with gold glints running along it, breaking up into motes as it fades.
export function drawVioletTrace(ctx, x0, y0, x1, y1, k, t, seed) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
  if (L < 2 || k >= 1) return;
  const ux = dx / L, uy = dy / L;
  lit(ctx, () => {
    for (let i = 0; i < L; i += 1) {
      if (hash(Math.floor(i / 2), 4, seed) < k * 1.2) continue;   // (breaking up)
      ctx.globalAlpha = (1 - k) * 0.55;
      ctx.fillStyle = V.mid;
      ctx.fillRect(Math.round(x0 + ux * i), Math.round(y0 + uy * i), 1, 1);
    }
    for (let i = 0; i < 18; i++) {
      const s = ((hash(i, 5, seed) + t * 0.6) % 1) * L, tw = Math.sin(t * 20 + i * 3);
      if (tw < 0) continue;
      const x = Math.round(x0 + ux * s), y = Math.round(y0 + uy * s - k * 8 * hash(i, 6, seed));
      ctx.globalAlpha = (1 - k) * tw;
      ctx.fillStyle = i % 3 ? '#ffd85a' : '#ffffff';
      ctx.fillRect(x - 1, y, 3, 1);
      ctx.fillRect(x, y - 1, 1, 3);
    }
    ctx.globalAlpha = 1;
  });
}
// Its shot at (x, y), going (dx, dy) (unit): a white-hot round, a violet tail len long behind it - wavering, thinning
// and breaking up toward its end, motes shed off it.
export function drawVioletShot(ctx, x, y, dx, dy, len, t, seed) {
  const nx = -dy, ny = dx, L = Math.max(1, Math.round(len));
  lit(ctx, () => {
    for (let i = 0; i <= L; i++) {
      const k = 1 - i / L, px = x - dx * i, py = y - dy * i;
      const wob = Math.sin(i * 0.3 - t * 30 + seed) * (1 - k) * 1.6;
      if (k < 0.3 && hash(i, 1, seed) > k * 3) continue;
      ctx.globalAlpha = 0.2 + 0.8 * k;
      ctx.fillStyle = V.mid;
      ctx.fillRect(Math.round(px + nx * (wob - 1)), Math.round(py + ny * (wob - 1)), 1, 1);
      ctx.fillRect(Math.round(px + nx * (wob + 1)), Math.round(py + ny * (wob + 1)), 1, 1);
      ctx.fillStyle = k > 0.85 ? '#ffffff' : k > 0.5 ? V.pale : V.lite;
      ctx.fillRect(Math.round(px + nx * wob), Math.round(py + ny * wob), 1, 1);
      if (k > 0.6 && k < 0.95) { ctx.globalAlpha = 0.25 * k; ctx.fillStyle = V.deep; ctx.fillRect(Math.round(px + nx * (wob - 2)), Math.round(py + ny * (wob - 2)), 1, 1); ctx.fillRect(Math.round(px + nx * (wob + 2)), Math.round(py + ny * (wob + 2)), 1, 1); }
    }
    // motes coming off the tail
    for (let j = 0; j < 6; j++) {
      const i = Math.floor(hash(j, 2, seed) * L), k = 1 - i / L, off = (hash(j, 3, seed) - 0.5) * 10 * (1 - k) + Math.sign(hash(j, 4, seed) - 0.5) * 2;
      ctx.globalAlpha = 0.7 * k;
      ctx.fillStyle = j % 2 ? V.pale : '#ffd85a';
      ctx.fillRect(Math.round(x - dx * i + nx * off), Math.round(y - dy * i + ny * off), 1, 1);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(x - 1), Math.round(y - 1), 3, 3);
    ctx.fillStyle = V.pale;
    ctx.fillRect(Math.round(x - 2), Math.round(y), 1, 1);
    ctx.fillRect(Math.round(x + 2), Math.round(y), 1, 1);
    ctx.fillRect(Math.round(x), Math.round(y - 2), 1, 1);
    ctx.fillRect(Math.round(x), Math.round(y + 2), 1, 1);
  });
  glowAt(ctx, x, y, 14, [[0, 'rgba(200, 150, 255, 0.5)'], [1, 'rgba(120, 50, 255, 0)']]);
}
