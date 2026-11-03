// The target lock skill's look: a band of hologram across the eyes and a little screen projected out in front
// of them, ice-blue, flickering on; and, in red and white, the mark on whoever's locked - brackets snapping in
// round them, a broken ring turning, a line of light from the one who's locked them. Everyone sees that.

import { palette, drawPixels, glowAt, pixArc } from './pixfx.js';

const R = { white: '#ffffff', pale: '#ffc8c8', red: '#ff4a55', deep: '#c0182e', ink: '#6a0a1e' };
const MARK = palette(Object.values(R));
const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
const mh = (a, b, c = 0) => { const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return v - Math.floor(v); };

// The lock's drone at (x, y), facing face (up 0..1: how far out; fired: how many of its four missiles are gone; look:
// the way to whoever's locked): a little gunmetal box tipped toward them, a rotor spinning over it on a mast - its
// blades a blur, flicking - an ice-blue eye looking at them, the missiles still slung under it, a red light blinking,
// a down-draught of air under it.
export function drawLockPod(ctx, x, y, face, up, fired, t, look = 0) {
  if (up <= 0.02) return;
  const X = Math.round(x), Y = Math.round(y), lean = Math.max(-1, Math.min(1, Math.cos(look))) * face;
  const r = (dx, dy, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(face > 0 ? X + dx : X - dx - w + 1, Y + dy, w, h); };
  ctx.save();
  ctx.globalAlpha = Math.min(1, up * 1.5);
  // the rotor: a blur of two blades, flicking between lengths, and the mast
  const blade = 4 + ((Math.floor(t * 40) % 3) * 2);
  ctx.fillStyle = '#9aa8b0';
  ctx.fillRect(X - blade, Y - 7, blade * 2 + 1, 1);
  ctx.fillStyle = '#d8e4ea';
  ctx.fillRect(X - Math.round(blade / 2), Y - 7, Math.round(blade) + 1, 1);
  ctx.globalAlpha *= 0.5;
  ctx.fillStyle = '#c8d4da';
  ctx.fillRect(X - blade + 2, Y - 8, blade * 2 - 3, 1);
  ctx.globalAlpha = Math.min(1, up * 1.5);
  r(0, -6, 1, 2, '#3a4248');
  // the body: an outline, gunmetal, a light top, a dark belly - tipped toward the one it's after
  r(-5, -4, 11, 7, '#0b0e10');
  r(-4, -3, 9, 5, '#2a3238');
  r(-4, -3, 9, 1, '#5a6a74');
  r(-4, 1, 9, 1, '#1a2024');
  r(-4 + (lean > 0.3 ? 1 : 0), 2, 8, 1, '#0b0e10');
  // its eye, ice-blue, looking at them; a red light at its tail
  r(3, -2, 2, 2, '#8fe8ff');
  r(4, -2, 1, 1, '#e8faff');
  if (Math.sin(t * 12) > 0) r(-4, -2, 1, 1, '#ff4a55');
  // the missiles slung under it - those still to go
  for (let i = 0; i < 4; i++) if (i >= fired) { r(-3 + i * 2, 3, 1, 2, '#e8faff'); r(-3 + i * 2, 5, 1, 1, '#ff4a55'); }
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.45 * up;
  r(3, -2, 2, 2, '#8fe8ff');
  // the down-draught: specks of air pushed down under the rotor
  ctx.fillStyle = '#c8e8ff';
  for (let i = 0; i < 4; i++) { const ph = (t * 3 + i / 4) % 1; ctx.globalAlpha = (1 - ph) * 0.35 * up; ctx.fillRect(X - 4 + i * 3, Math.round(Y + 4 + ph * 10), 1, 1); }
  ctx.restore();
}
// The lock's little missile `m` ({ x, y, a, t, seed }): a body of white and ice-blue a few pixels long, a red tip, fins,
// a flickering flame out of the back and a short tail of light; a red line ahead of it, faint, to whoever it's after.
export function drawMissile(ctx, m, t) {
  const ux = Math.cos(m.a), uy = Math.sin(m.a), nx = -uy, ny = ux, at = (s, j) => [Math.round(m.x + ux * s + nx * j), Math.round(m.y + uy * s + ny * j)];
  const px = (s, j, col) => { const [x, y] = at(s, j); ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); };
  for (let s = -3; s <= 1; s++) px(s, 0, s === 1 ? R.red : s > -2 ? '#e8faff' : '#8fe8ff');
  px(-3, -1, '#5a8aa8'); px(-3, 1, '#5a8aa8');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const fl = 2 + Math.floor(mh(Math.floor(t * 30), 1, m.seed) * 3);
  for (let s = 1; s <= fl; s++) px(-3 - s, 0, s === 1 ? '#ffffff' : s === 2 ? '#ffd27a' : '#ff8a3a');
  // a tail of light behind
  for (let s = fl + 1; s < fl + 10; s++) { ctx.globalAlpha = 0.6 * (1 - (s - fl) / 10); px(-3 - s, Math.round(Math.sin(s * 0.8 + t * 30) * 0.6), '#8fe8ff'); }
  ctx.globalAlpha = 1;
  ctx.restore();
  glowAt(ctx, m.x - ux * 4, m.y - uy * 4, 8, [[0, 'rgba(255, 190, 120, 0.4)'], [1, 'rgba(255, 140, 60, 0)']]);
}
// Where one goes off, k 0..1: a white flash, a ring of orange going out, flecks of ice-blue - small.
export function drawMissileBoom(ctx, x, y, k, seed) {
  if (k >= 1) return;
  glowAt(ctx, x, y, 12 + 18 * k, [[0, `rgba(255, 240, 210, ${0.7 * (1 - k)})`], [0.5, `rgba(255, 150, 60, ${0.35 * (1 - k)})`], [1, 'rgba(255, 100, 30, 0)']]);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 1 - k;
  ctx.fillStyle = k < 0.25 ? '#ffffff' : '#ffb060';
  pixArc(ctx, x, y, 4 + 20 * k, 4 + 20 * k, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#8fe8ff';
  for (let i = 0; i < 10; i++) { const a = mh(i, 1, seed) * Math.PI * 2, d = 3 + k * (10 + mh(i, 2, seed) * 14); ctx.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d), 1, 1); }
  ctx.restore();
}

