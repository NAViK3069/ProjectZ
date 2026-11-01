// Online play: the screens on the way into a game (choose a server, the
// lobby's list of rooms, a room waiting to start - Point Blank style) and the
// game itself over the network (see net.js for the connections).
//
// The host's game is the real one - everything that counts happens there. How
// a player's screen keeps up with it, for a fast game:
//
// - Their own fighter is theirs at once (prediction). Each 1/60 s of play is a
//   numbered command - the controls held for that step. They run it straight
//   away on a stand-in of their fighter and send it to the host, who runs the
//   very same commands, in order, at the same step. Nothing but controls goes
//   in: the host is never told where anyone is.
// - The host's word on where they are comes back with the number of the last
//   command it's run (reconciliation): the stand-in is put there, and the
//   commands the host hasn't got to yet are run over again. With nothing else
//   going on that lands exactly where it was, and nothing shows; a hit's knock
//   or a black hole's pull just comes out in it. What difference there is gets
//   eased away over a moment.
// - Everyone else is drawn a little in the past, between two states from the
//   host (interpolation) - as little as this connection's unevenness allows,
//   measured by when states actually arrive.
// - Shots are fired on the player's own screen at once (with the same spread:
//   it's seeded by the command's number), and the host judges them against where
//   they saw everyone when they fired (lag compensation; see pastOf). So what
//   you hit on your screen is what you hit.
//
// What's sent is kept small: a shot goes once (it flies straight, each screen
// can carry it on), things that only run on with time aren't sent, and of the
// rest only what's changed.

import { SERVERS, Lobby, GameRoom, myId, pingServer } from './net.js';
import { Fighter } from './fighter.js';
import { Fx } from './fx.js';
import { Lights } from './light.js';
import { Prop } from './props.js';
import { Weapon } from '../combat/weapons.js';
import { MeleeWeapon, MELEE } from '../combat/melee.js';
import { K } from '../ui/kit.js';

let A = null;   // what this needs of the game (main.js)
const STEP = 1 / 60;   // a command: this much of a player's time
const CTL_STALE = 0.35;   // no word from a player this long: their fighter's let go
const MAX_REWIND = 0.25;   // the furthest back a shot's judged (any more and you'd be hit round corners)
const MAX_PENDING = 120;   // commands not yet heard back about (2 s): any more and we stop adding to them
// (a full room says less, often: Photon asks for under 500 messages a second in a room, in and out)
const snapEvery = () => (N.members.length > 5 ? 1 / 20 : 1 / 30);
const ctlEvery = () => (N.members.length > 5 ? 1 / 20 : 1 / 30);
// A room's 8 slots, in two columns of 4 (in TEAMS: the left BLUE, the right RED). Each is open
// (anyone joining takes the first), closed (not there), a bot, or a player.
const SLOTS = 8;
const LOOKS = [
  { color: '#e8e2d0', hue: 0, sat: 1 }, { color: '#ff6a5a', hue: 150, sat: 1.3 }, { color: '#6ad8ff', hue: 210, sat: 1.2 },
  { color: '#c8ff5a', hue: 290, sat: 1.1 }, { color: '#ffb84a', hue: 40, sat: 1.2 }, { color: '#e07aff', hue: 250, sat: 1.3 },
  { color: '#7affc8', hue: 100, sat: 1.2 }, { color: '#ff9ad8', hue: 320, sat: 1.2 },
];
const BOT_NAMES = ['VEX', 'KORA', 'DUKE', 'ROOK', 'NYX', 'ZED', 'IVO', 'MOX'];
const DELAY_MIN = 0.035, DELAY_MAX = 0.3;   // how far in the past everyone else is drawn, at most and at least
const teamOf = (i) => (i < SLOTS / 2 ? 0 : 1);
const TEAM_LOOKS = [{ color: '#6ad8ff', hue: 210, sat: 1.2 }, { color: '#ff6a5a', hue: 8, sat: 1.7 }];   // in TEAMS everyone wears their side's colour: BLUE, RED (the art's own hair is red)
const MAX_WATCH = 8;   // how many can watch a room besides those in its slots
const SEAT_HOLD = 20;   // gone from a match this long (s) and they've lost their seat
export const SKILLS = [
  ['grapple', 'GRAPPLE'], ['cloak', 'CLOAK'], ['decoy', 'SHADOW CLONE'], ['archery', 'ARCHERY'], ['murasaki', 'MURASAKI'],
  ['blaze', 'FLAME FIST'], ['galaxy', 'GALAXY'], ['demon', 'ABYSS GOLEM'], [null, 'NO SKILL'],
];

const N = {
  name: '', skill: 'grapple', edit: null, draft: '',
  server: null, lobby: null, room: null, mode: null,   // mode: 'host' | 'client' while in a room
  roomName: '', made: 0, members: [], slots: [], playing: false,
  msg: '', msgT: 0, busy: '', sel: -1, pings: {}, pingT: 0,
  watching: false, match: null, deadT: 0,
  pass: '', creating: null, joinAsk: null, joinPass: '',
  confirm: null, banned: new Map(), out: false, offset: undefined,
  heirPass: '', heirSent: null, back: null, gap: 1 / 30, jit: 0, delay: undefined, statN: { t: 0 }, stats: {},   // heirPass: the room's password, told to whoever takes over if the host goes; back: getting back in after losing the connection
  ctl: new Map(), sendT: 0, snaps: [], gotSnap: false, menu: false, saved: null,
  fighters: new Map(), props: new Map(), nextNid: 100, propIds: 0, fistsDef: null,
  sent: new WeakMap(), listSent: {}, hdrSent: {}, propLive: new Set(), newShots: [], liveShots: new Set(), uids: 0, sentRound: -1, snapN: 0,   // (the host) what's been sent so far - only what's changed goes again
  // (the others) our own fighter: the commands run, not heard back about yet; the stand-in; the host's word on it
  seq: 0, ack: 0, pending: [], out_: [], latch: {}, acc: 0, ghost: null, auth: {}, authNew: false, err: { x: 0, y: 0 }, prev: null, ctlT: 0, ctlAgo: 0,
  combatSeq: 0, deferred: {}, shots: [], local: [], predicted: new Set(), later: [], pickups: new Map(), trk: new Map(),
};
try { N.name = localStorage.getItem('arena.name') || ''; N.skill = localStorage.getItem('arena.skill') ?? 'grapple'; } catch {}
if (!N.name) N.name = `PLAYER${Math.floor(100 + Math.random() * 900)}`;
if (N.skill === 'null') N.skill = null;
const saveMe = () => { try { localStorage.setItem('arena.name', N.name); localStorage.setItem('arena.skill', String(N.skill)); } catch {} };
const say = (msg, t = 3) => { N.msg = msg; N.msgT = t; };

export const online = {
  get active() { return !!N.mode; },
  get isHost() { return N.mode === 'host'; },
  get isClient() { return N.mode === 'client'; },
  get menuOpen() { return N.menu; },
  get watching() { return N.watching; },
  get netStats() { return N.stats; },      // (for checking: messages and bytes a second, how far behind everything is)
  get debug() { return N; },               // (for checking, from the console)
  isScreen: (state) => state === 'net-servers' || state === 'net-lobby' || state === 'net-room',
};

export function initOnline(api) {
  A = api;
  recordEffects();
  A.game.onShot = (b) => { if (N.mode === 'host' && N.playing) N.newShots.push(b); };
  A.game.pastOf = pastOf;
}
// from the main menu
export function openOnline() {
  A.state = 'net-servers';
}

// ---------- the effects, passed along ----------
// On the host, every effect that's set off (outside another one) is noted
// down, to go out with the next state of the game; the others set them off
// on their own screens the same way. Each says whose doing it was, if a player's:
// their own steps and shots they've shown already.
const FX_CALLS = ['dust', 'puff', 'mist', 'wisp', 'motes', 'runDust', 'step', 'casing', 'blood', 'sparks', 'impact', 'gunSmoke', 'debris', 'smoke', 'fire', 'scorch'];
const OWN_MOVES = new Set(['dust', 'puff', 'step', 'runDust']);
let noted = null, depth = 0, fxBy = 0, fxShot = 0;
function recordEffects() {
  const wrap = (proto, name, as = name, conv = (args) => args.map((a) => ser(a))) => {
    const orig = proto[name];
    proto[name] = function (...args) {
      if (noted && depth === 0) noted.push(fxBy ? [as, conv(args), fxBy, fxShot] : [as, conv(args)]);
      depth++;
      try { return orig.apply(this, args); } finally { depth--; }
    };
  };
  for (const m of FX_CALLS) wrap(Fx.prototype, m);
  wrap(Fx.prototype, 'thrownGun', 'thrownGun', ([f, w]) => [ser(f), w.def?.key ?? null]);
  wrap(Lights.prototype, 'flash', 'flash');
  // (what a shot sets off, and a reload's spent cases: its player has done those)
  for (const name of ['shoot', 'reloadEvent']) {
    const orig = Fighter.prototype[name];
    Fighter.prototype[name] = function (...args) {
      const was = fxShot;
      fxShot = 1;
      try { return orig.apply(this, args); } finally { fxShot = was; }
    };
  }
}
function playEffects(list) {
  const self = N.watching ? null : A.game.fighters.find((f) => f.peer === myId())?.nid;
  for (const [m, args, by, shot] of list) {
    if (by && by === self && (shot || OWN_MOVES.has(m))) continue;
    if (m === 'flash') {
      A.game.lights.flash(...args);
      // something big going off close by: the screen feels it
      if (args[2] >= 150) { const p = A.player, near = p ? Math.max(0, 1 - Math.hypot(p.x - args[0], p.y - args[1]) / 300) : 0; if (near > 0) A.renderer.kick((Math.random() - 0.5) * 8 * near, -6 * near); }
    } else if (m === 'thrownGun') { const f = rev(args[0]); if (f && args[1]) A.game.fx.thrownGun(f, { icon: A.iconOf(args[1]) }); }
    else A.game.fx[m]?.(...args.map((a) => rev(a)));
  }
}

// ---------- the state of the game, as plain data ----------
// Fighters, props and weapons go by reference ({$f: id}, {$p: id}, a weapon by
// its key and its state); canvases, caches and the like are left out, and so is anything of ours
// that starts with _ (screens' own notes), bar a gun's spare rounds.
const SKIP = new Set(['game', 'images', 'parts', 'hands', 'selfCanvas', 'rollCanvas', 'rollGhost', 'pix', 'art', 'def', 'ammoSource', 'events', 'level', 'nav', 'img', 'staminaA', 'staminaSeen', 'staminaT', 'rw', 'sq']);
const nidOf = (f) => (f.nid ??= ++N.nextNid);
function ser(v, d = 0) {
  if (v === null || v === undefined) return null;
  const ty = typeof v;
  if (ty === 'number') return Number.isFinite(v) ? (Number.isInteger(v) ? v : Math.round(v * 100) / 100) : 0;
  if (ty === 'string' || ty === 'boolean') return v;
  if (ty !== 'object' || d > 7) return undefined;
  if (v instanceof Fighter) return { $f: nidOf(v) };
  if (v instanceof Prop) return { $p: (v.nid ??= ++N.propIds) };
  if (v instanceof Weapon) return { $w: v.def.key, s: { ...serObj(v, d), _reserve: v.reserve } };
  if (v instanceof MeleeWeapon) return { $m: meleeKey(v), s: serObj(v, d) };
  if (Array.isArray(v)) return v.map((x) => { const s = ser(x, d + 1); return s === undefined ? null : s; });
  if (v instanceof Map || v instanceof Set || v instanceof HTMLCanvasElement || v instanceof HTMLImageElement || v instanceof CanvasRenderingContext2D) return undefined;
  return serObj(v, d);
}
function serObj(o, d) {
  const out = {};
  for (const k of Object.keys(o)) {
    if (SKIP.has(k) || k[0] === '_') continue;
    const s = ser(o[k], d + 1);
    if (s !== undefined) out[k] = s;
  }
  return out;
}
const meleeKey = (m) => m.def.key ?? (m.def.fists ? '_fists' : '_');
function rev(v, prev) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => rev(x));
  if ('$f' in v) return N.fighters.get(v.$f) ?? null;
  if ('$p' in v) return N.props.get(v.$p) ?? null;
  if ('$w' in v) {
    let w = prev instanceof Weapon && prev.def.key === v.$w ? prev : null;
    if (!w && A.weapons[v.$w]) {
      const gun = (w = new Weapon(A.weapons[v.$w]));
      gun.ammoSource = { count: () => gun._reserve ?? 0, take: (c, k) => { const t = Math.min(k, gun._reserve ?? 0); gun._reserve = (gun._reserve ?? 0) - t; return t; }, give() {} };
    }
    if (w) assign(w, v.s);
    return w;
  }
  if ('$m' in v) {
    const def = v.$m === '_fists' ? N.fistsDef : MELEE[v.$m];
    let m = prev instanceof MeleeWeapon && meleeKey(prev) === v.$m ? prev : null;
    if (!m && def) m = new MeleeWeapon(def);
    if (m) assign(m, v.s);
    return m ?? prev;
  }
  const o = {};
  for (const k in v) o[k] = rev(v[k]);
  return o;
}
function assign(target, s) {
  for (const k in s) target[k] = rev(s[k], target[k]);
}

