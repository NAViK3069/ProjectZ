// The flying swords skill's look, as pixel art (see pixfx.js), in white and ice-blue: the magic circle
// that opens upright behind the caster, the swords themselves - a long blade of light, white at its heart,
// a winged guard and a jewel - hanging in a fan over the shoulders, and the burst where one goes in.
//
// Each is drawn on `ctx`, its soft glow on `gl` (so the shapes can go on a layer of their own, behind the
// fighters, and the glow straight on the scene).

import { palette, drawPixels, glowAt } from './pixfx.js';

const S = { white: '#ffffff', ice: '#d6f6ff', sky: '#8fe0ff', blue: '#43a6ff', deep: '#1f62dc', ink: '#123a9a' };
const LIGHT = palette(Object.values(S));

const hash = (a, b, c) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
const span = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
const ease = (k) => 1 - Math.pow(1 - k, 3);
const poly = (g, pts, col) => {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fillStyle = col;
  g.fill();
};

// ---------- a sword ----------
// Lying along +x, the point at +13, the pommel at -11.
function paintSword(g) {
  poly(g, [[-3, -2.3], [9, -2.3], [13.2, 0], [9, 2.3], [-3, 2.3]], S.blue);
  poly(g, [[-3, -1.6], [9.2, -1.6], [12.2, 0], [9.2, 1.6], [-3, 1.6]], S.sky);
  poly(g, [[-3, -0.8], [9.6, -0.8], [11, 0], [9.6, 0.8], [-3, 0.8]], S.white);
  for (const s of [-1, 1]) {
    // the guard's wings, swept up along the blade
    poly(g, [[-5.4, s * 0.8], [-5.8, s * 3.2], [-4.6, s * 5.2], [-1.2, s * 6.8], [-2.8, s * 4.2], [-2.8, s * 1.6], [-3.4, s * 0.8]], S.blue);
    poly(g, [[-5, s * 1], [-5.1, s * 3], [-4.1, s * 4.4], [-2.6, s * 5.3], [-3.5, s * 3.6], [-3.5, s * 1]], S.ice);
  }
  g.fillStyle = S.deep;
  g.fillRect(-9.2, -0.9, 4.6, 1.8);
  g.fillStyle = S.sky;
  for (const x of [-8.6, -7.2, -5.8]) g.fillRect(x, -0.9, 0.6, 1.8);
  poly(g, [[-11.4, 0], [-9.8, -1.6], [-8.6, 0], [-9.8, 1.6]], S.ice);
  g.fillStyle = S.deep;
  g.beginPath();
  g.arc(-4.2, 0, 2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = S.white;
  g.beginPath();
  g.arc(-4.2, 0, 1.2, 0, Math.PI * 2);
  g.fill();
}
const STEP = Math.PI / 60, turned = new Map();   // (a sword at rest needn't be worked out afresh: kept, one for each way it can point)
// A sword with its middle at (x, y), pointing along a. Coming into being or going: scale, alpha; hot: flaring up.
export function drawSword(ctx, gl, x, y, a, t, seed = 0, { scale = 1, alpha = 1, hot = 0 } = {}) {
  const pulse = 0.8 + 0.2 * Math.sin(t * 5 + seed), ux = Math.cos(a), uy = Math.sin(a);
  // the glow: long, along the blade
  gl.save();
  gl.globalCompositeOperation = 'lighter';
  gl.translate(x + ux * 3 * scale, y + uy * 3 * scale);
  gl.rotate(a);
  gl.scale(1, 0.34);
  const R = 19 * scale * (1 + hot * 0.4), gr = gl.createRadialGradient(0, 0, 0, 0, 0, R);
  gr.addColorStop(0, `rgba(150, 225, 255, ${(0.55 * pulse + 0.4 * hot) * alpha})`);
  gr.addColorStop(0.55, `rgba(70, 160, 255, ${(0.26 * pulse + 0.2 * hot) * alpha})`);
  gr.addColorStop(1, 'rgba(40, 110, 255, 0)');
  gl.fillStyle = gr;
  gl.fillRect(-R, -R, R * 2, R * 2);
  gl.restore();
  if (scale === 1 && alpha === 1) {
    const n = Math.round(a / STEP);
    let cache = turned.get(n);
    if (!cache) turned.set(n, (cache = {}));
    drawPixels(ctx, x, y, 34, LIGHT, (g) => { g.rotate(n * STEP); paintSword(g); }, cache, n);
  } else {
    drawPixels(ctx, x, y, 34, LIGHT, (g) => { g.globalAlpha = alpha; g.rotate(a); g.scale(scale, scale); paintSword(g); });
  }
  if (alpha < 0.5) return;
  // a glint running up the blade, now and again
  const run = (t * 0.55 + hash(seed, 1, 2)) % 1;
  if (run < 0.3) {
    const at = -3 + (run / 0.3) * 16;
    gl.save();
    gl.globalCompositeOperation = 'lighter';
    gl.fillStyle = 'rgba(255, 255, 255, 0.9)';
    const gx = Math.round(x + ux * at * scale), gy = Math.round(y + uy * at * scale);
    gl.fillRect(gx - 1, gy, 3, 1);
    gl.fillRect(gx, gy - 1, 1, 3);
    gl.restore();
  }
  // motes of light coming off it, drifting up
  gl.save();
  gl.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const ph = (t * (0.5 + hash(i, seed, 3) * 0.4) + hash(i, seed, 4)) % 1, along = -6 + hash(i, seed, 5) * 18;
    gl.globalAlpha = Math.sin(ph * Math.PI) * 0.85 * alpha;
    gl.fillStyle = i % 2 ? S.sky : S.white;
    gl.fillRect(Math.round(x + ux * along + (hash(i, seed, 6) - 0.5) * 6), Math.round(y + uy * along - ph * 9), 1, 1);
  }
  gl.restore();
}

