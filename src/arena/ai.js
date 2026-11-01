// The bots. The level is turned into a graph of places a fighter can stand
// (and ladder rungs it can hang on), joined by the moves that get between
// them: walking, stepping off an edge, dropping through a catwalk, climbing,
// and jumps (with the double jump for the high ones). A* over that gives a
// route; the bot then presses the buttons each step of it needs.
//
// On top of that: pick someone to fight, get a gun if it hasn't one, shoot
// when it can see its target (with a reaction delay and an aim that settles),
// keep its distance, dodge-roll now and then, lob a grenade, use its skill
// (Q) when it's worth it, and never walk into the acid. With nobody to fight
// (they're hidden, say) it doesn't stand about: it goes looking where they
// were last, picks up what's lying around, roams and hops.

import { T, SOLID, PLAT, LADDER, ACID, LOW } from './level.js';
import { GRAVITY, WALK, AIR_ACCEL, JUMP, JUMP2, PAD_JUMP } from './fighter.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick2 = (l) => l[(Math.random() * l.length) | 0];

export class Nav {
  constructor(level) {
    // (a low ceiling counts as a wall: no room to stand under it)
    this.L = Object.create(level);
    this.L.get = (x, y) => { const v = level.get(x, y); return v === LOW ? SOLID : v; };
    this.pads = new Set(level.pads.map((p) => this.id(p.cx, p.cy)));
    this.nodes = new Map();   // id -> { id, cx, cy, ladder, edges: [{ to, kind, cost, dy }] }
    for (let cy = 0; cy < level.h; cy++) for (let cx = 0; cx < level.w; cx++) {
      if (this.stand(cx, cy) || this.ladder(cx, cy)) this.nodes.set(this.id(cx, cy), { id: this.id(cx, cy), cx, cy, ladder: this.ladder(cx, cy) && !this.stand(cx, cy), edges: [] });
    }
    for (const n of this.nodes.values()) this.link(n);
    // (the places to go: those the fighters can get to from where they start - not the top of a fence, say)
    const start = level.spawns[0] && this.nodeBelow(level.spawns[0].x, level.spawns[0].y - 1), reach = new Set(start ? [start] : []);
    for (const n of reach) for (const e of n.edges) reach.add(e.to);
    this.standable = [...this.nodes.values()].filter((n) => !n.ladder && (!start || reach.has(n)));
  }

  id(cx, cy) {
    return cy * this.L.w + cx;
  }
  free(cx, cy) {
    const v = this.L.get(cx, cy);
    return v !== SOLID && v !== ACID;
  }
  // Feet at the bottom of cell (cx, cy), on something, with head room.
  stand(cx, cy) {
    const L = this.L, v = L.get(cx, cy), below = L.get(cx, cy + 1);
    if (!this.free(cx, cy) || L.get(cx, cy - 1) === SOLID || cy < 1) return false;
    return below === SOLID || below === PLAT || (below === LADDER && v !== LADDER);
  }
  ladder(cx, cy) {
    return this.L.get(cx, cy) === LADDER;
  }
  // Falling down column cx from row cy: the row it lands on (null: acid, or nothing).
  land(cx, cy) {
    for (let y = cy; y < this.L.h; y++) {
      const v = this.L.get(cx, y);
      if (v === SOLID || v === ACID) return null;
      if (this.stand(cx, y)) return y;
    }
    return null;
  }

  link(n) {
    const { cx, cy } = n, L = this.L, add = (tx, ty, kind, cost) => {
      const to = this.nodes.get(this.id(tx, ty));
      if (to && to !== n && !n.edges.some((e) => e.to === to)) n.edges.push({ to, kind, cost, dy: ty - cy, dx: tx - cx });
    };
    // a jump pad: standing on it, it throws you - that's the only way off it
    if (this.pads.has(n.id)) {
      for (let dy = -10; dy <= 2; dy++) for (let dx = -9; dx <= 9; dx++) {
        if (!dx && dy >= 0) continue;
        if (this.stand(cx + dx, cy + dy) && !this.pads.has(this.id(cx + dx, cy + dy)) && this.arc(cx, cy, cx + dx, cy + dy, true)) add(cx + dx, cy + dy, 'pad', 1 + Math.abs(dx) * 0.3 + Math.max(0, -dy) * 0.3);
      }
      return;
    }
    if (n.ladder || this.ladder(cx, cy)) {
      if (this.nodes.has(this.id(cx, cy - 1))) add(cx, cy - 1, 'climb', 1.2);
      if (this.nodes.has(this.id(cx, cy + 1))) add(cx, cy + 1, 'climb', 1.2);
      for (const d of [-1, 1]) if (this.stand(cx + d, cy)) add(cx + d, cy, 'walk', 1.5);
      if (n.ladder) return;
    }
    if (this.ladder(cx, cy + 1)) add(cx, cy + 1, 'climb', 1.2);   // down the ladder from its top
    for (const d of [-1, 1]) {
      const nx = cx + d;
      if (this.stand(nx, cy)) add(nx, cy, 'walk', 1);
      else if (this.ladder(nx, cy)) add(nx, cy, 'walk', 1.5);   // onto a ladder that passes by
      else if (this.free(nx, cy) && L.get(nx, cy - 1) !== SOLID) {
        const y = this.land(nx, cy);
        if (y !== null && y > cy) add(nx, y, 'fall', 1 + (y - cy) * 0.4);
      }
    }
    // drop through the catwalk underfoot
    if (L.get(cx, cy + 1) === PLAT) {
      const y = this.land(cx, cy + 2);
      if (y !== null) add(cx, y, 'drop', 1.2 + (y - cy) * 0.3);
    }
    // jumps: wherever the real thing gets to
    for (let dy = -6; dy <= 4; dy++) for (let dx = -7; dx <= 7; dx++) {
      if (!dx && dy >= 0) continue;
      if (dy >= 0 && Math.abs(dx) < 2) continue;
      const tx = cx + dx, ty = cy + dy;
      if (!this.stand(tx, ty)) continue;
      // a level (or downward) jump only where there's something to jump: a gap or an
      // obstacle on the way (a jump pad's one) - along an unbroken floor it just walks
      if (dy >= 0) {
        let broken = false;
        for (let x = cx + Math.sign(dx); x !== tx && !broken; x += Math.sign(dx)) if (!this.stand(x, cy) || this.pads.has(this.id(x, cy))) broken = true;
        if (!broken) continue;
      }
      if (!this.arc(cx, cy, tx, ty)) continue;
      // never cheaper than walking the same distance; the high ones (a second jump) dearer still
      add(tx, ty, 'jump', 2 + Math.abs(dx) * 1.1 + Math.max(0, -dy) * 0.9 + (dy < -3 ? 2 : 0));
    }
  }

