// Pixel-font menus (title, pause, game over). Works with the mouse (hover +
// click), the keyboard (W/S or arrows + Enter/Space/E) and touch (tap).

import { drawText, textWidth } from './font.js';

const SIZE = 2;           // font scale for items
const ROW = 16;           // HUD px between items
const PAD = 5;

export class Menu {
  // items: [{ label, action }]
  constructor(items) {
    this.items = items;
    this.sel = 0;
    this.rects = [];      // css-px hit boxes, filled in by draw()
    this.lastMouse = null;
  }

  update(input) {
    if (input.wasPressed('KeyW', 'ArrowUp')) this.sel = (this.sel + this.items.length - 1) % this.items.length;
    if (input.wasPressed('KeyS', 'ArrowDown')) this.sel = (this.sel + 1) % this.items.length;
    // hovering with the mouse moves the selection (only when it actually moves)
    const m = input.mouse, key = `${m.x},${m.y}`;
    if (m.active && key !== this.lastMouse) {
      this.lastMouse = key;
      const i = this.hit(m.x, m.y);
      if (i >= 0) this.sel = i;
    }
    if (input.wasPressed('Enter', 'Space', 'KeyE')) return this.activate(this.sel);
    if (input.wasPressed('Mouse0')) {
      const i = this.hit(m.x, m.y);
      if (i >= 0) return this.activate(i);
    }
  }

  // touch: returns true if the tap landed on an item
  tap(x, y) {
    const i = this.hit(x, y);
    if (i < 0) return false;
    this.activate(i);
    return true;
  }

  hit(x, y) {
    return this.rects.findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  }

  activate(i) {
    this.sel = i;
    this.items[i].action();
  }

  // Draws the items centred on HUD-px x, starting at HUD-px y.
  draw(ctx, r, cx, y, time) {
    const u = r.scale;
    this.rects = [];
    this.items.forEach((item, i) => {
      const on = i === this.sel;
      const label = on ? `> ${item.label} <` : item.label;
      const w = textWidth(label, SIZE), h = 5 * SIZE;
      const x = Math.round(cx - w / 2), iy = y + i * ROW;
      if (on) {
        ctx.fillStyle = 'rgba(215, 49, 61, 0.22)';
        ctx.fillRect((x - PAD) * u, (iy - 3) * u, (w + PAD * 2) * u, (h + 6) * u);
      }
      const pulse = on ? (Math.sin(time * 6) > 0 ? '#ffffff' : '#ffd0d0') : '#a7ae98';
      drawText(ctx, label, x * u, iy * u, u * SIZE, pulse);
      this.rects.push({ x: ((x - PAD) * u) / r.dpr, y: ((iy - 3) * u) / r.dpr, w: ((w + PAD * 2) * u) / r.dpr, h: ((h + 6) * u) / r.dpr });
    });
  }
}
