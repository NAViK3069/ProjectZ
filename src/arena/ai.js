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
import { GRAVITY, WALK, AIR_ACCEL, JUMP, JUMP2, PAD_JUMP, GRAPPLE_RANGE, CHIDORI_REACH, JC_RANGE } from './fighter.js';
import { SKILLS, dangersTo } from './skills.js';

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
    this.standable = [...this.nodes.values()].filter((n) => !n.ladder && !this.pads.has(n.id) && (!start || reach.has(n)));   // (nowhere to stand: a jump pad)
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
      if (d < bd && !n.ladder && !this.pads.has(n.id)) { bd = d; best = n; }
      for (const e of n.edges) if (!seen.has(e.to)) { seen.add(e.to); list.push(e.to); }
    }
    return best;
  }
}

const TIER = { pistol: 1, smg: 2, shotgun: 2.5, rifle: 3, lmg: 3.5, sniper: 3.2 };
export const gunTier = (def) => (def ? TIER[def.cls] ?? 1 : 0) + (def && def.damage > 60 && def.cls === 'pistol' ? 0.8 : 0);

const AIM_WANDER = 0.06;   // how far a bot's hand wanders off (rad, on NORMAL)

// Skills that only work up close, and how close: a bot with one of these ready goes in to that, not hanging back.
const SKILL_REACH = { reap: 120, fang: 260, blaze: 150, chidori: 210, steal: 125, galaxy: 210, decoy: 230, cloak: 300, judge: 260 };
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
      skillT: rand(1, 3), lost: null, hopT: rand(6, 12),   // skillT: a beat before it thinks of its skill again; lost: where a foe vanished
      holdT: 0, dj: false,         // holding a jump down for a full one (and a second in the air, if it has to go higher)
      tries: null, smash: null, smashT: 0, leave: new Map(),   // tries: the prop in its way and how often it's jumped at it; smash: one it's breaking up, for how much longer; leave: ones it's given up on (-> till when)
      padWas: 0,                   // (how long a jump pad's throw had to run, a moment ago)
      shotT: 0,                    // a beat between single shots
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
    for (const k of ['repath', 'nadeT', 'rollT', 'punchT', 'targetT', 'pauseT', 'lookT', 'burstT', 'spotT', 'biasT', 'skillT', 'hopT', 'shotT']) this[k] -= dt;
    if (this.biasT <= 0) this.rebias();

    // a cloaked fighter isn't seen at all - unless it's right up against the bot
    const unseen = (o) => o.hidden && !o.glimpsed && !f.adaptSees?.(o) && Math.hypot(o.x - f.x, o.y - f.y) > 22;   // (a cloak glitching shows them for a moment; adapted to it, it doesn't hide them)
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
    const aimY = t ? (t.roll ? t.y - 7 : t.y - 8) : 0;
    const dist = t ? Math.hypot(t.x - f.x, aimY - s.y) : Infinity;
    this.seen = vis ? this.seen + dt : 0;
    this.unseen = vis ? 0 : (this.unseen ?? 9) + dt;
    // the gun, while it has ammo (cloaked: the knife, for a stab) - and not one of a sort its target's adapted to (its
    // shots would do nothing): fists and blades for them, then
    const w0 = f.cloak ? null : f.bestGun(), w = w0 && this.target?.adaptedTo?.('gun:' + w0.def.cls) ? null : w0, armed = !!w;
    const hpK = f.hp / f.maxHp;

    // ---- what to do ----
    const pick = (pred, range) => {
      // (the one it's already on its way to: still that one, a bit further than it'd set out for - someone
      // seen or lost a moment had it off after it, back, off...)
      const was = this.goalKey;
      if (was?.kind !== undefined && was.ready && pred(was) && G.pickups.includes(was) && !(this.skip.get(was) > G.time) && Math.hypot(was.x - f.x, was.y - f.y) < range * 1.6) return was;
      let best = null, bd = Infinity;
      for (const p of G.pickups) if (p.ready && pred(p) && !(this.skip.get(p) > G.time)) {
        const d = Math.hypot(p.x - f.x, p.y - f.y);
        if (d < bd) { bd = d; best = p; }
      }
      return best && bd < range ? best : null;
    };
    // nobody to fight right now: time to stock up (and already at it: on with it till someone's actually in sight)
    const calm = !this.target || (!vis && (this.mode === 'loot' || this.mode === 'heal'));
    const healthP = hpK < (calm ? 0.8 : 0.45) ? pick((p) => p.kind === 'health', calm ? 900 : 520) : null;
    // a gun better than what's in its slot (an empty slot: anything)
    const better = (def) => { const g = f.gunIn(f.slotFor(def)); return gunTier(def) > gunTier(g && (g.ammo > 0 || g.reserve > 0) ? g.def : null) + 0.4; };
    const gunP = pick((p) => p.kind === 'gun' && better(G.weapons[p.key]), calm ? 900 : armed ? 260 : 700);
    // bare fists: a melee weapon lying about is worth fetching
    const meleeP = f.melee.def.fists && !f.cloak ? pick((p) => p.kind === 'melee', calm ? 600 : armed ? 220 : 420) : null;
    let goal = null, key = null, fight = false, sprint = false;
    const losing = vis && hpK < 0.3 && t.hp / t.maxHp > hpK + 0.15;
    // (in a fight with them: still in it through a moment out of sight - a foe flickering in and out of view behind
    // a pillar had it off after the gun, back to the fight, off again, turning round each time)
    const inSight = vis || (this.mode === 'fight' && this.unseen < 0.6 && !!t);
    if (healthP && !(vis && dist < 110)) { goal = nav.nodeBelow(healthP.x, healthP.y); key = healthP; sprint = vis; this.mode = 'heal'; }
    else if (gunP && (!armed || !inSight)) { goal = nav.nodeBelow(gunP.x, gunP.y); key = gunP; sprint = !armed; this.mode = 'loot'; }
    else if (meleeP && !(inSight && armed)) { goal = nav.nodeBelow(meleeP.x, meleeP.y); key = meleeP; this.mode = 'loot'; }
    else if (armed && t && (vis || (this.mode === 'retreat' && this.unseen < 1.2)) && ((hpK < 0.3 && t.hp / t.maxHp > hpK + 0.15) || ((w.reloading || w.ammo <= 0) && dist < 200))) {
      // (out of sight is what it was after: there a moment, not straight back round the corner into them)
      // back off out of sight to patch up / reload - and once it is, stay put (somewhere else picked out of
      // sight, then somewhere else again, had it up the ladder and down again)
      const hid = !vis && this.mode === 'retreat' && f.onGround && nav.nodeAt(f.x, f.y);
      if (hid) { this.spot = hid; this.spotT = Math.max(this.spotT, 0.3); this.spotFor = 'retreat'; }
      else if (!this.spot || this.spotT <= 0 || this.mode !== 'retreat') { this.spot = this.coverFrom(t, true); this.spotT = 2.5; this.spotFor = 'retreat'; }
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
    // a skill ready that only works up close (a dash, a stab, a hack, a black hole where they stand...): in at them, to
    // its reach, rather than hanging back where its gun's happy
    const skillReach = SKILL_REACH[f.usingSkill];
    if (skillReach && t && f.skillCD <= 0 && !(f.hackedT > 0) && !f.skillBusy && !losing && this.mode !== 'heal' && this.mode !== 'loot' && this.mode !== 'retreat'
      && dist > skillReach * (this.mode === 'fight' ? 1.05 : 0.85) && (vis || this.known.has(t))) {
      const n = nav.nodeAt(t.x, t.y, t.onLadder) ?? nav.nodeBelow(t.x, t.y);
      if (n) { goal = n; key = t; fight = false; sprint = true; this.mode = 'close'; }
    }
    // the mode's: a flag to take or bring home, a tag - urgent, before anything but a fight
    // it's in the middle of and losing; otherwise when there's nobody to shoot at
    const obj = G.objective?.(f), held = this.mode === 'retreat' || (this.mode === 'heal' && !!healthP);
    let onObj = false;
    this.obj = obj;
    if (obj && !held && (obj.urgent || (!fight && !(vis && armed) && this.mode !== 'loot'))) {
      if (obj.hunt?.alive) this.known.set(obj.hunt, { x: obj.hunt.x, y: obj.hunt.y, t: G.time });
      const there = Math.abs(obj.x - f.x) <= obj.r && Math.abs(obj.y - f.y) < 20;
      const n = there ? null : nav.nodeAt(obj.x, obj.y - 2) ?? nav.nodeBelow(obj.x, obj.y - 4);
      if (n) { goal = n; key = 'obj'; fight = false; sprint = obj.urgent || Math.hypot(obj.x - f.x, obj.y - f.y) > 160; this.mode = 'obj'; onObj = true; }
      else if (there) { goal = nav.nodeAt(f.x, f.y, f.onLadder) ?? nav.nodeBelow(f.x, f.y - 4); key = 'obj'; this.mode = 'obj'; onObj = true; }   // (there: it stays, and fights from there)
    }
    if (!goal && !fight && !onObj) {
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
      this.aimErr *= Math.exp(-1.6 * this.skill * dt);
      const lead = ((t.vx * dist) / (w?.def.bulletSpeed ?? 700)) * 0.5;
      // a hand that wanders: it comes on to them and drifts off again, so some shots go home and some don't (the
      // better the bot, the less it wanders)
      const wander = (Math.sin(G.time * 1.9 + this.aggro * 20) + 0.6 * Math.sin(G.time * 4.3 + this.aggro * 50)) * AIM_WANDER / Math.pow(this.skill, 1.6);
      const want = Math.atan2(aimY - s.y, t.x + lead - s.x) + this.aimErr + wander + rand(-0.025, 0.025);
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
    if (armed && vis && this.seen > this.react && !f.phantom) {
      const range = w.def.cls === 'shotgun' ? 170 : (w.def.range ?? 520);
      if (this.burstT <= -0.15 && Math.random() < dt * 4) {
        this.burstT = w.def.auto ? rand(0.3, 0.8) : rand(0.5, 1.2);
        this.aimErr = rand(-0.14, 0.14) / this.skill;   // (each burst: back on to them from where its hand has got to)
      }
      if (dist < range && Math.abs(this.aimErr) < 0.15 && this.burstT > 0) {
        if (w.def.auto && !w.def.burst) c.fire = true;
        else if (this.shotT <= 0) {
          // a shot at a time, with a beat between - a long one, and the aim to find again, after a sniper's
          const sniper = w.def.cls === 'sniper';
          c.fire = true;
          this.shotT = (sniper ? rand(1.1, 2) : rand(0.25, 0.7)) / this.skill;
          this.aimErr = rand(-0.1, 0.1) / this.skill;
        }
      }
    }
    // a drum that'd go up right beside it, in the way of the shot: not that shot (it took itself out with them)
    if (c.fire && c.aim !== null) {
      const ax = Math.cos(c.aim), ay = Math.sin(c.aim);
      for (const p of G.props) {
        if (p.dead || !p.explosive) continue;
        const px = p.x - s.x, py = p.y - p.h / 2 - s.y, along = px * ax + py * ay;
        if (along > -4 && along < Math.min(dist, 100) && Math.abs(px * ay - py * ax) < p.w / 2 + 6) { c.fire = false; break; }
      }
    }
    if (w && w.ammo <= 0 && w.reserve > 0) c.reload = true;
    if (w && !vis && w.ammo < w.magSize * 0.5 && w.reserve > 0) c.reload = true;

    // which slot: the best gun with ammo, otherwise the melee weapon / fists
    const slot = armed ? f.slotFor(w.def) : 1;
    c.slot = !f.cloak && !f.quick && slot !== f.slot ? slot : 0;   // (not in the middle of a quick melee: pulled straight back to the gun, the blow never landed and the arms flickered)
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
      if (!this.spot || this.spotT <= 0 || this.mode !== 'retreat') { this.spot = this.coverFrom(t, true); this.spotT = 2; this.spotFor = 'retreat'; }
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
      const ga = Math.atan2(aimY - s.y - dist * 0.35, t.x - s.x), mx = s.x + Math.cos(ga) * dist * 0.5, my = s.y + Math.sin(ga) * dist * 0.5;
      // (only with room for the lob: under a low ceiling it came straight back down at its feet)
      if (G.los(s.x, s.y, mx, my) && G.los(mx, my, t.x, t.y - 12)) {
        c.grenade = true;
        c.aim = ga;
      }
      this.nadeT = rand(7, 13);
    }
    // dodge when shot at
    if (vis && !k && t.lastFireT < 0.15 && this.rollT <= 0 && f.onGround && Math.random() < 0.04) {
      c.roll = true;
      c.move = Math.random() < 0.5 ? -1 : 1;
      this.rollT = rand(2, 4);
    }

    // the skill: Q when it's worth it, and whatever it wants pressed while it's going - and of its feet: at them, or away
    const plan = this.useSkill(c, t, vis, dist, hpK, enemies);
    if (plan === 'chase' && t) {
      goal = nav.nodeAt(t.x, t.y, t.onLadder) ?? nav.nodeBelow(t.x, t.y - 4) ?? goal; key = t; fight = false; sprint = true;
    } else if (plan === 'away' && t) {
      if (!this.spot || this.spotFor !== 'retreat' || this.spotT <= 0) { this.spot = this.coverFrom(t, true); this.spotT = 2; this.spotFor = 'retreat'; }
      goal = this.spot ?? goal; key = 'retreat'; fight = false; sprint = true;
    }
    // the purple card: it's safe only until it attacks - it holds its fire and gets out of there, or round to a better place
    if (f.phantom) { c.fire = false; c.melee = false; c.grenade = false; }
    // in wraith form itself: nothing that would end it. And no wasting shots on someone else's: they go through.
    if (f.wraith || t?.wraith || t?.phase || t?.jump) { c.fire = false; c.melee = false; c.grenade = false; c.throwWeapon = false; }   // (nor at someone in the other place, or gone to light)
    // into a deflect field: every shot comes back - it holds its fire till the blade's drawn
    if (t?.deflect?.phase === 'guard' && Math.hypot(t.x - f.x, t.y - f.y) < 360) c.fire = false;
    if (f.wraith) c.roll = false;
    // a shield up close is about to go off: not stood right next to it, if it can shoot from further off
    this.backOff = !!(t && t.barrier && armed && vis && dist < 80 && t.barrier.t < 2.5);

    if (fight && f.onLadder) { fight = false; goal = nav.nodeAt(t.x, t.y, t.onLadder) ?? nav.nodeBelow(t.x, t.y); key = t; this.mode = 'hunt'; }
    // the blue card: it runs (it's cheap); the green: it keeps out of it while it heals, if it's hurt
    if (f.card?.on && f.card.kind === 'blue') sprint = true;
    if (f.card?.on && f.card.kind === 'green' && hpK < 0.5 && vis) { this.spot = this.spot && this.mode === 'retreat' && this.spotT > 0 ? this.spot : this.coverFrom(t, true); this.spotT = Math.max(this.spotT, 1); this.spotFor = 'retreat'; goal = this.spot ?? goal; key = 'retreat'; fight = false; this.mode = 'retreat'; sprint = true; }
    // (and red: it stays in the fight whatever its health - that's what it's for)
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
    if (this.backOff && f.onGround && !c.roll) c.move = -Math.sign(t.x - f.x) || c.move;
    if (this.mode === 'search' && f.onGround && c.move && this.hopT <= 0 && !this.path[0]?.edge.kind.match(/drop|climb/)) {
      this.hopT = rand(8, 16);
      if (this.safeAhead(c.move)) { c.jump = true; this.holdT = Math.random() < 0.5 ? 0.4 : 0; }
    }
    if (!fight) { this.obstacles(dt, c); this.unjitter(dt, c); this.reach(dt, c, key); }
    // (going at them with something in hand, on their floor and near: straight in, whatever the route says)
    if (plan === 'chase' && t && vis && f.onGround && Math.abs(t.y - f.y) < 24 && Math.abs(t.x - f.x) < 140 && !c.roll) { c.move = Math.sign(t.x - f.x) || 1; c.sprint = true; }
    // a grenade about to go off close by - anyone's, its own too (thrown at someone close, it walked on to it
    // making for its next spot): away from it
    const nade = G.grenades?.find((g) => g.kind !== 'impact' && g.t < 1.3 && Math.abs(g.x - f.x) < 85 && Math.abs(g.y - (f.y - 10)) < 60);
    if (nade && f.onGround && !f.onLadder && !c.roll) { c.move = Math.sign(f.x - nade.x) || 1; c.sprint = f.stamina > 20; }
    this.dodge(c);
    this.jumpThrough(c);
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
    if (f.hook && f.hook.state !== 'back') c.jump = false;   // (on the grapple line: a jump lets go of it)
    // Turned round just now: it doesn't turn straight back. (Someone right overhead or crossing it had it
    // flipping from side to side every moment.) It's a beat before it can turn on them and shoot.
    this.turnT -= dt;
    if (c.aim !== null && !f.roll && !this.smash) {   // (breaking something up: it faces that, and stays facing it)
      const side = Math.cos(c.aim);
      if (Math.abs(side) > 0.15 && Math.sign(side) !== f.facing) {
        if (this.turnT > 0) { c.aim = Math.PI - c.aim; c.target = null; c.fire = false; if (SKILLS[f.usingSkill]?.aim !== 'self') c.skill = false; }   // (not a skill sent the wrong way)
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
    const G = this.game, p = this.smash && !this.smash.dead ? this.smash : (c.move && f.onGround ? this.propAhead(Math.sign(c.move)) : null);
    if (!p) { this.smash = null; return; }
    if (this.leave.get(p) > G.time) { this.smash = null; return; }
    const b = p.box, rise = f.y - b.t, dir = Math.sign(c.move) || Math.sign(p.x - f.x);
    // only what's on the way: the next step of the route past it (not a ladder or a drop this side of it)
    const step = this.path[0], tx = step && (step.node.cx + 0.5) * T;
    const offWay = step && (step.edge.kind === 'climb' || step.edge.kind === 'drop' || (dir > 0 ? tx < b.l - 2 : tx > b.r + 2));
    // not what's in the way any more (the route's changed), or too much for it: left be
    if (this.smash === p && ((offWay && this.mode !== 'loot') || (this.smashT -= dt) <= 0)) {
      this.smash = null;
      this.leave.set(p, G.time + 8);
      this.tries = null;
      this.repath = 0;
      return;
    }
    if (this.smash !== p && offWay) return;
    if (this.tries?.p !== p) this.tries = { p, n: 0 };
    if (this.smash === p || rise > 92 || this.tries.n >= 2) {
      if (this.smash !== p) this.smashT = 4;
      this.smash = p;
      const dir = Math.sign(p.x - f.x) || f.facing;
      // right up to it - not pressed against it, nor back and forth at the edge of its reach - and turned
      // to it the whole time, not only at each blow: between blows it looked the way it was going, and shook
      const gap = Math.abs(p.x - f.x) - p.w / 2;
      c.move = gap > 12 ? dir : 0;
      c.jump = false;
      c.fire = false;
      c.aim = Math.atan2(Math.max(b.t + 6, f.y - 22) - (f.y - 14), p.x - f.x);
      c.target = null;
      this.aim = c.aim;
      // out with the melee weapon (or fists) and keep at it till it's broken - not the quick melee off the gun: that put
      // the gun straight back after every blow, and out came the melee again a moment later, the arms flickering
      c.slot = f.slot !== 1 ? 1 : 0;
      c.melee = false;
      if (f.slot === 1 && gap < 16) c.fire = true;
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
      if (over && this.lootT > 1 && this.smash !== over) { this.smash = over; this.smashT = 4; }
    }
    // (where it was going and still not got it: not stood about waiting, the time's better spent elsewhere)
    if (this.lootT > 7 || (this.lootT > 2 && !this.path.length && f.onGround && !this.smash)) { this.skip.set(key, G.time + 12); this.lootT = 0; this.repath = 0; }
  }

  // Q, when it's worth it - each skill has its moment (BOT_SKILLS, below). While one's going: what it wants pressed for
  // it - and returned, what it wants of the bot's feet ('chase': at them; 'away': out of their sight; or nothing).
  useSkill(c, t, vis, dist, hpK, enemies) {
    const f = this.f, G = this.game, k = f.usingSkill, B = BOT_SKILLS[k];   // (its own, or one it's taken)
    if (!B || !f.alive || f.hackedT > 0) return null;   // (hacked: Q does nothing, and it knows it)
    const s = { b: this, f, G, c, t, vis, dist, hpK, enemies, aimed: vis && Math.abs(this.aimErr) < 0.2, near: enemies.filter((o) => Math.hypot(o.x - f.x, o.y - f.y) < 280) };
    if (f.skillBusy) return B.during?.(s) ?? null;   // (not a second Q while one's still going: it'd cut the cloak short, say - unless the skill wants one)
    if ((k === 'grapple' ? !(f.charges > 0) : f.skillCD > 0) || this.skillT > 0 || f.onLadder || f.roll) return null;
    this.skillT = rand(0.4, 0.9) / this.skill;   // (it thinks it over now and then, not every frame)
    if (B.use(s)) c.skill = true;
    return null;
  }

  // Something of a foe's skill coming its way (skills.js: danger): out of it. A line across the floor: up out of it as it
  // arrives (a jump, the second one at the top); one up or down the screen, or a circle: aside, the nearer way out.
  dodge(c) {
    const f = this.f;
    if (!f.alive || f.onLadder || f.skillBusy && (f.ea || f.xc || f.jc || f.reap)) return;   // (rooted in one of its own: nothing to be done)
    const list = dangersTo(f, this.game);
    if (!list.length) return;
    list.sort((p, q) => p.eta - q.eta);
    const { d, eta } = list[0];
    if (eta > 1.1) return;
    if (d.line) {
      const ux = Math.cos(d.a), uy = Math.sin(d.a);
      if (Math.abs(uy) < 0.55) {
        if (f.onGround && eta < 0.32 && !c.roll) { c.jump = true; this.holdT = 0.55; this.dj = true; }
        return;
      }
      const side = Math.sign((f.x - d.x) * uy - (f.y - 14 - d.y) * ux) || 1;   // (which side of the line it's on)
      c.move = Math.sign(-uy * side) || 1;
    } else c.move = Math.sign(f.x - d.x) || (Math.random() < 0.5 ? -1 : 1);
    c.sprint = f.stamina > 15;
    if (f.onGround && !this.safeAhead(c.move)) c.move = 0;   // (not off into the acid to get out of it)
  }

  // The grapple, to get out of a fight going badly: a line up and away from them, to somewhere it bites (a ceiling, a
  // ledge's underside, a wall) well up off the floor - out of their sight if it can be. The aim for it, or null.
  grappleAway(t) {
    const f = this.f, G = this.game, L = G.level, s = f.lineFrom(), side = -Math.sign(t.x - f.x) || 1;
    let best = null, bs = -Infinity;
    for (const k of [-0.25, 0, 0.3, 0.6, 0.9, 1.15]) {
      const a = -Math.PI / 2 + side * k, ux = Math.cos(a), uy = Math.sin(a);
      let hit = null;
      for (let r = 20; r < GRAPPLE_RANGE * 0.95; r += 4) if (L.solidAt(s.x + ux * r, s.y + uy * r)) { hit = r; break; }
      if (!hit || hit < 60) continue;
      const x = s.x + ux * (hit - 12), y = s.y + uy * (hit - 12);
      if (y > f.y - 50) continue;   // (not much of a way up)
      const score = (f.y - y) * 0.5 + Math.abs(x - t.x) * 0.3 + (G.los(t.x, t.y - 14, x, y) ? 0 : 90) + Math.random() * 10;
      if (score > bs) { bs = score; best = a; }
    }
    return best;
  }

  wanderReached() {
    const n = this.wander;
    return Math.abs((n.cx + 0.5) * T - this.f.x) < 10 && Math.abs((n.cy + 1) * T - this.f.y) < 10;
  }

  // A spot near by to fight from: behind a crate / drum if there's one between
  // it and the target, otherwise somewhere at a good range. away: one out of
  // the target's sight instead.
  coverFrom(t, away = false) {
    const f = this.f, G = this.game, nav = G.nav, here = nav.nodeAt(f.x, f.y, f.onLadder);
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
    // (the spot it had, kept till its time's up - not a new one every time it comes back to the fight. But not one
    // picked to get away from them (a retreat's), nor one it's since left well behind: it turned round for those)
    const far = this.spot && Math.abs((this.spot.cx + 0.5) * T - f.x) > 6 * T;
    if (!this.spot || this.spotT <= 0 || this.spotFor !== 'fight' || far) {
      this.spot = this.coverFrom(t);
      this.spotT = rand(1.2, 2.6);
      this.spotFor = 'fight';
    }
    this.mode = 'fight';
    this.path = [];
    if (this.spot) {
      const x = (this.spot.cx + 0.5) * T;
      if (!c.roll) c.move = this.burstT <= 0 ? this.toward(x, 4) : 0;
    }
    // shot at while moving to its next spot: now and then a jump to throw their aim (never a hop on the spot)
    if (f.onGround && c.move && t.lastFireT < 0.2 && Math.random() < 0.012 && this.safeAhead(c.move)) { c.jump = true; this.holdT = 0.4; }
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
      // (a jump pad's throw: straight up until it's clear - see follow. Right over where it's coming down: hands
      // off - steering for the very middle, it went left, right, left all the way up)
      if (j.edge.kind !== 'pad') c.move = Math.abs(jx - f.x) <= 6 ? 0 : Math.sign(jx - f.x);
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

  // Thrown by a jump pad: it's never seen standing on one (it's up in the air again the moment it's down), so the
  // route's worked out from the pad here and now. It goes on where the route goes, or anywhere else it can get to.
  padThrow(goal) {
    const f = this.f, nav = this.game.nav, now = this.game.time, cx = Math.floor(f.x / T), cy = Math.floor((f.y - 1) / T);
    let pad = null;
    for (let d = 0; d <= 4 && !pad; d++) if (nav.pads.has(nav.id(cx, cy + d))) pad = nav.nodes.get(nav.id(cx, cy + d));
    if (!pad) return;
    // (came down on it again: that throw was no good)
    if (this.jumping?.edge.kind === 'pad') this.failed.set(this.jumping.edge, now + 15);
    const avoid = new Set();
    for (const [e, until] of this.failed) if (until > now) avoid.add(e);
    const route = goal && goal !== pad ? nav.path(pad, goal, this.bias, avoid, nav.propCost(this.game.props, now)) : null;
    const ways = pad.edges.filter((e) => !avoid.has(e)), e = route?.[0]?.edge ?? ways[Math.floor(Math.random() * ways.length)] ?? pad.edges[0];
    if (!e) { this.path = []; this.jumping = null; return; }
    this.path = route?.length ? route : [{ node: e.to, edge: e, from: pad }];
    this.jumping = { edge: e, t: now };
    this.goal = goal;
    this.repath = rand(1.2, 2);
  }

  // Follow the route to a node, pressing whatever each step needs.
  follow(dt, c, goal) {
    const f = this.f, nav = this.game.nav;
    if (f.padT > this.padWas) this.padThrow(goal);
    this.padWas = f.padT;
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
      // nothing left to do but it's hanging on a ladder: off it - to the side, onto the floor it's level with
      // (at the top: down to the bottom, it was somewhere else again, and back up it went, and down...),
      // or down to the floor
      if (f.onLadder) {
        const fy = Math.round(f.y / T), cx = Math.floor(f.x / T), gx = goal ? (goal.cx + 0.5) * T : f.x;
        if (Math.abs(f.y - fy * T) < 3) {
          // (a side picked once and kept: picked by where the goal is, right on top of it, it went left, right, left)
          if (!(this.offSide?.until > this.game.time)) {
            const s0 = Math.abs(gx - f.x) > 8 ? Math.sign(gx - f.x) : Math.random() < 0.5 ? -1 : 1;
            this.offSide = { until: this.game.time + 1, s: nav.stand(cx + s0, fy - 1) ? s0 : nav.stand(cx - s0, fy - 1) ? -s0 : 0 };
          }
          const s = this.offSide.s;
          if (s) { c.move = s; c.up = f.y > fy * T + 0.5; c.down = f.y < fy * T - 0.5; return; }
        }
        c.down = true;
        return;
      }
      // there (or no way): face the goal and close the last bit
      if (goal) c.move = this.toward((goal.cx + 0.5) * T, 4);
      return;
    }
    const e = step.edge, n = step.node, tx = (n.cx + 0.5) * T, ty = (n.cy + 1) * T;
    const sx = (step.from.cx + 0.5) * T;
    switch (e.kind) {
      case 'walk':
      case 'fall': {
        // (the step after goes on the same way: on, no slowing for the middle of this one - running past it, in
        // the air off a bump, it turned back for it and then round again)
        const nx = this.path[1], nd = nx && (nx.edge.kind === 'walk' || nx.edge.kind === 'fall') ? Math.sign(nx.node.cx - n.cx) : 0, d = tx - f.x;
        c.move = nd && (Math.sign(d) === nd || Math.abs(d) < 8) ? nd : Math.abs(d) > (f.onGround ? 2 : 6) ? Math.sign(d) : 0;
        if (f.onLadder) {
          // level the feet with the floor first, or the floor's edge blocks stepping off
          c.move = Math.sign(tx - f.x);
          c.up = f.y > ty + 0.5;
          c.down = f.y < ty - 0.5;
        }
        break;
      }
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
          c.jumpHeld = true;   // (held all the way up, as the route worked it out (Nav.arc): let go at the height it was going to, a jump over a wall to the same floor was a hop into the wall)
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
  }

  // A planned jump, while it's in the air - whatever it's doing meanwhile (a foe seen halfway over had it let go of
  // the jump: a short hop, short of the far side). And how it came down.
  jumpThrough(c) {
    const f = this.f, j = this.jumping;
    if (!j) return;
    const down = f.onGround || f.onLadder;
    if (!down) {
      j.air = true;
      const e = j.edge;
      if (e.kind !== 'jump') return;
      const tx = (e.to.cx + 0.5) * T, ty = (e.to.cy + 1) * T;
      c.jumpHeld = true;
      if ((e.dy <= -3 && f.y > ty) || (Math.abs(e.dx) >= 3 && Math.abs(tx - f.x) > 24)) if (f.vy > -60 && f.airJumps > 0) { c.jump = true; c.jumpHeld = true; }
      return;
    }
    if (!j.air) {
      // (never got off the ground - the jump was taken back, it was busy: nothing was tried)
      if (this.game.time - j.t > 0.4) this.jumping = null;
      return;
    }
    // down: if it didn't end up where it meant to (bonked a ceiling, fell short) that jump's no good for a while -
    // a step or two along the same floor is near enough (on from there)
    const here = this.game.nav.nodeAt(f.x, f.y, f.onLadder), to = j.edge.to;
    if (here !== to) {
      if (!(here && here.cy === to.cy && Math.abs(here.cx - to.cx) <= 2)) this.failed.set(j.edge, this.game.time + 15);
      this.repath = 0;
    }
    this.jumping = null;
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
        this.spot = this.game.nav.nodeAt(f.x, f.y); this.spotFor = 'fight';
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

// ---------- the skills, as a bot uses them ----------
// For each skill: use(s) - Q now? (and whatever goes with it: where it's aimed, c.target for a point); during(s) - every
// moment while it's going: anything it wants pressed for it (a second Q, the lunge, the dash), and what it wants of its
// feet ('chase' / 'away'). s: { b (the bot), f, G, c, t (its target), vis, dist, hpK, enemies, near (within 280), aimed }.
// Every skill needs one - a new skill without one is said in the console (skills.js: checkSkills).
const chestOf = (v) => ({ x: v.x, y: v.y - 14 });
// where it'd put a point skill on t: where they are if it can see them, where it last did a moment ago if not
const pointOn = (s, lead = 0) => {
  const { b, G, t, vis } = s;
  if (!t) return null;
  if (vis) return { x: t.x + (t.vx ?? 0) * lead, y: t.y - 14 };
  const k = b.known.get(t);
  return k && G.time - k.t < 0.8 ? { x: k.x, y: k.y - 14 } : null;
};
export const BOT_SKILLS = {
  grapple: {
    // in to them, the line locked on, for the spin (and the blood back) - more often without a gun worth the name, at
    // someone low, or reloading; out of a fight going badly: up and away
    use(s) {
      const { b, f, c, t, vis, dist, hpK } = s;
      if (!t || !vis) return false;
      if (hpK < 0.35 && t.hp / t.maxHp > hpK) {
        const a = b.grappleAway(t);
        if (a === null) return false;
        c.aim = a;
        c.target = { x: f.x + Math.cos(a) * 160, y: f.y - 14 + Math.sin(a) * 160 };
        return true;
      }
      if (dist < 60 || dist > GRAPPLE_RANGE * 0.9 || t.barrier || t.untouchable || f.hookTarget() !== t) return false;
      const keen = !f.bestGun() || f.weapon?.def.cls === 'shotgun' || t.hp < 90 || !!t.weapon?.reloading || hpK < 0.7;
      return hpK > 0.25 && (keen || Math.random() < 0.3);
    },
  },
  cloak: {   // to slip away when it's losing, or to creep up for a stab
    use(s) { s.b.flee = s.hpK < 0.35; return (s.vis && s.hpK < 0.35) || (!!s.t && s.dist < 360 && s.hpK >= 0.35 && Math.random() < 0.6); },
  },
  decoy: { use: (s) => s.vis && s.dist < 260 && Math.random() < 0.6 },   // a double to take the heat (then round behind them, unseen)
  archery: { use: (s) => s.near.length >= 2 || (s.near.length === 1 && (s.vis || Math.random() < 0.3)) },   // the more in reach the better
  murasaki: { use: (s) => s.aimed && s.dist < 380 },   // the line of it at someone in sight
  blaze: { use: (s) => s.aimed && s.dist < 165 && Math.abs(s.t.y - s.f.y) < 50 },   // close enough to dash and hit
  galaxy: {   // where they stand
    use(s) {
      if (!s.vis || s.dist > 230) return false;
      s.c.target = { x: s.t.x, y: s.t.y - 12 };
      return true;
    },
  },
  vampire: {   // the bats go every way: best with someone close, better still with several, or when it needs the blood
    use: (s) => s.near.filter((o) => Math.hypot(o.x - s.f.x, o.y - s.f.y) < 170).length >= (s.hpK < 0.6 ? 1 : 2) || (s.vis && s.dist < 110),
  },
  fang: {
    // close enough for most of the fan to find them (and the sixth at them, to mark)
    use: (s) => s.aimed && s.dist < 330 && s.G.los(s.f.x, s.f.y - 17, s.t.x, s.t.y - 14),
    // someone marked: to them (through walls and all, untouchable on the way) - unless that's into several of them,
    // hurt. Nobody marked: home when that'll do something - one's in someone (it tears out), or someone's between them
    // and it (they go through them); left too long, home anyway.
    during(s) {
      const { f, G, c } = s, m = f.fang;
      if (!m || m.back || m.t < 0.3) return null;
      const mark = m.mark?.alive && !m.mark.vanish ? m.mark : null;
      if (mark) {
        const crowd = G.fighters.filter((o) => o !== mark && o.alive && G.foes(f, o) && Math.hypot(o.x - mark.x, o.y - mark.y) < 130).length;
        if (s.hpK > 0.35 || crowd === 0 || mark.hp < 70) c.skill = true;
        return null;
      }
      const sx = f.x, sy = f.y - 17;
      const between = (q, d) => {
        const dx = sx - d.x, dy = sy - d.y, L = Math.hypot(dx, dy) || 1, qx = q.x - d.x, qy = q.y - 14 - d.y, along = (qx * dx + qy * dy) / L;
        return along > 0 && along < L - 10 && Math.abs(qx * dy - qy * dx) / L < 12;
      };
      const mine = G.fangs?.filter((d) => d.owner === f && d.state !== 'back') ?? [];
      if (mine.some((d) => (d.state === 'in' && d.on?.alive) || G.fighters.some((q) => q.alive && !q.untouchable && G.foes(f, q) && between(q, d))) || m.t > 2.3) c.skill = true;
      return null;
    },
  },
  aurum: { use: (s) => s.aimed && s.dist > 110 && s.dist < 640 },   // someone in sight, far enough off that a sniper's the thing
  judge: {
    // someone within its reach - seen, or seen a moment ago behind a wall (walls no matter to it); more so at someone
    // nothing else can touch now (true damage, and the break ends it)
    use(s) {
      const { f, c, t } = s, p = pointOn(s, 0.3);
      if (!p || Math.hypot(p.x - f.x, p.y - (f.y - 14)) > JC_RANGE * 0.95) return false;
      if (!s.vis && !t.untouchable && !t.barrier && Math.random() < 0.5) return false;
      c.target = p;
      return true;
    },
    // the mark goes where it aims till the cut: kept on them
    during(s) { if (s.f.jc?.phase === 'stance') { const p = pointOn(s, 0.25); if (p) s.c.target = p; } return null; },
  },
  excal: { use: (s) => s.aimed && s.dist > 90 && s.dist < 650 && s.hpK > 0.3 },   // in sight, in line, and not hurting too much to stand there
  ea: { use: (s) => s.aimed && s.dist > 90 && s.dist < 520 && s.hpK > 0.3 },   // the same, and not far: it's weaker further out
  reap: { use: (s) => s.vis && s.dist < 130 && s.f.onGround },   // someone in its reach, feet on the floor: it does the rest
  jumper: {
    use: (s) => s.hpK < 0.5 && s.f.hurtT < 1,   // to get out of it, hurt: into the other place
    // away from them a while, then the way back opened behind
    during(s) {
      if (!s.f.phase) return null;
      s.c.fire = false;
      s.c.skill = s.f.phase.age > 2;
      return 'away';
    },
  },
  steal: {   // someone in reach with a skill worth having
    use(s) {
      const { t } = s;
      if (!s.vis || s.dist > 140 || !t.usingSkill || t.usingSkill === 'grapple' || t.usingSkill === 'steal') return false;
      s.c.target = chestOf(t);
      return true;
    },
  },
  octo: { use: (s) => s.vis && s.dist < 420 },   // a fight on: four more guns in it
  chidori: {
    use: (s) => s.vis && s.dist < 260 && Math.abs(s.t.y - s.f.y) < 48,   // someone close enough to run down, on about the same level
    // in hand: at them, and the lunge (the once) when they're in its reach, in sight
    during(s) {
      const { f, c, t, vis, dist } = s, m = f.chidori;
      if (!m || !t) return null;
      c.fire = false;
      c.aim = Math.atan2(t.y - 14 - (f.y - 14), t.x - f.x);
      c.target = chestOf(t);
      if (m.phase === 'hold' && !m.lunged && vis && dist < CHIDORI_REACH * 0.85 && s.G.los(f.x, f.y - 14, t.x, t.y - 14)) c.skill = true;
      return m.phase === 'charge' || m.phase === 'hold' ? 'chase' : null;
    },
  },
  deflect: {
    use: (s) => s.vis && s.t.lastFireT < 0.35 && s.dist < 300 && !!s.t.gun,   // shot at from in front: it turns them back (and dashes on them at the end)
    during(s) { if (s.f.deflect && s.t) { s.c.aim = Math.atan2(s.t.y - 14 - (s.f.y - 14), s.t.x - s.f.x); s.c.target = chestOf(s.t); } return null; },
  },
  sande: {   // only moments: when someone's close enough to make them count - or to get out of it, hurt
    use: (s) => (s.vis && s.dist < 260 && (!!s.f.bestGun() || s.dist < 90) && s.f.stamina >= 60) || (s.hpK < 0.35 && s.f.hurtT < 0.5 && s.f.stamina >= 30),
  },
  shield: {   // being shot at, or about to walk into it: it's only so much, and it slows it
    use: (s) => (s.f.hurtT < 0.5 && s.hpK < 0.85) || (s.vis && s.t.lastFireT < 0.3 && s.dist < 260 && s.hpK < 0.7),
  },
  cards: { use: (s) => (s.vis && s.dist < 340) || (s.hpK < 0.5 && s.f.hurtT > 1) },   // a fight going on, or when it's getting hurt
  hack: {   // worth it when it cuts something off: someone in reach with a skill going - or two at once, or close and it's in trouble
    use(s) {
      const inReach = s.enemies.filter((o) => Math.hypot(o.x - s.f.x, o.y - s.f.y) < 150);
      return inReach.some((o) => o.skillBusy || o.stolen) || inReach.length >= 2 || (inReach.length === 1 && s.hpK < 0.5);
    },
  },
  lock: { use: (s) => s.vis && !!s.f.bestGun() && s.dist < 360 },   // someone in sight to shoot at, with a gun to do it
  demon: { use: (s) => s.f.stamina >= 60 && s.f.onGround && ((s.vis && s.dist < 320) || s.near.length >= 2) },   // a fight coming, and stamina for three swords
  adapt: {
    // whatever's just done something to it, while it's still at it: adapted to (a skill or a blast at once - they're
    // what hurt; a gun once it's been hit a while by it, or it's getting low)
    use(s) {
      const { f, G, hpK } = s, h = f.lastHarm;
      if (!h || G.time - h.at > 3 || f.adaptedTo(h.key)) return false;
      return !h.key.startsWith('gun:') || hpK < 0.75 || f.hurtT < 0.3;
    },
  },
};
