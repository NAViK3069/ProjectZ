// Training dummies: burlap targets on a pole. They take hits like a zombie
// (head and body hitboxes, headshots count extra) but never die - they
// rock back, pop out a damage number and keep a running total over their
// head until you stop hitting them. A 'mover' slides along a rail.

import { spriteFromRows, makeShadow } from '../engine/pixel.js';
import { drawText, textWidth } from '../ui/font.js';

const HEADSHOT = 2.5;   // same as zombies
const ROWS = [
  '.....KKKKKK.....',
  '....KBBbbbbK....',
  '...KBbbbbbbdK...',
  '...KbsbbbsbdK...',
  '...KbbbbbbbdK...',
  '...KbbsssbbdK...',
  '....KdbbbbdK....',
  '.....KKKKKK.....',
  '..KKKKKKKKKKKK..',
  'KKKBbbbbbbbbbKKK',
  'KpPBbbwwwwbbdPpK',
  'KKKbbbwrrwbbdKKK',
  '..KbbwrwwrwbdK..',
  '..KbbwrwwrwbdK..',
  '..KbbbwrrwbbdK..',
  '..KbbbbwwbbbdK..',
  '..KbbbbbbbbbdK..',
  '..KdbbbbbbbddK..',
  '..KddddddddddK..',
  '..KKKKKKKKKKKK..',
  '......KpPK......',
  '......KpPK......',
  '......KpPK......',
  '......KpPK......',
  '......KpPK......',
  '......KpPK......',
  '......KpPK......',
  '...KKKKKKKKKK...',
  '...KmMMMMMMmK...',
  '...KKKKKKKKKK...',
];
const PAL = {
  K: '#1a1410', b: '#a88a5c', B: '#c4a676', d: '#7d6440', s: '#3a2c1c',
  r: '#c8312c', w: '#e8e0cc', p: '#5a4128', P: '#7a5a38', m: '#3c4245', M: '#5a6266',
};
const IMG = spriteFromRows(ROWS, PAL);
const HIT_IMG = spriteFromRows(ROWS.map((r) => r.replace(/[a-zA-Z]/g, (c) => (c === 'K' ? 'K' : 'w'))), PAL);
const RAIL = spriteFromRows(['KKKKKKKKKKKK', 'KmmmmmmmmmmK', 'KKKKKKKKKKKK'], PAL);
const SHADOW = makeShadow(14, 4);
const H = ROWS.length, W = ROWS[0].length;
const BURLAP = ['#a88a5c', '#c4a676', '#7d6440', '#e8e0cc'];

export const DUMMY_ART = IMG;

export class Dummy {
  // env: { numbers: [] (floating damage numbers), stats: { record(dmg, part) } }
  constructor(x, y, env, opts = {}) {
    this.x = x;
    this.y = y;
    this.home = x;
    this.env = env;
    this.mover = opts.mover ? { range: opts.range ?? 40, speed: opts.speed ?? 32, t: 0 } : null;
    this.halfW = 6;
    this.height = 6;
    this.hp = Infinity;
    this.maxHp = Infinity;
    this.dying = -1;
    this.dead = false;
    this.dummy = true;
    this.sway = 0;       // radians it's rocked over
    this.swayV = 0;
    this.flash = 0;
    this.recent = 0;     // running total while being hit
    this.recentT = 0;
    this.lift = 0;
    this.art = {
      headBox: { half: 4, top: -H, bottom: -H + 8 },
      bodyBox: { half: 7, top: -H + 8, bottom: -2 },
    };
  }

  get boss() { return false; }
  get sortY() { return this.y; }
  get hittable() { return true; }
  get finished() { return false; }

  hitPart(x, y, z) {
    if (Math.abs(y - this.y) > 26 + this.halfW) return null;
    const dx = x - this.x, sy = y - z - this.y;
    const { headBox: Hb, bodyBox: B } = this.art;
    if (Math.abs(dx) <= Hb.half && sy >= Hb.top && sy < Hb.bottom) return 'head';
    if (Math.abs(dx) <= B.half && sy >= B.top && sy <= B.bottom) return 'body';
    return null;
  }

