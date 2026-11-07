// The guanyin skill's look, all in pixels: a towering golden bodhisattva behind whoever called it - seated up on a
// lotus throne (a slab, a row of petals, a plinth), its robe draped down over it, ribbons of light off its shoulders,
// a ribbed chest, a serene face under a tall crown, a halo turning - and sixteen arms, every one a real one: shoulder,
// upper arm, elbow, forearm, wrist, a hand with fingers jointed twice over. Two are its own, the hands joined in prayer
// before its chest; the fourteen others are spread in tiers round it (the top pair held up high, the middle ones out to
// the sides, the low ones down). Called, they unfold from its sides. To strike, whichever arm's hand is nearest the spot
// - the praying ones too - reaches out to it (the elbow worked out by reaching: two-bone IK, bending the way that arm
// bends), slaps down, and goes back to where it was. Each arm keeps its own place in front of or behind the body, and
// its own size, out or at rest.

import { pixLine, glowAt } from './pixfx.js';
import { makeCanvas } from '../engine/pixel.js';

const hash = (a, b, c = 0) => { const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return v - Math.floor(v); };
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (k) => 1 - Math.pow(1 - clamp(k), 3);
const easeIn = (k) => Math.pow(clamp(k), 2.2);
const lit = (ctx, fn) => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; fn(); ctx.restore(); };
const turn = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;   // (an angle part of the way round to another)
// gold, light to dark
const G = ['#ffffff', '#fff6d0', '#ffe08a', '#ffc23a', '#d88a1a', '#8a5410', '#3a2208'];

// ---------- the arms: where they are ----------
// Fourteen spread round it, seven a side, top to bottom: the shoulder (from its foot), the upper arm's and the forearm's
// way at rest (radians, on the right side - the left's mirrored), their lengths; then its own two, in prayer: down from
// the shoulders to the elbows, in to the middle of the chest, the hands turned up (ha) and joined. front: drawn in front
// of the body (the praying pair) - the others are behind it.
const A1 = [-1.38, -0.95, -0.42, -0.08, 0.26, 0.6, 0.95];
const A2 = [-1.62, -1.48, -1.02, -0.12, -0.5, 0.16, 0.55];
const L1 = [34, 32, 31, 30, 29, 27, 25], L2 = [31, 29, 28, 28, 27, 25, 23];
export const GUAN_ARMS = [];
for (const s of [-1, 1]) for (let i = 0; i < 7; i++) GUAN_ARMS.push({ s, i, sx: s * (15 - i * 0.4), sy: -157 + i * 6.5, a1: A1[i], a2: A2[i], l1: L1[i], l2: L2[i] });
for (const s of [-1, 1]) GUAN_ARMS.push({ s, i: 7, sx: s * 15, sy: -156, a1: 1.25, a2: -2.47, l1: 26, l2: 24, ha: -Math.PI / 2, pray: true, front: true });
// An arm at rest (n: which), the avatar's foot at (x, y): { sx, sy (shoulder), ex, ey (elbow), hx, hy (wrist), ha (the
// way the hand points) } - swaying a little as it breathes (t), and spread out only as far as `spread` (0: folded down
// its sides .. 1). (The praying pair: always in prayer, and still.)
export function armRest(n, x, y, t, spread = 1) {
  const A = GUAN_ARMS[n], k = A.pray ? 1 : ease(spread), sw = A.pray ? 0 : Math.sin(t * 1.3 + A.i * 0.9 + A.s) * 0.05;
  const a1 = 1.4 + (A.a1 - 1.4) * k + sw, a2 = 1.5 + (A.a2 - 1.5) * k + sw * 1.6;
  const dir = (a) => (A.s > 0 ? [Math.cos(a), Math.sin(a)] : [-Math.cos(a), Math.sin(a)]);
  const [ux, uy] = dir(a1), [fx, fy] = dir(a2);
  const sx = x + A.sx, sy = y + A.sy, ex = sx + ux * A.l1, ey = sy + uy * A.l1;
  return { sx, sy, ex, ey, hx: ex + fx * A.l2, hy: ey + fy * A.l2, ha: A.ha ?? Math.atan2(fy, fx) };
}

