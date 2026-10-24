// The open-world survival map ("apocalypse" mode), generated from a seed.
//
// A round clearing in the woods, ringed by forest you can't get through. The
// camp - the generator, the workbench, the survivors - is in the middle. A ring
// road runs round it with roads out to the edge, and ruins are scattered
// about: gas stations, a store, houses, a clinic, old campsites, a junkyard and
// a fenced military camp. Everything else is grass, dirt and trees.
//
// Buildings are stamped from little text plans (TEMPLATES): walls, floors,
// door gaps and the furniture / containers inside. Each building gets a roof
// that hides the inside until you walk in (see Roof).
//
// This module draws its own ground and wall art too (drawGround,
// drawOutdoorWall), called from World for cells with a material / wall kind.

import { makeCanvas, rect } from '../engine/pixel.js';
import { createProp } from './props.js';
import { TREES, CARS } from './apocprops.js';

const TILE = 16, WALL_H = 10, LOW_H = 6;
const VOID = 0, FLOOR = 1, WALL = 2, LOW = 3;
export const APOC_SIZE = 144;
const RADIUS = 68;           // the playable circle (cells)
const CAMP_R = 9;            // the camp clearing

export const MAT = { GRASS: 1, DIRT: 2, ROAD: 3, CONCRETE: 4, WOOD: 5, TILES: 6, GRAVEL: 7 };
export const WK = { BRICK: 1, WOOD: 2, CONCRETE: 3, FOREST: 4, FENCE: 5 };

// ---------- seeded randomness ----------

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth value noise over the map (cells), 0..1.
function makeNoise(rand, cell) {
  const n = Math.ceil(APOC_SIZE / cell) + 2, g = Array.from({ length: n * n }, rand);
  return (x, y) => {
    const fx = x / cell, fy = y / cell, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const s = (t) => t * t * (3 - 2 * t), at = (i, j) => g[(j % n) * n + (i % n)];
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * s(tx), b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * s(tx);
    return a + (b - a) * s(ty);
  };
}

const hash = (x, y, s = 0) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

// ---------- building plans ----------
// '#' wall  '=' fence (low)  '.' inside floor  ',' paved outside  'D' doorway
// ' ' leave the ground as it is. Everything else is a prop on that cell:
// s shelf, f fridge, k cabinet, b bed, c counter, x crate, l locker, p pump,
// C car, j junk, L logs, t tent, F campfire, m military crate, a ammo box,
// S sandbags, B drum, r weapon rack
const PROP_FOR = { s: 'shelf', f: 'fridge', k: 'cabinet', b: 'bed', c: 'table', x: 'crate', l: 'locker', p: 'pump', C: 'car', j: 'junk', L: 'logs', t: 'tent', F: 'campfire', m: 'mcrate', a: 'ammobox', S: 'sandbag', B: 'barrel', r: 'rack' };

