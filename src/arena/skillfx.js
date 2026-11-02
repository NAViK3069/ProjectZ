// The look of the newer skills: the blue shield and its burst, the buff card over the head and what each card
// does to whoever drew it, the charge carried out of a shadow clone, the hack - its wave, and those it's got.
// Each is drawn after the lighting, so it glows.

import { palette, drawPixels, glowAt, pixArc, pixLine } from './pixfx.js';
import { drawText, textWidth } from '../ui/font.js';

const hash = (a, b, c) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
const span = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
const poly = (g, pts, col) => {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fillStyle = col;
  g.fill();
};
const lit = (ctx, fn) => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; fn(); ctx.restore(); };
const hexAt = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => [cx + Math.cos((i * Math.PI) / 3) * r, cy + Math.sin((i * Math.PI) / 3) * r]);

// ---------- the blue shield ----------
const S = { white: '#ffffff', ice: '#c8f4ff', sky: '#6ad8ff', blue: '#2a8cff', deep: '#1650c8' };
const BLUE = palette(Object.values(S));
// k: how much of it's left (hp) 0 .. 1; hit: 1 as it's struck .. 0; age: seconds up; left: seconds left.
export function drawShieldBubble(ctx, x, y, k, hit, age, left, t) {
  const open = ease(age / 0.2), fade = Math.min(1, left / 0.2), R = 25 * open, pop = 1 + (1 - ease(age / 0.3)) * 0.25;
  if (R < 2) return;
  const low = k < 0.35, flick = low && Math.sin(t * 34) > 0.3 ? 0.55 : 1;
  // the light it throws, and the pool of it on the ground
  glowAt(ctx, x, y, R * 2.1, [[0, 'rgba(50, 130, 255, 0)'], [0.42, `rgba(60, 150, 255, ${(0.2 + hit * 0.3) * fade * flick})`], [0.62, `rgba(90, 190, 255, ${(0.34 + hit * 0.4) * fade * flick})`], [1, 'rgba(30, 90, 255, 0)']]);
  lit(ctx, () => {
    ctx.save();
    ctx.translate(x, y + 14);
    ctx.scale(1, 0.2);
    const g0 = ctx.createRadialGradient(0, 0, 2, 0, 0, R * 1.2);
    g0.addColorStop(0, `rgba(120, 210, 255, ${0.5 * fade})`);
    g0.addColorStop(1, 'rgba(40, 110, 255, 0)');
    ctx.fillStyle = g0;
    ctx.fillRect(-R * 1.2, -R * 1.2, R * 2.4, R * 2.4);
    ctx.restore();
    // the skin of it: thin blue across the middle, thick at the edge, a white sheen over the top left
    const sk = ctx.createRadialGradient(x - R * 0.3, y - R * 0.35, R * 0.1, x, y, R);
    sk.addColorStop(0, `rgba(190, 235, 255, ${0.2 * fade * flick})`);
    sk.addColorStop(0.55, `rgba(50, 130, 255, ${0.1 * fade * flick})`);
    sk.addColorStop(0.92, `rgba(70, 170, 255, ${(0.34 + hit * 0.4) * fade * flick})`);
    sk.addColorStop(1, 'rgba(120, 210, 255, 0)');
    ctx.fillStyle = sk;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fill();
  });
  drawPixels(ctx, x, y, 78, BLUE, (g) => {
    g.scale(pop, pop);
    // the plates: hexagons over the sphere, curving in toward its edge, a wave of light passing through them
    const size = 5.2, wave = (t * 1.1) % 1.4;
    for (let q = -6; q <= 6; q++) for (let r = -6; r <= 6; r++) {
      const px = q * size * 1.5, py = (r + q / 2) * size * 1.73, d = Math.hypot(px, py), n = d / R;
      if (n > 0.97) continue;
      if (hash(q, r, 5) > 0.3 + k * 0.7) continue;   // (worn away, plate by plate)
      const lift = 1 - n * n, bend = 1 / Math.sqrt(Math.max(0.2, lift)) * 0.62, sx = px * Math.min(1.12, bend), sy = py * Math.min(1.12, bend);
      const crest = Math.max(0, 1 - Math.abs(n - wave) * 5) + hit;
      g.globalAlpha = fade * flick * Math.min(1, 0.3 + n * 0.35 + crest * 0.75);
      g.strokeStyle = crest > 0.35 ? S.white : n > 0.6 ? S.ice : S.sky;
      g.lineWidth = crest > 0.35 ? 0.9 : 0.55;
      g.beginPath();
      hexAt(sx, sy, size * (0.74 + lift * 0.14)).forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b)));
      g.closePath();
      g.stroke();
    }
    // the rim: a thick band, a bright line in it, and a white crescent of sheen
    g.globalAlpha = fade * flick;
    g.strokeStyle = S.blue;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, R - 0.5, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = low && Math.sin(t * 34) > 0 ? S.white : S.ice;
    g.lineWidth = 1.1;
    g.beginPath();
    g.arc(0, 0, R - 0.5, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = S.white;
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(0, 0, R - 3.4, -2.6, -1.5);
    g.stroke();
    // three runners going round the rim, each with a tail
    for (let i = 0; i < 3; i++) {
      const a = t * 3 + (i * Math.PI * 2) / 3;
      g.strokeStyle = S.white;
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(0, 0, R + 2, a, a + 0.65);
      g.stroke();
      g.fillStyle = S.white;
      g.fillRect(Math.cos(a + 0.65) * (R + 2) - 1.2, Math.sin(a + 0.65) * (R + 2) - 1.2, 2.4, 2.4);
    }
    // cracks, as it wears down: forked, white, from the rim in
    if (k < 0.75) {
      g.strokeStyle = S.white;
      g.lineWidth = 0.9;
      const n = Math.ceil((0.75 - k) * 11);
      for (let i = 0; i < n; i++) {
        const a = hash(i, 8, 1) * 6.28;
        let cx = Math.cos(a) * R, cy = Math.sin(a) * R;
        g.beginPath();
        g.moveTo(cx, cy);
        for (let j = 0; j < 4; j++) {
          const b = a + Math.PI + (hash(i, j, 2) - 0.5) * 1.4;
          cx += Math.cos(b) * 4.5;
          cy += Math.sin(b) * 4.5;
          g.lineTo(cx, cy);
        }
        g.stroke();
      }
    }
    if (hit > 0) {
      g.globalAlpha = hit;
      g.strokeStyle = S.white;
      g.lineWidth = 3 * hit + 1;
      g.beginPath();
      g.arc(0, 0, R + (1 - hit) * 6, 0, Math.PI * 2);
      g.stroke();
    }
  });
  // sparks of it, rising off the top
  lit(ctx, () => {
    for (let i = 0; i < 8; i++) {
      const ph = (t * 0.9 + i / 8) % 1, a = -1.57 + (hash(i, 3, 1) - 0.5) * 2.6;
      ctx.globalAlpha = Math.sin(ph * Math.PI) * fade;
      ctx.fillStyle = i % 2 ? '#ffffff' : '#7ad8ff';
      ctx.fillRect(Math.round(x + Math.cos(a) * R), Math.round(y + Math.sin(a) * R - ph * 12), 1, 2);
    }
  });
}
// Just after it goes, nothing can touch you for a moment: a shell of bright pixels round you, blinking.
export function drawGuard(ctx, x, y, left, t) {
  if (left < 0.15 && Math.sin(t * 60) < 0) return;
  lit(ctx, () => {
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = i ? 'rgba(255, 255, 255, 0.95)' : 'rgba(120, 215, 255, 0.85)';
      const a = t * (i ? -5 : 7);
      for (let j = 0; j < 6; j++) pixArc(ctx, x, y - 14, 15 + i * 2, 18 + i * 2, 0, a + (j * Math.PI) / 3, a + (j * Math.PI) / 3 + 0.55);
    }
  });
}
// It goes: a flash, a ring going out, the plates flying. k: 0 .. 1.
export function drawShieldBurst(ctx, x, y, k, t, seed, R = 72) {
  const e = ease(k), flash = 1 - span(k, 0, 0.3);
  glowAt(ctx, x, y, R * 1.2, [[0, `rgba(200, 240, 255, ${0.7 * flash})`], [0.5, `rgba(70, 160, 255, ${0.35 * (1 - k)})`], [1, 'rgba(40, 110, 255, 0)']]);
  drawPixels(ctx, x, y, Math.ceil(R * 2.6), BLUE, (g) => {
    g.globalAlpha = 1 - k;
    g.strokeStyle = S.ice;
    g.lineWidth = 3 * (1 - k) + 0.6;
    g.beginPath();
    g.arc(0, 0, 10 + e * (R - 10), 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = S.blue;
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(0, 0, Math.max(1, 4 + e * (R - 26)), 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 16; i++) {
      const a = hash(i, 1, seed) * 6.28, d = 8 + e * (R * 0.5 + hash(i, 2, seed) * R * 0.5), r = (2 + hash(i, 3, seed) * 2.5) * (1 - k * 0.6);
      g.save();
      g.translate(Math.cos(a) * d, Math.sin(a) * d + e * e * 6);
      g.rotate(t * 6 + i);
      poly(g, hexAt(0, 0, r), i % 3 ? S.sky : S.white);
      g.restore();
    }
  });
}

// ---------- the buff cards ----------
export const CARDS = {
  red: { name: 'RAPID FIRE', a: '#ff5a48', b: '#7a1410', rgb: '255, 80, 60' },
  green: { name: 'REGENERATION', a: '#5aff8a', b: '#0e5a2c', rgb: '80, 255, 130' },
  blue: { name: 'SWIFT', a: '#5ac8ff', b: '#103c7a', rgb: '80, 190, 255' },
  purple: { name: 'PHANTOM', a: '#c88aff', b: '#3c1470', rgb: '180, 110, 255' },
};
function cardFace(ctx, kind, x, y) {
  const c = CARDS[kind], r = (cx, cy, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x + cx, y + cy, w, h); };
  r(-7, -10, 14, 20, '#ece6d4');
  r(-6, -9, 12, 18, c.b);
  r(-6, -9, 12, 1, c.a); r(-6, 8, 12, 1, c.a); r(-6, -9, 1, 18, c.a); r(5, -9, 1, 18, c.a);
  if (kind === 'red') { r(-1, -6, 2, 2, '#fff'); r(-2, -4, 4, 2, '#ffd25a'); r(-3, -2, 6, 3, c.a); r(-2, 1, 4, 2, c.a); r(-1, 3, 2, 1, '#fff'); }   // a flame
  else if (kind === 'green') { r(-1, -5, 2, 10, '#fff'); r(-4, -1, 8, 2, '#fff'); r(-1, -5, 1, 10, c.a); r(-4, -1, 8, 1, c.a); }   // a cross
  else if (kind === 'blue') { for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) { r(-4 + i * 4 + j, -4 + j, 2, 1, i ? '#fff' : c.a); r(-4 + i * 4 + j, 3 - j, 2, 1, i ? '#fff' : c.a); } }   // chevrons
  else { r(-4, -1, 8, 2, c.a); r(-3, -3, 6, 1, c.a); r(-3, 2, 6, 1, c.a); r(-1, -1, 2, 2, '#fff'); r(-5, 0, 1, 1, c.a); r(4, 0, 1, 1, c.a); }   // an eye
}
function cardBack(ctx, x, y, t) {
  const r = (cx, cy, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x + cx, y + cy, w, h); };
  r(-7, -10, 14, 20, '#d8b860');
  r(-6, -9, 12, 18, '#1a1430');
  for (let i = -4; i <= 4; i++) for (let j = -7; j <= 7; j++) if ((i + j) % 3 === 0) r(i, j, 1, 1, '#3a2c70');
  for (let i = 0; i < 5; i++) { r(-i, -4 + i, i * 2 + 1, 1, '#d8b860'); r(-i, 4 - i, i * 2 + 1, 1, '#d8b860'); }
  r(-1, -1, 3, 3, Math.sin(t * 8) > 0 ? '#fff' : '#ffe08a');
}
export const CARD_HOLD = 1.3;   // (how long the card's shown full size, with its name, before it shrinks)
// The card over the head, its lowest point at (x, bottom). phase: seconds since it came; flipAt .. flipEnd: it turns over. left: of the buff.
export function drawCard(ctx, x, bottom, kind, phase, flipAt, flipEnd, t, buffK = 1, hold = CARD_HOLD) {
  const rise = ease(phase / 0.25), bob = Math.sin(t * 3) * 1;
  const small = kind && phase > flipEnd + hold ? Math.max(0.45, 1 - (phase - flipEnd - hold) / 0.3 * 0.55) : 1;
  const cy = Math.round(bottom - 3 - 10 * small + (1 - rise) * 8 + bob), cx = Math.round(x);
  const c = kind ? CARDS[kind] : null, turn = span(phase, flipAt, flipEnd), width = Math.abs(Math.cos(turn * Math.PI));
  const shown = kind && turn >= 0.5;
  const burst = shown ? 1 - span(phase, flipEnd, flipEnd + 0.4) : 0;
  glowAt(ctx, cx, cy, (shown ? 22 + burst * 26 : 16) * small, [[0, `rgba(${c && shown ? c.rgb : '220, 190, 110'}, ${0.28 + burst * 0.5})`], [1, 'rgba(0, 0, 0, 0)']]);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(Math.max(0.08, width) * small, small * rise);
  if (shown) cardFace(ctx, kind, 0, 0); else cardBack(ctx, 0, 0, t);
  ctx.restore();
  if (burst > 0) lit(ctx, () => {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * 6.28 + 0.3, d = 8 + (1 - burst) * 22;
      ctx.globalAlpha = burst;
      ctx.fillStyle = i % 2 ? '#fff' : c.a;
      ctx.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), 2, 2);
    }
  });
  if (kind && shown && phase < flipEnd + hold) drawText(ctx, c.name, Math.round(cx - textWidth(c.name) / 2), cy - 18, 1, c.a, '#08080c');
  // what's left of it, a thin bar under the card
  if (kind && shown && phase > flipEnd + 0.5) {
    ctx.fillStyle = '#08080c';
    ctx.fillRect(cx - 8, cy + Math.round(11 * small) + 1, 16, 2);
    ctx.fillStyle = c.a;
    ctx.fillRect(cx - 8, cy + Math.round(11 * small) + 1, Math.round(16 * buffK), 2);
  }
}
// What a card does, on whoever has it (feet at (x, y)).
export function drawCardAura(ctx, x, y, kind, t, seed = 0, vx = 0, face = 1) {
  const c = CARDS[kind];
  if (kind === 'red') {
    glowAt(ctx, x, y - 12, 26, [[0, `rgba(255, 90, 50, ${0.22 + Math.sin(t * 14) * 0.06})`], [1, 'rgba(255, 50, 20, 0)']]);
    lit(ctx, () => {
      // embers and tongues of fire rising off the body
      for (let i = 0; i < 12; i++) {
        const ph = (t * (1 + hash(i, 1, seed)) + hash(i, 2, seed)) % 1, ox = (hash(i, 3, seed) - 0.5) * 16, w = Math.sin(ph * 9 + i) * 2;
        ctx.globalAlpha = (1 - ph) * 0.9;
        ctx.fillStyle = ph < 0.3 ? '#fff0a0' : ph < 0.6 ? '#ffa030' : '#ff4a30';
        ctx.fillRect(Math.round(x + ox + w), Math.round(y - 2 - ph * 34), ph < 0.4 ? 2 : 1, ph < 0.4 ? 2 : 1);
      }
    });
  } else if (kind === 'green') {
    glowAt(ctx, x, y - 12, 26, [[0, `rgba(80, 255, 130, ${0.16 + Math.sin(t * 4) * 0.05})`], [1, 'rgba(40, 255, 100, 0)']]);
    lit(ctx, () => {
      // little crosses rising, a ring of light climbing the body
      for (let i = 0; i < 6; i++) {
        const ph = (t * 0.7 + i / 6) % 1, ox = (hash(i, 3, seed) - 0.5) * 22, px = Math.round(x + ox), py = Math.round(y - 2 - ph * 34);
        ctx.globalAlpha = Math.sin(ph * Math.PI);
        ctx.fillStyle = i % 2 ? '#c8ffd8' : '#5aff8a';
        ctx.fillRect(px - 1, py, 3, 1);
        ctx.fillRect(px, py - 1, 1, 3);
      }
      const ry = y - ((t * 0.9) % 1) * 30;
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#7affa0';
      pixArc(ctx, x, ry, 11, 3, 0, 0, Math.PI * 2);
    });
  } else if (kind === 'blue') {
    // wind going round the body, always the same way at the same pace: bands of streaks, one over another and leaning
    // into the turn, each a bright head and a long tail of pixels - dim behind the body, bright in front - with a
    // turning scatter of light rising through it, and a ring of dust kicked up at the feet.
    const spin = 8.5, cy = y - 15;
    lit(ctx, () => {
      for (const [hy, rx, ry, n, off, lean] of [[-12, 15, 3, 3, 0, 0.1], [-4, 13, 4, 4, 1.1, -0.12], [5, 14, 4, 3, 2.3, 0.14], [13, 10, 3, 2, 3.7, -0.1]]) {
        for (let i = 0; i < n; i++) {
          const head = t * spin + off + (i * Math.PI * 2) / n, py = cy - hy + Math.sin(t * 2.2 + off) * 1.2;
          for (let j = 0; j < 16; j++) {
            const a = head - j * 0.12, front = Math.sin(a) > 0, k = Math.pow(1 - j / 16, 1.4) * (front ? 1 : 0.34);
            const ex = Math.cos(a) * rx, px = Math.round(x + ex), qy = Math.round(py + Math.sin(a) * ry + ex * lean);
            ctx.globalAlpha = k;
            ctx.fillStyle = j < 2 ? '#ffffff' : j < 6 ? '#c8f4ff' : j < 11 ? '#6ad0ff' : '#2a7cff';
            ctx.fillRect(px, qy, 1, j < 5 ? 2 : 1);
          }
        }
      }
      // light rising up through the middle of it, going round
      for (let i = 0; i < 10; i++) {
        const ph = (t * 0.8 + i / 10) % 1, a = t * spin * 0.6 + i * 2.1, r = 7 + Math.sin(ph * Math.PI) * 8;
        ctx.globalAlpha = Math.sin(ph * Math.PI) * (Math.sin(a) > 0 ? 1 : 0.35);
        ctx.fillStyle = i % 3 ? '#8fe0ff' : '#ffffff';
        ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y - 1 - ph * 32 + Math.sin(a) * 2), 1, 1);
      }
      // dust round the feet
      ctx.fillStyle = '#a8e4ff';
      for (let i = 0; i < 12; i++) {
        const a = t * spin * 0.8 + (i / 12) * Math.PI * 2;
        ctx.globalAlpha = (i % 2 ? 0.55 : 0.28) * (Math.sin(a) > 0 ? 1 : 0.4);
        ctx.fillRect(Math.round(x + Math.cos(a) * 12), Math.round(y - 1 + Math.sin(a) * 2), 1, 1);
      }
    });
  } else if (kind === 'purple') {
    lit(ctx, () => {
      for (let i = 0; i < 9; i++) {
        const ph = (t * 0.8 + i / 9) % 1, a = i * 2.4 + t;
        ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.8;
        ctx.fillStyle = i % 2 ? '#e8ccff' : c.a;
        ctx.fillRect(Math.round(x + Math.cos(a) * 12 * (1 - ph)), Math.round(y - 12 + Math.sin(a) * 18 * (1 - ph)), 1, 1);
      }
    });
  }
}