// The visor on the eyes at (x, y), looking toward `face` (1 / -1). k: seconds it's been on; left: seconds it has left.
// A burst of light as it boots; rings of hologram turning round the head; the band across the eyes, burning white at
// the middle, with a trace of light streaming off behind it; a wide screen thrown out in front, with figures and a
// sight on it, turned to look along `look`; a line of scan going down the body.
export function drawVisor(ctx, x, y, face, k, left, t, feet = 18, look = face > 0 ? 0 : Math.PI) {
  const open = ease(k / 0.22) * Math.min(1, left / 0.25);
  if (open <= 0.02) return;
  if ((k < 0.28 || left < 0.25) && Math.sin(t * 90) < -0.2) return;
  const shine = 0.75 + 0.25 * Math.sin(t * 7), boot = 1 - Math.min(1, k / 0.35);
  const X = Math.round(x), Y = Math.round(y);
  glowAt(ctx, X + face * 3, Y, 24 + boot * 36, [[0, `rgba(100, 225, 255, ${0.26 + boot * 0.55})`], [0.5, `rgba(60, 170, 255, ${0.1 + boot * 0.25})`], [1, 'rgba(40, 130, 255, 0)']]);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // a ring going out as it boots
  if (boot > 0) {
    ctx.globalAlpha = boot;
    ctx.fillStyle = '#c8f6ff';
    const br = 8 + (1 - boot) * 32;
    pixArc(ctx, X, Y, br, br, 0, 0, Math.PI * 2);
    ctx.globalAlpha = 1;
  }
  // the rings round the head, tilted, turning opposite ways
  const ring = (rx, ry, tilt, speed, parts, col) => {
    ctx.fillStyle = col;
    for (let i = 0; i < parts; i++) {
      const a = t * speed + (i * Math.PI * 2) / parts;
      pixArc(ctx, X, Y, rx * open, ry * open, tilt, a, a + (Math.PI * 2) / parts * 0.62);
    }
  };
  ctx.globalAlpha = 0.85;
  ring(16, 5, -0.25 * face, 2.6, 3, 'rgba(120, 235, 255, 0.95)');
  ring(19, 7, 0.3 * face, -1.8, 4, 'rgba(70, 170, 255, 0.8)');
  ctx.globalAlpha = 1;
  // a line of scan going down the body and back
  const sy = Y - 6 + (Math.sin(t * 2.6) * 0.5 + 0.5) * (feet + 6);
  for (let i = -13; i < 13; i++) {
    ctx.fillStyle = `rgba(170, 245, 255, ${(0.75 * (1 - Math.abs(i) / 13)).toFixed(2)})`;
    ctx.fillRect(X + i, Math.round(sy), 1, 1);
  }
  ctx.translate(X, Y);
  ctx.scale(face, 1);
  // the trace off the back of the band
  for (let i = 0; i < 7; i++) {
    const ph = (t * 1.6 + i / 7) % 1;
    ctx.globalAlpha = (1 - ph) * 0.8;
    ctx.fillStyle = i % 3 ? '#6ae0ff' : '#ffffff';
    ctx.fillRect(Math.round(-9 - ph * 15), Math.round(-1 + Math.sin(ph * 7 + i) * 2 - ph * 3), Math.round(3 * (1 - ph)) + 1, 1);
  }
  ctx.globalAlpha = 1;
  // the band across the eyes: bright, with a white heart
  const w = Math.round(19 * open), l = -9;
  ctx.fillStyle = `rgba(60, 200, 255, ${0.55 * shine})`;
  ctx.fillRect(l, -3, w, 7);
  ctx.fillStyle = 'rgba(225, 252, 255, 1)';
  ctx.fillRect(l, -4, w, 1);
  ctx.fillRect(l + 3, 0, Math.max(1, w - 6), 1);
  ctx.fillStyle = 'rgba(80, 210, 255, 0.95)';
  ctx.fillRect(l, 4, w, 1);
  ctx.fillStyle = 'rgba(255, 255, 255, 1)';
  ctx.fillRect(l + Math.round((Math.sin(t * 4.5) * 0.5 + 0.5) * (w - 3)), -3, 3, 7);
  // the sensor on its side, pulsing red
  ctx.fillStyle = Math.sin(t * 10) > 0 ? 'rgba(255, 70, 85, 1)' : 'rgba(255, 170, 170, 1)';
  ctx.fillRect(l - 2, -2, 3, 3);
  ctx.restore();
  // the screen, thrown out from the eye along `look`: narrow there, opening wide. Worked out world pixel by world
  // pixel, so that at any angle it's still square pixels.
  const sx = 10, ex = sx + 19 * open, h0 = 3, h1 = 3 + 12 * open, ca = Math.cos(look), sa = Math.sin(look);
  const reach = Math.ceil(Math.hypot(ex, h1)) + 1, front = open > 0.6, tick = Math.floor(t * 11), H = Math.round(h1), ex0 = Math.round(ex);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(X, Y);
  const body = [0, 1, 2, 3].map((i) => `rgba(80, 210, 255, ${((0.5 - 0.12 * i) * shine).toFixed(2)})`);
  for (let wy = -reach; wy <= reach; wy++) for (let wx = -reach; wx <= reach; wx++) {
    const lx = wx * ca + wy * sa, ly = wy * ca - wx * sa;
    if (lx < sx || lx > ex) continue;
    const q = (lx - sx) / Math.max(1, ex - sx), hh = h0 + (h1 - h0) * q, a = Math.abs(ly);
    if (a > hh) continue;
    let col = body[Math.min(3, Math.floor(q * 4))];
    if (front && lx > ex - 1.1) col = 'rgba(235, 253, 255, 1)';   // its far edge
    else if (a > hh - 1) col = 'rgba(150, 240, 255, 0.8)';   // its top and bottom
    else if (front) {
      // figures running down it
      const row = (ly + H - 3) / 4, i = Math.floor(row);
      if (i >= 0 && i < 6 && row - i < 0.25) {
        const n = (Math.sin(tick * 3.1 + i * 7.7) * 0.5 + 0.5) * 9;
        if (lx > ex - 2 - n && lx < ex - 2) col = i === tick % 6 ? 'rgba(255, 255, 255, 1)' : 'rgba(120, 235, 255, 0.85)';
      }
    }
    ctx.fillStyle = col;
    ctx.fillRect(wx, wy, 1, 1);
  }
  if (front) {
    const plot = (lx, ly, size, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(lx * ca - ly * sa) - (size >> 1), Math.round(lx * sa + ly * ca) - (size >> 1), size, size); };
    // its corners, brighter
    plot(ex0, -H, 3, 'rgba(235, 253, 255, 1)');
    plot(ex0, H, 3, 'rgba(235, 253, 255, 1)');
    // the sight turning at its edge, a dot at its heart
    const spin = t * 3.4;
    for (let i = 0; i < 6; i++) plot(ex0 + 8 + Math.cos(spin + i * 1.05) * 5, Math.sin(spin + i * 1.05) * 5, 1, 'rgba(255, 90, 105, 1)');
    plot(ex0 + 8, 0, 2, 'rgba(255, 90, 105, 1)');
    for (const at of [3, 4, 12, 13]) plot(ex0 + at, 0, 1, 'rgba(255, 255, 255, 0.8)');
  }
  ctx.restore();
}

