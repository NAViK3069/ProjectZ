// Items lying in the world: zombie drops, supply crate contents, things the
// player throws out of the backpack. They pop out with a little arc, glint
// so you can spot them in the dark, and are picked up by walking over them
// (ammo, meds, grenades) or with E / the inventory screen (gear, attachments).

import { makeShadow } from '../engine/pixel.js';
import { ITEMS, AMMO_FOR, itemImage } from './items.js';
import { artW, artH } from '../combat/gunart.js';
import { newItem } from './inventory.js';

const AUTO = new Set(['ammo', 'med', 'throwable']);
const PICK_RANGE = 12;    // px to auto-pickup
// nobody picked it up: it stays a long while, then fades away (seconds)
const LOOT_LIFE = 240, LOOT_FADE = 30;
const SHADOW = makeShadow(10, 3, 'rgba(8, 10, 6, 0.4)');
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[(Math.random() * list.length) | 0];

const MODS = Object.values(ITEMS).filter((d) => d.type === 'attachment').map((d) => d.id);
const GEAR = ['vestLight', 'vestHeavy', 'helmet', 'packLarge', 'chestRig', 'pouch'];
// throwables, the plain grenade most often
const THROWS = ['grenade', 'grenade', 'grenade', 'frag', 'smoke', 'flashbang', 'stun', 'molotov', 'molotov', 'c4', 'landmine', 'claymore', 'tripmine', 'flare', 'taser'];
const throwDrop = () => newItem(pick(THROWS), 1);

// Ammo for a gun the player has (mostly), sized to a partial box.
function ammoDrop(player, share) {
  const cals = player.weapons.filter(Boolean).map((w) => w.def.caliber);
  if (player.melee?.def.battery) cals.push('battery');   // packs for a battery melee weapon too
  const cal = Math.random() < 0.8 && cals.length ? pick(cals) : pick(Object.keys(AMMO_FOR));
  const id = AMMO_FOR[cal];
  return newItem(id, Math.ceil(ITEMS[id].stack * share));
}

export class Loot {
  constructor(world) {
    this.world = world;
    this.items = [];
    this.time = 0;
  }

  drop(item, x, y, power = 1) {
    const a = rand(0, Math.PI * 2);
    this.items.push({
      item, x, y, z: 6,
      vx: Math.cos(a) * rand(15, 40) * power, vy: Math.sin(a) * rand(10, 25) * power, vz: rand(40, 70) * power,
      bob: rand(0, Math.PI * 2),
      age: 0,
    });
  }

  remove(entry) {
    this.items = this.items.filter((e) => e !== entry);
  }

  // What a zombie leaves behind (often nothing).
  zombieDrop(x, y, player) {
    const r = Math.random();
    let item = null;
    if (r < 0.3) item = ammoDrop(player, rand(0.3, 0.6));
    else if (r < 0.38) item = newItem('bandage', 1);
    else if (r < 0.42) item = throwDrop();
    else if (r < 0.43) item = newItem('medkit');
    else if (r < 0.46) item = newItem(pick(MODS));
    else if (r < 0.475) item = newItem(pick(GEAR));
    if (item) this.drop(item, x, y);
  }

  // A supply crate pops open and spills 3-5 things.
  openCrate(crate, player) {
    crate.opened = true;
    crate.mask = null;   // its look changed; lighting re-caches it
    const n = 3 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      const item = r < 0.38 ? ammoDrop(player, rand(0.5, 1))
        : r < 0.55 ? newItem('bandage', 2)
        : r < 0.63 ? newItem('medkit')
        : r < 0.74 ? throwDrop()
        : r < 0.9 ? newItem(pick(MODS))
        : newItem(pick(GEAR));
      this.drop(item, crate.x, crate.y + 6, 1.3);
    }
  }

  // Nearest item within range (for E), or null.
  nearest(x, y, range) {
    let best = null, bestD = range;
    for (const e of this.items) {
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bestD && e.z <= 0) {
        best = e;
        bestD = d;
      }
    }
    return best;
  }

  nearby(x, y, range) {
    return this.items.filter((e) => Math.hypot(e.x - x, e.y - y) < range && e.z <= 0);
  }

  // onPickup(item) is told about anything picked up.
  update(dt, player, onPickup) {
    this.time += dt;
    for (const e of this.items) {
      e.age += dt;
      if (e.age >= LOOT_LIFE + LOOT_FADE) e.gone = true;
      if (e.z > 0 || e.vz > 0) {
        e.vz -= 300 * dt;
        e.z = Math.max(0, e.z + e.vz * dt);
        if (e.z === 0) e.vz = Math.abs(e.vz) > 30 ? -e.vz * 0.3 : 0;
      }
      const drag = Math.exp(-(e.z > 0 ? 1 : 6) * dt);
      const solid = (x, y) => this.world.isWall(Math.floor(x / 16), Math.floor(y / 16));
      if (solid(e.x + e.vx * dt, e.y)) e.vx *= -0.4;
      if (solid(e.x, e.y + e.vy * dt)) e.vy *= -0.4;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.vx *= drag;
      e.vy *= drag;
      // walk over consumables to grab them
      if (!player.dead && e.z === 0 && AUTO.has(e.item.def.type) && Math.hypot(e.x - player.x, e.y - player.y) < PICK_RANGE) {
        const before = e.item.count ?? 1;
        if (player.inventory.add(e.item)) e.picked = true;
        if (e.picked || (e.item.count ?? 1) < before) onPickup(e.item, before - (e.picked ? 0 : e.item.count));
      }
    }
    this.items = this.items.filter((e) => !e.picked && !e.gone);
  }

  // 1 for most of its life, easing to 0 as it fades away.
  alpha(e) {
    const k = 1 - (e.age - LOOT_LIFE) / LOOT_FADE;
    return k >= 1 ? 1 : k <= 0 ? 0 : k * k * (3 - 2 * k);
  }

  draw(ctx) {
    for (const e of this.items) {
      const icon = itemImage(e.item);
      const iw = artW(icon), ih = artH(icon), x = Math.round(e.x - iw / 2), y = Math.round(e.y - e.z - ih);
      ctx.globalAlpha = this.alpha(e);
      ctx.drawImage(SHADOW, Math.round(e.x) - 5, Math.round(e.y) - 2);
      ctx.drawImage(icon, x, y + Math.round(Math.sin(this.time * 3 + e.bob) * (e.z > 0 ? 0 : 1)), iw, ih);
    }
    ctx.globalAlpha = 1;
  }

  // A small glint so loot can be found in the dark (drawn after lighting).
  drawEmissive(ctx) {
    for (const e of this.items) {
      const t = (this.time * 1.5 + e.bob) % 3;
      if (t > 0.4) continue;
      const icon = itemImage(e.item), k = t / 0.4;
      const x = Math.round(e.x - artW(icon) / 2 + artW(icon) * k), y = Math.round(e.y - e.z - artH(icon) * 0.7);
      ctx.fillStyle = '#fffbe6';
      ctx.globalAlpha = (1 - Math.abs(k - 0.5) * 2) * this.alpha(e);
      ctx.fillRect(x, y, 1, 1);
      ctx.fillRect(x - 1, y + 1, 3, 1);
      ctx.fillRect(x, y + 2, 1, 1);
      ctx.globalAlpha = 1;
    }
  }
}
