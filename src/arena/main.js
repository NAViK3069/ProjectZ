// ARENA: a side-on brawl in the lab, Superfighters / Gun Mayhem style. You
// and up to three bots start with your fists and a pistol; guns, melee
// weapons, medkits and grenades are beamed in around the level. Last one (or
// last team) standing takes the round. The room is set up first - mode, bots,
// how many rounds, health, damage, what you start with, how much drops.

import { loadImages, makeCanvas, rect } from '../engine/pixel.js';
import { Renderer } from '../engine/renderer.js';
import { Input } from '../engine/input.js';
import { WEAPONS, WEAPON_CLASSES } from '../combat/weapons.js';
import { gunIcon, artW, artH, HANDS } from '../combat/gunart.js';
import { MELEE } from '../combat/melee.js';
import { drawText, textWidth } from '../ui/font.js';
import { Kit, K as KC } from '../ui/kit.js';   // (KC: the menus' colours - K here is a sprite colour)
import { Level, T, SOLID, PLAT, ACID } from './level.js';
import { MAPS, MAP_KEYS } from './maps.js';
import { placeProps, DEBRIS } from './props.js';
import { Fighter, MAX_STAMINA, DAMAGE, CLASS_MUL, HEAD_MUL, SKILL_CD, SKILL_TIME, BACKSTAB, SHADOW } from './fighter.js';
import { Fx } from './fx.js';
import { Lights } from './light.js';
import { Nav, Bot, gunTier } from './ai.js';
import { drawBolts, drawVoidHole } from './void.js';
import { drawBlast } from './flame.js';
import { drawCircle, drawHole, drawBoom } from './galaxy.js';
import { drawDemon, drawFist, drawSummonCircle, drawPunch } from './demon.js';
import { online, initOnline, openOnline, netUpdate, netScreenInput, netGameInput, drawNetScreen, drawNetOverlay, updateRemotes, hostFrame, clientFrame } from './online.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (l) => l[(Math.random() * l.length) | 0];


const canvas = document.getElementById('game');
const kit = new Kit();   // the menus' look and clicks (ui/kit.js)
const renderer = new Renderer(canvas, { viewHeight: 290, viewWidth: 500, fit: 'floor' });
// the HUD's pixel size: the world's on an ordinary screen, a step smaller on a big one
const hudScale = () => Math.max(2, Math.round(renderer.scale * 0.85));
const input = new Input(canvas);
const hintEl = document.getElementById('hud');
hintEl.classList.add('fade');   // shown once a match starts
// the map being played (the main menu shows the lab behind it)
let level = new Level(MAPS.lab);
let PW = level.w * T, PH = level.h * T;
function loadMap(key) {
  level = new Level(MAPS[key] ?? MAPS.lab);
  PW = level.w * T;
  PH = level.h * T;
  game.level = level;
  game.nav = new Nav(level);
  game.fx = new Fx(level);
  game.lights = new Lights(level);
  game.props = placeProps(level.props, level);
}

const images = await loadImages({
  head: 'assets/player/head.png',
  body: 'assets/player/body.png',
  legL: 'assets/player/leg_l.png',
  legR: 'assets/player/leg_r.png',
  // seen from behind (climbing a ladder)
  backHead: 'assets/player/back_head.png',
  backBody: 'assets/player/back_body.png',
  backLegL: 'assets/player/back_leg_l.png',
  backLegR: 'assets/player/back_leg_r.png',
});

// ---------- the room's settings (Superfighters style), kept between visits ----------

const OPTIONS = [
  ['map', 'MAP', [...MAP_KEYS.map((k) => [k, MAPS[k].name]), ['random', 'RANDOM']]],
  ['mode', 'MODE', [['ffa', 'FREE FOR ALL'], ['teams', 'TEAMS']]],
  ['bots', 'BOTS', [[1, '1'], [2, '2'], [3, '3']]],
  ['skill', 'BOT SKILL', [[0.7, 'EASY'], [1, 'NORMAL'], [1.35, 'HARD']]],
  ['wins', 'ROUNDS TO WIN', [[1, '1'], [3, '3'], [5, '5'], [7, '7']]],
  ['time', 'ROUND TIME', [[60, '1:00'], [90, '1:30'], [120, '2:00'], [180, '3:00'], [300, '5:00'], [0, 'NO LIMIT']]],
  ['skills', 'SKILLS (Q)', [[1, 'ON'], [0, 'OFF']]],
  ['myskill', 'YOUR SKILL', [['grapple', 'GRAPPLE LINE'], ['cloak', 'CLOAK'], ['decoy', 'SHADOW CLONE'], ['archery', 'ARCHERY'], ['murasaki', 'MURASAKI'], ['blaze', 'FLAME FIST'], ['galaxy', 'GALAXY'], ['demon', 'ABYSS GOLEM'], [null, 'NO SKILL']]],
  ['botskill', 'BOT SKILLS', [['random', 'RANDOM'], ['grapple', 'GRAPPLE LINE'], ['cloak', 'CLOAK'], ['decoy', 'SHADOW CLONE'], ['archery', 'ARCHERY'], ['murasaki', 'MURASAKI'], ['blaze', 'FLAME FIST'], ['galaxy', 'GALAXY'], ['demon', 'ABYSS GOLEM'], [null, 'NONE']]],
  ['lives', 'LIVES', [[1, '1'], [2, '2'], [3, '3'], [5, '5']]],
  ['hp', 'HEALTH', [[100, '100'], [200, '200'], [300, '300'], [500, '500']]],
  ['dmg', 'GUN DAMAGE', [[0.5, '50%'], [0.75, '75%'], [1, '100%'], [1.5, '150%']]],
  ['start', 'START WITH', [['fists', 'FISTS'], ['pistol', 'FISTS + PISTOL'], ['random', 'FISTS + RANDOM GUN'], ['knife', 'KNIFE + PISTOL']]],
  ['nades', 'START GRENADES', [[0, '0'], [1, '1'], [2, '2'], [3, '3']]],
  ['drops', 'ITEM DROPS', [[0, 'OFF'], [0.5, 'FEW'], [1, 'NORMAL'], [2, 'MANY']]],
  ['pool', 'WEAPONS THAT DROP', [['all', 'GUNS + MELEE'], ['guns', 'GUNS ONLY'], ['melee', 'MELEE ONLY']]],
];
const DEFAULTS = { map: 'lab', mode: 'ffa', bots: 3, skill: 1, wins: 3, time: 90, skills: 1, myskill: 'grapple', botskill: 'random', lives: 2, hp: 300, dmg: 1, start: 'pistol', nades: 1, drops: 1, pool: 'all' };
const settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem('arena.settings') ?? '{}')); } catch {}
const saveSettings = () => { try { localStorage.setItem('arena.settings', JSON.stringify(settings)); } catch {} };
for (const [k, , vals] of OPTIONS) if (!vals.some(([v]) => v === settings[k])) settings[k] = DEFAULTS[k];

// guns that get beamed in, roughly by how often
const GUN_POOL = [
  ...['deagle', 'revolver', 'g18', 'm1911', 'mac10'],
  ...['mp5', 'vector', 'p90', 'ump45', 'mp7', 'mp5', 'vector'],
  ...['ak47', 'm4a1', 'scarh', 'famas', 'm16a4', 'aug', 'ak47', 'm4a1'],
  ...['m870', 'spas12', 'aa12', 'dbs', 'm870'],
  ...['awm', 'barrett', 'm24'],
  ...['m249', 'm60', 'mg42'],
].filter((k) => WEAPONS[k]);
// melee weapons that get beamed in (not the chainsaw: no spare batteries in the lab)
const MELEE_POOL = ['knife', 'tacknife', 'bat', 'crowbar', 'machete', 'axe', 'katana', 'hammer', 'spear', 'shovel', 'fireaxe', 'bat', 'katana'].filter((k) => MELEE[k]);
const ICONS = {};
const iconOf = (key) => (ICONS[key] ??= gunIcon(WEAPONS[key].art, WEAPONS[key].defaultAttach ?? {}));

// ---------- little sprites ----------

function sprite(w, h, paint) {
  const [c, g] = makeCanvas(w, h);
  paint(g);
  return c;
}
const K = '#0b100f';
const MEDKIT = sprite(11, 9, (g) => {
  rect(g, K, 0, 1, 11, 8); rect(g, K, 3, 0, 5, 2);
  rect(g, '#e8ece6', 1, 2, 9, 6); rect(g, '#b8c4bc', 1, 7, 9, 1);
  rect(g, '#d2302a', 4, 3, 3, 4); rect(g, '#d2302a', 3, 4, 5, 2);
});
const NADES = sprite(11, 8, (g) => {
  for (const ox of [0, 6]) {
    rect(g, K, ox, 2, 5, 6); rect(g, '#4a6a3a', ox + 1, 3, 3, 4); rect(g, '#6e8f52', ox + 1, 3, 1, 3);
    rect(g, K, ox + 1, 0, 3, 3); rect(g, '#9aa49c', ox + 2, 1, 1, 1);
  }
});
const NADE = sprite(5, 6, (g) => {
  rect(g, K, 0, 1, 5, 5); rect(g, '#4a6a3a', 1, 2, 3, 3); rect(g, '#6e8f52', 1, 2, 1, 2);
  rect(g, K, 1, 0, 3, 2); rect(g, '#9aa49c', 2, 0, 1, 1);
});
const IMPACT = sprite(5, 6, (g) => {
  rect(g, K, 0, 1, 5, 5); rect(g, '#3a3e3c', 1, 2, 3, 3); rect(g, '#d2302a', 1, 3, 3, 1); rect(g, '#5a605c', 1, 2, 1, 1);
  rect(g, K, 1, 0, 3, 2); rect(g, '#ffd25a', 2, 0, 1, 1);
});
const NADE_ART = { frag: NADE, impact: IMPACT };
const NADE_NAME = { frag: 'FRAG', impact: 'IMPACT' };
const IMPACT_PAIR = sprite(11, 8, (g) => { g.drawImage(IMPACT, 0, 2); g.drawImage(IMPACT, 6, 2); });
const FIST_ICON = sprite(9, 7, (g) => g.drawImage(HANDS.open.img, 1, 0, HANDS.open.img.width * 1, HANDS.open.img.height * 1));
// ---------- the game ----------

const game = {
  level, weapons: WEAPONS, fighters: [], props: [], bullets: [], grenades: [], pickups: [], feed: [], blasts: [], thrown: [], numbers: [], racks: [], arrows: [], voids: [], fists: [], galaxies: [], demons: [], punches: [],
  get gunDamage() { return settings.dmg; },
  get regen() { return !overtime; },   // out of a fight for a while, you heal (not once the lab's venting)
  get viewer() { return player; },
  // training: your skill has no wait between uses, unless the skill bay turns cooldowns on
  noCooldown: (f) => state === 'training' && f === player && !skillCooldowns,
  kick: (dx, dy) => renderer.kick(dx, dy),
  loose: (f, targets, point) => loose(f, targets, point),
  flameFist: (f, x, y, a, v) => flameFist(f, x, y, a, v),
  summonDemon: (f, x, y, seed) => summonDemon(f, x, y, seed),
  galaxy: (f, x, y, seed) => game.galaxies.push({ owner: f, x, y, seed, t: 0, boomed: false, burn: new Map() }),
  hollowPurple: (f, x, y, a) => game.voids.push({ owner: f, x, y, x0: x, y0: y, a, sp: 120, dist: 0, t: 0, hit: new Set(), done: -1 }),   // whose eyes the screen is (a cloaked fighter shows only to itself)
  // what everyone starts a round with
  loadout() {
    const gun = settings.start === 'fists' ? null : settings.start === 'random' ? pick(GUN_POOL) : 'm9';
    return { gun, ammo: gun ? WEAPONS[gun].magSize * (gun === 'm9' ? 3 : 2) : 0, grenades: settings.nades, hp: settings.hp, melee: settings.start === 'knife' ? 'knife' : null };
  },
  nadeArt: (kind) => NADE_ART[kind] ?? NADE,
  foes(a, b) {
    if (a.vanish || b.vanish) return false;
    const ra = a.owner ?? a, rb = b.owner ?? b;   // (a shadow clone sides with whoever made it)
    return ra !== rb && (settings.mode !== 'teams' || ra.team !== rb.team);
  },
  // The shadow clone skill: a double of f, at f's spot, holding what f holds,
  // f's health as a share of a quarter of f's - driven by a slow, sloppy bot.
  spawnDecoy(f) {
    const d = new Fighter(this, f.images, { name: f.name, color: f.color, hue: f.hue, sat: f.sat });
    d.reset(f.x, f.y);
    Object.assign(d, { isDecoy: true, owner: f, team: f.team, facing: f.facing, aim: f.aim, vx: f.vx, vy: f.vy, crouch: f.crouch, grenades: 0, gun: null });
    d.maxHp = Math.max(1, Math.round(f.maxHp / 4));
    d.hp = (d.maxHp * f.hp) / f.maxHp;
    if (!f.melee.def.fists) d.giveMelee(f.melee.def);   // (bare fists it has already)
    if (f.gun) { const c = d.give(f.gun.def.key, 999); c.ammo = f.gun.ammo; }
    d.slot = f.weapon || f.slot === 1 ? f.slot : 1;
    if (!d.gunIn(d.slot) && d.slot !== 1) d.slot = 1;
    d.melee.drawT = 0;
    this.fighters.push(d);
    decoys.push({ f: d, bot: new Bot(this, d, 0.55), fireT: 0.4, aim: f.aim, wispT: 0 });
    return d;
  },
  // A shadow clone's end: it comes apart in mist (nothing left behind) and is gone
  dropDecoy(d) {
    if (d.vanish) return;
    d.vanish = 0.4;
    d.fade = { t: 0, dur: 0.4, out: true, seed: Math.random() * 100, rgb: SHADOW };
    this.fx.mist(d.x, d.y, 22);
  },
  fx: new Fx(level), lights: new Lights(level), nav: new Nav(level),
  // a hit landed on someone: a damage number pops up (white body, yellow head, red melee, orange blast)
  onHurt(v, dmg, kind, from) {
    const color = kind === 'crit' ? '#ff3a2a' : kind === 'head' ? '#ffd84a' : kind === 'blast' ? '#ff8a3c' : kind === 'melee' ? '#ff6a6a' : '#f2f2ea';
    const n = String(Math.max(1, Math.round(dmg)));
    this.numbers.push({ text: kind === 'crit' ? `CRIT ${n}!` : n, x: v.x + rand(-5, 5), y: v.y - 34, t: 0, color, big: kind === 'head' || kind === 'crit' || dmg >= 60 });
    if (v.dummy) stats.record(dmg, kind);
  },
  // G: a weapon thrown at someone - it spins, hits for a knock, then lands to be picked up
  throwWeapon(f, thing, x, y, vx, vy) {
    this.thrown.push({ ...thing, x, y, vx, vy, rot: 0, vrot: (Math.sign(vx) || 1) * 18, owner: f, t: 0, hit: new Set() });
  },
  time: 0,
  // line of sight through the level (catwalks don't block it)
  los(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 2);
    for (let i = 1; i < n; i++) if (level.solidAt(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n)) return false;
    return true;
  },
  fireBullet(f, x, y, a, speed, dmg, range, pierce) {
    const s = f.shoulder;
    if (!this.los(s.x, s.y, x, y)) {
      this.fx.sparks(x, y, 3, -Math.cos(a), -Math.sin(a));   // the gun's poked into a wall
      return;
    }
    this.bullets.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, speed, owner: f, dmg, left: range, travelled: 0, pierce, done: new Set(), dead: false });
  },
  // the main game's muzzle: a flash of light, a puff of smoke off the barrel, the camera kicked back
  muzzle(x, y, a, w, f) {
    this.lights.flash(x, y, w.suppressed ? 30 : 64, '255, 205, 140', w.suppressed ? 0.03 : 0.06);
    if (!w.suppressed) this.fx.gunSmoke(x, y, Math.cos(a), Math.sin(a), w.def.pellets ? 5 : 2);
    if (f === player) renderer.kick(-Math.cos(a) * w.shake, -Math.sin(a) * w.shake);
    if (!w.suppressed) for (const b of bots) b.hear(x, y, f);   // gunfire gives you away
  },
  // A melee swing / thrust / punch landing (the main game's rules): everything in
  // its reach and arc for a slash, the nearest thing in line for a thrust or a
  // punch. A fighter hit while shooting has the gun knocked out of their hands.
  meleeHit(f, m) {
    const d = m.def, o = f.aimOrigin(), nx = Math.cos(f.aim), ny = Math.sin(f.aim);
    let targets = [];
    for (const v of this.fighters) {
      if (!v.alive || m.hits.has(v) || !this.foes(f, v)) continue;
      const tx = v.x, ty = v.y - (v.roll ? 7 : 14), dist = Math.hypot(tx - o.x, ty - o.y);
      if (dist > m.reach + 8) continue;
      const da = Math.abs(wrap(Math.atan2(ty - o.y, tx - o.x) - f.aim));
      if (da > m.arc / 2 && dist > 12) continue;   // right up close always counts
      targets.push({ v, dist });
    }
    if (m.single) targets = targets.sort((a, b) => a.dist - b.dist).slice(0, 1);
    const MUL = 1.5;   // melee hits harder here than it does on zombies (fighters have a lot of health)
    for (const { v } of targets) {
      m.hits.add(v);
      // the cloak's knife in someone's back (facing away when the stab started): a critical
      const back = d.cloak && f.cloak?.backstab === v;
      v.hitHow = back ? 'BACKSTAB' : d.fists ? 'FISTS' : d.name;
      const knock = d.knock * (m.step === 2 ? 1.4 : 1) * 1.6;
      // knocked out of their hands if they were shooting
      const shooting = v.weapon && (v.lastFireT < 0.7 || v.triggerHeld);
      if (!v.hurt(m.damage * MUL * (back ? BACKSTAB : 1), f, nx * knock, -60 - knock * 0.25)) continue;
      if (back) this.fx.sparks(v.x, v.y - 16, 10, nx, -0.4, '#ff5a4a');
      this.fx.blood(v.x, v.y - 14, d.fists ? 4 : 8, nx, ny);
      if (shooting && v.alive) this.disarm(v, nx);
    }
    if (targets.length && (f === player || targets.some((t) => t.v === player))) renderer.kick(nx * 2.5, ny * 2.5);
    // crates and drums in reach
    for (const p of this.props) {
      if (p.dead || m.hits.has(p)) continue;
      if (Math.hypot(p.x - (o.x + nx * d.reach * 0.6), p.y - p.h / 2 - (o.y + ny * d.reach * 0.6)) > d.reach * 0.6 + 8) continue;
      m.hits.add(p);
      this.fx.impact(p.x, p.y - p.h / 2, -nx, -ny, 4);
      this.damageProp(p, m.damage, f, nx * d.knock * 0.9, -60);
    }
  },
  // A gun knocked loose: it flies off and lands as a pickup anyone can grab.
  disarm(v, dir) {
    const w = v.dropGun();
    if (!w) return;
    this.pickups.push({ kind: 'gun', key: w.def.key, ammo: w.ammo, reserve: w.reserve, x: v.x, y: v.y - 14, vx: dir * 110 + rand(-20, 20), vy: -170, beam: 0, life: 25, bob: 0, ready: false, noGrab: 0.5 });
    this.fx.sparks(v.x + dir * 6, v.y - 10, 8, dir, -0.5);
    if (v === player) banner = { text: 'DISARMED!', t: 0.9, color: '#ff8a6a' };
  },
  throwGrenade(f, x, y, vx, vy, kind = 'frag') {
    this.grenades.push({ x, y, vx, vy, t: kind === 'impact' ? 4 : 1.6, owner: f, rot: 0, vrot: Math.sign(vx || 1) * 12, kind, age: 0 });
  },
  onDeath(f, killer, how) {
    if (killer?.isDecoy) killer = killer.owner;   // (a shadow clone's kill is its owner's)
    how = how ?? f.hitHow ?? (killer?.weapon ? killer.weapon.def.name : 'FISTS');
    if (f.melee && !f.melee.def.fists) this.pickups.push({ kind: 'melee', key: f.melee.def.key, x: f.x, y: f.y - 12, vx: rand(-60, 60), vy: -150, beam: 0, life: 20, bob: 0, ready: false });
    if (killer && killer !== f) killer.kills++;
    if (state === 'fight' || state === 'intro') {
      f.deaths = (f.deaths ?? 0) + 1;
      f.lives = Math.max(0, (f.lives ?? 1) - 1);
      if (f.lives > 0 && !overtime) f.respawnT = RESPAWN_TIME;
    }
    this.feed.push({ killer: killer && killer !== f ? killer : null, victim: f, how, t: 5 });
    if (this.feed.length > 5) this.feed.shift();
    if (how !== 'MELTED') this.fx.blood(f.x, f.y - 12, 22, Math.sign(f.vx) || 0, -0.6);
    else { this.fx.smoke(f.x, f.y - 4, 10); this.fx.sparks(f.x, f.y - 2, 10, 0, -1, '#9aff6a'); }
    if (f === player) renderer.kick(rand(-4, 4), -4);
  },

  // A prop hit (and knocked about); broken, it bursts into whatever it's made of.
  damageProp(p, dmg, from, kx = 0, ky = 0) {
    if (p.dead) return;
    p.hp -= dmg;
    p.flash = 0.06;
    if (kx || ky) p.push(kx, ky);
    if (p.hp > 0) return;
    p.dead = true;
    p.solid = false;
    const cx = p.x, cy = p.y - p.h / 2, n = Math.min(26, Math.round(6 + (p.w * p.h) / 24));
    if (p.explosive) return this.explode(cx, cy, from, 58, 150);
    this.fx.debris(cx, cy, n, DEBRIS[p.material] ?? DEBRIS.wood, 0.8);
    this.fx.dust(cx, p.y, 8);
    if (p.material === 'glass') this.fx.sparks(cx, cy, 10, 0, -0.5, '#c8f0ff');
    if (p.kind === 'cooler') this.fx.sparks(cx, cy, 16, 0, -1, '#6cc0e8');   // a burst of water
    if ((p.kind === 'wcrate' || p.kind === 'crate') && Math.random() < 0.4 && settings.drops > 0 && state !== 'training') this.spawnPickup(cx, p.y, true);   // sometimes something inside
  },

  explode(x, y, owner, r = 54, dmg = 135) {
    const fx = this.fx;
    fx.fire(x, y, 46);
    fx.smoke(x, y, 16, true);
    fx.sparks(x, y, 26, 0, -1, '#ffb84a');
    fx.debris(x, y, 10, ['#2b3a37', '#46584f', '#a9b8ae'], 1);
    fx.scorch(x, y + 6, 30);
    this.lights.flash(x, y, 190, '255, 170, 90', 0.4);
    this.blasts.push({ x, y, r, t: 0 });
    for (const o of this.fighters) {
      if (!o.alive) continue;
      const dx = o.x - x, dy = o.y - 12 - y, d = Math.hypot(dx, dy);
      if (d > r * 1.6 || !this.los(x, y, o.x, o.y - 12)) continue;
      const k = 1 - d / (r * 1.6), n = d || 1;
      o.hitHow = 'GRENADE';
      o.blast = true;
      o.hurt(dmg * Math.min(1, k * 1.25), owner, (dx / n) * 430 * k, (dy / n) * 300 * k - 220 * k);
      o.blast = false;
    }
    for (const p of this.props) {
      if (p.dead) continue;
      const d = Math.hypot(p.x - x, p.y - p.h / 2 - y);
      if (d < r * 1.6) {
        // everything nearby is thrown about; drums go up a moment later
        const k = 1 - d / (r * 1.6), n = d || 1;
        p.push(((p.x - x) / n) * 320 * k, -260 * k);
        if (p.explosive) { if (p.fuse < 0) p.fuse = 0.12 + Math.random() * 0.1; p.owner = owner; }
        else if (d < r * 1.3) this.damageProp(p, 90 * (1 - d / (r * 1.3)) + 20, owner);
      }
    }
    for (const l of this.lights.lamps) if (l.on && Math.hypot(l.x - x, l.y - y) < r * 0.7) { l.on = false; fx.sparks(l.x, l.y, 8, 0, 1, '#fff6d0'); }
    const cam = renderer.camera, near = Math.max(0, 1 - Math.hypot(cam.x - x, cam.y - y) / 400);
    renderer.kick(rand(-1, 1) * 8 * near, -6 * near);
  },

  // A crate of something beamed in (or found in a smashed crate).
  spawnPickup(x, y, dropped = false) {
    if (x === undefined) {
      const spots = this.nav.standable.filter((n) => !this.fighters.some((f) => f.alive && Math.abs(f.x - (n.cx + 0.5) * T) < 40 && Math.abs(f.y - (n.cy + 1) * T) < 30) && !this.pickups.some((p) => Math.abs(p.x - (n.cx + 0.5) * T) < 48 && Math.abs(p.y - (n.cy + 1) * T) < 20));
      const n = pick(spots);
      if (!n) return;
      x = (n.cx + 0.5) * T;
      y = (n.cy + 1) * T;
    }
    const roll = Math.random(), pool = settings.pool;
    let kind = roll < 0.7 ? (pool === 'guns' ? 'gun' : pool === 'melee' ? 'melee' : Math.random() < 0.68 ? 'gun' : 'melee') : roll < 0.87 ? 'health' : 'nades';
    const p = { kind, x, y: y - (dropped ? 4 : 18), vy: dropped ? -120 : 0, vx: dropped ? rand(-40, 40) : 0, beam: dropped ? 0 : 0.8, life: 30, bob: Math.random() * 6 };
    if (kind === 'gun') p.key = pick(GUN_POOL);
    if (kind === 'melee') p.key = pick(MELEE_POOL);
    if (kind === 'nades') p.nade = Math.random() < 0.6 ? 'frag' : 'impact';
    if (!dropped) this.fx.sparks(x, y - 20, 10, 0, 0.5, '#8ff0ff');
    this.pickups.push(p);
  },
};
let player = null;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------- fighters ----------

