// Wall-buy display cases: a dark cabinet with a lit glass front showing what
// it sells. They stand against a wall, block movement like props, and throw a
// cold white light on the floor. Walk up and press E to buy.
//
// What a case sells (`offer`):
//   { kind: 'weapon', weapon }        - the gun, or a box of its ammo if you have it
//   { kind: 'item', item, price }     - armor, meds...
//   { kind: 'mods', price }           - a random gun attachment

import { makeCanvas, rect, makeShadow } from '../engine/pixel.js';
import { WEAPONS } from '../combat/weapons.js';
import { MELEE } from '../combat/melee.js';
import { ITEMS, itemIcon } from '../game/items.js';
import { drawText, textWidth } from '../ui/font.js';

const W = 48, H = 30, TOP = 11;   // canvas size (3 tiles wide); rows 0..TOP-1 are the cabinet top
export const BUY_RANGE = 24;      // px from the case's front

// Several pictures stacked in one canvas, centred.
function stack(imgs, gap = 1) {
  const w = Math.max(...imgs.map((i) => i.width)), h = imgs.reduce((n, i) => n + i.height + gap, -gap);
  const [c, g] = makeCanvas(w, h);
  let y = 0;
  for (const i of imgs) {
    g.drawImage(i, Math.round((w - i.width) / 2), y);
    y += i.height + gap;
  }
  return c;
}

function displayImage(offer) {
  if (offer.kind === 'weapon') return WEAPONS[offer.weapon].img;
  if (offer.kind === 'item') return itemIcon(ITEMS[offer.item]);
  if (offer.kind === 'armory') return stack([WEAPONS.m4a1.img, WEAPONS.m870.img]);
  if (offer.kind === 'melee') return stack([MELEE.katana.img, MELEE.bat.img]);
  if (offer.kind === 'mystery') {
    // a crate with a question mark
    const [c, g] = makeCanvas(18, 12);
    rect(g, '#0d100b', 0, 0, 18, 12);
    rect(g, '#5e6b3d', 1, 1, 16, 10);
    rect(g, '#727f4b', 1, 1, 16, 1);
    rect(g, '#39431f', 1, 6, 16, 1);
    drawText(g, '?', 7, 3, 1, '#ffd84a', null);
    return c;
  }
  // mods: a scope with a question mark
  const [c, g] = makeCanvas(22, 12);
  g.drawImage(itemIcon(ITEMS.scope), 0, 1);
  drawText(g, '?', 17, 3, 1, '#d7313d', null);
  return c;
}

function caseArt(offer) {
  const [c, g] = makeCanvas(W, H);
  // cabinet top
  rect(g, '#0d100b', 0, 0, W, TOP);
  rect(g, '#1d241a', 1, 1, W - 2, TOP - 1);
  rect(g, '#34402f', 2, 2, W - 4, 1);
  rect(g, '#2a3326', 2, TOP - 2, W - 4, 1);
  // front frame
  rect(g, '#0d100b', 0, TOP, W, H - TOP);
  rect(g, '#2b3427', 1, TOP, W - 2, H - TOP - 1);
  rect(g, '#46523f', 1, TOP, W - 2, 1);
  // lit glass
  const gx = 3, gy = TOP + 2, gw = W - 6, gh = H - TOP - 6;
  rect(g, '#f4f8ef', gx - 1, gy - 1, gw + 2, gh + 2);   // bright rim
  rect(g, '#c9d4c8', gx, gy, gw, gh);
  rect(g, '#dfe7dc', gx, gy, gw, 2);
  rect(g, '#b5c1b4', gx, gy + gh - 2, gw, 2);
  for (let i = 0; i < 3; i++) rect(g, '#8f9b8f', gx + 1, gy + 3 + i * 3, 1, 2);   // rail marks
  // what's on display, centred (shrunk to fit if it's big)
  const img = displayImage(offer);
  const s = Math.min(1, (gw - 4) / img.width, (gh - 2) / img.height);
  const dw = Math.round(img.width * s), dh = Math.round(img.height * s);
  g.drawImage(img, Math.round(gx + gw / 2 - dw / 2), Math.round(gy + gh / 2 - dh / 2), dw, dh);
  // plinth
  rect(g, '#151a12', 1, H - 3, W - 2, 2);
  return c;
}

const SHADOW = makeShadow(50, 6, 'rgba(8, 10, 6, 0.4)');
const cache = {};

// (x, y): bottom-centre of the case's footprint.
export function createCase(offer, x, y) {
  const key = JSON.stringify(offer);
  cache[key] ??= caseArt(offer);
  const img = cache[key];
  return {
    kind: 'case',
    offer,
    def: offer.kind === 'weapon' ? WEAPONS[offer.weapon] : null,
    x,
    y,
    sortY: y,
    tall: true,
    box: { l: x - W / 2, t: y - 12, r: x + W / 2, b: y },
    lightBox: () => ({ x: x - W / 2 - 2, y: y - H - 1, w: W + 4, h: H + 4 }),
    lightRows: () => [y + 1],
    lightRegions: () => [{ y0: 0, y1: TOP + 1, ambient: true }],   // a tall cabinet: its top is above the light
    fixedShape: true,
    // where you stand to use it, and the lights it gives off
    front: { x, y: y + 8 },
    lights: [
      { x, y: y + 3, radius: 78, color: [190, 228, 222], intensity: 0.75, static: true },
      { x, y: y - 9, radius: 24, color: [255, 255, 255], intensity: 1.6, shadows: false, static: true },
    ],
    draw(ctx) {
      ctx.drawImage(SHADOW, x - 25, y - 3);
      ctx.drawImage(img, x - W / 2, y - H);
    },
  };
}
