// Throwables and placed devices (G throws / places the selected one, X picks
// which). Thrown things fly and bounce like the old grenade; placed things
// are set down in front of you and wait for a zombie.
//
//   grenade   - frag grenade on a fuse
//   frag      - bigger fuse grenade that also sprays shrapnel
//   smoke     - a thick cloud; zombies inside lose you and stumble about
//   flashbang - blinding flash: stuns zombies that can see it (and dazzles you)
//   stun      - electric burst: stuns and zaps everything close
//   molotov   - shatters on impact into a pool of fire that burns zombies
//   c4        - sticks where it lands; press G again to set it off
//   landmine  - goes off under the first zombie to step on it
//   claymore  - sprays a cone of steel balls at anything in front of it
//   tripmine  - laser across the floor; anything crossing it sets it off
//   flare     - burns bright red for a long time - light in the dark
//   taser     - instant: a dart zaps the first zombie in line and stuns it

import { spriteFromRows, makeShadow, makeCanvas } from '../engine/pixel.js';

const GRAVITY = 380;
const THROW_RANGE = 150;
const rand = (a, b) => a + Math.random() * (b - a);
const K = '#0d100b';

const SPRITES = {
  grenade: ['.KK.', 'KgGK', 'KggK', '.KK.'],
  frag: ['.KK.', 'KyGK', 'KggK', '.KK.'],
  smoke: ['.KK.', 'KwWK', 'KddK', 'KddK', '.KK.'],
  flashbang: ['.KK.', 'KlLK', 'KddK', 'KllK', '.KK.'],
  stun: ['.KK.', 'KbBK', 'KbbK', 'KbBK', '.KK.'],
  molotov: ['.r.', 'KoK', 'KoK', 'KOOK', 'KOOK', '.KK.'],
  c4: ['KKKKKK', 'KtTtTK', 'KtrttK', 'KKKKKK'],
  landmine: ['.KKKK.', 'KgGGgK', 'KKKKKK'],
  claymore: ['.KKKKK.', 'KgGGGgK', 'K.K.K.K'],
  tripmine: ['.KKK.', 'KdrdK', 'KKKKK'],
  flare: ['KKKKK', 'KrrRK', 'KKKKK'],
  taser: ['KKKK.', 'KyyyK', 'K.KK.'],
};
const PAL = {
  K, g: '#4e5a32', G: '#7c8f48', y: '#c9b45a', w: '#9aa49a', W: '#c8d0c4', d: '#4c5455', l: '#9aa4b8', L: '#e8ecd8',
  b: '#3a6fd0', B: '#7fb7f9', r: '#d7313d', R: '#ff8a7a', o: '#5a7a3a', O: '#8b6a3a', t: '#c9bc90', T: '#e8dfc0',
};

// name, kind of use, art and inventory stack size
export const THROWABLES = {
  grenade: { name: 'GRENADE', use: 'throw', fuse: 1.6 },
  frag: { name: 'FRAG GRENADE', use: 'throw', fuse: 1.8 },
  smoke: { name: 'SMOKE', use: 'throw', fuse: 1.2 },
  flashbang: { name: 'FLASHBANG', use: 'throw', fuse: 1.3 },
  stun: { name: 'STUN GRENADE', use: 'throw', fuse: 1.3 },
  molotov: { name: 'MOLOTOV', use: 'throw', fuse: 99 },
  c4: { name: 'C4', use: 'throw', fuse: 99 },
  landmine: { name: 'LANDMINE', use: 'place' },
  claymore: { name: 'CLAYMORE', use: 'place' },
  tripmine: { name: 'TRIP MINE', use: 'place' },
  flare: { name: 'FLARE', use: 'throw', fuse: 0.6 },
  taser: { name: 'TASER', use: 'instant' },
};
for (const [k, t] of Object.entries(THROWABLES)) {
  t.id = k;
  t.img = spriteFromRows(SPRITES[k], PAL);
}
export const THROWABLE_IDS = Object.keys(THROWABLES);

const SHADOW = makeShadow(5, 2, 'rgba(14, 10, 24, 0.35)');
const SMOKE_LIFE = 11, SMOKE_R = 44;
const FLARE_LIFE = 24;