const ROSTER = [
  { name: 'YOU', color: '#e8e2d0', hue: 0, sat: 1, skill: 'grapple' },   // the starting character: a grapple line on Q
  { name: 'VEX', color: '#ff6a5a', hue: 150, sat: 1.3, bot: true },
  { name: 'KORA', color: '#6ad8ff', hue: 210, sat: 1.2, bot: true },
  { name: 'DUKE', color: '#c8ff5a', hue: 290, sat: 1.1, bot: true },
];
let bots = [];
// the two sides, and what they wear (their shirts recoloured blue or red, so a side's plain to see)
const TEAMS = [{ name: 'BLUE', color: '#6ad8ff', look: { hue: 210, sat: 1.2 } }, { name: 'RED', color: '#ff6a5a', look: { hue: 8, sat: 1.7 } }];

function makeFighters() {
  const teams = settings.mode === 'teams', n = teams ? 3 : settings.bots;
  game.fighters = ROSTER.slice(0, n + 1).map((r, i) => {
    // teams: you and VEX against KORA and DUKE; otherwise everyone for themselves
    const team = teams ? (i < 2 ? 0 : 1) : i;
    const look = { ...r, skill: r.bot ? botSkill() : settings.myskill };
    const f = new Fighter(game, images, teams ? { ...look, ...TEAMS[team].look } : look);
    f.team = team;
    return f;
  });
  player = game.fighters[0];
  if (!settings.skills) for (const f of game.fighters) f.skill = null;
  bots = game.fighters.filter((f) => f.bot).map((f, i) => new Bot(game, f, (0.85 + i * 0.12) * settings.skill));
}
// a bot's skill, by the setting: the one picked, or one at random
const BOT_SKILLS = ['cloak', 'decoy', 'archery', 'murasaki', 'blaze', 'galaxy', 'demon'];
const botSkill = () => (settings.botskill === 'random' ? pick(BOT_SKILLS) : settings.botskill ?? null);
const teamMode = () => settings.mode === 'teams' && state !== 'training';   // (training's just you and the dummies, whatever the room says)
const tagColor = (f) => (teamMode() ? TEAMS[f.team]?.color ?? f.color : f.color);

// ---------- rounds ----------

let state = 'menu';   // menu (the main menu) | soon (a mode not built yet) | title (room setup) | intro | fight | end | match
let paused = false;
let round = 0, roundT = 0, stateT = 0, slow = 1, banner = null, overtime = false;
let winner = null, champion = null, pickupT = 0;

function startRound() {
  round++;
  roundT = 0;
  overtime = false;
  state = 'intro';
  stateT = 0;
  game.bullets = [];
  game.blasts = [];
  game.grenades = [];
  game.pickups = [];
  game.feed = [];
  game.thrown = [];
  game.arrows = [];
  game.voids = [];
  game.fists = [];
  game.galaxies = [];
  game.demons = [];
  game.punches = [];
  game.numbers = [];
  game.fx = new Fx(level);
  game.lights = new Lights(level);
  game.props = placeProps(level.props, level);
  clearDecoys();
  // everyone to a spot of their own, shuffled - in TEAMS, each side on its own half of the map
  const sides = new Map();
  for (const f of game.fighters) {
    const key = teamMode() ? f.team : 'all';
    if (!sides.has(key)) sides.set(key, []);
    sides.get(key).push(f);
  }
  for (const [key, list] of sides) {
    const spots = spawnSpots(key).sort(() => Math.random() - 0.5);
    list.forEach((f, i) => {
      const s = spots[i % spots.length];
      spawnAt(f, s.x + Math.floor(i / spots.length) * 12, s.y);
      f.lives = settings.lives;
      f.respawnT = 0;
    });
  }
  for (const b of bots) b.reset();
  if (settings.drops > 0) for (let i = 0; i < 3; i++) game.spawnPickup();
  for (const p of game.pickups) p.beam = 0;
  pickupT = 4 / Math.max(0.5, settings.drops);
  banner = { text: `ROUND ${round}`, sub: game.fighters.map((f) => `${f.name} ${f.wins}`).join('   '), t: 1.4, color: '#e8e2d0' };
}

// Where a side starts and comes back: in TEAMS, BLUE (0) the map's left half and RED (1) its right; otherwise anywhere.
function spawnSpots(team) {
  const all = [...level.spawns];
  if (!teamMode() || (team !== 0 && team !== 1)) return all;
  const half = all.filter((s) => (s.x < PW / 2) === (team === 0));
  return half.length ? half : all;
}

// A fighter in at (x, y) with the room's loadout.
function spawnAt(f, x, y) {
  f.reset(x, y);
  const L = game.loadout();
  if (L.melee) f.giveMelee(MELEE[L.melee]);
  while (f.hits(f.x - 5, f.y - 28, f.x + 5, f.y)) f.y -= 1;   // spawned in a crate: stand on it
  f.hitHow = null;
}

// ---------- lives ----------
// With lives to spare, a fighter who goes down is beamed back in a couple of
// seconds later, at the spawn point furthest from anyone who'd want them dead,
// with the round's starting kit and a shield for a moment (gone the moment
// they attack). Out of lives, they're out of the round.
const RESPAWN_TIME = 2, SPAWN_SHIELD = 2;
function updateRespawns(dt) {
  for (const f of game.fighters) {
    if (f.alive || !(f.respawnT > 0) || (f.respawnT -= dt) > 0) continue;
    f.respawnT = 0;
    const foes = game.fighters.filter((o) => o.alive && !o.isDecoy && game.foes(f, o));
    const far = (s) => Math.min(9999, ...foes.map((o) => Math.hypot(o.x - s.x, o.y - s.y)));
    const s = spawnSpots(f.team).sort((a, b) => far(b) - far(a))[0];
    spawnAt(f, s.x, s.y);
    f.shield = SPAWN_SHIELD;
    f.beamT = 0;
    bots.find((b) => b.f === f)?.reset();
    game.fx.sparks(f.x, f.y - 14, 16, 0, -1, '#8ff0ff');
    game.lights.flash(f.x, f.y - 14, 90, '120, 230, 255', 0.25);
  }
}
// After the lighting: the beam that brings someone back, and the shield
// round them after - a ring of light turning round them, flickering as it runs out.
function drawShields(ctx) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const f of game.fighters) {
    if (!f.alive) continue;
    if (f.beamT !== undefined && f.beamT < 0.6) {
      const k = f.beamT / 0.6, w = 2 + 10 * (1 - k);
      const gr = ctx.createLinearGradient(0, f.y - 90, 0, f.y + 4);
      gr.addColorStop(0, 'rgba(120, 230, 255, 0)');
      gr.addColorStop(0.75, `rgba(170, 245, 255, ${0.7 * (1 - k)})`);
      gr.addColorStop(1, 'rgba(170, 245, 255, 0)');
      ctx.fillStyle = gr;
      ctx.fillRect(Math.round(f.x - w / 2), f.y - 90, Math.round(w), 94);
    }
    if (!(f.shield > 0) || f.vanish || (f.cloak && f !== player)) continue;
    if (f.shield < 0.6 && Math.floor(game.time * 20) % 2) continue;   // running out: flickering
    const fade = Math.min(1, f.shield / 0.6), cx = f.x, cy = f.y - 14, R = 18;
    ctx.fillStyle = `rgba(110, 220, 255, ${0.08 * fade})`;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2, lit = Math.cos(a - game.time * 5) > 0.6;
      ctx.fillStyle = lit ? `rgba(220, 250, 255, ${0.9 * fade})` : `rgba(110, 220, 255, ${0.45 * fade})`;
      ctx.fillRect(Math.round(cx + Math.cos(a) * R), Math.round(cy + Math.sin(a) * R), 1, 1);
    }
  }
  ctx.restore();
}

function startMatch() {
  loadMap(settings.map === 'random' ? pick(MAP_KEYS) : settings.map);
  makeFighters();
  round = 0;
  for (const f of game.fighters) { f.wins = 0; f.kills = 0; f.deaths = 0; }
  champion = null;
  startRound();
  hintEl.classList.remove('fade');
  setTimeout(() => hintEl.classList.add('fade'), 9000);
}

function updateRounds(dt, realDt) {
  stateT += realDt;
  if (state === 'training') { slow = 1; return; }   // (not still in the slow-motion of a round that ended)
  if (state === 'intro' && stateT > 1.6) {
    state = 'fight';
    banner = { text: 'FIGHT!', t: 0.8, color: '#ffd25a' };
  }
  if (state === 'fight') {
    roundT += dt;
    if (settings.time && roundT > settings.time && !overtime) {
      overtime = true;
      banner = { text: 'OVERTIME', sub: settings.lives > 1 ? 'THE LAB IS VENTING - NO MORE COMING BACK' : 'THE LAB IS VENTING - EVERYONE IS LOSING HP', t: 2, color: '#ff6a5a' };
    }
    if (overtime) for (const f of game.fighters) if (f.alive) {
      f.hp -= 9 * dt;
      if (f.hp <= 0) f.die(null, 'GAS', 0, 0);
    }
    updateRespawns(dt);
    const alive = game.fighters.filter((f) => (f.alive || f.respawnT > 0) && !f.isDecoy), sides = new Set(alive.map((f) => f.team));
    if (sides.size <= 1) {
      state = 'end';
      stateT = 0;
      winner = alive.find((f) => f.alive) ?? alive[0] ?? null;
      // the whole winning side scores (the dead teammates too)
      if (winner) for (const f of game.fighters) if (f.team === winner.team) f.wins++;
    }
  }
  if (state === 'end') {
    slow = stateT < 1.1 ? 0.3 : 1;
    if (stateT > 1.1 && !banner) {
      const text = !winner ? 'DRAW' : teamMode() ? `${TEAMS[winner.team].name} TEAM WINS THE ROUND` : `${winner.name === 'YOU' ? 'YOU WIN' : winner.name + ' WINS'} THE ROUND`;
      banner = { text, sub: game.fighters.map((f) => `${f.name} ${f.wins}`).join('   '), t: 2.2, color: winner ? tagColor(winner) : '#e8e2d0' };
    }
    if (stateT > 3.6) {
      champion = game.fighters.find((f) => f.wins >= settings.wins) ?? null;
      if (champion) { state = 'match'; stateT = 0; banner = null; }
      else startRound();
    }
  } else slow = 1;
}

// ---------- player controls ----------

function mouseWorld() {
  return renderer.screenToWorld(input.mouse.x, input.mouse.y);
}

// S tapped twice quickly drops through the catwalk underfoot
let lastDownTap = -9;
function dropTap() {
  if (!input.wasPressed('KeyS', 'ArrowDown')) return false;
  const now = performance.now() / 1000, twice = now - lastDownTap < 0.3;
  lastDownTap = twice ? -9 : now;
  return twice;
}

// A direction tapped twice quickly (A A / D D) starts a run. It keeps running
// as long as either direction is held - turning round included - and ends
// once you stop (nothing held for a moment).
const lastTap = { KeyA: -9, KeyD: -9 };
let run = false, runIdle = 0;
function running() {
  const now = performance.now() / 1000;
  for (const k of ['KeyA', 'KeyD']) if (input.wasPressed(k)) {
    if (now - lastTap[k] < 0.28) run = true;
    lastTap[k] = now;
  }
  // (a brief gap between letting go of one key and pressing the other doesn't count)
  if (input.down('KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight')) runIdle = game.time;
  else if (game.time - runIdle > 0.12) run = false;
  return run;
}

function playerControl() {
  const f = player, ladder = f.overLadder();
  const c = {
    move: (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0),
    up: input.down('KeyW', 'ArrowUp'),
    down: input.down('KeyS', 'ArrowDown'),
    jump: input.wasPressed('Space') || (input.wasPressed('KeyW', 'ArrowUp') && !ladder && !f.onLadder),
    jumpHeld: input.down('Space', 'KeyW', 'ArrowUp'),
    fire: input.mouse.down,
    aim: null,
    reload: input.wasPressed('KeyR'),
    sprint: running(),
    roll: input.wasPressed('ShiftLeft', 'ShiftRight'),
    target: null,
    melee: input.wasPressed('KeyF', 'Mouse2'),
    meleeHeld: input.down('KeyF') || rightHeld,   // held: keep punching
    skill: input.wasPressed('KeyQ'),
    crouch: input.down('KeyS', 'ArrowDown') && !f.ladderBelow() && !f.onLadder && !f.overLadder(),
    drop: dropTap(),
    throwWeapon: input.wasPressed('KeyG'),       // G throws what's in hand; grenades are slot 3
    pickup: input.wasPressed('KeyE'),
    slot: [1, 2, 3].find((n) => input.wasPressed('Digit' + n)) ?? 0,
    cycle: Math.sign(input.wheel),
  };
  if (input.mouse.active) {
    const m = mouseWorld(), s = f.shoulder;
    c.aim = Math.atan2(m.y - s.y, m.x - s.x);
    c.target = m;   // the gun zeroes on the cursor, like the main game
  } else if (c.move) c.aim = c.move > 0 ? 0 : Math.PI;
  return c;
}
// the right mouse button held down (the input only tracks the left one)
let rightHeld = false;
canvas.addEventListener('pointerdown', (e) => { if (e.button === 2) rightHeld = true; });
addEventListener('pointerup', (e) => { if (e.button === 2) rightHeld = false; });
addEventListener('blur', () => (rightHeld = false));
const IDLE = { move: 0, up: false, down: false, jump: false, jumpHeld: false, fire: false, aim: null, reload: false, roll: false, melee: false, grenade: false, pickup: false, slot: 0, cycle: 0 };

// ---------- shadow clones ----------
// A double made by the shadow clone skill: a bot, but a poor one - its aim
// swings round slowly (anyone quick gets away from it), it only gets a shot
// off now and then, and it never throws, rolls or picks anything up.

let decoys = [];
function clearDecoys() {
  for (const d of decoys) if (d.f.owner) d.f.owner.decoy = null;
  game.fighters = game.fighters.filter((f) => !f.isDecoy);
  decoys = [];
}
function decoyControl(d, dt) {
  const c = d.bot.control(dt), f = d.f;
  if (c.aim !== null && c.aim !== undefined) {
    const diff = wrap(c.aim - d.aim);
    d.aim += Math.sign(diff) * Math.min(Math.abs(diff), 2.4 * dt);
    c.aim = d.aim;
    c.target = null;
  }
  d.fireT -= dt;
  if (c.fire && d.fireT <= 0) d.fireT = rand(0.5, 0.9);
  else c.fire = false;
  return { ...c, grenade: false, roll: false, skill: false, pickup: false, throwWeapon: false, sprint: false };
}
function updateDecoys(dt, live) {
  for (const d of decoys) {
    const f = d.f;
    if (f.vanish) {
      f.update(dt, IDLE);
      if ((f.vanish -= dt) <= 0) d.gone = true;
      continue;
    }
    f.update(dt, live ? decoyControl(d, dt) : IDLE);
    // a wisp of shadow off it now and then
    if ((d.wispT -= dt) <= 0) { d.wispT = rand(0.15, 0.35); game.fx.wisp(f.x + rand(-4, 4), f.y - rand(0, 20), f.owner); }   // (only its maker sees the wisps)
  }
  if (decoys.some((d) => d.gone)) {
    const gone = new Set(decoys.filter((d) => d.gone).map((d) => d.f));
    game.fighters = game.fighters.filter((f) => !gone.has(f));
    decoys = decoys.filter((d) => !d.gone);
  }
}

// ---------- archery ----------
// The archery skill's shot: one arrow of light up into the air that bursts
// (a flash, a ring) into an arrow for each foe that was locked on - fanned out
// and then curving round after them. They turn only so fast, so a quick foe
// can get out of the way (or roll under one); walls stop them, and each one
// stops in the first foe it hits.

