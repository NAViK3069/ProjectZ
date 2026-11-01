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

import { SERVERS, Lobby, GameRoom, myId, pingServer } from './net.js';
import { Fighter } from './fighter.js';
import { Fx } from './fx.js';
import { Lights } from './light.js';
import { Prop } from './props.js';
import { Weapon } from '../combat/weapons.js';
import { MeleeWeapon, MELEE } from '../combat/melee.js';
import { K } from '../ui/kit.js';

let A = null;   // what this needs of the game (main.js)
const SNAP_EVERY = 1 / 20, CTL_EVERY = 1 / 30, CTL_STALE = 0.35;   // states out; controls in at least this often; no word from a player this long, they're let go
// A room's 8 slots, in two columns of 4 (in TEAMS: the left BLUE, the right RED). Each is open
// (anyone joining takes the first), closed (not there), a bot, or a player.
const SLOTS = 8;
const LOOKS = [
  { color: '#e8e2d0', hue: 0, sat: 1 }, { color: '#ff6a5a', hue: 150, sat: 1.3 }, { color: '#6ad8ff', hue: 210, sat: 1.2 },
  { color: '#c8ff5a', hue: 290, sat: 1.1 }, { color: '#ffb84a', hue: 40, sat: 1.2 }, { color: '#e07aff', hue: 250, sat: 1.3 },
  { color: '#7affc8', hue: 100, sat: 1.2 }, { color: '#ff9ad8', hue: 320, sat: 1.2 },
];
const BOT_NAMES = ['VEX', 'KORA', 'DUKE', 'ROOK', 'NYX', 'ZED', 'IVO', 'MOX'];
// (the others) everyone else is drawn a moment behind the latest from the host, eased between its states - smooth,
// however unevenly they come in. How far behind goes with how far apart they've been coming (the longest gap lately, and a bit).
const DELAY_MIN = 0.08, DELAY_MAX = 0.3;
// worked out on each screen for itself, every frame (see Fighter.coast): not taken from the host's states
const LOOKS_HERE = ['pose', 'animT', 'frame', 'state', 'sq', 'sqV', 'settle', 'tilt'];
// our own gun's kick, flash and cycling - from the shots fired here, at once (see predict), not the host's later copy of them
const OUR_GUN = ['flash', 'recoil', 'climb', 'cooldown', 'cycleT', 'heat', 'acting', 'actDelay', 'spent', 'burstLeft', 'reloadQueued'];
const delay = () => Math.max(DELAY_MIN, Math.min(DELAY_MAX, (N.gap ?? 0.05) * 1.3 + 0.03));
const teamOf = (i) => (i < SLOTS / 2 ? 0 : 1);
const TEAM_LOOKS = [{ color: '#6ad8ff', hue: 210, sat: 1.2 }, { color: '#ff6a5a', hue: 8, sat: 1.7 }];   // in TEAMS everyone wears their side's colour: BLUE, RED (the art's own hair is red)
const MAX_WATCH = 8;   // how many can watch a room besides those in its slots
export const SKILLS = [
  ['grapple', 'GRAPPLE'], ['cloak', 'CLOAK'], ['decoy', 'SHADOW CLONE'], ['archery', 'ARCHERY'], ['murasaki', 'MURASAKI'],
  ['blaze', 'FLAME FIST'], ['galaxy', 'GALAXY'], ['demon', 'ABYSS GOLEM'], [null, 'NO SKILL'],
];
const PRESSED = ['jump', 'reload', 'roll', 'melee', 'skill', 'drop', 'throwWeapon', 'pickup', 'grenade'];