export class Throwables {
  // env: { world, particles, explosives, hazards, bullets, zombies(), hurt(z, dmg, part, dx, dy), dazzle(k) }
  constructor(env) {
    this.env = env;
    this.items = [];     // flying / lying / placed things
    this.clouds = [];    // smoke
    this.zaps = [];      // electric arcs to draw for a moment
    this.flashes = [];   // bright flash lights
  }

  get world() { return this.env.world; }
  get particles() { return this.env.particles; }

  // Use one: throw it toward (tx, ty), place it at the player, or fire the taser.
  // Returns false if it couldn't be used (nothing happened).
  use(id, player, tx, ty) {
    const t = THROWABLES[id];
    if (t.use === 'instant') return this.taser(player), true;
    if (t.use === 'place') {
      const a = player.aim, x = player.x + Math.cos(a) * 10, y = player.y + Math.sin(a) * 6 + 2;
      if (this.world.solidsIn({ l: x - 3, t: y - 3, r: x + 3, b: y + 1 }).length) return false;
      this.items.push({ id, x, y, z: 0, vx: 0, vy: 0, vz: 0, angle: a, arm: 1.1, placed: true, life: 0 });
      return true;
    }
    const x = player.x + player.facing * 4, y = player.y, z = 14;
    let dx = tx - x, dy = ty - y;
    const d = Math.hypot(dx, dy) || 1, reach = Math.min(THROW_RANGE, d);
    dx = (dx / d) * reach;
    dy = (dy / d) * reach;
    const T = 0.4 + reach / 500;
    this.items.push({ id, x, y, z, vx: dx / T, vy: dy / T, vz: (0.5 * GRAVITY * T * T - z) / T, fuse: t.fuse, spin: 0, life: 0 });
    return true;
  }

  // C4 waiting for the detonator?
  get armedC4() {
    return this.items.some((i) => i.id === 'c4' && !i.done);
  }

  detonate() {
    for (const i of this.items) if (i.id === 'c4' && !i.done) {
      i.done = true;
      this.env.explosives.explode(i.x, i.y, 1.7);
    }
  }

  update(dt) {
    const zombies = this.env.zombies().filter((z) => z.hittable);
    for (const it of this.items) {
      it.life += dt;
      if (it.placed) this.updatePlaced(it, dt, zombies);
      else this.updateThrown(it, dt);
    }
    this.items = this.items.filter((i) => !i.done);

    // smoke clouds: puffs, and zombies inside lose track of you
    for (const c of this.clouds) {
      c.life -= dt;
      const k = Math.min(1, c.life / 2);
      if (Math.random() < dt * 30 * k) {
        const a = rand(0, Math.PI * 2), r = rand(0, c.r);
        this.particles.add({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r * 0.6, z: rand(0, 6), vx: rand(-6, 6), vy: rand(-3, 3), vz: rand(3, 10), drag: 1, size: (2 + Math.random() * 3) | 0, color: Math.random() < 0.5 ? '#a9b0a4' : '#8b9286', life: rand(1, 2), alpha: 0.55, fade: 1, layer: 'air' });
      }
      for (const z of zombies) if (Math.hypot(z.x - c.x, (z.y - c.y) * 1.4) < c.r) z.confuse?.(0.4);
    }
    this.clouds = this.clouds.filter((c) => c.life > 0);
    for (const z of this.zaps) z.t -= dt;
    this.zaps = this.zaps.filter((z) => z.t > 0);
    for (const f of this.flashes) f.t -= dt;
    this.flashes = this.flashes.filter((f) => f.t > 0);
  }

