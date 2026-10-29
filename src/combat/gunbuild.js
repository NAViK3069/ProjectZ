// Procedural gun art. Builds the structure every gun uses (parts as palette
// rows, attachment points, slots, moving parts) from a short spec, so the
// whole catalog shares one look and every gun still has its own bolt, mag,
// trigger and charging handle that move.
//
// Guns are drawn on a fine grid: 2 gun pixels to a world pixel (see RES in
// gunart.js), so there's room for real detail - shading top to bottom so
// parts read round or flat, ejection ports, rail teeth, vent holes, pins,
// grip stippling, mag ribs and baseplates, wood grain, buttpads, sights.
// Spec numbers (stock / receiver / handguard / barrel lengths, mag rows...)
// are still given in world pixels and doubled here.
//
// Parts are painted in absolute gun pixels on a sketch and trimmed to their
// bounding box afterwards. Guns point right.
//
// Long guns (rifles, SMGs, shotguns, snipers, LMGs):
//   stock | receiver (grip, trigger, mag, port) | handguard | barrel
// Handguns: slide over a frame, mag in the grip; revolvers; machine pistols.

export class Sketch {
  constructor() {
    this.m = new Map();
  }

  set(x, y, ch) {
    if (ch && ch !== '.' && ch !== ' ') this.m.set(`${x},${y}`, ch);
    return this;
  }
  get(x, y) {
    return this.m.get(`${x},${y}`) ?? null;
  }
  clear(x, y) {
    this.m.delete(`${x},${y}`);
    return this;
  }

  rect(x, y, w, h, ch) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, ch);
    return this;
  }
  hole(x, y, w, h) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.clear(x + i, y + j);
    return this;
  }
  // a block lit from above: light top row, dark bottom rows
  shade(x, y, w, h, [lo, mid, hi], dark = 1) {
    this.rect(x, y, w, h, mid);
    this.rect(x, y, w, 1, hi);
    if (h > 2) this.rect(x, y + h - dark, w, dark, lo);
    return this;
  }
  rows(x, y, rows) {
    rows.forEach((r, j) => [...r].forEach((ch, i) => this.set(x + i, y + j, ch)));
    return this;
  }
  // recolour what's already painted in a box (only cells that are set)
  tint(x, y, w, h, ch) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (this.get(x + i, y + j)) this.set(x + i, y + j, ch);
    return this;
  }

  get empty() {
    return this.m.size === 0;
  }

  // Light from above: every cell with open air over it goes a shade lighter,
  // with open air under it a shade darker - a rim of light and shadow round
  // every part so it reads as a solid thing, not a flat cut-out.
  bevel() {
    const up = [], down = [];
    for (const [k, ch] of this.m) {
      const [x, y] = k.split(',').map(Number);
      if (!this.m.has(`${x},${y - 1}`)) up.push([k, ch]);
      else if (!this.m.has(`${x},${y + 1}`)) down.push([k, ch]);
    }
    for (const [k, ch] of up) this.m.set(k, LIGHTER[ch] ?? ch);
    for (const [k, ch] of down) this.m.set(k, DARKER[ch] ?? ch);
    return this;
  }

  part(bevel = true) {
    if (bevel) this.bevel();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of this.m.keys()) {
      const [x, y] = k.split(',').map(Number);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    const rows = [];
    for (let y = y0; y <= y1; y++) {
      let s = '';
      for (let x = x0; x <= x1; x++) s += this.m.get(`${x},${y}`) ?? '.';
      rows.push(s);
    }
    return { x: x0, y: y0, rows };
  }
}

const hash = (x, y, s = 0) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const W2 = (v) => Math.round(v * 2);   // world px -> gun px

// furniture: [dark, mid, light, highlight]
export const FURN = {
  black: ['g', 'e', 'd', 'c'],
  grey: ['e', 'd', 'c', 'l'],
  olive: ['o', 'O', 'P', 'Q'],
  wood: ['v', 'w', 'W', 'x'],
  tan: ['u', 't', 'T', 'U'],
  red: ['v', 'R', 'r', 'r'],
};
const GRAIN = { wood: 'V', olive: 'o', tan: 'u', black: 'f', grey: 'e', red: 'v' };
// receiver metal: [deep shadow, shadow, body, light, highlight]
export const BODY = {
  black: ['f', 'g', 'e', 'd', 'c'],
  steel: ['f', 'e', 'd', 'c', 'l'],
  tan: ['v', 'u', 't', 'T', 'U'],
  olive: ['q', 'o', 'O', 'P', 'Q'],
  silver: ['e', 'c', 'l', 'S', 'Z'],
};
// a mag's colours: [main, front edge, baseplate]; darker version of each colour
const DARKER = { Z: 'S', S: 'l', l: 'c', c: 'd', d: 'e', e: 'g', g: 'f', f: 'h', h: 'h', P: 'O', O: 'o', o: 'q', T: 't', t: 'u', u: 'v', W: 'w', w: 'v', v: 'V', b: 'B', y: 'n', U: 'T', Q: 'P', x: 'W' };
const dk = (c) => DARKER[c] ?? c;
const LIGHTER = { h: 'f', f: 'g', g: 'e', e: 'd', d: 'c', c: 'l', l: 'S', S: 'Z', q: 'g', k: 'f', o: 'O', O: 'P', P: 'Q', V: 'v', v: 'w', w: 'W', W: 'x', u: 't', t: 'T', T: 'U', B: 'b', R: 'r', n: 'y', y: 'Y' };

