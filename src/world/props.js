// Solid block objects: crates, chemical drums, lockers, stacked crates,
// supply crates. Art is generated once and cached. A prop's (x, y) is the
// bottom-centre of its footprint; it y-sorts on y.
//
// Each has a height class. Low ones (one block - crates, drums) are below
// the flashlight, so light can reach their top. Tall ones (lockers, stacked
// crates, cabinets) rise above it: only their front face catches light and
// their top stays dark.

import { makeCanvas, makeShadow, rect } from '../engine/pixel.js';

const K = '#10140d';

function crateBox(g, x, y) {
  rect(g, K, x, y, 16, 18);                    // outline
  rect(g, '#5e6b3d', x + 1, y + 1, 14, 5);     // lid
  rect(g, '#727f4b', x + 1, y + 1, 14, 1);
  rect(g, '#4e5a32', x + 1, y + 3, 14, 1);
  rect(g, '#2c3320', x + 1, y + 6, 14, 1);     // lip shadow
  rect(g, '#4b5730', x + 1, y + 7, 14, 10);    // front
  rect(g, '#5a6739', x + 3, y + 7, 10, 1);
  rect(g, '#39431f', x + 1, y + 7, 2, 10);     // frame
  rect(g, '#39431f', x + 13, y + 7, 2, 10);
  rect(g, '#c9b45a', x + 5, y + 10, 6, 3);     // stencil plate
  rect(g, '#39431f', x + 6, y + 11, 4, 1);
  rect(g, '#262c18', x + 1, y + 16, 14, 1);
  for (const [px, py] of [[2, 8], [13, 8], [2, 15], [13, 15]]) rect(g, '#8d9a6a', x + px, y + py, 1, 1);
}

function crateArt() {
  const [c, g] = makeCanvas(16, 18);
  crateBox(g, 0, 0);
  return c;
}

// Two crates stacked: taller than the flashlight.
function stackArt() {
  const [c, g] = makeCanvas(16, 29);
  crateBox(g, 0, 11);
  crateBox(g, 0, 0);
  rect(g, '#2c3320', 1, 17, 14, 1);            // the top crate's shadow on the lower one's lid
  return c;
}

function drumArt() {
  const [c, g] = makeCanvas(12, 16);
  rect(g, K, 1, 0, 10, 16);                    // rounded outline
  rect(g, K, 0, 1, 12, 14);
  rect(g, '#9c2a26', 1, 1, 10, 14);            // body
  rect(g, '#b8403a', 1, 1, 10, 3);             // lid
  rect(g, '#cf5a50', 2, 1, 8, 1);
  rect(g, '#6d1c19', 3, 2, 2, 1);              // bung
  rect(g, K, 1, 4, 10, 1);                     // lid lip
  rect(g, '#bb4740', 2, 5, 1, 9);              // light stripe
  rect(g, '#7a1f1c', 8, 5, 2, 9);
  for (const y of [6, 11]) {                   // ribs
    rect(g, '#6d1c19', 1, y, 10, 1);
    rect(g, '#c4554d', 1, y + 1, 10, 1);
  }
  rect(g, '#e6d24a', 4, 8, 3, 2);              // hazard label
  rect(g, '#4a120f', 1, 14, 10, 1);
  return c;
}

// Steel locker: a tall block.
function lockerArt() {
  const [c, g] = makeCanvas(14, 30);
  rect(g, K, 0, 0, 14, 30);
  rect(g, '#3a4450', 1, 1, 12, 5);             // top
  rect(g, '#4a5664', 1, 1, 12, 1);
  rect(g, '#232a32', 1, 6, 12, 1);
  rect(g, '#55626f', 1, 7, 12, 22);            // doors
  rect(g, '#6a7886', 1, 7, 12, 1);
  rect(g, K, 7, 7, 1, 22);                     // split between doors
  for (const x of [2, 9]) for (let y = 9; y < 14; y += 2) rect(g, '#2f3740', x, y, 4, 1);   // vents
  rect(g, '#c9b45a', 5, 17, 1, 3);             // handles
  rect(g, '#c9b45a', 9, 17, 1, 3);
  rect(g, '#3b4550', 1, 28, 12, 1);
  return c;
}

