// The ice truck skill's look, all in pixels: the flare going up and its light hanging in the sky; every foe's face dealt
// out round the mouse to lock on to; the gate of ice it comes out of; the truck itself - a white pickup with an
// insulated box on the back, frost on it, icicles under it, wheels turning, whoever's driving in the cab window; the
// ice road it lays under itself; the block of ice the one it hits is frozen in; and the wreck flying apart.

import { pixLine, pixArc, glowAt } from './pixfx.js';
import { makeCanvas } from '../engine/pixel.js';

const hash = (a, b, c = 0) => { const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return v - Math.floor(v); };
const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
const lit = (ctx, fn) => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; fn(); ctx.restore(); };
const I = { white: '#ffffff', frost: '#e0f4ff', light: '#a8dcff', mid: '#5aa8ff', deep: '#2a62d8', ink: '#14307a', night: '#081438' };

// ---------- the truck ----------
export const TRUCK_W = 88, TRUCK_H = 46;   // (its picture: the wheels' bottoms on its bottom row, its middle at TRUCK_W / 2)
const WHEELS = [[20, 39], [70, 39]], WHEEL_R = 7;
const WINDOW = [58, 18, 10, 9];   // (the cab's side window: x, y, w, h - the driver's face in it)
const SPRITE = {};
let PIECES = null;
// (dir: the way it'll be drawn facing - it's drawn turned round for -1, so then its lettering's put on back to front,
// to come out the right way round)
function truckSprite(dir = 1) {
  if (SPRITE[dir]) return SPRITE[dir];
  const [c, g] = makeCanvas(TRUCK_W, TRUCK_H);
  const r = (col, x, y, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const W1 = '#f6f9fc', W2 = '#e2e9f1', W3 = '#bcc8d6', W4 = '#8e9cae', BL = '#2a74d8', BD = '#1a4a9a', BLL = '#7ab8ff';
  // the box on the back: insulated white panels, seams, a blue band, frost along the top
  r(W2, 3, 3, 52, 33);
  r(W1, 3, 3, 52, 2);
  r(W3, 3, 3, 2, 33); r(W3, 53, 3, 2, 33);
  r(W3, 3, 34, 52, 2);
  for (const x of [16, 29, 42]) r(W3, x, 5, 1, 29);
  r(BL, 5, 25, 48, 3); r(BD, 5, 28, 48, 1); r(BLL, 5, 25, 48, 1);
  // its mark: a snowflake, and ICE in blue letters
  for (let i = -4; i <= 4; i++) { r(BL, 11 + i, 15); r(BL, 11, 15 + i); if (Math.abs(i) < 4) { r(BL, 11 + i, 15 + i); r(BL, 11 + i, 15 - i); } }
  r(BLL, 11, 15); r(BLL, 7, 15); r(BLL, 15, 15); r(BLL, 11, 11); r(BLL, 11, 19);
  const LET = { I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'], C: ['.###', '#...', '#...', '#...', '#...', '#...', '.###'], E: ['####', '#...', '#...', '###.', '#...', '#...', '####'] };
  const [wc, wg] = makeCanvas(17, 8);
  let lx = 0;
  for (const ch of 'ICE') {
    LET[ch].forEach((row, y) => [...row].forEach((p, x) => { if (p === '#') { wg.fillStyle = BD; wg.fillRect(lx + x + 1, y + 1, 1, 1); wg.fillStyle = BL; wg.fillRect(lx + x, y, 1, 1); } }));
    lx += LET[ch][0].length + 2;
  }
  g.save();
  if (dir < 0) { g.translate(20 * 2 + 17, 0); g.scale(-1, 1); }
  g.drawImage(wc, 20, 12);
  g.restore();
  // three ice cubes stacked by the mark
  for (const [x, y] of [[38, 17], [44, 17], [41, 12]]) { r('#cfeeff', x, y, 5, 5); r('#ffffff', x, y, 5, 1); r('#ffffff', x, y, 1, 5); r('#6aa8e8', x + 4, y + 1, 1, 4); r('#6aa8e8', x + 1, y + 4, 4, 1); }
  for (let x = 3; x < 55; x++) if (hash(x, 1) < 0.55) r(hash(x, 2) < 0.5 ? '#ffffff' : I.frost, x, 3 + (hash(x, 3) < 0.3 ? 1 : 0));
  // the back: hinges, a tail light
  for (const y of [8, 20, 31]) r(W4, 4, y, 1, 2);
  r('#e8343a', 3, 30, 2, 4); r('#ff8a8a', 3, 30, 1, 1);
  // the fairing over the cab, up on the front of the box (white, shaded underneath)
  const fair = [[8, 46, 52], [9, 46, 55], [10, 46, 57], [11, 46, 59], [12, 46, 60], [13, 46, 61], [14, 48, 62], [15, 51, 62]];
  for (const [y, x0, x1] of fair) { r(W1, x0, y, x1 - x0 + 1, 1); r(W3, x1 - 1, y, 2, 1); }
  r(W3, 51, 15, 12, 1);
  // the cab: roof, the windscreen sloping down to the bonnet, the bonnet out to the front
  for (let y = 16; y <= 36; y++) {
    const x1 = y < 27 ? Math.round(68 + (y - 16) * 0.7) : 85;
    r(y > 32 ? W3 : y === 16 || y === 27 ? W1 : W2, 55, y, x1 - 55 + 1, 1);
  }
  // the side window (dark glass, a streak of light across it), the windscreen's edge
  for (let y = WINDOW[1]; y < WINDOW[1] + WINDOW[3]; y++) {
    const x1 = Math.round(66 + (y - 18) * 0.7);
    r('#24384e', 58, y, x1 - 58 + 1, 1);
    r('#5a86b0', x1 + 1, y, 1, 1);
  }
  for (let i = 0; i < 6; i++) r('#4a6e94', 59 + i, 25 - i);
  r('#9ac8f0', 58, 18, 9, 1);
  // the door: its line, its handle; the mirror
  r(W3, 57, 18, 1, 15); r(W3, 72, 27, 1, 6); r(W3, 57, 32, 16, 1);
  r('#3a424e', 60, 28, 4, 1);
  r('#1c2026', 70, 21, 2, 3);
  // the front: bumper, grille, the headlight
  r('#1c2026', 73, 33, 13, 4); r('#3a424e', 73, 33, 13, 1);
  r('#2a3038', 82, 28, 3, 4); for (const y of [29, 31]) r('#c8d0da', 82, y, 3, 1);
  r('#fff6c8', 79, 27, 5, 2); r('#ffffff', 80, 27, 2, 1);
  // underneath: the chassis, the steps (chrome), the wheel arches
  r('#16181c', 6, 36, 74, 3);
  r('#c8d0da', 28, 37, 12, 1); r('#8a94a4', 28, 38, 12, 1); r('#c8d0da', 28, 36, 1, 2); r('#c8d0da', 39, 36, 1, 2);
  for (const [wx, wy] of WHEELS) for (let y = wy - 9; y <= wy; y++) for (let x = wx - 9; x <= wx + 9; x++) if ((x - wx) ** 2 + (y - wy) ** 2 <= 81) r('#0d0f12', x, y);
  // icicles hanging off the bottom of the box
  for (const [x, len] of [[8, 4], [11, 2], [24, 3], [44, 5], [48, 2]]) { r('#a8dcff', x, 36, 1, len); r('#ffffff', x, 36, 1, 1); }
  // the black line round all of it
  const d = g.getImageData(0, 0, TRUCK_W, TRUCK_H), p = d.data, line = [];
  for (let y = 0; y < TRUCK_H; y++) for (let x = 0; x < TRUCK_W; x++) {
    if (p[(y * TRUCK_W + x) * 4 + 3]) continue;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const X = x + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < TRUCK_W && Y < TRUCK_H && p[(Y * TRUCK_W + X) * 4 + 3]; });
    if (near) line.push(x, y);
  }
  for (let i = 0; i < line.length; i += 2) { const q = (line[i + 1] * TRUCK_W + line[i]) * 4; p[q] = 6; p[q + 1] = 8; p[q + 2] = 12; p[q + 3] = 255; }
  g.putImageData(d, 0, 0);
  SPRITE[dir] = c;
  return c;
}
// a wheel: the tyre, a steel rim with five spokes turned to `a`
function drawWheel(ctx, x, y, a) {
  for (let dy = -WHEEL_R; dy <= WHEEL_R; dy++) for (let dx = -WHEEL_R; dx <= WHEEL_R; dx++) {
    const d2 = dx * dx + dy * dy;
    if (d2 > WHEEL_R * WHEEL_R + 2) continue;
    ctx.fillStyle = d2 > 30 ? (d2 > 44 ? '#08090b' : '#22262c') : d2 > 12 ? '#c8d0da' : '#8a94a4';
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }
  ctx.fillStyle = '#3a424e';
  for (let i = 0; i < 5; i++) { const b = a + (i * Math.PI * 2) / 5; pixLine(ctx, x, y, x + Math.cos(b) * 3.4, y + Math.sin(b) * 3.4); }
  ctx.fillStyle = '#eef4ff';
  ctx.fillRect(x, y, 1, 1);
}

