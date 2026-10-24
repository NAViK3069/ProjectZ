// SPEC weapons: the fantasy kit. They sit in the gun slots (2 / 3) like guns,
// but each does its own thing. They all run on charge (`ammo`, 0..100 %), and
// batteries are what charges them: R plays the weapon's own recharge (new
// blades + gas, an overcharge, a ritual, a channel) and spends one battery.
//
//   ODM GEAR      fire a grapple, zip to where it bites, and spin-slash
//                 everything you fly past (Attack on Titan / Fanny)
//   TESLA LANCE   hold for a lightning beam that arcs on to the zombies around
//                 the one it hits
//   NECRONOMICON  open the book on a spot: a summoning circle raises a zombie
//                 spirit that hunts the living dead for you
//   DRAGONBLADE   dash straight through everything in a line, then cut
//   CRIMSON RAY   hold for a thick red beam that burns through everything in line
//
// The weapon objects keep their own state and art; anything left lying in the
// world (cables, bolts, circles, spirits, slash marks) lives in SpecWorld,
// which main.js updates and draws (mostly after the lighting, since it glows).

import { makeCanvas, spriteFromRows } from '../engine/pixel.js';

const rand = (a, b) => a + Math.random() * (b - a);
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const DRAW_TIME = 0.3;

// ---------- art helpers ----------

// A char grid to draw a sprite into with rects and lines, then outline: every
// empty cell touching a filled one becomes 'k' (the dark pixel-art outline).
function grid(W, H) {
  const g = Array.from({ length: H }, () => Array(W).fill('.'));
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = c; };
  return {
    set,
    rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c); },
    rows(outline = true) {
      if (outline) {
        const filled = (x, y) => x >= 0 && y >= 0 && x < W && y < H && g[y][x] !== '.' && g[y][x] !== 'k';
        const add = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if (g[y][x] === '.' && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) add.push([x, y]);
        }
        for (const [x, y] of add) g[y][x] = 'k';
      }
      return g.map((r) => r.join(''));
    },
  };
}

// Only the pixels of the given chars (for the glowing layer of a sprite).
const only = (rows, chars) => rows.map((r) => [...r].map((c) => (chars.includes(c) ? c : '.')).join(''));

// A copy of an image flattened to one colour (afterimages, ghosts).
export function tint(img, color, keep = 0) {
  const [c, g] = makeCanvas(img.width, img.height);
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = 1 - keep;
  g.fillStyle = color;
  g.fillRect(0, 0, img.width, img.height);
  return c;
}

// A 1px pixel line.
function line(ctx, x0, y0, x1, y1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 2000; n++) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// Draw a polyline as a bolt: a wide soft glow, a coloured body and a white core.
function bolt(ctx, pts, glow, body, core, width = 1) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = glow;
  for (let i = 1; i < pts.length; i++) {
    for (let o = -2; o <= 2; o++) {
      if (!o) continue;
      line(ctx, pts[i - 1].x + (Math.abs(o) === 2 ? 0 : o), pts[i - 1].y + (Math.abs(o) === 2 ? o / 2 : 0), pts[i].x + (Math.abs(o) === 2 ? 0 : o), pts[i].y + (Math.abs(o) === 2 ? o / 2 : 0));
    }
  }
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = body;
  if (width > 1) for (let i = 1; i < pts.length; i++) line(ctx, pts[i - 1].x, pts[i - 1].y + 1, pts[i].x, pts[i].y + 1);
  ctx.restore();
  ctx.fillStyle = core;
  for (let i = 1; i < pts.length; i++) line(ctx, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
}

// A jagged lightning path from a to b: midpoint displacement, regenerated often.
function jag(a, b, rough = 0.22, depth = 4) {
  let pts = [a, b];
  for (let d = 0; d < depth; d++) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i], len = Math.hypot(q.x - p.x, q.y - p.y);
      const nx = -(q.y - p.y) / (len || 1), ny = (q.x - p.x) / (len || 1), off = rand(-1, 1) * len * rough;
      next.push({ x: (p.x + q.x) / 2 + nx * off, y: (p.y + q.y) / 2 + ny * off }, q);
    }
    pts = next;
  }
  return pts;
}

// A soft round light blob ('lighter'), for bloom around glowing things.
function bloom(ctx, x, y, r, rgb, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb}, ${a})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

// The spin slash: a thick crescent of light that sweeps more than a full turn
// round you - several strands thinning off behind its head, sparkles flying
// off the head, and broken dashes left round the ring that hang and fade.
// Squashed into an ellipse for the top-down view. f: { t, life, dir }.
const SPIN_START = -Math.PI * 0.75, SPIN_TURN = Math.PI * 2.2, SQ = 0.62;
const hash = (n) => (((Math.sin(n * 127.1) * 43758.5453) % 1) + 1) % 1;
const easeOut = (x) => 1 - (1 - x) * (1 - x);
const spinProgress = (f) => easeOut(Math.min(1, clamp01(f.t / f.life) / 0.8));
// Which way the head of the slash points now (on screen), for the blades to follow.
export function spinHead(f) {
  const a = SPIN_START + f.dir * SPIN_TURN * spinProgress(f);
  return Math.atan2(Math.sin(a) * SQ, Math.cos(a));
}
function spinSlash(ctx, cx, cy, R, f) {
  const k = clamp01(f.t / f.life), dir = f.dir, prog = spinProgress(f);
  const head = SPIN_START + dir * SPIN_TURN * prog, fade = clamp01((k - 0.7) / 0.3);
  const dot = (a, r, col) => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * SQ), 1, 1);
  };
  // the dashes left behind round the ring
  for (let j = 0; j < 16; j++) {
    const at = (j + 0.5) / 16;
    if (prog < at + 0.05 || k > 0.8 + (j % 4) * 0.05) continue;
    const a0 = SPIN_START + dir * SPIN_TURN * at, r = R + ((j * 5) % 7) - 4, L = 2 + (j % 3);
    for (let q = 0; q <= L; q++) dot(a0 + dir * q * (1.2 / R), r, q === L ? '#c9f0fd' : '#4cc3ec');
  }
  if (fade >= 1) return;
  // the crescent: strands off a thick white-blue head
  const L = 2.2 * (1 - fade * 0.7) * Math.min(1, prog * 6), TH = Math.max(2, Math.round(8 * (1 - fade * 0.6)));
  const N = Math.max(8, Math.round(L * R));
  for (let i = 0; i <= N; i++) {
    const u = i / N, a = head - dir * u * L, th = Math.max(1, Math.round(TH * Math.pow(1 - u, 1.1)));
    for (let sI = 0; sI < th; sI++) {
      if (u > 0.22 && (sI + i) % 3 === 0) continue;   // it splits into strands behind the head
      const col = sI === 0 && u < 0.55 ? '#ffffff' : sI < th * 0.45 ? '#c9f0fd' : sI < th * 0.8 ? '#8fdaf6' : '#3fb0e6';
      dot(a, R - sI, col);
    }
  }
  // sparkles thrown off ahead of the head
  if (k < 0.78) {
    const seed = Math.floor(f.t * 30);
    for (let i = 0; i < 8; i++) {
      const a = head + dir * (0.04 + hash(seed * 13 + i) * 0.4), r = R - 3 + (hash(seed * 7 + i * 3) - 0.5) * 10;
      dot(a, r, i % 3 ? '#e9fbff' : '#8fdaf6');
    }
  }
}

// Where a line on screen (from (ox, oy) along (dx, dy)) meets a zombie's body
// as drawn - its legs, middle or head, not its feet - as { along, off }.
function across(z, ox, oy, dx, dy) {
  const lift = z.lift ?? 0;
  let best = null;
  for (const h of [4, 10, 16]) {
    const ex = z.x - ox, ey = z.y - lift - h - oy;
    const along = ex * dx + ey * dy, off = Math.abs(ey * dx - ex * dy);
    if (!best || off < best.off) best = { along, off };
  }
  return best;
}

// ---------- the weapons ----------

