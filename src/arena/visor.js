// The target lock skill's look: a band of hologram across the eyes and a little screen projected out in front
// of them, ice-blue, flickering on; and, in red and white, the mark on whoever's locked - brackets snapping in
// round them, a broken ring turning, a line of light from the one who's locked them. Everyone sees that.

import { palette, drawPixels, glowAt, pixArc } from './pixfx.js';

const R = { white: '#ffffff', pale: '#ffc8c8', red: '#ff4a55', deep: '#c0182e', ink: '#6a0a1e' };
const MARK = palette(Object.values(R));
const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);

// The visor on the eyes at (x, y), looking toward `face` (1 / -1). k: seconds it's been on; left: seconds it has left.
// A burst of light as it boots; rings of hologram turning round the head; the band across the eyes, burning white at
// the middle, with a trace of light streaming off behind it; a wide screen thrown out in front, with figures and a
// sight on it; a line of scan going down the body.
export function drawVisor(ctx, x, y, face, k, left, t, feet = 18) {
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
  // the screen, thrown out in front: narrow at the eye, opening wide
  const sx = 10, ex = sx + 19 * open, h0 = 3, h1 = 3 + 12 * open;
  // (a column of pixels at a time: brighter at the eye, its top and bottom edges lit)
  for (let cx = sx; cx <= ex; cx++) {
    const q = (cx - sx) / Math.max(1, ex - sx), hh = Math.round(h0 + (h1 - h0) * q);
    ctx.fillStyle = `rgba(80, 210, 255, ${((0.5 - 0.36 * q) * shine).toFixed(2)})`;
    ctx.fillRect(cx, -hh, 1, hh * 2);
    ctx.fillStyle = 'rgba(150, 240, 255, 0.8)';
    ctx.fillRect(cx, -hh, 1, 1);
    ctx.fillRect(cx, hh, 1, 1);
  }
  if (open > 0.6) {
    const ex0 = Math.round(ex), H = Math.round(h1);
    // its corners, brighter
    ctx.fillStyle = 'rgba(235, 253, 255, 1)';
    ctx.fillRect(ex0 - 1, -H - 1, 3, 2);
    ctx.fillRect(ex0 - 1, H, 3, 2);
    ctx.fillRect(ex0, -H, 1, H * 2);
    // figures running down it
    const tick = Math.floor(t * 11);
    for (let i = 0; i < 6; i++) {
      const n = (Math.sin(tick * 3.1 + i * 7.7) * 0.5 + 0.5) * 9, ly = -H + 3 + i * 4;
      ctx.fillStyle = i === (tick % 6) ? 'rgba(255, 255, 255, 1)' : 'rgba(120, 235, 255, 0.85)';
      ctx.fillRect(ex0 - 2 - Math.round(n), ly, Math.round(n), 1);
    }
    // the sight turning at its edge, a dot at its heart
    const a = t * 3.4;
    ctx.fillStyle = 'rgba(255, 90, 105, 1)';
    for (let i = 0; i < 6; i++) ctx.fillRect(Math.round(ex0 + 8 + Math.cos(a + i * 1.05) * 5), Math.round(Math.sin(a + i * 1.05) * 5), 1, 1);
    ctx.fillRect(ex0 + 7, -1, 2, 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(ex0 + 2, 0, 3, 1);
    ctx.fillRect(ex0 + 11, 0, 3, 1);
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
