// The survival mode: one long run on a generated map, day after day.
//
// DAY   - the light's up and the dead are slow and dull: they wander, and only
//         come for you if you get close or shoot them. Go out and scavenge -
//         search the ruins, cars and crates for food, ammo, fuel and parts.
// DUSK  - the light goes. Get back to camp.
// NIGHT - the horde comes out of the forest, faster and hungrier, all of them
//         after you. Kill every last one and the sun comes up on the next day.
//
// The camp is built round a GENERATOR: it runs the floodlights, and the dead
// are slow in its light. Keep it fuelled (fuel cans, wood). Feed it scrap to
// level it up: the light reaches further, the tank holds more and the
// WORKBENCH can make better things. SARGE hands out jobs; the TRADER sells for
// the cash you earn. Now and then a plane drops a supply crate somewhere -
// the noise brings a crowd to it.
//
// Hunger: eat. Guns wear out as you shoot them; armour as it's hit. Repair them.

import { TILE } from '../world/world.js';
import { createProp } from '../world/props.js';
import { Zombie, TYPES } from '../entities/zombie.js';
import { WEAPONS, Weapon } from '../combat/weapons.js';
import { ITEMS, AMMO_FOR, gunItem } from './items.js';
import { newItem } from './inventory.js';
import { ammoDrop, throwDrop, MODS, GEAR } from './loot.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[(Math.random() * list.length) | 0];
const lerp = (a, b, t) => a + (b - a) * t;

export const DAY_LEN = 270, DUSK_LEN = 22, DAWN_LEN = 14;
const LEVELS = [
  { light: 190, fuel: 100, scrap: 0 },
  { light: 220, fuel: 120, scrap: 6 },
  { light: 250, fuel: 140, scrap: 12 },
  { light: 285, fuel: 160, scrap: 20 },
  { light: 320, fuel: 190, scrap: 30 },
];
export const TREE_KINDS = new Set(['oak', 'oak2', 'oak3', 'pine', 'deadtree']);

// ---------- loot ----------

const GUNS = {
  pistol: Object.values(WEAPONS).filter((d) => d.cls === 'pistol' && !d.custom),
  smg: Object.values(WEAPONS).filter((d) => d.cls === 'smg' && !d.custom),
  rifle: Object.values(WEAPONS).filter((d) => d.cls === 'rifle' && !d.custom),
  shotgun: Object.values(WEAPONS).filter((d) => d.cls === 'shotgun' && !d.custom),
  sniper: Object.values(WEAPONS).filter((d) => d.cls === 'sniper' && !d.custom),
  lmg: Object.values(WEAPONS).filter((d) => d.cls === 'lmg' && !d.custom),
};
function gun(cls) {
  const w = new Weapon(pick(GUNS[cls]));
  w.ammo = Math.floor(w.magSize * rand(0, 0.7));
  w.cond = Math.round(rand(35, 90));   // found guns are used
  return gunItem(w);
}