const ODM_PAL = {
  k: '#121519', g: '#2a2f36', G: '#434b55', m: '#8a96a3', M: '#b3bec9', s: '#5a6571', w: '#f4f8fb', l: '#cfd9e2',
  r: '#a8382e', R: '#d4553f', b: '#b58a3a', B: '#e0b25a', t: '#55616a', T: '#7f8c95', c: '#3b3226',
};
// The ODM handle: a steel grip with a brass end cap (where the cable comes
// out), a red trigger lever in front of the fingers and a clamp that holds the
// blade - a long flat blade of snap-off segments with an angled tip.
function odmRows(blade = true, handle = true) {
  const a = grid(29, 8);
  if (handle) {
    a.rect(0, 2, 8, 3, 'g'); a.rect(1, 2, 6, 1, 'G');
    a.rect(0, 2, 1, 3, 'b'); a.set(0, 2, 'B');
    a.set(2, 4, 's'); a.set(4, 4, 's');
    a.rect(5, 5, 2, 1, 'r'); a.set(6, 6, 'R');                  // trigger lever
    a.rect(7, 1, 2, 5, 'm'); a.set(7, 1, 'M'); a.set(8, 5, 's'); // blade clamp
  }
  if (blade) {
    a.rect(9, 2, 18, 1, 's');                                    // spine
    a.rect(9, 3, 18, 1, 'l');                                    // flat
    a.rect(9, 4, 17, 1, 'w');                                    // edge
    for (let x = 13; x < 25; x += 4) { a.set(x, 3, 'm'); a.set(x + 1, 4, 'M'); }   // snap-off lines
    a.set(27, 2, 's'); a.set(27, 3, 'l'); a.set(28, 2, 'l');     // angled tip
  }
  return a.rows();
}
function odmArt() {
  const rows = odmRows();
  // the gear worn on the body: two gas tanks across the back of the hips, the
  // reel box at the small of the back, and a blade box on each thigh
  const tank = grid(11, 4);
  tank.rect(0, 0, 9, 3, 'm'); tank.rect(1, 0, 7, 1, 'M'); tank.rect(0, 2, 9, 1, 's');
  tank.rect(3, 0, 1, 3, 'g'); tank.set(9, 1, 'b'); tank.set(10, 1, 'B');
  const reel = grid(7, 7);
  reel.rect(0, 0, 6, 6, 'g'); reel.rect(1, 0, 4, 1, 'G'); reel.rect(2, 2, 2, 2, 'm'); reel.set(2, 2, 'M'); reel.set(5, 4, 'r');
  const box = grid(13, 5);
  box.rect(0, 0, 12, 4, 't'); box.rect(0, 0, 12, 1, 'T'); box.rect(11, 0, 1, 4, 'g');
  box.rect(3, 0, 1, 4, 'c'); box.rect(8, 0, 1, 4, 'c'); box.set(1, 2, 'M'); box.set(10, 2, 'M');
  return {
    img: spriteFromRows(rows, ODM_PAL),
    handle: spriteFromRows(odmRows(false), ODM_PAL),
    blade: spriteFromRows(odmRows(true, false).map((r) => r.slice(8)), ODM_PAL),
    glow: null,   // plain steel: nothing on it glows
    tank: spriteFromRows(tank.rows(), ODM_PAL),
    reel: spriteFromRows(reel.rows(), ODM_PAL),
    box: spriteFromRows(box.rows(), ODM_PAL),
    points: { grip: { x: 3, y: 3 }, muzzle: { x: 28, y: 2 }, port: { x: 6, y: 2 }, light: { x: 8, y: 3 } },
  };
}

const TESLA_PAL = {
  k: '#0d1117', a: '#2a3340', A: '#46546a', m: '#8b97a6', w: '#f4fbff', g: '#1d2229', c: '#b0642a', o: '#e59a52',
  t: '#2d5b7a', C: '#7fe8ff', h: '#1a1f24', y: '#f2c94c', r: '#c23b2e',
};
function teslaArt() {
  // a stubby rifle: steel body, a glass tube with a live core wrapped in three
  // copper coils, a battery pack slung under it, and a fork of prongs at the front
  const a = grid(30, 12);
  a.rect(0, 4, 9, 4, 'a'); a.rect(0, 4, 9, 1, 'A'); a.set(0, 7, 'g');                   // stock / rear body
  a.rect(4, 8, 3, 4, 'g'); a.set(4, 8, 'h'); a.rect(7, 8, 1, 2, 'm');                      // grip + trigger
  a.rect(9, 3, 14, 4, 't'); a.rect(9, 4, 14, 2, 'C');                                      // glass tube, live core
  for (const x of [10, 14, 18]) { a.rect(x, 2, 2, 6, 'c'); a.set(x, 2, 'o'); a.set(x + 1, 7, 'o'); }   // copper coils
  a.rect(11, 8, 6, 3, 'h'); a.rect(12, 9, 4, 1, 'y'); a.set(16, 8, 'r');                   // battery pack + charge light
  a.rect(23, 2, 2, 7, 'a'); a.set(23, 2, 'A');                                              // emitter head
  a.rect(25, 1, 4, 1, 'm'); a.rect(25, 8, 4, 1, 'm'); a.set(25, 2, 'm'); a.set(25, 7, 'm'); // the fork
  a.set(29, 1, 'w'); a.set(29, 8, 'w'); a.set(25, 5, 'C');
  const rows = a.rows();
  return {
    img: spriteFromRows(rows, TESLA_PAL),
    glow: spriteFromRows(only(rows, 'Cw'), { C: '#d6f8ff', w: '#ffffff' }),
    points: { grip: { x: 5, y: 9 }, support: { x: 19, y: 9 }, muzzle: { x: 29, y: 5 }, port: { x: 24, y: 3 }, light: { x: 25, y: 5 }, prongs: [{ x: 29, y: 1 }, { x: 29, y: 8 }] },
  };
}

const BOOK_PAL = {
  k: '#0d0b14', L: '#2e3248', H: '#4b5272', D: '#1b1d2c', m: '#9aa1b8', M: '#d2d7e8',
  p: '#8b90a6', q: '#5d627a', P: '#555b78', Q: '#3a3f58', E: '#2a0a36', G: '#d94bff', g: '#8f2bb0',
};
// Fill a convex quad (corners in order) on a char grid.
function quad(g, pts, c) {
  const W = 40, H = 40;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let inside = true;
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((bx - ax) * (y + 0.5 - ay) - (by - ay) * (x + 0.5 - ax) < 0) { inside = false; break; }
    }
    if (inside) g.set(x, y, c);
  }
}
function bookArt() {
  // closed: a heavy slate-dark tome turned at an angle - bevelled cover, metal
  // corners, the page block showing along two edges, a violet void sigil (a
  // swirl round a dark eye) in the middle of the cover
  const c = grid(15, 15);
  quad(c, [[5, 2], [14, 5], [11, 14], [2, 11]], 'p');
  for (let i = 0; i < 4; i++) c.set(11 + (i % 2), 7 + i * 2, 'q');
  quad(c, [[4, 0], [13, 3], [10, 12], [1, 9]], 'L');
  for (let i = 0; i < 9; i++) c.set(4 + i, Math.round(0 + i * 0.33), 'H');   // top bevel
  for (let i = 0; i < 9; i++) c.set(4 - Math.round(i * 0.34), i, 'D');       // spine side
  for (const [x, y] of [[4, 0], [12, 3], [10, 11], [2, 9]]) c.set(x, y, 'M');
  // the sigil
  for (const [x, y, ch] of [[7, 5, 'E'], [6, 5, 'G'], [8, 5, 'g'], [7, 4, 'g'], [7, 6, 'G'], [8, 3, 'G'], [9, 4, 'G'], [6, 7, 'G'], [5, 6, 'G'], [9, 6, 'g'], [5, 4, 'g'], [4, 5, 'G'], [10, 5, 'G']]) c.set(x, y, ch);
  const closed = c.rows();
  // open: the covers spread wide under two dark pages of glowing violet script,
  // with `lift` = a page turning (0 = none, 1..3 = leaning right / up / left)
  const open = (lift) => {
    const o = grid(23, 15);
    quad(o, [[0, 5], [11, 8], [12, 14], [2, 11]], 'L');
    quad(o, [[11, 8], [22, 4], [22, 11], [12, 14]], 'L');
    quad(o, [[1, 4], [11, 7], [12, 12], [3, 9]], 'P');
    quad(o, [[11, 7], [20, 3], [21, 9], [12, 12]], 'P');
    for (let i = 0; i < 9; i++) { o.set(2 + i, Math.round(4.5 + i * 0.33), 'p'); o.set(12 + i, Math.round(7 - i * 0.45), 'p'); }   // page rims
    for (const [x, y] of [[4, 7], [6, 8], [8, 8], [5, 9], [14, 8], [16, 7], [18, 6], [15, 9], [17, 8]]) o.set(x, y, 'Q');      // script
    for (const [x, y] of [[7, 7], [9, 9], [15, 7], [19, 5], [16, 10]]) o.set(x, y, 'G');                                     // glowing runes
    o.set(12, 12, 'D'); o.set(11, 13, 'D');
    if (lift === 1) for (let i = 0; i < 6; i++) o.rect(12 + i, 6 - i, 2, 1, 'P');
    if (lift === 2) { o.rect(11, 0, 2, 8, 'P'); o.set(11, 3, 'G'); }
    if (lift === 3) for (let i = 0; i < 6; i++) o.rect(10 - i, 6 - i, 2, 1, 'P');
    return o.rows();
  };
  const openRows = [0, 1, 2, 3].map(open);
  return {
    img: spriteFromRows(closed, BOOK_PAL),
    glow: spriteFromRows(only(closed, 'Gg'), { G: '#f3b6ff', g: '#d94bff' }),
    open: openRows.map((r) => spriteFromRows(r, BOOK_PAL)),
    openGlow: openRows.map((r) => spriteFromRows(only(r, 'G'), { G: '#f7c8ff' })),
    points: { grip: { x: 6, y: 11 }, muzzle: { x: 12, y: 4 }, port: { x: 7, y: 5 }, light: { x: 7, y: 5 } },
    openAt: { x: 11, y: 12 },
    book: true,
  };
}

