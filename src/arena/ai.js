// The bots. The level is turned into a graph of places a fighter can stand
// (and ladder rungs it can hang on), joined by the moves that get between
// them: walking, stepping off an edge, dropping through a catwalk, climbing,
// and jumps (with the double jump for the high ones). A* over that gives a
// route; the bot then presses the buttons each step of it needs.
//
// On top of that: pick someone to fight, get a gun if it hasn't one, shoot
// when it can see its target (with a reaction delay and an aim that settles),
// keep its distance, dodge-roll now and then, lob a grenade, and never walk
// into the acid.

import { T, SOLID, PLAT, LADDER, ACID } from './level.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick2 = (l) => l[(Math.random() * l.length) | 0];

export class Nav {
  constructor(level) {
    this.L = level;
    this.nodes = new Map();   // id -> { id, cx, cy, ladder, edges: [{ to, kind, cost, dy }] }
    for (let cy = 0; cy < level.h; cy++) for (let cx = 0; cx < level.w; cx++) {
      if (this.stand(cx, cy) || this.ladder(cx, cy)) this.nodes.set(this.id(cx, cy), { id: this.id(cx, cy), cx, cy, ladder: this.ladder(cx, cy) && !this.stand(cx, cy), edges: [] });
    }
    for (const n of this.nodes.values()) this.link(n);
    this.standable = [...this.nodes.values()].filter((n) => !n.ladder);
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
    // jumps
    for (let dy = -5; dy <= 3; dy++) for (let dx = -5; dx <= 5; dx++) {
      if (!dx && dy >= 0) continue;
      if (dy < 0 && Math.abs(dx) > 4) continue;
      if (dy >= 0 && Math.abs(dx) < 2) continue;
      const tx = cx + dx, ty = cy + dy;
      if (!this.stand(tx, ty) || !this.jumpClear(cx, cy, tx, ty)) continue;
      // a level (or downward) jump only where there's something to jump: a gap or an
      // obstacle on the way - along an unbroken floor it just walks
      if (dy >= 0) {
        let broken = false;
        for (let x = cx + Math.sign(dx); x !== tx && !broken; x += Math.sign(dx)) if (!this.stand(x, cy)) broken = true;
        if (!broken) continue;
      }
      // never cheaper than walking the same distance
      add(tx, ty, 'jump', 2 + Math.abs(dx) * 1.1 + Math.max(0, -dy) * 0.9);
    }
  }

  // Rough room check for a jump arc: up the start column, across the top, down onto the target.
  jumpClear(cx, cy, tx, ty) {
    const L = this.L, top = Math.min(cy, ty) - 2;
    const open = (x, y) => L.get(x, y) !== SOLID;
    for (let y = cy; y >= top; y--) if (!open(cx, y)) return false;
    const s = Math.sign(tx - cx);
    for (let x = cx; x !== tx + s; x += s) if (!open(x, top) || !open(x, top + 1)) return false;
    for (let y = top; y <= ty; y++) if (!open(tx, y)) return false;
    return true;
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

  // bias: extra cost for stepping onto some nodes (a bot's own taste in routes)
  // avoid: edges to steer clear of (jumps this bot has failed lately)
  path(from, to, bias = null, avoid = null) {
    if (!from || !to) return null;
    if (from === to) return [];
    const open = [from], g = new Map([[from, 0]]), came = new Map(), h = (n) => Math.abs(n.cx - to.cx) + Math.abs(n.cy - to.cy) * 1.2;
    const f = new Map([[from, h(from)]]), closed = new Set();
    let guard = 0;
    while (open.length && guard++ < 4000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f.get(open[i]) < f.get(open[bi])) bi = i;
      const cur = open.splice(bi, 1)[0];
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
        const ng = g.get(cur) + e.cost + (bias?.get(e.to) ?? 0) + (avoid?.has(e) ? 60 : 0);
        if (ng >= (g.get(e.to) ?? Infinity)) continue;
        g.set(e.to, ng);
        f.set(e.to, ng + h(e.to));
        came.set(e.to, [cur, e]);
        if (!open.includes(e.to)) open.push(e.to);
      }
    }
    return null;
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
    for (const k of ['repath', 'nadeT', 'rollT', 'punchT', 'targetT', 'pauseT', 'lookT', 'burstT', 'spotT', 'biasT']) this[k] -= dt;
    if (this.biasT <= 0) this.rebias();

    const enemies = G.fighters.filter((o) => o.alive && G.foes(f, o));
    if (!enemies.length) return c;
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
    const t = this.target, vis = !!t && sees(t);
    const aimY = t ? (t.roll ? t.y - 7 : t.y - 12) : 0;
    const dist = t ? Math.hypot(t.x - f.x, aimY - s.y) : Infinity;
    this.seen = vis ? this.seen + dt : 0;
    const w = f.weapon, armed = !!w && (w.ammo > 0 || f.reserve > 0);
    const hpK = f.hp / f.maxHp;

