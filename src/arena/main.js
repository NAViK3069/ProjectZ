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
import { drawFlagBase, drawFlag, drawFlagGlow, drawTag } from './objfx.js';
import { drawFang, drawFangGlow, drawFangTrail, drawFangFlash, drawVioletShot } from './goldfx.js';
import { Fighter, MAX_STAMINA, DAMAGE, gunMul, GUN_HANDLING, HEAD_MUL, SKILL_CD, SKILL_TIME, BACKSTAB, SHADOW, GRAPPLE_SHOTS, SWORD_COST, HACK_LOCK, SANDE_WORLD, SANDE_NEED, LUNGE_RANGE, CARD_LAST, CARD_ALLY, AURUM_CAST } from './fighter.js';
import { Fx } from './fx.js';
import { Lights } from './light.js';
import { Nav, Bot, gunTier } from './ai.js';
import { drawBolts, drawVoidHole } from './void.js';
import { drawBlast } from './flame.js';
import { drawCircle, drawHole, drawBoom } from './galaxy.js';
import { drawSword, drawSwordTrail, drawSwordCircle, drawStab } from './swords.js';
import { drawLockBeam, drawLockMark } from './visor.js';
import { drawArrow, drawArrowRing } from './archery.js';
import { drawRiftPortal, drawRiftPath, drawRiftTraveller, drawRiftBurst, drawRiftCrack } from './rift.js';
import { drawStabRing, drawStabBurst } from './cloakfx.js';
import { drawShieldBurst, drawHackWave, drawSandeScreen, drawBat, drawBatTrail, drawBlood, drawDeflectCut, drawChidoriHit, drawStealBurst, drawStealMark, DEFLECT_R, CARDS, CARD_LEAN, CARD_PICK, cardToward } from './skillfx.js';
import { sound } from './sound.js';
import { TouchControls, isPhone } from './touch.js';
import { online, initOnline, openOnline, netUpdate, netScreenInput, netGameInput, drawNetScreen, drawNetOverlay, updateRemotes, hostFrame, clientFrame } from './online.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (l) => l[(Math.random() * l.length) | 0];


const canvas = document.getElementById('game');
const kit = new Kit();   // the menus' look and clicks (ui/kit.js)
const renderer = new Renderer(canvas, { viewHeight: isPhone ? 240 : 290, viewWidth: 500, fit: isPhone ? 'round' : 'floor', maxDpr: isPhone ? 2 : Infinity });
// the HUD's pixel size: the world's on an ordinary screen, a step smaller on a big one
// The size of a font pixel on the menus and the HUD: by the screen, so they take up the same share of it on any screen
// (480 x 295 is what the fullest of them needs), in whole pixels so the pixel art stays sharp.
for (const [key, over] of Object.entries(GUN_HANDLING)) Object.assign(WEAPONS[key], over);
const hudScale = () => Math.max(2, Math.floor(Math.min(renderer.width / 480, renderer.height / 295)));
const input = new Input(canvas);
// the map being played (the main menu shows the lab behind it)
let level = new Level(MAPS.lab);
let PW = level.w * T, PH = level.h * T;
function loadMap(key) {
  level = new Level(MAPS[key] ?? MAPS.lab);
  PW = level.w * T;
  PH = level.h * T;
  game.level = level;
  game._nav = null;
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

// ---------- the modes ----------
// teams: two sides. respawn: back in every time, the round's won on points (score: what scores) - first to SCORE TO
// WIN, or ahead when the time's up (level: next point wins). oneLife: one life a round. economy: money for kills and
// rounds, spent in a shop before each round (BUY_TIME). rounds: rounds to win, whatever the room says. maps: the ones
// it plays best on (picked when the mode is).
const MODES = {
  ffa: { name: 'FREE FOR ALL', desc: 'EVERYONE FOR THEMSELVES - LAST ONE STANDING TAKES THE ROUND' },
  teams: { name: 'TEAMS', teams: true, desc: 'TWO SIDES - LAST SIDE STANDING TAKES THE ROUND' },
  duel: { name: '1 V 1', duel: true, desc: 'YOU AND ONE BOT - LAST ONE STANDING TAKES THE ROUND', maps: ['pit'] },
  tdm: { name: 'TEAM DEATHMATCH', teams: true, respawn: true, score: 'kills', rounds: 1, desc: 'BACK IN EVERY TIME - FIRST SIDE TO THE KILLS WINS', maps: ['highway', 'foundry'] },
  guns: { name: 'RANDOM GUNS', respawn: true, score: 'kills', rounds: 1, randomGuns: true, desc: 'A RANDOM GUN EACH LIFE, SHUFFLED EVERY 30 S - FIRST TO THE KILLS', maps: ['foundry', 'highway'] },
  tags: { name: 'DOG TAGS', teams: true, respawn: true, score: 'tags', rounds: 1, desc: 'KILLS COUNT WHEN THEIR TAG IS TAKEN - TAKE YOUR SIDE\'S BACK TO DENY', maps: ['foundry', 'highway'] },
  ctf: { name: 'CAPTURE THE FLAG', teams: true, respawn: true, score: 'caps', rounds: 1, desc: 'BRING THEIR FLAG BACK TO YOURS - YOURS HAS TO BE HOME', maps: ['canyon', 'forts'] },
  buy: { name: 'BUY & FIGHT', teams: true, oneLife: true, economy: true, rounds: 5, desc: 'ONE LIFE - BUY GUNS WITH WHAT YOU EARN - FIRST SIDE TO 5 ROUNDS', maps: ['forts', 'canyon', 'foundry'] },
};
const MODE_KEYS = Object.keys(MODES);
const CAPS = { 10: 1, 20: 3, 30: 5, 50: 7 };   // CAPTURE THE FLAG: SCORE TO WIN, as captures

// ---------- the room's settings (Superfighters style), kept between visits ----------

const OPTIONS = [
  ['map', 'MAP', [...MAP_KEYS.map((k) => [k, MAPS[k].name]), ['random', 'RANDOM']]],
  ['mode', 'MODE', MODE_KEYS.map((k) => [k, MODES[k].name])],
  ['bots', 'BOTS', [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6'], [7, '7']]],
  ['skill', 'BOT SKILL', [[0.7, 'EASY'], [1, 'NORMAL'], [1.35, 'HARD']]],
  ['wins', 'ROUNDS TO WIN', [[1, '1'], [3, '3'], [5, '5'], [7, '7']]],
  ['time', 'ROUND TIME', [[60, '1:00'], [90, '1:30'], [120, '2:00'], [180, '3:00'], [300, '5:00'], [0, 'NO LIMIT']]],
  ['goal', 'SCORE TO WIN', [[10, '10'], [20, '20'], [30, '30'], [50, '50']]],   // (the modes played on points: kills, tags - or captures, see CAPS)
  ['skills', 'SKILLS (Q)', [[1, 'ON'], [0, 'OFF']]],
  ['skillmode', 'SKILL MODE', [['set', 'AS PICKED'], ['random', 'RANDOM EVERY LIFE'], ['pick', 'PICK WHEN YOU DIE']]],
  ['cd', 'SKILL COOLDOWN', [[0, 'NONE'], [0.25, '25%'], [0.5, '50%'], [0.75, '75%'], [1, '100%'], [1.5, '150%'], [2, '200%'], [3, '300%']]],
  ['myskill', 'YOUR SKILL', [['grapple', 'GRAPPLE LINE'], ['cloak', 'CLOAK'], ['decoy', 'SHADOW CLONE'], ['archery', 'ARCHERY'], ['murasaki', 'MURASAKI'], ['blaze', 'FLAME FIST'], ['galaxy', 'GALAXY'], ['demon', 'FLYING SWORDS'], ['lock', 'TARGET LOCK'], ['shield', 'BLUE SHIELD'], ['cards', 'BUFF CARDS'], ['hack', 'HACK'], ['sande', 'SANDEVISTAN'], ['vampire', 'VAMPIRE'], ['deflect', 'DEFLECT'], ['chidori', 'CHIDORI'], ['octo', 'OCTO ARMS'], ['steal', 'SKILL THIEF'], ['jumper', 'JUMPER'], ['fang', 'GOLDEN FANGS'], ['aurum', 'AURUM'], ['reap', 'SHADOW KILL'], [null, 'NO SKILL']]],
  ['botskill', 'BOT SKILLS', [['random', 'RANDOM'], ['grapple', 'GRAPPLE LINE'], ['cloak', 'CLOAK'], ['decoy', 'SHADOW CLONE'], ['archery', 'ARCHERY'], ['murasaki', 'MURASAKI'], ['blaze', 'FLAME FIST'], ['galaxy', 'GALAXY'], ['demon', 'FLYING SWORDS'], ['lock', 'TARGET LOCK'], ['shield', 'BLUE SHIELD'], ['cards', 'BUFF CARDS'], ['hack', 'HACK'], ['sande', 'SANDEVISTAN'], ['vampire', 'VAMPIRE'], ['deflect', 'DEFLECT'], ['chidori', 'CHIDORI'], ['octo', 'OCTO ARMS'], ['steal', 'SKILL THIEF'], ['jumper', 'JUMPER'], ['fang', 'GOLDEN FANGS'], ['aurum', 'AURUM'], ['reap', 'SHADOW KILL'], [null, 'NONE']]],
  ['lives', 'LIVES', [[1, '1'], [2, '2'], [3, '3'], [5, '5']]],
  ['hp', 'HEALTH', [[100, '100'], [200, '200'], [300, '300'], [500, '500']]],
  ['dmg', 'GUN DAMAGE', [[0.5, '50%'], [0.75, '75%'], [1, '100%'], [1.5, '150%']]],
  ['start', 'START WITH', [['fists', 'FISTS'], ['pistol', 'FISTS + PISTOL'], ['random', 'FISTS + RANDOM GUN'], ['knife', 'KNIFE + PISTOL']]],
  ['nades', 'START GRENADES', [[0, '0'], [1, '1'], [2, '2'], [3, '3']]],
  ['drops', 'ITEM DROPS', [[0, 'OFF'], [0.5, 'FEW'], [1, 'NORMAL'], [2, 'MANY']]],
  ['pool', 'WEAPONS THAT DROP', [['all', 'GUNS + MELEE'], ['guns', 'GUNS ONLY'], ['melee', 'MELEE ONLY']]],
  ['banGuns', 'BANNED GUNS', []],   // (these two: lists, picked in a list of their own - see openBans)
  ['banSkills', 'BANNED SKILLS', []],
];
const DEFAULTS = { goal: 20, map: 'lab', mode: 'ffa', bots: 3, skill: 1, wins: 3, time: 90, skills: 1, myskill: 'grapple', botskill: 'random', lives: 2, hp: 300, dmg: 1, start: 'pistol', nades: 1, drops: 1, pool: 'all', skillmode: 'set', cd: 1, banGuns: [], banSkills: [] };
const settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem('arena.settings') ?? '{}')); } catch {}
const saveSettings = () => { try { localStorage.setItem('arena.settings', JSON.stringify(settings)); } catch {} };
for (const [k, , vals] of OPTIONS) if (vals.length ? !vals.some(([v]) => v === settings[k]) : !Array.isArray(settings[k])) settings[k] = DEFAULTS[k];
// what the room has banned: those guns never turn up, those skills nobody gets (training goes by none of it)
const gunOK = (key) => !settings.banGuns.includes(key);
const skillOK = (key) => !key || !settings.banSkills.includes(key);
const banShown = (list) => (list?.length ? `${list.length} BANNED` : 'NONE');

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
// the guns that can be banned: all that turn up, and the pistol everyone starts with
const BAN_GUNS = [...new Set(['m9', ...GUN_POOL])].filter((k) => WEAPONS[k]);
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
  level, weapons: WEAPONS, fighters: [], props: [], bullets: [], grenades: [], pickups: [], feed: [], blasts: [], thrown: [], numbers: [], racks: [], arrows: [], voids: [], fists: [], galaxies: [], swordSets: [], punches: [], bursts: [], bats: [], bloods: [], rifts: [], fangs: [], tags: [], obj: null,
  get gunDamage() { return settings.dmg; },
  get regen() { return !overtime; },   // out of a fight for a while, you heal (not once the lab's venting)
  get viewer() { return player; },
  // training: your skill has no wait between uses, unless the skill bay turns cooldowns on
  noCooldown: (f) => (state === 'training' ? isTrainee(f) && !trainCfg.cooldowns : settings.cd === 0),
  // how fast the skills' waits run down: the room's SKILL COOLDOWN (50%: twice as fast)
  cdRate: () => (state === 'training' || !settings.cd ? 1 : 1 / settings.cd),
  kick: (dx, dy) => renderer.kick(dx, dy),
  loose: (f, targets, point) => loose(f, targets, point),
  flameFist: (f, x, y, a, v) => flameFist(f, x, y, a, v),
  summonSwords: (f, seed, n) => summonSwords(f, seed, n),
  barrierBurst: (f, broken, charge) => barrierBurst(f, broken, charge),
  summonBats: (f) => summonBats(f),
  // deflect's dash, over: the cut left hanging in the air behind it
  deflectEnd(f, m) {
    this.bursts.push({ kind: 'cut', x: f.x, y: f.y - 14, x0: m.x0, y0: m.y0, t: 0, seed: Math.random() * 100 });
    this.lights.flash(f.x, f.y - 14, 90, '90, 255, 190', 0.15);
    if (f === player) renderer.kick(Math.cos(m.a) * 3, Math.sin(m.a) * 3);
  },
  // deflect's dash: whoever it passes through, the once
  deflectCut(f, m, dmg) {
    const ux = Math.cos(m.a), uy = Math.sin(m.a);
    for (const v of this.fighters) {
      if (v === f || !v.alive || v.vanish || !this.foes(f, v) || (v.hidden && !v.glimpsed) || m.hit.includes(v)) continue;
      if (Math.hypot(v.x - f.x, v.y - 14 - (f.y - 14)) > 22) continue;
      m.hit.push(v);
      v.hitHow = 'DEFLECT';
      v.hurt(dmg, f, ux * 240, -120);
      this.fx.sparks(v.x, v.y - 14, 12, ux, uy, '#7affd0');
      this.punches.push({ x: v.x, y: v.y - 14, ax: ux, ay: uy, t: 0, seed: Math.random() * 100 });
    }
  },
  hackBurst: (f) => hackBurst(f),
  // the grapple's spin cut: health back, by what it took out of them
  drain(f, hp) {
    if (!f.alive || hp <= 0) return;
    f.hp = Math.min(f.maxHp, f.hp + hp);
    this.numbers.push({ text: `+${Math.round(hp)}`, x: f.x + rand(-6, 6), y: f.y - 34, t: 0, color: '#5aff7a', big: false });
  },
  objective: (f) => objectiveFor(f),
  throwFangs: (f) => throwFangs(f),
  recallFangs: (f) => recallFangs(f),
  aurumOn: (f) => aurumOn(f),
  aurumOff: (f) => aurumOff(f),
  reapCut: (f, v, dmg, ux, uy, last) => reapCut(f, v, dmg, ux, uy, last),
  // the cloak's one stab going in: the effect of it, on whoever it went for (or out at the knife's point if nobody)
  cloakStab(f, k) {
    const v = k.prey, near = v?.alive && Math.hypot(v.x - f.x, v.y - f.y) < LUNGE_RANGE + 12;
    const x = near ? v.x : f.x + Math.cos(f.aim) * 16, y = near ? v.y - 14 : f.y - 14 + Math.sin(f.aim) * 16;
    const back = !!(near && k.backstab === v);
    this.bursts.push({ kind: 'stab', x, y, a: f.aim, back, t: 0, seed: Math.random() * 10 });
    this.lights.flash(x, y, back ? 120 : 80, back ? '255, 210, 120' : '180, 120, 255', back ? 0.3 : 0.18);
    if (f === player || v === player) renderer.kick(Math.cos(f.aim) * (back ? 6 : 3), Math.sin(f.aim) * (back ? 6 : 3));
  },
  // the jumper: the first rift, where they stand - only a crack in the air till the other end's open (see updateRifts)
  openRift(f) {
    this.rifts.push({ id: (this.riftIds = (this.riftIds ?? 0) + 1), owner: f, a: { x: f.x, y: f.y }, b: null, path: [{ x: f.x, y: f.y }], t: 0, open: false, life: RIFT_LIFE, seed: Math.random() * 10 });
    this.bursts.push({ kind: 'rift', x: f.x, y: f.y - 15, t: 0 });
    this.lights.flash(f.x, f.y - 15, 110, '170, 90, 255', 0.25);
  },
  // the skill thief's hack done: they're cut off, and what was theirs goes to the thief (named, for over the head)
  stealHit(f, v) {
    const info = SKILL_INFO.find((k) => k.key === f.stolen?.skill);
    if (f.stolen) Object.assign(f.stolen, { name: info?.name ?? f.stolen.skill.toUpperCase(), color: info?.color });
    v.hacked(STEAL_HACK);
    this.bursts.push({ kind: 'steal', x: v.x, y: v.y - 14, x0: f.x, y0: f.y - 17, owner: f, t: 0, seed: Math.random() * 6 });   // (owner: the stream goes after the thief, wherever they go)
    this.fx.sparks(v.x, v.y - 14, 16, 0, -1, '#ff6ad8');
    this.lights.flash(v.x, v.y - 14, 130, '255, 90, 220', 0.3);
    if (f === player || v === player) renderer.kick(0, -3);
  },
  // chidori, run (or lunged) into someone: driven into them, there and then - the hurt now, and the two of them held
  // there a moment (chidoriHold), then they're thrown off it (chidoriRelease). Whoever the body's up against, that's who.
  chidoriStrike(f, m) {
    for (const o of this.fighters) {
      if (o === f || !o.alive || o.vanish || o.wraith || !this.foes(f, o) || (o.hidden && !o.glimpsed)) continue;
      if (Math.abs(o.x - f.x) > 15 || Math.abs(o.y - f.y) > 22) continue;
      const dir = Math.sign(o.x - f.x) || f.facing, a = m.phase === 'lunge' ? m.a : dir > 0 ? 0 : Math.PI;
      o.hitHow = 'CHIDORI';
      if (!o.hurt(CHIDORI_DMG, f, Math.cos(a) * 60, -30)) continue;   // (rolled under it)
      m.pin = { x: o.x, y: o.y, fx: o.x - Math.cos(a) * 12, fy: f.y };
      this.fx.sparks(o.x, o.y - 14, 30, Math.cos(a), Math.sin(a), '#ffffff');
      this.lights.flash(o.x, o.y - 14, 200, '170, 220, 255', 0.5);
      if (f === player || o === player) renderer.kick(Math.cos(a) * 5, Math.sin(a) * 5);
      return o;
    }
    return null;
  },
  chidoriHold(f, m) {
    const v = m.victim, p = m.pin;
    if (!p) return;
    f.x = p.fx;
    if (v?.alive) { v.x = p.x; v.y = p.y; v.vx = v.vy = 0; if (m.t < 0.4) v.flash = 0; }   // (the white of the hit, only for an instant: then the body, jolting)
    if (Math.random() < 0.5) this.fx.sparks(p.x, p.y - 14, 1, Math.cos(m.a), Math.sin(m.a), '#9fe6ff');
  },
  chidoriRelease(f, m) {
    const v = m.victim, a = m.a, p = m.pin ?? { x: f.x, y: f.y };
    if (v?.alive) { v.vx = Math.cos(a) * 420; v.vy = Math.sin(a) * 140 - 190; v.onGround = false; }
    f.vx = -Math.cos(a) * 90;
    this.bursts.push({ kind: 'chidori', x: p.x, y: p.y - 14, a, t: 0, seed: Math.random() * 100 });
    this.fx.sparks(p.x, p.y - 14, 24, Math.cos(a), Math.sin(a), '#bfefff');
    this.lights.flash(p.x, p.y - 14, 160, '150, 210, 255', 0.35);
    if (f === player || v === player) renderer.kick(Math.cos(a) * 8, Math.sin(a) * 8);
  },
  // your own buff cards: where on the screen they were put, in the world as the camera is now
  cardPin: (f) => (f === player && cardPin && !online.watching ? renderer.screenToWorld(cardPin.x, cardPin.y) : null),
  // the card's turned: teammates near by get their share of it
  shareCard(f, kind) {
    for (const o of this.fighters) {
      if (o === f || !o.alive || o.isDecoy || o.vanish || this.foes(f, o) || Math.hypot(o.x - f.x, o.y - f.y) > CARD_SHARE) continue;
      const left = CARD_LAST[kind] * CARD_ALLY;
      o.allyCard = { kind, left, total: left };
      o.cardLands?.(kind, CARD_ALLY);
      if (kind === 'purple') o.fade = { t: 0, dur: 0.3, out: true, seed: Math.random() * 100, rgb: '180, 110, 255' };
      this.fx.sparks(o.x, o.y - 18, 8, 0, -1, '#ffe08a');
    }
  },
  onShieldHit(v, d) {
    this.numbers.push({ text: Math.round(d), x: v.x + rand(-5, 5), y: v.y - 34, t: 0, color: '#8fdcff', big: false });
    this.fx.sparks(v.x, v.y - 14, 3, 0, -1, '#8fdcff');
  },
  galaxy: (f, x, y, seed) => game.galaxies.push({ owner: f, x, y, seed, t: 0, boomed: false, burn: new Map() }),
  hollowPurple: (f, x, y, a) => game.voids.push({ owner: f, x, y, x0: x, y0: y, a, sp: 120, dist: 0, t: 0, hit: new Set(), done: -1 }),   // whose eyes the screen is (a cloaked fighter shows only to itself)
  // what everyone starts a round with
  loadout() {
    const want = settings.start === 'fists' ? null : settings.start === 'random' ? pick(GUN_POOL.filter(gunOK)) ?? null : 'm9';
    const gun = want && gunOK(want) ? want : null;   // (the pistol banned: fists)
    return { gun, ammo: gun ? WEAPONS[gun].magSize * (gun === 'm9' ? 3 : 2) : 0, grenades: settings.nades, hp: settings.hp, melee: settings.start === 'knife' ? 'knife' : null };
  },
  nadeArt: (kind) => NADE_ART[kind] ?? NADE,
  // PICK WHEN YOU DIE: f (dead) picks the skill for its next life; the first pick cuts the wait down to the usual
  pickNext(f, key) {
    if (!picking() || f.alive || (key !== null && (!SKILL_CD[key] || !skillOK(key)))) return;
    f.nextSkill = key;
    if (!f.picked && f.respawnT > 0) f.respawnT = Math.max(0.4, f.respawnT - (PICK_TIME - RESPAWN_TIME));
    f.picked = true;
  },
  foes(a, b) {
    if (a.vanish || b.vanish || (a.dummy && b.dummy)) return false;
    const ra = a.owner ?? a, rb = b.owner ?? b;   // (a shadow clone sides with whoever made it)
    if (state === 'training' && !trainCfg.pvp && isTrainee(ra) && isTrainee(rb)) return false;   // (training: PLAYERS HURT EACH OTHER off)
    return ra !== rb && (!teamMode() || ra.team !== rb.team);
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
  fx: new Fx(level), lights: new Lights(level), _nav: null,
  get nav() { return (this._nav ??= new Nav(this.level)); },   // (made when it's first wanted: only the bots and the drops need it)
  // a hit landed on someone: a damage number pops up (white body, yellow head, red melee, orange blast)
  onHurt(v, dmg, kind, from) {
    const color = kind === 'crit' ? '#ff3a2a' : kind === 'head' ? '#ffd84a' : kind === 'blast' ? '#ff8a3c' : kind === 'melee' ? '#ff6a6a' : '#f2f2ea';
    const n = String(Math.max(1, Math.round(dmg)));
    this.numbers.push({ text: kind === 'crit' ? `CRIT ${n}!` : n, x: v.x + rand(-5, 5), y: v.y - 34, t: 0, color, big: kind === 'head' || kind === 'crit' || dmg >= 60 });
    // training: what you (or your shadow clone) do to the dummies, what they do to you
    if ((v.dummy || v.sparring) && (from === player || from?.owner === player)) {
      stats.record(dmg, kind, Math.hypot(v.x - player.x, v.y - player.y) / 16);
      (v._hits ??= []).push({ d: dmg, at: performance.now() / 1000 });   // (the number over its head)
    }
    if (v === player && state === 'training') stats.hurt(dmg);
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
  fireBullet(f, x, y, a, speed, dmg, range, pierce, far = 1) {
    const s = f.shoulder;
    if (!this.los(s.x, s.y, x, y)) {
      this.fx.sparks(x, y, 3, -Math.cos(a), -Math.sin(a));   // the gun's poked into a wall
      return;
    }
    // (id, sq: online, how a shot's known; rw: how far behind now its shooter saw everyone - see pastOf)
    const b = { id: (this.shotIds = (this.shotIds ?? 0) + 1), x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, speed, owner: f, dmg, left: range, travelled: 0, pierce, far, done: new Set(), dead: false, sq: f.shotSeed ?? 0, rw: f.rewind ?? 0, violet: !!f.weapon?.def.violet };
    this.bullets.push(b);
    this.onShot?.(b);
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
      // (online: where the player swinging saw them - see pastOf)
      const seen = (f.rewind && this.pastOf?.(v, f.rewind)) || v;
      const tx = seen.x, ty = seen.y - (v.roll ? 7 : 14), dist = Math.hypot(tx - o.x, ty - o.y);
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
      if (d.cloak && f.cloak && !v.alive && !v.isDecoy) f.cloak.killed = true;   // (a kill with the stab: the wait after is shorter)
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
    // (a shadow clone's gun is part of the shadow: it's gone, or clones would be a way to make guns)
    if (!v.isDecoy) this.pickups.push({ kind: 'gun', key: w.def.key, ammo: w.ammo, reserve: w.reserve, x: v.x, y: v.y - 14, vx: dir * 110 + rand(-20, 20), vy: -170, beam: 0, life: 25, bob: 0, ready: false, noGrab: 0.5 });
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
      modeDeath(f, killer);
      f.deaths = (f.deaths ?? 0) + 1;
      f.lives = Math.max(0, (f.lives ?? 1) - 1);
      if (f.lives > 0 && !overtime) f.respawnT = picking() && !f.bot ? PICK_TIME : RESPAWN_TIME;
      if (picking() && f.bot && settings.botskill === 'random') f.nextSkill = pick(BOT_SKILLS.filter(skillOK)) ?? null;   // (bots on RANDOM: a new one too)
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
    if ((p.kind === 'wcrate' || p.kind === 'crate') && Math.random() < 0.6 && settings.drops > 0 && state !== 'training') this.spawnPickup(cx, p.y, true);   // sometimes something inside
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
      const far = (n) => Math.min(Infinity, ...this.pickups.map((p) => Math.hypot(p.x - (n.cx + 0.5) * T, p.y - (n.cy + 1) * T)));
      let n = null;
      for (let i = 0; i < 6 && spots.length; i++) { const o = pick(spots); if (!n || far(o) > far(n)) n = o; }
      if (!n) return;
      x = (n.cx + 0.5) * T;
      y = (n.cy + 1) * T;
    }
    const roll = Math.random(), pool = settings.pool, guns = mode().randomGuns || mode().economy ? [] : GUN_POOL.filter(gunOK);   // (RANDOM GUNS: the guns are dealt, not found)
    const weapon = () => (!guns.length ? (pool === 'guns' ? 'nades' : 'melee') : pool === 'guns' ? 'gun' : pool === 'melee' ? 'melee' : Math.random() < 0.8 ? 'gun' : 'melee');   // (every gun banned: none)
    let kind = roll < 0.78 ? weapon() : roll < 0.9 ? 'health' : 'nades';
    if (kind === 'health' && overtime) kind = weapon();   // (the lab's venting: no more healing turns up)
    const p = { kind, x, y: y - (dropped ? 4 : 18), vy: dropped ? -120 : 0, vx: dropped ? rand(-40, 40) : 0, beam: dropped ? 0 : 0.8, life: 40, bob: Math.random() * 6 };
    if (kind === 'gun') p.key = pick(guns);
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
  { name: 'ROOK', color: '#ffb84a', hue: 40, sat: 1.2, bot: true },
  { name: 'NYX', color: '#e07aff', hue: 250, sat: 1.3, bot: true },
  { name: 'ZED', color: '#7affc8', hue: 100, sat: 1.2, bot: true },
  { name: 'IVO', color: '#ff9ad8', hue: 320, sat: 1.2, bot: true },
];
let bots = [];
// the two sides, and what they wear (their shirts recoloured blue or red, so a side's plain to see)
const TEAMS = [{ name: 'BLUE', color: '#6ad8ff', look: { hue: 210, sat: 1.2 } }, { name: 'RED', color: '#ff6a5a', look: { hue: 8, sat: 1.7 } }];

function makeFighters() {
  const M = MODES[settings.mode] ?? MODES.ffa, teams = !!M.teams, n = M.duel ? 1 : teams ? settings.bots | 1 : settings.bots;   // (teams: even sides, 1 v 1 up to 4 v 4; 1 V 1: one bot)
  game.fighters = ROSTER.slice(0, n + 1).map((r, i) => {
    // teams: the first half (you among them) against the rest; otherwise everyone for themselves
    const team = teams ? (i < (n + 1) / 2 ? 0 : 1) : i;
    const look = { ...r, skill: r.bot ? botSkill() : skillOK(settings.myskill) ? settings.myskill : null };
    const f = new Fighter(game, images, teams ? { ...look, ...TEAMS[team].look } : look);
    f.team = team;
    return f;
  });
  player = game.fighters[0];
  if (!settings.skills) for (const f of game.fighters) f.skill = null;
  bots = game.fighters.filter((f) => f.bot).map((f, i) => new Bot(game, f, (0.9 + i * 0.04) * settings.skill));
}
// a bot's skill, by the setting: the one picked, or one at random
const BOT_SKILLS = ['cloak', 'decoy', 'archery', 'murasaki', 'blaze', 'galaxy', 'demon', 'lock', 'shield', 'cards', 'hack', 'sande', 'vampire', 'deflect', 'chidori', 'octo', 'steal', 'jumper', 'fang', 'aurum', 'reap'];
const botSkill = () => (settings.botskill === 'random' ? pick(BOT_SKILLS.filter(skillOK)) ?? null : skillOK(settings.botskill) ? settings.botskill ?? null : null);
const teamMode = () => !!MODES[settings.mode]?.teams && state !== 'training';   // (training's just you and the dummies, whatever the room says)
// the room's mode, and what it makes of the other settings
const mode = () => (state === 'training' ? MODES.ffa : MODES[settings.mode] ?? MODES.ffa);
const livesRule = () => (mode().respawn ? 99 : mode().oneLife ? 1 : settings.lives);
const livesShown = () => state !== 'training' && livesRule() > 1 && livesRule() < 99;
const roundsRule = () => mode().rounds ?? settings.wins;
const goalRule = () => (mode().score === 'caps' ? CAPS[settings.goal] ?? 3 : settings.goal);
const tagColor = (f) => (teamMode() ? TEAMS[f.team]?.color ?? f.color : f.color);

// ---------- rounds ----------

let state = 'menu';   // menu (the main menu) | soon (a mode not built yet) | title (room setup) | intro | fight | end | match
let paused = false;
let uiHidden = false;   // \ : no HUD, no names or numbers over the fight (see drawHudUnder)
let round = 0, roundT = 0, stateT = 0, slow = 1, banner = null, overtime = false;
let winner = null, champion = null, pickupT = 0;

function startRound() {
  spectating = null;
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
  game.swordSets = [];
  game.bursts = [];
  game.bats = [];
  game.rifts = [];
  game.fangs = [];
  game.bloods = [];
  game.punches = [];
  game.numbers = [];
  game.fx = new Fx(level);
  game.lights = new Lights(level);
  game.props = placeProps(level.props, level);
  clearDecoys();
  game.onRound?.();   // (online: anyone coming into the match comes in now)
  // (BUY & FIGHT: whoever's still standing keeps their gun)
  const keep = new Map();
  if (mode().economy && round > 1) for (const f of game.fighters) if (f.alive && f.gun && !f.gun.def.skillGun) keep.set(f, { key: f.gun.def.key, ammo: f.gun.ammo, reserve: f.gun.reserve, nades: f.grenades, nade: f.nade });
  game.obj = newObjective();
  game.tags = [];
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
      f.lives = livesRule();
      f.respawnT = 0;
      f.score = 0;
      const k = keep.get(f);
      if (k && game.weapons[k.key]) { const w = f.give(k.key, k.reserve); if (w) w.ammo = k.ammo; f.grenades = Math.max(f.grenades, k.nades); f.nade = k.nade; f.slot = 2; }
    });
  }
  for (const b of bots) b.reset();
  const M = mode();
  if (settings.drops > 0 && !M.economy) for (let i = 0; i < Math.round(6 * settings.drops); i++) game.spawnPickup();
  for (const p of game.pickups) p.beam = 0;
  pickupT = 2 / Math.max(0.5, settings.drops);
  banner = { text: `ROUND ${round}`, sub: roundScores(), t: 1.4, color: '#e8e2d0' };
  if (M.score) banner = { text: M.name, sub: M.score === 'caps' ? `FIRST TO ${goalRule()} CAPTURES` : M.score === 'tags' ? `FIRST TO ${goalRule()} TAGS` : `FIRST TO ${goalRule()} KILLS`, t: 2, color: '#ffd25a' };
  if (M.economy) {
    for (const b of bots) botBuy(b.f);
    if (state === 'intro' && player.alive && !online.watching && !online.isClient && !player.bot) openLocker({ use: 'shop' });
  }
}
// The round's score line: BLUE 2 - 1 RED, or everyone's rounds won.
function roundScores() {
  if (!teamMode()) return game.fighters.filter((f) => !f.isDecoy).map((f) => `${f.name} ${f.wins}`).join('   ');
  const [b, r] = [0, 1].map((t) => Math.max(0, ...game.fighters.filter((f) => f.team === t && !f.isDecoy).map((f) => f.wins)));
  return `BLUE ${b}  -  ${r} RED`;
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
  lifeSkill(f);
  f.reset(x, y);
  const L = game.loadout();
  if (L.melee) f.giveMelee(MELEE[L.melee]);
  // RANDOM GUNS: whatever turns up, plenty for it
  if (mode().randomGuns && state !== 'title' && !f.dummy) { const k = pick(GUN_POOL.filter(gunOK)); if (k) { f.give(k, WEAPONS[k].magSize * 4); f.slot = 2; } }
  while (f.hits(f.x - 5, f.y - 28, f.x + 5, f.y)) f.y -= 1;   // spawned in a crate: stand on it
  f.hitHow = null;
}

