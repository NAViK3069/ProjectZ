// Tile map: rooms + corridors, collision, pathfinding, light raycasts, and
// pre-rendered tile art (a dark lab: green tiled floors, metal-panel walls).
//
// 3/4 top-down walls: each wall cell draws its top face shifted up by its
// height, and a panelled front face below it when the cell underneath is
// open. Wall rows are pre-rendered into strips so they can be y-sorted with
// entities.
//
// Two heights: tall walls (WALL, well above head height) and low walls
// (LOW, about waist high). It matters for light: a flashlight can light the
// top of a low wall, but never the top of a tall one.

import { makeCanvas, rect } from '../engine/pixel.js';
import { createProp } from './props.js';
import { createCase } from './guncase.js';
import { drawText, textWidth } from '../ui/font.js';
import { buildApoc, APOC_SIZE, drawGround, drawOutdoorWall, MAT } from './apocmap.js';

export const TILE = 16;
export const WALL_H = 10;     // visible height of a tall wall's front face
const LOW_H = 6;              // ...and of a low wall's
const WALL_REACH = 6;         // walls block slightly above their cell so feet tuck behind the wall top
// floor mess: stays this long (s), then fades out over DECAL_FADE
const DECAL_LIFE = 30, DECAL_FADE = 12, DECAL_BUCKET = 5;
const CHUNK = 512;            // big maps keep their floor mess in chunks this size (px)
const PCELL = 32;             // props are bucketed in cells this size (px) for fast lookups

export const VOID = 0, FLOOR = 1, WALL = 2, LOW = 3;

export const PAL = {
  void: '#080a07',
  floorA: '#5b6553',
  floorB: '#566049',
  floorHi: '#67715d',
  grout: '#434b3d',
  mark: '#4a5343',
  stain: 'rgba(30, 36, 24, 0.35)',
  wallTop: '#262e22',
  wallTopHi: '#53624a',
  wallSpeck: '#2d3628',
  wallEdge: '#121610',
  panel: '#3f4b38',
  panelHi: '#56664c',
  panelDark: '#323c2d',
  seam: '#262e22',
  bolt: '#6d7d61',
  wallBase: '#161b13',
};

// Ceiling lamps hang on north walls: [cell x, wall row, colour]
const RED = [255, 46, 40], WHITE = [214, 228, 196];