  // Does a jump from (cx, cy) really land on (tx, ty)? Flown as a fighter flies it, pressing what a bot presses (see follow):
  // up from the front of the spot, over once it's high enough, the second jump when it needs it. What's in the way is in the way.
  arc(cx, cy, tx, ty, pad = false) {
    const L = this.L, gx = (tx + 0.5) * T, gy = (ty + 1) * T, dir = Math.sign(tx - cx);
    const high = ty - cy <= -3, long = Math.abs(tx - cx) >= 3, level = ty >= cy;
    const blocked = (x, top, bot) => {
      for (let y = Math.floor(top / T); y <= Math.floor((bot - 0.01) / T); y++) for (let c = Math.floor((x - 5) / T); c <= Math.floor((x + 4.99) / T); c++) if (L.get(c, y) === SOLID) return true;
      return false;
    };
    let x = (cx + 0.5) * T + (pad ? 0 : dir * 4), y = (cy + 1) * T, vx = pad ? 0 : dir * WALK * (long ? 1.4 : 1), vy = pad ? -PAD_JUMP : -JUMP, spare = !pad;
    const dt = 1 / 30;
    for (let i = 0; i < 90; i++) {
      if (spare && vy > -60 && ((high && y > gy) || (long && Math.abs(gx - x) > 24))) { vy = -JUMP2; spare = false; }
      const above = y < gy + 2, d = gx - x;
      const steer = Math.abs(d) <= 6 ? 0 : above || level ? Math.sign(d) : Math.abs(d) > 20 ? Math.sign(d) * 0.6 : 0;
      const want = steer * WALK, a = AIR_ACCEL * dt;
      vx += Math.max(-a, Math.min(a, want - vx));
      vy = Math.min(430, vy + GRAVITY * dt);
      const nx = x + vx * dt;
      if (blocked(nx, y - 28, y - 0.5)) vx = 0; else x = nx;
      const ny = y + vy * dt;
      if (vy < 0) {
        if (blocked(x, ny - 28, ny - 20)) vy = 0; else y = ny;
        continue;
      }
      // coming down: onto the first thing in the way
      for (let row = Math.floor(y / T); row <= Math.floor(ny / T); row++) {
        if (row * T < y - 0.5) continue;
        let floor = false;
        for (let c = Math.floor((x - 5) / T); c <= Math.floor((x + 4.99) / T); c++) { const v = L.get(c, row); if (v === SOLID || v === PLAT || v === ACID) floor = true; }
        if (floor) return row === ty + 1 && Math.abs(x - gx) < T * 0.75;
      }
      y = ny;
      if (y > gy + 3 * T) return false;
    }
    return false;
  }

  // The node a fighter is at (or next to), or null in mid-air.
  nodeAt(x, y, onLadder = false) {
    const cx = Math.floor(x / T), cy = Math.floor((y - (onLadder ? 6 : 1)) / T);
    for (const [ox, oy] of [[0, 0], [0, -1], [0, 1], [x % T < T / 2 ? -1 : 1, 0], [x % T < T / 2 ? 1 : -1, 0]]) {
      const n = this.nodes.get(this.id(cx + ox, cy + oy));
      if (n) return n;
    }
    return null;
  }
  // The nearest standing place under a point (for something lying on the floor).
  nodeBelow(x, y) {
    const cx = Math.floor(x / T);
    for (let cy = Math.floor((y - 1) / T); cy < this.L.h; cy++) {
      const n = this.nodes.get(this.id(cx, cy));
      if (n && !n.ladder) return n;
      if (this.L.get(cx, cy) === SOLID) break;
    }
    return this.nodeAt(x, y);
  }

  // What the props cost to get past, place by place: the routes are built from the level alone, but a
  // crate (or a stack of them, a shelf) on a floor has to be jumped or broken - the taller, the dearer.
  // Worked out again once a second at most (they get knocked about, broken).
  propCost(props, now) {
    if (this.costAt !== undefined && now - this.costAt < 1 && now >= this.costAt) return this.cost;
    this.costAt = now;
    this.cost = new Map();
    for (const p of props) {
      if (p.dead || !p.block) continue;
      const b = p.box;
      for (let cx = Math.floor(b.l / T); cx <= Math.floor((b.r - 1) / T); cx++) {
        const n = this.nodeBelow((cx + 0.5) * T, b.b);   // (the floor it stands on - under a stack, the same one for all of it)
        if (n && !n.ladder) this.cost.set(n, (this.cost.get(n) ?? 0) + ((b.b - b.t) / T) * 2.5);
      }
    }
    return this.cost;
  }

  // bias: extra cost for stepping onto some nodes (a bot's own taste in routes)
  // avoid: edges to steer clear of (jumps this bot has failed lately)
  // extra: more cost for some nodes (props standing there)
  path(from, to, bias = null, avoid = null, extra = null) {
    if (!from || !to) return null;
    if (from === to) return [];
    const g = new Map([[from, 0]]), came = new Map(), closed = new Set(), h = (n) => Math.abs(n.cx - to.cx) * 0.9 + Math.abs(n.cy - to.cy);
    const heap = [[h(from), from]];
    const push = (e) => { let i = heap.push(e) - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top[1];
    };
    while (heap.length) {
      const cur = pop();
      if (closed.has(cur)) continue;
      if (cur === to) {
        const out = [];
        let c = cur;
        while (came.has(c)) {
          const [p, e] = came.get(c);
          out.unshift({ node: c, edge: e, from: p });
          c = p;
        }
        return out;
      }
      closed.add(cur);
      for (const e of cur.edges) {
        if (closed.has(e.to)) continue;
        const ng = g.get(cur) + e.cost + (bias?.get(e.to) ?? 0) + (extra?.get(e.to) ?? 0) + (avoid?.has(e) ? 60 : 0);
        if (ng >= (g.get(e.to) ?? Infinity)) continue;
        g.set(e.to, ng);
        came.set(e.to, [cur, e]);
        push([ng + h(e.to), e.to]);
      }
    }
    return null;
  }
  // The nearest place to `to` that can be got to from `from` (when `to` itself can't).
  nearest(from, to) {
    const seen = new Set([from]), list = [from];
    let best = from, bd = Infinity;
    for (let i = 0; i < list.length; i++) {
      const n = list[i], d = Math.abs(n.cx - to.cx) + Math.abs(n.cy - to.cy) * 1.5;
      if (d < bd && !n.ladder) { bd = d; best = n; }
      for (const e of n.edges) if (!seen.has(e.to)) { seen.add(e.to); list.push(e.to); }
    }
    return best;
  }
}

const TIER = { pistol: 1, smg: 2, shotgun: 2.5, rifle: 3, lmg: 3.5, sniper: 3.2 };
export const gunTier = (def) => (def ? TIER[def.cls] ?? 1 : 0) + (def && def.damage > 60 && def.cls === 'pistol' ? 0.8 : 0);

export class Bot {
  constructor(game, f, skill = 1) {
    this.game = game;
    this.f = f;
    this.skill = skill;
    // a personality: how keen it is to close in, where it likes to fight from
    this.aggro = rand(0.3, 0.9);
    this.reset();
  }

