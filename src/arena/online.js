// Online play: the screens on the way into a game (choose a server, the
// lobby's list of rooms, a room waiting to start - Point Blank style) and the
// game itself over the network (see net.js for the connections).
//
// The host's game is the real one: it runs everything, with each of the
// other players' fighters moved by the controls they send in. Twenty times a
// second it sends everyone the state of the game - every fighter, prop,
// bullet, grenade, pickup, skill effect, the round - and the effects that went
// off since the last time (sparks, blood, smoke, flashes), which the others
// play on their own screens. The others don't run the game at all: they draw
// what they're sent, easing their fighters between one state and the next and
// carrying bullets on along their way, so it all moves smoothly.

import { SERVERS, Lobby, GameRoom, myId } from './net.js';
import { Fighter } from './fighter.js';
import { Fx } from './fx.js';
import { Lights } from './light.js';
import { Prop } from './props.js';
import { Weapon } from '../combat/weapons.js';
import { MeleeWeapon, MELEE } from '../combat/melee.js';

let A = null;   // what this needs of the game (main.js)
const SNAP_EVERY = 1 / 20, MAX_PLAYERS = 4;
const LOOKS = [
  { color: '#e8e2d0', hue: 0, sat: 1 }, { color: '#ff6a5a', hue: 150, sat: 1.3 }, { color: '#6ad8ff', hue: 210, sat: 1.2 },
  { color: '#c8ff5a', hue: 290, sat: 1.1 }, { color: '#ffb84a', hue: 40, sat: 1.2 }, { color: '#e07aff', hue: 250, sat: 1.3 },
];
const BOT_NAMES = ['VEX', 'KORA', 'DUKE', 'ROOK', 'NYX'];
export const SKILLS = [
  ['grapple', 'GRAPPLE'], ['cloak', 'CLOAK'], ['decoy', 'SHADOW CLONE'], ['archery', 'ARCHERY'], ['murasaki', 'MURASAKI'],
  ['blaze', 'FLAME FIST'], ['galaxy', 'GALAXY'], ['demon', 'ABYSS GOLEM'], [null, 'NO SKILL'],
];
const PRESSED = ['jump', 'reload', 'roll', 'melee', 'skill', 'drop', 'throwWeapon', 'pickup', 'grenade'];

const N = {
  name: '', skill: 'grapple', edit: null, draft: '',
  server: null, lobby: null, room: null, mode: null,   // mode: 'host' | 'client' while in a room
  roomName: '', made: 0, members: [], playing: false,
  hits: [], hover: null, msg: '', msgT: 0, busy: '', sel: 0,
  ctl: new Map(), sendT: 0, snap: null, gotSnap: false, menu: false, saved: null,
  fighters: new Map(), props: new Map(), nextNid: 100, propIds: 0, fistsDef: null,
  sent: new Map(),   // (the host) what each fighter and prop was last sent as, field by field - only what's changed goes again
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
  get snapSize() { return N.lastSize; },   // (for checking: how big a state of the game sent lately was, in bytes)
  isScreen: (state) => state === 'net-servers' || state === 'net-lobby' || state === 'net-room',
};

export function initOnline(api) {
  A = api;
  recordEffects();
}
// from the main menu
export function openOnline() {
  N.hover = null;
  A.state = 'net-servers';
}

// ---------- the effects, passed along ----------
// On the host, every effect that's set off (outside another one) is noted
// down, to go out with the next state of the game; the others set them off
// on their own screens the same way.
const FX_CALLS = ['dust', 'puff', 'mist', 'wisp', 'motes', 'runDust', 'step', 'casing', 'blood', 'sparks', 'impact', 'gunSmoke', 'debris', 'smoke', 'fire', 'scorch'];
let noted = null, depth = 0;
function recordEffects() {
  const wrap = (proto, name, as = name, conv = (args) => args.map((a) => ser(a))) => {
    const orig = proto[name];
    proto[name] = function (...args) {
      if (noted && depth === 0) noted.push([as, conv(args)]);
      depth++;
      try { return orig.apply(this, args); } finally { depth--; }
    };
  };
  for (const m of FX_CALLS) wrap(Fx.prototype, m);
  wrap(Fx.prototype, 'thrownGun', 'thrownGun', ([f, w]) => [ser(f), w.def?.key ?? null]);
  wrap(Lights.prototype, 'flash', 'flash');
}
function playEffects(list) {
  for (const [m, args] of list) {
    if (m === 'flash') A.game.lights.flash(...args);
    else if (m === 'thrownGun') { const f = rev(args[0]); if (f && args[1]) A.game.fx.thrownGun(f, { icon: A.iconOf(args[1]) }); }
    else A.game.fx[m]?.(...args.map((a) => rev(a)));
  }
}

