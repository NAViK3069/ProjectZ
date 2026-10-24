// Grid inventory (Delta Force style): items take w x h cells and can be
// rotated. The player has a couple of pocket slots, equipment slots (helmet,
// armor, backpack) and whatever grid the equipped backpack provides - the
// backpack carries its own grid, so swapping packs swaps the contents too.
//
// It's also the ammo source for guns: count / take / give by calibre.

import { ITEMS, AMMO_FOR, makeItem, itemW, itemH } from './items.js';

export class Grid {
  // allows(item): what may go in it (an ammo rig only takes ammo and throwables)
  constructor(w, h, allows = null) {
    this.w = w;
    this.h = h;
    this.entries = [];   // { item, x, y }
    this.allowsFn = allows;
  }

  allows(item) {
    return !this.allowsFn || this.allowsFn(item);
  }

  at(x, y) {
    return this.entries.find((e) => x >= e.x && y >= e.y && x < e.x + itemW(e.item) && y < e.y + itemH(e.item));
  }

  fits(x, y, w, h, ignore = null) {
    if (x < 0 || y < 0 || x + w > this.w || y + h > this.h) return false;
    return !this.entries.some((e) => e.item !== ignore && x < e.x + itemW(e.item) && x + w > e.x && y < e.y + itemH(e.item) && y + h > e.y);
  }

  place(item, x, y) {
    if (!this.fits(x, y, itemW(item), itemH(item), item)) return false;
    this.remove(item);
    this.entries.push({ item, x, y });
    return true;
  }

  // First free spot, trying the item rotated too.
  findSpace(item) {
    for (const rot of [item.rot, !item.rot]) {
      const w = rot ? item.def.h : item.def.w, h = rot ? item.def.w : item.def.h;
      for (let y = 0; y <= this.h - h; y++) for (let x = 0; x <= this.w - w; x++) if (this.fits(x, y, w, h)) return { x, y, rot };
    }
    return null;
  }

  remove(item) {
    this.entries = this.entries.filter((e) => e.item !== item);
  }

  get items() {
    return this.entries.map((e) => e.item);
  }
}

// Backpacks get their grid on creation.
const RIG_ITEMS = (it) => it.def.type === 'ammo' || it.def.type === 'throwable';

export function newItem(id, count) {
  const item = makeItem(id, count);
  if (item.def.grid) item.grid = new Grid(...item.def.grid, item.def.type === 'rig' ? RIG_ITEMS : null);
  return item;
}

export class Inventory {
  constructor() {
    this.pockets = new Grid(4, 2);
    this.equip = { helmet: null, armor: null, backpack: newItem('packSmall'), rig: newItem('pouch') };
    this.onChange = null;
  }

  get backpack() {
    return this.equip.backpack?.grid ?? null;
  }

  get rig() {
    return this.equip.rig?.grid ?? null;
  }

  // Grids items can go in, in order of preference (ammo goes in the rig first).
  get grids() {
    return [this.rig, this.pockets, this.backpack].filter(Boolean);
  }

  get all() {
    return this.grids.flatMap((g) => g.items);
  }

  // Put an item somewhere: top up matching stacks first, then free space.
  // Returns true if it all went in (a partial stack keeps its leftover count).
  add(item) {
    if (item.def.stack) {
      for (const it of this.all) {
        if (it.id !== item.id || it.count >= it.def.stack) continue;
        const n = Math.min(item.count, it.def.stack - it.count);
        it.count += n;
        item.count -= n;
        if (item.count <= 0) return true;
      }
    }
    for (const g of this.grids) {
      if (!g.allows(item)) continue;
      const spot = g.findSpace(item);
      if (spot) {
        item.rot = spot.rot;
        g.place(item, spot.x, spot.y);
        return true;
      }
    }
    return false;
  }

  // Which grid holds this item (or null).
  gridOf(item) {
    return this.grids.find((g) => g.items.includes(item)) ?? null;
  }

  remove(item) {
    for (const g of this.grids) g.remove(item);
    for (const k of Object.keys(this.equip)) if (this.equip[k] === item) this.equip[k] = null;
  }

  countId(id) {
    return this.all.reduce((n, it) => n + (it.id === id ? it.count ?? 1 : 0), 0);
  }

  // Take up to n of a stackable item; returns how many were taken.
  takeId(id, n) {
    let got = 0;
    for (const it of this.all.filter((i) => i.id === id).sort((a, b) => a.count - b.count)) {
      const k = Math.min(n - got, it.count);
      it.count -= k;
      got += k;
      if (it.count <= 0) this.remove(it);
      if (got >= n) break;
    }
    return got;
  }

  // --- ammo source for guns ---
  count(caliber) {
    return this.countId(AMMO_FOR[caliber]);
  }

  take(caliber, n) {
    return this.takeId(AMMO_FOR[caliber], n);
  }

  // Ammo coming back out of a gun; whatever doesn't fit is lost.
  give(caliber, n) {
    const id = AMMO_FOR[caliber], stack = ITEMS[id].stack;
    while (n > 0) {
      const it = newItem(id, Math.min(n, stack));
      n -= it.count;
      if (!this.add(it)) break;
    }
  }
}