  reset() {
    Object.assign(this, {
      path: [], repath: 0, goal: null, goalKey: null, target: null, targetT: 0, seen: 0, aimErr: 0, aim: 0,
      stuckT: 0, lastX: 0, nadeT: rand(5, 10), rollT: rand(2, 5), punchT: 0, fireToggle: false, jumpedFrom: null, climb: null,
      failed: new Map(), jumping: null,   // jumps it tried and didn't make (edge -> until when), the one in the air now
      known: new Map(),        // fighter -> { x, y, t }: where it last saw / heard each one
      mode: 'search', wander: null, pauseT: 0, lookT: 0, burstT: 0, spot: null, spotT: 0,
      bias: new Map(), biasT: 0, react: rand(0.35, 0.6) / this.skill,
      skillT: rand(1, 3), lost: null, hopT: rand(1, 3),   // skillT: a beat before it thinks of its skill again; lost: where a foe vanished
      holdT: 0, dj: false,         // holding a jump down for a full one (and a second in the air, if it has to go higher)
      tries: null, smash: null,    // tries: the prop in its way and how often it's jumped at it; smash: one it's breaking up
      skip: new Map(), lootT: 0,   // pickups it couldn't get to (-> till when) and how long it's been after this one
      flips: 0, flipT: 1, flipX: 0, lastDir: 0, commit: 0, commitDir: 0,   // turning back and forth on the spot, and a way out of it
      flee: false,                 // cloaked to get away (not to stab)
      dropT: 0,                    // (till when) it's just pressed to drop through a catwalk
      turnT: 0,                    // a moment after turning round before it'll turn back
      nearGoal: null, nearD: Infinity, noWay: 0, gaveUp: 0,   // how close it's got to where it's going, how long since it got closer
    });
  }

  // Gunfire nearby gives away where the shooter is.
  hear(x, y, from) {
    if (from === this.f || !from.alive || !this.game.foes(this.f, from)) return;
    if (Math.hypot(x - this.f.x, y - this.f.y) < 380) this.known.set(from, { x: from.x, y: from.y, t: this.game.time });
  }

  // Every so often, some places on the map cost a bit more to cross - so its
  // routes vary (comes round the other way, takes the ladder instead of the jump).
  rebias() {
    this.bias.clear();
    for (const n of this.game.nav.standable) if (Math.random() < 0.25) this.bias.set(n, rand(1, 4));
    this.biasT = rand(5, 9);
  }