// The wood grain / stipple on a furniture fill: speckle some cells darker.
function texture(sk, x, y, w, h, furn, seed) {
  const g = GRAIN[furn] ?? 'f';
  for (let j = 1; j < h - 1; j++) for (let i = 0; i < w; i++) {
    if (!sk.get(x + i, y + j)) continue;
    if (furn === 'wood' ? hash((x + i) >> 2, y + j, seed) < 0.22 && hash(x + i, y + j, seed + 1) < 0.7 : hash(x + i, y + j, seed) < 0.12) sk.set(x + i, y + j, g);
  }
}

// --- magazines (top-left at the magwell; n = world rows) ---
export function paintMag(sk, type, x, y, n, [m, e, b]) {
  const L = n * 2;
  const row = (j, off, w) => {
    sk.set(x + off, y + j, dk(m));
    sk.rect(x + off + 1, y + j, w - 2, 1, m);
    sk.set(x + off + w - 1, y + j, e);
  };
  switch (type) {
    case 'stanag':
    case 'curve': {
      const bend = type === 'curve' ? 2.6 : 1.2;
      for (let j = 0; j < L; j++) {
        const off = Math.floor(((j / L) ** 2) * bend * 2);
        row(j, off, 6);
        // ribs pressed into the mag body
        if (j > 1 && j < L - 2 && j % 5 === 3) sk.rect(x + off + 1, y + j, 4, 1, dk(m));
      }
      const off = Math.floor(bend * 2 * 0.9);
      sk.rect(x + off - 1, y + L, 7, 1, b).rect(x + off - 1, y + L + 1, 7, 1, dk(b));   // baseplate
      return;
    }
    case 'straight':
    case 'box': {
      const w = type === 'box' ? 8 : 6;
      for (let j = 0; j < L; j++) row(j, 0, w);
      for (let j = 3; j < L - 1; j += 4) sk.rect(x + 1, y + j, w - 2, 1, dk(m));
      sk.rect(x, y + L, w, 1, b).rect(x, y + L + 1, w, 1, dk(b));
      return;
    }
    case 'pistol':
      for (let j = 0; j < L; j++) row(j, 0, 4);
      sk.rect(x - 1, y + L, 6, 2, b).rect(x - 1, y + L + 1, 6, 1, dk(b));
      return;
    case 'drum':
    case 'bigdrum': {
      // a round drum, a little shine top left, the feed neck on top
      const r = type === 'drum' ? 5 : 6.5, cx = x + (type === 'drum' ? 5 : 6), cy = y + r + 2;
      sk.rect(cx - 2, y, 4, 3, m);
      for (let j = -Math.ceil(r); j <= Math.ceil(r); j++) for (let i = -Math.ceil(r); i <= Math.ceil(r); i++) {
        const d = Math.hypot(i + 0.5, j + 0.5);
        if (d > r) continue;
        sk.set(cx + i, cy + j, d > r - 1.2 ? dk(m) : i + j < -r * 0.6 ? e : m);
      }
      sk.rect(cx - 1, cy - 1, 2, 2, 'c').set(cx, cy, 'l');   // the winding key
      return;
    }
    case 'beltbox': {
      sk.shade(x, y, 12, 9, [dk(m), m, e]);
      sk.rect(x, y + 9, 12, 1, b);
      sk.rect(x + 2, y + 3, 8, 1, dk(m)).rect(x + 2, y + 6, 8, 1, dk(m));
      sk.rect(x + 9, y + 2, 2, 2, 'c');   // the latch
      return;
    }
  }
}

// --- stocks (x 0..S-1, from row top, H rows tall; all in gun px) ---
export function paintStock(sk, type, S, top, H, F, B, drop, furn) {
  const [fd, fm, fl, fh] = F;
  if (type === 'solid' || type === 'wood') {
    // butt taller than the wrist; optional drop at the back (AK); a rubber buttpad
    for (let x = 0; x < S; x++) {
      const back = 1 - x / S, d = Math.round(drop * 2 * back);
      const y0 = top + d, y1 = top + H - 1 + (x < S * 0.45 ? 2 : 0) + d - (x >= S - 3 ? 2 : 0);
      for (let y = y0; y <= y1; y++) sk.set(x, y, y === y0 ? fh : y === y0 + 1 ? fl : y >= y1 - 1 ? fd : fm);
    }
    texture(sk, 0, top, S, H + 4, furn, 3);
    for (let y = top - 1; y < top + H + 4; y++) if (sk.get(0, y)) { sk.set(0, y, 'k'); sk.set(1, y, 'k'); }
    // sling swivel under the butt
    sk.set(Math.round(S * 0.35), top + H + 2 + Math.round(drop * 2 * 0.65), 'c');
  } else if (type === 'skel') {
    // skeleton stock: a frame round an empty middle, pad at the back
    sk.rect(0, top, S, 2, fm).rect(0, top, S, 1, fl);
    sk.rect(0, top, 3, H + 1, fm).rect(0, top, 2, H + 1, 'k');
    sk.rect(0, top + H - 1, 6, 2, fm);
    for (let j = 2; j < H; j++) {
      const xx = Math.round(S - 2 - ((j - 2) * (S - 6)) / Math.max(1, H - 3));
      sk.rect(xx, top + j, 2, 1, fd);
    }
  } else if (type === 'tube') {
    // buffer tube with a collapsible stock on it
    sk.rect(4, top + 2, S - 4, 3, B[1]).rect(4, top + 2, S - 4, 1, B[3]);
    // the stock body: tall at the butt, sloping down to the tube
    for (let x = 0; x < 9; x++) {
      const y0 = top + Math.max(0, Math.round((x - 3) * 0.5)), y1 = top + H + 1 - Math.round(x * 0.7);
      for (let y = y0; y <= y1; y++) sk.set(x, y, x < 2 ? 'k' : y === y0 ? fl : y >= y1 - 1 ? fd : fm);
    }
    sk.rect(3, top + 4, 4, 1, fd).rect(3, top + 6, 3, 1, fd);   // ridges
    sk.rect(S - 3, top + 1, 2, 5, B[2]);   // castle nut
  } else if (type === 'fold') {
    // folding wire stock: two struts and a pad
    sk.rect(0, top, S, 2, fm).rect(0, top, S, 1, fl);
    sk.rect(0, top + H - 3, S, 2, fm).rect(0, top + H - 3, S, 1, fl);
    sk.rect(0, top, 2, H - 1, 'k');
    sk.rect(S - 2, top, 2, H - 1, fd);   // hinge block
  } else if (type === 'thumb') {
    // precision stock with a thumbhole and an adjustable butt
    sk.rect(0, top, S, H + 2, fm);
    sk.rect(0, top, S, 1, fh).rect(0, top + 1, S, 1, fl);
    sk.rect(0, top + H + 1, S, 1, fd);
    sk.hole(5, top + 3, 4, H - 3);
    sk.rect(0, top, 2, H + 6, 'k').rect(0, top + H + 2, 6, 4, fm).rect(0, top + H + 5, 6, 1, fd);   // butt hook
    texture(sk, 0, top, S, H + 6, furn, 5);
  } else if (type === 'bullpup') {
    sk.shade(0, top, S, H + 2, [fd, fm, fl], 2);
    sk.rect(0, top, S, 1, fh);
    sk.rect(0, top, 2, H + 2, 'k');
    sk.rect(4, top + 3, Math.max(0, S - 8), 1, fd);   // a moulding line
    texture(sk, 0, top, S, H + 2, furn, 7);
  } else if (type === 'pad') {
    sk.rect(0, top + 2, S, 4, fm).rect(0, top + 2, S, 1, fl).rect(0, top + 2, 2, 4, 'k');
  }
}

