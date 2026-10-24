// Item definitions and their inventory icons.
//
// Every item takes up w x h cells in a grid (Delta Force style). Stackable
// items (ammo, meds, grenades) carry a count; armor carries durability;
// backpacks carry their own grid of items.

import { makeCanvas, rect } from '../engine/pixel.js';
import { ATTACH_ART } from '../combat/gunart.js';
import { THROWABLES, throwableIcon } from '../combat/throwables.js';

export const CELL = 12;   // grid cell size in HUD pixels

const AMMO = (name, caliber, stack, color, tip) => ({ name, type: 'ammo', caliber, stack, w: 1, h: 1, color, tip });
const MOD = (name, slot, w = 1, h = 1) => ({ name, type: 'attachment', slot, w, h });

export const ITEMS = {
  ammo9: AMMO('9MM', '9mm', 60, '#4f6b33', '#e8b84a'),
  ammo45: AMMO('.45', '.45', 50, '#5a4a2a', '#e8b84a'),
  ammo556: AMMO('5.56', '5.56', 60, '#7a3326', '#e8b84a'),
  ammo762: AMMO('7.62', '7.62', 60, '#3c5a5a', '#e8b84a'),
  ammo12: AMMO('12G', '12g', 24, '#8a2a22', '#c23a2e'),
  ammo308: AMMO('.308', '.308', 20, '#3e4058', '#e8b84a'),
  ammo50: AMMO('.50', '.50', 15, '#2a2a2a', '#e8dfc0'),
  // battery packs: power the chainsaw now (and battery guns later); used up whole, like rounds
  battery: AMMO('BATTERY', 'battery', 4, '#1c2221', '#e8b84a'),
  bandage: { name: 'BANDAGE', type: 'med', heal: 30, useTime: 1.4, stack: 4, w: 1, h: 1 },
  medkit: { name: 'MEDKIT', type: 'med', heal: 80, useTime: 2.6, stack: 1, w: 2, h: 1 },
  vestLight: { name: 'LIGHT VEST', type: 'armor', armor: 0.3, durability: 120, w: 2, h: 2 },
  vestHeavy: { name: 'HEAVY VEST', type: 'armor', armor: 0.5, durability: 220, w: 2, h: 3 },
  helmet: { name: 'HELMET', type: 'helmet', armor: 0.15, durability: 80, w: 2, h: 2 },
  packSmall: { name: 'SMALL PACK', type: 'backpack', grid: [5, 3], w: 2, h: 2 },
  packLarge: { name: 'LARGE PACK', type: 'backpack', grid: [7, 5], w: 3, h: 3 },
  // ammo rigs: their own grid, for ammo and throwables only
  pouch: { name: 'AMMO POUCH', type: 'rig', grid: [4, 2], w: 2, h: 1 },
  chestRig: { name: 'CHEST RIG', type: 'rig', grid: [6, 3], w: 2, h: 2 },
  redDot: MOD('RED DOT', 'sight'),
  holo: MOD('HOLO SIGHT', 'sight'),
  scope: MOD('SCOPE 4X', 'sight', 2, 1),
  suppressor: MOD('SUPPRESSOR', 'muzzle', 2, 1),
  compensator: MOD('COMPENSATOR', 'muzzle'),
  vgrip: MOD('VERT GRIP', 'under'),
  agrip: MOD('ANGLED GRIP', 'under'),
  extMag: MOD('EXT MAG', 'mag', 1, 2),
  drumMag: MOD('DRUM MAG', 'mag', 2, 2),
  heavyStock: MOD('HEAVY STOCK', 'stock', 2, 1),
  flashlight: MOD('FLASHLIGHT', 'side'),
  laser: MOD('LASER', 'side'),
  laserLight: MOD('LASER+LIGHT', 'side'),
};
// every throwable is an item too (G throws the selected one)
for (const [id, t] of Object.entries(THROWABLES)) ITEMS[id] = { name: t.name, type: 'throwable', stack: id === 'taser' ? 6 : 4, w: 1, h: 1 };
for (const [id, def] of Object.entries(ITEMS)) def.id = id;

export const AMMO_FOR = { battery: 'battery', '9mm': 'ammo9', '.45': 'ammo45', '5.56': 'ammo556', '7.62': 'ammo762', '12g': 'ammo12', '.308': 'ammo308', '.50': 'ammo50' };

// Make an item instance.
export function makeItem(id, count) {
  const def = ITEMS[id];
  const item = { id, def, rot: false };
  if (def.stack) item.count = Math.max(1, Math.min(def.stack, count ?? def.stack));
  if (def.durability) item.durability = def.durability;
  if (def.grid) item.grid = null;   // filled in by the inventory (needs the Grid class)
  return item;
}

// --- guns as items (in a bag or on the floor) ---
// The item wraps the actual Weapon, so its ammo and attachments go with it.
const GUN_SIZE = { pistol: [2, 1], smg: [3, 2], rifle: [4, 2], shotgun: [4, 2], sniper: [5, 2], lmg: [5, 2], spec: [4, 2] };
const gunDefs = {};
export function gunItem(weapon) {
  const d = weapon.def;
  const [w, h] = GUN_SIZE[d.cls] ?? [4, 2];
  gunDefs[d.key] ??= { id: `gun:${d.key}`, name: d.name, type: 'gun', w, h };
  weapon.item ??= { id: gunDefs[d.key].id, def: gunDefs[d.key], rot: false, weapon };
  return weapon.item;
}