    // ---- what to do ----
    const pick = (pred, range) => {
      let best = null, bd = Infinity;
      for (const p of G.pickups) if (p.ready && pred(p)) {
        const d = Math.hypot(p.x - f.x, p.y - f.y);
        if (d < bd) { bd = d; best = p; }
      }
      return best && bd < range ? best : null;
    };
    const healthP = hpK < 0.45 ? pick((p) => p.kind === 'health', 520) : null;
    const gunP = pick((p) => p.kind === 'gun' && gunTier(G.weapons[p.key]) > gunTier(armed ? w.def : null) + 0.4, armed ? 260 : 700);
    // bare fists: a melee weapon lying about is worth fetching
    const meleeP = f.melee.def.fists ? pick((p) => p.kind === 'melee', armed ? 220 : 420) : null;
    let goal = null, key = null, fight = false, sprint = false;
    const losing = vis && hpK < 0.3 && t.hp / t.maxHp > hpK + 0.15;
    if (healthP && !(vis && dist < 110)) { goal = nav.nodeBelow(healthP.x, healthP.y); key = healthP; sprint = vis; this.mode = 'heal'; }
    else if (gunP && (!armed || !vis)) { goal = nav.nodeBelow(gunP.x, gunP.y); key = gunP; sprint = !armed; this.mode = 'loot'; }
    else if (meleeP && !(vis && armed)) { goal = nav.nodeBelow(meleeP.x, meleeP.y); key = meleeP; this.mode = 'loot'; }
    else if (vis && armed && (losing || (w.reloading && dist < 200))) {
      // back off out of sight to patch up / reload
      if (!this.spot || this.spotT <= 0 || this.mode !== 'retreat') { this.spot = this.coverFrom(t, true); this.spotT = 1.5; }
      goal = this.spot; key = 'retreat'; sprint = true; this.mode = 'retreat';
    } else if (armed && vis && dist < (w.def.cls === 'shotgun' ? 150 : w.def.cls === 'sniper' ? 420 : 300)) fight = true;
    else if (t) {
      // go where it was last seen / heard (the long way round sometimes)
      const k = this.known.get(t);
      const n = nav.nodeAt(k.x, k.y) ?? nav.nodeBelow(k.x, k.y);
      if (n && (Math.abs(k.x - f.x) > 20 || Math.abs(k.y - f.y) > 20)) {
        goal = n; key = t; this.mode = 'hunt';
        sprint = Math.hypot(k.x - f.x, k.y - f.y) > 240 && this.aggro > 0.6;
      } else { this.known.delete(t); this.target = null; }
    }
    if (!goal && !fight) {
      // nothing to go on: wander the lab, pausing to look around
      if (this.mode !== 'search' || !this.wander || this.wanderReached()) {
        const spots = nav.standable.filter((n) => Math.abs(n.cx * T - f.x) > 96 && !(n.cy >= 23 && n.cx >= 15 && n.cx <= 32));
        this.wander = pick2(spots);
        this.pauseT = rand(0.4, 1.2);
      }
      this.mode = 'search';
      goal = this.wander;
      key = this.wander;
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
      // look where it's going; glance back now and then
      const dir = this.path[0] ? Math.sign((this.path[0].node.cx + 0.5) * T - f.x) || f.facing : f.facing;
      if (this.lookT <= 0 && Math.random() < dt * 0.3) this.lookT = rand(0.4, 0.9);
      const look = this.lookT > 0 ? -dir : dir;
      const want = look > 0 ? 0 : Math.PI;
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
    if (w && w.ammo <= 0 && f.reserve > 0) c.reload = true;
    if (w && !vis && w.ammo < w.magSize * 0.5 && f.reserve > 0) c.reload = true;

    // which slot: the gun if it has one with ammo, otherwise the melee weapon / fists
    c.slot = armed ? 2 : 1;
    // no gun: close in and hit them (combos with whatever's in slot 1)
    const reach = f.melee.def.reach + 2;
    if (t && !armed && vis) { goal = nav.nodeAt(t.x, t.y, t.onLadder) ?? goal; key = t; sprint = dist < 200; fight = false; }
    if (t && !armed && Math.abs(t.x - f.x) < reach && Math.abs(t.y - f.y) < 18) {
      c.fire = true;
      c.aim = Math.atan2(t.y - 14 - s.y, t.x - s.x);
    }
    // with a gun but someone right up close: a quick melee to knock it out of their hands
    if (t && armed && vis && Math.abs(t.x - f.x) < 18 && Math.abs(t.y - f.y) < 16 && this.punchT <= 0 && (t.lastFireT < 0.5 || Math.random() < 0.3)) {
      c.melee = true;
      c.fire = false;
      this.punchT = rand(0.5, 1.1);
      c.aim = t.x > f.x ? 0 : Math.PI;
    }
    // a grenade at someone in the open, not too close
    if (vis && f.grenades > 0 && this.nadeT <= 0 && dist > 80 && dist < 230 && f.onGround && Math.random() < 0.5) {
      c.grenade = true;
      c.aim = Math.atan2(aimY - s.y - dist * 0.35, t.x - s.x);
      this.nadeT = rand(7, 13);
    }
    // dodge when shot at
    if (vis && t.lastFireT < 0.15 && this.rollT <= 0 && f.onGround && Math.random() < 0.04) {
      c.roll = true;
      c.move = Math.random() < 0.5 ? -1 : 1;
      this.rollT = rand(2, 4);
    }

    if (fight && f.onLadder) { fight = false; goal = nav.nodeAt(t.x, t.y, t.onLadder) ?? nav.nodeBelow(t.x, t.y); key = t; }
    if (fight) this.duel(dt, c, t);
    else if (this.pauseT > 0 && this.mode === 'search' && !f.onLadder) { if (!c.roll) c.move = 0; }   // a moment to look around
    else {
      if (key !== this.goalKey) this.repath = 0;
      this.goalKey = key;
      const rolled = c.move;
      this.follow(dt, c, goal);
      if (c.roll) c.move = rolled;
      c.sprint = sprint && f.stamina > 30;
    }
    this.airControl(c);
    this.avoidAcid(c);
    this.unstick(dt, c);
    return c;
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
    if (!this.spot || this.spotT <= 0 || this.mode !== 'fight') {
      this.spot = this.coverFrom(t);
      this.spotT = rand(1.2, 2.6);
    }
    this.mode = 'fight';
    this.path = [];
    if (this.spot) {
      const x = (this.spot.cx + 0.5) * T;
      if (!c.roll) c.move = Math.abs(x - f.x) > 3 && this.burstT <= 0 ? Math.sign(x - f.x) : 0;
    }
    if (f.onGround && Math.random() < 0.006 && this.safeAhead(c.move || f.facing)) { c.jump = true; c.jumpHeld = true; }
  }