// --- handguards (x hx..hx+G-1, rows top..top+H-1; gun px) ---
function paintHandguard(sk, type, hx, G, top, H, F, B, furn) {
  const [fd, fm, fl, fh] = F;
  if (type === 'rail') {
    // quad rail: teeth on top and bottom, cooling slots down the side
    sk.rect(hx, top, G, H, 'g');
    for (let i = 0; i < G; i++) {
      sk.set(hx + i, top, i % 3 === 2 ? 'e' : 'd');
      sk.set(hx + i, top + H - 1, i % 3 === 2 ? 'f' : 'e');
    }
    sk.rect(hx, top + 1, G, 1, 'e');
    for (let i = 2; i < G - 2; i += 5) sk.rect(hx + i, top + 3, 3, Math.max(1, H - 5), 'h');
    sk.rect(hx + G - 1, top + 1, 1, H - 2, 'f');
  } else if (type === 'ak') {
    sk.rect(hx, top, G - 2, 2, 'e').rect(hx, top, G - 2, 1, 'd');              // gas tube
    sk.rect(hx, top + 2, G - 4, 2, fl).rect(hx, top + 2, G - 4, 1, fh);         // upper wood
    sk.rect(hx, top + 4, G, H - 4, fm).rect(hx, top + H - 1, G, 1, fd);         // lower wood
    for (let i = 4; i < G - 2; i += 5) sk.set(hx + i, top + H - 2, fd);         // finger grooves
    texture(sk, hx, top + 2, G, H - 2, furn, 9);
  } else if (type === 'wood') {
    sk.rect(hx, top + 2, G, H - 2, fm).rect(hx, top + 2, G, 1, fh).rect(hx, top + 3, G, 1, fl).rect(hx, top + H - 1, G, 1, fd);
    texture(sk, hx, top + 2, G, H - 2, furn, 11);
  } else if (type === 'slim') {
    sk.rect(hx, top + 2, G, H - 3, fm).rect(hx, top + 2, G, 1, fl).rect(hx, top + H - 2, G, 1, fd);
    for (let i = 3; i < G - 2; i += 4) sk.set(hx + i, top + 4, fd).set(hx + i + 1, top + 4, fd);
  } else if (type === 'vent') {
    // shotgun / M60: a vented top rib over a solid handguard
    sk.rect(hx, top, G, 1, fl);
    for (let i = 0; i < G; i++) if (i % 3 !== 1) sk.set(hx + i, top + 1, fm);
    sk.rect(hx, top + 2, G, H - 3, fm).rect(hx, top + 2, G, 1, fl).rect(hx, top + H - 1, G, 1, fd);
  } else if (type === 'shroud') {
    // perforated barrel jacket
    sk.rect(hx, top, G, H, 'e').rect(hx, top, G, 1, 'd').rect(hx, top + H - 1, G, 1, 'f');
    for (let i = 1; i < G - 2; i += 4) for (let j = 2; j < H - 2; j += 3) sk.rect(hx + i, top + j, 2, 2, 'h');
  } else if (type === 'body') {
    // the receiver just carries on (bullpups, boxy SMGs)
    sk.rect(hx, top, G, H, B[2]).rect(hx, top, G, 1, B[4]).rect(hx, top + 1, G, 1, B[3]).rect(hx, top + H - 2, G, 2, B[1]);
    for (let i = 3; i < G - 2; i += 6) sk.set(hx + i, top + H - 3, B[1]);
  }
}