const RAY_PAL = {
  k: '#0e0a0c', a: '#2a2228', A: '#463a42', m: '#6d5e66', M: '#9a8892', g: '#1c1619',
  C: '#ff3f5f', c: '#ffb3c0', r: '#8f1d33', y: '#e8b84a',
};
// The Crimson Ray: a heavy beam cannon. A dark armoured body with a row of heat
// fins on top, a long window onto the red crystal core, a wide flared emitter
// with a red lens at the front, a pistol grip and a fore grip. Vented: the fins
// stand up open (to dump heat while it recharges).
function rayRows(vented = false) {
  const a = grid(32, 13);
  a.rect(0, 5, 6, 4, 'a'); a.rect(0, 5, 6, 1, 'A'); a.rect(0, 8, 2, 1, 'g');      // stock
  a.rect(6, 3, 15, 6, 'a'); a.rect(6, 3, 15, 1, 'A'); a.rect(6, 8, 15, 1, 'g');   // body
  a.rect(9, 5, 9, 2, 'C'); a.rect(10, 5, 4, 1, 'c'); a.set(17, 6, 'r');          // the core window
  for (let x = 8; x <= 18; x += 2) {                                               // heat fins
    if (vented) { a.rect(x, 0, 1, 3, 'M'); a.set(x, 2, 'C'); }
    else a.rect(x, 2, 1, 1, 'm');
  }
  a.rect(8, 9, 3, 4, 'g'); a.set(8, 9, 'a'); a.rect(11, 9, 1, 2, 'm');            // grip + trigger
  a.rect(18, 9, 2, 2, 'g');                                                         // fore grip
  a.rect(21, 4, 5, 4, 'a'); a.rect(21, 4, 5, 1, 'A'); a.set(23, 6, 'y');          // barrel
  a.rect(26, 2, 2, 8, 'm'); a.rect(26, 2, 2, 1, 'M');                              // flared emitter
  a.rect(28, 3, 1, 6, 'C'); a.rect(28, 5, 1, 2, 'c');                              // the lens
  return a.rows();
}
function rayArt() {
  const rows = rayRows(), vent = rayRows(true);
  return {
    img: spriteFromRows(rows, RAY_PAL),
    vent: spriteFromRows(vent, RAY_PAL),
    glow: spriteFromRows(only(rows, 'Cc'), { C: '#ff7a90', c: '#ffe0e6' }),
    ventGlow: spriteFromRows(only(vent, 'Cc'), { C: '#ff7a90', c: '#ffe0e6' }),
    points: { grip: { x: 9, y: 10 }, support: { x: 19, y: 10 }, muzzle: { x: 29, y: 6 }, port: { x: 14, y: 3 }, light: { x: 24, y: 6 } },
  };
}

const GENJI_PAL = { k: '#0b120d', h: '#1c2a20', H: '#3d6b4a', u: '#c9a24a', U: '#7a5d22', w: '#f2fff0', n: '#8dff8a', N: '#3ccf55', d: '#1f7a35' };
function genjiArt() {
  // the dragonblade: wrapped grip with a pommel, a gold guard, and a long
  // edge of green light with a white-hot core
  const a = grid(36, 7);
  a.rect(0, 2, 9, 3, 'h'); for (let x = 1; x < 9; x += 2) { a.set(x, 2, 'H'); a.set(x + 1, 4, 'H'); }   // diamond wrap
  a.rect(0, 2, 1, 3, 'u');
  a.rect(9, 0, 2, 7, 'u'); a.set(9, 0, 'U'); a.set(10, 6, 'U');                              // guard
  a.rect(11, 2, 22, 1, 'w'); a.rect(11, 3, 23, 1, 'n'); a.rect(11, 4, 21, 1, 'N');          // blade
  a.set(33, 2, 'n'); a.set(34, 3, 'w'); a.set(35, 3, 'n'); a.set(32, 4, 'd');                // tip
  const rows = a.rows();
  return {
    img: spriteFromRows(rows, GENJI_PAL),
    glow: spriteFromRows(only(rows, 'wnN'), { w: '#ffffff', n: '#c4ffbf', N: '#7dff86' }),
    points: { grip: { x: 7, y: 3 }, support: { x: 2, y: 3 }, muzzle: { x: 35, y: 3 }, port: { x: 10, y: 1 }, light: { x: 20, y: 3 } },
  };
}

export const SPEC = {
  odm: {
    // R: snap the worn blades off, draw new ones from the thigh boxes, top up the gas
    charge: { time: 1.5, at: 0.62, events: [[0.14, 'snap']] },
    name: 'ODM GEAR', art: odmArt, use: 10, interval: 0.22, desc: 'GRAPPLE + ZIP. SPIN-SLASH WHAT YOU FLY PAST',
    info: 'CLICK: HOOK + ZIP   RANGE 170   SLASH 55 / SPIN 45   10% A HOOK',
  },
  tesla: {
    // R: pump the charger lever until the coils overcharge
    charge: { time: 1.3, at: 0.8 },
    name: 'TESLA LANCE', art: teslaArt, light: [110, 205, 255], use: 20, interval: 0.08, auto: true, desc: 'HOLD: LIGHTNING THAT CHAINS',
    info: 'HOLD: BEAM 110 DPS   CHAINS TO 4 MORE   SHOCK-STUNS   20%/S',
  },
  necro: {
    // R: a ritual - the book rises open and draws souls in
    charge: { time: 1.6, at: 0.75 },
    name: 'NECRONOMICON', art: bookArt, light: [200, 90, 255], use: 25, interval: 0.8, desc: 'RAISE ZOMBIE SPIRITS TO FIGHT FOR YOU',
    info: 'CLICK A SPOT: SUMMON A SPIRIT   UP TO 4   14S EACH   25% A SPIRIT',
  },
  genji: {
    // R: hold the blade up and channel - green power climbs the edge
    charge: { time: 1.4, at: 0.8 },
    stance: true, rest: 0.55,   // held like the katana: at the waist, raised, facing your way till it strikes
    name: 'DRAGONBLADE', art: genjiArt, light: [120, 255, 120], use: 15, interval: 0.5, desc: 'DASH THROUGH A LINE, THEN CUT',
    info: 'CLICK: DASH 110 PX   70 TO ALL IN LINE + 45 FINISHER   15% A DASH',
  },
  ray: {
    // R: the fins stand open and dump heat while the core fills back up
    charge: { time: 1.4, at: 0.7, events: [[0.12, 'ventOpen'], [0.88, 'ventShut']] },
    name: 'CRIMSON RAY', art: rayArt, light: [255, 70, 95], use: 18, interval: 0.07, auto: true, speedMul: 0.85,
    desc: 'HOLD: A PIERCING RED BEAM', info: 'HOLD: BEAM 155 DPS   BURNS THROUGH EVERYTHING IN LINE   18%/S   HEAVY',
  },
};
for (const [key, d] of Object.entries(SPEC)) {
  Object.assign(d, { key, cls: 'spec', spec: true, caliber: 'battery', magSize: 100, slots: [], damage: 0, fireInterval: d.interval });
  const art = d.art;
  Object.defineProperty(d, 'built', { get() { return (this._built ??= art()); } });
  Object.defineProperty(d, 'img', { get() { return this.built.img; } });
}

export class SpecWeapon {
  constructor(def) {
    this.def = def;
    this.art = def.built;
    this.attach = {};
    this.power = def.magSize;  // battery charge, % (drains smoothly)
    this.ammoSource = null;
    this.cooldown = 0;
    this.recoil = 0;
    this.climb = 0;
    this.flash = 0;
    this.heat = 0;
    this.reload = -1;
    this.drawT = DRAW_TIME;
    this.events = [];
    this.t = 0;                // running clock, for idle animation
    this.firing = false;       // trigger held and doing something (beam on, casting)
    this.state = {};           // per-weapon
    this.engage = 0;           // stance weapons: 0 = in the stance, 1 = turned to the cursor to strike
  }

  get icon() { return this.art.img; }
  get magSize() { return 100; }
  get reserve() { return this.ammoSource ? this.ammoSource.count('battery') : 0; }
  get reloading() { return this.reload >= 0; }
  get raising() { return Math.max(0, this.drawT / DRAW_TIME); }
  get muzzle() { return this.art.points.muzzle; }
  get hasLight() { return false; }
  get hasLaser() { return false; }
  get laserEmitter() { return this.art.points.light; }
  get lightEmitter() { return this.art.points.light; }
  get openAngle() { return 0; }
  get leverAngle() { return 0; }
  get lean() { return 1; }
  get suppressed() { return true; }
  canAttach() { return false; }
  setAttachment() {}

  // What the HUD shows as ammo: the charge in whole percent.
  get ammo() { return Math.ceil(this.power - 1e-6); }
  set ammo(v) { this.power = v; }

  // Spend some charge; false (and a recharge, with a battery in the bag) when it's flat.
  spend(n) {
    if (this.power >= n - 1e-6) {
      this.power = Math.max(0, this.power - n);
      return true;
    }
    this.startReload();
    return false;
  }

  startReload() {
    if (this.reloading || this.ammo >= 100 || this.reserve <= 0 || this.state.busy) return false;
    this.reload = 0;
    this.firing = false;
    return true;
  }

  cancelReload() {
    if (this.reload < this.def.charge.at) this.reload = -1;
  }

  // 0..1 through the recharge, or -1.
  get charging() { return this.reload; }

  update(dt) {
    this.events.length = 0;
    this.t += dt;
    this.cooldown -= dt;
    this.flash -= dt;
    this.drawT -= dt;
    this.recoil *= Math.exp(-14 * dt);
    this.climb *= Math.exp(-10 * dt);
    // a recharge: the weapon's own routine, with one battery spent part way through
    if (this.reload >= 0) {
      const c = this.def.charge, before = this.reload;
      if (before === 0) this.events.push('chargeStart');
      this.reload += dt / c.time;
      for (const [at, e] of c.events ?? []) if (before < at && this.reload >= at) this.events.push(e);
      if (before < c.at && this.reload >= c.at) {
        this.events.push('battIn');
        if (this.ammoSource?.take('battery', 1) > 0) this.ammo = 100;
      }
      if (this.reload >= 1) {
        this.reload = -1;
        this.events.push('chargeEnd');
      }
    }
  }

