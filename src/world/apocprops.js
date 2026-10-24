// Props for the open-world survival map: trees, wrecks, the furniture and
// containers in the ruined buildings, and the camp's machines. Art is drawn
// from code (rect by rect) like the rest of the props; each is a sprite whose
// bottom centre is the prop's (x, y).
//
// Extra flags here (see props.js): solid (zombies path round it), ghost (just
// decoration), fade (a tree top that goes see-through over the player),
// loot (a container and what's in it), interact (camp machines), powered
// (a light the generator runs).

import { makeCanvas, rect } from '../engine/pixel.js';
import { addPropDefs } from './props.js';

const K = '#10140d';
const hash = (x, y) => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// A filled disc of pixels (for tree tops, bushes, rocks).
function blob(g, cx, cy, rx, ry, col) {
  g.fillStyle = col;
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) g.fillRect(cx + x, cy + y, 1, 1);
}

// ---------- nature ----------

function oakArt(v = 0) {
  const [c, g] = makeCanvas(32, 40);
  // trunk
  rect(g, K, 13, 26, 7, 14);
  rect(g, '#5a3f26', 14, 26, 5, 13);
  rect(g, '#74533a', 14, 27, 2, 12);
  rect(g, '#3e2a19', 18, 27, 1, 12);
  rect(g, K, 11, 38, 11, 2);
  // canopy: dark outline, mid body, lit top-left clumps
  const greens = [['#1f3317', '#2f4a22', '#456a30', '#5e8740'], ['#2a3618', '#3e4d22', '#566a30', '#728a40'], ['#22301d', '#34472a', '#4c6338', '#64804a']][v % 3];
  blob(g, 16, 15, 15, 13, K);
  blob(g, 16, 15, 14, 12, greens[0]);
  blob(g, 15, 13, 12, 10, greens[1]);
  for (const [x, y, r] of [[10, 9, 5], [19, 8, 5], [13, 16, 5], [22, 15, 4], [8, 16, 3]]) blob(g, x, y, r, r - 1, greens[2]);
  for (const [x, y] of [[8, 7], [17, 6], [11, 14], [21, 13], [14, 9]]) blob(g, x, y, 2, 1, greens[3]);
  for (let i = 0; i < 18; i++) rect(g, greens[0], 4 + ((hash(i, v) * 24) | 0), 6 + ((hash(v, i) * 18) | 0), 1, 1);
  return c;
}

function pineArt() {
  const [c, g] = makeCanvas(26, 42);
  rect(g, K, 11, 32, 5, 10);
  rect(g, '#5a3f26', 12, 32, 3, 9);
  rect(g, K, 9, 40, 9, 2);
  // three tiers of needles, widest at the bottom
  const tiers = [[2, 34, 13], [9, 24, 10], [16, 14, 7], [22, 6, 4]];
  for (const [top, bottom, half] of tiers) {
    for (let y = top; y <= bottom; y++) {
      const k = (y - top) / (bottom - top), w = Math.round(2 + (half - 2) * k);
      rect(g, K, 13 - w - 1, y, w * 2 + 3, 1);
    }
  }
  for (const [top, bottom, half] of tiers) {
    for (let y = top + 1; y < bottom; y++) {
      const k = (y - top) / (bottom - top), w = Math.round(1 + (half - 2) * k);
      rect(g, '#1d3a24', 13 - w, y, w * 2 + 1, 1);
      rect(g, '#2d5636', 13 - w, y, w + 1, 1);
      if (y % 3 === 0) rect(g, '#447a4d', 13 - w + 1, y, Math.max(1, w - 1), 1);
    }
  }
  rect(g, '#5e9a62', 13, 2, 1, 3);
  return c;
}

function deadArt() {
  const [c, g] = makeCanvas(24, 32);
  const br = (x0, y0, x1, y1) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
      rect(g, K, x - 1, y - 1, 3, 3);
    }
    for (let i = 0; i <= n; i++) rect(g, '#5b4a3a', Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), 1, 1);
  };
  rect(g, K, 10, 14, 5, 18);
  rect(g, '#5b4a3a', 11, 14, 3, 17);
  rect(g, '#6e5c4a', 11, 15, 1, 15);
  br(12, 16, 4, 8); br(12, 14, 20, 5); br(12, 11, 12, 2); br(7, 11, 3, 13); br(17, 9, 22, 11);
  return c;
}

