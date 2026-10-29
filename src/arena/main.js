// ARENA: a side-on brawl in the lab, Superfighters / Gun Mayhem style. You
// and up to three bots start with your fists and a pistol; guns, melee
// weapons, medkits and grenades are beamed in around the level. Last one (or
// last team) standing takes the round. The room is set up first - mode, bots,
// how many rounds, health, damage, what you start with, how much drops.

import { loadImages, makeCanvas, rect } from '../engine/pixel.js';
import { Renderer } from '../engine/renderer.js';
import { Input } from '../engine/input.js';
import { WEAPONS } from '../combat/weapons.js';
import { gunIcon, artW, artH, HANDS } from '../combat/gunart.js';
import { MELEE } from '../combat/melee.js';
import { drawText, textWidth } from '../ui/font.js';
import { Level, T, SOLID, PLAT, ACID } from './level.js';
import { Fighter, MAX_STAMINA } from './fighter.js';
import { Fx } from './fx.js';
import { Lights } from './light.js';
import { Nav, Bot, gunTier } from './ai.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (l) => l[(Math.random() * l.length) | 0];


const canvas = document.getElementById('game');
const renderer = new Renderer(canvas, { viewHeight: 290, viewWidth: 500 });
const input = new Input(canvas);
const hintEl = document.getElementById('hud');
hintEl.classList.add('fade');   // shown once a match starts
const level = new Level();
const PW = level.w * T, PH = level.h * T;

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
  ['mode', 'MODE', [['ffa', 'FREE FOR ALL'], ['teams', 'TEAMS 2 V 2']]],
  ['bots', 'BOTS', [[1, '1'], [2, '2'], [3, '3']]],
  ['skill', 'BOT SKILL', [[0.7, 'EASY'], [1, 'NORMAL'], [1.35, 'HARD']]],
  ['wins', 'ROUNDS TO WIN', [[1, '1'], [3, '3'], [5, '5'], [7, '7']]],
  ['time', 'ROUND TIME', [[60, '1:00'], [90, '1:30'], [120, '2:00'], [0, 'NO LIMIT']]],
  ['hp', 'HEALTH', [[100, '100'], [200, '200'], [300, '300'], [500, '500']]],
  ['dmg', 'GUN DAMAGE', [[0.5, '50%'], [0.75, '75%'], [1, '100%'], [1.5, '150%']]],
  ['start', 'START WITH', [['fists', 'FISTS'], ['pistol', 'FISTS + PISTOL'], ['random', 'FISTS + RANDOM GUN'], ['knife', 'KNIFE + PISTOL']]],
  ['nades', 'START GRENADES', [[0, '0'], [1, '1'], [2, '2'], [3, '3']]],
  ['drops', 'ITEM DROPS', [[0, 'OFF'], [0.5, 'FEW'], [1, 'NORMAL'], [2, 'MANY']]],
  ['pool', 'WEAPONS THAT DROP', [['all', 'GUNS + MELEE'], ['guns', 'GUNS ONLY'], ['melee', 'MELEE ONLY']]],
];
const DEFAULTS = { mode: 'ffa', bots: 3, skill: 1, wins: 3, time: 90, hp: 300, dmg: 1, start: 'pistol', nades: 1, drops: 1, pool: 'all' };
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
function crateArt(white) {
  return sprite(14, 14, (g) => {
    rect(g, K, 0, 0, 14, 14);
    rect(g, white ? '#ffffff' : '#4d5d55', 1, 1, 12, 12);
    if (white) return;
    rect(g, '#6e7f76', 1, 1, 12, 2);
    rect(g, '#36433d', 1, 11, 12, 2);
    for (let i = 0; i < 12; i += 3) rect(g, (i / 3) % 2 ? '#1b1f1c' : '#c9a83a', 1 + i, 6, 3, 2);
    rect(g, '#8a9690', 2, 3, 1, 1); rect(g, '#8a9690', 11, 3, 1, 1);
    rect(g, '#2b3632', 2, 9, 10, 1);
  });
}
function barrelArt(white) {
  return sprite(12, 16, (g) => {
    rect(g, K, 1, 0, 10, 16); rect(g, K, 0, 1, 12, 14);
    rect(g, white ? '#ffffff' : '#a8322a', 1, 1, 10, 14);
    if (white) return;
    rect(g, '#d2503e', 2, 1, 2, 14);
    rect(g, '#6e1e18', 1, 4, 10, 1); rect(g, '#6e1e18', 1, 11, 10, 1);
    rect(g, '#e8c040', 4, 6, 4, 4); rect(g, '#1b1f1c', 5, 7, 2, 2);
    rect(g, '#c8cfc9', 3, 0, 6, 1);
  });
}
const PROP_ART = { crate: [crateArt(false), crateArt(true)], barrel: [barrelArt(false), barrelArt(true)] };