const ARROW_DMG = 55, ARROW_SPEED = 560, ARROW_TURN = 6;   // per arrow; px/s at full speed; how fast one can turn (rad/s)
const ARROW_DRAIN = 2;   // hit by one: no stamina for this long
function loose(f, targets, point) {
  // straight up from the bow to the burst point (where the lasers came from)
  const h = f.bowHand;
  game.arrows.push({ kind: 'sky', owner: f, x: h.x, y: h.y - 4, vx: 0, vy: -720, t: 0, trail: [], targets, top: point?.y ?? h.y - 70 });
  game.fx.sparks(h.x, h.y - 4, 8, 0, -1, '#9cff9c');
}
function burstArrow(o) {
  o.dead = true;
  // (ran into the ceiling: burst a step back, out in the open)
  while (level.solidAt(o.x, o.y) && o.trail.length) ({ x: o.x, y: o.y } = o.trail.shift());
  game.arrows.push({ kind: 'ring', x: o.x, y: o.y, t: 0 });
  game.fx.sparks(o.x, o.y, 16, 0, 0, '#b8ffc0');
  game.lights.flash(o.x, o.y, 60, '120, 255, 140', 0.12);
  const targets = o.targets.length ? o.targets : null, n = targets ? targets.length : 5, f = o.owner;
  for (let i = 0; i < n; i++) {
    // each one sets off roughly at its own, fanned a little, then turns after it
    const spread = n > 1 ? (i / (n - 1) - 0.5) * 1.2 : 0;
    const point = targets ? null : { x: o.x + f.facing * rand(20, 160), y: o.y + 300 };   // none locked: a few come down ahead anyway
    const goal = targets ? { x: targets[i].x, y: targets[i].y - 14 } : point, a = Math.atan2(goal.y - o.y, goal.x - o.x) + spread;
    game.arrows.push({ kind: 'seek', owner: f, target: targets?.[i] ?? null, point, x: o.x, y: o.y, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240, t: 0, trail: [] });
  }
}
function arrowHit(o, v) {
  o.dead = true;
  v.hitHow = 'ARROW';
  const sp = Math.hypot(o.vx, o.vy) || 1;
  if (v.hurt(ARROW_DMG, o.owner, (o.vx / sp) * 120, -80)) {
    game.fx.blood(v.x, v.y - 14, 6, o.vx / sp, o.vy / sp);
    // pinned: out of breath - no stamina at all (no running, no rolling) for ARROW_DRAIN s, then it refills as usual
    v.stamina = 0;
    v.winded = true;
    v.boostT = 0;
    v.staminaRest = Math.max(v.staminaRest, ARROW_DRAIN);
  }
  game.fx.sparks(o.x, o.y, 10, -o.vx / sp, -o.vy / sp, '#9cff9c');
  game.arrows.push({ kind: 'ring', x: o.x, y: o.y, t: 0, small: true });
}
function updateArrows(dt) {
  for (const o of game.arrows) {
    o.t += dt;
    if (o.kind === 'ring') { if (o.t > 0.3) o.dead = true; continue; }
    o.trail.unshift({ x: o.x, y: o.y });
    o.trail.length = Math.min(o.trail.length, 9);
    if (o.kind === 'sky') {
      o.y = Math.max(o.top, o.y + o.vy * dt);
      if (o.y <= o.top || o.t > 0.4 || level.solidAt(o.x, o.y)) burstArrow(o);
      continue;
    }
    // seeking: after a moment, turn toward the target (where it is now), at a limited rate
    const goal = o.target?.alive && !o.target.vanish ? { x: o.target.x, y: o.target.y - 14 } : o.point ?? null;
    let a = Math.atan2(o.vy, o.vx), sp = Math.hypot(o.vx, o.vy);
    if (goal && o.t > 0.06) {
      const want = Math.atan2(goal.y - o.y, goal.x - o.x), diff = wrap(want - a);
      a += Math.sign(diff) * Math.min(Math.abs(diff), ARROW_TURN * dt);
    }
    sp = Math.min(ARROW_SPEED, sp + 1500 * dt);
    o.vx = Math.cos(a) * sp;
    o.vy = Math.sin(a) * sp;
    // in small steps: walls stop it, the first foe it meets takes it
    const n = Math.ceil((sp * dt) / 3);
    for (let i = 0; i < n && !o.dead; i++) {
      o.x += (o.vx * dt) / n;
      o.y += (o.vy * dt) / n;
      if (level.solidAt(o.x, o.y)) { o.dead = true; game.fx.sparks(o.x, o.y, 6, -o.vx / sp, -o.vy / sp, '#9cff9c'); break; }
      const v = game.fighters.find((q) => q !== o.owner && q.alive && !q.vanish && game.foes(o.owner, q) && q.hitPart(o.x, o.y));
      if (v) arrowHit(o, v);
    }
    if (o.t > 2.5 || o.y > PH + 40) o.dead = true;
  }
  game.arrows = game.arrows.filter((o) => !o.dead);
}
// After the lighting: arrows of light (a white head, a green body, a fading
// green trail and a soft glow), and the rings where they burst and hit.
function drawArrows(ctx) {
  for (const o of game.arrows) {
    if (o.kind === 'ring') {
      const k = o.t / 0.3, R = (o.small ? 4 : 6) + k * (o.small ? 10 : 22);
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = k < 0.3 ? '#e8ffe8' : '#5aff7a';
      for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; ctx.fillRect(Math.round(o.x + Math.cos(a) * R), Math.round(o.y + Math.sin(a) * R), 1, 1); }
      continue;
    }
    o.trail.forEach((p, i) => {
      ctx.globalAlpha = 0.6 * (1 - i / o.trail.length);
      ctx.fillStyle = i < 3 ? '#9cff9c' : '#2ad05a';
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    });
    const sp = Math.hypot(o.vx, o.vy) || 1, ux = o.vx / sp, uy = o.vy / sp;
    ctx.globalAlpha = 1;
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i < 2 ? '#ffffff' : '#7aff8a'; ctx.fillRect(Math.round(o.x - ux * i), Math.round(o.y - uy * i), 1, 1); }
    ctx.fillStyle = '#d8ffd8';
    ctx.fillRect(Math.round(o.x - ux * 2 - uy * 1.5), Math.round(o.y - uy * 2 + ux * 1.5), 1, 1);
    ctx.fillRect(Math.round(o.x - ux * 2 + uy * 1.5), Math.round(o.y - uy * 2 - ux * 1.5), 1, 1);
    const gr = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, 7);
    gr.addColorStop(0, 'rgba(150, 255, 160, 0.5)');
    gr.addColorStop(1, 'rgba(60, 255, 110, 0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = gr;
    ctx.fillRect(o.x - 7, o.y - 7, 14, 14);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ---------- murasaki ----------
// The murasaki skill's shot: the purple orb, straight down the aim, picking up
// speed. Nothing stops it - it goes through walls - and anyone it passes
// through takes a terrible hit and is flung along with it; crates and drums in
// its way are gone. A beam of purple light runs back along the way it came,
// lightning crackles off it, the screen shakes; when it's run its course it
// fades out and the beam with it, leaving a drift of purple behind.

const VOID_DMG = 150, VOID_RANGE = 540, VOID_SPEED = 470, VOID_R = 16;
function updateVoids(dt) {
  for (const o of game.voids) {
    o.t += dt;
    if (o.done >= 0) { o.done += dt; continue; }
    const ux = Math.cos(o.a), uy = Math.sin(o.a);
    o.sp = Math.min(VOID_SPEED, o.sp + 1600 * dt);
    const step = o.sp * dt;
    o.x += ux * step;
    o.y += uy * step;
    o.dist += step;
    for (const v of game.fighters) {
      if (v === o.owner || !v.alive || v.vanish || o.hit.has(v) || !game.foes(o.owner, v)) continue;
      if (Math.hypot(v.x - o.x, v.y - 14 - o.y) > VOID_R + 9) continue;
      o.hit.add(v);
      v.hitHow = 'MURASAKI';
      if (v.hurt(VOID_DMG, o.owner, ux * 320, -160 + uy * 120)) game.fx.blood(v.x, v.y - 14, 14, ux, uy);
      game.fx.sparks(v.x, v.y - 14, 12, ux, uy, '#d8a0ff');
    }
    for (const p of game.props) if (!p.dead && Math.hypot(p.x - o.x, p.y - p.h / 2 - o.y) < VOID_R + p.w / 2) game.damageProp(p, 999, o.owner, ux * 200, -80);
    if (Math.random() < 0.6) game.fx.motes(o.x - ux * 6, o.y - uy * 6, 1, ['#b060ff', '#e0b0ff', '#ffffff']);
    if (o.owner === player || Math.hypot(player.x - o.x, player.y - o.y) < 160) renderer.kick((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
    if (o.dist > VOID_RANGE || o.x < -40 || o.x > PW + 40 || o.y < -40 || o.y > PH + 40) {
      o.done = 0;
      game.fx.sparks(o.x, o.y, 18, ux, uy, '#d8a0ff');
      game.fx.motes(o.x, o.y + 14, 14, ['#b060ff', '#e0b0ff', '#7a3ad0']);
      game.lights.flash(o.x, o.y, 70, '170, 70, 255', 0.2);
    }
  }
  game.voids = game.voids.filter((o) => o.done < 0.7);
}
// After the lighting: the beam back along its path (a wide soft purple, a
// brighter band, a white core, all fading as it ends), the orb and its lightning.
function drawVoids(ctx) {
  for (const o of game.voids) {
    const fade = o.done < 0 ? 1 : 1 - o.done / 0.7;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const [w, col] of [[30, `rgba(150, 50, 255, ${0.14 * fade})`], [16, `rgba(190, 110, 255, ${0.28 * fade})`], [7, `rgba(230, 180, 255, ${0.5 * fade})`], [2.5, `rgba(255, 255, 255, ${0.8 * fade})`]]) {
      const gr = ctx.createLinearGradient(o.x0, o.y0, o.x, o.y);
      gr.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gr.addColorStop(0.35, col);
      gr.addColorStop(1, col);
      ctx.strokeStyle = gr;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(o.x0, o.y0);
      ctx.lineTo(o.x, o.y);
      ctx.stroke();
    }
    ctx.restore();
    if (o.done < 0) {
      drawVoidHole(ctx, ctx, o.x, o.y, VOID_R, game.time, o.seed ??= Math.random() * 9, (o.pix ??= {}));
      drawBolts(ctx, o.x, o.y, VOID_R, 6, game.time, 26);
    } else if (o.done < 0.25) {
      // gone out: the orb collapsing
      drawVoidHole(ctx, ctx, o.x, o.y, VOID_R * (1 - o.done / 0.25), game.time, o.seed ?? 0, (o.pix ??= {}));
      drawBolts(ctx, o.x, o.y, 3, 3, game.time, 16);
    }
  }
}

// ---------- flame fist ----------
// Where the flame fist lands (on someone, a wall, or just the air at the end of
// its dash) it all goes up: anyone else close by is caught in it and thrown
// back, crates and drums nearby are smashed or set off, and the blast itself
// (see flame.js) - a flash, a fireball, a ring of fire, tongues of flame - with
// sparks, smoke, a scorch on whatever it hit and the screen shaking.

const FIST_SPLASH = 45, FIST_R = 44, FIST_LIFE = 0.6;
function flameFist(f, x, y, a, v) {
  const fx = game.fx, ux = Math.cos(a), uy = Math.sin(a);
  game.fists.push({ x, y, ax: ux, ay: uy, t: 0, seed: Math.random() * 100 });
  for (const o of game.fighters) {
    if (o === f || o === v || !o.alive || o.vanish || !game.foes(f, o)) continue;
    const dx = o.x - x, dy = o.y - 14 - y, d = Math.hypot(dx, dy);
    if (d > FIST_R || !game.los(x, y, o.x, o.y - 14)) continue;
    const k = 1 - d / FIST_R, n = d || 1;
    o.hitHow = 'FLAME FIST';
    o.blast = true;
    o.hurt(FIST_SPLASH * (0.4 + 0.6 * k), f, (dx / n) * 320 * k, -160 * k);
    o.blast = false;
  }
  for (const p of game.props) {
    if (p.dead) continue;
    const d = Math.hypot(p.x - x, p.y - p.h / 2 - y);
    if (d < FIST_R + p.w / 2) game.damageProp(p, p.explosive ? 999 : 120, f, ux * 260, -120);
  }
  fx.fire(x, y, 10);
  fx.smoke(x, y, 10, true);
  fx.sparks(x, y, 22, ux, uy, '#ffd27a');
  fx.sparks(x, y, 12, -ux, -uy, '#ff7a2a');
  if (!v) fx.scorch(x, y, 16);
  game.lights.flash(x, y, 170, '255, 140, 60', 0.35);
  if (f === player || Math.hypot(player.x - x, player.y - y) < 200) renderer.kick(ux * 6, uy * 6 - 2);
}
function updateFists(dt) {
  for (const o of game.fists) o.t += dt;
  game.fists = game.fists.filter((o) => o.t < FIST_LIFE);
}
// after the lighting
function drawFists(ctx) {
  for (const o of game.fists) drawBlast(ctx, o.x, o.y, o.t / FIST_LIFE, game.time, o.seed, o.ax, o.ay);
}

// ---------- galaxy ----------
// The galaxy skill, once it's cast: a black hole opens where the circle was
// (it goes through walls, as space does) and drags in every foe near it -
// harder the closer they are, lifting them off their feet - burning anyone
// right in it, and everything loose about too: crates and drums, guns and
// medkits lying about, grenades in the air, weapons flying. Then it goes off:
// a terrible hit to anyone close, flung away, crates and drums gone, the
// loose things thrown out, the screen shaking (the look of it: galaxy.js).

const GAL_HOLE = 1.5, GAL_BOOM = 0.7, GAL_R = 24;   // how long it pulls, how long the blast shows, the sphere's size
const GAL_PULL_R = 110, GAL_PULL = 2000, GAL_BURN = 16;   // how far it pulls from, how hard (at the heart), burning (HP/s) in it
const GAL_DMG = 150, GAL_BLAST_R = 72;   // the blast: at its heart, and how far it reaches
function updateGalaxies(dt) {
  for (const o of game.galaxies) {
    o.t += dt;
    if (o.t < GAL_HOLE) {
      const grow = Math.min(1, o.t / (GAL_HOLE * 0.3));
      for (const v of game.fighters) {
        if (!v.alive || v.vanish || !game.foes(o.owner, v)) continue;
        const dx = o.x - v.x, dy = o.y - (v.y - 14), d = Math.hypot(dx, dy) || 1;
        if (d > GAL_PULL_R) continue;
        const k = 1 - d / GAL_PULL_R, pull = GAL_PULL * (0.35 + 0.65 * k) * grow * dt;
        v.vx += (dx / d) * pull;
        v.vy += (dy / d) * pull - 720 * k * grow * dt;   // (and held up against falling)
        if (v.onLadder && k > 0.3) v.onLadder = false;
        const sp = Math.hypot(v.vx, v.vy);
        if (sp > 280) { v.vx *= 280 / sp; v.vy *= 280 / sp; }
        if (d < GAL_R + 6) {
          // in it: burning, a few HP at a time
          const b = (o.burn.get(v) ?? 0) + GAL_BURN * dt;
          if (b >= 6) { v.hitHow = 'GALAXY'; v.hurt(6, o.owner, 0, 0); o.burn.set(v, b - 6); } else o.burn.set(v, b);
        }
      }
      // the loose things: dragged in the same way (heavy crates less - see Prop.push), and slowed right
      // at its heart so they hang there turning in it rather than shooting through
      const drag = (cx, cy, grav, push, slow) => {
        const dx = o.x - cx, dy = o.y - cy, d = Math.hypot(dx, dy) || 1;
        if (d > GAL_PULL_R) return;
        const k = 1 - d / GAL_PULL_R, pull = GAL_PULL * (0.35 + 0.65 * k) * grow * dt;
        push((dx / d) * pull, (dy / d) * pull - grav * k * grow * dt);
        if (d < GAL_R) slow(Math.exp(-6 * dt));
      };
      const cap = (b) => { const sp = Math.hypot(b.vx, b.vy); if (sp > 260) { b.vx *= 260 / sp; b.vy *= 260 / sp; } };
      for (const p of game.props) if (!p.dead) drag(p.x, p.y - p.h / 2, 900, (vx, vy) => { p.push(vx, vy); cap(p); }, (s) => { p.vx *= s; p.vy *= s; });
      for (const b of [...game.pickups.filter((p) => p.ready), ...game.grenades, ...game.thrown]) {
        drag(b.x, b.y - 3, 800, (vx, vy) => { b.vx += vx; b.vy += vy; cap(b); }, (s) => { b.vx *= s; b.vy *= s; });
      }
      if (Math.hypot(player.x - o.x, player.y - o.y) < 200) renderer.kick((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2);
    } else if (!o.boomed) {
      o.boomed = true;
      // Which way the blast throws something at (dx, dy) from its heart: straight
      // out - but anything it had dragged right into its heart (which is
      // everything, by now) goes off up and away to one side or the other at
      // random; nothing goes straight up, and nothing down into the floor:
      // always a good shove sideways, and up.
      const scatter = (dx, dy, d) => {
        let ux = dx / (d || 1), uy = dy / (d || 1);
        if (d < GAL_R) { const a = -Math.PI / 2 + (Math.random() < 0.5 ? -1 : 1) * (0.45 + Math.random() * 1.0); ux = Math.cos(a); uy = Math.sin(a); }
        if (Math.abs(ux) < 0.6) {
          ux = (Math.sign(ux) || (Math.random() < 0.5 ? -1 : 1)) * (0.6 + Math.random() * 0.3);
          uy = Math.sqrt(1 - ux * ux);
        }
        return { ux, uy: -Math.abs(uy) };
      };
      for (const v of game.fighters) {
        if (!v.alive || v.vanish || !game.foes(o.owner, v)) continue;
        const dx = v.x - o.x, dy = v.y - 14 - o.y, d = Math.hypot(dx, dy);
        if (d > GAL_BLAST_R) continue;
        const k = 1 - d / GAL_BLAST_R, { ux, uy } = scatter(dx, dy, d), sp = 380 + 220 * k;
        v.hitHow = 'GALAXY';
        v.blast = true;
        v.hurt(GAL_DMG * (0.45 + 0.55 * k), o.owner, ux * sp, uy * sp * 0.6 - 180);
        v.blast = false;
      }
      for (const p of game.props) {
        if (p.dead) continue;
        const dx = p.x - o.x, dy = p.y - p.h / 2 - o.y, d = Math.hypot(dx, dy);
        if (d > GAL_BLAST_R) continue;
        const { ux, uy } = scatter(dx, dy, d);
        game.damageProp(p, 999, o.owner, ux * 300, uy * 200 - 140);
      }
      // the loose things in it, thrown out every which way
      for (const b of [...game.pickups.filter((p) => p.ready), ...game.grenades, ...game.thrown]) {
        const dx = b.x - o.x, dy = b.y - 3 - o.y, d = Math.hypot(dx, dy);
        if (d > GAL_BLAST_R) continue;
        const { ux, uy } = scatter(dx, dy, d), sp = 240 + 160 * (1 - d / GAL_BLAST_R);
        b.vx = ux * sp;
        b.vy = uy * sp - 120;
        if (b.vrot !== undefined) b.vrot = Math.sign(b.vx) * (10 + Math.random() * 14);   // (and spinning)
      }
      game.fx.sparks(o.x, o.y, 24, 0, 0, '#7af0ff');
      game.fx.sparks(o.x, o.y, 18, 0, 0, '#b67aff');
      game.fx.sparks(o.x, o.y, 10, 0, 0, '#ffffff');
      game.lights.flash(o.x, o.y, 220, '150, 120, 255', 0.45);
      if (Math.hypot(player.x - o.x, player.y - o.y) < 260) renderer.kick((Math.random() - 0.5) * 10, -6);
    }
  }
  game.galaxies = game.galaxies.filter((o) => o.t < GAL_HOLE + GAL_BOOM);
}
// After the lighting: the hole, then the blast - and the summoned demons -
// behind the fighters and everything else in the world - drawn on a layer of their own with every
// fighter, crate, drum, gun lying about, grenade and thrown weapon cut out of
// it, so they show in front of it (the glow round each goes straight on the
// scene). The magic circles - being cast, and fading as the hole opens - go
// on top of it all, as before.
let galaxyLayer = null;
function drawGalaxies(ctx) {
  const casting = game.fighters.filter((f) => f.alive && f.gal);
  if (!game.galaxies.length && !casting.length && !game.demons.length) return;
  const cv = ctx.canvas;
  if (!galaxyLayer || galaxyLayer[0].width !== cv.width || galaxyLayer[0].height !== cv.height) galaxyLayer = makeCanvas(cv.width, cv.height);
  const [c, g] = galaxyLayer;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;   // (whatever drawing the cut-outs left it at last time)
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, c.width, c.height);
  g.setTransform(ctx.getTransform());
  g.imageSmoothingEnabled = false;
  for (const o of game.galaxies) {
    if (o.t < GAL_HOLE) drawHole(g, ctx, o.x, o.y, GAL_R, o.t / GAL_HOLE, game.time, o.seed);
    else drawBoom(g, ctx, o.x, o.y, GAL_R, (o.t - GAL_HOLE) / GAL_BOOM, game.time, o.seed);
  }
  for (const d of game.demons) {
    const rest = d.fists.filter((f) => f.state === 'rest').map((f) => ({ x: f.x - d.x, y: f.y - d.y, side: f.side }));
    const reveal = d.phase === 'rise' ? Math.min(1, d.t / (DEMON_RISE * 0.8)) : 1, alpha = d.phase === 'gone' ? 1 - d.t / DEMON_GONE : 1;
    drawDemon(g, ctx, d.x, d.y, d.facing, game.time, d.seed, rest, reveal, alpha, (d.pix ??= {}));
  }
  g.globalCompositeOperation = 'destination-out';
  for (const p of game.props) p.draw(g);
  drawThrown(g);
  drawPickups(g);
  drawGrenades(g);
  for (const f of game.fighters) f.draw(g);
  g.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(c, 0, 0);
  ctx.restore();
  for (const f of casting) drawCircle(ctx, ctx, f.gal.x, f.gal.y, 20, f.gal.t / SKILL_TIME.galaxy, game.time);
  for (const o of game.galaxies) if (o.t < 0.5) drawCircle(ctx, ctx, o.x, o.y, 20, 1, game.time, 1 - o.t / 0.5);
}

// ---------- summon ----------
// The Abyss Golem, called up by the summon skill: it rises out of its circle in a
// burst of black-violet fire, then floats at its summoner's back, keeping up with
// them, and flings its fists - one, then the other - at the nearest foe it
// can see within reach; each goes off in a burst of violet fire where it
// lands and flies back. After a while (or if its summoner falls) it goes up
// in flame. (Nothing can hurt it.) The look of it: demon.js.

const DEMON_RISE = 0.8, DEMON_LIFE = 12, DEMON_GONE = 0.7;   // rising, fighting, going
const DEMON_RANGE = 190, DEMON_EVERY = 0.55, DEMON_PUNCH = 38;   // how far it sees to strike, a fist this often, how hard
const FIST_SPEED = 470, FIST_BACK = 560, FIST_REACH = 230;   // a fist out, coming back, how far it goes at most
const PUNCH_LIFE = 0.45;   // how long the burst where one lands shows
function summonDemon(f, x, y, seed) {
  for (const d of game.demons) if (d.owner === f && d.phase !== 'gone') { d.phase = 'gone'; d.t = 0; }   // (one at a time)
  const d = { owner: f, x, y: y - 34, t: 0, phase: 'rise', life: DEMON_LIFE, facing: f.facing, seed, cd: 0.4, next: 1, circle: { x, y } };
  d.fists = [-1, 1].map((side) => ({ side, state: 'rest', ...demonRest(d, side), vx: 0, vy: 0, dist: 0, target: null }));
  game.demons.push(d);
  game.fx.sparks(x, y - 4, 26, 0, -1, '#d49cff');
  game.fx.sparks(x, y - 4, 20, 0, -1, '#a24ef0');
  game.fx.smoke(x, y - 6, 10, true);
  game.lights.flash(x, y - 20, 160, '150, 100, 255', 0.4);
  if (Math.hypot(player.x - x, player.y - y) < 240) renderer.kick((Math.random() - 0.5) * 6, 5);
}
// where a fist floats when it isn't out: at the demon's side, bobbing
const demonRest = (d, side) => ({ x: d.x + side * 25, y: d.y + 9 + Math.sin(game.time * 3 + side) * 1.5 });
function updateDemons(dt) {
  for (const d of game.demons) {
    const o = d.owner;
    d.t += dt;
    if (d.phase === 'rise' && d.t >= DEMON_RISE) { d.phase = 'live'; d.t = 0; }
    else if (d.phase === 'live') {
      d.life -= dt;
      if (d.life <= 0 || !o.alive) {
        d.phase = 'gone';
        d.t = 0;
        game.fx.sparks(d.x, d.y, 20, 0, -1, '#a24ef0');
        game.fx.smoke(d.x, d.y + 6, 8, true);
      }
      // at its summoner's back, over their shoulder
      const k = Math.min(1, dt * 3.5);
      d.x += (o.x - o.facing * 22 - d.x) * k;
      d.y += (o.y - 44 + Math.sin(game.time * 2.2) * 2 - d.y) * k;
      // the nearest foe it can see within reach
      let tgt = null, best = DEMON_RANGE;
      for (const v of game.fighters) {
        if (!v.alive || v.vanish || !game.foes(o, v) || (v.hidden && !v.glimpsed)) continue;
        const dd = Math.hypot(v.x - d.x, v.y - 14 - d.y);
        if (dd < best && game.los(d.x, d.y, v.x, v.y - 14)) { best = dd; tgt = v; }
      }
      d.facing = tgt ? Math.sign(tgt.x - d.x) || d.facing : o.facing;
      d.cd -= dt;
      if (tgt && d.cd <= 0) {
        const fi = d.fists.find((f) => f.state === 'rest' && f.side === d.next) ?? d.fists.find((f) => f.state === 'rest');
        if (fi) {
          fi.state = 'out';
          fi.target = tgt;
          fi.dist = 0;
          d.next = -fi.side;
          d.cd = DEMON_EVERY;
          game.fx.sparks(fi.x, fi.y, 6, Math.sign(tgt.x - fi.x), 0, '#d49cff');
        }
      }
    }
    for (const fi of d.fists) {
      const r = demonRest(d, fi.side);
      if (fi.state === 'rest') { fi.x = r.x; fi.y = r.y; continue; }
      if (fi.state === 'out') {
        const v = fi.target;
        if (!v.alive || d.phase !== 'live') fi.state = 'back';
        else {
          const dx = v.x - fi.x, dy = v.y - 14 - fi.y, dd = Math.hypot(dx, dy) || 1;
          fi.vx = (dx / dd) * FIST_SPEED;
          fi.vy = (dy / dd) * FIST_SPEED;
          fi.x += fi.vx * dt;
          fi.y += fi.vy * dt;
          fi.dist += FIST_SPEED * dt;
          if (dd < 9) {
            v.hitHow = 'ABYSS GOLEM';
            v.hurt(DEMON_PUNCH, o, (dx / dd) * 300, -150 + (dy / dd) * 80);
            game.punches.push({ x: fi.x, y: fi.y, ax: dx / dd, ay: dy / dd, t: 0, seed: Math.random() * 100 });
            game.fx.sparks(fi.x, fi.y, 10, dx / dd, dy / dd, '#d49cff');
            game.lights.flash(fi.x, fi.y, 70, '150, 110, 255', 0.15);
            if (Math.hypot(player.x - fi.x, player.y - fi.y) < 180) renderer.kick((dx / dd) * 5, (dy / dd) * 4);
            fi.state = 'back';
          } else if (fi.dist > FIST_REACH) fi.state = 'back';
        }
      }
      if (fi.state === 'back') {
        const dx = r.x - fi.x, dy = r.y - fi.y, dd = Math.hypot(dx, dy);
        if (dd < 5) { fi.state = 'rest'; continue; }
        const step = Math.min(dd, FIST_BACK * dt);
        fi.vx = (dx / dd) * FIST_BACK;
        fi.vy = (dy / dd) * FIST_BACK;
        fi.x += (dx / dd) * step;
        fi.y += (dy / dd) * step;
      }
    }
    if (d.phase === 'gone' && Math.random() < 30 * dt) game.fx.sparks(d.x + (Math.random() - 0.5) * 28, d.y + (Math.random() - 0.5) * 24, 1, 0, -1, Math.random() < 0.5 ? '#a24ef0' : '#d49cff');
  }
  game.demons = game.demons.filter((d) => !(d.phase === 'gone' && d.t >= DEMON_GONE));
  for (const p of game.punches) p.t += dt;
  game.punches = game.punches.filter((p) => p.t < PUNCH_LIFE);
}
// After the lighting, over everything: the circles being called up out of
// (and fading as the demon rises), fists out flying, and the bursts where they land.
function drawDemonsOnTop(ctx) {
  for (const f of game.fighters) if (f.alive && f.summon) drawSummonCircle(ctx, ctx, f.summon.x, f.summon.y, f.summon.t / SKILL_TIME.demon, game.time);
  for (const d of game.demons) {
    if (d.phase === 'rise') drawSummonCircle(ctx, ctx, d.circle.x, d.circle.y, 1, game.time, 1 - d.t / DEMON_RISE);
    for (const fi of d.fists) if (fi.state !== 'rest') drawFist(ctx, ctx, fi.x, fi.y, fi.vx, fi.vy, game.time, d.seed + fi.side);
  }
  for (const p of game.punches) drawPunch(ctx, ctx, p.x, p.y, p.t / PUNCH_LIFE, game.time, p.seed, p.ax, p.ay);
}

// ---------- world updates ----------

function updateBullets(dt) {
  const fx = game.fx;
  game.bullets = game.bullets.filter((b) => !b.dead);
  for (const b of game.bullets) {
    const dist = b.speed * dt, n = Math.ceil(dist / 3), sx = b.vx * dt / n, sy = b.vy * dt / n, dx = b.vx / b.speed, dy = b.vy / b.speed;
    for (let i = 0; i < n && !b.dead; i++) {
      b.x += sx;
      b.y += sy;
      b.left -= dist / n;
      b.travelled += dist / n;
      if (b.left <= 0) { b.dead = true; break; }
      if (level.solidAt(b.x, b.y)) {
        b.dead = true;
        fx.impact(b.x - dx * 2, b.y - dy * 2, -dx, -dy);
        game.lights.flash(b.x, b.y, 18, '255, 210, 150', 0.05);
        break;
      }
      const lamp = game.lights.hitLamp(b.x, b.y);
      if (lamp) {
        fx.sparks(lamp.x, lamp.y, 14, dx, 1, '#fff6d0');
        game.lights.flash(lamp.x, lamp.y, 60, '255, 240, 200', 0.12);
      }
      for (const p of game.props) {
        if (p.dead || !p.contains(b.x, b.y)) continue;
        game.damageProp(p, b.dmg, b.owner, dx * b.dmg * 1.2, -8);
        fx.impact(b.x - dx * 2, b.y - dy * 2, -dx, -dy);
        b.dead = true;
        break;
      }
      if (b.dead) break;
      for (const o of game.fighters) {
        if (o === b.owner || !o.alive || b.done.has(o) || !game.foes(b.owner, o)) continue;
        const part = o.hitPart(b.x, b.y);
        if (!part) continue;
        b.done.add(o);
        if (o.shield > 0) { fx.sparks(b.x, b.y, 4, -dx, -dy, '#8ff0ff'); b.dead = true; break; }
        const head = part === 'head';
        o.hitHow = null;
        if (!o.hurt(b.dmg, b.owner, dx * b.dmg * 2.2, dy * b.dmg * 1.2 - 15, head)) continue;   // rolled under it
        fx.blood(b.x, b.y, head ? 10 : 6, dx, dy);
        if (o === player) renderer.kick(dx * 3, dy * 3);
        if (b.pierce > 0) b.pierce--;
        else { b.dead = true; break; }
      }
    }
  }
}

function updateGrenades(dt) {
  const fx = game.fx;
  for (const g of game.grenades) {
    g.t -= dt;
    g.age += dt;
    // an impact grenade: off the moment it touches a fighter
    if (g.kind === 'impact' && g.age > 0.08) for (const o of game.fighters) if (o.alive && o !== g.owner && Math.abs(o.x - g.x) < 7 && g.y > o.y - 28 && g.y < o.y + 2) g.t = 0;
    g.vy += 700 * dt;
    g.rot += g.vrot * dt;
    const solidOrProp = (x, y) => level.solidAt(x, y) || game.props.some((p) => !p.dead && x > p.box.l && x < p.box.r && y > p.box.t && y < p.box.b);
    const nx = g.x + g.vx * dt;
    if (solidOrProp(nx, g.y)) { g.vx *= -0.45; g.vrot *= -0.6; if (g.kind === 'impact' && g.age > 0.08) g.t = 0; } else g.x = nx;
    const ny = g.y + g.vy * dt;
    let landed = false;
    if (g.vy > 0) {
      const cy0 = Math.floor(g.y / T), cy1 = Math.floor(ny / T);
      for (let cy = cy0; cy <= cy1; cy++) {
        const v = level.get(Math.floor(g.x / T), cy);
        if ((v === SOLID || v === PLAT || v === ACID) && cy * T >= g.y - 0.5 && cy * T <= ny) {
          if (v === ACID || (g.kind === 'impact' && g.age > 0.08)) { g.t = Math.min(g.t, 0.01); }
          g.y = cy * T - 0.5;
          g.vy = Math.abs(g.vy) > 80 ? -g.vy * 0.4 : 0;
          g.vx *= 0.7;
          g.vrot *= 0.6;
          landed = true;
          break;
        }
      }
      if (!landed && solidOrProp(g.x, ny)) { g.vy = -g.vy * 0.35; g.vx *= 0.7; landed = true; }
    } else if (solidOrProp(g.x, ny)) { g.vy = 0; landed = true; }
    if (!landed) g.y = ny;
    if (g.t <= 0) {
      g.dead = true;
      game.explode(g.x, g.y - 3, g.owner);
    }
  }
  game.grenades = game.grenades.filter((g) => !g.dead);
  for (const p of game.props) if (p.fuse >= 0 && !p.dead) {
    p.fuse -= dt;
    if (p.fuse < 0.05) { p.fuse = -1; game.damageProp(p, 999, p.owner); }
  }
  updateProps(dt);
}

// Props fall, slide, stack; one in the acid fizzles away.
function updateProps(dt) {
  for (const p of game.props) {
    if (p.dead) continue;
    p.update(dt, level, game.props);
    if (p.dissolve) { p.dead = true; game.fx.smoke(p.x, p.y - 4, 6); game.fx.sparks(p.x, p.y - 2, 6, 0, -1, '#9aff6a'); }
    if (p.landed) { if (p.landed < -60) game.fx.dust(p.x, p.y, 4); p.landed = 0; }
  }
  game.props = game.props.filter((p) => !p.dead);
}

// Weapons thrown with G: spin through the air, hit whoever's in the way, land as a pickup.
function updateThrown(dt) {
  const fx = game.fx;
  for (const o of game.thrown) {
    o.t += dt;
    o.vy = Math.min(600, o.vy + 800 * dt);
    o.rot += o.vrot * dt;
    const sp = Math.hypot(o.vx, o.vy);
    if (sp > 130) {
      for (const v of game.fighters) {
        if (!v.alive || v === o.owner || o.hit.has(v) || !game.foes(o.owner, v) || !v.hitPart(o.x, o.y)) continue;
        o.hit.add(v);
        const heavy = o.weight === 'heavy' || o.weight === 'lmg' || o.weight === 'sniper' || o.weight === 'shotgun';
        v.hitHow = 'THROWN';
        const shooting = v.weapon && v.lastFireT < 0.7;
        if (v.hurt(heavy ? 42 : o.kind === 'melee' ? 34 : 26, o.owner, Math.sign(o.vx) * 230, -120)) {
          fx.blood(v.x, v.y - 14, 6, Math.sign(o.vx), -0.3);
          if (shooting && v.alive) game.disarm(v, Math.sign(o.vx));
        }
        o.vx *= -0.3;
        o.vy = -90;
      }
      for (const p of game.props) {
        if (p.dead || o.hit.has(p) || !p.contains(o.x, o.y)) continue;
        o.hit.add(p);
        game.damageProp(p, 24, o.owner, o.vx * 0.4, -40);
        o.vx *= -0.4;
      }
    }
    const nx = o.x + o.vx * dt;
    if (level.solidAt(nx, o.y)) { o.vx *= -0.4; o.vrot *= -0.5; } else o.x = nx;
    const ny = o.y + o.vy * dt;
    let top = null;
    if (o.vy > 0) for (let cy = Math.floor(o.y / T); cy <= Math.floor(ny / T); cy++) {
      const v = level.get(Math.floor(o.x / T), cy);
      if ((v === SOLID || v === PLAT) && cy * T >= o.y - 0.5 && cy * T <= ny) { top = cy * T; break; }
    }
    if (top !== null) {
      o.y = top - 1;
      if (o.vy > 160) { o.vy *= -0.3; o.vx *= 0.6; o.vrot *= 0.5; }
      else o.rest = true;
    } else if (o.vy < 0 && level.solidAt(o.x, ny)) o.vy = 0;
    else o.y = ny;
    if (o.rest || o.t > 4) {
      // down: it's a pickup again
      o.done = true;
      game.pickups.push({ kind: o.kind, key: o.key, ammo: o.ammo, reserve: o.reserve, x: o.x, y: o.y + 1, vx: 0, vy: 0, beam: 0, life: state === 'training' ? 8 : 25, bob: 0, ready: true, noGrab: 0.25 });
    }
    if (o.y > PH + 60) o.done = true;
  }
  game.thrown = game.thrown.filter((o) => !o.done);
}

// what's lying about to be picked up (glinting now and then; blinking when it's about to vanish)
function drawPickups(ctx) {
  for (const p of game.pickups) {
    if (!p.ready) continue;
    if (p.life < 3 && Math.floor(p.life * 8) % 2) continue;   // about to vanish
    const img = p.kind === 'gun' ? iconOf(p.key) : p.kind === 'melee' ? MELEE[p.key].img : p.kind === 'health' ? MEDKIT : p.nade === 'impact' ? IMPACT_PAIR : NADES;
    const y = Math.round(p.y - artH(img) - (p.vy === 0 ? 1 + Math.round(Math.sin(p.bob * 3)) : 0)), x = Math.round(p.x - artW(img) / 2);
    ctx.drawImage(img, x, y, artW(img), artH(img));
    const k = ((game.time + p.bob * 0.37) % 2.4) / 0.5;
    if (k < 1) drawGlint(ctx, img, x, y, k);
  }
}
function drawGrenades(ctx) {
  for (const g of game.grenades) {
    ctx.save();
    ctx.translate(Math.round(g.x), Math.round(g.y - 3));
    ctx.rotate(Math.round(g.rot / (Math.PI / 4)) * (Math.PI / 4));
    ctx.drawImage(NADE_ART[g.kind] ?? NADE, -2, -3);
    ctx.restore();
  }
}

function drawThrown(ctx) {
  for (const o of game.thrown) {
    const img = o.img, w = artW(img), h = artH(img);
    ctx.save();
    ctx.translate(Math.round(o.x), Math.round(o.y));
    ctx.rotate(Math.round(o.rot / (Math.PI / 8)) * (Math.PI / 8));
    ctx.drawImage(img, -Math.round(w / 2), -Math.round(h / 2), w, h);
    ctx.restore();
  }
}

// A glint across a pickup: a bright slanted band sweeping over the item's own
// pixels, left to right (k 0..1). Made at the image's own resolution, so it
// lines up with the 2x art pixel for pixel.
let glint = null;
function drawGlint(ctx, img, x, y, k) {
  const W = img.width, H = img.height, res = img.res ?? 1;
  if (!glint || glint[0].width < W || glint[0].height < H) glint = makeCanvas(Math.max(W, glint?.[0].width ?? 0), Math.max(H, glint?.[0].height ?? 0));
  const [c, g] = glint;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, c.width, c.height);
  const s = Math.round(-H + k * (W + H * 2)), band = (from, w, col) => {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(s + from, 0); g.lineTo(s + from + w, 0); g.lineTo(s + from + w - H, H); g.lineTo(s + from - H, H);
    g.fill();
  };
  band(-2 * res, 2 * res, 'rgba(200, 245, 255, 0.55)');
  band(0, 2 * res, 'rgba(255, 255, 255, 0.95)');
  band(3 * res, res, 'rgba(255, 255, 255, 0.6)');
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(img, 0, 0);
  ctx.drawImage(c, 0, 0, W, H, x, y, artW(img), artH(img));
}

// The damage numbers: rise and fade (the main game's).
function drawNumbers(ctx) {
  for (const n of game.numbers) {
    const k = n.t / 0.9, size = n.big ? 2 : 1;
    ctx.globalAlpha = Math.max(0, 1 - k * k);
    drawText(ctx, n.text, Math.round(n.x - textWidth(n.text, size) / 2), Math.round(n.y - 16 * Math.sqrt(k) * 1.2), size, n.color);
  }
  ctx.globalAlpha = 1;
}

function updatePickups(dt) {
  if (state === 'fight') {
    pickupT -= dt;
    if (pickupT <= 0 && game.pickups.length < 6) {
      game.spawnPickup();
      pickupT = rand(4, 7);
    }
  }
  for (const p of game.pickups) {
    p.beam -= dt;
    p.life -= dt;
    p.noGrab = (p.noGrab ?? 0) - dt;
    p.bob += dt;
    p.ready = p.beam <= 0;
    if (!p.ready) continue;
    // fall onto whatever is below
    p.vy = Math.min(500, p.vy + 800 * dt);
    p.vx *= Math.exp(-3 * dt);
    const nx = p.x + p.vx * dt;
    if (!level.solidAt(nx, p.y - 3)) p.x = nx;
    const ny = p.y + p.vy * dt;
    let top = null;
    if (p.vy > 0) for (let cy = Math.floor(p.y / T); cy <= Math.floor(ny / T); cy++) {
      const v = level.get(Math.floor(p.x / T), cy);
      if ((v === SOLID || v === PLAT) && cy * T >= p.y - 0.5 && cy * T <= ny) { top = cy * T; break; }
      if (v === ACID && cy * T <= ny) { p.life = 0; game.fx.smoke(p.x, cy * T, 4); break; }
    }
    for (const pr of game.props) if (top === null && p.vy > 0 && Math.abs(pr.x - p.x) < pr.w / 2 && p.y <= pr.box.t + 0.5 && ny >= pr.box.t) top = pr.box.t;
    if (top !== null) { p.y = top; p.vy = 0; } else p.y = ny;
  }
  // who takes what
  for (const p of game.pickups) {
    if (!p.ready || p.life <= 0 || p.noGrab > 0) continue;
    for (const f of game.fighters) {
      if (!f.alive || f.dummy || f.isDecoy || Math.abs(f.x - p.x) > 11 || Math.abs(f.y - p.y) > 18) continue;
      if (p.kind === 'health') {
        if (f.hp >= f.maxHp) continue;
        f.hp = Math.min(f.maxHp, f.hp + f.maxHp * 0.45);
        game.fx.sparks(f.x, f.y - 14, 10, 0, -1, '#8aff9a');
      } else if (p.kind === 'nades') {
        if (f.grenades >= 4 && f.nade === p.nade) continue;
        // a different kind replaces what's in slot 3
        f.grenades = f.nade === p.nade ? Math.min(4, f.grenades + 2) : 2;
        f.nade = p.nade ?? 'frag';
      } else if (p.kind === 'melee') {
        if (f.cloak) continue;
        const fists = f.melee.def.fists;
        const wants = f === player ? fists || f.pickupPressed : fists;
        if (!wants) continue;
        const old = f.giveMelee(MELEE[p.key]);
        if (old) game.pickups.push({ kind: 'melee', key: old.def.key, x: f.x, y: f.y - 10, vx: -f.facing * 60, vy: -140, beam: 0, life: 20, bob: 0, ready: false, noGrab: 0.6 });
        f.pickupPressed = false;
      } else {
        const def = WEAPONS[p.key], w = f.gunIn(f.slotFor(def)), armed = w && (w.ammo > 0 || w.reserve > 0);
        const wants = f === player ? !armed || f.pickupPressed : !armed || gunTier(def) > gunTier(w.def) + 0.4;
        if (!wants) continue;
        if (armed) {
          // drop the old one where the new one was
          game.pickups.push({ kind: 'gun', key: w.def.key, ammo: w.ammo, reserve: w.reserve, x: f.x, y: f.y - 10, vx: -f.facing * 60, vy: -140, beam: 0, life: 20, bob: 0, ready: false, noGrab: 0.6 });
        }
        if (w?.reloading) w.cancelReload();
        const nw = f.give(p.key, p.reserve ?? def.magSize * 2);
        if (p.ammo !== undefined) nw.ammo = p.ammo;
        f.pickupPressed = false;
      }
      p.life = 0;
      game.fx.sparks(p.x, p.y - 4, 6, 0, -1, '#e8ffd0');
      break;
    }
  }
  game.pickups = game.pickups.filter((p) => p.life > 0);
}

// ---------- camera ----------

let spectating = null, titlePan = 0;
function updateCamera(dt) {
  const cam = renderer.camera;
  let tx, ty;
  if (onMenu()) {
    titlePan += dt * 0.12;
    tx = PW / 2 + Math.sin(titlePan) * (PW / 2);
    ty = PH / 2 + Math.sin(titlePan * 1.7) * (PH / 3);
  } else {
    let f = player.alive ? player : null;
    if (!f) {
      if (!spectating || !spectating.alive) spectating = (player.killer?.alive && player.killer) || game.fighters.find((o) => o.alive) || player;
      f = spectating;
    }
    const target = f.alive ? f : f.corpse ?? f;
    tx = target.x;
    ty = target.y - 20;
    if (f === player && input.mouse.active && player.alive) {
      const m = mouseWorld();
      tx += Math.max(-90, Math.min(90, (m.x - player.x) * 0.3));
      ty += Math.max(-60, Math.min(60, (m.y - player.y) * 0.3));
    }
  }
  const k = 1 - Math.exp(-6 * dt);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  const hw = renderer.viewW / 2, hh = renderer.viewH / 2;
  cam.x = PW > hw * 2 ? Math.max(hw, Math.min(PW - hw, cam.x)) : PW / 2;
  cam.y = PH > hh * 2 ? Math.max(hh, Math.min(PH - hh, cam.y)) : PH / 2;
}

// ---------- drawing ----------

function drawWorld() {
  const ctx = renderer.ctx, time = game.time;
  renderer.clear('#05080a');
  renderer.beginWorld();
  ctx.drawImage(level.back, 0, 0);
  ctx.drawImage(level.front, 0, 0);
  ctx.drawImage(game.fx.stains, 0, 0);
  game.fx.drawScorches(ctx);
  for (const p of game.props) p.draw(ctx);
  drawThrown(ctx);
  drawPickups(ctx);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  const seen = (f) => !f.hidden || f === player;
  for (const f of game.fighters) if (f.alive && f.onGround && seen(f)) ctx.fillRect(Math.round(f.x) - 5, Math.round(f.y) - 1, 11, 1);
  for (const f of game.fighters) if (!f.alive) f.draw(ctx);
  for (const f of game.fighters) if (f.alive && f !== player) f.draw(ctx);
  if (player.alive) player.draw(ctx);
  for (const f of game.fighters) f.drawHook(ctx);
  drawGrenades(ctx);
  game.fx.viewer = player;
  game.fx.draw(ctx);

  // light it
  const extra = [];
  // a little light on each fighter so they read in the dark corners
  for (const f of game.fighters) if (f.alive && !f.hidden) extra.push({ x: f.x, y: f.y - 14, r: 30, rgb: '190, 210, 230', k: 0.22 });
  // a violet flash round someone going into the cloak or coming out of it
  for (const f of game.fighters) if (f.alive && f.fade && !(f.fade.secret && f !== player)) extra.push({ x: f.x, y: f.y - 14, r: 38, rgb: f.fade.rgb ?? '150, 110, 255', k: 0.5 * (1 - f.fade.t / f.fade.dur) });
  // the grapple's claw lights up what it's stuck in
  for (const f of game.fighters) if (f.hook && f.hook.state !== 'back') extra.push({ x: f.hook.x, y: f.hook.y, r: 22, rgb: '120, 210, 255', k: 0.4 });
  for (const d of game.demons) extra.push({ x: d.x, y: d.y - 4, r: 70, rgb: '140, 100, 255', k: 0.5 * (d.phase === 'rise' ? d.t / DEMON_RISE : d.phase === 'gone' ? 1 - d.t / DEMON_GONE : 1) });
  for (const p of game.pickups) if (p.ready) extra.push({ x: p.x, y: p.y - 6, r: 26, rgb: p.kind === 'health' ? '255, 120, 110' : '170, 240, 255', k: 0.3 });
  for (const g of game.grenades) if (Math.sin(g.t * (g.t < 0.6 ? 40 : 14)) > 0) extra.push({ x: g.x, y: g.y - 3, r: 16, rgb: '255, 80, 60', k: 0.6 });
  if (overtime) extra.push({ x: renderer.camera.x, y: renderer.camera.y, r: 600, rgb: '120, 20, 10', k: 0.15 + 0.08 * Math.sin(time * 5) });
  game.lights.apply(ctx, renderer, time, extra);

  // things that glow
  game.lights.glow(ctx, time);
  drawDecoGlow(ctx, time);
  drawGalaxies(ctx);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // blasts: a white-hot core and a ring of heat pushing out
  for (const b of game.blasts) {
    const k = b.t / 0.35, rr = b.r * (0.4 + k * 1.1);
    const gr = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, rr);
    gr.addColorStop(0, `rgba(255, 250, 220, ${0.9 * (1 - k)})`);
    gr.addColorStop(0.35, `rgba(255, 180, 80, ${0.6 * (1 - k)})`);
    gr.addColorStop(0.8, `rgba(255, 90, 30, ${0.25 * (1 - k)})`);
    gr.addColorStop(1, 'rgba(255, 60, 20, 0)');
    ctx.fillStyle = gr;
    ctx.fillRect(b.x - rr, b.y - rr, rr * 2, rr * 2);
  }
  // the beams that bring pickups in
  for (const p of game.pickups) {
    if (p.beam <= 0) continue;
    const k = Math.min(1, p.beam / 0.8), w = 2 + 6 * Math.sin(Math.PI * k);
    const gr = ctx.createLinearGradient(0, p.y - 60, 0, p.y + 18);
    gr.addColorStop(0, 'rgba(120, 230, 255, 0)');
    gr.addColorStop(0.7, `rgba(150, 240, 255, ${0.5 * k + 0.2})`);
    gr.addColorStop(1, 'rgba(150, 240, 255, 0)');
    ctx.fillStyle = gr;
    ctx.fillRect(Math.round(p.x - w / 2), p.y - 60, Math.round(w), 78);
  }
  ctx.restore();
  game.fx.drawGlow(ctx);
  for (const f of game.fighters) f.drawHookGlow(ctx);
  drawShields(ctx);
  drawArrows(ctx);
  drawVoids(ctx);
  drawFists(ctx);
  drawDemonsOnTop(ctx);
  for (const b of game.bullets) drawBullet(ctx, b);
  for (const f of game.fighters) f.drawFlash(ctx);
  drawNumbers(ctx);

  // name tags, health and stamina over heads (at a fixed height: they don't
  // dip with a roll or a crouch)
  for (const f of game.fighters) {
    if (!f.alive || (f.hidden && f !== player)) continue;
    const x = Math.round(f.x), y = Math.round(f.y - (f.bow ? 48 : 36));   // (lifted clear of the archery bow while it's up)
    const you = f === player && !online.watching, name = you ? 'YOU' : f.name, w = textWidth(name);
    if (!you || state === 'intro') drawText(ctx, name, x - Math.floor(w / 2), y - 8, 1, tagColor(f));
    // stamina only shows while it's in use (and a moment after it's full
    // again), fading in and out
    if (f.stamina < MAX_STAMINA) f.staminaSeen = game.time;
    const tired = game.time - (f.staminaSeen ?? -9) < 0.6, since = Math.min(0.1, Math.max(0, game.time - (f.staminaT ?? game.time)));
    f.staminaT = game.time;
    f.staminaA = Math.max(0, Math.min(1, (f.staminaA ?? 0) + (tired ? since : -since) / 0.25));
    rect(ctx, '#050604', x - 9, y - 1, 18, 3);
    rect(ctx, '#3a1414', x - 8, y, 16, 1);
    rect(ctx, f.hp > f.maxHp * 0.3 ? '#5ad86a' : '#ff5a4a', x - 8, y, Math.ceil(16 * Math.max(0, Math.min(1, f.hp / f.maxHp))), 1);
    if (f.staminaA > 0) {
      ctx.globalAlpha = f.staminaA;
      rect(ctx, '#050604', x - 9, y + 2, 18, 2);
      rect(ctx, '#0f1a16', x - 8, y + 2, 16, 1);
      rect(ctx, f.winded ? '#c9a83a' : HUDC.stamina, x - 8, y + 2, Math.ceil((16 * f.stamina) / MAX_STAMINA), 1);
      ctx.globalAlpha = 1;
    }
  }
  // you, cloaked: whoever's in reach of your stab right now, locked on
  const mine = player.alive ? player.stabTarget() : null;
  if (mine?.alive) drawMarked(ctx, mine);
  drawCabinetPrompt(ctx);
  // E prompt over a weapon the player could swap to
  if (player.alive && !cabinetNear()) for (const p of game.pickups) {
    if (!p.ready || Math.abs(player.x - p.x) > 11 || Math.abs(player.y - p.y) > 18) continue;
    if (!(p.kind === 'gun' && player.gunIn(player.slotFor(WEAPONS[p.key]))) && !(p.kind === 'melee' && !player.melee.def.fists)) continue;
    const t = `E ${p.kind === 'gun' ? WEAPONS[p.key].name : MELEE[p.key].name}`;
    drawText(ctx, t, Math.round(p.x - textWidth(t) / 2), Math.round(p.y - 22), 1, '#ffd25a');
    break;
  }
}