// [weight, () => item] tables, and how many rolls a container gets.
const T = {
  store: [3, [[4, () => newItem(pick(['beans', 'chips', 'chips', 'water']), 1)], [2, () => newItem(pick(['energy', 'coffee']), 1)], [2, () => newItem('cloth', 2)], [1, () => newItem('bandage', 1)], [1, () => newItem('pills', 1)], [1, () => newItem('water', 2)]]],
  food: [2, [[4, () => newItem(pick(['beans', 'water', 'chips']), 1)], [1, () => newItem('energy', 1)], [1, () => newItem('mre', 1)], [2, () => null]]],
  house: [2, [[3, () => newItem('cloth', 2)], [2, () => newItem(pick(['beans', 'chips', 'water']), 1)], [2, () => newItem('bandage', 1)], [1, () => newItem('pills', 1)], [2, (p) => ammoDrop(p, rand(0.2, 0.4))], [1, () => newItem('scrap', 2)], [0.6, () => newItem('elec', 1)], [0.4, () => gun('pistol')], [0.4, () => newItem('bikeHelmet')], [2, () => null]]],
  bed: [1, [[2, () => newItem('cloth', 2)], [1, (p) => ammoDrop(p, 0.3)], [1, () => newItem('pills', 1)], [0.3, () => gun('pistol')], [2, () => null]]],
  tools: [2, [[3, () => newItem('scrap', 3)], [2, () => newItem('elec', 1)], [1, () => newItem('powder', 2)], [0.6, () => newItem('gunKit')], [0.6, () => newItem('fuelCan')], [0.5, () => newItem('armorKit')], [1, () => null]]],
  medical: [2, [[3, () => newItem('bandage', 2)], [1.2, () => newItem('medkit')], [2, () => newItem('pills', 1)], [1, () => newItem('adrenaline', 1)], [2, () => newItem('chem', 1)], [1, () => newItem('cloth', 2)]]],
  supplies: [3, [[3, (p) => ammoDrop(p, rand(0.3, 0.6))], [2, () => newItem('cloth', 2)], [2, () => newItem('scrap', 2)], [2, () => newItem('beans', 1)], [1, () => newItem('bandage', 1)], [1, () => newItem('powder', 2)], [0.8, () => throwDrop()], [0.5, () => newItem('chem', 1)]]],
  car: [2, [[3, () => newItem('scrap', 2)], [1.2, () => newItem('fuelCan')], [1, () => newItem('elec', 1)], [1, () => newItem('cloth', 1)], [0.6, (p) => ammoDrop(p, 0.3)], [0.4, () => newItem('water', 1)], [1.5, () => null]]],
  fuel: [1, [[3, () => newItem('fuelCan')], [2, () => null]]],
  scrap: [2, [[4, () => newItem('scrap', 2)], [1, () => newItem('elec', 1)], [1, () => newItem('powder', 1)], [1, () => null]]],
  wood: [2, [[1, () => newItem('wood', 3)]]],
  camp: [2, [[2, () => newItem('cloth', 2)], [2, () => newItem(pick(['beans', 'water', 'chips']), 1)], [1, (p) => ammoDrop(p, 0.4)], [1, () => newItem('flare', 1)], [1, () => newItem('bandage', 1)], [0.3, () => gun(pick(['pistol', 'shotgun']))]]],
  ammo: [2, [[4, (p) => ammoDrop(p, rand(0.5, 1))], [1, () => newItem('powder', 3)], [1, () => throwDrop()]]],
  military: [3, [[4, (p) => ammoDrop(p, rand(0.6, 1))], [1.5, () => newItem(pick(MODS))], [1, () => newItem(pick(['vestLight', 'vestHeavy', 'helmet', 'riotHelmet', 'policeVest']))], [1.5, () => throwDrop()], [1, () => newItem('medkit')], [1, () => newItem('mre')], [1.2, () => gun(pick(['rifle', 'smg', 'shotgun']))], [0.8, () => newItem('gunKit')], [0.6, () => newItem('armorKit')]]],
  weapons: [2, [[3, () => gun(pick(['rifle', 'smg', 'shotgun', 'sniper']))], [2, (p) => ammoDrop(p, 1)], [1, () => newItem(pick(MODS))]]],
  airdrop: [5, [[2, () => gun(pick(['rifle', 'sniper', 'lmg', 'smg']))], [2, () => newItem(pick(MODS))], [1.5, () => newItem(pick(['vestHeavy', 'riotHelmet', 'packLarge', 'chestRig']))], [2, () => newItem('medkit')], [1.5, () => newItem('adrenaline', 1)], [2, (p) => ammoDrop(p, 1)], [1, () => newItem('gunKit')], [1, () => newItem('armorKit')], [1, () => newItem('mre', 2)]]],
};

export function rollLoot(kind, player) {
  const [n, table] = T[kind] ?? T.supplies;
  const out = [];
  const total = table.reduce((s, [w]) => s + w, 0);
  for (let i = 0; i < n; i++) {
    let r = Math.random() * total;
    for (const [w, make] of table) if ((r -= w) <= 0) { const it = make(player); if (it) out.push(it); break; }
  }
  return out;
}

