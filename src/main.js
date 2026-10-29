import { loadImages, makeCanvas } from './engine/pixel.js';
import { Renderer } from './engine/renderer.js';
import { Input } from './engine/input.js';
import { Particles } from './fx/particles.js';
import { Lighting } from './fx/lighting.js';
import { Bullets } from './combat/bullets.js';
import { Explosives } from './combat/explosives.js';
import { World, TILE, WALL_H, PAL } from './world/world.js';
import { Player } from './entities/player.js';
import { Rounds, SCORE } from './game/rounds.js';
import { Hud } from './ui/hud.js';
import { Menu } from './ui/menu.js';
import { drawText, textWidth } from './ui/font.js';
import { BUY_RANGE } from './world/guncase.js';
import { Loot } from './game/loot.js';
import { Hazards } from './game/hazards.js';
import { ITEMS, AMMO_FOR, gunItem, meleeItem } from './game/items.js';
import { newItem } from './game/inventory.js';
import { InventoryScreen } from './ui/invscreen.js';
import { ArmoryScreen } from './ui/armory.js';
import { Throwables } from './combat/throwables.js';
import { WEAPONS } from './combat/weapons.js';
import { MELEE, MeleeWeapon } from './combat/melee.js';
import { ATTACH_ART } from './combat/gunart.js';
import { Dummy, updateNumbers, drawNumbers } from './entities/dummy.js';
import { SpecWorld } from './combat/spec.js';
import { zombieArt } from './entities/zombieart.js';
import { TYPES } from './entities/zombie.js';

// '#training' opens the shooting range instead of the survival map.
const MODE = location.hash === '#training' ? 'training' : 'survival';
const TRAINING = MODE === 'training';

const CAMERA_FOLLOW = 9;       // higher = tighter
const CAMERA_LOOKAHEAD = 0.18; // seconds of velocity to look ahead
const CAMERA_Y_OFFSET = -12;   // frame the character's body, not their feet
const CAMERA_AIM_LEAN = 0.22;  // how far the camera drifts toward the mouse
const CAMERA_AIM_MAX = 48;     // px

const FLASHLIGHT = { radius: 210, spread: 0.4, color: [255, 238, 196], intensity: 1 };
const FLASHLIGHT_SOFT = { radius: 140, spread: 0.75, color: [255, 238, 196], intensity: 0.28, rays: 60 };
// no flashlight unless the gun has one on its rail, so the player carries a bit of light of their own
const PLAYER_GLOW = { radius: 84, color: [255, 200, 150], intensity: 0.68, rays: 100 };
const LAMP = { radius: 92, intensity: 0.8 };

const canvas = document.getElementById('game');
const debugEl = document.getElementById('debug');
const hintEl = document.getElementById('hud');

const renderer = new Renderer(canvas);
const input = new Input(canvas);
const world = new World(TRAINING ? 'training' : 'lab');
const particles = new Particles(world);
const lighting = new Lighting(world);
const rounds = new Rounds(world, particles);
const loot = new Loot(world);
const hazards = new Hazards(world, particles);
let money = 500;   // start with just the pistol; buy the rest off the walls

// ---------- training: damage numbers and a DPS meter ----------

const DPS_WINDOW = 3;
const stats = {
  log: [],        // { t, dmg } for the DPS window
  total: 0, hits: 0, heads: 0, last: 0, peak: 0, lastT: -99,
  record(dmg, part) {
    this.log.push({ t: time, dmg });
    this.total += dmg;
    this.hits++;
    if (part === 'head') this.heads++;
    this.last = dmg;
    this.lastT = time;
  },
  get dps() {
    this.log = this.log.filter((e) => time - e.t < DPS_WINDOW);
    if (!this.log.length) return 0;
    const span = Math.max(1, Math.min(DPS_WINDOW, time - this.log[0].t + 0.2));
    return this.log.reduce((n, e) => n + e.dmg, 0) / span;
  },
  reset() {
    Object.assign(this, { log: [], total: 0, hits: 0, heads: 0, last: 0, peak: 0, lastT: -99 });
  },
};
let numbers = [];   // floating damage numbers over the dummies
const training = { settings: { infAmmo: true, god: true, freeze: false } };
// endless ammo source for training
const ENDLESS = { count: () => 999, take: (c, n) => n, give() {} };

// ---------- damage ----------

// Bullets and blasts both end up here when they hit a zombie.
function zombieHit(z, res) {
  const { nx, ny } = res;
  if (res.dummy) {
    particles.bits(z.x + (Math.random() - 0.5) * 6, z.y, res.part === 'head' ? 26 : 16, res.part === 'blast' ? 6 : 2, ['#a88a5c', '#c4a676', '#7d6440', '#e8e0cc'], 0.6);
    return;
  }
  if (res.part === 'fire' && !res.killed) return;   // burning: no blood or points per tick
  if (res.armor) {
    particles.sparks(z.x - nx * 5, z.y, res.z, -nx, -ny, 5);
    money += SCORE.armorHit;
    if (res.broke) {
      particles.chunk(z.x, z.y, 24, nx, ny, 6, 4, '#5b6268');   // helmet flies off
      particles.sparks(z.x, z.y, 20, -nx, -ny, 10);
      money += SCORE.armorBreak;
    }
    return;
  }
  if (res.part !== 'fire') particles.blood(z.x, z.y, res.part === 'head' ? 22 : res.z, nx, ny, res.part === 'head' ? 10 : res.part === 'melee' ? 12 : 7);
  if (res.part !== 'fire') money += SCORE.hit;
  if (res.killed) {
    z.gore(particles);
    money += SCORE.kill + (res.part === 'head' ? SCORE.headshot : 0);
    rounds.kills++;
    loot.zombieDrop(z.x, z.y, player);
  }
}