// How each field's sent. (After its first time, which is always all of it.)
// - up: runs on upward by itself on each screen - only sent when it starts over
// - down: runs out by itself on each screen - only sent when it's set again
// - once: worked out on each screen for itself - never again
// - run: a progress (a reload, a swing) running on by itself: sent when it starts, stops or starts over
// - a number: only sent when it's changed by that much (rounded to it)
// Timers that run on down past nothing are cut off at nothing, so they don't look changed for ever.
const F_RULES = {
  hurtT: 'up', lastFireT: 'up', beamT: 'up', deadT: 'up', flash: 'down', throwT: 'run',
  pose: 'once', animT: 'once', frame: 'once', state: 'once', sq: 'once', sqV: 'once', settle: 'once', tilt: 'once', blinkIn: 'once', blinkLeft: 'once', climbT: 'once', aimTarget: 'once', pickupPressed: 'once', trail: 'once', triggerHeld: 'once',
  hp: 1, stamina: 1, skillCD: 0.1, shield: 0.1, grenadeCD: 0.1, respawnT: 0.1, staminaRest: 0.02, coyote: 0.01, jumpBuf: 0.01, dropT: 0.01, ladderCool: 0.01, rollCool: 0.01, rollCrouch: 0.01, boostT: 0.1,
};
const GUN_RULES = { cooldown: 'down', recoil: 'down', climb: 'down', flash: 'down', heat: 'down', cycleT: 'down', drawT: 'down', acting: 'down', actDelay: 'down', reload: 'run' };
const MELEE_RULES = { t: 'run', sinceHit: 'once', climb: 'once', engage: 'once', holdT: 'once', recoil: 'once', chain: 'once', drawT: 'down', cooldown: 'down', sawing: 'down', reload: 'run' };
const PROP_RULES = { flash: 'down', rot: 0.05, landed: 'once', dissolve: 'once' };
const PICKUP_RULES = { life: 'once', bob: 'once', noGrab: 'once', beam: 'once', uid: 'once' };
const FAST = new Set(['x', 'y', 'vx', 'vy', 'aim', 'facing', 'onGround', 'onLadder', 'crouch', 'gun', 'melee', 'decoy']);
const CLAMPED = new Set(['skillCD', 'shield', 'grenadeCD', 'respawnT', 'staminaRest', 'coyote', 'jumpBuf', 'dropT', 'ladderCool', 'rollCool', 'rollCrouch', 'boostT']);
function changed(key, o, rules = {}, leave = null) {
  const first = !N.sent.has(key), last = N.sent.get(key) ?? {}, out = {};
  for (const k of Object.keys(o)) {
    if (SKIP.has(k) || (k[0] === '_' && k !== '_reserve') || leave?.has(k)) continue;
    let v = o[k];
    const rule = rules[k];
    if (typeof v === 'number') {
      if (CLAMPED.has(k) && v < 0) v = 0;
      if (typeof rule === 'number' && rule > 0) v = Math.round(v / rule) * rule;
    }
    if (!first && rule) {
      const seen = last['#' + k];
      last['#' + k] = v;
      if (rule === 'once') continue;
      if (rule === 'up' && !(v < seen)) continue;
      if (rule === 'down' && !(v > seen)) continue;
      if (rule === 'run' && !(v < seen || (v >= 0) !== (seen >= 0))) continue;
    } else if (rule) last['#' + k] = v;
    if (k === 'roll' && v) v = { t: v.t, dir: v.dir, spin: v.spin };   // (its afterimages each screen does for itself)
    const s = ser(v, 1);
    if (s === undefined) continue;
    const j = JSON.stringify(s);
    if (last[k] !== j) { out[k] = s; last[k] = j; }
  }
  N.sent.set(key, last);
  return out;
}
// what's changed of what's in a fighter's hand
function handDelta(f, out) {
  const last = N.sent.get(f) ?? {};
  // (now and then all of it, whatever's changed: a screen that guessed wrong puts itself right)
  if (f.gun && N.snapN % 90 === (f.nid % 8) * 10) N.sent.delete(f.gun);
  if (f.melee && N.snapN % 90 === (f.nid % 8) * 10) N.sent.delete(f.melee);
  if (f.gun) {
    const d = changed(f.gun, Object.assign(Object.create(null), f.gun, { _reserve: f.gun.reserve }), GUN_RULES);
    if (Object.keys(d).length || last.$gun !== f.gun.def.key) out.gun = { $w: f.gun.def.key, s: d };
    last.$gun = f.gun.def.key;
  } else if (last.$gun !== null) { out.gun = null; last.$gun = null; }
  const d = changed(f.melee, f.melee, MELEE_RULES), mk = meleeKey(f.melee);
  if (Object.keys(d).length || last.$melee !== mk) out.melee = { $m: mk, s: d };
  last.$melee = mk;
  N.sent.set(f, last);
}
// Lists sent whole, while there's anything in them and it's changed (things few and short-lived)
const LISTS = [['gr', 'grenades'], ['th', 'thrown'], ['ar', 'arrows'], ['vo', 'voids'], ['ga', 'galaxies'], ['de', 'demons']];
// Things that happen once and run their course on each screen: sent the once
const ONCE = [['nu', 'numbers'], ['bl', 'blasts'], ['pu', 'punches'], ['fi', 'fists'], ['fe', 'feed']];
const LIFE = { numbers: 0.9, blasts: 0.35, punches: 0.45, fists: 0.6 };
const uidOf = (o) => (o.uid ??= ++N.uids);
const fastOf = (f) => [ser(f.x), ser(f.y), Math.round(f.vx), Math.round(f.vy), Math.round(f.aim * 1000) / 1000, (f.onGround ? 1 : 0) | (f.onLadder ? 2 : 0) | (f.crouch ? 4 : 0) | (f.facing > 0 ? 8 : 0)];
function snapshot() {
  const g = A.game;
  N.snapN++;
  const s = { t: Math.round(g.time * 1000) / 1000, rt: Math.round(performance.now()) / 1000 };
  // how the round stands: what's changed
  const hd = { st: A.state, sT: Math.round(A.stateT * 10) / 10, rd: A.round, rT: Math.round(A.roundT * 2) / 2, ot: A.overtime, sl: A.slow, wi: ser(A.winner), ch: ser(A.champion), bk: A.banner?.text ?? null, la: g.lights.lamps.map((l) => (l.on ? 1 : 0)).join('') };
  const h = {};
  for (const k in hd) { const j = JSON.stringify(hd[k]); if (N.hdrSent[k] !== j) { h[k] = hd[k]; N.hdrSent[k] = j; } }
  if ('bk' in h) h.bn = ser(A.banner);
  if (Object.keys(h).length) s.h = h;
  // the fighters
  s.f = g.fighters.map((f) => {
    const e = { n: nidOf(f) };
    if (!N.sent.has(f)) e.i = [f.name, f.color, f.hue ?? 0, f.sat ?? 1, f.team ?? 0, f.peer ?? null];
    const delta = changed(f, f, F_RULES, FAST);
    if (f.decoy !== f._decoySent) { delta.decoy = ser(f.decoy); f._decoySent = f.decoy; }
    handDelta(f, delta);
    if (Object.keys(delta).length) e.s = delta;
    const k = fastOf(f), j = k.join();
    if (j !== f._kSent) { e.k = k; f._kSent = j; }
    if (f.peer && f.peer !== myId()) { const c = N.ctl.get(f.peer); if (c && c.ack !== f._ackSent) { e.a = c.ack; f._ackSent = c.ack; } }
    return e;
  });
  // the props: those new or changed, and which have gone
  const ids = new Set(), ps = [];
  for (const p of g.props) {
    const n = (p.nid ??= ++N.propIds), d = changed(p, p, PROP_RULES);
    ids.add(n);
    const fresh = !N.propLive.has(n);
    if (fresh || Object.keys(d).length) ps.push(fresh ? { n, k: p.kind, s: d } : { n, s: d });
  }
  const pd = [...N.propLive].filter((n) => !ids.has(n));
  N.propLive = ids;
  if (ps.length) s.p = ps;
  if (pd.length) s.pd = pd;
  // what's lying about to be picked up
  const pk = [];
  for (const p of g.pickups) { uidOf(p); const fresh = !N.sent.has(p), d = changed(p, p, PICKUP_RULES); if (fresh) d.uid = p.uid; if (Object.keys(d).length) pk.push([p.uid, d]); }
  const pkIds = g.pickups.map((p) => p.uid).join();
  if (pkIds !== N.pkSent) { s.pl = g.pickups.map((p) => p.uid); N.pkSent = pkIds; }
  if (pk.length) s.pk = pk;
  // the shots: each new one (where it is now, how far it's come), and how far each one that's ended got
  const bs = N.newShots.map((b) => { N.liveShots.add(b); return [b.id, ser(b.x), ser(b.y), ser(b.vx), ser(b.vy), Math.round(b.travelled), nidOf(b.owner), b.sq]; });
  N.newShots = [];
  const bd = [];
  for (const b of N.liveShots) if (b.dead) { bd.push([b.id, Math.round(b.travelled)]); N.liveShots.delete(b); }
  if (bs.length) s.bs = bs;
  if (bd.length) s.bd = bd;
  // the lists
  const l = {};
  for (const [k, name] of LISTS) {
    for (const o of g[name]) if (o && typeof o === 'object') uidOf(o);
    const v = ser(g[name]), j = JSON.stringify(v);
    if (N.listSent[k] !== j) { l[k] = v; N.listSent[k] = j; }
  }
  if (Object.keys(l).length) s.l = l;
  const ev = {};
  for (const [k, name] of ONCE) {
    const fresh = g[name].filter((o) => !o._sent);
    if (fresh.length) { ev[k] = ser(fresh); for (const o of fresh) o._sent = true; }
  }
  if (Object.keys(ev).length) s.ev = ev;
  if (noted?.length) s.fx = noted;
  return s;
}

