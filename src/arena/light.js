// Side-view lighting. Light comes from the lamps hanging under each ceiling,
// the screens, tanks and the acid, plus muzzle flashes and blasts.
//
// A light map the size of the view is filled with the ambient colour and the
// lights are added into it, then it's multiplied over the scene. Each lamp's
// light is worked out once, per pixel, into its own little image: a wide cone
// pointing down whose edges soften away instead of stopping on a line, that
// fades out gradually the further it reaches, with a soft halo round the bulb
// - and where it meets the floor it sinks into the floor's face over a few
// pixels rather than being cut off. After the multiply, the glowing things go
// on top (bulbs, screens, a faint haze in each beam, the acid).

import { makeCanvas } from '../engine/pixel.js';
import { T, SOLID, PLAT, ACID, LOW } from './level.js';

const AMBIENT = '#7a8494';   // bright enough to see the whole lab by, lamps or not
const AMBIENT_LIFT = 0.35;   // every map's ambient, this much of the way up to white: lamps shot out, it's still a place you can see in
const REACH = 220;             // px: how far a lamp's light carries before it's gone
const CONE = 0.78, SOFT = 0.5;  // half-angle of the beam (rad) and how wide its edge fades
const WARM = [255, 238, 210];

const lifted = (hex) => '#' + [1, 3, 5].map((i) => { const v = parseInt(hex.slice(i, i + 2), 16); return Math.round(v + (255 - v) * AMBIENT_LIFT).toString(16).padStart(2, '0'); }).join('');

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// One lamp's light, per pixel. floor: px below the bulb where the floor is.
function lampSprite(floor) {
  const w = REACH * 2, h = Math.min(REACH, floor + 24) + 24, bx = REACH, by = 24;
  const [c, g] = makeCanvas(w, h);
  const img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x - bx, dy = y - by, dist = Math.hypot(dx, dy);
    // falls off smoothly all the way out to REACH
    const fall = Math.pow(Math.max(0, 1 - dist / REACH), 1.25);
    // the beam: full straight down, easing to nothing past its edge
    const ang = Math.atan2(Math.abs(dx), Math.max(0.01, dy));
    const cone = dy > -2 ? 1 - smoothstep(CONE - SOFT * 0.5, CONE + SOFT, ang) : 0;
    // a glow round the bulb that lights the ceiling and wall behind it a little
    const halo = Math.pow(Math.max(0, 1 - dist / 70), 2) * 0.55;
    let k = cone * fall * 1.35 + halo;
    // into the floor: fades out over its top few pixels
    if (dy > floor) k *= Math.exp(-(dy - floor) / 4);
    // and none through the ceiling it hangs from (9 px up)
    if (dy < -9) k *= Math.exp((dy + 9) / 3);
    k = Math.min(1, k);
    const i = (y * w + x) * 4;
    d[i] = WARM[0] * k;
    d[i + 1] = WARM[1] * k;
    d[i + 2] = WARM[2] * k;
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { img: c, ox: bx, oy: by };
}

export class Lights {
  constructor(level) {
    this.level = level;
    [this.c, this.g] = makeCanvas(1, 1);
    this.flashes = [];   // short lights: { x, y, r, color, t, max }
    // each lamp shines down to the first thing under it
    this.ambient = lifted(level.ambient ?? AMBIENT);
    // (the darker maps' own colours are too dark for the ambient alone to help: the whole scene's brought up by this first - see apply)
    this.boost = level.theme?.boost ?? 1;
    this.lamps = level.lamps.map((l) => {
      // hanging under a ceiling, or (outdoors) up on a pole standing on the floor below its cell
      const x = (l.cx + 0.5) * T, y = l.pole ? (l.cy - 2) * T + 4 : l.cy * T + 9;
      let cy = l.cy + 1;
      while (cy < level.h && ![SOLID, PLAT, LOW].includes(level.get(l.cx, cy))) cy++;
      const floor = cy * T;
      return { x, y, floor, pole: l.pole, on: true, swing: Math.random() * 6, broke: 0, spark: 0, sprite: Lights.sprite(floor - y) };
    });
  }

  // sprites are shared by lamps that hang the same height over their floor
  static sprite(drop) {
    Lights.cache ??= new Map();
    if (!Lights.cache.has(drop)) Lights.cache.set(drop, lampSprite(drop));
    return Lights.cache.get(drop);
  }

  flash(x, y, r, color, t) {
    this.flashes.push({ x, y, r, color, t, max: t });
  }

  update(dt) {
    for (const f of this.flashes) f.t -= dt;
    this.flashes = this.flashes.filter((f) => f.t > 0);
    for (const l of this.lamps) {
      l.swing += dt;
      l.broke -= dt;
      l.spark -= dt;
      if (!l.on && Math.random() < dt * 0.4) {
        l.spark = 0.08;
        this.sparked = l;   // the game throws a few sparks out of it
      }
    }
  }