// Melee weapons are items the same way (wrapping the MeleeWeapon).
const meleeDefs = {};
export function meleeItem(melee) {
  const d = melee.def;
  meleeDefs[d.key] ??= { id: `melee:${d.key}`, name: d.name, type: 'melee', w: Math.max(2, Math.ceil((d.img.width + 2) / CELL)), h: Math.max(1, Math.ceil((d.img.height - 2) / CELL)) };
  melee.item ??= { id: meleeDefs[d.key].id, def: meleeDefs[d.key], rot: false, melee };
  return melee.item;
}

// The picture for an item: a gun shows itself as it is (with its attachments).
export function itemImage(item) {
  return item.weapon ? item.weapon.icon : item.melee ? item.melee.def.img : itemIcon(item.def);
}

export const itemW = (it) => (it.rot ? it.def.h : it.def.w);
export const itemH = (it) => (it.rot ? it.def.w : it.def.h);

// --- icons (drawn once per item type, sized to the item's cells) ---

const icons = {};
export function itemIcon(def) {
  if (icons[def.id]) return icons[def.id];
  const w = def.w * CELL - 2, h = def.h * CELL - 2;
  const [c, g] = makeCanvas(w, h);
  const K = '#0d100b';
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
  switch (def.type) {
    case 'ammo':
      if (def.id === 'battery') {
        // a black pack with a yellow band and two terminals
        rect(g, K, 1, 2, 8, 7);
        rect(g, '#2b2e2f', 2, 3, 6, 5);
        rect(g, '#e8b84a', 2, 5, 6, 1);
        rect(g, K, 2, 1, 2, 1);
        rect(g, K, 6, 1, 2, 1);
        rect(g, '#8d9c9c', 3, 3, 1, 1);
        break;
      }
      // a cardboard box with rounds poking out of the top
      rect(g, K, 1, 3, 8, 7);
      rect(g, def.color, 2, 4, 6, 5);
      rect(g, '#ffffff22', 2, 4, 6, 1);
      for (let i = 0; i < 3; i++) {
        rect(g, K, 2 + i * 2, 0, 2, 4);
        rect(g, def.tip, 2 + i * 2, 1, 1, 2);
      }
      break;
    case 'med':
      if (def.id === 'medkit') {
        rect(g, K, 2, 1, w - 4, h - 2);
        rect(g, '#c7302f', 3, 2, w - 6, h - 4);
        rect(g, '#f2f2ea', cx - 1, 3, 2, h - 6);
        rect(g, '#f2f2ea', cx - 3, cy - 1, 6, 2);
      } else {
        rect(g, K, 1, 2, 8, 6);
        rect(g, '#e8e4d6', 2, 3, 6, 4);
        rect(g, '#c9c3b0', 2, 5, 6, 1);
        rect(g, '#c7302f', 4, 3, 2, 4);
      }
      break;
    case 'throwable':
      g.drawImage(throwableIcon(def.id, w, h), 0, 0);
      break;
    case 'armor':
      // plate carrier
      rect(g, K, 2, 1, w - 4, h - 2);
      rect(g, def.id === 'vestHeavy' ? '#3e4a2c' : '#5a6640', 3, 2, w - 6, h - 4);
      rect(g, K, cx - 3, 1, 6, 3);
      for (let y = 6; y < h - 4; y += 4) rect(g, '#2b331f', 4, y, w - 8, 2);
      break;
    case 'helmet':
      rect(g, K, 3, 4, w - 6, h - 8);
      rect(g, K, 2, h - 6, w - 4, 3);
      rect(g, '#4a5240', 4, 5, w - 8, h - 10);
      rect(g, '#5d6750', 4, 5, w - 8, 2);
      rect(g, '#3a4032', 3, h - 5, w - 6, 1);
      break;
    case 'rig':
      // webbing with mag pouches
      rect(g, K, 1, 1, w - 2, h - 2);
      rect(g, '#4a5240', 2, 2, w - 4, h - 4);
      for (let x = 3; x < w - 4; x += 5) {
        rect(g, K, x, 3, 4, h - 6);
        rect(g, '#5d6750', x + 1, 4, 2, Math.max(1, h - 8));
        rect(g, '#c9b45a', x + 1, 3, 2, 1);
      }
      break;
    case 'backpack':
      rect(g, K, 3, 2, w - 6, h - 3);
      rect(g, '#5d5040', 4, 3, w - 8, h - 5);
      rect(g, '#6f6050', 4, 3, w - 8, 2);
      rect(g, K, 5, cy, w - 10, 4);
      rect(g, '#4a3f32', 6, cy + 1, w - 12, 2);
      break;
    case 'attachment': {
      const art = ATTACH_ART[def.id].img;
      const s = Math.max(1, Math.floor(Math.min((w - 2) / art.width, (h - 2) / art.height)));
      g.drawImage(art, Math.floor((w - art.width * s) / 2), Math.floor((h - art.height * s) / 2), art.width * s, art.height * s);
      break;
    }
  }
  icons[def.id] = c;
  return c;
}