  hit(damage, dirX, dirY, z, part) {
    const sp = Math.hypot(dirX, dirY) || 1, nx = dirX / sp, ny = dirY / sp;
    const dmg = damage * (part === 'head' ? HEADSHOT : 1);
    this.recent += dmg;
    this.recentT = 1.8;
    this.flash = 0.06;
    this.swayV += nx * (part === 'blast' ? 9 : part === 'melee' ? 7 : part === 'fire' ? 0 : 3);
    this.env.stats?.record(dmg, part);
    if (part !== 'fire' || Math.random() < 0.1) {
      this.env.numbers.push({
        text: String(Math.round(dmg)), x: this.x + (Math.random() - 0.5) * 8, y: this.y - H - 2, t: 0,
        color: part === 'head' ? '#ffd84a' : part === 'blast' || part === 'fire' ? '#ff8a3c' : part === 'melee' ? '#ff6a6a' : '#f2f2ea',
        big: part === 'head' || dmg >= 100,
      });
    }
    return { armor: false, killed: false, part, x: this.x, y: this.y, z, nx, ny, dummy: true };
  }

  stun() {}
  confuse() {}

  // Burlap and stuffing instead of blood.
  gore(particles) {
    particles.bits(this.x, this.y, 16, 6, BURLAP, 0.8);
  }

  update(dt, world, player, zombies, particles) {
    this.flash -= dt;
    // a damped spring: rocks back and settles
    this.swayV += -this.sway * 60 * dt;
    this.swayV *= Math.exp(-5 * dt);
    this.sway += this.swayV * dt;
    this.sway = Math.max(-0.6, Math.min(0.6, this.sway));
    if ((this.recentT -= dt) <= 0) this.recent = 0;
    if (this.mover) {
      this.mover.t += dt;
      this.x = this.home + Math.sin((this.mover.t * this.mover.speed) / this.mover.range) * this.mover.range;
    }
  }

  // The rail it slides on and its shadow: on the floor, under everything standing.
  drawShadow(ctx, renderer) {
    const x = renderer.snap(this.x), y = renderer.snap(this.y);
    if (this.mover) ctx.drawImage(RAIL, Math.round(this.home - this.mover.range - 8), y - 2, Math.round(this.mover.range * 2 + 16), 3);
    ctx.drawImage(SHADOW, x - 7, y - 3);
  }

  draw(ctx, renderer) {
    const x = renderer.snap(this.x), y = renderer.snap(this.y);
    ctx.save();
    ctx.translate(x, y - 2);
    ctx.rotate(this.sway);
    ctx.drawImage(this.flash > 0 ? HIT_IMG : IMG, -Math.floor(W / 2), -H + 2);
    ctx.restore();
  }

  // Running damage total over its head (drawn after lighting).
  drawEmissive(ctx) {
    if (this.recent <= 0) return;
    const s = String(Math.round(this.recent));
    const a = Math.min(1, this.recentT / 0.4);
    ctx.globalAlpha = a;
    drawText(ctx, s, Math.round(this.x - textWidth(s) / 2), Math.round(this.y - H - 10), 1, '#ffffff');
    ctx.globalAlpha = 1;
  }
}

// Floating damage numbers: rise and fade.
export function updateNumbers(list, dt) {
  for (const n of list) n.t += dt;
  return list.filter((n) => n.t < 0.9);
}

export function drawNumbers(ctx, list) {
  for (const n of list) {
    const k = n.t / 0.9;
    ctx.globalAlpha = Math.max(0, 1 - k * k);
    const size = n.big ? 2 : 1;
    const y = n.y - 16 * Math.sqrt(k) * 1.2;
    drawText(ctx, n.text, Math.round(n.x - textWidth(n.text, size) / 2), Math.round(y), size, n.color);
  }
  ctx.globalAlpha = 1;
}