  // A shot passing the bulb breaks it.
  hitLamp(x, y) {
    for (const l of this.lamps) if (l.on && Math.abs(x - l.x) < 3.5 && Math.abs(y - (l.y - 3)) < 3) {
      l.on = false;
      l.broke = 0.25;
      return l;
    }
    return null;
  }

  // Build the light map for the view and multiply it over the scene.
  // extra: more lights this frame, [{ x, y, r, rgb, k }]
  apply(ctx, r, time, extra = []) {
    const w = Math.ceil(r.viewW) + 2, h = Math.ceil(r.viewH) + 2, ox = Math.floor(r.left), oy = Math.floor(r.top);
    if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; }
    const g = this.g, L = this.level;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = this.ambient;
    g.fillRect(0, 0, w, h);
    g.setTransform(1, 0, 0, 1, -ox, -oy);
    g.globalCompositeOperation = 'lighter';
    const radial = (x, y, rad, rgb, k) => {
      if (x + rad < ox || x - rad > ox + w || y + rad < oy || y - rad > oy + h) return;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(${rgb}, ${k})`);
      gr.addColorStop(1, `rgba(${rgb}, 0)`);
      g.fillStyle = gr;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    };
    for (const l of this.lamps) {
      if (!l.on) {
        // a shot-out lamp: the dim red emergency light in its fitting, and the odd spark
        radial(l.x, l.y, 34, '255, 60, 40', 0.2 + (l.spark > 0 ? 0.5 : 0));
        continue;
      }
      const s = l.sprite;
      g.globalAlpha = 0.94 + 0.06 * Math.sin(time * 37 + l.x);
      g.drawImage(s.img, Math.round(l.x - s.ox), Math.round(l.y - s.oy));
      g.globalAlpha = 1;
    }
    // the acid glows green up the walls of the vat
    for (let cx = 0; cx < L.w; cx++) for (let cy = 0; cy < L.h; cy++) {
      if (L.get(cx, cy) !== ACID || L.get(cx, cy - 1) === ACID) continue;
      radial((cx + 0.5) * T, cy * T, 56, '90, 255, 120', 0.24 + 0.05 * Math.sin(time * 3 + cx));
    }
    for (const d of L.deco) {
      if (d.kind === 'tank') radial(d.x * T + 13, d.y * T + 36, 56, '80, 240, 150', 0.32);
      if (d.kind === 'monitors') radial(d.x * T + 22, d.y * T + 6, 44, '80, 220, 230', 0.28);
      if (d.kind === 'reactor') radial(d.x * T + 48, d.y * T + 34, 84, '70, 200, 220', 0.3);
      if (d.kind === 'server') radial(d.x * T + 14, d.y * T + 44, 34, '60, 240, 120', 0.16);
      if (d.kind === 'skillbay') radial(d.x * T + d.w * 8, d.y * T + 22, 40, '80, 220, 240', 0.32);
      if (d.kind === 'medcab') radial(d.x * T + d.w * T - 16, d.y * T + 30, 36, '180, 225, 255', 0.3);
      if (d.kind === 'gunlocker') radial(d.x * T + d.w * 8, d.y * T + 30, 50, '255, 230, 180', 0.12);
    }
    for (const f of this.flashes) radial(f.x, f.y, f.r, f.color, Math.min(1, f.t / f.max) * 1.1);
    for (const e of extra) radial(e.x, e.y, e.r, e.rgb, e.k);
    // over the scene
    ctx.save();
    if (this.boost > 1) {
      const v = Math.round(255 * (1 - 1 / this.boost));
      ctx.globalCompositeOperation = 'color-dodge';
      ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
      ctx.fillRect(ox, oy, w, h);
    }
    ctx.globalCompositeOperation = 'multiply';
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.c, ox, oy);
    ctx.restore();
  }

  // The glowing things, after the lighting.
  glow(ctx, time) {
    const L = this.level;
    // a faint haze hanging in each beam (the same soft shape as its light)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.13;
    for (const l of this.lamps) if (l.on) ctx.drawImage(l.sprite.img, Math.round(l.x - l.sprite.ox), Math.round(l.y - l.sprite.oy));
    ctx.restore();
    // lamp fittings: a shade on a cable, a bulb (or a broken one)
    for (const l of this.lamps) {
      const x = Math.round(l.x), y = Math.round(l.y), top = Math.floor(l.y / T) * T;
      ctx.fillStyle = '#0b100f';
      if (l.pole) { ctx.fillRect(x - 1, y - 4, 2, l.floor - y + 4); ctx.fillRect(x - 3, l.floor - 2, 6, 2); }   // a lamp post
      else ctx.fillRect(x, top, 1, y - 5 - top);
      ctx.fillRect(x - 5, y - 6, 11, 4);
      ctx.fillStyle = '#3a4c46';
      ctx.fillRect(x - 4, y - 5, 9, 2);
      ctx.fillStyle = l.on ? '#fffbe6' : l.spark > 0 ? '#ffd27a' : '#5a1a14';
      ctx.fillRect(x - 2, y - 2, 5, 2);
      if (l.on) {
        ctx.fillStyle = 'rgba(255, 240, 200, 0.5)';
        ctx.fillRect(x - 3, y - 2, 7, 3);
      }
    }
    // the acid
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let cx = 0; cx < L.w; cx++) for (let cy = 0; cy < L.h; cy++) {
      if (L.get(cx, cy) !== ACID) continue;
      const x = cx * T, y = cy * T;
      ctx.fillStyle = 'rgba(80, 230, 90, 0.55)';
      ctx.fillRect(x, y + 2, T, T - 2);
      ctx.fillStyle = '#c8ff8a';
      const wv = Math.round(Math.sin(time * 4 + cx) * 1.5);
      ctx.fillRect(x, y + 1 + wv, T, 1);
      if (Math.sin(time * 3 + cx * 7) > 0.8) ctx.fillRect(x + ((cx * 5) % 12), y - 1 - ((time * 10 + cx) % 3 | 0), 2, 2);   // a bubble popping
    }
    ctx.restore();
  }

  // The glowing fittings on the back wall - screens, coolant, the tanks' fluid,
  // the cabinets - after the lighting. (Drawn on a layer of their own, so
  // whoever stands in front of them hides them: see main.js.)
  glowDeco(ctx, time) {
    const L = this.level;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const d of L.deco) {
      const x = d.x * T, y = d.y * T;
      if (d.kind === 'monitors') {
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = 'rgba(70, 200, 210, 0.5)';
          ctx.fillRect(x + i * 15 + 2, y + 2, 10, 6);
          ctx.fillStyle = '#b8fff4';
          for (let j = 0; j < 3; j++) if (Math.sin(time * 2 + i * 3 + j) > -0.3) ctx.fillRect(x + i * 15 + 3, y + 3 + j * 2, 3 + ((i * 3 + j * 5) % 6), 1);
        }
      }
      if (d.kind === 'reactor') for (let i = 0; i < 4; i++) {
        const k = 0.35 + 0.15 * Math.sin(time * 2 + i);
        ctx.fillStyle = `rgba(60, 200, 220, ${k})`;
        ctx.fillRect(x + 8 + i * 22, y + 12, 14, 42);
      }
      if (d.kind === 'tank') {
        ctx.fillStyle = 'rgba(60, 220, 140, 0.18)';
        ctx.fillRect(x + 3, y + 10, 20, 54);
        ctx.fillStyle = 'rgba(160, 255, 200, 0.7)';
        for (let i = 0; i < 4; i++) ctx.fillRect(x + 6 + ((i * 7 + d.x) % 14), y + 60 - (((time * 18 + i * 13) % 48) | 0), 1, 1);   // bubbles rising
      }
      if (d.kind === 'skillbay') {
        // the skill bay's screen: a line shot out to a hook, a Q, a scan line running down it
        const sx = x + 8, sy = y + 10, sw = d.w * T - 16;
        ctx.fillStyle = 'rgba(40, 140, 170, 0.35)';
        ctx.fillRect(sx, sy, sw, 26);
        ctx.fillStyle = '#8ff0ff';
        for (let i = 0; i < 22; i++) ctx.fillRect(sx + 12 + i, sy + 20 - Math.round(i * 0.5), 1, 1);
        ctx.fillRect(sx + 33, sy + 8, 3, 3);
        ctx.fillStyle = '#d8fbff';
        for (const [i, j] of [[1, 0], [0, 1], [2, 1], [0, 2], [2, 2], [1, 3], [2, 4]]) ctx.fillRect(sx + 4 + i, sy + 3 + j, 1, 1);   // a Q
        ctx.fillStyle = 'rgba(140, 240, 255, 0.25)';
        ctx.fillRect(sx, sy + Math.floor((time * 14) % 26), sw, 1);
      }
      if (d.kind === 'medcab') {
        ctx.fillStyle = 'rgba(120, 200, 240, 0.16)';
        ctx.fillRect(x + d.w * T - 29, y + 8, 26, d.h * T - 14);
      }
      if (d.kind === 'server') for (let j = 4; j < 84; j += 6) if (Math.sin(time * 5 + j) > 0) {
        ctx.fillStyle = '#3df07a';
        ctx.fillRect(x + 21, y + j + 1, 2, 1);
      }
    }
    ctx.restore();
  }
}