const N = {
  name: '', skill: 'grapple', edit: null, draft: '',
  server: null, lobby: null, room: null, mode: null,   // mode: 'host' | 'client' while in a room
  roomName: '', made: 0, members: [], slots: [], playing: false,
  msg: '', msgT: 0, busy: '', sel: -1, pings: {}, pingT: 0,
  watching: false, match: null, deadT: 0,
  pass: '', creating: null, joinAsk: null, joinPass: '',
  confirm: null, banned: new Map(), out: false, offset: undefined,
  ghost: null, knock: null, shots: new Map(),   // (the others) our own fighter's movement, run here at once (see predict); a hit's knock to give it   // confirm: a button waiting for its second click; banned: (the host) kicked -> till when; out: sat out of the match, in the room   // pass: (the host) the room's password, '' for none; creating: the CREATE ROOM box ({ name, pass }); joinAsk: a locked room we're asked the password for   // watching: in a game we're not in (it started before we came); match: (the host) the game going on, for anyone who comes to watch
  ctl: new Map(), sendT: 0, snaps: [], gotSnap: false, menu: false, saved: null, ctlT: 0, lastCtl: '', pend: {},
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
  get watching() { return N.watching; },
  get snapSize() { return N.lastSize; },   // (for checking: how big a state of the game sent lately was, in bytes)
  get debug() { return N; },               // (for checking, from the console)
  isScreen: (state) => state === 'net-servers' || state === 'net-lobby' || state === 'net-room',
};

