// TAB inventory screen (Delta Force style), in three columns:
//   left   - NEARBY LOOT: everything lying on the floor around you
//   middle - your status, gear slots (helmet, armor, bag, ammo rig), the
//            melee slot and both gun slots (each with its attachment slots).
//            Guns and melee weapons are items too: drag one out into a bag or
//            onto the floor, or back into a slot
//   right  - storage: pockets, the ammo rig's grid, the bag's grid
//
// Mouse: drag items between grids / slots, R rotates while dragging,
// right-click an item for a menu of what you can do with it (use, equip,
// attach, move to the bag, split a stack, drop...).
// Touch: tap an item to pick it up, tap where it should go.
// Layout is in HUD pixels (one HUD pixel = one world pixel on screen).

import { drawText, textWidth } from './font.js';
import { CELL, itemIcon, itemImage, gunItem, meleeItem, itemW, itemH } from '../game/items.js';
import { Grid, newItem } from '../game/inventory.js';
import { ATTACH_ART } from '../combat/gunart.js';
import { MAX_HP, MAX_STAMINA } from '../entities/player.js';
import { Weapon } from '../combat/weapons.js';

const C = {
  bg: 'rgba(8, 11, 7, 0.62)',   // the game carries on behind
  panel: '#151b12',
  panelHi: '#232c1e',
  cell: '#1d2419',
  cellLine: '#2b3526',
  frame: '#050604',
  text: '#e8ecd8',
  dim: '#7c8670',
  green: '#9bd65a',
  red: '#ff4a4a',
  ok: 'rgba(155, 214, 90, 0.35)',
  bad: 'rgba(255, 74, 74, 0.35)',
  sel: '#d7313d',
};
const SLOT_NAMES = { sight: 'SIGHT', muzzle: 'MUZZLE', under: 'GRIP', side: 'RAIL', mag: 'MAG', stock: 'STOCK' };
const SLOT_W = 26;   // an attachment slot in the gun panels (fits its label)
const EQUIP = [['helmet', 'HELMET'], ['armor', 'ARMOR'], ['backpack', 'BAG'], ['rig', 'AMMO'], ['melee', 'MELEE']];
const NEARBY_RANGE = 40;

export class InventoryScreen {
  constructor(player, loot) {
    this.player = player;
    this.loot = loot;
    this.drag = null;          // { item, from, grabX, grabY }
    this.modSlot = 0;          // which weapon the MODS panel shows
    this.hover = null;
    this.mouse = { x: 0, y: 0 };
    this.nearbySize = { w: 10, h: 12 };   // fills the left column (set while drawing)
    this.nearby = new Grid(10, 12);
    this.zones = [];           // hit areas built while drawing
    this.info = null;          // { round, money } or { training: true } for the status panel
    this.menu = null;          // right-click menu: { x, y, title, options: [{ label, run }], rects }
  }

  open() {
    this.modSlot = this.player.slot;
    this.drag = null;
    this.menu = null;
    this.layoutNearby();
  }

  close() {
    if (this.drag) this.cancelDrag();
    this.menu = null;
  }

  // Lay the floor items around the player out in the NEARBY grid.
  layoutNearby() {
    const grid = new Grid(this.nearbySize.w, this.nearbySize.h);
    this.nearbyEntries = this.loot.nearby(this.player.x, this.player.y, NEARBY_RANGE);
    for (const e of this.nearbyEntries) {
      const spot = grid.findSpace(e.item);
      if (spot) {
        e.item.rot = spot.rot;
        grid.place(e.item, spot.x, spot.y);
      }
    }
    this.nearby = grid;
  }

  // Re-lay NEARBY if what's lying around changed (the game keeps going while the bag is open).
  refreshNearby() {
    const now = this.loot.nearby(this.player.x, this.player.y, NEARBY_RANGE);
    if (now.length !== this.nearbyEntries?.length || now.some((e, i) => e !== this.nearbyEntries[i])) this.layoutNearby();
  }

  get inv() {
    return this.player.inventory;
  }

  // ---------- input ----------