// Supply crate: metal box with a green status light; drawn open once looted.
function supplyArt(open) {
  const [c, g] = makeCanvas(18, 16);
  rect(g, K, 0, 0, 18, 16);
  if (open) {
    rect(g, '#1a1f17', 1, 1, 16, 5);           // dark inside
    rect(g, '#3a4436', 1, 1, 16, 1);
  } else {
    rect(g, '#4f5a48', 1, 1, 16, 5);           // lid
    rect(g, '#65725c', 1, 1, 16, 1);
    rect(g, '#3a4436', 8, 1, 2, 5);            // lid seam
  }
  rect(g, '#2c3328', 1, 6, 16, 1);
  rect(g, '#46523f', 1, 7, 16, 8);             // front
  rect(g, '#2f3729', 1, 10, 16, 1);
  rect(g, '#e6d24a', 2, 8, 3, 1);              // stencil
  rect(g, '#3a4436', 14, 8, 2, 5);             // latch
  return c;
}

// --- decoration (training room, mostly) ---

// Sandbag wall: two rows of bags.
function sandbagArt() {
  const [c, g] = makeCanvas(18, 13);
  const bag = (x, y) => {
    rect(g, K, x, y, 9, 6);
    rect(g, '#8f8160', x + 1, y + 1, 7, 4);
    rect(g, '#a8996f', x + 1, y + 1, 7, 1);
    rect(g, '#6f6348', x + 1, y + 4, 7, 1);
    rect(g, '#5c523b', x + 4, y + 2, 1, 2);
  };
  bag(0, 7); bag(9, 7); bag(4, 2); bag(-5, 2); bag(13, 2);
  bag(4, 0);
  return c;
}

// Wooden bench on metal legs.
function benchArt() {
  const [c, g] = makeCanvas(26, 10);
  rect(g, K, 0, 0, 26, 5);
  rect(g, '#7a5a38', 1, 1, 24, 3);
  rect(g, '#93704a', 1, 1, 24, 1);
  rect(g, '#5a4128', 1, 3, 24, 1);
  for (const x of [2, 21]) {
    rect(g, K, x, 4, 3, 6);
    rect(g, '#4c5455', x + 1, 5, 1, 4);
  }
  return c;
}

// Steel table with a pistol, a mag and a box of rounds on it.
function tableArt() {
  const [c, g] = makeCanvas(28, 16);
  rect(g, K, 0, 0, 28, 9);
  rect(g, '#55626f', 1, 1, 26, 6);
  rect(g, '#6a7886', 1, 1, 26, 1);
  rect(g, '#2f3740', 1, 7, 26, 1);
  // stuff on top
  rect(g, K, 3, 2, 8, 3); rect(g, '#2b2e2f', 4, 3, 6, 1);          // pistol
  rect(g, K, 13, 2, 3, 4); rect(g, '#4c5455', 14, 3, 1, 2);        // mag
  rect(g, K, 18, 2, 7, 4); rect(g, '#4f6b33', 19, 3, 5, 2);        // ammo box
  rect(g, '#e8b84a', 20, 2, 1, 1); rect(g, '#e8b84a', 22, 2, 1, 1);
  rect(g, K, 0, 8, 28, 3);
  rect(g, '#3a4450', 1, 9, 26, 1);
  for (const x of [1, 24]) {
    rect(g, K, x, 10, 3, 6);
    rect(g, '#4c5455', x + 1, 10, 1, 5);
  }
  return c;
}

