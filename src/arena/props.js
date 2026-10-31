// Props: the things standing about a map - crates, drums, furniture - and
// all of them break. Each kind has a size, how much it takes, what it's made
// of (what flies off when it breaks), whether you can stand on it / it blocks
// you (`block`), and its art. They have weight: knocked by blasts and hits,
// they slide and fall, land on floors, catwalks and each other.

import { makeCanvas, rect } from '../engine/pixel.js';
import { T, SOLID, PLAT, ACID, LADDER } from './level.js';

const K = '#0b100f';
const hash = (x, y) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// what flies off when it breaks
export const DEBRIS = {
  wood: ['#6e4426', '#93613a', '#4a2f19', '#b37a4a'],
  metal: ['#4d5d55', '#6e7f76', '#36433d', '#8a9690'],
  glass: ['#a8e6fb', '#e8f8ff', '#6cd0f2', '#2a3a40'],
  cloth: ['#8a7a5a', '#a8946a', '#6a5a40', '#c8b48a'],
  plastic: ['#d8dce0', '#a8b0b8', '#6cd0f2', '#e8ecf0'],
  red: ['#a8322a', '#d2503e', '#6e1e18', '#e8c040'],
};

// kind: [w, h, hp, material, block, draw(g, w, h)]
const KINDS = {
  crate: [14, 14, 90, 'metal', true, (g) => {
    rect(g, K, 0, 0, 14, 14); rect(g, '#4d5d55', 1, 1, 12, 12); rect(g, '#6e7f76', 1, 1, 12, 2); rect(g, '#36433d', 1, 11, 12, 2);
    for (let i = 0; i < 12; i += 3) rect(g, (i / 3) % 2 ? '#1b1f1c' : '#c9a83a', 1 + i, 6, 3, 2);
    rect(g, '#8a9690', 2, 3, 1, 1); rect(g, '#8a9690', 11, 3, 1, 1); rect(g, '#2b3632', 2, 9, 10, 1);
  }],
  wcrate: [14, 14, 40, 'wood', true, (g) => {
    rect(g, K, 0, 0, 14, 14); rect(g, '#93613a', 1, 1, 12, 12);
    for (let j = 1; j < 13; j += 4) { rect(g, '#6e4426', 1, j + 3, 12, 1); rect(g, '#b37a4a', 1, j, 12, 1); }
    rect(g, '#4a2f19', 1, 1, 2, 12); rect(g, '#4a2f19', 11, 1, 2, 12);
    for (let i = 0; i < 10; i++) rect(g, '#5a3a20', 2 + i, 2 + i, 1, 1);   // the diagonal brace
    rect(g, '#c8a070', 4, 5, 6, 3); rect(g, '#4a2f19', 5, 6, 4, 1);         // a stencilled label
  }],
  barrel: [12, 16, 28, 'red', true, (g) => {
    rect(g, K, 1, 0, 10, 16); rect(g, K, 0, 1, 12, 14); rect(g, '#a8322a', 1, 1, 10, 14); rect(g, '#d2503e', 2, 1, 2, 14);
    rect(g, '#6e1e18', 1, 4, 10, 1); rect(g, '#6e1e18', 1, 11, 10, 1); rect(g, '#e8c040', 4, 6, 4, 4); rect(g, '#1b1f1c', 5, 7, 2, 2); rect(g, '#c8cfc9', 3, 0, 6, 1);
  }],
  table: [30, 12, 70, 'metal', true, (g) => {
    rect(g, K, 0, 0, 30, 4); rect(g, '#b8c4c0', 1, 1, 28, 1); rect(g, '#7a8884', 1, 2, 28, 1);
    rect(g, K, 2, 3, 3, 9); rect(g, '#6a7874', 3, 4, 1, 8); rect(g, K, 25, 3, 3, 9); rect(g, '#6a7874', 26, 4, 1, 8);
    rect(g, K, 2, 7, 26, 2); rect(g, '#4a5652', 3, 7, 24, 1);   // the shelf under it
    rect(g, '#3df07a', 8, 0, 2, 1); rect(g, '#d8e0dc', 14, -1, 4, 1);
  }],
  desk: [30, 13, 55, 'wood', true, (g) => {
    rect(g, K, 0, 0, 30, 4); rect(g, '#a8784a', 1, 1, 28, 2); rect(g, '#c8986a', 1, 1, 28, 1);
    rect(g, K, 18, 3, 11, 10); rect(g, '#8a603a', 19, 4, 9, 8); rect(g, K, 19, 7, 9, 1); rect(g, '#d8c8a8', 23, 5, 2, 1); rect(g, '#d8c8a8', 23, 9, 2, 1);   // drawers
    rect(g, K, 1, 3, 3, 10); rect(g, '#7a5232', 2, 4, 1, 9);
  }],
  chair: [10, 14, 18, 'plastic', false, (g) => {
    rect(g, K, 0, 0, 4, 9); rect(g, '#3a4a6a', 1, 1, 2, 7);           // the back
    rect(g, K, 0, 7, 10, 3); rect(g, '#4a5a7a', 1, 8, 8, 1);           // the seat
    rect(g, K, 4, 9, 2, 4); rect(g, K, 1, 12, 8, 2); rect(g, '#2a2a2a', 2, 13, 1, 1); rect(g, '#2a2a2a', 7, 13, 1, 1);
  }],
  locker: [14, 30, 120, 'metal', true, (g) => {
    rect(g, K, 0, 0, 14, 30); rect(g, '#5a6a7a', 1, 1, 12, 28); rect(g, '#7a8a9a', 1, 1, 12, 1); rect(g, K, 7, 1, 1, 28);
    for (let j = 3; j < 9; j += 2) { rect(g, '#2a3a4a', 2, j, 4, 1); rect(g, '#2a3a4a', 9, j, 4, 1); }
    rect(g, '#c8d0d8', 5, 14, 1, 3); rect(g, '#c8d0d8', 9, 14, 1, 3);
  }],
  cabinet: [12, 20, 80, 'metal', true, (g) => {
    rect(g, K, 0, 0, 12, 20); rect(g, '#6a7072', 1, 1, 10, 18); rect(g, '#8a9092', 1, 1, 10, 1);
    for (let j = 1; j < 19; j += 6) { rect(g, K, 1, j + 5, 10, 1); rect(g, '#c8ccd0', 4, j + 2, 4, 1); }
  }],
  bookshelf: [26, 30, 70, 'wood', true, (g) => {
    rect(g, K, 0, 0, 26, 30); rect(g, '#6e4426', 1, 1, 24, 28);
    const cols = ['#a83a2a', '#3a6aa8', '#3a8a4a', '#c8a03a', '#7a3a8a', '#d8d0c0'];
    for (let j = 2; j < 28; j += 9) {
      rect(g, '#4a2f19', 1, j + 7, 24, 1);
      for (let i = 2; i < 24; i += 2) if (hash(i, j) < 0.85) rect(g, cols[(hash(j, i) * 6) | 0], i, j + 1 + ((hash(i, i + j) * 2) | 0), 2, 6 - ((hash(i, i + j) * 2) | 0));
    }
  }],
  monitor: [12, 9, 10, 'glass', false, (g) => {
    rect(g, K, 0, 0, 12, 8); rect(g, '#2a3438', 1, 1, 10, 6); rect(g, '#2a6a8a', 2, 2, 8, 4); rect(g, '#8ae0f8', 2, 2, 3, 1);
    rect(g, K, 5, 7, 2, 2); rect(g, K, 3, 8, 6, 1);
  }],
  pallet: [22, 4, 30, 'wood', true, (g) => {
    rect(g, K, 0, 0, 22, 4); rect(g, '#a87a4a', 1, 0, 20, 1); rect(g, '#7a5232', 1, 1, 20, 1);
    for (const x of [1, 10, 19]) rect(g, '#93613a', x, 2, 2, 2);
  }],
  sandbags: [24, 10, 220, 'cloth', true, (g) => {
    for (const [x, y] of [[0, 4], [8, 4], [16, 4], [4, 0], [12, 0]]) { rect(g, K, x, y, 8, 6); rect(g, '#a8946a', x + 1, y + 1, 6, 4); rect(g, '#c8b48a', x + 1, y + 1, 6, 1); rect(g, '#6a5a40', x + 3, y + 4, 2, 1); }
  }],
  ac: [22, 16, 140, 'metal', true, (g) => {
    rect(g, K, 0, 0, 22, 16); rect(g, '#8a9094', 1, 1, 20, 14); rect(g, '#a8b0b4', 1, 1, 20, 1);
    rect(g, K, 3, 3, 10, 10); rect(g, '#3a4044', 4, 4, 8, 8); for (let i = 0; i < 4; i++) rect(g, '#6a7074', 5 + i * 2, 5, 1, 6);
    for (let j = 4; j < 13; j += 2) rect(g, '#5a6064', 15, j, 5, 1);
  }],
  cooler: [9, 22, 20, 'plastic', false, (g) => {
    rect(g, K, 1, 0, 7, 9); rect(g, '#6cc0e8', 2, 1, 5, 7); rect(g, '#a8e6fb', 2, 1, 2, 5);
    rect(g, K, 0, 9, 9, 13); rect(g, '#e8ecf0', 1, 10, 7, 11); rect(g, '#3a6ac8', 3, 12, 1, 2); rect(g, '#c83a3a', 5, 12, 1, 2);
  }],
  pipes: [30, 8, 300, 'metal', true, (g) => {
    for (const [x, y] of [[0, 4], [10, 4], [20, 4], [5, 0], [15, 0]]) { rect(g, K, x, y, 10, 4); rect(g, '#6a7276', x + 1, y + 1, 8, 2); rect(g, '#9aa2a6', x + 1, y + 1, 8, 1); rect(g, '#2a2e30', x, y + 1, 1, 2); }
  }],
  toolbox: [12, 7, 30, 'red', false, (g) => {
    rect(g, K, 0, 2, 12, 5); rect(g, '#c83a2a', 1, 3, 10, 3); rect(g, '#e85a4a', 1, 3, 10, 1); rect(g, K, 4, 0, 4, 3); rect(g, '#8a8a8a', 5, 1, 2, 1);
  }],
};
export const PROP_KINDS = Object.keys(KINDS);