  // The weapon in hand, grip at the origin, along +x. (These sprites are drawn
  // straight from their rows - no padding - so a point is exactly its pixel.)
  draw(ctx) {
    const { grip } = this.art.points;
    if (this.art.book) {
      const st = this.state, open = st.cast || this.reloading;
      const img = open ? this.art.open[this.reloading ? 1 + (Math.floor(this.t * 16) % 3) : st.page ?? 0] : this.art.img;
      const p = open ? this.art.openAt : grip;
      ctx.drawImage(img, -p.x, -p.y);
      return;
    }
    const vented = this.art.vent && this.reloading && this.reload > 0.12 && this.reload < 0.88;
    ctx.drawImage(vented ? this.art.vent : this.art.img, -grip.x, -grip.y);
  }

  // The glowing bits, drawn again after the lighting (so they glow in the dark).
  drawFlash(ctx) {
    const { grip } = this.art.points, k = this.def.key, t = this.t;
    let img = this.art.glow, p = grip;
    if (this.art.ventGlow && this.reloading && this.reload > 0.12 && this.reload < 0.88) img = this.art.ventGlow;
    if (k === 'ray') {
      // the core burns brighter the longer the beam has been going
      const spin = this.state.spin ?? 0;
      if (spin > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = spin * (0.6 + 0.4 * Math.random());
        ctx.drawImage(img, -p.x, -p.y);
        ctx.restore();
      }
    }
    if (this.art.book && (this.state.cast || this.reloading)) {
      img = this.art.openGlow[this.reloading ? 1 + (Math.floor(t * 16) % 3) : this.state.page ?? 0];
      p = this.art.openAt;
    }
    // a slow breathing glow, much brighter while it works, building up while it recharges
    const pulse = 0.55 + 0.25 * Math.sin(t * 5) + (this.firing ? 0.45 : 0) + (this.reloading ? this.reload * 0.9 * (0.8 + 0.2 * Math.sin(t * 40)) : 0);
    if (!img) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, pulse);
    ctx.drawImage(img, -p.x, -p.y);
    if (k === 'genji' || (k === 'tesla' && (this.firing || this.reloading))) {
      // a soft halo round the blade / the tube
      ctx.globalAlpha = 0.3 * pulse;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ctx.drawImage(img, -p.x + ox, -p.y + oy);
    }
    ctx.restore();
    if (this.art.book && (this.state.cast || this.reloading)) {
      const o = this.art.openAt;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      bloom(ctx, 0, -6, 16, '200, 90, 255', 0.22 + (this.reloading ? 0.15 : 0));
      for (let i = 0; i < 14; i++) {
        const life = 0.7, ph = (t / life + i * 0.37) % 1;
        const px = 2 + ((i * 7.3) % 18) - o.x, py = 6 - ((i * 3) % 4) - o.y - ph * 14;
        ctx.globalAlpha = 1 - ph;
        ctx.fillStyle = ph < 0.3 ? '#f7c8ff' : ph < 0.65 ? '#d94bff' : '#8f2bb0';
        ctx.fillRect(Math.round(px + Math.sin(t * 6 + i) * 1.2), Math.round(py), ph < 0.4 ? 2 : 1, ph < 0.4 ? 2 : 1);
      }
      ctx.restore();
    }
    if (k === 'tesla') {
      // arcs crackling across the fork: now and then idle, all the time firing
      const [a, b] = this.art.points.prongs;
      if (this.firing || this.reloading || Math.sin(t * 3.1) + Math.sin(t * 7.7) > 1.5) {
        const pts = jag({ x: a.x - grip.x, y: a.y - grip.y }, { x: b.x - grip.x, y: b.y - grip.y }, 0.35, 2);
        bolt(ctx, pts, '#59c8ff', '#9fe6ff', '#ffffff');
      }
      // charging: the coils light up one after another, and arcs jump between the lit ones
      if (this.reloading) {
        const xs = [10, 14, 18], lit = xs.filter((_, i) => this.reload > 0.18 + i * 0.2);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const x of lit) {
          ctx.globalAlpha = 0.65 + 0.35 * Math.sin(t * 30 + x);
          ctx.fillStyle = '#ffd28a';
          ctx.fillRect(x - grip.x, 2 - grip.y, 2, 6);
        }
        ctx.restore();
        if (lit.length > 1 && Math.random() < 0.6) {
          const i = Math.floor(Math.random() * (lit.length - 1));
          bolt(ctx, jag({ x: lit[i] + 1 - grip.x, y: 2 - grip.y }, { x: lit[i + 1] + 1 - grip.x, y: 2 - grip.y }, 0.5, 2), '#59c8ff', '#9fe6ff', '#ffffff');
        }
      }
    }
  }
}

// ---------- what each one does (called by the player every frame) ----------

// p: the player; world: SpecWorld. Returns nothing - effects go in world.
export function specAct(w, p, dt, controls, world) {
  const fire = controls.fire && !p.using && !w.reloading && w.drawT <= 0 && !p.rolling;
  ACT[w.def.key](w, p, dt, fire, controls, world);
}

