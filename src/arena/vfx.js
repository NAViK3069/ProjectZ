// Skill effects: crisp pixel shapes in a few colours (white-hot first, then the colour), lit up with a soft glow laid
// over them additively, moving every frame - and the big ones not drawn but simulated: an explosion is dozens of
// billows of fire that burst out, swell, rise and cool into smoke, with sparks streaking off and embers drifting
// down. Everything fades smoothly at the end - smoke thinning to nothing, the fire's rim cooling to smoke first.
//
// The kinds (Fx.vfx(kind, x, y, o) sets one off - fx.js; the host passes them on to everyone's screen):
//   blast  - fire and smoke: the flash, a fireball of billows bursting out and rising, sparks and embers, a pall of
//            smoke left drifting up. o: { r, pal, dur, smoke (grey smoke rather than the palette's own dark) }
//   ring   - a shockwave: going out thick and white, thinning, a glow round it, eaten away. o: { r, pal, dur, w, sq }
//   star   - a four-point star flaring and shrinking, a glow round it. o: { r, pal, dur, delay }
//   glitter- a scatter of little stars over a while: round (x, y), r out - or along a line to (o.x1, o.y1), r either
//            side of it. o: { r, n, pal, dur, size, sq, x1, y1 }
//   slash  - a crescent cut: a white leading edge, the colour behind it, sweeping round then thinning away.
//            o: { r, a (its middle), sweep, dir (1 / -1), w, pal, dur, tilt (squash, 0..1) }
//   bolt   - lightning from (x, y) to (o.x1, o.y1): a white core in a coloured sheath, branching, then curling off
//            into fading wisps. o: { x1, y1, pal, dur, fork }
//   spikes - a burst of sharp shards out from the middle (a crystal crack, an impact). o: { r, n, pal, dur, a, spread }
//
// pal: a name from PAL (light to dark) - fire, holy, void, volt, blood, mint, violet, shade, ice, steel, smoke.

export const PAL = {
  fire: ['#ffffff', '#fff3c4', '#ffd25a', '#ff9a3a', '#e8542c', '#a8241c', '#5a0e10'],
  holy: ['#ffffff', '#fff6d0', '#ffe08a', '#ffc23a', '#d88a1a', '#8a5410', '#3a2208'],
  void: ['#ffffff', '#ffd8ff', '#e08aff', '#b04aff', '#7a1ad8', '#3a0a6a', '#16042a'],
  volt: ['#ffffff', '#d8fbff', '#8ff0ff', '#3ac8ff', '#1a7ae8', '#0a3a8a', '#041a40'],
  blood: ['#ffffff', '#ffd0d8', '#ff6a7a', '#e8243a', '#a0101e', '#4a0610', '#200206'],
  mint: ['#ffffff', '#d8ffef', '#7affd0', '#2ae0a0', '#109a6a', '#064a34', '#02200e'],
  violet: ['#ffffff', '#efe0ff', '#d0a8ff', '#a06aff', '#6a3ad8', '#2e1a6a', '#120a2e'],
  shade: ['#ffd8ff', '#ff6a8a', '#ff3a5a', '#9a3aff', '#5a1a9a', '#2a0a4a', '#0a0412'],
  ice: ['#ffffff', '#e0f4ff', '#a8dcff', '#5aa8ff', '#2a62d8', '#14307a', '#081438'],
  steel: ['#ffffff', '#eef4ff', '#c4ccd8', '#8a94a4', '#5a6474', '#363c48', '#181c24'],
  smoke: ['#d8d4cc', '#a8a49c', '#7e7a74', '#5c5954', '#43403d', '#2e2c2a', '#1a1918'],
};
const RGB = {}, TRIPLE = {};
for (const [k, l] of Object.entries(PAL)) {
  RGB[k] = l.map((h) => (255 << 24) | (parseInt(h.slice(5, 7), 16) << 16) | (parseInt(h.slice(3, 5), 16) << 8) | parseInt(h.slice(1, 3), 16));
  TRIPLE[k] = l.map((h) => `${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)}`);
}