// Blasts reach whatever isn't behind a wall or a tall block (low cover doesn't help).
const explosives = new Explosives(world, particles, (x, y, radius, damage) => {
  for (const z of rounds.zombies) {
    if (!z.hittable) continue;
    const d = Math.hypot(z.x - x, z.y - y);
    if (d > radius || !world.clearLine(x, y - 1, z.x, z.y - 2)) continue;
    const k = 1 - d / radius;
    zombieHit(z, z.hit(damage * (0.35 + 0.65 * k), z.x - x || 1, z.y - y, 10, 'blast'));
  }
  const pd = Math.hypot(player.x - x, player.y - y);
  if (pd < radius && world.clearLine(x, y - 1, player.x, player.y - 2)) player.hurt(15 + 45 * (1 - pd / radius), x, y);
  const a = Math.random() * Math.PI * 2;
  renderer.kick(Math.cos(a) * 7, Math.sin(a) * 7);
});

// what zombies can do to the world (spit acid, blow up, leave fire / gas)
rounds.env = { particles, explosives, hazards, kick: (dx, dy) => renderer.kick(dx, dy) };

const bullets = new Bullets(particles, {
  onHit: zombieHit,
  onProp: (prop, damage) => explosives.damageProp(prop, damage),
});

// fire, shocks: damage without knockback
const hurtZombie = (z, dmg, part = 'fire', dx = 0, dy = 0) => zombieHit(z, z.hit(dmg, dx, dy, 8, part));

// Flashbang, CS:GO style: the screen goes white, then a frozen picture of
// the moment it went off hangs over your view and slowly fades, hiding what
// is really going on. k (0..1) is how hard it got you.
const flashFx = { t: 0, max: 0, k: 0, pending: false, snap: null };
function dazzle(k) {
  const T = 1 + 3.5 * k;
  if (T <= flashFx.t) return;   // a weaker flash on top of a stronger one changes nothing
  Object.assign(flashFx, { t: T, max: T, k, pending: true });
}
const throwables = new Throwables({
  world, particles, explosives, hazards, bullets,
  zombies: () => rounds.zombies,
  get player() { return player; },
  hurt: hurtZombie,
  dazzle,
});

// Spec weapons' world side: cables, bolts, summoning circles, spirits.
// A shock hits like fire does (no knockback, no blood per tick).
const spec = new SpecWorld({
  world, particles, zombieArt, TYPES,
  zombies: () => rounds.zombies,
  hit: (z, dmg, nx, ny, part, zh) => zombieHit(z, z.hit(dmg, nx, ny, zh, part === 'shock' ? 'fire' : part)),
  kick: (dx, dy) => renderer.kick(dx, dy),
});

// A melee swing/stab/saw tick: hit what's in its arc.
function meleeHit(p, m) {
  const d = m.def, nx = Math.cos(p.aim), ny = Math.sin(p.aim);
  let targets = [];
  const o = p.aimOrigin(), t = p.aimTarget;
  for (const z of rounds.zombies) {
    if (!z.hittable || m.hits.has(z)) continue;
    const dx = z.x - p.x, dy = z.y - p.y, dist = Math.hypot(dx, dy);
    if (dist > m.reach + z.halfW) continue;
    // aim at the zombie itself (its body or its head on screen), not at its feet -
    // otherwise a narrow thrust aimed at a head just misses
    const H = z.art.headBox, lift = z.lift ?? 0, headY = z.y - lift + (H.top + H.bottom) / 2;
    let da = Infinity;
    for (const ty of [z.y - lift - 8, headY]) {
      const a = Math.atan2(ty - o.y, z.x - o.x) - p.aim;
      da = Math.min(da, Math.abs(Math.atan2(Math.sin(a), Math.cos(a))));
    }
    if (da > m.arc / 2 && dist > z.halfW + 5) continue;   // right up close always counts
    // with the cursor on its head, it's a head hit
    const head = !!t && Math.abs(t.x - z.x) <= H.half + 2 && t.y >= z.y - lift + H.top - 2 && t.y <= z.y - lift + H.bottom + 1;
    targets.push({ z, dist, head });
  }
  // a thrust or a punch hits the first thing in line; a slash everything in its sweep
  if (m.single) targets = targets.sort((a, b) => a.dist - b.dist).slice(0, 1);
  for (const { z, head } of targets) {
    m.hits.add(z);
    z.meleeKnock = d.knock * (m.step === 2 ? 1.4 : 1);
    zombieHit(z, z.hit(m.damage, nx, ny, head ? 22 : 12, head ? 'head' : 'melee'));
  }
  if (targets.length) renderer.kick(nx * (d.style === 'saw' ? 1 : 2.5), ny * (d.style === 'saw' ? 1 : 2.5));
  // red drums in reach go up too
  for (const prop of [...world.props]) {
    if (!prop.explosive || prop.blown || m.hits.has(prop)) continue;
    if (Math.hypot(prop.x - (p.x + nx * d.reach * 0.6), prop.y - (p.y + ny * d.reach * 0.6)) > d.reach * 0.6 + 6) continue;
    m.hits.add(prop);
    particles.sparks(prop.x, prop.y, 8, -nx, -ny, 4);
    explosives.damageProp(prop, d.damage);
  }
}

// Fire button for throwables (G): C4 already out goes off; otherwise throw / place one.
function useThrowable(id) {
  if (id === 'c4' && throwables.armedC4) {
    throwables.detonate();
    return true;
  }
  if (!player.infinite && player.inventory.countId(id) <= 0) return false;
  const t = input.mouse.active ? mouseWorld() : { x: player.x + Math.cos(player.aim) * 120, y: player.y + Math.sin(player.aim) * 120 };
  if (!throwables.use(id, player, t.x, t.y + 8)) return false;
  if (!player.infinite) player.inventory.takeId(id, 1);
  return true;
}

const images = await loadImages({
  head: 'assets/player/head.png',
  body: 'assets/player/body.png',
  legL: 'assets/player/leg_l.png',
  legR: 'assets/player/leg_r.png',
});
const player = new Player(images, world.spawn.x, world.spawn.y, {
  particles,
  bullets,
  kick: (dx, dy) => renderer.kick(dx, dy),
  meleeHit,
  useThrowable,
  spec,
});
const hud = new Hud(images.head);

