// Projectiles. Like particles, a bullet's (x, y) is its spot on the ground
// (used for collision) and z its height, so it hits a wall's face at the
// height it was fired from. Bullets are fast and drawn as glowing tracer
// streaks, after lighting.

const STEP = 3;          // max px per collision step, so fast bullets can't skip a wall
const TRACER = 0.022;    // tracer length in seconds of travel (faster = longer streak)
const MAX_TRACER = 26;   // px

class Bullet {
  constructor(x, y, z, angle, speed, damage, life, pierce) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.damage = damage;
    this.life = life;
    this.pierce = pierce;   // how many more zombies it can go through
    this.hits = new Set();
    this.travelled = 0;
    this.dead = false;
  }

  draw(ctx) {
    const sp = Math.hypot(this.vx, this.vy), dx = this.vx / sp, dy = this.vy / sp;
    // the streak never reaches back past the muzzle
    const len = Math.min(MAX_TRACER, sp * TRACER, this.travelled);
    const x = this.x, y = this.y - this.z;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255, 150, 60, 0.45)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x - dx * len, y - dy * len);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - dx * len * 0.6, y - dy * len * 0.6);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#fffbe6';
    ctx.fillRect(Math.round(x - 1), Math.round(y - 1), 2, 2);
  }
}

export class Bullets {
  // onHit(zombie, result): a bullet struck a zombie
  // onProp(prop, damage, bullet): a bullet struck a prop (drums can blow up)
  constructor(particles, { onHit, onProp }) {
    this.items = [];
    this.particles = particles;
    this.onHit = onHit;
    this.onProp = onProp;
  }

  // range: px before the bullet fizzles out; pierce: extra zombies it passes through
  spawn(x, y, z, angle, speed, damage, range = 520, pierce = 0) {
    this.items.push(new Bullet(x, y, z, angle, speed, damage, range / speed, pierce));
  }

  update(dt, world, zombies) {
    for (const b of this.items) {
      b.life -= dt;
      const dist = Math.hypot(b.vx, b.vy) * dt;
      const steps = Math.max(1, Math.ceil(dist / STEP));
      for (let i = 0; i < steps && !b.dead; i++) {
        b.x += (b.vx * dt) / steps;
        b.y += (b.vy * dt) / steps;
        b.travelled += dist / steps;
        let part = null;
        const z = zombies.find((zb) => zb.hittable && !b.hits.has(zb) && (part = zb.hitPart(b.x, b.y, b.z)));
        if (z) {
          b.hits.add(z);
          this.onHit(z, z.hit(b.damage, b.vx, b.vy, b.z, part));
          if (b.pierce-- <= 0) b.dead = true;
        } else if (world.solidsIn({ l: b.x - 1, t: b.y - 1, r: b.x + 1, b: b.y + 1 }, true).length) {
          const prop = world.propAt(b.x, b.y);
          this.hitWall(b);
          if (prop) this.onProp(prop, b.damage, b);
        }
      }
      if (b.life <= 0) b.dead = true;
    }
    this.items = this.items.filter((b) => !b.dead);
  }

  hitWall(b) {
    b.dead = true;
    const sp = Math.hypot(b.vx, b.vy);
    // back the impact out of the wall a little so the sparks show
    const nx = -b.vx / sp, ny = -b.vy / sp;
    this.particles.sparks(b.x + nx * 2, b.y + ny * 2, b.z, nx, ny);
  }

  draw(ctx) {
    for (const b of this.items) b.draw(ctx);
  }
}
