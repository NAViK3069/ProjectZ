// Explosions and thrown grenades.
//
// Anything that blows up (a grenade, a red chemical drum) calls explode():
// a fireball, smoke, a scorch mark on the floor, a short bright light, and
// a callback so the game can hurt whatever is in range. Drums caught in a
// blast go off a moment later, so they chain.
//
// Grenades are like particles: (x, y) on the ground plus a height z. They
// arc, bounce off the floor and walls, roll to a stop, then go off.

import { spriteFromRows, makeShadow } from '../engine/pixel.js';

export const BLAST_RADIUS = 64;
export const BLAST_DAMAGE = 240;
const GRENADE_FUSE = 1.6;
const GRAVITY = 380;
const THROW_RANGE = 150;
const DRUM_COLORS = ['#9c2a26', '#b8403a', '#6d1c19', '#10140d', '#e6d24a'];

const GRENADE = spriteFromRows([
  '.KK.',
  'KgGK',
  'KggK',
  '.KK.',
], { K: '#0d100b', g: '#4e5a32', G: '#7c8f48' });
const SHADOW = makeShadow(5, 2, 'rgba(14, 10, 24, 0.35)');
const rand = (a, b) => a + Math.random() * (b - a);

export class Explosives {
  // onBlast(x, y, radius, damage) - apply damage to whatever is in range
  constructor(world, particles, onBlast) {
    this.world = world;
    this.particles = particles;
    this.onBlast = onBlast;
    this.grenades = [];
    this.flashes = [];     // short-lived explosion lights
    this.pending = [];     // drums about to go off (chain reactions)
  }

  explode(x, y, power = 1) {
    const r = BLAST_RADIUS * power;
    this.flashes.push({ x, y, t: 0.35, max: 0.35, radius: 150 * power });
    this.particles.blast(x, y, r);
    this.world.stain((g) => {
      const grad = g.createRadialGradient(x, y, 2, x, y, r * 0.45);
      grad.addColorStop(0, 'rgba(10, 8, 6, 0.85)');
      grad.addColorStop(1, 'rgba(10, 8, 6, 0)');
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(x, y, r * 0.45, r * 0.3, 0, 0, Math.PI * 2);
      g.fill();
    }, x, y);
    this.onBlast(x, y, r, BLAST_DAMAGE * power);
    for (const p of this.world.propsNear(x, y, r)) {
      if (p.explosive && !p.blown && Math.hypot(p.x - x, p.y - y) < r) {
        p.blown = true;
        this.pending.push({ prop: p, t: rand(0.12, 0.25) });
      }
    }
  }

  // A bullet (or anything) hit a prop; drums blow once they've taken enough.
  damageProp(prop, damage) {
    if (!prop.explosive || prop.blown) return;
    prop.hp -= damage;
    if (prop.hp <= 0) {
      prop.blown = true;
      this.blowDrum(prop);
    }
  }

  blowDrum(prop) {
    this.world.removeProp(prop);
    this.particles.bits(prop.x, prop.y, 8, 22, DRUM_COLORS, 1.6);
    this.explode(prop.x, prop.y - 3, 1.1);
  }

  // Throw from (x, y, z) toward the ground point (tx, ty).
  throwGrenade(x, y, z, tx, ty) {
    let dx = tx - x, dy = ty - y;
    const d = Math.hypot(dx, dy) || 1;
    const reach = Math.min(THROW_RANGE, d);
    dx = (dx / d) * reach;
    dy = (dy / d) * reach;
    const T = 0.4 + reach / 500;   // flight time
    this.grenades.push({
      x, y, z,
      vx: dx / T, vy: dy / T,
      vz: (0.5 * GRAVITY * T * T - z) / T,
      fuse: GRENADE_FUSE,
    });
  }

  update(dt) {
    for (const g of this.grenades) {
      g.fuse -= dt;
      g.vz -= GRAVITY * dt;
      g.z += g.vz * dt;
      if (g.z < 0) {
        g.z = 0;
        g.vz = Math.abs(g.vz) > 40 ? -g.vz * 0.35 : 0;
        g.vx *= 0.6;
        g.vy *= 0.6;
      }
      if (g.z === 0) {
        const roll = Math.exp(-3 * dt);
        g.vx *= roll;
        g.vy *= roll;
      }
      // bounce off walls and props, one axis at a time
      const solid = (x, y) => this.world.solidsIn({ l: x - 1, t: y - 1, r: x + 1, b: y + 1 }).length > 0;
      if (solid(g.x + g.vx * dt, g.y)) g.vx *= -0.5;
      else g.x += g.vx * dt;
      if (solid(g.x, g.y + g.vy * dt)) g.vy *= -0.5;
      else g.y += g.vy * dt;
      if (g.fuse <= 0) {
        g.done = true;
        this.explode(g.x, g.y);
      }
    }
    this.grenades = this.grenades.filter((g) => !g.done);

    for (const p of this.pending) {
      if ((p.t -= dt) <= 0) {
        p.done = true;
        this.blowDrum(p.prop);
      }
    }
    this.pending = this.pending.filter((p) => !p.done);
    for (const f of this.flashes) f.t -= dt;
    this.flashes = this.flashes.filter((f) => f.t > 0);
  }

  // Lights for the lighting pass (explosion flashes).
  lights() {
    return this.flashes.map((f) => {
      const k = f.t / f.max;
      return { x: f.x, y: f.y, radius: f.radius * (0.6 + 0.4 * k), color: [255, 170, 80], intensity: 1.8 * k, rays: 120 };
    });
  }

  draw(ctx) {
    for (const g of this.grenades) {
      ctx.drawImage(SHADOW, Math.round(g.x) - 2, Math.round(g.y) - 1);
      ctx.drawImage(GRENADE, Math.round(g.x) - 2, Math.round(g.y - g.z) - 3);
    }
  }

  // The fuse light blinks faster as it runs out.
  drawEmissive(ctx) {
    for (const g of this.grenades) {
      const rate = g.fuse < 0.5 ? 16 : 6;
      if (Math.floor(g.fuse * rate) % 2) continue;
      ctx.fillStyle = '#ff3b30';
      ctx.fillRect(Math.round(g.x), Math.round(g.y - g.z) - 3, 1, 1);
    }
  }
}