// ---------- crafting ----------
// [id, name, tier (generator level), needs {item: n}, makes: item id + count | place: prop]
export const RECIPES = [
  ['bandage', 'BANDAGE', 1, { cloth: 2 }, { item: 'bandage', n: 1 }],
  ['ammo9', '9MM X30', 1, { scrap: 2, powder: 1 }, { item: 'ammo9', n: 30 }],
  ['ammo12', '12G X12', 1, { scrap: 2, powder: 2 }, { item: 'ammo12', n: 12 }],
  ['powder', 'GUNPOWDER X3', 1, { chem: 1, wood: 1 }, { item: 'powder', n: 3 }],
  ['barricade', 'BARRICADE', 1, { wood: 4 }, { place: 'barricade' }],
  ['flare', 'FLARE', 1, { chem: 1, cloth: 1 }, { item: 'flare', n: 1 }],
  ['ammo45', '.45 X25', 2, { scrap: 2, powder: 2 }, { item: 'ammo45', n: 25 }],
  ['ammo556', '5.56 X30', 2, { scrap: 3, powder: 2 }, { item: 'ammo556', n: 30 }],
  ['ammo762', '7.62 X30', 2, { scrap: 3, powder: 2 }, { item: 'ammo762', n: 30 }],
  ['medkit', 'MEDKIT', 2, { cloth: 3, chem: 2 }, { item: 'medkit', n: 1 }],
  ['gunKit', 'GUN REPAIR KIT', 2, { scrap: 4, elec: 1 }, { item: 'gunKit', n: 1 }],
  ['armorKit', 'ARMOR REPAIR KIT', 2, { cloth: 4, scrap: 2 }, { item: 'armorKit', n: 1 }],
  ['spikes', 'SPIKE TRAP', 2, { wood: 3, scrap: 2 }, { place: 'spikes' }],
  ['molotov', 'MOLOTOV', 2, { fuelCan: 1, cloth: 1 }, { item: 'molotov', n: 2 }],
  ['ammo308', '.308 X10', 3, { scrap: 3, powder: 3 }, { item: 'ammo308', n: 10 }],
  ['grenade', 'GRENADE', 3, { scrap: 2, powder: 2, chem: 1 }, { item: 'grenade', n: 1 }],
  ['vestLight', 'LIGHT VEST', 3, { cloth: 6, scrap: 4 }, { item: 'vestLight', n: 1 }],
  ['helmet', 'HELMET', 3, { scrap: 6, cloth: 2 }, { item: 'helmet', n: 1 }],
  ['energy', 'ENERGY DRINK', 3, { chem: 1, water: 1 }, { item: 'energy', n: 1 }],
  ['ammo50', '.50 X8', 4, { scrap: 4, powder: 4 }, { item: 'ammo50', n: 8 }],
  ['vestHeavy', 'HEAVY VEST', 4, { cloth: 8, scrap: 8, elec: 2 }, { item: 'vestHeavy', n: 1 }],
  ['suppressor', 'SUPPRESSOR', 4, { scrap: 5, elec: 1 }, { item: 'suppressor', n: 1 }],
  ['scope', 'SCOPE 4X', 4, { scrap: 4, elec: 2 }, { item: 'scope', n: 1 }],
  ['adrenaline', 'ADRENALINE', 4, { chem: 2, elec: 1 }, { item: 'adrenaline', n: 1 }],
  ['riotHelmet', 'RIOT HELMET', 5, { scrap: 8, cloth: 4, elec: 1 }, { item: 'riotHelmet', n: 1 }],
  ['drumMag', 'DRUM MAG', 5, { scrap: 8, elec: 2 }, { item: 'drumMag', n: 1 }],
];

// ---------- the trader ----------
const STOCK = [
  ['bandage', 60], ['medkit', 260], ['beans', 45], ['water', 30], ['mre', 120], ['energy', 110], ['coffee', 90], ['pills', 140],
  ['fuelCan', 180], ['gunKit', 320], ['armorKit', 320], ['cloth', 40], ['scrap', 50], ['powder', 60],
  ['vestLight', 650], ['helmet', 520], ['packLarge', 700], ['grenade', 220], ['molotov', 160],
];