// ---------- the game ----------

class Prop {
  constructor(kind, x, y) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.w = kind === 'crate' ? 14 : 12;
    this.h = kind === 'crate' ? 14 : 16;
    this.hp = kind === 'crate' ? 70 : 28;
    this.solid = true;
    this.flash = 0;
    this.fuse = -1;
    this.dead = false;
  }
  get box() {
    return { l: this.x - this.w / 2, r: this.x + this.w / 2, t: this.y - this.h, b: this.y };
  }
}

const game = {
  level, weapons: WEAPONS, fighters: [], props: [], bullets: [], grenades: [], pickups: [], feed: [], blasts: [],
  get gunDamage() { return settings.dmg; },
  // what everyone starts a round with
  loadout() {
    const gun = settings.start === 'fists' ? null : settings.start === 'random' ? pick(GUN_POOL) : 'm9';
    return { gun, ammo: gun ? WEAPONS[gun].magSize * (gun === 'm9' ? 3 : 2) : 0, grenades: settings.nades, hp: settings.hp, melee: settings.start === 'knife' ? 'knife' : null };
  },
  nadeArt: (kind) => NADE_ART[kind] ?? NADE,
  foes: (a, b) => a !== b && (settings.mode !== 'teams' || a.team !== b.team),
  fx: new Fx(level), lights: new Lights(level), nav: new Nav(level),
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
      v.hitHow = d.fists ? 'FISTS' : d.name;
      const knock = d.knock * (m.step === 2 ? 1.4 : 1) * 1.6;
      // knocked out of their hands if they were shooting
      const shooting = v.slot === 2 && v.weapon && (v.lastFireT < 0.7 || v.triggerHeld);
      if (!v.hurt(m.damage * MUL, f, nx * knock, -60 - knock * 0.25)) continue;
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
      this.damageProp(p, m.damage, f);
    }
  },
  // A gun knocked loose: it flies off and lands as a pickup anyone can grab.
  disarm(v, dir) {
    const w = v.dropGun();
    if (!w) return;
    this.pickups.push({ kind: 'gun', key: w.def.key, ammo: w.ammo, reserve: v.reserve, x: v.x, y: v.y - 14, vx: dir * 110 + rand(-20, 20), vy: -170, beam: 0, life: 25, bob: 0, ready: false, noGrab: 0.5 });
    v.reserve = 0;
    this.fx.sparks(v.x + dir * 6, v.y - 10, 8, dir, -0.5);
    if (v === player) banner = { text: 'DISARMED!', t: 0.9, color: '#ff8a6a' };
  },
  throwGrenade(f, x, y, vx, vy, kind = 'frag') {
    this.grenades.push({ x, y, vx, vy, t: kind === 'impact' ? 4 : 1.6, owner: f, rot: 0, vrot: Math.sign(vx || 1) * 12, kind, age: 0 });
  },
  onDeath(f, killer, how) {
    how = how ?? f.hitHow ?? (killer?.weapon ? killer.weapon.def.name : 'FISTS');
    if (f.melee && !f.melee.def.fists) this.pickups.push({ kind: 'melee', key: f.melee.def.key, x: f.x, y: f.y - 12, vx: rand(-60, 60), vy: -150, beam: 0, life: 20, bob: 0, ready: false });
    if (killer && killer !== f) killer.kills++;
    this.feed.push({ killer: killer && killer !== f ? killer : null, victim: f, how, t: 5 });
    if (this.feed.length > 5) this.feed.shift();
    if (how !== 'MELTED') this.fx.blood(f.x, f.y - 12, 22, Math.sign(f.vx) || 0, -0.6);
    else { this.fx.smoke(f.x, f.y - 4, 10); this.fx.sparks(f.x, f.y - 2, 10, 0, -1, '#9aff6a'); }
    if (f === player) renderer.kick(rand(-4, 4), -4);
  },

  damageProp(p, dmg, from) {
    if (p.dead) return;
    p.hp -= dmg;
    p.flash = 0.06;
    if (p.hp > 0) return;
    p.dead = true;
    p.solid = false;
    const b = p.box, cx = p.x, cy = p.y - p.h / 2;
    if (p.kind === 'barrel') this.explode(cx, cy, from, 58, 210);
    else {
      this.fx.debris(cx, cy, 14, ['#4d5d55', '#6e7f76', '#36433d', '#c9a83a'], 0.8);
      this.fx.dust(cx, b.b, 8);
      if (Math.random() < 0.4) this.spawnPickup(cx, b.b, true);   // sometimes something inside
    }
  },

  explode(x, y, owner, r = 54, dmg = 190) {
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
      if (d < r * 1.3) {
        if (p.kind === 'barrel') { if (p.fuse < 0) p.fuse = 0.12 + Math.random() * 0.1; p.owner = owner; }
        else this.damageProp(p, 90 * (1 - d / (r * 1.3)) + 20, owner);
      }
    }
    for (const l of this.lights.lamps) if (l.on && Math.hypot(l.x - x, l.y - y) < r * 0.7) { l.on = false; fx.sparks(l.x, l.y, 8, 0, 1, '#fff6d0'); }
    const cam = renderer.camera, near = Math.max(0, 1 - Math.hypot(cam.x - x, cam.y - y) / 400);
    renderer.kick(rand(-1, 1) * 8 * near, -6 * near);
  },

  // A crate of something beamed in (or found in a smashed crate).
  spawnPickup(x, y, dropped = false) {
    if (x === undefined) {
      const spots = this.nav.standable.filter((n) => !(n.cy >= 23 && n.cx >= 15 && n.cx <= 32) && !this.fighters.some((f) => f.alive && Math.abs(f.x - (n.cx + 0.5) * T) < 40 && Math.abs(f.y - (n.cy + 1) * T) < 30) && !this.pickups.some((p) => Math.abs(p.x - (n.cx + 0.5) * T) < 48 && Math.abs(p.y - (n.cy + 1) * T) < 20));
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
  { name: 'YOU', color: '#e8e2d0', hue: 0, sat: 1 },
  { name: 'VEX', color: '#ff6a5a', hue: 150, sat: 1.3, bot: true },
  { name: 'KORA', color: '#6ad8ff', hue: 210, sat: 1.2, bot: true },
  { name: 'DUKE', color: '#c8ff5a', hue: 290, sat: 1.1, bot: true },
];
let bots = [];
const TEAMS = [{ name: 'BLUE', color: '#6ad8ff' }, { name: 'RED', color: '#ff6a5a' }];

function makeFighters() {
  const n = settings.mode === 'teams' ? 3 : settings.bots;
  game.fighters = ROSTER.slice(0, n + 1).map((r, i) => {
    const f = new Fighter(game, images, r);
    // teams: you and VEX against KORA and DUKE; otherwise everyone for themselves
    f.team = settings.mode === 'teams' ? (i < 2 ? 0 : 1) : i;
    return f;
  });
  player = game.fighters[0];
  bots = game.fighters.filter((f) => f.bot).map((f, i) => new Bot(game, f, (0.85 + i * 0.12) * settings.skill));
}
const teamMode = () => settings.mode === 'teams';
const tagColor = (f) => (teamMode() ? TEAMS[f.team].color : f.color);

// ---------- rounds ----------

let state = 'title';   // title | intro | fight | end | match
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
  game.fx = new Fx(level);
  game.lights = new Lights(level);
  game.props = level.props.map((p) => new Prop(p.kind, p.x, p.y));
  const spots = [...level.spawns].sort(() => Math.random() - 0.5);
  game.fighters.forEach((f, i) => {
    const s = spots[i % spots.length];
    f.reset(s.x + (i >= spots.length ? 12 : 0), s.y);
    const L = game.loadout();
    if (L.melee) f.giveMelee(MELEE[L.melee]);
    while (f.hits(f.x - 5, f.y - 28, f.x + 5, f.y)) f.y -= 1;   // spawned in a crate: stand on it
    f.hitHow = null;
  });
  for (const b of bots) b.reset();
  if (settings.drops > 0) for (let i = 0; i < 3; i++) game.spawnPickup();
  for (const p of game.pickups) p.beam = 0;
  pickupT = 4 / Math.max(0.5, settings.drops);
  banner = { text: `ROUND ${round}`, sub: game.fighters.map((f) => `${f.name} ${f.wins}`).join('   '), t: 1.4, color: '#e8e2d0' };
}