// The room's SKILL MODE, each time someone comes in: RANDOM EVERY LIFE - a new one (not the last, if there's another
// to have); PICK WHEN YOU DIE - the one picked while dead (see drawNextSkill), if one was.
function lifeSkill(f) {
  f.picked = false;
  if (!settings.skills || state === 'training' || state === 'title' || f.isDecoy || f.dummy) return;
  let key = f.skill;
  if (settings.skillmode === 'random') {
    const ok = SKILL_INFO.map((k) => k.key).filter(skillOK), others = ok.filter((k) => k !== f.skill);
    key = pick(others.length ? others : ok) ?? null;
  } else if (settings.skillmode === 'pick' && f.nextSkill !== undefined) key = f.nextSkill;
  f.nextSkill = undefined;
  if (key === f.skill) return;
  f.skill = key;
  const info = SKILL_INFO.find((k) => k.key === key);
  if (info) game.numbers.push({ text: info.name, x: f.x, y: f.y - 40, t: 0, color: info.color, big: false });   // (who's got what now, over their head as they come in)
}

// ---------- lives ----------
// With lives to spare, a fighter who goes down is beamed back in a couple of
// seconds later, at the spawn point furthest from anyone who'd want them dead,
// with the round's starting kit and a shield for a moment (gone the moment
// they attack). Out of lives, they're out of the round.
const RESPAWN_TIME = 2, SPAWN_SHIELD = 2;
const PICK_TIME = 6;   // (PICK WHEN YOU DIE: longer, to choose in - picking takes it back down to the usual)
const picking = () => !!settings.skills && settings.skillmode === 'pick' && state !== 'training';
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

// ---------- what the modes play for ----------
// Points (TEAM DEATHMATCH, RANDOM GUNS, DOG TAGS, CAPTURE THE FLAG), the money and the shop (BUY & FIGHT), the flags
// and the tags. All of it in game.obj (and game.tags), plain data: online, the host's sent to everyone as it changes
// (see online.js).
const START_MONEY = 800, MONEY_MAX = 16000, KILL_MONEY = 300, WIN_MONEY = 3000, LOSE_MONEY = 1900;
const BUY_TIME = 9;   // the buying before each round (everyone held where they are)
const GUN_SHUFFLE = 30, TAG_LIFE = 25, FLAG_BACK = 18;   // RANDOM GUNS: how often; DOG TAGS: how long a tag lies; a flag lying about: till it goes home
let roundWhy = '';   // (how the round was won, under the banner)

// A side's flag stand: the map's, or the spawn furthest its way.
function flagBase(team) {
  const set = level.flags.find((b) => b.team === team);
  if (set) return set;
  const s = [...level.spawns].sort((a, b) => (team === 0 ? a.x - b.x : b.x - a.x) || b.y - a.y)[0];
  return { team, x: s.x, y: s.y };
}
function newObjective() {
  const M = mode();
  if (!M.score) return null;
  const O = { score: [0, 0] };
  if (M.score === 'caps') O.flags = [0, 1].map((team) => { const b = flagBase(team); return { team, hx: b.x, hy: b.y, x: b.x, y: b.y, vx: 0, vy: 0, state: 'home', carrier: null, back: 0 }; });
  if (M.randomGuns) O.shuffle = GUN_SHUFFLE;
  return O;
}
// The round's over: who for (a side, a fighter, nobody), and why.
function endRound(who, why = '') {
  if (state !== 'fight') return;
  state = 'end';
  stateT = 0;
  roundWhy = why;
  banner = null;
  winner = typeof who === 'number' ? game.fighters.find((f) => f.team === who && !f.isDecoy) ?? null : who;
  // the whole winning side scores (the dead teammates too)
  if (winner) for (const f of game.fighters) if (f.team === winner.team) f.wins++;
  if (mode().economy) for (const f of game.fighters) if (!f.isDecoy) f.money = Math.min(MONEY_MAX, (f.money ?? 0) + (winner && f.team === winner.team ? WIN_MONEY : LOSE_MONEY));
}
// on points: whoever's ahead (a side, or a fighter), or nobody if it's level
function scoreLead() {
  const O = game.obj;
  if (teamMode()) return O.score[0] === O.score[1] ? null : O.score[0] > O.score[1] ? 0 : 1;
  const list = game.fighters.filter((f) => !f.isDecoy).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return list[0] && (list[0].score ?? 0) > (list[1]?.score ?? -1) ? list[0] : null;
}
// BUY & FIGHT, out of time: the side with more left standing (and then more health)
function aheadAlive() {
  const n = (t) => game.fighters.filter((f) => f.team === t && f.alive && !f.isDecoy), hp = (t) => n(t).reduce((s, f) => s + f.hp, 0);
  return n(0).length !== n(1).length ? (n(0).length > n(1).length ? 0 : 1) : hp(0) === hp(1) ? null : hp(0) > hp(1) ? 0 : 1;
}
// a point to a side (or a fighter) - and the round, if that's enough (or it's sudden death)
function addScore(who, why) {
  const O = game.obj;
  if (!O || state !== 'fight') return;
  const n = typeof who === 'number' ? ++O.score[who] : (who.score = (who.score ?? 0) + 1);
  if (n >= goalRule() || overtime) endRound(who, why);
}
// Someone's gone down (game.onDeath, before their lives are counted): what that means for the mode.
function modeDeath(f, killer) {
  const M = mode(), O = game.obj;
  if (f.isDecoy) return;
  const foe = killer && killer !== f && game.foes(killer, f);
  if (M.economy && foe) killer.money = Math.min(MONEY_MAX, (killer.money ?? 0) + KILL_MONEY);
  if (!O || state !== 'fight') return;
  if (M.score === 'kills' && foe) addScore(teamMode() ? killer.team : killer);
  if (M.score === 'tags') game.tags.push({ x: f.x, y: f.y - 6, vx: rand(-30, 30), vy: -170, team: f.team, t: 0, seed: Math.random() * 6 });
  for (const fl of O.flags ?? []) if (fl.carrier === f) Object.assign(fl, { carrier: null, state: 'dropped', x: f.x, y: f.y - 4, vx: 0, vy: -100, back: FLAG_BACK });
}
// Something dropped, falling onto what's below (as a pickup does). Into acid or off the map: lost.
function fallItem(o, dt) {
  o.vy = Math.min(500, (o.vy ?? 0) + 800 * dt);
  o.vx = (o.vx ?? 0) * Math.exp(-3 * dt);
  const nx = o.x + o.vx * dt;
  if (!level.solidAt(nx, o.y - 3)) o.x = nx;
  const ny = o.y + o.vy * dt;
  let top = null;
  if (o.vy > 0) for (let cy = Math.floor(o.y / T); cy <= Math.floor(ny / T); cy++) {
    const v = level.get(Math.floor(o.x / T), cy);
    if ((v === SOLID || v === PLAT) && cy * T >= o.y - 0.5 && cy * T <= ny) { top = cy * T; break; }
    if (v === ACID && cy * T <= ny) { o.lost = true; break; }
  }
  if (top !== null) { o.y = top; o.vy = 0; } else o.y = ny;
  if (o.y > PH + 40) o.lost = true;
}
const touching = (f, x, y, r = 12) => f.alive && !f.isDecoy && !f.phase && !f.jump && !f.wraith && !f.shade && Math.abs(f.x - x) < r && Math.abs(f.y - y) < 20;
const say = (text, color, sub, t = 1.4) => { banner = { text, sub, t, color }; };

function updateObjectives(dt) {
  const M = mode(), O = game.obj;
  if (!O) return;
  // RANDOM GUNS: every so often, everyone's gun for another
  if (M.randomGuns && (O.shuffle -= dt) <= 0) {
    O.shuffle = GUN_SHUFFLE;
    for (const f of game.fighters) {
      if (!f.alive || f.isDecoy) continue;
      const k = pick(GUN_POOL.filter((g) => gunOK(g) && g !== f.gun?.def.key));
      if (!k) continue;
      f.give(k, WEAPONS[k].magSize * 4);
      if (f.slot !== 1) f.slot = 2;
      game.fx.sparks(f.x, f.y - 14, 10, 0, -1, '#8ff0ff');
    }
    say('GUNS SHUFFLED!', '#8ff0ff', null, 1.1);
  }
  // DOG TAGS: lying where they fell; theirs picked up scores, yours picked up denies it them
  if (M.score === 'tags') {
    for (const g of game.tags) {
      g.t += dt;
      fallItem(g, dt);
      if (g.lost || g.t > TAG_LIFE) { g.gone = true; continue; }
      if (g.t < 0.3) continue;
      const f = game.fighters.find((o) => touching(o, g.x, g.y + 4));
      if (!f) continue;
      g.gone = true;
      const theirs = f.team !== g.team;
      game.numbers.push({ text: theirs ? 'CONFIRMED' : 'DENIED', x: g.x, y: g.y - 20, t: 0, color: theirs ? TEAMS[f.team].color : '#c8d0d4', big: theirs });
      game.fx.sparks(g.x, g.y - 4, 8, 0, -1, theirs ? '#ffd25a' : '#c8d0d4');
      if (theirs) addScore(f.team, 'THE TAGS ARE IN');
    }
    game.tags = game.tags.filter((g) => !g.gone);
  }
  // CAPTURE THE FLAG
  if (O.flags) for (const fl of O.flags) {
    const home = () => Object.assign(fl, { state: 'home', carrier: null, x: fl.hx, y: fl.hy, vx: 0, vy: 0 });
    if (fl.state === 'carried') {
      const c = fl.carrier;
      if (!c?.alive) { Object.assign(fl, { state: 'dropped', carrier: null, vy: 0, back: FLAG_BACK }); continue; }
      fl.x = c.x;
      fl.y = c.y;
      // home with it - theirs has to be at home too
      const mine = O.flags.find((q) => q.team === c.team);
      if (mine.state === 'home' && Math.abs(c.x - mine.hx) < 18 && Math.abs(c.y - mine.hy) < 22) {
        home();
        game.fx.sparks(mine.hx, mine.hy - 16, 24, 0, -1, TEAMS[c.team].color);
        game.lights.flash(mine.hx, mine.hy - 16, 160, '255, 220, 120', 0.3);
        say(`${TEAMS[c.team].name} CAPTURES!`, TEAMS[c.team].color, `${c.name === 'YOU' ? 'YOU' : c.name} BROUGHT IT HOME`);
        addScore(c.team, 'FLAGS CAPTURED');
      }
      continue;
    }
    if (fl.state === 'dropped') {
      fallItem(fl, dt);
      if (fl.lost || (fl.back -= dt) <= 0) { home(); say(`${TEAMS[fl.team].name} FLAG RETURNED`, TEAMS[fl.team].color, null, 1.1); continue; }
    }
    for (const f of game.fighters) {
      if (!touching(f, fl.x, fl.y)) continue;
      if (f.team !== fl.team) {
        if (O.flags.some((q) => q.carrier === f)) continue;
        Object.assign(fl, { state: 'carried', carrier: f });
        say(`${TEAMS[f.team].name} HAS THE ${TEAMS[fl.team].name} FLAG`, TEAMS[f.team].color, null, 1.1);
        break;
      } else if (fl.state === 'dropped') {
        home();
        say(`${TEAMS[fl.team].name} FLAG RETURNED`, TEAMS[fl.team].color, null, 1.1);
        break;
      }
    }
  }
}

// ---------- the shop (BUY & FIGHT) ----------
// What can be had, and for how much: the guns that turn up and a few pistols - by the sort of gun - and grenades, ammo.
const SHOP_GUNS = () => [...new Set(['m9', 'glock', 'usp', 'p99', 'deagle', 'revolver', ...GUN_POOL])].filter((k) => WEAPONS[k] && gunOK(k)).map((k) => WEAPONS[k]);
const CLASS_PRICE = { pistol: 400, smg: 1250, shotgun: 1500, rifle: 2700, sniper: 3800, lmg: 4200 };
const priceOf = (d) => (d.key === 'm9' ? 200 : (CLASS_PRICE[d.cls] ?? 1000) + (d.cls === 'pistol' && d.damage > 60 ? 300 : 0) + (d.cls === 'sniper' && d.damage > 180 ? 900 : 0));
const shopTabs = () => [
  ...WEAPON_CLASSES.map((c) => ({ label: c.label, items: SHOP_GUNS().filter((d) => d.cls === c.cls).map((d) => ({ ...gunItem(d), price: priceOf(d) })) })).filter((t) => t.items.length),
  { label: 'GEAR', items: [
    { kind: 'nades', key: 'frag', name: 'FRAG GRENADE', img: NADES, price: 300, desc: 'ONE MORE - YOU CAN CARRY 3' },
    { kind: 'nades', key: 'impact', name: 'IMPACT GRENADE', img: IMPACT_PAIR, price: 400, desc: 'ONE MORE - YOU CAN CARRY 3' },
    { kind: 'ammo', name: 'AMMO', img: AMMO, price: 200, desc: 'THE MAG FULL, AND FOUR MORE' },
  ] },
];
const canBuy = (f) => mode().economy && state === 'intro' && !!f?.alive;
// (online, a player's buy comes to the host as a message: see online.js)
function applyBuy(f, kind, key) {
  const it = shopTabs().flatMap((t) => t.items).find((q) => q.kind === kind && (q.key ?? null) === (key ?? null));
  if (!it || !canBuy(f) || (f.money ?? 0) < it.price) return false;
  if (kind === 'gun') { if (f.gun?.def.key === key) return false; f.give(key, WEAPONS[key].magSize * 4); f.slot = 2; }
  else if (kind === 'nades') { if (f.nade === key && f.grenades >= 3) return false; if (f.nade !== key) { f.nade = key; f.grenades = 1; } else f.grenades++; }
  else if (kind === 'ammo') { const w = f.gun; if (!w || w.def.skillGun) return false; w.ammo = w.def.magSize; w.ammoSource.give(w.def.caliber, Math.max(0, w.def.magSize * 4 - w.reserve)); }
  else return false;
  f.money -= it.price;
  return true;
}
function buyItem(it) {
  if (!canBuy(player) || (player.money ?? 0) < (it.price ?? 0)) return false;
  if (online.isClient) { online.sendBuy(it.kind, it.key ?? null); return true; }
  return applyBuy(player, it.kind, it.key ?? null);
}
// A bot's shopping: the best gun it can afford over what it's got (saving up, now and then, when it's short), a grenade.
function botBuy(f) {
  const have = f.gun ? gunTier(f.gun.def) : 0, money = f.money ?? 0;
  const want = SHOP_GUNS().filter((d) => priceOf(d) <= money && gunTier(d) > have + 0.3).sort((a, b) => priceOf(b) - priceOf(a))[0];
  if (want && (money >= 2500 || Math.random() < 0.55)) applyBuy(f, 'gun', want.key);
  if ((f.money ?? 0) >= 700 && f.grenades < 2 && Math.random() < 0.5) applyBuy(f, 'nades', f.nade ?? 'frag');
}

// ---------- what a bot should be doing for the mode ----------
// { x, y: where; r: near enough; urgent: before anything but its life; hunt: someone to go after }
function objectiveFor(f) {
  const M = mode(), O = game.obj;
  if (!O || state !== 'fight' || !f.alive || f.isDecoy) return null;
  // (its part on its side, among the bots: the players do as they like)
  const mates = game.fighters.filter((o) => o.team === f.team && !o.isDecoy && o.bot), role = Math.max(0, mates.indexOf(f));
  if (M.score === 'tags') {
    let best = null, bd = 380;
    for (const g of game.tags) { const d = Math.hypot(g.x - f.x, g.y - f.y); if (d < bd) { bd = d; best = g; } }
    return best ? { x: best.x, y: best.y, r: 6, urgent: bd < 160 } : null;
  }
  if (O.flags) {
    const mine = O.flags[f.team], theirs = O.flags[1 - f.team];
    if (theirs.carrier === f) return { x: mine.hx, y: mine.hy, r: 6, urgent: true };
    if (mine.state === 'dropped') return { x: mine.x, y: mine.y, r: 6, urgent: true };
    if (mine.state === 'carried') return { x: mine.carrier.x, y: mine.carrier.y, r: 24, urgent: true, hunt: mine.carrier };
    if (theirs.state === 'carried') return { x: theirs.carrier.x, y: theirs.carrier.y, r: 48 };
    if (role % 2 === 0 || mates.length < 2) return { x: theirs.x, y: theirs.y, r: 6, urgent: true };
    return { x: mine.hx + (f.team === 0 ? 1 : -1) * 40, y: mine.hy, r: 48 };
  }
  return null;
}

// ---------- the modes' things, drawn ----------
// In the world, before the fighters: the flag stands and flags, the tags.
function drawObjectives(ctx) {
  const M = mode(), O = game.obj, t = game.time;
  if (!O) return;
  for (const fl of O.flags ?? []) {
    const col = TEAMS[fl.team].color;
    drawFlagBase(ctx, fl.hx, fl.hy, col, t, fl.state === 'home');
    if (fl.state === 'carried' && fl.carrier) { const c = fl.carrier; if (!c.hidden || c.seesThrough) drawFlag(ctx, c.x - c.facing * 4, c.y - 6, col, t, -c.facing, 20); }
    else drawFlag(ctx, fl.x, fl.y - (fl.state === 'home' ? 5 : 0), col, t, fl.team === 0 ? 1 : -1, fl.state === 'home' ? 24 : 16);
  }
  for (const g of game.tags ?? []) drawTag(ctx, g.x, g.y - 2, TEAMS[g.team]?.color ?? '#c8d0d4', t, g.seed ?? 0);
}
// After the lighting: the flags' glow.
function drawObjectivesLit(ctx) {
  const O = game.obj;
  for (const fl of O?.flags ?? []) { const c = fl.state === 'carried' ? fl.carrier : null; drawFlagGlow(ctx, c ? c.x : fl.x, c ? c.y : fl.y, fl.team === 0 ? '110, 200, 255' : '255, 110, 100', c ? 0.6 : 1); }
}
// On the HUD, under the round's line: the points, the flags, the money.
function drawModeHud(u, W, H, ty) {
  const M = mode(), O = game.obj;
  if (O && M.score) {
    const goal = goalRule();
    if (teamMode()) {
      const parts = [[`BLUE ${O.score[0]}`, TEAMS[0].color], ['  -  ', '#9aa49c'], [`${O.score[1]} RED`, TEAMS[1].color], [`   TO ${goal}`, '#9aa49c']];
      let x = W / 2 - kit.width(parts.map((p) => p[0]).join('')) / 2;
      for (const [txt, c] of parts) x += kit.text(txt, x, ty, { color: c });
    } else {
      const top = game.fighters.filter((f) => !f.isDecoy).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
      kit.text(`${top ? `${top.name} ${top.score ?? 0}` : ''}   -   YOU ${player.score ?? 0}   TO ${goal}`, W / 2, ty, { color: '#e8e2d0', align: 'center' });
    }
    ty += 11 * u;
    if (O.flags) {
      const said = (fl) => (fl.state === 'home' ? 'HOME' : fl.state === 'dropped' ? `DROPPED ${Math.ceil(fl.back)}` : fl.carrier === player ? 'YOU HAVE IT!' : `TAKEN BY ${fl.carrier?.name ?? '?'}`);
      kit.text(`BLUE FLAG: ${said(O.flags[0])}     RED FLAG: ${said(O.flags[1])}`, W / 2, ty, { small: true, color: '#c8d0c4', align: 'center' });
      ty += 9 * u;
    }
    if (M.randomGuns) { kit.text(`GUNS SHUFFLE IN ${Math.ceil(O.shuffle)}`, W / 2, ty, { small: true, color: '#8ff0ff', align: 'center' }); ty += 9 * u; }
  }
  if (M.economy && player) {
    drawText(kit.ctx, `$ ${player.money ?? 0}`, Math.round(8 * u), Math.round(H - 18 * u), u * 2, '#8aff9a', '#08080c');
    if (canBuy(player) && !locker) kit.text('B - SHOP', 8 * u, H - 26 * u, { small: true, color: '#ffd25a' });
  }
}

function startMatch() {
  loadMap(settings.map === 'random' ? pick(MAP_KEYS) : settings.map);
  makeFighters();
  matchSetup();
  startRound();
}
// what everyone starts a match with, whatever the mode
function matchSetup() {
  round = 0;
  for (const f of game.fighters) { f.wins = 0; f.kills = 0; f.deaths = 0; f.money = START_MONEY; f.score = 0; }
  champion = null;
}

