// Playing over the internet, through Photon (Photon Realtime, its cloud - the
// free plan: 20 players online at once). A "server" is one of Photon's regions:
// everyone who picks the same one meets in its lobby, where every room open
// there is listed - its name, mode, map, players, as its host keeps them (the
// room's own properties, shown in the lobby). Joining a room puts you in it
// with its host; everything between the players goes through Photon's server
// for that region, so anyone can reach anyone, whatever their network. The
// host's browser still runs the game: the others send their controls in and get
// the state of the game back (see online.js). The SDK is ours, a copy, in
// src/vendor (it loads when you first go online).

const SDK = new URL('../vendor/photon-realtime.js', import.meta.url).href;
const APP_ID = 'a27f8fdc-7d82-448d-bce8-3a05096542b7', APP_VERSION = 'arena-2';   // (players on different versions don't meet)
const PROPS = ['n', 'm', 'mp', 's', 'mx', 'w', 'p', 'l', 'md', 'h'];   // a room's properties the lobby sees (name, mode, map, seated, max, watchers, playing, locked, made, host)
const EV = { msg: 1, snap: 2, ctl: 3 };

// For testing a bad connection: `?lag=80&jitter=30` on the address holds everything this page sends
// back by that many ms (set it on both ends; arena.online.netStats shows what it does to the game).
export const netSim = { lag: 0, jitter: 0 };
try { const q = new URLSearchParams(location.search); netSim.lag = +q.get('lag') || 0; netSim.jitter = +q.get('jitter') || 0; } catch {}

export const SERVERS = [
  { key: 'asia', name: 'SINGAPORE', where: 'SINGAPORE' },
  { key: 'hk', name: 'HONG KONG', where: 'HONG KONG' },
  { key: 'jp', name: 'JAPAN', where: 'TOKYO' },
  { key: 'kr', name: 'KOREA', where: 'SEOUL' },
  { key: 'in', name: 'INDIA', where: 'CHENNAI' },
  { key: 'eu', name: 'EUROPE', where: 'AMSTERDAM' },
];

// the SDK, loaded once (a plain script: it sets window.Photon)
let sdk = null;
function photon() {
  return (sdk ??= new Promise((done, fail) => {
    if (window.Photon) return done(window.Photon);
    const s = document.createElement('script');
    s.src = SDK;
    s.onload = () => (window.Photon ? done(window.Photon) : fail(new Error('Photon did not load')));
    s.onerror = () => { sdk = null; fail(new Error('Photon did not load')); };
    document.head.appendChild(s);
  }));
}

