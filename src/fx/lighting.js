// Darkness + coloured lights, done in two steps.
//
// 1. Floor light: a light map (one texel per world pixel, so lighting is as
//    chunky as the art) filled with a dark ambient colour; each light adds a
//    polygon of rays that stop at walls and props, so they cast shadows.
//
// 2. Surface light: the scene isn't flat - walls, props and characters stand
//    up off the floor and are drawn over it. A copy of the floor map is made
//    and, in the same back-to-front order the scene was drawn, every upright
//    thing is painted into it with the light that reaches the floor at its
//    base:
//      - characters / props: their silhouette takes the light at their feet;
//        a low block's top takes the light around it, a tall block's top
//        (above the flashlight) stays dark
//      - a wall's front face takes the light on the floor right in front of it
//      - a low wall's top can be lit (from either side); a tall wall's top is
//        above head height, so lights down here never reach it
//    That map is multiplied over the scene.

import { makeCanvas } from '../engine/pixel.js';

const AMBIENT = '#13170f';   // default; a world can ask for brighter (lighting.ambient)
const SNAP = { snap: (v) => Math.round(v) };   // silhouettes only need whole pixels
const SHADOW = 0.82;     // how much of a light a low block's shadow takes away
const NONE = {};         // a static light with no low shadows (nothing to cache)
// faces vs tops: a top faces the ceiling lamps, a side faces sideways
const TOP_LIFT = 0.2;    // tops get this much more of the light that reaches them
const SIDE_DARK = 0.26;  // sides get this much less

export class Lighting {
  constructor(world) {
    this.world = world;
    [this.ground, this.g] = makeCanvas(1, 1);     // floor light
    [this.screen, this.s] = makeCanvas(1, 1);     // floor + upright surfaces
    [this.temp, this.t] = makeCanvas(128, 96);    // one silhouette at a time
    [this.row, this.r] = makeCanvas(128, 1);      // light sampled along a floor row
    [this.lightCanvas] = makeCanvas(1, 1);        // a moving light being composed (flashlight)
    this.ox = 0;
    this.oy = 0;
  }

  begin(renderer) {
    const w = Math.ceil(renderer.viewW) + 3, h = Math.ceil(renderer.viewH) + 3;
    for (const c of [this.ground, this.screen]) {
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
    }
    this.ox = Math.floor(renderer.left) - 1;
    this.oy = Math.floor(renderer.top) - 1;
    this.view = { l: this.ox, t: this.oy, r: this.ox + w, b: this.oy + h };
    this.lit = [];   // where this frame's lights reach (props out of all of them skip the surface pass)
    const g = this.g;
    g.globalCompositeOperation = 'source-over';
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = this.ambient ?? AMBIENT;
    g.fillRect(0, 0, w, h);
    g.setTransform(1, 0, 0, 1, -this.ox, -this.oy);
    g.globalCompositeOperation = 'lighter';
  }