const hash = (a, b, c = 0) => { const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return v - Math.floor(v); };
// (the same, quicker, for a pixel at a time: whole numbers in)
const ph = (x, y, s) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul((s * 1000) | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
// a palette colour (as a pixel word) at alpha A (0..255)
const rgba = (col, A) => ((col & 0xffffff) | ((A & 255) << 24)) >>> 0;
const ease = (k) => 1 - Math.pow(1 - clamp(k), 3);

// ---------- the glow: soft light added over the pixels ----------
// (x, y), radius r, a palette's colour i at strength a; sq squashes it up and down; ring: a band round r0 instead of
// a disc.
function glow(ctx, x, y, r, pal, i, a, sq = 1, r0 = -1) {
  if (a <= 0.01 || r < 1) return;
  const col = (TRIPLE[pal] ?? TRIPLE.volt)[i];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(x, y);
  if (sq !== 1) ctx.scale(1, sq);
  let g;
  if (r0 >= 0) {
    g = ctx.createRadialGradient(0, 0, Math.max(0, r0 - r), 0, 0, r0 + r);
    g.addColorStop(0, `rgba(${col}, 0)`);
    g.addColorStop(0.5, `rgba(${col}, ${a})`);
    g.addColorStop(1, `rgba(${col}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(-(r0 + r), -(r0 + r), (r0 + r) * 2, (r0 + r) * 2);
  } else {
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(${col}, ${a})`);
    g.addColorStop(0.35, `rgba(${col}, ${a * 0.45})`);
    g.addColorStop(1, `rgba(${col}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
  }
  ctx.restore();
}

// A scratch canvas W x W, its pixels as 32-bit words to write into.
const bufs = new Map();
function buffer(W) {
  let b = bufs.get(W);
  if (!b) {
    const c = document.createElement('canvas');
    c.width = c.height = W;
    const g = c.getContext('2d');
    const img = g.createImageData(W, W);
    b = { c, g, img, u: new Uint32Array(img.data.buffer), W };
    bufs.set(W, b);
    if (bufs.size > 40) bufs.delete(bufs.keys().next().value);
  }
  b.u.fill(0);
  return b;
}
function put(ctx, b, x, y) {
  b.g.putImageData(b.img, 0, 0);
  ctx.drawImage(b.c, Math.round(x), Math.round(y));
}
// (sizes rounded up, so the scratch canvases get used again)
const size = (r) => Math.ceil(r / 8) * 16 + 16;

// ---------- blast ----------
// A seeded run of random numbers (each blast its own).
function rng(seed) {
  let s = (seed * 1e6) | 0 || 1;
  return () => { s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9 | 0; s ^= s >>> 13; return ((s >>> 0) % 100000) / 100000; };
}
// Where something thrown out at v0 is after t, slowed by drag and pulled by g (both ways): the sum of it worked out.
const at = (v0, g, drag, t) => { const e = 1 - Math.exp(-drag * t); return (v0 / drag) * e + (g / drag) * (t - e / drag); };
function initBlast(e) {
  const R = e.r, D = e.dur, r = rng(e.seed), parts = { fire: [], smoke: [], streak: [], ember: [] };
  // the heart of it: a few big billows, hardly moving, the hottest
  for (let i = 0; i < 4; i++) parts.fire.push({ a: r() * 6.28, sp: R * r() * 0.6, r0: R * (0.3 + 0.12 * r()), grow: 1.5, life: D * (0.3 + 0.1 * r()), delay: 0, drag: 4, up: R * 1.1 });
  // the fireball: billows thrown out every way, mostly up and out, swelling as they go
  const nf = Math.round(14 + R * 0.45);
  for (let i = 0; i < nf; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.9;
    parts.fire.push({ a, sp: R * (1.6 + 3 * r()), r0: R * (0.13 + 0.17 * r()), grow: 1.5 + r(), life: D * (0.2 + 0.24 * r()), delay: r() * 0.05, drag: 3.4, up: R * (0.9 + r()) });
  }
  // the smoke after it: slower, bigger, rising, staying
  const ns = Math.round(9 + R * 0.3);
  for (let i = 0; i < ns; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.4;
    parts.smoke.push({ a, sp: R * (0.8 + 1.8 * r()), r0: R * (0.2 + 0.16 * r()), grow: 2 + r(), life: D * (0.6 + 0.4 * r()), delay: 0.04 + r() * 0.14, drag: 2.2, up: R * (0.7 + 0.6 * r()) });
  }
  // sparks streaking off, falling
  const nk = Math.round(10 + R * 0.45);
  for (let i = 0; i < nk; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.7;
    parts.streak.push({ a, sp: R * (7 + 9 * r()), life: 0.22 + 0.4 * r(), delay: r() * 0.04, drag: 1.4, g: 520 });
  }
  // embers: little glowing bits drifting about and down, a long while
  const ne = Math.round(8 + R * 0.3);
  for (let i = 0; i < ne; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.6;
    parts.ember.push({ a, sp: R * (2 + 3.5 * r()), life: D * (0.5 + 0.5 * r()), delay: r() * 0.1, drag: 2.5, g: 40 + 60 * r(), wob: r() * 6.28 });
  }
  return parts;
}
// a billow's place and size at t (null before it's begun or after it's done)
function billow(p, t) {
  const tl = t - p.delay;
  if (tl < 0 || tl > p.life) return null;
  const q = tl / p.life, vx = Math.cos(p.a) * p.sp, vy = Math.sin(p.a) * p.sp;
  return { x: at(vx, 0, p.drag, tl), y: at(vy * 0.8, -p.up, p.drag, tl), r: p.r0 * (1 + (p.grow - 1) * ease(q * 1.4)), q };
}
function drawBlast(ctx, e, k) {
  const R = e.r, t = e.t, pal = e.pal ?? 'fire', P = RGB[pal] ?? RGB.fire, S = e.smoke ? RGB.smoke : null, seed = e.seed;
  e.parts ??= initBlast(e);
  const parts = e.parts;
  // the light of it: a flash filling the place, then the fireball's glow, fading as it cools
  glow(ctx, e.x, e.y, R * 4, pal, 1, 0.9 * clamp(1 - t / 0.14));
  glow(ctx, e.x, e.y - R * 0.3 * k, R * (1.8 + k), pal, 3, 0.55 * Math.pow(clamp(1 - k * 1.6), 2));
  const W = size(R * 2.9), c = W / 2;
  // (the billows: worked out 30 times a second and kept in between - they're slow; the light, sparks and embers go
  // every frame)
  const frame = Math.floor(t * 30);
  if (e.cv && e.frame === frame) { ctx.drawImage(e.cv, Math.round(e.x - c), Math.round(e.y - c)); return blastBits(ctx, e, t, pal); }
  const b = buffer(W), u = b.u;
  const disc = (bx, by, br, paint) => {
    const r2 = br * br, ya = Math.max(-c, Math.floor(by - br)), yb = Math.min(c - 1, Math.ceil(by + br)), xa = Math.max(-c, Math.floor(bx - br)), xb = Math.min(c - 1, Math.ceil(bx + br)), inv = 1 / br;
    for (let y = ya; y <= yb; y++) {
      const dy = y - by, row = (c + y) * W;
      for (let x = xa; x <= xb; x++) {
        const dx = x - bx, d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const col = paint(Math.sqrt(d2) * inv, -(dx * 0.5 + dy * 0.85) * inv, c + x, c + y);
        if (col && col >>> 24 >= u[row + c + x] >>> 24) u[row + c + x] = col;   // (the stronger of the two: what's in front, mostly)
      }
    }
  };
  // the smoke, behind: dark billows, lit from above, the youngest still lit from under by the fire; eaten away as it thins
  for (const p of parts.smoke) {
    const s = billow(p, t);
    if (!s) continue;
    const fade = Math.pow(1 - s.q, 0.7) * 0.9 * Math.min(1, (t - p.delay) / 0.12);
    disc(s.x, s.y, s.r, (d, lit) => {
      const A = Math.round(255 * fade * (1 - d * d * d * d));
      if (A < 10) return 0;
      const shade = 0.5 + lit * 0.4 - d * 0.2;
      if (S) {
        if (s.q < 0.3 && lit < -0.25) return rgba(P[5], A);   // (the fire's glow on its underside)
        return rgba(S[clamp(Math.round(5 - shade * 4), 1, 6)], A);
      }
      return rgba(P[clamp(Math.round(6 - shade * 3), 3, 6)], A);
    });
  }
  // the fire: hottest at the heart of each billow, cooling as it goes - white, yellow, orange, red, and at the end its
  // own smoke
  for (const p of parts.fire) {
    const s = billow(p, t);
    if (!s) continue;
    const heat = 1 - s.q, A0 = s.q < 0.65 ? 255 : 255 * (1 - (s.q - 0.65) / 0.35);
    disc(s.x, s.y, s.r, (d, lit) => {
      const A = Math.round(A0 * (d > 0.88 ? 0.55 : 1));
      if (A < 10) return 0;
      const l = heat * heat * 0.85 + (1 - d) * 0.35 + lit * 0.15 - 0.12;
      // cooling from the outside in: its rim already smoke, and more of it as it goes
      if (S && (l < 0.2 || d > 0.95 - s.q * 0.55)) return rgba(S[clamp(Math.round(4 - lit * 1.5), 2, 5)], A);
      if (l < 0.12) return rgba(P[5], A);
      return rgba(P[clamp(Math.round((1 - l) * 5), 0, 5)], A);
    });
  }
  b.g.putImageData(b.img, 0, 0);
  if (!e.cv) { e.cv = document.createElement('canvas'); e.cv.width = e.cv.height = W; }
  const g = e.cv.getContext('2d');
  g.clearRect(0, 0, W, W);
  g.drawImage(b.c, 0, 0);
  e.frame = frame;
  ctx.drawImage(e.cv, Math.round(e.x - c), Math.round(e.y - c));
  blastBits(ctx, e, t, pal);
}
function blastBits(ctx, e, t, pal) {
  const parts = e.parts, seed = e.seed;
  // the sparks: streaks along the way they're flying, white at the head
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const Pc = PAL[pal] ?? PAL.fire;
  for (const p of parts.streak) {
    const tl = t - p.delay;
    if (tl < 0 || tl > p.life) continue;
    const vx = Math.cos(p.a) * p.sp, vy = Math.sin(p.a) * p.sp, x = e.x + at(vx, 0, p.drag, tl), y = e.y + at(vy, p.g, p.drag, tl);
    const ex = Math.exp(-p.drag * tl), cvx = vx * ex, cvy = vy * ex + (p.g / p.drag) * (1 - ex), sp = Math.hypot(cvx, cvy) || 1;
    const L = Math.min(14, sp * 0.03), q = tl / p.life;
    for (let i = 0; i <= L; i++) {
      ctx.fillStyle = i < 2 ? Pc[q < 0.5 ? 0 : 1] : i < L * 0.5 ? Pc[2] : Pc[4];
      ctx.fillRect(Math.round(x - (cvx / sp) * i), Math.round(y - (cvy / sp) * i), 1, 1);
    }
  }
  // embers: specks of light, drifting, flickering
  for (const p of parts.ember) {
    const tl = t - p.delay;
    if (tl < 0 || tl > p.life) continue;
    const q = tl / p.life, vx = Math.cos(p.a) * p.sp, vy = Math.sin(p.a) * p.sp;
    const x = e.x + at(vx, 0, p.drag, tl) + Math.sin(tl * 5 + p.wob) * 3, y = e.y + at(vy, p.g, p.drag, tl);
    if (ph(Math.floor(tl * 20), p.wob * 100, seed) < q * 0.8) continue;
    ctx.fillStyle = Pc[q < 0.4 ? 1 : q < 0.7 ? 2 : 3];
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  ctx.restore();
}

// ---------- ring ----------
function drawRing(ctx, e, k) {
  const R = e.r, pal = e.pal ?? 'volt', P = RGB[pal] ?? RGB.volt, N = P.length, seed = e.seed, sq = e.sq ?? 1;
  const r = R * (0.12 + 0.88 * ease(k)), th = Math.max(1, (e.w ?? R * 0.2) * Math.pow(1 - k, 1.4));
  glow(ctx, e.x, e.y, Math.max(3, th * 2.2), pal, 2, 0.5 * Math.pow(1 - k, 1.5), sq, r - th / 2);
  const W = size((R + 4) * Math.max(1, sq)), b = buffer(W), c = W / 2, u = b.u;
  const ex = Math.min(c - 1, Math.ceil(r + th)), ey = Math.min(c - 1, Math.ceil((r + th) * sq)), out2 = (r + 0.5) ** 2, in2 = Math.max(0, r - th) ** 2;
  const A = Math.round(255 * Math.pow(1 - k, 0.75));   // (fading as it goes)
  for (let y = -ey; y <= ey; y++) {
    const py = c + y, yy = y / sq, row = py * W;
    for (let x = -ex; x <= ex; x++) {
      const d2 = x * x + yy * yy;
      if (d2 > out2 || d2 < in2) continue;
      const px = c + x;
      const depth = (r - Math.sqrt(d2)) / th;   // (0 at its outer edge, 1 at its inner)
      const idx = k < 0.1 ? 0 : depth < 0.35 ? Math.round(k * 2) : 1 + Math.round(depth * 1.5 + k * 2.5);
      u[row + px] = rgba(P[clamp(idx, 0, N - 2)], A);
    }
  }
  put(ctx, b, e.x - c, e.y - c);
}

// ---------- star ----------
function drawStar(ctx, e, k) {
  const pal = e.pal ?? 'volt', P = PAL[pal] ?? PAL.volt, x = Math.round(e.x), y = Math.round(e.y);
  const f = Math.sin(Math.PI * clamp(k)), L = Math.round(e.r * f), d = Math.round(e.r * 0.45 * f * (1 - k));
  glow(ctx, x, y, e.r * 1.6, pal, 2, 0.55 * f);
  if (L < 1) { ctx.fillStyle = P[2]; ctx.fillRect(x, y, 1, 1); return; }
  // the long cross: white at the heart, the colour toward its tips
  for (let i = -L; i <= L; i++) {
    const q = Math.abs(i) / L;
    ctx.fillStyle = q < 0.35 ? P[0] : q < 0.7 ? P[1] : P[3];
    ctx.fillRect(x + i, y, 1, 1);
    ctx.fillRect(x, y + i, 1, 1);
  }
  ctx.fillStyle = P[2];
  for (let i = 1; i <= d; i++) for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) ctx.fillRect(x + sx * i, y + sy * i, 1, 1);
  if (L > 3) { ctx.fillStyle = P[0]; ctx.fillRect(x - 1, y - 1, 3, 3); }
  if (L > 6 && k < 0.5) { ctx.fillStyle = P[1]; ctx.fillRect(x - 2, y, 5, 1); ctx.fillRect(x, y - 2, 1, 5); }
}

// ---------- slash ----------
function drawSlash(ctx, e, k) {
  const R = e.r, pal = e.pal ?? 'steel', P = RGB[pal] ?? RGB.steel, N = P.length, seed = e.seed, dir = e.dir ?? 1, sweep = e.sweep ?? 2.2, w = e.w ?? R * 0.4, tilt = e.tilt ?? 1;
  const head = ease(k / 0.35), tail = clamp((k - 0.2) / 0.8) ** 1.3;   // (0..1 along the arc: where it's got to, where it's gone from)
  if (head <= tail) return;
  const mid = (e.a ?? 0) - (dir * sweep) / 2 + dir * sweep * (head + tail) / 2;   // (the glow follows the stroke)
  glow(ctx, e.x + Math.cos(mid) * R * 0.75, e.y + Math.sin(mid) * R * 0.75 * tilt, R * 0.9, pal, 2, 0.45 * (1 - k));
  const W = size(R + w), b = buffer(W), c = W / 2, u = b.u, a0 = (e.a ?? 0) - (dir * sweep) / 2;
  const ex = Math.min(c - 1, Math.ceil(R + 2)), out2 = (R + 1) * (R + 1), in2 = Math.max(0, R - w - 1) ** 2;
  const A = Math.round(255 * (k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55));   // (fading as it thins)
  for (let y = -ex; y <= ex; y++) {
    const py = c + y;
    for (let x = -ex; x <= ex; x++) {
      const px = c + x, gx = x, gy = y / tilt;   // (the squash undone)
      const d2 = gx * gx + gy * gy;
      if (d2 > out2 || d2 < in2) continue;
      const d = Math.sqrt(d2);
      let rel = (Math.atan2(gy, gx) - a0) * dir;
      rel = ((rel % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const s = rel / sweep;   // (0..1 along it)
      if (s > 1 || s < tail || s > head) continue;
      const span = (s - tail) / (head - tail), thick = w * Math.sin(Math.PI * clamp(span)) ** 0.8 * (1 - tail * 0.6);
      const depth = (R - d) / Math.max(1, thick);
      if (depth < 0 || depth > 1) continue;
      const idx = depth < 0.45 ? 0 : depth < 0.68 ? 1 : depth < 0.86 ? 2 : 3;
      u[py * W + px] = rgba(P[clamp(idx + Math.round(k * 2.2), 0, N - 2)], A);
    }
  }
  put(ctx, b, e.x - c, e.y - c);
}

// ---------- bolt ----------
function boltPoints(x0, y0, x1, y1, seed, tick, rough) {
  let pts = [[x0, y0], [x1, y1]];
  const L = Math.hypot(x1 - x0, y1 - y0);
  for (let lvl = 0, amp = L * 0.22 * rough; lvl < 4; lvl++, amp *= 0.5) {
    const nx = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, o = (hash(i + lvl * 31, seed, tick) - 0.5) * 2 * amp;
      nx.push(pts[i], [(ax + bx) / 2 - (dy / l) * o, (ay + by) / 2 + (dx / l) * o]);
    }
    nx.push(pts[pts.length - 1]);
    pts = nx;
  }
  return pts;
}
function strokePts(ctx, pts, col, wide, keep = () => true) {
  ctx.fillStyle = col;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
    for (let j = 0; j <= n; j++) {
      const x = Math.round(ax + ((bx - ax) * j) / n), y = Math.round(ay + ((by - ay) * j) / n);
      if (!keep(x, y, i)) continue;
      if (wide) ctx.fillRect(x - 1, y - 1, 3, 3); else ctx.fillRect(x, y, 1, 1);
    }
  }
}
function drawBolt(ctx, e, k) {
  const pal = e.pal ?? 'volt', P = PAL[pal] ?? PAL.volt, tick = Math.floor(e.t / 0.045), seed = e.seed;
  glow(ctx, (e.x + e.x1) / 2, (e.y + e.y1) / 2, Math.hypot(e.x1 - e.x, e.y1 - e.y) * 0.7 + 8, pal, 3, 0.4 * (1 - k));
  const pts = boltPoints(e.x, e.y, e.x1, e.y1, seed, k < 0.45 ? tick : 0, k < 0.45 ? 1 : 1.6);

  if (k < 0.45) {
    strokePts(ctx, pts, P[3], true);
    strokePts(ctx, pts, k < 0.2 ? P[0] : P[1], false);
    // a fork or two off it
    for (let f = 0; f < (e.fork ?? 2); f++) {
      const i = 2 + Math.floor(hash(f, seed, tick) * (pts.length - 4)), [sx, sy] = pts[i], a = Math.atan2(e.y1 - e.y, e.x1 - e.x) + (hash(f, seed, 9) - 0.5) * 2.2;
      const L = Math.hypot(e.x1 - e.x, e.y1 - e.y) * (0.2 + 0.25 * hash(f, seed, 3));
      const br = boltPoints(sx, sy, sx + Math.cos(a) * L, sy + Math.sin(a) * L, seed + f * 7, tick, 1);
      strokePts(ctx, br, P[3], false);
    }
  } else {
    // (left curling there, dying away)
    ctx.save();
    ctx.globalAlpha = 1 - (k - 0.45) / 0.55;
    strokePts(ctx, pts, k < 0.7 ? P[3] : P[4], false);
    ctx.restore();
  }
  if (k < 0.25) { ctx.fillStyle = P[0]; ctx.fillRect(Math.round(e.x1) - 2, Math.round(e.y1) - 2, 5, 5); }
}

// ---------- spikes ----------
function drawSpikes(ctx, e, k) {
  const pal = e.pal ?? 'ice', P = PAL[pal] ?? PAL.ice, n = e.n ?? 8, R = e.r, seed = e.seed, spread = e.spread ?? Math.PI * 2, a0 = (e.a ?? 0) - spread / 2;
  const out = ease(k / 0.3), fade = clamp((k - 0.35) / 0.65);
  glow(ctx, e.x, e.y, R * 0.9, pal, 2, 0.5 * (1 - k));
  ctx.save();
  ctx.globalAlpha = 1 - fade;
  for (let i = 0; i < n; i++) {
    const a = a0 + (spread * (i + hash(i, seed) * 0.6)) / n, L = R * (0.55 + 0.45 * hash(i, seed, 1)) * out, base = Math.max(1, Math.round((2 + hash(i, seed, 2) * 2) * (1 - fade)));
    const ux = Math.cos(a), uy = Math.sin(a);
    for (let s = R * 0.15 * out; s < L; s++) {
      const q = s / L, half = Math.round(base * (1 - q));
      for (let j = -half; j <= half; j++) {
        const x = Math.round(e.x + ux * s - uy * j), y = Math.round(e.y + uy * s + ux * j);
        ctx.fillStyle = Math.abs(j) === half && half > 0 ? P[4] : q > 0.75 ? P[0] : j < 0 ? P[1] : P[2];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  ctx.restore();
}

const DRAW = { blast: drawBlast, ring: drawRing, star: drawStar, slash: drawSlash, bolt: drawBolt, spikes: drawSpikes };
const DUR = { blast: 1.3, ring: 0.45, star: 0.35, slash: 0.32, bolt: 0.4, spikes: 0.45 };

// The live ones: a list of { kind, x, y, t, dur, ...o }.
export class VfxList {
  constructor() { this.list = []; }
  add(kind, x, y, o = {}) {
    if (kind === 'glitter') {
      // (a scatter of stars: each its own, coming in over the time - round the point, or along a line)
      const n = o.n ?? 8, r = o.r ?? 30, seed = Math.random() * 100, line = o.x1 !== undefined;
      for (let i = 0; i < n; i++) {
        let sx, sy;
        if (line) {
          const s = hash(i, seed), side = (hash(i, seed, 1) - 0.5) * 2 * r, dx = o.x1 - x, dy = o.y1 - y, L = Math.hypot(dx, dy) || 1;
          sx = x + dx * s - (dy / L) * side;
          sy = y + dy * s + (dx / L) * side;
        } else {
          const a = hash(i, seed) * Math.PI * 2, d = r * Math.sqrt(hash(i, seed, 1));
          sx = x + Math.cos(a) * d;
          sy = y + Math.sin(a) * d * (o.sq ?? 1);
        }
        this.add('star', sx, sy, { pal: o.pal, r: (o.size ?? 5) * (0.5 + hash(i, seed, 2)), dur: (o.life ?? 0.35) * (0.7 + 0.6 * hash(i, seed, 3)), delay: (o.dur ?? 0.4) * hash(i, seed, 4) * (line ? 0.6 : 1), vy: o.rise ?? -12 });
      }
      return;
    }
    if (!DRAW[kind]) return;
    this.list.push({ kind, x, y, seed: Math.random() * 100, ...o, t: -(o.delay ?? 0), dur: o.dur ?? DUR[kind] });
    if (this.list.length > 220) this.list.splice(0, this.list.length - 220);
  }
  update(dt) {
    for (const e of this.list) { e.t += dt; if (e.vy && e.t > 0) e.y += e.vy * dt; if (e.vx && e.t > 0) e.x += e.vx * dt; }
    this.list = this.list.filter((e) => e.t < e.dur);
  }
  draw(ctx) {
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    for (const e of this.list) if (e.t >= 0) DRAW[e.kind](ctx, e, e.t / e.dur);
    ctx.imageSmoothingEnabled = smooth;
  }
}