// The truck, its middle at x, its wheels on y, facing dir, tipped by tilt; spin: how far the wheels have turned. head:
// the driver's head (a fighter's head part, or none). clipX: only what's out past that line, on the side it faces (its
// way out of the gate). white: 0..1 of a white flash over it.
export function drawIceTruck(ctx, x, y, dir, tilt, spin, head, t, clipX = null, white = 0) {
  const S = truckSprite(dir < 0 ? -1 : 1), X = Math.round(x), Y = Math.round(y);
  ctx.save();
  if (clipX !== null) {
    ctx.beginPath();
    if (dir > 0) ctx.rect(Math.round(clipX), Y - 80, 200, 120);
    else ctx.rect(Math.round(clipX) - 200, Y - 80, 200, 120);
    ctx.clip();
  }
  ctx.translate(X, Y);
  if (tilt) ctx.rotate(Math.round(tilt * dir * 10) / 10);
  ctx.scale(dir, 1);
  ctx.translate(-TRUCK_W / 2, -TRUCK_H);
  // a bump in the ride: the body bobs on the wheels
  const bob = Math.sin(t * 22) > 0.6 ? -1 : 0;
  ctx.drawImage(S, 0, bob);
  if (head) {
    // the driver, in the window - and the glass over them, a streak of light across it
    ctx.save();
    ctx.beginPath();
    ctx.rect(WINDOW[0], WINDOW[1] + bob, WINDOW[2] - 1, WINDOW[3]);
    ctx.clip();
    ctx.drawImage(head, 45, 5 + bob);
    ctx.fillStyle = 'rgba(36, 56, 78, 0.3)';
    ctx.fillRect(WINDOW[0], WINDOW[1] + bob, WINDOW[2], WINDOW[3]);
    ctx.fillStyle = 'rgba(168, 212, 255, 0.55)';
    for (let i = 0; i < 4; i++) ctx.fillRect(WINDOW[0] + 6 + i, WINDOW[1] + bob + 3 - i, 1, 1);
    ctx.restore();
  }
  for (const [wx, wy] of WHEELS) drawWheel(ctx, wx, wy, spin);
  if (white > 0) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = Math.min(1, white);
    ctx.fillStyle = '#e8f8ff';
    ctx.fillRect(0, 0, TRUCK_W, TRUCK_H);
  }
  ctx.restore();
}
// What glows on it (after the lighting): the headlight's beam out in front, the cold coming off the box.
export function drawIceTruckGlow(ctx, x, y, dir, t, k = 1) {
  const hx = Math.round(x + dir * 38), hy = Math.round(y - 18);
  glowAt(ctx, hx, hy, 18 * k, [[0, `rgba(255, 246, 200, ${0.7 * k})`], [1, 'rgba(255, 240, 180, 0)']]);
  lit(ctx, () => {
    // the beam: a widening cone of light ahead
    for (let i = 0; i < 26; i++) {
      const w = 1 + i * 0.35;
      ctx.globalAlpha = 0.22 * k * (1 - i / 26);
      ctx.fillStyle = '#fff3c4';
      ctx.fillRect(Math.round(hx + dir * i * 2), Math.round(hy - w / 2), 2, Math.max(1, Math.round(w)));
    }
    // cold mist curling up off the box
    for (let i = 0; i < 10; i++) {
      const ph = (t * 0.8 + hash(i, 5)) % 1, mx = x - dir * (40 - hash(i, 6) * 46), my = y - 36 - ph * 14;
      ctx.globalAlpha = 0.35 * k * Math.sin(Math.PI * ph);
      ctx.fillStyle = i % 3 ? I.light : I.white;
      ctx.fillRect(Math.round(mx + Math.sin(t * 3 + i) * 2), Math.round(my), 2, 1);
    }
  });
}