const ART = {};
function art(kind) {
  if (ART[kind]) return ART[kind];
  const [w, h, , , , draw] = KINDS[kind];
  const [c, g] = makeCanvas(w, h + 1);
  g.translate(0, 1);   // (a pixel spare on top for things sitting proud, like a beaker on a table)
  draw(g, w, h);
  const [wc, wg] = makeCanvas(w, h + 1);   // white, for the hit flash
  wg.drawImage(c, 0, 0);
  wg.globalCompositeOperation = 'source-atop';
  wg.fillStyle = '#ffffff';
  wg.fillRect(0, 0, w, h + 1);
  return (ART[kind] = [c, wc]);
}

export class Prop {
  constructor(kind, x, y) {
    const [w, h, hp, material, block] = KINDS[kind] ?? KINDS.crate;
    Object.assign(this, { kind, x, y, w, h, hp, maxHp: hp, material, solid: block, block, vx: 0, vy: 0, rot: 0, flash: 0, fuse: -1, dead: false, resting: false });
    this.explosive = kind === 'barrel';
  }
  get box() {
    return { l: this.x - this.w / 2, r: this.x + this.w / 2, t: this.y - this.h, b: this.y };
  }
  contains(px, py) {
    return px >= this.x - this.w / 2 && px <= this.x + this.w / 2 && py >= this.y - this.h && py <= this.y;
  }