// ---------- the state of the game, as plain data ----------
// Fighters, props and weapons go by reference ({$f: id}, {$p: id}, a weapon by
// its key and its state); canvases, caches and the like are left out.
const SKIP = new Set(['game', 'images', 'parts', 'hands', 'selfCanvas', 'pix', 'art', 'def', 'ammoSource', 'events', '_icon', 'level', 'nav', 'img']);
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
  if (v instanceof MeleeWeapon) return { $m: v.def.key ?? (v.def.fists ? '_fists' : '_'), s: serObj(v, d) };
  if (Array.isArray(v)) return v.map((x) => { const s = ser(x, d + 1); return s === undefined ? null : s; });
  if (v instanceof Map || v instanceof Set || v instanceof HTMLCanvasElement || v instanceof HTMLImageElement || v instanceof CanvasRenderingContext2D) return undefined;
  return serObj(v, d);
}
function serObj(o, d) {
  const out = {};
  for (const k of Object.keys(o)) {
    if (SKIP.has(k)) continue;
    const s = ser(o[k], d + 1);
    if (s !== undefined) out[k] = s;
  }
  return out;
}
function rev(v, prev) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => rev(x));
  if ('$f' in v) return N.fighters.get(v.$f) ?? null;
  if ('$p' in v) return N.props.get(v.$p) ?? null;
  if ('$w' in v) {
    let w = prev instanceof Weapon && prev.def.key === v.$w ? prev : null;
    if (!w && A.weapons[v.$w]) {
      w = new Weapon(A.weapons[v.$w]);
      w.ammoSource = { count: () => w._reserve ?? 0, take: () => 0, give() {} };
    }
    if (w) assign(w, v.s);
    return w;
  }
  if ('$m' in v) {
    const def = v.$m === '_fists' ? N.fistsDef : MELEE[v.$m];
    let m = prev instanceof MeleeWeapon && (prev.def.key ?? (prev.def.fists ? '_fists' : '_')) === v.$m ? prev : null;
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

// Only the fields of `o` that have changed since it was last sent (all of them the first time).
// (The messages arrive, and in order, so the others are always up to date.)
function changed(key, o) {
  const full = serObj(o, 0), last = N.sent.get(key) ?? {}, out = {};
  for (const k in full) {
    const j = JSON.stringify(full[k]);
    if (last[k] !== j) { out[k] = full[k]; last[k] = j; }
  }
  N.sent.set(key, last);
  return out;
}
const LISTS = [['bu', 'bullets'], ['gr', 'grenades'], ['pk', 'pickups'], ['th', 'thrown'], ['ar', 'arrows'], ['vo', 'voids'], ['fi', 'fists'], ['ga', 'galaxies'], ['de', 'demons'], ['pu', 'punches'], ['bl', 'blasts'], ['nu', 'numbers'], ['fe', 'feed']];
function snapshot() {
  const g = A.game;
  return {
    t: Math.round(g.time * 1000) / 1000, st: A.state, sT: ser(A.stateT), rd: A.round, rT: ser(A.roundT), ot: A.overtime, sl: A.slow,
    bn: ser(A.banner), wi: ser(A.winner), ch: ser(A.champion),
    f: g.fighters.map((f) => ({ n: nidOf(f), i: [f.name, f.color, f.hue ?? 0, f.sat ?? 1, f.team ?? 0, f.peer ?? null], s: changed(f, f) })),
    p: g.props.map((p) => ({ n: (p.nid ??= ++N.propIds), k: p.kind, s: changed(p, p) })),
    l: Object.fromEntries(LISTS.map(([k, name]) => [k, ser(g[name])])),
    la: g.lights.lamps.map((l) => (l.on ? 1 : 0)).join(''),
    fx: noted ?? [],
  };
}
// (on the others' screens) the latest state from the host, put into the game
function applySnapshot(s) {
  const g = A.game;
  // the fighters: any new ones made (a shadow clone), any gone dropped, each brought up to date - eased toward where it is now
  const keep = [];
  for (const e of s.f) {
    let f = N.fighters.get(e.n);
    if (!f) {
      const [name, color, hue, sat, team, peer] = e.i;
      f = new Fighter(g, A.images, { name, color, hue, sat });
      f.nid = e.n;
      f.team = team;
      f.peer = peer;
      N.fighters.set(e.n, f);
    }
    keep.push(f);
  }
  for (const e of s.f) {
    const f = N.fighters.get(e.n), ox = f.x, oy = f.y, had = f._seen;
    assign(f, e.s);
    f._tx = f.x;
    f._ty = f.y;
    if (had && Math.hypot(f.x - ox, f.y - oy) < 48) { f.x = ox; f.y = oy; }
    f._seen = true;
  }
  for (const id of [...N.fighters.keys()]) if (!keep.includes(N.fighters.get(id))) N.fighters.delete(id);
  g.fighters = keep;
  const me = keep.find((f) => f.peer === myId());
  if (me) A.player = me;
  // the props
  const props = [];
  for (const e of s.p) {
    let p = N.props.get(e.n);
    if (!p) { p = new Prop(e.k, 0, 0); p.nid = e.n; N.props.set(e.n, p); }
    assign(p, e.s);
    props.push(p);
  }
  for (const id of [...N.props.keys()]) if (!props.includes(N.props.get(id))) N.props.delete(id);
  g.props = props;
  // everything else
  for (const [k, name] of LISTS) g[name] = rev(s.l[k]) ?? [];
  for (const o of g.thrown) if (!o.img) o.img = o.kind === 'gun' ? A.iconOf(o.key) : MELEE[o.key]?.img;
  [...s.la].forEach((c, i) => { const l = g.lights.lamps[i]; if (l) l.on = c === '1'; });
  g.time = s.t;
  A.state = s.st;
  A.stateT = s.sT;
  A.round = s.rd;
  A.roundT = s.rT;
  A.overtime = s.ot;
  A.slow = s.sl;
  A.banner = rev(s.bn);
  A.winner = rev(s.wi);
  A.champion = rev(s.ch);
  playEffects(s.fx);
}

// ---------- the game, each frame ----------

// (the host) a player's controls: the held ones as they last were, a press kept till it's used
function takeControl(peer) {
  const c = N.ctl.get(peer);
  if (!c) return A.IDLE;
  const out = { ...A.IDLE, ...c.held, ...c.pressed };
  c.pressed = {};
  return out;
}
// (the host) each other player's fighter, moved by their controls
export function updateRemotes(dt, live) {
  if (N.mode !== 'host') return;
  for (const f of A.game.fighters) {
    if (!f.peer || f.peer === myId() || f.isDecoy) continue;
    const c = live && N.members.some((m) => m.id === f.peer) ? takeControl(f.peer) : A.IDLE;
    if (c.pickup) f.pickupPressed = true;
    f.update(dt, c);
    f.pickupPressed = false;
  }
}
// (the host) the state of the game out to everyone, twenty times a second
export function hostFrame(dt) {
  if (N.mode !== 'host' || !N.playing || !N.room) return;
  noted ??= [];
  if ((N.sendT -= dt) > 0) return;
  N.sendT = SNAP_EVERY;
  const s = snapshot();
  if (N.room.peers.size) N.room.snap.send(s);
  if ((N.sizeN = (N.sizeN ?? 0) + 1) % 40 === 1) N.lastSize = JSON.stringify(s).length;
  noted = [];
}
// (the others) a frame: the latest state put in, things carried on between states, our controls sent
export function clientFrame(dt) {
  const g = A.game;
  if (N.snap) { applySnapshot(N.snap); N.snap = null; N.gotSnap = true; }
  if (!N.gotSnap) return;
  g.time += dt;
  for (const f of g.fighters) {
    if (f._tx === undefined) continue;
    const k = Math.min(1, dt * 16);
    f.x += (f._tx - f.x) * k;
    f.y += (f._ty - f.y) * k;
  }
  for (const list of [g.bullets, g.grenades, g.thrown, g.arrows]) for (const o of list) if (o && typeof o.vx === 'number') { o.x += o.vx * dt; o.y += o.vy * dt; }
  for (const list of [g.fists, g.galaxies, g.punches, g.blasts, g.numbers]) for (const o of list) if (o && typeof o.t === 'number') o.t += dt;
  g.fx.update(dt);
  g.lights.update(dt);
  if (A.banner) A.banner.t -= dt;
  // our controls to the host, every frame (a press goes once)
  const live = A.state === 'fight' || A.state === 'end';
  const c = live && !N.menu ? A.playerControl() : A.IDLE;
  N.room?.ctl.send({ ...c, target: c.target ? { x: Math.round(c.target.x), y: Math.round(c.target.y) } : null }, { target: N.room.hostId });
}

// ---------- rooms ----------

function lobbyAd() {
  return { name: N.roomName, mode: A.settings.mode, map: A.settings.map, n: N.members.length, max: MAX_PLAYERS, playing: N.playing, made: N.made };
}
function roomState() {
  return { t: 'room', name: N.roomName, members: N.members, settings: { ...A.settings }, playing: N.playing };
}
// (the host) everyone told how the room stands, the lobby too
function shareRoom() {
  if (N.mode !== 'host') return;
  N.room.send(roomState());
  N.lobby?.advertise(lobbyAd());
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

async function createRoom() {
  N.busy = 'MAKING THE ROOM...';
  try {
    N.room = await GameRoom.open(myId());
    N.mode = 'host';
    N.roomName = `${N.name} ROOM`;   // (the font has no apostrophe)
    N.made = Date.now();
    N.playing = false;
    N.members = [{ id: myId(), name: N.name, skill: N.skill, ready: true }];
    hookRoom();
    A.state = 'net-room';
    shareRoom();
  } catch (e) {
    say('COULD NOT MAKE A ROOM');
    console.error(e);
  }
  N.busy = '';
}
async function joinRoom(ad) {
  if (ad.playing) return say('THAT GAME HAS STARTED - WAIT FOR IT TO FINISH');
  if (ad.n >= ad.max) return say('THAT ROOM IS FULL');
  N.busy = `JOINING ${ad.name}...`;
  try {
    N.room = await GameRoom.open(ad.host);
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
function leaveRoom(quiet = false) {
  if (!N.room) return;
  if (N.mode === 'host') { N.room.send({ t: 'close' }); N.lobby?.advertise(null); }
  N.room.leave();
  N.room = null;
  N.mode = null;
  N.members = [];
  N.playing = false;
  N.menu = false;
  N.busy = '';
  N.snap = null;
  N.gotSnap = false;
  noted = null;
  if (N.saved) { Object.assign(A.settings, N.saved); N.saved = null; }
  A.state = N.lobby ? 'net-lobby' : 'net-servers';
  A.banner = null;
  if (!quiet) say('YOU LEFT THE ROOM', 2);
}

function hookRoom() {
  const r = N.room;
  r.onJoin = (id) => {
    if (N.mode === 'client' && id === r.hostId) r.send({ t: 'hello', name: N.name, skill: N.skill }, id);
  };
  r.onLeave = (id) => {
    if (N.mode === 'client' && id === r.hostId) { leaveRoom(true); say('THE HOST LEFT - THE ROOM IS GONE'); return; }
    if (N.mode !== 'host') return;
    const m = N.members.find((x) => x.id === id);
    if (!m) return;
    N.members = N.members.filter((x) => x !== m);
    N.ctl.delete(id);
    // gone mid-game: their fighter drops out
    for (const f of A.game.fighters) if (f.peer === id) { f.lives = 0; f.respawnT = 0; if (f.alive) f.die(null, 'LEFT', 0, 0); }
    say(`${m.name} LEFT`, 2);
    shareRoom();
  };
  r.onMsg = (m, from) => (N.mode === 'host' ? hostMsg(m, from) : clientMsg(m, from));
  r.onCtl = (c, from) => {
    if (N.mode !== 'host') return;
    let e = N.ctl.get(from);
    if (!e) N.ctl.set(from, (e = { held: {}, pressed: {} }));
    for (const k of PRESSED) if (c[k]) e.pressed[k] = true;
    if (c.slot) e.pressed.slot = c.slot;
    if (c.cycle) e.pressed.cycle = c.cycle;
    const held = { ...c };
    for (const k of PRESSED) delete held[k];
    delete held.slot;
    delete held.cycle;
    e.held = held;
  };
  r.onSnap = (s, from) => { if (N.mode === 'client' && from === r.hostId) N.snap = s; };
}
function hostMsg(m, from) {
  if (m.t === 'hello') {
    if (N.playing) return N.room.send({ t: 'no', why: 'THAT GAME HAS STARTED' }, from);
    if (N.members.length >= MAX_PLAYERS && !N.members.some((x) => x.id === from)) return N.room.send({ t: 'no', why: 'THAT ROOM IS FULL' }, from);
    if (!N.members.some((x) => x.id === from)) N.members.push({ id: from, name: String(m.name).slice(0, 12), skill: m.skill ?? null, ready: false });
    N.room.send({ t: 'welcome' }, from);
    say(`${String(m.name).slice(0, 12)} JOINED`, 2);
    shareRoom();
  } else if (m.t === 'me') {
    const x = N.members.find((y) => y.id === from);
    if (!x) return;
    x.skill = m.skill ?? null;
    x.ready = !!m.ready;
    shareRoom();
  }
}
function clientMsg(m) {
  if (m.t === 'welcome') { N.welcomed = true; A.state = 'net-room'; N.busy = ''; }
  else if (m.t === 'no') { leaveRoom(true); say(m.why); }
  else if (m.t === 'room') {
    N.roomName = m.name;
    N.members = m.members;
    N.playing = m.playing;
    N.hostSettings = m.settings;
  } else if (m.t === 'start') {
    N.saved ??= { ...A.settings };
    Object.assign(A.settings, m.settings);
    N.fighters.clear();
    N.props.clear();
    N.gotSnap = false;
    N.playing = true;
    A.startNetMatch(m.roster, m.map, myId(), false);
    for (const f of A.game.fighters) N.fighters.set(f.nid, f);
    N.fistsDef ??= A.game.fighters[0]?.melee?.def;
  } else if (m.t === 'back') {
    N.playing = false;
    N.menu = false;
    A.state = 'net-room';
    A.banner = null;
    for (const x of N.members) if (x.id === myId()) x.ready = false;
  } else if (m.t === 'close') {
    leaveRoom(true);
    say('THE HOST CLOSED THE ROOM');
  }
}
// (the host) everyone in: the fighters (the players, then bots to fill), the map, go
function startGame() {
  const s = A.settings, players = N.members.slice(0, MAX_PLAYERS);
  const roster = players.map((m, i) => ({ name: m.name, ...LOOKS[i], skill: m.skill, peer: m.id }));
  const bots = s.mode === 'teams' ? Math.max(0, 4 - roster.length) : Math.min(s.bots, 6 - roster.length);
  for (let i = 0; i < bots; i++) roster.push({ name: BOT_NAMES[i], ...LOOKS[roster.length], bot: true });
  roster.forEach((r, i) => { r.team = s.mode === 'teams' ? i % 2 : i; });
  const map = s.map === 'random' ? A.pick(A.MAP_KEYS) : s.map;
  N.playing = true;
  N.sendT = 0;
  N.sent = new Map();
  noted = [];
  A.startNetMatch(roster, map, myId(), true);
  N.room.send({ t: 'start', roster, map, settings: { ...s } });
  shareRoom();
}
// (the host) the match over: everyone back to the room
function backToRoom() {
  N.playing = false;
  N.menu = false;
  noted = null;
  for (const m of N.members) if (m.id !== myId()) m.ready = false;
  A.state = 'net-room';
  A.banner = null;
  N.room.send({ t: 'back' });
  shareRoom();
}

// ---------- upkeep, and input on the screens ----------

export function netUpdate(dt) {
  N.lobby?.update(dt);
  N.room?.update(dt);
  if (N.msgT > 0) N.msgT -= dt;
  if (N.mode === 'host' && N.lobby) N.lobby.advertise(lobbyAd());
}

// typing a name in: letters, digits, a few marks; ENTER done, ESC back out
function typing() {
  const I = A.input;
  for (const code of I.pressed) {
    if (code === 'Enter') { finishEdit(true); return; }
    if (code === 'Escape') { finishEdit(false); return; }
    if (code === 'Backspace') N.draft = N.draft.slice(0, -1);
    else if (N.draft.length < 12) {
      if (code.startsWith('Key')) N.draft += code.slice(3);
      else if (code.startsWith('Digit')) N.draft += code.slice(5);
      else if (code === 'Space') N.draft += ' ';
      else if (code === 'Minus') N.draft += '-';
    }
  }
  if (I.wasPressed('Mouse0') && N.hover !== N.edit) finishEdit(true);
}
function startEdit(what) {
  N.edit = what;
  N.draft = what === 'name' ? N.name : N.roomName;
}
function finishEdit(keep) {
  const v = N.draft.trim();
  if (keep && v) {
    if (N.edit === 'name') { N.name = v; saveMe(); }
    else { N.roomName = v; shareRoom(); }
  }
  N.edit = null;
}

export function netScreenInput() {
  const I = A.input, state = A.state;
  // what the mouse is over (from the last frame's layout)
  if (I.mouse.active) {
    const mx = I.mouse.x * A.renderer.dpr, my = I.mouse.y * A.renderer.dpr;
    N.hover = N.hits.find((h) => mx >= h.x0 && mx < h.x1 && my >= h.y0 && my < h.y1)?.id ?? null;
  }
  if (N.edit) return typing();
  if (N.busy) { if (I.wasPressed('Escape')) { leaveRoom(true); N.busy = ''; } return; }
  const click = I.wasPressed('Mouse0') ? N.hover : null;
  if (state === 'net-servers') {
    if (I.wasPressed('KeyW', 'ArrowUp')) N.sel = (N.sel + SERVERS.length - 1) % SERVERS.length;
    if (I.wasPressed('KeyS', 'ArrowDown')) N.sel = (N.sel + 1) % SERVERS.length;
    if (click?.startsWith('srv:')) N.sel = +click.slice(4);
    if (click?.startsWith('srv:') || I.wasPressed('Enter')) enterServer(SERVERS[N.sel]);
    else if (click === 'name' || I.wasPressed('KeyN')) startEdit('name');
    else if (click === 'back' || I.wasPressed('Escape')) A.state = 'menu';
  } else if (state === 'net-lobby') {
    const list = N.lobby?.list ?? [];
    if (click?.startsWith('room:')) { const ad = list.find((r) => r.host === click.slice(5)); if (ad) joinRoom(ad); }
    else if (click === 'create' || I.wasPressed('KeyC')) createRoom();
    else if (click === 'quick' || I.wasPressed('Enter')) {
      const ad = list.find((r) => !r.playing && r.n < r.max);
      if (ad) joinRoom(ad);
      else say('NO OPEN ROOMS - MAKE ONE');
    } else if (click === 'servers' || I.wasPressed('Escape')) leaveServer();
  } else if (state === 'net-room') {
    const host = N.mode === 'host', me = N.members.find((m) => m.id === myId());
    if (click?.startsWith('opt:') && host) {
      const [, i, dir] = click.split(':');
      A.changeNetSetting(+i, +dir);
      shareRoom();
    } else if (click === 'skill-' || click === 'skill+' || I.wasPressed('KeyQ')) {
      const at = SKILLS.findIndex(([k]) => k === N.skill), dir = click === 'skill-' ? -1 : 1;
      N.skill = SKILLS[(at + dir + SKILLS.length) % SKILLS.length][0];
      saveMe();
      if (me) me.skill = N.skill;
      if (host) shareRoom();
      else N.room.send({ t: 'me', skill: N.skill, ready: !!me?.ready });
    } else if (click === 'roomname' && host) startEdit('room');
    else if (click === 'ready' || (I.wasPressed('Enter') && !host)) {
      if (!host && me) { me.ready = !me.ready; N.room.send({ t: 'me', skill: N.skill, ready: me.ready }); }
    } else if ((click === 'start' || I.wasPressed('Enter')) && host) {
      if (N.members.every((m) => m.ready)) startGame();
      else say('WAITING FOR EVERYONE TO BE READY', 2);
    } else if (click === 'leave' || I.wasPressed('Escape')) leaveRoom();
  }
}

// In a game: ESC brings up (and puts away) the menu - the game goes on behind it.
export function netGameInput() {
  const I = A.input;
  if (A.state === 'match' && N.mode === 'host' && A.stateT > 2 && I.wasPressed('Enter', 'Mouse0')) return backToRoom();
  if (I.wasPressed('Escape')) N.menu = !N.menu;
  if (N.menu && (I.wasPressed('KeyL') || (I.wasPressed('Mouse0') && N.hover === 'leave-game'))) leaveRoom();
  if (I.mouse.active) {
    const mx = I.mouse.x * A.renderer.dpr, my = I.mouse.y * A.renderer.dpr;
    N.hover = N.hits.find((h) => mx >= h.x0 && mx < h.x1 && my >= h.y0 && my < h.y1)?.id ?? null;
  }
}

// ---------- drawing the screens ----------

const C = { gold: '#ffd25a', teal: '#8ff0ff', text: '#e8e2d0', dim: '#7a8a80', faint: '#4a5a52', red: '#ff8a6a', green: '#8aff9a', row: 'rgba(201, 168, 58, 0.16)' };
function hit(id, x0, y0, w, h) { N.hits.push({ id, x0, y0, x1: x0 + w, y1: y0 + h }); }
function button(ctx, u, x, y, w, h, label, id, { on = false, dim = false } = {}) {
  const hot = N.hover === id;
  A.panel(ctx, x, y, w, h, u, on || hot ? C.gold : '#3a4c46');
  if (hot) { ctx.fillStyle = C.row; ctx.fillRect(x, y, w, h); }
  const tw = A.textWidth(label) * u;
  A.drawText(ctx, label, Math.round(x + w / 2 - tw / 2), Math.round(y + h / 2 - 3 * u), u, dim ? C.faint : hot || on ? '#ffffff' : C.text);
  hit(id, x, y, w, h);
}
function header(ctx, u, W, title, sub) {
  A.centerText(ctx, title, 12 * u, 3, C.gold, u);
  if (sub) A.centerText(ctx, sub, 34 * u, 1, C.teal, u);
}
function footer(ctx, u, W, H, hint) {
  if (N.msgT > 0) A.centerText(ctx, N.msg, H - 24 * u, 1, C.red, u);
  if (N.busy) A.centerText(ctx, N.busy + (Math.floor(performance.now() / 300) % 2 ? '' : ' '), H - 24 * u, 1, C.teal, u);
  A.centerText(ctx, hint, H - 11 * u, 1, '#5a6a60', u);
}
const T = (ctx, u, s, x, y, col = C.text, size = 1) => A.drawText(ctx, String(s), Math.round(x), Math.round(y), u * size, col);

export function drawNetScreen(ctx, u, W, H) {
  N.hits = [];
  ctx.fillStyle = 'rgba(4, 7, 6, 0.72)';
  ctx.fillRect(0, 0, W, H);
  if (A.state === 'net-servers') drawServers(ctx, u, W, H);
  else if (A.state === 'net-lobby') drawLobby(ctx, u, W, H);
  else drawRoom(ctx, u, W, H);
}

function nameBox(ctx, u, x, y, w) {
  const editing = N.edit === 'name', label = editing ? N.draft + (Math.floor(performance.now() / 400) % 2 ? '_' : ' ') : N.name;
  T(ctx, u, 'YOUR NAME', x, y - 9 * u, C.dim);
  A.panel(ctx, x, y, w, 13 * u, u, editing || N.hover === 'name' ? C.gold : '#3a4c46');
  T(ctx, u, label, x + 5 * u, y + 4 * u, editing ? '#ffffff' : C.text);
  if (!editing) T(ctx, u, 'CHANGE', x + w - (A.textWidth('CHANGE') + 5) * u, y + 4 * u, C.faint);
  hit('name', x, y, w, 13 * u);
}

function drawServers(ctx, u, W, H) {
  header(ctx, u, W, 'MULTIPLAYER', 'CHOOSE A SERVER');
  const w = Math.min(W - 24 * u, 260 * u), x = Math.round(W / 2 - w / 2);
  nameBox(ctx, u, x, 58 * u, w);
  const top = 84 * u, rowH = 29 * u;
  SERVERS.forEach((s, i) => {
    const id = `srv:${i}`, on = N.sel === i || N.hover === id, y = top + i * rowH;
    A.panel(ctx, x, y, w, rowH - 4 * u, u, on ? C.gold : '#2a3632');
    if (on) { ctx.fillStyle = C.row; ctx.fillRect(x, y, w, rowH - 4 * u); }
    T(ctx, u, s.name, x + 8 * u, y + 4 * u, on ? '#ffffff' : C.text, 2);
    T(ctx, u, s.desc, x + 8 * u, y + 17 * u, on ? '#c8cfc9' : C.faint);
    // a signal-strength look, for the feel of it
    for (let b = 0; b < 4; b++) {
      ctx.fillStyle = b < 4 - (i % 2) ? '#3fd0a0' : '#1f2a26';
      ctx.fillRect(x + w - (30 - b * 5) * u, y + (17 - b * 3) * u, 3 * u, (3 + b * 3) * u);
    }
    hit(id, x, y, w, rowH - 4 * u);
  });
  const by = top + SERVERS.length * rowH + 4 * u;
  button(ctx, u, x, by, 80 * u, 14 * u, 'BACK', 'back');
  T(ctx, u, 'FREE - PLAYERS CONNECT TO EACH OTHER DIRECTLY', x + 88 * u, by + 4 * u, C.faint);
  footer(ctx, u, W, H, 'CLICK A SERVER / ENTER - CONNECT     N - CHANGE NAME     ESC - BACK');
}

const MODE_NAME = { ffa: 'FFA', teams: 'TEAMS' };
function drawLobby(ctx, u, W, H) {
  const L = N.lobby;
  header(ctx, u, W, `${N.server?.name ?? ''} - LOBBY`, `${L?.online ?? 1} ONLINE      YOU: ${N.name}`);
  const w = Math.min(W - 24 * u, 380 * u), x = Math.round(W / 2 - w / 2), top = 50 * u;
  const cols = [['NO', 0], ['ROOM NAME', 22], ['MODE', 0.5], ['MAP', 0.62], ['PLAYERS', 0.78], ['STATE', 0.89]];
  const cx = (c) => (c[1] < 1 ? x + w * c[1] : x + c[1] * u) + 4 * u;
  A.panel(ctx, x, top, w, 12 * u, u, C.gold);
  for (const c of cols) T(ctx, u, c[0], cx(c), top + 3 * u, C.gold);
  const list = L?.list ?? [], rowH = 13 * u, rows = Math.max(6, Math.floor((H - top - 70 * u) / rowH));
  for (let i = 0; i < rows; i++) {
    const r = list[i], y = top + 14 * u + i * rowH, id = r ? `room:${r.host}` : null;
    ctx.fillStyle = i % 2 ? 'rgba(20, 28, 24, 0.85)' : 'rgba(14, 20, 17, 0.85)';
    ctx.fillRect(x, y, w, rowH - u);
    if (!r) continue;
    if (N.hover === id) { ctx.fillStyle = C.row; ctx.fillRect(x, y, w, rowH - u); }
    const full = r.n >= r.max, col = r.playing || full ? C.dim : C.text;
    T(ctx, u, String(i + 1).padStart(3, '0'), cx(cols[0]), y + 3 * u, C.dim);
    T(ctx, u, String(r.name).slice(0, 22), cx(cols[1]), y + 3 * u, N.hover === id ? '#ffffff' : col);
    T(ctx, u, MODE_NAME[r.mode] ?? r.mode, cx(cols[2]), y + 3 * u, col);
    T(ctx, u, String(r.map).toUpperCase().slice(0, 8), cx(cols[3]), y + 3 * u, col);
    T(ctx, u, `${r.n}/${r.max}`, cx(cols[4]), y + 3 * u, full ? C.red : C.green);
    T(ctx, u, r.playing ? 'PLAYING' : full ? 'FULL' : 'WAITING', cx(cols[5]), y + 3 * u, r.playing ? C.red : full ? C.dim : C.teal);
    hit(id, x, y, w, rowH - u);
  }
  if (!list.length) A.centerText(ctx, 'NO ROOMS YET - MAKE ONE AND TELL YOUR FRIENDS WHICH SERVER', top + 14 * u + rowH * 2 + 3 * u, 1, C.dim, u);
  const by = top + 16 * u + rows * rowH, bw = 92 * u, gap = 8 * u, bx = Math.round(W / 2 - (bw * 3 + gap * 2) / 2);
  button(ctx, u, bx, by, bw, 15 * u, 'CREATE ROOM', 'create', { on: true });
  button(ctx, u, bx + bw + gap, by, bw, 15 * u, 'QUICK JOIN', 'quick');
  button(ctx, u, bx + (bw + gap) * 2, by, bw, 15 * u, 'CHANGE SERVER', 'servers');
  footer(ctx, u, W, H, 'CLICK A ROOM - JOIN     C - CREATE     ENTER - QUICK JOIN     ESC - SERVERS');
}

function drawRoom(ctx, u, W, H) {
  const host = N.mode === 'host', me = N.members.find((m) => m.id === myId());
  const settings = host ? A.settings : (N.hostSettings ?? A.settings);
  const editing = N.edit === 'room';
  header(ctx, u, W, editing ? N.draft + (Math.floor(performance.now() / 400) % 2 ? '_' : ' ') : N.roomName, `${N.server?.name ?? ''} - ${host ? 'YOUR ROOM' : 'WAITING FOR THE HOST TO START'}${!host && N.room?.ping ? `      PING ${N.room.ping} MS` : ''}`);
  if (host) hit('roomname', W / 2 - 120 * u, 10 * u, 240 * u, 22 * u);
  const total = Math.min(W - 24 * u, 400 * u), x0 = Math.round(W / 2 - total / 2), top = 50 * u;
  const lw = Math.round(total * 0.48), rw = total - lw - 8 * u, rx = x0 + lw + 8 * u;
  // the players
  A.panel(ctx, x0, top, lw, 12 * u, u, C.gold);
  T(ctx, u, `PLAYERS ${N.members.length}/${MAX_PLAYERS}`, x0 + 4 * u, top + 3 * u, C.gold);
  const slotH = 22 * u;
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const m = N.members[i], y = top + 14 * u + i * slotH;
    A.panel(ctx, x0, y, lw, slotH - 3 * u, u, m && m.id === myId() ? C.gold : '#2a3632');
    T(ctx, u, i + 1, x0 + 5 * u, y + 6 * u, C.dim);
    if (!m) { T(ctx, u, 'OPEN', x0 + 16 * u, y + 6 * u, C.faint); continue; }
    ctx.fillStyle = LOOKS[i].color;
    ctx.fillRect(x0 + 15 * u, y + 4 * u, 3 * u, 11 * u);
    T(ctx, u, m.name, x0 + 22 * u, y + 3 * u, '#ffffff');
    T(ctx, u, SKILLS.find(([k]) => k === m.skill)?.[1] ?? 'NO SKILL', x0 + 22 * u, y + 11 * u, C.teal);
    const tag = i === 0 ? 'HOST' : m.ready ? 'READY' : 'NOT READY';
    T(ctx, u, tag, x0 + lw - (A.textWidth(tag) + 5) * u, y + 6 * u, i === 0 ? C.gold : m.ready ? C.green : C.red);
  }
  // the room's settings (the host changes them)
  A.panel(ctx, rx, top, rw, 12 * u, u, C.gold);
  T(ctx, u, host ? 'ROOM SETTINGS - CLICK TO CHANGE' : 'ROOM SETTINGS', rx + 4 * u, top + 3 * u, C.gold);
  const rowH = 10 * u;
  A.OPTIONS.forEach(([k, label, vals], i) => {
    const y = top + 15 * u + i * rowH, shown = vals.find(([v]) => v === settings[k])?.[1] ?? '?';
    if (host && (N.hover === `opt:${i}:-1` || N.hover === `opt:${i}:1`)) { ctx.fillStyle = C.row; ctx.fillRect(rx, y - 2 * u, rw, rowH); }
    T(ctx, u, label, rx + 4 * u, y, C.dim);
    const val = host ? `< ${shown} >` : shown;
    T(ctx, u, val, rx + rw - (A.textWidth(val) + 4) * u, y, '#ffffff');
    if (host) { hit(`opt:${i}:-1`, rx, y - 2 * u, rw / 2, rowH); hit(`opt:${i}:1`, rx + rw / 2, y - 2 * u, rw / 2, rowH); }
  });
  // your skill, and ready / start, leave
  const by = top + 16 * u + Math.max(MAX_PLAYERS * slotH, A.OPTIONS.length * rowH) + 14 * u;   // (under whichever column's longer)
  const sk = SKILLS.find(([k]) => k === N.skill)?.[1] ?? 'NO SKILL';
  T(ctx, u, 'YOUR SKILL (Q)', x0, by - 9 * u, C.dim);
  button(ctx, u, x0, by, 14 * u, 15 * u, '<', 'skill-');
  A.panel(ctx, x0 + 16 * u, by, lw - 32 * u, 15 * u, u, '#3a4c46');
  T(ctx, u, sk, x0 + 16 * u + (lw - 32 * u) / 2 - (A.textWidth(sk) * u) / 2, by + 5 * u, C.teal);
  button(ctx, u, x0 + lw - 14 * u, by, 14 * u, 15 * u, '>', 'skill+');
  const allReady = N.members.every((m) => m.ready);
  if (host) button(ctx, u, rx, by, Math.round(rw * 0.6), 15 * u, allReady ? 'START' : 'START (NOT ALL READY)', 'start', { on: allReady, dim: !allReady });
  else button(ctx, u, rx, by, Math.round(rw * 0.6), 15 * u, me?.ready ? 'READY!' : 'READY', 'ready', { on: !!me?.ready });
  button(ctx, u, rx + Math.round(rw * 0.6) + 6 * u, by, rw - Math.round(rw * 0.6) - 6 * u, 15 * u, 'LEAVE', 'leave');
  footer(ctx, u, W, H, host ? 'CLICK THE NAME TO RENAME THE ROOM     ENTER - START     Q - SKILL     ESC - LEAVE' : 'ENTER - READY     Q - SKILL     ESC - LEAVE');
}

// In a game, over the HUD: the ping, the menu (ESC), and what's happening (someone left ...).
export function drawNetOverlay(ctx, u, W, H) {
  N.hits = [];
  if (N.mode === 'client' && N.room?.ping) T(ctx, u, `PING ${N.room.ping}`, 6 * u, H - 10 * u, '#5a6a60');
  if (N.mode === 'client' && !N.gotSnap) A.centerText(ctx, 'WAITING FOR THE HOST...', H * 0.5, 1, C.teal, u);
  if (A.state === 'match') A.centerText(ctx, N.mode === 'host' ? (A.stateT > 2 ? 'ENTER / CLICK - BACK TO THE ROOM' : '') : 'THE HOST WILL TAKE EVERYONE BACK TO THE ROOM', H - 30 * u, 1, C.gold, u);
  if (N.msgT > 0) A.centerText(ctx, N.msg, H - 44 * u, 1, C.red, u);
  if (!N.menu) return;
  ctx.fillStyle = 'rgba(4, 6, 6, 0.7)';
  ctx.fillRect(0, 0, W, H);
  A.centerText(ctx, N.roomName, H * 0.34, 3, C.gold, u);
  A.centerText(ctx, 'THE GAME GOES ON WHILE THIS IS OPEN', H * 0.34 + 24 * u, 1, C.dim, u);
  const bw = 120 * u;
  button(ctx, u, W / 2 - bw / 2, H * 0.34 + 40 * u, bw, 15 * u, N.mode === 'host' ? 'LEAVE (ENDS THE ROOM)' : 'LEAVE THE ROOM', 'leave-game');
  A.centerText(ctx, 'ESC - BACK TO THE GAME     L - LEAVE', H * 0.34 + 64 * u, 1, '#5a6a60', u);
}
