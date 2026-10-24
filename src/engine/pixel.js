// Small helpers for building pixel art at runtime.

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}

export function rect(g, color, x, y, w, h) {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

// Builds a sprite from rows of characters; each character maps to a colour
// in `palette` (characters not in the palette are transparent). `frame`
// optionally places the rows at (x, y) inside a w x h canvas.
export function spriteFromRows(rows, palette, frame = {}) {
  const w = frame.w ?? Math.max(...rows.map((r) => r.length)), h = frame.h ?? rows.length;
  const [c, g] = makeCanvas(w, h);
  paintRows(g, rows, palette, frame.x ?? 0, frame.y ?? 0);
  return c;
}

export function paintRows(g, rows, palette, ox = 0, oy = 0) {
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (palette[ch]) rect(g, palette[ch], ox + x, oy + y, 1, 1);
    });
  });
}

// Solid-colour silhouette of an image (hit flashes).
export function silhouette(img, color) {
  const [c, g] = makeCanvas(img.width, img.height);
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-in';
  rect(g, color, 0, 0, img.width, img.height);
  return c;
}

// Hard-edged pixel ellipse, used for drop shadows.
export function makeShadow(w, h, color = 'rgba(14, 10, 24, 0.38)') {
  const [c, g] = makeCanvas(w, h);
  g.fillStyle = color;
  const rx = w / 2, ry = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x + 0.5 - rx) / rx, ny = (y + 0.5 - ry) / ry;
      if (nx * nx + ny * ny <= 1) g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

export async function loadImages(map) {
  const out = {};
  await Promise.all(Object.entries(map).map(async ([key, src]) => {
    out[key] = await loadImage(src);
  }));
  return out;
}