  // m: mouse position in HUD px; presses: { down, up, right, rotate }
  update(m, presses) {
    this.mouse = m;
    if (!this.drag && !this.menu) this.refreshNearby();
    if (presses.rotate && this.drag) this.drag.item.rot = !this.drag.item.rot;
    const hit = this.hitTest(m.x, m.y);
    this.hover = hit;
    if (this.menu) {
      // a menu is open: a click picks one of its options, anywhere else closes it
      if (presses.down || presses.right) this.pickMenu(m);
      return;
    }
    if (presses.right && hit?.item && !this.drag) this.openMenu(hit, m);
    else if (presses.down && !this.drag) {
      if (hit?.item) this.startDrag(hit, m);
      else if (hit?.kind === 'weapon') this.modSlot = hit.index;
    } else if (presses.up && this.drag) {
      this.dropAt(hit, m);
    }
  }

  // Touch: first tap picks an item up, the next tap puts it down.
  tap(m) {
    if (this.menu) return this.pickMenu(m);
    const hit = this.hitTest(m.x, m.y);
    if (this.drag) this.dropAt(hit, m);
    else if (hit?.item) this.startDrag(hit, m);
    else if (hit?.kind === 'weapon') this.modSlot = hit.index;
  }

  hitTest(x, y) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (x >= z.x && y >= z.y && x < z.x + z.w && y < z.y + z.h) {
        if (z.kind === 'grid') {
          const cx = Math.floor((x - z.x) / z.cell), cy = Math.floor((y - z.y) / z.cell);
          const e = z.grid.at(cx, cy);
          return { ...z, cx, cy, item: e?.item ?? null, entry: e };
        }
        return z;
      }
    }
    return null;
  }

  startDrag(hit, m) {
    const item = hit.item;
    let grabX = 0, grabY = 0;
    if (hit.kind === 'grid') {
      grabX = hit.cx - hit.entry.x;
      grabY = hit.cy - hit.entry.y;
    }
    this.drag = { item, from: hit, grabX, grabY, rot0: item.rot };
    if (hit.kind === 'weapon') this.modSlot = hit.index;
  }

  cancelDrag() {
    this.drag.item.rot = this.drag.rot0;
    this.drag = null;
  }

  // Take an item out of wherever it is (`from` is the zone it was found in).
  detach(from, item) {
    if (from.kind === 'grid') from.grid.remove(item);
    if (from.kind === 'equip') this.inv.equip[from.slot] = null;
    if (from.kind === 'mod') from.weapon.setAttachment(from.slot, null);
    if (from.kind === 'weapon') this.player.setGun(from.index, null);
    if (from.kind === 'melee') this.player.setMelee(null);
    if (from.ground || from.grid === this.nearby) {
      const e = this.nearbyEntries.find((n) => n.item === item);
      if (e) this.loot.remove(e);
    }
  }

  // Put something back on the floor at the player's feet.
  toGround(item) {
    this.loot.drop(item, this.player.x, this.player.y + 2, 0.3);
    this.loot.items[this.loot.items.length - 1].z = 0;
    this.loot.items[this.loot.items.length - 1].vz = 0;
  }

  // Somewhere for an item that's been bumped out: the bag, or the floor.
  stow(item) {
    if (!this.inv.add(item)) this.toGround(item);
  }

  afterChange() {
    this.layoutNearby();
  }

  // --- moving things: each returns false if the item can't go there ---

  // Into a grid cell (d: the drag, for where on the item it was grabbed).
  toGrid(item, d, hit) {
    const x = hit.cx - (item.rot === d.rot0 ? d.grabX : d.grabY), y = hit.cy - (item.rot === d.rot0 ? d.grabY : d.grabX);
    const target = hit.grid.at(hit.cx, hit.cy)?.item;
    // dropping onto the same kind of stack tops it up
    if (target && target !== item && target.id === item.id && item.def.stack && target.count < item.def.stack) {
      const n = Math.min(item.count, item.def.stack - target.count);
      target.count += n;
      item.count -= n;
      if (item.count <= 0) this.detach(d.from, item);
      return true;
    }
    // can't put a backpack inside itself; an ammo rig only takes ammo and throwables
    if ((item.grid && item.grid === hit.grid) || !hit.grid.allows(item)) return false;
    if (!hit.grid.fits(x, y, itemW(item), itemH(item), item)) return false;
    this.detach(d.from, item);
    if (hit.grid === this.nearby) this.toGround(item);
    else hit.grid.place(item, x, y);
    return true;
  }

  // Into a gear slot; swapping one rig / bag for another moves its contents across.
  toEquip(item, from, slot) {
    if (item.def.type !== slot) return false;
    const old = this.inv.equip[slot];
    this.detach(from, item);
    item.rot = false;
    this.inv.equip[slot] = item;
    if (old?.grid && item.grid) {
      for (const it of old.grid.items) {
        old.grid.remove(it);
        const spot = item.grid.allows(it) && item.grid.findSpace(it);
        if (spot) {
          it.rot = spot.rot;
          item.grid.place(it, spot.x, spot.y);
        } else this.stow(it);
      }
    }
    if (old) this.stow(old);
    return true;
  }

  // Into gun slot i (from the other slot: the two swap).
  toGunSlot(item, from, i) {
    if (!item.weapon) return false;
    const p = this.player;
    if (from.kind === 'weapon') {
      if (from.index !== i) {
        const inHand = p.weapons[p.slot];
        [p.weapons[0], p.weapons[1]] = [p.weapons[1], p.weapons[0]];
        if (inHand) p.slot = p.weapons.indexOf(inHand);
      }
      this.modSlot = i;
      return true;
    }
    this.detach(from, item);
    item.rot = false;
    const old = p.setGun(i, item.weapon);
    if (old) this.stow(gunItem(old));
    this.modSlot = i;
    return true;
  }

  toMeleeSlot(item, from) {
    if (!item.melee) return false;
    if (from.kind === 'melee') return true;
    this.detach(from, item);
    item.rot = false;
    const old = this.player.setMelee(item.melee);
    if (old) this.stow(meleeItem(old));
    return true;
  }

  // Onto a gun's attachment slot.
  toMod(item, from, w, slot) {
    if (item.def.type !== 'attachment' || ATTACH_ART[item.id].slot !== slot || !w?.canAttach(item.id)) return false;
    const old = w.attach[slot];
    this.detach(from, item);
    w.setAttachment(slot, item.id);
    if (old) this.stow(newItem(old));
    return true;
  }

  toBag(item, from) {
    this.detach(from, item);
    this.stow(item);
    return true;
  }

  toFloor(item, from) {
    this.detach(from, item);
    this.toGround(item);
    return true;
  }

  // Off the floor: guns / melee weapons into an empty slot if there is one, the rest into the bags.
  pickUp(item, from) {
    const p = this.player, free = item.weapon ? p.weapons.indexOf(null) : -1;
    if (free >= 0) return this.toGunSlot(item, from, free);
    if (item.melee && p.melee.def.fists) return this.toMeleeSlot(item, from);
    const e = this.nearbyEntries.find((n) => n.item === item);
    if (e && this.inv.add(item)) this.loot.remove(e);
    return true;
  }

  // Half a stack into a separate pile (same grid if there's room, else another, else the floor).
  split(item, grid) {
    const half = Math.floor(item.count / 2), pile = newItem(item.id, half);
    for (const g of [grid, ...this.inv.grids]) {
      const spot = g.allows(pile) && g.findSpace(pile);
      if (!spot) continue;
      pile.rot = spot.rot;
      g.place(pile, spot.x, spot.y);
      item.count -= half;
      return true;
    }
    item.count -= half;
    this.toGround(pile);
    return true;
  }

  dropAt(hit, m) {
    const d = this.drag, item = d.item;
    this.drag = null;
    if (!hit || (hit.kind === d.from.kind && hit.item === item && hit.kind !== 'grid')) return this.restore(d);
    let ok = false;
    if (hit.kind === 'grid') ok = this.toGrid(item, d, hit);
    else if (hit.kind === 'equip') ok = this.toEquip(item, d.from, hit.slot);
    else if (hit.kind === 'weapon') ok = this.toGunSlot(item, d.from, hit.index);
    else if (hit.kind === 'melee') ok = this.toMeleeSlot(item, d.from);
    else if (hit.kind === 'mod') ok = this.toMod(item, d.from, hit.weapon, hit.slot);
    else if (hit.kind === 'nearbyPanel') ok = this.toFloor(item, d.from);
    if (!ok) return this.restore(d);
    this.afterChange();
  }

  restore(d) {
    d.item.rot = d.rot0;
  }

  // --- right-click menu (Delta Force style) ---

  openMenu(hit, m) {
    const options = this.menuFor(hit);
    if (options.length) this.menu = { x: m.x, y: m.y, title: hit.item.def.name, options, rects: [] };
  }

  pickMenu(m) {
    const r = this.menu.rects.find((r) => m.x >= r.x && m.y >= r.y && m.x < r.x + r.w && m.y < r.y + r.h);
    this.menu = null;
    if (!r) return;
    r.run();
    this.afterChange();
  }

  // What can be done with the item in zone `hit`, most useful first.
  menuFor(hit) {
    const item = hit.item, p = this.player, t = item.def.type;
    const onFloor = hit.kind === 'grid' && hit.grid === this.nearby;
    const inBags = hit.kind === 'grid' && !onFloor;
    const o = [];
    const add = (label, run) => o.push({ label, run });
    if (['med', 'food', 'drink', 'repair'].includes(t) && inBags) add(t === 'food' ? 'EAT' : t === 'drink' ? 'DRINK' : 'USE', () => p.useItem(item));
    if (t === 'throwable' && inBags) add('SELECT FOR [G]', () => (p.throwSel = item.id));
    if (['helmet', 'armor', 'backpack', 'rig'].includes(t) && hit.kind !== 'equip') add('EQUIP', () => this.toEquip(item, hit, t));
    if (item.weapon && hit.kind === 'weapon') add(`MOVE TO SLOT ${3 - hit.index}`, () => this.toGunSlot(item, hit, 1 - hit.index));
    else if (item.weapon) for (const i of [0, 1]) add(`EQUIP TO SLOT ${i + 2}`, () => this.toGunSlot(item, hit, i));
    if (item.melee && hit.kind !== 'melee') add('EQUIP', () => this.toMeleeSlot(item, hit));
    if (t === 'attachment' && hit.kind !== 'mod') {
      p.weapons.forEach((w) => {
        if (w?.canAttach(item.id)) add(`ATTACH TO ${w.def.name}`, () => this.toMod(item, hit, w, ATTACH_ART[item.id].slot));
      });
    }
    if (onFloor) add('PICK UP', () => this.pickUp(item, hit));
    else if (!inBags) add(hit.kind === 'mod' ? 'DETACH' : hit.kind === 'equip' ? 'UNEQUIP' : 'TO BAG', () => this.toBag(item, hit));
    if (inBags && item.def.stack && item.count > 1) add('SPLIT', () => this.split(item, hit.grid));
    if (!onFloor) add('DROP', () => this.toFloor(item, hit));
    return o;
  }

  // ---------- drawing ----------

  draw(ctx, r, time) {
    const u = r.scale, W = r.width / u, H = r.height / u;
    const px = (x, y, w, h, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x * u), Math.round(y * u), Math.round(w * u), Math.round(h * u));
    };
    const text = (s, x, y, color = C.text, size = 1) => drawText(ctx, s, Math.round(x * u), Math.round(y * u), u * size, color);
    const box = (x, y, w, h, label) => {
      px(x - 1, y - 1, w + 2, h + 2, C.frame);
      px(x, y, w, h, C.panel);
      px(x, y, w, 1, C.panelHi);
      if (label) text(label, x + 3, y + 3, C.dim);
    };
    this.zones = [];
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, r.width, r.height);

    const p = this.player, inv = this.inv;
    const M = 6, GAP = 6;
    text('INVENTORY', M, M, C.text);
    const hint = 'TAB CLOSE   R ROTATE   RCLICK QUICK';
    text(hint, W - M - textWidth(hint), M, C.dim);
    const top = M + 10, bottom = H - M;

    // Grid cell size: as big as fits (up to twice the item art), in steps
    // that keep the art's pixels whole on screen (cs * u is a multiple of 12).
    const fitsAt = (c) => {
      const tall = [inv.pockets, inv.rig, inv.backpack].reduce((n, g) => n + (g ? g.h * c + 17 : 18), 0);
      const wide = 2 * M + 2 * GAP + (7 * c + 6) + 150 + (4 * c + 6);
      return tall <= bottom - top && wide <= W;
    };
    let cs = CELL;
    for (let m = 2 * u; m > u; m--) if (fitsAt((CELL * m) / u)) {
      cs = (CELL * m) / u;
      break;
    }
    const k = cs / CELL;   // how big the item art is drawn

    // An item's picture, centred in a w x h box: icons at the grid's scale,
    // guns (their own size) shrunk to fit; rotated items turned a quarter.
    const drawItem = (item, x, y, w, h) => {
      const img = itemImage(item), rot = item.rot;
      const iw = rot ? img.height : img.width, ih = rot ? img.width : img.height;
      // whole screen pixels per art pixel, so every gun's pixels come out even and crisp
      const sc = Math.max(1, Math.floor(Math.min(item.weapon ? 2 * k : k, (w - 2) / iw, (h - 2) / ih) * u));
      ctx.save();
      ctx.translate(Math.round((x + w / 2) * u), Math.round((y + h / 2) * u));
      if (rot) ctx.rotate(Math.PI / 2);
      const dw = img.width * sc, dh = img.height * sc;
      ctx.drawImage(img, -Math.round(dw / 2), -Math.round(dh / 2), dw, dh);
      ctx.restore();
    };

    // minW: box width to line up with the others in its column
    const drawGrid = (grid, x, y, label, minW = 0) => {
      const w = grid.w * cs, h = grid.h * cs, bw = Math.max(w + 4, minW);
      box(x, y, bw, h + 11);
      text(label, x + 3, y + 2, C.dim);
      const gx0 = x + Math.floor((bw - w) / 2), gy0 = y + 9;
      for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++) {
        px(gx0 + i * cs, gy0 + j * cs, cs, cs, C.cellLine);
        px(gx0 + i * cs + 1, gy0 + j * cs + 1, cs - 1, cs - 1, C.cell);
      }
      this.zones.push({ kind: 'grid', grid, x: gx0, y: gy0, w, h, cell: cs });
      for (const e of grid.entries) {
        if (this.drag && this.drag.item === e.item) continue;
        const iw = itemW(e.item) * cs, ih = itemH(e.item) * cs, ix = gx0 + e.x * cs, iy = gy0 + e.y * cs;
        px(ix + 1, iy + 1, iw - 1, ih - 1, e.item.weapon ? '#2c3426' : '#283222');
        drawItem(e.item, ix, iy, iw, ih);
        if (e.item.count > 1 || e.item.def.type === 'ammo') {
          const s = String(e.item.count);
          text(s, ix + iw - textWidth(s) - 1, iy + ih - 6, C.text);
        }
      }
      // where the dragged item would land
      if (this.drag && this.hover?.grid === grid) {
        const it = this.drag.item;
        const tx = this.hover.cx - (it.rot === this.drag.rot0 ? this.drag.grabX : this.drag.grabY);
        const ty = this.hover.cy - (it.rot === this.drag.rot0 ? this.drag.grabY : this.drag.grabX);
        const ok = grid.allows(it) && (grid.fits(tx, ty, itemW(it), itemH(it), it) || (this.hover.item && this.hover.item.id === it.id && it.def.stack));
        px(gx0 + tx * cs, gy0 + ty * cs, itemW(it) * cs, itemH(it) * cs, ok ? C.ok : C.bad);
      }
      return h + 15;
    };
    // a picture scaled to fit w x h (at most `max` times), centred
    const fit = (img, x, y, w, h, max = 1) => {
      // whole screen pixels per art pixel (never a blurry in-between size)
      const d = Math.max(1, Math.floor(Math.min(max, w / img.width, h / img.height) * u));
      ctx.drawImage(img, Math.round((x + w / 2) * u - (img.width * d) / 2), Math.round((y + h / 2) * u - (img.height * d) / 2), img.width * d, img.height * d);
    };

    // column widths: storage fits the biggest bag (7 wide) and gets any
    // spare room; the floor column stays narrow; the middle takes the rest
    const rest = W - 2 * M - (7 * cs + 6) - 2 * GAP;
    const LW = Math.max(4 * cs + 6, Math.min(7 * cs + 6, Math.round(rest * 0.34)));
    const MW = Math.max(150, Math.min(240, rest - LW));
    const RW = W - 2 * M - 2 * GAP - LW - MW;
    const lx = M, mx = lx + LW + GAP, rx = mx + MW + GAP;

    // ---- left: nearby loot ----
    const cols = Math.max(4, Math.floor((LW - 4) / cs)), rows = Math.max(3, Math.floor((bottom - top - 15) / cs));
    if (cols !== this.nearbySize.w || rows !== this.nearbySize.h) {
      this.nearbySize = { w: cols, h: rows };
      this.layoutNearby();
    }
    const nh = drawGrid(this.nearby, lx, top, 'NEARBY LOOT', LW);
    this.zones.unshift({ kind: 'nearbyPanel', x: lx, y: top, w: LW, h: nh });
    if (!this.nearby.entries.length) {
      const s = 'NOTHING ON THE FLOOR';
      text(s, lx + LW / 2 - textWidth(s) / 2, top + nh / 2 - 3, '#3c4636');
    }

    // ---- middle: status ----
    const sh = 32;
    box(mx, top, MW, sh);
    px(mx + 3, top + 4, 24, 24, C.frame);
    px(mx + 4, top + 5, 22, 22, '#1d2419');
    ctx.drawImage(p.parts.head, 5, 0, 22, 21, Math.round((mx + 4) * u), Math.round((top + 6) * u), 22 * u, 21 * u);
    const bx = mx + 31, bw = MW - 35;
    px(bx, top + 5, bw, 5, C.frame);
    px(bx, top + 5, (bw * Math.max(0, p.hp)) / MAX_HP, 5, '#d7313d');
    px(bx, top + 5, (bw * Math.max(0, p.hp)) / MAX_HP, 1, '#ff6670');
    px(bx, top + 12, bw, 3, C.frame);
    px(bx, top + 12, (bw * p.stamina) / MAX_STAMINA, 3, '#3fd0a0');
    const info = this.info ?? {};
    if (info.training) text('TRAINING', bx, top + 19, '#e6c63a');
    else {
      text(info.label ?? `ROUND ${Math.max(1, info.round ?? 1)}`, bx, top + 19, C.text);
      const m = `$${info.money ?? 0}`;
      text(m, mx + MW - 4 - textWidth(m), top + 19, C.green);
    }

    // ---- middle: gear slots (the last one is the melee weapon, slot 1) ----
    const ey = top + sh + GAP, sw = Math.floor((MW - 4 * 3) / 5), eh = 34;
    EQUIP.forEach(([slot, label], i) => {
      const ex = mx + i * (sw + 3);
      box(ex, ey, sw, eh);
      text(label, ex + Math.round(sw / 2 - textWidth(label) / 2), ey + 2, slot === 'melee' && p.meleeOut ? C.text : C.dim);
      const zy = ey + 9, zh = eh - 10;
      px(ex + 1, zy, sw - 2, zh, C.cell);
      if (slot === 'melee') {
        const m = p.melee, it = !m.def.fists && this.drag?.item.melee !== m ? meleeItem(m) : null;
        this.zones.push({ kind: 'melee', x: ex, y: zy, w: sw, h: zh, item: it });
        if (it) fit(m.def.img, ex + 2, zy + 1, sw - 4, zh - 2);
        else text('FIST', ex + Math.round(sw / 2 - textWidth('FIST') / 2), zy + zh / 2 - 3, '#3c4636');
        if (this.drag?.item.melee && this.drag.item.melee !== m) px(ex + 1, zy, sw - 2, zh, C.ok);
        return;
      }
      const it = inv.equip[slot];
      this.zones.push({ kind: 'equip', slot, x: ex, y: zy, w: sw, h: zh, item: it });
      if (it) {
        fit(itemIcon(it.def), ex + 2, zy + 1, sw - 4, zh - 4);
        if (it.def.durability) {
          const k = it.durability / it.def.durability;
          px(ex + 2, zy + zh - 3, (sw - 4) * k, 2, k > 0.3 ? C.green : C.red);
        }
      }
      if (this.drag && this.drag.item.def.type === slot) px(ex + 1, zy, sw - 2, zh, C.ok);
    });

    // ---- middle: the two guns, each with its attachment slots ----
    const gy0 = ey + eh + GAP, ph = Math.floor((bottom - gy0 - GAP) / 2);
    for (let i = 0; i < 2; i++) {
      const w = p.weapons[i], y = gy0 + i * (ph + GAP);
      const dragGun = this.drag?.item.weapon && this.drag.item.weapon !== w;
      box(mx, y, MW, ph);
      // the panel is the gun slot: drag a gun in or out of it
      this.zones.push({ kind: 'weapon', index: i, x: mx, y, w: MW, h: ph, item: w && this.drag?.item.weapon !== w ? gunItem(w) : null });
      if (dragGun) px(mx, y, MW, ph, C.ok);
      if (!w || this.drag?.item.weapon === w) {
        text(`${i + 2}  EMPTY`, mx + 4, y + 3, C.dim);
        const s = 'DRAG A GUN HERE';
        text(s, mx + MW / 2 - textWidth(s) / 2, y + ph / 2 - 3, '#3c4636');
        continue;
      }
      if (i === this.modSlot) px(mx, y, 2, ph, C.sel);
      const held = !p.meleeOut && i === p.slot;
      text(`${i + 2}  ${w.def.name}`, mx + 4, y + 3, held ? C.text : C.dim);
      const ammo = `${w.ammo}/${p.infinite ? 'INF' : w.reserve}`;
      text(ammo, mx + MW - 4 - textWidth(ammo), y + 3, C.green);
      // the gun as it is now, big
      const slotY = y + ph - 15;
      const img = w.icon, room = slotY - y - 19;
      // the same scale for every gun (sized so the longest fit), so a pistol looks small next to a rifle
      const s = Math.max(1, Math.min(3, Math.floor((MW - 12) / 52), Math.floor(room / 16), Math.floor((MW - 12) / img.width)));
      fit(img, mx + 4, y + 11, MW - 8, room, s);
      // attachment slots, centred under it
      const n = w.def.slots.length, slotW = Math.min(SLOT_W, Math.floor((MW - 8) / n) - 3), step = slotW + 3;
      let sx = Math.round(mx + MW / 2 - (n * step - 3) / 2);
      for (const slot of w.def.slots) {
        const name = textWidth(SLOT_NAMES[slot]) <= slotW ? SLOT_NAMES[slot] : SLOT_NAMES[slot].slice(0, Math.floor((slotW + 1) / 4));
        text(name, sx + Math.round(slotW / 2 - textWidth(name) / 2), slotY - 7, C.dim);
        px(sx, slotY, slotW, CELL, C.cell);
        const key = w.attach[slot];
        const zone = { kind: 'mod', slot, weapon: w, x: sx, y: slotY, w: slotW, h: CELL, item: key ? newItem(key) : null };
        this.zones.push(zone);
        if (key) fit(itemIcon(zone.item.def), sx + 1, slotY + 1, slotW - 2, CELL - 2);
        if (this.drag && this.drag.item.def.type === 'attachment' && ATTACH_ART[this.drag.item.id].slot === slot) {
          px(sx, slotY, slotW, CELL, w.canAttach(this.drag.item.id) ? C.ok : C.bad);
        }
        sx += step;
      }
    }

    // ---- right: storage ----
    let gy = top;
    gy += drawGrid(inv.pockets, rx, gy, 'POCKETS', RW) + 2;
    if (inv.rig) gy += drawGrid(inv.rig, rx, gy, inv.equip.rig.def.name, RW) + 2;
    else {
      box(rx, gy, RW, 12);
      text('NO AMMO RIG', rx + 3, gy + 3, C.dim);
      gy += 16;
    }
    if (inv.backpack) gy += drawGrid(inv.backpack, rx, gy, inv.equip.backpack.def.name, RW) + 2;
    else {
      box(rx, gy, RW, 12);
      text('NO BAG', rx + 3, gy + 3, C.dim);
    }

    // ---- dragged item follows the mouse ----
    if (this.drag) {
      const it = this.drag.item;
      const gxo = it.rot === this.drag.rot0 ? this.drag.grabX : this.drag.grabY, gyo = it.rot === this.drag.rot0 ? this.drag.grabY : this.drag.grabX;
      ctx.globalAlpha = 0.85;
      drawItem(it, this.mouse.x - gxo * cs - cs / 2, this.mouse.y - gyo * cs - cs / 2, itemW(it) * cs, itemH(it) * cs);
      ctx.globalAlpha = 1;
    }

    // ---- tooltip ----
    const h = this.hover;
    if (!this.drag && !this.menu && h?.item) {
      const it = h.item, lines = [it.def.name];
      if (it.def.type === 'ammo') lines.push(`${it.count}/${it.def.stack} ROUNDS`);
      if (it.def.type === 'med') lines.push(`HEALS ${it.def.heal}  RCLICK USE`);
      if (it.def.type === 'food') lines.push(`FOOD +${it.def.food}  RCLICK EAT`);
      if (it.def.type === 'drink') lines.push(`${it.def.info ?? `FOOD +${it.def.food}  STAMINA +${it.def.stamina ?? 0}`}  RCLICK DRINK`);
      if (it.def.type === 'repair') lines.push(`${it.def.repair === 'weapon' ? 'REPAIRS THE GUN IN HAND' : 'REPAIRS YOUR ARMOR + HELMET'}  RCLICK USE`);
      if (it.def.type === 'material') lines.push('CRAFTING MATERIAL - WORKBENCH');
      if (it.def.type === 'fuel') lines.push(`+${it.def.fuel} GENERATOR FUEL`);
      if (it.weapon && Weapon.wear) lines.push(`CONDITION ${Math.round(it.weapon.cond ?? 100)}%`);
      if (it.def.durability) lines.push(`${Math.round(it.def.armor * 100)}% ARMOR  ${Math.ceil(it.durability)}/${it.def.durability}`);
      if (it.def.type === 'attachment') lines.push(`${SLOT_NAMES[ATTACH_ART[it.id].slot]}  RCLICK ATTACH`);
      if (it.def.type === 'backpack') lines.push(`${it.def.grid[0]}X${it.def.grid[1]} SPACE`);
      if (it.def.type === 'rig') lines.push(`${it.def.grid[0]}X${it.def.grid[1]} AMMO + THROWABLES`);
      if (it.melee) lines.push(`DMG ${it.melee.def.damage}  REACH ${it.melee.def.reach}`);
      if (it.weapon) {
        lines.push(`${it.weapon.def.caliber.toUpperCase()}  ${it.weapon.ammo}/${it.weapon.magSize}`);
      }
      lines.push('RCLICK OPTIONS');
      const tw = Math.max(...lines.map((l) => textWidth(l))) + 6, th = lines.length * 7 + 4;
      const tx = Math.min(W - tw - 2, this.mouse.x + 8), ty = Math.min(H - th - 2, this.mouse.y + 8);
      box(tx, ty, tw, th);
      lines.forEach((l, i) => text(l, tx + 3, ty + 3 + i * 7, i ? C.dim : C.text));
    }

    // ---- right-click menu ----
    if (this.menu) {
      const mm = this.menu, rowH = 9;
      const mw = Math.max(textWidth(mm.title), ...mm.options.map((o) => textWidth(o.label))) + 12;
      const mh2 = 11 + mm.options.length * rowH + 2;
      const x = Math.min(W - mw - 2, mm.x), y = Math.min(H - mh2 - 2, mm.y);
      box(x, y, mw, mh2);
      text(mm.title, x + 4, y + 3, C.dim);
      px(x + 2, y + 10, mw - 4, 1, C.cellLine);
      mm.rects = [];
      mm.options.forEach((o, i) => {
        const ry = y + 12 + i * rowH;
        const hov = this.mouse.x >= x && this.mouse.x < x + mw && this.mouse.y >= ry && this.mouse.y < ry + rowH;
        if (hov) px(x + 1, ry, mw - 2, rowH, C.panelHi);
        text(o.label, x + 6, ry + 2, o.label === 'DROP' ? '#e08a7a' : hov ? C.green : C.text);
        mm.rects.push({ x, y: ry, w: mw, h: rowH, run: o.run });
      });
    }
    ctx.restore();
  }
}