export const TEMPLATES = {
  gas: {
    name: 'GAS STATION', wall: WK.BRICK, floor: MAT.TILES, outside: MAT.CONCRETE, roofs: [[0, 0, 9, 6, 'flat'], [11, 1, 17, 6, 'canopy']],
    loot: { s: 'store', k: 'tools', x: 'supplies' },
    rows: [
      '##########,,,,,,,,',
      '#s.s.s.s.#,,,,,,,,',
      '#........#,,p,,p,,',
      '#.c.c....D,,,,,,,,',
      '#.......f#,,,,,,,,',
      '#k......f#,,p,,p,,',
      '####D#####,,,,,,,,',
      ',,,,,,,,,,,,,,,,,,',
      ',,j,,,,,,,,,,C,,,,',
    ],
  },
  store: {
    name: 'STORE', wall: WK.BRICK, floor: MAT.TILES, outside: MAT.CONCRETE, roofs: [[0, 0, 13, 8, 'flat']],
    loot: { k: 'store', x: 'supplies' },
    rows: [
      '##############',
      '#ffff.ffff..k#',
      '#............#',
      '#.ss.ss.ss...#',
      '#............#',
      '#.ss.ss.ss...#',
      '#............#',
      '#c.cc......x.#',
      '#######DD#####',
      ',,,,,,,,,,,,,,',
    ],
  },
  house: {
    name: 'HOUSE', wall: WK.WOOD, floor: MAT.WOOD, roofs: [[0, 0, 10, 7, 'shingle']],
    loot: { k: 'house' },
    rows: [
      '###########',
      '#b..#..k.f#',
      '#...#.....#',
      '#k..D..c..#',
      '#####.....#',
      '#..b#..c..#',
      '#...D.....#',
      '#########D#',
    ],
  },
  house2: {
    name: 'HOUSE', wall: WK.WOOD, floor: MAT.WOOD, roofs: [[0, 0, 8, 6, 'shingle2']],
    loot: { k: 'house' },
    rows: [
      '#########',
      '#k.b..b.#',
      '#.......#',
      '####D####',
      '#f.c..k.#',
      '#.......#',
      '####D####',
    ],
  },
  clinic: {
    name: 'CLINIC', wall: WK.CONCRETE, floor: MAT.TILES, roofs: [[0, 0, 11, 7, 'flat']],
    loot: { k: 'medical', x: 'medical' },
    rows: [
      '############',
      '#kk.k#b..b.#',
      '#....#.....#',
      '#....D.....#',
      '#c...#..k..#',
      '#c...###D###',
      '#.........x#',
      '######DD####',
    ],
  },
  military: {
    name: 'MILITARY CAMP', wall: WK.CONCRETE, floor: MAT.CONCRETE, outside: MAT.DIRT, roofs: [[2, 2, 11, 7, 'metal']], tier: 3,
    loot: { l: 'military', x: 'military', a: 'ammo', r: 'weapons' },
    rows: [
      '========================',
      '=,,,,,,,,,,,,,,,,,,,,,,=',
      '=,##########,,,,S,,S,,,=',
      '=,#l.l.l.r#,,,,,,,,,,,,=',
      '=,#........#,,,,m,,m,,,=',
      '=,#.b.b.b..#,,,,,,,,,,,=',
      '=,#a.......#,,,,aa,,,,,=',
      '=,####D#####,,,,,,,,,,,=',
      '=,,,,,,,,,,,,,,,,,,C,,,=',
      '=,S,S,,,,,,,,,,,,,,m,,,=',
      '=,,,,,,,,,,,,,,,,,,,,,,=',
      '==========,,,===========',
    ],
  },
  campsite: {
    name: 'OLD CAMPSITE', outside: MAT.DIRT, loot: { x: 'supplies' },
    rows: [
      '  L     t   L ',
      '   ,,,,,,,,,  ',
      '  t,,,,,,,,,t ',
      '  ,,,,,F,,,,, ',
      '  ,,,,,,,,,,, ',
      '   ,x,,,,,j,  ',
    ],
  },
  junkyard: {
    name: 'JUNKYARD', wall: WK.FENCE, outside: MAT.DIRT, loot: {},
    rows: [
      '======,,,=======',
      '=,,,,,,,,,,,,,,=',
      '=,j,,C,,,j,,C,,=',
      '=,,,,,,,,,,,,,,=',
      '=,C,,j,,,,,j,,,=',
      '=,,,,,,,,C,,,,,=',
      '=,j,,,,,,,,,,j,=',
      '================',
    ],
  },
};

// What goes where, and how many.
const LAYOUT = [['military', 1, 46, 60], ['gas', 2, 22, 52], ['store', 1, 18, 44], ['clinic', 1, 18, 50], ['house', 3, 16, 58], ['house2', 3, 16, 58], ['campsite', 2, 24, 60], ['junkyard', 1, 24, 56]];

// ---------- the map ----------