// Wall rack of rifles: a tall block.
function rackArt() {
  const [c, g] = makeCanvas(30, 31);
  rect(g, K, 0, 0, 30, 31);
  rect(g, '#3a2c1c', 1, 1, 28, 5);           // top shelf
  rect(g, '#5a4128', 1, 1, 28, 1);
  rect(g, '#2a2016', 1, 6, 28, 1);
  rect(g, '#4a3a26', 1, 7, 28, 23);          // back board
  for (let i = 0; i < 5; i++) {
    const x = 3 + i * 5;
    rect(g, K, x, 8, 3, 20);                 // a rifle standing up
    rect(g, i % 2 ? '#2b2e2f' : '#343a3a', x + 1, 9, 1, 18);
    rect(g, i === 2 ? '#6e4426' : '#1c2221', x, 20, 3, 6);   // stock
    rect(g, '#4c5455', x + 1, 13, 1, 3);     // mag
  }
  rect(g, '#2a2016', 1, 27, 28, 3);          // bottom rail
  rect(g, '#6e4426', 1, 27, 28, 1);
  return c;
}

// Traffic cone.
function coneArt() {
  const [c, g] = makeCanvas(10, 12);
  rect(g, K, 3, 0, 4, 10);
  rect(g, K, 2, 4, 6, 6);
  rect(g, '#e86a1a', 4, 1, 2, 8);
  rect(g, '#e86a1a', 3, 5, 4, 4);
  rect(g, '#f2f2ea', 3, 4, 4, 2);
  rect(g, K, 0, 9, 10, 3);
  rect(g, '#c4561f', 1, 10, 8, 1);
  return c;
}

// Potted plant.
function plantArt() {
  const [c, g] = makeCanvas(14, 20);
  const leaf = (x, y, w, h, col) => { rect(g, K, x - 1, y - 1, w + 2, h + 2); rect(g, col, x, y, w, h); };
  leaf(4, 1, 3, 6, '#3d6b3a'); leaf(1, 4, 4, 3, '#4f8a48'); leaf(8, 3, 4, 3, '#4f8a48');
  leaf(6, 0, 2, 7, '#5fa055'); leaf(2, 7, 3, 4, '#3d6b3a'); leaf(9, 6, 3, 4, '#3d6b3a');
  rect(g, K, 3, 11, 8, 9);
  rect(g, '#8a4a2a', 4, 12, 6, 7);
  rect(g, '#a8603a', 4, 12, 6, 1);
  rect(g, '#6a3a20', 4, 17, 6, 1);
  return c;
}

// Green ammo can.
function ammoboxArt() {
  const [c, g] = makeCanvas(14, 10);
  rect(g, K, 0, 0, 14, 10);
  rect(g, '#4f5d2c', 1, 1, 12, 3);
  rect(g, '#6b7c3b', 1, 1, 12, 1);
  rect(g, '#3a4520', 1, 4, 12, 5);
  rect(g, '#c9b45a', 3, 6, 4, 1);
  rect(g, K, 5, 0, 4, 1);
  return c;
}

// Whiteboard on a stand, with a plan of the range scribbled on it.
function boardArt() {
  const [c, g] = makeCanvas(26, 30);
  rect(g, K, 0, 0, 26, 19);
  rect(g, '#dfe4dc', 1, 1, 24, 17);
  rect(g, '#f4f8ef', 1, 1, 24, 1);
  rect(g, '#c23a2e', 4, 4, 1, 1); rect(g, '#c23a2e', 5, 5, 1, 1); rect(g, '#c23a2e', 6, 4, 1, 1); rect(g, '#c23a2e', 4, 6, 1, 1); rect(g, '#c23a2e', 6, 6, 1, 1);
  rect(g, '#2a4a8a', 9, 5, 12, 1); rect(g, '#2a4a8a', 9, 8, 9, 1); rect(g, '#2a4a8a', 9, 11, 11, 1);
  rect(g, '#1c2221', 4, 13, 18, 1); rect(g, '#1c2221', 20, 12, 1, 3);
  rect(g, K, 1, 18, 24, 2);
  rect(g, '#8d9c9c', 2, 18, 22, 1);
  for (const x of [3, 21]) {
    rect(g, K, x, 19, 3, 11);
    rect(g, '#4c5455', x + 1, 20, 1, 10);
  }
  return c;
}