  // How the bot "presses the buttons" this frame.
  control(dt) {
    const f = this.f, G = this.game, nav = G.nav;
    const c = { move: 0, up: false, down: false, jump: false, jumpHeld: false, sprint: false, fire: false, aim: null, target: null, reload: false, roll: false, melee: false, grenade: false, pickup: false };
    if (!f.alive) return c;
    for (const k of ['repath', 'nadeT', 'rollT', 'punchT', 'targetT', 'pauseT', 'lookT', 'burstT', 'spotT', 'biasT', 'skillT', 'hopT']) this[k] -= dt;
    if (this.biasT <= 0) this.rebias();

    // a cloaked fighter isn't seen at all - unless it's right up against the bot
    const unseen = (o) => o.hidden && !o.glimpsed && Math.hypot(o.x - f.x, o.y - f.y) > 22;   // (a cloak glitching shows them for a moment)
    const enemies = G.fighters.filter((o) => o.alive && G.foes(f, o) && !unseen(o));
    // hit by someone: it knows roughly where from (even if it can't see them)
    if (f.hurtT < 0.1 && f.hitBy?.alive && G.foes(f, f.hitBy)) this.known.set(f.hitBy, { x: f.hitBy.x, y: f.hitBy.y, t: G.time });
    // someone it was after just vanished: remember where, to go and look round there
    if (this.target && this.target.alive && unseen(this.target) && !this.lost) this.lost = { x: this.target.x, y: this.target.y, t: G.time };
    if (this.lost && G.time - this.lost.t > 7) this.lost = null;
    const s = f.shoulder;
    const sees = (o) => G.los(s.x, s.y, o.x, o.y - 12) || G.los(s.x, s.y, o.x, o.y - 22);
    for (const o of enemies) if (Math.abs(o.x - f.x) < 420 && sees(o)) this.known.set(o, { x: o.x, y: o.y, t: G.time });
    for (const [o] of this.known) if (!o.alive) this.known.delete(o);

    // who to fight: one it can see (nearest), else the freshest lead it has
    if (!this.target || !this.target.alive || this.targetT <= 0 || !this.known.has(this.target)) {
      let best = null, bs = Infinity;
      for (const o of enemies) {
        const k = this.known.get(o);
        if (!k) continue;
        const score = Math.hypot(k.x - f.x, k.y - f.y) + (G.time - k.t) * 80 - (sees(o) ? 200 : 0);
        if (score < bs) { bs = score; best = o; }
      }
      this.target = best;
      this.targetT = rand(2, 4);
    }
    const t = this.target, vis = !!t && !unseen(t) && sees(t);
    const aimY = t ? (t.roll ? t.y - 7 : t.y - 12) : 0;
    const dist = t ? Math.hypot(t.x - f.x, aimY - s.y) : Infinity;
    this.seen = vis ? this.seen + dt : 0;
    this.unseen = vis ? 0 : (this.unseen ?? 9) + dt;
    const w = f.cloak ? null : f.bestGun(), armed = !!w;   // the gun, while it has ammo (cloaked: the knife, for a stab)
    const hpK = f.hp / f.maxHp;

    // ---- what to do ----
    const pick = (pred, range) => {
      let best = null, bd = Infinity;
      for (const p of G.pickups) if (p.ready && pred(p) && !(this.skip.get(p) > G.time)) {
        const d = Math.hypot(p.x - f.x, p.y - f.y);
        if (d < bd) { bd = d; best = p; }
      }
      return best && bd < range ? best : null;
    };
    const calm = !this.target;   // nobody to fight right now: time to stock up
    const healthP = hpK < (calm ? 0.8 : 0.45) ? pick((p) => p.kind === 'health', calm ? 900 : 520) : null;
    // a gun better than what's in its slot (an empty slot: anything)
    const better = (def) => { const g = f.gunIn(f.slotFor(def)); return gunTier(def) > gunTier(g && (g.ammo > 0 || g.reserve > 0) ? g.def : null) + 0.4; };
    const gunP = pick((p) => p.kind === 'gun' && better(G.weapons[p.key]), calm ? 900 : armed ? 260 : 700);
    // bare fists: a melee weapon lying about is worth fetching
    const meleeP = f.melee.def.fists && !f.cloak ? pick((p) => p.kind === 'melee', calm ? 600 : armed ? 220 : 420) : null;
    let goal = null, key = null, fight = false, sprint = false;
    const losing = vis && hpK < 0.3 && t.hp / t.maxHp > hpK + 0.15;
    if (healthP && !(vis && dist < 110)) { goal = nav.nodeBelow(healthP.x, healthP.y); key = healthP; sprint = vis; this.mode = 'heal'; }
    else if (gunP && (!armed || !vis)) { goal = nav.nodeBelow(gunP.x, gunP.y); key = gunP; sprint = !armed; this.mode = 'loot'; }
    else if (meleeP && !(vis && armed)) { goal = nav.nodeBelow(meleeP.x, meleeP.y); key = meleeP; this.mode = 'loot'; }
    else if (vis && armed && (losing || (w.reloading && dist < 200))) {
      // back off out of sight to patch up / reload
      if (!this.spot || this.spotT <= 0 || this.mode !== 'retreat') { this.spot = this.coverFrom(t, true); this.spotT = 2.5; }
      goal = this.spot; key = 'retreat'; sprint = true; this.mode = 'retreat';
    } else if (armed && t && (vis || (this.mode === 'fight' && this.unseen < 0.5)) && dist < (w.def.cls === 'shotgun' ? 150 : w.def.cls === 'sniper' ? 420 : 300) * (this.mode === 'fight' ? 1.25 : 1)) fight = true;
    // (in a fight it stays in it a little further out, and through a moment out of sight - at the edge
    // of its range, or with cover flickering between them, it went in and out of it every moment)
    else if (t) {
      // go where it was last seen / heard (the long way round sometimes)
      const k = this.known.get(t);
      const n = nav.nodeAt(k.x, k.y) ?? nav.nodeBelow(k.x, k.y);
      if (n && (Math.abs(k.x - f.x) > 20 || Math.abs(k.y - f.y) > 20)) {
        goal = n; key = t; this.mode = 'hunt';
        sprint = Math.hypot(k.x - f.x, k.y - f.y) > 200 && f.stamina > 40;
      } else { this.known.delete(t); this.target = null; }
    }
    if (!goal && !fight) {
      // nothing to go on: roam - round where someone vanished, if someone did, otherwise
      // anywhere - pausing a moment to look about
      if (this.mode !== 'search' || !this.wander || this.wanderReached() || this.gaveUp > 0) {
        this.gaveUp = 0;
        const L = this.lost, near = (n) => Math.abs((n.cx + 0.5) * T - L.x) < 8 * T && Math.abs((n.cy + 1) * T - L.y) < 5 * T;
        // (with nothing to go on, it tends to drift toward where the fighting is: a big map doesn't leave it wandering alone)
        const foe = !L && Math.random() < 0.65 ? pick2(G.fighters.filter((o) => o.alive && !o.hidden && G.foes(f, o))) : null;
        const by = foe && ((n) => Math.abs((n.cx + 0.5) * T - foe.x) < 9 * T && Math.abs((n.cy + 1) * T - foe.y) < 6 * T);
        let spots = nav.standable.filter((n) => Math.abs(n.cx * T - f.x) > 64 && (!L || near(n)) && (!by || by(n)));
        if (!spots.length) spots = nav.standable.filter((n) => Math.abs(n.cx * T - f.x) > 96);
        this.wander = pick2(spots);
        this.pauseT = L ? rand(0.1, 0.4) : rand(0.3, 0.8);
      }
      this.mode = 'search';
      goal = this.wander;
      key = this.wander;
      sprint = (!!this.lost || (this.wander && Math.abs((this.wander.cx + 0.5) * T - f.x) > 200)) && f.stamina > 60;
    }

    // ---- aim ----
    if (vis) {
      if (this.seen <= dt) this.aimErr = rand(-0.3, 0.3) / this.skill;
      this.aimErr *= Math.exp(-2.2 * this.skill * dt);
      const lead = ((t.vx * dist) / (w?.def.bulletSpeed ?? 700)) * 0.5;
      const want = Math.atan2(aimY - s.y, t.x + lead - s.x) + this.aimErr + rand(-0.025, 0.025);
      const d = Math.atan2(Math.sin(want - this.aim), Math.cos(want - this.aim));
      this.aim += Math.max(-7 * dt, Math.min(7 * dt, d));
      c.aim = this.aim;
      c.target = { x: s.x + Math.cos(this.aim) * dist, y: s.y + Math.sin(this.aim) * dist };
    } else {
      // someone it knows about, seen a moment ago: its gun stays on where they were, ready for when they
      // show again. Otherwise it looks the way it's going (and only glances back when it's just looking about)
      const k = t && this.known.get(t), fresh = k && G.time - k.t < 2.5 && Math.hypot(k.x - f.x, k.y - f.y) > 20;
      let want;
      if (fresh) want = Math.atan2(k.y - 12 - s.y, k.x - s.x);
      else {
        const dir = Math.abs(f.vx) > 20 ? Math.sign(f.vx) : f.facing;   // (by how it's moving: by the next step of the route, it flipped as it passed each one)
        if (this.mode === 'search' && this.lookT <= 0 && Math.random() < dt * 0.1) this.lookT = rand(0.5, 0.9);
        want = (this.mode === 'search' && this.lookT > 0 ? -dir : dir) > 0 ? 0 : Math.PI;
      }
      this.aim += Math.atan2(Math.sin(want - this.aim), Math.cos(want - this.aim)) * Math.min(1, dt * 8);
      c.aim = this.aim;
    }

    // ---- shoot: in bursts, with a beat to react first ----
    if (armed && vis && this.seen > this.react) {
      const range = w.def.cls === 'shotgun' ? 170 : (w.def.range ?? 520);
      if (this.burstT <= -0.15 && Math.random() < dt * 4) this.burstT = w.def.auto ? rand(0.3, 0.8) : rand(0.5, 1.2);
      if (dist < range && Math.abs(this.aimErr) < 0.15 && this.burstT > 0) {
        if (w.def.auto && !w.def.burst) c.fire = true;
        else { this.fireToggle = !this.fireToggle; c.fire = this.fireToggle; }
      }
    }
    if (w && w.ammo <= 0 && w.reserve > 0) c.reload = true;
    if (w && !vis && w.ammo < w.magSize * 0.5 && w.reserve > 0) c.reload = true;

    // which slot: the best gun with ammo, otherwise the melee weapon / fists
    const slot = armed ? f.slotFor(w.def) : 1;
    c.slot = !f.cloak && slot !== f.slot ? slot : 0;
    // no gun: close in and hit them (combos with whatever's in slot 1)
    const reach = f.melee.def.reach + 2;
    if (t && !armed && vis) { goal = nav.nodeAt(t.x, t.y, t.onLadder) ?? goal; key = t; sprint = dist < 200; fight = false; }
    if (t && !armed && Math.abs(t.x - f.x) < reach && Math.abs(t.y - f.y) < 18) {
      c.fire = true;
      // (right on top of them: as it's facing - which side of it they're on means nothing that close, a hit's a hit)
      c.aim = Math.abs(t.x - f.x) < 8 ? (f.facing > 0 ? 0 : Math.PI) : Math.atan2(t.y - 14 - s.y, t.x - s.x);
    }
    // with a gun but someone right up close: a quick melee to knock it out of their hands
    if (t && armed && vis && Math.abs(t.x - f.x) < 18 && Math.abs(t.y - f.y) < 16 && this.punchT <= 0 && (t.lastFireT < 0.5 || Math.random() < 0.3)) {
      c.melee = true;
      c.fire = false;
      this.punchT = rand(0.5, 1.1);
      c.aim = t.x > f.x ? 0 : Math.PI;
    }
    const k = f.cloak && !f.cloak.out ? f.cloak : null;
    if (k && t && !this.flee) {
      // in behind them - their back is a critical - and the stab (a dash in from up to 64 px)
      const bx = t.x - (t.facing || 1) * 16;
      goal = nav.nodeBelow(bx, t.y - 4) ?? nav.nodeAt(t.x, t.y, t.onLadder) ?? goal;
      key = 'stab'; fight = false; sprint = false;
      c.fire = false;
      const behind = (f.x - t.x) * (t.facing || 1) < 0;
      if (!k.used && Math.hypot(t.x - f.x, t.y - f.y) < (behind ? 56 : 30) && G.los(f.x, f.y - 14, t.x, t.y - 14)) {
        c.fire = true;
        c.aim = Math.atan2(t.y - 14 - s.y, t.x - s.x);
      }
    } else if (k && this.flee && t) {
      if (!this.spot || this.spotT <= 0 || this.mode !== 'retreat') { this.spot = this.coverFrom(t, true); this.spotT = 2; }
      goal = this.spot; key = 'retreat'; fight = false; this.mode = 'retreat'; c.fire = false;
    }
    if (f.veil && t) {
      // the double's drawing their fire: unseen, get round behind them - and only then attack (which ends it)
      const behind = (f.x - t.x) * (t.facing || 1) < 0, there = behind && Math.abs(t.x - f.x) < 140 && Math.abs(t.y - f.y) < 30;
      if (!there && f.veil.t > 0.4) {
        c.fire = false; c.melee = false; c.grenade = false;
        goal = nav.nodeBelow(t.x - (t.facing || 1) * 70, t.y - 4) ?? goal; key = 'flank'; fight = false; sprint = true;
      }
    }
    // a grenade at someone in the open, not too close
    if (vis && !k && !f.veil && f.grenades > 0 && this.nadeT <= 0 && dist > 80 && dist < 230 && f.onGround && Math.random() < 0.5) {
      c.grenade = true;
      c.aim = Math.atan2(aimY - s.y - dist * 0.35, t.x - s.x);
      this.nadeT = rand(7, 13);
    }
    // dodge when shot at
    if (vis && !k && t.lastFireT < 0.15 && this.rollT <= 0 && f.onGround && Math.random() < 0.04) {
      c.roll = true;
      c.move = Math.random() < 0.5 ? -1 : 1;
      this.rollT = rand(2, 4);
    }

    this.useSkill(c, t, vis, dist, hpK, enemies);

    if (fight && f.onLadder) { fight = false; goal = nav.nodeAt(t.x, t.y, t.onLadder) ?? nav.nodeBelow(t.x, t.y); key = t; }
    if (fight) this.duel(dt, c, t);
    else if (this.pauseT > 0 && this.mode === 'search' && !f.onLadder) { if (!c.roll) c.move = 0; }   // a moment to look around
    else {
      if (key !== this.goalKey) this.repath = 0;
      this.goalKey = key;
      const rolled = c.move;
      this.follow(dt, c, goal);
      this.progress(dt, c, goal, key);
      if (c.roll) c.move = rolled;
      c.sprint = (sprint || this.runJump) && f.stamina > 30;   // (running at a long jump, too)
      this.runJump = false;
    }
    if (this.mode === 'search' && f.onGround && c.move && this.hopT <= 0 && !this.path[0]?.edge.kind.match(/drop|climb/)) {
      this.hopT = rand(1.5, 4);
      if (this.safeAhead(c.move)) { c.jump = true; this.holdT = Math.random() < 0.5 ? 0.4 : 0; }
    }
    if (!fight) { this.obstacles(dt, c); this.unjitter(dt, c); this.reach(dt, c, key); }
    this.airControl(c);
    this.avoidAcid(c);
    this.unstick(dt, c);
    // a jump it means: held right up (and the second one at the top, if it has to go higher)
    if (this.holdT > 0) {
      this.holdT -= dt;
      c.jumpHeld = true;
      if (this.dj && !f.onGround && !f.onLadder && f.vy > -40 && f.airJumps > 0) { c.jump = true; this.dj = false; }
    }
    if (f.onGround && this.holdT <= 0) this.dj = false;
    // Turned round just now: it doesn't turn straight back. (Someone right overhead or crossing it had it
    // flipping from side to side every moment.) It's a beat before it can turn on them and shoot.
    this.turnT -= dt;
    if (c.aim !== null && !f.roll) {
      const side = Math.cos(c.aim);
      if (Math.abs(side) > 0.15 && Math.sign(side) !== f.facing) {
        if (this.turnT > 0) { c.aim = Math.PI - c.aim; c.target = null; c.fire = false; }
        else this.turnT = 0.5;
      }
    }
    return c;
  }

