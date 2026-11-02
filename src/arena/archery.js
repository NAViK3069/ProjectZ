// The archery skill's look, all in pixels. Drawing the bow: a circle of runes turning at the feet, light rising off it
// in streaks, motes spiralling in to the arrow's head, a sigil turning where the shot will burst with a line of light up
// to it, a laser out to everyone locked and a mark closing on each. The arrows: comets of green light - a white head, a
// thick tail tapering behind with two threads of sparkle twisting round it. Where they burst and hit: a flash, rings
// going out, a star of rays.

import { pixLine, pixArc, glowAt } from './pixfx.js';

const hash = (a, b, c) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
const G = { white: '#ffffff', pale: '#d8ffd8', light: '#9cff9c', mid: '#5aff7a', deep: '#2ad05a', dark: '#128a3a' };
const lit = (ctx, fn) => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; fn(); ctx.restore(); };

// The bow being drawn, after the lighting. feet: (x, y); h: the bow's grip; tip: the arrow's head; P: where it'll burst;
// locks: [{ v, t }]; k: 0 .. 1 drawn; fade: going, once loosed.
export function drawArcheryCast(ctx, x, y, h, tip, P, locks, k, fade, t, fired) {
  const grow = ease(k * 2.5) * fade;
  glowAt(ctx, h.x, h.y + 4, 30 + 10 * k, [[0, `rgba(150, 255, 170, ${(0.22 + 0.32 * k) * fade})`], [1, 'rgba(60, 255, 110, 0)']]);
  glowAt(ctx, x, y - 2, 30, [[0, `rgba(90, 255, 130, ${0.18 * grow})`], [1, 'rgba(40, 200, 90, 0)']]);
  lit(ctx, () => {
    // the circle at the feet: an outer ring of dashes one way, an inner the other, runes standing on the outer
    ctx.globalAlpha = 0.9 * grow;
    ctx.fillStyle = G.mid;
    for (let i = 0; i < 10; i++) { const a = t * 1.2 + (i * Math.PI) / 5; pixArc(ctx, x, y - 1, 24 * grow, 6 * grow, 0, a, a + 0.42); }
    ctx.fillStyle = G.light;
    for (let i = 0; i < 6; i++) { const a = -t * 2 + (i * Math.PI) / 3; pixArc(ctx, x, y - 1, 15 * grow, 4 * grow, 0, a, a + 0.6); }
    ctx.fillStyle = G.pale;
    for (let i = 0; i < 8; i++) {
      const a = t * 1.2 + (i * Math.PI) / 4, rx = x + Math.cos(a) * 24 * grow, ry = y - 1 + Math.sin(a) * 6 * grow;
      ctx.fillRect(Math.round(rx), Math.round(ry) - 2, 1, 3);
      if (i % 2) ctx.fillRect(Math.round(rx) - 1, Math.round(ry) - 1, 3, 1);
    }
    // light rising off it
    for (let i = 0; i < 18; i++) {
      const a = hash(i, 1, 4) * 6.28, ph = (t * (1 + hash(i, 2, 4)) + hash(i, 3, 4)) % 1, len = 3 + Math.round(hash(i, 5, 4) * 4);
      const sx = x + Math.cos(a) * 22 * grow, sy = y - 1 + Math.sin(a) * 6 * grow - ph * (40 + k * 20);
      ctx.globalAlpha = (1 - ph) * grow * (Math.sin(a) > 0 ? 1 : 0.5);
      ctx.fillStyle = ph < 0.3 ? G.white : ph < 0.6 ? G.light : G.deep;
      ctx.fillRect(Math.round(sx), Math.round(sy), 1, len);
    }
    if (fired) return;
    // motes spiralling in to the arrow's head
    for (let i = 0; i < 14; i++) {
      const ph = (t * 1.8 + i / 14) % 1, a = (i / 14) * 6.28 + t * 6, r = (1 - ph) * (18 + 8 * k);
      ctx.globalAlpha = ph * fade;
      ctx.fillStyle = i % 3 ? G.light : G.white;
      ctx.fillRect(Math.round(tip.x + Math.cos(a) * r), Math.round(tip.y + Math.sin(a) * r * 0.8), 1, 1);
    }
    // the line of light up to where it'll burst, pulses running up it
    for (let yy = tip.y - 3, i = 0; yy > P.y + 6; yy -= 2, i++) {
      const pulse = ((i * 2 + t * 90) % 14) < 2;
      ctx.globalAlpha = (pulse ? 0.95 : 0.3) * fade;
      ctx.fillStyle = pulse ? G.white : G.mid;
      ctx.fillRect(Math.round(P.x), Math.round(yy), 1, 1);
    }
    // the sigil: a ring, a star of eight rays turning, an outer ring of dashes the other way
    const sr = 5 + 6 * k;
    ctx.globalAlpha = fade;
    for (let q = 0; q < 8; q++) {
      const a = t * 2.5 + (q * Math.PI) / 4, len = q % 2 ? sr * 0.6 : sr;
      ctx.fillStyle = q % 2 ? G.mid : G.pale;
      pixLine(ctx, P.x + Math.cos(a) * 2, P.y + Math.sin(a) * 2, P.x + Math.cos(a) * len, P.y + Math.sin(a) * len);
    }
    ctx.fillStyle = G.light;
    pixArc(ctx, P.x, P.y, sr * 0.55, sr * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = G.mid;
    for (let i = 0; i < 6; i++) { const a = -t * 1.6 + (i * Math.PI) / 3; pixArc(ctx, P.x, P.y, sr + 4, sr + 4, 0, a, a + 0.6); }
    ctx.fillStyle = G.white;
    ctx.fillRect(Math.round(P.x) - 1, Math.round(P.y) - 1, 3, 3);
    // the lasers: a line to each one locked, bright pulses running down it; flickering till it's locked
    for (const l of locks) {
      const tx = l.v.x, ty = l.v.y - 14, dx = tx - P.x, dy = ty - P.y, n = Math.max(1, Math.ceil(Math.hypot(dx, dy))), lk = Math.min(1, l.t / 0.35);
      for (let i = 0; i <= n; i++) {
        const pulse = ((i - t * 160) % 18 + 18) % 18 < 4;
        if (!pulse && lk < 1 && (i + Math.floor(t * 40)) % 3 === 0) continue;
        ctx.globalAlpha = (pulse ? 1 : 0.5) * fade;
        ctx.fillStyle = pulse ? G.white : G.mid;
        ctx.fillRect(Math.round(P.x + (dx * i) / n), Math.round(P.y + (dy * i) / n), 1, 1);
      }
    }
  });
}

// The mark on one locked, round (cx, cy): four chevrons turning in and closing, a ring; locked, it holds, pulses, and
// ticks flick out from it.
export function drawArcheryMark(ctx, cx, cy, lk, t, fade) {
  const R = 10 + 9 * (1 - ease(lk)), rot = (1 - lk) * Math.PI * 0.75, on = lk >= 1, p = on ? Math.sin(t * 12) * 0.8 : 0;
  glowAt(ctx, cx, cy, 16, [[0, `rgba(120, 255, 140, ${(on ? 0.25 : 0.12) * fade})`], [1, 'rgba(60, 255, 110, 0)']]);
  lit(ctx, () => {
    ctx.globalAlpha = fade;
    for (let q = 0; q < 4; q++) {
      const a = rot + (q * Math.PI) / 2 + Math.PI / 4, mx = cx + Math.cos(a) * (R + p), my = cy + Math.sin(a) * (R + p);
      ctx.fillStyle = on ? G.pale : G.mid;
      pixLine(ctx, mx, my, mx + Math.cos(a + 2.5) * 4, my + Math.sin(a + 2.5) * 4);
      pixLine(ctx, mx, my, mx + Math.cos(a - 2.5) * 4, my + Math.sin(a - 2.5) * 4);
    }
    ctx.fillStyle = on ? G.light : G.deep;
    pixArc(ctx, cx, cy, R * 0.6, R * 0.6, 0, 0, Math.PI * 2);
    if (on) {
      ctx.fillStyle = G.white;
      ctx.fillRect(Math.round(cx) - 1, Math.round(cy) - 1, 2, 2);
      for (let q = 0; q < 4; q++) {
        const a = (q * Math.PI) / 2, ph = (t * 3) % 1;
        ctx.globalAlpha = fade * (1 - ph);
        ctx.fillRect(Math.round(cx + Math.cos(a) * (R + 3 + ph * 5)), Math.round(cy + Math.sin(a) * (R + 3 + ph * 5)), 1, 1);
      }
    }
  });
}

// An arrow of light. big: the one going up to burst.
export function drawArrow(ctx, o, t) {
  const sp = Math.hypot(o.vx, o.vy) || 1, ux = o.vx / sp, uy = o.vy / sp, nx = -uy, ny = ux, big = o.kind === 'sky', tr = o.trail;
  glowAt(ctx, o.x, o.y, big ? 18 : 11, [[0, `rgba(170, 255, 180, ${big ? 0.6 : 0.45})`], [1, 'rgba(60, 255, 110, 0)']]);
  lit(ctx, () => {
    // the tail: thick at the head, thinning out, white at its start
    for (let i = 1; i < tr.length; i++) {
      const a = tr[i - 1], b = tr[i], q = i / tr.length, w = Math.round((1 - q) * (big ? 2.5 : 1.6));
      for (let o2 = -w; o2 <= w; o2++) {
        ctx.globalAlpha = (1 - q) * (o2 === 0 ? 1 : 0.55);
        ctx.fillStyle = i < 3 && o2 === 0 ? G.white : Math.abs(o2) > 1 ? G.deep : G.light;
        pixLine(ctx, a.x + nx * o2, a.y + ny * o2, b.x + nx * o2, b.y + ny * o2);
      }
      // two threads of sparkle twisting round it
      for (const s of [1, -1]) {
        const off = Math.sin(i * 0.9 + t * 22 * s) * (big ? 4 : 3) * s;
        ctx.globalAlpha = (1 - q) * 0.9;
        ctx.fillStyle = (i + Math.floor(t * 30)) % 3 ? G.pale : G.white;
        ctx.fillRect(Math.round(b.x + nx * off), Math.round(b.y + ny * off), 1, 1);
      }
    }
    // the shaft, the head, the fletching
    ctx.globalAlpha = 1;
    const L = big ? 9 : 7;
    for (let i = 0; i < L; i++) { ctx.fillStyle = i < 2 ? G.white : G.light; ctx.fillRect(Math.round(o.x - ux * i), Math.round(o.y - uy * i), 1, 1); }
    ctx.fillStyle = G.white;
    for (const s of [1, -1]) pixLine(ctx, o.x, o.y, o.x - ux * 3 + nx * 2 * s, o.y - uy * 3 + ny * 2 * s);
    ctx.fillStyle = G.mid;
    for (const s of [1, -1]) pixLine(ctx, o.x - ux * (L - 2), o.y - uy * (L - 2), o.x - ux * (L + 1) + nx * 2 * s, o.y - uy * (L + 1) + ny * 2 * s);
  });
}

// Where one bursts or hits: a flash, two rings going out, a star of rays turning, motes thrown off. k: 0 .. 1.
export function drawArrowRing(ctx, o, k) {
  const s = o.small ? 0.55 : 1, e = ease(k), X = Math.round(o.x), Y = Math.round(o.y);
  glowAt(ctx, X, Y, (40 * (1 - k) + 6) * s, [[0, `rgba(190, 255, 200, ${0.7 * (1 - k)})`], [1, 'rgba(60, 255, 110, 0)']]);
  lit(ctx, () => {
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = k < 0.3 ? G.white : G.mid;
    pixArc(ctx, X, Y, (5 + e * 28) * s, (5 + e * 28) * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = G.light;
    pixArc(ctx, X, Y, (3 + e * 16) * s, (3 + e * 16) * s, 0, 0, Math.PI * 2);
    for (let q = 0; q < 8; q++) {
      const a = (q * Math.PI) / 4 + e * 0.6, r0 = (3 + e * 8) * s, r1 = r0 + (q % 2 ? 6 : 12) * (1 - k * 0.5) * s;
      ctx.fillStyle = q % 2 ? G.mid : G.pale;
      pixLine(ctx, X + Math.cos(a) * r0, Y + Math.sin(a) * r0, X + Math.cos(a) * r1, Y + Math.sin(a) * r1);
    }
    for (let i = 0; i < 12; i++) {
      const a = hash(i, 1, Math.floor(o.x)) * 6.28, d = (4 + e * (14 + hash(i, 2, Math.floor(o.y)) * 18)) * s;
      ctx.fillStyle = i % 3 ? G.light : G.white;
      ctx.fillRect(Math.round(X + Math.cos(a) * d), Math.round(Y + Math.sin(a) * d + e * e * 6), 1, 1);
    }
    if (k < 0.12) { ctx.globalAlpha = 1 - k / 0.12; ctx.fillStyle = G.white; ctx.fillRect(X - 3, Y - 3, 7, 7); }
  });
}
