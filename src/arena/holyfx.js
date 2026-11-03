// Excalibur's looks, all in pixels. The sword: a long straight blade of bright steel, a gold line run down the middle
// of it, a wide gold cross-guard with blue at its heart, a grip bound in blue and gold wire. It's unveiled out of a
// wind that wraps it, coming apart in white ribbons; held up to the sky, light gathers to it - motes rising off the
// ground all round and spiralling up into the blade, a column of light let down from the sky onto it, gold halos
// pulsing round it, a ring of light at the feet - till the whole blade is white with it. Then it's brought down, a
// crescent of gold left behind the stroke, and it goes: a wave of light as wide as a wall, white at its heart, gold to
// its edges, streaks of light racing down it and rays thrown off its sides, its front a bright swell - and after it's
// gone, gold dust left drifting up all along where it went.

import { pixArc, glowAt } from './pixfx.js';

const hash = (a, b, c = 0) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const lit = (ctx, fn) => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; fn(); ctx.restore(); };
const C = { ink: '#1a1206', amber: '#8a5410', gold: '#d89a1a', goldHi: '#ffd24a', pale: '#fff0a8', core: '#ffffff', sky: '#cfeaff', blue: '#1e3a9a', blueHi: '#5a8aff', blueLo: '#101e52', steel: '#c4ccd8', steelHi: '#f4f8ff', steelLo: '#6a7484' };
export const EX_LEN = 34;       // the sword, the main hand to the point
export const EX_SUPPORT = -4.5; // the other hand, behind it on the grip (as a katana's)

// ---------- the sword ----------
// In the current transform: the main hand's grip at (0, 0), the blade along +x, as fine as the melee weapons (two of
// its pixels to a world pixel). light 0..1: how much of the gathered light is in the blade.
export function drawExSword(ctx, light, t) {
  ctx.save();
  ctx.scale(0.5, 0.5);
  const r = (X, Y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(X, Y, w, h); };
  // the pommel: gold, a blue stone in it
  r(-16, -3, 4, 6, C.amber); r(-16, -3, 4, 1, C.goldHi); r(-15, -2, 2, 4, C.gold); r(-15, -1, 2, 2, C.blueHi);
  // the grip: blue, bound in gold wire on the slant
  for (let x = -12; x < 4; x++) for (let y = -2; y <= 2; y++) r(x, y, 1, 1, (x - y + 40) % 4 === 0 ? C.goldHi : y === -2 ? '#3a5ad0' : y === 2 ? C.blueLo : C.blue);
  // the guard: wide, gold, the ends swept forward, blue at the heart
  r(4, -9, 3, 19, C.amber); r(4, -9, 2, 18, C.gold); r(4, -9, 1, 1, C.goldHi); r(6, -10, 2, 2, C.goldHi); r(6, 9, 2, 2, C.gold);
  r(4, -2, 3, 5, C.blue); r(5, -1, 1, 2, C.blueHi);
  // the blade: bright steel, the top catching the light, the gold line down the middle, tapering to a point
  const L = 58, x0 = 7;
  for (let i = 0; i < L; i++) {
    const x = x0 + i, k = Math.max(0, i - (L - 12)) / 12, hh = Math.max(1, Math.round(3.4 * (1 - k * k)));
    for (let y = -hh; y <= hh; y++) {
      let c = y === -hh ? C.steelHi : y === hh ? C.steelLo : y < 0 ? C.steel : '#a8b2c0';
      if ((y === 0 || y === -1) && i > 1 && i < L - 14) c = i % 6 === 0 ? C.goldHi : C.gold;   // (the gold line, engraved)
      // the light gathered: running up the blade from the guard, the steel going pale gold, then white
      if (light > 0) {
        const lv = light * 1.3 - i / L * 0.5 + 0.12 * Math.sin(t * 18 - i * 0.4);
        if (lv > 0.85) c = y === 0 || y === -1 ? C.core : C.pale;
        else if (lv > 0.5) c = c === C.steelLo ? C.gold : c === C.gold ? C.pale : C.goldHi;
        else if (lv > 0.25 && c !== C.gold) c = c === C.steelLo ? C.steel : C.steelHi;
      }
      r(x, y, 1, 1, c);
    }
  }
  ctx.restore();
  // lit: a gold edge of light round the blade, flickering
  if (light > 0.3) lit(ctx, () => {
    ctx.save();
    ctx.scale(0.5, 0.5);
    ctx.globalAlpha = Math.min(1, (light - 0.3) / 0.5) * (0.6 + 0.4 * Math.sin(t * 30));
    ctx.fillStyle = C.goldHi;
    for (let i = 0; i < L; i += 1) {
      if (hash(i, Math.floor(t * 14)) > 0.55) continue;
      const k = Math.max(0, i - (L - 12)) / 12, hh = Math.max(1, Math.round(3.4 * (1 - k * k)));
      r(x0 + i, -hh - 1 - (hash(i, 3) > 0.7 ? 1 : 0), 1, 1, C.goldHi);
      r(x0 + i, hh + 1, 1, 1, C.gold);
    }
    ctx.restore();
  });
}