  // Which way to press to get to x: none once it's near enough - or near enough that, letting go now,
  // it slides to a stop there. (Pressing right up to it, it went past, turned back, went past...)
  toward(x, near = 4) {
    const f = this.f, d = x - f.x, coast = f.onGround ? (f.vx * f.vx) / 2500 : 0;   // (the floor stops it at 1250 px/s²)
    if (Math.abs(d) <= near) return 0;
    if (Math.sign(f.vx) === Math.sign(d) && Math.abs(d) <= coast + 2) return 0;
    return Math.sign(d);
  }
  // The prop it's standing on (if it is).
  propUnder() {
    const f = this.f;
    return this.game.props.find((p) => !p.dead && p.block && Math.abs(p.box.t - f.y) < 3 && f.x > p.box.l - 5 && f.x < p.box.r + 5) ?? null;
  }
  // A prop (crate, cabinet, shelf...) standing in its way, at body height, just ahead.
  propAhead(dir) {
    const f = this.f;
    for (const p of this.game.props) {
      if (p.dead || !p.block) continue;
      const b = p.box;
      if (b.t > f.y - 3 || b.b < f.y - 24) continue;   // (not what it's standing on, nor up overhead)
      const gap = dir > 0 ? b.l - (f.x + 5) : f.x - 5 - b.r;
      if (gap > -3 && gap < 10) return p;
    }
    return null;
  }
  // Something in the way: jump it - a full jump, a double one for the tall things - and if
  // that doesn't get it over (twice), or it's too tall to jump, knock it about till it breaks.
  obstacles(dt, c) {
    const f = this.f;
    const p = this.smash && !this.smash.dead ? this.smash : (c.move && f.onGround ? this.propAhead(Math.sign(c.move)) : null);
    if (!p) { this.smash = null; return; }
    const b = p.box, rise = f.y - b.t, dir = Math.sign(c.move);
    // only what's on the way: the next step of the route past it (not a ladder or a drop this side of it)
    const step = this.path[0];
    if (this.smash !== p && step) {
      const tx = (step.node.cx + 0.5) * T;
      if (step.edge.kind === 'climb' || step.edge.kind === 'drop' || (dir > 0 ? tx < b.l - 2 : tx > b.r + 2)) return;
    }
    if (this.tries?.p !== p) this.tries = { p, n: 0 };
    if (this.smash === p || rise > 92 || this.tries.n >= 2) {
      this.smash = p;
      const dir = Math.sign(p.x - f.x) || f.facing;
      c.move = Math.abs(p.x - f.x) > p.w / 2 + 9 ? dir : 0;   // right up to it
      c.jump = false;
      if (this.punchT <= 0 && Math.abs(p.x - f.x) < p.w / 2 + 16) {
        c.melee = true;
        c.aim = Math.atan2(Math.max(b.t + 6, f.y - 22) - (f.y - 14), p.x - f.x);
        this.punchT = 0.28;
      }
      return;
    }
    if (!c.jump && f.onGround) {
      if (this.tries.jumped) this.tries.n++;
      c.jump = true;
      this.holdT = 0.45;
      this.dj = rise > 46;
      this.tries.jumped = true;
    }
  }
  // Turning back and forth over the same spot (on top of a crate, round a pickup it can't
  // quite get at): pick a way and keep going that way a moment, off whatever it's stuck on.
  unjitter(dt, c) {
    const f = this.f, dir = Math.sign(c.move);
    if (this.commit > 0) { this.commit -= dt; c.move = this.commitDir; return; }
    if (dir && this.lastDir && dir !== this.lastDir) this.flips++;
    if (dir) this.lastDir = dir;
    if ((this.flipT -= dt) > 0) return;
    const stuck = this.flips >= 3 && Math.abs(f.x - this.flipX) < 28;
    this.flipT = 1;
    this.flips = 0;
    this.flipX = f.x;
    if (!stuck) return;
    // standing on a prop: off its nearer edge; otherwise the other way to the one it keeps trying
    const under = this.propUnder();
    this.commitDir = under ? (f.x < under.x ? -1 : 1) : -this.lastDir || 1;
    this.commit = 0.6;
    this.repath = 0;
    if (under && this.tries) this.tries.n = 2;   // (and break it, if it's what's in the way)
  }
  // After a pickup: close to it but not getting it (up on a crate, say) - jump for it if it's
  // above, break what's on it or in front of it, and give up on it a while if none of that works.
  reach(dt, c, key) {
    const f = this.f, G = this.game;
    if (!key || key.kind === undefined || !G.pickups.includes(key)) { this.lootT = 0; return; }
    this.lootT += dt;
    const dx = key.x - f.x, dy = key.y - f.y;
    // lying on top of a prop (a crate, a shelf) just above: jump up onto it, going its way. (Up on a
    // floor above is the route's business - it knows the ladders and the jumps; hopping under it gets nowhere.)
    const on = dy < -14 && dy > -95 && Math.abs(dx) < 48 && G.props.find((p) => !p.dead && p.block && key.x > p.box.l - 3 && key.x < p.box.r + 3 && Math.abs(key.y - p.box.t) < 5);
    if (on) {
      c.move = Math.sign(dx) || c.move;
      if (f.onGround && !c.jump && Math.abs(dx) < 40) { c.jump = true; this.holdT = 0.45; this.dj = dy < -50; }
      this.smash = null;
    } else if (Math.abs(dx) < 22 && Math.abs(dy) < 20) {
      // under a prop, or inside one's shape (one sat on top of it): break it open
      const over = G.props.find((p) => !p.dead && p.block && key.x > p.box.l - 4 && key.x < p.box.r + 4 && key.y > p.box.t + 4 && key.y < p.box.b + 6);
      if (over && this.lootT > 1) this.smash = over;
    }
    if (this.lootT > 7) { this.skip.set(key, G.time + 12); this.lootT = 0; this.repath = 0; }
  }

