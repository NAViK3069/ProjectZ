// Effects drawn as pixel art: the shapes are painted (with ordinary canvas
// paths and gradients) on a little canvas of their own at twice the world's
// pixels - as fine as the guns are drawn - then every pixel is snapped to the
// effect's palette (so a gradient comes out in bands) and anything see-through
// is dithered in or out rather than left faint, and that's put down over the
// scene. Used by the flame fist and the galaxy skills.

export const RES = 2;   // its pixels to a world pixel
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => ((v + 0.5) / 16) * 255);
const layers = new Map();   // size -> { c, g }

// A palette: a list of '#rrggbb' colours (and the snapping worked out as it goes).
export function palette(hexes) {
  return { rgb: hexes.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]), near: new Map() };
}

// Paint(g) draws the effect with (0, 0) at world point (x, y), in world units,
// within `size` world px square; it comes out over ctx as pixels in palette P.
// With a `cache` (an object of the caller's own) and a `key`: the pixels are
// kept there, and while the key's the same they're put down again as they
// were rather than worked out afresh.
export function drawPixels(ctx, x, y, size, P, paint, cache = null, key = null) {
  const W = size * RES, rx = Math.round(x), ry = Math.round(y);
  const blit = (c) => {
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c, rx - size / 2, ry - size / 2, size, size);
    ctx.imageSmoothingEnabled = smooth;
  };
  if (cache && cache.key === key && cache.c?.width === W) return blit(cache.c);
  let L = cache ?? layers.get(size);
  if (!L || L.c?.width !== W) {
    const c = document.createElement('canvas');
    c.width = c.height = W;
    L = Object.assign(L ?? {}, { c, g: c.getContext('2d', { willReadFrequently: true }) });
    if (!cache) layers.set(size, L);
  }
  if (cache) cache.key = key;
  const g = L.g;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, W, W);
  g.setTransform(RES, 0, 0, RES, W / 2, W / 2);
  paint(g);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const img = g.getImageData(0, 0, W, W), d = img.data;
  for (let p = 0, n = 0; p < d.length; p += 4, n++) {
    const al = d[p + 3];
    if (!al) continue;
    if (al < BAYER[((n / W) & 3) * 4 + (n % W & 3)]) { d[p + 3] = 0; continue; }
    const key = (d[p] << 16) | (d[p + 1] << 8) | d[p + 2];
    let q = P.near.get(key);
    if (!q) {
      let bd = Infinity;
      for (const c of P.rgb) {
        const dr = d[p] - c[0], dg = d[p + 1] - c[1], db = d[p + 2] - c[2], dd = dr * dr * 2 + dg * dg * 4 + db * db * 3;
        if (dd < bd) { bd = dd; q = c; }
      }
      P.near.set(key, q);
    }
    d[p] = q[0]; d[p + 1] = q[1]; d[p + 2] = q[2]; d[p + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  blit(L.c);
}

// A soft glow (smooth, added on) round (x, y): stops [[0..1, 'rgba(...)'], ...].
export function glowAt(ctx, x, y, r, stops) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  ctx.fillStyle = gr;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}