// ---------- the flare ----------
// Going up: from (x0, y0) up FLARE_UP (k: 0 .. 1 of the way), a white-hot core, a long trail of sparks falling off it.
export function drawFlareRise(ctx, x0, y0, up, k, t, seed) {
  const e = ease(k), x = Math.round(x0 + Math.sin(seed + k * 3) * 4 * k), y = Math.round(y0 - up * e);
  glowAt(ctx, x, y, 26, [[0, 'rgba(220, 245, 255, 0.85)'], [0.4, 'rgba(90, 170, 255, 0.35)'], [1, 'rgba(40, 90, 220, 0)']]);
  lit(ctx, () => {
    // the trail: a line of light behind it, thinning, and sparks drifting off it
    const len = Math.min(up * e, 60);
    for (let i = 0; i < len; i++) {
      ctx.globalAlpha = 1 - i / len;
      ctx.fillStyle = i < 6 ? I.white : i < 20 ? I.light : I.mid;
      ctx.fillRect(x - (i > 30 ? Math.round(Math.sin(i * 0.3 + t * 9)) : 0), y + i, 1, 1);
    }
    for (let i = 0; i < 18; i++) {
      const ph = (t * 2.2 + hash(i, 1, seed)) % 1, sx = x + (hash(i, 2, seed) - 0.5) * 14 * ph, sy = y + 4 + ph * 34;
      ctx.globalAlpha = 1 - ph;
      ctx.fillStyle = i % 3 ? I.light : I.white;
      ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = I.white;
    ctx.fillRect(x - 1, y - 1, 3, 3);
    ctx.fillStyle = I.light;
    ctx.fillRect(x - 2, y, 1, 1); ctx.fillRect(x + 2, y, 1, 1); ctx.fillRect(x, y - 2, 1, 1); ctx.fillRect(x, y + 2, 1, 1);
  });
}
// Burst, its light hanging in the sky at (x, y), drifting down (s: seconds since), flickering - a star of light with
// rays turning, the light thrown wide.
export function drawFlareLight(ctx, x, y, s, t, seed, fade = 1) {
  const X = Math.round(x + Math.sin(s * 1.3 + seed) * 3), Y = Math.round(y + s * 6), fl = 0.85 + 0.15 * Math.sin(t * 31 + seed);
  glowAt(ctx, X, Y, 120 * fade, [[0, `rgba(200, 235, 255, ${0.35 * fl * fade})`], [0.3, `rgba(90, 170, 255, ${0.16 * fade})`], [1, 'rgba(40, 90, 220, 0)']]);
  lit(ctx, () => {
    ctx.globalAlpha = fade;
    ctx.fillStyle = I.light;
    for (let i = 0; i < 4; i++) {
      const a = t * 0.8 + (i * Math.PI) / 2, L = 9 + 3 * Math.sin(t * 6 + i);
      pixLine(ctx, X, Y, X + Math.cos(a) * L, Y + Math.sin(a) * L);
    }
    ctx.fillStyle = I.white;
    for (let i = 0; i < 4; i++) { const a = -t * 1.3 + (i * Math.PI) / 2 + 0.78; pixLine(ctx, X, Y, X + Math.cos(a) * 5, Y + Math.sin(a) * 5); }
    ctx.fillRect(X - 1, Y - 1, 3, 3);
    // its little parachute of smoke over it
    ctx.globalAlpha = 0.5 * fade;
    ctx.fillStyle = '#c8dcf0';
    pixArc(ctx, X, Y - 9, 5, 3, 0, Math.PI, Math.PI * 2);
    pixLine(ctx, X - 5, Y - 9, X, Y - 1); pixLine(ctx, X + 5, Y - 9, X, Y - 1);
  });
}

// ---------- the pick: every foe's face round the mouse ----------
export const TRUCK_LEAN = 6, TRUCK_PICK = 22, TRUCK_SLOT_R = 32;   // how far the mouse leans to show one, and to take it; how far out they sit
// which slot a lean of (dx, dy) is toward
export function truckToward(slots, dx, dy) {
  const a = Math.atan2(dy, dx);
  let best = -1, bd = 9;
  slots.forEach((s, i) => { const d = Math.abs(Math.atan2(Math.sin(a - s), Math.cos(a - s))); if (d < bd) { bd = d; best = i; } });
  return best;
}
// The ring round (x, y): frost turning, and out on it each foe's face in a frame of ice - the one leant to drawn bigger,
// lit red, a sight on it, a line out to it. Gone (dead since): grey, crossed out. k: seconds open.
export function drawTruckFan(ctx, x, y, k, slots, foes, hover, t) {
  const X = Math.round(x), Y = Math.round(y), open = ease(k / 0.25);
  glowAt(ctx, X, Y, 60 * open, [[0, `rgba(${hover >= 0 ? '255, 90, 110' : '120, 200, 255'}, 0.28)`], [1, 'rgba(0, 0, 0, 0)']]);
  lit(ctx, () => {
    ctx.fillStyle = I.light;
    for (let i = 0; i < 6; i++) { const a = t * 0.7 + (i * Math.PI) / 3; ctx.globalAlpha = 0.6 * open; pixArc(ctx, X, Y, 46 * open, 46 * open, 0, a, a + 0.6); }
    ctx.fillStyle = I.white;
    for (let i = 0; i < 12; i++) { const a = -t * 1.4 + (i * Math.PI) / 6; ctx.globalAlpha = 0.5 * open; ctx.fillRect(Math.round(X + Math.cos(a) * 40 * open), Math.round(Y + Math.sin(a) * 40 * open), 1, 1); }
    // a snowflake in the middle
    ctx.globalAlpha = open;
    ctx.fillStyle = I.light;
    for (let i = 0; i < 3; i++) { const a = t * 0.5 + (i * Math.PI) / 3; pixLine(ctx, X - Math.cos(a) * 5, Y - Math.sin(a) * 5, X + Math.cos(a) * 5, Y + Math.sin(a) * 5); }
  });
  ctx.save();
  slots.forEach((a, i) => {
    const f = foes[i];
    if (!f) return;
    const on = i === hover, gone = !f.alive, deal = ease((k - i * 0.05) / 0.2);
    if (deal <= 0) return;
    const R = TRUCK_SLOT_R * deal + (on ? 6 : 0), cx = Math.round(X + Math.cos(a) * R), cy = Math.round(Y + Math.sin(a) * R), s = on ? 22 : 16;
    // the line out to it
    ctx.globalAlpha = 0.7 * deal;
    ctx.fillStyle = on ? '#ff6a7a' : '#5aa8ff';
    for (let j = 6; j < R - s / 2; j += 3) ctx.fillRect(Math.round(X + Math.cos(a) * j), Math.round(Y + Math.sin(a) * j), 1, 1);
    // the frame: ice round it, dark inside
    ctx.globalAlpha = deal;
    const x0 = cx - s / 2, y0 = cy - s / 2;
    ctx.fillStyle = '#05080a'; ctx.fillRect(x0 - 2, y0 - 2, s + 4, s + 4);
    ctx.fillStyle = on ? '#ff4a5a' : '#5aa8ff'; ctx.fillRect(x0 - 1, y0 - 1, s + 2, s + 2);
    ctx.fillStyle = on ? '#3a0a14' : '#0c1a33'; ctx.fillRect(x0, y0, s, s);
    ctx.fillStyle = on ? '#ffd0d8' : '#e0f4ff'; ctx.fillRect(x0 - 1, y0 - 1, s + 2, 1);
    // the face: their head, the hair and eyes of it
    const head = f.parts?.head;
    if (head) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, y0, s, s); ctx.clip();
      if (gone) ctx.filter = 'grayscale(1) brightness(0.6)';
      const sc = on ? 1 : 0.75, w = 22 * sc;
      ctx.drawImage(head, 5, 0, 22, 22, Math.round(cx - w / 2), Math.round(cy - w / 2 + 1), Math.round(w), Math.round(w));
      ctx.restore();
    }
    if (gone) { ctx.fillStyle = '#ff4a5a'; pixLine(ctx, x0, y0, x0 + s, y0 + s); pixLine(ctx, x0 + s, y0, x0, y0 + s); }
    if (on) {
      // the sight on it: brackets in the corners, closing in
      const g = 3 + Math.round(2 * (1 + Math.sin(t * 10)) / 2);
      ctx.fillStyle = '#ffffff';
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const bx = cx + sx * (s / 2 + g), by = cy + sy * (s / 2 + g);
        ctx.fillRect(Math.round(bx - (sx > 0 ? 3 : 0)), Math.round(by), 4, 1);
        ctx.fillRect(Math.round(bx), Math.round(by - (sy > 0 ? 3 : 0)), 1, 4);
      }
    }
  });
  ctx.restore();
}
// The sight on whoever it's locked on to: red brackets round them turning, closing in, a dot on them.
export function drawTruckLock(ctx, x, y, t, k = 1) {
  const X = Math.round(x), Y = Math.round(y - 15), g = 14 + Math.round(3 * Math.sin(t * 8));
  glowAt(ctx, X, Y, 30 * k, [[0, `rgba(255, 60, 80, ${0.25 * k})`], [1, 'rgba(255, 40, 60, 0)']]);
  lit(ctx, () => {
    ctx.globalAlpha = k;
    ctx.fillStyle = '#ff4a5a';
    for (let i = 0; i < 4; i++) { const a = t * 2 + (i * Math.PI) / 2; pixArc(ctx, X, Y, g, g, 0, a, a + 0.7); }
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; pixLine(ctx, X + Math.cos(a) * (g + 2), Y + Math.sin(a) * (g + 2), X + Math.cos(a) * (g + 6), Y + Math.sin(a) * (g + 6)); }
    ctx.fillRect(X, Y, 1, 1);
  });
}