// lamps are static lights; one of them flickers
// the training range is lit up properly; the lab is mostly dark
const lamps = world.lamps.map((l, i) => ({ ...LAMP, ...(TRAINING ? { radius: 170, intensity: 0.95 } : {}), x: l.x, y: l.y + 2, color: l.color, static: true, flicker: !TRAINING && i === 3 }));
if (TRAINING) lighting.ambient = '#2e3529';
const propLights = [...world.props.flatMap((p) => p.lights ?? []), ...(world.ceilingLights ?? [])];   // wall cases, work lights, terminals, ceiling lights

// ---------- game states: title -> playing <-> paused, playing -> dead ----------

let state = 'title';
let showControls = false;

// Restart/quit simply reload the page; '#play' skips the title screen.
const restart = () => {
  location.hash = TRAINING ? 'training' : 'play';
  location.reload();
};
const openTraining = () => {
  location.hash = 'training';
  location.reload();
};
const openSurvival = () => {
  if (TRAINING) {
    location.hash = 'play';
    location.reload();
  } else startGame();
};
const quitToTitle = () => {
  history.replaceState(null, '', location.pathname);
  location.reload();
};

function startGame() {
  state = 'playing';
  hintEl.hidden = false;
  setTimeout(() => hintEl.classList.add('fade'), 8000);
}

const menus = {
  title: new Menu([
    { label: 'START', action: openSurvival },
    { label: 'TRAINING', action: openTraining },
    { label: 'ARENA', action: () => (location.href = 'index.html') },
    { label: 'GUN EDITOR', action: () => (location.href = 'editor.html') },
    { label: 'CONTROLS', action: () => (showControls = !showControls) },
  ]),
  paused: new Menu([
    { label: 'RESUME', action: () => (state = 'playing') },
    { label: 'RESTART', action: restart },
    { label: 'QUIT TO TITLE', action: quitToTitle },
  ]),
  dead: new Menu([
    { label: 'TRY AGAIN', action: restart },
    { label: 'QUIT TO TITLE', action: quitToTitle },
  ]),
};

if (location.hash === '#play') {
  history.replaceState(null, '', location.pathname);
  startGame();
} else if (TRAINING) {
  startGame();
} else {
  hintEl.hidden = true;
}

// ---------- wall buys ----------

let nearCase = null;