// ---------- the striking ----------
// An arm's strike: drawn back (wind), thrown out to the spot (go: quickening - the slap lands at the end of it), held
// there a moment, drawn back in to where it was.
export const ARM_WIND = 0.12, ARM_GO = 0.12, ARM_HOLD = 0.14, ARM_BACK = 0.3, ARM_T = ARM_WIND + ARM_GO + ARM_HOLD + ARM_BACK;
// Where its hand is at a.t (a: { t, tx, ty }), from its place at rest (r: armRest's): { x, y, open (0 closed .. 1
// spread), w (how far it's out of its pose at rest: 0 .. 1 - its hand turns from its own way to along the forearm) }.
export function guanHand(a, r) {
  const rest = { x: r.hx, y: r.hy }, back = { x: r.hx - (r.hx - r.sx) * 0.35, y: r.hy - (r.hy - r.sy) * 0.35 - 14 };
  const lerp = (p, q, k) => ({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k });
  let t = a.t;
  if (t < ARM_WIND) { const k = ease(t / ARM_WIND); return { ...lerp(rest, back, k), open: 0.2, w: k }; }
  t -= ARM_WIND;
  if (t < ARM_GO) { const k = easeIn(t / ARM_GO); return { ...lerp(back, { x: a.tx, y: a.ty }, k), open: 0.2 + 0.8 * k, w: 1 }; }
  t -= ARM_GO;
  if (t < ARM_HOLD) { const j = (1 - t / ARM_HOLD) * 2; return { x: a.tx + Math.sin(t * 90) * j, y: a.ty + Math.cos(t * 70) * j, open: 1, w: 1 }; }
  t -= ARM_HOLD;
  const k = ease(t / ARM_BACK);
  return { ...lerp({ x: a.tx, y: a.ty }, rest, k), open: 1 - 0.8 * k, w: 1 - k };
}
// The elbow, for a hand at (hx, hy) from the shoulder (sx, sy): two bones (the arm's own lengths, stretched if it has to
// reach further), bending to the side `bend` (+1 / -1) as that arm does at rest.
export function reachElbow(n, sx, sy, hx, hy, bend) {
  const A = GUAN_ARMS[n], dx = hx - sx, dy = hy - sy, d = Math.hypot(dx, dy) || 1;
  const sc = Math.max(1, d / ((A.l1 + A.l2) * 0.94)), l1 = A.l1 * sc, l2 = A.l2 * sc;
  const along = (d * d + l1 * l1 - l2 * l2) / (2 * d), off = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const ux = dx / d, uy = dy / d;
  return { ex: sx + ux * along - uy * off * bend, ey: sy + uy * along + ux * off * bend };
}
// which way an arm bends (from its place at rest)
export const bendOf = (r) => Math.sign((r.ex - r.sx) * (r.hy - r.sy) - (r.ey - r.sy) * (r.hx - r.sx)) * -1 || 1;