// Paper target on a wooden stand.
function targetArt() {
  const [c, g] = makeCanvas(14, 26);
  rect(g, K, 1, 0, 12, 18);
  rect(g, '#e8e0cc', 2, 1, 10, 16);
  rect(g, '#2b2e2f', 4, 2, 6, 5);            // silhouette head
  rect(g, '#2b2e2f', 3, 7, 8, 10);           // and shoulders
  rect(g, '#e8e0cc', 6, 10, 2, 2);
  rect(g, '#c8312c', 5, 4, 1, 1); rect(g, '#c8312c', 8, 12, 1, 1); rect(g, '#c8312c', 4, 14, 1, 1);
  for (const x of [3, 9]) {
    rect(g, K, x, 17, 3, 9);
    rect(g, '#7a5a38', x + 1, 17, 1, 8);
  }
  return c;
}

// --- things that give off light ---

// Standing work light: a lamp head on a tripod.
function worklightArt() {
  const [c, g] = makeCanvas(12, 24);
  rect(g, K, 2, 0, 8, 6);
  rect(g, '#c9b45a', 3, 1, 6, 4);            // housing
  rect(g, '#fff6d0', 4, 2, 4, 2);            // lens (glows - see glow())
  rect(g, K, 5, 5, 2, 15);
  rect(g, '#4c5455', 6, 6, 1, 13);           // pole
  rect(g, K, 1, 19, 10, 2);                  // tripod legs
  rect(g, K, 0, 21, 3, 3); rect(g, K, 9, 21, 3, 3); rect(g, K, 5, 21, 2, 3);
  rect(g, '#4c5455', 1, 22, 1, 1); rect(g, '#4c5455', 10, 22, 1, 1);
  return c;
}

// Computer terminal on a little desk: the screen glows.
function terminalArt() {
  const [c, g] = makeCanvas(16, 17);
  rect(g, K, 2, 0, 12, 9);
  rect(g, '#2b3427', 3, 1, 10, 7);           // monitor bezel
  rect(g, '#0d2a2a', 4, 2, 8, 5);            // screen (glows - see glow())
  rect(g, K, 6, 8, 4, 2);
  rect(g, K, 0, 9, 16, 8);
  rect(g, '#3a4450', 1, 10, 14, 3);          // desk top
  rect(g, '#4a5664', 1, 10, 14, 1);
  rect(g, '#1d2419', 3, 11, 8, 1);           // keyboard
  rect(g, '#2f3740', 1, 13, 14, 3);          // desk front
  rect(g, '#c9b45a', 12, 14, 1, 1);
  return c;
}

// w/h: sprite size; halfW/depth: footprint; top: sprite rows that are the top face;
// tall: the top is above the flashlight; low: so low that bullets fly over it
const DEFS = {
  crate: { art: crateArt, w: 16, h: 18, halfW: 7, depth: 10, top: 7, tall: false, shadow: [16, 5] },
  stack: { art: stackArt, w: 16, h: 29, halfW: 7, depth: 10, top: 7, tall: true, shadow: [16, 5] },
  barrel: { art: drumArt, w: 12, h: 16, halfW: 5, depth: 7, top: 5, tall: false, shadow: [12, 4] },
  locker: { art: lockerArt, w: 14, h: 30, halfW: 6, depth: 8, top: 7, tall: true, shadow: [14, 4] },
  supply: { art: () => supplyArt(false), open: () => supplyArt(true), w: 18, h: 16, halfW: 8, depth: 9, top: 7, tall: false, shadow: [18, 5] },
  sandbag: { art: sandbagArt, w: 18, h: 13, halfW: 8, depth: 7, top: 4, tall: false, low: true, shadow: [18, 5] },
  bench: { art: benchArt, w: 26, h: 10, halfW: 12, depth: 5, top: 4, tall: false, low: true, shadow: [26, 4] },
  table: { art: tableArt, w: 28, h: 16, halfW: 13, depth: 8, top: 8, tall: false, shadow: [28, 5] },
  rack: { art: rackArt, w: 30, h: 31, halfW: 14, depth: 6, top: 6, tall: true, shadow: [30, 4] },
  cone: { art: coneArt, w: 10, h: 12, halfW: 3, depth: 3, top: 2, tall: false, low: true, shadow: [10, 3] },
  plant: { art: plantArt, w: 14, h: 20, halfW: 4, depth: 4, top: 12, tall: false, shadow: [10, 3] },
  ammobox: { art: ammoboxArt, w: 14, h: 10, halfW: 6, depth: 5, top: 4, tall: false, low: true, shadow: [14, 4] },
  board: { art: boardArt, w: 26, h: 30, halfW: 12, depth: 3, top: 0, tall: true, shadow: [24, 4] },
  target: { art: targetArt, w: 14, h: 26, halfW: 5, depth: 3, top: 0, tall: true, shadow: [12, 3] },
  // light: [radius, colour, intensity, height of the lamp above the floor]
  worklight: { art: worklightArt, w: 12, h: 24, halfW: 3, depth: 3, top: 0, tall: false, shadow: [12, 3], light: [150, [255, 230, 180], 0.95, 21] },
  terminal: { art: terminalArt, w: 16, h: 17, halfW: 7, depth: 6, top: 9, tall: false, shadow: [16, 4], light: [70, [90, 220, 210], 0.7, 12] },
};