function startMatch() {
  makeFighters();
  round = 0;
  for (const f of game.fighters) { f.wins = 0; f.kills = 0; }
  champion = null;
  startRound();
  hintEl.classList.remove('fade');
  setTimeout(() => hintEl.classList.add('fade'), 9000);
}

function updateRounds(dt, realDt) {
  stateT += realDt;
  if (state === 'intro' && stateT > 1.6) {
    state = 'fight';
    banner = { text: 'FIGHT!', t: 0.8, color: '#ffd25a' };
  }
  if (state === 'fight') {
    roundT += dt;
    if (settings.time && roundT > settings.time && !overtime) {
      overtime = true;
      banner = { text: 'OVERTIME', sub: 'THE LAB IS VENTING - EVERYONE IS LOSING HP', t: 2, color: '#ff6a5a' };
    }
    if (overtime) for (const f of game.fighters) if (f.alive) {
      f.hp -= 9 * dt;
      if (f.hp <= 0) f.die(null, 'GAS', 0, 0);
    }
    const alive = game.fighters.filter((f) => f.alive), sides = new Set(alive.map((f) => f.team));
    if (sides.size <= 1) {
      state = 'end';
      stateT = 0;
      winner = alive[0] ?? null;
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

// a direction tapped twice quickly (A A / D D) runs that way while it's held
const lastTap = { KeyA: -9, KeyD: -9 };
let runKey = null;
function running() {
  const now = performance.now() / 1000;
  for (const k of ['KeyA', 'KeyD']) if (input.wasPressed(k)) {
    if (now - lastTap[k] < 0.28) runKey = k;
    lastTap[k] = now;
  }
  if (runKey && !input.down(runKey)) runKey = null;
  return !!runKey;
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
    grenade: input.wasPressed('KeyG'),
    pickup: input.wasPressed('KeyE'),
    slot: input.wasPressed('Digit1') ? 1 : input.wasPressed('Digit2') ? 2 : input.wasPressed('Digit3') ? 3 : 0,
    cycle: Math.sign(input.wheel),
  };
  if (input.mouse.active) {
    const m = mouseWorld(), s = f.shoulder;
    c.aim = Math.atan2(m.y - s.y, m.x - s.x);
    c.target = m;   // the gun zeroes on the cursor, like the main game
  } else if (c.move) c.aim = c.move > 0 ? 0 : Math.PI;
  return c;
}
const IDLE = { move: 0, up: false, down: false, jump: false, jumpHeld: false, fire: false, aim: null, reload: false, roll: false, melee: false, grenade: false, pickup: false, slot: 0, cycle: 0 };

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
      const cell = level.get(Math.floor(b.x / T), Math.floor(b.y / T));
      if (cell === SOLID) {
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
        if (p.dead) continue;
        const bx = p.box;
        if (b.x < bx.l || b.x > bx.r || b.y < bx.t || b.y > bx.b) continue;
        game.damageProp(p, b.dmg, b.owner);
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
  for (const p of game.props) p.flash -= dt;
  game.props = game.props.filter((p) => !p.dead);
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
      if (!f.alive || Math.abs(f.x - p.x) > 11 || Math.abs(f.y - p.y) > 18) continue;
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
        const fists = f.melee.def.fists;
        const wants = f === player ? fists || f.pickupPressed : fists;
        if (!wants) continue;
        const old = f.giveMelee(MELEE[p.key]);
        if (old) game.pickups.push({ kind: 'melee', key: old.def.key, x: f.x, y: f.y - 10, vx: -f.facing * 60, vy: -140, beam: 0, life: 20, bob: 0, ready: false, noGrab: 0.6 });
        if (f === player && fists) f.select(1);
        f.pickupPressed = false;
      } else {
        const w = f.weapon, armed = w && (w.ammo > 0 || f.reserve > 0);
        const wants = f === player ? !armed || f.pickupPressed : !armed || gunTier(WEAPONS[p.key]) > gunTier(w.def) + 0.4;
        if (!wants) continue;
        if (armed) {
          // drop the old one where the new one was
          game.pickups.push({ kind: 'gun', key: w.def.key, ammo: w.ammo, reserve: f.reserve, x: f.x, y: f.y - 10, vx: -f.facing * 60, vy: -140, beam: 0, life: 20, bob: 0, ready: false, noGrab: 0.6 });
        }
        const def = WEAPONS[p.key];
        f.give(p.key, p.reserve ?? def.magSize * 2);
        if (p.ammo !== undefined) f.weapon.ammo = p.ammo;
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
  if (state === 'title') {
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
  for (const p of game.props) {
    const [img, white] = PROP_ART[p.kind];
    ctx.drawImage(p.flash > 0 ? white : img, Math.round(p.x - img.width / 2), Math.round(p.y - img.height));
  }
  for (const p of game.pickups) {
    if (!p.ready) continue;
    if (p.life < 3 && Math.floor(p.life * 8) % 2) continue;   // about to vanish
    const img = p.kind === 'gun' ? iconOf(p.key) : p.kind === 'melee' ? MELEE[p.key].img : p.kind === 'health' ? MEDKIT : p.nade === 'impact' ? IMPACT_PAIR : NADES;
    const y = Math.round(p.y - artH(img) - (p.vy === 0 ? 1 + Math.round(Math.sin(p.bob * 3)) : 0));
    ctx.drawImage(img, Math.round(p.x - artW(img) / 2), y, artW(img), artH(img));
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  for (const f of game.fighters) if (f.alive && f.onGround) ctx.fillRect(Math.round(f.x) - 5, Math.round(f.y) - 1, 11, 1);
  for (const f of game.fighters) if (!f.alive) f.draw(ctx);
  for (const f of game.fighters) if (f.alive && f !== player) f.draw(ctx);
  if (player.alive) player.draw(ctx);
  for (const g of game.grenades) {
    ctx.save();
    ctx.translate(Math.round(g.x), Math.round(g.y - 3));
    ctx.rotate(Math.round(g.rot / (Math.PI / 4)) * (Math.PI / 4));
    ctx.drawImage(NADE_ART[g.kind] ?? NADE, -2, -3);
    ctx.restore();
  }
  game.fx.draw(ctx);

  // light it
  const extra = [];
  // a little light on each fighter so they read in the dark corners
  for (const f of game.fighters) if (f.alive) extra.push({ x: f.x, y: f.y - 14, r: 30, rgb: '190, 210, 230', k: 0.22 });
  for (const p of game.pickups) if (p.ready) extra.push({ x: p.x, y: p.y - 6, r: 26, rgb: p.kind === 'health' ? '255, 120, 110' : '170, 240, 255', k: 0.3 });
  for (const g of game.grenades) if (Math.sin(g.t * (g.t < 0.6 ? 40 : 14)) > 0) extra.push({ x: g.x, y: g.y - 3, r: 16, rgb: '255, 80, 60', k: 0.6 });
  if (overtime) extra.push({ x: renderer.camera.x, y: renderer.camera.y, r: 600, rgb: '120, 20, 10', k: 0.15 + 0.08 * Math.sin(time * 5) });
  game.lights.apply(ctx, renderer, time, extra);

  // things that glow
  game.lights.glow(ctx, time);
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
  for (const b of game.bullets) drawBullet(ctx, b);
  for (const f of game.fighters) f.drawFlash(ctx);

  // name tags and health over heads
  for (const f of game.fighters) {
    if (!f.alive) continue;
    const x = Math.round(f.x), y = Math.round(f.y - (f.roll ? 16 : 30));
    const name = f === player ? 'YOU' : f.name, w = textWidth(name);
    if (f !== player || state === 'intro') drawText(ctx, name, x - Math.floor(w / 2), y - 8, 1, tagColor(f));
    rect(ctx, '#050604', x - 9, y - 1, 18, 3);
    rect(ctx, '#3a1414', x - 8, y, 16, 1);
    rect(ctx, f.hp > f.maxHp * 0.3 ? '#5ad86a' : '#ff5a4a', x - 8, y, Math.ceil(16 * Math.max(0, Math.min(1, f.hp / f.maxHp))), 1);
  }
  // E prompt over a weapon the player could swap to
  if (player.alive) for (const p of game.pickups) {
    if (!p.ready || Math.abs(player.x - p.x) > 11 || Math.abs(player.y - p.y) > 18) continue;
    if (!(p.kind === 'gun' && player.weapon) && !(p.kind === 'melee' && !player.melee.def.fists)) continue;
    const t = `E ${p.kind === 'gun' ? WEAPONS[p.key].name : MELEE[p.key].name}`;
    drawText(ctx, t, Math.round(p.x - textWidth(t) / 2), Math.round(p.y - 22), 1, '#ffd25a');
    break;
  }
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
  const ctx = renderer.ctx, u = renderer.scale, W = renderer.width, H = renderer.height;
  renderer.beginScreen();
  renderer.drawVignette();
  if (state === 'title') return drawTitle(ctx, u, W, H);

  // the player's card: portrait, health, stamina, and the three weapon slots
  const f = player, cx = 6 * u, cy = 8 * u, CW = 150;   // top left
  panel(ctx, cx, cy, CW * u, 47 * u, u, f.alive ? '#c9a83a' : '#5a2a24');
  ctx.drawImage(f.parts.head, 0, 0, 32, 32, cx - 2 * u, cy - 6 * u, 32 * u, 32 * u);
  drawText(ctx, f.alive ? 'YOU' : 'DOWN', cx + 30 * u, cy + 4 * u, u, f.alive ? (teamMode() ? tagColor(f) : '#e8e2d0') : '#ff6a5a');
  rect(ctx, '#050604', cx + 30 * u, cy + 11 * u, 92 * u, 5 * u);
  rect(ctx, '#3a1414', cx + 31 * u, cy + 12 * u, 90 * u, 3 * u);
  rect(ctx, f.hp > f.maxHp * 0.3 ? '#5ad86a' : '#ff5a4a', cx + 31 * u, cy + 12 * u, Math.ceil(90 * Math.max(0, Math.min(1, f.hp / f.maxHp))) * u, 3 * u);
  drawText(ctx, String(Math.ceil(Math.max(0, f.hp))), cx + 125 * u, cy + 11 * u, u, '#e8e2d0');
  rect(ctx, '#050604', cx + 30 * u, cy + 16 * u, 92 * u, 2 * u);
  rect(ctx, f.stamina > 25 ? '#e8c84a' : '#a8742a', cx + 31 * u, cy + 16 * u, Math.ceil(90 * f.stamina / MAX_STAMINA) * u, u);
  // slots: [1] melee  [2] gun  [3] grenades - the one in hand lit up
  const slotBox = (n, x0, w0, img, label, sub, subColor) => {
    const on = f.slot === n, y0 = cy + 21 * u, h0 = 16 * u;
    ctx.fillStyle = on ? 'rgba(201, 168, 58, 0.25)' : 'rgba(255, 255, 255, 0.04)';
    ctx.fillRect(x0, y0, w0, h0);
    ctx.fillStyle = on ? '#ffd25a' : '#3a4c46';
    ctx.fillRect(x0, y0, w0, u); ctx.fillRect(x0, y0 + h0 - u, w0, u); ctx.fillRect(x0, y0, u, h0); ctx.fillRect(x0 + w0 - u, y0, u, h0);
    drawText(ctx, String(n), x0 + 2 * u, y0 + 2 * u, u, on ? '#ffd25a' : '#5a6a60');
    if (img) {
      const iw = artW(img), ih = artH(img), k = Math.min(1, (w0 / u - 10) / iw, (h0 / u - 4) / ih);
      const px1 = u * (img.res ?? 1), dk = Math.max(1, Math.floor(k * px1)) / px1;   // whole device pixels per art pixel
      ctx.drawImage(img, Math.round(x0 + w0 / 2 + 2 * u - (iw * dk * u) / 2), Math.round(y0 + h0 / 2 - (ih * dk * u) / 2), Math.round(iw * dk * u), Math.round(ih * dk * u));
    }
    if (sub) drawText(ctx, sub, x0 + w0 - textWidth(sub) * u - 2 * u, y0 + h0 - 6 * u, u, subColor);
    if (label) drawText(ctx, label, x0, y0 + h0 + 2 * u, u, on ? '#c8cfc9' : '#5a6a60');
  };
  const m = f.melee, w = f.weapon;
  slotBox(1, cx + 30 * u, 30 * u, m.def.fists ? FIST_ICON : m.def.img, m.def.fists ? 'FISTS' : m.def.name.slice(0, 8));
  slotBox(2, cx + 62 * u, 56 * u, w ? w.icon : null, w ? w.def.name.slice(0, 13) : '-', w ? `${w.ammo}/${f.reserve}` : '', w && w.ammo ? '#ffd25a' : '#ff6a5a');
  slotBox(3, cx + 120 * u, 28 * u, f.grenades > 0 ? NADE_ART[f.nade] : null, f.grenades > 0 ? NADE_NAME[f.nade] : '-', f.grenades > 0 ? `X${f.grenades}` : '', '#e8e2d0');
  if (w?.reloading && f.slot === 2) drawText(ctx, 'RELOADING', cx + 62 * u, cy + 50 * u, u, '#8ff0ff');

  // the score along the top
  const WINS = settings.wins, parts = game.fighters.map((o) => ({ o, w: textWidth(o.name) + 4 + WINS * 5 }));
  const total = parts.reduce((s, p) => s + p.w + 10, -10);
  // centred, unless that would run into the player's card at the top left
  let x = Math.max(Math.round(W / 2 - (total * u) / 2), cx + (CW + 14) * u);
  const sbMid = x + (total * u) / 2;
  panel(ctx, x - 6 * u, 3 * u, (total + 12) * u, 13 * u, u);
  for (const { o, w: pw } of parts) {
    drawText(ctx, o.name, x, 6 * u, u, o.alive ? tagColor(o) : '#4a5450');
    for (let i = 0; i < WINS; i++) rect(ctx, i < o.wins ? tagColor(o) : '#2a322f', x + (textWidth(o.name) + 4 + i * 5) * u, 6 * u, 3 * u, 5 * u);
    x += (pw + 10) * u;
  }
  if ((state === 'fight' || state === 'end') && settings.time) {
    const left = Math.max(0, settings.time - roundT), t = overtime ? 'OVERTIME' : `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    drawText(ctx, t, Math.round(sbMid - (textWidth(t) * u) / 2), 19 * u, u, overtime ? '#ff6a5a' : '#9aa49c');
  }

  // kill feed
  let fy = 6 * u;
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

  if (banner) {
    const k = Math.min(1, banner.t * 3);
    ctx.globalAlpha = k;
    centerText(ctx, banner.text, H * 0.36, 4, banner.color, u);
    if (banner.sub) centerText(ctx, banner.sub, H * 0.36 + 28 * u, 1, '#c8cfc9', u);
    ctx.globalAlpha = 1;
  }
  if (state === 'intro' && stateT > 0.5) centerText(ctx, String(Math.max(1, 3 - Math.floor((stateT - 0.5) / 0.37))), H * 0.36 + 40 * u, 3, '#ffd25a', u);
  if (!player.alive && state === 'fight') centerText(ctx, `SPECTATING ${spectating?.name ?? ''}`, H - 46 * u, 1, '#9aa49c', u);

  if (state === 'match') drawMatch(ctx, u, W, H);
  if (paused) {
    ctx.fillStyle = 'rgba(4, 6, 6, 0.7)';
    ctx.fillRect(0, 0, W, H);
    centerText(ctx, 'PAUSED', H * 0.38, 4, '#e8e2d0', u);
    centerText(ctx, 'ESC - RESUME      R - RESTART MATCH      S / Q - ROOM SETUP', H * 0.38 + 30 * u, 1, '#9aa49c', u);
  }
  drawCrosshair(ctx, u);
}

function drawCrosshair(ctx, u) {
  if (!input.mouse.active) return;
  const d = renderer.dpr, x = Math.round(input.mouse.x * d), y = Math.round(input.mouse.y * d);
  const spread = player.weapon ? Math.round(2 + player.weapon.recoil * 1.2) : 2;
  for (const [col, o] of [['#050604', 1], ['#e8ffd0', 0]]) {
    ctx.fillStyle = col;
    for (const [dx, dy, w, h] of [[-spread - 3, 0, 3, 1], [spread + 1, 0, 3, 1], [0, -spread - 3, 1, 3], [0, spread + 1, 1, 3]]) ctx.fillRect(x + (dx - o * 0) * u - o * u, y + dy * u - o * u, (w + o * 2) * u, (h + o * 2) * u);
  }
  ctx.fillStyle = '#ff5a4a';
  ctx.fillRect(x, y, u, u);
}

// The room's setup screen: a list of settings (click / arrows to change), START.
let menuSel = 0;
const menuRows = [];   // where each row was drawn (device px), for the mouse
function drawTitle(ctx, u, W, H) {
  ctx.fillStyle = 'rgba(4, 7, 6, 0.6)';
  ctx.fillRect(0, 0, W, H);
  let y = Math.max(10 * u, H * 0.06);
  centerText(ctx, 'LAB BRAWL', y, 5, '#ffd25a', u);
  centerText(ctx, 'PROJECT Z ARENA - SET UP THE ROOM', y + 32 * u, 1, '#8ff0ff', u);
  y += 46 * u;
  const rowH = 11 * u, colW = 150 * u, x0 = Math.round(W / 2 - colW / 2);
  panel(ctx, x0 - 8 * u, y - 5 * u, colW + 16 * u, rowH * (OPTIONS.length + 1) + 12 * u, u, '#c9a83a');
  menuRows.length = 0;
  OPTIONS.forEach(([k, label, vals], i) => {
    const on = menuSel === i, ry = y + i * rowH;
    if (on) { ctx.fillStyle = 'rgba(201, 168, 58, 0.2)'; ctx.fillRect(x0 - 6 * u, ry - 2 * u, colW + 12 * u, rowH); }
    let shown = vals.find(([v]) => v === settings[k])?.[1] ?? '?';
    if (k === 'bots' && teamMode()) shown = '3 (2 V 2)';
    drawText(ctx, label, x0, ry, u, on ? '#ffd25a' : '#9aa49c');
    const val = `< ${shown} >`;
    drawText(ctx, val, x0 + colW - textWidth(val) * u, ry, u, on ? '#ffffff' : '#e8e2d0');
    menuRows.push({ i, y0: ry - 2 * u, y1: ry - 2 * u + rowH, x0: x0 - 6 * u, x1: x0 + colW + 6 * u, mid: x0 + colW - (textWidth(val) * u) / 2 });
  });
  const sy = y + OPTIONS.length * rowH + 2 * u, on = menuSel === OPTIONS.length;
  const start = Math.floor(game.time * 2) % 2 === 0 || !on ? 'START THE MATCH' : '> START THE MATCH <';
  centerText(ctx, start, sy, 1, on ? '#ffd25a' : '#c8cfc9', u);
  menuRows.push({ i: OPTIONS.length, y0: sy - 2 * u, y1: sy - 2 * u + rowH, x0: x0 - 6 * u, x1: x0 + colW + 6 * u, start: true });
  const lines = [
    'A D WALK - A A / D D RUN - W SPACE JUMP (TWICE IN THE AIR) - S DROP DOWN - W S CLIMB',
    'SHIFT ROLL (ON THE GROUND OR ONCE IN THE AIR) - MOUSE AIM AND ATTACK - R RELOAD',
    '1 MELEE  2 GUN  3 GRENADE (OR THE WHEEL) - F / RIGHT CLICK QUICK MELEE - G THROW - E SWAP',
    'HIT SOMEONE WITH MELEE WHILE THEY SHOOT AND THEIR GUN FLIES OUT OF THEIR HANDS',
  ];
  lines.forEach((l, i) => centerText(ctx, l, sy + 16 * u + i * 9 * u, 1, i === 3 ? '#ff8a6a' : '#7a8a80', u));
  centerText(ctx, 'W S / UP DOWN - PICK   A D / LEFT RIGHT / CLICK - CHANGE   ENTER - START', H - 10 * u, 1, '#5a6a60', u);
}

// Step a setting one way or the other.
function changeSetting(i, dir) {
  const [k, , vals] = OPTIONS[i];
  const at = vals.findIndex(([v]) => v === settings[k]);
  settings[k] = vals[(at + dir + vals.length) % vals.length][0];
  saveSettings();
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
  // the mouse: hover picks a row, a click changes it (left half back, right half on) or starts
  if (input.mouse.active) {
    const mx = input.mouse.x * renderer.dpr, my = input.mouse.y * renderer.dpr;
    const row = menuRows.find((r) => my >= r.y0 && my < r.y1 && mx >= r.x0 && mx <= r.x1);
    if (row && input.wasPressed('Mouse0', 'Mouse2')) {
      menuSel = row.i;
      if (row.start) return startMatch();
      changeSetting(row.i, input.wasPressed('Mouse2') || mx < row.mid - 20 * renderer.scale ? -1 : 1);
    } else if (row && input.pressed.size === 0 && (input.mouse.x !== titleInput.lx || input.mouse.y !== titleInput.ly)) menuSel = row.i;
    titleInput.lx = input.mouse.x;
    titleInput.ly = input.mouse.y;
  }
  if (input.wasPressed('Enter') || (menuSel === OPTIONS.length && input.wasPressed('Space'))) startMatch();
}

function drawMatch(ctx, u, W, H) {
  ctx.fillStyle = 'rgba(4, 6, 6, 0.72)';
  ctx.fillRect(0, 0, W, H);
  const c = champion, y = H * 0.24;
  centerText(ctx, teamMode() ? `${TEAMS[c.team].name} TEAM WINS THE MATCH` : c === player ? 'YOU WIN THE MATCH' : `${c.name} WINS THE MATCH`, y, 4, tagColor(c), u);
  const rows = [...game.fighters].sort((a, b) => b.wins - a.wins || b.kills - a.kills);
  centerText(ctx, 'NAME      ROUNDS   KILLS', y + 36 * u, 1, '#5a6a60', u);
  rows.forEach((o, i) => centerText(ctx, `${o.name.padEnd(8)}  ${String(o.wins).padStart(4)}   ${String(o.kills).padStart(5)}`, y + 48 * u + i * 11 * u, 1, tagColor(o), u));
  if (Math.floor(game.time * 2) % 2 === 0) centerText(ctx, 'CLICK OR ENTER - REMATCH      S / ESC - ROOM SETUP', y + 110 * u, 1, '#ffd25a', u);
}

// ---------- the loop ----------

makeFighters();
startRound();
state = 'title';
banner = null;

let last = performance.now();
function frame(now) {
  if (frozen) { drawWorld(); drawHud(); }
  else tick(Math.min(1 / 30, (now - last) / 1000));
  last = now;
  requestAnimationFrame(frame);
}

function tick(realDt, draw = true) {
  // menus
  if (state === 'title') titleInput();
  else if (state === 'match') {
    if (stateT > 1 && input.wasPressed('Enter', 'Mouse0')) startMatch();
    else if (stateT > 1 && input.wasPressed('KeyS')) { state = 'title'; banner = null; }
    else if (input.wasPressed('Escape')) { state = 'title'; banner = null; }
  } else if (input.wasPressed('Escape')) paused = !paused;
  if (paused) {
    if (input.wasPressed('KeyQ')) { paused = false; state = 'title'; banner = null; }
    if (input.wasPressed('KeyR')) { paused = false; startMatch(); }
    if (input.wasPressed('KeyS')) { paused = false; state = 'title'; banner = null; }
  }

  if (!paused) {
    const dt = realDt * slow;
    game.time += dt;
    if (state !== 'title') updateRounds(dt, realDt);
    else stateT += realDt;
    if (banner) { banner.t -= realDt; if (banner.t <= 0) banner = null; }
    const live = state === 'fight' || state === 'end';
    const pc = live ? (testControl ? { ...IDLE, ...testControl } : playerControl()) : IDLE;
    if (pc.pickup) player.pickupPressed = true;
    player.update(dt, pc);
    for (const b of bots) b.f.update(dt, live ? b.control(dt) : IDLE);
    updateBullets(dt);
    updateGrenades(dt);
    updatePickups(dt);
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
  }
  // the system cursor on the menus (setup, results, pause); in a fight the crosshair takes its place
  const cursor = state === 'title' || state === 'match' || paused ? 'default' : 'none';
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
  game, renderer, level, startMatch,
  get player() { return player; }, get state() { return state; }, get bots() { return bots; },
  set control(c) { testControl = c; },
  set frozen(v) { frozen = v; },
  step(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) tick(dt, false); drawWorld(); drawHud(); },
};