// ---------- unveiled ----------
// The wind wrapped round the sword (the blade along a from (gx, gy)) coming apart: ribbons of white and pale blue round
// it, turning, thrown off wider and fainter as k goes 0..1.
export function drawExVeil(ctx, gx, gy, a, k, t, seed) {
  const ux = Math.cos(a), uy = Math.sin(a);
  lit(ctx, () => {
    for (let i = 0; i < 7; i++) {
      const s = 4 + (i / 6) * (EX_LEN - 2), px = gx + ux * s, py = gy + uy * s, spin = t * 14 * (i % 2 ? -1 : 1) + i * 1.3 + seed;
      const w = 4 + k * (10 + hash(i, seed) * 14);
      ctx.globalAlpha = Math.max(0, 1 - k * 1.1) * 0.9;
      ctx.fillStyle = i % 2 ? C.sky : C.core;
      pixArc(ctx, px, py, w, w * 0.35, a + Math.PI / 2, spin, spin + Math.PI * (1.4 - k * 0.6));
    }
    // flecks of wind blown off it
    for (let i = 0; i < 18; i++) {
      const ph = Math.min(1, k * 1.2 + hash(i, 2) * 0.2), s = hash(i, seed, 3) * EX_LEN, side = hash(i, 4) > 0.5 ? 1 : -1, d = 3 + ph * (18 + 20 * hash(i, 5));
      ctx.globalAlpha = 1 - ph;
      ctx.fillStyle = hash(i, 6) > 0.5 ? C.sky : C.core;
      ctx.fillRect(Math.round(gx + ux * s - uy * d * side), Math.round(gy + uy * s + ux * d * side), hash(i, 7) > 0.6 ? 2 : 1, 1);
    }
    ctx.globalAlpha = 1;
  });
}