export function buildApoc(world) {
  const S = APOC_SIZE, C = S / 2, rand = rng(world.seed || 1);
  const noise = makeNoise(rand, 9), noise2 = makeNoise(rand, 4);
  const at = (x, y) => y * S + x;
  const inside = (x, y) => Math.hypot(x + 0.5 - C, y + 0.5 - C) <= RADIUS;
  const reserved = new Uint8Array(S * S);   // no trees here (buildings, roads, camp)

  // ground: the circle is floor; grass with patches of dirt
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!inside(x, y)) continue;
    world.set(x, y, FLOOR);
    world.mat[at(x, y)] = noise(x, y) > 0.68 ? MAT.DIRT : MAT.GRASS;
  }

  // roads: a ring round the camp and four roads out to the forest
  const road = (x, y, w = 1) => {
    for (let oy = -w; oy <= w; oy++) for (let ox = -w; ox <= w; ox++) {
      const cx = Math.round(x + ox), cy = Math.round(y + oy);
      if (world.isFloor(cx, cy)) {
        world.mat[at(cx, cy)] = MAT.ROAD;
        reserved[at(cx, cy)] = 1;
      }
    }
  };
  const ringR = 30 + rand() * 6;
  for (let a = 0; a < Math.PI * 2; a += 0.6 / ringR) road(C + Math.cos(a) * ringR, C + Math.sin(a) * ringR);
  const spokes = [];
  const a0 = rand() * Math.PI * 2;
  for (let i = 0; i < 4; i++) {
    const a = a0 + (i * Math.PI) / 2 + (rand() - 0.5) * 0.5;
    spokes.push(a);
    // a road that wanders a little on its way out
    let x = C + Math.cos(a) * (CAMP_R + 1), y = C + Math.sin(a) * (CAMP_R + 1), d = a;
    for (let n = 0; n < 200 && inside(Math.round(x), Math.round(y)); n++) {
      road(x, y);
      d += (rand() - 0.5) * 0.08 + (a - d) * 0.05;
      x += Math.cos(d) * 0.6;
      y += Math.sin(d) * 0.6;
    }
  }

  // the camp: a gravel clearing in the middle
  for (let y = C - CAMP_R - 2; y <= C + CAMP_R + 2; y++) for (let x = C - CAMP_R - 2; x <= C + CAMP_R + 2; x++) {
    const d = Math.hypot(x + 0.5 - C, y + 0.5 - C);
    if (d <= CAMP_R + 2) reserved[at(x, y)] = 1;
    if (d <= CAMP_R) world.mat[at(x, y)] = d < CAMP_R - 1.5 || hash(x, y, 9) < 0.5 ? MAT.GRAVEL : MAT.DIRT;
  }

  // the ruins
  world.pois = [];
  const placed = [];
  const free = (x0, y0, w, h) => {
    for (const [px, py, pw, ph] of placed) if (x0 < px + pw + 3 && x0 + w + 3 > px && y0 < py + ph + 3 && y0 + h + 3 > py) return false;
    for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) {
      if (!inside(x, y) || Math.hypot(x + 0.5 - C, y + 0.5 - C) < CAMP_R + 4 || Math.hypot(x + 0.5 - C, y + 0.5 - C) > RADIUS - 3) return false;
    }
    return true;
  };
  for (const [key, count, rMin, rMax] of LAYOUT) {
    const T = TEMPLATES[key], h = T.rows.length, w = Math.max(...T.rows.map((r) => r.length));
    for (let n = 0; n < count; n++) {
      for (let tries = 0; tries < 300; tries++) {
        const a = rand() * Math.PI * 2, r = rMin + rand() * (rMax - rMin);
        const x0 = Math.round(C + Math.cos(a) * r - w / 2), y0 = Math.round(C + Math.sin(a) * r - h / 2);
        if (!free(x0, y0, w, h)) continue;
        placed.push([x0, y0, w, h]);
        stamp(world, T, x0, y0, reserved);
        world.pois.push({ key, name: T.name, x: (x0 + w / 2) * TILE, y: (y0 + h / 2) * TILE, cx: x0, cy: y0, w, h });
        break;
      }
    }
  }

  // the forest wall round the edge
  world.enclose();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (world.get(x, y) === WALL && !world.wallKind[at(x, y)]) world.wallKind[at(x, y)] = WK.FOREST;

  // camp: the generator in the middle, the workbench, the survivors' tents,
  // a campfire, floodlights the generator runs, and a ring of barricades
  const cx = C * TILE, cy = C * TILE;
  const put = (kind, x, y) => {
    const p = createProp(kind, x, y);
    world.addProp(p);
    return p;
  };
  world.generator = put('generator', cx, cy + 4);
  world.bench = put('workbench', cx + 44, cy - 18);
  put('tent', cx - 56, cy - 34);
  put('tent2', cx + 40, cy + 46);
  put('campfire', cx - 34, cy + 30);
  put('logs', cx - 60, cy + 6);
  put('crate', cx + 70, cy - 4);
  world.campLights = [];
  for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) world.campLights.push(put('floodlight', cx + ox * 78, cy + oy * 70 + 8));
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    // gaps where the roads come in
    if (spokes.some((s) => Math.abs(Math.atan2(Math.sin(a - s), Math.cos(a - s))) < 0.22)) continue;
    if (i % 3 === 2) continue;
    put('barricade', cx + Math.cos(a) * (CAMP_R + 1.2) * TILE, cy + Math.sin(a) * (CAMP_R + 1.2) * TILE + 6);
  }
  world.camp = { x: cx, y: cy, r: CAMP_R * TILE };
  world.npcSpots = { sarge: { x: cx - 30, y: cy - 6 }, trader: { x: cx + 26, y: cy + 32 } };
  world.spawn = { x: cx, y: cy + 30 };

  // wrecks along the roads
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (world.mat[at(x, y)] !== MAT.ROAD || hash(x, y, 31) > 0.012 || Math.hypot(x - C, y - C) < CAMP_R + 4) continue;
    if (world.propsNear((x + 0.5) * TILE, (y + 0.9) * TILE, 40).length) continue;
    put(CARS[(hash(x, y, 32) * CARS.length) | 0], (x + 0.5) * TILE, (y + 0.9) * TILE);
  }

  // the woods: thicker in places, thin in others; bushes and rocks between
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    if (!world.isFloor(x, y) || reserved[at(x, y)]) continue;
    const near = Math.hypot(x + 0.5 - C, y + 0.5 - C);
    if (near < CAMP_R + 4) continue;
    const dense = 0.035 + Math.max(0, noise2(x, y) - 0.35) * 0.32 + (near > RADIUS - 8 ? 0.12 : 0);
    const r = hash(x, y, 41), px = (x + 0.2 + hash(x, y, 42) * 0.6) * TILE, py = (y + 0.5 + hash(x, y, 43) * 0.4) * TILE;
    if (r < dense) {
      if (world.blocked[at(x - 1, y)] || world.blocked[at(x, y - 1)] || world.blocked[at(x - 1, y - 1)]) continue;   // keep trees apart
      put(TREES[(hash(x, y, 44) * TREES.length) | 0], px, py);
    } else if (r < dense + 0.03) {
      put(hash(x, y, 45) < 0.5 ? 'bush' : 'bush2', px, py);
    } else if (r < dense + 0.038) {
      put('rock', px, py);
    } else if (r < dense + 0.04) {
      put(hash(x, y, 46) < 0.5 ? 'logs' : 'junk', px, py);
    }
  }

  // where zombies can come from: open ground away from the camp
  world.spawnCells = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (world.isOpen(x, y) && Math.hypot(x - C, y - C) > CAMP_R + 8) world.spawnCells.push([x, y]);
  }
  world.radius = RADIUS * TILE;
  world.center = { x: C * TILE, y: C * TILE };
}