// ---------- drawing the arms ----------
function seg(ctx, x0, y0, x1, y1, w0, w1, col) {
  ctx.fillStyle = col;
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  for (let i = 0; i <= n; i++) {
    const k = i / Math.max(1, n), w = Math.max(1, Math.round(w0 + (w1 - w0) * k));
    ctx.fillRect(Math.round(x0 + (x1 - x0) * k - w / 2), Math.round(y0 + (y1 - y0) * k - w / 2), w, w);
  }
}
function disc(ctx, x, y, r, col) {
  ctx.fillStyle = col;
  for (let j = -r; j <= r; j++) { const w = Math.round(Math.sqrt(Math.max(0, r * r - j * j + r * 0.6))); ctx.fillRect(Math.round(x - w), Math.round(y + j), w * 2 + 1, 1); }
}
// A bone of the arm: gold, lined dark, ridged across like plates of it, lit along one edge
function bone(ctx, x0, y0, x1, y1, w0, w1) {
  seg(ctx, x0, y0, x1, y1, w0 + 2, w1 + 2, G[6]);
  seg(ctx, x0, y0, x1, y1, w0, w1, G[3]);
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1, nx = dy / d, ny = -dx / d, s = ny > 0 ? -1 : 1;
  seg(ctx, x0 + nx * s * w0 * 0.3, y0 + ny * s * w0 * 0.3, x1 + nx * s * w1 * 0.3, y1 + ny * s * w1 * 0.3, Math.max(1, w0 * 0.3), Math.max(1, w1 * 0.3), G[1]);
  seg(ctx, x0 - nx * s * w0 * 0.38, y0 - ny * s * w0 * 0.38, x1 - nx * s * w1 * 0.38, y1 - ny * s * w1 * 0.38, 1, 1, G[4]);
  ctx.fillStyle = G[5];
  for (let k = 7; k < d - 4; k += 7) {
    const cx = x0 + (dx * k) / d, cy = y0 + (dy * k) / d, w = (w0 + (w1 - w0) * (k / d)) / 2 - 0.5;
    pixLine(ctx, cx - nx * w, cy - ny * w, cx + nx * w, cy + ny * w);
  }
}
// A hand at the wrist (hx, hy), pointing the way ha: a palm, four fingers of two joints each, a thumb (on the side
// `side` puts it). spread: how far the fingers fan; curl: how far they're curled in (0: straight).
function hand(ctx, hx, hy, ha, spread, curl, side) {
  const ux = Math.cos(ha), uy = Math.sin(ha), vx = -uy * side, vy = ux * side;
  const at = (u, v) => [hx + ux * u + vx * v, hy + uy * u + vy * v];
  const [b0x, b0y] = at(-2, -4), [b1x, b1y] = at(-2, 4);   // (the bracelet round the wrist)
  seg(ctx, b0x, b0y, b1x, b1y, 3, 3, G[6]); seg(ctx, b0x, b0y, b1x, b1y, 1, 1, G[0]);
  const palm = [at(0, -4), at(10, -5), at(11, 5), at(0, 4)];
  const xs = palm.map((p) => p[0]), ys = palm.map((p) => p[1]);
  ctx.fillStyle = G[2];
  for (let y = Math.floor(Math.min(...ys)) - 1; y <= Math.ceil(Math.max(...ys)) + 1; y++) for (let x = Math.floor(Math.min(...xs)) - 1; x <= Math.ceil(Math.max(...xs)) + 1; x++) {
    let inside = false;
    for (let i = 0, j = 3; i < 4; j = i++) {
      const [xi, yi] = palm[i], [xj, yj] = palm[j];
      if ((yi > y + 0.5) !== (yj > y + 0.5) && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) ctx.fillRect(x, y, 1, 1);
  }
  for (let i = 0; i < 4; i++) { const [p0x, p0y] = palm[i], [p1x, p1y] = palm[(i + 1) % 4]; seg(ctx, p0x, p0y, p1x, p1y, 1, 1, G[5]); }
  const sp = clamp(spread), cu = clamp(curl);
  [[-4, 6, 5], [-1.3, 7, 5], [1.3, 7, 5], [4, 5, 4]].forEach(([v, l1, l2]) => {
    const [bx, by] = at(10.5, v), a1 = ha + side * ((v / 4) * 0.34 * sp + cu * 1.2), a2 = a1 + side * cu * 1.4;
    const jx = bx + Math.cos(a1) * l1, jy = by + Math.sin(a1) * l1, tx = jx + Math.cos(a2) * l2, ty = jy + Math.sin(a2) * l2;
    seg(ctx, bx, by, jx, jy, 4, 4, G[6]); seg(ctx, jx, jy, tx, ty, 4, 3, G[6]);
    seg(ctx, bx, by, jx, jy, 2, 2, G[2]); seg(ctx, jx, jy, tx, ty, 2, 2, G[2]);
    ctx.fillStyle = G[4]; ctx.fillRect(Math.round(jx), Math.round(jy), 1, 1);
    ctx.fillStyle = G[0]; ctx.fillRect(Math.round(tx), Math.round(ty), 1, 1);
  });
  const [qx, qy] = at(3, -5), ta = ha - side * (0.9 + 0.4 * sp - cu * 0.9);
  const kx = qx + Math.cos(ta) * 6, ky = qy + Math.sin(ta) * 6, ta2 = ta + side * (cu * 1.0 + 0.2), t2x = kx + Math.cos(ta2) * 4, t2y = ky + Math.sin(ta2) * 4;
  seg(ctx, qx, qy, kx, ky, 5, 4, G[6]); seg(ctx, kx, ky, t2x, t2y, 4, 3, G[6]);
  seg(ctx, qx, qy, kx, ky, 3, 2, G[2]); seg(ctx, kx, ky, t2x, t2y, 2, 2, G[2]);
}
// A hand in prayer, its wrist at (hx, hy), standing straight up, its palm pressed to the other's along the middle (the
// side of it toward the middle: side -1 the left hand, 1 the right): the heel of the palm, the palm, four fingers held
// together - the lines between them, the joints across them - tapering up to the tips, the thumb laid up the front of
// it by the seam, a bracelet at the wrist. Together, the two make the joined hands.
function prayHand(ctx, hx, hy, side) {
  const cx = Math.round(hx - side * 4), y0 = Math.round(hy);
  const at = (col, dx, dy) => { ctx.fillStyle = col; ctx.fillRect(cx + side * dx, y0 - dy, 1, 1); };
  // how wide it is, row by row up from the wrist
  const W = [5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 5, 5, 5, 5, 4, 4, 3, 2, 1];
  W.forEach((w, dy) => {
    for (let dx = 0; dx <= w; dx++) at(dx === 0 ? G[5] : dx === w ? G[4] : side < 0 ? G[2] : G[3], dx, dy);
    at(G[6], w + 1, dy);   // (the line round its outer edge)
  });
  at(G[6], 0, W.length); at(G[6], 1, W.length);   // (and over the tips)
  // the light down its outer side, the fingers' lines, the joints across them
  for (let dy = 2; dy < 18; dy++) at(G[1], W[dy] - 1, dy);
  for (let dy = 11; dy < 19; dy++) { if (W[dy] > 3) at(G[5], 2, dy); if (W[dy] > 4) at(G[5], 4, dy); }
  for (let dx = 1; dx < 6; dx++) { at(G[1], dx, 10); at(G[4], dx, 15); }
  // the thumb, up the front by the seam
  for (let dy = 2; dy <= 9; dy++) { at(G[1], 1, dy); at(dy === 9 ? G[1] : G[2], 2, dy); }
  at(G[5], 3, 4); at(G[5], 3, 6); at(G[5], 3, 8); at(G[0], 1, 9);
  // the bracelet at the wrist
  for (let dx = 0; dx <= 6; dx++) { at(G[6], dx, -1); at(dx % 2 ? G[0] : G[2], dx, -2); }
}
// Arm n as it is now (strike: its strike, if it's out on one), its foot at (x, y): the shoulder, the elbow, the wrist,
// the hand's way and its fingers. Out, the elbow's found by reaching; the hand turns from its own way at rest to along
// the forearm, its fingers from how they rest to spread as it lands.
function armNow(n, x, y, t, spread, strike) {
  const A = GUAN_ARMS[n], r = armRest(n, x, y, t, spread), rs = A.pray ? [0, 0] : [0.55 + 0.1 * Math.sin(t * 2 + n), 0.25];
  if (!strike) return { ...r, spread: rs[0], curl: rs[1], w: 0 };
  const h = guanHand(strike, r), e = reachElbow(n, r.sx, r.sy, h.x, h.y, bendOf(r)), along = Math.atan2(h.y - e.ey, h.x - e.ex);
  return { sx: r.sx, sy: r.sy, ex: e.ex, ey: e.ey, hx: h.x, hy: h.y, ha: turn(r.ha, along, h.w), spread: rs[0] + (h.open - rs[0]) * h.w, curl: rs[1] + ((1 - h.open) * 0.9 - rs[1]) * h.w, open: h.open, w: h.w };
}
function drawArm(ctx, p, side, pray) {
  bone(ctx, p.sx, p.sy, p.ex, p.ey, 7, 6);
  bone(ctx, p.ex, p.ey, p.hx, p.hy, 6, 5);
  disc(ctx, p.sx, p.sy, 4, G[6]); disc(ctx, p.sx, p.sy, 3, G[3]); disc(ctx, p.sx - 1, p.sy - 1, 1, G[1]);
  disc(ctx, p.ex, p.ey, 4, G[6]); disc(ctx, p.ex, p.ey, 3, G[4]); disc(ctx, p.ex, p.ey, 1, G[2]);
  // (its own two hands, at rest - or nearly back - in prayer; out, a hand like the others)
  if (pray && p.w < 0.2) prayHand(ctx, p.hx, p.hy, side);
  else hand(ctx, p.hx, p.hy, p.ha, p.spread, p.curl, side);
}
// Its arms (the avatar's foot at x, y), behind the body (front false) or the praying pair in front of it (front true) -
// those out striking (strikes: arm number -> its strike) drawn where they've got to, on the same side of the body as
// ever. spread: how far unfolded.
export function drawGuanArms(ctx, x, y, t, spread, strikes, front, fade = 1) {
  if (spread <= 0 || fade <= 0) return;
  ctx.save();
  ctx.globalAlpha = 0.95 * fade;
  // (the low ones first: the ones above them are drawn over them; one out striking over the ones at rest)
  const order = [];
  for (let n = GUAN_ARMS.length - 1; n >= 0; n--) if (!!GUAN_ARMS[n].front === front) order.push(n);
  order.sort((a, b) => (strikes.has(a) ? 1 : 0) - (strikes.has(b) ? 1 : 0));
  for (const n of order) drawArm(ctx, armNow(n, x, y, t, spread, strikes.get(n)), GUAN_ARMS[n].s, GUAN_ARMS[n].pray);
  ctx.restore();
}
// The light of an arm out striking (after the lighting): round its hand, running down it, flashing off the hand as it
// lands.
export function drawGuanStrikeGlow(ctx, x, y, a, t) {
  const p = armNow(a.slot, x, y, t, 1, a);
  glowAt(ctx, p.hx, p.hy, 26 + 22 * p.open, [[0, 'rgba(255, 220, 120, 0.45)'], [1, 'rgba(255, 170, 50, 0)']]);
  lit(ctx, () => {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = G[1];
    for (let i = 0; i < 6; i++) {
      const k = (t * 3 + i / 6) % 1, up = k < 0.5, kk = up ? k * 2 : (k - 0.5) * 2;
      const px = up ? p.sx + (p.ex - p.sx) * kk : p.ex + (p.hx - p.ex) * kk, py = up ? p.sy + (p.ey - p.sy) * kk : p.ey + (p.hy - p.ey) * kk;
      ctx.fillRect(Math.round(px), Math.round(py - 1), 2, 2);
    }
    if (p.open > 0.9) {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = G[0];
      for (let i = 0; i < 8; i++) { const b = (i / 8) * Math.PI * 2 + hash(i, 1, a.seed); pixLine(ctx, p.hx + Math.cos(b) * 12, p.hy + Math.sin(b) * 12, p.hx + Math.cos(b) * (18 + hash(i, 2, a.seed) * 8), p.hy + Math.sin(b) * (18 + hash(i, 2, a.seed) * 8)); }
    }
  });
}

// ---------- the body ----------
export const GUAN_W = 120, GUAN_H = 214;   // (its picture: its foot in the middle of the bottom row)
let BODY = null;
function body() {
  if (BODY) return BODY;
  const [c, g] = makeCanvas(GUAN_W, GUAN_H);
  const cx = GUAN_W / 2, Y = GUAN_H;   // (drawn from its foot: y up is minus)
  const px = (col, x, y, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(Math.round(cx + x), Math.round(Y + y), w, h); };
  const sg = (x0, y0, x1, y1, w0, w1, col) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let i = 0; i <= n; i++) { const k = i / Math.max(1, n), w = Math.max(1, Math.round(w0 + (w1 - w0) * k)); px(col, x0 + (x1 - x0) * k - w / 2, y0 + (y1 - y0) * k - w / 2, w, w); }
  };
  const dsc = (x, y, r, col) => { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r + r * 0.6) px(col, x + i, y + j); };
  const oval = (x, y, rx, ry, col) => { for (let j = -ry; j <= ry; j++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (j / ry) ** 2))); px(col, x - w, y + j, w * 2 + 1, 1); } };
  const poly = (pts, col) => {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y + 0.5) !== (yj > y + 0.5) && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) px(col, x, y);
    }
  };
  // ---- the throne: a plinth, a row of lotus petals round it, a slab on top ----
  poly([[-40, -11], [40, -11], [42, 0], [-42, 0]], G[4]);   // the plinth
  sg(-41, -10, 41, -10, 1, 1, G[2]); sg(-42, -4, 42, -4, 1, 1, G[5]);
  poly([[-36, -27], [36, -27], [38, -11], [-38, -11]], G[5]);   // the petals' tier, dark between them
  for (let i = 0; i < 6; i++) {
    const x0 = -36 + i * 12.4, mid = x0 + 6;
    // a petal: a rounded arch, a ridge down it, its edge lit
    poly([[x0 + 0.5, -11], [x0 + 0.5, -18], [x0 + 2, -23], [mid, -26], [x0 + 10, -23], [x0 + 11.5, -18], [x0 + 11.5, -11]], G[3]);
    poly([[x0 + 2.5, -12], [x0 + 2.5, -18], [x0 + 4, -21], [mid, -23], [x0 + 8, -21], [x0 + 9.5, -18], [x0 + 9.5, -12]], G[4]);
    sg(mid, -22, mid, -13, 1, 1, G[3]);
    sg(x0 + 2, -22, mid, -25, 1, 1, G[1]);
  }
  poly([[-37, -33], [37, -33], [36, -27], [-36, -27]], G[3]);   // the slab
  sg(-37, -33, 37, -33, 1, 1, G[1]); sg(-36, -28, 36, -28, 1, 1, G[5]);
  // ribbons of light off its shoulders, flowing down and out round it to the throne
  for (const s of [-1, 1]) {
    let lx = s * 14, ly = -150;
    for (let k = 1; k <= 24; k++) {
      const nx = s * (14 + Math.sin(k * 0.26) * 9 + k * 0.9), ny = -150 + k * 4.9;
      sg(lx, ly, nx, ny, 3, 3, G[3]); sg(lx - s, ly, nx - s, ny, 1, 1, G[1]);
      lx = nx; ly = ny;
    }
  }
  // the robe: down from the waist, widening, draped over the slab in heavy folds
  poly([[-13, -112], [13, -112], [22, -84], [28, -56], [31, -38], [27, -30], [18, -33], [9, -29], [0, -32], [-9, -29], [-18, -33], [-27, -30], [-31, -38], [-28, -56], [-22, -84]], G[3]);
  for (const [x0, x1, col] of [[-9, -14, G[4]], [-4, -6, G[4]], [4, 4, G[4]], [9, 13, G[4]], [-12, -22, G[2]], [12, 22, G[2]]]) {
    let lx = x0, ly = -110;
    for (let k = 1; k <= 10; k++) { const yy = -110 + k * 7.8, xx = x0 + (x1 - x0) * (k / 10) + Math.sin(k * 0.7) * 1.5; sg(lx, ly, xx, yy, 1, 1, col); lx = xx; ly = yy; }
  }
  // (the hem's folds hanging over the slab's edge)
  for (const x of [-24, -13, -4, 5, 14, 23]) { sg(x, -36, x + 1, -29, 3, 2, G[3]); sg(x - 1, -36, x, -30, 1, 1, G[1]); }
  sg(0, -112, 0, -40, 4, 3, G[4]); sg(-1, -112, -1, -42, 1, 1, G[1]);   // (the sash hanging down the middle)
  // the body: shoulders to waist, the ribs of it across the chest
  poly([[-17, -160], [17, -160], [13, -110], [-13, -110]], G[2]);
  sg(-17, -160, -13, -110, 2, 2, G[3]); sg(17, -160, 13, -110, 2, 2, G[3]);
  for (let i = 0; i < 6; i++) {
    const yy = -152 + i * 6.5, w = 14 - i * 0.6;
    for (let x = -w; x <= w; x++) px(G[4], x, yy + Math.round((x * x) / 60));
    for (let x = -w + 1; x < w; x++) px(G[1], x, yy - 1 + Math.round((x * x) / 60));
  }
  sg(0, -158, 0, -114, 2, 2, G[4]);   // (the breastbone)
  dsc(0, -115, 2, G[1]);
  // the neck, ringed; the head: long ears, the face, closed eyes, the mark on the brow, a small smile
  for (let i = 0; i < 3; i++) { px(G[2], -4, -170 + i * 3, 9, 2); px(G[4], -4, -168 + i * 3, 9, 1); }
  for (const s of [-1, 1]) { sg(s * 10, -186, s * 11, -173, 3, 2, G[3]); px(G[1], s * 10, -175, 1, 2); }
  oval(0, -182, 10, 12, G[3]);
  oval(0, -181, 9, 11, G[2]);
  oval(-3, -184, 3, 4, G[1]);
  for (const s of [-1, 1]) { px(G[5], s * 4 - 2, -181, 4, 1); px(G[5], s * 4 - (s > 0 ? 2 : 1), -180, 3, 1); px(G[4], s * 4 - 2, -185, 4, 1); }
  sg(0, -182, 0, -176, 1, 1, G[4]);
  px(G[5], -2, -173, 5, 1); px(G[5], -3, -174, 1, 1); px(G[5], 3, -174, 1, 1);
  px(G[0], 0, -188, 1, 1); px(G[3], -1, -188, 1, 1); px(G[3], 1, -188, 1, 1);
  // the crown: tall, hooding the head, a band of jewels, a jewel at its peak, lappets down either side
  poly([[-13, -186], [-12, -196], [-7, -205], [0, -211], [7, -205], [12, -196], [13, -186], [9, -190], [0, -193], [-9, -190]], G[3]);
  for (const s of [-1, 1]) sg(s * 12, -188, s * 14, -168, 3, 2, G[3]);
  sg(-11, -191, 11, -191, 2, 2, G[2]); for (let x = -9; x <= 9; x += 3) px(G[0], x, -191);
  sg(0, -209, 0, -196, 2, 1, G[2]); dsc(0, -200, 2, G[1]); px(G[0], 0, -201);
  // the line round all of it, dark gold
  const d = g.getImageData(0, 0, GUAN_W, GUAN_H), p = d.data, line = [];
  for (let y = 0; y < GUAN_H; y++) for (let x = 0; x < GUAN_W; x++) {
    if (p[(y * GUAN_W + x) * 4 + 3]) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const X = x + dx, Y2 = y + dy; return X >= 0 && Y2 >= 0 && X < GUAN_W && Y2 < GUAN_H && p[(Y2 * GUAN_W + X) * 4 + 3]; })) line.push(x, y);
  }
  for (let i = 0; i < line.length; i += 2) { const q = (line[i + 1] * GUAN_W + line[i]) * 4; p[q] = 0x3a; p[q + 1] = 0x22; p[q + 2] = 0x08; p[q + 3] = 255; }
  g.putImageData(d, 0, 0);
  BODY = c;
  return c;
}

