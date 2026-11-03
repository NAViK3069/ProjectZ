// Enuma Elish's looks, all in pixels. The sword: a gold hilt, and for a blade three black cylinders one after another,
// each narrower than the last, red lines cut round them - and each turning its own way, faster and faster, as it
// charges. It comes out of a ripple of gold in the air and is held up to the sky; the wind is pulled in round it in red
// rings, sparks spiralling into its point, the air over it torn upward, red light at its tip swelling. Then it's
// brought down to the aim and it all goes: a beam of red wind, dark at its edges and white at its heart, two strands
// twisting round it, the wind still spinning outside it - and at the sword's point, a red-and-black whirl.

import { pixArc, glowAt } from './pixfx.js';

const hash = (a, b, c = 0) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const lit = (ctx, fn) => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; fn(); ctx.restore(); };
const C = { ink: '#120006', deep: '#3a0010', dark: '#7a0616', red: '#e0182a', hot: '#ff5a3a', pale: '#ffb08a', core: '#fff2e6', wind: '#b0101e', gold: '#d8a42a', goldHi: '#ffe08a', goldLo: '#7a5410' };
export const EA_LEN = 33;   // the sword, the main hand to the point
export const EA_SUPPORT = -4.5;   // where the other hand holds it, behind the main hand (as a katana's)

// ---------- the sword ----------
// In the current transform: the main hand's grip at (0, 0), the blade along +x. Drawn as fine as the melee weapons
// are (two of its pixels to a world pixel). spin: how far round the cylinders have turned (each its own way); heat
// 0..1: the red in its lines.
export function drawEaSword(ctx, spin, heat) {
  ctx.save();
  ctx.scale(0.5, 0.5);
  const r = (X, Y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(X, Y, w, h); };
  // the hilt: a gold pommel; the grip bound in dark red with gold diamonds across it (both hands on it, a katana's
  // length); a gold guard, narrow, with a red stone; a gold collar
  r(-15, -3, 3, 6, C.goldLo); r(-15, -3, 3, 1, C.goldHi); r(-14, -2, 1, 4, C.gold);
  for (let x = -12; x < 4; x++) for (let y = -2; y <= 2; y++) r(x, y, 1, 1, (x + y + 40) % 4 < 2 ? '#4a1018' : (x - y + 40) % 4 < 2 ? C.gold : '#2a080c');
  r(4, -7, 2, 15, C.goldLo); r(4, -7, 2, 1, C.goldHi); r(4, -6, 1, 13, C.gold); r(4, -1, 2, 3, heat > 0.2 ? '#ff4a4a' : '#b0202a');
  r(6, -3, 3, 7, C.gold); r(6, -3, 3, 1, C.goldHi);
  // the three cylinders, each a little narrower than the one before: [from, length, rows above the middle, below]
  const segs = [[9, 18, 5, 5], [27, 16, 4, 5], [43, 15, 4, 4]];
  const lc = heat > 0.66 ? '#ff7a5a' : heat > 0.25 ? '#ff2a3a' : '#9a1424';
  segs.forEach(([sx, len, up, dn], i) => {
    const top = -up, h = up + dn;
    r(sx, top, len, h, '#26242e');
    r(sx, top, len, 1, '#8a8696');                // (the light along the top)
    r(sx, top + 1, len, 1, '#3e3c48');
    r(sx, top + h - 1, len, 1, '#0c0a10');        // (the dark under)
    r(sx, top + h - 2, len, 1, '#17151c');
    if (heat > 0.4) r(sx, 0, len, 1, heat > 0.8 ? '#ff9a7a' : '#a81828');   // (lit along its middle)
    // the red lines round it: they run round as it turns (this one this way, the next the other)
    const dir = i % 2 ? -1 : 1, at = ((spin * dir * (3 + i)) % len + len) % len;
    for (const k of [0, len / 3, (len * 2) / 3]) {
      const lx = sx + Math.floor((at + k) % len);
      r(lx, top, 1, h, lc);
      if (heat > 0.5) { r(lx, top - 1, 1, 1, '#ff2a3a'); r(lx, top + h, 1, 1, '#ff2a3a'); }
    }
    r(sx, top, 1, h, C.goldLo);                    // (a gold band where each begins)
  });
  // the point: tapering to nothing
  for (let i = 0; i < 8; i++) { const hh = 4 - Math.floor(i / 2); r(58 + i, -hh + 1, 1, hh * 2 - 1, i > 5 && heat > 0.5 ? '#ff7a5a' : i % 2 ? '#3e3c48' : '#26242e'); }
  ctx.restore();
}