  // Q, when it's worth it - each skill has its moment. (Not while one's still going:
  // a second Q would cut the cloak short, say.)
  useSkill(c, t, vis, dist, hpK, enemies) {
    const f = this.f, G = this.game, k = f.skill;
    if (!k || (k === 'grapple' ? !(f.charges > 0) : f.skillCD > 0) || this.skillT > 0 || !f.alive || f.onLadder || f.roll) return;
    if (f.cloak || f.decoy || f.veil || f.bow || f.mura || f.blaze || f.gal || f.summon || f.hook || f.fistsOut) return;
    this.skillT = rand(0.4, 0.9) / this.skill;   // (it thinks it over now and then, not every frame)
    const aimed = vis && Math.abs(this.aimErr) < 0.2;
    const near = enemies.filter((o) => Math.hypot(o.x - f.x, o.y - f.y) < 280);
    let go = false;
    switch (k) {
      case 'cloak':      // to slip away when it's losing, or to creep up for a stab
        go = (vis && hpK < 0.35) || (!!t && dist < 360 && hpK >= 0.35 && Math.random() < 0.6);
        this.flee = hpK < 0.35;
        break;
      case 'decoy':      // a double to take the heat in a fight (then round behind them, unseen)
        go = vis && dist < 260 && Math.random() < 0.6;
        break;
      case 'archery':    // the more in reach the better
        go = near.length >= 2 || (near.length === 1 && (vis || Math.random() < 0.3));
        break;
      case 'murasaki':   // the line of it at someone in sight
        go = aimed && dist < 380;
        break;
      case 'blaze':      // close enough to dash and hit
        go = aimed && dist < 165 && Math.abs(t.y - f.y) < 50;
        break;
      case 'galaxy':     // where they stand
        go = vis && dist < 230;
        if (go) c.target = { x: t.x, y: t.y - 12 };
        break;
      case 'demon':      // a fight coming: call up the fists
        go = f.onGround && ((vis && dist < 320) || near.length >= 2);
        break;
      case 'grapple':    // out of a fight going badly: up and away
        go = vis && hpK < 0.35 && Math.random() < 0.3;
        if (go) { c.aim = -Math.PI / 2 + rand(-0.5, 0.5); c.target = { x: f.x + Math.cos(c.aim) * 160, y: f.y + Math.sin(c.aim) * 160 }; }
        break;
    }
    if (go) c.skill = true;
  }

  wanderReached() {
    const n = this.wander;
    return Math.abs((n.cx + 0.5) * T - this.f.x) < 10 && Math.abs((n.cy + 1) * T - this.f.y) < 10;
  }

  // A spot near by to fight from: behind a crate / drum if there's one between
  // it and the target, otherwise somewhere at a good range. away: one out of
  // the target's sight instead.
  coverFrom(t, away = false) {
    const f = this.f, G = this.game, nav = G.nav, here = nav.nodeAt(f.x, f.y);
    if (!here) return null;
    let best = null, bs = -Infinity;
    for (const n of nav.standable) {
      const dx = n.cx - here.cx, dy = n.cy - here.cy;
      if (Math.abs(dx) > (away ? 10 : 5) || Math.abs(dy) > (away ? 6 : 0)) continue;
      const x = (n.cx + 0.5) * T, y = (n.cy + 1) * T;
      const toT = Math.abs(t.x - x), seen = G.los(t.x, t.y - 12, x, y - 12);
      let score = -Math.abs(dx) * 0.6 - Math.abs(dy);
      if (away) score += (seen ? -30 : 20) + toT * 0.03;
      else {
        const pref = f.weapon?.def.cls === 'shotgun' ? 70 : f.weapon?.def.cls === 'sniper' ? 260 : 150 - this.aggro * 60;
        score -= Math.abs(toT - pref) * 0.08;
        if (!seen) score -= 15;   // it has to be able to shoot from there
        // a crate just on the target's side of it
        for (const p of G.props) if (!p.dead && Math.abs(p.y - y) < 4 && Math.sign(p.x - x) === Math.sign(t.x - x) && Math.abs(p.x - x) < 16) score += 8;
        if (n === here) score -= 2;   // keep moving a little
      }
      score += Math.random() * 2;
      if (score > bs) { bs = score; best = n; }
    }
    return best;
  }