// ---------- quests ----------
function makeQuest(day, pois) {
  const kinds = ['kill', 'kill', 'bring', 'bring', 'visit', 'airdrop', 'survive'];
  const k = pick(kinds);
  const reward = Math.round((250 + day * 60) * rand(0.9, 1.3) / 10) * 10;
  if (k === 'kill') {
    const n = 10 + day * 4 + ((Math.random() * 6) | 0);
    return { kind: 'kill', text: `KILL ${n} ZOMBIES`, need: n, have: 0, reward };
  }
  if (k === 'bring') {
    const [id, n] = pick([['wood', 8], ['scrap', 6], ['fuelCan', 2], ['cloth', 6], ['beans', 3], ['elec', 2], ['chem', 2]]);
    return { kind: 'bring', id, text: `BRING ${n} ${ITEMS[id].name}`, need: n, have: 0, reward: Math.round(reward * 0.9) };
  }
  if (k === 'visit') {
    const p = pick(pois.filter((q) => !q.visited));
    if (p) return { kind: 'visit', poi: p, text: `SCOUT THE ${p.name}`, need: 1, have: 0, reward: Math.round(reward * 0.8) };
  }
  if (k === 'airdrop') return { kind: 'airdrop', text: 'LOOT AN AIRDROP', need: 1, have: 0, reward: Math.round(reward * 1.3) };
  return { kind: 'survive', text: `SURVIVE NIGHT ${day}`, need: 1, have: 0, reward: Math.round(reward * 1.2), night: day };
}

// ---------- the mode ----------

export class Apocalypse {
  // g: { world, rounds, player, loot, particles, explosives, notice(text), banner(text), money get/set, hurt(z, dmg) }
  constructor(g) {
    this.g = g;
    this.day = 1;
    this.phase = 'day';
    this.t = 40;               // start mid-morning
    this.gen = { fuel: 80, level: 0 };
    this.nightLeft = 0;        // zombies still to come out tonight
    this.nightTotal = 0;
    this.quests = [];
    this.questsDone = 0;
    this.offers = [];
    this.kills = 0;
    this.drops = [];           // airdrops: falling, then on the ground
    this.plane = null;
    this.dropAt = rand(0.35, 0.75) * DAY_LEN;
    this.stock = [];
    this.spawnTimer = 0;
    this.spikesT = 0;
    this.searching = null;     // { prop, t }
    this.restock();
    this.refreshOffers();
    g.world.pois.forEach((p) => (p.visited = false));
  }

  get level() {
    return LEVELS[this.gen.level];
  }
  get maxFuel() {
    return this.level.fuel;
  }
  get night() {
    return this.phase === 'night' || this.phase === 'dusk';
  }

  // How dark it is: 0 bright day .. 1 night.
  get dark() {
    if (this.phase === 'day') return 0;
    if (this.phase === 'dusk') return Math.min(1, this.t / DUSK_LEN);
    if (this.phase === 'dawn') return 1 - Math.min(1, this.t / DAWN_LEN);
    return 1;
  }

  // The lighting's base colour: warm daylight, a red dusk, near black at night.
  get ambient() {
    const k = this.dark;
    const day = [178, 182, 160], dusk = [120, 70, 60], night = [12, 15, 11];
    const c = k < 0.5 ? day.map((v, i) => lerp(v, dusk[i], k * 2)) : dusk.map((v, i) => lerp(v, night[i], (k - 0.5) * 2));
    return `rgb(${c.map(Math.round).join(', ')})`;
  }

  // 06:00 .. 18:00 through the day, 18:00 .. 06:00 through the night.
  get clock() {
    let h;
    if (this.phase === 'day') h = 6 + (this.t / DAY_LEN) * 12;
    else if (this.phase === 'dusk') h = 18 + (this.t / DUSK_LEN) * 1;
    else if (this.phase === 'night') h = 19 + 10 * (this.nightTotal ? 1 - (this.nightLeft + this.alive()) / this.nightTotal : 0);
    else h = 5 + this.t / DAWN_LEN;
    h %= 24;
    return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
  }