// The bolt carrier seen through the ejection port (px, py, w x h): it fills
// the port and runs on behind it by its travel, so as it slides back the
// front of the port opens up dark (it's clipped to the port when drawn).
// A dark line near its front is the bolt face; a glint runs along the top.
function carrier(sk, px, py, w, h, travel) {
  sk.rect(px - travel, py, w + travel, h, 'd').rect(px - travel, py, w + travel, 1, 'c');
  sk.rect(px + w - 2, py, 1, h, 'f');
  sk.set(px + 1, py, 'l');
}

// Long gun from a spec. See the catalog for what the fields mean.
export function longGun(o) {
  const furn = o.furn ?? 'black', F = FURN[furn], B = BODY[o.body ?? 'black'];
  const [b0, b1, b2, b3, b4] = B;
  const H = W2(o.recH ?? 4), top = 2, bot = top + H;
  const shotgun = !!o.shotgun;
  const cy = shotgun ? top + 1 : top + 2;        // the barrel's top row
  const S = o.stock === 'none' ? 0 : W2(o.stockLen ?? 6);
  const R = W2(o.rec ?? 9), G = o.hg === 'none' ? 0 : W2(o.hgLen ?? 8);
  const rx = S, hx = rx + R, bx = hx + G;
  let mx = bx + W2(o.bar ?? 3);
  const P = {};
  const sk = (n) => (P[n] ??= new Sketch());
  const portX = o.bullpup ? Math.max(4, Math.round(S * 0.6)) : rx + Math.round(R * 0.55);

  // receiver: lit top edge, body, darker belly; pins and a magwell lip
  const rec = sk('receiver');
  rec.rect(rx, top, R, H, b2);
  rec.rect(rx, top, R, 1, b4).rect(rx, top + 1, R, 1, b3);
  rec.rect(rx, top + H - 2, R, 1, b1).rect(rx, top + H - 1, R, 1, b0);
  rec.rect(rx + 2, top + 2, Math.max(2, Math.round(R * 0.3)), 1, b3);   // a glint along the side
  if (R > 10) {
    rec.set(rx + 4, top + H - 4, b4).set(rx + R - 5, top + H - 4, b4);   // takedown pins
    rec.rect(rx + 3, top + H - 3, Math.min(6, R - 6), 1, b1);
  }
  // modern guns: a seam between the upper and lower receiver
  if (!o.classic && !shotgun && o.grip !== 'wrist' && H >= 8) rec.rect(rx + 1, top + H - 3, R - 2, 1, b0);
  // the ejection port (the bolt shows in it)
  const hasBolt = !o.pump && !o.double;
  if (hasBolt && !o.lever) rec.rect(portX - 3, cy, 7, 3, 'h').rect(portX - 3, cy + 3, 7, 1, b3);
  // a flat-top rail on modern rifles
  if (o.topRail) {
    for (let i = 0; i < R - 2; i++) sk('rail').set(rx + 1 + i, top - 1, i % 3 === 2 ? 'f' : 'e');
    sk('rail').rect(rx + 1, top - 2, R - 2, 1, 'd');
  }

  // barrel (runs through the handguard), double barrels, or a fat suppressor
  const thick = o.thick ?? 2;
  if (o.supp) {
    const L = W2(o.bar ?? 8);
    const s = sk('barrel').rect(bx, cy - 2, L, 7, 'g').rect(bx, cy - 2, L, 1, 'd').rect(bx, cy - 1, L, 1, 'e').rect(bx, cy + 4, L, 1, 'f');
    for (let i = 4; i < L - 2; i += 6) s.rect(bx + i, cy - 1, 1, 5, 'f');
    s.rect(bx + L - 1, cy, 1, 3, 'h');
    mx = bx + L;
  } else if (o.double) {
    // two barrels side by side, a rib between
    const b = sk('barrel').rect(hx, cy, mx - hx, 7, 'd');
    b.rect(hx, cy, mx - hx, 1, 'l').rect(hx, cy + 1, mx - hx, 1, 'c').rect(hx, cy + 3, mx - hx, 1, 'f');
    b.rect(hx, cy + 4, mx - hx, 1, 'c').rect(hx, cy + 6, mx - hx, 1, 'e');
    b.rect(mx - 1, cy + 1, 1, 2, 'h').rect(mx - 1, cy + 4, 1, 2, 'h');
  } else {
    const t = thick === 1 ? 2 : thick === 2 ? 3 : 5, ty = thick > 2 ? cy - 1 : cy;
    const b = sk('barrel').rect(hx, ty, mx - hx, t, shotgun ? 'd' : 'e');
    b.rect(hx, ty, mx - hx, 1, shotgun ? 'l' : 'c');
    if (t > 2) b.rect(hx, ty + t - 1, mx - hx, 1, 'f');
    b.set(mx - 1, ty + Math.floor(t / 2), 'h');   // the bore at the crown
    // gas block / front sight base where the handguard ends (rifles)
    if (!shotgun && G > 0 && o.hg !== 'body' && mx - bx > 4) sk('gas').shade(bx + 1, ty - 1, 3, t + 2, ['f', 'e', 'd']);
  }
  const barrelEnd = mx;   // sights go on the barrel, not on what's screwed onto its end
  if (!o.brake && !o.supp && !o.double && !shotgun && o.flash !== false && thick < 3) {
    sk('brake').rect(mx, cy - 1, 5, 5, 'g').rect(mx, cy - 1, 5, 1, 'd').rect(mx + 1, cy, 1, 3, 'h').rect(mx + 3, cy, 1, 3, 'h');
    mx += 5;
  }
  if (o.brake) {
    sk('brake').shade(mx, cy - 2, 6, 7, ['f', 'e', 'c']).rect(mx + 1, cy - 1, 1, 5, 'h').rect(mx + 3, cy - 1, 1, 5, 'h');
    mx += 6;
  }

  // handguard / tube mag / pump
  if (G > 0) paintHandguard(sk('handguard'), o.hg ?? 'rail', hx, G, top + (shotgun ? 2 : 0), H - (shotgun ? 2 : 0), F, B, furn);
  if (shotgun && !o.double && o.mag === 'tube') {
    const L = Math.max(8, mx - hx - 6);
    sk('tube').rect(hx, cy + 4, L, 3, 'e').rect(hx, cy + 4, L, 1, 'd').rect(hx + L - 2, cy + 4, 2, 3, 'c');
  }
  if (o.pump) {
    const n = W2(o.pumpLen ?? 6), px = hx + W2(o.pumpAt ?? 1);
    const p = sk('pump').rect(px, cy + 3, n, 6, F[1]).rect(px, cy + 3, n, 1, F[3]).rect(px, cy + 4, n, 1, F[2]).rect(px, cy + 8, n, 1, F[0]);
    for (let i = 1; i < n - 1; i += 2) p.rect(px + i, cy + 5, 1, 3, F[0]);   // grooves
  }

  // stock
  if (S > 0) paintStock(sk('stock'), o.stock ?? 'solid', S, top, H, F, B, o.drop ?? 0, furn);

  // sights: front post on the handguard's end or out at the muzzle, rear sight, carry handle, bead
  const postX = o.postAtMuzzle || G === 0 ? barrelEnd - 5 : bx - 3;
  if (o.post !== false && !o.carry) sk('post').rows(postX, top - 3, ['.f.', '.f.', 'fef']);
  if (o.bead) sk('post').rect(barrelEnd - 3, cy - 1, 2, 1, 'L');
  if (o.irons) sk('sight').rows(rx + 4, top - 3, ['ff.ff', 'fe.ef', 'eeeee']);
  if (o.carry) {
    const L = W2(o.carryLen ?? (o.rec ?? 9) - 2);
    const c = sk('carry').rect(rx + 2, top - 4, L, 2, b2).rect(rx + 2, top - 4, L, 1, b4);
    c.rect(rx + 2, top - 2, 2, 2, b2).rect(rx + L, top - 2, 2, 2, b2);
    c.rect(rx + 4, top - 2, 3, 1, 'h');   // the rear aperture
    if (o.post !== false) sk('post').rows(bx - 4, top - 4, ['.f.', '.f.', '.f.', 'fef']);
  }

  // grip (stippled), trigger, guard
  const gx = rx + W2(o.gripAt ?? 1);
  const gf = o.gripFurn ?? furn, [fd, fm, fl, fh] = FURN[gf];
  if (o.grip === 'wrist') {
    // classic guns: the stock's wrist runs down to the trigger
    sk('grip').rows(gx - 2, bot, [fh + fl + fl + fm + fm + fm, fd + fm + fm + fm + fm + fd, '.' + fd + fm + fm + fd + '.', '..' + fd + fd + '..']);
    texture(sk('grip'), gx - 2, bot, 6, 4, gf, 13);
  } else {
    const g = sk('grip');
    for (let j = 0; j < 8; j++) {
      const off = Math.floor(j * 0.5);   // raked back
      g.set(gx + off - 1, bot + j, fl).rect(gx + off, bot + j, 3, 1, fm).set(gx + off + 3, bot + j, fd);
      if (j > 1 && j < 7 && (j + off) % 2 === 0) g.set(gx + off + 1, bot + j, fd);   // stipple
    }
    g.rect(gx + 3, bot + 7, 2, 1, fd);
  }
  sk('trigger').rows(gx + 6, bot, ['h', 'h', '.h']);
  if (o.lever) sk('lever').rows(gx + 2, bot, ['.ffffff.', 'f......f', 'f......f', '.ffffff.']);
  else sk('guard').rows(gx + 4, bot, ['.....ff', '......f', 'f.....f', '.fffff.']);

  // magazine
  const magType = o.mag ?? 'stanag';
  let magwell = null;
  const mpal = o.magPal ?? ['e', 'd', 'c'];
  if (magType === 'top') {
    // lies along the top of the receiver (P90)
    const L = W2(o.magLen ?? (o.rec ?? 9) + 4), x0 = o.bullpup ? 4 : rx;
    sk('mag').rect(x0, top - 3, L, 3, 'B').rect(x0, top - 3, L, 1, 'b').rect(x0, top - 3, 2, 3, 'c');
    for (let i = 4; i < L - 2; i += 3) sk('mag').set(x0 + i, top - 1, 'y');   // rounds showing through
    magwell = { x: x0 + L / 2, y: top - 2 };
  } else if (magType === 'helical') {
    sk('mag').rect(hx, bot, G, 5, 'e').rect(hx, bot, G, 1, 'd').rect(hx, bot + 4, G - 2, 1, 'f');
    for (let i = 3; i < G - 2; i += 3) sk('mag').set(hx + i, bot + 2, 'f');
    magwell = { x: hx + G / 2, y: bot };
  } else if (magType === 'grip') {
    paintMag(sk('mag'), 'pistol', gx + 1, bot + 2, o.magN ?? 4, mpal);
    magwell = { x: gx + 3, y: bot + 4 };
  } else if (magType !== 'tube' && magType !== 'none') {
    const mgx = o.bullpup ? Math.max(2, rx - W2(o.magBack ?? 5)) : rx + W2(o.magAt ?? 6);
    const wide = magType === 'beltbox' || magType === 'bigdrum';
    paintMag(sk('mag'), magType, mgx - (wide ? 2 : 0), bot + 2, o.magN ?? 5, mpal);
    if (!wide && magType !== 'beltbox') sk('magwell').rect(mgx - 1, bot, 8, 3, b1).rect(mgx - 1, bot, 8, 1, b2).set(mgx + 6, bot + 1, b3);
    magwell = { x: mgx + 2, y: bot + 2 };
    if (magType === 'beltbox') {
      const belt = sk('belt');
      for (let i = 0; i < 4; i++) belt.rect(mgx + 3 + i * 2, bot - 3, 1, 3, i % 2 ? 'n' : 'y').set(mgx + 3 + i * 2, bot - 3, 'Y');
    }
  }
  magwell ??= { x: gx + 8, y: bot };

  // fixed foregrip, bipod, cheek riser
  const fgx = hx + W2(o.fgripAt ?? 2);
  if (o.fgrip) sk('fgrip').shade(fgx, bot, 4, 8, [F[0], F[1], F[2]]).rect(fgx + 3, bot, 1, 8, F[0]);
  if (o.bipod) {
    const bx0 = mx - W2(o.bipodBack ?? 9), by = bot - 2 + (G > 0 ? 2 : 0);
    sk('bipod').rect(bx0, by, 12, 2, 'f').rect(bx0, by, 12, 1, 'e').rect(bx0 + 10, by - 1, 3, 4, 'g');
  }
  if (o.cheek && S > 0) sk('cheek').rect(4, top - 2, S - 6, 2, F[2]).rect(4, top - 2, S - 6, 1, F[3]);

  // action: bolt carrier in the port + charging handle; a bolt handle for bolt guns
  let bolt = null, handlePt = null;
  if (o.action === 'bolt') {
    sk('bolt').rect(portX - 3, cy, 7, 2, 'l').rect(portX - 3, cy, 7, 1, 'S');
    sk('bolt').rect(portX + 2, cy + 2, 1, H - 1, 'c').rect(portX + 1, top + H, 4, 3, 'd').rect(portX + 1, top + H, 4, 1, 'l');   // handle + knob
    handlePt = { x: portX + 3, y: top + H + 3 };
    bolt = { travel: 8, manual: true };
  } else if (o.lever) {
    sk('bolt').rect(portX - 2, cy, 6, 2, 'l').rect(portX - 2, cy, 6, 1, 'S');
    bolt = { travel: 6, manual: true };
  } else if (hasBolt) {
    const travel = W2(o.boltTravel ?? 2);
    carrier(sk('bolt'), portX - 3, cy, 7, 3, travel);
    bolt = { travel };
    // a side charging handle (AK, HK, MP5...) sticks out of the carrier just behind the port and rides with it;
    // otherwise a T-handle at the back of the receiver's top
    if (o.handle === 'side') sk('handle').rect(portX - 7, cy, 4, 3, 'd').rect(portX - 7, cy, 4, 1, 'l').set(portX - 7, cy + 2, 'e');
    else if (o.handle !== 'none') sk('handle').rect(o.bullpup ? 2 : rx, top - 2, 5, 2, 'c').rect(o.bullpup ? 2 : rx, top - 2, 5, 1, 'l');
  }

  // a top mag (P90) lies on the receiver, so it has to go over it
  const order = ['barrel', 'gas', 'tube', magType === 'top' ? null : 'mag', 'magwell', 'stock', 'cheek', 'handguard', 'post', 'brake', 'receiver', 'rail', 'belt', 'grip', 'guard', 'trigger', 'lever', 'fgrip', 'bipod', 'carry', 'bolt', 'handle', 'sight', 'pump', magType === 'top' ? 'mag' : null]
    .filter((n) => n && P[n] && !P[n].empty);
  const parts = {};
  for (const n of order) parts[n] = P[n].part();

  const gripPt = o.grip === 'wrist' ? { x: gx + 2, y: bot + 1 } : { x: gx + 2, y: bot + 2 };
  const support = o.pump
    ? { x: hx + W2(o.pumpAt ?? 1) + W2(o.pumpLen ?? 6) / 2, y: cy + 7 }
    : o.fgrip ? { x: fgx + 2, y: bot + 3 } : { x: G > 0 ? hx + G * 0.55 : hx + 2, y: bot + 1 };
  const sightY = o.carry ? top - 6 : o.topRail ? top - 3 : top - 2;
  const slots = { sight: { x: rx + Math.min(8, R - 4), y: sightY }, muzzle: { x: mx, y: cy + (thick > 2 ? 1 : 1) } };
  if (G >= 10 && !o.fgrip && !o.pump && !shotgun) slots.under = { x: hx + 6, y: bot };
  if (['stanag', 'curve', 'straight', 'box'].includes(magType)) slots.mag = true;
  if (['solid', 'wood', 'skel', 'tube', 'fold', 'thumb'].includes(o.stock ?? 'solid') && S > 0) slots.stock = true;
  if (o.supp) delete slots.muzzle;
  // classic guns don't take modern bolt-ons: no foregrips, rail lights, swapped
  // stocks - and a classic shotgun no optics or muzzle devices either
  if (o.noUnder) delete slots.under;
  if (o.classic) {
    delete slots.under;
    delete slots.stock;
    if (shotgun) {
      delete slots.sight;
      delete slots.muzzle;
    }
  }

  const art = {
    parts,
    order,
    points: {
      grip: gripPt,
      support,
      magwell,
      muzzle: { x: mx, y: cy + 1.5 },
      light: { x: Math.max(hx, bx - 2), y: bot - 1 },
      port: { x: portX, y: cy },
      trigger: { x: gx + 6, y: bot },
    },
    slots,
  };
  if (handlePt) art.points.handle = handlePt;
  if (bolt) art.bolt = bolt;
  if (hasBolt && !o.lever && o.action !== 'bolt') art.port = { x: portX - 3, y: cy, w: 7, h: 3 };   // where the carrier shows
  if (o.handle === 'side' && P.handle) art.handleRides = true;
  if (o.pump) art.pump = { travel: 8 };
  if (o.lever) art.lever = { pivot: { x: gx + 11, y: bot + 1 } };
  if (o.double) {
    // break action: the barrels swing down on a hinge under their back end
    art.hinge = { x: hx, y: cy + 8 };
    art.breakParts = ['barrel'];
    art.points.breech = { x: hx + 2, y: cy + 3 };
  }
  if (magType === 'top') art.magDir = -1;
  if (o.classic || o.noRail) art.noRail = true;
  if (shotgun) art.shell = { w: 2, h: 1, color: '#c23a2e' };
  return art;
}