function bushArt(v = 0) {
  const [c, g] = makeCanvas(18, 12);
  const greens = v % 2 ? ['#2a3a1c', '#3f5528', '#587436'] : ['#263519', '#384d24', '#4f6b31'];
  blob(g, 9, 7, 8, 5, K);
  blob(g, 9, 7, 7, 4, greens[0]);
  blob(g, 7, 6, 4, 3, greens[1]);
  blob(g, 12, 6, 3, 2, greens[1]);
  rect(g, greens[2], 5, 4, 3, 1);
  rect(g, greens[2], 11, 4, 2, 1);
  if (v % 3 === 0) for (const [x, y] of [[6, 7], [11, 8], [9, 5]]) rect(g, '#b8433a', x, y, 1, 1);   // berries
  return c;
}

function rockArt() {
  const [c, g] = makeCanvas(18, 12);
  blob(g, 9, 7, 8, 5, K);
  blob(g, 9, 7, 7, 4, '#55594f');
  blob(g, 8, 6, 5, 3, '#6d7266');
  rect(g, '#858b7d', 5, 4, 4, 1);
  rect(g, '#41443c', 11, 8, 4, 1);
  rect(g, '#3a5a2a', 3, 9, 3, 1);   // moss
  return c;
}

// ---------- the ruined world ----------

function carArt(v = 0) {
  const [c, g] = makeCanvas(42, 24);
  const body = [['#6e2a22', '#8a3a2e', '#4e1c16'], ['#2e4a5e', '#3f6178', '#1f3442'], ['#5e5a3a', '#7a7550', '#3f3c26'], ['#4a4a4a', '#666666', '#2e2e2e']][v % 4];
  rect(g, K, 1, 6, 40, 15);
  rect(g, K, 7, 1, 26, 7);
  rect(g, body[0], 2, 7, 38, 11);           // body side
  rect(g, body[1], 2, 7, 38, 2);
  rect(g, body[2], 2, 15, 38, 2);
  rect(g, body[0], 8, 2, 24, 6);            // cabin
  rect(g, body[1], 8, 2, 24, 1);
  rect(g, '#1b2228', 10, 3, 9, 4);          // windows (one smashed)
  rect(g, '#1b2228', 21, 3, 9, 4);
  rect(g, '#46525a', 11, 3, 3, 1);
  rect(g, '#7c8a90', 24, 4, 1, 1); rect(g, '#7c8a90', 26, 5, 2, 1);
  rect(g, '#2a1e14', 15, 9, 6, 3);          // rust patches
  rect(g, '#3a2a1c', 30, 12, 5, 2);
  rect(g, '#c9b45a', 38, 9, 2, 2);          // headlight
  rect(g, '#7a1f1c', 2, 9, 1, 2);           // tail light
  for (const wx of [6, 30]) {               // wheels (one flat)
    rect(g, K, wx, 16, 8, 6);
    rect(g, '#2a2a2a', wx + 1, 17, 6, 4);
    rect(g, '#5e6466', wx + 3, 18, 2, 2);
  }
  rect(g, K, 31, 20, 6, 1);
  return c;
}

function pumpArt() {
  const [c, g] = makeCanvas(12, 24);
  rect(g, K, 1, 1, 10, 22);
  rect(g, '#a8382e', 2, 2, 8, 20);
  rect(g, '#c44a3e', 2, 2, 8, 2);
  rect(g, '#d9d4c0', 3, 5, 6, 4);           // display
  rect(g, '#2a2f2a', 4, 6, 4, 2);
  rect(g, '#7a221c', 2, 12, 8, 1);
  rect(g, K, 9, 13, 3, 6);                  // hose + nozzle
  rect(g, '#2a2a2a', 10, 14, 1, 4);
  rect(g, '#e8b84a', 3, 16, 3, 1);
  rect(g, '#3a2a24', 2, 21, 8, 1);
  return c;
}