// ---------- the charge out of a shadow clone ----------
// Dark blue fire round the weapon arm, for whoever's next hit will count double.
export function drawPowered(ctx, x, y, t, seed = 0) {
  glowAt(ctx, x, y, 15, [[0, `rgba(120, 140, 255, ${0.42 + Math.sin(t * 16) * 0.12})`], [1, 'rgba(50, 60, 255, 0)']]);
  lit(ctx, () => {
    for (let i = 0; i < 10; i++) {
      const ph = (t * 1.6 + i / 10) % 1, a = i * 2.4 + seed;
      ctx.globalAlpha = (1 - ph) * 0.95;
      ctx.fillStyle = i % 3 ? '#8a9aff' : '#f0f2ff';
      ctx.fillRect(Math.round(x + Math.cos(a) * (3 + ph * 7)), Math.round(y + Math.sin(a) * 3 - ph * 12), 1, ph < 0.4 ? 2 : 1);
    }
  });
}

// ---------- the hack ----------
const H = { white: '#ffffff', mint: '#b8ffd8', green: '#3aff8a', teal: '#10b868', red: '#ff3a55' };
const CODE = palette(Object.values(H));
// While it's being sent: a ring of signal round the hand, code going up.
export function drawHackCast(ctx, x, y, k, t) {
  const r = 6 + 10 * k;
  glowAt(ctx, x, y, 20 + k * 16, [[0, `rgba(60, 255, 140, ${0.2 + k * 0.4})`], [1, 'rgba(20, 200, 90, 0)']]);
  lit(ctx, () => {
    ctx.fillStyle = '#7affb0';
    for (let i = 0; i < 3; i++) {
      const a = t * 7 + i * 2.09;
      pixArc(ctx, x, y, r, r, 0, a, a + 1.2);
    }
    for (let i = 0; i < 12; i++) {
      const ph = (t * 1.5 + i / 12) % 1, a = (i / 12) * 6.28;
      ctx.globalAlpha = (1 - ph) * k;
      ctx.fillStyle = i % 3 ? '#3aff8a' : '#fff';
      ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r - ph * 16), 1, 2);
    }
  });
}
// The wave going out from (x, y): rings of broken signal, code flung along them, and a line of it into each it finds.
export function drawHackWave(ctx, x, y, k, t, seed, R, links = []) {
  const e = ease(k), rr = 8 + e * R;
  glowAt(ctx, x, y, rr * 1.15, [[0, `rgba(60, 255, 140, ${0.32 * (1 - k)})`], [0.7, `rgba(40, 230, 120, ${0.14 * (1 - k)})`], [1, 'rgba(20, 200, 90, 0)']]);
  drawPixels(ctx, x, y, Math.ceil(R * 2.5), CODE, (g) => {
    g.globalAlpha = 1 - k * k;
    g.strokeStyle = H.green;
    g.lineWidth = 2.2 * (1 - k) + 0.6;
    const segs = 18;
    for (let i = 0; i < segs; i++) {
      if (hash(i, Math.floor(t * 18), seed) < 0.28) continue;
      const a = (i / segs) * 6.28;
      g.beginPath();
      g.arc(0, 0, rr, a, a + (6.28 / segs) * 0.78);
      g.stroke();
    }
    g.strokeStyle = H.mint;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, 0, Math.max(1, rr - 9), 0, Math.PI * 2);
    g.stroke();
    // blocks of code flung out on it
    for (let i = 0; i < 34; i++) {
      const a = hash(i, 1, seed) * 6.28, d = rr * (0.45 + hash(i, 2, seed) * 0.6);
      g.fillStyle = i % 4 === 0 ? H.white : H.green;
      g.fillRect(Math.cos(a) * d, Math.sin(a) * d, 1 + (i % 3), 1);
    }
  });
  lit(ctx, () => {
    if (k > 0.75) return;
    ctx.globalAlpha = 1 - k / 0.75;
    for (const l of links) {
      if (!l) continue;
      ctx.fillStyle = '#7affb0';
      let px = x, py = y;
      for (let i = 1; i <= 6; i++) {
        const nx = i === 6 ? l.x : x + ((l.x - x) * i) / 6 + (hash(i, Math.floor(t * 30), seed) - 0.5) * 12, ny = i === 6 ? l.y : y + ((l.y - y) * i) / 6 + (hash(i, Math.floor(t * 30), seed + 1) - 0.5) * 12;
        pixLine(ctx, px, py, nx, ny);
        px = nx;
        py = ny;
      }
    }
  });
}
export const HACKED_H = 25;   // (how much room it wants over the head)
// Someone it's got: x, y: feet; left: seconds; total; top: where over the head its label starts, HACKED_H high.
// Green code running down them, slices of static, a broken lock over the head.
export function drawHacked(ctx, x, y, left, total, t, seed = 0, top = y - 66) {
  const flick = Math.floor(t * 24);
  lit(ctx, () => {
    glowAt(ctx, x, y - 14, 24, [[0, 'rgba(255, 50, 80, 0.12)'], [0.6, 'rgba(50, 255, 130, 0.12)'], [1, 'rgba(20, 200, 90, 0)']]);
    // bars of static across the body
    for (let i = 0; i < 5; i++) {
      if (hash(i, flick, seed) < 0.45) continue;
      const by = y - 2 - hash(i, flick, seed + 1) * 26, w = 8 + hash(i, flick, seed + 2) * 18;
      ctx.fillStyle = i % 2 ? 'rgba(60, 255, 140, 0.55)' : 'rgba(255, 60, 90, 0.5)';
      ctx.fillRect(Math.round(x - w / 2 + (hash(i, flick, seed + 3) - 0.5) * 8), Math.round(by), Math.round(w), 1);
    }
    // the code, coming down
    for (let i = 0; i < 9; i++) {
      const col = x - 12 + i * 3, ph = (t * (1 + hash(i, 1, seed)) + hash(i, 2, seed)) % 1;
      for (let j = 0; j < 3; j++) {
        ctx.globalAlpha = (1 - j / 3) * 0.85;
        ctx.fillStyle = j ? '#3aff8a' : '#d8ffe8';
        ctx.fillRect(Math.round(col), Math.round(y - 32 + ph * 32 - j * 4), 1, 2);
      }
    }
  });
  // the word, the lock under it (shaking), the time left under that
  const lx = Math.round(x + (hash(flick, 1, seed) - 0.5) * 2), ly = Math.round(top) + 13;
  if (flick % 12 < 9) drawText(ctx, 'HACKED', Math.round(x - textWidth('HACKED') / 2), Math.round(top), 1, flick % 4 ? '#3aff8a' : '#ff5a70', '#08120c');
  ctx.fillStyle = '#08120c';
  ctx.fillRect(lx - 5, ly - 1, 11, 9);
  ctx.fillStyle = flick % 8 < 5 ? '#ff3a55' : '#3aff8a';
  ctx.fillRect(lx - 4, ly, 9, 7);
  ctx.fillStyle = '#08120c';
  ctx.fillRect(lx - 1, ly + 2, 3, 3);
  ctx.fillStyle = flick % 8 < 5 ? '#ff8a9a' : '#a8ffc8';
  ctx.fillRect(lx - 3, ly - 4, 1, 4);
  ctx.fillRect(lx + 3, ly - 4, 1, 3);
  ctx.fillRect(lx - 3, ly - 5, 5, 1);
  ctx.fillStyle = '#08120c';
  ctx.fillRect(lx - 9, ly + 9, 19, 2);
  ctx.fillStyle = '#3aff8a';
  ctx.fillRect(lx - 9, ly + 9, Math.round(19 * Math.max(0, left / total)), 2);
}