// The glowing part of each lit prop (drawn after lighting): [x, y, w, h, colour] in sprite pixels.
const GLOW = {
  worklight: [[4, 2, 4, 2, '#fffbe6'], [3, 1, 6, 1, 'rgba(255, 240, 190, 0.6)']],
  terminal: [[4, 2, 8, 5, 'rgba(70, 200, 190, 0.85)'], [5, 3, 5, 1, '#c8fff4'], [5, 5, 3, 1, '#9be8dc']],
};
const cache = {};

export function createProp(kind, x, y) {
  const d = DEFS[kind];
  cache[kind] ??= { img: d.art(), openImg: d.open?.(), shadow: makeShadow(...d.shadow) };
  const { img, openImg, shadow } = cache[kind];
  const prop = {
    kind,
    x,
    y,
    sortY: y,
    tall: d.tall,
    low: !!d.low,                   // bullets pass over it
    shadowH: d.h - d.depth,         // how high it stands (low ones cast a shadow this long-ish)
    fixedShape: true,               // never animates (lighting can cache its silhouette)
    explosive: kind === 'barrel',   // red chemical drums go up when shot
    hp: 25,
    opened: false,                  // supply crates
    box: { l: x - d.halfW, t: y - d.depth, r: x + d.halfW, b: y },
    // lighting: the sprite's area, the floor row in front whose light its
    // face takes, and its top face - lit from the floor around it if it's
    // low, left dark if it's too tall for the light to reach
    lightBox: () => ({ x: x - d.w / 2 - 2, y: y - d.h - 1, w: d.w + 4, h: d.h + 4 }),
    lightRows: () => [y + 1],
    lightRegions: () => [d.tall ? { y0: 0, y1: d.top + 1, ambient: true } : { y0: 0, y1: d.top + 1, rows: [y + 1, y - d.depth - 1] }],
    drawShadow(ctx) {
      ctx.drawImage(shadow, Math.round(x - shadow.width / 2), y - shadow.height + 2);
    },
    draw(ctx) {
      ctx.drawImage(prop.opened && openImg ? openImg : img, Math.round(x - d.w / 2), y - d.h);
    },
  };
  if (d.light) {
    // a lamp: casts light from just in front of itself, glows after lighting
    const [radius, color, intensity, height] = d.light;
    prop.lights = [{ x, y: y + 3, radius, color, intensity, height, static: true }];
    prop.glow = (ctx, time) => {
      const flick = kind === 'terminal' && Math.sin(time * 9 + x) > 0.97 ? 0.6 : 1;   // the odd screen flicker
      ctx.globalAlpha = flick;
      for (const [gx, gy, gw, gh, col] of GLOW[kind]) {
        ctx.fillStyle = col;
        ctx.fillRect(Math.round(x - d.w / 2) + gx, y - d.h + gy, gw, gh);
      }
      ctx.globalAlpha = 1;
    };
  }
  return prop;
}