// Stamp a building plan with its top-left cell at (x0, y0).
function stamp(world, T, x0, y0, reserved) {
  const S = APOC_SIZE;
  T.rows.forEach((row, j) => {
    [...row].forEach((ch, i) => {
      const x = x0 + i, y = y0 + j, k = y * S + x;
      if (ch === ' ') return;
      reserved[k] = 1;
      if (ch === '#') {
        world.set(x, y, WALL);
        world.wallKind[k] = T.wall ?? WK.BRICK;
        return;
      }
      if (ch === '=') {
        world.set(x, y, LOW);
        world.wallKind[k] = WK.FENCE;
        return;
      }
      world.set(x, y, FLOOR);
      const indoor = ch === '.' || ch === 'D' || (T.floor && T.rows[j][i] !== ',' && insideWalls(T, i, j));
      world.mat[k] = ch === ',' ? T.outside ?? MAT.CONCRETE : indoor ? T.floor ?? MAT.CONCRETE : T.outside ?? MAT.CONCRETE;
      const kind = PROP_FOR[ch];
      if (!kind) return;
      const p = createProp(kind === 'car' ? CARS[(hash(x, y, 5) * CARS.length) | 0] : kind, (x + 0.5) * TILE, (y + 1) * TILE - (world.get(x, y + 1) === WALL ? 6 : 1));
      if (T.loot?.[ch]) p.loot = T.loot[ch];
      if (kind === 'crate' && !p.loot) p.loot = 'supplies';
      if (kind === 'locker' && !p.loot) p.loot = 'tools';
      if (kind === 'ammobox' && !p.loot) p.loot = 'ammo';
      world.addProp(p);
    });
  });
  for (const [rx0, ry0, rx1, ry1, style] of T.roofs ?? []) world.roofs.push(new Roof(x0 + rx0, y0 + ry0, x0 + rx1, y0 + ry1, style));
}

