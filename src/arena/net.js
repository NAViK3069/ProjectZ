// Playing over the internet, with no server of our own: everyone connects to
// everyone else directly (WebRTC), finding each other through Trystero, which
// uses public Nostr relays to pass the introductions. It costs nothing and
// needs no account.
//
// A "server" here is a channel: everyone who picks the same one meets in its
// lobby, where whoever's hosting a room keeps telling everyone about it (its
// name, mode, map, players) - that's the room list. Joining a room connects
// you to its host's own room, where the host runs the game and the others
// send their controls in and get the state of the game back.

const TRYSTERO = 'https://cdn.jsdelivr.net/npm/trystero@0.26.0/+esm';
const APP = { appId: 'projectz-lab-brawl-v1' };
const AD_EVERY = 1.5, AD_LIFE = 6;   // a host tells the lobby about its room this often (s); a room not heard of for this long is gone

export const SERVERS = [
  { key: 'asia1', name: 'ASIA 1', desc: 'THAILAND AND ROUND ABOUT' },
  { key: 'asia2', name: 'ASIA 2', desc: 'THE OVERFLOW' },
  { key: 'world', name: 'WORLD', desc: 'ANYONE, ANYWHERE' },
  { key: 'test', name: 'TEST', desc: 'TRYING THINGS OUT' },
];

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
    this.room = T.joinRoom(APP, `lobby-${server.key}`);
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
  static async open(hostId) {
    const T = await trystero();
    return new GameRoom(T, hostId);
  }
  constructor(T, hostId) {
    this.hostId = hostId;
    this.isHost = hostId === T.selfId;
    this.room = T.joinRoom(APP, `game-${hostId}`);
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