// ---------- the gate ----------
// The gate of ice it comes out of, its foot at (x, y): a tall oval torn in the air, deep blue inside with snow whirling in
// it, a rim of frost light turning, shards of ice standing out round it. k: 0 .. 1 opened; fade: closing.
export function drawIceGate(ctx, x, y, k, t, seed, fade = 1) {
  const s = ease(k) * fade, rx = 14 * s, ry = 30 * s, X = Math.round(x), Y = Math.round(y - 30);
  if (ry < 1) return;
  glowAt(ctx, X, Y, 70 * s, [[0, `rgba(150, 215, 255, ${0.5 * fade})`], [0.5, `rgba(60, 130, 255, ${0.22 * fade})`], [1, 'rgba(30, 60, 200, 0)']]);
  ctx.save();
  ctx.globalAlpha = fade;
  for (let dy = -Math.floor(ry); dy <= Math.floor(ry); dy++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / ry) * (dy / ry))));
    ctx.fillStyle = Math.abs(dy) > ry * 0.75 ? I.ink : I.night;
    ctx.fillRect(X - w, Y + dy, w * 2 + 1, 1);
  }
  ctx.restore();
  lit(ctx, () => {
    ctx.globalAlpha = fade;
    // snow whirling in it
    for (let i = 0; i < 22; i++) {
      const a = t * (1.5 + hash(i, 1, seed)) + i, d = hash(i, 2, seed);
      ctx.fillStyle = i % 4 ? I.light : I.white;
      ctx.fillRect(Math.round(X + Math.cos(a) * rx * 0.8 * d), Math.round(Y + Math.sin(a) * ry * 0.85 * d), 1, 1);
    }
    // the rim: rings of frost light, turning one way and the other
    for (const [kx, ky, sp, col, parts] of [[1, 1, 2.2, I.mid, 3], [1.12, 1.06, -1.6, I.light, 2], [0.8, 0.85, 3, I.frost, 2]]) {
      ctx.fillStyle = col;
      for (let i = 0; i < parts; i++) { const a = t * sp + (i * Math.PI * 2) / parts; pixArc(ctx, X, Y, rx * kx, ry * ky, 0, a, a + 1.6); }
    }
    ctx.fillStyle = I.white;
    pixArc(ctx, X, Y, rx, ry, 0, t * 3.5, t * 3.5 + 0.6);
    // shards of ice standing out round the rim
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + seed, L = (4 + hash(i, 3, seed) * 7) * s, bx = X + Math.cos(a) * rx, by = Y + Math.sin(a) * ry;
      ctx.fillStyle = i % 2 ? I.light : I.frost;
      pixLine(ctx, bx, by, bx + Math.cos(a) * L, by + Math.sin(a) * L);
    }
    // frost blowing out of it, the way the truck comes
    for (let i = 0; i < 12; i++) {
      const ph = (t * 1.4 + i / 12) % 1;
      ctx.globalAlpha = (1 - ph) * fade * 0.8;
      ctx.fillStyle = i % 3 ? I.light : I.white;
      ctx.fillRect(Math.round(X + Math.cos(i * 2.4) * ph * 30), Math.round(Y + Math.sin(i * 1.7) * ry * 0.9), 1, 1);
    }
  });
}

