// The gold skills' looks, all in pixels. Golden fangs: a gold dagger - a gem at the pommel, a violet wrapped grip, a
// gold guard and a blade with a bright spine down it - and the streak of gold it leaves. Aurum: the gold sniper being
// built in the hands (a violet wireframe of it, a scan of light going along it) and, once it's there, the violet light
// running along its lines; its shot, a white-hot round with a long violet tail.

import { glowAt } from './pixfx.js';

const hash = (a, b, c) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
const G = { ink: '#1e1004', deep: '#8a5a0a', mid: '#e0a820', lite: '#ffd85a', glint: '#fff6c8', grip: '#3a1450', wrap: '#7a3aa8', gem: '#e07aff' };
const V = { deep: '#3a0a7a', mid: '#7a3aff', lite: '#b88aff', pale: '#e8d8ff' };
const lit = (ctx, fn) => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; fn(); ctx.restore(); };

// ---------- golden fangs ----------
// One dagger, pointing along a (the middle at x, y): drawn once for each of 32 ways it can point, kept.
const FANG_TURNS = 32, FANG_SIZE = 23, fangArt = [];
function fangCanvas(i) {
  if (fangArt[i]) return fangArt[i];
  const c = document.createElement('canvas');
  c.width = c.height = FANG_SIZE;
  const g = c.getContext('2d'), a = (i / FANG_TURNS) * Math.PI * 2, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux, mid = (FANG_SIZE - 1) / 2;
  const cells = new Map();
  // along it from the pommel (-6) to the tip (8): what's across it there
  for (let s = -6; s <= 8.01; s += 0.25) for (let j = -2.75; j <= 2.76; j += 0.25) {
    const aj = Math.abs(j);
    let col = null;
    if (s < -4.5) { if (aj <= 0.9) col = G.gem; }
    else if (s < -1.5) { if (aj <= 0.7) col = Math.round(s * 2) % 2 ? G.wrap : G.grip; }   // the grip, wrapped
    else if (s < -0.25) { if (aj <= 2.75) col = aj > 2 ? G.deep : s < -1 ? G.mid : G.lite; }   // the guard, swept out either side
    else {
      const w = 1.7 * (1 - s / 8.6) + 0.15;   // (the blade: wide at the guard, to a point)
      if (aj <= w) col = aj < 0.45 && s < 7 ? G.glint : j > 0 ? G.deep : G.mid;
      if (aj <= w && aj > w - 0.4 && j < 0) col = G.lite;   // (the edge catching the light)
    }
    if (!col) continue;
    const x = Math.round(mid + ux * s + nx * j), y = Math.round(mid + uy * s + ny * j);
    cells.set(`${x},${y}`, [x, y, col]);
  }
  g.fillStyle = G.ink;
  for (const [x, y] of cells.values()) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!cells.has(`${x + dx},${y + dy}`)) g.fillRect(x + dx, y + dy, 1, 1);
  for (const [x, y, col] of cells.values()) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
  return (fangArt[i] = c);
}
export function drawFang(ctx, x, y, a) {
  const i = ((Math.round((a / (Math.PI * 2)) * FANG_TURNS) % FANG_TURNS) + FANG_TURNS) % FANG_TURNS;
  ctx.drawImage(fangCanvas(i), Math.round(x - (FANG_SIZE - 1) / 2), Math.round(y - (FANG_SIZE - 1) / 2));
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
export function drawFangTrail(ctx, pts, back, seed) {
  if (!pts || pts.length < 2) return;
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.max(1, Math.ceil(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)));
  lit(ctx, () => {
    let n = 0;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i], d = Math.hypot(q.x - p.x, q.y - p.y), steps = Math.max(1, Math.ceil(d));
      for (let s = 0; s < steps; s++, n++) {
        const k = 1 - n / (total + 1);
        if (k <= 0) return;
        const x = p.x + ((q.x - p.x) * s) / steps, y = p.y + ((q.y - p.y) * s) / steps;
        if (k < 0.45 && hash(n, 3, seed) > k * 2) continue;   // (breaking up)
        ctx.globalAlpha = k * (back ? 0.95 : 0.7);
        ctx.fillStyle = k > 0.75 ? '#fff6c8' : k > 0.4 ? '#ffd25a' : '#c8861a';
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
        if (back && k > 0.6) { ctx.globalAlpha = k * 0.35; ctx.fillRect(Math.round(x), Math.round(y) + 1, 1, 1); }
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

// ---------- aurum ----------
const GUN_LEN = 30;   // (about how far the sniper reaches from the shoulder)
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
      const half = s < 2 ? 2.5 : s < 14 ? 2 : 1;
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
  // (running out: it flickers)
  if (left > 0.15 || Math.sin(t * 30) > 0) glowAt(ctx, sx + ux * GUN_LEN, sy + uy * GUN_LEN, 10, [[0, 'rgba(170, 110, 255, 0.35)'], [1, 'rgba(120, 60, 255, 0)']]);
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