const ACT = {
  // ---- ODM gear ----
  odm(w, p, dt, fire, controls, world) {
    const st = w.state;
    const pressed = fire && !st.held;
    st.held = controls.fire;
    if (pressed && w.cooldown <= 0 && w.spend(w.def.use)) {
      w.cooldown = w.def.interval;
      // where it bites: the cursor (up to its range), or the first wall or
      // zombie on the way there
      const RANGE = 170;
      const t = p.aimTarget ?? { x: p.x + Math.cos(p.aim) * RANGE, y: p.y + Math.sin(p.aim) * RANGE };
      let dx = t.x - p.x, dy = t.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      let len = Math.min(RANGE, Math.max(30, d));
      len = Math.min(len, world.ray(p.x, p.y - 3, dx, dy, len));
      let grab = null;
      const sx = p.x, sy = p.y - 7, ex = t.x - sx, ey = t.y - sy, el = Math.hypot(ex, ey) || 1;
      for (const z of world.zombies()) {
        if (!z.hittable) continue;
        const { along, off } = across(z, sx, sy, ex / el, ey / el);
        if (along > 8 && along < len + z.halfW && off < z.halfW + 4) { len = along; grab = z; }
      }
      st.hook = { x0: p.x, y0: p.y, dx, dy, len, out: 0, grab, z: p.gunZ };
      w.recoil = 2;
      world.sound?.('hook');
    }
    const h = st.hook;
    if (h) {
      // the hook flies out; once it bites, you're reeled in after it
      if (h.out < h.len) {
        h.out = Math.min(h.len, h.out + 900 * dt);
        if (h.out >= h.len) {
          const ax = h.grab ? h.grab.x : h.x0 + h.dx * h.len, ay = h.grab ? h.grab.y : h.y0 + h.dy * h.len;
          h.ax = ax;
          h.ay = ay;
          world.sparkBurst(ax, ay - 6, 6, '#e8f1f7');
          const stop = h.grab ? h.grab.halfW + 7 : 6;
          const ddx = ax - p.x, ddy = ay - p.y, dd = Math.hypot(ddx, ddy);
          const travel = Math.max(0, dd - stop), speed = 430;
          st.zip = { hits: new Set() };
          p.startDash(ddx / (dd || 1) * speed, ddy / (dd || 1) * speed, travel / speed, {
            safe: true,
            onMove: () => ODM_SLASH(w, p, world),
            onEnd: () => {
              // touch down: one big spin that catches everything round you
              st.spinFx = world.spin(p, 34, 0.42);
              world.hitAround(p.x, p.y, 34, 45, st.zip?.hits ?? new Set(), 'melee');
              world.dustRing(p.x, p.y);
              st.zip = null;
              h.reel = 0;
            },
          });
          st.busy = true;
        }
      } else if (h.reel !== undefined) {
        h.reel += dt / 0.16;
        if (h.reel >= 1) { st.hook = null; st.busy = false; }
      }
    }
    w.firing = !!st.zip;
    // gas jets puffing out behind while you fly
    if (st.zip) world.gas(p.x - p.vx * 0.03, p.y - 1, -p.vx, -p.vy);
  },

  // ---- Crimson Ray ----
  ray(w, p, dt, fire, controls, world) {
    const st = w.state;
    const want = fire && w.ammo > 0;
    if (fire && w.ammo <= 0) w.startReload();
    // a short spin-up before the beam comes on, and it dies away when let go
    st.spin = want ? Math.min(1, (st.spin ?? 0) + dt / 0.18) : Math.max(0, (st.spin ?? 0) - dt / 0.12);
    w.firing = want;
    if (st.spin <= 0) return;
    const on = want && st.spin >= 1;
    const g = p.gunPose(p.x, p.y), m = p.gunPoint(g, w.muzzle), z0 = p.gunZ;
    const dx = Math.cos(g.a), dy = Math.sin(g.a), RANGE = 230;
    const len = st.spin >= 1 ? world.ray(m.x, m.y + z0, dx, dy, RANGE) : 0;
    if (on) {
      w.power = Math.max(0, w.power - w.def.use * dt);
      w.recoil = 1;   // pressed back a little, steadily - the beam itself holds dead still
      if ((st.tick = (st.tick ?? 0) - dt) <= 0) {
        st.tick = w.def.interval;
        // it burns through everything along it
        for (const z of world.zombies()) {
          if (!z.hittable) continue;
          const { along, off } = across(z, m.x, m.y, dx, dy);
          if (along < -2 || along > len + z.halfW || off > z.halfW + 3) continue;
          world.burn(z, 11, dx, dy);
        }
        world.sparkBurst(m.x + dx * len, m.y + dy * len + z0, 3, '#ff9aa8');
      }
      if (Math.random() < dt * 40) world.sparkBurst(m.x, m.y + z0, 1, Math.random() < 0.5 ? '#ff5a6e' : '#ffe0e6');
    }
    world.laser = { x: m.x, y: m.y, a: g.a, len, power: st.spin, on, t: w.t, depth: p.y, p };
  },

  // ---- Tesla lance ----
  tesla(w, p, dt, fire, controls, world) {
    const st = w.state;
    w.firing = fire && w.ammo > 0;
    if (!w.firing) {
      if (fire && w.ammo <= 0) w.startReload();
      st.beam = null;
      return;
    }
    w.power = Math.max(0, w.power - w.def.use * dt);
    w.climb = rand(-0.03, 0.03);
    w.recoil = rand(0.3, 1);
    // where the beam goes: the first zombie along it, or the wall / its range
    const g = p.gunPose(p.x, p.y), m = p.gunPoint(g, w.muzzle), z0 = p.gunZ;
    const RANGE = 160, dx = Math.cos(g.a), dy = Math.sin(g.a);
    const gx = m.x, gy = m.y + z0;   // the muzzle over the ground
    let len = world.ray(gx, gy, dx, dy, RANGE), first = null;
    for (const z of world.zombies()) {
      if (!z.hittable) continue;
      const { along, off } = across(z, m.x, m.y, dx, dy);
      if (along > -4 && along < len + z.halfW && off < z.halfW + 3) { len = along; first = z; }
    }
    // then it jumps on to the nearest few zombies round that one
    const chain = [];
    if (first) {
      const hit = new Set([first]);
      let from = first;
      for (let n = 0; n < 4; n++) {
        let best = null, bd = 72;
        for (const z of world.zombies()) {
          if (!z.hittable || hit.has(z)) continue;
          const d = Math.hypot(z.x - from.x, z.y - from.y);
          if (d < bd && world.clear(from.x, from.y - 3, z.x, z.y - 3)) { bd = d; best = z; }
        }
        if (!best) break;
        chain.push([from, best]);
        hit.add(best);
        from = best;
      }
    }
    // a hit ends on the body where the beam meets it, not somewhere behind
    const end = first ? { x: m.x + dx * Math.max(2, len), y: m.y + dy * Math.max(2, len) } : { x: m.x + dx * len, y: m.y + dy * len };
    // the zap itself, in ticks
    if ((st.tick = (st.tick ?? 0) - dt) <= 0) {
      st.tick = w.def.interval;
      if (first) world.zap(first, 9, dx, dy);
      for (const [, z] of chain) world.zap(z, 6, z.x - first.x, z.y - first.y);
      world.sparkBurst(end.x, end.y + (first ? 10 : z0), first ? 3 : 2, '#bff3ff');
      world.kick(dx * 0.6, dy * 0.6);
    }
    // a fresh jagged path every few frames
    if (!st.beam || (st.redo = (st.redo ?? 0) - dt) <= 0) {
      st.redo = 0.045;
      const main = jag(m, end, 0.16, 5);
      const forks = [];
      for (let i = 0; i < 3; i++) {
        // side branches off the near 3/4 of the bolt, so none pokes out past what it hits
        const at = main[Math.floor(rand(2, main.length * 0.75))];
        const a = Math.atan2(end.y - m.y, end.x - m.x) + (Math.random() < 0.5 ? -1 : 1) * rand(0.6, 1.3);
        const l = rand(6, 14);
        forks.push(jag(at, { x: at.x + Math.cos(a) * l, y: at.y + Math.sin(a) * l }, 0.3, 2));
      }
      st.beam = { main, forks, chains: chain.map(([a, b]) => jag({ x: a.x, y: a.y - 10 }, { x: b.x, y: b.y - 10 }, 0.25, 4)), end, first };
    } else {
      st.beam.main[0] = m;   // keep it fixed to the muzzle as you move
    }
    world.beam = st.beam;
  },

  // ---- Necronomicon ----
  necro(w, p, dt, fire, controls, world) {
    const st = w.state;
    const pressed = fire && !st.held;
    st.held = controls.fire;
    if (pressed && !st.cast && w.cooldown <= 0) {
      if (world.spirits.length >= 4) {
        world.say?.('MAX SPIRITS');
      } else if (w.spend(w.def.use)) {
        // the circle goes where you point (within reach and in sight)
        const RANGE = 110, t = p.aimTarget ?? { x: p.x + Math.cos(p.aim) * 50, y: p.y + Math.sin(p.aim) * 50 };
        let dx = t.x - p.x, dy = t.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const len = Math.min(d, RANGE, world.ray(p.x, p.y - 3, dx / d, dy / d, RANGE) - 6);
        dx /= d; dy /= d;
        st.cast = { t: 0, x: p.x + dx * len, y: p.y + dy * len, raised: false };
        world.circle(st.cast.x, st.cast.y);
        w.cooldown = w.def.interval;
      }
    }
    const c = st.cast;
    if (c) {
      c.t += dt;
      // pages riffle while it reads the words, then it lies open
      st.page = c.t < 0.45 ? 1 + (Math.floor(c.t * 14) % 3) : 0;
      if (!c.raised && c.t >= 0.55) {
        c.raised = true;
        world.summon(c.x, c.y);
        world.kick(0, 1.5);
      }
      if (c.t >= 0.9) st.cast = null;
    }
    w.firing = !!st.cast;
    // runes and motes rise off the open book
    if (st.cast && Math.random() < dt * 30) {
      const g = p.gunPose(p.x, p.y);
      world.mote(g.x + rand(-6, 6), g.y - 6, '#de7dff');
    }
  },

  // ---- Dragonblade ----
  genji(w, p, dt, fire, controls, world) {
    const st = w.state;
    const pressed = fire && !st.held;
    st.held = controls.fire;
    if (pressed && w.cooldown <= 0 && !p.dash && w.spend(w.def.use)) {
      w.cooldown = w.def.interval;
      const dx = Math.cos(p.aim), dy = Math.sin(p.aim), D = 110, speed = 720;
      const len = Math.max(0, world.ray(p.x, p.y - 3, dx, dy, D) - 6);
      const hits = new Set();
      const from = { x: p.x, y: p.y };
      st.strike = { from, hits };
      world.afterimages(p, dx, dy, len);
      p.startDash(dx * speed, dy * speed, len / speed, {
        safe: true,
        onMove: (px, py) => {
          // everything you pass through takes the cut
          for (const z of world.zombies()) {
            if (!z.hittable || hits.has(z)) continue;
            const ax = p.x - px, ay = p.y - py, l2 = ax * ax + ay * ay || 1;
            const k = clamp01(((z.x - px) * ax + (z.y - py) * ay) / l2);
            if (Math.hypot(z.x - (px + ax * k), z.y - (py + ay * k)) < z.halfW + 9) {
              hits.add(z);
              world.cut(z, 70, dx, dy);
            }
          }
        },
        onEnd: () => {
          world.slashLine(from.x, from.y - 9, p.x, p.y - 9);
          // and a cut at the end: a wide green arc in front
          st.finish = 0;
          world.arcSlash(p, p.aim, hits);
        },
      });
      st.busy = true;
    }
    // blade held back during the dash, then whipped round in the finishing cut
    // in its stance (raised at the waist) until it strikes; turned to the cursor while striking
    const striking = !!p.dash || st.finish !== undefined;
    w.engage = striking ? 1 : Math.max(0, w.engage - dt * 3);
    if (!striking && !w.reloading) w.climb += (w.def.rest - w.climb) * Math.min(1, dt * 12);
    if (p.dash && st.strike) {
      w.climb = -2.2;
    } else if (st.finish !== undefined && st.finish < 1) {
      st.finish += dt / 0.22;
      const k = smooth(Math.min(1, st.finish));
      w.climb = -2.2 + 3.6 * k - 1.4 * Math.max(0, k - 0.8) * 5;
      if (st.finish >= 1) { st.finish = undefined; st.strike = null; st.busy = false; }
    }
    w.firing = !!p.dash || st.finish !== undefined;
  },
};

// ODM: slash whatever you're flying past.
function ODM_SLASH(w, p, world) {
  const hits = w.state.zip?.hits;
  if (!hits) return;
  for (const z of world.zombies()) {
    if (!z.hittable || hits.has(z)) continue;
    if (Math.hypot(z.x - p.x, z.y - p.y) > z.halfW + 22) continue;
    hits.add(z);
    world.cut(z, 55, z.x - p.x, z.y - p.y, '#bff3ff');
    w.state.spinFx = world.spin(p, 28, 0.32);
  }
}

// ---------- the world side ----------