  // light: { x, y, radius, color: [r, g, b], intensity, angle?, spread?, rays?, shadows?, static? }
  // With `spread` it's a cone of half-angle `spread` around `angle`. Static
  // lights (lamps) cache their polygon until a prop moves. Returns the polygon.
  add(light) {
    const { x, y, radius: r } = light;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x + r < this.view.l || x - r > this.view.r || y + r < this.view.t || y - r > this.view.b) return;
    if ((light.intensity ?? 1) > 0.01) this.lit.push(light);
    const version = this.world.version;
    const cached = light.poly && light.polyVersion === version;
    const poly = cached ? light.poly : this.shape(light);
    if (light.static) {
      light.poly = poly;
      light.polyVersion = version;
    }
    const k = light.intensity ?? 1, g = this.g;
    // light passes over low things; they only throw a short shadow behind them
    if (light.shadows !== false) {
      if (light.static && light.canvas && light.canvasVersion === version) {
        if (light.canvas !== NONE) return this.blit(light.canvas, k), poly;
      } else {
        const shadows = this.lowShadows(light);
        if (shadows.length) {
          const c = this.compose(light, poly, shadows, light.static ? null : this.lightCanvas);
          if (light.static) {
            light.canvas = c;
            light.canvasVersion = version;
          }
          this.blit(c, k);
          return poly;
        }
        if (light.static) {
          light.canvas = NONE;   // nothing low in reach: just the polygon
          light.canvasVersion = version;
        }
      }
    }
    g.fillStyle = this.gradient(g, light, k);
    this.trace(g, poly);
    g.fill();
    return poly;
  }

  gradient(g, light, k) {
    const { x, y, radius: r } = light, [cr, cg, cb] = light.color;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${k})`);
    grad.addColorStop(0.45, `rgba(${cr}, ${cg}, ${cb}, ${k * 0.5})`);
    grad.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
    return grad;
  }

  trace(g, poly) {
    g.beginPath();
    g.moveTo(poly[0], poly[1]);
    for (let i = 2; i < poly.length; i += 2) g.lineTo(poly[i], poly[i + 1]);
    g.closePath();
  }

  // One light (at full strength) with its low shadows cut out, on its own
  // canvas: { canvas, x, y } where (x, y) is the canvas's world position.
  compose(light, poly, shadows, reuse) {
    const R = Math.ceil(light.radius) + 1, size = R * 2 + 1;
    const c = reuse ?? makeCanvas(size, size)[0];
    if (c.width < size || c.height < size) {
      c.width = Math.max(c.width, size);
      c.height = Math.max(c.height, size);
    }
    const g = c.getContext('2d'), ox = Math.floor(light.x) - R, oy = Math.floor(light.y) - R;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, size, size);
    g.setTransform(1, 0, 0, 1, -ox, -oy);
    g.fillStyle = this.gradient(g, light, 1);
    this.trace(g, poly);
    g.fill();
    // all shadows in one path, so where two overlap it isn't any darker
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = `rgba(0, 0, 0, ${SHADOW})`;
    g.beginPath();
    for (const s of shadows) {
      g.moveTo(s[0], s[1]);
      for (let i = 2; i < s.length; i += 2) g.lineTo(s[i], s[i + 1]);
      g.closePath();
    }
    g.fill();
    return { canvas: c, x: ox, y: oy, w: size, h: size };
  }

  blit(c, k) {
    const g = this.g;
    g.globalAlpha = k;
    g.drawImage(c.canvas, 0, 0, c.w, c.h, c.x, c.y, c.w, c.h);
    g.globalAlpha = 1;
  }

  // Shadow polygons behind every low wall / low prop in reach of the light.
  // A shadow is the far side of the block swept straight away from the light
  // by a short distance: the taller the block and the further the light, the
  // longer - but never long (they're low). The block itself isn't shadowed,
  // so its top can still be lit.
  lowShadows(light) {
    const { x, y, radius } = light, H = light.height ?? (light.static ? 40 : 24);
    const out = [];
    const add = (b, h) => {
      const cx = Math.max(b.l, Math.min(x, b.r)), cy = Math.max(b.t, Math.min(y, b.b));
      const d = Math.hypot(cx - x, cy - y);
      if (d > radius || (x > b.l && x < b.r && y > b.t && y < b.b)) return;
      const len = Math.min(3 + h * 1.2, 2 + (d * h) / H);
      // corners going round; an edge facing away from the light is on the far side
      const v = [[b.l, b.t], [b.l, b.b], [b.r, b.b], [b.r, b.t]];
      const back = v.map((a, i) => {
        const n = v[(i + 1) % 4], nx = -(n[1] - a[1]), ny = n[0] - a[0];
        return nx * (x - a[0]) + ny * (y - a[1]) <= 0;
      });
      const start = back.findIndex((bk, i) => bk && !back[(i + 3) % 4]);
      if (start < 0) return;
      const chain = [];
      for (let i = start; back[i % 4] && chain.length < 4; i++) chain.push(v[i % 4]);
      chain.push(v[(start + chain.length) % 4]);
      const poly = [];
      for (const [px, py] of chain) poly.push(px, py);
      for (let i = chain.length - 1; i >= 0; i--) {
        const [px, py] = chain[i], dl = Math.hypot(px - x, py - y) || 1;
        poly.push(px + ((px - x) / dl) * len, py + ((py - y) / dl) * len);
      }
      out.push(poly);
    };
    const R = light.radius;
    for (const b of this.world.lowRects) if (b.r > light.x - R && b.l < light.x + R && b.b > light.y - R && b.t < light.y + R) add(b, b.h);
    for (const p of this.world.propsNear(light.x, light.y, light.radius)) if (!p.tall && !p.ghost && p.shadowH && !p.lights?.includes(light)) add(p.box, p.shadowH);
    return out;
  }

  // Polygon (flat [x, y, ...]) of the floor the light reaches (tall things stop it).
  shape(light) {
    const { x, y, radius } = light;
    const pts = [];
    if (light.shadows === false) {
      const n = 16;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
      }
      return pts;
    }
    const cone = light.spread !== undefined;
    const n = light.rays ?? (cone ? 140 : 160);
    const a0 = cone ? light.angle - light.spread : 0;
    const span = cone ? light.spread * 2 : Math.PI * 2;
    if (cone) pts.push(x, y);
    for (let i = 0; i <= n - (cone ? 0 : 1); i++) {
      const a = a0 + (span * i) / n;
      const dx = Math.cos(a), dy = Math.sin(a);
      const d = this.world.castRay(x, y, dx, dy, radius, true);
      pts.push(x + dx * d, y + dy * d);
    }
    return pts;
  }

  // Step 2. `order` is what the scene drew, back to front: drawables
  // (anything with draw()) and { row } entries for wall rows.
  surfaces(order) {
    const s = this.s;
    s.globalCompositeOperation = 'source-over';
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.drawImage(this.ground, 0, 0);
    for (const item of order) {
      if (item.row !== undefined) this.wallRow(item.row);
      else this.upright(item);
    }
  }

  // Copy the floor light along row y (x .. x+w) into this.row, max'd with any extra rows.
  sampleRows(x, w, rows) {
    const r = this.r;
    if (this.row.width < w) this.row.width = w;
    r.globalCompositeOperation = 'source-over';
    r.clearRect(0, 0, this.row.width, 1);
    rows.forEach((y, i) => {
      r.globalCompositeOperation = i ? 'lighten' : 'source-over';
      r.drawImage(this.ground, x - this.ox, Math.round(y) - this.oy, w, 1, 0, 0, w, 1);
    });
  }

  // A character or prop: its silhouette, lit by the floor light at its base.
  upright(e) {
    const b = e.lightBox ? e.lightBox() : { x: e.x - 48, y: e.y - 44, w: 96, h: 54 };
    b.x = Math.floor(b.x);
    b.y = Math.floor(b.y);
    if (b.x + b.w < this.view.l || b.x > this.view.r || b.y + b.h < this.view.t || b.y > this.view.b) return;
    // a prop no light reaches is just the ambient colour - the floor under it already is
    if (e.fixedShape && !this.lit.some((l) => b.x - l.radius < l.x && b.x + b.w + l.radius > l.x && b.y - l.radius < l.y && b.y + b.h + l.radius > l.y)) return;
    const rows = e.lightRows ? e.lightRows() : [e.y + 1];
    const t = this.t;
    if (this.temp.width < b.w || this.temp.height < b.h) {
      this.temp.width = Math.max(this.temp.width, b.w);
      this.temp.height = Math.max(this.temp.height, b.h);
    }
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.globalCompositeOperation = 'source-over';
    t.globalAlpha = 1;
    t.clearRect(0, 0, b.w, b.h);
    if (e.fixedShape) {
      // props never change shape: draw them once and reuse the silhouette
      if (!e.mask) {
        const [m, mg] = makeCanvas(b.w, b.h);
        mg.setTransform(1, 0, 0, 1, -b.x, -b.y);
        e.draw(mg, SNAP);
        e.mask = m;
      }
      t.drawImage(e.mask, 0, 0);
    } else {
      t.setTransform(1, 0, 0, 1, -b.x, -b.y);
      e.draw(t, SNAP);
      t.setTransform(1, 0, 0, 1, 0, 0);
      t.globalAlpha = 1;
    }
    this.sampleRows(b.x, b.w, rows);
    t.globalCompositeOperation = 'source-in';
    t.drawImage(this.row, 0, 0, b.w, 1, 0, 0, b.w, b.h);
    // parts lit differently: a low block's top (light from the floor round it),
    // a tall block's top (out of reach - stays dark)
    const regions = e.lightRegions ? e.lightRegions() : [];
    if (regions.length) {
      // a block: its sides face sideways and take less of the light than its top
      const below = Math.max(...regions.map((r) => r.y1));
      t.globalCompositeOperation = 'source-atop';
      t.fillStyle = `rgba(0, 0, 0, ${SIDE_DARK})`;
      t.fillRect(0, below, b.w, b.h - below);
    }
    for (const r of regions) {
      t.globalCompositeOperation = 'source-atop';
      if (r.ambient) {
        t.fillStyle = this.ambient ?? AMBIENT;
        t.fillRect(0, r.y0, b.w, r.y1 - r.y0);
      } else {
        this.sampleRows(b.x, b.w, r.rows);
        t.drawImage(this.row, 0, 0, b.w, 1, 0, r.y0, b.w, r.y1 - r.y0);
        if (!e.mask) continue;
        // the top faces the lamps: a little brighter than the light round it
        // (added over the whole band, then trimmed back to the block's outline)
        t.globalCompositeOperation = 'lighter';
        t.globalAlpha = TOP_LIFT;
        t.drawImage(this.row, 0, 0, b.w, 1, 0, r.y0, b.w, r.y1 - r.y0);
        t.globalAlpha = 1;
        t.globalCompositeOperation = 'destination-in';
        t.drawImage(e.mask, 0, 0);
      }
    }
    this.s.drawImage(this.temp, 0, 0, b.w, b.h, b.x - this.ox, b.y - this.oy, b.w, b.h);
  }

  wallRow(cy) {
    const s = this.s, ox = this.ox, oy = this.oy;
    for (const f of this.world.wallFaces[cy] ?? []) {
      if (f.x + 16 < this.view.l || f.x > this.view.r) continue;
      if (f.low) {
        // waist-high: light passes over it, so its top is lit by the light
        // round it (either side, or over it), a little brighter for facing up
        this.sampleRows(f.x, 16, [f.front, f.back, f.front - 8]);
        s.drawImage(this.row, 0, 0, 16, 1, f.x - ox, f.top - oy, 16, 16);
        s.globalCompositeOperation = 'lighter';
        s.globalAlpha = TOP_LIFT;
        s.drawImage(this.row, 0, 0, 16, 1, f.x - ox, f.top - oy, 16, 16);
        s.globalAlpha = 1;
        s.globalCompositeOperation = 'source-over';
      } else {
        s.fillStyle = this.ambient ?? AMBIENT;   // too high for anything down here to light
        s.fillRect(f.x - ox, f.top - oy, 16, 16);
      }
      // front face: whatever lights the floor right in front of it, a bit
      // less (it faces sideways), so the top and the side read as two faces
      if (f.face) {
        s.drawImage(this.ground, f.x - ox, f.front - oy, 16, 1, f.x - ox, f.front - f.face - oy, 16, f.face);
        s.fillStyle = `rgba(0, 0, 0, ${f.low ? SIDE_DARK : SIDE_DARK * 0.5})`;
        s.fillRect(f.x - ox, f.front - f.face - oy, 16, f.face);
      }
    }
  }

  // Multiply the finished light map over the scene (ctx must be in world transform).
  apply(ctx) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.screen, this.ox, this.oy);
    ctx.restore();
  }

  // Extra additive wash over a light's area, for the blown-out flashlight look.
  glare(ctx, poly, color, alpha) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(poly[0], poly[1]);
    for (let i = 2; i < poly.length; i += 2) ctx.lineTo(poly[i], poly[i + 1]);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