function nearestCase() {
  let best = null, bestD = BUY_RANGE;
  for (const c of world.cases) {
    const d = Math.hypot(player.x - c.front.x, player.y - c.front.y);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

// What pressing E at this case would do: { label, cost, full, noRoom }.
function offer(c) {
  const o = c.offer, inv = player.inventory;
  if (o.kind === 'weapon') {
    const def = c.def, owned = player.owns(def);
    if (!owned) return { label: `BUY ${def.name}`, cost: def.price };
    return { label: `${def.name} AMMO`, cost: def.ammoPrice };
  }
  if (o.kind === 'mods') return { label: 'RANDOM MOD', cost: o.price };
  if (o.kind === 'armory') return { label: 'OPEN ARMORY', free: true, cost: 0 };
  if (o.kind === 'mystery') return { label: 'MYSTERY WEAPON', cost: o.price };
  if (o.kind === 'melee') return { label: 'RANDOM MELEE', cost: o.price };
  return { label: `BUY ${ITEMS[o.item].name}`, cost: o.price };
}

const MOD_IDS = Object.values(ITEMS).filter((d) => d.type === 'attachment').map((d) => d.id);

const pick = (list) => list[(Math.random() * list.length) | 0];

// A gun / melee weapon that got swapped out goes in the bag, or on the floor if there's no room.
function stowOrDrop(weapon) {
  if (!weapon) return;
  const item = weapon instanceof MeleeWeapon ? meleeItem(weapon) : gunItem(weapon);
  if (player.inventory.add(item)) return hud.notice(`${weapon.def.name} -> BAG`);
  loot.drop(item, player.x, player.y + 4, 0.5);
  hud.notice(`DROPPED ${weapon.def.name}`);
}

function buy(c) {
  const o = offer(c), inv = player.inventory;
  if (c.offer.kind === 'armory') return openArmory();
  if (money < o.cost) return hud.deny();
  if (c.offer.kind === 'mystery') {
    // any gun from the whole catalog you don't already have, plus a box of its ammo
    const def = pick(Object.values(WEAPONS).filter((d) => !player.owns(d)));
    money -= o.cost;
    hud.spent(o.cost);
    stowOrDrop(player.giveWeapon(def));
    inv.give(def.caliber, def.magSize * 2);
    hud.notice(`GOT ${def.name}`);
    return;
  }
  if (c.offer.kind === 'melee') {
    const def = pick(Object.values(MELEE).filter((d) => d !== player.melee.def));
    money -= o.cost;
    hud.spent(o.cost);
    stowOrDrop(player.giveMelee(def));
    if (def.battery) inv.add(newItem('battery', 2));   // comes with a couple of spare packs
    hud.notice(`GOT ${def.name}`);
    return;
  }
  let item = null;
  if (c.offer.kind === 'weapon') {
    if (!player.owns(c.def)) {
      money -= o.cost;
      hud.spent(o.cost);
      stowOrDrop(player.giveWeapon(c.def));
      return;
    }
    item = newItem(AMMO_FOR[c.def.caliber]);
  } else if (c.offer.kind === 'mods') {
    item = newItem(MOD_IDS[(Math.random() * MOD_IDS.length) | 0]);
  } else {
    item = newItem(c.offer.item);
  }
  // armor goes straight on if you aren't wearing any
  const slot = item.def.type === 'armor' ? 'armor' : item.def.type === 'helmet' ? 'helmet' : null;
  if (slot && !inv.equip[slot]) inv.equip[slot] = item;
  else if (!inv.add(item)) return hud.notice('NO ROOM IN BACKPACK');
  money -= o.cost;
  hud.spent(o.cost);
  if (c.offer.kind === 'mods') hud.notice(`GOT ${item.def.name}`);
}

// Other things E does when there's no case in reach: open a supply crate, or pick up gear.
function nearestCrate() {
  return world.supplies.find((s) => !s.opened && Math.hypot(player.x - s.x, player.y - (s.y + 8)) < 20) ?? null;
}

function nearestGear() {
  const e = loot.nearest(player.x, player.y, 16);
  return e && !['ammo', 'med', 'throwable'].includes(e.item.def.type) ? e : null;
}

let nearCrate = null, nearGear = null;

function interact() {
  if (nearCase) return buy(nearCase);
  if (nearCrate) return loot.openCrate(nearCrate, player);
  if (nearGear) {
    // a gun goes straight into an empty gun slot, a melee weapon into an empty melee slot
    const free = nearGear.item.weapon ? player.weapons.indexOf(null) : -1;
    if (free >= 0) {
      player.setGun(free, nearGear.item.weapon);
      loot.remove(nearGear);
    } else if (nearGear.item.melee && player.melee.def.fists) {
      player.setMelee(nearGear.item.melee);
      loot.remove(nearGear);
    } else if (player.inventory.add(nearGear.item)) loot.remove(nearGear);
    else hud.notice('NO ROOM IN BACKPACK');
  }
}

// What the prompt at the bottom of the screen says.
function currentPrompt() {
  if (state !== 'playing') return null;
  if (nearCase) return { ...offer(nearCase), money };
  if (nearCrate) return { label: 'OPEN SUPPLY CRATE', free: true };
  if (nearGear) return { label: `PICK UP ${nearGear.item.def.name}`, free: true };
  return null;
}

// ---------- inventory screen ----------

const invScreen = new InventoryScreen(player, loot);

function toggleInventory() {
  if (state === 'inventory') {
    invScreen.close();
    state = 'playing';
  } else if (state === 'playing') {
    invScreen.open();
    state = 'inventory';
  }
}

// ---------- training armory ----------

const armory = new ArmoryScreen({
  player,
  settings: training.settings,
  applySettings,
  equipGun: (def, slot) => {
    player.equipGun(def, slot);
    player.weapon.drawT = 0.3;
  },
  equipMelee: (def) => player.giveMelee(def),
  giveThrowable: (id) => {
    if (!player.infinite) player.inventory.add(newItem(id, 4));
    player.throwSel = id;
  },
  attach: (key) => {
    const w = player.weapon, slot = ATTACH_ART[key].slot;
    if (!w?.canAttach(key)) return null;
    const off = w.attach[slot] === key;
    w.setAttachment(slot, off ? null : key);
    if (player.infinite) w.ammo = w.magSize;
    return off ? 'off' : 'on';
  },
  spawnZombie: (type) => {
    const g = world.zombieGate;
    rounds.spawnType(type, g.x + (Math.random() - 0.5) * 20, g.y + (Math.random() - 0.5) * 30);
  },
  clearZombies: () => (rounds.zombies = rounds.zombies.filter((z) => z.dummy)),
  resetStats: () => stats.reset(),
});

function applySettings() {
  const s = training.settings;
  player.infinite = s.infAmmo;
  player.setAmmoSource(s.infAmmo ? ENDLESS : player.inventory);
  if (s.infAmmo) for (const w of player.weapons) if (w) w.ammo = Math.max(w.ammo, w.magSize);
  player.god = s.god;
  rounds.freeze = s.freeze;
}

function openArmory() {
  if (state !== 'playing') return;
  armory.open();
  state = 'armory';
}

if (TRAINING) {
  rounds.training = true;
  for (const d of world.dummySpots) rounds.zombies.push(new Dummy(d.x, d.y, { numbers: { push: (n) => numbers.push(n) }, stats }, d.opts));
  player.equipGun(WEAPONS.m4a1, 1);
  player.slot = 1;
  // from the gun editor's TEST button (topdown.html?gun=<key>#training): that gun in hand
  const testGun = new URLSearchParams(location.search).get('gun');
  if (WEAPONS[testGun]) player.equipGun(WEAPONS[testGun], 0);
  applySettings();
}

const hudMouse = () => ({ x: (input.mouse.x * renderer.dpr) / renderer.scale, y: (input.mouse.y * renderer.dpr) / renderer.scale });

// touch: menus and the on-screen buy prompt take taps before the sticks do
input.onTap = (x, y) => {
  if (state === 'inventory') {
    invScreen.tap({ x: (x * renderer.dpr) / renderer.scale, y: (y * renderer.dpr) / renderer.scale });
    return true;
  }
  if (state === 'armory') {
    armory.tap({ x: (x * renderer.dpr) / renderer.scale, y: (y * renderer.dpr) / renderer.scale });
    return true;
  }
  if (menus[state]) return menus[state].tap(x, y);
  const r = hud.promptRect;
  if (!nearCase || !r || x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) return false;
  buy(nearCase);
  return true;
};

window.game = { MODE, flashFx, throwables, armory, spec, stats, training, applySettings, loot, invScreen, get money() { return money; }, set money(v) { money = v; }, get state() { return state; }, set state(v) { state = v; }, world, player, renderer, input, bullets, particles, rounds, lighting, explosives }; // handy for poking at things from devtools

renderer.camera.x = player.x;
renderer.camera.y = player.y + CAMERA_Y_OFFSET;

if (matchMedia('(pointer: coarse)').matches) hintEl.textContent = 'นิ้วซ้าย = เดิน · นิ้วขวา = เล็ง + ยิง';

let debug = false;
let time = 0;
let lastRound = 0;

// Double-tap a direction (WW, AA, SS, DD) to dodge-roll. A press only counts
// once even if a frame runs several updates (hence the 0.04 s floor).
const TAP_GAP = 0.28;
const lastTap = {};
function doubleTap() {
  const now = performance.now() / 1000;
  let hit = false;
  for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']) {
    const last = lastTap[k] ?? { t: -9, used: false };
    if (!input.wasPressed(k) || now - last.t < 0.04) continue;
    const second = now - last.t < TAP_GAP && !last.used;   // a third tap starts a new pair
    if (second) hit = true;
    lastTap[k] = { t: now, used: second };
  }
  return hit;
}

// Gather this frame's intent from whatever the player is using.
function readControls() {
  const move = input.moveVector();
  const base = {
    move,
    reload: input.wasPressed('KeyR'),
    heal: input.wasPressed('KeyH'),
    sprint: input.down('ShiftLeft', 'ShiftRight'),
    grenade: input.wasPressed('KeyG'),
    cycleThrow: input.wasPressed('KeyX'),
    toggleLight: input.wasPressed('KeyF'),
    roll: doubleTap(),
    // 1 = melee, 2 / 3 = guns
    switchTo: input.wasPressed('Digit1') ? 'melee' : input.wasPressed('Digit2') ? 0 : input.wasPressed('Digit3') ? 1 : null,
    cycle: input.wasPressed('KeyQ') ? 1 : input.wheel,
  };
  const stick = input.aimVector();
  if (stick) {
    const m = Math.hypot(stick.x, stick.y);
    return { ...base, aim: m > 0 ? Math.atan2(stick.y, stick.x) : null, fire: m > 0.5 };
  }
  if (input.mouse.active) {
    const o = player.aimOrigin(), w = mouseWorld();
    return { ...base, aim: Math.atan2(w.y - o.y, w.x - o.x), target: w, fire: input.mouse.down };
  }
  return { ...base, aim: null, fire: false };
}

// With the bag open: walk (and sprint), nothing else - the hands are in the bag.
function walkOnly() {
  return {
    move: input.moveVector(), sprint: input.down('ShiftLeft', 'ShiftRight'),
    reload: false, heal: false, grenade: false, cycleThrow: false, toggleLight: false, switchTo: null, cycle: 0,
    aim: player.aim, target: player.aimTarget, fire: false,
  };
}

function mouseWorld() {
  return renderer.screenToWorld(input.mouse.x, input.mouse.y);
}

function update(dt) {
  time += dt;
  if (input.wasPressed('F3')) {
    debug = !debug;
    debugEl.hidden = !debug;
  }
  canvas.style.cursor = state === 'playing' ? 'none' : 'default';
  flashFx.t = Math.max(0, flashFx.t - dt);
  numbers = updateNumbers(numbers, dt);

  if (state === 'title') {
    // idle in the start room while the camera drifts a little
    player.animate(dt, false);
    renderer.camera.x = player.x + Math.sin(time * 0.3) * 30;
    renderer.camera.y = player.y + CAMERA_Y_OFFSET + Math.sin(time * 0.21) * 14;
    menus.title.update(input);
    input.endFrame();
    return;
  }
  if (state === 'paused') {
    if (input.wasPressed('Escape', 'KeyP')) state = 'playing';
    else menus.paused.update(input);
    input.endFrame();
    return;
  }
  if (state === 'armory') {
    if (input.wasPressed('Escape', 'KeyE', 'Tab')) state = 'playing';
    else armory.update(hudMouse(), { down: input.wasPressed('Mouse0'), right: input.wasPressed('Mouse2') });
    input.endFrame();
    return;
  }
  // the bag doesn't pause the game: the mouse works the inventory, WASD still walks
  const bagOpen = state === 'inventory';
  if (bagOpen) {
    if (input.wasPressed('Tab', 'Escape', 'KeyI')) {
      toggleInventory();
      input.endFrame();
      return;
    }
    invScreen.update(hudMouse(), { down: input.wasPressed('Mouse0'), up: input.wasPressed('Mouse0Up'), right: input.wasPressed('Mouse2'), rotate: input.wasPressed('KeyR') });
  }
  if (state === 'playing' && input.wasPressed('Tab', 'KeyI')) {
    toggleInventory();
    input.endFrame();
    return;
  }
  if (state === 'playing' && input.wasPressed('Escape', 'KeyP')) {
    state = 'paused';
    input.endFrame();
    return;
  }

  player.update(dt, bagOpen ? walkOnly() : readControls(), world);
  nearCase = player.dead ? null : nearestCase();
  nearCrate = player.dead || nearCase ? null : nearestCrate();
  nearGear = player.dead || nearCase || nearCrate ? null : nearestGear();
  if (!bagOpen && input.wasPressed('KeyE')) interact();
  loot.update(dt, player, (item, n) => hud.notice(`+${n > 1 ? n + ' ' : ''}${item.def.name}`));
  if (rounds.round !== lastRound) {
    // a new round: supply crates are restocked
    lastRound = rounds.round;
    for (const s of world.supplies) {
      s.opened = false;
      s.mask = null;
    }
  }
  if (player.dead) {
    player.deadTime = (player.deadTime ?? 0) + dt;
    if (state === 'inventory') invScreen.close();
    if (state === 'playing' || state === 'inventory') state = 'dead';
    if (player.deadTime > 1) menus.dead.update(input);
  }
  rounds.update(dt, player);
  bullets.update(dt, world, rounds.zombies);
  explosives.update(dt);
  hazards.update(dt, player, rounds.zombies, (z, dmg) => hurtZombie(z, dmg));
  throwables.update(dt);
  if (TRAINING) stats.peak = Math.max(stats.peak, stats.dps);
  particles.update(dt);
  spec.update(dt, player);
  world.updateDecals(dt);
  renderer.update(dt);

  let tx = player.x + player.vx * CAMERA_LOOKAHEAD;
  let ty = player.y + CAMERA_Y_OFFSET + player.vy * CAMERA_LOOKAHEAD;
  if (input.mouse.active && !player.dead) {
    // lean toward the cursor so you can see where you're shooting
    const w = mouseWorld();
    let lx = (w.x - player.x) * CAMERA_AIM_LEAN, ly = (w.y - player.y) * CAMERA_AIM_LEAN;
    const l = Math.hypot(lx, ly);
    if (l > CAMERA_AIM_MAX) {
      lx *= CAMERA_AIM_MAX / l;
      ly *= CAMERA_AIM_MAX / l;
    }
    tx += lx;
    ty += ly;
  }
  const cam = renderer.camera;
  const k = 1 - Math.exp(-CAMERA_FOLLOW * dt);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  input.endFrame();
}
game.step = (dt, frames = 1) => {   // advance the simulation by hand (testing)
  for (let i = 0; i < frames; i++) update(dt);
  render();
};

function render() {
  const ctx = renderer.ctx;
  renderer.clear(PAL.void);
  renderer.beginWorld();

  // --- lit scene ---
  ctx.drawImage(world.floorCanvas, 0, 0);
  world.drawDecals(ctx);
  particles.draw(ctx, 'ground');
  hazards.draw(ctx);
  throwables.draw(ctx);
  loot.draw(ctx);
  spec.drawFloor(ctx, time);

  // Y-sort entities with the wall rows. A wall row sorts on the top of its
  // cells: anything whose feet are above that line is behind the wall.
  // `order` remembers what was drawn, back to front, so the lighting can
  // light each upright thing the same way round.
  const drawables = [...world.props, ...rounds.zombies, player].sort((a, b) => a.sortY - b.sortY);
  // shadows and floor rails belong to the floor: under everything standing up
  for (const d of drawables) d.drawShadow?.(ctx, renderer);
  const firstRow = Math.max(0, Math.floor(renderer.top / TILE));
  const lastRow = Math.min(world.h - 1, Math.ceil((renderer.top + renderer.viewH + WALL_H) / TILE));
  const order = [];
  const drawOne = (d) => {
    d.draw(ctx, renderer);
    order.push(d);
  };
  let i = 0;
  for (let row = 0; row < world.h; row++) {
    const lineY = row * TILE;
    while (i < drawables.length && drawables[i].sortY < lineY) drawOne(drawables[i++]);
    const strip = world.wallRows[row];
    if (strip && row >= firstRow && row <= lastRow) {
      ctx.drawImage(strip, 0, lineY - WALL_H);
      order.push({ row });
    }
  }
  while (i < drawables.length) drawOne(drawables[i++]);
  explosives.draw(ctx);
  particles.draw(ctx, 'mid');

  // --- lighting ---
  lighting.begin(renderer);
  for (const l of lamps) {
    const base = TRAINING ? 0.95 : LAMP.intensity;
    l.intensity = l.flicker && Math.sin(time * 23) + Math.sin(time * 7.3) > 1.4 ? base * 0.2 : base;
    lighting.add(l);
  }
  for (const l of propLights) lighting.add(l);
  for (const l of explosives.lights()) lighting.add(l);
  for (const l of hazards.lights()) lighting.add(l);
  for (const l of throwables.lights()) lighting.add(l);
  for (const l of spec.lights(player)) lighting.add(l);
  let beam = null;
  if (!player.dead) {
    lighting.add({ ...PLAYER_GLOW, x: player.x, y: player.y });
    const f = player.flashlight();   // only with a flashlight on the gun
    if (f) {
      // never let the beam start on the far side of a wall the gun is poking into
      const bx = f.x - player.x, by = f.y - (player.y - 3), bl = Math.hypot(bx, by);
      if (bl > 0) {
        const free = world.castRay(player.x, player.y - 3, bx / bl, by / bl, bl);
        if (free < bl) {
          f.x = player.x + (bx / bl) * Math.max(0, free - 1);
          f.y = player.y - 3 + (by / bl) * Math.max(0, free - 1);
        }
      }
      lighting.add({ ...FLASHLIGHT_SOFT, x: f.x, y: f.y, angle: f.angle });
      beam = lighting.add({ ...FLASHLIGHT, x: f.x, y: f.y, angle: f.angle });
      beam &&= { poly: beam, ...f };
    }
    laserDot = laserBeam();
    if (laserDot?.hit) lighting.add({ x: laserDot.x1, y: laserDot.y1 + laserDot.z, radius: 16, color: [255, 40, 30], intensity: 0.8 * Math.max(0.15, laserDot.fade), shadows: false });
    if (player.muzzleLight > 0) lighting.add({ x: player.muzzle.x, y: player.muzzle.y, radius: 90, color: [255, 190, 110], intensity: 1, rays: 64 });
  }
  for (const b of bullets.items) lighting.add({ x: b.x, y: b.y, radius: 22, color: [255, 170, 80], intensity: 0.6, shadows: false });
  lighting.surfaces(order);
  lighting.apply(ctx);

  // --- glowing things (unaffected by darkness) ---
  if (beam) {
    const g = ctx.createRadialGradient(beam.x, beam.y, 0, beam.x, beam.y, FLASHLIGHT.radius);
    g.addColorStop(0, 'rgba(255, 240, 200, 0.14)');
    g.addColorStop(1, 'rgba(255, 240, 200, 0)');
    lighting.glare(ctx, beam.poly, g, 1);
  }
  // Each glow belongs to something at a depth (its y): a lamp to its wall, a
  // screen to its terminal, a muzzle flash to you. Anything standing in front
  // of that hides it, the same as it hides the thing itself.
  const glows = [];
  const at = (y, draw) => glows.push({ y, draw });
  for (const l of lamps) {
    at(l.y, (g) => {
      const lit = l.intensity > 0.5;
      const [r, gg, b] = l.color;
      g.fillStyle = lit ? `rgb(${r}, ${Math.min(255, gg + 120)}, ${Math.min(255, b + 100)})` : '#3a2020';
      g.fillRect(Math.round(l.x) - 2, l.y - 10, 4, 1);
      if (lit) {
        g.fillStyle = `rgba(${r}, ${gg}, ${b}, 0.5)`;
        g.fillRect(Math.round(l.x) - 3, l.y - 10, 6, 2);
      }
    });
  }
  for (const c of world.cases) {
    at(c.y, (g) => {
      // soft bloom around the lit glass
      const gr = g.createRadialGradient(c.x, c.y - 10, 2, c.x, c.y - 10, 30);
      gr.addColorStop(0, 'rgba(220, 245, 235, 0.22)');
      gr.addColorStop(1, 'rgba(220, 245, 235, 0)');
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = gr;
      g.fillRect(c.x - 30, c.y - 40, 60, 60);
    });
  }
  for (const z of rounds.zombies) if (!(z instanceof Dummy)) at(z.sortY + 0.5, (g) => z.drawEmissive(g, renderer));
  at(player.sortY + 0.5, (g) => {
    player.drawEmissive(g, renderer);
    if (laserDot) drawLaser(g, laserDot);
  });
  for (const p of world.props) if (p.glow) at(p.sortY + 0.5, (g) => p.glow(g, time));
  // things lying on the floor: anything standing over them hides them
  at(-Infinity, (g) => {
    explosives.drawEmissive(g);
    loot.drawEmissive(g);
    hazards.drawEmissive(g);
    throwables.drawEmissive(g, time);
  });
  glows.push(...spec.glows(player, time));
  drawGlows(glows, order);
  // on top of everything: damage numbers, bullets in flight, sparks in the air
  for (const z of rounds.zombies) if (z instanceof Dummy) z.drawEmissive(ctx, renderer);
  drawNumbers(ctx, numbers);
  bullets.draw(ctx);
  particles.draw(ctx, 'air');
  if (debug) player.drawDebug(ctx);

  // --- screen space ---
  renderer.drawVignette();
  if (state === 'title') return drawTitle(ctx);
  drawFlashbang(ctx);   // under the HUD, which stays readable
  const prompt = currentPrompt();
  // full-screen menus cover the game HUD (and the control hints) completely
  const overlay = state === 'inventory' || state === 'armory';
  hintEl.style.visibility = overlay ? 'hidden' : '';
  if (!overlay) hud.draw(ctx, renderer, { player, rounds, money, time, prompt, touch: input.usingTouch, training: TRAINING ? stats : null });
  if (state === 'inventory') {
    invScreen.info = TRAINING ? { training: true } : { round: rounds.round, money };
    invScreen.draw(ctx, renderer, time);
  }
  if (state === 'armory') armory.draw(ctx, renderer, time);
  input.drawSticks(ctx, renderer.dpr);
  if (state === 'playing' && input.mouse.active) drawCrosshair(ctx);
  if (state === 'paused') drawPause(ctx);
  if (state === 'dead' && player.deadTime > 1) {
    const u = renderer.scale, H = renderer.height / u;
    menus.dead.draw(ctx, renderer, renderer.width / u / 2, Math.round(H * 0.38 + 52), time);
  }
}

// ---------- flashbang ----------

const smoothstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

function drawFlashbang(ctx) {
  const f = flashFx, c = renderer.canvas;
  if (f.pending) {
    // burn in this frame (the flash itself has just lit everything up)
    f.pending = false;
    if (!f.snap || f.snap.width !== c.width || f.snap.height !== c.height) f.snap = makeCanvas(c.width, c.height)[0];
    const g = f.snap.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(c, 0, 0);
  }
  if (f.t <= 0 || !f.snap) return;
  const p = 1 - f.t / f.max;   // 0 at the bang .. 1 when it's over
  // white: held, then washes out; the afterimage outlasts it and fades last
  const white = Math.min(1, 0.45 + f.k) * (1 - smoothstep((p - 0.18) / 0.42));
  const ghost = 1 - smoothstep((p - 0.45) / 0.55);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (ghost > 0) {
    ctx.globalAlpha = ghost * Math.min(0.6, 0.3 + f.k * 0.4);   // see-through, so the live scene shows under it
    ctx.filter = 'grayscale(0.6) brightness(1.5) contrast(0.85)';
    ctx.drawImage(f.snap, 0, 0);
    ctx.filter = 'none';
  }
  if (white > 0) {
    ctx.globalAlpha = white;
    ctx.fillStyle = '#fffef6';
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.restore();
}

// ---------- laser sight ----------

let laserDot = null;

const LASER_RANGE = 340;   // px; it fades out along the way and is gone past this

// The laser runs along the exact line the next shot takes. Like the
// flashlight it carries on over low things and through zombies; only a tall
// wall or tall prop stops it (with a dot where it lands). Screen-space ends;
// fade = how bright it still is at the far end.
function laserBeam() {
  const l = player.laser();
  if (!l) return null;
  const dx = Math.cos(l.angle), dy = Math.sin(l.angle);
  const d = world.castRay(l.x, l.y + l.z, dx, dy, LASER_RANGE, true);   // on the floor, under the beam
  return { x0: l.x, y0: l.y, x1: l.x + dx * d, y1: l.y + dy * d, z: l.z, fade: 1 - d / LASER_RANGE, hit: d < LASER_RANGE };
}

// Glows, drawn back to front on their own layer through the same depth order
// as the scene: before each thing standing up (or wall row) goes on, it is cut
// out of the glow layer, so what's in front of a glow covers it. Then the
// layer goes on over the lit scene.
const [glowCanvas, glowCtx] = makeCanvas(1, 1);
function drawGlows(glows, order) {
  const g = glowCtx;
  if (glowCanvas.width !== renderer.width || glowCanvas.height !== renderer.height) {
    glowCanvas.width = renderer.width;
    glowCanvas.height = renderer.height;
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
  const s = renderer.scale;
  g.setTransform(s, 0, 0, s, -Math.round(renderer.left * s), -Math.round(renderer.top * s));
  g.imageSmoothingEnabled = false;
  glows.sort((a, b) => a.y - b.y);
  let i = 0, any = false;
  const upTo = (y) => {
    while (i < glows.length && glows[i].y < y) {
      g.save();
      glows[i++].draw(g);
      g.restore();
      any = true;
    }
  };
  // (only what's on screen needs cutting out)
  const l = renderer.left - 40, r = renderer.left + renderer.viewW + 40, t = renderer.top - 8, bt = renderer.top + renderer.viewH + 48;
  for (const d of order) {
    const row = d.row !== undefined;
    upTo(row ? d.row * TILE : d.sortY);
    if (!any) continue;
    if (!row && (d.x < l || d.x > r || d.y < t || d.y > bt)) continue;
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.globalAlpha = 1;
    if (row) g.drawImage(world.wallRows[d.row], 0, d.row * TILE - WALL_H);
    else d.draw(g, renderer);
    g.restore();
  }
  upTo(Infinity);
  const ctx = renderer.ctx;
  renderer.beginScreen();
  ctx.drawImage(glowCanvas, 0, 0);
  renderer.beginWorld();
}

function drawLaser(ctx, b) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const line = (width, r, g, bl, a) => {
    const grad = ctx.createLinearGradient(b.x0, b.y0, b.x1, b.y1);
    grad.addColorStop(0, `rgba(${r}, ${g}, ${bl}, ${a})`);
    grad.addColorStop(1, `rgba(${r}, ${g}, ${bl}, ${a * b.fade})`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(b.x0, b.y0);
    ctx.lineTo(b.x1, b.y1);
    ctx.stroke();
  };
  line(2, 255, 40, 30, 0.22);
  line(0.6, 255, 70, 60, 0.8);
  if (b.hit) {
    ctx.globalAlpha = Math.max(0.15, b.fade);
    ctx.fillStyle = '#ff5a4a';
    ctx.fillRect(Math.round(b.x1) - 1, Math.round(b.y1) - 1, 2, 2);
    ctx.fillStyle = '#ffd0c8';
    ctx.fillRect(Math.round(b.x1), Math.round(b.y1) - 1, 1, 1);
  }
  ctx.restore();
}

// ---------- screens ----------

function dim(ctx, alpha) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `rgba(4, 6, 3, ${alpha})`;
  ctx.fillRect(0, 0, renderer.width, renderer.height);
}

function centred(ctx, text, y, size, color) {
  const u = renderer.scale, W = renderer.width / u;
  drawText(ctx, text, Math.round((W / 2 - textWidth(text, size) / 2) * u), Math.round(y * u), u * size, color);
}

function drawTitle(ctx) {
  dim(ctx, 0.45);
  const u = renderer.scale, H = renderer.height / u;
  const top = Math.round(H * 0.2);
  // title with a little flicker, like a failing sign
  const flicker = Math.sin(time * 17) + Math.sin(time * 5.3) > 1.75 ? '#5a1418' : '#d7313d';
  centred(ctx, 'PROJECT Z', top, 6, flicker);
  centred(ctx, 'SURVIVE THE LAB', top + 38, 1, '#a7ae98');
  menus.title.draw(ctx, renderer, renderer.width / u / 2, top + 60, time);
  if (showControls) {
    const lines = [
      'WASD  MOVE        SHIFT  SPRINT',
      'MOUSE  AIM        CLICK  SHOOT',
      'R  RELOAD         G  THROW  X  NEXT',
      '1  MELEE   2 3  GUNS   Q  SWITCH',
      'E  BUY / USE      F  LIGHT ON/OFF',
      'ESC  PAUSE',
    ];
    lines.forEach((s, i) => centred(ctx, s, top + 104 + i * 9, 1, '#cfd8c4'));
  } else {
    centred(ctx, 'SHOOT THE RED DRUMS', H - 22, 1, '#6f7a62');
  }
}

function drawPause(ctx) {
  dim(ctx, 0.6);
  const u = renderer.scale, H = renderer.height / u;
  const top = Math.round(H * 0.3);
  centred(ctx, 'PAUSED', top, 4, '#e8ecd8');
  menus.paused.draw(ctx, renderer, renderer.width / u / 2, top + 34, time);
}

// Pixel crosshair at the mouse: four corner ticks that open up after each shot.
function drawCrosshair(ctx) {
  const u = renderer.scale;
  const cx = Math.round(input.mouse.x * renderer.dpr), cy = Math.round(input.mouse.y * renderer.dpr);
  const gap = (3 + Math.round(Math.max(0, player.held.recoil) * 1.5)) * u;
  // each corner is an L whose arms point back toward the centre
  const arms = [];
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = cx + sx * gap, y = cy + sy * gap;
    arms.push([sx < 0 ? x : x - 2 * u, y, 3 * u, u], [x, sy < 0 ? y : y - 2 * u, u, 3 * u]);
  }
  ctx.fillStyle = 'rgba(5, 6, 4, 0.8)';
  for (const [x, y, w, h] of arms) ctx.fillRect(x - u, y - u, w + 2 * u, h + 2 * u);
  ctx.fillStyle = '#b6f07a';
  for (const [x, y, w, h] of arms) ctx.fillRect(x, y, w, h);
}

let last = performance.now();
let fpsTime = 0, fpsFrames = 0;
function frame(now) {
  // the first rAF timestamp can predate `last` (set after loading), so never go negative
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  try {
    update(dt);
    render();
  } catch (e) {
    console.error(e);   // keep the loop alive; the error is still visible in the console
  }

  if (debug && (fpsTime += dt, ++fpsFrames, fpsTime >= 0.5)) {
    debugEl.textContent =
      `${Math.round(fpsFrames / fpsTime)} fps  x${renderer.scale}\n` +
      `pos ${player.x.toFixed(1)}, ${player.y.toFixed(1)}\n` +
      `zombies ${rounds.zombies.length}  to spawn ${rounds.toSpawn}\n` +
      `bullets ${bullets.items.length}  particles ${particles.items.length}`;
    fpsTime = fpsFrames = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
