// Tiny square particles: dust, sparks, blood, casings, dropped mags.
// (x, y) is the spot on the ground, z the height above it.
// Ground-layer particles draw under entities; air-layer ones are emissive and
// draw after lighting. Particles with `stain` are baked into the world's decal
// layer when they come to rest, so casings, mags and blood stay forever.

import { makeCanvas } from '../engine/pixel.js';
import { artW, artH } from '../combat/gunart.js';

const rand = (a, b) => a + Math.random() * (b - a);

// Little sprites for spent cases (no outline): a brass case, or a shotgun hull
// (red with a brass base). Cached by look.
const caseImgs = {};
function caseImg(look) {
  const shotgun = !!look && look.color !== '#e8b84a';
  const key = shotgun ? `s${look.color}` : 'brass';
  if (caseImgs[key]) return caseImgs[key];
  const w = shotgun ? 4 : 3, h = shotgun ? 2 : 1;
  const [c, g] = makeCanvas(w, h);
  if (shotgun) {
    g.fillStyle = look.color;
    g.fillRect(1, 0, w - 1, h);
    g.fillStyle = '#e8b84a';
    g.fillRect(0, 0, 1, h);
  } else {
    g.fillStyle = '#e8b84a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#b8892e';
    g.fillRect(0, 0, 1, h);
  }
  caseImgs[key] = c;
  return c;
}
const pick = (list) => list[(Math.random() * list.length) | 0];
const DUST_COLORS = ['#9fa695', '#868d7c', '#70776a'];
const SPARK_COLORS = ['#fff6c8', '#ffd85a', '#ff9a3c'];
const BLOOD_COLORS = ['#7d1414', '#961c1a', '#5e0e0e'];
const FIRE_COLORS = ['#fff6c8', '#ffd85a', '#ff9a3c', '#ff5a1f'];

export class Particles {
  constructor(world) {
    this.world = world;
    this.items = [];
  }

  add(p) {
    this.items.push({
      z: 0, vz: 0, gravity: 0, bounce: 0, drag: 5,
      alpha: 0.75, fade: 1.6, shrink: true, layer: 'ground', stain: false,
      ...p,
      max: p.life,
    });
  }

  // Dust kicked up at (x, y). (dirX, dirY) is the direction the mover is
  // travelling; dust drifts the opposite way.
  dust(x, y, count, dirX = 0, dirY = 0) {
    for (let i = 0; i < count; i++) {
      this.add({
        x: x + rand(-2, 2),
        y: y + rand(-1, 1),
        vx: -dirX * rand(12, 28) + rand(-10, 10),
        vy: -dirY * rand(8, 18) + rand(-4, 4),
        vz: rand(8, 18),
        size: Math.round(rand(1.6, 3.4)),
        color: pick(DUST_COLORS),
        life: rand(0.28, 0.5),
        alpha: 0.5,
      });
    }
  }

  // Bullet impact: a bright pop plus sparks thrown back along (nx, ny).
  sparks(x, y, z, nx, ny, count = 6) {
    this.add({ x, y, z, size: 4, color: '#fff6c8', life: 0.06, alpha: 1, fade: 99, shrink: false, layer: 'air' });
    for (let i = 0; i < count; i++) {
      const a = Math.atan2(ny, nx) + rand(-1.1, 1.1), s = rand(40, 110);
      this.add({
        x, y, z,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        vz: rand(-20, 40),
        drag: 7,
        size: Math.random() < 0.3 ? 2 : 1,
        color: pick(SPARK_COLORS),
        life: rand(0.12, 0.28),
        alpha: 1,
        fade: 3,
        layer: 'air',
      });
    }
  }

  // Blood thrown along (dx, dy) from a hit at height z; lands and stains the floor.
  // `up` adds extra upward pop (head bursts), `speed` scales the throw.
  blood(x, y, z, dx, dy, count, { up = 0, speed = 1, spread = 0.7 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.atan2(dy, dx) + rand(-spread, spread), s = rand(20, 90) * speed;
      this.add({
        x, y, z,
        layer: 'mid',
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s * 0.7,
        vz: rand(10, 50) + up * rand(0.5, 1),
        gravity: 260,
        drag: 2,
        size: Math.random() < 0.35 ? 2 : 1,
        color: pick(BLOOD_COLORS),
        life: 3,
        alpha: 1,
        fade: 99,
        shrink: false,
        stain: true,
      });
    }
  }