// ---------- the ice road ----------
// Under the truck as it goes: a slab of ice along the way it's come (newest brightest), crystals standing up off it.
export function drawIceRoad(ctx, road, t, fade = 1) {
  if (road.length < 2) return;
  lit(ctx, () => {
    for (let i = 1; i < road.length; i++) {
      const a = road[i - 1], b = road[i], k = (i / road.length) * fade;
      ctx.globalAlpha = 0.85 * k;
      ctx.fillStyle = I.mid; pixLine(ctx, a.x, a.y + 1, b.x, b.y + 1);
      ctx.fillStyle = I.light; pixLine(ctx, a.x, a.y, b.x, b.y);
      ctx.globalAlpha = 0.5 * k;
      ctx.fillStyle = I.white; pixLine(ctx, a.x, a.y - 1, b.x, b.y - 1);
      if (i % 3 === 0) {
        const h = 2 + Math.round(hash(i, 4) * 4);
        ctx.globalAlpha = 0.8 * k;
        ctx.fillStyle = I.frost;
        ctx.fillRect(Math.round(b.x), Math.round(b.y - h), 1, h);
      }
    }
  });
}

// ---------- the frozen ----------
// A block of ice round someone, their feet at (x, y): see-through blue, the light catching its edges, frost on it -
// cracks spreading through it as it's about to go (k: 0 .. 1 of the time it holds them).
export function drawIceBlock(ctx, x, y, k, t, seed) {
  const X = Math.round(x), Y = Math.round(y), x0 = X - 12, y0 = Y - 36, w = 25, h = 37;
  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = '#7ec4ff';
  ctx.fillRect(x0, y0, w, h);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#e0f4ff';
  ctx.fillRect(x0, y0, w, 1); ctx.fillRect(x0, y0, 1, h);
  ctx.fillStyle = '#2a62d8';
  ctx.fillRect(x0, y0 + h - 1, w, 1); ctx.fillRect(x0 + w - 1, y0, 1, h);
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 5; i++) ctx.fillRect(x0 + 3 + i, y0 + 3 + i * 2, 1, 2);
  for (let i = 0; i < 3; i++) ctx.fillRect(x0 + 15 + i, y0 + 20 + i * 2, 1, 2);
  // frost creeping on it
  ctx.fillStyle = '#e0f4ff';
  for (let i = 0; i < 16; i++) if (hash(i, 7, seed) < 0.7) ctx.fillRect(x0 + Math.floor(hash(i, 8, seed) * w), y0 + h - 1 - Math.floor(hash(i, 9, seed) * 8), 1, 1);
  // the cracks, as it's going
  if (k > 0.55) {
    const c = (k - 0.55) / 0.45;
    ctx.fillStyle = '#ffffff';
    for (let j = 0; j < 4; j++) {
      let px = x0 + w / 2, py = y0 + h / 2;
      const steps = Math.round(c * 8);
      for (let s = 0; s < steps; s++) {
        const a = j * 1.6 + (hash(j, s, seed) - 0.5) * 1.4, nx = px + Math.cos(a) * 3, ny = py + Math.sin(a) * 3;
        pixLine(ctx, px, py, nx, ny);
        px = nx; py = ny;
      }
    }
  }
  ctx.restore();
  glowAt(ctx, X, Y - 18, 32, [[0, `rgba(140, 210, 255, ${0.25 + 0.1 * Math.sin(t * 7)})`], [1, 'rgba(60, 130, 255, 0)']]);
}