// The one you can stab right now (cloaked): red brackets closing in round
// their body - locked on. (Only you see them.)
function drawMarked(ctx, v) {
  const t = game.time, x = Math.round(v.x), pulse = 0.5 + 0.5 * Math.sin(t * 12);
  // the brackets: four corners round the body, breathing in and out
  const inset = Math.round(1 + pulse * 2), l = x - 10 + inset, r = x + 10 - inset, tp = Math.round(v.y - 32) + inset, b = Math.round(v.y + 2) - inset;
  for (const [cx, cy, sx, sy] of [[l, tp, 1, 1], [r, tp, -1, 1], [l, b, 1, -1], [r, b, -1, -1]]) {
    ctx.fillStyle = '#0b100f';
    ctx.fillRect(Math.min(cx, cx + sx * 4) - 1, cy - 1, 6, 3);
    ctx.fillRect(cx - 1, Math.min(cy, cy + sy * 4) - 1, 3, 6);
    ctx.fillStyle = '#ff3a2a';
    ctx.fillRect(Math.min(cx, cx + sx * 3), cy, 4, 1);
    ctx.fillRect(cx, Math.min(cy, cy + sy * 3), 1, 4);
  }
}

// The back wall's glowing fittings (screens, tanks, the cabinets) glow after
// the lighting - but they're behind everything, so they go on a layer of
// their own with whatever's standing in front (fighters, crates) cut out of
// it, and that's added over the scene.
let decoLayer = null;
function drawDecoGlow(ctx, time) {
  const cv = ctx.canvas;
  if (!decoLayer || decoLayer[0].width !== cv.width || decoLayer[0].height !== cv.height) decoLayer = makeCanvas(cv.width, cv.height);
  const [c, g] = decoLayer;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, c.width, c.height);
  g.setTransform(ctx.getTransform());
  g.imageSmoothingEnabled = false;
  game.lights.glowDeco(g, time);
  g.globalCompositeOperation = 'destination-out';
  for (const p of game.props) p.draw(g);
  for (const f of game.fighters) f.draw(g);
  g.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(c, 0, 0);
  ctx.restore();
}

