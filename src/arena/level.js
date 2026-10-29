// The arena level, seen from the side: a research lab cut open like a doll's
// house - three floors of labs over an acid vat. Solid blocks, catwalks you
// can jump up through (and drop down through), ladders, hanging lamps,
// specimen tanks, monitors and pipes on the back wall.
//
// The map is built in code (rect / catwalk / ladder calls) so it's easy to
// read and change. It's drawn once into layers: the far background (parallax),
// the back wall with its fittings, and the front (blocks, catwalks, ladders).

import { makeCanvas, rect } from '../engine/pixel.js';

export const T = 16;
export const W = 48, H = 27;
export const EMPTY = 0, SOLID = 1, PLAT = 2, LADDER = 3, ACID = 4;

const hash = (x, y, s = 0) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export class Level {
  constructor() {
    this.w = W;
    this.h = H;
    this.grid = new Uint8Array(W * H);
    this.lamps = [];      // { x, y } bulb positions (they hang from the ceiling)
    this.deco = [];       // back-wall fittings: { kind, x, y } in cells
    this.props = [];      // crates / barrels: { kind, x, y } (feet), made into Props by the game
    this.spawns = [];
    this.drops = [];      // where weapon crates fall from
    this.build();
    this.render();
  }

  get(x, y) {
    if (x < 0 || x >= W) return SOLID;
    if (y < 0) return EMPTY;
    if (y >= H) return SOLID;
    return this.grid[y * W + x];
  }
  set(x, y, v) {
    if (x >= 0 && y >= 0 && x < W && y < H) this.grid[y * W + x] = v;
  }
  fill(x0, y0, x1, y1, v) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, v);
  }
  solidAt(px, py) {
    return this.get(Math.floor(px / T), Math.floor(py / T)) === SOLID;
  }

  build() {
    const F = (y, x0, x1, v = SOLID) => this.fill(x0, y, x1, y, v);
    // the shell
    this.fill(0, 0, W - 1, 0, SOLID);
    this.fill(0, H - 1, W - 1, H - 1, SOLID);
    this.fill(0, 0, 0, H - 1, SOLID);
    this.fill(W - 1, 0, W - 1, H - 1, SOLID);
    // floor A (top labs)
    F(7, 1, 46);
    F(7, 14, 17, PLAT); F(7, 22, 25, EMPTY); F(7, 30, 33, PLAT);
    F(8, 1, 3); F(8, 44, 46);
    // floor B (middle)
    F(13, 1, 46);
    F(13, 19, 28, PLAT);
    F(13, 3, 4, EMPTY);
    F(13, 43, 44, EMPTY);
    // floor C (lower), open over the vat
    F(19, 1, 16); F(19, 31, 46);
    F(19, 19, 28, PLAT);
    // the bottom: side floors, curbs, and the acid vat between them
    F(25, 1, 16); F(25, 31, 46);
    F(24, 16, 16); F(24, 31, 31);
    F(25, 17, 30, ACID);
    // catwalks
    F(4, 5, 9, PLAT); F(4, 38, 42, PLAT);
    F(10, 15, 18, PLAT); F(10, 29, 32, PLAT);
    F(16, 4, 8, PLAT); F(16, 39, 43, PLAT);
    F(22, 20, 27, PLAT);
    F(22, 6, 10, PLAT); F(22, 37, 41, PLAT);
    // pillars for cover
    this.fill(23, 10, 24, 12, SOLID);
    this.fill(11, 2, 11, 3, SOLID);
    this.fill(36, 2, 36, 3, SOLID);
    // ladders (through the floors)
    const ladder = (x, y0, y1) => this.fill(x, y0, x, y1, LADDER);
    ladder(6, 7, 12); ladder(41, 7, 12);
    ladder(11, 13, 18); ladder(36, 13, 18);
    ladder(7, 19, 24); ladder(40, 19, 24);
    ladder(2, 1, 6);

    // lamps under each ceiling
    // (each hangs from a solid ceiling, well clear of the ladders)
    for (const [x, y] of [[9, 1], [24, 1], [39, 1], [10, 8], [19, 8], [28, 8], [37, 8], [6, 14], [15, 14], [24, 14], [32, 14], [41, 14], [11, 20], [22, 20], [36, 20]]) {
      const ceil = this.get(x, y - 1), nearLadder = [-1, 0, 1].some((d) => [y - 1, y, y + 1].some((yy) => this.get(x + d, yy) === LADDER));
      if ((ceil !== SOLID && ceil !== PLAT) || nearLadder) console.warn('lamp misplaced', x, y);
      this.lamps.push({ cx: x, cy: y });
    }
    // fittings on the back wall
    this.deco.push(
      { kind: 'monitors', x: 13, y: 2 }, { kind: 'monitors', x: 29, y: 2 },
      { kind: 'server', x: 44, y: 1 }, { kind: 'server', x: 3, y: 9 },
      { kind: 'tank', x: 19, y: 14 }, { kind: 'tank', x: 26, y: 14 },
      { kind: 'tank', x: 2, y: 20 }, { kind: 'tank', x: 44, y: 20 },
      { kind: 'reactor', x: 21, y: 1 },
      { kind: 'sign', x: 17, y: 9, text: 'LAB-07' }, { kind: 'sign', x: 34, y: 9, text: 'BIOHAZARD' },
      { kind: 'vent', x: 8, y: 9 }, { kind: 'vent', x: 38, y: 15 }, { kind: 'vent', x: 30, y: 4 },
      { kind: 'window', x: 13, y: 20 }, { kind: 'window', x: 31, y: 20 },
      { kind: 'door', x: 45, y: 10 }, { kind: 'door', x: 1, y: 14 },
      { kind: 'pipes', y: 1 }, { kind: 'pipes', y: 14 },
    );
    // crates and drums to hide behind (and blow up)
    for (const [kind, x, y] of [['crate', 4, 7], ['crate', 43, 7], ['barrel', 27, 7], ['crate', 20, 7], ['crate', 2, 13], ['barrel', 9, 13], ['crate', 45, 13], ['crate', 34, 13], ['barrel', 13, 19], ['crate', 14, 19], ['crate', 33, 19], ['barrel', 45, 19], ['crate', 4, 25], ['barrel', 12, 25], ['crate', 42, 25], ['crate', 35, 25]]) {
      this.props.push({ kind, x: (x + 0.5) * T, y: y * T });
    }
    for (const [x, y] of [[4, 6], [43, 6], [5, 24], [42, 24]]) this.spawns.push({ x: (x + 0.5) * T, y: (y + 1) * T });
    for (const x of [8, 18, 30, 40, 24]) this.drops.push((x + 0.5) * T);
  }

  // ---------- art ----------

  render() {
    const PW = W * T, PH = H * T;
    // far background (scrolls slower): the lab's deep space - huge dark machinery
    const [far, fg] = makeCanvas(PW, PH);
    rect(fg, '#0b1012', 0, 0, PW, PH);
    for (let i = 0; i < 26; i++) {
      const x = (hash(i, 1) * PW) | 0, w = 20 + ((hash(i, 2) * 60) | 0), h = 80 + ((hash(i, 3) * 260) | 0);
      rect(fg, i % 3 ? '#0f171a' : '#121c1f', x, PH - h, w, h);
      for (let y = PH - h + 6; y < PH; y += 9) if (hash(i, y) < 0.3) rect(fg, '#1c3a34', x + 3, y, 2, 1);   // little status lights
    }
    this.far = far;

    // back wall
    const [back, bg] = makeCanvas(PW, PH);
    for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) this.drawBack(bg, cx, cy);
    for (const d of this.deco) this.drawDeco(bg, d);
    for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) if (this.get(cx, cy) === LADDER) this.drawLadder(bg, cx, cy);
    this.back = back;

    // front: blocks and catwalks
    const [front, ft] = makeCanvas(PW, PH);
    for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) {
      const v = this.get(cx, cy);
      if (v === SOLID) this.drawSolid(ft, cx, cy);
      else if (v === PLAT) this.drawPlat(ft, cx, cy);
    }
    this.front = front;
  }

  drawBack(g, cx, cy) {
    const x = cx * T, y = cy * T;
    // big lab wall panels: 2x2 tiles each, seams, rivets, the odd grime streak
    const px = cx >> 1, py = cy >> 1, light = (px + py) % 2;
    rect(g, light ? '#1b2a28' : '#192624', x, y, T, T);
    if (cx % 2 === 0) rect(g, '#121c1a', x, y, 1, T);
    if (cy % 2 === 0) rect(g, '#121c1a', x, y, T, 1);
    if (cx % 2 === 0 && cy % 2 === 0) {
      rect(g, '#2a3c38', x + 2, y + 2, 1, 1);
      rect(g, '#2a3c38', x + 29 > x + T ? x + 13 : x + 13, y + 2, 1, 1);
    }
    if (hash(cx, cy, 3) < 0.06) rect(g, 'rgba(10, 16, 14, 0.5)', x + 4, y, 3, T);
    // a hazard band along the bottom of each floor's wall
    if (this.get(cx, cy + 1) === SOLID && this.get(cx, cy) !== SOLID) {
      rect(g, '#14201e', x, y + 12, T, 4);
      for (let i = 0; i < T; i += 4) rect(g, (i / 4 + cx) % 2 ? '#c9a83a' : '#1b1f1c', x + i, y + 13, 4, 2);
    }
  }

  drawSolid(g, cx, cy) {
    const x = cx * T, y = cy * T;
    const open = (ox, oy) => { const v = this.get(cx + ox, cy + oy); return v !== SOLID; };
    // concrete-and-steel slab: light top where you can stand on it, dark body
    rect(g, '#2b3a37', x, y, T, T);
    rect(g, '#253331', x, y + 8, T, 8);
    if ((cx + cy) % 3 === 0) rect(g, '#33443f', x + 3, y + 4, 2, 2);
    if (open(0, -1)) {
      rect(g, '#a9b8ae', x, y, T, 3);          // the walkable edge
      rect(g, '#d6e0d6', x, y, T, 1);
      rect(g, '#6e7f76', x, y + 3, T, 1);
      if (cx % 4 === 0) rect(g, '#6e7f76', x, y, 1, 3);
    }
    if (open(0, 1)) {
      rect(g, '#141c1b', x, y + 14, T, 2);
      rect(g, '#3a4c46', x, y + 13, T, 1);
    }
    if (open(-1, 0)) {
      rect(g, '#46584f', x, y, 2, T);
      rect(g, '#141c1b', x, y, 1, T);
    }
    if (open(1, 0)) {
      rect(g, '#1a2321', x + 14, y, 2, T);
      rect(g, '#0e1413', x + 15, y, 1, T);
    }
  }

  drawPlat(g, cx, cy) {
    const x = cx * T, y = cy * T;
    // a steel grating catwalk: yellow edge, see-through mesh, struts underneath
    rect(g, '#0e1413', x, y, T, 1);
    rect(g, '#d2b048', x, y + 1, T, 2);
    rect(g, '#7a6526', x, y + 3, T, 1);
    for (let i = 0; i < T; i += 3) rect(g, '#55625b', x + i, y + 4, 2, 2);
    rect(g, '#2b3632', x, y + 6, T, 1);
    if (cx % 3 === 0) {
      rect(g, '#3b4a44', x + 7, y + 6, 2, 5);
      rect(g, '#2b3632', x + 5, y + 10, 6, 1);
    }
  }

  drawLadder(g, cx, cy) {
    const x = cx * T, y = cy * T;
    rect(g, '#0e1413', x + 2, y, 3, T);
    rect(g, '#0e1413', x + 11, y, 3, T);
    rect(g, '#8a9690', x + 3, y, 1, T);
    rect(g, '#8a9690', x + 12, y, 1, T);
    for (let i = 2; i < T; i += 5) {
      rect(g, '#0e1413', x + 3, y + i - 1, 10, 3);
      rect(g, '#b8c4bc', x + 4, y + i, 8, 1);
    }
  }

  drawDeco(g, d) {
    const x = d.x * T, y = d.y * T, K = '#0b100f';
    switch (d.kind) {
      case 'monitors':
        for (let i = 0; i < 3; i++) {
          rect(g, K, x + i * 15, y, 14, 11);
          rect(g, '#1d2f2e', x + i * 15 + 1, y + 1, 12, 9);
          rect(g, '#0a2a28', x + i * 15 + 2, y + 2, 10, 6);    // screens (they glow - see glows)
        }
        rect(g, K, x - 2, y + 12, 48, 4);
        rect(g, '#2f403c', x - 1, y + 13, 46, 2);
        break;
      case 'server':
        rect(g, K, x, y, 28, 88);
        rect(g, '#16201f', x + 1, y + 1, 26, 86);
        for (let j = 4; j < 84; j += 6) {
          rect(g, '#22302e', x + 3, y + j, 22, 4);
          rect(g, hash(d.x, j) < 0.5 ? '#3df07a' : '#1a4a2a', x + 21, y + j + 1, 2, 1);
        }
        break;
      case 'tank': {
        // a tall glass tube full of green fluid, something floating in it
        rect(g, K, x, y, 26, 72);
        rect(g, '#3a4a46', x + 1, y + 1, 24, 6);
        rect(g, '#3a4a46', x + 1, y + 65, 24, 6);
        rect(g, '#0f3a2c', x + 2, y + 7, 22, 58);
        rect(g, '#145a40', x + 3, y + 10, 20, 54);
        rect(g, '#1e7a54', x + 3, y + 10, 3, 54);
        for (let i = 0; i < 7; i++) rect(g, '#6ef0a8', x + 6 + ((hash(i, d.x) * 14) | 0), y + 14 + i * 7, 1, 1);   // bubbles
        // the specimen: a hunched pale shape
        rect(g, '#0c2a1e', x + 9, y + 26, 8, 10);
        rect(g, '#0c2a1e', x + 10, y + 21, 6, 6);
        rect(g, '#0c2a1e', x + 8, y + 36, 3, 12);
        rect(g, '#0c2a1e', x + 15, y + 36, 3, 12);
        rect(g, '#9be8c0', x + 11, y + 23, 1, 1);
        rect(g, '#9be8c0', x + 14, y + 23, 1, 1);
        break;
      }
      case 'reactor':
        rect(g, K, x, y, 96, 70);
        rect(g, '#1d2a28', x + 1, y + 1, 94, 68);
        for (let i = 0; i < 4; i++) {
          rect(g, '#0f1615', x + 6 + i * 22, y + 8, 18, 50);
          rect(g, '#123a3a', x + 8 + i * 22, y + 12, 14, 42);   // coolant (glows)
          rect(g, '#3a4c48', x + 6 + i * 22, y + 30, 18, 2);
        }
        rect(g, '#c9a83a', x + 4, y + 62, 88, 2);
        break;
      case 'sign': {
        const w = d.text.length * 4 + 8;
        rect(g, K, x, y, w, 11);
        rect(g, '#c9a83a', x + 1, y + 1, w - 2, 9);
        for (let i = 0; i < d.text.length; i++) rect(g, '#1b1f1c', x + 4 + i * 4, y + 3, 3, 5);   // lettering, near enough
        break;
      }
      case 'vent':
        rect(g, K, x, y, 22, 14);
        rect(g, '#2f403c', x + 1, y + 1, 20, 12);
        for (let j = 3; j < 12; j += 3) rect(g, '#141c1b', x + 3, y + j, 16, 1);
        break;
      case 'window':
        // a window into a dark containment room
        rect(g, K, x, y, 46, 30);
        rect(g, '#3a4c46', x + 1, y + 1, 44, 28);
        rect(g, '#081412', x + 3, y + 3, 40, 24);
        rect(g, '#0e2420', x + 3, y + 18, 40, 9);
        rect(g, '#1d4a3e', x + 6, y + 5, 2, 10);
        rect(g, '#3a4c46', x + 22, y + 3, 2, 24);
        break;
      case 'door':
        rect(g, K, x, y, 22, 32);
        rect(g, '#2f403c', x + 1, y + 1, 20, 31);
        rect(g, '#1d2a28', x + 3, y + 4, 7, 26);
        rect(g, '#1d2a28', x + 12, y + 4, 7, 26);
        rect(g, '#c23a2e', x + 9, y + 1, 4, 2);
        break;
      case 'pipes':
        for (const [oy, col] of [[3, '#34463f'], [8, '#3d3226']]) {
          rect(g, K, T, d.y * T + oy - 1, (W - 2) * T, 5);
          rect(g, col, T, d.y * T + oy, (W - 2) * T, 3);
          rect(g, '#55685f', T, d.y * T + oy, (W - 2) * T, 1);
          for (let i = 2; i < W - 2; i += 7) rect(g, K, i * T, d.y * T + oy - 1, 3, 5);
        }
        break;
    }
  }
}