  alive() {
    return this.g.rounds.zombies.filter((z) => z.night && z.dying < 0).length;
  }

  // ---------- the clock ----------

  update(dt) {
    const g = this.g;
    this.t += dt;
    if (this.phase === 'day') {
      this.updateDay(dt);
      if (this.t >= DAY_LEN) this.go('dusk');
    } else if (this.phase === 'dusk') {
      if (this.t >= DUSK_LEN) this.startNight();
    } else if (this.phase === 'night') {
      this.updateNight(dt);
      if (this.nightLeft <= 0 && this.alive() === 0 && this.t > 20) this.go('dawn');
    } else if (this.phase === 'dawn' && this.t >= DAWN_LEN) {
      this.day++;
      this.go('day');
      g.banner(`DAY ${this.day}`);
      for (const q of this.quests) if (q.kind === 'survive' && q.night < this.day) q.have = 1;
      this.restock();
      this.refreshOffers();
      this.dropAt = rand(0.3, 0.8) * DAY_LEN;
    }
    // the generator burns fuel, faster at night; lights die with it
    this.gen.fuel = Math.max(0, this.gen.fuel - dt * (this.night ? 0.32 : 0.1));
    const on = this.gen.fuel > 0;
    for (const p of g.world.campLights) {
      const L = p.lights[0];
      // they come on as it gets dark
      L.intensity = on ? L.base * Math.min(1, this.dark * 1.5) * (0.92 + 0.08 * Math.sin(this.t * 40) ** 8) : 0;
      L.radius = this.level.light;
    }
    this.updateAirdrops(dt);
    this.updateSpikes(dt);
    this.updateQuests();
    // forget day zombies that have wandered far off (more spawn closer)
    for (const z of g.rounds.zombies) if (!z.night && !z.guard && z.dying < 0 && Math.hypot(z.x - g.player.x, z.y - g.player.y) > 1300) z.dead = true;
  }

  go(phase) {
    this.phase = phase;
    this.t = 0;
    if (phase === 'dusk') this.g.banner('NIGHT IS COMING - GET TO CAMP');
    if (phase === 'dawn') this.g.banner('THE SUN IS UP');
  }

  // ---------- spawning ----------

  // A zombie of a type for the day: tougher as the days go on.
  stats(type, night) {
    const T = TYPES[type], d = this.day;
    return {
      type,
      hp: (55 + d * 14) * T.hp,
      speed: (24 + Math.min(20, d * 2) + rand(0, 8)) * T.speed * (night ? 1.15 : 0.75),
      damage: T.damage * (night ? 1 : 0.8),
      aggro: night ? Infinity : rand(90, 140),
    };
  }

  pickType(night) {
    const d = this.day + (night ? 1 : 0);
    const table = [['common', 10], ['runner', d >= 2 ? 2 + d * 0.4 : 0], ['spitter', d >= 3 ? 1.4 : 0], ['leaper', d >= 3 ? 1.4 : 0], ['armored', d >= 4 ? 1.3 : 0], ['suicide', d >= 4 ? 1 : 0], ['toxic', d >= 5 ? 1 : 0], ['burned', d >= 5 ? 1 : 0], ['frozen', d >= 6 ? 1 : 0], ['tank', d >= 6 ? 0.7 : 0]];
    let r = Math.random() * table.reduce((s, [, w]) => s + w, 0);
    for (const [t, w] of table) if ((r -= w) <= 0) return t;
    return 'common';
  }

  spawnAt(x, y, type, opts = {}) {
    const z = new Zombie(x, y, { ...this.stats(type, opts.night), ...opts }, this.g.rounds.env);
    z.night = !!opts.night;
    z.guard = !!opts.guard;
    this.g.rounds.zombies.push(z);
    return z;
  }

