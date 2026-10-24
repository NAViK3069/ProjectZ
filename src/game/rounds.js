// Round-based zombie waves: each round spawns more (and tougher) zombies out
// of the dark, away from the player. Clearing a round refills your ammo.

import { TILE } from '../world/world.js';
import { Zombie, TYPES } from '../entities/zombie.js';

const FIRST_DELAY = 2.5;
const BETWEEN_ROUNDS = 6;
const MIN_SPAWN_DIST = 170, MAX_SPAWN_DIST = 520;

export const SCORE = { hit: 10, armorHit: 5, kill: 60, armorBreak: 30, headshot: 40 };

export class Rounds {
  constructor(world, particles) {
    this.world = world;
    this.particles = particles;
    this.zombies = [];
    this.round = 0;
    this.toSpawn = 0;
    this.spawnTimer = 0;
    this.pause = FIRST_DELAY;   // countdown to the next round
    this.banner = 0;            // seconds left showing "ROUND N"
    this.kills = 0;
    this.env = null;            // { particles, explosives, hazards, kick } - set by the game
    this.bannerText = null;
  }

  get maxAlive() {
    return Math.min(26, 5 + this.round * 2);
  }

  startRound(player) {
    this.round++;
    this.bannerText = null;
    this.toSpawn = 4 + this.round * 3;
    this.spawnTimer = 0.5;
    this.banner = 3;
    if (this.round > 1) player.resupply();   // a box of ammo per gun + a grenade
    this.bossRound = this.round % 5 === 0;
    this.bossDue = this.bossRound;         // a brute shows up partway through every 5th round
  }

  // Which zombie comes next: new types join in as the rounds go up.
  zombieStats() {
    const r = this.round;
    const table = [
      ['common', 10],
      ['runner', r >= 2 ? 2 + r * 0.3 : 0],
      ['spitter', r >= 3 ? 1.5 : 0],
      ['leaper', r >= 3 ? 1.5 : 0],
      ['armored', r >= 4 ? 1.5 : 0],
      ['suicide', r >= 4 ? 1.2 : 0],
      ['toxic', r >= 5 ? 1.2 : 0],
      ['burned', r >= 5 ? 1.2 : 0],
      ['frozen', r >= 6 ? 1.2 : 0],
      ['tank', r >= 7 ? 0.8 : 0],
    ];
    let roll = Math.random() * table.reduce((n, [, w]) => n + w, 0), type = 'common';
    for (const [t, w] of table) if ((roll -= w) <= 0) {
      type = t;
      break;
    }
    const T = TYPES[type];
    return {
      type,
      hp: (55 + r * 18) * T.hp,
      speed: (24 + Math.min(18, r * 2) + Math.random() * 8) * T.speed,
      damage: T.damage,
    };
  }

  spawnPoint(player) {
    const cells = this.world.spawnCells;
    for (let tries = 0; tries < 40; tries++) {
      const [cx, cy] = cells[(Math.random() * cells.length) | 0];
      const x = (cx + 0.5) * TILE, y = (cy + 0.8) * TILE;
      const d = Math.hypot(x - player.x, y - player.y);
      if (d < MIN_SPAWN_DIST || d > MAX_SPAWN_DIST) continue;
      if (this.world.solidsIn({ l: x - 5, t: y - 6, r: x + 5, b: y }).length) continue;
      return { x, y };
    }
    return null;
  }

  update(dt, player) {
    this.banner -= dt;
    if (!this.training) this.updateWaves(dt, player);

    this.world.updateFlow(player.x, player.y);
    for (const z of this.zombies) {
      if (this.freeze && !z.dummy && z.dying < 0) continue;   // training: hold still to be shot at
      z.update(dt, this.world, player, this.zombies, this.particles);
    }
    for (const z of this.zombies) {
      if (z.dying >= 0 && z.finished) {
        z.bakeCorpse(this.world);
        z.dead = true;
      }
    }
    this.zombies = this.zombies.filter((z) => !z.dead);
  }

  // Training: let one zombie of a given type out at (x, y).
  spawnType(type, x, y, round = 3) {
    const T = TYPES[type];
    const z = new Zombie(x, y, { type, hp: (55 + round * 18) * T.hp, speed: (24 + round * 2 + Math.random() * 8) * T.speed, damage: T.damage }, this.env);
    this.zombies.push(z);
    return z;
  }

  updateWaves(dt, player) {
    if (this.toSpawn === 0 && this.zombies.length === 0 && !player.dead) {
      if ((this.pause -= dt) <= 0) {
        this.startRound(player);
        this.pause = BETWEEN_ROUNDS;
      }
    }
    if (this.bossDue && this.toSpawn <= Math.floor((4 + this.round * 3) / 2)) {
      const at = this.spawnPoint(player);
      if (at) {
        this.bossDue = false;
        const r = this.round;
        this.zombies.push(new Zombie(at.x, at.y, { type: 'brute', hp: (55 + r * 18) * TYPES.brute.hp, speed: 30 * TYPES.brute.speed, damage: TYPES.brute.damage }, this.env));
        this.banner = 3;
        this.bannerText = 'BOSS - BRUTE';
      }
    }
    if (this.toSpawn > 0 && (this.spawnTimer -= dt) <= 0) {
      this.spawnTimer = Math.max(0.35, 1.4 - this.round * 0.08);
      const alive = this.zombies.filter((z) => z.dying < 0).length;
      const at = alive < this.maxAlive && this.spawnPoint(player);
      if (at) {
        this.zombies.push(new Zombie(at.x, at.y, this.zombieStats(), this.env));
        this.toSpawn--;
      }
    }
  }
}