function hash(x, y, s = 0) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class World {
  // layout: 'lab' (survival), 'training' (the shooting range) or 'apoc' (the
  // open-world survival map, generated from `seed`)
  constructor(layout = 'lab', seed = 1) {
    this.layout = layout;
    this.seed = seed;
    this.w = layout === 'training' ? 46 : layout === 'apoc' ? APOC_SIZE : 52;
    this.h = layout === 'training' ? 27 : layout === 'apoc' ? APOC_SIZE : 36;
    this.mat = new Uint8Array(this.w * this.h);        // floor material (MAT; 0 = the lab's tiles)
    this.wallKind = new Uint8Array(this.w * this.h);   // wall look (0 = metal panels)
    this.blocked = new Uint8Array(this.w * this.h);    // cells a solid prop sits in (paths go round)
    this.roofs = [];                                   // buildings' roofs (see apocmap.js)
    this.focus = null;                                 // where the player is (roofs, tree tops fade)
    this.wallText = [];   // words painted on wall faces: { cx, cy, text, color }
    this.floorMarks = null;
    this.grid = new Uint8Array(this.w * this.h);
    this.props = [];
    this.version = 0;     // bumps when props are added/removed (light shapes depend on them)
    this.lamps = [];
    this.build();
    this.prerender();
    this.flow = new Int16Array(this.w * this.h);
    this.flowFrom = -1;
  }

  get(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) return VOID;
    return this.grid[cy * this.w + cx];
  }

  set(cx, cy, v) {
    if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) return;
    this.grid[cy * this.w + cx] = v;
  }

  // Anything solid (tall or low).
  isWall(cx, cy) {
    const v = this.get(cx, cy);
    return v === WALL || v === LOW;
  }

  isLow(cx, cy) {
    return this.get(cx, cy) === LOW;
  }

  isFloor(cx, cy) {
    return this.get(cx, cy) === FLOOR;
  }

  fill(x0, y0, x1, y1, v) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, v);
  }

  // Every floor tile gets a wall round it.
  enclose() {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== VOID) continue;
        let nearFloor = false;
        for (let oy = -1; oy <= 1 && !nearFloor; oy++)
          for (let ox = -1; ox <= 1; ox++) if (this.get(x + ox, y + oy) === FLOOR) nearFloor = true;
        if (nearFloor) this.set(x, y, WALL);
      }
    }
  }

  addLamps(list) {
    for (const [x, y, color] of list) {
      if (this.isWall(x, y) && this.isFloor(x, y + 1)) this.lamps.push({ x: (x + 0.5) * TILE, y: (y + 1) * TILE, color });
    }
  }

  // props against a south wall sit a little higher so the wall top only overlaps their base
  place(kind, cx, cy, dx = 0) {
    const y = (cy + 1) * TILE - (this.isWall(cx, cy + 1) ? WALL_REACH : 0);
    const p = createProp(kind, (cx + 0.5) * TILE + dx, y);
    this.props.push(p);
    return p;
  }

  addCase(offer, cx, cy) {
    const c = createCase(offer, (cx + 1.5) * TILE, (cy + 1) * TILE);
    this.cases.push(c);
    this.props.push(c);
    return c;
  }

  build() {
    this.cases = [];
    this.supplies = [];
    if (this.layout === 'training') return this.buildTraining();
    if (this.layout === 'apoc') return buildApoc(this);
    this.fill(3, 4, 16, 13, FLOOR);    // A: start room
    this.fill(17, 7, 22, 10, FLOOR);   // corridor A -> B
    this.fill(23, 3, 46, 20, FLOOR);   // B: main hall
    this.fill(33, 21, 36, 24, FLOOR);  // corridor B -> C
    this.fill(26, 25, 46, 32, FLOOR);  // C: storage
    this.fill(8, 14, 10, 28, FLOOR);   // loop corridor A -> C
    this.fill(11, 26, 25, 28, FLOOR);
    this.enclose();

    // pillars and low walls in the hall
    for (const [x, y] of [[28, 7], [40, 7], [28, 15], [40, 15]]) this.fill(x, y, x + 1, y + 1, WALL);
    this.fill(33, 11, 36, 11, LOW);   // waist-high counter across the hall
    this.fill(30, 29, 31, 29, LOW);   // cover in the storage room
    this.fill(41, 29, 42, 29, LOW);

    this.spawn = { x: 9.5 * TILE, y: 9 * TILE };

    this.addLamps([
      [6, 3, RED], [15, 3, RED], [27, 2, RED], [34, 2, WHITE], [42, 2, RED], [27, 24, RED], [42, 24, RED], [20, 6, WHITE],
      [24, 2, WHITE], [40, 2, WHITE], [37, 24, WHITE], [14, 25, RED], [21, 25, WHITE],
    ]);
    const place = (kind, cx, cy) => this.place(kind, cx, cy);
    for (const [x, y] of [[3, 4], [3, 5], [16, 13], [45, 20], [46, 20], [46, 19], [26, 25], [27, 25], [26, 26], [46, 32], [45, 32], [24, 3]])
      place('crate', x, y);
    for (const [x, y] of [[15, 4], [16, 4], [3, 13], [46, 3], [23, 20], [31, 32], [44, 26], [45, 26], [12, 28]])
      place('barrel', x, y);
    // tall blocks: lockers and double-stacked crates (their tops are above the flashlight)
    for (const [x, y] of [[13, 13], [14, 13], [27, 32], [28, 32], [37, 32]]) place('locker', x, y);
    for (const [x, y] of [[46, 10], [46, 11], [23, 16]]) place('stack', x, y);

    // work lights and computer terminals: more light down on the floor
    for (const [x, y] of [[15, 9], [10, 21], [18, 26], [32, 18], [46, 28]]) place('worklight', x, y);
    for (const [x, y] of [[5, 12], [25, 10], [45, 6], [34, 31]]) place('terminal', x, y);

    // supply crates: open with E for loot, refilled every round
    for (const [x, y] of [[12, 8], [26, 18], [44, 14], [44, 30], [9, 22], [37, 15]]) {
      place('supply', x, y);
      this.supplies.push(this.props[this.props.length - 1]);
    }

    // wall-buy cases against north walls, 3 cells wide: [what it sells, left cell x, cell y]
    for (const [offer, cx, cy] of [
      [{ kind: 'melee', price: 500 }, 4, 4],
      [{ kind: 'weapon', weapon: 'm9' }, 8, 4],
      [{ kind: 'item', item: 'vestLight', price: 900 }, 11, 4],
      [{ kind: 'item', item: 'medkit', price: 350 }, 17, 7],
      [{ kind: 'weapon', weapon: 'm870' }, 29, 3],
      [{ kind: 'mystery', price: 950 }, 32, 3],
      [{ kind: 'weapon', weapon: 'm4a1' }, 36, 3],
      [{ kind: 'mods', price: 600 }, 43, 3],
      [{ kind: 'weapon', weapon: 'ump45' }, 29, 25],
      [{ kind: 'weapon', weapon: 'awm' }, 39, 25],
    ]) this.addCase(offer, cx, cy);

    // zombies come out of the far ends of the map
    this.spawnCells = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.isFloor(x, y)) this.spawnCells.push([x, y]);
  }

  // The training range: a lounge with the armory on the left, three shooting
  // lanes with dummies on the right (low walls between them), decorations.
  buildTraining() {
    this.fill(3, 3, 42, 23, FLOOR);
    this.enclose();
    // lane dividers (waist high, so you can see over them)
    this.fill(21, 9, 41, 9, LOW);
    this.fill(21, 16, 41, 16, LOW);
    // the lounge is split off by a counter with a gap to walk through
    this.fill(14, 3, 14, 8, LOW);
    this.fill(14, 18, 14, 23, LOW);
    this.spawn = { x: 9 * TILE, y: 14 * TILE };
    this.addLamps([[5, 2, WHITE], [12, 2, WHITE], [18, 2, WHITE], [25, 2, WHITE], [32, 2, WHITE], [39, 2, WHITE], [27, 2, RED]]);

    // the armory: pick any weapon, attachment or throwable
    this.armory = this.addCase({ kind: 'armory' }, 6, 3);
    this.place('rack', 3, 3, 8);
    this.place('rack', 9, 3, 8);
    for (const [x, y] of [[3, 7], [3, 8], [3, 11]]) this.place('locker', x, y);
    this.place('table', 7, 9, 8);
    this.place('bench', 7, 12, 8);
    this.place('bench', 7, 18, 8);
    this.place('board', 11, 21, 8);
    this.place('plant', 13, 4);
    this.place('plant', 3, 23);
    this.place('plant', 13, 22);
    for (const [x, y] of [[4, 20], [5, 20], [3, 15]]) this.place('crate', x, y);
    this.place('stack', 3, 17);
    this.place('ammobox', 9, 22);
    this.place('ammobox', 10, 9);
    this.place('terminal', 12, 16);
    this.place('worklight', 4, 13);
    // more light for the range: work lights at the ends of the lower lanes, and soft
    // ceiling lights over the lanes the wall lamps don't reach
    for (const [x, y] of [[19, 14], [19, 21], [42, 15], [42, 22]]) this.place('worklight', x, y);
    const CEIL = [236, 240, 220];
    this.ceilingLights = [[24, 12.5], [31, 12.5], [38, 12.5], [24, 20], [31, 20], [38, 20]]
      .map(([x, y]) => ({ x: (x + 0.5) * TILE, y: y * TILE, radius: 100, color: CEIL, intensity: 0.3, static: true }));
    // firing line: sandbags and cones by each lane, drums at the back
    for (const y of [5, 12, 19]) this.place('sandbag', 17, y);
    for (const [x, y] of [[20, 4], [20, 10], [20, 17], [20, 23]]) this.place('cone', x, y);
    for (const [x, y] of [[42, 4], [42, 10], [42, 23]]) this.place('barrel', x, y);
    this.place('target', 42, 7);
    this.place('target', 42, 13);
    this.place('target', 42, 20);

    // where the dummies stand: [x, y, opts]
    const Y = (r) => (r + 0.8) * TILE;
    this.dummySpots = [
      [25, Y(6)], [32, Y(6)], [39, Y(6)],
      [33, Y(12.5), { mover: true, range: 64, speed: 40 }], [39, Y(12.5)],
      [27, Y(20)], [36, Y(20)],
    ].map(([x, y, o]) => ({ x: (x + 0.5) * TILE, y, opts: o ?? {} }));
    // zombies you spawn come out of the far end of the bottom lane
    this.zombieGate = { x: 40.5 * TILE, y: 20 * TILE };

    this.wallText.push({ cx: 16.5, cy: 2, text: 'TRAINING', color: '#e6c63a' }, { cx: 30, cy: 2, text: 'RANGE', color: '#e6c63a' });
    this.floorMarks = (g) => {
      // lane lines and distance marks
      const yel = 'rgba(230, 198, 58, 0.55)';
      for (const y of [4, 10, 17]) rect(g, yel, 19 * TILE, y * TILE - 2, 2, 5 * TILE + 4);
      for (let x = 22; x <= 40; x += 2) for (const y of [8.5, 15.5]) rect(g, 'rgba(230, 198, 58, 0.35)', x * TILE, y * TILE, TILE - 4, 2);
      for (const [x, m] of [[25, '10M'], [32, '20M'], [39, '30M']]) {
        for (const y of [3.3, 22.4]) drawText(g, m, (x + 0.5) * TILE - textWidth(m) / 2, y * TILE, 1, 'rgba(230, 198, 58, 0.6)', null);
      }
      drawText(g, 'LANE 1', 21 * TILE, 4.2 * TILE, 1, 'rgba(230, 230, 220, 0.4)', null);
      drawText(g, 'LANE 2', 21 * TILE, 10.2 * TILE, 1, 'rgba(230, 230, 220, 0.4)', null);
      drawText(g, 'ZOMBIES', 21 * TILE, 17.2 * TILE, 1, 'rgba(255, 90, 80, 0.5)', null);
      // a mat in the lounge
      rect(g, 'rgba(40, 50, 70, 0.35)', 5 * TILE, 12 * TILE, 6 * TILE, 4 * TILE);
      rect(g, 'rgba(90, 110, 150, 0.25)', 5 * TILE + 2, 12 * TILE + 2, 6 * TILE - 4, 1);
    };
    this.spawnCells = [];
  }

  // All solid rectangles overlapping box {l, t, r, b} (walls + props).
  // shot: for bullets, which fly over low walls and very low props.
  // ---------- props, bucketed by area ----------

  // The props whose boxes overlap a cell grid built on demand (rebuilt when props change).
  get propGrid() {
    if (this._grid && this._gridVersion === this.version && this._gridCount === this.props.length) return this._grid;
    const gw = Math.ceil((this.w * TILE) / PCELL), gh = Math.ceil((this.h * TILE) / PCELL);
    const grid = Array.from({ length: gw * gh }, () => null);
    for (const p of this.props) {
      const b = p.box;
      const x0 = Math.max(0, Math.floor(b.l / PCELL)), x1 = Math.min(gw - 1, Math.floor(b.r / PCELL));
      const y0 = Math.max(0, Math.floor(b.t / PCELL)), y1 = Math.min(gh - 1, Math.floor(b.b / PCELL));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) (grid[y * gw + x] ??= []).push(p);
    }
    this._grid = grid;
    this._gw = gw;
    this._gh = gh;
    this._gridVersion = this.version;
    this._gridCount = this.props.length;
    return grid;
  }

  // Props whose boxes might overlap the area (l, t)-(r, b).
  propsIn(l, t, r, b) {
    const grid = this.propGrid, gw = this._gw, gh = this._gh;
    const x0 = Math.max(0, Math.floor(l / PCELL)), x1 = Math.min(gw - 1, Math.floor(r / PCELL));
    const y0 = Math.max(0, Math.floor(t / PCELL)), y1 = Math.min(gh - 1, Math.floor(b / PCELL));
    if (x0 === x1 && y0 === y1) return grid[y0 * gw + x0] ?? [];
    const out = new Set();
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (const p of grid[y * gw + x] ?? []) out.add(p);
    return [...out];
  }

  // Props near a point (within r).
  propsNear(x, y, r) {
    return this.propsIn(x - r, y - r, x + r, y + r);
  }

  addProp(p) {
    this.props.push(p);
    this.version++;
    if (p.blocksPath) this.markBlocked(p);
    return p;
  }

  // A solid prop's cells are off the zombies' paths.
  markBlocked(p, v = 1) {
    const cx = Math.floor(p.x / TILE), cy = Math.floor((p.box.t + p.box.b) / 2 / TILE);
    if (cx >= 0 && cy >= 0 && cx < this.w && cy < this.h) this.blocked[cy * this.w + cx] = v;
  }

  // Open for walking round (pathfinding): floor without a solid prop on it.
  isOpen(cx, cy) {
    return this.isFloor(cx, cy) && !this.blocked[cy * this.w + cx];
  }

  solidsIn(box, shot = false) {
    const out = [];
    const cx0 = Math.floor(box.l / TILE), cx1 = Math.floor((box.r - 1e-6) / TILE);
    const cy0 = Math.floor(box.t / TILE), cy1 = Math.floor((box.b + WALL_REACH - 1e-6) / TILE);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (shot ? this.get(cx, cy) !== WALL : !this.isWall(cx, cy)) continue;
        const r = { l: cx * TILE, t: cy * TILE - WALL_REACH, r: cx * TILE + TILE, b: cy * TILE + TILE };
        if (overlaps(box, r)) out.push(r);
      }
    }
    for (const p of this.propsIn(box.l, box.t, box.r, box.b)) if (!p.ghost && !(shot && p.low) && overlaps(box, p.box)) out.push(p.box);
    return out;
  }

  // The prop at (x, y), with a little slack for things that stopped just short of it.
  propAt(x, y, slack = 1.5) {
    return this.propsNear(x, y, slack + 1).find((p) => !p.low && !p.ghost && x >= p.box.l - slack && x <= p.box.r + slack && y >= p.box.t - slack && y <= p.box.b + slack);
  }

  removeProp(p) {
    const i = this.props.indexOf(p);
    if (i >= 0) this.props.splice(i, 1);
    if (p.blocksPath) this.markBlocked(p, 0);
    this.version++;
  }

  // Simple box mover for things that don't need corner assist: slides along walls.
  // Returns true if anything blocked the move.
  slide(e, dx, dy) {
    let blocked = false;
    if (dx) {
      const box = { l: e.x + dx - e.halfW, t: e.y - e.height, r: e.x + dx + e.halfW, b: e.y };
      const hits = this.solidsIn(box);
      if (!hits.length) e.x += dx;
      else {
        e.x = dx > 0 ? Math.min(...hits.map((h) => h.l)) - e.halfW : Math.max(...hits.map((h) => h.r)) + e.halfW;
        blocked = true;
      }
    }
    if (dy) {
      const box = { l: e.x - e.halfW, t: e.y + dy - e.height, r: e.x + e.halfW, b: e.y + dy };
      const hits = this.solidsIn(box);
      if (!hits.length) e.y += dy;
      else {
        e.y = dy > 0 ? Math.min(...hits.map((h) => h.t)) : Math.max(...hits.map((h) => h.b)) + e.height;
        blocked = true;
      }
    }
    return blocked;
  }

  // Is there a clear line between two floor points? Only tall things block it
  // (walls, pillars, lockers, stacked crates, cases) - the same things that
  // stop light. Used for cover from blasts and flashbangs.
  clearLine(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    if (d < 1) return true;
    return this.castRay(x0, y0, (x1 - x0) / d, (y1 - y0) / d, d, true) >= d - 1;
  }

  // Low walls as merged rectangles (for the short shadows they cast).
  get lowRects() {
    if (this._lowRects) return this._lowRects;
    const runs = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!this.isLow(x, y)) continue;
        let x1 = x;
        while (this.isLow(x1 + 1, y)) x1++;
        // carry on a run of the same span from the row above, if there is one
        const up = runs.find((r) => r.x0 === x && r.x1 === x1 && r.y1 === y - 1);
        if (up) up.y1 = y;
        else runs.push({ x0: x, x1, y0: y, y1: y });
        x = x1;
      }
    }
    this._lowRects = runs.map((r) => ({ l: r.x0 * TILE, t: r.y0 * TILE, r: (r.x1 + 1) * TILE, b: (r.y1 + 1) * TILE, h: LOW_H }));
    return this._lowRects;
  }

  // Distance a ray from (ox, oy) travels across the floor before something
  // blocks it, capped at max. Walls and props (crates, drums, cases) block.
  // tallOnly: light - it passes over low walls and low props (they cast a
  // short shadow instead, see Lighting).
  castRay(ox, oy, dx, dy, max, tallOnly = false) {
    const blocks = tallOnly ? (cx, cy) => this.get(cx, cy) === WALL : (cx, cy) => this.isWall(cx, cy);
    let cx = Math.floor(ox / TILE), cy = Math.floor(oy / TILE);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
    const tdx = dx ? Math.abs(TILE / dx) : Infinity, tdy = dy ? Math.abs(TILE / dy) : Infinity;
    let tx = dx ? ((dx > 0 ? (cx + 1) * TILE - ox : ox - cx * TILE) / Math.abs(dx)) : Infinity;
    let ty = dy ? ((dy > 0 ? (cy + 1) * TILE - oy : oy - cy * TILE) / Math.abs(dy)) : Infinity;
    let t = 0, hit = max;
    if (blocks(cx, cy)) hit = 0;
    while (hit === max && t < max) {
      if (tx < ty) {
        t = tx;
        tx += tdx;
        cx += stepX;
      } else {
        t = ty;
        ty += tdy;
        cy += stepY;
      }
      if (t < max && blocks(cx, cy)) hit = t;
    }
    // props: ray vs box (slab test) - only the ones the ray could reach
    const ex = ox + dx * hit, ey = oy + dy * hit;
    for (const p of this.propsIn(Math.min(ox, ex), Math.min(oy, ey), Math.max(ox, ex), Math.max(oy, ey))) {
      if (p.ghost || (tallOnly && !p.tall)) continue;
      const b = p.box;
      const t1x = dx ? (b.l - ox) / dx : -Infinity, t2x = dx ? (b.r - ox) / dx : Infinity;
      const t1y = dy ? (b.t - oy) / dy : -Infinity, t2y = dy ? (b.b - oy) / dy : Infinity;
      if (!dx && (ox <= b.l || ox >= b.r)) continue;
      if (!dy && (oy <= b.t || oy >= b.b)) continue;
      const tminX = Math.min(t1x, t2x), tminY = Math.min(t1y, t2y);
      const tmin = Math.max(tminX, tminY), tmax = Math.min(Math.max(t1x, t2x), Math.max(t1y, t2y));
      if (tmax < 0 || tmin > tmax || tmin >= hit || tmin < 0) continue;
      hit = tmin;
    }
    return Math.min(max, hit);
  }

  // ---------- pathfinding ----------

  // Breadth-first distance field from the target cell; zombies walk downhill.
  updateFlow(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const start = ty * this.w + tx;
    if (start === this.flowFrom || !this.isFloor(tx, ty)) return;
    this.flowFrom = start;
    const flow = this.flow.fill(-1);
    const queue = new Int32Array(this.w * this.h);
    let head = 0, tail = 0;
    flow[start] = 0;
    queue[tail++] = start;
    while (head < tail) {
      const i = queue[head++], cx = i % this.w, cy = (i / this.w) | 0;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + ox, ny = cy + oy, ni = ny * this.w + nx;
        if (!this.isOpen(nx, ny) || flow[ni] !== -1) continue;
        flow[ni] = flow[i] + 1;
        queue[tail++] = ni;
      }
    }
  }

  // Centre of the next cell to head for from (x, y), or null if already in the target's cell.
  nextStep(x, y) {
    const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    const here = this.flow[cy * this.w + cx];
    if (here <= 0) return null;
    let best = null, bestD = here;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cx + ox, ny = cy + oy;
      if (!this.isOpen(nx, ny)) continue;
      if (ox && oy && (!this.isOpen(cx + ox, cy) || !this.isOpen(cx, cy + oy))) continue;  // no corner cutting
      const d = this.flow[ny * this.w + nx];
      if (d >= 0 && d < bestD) {
        bestD = d;
        best = { x: (nx + 0.5) * TILE, y: (ny + 0.75) * TILE };
      }
    }
    return best;
  }

  // ---------- floor decals (casings, mags, blood, bodies, scorch marks) ----------
  //
  // Things that land on the floor are painted into a decal layer. A new
  // layer starts every DECAL_BUCKET seconds; a layer stays for DECAL_LIFE
  // seconds after its last stain, then fades out over DECAL_FADE seconds and
  // is recycled. So the floor slowly clears itself, oldest mess first.

  // (x, y): where it lands - big maps keep their mess in chunks round it.
  stain(draw, x = 0, y = 0) {
    const big = this.w * TILE > CHUNK * 2;
    const cx = big ? Math.floor(x / CHUNK) : 0, cy = big ? Math.floor(y / CHUNK) : 0, key = cx + ',' + cy;
    const chunk = (this.chunks[key] ??= { x: cx * CHUNK, y: cy * CHUNK, w: big ? CHUNK : this.w * TILE, h: big ? CHUNK : this.h * TILE, layers: [] });
    let layer = chunk.layers[chunk.layers.length - 1];
    if (!layer || this.decalTime - layer.born >= DECAL_BUCKET) {
      let reuse = this.decalPool.findIndex(([c]) => c.width === chunk.w && c.height === chunk.h);
      const [canvas, ctx] = reuse >= 0 ? this.decalPool.splice(reuse, 1)[0] : makeCanvas(chunk.w, chunk.h);
      layer = { canvas, ctx, born: this.decalTime };
      chunk.layers.push(layer);
    }
    layer.ctx.setTransform(1, 0, 0, 1, -chunk.x, -chunk.y);
    draw(layer.ctx);
    layer.ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  get decals() {
    return Object.values(this.chunks).flatMap((c) => c.layers);
  }

  updateDecals(dt) {
    this.decalTime += dt;
    for (const chunk of Object.values(this.chunks)) {
      while (chunk.layers.length && this.decalAlpha(chunk.layers[0]) <= 0) {
        const old = chunk.layers.shift();
        old.ctx.setTransform(1, 0, 0, 1, 0, 0);
        old.ctx.globalAlpha = 1;
        old.ctx.globalCompositeOperation = 'source-over';
        old.ctx.clearRect(0, 0, old.canvas.width, old.canvas.height);
        this.decalPool.push([old.canvas, old.ctx]);
      }
    }
  }

  // 1 while fresh, easing down to 0 at the end of its life.
  decalAlpha(layer) {
    const age = this.decalTime - (layer.born + DECAL_BUCKET);   // since its last possible stain
    const k = 1 - (age - DECAL_LIFE) / DECAL_FADE;
    return k >= 1 ? 1 : k <= 0 ? 0 : k * k * (3 - 2 * k);
  }

  drawDecals(ctx, view = null) {
    for (const chunk of Object.values(this.chunks)) {
      if (view && (chunk.x > view.r || chunk.y > view.b || chunk.x + chunk.w < view.l || chunk.y + chunk.h < view.t)) continue;
      for (const layer of chunk.layers) {
        const a = this.decalAlpha(layer);
        if (a <= 0) continue;
        ctx.globalAlpha = a;
        ctx.drawImage(layer.canvas, chunk.x, chunk.y);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- tile art ----------

  prerender() {
    const [fc, fg] = makeCanvas(this.w * TILE, this.h * TILE);
    for (let cy = 0; cy < this.h; cy++)
      for (let cx = 0; cx < this.w; cx++) if (this.isFloor(cx, cy)) this.drawFloor(fg, cx, cy);
    this.floorMarks?.(fg);
    this.floorCanvas = fc;
    this.chunks = {};
    this.decalPool = [];
    this.decalTime = 0;

    this.wallRows = [];
    this.wallFaces = [];   // per row: where each wall's top and front face are on screen (for lighting)
    for (let cy = 0; cy < this.h; cy++) {
      let strip = null;
      const faces = [];
      for (let cx = 0; cx < this.w; cx++) {
        if (!this.isWall(cx, cy)) continue;
        strip ??= makeCanvas(this.w * TILE, TILE + WALL_H);
        this.drawWall(strip[1], cx, cy);
        const low = this.isLow(cx, cy), h = low ? LOW_H : WALL_H, y = cy * TILE;
        faces.push({
          x: cx * TILE,
          low,
          top: y - h,                                 // top face: 16 tall from here
          face: this.isWall(cx, cy + 1) ? 0 : h,      // front face height (0 = hidden)
          front: y + TILE,                            // floor row just in front of the wall
          back: y - 1,                                // floor row just behind it
        });
      }
      this.wallRows[cy] = strip ? strip[0] : null;
      this.wallFaces[cy] = faces;
    }
    for (const t of this.wallText) {
      // painted on the front face of the wall row
      const strip = this.wallRows[t.cy]?.getContext('2d');
      if (strip) drawText(strip, t.text, Math.round(t.cx * TILE - textWidth(t.text) / 2), 16 + 3, 1, t.color, null);
    }
    for (const l of this.lamps) {
      const strip = this.wallRows[l.y / TILE - 1].getContext('2d');
      const x = Math.round(l.x) - 3;
      rect(strip, PAL.wallEdge, x - 1, 16, 8, 3);   // housing on the wall face
      rect(strip, '#3a4234', x, 16, 6, 2);
    }
  }

  drawFloor(g, cx, cy) {
    const m = this.mat[cy * this.w + cx];
    if (m) return drawGround(this, g, cx, cy, m);
    const x = cx * TILE, y = cy * TILE;
    const r = hash(cx, cy);
    rect(g, (cx + cy) & 1 ? PAL.floorA : PAL.floorB, x, y, 16, 16);
    rect(g, PAL.floorHi, x, y, 15, 1);
    rect(g, PAL.floorHi, x, y, 1, 15);
    rect(g, PAL.grout, x, y + 15, 16, 1);
    rect(g, PAL.grout, x + 15, y, 1, 16);

    if (r < 0.22) {
      // small cross mark in the middle of the tile
      rect(g, PAL.mark, x + 7, y + 6, 1, 3);
      rect(g, PAL.mark, x + 6, y + 7, 3, 1);
    } else if (r < 0.27) {
      // drain grate
      rect(g, PAL.grout, x + 4, y + 4, 8, 8);
      for (let i = 0; i < 3; i++) rect(g, '#2f362a', x + 5, y + 5 + i * 2, 6, 1);
    } else if (r < 0.42) {
      // grime
      const sx = 2 + ((hash(cx, cy, 3) * 8) | 0), sy = 2 + ((hash(cx, cy, 4) * 8) | 0);
      rect(g, PAL.stain, x + sx, y + sy, 5, 3);
      rect(g, PAL.stain, x + sx + 1, y + sy - 1, 3, 5);
    }

    // contact shadows from walls above / beside
    if (this.isWall(cx, cy - 1)) {
      rect(g, 'rgba(8, 10, 6, 0.5)', x, y, 16, 2);
      rect(g, 'rgba(8, 10, 6, 0.25)', x, y + 2, 16, 3);
    }
    if (this.isWall(cx - 1, cy)) rect(g, 'rgba(8, 10, 6, 0.25)', x, y, 2, 16);
    if (this.isWall(cx + 1, cy)) rect(g, 'rgba(8, 10, 6, 0.18)', x + 14, y, 2, 16);
  }

  // Draws into a row strip whose top is at world y = cy * TILE - WALL_H.
  // Low walls sit WALL_H - LOW_H lower in the strip and have a shorter face.
  drawWall(g, cx, cy) {
    const kind = this.wallKind[cy * this.w + cx];
    if (kind) return drawOutdoorWall(this, g, cx, cy, kind);
    const x = cx * TILE, type = this.get(cx, cy), low = type === LOW;
    const h = low ? LOW_H : WALL_H, oy = WALL_H - h;
    // only walls of the same height join up
    const same = (ox, oyy) => this.get(cx + ox, cy + oyy) === type;
    const up = same(0, -1), down = this.isWall(cx, cy + 1), joinDown = same(0, 1);
    const left = same(-1, 0), right = same(1, 0);

    // top face: dark slab with a light rim along open edges (low walls: worn metal counter)
    rect(g, low ? '#353f2f' : PAL.wallTop, x, oy, 16, 16);
    for (let i = 0; i < 2; i++) {
      if (hash(cx, cy, 50 + i) > 0.5) continue;
      rect(g, PAL.wallSpeck, x + 3 + ((hash(cx, cy, 60 + i) * 10) | 0), oy + 3 + ((hash(cx, cy, 70 + i) * 10) | 0), 2, 2);
    }
    const hi = low ? '#6b7c5f' : PAL.wallTopHi;
    const l0 = left ? 0 : 2, r0 = right ? 0 : 2;
    if (!up) rect(g, hi, x + l0, oy + 2, 16 - l0 - r0, 1);
    if (!joinDown) rect(g, hi, x + l0, oy + 13, 16 - l0 - r0, 1);
    const rimTop = up ? 0 : 2, rimBottom = joinDown ? 16 : 14;
    if (!left) rect(g, hi, x + 2, oy + rimTop, 1, rimBottom - rimTop);
    if (!right) rect(g, hi, x + 13, oy + rimTop, 1, rimBottom - rimTop);
    if (!up) rect(g, PAL.wallEdge, x, oy, 16, 1);
    if (!left) rect(g, PAL.wallEdge, x, oy, 1, 16);
    if (!right) rect(g, PAL.wallEdge, x + 15, oy, 1, 16);

    if (down) return;

    // metal panel front face (strip y 16 + oy .. 26)
    const fy = 16 + oy;
    rect(g, PAL.panel, x, fy, 16, h);
    rect(g, PAL.panelHi, x, fy, 16, 1);
    if (low) {
      rect(g, '#e6c63a', x, fy + 2, 16, 2);                     // hazard stripe on the counter
      for (let i = 0; i < 16; i += 4) rect(g, '#1d2118', x + i + ((cx & 1) * 2), fy + 2, 2, 2);
    } else {
      rect(g, PAL.panelDark, x, fy + 6, 16, 3);
      rect(g, PAL.seam, x + ((cx & 1) ? 0 : 8), fy + 1, 1, h - 2);
      if (hash(cx, cy, 80) < 0.5) {
        rect(g, PAL.bolt, x + 3, fy + 2, 1, 1);
        rect(g, PAL.bolt, x + 12, fy + 2, 1, 1);
      }
      if (hash(cx, cy, 81) < 0.12) {
        // vent
        rect(g, PAL.seam, x + 4, fy + 2, 8, 4);
        for (let i = 0; i < 2; i++) rect(g, PAL.panelDark, x + 5, fy + 3 + i * 2, 6, 1);
      }
    }
    rect(g, PAL.wallBase, x, fy + h - 1, 16, 1);
    if (!left) rect(g, PAL.wallEdge, x, fy, 1, h);
    if (!right) rect(g, PAL.wallEdge, x + 15, fy, 1, h);
  }
}

function overlaps(a, b) {
  return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
}