// ---------- the wreck ----------
// The truck in pieces: its picture cut up, the bits thrown out from where it hit (dir: the way it was going), turning,
// falling, fading - and the ice it carried, cubes of it everywhere. (x, y): where it was (its middle, its wheels). s:
// seconds since; life: how long it all lasts.
function pieces() {
  if (PIECES) return PIECES;
  const S = truckSprite(), out = [], P = 11;
  for (let y = 0; y < TRUCK_H; y += P) for (let x = 0; x < TRUCK_W; x += P) {
    const [c, g] = makeCanvas(P, P);
    g.drawImage(S, x, y, P, P, 0, 0, P, P);
    const d = g.getImageData(0, 0, P, P).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
    if (n > 10) out.push({ c, x: x + P / 2 - TRUCK_W / 2, y: y + P / 2 - TRUCK_H });
  }
  PIECES = out;
  return out;
}
export function drawTruckWreck(ctx, x, y, dir, s, life, seed) {
  const fade = Math.max(0, 1 - Math.max(0, s - life * 0.55) / (life * 0.45)), G = 520;
  ctx.save();
  ctx.globalAlpha = fade;
  pieces().forEach((p, i) => {
    const vx = (p.x * 6 + dir * (120 + hash(i, 1, seed) * 160)) * (0.6 + hash(i, 2, seed) * 0.6), vy = -160 - hash(i, 3, seed) * 220 + p.y * 3;
    const px = x + p.x * dir + vx * s * dir * (p.x * dir > 0 ? 1 : 0.5), py = y + p.y + vy * s + 0.5 * G * s * s;
    ctx.save();
    ctx.translate(Math.round(px), Math.round(py));
    ctx.rotate(Math.round((hash(i, 4, seed) - 0.5) * 14 * s * 4) / 4);
    ctx.scale(dir, 1);
    ctx.drawImage(p.c, -5, -5);
    ctx.restore();
  });
  // the ice it carried, cubes of it scattering
  for (let i = 0; i < 26; i++) {
    const a = -Math.PI / 2 + (hash(i, 5, seed) - 0.5) * 2.6, v = 120 + hash(i, 6, seed) * 260, sz = 2 + Math.floor(hash(i, 7, seed) * 3);
    const px = x + dir * 20 + Math.cos(a) * v * s + dir * 60 * s, py = y - 24 + Math.sin(a) * v * s + 0.5 * G * s * s;
    ctx.fillStyle = '#cfeeff'; ctx.fillRect(Math.round(px), Math.round(py), sz, sz);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(px), Math.round(py), sz, 1);
  }
  ctx.restore();
}