// ---------- coming out of the gold ----------
// The ripple it's drawn from, at (x, y), k 0..1 through it: rings of gold going out, shimmering, then gone.
export function drawEaRipple(ctx, x, y, k, t) {
  lit(ctx, () => {
    for (let i = 0; i < 4; i++) {
      const q = k * 1.4 - i * 0.18;
      if (q <= 0 || q >= 1) continue;
      const rx = 5 + q * 20, ry = 2 + q * 6;
      ctx.globalAlpha = 1 - q;
      ctx.fillStyle = i % 2 ? C.goldHi : C.gold;
      pixArc(ctx, x, y, rx, ry, 0, t * 3 + i, t * 3 + i + Math.PI * 1.7);
    }
    ctx.globalAlpha = 1;
    // glints flicking off it
    for (let i = 0; i < 8; i++) {
      if (hash(i, Math.floor(t * 20)) > 0.5 * (1 - k) + 0.25) continue;
      const a = hash(i, 3) * Math.PI * 2, d = 3 + hash(i, 5) * 14 * k;
      ctx.fillStyle = hash(i, 7) > 0.5 ? C.goldHi : '#ffffff';
      ctx.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d * 0.4), 1, 1);
    }
  });
  glowAt(ctx, x, y, 14 + 10 * (1 - k), [[0, `rgba(255, 210, 110, ${0.4 * (1 - k)})`], [1, 'rgba(255, 210, 110, 0)']]);
}