// ---------- Sandevistan ----------
// (after images, as Edgerunners has them: hard-edged copies of the body strung out behind it, going round the colours)
export const SANDE_HUES = ['70, 255, 160', '60, 235, 255', '90, 140, 255', '255, 90, 210', '255, 150, 70', '255, 235, 90'];
// The world, for as long as it lasts: drained of colour, a sick green over it, split at the edges, dark at the corners,
// a ring going out from whoever set it off. k: 0 .. 1 how far in; age: seconds since it started.
export function drawSandeScreen(ctx, canvas, k, age, t, ox = 0, oy = 0) {
  if (k <= 0) return;
  const W = canvas.width, H = canvas.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  // colour draining out
  ctx.globalCompositeOperation = 'saturation';
  ctx.globalAlpha = 0.78 * k;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, W, H);
  // the colours coming apart at the edges: the picture again, either side, thin and bright
  const split = Math.round(W / 300) + Math.round(Math.sin(t * 19) * 1);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.09 * k;
  ctx.drawImage(canvas, split, 0);
  ctx.drawImage(canvas, -split, 0);
  // the wash
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = k;
  ctx.fillStyle = '#b4ffd2';
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  // dark round the edges
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.72);
  g.addColorStop(0, 'rgba(0, 20, 12, 0)');
  g.addColorStop(1, `rgba(0, 24, 14, ${0.72 * k})`);
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // the ring going out
  if (age < 0.55) {
    const q = age / 0.55, R = ease(q) * Math.max(W, H) * 0.8;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1 - q;
    // (blocks the size of the game's pixels, round the ring)
    const px = Math.max(2, Math.round(W / 260)), n = Math.ceil((R * 6.28) / px);
    ctx.fillStyle = 'rgba(190, 255, 225, 0.85)';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      ctx.fillRect(Math.round((ox + Math.cos(a) * R) / px) * px, Math.round((oy + Math.sin(a) * R) / px) * px, px, px);
    }
    ctx.fillStyle = `rgba(190, 255, 225, ${0.25 * (1 - q)})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// ---------- the vampire's bats ----------
// One bat: dark, red-eyed, red along its wings, beating; a little red going off behind. (x, y): its middle; flying along a.
export function drawBat(ctx, x, y, a, t, seed) {
  const X = Math.round(x), Y = Math.round(y), up = Math.sin(t * 34 + seed * 9) > 0, dir = Math.cos(a) >= 0 ? 1 : -1;
  lit(ctx, () => {
    for (let i = 1; i < 6; i++) {
      ctx.globalAlpha = (1 - i / 6) * 0.6;
      ctx.fillStyle = i < 3 ? '#ff4a5a' : '#8a1020';
      ctx.fillRect(Math.round(x - Math.cos(a) * i * 2), Math.round(y - Math.sin(a) * i * 2), 1, 1);
    }
  });
  const r = (cx, cy, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(X + (dir > 0 ? cx : -cx - w + 1), Y + cy, w, h); };
  const INK = '#12040a', RIM = '#c01a30';
  // the wings, up or down
  if (up) {
    r(-5, -3, 2, 1, INK); r(-6, -4, 1, 1, RIM); r(-3, -2, 2, 2, INK); r(-5, -2, 2, 1, RIM);
    r(2, -2, 2, 2, INK); r(4, -3, 2, 1, INK); r(6, -4, 1, 1, RIM); r(4, -2, 2, 1, RIM);
  } else {
    r(-3, -1, 2, 2, INK); r(-5, 0, 2, 2, INK); r(-6, 2, 1, 1, RIM); r(-4, 2, 2, 1, RIM);
    r(2, -1, 2, 2, INK); r(4, 0, 2, 2, INK); r(6, 2, 1, 1, RIM); r(4, 2, 2, 1, RIM);
  }
  // the body, the ears, the eyes
  r(-1, -2, 3, 4, INK); r(-1, -3, 1, 1, INK); r(1, -3, 1, 1, INK);
  r(0, -1, 2, 1, '#ff5a6a');
}
// A drop of blood on its way back: bright at its head, a bead of a tail curving after it.
export function drawBlood(ctx, x, y, vx, vy, t) {
  const sp = Math.hypot(vx, vy) || 1, ux = vx / sp, uy = vy / sp;
  lit(ctx, () => {
    for (let i = 1; i < 7; i++) {
      ctx.globalAlpha = (1 - i / 7) * 0.85;
      ctx.fillStyle = i < 3 ? '#ff5a6a' : '#b01828';
      ctx.fillRect(Math.round(x - ux * i * 2), Math.round(y - uy * i * 2), 1, 1);
    }
  });
  ctx.fillStyle = '#8a0a1c';
  ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
  ctx.fillStyle = '#ff3a4a';
  ctx.fillRect(Math.round(x), Math.round(y) - 1, 1, 3);
  ctx.fillRect(Math.round(x) - 1, Math.round(y), 3, 1);
  ctx.fillStyle = '#ffd0d4';
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}
// The calling of them: a blood-red moon behind the caster, a ring of pixels drawing in, wings starting up out of it.
export function drawBatCast(ctx, x, y, k, t) {
  const r = 8 + 18 * ease(k);
  glowAt(ctx, x, y, r * 1.8, [[0, `rgba(255, 40, 60, ${0.2 + k * 0.3})`], [1, 'rgba(120, 0, 30, 0)']]);
  lit(ctx, () => {
    ctx.fillStyle = '#d0142c';
    pixArc(ctx, x, y, r, r, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ff6a7a';
    pixArc(ctx, x, y, r - 3, r - 3, 0, t * 3, t * 3 + 2);
    pixArc(ctx, x, y, r - 3, r - 3, 0, t * 3 + 3.14, t * 3 + 5.14);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * 6.28 - t, d = r + 10 * (1 - k);
      ctx.fillStyle = i % 2 ? '#ff4a5a' : '#ffc8cc';
      ctx.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d), 1, 1);
    }
  });
}

// ---------- deflect ----------
const BLADE = palette(['#ffffff', '#d8fff0', '#7affd0', '#30c890', '#1a4a40', '#101418', '#c8d8e0']);
// A katana held out at (x, y), along a: a long pale blade, a dark grip. len: blade length.
export function drawKatana(ctx, x, y, a, len = 20) {
  drawPixels(ctx, x, y, 60, BLADE, (g) => {
    g.rotate(a);
    g.fillStyle = '#101418';
    g.fillRect(-8, -1, 7, 2);
    g.fillStyle = '#7affd0';
    g.fillRect(-1, -2.2, 1.4, 4.4);
    poly(g, [[0, -1.1], [len - 3, -1.1], [len, 0.9], [0, 1.1]], '#c8d8e0');
    poly(g, [[0, -1.1], [len - 3, -1.1], [len - 1, -0.1], [0, -0.1]], '#ffffff');
  });
}
// Guarding: the blade going to and fro so fast it's a fan of light in front, green-white, pixels; f: which way it's facing.
export function drawDeflectGuard(ctx, x, y, face, aim, t, spark) {
  const sw = Math.sin(t * 24) * 1.15, a = aim + sw;
  glowAt(ctx, x + Math.cos(aim) * 8, y + Math.sin(aim) * 8, 26, [[0, `rgba(90, 255, 190, ${0.2 + spark * 0.5})`], [1, 'rgba(30, 200, 130, 0)']]);
  lit(ctx, () => {
    // the arcs it's left
    for (let i = 0; i < 3; i++) {
      const r = 15 + i * 4, s0 = aim - 1.15, s1 = aim + 1.15;
      ctx.globalAlpha = 0.55 - i * 0.14;
      ctx.fillStyle = i ? '#3ae8a0' : '#c8ffe8';
      pixArc(ctx, x, y, r, r, 0, s0, s1);
    }
    ctx.globalAlpha = 1;
    // bright pieces running along them
    for (let i = 0; i < 8; i++) {
      const q = Math.sin(t * 19 + i * 1.3), pa = aim + q * 1.15, r = 13 + (i % 4) * 4;
      ctx.fillStyle = i % 2 ? '#ffffff' : '#7affd0';
      ctx.fillRect(Math.round(x + Math.cos(pa) * r), Math.round(y + Math.sin(pa) * r), 2, 1);
    }
    // a shot turned away just now: a star of pixels
    if (spark > 0) {
      const sx = x + Math.cos(aim) * 16, sy = y + Math.sin(aim) * 16;
      for (let i = 0; i < 12; i++) {
        const b = (i / 12) * 6.28, d = 3 + (1 - spark) * 14;
        ctx.globalAlpha = spark;
        ctx.fillStyle = i % 3 ? '#7affd0' : '#ffffff';
        ctx.fillRect(Math.round(sx + Math.cos(b) * d), Math.round(sy + Math.sin(b) * d), 2, 2);
      }
    }
  });
  drawKatana(ctx, x, y, a, 20);
}
// The dash: the line of the cut left in the air behind, pixels, blade straight out in front.
export function drawDeflectDash(ctx, x, y, a, trail) {
  lit(ctx, () => {
    for (const q of trail) {
      const k = q.k;
      for (const [o, col, al] of [[0, '#ffffff', 0.95], [1, '#7affd0', 0.7], [-1, '#7affd0', 0.7], [2, '#2ac88a', 0.4], [-2, '#2ac88a', 0.4]]) {
        ctx.globalAlpha = k * al;
        ctx.fillStyle = col;
        ctx.fillRect(Math.round(q.x - Math.sin(a) * o), Math.round(q.y + Math.cos(a) * o), 2, 1);
      }
    }
  });
  drawKatana(ctx, x, y, a, 22);
}