// Handgun from a spec: slide pistols, revolvers and boxy machine pistols.
export function handgun(o) {
  const L = W2(o.len ?? 10), T = W2(o.tall ?? 0);   // slide length; extra slide height (big pistols)
  const P = {};
  const sk = (n) => (P[n] ??= new Sketch());
  const S = BODY[o.body ?? 'black'], furn = o.furn ?? 'black', F = FURN[furn];
  const gf = o.gripFurn ?? furn, [fd, fm, fl, fh] = FURN[gf];
  const art = { points: {}, slots: {} };
  const finish = (order) => {
    order = order.filter((n) => P[n] && !P[n].empty);
    art.parts = Object.fromEntries(order.map((n) => [n, P[n].part()]));
    art.order = order;
  };
  // a pistol grip, raked back, with panels / stippling
  const grip = (x, y, n = 8) => {
    const g = sk('grip');
    for (let j = 0; j < n; j++) {
      const off = Math.floor(j * 0.35);
      g.set(x - off, y + j, fl).rect(x - off + 1, y + j, 4, 1, fm).set(x - off + 5, y + j, fd);
      if (j > 0 && j < n - 1 && (j + off) % 2 === 0 && gf !== 'wood') g.set(x - off + 2, y + j, fd).set(x - off + 4, y + j, fd);
    }
    if (gf === 'wood') { g.rect(x + 1, y + 1, 3, n - 3, fh); texture(g, x - 3, y, 9, n, 'wood', 17); g.set(x + 2, y + 2, 'c'); }   // a wood panel with a screw
  };

  if (o.revolver) {
    const bl = W2(o.bar ?? 7);
    const [s0, s1, s2, s3, s4] = S;
    sk('frame').rect(2, 2, 16, 8, s2).rect(2, 2, 16, 1, s4).rect(2, 3, 16, 1, s3).rect(2, 8, 16, 2, s1).set(4, 4, s4);
    // the cylinder: fluted, lit along the top
    const c = sk('cyl').rect(8, 2, 10, 8, 'd').rect(8, 2, 10, 1, 'l').rect(8, 3, 10, 1, 'c').rect(8, 9, 10, 1, 'f');
    for (let i = 9; i < 18; i += 3) c.rect(i, 4, 1, 4, 'f');
    // barrel with a top rib, ejector rod under it
    const b = sk('barrel').rect(18, 2, bl, 4, s2).rect(18, 2, bl, 1, s4).rect(18, 3, bl, 1, s3).rect(18, 5, bl, 1, s1);
    b.rect(18, 6, bl - 4, 2, s1).rect(18, 6, bl - 4, 1, s3).set(17 + bl, 0, 'f').set(17 + bl, 1, 'f').set(17 + bl, 3, 'h');
    sk('hammer').rows(0, 0, ['ff..', '.ff.', '..f.']);
    grip(1, 10, 8);
    sk('trigger').rows(9, 10, ['h', 'h', '.h']);
    sk('guard').rows(6, 10, ['.....ff', '......f', 'f.....f', '.fffff.']);
    finish(['grip', 'frame', 'barrel', 'cyl', 'hammer', 'guard', 'trigger']);
    Object.assign(art.points, { grip: { x: 3, y: 12 }, support: { x: 3, y: 17 }, magwell: { x: 12, y: 8 }, muzzle: { x: 18 + bl, y: 3.5 }, light: { x: 16 + bl, y: 7 }, port: { x: 12, y: 2 }, trigger: { x: 9, y: 10 } });
    art.slots = { sight: { x: 12, y: 0 } };
    art.revolver = true;
    // top-break: barrel and cylinder tip down on a hinge at the front of the frame
    art.hinge = { x: 17, y: 9 };
    art.breakParts = ['barrel', 'cyl'];
    art.points.breech = { x: 8, y: 5 };
    return art;
  }

  if (o.box) {
    // machine pistol: a boxy stamped receiver with the bolt on top, mag in the grip (or ahead of it)
    const [s0, s1, s2, s3, s4] = S;
    const r = sk('receiver').rect(0, 0, L, 10, s2).rect(0, 0, L, 1, s4).rect(0, 1, L, 1, s3).rect(0, 8, L, 2, s1);
    r.rect(2, 4, L - 6, 1, s1).set(3, 6, s4).set(L - 4, 6, s4);   // a pressed line, rivets
    r.rect(Math.round(L * 0.55) - 2, 2, 6, 3, 'h');                // ejection port
    const bl = W2(o.bar ?? 3);
    if (o.shroud) {
      const n = W2(o.shroud);
      sk('barrel').rect(L, 2, n + bl, 4, 'e').rect(L, 2, n + bl, 1, 'c').set(L + n + bl - 1, 3, 'h');
      const s = sk('shroud').rect(L, 0, n, 8, 'e').rect(L, 0, n, 1, 'd').rect(L, 7, n, 1, 'f');
      for (let i = 1; i < n - 1; i += 3) s.rect(L + i, 2, 2, 2, 'h').rect(L + i, 5, 2, 1, 'h');
    } else sk('barrel').rect(L, 2, bl, 3, 'e').rect(L, 2, bl, 1, 'c').set(L + bl - 1, 3, 'h');
    const mx = L + W2(o.shroud ?? 0) + bl;
    grip(3, 10, 8);
    sk('trigger').rows(9, 10, ['h', 'h', '.h']);
    sk('guard').rows(6, 10, ['.....ff', '......f', 'f.....f', '.fffff.']);
    const front = !!o.magFront;
    if (front) paintMag(sk('mag'), 'straight', 10, 10, o.magN ?? 5, ['e', 'd', 'c']);
    else paintMag(sk('mag'), 'pistol', 3, 12, 4, ['e', 'd', 'c']);
    carrier(sk('bolt'), Math.round(L * 0.55) - 2, 2, 6, 3, 4);
    sk('handle').rect(3, -2, 4, 2, 'c').rect(3, -2, 4, 1, 'l');
    art.port = { x: Math.round(L * 0.55) - 2, y: 2, w: 6, h: 3 };
    if (o.stub) sk('stock').rect(-4, 2, 4, 4, F[1]).rect(-4, 2, 4, 1, F[2]);
    finish(['mag', 'barrel', 'stock', 'receiver', 'shroud', 'grip', 'guard', 'trigger', 'bolt', 'handle']);
    Object.assign(art.points, {
      grip: { x: 4, y: 12 }, support: front ? { x: 13, y: 15 } : { x: 4, y: 17 }, magwell: front ? { x: 12, y: 10 } : { x: 4, y: 16 },
      muzzle: { x: mx, y: 3.5 }, light: { x: L - 2, y: 9 }, port: { x: Math.round(L * 0.55), y: 2 }, trigger: { x: 9, y: 10 },
    });
    art.slots = { sight: { x: Math.round(L / 2), y: -2 }, muzzle: { x: mx, y: 2 }, mag: true };
    art.bolt = { travel: 4 };
    return art;
  }

  // slide pistol: serrations at the back, an ejection port, sights front and back
  const [s0, s1, s2, s3, s4] = S;
  const SH = 6 + T;   // slide height
  const sl = sk('slide').rect(0, 0, L, SH, s2).rect(0, 0, L, 1, s4).rect(0, 1, L, 1, s3).rect(0, SH - 1, L, 1, s1);
  for (let i = 1; i < 7; i += 2) sl.rect(i, 2, 1, SH - 3, s1);           // rear serrations
  if (o.port !== false) sl.rect(Math.round(L * 0.55), 1, 5, 2, 'h');       // ejection port
  sl.rows(1, -1, ['f.f']).set(L - 3, -1, o.dot ? 'r' : 'f');               // rear notch, front post
  if (o.dot) sl.set(2, -1, 'L');
  sl.rect(L - 2, 2, 1, SH - 3, s1);                                          // the slide's front edge
  const fy = SH;   // frame top
  const fr = sk('frame').rect(4, fy, L - 4, 3, F[1]).rect(4, fy, L - 4, 1, F[2]).rect(L - 2, fy, 2, 3, F[0]);
  if (o.rail) for (let i = 0; i < 6; i++) fr.set(L - 9 + i, fy + 2, i % 2 ? F[0] : 'h');
  sk('barrel').rect(L - 2, SH - 4, 4, 3, 'd').rect(L - 2, SH - 4, 4, 1, 'c').set(L + 1, SH - 3, 'h');
  if (o.comp) sk('comp').shade(L, -1, 6, SH + 1, ['e', 'd', 'c']).rect(L + 2, 1, 2, 2, 'h');
  grip(2, fy + 3, o.gripN ? o.gripN * 2 : 8);
  if (o.hammer) sk('hammer').rows(-2, 1, ['ff', 'ff', '.f']);
  sk('trigger').rows(10, fy + 3, ['h', 'h', '.h']);
  sk('guard').rows(7, fy + 3, ['.....ff', '......f', 'f.....f', '.fffff.']);
  paintMag(sk('mag'), 'pistol', 2, fy + 6, (o.magN ?? 3) + 1, ['e', 'd', 'c']);
  finish(['mag', 'barrel', 'frame', 'grip', 'guard', 'trigger', 'hammer', 'slide', 'comp']);
  const mx = L + 2 + (o.comp ? 6 : 0);
  Object.assign(art.points, {
    grip: { x: 4, y: fy + 5 }, support: { x: 4, y: fy + 10 }, magwell: { x: 4, y: fy + 9 },
    muzzle: { x: mx, y: SH - 2.5 }, light: { x: L - 1, y: fy + 3 }, port: { x: Math.round(L * 0.55) + 2, y: 1 }, trigger: { x: 10, y: fy + 3 },
  });
  art.slots = { sight: { x: Math.round(L / 2), y: -1 }, mag: true };
  if (!o.comp) art.slots.muzzle = { x: mx, y: SH - 4 };
  art.slide = { travel: 6 };
  return art;
}