  updateThrown(it, dt) {
    const t = THROWABLES[it.id];
    it.fuse -= dt;
    it.vz -= GRAVITY * dt;
    it.z += it.vz * dt;
    let landed = false, hitWall = false;
    if (it.z < 0) {
      it.z = 0;
      landed = true;
      it.vz = Math.abs(it.vz) > 40 && it.id !== 'c4' ? -it.vz * 0.35 : 0;
      it.vx *= it.id === 'c4' ? 0 : 0.6;
      it.vy *= it.id === 'c4' ? 0 : 0.6;
    }
    if (it.z === 0) {
      const roll = Math.exp(-3 * dt);
      it.vx *= roll;
      it.vy *= roll;
    }
    const solid = (x, y) => this.world.solidsIn({ l: x - 1, t: y - 1, r: x + 1, b: y + 1 }).length > 0;
    if (solid(it.x + it.vx * dt, it.y)) { it.vx *= -0.5; hitWall = true; } else it.x += it.vx * dt;
    if (solid(it.x, it.y + it.vy * dt)) { it.vy *= -0.5; hitWall = true; } else it.y += it.vy * dt;
    it.spin += dt * Math.hypot(it.vx, it.vy) * 0.2;

    if (it.id === 'molotov' && (landed || hitWall)) return this.shatter(it);
    if (it.id === 'flare') {
      if (it.fuse <= 0) {
        it.burn = (it.burn ?? FLARE_LIFE) - dt;
        if (Math.random() < dt * 40) this.particles.add({ x: it.x, y: it.y, z: it.z + 2, vx: rand(-20, 20), vy: rand(-12, 12), vz: rand(30, 70), gravity: 200, drag: 1, size: 1, color: Math.random() < 0.5 ? '#ff6a5a' : '#ffd0a0', life: rand(0.2, 0.5), alpha: 1, fade: 3, layer: 'air' });
        if (it.burn <= 0) it.done = true;
      }
      return;
    }
    if (it.fuse > 0 || it.id === 'c4') return;
    it.done = true;
    this.go(it);
  }

  // A fuse ran out.
  go(it) {
    const { explosives, particles } = this.env;
    if (it.id === 'grenade') explosives.explode(it.x, it.y);
    else if (it.id === 'frag') {
      explosives.explode(it.x, it.y, 0.8);
      for (let i = 0; i < 24; i++) this.env.bullets.spawn(it.x, it.y - 3, 3, rand(0, Math.PI * 2), rand(380, 520), 45, 150, 0);
    } else if (it.id === 'smoke') {
      this.clouds.push({ x: it.x, y: it.y, r: SMOKE_R, life: SMOKE_LIFE });
      particles.smoke(it.x, it.y, 2, 0, -1, 10);
    } else if (it.id === 'flashbang') {
      this.flashes.push({ x: it.x, y: it.y, t: 0.5, max: 0.5, radius: 260, color: [255, 255, 245], intensity: 3 });
      particles.sparks(it.x, it.y, 4, 0, -1, 10);
      for (const z of this.env.zombies()) {
        if (!z.hittable) continue;
        if (Math.hypot(z.x - it.x, z.y - it.y) < 150 && this.world.clearLine(it.x, it.y - 1, z.x, z.y - 2)) z.stun?.(3.5, 'flash');
      }
      // you're only blinded if you can see it: behind a wall or a tall block
      // you're safe; looking the other way it only half gets you
      const p = this.env.player, pd = Math.hypot(p.x - it.x, p.y - it.y);
      if (pd < 180 && this.world.clearLine(it.x, it.y - 1, p.x, p.y - 2)) {
        const look = (Math.cos(p.aim) * (it.x - p.x) + Math.sin(p.aim) * (it.y - p.y)) / (pd || 1);
        this.env.dazzle((1 - pd / 220) * (look < 0 ? 0.35 : 1));
      }
    } else if (it.id === 'stun') {
      this.flashes.push({ x: it.x, y: it.y, t: 0.35, max: 0.35, radius: 140, color: [120, 180, 255], intensity: 2 });
      for (let i = 0; i < 14; i++) particles.add({ x: it.x, y: it.y, z: 3, vx: rand(-90, 90), vy: rand(-60, 60), vz: rand(20, 80), gravity: 200, drag: 2, size: 1, color: Math.random() < 0.5 ? '#9fd0ff' : '#ffffff', life: rand(0.2, 0.5), alpha: 1, fade: 3, layer: 'air' });
      for (const z of this.env.zombies()) {
        if (!z.hittable || Math.hypot(z.x - it.x, z.y - it.y) > 78 || !this.world.clearLine(it.x, it.y - 1, z.x, z.y - 2)) continue;
        z.stun?.(4, 'shock');
        this.zaps.push({ x0: it.x, y0: it.y - 2, x1: z.x, y1: z.y - 14, t: 0.3 });
        this.env.hurt(z, 20, 'fire', z.x - it.x, z.y - it.y);
      }
    }
  }