// The line from the one locking to the one locked: dashes of light running along it.
export function drawLockBeam(ctx, x0, y0, x1, y1, t) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  if (d < 26) return;
  const ux = (x1 - x0) / d, uy = (y1 - y0) / d;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255, 70, 85, 0.5)';
  for (let at = 8 + ((t * 70) % 12); at < d - 18; at += 12) {
    for (let i = 0; i < 5; i++) ctx.fillRect(Math.round(x0 + ux * (at + i)), Math.round(y0 + uy * (at + i)), 1, 1);
  }
  ctx.restore();
}

// The mark on whoever's locked, round (x, y). acq: seconds since it settled on them; left: seconds the lock has left.
export function drawLockMark(ctx, gl, x, y, acq, left, t) {
  const inK = ease(acq / 0.2), s = 1 + (1 - inK) * 1.5, breathe = 1 + Math.sin(t * 8) * 0.04;
  if (left < 0.6 && Math.sin(t * 40) < 0) return;
  const flash = Math.max(0, 1 - acq / 0.2);
  glowAt(gl, x, y, 30 + flash * 30, [[0, `rgba(255, 70, 90, ${0.1 + flash * 0.4})`], [1, 'rgba(255, 30, 60, 0)']]);
  drawPixels(ctx, x, y, 92, MARK, (g) => {
    // four brackets, snapping in
    const B = 17 * s * breathe, L = 6;
    g.strokeStyle = R.white;
    g.lineWidth = 1.5;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      g.beginPath();
      g.moveTo(sx * B, sy * (B - L));
      g.lineTo(sx * B, sy * B);
      g.lineTo(sx * (B - L), sy * B);
      g.stroke();
    }
    // the broken ring, turning
    const r = 21 * s;
    g.strokeStyle = R.red;
    g.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const a = t * 1.8 + (i * Math.PI * 2) / 3;
      g.beginPath();
      g.arc(0, 0, r, a, a + 1.25);
      g.stroke();
    }
    // the inner ring the other way, with pointers in to the heart
    g.strokeStyle = R.deep;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, 0, 9, 0, Math.PI * 2);
    g.stroke();
    g.save();
    g.rotate(-t * 2.6);
    g.fillStyle = R.red;
    for (let i = 0; i < 4; i++) {
      g.rotate(Math.PI / 2);
      g.beginPath();
      g.moveTo(13, 0);
      g.lineTo(9, 1.8);
      g.lineTo(9, -1.8);
      g.closePath();
      g.fill();
    }
    g.restore();
    g.fillStyle = R.white;
    g.fillRect(-1, -1, 2, 2);
  });
}