  // Spent casing flicked out of the gun; bounces, then stays on the floor.
  // `look` ({ w, h, color }) overrides the default brass casing (shotgun shells).
  shell(x, y, z, dirX, look) {
    if (look) {
      const flat = Math.random() < 0.5;
      this.add({
        x, y, z,
        vx: dirX * rand(25, 50), vy: rand(-12, 12), vz: rand(50, 75),
        gravity: 320, bounce: 0.35, drag: 1,
        w: flat ? look.w : look.h, h: flat ? look.h : look.w,
        color: look.color, outline: true,
        life: 4, alpha: 1, fade: 99, shrink: false, stain: true,
      });
      return;
    }
    const flat = Math.random() < 0.5;
    this.add({
      x, y, z,
      vx: dirX * rand(20, 45),
      vy: rand(-12, 12),
      vz: rand(45, 70),
      gravity: 320,
      bounce: 0.4,
      drag: 1,
      w: flat ? 2 : 1,
      h: flat ? 1 : 2,
      color: '#e8b84a',
      life: 4,
      alpha: 1,
      fade: 99,
      shrink: false,
      stain: true,
    });
  }

  // A case thrown out of an ejection port. (dx, dy) is the direction it leaves
  // the gun on screen: the upward part becomes height, the rest drift.
  // It spins in the plane of the screen and tumbles end over end (drawn
  // foreshortened), above the gun it came out of, and lands at any angle.
  eject(x, y, z, dx, dy, look, power = 1) {
    this.add({
      img: caseImg(look), x, y, z,
      vx: (dx * rand(35, 60) + rand(-6, 6)) * power,
      vy: rand(-3, 3) * power,   // stays close to the line it was dropped on
      vz: Math.max(25, -dy * rand(55, 85)) * power,
      rot: Math.atan2(dy, dx) + rand(-0.5, 0.5), vrot: rand(-22, 22),
      spin: rand(0, 6.3), vspin: rand(14, 30),
      gravity: 320, bounce: 0.4, drag: 1,
      life: 4, alpha: 1, fade: 99, shrink: false, stain: true, layer: 'mid',
    });
  }

  // Empty magazine dropping out of the gun.
  mag(x, y, z, dirX, look) {
    this.add({
      x, y, z,
      vx: dirX * rand(5, 15),
      vy: rand(-4, 4),
      vz: rand(0, 15),
      gravity: 320,
      bounce: 0.25,
      drag: 1.5,
      w: look.w,
      h: look.h,
      color: look.color,
      outline: true,
      life: 4,
      alpha: 1,
      fade: 99,
      shrink: false,
      stain: true,
    });
  }

  // A piece of something (a sprite) that tumbles through the air, lands and stays.
  gib(img, x, y, z, vx, vy, vz) {
    this.add({
      img, x, y, z, vx, vy, vz,
      rot: rand(0, Math.PI * 2),
      vrot: rand(-14, 14),
      spin: rand(0, 6.3), vspin: rand(6, 14),
      gravity: 340,
      bounce: 0.3,
      drag: 1.2,
      life: 5,
      alpha: 1,
      fade: 99,
      shrink: false,
      stain: true,
      layer: 'mid',
    });
  }