// ---------- the charge ----------
// The sword held up, its point at (tx, ty), the grip at (gx, gy), the feet at (fx, fy); k 0..1 through the charge.
export function drawExCharge(ctx, tx, ty, gx, gy, fx, fy, k, t, seed) {
  const e = k * k;
  // the column of light let down from the sky onto the blade
  lit(ctx, () => {
    const cw = 2 + Math.round(9 * k), top = ty - 260;
    for (let x = -cw; x <= cw; x++) {
      const edge = Math.abs(x) / (cw + 1), a = (0.08 + 0.26 * k) * (1 - edge * edge) * (0.75 + 0.25 * Math.sin(t * 9 + x * 1.7));
      ctx.globalAlpha = a;
      ctx.fillStyle = Math.abs(x) < cw * 0.35 ? C.pale : C.goldHi;
      ctx.fillRect(Math.round(tx) + x, Math.round(top), 1, Math.round(ty - top));
    }
    // motes coming down it
    for (let i = 0; i < 6 + k * 16; i++) {
      const ph = (t * (1.2 + hash(i, 1)) + hash(i, seed, 2)) % 1;
      ctx.globalAlpha = 0.5 + 0.5 * k;
      ctx.fillStyle = hash(i, 3) > 0.5 ? C.core : C.pale;
      ctx.fillRect(Math.round(tx + (hash(i, 4) - 0.5) * cw * 2), Math.round(top + ph * (ty - top)), 1, 2 + Math.floor(hash(i, 5) * 3));
    }
    ctx.globalAlpha = 1;
  });
  lit(ctx, () => {
    // light rising off the ground all round, and drawn up in a spiral into the blade
    const n = 16 + Math.floor(k * 56);
    for (let i = 0; i < n; i++) {
      const life = 1.1, ph = ((t + hash(i, seed) * life) % life) / life, q = ph * ph * (3 - 2 * ph);
      const sx = fx + (hash(i, seed, 1) - 0.5) * (90 + 60 * k), sy = fy - 1;
      const ex = gx + (tx - gx) * hash(i, 8), ey = gy + (ty - gy) * hash(i, 8);
      const sp = (1 - q) * (8 + 10 * hash(i, 9)), ang = t * 6 + i;
      const px = sx + (ex - sx) * q + Math.cos(ang) * sp, py = sy + (ey - sy) * q + Math.sin(ang) * sp * 0.3;
      ctx.globalAlpha = Math.min(1, ph * 4) * (0.5 + 0.5 * k);
      ctx.fillStyle = ph > 0.85 ? C.core : hash(i, 10) > 0.4 ? C.goldHi : C.pale;
      ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
      if (hash(i, 11) > 0.7) ctx.fillRect(Math.round(px), Math.round(py) + 1, 1, 1);
    }
    // halos up the blade, gold, pulsing
    for (let i = 0; i < 3; i++) {
      const h = (i + 1) / 4, cy = gy + (ty - gy) * h, w = 5 + 4 * i * 0.5 + 6 * k + Math.sin(t * 8 + i * 2) * 1.5;
      ctx.globalAlpha = 0.35 + 0.55 * k;
      ctx.fillStyle = i === 1 ? C.pale : C.goldHi;
      pixArc(ctx, gx + (tx - gx) * h, cy, w, w * 0.28, 0, 0, Math.PI * 2);
    }
    // a great halo over the point, turning, as it nears full
    if (k > 0.3) {
      ctx.globalAlpha = Math.min(1, (k - 0.3) / 0.4);
      ctx.fillStyle = C.goldHi;
      const R = 9 + 10 * k;
      for (let j = 0; j < 8; j++) { const a0 = t * 2 + (j * Math.PI) / 4; pixArc(ctx, tx, ty - 3, R, R * 0.32, 0, a0, a0 + 0.5); }
      ctx.fillStyle = C.pale;
      pixArc(ctx, tx, ty - 3, R - 3, (R - 3) * 0.32, 0, 0, Math.PI * 2);
    }
    // the ring of light at the feet: two of them, turning their own ways, with marks round them
    ctx.globalAlpha = 0.4 + 0.5 * k;
    const RX = 16 + 26 * k, RY = 3 + 3 * k;
    ctx.fillStyle = C.goldHi;
    for (let j = 0; j < 6; j++) { const a0 = t * 1.5 + (j * Math.PI) / 3; pixArc(ctx, fx, fy - 1, RX, RY, 0, a0, a0 + 0.75); }
    ctx.fillStyle = C.pale;
    pixArc(ctx, fx, fy - 1, RX * 0.7, RY * 0.7, 0, -t * 2, -t * 2 + Math.PI * 1.6);
    ctx.fillStyle = C.core;
    for (let j = 0; j < 12; j++) {
      const a0 = (j / 12) * Math.PI * 2 - t * 1.5;
      ctx.fillRect(Math.round(fx + Math.cos(a0) * RX * 0.85), Math.round(fy - 1 + Math.sin(a0) * RY * 0.85), 1, 1);
    }
    ctx.globalAlpha = 1;
    // the star at the point, its arms growing
    const S = Math.round(2 + 7 * e + (k > 0.8 ? 2 * Math.sin(t * 40) : 0));
    ctx.fillStyle = C.pale;
    ctx.fillRect(Math.round(tx) - S, Math.round(ty), S * 2 + 1, 1);
    ctx.fillRect(Math.round(tx), Math.round(ty) - S, 1, S * 2 + 1);
    ctx.fillStyle = C.core;
    ctx.fillRect(Math.round(tx) - 1, Math.round(ty) - 1, 3, 3);
  });
  glowAt(ctx, tx, ty, 14 + 46 * e, [[0, `rgba(255, 250, 220, ${0.3 + 0.5 * e})`], [0.4, `rgba(255, 200, 80, ${0.2 + 0.25 * e})`], [1, 'rgba(255, 180, 40, 0)']]);
  glowAt(ctx, fx, fy - 4, 30 + 30 * k, [[0, `rgba(255, 220, 120, ${0.12 + 0.2 * k})`], [1, 'rgba(255, 200, 80, 0)']]);
}

// The stroke down: a crescent of gold left behind the blade, from angle a0 to a1 round (gx, gy), k 0..1 how far gone.
export function drawExSlash(ctx, gx, gy, a0, a1, k) {
  if (k >= 1) return;
  lit(ctx, () => {
    for (let j = 0; j < 5; j++) {
      const R = EX_LEN - 2 - j * 2.5;
      ctx.globalAlpha = (1 - k) * (1 - j * 0.15);
      ctx.fillStyle = j === 0 ? C.core : j < 3 ? C.pale : C.goldHi;
      pixArc(ctx, gx, gy, R, R, 0, Math.min(a0, a1), Math.max(a0, a1));
    }
    ctx.globalAlpha = 1;
  });
}

