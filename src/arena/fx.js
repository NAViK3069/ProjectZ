// Side-view effects: dust and puffs, brass, blood that sticks where it lands,
// sparks, splinters, smoke, fireballs, guns flung away. Everything has weight
// and bounces off the level; blood and scorch marks stay painted on it.

import { makeCanvas } from '../engine/pixel.js';
import { artW, artH } from '../combat/gunart.js';
import { T, SOLID, PLAT, ACID } from './level.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (l) => l[(Math.random() * l.length) | 0];

export class Fx {
  constructor(level) {
    this.level = level;
    this.items = [];
    const [c, g] = makeCanvas(level.w * T, level.h * T);
    this.stains = c;   // blood / scorch on walls and floors
    this.sg = g;
  }

  add(p) {
    this.items.push({ grav: 0, drag: 2, bounce: 0.3, size: 1, alpha: 1, glow: false, rot: 0, vrot: 0, ...p, max: p.life });
    if (this.items.length > 900) this.items.splice(0, this.items.length - 900);
  }

  // ---------- kinds ----------

  dust(x, y, n = 4) {
    for (let i = 0; i < n; i++) this.add({ x: x + rand(-4, 4), y: y - 1, vx: rand(-40, 40), vy: rand(-30, -5), life: rand(0.3, 0.6), color: pick(['#5a6a60', '#6e7f76', '#4a5850']), size: 2, drag: 4, kind: 'smoke' });
  }
  puff(x, y) {
    for (let i = 0; i < 6; i++) this.add({ x: x + rand(-3, 3), y, vx: rand(-50, 50), vy: rand(10, 40), life: rand(0.25, 0.45), color: '#c8d2cc', size: 2, drag: 5, kind: 'smoke', alpha: 0.7 });
  }
  step(x, y) {
    if (Math.random() < 0.5) this.add({ x, y: y - 1, vx: rand(-15, 15), vy: rand(-12, -2), life: 0.3, color: '#5a6a60', size: 1, drag: 4, kind: 'smoke', alpha: 0.6 });
  }
  // A spent case out of the ejection port along dir (gun space turned into the world), like the main game.
  casing(p, dir, look, power = 1) {
    const shotgun = !!look && look.color !== '#e8b84a' && look.h > 1;
    this.add({
      x: p.x, y: p.y, vx: (dir.x * rand(35, 60) + rand(-6, 6)) * power, vy: Math.min(-60, dir.y * rand(110, 160)) * power,
      life: 10, color: shotgun ? look.color : '#e8b84a', base: '#b8892e', w: shotgun ? 4 : 3, h: shotgun ? 2 : 1,
      grav: 640, bounce: 0.4, drag: 0.6, vrot: rand(-22, 22), kind: 'casing',
    });
  }
  // The empty mag (its sprite) dropping out of the gun.
  dropMag(img, x, y, facing) {
    this.add({ x, y, vx: facing * rand(5, 20), vy: rand(-20, 10), life: 10, img, grav: 680, bounce: 0.25, drag: 1, vrot: rand(-6, 6), kind: 'debris' });
  }
  blood(x, y, n, dx, dy) {
    for (let i = 0; i < n; i++) this.add({ x, y, vx: dx * rand(40, 160) + rand(-50, 50), vy: dy * rand(40, 140) + rand(-80, 20), life: rand(0.6, 1.4), color: pick(['#8a1414', '#a8201c', '#6e0e0e']), size: Math.random() < 0.3 ? 2 : 1, grav: 600, drag: 1, kind: 'blood' });
  }
  sparks(x, y, n, dx, dy, color = '#ffd27a') {
    for (let i = 0; i < n; i++) this.add({ x, y, vx: dx * rand(60, 200) + rand(-90, 90), vy: dy * rand(60, 200) + rand(-90, 40), life: rand(0.12, 0.35), color: Math.random() < 0.4 ? '#ffffff' : color, size: 1, grav: 500, drag: 2, glow: true, kind: 'spark' });
  }
  // A bullet hitting something hard, as in the main game: a white flash and a spray of sparks back out.
  impact(x, y, nx, ny, count = 6) {
    this.add({ x, y, vx: 0, vy: 0, life: 0.06, color: '#fff6c8', size: 4, glow: true, kind: 'spark' });
    for (let i = 0; i < count; i++) {
      const a = Math.atan2(ny, nx) + rand(-1.1, 1.1), s = rand(40, 110);
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.12, 0.28), color: pick(['#fff6c8', '#ffd85a', '#ff9a3c']), size: Math.random() < 0.3 ? 2 : 1, grav: 200, drag: 7, glow: true, kind: 'spark' });
    }
    this.add({ x, y, vx: nx * 15, vy: ny * 15 - 8, life: 0.4, color: '#7a8a80', size: 2, drag: 4, kind: 'smoke', alpha: 0.5 });
  }
  // A little puff of gun smoke drifting off the muzzle.
  gunSmoke(x, y, dx, dy, n) {
    for (let i = 0; i < n; i++) this.add({ x, y, vx: dx * rand(10, 30) + rand(-6, 6), vy: dy * rand(10, 30) - rand(6, 16), life: rand(0.3, 0.6), color: pick(['#7c8077', '#5d6159', '#9a9d94']), size: Math.round(rand(2, 4)), drag: 3, kind: 'smoke', alpha: 0.45 });
  }
  debris(x, y, n, colors, power = 1) {
    for (let i = 0; i < n; i++) this.add({ x: x + rand(-6, 6), y: y + rand(-8, 0), vx: rand(-140, 140) * power, vy: rand(-260, -60) * power, life: rand(3, 6), color: pick(colors), w: (2 + Math.random() * 4) | 0, h: 2, grav: 700, bounce: 0.3, drag: 0.6, vrot: rand(-14, 14), kind: 'debris' });
  }
  smoke(x, y, n, dark = false) {
    for (let i = 0; i < n; i++) this.add({ x: x + rand(-8, 8), y: y + rand(-8, 4), vx: rand(-30, 30), vy: rand(-70, -20), life: rand(0.8, 1.8), color: dark ? pick(['#1c201e', '#2a2e2c']) : pick(['#5e6662', '#727a76', '#4c5450']), size: (3 + Math.random() * 4) | 0, drag: 1.5, kind: 'smoke', alpha: 0.65 });
  }
  fire(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(40, 220);
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: rand(0.2, 0.55), color: pick(['#fff3c4', '#ffd25a', '#ff9a3a', '#e8542c']), size: (2 + Math.random() * 3) | 0, drag: 3, glow: true, kind: 'fire' });
    }
  }
  // A gun flung away when it's empty (or its owner dies): spins off and clatters down.
  thrownGun(f, w) {
    const img = w.icon;
    this.add({ x: f.x, y: f.y - 14, vx: f.facing * rand(30, 80) + f.vx * 0.5, vy: rand(-180, -110), life: 6, img, grav: 700, bounce: 0.3, drag: 0.6, vrot: rand(-12, 12), kind: 'debris' });
  }

  scorch(x, y, r) {
    const g = this.sg, grad = g.createRadialGradient(x, y, 2, x, y, r);
    grad.addColorStop(0, 'rgba(8, 8, 6, 0.75)');
    grad.addColorStop(1, 'rgba(8, 8, 6, 0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // ---------- each frame ----------

  update(dt) {
    const L = this.level;
    const solid = (x, y) => { const v = L.get(Math.floor(x / T), Math.floor(y / T)); return v === SOLID; };
    const floorAt = (x, y0, y1) => {
      // a catwalk top or a solid top crossed going down
      for (let cy = Math.floor(y0 / T); cy <= Math.floor(y1 / T); cy++) {
        const v = L.get(Math.floor(x / T), cy);
        if ((v === PLAT || v === SOLID || v === ACID) && cy * T >= y0 - 0.5 && cy * T <= y1) return cy * T;
      }
      return null;
    };
    for (const p of this.items) {
      p.life -= dt;
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      if (!p.grav) p.vy *= drag;
      p.vy += p.grav * dt;
      p.rot += p.vrot * dt;
      let nx = p.x + p.vx * dt;
      if (p.grav && solid(nx, p.y)) {
        p.vx *= -p.bounce;
        nx = p.x;
        if (p.kind === 'blood') { this.stick(p); continue; }
      }
      p.x = nx;
      const ny = p.y + p.vy * dt;
      if (p.grav && p.vy > 0) {
        const top = floorAt(p.x, p.y, ny);
        if (top !== null) {
          if (p.kind === 'blood') { p.y = top; this.stick(p); continue; }
          p.y = top - 0.5;
          if (Math.abs(p.vy) > 60) p.vy *= -p.bounce;
          else { p.vy = 0; p.vrot *= 0.5; p.vx *= 0.7; p.rest = true; }
          continue;
        }
      } else if (p.grav && p.vy < 0 && solid(p.x, ny)) {
        p.vy = 0;
        if (p.kind === 'blood') { this.stick(p); continue; }
      }
      p.y = ny;
    }
    this.items = this.items.filter((p) => p.life > 0 && !p.stuck);
  }

  // Blood that hits something stays on it.
  stick(p) {
    p.stuck = true;
    const g = this.sg;
    g.fillStyle = p.color;
    g.globalAlpha = 0.85;
    g.fillRect(Math.round(p.x), Math.round(p.y) - 1, p.size + (Math.random() < 0.4 ? 1 : 0), p.size);
    g.globalAlpha = 1;
  }

  draw(ctx) {
    for (const p of this.items) {
      if (p.glow) continue;
      const a = Math.min(1, p.life / Math.min(0.3, p.max)) * p.alpha;
      ctx.globalAlpha = a;
      if (p.img) {
        ctx.save();
        ctx.translate(Math.round(p.x), Math.round(p.y));
        ctx.rotate(Math.round(p.rot / (Math.PI / 8)) * (Math.PI / 8));
        ctx.drawImage(p.img, -Math.round(artW(p.img) / 2), -Math.round(artH(p.img) / 2), artW(p.img), artH(p.img));
        ctx.restore();
      } else if (p.w) {
        ctx.save();
        ctx.translate(Math.round(p.x), Math.round(p.y));
        ctx.rotate(p.rest ? 0 : Math.round(p.rot / (Math.PI / 4)) * (Math.PI / 4));
        if (p.kind === 'casing') {
          // the main game's case sprite: no outline, the base a darker brass
          ctx.fillStyle = p.color;
          ctx.fillRect(-Math.ceil(p.w / 2), -0.5, p.w, p.h);
          ctx.fillStyle = p.base;
          ctx.fillRect(-Math.ceil(p.w / 2), -0.5, 1, p.h);
        } else {
          ctx.fillStyle = '#10140d';
          ctx.fillRect(-Math.ceil(p.w / 2) - 0.5, -1, p.w + 1, p.h + 1);
          ctx.fillStyle = p.color;
          ctx.fillRect(-Math.ceil(p.w / 2), -0.5, p.w, p.h);
        }
        ctx.restore();
      } else {
        ctx.fillStyle = p.color;
        const s = p.kind === 'smoke' ? Math.max(1, Math.round(p.size * (0.6 + 0.6 * (1 - p.life / p.max)))) : p.size;
        ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  // The bright ones, after the lighting.
  drawGlow(ctx) {
    for (const p of this.items) {
      if (!p.glow) continue;
      ctx.globalAlpha = Math.min(1, p.life / Math.min(0.15, p.max));
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
}