// Is plan cell (i, j) between walls on its row (inside a building)?
function insideWalls(T, i, j) {
  const row = T.rows[j];
  return row.lastIndexOf('#', i) >= 0 && row.indexOf('#', i) >= 0;
}

// ---------- roofs ----------
// A roof sits on top of its building's walls and hides the inside. Walk in
// (or stand behind it) and it fades out so you can see. It y-sorts with
// everything else on the building's front wall, so what's in front of the
// building still draws over it.

const ROOF_COL = {
  flat: ['#55584f', '#4a4d45', '#62665b', '#3b3e37'],
  metal: ['#4a5a44', '#3e4c39', '#5a6c52', '#2f3a2b'],
  shingle: ['#6e3a2c', '#5e3024', '#7e4636', '#46241b'],
  shingle2: ['#3e4a5a', '#34404e', '#4c5a6c', '#283240'],
  canopy: ['#c9ccc4', '#b4b7ae', '#dfe1da', '#a8382e'],
};

export class Roof {
  constructor(x0, y0, x1, y1, style) {
    Object.assign(this, { x0, y0, x1, y1, style });
    this.l = x0 * TILE;
    this.t = y0 * TILE - WALL_H;
    this.r = (x1 + 1) * TILE;
    this.b = (y1 + 1) * TILE - WALL_H;
    this.x = (this.l + this.r) / 2;
    this.y = (y1 + 1) * TILE;
    this.sortY = this.y - 0.5;
    this.alpha = 1;
    this.img = roofArt(this.r - this.l, this.b - this.t, style);
  }

  // inside the building, or hidden behind it: see through
  update(dt, f) {
    const inside = f && f.x > this.l + 2 && f.x < this.r - 2 && f.y > this.t + WALL_H && f.y < this.y + 2;
    const behind = f && f.x > this.l && f.x < this.r && f.y - 20 < this.b && f.y > this.t - 6;
    const want = inside ? 0.08 : behind ? 0.45 : 1;
    this.alpha += (want - this.alpha) * Math.min(1, dt * 8);
  }

  lightBox() {
    return { x: this.l, y: this.t, w: this.r - this.l, h: this.b - this.t + 1 };
  }
  lightRows() {
    return [this.y + 1];
  }
  lightRegions() {
    return [{ y0: 0, y1: this.b - this.t, ambient: true }];   // the sky lights it, not the floor
  }

  draw(ctx) {
    if (this.alpha < 0.02) return;
    ctx.globalAlpha = this.alpha;
    ctx.drawImage(this.img, this.l, this.t);
    ctx.globalAlpha = 1;
  }
}