  // Small solid bits (flesh, bone, metal) flung out in all directions.
  bits(x, y, z, count, colors, power = 1) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), s = rand(20, 110) * power;
      this.add({
        x, y, z,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7, vz: rand(30, 120) * power,
        gravity: 330, bounce: 0.25, drag: 1.5,
        size: Math.random() < 0.4 ? 2 : 1,
        color: pick(colors),
        life: 4, alpha: 1, fade: 99, shrink: false, stain: true, layer: 'mid',
      });
    }
  }

  // Little puff of gun smoke drifting off the muzzle.
  smoke(x, y, z, dx, dy, count) {
    for (let i = 0; i < count; i++) {
      this.add({
        x, y, z,
        vx: dx * rand(10, 30) + rand(-6, 6), vy: dy * rand(6, 18) + rand(-4, 4), vz: rand(6, 16),
        drag: 3, size: Math.round(rand(2, 4)), color: pick(['#7c8077', '#5d6159', '#9a9d94']),
        life: rand(0.3, 0.6), alpha: 0.45, fade: 1.5, layer: 'mid',
      });
    }
  }

  // Fireball + smoke for an explosion.
  blast(x, y, radius) {
    for (let i = 0; i < 40; i++) {
      const a = rand(0, Math.PI * 2), s = rand(20, radius * 2.2);
      this.add({
        x: x + rand(-4, 4), y: y + rand(-3, 3), z: rand(2, 14),
        vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7, vz: rand(10, 60),
        drag: 5, size: Math.round(rand(2, 5)), color: pick(FIRE_COLORS),
        life: rand(0.2, 0.5), alpha: 1, fade: 2.5, layer: 'air',
      });
    }
    for (let i = 0; i < 18; i++) {
      const a = rand(0, Math.PI * 2), s = rand(10, 50);
      this.add({
        x: x + rand(-6, 6), y: y + rand(-4, 4), z: rand(4, 16),
        vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: rand(15, 35),
        drag: 2, size: Math.round(rand(3, 6)), color: pick(['#2a2a26', '#3a3a34', '#20201c']),
        life: rand(0.8, 1.6), alpha: 0.6, fade: 1.2, layer: 'mid',
      });
    }
  }

  // Something knocked off (a zombie's helmet): a chunk that tumbles and stays.
  chunk(x, y, z, dx, dy, w, h, color) {
    this.add({
      x, y, z,
      vx: dx * rand(30, 60),
      vy: dy * rand(20, 40),
      vz: rand(50, 80),
      gravity: 300,
      bounce: 0.3,
      drag: 1.5,
      w, h, color,
      outline: true,
      life: 4,
      alpha: 1,
      fade: 99,
      shrink: false,
      stain: true,
    });
  }

  update(dt) {
    for (const p of this.items) {
      const drag = Math.exp(-p.drag * dt);
      p.life -= dt;
      // things with weight (blood, gibs, casings) bounce off walls instead of flying through
      if (p.gravity) {
        const solid = (x, y) => this.world.isWall(Math.floor(x / 16), Math.floor(y / 16));
        if (solid(p.x + p.vx * dt, p.y)) p.vx *= -0.4;
        if (solid(p.x, p.y + p.vy * dt)) p.vy *= -0.4;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.vrot) p.rot += p.vrot * dt * (p.z > 0 ? 1 : 0.3);
      if (p.vspin) {
        // tumbling end over end in the air; on the floor it rolls to a stop lying flat
        if (p.z > 0) p.spin += p.vspin * dt;
        else {
          p.vrot *= Math.exp(-6 * dt);
          const flat = Math.round(p.spin / Math.PI) * Math.PI;
          p.spin += (flat - p.spin) * Math.min(1, dt * 14);
        }
      }
      p.vx *= drag;
      p.vy *= drag;
      if (p.gravity) {
        p.vz -= p.gravity * dt;
        p.z += p.vz * dt;
        if (p.z < 0) {
          p.z = 0;
          p.vz = Math.abs(p.vz) > 25 ? -p.vz * p.bounce : 0;
          p.vx *= 0.55;
          p.vy *= 0.55;
        }
        // settled: bake into the floor
        if (p.stain && p.z === 0 && p.vz === 0 && Math.hypot(p.vx, p.vy) < 4) {
          this.bake(p);
          p.life = 0;
        }
      } else {
        p.z += p.vz * dt;
        p.vz *= drag;
      }
      if (p.life <= 0 && p.stain && p.z <= 0.5) this.bake(p);
    }
    this.items = this.items.filter((p) => p.life > 0);
  }

  bake(p) {
    if (p.baked) return;
    p.baked = true;
    if (p.img) {
      this.world.stain((g) => {
        g.save();
        g.translate(Math.round(p.x), Math.round(p.y));
        g.rotate(p.rot);   // lies at whatever angle it landed
        g.drawImage(p.img, -Math.round(artW(p.img) / 2), -Math.round(artH(p.img) / 2), artW(p.img), artH(p.img));
        g.restore();
      });
      return;
    }
    const w = p.w ?? p.size, h = p.h ?? p.size;
    const x = Math.round(p.x - w / 2), y = Math.round(p.y - h / 2);
    this.world.stain((g) => {
      if (p.outline) {
        g.fillStyle = '#0d100b';
        g.fillRect(x - 1, y - 1, w + 2, h + 2);
      }
      g.fillStyle = p.color;
      g.fillRect(x, y, w, h);
    });
  }

  draw(ctx, layer) {
    for (const p of this.items) {
      if (p.layer !== layer) continue;
      const t = p.life / p.max;
      if (p.img) {
        ctx.save();
        ctx.globalAlpha = 1;   // solid (don't inherit the last smoke puff's alpha)
        ctx.translate(Math.round(p.x), Math.round(p.y - p.z));
        ctx.rotate(p.rot);
        if (p.spin !== undefined) ctx.scale(Math.max(0.3, Math.abs(Math.cos(p.spin))), 1);   // end-on as it tumbles
        ctx.drawImage(p.img, -Math.round(artW(p.img) / 2), -Math.round(artH(p.img) / 2), artW(p.img), artH(p.img));
        ctx.restore();
        continue;
      }
      const k = p.shrink ? 0.4 + 0.6 * t : 1;
      const w = Math.max(1, Math.round((p.w ?? p.size) * k));
      const h = Math.max(1, Math.round((p.h ?? p.size) * k));
      const x = Math.round(p.x - w / 2), y = Math.round(p.y - p.z - h / 2);
      ctx.globalAlpha = Math.min(1, t * p.fade) * p.alpha;
      if (p.outline) {
        ctx.fillStyle = '#0d100b';
        ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      }
      ctx.fillStyle = p.color;
      ctx.fillRect(x, y, w, h);
    }
    ctx.globalAlpha = 1;
  }
}
