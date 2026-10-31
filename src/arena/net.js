// Playing over the internet, with no server of our own: everyone connects to
// everyone else directly (WebRTC), finding each other through Trystero, which
// uses public Nostr relays to pass the introductions. It costs nothing and
// needs no account.
//
// A "server" here is a region: a few Nostr relays there, the ones the
// introductions go through. Everyone who picks the same one meets in its
// lobby, where whoever's hosting a room keeps telling everyone about it (its
// name, mode, map, players) - that's the room list. Joining a room connects
// you to its host's own room, where the host runs the game and the others
// send their controls in and get the state of the game back. (So a server
// near you finds rooms quicker; once in a game, it's the ping to the host
// that counts.) The relays are public ones, picked for where they are -
// checked by IP and by ping from Thailand.

const TRYSTERO = 'https://cdn.jsdelivr.net/npm/trystero@0.26.0/+esm';
const APP_ID = 'projectz-lab-brawl-v1';
const AD_EVERY = 1.5, AD_LIFE = 6;   // a host tells the lobby about its room this often (s); a room not heard of for this long is gone

export const SERVERS = [
  { key: 'th', name: 'THAILAND', relays: [['relay.notoshi.win', 'CHON BURI, THAILAND'], ['asia.azzamo.net', 'SINGAPORE']] },
  { key: 'sg', name: 'SINGAPORE', relays: [['asia.azzamo.net', 'SINGAPORE'], ['relay.nostr.moe', 'SINGAPORE']] },
  { key: 'jp', name: 'JAPAN', relays: [['yabu.me', 'TOKYO, JAPAN'], ['relay.nostr.wirednet.jp', 'OSAKA, JAPAN']] },
  { key: 'eu', name: 'EUROPE', relays: [['nos.lol', 'FALKENSTEIN, GERMANY'], ['relay.degmods.com', 'FALKENSTEIN, GERMANY'], ['nostr.stakey.net', 'DRONTEN, NETHERLANDS']] },
];
const config = (server) => ({ appId: APP_ID, relayConfig: { urls: server.relays.map(([host]) => `wss://${host}`), warnOnRelayFailure: false } });

// How far away a server is: a question to each of its relays and the time the
// answer takes (the best of three), the nearest relay's. null: none answered.
function probe(host) {
  return new Promise((done) => {
    let ws = null, n = 0, best = Infinity, t = 0;
    const end = () => { clearTimeout(timer); try { ws?.close(); } catch {} done(best < Infinity ? Math.round(best) : null); };
    const timer = setTimeout(end, 5000);
    const ask = () => { t = performance.now(); ws.send(JSON.stringify(['REQ', `pz${n}`, { kinds: [29999], limit: 1, since: Math.floor(Date.now() / 1000) }])); };
    try { ws = new WebSocket(`wss://${host}`); } catch { return end(); }
    ws.onopen = ask;
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m[0] !== 'EOSE' && m[0] !== 'CLOSED') return;
      best = Math.min(best, performance.now() - t);
      try { ws.send(JSON.stringify(['CLOSE', `pz${n}`])); } catch {}
      if (++n < 3) ask(); else end();
    };
    ws.onerror = end;
  });
}
export async function pingServer(server) {
  const times = await Promise.all(server.relays.map(([host]) => probe(host)));
  let out = null;
  times.forEach((ms, i) => { if (ms !== null && (!out || ms < out.ms)) out = { ms, where: server.relays[i][1] }; });
  return out;
}

let lib = null;
async function trystero() {
  lib ??= await import(TRYSTERO);
  return lib;
}
export const myId = () => lib?.selfId ?? null;

// The lobby of a server: who's in it, and the rooms being hosted in it.
export class Lobby {
  static async join(server, name) {
    const T = await trystero();
    return new Lobby(T, server, name);
  }
  constructor(T, server, name) {
    this.server = server;
    this.name = name;
    this.rooms = new Map();   // host's id -> { ...ad, seen }
    this.peers = new Set();
    this.ad = null;           // our own room, while we host one
    this.adT = 0;
    this.room = T.joinRoom(config(server), `lobby-${server.key}`);
    this.adAction = this.room.makeAction('ad');
    this.adAction.onMessage = (ad, { peerId }) => {
      if (ad && !ad.gone) this.rooms.set(peerId, { ...ad, host: peerId, seen: performance.now() });
      else this.rooms.delete(peerId);
    };
    this.room.onPeerJoin = (id) => {
      this.peers.add(id);
      if (this.ad) this.adAction.send(this.ad, { target: id });
    };
    this.room.onPeerLeave = (id) => {
      this.peers.delete(id);
      this.rooms.delete(id);
    };
  }
  // the rooms heard of lately, oldest first (so their numbers stay put)
  get list() {
    const now = performance.now();
    for (const [id, r] of this.rooms) if (now - r.seen > AD_LIFE * 1000) this.rooms.delete(id);
    return [...this.rooms.values()].sort((a, b) => a.made - b.made);
  }
  get online() {
    return this.peers.size + 1;
  }
  // hosting: what to tell everyone about our room (null: we're not hosting any more)
  advertise(ad) {
    const was = this.ad;
    this.ad = ad;
    if (!ad && was) this.adAction.send({ gone: true });
    else if (ad && (!was || JSON.stringify(ad) !== JSON.stringify(was))) this.adAction.send(ad);
  }
  update(dt) {
    if (this.ad && (this.adT -= dt) <= 0) {
      this.adT = AD_EVERY;
      this.adAction.send(this.ad);
    }
  }
  leave() {
    if (this.ad) this.adAction.send({ gone: true });
    this.room.leave();
  }
}

// A game room: the host's own, which everyone in the game joins. Messages
// (`msg`: hello, the room as it stands, ready, start ...), the state of the
// game (`snap`, host to everyone) and controls (`ctl`, everyone to the host).
export class GameRoom {
  static async open(server, hostId) {
    const T = await trystero();
    return new GameRoom(T, server, hostId);
  }
  constructor(T, server, hostId) {
    this.hostId = hostId;
    this.isHost = hostId === T.selfId;
    this.room = T.joinRoom(config(server), `game-${hostId}`);
    this.peers = new Set();
    this.ping = 0;
    this.onMsg = () => {};
    this.onSnap = () => {};
    this.onCtl = () => {};
    this.onJoin = () => {};
    this.onLeave = () => {};
    for (const [key, name] of [['msg', 'onMsg'], ['snap', 'onSnap'], ['ctl', 'onCtl']]) {
      const a = this.room.makeAction(key);
      this[key] = a;
      a.onMessage = (data, { peerId }) => this[name](data, peerId);
    }
    this.room.onPeerJoin = (id) => { this.peers.add(id); this.onJoin(id); };
    this.room.onPeerLeave = (id) => { this.peers.delete(id); this.onLeave(id); };
    this.pingT = 0;
  }
  send(data, target) {
    this.msg.send(data, target ? { target } : undefined);
  }
  update(dt) {
    // how long a message takes to the host and back, now and then
    if (this.isHost || !this.peers.has(this.hostId) || (this.pingT -= dt) > 0) return;
    this.pingT = 2;
    this.room.ping(this.hostId).then((ms) => { this.ping = Math.round(ms); }).catch(() => {});
  }
  leave() {
    this.room.leave();
  }
}
