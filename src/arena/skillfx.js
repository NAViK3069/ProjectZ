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
// The four laid out round the mouse: where each sits from the middle (world px), and which is where. A drag that way picks it.
export const CARD_SPOT = { red: [0, -27], blue: [27, 0], green: [0, 27], purple: [-27, 0] };
export const CARD_KINDS = ['red', 'blue', 'green', 'purple'];
export const CARD_LEAN = 6, CARD_PICK = 20;   // how far (world px) the mouse leans from the middle to show one, and goes to take it
export const cardToward = (dx, dy) => (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'blue' : 'purple') : dy < 0 ? 'red' : 'green');
// The fan, round (x, y): a ring of light turning, the cards dealt out of the middle one after another and turning face up,
// a dotted line out to each; the one the mouse leans toward lifts out, lit in its colour, its name over it. k: seconds open.
export function drawCardFan(ctx, x, y, k, hover, t, mine) {
  const X = Math.round(x), Y = Math.round(y), open = ease(k / 0.2);
  glowAt(ctx, X, Y, 52 * open, [[0, `rgba(${hover ? CARDS[hover].rgb : '255, 220, 120'}, 0.3)`], [1, 'rgba(0, 0, 0, 0)']]);
  lit(ctx, () => {
    // the rings: an outer one of dashes turning one way, ticks going the other, a bright core
    ctx.fillStyle = '#ffe08a';
    for (let i = 0; i < 8; i++) {
      const a = t * 0.9 + (i * Math.PI) / 4;
      ctx.globalAlpha = 0.55 * open;
      pixArc(ctx, X, Y, 40 * open, 40 * open, 0, a, a + 0.42);
    }
    for (let i = 0; i < 16; i++) {
      const a = -t * 1.6 + (i * Math.PI) / 8, r = 33 * open;
      ctx.globalAlpha = (i % 2 ? 0.4 : 0.8) * open;
      ctx.fillRect(Math.round(X + Math.cos(a) * r), Math.round(Y + Math.sin(a) * r), 1, 1);
    }
    ctx.globalAlpha = open;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(X - 1, Y, 3, 1);
    ctx.fillRect(X, Y - 1, 1, 3);
    ctx.fillStyle = '#ffe08a';
    pixArc(ctx, X, Y, 5 + Math.sin(t * 6), 5 + Math.sin(t * 6), 0, 0, Math.PI * 2);
    // a line of dots out to each card, running outward; the one being leant toward, bright and solid
    for (const [kind, [ox, oy]] of Object.entries(CARD_SPOT)) {
      const on = kind === hover, d = Math.hypot(ox, oy), ux = ox / d, uy = oy / d;
      ctx.fillStyle = CARDS[kind].a;
      for (let q = 7; q < d - 10; q += on ? 1 : 3) {
        ctx.globalAlpha = open * (on ? 0.95 : 0.35 + 0.35 * (((q - t * 30) % 6 + 6) % 6 < 2 ? 1 : 0));
        ctx.fillRect(Math.round(X + ux * q), Math.round(Y + uy * q), 1, 1);
      }
    }
  });
  // the cards, dealt out one after another
  Object.entries(CARD_SPOT).forEach(([kind, [ox, oy]], i) => {
    const deal = ease((k - i * 0.05) / 0.2);
    if (deal <= 0) return;
    const on = kind === hover, lift = on ? 4 : 0, d = Math.hypot(ox, oy);
    const cx = Math.round(X + ox * deal + (ox / d) * lift), cy = Math.round(Y + oy * deal + (oy / d) * lift + (on ? 0 : Math.sin(t * 3 + i) * 1));
    if (on) {
      glowAt(ctx, cx, cy, 26, [[0, `rgba(${CARDS[kind].rgb}, 0.55)`], [1, 'rgba(0, 0, 0, 0)']]);
      lit(ctx, () => {
        ctx.fillStyle = CARDS[kind].a;
        for (let j = 0; j < 4; j++) {
          const a = t * 4 + (j * Math.PI) / 2;
          ctx.fillRect(Math.round(cx + Math.cos(a) * 14), Math.round(cy + Math.sin(a) * 16), 2, 2);
        }
      });
    }
    ctx.save();
    ctx.globalAlpha = hover && !on ? 0.5 : 1;
    ctx.translate(cx, cy);
    ctx.scale(Math.max(0.08, Math.abs(Math.cos((1 - deal) * Math.PI * 0.5))), 1);
    cardFace(ctx, kind, 0, 0);
    if (on) {   // a frame round it, burning
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-8, -11, 16, 1); ctx.fillRect(-8, 10, 16, 1); ctx.fillRect(-8, -11, 1, 22); ctx.fillRect(7, -11, 1, 22);
    }
    ctx.restore();
    if (on) {
      const nm = CARDS[kind].name, ty = oy > 0 ? cy + 13 : cy - 19;
      drawText(ctx, nm, Math.round(cx - textWidth(nm) / 2), ty, 1, CARDS[kind].a, '#08080c');
    }
  });
  if (mine && !hover && k > 0.3) drawText(ctx, 'DRAG TO A CARD', Math.round(X - textWidth('DRAG TO A CARD') / 2), Y + 44, 1, '#ffe08a', '#08080c');
}
// The one picked, flying from the fan up over the head (x1, y1) and turning as it goes, its colour streaming behind it;
// the other three going to pieces where they were. (x, y): the fan's middle; k: 0 .. 1 of the flight.
export function drawCardFly(ctx, x, y, kind, x1, y1, k, t, seed) {
  const [ox, oy] = CARD_SPOT[kind], x0 = x + ox, y0 = y + oy, e = ease(k), c = CARDS[kind];
  const at = (q) => ({ x: x0 + (x1 - x0) * q, y: y0 + (y1 - y0) * q - Math.sin(q * Math.PI) * 18 });
  lit(ctx, () => {
    for (let i = 1; i <= 12; i++) {
      const q = Math.max(0, e - i * 0.035), p = at(q);
      ctx.globalAlpha = (1 - i / 12) * 0.9;
      ctx.fillStyle = i < 3 ? '#ffffff' : c.a;
      ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y), 3 - (i > 6 ? 1 : 0), 2);
    }
    // the rest, coming apart
    for (const [other, [px, py]] of Object.entries(CARD_SPOT)) {
      if (other === kind) continue;
      for (let i = 0; i < 10; i++) {
        const a = hash(i, other.length, seed) * 6.28, d = 2 + e * (8 + hash(i, 2, seed) * 16);
        ctx.globalAlpha = 1 - e;
        ctx.fillStyle = i % 3 ? CARDS[other].a : '#ece6d4';
        ctx.fillRect(Math.round(x + px + Math.cos(a) * d), Math.round(y + py + Math.sin(a) * d + e * e * 8), 2, 1);
      }
    }
  });
  const p = at(e);
  glowAt(ctx, p.x, p.y, 22, [[0, `rgba(${c.rgb}, 0.45)`], [1, 'rgba(0, 0, 0, 0)']]);
  ctx.save();
  ctx.translate(Math.round(p.x), Math.round(p.y));
  ctx.scale(Math.max(0.15, Math.abs(Math.cos(e * Math.PI * 2))), 1);
  cardFace(ctx, kind, 0, 0);
  ctx.restore();
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