function shelfArt() {
  const [c, g] = makeCanvas(26, 24);
  rect(g, K, 0, 0, 26, 24);
  rect(g, '#5a5f66', 1, 1, 24, 22);
  for (const y of [7, 14, 21]) rect(g, '#3a3e44', 1, y, 24, 2);
  // what's left on the shelves: a few tins, boxes and bottles
  const cols = ['#c23a2e', '#e8b84a', '#4f8a5a', '#7fb7d9', '#d9d4c0', '#8a5a3a'];
  for (let i = 0; i < 9; i++) {
    const row = i % 3, x = 2 + ((hash(i, 3) * 20) | 0), h = 2 + ((hash(i, 5) * 3) | 0);
    rect(g, cols[i % cols.length], x, 7 + row * 7 - h, 2 + (i % 2), h);
  }
  rect(g, '#6c727a', 1, 1, 24, 1);
  return c;
}

function fridgeArt(open = false) {
  const [c, g] = makeCanvas(14, 26);
  rect(g, K, 0, 0, 14, 26);
  rect(g, '#c9ccc4', 1, 1, 12, 24);
  rect(g, '#e2e4dc', 1, 1, 12, 2);
  rect(g, '#9a9e96', 1, 9, 12, 1);
  rect(g, '#6a6e66', 11, 4, 1, 4);
  rect(g, '#6a6e66', 11, 12, 1, 6);
  rect(g, '#8a8e86', 2, 23, 10, 1);
  if (open) {
    rect(g, '#2a2e2a', 2, 10, 9, 12);
    rect(g, '#d9d4c0', 3, 13, 7, 1);
  }
  return c;
}

function cabinetArt() {
  const [c, g] = makeCanvas(18, 20);
  rect(g, K, 0, 0, 18, 20);
  rect(g, '#6e4a2c', 1, 1, 16, 18);
  rect(g, '#8a5f3a', 1, 1, 16, 2);
  rect(g, '#4e341f', 1, 9, 16, 1);
  rect(g, '#4e341f', 8, 3, 1, 15);
  rect(g, '#c9b45a', 6, 12, 1, 2);
  rect(g, '#c9b45a', 10, 12, 1, 2);
  rect(g, '#c9b45a', 8, 5, 2, 1);
  return c;
}

function bedArt() {
  const [c, g] = makeCanvas(30, 16);
  rect(g, K, 0, 2, 30, 14);
  rect(g, '#5a3f26', 1, 3, 28, 12);
  rect(g, '#7a8a9a', 2, 3, 26, 8);           // stained sheet
  rect(g, '#93a3b2', 2, 3, 26, 2);
  rect(g, '#d9d4c0', 3, 4, 6, 4);            // pillow
  rect(g, '#5a4a3a', 16, 6, 5, 3);           // stain
  rect(g, K, 0, 0, 3, 4);
  rect(g, '#5a3f26', 1, 1, 1, 2);
  return c;
}

function tentArt(v = 0) {
  const [c, g] = makeCanvas(32, 22);
  const cl = v % 2 ? ['#4f5a32', '#65733f', '#3a4224'] : ['#6e4a2c', '#8a5f3a', '#4e341f'];
  for (let y = 2; y < 21; y++) {
    const w = Math.round(((y - 2) / 18) * 14) + 1;
    rect(g, K, 16 - w - 1, y, w * 2 + 2, 1);
    rect(g, cl[0], 16 - w, y, w * 2, 1);
    rect(g, cl[1], 16 - w, y, w, 1);
  }
  rect(g, K, 12, 11, 8, 10);                 // the open flap
  rect(g, '#141810', 13, 12, 6, 9);
  rect(g, cl[2], 15, 2, 2, 19);
  rect(g, K, 0, 20, 32, 2);
  return c;
}

function campfireArt() {
  const [c, g] = makeCanvas(16, 12);
  for (const [x, y] of [[1, 8], [5, 9], [10, 9], [13, 8], [3, 6], [11, 6]]) {
    rect(g, K, x - 1, y - 1, 4, 4);
    rect(g, '#74787a', x, y, 2, 2);
  }
  rect(g, K, 3, 5, 10, 4);
  rect(g, '#5a3f26', 4, 6, 8, 2);
  rect(g, '#3e2a19', 6, 5, 4, 1);
  rect(g, '#2a1e14', 5, 8, 6, 1);
  return c;
}