  // In a gunfight: stand and shoot, then shift to another spot (behind cover if
  // there is some), hop now and then.
  duel(dt, c, t) {
    const f = this.f;
    if (!this.spot || this.spotT <= 0) {   // (the spot it had, kept till its time's up - not a new one every time it comes back to the fight)
      this.spot = this.coverFrom(t);
      this.spotT = rand(1.2, 2.6);
    }
    this.mode = 'fight';
    this.path = [];
    if (this.spot) {
      const x = (this.spot.cx + 0.5) * T;
      if (!c.roll) c.move = this.burstT <= 0 ? this.toward(x, 4) : 0;
    }
    // shot at while moving to its next spot: now and then a jump to throw their aim (never a hop on the spot)
    if (f.onGround && c.move && t.lastFireT < 0.2 && Math.random() < 0.03 && this.safeAhead(c.move)) { c.jump = true; this.holdT = 0.4; }
  }

  // Is there floor (not acid) under the next step that way?
  safeAhead(dir) {
    const f = this.f, nav = this.game.nav, cx = Math.floor((f.x + Math.sign(dir) * 24) / T), cy = Math.floor((f.y - 1) / T);
    return nav.stand(cx, cy) || nav.land(cx, cy) !== null;
  }

  // In the air over the acid (knocked off, or a jump gone wrong): steer for the nearest floor, jump again.
  airControl(c) {
    const f = this.f, nav = this.game.nav;
    if (f.onGround || f.onLadder) { this.airSide = null; return; }
    const cy = Math.max(0, Math.floor((f.y - 1) / T));
    // nowhere to land down there (the vat, the open air) - a wall ahead isn't that: it just stops it where it is
    const doomed = (x) => {
      let cx = Math.floor(x / T);
      if (!nav.free(cx, cy)) cx = Math.floor(f.x / T);
      return nav.land(cx, cy) === null && !nav.stand(cx, cy);
    };
    // already making for a floor to save itself: on that way till it lands (taking turns with the jump's
    // own aim, it went back and forth)
    if (this.airSide) { c.move = this.airSide; if (f.airJumps > 0 && f.vy > -40) { c.jump = true; c.jumpHeld = true; } return; }
    // on a planned jump (over the vat, say): keep going for where it's meant to land
    // while it's still up at that height - turning back is what made it hop on the spot
    const j = this.jumping, jx = j && (j.edge.to.cx + 0.5) * T, jy = j && (j.edge.to.cy + 1) * T;
    if (j && (f.vy < 0 || f.y < jy + 4)) {
      c.move = Math.sign(jx - f.x) || c.move;
      return;
    }
    if (!doomed(f.x + f.vx * 0.25)) return;
    // falling short: make for the nearest floor, the landing side first
    let best = this.airSide ?? null;   // (a side picked, kept till it lands - picked afresh each moment, it went back and forth)
    const sides = j ? [Math.sign(jx - f.x) || 1, -(Math.sign(jx - f.x) || 1)] : [-1, 1];
    for (let d = 1; d < 12 && best === null; d++) for (const s of sides) if (best === null && !doomed(f.x + s * d * T)) best = s;
    if (best === null) return;
    this.airSide = best;
    c.move = best;
    if (f.airJumps > 0 && f.vy > -40) { c.jump = true; c.jumpHeld = true; }
  }

  // Not getting any closer to where it's going, for a while (whatever the reason): that step of the route's
  // no good for now, and if it was only roaming or fetching something, somewhere else will do.
  progress(dt, c, goal, key) {
    const f = this.f, G = this.game;
    if (!goal) return;
    const d = Math.abs((goal.cx + 0.5) * T - f.x) + Math.abs((goal.cy + 1) * T - f.y);
    if (goal !== this.nearGoal) { this.nearGoal = goal; this.nearD = d; this.noWay = 0; return; }
    if (d < this.nearD - 10) { this.nearD = d; this.noWay = 0; return; }
    if ((this.noWay += dt) < 3) return;
    this.noWay = 0;
    this.nearD = Infinity;
    if (this.path[0]) this.failed.set(this.path[0].edge, G.time + 12);
    this.repath = 0;
    if (this.mode === 'search') this.gaveUp = 1;
    else if (key?.kind !== undefined && G.pickups.includes(key)) this.skip.set(key, G.time + 12);
    else if (this.mode === 'hunt' && this.target) { this.known.delete(this.target); this.target = null; }
    if (f.onGround && !f.onLadder) { this.commit = 0.4; this.commitDir = Math.random() < 0.5 ? -1 : 1; }
  }