// ---------- the charge ----------
// The sword held up, its point at (tx, ty), the grip at (gx, gy); k 0..1 through the charge. Round the blade, rings of
// wind (red, turning, more of them and faster as it goes); sparks drawn in round it to the point; the air above torn
// upward in streaks; at the point, red light growing; dust pulled in along the ground to the feet at (fx, fy).
export function drawEaCharge(ctx, tx, ty, gx, gy, fx, fy, k, t, seed) {
  const e = k * k;
  lit(ctx, () => {
    // the rings of wind, up the blade and over it
    const n = 4 + Math.floor(k * 6);
    for (let i = 0; i < n; i++) {
      const h = (i / n + t * (0.6 + k * 1.4)) % 1, y = gy + (ty - gy) * 1.3 * h - 6 * h, w = 6 + 16 * Math.sin(h * Math.PI) * (0.5 + k);
      const spin = t * (8 + k * 18) * (i % 2 ? -1 : 1) + i;
      ctx.globalAlpha = Math.sin(h * Math.PI) * (0.5 + 0.5 * k);
      ctx.fillStyle = i % 3 === 0 ? C.hot : C.red;
      pixArc(ctx, gx + (tx - gx) * h, y, w, w * 0.32, 0, spin, spin + Math.PI * (0.8 + k * 0.7));
      ctx.fillStyle = C.dark;
      pixArc(ctx, gx + (tx - gx) * h, y + 1, w + 2, w * 0.36, 0, spin + Math.PI, spin + Math.PI * 1.5);
    }
    ctx.globalAlpha = 1;
    // sparks drawn in round it, into the point
    const sparks = 10 + Math.floor(k * 26);
    for (let i = 0; i < sparks; i++) {
      const life = 0.55, ph = ((t + hash(i, seed) * life) % life) / life;   // (each on its own way in)
      const a0 = hash(i, seed, 1) * Math.PI * 2 + t * 4, r = (1 - ph) * (26 + 22 * hash(i, 2)) * (0.6 + k * 0.6);
      const a = a0 + ph * 3.2;
      const px = tx + Math.cos(a) * r, py = ty + Math.sin(a) * r * 0.7 + (1 - ph) * 6;
      ctx.fillStyle = ph > 0.8 ? C.core : hash(i, 4) > 0.5 ? C.hot : C.red;
      ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
      if (k > 0.5 && ph > 0.3) ctx.fillRect(Math.round(px - Math.cos(a + 1.57) * 1.5), Math.round(py - Math.sin(a + 1.57)), 1, 1);
    }
    // the air over the point torn upward: a pillar of red wind going up into the sky, wider and higher as it builds
    const streaks = 10 + Math.floor(k * 50), pw = 2 + 7 * k, top = 60 + 160 * k;
    for (let i = 0; i < streaks; i++) {
      const sp = 1.2 + hash(i, 9) * 1.6, ph = (t * sp + hash(i, seed, 8)) % 1;
      const off = (hash(i, 6) - 0.5) * 2, sx = tx + off * pw * (1 + ph * 0.8) + Math.sin(t * 9 + i + ph * 6) * 1.5, sy = ty - 4 - ph * top;
      const len = 3 + Math.floor(hash(i, 10) * 10 * (0.4 + k));
      ctx.globalAlpha = (1 - ph) * (0.45 + 0.55 * k);
      ctx.fillStyle = Math.abs(off) < 0.3 && k > 0.5 ? C.pale : i % 3 ? C.red : C.hot;
      ctx.fillRect(Math.round(sx), Math.round(sy), 1, len);
    }
    ctx.globalAlpha = 1;
    // red rising off the body, and a ring of wind round the feet
    for (let i = 0; i < 6 + k * 14; i++) {
      const ph = (t * (1.4 + hash(i, 14)) + hash(i, seed, 15)) % 1, sx = fx + (hash(i, 16) - 0.5) * 16, sy = fy - 2 - ph * (30 + 14 * k);
      ctx.globalAlpha = (1 - ph) * (0.3 + 0.6 * k);
      ctx.fillStyle = hash(i, 17) > 0.5 ? C.red : C.dark;
      ctx.fillRect(Math.round(sx + Math.sin(t * 7 + i) * 2), Math.round(sy), 1, 2);
    }
    ctx.globalAlpha = 0.35 + 0.5 * k;
    ctx.fillStyle = C.red;
    pixArc(ctx, fx, fy - 1, 10 + 14 * k, 2 + 2 * k, 0, t * 9, t * 9 + Math.PI * 1.2);
    ctx.fillStyle = C.hot;
    pixArc(ctx, fx, fy - 1, 7 + 10 * k, 1.5 + 1.5 * k, 0, -t * 12, -t * 12 + Math.PI);
    ctx.globalAlpha = 1;
    // the dust and the wind along the ground, pulled in to the feet
    for (let i = 0; i < 6 + k * 10; i++) {
      const ph = (t * 1.6 + hash(i, seed, 2)) % 1, side = i % 2 ? 1 : -1, d = (1 - ph) * (30 + 30 * hash(i, 11));
      ctx.globalAlpha = ph * (0.4 + 0.5 * k);
      ctx.fillStyle = hash(i, 12) > 0.6 ? C.red : '#8a5a4a';
      ctx.fillRect(Math.round(fx + side * d), Math.round(fy - 1 - hash(i, 13) * 3 * ph), Math.max(1, Math.round(3 * (1 - ph))), 1);
    }
    ctx.globalAlpha = 1;
    // crackles of red at the point, once it's well along
    if (k > 0.45) for (let j = 0; j < 2; j++) {
      if (hash(j, Math.floor(t * 18), seed) > k * 0.8) continue;
      let x = tx, y = ty, a = hash(j, Math.floor(t * 18), 3) * Math.PI * 2;
      ctx.fillStyle = j ? C.pale : C.hot;
      for (let s = 0; s < 6 + k * 6; s++) {
        a += (hash(j, s, Math.floor(t * 18)) - 0.5) * 1.6;
        x += Math.cos(a) * 1.6;
        y += Math.sin(a) * 1.6;
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    }
  });
  // the light at the point, swelling, and a pulse to it near the end
  const pulse = k > 0.7 ? 0.5 + 0.5 * Math.sin(t * 40) : 0;
  glowAt(ctx, tx, ty, 12 + 44 * e + pulse * 8, [[0, `rgba(255, 120, 90, ${0.25 + 0.5 * e})`], [0.4, `rgba(220, 20, 40, ${0.25 * e + 0.1})`], [1, 'rgba(160, 0, 20, 0)']]);
  lit(ctx, () => {
    const R = Math.round(1 + k * 3 + pulse);
    ctx.fillStyle = C.red;
    ctx.fillRect(Math.round(tx) - R, Math.round(ty) - 1, R * 2 + 1, 3);
    ctx.fillRect(Math.round(tx) - 1, Math.round(ty) - R, 3, R * 2 + 1);
    ctx.fillStyle = C.core;
    ctx.fillRect(Math.round(tx) - 1, Math.round(ty) - 1, 2, 2);
  });
}

// ---------- the beam ----------
// From (ox, oy) along a, len long; wk 0..1 how wide it is (it comes up at once, and goes thin at the end). Worked out a
// pixel at a time over the part of it on screen, on a canvas of its own a world pixel to a pixel, and put down over it.
const BEAM_W = 17, VORTEX_R = 15;
const RGB = Object.fromEntries(Object.entries(C).map(([k, h]) => [k, [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]]));
let scratch = null, scratchG = null, buf = null;
export function drawEaBeam(ctx, ox, oy, a, len, wk, t, seed) {
  if (wk <= 0.02) return;
  const W = BEAM_W * wk, R = W * 1.9, VR = VORTEX_R * Math.min(1, wk * 1.4);
  const ux = Math.cos(a), uy = Math.sin(a), ex = ox + ux * len, ey = oy + uy * len;
  // the part of the world on screen (the beam runs on well off it)
  const inv = ctx.getTransform().inverse(), cw = ctx.canvas.width, ch = ctx.canvas.height;
  const c0 = inv.transformPoint({ x: 0, y: 0 }), c1 = inv.transformPoint({ x: cw, y: ch });
  const x0 = Math.max(Math.floor(Math.min(ox, ex) - R - VR), Math.floor(Math.min(c0.x, c1.x)));
  const x1 = Math.min(Math.ceil(Math.max(ox, ex) + R + VR), Math.ceil(Math.max(c0.x, c1.x)));
  const y0 = Math.max(Math.floor(Math.min(oy, ey) - R - VR), Math.floor(Math.min(c0.y, c1.y)));
  const y1 = Math.min(Math.ceil(Math.max(oy, ey) + R + VR), Math.ceil(Math.max(c0.y, c1.y)));
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
  const flow = t * 760, helix = t * 30 + seed, wave = t * 26 + seed;
  for (let j = 0; j < bh; j++) {
    const py = y0 + j + 0.5, ry = py - oy;
    // (the run of this row near the beam's line: |perpendicular| within R - and near the whirl at the sword)
    let ia = 0, ib = bw;
    if (Math.abs(uy) > 1e-3) {
      const xa = ox + (ux * ry - R) / uy, xb = ox + (ux * ry + R) / uy;
      ia = Math.max(0, Math.floor(Math.min(xa, xb) - x0) - 1);
      ib = Math.min(bw, Math.ceil(Math.max(xa, xb) - x0) + 1);
    } else if (Math.abs(ry) > R && Math.abs(ry) > VR) continue;
    if (Math.abs(ry) < VR) { ia = Math.min(ia, Math.max(0, Math.floor(ox - VR - x0))); ib = Math.max(ib, Math.min(bw, Math.ceil(ox + VR - x0))); }
    for (let i = ia; i < ib; i++) {
      const px = x0 + i + 0.5, rx = px - ox, s = rx * ux + ry * uy, q = -rx * uy + ry * ux, o = (j * bw + i) * 4;
      const by = BAYER[((y0 + j) & 3) * 4 + ((x0 + i) & 3)];
      // the whirl at the sword's point: arms of red and black turning
      const rr = Math.hypot(rx, ry);
      if (rr < VR) {
        const arm = ((Math.atan2(ry, rx) * 3 - rr * 0.45 + t * 16) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2), k = rr / VR;
        if (k < 0.22) { put(o, RGB.core); continue; }
        if (arm < 1.3) { put(o, k < 0.5 ? RGB.hot : k < 0.8 ? RGB.red : RGB.dark); continue; }
        if (arm < 2.1 && by > k) { put(o, k < 0.6 ? RGB.deep : RGB.ink); continue; }
      }
      if (s < -1 || s > len) continue;
      // how wide here: narrower right at the sword, a round head, a ripple running along it
      let hw = W * Math.min(1, 0.5 + s / 36) * (1 + 0.13 * Math.sin(s * 0.06 - wave));
      if (s > len - W) hw *= Math.sqrt(Math.max(0, 1 - ((s - (len - W)) / W) ** 2));
      const ad = Math.abs(q) / Math.max(0.5, hw);
      if (ad <= 1) {
        if (ad > 0.82 && by < (ad - 0.82) / 0.18) continue;   // (a ragged edge)
        // the two strands twisting round it - the one in front light, the one behind dark
        const ph = s * 0.11 - helix;
        let strand = null;
        for (let k = 0; k < 2; k++) {
          const off = Math.sin(ph + k * Math.PI) * hw * 0.62;
          if (Math.abs(q - off) < 1.2) { const front = Math.cos(ph + k * Math.PI) > 0; if (front) { strand = RGB.pale; break; } strand = RGB.ink; }
        }
        if (strand && ad > 0.2) { put(o, strand); continue; }
        // the bands, out from the white heart; streaks running down it
        const n = hash(Math.floor((s - flow) / 5), Math.floor(q / 2) + 50);
        let band = ad < 0.16 ? 0 : ad < 0.38 ? 1 : ad < 0.66 ? 2 : 3;
        if (band >= 2 && n < 0.18) band++;
        else if (band >= 1 && n > 0.92) band--;
        put(o, [RGB.core, RGB.hot, RGB.red, RGB.dark, RGB.deep][band]);
      } else if (ad < 1.9) {
        // the wind still turning outside it: thin spirals going down its length
        const v = ((s * 0.07 - t * 20 + (q > 0 ? 0 : Math.PI) + ad * 2.4) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        if (v < 0.32 && by < 1.2 - ad * 0.5) put(o, ad < 1.35 ? RGB.red : RGB.wind);
        else if (v > 3 && v < 3.18 && by < 0.4) put(o, RGB.deep);
      }
    }
  }
  scratchG.putImageData(buf, 0, 0);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, 0, 0, bw, bh, x0, y0, bw, bh);
  ctx.imageSmoothingEnabled = smooth;
  // a red light thrown round it, soft (the lights do the rest)
  for (let s = 0; s < len; s += 90) glowAt(ctx, ox + ux * s, oy + uy * s, 40 * wk, [[0, `rgba(255, 40, 40, ${0.22 * wk})`], [1, 'rgba(255, 0, 0, 0)']]);
}

// The moment it goes: a flash at the point, a ring of red thrown out, k 0..1 through it.
export function drawEaBlast(ctx, x, y, k, t) {
  glowAt(ctx, x, y, 30 + 60 * k, [[0, `rgba(255, 230, 210, ${0.7 * (1 - k)})`], [0.3, `rgba(255, 40, 40, ${0.45 * (1 - k)})`], [1, 'rgba(160, 0, 0, 0)']]);
  lit(ctx, () => {
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = C.hot;
    pixArc(ctx, x, y, 8 + 46 * k, 8 + 46 * k, 0, 0, Math.PI * 2);
    ctx.fillStyle = C.red;
    pixArc(ctx, x, y, 5 + 30 * k, 3 + 12 * k, 0, t * 6, t * 6 + Math.PI * 2);
    ctx.globalAlpha = 1;
  });
}