function generatorArt() {
  const [c, g] = makeCanvas(28, 24);
  rect(g, K, 0, 6, 28, 18);
  rect(g, '#c4561f', 1, 7, 26, 12);          // housing
  rect(g, '#ec8a34', 1, 7, 26, 2);
  rect(g, '#8a3a14', 1, 17, 26, 2);
  rect(g, K, 4, 10, 10, 6);                  // engine grille
  for (let i = 0; i < 3; i++) rect(g, '#3a2a1c', 5, 11 + i * 2, 8, 1);
  rect(g, '#2b2e2f', 16, 10, 8, 5);          // panel
  rect(g, '#e8b84a', 17, 11, 2, 1);
  rect(g, '#d7313d', 20, 11, 2, 1);          // status lights (glow)
  rect(g, '#8d9c9c', 17, 13, 6, 1);
  rect(g, K, 2, 2, 12, 5);                   // fuel tank on top
  rect(g, '#a8382e', 3, 3, 10, 3);
  rect(g, '#c44a3e', 3, 3, 10, 1);
  rect(g, K, 21, 0, 4, 7);                   // exhaust
  rect(g, '#4c5455', 22, 1, 2, 6);
  rect(g, K, 2, 19, 24, 5);                  // frame + wheels
  rect(g, '#2b2e2f', 3, 20, 22, 2);
  rect(g, '#1c2221', 4, 21, 4, 3);
  rect(g, '#1c2221', 20, 21, 4, 3);
  return c;
}

function workbenchArt() {
  const [c, g] = makeCanvas(32, 22);
  rect(g, K, 0, 4, 32, 18);
  rect(g, '#7a5a3a', 1, 5, 30, 4);           // worktop
  rect(g, '#93704a', 1, 5, 30, 1);
  rect(g, '#5a3f26', 1, 9, 30, 2);
  rect(g, '#4e341f', 2, 11, 3, 10);          // legs
  rect(g, '#4e341f', 27, 11, 3, 10);
  rect(g, '#3a2a1c', 5, 15, 22, 2);          // lower shelf
  rect(g, K, 3, 0, 8, 6);                    // vice
  rect(g, '#8d9c9c', 4, 1, 6, 4);
  rect(g, '#c3cdcd', 5, 1, 4, 1);
  rect(g, '#c23a2e', 14, 3, 6, 2);           // toolbox
  rect(g, K, 14, 2, 6, 1);
  rect(g, '#8d9c9c', 23, 3, 1, 3);           // wrench, screwdriver
  rect(g, '#e8b84a', 25, 2, 1, 4);
  for (const x of [7, 12, 18, 22]) rect(g, '#2b2e2f', x, 13, 1, 2);   // hanging tools
  return c;
}

function floodlightArt() {
  const [c, g] = makeCanvas(12, 36);
  rect(g, K, 5, 6, 3, 30);
  rect(g, '#4c5455', 6, 6, 1, 29);
  rect(g, K, 1, 0, 10, 7);                   // the lamp head
  rect(g, '#3a4234', 2, 1, 8, 5);
  rect(g, '#d6d9c4', 3, 2, 6, 3);            // lens (glows when powered)
  rect(g, K, 2, 33, 9, 3);
  rect(g, '#2b2e2f', 3, 34, 7, 1);
  return c;
}

function junkArt() {
  const [c, g] = makeCanvas(22, 14);
  blob(g, 11, 9, 10, 4, K);
  blob(g, 11, 9, 9, 3, '#4a4038');
  for (const [x, y, w, h, col] of [[3, 6, 5, 2, '#6d7266'], [9, 4, 3, 5, '#7a3326'], [13, 6, 6, 2, '#8d9c9c'], [6, 9, 4, 2, '#5e4e33'], [15, 9, 4, 2, '#3c5a5a'], [11, 2, 1, 4, '#8d9c9c']]) {
    rect(g, K, x - 1, y - 1, w + 2, h + 2);
    rect(g, col, x, y, w, h);
  }
  return c;
}

