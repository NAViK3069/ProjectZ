// An arena level, seen from the side: solid blocks, catwalks you can jump up
// through (and drop down through), ladders, lamps, things on the back wall,
// and the furniture / crates / drums standing about (props, see props.js).
//
// Each map is built in code (maps.js: fill / catwalk / ladder / prop calls) so
// it's easy to read and change, and drawn once into layers in its theme: the
// back (wall, or sky and skyline outdoors) with its fittings, and the front
// (blocks, catwalks). Indoors it's all wall behind; outdoors only where the
// map says there's a building (wall()), sky everywhere else.

import { makeCanvas, rect } from '../engine/pixel.js';

export const T = 16;
export const EMPTY = 0, SOLID = 1, PLAT = 2, LADDER = 3, ACID = 4;
export const LOW = 5, LOW_H = 6;   // a low ceiling: solid in its top 6 px only (a gap under it you can crouch through)
const HEADROOM = 4;   // rows of roof / sky added above every map (room for the cards along the top)

const hash = (x, y, s = 0) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// What each theme looks like: the back wall, the blocks' faces and walkable
// tops, the catwalks; the light (ambient: how bright it is away from lamps).
export const THEMES = {
  lab: { boost: 1.35, ambient: '#7a8494', back: 'lab', solid: ['#2b3a37', '#253331', '#a9b8ae', '#d6e0d6', '#6e7f76'], plat: ['#d2b048', '#7a6526', '#55625b'] },
  range: { boost: 1.2, ambient: '#8a94a0', back: 'lab', solid: ['#2e3a3e', '#283336', '#b0bcc0', '#e0e8ea', '#74828a'], plat: ['#d2b048', '#7a6526', '#55625b'] },
  warehouse: { boost: 1.3, ambient: '#8a8478', back: 'tin', solid: ['#4a4640', '#3e3a35', '#8d8676', '#bdb4a0', '#6a645a'], plat: ['#c8a23a', '#6e5a22', '#5a5850'] },
  office: { boost: 1.1, ambient: '#9a968c', back: 'office', solid: ['#4e4a52', '#423e46', '#7a6a5e', '#a08c7a', '#5e5048'], plat: ['#9aa0a8', '#5a6068', '#6a7078'] },
  roof: { boost: 1.3, ambient: '#7c88a8', back: 'sky', sky: ['#0d1430', '#2a2350', '#5a3a62'], night: true, solid: ['#5a3a30', '#4a302a', '#7e7a72', '#a8a49a', '#5a5650'], plat: ['#7a8288', '#3a4046', '#4a5056'] },
  site: { ambient: '#c8b8a4', back: 'sky', sky: ['#3a5a8a', '#c87a5a', '#f2b070'], night: false, solid: ['#9a3a2a', '#7a2e22', '#b84a36', '#e06a4a', '#6a2a20'], plat: ['#b8864a', '#6a4a26', '#8a6a42'], ground: ['#6a5238', '#5a4430', '#8a6e4a', '#a8885a', '#4a3a28'] },
  metro: { boost: 1.15, ambient: '#8e9298', back: 'tile', solid: ['#3c4248', '#32383e', '#8c9298', '#c4c8cc', '#5c6268'], plat: ['#c8a23a', '#6e5a22', '#5a5850'] },
  mine: { boost: 1.4, ambient: '#6a6258', back: 'rock', solid: ['#3e342a', '#342b22', '#6e5e48', '#8e7c60', '#4e4234'], plat: ['#8a6a42', '#4a3620', '#5a4630'] },
  sand: { ambient: '#d0bc9c', back: 'sky', sky: ['#4a86b8', '#a8c8d0', '#f0d8a8'], night: false, brick: '#6a553c', solid: ['#a88a5e', '#927650', '#c8aa78', '#e4cc9c', '#7e6644'], plat: ['#8a6a42', '#4a3620', '#6a5030'], ground: ['#b89a68', '#a88a5a', '#d8bc84', '#ecd6a4', '#8e744c'] },
  harbor: { boost: 1.35, ambient: '#7c88a8', back: 'sky', sky: ['#0a1228', '#1a2648', '#34466a'], night: true, sea: '#12304a', brick: '#2a3038', solid: ['#2a3a4e', '#223040', '#6a7a88', '#94a4b0', '#4a5a68'], plat: ['#c8783a', '#6a3e20', '#4a4640'] },
};

export class Level {
  // map: { name, w, h, theme, openBottom, build(L) } (see maps.js)
  constructor(map) {
    this.map = map;
    this.name = map.name;
    this.w = map.w;
    this.h = map.h;
    this.theme = THEMES[map.theme] ?? THEMES.lab;
    this.themeKey = map.theme;
    this.openBottom = !!map.openBottom;   // fall off the bottom and you're gone
    this.ambient = this.theme.ambient;
    this.grid = new Uint8Array(this.w * this.h);
    this.walls = this.theme.back === 'sky' ? new Uint8Array(this.w * this.h) : null;   // outdoors: where there's a building behind
    this.lamps = [];      // { cx, cy, pole } (hanging from the ceiling, or up on a pole)
    this.deco = [];       // back-wall fittings: { kind, x, y, ... } in cells
    this.props = [];      // furniture, crates, drums: { kind, x, y } (feet, px), made into Props by the game
    this.spawns = [];
    this.racks = [];      // training: weapons laid out to pick up
    this.dummies = [];    // training: target dummies { x, y, patrol }
    this.signs = [];      // training: tips painted on the wall { x, y, text }
    this.pads = [];       // jump pads: { cx, cy } (the cell standing on it)
    map.build(this);
    this.padTop(map.pad ?? HEADROOM);
    this.render();
  }