// ---------- the wave ----------
// From (ox, oy) along a, len long; wk 0..1 how wide it is. Worked out a pixel at a time over the part of it on screen.
const WAVE_W = 24, BURST_R = 20;
const RGB = Object.fromEntries(Object.entries(C).map(([k, h]) => [k, [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]]));
const BANDS = [RGB.core, RGB.pale, RGB.goldHi, RGB.gold, RGB.amber];
let scratch = null, scratchG = null, buf = null;
export function drawExWave(ctx, ox, oy, a, len, wk, t, seed, full) {
  if (wk <= 0.02) return;
  const W = WAVE_W * wk, R = W * 1.9, BR = BURST_R * Math.min(1, wk * 1.3);
  const ux = Math.cos(a), uy = Math.sin(a), ex = ox + ux * len, ey = oy + uy * len;
  const inv = ctx.getTransform().inverse(), cw = ctx.canvas.width, ch = ctx.canvas.height;
  const c0 = inv.transformPoint({ x: 0, y: 0 }), c1 = inv.transformPoint({ x: cw, y: ch });
  const x0 = Math.max(Math.floor(Math.min(ox, ex) - R - BR), Math.floor(Math.min(c0.x, c1.x)));
  const x1 = Math.min(Math.ceil(Math.max(ox, ex) + R + BR), Math.ceil(Math.max(c0.x, c1.x)));
  const y0 = Math.max(Math.floor(Math.min(oy, ey) - R - BR), Math.floor(Math.min(c0.y, c1.y)));
  const y1 = Math.min(Math.ceil(Math.max(oy, ey) + R + BR), Math.ceil(Math.max(c0.y, c1.y)));
  const bw = x1 - x0, bh = y1 - y0;
  if (bw <= 0 || bh <= 0) return;
  if (!scratch || scratch.width < bw || scratch.height < bh) {
    scratch = document.createElement('canvas');
    scratch.width = Math.max(bw, scratch?.width ?? 0);
    scratch.height = Math.max(bh, scratch?.height ?? 0);
    scratchG = scratch.getContext('2d');
  }
  if (!buf || buf.width !== bw || buf.height !== bh) buf = scratchG.createImageData(bw, bh);
  const d = buf.data;
  d.fill(0);
  const put = (i, c) => { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; };
  const flow = t * 1400, wave = t * 20 + seed, head = full ? 0 : 30;   // (the swell at its front, while it's still going out)
  for (let j = 0; j < bh; j++) {
    const py = y0 + j + 0.5, ry = py - oy;
    let ia = 0, ib = bw;
    if (Math.abs(uy) > 1e-3) {
      const xa = ox + (ux * ry - R) / uy, xb = ox + (ux * ry + R) / uy;
      ia = Math.max(0, Math.floor(Math.min(xa, xb) - x0) - 1);
      ib = Math.min(bw, Math.ceil(Math.max(xa, xb) - x0) + 1);
    } else if (Math.abs(ry) > R && Math.abs(ry) > BR) continue;
    if (Math.abs(ry) < BR) { ia = Math.min(ia, Math.max(0, Math.floor(ox - BR - x0))); ib = Math.max(ib, Math.min(bw, Math.ceil(ox + BR - x0))); }
    for (let i = ia; i < ib; i++) {
      const px = x0 + i + 0.5, rx = px - ox, s = rx * ux + ry * uy, q = -rx * uy + ry * ux, o = (j * bw + i) * 4;
      const by = BAYER[((y0 + j) & 3) * 4 + ((x0 + i) & 3)];
      // the burst at the sword's point: a star of light, its rays turning slowly
      const rr = Math.hypot(rx, ry);
      if (rr < BR) {
        const ray = Math.pow(Math.abs(Math.sin(Math.atan2(ry, rx) * 4 + t * 3)), 6), k = rr / BR;
        if (k < 0.25 || ray > k * 1.1) { put(o, k < 0.4 ? RGB.core : k < 0.7 ? RGB.pale : RGB.goldHi); continue; }
      }
      if (s < -1 || s > len) continue;
      let hw = W * Math.min(1, 0.4 + s / 50) * (1 + 0.06 * Math.sin(s * 0.04 - wave));
      // the front: a swell, and round
      if (head && s > len - head) hw *= 1 + 0.4 * ((s - (len - head)) / head);
      if (s > len - hw) hw *= Math.sqrt(Math.max(0, 1 - ((s - (len - hw)) / Math.max(1, hw)) ** 2));
      const ad = Math.abs(q) / Math.max(0.5, hw);
      if (ad <= 1) {
        if (ad > 0.86 && by < (ad - 0.86) / 0.14) continue;
        if (head && s > len - 7 && ad < 0.95) { put(o, RGB.core); continue; }   // (the very front: white)
        const n = hash(Math.floor((s - flow) / 9), Math.floor(q / 1.5) + 70);
        let band = ad < 0.25 ? 0 : ad < 0.5 ? 1 : ad < 0.75 ? 2 : ad < 0.93 ? 3 : 4;
        if (n > 0.9 && band > 0) band--;          // (streaks of light racing down it)
        else if (n < 0.07 && band < 4 && band > 0) band++;
        put(o, BANDS[band]);
      } else if (ad < 1.75) {
        // a halo of light round it, thin at once; and rays thrown off its sides, a pixel wide, flickering
        const ray = hash(Math.floor(s + t * 40), q > 0 ? 3 : 4, Math.floor(t * 12)) > 0.93;
        if (ray && ad < 1.2 + 0.5 * hash(Math.floor(s), 5)) { put(o, ad < 1.3 ? RGB.goldHi : RGB.gold); continue; }
        if (ad < 1.25 && by < (1.25 - ad) * 1.2) put(o, RGB.gold);
      }
    }
  }
  scratchG.putImageData(buf, 0, 0);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, 0, 0, bw, bh, x0, y0, bw, bh);
  ctx.imageSmoothingEnabled = smooth;
  // glints over it, twinkling: small crosses of white
  lit(ctx, () => {
    for (let i = 0; i < 26; i++) {
      const s = hash(i, seed, 1) * len, q = (hash(i, 2) - 0.5) * W * 3, tw = Math.sin(t * (10 + hash(i, 3) * 10) + i * 3);
      if (tw < 0.3) continue;
      const x = Math.round(ox + ux * s - uy * q), y = Math.round(oy + uy * s + ux * q), L = tw > 0.85 ? 2 : 1;
      ctx.fillStyle = C.core;
      ctx.fillRect(x - L, y, L * 2 + 1, 1);
      ctx.fillRect(x, y - L, 1, L * 2 + 1);
    }
  });
  for (let s = 0; s < len; s += 90) glowAt(ctx, ox + ux * s, oy + uy * s, 50 * wk, [[0, `rgba(255, 230, 140, ${0.24 * wk})`], [1, 'rgba(255, 200, 80, 0)']]);
}