function logsArt() {
  const [c, g] = makeCanvas(22, 12);
  for (const [x, y] of [[1, 6], [8, 6], [15, 6], [4, 1], [11, 1]]) {
    rect(g, K, x, y, 7, 6);
    rect(g, '#74533a', x + 1, y + 1, 5, 4);
    rect(g, '#a07a52', x + 2, y + 2, 3, 2);
    rect(g, '#5a3f26', x + 3, y + 2, 1, 1);
  }
  return c;
}

function milCrateArt(open = false) {
  const [c, g] = makeCanvas(22, 16);
  rect(g, K, 0, 2, 22, 14);
  rect(g, '#3f4a24', 1, 3, 20, 12);
  rect(g, '#5a6a33', 1, 3, 20, 2);
  rect(g, '#2b331a', 1, 13, 20, 1);
  rect(g, '#c9b45a', 7, 7, 8, 3);            // stencil
  rect(g, '#2b331a', 8, 8, 6, 1);
  for (const x of [3, 18]) rect(g, '#8d9a6a', x, 6, 1, 6);
  if (open) {
    rect(g, K, 0, 0, 22, 5);
    rect(g, '#2b331a', 1, 1, 20, 3);
    rect(g, '#141810', 2, 4, 18, 2);
  } else {
    rect(g, K, 0, 2, 22, 1);
  }
  return c;
}

function airdropArt(open = false) {
  const [c, g] = makeCanvas(26, 24);
  // the parachute collapsed behind it
  blob(g, 18, 6, 8, 5, K);
  blob(g, 18, 6, 7, 4, '#d9d4c0');
  blob(g, 17, 5, 5, 2, '#efe9d6');
  rect(g, '#a8a28e', 12, 8, 1, 6);
  rect(g, K, 1, 8, 22, 16);
  rect(g, '#4a5a6a', 2, 9, 20, 13);
  rect(g, '#5d7084', 2, 9, 20, 2);
  rect(g, '#c23a2e', 2, 15, 20, 2);          // red band
  rect(g, '#e8e4d6', 9, 12, 6, 2);
  rect(g, '#2e3a46', 2, 20, 20, 1);
  rect(g, '#ff5a4a', 19, 10, 2, 2);          // beacon (glows)
  if (open) {
    rect(g, K, 1, 6, 22, 4);
    rect(g, '#2e3a46', 2, 7, 20, 2);
  }
  return c;
}

function barricadeArt() {
  const [c, g] = makeCanvas(20, 16);
  for (const [x, w] of [[1, 5], [7, 5], [13, 6]]) {
    rect(g, K, x - 1, 2, w + 2, 14);
    rect(g, '#74533a', x, 3, w, 12);
    rect(g, '#8f6a48', x, 3, 1, 12);
  }
  rect(g, K, 0, 5, 20, 3);
  rect(g, '#5a3f26', 1, 6, 18, 1);
  rect(g, K, 0, 11, 20, 3);
  rect(g, '#5a3f26', 1, 12, 18, 1);
  for (const x of [3, 9, 15]) rect(g, '#8d9c9c', x, 6, 1, 1);
  return c;
}

function spikeArt() {
  const [c, g] = makeCanvas(20, 10);
  rect(g, K, 0, 6, 20, 4);
  rect(g, '#5a3f26', 1, 7, 18, 2);
  for (let x = 1; x < 19; x += 3) {
    rect(g, K, x, 1, 2, 6);
    rect(g, '#a8b0b0', x, 2, 1, 4);
  }
  return c;
}

// ---------- the defs ----------
// footprint: halfW / depth; top: sprite rows that are its top face