export function initOnline(api) {
  A = api;
  recordEffects();
}
// from the main menu
export function openOnline() {
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
const SKIP = new Set(['game', 'images', 'parts', 'hands', 'selfCanvas', 'rollCanvas', 'rollGhost', 'pix', 'art', 'def', 'ammoSource', 'events', '_icon', 'level', 'nav', 'img']);
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
    t: Math.round(g.time * 1000) / 1000, rt: Math.round(performance.now()) / 1000, st: A.state, sT: ser(A.stateT), rd: A.round, rT: ser(A.roundT), ot: A.overtime, sl: A.slow,
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
  // where the host is in time against us (the least delayed of what comes in counts most)
  const lag = s.rt - performance.now() / 1000;
  N.offset = N.offset === undefined || lag > N.offset ? lag : N.offset + (lag - N.offset) * 0.01;
  // the gap between states (the longest lately, fading)
  if (N.lastRt !== undefined) N.gap = Math.max(s.rt - N.lastRt, (N.gap ?? 0.05) * 0.985);
  N.lastRt = s.rt;
  for (const e of s.f) {
    const f = N.fighters.get(e.n), ox = f.x, oy = f.y, had = f._seen, aim = f.aim;
    if (had) for (const k of LOOKS_HERE) delete e.s[k];
    const ours = had && f.peer === myId() && !N.watching && N.ghost?.synced, gun = ours ? f.weapon : null, gunWas = gun && Object.fromEntries([...OUR_GUN, 'ammo', 'reloading', 'reload'].map((k) => [k, gun[k]]));
    assign(f, e.s);
    if (gun && f.weapon === gun) {
      const now = performance.now() / 1000, { ammo, reloading, reload } = gunWas;
      for (const k of OUR_GUN) gun[k] = gunWas[k];
      // a shot or a reload just done here: the host's copy may not have it yet (its state set off before
      // our controls got there) - ours stands till it can have
      if (now < N.gunHold && gun.ammo > ammo) gun.ammo = ammo;
      if (now < N.reloadHold && reloading && !gun.reloading) gun.reload = reload;   // (reloading: its progress, -1 when not)
    }
    // the aim: eased to (see clientFrame) - our own, it's where our mouse is
    if (e.s.aim !== undefined) { f._aim = f.aim; if (had) f.aim = aim; }
    // where it is now by the host, kept with the time - drawn from these (see clientFrame), not jumped to
    if (f.peer === myId() && e.s.hurtT !== undefined && f.hurtT < 0.15 && (e.s.vx !== undefined || e.s.vy !== undefined)) N.knock = { vx: f.vx, vy: f.vy };
    if (e.s.x !== undefined || f._sx === undefined) f._sx = f.x;
    if (e.s.y !== undefined || f._sy === undefined) f._sy = f.y;
    (f._h ??= []).push({ t: s.rt, x: f._sx, y: f._sy });
    if (f._h.length > 12) f._h.shift();
    if (had) { f.x = ox; f.y = oy; }
    f._seen = true;
  }
  for (const id of [...N.fighters.keys()]) if (!keep.includes(N.fighters.get(id))) N.fighters.delete(id);
  g.fighters = keep;
  const me = keep.find((f) => f.peer === myId());
  if (me && !N.watching) A.player = me;
  else if (!keep.includes(A.player) || (N.watching && A.player === me && !me.alive)) A.player = keep.find((f) => !f.isDecoy) ?? keep[0] ?? A.player;
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
  // (others' shots and throws put back as far as the fighters are drawn behind, so they come out of the
  // gun; our own not - our own fighter is drawn where it is now, and ours come out of ours)
  const mine = (o) => !N.watching && (o.owner?.peer === myId() || o.owner?.owner?.peer === myId());
  for (const list of [g.bullets, g.grenades, g.thrown, g.arrows]) for (const o of list) if (o && typeof o.vx === 'number' && !mine(o)) { o.x -= o.vx * delay(); o.y -= o.vy * delay(); }
  // our own shots come in from the host already well on their way (a trip there and back after the click):
  // the first time each is seen, how far out it is - it's drawn coming out of our gun and catching up
  // to where it really is in a moment (see clientFrame). Where it really is, is what hits.
  const self = N.watching ? null : g.fighters.find((f) => f.peer === myId()), now = performance.now() / 1000;
  for (const b of g.bullets) {
    if (!b || b.id === undefined || !self || b.owner !== self) continue;
    if (!N.shots.has(b.id)) N.shots.set(b.id, { t0: null, ahead: 0, seen: now });   // (how far out: measured when it's first drawn - see clientFrame)
  }
  for (const [id, sh] of N.shots) if (now - sh.seen > 2) N.shots.delete(id);
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
  if (performance.now() - c.at > CTL_STALE * 1000) c.held = {};   // (gone quiet: hands off, rather than run on as they were)
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
    // where they say they are (they move themselves at once, on their own screen - see predict):
    // taken, carried on a touch for its age - unless it's far off (just respawned, say) or something
    // else is moving them (a dash, the grapple line, a stab's lunge: those the host runs)
    const e = N.ctl.get(f.peer), p = e?.pos, age = e ? (performance.now() - e.posAt) / 1000 : 9;
    if (live && p && age < 0.3 && f.alive && !hostMoved(f)) {
      const x = p[0] + p[2] * Math.min(age, 0.1);
      if (Math.hypot(x - f.x, p[1] - f.y) < 100) {
        f.x = x; f.y = p[1]; f.vx = p[2]; f.vy = p[3];
        f.onGround = !!(p[4] & 1); f.onLadder = !!(p[4] & 2); f.crouch = !!(p[4] & 4); f.facing = p[5];
      }
    }
  }
}
// Something other than its own feet moving a fighter (run by the host, not predicted)
const hostMoved = (f) => !!(f.blaze || f.hook || f.lunge || f.mura || f.gal || f.summon || (f.bow && !f.bow.fired) || f.cloak?.rollStab);
// (the host) the state of the game out to everyone, twenty times a second
export function hostFrame(dt) {
  if (N.mode !== 'host' || !N.playing || !N.room) return;
  noted ??= [];
  if ((N.sendT -= dt) > 0) return;
  N.sendT = Math.max(0, N.sendT + SNAP_EVERY);   // (what's over carries on: 20 a second whatever the step)
  const s = snapshot();
  if (N.room.peers.size) N.room.snap.send(s);
  if ((N.sizeN = (N.sizeN ?? 0) + 1) % 40 === 1) N.lastSize = JSON.stringify(s).length;
  noted = [];
}
// (the others) a frame: the latest state put in, things carried on between states, our controls sent
export function clientFrame(dt) {
  const g = A.game;
  if (N.snaps.length) { for (const s of N.snaps.splice(0)) applySnapshot(s); N.gotSnap = true; }
  if (!N.gotSnap) return;
  g.time += dt;
  // everyone drawn where they were a moment ago by the host, eased between the two states either
  // side of then - so they move smoothly however unevenly the states arrive; our own (not watching)
  // straight toward the latest, quickly - it feels less behind our hands
  const then = performance.now() / 1000 + (N.offset ?? 0) - delay();
  const live = A.state === 'fight' || A.state === 'end';
  const c = live && !N.menu && !N.watching ? A.playerControl() : A.IDLE;
  const mine = N.watching ? null : g.fighters.find((f) => f.peer === myId());
  const predicted = mine && live && predict(mine, c, dt);
  for (const f of g.fighters) {
    f.coast(dt, f !== predicted);
    if (f !== predicted && f._aim !== undefined) f.aim += Math.atan2(Math.sin(f._aim - f.aim), Math.cos(f._aim - f.aim)) * Math.min(1, dt * 18);
  }
  for (const f of g.fighters) {
    const h = f._h;
    if (!h?.length || f === predicted) continue;
    if (f.peer === myId() && !N.watching) {
      const k = Math.min(1, dt * 30), far = Math.hypot(f._sx - f.x, f._sy - f.y) > 60;
      f.x = far ? f._sx : f.x + (f._sx - f.x) * k;
      f.y = far ? f._sy : f.y + (f._sy - f.y) * k;
      continue;
    }
    let a = h[0], b = h[h.length - 1];
    for (let i = h.length - 1; i > 0; i--) if (h[i - 1].t <= then) { a = h[i - 1]; b = h[i]; break; }
    let x = b.x, y = b.y;
    if (then <= h[0].t) { x = h[0].x; y = h[0].y; }
    else if (then > b.t && h.length > 1) {
      // past the newest (a state late): on the way it was going, a little, rather than stop dead
      const p = h[h.length - 2], span = b.t - p.t, ahead = Math.min(then - b.t, 0.12);
      if (span > 0.005 && Math.hypot(b.x - p.x, b.y - p.y) < 60) { x = b.x + ((b.x - p.x) / span) * ahead; y = b.y + ((b.y - p.y) / span) * ahead; }
    }
    else if (then < b.t && b.t > a.t && Math.hypot(b.x - a.x, b.y - a.y) < 60) {   // (further apart than that: a respawn, a teleport - no gliding across)
      const k = (then - a.t) / (b.t - a.t);
      x = a.x + (b.x - a.x) * k;
      y = a.y + (b.y - a.y) * k;
    }
    f.x = x;
    f.y = y;
  }
  for (const list of [g.bullets, g.grenades, g.thrown, g.arrows]) for (const o of list) if (o && typeof o.vx === 'number') {
    o._tx = (o._tx ?? o.x) + o.vx * dt;
    o._ty = (o._ty ?? o.y) + o.vy * dt;
    // our own shot, just fired: drawn back toward the gun, the gap closing over 0.12 s
    const sh = o.id !== undefined && N.shots.get(o.id), v = Math.hypot(o.vx, o.vy) || 1;
    if (sh && sh.t0 === null) {
      const self = g.fighters.find((f) => f.peer === myId());
      sh.t0 = performance.now() / 1000;
      sh.ahead = self ? Math.max(0, Math.min(180, ((o._tx - self.x) * o.vx + (o._ty - (self.y - 14)) * o.vy) / v - 6)) : 0;
    }
    const k = sh ? Math.max(0, 1 - (performance.now() / 1000 - sh.t0) / 0.12) : 0;
    o.x = o._tx - (o.vx / v) * (sh ? sh.ahead * k : 0);
    o.y = o._ty - (o.vy / v) * (sh ? sh.ahead * k : 0);
  }
  for (const list of [g.fists, g.galaxies, g.punches, g.blasts, g.numbers]) for (const o of list) if (o && typeof o.t === 'number') o.t += dt;
  g.fx.update(dt);
  g.lights.update(dt);
  if (A.banner) A.banner.t -= dt;
  if (N.watching) {
    const f = A.player;
    N.deadT = f && !f.alive && !(f.respawnT > 0) ? N.deadT + dt : 0;
    if (N.deadT > 1.5) { N.deadT = 0; watchNext(1); }
    return;
  }
  // our controls to the host: a press kept till it's sent; sent the moment anything changes, and 30 times a second anyway
  // (with where we are, while we're moving ourselves)
  const out = { ...c, target: c.target ? { x: Math.round(c.target.x), y: Math.round(c.target.y) } : null, aim: c.aim === null || c.aim === undefined ? null : Math.round(c.aim * 100) / 100 };
  const gh = predicted ? N.ghost : null;
  out.p = gh ? [Math.round(gh.x * 10) / 10, Math.round(gh.y * 10) / 10, Math.round(gh.vx), Math.round(gh.vy), (gh.onGround ? 1 : 0) | (gh.onLadder ? 2 : 0) | (gh.crouch ? 4 : 0), gh.facing] : null;
  for (const k of PRESSED) if (out[k]) N.pend[k] = true;
  if (out.slot) N.pend.slot = out.slot;
  if (out.cycle) N.pend.cycle = out.cycle;
  const held = JSON.stringify({ ...out, ...Object.fromEntries(PRESSED.map((k) => [k, false])), slot: 0, cycle: 0, p: null });
  N.ctlT -= dt;
  if (N.room && (held !== N.lastCtl || Object.keys(N.pend).length || N.ctlT <= 0)) {
    N.room.ctl.send({ ...out, ...N.pend }, { target: N.room.hostId });
    N.lastCtl = held;
    N.pend = {};
    N.ctlT = CTL_EVERY;
  }
}