  // Is there floor (not acid) under the next step that way?
  safeAhead(dir) {
    const f = this.f, nav = this.game.nav, cx = Math.floor((f.x + Math.sign(dir) * 24) / T), cy = Math.floor((f.y - 1) / T);
    return nav.stand(cx, cy) || nav.land(cx, cy) !== null;
  }

  // In the air over the acid (knocked off, or a jump gone wrong): steer for the nearest floor, jump again.
  airControl(c) {
    const f = this.f, nav = this.game.nav;
    if (f.onGround || f.onLadder) return;
    const cy = Math.max(0, Math.floor((f.y - 1) / T));
    const doomed = (x) => nav.land(Math.floor(x / T), cy) === null && !nav.stand(Math.floor(x / T), cy);
    // on a planned jump (over the vat, say): keep going for where it's meant to land
    // while it's still up at that height - turning back is what made it hop on the spot
    const j = this.jumping, jx = j && (j.edge.to.cx + 0.5) * T, jy = j && (j.edge.to.cy + 1) * T;
    if (j && (f.vy < 0 || f.y < jy + 4)) {
      c.move = Math.sign(jx - f.x) || c.move;
      return;
    }
    if (!doomed(f.x + f.vx * 0.25)) return;
    // falling short: make for the nearest floor, the landing side first
    let best = null;
    const sides = j ? [Math.sign(jx - f.x) || 1, -(Math.sign(jx - f.x) || 1)] : [-1, 1];
    for (let d = 1; d < 12 && best === null; d++) for (const s of sides) if (best === null && !doomed(f.x + s * d * T)) best = s;
    if (best === null) return;
    c.move = best;
    if (f.airJumps > 0 && f.vy > -40) { c.jump = true; c.jumpHeld = true; }
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
    if (here && (this.repath <= 0 || !this.path.length || goal !== this.goal)) {
      this.goal = goal;
      const now = this.game.time, avoid = new Set();
      for (const [e, until] of this.failed) if (until > now) avoid.add(e); else this.failed.delete(e);
      this.path = nav.path(here, goal, this.bias, avoid) ?? [];
      this.repath = rand(0.45, 0.8);
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
      if (goal) c.move = Math.abs((goal.cx + 0.5) * T - f.x) > 3 ? Math.sign((goal.cx + 0.5) * T - f.x) : 0;
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
        else c.down = true;
        break;
      case 'jump': {
        const high = e.dy <= -3;
        if (f.onGround || f.onLadder) {
          // line up on the take-off spot, then go (a running start for long ones)
          const runUp = Math.abs(e.dx) >= 3 ? -Math.sign(e.dx) * 2 : 0;
          if (Math.abs(f.x - (sx + runUp)) > 5 && this.jumpedFrom !== step.from) c.move = Math.sign(sx + runUp - f.x);
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
          c.move = above || e.dy >= 0 ? Math.sign(tx - f.x) : Math.abs(tx - f.x) > 20 ? Math.sign(tx - f.x) * 0.6 : 0;
          if (high && f.vy > -60 && f.airJumps > 0 && f.y > ty) { c.jump = true; c.jumpHeld = true; }
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
    if (!nav.stand(cx, cy) && nav.free(cx, cy) && nav.land(cx, cy) === null && !(c.jump && this.path[0]?.edge.kind === 'jump')) c.move = 0;
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
      c.jumpHeld = true;
      this.repath = 0;
    }
  }
}