// The moment it goes: a flash and a ring of gold thrown out from the point, k 0..1 through it.
export function drawExBlast(ctx, x, y, k, t) {
  glowAt(ctx, x, y, 40 + 80 * k, [[0, `rgba(255, 255, 240, ${0.8 * (1 - k)})`], [0.3, `rgba(255, 210, 90, ${0.5 * (1 - k)})`], [1, 'rgba(255, 180, 40, 0)']]);
  lit(ctx, () => {
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = C.pale;
    pixArc(ctx, x, y, 10 + 60 * k, 10 + 60 * k, 0, 0, Math.PI * 2);
    ctx.fillStyle = C.goldHi;
    pixArc(ctx, x, y, 6 + 40 * k, 2 + 12 * k, 0, 0, Math.PI * 2);
    ctx.globalAlpha = 1;
  });
}

// After it: gold dust drifting up all along where it went, k 0..1 as it fades.
export function drawExAfter(ctx, ox, oy, a, len, k, t, seed) {
  const ux = Math.cos(a), uy = Math.sin(a);
  lit(ctx, () => {
    for (let i = 0; i < 90; i++) {
      const s = hash(i, seed, 7) * len, q = (hash(i, 8) - 0.5) * WAVE_W * 1.6, rise = k * (10 + hash(i, 9) * 26);
      ctx.globalAlpha = (1 - k) * (0.4 + 0.6 * hash(i, 10));
      ctx.fillStyle = hash(i, 11) > 0.6 ? C.pale : C.goldHi;
      ctx.fillRect(Math.round(ox + ux * s - uy * q + Math.sin(t * 3 + i) * 2), Math.round(oy + uy * s + ux * q - rise), 1, 1);
    }
    // the line of it, fading: a thin band of gold where it ran
    ctx.globalAlpha = (1 - k) * 0.5;
    ctx.fillStyle = C.goldHi;
    for (let s = 0; s < len; s += 2) if (hash(Math.floor(s / 2), seed) > k) ctx.fillRect(Math.round(ox + ux * s), Math.round(oy + uy * s), 1, 1);
    ctx.globalAlpha = 1;
  });
}