// The streak behind a sword in flight: (x, y) its middle, flying along a.
export function drawSwordTrail(gl, x, y, a) {
  const L = 44, ex = x - Math.cos(a) * L, ey = y - Math.sin(a) * L;
  gl.save();
  gl.globalCompositeOperation = 'lighter';
  const gr = gl.createLinearGradient(x, y, ex, ey);
  gr.addColorStop(0, 'rgba(190, 240, 255, 0.85)');
  gr.addColorStop(0.4, 'rgba(80, 170, 255, 0.4)');
  gr.addColorStop(1, 'rgba(40, 110, 255, 0)');
  gl.strokeStyle = gr;
  gl.lineWidth = 5;
  gl.beginPath();
  gl.moveTo(x, y);
  gl.lineTo(ex, ey);
  gl.stroke();
  gl.lineWidth = 1.5;
  gl.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  gl.beginPath();
  gl.moveTo(x, y);
  gl.lineTo(x - Math.cos(a) * L * 0.4, y - Math.sin(a) * L * 0.4);
  gl.stroke();
  gl.restore();
}

// ---------- the magic circle ----------
// Upright behind the caster: a double ring with marks round it turning one way, a star and an inner ring turning
// the other, five blades of light pointing out from the heart. Opens out from nothing (k: 0 .. 1), and fades (alpha).
export function drawSwordCircle(ctx, gl, x, y, k, t, alpha = 1) {
  const r = 31 * ease(Math.min(1, k * 1.5));
  if (r < 1) return;
  glowAt(gl, x, y, r * 1.8, [[0, `rgba(150, 215, 255, ${0.16 * alpha})`], [0.55, `rgba(70, 150, 255, ${0.14 * alpha})`], [1, 'rgba(40, 90, 255, 0)']]);
  drawPixels(ctx, x, y, 84, LIGHT, (g) => {
    g.globalAlpha = alpha;
    g.save();
    g.rotate(t * 0.6);
    g.strokeStyle = S.blue;
    g.lineWidth = 1.8;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = S.ice;
    g.lineWidth = 0.7;
    g.beginPath();
    g.arc(0, 0, r * 0.91, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 20; i++) {
      g.save();
      g.rotate((i / 20) * Math.PI * 2);
      g.fillStyle = i % 5 ? S.sky : S.white;
      if (i % 5) g.fillRect(r * 0.78, -0.5, 1.8, 1);
      else poly(g, [[r + 3.6, 0], [r + 0.6, 1.8], [r - 1.6, 0], [r + 0.6, -1.8]], S.white);
      g.restore();
    }
    g.restore();
    g.save();
    g.rotate(-t * 0.9);
    g.strokeStyle = S.sky;
    g.lineWidth = 0.9;
    g.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * (Math.PI * 2)) / 5;
      i ? g.lineTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72) : g.moveTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
    }
    g.stroke();
    g.strokeStyle = S.deep;
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(0, 0, r * 0.72, 0, Math.PI * 2);
    g.stroke();
    g.restore();
    g.save();
    g.rotate(t * 1.4);
    for (let i = 0; i < 5; i++) {
      g.save();
      g.rotate((i / 5) * Math.PI * 2);
      poly(g, [[r * 0.14, 0], [r * 0.26, 1.3], [r * 0.54, 0], [r * 0.26, -1.3]], S.ice);
      g.restore();
    }
    g.fillStyle = S.white;
    g.beginPath();
    g.arc(0, 0, r * 0.1, 0, Math.PI * 2);
    g.fill();
    g.restore();
  });
  // motes of light drawn in to it, from all round
  gl.save();
  gl.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 18; i++) {
    const ph = (t * 0.9 + i / 18) % 1, a = (i / 18) * Math.PI * 2 + t * 0.4, d = r * (1.6 - ph * 1.3);
    gl.globalAlpha = Math.sin(ph * Math.PI) * alpha;
    gl.fillStyle = i % 3 ? S.sky : S.white;
    gl.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d), 1, 1);
  }
  gl.restore();
}