  // Follow the route to a node, pressing whatever each step needs.
  follow(dt, c, goal) {
    const f = this.f, nav = this.game.nav;
    // once on a ladder, climb the whole run the route asked for before thinking
    // again - a change of plan halfway up used to send it back down (and up...)
    if (!f.onLadder) this.climb = null;
    else if (this.climb) {
      const cl = this.climb;
      cl.t += dt;
      // not getting anywhere (something in the way of the hole): off the ladder,
      // and that way up is no good for a while
      cl.stall = Math.abs(f.y - (cl.lastY ?? f.y)) < 0.2 ? (cl.stall ?? 0) + dt : 0;
      cl.lastY = f.y;
      if (cl.stall > 0.5) {
        for (const s of this.path) if (s.edge.kind === 'climb') this.failed.set(s.edge, this.game.time + 6);
        this.climb = null;
        this.repath = 0;
        c.jump = true;
        c.move = Math.random() < 0.5 ? -1 : 1;
        return;
      }
      const there = cl.dir < 0 ? f.y <= cl.exitY + 0.5 : f.y >= cl.exitY - 0.5;
      if (!there && cl.t < 4) {
        c.up = cl.dir < 0;
        c.down = cl.dir > 0;
        c.move = 0;
        return;
      }
      this.climb = null;
      this.repath = 0;   // at the end of it: on along the route
    }
    const here = f.onGround || f.onLadder ? nav.nodeAt(f.x, f.y, f.onLadder) : null;
    // up on a prop (a stack of crates, a shelf): the routes don't know about those - it's nowhere
    // as far as they go, and the next step can be right underneath. Off it, toward where it's going
    // (the nearer edge, if that's straight down).
    if (f.onGround && !f.onLadder && !here) {
      const p = this.propUnder();
      if (p) {
        const to = this.path[0]?.node ?? goal, gx = to ? (to.cx + 0.5) * T : f.x;
        c.move = gx < p.box.l ? -1 : gx > p.box.r ? 1 : f.x < p.x ? -1 : 1;
        return;
      }
    }
    if (here && (this.repath <= 0 || !this.path.length || goal !== this.goal)) {
      // (the same goal: a fresh route now and then, not every moment - changing its mind between
      // two ways that cost about the same had it going back and forth)
      this.repath = goal === this.goal ? rand(1.2, 2) : rand(0.45, 0.8);
      this.goal = goal;
      const now = this.game.time, avoid = new Set();
      for (const [e, until] of this.failed) if (until > now) avoid.add(e); else this.failed.delete(e);
      // turning round costs a bit more than going on: two ways of about the same length (round the vat
      // one way or the other) and a goal that keeps moving had it turning back and forth
      let extra = nav.propCost(this.game.props, now);
      const going = Math.abs(f.vx) > 30 ? Math.sign(f.vx) : 0;
      if (going && f.onGround) {
        extra = new Map(extra);
        for (const e of here.edges) if (Math.sign(e.to.cx - here.cx) === -going) extra.set(e.to, (extra.get(e.to) ?? 0) + 6);
      }
      // (no way there at all, from here: as near as it can get)
      this.path = nav.path(here, goal, this.bias, avoid, extra) ?? (goal && nav.path(here, nav.nearest(here, goal), this.bias, avoid, extra)) ?? [];
    }
    // drop the steps already done
    while (here && this.path.length && this.path[0].node === here) this.path.shift();
    if (here && this.path.length > 1 && this.path[1].node === here) this.path.splice(0, 2);
    // just got on a ladder: commit to the run of climbs ahead (all one way)
    if (f.onLadder && !this.climb) {
      let i = 0, dir = 0;
      while (this.path[i]?.edge.kind === 'climb') {
        const d = Math.sign(this.path[i].node.cy - this.path[i].from.cy);
        if (dir && d !== dir) break;
        dir = d;
        i++;
      }
      if (dir) this.climb = { dir, exitY: (this.path[i - 1].node.cy + 1) * T, t: 0 };
    }
    const step = this.path[0];
    if (!step) {
      // nothing left to do but it's hanging on a ladder: get down onto the floor
      if (f.onLadder) { c.down = true; return; }
      // there (or no way): face the goal and close the last bit
      if (goal) c.move = this.toward((goal.cx + 0.5) * T, 4);
      return;
    }
    const e = step.edge, n = step.node, tx = (n.cx + 0.5) * T, ty = (n.cy + 1) * T;
    const sx = (step.from.cx + 0.5) * T;
    switch (e.kind) {
      case 'walk':
      case 'fall':
        c.move = Math.abs(tx - f.x) > 2 ? Math.sign(tx - f.x) : 0;
        if (f.onLadder) {
          // level the feet with the floor first, or the floor's edge blocks stepping off
          c.move = Math.sign(tx - f.x);
          c.up = f.y > ty + 0.5;
          c.down = f.y < ty - 0.5;
        }
        break;
      case 'climb': {
        const up = n.cy < step.from.cy;
        if (!f.onLadder && Math.abs(f.x - tx) > 3) c.move = Math.sign(tx - f.x);
        c.up = up;
        c.down = !up;
        break;
      }
      case 'drop':
        if (Math.abs(f.x - tx) > 4) c.move = Math.sign(tx - f.x);
        else if (f.onGround && !(this.dropT > this.game.time)) { c.drop = true; this.dropT = this.game.time + 0.5; }   // through the catwalk - once (held on, it would jump off it instead)
        break;
      case 'pad': {
        // onto the middle of it (it does the rest), then over to where it's for
        if (f.onGround) c.move = Math.abs(sx - f.x) > 3 ? Math.sign(sx - f.x) : 0;
        else {
          this.jumping ??= { edge: e, t: this.game.time };
          c.move = Math.abs(tx - f.x) <= 6 ? 0 : f.y < ty + 2 ? Math.sign(tx - f.x) : Math.abs(tx - f.x) > 20 ? Math.sign(tx - f.x) * 0.6 : 0;
        }
        break;
      }
      case 'jump': {
        const high = e.dy <= -3, long = Math.abs(e.dx) >= 3, dirJ = Math.sign(tx - sx);
        if (f.onGround || f.onLadder) {
          // on to the front of the take-off spot and go - or go now if it's already there or past it.
          // (It never turns back to line up: overshooting and turning back, over and over, was the A-D-A-D.)
          // Running at a long one; a second jump in the air carries it over (below).
          const ahead = dirJ ? (f.x - (sx + dirJ * 4)) * dirJ : -Math.abs(f.x - sx) + 5;
          if (ahead < -2 && this.jumpedFrom !== step.from) { c.move = dirJ || this.toward(sx, 5); if (long) this.runJump = true; }
          else {
            c.jump = true;
            c.jumpHeld = true;
            c.move = Math.sign(tx - f.x);
            this.jumpedFrom = step.from;
            this.jumping ??= { edge: e, t: this.game.time };
          }
        } else {
          c.jumpHeld = f.y > ty - 4;
          // only steer over once it's high enough to clear the lip
          const above = f.y < ty + 2;
          // (near enough the landing spot: hands off - steering hard for its middle, it went past and back)
          c.move = Math.abs(tx - f.x) <= 6 ? 0 : above || e.dy >= 0 ? Math.sign(tx - f.x) : Math.abs(tx - f.x) > 20 ? Math.sign(tx - f.x) * 0.6 : 0;
          if ((high && f.y > ty) || (long && Math.abs(tx - f.x) > 24)) if (f.vy > -60 && f.airJumps > 0) { c.jump = true; c.jumpHeld = true; }
        }
        break;
      }
    }
    if (f.onGround && this.jumpedFrom && here && here !== this.jumpedFrom) this.jumpedFrom = null;
    // landed from a jump: if it didn't end up where the jump was meant to go
    // (bonked a ceiling, fell short), don't keep trying it - go another way
    const j = this.jumping;
    if (j && (f.onGround || f.onLadder) && this.game.time - j.t > 0.25) {
      if (here !== j.edge.to) {
        this.failed.set(j.edge, this.game.time + 15);
        this.repath = 0;
      }
      this.jumping = null;
    }
  }

  // Never step toward a drop into the acid.
  avoidAcid(c) {
    const f = this.f, nav = this.game.nav;
    if (!c.move || !f.onGround) return;
    const cx = Math.floor((f.x + Math.sign(c.move) * 9) / T), cy = Math.floor((f.y - 1) / T);
    if (nav.stand(cx, cy) || !nav.free(cx, cy) || nav.land(cx, cy) !== null) return;
    // right on the edge of it. On its way over by a jump: this is as good a place to go from as any (held back
    // here for a better one, it stood at the edge for ever); otherwise no further.
    const step = this.path[0];
    if (step?.edge.kind === 'jump' && Math.sign(step.edge.dx) === Math.sign(c.move)) {
      c.jump = true;
      c.jumpHeld = true;
      this.jumpedFrom = step.from;
      this.jumping ??= { edge: step.edge, t: this.game.time };
    } else if (!c.jump || step?.edge.kind !== 'jump') c.move = 0;
  }

  // Pushing against something and not moving: hop.
  unstick(dt, c) {
    const f = this.f;
    if (c.move && f.onGround && Math.abs(f.x - this.lastX) < 0.4) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt);
    this.lastX = f.x;
    if (this.stuckT > 0.35) {
      this.stuckT = 0;
      if (this.mode === 'fight') {
        // pushing into a wall to get to a firing spot: fight from here instead (no hopping on the spot)
        this.spot = this.game.nav.nodeAt(f.x, f.y);
        this.spotT = rand(1.5, 3);
        c.move = 0;
        return;
      }
      c.jump = true;
      this.holdT = 0.45;
      this.repath = 0;
    }
  }
}
