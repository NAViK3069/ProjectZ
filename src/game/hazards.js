// Things special zombies leave behind or throw:
//   spit  - a blob of acid a spitter lobs; splashes into an acid puddle
//   acid  - puddle that burns while you stand in it
//   gas   - toxic cloud from a toxic zombie dying
//   fire  - flames from a burned zombie dying
// Areas hurt the player over time (no knockback), drawn as glowing blobs.

const rand = (a, b) => a + Math.random() * (b - a);

const KINDS = {
  acid: { color: [120, 230, 60], dps: 12, life: 5, radius: 14 },
  gas: { color: [120, 200, 70], dps: 9, life: 5, radius: 30 },
  fire: { color: [255, 120, 30], dps: 16, life: 3, radius: 18 },
};

export class Hazards {
  constructor(world, particles) {
    this.world = world;
    this.particles = particles;
    this.areas = [];
    this.spits = [];
  }

  // opts: { life, zdps } - zdps: damage per second to zombies standing in it (your molotovs)
  area(kind, x, y, scale = 1, opts = {}) {
    const k = KINDS[kind], life = opts.life ?? k.life;
    this.areas.push({ kind, x, y, r: k.radius * scale, life, max: life, zdps: opts.zdps ?? 0 });
  }

  // Lob acid from (x, y) at height z toward (tx, ty).
  spit(x, y, z, tx, ty) {
    const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy) || 1, T = 0.35 + d / 400;
    this.spits.push({ x, y, z, vx: dx / T, vy: dy / T, vz: (0.5 * 400 * T * T - z) / T });
  }

  // burnZombie(z, amount): a zombie stood in the player's fire
  update(dt, player, zombies = [], burnZombie = null) {
    for (const s of this.spits) {
      s.vz -= 400 * dt;
      s.z += s.vz * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const wall = this.world.isWall(Math.floor(s.x / 16), Math.floor(s.y / 16));
      const hitPlayer = !player.dead && Math.hypot(s.x - player.x, s.y - player.y) < 9 && s.z < 22;
      if (s.z <= 0 || wall || hitPlayer) {
        s.done = true;
        if (hitPlayer) player.hurt(12, s.x - s.vx, s.y - s.vy);
        this.area('acid', s.x, s.y);
        for (let i = 0; i < 6; i++) this.particles.add({ x: s.x, y: s.y, z: 2, vx: rand(-40, 40), vy: rand(-25, 25), vz: rand(20, 50), gravity: 250, drag: 2, size: 1, color: '#7adf3a', life: 0.5, alpha: 1, fade: 3, layer: 'air' });
      }
    }
    this.spits = this.spits.filter((s) => !s.done);

    for (const a of this.areas) {
      a.life -= dt;
      const k = KINDS[a.kind];
      if (!player.dead && Math.hypot(player.x - a.x, (player.y - a.y) * 1.4) < a.r) player.burn(k.dps * dt, a.kind);
      if (a.zdps && burnZombie) for (const z of zombies) if (z.hittable && Math.hypot(z.x - a.x, (z.y - a.y) * 1.4) < a.r + z.halfW) burnZombie(z, a.zdps * dt);
      // a bit of rising smoke / embers / bubbles
      if (Math.random() < dt * (a.kind === 'gas' ? 14 : 8)) {
        const ang = rand(0, Math.PI * 2), rr = rand(0, a.r);
        const color = a.kind === 'fire' ? (Math.random() < 0.5 ? '#ffd85a' : '#ff6a1a') : a.kind === 'gas' ? '#8fcf5a' : '#7adf3a';
        this.particles.add({ x: a.x + Math.cos(ang) * rr, y: a.y + Math.sin(ang) * rr * 0.6, z: 1, vx: rand(-4, 4), vy: 0, vz: rand(8, 22), drag: 1.5, size: a.kind === 'gas' ? 3 : 1, color, life: rand(0.5, 1.1), alpha: a.kind === 'gas' ? 0.35 : 0.9, fade: 2, layer: 'air' });
      }
    }
    this.areas = this.areas.filter((a) => a.life > 0);
  }

  // Lights for the lighting pass (fire and acid glow).
  lights() {
    return this.areas.filter((a) => a.kind !== 'gas').map((a) => ({
      x: a.x, y: a.y, radius: a.r * 2.4, color: KINDS[a.kind].color, intensity: 0.7 * Math.min(1, a.life / 0.6), shadows: false,
    }));
  }

  // Puddles and clouds sit on the floor (drawn before entities).
  draw(ctx) {
    for (const a of this.areas) {
      const [r, g, b] = KINDS[a.kind].color, k = Math.min(1, a.life / 0.6) * Math.min(1, (a.max - a.life) / 0.2 + 0.3);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(a.kind === 'gas' ? 0.22 : 0.4) * k})`;
      ctx.beginPath();
      ctx.ellipse(a.x, a.y, a.r, a.r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Flying spit blobs glow.
  drawEmissive(ctx) {
    for (const s of this.spits) {
      ctx.fillStyle = '#2a5a12';
      ctx.fillRect(Math.round(s.x) - 2, Math.round(s.y - s.z) - 2, 4, 4);
      ctx.fillStyle = '#9cf05a';
      ctx.fillRect(Math.round(s.x) - 1, Math.round(s.y - s.z) - 1, 2, 2);
    }
    for (const a of this.areas) {
      if (a.kind !== 'fire') continue;
      for (let i = 0; i < 3; i++) {
        const fx = a.x + Math.sin(a.life * 9 + i * 2.1) * a.r * 0.5, h = 4 + ((a.life * 20 + i * 3) % 5);
        ctx.fillStyle = '#ff6a1a';
        ctx.fillRect(Math.round(fx) - 1, Math.round(a.y - h), 3, h);
        ctx.fillStyle = '#ffd85a';
        ctx.fillRect(Math.round(fx), Math.round(a.y - h + 2), 1, h - 2);
      }
    }
  }
}