// ---------- where a sword goes in ----------
// All along the line it came (ax, ay): a white flash in a long four-pointed star, a ring of light spreading, lines
// of force shooting on ahead, the blade's light shattering into splinters. k: 0 .. 1 over its life.
export function drawStab(ctx, gl, x, y, k, t, seed, ax = 1, ay = 0) {
  const e = ease(k), flash = 1 - span(k, 0, 0.3), ang = Math.atan2(ay, ax);
  glowAt(gl, x, y, 46, [[0, `rgba(210, 245, 255, ${0.7 * flash + 0.15 * (1 - k)})`], [0.5, `rgba(70, 160, 255, ${0.25 * (1 - k)})`], [1, 'rgba(40, 100, 255, 0)']]);
  drawPixels(ctx, x, y, 90, LIGHT, (g) => {
    g.save();
    g.rotate(ang);
    g.globalAlpha = 1 - span(k, 0.35, 1);
    g.strokeStyle = S.blue;
    g.lineWidth = 2.4 * (1 - k) + 0.6;
    g.beginPath();
    g.ellipse(0, 0, 5 + e * 20, 5 + e * 24, 0, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + hash(i, 4, seed) * 0.5, fwd = Math.max(0, Math.cos(a));
      const d0 = 6 + e * (12 + fwd * 18), len = (5 + fwd * 12) * (1 - k);
      if (len < 1) continue;
      g.strokeStyle = i % 2 ? S.sky : S.white;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(Math.cos(a) * d0, Math.sin(a) * d0);
      g.lineTo(Math.cos(a) * (d0 + len), Math.sin(a) * (d0 + len));
      g.stroke();
    }
    const keep = 1 - span(k, 0.05, 0.42);
    if (keep > 0) {
      for (const [L, w, col] of [[34, 5, S.blue], [28, 3.2, S.ice], [20, 1.6, S.white]]) {
        poly(g, [[L * keep, 0], [2, w * keep], [-L * 0.32 * keep, 0], [2, -w * keep]], col);
        poly(g, [[2, L * 0.52 * keep], [2 + w * keep, 0], [2, -L * 0.52 * keep], [2 - w * keep, 0]], col);
      }
    }
    g.restore();
    for (let i = 0; i < 9; i++) {
      const a = ang + (hash(i, 2, seed) - 0.5) * 2.6, d = 4 + e * (18 + hash(i, 3, seed) * 20), s = (1.8 + hash(i, 7, seed) * 1.8) * (1 - k * 0.6), r = a + t * 8 + i;
      g.save();
      g.translate(Math.cos(a) * d, Math.sin(a) * d + e * e * 5);
      g.rotate(r);
      g.globalAlpha = 1 - span(k, 0.55, 1);
      poly(g, [[s * 1.6, 0], [0, s * 0.5], [-s * 1.6, 0], [0, -s * 0.5]], i % 2 ? S.ice : S.sky);
      g.restore();
    }
  });
}