  // Knocked about (a blast, a hard hit): a shove, a hop up.
  push(vx, vy) {
    const k = this.block ? 0.5 : 1;   // the big heavy things move less
    this.vx += vx * k;
    this.vy += vy * k;
    this.resting = false;
  }

  // Falls, slides, lands on floors, catwalks and other props.
  update(dt, level, props) {
    this.flash -= dt;
    if (this.resting && Math.abs(this.vx) < 1) {
      // still resting on something? (the crate under it may have broken)
      if (this.support(level, props, this.y, this.y + 1) !== null) return;
      this.resting = false;
    }
    this.vy = Math.min(500, this.vy + 900 * dt);
    this.vx *= Math.exp(-(this.support(level, props, this.y, this.y + 1) !== null ? 6 : 0.5) * dt);
    // sideways: walls stop it
    const nx = this.x + this.vx * dt, side = nx + Math.sign(this.vx) * this.w / 2;
    if (this.vx && (level.solidAt(side, this.y - 2) || level.solidAt(side, this.y - this.h + 1))) this.vx *= -0.3;
    else this.x = nx;
    // down: onto whatever's under it
    const ny = this.y + this.vy * dt;
    const top = this.vy > 0 ? this.support(level, props, this.y, ny) : null;
    if (top !== null) {
      this.y = top;
      if (this.vy > 220) { this.vy *= -0.2; this.landed = this.vy; }
      else { this.vy = 0; if (Math.abs(this.vx) < 4) { this.vx = 0; this.resting = true; } }
    } else this.y = ny;
    if (this.y > level.h * T + 64) this.dead = true;   // fell off the map
    if (level.get(Math.floor(this.x / T), Math.floor((this.y - 1) / T)) === ACID) this.dissolve = true;
  }