  // A spot on open ground between rMin and rMax from (x, y), out of the camp.
  spot(x, y, rMin, rMax) {
    const w = this.g.world;
    for (let i = 0; i < 80; i++) {
      // a random spot in the ring round (x, y), on open ground
      const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin);
      const cx = Math.floor((x + Math.cos(a) * r) / TILE), cy = Math.floor((y + Math.sin(a) * r) / TILE);
      if (!w.isOpen(cx, cy)) continue;
      const px = (cx + 0.5) * TILE, py = (cy + 0.8) * TILE;
      if (Math.hypot(px - w.camp.x, py - w.camp.y) < w.camp.r + 60) continue;
      if (w.solidsIn({ l: px - 5, t: py - 6, r: px + 5, b: py }).length) continue;
      return { x: px, y: py };
    }
    return null;
  }

  updateDay(dt) {
    const g = this.g, p = g.player;
    // keep a population of wanderers about, out of sight
    const want = Math.min(42, 16 + this.day * 3);
    const roaming = g.rounds.zombies.filter((z) => !z.night && !z.guard && z.dying < 0).length;
    if (roaming < want && (this.spawnTimer -= dt) <= 0) {
      this.spawnTimer = 0.4;
      const at = this.spot(p.x, p.y, 340, 900);
      if (at) this.spawnAt(at.x, at.y, this.pickType(false));
    }
    if (!this.plane && this.t >= this.dropAt && this.drops.length < 3) this.sendPlane();
  }

  startNight() {
    this.phase = 'night';
    this.t = 0;
    this.nightTotal = 14 + this.day * 7;
    this.nightLeft = this.nightTotal;
    this.g.banner(`NIGHT ${this.day}`);
    // whatever's out there already joins in
    for (const z of this.g.rounds.zombies) if (z.dying < 0 && !z.guard) {
      z.aggro = Infinity;
      z.alert = true;
    }
  }

  updateNight(dt) {
    const g = this.g, p = g.player;
    if (this.nightLeft > 0 && (this.spawnTimer -= dt) <= 0) {
      this.spawnTimer = Math.max(0.25, 1.1 - this.day * 0.06);
      if (this.alive() < 18 + this.day * 3) {
        // out of the trees, a good way off
        const at = this.spot(p.x, p.y, 420, 1000) ?? this.spot(p.x, p.y, 260, 1400);
        if (at) {
          this.spawnAt(at.x, at.y, this.pickType(true), { night: true });
          this.nightLeft--;
        }
      }
    }
    // a boss every few nights, halfway through
    if (this.day % 4 === 0 && !this.bossOut && this.nightLeft < this.nightTotal / 2) {
      const at = this.spot(p.x, p.y, 400, 900);
      if (at) {
        this.bossOut = true;
        this.spawnAt(at.x, at.y, 'brute', { night: true });
        g.banner('SOMETHING BIG IS COMING');
      }
    }
    if (this.phase !== 'night') this.bossOut = false;
  }

  // The camp's light slows the dead (and in the dark, with the generator dead, they're quicker).
  speedAt(z) {
    const w = this.g.world, gen = w.generator;
    if (!z.alert) return 1;
    if (this.gen.fuel <= 0) return this.night ? 1.12 : 1;
    return Math.hypot(z.x - gen.x, z.y - gen.y) < this.level.light * 0.75 ? 0.7 : 1;
  }

  // ---------- the generator ----------

  refuel(item) {
    const add = item === 'wood' ? 6 : ITEMS[item].fuel;
    if (this.gen.fuel >= this.maxFuel - 1) return 'TANK IS FULL';
    if (this.g.player.inventory.takeId(item, 1) <= 0) return null;
    this.gen.fuel = Math.min(this.maxFuel, this.gen.fuel + add);
    return `+${add} FUEL`;
  }

  upgrade() {
    const next = LEVELS[this.gen.level + 1];
    if (!next) return 'MAX LEVEL';
    const inv = this.g.player.inventory;
    if (inv.countId('scrap') < next.scrap) return null;
    inv.takeId('scrap', next.scrap);
    this.gen.level++;
    this.g.banner(`GENERATOR LEVEL ${this.gen.level + 1}`);
    return `LEVEL ${this.gen.level + 1}!`;
  }

  // ---------- crafting ----------

  canCraft(r) {
    const inv = this.g.player.inventory;
    return Object.entries(r[3]).every(([id, n]) => inv.countId(id) >= n);
  }

  craft(r) {
    const [, name, tier, needs, makes] = r, g = this.g, inv = g.player.inventory;
    if (tier > this.gen.level + 1 || !this.canCraft(r)) return null;
    if (makes.place) {
      // put it down in front of you
      const p = g.player, a = p.aim, x = p.x + Math.cos(a) * 22, y = p.y + Math.sin(a) * 16 + 4;
      const prop = createProp(makes.place, x, y);
      if (g.world.solidsIn(prop.box).length || Math.hypot(x - p.x, y - p.y) < 8) return 'NO ROOM THERE';
      prop.hp = makes.place === 'spikes' ? 30 : 60;
      g.world.addProp(prop);
    } else {
      const item = newItem(makes.item, makes.n);
      if (!inv.add(item)) return 'NO ROOM IN BAG';
    }
    for (const [id, n] of Object.entries(needs)) inv.takeId(id, n);
    return `MADE ${name}`;
  }

  // ---------- containers ----------

  // Hold E by a container to go through it.
  search(prop, dt) {
    if (this.searching?.prop !== prop) this.searching = { prop, t: 0 };
    this.searching.t += dt;
    const need = prop.loot === 'airdrop' ? 1.6 : prop.loot === 'car' ? 1.2 : 0.8;
    if (this.searching.t < need) return this.searching.t / need;
    prop.searched = true;
    if (prop.kind === 'fridge' || prop.kind === 'mcrate' || prop.kind === 'airdrop') {
      prop.opened = true;
      prop.mask = null;
    }
    const items = rollLoot(prop.loot, this.g.player);
    for (const it of items) this.g.loot.drop(it, prop.x, prop.y + 6, 0.9);
    this.g.notice(items.length ? `FOUND ${items.length} THING${items.length > 1 ? 'S' : ''}` : 'NOTHING HERE');
    if (prop.loot === 'airdrop') for (const q of this.quests) if (q.kind === 'airdrop') q.have = 1;
    this.searching = null;
    return 1;
  }

  // ---------- airdrops ----------

  sendPlane() {
    const w = this.g.world, c = w.center;
    // somewhere out in the open, not too close to camp
    const at = this.spot(c.x, c.y, 260, w.radius - 120);
    if (!at) return;
    const a = rand(0, Math.PI * 2), far = w.radius + 300;
    this.plane = { x: at.x - Math.cos(a) * far, y: at.y - Math.sin(a) * far, dx: Math.cos(a), dy: Math.sin(a), to: at, dropped: false, t: 0 };
    this.g.banner('AIRDROP INCOMING');
  }

  updateAirdrops(dt) {
    const pl = this.plane;
    if (pl) {
      pl.t += dt;
      pl.x += pl.dx * 260 * dt;
      pl.y += pl.dy * 260 * dt;
      if (!pl.dropped && (pl.x - pl.to.x) * pl.dx + (pl.y - pl.to.y) * pl.dy >= 0) {
        pl.dropped = true;
        this.drops.push({ x: pl.to.x, y: pl.to.y, z: 160, landed: false, prop: null });
      }
      if (pl.t > 12) this.plane = null;
    }
    for (const d of this.drops) {
      if (d.landed) continue;
      d.z = Math.max(0, d.z - 26 * dt);
      if (d.z <= 0) {
        d.landed = true;
        d.prop = createProp('airdrop', d.x, d.y);
        this.g.world.addProp(d.prop);
        // the noise brings a crowd
        const n = 5 + this.day;
        for (let i = 0; i < n; i++) {
          const at = this.spot(d.x, d.y, 50, 150);
          if (at) this.spawnAt(at.x, at.y, this.pickType(true), { guard: true, aggro: 170 });
        }
        if (this.day >= 3) {
          const at = this.spot(d.x, d.y, 60, 140);
          if (at) this.spawnAt(at.x, at.y, this.day >= 6 ? 'brute' : 'tank', { guard: true, aggro: 170 });
        }
        this.g.notice('THE CRATE HAS LANDED');
      }
    }
    this.drops = this.drops.filter((d) => !(d.landed && d.prop.searched));
  }

  // ---------- spike traps ----------

  updateSpikes(dt) {
    if ((this.spikesT -= dt) > 0) return;
    this.spikesT = 0.4;
    const w = this.g.world;
    for (const s of w.props.filter((p) => p.kind === 'spikes')) {
      for (const z of this.g.rounds.zombies) {
        if (z.dying >= 0 || z.dummy) continue;
        const b = s.box;
        if (z.x > b.l - 4 && z.x < b.r + 4 && z.y > b.t - 4 && z.y < b.b + 6) {
          this.g.hurt(z, 12 + this.day);
          if ((s.hp -= 1) <= 0) w.removeProp(s);
        }
      }
    }
  }

  // ---------- quests / trader ----------

  refreshOffers() {
    this.offers = [];
    for (let i = 0; i < 4; i++) this.offers.push(makeQuest(this.day, this.g.world.pois));
  }

  accept(i) {
    if (this.quests.length >= 3) return 'YOU HAVE 3 JOBS ALREADY';
    const q = this.offers.splice(i, 1)[0];
    if (q.kind === 'kill') q.from = this.kills;
    this.quests.push(q);
    return `JOB: ${q.text}`;
  }

  // Bring-quests are handed in at Sarge.
  handIn(q) {
    const inv = this.g.player.inventory;
    if (inv.countId(q.id) < q.need) return null;
    inv.takeId(q.id, q.need);
    q.have = q.need;
    this.updateQuests();
    return 'HANDED IN';
  }

  updateQuests() {
    const g = this.g, p = g.player;
    for (const q of this.quests) {
      if (q.kind === 'kill') q.have = Math.min(q.need, this.kills - q.from);
      if (q.kind === 'visit' && Math.abs(p.x - q.poi.x) < (q.poi.w * TILE) / 2 && Math.abs(p.y - q.poi.y) < (q.poi.h * TILE) / 2) q.have = 1;
    }
    for (const poi of g.world.pois) if (!poi.visited && Math.abs(p.x - poi.x) < (poi.w * TILE) / 2 && Math.abs(p.y - poi.y) < (poi.h * TILE) / 2) poi.visited = true;
    for (const q of this.quests.filter((q) => q.have >= q.need)) {
      g.money += q.reward;
      this.questsDone++;
      g.banner(`JOB DONE  +$${q.reward}`);
    }
    this.quests = this.quests.filter((q) => q.have < q.need);
  }

  restock() {
    this.stock = STOCK.filter(() => Math.random() < 0.75).map(([id, price]) => ({ kind: 'item', id, price }));
    for (let i = 0; i < 3; i++) {
      const cls = pick(['pistol', 'smg', 'rifle', 'shotgun', 'sniper']);
      const def = pick(GUNS[cls]);
      this.stock.push({ kind: 'gun', def, price: Math.round(def.price * 0.9 / 10) * 10 + 200 });
    }
    for (let i = 0; i < 2; i++) this.stock.push({ kind: 'item', id: pick(MODS), price: 450 });
    // ammo for whatever you carry
    for (const w of this.g.player.weapons) if (w && !w.def.spec && AMMO_FOR[w.def.caliber]) this.stock.unshift({ kind: 'item', id: AMMO_FOR[w.def.caliber], price: 140 });
  }

  buy(s) {
    const g = this.g;
    if (g.money < s.price) return null;
    let item;
    if (s.kind === 'gun') {
      const w = new Weapon(s.def);
      item = gunItem(w);
    } else item = newItem(s.id);
    if (!g.player.inventory.add(item)) return 'NO ROOM IN BAG';
    g.money -= s.price;
    if (s.kind === 'gun') this.stock = this.stock.filter((x) => x !== s);
    return `BOUGHT ${s.kind === 'gun' ? s.def.name : ITEMS[s.id].name}`;
  }
}

export { GUNS, LEVELS, GEAR };