function roofArt(w, h, style) {
  const [c, g] = makeCanvas(w, h);
  const [a, b, hi, dark] = ROOF_COL[style] ?? ROOF_COL.flat;
  rect(g, '#10140d', 0, 0, w, h);
  rect(g, a, 1, 1, w - 2, h - 2);
  if (style.startsWith('shingle')) {
    // overlapping rows of shingles, a ridge along the middle
    for (let y = 2; y < h - 2; y += 4) {
      rect(g, b, 1, y + 3, w - 2, 1);
      for (let x = 1 + ((y / 4) % 2) * 3; x < w - 2; x += 6) rect(g, dark, x, y, 1, 3);
    }
    rect(g, hi, 1, Math.floor(h / 2) - 1, w - 2, 2);
    rect(g, dark, 1, Math.floor(h / 2) + 1, w - 2, 1);
  } else if (style === 'metal') {
    for (let x = 2; x < w - 2; x += 4) {
      rect(g, hi, x, 1, 1, h - 2);
      rect(g, b, x + 2, 1, 1, h - 2);
    }
  } else if (style === 'canopy') {
    for (let x = 1; x < w - 1; x += 8) rect(g, b, x, 1, 1, h - 2);
    rect(g, dark, 1, h - 5, w - 2, 3);     // the red trim
    rect(g, '#e8e4d6', 1, h - 4, w - 2, 1);
  } else {
    // a flat roof: gravel, a parapet, an AC unit and a vent or two
    for (let i = 0; i < (w * h) / 18; i++) rect(g, (i & 1) ? b : hi, 2 + ((hash(i, w) * (w - 4)) | 0), 2 + ((hash(h, i) * (h - 4)) | 0), 1, 1);
    rect(g, hi, 1, 1, w - 2, 2);
    rect(g, dark, 1, h - 3, w - 2, 2);
    const ux = Math.round(w * 0.3), uy = Math.round(h * 0.35);
    rect(g, '#10140d', ux, uy, 14, 10);
    rect(g, '#8d9c9c', ux + 1, uy + 1, 12, 8);
    rect(g, '#657575', ux + 3, uy + 3, 8, 4);
    rect(g, '#10140d', Math.round(w * 0.7), Math.round(h * 0.6), 5, 5);
    rect(g, '#4c5455', Math.round(w * 0.7) + 1, Math.round(h * 0.6) + 1, 3, 3);
  }
  return c;
}

// ---------- ground and wall art ----------