// Our own fighter, moved here at once - not after our controls have been to the host and back (the
// host's own moves are instant on its screen; this makes ours the same). A stand-in of it runs just
// the movement - walking, running, jumping, ladders, dropping through, crouching, rolling - in the
// level as we have it, and our fighter is drawn where it is; where it is goes to the host with our
// controls, and the host takes it. Everything else - shots, hits, health, what's in hand, the skills -
// is still the host's. Back in step with the host: on a hit's knock, and whenever the host moves us
// itself (a respawn; a dash, the grapple line, a stab's lunge - those it runs) or we're far apart.
const MOVE_KEYS = ['move', 'up', 'down', 'jump', 'jumpHeld', 'sprint', 'roll', 'crouch', 'drop', 'aim', 'target'];
function makeGhost(f) {
  const game = Object.create(A.game);   // the level and the props, as we have them - but no effects of its own
  game.fx = new Proxy({}, { get: () => () => {} });
  game.lights = new Proxy({}, { get: () => () => {} });
  game.kick = () => {};
  const gh = new Fighter(game, A.images, { name: f.name, hue: 0, sat: 1 });
  gh.skill = null;
  gh.updateCombat = () => {};   // (moves only)
  Object.defineProperty(gh, 'held', { get: () => f.held });     // what's in hand slows it as it does ours
  Object.defineProperty(gh, 'hidden', { get: () => f.hidden });   // and the cloak
  return gh;
}
function syncGhost(gh, f) {
  Object.assign(gh, {
    x: f._sx ?? f.x, y: f._sy ?? f.y, vx: f.vx, vy: f.vy, onGround: f.onGround, onLadder: f.onLadder, crouch: f.crouch, facing: f.facing,
    roll: null, airJumps: f.airJumps ?? 1, coyote: 0, jumpBuf: 0, dropT: 0, alive: true, hp: gh.maxHp,
  });
}
function predict(f, c, dt) {
  if (!f.alive || hostMoved(f) || f.beamT !== undefined && f.beamT < 0.3) { N.ghost?.synced && (N.ghost.synced = false); return null; }
  const gh = (N.ghost ??= makeGhost(f));
  if (!gh.synced || Math.hypot((f._sx ?? f.x) - gh.x, (f._sy ?? f.y) - gh.y) > 100) { syncGhost(gh, f); gh.synced = true; }
  if (N.knock) { gh.vx = N.knock.vx; gh.vy = N.knock.vy; if (gh.vy < 0) gh.onGround = false; N.knock = null; }
  gh.stamina = f.stamina;
  gh.winded = f.winded;
  gh.boostT = f.boostT;
  gh.slot = f.slot;
  const mc = { ...A.IDLE };
  for (const k of MOVE_KEYS) mc[k] = c[k];
  gh.update(dt, mc);
  // our gun, at once: a shot (kick, flash, the round gone - the host fires the real one and sends it),
  // a reload started. (The host's copies of these come a trip later, and aren't taken: see applySnapshot.)
  const w = f.slot === 1 ? null : f.weapon;
  if (w && f.alive) {
    // (the host's word on these waits a trip there and back - and a bit)
    const hold = performance.now() / 1000 + Math.max(0.2, Math.min(0.6, ((N.room?.ping ?? 60) * 2) / 1000 + 0.15));
    if (c.reload && w.startReload() !== false) N.reloadHold = hold;
    const pull = c.fire && !f.onLadder && !f.roll && (((w.def.auto && !w.def.burst) || !N.trigger) || w.burstLeft > 0);
    if (pull) {
      const r = w.tryFire();
      if (r === 'fired') N.gunHold = hold;
      else if (r === 'empty' && w.reloading) N.reloadHold = hold;
    }
  }
  N.trigger = !!c.fire;
  // drawn where the stand-in is, as it is
  for (const k of ['x', 'y', 'vx', 'vy', 'onGround', 'onLadder', 'crouch', 'facing', 'roll', 'pose', 'sq', 'sqV', 'settle', 'state', 'animT', 'frame', 'climbT', 'sprinting', 'tilt']) f[k] = gh[k];
  if (c.aim !== null && c.aim !== undefined) f.aim = c.aim;
  return f;
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
  return { t: 'room', name: N.roomName, members: N.members, slots: N.slots, settings: { ...A.settings }, playing: N.playing, lock: !!N.pass, host: myId() };
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
  N.room.send({ t: 'host', to: id, st: { ...roomState(), pass: N.pass, made: N.made } });
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
  N.pass = st.pass ?? '';
  N.made = st.made ?? Date.now();
  N.playing = false;
  N.match = null;
  N.ctl = new Map();
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
function leaveRoom(quiet = false) {
  if (!N.room) return;
  if (N.mode === 'host') { N.room.send({ t: 'close' }); N.lobby?.advertise(null); }
  N.room.leave();
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
  if (N.saved) { Object.assign(A.settings, N.saved); N.saved = null; }
  A.state = N.lobby ? 'net-lobby' : 'net-servers';
  A.banner = null;
  if (!quiet) say('YOU LEFT THE ROOM', 2);
}

function hookRoom() {
  const r = N.room;
  r.onJoin = (id) => {
    if (N.mode === 'client' && id === r.hostId) r.send({ t: 'hello', name: N.name, skill: N.skill, pass: N.joinPass }, id);
  };
  r.onLeave = (id) => {
    if (N.mode === 'client' && id === r.hostId) { leaveRoom(true); say('THE HOST LEFT - THE ROOM IS GONE'); return; }
    if (N.mode !== 'host') return;
    const m = N.members.find((x) => x.id === id);
    if (!m) return;
    N.members = N.members.filter((x) => x !== m);
    for (const x of N.slots) if (x.k === 'p' && x.id === id) { x.k = 'open'; x.id = null; }
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
    if (!e) N.ctl.set(from, (e = { held: {}, pressed: {}, at: 0 }));
    e.at = performance.now();
    for (const k of PRESSED) if (c[k]) e.pressed[k] = true;
    // the trigger pulled: kept till a frame here has seen it (a quick click - down and up before this
    // end's next frame - was lost: a flash on their screen, no shot)
    if (c.fire && !e.held.fire) e.pressed.fire = true;
    if (c.slot) e.pressed.slot = c.slot;
    if (c.cycle) e.pressed.cycle = c.cycle;
    const held = { ...c };
    for (const k of PRESSED) delete held[k];
    delete held.slot;
    delete held.cycle;
    delete held.p;
    e.held = held;
    if (c.p) { e.pos = c.p; e.posAt = performance.now(); } else e.pos = null;
  };
  r.onSnap = (s, from) => { if (N.mode === 'client' && from === r.hostId && !N.out) N.snaps.push(s); };
}
function hostMsg(m, from) {
  if (m.t === 'hello') {
    // into an open slot - or, with the game going or no slot open, in to watch
    const name = String(m.name).slice(0, 12);
    if (N.banned.get(from) > performance.now()) return N.room.send({ t: 'no', why: 'YOU WERE KICKED - TRY AGAIN LATER' }, from);
    if (!N.members.some((x) => x.id === from) && N.pass && m.pass !== N.pass) return N.room.send({ t: 'no', why: m.pass ? 'WRONG PASSWORD' : 'THAT ROOM HAS A PASSWORD' }, from);
    if (!N.members.some((x) => x.id === from)) {
      const free = N.playing ? -1 : N.slots.findIndex((x) => x.k === 'open');
      if (free < 0 && watchers().length >= MAX_WATCH) return N.room.send({ t: 'no', why: 'THAT ROOM IS FULL' }, from);
      if (free >= 0) moveTo(from, free);
      N.members.push({ id: from, name, skill: m.skill ?? null, ready: false });
    }
    N.room.send({ t: 'welcome' }, from);
    if (N.playing && N.match) {
      // the game as it is: the next state goes out whole (to everyone - it's the same for all)
      N.room.send({ t: 'start', ...N.match }, from);
      N.sent = new Map();
    }
    say(`${name} ${N.playing ? 'IS WATCHING' : seatOf(from) >= 0 ? 'JOINED' : 'IS WATCHING (ROOM FULL)'}`, 2);
    shareRoom();
  } else if (m.t === 'me') {
    const x = N.members.find((y) => y.id === from);
    if (!x) return;
    x.skill = m.skill ?? null;
    x.ready = !!m.ready;
    shareRoom();
  } else if (m.t === 'slot') {
    if (moveTo(from, m.i)) shareRoom();
  } else if (m.t === 'out') {
    // back to the room in the middle of the match: their fighter drops out of it
    for (const f of A.game.fighters) if (f.peer === from) { f.lives = 0; f.respawnT = 0; if (f.alive) f.die(null, 'LEFT', 0, 0); }
  } else if (m.t === 'resync') N.sent = new Map();   // (someone starting to watch again: the next state goes out whole)
}
// (watching) on to the next one still in it (dir -1: the one before)
function watchNext(dir) {
  const all = A.game.fighters.filter((f) => !f.isDecoy), live = all.filter((f) => f.alive || f.respawnT > 0), pool = live.length ? live : all;
  if (!pool.length) return;
  const at = pool.indexOf(A.player);
  A.player = pool[(at + dir + pool.length) % pool.length];
}
function clientMsg(m) {
  if (m.t === 'welcome') { N.welcomed = true; A.state = 'net-room'; N.busy = ''; }
  else if (m.t === 'no') { leaveRoom(true); say(m.why); }
  else if (m.t === 'room') {
    N.roomName = m.name;
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
    N.ghost = null;
    N.knock = null;
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
  N.sent = new Map();
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
  for (const m of N.members) if (m.id !== myId()) m.ready = false;
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