// The main game's bullet: an orange glow streak, a bright core, a white-hot head.
function drawBullet(ctx, b) {
  if (b.dead && b.travelled < 2) return;
  const dx = b.vx / b.speed, dy = b.vy / b.speed;
  const len = Math.min(26, b.speed * 0.022, b.travelled), x = b.x, y = b.y;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255, 150, 60, 0.45)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - dx * len, y - dy * len);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.strokeStyle = '#ffe9a8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - dx * len * 0.6, y - dy * len * 0.6);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#fffbe6';
  ctx.fillRect(Math.round(x - 1), Math.round(y - 1), 2, 2);
}

function panel(ctx, x, y, w, h, u, edge = '#3a4c46') {
  ctx.fillStyle = 'rgba(5, 8, 7, 0.78)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = edge;
  ctx.fillRect(x, y, w, u);
  ctx.fillRect(x, y + h - u, w, u);
}

function centerText(ctx, text, y, size, color, u) {
  const w = textWidth(text, size) * u;
  drawText(ctx, text, Math.round(renderer.width / 2 - w / 2), Math.round(y), u * size, color);
}

function drawHud() {
  const ctx = renderer.ctx, u = hudScale(), W = renderer.width, H = renderer.height;
  renderer.beginScreen();
  kit.begin(ctx, u, W, H);
  renderer.drawVignette();
  // the keys overlay never sits over a menu
  hintEl.classList.toggle('hide', onMenu() || paused || state === 'match' || online.menuOpen || online.watching);
  if (state === 'menu') return drawMainMenu(ctx, u, W, H);
  if (state === 'soon') return drawSoon(ctx, u, W, H);
  if (state === 'title') return drawTitle(ctx, u, W, H);
  if (online.isScreen(state)) { drawNetScreen(ctx, u, W, H); return drawPicker(); }

  // everyone's card in a row along the top (Superfighters style)
  drawHurt(ctx, W, H, player);
  const cardsBottom = drawCards(ctx, u, W);
  if (!locker && !paused && state !== 'match') drawSkillBox(u, W, H, player);
  if (state === 'training') {
    drawMeter(ctx, u, W);
    if (locker) drawLocker(ctx, u, W, H);
    else drawCrosshair(ctx, u);
    if (paused) drawPause(ctx, u, W, H);
    if (!locker) drawBanner(ctx, u, H);
    return;
  }

  // the round and the clock, under the cards
  if (state === 'fight' || state === 'end' || state === 'intro') {
    const left = Math.max(0, settings.time - roundT), clock = !settings.time ? '' : overtime ? '  OVERTIME' : `  ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    const t = `ROUND ${Math.max(1, round)}${clock}`;
    let ty = cardsBottom + 4 * u;
    if (teamMode()) {
      // BLUE 1 - 0 RED, each side in its colour
      const [b, r] = [0, 1].map((t) => Math.max(0, ...game.fighters.filter((f) => f.team === t && !f.isDecoy).map((f) => f.wins)));
      const parts = [[`BLUE ${b}`, TEAMS[0].color], ['  -  ', '#9aa49c'], [`${r} RED`, TEAMS[1].color]];
      let x = W / 2 - kit.width(parts.map((p) => p[0]).join('')) / 2;
      for (const [txt, c] of parts) x += kit.text(txt, x, ty, { color: c });
      ty += 11 * u;
    }
    drawText(ctx, t, Math.round(W / 2 - (textWidth(t) * u) / 2), ty, u, overtime ? '#ff6a5a' : '#9aa49c');
  }

  // kill feed, top right under the cards
  let fy = cardsBottom + 16 * u;
  for (const k of game.feed) {
    k.t -= 0;
    const a = k.killer ? k.killer.name : '', b = k.victim.name, how = `[${k.how}]`;
    const width = (textWidth(a) + textWidth(how) + textWidth(b) + 10) * u;
    let fx = W - 6 * u - width;
    panel(ctx, fx - 3 * u, fy - 2 * u, width + 6 * u, 9 * u, u, k.victim === player || k.killer === player ? '#c9a83a' : '#2a3632');
    if (a) { drawText(ctx, a, fx, fy, u, tagColor(k.killer)); fx += (textWidth(a) + 5) * u; }
    drawText(ctx, how, fx, fy, u, '#9aa49c');
    fx += (textWidth(how) + 5) * u;
    drawText(ctx, b, fx, fy, u, tagColor(k.victim));
    fy += 11 * u;
  }

  drawBanner(ctx, u, H);
  if (state === 'intro' && stateT > 0.5) kit.text(String(Math.max(1, 3 - Math.floor((stateT - 0.5) / 0.37))), W / 2, H * 0.34 + 44 * u, { size: 4, color: KC.gold, align: 'center' });
  if (!player.alive && state === 'fight' && !online.watching) {
    if (player.respawnT > 0) kit.text(`BACK IN ${player.respawnT.toFixed(1)}`, W / 2, H - 48 * u, { size: 2, color: KC.teal, align: 'center' });
    else kit.text(`SPECTATING ${spectating?.name ?? ''}`, W / 2, H - 46 * u, { color: KC.muted, align: 'center' });
  }

  if (input.down('Tab') && (state === 'intro' || state === 'fight' || state === 'end') && !paused) drawScores(ctx, u, W, H);
  if (state === 'match') drawMatch(ctx, u, W, H);
  if (paused) drawPause(ctx, u, W, H);
  drawCrosshair(ctx, u);
  if (online.active) drawNetOverlay(ctx, u, W, H);
}

function drawBanner(ctx, u, H) {
  if (!banner) return;
  const W = renderer.width;
  ctx.globalAlpha = Math.min(1, banner.t * 3);
  kit.text(banner.text, W / 2, H * 0.34, { size: kit.width(banner.text, { size: 4 }) < W - 20 * u ? 4 : 3, color: banner.color, align: 'center' });
  // (the scores under it: in the big font if they fit, the small one if not)
  if (banner.sub) kit.text(banner.sub, W / 2, H * 0.34 + 34 * u, { small: kit.width(banner.sub) > W - 20 * u, color: '#dfe4d6', align: 'center' });
  ctx.globalAlpha = 1;
}

// The pause menu: buttons (or their keys).
const pauseItems = () => (state === 'training'
  ? [['resume', 'RESUME', 'ESC'], ['reset', 'RESET THE RANGE', 'R'], ['menu', 'MAIN MENU', 'Q']]
  : [['resume', 'RESUME', 'ESC'], ['restart', 'RESTART THE MATCH', 'R'], ['setup', 'ROOM SETUP', 'S'], ['menu', 'MAIN MENU', 'Q']]);
function drawPause(ctx, u, W, H) {
  kit.shade(0.7);
  const items = pauseItems(), pw = 200 * u, bh = 18 * u, ph = 26 * u + items.length * (bh + 5 * u), px = Math.round(W / 2 - pw / 2), py = Math.round(H / 2 - ph / 2);
  let y = kit.panel(px, py, pw, ph, { title: 'PAUSED' });
  for (const [id, label, key] of items) {
    kit.button(`pause:${id}`, px + 8 * u, y, pw - 16 * u, bh, label, { kind: id === 'resume' ? 'primary' : 'normal' });
    kit.text(key, px + pw - 14 * u, y + 7 * u, { small: true, color: KC.faint, align: 'right' });
    y += bh + 5 * u;
  }
}
function pauseInput() {
  const c = kit.click?.startsWith('pause:') ? kit.click.slice(6) : null;
  if (c === 'resume') paused = false;
  else if (input.wasPressed('KeyQ') || c === 'menu') { paused = false; state = 'menu'; banner = null; }
  else if (input.wasPressed('KeyR') || c === 'restart' || c === 'reset') { paused = false; if (state === 'training') startTraining(); else startMatch(); }
  else if ((input.wasPressed('KeyS') && state !== 'training') || c === 'setup') { paused = false; state = 'title'; banner = null; }
}

// The main game's HUD colours.
const HUDC = { frame: '#050604', panel: '#1b2117', panelHi: '#2c3526', hp: '#d7313d', hpHi: '#ff6670', hpLost: '#f4e7d0', stamina: '#3fd0a0', staminaHi: '#8af0cc', barBg: '#0f130d', text: '#e8ecd8', red: '#ff4a4a', dim: '#6f7a62' };

// Hit: the screen flashes red; low on health it pulses (the main game's).
function drawHurt(ctx, W, H, f) {
  if (!f.alive) return;
  const low = f.hp < f.maxHp * 0.25;
  const hurt = Math.max(0, 0.5 - f.hurtT) * 0.8 + (low ? 0.12 + 0.08 * Math.sin(game.time * 6) : 0);
  if (hurt > 0) { ctx.fillStyle = `rgba(150, 0, 0, ${Math.min(0.5, hurt)})`; ctx.fillRect(0, 0, W, H); }
}

// A card for every fighter along the top, in the main game's style (no
// backing, straight over the scene): the portrait, name and rounds won, health
// (what was just lost trails off in pale) and stamina, and the four slots. You and your team from the left edge going right, everyone
// else from the right edge going left. Returns where the row ends (device px).
function drawCards(ctx, u, W) {
  const list = game.fighters.filter((f) => !f.dummy && !f.isDecoy);
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x * u), Math.round(y * u), Math.round(w * u), Math.round(h * u)); };
  const text = (t, x, y, c, size = 1) => drawText(ctx, String(t), Math.round(x * u), Math.round(y * u), u * size, c);
  const Wd = W / u, n = list.length;
  const mine = (f) => f === player || (teamMode() && state !== 'training' && f.team === player.team);
  const ours = list.filter(mine), theirs = list.filter((f) => !mine(f));
  if ((Wd - 12 - 8 * (n - 1)) / n < 70) return drawMiniCards(ctx, u, Wd, ours, theirs);
  const gap = 8, CH = 44, CW = Math.max(70, Math.min(116, Math.floor((Wd - 12 - gap * (n - 1)) / n)));
  const place = new Map();
  ours.forEach((f, i) => place.set(f, 6 + i * (CW + gap)));
  theirs.forEach((f, i) => place.set(f, Wd - 6 - CW - i * (CW + gap)));
  const y = 4;
  sideBars(px, ours, theirs, place, CW, Wd);
  for (const f of list) {
    const x = place.get(f), me = f === player && !online.watching;
    if (me) px(x, y, 22 + 4, 1, '#c9a83a');   // yours: a gold mark over the portrait
    // portrait
    px(x + 2, y + 3, 22, 22, HUDC.frame);
    px(x + 3, y + 4, 20, 20, '#2c3526');
    ctx.drawImage(f.parts.head, 5, 0, 22, 21, Math.round((x + 3) * u), Math.round((y + 5) * u), 20 * u, 19 * u);
    // the skill (Q) on the portrait's corner: lit when it's ready, filling back up while it waits
    if (f.skill && f.alive) {
      const k = Math.max(0, Math.min(1, 1 - f.skillCD / SKILL_CD[f.skill])), ready = k >= 1, on = skillOn(f);
      px(x + 15, y + 17, 10, 9, HUDC.frame);
      px(x + 16, y + 18, 8, 7, on ? '#2a2240' : ready ? '#1d3a44' : '#161b19');
      if (on) { const left = Math.max(0, f.skill === 'demon' ? (f.summon ? Math.min(1, f.summon.t / SKILL_TIME.demon) : (game.demons.find((d) => d.owner === f)?.life ?? 0) / DEMON_LIFE) : f.gal ? Math.min(1, f.gal.t / SKILL_TIME.galaxy) : f.blaze ? (f.blaze.phase === 'charge' ? Math.min(1, f.blaze.t / SKILL_TIME.blaze) : 1) : f.mura ? Math.min(1, f.mura.t / SKILL_TIME.murasaki) : f.bow ? Math.min(1, f.bow.t / SKILL_TIME.archery) : f.cloak ? f.cloak.t / SKILL_TIME.cloak : f.veil ? f.veil.t / SKILL_TIME.veil : f.decoyLife / SKILL_TIME.decoy); px(x + 16, y + 18 + 7 * (1 - left), 8, 7 * left, f.skill === 'demon' ? '#6a22b0' : f.gal ? '#3a2aa0' : f.blaze ? '#b8481a' : f.mura ? '#6a2aa0' : f.bow ? '#2a8a4a' : f.cloak ? '#5a4a90' : '#46588a'); }
      else if (!ready) px(x + 16, y + 18 + 7 * (1 - k), 8, 7 * k, '#22343a');
      text('Q', x + 19, y + 19, on ? '#d8c8ff' : ready ? '#8ff0ff' : '#4a5a5c');
    }
    // lives left: a heart and a number in the portrait's top corner
    if (state !== 'training' && settings.lives > 1) {
      const n = f.lives ?? 0;
      px(x + 3, y + 4, 12, 7, 'rgba(8, 10, 9, 0.8)');
      for (const [i, j, w] of [[1, 0, 2], [4, 0, 2], [0, 1, 7], [1, 2, 5], [2, 3, 3], [3, 4, 1]]) px(x + 4 + i, y + 5 + j, w, 1, n > 0 ? '#ff4a5a' : '#4a2a2e');
      text(n, x + 12, y + 5, n > 0 ? '#f2e8e0' : '#5a5450');
    }
    // name, rounds won
    const name = me ? 'YOU' : f.name;
    text(name, x + 27, y + 4, f.alive ? tagColor(f) : '#4a5450');
    if (state !== 'training') for (let i = 0; i < settings.wins; i++) px(x + CW - 4 - (settings.wins - i) * 4, y + 4, 3, 5, i < f.wins ? tagColor(f) : '#2a322f');
    // health with the lost part trailing, stamina under it
    const bx = x + 27, bw = CW - 31;
    f.hpShown ??= f.hp;
    f.hpShown += (Math.max(0, f.hp) - f.hpShown) * Math.min(1, 0.05 + (f.hpShown > f.hp ? 0.04 : 1));
    const k = (v) => Math.max(0, Math.min(1, v / f.maxHp));
    px(bx - 1, y + 10, bw + 2, 7, HUDC.frame);
    px(bx, y + 11, bw, 5, HUDC.barBg);
    px(bx, y + 11, bw * k(f.hpShown), 5, HUDC.hpLost);
    px(bx, y + 11, bw * k(f.hp), 5, HUDC.hp);
    px(bx, y + 11, bw * k(f.hp), 1, HUDC.hpHi);
    px(bx - 1, y + 17, bw + 2, 4, HUDC.frame);
    px(bx, y + 18, bw, 2, HUDC.barBg);
    px(bx, y + 18, (bw * f.stamina) / MAX_STAMINA, 2, HUDC.stamina);
    // the three slots in a row under it: melee, the gun, grenades -
    // what's out is lit and underlined, the rest dimmed, an empty one just its number
    const cw = Math.floor((CW - 2 - 4) / 3), sy = y + 26;
    for (let n = 1; n <= 3; n++) {
      const cx = x + 2 + (n - 1) * (cw + 2), out = f.alive && f.slot === n;
      const g = f.gunIn(n);
      const img = !f.alive ? null : n === 1 ? (f.melee.def.fists ? FIST_ICON : f.melee.def.img) : n === 3 ? (f.grenades > 0 ? NADE_ART[f.nade] : null) : g?.icon;
      px(cx, sy, cw, 1, out ? '#c9a83a' : 'rgba(40, 50, 47, 0.8)');
      if (!img) { text(n, cx + Math.floor((cw - 3) / 2), sy + 4, '#3a4440'); continue; }
      const iw = artW(img), ih = artH(img), res = img.res ?? 1;
      const sc = Math.max(1, Math.floor(Math.min(1, (cw - 2) / iw, 9 / ih) * u * res)) / (u * res);
      ctx.globalAlpha = out ? 1 : 0.5;
      ctx.drawImage(img, Math.round((cx + (cw - iw * sc) / 2) * u), Math.round((sy + 2 + (9 - ih * sc) / 2) * u), Math.round(iw * sc * u), Math.round(ih * sc * u));
      ctx.globalAlpha = 1;
      // under it: rounds (in the mag / left) or grenades left
      let t = n === 3 ? `X${f.grenades}` : g ? `${g.ammo}/${g.reserve}` : '';
      if (g && textWidth(t) > cw) t = String(g.ammo);
      if (!t) continue;
      const col = g && g.ammo === 0 ? HUDC.red : g?.reloading ? '#8ff0ff' : out ? HUDC.text : '#7a847e';
      text(t, cx + Math.floor((cw - textWidth(t)) / 2), sy + 12, col);
    }
    // dead: the portrait goes dark
    if (!f.alive) {
      px(x + 3, y + 4, 20, 20, 'rgba(4, 6, 5, 0.65)');
      if (f.respawnT > 0) text(f.respawnT.toFixed(1), x + 7, y + 14, '#8ff0ff');
      else text(state === 'training' ? 'DOWN' : 'OUT', x + 6, y + 14, HUDC.red);
    }
  }
  return (y + CH + 1) * u;
}
// A skill going (cast, out, or what it called up still about).
const skillOn = (f) => !!f.cloak || !!f.decoy || (!!f.bow && !f.bow.fired) || !!f.mura || !!f.blaze || !!f.gal || !!f.summon || game.demons.some((d) => d.owner === f && d.phase !== 'gone');

// Your skill, bottom right: its picture and name, Q, and how it stands - READY (lit, with a
// flash the moment it comes ready), going, or the wait left as a bar filling back up.
function drawSkillBox(u, W, H, f) {
  const info = SKILL_INFO.find((k) => k.key === f?.skill);
  if (!info || !f.alive) return;
  const cd = Math.max(0, f.skillCD ?? 0), total = SKILL_CD[f.skill], on = skillOn(f), ready = cd <= 0 && !on;
  if (ready && f.readySeen === false) f.readyAt = game.time;
  f.readySeen = ready;
  const flash = Math.max(0, 1 - (game.time - (f.readyAt ?? -9)) / 0.7);
  const w = 132 * u, h = 30 * u, x = W - w - 6 * u, y = H - h - 8 * u;
  const edge = ready ? info.color : on ? '#d8c8ff' : KC.edge;
  kit.rect(x - u, y - u, w + 2 * u, h + 2 * u, KC.ink);
  kit.rect(x, y, w, h, edge);
  kit.rect(x + u, y + u, w - 2 * u, h - 2 * u, 'rgba(11, 16, 14, 0.92)');
  // the picture, dimmed while it waits
  kit.rect(x + 4 * u, y + 4 * u, 22 * u, 22 * u, ready ? info.color : '#26302c');
  kit.rect(x + 5 * u, y + 5 * u, 20 * u, 20 * u, '#0b100e');
  const ctx = kit.ctx;
  ctx.globalAlpha = ready || on ? 1 : 0.35;
  kit.icon(info.img, x + 6 * u, y + 6 * u, 18 * u);
  ctx.globalAlpha = 1;
  // the key, on the picture's corner
  kit.rect(x + 18 * u, y + 18 * u, 9 * u, 9 * u, KC.ink);
  kit.rect(x + 19 * u, y + 19 * u, 7 * u, 7 * u, ready ? KC.gold : '#3a4440');
  kit.text('Q', x + 21 * u, y + 20 * u, { small: true, color: ready ? KC.ink : KC.muted, shadow: null });
  kit.text(info.name, x + 31 * u, y + 5 * u, { color: ready ? '#ffffff' : KC.muted });
  if (ready) {
    const pulse = 0.6 + 0.4 * Math.sin(game.time * 6);
    ctx.globalAlpha = pulse;
    kit.text('READY  -  PRESS Q', x + 31 * u, y + 17 * u, { small: true, color: KC.green });
    ctx.globalAlpha = 1;
  } else if (on) kit.text('IN USE', x + 31 * u, y + 17 * u, { small: true, color: '#d8c8ff' });
  else {
    // the wait: a bar filling back up, the seconds left beside it
    const bw = w - 31 * u - 30 * u, k = Math.max(0, Math.min(1, 1 - cd / total));
    kit.rect(x + 31 * u, y + 18 * u, bw, 5 * u, KC.ink);
    kit.rect(x + 32 * u, y + 19 * u, (bw - 2 * u) * k, 3 * u, info.color);
    kit.text(`${cd.toFixed(1)} S`, x + w - 5 * u, y + 17 * u, { small: true, color: KC.text, align: 'right' });
  }
  if (flash > 0) {
    ctx.globalAlpha = flash * 0.5;
    kit.rect(x, y, w, h, '#ffffff');
    ctx.globalAlpha = 1;
  }
}

// In TEAMS, a bar of each side's colour over its cards, and its name.
function sideBars(px, ours, theirs, place, CW, Wd) {
  if (!teamMode() || state === 'training') return;
  for (const list of [ours, theirs]) {
    if (!list.length) continue;
    const xs = list.map((f) => place.get(f)), x0 = Math.min(...xs), x1 = Math.max(...xs) + CW;
    px(x0, 1, x1 - x0, 2, TEAMS[list[0].team]?.color ?? '#9aa49c');
  }
}
// Cards for a crowd (more than the full ones fit): the face, the name, health, rounds won.
function drawMiniCards(ctx, u, Wd, ours, theirs) {
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x * u), Math.round(y * u), Math.round(w * u), Math.round(h * u)); };
  const n = ours.length + theirs.length, gap = 4, CW = Math.max(40, Math.min(70, Math.floor((Wd - 12 - gap * (n - 1)) / n))), y = 4;
  const place = new Map();
  ours.forEach((f, i) => place.set(f, 6 + i * (CW + gap)));
  theirs.forEach((f, i) => place.set(f, Wd - 6 - CW - i * (CW + gap)));
  sideBars(px, ours, theirs, place, CW, Wd);
  for (const [f, x] of place) {
    const me = f === player && !online.watching;
    px(x, y, CW, 20, 'rgba(8, 11, 10, 0.72)');
    if (me) px(x, y, CW, 1, '#c9a83a');
    px(x + 1, y + 2, 16, 16, HUDC.frame);
    px(x + 2, y + 3, 14, 14, '#2c3526');
    ctx.drawImage(f.parts.head, 5, 0, 22, 21, Math.round((x + 2) * u), Math.round((y + 4) * u), 14 * u, 13 * u);
    if (!f.alive) px(x + 2, y + 3, 14, 14, 'rgba(4, 6, 5, 0.7)');
    let name = me ? 'YOU' : f.name;
    const room = Math.floor((CW - 20) / 4);
    if (name.length > room) name = name.slice(0, room);
    drawText(ctx, name, Math.round((x + 19) * u), Math.round((y + 3) * u), u, f.alive ? tagColor(f) : '#4a5450');
    const bw = CW - 21, k = Math.max(0, Math.min(1, f.hp / f.maxHp));
    px(x + 18, y + 10, bw + 2, 4, HUDC.frame);
    px(x + 19, y + 11, bw, 2, HUDC.barBg);
    if (f.alive) px(x + 19, y + 11, bw * k, 2, HUDC.hp);
    // rounds won (pips), or the seconds till they're back, or OUT
    if (!f.alive) drawText(ctx, f.respawnT > 0 ? f.respawnT.toFixed(1) : 'OUT', Math.round((x + 19) * u), Math.round((y + 15) * u), u, f.respawnT > 0 ? '#8ff0ff' : HUDC.red);
    else for (let i = 0; i < Math.min(settings.wins, Math.floor(bw / 4)); i++) px(x + 19 + i * 4, y + 15, 3, 3, i < f.wins ? tagColor(f) : '#2a322f');
  }
  return (y + 21) * u;
}

// Hold TAB: the scores - every fighter's rounds, kills, deaths and lives, each side on its own in TEAMS.
function drawScores(ctx, u, W, H) {
  const list = game.fighters.filter((f) => !f.isDecoy && !f.dummy);
  const order = (a, b) => b.wins - a.wins || b.kills - a.kills || (a.deaths ?? 0) - (b.deaths ?? 0);
  const groups = teamMode() ? [0, 1].map((t) => list.filter((f) => f.team === t).sort(order)) : [list.sort(order)];
  const rowH = 12 * u, lives = settings.lives > 1;
  const pw = Math.min(W - 16 * u, 340 * u), ph = 26 * u + 12 * u + groups.reduce((h, g) => h + g.length * rowH + (teamMode() ? 16 * u : 0), 0) + 4 * u;
  const px = Math.round(W / 2 - pw / 2), py = Math.max(8 * u, Math.round(H / 2 - ph / 2));
  ctx.fillStyle = 'rgba(5, 8, 7, 0.45)';
  ctx.fillRect(0, 0, W, H);
  let y = kit.panel(px, py, pw, ph, { title: 'SCORES', note: `${level.name}   ROUND ${Math.max(1, round)}   FIRST TO ${settings.wins}` });
  const col = { name: px + 22 * u, rounds: px + pw - 118 * u, kills: px + pw - 84 * u, deaths: px + pw - 50 * u, lives: px + pw - 12 * u };
  for (const [k, label] of [['rounds', 'ROUNDS'], ['kills', 'KILLS'], ['deaths', 'DEATHS'], ...(lives ? [['lives', 'LIVES']] : [])]) kit.text(label, col[k], y, { small: true, color: KC.faint, align: 'right' });
  kit.text('NAME', col.name, y, { small: true, color: KC.faint });
  y += 10 * u;
  for (const g of groups) {
    if (teamMode() && g.length) {
      const t = TEAMS[g[0].team], won = Math.max(0, ...g.map((f) => f.wins));
      kit.rect(px + 4 * u, y, pw - 8 * u, 13 * u, g[0].team ? 'rgba(255, 106, 90, 0.2)' : 'rgba(106, 216, 255, 0.2)');
      kit.rect(px + 4 * u, y, 2 * u, 13 * u, t.color);
      kit.text(`${t.name} TEAM`, px + 10 * u, y + 3 * u, { color: t.color });
      kit.text(`${won}`, col.rounds, y + 3 * u, { color: t.color, align: 'right' });
      y += 16 * u;
    }
    g.forEach((f, i) => {
      const me = f === player && !online.watching;
      kit.rect(px + 4 * u, y - 2 * u, pw - 8 * u, rowH, me ? KC.row : i % 2 ? KC.rowAlt : 'rgba(0, 0, 0, 0)');
      kit.rect(px + 10 * u, y, 6 * u, 7 * u, tagColor(f));
      const nw = kit.text(me ? `${f.name === 'YOU' ? 'YOU' : f.name + ' (YOU)'}` : f.name, col.name, y, { color: f.alive ? '#ffffff' : KC.muted });
      if (f.bot) kit.text('BOT', col.name + nw + 5 * u, y + u, { small: true, color: KC.faint });
      else if (!f.alive && f.respawnT <= 0) kit.text('OUT', col.name + nw + 5 * u, y + u, { small: true, color: KC.red });
      kit.text(f.wins, col.rounds, y, { align: 'right', color: KC.gold });
      kit.text(f.kills, col.kills, y, { align: 'right' });
      kit.text(f.deaths ?? 0, col.deaths, y, { align: 'right', color: KC.muted });
      if (lives) kit.text(f.lives ?? 0, col.lives, y, { align: 'right', color: (f.lives ?? 0) > 0 ? '#ff8a8a' : KC.faint });
      y += rowH;
    });
  }
}

function drawCrosshair(ctx, u) {
  if (!input.mouse.active || online.watching) return;
  const d = renderer.dpr, x = Math.round(input.mouse.x * d), y = Math.round(input.mouse.y * d);
  const spread = player.weapon ? Math.round(2 + player.weapon.recoil * 1.2) : 2;
  for (const [col, o] of [['#050604', 1], ['#e8ffd0', 0]]) {
    ctx.fillStyle = col;
    for (const [dx, dy, w, h] of [[-spread - 3, 0, 3, 1], [spread + 1, 0, 3, 1], [0, -spread - 3, 1, 3], [0, spread + 1, 1, 3]]) ctx.fillRect(x + (dx - o * 0) * u - o * u, y + dy * u - o * u, (w + o * 2) * u, (h + o * 2) * u);
  }
  ctx.fillStyle = '#ff5a4a';
  ctx.fillRect(x, y, u, u);
  // reloading: a ring round the crosshair filling up
  const w = player.weapon;
  if (w && w.reloading) {
    const k = w.def.reload === 'shells' ? Math.min(1, (w.ammo + Math.max(0, w.reload)) / w.magSize) : Math.max(0, Math.min(1, w.reload));
    const R = 10 * u;
    ctx.save();
    ctx.lineWidth = 3 * u;
    ctx.strokeStyle = 'rgba(5, 6, 4, 0.75)';
    ctx.beginPath(); ctx.arc(x + u / 2, y + u / 2, R, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = Math.max(1, 1.5 * u);
    ctx.strokeStyle = '#8ff0ff';
    ctx.beginPath(); ctx.arc(x + u / 2, y + u / 2, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
    ctx.restore();
    drawText(ctx, 'RELOAD', Math.round(x - textWidth('RELOAD') * u / 2), Math.round(y + R + 4 * u), u, '#8ff0ff');
  }
}

// The room's setup screen (single player): the settings in two columns (click a
// half, or W S to pick and A D to change), the controls, START.
let menuSel = 0;
const CONTROLS = [
  'A D  WALK      A A / D D  RUN      W / SPACE  JUMP (TWICE IN THE AIR)      S  CROUCH      S S  DROP DOWN',
  'SHIFT  ROLL      MOUSE  AIM AND SHOOT      R  RELOAD      Q  SKILL      F / RIGHT CLICK  QUICK MELEE',
  '1  MELEE      2  GUN      3  GRENADE      G  THROW WHAT YOU HOLD      E  PICK UP / SWAP',
  'HIT SOMEONE WITH MELEE AS THEY SHOOT AND THEIR GUN FLIES OUT OF THEIR HANDS',
];
function drawTitle(ctx, u, W, H) {
  kit.shade(0.62);
  const pw = Math.min(W - 16 * u, 440 * u), px = Math.round(W / 2 - pw / 2);
  let y = 10 * u;
  kit.text('SINGLE PLAYER', W / 2, y, { size: 3, color: KC.gold, align: 'center' });
  y += 28 * u;
  const rows = Math.ceil(OPTIONS.length / 2), rowH = 12 * u, colW = Math.floor((pw - 18 * u) / 2), ph = 26 * u + rows * rowH;
  const cy = kit.panel(px, y, pw, ph, { title: 'ROOM SETUP', note: 'CLICK A SIDE, OR A / D, TO CHANGE' });
  OPTIONS.forEach(([k, label, vals], i) => {
    const c = Math.floor(i / rows), r = i % rows;
    let shown = vals.find(([v]) => v === settings[k])?.[1] ?? '?';
    if (k === 'bots' && teamMode()) shown = '3 (2 V 2)';
    const ox = px + 6 * u + c * (colW + 6 * u), oy = cy + r * rowH;
    if (k === 'myskill' || k === 'botskill') {
      if (menuSel === i) kit.rect(ox, oy, colW, rowH - u, KC.row);
      kit.select(`pick:${k}`, ox, oy, colW, rowH - u, label, settings.skills ? shown : 'OFF', { enabled: !!settings.skills, img: settings.skills ? SKILL_INFO.find((s) => s.key === settings[k])?.img : null });
    } else kit.stepper(`opt:${i}`, ox, oy, colW, rowH - u, label, shown, { selected: menuSel === i });
  });
  y += ph + 8 * u;
  // the controls, if there's room
  const ch = 26 * u + CONTROLS.length * 9 * u;
  if (y + ch + 40 * u < H) {
    const ty = kit.panel(px, y, pw, ch, { title: 'CONTROLS', accent: KC.teal });
    CONTROLS.forEach((l, i) => kit.text(l, px + 8 * u, ty + i * 9 * u, { small: true, color: i === CONTROLS.length - 1 ? '#ffa080' : KC.text }));
    y += ch + 8 * u;
  }
  kit.button('back', px, y, 80 * u, 18 * u, 'BACK');
  kit.button('start', px + pw - 130 * u, y, 130 * u, 18 * u, 'START MATCH', { kind: 'primary', selected: menuSel === OPTIONS.length });
  kit.hints('W S  PICK A SETTING      A D / CLICK  CHANGE IT      ENTER  START      ESC  BACK');
  drawPicker();
}

// The list for YOUR SKILL or BOT SKILLS; the pick goes into the setting.
function pickSkillSetting(k) {
  const bots = k === 'botskill';
  openPicker(`pk-${k}`, bots ? 'BOT SKILLS' : 'YOUR SKILL', skillItems(bots), settings[k], (key) => {
    settings[k] = key;
    saveSettings();
    if (state === 'title') { makeFighters(); startRound(); round = 0; state = 'title'; banner = null; }
  });
}

// Step a setting one way or the other.
function changeSetting(i, dir) {
  const [k, , vals] = OPTIONS[i];
  const at = vals.findIndex(([v]) => v === settings[k]);
  settings[k] = vals[(at + dir + vals.length) % vals.length][0];
  saveSettings();
  if (k === 'map') loadMap(settings.map === 'random' ? 'lab' : settings.map);   // the backdrop shows the map picked
  makeFighters();
  startRound();   // everyone placed again for the backdrop
  round = 0;
  state = 'title';
  banner = null;
}

function titleInput() {
  const n = OPTIONS.length + 1;
  if (input.wasPressed('KeyW', 'ArrowUp')) menuSel = (menuSel + n - 1) % n;
  if (input.wasPressed('KeyS', 'ArrowDown')) menuSel = (menuSel + 1) % n;
  if (menuSel < OPTIONS.length) {
    if (input.wasPressed('KeyA', 'ArrowLeft')) changeSetting(menuSel, -1);
    if (input.wasPressed('KeyD', 'ArrowRight')) changeSetting(menuSel, 1);
  }
  const c = kit.click;
  if (c?.startsWith('opt:')) {
    const [, i, dir] = c.split(':');
    menuSel = +i;
    return changeSetting(+i, +dir);
  }
  if (c?.startsWith('pick:')) return pickSkillSetting(c.slice(5));
  if (c === 'start' || input.wasPressed('Enter') || (menuSel === OPTIONS.length && input.wasPressed('Space'))) return startMatch();
  if (c === 'back' || input.wasPressed('Escape')) state = 'menu';   // back to the main menu
}

// The match over: who won, everyone's rounds and kills, what next.
function drawMatch(ctx, u, W, H) {
  kit.shade(0.74);
  const c = champion, rows = game.fighters.filter((f) => !f.isDecoy).sort((a, b) => b.wins - a.wins || b.kills - a.kills);
  const pw = Math.min(W - 16 * u, 320 * u), rowH = 11 * u, ph = 26 * u + 24 * u + 12 * u + rows.length * rowH + 30 * u;
  const px = Math.round(W / 2 - pw / 2), py = Math.max(8 * u, Math.round(H / 2 - ph / 2));
  let y = kit.panel(px, py, pw, ph, { title: 'MATCH OVER' });
  const head = teamMode() ? `${TEAMS[c.team].name} TEAM WINS` : c === player ? 'YOU WIN!' : `${c.name} WINS`;
  kit.text(head, W / 2, y, { size: 2, color: tagColor(c), align: 'center' });
  y += 24 * u;
  const colR = px + pw - 70 * u, colK = px + pw - 12 * u;
  kit.text('#', px + 10 * u, y, { small: true, color: KC.faint });
  kit.text('NAME', px + 24 * u, y, { small: true, color: KC.faint });
  kit.text('ROUNDS', colR, y, { small: true, color: KC.faint, align: 'right' });
  kit.text('KILLS', colK, y, { small: true, color: KC.faint, align: 'right' });
  y += 10 * u;
  rows.forEach((o, i) => {
    kit.rect(px + 4 * u, y - 2 * u, pw - 8 * u, rowH, o === player ? KC.row : i % 2 ? KC.rowAlt : 'rgba(0, 0, 0, 0)');
    kit.text(i + 1, px + 10 * u, y, { color: i === 0 ? KC.gold : KC.muted });
    kit.text(o === player && o.name !== 'YOU' ? `${o.name} (YOU)` : o.name, px + 24 * u, y, { color: tagColor(o) });
    kit.text(o.wins, colR, y, { align: 'right' });
    kit.text(o.kills, colK, y, { align: 'right' });
    y += rowH;
  });
  y += 8 * u;
  if (online.active) {
    if (online.isHost) kit.button('back-room', px + 8 * u, y, pw - 16 * u, 18 * u, 'BACK TO THE ROOM', { kind: 'primary', disabled: stateT < 2 });
    else kit.text('THE HOST WILL TAKE EVERYONE BACK TO THE ROOM', W / 2, y + 6 * u, { small: true, color: KC.muted, align: 'center' });
    return;
  }
  const bw = Math.floor((pw - 16 * u - 12 * u) / 3);
  kit.button('rematch', px + 8 * u, y, bw, 18 * u, 'REMATCH', { kind: 'primary', disabled: stateT < 1 });
  kit.button('setup', px + 8 * u + bw + 6 * u, y, bw, 18 * u, 'ROOM SETUP');
  kit.button('menu', px + 8 * u + (bw + 6 * u) * 2, y, bw, 18 * u, 'MAIN MENU');
}
function matchInput() {
  const c = kit.click;
  if (stateT > 1 && (c === 'rematch' || input.wasPressed('Enter'))) startMatch();
  else if (c === 'setup' || input.wasPressed('KeyS')) { state = 'title'; banner = null; }
  else if (c === 'menu' || input.wasPressed('Escape')) { state = 'menu'; banner = null; }
}

// ---------- training ----------
// A big test room: the armory's cabinets (open one with E - every gun and
// melee weapon, the skills, medkits and drinks), a firing range with dummies,
// a movement course, a grapple shaft and a yard of crates to smash (they come
// back) - with the main game's DPS meter.

const stats = {
  dps: 0, peak: 0, total: 0, hits: 0, heads: 0, last: 0, lastT: -9, recent: [],
  record(dmg, kind) {
    this.total += dmg; this.hits++; if (kind === 'head') this.heads++;
    this.last = dmg; this.lastT = game.time;
    this.recent.push([game.time, dmg]);
  },
  update() {
    this.recent = this.recent.filter(([t]) => game.time - t < 2);
    this.dps = this.recent.reduce((s, [, d]) => s + d, 0) / 2;
    this.peak = Math.max(this.peak, this.dps);
  },
  reset() { Object.assign(this, { dps: 0, peak: 0, total: 0, hits: 0, heads: 0, last: 0, lastT: -9, recent: [] }); },
};

function startTraining() {
  loadMap('training');
  state = 'training';
  stateT = 0;
  slow = 1;
  paused = false;
  banner = { text: 'TRAINING', sub: 'TAB (OR E AT A CABINET) FOR GUNS, SKILLS AND MEDKITS - ESC FOR THE MENU', t: 2.4, color: '#8ff0ff' };
  locker = null;
  game.bullets = []; game.grenades = []; game.pickups = []; game.feed = []; game.blasts = []; game.thrown = []; game.numbers = []; game.arrows = []; game.voids = []; game.fists = []; game.galaxies = []; game.demons = []; game.punches = [];
  stats.reset();
  player = new Fighter(game, images, ROSTER[0]);
  player.team = 0;
  player.immortal = true;
  player.reset(level.spawns[0].x, level.spawns[0].y);
  player.grenades = 3;
  // the dummies: a crash-test look, they never go down
  const dummies = level.dummies.map((d) => {
    const f = new Fighter(game, images, { name: 'DUMMY', color: '#e8c86a', hue: 30, sat: 0 });   // grey, like a crash-test dummy
    f.team = 9;
    f.reset((d.x + 0.5) * 16, d.y * 16);
    f.gun = null;
    f.give(pick(GUN_POOL), 0);   // something in its hands (it never fires it)
    f.slot = 2;
    f.grenades = 0;
    f.dummy = f.immortal = true;
    f.patrol = d.patrol ? d.patrol.map((c) => (c + 0.5) * 16) : null;
    f.walk = 1;
    return f;
  });
  game.fighters = [player, ...dummies];
  decoys = [];
  bots = [];
  // every crate and drum, to put it back a while after it's smashed
  game.racks = level.props.map((spec, i) => ({ spec, prop: game.props[i], t: 0 }));
  hintEl.classList.remove('fade');
  setTimeout(() => hintEl.classList.add('fade'), 9000);
}

// Training each frame: smashed crates come back, dummies heal up and the walking one walks.
const AT_EASE = 0.6;   // how far down (rad) a dummy points its gun
function updateTraining(dt) {
  if (state !== 'training') return;
  stats.update();
  for (const r of game.racks) {
    if (!r.prop.dead) continue;
    if ((r.t += dt) < 6) continue;
    // not into someone standing there
    const { x, y } = r.spec;
    if (game.fighters.some((f) => f.alive && Math.abs(f.x - x) < 16 && f.y > y - 30 && f.y - 28 < y)) continue;
    [r.prop] = placeProps([r.spec], level);
    r.t = 0;
    game.props.push(r.prop);
    game.fx.sparks(x, y - r.prop.h / 2, 8, 0, -1, '#8ff0ff');
  }
  for (const f of game.fighters) {
    if (!f.dummy) continue;
    if (f.hurtT > 2.5) f.hp = f.maxHp;   // back to full a moment after the last hit
    // (the gun held low, pointed at the floor a way ahead - at ease)
    const ease = (dir) => (dir > 0 ? AT_EASE : Math.PI - AT_EASE);
    let c = IDLE;
    if (f.patrol) {
      if (f.x < f.patrol[0]) f.walk = 1;
      if (f.x > f.patrol[1]) f.walk = -1;
      c = { ...IDLE, move: f.walk * 0.6, aim: ease(f.walk) };
    } else c = { ...IDLE, aim: ease(player.hidden ? f.facing : player.x < f.x ? -1 : 1) };   // (you cloaked: they don't see you come)
    f.update(dt, c);
  }
  if (player.hurtT > 2.5) player.hp = Math.min(player.maxHp, player.hp + player.maxHp * dt);
  // the player infinite on grenades in here
  if (player.grenades < 1 && player.grenadeCD <= 0) player.grenades = 1;
}

// ---------- training: the cabinets ----------
// Walk up to one and press E: a panel of what's in it, in tabs. Take as much
// as you like - it stays open; ESC or E shuts it. Each cabinet is a list, so
// adding more (skills, items) is adding to it.

const DRINK = sprite(6, 10, (g) => {
  rect(g, K, 0, 0, 6, 10); rect(g, '#c8d0d4', 1, 1, 4, 1); rect(g, '#2a9ad8', 1, 2, 4, 7); rect(g, '#1a6aa0', 4, 2, 1, 7);
  rect(g, '#ffd25a', 2, 3, 2, 1); rect(g, '#ffd25a', 1, 4, 2, 1); rect(g, '#ffd25a', 2, 5, 2, 1); rect(g, '#ffd25a', 3, 6, 1, 1);   // a lightning bolt
});
const AMMO = sprite(11, 9, (g) => {
  rect(g, K, 0, 3, 11, 6); rect(g, '#4a5a3a', 1, 4, 9, 4); rect(g, '#5e7048', 1, 4, 9, 1); rect(g, '#2a3424', 4, 6, 3, 1);
  for (let i = 0; i < 4; i++) { rect(g, '#e8b84a', 2 + i * 2, 1, 1, 3); rect(g, '#b8892e', 2 + i * 2, 0, 1, 1); }
});
const GRAPPLE_ICON = sprite(12, 10, (g) => {
  for (let i = 0; i < 8; i++) rect(g, '#eef6ff', 1 + i, 9 - Math.round(i * 0.85), 1, 1);
  rect(g, '#4a5560', 8, 0, 4, 4); rect(g, '#c8d4dc', 9, 1, 2, 2); rect(g, '#c8d4dc', 11, 0, 1, 1); rect(g, '#c8d4dc', 8, 3, 1, 1);
});
const CLOAK_ICON = sprite(11, 11, (g) => {
  // a hooded figure fading out, a knife held point down
  for (let j = 0; j < 11; j++) for (let i = 0; i < 7; i++) {
    const head = Math.hypot(i - 3, j - 3) < 3, body = j > 5 && Math.abs(i - 3) < 2 + (j - 5) * 0.4;
    if ((head || body) && (i + j) % 2 === 0) rect(g, '#7a6aa8', i, j, 1, 1);
  }
  rect(g, '#d8dce0', 9, 4, 1, 5); rect(g, '#5a4a3a', 8, 2, 3, 2);
});
// a stopwatch for the cooldown switch; struck through when it's off
const CLOCK = (off) => sprite(9, 10, (g) => {
  rect(g, K, 3, 0, 3, 1);
  for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) {
    const d = Math.hypot(i - 4, j - 5);
    if (d < 4.4) rect(g, d > 3.3 ? '#c8d0d4' : '#1d3a44', i, j + 1, 1, 1);
  }
  rect(g, '#8ff0ff', 4, 3, 1, 3); rect(g, '#8ff0ff', 5, 5, 2, 1);
  if (off) for (let i = 0; i < 9; i++) rect(g, '#c83a2a', i, 9 - i, 1, 1);
});
const CLOCK_ON = CLOCK(false), CLOCK_OFF = CLOCK(true);
let skillCooldowns = false;   // training: off to start (use a skill as often as you like)
const CLONE_ICON = sprite(13, 11, (g) => {
  // two figures, one solid, one a dark shadow beside it, mist at their feet
  const fig = (ox, a, b) => {
    for (let j = 0; j < 9; j++) for (let i = 0; i < 5; i++) {
      const head = Math.hypot(i - 2, j - 2) < 2.2, body = j > 3 && Math.abs(i - 2) < 1.5 + (j - 4) * 0.25;
      if (head || body) rect(g, i + j < 5 ? a : b, ox + i, j, 1, 1);
    }
  };
  fig(6, '#5a6a9a', '#3a4670');
  fig(1, '#d8dce0', '#9aa4b0');
  for (let i = 0; i < 13; i += 2) rect(g, '#7a8aaa', i, 9 + (i % 4 ? 1 : 0), 2, 1);
});
const BOW_ICON = sprite(12, 12, (g) => {
  // a bow of light drawn back, an arrow on it pointing up and out
  for (let i = 0; i <= 10; i++) { const a = -0.2 - (i / 10) * 1.9; rect(g, i === 5 ? '#ffffff' : '#5aff7a', Math.round(6 + Math.cos(a + 0.75) * 5), Math.round(6 + Math.sin(a + 0.75) * 5), 1, 1); }
  for (let i = 0; i < 9; i++) rect(g, i > 6 ? '#ffffff' : '#c8ffc8', 2 + i, 9 - i, 1, 1);
  rect(g, '#d8ffd8', 9, 1, 2, 1); rect(g, '#d8ffd8', 10, 2, 1, 2);
});
const VOID_ICON = sprite(13, 11, (g) => {
  // a red and a blue orb either side of a purple one
  const orb = (cx, cy, r, rim, core) => { for (let j = -r - 1; j <= r + 1; j++) for (let i = -r - 1; i <= r + 1; i++) { const d = Math.hypot(i, j); if (d <= r + 0.4) rect(g, d > r - 1.2 ? rim : core, cx + i, cy + j, 1, 1); } };
  orb(2, 3, 1.6, '#ff3a4a', '#30000a');
  orb(10, 3, 1.6, '#3a9aff', '#000a2a');
  orb(6, 6, 3.4, '#b050ff', '#12001e');
  rect(g, '#f0d8ff', 4, 4, 1, 1);
});
const FIST_FIRE_ICON = sprite(11, 12, (g) => {
  // a fist with fire going up off it
  for (const [c, x, y, w, h] of [
    ['#7a1c12', 2, 0, 1, 2], ['#7a1c12', 7, 1, 1, 2], ['#d8341a', 3, 1, 2, 3], ['#d8341a', 6, 2, 2, 2], ['#ff6a1a', 2, 3, 7, 2],
    ['#ffa92a', 3, 4, 5, 2], ['#ffe066', 4, 5, 3, 1],
    ['#1a1410', 1, 6, 9, 6], ['#f0c4b0', 2, 7, 7, 4], ['#d8a08c', 2, 10, 7, 1], ['#d8a08c', 4, 7, 1, 3], ['#d8a08c', 6, 7, 1, 3],
  ]) rect(g, c, x, y, w, h);
});
const GALAXY_ICON = sprite(13, 11, (g) => {
  // a dark sphere with a violet rim and a white slash across it
  for (let j = 0; j < 11; j++) for (let i = 0; i < 13; i++) {
    const d = Math.hypot(i - 6, j - 5);
    if (d <= 4.6) rect(g, d > 3.6 ? '#b67aff' : d > 2.8 ? '#7af0ff' : '#24086a', i, j, 1, 1);
  }
  for (let i = 0; i < 13; i++) { const j = Math.round(8 - i * 0.55); rect(g, i > 3 && i < 9 ? '#ffffff' : '#c8fbff', i, j, 1, 1); }
});
const DEMON_ICON = sprite(11, 12, (g) => {
  // the golem's horned obsidian skull, white-hot eyes, a glowing maw, dark fire behind it
  for (const [c, x, y, w, h] of [
    ['#6a22b0', 4, 0, 3, 3], ['#a24ef0', 5, 1, 1, 2], ['#2e1052', 0, 0, 2, 2], ['#2e1052', 9, 0, 2, 2], ['#2e1052', 1, 2, 2, 2], ['#2e1052', 8, 2, 2, 2],
    ['#0c0612', 1, 3, 9, 9], ['#2e1052', 2, 4, 7, 7], ['#4a1c80', 2, 4, 7, 1],
    ['#0c0612', 2, 6, 7, 1], ['#ffffff', 3, 6, 2, 1], ['#ffffff', 6, 6, 2, 1], ['#a24ef0', 2, 6, 1, 1], ['#a24ef0', 8, 6, 1, 1],
    ['#6a22b0', 3, 8, 5, 2], ['#d49cff', 3, 8, 1, 1], ['#d49cff', 5, 8, 1, 1], ['#d49cff', 7, 8, 1, 1],
  ]) rect(g, c, x, y, w, h);
});
const NO_SKILL = sprite(9, 9, (g) => {
  for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) { const d = Math.hypot(i - 4, j - 4); if (d > 3 && d < 4.6) rect(g, '#c83a2a', i, j, 1, 1); }
  for (let i = 1; i < 8; i++) rect(g, '#c83a2a', i, 8 - i, 1, 1);
});

// Every skill: its name, picture, colour and what it does (for the lists to pick one from, and the skill bay).
const SKILL_INFO = [
  { key: 'grapple', name: 'GRAPPLE LINE', img: GRAPPLE_ICON, color: '#9ad0ff', desc: 'SHOOT A LINE AND ZIP TO WHERE YOU AIM' },
  { key: 'cloak', name: 'CLOAK', img: CLOAK_ICON, color: '#a89aff', desc: '8 S UNSEEN WITH A KNIFE - ONE STAB, X4.5 IN THE BACK' },
  { key: 'decoy', name: 'SHADOW CLONE', img: CLONE_ICON, color: '#8aa8ff', desc: 'A DOUBLE OUT OF THE MIST FIGHTS FOR YOU, 3 S UNSEEN' },
  { key: 'archery', name: 'ARCHERY', img: BOW_ICON, color: '#7aff8a', desc: 'LOCK ON TO EVERY FOE NEAR, AN ARROW SPLITS FOR THEM ALL' },
  { key: 'murasaki', name: 'MURASAKI', img: VOID_ICON, color: '#c07aff', desc: 'RED AND BLUE MADE ONE: A PURPLE THAT ERASES ALL IN ITS LINE' },
  { key: 'blaze', name: 'FLAME FIST', img: FIST_FIRE_ICON, color: '#ff9a4a', desc: 'FISTS ALIGHT, THEN A DASH AND A PUNCH THE WAY YOU AIM' },
  { key: 'galaxy', name: 'GALAXY', img: GALAXY_ICON, color: '#7af0ff', desc: 'A BLACK HOLE WHERE YOU AIM: DRAGS THEM IN, THEN GOES OFF' },
  { key: 'demon', name: 'ABYSS GOLEM', img: DEMON_ICON, color: '#b06aff', desc: 'A GOLEM OF BLACK FIRE FIGHTS AT YOUR BACK FOR 12 S' },
];
// the choices for a pick list: each skill (with its wait), then none - and for the bots, RANDOM first
function skillItems(forBots = false) {
  const list = SKILL_INFO.map((k) => ({ key: k.key, label: k.name, desc: k.desc, img: k.img, color: k.color, note: `${SKILL_CD[k.key]} S` }));
  if (forBots) list.unshift({ key: 'random', label: 'RANDOM', desc: 'EACH BOT GETS ONE OF THEM AT RANDOM, NEW EVERY MATCH', color: KC.gold });
  list.push({ key: null, label: forBots ? 'NONE' : 'NO SKILL', desc: forBots ? 'THE BOTS GO WITHOUT' : 'GO WITHOUT ONE', img: NO_SKILL, color: '#c83a2a' });
  return list;
}
const skillName = (key) => SKILL_INFO.find((k) => k.key === key)?.name ?? (key === 'random' ? 'RANDOM' : 'NO SKILL');

// The pick list open over a screen: { id, title, items, current, apply(key), sel }.
let picker = null;
function openPicker(id, title, items, current, apply) {
  picker = { id, title, items, current, apply, sel: Math.max(0, items.findIndex((it) => it.key === current)) };
}
function pickerInput() {
  const c = kit.click, P = picker, n = P.items.length, cols = renderer.width >= 440 * hudScale() ? 3 : 2;
  if (input.wasPressed('KeyA', 'ArrowLeft')) P.sel = (P.sel + n - 1) % n;
  if (input.wasPressed('KeyD', 'ArrowRight')) P.sel = (P.sel + 1) % n;
  if (input.wasPressed('KeyW', 'ArrowUp')) P.sel = (P.sel - cols + n) % n;
  if (input.wasPressed('KeyS', 'ArrowDown')) P.sel = (P.sel + cols) % n;
  const i = c?.startsWith(`${P.id}:`) ? c.slice(P.id.length + 1) : null;
  if (i === 'close' || input.wasPressed('Escape')) picker = null;
  else if ((i !== null && i !== '') || input.wasPressed('Enter', 'Space')) {
    const it = P.items[i !== null ? +i : P.sel];
    picker = null;
    if (it) P.apply(it.key);
  }
}
const drawPicker = () => { if (picker) kit.choices(picker.id, picker.title, picker.items, picker.current, picker.sel); };

const gunItem = (d) => ({ kind: 'gun', key: d.key, name: d.name, img: iconOf(d.key), def: d });
const LOCKERS = {
  guns: { name: 'GUN LOCKER', tabs: () => [
    ...WEAPON_CLASSES.filter((c) => c.guns.length).map((c) => ({ label: c.label, items: c.guns.map(gunItem) })),
    { label: 'MELEE', items: Object.entries(MELEE).filter(([, d]) => !d.skillOnly).map(([k, d]) => ({ kind: 'melee', key: k, name: d.name, img: d.img, def: d })) },
    { label: 'SUPPLIES', items: [
      { kind: 'ammo', name: 'AMMO', img: AMMO, desc: 'TOPS UP YOUR GUN - THE MAG AND THE SPARES' },
      { kind: 'nades', key: 'frag', name: 'FRAG GRENADES', img: NADES, desc: '4 OF THEM - THEY GO OFF A MOMENT AFTER THEY LAND' },
      { kind: 'nades', key: 'impact', name: 'IMPACT GRENADES', img: IMPACT_PAIR, desc: '4 OF THEM - THEY GO OFF THE MOMENT THEY HIT' },
    ] },
  ] },
  skills: { name: 'SKILL BAY', tabs: () => [{ label: 'SKILLS', items: [
    ...SKILL_INFO.map((k) => ({ kind: 'skill', key: k.key, name: k.name, img: k.img, desc: `Q - ${k.desc}` })),
    { kind: 'skill', key: null, name: 'NO SKILL', img: NO_SKILL, desc: 'GO WITHOUT ONE' },
    { kind: 'cooldown', get name() { return skillCooldowns ? 'COOLDOWN ON' : 'COOLDOWN OFF'; }, get img() { return skillCooldowns ? CLOCK_ON : CLOCK_OFF; },
      get desc() { return skillCooldowns ? 'A WAIT BETWEEN USES, AS IN A FIGHT - TAKE TO TURN IT OFF' : 'NO WAIT BETWEEN USES - TAKE TO TURN IT ON'; } },
    { kind: 'soon', name: 'MORE SOON', desc: 'MORE SKILLS ARE ON THE WAY' },
  ] }] },
  med: { name: 'MED CABINET', tabs: () => [{ label: 'MEDICAL', items: [
    { kind: 'heal', name: 'MEDKIT', img: MEDKIT, desc: 'BACK TO FULL HEALTH' },
    { kind: 'drink', name: 'ENERGY DRINK', img: DRINK, desc: 'FULL STAMINA - AND RUNNING COSTS NOTHING FOR 15 S' },
  ] }] },
  // TAB, anywhere in training: all three cabinets in one
  all: { name: 'ARMORY', close: 'ESC / TAB - CLOSE', tabs: () => [...LOCKERS.guns.tabs(), ...LOCKERS.skills.tabs(), ...LOCKERS.med.tabs()] },
};

let locker = null;   // the open cabinet: { use, tabs, tab, sel, scroll, flash } (and where it drew things, for the mouse)

// the cabinet the player is standing at (training only)
function cabinetNear() {
  if (state !== 'training' || !player.alive) return null;
  for (const d of level.deco) {
    if (!d.use) continue;
    const l = d.x * T, r = (d.x + d.w) * T, floor = (d.y + d.h) * T;
    if (player.x > l - 4 && player.x < r + 4 && Math.abs(player.y - floor) < 6) return d;
  }
  return null;
}
// each panel opens again on the tab (and the pick, and how far down) it was left on
const lockerLeft = {};
function openLocker(d) {
  const tabs = LOCKERS[d.use].tabs(), m = lockerLeft[d.use] ?? { tab: 0, sel: 0, scroll: 0 }, tab = Math.min(m.tab, tabs.length - 1);
  const sel = Math.min(m.sel, tabs[tab].items.length - 1);
  locker = { use: d.use, tabs, tab, sel, scroll: m.scroll, flash: null, fresh: true, cols: 5, rows: 3, tabRects: [], cellRects: [] };
}

// what's already yours (marked in the panel)
function owned(it) {
  const f = player;
  if (it.kind === 'gun') return f.gun?.def.key === it.key;
  if (it.kind === 'melee') return f.melee.def.key === it.key;
  if (it.kind === 'skill') return (f.skill ?? null) === it.key;
  if (it.kind === 'nades') return f.nade === it.key && f.grenades > 0;
  return false;
}
function takeItem(it) {
  const f = player;
  if (it.kind === 'gun') { f.give(it.key, it.def.magSize * 6); f.select(f.slotFor(it.def)); }
  else if (it.kind === 'melee') { f.giveMelee(MELEE[it.key]); f.select(1); }
  else if (it.kind === 'nades') { f.nade = it.key; f.grenades = 4; }
  else if (it.kind === 'ammo') for (const w of [f.gun]) {
    if (!w) continue;
    w.ammo = w.magSize;
    w.ammoSource.give(null, Math.max(0, w.magSize * 6 - w.reserve));
  }
  else if (it.kind === 'skill') { f.uncloak(); f.dropDecoy(); f.bow = null; f.mura = null; f.blaze = null; f.gal = null; f.summon = null; f.skill = it.key; f.skillCD = 0; f.hook = null; }
  else if (it.kind === 'cooldown') { skillCooldowns = !skillCooldowns; f.skillCD = 0; }
  else if (it.kind === 'heal') { f.hp = f.maxHp; game.fx.sparks(f.x, f.y - 14, 10, 0, -1, '#8aff9a'); }
  else if (it.kind === 'drink') { f.stamina = MAX_STAMINA; f.winded = false; f.boostT = 15; game.fx.sparks(f.x, f.y - 14, 8, 0, -1, '#8ff0ff'); }
  else return false;
  return true;
}

// The panel's keys and mouse: 1-9 or a click for the tabs; arrows / WASD
// round the grid (the wheel scrolls it); ENTER, SPACE or a click takes it.
function lockerInput(dt) {
  const L = locker;
  if (state !== 'training') { locker = null; return; }
  if (paused) return;
  if (L.flash) L.flash.t -= dt;
  if (L.fresh) { L.fresh = false; return; }   // (the frame it opened: that E isn't a close)
  if (input.wasPressed('KeyE', 'Mouse2', 'Tab')) { locker = null; return; }
  const setTab = (i) => { if (i === L.tab) return; L.tab = i; L.sel = 0; L.scroll = 0; };
  for (let i = 0; i < Math.min(9, L.tabs.length); i++) if (input.wasPressed('Digit' + (i + 1))) setTab(i);
  const items = L.tabs[L.tab].items, n = items.length;
  if (input.wasPressed('KeyA', 'ArrowLeft')) L.sel = Math.max(0, L.sel - 1);
  if (input.wasPressed('KeyD', 'ArrowRight')) L.sel = Math.min(n - 1, L.sel + 1);
  if (input.wasPressed('KeyW', 'ArrowUp')) L.sel = Math.max(0, L.sel - L.cols);
  if (input.wasPressed('KeyS', 'ArrowDown')) L.sel = Math.min(n - 1, L.sel + L.cols);
  const rowsAll = Math.ceil(n / L.cols);
  if (input.wheel) L.scroll = Math.max(0, Math.min(rowsAll - L.rows, L.scroll + Math.sign(input.wheel)));
  let take = input.wasPressed('Enter', 'Space');
  if (input.mouse.active) {
    const mx = input.mouse.x * renderer.dpr, my = input.mouse.y * renderer.dpr, inside = (r) => mx >= r.x0 && mx < r.x1 && my >= r.y0 && my < r.y1;
    const moved = input.mouse.x !== lockerInput.lx || input.mouse.y !== lockerInput.ly;
    lockerInput.lx = input.mouse.x;
    lockerInput.ly = input.mouse.y;
    const cell = L.cellRects.find(inside);
    if (cell && moved) L.sel = cell.i;
    if (input.wasPressed('Mouse0')) {
      const tab = L.tabRects.find(inside);
      if (tab) setTab(tab.i);
      else if (cell) { L.sel = cell.i; take = true; }
    }
  }
  // keep the pick in view
  const row = Math.floor(L.sel / L.cols);
  if (!input.wheel) L.scroll = Math.max(Math.min(L.scroll, row), row - L.rows + 1);
  const it = L.tabs[L.tab].items[L.sel];
  if (take && it && takeItem(it)) L.flash = { tab: L.tab, i: L.sel, t: 0.35 };
  lockerLeft[L.use] = { tab: L.tab, sel: L.sel, scroll: L.scroll };
}

// The panel: the cabinet's name, its tabs, a grid of what's in the open one
// (icon and name; yours marked green), and what the picked one is.
function drawLocker(ctx, u, W, H) {
  const L = locker, def = LOCKERS[L.use];
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x * u), Math.round(y * u), Math.round(w * u), Math.round(h * u)); };
  const text = (t, x, y, c, size = 1) => drawText(ctx, String(t), Math.round(x * u), Math.round(y * u), u * size, c);
  const rectOf = (x, y, w, h, i) => ({ i, x0: x * u, y0: y * u, x1: (x + w) * u, y1: (y + h) * u });
  ctx.fillStyle = 'rgba(4, 7, 6, 0.55)';
  ctx.fillRect(0, 0, W, H);
  const Wd = W / u, Hd = H / u, pw = Math.min(Wd - 24, 420), ph = Math.min(Hd - 24, 236);
  const x0 = Math.round((Wd - pw) / 2), y0 = Math.round((Hd - ph) / 2);
  px(x0 - 1, y0 - 1, pw + 2, ph + 2, HUDC.frame);
  px(x0, y0, pw, ph, 'rgba(14, 19, 16, 0.97)');
  px(x0, y0, pw, 1, '#c9a83a');
  text(def.name, x0 + 8, y0 + 6, '#ffd25a', 2);
  const close = def.close ?? 'ESC / E - CLOSE';
  text(close, x0 + pw - 8 - textWidth(close), y0 + 9, '#6f7a62');
  // the tabs
  let tx = x0 + 8, ty = y0 + 24;
  L.tabRects = [];
  L.tabs.forEach((t, i) => {
    const label = L.tabs.length > 1 && i < 9 ? `${i + 1} ${t.label}` : t.label, w = textWidth(label) + 8, on = i === L.tab;
    if (tx + w > x0 + pw - 8) { tx = x0 + 8; ty += 13; }   // out of room: another row
    px(tx, ty, w, 11, on ? '#2c3526' : '#151b17');
    if (on) px(tx, ty + 10, w, 1, '#c9a83a');
    text(label, tx + 4, ty + 3, on ? '#ffffff' : '#7a847e');
    L.tabRects.push(rectOf(tx, ty, w, 11, i));
    tx += w + 3;
  });
  // the grid
  const items = L.tabs[L.tab].items, cw = 76, ch = 34, gap = 4, gx = x0 + 8, gy = ty + 16, gh = y0 + ph - 32 - gy;
  L.cols = Math.max(1, Math.floor((pw - 16 + gap) / (cw + gap)));
  L.rows = Math.max(1, Math.floor((gh + gap) / (ch + gap)));
  const rowsAll = Math.ceil(items.length / L.cols);
  L.scroll = Math.max(0, Math.min(L.scroll, rowsAll - L.rows));
  L.cellRects = [];
  items.forEach((it, i) => {
    const r = Math.floor(i / L.cols) - L.scroll, c = i % L.cols;
    if (r < 0 || r >= L.rows) return;
    const cx = gx + c * (cw + gap), cy = gy + r * (ch + gap), on = i === L.sel, soon = it.kind === 'soon';
    const flash = L.flash && L.flash.tab === L.tab && L.flash.i === i && L.flash.t > 0;
    px(cx, cy, cw, ch, on ? '#c9a83a' : '#2a322f');
    px(cx + 1, cy + 1, cw - 2, ch - 2, flash ? '#4a5a3a' : on ? '#2c3526' : '#1b2117');
    if (it.img) {
      const iw = artW(it.img), ih = artH(it.img), res = it.img.res ?? 1;
      const sc = Math.max(1, Math.floor(Math.min(2, (cw - 10) / iw, 15 / ih) * u * res)) / (u * res);
      ctx.globalAlpha = soon ? 0.4 : 1;
      ctx.drawImage(it.img, Math.round((cx + (cw - iw * sc) / 2) * u), Math.round((cy + 3 + (16 - ih * sc) / 2) * u), Math.round(iw * sc * u), Math.round(ih * sc * u));
      ctx.globalAlpha = 1;
    } else text('?', cx + cw / 2 - 1, cy + 8, '#4a5450', 2);
    let name = it.name;
    while (textWidth(name) > cw - 6) name = name.slice(0, -1);
    text(name, cx + Math.floor((cw - textWidth(name)) / 2), cy + 24, soon ? '#4a5450' : on ? '#ffffff' : '#c8cfc9');
    if (owned(it)) { px(cx + cw - 6, cy + 3, 3, 3, '#8aff9a'); }
    L.cellRects.push(rectOf(cx, cy, cw, ch, i));
  });
  if (rowsAll > L.rows) {
    // a scrollbar down the right
    const bx = x0 + pw - 5, k = L.rows / rowsAll;
    px(bx, gy, 2, gh, '#1b2117');
    px(bx, gy + (gh * L.scroll) / rowsAll, 2, Math.max(4, gh * k), '#6f7a62');
  }
  // what the picked one is
  const it = items[L.sel];
  px(x0 + 6, y0 + ph - 29, pw - 12, 1, '#2a322f');
  if (it) {
    text(it.name + (owned(it) ? '  - YOURS' : ''), x0 + 8, y0 + ph - 24, '#ffd25a');
    let info = it.desc ?? '';
    if (it.kind === 'gun') {
      const d = it.def, dmg = Math.round(d.damage * DAMAGE * (CLASS_MUL[d.cls] ?? 1) * settings.dmg);
      info = `${(WEAPON_CLASSES.find((c) => c.cls === d.cls)?.label ?? d.cls).toUpperCase()}  -  DAMAGE ${dmg}${d.pellets > 1 ? ' X' + d.pellets : ''}  -  ${Math.round(60 / d.fireInterval)} RPM${d.auto ? ' AUTO' : ''}  -  MAG ${d.magSize}  -  SLOT ${player.slotFor(d)}`;
    } else if (it.kind === 'melee') info = `MELEE  -  DAMAGE ${Math.round(it.def.damage * 1.5)}  -  REACH ${it.def.reach}  -  ${it.def.hands > 1 ? 'TWO HANDS' : 'ONE HAND'}  -  SLOT 1`;
    text(info, x0 + 8, y0 + ph - 14, '#9aa49c');
  }
  const hint = 'CLICK / ENTER - TAKE';
  text(hint, x0 + pw - 8 - textWidth(hint), y0 + ph - 24, '#6f7a62');
}

// "E - GUN LOCKER" over the cabinet you're at
function drawCabinetPrompt(ctx) {
  const d = !locker && cabinetNear();
  if (!d) return;
  const t = `E - ${LOCKERS[d.use].name}`, x = Math.round((d.x + d.w / 2) * T - textWidth(t) / 2), y = Math.round(d.y * T - 9 + Math.sin(game.time * 4));
  drawText(ctx, t, x, y, 1, '#ffd25a');
}

// The main game's DPS meter (top right), for training.
function drawMeter(ctx, u, W) {
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x * u), Math.round(y * u), Math.round(w * u), Math.round(h * u)); };
  const text = (t, x, y, c, size = 1) => drawText(ctx, String(t), Math.round(x * u), Math.round(y * u), u * size, c);
  const s = stats, w = 92, x = W / u - w - 6, y = 52;
  px(x - 1, y - 1, w + 2, 46, HUDC.frame);
  px(x, y, w, 44, HUDC.panel);
  px(x, y, w, 1, HUDC.panelHi);
  text('DPS', x + 4, y + 4, '#a7ae98');
  text(Math.round(s.dps), x + 4, y + 11, s.dps > 0 ? '#ffd84a' : HUDC.text, 2);
  [['PEAK', Math.round(s.peak)], ['TOTAL', Math.round(s.total)], ['HITS', s.hits], ['HEAD', s.hits ? `${Math.round((100 * s.heads) / s.hits)}%` : '-'], ['LAST', game.time - s.lastT < 3 ? Math.round(s.last) : '-']].forEach(([k, v], i) => {
    text(k, x + 44, y + 4 + i * 8, '#6f7a62');
    text(v, x + w - 4 - textWidth(String(v)), y + 4 + i * 8, HUDC.text);
  });
}

// ---------- the main menu ----------
// The way into everything: SINGLE PLAYER (you against bots, set up the room
// first), MULTIPLAYER (online rooms - see online.js) and TRAINING; STORY shows
// what it'll be. (The gun editor, editor.html, is off the menu.)

const MODES = [
  { key: 'story', name: 'STORY', desc: 'FIGHT YOUR WAY OUT OF THE LAB', soon: ['A CAMPAIGN THROUGH THE RESEARCH FACILITY:', 'LEVEL AFTER LEVEL OF GUARDS, BOSSES AND WHAT GOT OUT OF THE TANKS,', 'WITH A STORY TOLD BETWEEN THE FIGHTS'] },
  { key: 'single', name: 'SINGLE PLAYER', desc: 'YOU AGAINST BOTS - SET UP THE ROOM AND FIGHT' },
  { key: 'multi', name: 'MULTIPLAYER', desc: 'ONLINE - PICK A SERVER, MAKE OR JOIN A ROOM WITH FRIENDS' },
  { key: 'training', name: 'TRAINING', desc: 'EVERY WEAPON AND SKILL - A RANGE, A COURSE, A GRAPPLE SHAFT' },
];
let modeSel = 1, soonMode = null;
const onMenu = () => state === 'menu' || state === 'soon' || state === 'title' || online.isScreen(state);

function pickMode(m) {
  if (m.key === 'single') { state = 'title'; menuSel = OPTIONS.length; return; }
  if (m.key === 'training') { startTraining(); return; }
  if (m.key === 'multi') { openOnline(); return; }
  soonMode = m;
  state = 'soon';
}

function mainMenuInput() {
  const n = MODES.length;
  if (input.wasPressed('KeyW', 'ArrowUp')) modeSel = (modeSel + n - 1) % n;
  if (input.wasPressed('KeyS', 'ArrowDown')) modeSel = (modeSel + 1) % n;
  if (kit.hover?.startsWith('mode:') && (input.mouse.x !== mainMenuInput.lx || input.mouse.y !== mainMenuInput.ly)) modeSel = +kit.hover.slice(5);
  mainMenuInput.lx = input.mouse.x;
  mainMenuInput.ly = input.mouse.y;
  if (kit.click?.startsWith('mode:')) return pickMode(MODES[+kit.click.slice(5)]);
  if (input.wasPressed('Enter', 'Space')) pickMode(MODES[modeSel]);
}

function drawMainMenu(ctx, u, W, H) {
  kit.shade(0.5);
  let y = Math.max(12 * u, Math.round(H * 0.09));
  kit.text('PROJECT Z', W / 2, y, { size: 5, color: KC.gold, align: 'center' });
  y += 40 * u;
  kit.hazard(W / 2 - 112 * u, y, 224 * u, 4 * u);
  y += 10 * u;
  kit.text('LAB BRAWL', W / 2, y, { size: 2, color: KC.teal, align: 'center' });
  y += 28 * u;
  const bw = Math.min(W - 24 * u, 260 * u), bh = 30 * u, x = Math.round(W / 2 - bw / 2);
  MODES.forEach((m, i) => {
    kit.button(`mode:${i}`, x, y, bw, bh, m.name, { size: 2, sub: m.soon ? 'COMING SOON' : m.desc, selected: modeSel === i });
    y += bh + 5 * u;
  });
  kit.hints('W S / MOUSE  CHOOSE      ENTER / CLICK  GO');
}

// A mode that isn't built yet: what it's going to be.
function drawSoon(ctx, u, W, H) {
  kit.shade(0.72);
  const m = soonMode, pw = Math.min(W - 16 * u, 340 * u), ph = 26 * u + m.soon.length * 10 * u + 30 * u;
  const px = Math.round(W / 2 - pw / 2), py = Math.round(H / 2 - ph / 2);
  let y = kit.panel(px, py, pw, ph, { title: m.name, note: 'COMING SOON', noteColor: KC.red });
  m.soon.forEach((l, i) => kit.text(l, W / 2, y + i * 10 * u, { small: true, color: i ? KC.muted : KC.text, align: 'center' }));
  y += m.soon.length * 10 * u + 8 * u;
  kit.button('back', W / 2 - 50 * u, y, 100 * u, 18 * u, 'BACK');
}

// ---------- online ----------
// (see online.js) A match over the network: everyone's fighters made from the
// host's list - the players, then bots - on the host's map; the host runs it,
// the others only draw it.
function startNetMatch(roster, mapKey, me, host) {
  loadMap(mapKey);
  game.fighters = roster.map((r, i) => {
    const f = new Fighter(game, images, r);
    f.nid = i + 1;
    f.team = r.team ?? i;
    f.peer = r.peer ?? null;
    return f;
  });
  player = game.fighters.find((f) => f.peer === me) ?? game.fighters[0];
  for (const f of game.fighters) f.deaths = 0;
  if (!settings.skills) for (const f of game.fighters) f.skill = null;
  bots = host ? game.fighters.filter((f) => f.bot).map((f, i) => new Bot(game, f, (0.85 + i * 0.12) * settings.skill)) : [];
  round = 0;
  champion = null;
  locker = null;
  paused = false;
  startRound();
  hintEl.classList.remove('fade');
  setTimeout(() => hintEl.classList.add('fade'), 9000);
}
// a room setting changed in an online room (no backdrop to redo, as on the setup screen)
function changeNetSetting(i, dir) {
  const [k, , vals] = OPTIONS[i];
  const at = vals.findIndex(([v]) => v === settings[k]);
  settings[k] = vals[(at + dir + vals.length) % vals.length][0];
  saveSettings();
}
initOnline({
  game, settings, OPTIONS, input, renderer, images, IDLE, MAP_KEYS, pick, weapons: WEAPONS, iconOf,
  drawText, textWidth, centerText, panel, playerControl, startNetMatch, changeNetSetting, kit, tagColor,
  skillItems, skillName, openPicker, botSkill, SKILL_INFO, setSetting(k, v) { settings[k] = v; saveSettings(); },
  get state() { return state; }, set state(v) { state = v; },
  get player() { return player; }, set player(v) { player = v; },
  get stateT() { return stateT; }, set stateT(v) { stateT = v; },
  get round() { return round; }, set round(v) { round = v; },
  get roundT() { return roundT; }, set roundT(v) { roundT = v; },
  get overtime() { return overtime; }, set overtime(v) { overtime = v; },
  get slow() { return slow; }, set slow(v) { slow = v; },
  get banner() { return banner; }, set banner(v) { banner = v; },
  get winner() { return winner; }, set winner(v) { winner = v; },
  get champion() { return champion; }, set champion(v) { champion = v; },
});

// ---------- the loop ----------

makeFighters();
startRound();
state = 'menu';
banner = null;

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);   // (asked for first: a frame that goes wrong doesn't stop the game)
  try {
    if (frozen) { drawWorld(); drawHud(); }
    else tick(Math.min(1 / 30, (now - last) / 1000));
  } catch (e) {
    if (!frame.errors || frame.errors < 5) console.error(e);
    frame.errors = (frame.errors ?? 0) + 1;
    input.endFrame();
  }
  last = now;
}

function tick(realDt, draw = true) {
  netUpdate(realDt);
  kit.pointer(input, renderer.dpr);   // (what the mouse is over on the menus, what's clicked)
  // menus (a pick list open over one takes the keys and clicks)
  if (picker) pickerInput();
  else if (state === 'menu') mainMenuInput();
  else if (state === 'soon') { if (input.wasPressed('Escape', 'Enter', 'Space') || kit.click === 'back') state = 'menu'; }
  else if (state === 'title') titleInput();
  else if (online.isScreen(state)) netScreenInput();
  else if (online.active) netGameInput();   // (online, ESC doesn't pause: it's a menu over the game, which goes on)
  else if (state === 'match') matchInput();
  else if (input.wasPressed('Escape')) { if (locker) locker = null; else paused = !paused; }
  else if (paused) pauseInput();

  if (online.isClient && !onMenu()) {
    // in someone else's game: what the host sends is drawn, our controls go to it (see online.js)
    clientFrame(realDt);
    for (const k of game.feed) k.t -= realDt;
    renderer.update(realDt);
    updateCamera(realDt);
  } else if (!paused) {
    const dt = realDt * slow;
    game.time += dt;
    if (!onMenu()) updateRounds(dt, realDt);
    else stateT += realDt;
    if (banner) { banner.t -= realDt; if (banner.t <= 0) banner = null; }
    const live = state === 'fight' || state === 'end' || state === 'training';
    const cabinetOpen = !!locker;   // (the E that shuts it doesn't open it again)
    if (locker) lockerInput(realDt);
    let pc = live && !cabinetOpen && !online.menuOpen ? (testControl ? { ...IDLE, ...testControl } : playerControl()) : IDLE;
    // E at a cabinet opens it (rather than reaching for what's on the floor)
    if (pc.pickup && cabinetNear()) { openLocker(cabinetNear()); pc = IDLE; }
    // TAB in training: everything, wherever you are
    else if (state === 'training' && !cabinetOpen && player.alive && input.wasPressed('Tab')) { openLocker({ use: 'all' }); pc = IDLE; }
    if (pc.pickup) player.pickupPressed = true;
    player.update(dt, pc);
    updateRemotes(dt, live);   // (hosting online: the other players' fighters, by their controls)
    for (const b of bots) b.f.update(dt, live ? b.control(dt) : IDLE);
    updateDecoys(dt, live);
    updateBullets(dt);
    updateGrenades(dt);
    updateThrown(dt);
    updateArrows(dt);
    updateVoids(dt);
    updateFists(dt);
    updateGalaxies(dt);
    updateDemons(dt);
    updatePickups(dt);
    updateTraining(dt);
    for (const n of game.numbers) n.t += dt;
    game.numbers = game.numbers.filter((n) => n.t < 0.9);
    // off the bottom of an open map (the rooftops): gone
    for (const f of game.fighters) if (f.alive && f.y > PH + 40) f.die(null, 'FELL', 0, 0);
    for (const p of game.pickups) if (p.y > PH + 60) p.life = 0;
    player.pickupPressed = false;
    game.fx.update(dt);
    for (const b of game.blasts) b.t += dt;
    game.blasts = game.blasts.filter((b) => b.t < 0.35);
    game.lights.update(dt);
    if (game.lights.sparked) {
      const l = game.lights.sparked;
      game.fx.sparks(l.x, l.y, 5, 0, 1, '#ffe2a0');
      game.lights.sparked = null;
    }
    for (const k of game.feed) k.t -= realDt;
    game.feed = game.feed.filter((k) => k.t > 0);
    renderer.update(realDt);
    updateCamera(realDt);
    hostFrame(realDt);   // (hosting online: the state of the game out to everyone)
  }
  // the system cursor on the menus (setup, results, pause); in a fight the crosshair takes its place
  const cursor = onMenu() || picker || state === 'match' || paused || locker || online.menuOpen || online.watching ? 'default' : 'none';
  if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
  if (draw) {
    drawWorld();
    drawHud();
  }
  input.endFrame();
}
requestAnimationFrame(frame);

// for testing from the console: arena.step(seconds) runs the game without the browser's frame clock
let testControl = null, frozen = false;
window.arena = {
  game, renderer, startMatch, startTraining, settings, loadMap, online,
  get level() { return level; },
  get player() { return player; }, get state() { return state; }, get bots() { return bots; },
  set control(c) { testControl = c; },
  set frozen(v) { frozen = v; },
  step(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) tick(dt, false); drawWorld(); drawHud(); },
};