export function drawGround(world, g, cx, cy, m) {
  const x = cx * TILE, y = cy * TILE, r = hash(cx, cy), r2 = hash(cx, cy, 7);
  const isWall = (ox, oy) => world.isWall(cx + ox, cy + oy);
  const dot = (col, n, s = 1) => {
    for (let i = 0; i < n; i++) rect(g, col, x + ((hash(cx, cy, 100 + i) * (16 - s)) | 0), y + ((hash(cx, cy, 200 + i) * (16 - s)) | 0), s, s);
  };
  switch (m) {
    case MAT.GRASS: {
      const shade = (cx * 7 + cy * 13) % 5 < 2 ? '#3f5a2c' : '#42602f';
      rect(g, shade, x, y, 16, 16);
      dot('#4c6c36', 6, 2);
      dot('#55753b', 4);
      dot('#33492a', 5);
      if (r < 0.08) { rect(g, '#d9d4c0', x + 6, y + 7, 1, 1); rect(g, '#e8b84a', x + 10, y + 4, 1, 1); }   // flowers
      if (r2 < 0.15) { rect(g, '#5e7a40', x + 3, y + 9, 1, 3); rect(g, '#5e7a40', x + 4, y + 8, 1, 3); }   // a tuft
      break;
    }
    case MAT.DIRT:
      rect(g, '#5a4a34', x, y, 16, 16);
      dot('#6a5a42', 6, 2);
      dot('#4a3c2a', 6);
      dot('#7a6a4e', 3);
      break;
    case MAT.GRAVEL:
      rect(g, '#5e5a50', x, y, 16, 16);
      dot('#6e6a5e', 10);
      dot('#4e4a42', 8);
      dot('#807a6c', 4);
      break;
    case MAT.ROAD: {
      rect(g, '#34373a', x, y, 16, 16);
      dot('#3e4246', 8);
      dot('#2a2c2e', 6);
      if (r < 0.06) { rect(g, '#25272a', x + 3, y + 5, 7, 1); rect(g, '#25272a', x + 9, y + 6, 1, 4); }   // crack
      if (r2 < 0.03) { rect(g, '#1e2022', x + 5, y + 5, 6, 4); rect(g, '#2a2c2e', x + 6, y + 6, 4, 2); }  // pothole
      // worn edges where it meets the verge
      const side = (ox, oy) => world.mat[(cy + oy) * world.w + cx + ox] !== MAT.ROAD;
      if (side(0, -1)) rect(g, '#2b2d2f', x, y, 16, 1);
      if (side(0, 1)) rect(g, '#3f4246', x, y + 15, 16, 1);
      break;
    }
    case MAT.CONCRETE:
      rect(g, '#646760', x, y, 16, 16);
      rect(g, '#585b55', x, y + 15, 16, 1);
      rect(g, '#585b55', x + 15, y, 1, 16);
      rect(g, '#6f726a', x, y, 15, 1);
      dot('#5c5f58', 5);
      if (r < 0.1) { rect(g, 'rgba(30, 26, 20, 0.3)', x + 3, y + 4, 8, 5); }   // oil stain
      break;
    case MAT.WOOD:
      for (let i = 0; i < 4; i++) {
        rect(g, (cy + i) % 2 ? '#6e4a2c' : '#74502f', x, y + i * 4, 16, 4);
        rect(g, '#4e341f', x, y + i * 4 + 3, 16, 1);
        rect(g, '#4e341f', x + ((hash(cx, cy, i) * 14) | 0), y + i * 4, 1, 3);
      }
      break;
    case MAT.TILES:
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) rect(g, (i + j) % 2 ? '#8a8a7e' : '#9a998c', x + i * 8, y + j * 8, 8, 8);
      rect(g, '#6e6e64', x, y + 15, 16, 1);
      rect(g, '#6e6e64', x + 15, y, 1, 16);
      if (r < 0.2) rect(g, 'rgba(40, 34, 24, 0.25)', x + 2, y + 6, 10, 6);   // grime
      break;
  }
  // contact shadows from walls above / beside
  if (isWall(0, -1)) {
    rect(g, 'rgba(8, 10, 6, 0.5)', x, y, 16, 2);
    rect(g, 'rgba(8, 10, 6, 0.25)', x, y + 2, 16, 3);
  }
  if (isWall(-1, 0)) rect(g, 'rgba(8, 10, 6, 0.25)', x, y, 2, 16);
  if (isWall(1, 0)) rect(g, 'rgba(8, 10, 6, 0.18)', x + 14, y, 2, 16);
}

const WALL_COL = {
  [WK.BRICK]: { top: '#3a2a24', hi: '#6a4a3c', edge: '#140e0b', face: '#7a3a2c', faceHi: '#8e4a3a', line: '#4e2a20' },
  [WK.WOOD]: { top: '#3a2c20', hi: '#6a5238', edge: '#140f0a', face: '#6e4a2c', faceHi: '#83603c', line: '#4a3220' },
  [WK.CONCRETE]: { top: '#40423e', hi: '#6a6d66', edge: '#141513', face: '#5e615b', faceHi: '#73766e', line: '#474a44' },
  [WK.FOREST]: { top: '#16241a', hi: '#2c4430', edge: '#0a100b', face: '#2a2016', faceHi: '#3a2c1e', line: '#18120c' },
  [WK.FENCE]: { top: '#5e6466', hi: '#8d9c9c', edge: '#141616', face: '#3a3e40', faceHi: '#8d9c9c', line: '#5e6466' },
};