function updateRounds(dt, realDt) {
  stateT += realDt;
  if (state === 'training') { slow = 1; return; }   // (not still in the slow-motion of a round that ended)
  if (state === 'intro' && stateT > (mode().economy ? BUY_TIME : 1.6)) {
    state = 'fight';
    banner = { text: 'FIGHT!', t: 0.8, color: '#ffd25a' };
    if (locker?.use === 'shop') locker = null;   // (the buying's over)
  }
  if (state === 'fight') {
    roundT += dt;
    const M = mode();
    if (settings.time && roundT > settings.time && !overtime) {
      overtime = true;
      if (M.score) {
        // on points: ahead when the time's up wins; level, the next point does
        const lead = scoreLead();
        if (lead) endRound(lead, 'TIME UP');
        else banner = { text: 'SUDDEN DEATH', sub: 'THE NEXT POINT WINS', t: 2, color: '#ff6a5a' };
      } else if (M.economy) endRound(aheadAlive(), 'TIME UP');
      else banner = { text: 'OVERTIME', sub: settings.lives > 1 ? 'THE LAB IS VENTING - NO MORE COMING BACK' : 'THE LAB IS VENTING - EVERYONE IS LOSING HP', t: 2, color: '#ff6a5a' };
    }
    if (overtime && !M.score && !M.economy) for (const f of game.fighters) if (f.alive) {
      f.hp -= 9 * dt;
      if (f.hp <= 0) f.die(null, 'GAS', 0, 0);
    }
    updateRespawns(dt);
    if (state === 'fight') updateObjectives(dt);
    if (state === 'fight' && !M.respawn) {
      const alive = game.fighters.filter((f) => (f.alive || f.respawnT > 0) && !f.isDecoy), sides = new Set(alive.map((f) => f.team));
      if (sides.size <= 1) endRound(alive.find((f) => f.alive) ?? alive[0] ?? null);
    }
  }
  if (state === 'end') {
    slow = stateT < 1.1 ? 0.3 : 1;
    if (stateT > 1.1 && !banner) {
      const text = !winner ? 'DRAW' : teamMode() ? `${TEAMS[winner.team].name} TEAM WINS${mode().score ? '' : ' THE ROUND'}` : `${winner.name === 'YOU' ? 'YOU WIN' : winner.name + ' WINS'}${mode().score ? '' : ' THE ROUND'}`;
      banner = { text, sub: (roundWhy ? roundWhy + '  -  ' : '') + roundScores(), t: 2.2, color: winner ? tagColor(winner) : '#e8e2d0' };
    }
    if (stateT > 3.6) {
      champion = game.fighters.find((f) => f.wins >= roundsRule()) ?? null;
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
  if (input.touchRun) run = true;   // (a phone's stick pushed right out)
  if (input.down('KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight')) runIdle = game.time;
  else if (game.time - runIdle > 0.12) run = false;
  return run;
}

function playerControl() {
  const f = player, ladder = f.ladderAt();   // (W jumps, except with a ladder at the body to climb - standing on top of one, it's a jump)
  const c = {
    move: (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0),
    up: input.down('KeyW', 'ArrowUp'),
    down: input.down('KeyS', 'ArrowDown'),
    jump: input.wasPressed('Space') || (input.wasPressed('KeyW', 'ArrowUp') && !ladder),
    jumpHeld: input.down('Space', 'KeyW', 'ArrowUp'),
    fire: input.mouse.down,
    aim: null,
    reload: input.wasPressed('KeyR'),
    sprint: running(),
    roll: input.wasPressed('ShiftLeft', 'ShiftRight'),
    target: null,
    melee: input.wasPressed('Mouse2'),
    meleeHeld: rightHeld || input.down('Mouse2'),   // held: keep punching (Mouse2 down: a phone's button)
    grenade: input.wasPressed('KeyF'),           // F: a grenade, there and then, whatever's in hand
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
  // the buff cards fanned out: they're held still on the screen where the mouse was, and the mouse leans from there
  if (f.card?.pick && input.mouse.active) {
    cardPin ??= { x: input.mouse.x, y: input.mouse.y };
    const k = renderer.dpr / renderer.scale, dx = (input.mouse.x - cardPin.x) * k, dy = (input.mouse.y - cardPin.y) * k, d = Math.hypot(dx, dy);
    c.cardHover = d > CARD_LEAN ? cardToward(dx, dy) : null;
    c.cardPick = d >= CARD_PICK ? c.cardHover : null;
  } else if (!f.card?.fly) cardPin = null;
  return c;
}
let cardPin = null;   // (css px)
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
const ARROW_RING = 0.45;   // how long the rings where they burst and hit last
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
  feathers(o.x, o.y, 12);
  game.lights.flash(o.x, o.y, 90, '120, 255, 140', 0.2);
  const targets = o.targets.length ? o.targets : null, n = targets ? targets.length : 4, f = o.owner;
  for (let i = 0; i < n; i++) {
    // each one sets off roughly at its own, fanned a little, then turns after it
    const spread = n > 1 ? (i / (n - 1) - 0.5) * 1.2 : 0;
    // none locked: they come down round it instead, two either side, and go off where they land
    const point = targets ? null : { x: f.x + (i < 2 ? -1 : 1) * (i % 2 ? 110 : 50) + rand(-8, 8), y: f.y - 2 };
    const goal = targets ? { x: targets[i].x, y: targets[i].y - 14 } : point, a = Math.atan2(goal.y - o.y, goal.x - o.x) + spread;
    game.arrows.push({ kind: 'seek', owner: f, target: targets?.[i] ?? null, point, x: o.x, y: o.y, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240, t: 0, trail: [] });
  }
}
// Feathers of light drifting down where it bursts.
function feathers(x, y, n) {
  for (let i = 0; i < n; i++) game.fx.add({ x: x + rand(-6, 6), y: y + rand(-4, 4), vx: rand(-70, 70), vy: rand(-60, 0), life: rand(0.7, 1.3), color: pick(['#7aff8a', '#c8ffc8', '#2ad05a']), size: 2, grav: 50, drag: 2.2, glow: true, kind: 'spark' });
}
// One that had nobody to go for, come down: a little burst where it lands.
const ARROW_BURST = 30;
function arrowBurst(o) {
  o.dead = true;
  game.arrows.push({ kind: 'ring', x: o.x, y: o.y, t: 0, small: true });
  game.fx.sparks(o.x, o.y, 12, 0, -1, '#9cff9c');
  feathers(o.x, o.y - 2, 6);
  game.lights.flash(o.x, o.y, 60, '120, 255, 140', 0.12);
  for (const v of game.fighters) {
    if (!v.alive || v.vanish || !game.foes(o.owner, v)) continue;
    const dx = v.x - o.x, d = Math.hypot(dx, v.y - 12 - o.y);
    if (d > ARROW_BURST) continue;
    v.hitHow = 'ARROW';
    v.hurt(ARROW_DMG * 0.7, o.owner, (Math.sign(dx) || 1) * 150, -120);
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
  feathers(o.x, o.y, 5);
  game.arrows.push({ kind: 'ring', x: o.x, y: o.y, t: 0, small: true });
}
function updateArrows(dt) {
  for (const o of game.arrows) {
    o.t += dt;
    if (o.kind === 'ring') { if (o.t > ARROW_RING) o.dead = true; continue; }
    o.trail.unshift({ x: o.x, y: o.y });
    o.trail.length = Math.min(o.trail.length, 14);
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
      if (o.point && !o.target && (o.y >= o.point.y || level.solidAt(o.x, o.y))) { arrowBurst(o); break; }
      if (level.solidAt(o.x, o.y)) { o.dead = true; game.fx.sparks(o.x, o.y, 6, -o.vx / sp, -o.vy / sp, '#9cff9c'); break; }
      const v = game.fighters.find((q) => q !== o.owner && q.alive && !q.vanish && game.foes(o.owner, q) && q.hitPart(o.x, o.y));
      if (v) arrowHit(o, v);
    }
    if (o.t > 2.5 || o.y > PH + 40) o.dead = true;
  }
  game.arrows = game.arrows.filter((o) => !o.dead);
}
// After the lighting: the arrows of light, and the rings where they burst and hit (see archery.js).
function drawArrows(ctx) {
  for (const o of game.arrows) {
    if (o.kind === 'ring') drawArrowRing(ctx, o, Math.min(1, o.t / ARROW_RING));
    else drawArrow(ctx, o, game.time);
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
// After the lighting: the hole, then the blast - and the flying swords' circle and the swords hanging there -
// behind the fighters and everything else in the world - drawn on a layer of their own with every
// fighter, crate, drum, gun lying about, grenade and thrown weapon cut out of
// it, so they show in front of it (the glow round each goes straight on the
// scene). The magic circles - being cast, and fading as the hole opens - go
// on top of it all, as before.
let galaxyLayer = null;
function drawGalaxies(ctx) {
  const casting = game.fighters.filter((f) => f.alive && f.gal), calling = game.fighters.filter((f) => f.alive && f.summon);
  if (!game.galaxies.length && !casting.length && !calling.length && !game.swordSets.length) return;
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
  for (const f of calling) drawSwordCircle(g, ctx, f.x, f.y - 17, f.summon.t / SKILL_TIME.demon, game.time);
  drawSwordsHanging(g, ctx);
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

// ---------- flying swords ----------
// Called up by the skill: swords of light (as many as it had the stamina for) come out of the circle behind their summoner and hang there in a
// fan, not going round. With a foe in reach and in sight they all turn to point at them; then, one at a time, one
// draws back and flies straight in to stab them - steering after them a little, stopped by a wall, one blow each.
// The skill's wait starts when the last has gone, or they burn out unused. The look of it: swords.js.
const SWORD_LIFE = 12, SWORD_COUNT = 5;   // how long they last unused, how many
const SWORD_RANGE = 230, SWORD_EVERY = 0.35, SWORD_HIT = 32, SWORD_AIM = 0.16;   // how far they strike, one this often, how hard, the drawing back
const SWORD_SPEED = 580, SWORD_REACH = 320, SWORD_TURN = 6, SWORD_COME = 0.75;   // one in flight, how far it goes at most, how sharply it steers; when they're all out
const STAB_LIFE = 0.45;   // how long the burst where one lands shows
// where they hang, from the summoner's feet, and which way from straight up they point
const SWORD_REST = [{ x: 0, y: -46, a: 0 }, { x: -16, y: -38, a: -0.14 }, { x: 16, y: -38, a: 0.14 }, { x: -21, y: -17, a: -0.42 }, { x: 21, y: -17, a: 0.42 }];
// (fewer than five: which of the places they take, so that the fan stays even)
const SWORD_PLACES = { 1: [0], 2: [1, 2], 3: [0, 1, 2], 4: [1, 2, 3, 4], 5: [0, 1, 2, 3, 4] };
function summonSwords(f, seed, n = SWORD_COUNT) {
  const swords = SWORD_PLACES[n].map((i) => [SWORD_REST[i], i]).map(([r, i]) => ({ i, state: 'rest', ang: -Math.PI / 2 + r.a, _a: -Math.PI / 2 + r.a, x: f.x, y: f.y, vx: 0, vy: 0, dist: 0, aimT: 0, target: null }));
  game.swordSets.push({ owner: f, x: f.x, y: f.y - 17, t: 0, life: SWORD_LIFE, seed, cd: SWORD_COME, lock: null, total: n, swords });
  game.fx.sparks(f.x, f.y - 17, 26, 0, -1, '#8fe0ff');
  game.fx.motes(f.x, f.y - 17, 16, ['#ffffff', '#8fe0ff', '#43a6ff']);
  game.lights.flash(f.x, f.y - 17, 130, '120, 200, 255', 0.3);
}
// where a sword hangs: from its summoner as they stand, bobbing a little
function swordRest(d, s) {
  const o = d.owner, r = SWORD_REST[s.i];
  return { x: (o?.x ?? d.x) + r.x, y: (o?.y ?? d.y + 17) + r.y + Math.sin(game.time * 2.2 + s.i * 1.3) * 1.2, a: -Math.PI / 2 + r.a };
}
// ... and drawing back to go
function swordDrawn(d, s) {
  const p = swordRest(d, s), k = s.state === 'aim' ? Math.min(1, s.aimT / SWORD_AIM) : 0;
  return { x: p.x - Math.cos(s.ang) * 5 * k, y: p.y - Math.sin(s.ang) * 5 * k };
}
const turnTo = (a, to, by) => a + Math.max(-by, Math.min(by, Math.atan2(Math.sin(to - a), Math.cos(to - a))));
function swordGone(s) {
  s.state = 'done';
  game.fx.motes(s.x, s.y, 8, ['#ffffff', '#8fe0ff', '#43a6ff']);
}
function updateSwords(dt) {
  for (const d of game.swordSets) {
    const o = d.owner;
    d.t += dt;
    d.x = o.x;
    d.y = o.y - 17;
    d.life -= dt;
    const over = d.life <= 0 || !o.alive;
    // the nearest foe that can be seen within reach
    let tgt = null, best = SWORD_RANGE;
    if (!over) for (const v of game.fighters) {
      if (!v.alive || v.vanish || !game.foes(o, v) || (v.hidden && !v.glimpsed)) continue;
      const dd = Math.hypot(v.x - d.x, v.y - 14 - d.y);
      if (dd < best && game.los(d.x, d.y, v.x, v.y - 14)) { best = dd; tgt = v; }
    }
    // (someone new in sight: a moment to see them all turn on them)
    if (tgt && tgt !== d.lock) d.cd = Math.max(d.cd, 0.22);
    d.lock = tgt;
    d.cd -= dt;
    if (tgt && d.cd <= 0) {
      const s = d.swords.filter((q) => q.state === 'rest').sort((a, b) => Math.hypot(swordRest(d, a).x - tgt.x, swordRest(d, a).y - tgt.y) - Math.hypot(swordRest(d, b).x - tgt.x, swordRest(d, b).y - tgt.y))[0];
      if (s) {
        s.state = 'aim';
        s.aimT = 0;
        s.target = tgt;
        d.cd = SWORD_EVERY;
      }
    }
    for (const s of d.swords) {
      if (s.state === 'rest' || s.state === 'aim') {
        const p = swordRest(d, s), v = s.state === 'aim' ? s.target : tgt;
        if (over) { s.x = p.x; s.y = p.y; swordGone(s); continue; }
        if (s.state === 'aim' && !v?.alive) { s.state = 'rest'; continue; }
        const want = v ? Math.atan2(v.y - 14 - p.y, v.x - p.x) : p.a;
        s._a = turnTo(s._a ?? s.ang, want, 14 * dt);
        s.ang = Math.round(s._a / 0.05) * 0.05;   // (online: a few words, not a stream)
        if (s.state === 'aim' && (s.aimT += dt) >= SWORD_AIM) {
          const from = swordDrawn(d, s);
          s.state = 'out';
          s.x = from.x;
          s.y = from.y;
          s._a = want;
          s.ang = want;
          s.dist = 0;
          game.fx.sparks(s.x, s.y, 6, Math.cos(want), Math.sin(want), '#d6f6ff');
        }
        continue;
      }
      // in flight, a few short steps at a time: steering after them, into whoever's in the way, stopped by a wall
      const v = s.target, n = 3;
      if (v?.alive && !v.vanish) s._a = turnTo(s._a ?? s.ang, Math.atan2(v.y - 14 - s.y, v.x - s.x), SWORD_TURN * dt);
      s.ang = s._a ?? s.ang;
      const ux = Math.cos(s.ang), uy = Math.sin(s.ang);
      s.vx = ux * SWORD_SPEED;
      s.vy = uy * SWORD_SPEED;
      for (let i = 0; i < n && s.state === 'out'; i++) {
        s.x += (s.vx * dt) / n;
        s.y += (s.vy * dt) / n;
        s.dist += (SWORD_SPEED * dt) / n;
        const tipX = s.x + ux * 12, tipY = s.y + uy * 12;
        if (level.solidAt(tipX, tipY)) {
          game.punches.push({ x: tipX, y: tipY, ax: ux, ay: uy, t: 0, seed: Math.random() * 100 });
          game.fx.sparks(tipX, tipY, 8, -ux, -uy, '#8fe0ff');
          s.state = 'done';
          break;
        }
        const h = game.fighters.find((q) => q.alive && !q.vanish && (!q.hidden || q.glimpsed) && game.foes(o, q) && (q.hitPart(tipX, tipY) || Math.hypot(q.x - tipX, q.y - 14 - tipY) < 9));
        if (h) {
          h.hitHow = 'FLYING SWORDS';
          h.hurt(SWORD_HIT, o, ux * 260, -110 + uy * 60);
          game.punches.push({ x: tipX, y: tipY, ax: ux, ay: uy, t: 0, seed: Math.random() * 100 });
          game.fx.sparks(tipX, tipY, 10, ux, uy, '#d6f6ff');
          game.lights.flash(tipX, tipY, 70, '120, 200, 255', 0.15);
          if (Math.hypot(player.x - tipX, player.y - tipY) < 180) renderer.kick(ux * 5, uy * 4);
          s.state = 'done';
        }
      }
      if (s.state === 'out' && s.dist > SWORD_REACH) swordGone(s);
    }
    d.swords = d.swords.filter((q) => q.state !== 'done');
    // the last of them gone: now the wait starts
    if (!d.swords.length) {
      d.over = true;
      o.swordsOut = false;
      if (o.alive) o.skillCD = SKILL_CD.demon;
    }
  }
  game.swordSets = game.swordSets.filter((d) => !d.over);
  for (const p of game.punches) p.t += dt;
  game.punches = game.punches.filter((p) => p.t < STAB_LIFE);
}
// On the layer behind the fighters: the circle fading as they come out, and the swords hanging there - coming out
// of the heart of it one after the other, and drawing back to go.
function drawSwordsHanging(g, gl) {
  for (const d of game.swordSets) {
    const o = d.owner;
    if (!o) continue;
    if (d.t < 0.6) drawSwordCircle(g, gl, o.x, o.y - 17, 1, game.time, 1 - d.t / 0.6);
    for (const s of d.swords) {
      if (s.state !== 'rest' && s.state !== 'aim') continue;
      const p = swordDrawn(d, s), k = Math.max(0, Math.min(1, (d.t - s.i * 0.08) / 0.32)), e = 1 - Math.pow(1 - k, 3);
      const x = o.x + (p.x - o.x) * e, y = o.y - 17 + (p.y - (o.y - 17)) * e;
      drawSword(g, gl, x, y, s.ang, game.time, d.seed + s.i, k < 1 ? { scale: 0.45 + 0.55 * e, alpha: Math.min(1, k * 2), hot: 1 - k } : { hot: s.state === 'aim' ? 0.8 : 0 });
    }
  }
}
// ---------- the vampire's bats ----------
// A swarm bursting out every way from the caster. Each flies on with a flutter, going for the nearest foe it can smell;
// it bites once and it's done, and the blood it drew goes back to the caster, twice over as health. Walls turn them.
const BAT_COUNT = 16, BAT_SPEED = 215, BAT_LIFE = 1.15, BAT_BITE = 10, BAT_SMELL = 130, BAT_TURN = 5, BAT_DRAIN = 2;   // (BAT_DRAIN: health back for each point of blood drawn)
function summonBats(f) {
  for (let i = 0; i < BAT_COUNT; i++) {
    const a = (i / BAT_COUNT) * Math.PI * 2 + rand(-0.12, 0.12), sp = BAT_SPEED * rand(0.85, 1.15);
    game.bats.push({ owner: f, x: f.x + Math.cos(a) * 6, y: f.y - 16 + Math.sin(a) * 6, a, sp, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: -i * 0.008, seed: Math.random() * 100 });
  }
  game.fx.sparks(f.x, f.y - 16, 18, 0, -1, '#ff4a5a');
  game.lights.flash(f.x, f.y - 16, 120, '255, 50, 70', 0.25);
}
function updateBats(dt) {
  for (const b of game.bats) {
    if ((b.t += dt) < 0) continue;
    if (b.t > BAT_LIFE) { b.done = true; game.fx.sparks(b.x, b.y, 3, 0, -1, '#8a1020'); continue; }
    let tgt = null, best = BAT_SMELL;
    for (const v of game.fighters) {
      if (!v.alive || v.vanish || !game.foes(b.owner, v) || (v.hidden && !v.glimpsed)) continue;
      const d = Math.hypot(v.x - b.x, v.y - 14 - b.y);
      if (d < best) { best = d; tgt = v; }
    }
    if (tgt) {
      const want = Math.atan2(tgt.y - 14 - b.y, tgt.x - b.x), d = Math.atan2(Math.sin(want - b.a), Math.cos(want - b.a));
      b.a += Math.max(-BAT_TURN * dt, Math.min(BAT_TURN * dt, d));
    }
    b.a += Math.sin(game.time * 11 + b.seed) * dt * 3.2;   // (the flutter)
    b.vx = Math.cos(b.a) * b.sp;
    b.vy = Math.sin(b.a) * b.sp;
    const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
    if (level.solidAt(nx, ny)) b.a += Math.PI * 0.75; else { b.x = nx; b.y = ny; }
    for (const v of game.fighters) {
      if (!v.alive || v.vanish || !game.foes(b.owner, v) || (v.hidden && !v.glimpsed)) continue;
      if (Math.hypot(v.x - b.x, v.y - 14 - b.y) > 11) continue;
      const before = v.hp;
      v.hitHow = 'BATS';
      if (v.hurt(BAT_BITE, b.owner, b.vx * 0.15, -30)) {
        const drawn = Math.max(0, before - v.hp);
        if (drawn > 0 && !v.isDecoy) game.bloods.push({ owner: b.owner, x: b.x, y: b.y, vx: -b.vx * 0.5 + rand(-60, 60), vy: -140 + rand(-50, 20), t: 0, heal: drawn * BAT_DRAIN, seed: b.seed });
        game.fx.blood(v.x, v.y - 14, 4, Math.cos(b.a), Math.sin(b.a));
      }
      b.done = true;
      break;
    }
  }
  game.bats = game.bats.filter((b) => !b.done);
  // the blood on its way home: thrown clear, then drawn in harder and harder
  for (const o of game.bloods) {
    o.t += dt;
    const f = o.owner;
    if (!f?.alive) { o.done = true; continue; }
    const dx = f.x - o.x, dy = f.y - 14 - o.y, d = Math.hypot(dx, dy) || 1, pull = 500 + o.t * 1700;
    o.vx += (dx / d) * pull * dt;
    o.vy += (dy / d) * pull * dt;
    o.vx *= Math.exp(-1.6 * dt);
    o.vy *= Math.exp(-1.6 * dt);
    o.x += o.vx * dt;
    o.y += o.vy * dt;
    if (d < 9 || o.t > 3) {
      o.done = true;
      f.hp = Math.min(f.maxHp, f.hp + o.heal);
      game.numbers.push({ text: `+${Math.round(o.heal)}`, x: f.x + rand(-6, 6), y: f.y - 34, t: 0, color: '#5aff7a', big: false });   // (health back: green)
      game.fx.sparks(f.x, f.y - 14, 3, 0, -1, '#ff5a6a');
    }
  }
  game.bloods = game.bloods.filter((o) => !o.done);
}
// (each bat's streak is kept here, on whoever's screen it is, by its seed: online the bats come in fresh every time)
const batTrails = new Map();
function drawBats(ctx) {
  for (const o of game.bloods) drawBlood(ctx, o.x, o.y, o.vx ?? 0, o.vy ?? 0, game.time);
  const live = new Set();
  for (const b of game.bats) {
    if (b.t < 0) continue;
    live.add(b.seed);
    const tr = batTrails.get(b.seed) ?? [];
    if (!tr.length || Math.hypot(tr[0].x - b.x, tr[0].y - b.y) > 1) tr.unshift({ x: b.x, y: b.y });
    tr.length = Math.min(tr.length, 14);
    batTrails.set(b.seed, tr);
    drawBatTrail(ctx, tr);
  }
  for (const k of batTrails.keys()) if (!live.has(k)) batTrails.delete(k);
  for (const b of game.bats) if (b.t >= 0) drawBat(ctx, b.x, b.y, b.a, performance.now() / 1000, b.seed);
}

// ---------- the blue shield's burst, the hack's wave ----------
// ---------- the jumper's rifts ----------
// While the jumper's in the other place, the path's laid after them; once they're out, the second rift opens there and
// the two are joined. Anyone at all who steps into one goes as light along the path, as it was walked, and out of the
// other - a moment before they'll go back in. The rifts last RIFT_LIFE; a path too short is no rift at all.
const RIFT_LIFE = 14, RIFT_SPEED = 480, RIFT_MIN = 40, RIFT_MAX = 640, RIFT_POINTS = 320, RIFT_IN = 11, RIFT_AGAIN = 1.2, RIFT_HURT = 25;   // (RIFT_HURT: what it takes out of the jumper's foes, going through)   // (RIFT_MAX: as long as a path gets - that far, and the way back opens)
const riftLen = (r) => { let d = 0; r.lens = [0]; for (let i = 1; i < r.path.length; i++) r.lens.push((d += Math.hypot(r.path[i].x - r.path[i - 1].x, r.path[i].y - r.path[i - 1].y))); return d; };
function riftAt(r, d) {
  const L = r.lens, P = r.path;
  let i = 1;
  while (i < L.length - 1 && L[i] < d) i++;
  const k = Math.max(0, Math.min(1, (d - L[i - 1]) / Math.max(0.001, L[i] - L[i - 1])));
  return { x: P[i - 1].x + (P[i].x - P[i - 1].x) * k, y: P[i - 1].y + (P[i].y - P[i - 1].y) * k };
}
function riftOut(f, r) {
  const end = f.jump.dir > 0 ? r.b : r.a, prev = f.jump.dir > 0 ? r.path[r.path.length - 2] : r.path[1];
  const out = Math.sign(end.x - (prev?.x ?? end.x)) || f.facing;
  f.x = end.x;
  f.y = end.y;
  f.vx = out * 90;
  f.vy = -80;
  f.jump = null;
  f.riftCool = RIFT_AGAIN;
  // the jumper's foes don't come through it whole: a little taken out of them
  if (r.owner && f !== r.owner && game.foes(r.owner, f)) { f.hitHow = 'RIFT'; f.hurt(RIFT_HURT, r.owner, out * 40, -40); }
  game.bursts.push({ kind: 'rift', x: end.x, y: end.y - 15, t: 0 });
  game.fx.sparks(end.x, end.y - 14, 12, out, -0.5, '#d0a8ff');
  game.lights.flash(end.x, end.y - 14, 80, '170, 90, 255', 0.15);
}
// (own: a fighter's own time - a Sandevistan going, theirs runs on while the world's all but stopped)
function updateRifts(dt, own = () => dt) {
  for (const f of game.fighters) f.riftCool = Math.max(0, (f.riftCool ?? 0) - own(f));
  for (const r of game.rifts) {
    r.t += dt;
    if (!r.open) {
      // being laid: after the jumper, as far as they go; out of the other place, the second rift
      const o = r.owner, last = r.path[r.path.length - 1];
      if (o?.alive && o.phase) {
        if (Math.hypot(o.x - last.x, o.y - last.y) > 5 && r.path.length < RIFT_POINTS) r.path.push({ x: o.x, y: o.y });
        if (riftLen(r) < RIFT_MAX) continue;
        o.phase = null;   // (as far as a path goes: out of the other place, and the way back opens here)
        o.skillCD = SKILL_CD.jumper;
      }
      if (o?.alive && Math.hypot(o.x - last.x, o.y - last.y) > 1) r.path.push({ x: o.x, y: o.y });
      if (riftLen(r) < RIFT_MIN) { r.dead = true; continue; }
      r.open = true;
      r.b = { ...r.path[r.path.length - 1] };
      r.t = 0;
      if (o) o.riftCool = RIFT_AGAIN;   // (not straight back in where they came out)
      // both ends at once: the crack bursts open, the other end tears open - ready
      for (const e of [r.a, r.b]) {
        game.bursts.push({ kind: 'rift', x: e.x, y: e.y - 15, t: 0 });
        game.lights.flash(e.x, e.y - 15, 110, '170, 90, 255', 0.25);
        game.fx.sparks(e.x, e.y - 15, 14, 0, 0, '#d0a8ff');
      }
      continue;
    }
    if ((r.life -= dt) <= 0) r.dead = true;
    // who's stepped in
    for (const f of game.fighters) {
      if (r.dead || !f.alive || f.jump || f.phase || f.riftCool > 0 || f.isDecoy) continue;
      const atA = Math.hypot(f.x - r.a.x, f.y - r.a.y) < RIFT_IN, atB = !atA && Math.hypot(f.x - r.b.x, f.y - r.b.y) < RIFT_IN;
      if (!atA && !atB) continue;
      f.jump = { ri: r.id, dir: atA ? 1 : -1, d: 0 };
      f.uncloak?.();
      game.fx.sparks(f.x, f.y - 14, 10, 0, -1, '#d0a8ff');
    }
  }
  // those going through: along the path, as it was walked (or back the other way), and out
  for (const f of game.fighters) {
    if (!f.jump) continue;
    const r = game.rifts.find((q) => q.id === f.jump.ri);
    if (!r?.open) { f.jump = null; continue; }
    const total = r.lens?.length === r.path.length ? r.lens[r.lens.length - 1] : riftLen(r);
    f.jump.d += RIFT_SPEED * own(f);
    if (f.jump.d >= total || !f.alive) { riftOut(f, r); continue; }
    const p = riftAt(r, f.jump.dir > 0 ? f.jump.d : total - f.jump.d);
    f.x = p.x;
    f.y = p.y;
  }
  // a rift gone with someone still in it: out at the far end
  for (const r of game.rifts) if (r.dead) for (const f of game.fighters) if (f.jump?.ri === r.id) riftOut(f, r);
  game.rifts = game.rifts.filter((r) => !r.dead);
}
// (the rifts and their path go behind the props and everyone: see drawWorld)
function drawRiftsUnder(ctx) {
  for (const r of game.rifts) {
    const fade = r.open ? Math.min(1, r.life / 0.5) : 1;
    drawRiftPath(ctx, r.path, game.time, fade);
    // (the first: only a crack till the other end's open - then it bursts open into a rift too, both ready)
    if (r.open) drawRiftPortal(ctx, r.a.x, r.a.y, Math.min(1, r.t / 0.3), game.time, r.seed, fade);
    else drawRiftCrack(ctx, r.a.x, r.a.y, Math.min(1, r.t / 0.25), game.time, r.seed);
    if (r.b) drawRiftPortal(ctx, r.b.x, r.b.y, Math.min(1, r.t / 0.3), game.time, r.seed + 3, fade);
  }
}
// ...and anyone going through, as light, over everything
function drawRifts(ctx) {
  for (const f of game.fighters) {
    if (!f.jump) { f._riftTrail = null; continue; }
    const tr = (f._riftTrail ??= []);
    tr.unshift({ x: f.x, y: f.y - 14 });
    tr.length = Math.min(tr.length, 16);
    drawRiftTraveller(ctx, f.x, f.y - 14, tr, game.time);
  }
}

const CHIDORI_DMG = 120;   // what chidori does, driven through someone
const STEAL_HACK = 1.5;   // how long the skill thief's hack cuts them off for
const CARD_SHARE = 110;   // how near a teammate has to be to get a share of a buff card
const CARD_SHOT = 0.15;   // the red card: shots this much harder too
const SHIELD_BLAST = 26, SHIELD_REACH = 68, BURST_LIFE = 0.7, HACK_REACH = 170;
// The shield going off. charge: what it took, of all it could (0 .. 1, a little over if the blow that broke it was
// big): nothing taken, a shove and a scratch; all of it, a real blast, twice as wide - harder and wider the more.
function barrierBurst(f, broken, charge = broken ? 1 : 0) {
  const x = f.x, y = f.y - 14, reach = SHIELD_REACH * (0.8 + 0.6 * Math.min(1.2, charge)), dmg = SHIELD_BLAST * (0.5 + 1.8 * charge);
  game.bursts.push({ kind: 'shield', x, y, t: 0, seed: Math.random() * 100, r: reach });
  game.lights.flash(x, y, 110 + 90 * charge, '120, 200, 255', 0.2 + 0.2 * Math.min(1, charge));
  const near = Math.max(0, 1 - Math.hypot(player.x - x, player.y - y) / (180 + 120 * charge));
  if (near > 0) renderer.kick(rand(-1, 1) * (3 + 7 * charge) * near, rand(-1, 1) * (3 + 6 * charge) * near);
  if (charge > 0.5) game.fx.sparks(x, y, Math.round(10 + 20 * charge), 0, 0, '#bfefff');
  for (const o of game.fighters) {
    if (o === f || !o.alive || o.vanish || !game.foes(f, o)) continue;
    const dx = o.x - x, dy = o.y - 14 - y, d = Math.hypot(dx, dy) || 1;
    if (d > reach || !game.los(x, y, o.x, o.y - 14)) continue;
    const k = 1 - d / reach, push = 1 + 0.8 * charge;
    o.blast = true;
    o.hitHow = 'BLUE SHIELD';
    o.hurt(dmg * (0.4 + 0.6 * k), f, (dx / d) * 300 * (0.4 + k) * push, (-120 - 120 * k) * push);
    o.blast = false;
  }
  for (const p of game.props) if (!p.dead && Math.hypot(p.x - x, p.y - p.h / 2 - y) < reach) game.damageProp(p, 20 + 40 * charge, f, Math.sign(p.x - x) * 120, -60);
}
function hackBurst(f) {
  const x = f.x, y = f.y - 18, links = [];
  for (const o of game.fighters) {
    if (o === f || !o.alive || o.vanish || !game.foes(f, o)) continue;
    if (Math.hypot(o.x - x, o.y - 14 - y) > HACK_REACH) continue;
    links.push({ x: o.x, y: o.y - 16 });
    if (o.isDecoy) { o.die(f, 'HACK', 0, 0); continue; }   // (a shadow clone's nothing but signal)
    // swords hanging behind them: gone
    for (const d of game.swordSets) if (d.owner === o) { for (const s of d.swords) game.fx.motes(s.state === 'out' ? s.x : o.x, s.state === 'out' ? s.y : o.y - 30, 5, ['#ffffff', '#8fe0ff', '#3aff8a']); d.swords = []; d.over = true; o.swordsOut = false; o.skillCD = SKILL_CD.demon; }
    o.hacked(HACK_LOCK);
    game.fx.sparks(o.x, o.y - 18, 8, 0, -1, '#3aff8a');
  }
  game.swordSets = game.swordSets.filter((d) => !d.over);
  game.bursts.push({ kind: 'hack', x, y, t: 0, seed: Math.random() * 100, r: HACK_REACH, links });
  game.lights.flash(x, y, 130, '60, 255, 140', 0.25);
}
// ---------- golden fangs ----------
// Thrown fanned out the way they aim, each flies straight through whoever's in its way (once each) till it's in a
// wall or out of reach (it hangs there in the air). Called back, every one comes flying home to its owner - quicker as
// it goes, through walls, through anyone in the way, as hard as it went out - and is gone once it's back in the hand.
// (The owner's side of it: Fighter.updateFang.)
const FANG_N = 5, FANG_SPREAD = 0.6, FANG_SPEED = 820, FANG_REACH = 420, FANG_HIT = 30;   // how many, how wide, how fast, how far, how hard
const FANG_HOME = 1000, FANG_PULL = 3400, FANG_BACK_HIT = FANG_HIT, FANG_RIP = 12;   // home: top speed, how fast it gets there, what it takes going through someone (and torn out of them)
function throwFangs(f) {
  const s = f.shoulder, seed = Math.random() * 100;
  for (let i = 0; i < FANG_N; i++) {
    const a = f.aim + (i - (FANG_N - 1) / 2) * (FANG_SPREAD / (FANG_N - 1)) + rand(-0.025, 0.025), sp = FANG_SPEED * rand(0.94, 1.06);
    game.fangs.push({ owner: f, x: s.x + Math.cos(a) * 6, y: s.y + Math.sin(a) * 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, a, state: 'fly', dist: 0, on: null, ox: 0, oy: 0, hits: [], seed: seed + i * 7, t: 0 });
  }
  game.bursts.push({ kind: 'fang', x: s.x, y: s.y, a: f.aim, t: 0 });
  game.lights.flash(s.x, s.y, 80, '255, 200, 90', 0.12);
  game.fx.sparks(s.x, s.y, 8, Math.cos(f.aim), Math.sin(f.aim), '#ffd25a');
}
function recallFangs(f) {
  for (const d of game.fangs) {
    if (d.owner !== f || d.state === 'back') continue;
    d.hits = [];
    const v = d.on;
    if (d.state === 'in' && v?.alive) {
      // torn out of them on the way
      const ax = Math.sign(f.x - v.x) || 1;
      v.hitHow = 'GOLDEN FANGS';
      v.hurt(FANG_RIP, f, ax * 110, -60);
      game.fx.blood(d.x, d.y, 6, ax, -0.3);
      d.hits.push(v);
    }
    d.state = 'back';
    d.on = null;
    d.sp = 120;
  }
  game.lights.flash(f.x, f.y - 14, 70, '255, 200, 90', 0.1);
}
function updateFangs(dt) {
  for (const d of game.fangs) {
    const o = d.owner;
    d.t += dt;
    if (!o?.alive || !o.fang) { d.gone = true; game.fx.motes(d.x, d.y, 4, ['#ffd25a', '#fff6c8']); continue; }
    if (d.state === 'fly') {
      const n = 3, ux = Math.cos(d.a), uy = Math.sin(d.a);
      for (let i = 0; i < n && d.state === 'fly'; i++) {
        d.x += (d.vx * dt) / n;
        d.y += (d.vy * dt) / n;
        d.dist += (FANG_SPEED * dt) / n;
        const tx = d.x + ux * 7, ty = d.y + uy * 7;
        if (level.solidAt(tx, ty)) {
          d.state = 'wall';
          game.fx.sparks(tx, ty, 5, -ux, -uy, '#ffd25a');
          break;
        }
        const h = game.fighters.find((q) => q.alive && !q.vanish && !d.hits.includes(q) && (!q.hidden || q.glimpsed) && game.foes(o, q) && (q.hitPart(tx, ty) || Math.hypot(q.x - tx, q.y - 14 - ty) < 8));
        if (h) {
          h.hitHow = 'GOLDEN FANGS';
          h.hurt(FANG_HIT, o, ux * 140, -60, h.hitPart(tx, ty) === 'head');
          d.hits.push(h);
          game.fx.blood(tx, ty, 5, ux, uy);
          game.fx.sparks(tx, ty, 6, ux, uy, '#ffd25a');
        }
      }
      if (d.state === 'fly' && d.dist > FANG_REACH) d.state = 'hang';
      if (d.state !== 'fly') { d.vx = 0; d.vy = 0; }
    } else if (d.state === 'in') {
      const v = d.on;
      if (!v?.alive || v.vanish) { d.state = 'hang'; d.on = null; }
      else { d.x = v.x + d.ox; d.y = v.y + d.oy; }
    } else if (d.state === 'back') {
      const s = o.shoulder, dx = s.x - d.x, dy = s.y - d.y, dist = Math.hypot(dx, dy) || 1, ux = dx / dist, uy = dy / dist;
      d.sp = Math.min(FANG_HOME, (d.sp ?? 120) + FANG_PULL * dt);
      d.a = Math.atan2(uy, ux);   // (point first, home)
      const step = Math.min(dist, d.sp * dt);
      d.x += ux * step;
      d.y += uy * step;
      d.vx = ux * d.sp;
      d.vy = uy * d.sp;
      for (const q of game.fighters) {
        if (!q.alive || q.vanish || d.hits.includes(q) || (q.hidden && !q.glimpsed) || !game.foes(o, q) || Math.hypot(q.x - d.x, q.y - 14 - d.y) > 10) continue;
        d.hits.push(q);
        q.hitHow = 'GOLDEN FANGS';
        q.hurt(FANG_BACK_HIT, o, ux * 120, -50);
        game.fx.blood(d.x, d.y, 4, ux, uy);
        game.fx.sparks(d.x, d.y, 5, ux, uy, '#ffd25a');
      }
      if (dist < 9) { d.gone = true; game.fx.sparks(s.x, s.y, 4, 0, -1, '#fff6c8'); }
    }
  }
  game.fangs = game.fangs.filter((d) => !d.gone);
  // all back in the hand: now the wait starts
  for (const f of game.fighters) if (f.fang?.back && !game.fangs.some((d) => d.owner === f)) { f.fang = null; if (f.alive) f.skillCD = SKILL_CD.fang; }
}
function drawFangs(ctx) {
  for (const d of game.fangs) {
    const tr = (d._pts ??= []), moving = d.state === 'fly' || d.state === 'back';
    if (moving) { tr.unshift({ x: d.x, y: d.y }); tr.length = Math.min(tr.length, d.state === 'back' ? 7 : 5); } else if (tr.length) tr.pop();
    drawFangTrail(ctx, tr, d.state === 'back', d.seed);
    const bob = d.state === 'hang' ? Math.sin(game.time * 3 + d.seed) * 1.5 : 0;
    drawFang(ctx, d.x, d.y + bob, d.a);
    drawFangGlow(ctx, d.x, d.y + bob, d.a, game.time, d.seed, d.state === 'back');
  }
}

// ---------- aurum ----------
// Q: whatever gun's in the hands is put by, and the gold sniper's built there (it can't fire till it's done); its five
// shots gone, Q again, the time up - or knocked out of the hands, swapped, thrown - and it comes apart, the gun that was
// put by back. (The owner's side of it: Fighter.updateAurum.)
function aurumOn(f) {
  if (!f.gun?.def.skillGun) f._prevGun = f.gun;
  if (f.gun?.reloading) f.gun.cancelReload();
  const w = f.give('aurum', 0);
  if (!w) return;
  w.drawT = 0.2;   // (up in the hands at once: it's the building that takes the time - see Fighter.updateCombat)
  f.slot = 2;
  f.quick = null;
  const s = f.shoulder;
  game.lights.flash(s.x, s.y, 90, '170, 110, 255', 0.15);
  game.fx.motes(s.x + Math.cos(f.aim) * 14, s.y + Math.sin(f.aim) * 14, 10, ['#7a3aff', '#b88aff', '#ffd85a']);
}
function aurumOff(f) {
  const w = f.gun;
  if (w?.def.skillGun) {
    const s = f.shoulder;
    game.fx.motes(s.x + Math.cos(f.aim) * 14, s.y + Math.sin(f.aim) * 14, 14, ['#ffd85a', '#b88aff', '#7a3aff', '#fff6c8']);
    game.lights.flash(s.x, s.y, 70, '170, 110, 255', 0.12);
    f.gun = f._prevGun ?? null;
    if (f.gun) { f.gun.drawT = 0.25; if (f.slot === 2) f.tilt = -1.1; } else if (f.slot === 2) f.slot = 1;
  }
  f._prevGun = null;
  if (f.aurum) { f.aurum = null; f.skillCD = SKILL_CD.aurum; }
}
function updateAurums() {
  for (const f of game.fighters) {
    const m = f.aurum;
    if (!m) continue;
    const g = f.gun;
    if (!g?.def.skillGun) { f.aurum = null; f._prevGun = null; f.skillCD = SKILL_CD.aurum; continue; }   // (swapped for something off the floor)
    if (m.quit || m.t >= SKILL_TIME.aurum || (g.ammo <= 0 && g.cooldown <= 0)) aurumOff(f);
  }
}

// ---------- shadow kill ----------
// A shadow's cut going through v (or the last one, the fighter's own, behind them). (The rest: Fighter.updateReap.)
function reapCut(f, v, dmg, ux, uy, last) {
  if (!v?.alive) return;
  v.hitHow = 'SHADOW KILL';
  v.hurt(dmg, f, ux * (last ? 260 : 30), last ? -150 : -20);
  game.fx.blood(v.x, v.y - 14, last ? 12 : 4, ux, -0.3);
  game.fx.sparks(v.x, v.y - 14, last ? 14 : 5, ux, uy, '#b06aff');
  game.lights.flash(v.x, v.y - 14, last ? 140 : 60, '150, 60, 255', last ? 0.3 : 0.1);
  if (Math.hypot(player.x - v.x, player.y - v.y) < 200) renderer.kick(ux * (last ? 7 : 2), last ? -4 : uy * 2);
}

function updateBursts(dt) {
  for (const b of game.bursts) b.t += dt;
  game.bursts = game.bursts.filter((b) => b.t < BURST_LIFE);
}
function drawBursts(ctx) {
  for (const b of game.bursts) {
    const k = b.t / BURST_LIFE;
    if (b.kind === 'shield') drawShieldBurst(ctx, b.x, b.y, k, game.time, b.seed, b.r);
    else if (b.kind === 'cut') drawDeflectCut(ctx, b.x0, b.y0, b.x, b.y, k, b.seed);
    else if (b.kind === 'chidori') drawChidoriHit(ctx, b.x, b.y, b.a, k, b.seed);
    else if (b.kind === 'rift') drawRiftBurst(ctx, b.x, b.y, k);
    else if (b.kind === 'fang') drawFangFlash(ctx, b.x, b.y, b.a, b.t / 0.25);
    else if (b.kind === 'stab') drawStabBurst(ctx, b.x, b.y, b.a, k, b.back, b.seed);
    else if (b.kind === 'steal') drawStealBurst(ctx, b.x, b.y, b.owner?.alive ? b.owner.x : b.x0, b.owner?.alive ? b.owner.y - 17 : b.y0, k, b.seed);
    else drawHackWave(ctx, b.x, b.y, k, game.time, b.seed, b.r, b.links);
  }
}

// ---------- Sandevistan ----------
// While anyone has it going the world is all but stopped (see tick): drained of colour, the ones with it in full colour
// over the top of that, their after-images strung out behind them.
const sandeUsers = () => game.fighters.filter((f) => f.alive && f.sande);
function drawSande(ctx) {
  const users = sandeUsers();
  const trails = game.fighters.filter((f) => f._sandeTrail?.items.length);
  if (!users.length && !trails.length) { sandeOut = Math.max(0, sandeOut - 1 / 60 / 0.2); if (!sandeOut) return; }
  if (users.length) sandeOut = 1;
  const lead = users.reduce((a, f) => (!a || f.sande.age < a.sande.age ? f : a), null);
  const age = lead?.sande.age ?? 9, rampIn = Math.min(1, age / 0.14), rampOut = lead ? Math.min(1, lead.sande.t / 0.18) : 0;
  const k = users.length ? rampIn * Math.max(rampOut, users.length > 1 ? 1 : rampOut) : sandeOut;
  const v = ctx.getTransform(), sx = lead ? v.a * lead.x + v.e : 0, sy = lead ? v.d * (lead.y - 14) + v.f : 0;
  drawSandeScreen(ctx, ctx.canvas, k, age, performance.now() / 1000, sx, sy);
  if (!users.length) sandeOut = Math.max(0, sandeOut - 1 / 60 / 0.2);
  for (const f of game.fighters) if (f._sandeTrail?.items.length || f.sande) { if (f.alive && (!f.hidden || f === player)) f.drawSandeTrail(ctx); }
  for (const f of users) if (!f.hidden || f === player) f.draw(ctx);
}
let sandeOut = 0;
// You, cloaked with the stab still to use: the foe nearest you, which way they're facing and where their back is, and
// the reach of your stab round them, clearer the closer you get (see cloakfx.js). Only you see it.
function drawCloakSense(ctx) {
  const f = player, k = f?.cloak;
  if (!f?.alive || !k || k.out || k.used || online.watching) return;
  let v = null, d = 230;
  for (const o of game.fighters) {
    if (o === f || !o.alive || o.vanish || !game.foes(f, o) || (o.hidden && !o.glimpsed)) continue;
    const od = Math.hypot(o.x - f.x, o.y - f.y);
    if (od < d) { d = od; v = o; }
  }
  if (v) drawStabRing(ctx, v.x, v.y - 14, v.facing || 1, d, LUNGE_RANGE, (f.x - v.x) * (v.facing || 1) < 0, game.los(f.x, f.y - 14, v.x, v.y - 14), game.time);
}
// Holding the skill thief: the one Q would hack now, marked, with what it'd take over them (faint while it's waiting).
function drawStealMarks(ctx) {
  const f = player;
  if (!f?.alive || f.usingSkill !== 'steal' || f.steal || online.watching || !['fight', 'end', 'training'].includes(state)) return;
  const list = f.stealable();
  if (!list.length) return;
  const ready = f.skillCD <= 0 && !(f.hackedT > 0), pick = f.stealTarget({ target: input.mouse.active ? mouseWorld() : null }, list);
  if (pick) drawStealMark(ctx, pick.x, pick.y - 14, true, ready, game.time);
  if (pick && ready) {
    const only = pick.usingSkill === 'steal' || pick.usingSkill === 'grapple', info = SKILL_INFO.find((k) => k.key === pick.usingSkill);
    const text = only ? 'Q: HACK ONLY' : `Q: ${info?.name ?? pick.usingSkill.toUpperCase()}`;
    drawText(ctx, text, Math.round(pick.x - textWidth(text) / 2), Math.round(pick.labelY(8)), 1, info?.color ?? '#ff6ad8', '#12041a');
  }
}
// The target lock's mark on whoever's locked, for all to see: the line to them, the mark round them, a word over them.
function drawLocks(ctx) {
  for (const f of game.fighters) {
    const m = f.lockOn, v = m?.target;
    if (!f.alive || !v?.alive || v.vanish || v.stealthed) continue;
    const y = v.y - 14;
    drawLockBeam(ctx, f.x, f.y - 17, v.x, y, game.time);
    drawLockMark(ctx, ctx, v.x, y, m.acq, m.t, game.time);
    if (m.acq > 0.2 && m.t > 0.6) drawText(ctx, 'LOCKED', Math.round(v.x - textWidth('LOCKED') / 2), Math.round(v.labelY(7)), 1, '#ff6a75', '#2a060c');
  }
}
// After the lighting, over everything: the swords in flight and the bursts where they land.
function drawSwordsOnTop(ctx) {
  for (const d of game.swordSets) for (const s of d.swords) {
    if (s.state !== 'out') continue;
    drawSwordTrail(ctx, s.x, s.y, s.ang);
    drawSword(ctx, ctx, s.x, s.y, s.ang, game.time, d.seed + s.i, { hot: 0.5 });
  }
  for (const p of game.punches) drawStab(ctx, ctx, p.x, p.y, p.t / STAB_LIFE, game.time, p.seed, p.ax, p.ay);
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
        // deflect's field: a shot reaching it, from any side, goes back along their aim, as hard as it came, theirs now
        if (o.deflect?.phase === 'guard' && Math.hypot(b.x - o.x, b.y - (o.y - 14)) < DEFLECT_R) {
          const m = o.deflect;
          b.dead = true;
          m.spark = 1;
          m.ripples.push({ a: Math.atan2(b.y - (o.y - 14), b.x - o.x), t: 1 });
          if (m.ripples.length > 5) m.ripples.shift();
          fx.sparks(b.x, b.y, 6, -dx, -dy, '#7affd0');
          game.lights.flash(b.x, b.y, 40, '90, 255, 190', 0.08);
          game.fireBullet(o, o.x + Math.cos(o.aim) * (DEFLECT_R + 2), o.y - 14 + Math.sin(o.aim) * (DEFLECT_R + 2), o.aim + rand(-0.02, 0.02), b.speed, b.dmg, Math.max(320, b.travelled + b.left), b.pierce, b.far);
          break;
        }
        // (online, a player's shot: tested against where they saw this one when they fired - see pastOf)
        const seen = b.rw ? game.pastOf?.(o, b.rw) : null;
        const part = seen ? o.hitPart(b.x + o.x - seen.x, b.y + o.y - seen.y) : o.hitPart(b.x, b.y);
        if (!part) continue;
        b.done.add(o);
        if (o.shield > 0 || o.guardT > 0) { fx.sparks(b.x, b.y, 4, -dx, -dy, '#8ff0ff'); b.dead = true; break; }
        const head = part === 'head', shielded = !!o.barrier;
        o.hitHow = null;
        // weaker the further it's come: full to a third of its range, down to its gun's `far` at the end, the shove with it
        const spent = b.travelled / Math.max(1, b.travelled + b.left), hit = b.dmg * (spent < 0.33 ? 1 : 1 + ((b.far ?? 1) - 1) * ((spent - 0.33) / 0.67)) * (1 + CARD_SHOT * (b.owner?.cardPower?.('red') ?? 0));
        if (!o.hurt(hit, b.owner, dx * hit * 2.2, dy * hit * 1.2 - 15, head)) continue;   // rolled under it
        if (!shielded) fx.blood(b.x, b.y, head ? 10 : 6, dx, dy);
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
    if (pickupT <= 0 && settings.drops > 0 && !mode().economy && game.pickups.length < Math.round(12 * settings.drops)) {
      game.spawnPickup();
      pickupT = rand(1.8, 3.5) / settings.drops;
    }
  }
  for (const p of game.pickups) {
    p.beam -= dt;
    if (!(overtime && p.kind === 'health')) p.life -= dt;   // (what healing's left stays till it's used, with no more coming)
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
        const wants = f === player || f.peer ? fists || f.pickupPressed : fists;
        if (!wants) continue;
        const old = f.giveMelee(MELEE[p.key]);
        if (old) game.pickups.push({ kind: 'melee', key: old.def.key, x: f.x, y: f.y - 10, vx: -f.facing * 60, vy: -140, beam: 0, life: 20, bob: 0, ready: false, noGrab: 0.6 });
        f.pickupPressed = false;
      } else {
        const def = WEAPONS[p.key], w = f.gunIn(f.slotFor(def)), armed = w && (w.ammo > 0 || w.reserve > 0);
        const wants = f === player || f.peer ? !armed || f.pickupPressed : !armed || gunTier(def) > gunTier(w.def) + 0.4;
        if (!wants) continue;
        if (armed && !w.def.skillGun) {
          // drop the old one where the new one was (the gold sniper: just gone)
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
// Dead, waiting to come back or out of it: left and right click go on to the next one still in it, and back.
function spectateInput() {
  if (onMenu() || paused || player.alive || online.watching || online.menuOpen || locker) return;
  const dir = input.wasPressed('Mouse0') ? 1 : input.wasPressed('Mouse2') ? -1 : 0;
  if (!dir || kit.hover?.startsWith('nextsk:')) return;   // (a click on the skills to pick from isn't one to watch someone else)
  const list = game.fighters.filter((o) => o.alive && !o.isDecoy && !o.dummy && o !== player && (!o.hidden || o.seesThrough));
  if (!list.length) return;
  const at = list.indexOf(spectating);
  spectating = list[at < 0 ? 0 : (at + dir + list.length) % list.length];
}
function drawSpectating(u, W, H) {
  if (onMenu() || player.alive || online.watching || state === 'match' || !spectating?.alive || spectating === player) return;
  const dy = player.respawnT > 0 ? 12 * u : 0;   // (under BACK IN, not over it)
  kit.text(`WATCHING ${spectating.name}`, W / 2, H - 42 * u + dy, { color: tagColor(spectating), align: 'center' });
  kit.text('LEFT / RIGHT CLICK: SOMEONE ELSE', W / 2, H - 31 * u + dy, { small: true, color: KC.muted, align: 'center' });
}
const LOOK_DEAD_X = 90, LOOK_DEAD_Y = 64, LOOK_EASE = 2.6;   // how far from the body the mouse can go before the camera looks that way, how slowly it eases over
let lookX = 0, lookY = 0;
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
      // someone still in this game to watch - who got you, if they're about (not a shadow clone, nor
      // someone from a match before: kept from one to the next, the camera sat where they'd last been)
      const ok = (o) => o && o.alive && !o.isDecoy && !o.dummy && game.fighters.includes(o);
      if (!ok(spectating)) spectating = (ok(player.killer?.owner ?? player.killer) && (player.killer.owner ?? player.killer)) || game.fighters.find(ok) || player;
      f = spectating;
    }
    const target = f.alive ? f : f.corpse ?? f;
    tx = target.x;
    ty = target.y - 20;
    // Looking ahead, toward the mouse: not at all while it's anywhere near the body - a little wave of the hand there
    // doesn't move the world - and once it's further out, gently, the look easing over rather than following every twitch.
    let lx = 0, ly = 0;
    if (f === player && input.mouse.active && player.alive) {
      const m = mouseWorld(), past = (d, near) => (Math.abs(d) <= near ? 0 : (d - Math.sign(d) * near));
      lx = Math.max(-90, Math.min(90, past(m.x - player.x, LOOK_DEAD_X) * 0.3));
      ly = Math.max(-60, Math.min(60, past(m.y - player.y, LOOK_DEAD_Y) * 0.3));
    }
    const lk = 1 - Math.exp(-LOOK_EASE * dt);
    lookX += (lx - lookX) * lk;
    lookY += (ly - lookY) * lk;
    tx += lookX;
    ty += lookY;
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
  game.fx.drawStains(ctx);
  game.fx.drawScorches(ctx);
  drawRiftsUnder(ctx);
  for (const p of game.props) p.draw(ctx);
  drawThrown(ctx);
  drawPickups(ctx);
  drawObjectives(ctx);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  const seen = (f) => !f.hidden || f === player;
  for (const f of game.fighters) if (f.alive && f.onGround && seen(f)) ctx.fillRect(Math.round(f.x) - 5, Math.round(f.y) - 1, 11, 1);
  for (const f of game.fighters) if (!f.alive) f.draw(ctx);
  for (const f of game.fighters) if (f.alive && f !== player) f.draw(ctx);
  if (player.alive && !onMenu()) player.draw(ctx);   // (the menus' backdrop is the map alone)
  for (const f of game.fighters) f.drawHook(ctx);
  drawGrenades(ctx);
  game.fx.viewer = player;
  game.fx.draw(ctx);

  // light it
  for (const f of game.fighters) f._labelUp = 0;   // (what's said over their heads: see Fighter.labelY)
  const extra = [];
  // a little light on each fighter so they read in the dark corners
  for (const f of game.fighters) if (f.alive && !f.hidden) extra.push({ x: f.x, y: f.y - 14, r: 30, rgb: '190, 210, 230', k: 0.22 });
  // a violet flash round someone going into the cloak or coming out of it
  for (const f of game.fighters) if (f.alive && f.fade && !(f.fade.secret && f !== player)) extra.push({ x: f.x, y: f.y - 14, r: 38, rgb: f.fade.rgb ?? '150, 110, 255', k: 0.5 * (1 - f.fade.t / f.fade.dur) });
  // the grapple's claw lights up what it's stuck in
  for (const f of game.fighters) if (f.hook && f.hook.state !== 'back') extra.push({ x: f.hook.x, y: f.hook.y, r: 22, rgb: '120, 210, 255', k: 0.4 });
  for (const d of game.swordSets) extra.push({ x: d.owner?.x ?? d.x, y: (d.owner?.y ?? d.y) - 30, r: 56, rgb: '110, 190, 255', k: 0.35 });
  for (const d of game.fangs) extra.push({ x: d.x, y: d.y, r: 18, rgb: '255, 200, 90', k: 0.35 });
  for (const f of game.fighters) if (f.alive && f.aurum && !f.hidden) extra.push({ x: f.x + Math.cos(f.aim) * 16, y: f.y - 14 + Math.sin(f.aim) * 16, r: 26, rgb: '170, 110, 255', k: 0.3 });
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
  drawStealMarks(ctx);
  drawCloakSense(ctx);
  drawShields(ctx);
  drawArrows(ctx);
  drawVoids(ctx);
  drawFists(ctx);
  drawSande(ctx);
  drawBats(ctx);
  drawRifts(ctx);
  drawSwordsOnTop(ctx);
  drawFangs(ctx);
  drawObjectivesLit(ctx);
  drawLocks(ctx);
  drawBursts(ctx);
  for (const b of game.bullets) drawBullet(ctx, b);
  for (const f of game.fighters) f.drawFlash(ctx);
  if (uiHidden) return;   // (\ : no numbers, names or prompts over the fight - for filming it)
  drawNumbers(ctx);

  // name tags, health and stamina over heads (at a fixed height: they don't
  // dip with a roll or a crouch)
  for (const f of game.fighters) {
    if (!f.alive || (f.hidden && !f.seesThrough)) continue;
    const x = Math.round(f.x), y = Math.round(f.y - (f.bow ? 48 : 36));   // (lifted clear of the archery bow while it's up)
    const you = f === player && !online.watching, name = you ? 'YOU' : f.name, w = textWidth(name);
    if (!you || state === 'intro') drawText(ctx, name, x - Math.floor(w / 2), y - 8, 1, tagColor(f));
    // a training dummy: what it's taking, a second at a time, over its name
    if (f._hits?.length) {
      const now = performance.now() / 1000;
      f._hits = f._hits.filter((h) => now - h.at < STATS_GAP);
      if (f._hits.length) {
        const label = String(Math.round(f._hits.reduce((a, h) => a + h.d, 0))), tw = textWidth(label);
        drawText(ctx, label, x - Math.floor(tw / 2), y - 16, 1, '#ffd84a');
      }
    }
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
  const mine = player.alive ? player.stabTarget() ?? player.hookTarget() : null;   // (who the stab, or the line, would go for)
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
  if (b.violet) return drawVioletShot(ctx, b.x, b.y, dx, dy, Math.min(130, b.travelled), game.time, (b.id ?? 0) * 7.3);   // (the gold sniper's)
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

// ---------- sound ----------
// The volumes: a panel over whatever's up (from the main menu, the pause menu, the room's menu).
let soundPanel = false;
const SOUND_ROWS = [['master', 'ALL SOUND'], ['sfx', 'EFFECTS'], ['music', 'MUSIC']];
let soundBars = [], soundDrag = null;
function soundInput() {
  const c = kit.click;
  if (c === 'snd:close' || input.wasPressed('Escape')) { soundPanel = false; soundDrag = null; return; }
  // a bar: click on it, or hold and drag along it
  if (c?.startsWith('snd:bar:')) soundDrag = c.slice(8);
  if (!input.mouse.down) soundDrag = null;
  if (soundDrag) {
    const bar = soundBars.find((b) => b.key === soundDrag);
    if (bar) {
      const v = Math.max(0, Math.min(1, (input.mouse.x * renderer.dpr - bar.x) / bar.w));
      const was = sound.vol[soundDrag];
      sound.set(soundDrag, v);
      if (sound.vol[soundDrag] !== was) sound.play('ui', { gap: 0.09 });
    }
  }
}
function drawSoundPanel(u, W, H) {
  kit.shade(0.6);
  kit.hits = [];
  const pw = Math.min(W - 16 * u, 270 * u), rowH = 18 * u, ph = 26 * u + SOUND_ROWS.length * rowH + 30 * u, px = Math.round(W / 2 - pw / 2), py = Math.round(H / 2 - ph / 2);
  let y = kit.panel(px, py, pw, ph, { title: 'SOUND', note: 'ESC TO CLOSE' });
  soundBars = [];
  const labelW = 76 * u, pctW = 34 * u, bx = px + 8 * u + labelW, bw = pw - 16 * u - labelW - pctW, bh = 9 * u, blocks = 20;
  for (const [key, label] of SOUND_ROWS) {
    const by = y + 2 * u, v = sound.vol[key], hot = soundDrag === key || kit.hover === `snd:bar:${key}`;
    kit.text(label, px + 8 * u, by + 1 * u, { color: hot ? KC.gold : KC.muted });
    // the bar: a trough of blocks, lit as far as it's turned up, the last lit one bright
    kit.rect(bx - u, by - u, bw + 2 * u, bh + 2 * u, KC.ink);
    kit.rect(bx, by, bw, bh, '#141c19');
    const gap = u, bwEach = (bw - gap * (blocks - 1)) / blocks, lit = Math.round(v * blocks);
    for (let i = 0; i < blocks; i++) {
      const on = i < lit;
      kit.rect(bx + i * (bwEach + gap), by + u, Math.max(1, bwEach), bh - 2 * u, !on ? '#222c28' : i === lit - 1 ? '#ffffff' : hot ? KC.gold : KC.teal);
    }
    kit.text(v ? `${Math.round(v * 100)}%` : 'OFF', px + pw - 8 * u, by + u, { color: v ? '#ffffff' : KC.faint, align: 'right' });
    kit.hit(`snd:bar:${key}`, bx - 4 * u, y, bw + 8 * u, rowH - 2 * u);
    soundBars.push({ key, x: bx, w: bw });
    y += rowH;
  }
  y += 6 * u;
  kit.button('snd:close', px + 8 * u, y, pw - 16 * u, 16 * u, 'DONE', { kind: 'primary' });
}
function drawHud() {
  drawHudUnder();
  const u = hudScale(), W = renderer.width, H = renderer.height;
  if (!uiHidden || onMenu()) drawSpectating(u, W, H);
  if (soundPanel) drawSoundPanel(u, W, H);
  sound.watch(game, player, renderer.camera, !onMenu() && (game.timeK ?? 1) < 1, kit.click);
}
function drawHudUnder() {
  const ctx = renderer.ctx, u = hudScale(), W = renderer.width, H = renderer.height;
  // (one map to the next, behind the menus: through black)
  const dark = onMenu() ? Math.max(backdropFade, state === 'title' ? 0 : 1 - backdropT / 0.6) : 0;
  if (dark > 0) { ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, dark)})`; ctx.fillRect(0, 0, W, H); }
  renderer.beginScreen();
  kit.begin(ctx, u, W, H);
  renderer.drawVignette();
  // the keys overlay never sits over a menu
  if (state === 'menu') return drawMainMenu(ctx, u, W, H);
  if (state === 'soon') return drawSoon(ctx, u, W, H);
  if (state === 'title') return drawTitle(ctx, u, W, H);
  if (online.isScreen(state)) { drawNetScreen(ctx, u, W, H); return drawPicker(); }

  // everyone's card in a row along the top (Superfighters style)
  if (!online.watching) drawHurt(ctx, W, H, player);
  if (uiHidden && !locker && !paused) return;   // (\ : the fight on its own; a panel opened still shows)
  const cardsBottom = drawCards(ctx, u, W);
  if (!locker && !paused && state !== 'match' && !touch) drawSkillBox(u, W, H, player);   // (a phone: it's on the SKILL button)
  if (state === 'training') {
    if (!locker && (online.toast || online.busyText)) kit.text(online.busyText || online.toast, W / 2, H - 30 * u, { color: online.busyText ? KC.teal : KC.gold, align: 'center' });
    if (online.training && !locker) kit.text(`ROOM ${online.trainCode}  -  ${online.trainMembers.length} IN IT  -  TAB: ROOM`, 8 * u, H - 12 * u, { small: true, color: '#8aff9a' });
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
    const t = mode().score ? clock.trim() || mode().name : `ROUND ${Math.max(1, round)}${clock}`;
    let ty = cardsBottom + 4 * u;
    if (teamMode() && !mode().score) {
      // BLUE 1 - 0 RED, each side in its colour
      const [b, r] = [0, 1].map((t) => Math.max(0, ...game.fighters.filter((f) => f.team === t && !f.isDecoy).map((f) => f.wins)));
      const parts = [[`BLUE ${b}`, TEAMS[0].color], ['  -  ', '#9aa49c'], [`${r} RED`, TEAMS[1].color]];
      let x = W / 2 - kit.width(parts.map((p) => p[0]).join('')) / 2;
      for (const [txt, c] of parts) x += kit.text(txt, x, ty, { color: c });
      ty += 11 * u;
    }
    kit.text(t, W / 2, ty, { color: overtime ? '#ff6a5a' : '#c8d0c4', align: 'center' });
    drawModeHud(u, W, H, ty + 11 * u);
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
  if (state === 'intro' && mode().economy) { if (!locker) kit.text(`BUY - ${Math.max(1, Math.ceil(BUY_TIME - stateT))}`, W / 2, H * 0.34 + 36 * u, { size: 3, color: KC.gold, align: 'center' }); }
  else if (state === 'intro' && stateT > 0.5) kit.text(String(Math.max(1, 3 - Math.floor((stateT - 0.5) / 0.37))), W / 2, H * 0.34 + 36 * u, { size: 3, color: KC.gold, align: 'center' });
  if (!player.alive && state === 'fight' && !online.watching && !paused && picking()) drawNextSkill(u, W, H);
  if (!player.alive && state === 'fight' && !online.watching) {
    if (player.respawnT > 0) kit.text(`BACK IN ${player.respawnT.toFixed(1)}`, W / 2, H - 48 * u, { size: 2, color: KC.teal, align: 'center' });
    else kit.text(`SPECTATING ${spectating?.name ?? ''}`, W / 2, H - 46 * u, { color: KC.muted, align: 'center' });
  }

  if (input.down('Tab') && (state === 'intro' || state === 'fight' || state === 'end') && !paused) drawScores(ctx, u, W, H);
  if (state === 'match') drawMatch(ctx, u, W, H);
  if (locker?.use === 'shop') drawLocker(ctx, u, W, H);
  if (paused) drawPause(ctx, u, W, H);
  drawCrosshair(ctx, u);
  if (online.active) drawNetOverlay(ctx, u, W, H);
}

// PICK WHEN YOU DIE: a row of the skills over the countdown - the one for your next life picked out in gold, the one
// under the mouse named over them. A click picks it (see nextSkillInput).
function drawNextSkill(u, W, H) {
  const items = SKILL_INFO.filter((k) => skillOK(k.key)), n = items.length;
  if (!n) return;
  const t = 20 * u, gap = 2 * u, cols = Math.max(1, Math.min(n, Math.floor((W - 20 * u + gap) / (t + gap)))), rows = Math.ceil(n / cols);
  const chosen = player.nextSkill !== undefined ? player.nextSkill : player.skill, y0 = H - 64 * u - rows * (t + gap);
  const hot = items.find((k) => kit.hover === `nextsk:${k.key}`), shown = hot ?? items.find((k) => k.key === chosen);
  const bw = cols * (t + gap) - gap + 12 * u;
  kit.rect(Math.round(W / 2 - bw / 2), y0 - 26 * u, bw, rows * (t + gap) + 30 * u, 'rgba(5, 8, 7, 0.6)');   // (dark behind it, to read over the fight)
  kit.text(player.lives > 0 ? 'PICK YOUR SKILL FOR THE NEXT LIFE' : 'PICK YOUR SKILL FOR THE NEXT ROUND', W / 2, y0 - 22 * u, { small: true, color: KC.muted, align: 'center' });
  if (shown) kit.text(shown.name, W / 2, y0 - 13 * u, { color: shown.color, align: 'center' });
  items.forEach((k, i) => {
    const r = Math.floor(i / cols), inRow = Math.min(cols, n - r * cols), x = Math.round(W / 2 - (inRow * (t + gap) - gap) / 2 + (i % cols) * (t + gap)), y = y0 + r * (t + gap);
    const on = k.key === chosen, over = hot === k;
    kit.rect(x - u, y - u, t + 2 * u, t + 2 * u, KC.ink);
    kit.rect(x, y, t, t, on ? KC.gold : over ? KC.teal : k.color);
    kit.rect(x + u, y + u, t - 2 * u, t - 2 * u, on ? '#3a3212' : over ? '#1f3a36' : 'rgba(11, 16, 14, 0.85)');
    kit.icon(k.img, x + 2 * u, y + 2 * u, t - 4 * u);
    kit.hit(`nextsk:${k.key}`, x, y, t, t);
  });
}
function nextSkillInput() {
  const c = kit.click;
  if (player.alive && online.isClient) player.nextSkill = undefined;   // (back in: the pick's been used - the host doesn't send its going)
  if (!c?.startsWith('nextsk:') || player.alive || !picking()) return;
  const key = c.slice(7);
  if (online.isClient) { online.sendPick(key); player.nextSkill = key; }   // (the host has the say: see online.js)
  else game.pickNext(player, key);
}

function drawBanner(ctx, u, H) {
  if (!banner) return;
  const W = renderer.width;
  ctx.globalAlpha = Math.min(1, banner.t * 3);
  kit.text(banner.text, W / 2, H * 0.34, { size: kit.width(banner.text, { size: 3 }) < W - 20 * u ? 3 : 2, color: banner.color, align: 'center' });
  // (the scores under it: in the big font if they fit, the small one if not)
  if (banner.sub) kit.text(banner.sub, W / 2, H * 0.34 + 25 * u, { small: kit.width(banner.sub) > W - 20 * u, color: '#dfe4d6', align: 'center' });
  ctx.globalAlpha = 1;
}

// The pause menu: buttons (or their keys).
const canReset = () => (state === 'fight' || state === 'training') && player.alive;   // (stuck somewhere? out of it the hard way)
const pauseItems = () => [
  ['resume', 'RESUME', 'ESC'],
  ...(canReset() ? [['kill', 'RESET CHARACTER (DIE)', 'K']] : []),
  ['sound', 'SOUND', 'M'],
  ['hud', 'HIDE THE HUD (FOR VIDEO)', '\\'],
  ...(state === 'training'
    ? [['room', 'ROOM, BOTS, SETTINGS (TAB)', 'TAB'], ['clear', 'CLEAR THE DPS', 'T'], ...(isAdmin(myRole()) ? [['reset', 'RESET THE RANGE', 'R']] : []), ...(online.training ? [['leave', online.isHost ? 'CLOSE THE ROOM' : 'LEAVE THE ROOM', 'L']] : []), ['menu', 'MAIN MENU', 'Q']]
    : [['restart', 'RESTART THE MATCH', 'R'], ['setup', 'ROOM SETUP', 'S'], ['menu', 'MAIN MENU', 'Q']]),
];
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
  else if (input.wasPressed('KeyM') || c === 'sound') soundPanel = true;
  else if (c === 'hud') { paused = false; uiHidden = true; }   // (\ again to have it back)
  else if (state === 'training' && (input.wasPressed('Tab') || c === 'room')) { paused = false; openLocker({ use: 'all' }); const i = locker.tabs.findIndex((t) => t.custom === 'room'); if (i >= 0) locker.tab = i; }
  else if (state === 'training' && (input.wasPressed('KeyT') || c === 'clear')) stats.reset();
  else if (state === 'training' && online.training && (input.wasPressed('KeyL') || c === 'leave')) { paused = false; online.leaveTrain(); }
  else if (canReset() && (input.wasPressed('KeyK') || c === 'kill')) { paused = false; if (online.isClient) online.sendAct({ a: 'die' }); else player.die(null, 'RESET', 0, 0); }
  else if (input.wasPressed('KeyQ') || c === 'menu') { paused = false; if (online.training) online.leaveTrain(); state = 'menu'; banner = null; }
  else if (input.wasPressed('KeyR') || c === 'restart' || c === 'reset') { paused = false; if (state === 'training') { if (online.training) { if (isAdmin(myRole())) trainDo({ a: 'reset' }); } else startTraining(); } else startMatch(); }
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
  // (training: only the real players get a card - not the bots put in, nor the range's own)
  const list = game.fighters.filter((f) => !f.dummy && !f.isDecoy && (state !== 'training' || f === player || f.peer));
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
      const sk = f.usingSkill, k = sk === 'grapple' && f.charges > 0 ? 1 : Math.max(0, Math.min(1, 1 - f.skillCD / cdTotal(f))), ready = k >= 1, on = skillOn(f);
      px(x + 15, y + 17, 10, 9, HUDC.frame);
      px(x + 16, y + 18, 8, 7, on ? '#2a2240' : ready ? '#1d3a44' : '#161b19');
      if (on) { const left = Math.max(0, f.fang ? (f.fang.back ? 0.1 : 1 - f.fang.t / SKILL_TIME.fang) : f.aurum ? 1 - f.aurum.t / SKILL_TIME.aurum : f.reap ? 1 : f.phase ? f.phase.t / SKILL_TIME.jumper : f.steal ? 1 - f.steal.t / SKILL_TIME.steal : f.deflect ? (f.deflect.phase === 'guard' ? f.deflect.t / SKILL_TIME.deflect : 0.1) : f.octo ? (f.octo.gone >= 0 ? 0 : f.octo.on ? f.octo.left / SKILL_TIME.octo : 1) : f.chidori ? (f.chidori.phase === 'charge' ? 1 : (f.chidori.phase === 'lunge' ? f.chidori.left : f.chidori.phase === 'stab' ? 0 : f.chidori.t) / SKILL_TIME.chidori) : f.wraith ? f.wraith.t / f.wraith.total : f.batCast ? Math.min(1, f.batCast.t / SKILL_TIME.vampire) : f.sande ? f.sande.t / f.sande.total : f.barrier ? f.barrier.t / SKILL_TIME.shield : f.card ? (f.card.on ? f.card.left / f.card.total : 1) : f.hackCast ? Math.min(1, f.hackCast.t / SKILL_TIME.hack) : f.lockOn ? f.lockOn.t / SKILL_TIME.lock : f.skill === 'demon' ? (f.summon ? Math.min(1, f.summon.t / SKILL_TIME.demon) : (() => { const d = game.swordSets.find((q) => q.owner === f); return d ? d.swords.length / d.total : 0; })()) : f.gal ? Math.min(1, f.gal.t / SKILL_TIME.galaxy) : f.blaze ? (f.blaze.phase === 'charge' ? Math.min(1, f.blaze.t / SKILL_TIME.blaze) : 1) : f.mura ? Math.min(1, f.mura.t / SKILL_TIME.murasaki) : f.bow ? Math.min(1, f.bow.t / SKILL_TIME.archery) : f.cloak ? f.cloak.t / SKILL_TIME.cloak : f.veil ? f.veil.t / SKILL_TIME.veil : f.decoyLife / SKILL_TIME.decoy); px(x + 16, y + 18 + 7 * (1 - left), 8, 7 * left, f.deflect ? '#2ac88a' : f.batCast ? '#b01828' : f.sande ? '#2ad08a' : f.barrier ? '#2a7ad0' : f.card ? '#a88a3a' : f.hackCast ? '#1a9a5a' : f.lockOn ? '#2a9ad0' : f.skill === 'demon' ? '#2a7ad0' : f.gal ? '#3a2aa0' : f.blaze ? '#b8481a' : f.mura ? '#6a2aa0' : f.bow ? '#2a8a4a' : f.cloak ? '#5a4a90' : '#46588a'); }
      else if (!ready) px(x + 16, y + 18 + 7 * (1 - k), 8, 7 * k, '#22343a');
      text('Q', x + 19, y + 19, on ? '#d8c8ff' : ready ? '#8ff0ff' : '#4a5a5c');
    }
    // lives left: a heart and a number in the portrait's top corner
    if (livesShown()) {
      const n = f.lives ?? 0;
      px(x + 3, y + 4, 12, 7, 'rgba(8, 10, 9, 0.8)');
      for (const [i, j, w] of [[1, 0, 2], [4, 0, 2], [0, 1, 7], [1, 2, 5], [2, 3, 3], [3, 4, 1]]) px(x + 4 + i, y + 5 + j, w, 1, n > 0 ? '#ff4a5a' : '#4a2a2e');
      text(n, x + 12, y + 5, n > 0 ? '#f2e8e0' : '#5a5450');
    }
    // name, rounds won
    const name = me ? 'YOU' : f.name;
    // (the big font, if it fits beside the rounds won)
    const roomForName = (CW - 31 - (state !== 'training' ? settings.wins * 4 : 0)) * u;
    if (kit.width(name) <= roomForName) kit.text(name, (x + 27) * u, (y + 2) * u, { color: f.alive ? tagColor(f) : '#4a5450' });
    else text(name, x + 27, y + 4, f.alive ? tagColor(f) : '#4a5450');
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
// The whole of the wait a skill's on: its own - or, for the skill thief after a hack, however long that one is.
const cdTotal = (f) => (f.usingSkill === 'steal' && f.stealWait ? Math.max(f.stealWait, 0.01) : SKILL_CD[f.usingSkill]);
// A skill going (cast, out, or what it called up still about).
const skillOn = (f) => !!f.fang || !!f.aurum || !!f.reap || !!f.cloak || !!f.decoy || (!!f.bow && !f.bow.fired) || !!f.mura || !!f.blaze || !!f.gal || !!f.summon || !!f.batCast || !!f.wraith || !!f.chidori || !!f.octo || !!f.steal || !!f.phase || !!f.deflect || !!f.sande || !!f.lockOn || !!f.barrier || !!f.card || !!f.hackCast || game.swordSets.some((d) => d.owner === f) || !!f.swordsOut;

// Your skill, bottom right: its picture and name, Q, and how it stands - READY (lit, with a
// flash the moment it comes ready), going, or the wait left as a bar filling back up.
function drawSkillBox(u, W, H, f) {
  const sk = f?.usingSkill, info = SKILL_INFO.find((k) => k.key === sk);   // (the skill in use: their own, or one taken)
  if (!info || !f.alive) return;
  const shots = sk === 'grapple';   // (the line's saved up: ready while there's one left)
  const swords = sk === 'demon', puffed = (swords && f.stamina < SWORD_COST) || (sk === 'sande' && f.stamina < SANDE_NEED), hacked = f.hackedT > 0;   // (the swords are paid for in stamina)
  const cd = Math.max(0, f.skillCD ?? 0), total = cdTotal(f), on = skillOn(f), ready = (shots ? f.charges > 0 : cd <= 0) && !on && !puffed && !hacked;
  if (ready && f.readySeen === false) f.readyAt = game.time;
  f.readySeen = ready;
  const flash = Math.max(0, 1 - (game.time - (f.readyAt ?? -9)) / 0.7);
  const w = 116 * u, h = 30 * u, x = W - w - 6 * u, y = H - h - 6 * u;   // (as wide as a fighter's card)
  if (f.stolen) kit.text(`STOLEN - USE IT  ${Math.max(0, f.stolen.left).toFixed(0)} S`, x + w, y - 9 * u, { small: true, color: '#ff6ad8', align: 'right' });
  const edge = ready ? info.color : on ? '#d8c8ff' : KC.edge;
  // (see-through: nothing that hides the game. Just its edge, and a touch of dark behind the words)
  for (const [ex, ey, ew, eh] of [[x, y, w, u], [x, y + h - u, w, u], [x, y, u, h], [x + w - u, y, u, h]]) kit.rect(ex, ey, ew, eh, edge);
  kit.rect(x + u, y + u, w - 2 * u, h - 2 * u, 'rgba(11, 16, 14, 0.28)');
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
    kit.text(shots ? 'PRESS Q' : swords ? `Q  -  ${Math.min(5, Math.floor(f.stamina / SWORD_COST))} OF 5 SWORDS` : 'READY  -  PRESS Q', x + 31 * u, y + 17 * u, { small: true, color: KC.green });
    ctx.globalAlpha = 1;
    if (shots) for (let i = 0; i < GRAPPLE_SHOTS; i++) {
      // the shots: full, the one coming back filling up, empty
      const px = x + w - (5 + (GRAPPLE_SHOTS - i) * 7) * u + 6 * u, k = i < f.charges ? 1 : i === f.charges ? Math.max(0, 1 - cd / total) : 0;
      kit.rect(px, y + 17 * u, 5 * u, 5 * u, KC.ink);
      kit.rect(px + u, y + 18 * u, 3 * u * k, 3 * u, info.color);
    }
  } else if (hacked) kit.text(`HACKED  -  ${f.hackedT.toFixed(1)} S${f.jamT > 0 ? '  -  GUN DEAD' : ''}`, x + 31 * u, y + 17 * u, { small: true, color: '#3aff8a' });
  else if (on) kit.text(f.fang ? (f.fang.back ? 'COMING HOME...' : `Q: CALL THEM BACK  -  ${Math.max(0, SKILL_TIME.fang - f.fang.t).toFixed(1)} S`) : f.aurum ? (f.aurum.t < AURUM_CAST ? 'BUILDING...' : `${f.gun?.def.skillGun ? f.gun.ammo : 0} SHOTS  -  Q: PUT AWAY  -  ${Math.max(0, SKILL_TIME.aurum - f.aurum.t).toFixed(1)} S`) : f.reap ? 'SHADOW KILL!' : f.phase ? `THE OTHER PLACE  -  Q: OPEN THE WAY BACK  -  ${f.phase.t.toFixed(1)} S` : f.steal ? `HACKING ${Math.round(Math.min(1, f.steal.t / SKILL_TIME.steal) * 100)}%` : f.deflect ? (f.deflect.phase === 'guard' ? `Q: DASH  -  ${f.deflect.t.toFixed(1)} S` : 'CUT!') : f.octo ? (f.octo.gone >= 0 ? 'ARMS IN' : f.octo.on ? `HOLD TO FIRE  -  Q: PUT AWAY  -  ${f.octo.left.toFixed(1)} S` : 'GRABBING...') : f.chidori ? (f.chidori.phase === 'charge' ? 'GATHERING...' : f.chidori.phase === 'lunge' ? 'LUNGE!' : f.chidori.phase === 'stab' ? 'CHIDORI!' : `RUN INTO THEM${f.chidori.lunged ? '' : '  -  Q: LUNGE'}  -  ${f.chidori.t.toFixed(1)} S`) : f.sande ? `ACTIVE  -  ${f.sande.t.toFixed(1)} S` : f.lockOn ? `LOCKED ON  -  ${f.lockOn.t.toFixed(1)} S` : f.barrier ? `SHIELD ${Math.max(0, Math.ceil(f.barrier.hp))}  -  BLAST ${Math.round(Math.max(0, 1 - f.barrier.hp / f.barrier.max) * 100)}%  -  ${f.barrier.t.toFixed(1)} S` : f.card?.on ? `${CARDS[f.card.kind].name}  -  ${f.card.left.toFixed(1)} S` : f.card?.pick ? 'DRAG TO A CARD' : f.card ? 'DRAWING...' : f.powered ? 'NEXT HIT X1.8' : 'IN USE', x + 31 * u, y + 17 * u, { small: true, color: '#d8c8ff' });
  else if (puffed && cd <= 0) kit.text('NOT ENOUGH STAMINA', x + 31 * u, y + 17 * u, { small: true, color: '#ffa080' });
  else {
    // the wait: a bar filling back up, the seconds left beside it
    const bw = w - 31 * u - 30 * u, k = Math.max(0, Math.min(1, 1 - cd / total));
    kit.rect(x + 31 * u, y + 18 * u, bw, 5 * u, KC.ink);
    kit.rect(x + 32 * u, y + 19 * u, (bw - 2 * u) * k, 3 * u, info.color);
    kit.text(`${(cd / game.cdRate()).toFixed(1)} S`, x + w - 5 * u, y + 17 * u, { small: true, color: KC.text, align: 'right' });
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
  const rowH = 12 * u, lives = livesShown(), watching = online.active ? online.watcherRows : [];
  const pw = Math.min(W - 16 * u, 340 * u), ph = 26 * u + 12 * u + groups.reduce((h, g) => h + g.length * rowH + (teamMode() ? 16 * u : 0), 0) + (watching.length ? 12 * u + watching.length * rowH : 0) + 4 * u;
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
      const crowned = online.active && f.peer && f.peer === online.hostId;   // (whose room it is)
      if (crowned) online.drawCrown(kit, u, col.name + nw + 4 * u, y);
      const tagX = col.name + nw + (crowned ? 15 : 5) * u;
      if (f.bot) kit.text('BOT', tagX, y + u, { small: true, color: KC.faint });
      else if (!f.alive && f.respawnT <= 0) kit.text('OUT', tagX, y + u, { small: true, color: KC.red });
      kit.text(f.wins, col.rounds, y, { align: 'right', color: KC.gold });
      kit.text(f.kills, col.kills, y, { align: 'right' });
      kit.text(f.deaths ?? 0, col.deaths, y, { align: 'right', color: KC.muted });
      if (lives) kit.text(f.lives ?? 0, col.lives, y, { align: 'right', color: (f.lives ?? 0) > 0 ? '#ff8a8a' : KC.faint });
      if (f.peer) online.tabButtons(kit, u, f.peer, col.rounds - 38 * u, y - u, rowH - 3 * u);
      y += rowH;
    });
  }
  // in the room, not on the field
  if (watching.length) {
    y += 2 * u;
    kit.text('WATCHING', col.name, y, { small: true, color: KC.faint });
    y += 10 * u;
    for (const m of watching) {
      const nw = kit.text(m.name, col.name, y, { color: KC.muted });
      if (m.next) kit.text('NEXT ROUND', col.name + nw + 5 * u, y + u, { small: true, color: KC.green });
      online.tabButtons(kit, u, m.id, col.rounds - 38 * u, y - u, rowH - 3 * u);
      y += rowH;
    }
  }
}

function drawCrosshair(ctx, u) {
  if (!input.mouse.active || online.watching || (touch && !touchCombat())) return;
  const d = renderer.dpr, x = Math.round(input.mouse.x * d), y = Math.round(input.mouse.y * d);
  const spread = player.weapon ? Math.round((2 + player.weapon.recoil * 1.2) * player.stanceKick) : 2;
  for (const [col, o] of [['#050604', 1], ['#e8ffd0', 0]]) {
    ctx.fillStyle = col;
    for (const [dx, dy, w, h] of [[-spread - 3, 0, 3, 1], [spread + 1, 0, 3, 1], [0, -spread - 3, 1, 3], [0, spread + 1, 1, 3]]) ctx.fillRect(x + (dx - o * 0) * u - o * u, y + dy * u - o * u, (w + o * 2) * u, (h + o * 2) * u);
  }
  ctx.fillStyle = '#ff5a4a';
  ctx.fillRect(x, y, u, u);
  // reloading: a ring round the crosshair filling up
  const w = player.weapon;
  if (w && w.reloading) {
    const k = w.reloadShown;
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
  } else if (w?.waitShown !== null && w?.waitShown !== undefined) {
    // waiting to fire again (a bolt, a pump, a slow one): a thinner ring round the crosshair, amber, so there's no need to look at the gun
    const R = 8 * u;
    ctx.save();
    ctx.lineWidth = 2 * u;
    ctx.strokeStyle = 'rgba(5, 6, 4, 0.6)';
    ctx.beginPath(); ctx.arc(x + u / 2, y + u / 2, R, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = u;
    ctx.strokeStyle = '#ffc24a';
    ctx.beginPath(); ctx.arc(x + u / 2, y + u / 2, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * w.waitShown); ctx.stroke();
    ctx.restore();
  }
}

// The room's setup screen (single player): the settings in two columns (click a
// half, or W S to pick and A D to change), the controls, START.
let menuSel = 0;
const CONTROLS = [
  'A D  WALK      A A / D D  RUN      W / SPACE  JUMP (TWICE IN THE AIR)      S  CROUCH      S S  DROP DOWN',
  'SHIFT  ROLL      MOUSE  AIM AND SHOOT      R  RELOAD      Q  SKILL      RIGHT CLICK  QUICK MELEE      F  GRENADE',
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
    const M = MODES[settings.mode] ?? MODES.ffa;
    if (k === 'bots' && M.duel) shown = '1 (1 V 1)';
    else if (k === 'bots' && teamMode()) { const n = settings.bots | 1; shown = `${n} (${(n + 1) / 2} V ${(n + 1) / 2})`; }
    if (k === 'goal') shown = !M.score ? 'NOT USED' : M.score === 'caps' ? `${CAPS[settings.goal]} CAPTURES` : `${settings.goal} ${M.score === 'tags' ? 'TAGS' : 'KILLS'}`;
    if (k === 'wins' && M.rounds) shown = M.score ? 'ONE GAME' : `${M.rounds} (MODE)`;
    if (k === 'lives' && (M.respawn || M.oneLife)) shown = M.respawn ? 'ENDLESS' : '1 (MODE)';
    const ox = px + 6 * u + c * (colW + 6 * u), oy = cy + r * rowH;
    if (k === 'myskill' || k === 'botskill') {
      if (menuSel === i) kit.rect(ox, oy, colW, rowH - u, KC.row);
      kit.select(`pick:${k}`, ox, oy, colW, rowH - u, label, settings.skills ? shown : 'OFF', { enabled: !!settings.skills, img: settings.skills ? SKILL_INFO.find((s) => s.key === settings[k])?.img : null });
    } else if (k === 'map') {
      if (menuSel === i) kit.rect(ox, oy, colW, rowH - u, KC.row);
      kit.select('pick:map', ox, oy, colW, rowH - u, label, shown);
    } else if (k === 'banGuns' || k === 'banSkills') {
      if (menuSel === i) kit.rect(ox, oy, colW, rowH - u, KC.row);
      kit.select(`ban:${k}`, ox, oy, colW, rowH - u, label, banShown(settings[k]));
    } else kit.stepper(`opt:${i}`, ox, oy, colW, rowH - u, label, shown, { selected: menuSel === i });
  });
  y += ph + 4 * u;
  kit.text((MODES[settings.mode] ?? MODES.ffa).desc, W / 2, y, { small: true, color: KC.gold, align: 'center' });
  y += 8 * u;
  // the controls, if there's room
  const ch = 26 * u + CONTROLS.length * 9 * u;
  if (y + ch + 40 * u < H) {
    const ty = kit.panel(px, y, pw, ch, { title: 'CONTROLS', accent: KC.teal });
    CONTROLS.forEach((l, i) => kit.text(l, px + 8 * u, ty + i * 9 * u, { small: true, color: i === CONTROLS.length - 1 ? '#ffa080' : KC.text }));
    y += ch + 8 * u;
  }
  kit.button('back', px, y, 80 * u, 18 * u, 'BACK', { kind: 'danger' });
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

// The maps' pictures: made the first time they're asked for, from the map itself, without the headroom over it.
const mapThumbs = new Map();
function mapThumb(key) {
  if (!mapThumbs.has(key)) {
    const L = new Level(MAPS[key]), sy = L.pad * T, sh = (L.h - L.pad) * T, sw = L.w * T, k = Math.min(1, 320 / sw), [c, g] = makeCanvas(Math.round(sw * k), Math.round(sh * k));
    g.imageSmoothingEnabled = true;
    g.drawImage(L.back, 0, sy, sw, sh, 0, 0, c.width, c.height);
    g.fillStyle = '#7fe03a';   // (the acid's drawn live in the game: here, just where it lies)
    for (let cy = L.pad; cy < L.h; cy++) for (let cx = 0; cx < L.w; cx++) if (L.get(cx, cy) === ACID) g.fillRect(cx * T * k, (cy - L.pad) * T * k, T * k + 0.5, T * k + 0.5);
    g.drawImage(L.front, 0, sy, sw, sh, 0, 0, c.width, c.height);
    mapThumbs.set(key, c);
  }
  return mapThumbs.get(key);
}
// The pop-up of the maps; the pick goes to apply(key).
function pickMap(apply) {
  const items = [...MAP_KEYS.map((key) => ({ key, label: MAPS[key].name, desc: MAPS[key].desc, thumb: mapThumbs.get(key), maps: true })), { key: 'random', label: 'RANDOM', desc: 'A DIFFERENT ONE EVERY MATCH' }];
  openPicker('pk-map', 'MAP', items, settings.map, apply);
  picker.maps = true;
}
function setMap(key) {
  settings.map = key;
  saveSettings();
  loadMap(key === 'random' ? 'lab' : key);
  makeFighters();
  startRound();
  round = 0;
  state = 'title';
  banner = null;
}

// Step a setting one way or the other.
function changeSetting(i, dir) {
  const [k, , vals] = OPTIONS[i];
  if (!vals.length) return openBans(k);   // (a list: A / D opens it)
  const at = vals.findIndex(([v]) => v === settings[k]);
  settings[k] = vals[(at + dir + vals.length) % vals.length][0];
  saveSettings();
  if (k === 'mode' && MODES[settings.mode]?.maps) settings.map = MODES[settings.mode].maps[0];   // (each mode: to the map it plays best on)
  if (k === 'map' || k === 'mode') loadMap(settings.map === 'random' ? 'lab' : settings.map);   // the backdrop shows the map picked
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
  if (c === 'pick:map') return pickMap(setMap);
  if (c?.startsWith('ban:')) return openBans(c.slice(4));
  if (c?.startsWith('pick:')) return pickSkillSetting(c.slice(5));
  if (c === 'start' || input.wasPressed('Enter') || (menuSel === OPTIONS.length && input.wasPressed('Space'))) return startMatch();
  if (c === 'back' || input.wasPressed('Escape')) state = 'menu';   // back to the main menu
}

// The match over: who won, everyone's rounds and kills, what next.
function drawMatch(ctx, u, W, H) {
  kit.shade(0.74);
  const c = champion, rows = [...new Set([...game.fighters, ...(game.leftMatch ?? [])])].filter((f) => !f.isDecoy).sort((a, b) => b.wins - a.wins || b.kills - a.kills);
  const pw = Math.min(W - 16 * u, 320 * u), rowH = 11 * u, ph = 26 * u + 24 * u + 12 * u + rows.length * rowH + 30 * u;
  const px = Math.round(W / 2 - pw / 2), py = Math.max(8 * u, Math.round(H / 2 - ph / 2));
  let y = kit.panel(px, py, pw, ph, { title: 'MATCH OVER' });
  const head = game.walkover ? 'VICTORY!' : teamMode() ? `${TEAMS[c.team].name} TEAM WINS` : c === player ? 'YOU WIN!' : `${c.name} WINS`;
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

// What you're doing to the dummies, a burst at a time: it starts with your first hit and it's over when you've stopped
// for STATS_GAP - DPS is the burst's damage over the burst's length (never less than a second), and it stays up to read
// when you stop, until you start again. PEAK: the most done in any one second. All on the wall clock, Sandevistan or not.
const STATS_GAP = 2.5;
const stats = {
  dps: 0, peak: 0, burst: 0, time: 0, hits: 0, heads: 0, last: 0, dist: 0, going: false, startT: 0, lastT: 0, recent: [], taken: [], takenDps: 0,
  now: () => performance.now() / 1000,
  record(dmg, kind, dist) {
    const now = this.now();
    if (!this.going) Object.assign(this, { going: true, startT: now, burst: 0, hits: 0, heads: 0, peak: 0, recent: [] });
    this.burst += dmg;
    this.hits++;
    if (kind === 'head') this.heads++;
    this.last = dmg;
    if (dist !== null) this.dist = dist;
    this.lastT = now;
    this.recent.push([now, dmg]);
  },
  hurt(dmg) { this.taken.push([this.now(), dmg]); },
  update() {
    const now = this.now();
    this.taken = this.taken.filter(([t]) => now - t < 2);
    this.takenDps = this.taken.reduce((n, [, d]) => n + d, 0) / 2;
    if (!this.going) return;
    if (now - this.lastT > STATS_GAP) { this.going = false; return; }
    this.time = Math.max(0, this.lastT - this.startT);
    this.dps = this.burst / Math.max(1, now - this.startT < 1 ? 1 : this.time);
    this.recent = this.recent.filter(([t]) => now - t < 1);
    this.peak = Math.max(this.peak, this.recent.reduce((n, [, d]) => n + d, 0));
  },
  reset() { Object.assign(this, { dps: 0, peak: 0, burst: 0, time: 0, hits: 0, heads: 0, last: 0, dist: 0, going: false, startT: 0, lastT: 0, recent: [], taken: [], takenDps: 0 }); },
};

function startTraining() {
  loadMap('training');
  state = 'training';
  game.obj = null;   // (nothing of a match's mode in here)
  game.tags = [];
  stateT = 0;
  slow = 1;
  paused = false;
  banner = { text: 'TRAINING', sub: 'TAB: GUNS, SKILLS - ESC: OPTIONS - LIVE FIRE, FAR RIGHT', t: 2.4, color: '#8ff0ff' };
  locker = null;
  game.bullets = []; game.grenades = []; game.pickups = []; game.feed = []; game.blasts = []; game.thrown = []; game.numbers = []; game.arrows = []; game.voids = []; game.fists = []; game.galaxies = []; game.swordSets = []; game.punches = []; game.bursts = []; game.bats = []; game.bloods = []; game.fangs = [];
  stats.reset();
  player = new Fighter(game, images, ROSTER[0]);
  player.team = 0;
  player.immortal = trainCfg.immortal;
  player.reset(level.spawns[0].x, level.spawns[0].y);
  player.grenades = 3;
  // the dummies: a crash-test look, they never go down
  const dummies = level.dummies.map((d) => {
    const f = new Fighter(game, images, { name: 'DUMMY', color: '#e8c86a', hue: 30, sat: 0 });   // grey, like a crash-test dummy
    f.team = 9;
    f.reset((d.x + 0.5) * 16, d.y * 16);
    f.gun = null;
    f.tall = d.tall;
    f.give(pick(GUN_POOL), 0);   // something in its hands (it never fires it)
    f.slot = 2;
    f.grenades = 0;
    f.dummy = f.immortal = true;
    f.skill = pick(BOT_SKILLS.filter((k) => k !== 'steal'));   // (one to take, with the skill thief; it never uses it)
    f.name = skillName(f.skill);
    f.patrol = d.patrol ? d.patrol.map((c) => (c + 0.5) * 16) : null;
    f.quick0 = d.fast ? 1 : 0.6;
    if (d.shooter) {
      f.name = 'SHOOTER';
      f.shooter = d.shooter;
      f.fixedAim = d.aim ?? Math.PI;
      f.zone = d.zone.map((v) => v * T);
      f.give(d.gun ?? 'm4a1', 9999);
      f.gun.ammo = f.gun.magSize;
      f.facing = Math.cos(f.fixedAim) < 0 ? -1 : 1;
    }
    f.walk = 1;
    f.home0 = { x: f.x, y: f.y };
    return f;
  });
  game.fighters = [player, ...dummies];
  decoys = [];
  bots = [];
  // every crate and drum, to put it back a while after it's smashed
  game.racks = level.props.map((spec, i) => ({ spec, prop: game.props[i], t: 0 }));
}

// Training each frame: smashed crates come back, dummies heal up and the walking one walks.
const AT_EASE = 0.6;   // how far down (rad) a dummy points its gun
// What a shooter does. It starts up only with you in its bay. wall: fires at the same place, over and over, whoever's
// there. aim: fires short bursts at you, its hand not quite steady - and only with a clear line from the gun to all of
// you for a moment (behind cover, or just come out from it, it holds its fire, the gun lowered). Neither moves.
function shooterControl(f, dt) {
  const tgt = nearestTrainee(f.x, f.y, (t) => t.x >= f.zone[0] && t.x < f.zone[1]) ?? player;
  const w = f.gun, here = trainCfg.shooters && tgt.alive && tgt.x >= f.zone[0] && tgt.x < f.zone[1];
  if (w && w.ammo <= 0) w.ammo = w.magSize;   // (it never runs dry, and never stops to reload)
  f.shootT = (f.shootT ?? rand(0, 1)) + dt;
  const cyc = f.shootT % (f.shooter === 'wall' ? 1.1 : 1.7), on = here && cyc < (f.shooter === 'wall' ? 0.55 : 0.6);
  if (f.shooter === 'wall') return { ...IDLE, aim: f.fixedAim, fire: on };
  const tx = tgt.x, ty = tgt.y - 14, a0 = Math.atan2(ty - (f.y - 14), tx - f.x), gx = f.x + Math.cos(a0) * 16, gy = f.y - 14 + Math.sin(a0) * 16;
  const sees = here && !tgt.hidden && [-20, -14, -4].every((up) => game.los(gx, gy, tx, tgt.y + up));
  f.seenT = sees ? (f.seenT ?? 0) + dt : 0;
  if (!sees) return { ...IDLE, aim: tgt.x < f.x ? Math.PI - AT_EASE : AT_EASE };
  return { ...IDLE, aim: a0 + Math.sin(game.time * 2.3 + f.x) * 0.05, fire: on && f.seenT > 0.25 };
}
// A bot to practise on that moves and dodges and shoots back (you can't die here, and it can't either).
function toggleSparring() {
  if (bots.length) {
    game.fighters = game.fighters.filter((f) => !f.sparring);
    bots = [];
    return;
  }
  const f = new Fighter(game, images, { name: 'SPARRING', color: '#ff8a5a', hue: 200, sat: 1 });
  f.team = 8;
  f.bot = true;
  f.sparring = f.immortal = true;
  f.reset(player.x + (player.x < PW / 2 ? 160 : -160), player.y);
  f.give('m4a1', 900);
  f.slot = 2;
  f.skill = pick(BOT_SKILLS);   // (a skill, and it uses it)
  f.name = `SPARRING - ${skillName(f.skill)}`;
  game.fighters.push(f);
  bots = [new Bot(game, f, 0.7)];
}
function updateTraining(dt) {
  if (state !== 'training') return;
  stats.update();
  // everyone training (online, all of them): the room's settings on them; down, back in at their spawn
  for (const t of trainees()) {
    t.immortal = trainCfg.immortal;
    if (!t.alive) { if ((t.tDead = (t.tDead ?? 0) + dt) > 2) respawnTrainee(t); continue; }
    if (trainCfg.endless && t.gun && !t.gun.def.skillGun) { t.gun.ammo = t.gun.magSize; if (t.gun.reloading) t.gun.cancelReload(); }
    if (t.hurtT > 2.5) t.hp = Math.min(t.maxHp, t.hp + t.maxHp * dt);
    if (t.grenades < 1 && t.grenadeCD <= 0) t.grenades = 1;   // (endless grenades in here)
  }
  // the bots put in: killed, back where they were put a moment later (if they're to be)
  for (const f of game.fighters) if (f.tbot && !f.alive && f.tbot.death === 'back' && (f.tDead = (f.tDead ?? 0) + dt) > 3) {
    f.reset(f.home.x, f.home.y);
    f.immortal = f.tbot.death === 'never';
    f.give(pick(GUN_POOL), 900);
    f.slot = 2;
    f.tDead = 0;
    f.shield = 1;
    bots.find((b) => b.f === f)?.reset();
    game.fx.sparks(f.x, f.y - 14, 12, 0, -1, '#ff8a5a');
  }
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
    if (f.shooter) c = shooterControl(f, dt);
    else if (f.patrol) {
      if (f.x < f.patrol[0]) f.walk = 1;
      if (f.x > f.patrol[1]) f.walk = -1;
      c = { ...IDLE, move: f.walk * (f.quick0 ?? 0.6), aim: ease(f.walk) };
    } else { const t = nearestTrainee(f.x, f.y); c = { ...IDLE, aim: ease(!t ? f.facing : t.x < f.x ? -1 : 1) }; }   // (you cloaked: they don't see you come)
    f.update(dt, c);
  }
}

// ---------- training: the room (TAB) ----------
// The room's settings (the host's say, or an admin's: online they come to everyone with the game - see online.js),
// everyone training in it (you, and online the others), the bots put in it, where each comes back in, where to go.
const trainCfg = { immortal: true, endless: false, cooldowns: false, shooters: true, pvp: true };
const isTrainee = (f) => !!f && !f.dummy && !f.bot && !f.isDecoy && (f === player || !!f.peer);
const trainees = () => game.fighters.filter(isTrainee);
// (nearest of those training to (x, y), alive - for the dummies to look at, the shooters to shoot at)
const nearestTrainee = (x, y, ok = () => true) => trainees().filter((t) => t.alive && !t.hidden && ok(t)).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0] ?? null;
// the places to go straight to (TAB, SPAWN): [name, cell column, floor row] - the map's own list
const trainAreas = () => (MAPS.training.areas ?? []).map(([name, cx, floor]) => ({ name, x: (cx + 0.5) * T, y: (floor + (level.pad ?? 0)) * T }));
const defaultSpawn = () => level.spawns[0];
function teleport(f, at) {
  if (!f?.alive || !at) return;
  f.x = at.x;
  f.y = at.y;
  f.vx = f.vy = 0;
  f.onLadder = false;
  f.hook = null;
  while (f.hits(f.x - 5, f.y - 28, f.x + 5, f.y)) f.y -= 1;
  game.fx.sparks(f.x, f.y - 14, 12, 0, -1, '#8ff0ff');
  game.lights.flash(f.x, f.y - 14, 80, '120, 230, 255', 0.2);
}
// Someone training back in after going down: at their own spawn if they've saved one, otherwise where everyone starts.
function respawnTrainee(f) {
  const s = f.saveSpawn ?? defaultSpawn();
  f.reset(s.x, s.y);
  f.immortal = trainCfg.immortal;
  f.grenades = 3;
  f.shield = 1;
  f.beamT = 0;
  f.tDead = 0;
  while (f.hits(f.x - 5, f.y - 28, f.x + 5, f.y)) f.y -= 1;
  game.fx.sparks(f.x, f.y - 14, 16, 0, -1, '#8ff0ff');
}

// ---- the bots ----
// Each put in with how it's to be: FIGHTS (a bot) or STANDS STILL; its shots and blows hurt, or don't; killed, it
// comes back where it was put, stays dead, or can't die at all; a skill of its own, or none.
const BOT_OPTS = { fight: [[true, 'FIGHTS'], [false, 'STANDS STILL']], dmg: [[true, 'ON'], [false, 'OFF']], death: [['back', 'COMES BACK'], ['stay', 'STAYS DEAD'], ['never', "CAN'T DIE"]], skill: [[true, 'RANDOM'], [false, 'NONE']] };
const trainBotOpts = { fight: true, dmg: true, death: 'back', skill: true };
let trainBotN = 0;
function spawnTrainBot(o, by) {
  if (game.fighters.filter((f) => f.tbot).length >= 12) return;
  const n = ++trainBotN, f = new Fighter(game, images, { name: `BOT ${n}`, color: '#ff8a5a', hue: (n * 53) % 360, sat: 1.2 });
  const ox = by ? by.x + (by.facing || 1) * 48 : defaultSpawn().x, oy = by ? by.y : defaultSpawn().y;
  const at = by && !level.solidAt(ox, oy - 14) ? { x: ox, y: oy } : { x: by?.x ?? ox, y: by?.y ?? oy };
  f.team = 200 + n;
  f.bot = true;
  f.tbot = { fight: !!o.fight, dmg: !!o.dmg, death: ['back', 'stay', 'never'].includes(o.death) ? o.death : 'back', skill: !!o.skill, n };
  f.home = at;
  f.reset(at.x, at.y);
  while (f.hits(f.x - 5, f.y - 28, f.x + 5, f.y)) f.y -= 1;
  f.immortal = f.tbot.death === 'never';
  f.noDmg = !f.tbot.dmg;
  f.still = !f.tbot.fight;
  f.give(pick(GUN_POOL), 900);
  f.slot = 2;
  f.skill = f.tbot.skill ? pick(BOT_SKILLS) : null;
  f.name = `BOT ${n}${f.skill ? ' - ' + skillName(f.skill) : ''}`;
  f.facing = by ? -(by.facing || 1) : -1;
  game.fighters.push(f);
  bots.push(new Bot(game, f, 0.85));
  game.fx.sparks(f.x, f.y - 14, 14, 0, -1, '#ff8a5a');
}
function removeTrainBots(pred) {
  const gone = new Set(game.fighters.filter((f) => f.tbot && pred(f)));
  for (const f of gone) game.fx.mist(f.x, f.y - 12, 10);
  game.fighters = game.fighters.filter((f) => !gone.has(f));
  bots = bots.filter((b) => !gone.has(b.f));
}
// the range as it started: every crate and drum back, the dummies where they stood, healed
function resetRange() {
  for (const r of game.racks) if (r.prop.dead || !game.props.includes(r.prop)) { [r.prop] = placeProps([r.spec], level); r.t = 0; game.props.push(r.prop); }
  for (const f of game.fighters) if (f.dummy) { f.hp = f.maxHp; if (f.home0) { f.x = f.home0.x; f.y = f.home0.y; } }
}

// ---- who may do what, and doing it ----
// (offline it's all yours; online the host's ROOT, admins may change the settings and the bots, kick players; ROOT
// alone makes admins and a new code)
const myRole = () => (online.training ? online.myRole : 'root');
const isAdmin = (role) => role === 'root' || role === 'admin';
// Something done from the room panel: here if it's our game, sent to the host if not.
function trainDo(m) {
  if (online.isClient) online.sendAct(m);
  else trainAct(player, { id: online.me?.(), role: 'root' }, m);
}
function trainAct(f, member, m) {
  const role = member?.role ?? 'player', admin = isAdmin(role);
  switch (m?.a) {
    case 'set': if (admin && m.k in trainCfg) { trainCfg[m.k] = !!m.v; if (m.k === 'cooldowns') for (const t of trainees()) t.skillCD = 0; } break;
    case 'bot': if (admin && f) spawnTrainBot(m.o ?? {}, f); break;
    case 'unbot': if (admin) removeTrainBots((b) => b.tbot.n === m.n); break;   // (by the bot's own number: there's no net id offline)
    case 'unbots': if (admin) removeTrainBots(() => true); break;
    case 'reset': if (admin) resetRange(); break;
    case 'spsave': if (f?.alive && f.onGround) { f.saveSpawn = { x: f.x, y: f.y }; game.fx.sparks(f.x, f.y - 2, 10, 0, -1, '#8aff9a'); } break;
    case 'spclear': if (f) f.saveSpawn = null; break;
    case 'spgo': teleport(f, f?.saveSpawn ?? defaultSpawn()); break;
    case 'area': teleport(f, trainAreas()[m.i]); break;
    case 'goto': { const o = game.fighters.find((q) => q.nid === m.nid && q.alive); if (o && o !== f) teleport(f, { x: o.x - (o.facing || 1) * 16, y: o.y }); break; }
    case 'die': if (f?.alive) f.die(null, 'RESET', 0, 0); break;
    case 'kick': if (online.isHost && m.id !== member?.id && (role === 'root' || (admin && online.roleOf(m.id) === 'player'))) online.trainKick(m.id); break;
    case 'role': if (online.isHost && role === 'root') online.setRole(m.id, m.role); break;
    case 'code': if (online.isHost && role === 'root') online.renewCode(); break;
  }
}
// (the host) an armory item for a player in the room
function trainTake(f, kind, key) {
  if (kind === 'cooldown') return trainAct(f, { role: online.roleOf(f.peer) }, { a: 'set', k: 'cooldowns', v: !trainCfg.cooldowns });
  const it = LOCKERS.all.tabs().filter((t) => !t.custom).flatMap((t) => t.items).find((q) => q.kind === kind && (q.key ?? null) === (key ?? null));
  if (it) takeItem(it, f);
}
// (the host) someone in with the room's code: a fighter of their own, at the way in
const TRAIN_LOOKS = ROSTER.map(({ color, hue, sat }) => ({ color, hue, sat }));
function trainJoin({ id, name, skill, i }) {
  const f = new Fighter(game, images, { name, ...TRAIN_LOOKS[(i ?? 1) % TRAIN_LOOKS.length] });
  f.peer = id;
  f.team = 100 + (i ?? 1);
  const s = defaultSpawn();
  f.reset(s.x + ((i ?? 1) % 4) * 14, s.y);
  f.immortal = trainCfg.immortal;
  f.grenades = 3;
  f.skill = SKILL_INFO.some((k) => k.key === skill) ? skill : null;
  game.fighters.push(f);
  return f;
}

// ---- the panel: the room's tabs in the armory (TAB) ----
let trainEdit = null;   // the code being typed in: { draft }
let trainServer = 0;    // which server a room's opened on
let trainSure = null;   // a drastic button pressed once: { id, at } - a second press within 2.5 s does it
const sureOf = (id) => { if (trainSure?.id === id && performance.now() - trainSure.at < 2500) { trainSure = null; return true; } trainSure = { id, at: performance.now() }; return false; };
const asked = (id) => trainSure?.id === id && performance.now() - trainSure.at < 2500;
const TRAIN_TABS = [{ label: 'ROOM', custom: 'room', items: [] }, { label: 'SETTINGS', custom: 'cfg', items: [] }, { label: 'PLAYERS', custom: 'players', items: [] }, { label: 'BOTS', custom: 'bots', items: [] }, { label: 'SPAWN', custom: 'spawn', items: [] }];
// typing the code: letters and numbers, BACKSPACE, ENTER joins, ESC stops
function trainTyping() {
  for (const code of input.pressed) {
    if (code === 'Enter') { const v = trainEdit.draft; trainEdit = null; online.joinTrainRoom(v); return; }
    if (code === 'Escape') { trainEdit = null; return; }
    if (code === 'Backspace') trainEdit.draft = trainEdit.draft.slice(0, -1);
    else if (trainEdit.draft.length < 5 && code.startsWith('Key')) trainEdit.draft += code.slice(3);
    else if (trainEdit.draft.length < 5 && code.startsWith('Digit')) trainEdit.draft += code.slice(5);
  }
}
// The clicks on a room tab (the ids its drawing gave its buttons)
function trainTabInput(kind) {
  const c = kit.click;
  if (!c?.startsWith('tm:')) return;
  const [, what, arg, arg2] = c.split(':');
  const admin = isAdmin(myRole());
  if (what === 'code') {
    trainEdit = { draft: '' };
    if (input.touchOn) {
      const v = prompt('ROOM CODE', '');
      trainEdit = null;
      touch?.clear();   // (the finger's lift went to the box, not to us: nothing's held now)
      if (v) online.joinTrainRoom(v);
    }
    return;
  }
  if (what === 'join') { const v = trainEdit?.draft ?? ''; trainEdit = null; online.joinTrainRoom(v); return; }
  if (what === 'srv') { const n = online.servers.length; trainServer = (trainServer + +arg + n) % n; return; }
  if (what === 'open') return online.openTrainRoom(online.servers[trainServer].key);
  if (what === 'leave') { if (!online.isHost || sureOf(c)) online.leaveTrain(); return; }
  if (what === 'copy') { try { navigator.clipboard?.writeText(online.trainCode); banner = { text: 'CODE COPIED', t: 1, color: '#8aff9a' }; } catch {} return; }
  if (what === 'newcode') return trainDo({ a: 'code' });
  if (what === 'set' && admin) return trainDo({ a: 'set', k: arg, v: !trainCfg[arg] });
  if (what === 'reset' && admin) return trainDo({ a: 'reset' });
  if (what === 'dps') return stats.reset();
  if (what === 'opt') { const vals = BOT_OPTS[arg], i = vals.findIndex(([v]) => v === trainBotOpts[arg]); trainBotOpts[arg] = vals[(i + 1) % vals.length][0]; return; }
  if (what === 'addbot' && admin) return trainDo({ a: 'bot', o: { ...trainBotOpts } });
  if (what === 'rmbot' && admin) return trainDo({ a: 'unbot', n: +arg });
  if (what === 'rmbots' && admin) { if (sureOf(c)) trainDo({ a: 'unbots' }); return; }
  if (what === 'kick') { if (sureOf(c)) trainDo({ a: 'kick', id: arg }); return; }
  if (what === 'role') return trainDo({ a: 'role', id: arg, role: arg2 });
  if (what === 'goto') return trainDo({ a: 'goto', nid: +arg });
  if (['spsave', 'spclear', 'spgo'].includes(what)) return trainDo({ a: what });
  if (what === 'area') return trainDo({ a: 'area', i: +arg });
}
// One room tab's contents, in the armory's panel: (x, y) its top left, w, h, in the panel's units (u to the pixel).
function drawTrainTab(kind, ctx, u, x, y, w, h) {
  const px = (X, Y, W, H, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(X * u), Math.round(Y * u), Math.round(W * u), Math.round(H * u)); };
  const text = (t, X, Y, col, size = 1) => drawText(ctx, String(t), Math.round(X * u), Math.round(Y * u), u * size, col);
  const btn = (id, X, Y, W, H, label, o = {}) => kit.button(id, Math.round(X * u), Math.round(Y * u), Math.round(W * u), Math.round(H * u), label, { small: true, ...o });
  const admin = isAdmin(myRole()), inRoom = online.training, me = player;
  const note = (t, X, Y, col = '#6f7a62') => text(t, X, Y, col);
  const head = (t, X, Y) => { text(t, X, Y, '#ffd25a'); px(X, Y + 8, w - (X - x), 1, '#2a322f'); };
  const busy = online.busyText, toast = online.toast;
  if (kind === 'room') {
    if (!inRoom) {
      const cw = Math.floor((w - 8) / 2);
      head('OPEN YOUR OWN ROOM', x, y);
      note('OTHERS COME IN WITH ITS CODE', x, y + 13);
      const sv = online.servers[trainServer];
      btn('tm:srv:-1', x, y + 26, 14, 14, '<');
      text(sv.name, x + 20, y + 30, '#e8ecd8');
      btn('tm:srv:1', x + cw - 14, y + 26, 14, 14, '>');
      btn('tm:open', x, y + 46, cw, 18, busy && !trainEdit ? 'WAIT...' : 'OPEN A ROOM', { kind: 'primary', disabled: !!busy });
      const jx = x + cw + 8;
      text('JOIN SOMEONE\'S ROOM', jx, y, '#ffd25a');
      note('TYPE IN THEIR CODE', jx, y + 13);
      const editing = !!trainEdit, shown = editing ? trainEdit.draft + (Math.floor(performance.now() / 400) % 2 ? '_' : '') : 'CLICK TO TYPE';
      px(jx - 1, y + 25, cw + 2, 18, editing ? '#c9a83a' : '#2a322f');
      px(jx, y + 26, cw, 16, '#0b100e');
      text(shown, jx + 6, y + 30, editing ? '#ffffff' : '#6f7a62', editing ? 1 : 1);
      kit.hit('tm:code', Math.round(jx * u), Math.round((y + 25) * u), Math.round(cw * u), Math.round(18 * u));
      btn('tm:join', jx, y + 46, cw, 18, 'JOIN', { kind: 'primary', disabled: !!busy || !trainEdit || trainEdit.draft.length < 5 });
      if (busy || toast) text(busy || toast, x, y + 74, busy ? '#8ff0ff' : '#ffb84a');
      note('A CODE IS 5 LETTERS AND NUMBERS - THE FIRST IS THE SERVER', x, y + 90);
      note('IN A ROOM: SETTINGS, PLAYERS AND BOTS ARE THE ROOM\'S', x, y + 100);
      return;
    }
    head(online.isHost ? 'YOUR ROOM IS OPEN' : 'IN A ROOM', x, y);
    note('THE CODE - GIVE IT TO WHOEVER YOU WANT IN', x, y + 13);
    const code = online.trainCode;
    text(code, x, y + 26, '#8aff9a', 3);
    const cx = x + textWidth(code) * 3 + 10;
    btn('tm:copy', cx, y + 27, 50, 16, 'COPY');
    if (online.isHost && myRole() === 'root') btn('tm:newcode', cx + 56, y + 27, 70, 16, 'NEW CODE');
    note(`${online.trainMembers.length} IN THE ROOM  -  YOU ARE ${myRole() === 'root' ? 'ROOT' : myRole() === 'admin' ? 'AN ADMIN' : 'A PLAYER'}`, x, y + 52, '#c8cfc9');
    btn('tm:leave', x, y + 66, 140, 18, online.isHost ? (asked('tm:leave') ? 'SURE? CLOSE IT' : 'CLOSE THE ROOM') : 'LEAVE THE ROOM', { kind: 'danger' });
    if (toast) text(toast, x, y + 92, '#ffb84a');
    return;
  }
  if (kind === 'cfg') {
    head('THE ROOM\'S SETTINGS', x, y);
    note(admin ? (inRoom ? 'FOR EVERYONE IN THE ROOM' : 'CLICK TO CHANGE') : 'ONLY ROOT AND ADMINS CAN CHANGE THESE', x, y + 13);
    const rows = [['immortal', 'PLAYERS CAN\'T DIE', 'OFF: YOU GO DOWN, AND COME BACK AT YOUR SPAWN'], ['endless', 'ENDLESS MAG', 'NEVER RELOAD'], ['cooldowns', 'SKILL WAIT', 'OFF: USE A SKILL AS OFTEN AS YOU LIKE'], ['shooters', 'LIVE FIRE', 'THE SHOOTERS IN THE BAYS FIRE BACK'], ['pvp', 'PLAYERS HURT EACH OTHER', 'OFF: SHOTS AT EACH OTHER DO NOTHING']];
    rows.forEach(([k, label, desc], i) => {
      const ry = y + 26 + i * 20;
      text(label, x, ry + 2, '#e8ecd8');
      note(desc, x, ry + 11);
      btn(`tm:set:${k}`, x + w - 60, ry, 60, 16, trainCfg[k] ? 'ON' : 'OFF', { kind: trainCfg[k] ? 'primary' : 'normal', disabled: !admin });
    });
    const by = y + 26 + rows.length * 20 + 4;
    btn('tm:reset', x, by, 130, 16, 'RESET THE RANGE', { disabled: !admin });
    btn('tm:dps', x + 136, by, 110, 16, 'CLEAR THE DPS');
    return;
  }
  if (kind === 'players') {
    head('WHO\'S IN THE ROOM', x, y);
    if (!inRoom) { note('JUST YOU - OPEN A ROOM (ROOM TAB) TO TRAIN WITH OTHERS', x, y + 14, '#c8cfc9'); return; }
    online.trainMembers.slice(0, 8).forEach((m, i) => {
      const ry = y + 14 + i * 18, f = game.fighters.find((o) => o.peer === m.id), mine = m.id === online.me();
      const badge = m.role === 'root' ? ['ROOT', '#ffd25a'] : m.role === 'admin' ? ['ADMIN', '#8ff0ff'] : ['PLAYER', '#6f7a62'];
      px(x, ry, w, 16, mine ? '#1f2a22' : '#161b17');
      text(badge[0], x + 4, ry + 5, badge[1]);
      text(m.name + (mine ? ' (YOU)' : ''), x + 44, ry + 5, '#e8ecd8');
      let bx = x + w - 2;
      const b = (id, label, bw, o) => { bx -= bw + 3; btn(id, bx, ry + 1, bw, 14, label, o); };
      if (!mine && f) b(`tm:goto:${f.nid}`, 'GO TO', 44);
      if (!mine && m.role !== 'root' && (myRole() === 'root' || (myRole() === 'admin' && m.role === 'player'))) b(`tm:kick:${m.id}`, asked(`tm:kick:${m.id}`) ? 'SURE?' : 'KICK', 44, { kind: 'danger' });
      if (!mine && m.role !== 'root' && myRole() === 'root') b(`tm:role:${m.id}:${m.role === 'admin' ? 'player' : 'admin'}`, m.role === 'admin' ? 'NO ADMIN' : 'MAKE ADMIN', 70);
    });
    return;
  }
  if (kind === 'bots') {
    head('BOTS', x, y);
    note(admin ? 'SET HOW IT IS, THEN ADD IT - IT COMES IN IN FRONT OF YOU' : 'ONLY ROOT AND ADMINS CAN ADD AND REMOVE BOTS', x, y + 13);
    const opts = [['fight', 'MOVES'], ['dmg', 'DAMAGE'], ['death', 'KILLED'], ['skill', 'SKILL']], ow = Math.floor((w - 9) / 4);
    opts.forEach(([k, label], i) => {
      const ox = x + i * (ow + 3);
      note(label, ox, y + 25);
      btn(`tm:opt:${k}`, ox, y + 34, ow, 16, BOT_OPTS[k].find(([v]) => v === trainBotOpts[k])?.[1] ?? '?', { disabled: !admin });
    });
    btn('tm:addbot', x, y + 56, 120, 18, 'ADD A BOT', { kind: 'primary', disabled: !admin });
    btn('tm:rmbots', x + 126, y + 56, 110, 18, asked('tm:rmbots') ? 'SURE?' : 'REMOVE ALL', { kind: 'danger', disabled: !admin });
    const list = game.fighters.filter((f) => f.tbot);
    if (!list.length) note('NONE YET', x, y + 82);
    list.slice(0, 6).forEach((f, i) => {
      const col = i % 2, row = Math.floor(i / 2), bw = Math.floor((w - 4) / 2), bx = x + col * (bw + 4), ry = y + 80 + row * 18, o = f.tbot ?? {};
      px(bx, ry, bw, 16, '#161b17');
      text(f.alive ? 'UP' : 'DOWN', bx + 3, ry + 5, f.alive ? '#8aff9a' : '#a04a3a');
      let nm = `BOT ${o.n ?? ''} ${o.fight ? '' : 'STILL '}${o.dmg ? '' : 'NO DMG '}${o.death === 'never' ? "CAN'T DIE" : o.death === 'stay' ? 'STAYS DEAD' : ''}`;
      while (textWidth(nm) > bw - 70) nm = nm.slice(0, -1);
      text(nm, bx + 28, ry + 5, '#e8ecd8');
      btn(`tm:rmbot:${o.n ?? 0}`, bx + bw - 40, ry + 1, 38, 14, 'X', { kind: 'danger', disabled: !admin });
    });
    if (list.length > 6) note(`AND ${list.length - 6} MORE`, x, y + 80 + 3 * 18);
    return;
  }
  if (kind === 'spawn') {
    head('WHERE YOU COME BACK IN', x, y);
    note(me?.saveSpawn ? 'YOUR OWN SPAWN IS SAVED' : 'WHERE EVERYONE STARTS (NONE SAVED)', x, y + 13, me?.saveSpawn ? '#8aff9a' : '#6f7a62');
    btn('tm:spsave', x, y + 25, 130, 16, 'SAVE SPAWN HERE', { kind: 'primary', disabled: !me?.alive || !me.onGround });
    btn('tm:spgo', x + 136, y + 25, 110, 16, 'GO TO MY SPAWN');
    btn('tm:spclear', x + 252, y + 25, Math.min(110, w - 252), 16, 'FORGET IT', { disabled: !me?.saveSpawn });
    head('GO STRAIGHT TO', x, y + 50);
    const areas = trainAreas(), cols = 3, aw = Math.floor((w - (cols - 1) * 3) / cols);
    areas.forEach((a, i) => btn(`tm:area:${i}`, x + (i % cols) * (aw + 3), y + 63 + Math.floor(i / cols) * 18, aw, 16, a.name));
  }
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
const BOW_ICON = sprite(14, 14, (g) => {
  // a bow of green light, seen side on, its string drawn back and an arrow on it, pointing up and to the right
  const ink = '#06180c', limb = '#2ad05a', hi = '#a8ffb8';
  for (const [c, cells] of [[ink, [[2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 2], [8, 3], [9, 4], [9, 5], [10, 6], [10, 7], [10, 8], [10, 9], [11, 10], [11, 11]]], [limb, [[1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 3], [8, 4], [8, 5], [9, 6], [9, 7], [9, 8], [9, 9], [10, 10], [10, 11]]], [hi, [[3, 2], [4, 2], [7, 3], [8, 4], [9, 7]]]]) for (const [x, y] of cells) rect(g, c, x, y, 1, 1);
  // the string: from the top tip back to the hand and down to the bottom tip
  for (let i = 0; i < 5; i++) { rect(g, '#d8ffe0', 1 + i, 3 + i, 1, 1); rect(g, '#d8ffe0', 5 + i, 8 + Math.round(i * 0.7), 1, 1); }
  // the arrow, from the hand out past the bow, white
  for (let i = 0; i < 8; i++) rect(g, i > 5 ? '#ffffff' : '#7aff9a', 4 + i, 8 - i, 1, 1);
  rect(g, '#ffffff', 10, 0, 3, 1); rect(g, '#ffffff', 12, 0, 1, 3); rect(g, '#7aff9a', 11, 1, 1, 1);
  rect(g, '#2ad05a', 2, 8, 2, 1); rect(g, '#2ad05a', 3, 9, 1, 2);   // (the flights)
});
const VOID_ICON = sprite(15, 13, (g) => {
  // red from one side and blue from the other, meeting and going to a great purple orb with a white-hot heart
  const dot = (x, y, c) => rect(g, c, x, y, 1, 1);
  for (let j = 0; j < 13; j++) for (let i = 0; i < 15; i++) {
    const d = Math.hypot(i - 7, j - 6.5);
    if (d <= 5.6) dot(i, j, d > 4.7 ? '#3a0a6a' : d > 3.8 ? '#8a30e0' : d > 2.4 ? '#c070ff' : d > 1.2 ? '#f0d8ff' : '#ffffff');
  }
  // the streams going in
  for (const [c, cells] of [['#ff3a4a', [[0, 2], [1, 2], [1, 3], [2, 3], [3, 4]]], ['#ffb0b8', [[0, 1], [2, 2], [3, 3]]], ['#3a9aff', [[14, 10], [13, 10], [13, 9], [12, 9], [11, 8]]], ['#b8e0ff', [[14, 11], [12, 10], [11, 9]]]]) for (const [x, y] of cells) dot(x, y, c);
  // a band of it going round
  for (const [x, y] of [[3, 7], [4, 8], [5, 9], [6, 9]]) dot(x, y, '#ff8ac8');
  for (const [x, y] of [[11, 6], [10, 5], [9, 4], [8, 4]]) dot(x, y, '#8ac8ff');
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
const SWORDS_ICON = sprite(11, 12, (g) => {
  // three blades of light, in a fan, pointing up
  for (const [c, x, y, w, h] of [
    ['#43a6ff', 0, 3, 2, 5], ['#d6f6ff', 1, 2, 1, 5], ['#43a6ff', 9, 3, 2, 5], ['#d6f6ff', 9, 2, 1, 5],
    ['#43a6ff', 4, 1, 3, 7], ['#8fe0ff', 4, 2, 3, 6], ['#ffffff', 5, 0, 1, 8],
    ['#d6f6ff', 3, 8, 5, 1], ['#ffffff', 5, 8, 1, 1], ['#1f62dc', 5, 9, 1, 2], ['#d6f6ff', 5, 11, 1, 1],
  ]) rect(g, c, x, y, w, h);
});
const LOCK_ICON = sprite(11, 11, (g) => {
  // a sight: a ring broken at the four points, brackets of red in it, a dot at the heart
  for (let j = 0; j < 11; j++) for (let i = 0; i < 11; i++) { const d = Math.hypot(i - 5, j - 5); if (d > 3.9 && d < 5.1 && i !== 5 && j !== 5) rect(g, '#8fe8ff', i, j, 1, 1); }
  for (const [c, x, y, w, h] of [['#ff4a55', 5, 0, 1, 3], ['#ff4a55', 5, 8, 1, 3], ['#ff4a55', 0, 5, 3, 1], ['#ff4a55', 8, 5, 3, 1], ['#ffffff', 5, 5, 1, 1]]) rect(g, c, x, y, w, h);
});
const SHIELD_ICON = sprite(11, 12, (g) => {
  // a shield of blue plates
  for (const [c, x, y, w, h] of [['#2a8cff', 1, 1, 9, 6], ['#2a8cff', 2, 7, 7, 2], ['#2a8cff', 3, 9, 5, 1], ['#2a8cff', 4, 10, 3, 1], ['#2a8cff', 5, 11, 1, 1], ['#c8f4ff', 1, 0, 9, 1], ['#6ad8ff', 2, 2, 3, 3], ['#6ad8ff', 6, 2, 3, 3], ['#6ad8ff', 4, 6, 3, 3], ['#ffffff', 5, 1, 1, 9]]) rect(g, c, x, y, w, h);
});
const CARDS_ICON = sprite(12, 12, (g) => {
  // two cards, fanned: the back of one, the face of the other
  for (const [c, x, y, w, h] of [['#d8b860', 0, 2, 7, 10], ['#1a1430', 1, 3, 5, 8], ['#d8b860', 3, 6, 1, 2], ['#ece6d4', 5, 0, 7, 10], ['#7a1410', 6, 1, 5, 8], ['#ff5a48', 7, 3, 3, 3], ['#ffd25a', 8, 2, 1, 3], ['#ffffff', 8, 5, 1, 1]]) rect(g, c, x, y, w, h);
});
const HACK_ICON = sprite(11, 11, (g) => {
  // a broken lock in code
  for (const [c, x, y, w, h] of [['#3aff8a', 2, 5, 7, 6], ['#08120c', 4, 7, 3, 2], ['#3aff8a', 3, 1, 1, 4], ['#3aff8a', 3, 0, 4, 1], ['#3aff8a', 7, 1, 1, 2], ['#b8ffd8', 0, 3, 1, 2], ['#b8ffd8', 10, 5, 1, 2], ['#ff3a55', 9, 1, 1, 2], ['#ff3a55', 1, 8, 1, 1]]) rect(g, c, x, y, w, h);
});
const SANDE_ICON = sprite(11, 12, (g) => {
  // the spine: a column of bright vertebrae, wings of after-image off them
  for (let i = 0; i < 5; i++) {
    const y = 1 + i * 2;
    rect(g, '#ffffff', 5, y, 1, 1);
    rect(g, '#7affc8', 3, y, 2, 1); rect(g, '#7affc8', 6, y, 2, 1);
    rect(g, i % 2 ? '#ff5ac8' : '#5af0ff', 1, y, 2, 1); rect(g, i % 2 ? '#ff5ac8' : '#5af0ff', 8, y, 2, 1);
  }
  rect(g, '#7affc8', 5, 0, 1, 12);
});
const VAMPIRE_ICON = sprite(13, 10, (g) => {
  // a bat, wings spread, red eyes, a drop of blood under it
  for (const [c, x, y, w, h] of [['#1a0610', 5, 1, 3, 5], ['#1a0610', 5, 0, 1, 1], ['#1a0610', 7, 0, 1, 1], ['#1a0610', 1, 2, 4, 2], ['#1a0610', 8, 2, 4, 2], ['#c01a30', 0, 1, 2, 1], ['#c01a30', 11, 1, 2, 1], ['#c01a30', 0, 3, 1, 2], ['#c01a30', 12, 3, 1, 2], ['#1a0610', 2, 4, 3, 1], ['#1a0610', 8, 4, 3, 1], ['#ff5a6a', 5, 2, 1, 1], ['#ff5a6a', 7, 2, 1, 1], ['#ff3a4a', 6, 7, 1, 2], ['#ff8a96', 6, 7, 1, 1], ['#b01828', 5, 8, 3, 2]]) rect(g, c, x, y, w, h);
});
const DEFLECT_ICON = sprite(12, 12, (g) => {
  // a katana on the slant, a bright arc swept round in front of it
  for (let i = 0; i < 9; i++) { rect(g, '#ffffff', 3 + i, 8 - i, 1, 1); rect(g, '#c8d8e0', 3 + i, 9 - i, 1, 1); }
  rect(g, '#7affd0', 1, 8, 3, 3); rect(g, '#101418', 0, 10, 2, 2); rect(g, '#1a4a40', 2, 9, 1, 1);
  for (let i = 0; i <= 8; i++) { const a = -0.3 + i * 0.26; rect(g, i % 3 ? '#3ae8a0' : '#c8ffe8', Math.round(4 + Math.cos(a) * 7), Math.round(4 + Math.sin(a) * 7), 1, 1); }
});
const CHIDORI_ICON = sprite(13, 11, (g) => {
  // a white-hot knot, forks of lightning cracking out of it
  for (const [x, y] of [[6, 2], [5, 1], [4, 0], [7, 1], [8, 0], [2, 4], [1, 3], [0, 4], [10, 4], [11, 3], [12, 2], [3, 7], [2, 8], [1, 9], [9, 7], [10, 8], [11, 9], [12, 10], [6, 8], [6, 9], [5, 10]]) rect(g, '#4a9aff', x, y, 1, 1);
  for (const [x, y] of [[5, 4], [7, 4], [4, 5], [8, 5], [5, 6], [7, 6], [3, 4], [9, 4]]) rect(g, '#9fe6ff', x, y, 1, 1);
  rect(g, '#ffffff', 5, 5, 3, 1); rect(g, '#ffffff', 6, 4, 1, 3);
});
const OCTO_ICON = sprite(13, 12, (g) => {
  // a steel arm curling up out of the corner, a claw at the end with a red eye
  for (const [x, y] of [[1, 11], [2, 10], [2, 9], [3, 8], [4, 7], [5, 6], [6, 5], [7, 5], [8, 4], [9, 4]]) { rect(g, '#0d1014', x - 1, y, 3, 2); rect(g, '#6a7480', x, y, 1, 1); }
  for (const [x, y] of [[10, 2], [11, 1], [12, 3], [11, 5], [12, 6]]) rect(g, '#9aa6b4', x, y, 1, 1);
  rect(g, '#ff3a2a', 10, 4, 1, 1);
});
const STEAL_ICON = sprite(12, 12, (g) => {
  // a hexagon of light, a hand's hook of a line pulling out of it
  for (const [x, y] of [[4, 1], [5, 1], [6, 1], [7, 1], [3, 2], [8, 2], [2, 3], [9, 3], [2, 4], [9, 4], [3, 5], [8, 5], [4, 6], [5, 6], [6, 6], [7, 6]]) rect(g, '#c05aff', x, y, 1, 1);
  rect(g, '#ff6ad8', 5, 3, 2, 2); rect(g, '#ffe8ff', 5, 3, 1, 1);
  for (const [x, y] of [[6, 7], [6, 8], [5, 9], [4, 10], [3, 10], [2, 9]]) rect(g, '#6af0ff', x, y, 1, 1);
});
const JUMPER_ICON = sprite(13, 12, (g) => {
  // two tears in the air, a dotted path of violet between them
  for (const [cx] of [[2], [10]]) for (let y = 1; y <= 10; y++) { const w = y < 3 || y > 8 ? 0 : 1; rect(g, '#0b0418', cx - w, y, w * 2 + 1, 1); rect(g, '#a05aff', cx - w - 1, y, 1, 1); rect(g, '#ff9af0', cx + w + 1, y, 1, 1); }
  for (const [x, y] of [[4, 6], [6, 5], [8, 6]]) rect(g, '#d0a8ff', x, y, 1, 1);
});
const FANG_ICON = sprite(13, 12, (g) => {
  // three gold daggers fanned out from the one hand
  for (const [dx, dy] of [[0.72, -0.72], [0.93, -0.36], [0.36, -0.93]]) for (let i = 0; i < 11; i++) {
    const x = Math.round(1 + dx * i), y = Math.round(10 + dy * i);
    rect(g, i < 2 ? '#7a3aa8' : i === 2 ? '#ffd85a' : i === 10 ? '#fff6c8' : i % 2 ? '#e0a820' : '#ffd85a', x, y, 1, 1);
  }
  rect(g, '#e07aff', 0, 11, 2, 1);
});
const AURUM_ICON = sprite(13, 12, (g) => {
  // a gold sniper on the slant, violet in its lines, a scope on top
  for (let i = 0; i < 13; i++) { const y = 10 - Math.round(i * 0.66); rect(g, '#9a6a12', i, y + 1, 1, 1); rect(g, i % 3 === 1 ? '#9a5aff' : '#f5d25a', i, y, 1, 1); }
  rect(g, '#4a1a86', 0, 10, 3, 2);
  rect(g, '#2a1048', 4, 5, 4, 1); rect(g, '#c09aff', 5, 5, 1, 1);
  rect(g, '#ffffff', 12, 2, 1, 1);
});
const REAP_ICON = sprite(12, 12, (g) => {
  // a shadow of someone, red-eyed, a violet cut right across it
  for (const [x, y, w, h] of [[4, 0, 4, 4], [3, 4, 6, 5], [3, 9, 2, 3], [7, 9, 2, 3]]) { rect(g, '#7a3aff', x - 1, y, w + 2, h); }
  for (const [x, y, w, h] of [[4, 1, 4, 3], [4, 4, 4, 5], [3, 9, 2, 3], [7, 9, 2, 3]]) rect(g, '#14081e', x, y, w, h);
  rect(g, '#ff2a4a', 5, 2, 1, 1); rect(g, '#ff2a4a', 7, 2, 1, 1);
  for (let i = 0; i < 12; i++) rect(g, i > 3 && i < 9 ? '#ffe8ff' : '#b06aff', i, 10 - Math.round(i * 0.75), 1, 1);
});
const NO_SKILL = sprite(9, 9, (g) => {
  for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) { const d = Math.hypot(i - 4, j - 4); if (d > 3 && d < 4.6) rect(g, '#c83a2a', i, j, 1, 1); }
  for (let i = 1; i < 8; i++) rect(g, '#c83a2a', i, 8 - i, 1, 1);
});

// Every skill: its name, picture, colour and what it does (for the lists to pick one from, and the skill bay).
const SKILL_INFO = [
  { key: 'grapple', name: 'GRAPPLE LINE', img: GRAPPLE_ICON, color: '#9ad0ff', desc: '2 SHOTS SAVED UP - ZIP TO WHERE YOU AIM, OR LOCK ON TO A FOE. ITS SPIN CUT HEALS YOU 80% OF WHAT IT DEALS' },
  { key: 'cloak', name: 'CLOAK', img: CLOAK_ICON, color: '#a89aff', desc: '8 S UNSEEN WITH A KNIFE - ONE STAB, X4.5 IN THE BACK' },
  { key: 'decoy', name: 'SHADOW CLONE', img: CLONE_ICON, color: '#8aa8ff', desc: 'A DOUBLE FIGHTS FOR YOU, 3 S UNSEEN, AND YOUR NEXT HIT COUNTS X1.8' },
  { key: 'archery', name: 'ARCHERY', img: BOW_ICON, color: '#7aff8a', desc: 'LOCK ON TO EVERY FOE NEAR, EVEN THE UNSEEN - NOBODY: IT RAINS ROUND YOU' },
  { key: 'murasaki', name: 'MURASAKI', img: VOID_ICON, color: '#c07aff', desc: 'RED AND BLUE MADE ONE: A PURPLE THAT ERASES ALL IN ITS LINE' },
  { key: 'blaze', name: 'FLAME FIST', img: FIST_FIRE_ICON, color: '#ff9a4a', desc: 'FISTS ALIGHT, THEN A DASH AND A PUNCH THE WAY YOU AIM' },
  { key: 'galaxy', name: 'GALAXY', img: GALAXY_ICON, color: '#7af0ff', desc: 'A BLACK HOLE WHERE YOU AIM: DRAGS THEM IN, THEN GOES OFF' },
  { key: 'demon', name: 'FLYING SWORDS', img: SWORDS_ICON, color: '#8fe0ff', desc: 'TAKES ALL YOUR STAMINA: A SWORD FOR EVERY 20%, THEY FLY AT WHOEVER COMES NEAR' },
  { key: 'lock', name: 'TARGET LOCK', img: LOCK_ICON, color: '#8fe8ff', desc: '3 S: YOUR SHOTS GO FOR THE FOE NEAREST THE MOUSE, WITH LESS KICK. THEY SEE IT' },
  { key: 'shield', name: 'BLUE SHIELD', img: SHIELD_ICON, color: '#6ad8ff', desc: 'TAKES 110 DAMAGE FOR 4 S, THEN GOES OFF - THE MORE IT TOOK, THE HARDER AND WIDER THE BLAST. UNTOUCHABLE 0.5 S AFTER. SLOWER, WEAKER SHOTS' },
  { key: 'cards', name: 'BUFF CARDS', img: CARDS_ICON, color: '#ffd25a', desc: 'DRAG TO A CARD: RED FULL MAG + FIRE RATE + HARDER SHOTS, GREEN HEAL + SHAKES OFF HACKS, BLUE FULL STAMINA + SPEED, PURPLE UNSEEN THEN A X1.8 HIT. SOMETIMES A JOKER: RED, GREEN AND BLUE AT ONCE. TEAMMATES NEAR SHARE IT' },
  { key: 'vampire', name: 'VAMPIRE', img: VAMPIRE_ICON, color: '#ff5a6a', desc: 'BATS DRAW BLOOD FOR YOU, AND YOU TURN TO SMOKE: UNTOUCHABLE, FAST, UNTIL YOU ATTACK OR ROLL' },
  { key: 'deflect', name: 'DEFLECT', img: DEFLECT_ICON, color: '#7affd0', desc: 'KATANA AT THE HIP: A FIELD TURNS SHOTS BACK WHERE YOU AIM, THEN DASH AND CUT' },
  { key: 'chidori', name: 'CHIDORI', img: CHIDORI_ICON, color: '#9fe6ff', desc: 'LIGHTNING IN THE HAND, AND QUICKER FEET: RUN INTO A FOE TO DRIVE IT THROUGH THEM. Q: LUNGE' },
  { key: 'octo', name: 'OCTO ARMS', img: OCTO_ICON, color: '#ff7a5a', desc: '4 S: FOUR STEEL ARMS GRAB GUNS FROM NOWHERE AND FIRE WHERE YOU AIM, NEVER EMPTY. Q: PUT AWAY. NO ROLLING' },
  { key: 'steal', name: 'SKILL THIEF', img: STEAL_ICON, color: '#ff6ad8', desc: 'HACK THE FOE NEAREST THE MOUSE: THEIR SKILL IS CUT OFF, AND YOURS TO USE ONCE' },
  { key: 'jumper', name: 'JUMPER', img: JUMPER_ICON, color: '#c08aff', desc: 'INTO THE OTHER PLACE: UNTOUCHABLE, FAST. Q AGAIN OPENS A RIFT BACK - ANYONE CAN GO THROUGH THE PAIR' },
  { key: 'sande', name: 'SANDEVISTAN', img: SANDE_ICON, color: '#7affc8', desc: 'THE WORLD ALL BUT STOPS AND YOU MOVE ON, QUICKER: AS LONG AS YOUR STAMINA, UP TO 2.6 S. COSTS 15% HEALTH' },
  { key: 'hack', name: 'HACK', img: HACK_ICON, color: '#3aff8a', desc: 'A WAVE CUTS OFF EVERY FOE NEAR: SKILLS STOP, THE UNSEEN SHOW, NO SKILLS AND +20% HURT 5 S, NO SHOOTING 1.6 S' },
  { key: 'fang', name: 'GOLDEN FANGS', img: FANG_ICON, color: '#ffd25a', desc: 'FIVE GOLD DAGGERS FANNED OUT LIKE A SHOTGUN, STRAIGHT THROUGH WHOEVER THEY HIT. Q AGAIN (OR 3 S): ALL FLY HOME, CUTTING THROUGH ANYONE IN THE WAY AS HARD' },
  { key: 'aurum', name: 'AURUM', img: AURUM_ICON, color: '#d0a8ff', desc: 'A GOLD SNIPER BUILT IN YOUR HANDS: 5 HEAVY SHOTS THROUGH ANYONE IN LINE, A VIOLET STREAK BEHIND. 12 S, Q: PUT AWAY' },
  { key: 'reap', name: 'SHADOW KILL', img: REAP_ICON, color: '#b06aff', desc: 'INTO SHADOW, UNTOUCHABLE: SHADOWS OF YOU CUT THE NEAREST FOE 12 TIMES - ANYONE WHO COMES CLOSE TO THEM MAY BE NEXT - THEN YOU ARE BEHIND THEM FOR THE LAST CUT. FEET ON THE FLOOR ONLY' },
];
// the choices for a pick list: each skill (with its wait), then none - and for the bots, RANDOM first
function skillItems(forBots = false, room = settings) {
  const mul = room.cd ?? 1, bans = room.banSkills ?? [];
  const list = SKILL_INFO.filter((k) => !bans.includes(k.key)).map((k) => ({ key: k.key, label: k.name, desc: k.desc, img: k.img, color: k.color, note: `${+(SKILL_CD[k.key] * mul).toFixed(1)} S` }));
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
// The list of guns or of skills to ban (k: banGuns / banSkills): each click bans one or lets it back; changed() after each.
function openBans(k, changed = () => {}) {
  const guns = k === 'banGuns';
  const items = guns ? BAN_GUNS.map((key) => ({ key, label: WEAPONS[key].name, img: iconOf(key) })) : SKILL_INFO.map((s) => ({ key: s.key, label: s.name, img: s.img, color: s.color }));
  picker = { id: `pk-${k}`, title: guns ? 'BANNED GUNS' : 'BANNED SKILLS', items, multi: k, sel: 0, changed };
}
function pickerInput() {
  const c = kit.click, P = picker, n = P.items.length, cols = P.cols ?? (renderer.width >= 440 * hudScale() ? 3 : 2);
  if (P.multi) {
    if (input.wasPressed('KeyA', 'ArrowLeft')) P.sel = (P.sel + n - 1) % n;
    if (input.wasPressed('KeyD', 'ArrowRight')) P.sel = (P.sel + 1) % n;
    if (input.wasPressed('KeyW', 'ArrowUp')) P.sel = (P.sel - cols + n) % n;
    if (input.wasPressed('KeyS', 'ArrowDown')) P.sel = (P.sel + cols) % n;
    const i = c?.startsWith(`${P.id}:`) ? c.slice(P.id.length + 1) : null, k = P.multi;
    if (i === 'done' || input.wasPressed('Escape', 'Enter')) { picker = null; return; }
    if (i === 'clear') settings[k] = [];
    else if (i === 'all') settings[k] = P.items.map((it) => it.key);
    else if ((i !== null && i !== '') || input.wasPressed('Space')) {
      const key = P.items[i !== null ? +i : P.sel]?.key;
      if (!key) return;
      if (i !== null) P.sel = +i;
      settings[k] = settings[k].includes(key) ? settings[k].filter((x) => x !== key) : [...settings[k], key];
    } else return;
    saveSettings();
    P.changed();
    return;
  }
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
const drawPicker = () => {
  if (!picker) return;
  if (picker.multi) { picker.cols = kit.toggles(picker.id, picker.title, picker.items.map((it) => ({ ...it, off: settings[picker.multi].includes(it.key) })), picker.sel); return; }
  if (!picker.maps) return kit.choices(picker.id, picker.title, picker.items, picker.current, picker.sel);
  // (the maps' pictures: one a frame, the one wanted first if it's still to come)
  const next = picker.items[picker.sel]?.maps && !picker.items[picker.sel].thumb ? picker.items[picker.sel] : picker.items.find((it) => it.maps && !it.thumb);
  if (next) next.thumb = mapThumb(next.key);
  picker.cols = kit.mapChoices(picker.id, picker.title, picker.items, picker.current, picker.sel);
};

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
    { kind: 'cooldown', get name() { return trainCfg.cooldowns ? 'COOLDOWN ON' : 'COOLDOWN OFF'; }, get img() { return trainCfg.cooldowns ? CLOCK_ON : CLOCK_OFF; },
      get desc() { return trainCfg.cooldowns ? 'A WAIT BETWEEN USES, AS IN A FIGHT - TAKE TO TURN IT OFF' : 'NO WAIT BETWEEN USES - TAKE TO TURN IT ON'; } },
    { kind: 'soon', name: 'MORE SOON', desc: 'MORE SKILLS ARE ON THE WAY' },
  ] }] },
  med: { name: 'MED CABINET', tabs: () => [{ label: 'MEDICAL', items: [
    { kind: 'heal', name: 'MEDKIT', img: MEDKIT, desc: 'BACK TO FULL HEALTH' },
    { kind: 'drink', name: 'ENERGY DRINK', img: DRINK, desc: 'FULL STAMINA - AND RUNNING COSTS NOTHING FOR 15 S' },
  ] }] },
  // BUY & FIGHT: before each round
  shop: { name: 'SHOP', close: 'B / ESC - CLOSE', tabs: () => shopTabs() },
  // TAB, anywhere in training: all three cabinets in one
  all: { name: 'ARMORY', close: 'ESC / TAB - CLOSE', tabs: () => [...LOCKERS.guns.tabs(), ...LOCKERS.skills.tabs(), ...LOCKERS.med.tabs(), ...TRAIN_TABS] },
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
function takeItem(it, f = player) {
  if (f === player && locker?.use === 'shop') return buyItem(it);
  if (f === player && online.isClient) { online.sendTake(it.kind, it.key ?? null); return true; }
  if (it.kind === 'cooldown' && f === player && !isAdmin(myRole())) return false;   // (the room's setting: not everyone's to change)
  if (it.kind === 'gun') { f.give(it.key, it.def.magSize * 6); f.select(f.slotFor(it.def)); }
  else if (it.kind === 'melee') { f.giveMelee(MELEE[it.key]); f.select(1); }
  else if (it.kind === 'nades') { f.nade = it.key; f.grenades = 4; }
  else if (it.kind === 'ammo') for (const w of [f.gun]) {
    if (!w) continue;
    w.ammo = w.magSize;
    w.ammoSource.give(null, Math.max(0, w.magSize * 6 - w.reserve));
  }
  else if (it.kind === 'skill') { f.uncloak(); f.dropDecoy(); f.bow = null; f.mura = null; f.blaze = null; f.gal = null; f.summon = null; f.lockOn = null; f.barrier = null; f.card = null; f.powered = null; f.hackCast = null; f.sande = null; f.batCast = null; f.wraith = null; f.chidori = null; if (f.octo) f.octoEnd(); f.steal = null; f.stolen = null; f.phase = null; f.deflect = null; f.skill = it.key; f.skillCD = 0; f.hook = null; }
  else if (it.kind === 'cooldown') { trainCfg.cooldowns = !trainCfg.cooldowns; f.skillCD = 0; }
  else if (it.kind === 'heal') { f.hp = f.maxHp; game.fx.sparks(f.x, f.y - 14, 10, 0, -1, '#8aff9a'); }
  else if (it.kind === 'drink') { f.stamina = MAX_STAMINA; f.winded = false; f.boostT = 15; game.fx.sparks(f.x, f.y - 14, 8, 0, -1, '#8ff0ff'); }
  else return false;
  return true;
}

// The panel's keys and mouse: 1-9 or a click for the tabs; arrows / WASD
// round the grid (the wheel scrolls it); ENTER, SPACE or a click takes it.
function lockerInput(dt) {
  const L = locker;
  if (state !== 'training' && !(L.use === 'shop' && canBuy(player))) { locker = null; return; }
  if (paused) return;
  if (L.flash) L.flash.t -= dt;
  if (L.fresh) { L.fresh = false; return; }   // (the frame it opened: that E isn't a close)
  if (trainEdit) { trainTyping(); return; }   // (typing a room's code: the keys are for that)
  if (L.tabs[L.tab]?.custom) trainTabInput(L.tabs[L.tab].custom);
  if (input.wasPressed('KeyE', 'Mouse2', 'Tab') || (L.use === 'shop' && input.wasPressed('KeyB')) || kit.click === 'lk:close') { locker = null; trainEdit = null; return; }
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
    const mx = input.mouse.x * renderer.dpr, my = input.mouse.y * renderer.dpr, sl = touch ? TAP_SLACK * renderer.dpr : 0;
    const inside = (r, k = sl) => mx >= r.x0 - k && mx < r.x1 + k && my >= r.y0 - k && my < r.y1 + k;
    if (touch && input.wasPressed('Mouse0') && L.panel && !inside(L.panel, 0) && !kit.hover) { locker = null; trainEdit = null; return; }   // (a phone: a tap outside it)
    const moved = input.mouse.x !== lockerInput.lx || input.mouse.y !== lockerInput.ly;
    lockerInput.lx = input.mouse.x;
    lockerInput.ly = input.mouse.y;
    const cell = L.cellRects.find((r) => inside(r, 0)) ?? L.cellRects.find((r) => inside(r));
    if (cell && moved) L.sel = cell.i;
    if (input.wasPressed('Mouse0')) {
      const tab = L.tabRects.find((r) => inside(r, 0)) ?? L.tabRects.find((r) => inside(r));
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
function drawLocker(ctx, hu, W, H) {
  const u = touch ? Math.max(hu, Math.floor(Math.min(W / 440, H / 236))) : hu, ku = kit.u;
  kit.u = u;
  try { drawLockerAt(ctx, u, W, H); } finally { kit.u = ku; }
}
function drawLockerAt(ctx, u, W, H) {
  const L = locker, def = LOCKERS[L.use];
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x * u), Math.round(y * u), Math.round(w * u), Math.round(h * u)); };
  const text = (t, x, y, c, size = 1) => drawText(ctx, String(t), Math.round(x * u), Math.round(y * u), u * size, c);
  const rectOf = (x, y, w, h, i) => ({ i, x0: x * u, y0: y * u, x1: (x + w) * u, y1: (y + h) * u });
  ctx.fillStyle = 'rgba(4, 7, 6, 0.55)';
  ctx.fillRect(0, 0, W, H);
  const Wd = W / u, Hd = H / u, pw = Math.min(Wd - 24, 420), ph = Math.min(Hd - 24, L.use === 'all' ? 270 : 236);
  const x0 = Math.round((Wd - pw) / 2), y0 = Math.round((Hd - ph) / 2);
  px(x0 - 1, y0 - 1, pw + 2, ph + 2, HUDC.frame);
  px(x0, y0, pw, ph, 'rgba(14, 19, 16, 0.97)');
  px(x0, y0, pw, 1, '#c9a83a');
  text(def.name, x0 + 8, y0 + 6, '#ffd25a', 2);
  if (L.use === 'shop') text(`$ ${player.money ?? 0}`, x0 + 14 + textWidth(def.name) * 2, y0 + 6, '#8aff9a', 2);
  L.panel = rectOf(x0, y0, pw, ph);
  if (touch) kit.button('lk:close', Math.round((x0 + pw - 30) * u), Math.round((y0 + 3) * u), 26 * u, 16 * u, 'X', { kind: 'danger' });   // (a phone: no keys to close it with)
  else {
    const close = def.close ?? 'ESC / E - CLOSE';
    text(close, x0 + pw - 8 - textWidth(close), y0 + 9, '#6f7a62');
  }
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
  // a room tab (training): its own contents
  if (L.tabs[L.tab].custom) { L.cellRects = []; drawTrainTab(L.tabs[L.tab].custom, ctx, u, x0 + 8, ty + 18, pw - 16, y0 + ph - 8 - (ty + 18)); return; }
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
    if (it.price !== undefined) text(`$${it.price}`, cx + 3, cy + 3, (player.money ?? 0) >= it.price ? '#ffd25a' : '#a04a3a');
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
      const d = it.def, dmg = Math.round(d.damage * DAMAGE * gunMul(d) * settings.dmg);
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
  const s = stats, w = 80, x = W / u - w - 6, y = touch ? Math.round(84 * renderer.dpr / u) : 52, rows = s.hits ? [
    ['DAMAGE', Math.round(s.burst)],
    ['TIME', `${s.time.toFixed(1)} S`],
    ['PEAK/S', Math.round(s.peak)],
    ['HEAD', `${Math.round((100 * s.heads) / s.hits)}%`],
    ['RANGE', `${Math.round(s.dist)} M`],
  ] : [];
  // no panel: the figures on whatever's behind them, with a shadow to read by. Not in a burst, they sink back.
  const say = (t, tx, ty, col, size) => { text(t, tx + 0.5, ty + 0.5, 'rgba(0, 0, 0, 0.75)', size); text(t, tx, ty, col, size); };
  ctx.save();
  ctx.globalAlpha = s.going ? 0.95 : 0.55;
  say('DPS', x + w - textWidth('DPS'), y, '#c8d0ba');
  const dps = String(Math.round(s.dps));
  say(dps, x + w - textWidth(dps) * 2 - textWidth('DPS') - 3, y - 3, s.going ? '#ffd84a' : '#e8e2d0', 2);
  // how the burst's going: lit while you're at it, running out when you stop
  const k = s.going ? Math.max(0, 1 - (performance.now() / 1000 - s.lastT) / STATS_GAP) : 0;
  if (k > 0) px(x + w * (1 - k), y + 9, w * k, 1, '#ffd84a');
  rows.forEach(([key, v], i) => {
    say(key, x, y + 13 + i * 7, '#aab09c');
    say(v, x + w - textWidth(String(v)), y + 13 + i * 7, '#e8e2d0');
  });
  // what you're taking, while you are
  if (s.takenDps > 0) {
    const taken = String(Math.round(s.takenDps)), ty = y + 13 + rows.length * 7 + 1;
    say('TAKING', x, ty, '#ff9a8a');
    say(taken, x + w - textWidth(taken), ty, '#ff7a6a');
  }
  ctx.restore();
}

// ---------- the main menu ----------
// The way into everything: SINGLE PLAYER (you against bots, set up the room
// first), MULTIPLAYER (online rooms - see online.js) and TRAINING; STORY shows
// what it'll be. (The gun editor, editor.html, is off the menu.)

const MENU_ITEMS = [
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
  const n = MENU_ITEMS.length;
  if (input.wasPressed('KeyW', 'ArrowUp')) modeSel = (modeSel + n - 1) % n;
  if (input.wasPressed('KeyS', 'ArrowDown')) modeSel = (modeSel + 1) % n;
  if (kit.hover?.startsWith('mode:') && (input.mouse.x !== mainMenuInput.lx || input.mouse.y !== mainMenuInput.ly)) modeSel = +kit.hover.slice(5);
  mainMenuInput.lx = input.mouse.x;
  mainMenuInput.ly = input.mouse.y;
  if (kit.click?.startsWith('mode:')) return pickMode(MENU_ITEMS[+kit.click.slice(5)]);
  if (kit.click === 'open-sound') { soundPanel = true; return; }
  if (input.wasPressed('Enter', 'Space')) pickMode(MENU_ITEMS[modeSel]);
}

function drawMainMenu(ctx, u, W, H) {
  kit.shade(0.5);
  // (the title and the buttons, together in the middle of what's above the hints)
  let y = Math.max(8 * u, Math.round((H - 13 * u - (78 + MENU_ITEMS.length * 37) * u) / 2));
  kit.text('PROJECT Z', W / 2, y, { size: 5, color: KC.gold, align: 'center' });
  y += 40 * u;
  kit.hazard(W / 2 - 112 * u, y, 224 * u, 4 * u);
  y += 10 * u;
  kit.text('LAB BRAWL', W / 2, y, { size: 2, color: KC.teal, align: 'center' });
  y += 28 * u;
  const bw = Math.min(W - 24 * u, 300 * u), bh = 32 * u, x = Math.round(W / 2 - bw / 2);
  MENU_ITEMS.forEach((m, i) => {
    kit.button(`mode:${i}`, x, y, bw, bh, m.name, { size: 2, sub: m.soon ? 'COMING SOON' : m.desc, selected: modeSel === i });
    y += bh + 5 * u;
  });
  kit.button('open-sound', W - 70 * u, H - 34 * u, 64 * u, 16 * u, 'SOUND');
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
  kit.button('back', W / 2 - 50 * u, y, 100 * u, 18 * u, 'BACK', { kind: 'danger' });
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
  for (const f of game.fighters) { f.deaths = 0; if (!skillOK(f.skill)) f.skill = null; }
  if (!settings.skills) for (const f of game.fighters) f.skill = null;
  bots = host ? game.fighters.filter((f) => f.bot).map((f, i) => new Bot(game, f, (0.9 + i * 0.04) * settings.skill)) : [];
  matchSetup();
  game.walkover = false;
  game.leftMatch = [];
  locker = null;
  paused = false;
  startRound();
}
// someone coming into a match that's going on (online; the host): in for the round about to start
function addNetFighter(r, nid) {
  const f = new Fighter(game, images, r);
  f.nid = nid;
  f.team = r.team;
  f.peer = r.peer;
  f.deaths = 0;
  if (!settings.skills || !skillOK(f.skill)) f.skill = null;
  game.fighters.push(f);
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
  drawText, textWidth, centerText, panel, playerControl, startNetMatch, addNetFighter, changeNetSetting, kit, tagColor,
  skillItems, skillName, openPicker, pickMap, openBans, banShown, openSound() { soundPanel = true; }, botSkill, SKILL_INFO, setSetting(k, v) { settings[k] = v; saveSettings(); },
  isTeams: (k) => !!MODES[k]?.teams, applyBuy: (f, kind, key) => applyBuy(f, kind, key),
  // training, together
  trainCfg, trainJoin, trainTake, trainAct,
  handsBusy: () => !!locker || paused || !!trainEdit,
  trainHost(name) { player.peer = online.me(); player.name = name; },
  trainAlone(wasHost) {
    if (!wasHost) return startTraining();
    game.fighters = game.fighters.filter((f) => !f.peer || f === player);
    player.peer = null;
    player.name = ROSTER[0].name;
  },
  trainGuest() {
    // into someone else's training: their map, their everything - all of it from them, as it comes
    loadMap('training');
    state = 'training';
    game.obj = null;
    game.tags = [];
    stateT = 0;
    paused = false;
    locker = null;
    for (const k of ['bullets', 'grenades', 'pickups', 'feed', 'blasts', 'thrown', 'numbers', 'arrows', 'voids', 'fists', 'galaxies', 'swordSets', 'punches', 'bursts', 'bats', 'bloods', 'fangs', 'props', 'racks']) game[k] = [];
    stats.reset();
    player = new Fighter(game, images, ROSTER[0]);
    player.alive = false;
    game.fighters = [];
    bots = [];
    decoys = [];
    banner = { text: 'TRAINING TOGETHER', sub: 'TAB: THE ARMORY AND THE ROOM', t: 2.2, color: '#8ff0ff' };
  },
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
    if (frozen) drawFrame();
    else if (online.active) runFor((now - last) / 1000, true);
    else tick(Math.min(1 / 30, (now - last) / 1000));
  } catch (e) {
    if (!frame.errors || frame.errors < 5) console.error(e);
    frame.errors = (frame.errors ?? 0) + 1;
    input.endFrame();
  }
  last = now;
}
// Online, a hidden tab (another tab in front, the window minimised) gets no frames - and the
// host's game is everyone's, so it would stop for all of them. So a worker keeps time too (the
// browser doesn't hold a worker's clock back the way it does the page's): when no frame has come
// for a moment, its ticks run the game instead - everything but the drawing.
const backupClock = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 1000 / 30);'], { type: 'text/javascript' })));
backupClock.onmessage = () => {
  const now = performance.now();
  if (frozen || !online.active || now - last < (document.hidden ? 25 : 100)) return;   // (hidden there are no frames to wait for: its own rate, or states would only go out ten times a second)
  try { runFor((now - last) / 1000, false); } catch (e) { console.error(e); input.endFrame(); }
  last = now;
};
// Online the game keeps to real time, however slowly the frames come (a tab in the background
// gets a few a second): the time since the last, in steps of 1/30 s - up to a quarter of a second of it.
function runFor(sec, draw) {
  for (let n = 0; sec > 1 / 30 + 1e-6 && n < 8; n++) { tick(1 / 30, false); sec -= 1 / 30; }
  tick(Math.min(1 / 30, sec), draw);
}

// Behind the menus: the maps, one after another, picked at random, with nobody in them (the room setup: the one picked).
let backdropT = 0, backdropFade = 0;
function menuBackdrop(dt) {
  if (game.fighters.length) {
    game.fighters = [];
    bots = [];
    for (const name of ['bullets', 'grenades', 'pickups', 'thrown', 'arrows', 'voids', 'galaxies', 'swordSets', 'blasts', 'punches', 'bursts', 'bats', 'bloods', 'rifts', 'fists', 'numbers', 'feed', 'fangs']) game[name] = [];
  }
  const picked = state === 'title' && settings.map !== 'random' ? settings.map : null;
  backdropT -= dt;
  backdropFade = Math.max(0, backdropFade - dt * 1.5);
  if (picked ? level.map !== MAPS[picked] : backdropT <= 0) {
    const now = MAP_KEYS.find((k) => MAPS[k] === level.map), next = picked ?? pick(MAP_KEYS.filter((k) => k !== now));
    loadMap(next);
    game.props = placeProps(level.props, level);
    titlePan = Math.random() * 6;
    backdropT = 15;
    backdropFade = 1;
  }
}
// On a phone: the controls are up while there's a body to steer and nothing open over the game.
const touchCombat = () => ['intro', 'fight', 'end', 'training'].includes(state) && player.alive && !paused && !locker && !picker && !soundPanel && !online.menuOpen && !online.watching;
const touch = isPhone ? new TouchControls(input, {
  combat: touchCombat,
  scroll: () => !!locker,
  showEsc: () => (['fight', 'end', 'training'].includes(state) && !player.alive && !paused && !online.menuOpen),
  skill: () => ({ has: !!player.skill, cd: skillShown() }),
  pin: () => (player?.card?.pick && cardPin ? { ...cardPin, k: renderer.scale / renderer.dpr } : null),   // (the cards fanned out: the aim stick leans toward one, from their middle)
  aimFrom: () => {
    const s = player.shoulder, k = renderer.scale / renderer.dpr;
    return { x: (s.x - renderer.left) * k, y: (s.y - renderer.top) * k, k };
  },
}) : null;
const TAP_SLACK = 12;   // css px: on a phone, how far off a button a tap can land and still be for it
const skillShown = () => (player.skillCD > 0 && !(player.game.noCooldown?.(player)) ? player.skillCD / game.cdRate() : 0);
function drawFrame() {
  drawWorld();
  drawHud();
  touch?.draw(renderer.ctx, renderer.dpr);
}
let zoomSteps = 0;
function tick(realDt, draw = true) {
  netUpdate(realDt);
  touch?.update(realDt);
  // O: the camera closer in, P: back out, no further than the view everyone starts with. Only over a fight (the menus' backdrop stays as it is).
  const fightOn = ['intro', 'fight', 'end', 'match', 'training'].includes(state);
  if (fightOn && !paused && input.wasPressed('KeyO')) zoomSteps = Math.min(renderer.fitScale, zoomSteps + 1);
  if (fightOn && !paused && input.wasPressed('KeyP')) zoomSteps = Math.max(0, zoomSteps - 1);
  const zoomNow = fightOn ? zoomSteps : 0;
  if (renderer.zoom !== zoomNow) renderer.setZoom(zoomNow);
  if (touch?.blocked && !online.active && (state === 'fight' || state === 'training')) paused = true;   // (out of full screen, or turned upright: it waits for you)
  kit.slack = touch ? TAP_SLACK * renderer.dpr : 0;
  kit.pointer(input, renderer.dpr);   // (what the mouse is over on the menus, what's clicked)
  // menus (a pick list open over one takes the keys and clicks)
  if (!soundPanel && !picker && !paused) nextSkillInput();
  if (!soundPanel && !picker) spectateInput();
  if (soundPanel) soundInput();
  else if (picker) pickerInput();
  else if (state === 'menu') mainMenuInput();
  else if (state === 'soon') { if (input.wasPressed('Escape', 'Enter', 'Space') || kit.click === 'back') state = 'menu'; }
  else if (state === 'title') titleInput();
  else if (online.isScreen(state)) netScreenInput();
  else if (online.active && !(online.training && state === 'training')) netGameInput();   // (online, ESC doesn't pause: it's a menu over the game, which goes on)
  else if (state === 'match') matchInput();
  if (state === 'intro' && !locker && !paused && canBuy(player) && !online.watching && input.wasPressed('KeyB')) openLocker({ use: 'shop' });
  if (online.isClient && state === 'training' && !locker && !paused) {
    // in someone else's training: TAB for the armory and the room, E at a cabinet
    if (input.wasPressed('Tab')) openLocker({ use: 'all' });
    else if (input.wasPressed('KeyE') && cabinetNear()) openLocker(cabinetNear());
  }
  // \ (ฃ / ฅ on a Thai layout): the HUD and everything over the fight off, and on again
  if (input.wasPressed('Backslash', 'IntlBackslash') && !onMenu() && !online.isScreen(state) && !trainEdit) uiHidden = !uiHidden;
  if (locker && !trainEdit && input.wasPressed('Escape')) locker = null;
  else if (online.isClient && locker) lockerInput(realDt);   // (in someone else's game: the shop's, the armory's, still ours to look through)
  else if (!locker && input.wasPressed('Escape')) paused = !paused;
  else if (paused) pauseInput();

  if (onMenu()) {
    menuBackdrop(realDt);
    game.time += realDt;
    stateT += realDt;
    if (banner) { banner.t -= realDt; if (banner.t <= 0) banner = null; }
    game.fx.update(realDt);
    game.lights.update(realDt);
    renderer.update(realDt);
    updateCamera(realDt);
  } else if (online.isClient) {
    // in someone else's game: what the host sends is drawn, our controls go to it (see online.js)
    clientFrame(realDt);
    for (const k of game.feed) k.t -= realDt;
    renderer.update(realDt);
    updateCamera(realDt);
  } else if (!paused || online.active) {   // (online, the pause menu's over a game that goes on)
    const dt = realDt * slow;
    // Sandevistan: while anyone's got it going, the world's time all but stops, and only theirs goes on
    game.timeK = sandeUsers().length ? SANDE_WORLD : 1;
    const wdt = dt * game.timeK, own = (f) => (f.sande ? dt : wdt);
    game.time += wdt;
    updateRounds(wdt, realDt);
    if (banner) { banner.t -= realDt; if (banner.t <= 0) banner = null; }
    const live = state === 'fight' || state === 'end' || state === 'training';
    const cabinetOpen = !!locker;   // (the E that shuts it doesn't open it again)
    if (locker) lockerInput(realDt);
    let pc = live && !cabinetOpen && !online.menuOpen && !paused ? (testControl ? { ...IDLE, ...testControl } : playerControl()) : IDLE;
    // E at a cabinet opens it (rather than reaching for what's on the floor)
    if (pc.pickup && cabinetNear()) { openLocker(cabinetNear()); pc = IDLE; }
    // TAB in training: everything, wherever you are
    else if (state === 'training' && !cabinetOpen && player.alive && input.wasPressed('Tab')) { openLocker({ use: 'all' }); pc = IDLE; }
    if (online.tabOpen) pc = { ...pc, fire: false, melee: false };   // (the host, over the scores: the mouse is for KICK and BAN)
    if (pc.pickup) player.pickupPressed = true;
    player.update(own(player), pc);
    updateRemotes(dt, live);   // (hosting online: the other players' fighters, by their controls)
    for (const b of bots) b.f.update(own(b.f), live && !b.f.still ? b.control(own(b.f)) : IDLE);   // (training: a bot put in to stand still)
    updateDecoys(wdt, live);
    updateBullets(wdt);
    updateGrenades(wdt);
    updateThrown(wdt);
    updateArrows(wdt);
    updateVoids(wdt);
    updateFists(wdt);
    updateGalaxies(wdt);
    updateSwords(wdt);
    updateFangs(wdt);
    updateAurums();
    updateBats(wdt);
    updateRifts(wdt, own);
    updateBursts(wdt);
    updatePickups(wdt);
    updateTraining(wdt);
    for (const n of game.numbers) n.t += wdt;
    game.numbers = game.numbers.filter((n) => n.t < 0.9);
    // off the bottom of an open map (the rooftops): gone
    for (const f of game.fighters) if (f.alive && f.y > PH + 40) f.die(null, 'FELL', 0, 0);
    for (const p of game.pickups) if (p.y > PH + 60) p.life = 0;
    for (const f of game.fighters) f.pickupPressed = false;
    game.fx.update(wdt);
    for (const b of game.blasts) b.t += wdt;
    game.blasts = game.blasts.filter((b) => b.t < 0.35);
    game.lights.update(wdt);
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
  const cursor = onMenu() || picker || state === 'match' || paused || locker || online.menuOpen || online.watching || online.tabOpen ? 'default' : 'none';
  if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
  if (draw) drawFrame();
  input.endFrame();
}
requestAnimationFrame(frame);

// for testing from the console: arena.step(seconds) runs the game without the browser's frame clock
let testControl = null, frozen = false;
window.arena = {
  game, renderer, startMatch, startTraining, settings, loadMap, online, touch, kit,
  get level() { return level; },
  get player() { return player; }, get state() { return state; }, set state(v) { state = v; }, get bots() { return bots; },
  set control(c) { testControl = c; },
  get locker() { return locker; }, trainAct: (m) => trainDo(m), trainCfg, get trainBotOpts() { return trainBotOpts; },
  set frozen(v) { frozen = v; },
  step(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) tick(dt, false); drawFrame(); },
};