// Who we are to everyone else: kept for this tab, through a reload or a dropped connection, so a
// player who comes back gets their seat back (and someone kicked is still kicked).
const UID = (() => {
  const fresh = `p${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
  try {
    const had = sessionStorage.getItem('arena.uid');
    if (had) return had;
    sessionStorage.setItem('arena.uid', fresh);
  } catch {}
  return fresh;
})();
export const myId = () => UID;

// ---------- the connection: one, for the lobby and for a room ----------
let conn = null;
class Conn {
  constructor(P, server) {
    this.P = P;
    const LBC = P.LoadBalancing.LoadBalancingClient;
    this.S = LBC.State;
    this.lbc = new LBC(P.ConnectionProtocol.Wss, APP_ID, APP_VERSION);
    this.lbc.setUserId(UID);
    this.lbc.setLogLevel(P.LogLevel.ERROR);
    this.server = server;
    this.room = null;        // the GameRoom we're in
    this.stats = null;       // how many are on (the region's, from Photon now and then)
    this.waits = [];         // [state wanted, resolve, reject]
    this.held = [];          // (netSim) what's being held back: [when, code, text, target]
    this.heldTill = 0;
    this.stat = { outN: 0, outB: 0, inN: 0, inB: 0 };   // messages and bytes, both ways (see online.js)
    this.lbc.onStateChange = (st) => {
      for (const w of [...this.waits]) if (w[0].includes(st)) { this.waits.splice(this.waits.indexOf(w), 1); w[1](); }
      if (st === this.S.Error || st === this.S.Disconnected) {
        for (const w of this.waits.splice(0)) w[2](new Error('disconnected'));
        if (this.room) this.room._lost();
      }
    };
    this.lbc.onError = (code, msg) => console.warn('Photon:', code, msg);
    this.lbc.onAppStats = (err, msg, stats) => { if (!err) this.stats = stats; };
    // a create / join refused: whoever's waiting for it hears why
    this.lbc.onOperationResponse = (err, msg, code) => {
      if (err && (code === 226 || code === 227)) for (const w of this.waits.splice(0)) w[2](Object.assign(new Error(msg || 'refused'), { code: err }));
    };
    this.lbc.onEvent = (code, content, actorNr) => {
      if (!this.room) return;
      const from = this.uidOf(actorNr);
      let data = content;
      this.stat.inN++;
      if (typeof content === 'string') this.stat.inB += content.length;
      if (typeof content === 'string') { try { data = JSON.parse(content); } catch { return; } }
      this.room._event(code, data, from);
    };
    this.lbc.onActorJoin = (actor) => { if (this.room && actor.userId !== UID) this.room._join(actor.userId); };
    this.lbc.onActorLeave = (actor) => {
      if (!this.room || actor.userId === UID) return;
      // (a moment later, when it's clear: if it's us being cut off, everyone's "leaving" - that's not them going, see _lost)
      setTimeout(() => {
        if (!this.room || this.lbc.state() !== this.S.Joined) return;
        // (back already, on a new connection, before the old one timed out: they haven't gone anywhere)
        if (Object.values(this.lbc.myRoomActors()).some((a) => a.userId === actor.userId && a.actorNr !== actor.actorNr)) return;
        this.room._leave(actor.userId);
      }, 0);
    };
  }
  until(states, ms = 15000) {
    if (states.includes(this.lbc.state())) return Promise.resolve();
    return new Promise((done, fail) => {
      const w = [states, done, fail];
      this.waits.push(w);
      setTimeout(() => { const i = this.waits.indexOf(w); if (i >= 0) { this.waits.splice(i, 1); fail(new Error('timed out')); } }, ms);
    });
  }
  inLobby() {
    return this.until([this.S.JoinedLobby]);
  }
  get alive() {
    const st = this.lbc.state();
    return st !== this.S.Error && st !== this.S.Disconnected;
  }
  uidOf(actorNr) {
    return this.lbc.myRoomActors()[actorNr]?.userId ?? null;
  }
  actorOf(uid) {
    return Object.values(this.lbc.myRoomActors()).find((a) => a.userId === uid)?.actorNr ?? null;
  }
  // target: one player, some players (an array), or nobody named: everyone
  raise(code, data, target) {
    const text = JSON.stringify(data);
    if (!netSim.lag && !netSim.jitter) return this.put(code, text, target);
    // (in order, as the real thing's always in order: a message never overtakes the one before it)
    this.heldTill = Math.max(this.heldTill, performance.now() + netSim.lag + Math.random() * netSim.jitter);
    this.held.push([this.heldTill, code, text, target]);
  }
  put(code, text, target) {
    if (!this.lbc.isJoinedToRoom()) return;
    const opt = {};
    if (target) {
      const nrs = (Array.isArray(target) ? target : [target]).map((t) => this.actorOf(t)).filter((n) => n !== null);
      if (!nrs.length) return;
      opt.targetActors = nrs;
    }
    this.stat.outN += opt.targetActors?.length ?? 1;
    this.stat.outB += text.length;
    try { this.lbc.raiseEvent(code, text, opt); } catch { /* the connection's on its way out: _lost hears of it */ }
  }
  // (netSim) what's been held back long enough, out
  pump() {
    const now = performance.now();
    while (this.held.length && this.held[0][0] <= now) { const [, code, text, target] = this.held.shift(); this.put(code, text, target); }
  }
}
async function connect(server) {
  const P = await photon();
  if (conn && conn.server === server && conn.alive) return conn;   // (the one we have - on its way back to the lobby from a room, say)
  conn?.lbc.disconnect();
  conn = new Conn(P, server);
  conn.lbc.connectToRegionMaster(server.key);
  await conn.inLobby();
  return conn;
}

// How far away a region is: how long a connection to it takes to open (about three
// and a half trips there and back, measured against Photon's own) - the region's
// addresses from Photon's name server, asked once.
let regions = null;
async function regionAddresses() {
  if (regions) return regions;
  const P = await photon(), LBC = P.LoadBalancing.LoadBalancingClient;
  regions = new Promise((done) => {
    const c = new LBC(P.ConnectionProtocol.Wss, APP_ID, APP_VERSION);
    c.setLogLevel(P.LogLevel.ERROR);
    const end = (r) => { done(r); setTimeout(() => c.disconnect(), 50); };
    c.onStateChange = (st) => { if (st === LBC.State.ConnectedToNameServer) c.getRegions(); };
    c.onGetRegionsResult = (err, msg, list) => end(err ? {} : list);
    setTimeout(() => end({}), 8000);
    c.connectToNameServer();
  });
  regions = await regions;
  if (!Object.keys(regions).length) { const r = regions; regions = null; return r; }   // (none: ask again next time)
  return regions;
}
function opens(address) {
  return new Promise((done) => {
    const t = performance.now();
    let ws = null;
    const end = (v) => { clearTimeout(timer); try { ws?.close(); } catch {} done(v); };
    const timer = setTimeout(() => end(null), 5000);
    try { ws = new WebSocket(address, 'GpBinaryV18'); } catch { return end(null); }
    ws.onopen = () => end(performance.now() - t);
    ws.onerror = () => end(null);
  });
}
export async function pingServer(server) {
  const address = (await regionAddresses())[server.key];
  if (!address) return null;
  const a = await opens(address), b = a === null ? null : await opens(address);
  if (a === null) return null;
  return { ms: Math.max(1, Math.round(Math.min(a, b ?? a) / 3.5)), where: server.where };
}

// ---------- the lobby: the rooms open in this region ----------
export class Lobby {
  static async join(server) {
    return new Lobby(await connect(server), server);
  }
  constructor(c, server) {
    this.c = c;
    this.server = server;
    this.ad = null;
    this.sent = {};   // (the host) what the room's lobby properties were last set to, and in which room
    this.sentIn = null;
  }
  // still connected (lost: back to the servers - see online.js)
  get alive() {
    return this.c.alive && conn === this.c;
  }
  // the rooms listed (oldest first, so their numbers stay put)
  get list() {
    return this.c.lbc.availableRooms()
      .filter((r) => !r.removed && r.playerCount > 0 && r.getCustomProperty('h'))
      .map((r) => {
        const p = (k) => r.getCustomProperty(k);
        return { name: p('n') ?? r.name, mode: p('m'), map: p('mp'), n: p('s') ?? r.playerCount, max: p('mx') ?? 8, w: p('w') ?? 0, playing: !!p('p'), lock: !!p('l'), made: p('md') ?? 0, host: p('h'), rid: r.name };
      })
      .sort((a, b) => a.made - b.made);
  }
  get online() {
    return this.c.stats?.peerCount ?? 1;
  }
  // (the host) how the room stands, for the lobby: only what's changed goes up
  advertise(ad) {
    this.ad = ad;
    const room = this.c.lbc.isJoinedToRoom() ? this.c.lbc.myRoom() : null;
    if (!ad || !room) return;
    if (this.sentIn !== room.name) { this.sent = {}; this.sentIn = room.name; }
    const want = { n: ad.name, m: ad.mode, mp: ad.map, s: ad.n, mx: ad.max, w: ad.w, p: ad.playing ? 1 : 0, l: ad.lock ? 1 : 0, md: ad.made, h: UID };
    const out = {};
    for (const k of PROPS) if (this.sent[k] !== want[k]) { out[k] = want[k]; this.sent[k] = want[k]; }
    if (Object.keys(out).length) { try { room.setCustomProperties(out); } catch { /* (the connection's going) */ } }
  }
  update() {}
  leave() {
    this.c.lbc.disconnect();
    if (conn === this.c) conn = null;
  }
}

// ---------- a game room ----------
// The host makes it (named rid, made up by whoever made it first - it keeps the
// name if someone else is made host); everyone else joins it by that name.
export class GameRoom {
  static async open(server, hostId, rid = `game-${hostId}`) {
    const c = await connect(server);
    await c.inLobby();
    const done = c.until([c.S.Joined]);
    if (hostId === UID) {
      c.lbc.createRoom(rid, { maxPlayers: 16, publishUserId: true, emptyRoomLiveTime: 0, suspendedPlayerLiveTime: 0, propsListedInLobby: PROPS, customGameProperties: { h: UID, md: Date.now() } });
    } else c.lbc.joinRoom(rid);
    await done;
    return new GameRoom(c, hostId, rid);
  }
  constructor(c, hostId, rid) {
    this.c = c;
    this.hostId = hostId;
    this.me = UID;
    this.rid = rid;
    this.peers = new Set();
    this.ping = 0;
    this.onMsg = () => {};
    this.onSnap = () => {};
    this.onCtl = () => {};
    this.onJoin = () => {};
    this.onLeave = () => {};
    this.onLost = null;   // the connection gone (see online.js: it tries to get back in)
    c.room = this;
    const send = (code) => ({ send: (data, opt) => c.raise(code, data, opt?.target) });
    this.snap = send(EV.snap);
    this.ctl = send(EV.ctl);
    // everyone already in it: met, as if they'd just come (once the handlers are on)
    setTimeout(() => {
      if (c.room !== this) return;
      for (const a of Object.values(c.lbc.myRoomActors())) if (a.userId && a.userId !== UID) this._join(a.userId);
    }, 0);
  }
  get isHost() {
    return this.hostId === this.me;
  }
  send(data, target) {
    this.c.raise(EV.msg, data, target);
  }
  update() {
    this.c.pump();
    this.ping = Math.round(this.c.lbc.getRtt?.() ?? 0);   // (to Photon's server and back)
  }
  leave() {
    if (this.c.room === this) this.c.room = null;
    try { if (this.c.lbc.isJoinedToRoom()) this.c.lbc.leaveRoom(); } catch {}   // (back to the lobby)
  }
  _event(code, data, from) {
    if (code === EV.msg) this.onMsg(data, from);
    else if (code === EV.snap) this.onSnap(data, from);
    else if (code === EV.ctl) this.onCtl(data, from);
  }
  _join(uid) {
    if (!uid || this.peers.has(uid)) return;
    this.peers.add(uid);
    this.onJoin(uid);
  }
  _leave(uid) {
    if (!this.peers.delete(uid)) return;
    this.onLeave(uid);
  }
  // the connection lost: whoever's looking after the room hears; if nobody is, everyone's gone
  _lost() {
    if (this.onLost) return this.onLost();
    for (const uid of [...this.peers]) this._leave(uid);
  }
}