// (on the others' screens) a state from the host, put into the game
function applySnapshot(s) {
  const g = A.game, me = myId();
  // where the host is in time against us, and how unevenly its states get here: how much later than
  // the best lately this one came. (Time by when it arrived, not when this frame got to it.)
  const lag = s.rt - s._at;
  N.offset = N.offset === undefined || lag > N.offset ? lag : N.offset + (lag - N.offset) * 0.005;
  N.jit = Math.max(N.offset - lag, N.jit * 0.985);
  if (N.lastRt !== undefined && s.rt > N.lastRt) N.gap += (s.rt - N.lastRt - N.gap) * 0.1;
  N.lastRt = s.rt;
  if (s.h) applyHeader(s.h);
  // the fighters: any new ones made (a shadow clone), any gone dropped, each brought up to date
  const keep = [];
  for (const e of s.f) {
    let f = N.fighters.get(e.n);
    if (!f) {
      if (!e.i) { askResync(); continue; }
      const [name, color, hue, sat, team, peer] = e.i;
      f = new Fighter(g, A.images, { name, color, hue, sat });
      f.nid = e.n;
      f.team = team;
      f.peer = peer;
      N.fighters.set(e.n, f);
    }
    keep.push(f);
    const own = f.peer === me && !N.watching;
    if (own && e.a !== undefined && e.a > N.ack) N.ack = e.a;
    if (e.k) {
      const [x, y, vx, vy, aim, b] = e.k, onGround = !!(b & 1), onLadder = !!(b & 2), crouch = !!(b & 4), facing = b & 8 ? 1 : -1;
      f._sx = x; f._sy = y; f._aim = aim;
      if (own) { Object.assign(N.auth, { x, y, vx, vy, onGround, onLadder, crouch, facing }); N.authNew = true; }
      else Object.assign(f, { vx, vy, onGround, onLadder, crouch, facing });
    }
    if (e.s) applyFighter(f, e.s, own);
    if (own && e.a !== undefined) N.authNew = true;
    if (f._sx !== undefined) {
      (f._h ??= []).push({ t: s.rt, x: f._sx, y: f._sy, a: f._aim ?? f.aim });
      if (f._h.length > 16) f._h.shift();
    }
  }
  for (const id of [...N.fighters.keys()]) if (!keep.includes(N.fighters.get(id))) N.fighters.delete(id);
  g.fighters = keep;
  const mine = keep.find((f) => f.peer === me);
  if (mine && !N.watching) A.player = mine;
  else if (!keep.includes(A.player) || (N.watching && A.player === mine && !mine.alive)) A.player = keep.find((f) => !f.isDecoy) ?? keep[0] ?? A.player;
  // our own fighter's hand: the host's caught up with everything we've done, so its word goes
  if (mine && !N.watching && N.ack >= N.combatSeq) flushDeferred(mine);
  // the props
  if (s.p || s.pd) {
    for (const e of s.p ?? []) {
      let p = N.props.get(e.n);
      if (!p) { p = new Prop(e.k, 0, 0); p.nid = e.n; N.props.set(e.n, p); }
      const dx = p.x, dy = p.y, seen = p._seen;
      assign(p, e.s);
      // (moved: eased there - see clientFrame)
      p._tx = p.x; p._ty = p.y;
      if (seen) { p.x = dx; p.y = dy; }
      p._seen = true;
    }
    for (const n of s.pd ?? []) N.props.delete(n);
    g.props = [...N.props.values()];
  }
  // what's lying about
  for (const [uid, d] of s.pk ?? []) {
    let p = N.pickups.get(uid);
    if (!p) N.pickups.set(uid, (p = { uid, life: 30, bob: 0, beam: 0, ready: false, vx: 0, vy: 0 }));
    assign(p, d);
  }
  if (s.pl) {
    const live = new Set(s.pl);
    for (const uid of [...N.pickups.keys()]) if (!live.has(uid)) N.pickups.delete(uid);
    g.pickups = s.pl.map((uid) => N.pickups.get(uid)).filter(Boolean);
  }
  // the shots: new ones, carried on by each screen from here (ours that we've fired already, not again);
  // ended ones, how far they got
  for (const [id, x, y, vx, vy, tr, owner, sq] of s.bs ?? []) {
    const o = N.fighters.get(owner), ownShot = sq && o && o.peer === me && !N.watching && N.predicted.has(sq);
    if (ownShot) continue;
    N.shots.push({ id, x0: x, y0: y, vx, vy, speed: Math.hypot(vx, vy) || 1, rt0: s.rt, tr0: tr, owner: o, x, y, travelled: 0, end: Infinity, dead: false });
  }
  for (const [id, tr] of s.bd ?? []) { const b = N.shots.find((o) => o.id === id); if (b) b.end = tr; }
  // the lists
  if (s.l) for (const [k, name] of LISTS) if (k in s.l) {
    const list = rev(s.l[k]) ?? [], trk = N.trk;
    for (const o of list) {
      if (!o) continue;
      if (name === 'thrown' && !o.img) o.img = o.kind === 'gun' ? A.iconOf(o.key) : MELEE[o.key]?.img;
      if (o.uid === undefined) continue;
      const was = trk.get(o.uid);
      if (was?.pix) o.pix = was.pix;
      if (was?.burn) o.burn = was.burn;
      o._hx = o.x; o._hy = o.y; o._rt = s.rt;
      if (was) { o._px = was.x; o._py = was.y; }
      trk.set(o.uid, o);
    }
    g[name] = list;
  }
  if (trackAge++ > 300) { trackAge = 0; const live = new Set(); for (const [, name] of LISTS) for (const o of g[name]) if (o?.uid !== undefined) live.add(o.uid); for (const uid of [...N.trk.keys()]) if (!live.has(uid)) N.trk.delete(uid); }
  g.time = s.t;
  // what's happened: shown as it comes to be drawn (ours at once), rather than before what's drawn gets there
  if (s.ev || s.fx) N.later.push({ rt: s.rt, ev: s.ev, fx: s.fx });
}
let trackAge = 0;
function applyHeader(h) {
  const g = A.game;
  if ('rd' in h && h.rd !== A.round) {
    // a new round: a clean level, nothing left over from the last
    g.fx = new Fx(g.level);
    g.lights = new Lights(g.level);
    N.shots = [];
    N.local = [];
    N.later = [];
    N.pickups.clear();
    N.trk.clear();
    for (const name of ['bullets', 'grenades', 'pickups', 'thrown', 'arrows', 'voids', 'galaxies', 'demons', 'numbers', 'blasts', 'punches', 'fists', 'feed']) g[name] = [];
  }
  if ('st' in h) A.state = h.st;
  if ('sT' in h) A.stateT = h.sT;
  if ('rd' in h) A.round = h.rd;
  if ('rT' in h) A.roundT = h.rT;
  if ('ot' in h) A.overtime = h.ot;
  if ('sl' in h) A.slow = h.sl;
  if ('bn' in h) A.banner = rev(h.bn);
  if ('wi' in h) A.winner = rev(h.wi);
  if ('ch' in h) A.champion = rev(h.ch);
  if ('la' in h) [...h.la].forEach((c, i) => { const l = g.lights.lamps[i]; if (l) l.on = c === '1'; });
}
function askResync() {
  const now = performance.now();
  if (now - (N.resyncAt ?? -9e9) < 1000) return;
  N.resyncAt = now;
  N.room?.send({ t: 'resync' }, N.room.hostId);
}
// What of a fighter is ours to say, when it's our own:
// where it is, and how its feet stand (the stand-in has those; the host's word goes to it - see reconcile)
const AUTH_KEYS = ['coyote', 'jumpBuf', 'dropT', 'airJumps', 'airRoll', 'ladderCool', 'rollCool', 'rollCrouch', 'stamina', 'staminaRest', 'winded', 'boostT', 'roll', 'sprinting'];
// what's in hand (the fighter itself has those, run here at once - see stepOwn; the host's word
// waits till it's heard about everything we've done with them)
const HAND_KEYS = ['slot', 'quick', 'gun', 'melee', 'grenades', 'throwT', 'lastFireT'];
const GUN_LOOKS = ['recoil', 'climb', 'flash', 'cycleT', 'heat', 'cooldown', 'acting', 'actDelay', 'spent', 'burstLeft', 'reloadQueued', 'drawT', 'cycle', 'spentIn'];
const MELEE_LOOKS = ['side', 'move', 'step', 'hand', 'cooldown', 'drawT', 't', 'hits'];
const skillBusy = (f) => !!(f.cloak || f.decoy || f.veil || f.bow || f.mura || f.blaze || f.gal || f.summon || f.lunge);
function applyFighter(f, s, own) {
  if (own) {
    for (const k of AUTH_KEYS) if (k in s) { N.auth[k] = s[k] === null ? null : typeof s[k] === 'object' ? rev(s[k]) : s[k]; N.authNew = true; delete s[k]; }
    if (s.hp !== undefined && s.hp < f.hp && f.alive) A.renderer.kick((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 4);   // (hit: the screen feels it)
    if (!skillBusy(f)) {
      // a slash from a skill (the grapple's spin) we don't do ourselves; the rest we have
      if (s.slashes) { for (const sl of s.slashes) if (sl?.spin && !f.slashes.some((o) => o.spin)) f.slashes.push(rev(sl)); delete s.slashes; }
      const d = N.deferred;
      for (const k of HAND_KEYS) {
        if (!(k in s)) continue;
        const v = s[k];
        // (a gun's or a swing's looks are ours already, from the shots we've fired: only the rest of it is the host's)
        if (v?.$w) for (const l of GUN_LOOKS) delete v.s[l];
        if (v?.$m) for (const l of MELEE_LOOKS) delete v.s[l];
        const was = d[k];
        if (v && was && (was.$w === v.$w && was.$w || was.$m === v.$m && was.$m)) Object.assign(was.s, v.s);
        else d[k] = v;
        delete s[k];
      }
    }
  }
  if (s.roll) s.roll.trail = f.roll?.trail ?? [];
  assign(f, s);
}
function flushDeferred(f) {
  const d = N.deferred;
  if (!Object.keys(d).length) return;
  N.deferred = {};
  // (not the reload's progress, while ours is running on ahead of the host's: only if it's over)
  const g = d.gun, w = f.gun;
  if (g?.$w && w && w.def.key === g.$w && w.reloading && g.s.reload >= 0) delete g.s.reload;
  assign(f, d);
}

// ---------- the host's side ----------

// Where a fighter was, this long ago (the host keeps a note of it, every frame). A player's shot is
// judged against where they saw everyone when they fired: they send what time it was on the host, as
// far as what they were looking at goes, and it's tested as if the others were still there then.
// (Not if they've jumped since - a respawn; and only so far back.)
function pastOf(f, ago) {
  const h = f._past;
  if (!h?.length) return null;
  const t = performance.now() / 1000 - ago;
  for (let i = h.length - 1; i > 0; i--) {
    const a = h[i - 1], b = h[i];
    if (a.t > t) continue;
    if (Math.hypot(b.x - a.x, b.y - a.y) > 60) return null;
    const k = b.t > a.t ? Math.min(1, (t - a.t) / (b.t - a.t)) : 1;
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  }
  return null;
}
function notePositions() {
  const now = performance.now() / 1000;
  for (const f of A.game.fighters) {
    const h = (f._past ??= []);
    h.push({ t: now, x: f.x, y: f.y });
    while (h.length > 2 && h[0].t < now - 0.5) h.shift();
  }
}

// A command, as it goes over the wire: its number, the keys held as bits, the aim, what's aimed at.
const BITS = ['up', 'down', 'jump', 'jumpHeld', 'fire', 'reload', 'sprint', 'roll', 'melee', 'meleeHeld', 'skill', 'crouch', 'drop', 'throwWeapon', 'pickup', 'grenade'];
const PRESSES = ['jump', 'reload', 'roll', 'melee', 'skill', 'drop', 'throwWeapon', 'pickup', 'grenade'];
function encodeCmd(c) {
  let b = (Math.sign(c.move || 0) + 1) << 16;
  BITS.forEach((k, i) => { if (c[k]) b |= 1 << i; });
  const out = [c.seq, b, c.aim === null || c.aim === undefined ? null : Math.round(c.aim * 1000), c.target ? Math.round(c.target.x) : null, c.target ? Math.round(c.target.y) : null];
  if (c.slot || c.cycle) out.push(c.slot || 0, c.cycle || 0);
  return out;
}
// (the host) what came in, as a command - nothing in it taken on trust
function decodeCmd(r) {
  if (!Array.isArray(r) || !Number.isInteger(r[0]) || !Number.isInteger(r[1])) return null;
  const b = r[1], c = { seq: r[0], move: ((b >> 16) & 3) - 1 };
  BITS.forEach((k, i) => { c[k] = !!(b & (1 << i)); });
  c.aim = Number.isFinite(r[2]) ? r[2] / 1000 : null;
  c.target = Number.isFinite(r[3]) && Number.isFinite(r[4]) ? { x: r[3], y: r[4] } : null;
  c.slot = r[5] === 1 || r[5] === 2 || r[5] === 3 ? r[5] : 0;
  c.cycle = r[6] === 1 || r[6] === -1 ? r[6] : 0;
  return c;
}
function ctlOf(peer) {
  let e = N.ctl.get(peer);
  if (!e) N.ctl.set(peer, (e = { q: [], last: 0, ack: 0, bank: 0.1, pace: 0, at: 0, rewind: 0 }));
  return e;
}
// (the host) each other player's fighter, moved by their commands, one at a time - evenly, however they
// came in. Their time is real time: a burst after a hold-up gets through quicker, but no more than
// they've been held up (the bank), so nobody can run faster by sending more.
export function updateRemotes(dt, live) {
  if (N.mode !== 'host') return;
  const real = dt / (A.slow || 1), now = performance.now();
  for (const f of A.game.fighters) {
    if (!f.peer || f.peer === myId() || f.isDecoy) continue;
    const e = N.ctl.get(f.peer), m = N.members.find((x) => x.id === f.peer), on = live && m && !m.away;
    if (!e) { f.update(dt, A.IDLE); continue; }
    if (!f.alive || !on) {
      if (e.q.length) { e.ack = e.q.at(-1).seq; e.q.length = 0; }
      f.update(dt, A.IDLE);
      continue;
    }
    e.bank = Math.min(0.3, e.bank + real);
    e.pace = Math.min(STEP * 3, e.pace + real * (e.q.length > 4 ? 2 : e.q.length > 2 ? 1.25 : 1));
    fxBy = nidOf(f);
    f.rewind = e.rewind;
    let ran = 0;
    while (e.q.length && e.pace >= STEP * 0.999 && e.bank >= STEP * 0.999 && f.alive) {
      const c = e.q.shift();
      e.pace -= STEP;
      e.bank -= STEP;
      e.ack = c.seq;
      if (c.pickup) f.pickupPressed = true;
      f.shotSeed = c.seq;
      f.update(STEP * A.slow, c);
      ran++;
    }
    if (!e.q.length) e.pace = Math.min(e.pace, STEP);
    // gone quiet: hands off, rather than hang in the air as they were
    if (!ran && !e.q.length && now - e.at > CTL_STALE * 1000) f.update(dt, A.IDLE);
    fxBy = 0;
  }
}
// (the host) the state of the game out to everyone
export function hostFrame(dt) {
  if (N.mode !== 'host' || !N.playing || !N.room) return;
  noted ??= [];
  notePositions();
  // seats held for players who've dropped out: only so long
  for (const m of [...N.members]) if (m.away && performance.now() - m.away > SEAT_HOLD * 1000) dropMember(m);
  N.sendT -= dt;
  // (not a burst of them, catching up after a hold-up here: only the latest's any use)
  const clock = performance.now();
  if (N.sendT > 0 || clock - (N.sentAt ?? -1e9) < snapEvery() * 700) return;
  N.sentAt = clock;
  N.sendT = Math.max(0, N.sendT + snapEvery());   // (what's over carries on: so many a second whatever the step)
  if (A.round !== N.sentRound) { N.sentRound = A.round; N.liveShots.clear(); }
  const s = snapshot();
  noted = [];
  if (!N.room.peers.size) return;
  // (not to those who've gone back to the room: they aren't looking)
  const out = N.members.filter((m) => m.out && m.id !== myId()).map((m) => m.id);
  const to = out.length ? [...N.room.peers].filter((id) => !out.includes(id)) : null;
  if (!to || to.length) N.room.snap.send(s, to ? { target: to } : undefined);
}

// ---------- the player's side ----------

// (the others) a frame: what's come in put in, our fighter's commands run, everyone else eased along
export function clientFrame(dt) {
  const g = A.game;
  if (N.snaps.length) { for (const s of N.snaps.splice(0)) applySnapshot(s); N.gotSnap = true; }
  if (!N.gotSnap) return;
  g.time += dt;
  // how far back to draw everyone: a state's gap, how much later than the best they've been lately, a hair.
  // Longer quickly, shorter slowly (a change of pace nobody sees)
  const want = Math.max(DELAY_MIN, Math.min(DELAY_MAX, N.gap + N.jit * 1.1 + 0.008));
  if (N.delay === undefined) N.delay = want;
  N.delay += Math.max(-dt * 0.06, Math.min(dt * 0.6, want - N.delay));
  const hostNow = performance.now() / 1000 + (N.offset ?? 0), then = hostNow - N.delay;
  N.then = then;
  // what's happened, as it comes to be drawn
  while (N.later.length && N.later[0].rt <= then) {
    const { ev, fx } = N.later.shift();
    if (ev) playOnce(ev);
    if (fx) playEffects(fx);
  }
  const live = A.state === 'fight' || A.state === 'end';
  const self = N.watching ? null : g.fighters.find((f) => f.peer === myId());
  const predicting = !!self && live && self.alive;
  if (predicting) runOwn(self, dt);
  else if (self) {
    // (out of the fight, or not started: where the host says, no commands to run)
    N.pending.length = 0;
    N.prev = null;
    N.err.x = N.err.y = 0;
    if (N.ghost) N.ghost.synced = false;
    for (const k of ['vx', 'vy', 'onGround', 'onLadder', 'crouch', 'facing']) if (N.auth[k] !== undefined) self[k] = N.auth[k];
    self.roll = N.auth.roll ? { ...N.auth.roll, trail: self.roll?.trail ?? [] } : null;
    N.authNew = false;
  }
  for (const f of g.fighters) {
    const mine = predicting && f === self;
    f.coast(dt, !mine, !(mine && !skillBusy(f)));
    if (mine) continue;
    const h = f._h;
    if (!h?.length) continue;
    // drawn where it was at `then`, eased between the two states either side
    let a = h[0], b = h[h.length - 1];
    for (let i = h.length - 1; i > 0; i--) if (h[i - 1].t <= then) { a = h[i - 1]; b = h[i]; break; }
    let x = b.x, y = b.y, aim = b.a;
    if (then <= h[0].t) { x = h[0].x; y = h[0].y; aim = h[0].a; }
    else if (then > b.t && h.length > 1) {
      // past the newest (a state late): on the way it was going, a little, rather than stop dead
      const p = h[h.length - 2], span = b.t - p.t, ahead = Math.min(then - b.t, 0.1);
      if (span > 0.005 && Math.hypot(b.x - p.x, b.y - p.y) < 60) { x = b.x + ((b.x - p.x) / span) * ahead; y = b.y + ((b.y - p.y) / span) * ahead; }
    } else if (then < b.t && b.t > a.t && Math.hypot(b.x - a.x, b.y - a.y) < 60) {   // (further apart than that: a respawn, a teleport - no gliding across)
      const k = (then - a.t) / (b.t - a.t);
      x = a.x + (b.x - a.x) * k;
      y = a.y + (b.y - a.y) * k;
      aim = a.a + Math.atan2(Math.sin(b.a - a.a), Math.cos(b.a - a.a)) * k;
    }
    f.x = x;
    f.y = y;
    f.aim = aim;
  }
  carryShots(dt, then, self);
  carryThings(dt, then, hostNow, self);
  for (const p of g.props) if (p._tx !== undefined && (p.x !== p._tx || p.y !== p._ty)) {
    if (Math.hypot(p._tx - p.x, p._ty - p.y) > 60 || Math.abs(p._tx - p.x) + Math.abs(p._ty - p.y) < 0.05) { p.x = p._tx; p.y = p._ty; }
    else { const k = Math.min(1, dt * 22); p.x += (p._tx - p.x) * k; p.y += (p._ty - p.y) * k; }
  }
  for (const p of g.props) p.flash -= dt;
  for (const p of g.pickups) { p.life -= dt; p.bob += dt; p.beam -= dt; p.ready = p.beam <= 0; }
  for (const o of g.galaxies) if (typeof o?.t === 'number') o.t += dt;
  for (const name in LIFE) {
    for (const o of g[name]) o.t += dt;
    g[name] = g[name].filter((o) => o.t < LIFE[name]);
  }
  g.feed = g.feed.filter((k) => k.t > 0);
  g.fx.update(dt);
  g.lights.update(dt);
  if (A.banner) { A.banner.t -= dt; if (A.banner.t <= 0) A.banner = null; }
  if (N.watching) {
    const f = A.player;
    N.deadT = f && !f.alive && !(f.respawnT > 0) ? N.deadT + dt : 0;
    if (N.deadT > 1.5) { N.deadT = 0; watchNext(1); }
    return;
  }
  sendCommands(dt, then);
}
// happenings sent the once, added to their lists
function playOnce(ev) {
  const g = A.game;
  for (const [k, name] of ONCE) if (ev[k]) g[name].push(...rev(ev[k]).filter(Boolean));
  if (g.feed.length > 5) g.feed.splice(0, g.feed.length - 5);
}
// The shots: those from the host, carried on from where it said, a straight line at the time we're drawing
// (hidden till then, so they come out of the gun as it's drawn firing, and stopped as far as they got);
// our own, fired here at once and flying through the level as we have it.
function carryShots(dt, then, self) {
  const g = A.game, out = [];
  for (const b of N.shots) {
    const d = b.tr0 + b.speed * (then - b.rt0);
    if (d >= b.end || d > 3000) { b.dead = true; continue; }
    if (d < 0) continue;
    const go = d - b.tr0;
    b.x = b.x0 + (b.vx / b.speed) * go;
    b.y = b.y0 + (b.vy / b.speed) * go;
    b.travelled = d;
    out.push(b);
  }
  N.shots = N.shots.filter((b) => !b.dead);
  for (const b of N.local) stepShot(b, dt, self);
  N.local = N.local.filter((b) => !b.dead);
  g.bullets = out.concat(N.local);
}
function stepShot(b, dt) {
  const g = A.game, L = g.level, dist = b.speed * dt, n = Math.ceil(dist / 3), ux = b.vx / b.speed, uy = b.vy / b.speed;
  for (let i = 0; i < n && !b.dead; i++) {
    b.x += (b.vx * dt) / n;
    b.y += (b.vy * dt) / n;
    b.left -= dist / n;
    b.travelled += dist / n;
    if (b.left <= 0) { b.dead = true; break; }
    if (L.solidAt(b.x, b.y)) { b.dead = true; g.fx.impact(b.x - ux * 2, b.y - uy * 2, -ux, -uy); g.lights.flash(b.x, b.y, 18, '255, 210, 150', 0.05); break; }
    if (g.props.some((p) => !p.dead && p.contains(b.x, b.y))) { b.dead = true; g.fx.impact(b.x - ux * 2, b.y - uy * 2, -ux, -uy); break; }
    for (const o of g.fighters) {
      if (o === b.owner || !o.alive || b.done.has(o) || !g.foes(b.owner, o) || !o.hitPart(b.x, b.y)) continue;
      b.done.add(o);
      if (o.shield > 0) { g.fx.sparks(b.x, b.y, 4, -ux, -uy, '#8ff0ff'); b.dead = true; break; }
      g.fx.blood(b.x, b.y, 3, ux, uy);   // (a touch at once; the host's own blood comes with its word on it)
      if (b.pierce > 0) b.pierce--;
      else { b.dead = true; break; }
    }
  }
}
// Grenades, things thrown, arrows, orbs: from the host's last word on where each was and how it was going, on to
// the time we're drawing (ours to now), and eased to there so a new word doesn't jump.
const FALLS = { grenades: 700, thrown: 800 };
function carryThings(dt, then, hostNow, self) {
  const g = A.game, k = Math.min(1, dt * 30);
  for (const name of ['grenades', 'thrown', 'arrows', 'voids']) for (const o of g[name]) {
    if (!o || o._hx === undefined) continue;
    const vx = o.vx ?? (o.sp !== undefined && o.done < 0 ? Math.cos(o.a) * o.sp : 0), vy = o.vy ?? (o.sp !== undefined && o.done < 0 ? Math.sin(o.a) * o.sp : 0);
    if (typeof o.t === 'number' && name === 'arrows') o.t += dt;
    const ours = self && (o.owner === self || o.owner?.owner === self), age = (ours ? hostNow : then) - o._rt;
    const tx = o._hx + vx * age, ty = o._hy + vy * age + 0.5 * (FALLS[name] ?? 0) * Math.max(0, age) * age;
    if (o._px === undefined || Math.hypot(tx - o._px, ty - o._py) > 50) { o.x = tx; o.y = ty; }
    else { o.x = o._px + (tx - o._px) * k; o.y = o._py + (ty - o._py) * k; }
    o._px = o.x;
    o._py = o.y;
  }
}

// Our own fighter, ours at once. The stand-in runs its movement - exactly as the host will, from the same commands
// at the same step - and the fighter runs what's in its hand, in a game of its own where shots are only shown
// and hits don't count. Drawn between the stand-in's last two steps, at this frame's moment.
const MOVE_COPY = ['x', 'y', 'vx', 'vy', 'onGround', 'onLadder', 'crouch', 'facing', 'roll', 'pose', 'sq', 'sqV', 'settle', 'state', 'animT', 'frame', 'climbT', 'sprinting', 'stamina', 'winded', 'boostT', 'rollCool'];
const GHOST_LOOKS = ['animT', 'frame', 'state', 'sq', 'sqV', 'settle', 'climbT', 'blinkIn', 'blinkLeft', 'pose', 'flash', 'hurtT', 'grenadeCD', 'lastFireT'];
function makeGhost(f) {
  const game = Object.create(A.game);   // the level and the props, as we have them
  const quiet = new Proxy({}, { get: () => () => {} });
  Object.defineProperty(game, 'fx', { get: () => (N.replaying ? quiet : A.game.fx) });
  Object.defineProperty(game, 'lights', { get: () => (N.replaying ? quiet : A.game.lights) });
  game.kick = () => {};
  const gh = new Fighter(game, A.images, { name: f.name, hue: 0, sat: 1 });
  gh.skill = null;
  gh.updateCombat = () => {};   // (moves only)
  gh.blazeStep = () => {};      // (the flame fist's blows are the host's)
  gh.die = () => {};            // (nor is it for us to say we're dead)
  Object.defineProperty(gh, 'held', { get: () => f.held });     // what's in hand slows it as it does ours
  Object.defineProperty(gh, 'melee', { get: () => f.melee, set() {} });
  Object.defineProperty(gh, 'slot', { get: () => f.slot, set() {} });
  Object.defineProperty(gh, 'hidden', { get: () => f.hidden });   // and the cloak
  return gh;
}
function makeHandGame() {
  const game = Object.create(A.game);
  // the effects are real (we want to see them) but a gun flung away empty's the host's to show
  Object.defineProperty(game, 'fx', { get: () => new Proxy(A.game.fx, { get: (t, k) => (k === 'thrownGun' ? () => {} : typeof t[k] === 'function' ? t[k].bind(t) : t[k]) }) });
  game.meleeHit = game.throwWeapon = game.throwGrenade = game.disarm = () => {};
  game.fireBullet = localShot;
  return game;
}
let handGame = null;
// A shot of ours, shown at once: where it goes is worked out as the host will, from the same numbers.
function localShot(f, x, y, a, speed, dmg, range, pierce) {
  const s = f.shoulder;
  if (!A.game.los(s.x, s.y, x, y)) { A.game.fx.sparks(x, y, 3, -Math.cos(a), -Math.sin(a)); return; }
  N.predicted.add(f.shotSeed);
  if (N.predicted.size > 400) N.predicted = new Set([...N.predicted].slice(-200));
  N.local.push({ local: true, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, speed, owner: f, left: range, travelled: 0, pierce, done: new Set(), dead: false });
}
// the stand-in put where the host says we were, at the last command it's run - and the same state of feet and skills
function loadAuth(gh, f) {
  const a = N.auth;
  for (const k of ['x', 'y', 'vx', 'vy', 'onGround', 'onLadder', 'crouch', 'facing', 'coyote', 'jumpBuf', 'dropT', 'airJumps', 'airRoll', 'ladderCool', 'rollCool', 'rollCrouch', 'stamina', 'staminaRest', 'winded', 'boostT']) if (a[k] !== undefined) gh[k] = a[k];
  gh.roll = a.roll ? { ...a.roll, trail: gh.roll?.trail ?? [] } : null;
  gh.hook = f.hook?.state === 'on' ? { ...f.hook } : null;
  gh.lunge = f.lunge ? { ...f.lunge } : null;
  for (const k of ['blaze', 'bow', 'mura', 'gal', 'summon']) gh[k] = f[k] ?? null;
  gh.alive = true;
}
function reconcile(gh, f) {
  if (!N.authNew) return;
  N.authNew = false;
  if (N.auth.x === undefined) return;
  const ox = gh.x, oy = gh.y, keep = {};
  for (const k of GHOST_LOOKS) keep[k] = gh[k];
  loadAuth(gh, f);
  while (N.pending.length && N.pending[0].seq <= N.ack) N.pending.shift();
  N.replaying = true;
  for (const c of N.pending) {
    gh.update(c.dt, c);
    if (c.kx || c.ky) { gh.vx += c.kx; gh.vy += c.ky; }
  }
  N.replaying = false;
  for (const k of GHOST_LOOKS) gh[k] = keep[k];
  // the difference, eased away (a long way off: a respawn, say - there at once)
  const dx = ox - gh.x, dy = oy - gh.y;
  if (!gh.synced || Math.hypot(dx + N.err.x, dy + N.err.y) > 72) { N.err.x = N.err.y = 0; N.prev = null; }
  else {
    N.err.x += dx; N.err.y += dy;
    if (N.prev) { N.prev.x -= dx; N.prev.y -= dy; }
    N.stats.fix = Math.max(N.stats.fix ?? 0, Math.hypot(dx, dy));
  }
  gh.synced = true;
}
const NO_PRESS = { ...Object.fromEntries(PRESSES.map((k) => [k, false])), slot: 0, cycle: 0 };
function runOwn(f, dt) {
  const gh = (N.ghost ??= makeGhost(f));
  reconcile(gh, f);
  if (!gh.synced) { if (f._sx === undefined) return; gh.x = f._sx; gh.y = f._sy; gh.synced = true; }
  // the controls this frame: a press is kept till a step's had it
  const c = !N.menu ? A.playerControl() : A.IDLE;
  for (const k of PRESSES) if (c[k]) N.latch[k] = true;
  if (c.fire) N.latch.fire = true;
  if (c.slot) N.latch.slot = c.slot;
  if (c.cycle) N.latch.cycle = c.cycle;
  if (c.aim !== null && c.aim !== undefined) f.aim = c.aim;
  f.aimTarget = c.target ?? null;
  N.acc = Math.min(N.acc + dt, STEP * 12);
  while (N.acc >= STEP) {
    N.acc -= STEP;
    const cmd = { ...c, ...NO_PRESS, ...N.latch, seq: ++N.seq, dt: STEP * A.slow, kx: 0, ky: 0 };
    N.latch = {};
    stepOwn(gh, f, cmd);
    if (N.pending.length < MAX_PENDING) N.pending.push(cmd);
    N.out_.push(encodeCmd(cmd));
    if (PRESSES.some((k) => cmd[k]) || cmd.slot || cmd.cycle || (cmd.fire && !N.lastFire)) N.urgent = true;
    N.lastFire = !!cmd.fire;
  }
  // drawn at this frame's moment, between the last two steps, with what's left of any difference
  const k = N.prev ? N.acc / STEP : 1, damp = Math.exp(-14 * dt);
  N.err.x *= damp;
  N.err.y *= damp;
  f.x = (N.prev ? N.prev.x + (gh.x - N.prev.x) * k : gh.x) + N.err.x;
  f.y = (N.prev ? N.prev.y + (gh.y - N.prev.y) * k : gh.y) + N.err.y;
  f.vx = gh.vx;
  f.vy = gh.vy;
}
function stepOwn(gh, f, cmd) {
  N.prev = { x: gh.x, y: gh.y };
  gh.update(cmd.dt, cmd);
  for (const k of MOVE_COPY) f[k] = gh[k];
  if (skillBusy(f)) { flushDeferred(f); return; }   // (hands full: all that's the host's)
  // what's in hand, here and now
  handGame ??= makeHandGame();
  const w = f.gun, was = { slot: f.slot, quick: f.quick, gun: w, ammo: w?.ammo, reload: w?.reloading, swing: f.melee.t >= 0, nades: f.grenades, melee: f.melee };
  const px = f.vx, py = f.vy, real = f.game;
  f.game = handGame;
  f.shotSeed = cmd.seq;
  f.grenadeCD -= cmd.dt;
  try { f.updateCombat(cmd.dt, cmd); } finally { f.game = real; }
  cmd.kx = f.vx - px;
  cmd.ky = f.vy - py;
  gh.vx += cmd.kx;
  gh.vy += cmd.ky;
  if (was.slot !== f.slot || was.quick !== f.quick || was.gun !== f.gun || was.ammo !== f.gun?.ammo || was.reload !== f.gun?.reloading || was.swing !== f.melee.t >= 0 || was.nades !== f.grenades || was.melee !== f.melee) N.combatSeq = cmd.seq;
}
// Our commands to the host: every so often, and at once for a press - it's been down since a step ago, and every
// moment it spends waiting here is a moment later it's done there.
function sendCommands(dt, then) {
  N.ctlT -= dt;
  N.ctlAgo += dt;
  if (!N.room || !N.out_.length || !(N.ctlT <= 0 || (N.urgent && N.ctlAgo >= STEP))) return;
  N.room.ctl.send({ c: N.out_, v: Math.round(then * 1000) }, { target: N.room.hostId });
  N.out_ = [];
  N.urgent = false;
  N.ctlT = ctlEvery();
  N.ctlAgo = 0;
}
// A fresh start for our end of a match
function resetOwn() {
  N.ack = 0;   // (the numbering carries on: commands still on their way from before aren't mistaken for these)
  N.pending = [];
  N.out_ = [];
  N.latch = {};
  N.acc = 0;
  N.ghost = null;
  N.auth = {};
  N.authNew = false;
  N.err = { x: 0, y: 0 };
  N.prev = null;
  N.combatSeq = 0;
  N.deferred = {};
  N.shots = [];
  N.local = [];
  N.predicted = new Set();
  N.later = [];
  N.pickups = new Map();
  N.trk = new Map();
  N.delay = undefined;
  N.offset = undefined;
  N.lastRt = undefined;
  N.jit = 0;
}
// What a screen that was only drawing the game has in the air: it isn't the real thing, and can't be run as if it was
function clearAir() {
  const g = A.game;
  for (const name of ['bullets', 'grenades', 'thrown', 'arrows', 'voids', 'galaxies', 'demons', 'blasts', 'punches', 'fists', 'numbers']) g[name] = [];
  N.shots = [];
  N.local = [];
  N.later = [];
}
// (the host) everything goes out whole next time
function sendAllAgain() {
  N.sent = new WeakMap();
  N.listSent = {};
  N.hdrSent = {};
  N.propLive = new Set();
  N.pkSent = null;
  for (const f of A.game.fighters) { f._kSent = undefined; f._ackSent = undefined; f._decoySent = undefined; }
}

// ---------- rooms ----------

// how many can play in the room: its slots that aren't closed or bots
const roomSize = () => N.slots.filter((x) => x.k === 'open' || x.k === 'p').length;
// who's in a slot (to play), who's only watching
const seatOf = (id) => N.slots.findIndex((x) => x.k === 'p' && x.id === id);
const seated = () => N.members.filter((m) => seatOf(m.id) >= 0);
const watchers = () => N.members.filter((m) => seatOf(m.id) < 0);
function lobbyAd() {
  return { name: N.roomName, mode: A.settings.mode, map: A.settings.map, n: seated().length, max: roomSize(), w: watchers().length, playing: N.playing, made: N.made, lock: !!N.pass, rid: N.room?.rid };
}
function roomState() {
  return { t: 'room', name: N.roomName, members: N.members, slots: N.slots, settings: { ...A.settings }, playing: N.playing, lock: !!N.pass, host: myId(), made: N.made };
}
// (the host) a player into slot i (if it's open), out of the one they were in
function moveTo(id, i) {
  const to = N.slots[i];
  if (!to || to.k !== 'open') return false;
  const from = N.slots.find((x) => x.k === 'p' && x.id === id);
  if (from) { from.k = 'open'; from.id = null; }
  to.k = 'p';
  to.id = id;
  return true;
}
// (the host) a slot that isn't a player's: open, closed or a bot
function setSlot(i, kind) {
  const x = N.slots[i];
  if (!x || x.k === 'p' || !['open', 'closed', 'bot'].includes(kind)) return;
  x.k = kind;
  shareRoom();
}
// A button that does something drastic asks first: the first click arms it (SURE?), a second within 2.5 s does it.
const asking = (id) => N.confirm?.id === id && performance.now() - N.confirm.at < 2500;
function sure(id) {
  if (asking(id)) { N.confirm = null; return true; }
  N.confirm = { id, at: performance.now() };
  return false;
}
// (the host) a player out of the room - and not back in for a minute
function kick(id) {
  const m = N.members.find((x) => x.id === id);
  if (!m || id === myId()) return;
  N.room.send({ t: 'kicked' }, id);
  N.banned.set(id, performance.now() + 60000);
  N.members = N.members.filter((x) => x !== m);
  for (const x of N.slots) if (x.k === 'p' && x.id === id) { x.k = 'open'; x.id = null; }
  say(`${m.name} WAS KICKED`, 2);
  shareRoom();
}
// (the host) someone else made host: they take the room over as it stands - its name, password,
// slots, settings - and this one becomes a player in it like the rest
function handOver(id) {
  const m = N.members.find((x) => x.id === id);
  if (!m || id === myId() || N.playing) return;
  for (const x of N.members) x.ready = x.id === id;
  N.room.send({ t: 'pass', pass: N.pass }, id);   // (for them alone: nobody else needs to see it)
  N.room.send({ t: 'host', to: id, st: roomState() });
  N.lobby?.advertise(null);
  N.room.hostId = id;
  N.mode = 'client';
  N.welcomed = true;
  N.hostSettings = { ...A.settings };
  N.locked = !!N.pass;
  N.pass = '';
  say(`${m.name} IS THE HOST NOW`, 2.5);
}
// (a player) made host: the room's ours to run now
function takeOver(st) {
  N.room.hostId = myId();
  N.mode = 'host';
  N.roomName = st.name;
  N.members = st.members;
  N.slots = st.slots;
  N.pass = N.heirPass ?? '';
  N.made = st.made ?? Date.now();
  N.playing = false;
  N.watching = false;
  N.out = false;
  N.menu = false;
  N.match = null;
  N.ctl = new Map();
  N.heirSent = null;
  noted = null;
  clearAir();
  A.state = 'net-room';
  A.banner = null;
  N.saved ??= { ...A.settings };
  Object.assign(A.settings, st.settings);
  for (const x of N.members) if (x.id === myId()) x.ready = true;
  say('YOU ARE THE HOST NOW', 2.5);
  shareRoom();
}
// (the host) everyone told how the room stands, the lobby too
function shareRoom() {
  if (N.mode !== 'host') return;
  N.room.send(roomState());
  N.lobby?.advertise(lobbyAd());
  // whoever'd take over if we went: the room's password goes to them (and no one else)
  const heir = N.members.find((m) => m.id !== myId()), note = heir ? `${heir.id}|${N.pass}` : null;
  if (heir && note !== N.heirSent) N.room.send({ t: 'pass', pass: N.pass }, heir.id);
  N.heirSent = note;
}
// (a player) the host's gone: the room carries on - the first of those left takes it over, as everyone can
// work out for themselves. A match going on is over (the game was on the host's machine), but nobody's thrown out.
function hostGone(id) {
  const r = N.room, members = N.members.filter((m) => m.id !== id), heir = members.find((m) => m.id === myId() || r.peers.has(m.id));
  if (!heir) { leaveRoom(true); say('THE HOST LEFT - THE ROOM IS GONE'); return; }
  const slots = N.slots.map((x) => (x.k === 'p' && x.id === id ? { k: 'open', id: null } : x));
  if (heir.id === myId()) {
    takeOver({ name: N.roomName, members, slots, settings: N.hostSettings ?? { ...A.settings }, made: N.made });
    return;
  }
  r.hostId = heir.id;
  N.members = members;
  N.slots = slots;
  N.playing = false;
  N.watching = false;
  N.out = false;
  N.menu = false;
  N.snaps = [];
  N.gotSnap = false;
  A.state = 'net-room';
  A.banner = null;
  for (const x of members) if (x.id === myId()) x.ready = false;
  say(`THE HOST LEFT - ${heir.name} IS THE HOST NOW`, 3);
}
// (the host) someone's really gone: their seat's free, and their fighter drops out of the game
function dropMember(m) {
  N.members = N.members.filter((x) => x !== m);
  for (const x of N.slots) if (x.k === 'p' && x.id === m.id) { x.k = 'open'; x.id = null; }
  N.ctl.delete(m.id);
  if (N.playing) for (const f of A.game.fighters) if (f.peer === m.id) { f.lives = 0; f.respawnT = 0; if (f.alive) f.die(null, 'LEFT', 0, 0); }
  say(`${m.name} LEFT`, 2);
  shareRoom();
}
// The connection's dropped: try to get back in the room, as the same player, for a while. (The host keeps
// a seat for a player a little while; if we were the host, whoever's taken over lets us in as a player.)
function losingConnection() {
  const room = N.room;
  if (!room) return;
  N.back = { rid: room.rid, server: N.server, t0: performance.now() };
  room.c.room = null;
  N.busy = 'LOST THE CONNECTION - GETTING BACK IN...';
  N.room = null;
  N.mode = N.mode === 'host' ? 'client' : N.mode;
  N.match = null;
  noted = null;
  getBack(N.back);
}
async function getBack(b) {
  while (N.back === b && performance.now() - b.t0 < 25000) {
    try {
      const r = await GameRoom.open(b.server, null, b.rid);
      if (N.back !== b) { r.leave(); return; }
      N.back = null;
      N.room = r;
      N.lobby = new Lobby(r.c, b.server);
      N.mode = 'client';
      N.welcomed = false;
      r.hostId = null;   // (whoever answers)
      hookRoom();
      r.send({ t: 'hello', name: N.name, skill: N.skill, pass: N.joinPass });
      setTimeout(() => { if (N.room === r && !N.welcomed) { leaveRoom(true); say('COULD NOT GET BACK IN - THE ROOM IS GONE'); } }, 8000);
      return;
    } catch {
      await new Promise((done) => setTimeout(done, 1500));
    }
  }
  if (N.back === b) { N.back = null; leaveRoom(true, true); say('LOST THE CONNECTION'); }
}

async function enterServer(server) {
  N.busy = `CONNECTING TO ${server.name}...`;
  try {
    N.lobby?.leave();
    N.server = server;
    N.lobby = await Lobby.join(server, N.name);
    A.state = 'net-lobby';
    N.sel = 0;
  } catch (e) {
    say('COULD NOT CONNECT - CHECK YOUR INTERNET');
    console.error(e);
  }
  N.busy = '';
}
function leaveServer() {
  leaveRoom(true);
  N.lobby?.leave();
  N.lobby = null;
  A.state = 'net-servers';
}

async function createRoom(name = '', pass = '') {
  N.busy = 'MAKING THE ROOM...';
  N.creating = null;
  try {
    N.room = await GameRoom.open(N.server, myId(), `game-${myId()}-${Date.now().toString(36)}`);   // (its own name: a room handed over to someone else lives on under the old one)
    N.mode = 'host';
    N.roomName = name.trim() || `${N.name}'S ROOM`;
    N.pass = pass;
    N.made = Date.now();
    N.playing = false;
    N.members = [{ id: myId(), name: N.name, skill: N.skill, ready: true }];
    // four open to start with (you in the first), four closed
    N.slots = Array.from({ length: SLOTS }, (_, i) => (i === 0 ? { k: 'p', id: myId() } : { k: i < 4 ? 'open' : 'closed', id: null }));
    hookRoom();
    A.state = 'net-room';
    shareRoom();
  } catch (e) {
    say('COULD NOT MAKE A ROOM');
    console.error(e);
  }
  N.busy = '';
}
// (a game that's started, or a room that's full: in to watch - a slot comes with the next game, if one's open)
async function joinRoom(ad, pass = '') {
  N.joinAsk = null;
  N.joinPass = pass;
  N.busy = `${ad.playing || ad.n >= ad.max ? 'GOING IN TO WATCH' : 'JOINING'} ${ad.name}...`;
  try {
    N.room = await GameRoom.open(N.server, ad.host, ad.rid);
    N.mode = 'client';
    N.welcomed = false;
    N.members = [];
    N.roomName = ad.name;
    hookRoom();
    // no answer from the host for a while: give up
    const r = N.room;
    setTimeout(() => {
      if (N.room === r && !N.welcomed) { leaveRoom(true); say('COULD NOT REACH THAT ROOM'); }
    }, 15000);
  } catch (e) {
    say('COULD NOT JOIN');
    console.error(e);
    N.busy = '';
  }
}
function leaveRoom(quiet = false, force = false) {
  if (!N.room && !N.back && !force) return;
  N.back = null;
  if (N.room) {
    if (N.mode === 'host') { N.room.send({ t: 'close' }); N.lobby?.advertise(null); }
    else if (N.room.hostId) N.room.send({ t: 'bye' }, N.room.hostId);
    N.room.c.pump?.();
    N.room.leave();
  }
  N.room = null;
  N.mode = null;
  N.members = [];
  N.playing = false;
  N.watching = false;
  N.match = null;
  N.pass = '';
  N.out = false;
  N.confirm = null;
  N.menu = false;
  N.busy = '';
  N.snaps = [];
  N.gotSnap = false;
  noted = null;
  clearAir();
  if (N.saved) { Object.assign(A.settings, N.saved); N.saved = null; }
  A.state = N.lobby ? 'net-lobby' : 'net-servers';
  A.banner = null;
  if (!quiet) say('YOU LEFT THE ROOM', 2);
}

function hookRoom() {
  const r = N.room;
  r.onLost = () => { if (N.room === r) losingConnection(); };
  r.onJoin = (id) => {
    if (N.mode === 'client' && id === r.hostId) r.send({ t: 'hello', name: N.name, skill: N.skill, pass: N.joinPass }, id);
  };
  r.onLeave = (id) => {
    if (N.mode === 'client' && id === r.hostId) return hostGone(id);
    if (N.mode !== 'host') return;
    const m = N.members.find((x) => x.id === id);
    if (!m) return;
    // gone in the middle of a match, without saying so: their seat's kept for a little, in case they're back
    if (N.playing && A.game.fighters.some((f) => f.peer === id)) { m.away = performance.now(); say(`${m.name} LOST THE CONNECTION`, 2); return; }
    dropMember(m);
  };
  r.onMsg = (m, from) => (N.mode === 'host' ? hostMsg(m, from) : clientMsg(m, from));
  r.onCtl = (p, from) => {
    if (N.mode !== 'host' || !N.members.some((m) => m.id === from) || !Array.isArray(p?.c)) return;
    const e = ctlOf(from), now = performance.now();
    e.at = now;
    // what they were looking at when they sent this: how long ago that was, here
    if (Number.isFinite(p.v)) e.rewind = Math.max(0, Math.min(MAX_REWIND, now / 1000 - p.v / 1000));
    for (const raw of p.c.slice(0, 60)) {
      const c = decodeCmd(raw);
      if (c && c.seq > e.last) { e.last = c.seq; e.q.push(c); }
    }
    if (e.q.length > 90) e.q.splice(0, e.q.length - 90);
  };
  r.onSnap = (s, from) => {
    if (N.mode !== 'client' || from !== r.hostId || N.out) return;
    s._at = performance.now() / 1000;
    N.snaps.push(s);
    if (N.snaps.length > 120) N.snaps.shift();
  };
}
function hostMsg(m, from) {
  if (m.t === 'hello') {
    // into an open slot - or, with the game going or no slot open, in to watch (their own seat, if they're coming back to it)
    const name = String(m.name ?? '').slice(0, 12) || 'PLAYER';
    const had = N.members.find((x) => x.id === from);
    if (N.banned.get(from) > performance.now()) return N.room.send({ t: 'no', why: 'YOU WERE KICKED - TRY AGAIN LATER' }, from);
    if (!had && N.pass && m.pass !== N.pass) return N.room.send({ t: 'no', why: m.pass ? 'WRONG PASSWORD' : 'THAT ROOM HAS A PASSWORD' }, from);
    if (!had) {
      const free = N.playing ? -1 : N.slots.findIndex((x) => x.k === 'open');
      if (free < 0 && watchers().length >= MAX_WATCH) return N.room.send({ t: 'no', why: 'THAT ROOM IS FULL' }, from);
      if (free >= 0) moveTo(from, free);
      N.members.push({ id: from, name, skill: m.skill ?? null, ready: false });
    } else { had.away = 0; had.out = false; }
    N.ctl.delete(from);
    N.room.send({ t: 'welcome' }, from);
    if (N.playing && N.match) {
      // the game as it is: the next state goes out whole (to everyone - it's the same for all)
      N.room.send({ t: 'start', ...N.match }, from);
      sendAllAgain();
    }
    say(`${name} ${had ? 'IS BACK' : N.playing ? 'IS WATCHING' : seatOf(from) >= 0 ? 'JOINED' : 'IS WATCHING (ROOM FULL)'}`, 2);
    return shareRoom();
  }
  const x = N.members.find((y) => y.id === from);
  if (!x) return;   // (only someone in the room has any say)
  if (m.t === 'me') {
    x.skill = typeof m.skill === 'string' ? m.skill : null;
    x.ready = !!m.ready;
    shareRoom();
  } else if (m.t === 'slot') {
    if (!N.playing && moveTo(from, m.i)) shareRoom();
  } else if (m.t === 'out') {
    // back to the room in the middle of the match: their fighter drops out of it
    x.out = true;
    for (const f of A.game.fighters) if (f.peer === from) { f.lives = 0; f.respawnT = 0; if (f.alive) f.die(null, 'LEFT', 0, 0); }
  } else if (m.t === 'resync') { x.out = false; sendAllAgain(); }   // (someone starting to watch again: the next state goes out whole)
  else if (m.t === 'bye') dropMember(x);
}
// (watching) on to the next one still in it (dir -1: the one before)
function watchNext(dir) {
  const all = A.game.fighters.filter((f) => !f.isDecoy), live = all.filter((f) => f.alive || f.respawnT > 0), pool = live.length ? live : all;
  if (!pool.length) return;
  const at = pool.indexOf(A.player);
  A.player = pool[(at + dir + pool.length) % pool.length];
}
function clientMsg(m, from) {
  // (only the host says what goes - coming back, we don't know who that is till they answer)
  if (N.room.hostId === null && (m.t === 'welcome' || m.t === 'no')) N.room.hostId = from;
  if (from !== N.room.hostId) return;
  if (m.t === 'welcome') { N.welcomed = true; A.state = 'net-room'; N.busy = ''; }
  else if (m.t === 'no') { leaveRoom(true); say(m.why); }
  else if (m.t === 'pass') N.heirPass = m.pass ?? '';
  else if (m.t === 'room') {
    N.roomName = m.name;
    if (m.made) N.made = m.made;
    N.members = m.members;
    N.slots = m.slots ?? [];
    N.playing = m.playing;
    N.hostSettings = m.settings;
    N.locked = !!m.lock;
    if (m.host) N.room.hostId = m.host;
  } else if (m.t === 'start') {
    N.saved ??= { ...A.settings };
    Object.assign(A.settings, m.settings);
    N.fighters.clear();
    N.props.clear();
    N.snaps = [];
    N.gotSnap = false;
    N.playing = true;
    N.watching = !m.roster.some((r) => r.peer === myId());
    N.deadT = 0;
    resetOwn();
    A.startNetMatch(m.roster, m.map, myId(), false);
    for (const f of A.game.fighters) N.fighters.set(f.nid, f);
    N.fistsDef ??= A.game.fighters[0]?.melee?.def;
  } else if (m.t === 'back') {
    N.playing = false;
    N.watching = false;
    N.out = false;
    N.menu = false;
    A.state = 'net-room';
    A.banner = null;
    for (const x of N.members) if (x.id === myId()) x.ready = false;
  } else if (m.t === 'close') {
    leaveRoom(true);
    say('THE HOST CLOSED THE ROOM');
  } else if (m.t === 'kicked') {
    leaveRoom(true);
    say('THE HOST KICKED YOU OUT');
  } else if (m.t === 'host') {
    if (m.to === myId()) takeOver(m.st);
    else { N.room.hostId = m.to; const h = m.st.members.find((x) => x.id === m.to); say(`${h?.name ?? 'SOMEONE'} IS THE HOST NOW`, 2.5); }
  }
}
// (the host) everyone in: a fighter for each player and each bot in the slots (no bots
// but those put in a slot) - in TEAMS, the left column BLUE and the right RED - the map, go
function startGame() {
  const s = A.settings, roster = [];
  let bots = 0;
  N.slots.forEach((x, i) => {
    const team = s.mode === 'teams' ? teamOf(i) : i, look = s.mode === 'teams' ? TEAM_LOOKS[team] : LOOKS[i];
    if (x.k === 'p') {
      const m = N.members.find((y) => y.id === x.id);
      if (m) roster.push({ name: m.name, ...look, skill: m.skill, peer: m.id, team });
    } else if (x.k === 'bot') roster.push({ name: BOT_NAMES[bots++], ...look, bot: true, team, skill: A.botSkill() });
  });
  if (roster.length < 2) return say('NEED SOMEONE TO FIGHT - A PLAYER OR A BOT', 2.5);
  if (s.mode === 'teams' && new Set(roster.map((r) => r.team)).size < 2) return say('TEAMS NEEDS SOMEONE ON EACH SIDE', 2.5);
  const map = s.map === 'random' ? A.pick(A.MAP_KEYS) : s.map;
  N.playing = true;
  N.sendT = 0;
  sendAllAgain();
  N.ctl = new Map();
  N.newShots = [];
  N.liveShots.clear();
  N.sentRound = -1;
  N.snapN = 0;
  for (const m of N.members) m.out = false;
  noted = [];
  A.startNetMatch(roster, map, myId(), true);
  N.match = { roster, map, settings: { ...s } };
  N.room.send({ t: 'start', ...N.match });
  shareRoom();
}
// (the host) the match over: everyone back to the room
function backToRoom() {
  N.playing = false;
  N.match = null;
  N.menu = false;
  noted = null;
  for (const m of [...N.members]) if (m.away) dropMember(m);
  for (const m of N.members) { m.out = false; if (m.id !== myId()) m.ready = false; }
  // those who came in to watch: into the open slots, first come first in
  for (const m of watchers()) { const free = N.slots.findIndex((x) => x.k === 'open'); if (free >= 0) moveTo(m.id, free); }
  A.state = 'net-room';
  A.banner = null;
  N.room.send({ t: 'back' });
  shareRoom();
}

// ---------- upkeep, and input on the screens ----------

export function netUpdate(dt) {
  if (A.state === 'net-servers' && (N.pingT -= dt) <= 0) {
    N.pingT = 15;
    for (const sv of SERVERS) pingServer(sv).then((r) => { N.pings[sv.key] = r; });
  }
  // the connection to the server lost: back to the list of servers
  if (N.lobby && !N.lobby.alive && !N.busy) { leaveServer(); say('LOST THE CONNECTION TO THE SERVER - PICK ONE AGAIN'); return; }
  N.lobby?.update(dt);
  N.room?.update(dt);
  // (for checking: how it's all going, a second at a time - F9 in a match, or arena.online.netStats)
  if (N.room && (N.statN.t += dt) >= 1) {
    const c = N.room.c.stat, was = N.statN, sec = was.t;
    N.stats = { outMsgs: Math.round((c.outN - (was.outN ?? c.outN)) / sec), outKB: +((c.outB - (was.outB ?? c.outB)) / sec / 1024).toFixed(1), inMsgs: Math.round((c.inN - (was.inN ?? c.inN)) / sec), inKB: +((c.inB - (was.inB ?? c.inB)) / sec / 1024).toFixed(1), ping: N.room.ping, behindMs: Math.round((N.delay ?? 0) * 1000), jitterMs: Math.round(N.jit * 1000), waiting: N.pending.length, fixPx: +(N.stats.fix ?? 0).toFixed(1), fix: 0 };
    N.statN = { t: 0, outN: c.outN, outB: c.outB, inN: c.inN, inB: c.inB };
  }
  if (N.msgT > 0) N.msgT -= dt;
  if (N.mode === 'host' && N.lobby) N.lobby.advertise(lobbyAd());
}

// typing a name in: letters, digits, a few marks; ENTER done, ESC back out (a click elsewhere: done)
const isPass = (what) => what === 'pass' || what === 'crpass' || what === 'jpass';
const LIMIT = { name: 12, room: 20, crname: 20 };
// (true: the keys went into the box; false: it's done, and a click that ended it is still to be dealt with)
function typing() {
  const I = A.input, pass = isPass(N.edit);
  for (const code of I.pressed) {
    if (code === 'Enter') { finishEdit(true, true); return true; }
    if (code === 'Escape') { finishEdit(false); return true; }
    if (code === 'Backspace') N.draft = N.draft.slice(0, -1);
    else if (N.draft.length < (pass ? 8 : LIMIT[N.edit] ?? 20)) {
      if (code.startsWith('Key')) N.draft += code.slice(3);
      else if (code.startsWith('Digit')) N.draft += code.slice(5);
      else if (pass) continue;
      else if (code === 'Space') N.draft += ' ';
      else if (code === 'Minus') N.draft += '-';
      else if (code === 'Quote') N.draft += "'";
    }
  }
  if (A.kit.click && A.kit.click !== N.edit) { finishEdit(true); return false; }
  return true;
}
function startEdit(what) {
  N.edit = what;
  N.draft = { name: N.name, room: N.roomName, crname: N.creating?.name, crpass: N.creating?.pass, pass: N.pass, jpass: N.joinPass }[what] ?? '';
}
// a box typed in, done with (keep: what's typed stays; enter: ENTER did it - in the CREATE ROOM box or a password asked for, that's go)
function finishEdit(keep, enter = false) {
  const v = N.draft.trim(), what = N.edit;
  N.edit = null;
  if (!keep) return;
  if (what === 'name' && v) { N.name = v; saveMe(); }
  else if (what === 'room' && v) { N.roomName = v; shareRoom(); }
  else if (what === 'pass') { N.pass = v; shareRoom(); say(v ? `PASSWORD SET: ${v}` : 'NO PASSWORD - ANYONE CAN JOIN', 2); }
  else if (what === 'crname' && N.creating) { N.creating.name = v; if (enter) startEdit('crpass'); }
  else if (what === 'crpass' && N.creating) { N.creating.pass = v; if (enter) createRoom(N.creating.name, v); }
  else if (what === 'jpass' && N.joinAsk) { N.joinPass = v; if (enter) joinRoom(N.joinAsk, v); }
}
function setMySkill(key) {
  const me = N.members.find((m) => m.id === myId());
  N.skill = key;
  saveMe();
  if (me) me.skill = key;
  if (N.mode === 'host') shareRoom();
  else N.room?.send({ t: 'me', skill: key, ready: !!me?.ready });
}

export function netScreenInput() {
  const I = A.input, state = A.state, click = A.kit.click;
  if (N.edit && typing()) return;
  if (N.busy) { if (I.wasPressed('Escape')) { leaveRoom(true); N.busy = ''; } return; }
  if (state === 'net-servers') {
    const rec = recommended(), from = N.sel >= 0 ? N.sel : Math.max(0, rec);
    if (I.wasPressed('KeyW', 'ArrowUp')) N.sel = N.sel < 0 ? from : (N.sel + SERVERS.length - 1) % SERVERS.length;
    if (I.wasPressed('KeyS', 'ArrowDown')) N.sel = N.sel < 0 ? from : (N.sel + 1) % SERVERS.length;
    if (click?.startsWith('srv:')) N.sel = +click.slice(4);
    if (click?.startsWith('srv:') || I.wasPressed('Enter')) enterServer(SERVERS[N.sel >= 0 ? N.sel : from]);
    else if (click === 'name' || I.wasPressed('KeyN')) startEdit('name');
    else if (click === 'back' || I.wasPressed('Escape')) A.state = 'menu';
  } else if (state === 'net-lobby' && N.creating) {
    // the CREATE ROOM box: its name, a password (or none), then make it
    if (click === 'crname' || click === 'crpass') startEdit(click);
    else if (click === 'cr-go' || I.wasPressed('Enter')) createRoom(N.creating.name, N.creating.pass);
    else if (click === 'cr-cancel' || I.wasPressed('Escape')) N.creating = null;
  } else if (state === 'net-lobby' && N.joinAsk) {
    // a locked room: its password first
    if (click === 'jpass') startEdit('jpass');
    else if (click === 'jp-go' || I.wasPressed('Enter')) joinRoom(N.joinAsk, N.joinPass);
    else if (click === 'jp-cancel' || I.wasPressed('Escape')) N.joinAsk = null;
  } else if (state === 'net-lobby') {
    const list = N.lobby?.list ?? [];
    if (click?.startsWith('room:')) {
      const ad = list.find((r) => r.host === click.slice(5));
      if (ad?.lock) { N.joinAsk = ad; N.joinPass = ''; startEdit('jpass'); }
      else if (ad) joinRoom(ad);
    } else if (click === 'create' || I.wasPressed('KeyC')) { N.creating = { name: `${N.name}'S ROOM`, pass: '' }; startEdit('crname'); }
    else if (click === 'quick' || I.wasPressed('Enter')) {
      const ad = list.find((r) => !r.playing && r.n < r.max && !r.lock);
      if (ad) joinRoom(ad);
      else say('NO OPEN ROOMS - MAKE ONE');
    } else if (click === 'servers' || I.wasPressed('Escape')) leaveServer();
  } else if (state === 'net-room') {
    const host = N.mode === 'host', me = N.members.find((m) => m.id === myId());
    if (click?.startsWith('set:') && host) { const [, i, kind] = click.split(':'); setSlot(+i, kind); }
    else if (click?.startsWith('kick:') && host) { const i = +click.slice(5); if (sure(click)) kick(N.slots[i]?.id); }
    else if (click?.startsWith('mkhost:') && host) { const i = +click.slice(7); if (sure(click)) handOver(N.slots[i]?.id); }
    else if (click === 'watch-match' && N.playing && N.out) {
      // back to watching the match going on (sat out of it: from the others')
      N.out = false;
      N.watching = true;
      N.snaps = [];
      N.gotSnap = false;
      N.room.send({ t: 'resync' }, N.room.hostId);
      A.state = 'fight';
    }
    else if (click?.startsWith('team:')) {
      // a side picked: the first open slot in its column
      const t = +click.slice(5), i = N.slots.findIndex((x, j) => x.k === 'open' && teamOf(j) === t);
      if (i >= 0) { if (host) { if (moveTo(myId(), i)) shareRoom(); } else N.room.send({ t: 'slot', i }); }
    }
    else if (click?.startsWith('slot:')) {
      // an open slot: move into it (switch team, in TEAMS)
      const i = +click.slice(5);
      if (N.slots[i]?.k === 'open') {
        if (host) { if (moveTo(myId(), i)) shareRoom(); }
        else N.room.send({ t: 'slot', i });
      }
    } else if (click?.startsWith('opt:') && host) {
      const [, i, dir] = click.split(':');
      A.changeNetSetting(+i, +dir);
      shareRoom();
    } else if (click === 'pick-skill') A.openPicker('pk-skill', 'YOUR SKILL', A.skillItems(false), N.skill, setMySkill);
    else if (click === 'pick-botskill' && host) A.openPicker('pk-botskill', 'BOT SKILLS', A.skillItems(true), A.settings.botskill, (key) => { A.setSetting('botskill', key); shareRoom(); });
    else if (I.wasPressed('KeyQ')) {
      const at = SKILLS.findIndex(([k]) => k === N.skill);
      setMySkill(SKILLS[(at + 1) % SKILLS.length][0]);
    } else if ((click === 'roomname' || click === 'rename') && host) startEdit('room');
    else if (click === 'roompass' && host) startEdit('pass');
    else if (click === 'ready' || (I.wasPressed('Enter') && !host)) {
      if (!host && me) { me.ready = !me.ready; N.room.send({ t: 'me', skill: N.skill, ready: me.ready }); }
    } else if ((click === 'start' || I.wasPressed('Enter')) && host) {
      if (seated().every((m) => m.ready)) startGame();
      else say('WAITING FOR EVERYONE TO BE READY', 2);
    } else if (click === 'leave' || I.wasPressed('Escape')) leaveRoom();
  }
}

// In a game: ESC brings up (and puts away) the menu - the game goes on behind it.
export function netGameInput() {
  const I = A.input, click = A.kit.click;
  if (I.wasPressed('F9')) N.hud = !N.hud;
  if (N.back || !N.room) { if (I.wasPressed('Escape')) { leaveRoom(true, true); N.busy = ''; } return; }
  if (A.state === 'match' && N.mode === 'host' && A.stateT > 2 && (click === 'back-room' || I.wasPressed('Enter'))) return backToRoom();
  if (I.wasPressed('Escape') || click === 'net-resume') N.menu = !N.menu;
  else if (N.menu && click === 'net-room') {
    // the host: the match ends, everyone back to the room. A player: out of this match, back to the room (it goes on without them)
    if (N.mode === 'host') backToRoom();
    else {
      N.room.send({ t: 'out' }, N.room.hostId);
      N.out = true;
      N.watching = false;
      N.menu = false;
      N.snaps = [];
      A.state = 'net-room';
      A.banner = null;
    }
  } else if (N.menu && click === 'net-leave' && (N.mode !== 'host' || sure('net-leave'))) leaveRoom();
  else if (N.watching && !N.menu && A.state !== 'match') {
    const dir = I.wasPressed('KeyD', 'ArrowRight', 'Mouse0') ? 1 : I.wasPressed('KeyA', 'ArrowLeft', 'Mouse2') ? -1 : 0;
    if (dir) watchNext(dir);
  }
}

// ---------- drawing the screens ----------
// (in the look of the menus: ui/kit.js)

export function drawNetScreen(ctx, u, W, H) {
  const k = A.kit;
  k.shade(0.68);
  if (A.state === 'net-servers') drawServers(k, u, W, H);
  else if (A.state === 'net-lobby') drawLobby(k, u, W, H);
  else drawRoom(k, u, W, H);
  if (N.busy) k.toast(N.busy + (Math.floor(performance.now() / 300) % 2 ? '' : ' .'), K.teal);
  else if (N.msgT > 0) k.toast(N.msg);
}

// a box to type in (the name, the room's name): the text, a caret while it's being typed in
function field(k, u, id, x, y, w, h, value, editing) {
  const hot = editing || k.hover === id;
  k.rect(x - u, y - u, w + 2 * u, h + 2 * u, K.ink);
  k.rect(x, y, w, h, editing ? K.gold : hot ? K.teal : K.edge);
  k.rect(x + u, y + u, w - 2 * u, h - 2 * u, '#0b100e');
  const caret = editing && Math.floor(performance.now() / 400) % 2 ? '_' : '';
  k.text((editing ? N.draft : value) + caret, x + 6 * u, y + (h - 7 * u) / 2, { color: editing ? '#ffffff' : K.text });
  k.hit(id, x, y, w, h);
}

// the server with the lowest ping (-1: none heard from yet)
function recommended() {
  let best = -1;
  SERVERS.forEach((sv, i) => { const p = N.pings[sv.key]; if (p && (best < 0 || p.ms < N.pings[SERVERS[best].key].ms)) best = i; });
  return best;
}
// signal bars for a ping: four for a near one down to one for a far one
const pingBars = (ms) => (ms < 60 ? 4 : ms < 110 ? 3 : ms < 180 ? 2 : 1);
const pingColor = (ms) => (ms < 110 ? K.green : ms < 180 ? K.gold : K.red);
function drawPing(k, u, x, y, p) {
  // (x, y: the bars' bottom right) - bars, then the ms to their left
  const n = p ? pingBars(p.ms) : 0, c = p ? pingColor(p.ms) : K.faint;
  for (let i = 0; i < 4; i++) {
    const h = (3 + i * 2) * u, bx = x - (4 - i) * 4 * u;
    k.rect(bx - u, y - h - u, 4 * u, h + 2 * u, K.ink);
    k.rect(bx, y - h, 2 * u, h, i < n ? c : '#26302c');
  }
  const t = p === undefined ? 'CHECKING' + '.'.repeat(Math.floor(performance.now() / 300) % 4) : p === null ? 'NO ANSWER' : `${p.ms} MS`;
  k.text(t, x - 20 * u, y - 7 * u, { color: p ? c : K.muted, align: 'right' });
}

function drawServers(k, u, W, H) {
  const pw = Math.min(W - 16 * u, 320 * u), px = Math.round(W / 2 - pw / 2);
  let y = 10 * u;
  k.text('MULTIPLAYER', W / 2, y, { size: 3, color: K.gold, align: 'center' });
  y += 28 * u;
  // you
  let cy = k.panel(px, y, pw, 42 * u, { title: 'YOU' });
  const editing = N.edit === 'name';
  k.text('NAME', px + 8 * u, cy + 6 * u, { small: true, color: K.muted });
  field(k, u, 'name', px + 30 * u, cy, pw - 112 * u, 16 * u, N.name, editing);
  k.button('name', px + pw - 76 * u, cy, 68 * u, 16 * u, editing ? 'SAVE' : 'CHANGE');
  y += 50 * u;
  // the servers: where each is, how far (the ping, as bars), the nearest one recommended
  const rowH = 21 * u, gapR = 3 * u, ph = 26 * u + SERVERS.length * (rowH + gapR), rec = recommended();
  cy = k.panel(px, y, pw, ph, { title: 'SERVERS', note: 'FREE - PICK THE ONE YOUR FRIENDS PICK' });
  SERVERS.forEach((sv, i) => {
    const id = `srv:${i}`, ry = cy + i * (rowH + gapR), rx = px + 8 * u, rw = pw - 16 * u;
    const hot = k.hover === id || N.sel === i, p = N.pings[sv.key];
    k.rect(rx - u, ry - u, rw + 2 * u, rowH + 2 * u, K.ink);
    k.rect(rx, ry, rw, rowH, hot ? K.teal : K.edge);
    k.rect(rx + u, ry + u, rw - 2 * u, rowH - 2 * u, hot ? '#1f3a36' : '#18211e');
    k.rect(rx + u, ry + u, rw - 2 * u, u, 'rgba(255, 255, 255, 0.08)');
    if (hot) k.text('>', rx + 5 * u, ry + 4 * u, { size: 2, color: K.teal });
    // the name, where it is beside it (a badge on the nearest), how far at the right
    const nw = k.text(sv.name, rx + 16 * u, ry + 4 * u, { size: 2, color: hot ? '#ffffff' : K.text });
    let bx = rx + 16 * u + nw + 8 * u;
    if (i === rec) {
      const t = 'RECOMMENDED', bw = k.width(t, { small: true }) + 8 * u;
      k.rect(bx, ry + 5 * u, bw, 10 * u, K.gold);
      k.text(t, bx + 4 * u, ry + 7 * u, { small: true, color: K.ink, shadow: null });
      bx += bw + 6 * u;
    }
    if (sv.where !== sv.name) k.text(sv.where, bx, ry + 8 * u, { small: true, color: K.muted });
    drawPing(k, u, rx + rw - 6 * u, ry + 16 * u, p);
    k.hit(id, rx, ry, rw, rowH);
  });
  y += ph + 6 * u;
  k.text('EVERYTHING IN A GAME GOES THROUGH THE SERVER - PICK THE NEAREST (THE LOWEST PING), THE SAME AS YOUR FRIENDS', W / 2, y, { small: true, color: K.faint, align: 'center' });
  y += 10 * u;
  k.button('back', px, y, 80 * u, 18 * u, 'BACK', { kind: 'danger' });
  k.hints('CLICK A SERVER  CONNECT      ENTER  THE RECOMMENDED ONE      N  CHANGE NAME      ESC  BACK');
}

const MODE_NAME = { ffa: 'FFA', teams: 'TEAMS' };
function drawLobby(k, u, W, H) {
  const L = N.lobby, list = L?.list ?? [];
  const pw = Math.min(W - 16 * u, 440 * u), px = Math.round(W / 2 - pw / 2);
  let y = 10 * u;
  k.text(`${N.server?.name ?? ''} LOBBY`, W / 2, y, { size: 3, color: K.gold, align: 'center' });
  y += 26 * u;
  const p = N.server && N.pings[N.server.key];
  k.text(`${L?.online ?? 1} ONLINE      YOU: ${N.name}${p ? `      PING ${p.ms} MS VIA ${p.where}` : ''}`, W / 2, y, { small: true, color: K.teal, align: 'center' });
  y += 10 * u;
  const rowH = 13 * u, rows = Math.max(4, Math.min(10, Math.floor((H - y - 26 * u - 14 * u - 46 * u) / rowH)));
  const ph = 26 * u + 12 * u + rows * rowH;
  const cy = k.panel(px, y, pw, ph, { title: 'ROOMS', note: list.length ? `${list.length} ROOM${list.length > 1 ? 'S' : ''}` : 'NONE YET' });
  const col = { no: px + 8 * u, name: px + 38 * u, mode: px + pw * 0.52, map: px + pw * 0.63, n: px + pw * 0.79, st: px + pw * 0.88 };
  for (const [key, label] of [['no', 'NO'], ['name', 'ROOM NAME'], ['mode', 'MODE'], ['map', 'MAP'], ['n', 'PLAYERS'], ['st', 'STATE']]) k.text(label, col[key], cy, { small: true, color: K.faint });
  const ry0 = cy + 10 * u;
  for (let i = 0; i < rows; i++) {
    const r = list[i], ry = ry0 + i * rowH, id = r ? `room:${r.host}` : null;
    k.rect(px + 4 * u, ry, pw - 8 * u, rowH - u, id && k.hover === id ? K.row : i % 2 ? K.rowAlt : 'rgba(0, 0, 0, 0.15)');
    if (!r) continue;
    const full = r.n >= r.max, shut = r.playing || full, ty = ry + 3 * u;
    k.text(String(i + 1).padStart(3, '0'), col.no, ty, { color: K.faint });
    if (r.lock) drawLock(k, u, col.name - 10 * u, ty);
    k.text(String(r.name).slice(0, 20), col.name, ty, { color: k.hover === id ? '#ffffff' : shut ? K.muted : K.text });
    k.text(MODE_NAME[r.mode] ?? r.mode, col.mode, ty, { color: K.muted });
    k.text(String(r.map).toUpperCase().slice(0, 7), col.map, ty, { color: K.muted });
    k.text(`${r.n}/${r.max}${r.w ? ` +${r.w}` : ''}`, col.n, ty, { color: full ? K.red : K.green });
    const st = shut && k.hover === id ? 'WATCH' : r.playing ? 'PLAYING' : full ? 'FULL' : 'OPEN';
    k.text(st, col.st, ty, { color: st === 'WATCH' ? K.gold : r.playing ? K.red : full ? K.muted : K.teal });
    k.hit(id, px + 4 * u, ry, pw - 8 * u, rowH - u);
  }
  if (!list.length) k.text('NO ROOMS ON THIS SERVER YET - MAKE ONE, AND TELL YOUR FRIENDS WHICH SERVER', W / 2, ry0 + rowH * 1.5, { small: true, color: K.muted, align: 'center' });
  y += ph + 8 * u;
  const bw = Math.floor((pw - 16 * u) / 3);
  // back out at the left (red), on at the right
  k.button('servers', px, y, bw, 18 * u, 'CHANGE SERVER', { kind: 'danger' });
  k.button('quick', px + bw + 8 * u, y, bw, 18 * u, 'QUICK JOIN');
  k.button('create', px + (bw + 8 * u) * 2, y, bw, 18 * u, 'CREATE ROOM', { kind: 'primary' });
  k.hints('CLICK A ROOM  JOIN (PLAYING OR FULL: WATCH)      C  CREATE      ENTER  QUICK JOIN      ESC  SERVERS');
  if (N.creating) drawCreateBox(k, u, W, H);
  else if (N.joinAsk) drawPassBox(k, u, W, H);
}
// a little padlock (a room with a password), 7 font-pixels tall
function drawLock(k, u, x, y, c = K.gold) {
  k.rect(x + u, y, 4 * u, u, c);
  k.rect(x + u, y, u, 3 * u, c);
  k.rect(x + 4 * u, y, u, 3 * u, c);
  k.rect(x, y + 3 * u, 6 * u, 4 * u, c);
  k.rect(x + 2.5 * u, y + 4 * u, u, 2 * u, K.ink);
}
// a box over the lobby (only it can be clicked while it's up)
function dialog(k, u, W, H, title, h) {
  k.hits = [];
  k.shade(0.55);
  const pw = Math.min(W - 16 * u, 260 * u), px = Math.round(W / 2 - pw / 2), py = Math.round(H / 2 - h / 2);
  return { px, pw, y: k.panel(px, py, pw, h, { title }) };
}
function drawCreateBox(k, u, W, H) {
  const c = N.creating, { px, pw, y } = dialog(k, u, W, H, 'CREATE ROOM', 26 * u + 94 * u);
  let cy = y;
  k.text('ROOM NAME', px + 8 * u, cy, { small: true, color: K.muted });
  field(k, u, 'crname', px + 8 * u, cy + 8 * u, pw - 16 * u, 16 * u, c.name, N.edit === 'crname');
  cy += 30 * u;
  k.text('PASSWORD (OPTIONAL)', px + 8 * u, cy, { small: true, color: K.muted });
  field(k, u, 'crpass', px + 8 * u, cy + 8 * u, pw - 16 * u, 16 * u, c.pass || (N.edit === 'crpass' ? '' : 'NONE'), N.edit === 'crpass');
  k.text('LETTERS AND NUMBERS, 8 AT MOST - LEAVE IT EMPTY AND ANYONE CAN JOIN', px + 8 * u, cy + 27 * u, { small: true, color: K.faint });
  cy += 40 * u;
  const bw = Math.floor((pw - 22 * u) / 2);
  k.button('cr-go', px + 8 * u, cy, bw, 18 * u, 'CREATE', { kind: 'primary' });
  k.button('cr-cancel', px + 14 * u + bw, cy, bw, 18 * u, 'CANCEL');
}
function drawPassBox(k, u, W, H) {
  const { px, pw, y } = dialog(k, u, W, H, 'PASSWORD', 26 * u + 60 * u);
  k.text(`${N.joinAsk.name} HAS A PASSWORD`, W / 2, y, { small: true, color: K.text, align: 'center' });
  field(k, u, 'jpass', px + 8 * u, y + 10 * u, pw - 16 * u, 16 * u, N.joinPass, N.edit === 'jpass');
  const bw = Math.floor((pw - 22 * u) / 2);
  k.button('jp-go', px + 8 * u, y + 34 * u, bw, 18 * u, 'JOIN', { kind: 'primary' });
  k.button('jp-cancel', px + 14 * u + bw, y + 34 * u, bw, 18 * u, 'CANCEL');
}

function drawRoom(k, u, W, H) {
  const host = N.mode === 'host', me = N.members.find((m) => m.id === myId());
  const settings = host ? A.settings : (N.hostSettings ?? A.settings), teams = settings.mode === 'teams';
  const pw = Math.min(W - 16 * u, 440 * u), px = Math.round(W / 2 - pw / 2), gap = 6 * u;
  // the room's name (the host can rename it), where, how it stands
  let y = 6 * u;
  if (N.edit === 'room') field(k, u, 'room', W / 2 - 110 * u, y, 220 * u, 18 * u, N.roomName, true);
  else {
    k.text(N.roomName, W / 2, y + 2 * u, { size: 2, color: K.gold, align: 'center' });
    if (host) k.hit('roomname', W / 2 - 120 * u, y, 240 * u, 18 * u);
  }
  y += 22 * u;
  if (host) {
    // RENAME, and the password (or NONE) - click to set it
    const pass = N.edit === 'pass', bw = 92 * u, pwid = 128 * u, x0 = W / 2 - (bw + 6 * u + pwid) / 2;
    k.button('rename', x0, y - u, bw, 12 * u, 'RENAME ROOM', { size: 1 });
    if (pass) field(k, u, 'pass', x0 + bw + 6 * u, y - u, pwid, 12 * u, N.pass, true);
    else {
      k.button('roompass', x0 + bw + 6 * u, y - u, pwid, 12 * u, N.pass ? `PASSWORD: ${N.pass}` : 'PASSWORD: NONE', { size: 1, selected: !!N.pass });
      if (N.pass) drawLock(k, u, x0 + bw + 10 * u, y + 2 * u);
    }
    y += 14 * u;
  } else {
    const status = `${N.locked ? 'LOCKED ROOM   -   ' : ''}${N.playing ? 'A MATCH IS GOING ON' : 'WAITING FOR THE HOST TO START'}${N.room?.ping ? `   -   PING ${N.room.ping} MS` : ''}`;
    k.text(`${N.server?.name ?? ''}   -   ${status}`, W / 2, y, { small: true, color: K.teal, align: 'center' });
    y += 10 * u;
  }
  // the slots: two columns of four (BLUE and RED, in TEAMS)
  const colW = Math.floor((pw - 16 * u - gap) / 2), slotH = 18 * u, playing = N.slots.filter((x) => x.k === 'p').length, watch = watchers();
  const sh = 26 * u + 16 * u + 4 * slotH + (watch.length ? 10 * u : 0);   // (the row over the slots is there in both modes: changing mode doesn't shift everything)
  let cy = k.panel(px, y, pw, sh, { title: teams ? 'TEAMS' : 'PLAYERS', note: `${playing} / ${roomSize()} PLAYERS${host ? '   -   CLICK A SLOT BUTTON TO OPEN, CLOSE OR ADD A BOT' : ''}` });
  if (teams) {
    // each side's banner: its name, how many, a button to go over to it
    const mySide = seatOf(myId()) >= 0 ? teamOf(seatOf(myId())) : -1;
    [['BLUE TEAM', K.blue, 'rgba(106, 216, 255, '], ['RED TEAM', K.red, 'rgba(255, 106, 90, ']].forEach(([label, c, tint], t) => {
      const cx = px + 8 * u + t * (colW + gap), n = N.slots.filter((x, j) => teamOf(j) === t && (x.k === 'p' || x.k === 'bot')).length;
      k.rect(cx, cy, colW, 13 * u, tint + '0.22)');
      k.rect(cx, cy, colW, u, c);
      k.rect(cx - u, cy + 14 * u, colW + 2 * u, 4 * slotH, tint + '0.06)');   // (the column behind its slots, faintly in its colour)
      const lw = k.text(label, cx + 5 * u, cy + 3 * u, { color: c });
      k.text(`${n}/4`, cx + 5 * u + lw + 6 * u, cy + 4 * u, { small: true, color: K.muted });
      if (mySide === t) k.text('YOUR SIDE', cx + colW - 5 * u, cy + 4 * u, { small: true, color: c, align: 'right' });
      else if (N.slots.some((x, j) => teamOf(j) === t && x.k === 'open')) k.button(`team:${t}`, cx + colW - 52 * u, cy + 2 * u, 50 * u, 9 * u, 'JOIN', { size: 1 });
    });
    cy += 16 * u;
  } else {
    // FREE FOR ALL: the same row, one banner across both columns
    const bw = pw - 16 * u, playing = N.slots.filter((x) => x.k === 'p' || x.k === 'bot').length;
    k.rect(px + 8 * u, cy, bw, 13 * u, 'rgba(255, 210, 90, 0.14)');
    k.rect(px + 8 * u, cy, bw, u, K.gold);
    const lw = k.text('FREE FOR ALL', px + 13 * u, cy + 3 * u, { color: K.gold });
    k.text(`${playing}/8`, px + 13 * u + lw + 6 * u, cy + 4 * u, { small: true, color: K.muted });
    k.text('EVERYONE FOR THEMSELVES', px + 8 * u + bw - 5 * u, cy + 4 * u, { small: true, color: K.muted, align: 'right' });
    cy += 16 * u;
  }
  for (let i = 0; i < SLOTS; i++) {
    const c = Math.floor(i / 4), r = i % 4, sx = px + 8 * u + c * (colW + gap), sy = cy + r * slotH, x = N.slots[i] ?? { k: 'closed' };
    const id = `slot:${i}`, mine = x.k === 'p' && x.id === myId(), hot = x.k === 'open' && k.hover === id, h = slotH - 3 * u;
    k.rect(sx, sy, colW, h, mine ? 'rgba(255, 210, 90, 0.16)' : hot ? 'rgba(126, 240, 224, 0.12)' : x.k === 'closed' ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.04)');
    const side = teams ? (teamOf(i) ? K.red : K.blue) : null;
    k.rect(sx, sy, 2 * u, h, x.k === 'p' || x.k === 'bot' ? side ?? (mine ? K.gold : LOOKS[i].color) : hot ? K.teal : side ? side + '55' : K.edge);
    if (mine) k.rect(sx + colW - u, sy, u, h, K.gold);
    k.text(i + 1, sx + 6 * u, sy + 4 * u, { small: true, color: K.faint });
    if (x.k === 'p') {
      const m = N.members.find((o) => o.id === x.id), isHost = N.room?.hostId === x.id;
      k.text(m?.name ?? '...', sx + 14 * u, sy + 2 * u, { color: '#ffffff' });
      k.text(SKILLS.find(([s]) => s === m?.skill)?.[1] ?? 'NO SKILL', sx + 14 * u, sy + 10 * u, { small: true, color: K.teal });
      const tag = isHost ? 'HOST' : m?.ready ? 'READY' : 'NOT READY';
      let tx = sx + colW - 5 * u;
      // the host's buttons on everyone else's slot: KICK, MAKE HOST (each asks SURE? first)
      if (host && !isHost && !N.playing) {
        for (const [act, label] of [['mkhost', 'HOST'], ['kick', 'KICK']]) {
          const bid = `${act}:${i}`, ask = asking(bid), t = ask ? 'SURE?' : label, bw = k.width(t, { small: true }) + 10 * u;
          tx -= bw;
          k.button(bid, tx + 3 * u, sy + 3 * u, bw - 2 * u, h - 6 * u, t, { kind: act === 'kick' || ask ? 'danger' : 'normal', small: true });
          tx -= 2 * u;
        }
        tx -= 3 * u;
      }
      k.text(tag, tx, sy + 4 * u, { color: isHost ? K.gold : m?.ready ? K.green : K.red, align: 'right', small: host && !isHost && !N.playing });
    } else {
      const bots = N.slots.slice(0, i).filter((o) => o.k === 'bot').length;
      const label = x.k === 'bot' ? `BOT  ${BOT_NAMES[bots]}` : x.k === 'open' ? (hot ? 'CLICK TO MOVE HERE' : 'OPEN') : 'CLOSED';
      k.text(label, sx + 14 * u, sy + 4 * u, { color: x.k === 'bot' ? K.text : x.k === 'open' ? (hot ? K.teal : K.muted) : K.faint });
      if (host) {
        // two buttons: what else the slot can be
        const acts = x.k === 'open' ? [['bot', 'ADD BOT'], ['closed', 'CLOSE']] : x.k === 'closed' ? [['bot', 'ADD BOT'], ['open', 'OPEN']] : [['open', 'REMOVE'], ['closed', 'CLOSE']];
        let bx = sx + colW - 2 * u;
        for (const [kind, label] of acts.reverse()) {
          const bw = k.width(label, { small: true }) + 10 * u;
          bx -= bw;
          k.button(`set:${i}:${kind}`, bx, sy + 3 * u, bw, h - 6 * u, label, { small: true });
          bx -= 3 * u;
        }
      }
    }
    k.hit(id, sx, sy, colW, h);
  }
  if (watch.length) k.text(`WATCHING (${watch.length}): ${watch.map((m) => m.name).join(', ')}  -  THEY GET A SLOT WHEN ONE IS OPEN`, px + 10 * u, cy + 4 * slotH + 2 * u, { small: true, color: K.muted });
  y += sh + gap;
  // the room's settings, in two columns (the host changes them)
  const opts = A.OPTIONS.map((o, i) => [o, i]).filter(([o]) => o[0] !== 'bots' && o[0] !== 'myskill'), rows = Math.ceil(opts.length / 2), rowH = 10 * u;
  const oh = 26 * u + rows * rowH;
  cy = k.panel(px, y, pw, oh, { title: 'ROOM SETTINGS', note: host ? 'CLICK A SIDE TO CHANGE' : 'THE HOST SETS THESE' });
  opts.forEach(([[key, label, vals], oi], n) => {
    const c = Math.floor(n / rows), r = n % rows;
    const shown = vals.find(([v]) => v === settings[key])?.[1] ?? '?', ox = px + 8 * u + c * (colW + gap), oy = cy + r * rowH;
    if (key === 'botskill') k.select('pick-botskill', ox, oy, colW, rowH - u, label, settings.skills ? shown : 'OFF', { enabled: host && !!settings.skills });
    else k.stepper(`opt:${oi}`, ox, oy, colW, rowH - u, label, shown, { enabled: host });
  });
  y += oh + gap;
  // your skill; ready / start; leave
  const sk = A.skillName(N.skill), info = A.SKILL_INFO.find((x) => x.key === N.skill);
  k.rect(px, y, colW + 8 * u, 18 * u, 'rgba(14, 20, 18, 0.95)');
  k.select('pick-skill', px, y, colW + 8 * u, 18 * u, 'YOUR SKILL', settings.skills ? sk : 'SKILLS OFF', { img: settings.skills ? info?.img : null });
  const rx = px + colW + 8 * u + gap, rw = pw - (colW + 8 * u + gap), allReady = seated().every((m) => m.ready), bw = Math.round(rw * 0.64);
  if (host) k.button('start', rx, y, bw, 18 * u, allReady ? 'START' : 'NOT ALL READY', { kind: 'primary', disabled: !allReady });
  else if (N.playing && N.out) k.button('watch-match', rx, y, bw, 18 * u, 'WATCH THE MATCH', { kind: 'primary' });
  else if (seatOf(myId()) < 0) k.button('ready', rx, y, bw, 18 * u, 'WATCHING', { disabled: true });
  else k.button('ready', rx, y, bw, 18 * u, me?.ready ? 'READY!' : 'READY', { kind: me?.ready ? 'normal' : 'primary', selected: !!me?.ready });
  k.button('leave', rx + bw + 6 * u, y, rw - bw - 6 * u, 18 * u, 'LEAVE', { kind: 'danger' });
  k.hints(host ? 'CLICK AN OPEN SLOT  MOVE THERE      KICK / HOST  CLICK TWICE      ENTER  START      ESC  LEAVE' : N.playing && N.out ? 'THE MATCH IS GOING ON - WATCH IT, OR WAIT FOR THE NEXT ONE      ESC  LEAVE' : 'CLICK AN OPEN SLOT  MOVE THERE      ENTER  READY      Q  SKILL      ESC  LEAVE');
}

// In a game, over the HUD: the ping, what's happening, and the menu (ESC).
export function drawNetOverlay(ctx, u, W, H) {
  const k = A.kit;
  if (N.mode === 'client' && N.room?.ping) k.text(`PING ${N.room.ping} MS`, 6 * u, H - 10 * u, { small: true, color: N.room.ping > 120 ? K.red : K.faint });
  if (N.mode === 'client' && !N.gotSnap) k.text('WAITING FOR THE HOST...', W / 2, H * 0.5, { color: K.teal, align: 'center' });
  if (N.watching && N.gotSnap && A.state !== 'match' && A.player) {
    const f = A.player, name = `WATCHING  ${f.name}`, w = k.width(name, { size: 2 }) + 24 * u, bx = W / 2 - w / 2, by = H - 40 * u;
    k.rect(bx - u, by - u, w + 2 * u, 28 * u, K.ink);
    k.rect(bx, by, w, 26 * u, 'rgba(14, 20, 18, 0.9)');
    k.rect(bx, by, w, u, A.tagColor(f));
    k.text(name, W / 2, by + 4 * u, { size: 2, color: A.tagColor(f), align: 'center' });
    k.text('A / D  OR  CLICK  -  SWITCH PLAYER', W / 2, by + 19 * u, { small: true, color: K.muted, align: 'center' });
  }
  if (N.back) k.text(N.busy, W / 2, H * 0.5, { color: K.teal, align: 'center' });
  if (N.hud) {
    const t = N.stats, lines = [`OUT ${t.outMsgs ?? 0}/S ${t.outKB ?? 0}KB  IN ${t.inMsgs ?? 0}/S ${t.inKB ?? 0}KB`, N.mode === 'client' ? `PING ${t.ping ?? 0}  BEHIND ${t.behindMs ?? 0}MS  JITTER ${t.jitterMs ?? 0}MS  UNHEARD ${t.waiting ?? 0}  FIX ${t.fixPx ?? 0}PX` : 'HOST'];
    lines.forEach((l, i) => k.text(l, 6 * u, H - (22 + i * 10) * u, { small: true, color: K.teal }));
  }
  if (N.msgT > 0) k.toast(N.msg);
  if (!N.menu) return;
  k.shade(0.65);
  const host = N.mode === 'host', pw = 220 * u, ph = 26 * u + 16 * u + 3 * 23 * u + 10 * u, px = Math.round(W / 2 - pw / 2), py = Math.round(H / 2 - ph / 2);
  let y = k.panel(px, py, pw, ph, { title: N.roomName.slice(0, 20) });
  k.text('THE GAME GOES ON WHILE THIS IS OPEN', W / 2, y, { small: true, color: K.muted, align: 'center' });
  y += 14 * u;
  k.button('net-resume', px + 8 * u, y, pw - 16 * u, 18 * u, 'BACK TO THE GAME', { kind: 'primary' });
  y += 23 * u;
  k.button('net-room', px + 8 * u, y, pw - 16 * u, 18 * u, host ? 'END THE MATCH - ALL TO THE ROOM' : 'BACK TO THE ROOM');
  y += 23 * u;
  const ask = asking('net-leave');
  k.button('net-leave', px + 8 * u, y, pw - 16 * u, 18 * u, host ? (ask ? 'SURE? CLICK AGAIN TO CLOSE IT' : 'CLOSE THE ROOM') : 'LEAVE THE ROOM', { kind: 'danger' });
  y += 21 * u;
  k.text(host ? 'CLOSING THE ROOM SENDS EVERYONE BACK TO THE LOBBY' : 'BACK TO THE ROOM: OUT OF THIS MATCH, IN FOR THE NEXT', W / 2, y, { small: true, color: K.faint, align: 'center' });
}