const N = (art, w, h, halfW, depth, extra) => ({ art, w, h, halfW, depth, top: 4, tall: false, shadow: [Math.max(8, w - 6), 4], ...extra });
addPropDefs({
  oak: N(() => oakArt(0), 32, 40, 3, 4, { tall: true, solid: true, fade: true, top: 0, shadow: [24, 7] }),
  oak2: N(() => oakArt(1), 32, 40, 3, 4, { tall: true, solid: true, fade: true, top: 0, shadow: [24, 7] }),
  oak3: N(() => oakArt(2), 32, 40, 3, 4, { tall: true, solid: true, fade: true, top: 0, shadow: [24, 7] }),
  pine: N(pineArt, 26, 42, 3, 4, { tall: true, solid: true, fade: true, top: 0, shadow: [20, 6] }),
  deadtree: N(deadArt, 24, 32, 3, 4, { tall: true, solid: true, fade: true, top: 0, shadow: [14, 4] }),
  bush: N(() => bushArt(0), 18, 12, 0, 0, { ghost: true, low: true, shadow: [14, 3] }),
  bush2: N(() => bushArt(1), 18, 12, 0, 0, { ghost: true, low: true, shadow: [14, 3] }),
  rock: N(rockArt, 18, 12, 7, 5, { low: true, solid: true, shadow: [16, 4] }),
  car: N(() => carArt(0), 42, 24, 19, 11, { solid: true, loot: 'car', top: 8, shadow: [40, 6] }),
  car2: N(() => carArt(1), 42, 24, 19, 11, { solid: true, loot: 'car', top: 8, shadow: [40, 6] }),
  car3: N(() => carArt(2), 42, 24, 19, 11, { solid: true, loot: 'car', top: 8, shadow: [40, 6] }),
  car4: N(() => carArt(3), 42, 24, 19, 11, { solid: true, loot: 'car', top: 8, shadow: [40, 6] }),
  pump: N(pumpArt, 12, 24, 4, 5, { tall: true, solid: true, loot: 'fuel', top: 2 }),
  shelf: N(shelfArt, 26, 24, 12, 6, { tall: true, solid: true, loot: 'store', top: 2 }),
  fridge: N(() => fridgeArt(false), 14, 26, 6, 6, { tall: true, solid: true, loot: 'food', open: () => fridgeArt(true), top: 2 }),
  cabinet: N(cabinetArt, 18, 20, 8, 6, { solid: true, loot: 'house', top: 2 }),
  bed: N(bedArt, 30, 16, 14, 9, { low: true, solid: true, loot: 'bed', top: 10 }),
  tent: N(() => tentArt(0), 32, 22, 14, 8, { solid: true, loot: 'camp', top: 6 }),
  tent2: N(() => tentArt(1), 32, 22, 14, 8, { solid: true, loot: 'camp', top: 6 }),
  campfire: N(campfireArt, 16, 12, 6, 5, { low: true, solid: true, light: [120, [255, 150, 70], 0.9, 6], top: 4 }),
  generator: N(generatorArt, 28, 24, 13, 9, { solid: true, interact: 'generator', top: 7 }),
  workbench: N(workbenchArt, 32, 22, 15, 8, { solid: true, interact: 'bench', top: 9 }),
  floodlight: N(floodlightArt, 12, 36, 3, 3, { tall: false, light: [190, [255, 240, 205], 0.85, 32], powered: true, top: 0 }),
  junk: N(junkArt, 22, 14, 9, 5, { low: true, solid: true, loot: 'scrap' }),
  logs: N(logsArt, 22, 12, 10, 5, { low: true, solid: true, loot: 'wood' }),
  mcrate: N(() => milCrateArt(false), 22, 16, 10, 7, { solid: true, loot: 'military', open: () => milCrateArt(true), top: 5 }),
  airdrop: N(() => airdropArt(false), 26, 24, 11, 8, { solid: true, loot: 'airdrop', open: () => airdropArt(true), top: 8 }),
  barricade: N(barricadeArt, 20, 16, 9, 4, { solid: true, top: 2 }),
  spikes: N(spikeArt, 20, 10, 9, 4, { ghost: true, low: true }),
}, {
  campfire: [[5, 1, 6, 4, '#ffb347'], [6, 0, 4, 3, '#ffe28a'], [7, -2, 2, 3, '#fff6dc'], [4, 3, 8, 2, '#e8642c']],
  floodlight: [[3, 2, 6, 3, '#fffbe6'], [2, 1, 8, 1, 'rgba(255, 245, 210, 0.6)']],
  generator: [[17, 11, 2, 1, '#ffd84a'], [20, 11, 2, 1, '#ff5a4a']],
  airdrop: [[19, 10, 2, 2, '#ff5a4a']],
});

export const TREES = ['oak', 'oak2', 'oak3', 'pine', 'pine', 'deadtree'];
export const CARS = ['car', 'car2', 'car3', 'car4'];