  // Molotov: glass and a pool of fire that burns zombies (and you).
  shatter(it) {
    it.done = true;
    this.particles.bits(it.x, it.y, 2, 8, ['#5a7a3a', '#8fb86a', '#cfe8b0'], 0.8);
    this.env.hazards.area('fire', it.x, it.y, 1.7, { life: 7, zdps: 45 });
    this.flashes.push({ x: it.x, y: it.y, t: 0.3, max: 0.3, radius: 120, color: [255, 150, 60], intensity: 1.6 });
  }

  updatePlaced(it, dt, zombies) {
    if (it.arm > 0) {
      it.arm -= dt;
      return;
    }
    if (it.trip >= 0) {
      // tripped: a short beep, then boom
      if ((it.trip -= dt) < 0) this.fire(it);
      return;
    }
    if (it.id === 'landmine') {
      if (zombies.some((z) => Math.hypot(z.x - it.x, z.y - it.y) < z.halfW + 6)) it.trip = 0.15;
    } else if (it.id === 'claymore') {
      if (zombies.some((z) => {
        const dx = z.x - it.x, dy = z.y - it.y, d = Math.hypot(dx, dy);
        let da = Math.atan2(dy, dx) - it.angle;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        return d < 64 && Math.abs(da) < 0.7;
      })) it.trip = 0.1;
    } else if (it.id === 'tripmine') {
      const len = this.beam(it);
      const cx = Math.cos(it.angle), cy = Math.sin(it.angle);
      if (zombies.some((z) => {
        const rx = z.x - it.x, ry = z.y - it.y, along = rx * cx + ry * cy;
        return along > 0 && along < len && Math.abs(rx * -cy + ry * cx) < z.halfW + 1;
      })) it.trip = 0.08;
    }
  }

  beam(it) {
    it.len ??= this.world.castRay(it.x, it.y - 1, Math.cos(it.angle), Math.sin(it.angle), 150);
    return it.len;
  }

  fire(it) {
    it.done = true;
    const { explosives, particles, bullets } = this.env;
    if (it.id === 'claymore') {
      // a cone of steel balls, a small blast you don't feel
      particles.blast(it.x, it.y, 18);
      this.flashes.push({ x: it.x, y: it.y, t: 0.25, max: 0.25, radius: 110, color: [255, 170, 80], intensity: 1.6 });
      for (let i = 0; i < 30; i++) bullets.spawn(it.x, it.y - 2, 3, it.angle + rand(-0.5, 0.5), rand(560, 720), 70, 190, 1);
    } else {
      explosives.explode(it.x, it.y, it.id === 'landmine' ? 1.25 : 1.3);
    }
  }

  // Taser dart: the first zombie in line within reach gets zapped.
  taser(player) {
    const o = player.aimOrigin(), a = player.aim, cx = Math.cos(a), cy = Math.sin(a);
    const max = this.world.castRay(player.x, player.y - 2, cx, cy, 95);
    let best = null, bestT = max;
    for (const z of this.env.zombies()) {
      if (!z.hittable) continue;
      const rx = z.x - player.x, ry = z.y - player.y, along = rx * cx + ry * cy;
      if (along < 0 || along > bestT) continue;
      if (Math.abs(rx * -cy + ry * cx) < z.halfW + 4) {
        best = z;
        bestT = along;
      }
    }
    const ex = best ? best.x : player.x + cx * max, ey = best ? best.y - 14 : player.y + cy * max - 9;
    this.zaps.push({ x0: o.x + cx * 8, y0: o.y + cy * 8, x1: ex, y1: ey, t: 0.2 });
    if (best) {
      best.stun?.(3, 'shock');
      this.env.hurt(best, 25, 'fire', cx, cy);
      this.particles.sparks(best.x, best.y, 14, -cx, -cy, 8);
    }
  }