// ---------- chidori ----------
// One crack of lightning out of (x, y) along a: a few jagged steps, now and then a fork off it. Two passes - a wide
// blue one under, a thin white one over - so it burns. (Same seed, same shape: it's redrawn many times a second anyway.)
function zap(ctx, x, y, a, len, seed, steps = 5, fork = true) {
  const pts = [[x, y]];
  let px = x, py = y, b = a;
  for (let i = 1; i <= steps; i++) {
    b = a + (hash(seed, i, 1) - 0.5) * 1.4;
    px += Math.cos(b) * (len / steps);
    py += Math.sin(b) * (len / steps);
    pts.push([px, py]);
  }
  for (const [col, ox, oy] of [['#2a62ff', 1, 0], ['#2a62ff', 0, 1], ['#9fe6ff', 0, 0]]) {
    ctx.fillStyle = col;
    for (let i = 1; i < pts.length; i++) pixLine(ctx, pts[i - 1][0] + ox, pts[i - 1][1] + oy, pts[i][0] + ox, pts[i][1] + oy);
  }
  ctx.fillStyle = '#ffffff';
  for (let i = 1; i < Math.min(3, pts.length); i++) pixLine(ctx, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  if (fork) for (let i = 2; i < pts.length - 1; i++) if (hash(seed, i, 3) < 0.35) zap(ctx, pts[i][0], pts[i][1], b + (hash(seed, i, 4) - 0.5) * 2, len * 0.38, seed * 7 + i, 2, false);
}
// Chidori, in the hand at (x, y): a white-hot knot crackling with forks of lightning, flickering chirps of light round it,
// bolts cracking down to the floor (feetY) beside it, and a ribbon of it dragged out behind along `trail` as it runs.
// k: how far it's gathered (0 .. 1); charge: still gathering - streaks of it pulled in from all round.
export function drawChidori(ctx, x, y, k, t, charge, trail, feetY, dash) {
  const X = Math.round(x), Y = Math.round(y), tick = Math.floor(t * 28), flick = 0.8 + 0.2 * hash(tick, 1, 9);
  glowAt(ctx, X, Y, (18 + 30 * k) * flick * (dash ? 1.4 : 1), [[0, `rgba(200, 240, 255, ${0.6 * k})`], [0.35, `rgba(90, 170, 255, ${0.3 * k})`], [1, 'rgba(40, 90, 255, 0)']]);
  lit(ctx, () => {
    // dragged out behind it: a jagged ribbon along where the hand's been
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i], j = (hash(tick, i, 6) - 0.5) * 5, q = 1 - i / trail.length;
      ctx.globalAlpha = q;
      ctx.fillStyle = i < 3 ? '#ffffff' : i % 2 ? '#9fe6ff' : '#4a8aff';
      pixLine(ctx, a.x, a.y, b.x, b.y + j);
      if (i % 3 === 0) { ctx.fillStyle = '#2a62ff'; pixLine(ctx, a.x, a.y + 1, b.x, b.y + 1 - j); }
    }
    ctx.globalAlpha = 1;
    // gathering: streaks pulled in from all round
    if (charge) for (let i = 0; i < 14; i++) {
      const a = hash(i, 2, 9) * 6.28, ph = (t * 2.6 + hash(i, 3, 9)) % 1, d = (1 - ph) * 34 + 3;
      ctx.globalAlpha = ph;
      ctx.fillStyle = i % 3 ? '#9fe6ff' : '#ffffff';
      pixLine(ctx, X + Math.cos(a) * d, Y + Math.sin(a) * d, X + Math.cos(a) * (d + 5), Y + Math.sin(a) * (d + 5));
    }
    ctx.globalAlpha = 1;
    // the forks
    const n = charge ? 3 + Math.round(7 * k) : dash ? 14 : 11;
    for (let i = 0; i < n; i++) {
      const a = hash(tick, i, 3) * 6.28, len = (7 + hash(tick, i, 4) * 17) * k * (dash ? 1.5 : 1);
      ctx.globalAlpha = 0.6 + 0.4 * hash(tick, i, 5);
      zap(ctx, X, Y, a, len, tick * 13 + i, 4, true);
    }
    ctx.globalAlpha = 1;
    // a bolt cracking down to the floor
    if (!charge && feetY - Y < 34 && hash(tick, 7, 7) < 0.45) {
      const fx = X + (hash(tick, 8, 7) - 0.5) * 22;
      zap(ctx, X, Y, Math.atan2(feetY - Y, fx - X), Math.hypot(feetY - Y, fx - X), tick * 5 + 1, 3, false);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(fx) - 2, Math.round(feetY) - 1, 5, 1);
      ctx.fillStyle = '#9fe6ff';
      for (let i = 0; i < 4; i++) ctx.fillRect(Math.round(fx + (hash(tick, i, 8) - 0.5) * 10), Math.round(feetY) - 2 - Math.round(hash(tick, i, 9) * 4), 1, 1);
    }
    // the chirping: points of light winking in and out round it
    for (let i = 0; i < 16; i++) {
      const a = hash(i, tick >> 1, 5) * 6.28, r = (4 + hash(i, tick >> 1, 6) * 13) * k;
      ctx.globalAlpha = hash(i, tick, 7);
      ctx.fillStyle = i % 2 ? '#ffffff' : '#bfefff';
      ctx.fillRect(Math.round(X + Math.cos(a) * r), Math.round(Y + Math.sin(a) * r), 1, 1);
    }
    ctx.globalAlpha = 1;
    // the knot itself
    const r = 2 + 2.5 * k;
    ctx.fillStyle = '#4a8aff';
    pixArc(ctx, X, Y, r + 1, r + 1, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#bfefff';
    pixArc(ctx, X, Y, r, r, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(X - 1, Y - 1, 3, 3);
    ctx.fillRect(X - 2, Y, 5, 1);
    ctx.fillRect(X, Y - 2, 1, 5);
  });
}
// One spike of lightning from (x, y) along a: a long thin blade, len long and w wide at the root, its two edges jagged
// with a notch or two so it's lightning, not glass. Filled pixel by pixel: dark blue at the edges, pale through it,
// white down the spine.
function spike(ctx, x, y, a, len, w, seed, tick) {
  if (len < 2) return;
  const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
  // the outline in its own frame (along, across): root, jagged edge out to the point, back down the other edge
  const j = (i, s) => (hash(seed, i, s + (tick % 3)) - 0.5) * w * 0.7;
  const edge = (sgn) => [[0.0, sgn * w], [0.32, sgn * (w * 0.62 + j(1, sgn))], [0.38, sgn * w * 0.95], [0.66, sgn * (w * 0.32 + j(2, sgn) * 0.5)], [0.71, sgn * w * 0.55]];
  const outline = [...edge(1), [1, 0], ...edge(-1).reverse()].map(([q, o]) => [q * len, o]);
  const inside = (p, o) => {
    let c = false;
    for (let i = 0, k = outline.length - 1; i < outline.length; k = i++) {
      const [pi, oi] = outline[i], [pk, ok] = outline[k];
      if ((oi > o) !== (ok > o) && p < ((pk - pi) * (o - oi)) / (ok - oi) + pi) c = !c;
    }
    return c;
  };
  const R = Math.ceil(len + w + 2);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const p = dx * ux + dy * uy, o = dx * nx + dy * ny;
    if (p < -1 || p > len + 1 || Math.abs(o) > w + 1 || !inside(p, o)) continue;
    const half = Math.abs(o) / Math.max(1, w * (1 - (p / len) * 0.9));
    ctx.fillStyle = Math.abs(o) < 0.8 ? '#ffffff' : half > 0.7 ? '#2a62ff' : half > 0.4 ? '#7ac8ff' : '#d8f4ff';
    ctx.fillRect(Math.round(x) + dx, Math.round(y) + dy, 1, 1);
  }
}
// The moment it goes in, the hand at (x, y) inside them, along a. k: 0 .. 1 of the moment. First a white flash and lines
// of speed bursting out round it; then sharp spikes of lightning bursting out of their back, a few smaller ones back
// out where it went in, sparks streaming off them the way it's going.
export function drawChidoriStab(ctx, x, y, a, k, t, seed) {
  const X = Math.round(x), Y = Math.round(y), tick = Math.floor(t * 30), ux = Math.cos(a), uy = Math.sin(a);
  const hit = Math.max(0, 1 - k / 0.22), grow = ease(Math.min(1, k / 0.16)), fade = k > 0.82 ? (1 - k) / 0.18 : 1;
  glowAt(ctx, X + ux * 24, Y + uy * 24, 34 + hit * 22, [[0, `rgba(170, 225, 255, ${0.28 + hit * 0.3})`], [0.5, `rgba(70, 140, 255, ${0.14 * fade})`], [1, 'rgba(40, 90, 255, 0)']]);
  lit(ctx, () => {
    // the burst of it going in: speed lines all round, a flash
    if (hit > 0) {
      for (let i = 0; i < 28; i++) {
        const b = (i / 28) * 6.28 + hash(i, 1, seed) * 0.2, r0 = 12 + hash(i, 2, seed) * 10 + (1 - hit) * 20, len = 14 + hash(i, 3, seed) * 34;
        ctx.globalAlpha = hit * (i % 3 ? 0.7 : 1);
        ctx.fillStyle = i % 4 ? '#bfefff' : '#ffffff';
        pixLine(ctx, X + Math.cos(b) * r0, Y + Math.sin(b) * r0, X + Math.cos(b) * (r0 + len), Y + Math.sin(b) * (r0 + len));
      }
      ctx.globalAlpha = hit;
      ctx.fillStyle = '#ffffff';
      const r = Math.round(4 + (1 - hit) * 10);
      pixArc(ctx, X, Y, r, r, 0, 0, Math.PI * 2);
      if (hit > 0.6) ctx.fillRect(X - 2, Y - 2, 5, 5);
    }
    // out of their back: a burst of spikes of lightning, sharp as glass - the longest straight on, the rest fanned out
    // round it - each a jagged blade, white down its spine, shivering in length as it crackles
    const L = 40 + 16 * grow;
    ctx.globalAlpha = fade;
    for (let i = 0; i < 7; i++) {
      const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2), b = a + side * (0.34 + hash(i, 1, seed) * 0.12);
      const len = L * grow * (i === 0 ? 1 : 0.72 - Math.abs(side) * 0.13 + hash(i, 2, seed) * 0.12) * (0.9 + 0.1 * hash(tick, i, seed));
      const w = (i === 0 ? 6 : 4.5 - Math.abs(side) * 0.6) * (0.85 + 0.15 * grow);
      spike(ctx, X + ux * 6, Y + uy * 6, b, len, w, seed * 3 + i, tick);   // (from their back, not over their middle)
    }
    // smaller ones the other way, out of where it went in
    for (let i = 0; i < 3; i++) {
      const b = a + Math.PI + (i - 1) * 0.55;
      spike(ctx, X, Y, b, (10 + hash(i, 3, seed) * 6) * grow, 3, seed * 5 + i, tick);
    }
    // sparks streaming off it
    for (let i = 0; i < 16; i++) {
      const ph = (k * 3 + hash(i, 4, seed)) % 1, q = hash(i, 5, seed), d = L * q + ph * 30, side = (hash(i, 6, seed) - 0.5) * 16 * ph;
      ctx.globalAlpha = fade * (1 - ph);
      ctx.fillStyle = i % 3 ? '#9fe6ff' : '#ffffff';
      ctx.fillRect(Math.round(X + ux * d - uy * side), Math.round(Y + uy * d + ux * side + ph * ph * 6), 1, 1);
    }
  });
}
// Someone with it through them: their body lit up and jolting, blue-white, with sparks jumping across it.
// paint: (tint, rgb) -> their own 64 px canvas, feet at (32, 50).
export function drawShocked(ctx, x, y, t, k, paint) {
  // (every other frame: a blue outline of them jolted a pixel aside - the body itself still seen through it)
  const tick = Math.floor(t * 30), X = Math.round(x), Y = Math.round(y), jx = Math.round((hash(tick, 1, 3) - 0.5) * 4);
  if (tick % 2 === 0) {
    const [c] = paint(1, '110, 190, 255');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.42 * (k > 0.82 ? (1 - k) / 0.18 : 1);
    ctx.drawImage(c, X - 32 + jx, Y - 50);
    ctx.restore();
  }
  lit(ctx, () => {
    for (let i = 0; i < 4; i++) {
      const sx = X + (hash(tick, i, 4) - 0.5) * 12, sy = Y - 4 - hash(tick, i, 5) * 22;
      zap(ctx, sx, sy, hash(tick, i, 6) * 6.28, 5 + hash(tick, i, 7) * 7, tick * 3 + i, 2, false);
    }
  });
}
// Driven through someone, at (x, y), along a: a white flash and a ring going out, lightning bursting out the far side of
// them in a fan, a little spat back the way it came, sparks. k: 0 .. 1 of it.
export function drawChidoriHit(ctx, x, y, a, k, seed) {
  const e = ease(k), X = Math.round(x), Y = Math.round(y), tick = Math.floor(k * 18);
  glowAt(ctx, X, Y, 70 * (1 - k) + 10, [[0, `rgba(220, 245, 255, ${0.9 * (1 - k)})`], [0.4, `rgba(90, 170, 255, ${0.45 * (1 - k)})`], [1, 'rgba(40, 90, 255, 0)']]);
  lit(ctx, () => {
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = '#ffffff';
    pixArc(ctx, X, Y, 6 + e * 44, 6 + e * 44, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#7ac8ff';
    pixArc(ctx, X, Y, 4 + e * 30, 3 + e * 18, a, 0, Math.PI * 2);
    for (let i = 0; i < 8; i++) zap(ctx, X, Y, a + (hash(seed, i, 1) - 0.5) * 1.1, (26 + hash(seed, i, 2) * 44) * (0.5 + e * 0.7), seed * 3 + i * 11 + tick, 6, true);
    for (let i = 0; i < 4; i++) zap(ctx, X, Y, a + Math.PI + (hash(seed, i, 3) - 0.5) * 1.6, (10 + hash(seed, i, 4) * 14) * (0.5 + e), seed * 5 + i + tick, 3, false);
    for (let i = 0; i < 18; i++) {
      const b = a + (hash(seed, i, 5) - 0.5) * 2.4, d = 4 + e * (20 + hash(seed, i, 6) * 40);
      ctx.fillStyle = i % 3 ? '#9fe6ff' : '#ffffff';
      ctx.fillRect(Math.round(X + Math.cos(b) * d), Math.round(Y + Math.sin(b) * d + e * e * 10), 2, 1);
    }
    if (k < 0.15) { ctx.globalAlpha = 1 - k / 0.15; ctx.fillStyle = '#ffffff'; ctx.fillRect(X - 9, Y - 9, 19, 19); }
  });
}

// ---------- wraith form ----------
// One bat's wing off the shoulder (sx, sy), going out along d (1 / -1): ribs of bone, the skin between them hanging in scallops.
function wingAt(ctx, sx, sy, d, open, flap, alpha) {
  const ribs = [[33, -1.2], [41, -0.72], [37, -0.24], [26, 0.26]].map(([len, a]) => {
    const l = len * open, b = a + flap;
    return { x: sx + d * Math.cos(b) * l, y: sy + Math.sin(b) * l };
  });
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#14040a';
  for (let i = 0; i < ribs.length - 1; i++) {
    const A = ribs[i], B = ribs[i + 1];
    for (let q = 0; q <= 1; q += 0.1) {
      const sag = 1 - 0.34 * Math.sin(q * Math.PI);
      pixLine(ctx, sx, sy, sx + (A.x + (B.x - A.x) * q - sx) * sag, sy + (A.y + (B.y - A.y) * q - sy) * sag);
    }
  }
  ctx.fillStyle = '#4e0a16';
  for (const r of ribs) pixLine(ctx, sx, sy, r.x, r.y);
  ctx.fillStyle = '#ff2a40';
  for (const r of ribs) {
    ctx.fillRect(Math.round(r.x), Math.round(r.y), 1, 1);
    pixLine(ctx, r.x, r.y, r.x + (sx - r.x) * 0.14, r.y + (sy - r.y) * 0.14);
  }
}
// Wraith form: the body gone to black smoke with a red edge to it, coming apart towards the feet, smoke pouring off it
// and streaming behind, a bat's wings beating off the shoulders, and the eyes. (x, y): the feet; eyeY: the eyes'
// height; paint(tint, rgb): the fighter on its own canvas (feet at 32, 50) washed in that colour.
export function drawWraith(ctx, x, y, eyeY, f, age, left, t, vx, paint) {
  const open = ease(age / 0.22), k = open * Math.min(1, left / 0.2), run = Math.max(-1, Math.min(1, vx / 160)), X = Math.round(x), Y = Math.round(y);
  const tick = Math.floor(t * 24);
  glowAt(ctx, X, Y - 16, 46, [[0, `rgba(230, 20, 50, ${0.34 * k})`], [0.5, `rgba(120, 6, 30, ${0.2 * k})`], [1, 'rgba(60, 0, 20, 0)']]);
  const shade = ['#050204', '#12040a', '#240610', '#3e0914', '#6a0c1c'];
  ctx.save();
  // the smoke behind: billowing up, thrown back the way it's come
  for (let i = 0; i < 54; i++) {
    const ph = (t * (0.7 + hash(i, 1, 4) * 0.8) + hash(i, 2, 4)) % 1, a = hash(i, 3, 4) * 6.28, size = Math.ceil((1 - ph) * 3) + 1;
    const px = X + Math.cos(a) * (4 + hash(i, 4, 4) * 9) - run * ph * 26 + Math.sin(t * 3 + i) * 2, py = Y - 1 - hash(i, 5, 4) * 26 - ph * 16;
    ctx.globalAlpha = k * (1 - ph) * 0.95;
    ctx.fillStyle = shade[i % 5];
    ctx.fillRect(Math.round(px), Math.round(py), size, size);
  }
  // the wings
  const flap = Math.sin(t * 11) * 0.3 * (1 + Math.abs(run) * 0.4), sx = X - f * 1, sy = Y - 21;
  wingAt(ctx, sx, sy, -f, open, flap + run * f * 0.2, k * 0.97);
  wingAt(ctx, sx, sy, f, open * 0.8, flap - 0.25, k * 0.9);
  // the body, row by row: rippling, more and more towards the feet, where it comes apart. First in red, for the edge.
  const rows = (c, ox, alpha) => {
    for (let r = 12; r < 52; r++) {
      const low = Math.max(0, (r - 22) / 28), off = Math.round(Math.sin(r * 0.55 + t * 11) * (0.5 + low * 3)) - Math.round(run * low * 3);
      if (low > 0.55 && hash(r, tick, 6) < (low - 0.55) * 1.9) continue;
      ctx.globalAlpha = k * alpha * (1 - Math.max(0, low - 0.6));
      ctx.drawImage(c, 0, r, 64, 1, X - 32 + off + ox, Y - 50 + r, 64, 1);
    }
  };
  const [red] = paint(0.97, '215, 18, 44');
  rows(red, -1, 0.9);
  rows(red, 1, 0.9);
  const [dark] = paint(0.95, '10, 3, 6');
  rows(dark, 0, 1);
  // smoke over it, drifting across the front
  for (let i = 0; i < 16; i++) {
    const ph = (t * 0.9 + hash(i, 7, 4)) % 1;
    ctx.globalAlpha = k * Math.sin(ph * Math.PI) * 0.8;
    ctx.fillStyle = shade[i % 3];
    ctx.fillRect(Math.round(X + (hash(i, 8, 4) - 0.5) * 18 - run * ph * 8), Math.round(Y - 2 - ph * 18 - hash(i, 9, 4) * 6), 2 + (i % 3), 2);
  }
  ctx.restore();
  lit(ctx, () => {
    // the eyes: burning, with a thread of light off them
    const ey = Math.round(eyeY) + 1;
    ctx.globalAlpha = k;
    for (const e of [2, 7]) {
      const ex = X + f * e;
      ctx.fillStyle = '#ff1a34';
      ctx.fillRect(ex, ey - 1, 2, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ex, ey - 1, 1, 1);
    }
    for (let i = 1; i < 9; i++) {
      ctx.globalAlpha = k * (1 - i / 9);
      ctx.fillStyle = '#ff2a40';
      ctx.fillRect(X + f * 8 - f * i * 2 - Math.round(run * i), ey + Math.round(Math.sin(t * 9 + i) * (i * 0.2)) - Math.round(i * 0.25), 2, 1);
    }
    // embers going up
    for (let i = 0; i < 18; i++) {
      const ph = (t * (0.8 + hash(i, 10, 4)) + hash(i, 11, 4)) % 1;
      ctx.globalAlpha = k * (1 - ph);
      ctx.fillStyle = i % 4 ? '#ff2a40' : '#ffc0c0';
      ctx.fillRect(Math.round(X + (hash(i, 12, 4) - 0.5) * 30 + Math.sin(ph * 9 + i) * 2 - run * ph * 18), Math.round(Y - hash(i, 13, 4) * 8 - ph * 44), 1, 1 + (i % 2));
    }
    // now and then a thread of red lightning through it
    if (hash(tick >> 1, 14, 4) < 0.14) {
      const a = hash(tick >> 1, 15, 4) * 6.28;
      let px = X, py = Y - 16;
      ctx.globalAlpha = k * 0.85;
      ctx.fillStyle = '#ff6a7a';
      for (let i = 1; i <= 4; i++) {
        const b = a + (hash(tick >> 1, i, 16) - 0.5) * 1.1, nx = X + Math.cos(b) * i * 6, ny = Y - 16 + Math.sin(b) * i * 6;
        pixLine(ctx, px, py, nx, ny);
        px = nx;
        py = ny;
      }
    }
    // going in: a ring and a flare
    if (age < 0.3) {
      const e = ease(age / 0.3);
      ctx.globalAlpha = 1 - e;
      ctx.fillStyle = '#ff4a5a';
      pixArc(ctx, X, Y - 16, 8 + e * 40, 8 + e * 40, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      pixArc(ctx, X, Y - 16, 4 + e * 30, 4 + e * 30, 0, 0, Math.PI * 2);
    }
  });
}

// ---------- deflect ----------
export const DEFLECT_R = 26;   // how far out the field stands from the chest: a shot reaching it turns back
// The field: the katana's still at the hip and it's all in the air round the body - light going up off the ground, rings
// of it turning at three angles, a broken shell at its edge, motes drawn in to the heart, a thread of lightning now and
// then. Where a shot's met it, that part of the shell flares and throws out a star. All in pixels. (x, y): the chest.
export function drawDeflectField(ctx, x, y, age, left, t, ripples = []) {
  const grow = ease(age / 0.28), R = DEFLECT_R * grow, fade = Math.min(1, left / 0.15), feet = y + 14;
  if (R < 2) return;
  const breathe = 0.8 + 0.2 * Math.sin(t * 6);
  glowAt(ctx, x, y - 2, R * 1.7, [[0, `rgba(90, 255, 190, ${0.3 * fade * breathe})`], [0.55, `rgba(40, 220, 150, ${0.16 * fade})`], [1, 'rgba(20, 160, 110, 0)']]);
  lit(ctx, () => {
    ctx.globalAlpha = fade;
    // going up off the ground, all round: the tall flames of it
    for (let i = 0; i < 34; i++) {
      const a = hash(i, 1, 2) * 6.28, sp = 0.7 + hash(i, 2, 2) * 0.8, ph = (t * sp + hash(i, 3, 2)) % 1;
      const px = x + Math.cos(a) * (9 + hash(i, 4, 2) * 9) + Math.sin(ph * 8 + i) * 1.2, py = feet - ph * (36 + hash(i, 5, 2) * 16);
      ctx.globalAlpha = fade * (1 - ph) * (Math.sin(a) > 0 ? 1 : 0.45) * grow;
      ctx.fillStyle = ph < 0.25 ? '#ffffff' : ph < 0.6 ? '#7affd0' : '#22b880';
      ctx.fillRect(Math.round(px), Math.round(py), 1, ph < 0.5 ? 3 : 2);
    }
    // the rings: arcs of pixels turning, each with a bright runner
    for (const [tilt, ry, speed, parts, col] of [[0.5, 0.42, 3.4, 3, '#a8ffe0'], [-0.5, 0.42, -2.7, 3, '#5af0b8'], [0, 0.28, 4.3, 4, '#d8fff0']]) {
      for (let i = 0; i < parts; i++) {
        const a0 = t * speed + (i * Math.PI * 2) / parts, len = 1.2;
        ctx.globalAlpha = 0.9 * fade;
        ctx.fillStyle = col;
        pixArc(ctx, x, y, R * 0.92, R * ry, tilt, a0, a0 + len);
        const c0 = Math.cos(tilt), s0 = Math.sin(tilt), ex = Math.cos(a0 + len) * R * 0.92, ey = Math.sin(a0 + len) * R * ry;
        ctx.globalAlpha = fade;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(x + ex * c0 - ey * s0) - 1, Math.round(y + ex * s0 + ey * c0) - 1, 3, 3);
      }
    }
    // the shell at its edge: broken, flickering
    const segs = 22, tick = Math.floor(t * 14);
    ctx.fillStyle = '#3ae8a0';
    for (let i = 0; i < segs; i++) {
      if (hash(i, tick, 7) < 0.45) continue;
      const a = (i / segs) * 6.28 + t * 0.4;
      ctx.globalAlpha = 0.65 * fade;
      pixArc(ctx, x, y, R, R, 0, a, a + 0.2);
    }
    // motes drawn in to the heart
    for (let i = 0; i < 16; i++) {
      const ph = (t * 1.1 + i / 16) % 1, a = (i / 16) * 6.28 - t * 1.4, d = (R + 6) * (1 - ph);
      ctx.globalAlpha = fade * ph;
      ctx.fillStyle = i % 3 ? '#a8ffe0' : '#ffffff';
      ctx.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d), 1, 1);
    }
    // a thread of lightning out to the shell, now and then
    const flick = Math.floor(t * 18);
    if (hash(flick, 9, 1) < 0.5) {
      const a = hash(flick, 2, 1) * 6.28;
      let px = x + Math.cos(a) * 5, py = y + Math.sin(a) * 5;
      ctx.globalAlpha = 0.9 * fade;
      ctx.fillStyle = '#e8fff4';
      for (let i = 1; i <= 4; i++) {
        const d = 5 + (R - 5) * (i / 4), j = a + (hash(flick, i, 3) - 0.5) * 0.9, nx = x + Math.cos(j) * d, ny = y + Math.sin(j) * d;
        pixLine(ctx, px, py, nx, ny);
        px = nx;
        py = ny;
      }
    }
    // where a shot's been turned: that part of the shell flares, a ring and a star going out from it
    for (const r of ripples) {
      const k = Math.max(0, r.t), sx = x + Math.cos(r.a) * R, sy = y + Math.sin(r.a) * R, e = 1 - k;
      ctx.globalAlpha = k;
      ctx.fillStyle = '#ffffff';
      for (const dr of [0, 1, 2]) pixArc(ctx, x, y, R + dr, R + dr, 0, r.a - 0.6 * k - 0.1, r.a + 0.6 * k + 0.1);
      ctx.fillStyle = '#7affd0';
      pixArc(ctx, sx, sy, 2 + e * 12, 2 + e * 12, 0, 0, Math.PI * 2);
      for (let i = 0; i < 8; i++) {
        const b = r.a + (i / 8) * 6.28, d = 2 + e * (i % 2 ? 16 : 10);
        ctx.fillStyle = i % 2 ? '#ffffff' : '#7affd0';
        ctx.fillRect(Math.round(sx + Math.cos(b) * d), Math.round(sy + Math.sin(b) * d), 2, 2);
      }
    }
  });
}
// Which way it all goes - the shots turned back, and the dash: chevrons running out from the field along the aim, and
// (for you and your side: len > 0) dots on along the line as far as the dash reaches, a mark where it would end.
export function drawDeflectAim(ctx, x, y, a, age, t, spark, len) {
  const grow = ease(age / 0.28), ux = Math.cos(a), uy = Math.sin(a), R = DEFLECT_R * grow;
  lit(ctx, () => {
    for (let i = 0; i < 3; i++) {
      const ph = (t * 1.6 + i / 3) % 1, d = R + 4 + ph * 18, size = 5 - i * 0.5, tx = x + ux * d, ty = y + uy * d;
      ctx.globalAlpha = grow * (1 - ph * 0.6);
      ctx.fillStyle = spark > 0 ? '#ffffff' : '#a8ffe0';
      for (const side of [-1, 1]) pixLine(ctx, tx, ty, tx + Math.cos(a + side * 2.45) * size, ty + Math.sin(a + side * 2.45) * size);
    }
    if (len <= R + 24) return;
    for (let d = R + 26; d < len; d += 8) {
      ctx.globalAlpha = grow * 0.75 * (1 - (d / len) * 0.55);
      ctx.fillStyle = '#7affd0';
      ctx.fillRect(Math.round(x + ux * d), Math.round(y + uy * d), 2, 2);
    }
    const ex = Math.round(x + ux * len), ey = Math.round(y + uy * len);
    ctx.globalAlpha = grow * 0.9;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ex - 3, ey, 7, 1);
    ctx.fillRect(ex, ey - 3, 1, 7);
  });
}
// How near the draw is, over the head: a sliver that fills as the stance runs out, dim until Q can call the dash.
export function drawDeflectBar(ctx, x, y, k, ready) {
  const w = 14, l = Math.round(x - w / 2);
  ctx.fillStyle = 'rgba(6, 16, 12, 0.8)';
  ctx.fillRect(l - 1, y - 1, w + 2, 3);
  ctx.fillStyle = k > 0.8 ? '#ffffff' : ready ? '#5af0b8' : '#2a8a68';
  ctx.fillRect(l, y, Math.round(w * k), 1);
}
// The dash: a band of light where it's been, widest at the body, along the line.
export function drawDeflectDash(ctx, trail, a) {
  const nx = -Math.sin(a), ny = Math.cos(a);
  lit(ctx, () => {
    trail.forEach((q, i) => {
      const k = 1 - i / trail.length, wide = Math.ceil(k * 4);
      for (let o = -wide; o <= wide; o++) {
        ctx.globalAlpha = k * (o === 0 ? 1 : 0.75 - Math.abs(o) * 0.14);
        ctx.fillStyle = o === 0 ? '#ffffff' : Math.abs(o) < 2 ? '#a8ffe0' : '#2ac88a';
        ctx.fillRect(Math.round(q.x + nx * o), Math.round(q.y + ny * o), 2, 1);
      }
    });
  });
}
// The cut, left in the air behind it, all along the line: a flash of white that thins to nothing, shards coming off it.
export function drawDeflectCut(ctx, x0, y0, x1, y1, k, seed) {
  const a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0) + 28, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
  const sx = x0 - ux * 14, sy = y0 - uy * 14, thick = Math.max(0, 1 - k * 1.6) * 3;
  lit(ctx, () => {
    for (let i = 0; i <= L; i++) {
      const q = i / L, taper = Math.sin(q * Math.PI), w = Math.ceil(thick * taper), px = sx + ux * i, py = sy + uy * i;
      for (let o = -w; o <= w; o++) {
        ctx.globalAlpha = (1 - k) * (o === 0 ? 1 : 0.7);
        ctx.fillStyle = Math.abs(o) < 2 ? '#ffffff' : '#7affd0';
        ctx.fillRect(Math.round(px + nx * o), Math.round(py + ny * o), 1, 1);
      }
    }
    // shards flying off it, either side
    for (let i = 0; i < 20; i++) {
      const q = hash(i, 1, seed), side = i % 2 ? 1 : -1, d = ease(k) * (6 + hash(i, 2, seed) * 22), px = sx + ux * L * q + nx * side * d, py = sy + uy * L * q + ny * side * d + k * k * 6;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = i % 3 ? '#7affd0' : '#ffffff';
      ctx.fillRect(Math.round(px), Math.round(py), i % 4 ? 1 : 2, 1);
    }
  });
}