export function drawOutdoorWall(world, g, cx, cy, kind) {
  const x = cx * TILE, type = world.get(cx, cy), low = type === LOW;
  const h = low ? LOW_H : WALL_H, oy = WALL_H - h, P = WALL_COL[kind];
  const same = (ox, oyy) => world.get(cx + ox, cy + oyy) === type;
  const up = same(0, -1), down = world.isWall(cx, cy + 1), left = same(-1, 0), right = same(1, 0);

  if (kind === WK.FOREST) {
    // the edge of the forest: a mass of dark tree tops, trunks underneath
    rect(g, P.top, x, oy, 16, 16);
    for (let i = 0; i < 5; i++) {
      const bx = x + ((hash(cx, cy, 300 + i) * 14) | 0), by = oy + ((hash(cx, cy, 310 + i) * 13) | 0);
      rect(g, i % 2 ? '#1f3322' : '#24382a', bx, by, 4, 3);
      rect(g, P.hi, bx + 1, by, 2, 1);
    }
    if (!down) {
      const fy = 16 + oy;
      rect(g, '#120e0a', x, fy, 16, h);
      for (let i = 0; i < 3; i++) {
        const tx = x + 1 + ((hash(cx, cy, 320 + i) * 13) | 0);
        rect(g, P.face, tx, fy, 2, h);
        rect(g, P.faceHi, tx, fy, 1, h);
      }
      rect(g, '#1f3322', x, fy, 16, 2);
    }
    return;
  }

  if (kind === WK.FENCE) {
    // chain-link: a thin rail on top, posts, a mesh face
    if (!up && !left && !right && !same(0, 1)) rect(g, P.hi, x + 7, oy + 6, 2, 4);
    rect(g, P.top, x + (left ? 0 : 6), oy + 7, 16 - (left ? 0 : 6) - (right ? 0 : 6), 2);
    if (up || same(0, 1)) rect(g, P.top, x + 7, oy + (up ? 0 : 7), 2, (up ? 9 : 0) + (same(0, 1) ? 9 : 2));
    if (!down) {
      const fy = 16 + oy;
      for (let i = 0; i < 16; i += 2) for (let j = 0; j < h; j += 2) rect(g, '#7a8486', x + i + (j % 4 === 0 ? 0 : 1), fy + j, 1, 1);
      rect(g, P.hi, x, fy, 16, 1);
      if (cx % 3 === 0) rect(g, P.line, x + 7, fy, 2, h);
    }
    return;
  }

  // brick / wood / concrete
  rect(g, P.top, x, oy, 16, 16);
  const l0 = left ? 0 : 2, r0 = right ? 0 : 2;
  if (!up) rect(g, P.hi, x + l0, oy + 2, 16 - l0 - r0, 1);
  if (!same(0, 1)) rect(g, P.hi, x + l0, oy + 13, 16 - l0 - r0, 1);
  if (!left) rect(g, P.hi, x + 2, oy + (up ? 0 : 2), 1, 12);
  if (!right) rect(g, P.hi, x + 13, oy + (up ? 0 : 2), 1, 12);
  if (!up) rect(g, P.edge, x, oy, 16, 1);
  if (!left) rect(g, P.edge, x, oy, 1, 16);
  if (!right) rect(g, P.edge, x + 15, oy, 1, 16);
  if (down) return;
  const fy = 16 + oy;
  rect(g, P.face, x, fy, 16, h);
  rect(g, P.faceHi, x, fy, 16, 1);
  if (kind === WK.BRICK) {
    for (let j = 2; j < h; j += 3) {
      rect(g, P.line, x, fy + j, 16, 1);
      for (let i = (j % 6 === 2 ? 0 : 4); i < 16; i += 8) rect(g, P.line, x + i, fy + j - 2, 1, 2);
    }
  } else if (kind === WK.WOOD) {
    for (let i = 0; i < 16; i += 4) rect(g, P.line, x + i, fy + 1, 1, h - 1);
  } else {
    rect(g, P.line, x, fy + 5, 16, 1);
    if (hash(cx, cy, 12) < 0.3) rect(g, 'rgba(30, 30, 24, 0.3)', x + 3, fy + 1, 4, h - 2);   // water stain
  }
  // a broken window now and then
  if (kind !== WK.CONCRETE && !left === false && !right === false && hash(cx, cy, 13) < 0.25) {
    rect(g, '#10140d', x + 4, fy + 2, 8, 5);
    rect(g, '#1d2a30', x + 5, fy + 3, 6, 3);
    rect(g, '#5e7480', x + 6, fy + 3, 2, 1);
  }
  rect(g, '#0d100b', x, fy + h - 1, 16, 1);
  if (!left) rect(g, P.edge, x, fy, 1, h);
  if (!right) rect(g, P.edge, x + 15, fy, 1, h);
}