// The spirit sprite: a common zombie, washed ghost-green, legs fading to a wisp.
let SPIRIT_IMG = null;
function spiritImg(zombieArt, TYPES) {
  if (SPIRIT_IMG) return SPIRIT_IMG;
  const a = zombieArt(TYPES.common.looks[0]);
  const [c, g] = makeCanvas(a.W, a.H);
  for (const k of ['legL', 'legR', 'body', 'head']) if (a[k]) g.drawImage(a[k], 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = 0.72;
  g.fillStyle = '#c45cff';
  g.fillRect(0, 0, a.W, a.H);
  // fade the bottom into a wisp
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'destination-out';
  for (let y = 0; y < 9; y++) {
    g.globalAlpha = (y + 1) / 10;
    g.fillRect(0, a.H - 9 + y, a.W, 1);
  }
  SPIRIT_IMG = { img: c, W: a.W, H: a.H, ox: a.ox, head: a.headBox };
  return SPIRIT_IMG;
}

export class SpecWorld {
  // env: { world, particles, zombies(), hit(z, dmg, nx, ny, part, zh), kick(dx, dy), zombieArt, TYPES }
  constructor(env) {
    this.env = env;
    this.fx = [];        // short-lived effects
    this.spirits = [];
    this.beam = null;    // the tesla beam this frame (set by the weapon)
    this.hook = null;    // the grapple cable this frame
    this.laser = null;   // the crimson ray's beam this frame
    this.laserCanvas = makeCanvas(300, 41);
  }

  zombies() { return this.env.zombies(); }
  ray(x, y, dx, dy, max) { return this.env.world.castRay(x, y, dx, dy, max); }
  clear(x0, y0, x1, y1) { return this.env.world.clearLine(x0, y0, x1, y1); }
  kick(dx, dy) { this.env.kick(dx, dy); }

  // --- damage ---

  cut(z, dmg, nx, ny, color = '#c4ffbf') {
    this.env.hit(z, dmg, nx, ny, 'melee', 14);
    this.fx.push({ kind: 'mark', x: z.x, y: z.y - 10, a: Math.atan2(ny, nx) + rand(-0.4, 0.4), t: 0, life: 0.28, color });
    this.sparkBurst(z.x, z.y - 4, 5, color);
    this.kick(nx * 0.02, ny * 0.02);
  }

  zap(z, dmg, nx, ny) {
    this.env.hit(z, dmg, nx, ny, 'shock', 12);
    z.stun?.(0.25, 'shock');
  }

  hitAround(x, y, R, dmg, skip, part) {
    for (const z of this.zombies()) {
      if (!z.hittable) continue;
      const d = Math.hypot(z.x - x, z.y - y);
      if (d > R + z.halfW) continue;
      this.env.hit(z, dmg, z.x - x || 1, z.y - y, part, 14);
      this.fx.push({ kind: 'mark', x: z.x, y: z.y - 10, a: Math.atan2(z.y - y, z.x - x), t: 0, life: 0.28, color: '#bff3ff' });
    }
  }

  // --- effects ---

  spin(p, R, life) {
    const f = { kind: 'spin', p, R, t: 0, life, dir: p.facing };
    this.fx.push(f);
    return f;
  }
  slashLine(x0, y0, x1, y1) { this.fx.push({ kind: 'line', x0, y0, x1, y1, t: 0, life: 0.32 }); }
  circle(x, y) { this.fx.push({ kind: 'circle', x, y, t: 0, life: 1.5 }); }
  dustRing(x, y) { for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; this.env.particles.dust(x + Math.cos(a) * 4, y, 1, Math.cos(a), Math.sin(a)); } }

  arcSlash(p, a, hits) {
    this.fx.push({ kind: 'arc', p, a, t: 0, life: 0.3, dir: p.facing });
    const R = 30;
    for (const z of this.zombies()) {
      if (!z.hittable) continue;
      const dx = z.x - p.x, dy = z.y - p.y, d = Math.hypot(dx, dy);
      if (d > R + z.halfW) continue;
      const da = Math.atan2(dy, dx) - a;
      if (Math.abs(Math.atan2(Math.sin(da), Math.cos(da))) > 1.1 && d > z.halfW + 6) continue;
      this.cut(z, 45, dx, dy);
    }
    this.kick(Math.cos(a) * 3, Math.sin(a) * 3);
  }

  afterimages(p, dx, dy, len) {
    // see-through green copies of you left along the line (keeping your shape
    // and some detail), none where you end up
    const img = tint(p.snapshot(), '#58ff7a', 0.4);
    const n = Math.max(2, Math.floor(len / 20));
    for (let i = 0; i < n; i++) {
      this.fx.push({ kind: 'ghost', img, x: p.x + dx * (len * i) / n, y: p.y + dy * (len * i) / n, t: -0.012 * i, life: 0.34 });
    }
  }

  sparkBurst(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(40, 110);
      this.env.particles.add({ x, y, z: rand(4, 12), vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: rand(10, 50), gravity: 120, drag: 4, size: 1, color, life: rand(0.15, 0.35), alpha: 1, fade: 1, layer: 'air', shrink: false });
    }
  }

  gas(x, y, vx, vy, colors = ['#eef3f6', '#c9d3da'], z = rand(5, 9)) {
    const l = Math.hypot(vx, vy) || 1;
    this.env.particles.add({ x: x + rand(-2, 2), y, z, vx: (vx / l) * rand(20, 50) + rand(-8, 8), vy: (vy / l) * rand(10, 30) + rand(-6, 6), vz: rand(4, 14), drag: 3, size: Math.round(rand(2, 4)), color: colors[Math.floor(Math.random() * colors.length)], life: rand(0.3, 0.55), alpha: 0.6, fade: 1.4, layer: 'mid' });
  }

  // The crimson ray's burn: no knockback to speak of, just a shove along the beam and sparks.
  burn(z, dmg, nx, ny) {
    this.env.hit(z, dmg, nx, ny, 'shock', 12);
    if (z.kx !== undefined) { z.kx += nx * 6; z.ky += ny * 6; }
    this.sparkBurst(z.x, z.y - 8, 2, Math.random() < 0.5 ? '#ff9aa8' : '#ffe0e6');
  }

  mote(x, y, color) {
    this.env.particles.add({ x, y, z: rand(0, 4), vx: rand(-8, 8), vy: rand(-4, 4), vz: rand(14, 30), drag: 1, size: 1, color, life: rand(0.5, 0.9), alpha: 1, fade: 1, layer: 'air', shrink: false });
  }

  // --- spirits ---

  summon(x, y) {
    this.spirits.push({ x, y, t: 0, life: 14, rise: 0, target: null, atk: 0.4, lunge: 0, facing: 1, bob: rand(0, 6), leaving: -1 });
    for (let i = 0; i < 14; i++) this.mote(x + rand(-9, 9), y + rand(-3, 3), i % 2 ? '#de7dff' : '#fbe8ff');
  }

  updateSpirits(dt, player) {
    for (const s of this.spirits) {
      s.t += dt;
      s.bob += dt * 4;
      s.rise = Math.min(1, s.t / 0.45);
      s.lunge = Math.max(0, s.lunge - dt * 5);
      if (s.leaving >= 0) {
        s.leaving += dt / 0.45;
        continue;
      }
      if (s.t >= s.life) {
        s.leaving = 0;
        for (let i = 0; i < 16; i++) this.mote(s.x + rand(-6, 6), s.y - rand(0, 16), '#de7dff');
        continue;
      }
      if (s.rise < 1) continue;
      // hunt: the nearest living zombie; with none about, drift along by you
      if (!s.target?.hittable) {
        s.target = null;
        let bd = 220;
        for (const z of this.zombies()) {
          if (!z.hittable) continue;
          const d = Math.hypot(z.x - s.x, z.y - s.y);
          if (d < bd) { bd = d; s.target = z; }
        }
      }
      const goal = s.target ?? { x: player.x - player.facing * 14 + Math.sin(s.bob * 0.3) * 6, y: player.y - 4 };
      const dx = goal.x - s.x, dy = goal.y - s.y, d = Math.hypot(dx, dy);
      const reach = s.target ? s.target.halfW + 7 : 4;
      if (d > reach) {
        const sp = Math.min(d - reach, (s.target ? 95 : 70) * dt);
        s.x += (dx / d) * sp;
        s.y += (dy / d) * sp;
      }
      if (Math.abs(dx) > 1) s.facing = Math.sign(dx);
      // claws
      s.atk -= dt;
      if (s.target && d <= reach + 3 && s.atk <= 0) {
        s.atk = 0.55;
        s.lunge = 1;
        this.env.hit(s.target, 22, dx, dy, 'melee', 14);
        this.fx.push({ kind: 'claw', x: s.target.x, y: s.target.y - 10, facing: s.facing, t: 0, life: 0.25 });
        this.sparkBurst(s.target.x, s.target.y - 6, 4, '#de7dff');
      }
      if (Math.random() < dt * 10) this.mote(s.x + rand(-4, 4), s.y - rand(0, 6), '#c45cff');
    }
    this.spirits = this.spirits.filter((s) => s.leaving < 1);
  }

  update(dt, player) {
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < f.life);
    this.updateSpirits(dt, player);
  }

  // Lights for the lighting pass (a glowing weapon in hand lights itself up:
  // its glow is drawn with the body, before the lighting, so it needs it).
  lights(player) {
    const out = [], w = player?.weapon;
    const L = this.laser;
    if (L && L.len > 0) {
      // red light at the muzzle, along the beam and where it ends
      const dx = Math.cos(L.a), dy = Math.sin(L.a), gz = player?.gunZ ?? 9;
      out.push({ x: L.x, y: L.y + gz, radius: 80, color: [255, 70, 95], intensity: L.power, rays: 48 });
      for (let d = 50; d < L.len; d += 50) out.push({ x: L.x + dx * d, y: L.y + dy * d + gz, radius: 45, color: [255, 80, 100], intensity: 0.5 * L.power, shadows: false });
      out.push({ x: L.x + dx * L.len, y: L.y + dy * L.len + gz, radius: 50, color: [255, 110, 130], intensity: 0.8 * L.power, rays: 48 });
    }
    if (player && !player.dead && !player.meleeOut && w?.def.light) {
      // on the floor under the middle of the weapon
      const gp = player.gunPose(player.x, player.y), m = player.gunPoint(gp, w.muzzle), [r, g, b] = w.def.light;
      const x = w.art.book ? player.x + player.facing * 8 : (gp.x + m.x) / 2, y = w.art.book ? player.y : (gp.y + m.y) / 2 + player.gunZ;
      out.push({ x, y, radius: 26, color: [r, g, b], intensity: w.firing ? 0.75 : 0.45, rays: 48 });   // stopped by walls like any light
    }
    if (this.beam) {
      const { main, end, chains } = this.beam;
      out.push({ x: main[0].x, y: main[0].y + 9, radius: 70, color: [120, 210, 255], intensity: 1, rays: 48 });   // stopped by walls like any light
      out.push({ x: end.x, y: end.y + 10, radius: 60, color: [140, 220, 255], intensity: 0.9, rays: 48 });   // stopped by walls like any light
      for (const c of chains) out.push({ x: c.at(-1).x, y: c.at(-1).y + 10, radius: 40, color: [140, 220, 255], intensity: 0.7, rays: 48 });   // stopped by walls like any light
    }
    for (const s of this.spirits) out.push({ x: s.x, y: s.y, radius: 34, color: [200, 90, 255], intensity: 0.55 * (1 - Math.max(0, s.leaving)), rays: 48 });   // stopped by walls like any light
    for (const f of this.fx) {
      if (f.kind === 'circle') out.push({ x: f.x, y: f.y, radius: 50, color: [200, 90, 255], intensity: 0.8 * (1 - f.t / f.life), rays: 48 });   // stopped by walls like any light
      if (f.kind === 'line') out.push({ x: (f.x0 + f.x1) / 2, y: (f.y0 + f.y1) / 2 + 9, radius: 60, color: [120, 255, 120], intensity: 0.6 * (1 - f.t / f.life), rays: 48 });   // stopped by walls like any light
    }
    return out;
  }

  // Spin slashes round the player: drawn with them, before the lighting, so they
  // darken with the map like every other melee slash.
  drawSpins(ctx, p) {
    for (const f of this.fx) if (f.kind === 'spin' && f.p === p) spinSlash(ctx, Math.round(p.x), Math.round(p.y - 9), f.R, f);
  }

  // Under everything standing up: the summoning circles on the floor.
  drawFloor(ctx, time) {
    for (const f of this.fx) if (f.kind === 'circle') this.drawCircle(ctx, f, time);
  }

  // After the lighting: everything that glows, each at the depth (y) of what
  // it belongs to, so things standing in front hide it (main.js drawGlows).
  glows(player, time) {
    const out = [], P = player.sortY + 0.5;
    const at = (y, draw) => out.push({ y, draw });
    for (const f of this.fx) {
      if (f.kind === 'circle') at(-Infinity, (g) => this.drawCircle(g, f, time, true));
      else if (f.kind === 'ghost') at(f.y + 0.5, (g) => this.drawGhost(g, f));
      else if (f.kind === 'mark') at(f.y + 10.5, (g) => this.drawMark(g, f));
      else if (f.kind === 'claw') at(f.y + 10.5, (g) => this.drawClaw(g, f));
      else if (f.kind === 'line') at(P, (g) => this.drawLine(g, f));
      else if (f.kind === 'arc') at(P, (g) => this.drawArc(g, f));
    }
    for (const s of this.spirits) at(s.y + 0.5, (g) => this.drawSpirit(g, s));
    const hook = player.hookLine;
    if (hook) at(P, (g) => this.drawHook(g, hook));
    const beam = this.beam;
    if (beam) at(Math.max(P, (beam.first?.y ?? -Infinity) + 0.6), (g) => this.drawBeam(g, beam));
    this.beam = null;
    const laser = this.laser;
    if (laser) at(P, (g) => this.drawLaser(g, laser));
    this.laser = null;
    return out;
  }

  // The Crimson Ray's beam, drawn flat along +x on its own canvas and then turned
  // to the aim (pixel-sharp): a thick coral beam with a pale core, rune marks
  // streaming down it, white lightning flickering inside, and at the muzzle a
  // burst - a fan of light thrown back, jagged red bolts and sparks spraying out.
  drawLaser(ctx, L) {
    const [c, g] = this.laserCanvas, OX = 14, CY = 20;   // the muzzle on the canvas
    // from the muzzle exactly where the gun was drawn this frame
    const o = L.p?.rayMuzzle ?? L, ang = L.p?.rayA ?? L.a;
    g.clearRect(0, 0, c.width, c.height);
    const len = Math.min(c.width - OX - 2, Math.round(L.len)), P = L.power, t = L.t;
    const hh = Math.max(1, Math.round(3.5 * P));   // half the beam's height
    const px = (x, y, col) => { g.fillStyle = col; g.fillRect(OX + x, CY + y, 1, 1); };
    const row = (x0, x1, y, col) => { g.fillStyle = col; g.fillRect(OX + x0, CY + y, x1 - x0, 1); };
    if (len > 0) {
      // a soft red glow round it
      g.globalAlpha = 0.22 * P;
      g.fillStyle = '#ff3b5c';
      g.fillRect(OX, CY - hh - 3, len, hh * 2 + 7);
      g.globalAlpha = 1;
      // the beam itself, edge to core
      for (let y = -hh; y <= hh; y++) {
        const a = Math.abs(y);
        row(0, len, y, a === hh ? '#c22a48' : a >= hh - 1 ? '#ff5a6e' : a >= 2 ? '#ff8fa0' : '#ffe0e6');
      }
      // rune marks streaming out along it: little chevrons and dots
      if (hh >= 3) {
        const off = Math.floor(t * 170) % 12;
        for (let x = off; x < len - 3; x += 12) {
          for (const [ox, oy] of [[0, -2], [1, -1], [2, 0], [1, 1], [0, 2]]) px(x + ox, oy, '#ffc8d1');
          px(x + 6, -2, '#ffc8d1'); px(x + 6, 2, '#ffc8d1');
        }
      }
      // white lightning running inside it
      for (let i = 0; i < 2; i++) {
        const x0 = Math.floor(Math.random() * Math.max(1, len - 24)), seg = jag({ x: x0, y: rand(-1, 1) }, { x: x0 + rand(12, 24), y: rand(-1.5, 1.5) }, 0.3, 2);
        g.fillStyle = '#ffffff';
        for (let k = 1; k < seg.length; k++) line(g, OX + seg[k - 1].x, CY + seg[k - 1].y, OX + seg[k].x, CY + seg[k].y);
      }
      // where it hits: a round glowing ball of light, throbbing
      const R = hh + 3 + Math.round(Math.sin(t * 28)), R2 = R + 2;
      g.globalAlpha = 0.3 * P;
      g.fillStyle = '#ff3b5c';
      for (let y = -R2; y <= R2; y++) for (let x = -R2; x <= R2; x++) if (x * x + y * y <= R2 * R2) g.fillRect(OX + len + x, CY + y, 1, 1);
      g.globalAlpha = 1;
      for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
        const d = Math.hypot(x, y) / R;
        if (d > 1) continue;
        px(len + x, y, d < 0.45 ? '#ffffff' : d < 0.72 ? '#ffd0d8' : d < 0.9 ? '#ff8fa0' : '#c22a48');
      }
    }
    // the burst at the muzzle
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i - 3) * 0.38 + rand(-0.1, 0.1), r = (4 + Math.random() * 6) * P;
      g.fillStyle = i % 2 ? '#ff8fa0' : '#ff5a6e';
      line(g, OX + 1, CY, OX + 1 + Math.cos(a) * r, CY + Math.sin(a) * r);
    }
    g.fillStyle = '#ffe0e6';
    g.fillRect(OX - 1, CY - 2, 3, 5);
    g.fillStyle = '#ffffff';
    g.fillRect(OX, CY - 1, 2, 3);
    // jagged bolts and sparks spraying up and down off the muzzle
    for (let i = 0; i < 4; i++) {
      const side = i % 2 ? 1 : -1, a = side * rand(0.5, 1.25), r = rand(8, 18) * P;
      const pts = jag({ x: rand(1, 5), y: 0 }, { x: Math.cos(a) * r + 3, y: Math.sin(a) * r }, 0.4, 2);
      g.fillStyle = Math.random() < 0.25 ? '#ffffff' : i < 2 ? '#ff3f5f' : '#ff8fa0';
      for (let k = 1; k < pts.length; k++) line(g, OX + pts[k - 1].x, CY + pts[k - 1].y, OX + pts[k].x, CY + pts[k].y);
    }
    for (let i = 0; i < 8; i++) px(Math.round(rand(-6, 16)), Math.round(rand(-12, 12)), Math.random() < 0.4 ? '#ffe0e6' : '#ff5a6e');
    // turned to the aim and laid over the scene
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(ang);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c, -OX, -CY);
    ctx.restore();
    bloom(ctx, o.x, o.y, 16, '255, 70, 95', 0.45 * P);
    if (len > 0) bloom(ctx, o.x + Math.cos(ang) * len, o.y + Math.sin(ang) * len, 18, '255, 110, 130', 0.5 * P);
  }

  // The summoning circle: two rings of runes turning opposite ways round a
  // star, drawn up out of the floor, then a pillar of light as the spirit rises.
  drawCircle(ctx, f, time, glow = false) {
    const k = f.t / f.life, grow = smooth(clamp01(f.t / 0.35)), fade = 1 - clamp01((k - 0.7) / 0.3);
    const R = 15 * grow, cx = Math.round(f.x), cy = Math.round(f.y);
    ctx.save();
    if (glow) ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (glow ? 0.9 : 0.5) * fade;
    const dot = (a, r, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.5), 1, 1);
    };
    for (let i = 0; i < 64; i++) dot((i / 64) * Math.PI * 2, R, '#c45cff');
    for (let i = 0; i < 48; i++) if (i % 4) dot((i / 48) * Math.PI * 2 - time * 1.4, R - 3, '#eab3ff');
    // runes on the outer ring
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + time * 0.9;
      dot(a, R + 2, '#fbe8ff');
      dot(a + 0.06, R + 2, '#c45cff');
    }
    // the star
    ctx.fillStyle = '#de7dff';
    for (let i = 0; i < 5; i++) {
      const a0 = (i / 5) * Math.PI * 2 + time * 0.5, a1 = ((i + 2) / 5) * Math.PI * 2 + time * 0.5;
      const r = R - 4;
      if (r > 2) line(ctx, cx + Math.cos(a0) * r, cy + Math.sin(a0) * r * 0.5, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r * 0.5);
    }
    if (glow) {
      bloom(ctx, cx, cy, 24 * grow, '200, 90, 255', 0.25 * fade);
      // the pillar, while the spirit comes up
      const pk = clamp01((f.t - 0.45) / 0.5);
      if (pk > 0 && pk < 1) {
        const h = 40 * Math.sin(pk * Math.PI), wd = Math.round(10 * (1 - pk) + 2);
        const g = ctx.createLinearGradient(0, cy - h, 0, cy);
        g.addColorStop(0, 'rgba(210, 120, 255, 0)');
        g.addColorStop(1, 'rgba(225, 160, 255, 0.55)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        ctx.fillRect(cx - wd / 2, cy - h, wd, h);
        ctx.fillStyle = 'rgba(250, 230, 255, 0.7)';
        ctx.fillRect(cx - 1, cy - h, 2, h);
      }
    }
    ctx.restore();
  }

  drawSpirit(ctx, s) {
    const S = spiritImg(this.env.zombieArt, this.env.TYPES);
    const fade = s.leaving >= 0 ? 1 - s.leaving : 1;
    const bob = Math.round(Math.sin(s.bob) * 1.5) - 3;   // it floats
    const x = Math.round(s.x + s.facing * s.lunge * 4), y = Math.round(s.y + bob);
    ctx.save();
    // it comes up out of the circle: only the part above the floor shows
    const shown = Math.round(S.H * s.rise);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.25 * fade;
    bloom(ctx, x, y - S.H / 2, 18, '200, 90, 255', 0.35 * fade);
    ctx.globalAlpha = (0.7 + 0.15 * Math.sin(s.bob * 2.3)) * fade;
    ctx.translate(x, y);
    ctx.scale(s.facing, 1);
    ctx.drawImage(S.img, 0, 0, S.W, shown, -S.ox, -shown, S.W, shown);
    // glowing eyes
    if (s.rise >= 1) {
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#fff0ff';
      const ey = Math.round(S.head.top + (S.head.bottom - S.head.top) * 0.5);
      ctx.fillRect(1, ey, 1, 1);
      ctx.fillRect(3, ey, 1, 1);
    }
    ctx.restore();
    // a wispy tail
    ctx.save();
    ctx.globalAlpha = 0.5 * fade;
    ctx.fillStyle = '#c45cff';
    for (let i = 0; i < 5; i++) ctx.fillRect(Math.round(x - s.facing * (i + 1) + Math.sin(s.bob + i) * 1.5), y - 2 + Math.round(i * 0.6), 1, 1);
    ctx.restore();
  }

  drawGhost(ctx, f) {
    if (f.t < 0) return;
    const k = f.t / f.life;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.42 * (1 - k) * (1 - k);
    ctx.drawImage(f.img, Math.round(f.x) - 32, Math.round(f.y) - 46);
    ctx.restore();
  }

  drawHook(ctx, h) {
    // the cable: steel, taut when reeling you in, a little wavy while it flies
    const pts = [];
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const u = i / N, wave = h.taut ? 0 : Math.sin(u * Math.PI * 3 + h.t * 40) * 1.5 * Math.sin(u * Math.PI);
      pts.push({ x: h.x0 + (h.x1 - h.x0) * u - h.ny * wave, y: h.y0 + (h.y1 - h.y0) * u + h.nx * wave });
    }
    ctx.fillStyle = '#4d5660';
    for (let i = 1; i < pts.length; i++) line(ctx, pts[i - 1].x, pts[i - 1].y + 1, pts[i].x, pts[i].y + 1);
    ctx.fillStyle = '#d8e2ea';
    for (let i = 1; i < pts.length; i++) line(ctx, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    // the anchor head: a barbed spike
    const a = Math.atan2(h.y1 - h.y0, h.x1 - h.x0), cx = h.x1, cy = h.y1;
    ctx.fillStyle = '#f2f7fb';
    for (let i = 0; i < 4; i++) ctx.fillRect(Math.round(cx + Math.cos(a) * i), Math.round(cy + Math.sin(a) * i), 1, 1);
    ctx.fillStyle = '#9aa6b2';
    for (const s of [-1, 1]) ctx.fillRect(Math.round(cx + Math.cos(a + s * 2.4) * 2), Math.round(cy + Math.sin(a + s * 2.4) * 2), 1, 1);
  }

  drawBeam(ctx, b) {
    bloom(ctx, b.main[0].x, b.main[0].y, 14, '120, 210, 255', 0.5);
    bloom(ctx, b.end.x, b.end.y, 16, '140, 220, 255', 0.55);
    bolt(ctx, b.main, '#2f9dff', '#8fdcff', '#ffffff', 2);
    for (const f of b.forks) bolt(ctx, f, '#2f9dff', '#8fdcff', '#d8f4ff');
    for (const c of b.chains) {
      bolt(ctx, c, '#2f9dff', '#8fdcff', '#ffffff');
      bloom(ctx, c.at(-1).x, c.at(-1).y, 12, '140, 220, 255', 0.45);
    }
    // the one being cooked flickers white-blue
    if (b.first) {
      ctx.fillStyle = Math.random() < 0.5 ? '#ffffff' : '#9fe6ff';
      for (let i = 0; i < 4; i++) ctx.fillRect(Math.round(b.end.x + rand(-5, 5)), Math.round(b.end.y + rand(-8, 8)), 1, 1);
    }
  }

  // A hit mark: a quick white-hot slash across the target, gone in 3 frames.
  drawMark(ctx, f) {
    const frame = Math.min(2, Math.floor((f.t / f.life) * 3)), L = [9, 6, 3][frame];
    const dx = Math.cos(f.a + Math.PI / 2), dy = Math.sin(f.a + Math.PI / 2);
    ctx.fillStyle = frame === 0 ? '#ffffff' : f.color;
    line(ctx, f.x - dx * L, f.y - dy * L, f.x + dx * L, f.y + dy * L);
    if (frame === 0) {
      ctx.fillStyle = f.color;
      line(ctx, f.x - dx * L + 1, f.y - dy * L, f.x + dx * L + 1, f.y + dy * L);
    }
  }

  // The dragonblade's line: a long blade of light along the dash, then thinner
  // and thinner, breaking into specks.
  drawLine(ctx, f) {
    const k = f.t / f.life, frame = Math.min(2, Math.floor(k * 3));
    const len = Math.hypot(f.x1 - f.x0, f.y1 - f.y0);
    if (len < 2) return;
    const dx = (f.x1 - f.x0) / len, dy = (f.y1 - f.y0) / len, nx = -dy, ny = dx;
    // (no soft bloom here: it would spill over walls - its light does that job, and walls stop it)
    const W = [3, 2, 1][frame];
    for (let i = 0; i <= len; i++) {
      const u = i / len, w = Math.round(W * Math.sin(Math.PI * u) + (frame === 0 ? 0.5 : 0));
      if (frame === 2 && i % 3) continue;
      for (let j = -w; j <= w; j++) {
        ctx.fillStyle = j === 0 ? '#ffffff' : Math.abs(j) === w ? '#3ccf55' : '#a8ff9e';
        ctx.fillRect(Math.round(f.x0 + dx * i + nx * j), Math.round(f.y0 + dy * i + ny * j), 1, 1);
      }
    }
  }

  // The finishing cut: a fat green crescent in front of you.
  drawArc(ctx, f) {
    const k = f.t / f.life, frame = Math.min(2, Math.floor(k * 3));
    const R = 26, TH = [7, 5, 2][frame], span = 2.2 * Math.min(1, f.t / 0.06);
    const cx = Math.round(f.p.x), cy = Math.round(f.p.y - 9);
    const a0 = f.a - (f.dir * 2.2) / 2;
    for (let y = -R; y <= R; y++) {
      for (let x = -R; x <= R; x++) {
        const d = Math.hypot(x, y);
        if (d > R || d < R - TH) continue;
        let rel = (Math.atan2(y, x) - a0) * f.dir;
        rel = ((rel % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        if (rel > span) continue;
        const u = rel / 2.2, w = 1 + (TH - 1) * Math.sin(Math.PI * u);
        if (d < R - w) continue;
        const v = (R - d) / w;
        ctx.fillStyle = v < 0.3 ? '#ffffff' : v < 0.7 ? '#a8ff9e' : '#3ccf55';
        ctx.fillRect(cx + x, cy + y, 1, 1);
      }
    }
  }

  // A spirit's claws: three green rakes across the target.
  drawClaw(ctx, f) {
    const k = f.t / f.life, L = Math.round(7 * (1 - k * 0.5));
    ctx.fillStyle = k < 0.35 ? '#fff0ff' : '#c45cff';
    for (const o of [-3, 0, 3]) line(ctx, f.x - f.facing * 4 + o, f.y - L / 2 + o * 0.3, f.x + f.facing * 4 + o, f.y + L / 2 + o * 0.3);
  }
}

// Build the right weapon object for a def (guns or spec).
export const isSpec = (def) => !!def?.spec;