  lights() {
    const out = this.flashes.map((f) => ({ x: f.x, y: f.y, radius: f.radius * (0.6 + 0.4 * (f.t / f.max)), color: f.color, intensity: f.intensity * (f.t / f.max), rays: 120 }));
    for (const it of this.items) {
      if (it.id === 'flare' && it.burn !== undefined) {
        const k = Math.min(1, it.burn / 2) * (0.85 + Math.random() * 0.15);
        out.push({ x: it.x, y: it.y, radius: 170, color: [255, 70, 50], intensity: 1.3 * k, rays: 100 });
      }
    }
    for (const z of this.zaps) out.push({ x: z.x1, y: z.y1 + 10, radius: 50, color: [140, 190, 255], intensity: 1, shadows: false });
    return out;
  }

  // Things on the floor (lit like everything else).
  draw(ctx) {
    for (const it of this.items) {
      const img = THROWABLES[it.id].img;
      ctx.drawImage(SHADOW, Math.round(it.x) - 2, Math.round(it.y) - 1);
      if (it.placed && it.id === 'claymore') {
        ctx.save();
        ctx.translate(Math.round(it.x), Math.round(it.y) - 2);
        ctx.scale(Math.cos(it.angle) < 0 ? -1 : 1, 1);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        ctx.restore();
      } else {
        ctx.drawImage(img, Math.round(it.x - img.width / 2), Math.round(it.y - it.z - img.height));
      }
    }
  }

  // Lasers, blinking lights, sparks of electricity, the flare's flame.
  drawEmissive(ctx, time) {
    for (const it of this.items) {
      const x = Math.round(it.x), y = Math.round(it.y - it.z);
      if (it.id === 'tripmine' && it.arm <= 0) {
        const len = this.beam(it);
        ctx.strokeStyle = 'rgba(255, 40, 40, 0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(it.x, it.y - 2);
        ctx.lineTo(it.x + Math.cos(it.angle) * len, it.y - 2 + Math.sin(it.angle) * len);
        ctx.stroke();
      }
      const blink = it.placed || it.id === 'c4' ? (it.arm > 0 || it.trip >= 0 ? 12 : 2) : it.fuse < 0.5 ? 16 : 6;
      if (it.id === 'flare' && it.burn !== undefined) {
        ctx.fillStyle = '#ffd0a0';
        ctx.fillRect(x - 1, y - 3, 3, 2);
        ctx.fillStyle = '#ff5a40';
        ctx.fillRect(x - 2, y - 4, 1, 1);
      } else if (it.id === 'molotov') {
        ctx.fillStyle = Math.floor(time * 20) % 2 ? '#ffd85a' : '#ff6a1a';
        ctx.fillRect(x - 1, y - 8, 2, 2);
      } else if (it.id !== 'smoke' && Math.floor(time * blink) % 2 === 0) {
        ctx.fillStyle = it.id === 'stun' ? '#7fb7f9' : '#ff3b30';
        ctx.fillRect(x, y - 3, 1, 1);
      }
    }
    for (const z of this.zaps) {
      // jagged bolt, re-rolled every frame
      ctx.strokeStyle = z.t > 0.1 ? '#e8f4ff' : '#7fb7f9';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(z.x0, z.y0);
      const n = 6;
      for (let i = 1; i < n; i++) {
        const k = i / n;
        ctx.lineTo(z.x0 + (z.x1 - z.x0) * k + rand(-3, 3), z.y0 + (z.y1 - z.y0) * k + rand(-3, 3));
      }
      ctx.lineTo(z.x1, z.y1);
      ctx.stroke();
    }
  }
}

// Inventory icon for a throwable (centred in w x h).
export function throwableIcon(id, w, h) {
  const img = THROWABLES[id].img, [c, g] = makeCanvas(w, h);
  const s = Math.max(1, Math.floor(Math.min((w - 2) / img.width, (h - 2) / img.height)));
  g.drawImage(img, Math.floor((w - img.width * s) / 2), Math.floor((h - img.height * s) / 2), img.width * s, img.height * s);
  return c;
}