  // Headroom: rows added above the map once it's built - solid roof indoors,
  // open sky outdoors - so the camera can show the top floor below the
  // fighters' cards along the top of the screen. Everything moves down with it.
  padTop(pad) {
    if (pad <= 0) return;
    const { w, h } = this, grid = new Uint8Array(w * (h + pad));
    const roof = this.theme.back === 'sky' ? EMPTY : SOLID;
    grid.fill(roof, 0, w * pad);
    grid.set(this.grid, w * pad);
    this.grid = grid;
    if (this.walls) {
      const walls = new Uint8Array(w * (h + pad));
      walls.set(this.walls, w * pad);
      this.walls = walls;
    }
    this.h = h + pad;
    this.pad = pad;
    for (const l of this.lamps) l.cy += pad;
    for (const d of this.deco) if (d.y !== undefined) d.y += pad;
    for (const s of this.signs) s.y += pad;
    for (const d of this.dummies) d.y += pad;
    for (const p of this.props) p.y += pad * T;
    for (const s of this.spawns) s.y += pad * T;
    for (const p of this.pads) p.cy += pad;
  }

  get(x, y) {
    if (x < 0 || x >= this.w) return SOLID;
    if (y < 0) return EMPTY;
    if (y >= this.h) return this.openBottom ? EMPTY : SOLID;
    return this.grid[y * this.w + x];
  }
  set(x, y, v) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.grid[y * this.w + x] = v;
  }
  fill(x0, y0, x1, y1, v) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, v);
  }
  solidAt(px, py) {
    const v = this.get(Math.floor(px / T), Math.floor(py / T));
    return v === SOLID || (v === LOW && ((py % T) + T) % T < LOW_H);
  }
  // ---- for the map builders ----
  row(y, x0, x1, v = SOLID) { this.fill(x0, y, x1, y, v); }
  shell() {
    this.fill(0, 0, this.w - 1, 0, SOLID);
    this.fill(0, this.h - 1, this.w - 1, this.h - 1, SOLID);
    this.fill(0, 0, 0, this.h - 1, SOLID);
    this.fill(this.w - 1, 0, this.w - 1, this.h - 1, SOLID);
  }
  ladder(x, y0, y1) { this.fill(x, y0, x, y1, LADDER); }
  lamp(cx, cy, pole = false) { this.lamps.push({ cx, cy, pole }); }
  wall(x0, y0, x1, y1) {
    if (!this.walls) return;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.walls[y * this.w + x] = 1;
  }
  isWall(cx, cy) {
    return !this.walls || (cx >= 0 && cy >= 0 && cx < this.w && cy < this.h && this.walls[cy * this.w + cx] === 1);
  }
  // a prop standing on the floor whose top is row `floor`, at cell column cx (+ dx px)
  prop(kind, cx, floor, dx = 0, lift = 0) { this.props.push({ kind, x: (cx + 0.5) * T + dx, y: floor * T - lift }); }
  spawn(cx, floor) { this.spawns.push({ x: (cx + 0.5) * T, y: floor * T }); }
  pad(cx, floor) { this.pads.push({ cx, cy: floor - 1 }); }
  // is someone with their feet at (px, py) standing on a jump pad?
  padAt(px, py) {
    const cx = Math.floor(px / T), cy = Math.floor((py - 1) / T);
    return this.pads.some((p) => p.cx === cx && p.cy === cy);
  }

  // ---------- art ----------

  render() {
    const PW = this.w * T, PH = this.h * T;
    const [back, bg] = makeCanvas(PW, PH);
    if (this.theme.back === 'sky') this.drawSky(bg, PW, PH);
    for (let cy = 0; cy < this.h; cy++) for (let cx = 0; cx < this.w; cx++) if (this.isWall(cx, cy)) this.drawBack(bg, cx, cy);
    for (const d of this.deco) this.drawDeco(bg, d);
    for (const s of this.signs) this.drawSign(bg, s);
    for (let cy = 0; cy < this.h; cy++) for (let cx = 0; cx < this.w; cx++) if (this.get(cx, cy) === LADDER) this.drawLadder(bg, cx, cy);
    this.back = back;

    const [front, ft] = makeCanvas(PW, PH);
    for (let cy = 0; cy < this.h; cy++) for (let cx = 0; cx < this.w; cx++) {
      const v = this.get(cx, cy);
      if (v === SOLID) this.drawSolid(ft, cx, cy);
      else if (v === PLAT) this.drawPlat(ft, cx, cy);
      else if (v === LOW) {
        // the top of a solid block, with an underside
        ft.save();
        ft.beginPath();
        ft.rect(cx * T, cy * T, T, LOW_H);
        ft.clip();
        this.drawSolid(ft, cx, cy);
        ft.restore();
        rect(ft, this.theme.solid[4], cx * T, cy * T + LOW_H - 3, T, 1);
        rect(ft, '#141c1b', cx * T, cy * T + LOW_H - 2, T, 2);
      }
    }
    for (const p of this.pads) this.drawPad(ft, p.cx, p.cy);
    this.front = front;
  }

  // a jump pad: a steel plate on the floor, its lit chevrons pointing up
  drawPad(g, cx, cy) {
    const x = cx * T, y = cy * T + T;
    rect(g, '#0e1413', x, y - 5, T, 5);
    rect(g, '#4a5a5c', x + 1, y - 4, T - 2, 4);
    rect(g, '#7ef0e0', x + 2, y - 4, T - 4, 1);
    for (const dy of [7, 10]) for (let i = 0; i < 4; i++) {
      rect(g, '#7ef0e0', x + 7 - i, y - dy - 3 + i, 1, 1);
      rect(g, '#7ef0e0', x + 8 + i, y - dy - 3 + i, 1, 1);
    }
  }

  // Outdoors: the sky (a gradient, stars or clouds, the moon or the sun) and a city skyline far off.
  drawSky(g, PW, PH) {
    const th = this.theme, [a, b, c] = th.sky;
    const gr = g.createLinearGradient(0, 0, 0, PH);
    gr.addColorStop(0, a);
    gr.addColorStop(0.6, b);
    gr.addColorStop(1, c);
    g.fillStyle = gr;
    g.fillRect(0, 0, PW, PH);
    if (th.night) {
      for (let i = 0; i < 160; i++) rect(g, hash(i, 7) < 0.15 ? '#ffffff' : '#9aa4c8', (hash(i, 1) * PW) | 0, (hash(i, 2) * PH * 0.6) | 0, 1, 1);
      // the moon
      g.fillStyle = 'rgba(255, 250, 220, 0.12)';
      g.beginPath(); g.arc(PW * 0.78, 70, 34, 0, Math.PI * 2); g.fill();
      rect(g, '#f2eed8', PW * 0.78 - 12, 58, 24, 24); rect(g, '#f2eed8', PW * 0.78 - 14, 62, 28, 16); rect(g, '#d8d2b8', PW * 0.78 - 4, 64, 5, 4);
    } else {
      // a low sun and long clouds
      g.fillStyle = 'rgba(255, 230, 160, 0.25)';
      g.beginPath(); g.arc(PW * 0.25, PH * 0.62, 60, 0, Math.PI * 2); g.fill();
      rect(g, '#ffe8a0', PW * 0.25 - 18, PH * 0.62 - 18, 36, 36);
      for (let i = 0; i < 12; i++) {
        const x = (hash(i, 11) * PW) | 0, y = 20 + ((hash(i, 12) * PH * 0.4) | 0), w = 40 + ((hash(i, 13) * 120) | 0);
        rect(g, 'rgba(255, 225, 200, 0.35)', x, y, w, 4);
        rect(g, 'rgba(255, 240, 220, 0.25)', x + 10, y - 3, w * 0.6, 3);
      }
    }
    // a skyline, two layers deep
    for (const [layer, col, win] of [[0, th.night ? '#141a32' : '#6a5a72', th.night ? '#e8c860' : null], [1, th.night ? '#0a0e1e' : '#4a3e52', th.night ? '#ffd870' : '#2a2234']]) {
      let x = -10;
      while (x < PW) {
        const w = 24 + ((hash(x, layer, 3) * 50) | 0), h = (layer ? 90 : 140) + ((hash(x, layer, 4) * (layer ? 120 : 160)) | 0);
        rect(g, col, x, PH - h, w, h);
        if (hash(x, layer, 5) < 0.3) rect(g, col, x + w / 2 - 1, PH - h - 14, 2, 14);   // an antenna
        if (win) for (let wy = PH - h + 6; wy < PH - 4; wy += 7) for (let wx = x + 3; wx < x + w - 3; wx += 5) if (hash(wx, wy, layer) < (th.night ? 0.22 : 0.5)) rect(g, win, wx, wy, 2, 3);
        x += w + ((hash(x, layer, 6) * 8) | 0);
      }
    }
    // (by the sea: the water, up to the quay)
    if (th.sea) {
      rect(g, th.sea, 0, PH - T * 3, PW, T * 3);
      for (let i = 0; i < 120; i++) rect(g, 'rgba(160, 200, 230, 0.22)', (hash(i, 21) * PW) | 0, PH - T * 3 + ((hash(i, 22) * T * 3) | 0), 6 + ((hash(i, 23) * 20) | 0), 1);
    }
  }

  drawBack(g, cx, cy) {
    const x = cx * T, y = cy * T, kind = this.theme.back;
    if (kind === 'lab') {
      // big lab wall panels: 2x2 tiles each, seams, rivets, the odd grime streak
      const light = ((cx >> 1) + (cy >> 1)) % 2;
      const range = this.themeKey === 'range';
      rect(g, range ? (light ? '#253238' : '#222e34') : light ? '#1b2a28' : '#192624', x, y, T, T);
      if (cx % 2 === 0) rect(g, '#121c1a', x, y, 1, T);
      if (cy % 2 === 0) rect(g, '#121c1a', x, y, T, 1);
      if (cx % 2 === 0 && cy % 2 === 0) { rect(g, '#2a3c38', x + 2, y + 2, 1, 1); rect(g, '#2a3c38', x + 13, y + 2, 1, 1); }
      if (hash(cx, cy, 3) < 0.06) rect(g, 'rgba(10, 16, 14, 0.5)', x + 4, y, 3, T);
    } else if (kind === 'tin') {
      // corrugated metal walls: ribs every few pixels, rust streaks, a steel frame every 4 tiles
      rect(g, '#2e2c28', x, y, T, T);
      for (let i = 0; i < T; i += 4) { rect(g, '#3a3732', x + i, y, 2, T); rect(g, '#24221f', x + i + 3, y, 1, T); }
      if (hash(cx, cy, 5) < 0.12) rect(g, 'rgba(110, 60, 30, 0.35)', x + 5, y, 2, T);
      if (cx % 4 === 0) { rect(g, '#1a1916', x, y, 3, T); rect(g, '#44403a', x + 1, y, 1, T); }
      if (cy % 6 === 0) rect(g, '#1a1916', x, y, T, 2);
    } else if (kind === 'office') {
      // painted plaster, a skirting board at the floor, a ceiling strip under each floor
      rect(g, ((cx >> 2) % 2) ? '#5e5a5a' : '#625e5c', x, y, T, T);
      if (hash(cx, cy, 9) < 0.08) rect(g, 'rgba(40, 36, 36, 0.25)', x + 6, y + 3, 2, 2);
      if (this.get(cx, cy + 1) === SOLID) { rect(g, '#3a3434', x, y + 12, T, 4); rect(g, '#7a706a', x, y + 12, T, 1); }
      if (this.get(cx, cy - 1) === SOLID) { rect(g, '#c8c4bc', x, y, T, 3); rect(g, '#8a8680', x, y + 3, T, 1); }
    } else if (kind === 'tile') {
      // a station's wall: small tiles, a coloured band along it
      rect(g, (cx + cy) % 2 ? '#465054' : '#434c50', x, y, T, T);
      rect(g, '#343c40', x, y, T, 1);
      rect(g, '#343c40', x, y, 1, T);
      if (cy % 8 === 3) rect(g, '#b8863a', x, y + 5, T, 6);
    } else if (kind === 'rock') {
      // bare rock, dug out
      rect(g, '#241d17', x, y, T, T);
      for (let i = 0; i < 3; i++) rect(g, hash(cx, cy, i) < 0.5 ? '#2e251d' : '#1a1510', x + ((hash(cx, cy, i + 3) * 12) | 0), y + ((hash(cx, cy, i + 6) * 14) | 0), 2 + ((hash(cx, cy, i + 9) * 5) | 0), 2);
    } else {
      // outdoors, a building's wall behind: brick, the odd dark window
      rect(g, this.theme.brick ?? (this.themeKey === 'site' ? '#4a3e38' : '#3a2a28'), x, y, T, T);
      for (let j = 0; j < T; j += 4) {
        rect(g, 'rgba(0, 0, 0, 0.25)', x, y + j, T, 1);
        rect(g, 'rgba(0, 0, 0, 0.25)', x + ((j / 4 + cy) % 2 ? 7 : 0), y + j, 1, 4);
      }
      if ((cx % 3 === 1) && (cy % 3 === 1)) { rect(g, '#14181e', x + 3, y + 3, 10, 10); rect(g, this.theme.night && hash(cx, cy) < 0.4 ? '#d8b860' : '#2a3442', x + 4, y + 4, 8, 8); rect(g, '#14181e', x + 7, y + 4, 1, 8); }
    }
    // a hazard band along the bottom of the wall, indoors
    if (kind !== 'sky' && kind !== 'office' && kind !== 'tile' && kind !== 'rock' && this.get(cx, cy + 1) === SOLID && this.get(cx, cy) !== SOLID) {
      rect(g, '#14201e', x, y + 12, T, 4);
      for (let i = 0; i < T; i += 4) rect(g, (i / 4 + cx) % 2 ? '#c9a83a' : '#1b1f1c', x + i, y + 13, 4, 2);
    }
  }

  drawSolid(g, cx, cy) {
    const x = cx * T, y = cy * T;
    const open = (ox, oy) => { const v = this.get(cx + ox, cy + oy); return v !== SOLID && v !== LOW; };
    let [body, low, top, topHi, topLo] = this.theme.solid;
    // outdoors the ground is dirt, buildings are brick under a concrete parapet
    const ground = this.theme.ground && cy >= this.h - 2;
    if (ground) [body, low, top, topHi, topLo] = this.theme.ground;
    rect(g, body, x, y, T, T);
    rect(g, low, x, y + 8, T, 8);
    if (this.themeKey === 'roof' && !open(0, -1)) {
      // a building's face: brick with lit windows
      for (let j = 0; j < T; j += 4) { rect(g, 'rgba(0, 0, 0, 0.22)', x, y + j, T, 1); rect(g, 'rgba(0, 0, 0, 0.22)', x + ((j / 4 + cy) % 2 ? 7 : 0), y + j, 1, 4); }
      if (cx % 2 === 0 && cy % 2 === 0) { rect(g, '#141418', x + 3, y + 3, 9, 10); rect(g, hash(cx, cy, 2) < 0.45 ? '#e8c870' : '#2a3040', x + 4, y + 4, 7, 8); }
    } else if (this.themeKey === 'site' && !ground) {
      // red steel girders: an I-beam's flanges and web, rivets
      rect(g, '#5a1e16', x, y + 4, T, 8);
      rect(g, body, x, y + 6, T, 4);
      for (let i = 2; i < T; i += 6) rect(g, '#e8a088', x + i, y + 1, 1, 1);
    } else if (ground) {
      for (let i = 0; i < 4; i++) rect(g, hash(cx, cy, i) < 0.5 ? low : topLo, x + ((hash(cx, cy, i + 4) * 14) | 0), y + 4 + ((hash(cx, cy, i + 8) * 10) | 0), 2, 1);
    } else if ((cx + cy) % 3 === 0) rect(g, topLo, x + 3, y + 4, 2, 2);
    if (open(0, -1)) {
      rect(g, top, x, y, T, 3);          // the walkable edge
      rect(g, topHi, x, y, T, 1);
      rect(g, topLo, x, y + 3, T, 1);
      if (cx % 4 === 0) rect(g, topLo, x, y, 1, 3);
      if (this.themeKey === 'office') { rect(g, '#6a5a50', x, y, T, 3); rect(g, '#8a7a6a', x, y, T, 1); }   // carpet
    }
    if (open(0, 1)) { rect(g, '#141c1b', x, y + 14, T, 2); rect(g, topLo, x, y + 13, T, 1); }
    if (open(-1, 0)) { rect(g, topLo, x, y, 2, T); rect(g, '#141c1b', x, y, 1, T); }
    if (open(1, 0)) { rect(g, '#1a2321', x + 14, y, 2, T); rect(g, '#0e1413', x + 15, y, 1, T); }
  }

  drawPlat(g, cx, cy) {
    const x = cx * T, y = cy * T, [edge, edgeLo, mesh] = this.theme.plat;
    if (this.themeKey === 'site') {
      // scaffold boards: planks with their ends and a scaffold tube under them
      rect(g, '#0e1413', x, y, T, 1);
      rect(g, edge, x, y + 1, T, 3);
      rect(g, '#d8a86a', x, y + 1, T, 1);
      rect(g, edgeLo, x, y + 4, T, 1);
      if (cx % 2 === 0) rect(g, edgeLo, x, y + 1, 1, 3);
      rect(g, '#8a9096', x, y + 6, T, 1);
      if (cx % 3 === 0) rect(g, '#8a9096', x + 7, y + 6, 1, 8);
      return;
    }
    // a steel grating catwalk: coloured edge, see-through mesh, struts underneath
    rect(g, '#0e1413', x, y, T, 1);
    rect(g, edge, x, y + 1, T, 2);
    rect(g, edgeLo, x, y + 3, T, 1);
    for (let i = 0; i < T; i += 3) rect(g, mesh, x + i, y + 4, 2, 2);
    rect(g, '#2b3632', x, y + 6, T, 1);
    if (cx % 3 === 0) { rect(g, '#3b4a44', x + 7, y + 6, 2, 5); rect(g, '#2b3632', x + 5, y + 10, 6, 1); }
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

  drawSign(g, s) {
    // a stencilled tip on the wall (training)
    const x = s.x * T, y = s.y * T, w = s.text.length * 4 + 6;
    rect(g, '#0b100f', x - 1, y - 1, w + 2, 11);
    rect(g, '#2a3a3e', x, y, w, 9);
    rect(g, '#c9a83a', x, y, w, 1);
    drawStencil(g, s.text, x + 3, y + 2, '#e8e2d0');
  }

  drawDeco(g, d) {
    const x = d.x * T, y = d.y * T, K = '#0b100f';
    switch (d.kind) {
      case 'monitors':
        for (let i = 0; i < 3; i++) {
          rect(g, K, x + i * 15, y, 14, 11);
          rect(g, '#1d2f2e', x + i * 15 + 1, y + 1, 12, 9);
          rect(g, '#0a2a28', x + i * 15 + 2, y + 2, 10, 6);    // screens (they glow - see light.js)
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
        rect(g, K, x, y, 26, 72);
        rect(g, '#3a4a46', x + 1, y + 1, 24, 6);
        rect(g, '#3a4a46', x + 1, y + 65, 24, 6);
        rect(g, '#0f3a2c', x + 2, y + 7, 22, 58);
        rect(g, '#145a40', x + 3, y + 10, 20, 54);
        rect(g, '#1e7a54', x + 3, y + 10, 3, 54);
        for (let i = 0; i < 7; i++) rect(g, '#6ef0a8', x + 6 + ((hash(i, d.x) * 14) | 0), y + 14 + i * 7, 1, 1);
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
          rect(g, '#123a3a', x + 8 + i * 22, y + 12, 14, 42);
          rect(g, '#3a4c48', x + 6 + i * 22, y + 30, 18, 2);
        }
        rect(g, '#c9a83a', x + 4, y + 62, 88, 2);
        break;
      case 'sign': {
        const w = d.text.length * 4 + 8;
        rect(g, K, x, y, w, 11);
        rect(g, '#c9a83a', x + 1, y + 1, w - 2, 9);
        drawStencil(g, d.text, x + 4, y + 3, '#1b1f1c');
        break;
      }
      case 'vent':
        rect(g, K, x, y, 22, 14);
        rect(g, '#2f403c', x + 1, y + 1, 20, 12);
        for (let j = 3; j < 12; j += 3) rect(g, '#141c1b', x + 3, y + j, 16, 1);
        break;
      case 'window':
        rect(g, K, x, y, 46, 30);
        rect(g, '#3a4c46', x + 1, y + 1, 44, 28);
        rect(g, '#081412', x + 3, y + 3, 40, 24);
        rect(g, '#0e2420', x + 3, y + 18, 40, 9);
        rect(g, '#1d4a3e', x + 6, y + 5, 2, 10);
        rect(g, '#3a4c46', x + 22, y + 3, 2, 24);
        break;
      case 'citywindow': {
        // an office window onto the city at night
        const w = (d.w ?? 3) * T, h = (d.h ?? 2) * T;
        rect(g, K, x, y, w, h);
        rect(g, '#9a9490', x + 1, y + 1, w - 2, h - 2);
        rect(g, '#0e1428', x + 3, y + 3, w - 6, h - 6);
        for (let i = 0; i < 6; i++) {
          const bx = x + 4 + ((hash(i, d.x) * (w - 16)) | 0), bh = 6 + ((hash(i, d.y) * (h - 12)) | 0);
          rect(g, '#1a2036', bx, y + h - 3 - bh, 8, bh);
          for (let wy = y + h - bh; wy < y + h - 4; wy += 3) if (hash(bx, wy) < 0.4) rect(g, '#e8c860', bx + 2, wy, 1, 1);
        }
        for (let i = 1; i < (d.w ?? 3); i++) rect(g, '#9a9490', x + i * T, y + 1, 2, h - 2);
        break;
      }
      case 'door':
        rect(g, K, x, y, 22, 32);
        rect(g, '#2f403c', x + 1, y + 1, 20, 31);
        rect(g, '#1d2a28', x + 3, y + 4, 7, 26);
        rect(g, '#1d2a28', x + 12, y + 4, 7, 26);
        rect(g, '#c23a2e', x + 9, y + 1, 4, 2);
        break;
      case 'rollup':
        // a warehouse roll-up door
        rect(g, K, x, y, 48, 48);
        rect(g, '#5a5650', x + 1, y + 1, 46, 47);
        for (let j = 3; j < 47; j += 4) rect(g, '#3a3732', x + 1, y + j, 46, 1);
        rect(g, '#c9a83a', x + 1, y + 44, 46, 3);
        break;
      case 'shelves': {
        // tall steel shelving loaded with boxes
        const w = (d.w ?? 4) * T, h = (d.h ?? 5) * T;
        rect(g, '#1a1d1c', x, y, 2, h); rect(g, '#1a1d1c', x + w - 2, y, 2, h);
        for (let j = 10; j < h; j += 22) {
          rect(g, '#c86a2a', x, y + j, w, 2);
          for (let i = 3; i < w - 6; i += 9) if (hash(i, j, d.x) < 0.75) {
            const bw = 6 + ((hash(i, j) * 4) | 0), bh = 8 + ((hash(j, i) * 8) | 0);
            rect(g, '#3a2a18', x + i, y + j - bh, bw, bh); rect(g, '#9a7448', x + i + 1, y + j - bh + 1, bw - 2, bh - 1); rect(g, '#c8a070', x + i + 1, y + j - bh + 1, bw - 2, 1);
          }
        }
        break;
      }
      case 'forklift':
        rect(g, K, x, y, 34, 28);
        rect(g, '#d8a83a', x + 1, y + 8, 22, 14);
        rect(g, '#1a1a1a', x + 4, y + 1, 2, 9); rect(g, '#1a1a1a', x + 16, y + 1, 2, 9); rect(g, '#1a1a1a', x + 4, y + 1, 14, 2);
        rect(g, '#2a2a2a', x + 24, y, 3, 28); rect(g, '#5a5a5a', x + 27, y + 22, 7, 2);
        rect(g, '#111111', x + 3, y + 20, 7, 7); rect(g, '#111111', x + 15, y + 20, 7, 7);
        break;
      case 'pipes':
        for (const [oy, col] of [[3, '#34463f'], [8, '#3d3226']]) {
          rect(g, K, T, d.y * T + oy - 1, (this.w - 2) * T, 5);
          rect(g, col, T, d.y * T + oy, (this.w - 2) * T, 3);
          rect(g, '#55685f', T, d.y * T + oy, (this.w - 2) * T, 1);
          for (let i = 2; i < this.w - 2; i += 7) rect(g, K, i * T, d.y * T + oy - 1, 3, 5);
        }
        break;
      case 'whiteboard':
        rect(g, K, x, y, 40, 24); rect(g, '#e8ece8', x + 1, y + 1, 38, 22);
        rect(g, '#3a6ac8', x + 4, y + 5, 18, 1); rect(g, '#c83a3a', x + 6, y + 10, 24, 1); rect(g, '#3a3a3a', x + 4, y + 15, 14, 1);
        rect(g, '#8a8680', x + 2, y + 23, 36, 2);
        break;
      case 'plantpot':
        rect(g, K, x + 3, y + 18, 12, 14); rect(g, '#8a5a3a', x + 4, y + 19, 10, 12);
        for (let i = 0; i < 9; i++) rect(g, i % 2 ? '#3a8a4a' : '#2a6a3a', x + 2 + ((hash(i, d.x) * 12) | 0), y + ((hash(d.y, i) * 18) | 0), 3, 5);
        break;
      case 'clock':
        rect(g, K, x + 2, y + 2, 14, 14); rect(g, '#e8e4dc', x + 3, y + 3, 12, 12); rect(g, '#1a1a1a', x + 8, y + 5, 1, 4); rect(g, '#1a1a1a', x + 8, y + 9, 4, 1);
        break;
      case 'elevator':
        rect(g, K, x, y, 48, 32); rect(g, '#8a8e94', x + 1, y + 1, 46, 31); rect(g, '#6a6e74', x + 4, y + 4, 19, 28); rect(g, '#6a6e74', x + 25, y + 4, 19, 28);
        rect(g, '#3df07a', x + 22, y - 6, 4, 3);
        break;
      case 'crane':
        // a tower crane's mast and jib against the sky, its hook hanging
        for (let j = 0; j < (d.h ?? 18) * T; j += 8) { rect(g, '#c8a03a', x, y + j, 2, 8); rect(g, '#c8a03a', x + 10, y + j, 2, 8); rect(g, '#a8802a', x + (j % 16 ? 2 : 0), y + j + 3, 10, 1); }
        rect(g, '#c8a03a', x - 120, y, 220, 3); rect(g, '#a8802a', x - 120, y + 6, 220, 2);
        for (let i = -120; i < 100; i += 10) rect(g, '#a8802a', x + i, y + 2, 1, 5);
        rect(g, '#3a3a3a', x + 70, y + 8, 1, 90); rect(g, '#2a2a2a', x + 66, y + 98, 9, 6);
        rect(g, '#5a5a5a', x - 40, y - 8, 30, 8);
        break;
      case 'watertower':
        rect(g, '#2a201a', x + 4, y + 30, 3, 34); rect(g, '#2a201a', x + 37, y + 30, 3, 34); rect(g, '#2a201a', x + 20, y + 30, 3, 34);
        rect(g, K, x, y, 44, 32); rect(g, '#6a4a32', x + 1, y + 1, 42, 30);
        for (let i = 4; i < 44; i += 6) rect(g, '#5a3e2a', x + i, y + 1, 1, 30);
        rect(g, '#3a2a20', x + 1, y + 8, 42, 2); rect(g, '#3a2a20', x + 1, y + 22, 42, 2);
        rect(g, '#4a3424', x - 2, y - 6, 48, 6); rect(g, '#5a4434', x + 10, y - 12, 24, 6);
        break;
      case 'billboard':
        rect(g, K, x, y, 112, 46); rect(g, '#d84a3a', x + 2, y + 2, 108, 42);
        rect(g, '#ffd25a', x + 8, y + 8, 60, 10); rect(g, '#fff3e0', x + 8, y + 22, 40, 6); rect(g, '#fff3e0', x + 8, y + 32, 52, 6);
        rect(g, '#1a1a1a', x + 80, y + 8, 22, 30); rect(g, '#e8c870', x + 84, y + 12, 14, 10);
        rect(g, '#2a2a2a', x + 20, y + 46, 3, 24); rect(g, '#2a2a2a', x + 88, y + 46, 3, 24);
        break;
      case 'antenna':
        rect(g, '#2a2a2e', x + 7, y, 2, (d.h ?? 4) * T); for (let j = 4; j < (d.h ?? 4) * T; j += 10) rect(g, '#2a2a2e', x + 3, y + j, 10, 1);
        rect(g, '#ff3a3a', x + 7, y - 2, 2, 2);
        break;
      case 'cones':
        rect(g, '#e86a2a', x + 2, y + 8, 6, 8); rect(g, '#fff0e0', x + 3, y + 11, 4, 2); rect(g, '#e86a2a', x + 4, y + 4, 2, 4);
        break;
      case 'rack':
        // the training armory's gun rack: a pegboard with brackets
        rect(g, K, x, y, (d.w ?? 12) * T, (d.h ?? 6) * T);
        rect(g, '#3a3226', x + 1, y + 1, (d.w ?? 12) * T - 2, (d.h ?? 6) * T - 2);
        for (let j = 4; j < (d.h ?? 6) * T; j += 6) for (let i = 4; i < (d.w ?? 12) * T; i += 6) rect(g, '#2a2418', x + i, y + j, 1, 1);
        break;
      case 'gunlocker': {
        // training's gun locker: a steel cabinet, two glass doors, guns racked behind them
        const W = d.w * T, H = d.h * T, dw = (W - 6) / 2;
        rect(g, K, x, y, W, H);
        rect(g, '#3a4446', x + 1, y + 1, W - 2, H - 2);
        rect(g, '#2a3234', x + 1, y + 1, W - 2, 8);
        drawStencil(g, 'ARMS', x + W / 2 - 8, y + 2, '#d2b048');
        for (const dx of [2, 4 + dw]) {
          const gx = x + dx, gy = y + 11, gh = H - 17;
          rect(g, '#55626a', gx, gy, dw, gh);
          rect(g, '#121a1c', gx + 2, gy + 2, dw - 4, gh - 4);
          for (let r = 0; r < 4; r++) {
            // a gun's silhouette on its pegs: stock, receiver and grip, barrel
            const ry = gy + 6 + r * 10, len = 18 + ((hash(d.x + dx, r) * 14) | 0), sx = gx + 5;
            rect(g, '#2e3c3e', sx, ry, 6, 3);
            rect(g, '#34444a', sx + 6, ry, 10, 3);
            rect(g, '#2e3c3e', sx + 9, ry + 3, 2, 3);
            rect(g, '#2e3c3e', sx + 16, ry + 1, len - 16, 1);
            rect(g, '#55626a', sx + 2, ry - 2, 1, 2); rect(g, '#55626a', sx + len - 6, ry - 2, 1, 2);   // the pegs
          }
          for (let i = 0; i < 9; i++) rect(g, '#2a3e42', gx + 6 + i, gy + 14 - i, 1, 1);   // a shine on the glass
          for (let i = 0; i < 6; i++) rect(g, '#2a3e42', gx + 10 + i, gy + 14 - i, 1, 1);
        }
        rect(g, '#c8d0d4', x + W / 2 - 3, y + 26, 1, 8); rect(g, '#c8d0d4', x + W / 2 + 2, y + 26, 1, 8);   // the handles
        rect(g, '#1c2224', x, y + H - 4, W, 4);
        break;
      }
      case 'skillbay': {
        // training's skill bay: a console with a screen (what's on it glows - see light.js)
        const W = d.w * T, H = d.h * T;
        rect(g, K, x, y, W, H);
        rect(g, '#22303a', x + 1, y + 1, W - 2, H - 2);
        rect(g, '#2a6a80', x + 3, y + 3, W - 6, 2);
        for (let j = 12; j < H - 16; j += 3) { rect(g, '#1a242c', x + 2, y + j, 3, 1); rect(g, '#1a242c', x + W - 5, y + j, 3, 1); }   // vents
        rect(g, '#3a5868', x + 7, y + 9, W - 14, 28);
        rect(g, '#071a22', x + 8, y + 10, W - 16, 26);
        rect(g, '#2e3e48', x + 4, y + 41, W - 8, 9);
        rect(g, '#46606e', x + 4, y + 41, W - 8, 1);
        for (let i = 0; i < 6; i++) rect(g, i === 2 ? '#ffd25a' : '#4a6070', x + 9 + i * 8, y + 44, 5, 3);   // keys
        rect(g, '#141c22', x + 8, y + 50, W - 16, H - 54);
        rect(g, '#1c2224', x, y + H - 4, W, 4);
        break;
      }
      case 'medcab': {
        // training's med cabinet - a first-aid cupboard over a counter - and a drinks fridge beside it
        const W = d.w * T, H = d.h * T, fx = x + W - 32;
        rect(g, K, x + 2, y + 4, 40, 30);
        rect(g, '#d8dcd8', x + 3, y + 5, 38, 28);
        rect(g, '#b4bab4', x + 22, y + 5, 1, 28);
        rect(g, '#d2302a', x + 19, y + 10, 7, 18); rect(g, '#d2302a', x + 13, y + 16, 19, 6);   // the red cross
        rect(g, '#9aa29c', x + 3, y + 31, 38, 2);
        rect(g, K, x, y + 40, 46, H - 40);
        rect(g, '#7a8480', x + 1, y + 41, 44, H - 42);
        rect(g, '#b8c0bc', x + 1, y + 41, 44, 2);
        for (const dy of [47, 55]) { rect(g, '#5e6864', x + 3, y + dy, 40, 1); rect(g, '#c8d0cc', x + 20, y + dy + 2, 6, 1); }
        // the fridge: glass front, three shelves of cans (it glows - see light.js)
        rect(g, K, fx, y, 32, H);
        rect(g, '#c8ccd0', fx + 1, y + 1, 30, H - 2);
        rect(g, '#3ad0ff', fx + 3, y + 3, 26, 3);
        rect(g, '#10181c', fx + 3, y + 8, 26, H - 14);
        const CANS = ['#2a9ad8', '#e8c040', '#d2302a', '#3ad06a', '#e8ece6'];
        for (let s = 0; s < 3; s++) {
          const sy = y + 20 + s * 15;
          rect(g, '#4a5a60', fx + 3, sy, 26, 1);
          for (let i = 0; i < 5; i++) { rect(g, CANS[(i + s * 2) % 5], fx + 4 + i * 5, sy - 7, 4, 7); rect(g, '#c8d0d4', fx + 4 + i * 5, sy - 7, 4, 1); }
        }
        rect(g, '#9aa29c', fx + 27, y + 24, 1, 14);
        rect(g, '#1c2224', x, y + H - 4, W, 4);
        break;
      }
      case 'target':
        // a range target board
        rect(g, K, x, y, 20, 28); rect(g, '#e8e2d0', x + 1, y + 1, 18, 26);
        for (const [r, c] of [[8, '#c83a2a'], [5, '#e8e2d0'], [3, '#c83a2a']]) rect(g, c, x + 10 - r, y + 12 - r, r * 2, r * 2);
        break;
    }
  }
}

// A tiny 3x5 stencil font for signs baked into the level art.
const GLYPHS = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111',
  '-': '000000111000000', '+': '000010111010000', '/': '001001010100100', '!': '010010010000010', ' ': '000000000000000', '.': '000000000000010',
};
function drawStencil(g, text, x, y, color) {
  g.fillStyle = color;
  for (const ch of String(text).toUpperCase()) {
    const bits = GLYPHS[ch] ?? GLYPHS[' '];
    for (let i = 0; i < 15; i++) if (bits[i] === '1') g.fillRect(x + (i % 3), y + ((i / 3) | 0), 1, 1);
    x += 4;
  }
}