  // The top of what holds it up, crossed going from feet y0 down to y1 (or null).
  support(level, props, y0, y1) {
    for (let cy = Math.floor(y0 / T); cy <= Math.floor(y1 / T); cy++) {
      const top = cy * T;
      if (top < y0 - 0.5 || top > y1) continue;
      for (const px of [this.x - this.w / 2 + 2, this.x, this.x + this.w / 2 - 2]) {
        const v = level.get(Math.floor(px / T), cy);
        if (v === SOLID || v === PLAT) return top;
      }
    }
    for (const p of props) {
      if (p === this || p.dead || !p.block || Math.abs(p.x - this.x) > (p.w + this.w) / 2 - 2) continue;
      const top = p.y - p.h;
      if (top >= y0 - 0.5 && top <= y1) return top;
    }
    return null;
  }

  draw(ctx) {
    const [img, white] = art(this.kind);
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));
    if (this.rot) ctx.rotate(this.rot);
    ctx.drawImage(this.flash > 0 ? white : img, -Math.round(this.w / 2), -this.h - 1);
    // cracks once it's taken a beating
    const dmg = 1 - this.hp / this.maxHp;
    if (dmg > 0.35) {
      ctx.fillStyle = 'rgba(10, 8, 6, 0.6)';
      const n = dmg > 0.7 ? 4 : 2;
      for (let i = 0; i < n; i++) {
        let cx = -this.w / 2 + 2 + ((hash(i, this.w) * (this.w - 4)) | 0), cy = -this.h + 2 + ((hash(this.h, i) * (this.h - 4)) | 0);
        for (let s = 0; s < 4; s++) { ctx.fillRect(cx, cy, 1, 1); cx += hash(i, s) < 0.5 ? 1 : -1; cy += 1; }
      }
    }
    ctx.restore();
  }
}

// Lay out a map's props: anything placed overlapping one placed before it sits on top of it.
// (level: given, nothing's left hanging over a ladder - it's shifted off it,
// so whoever climbs up through the hole doesn't hit their head on it)
export function placeProps(list, level = null) {
  const props = [];
  for (const d of list) {
    const p = new Prop(d.kind, d.x, d.y);
    if (level) for (let tries = 0; tries < 4; tries++) {
      const b = p.box, row = Math.floor((p.y - 0.5) / T) + 1;   // the floor it stands on
      let lad = null;
      for (let cx = Math.floor(b.l / T); cx <= Math.floor((b.r - 0.01) / T) && lad === null; cx++) {
        for (let cy = Math.floor(b.t / T); cy <= row; cy++) if (level.get(cx, cy) === LADDER) { lad = cx; break; }
      }
      if (lad === null) break;
      p.x = p.x > (lad + 0.5) * T ? (lad + 1) * T + p.w / 2 + 1 : lad * T - p.w / 2 - 1;
    }
    let moved = true;
    while (moved) {
      moved = false;
      for (const q of props) if (q.block && Math.abs(q.x - p.x) < (q.w + p.w) / 2 - 1 && p.y > q.y - q.h && p.y - p.h < q.y) { p.y = q.y - q.h; moved = true; }
    }
    props.push(p);
  }
  return props;
}