// The body (its foot at x, y). k: 0 .. 1 of it risen into being (it builds from the foot up); fade: going.
export function drawGuanBody(ctx, x, y, k, fade = 1) {
  const B = body(), X = Math.round(x - GUAN_W / 2), Y = Math.round(y - GUAN_H), h = Math.round(GUAN_H * ease(k));
  if (h <= 0 || fade <= 0) return;
  ctx.save();
  ctx.globalAlpha = 0.95 * fade;
  ctx.drawImage(B, 0, GUAN_H - h, GUAN_W, h, X, Y + GUAN_H - h, GUAN_W, h);
  ctx.restore();
}
// What shines (after the lighting): the light of it, the halo behind the head turning, rays off it, motes rising -
// and as it rises, a bright line where it's building.
export function drawGuanGlow(ctx, x, y, k, t, seed, fade = 1) {
  const B = body(), e = ease(k), X = Math.round(x), Y = Math.round(y), hx = X, hy = Y - 186;
  glowAt(ctx, X, Y - 120, 170 * e * fade, [[0, `rgba(255, 220, 120, ${0.15 * fade})`], [0.5, `rgba(255, 180, 60, ${0.06 * fade})`], [1, 'rgba(255, 150, 40, 0)']]);
  lit(ctx, () => {
    const h = Math.round(GUAN_H * e);
    ctx.globalAlpha = (0.06 + 0.03 * Math.sin(t * 3)) * fade;
    if (h > 0) ctx.drawImage(B, 0, GUAN_H - h, GUAN_W, h, X - GUAN_W / 2, Y - h, GUAN_W, h);
    if (k < 1) {
      const ly = Y - h;
      ctx.globalAlpha = fade;
      ctx.fillStyle = G[0]; ctx.fillRect(X - 34, ly, 68, 1);
      ctx.fillStyle = G[2]; ctx.fillRect(X - 46, ly + 1, 92, 1);
      for (let i = 0; i < 20; i++) { ctx.fillStyle = i % 3 ? G[2] : G[0]; ctx.fillRect(Math.round(X - 44 + hash(i, Math.floor(t * 20), seed) * 88), ly - Math.round(hash(i, 3, seed) * 10), 1, 1); }
    }
    if (e < 0.75) return;
    const a = fade * ease((e - 0.75) / 0.25);
    // the halo: rings round the head, turning; rays out from it
    ctx.globalAlpha = a;
    for (const [r, sp, col, n] of [[22, 0.4, G[2], 28], [26, -0.25, G[3], 18]]) {
      ctx.fillStyle = col;
      for (let i = 0; i < n; i++) { const b = t * sp + (i / n) * Math.PI * 2; ctx.fillRect(Math.round(hx + Math.cos(b) * r), Math.round(hy + Math.sin(b) * r), 2, 2); }
    }
    ctx.fillStyle = G[1];
    for (let i = 0; i < 12; i++) {
      const b = t * 0.15 + (i / 12) * Math.PI * 2, L = 40 + 12 * Math.sin(t * 2 + i);
      ctx.globalAlpha = a * (0.3 + 0.2 * Math.sin(t * 3 + i * 1.7));
      pixLine(ctx, hx + Math.cos(b) * 30, hy + Math.sin(b) * 30, hx + Math.cos(b) * L * 1.6, hy + Math.sin(b) * L * 1.6);
    }
    // motes of gold drifting up off it
    for (let i = 0; i < 26; i++) {
      const ph = (t * 0.35 + hash(i, 1, seed)) % 1, mx = X + (hash(i, 2, seed) - 0.5) * 130, my = Y - ph * 210;
      ctx.globalAlpha = a * Math.sin(Math.PI * ph);
      ctx.fillStyle = i % 4 ? G[2] : G[0];
      ctx.fillRect(Math.round(mx + Math.sin(t * 2 + i) * 3), Math.round(my), 1, 1);
    }
  });
}
