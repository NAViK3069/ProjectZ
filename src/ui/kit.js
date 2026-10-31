// The menus' look, shared by every screen: a lab terminal - dark slate panels,
// a strip of hazard stripes by each panel's title, the bigger 5x7 font for
// anything that's read, hazard yellow for what's picked and teal for what's
// live. Screens lay themselves out in `u` (a font pixel), every frame, and
// whatever can be clicked is noted as it's drawn - so the next frame knows
// what the mouse is over and what was clicked.

import { drawText, textWidth, drawBig, bigWidth } from './font.js';

export const K = {
  gold: '#ffd25a', goldDim: '#8a7430', teal: '#7ef0e0', red: '#ff6a5a', green: '#7dff9a', blue: '#6ad8ff',
  text: '#eef2e2', muted: '#9aa89f', faint: '#55635c', ink: '#050604',
  panel: 'rgba(14, 20, 18, 0.95)', panelHi: '#1c2622', edge: '#33443d', row: 'rgba(255, 210, 90, 0.12)', rowAlt: 'rgba(255, 255, 255, 0.025)',
};

export class Kit {
  constructor() {
    this.hits = [];
    this.hover = null;
    this.click = null;
  }

  // ---- input (before the frame's drawing): what the mouse is over, what was clicked ----
  pointer(input, dpr) {
    this.click = null;
    if (!input.mouse.active) return;
    const mx = input.mouse.x * dpr, my = input.mouse.y * dpr;
    this.hover = this.hits.find((h) => mx >= h.x0 && mx < h.x1 && my >= h.y0 && my < h.y1)?.id ?? null;
    if (input.wasPressed('Mouse0')) this.click = this.hover;
  }

  // ---- drawing ----
  begin(ctx, u, W, H) {
    Object.assign(this, { ctx, u, W, H });
    this.hits = [];
  }
  hit(id, x, y, w, h) {
    if (id) this.hits.push({ id, x0: x, y0: y, x1: x + w, y1: y + h });
  }
  rect(x, y, w, h, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  // text: big (5x7) by default, or the tiny one; align left / center / right of x
  text(s, x, y, { size = 1, color = K.text, align = 'left', small = false, shadow = K.ink } = {}) {
    s = String(s);
    const u = this.u, w = (small ? textWidth(s, size) : bigWidth(s, size)) * u;
    const tx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    (small ? drawText : drawBig)(this.ctx, s, Math.round(tx), Math.round(y), u * size, color, shadow);
    return w;
  }
  width(s, { size = 1, small = false } = {}) {
    return (small ? textWidth(String(s), size) : bigWidth(String(s), size)) * this.u;
  }
  // the scene behind dimmed, darker at the edges, faint scanlines over it
  shade(alpha = 0.72) {
    const { ctx, W, H, u } = this;
    ctx.fillStyle = `rgba(5, 8, 7, ${alpha})`;
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0, 0, 0, 0)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    for (let y = 0; y < H; y += 3 * u) ctx.fillRect(0, y, W, u);
  }
  // diagonal hazard stripes, yellow and black
  hazard(x, y, w, h, color = K.gold) {
    const { ctx, u } = this;
    ctx.save();
    ctx.beginPath();
    ctx.rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    ctx.clip();
    ctx.fillStyle = K.ink;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    const step = 6 * u;
    for (let sx = x - h; sx < x + w + h; sx += step) {
      ctx.beginPath();
      ctx.moveTo(sx, y + h);
      ctx.lineTo(sx + 3 * u, y + h);
      ctx.lineTo(sx + 3 * u + h, y);
      ctx.lineTo(sx + h, y);
      ctx.fill();
    }
    ctx.restore();
  }
  // a panel; with a title, a title strip (hazard stripes, the title, an optional note at its right). Returns where its content starts.
  panel(x, y, w, h, { title = '', note = '', accent = K.gold, noteColor = K.muted } = {}) {
    const u = this.u;
    this.rect(x - u, y - u, w + 2 * u, h + 2 * u, K.ink);
    this.rect(x, y, w, h, K.panel);
    this.rect(x, y, w, u, K.edge);
    this.rect(x, y + h - u, w, u, K.edge);
    this.rect(x, y, u, h, K.edge);
    this.rect(x + w - u, y, u, h, K.edge);
    if (!title) return y + 6 * u;
    this.rect(x + u, y + u, w - 2 * u, 13 * u, K.panelHi);
    this.hazard(x + u, y + u, 12 * u, 13 * u, accent);
    this.text(title, x + 17 * u, y + 4 * u, { color: accent });
    if (note) this.text(note, x + w - 6 * u, y + 5 * u, { small: true, color: noteColor, align: 'right' });
    this.rect(x + u, y + 14 * u, w - 2 * u, u, accent);
    return y + 20 * u;
  }
  // a button: primary (gold), normal, danger; hover lights it; disabled greys it and it can't be clicked
  button(id, x, y, w, h, label, { kind = 'normal', disabled = false, selected = false, size = 1, sub = '', small = false } = {}) {
    const u = this.u, hot = !disabled && (this.hover === id || selected);
    const edge = disabled ? K.edge : kind === 'primary' ? K.gold : kind === 'danger' ? K.red : hot ? K.teal : K.edge;
    const fill = disabled ? 'rgba(20, 26, 24, 0.9)' : kind === 'primary' ? (hot ? '#5a4a14' : '#3a3212') : kind === 'danger' ? (hot ? '#4a1a16' : '#2a1412') : hot ? '#1f3a36' : '#18211e';
    this.rect(x - u, y - u, w + 2 * u, h + 2 * u, K.ink);
    this.rect(x, y, w, h, edge);
    this.rect(x + u, y + u, w - 2 * u, h - 2 * u, fill);
    this.rect(x + u, y + u, w - 2 * u, u, 'rgba(255, 255, 255, 0.08)');
    const col = disabled ? K.faint : kind === 'primary' ? K.gold : kind === 'danger' ? K.red : hot ? '#ffffff' : K.text;
    const th = (small ? 5 : 7 * size) * u, ty = sub ? y + (h - th - 8 * u) / 2 : y + (h - th) / 2;
    this.text(label, x + w / 2, ty, { size, color: col, align: 'center', small });
    if (sub) this.text(sub, x + w / 2, ty + th + 3 * u, { small: true, color: disabled ? K.faint : K.muted, align: 'center' });
    if (hot && !disabled && kind !== 'primary' && !small) this.text('>', x + 5 * u, ty, { size, color: K.teal });
    if (!disabled) this.hit(id, x, y, w, h);
  }
  // a setting: its name at the left, its value at the right between arrows (clickable when it can be changed)
  stepper(id, x, y, w, h, label, value, { enabled = true, selected = false } = {}) {
    const u = this.u, hot = enabled && (selected || this.hover === `${id}:-1` || this.hover === `${id}:1`);
    if (hot) this.rect(x, y, w, h, K.row);
    const ty = y + (h - 7 * u) / 2;
    this.text(label, x + 4 * u, ty + u, { small: true, color: hot ? K.gold : K.muted });
    const vw = this.width(value);
    if (enabled) {
      const right = x + w - 4 * u, ax = right - vw - 18 * u;
      this.text('<', ax, ty, { color: hot ? K.gold : K.faint });
      this.text(value, right - 9 * u, ty, { color: '#ffffff', align: 'right' });
      this.text('>', right - 5 * u, ty, { color: hot ? K.gold : K.faint });
      this.hit(`${id}:-1`, x, y, w / 2, h);
      this.hit(`${id}:1`, x + w / 2, y, w / 2, h);
    } else this.text(value, x + w - 4 * u, ty, { color: K.text, align: 'right' });
  }
  // a setting picked from a list: its name at the left, the value (and a little down-arrow) at the
  // right; a click anywhere on it opens the list (see choices)
  select(id, x, y, w, h, label, value, { enabled = true, img = null } = {}) {
    const u = this.u, hot = enabled && this.hover === id;
    this.rect(x, y, w, h, hot ? K.row : 'rgba(255, 255, 255, 0.03)');
    const ty = y + (h - 7 * u) / 2;
    this.text(label, x + 4 * u, ty + u, { small: true, color: hot ? K.gold : K.muted });
    let right = x + w - 4 * u;
    if (enabled) {
      // the arrow: a little triangle pointing down
      for (let i = 0; i < 3; i++) this.rect(right - 5 * u + i * u, ty + 2 * u + i * u, (5 - i * 2) * u, u, hot ? K.gold : K.muted);
      right -= 9 * u;
    }
    const vw = this.text(value, right, ty, { color: enabled ? '#ffffff' : K.muted, align: 'right' });
    if (img) this.icon(img, right - vw - 14 * u, y + (h - 10 * u) / 2, 10 * u);
    if (enabled) this.hit(id, x, y, w, h);
  }
  // a picture (a canvas) scaled up by whole pixels to fit a box `size` across, centred in it
  icon(img, x, y, size) {
    const res = img.res ?? 1, iw = img.width / res, ih = img.height / res;
    const sc = Math.max(1, Math.floor(Math.min(size / iw, size / ih)));
    this.ctx.drawImage(img, Math.round(x + (size - iw * sc) / 2), Math.round(y + (size - ih * sc) / 2), Math.round(iw * sc), Math.round(ih * sc));
  }
  // words split into lines no wider than w (the small font)
  wrap(s, w) {
    const out = [];
    let line = '';
    for (const word of String(s).split(' ')) {
      const t = line ? `${line} ${word}` : word;
      if (line && this.width(t, { small: true }) > w) { out.push(line); line = word; } else line = t;
    }
    if (line) out.push(line);
    return out;
  }
  // A list to pick from, over everything else (a dropdown made big): a card for each choice
  // - its picture, its name, a line or two about it, a note at its corner - the one picked now
  // lit gold. Only these can be clicked while it's up: `${id}:<n>`, or `${id}:close` outside it.
  choices(id, title, items, current, sel = -1) {
    const { u, W, H, ctx } = this;
    this.shade(0.6);
    this.hits = [];
    const cols = W >= 440 * u ? 3 : 2, gap = 6 * u, ch = 36 * u;
    const cw = Math.min(150 * u, Math.floor((W - 28 * u - gap * (cols - 1)) / cols)), rows = Math.ceil(items.length / cols);
    const pw = cols * cw + (cols - 1) * gap + 16 * u, ph = 26 * u + rows * (ch + gap) + 4 * u;
    const px = Math.round(W / 2 - pw / 2), py = Math.max(6 * u, Math.round(H / 2 - ph / 2));
    const y0 = this.panel(px, py, pw, ph, { title, note: 'CLICK ONE  -  THE NUMBER: ITS WAIT BETWEEN USES  -  ESC TO CLOSE' });
    const cards = [];
    items.forEach((it, i) => {
      const x = px + 8 * u + (i % cols) * (cw + gap), y = y0 + Math.floor(i / cols) * (ch + gap), hid = `${id}:${i}`;
      const on = it.key === current, hot = this.hover === hid || sel === i;
      this.rect(x - u, y - u, cw + 2 * u, ch + 2 * u, K.ink);
      this.rect(x, y, cw, ch, on ? K.gold : hot ? K.teal : K.edge);
      this.rect(x + u, y + u, cw - 2 * u, ch - 2 * u, on ? '#3a3212' : hot ? '#1f3a36' : '#141c19');
      // the picture, in a dark box edged in the skill's colour
      this.rect(x + 4 * u, y + 4 * u, 24 * u, 24 * u, it.color ?? K.edge);
      this.rect(x + 5 * u, y + 5 * u, 22 * u, 22 * u, '#0b100e');
      if (it.img) this.icon(it.img, x + 6 * u, y + 6 * u, 20 * u);
      else this.text('?', x + 16 * u, y + 9 * u, { size: 2, color: it.color ?? K.muted, align: 'center' });
      this.text(it.label, x + 32 * u, y + 4 * u, { color: on ? K.gold : hot ? '#ffffff' : K.text });
      if (it.note) this.text(it.note, x + cw - 4 * u, y + 5 * u, { small: true, color: K.faint, align: 'right' });
      this.wrap(it.desc ?? '', cw - 36 * u).slice(0, 3).forEach((l, j) => this.text(l, x + 32 * u, y + 14 * u + j * 7 * u, { small: true, color: K.muted }));
      cards.push([hid, x, y, cw, ch]);
    });
    for (const c of cards) this.hit(...c);
    this.hit(`${id}:close`, 0, 0, W, H);   // (after the cards: the first hit under the mouse is the one that counts)
  }
  // the keys at the bottom of the screen
  hints(s) {
    const { u, W, H } = this;
    this.rect(0, H - 13 * u, W, 13 * u, 'rgba(5, 8, 7, 0.85)');
    this.rect(0, H - 13 * u, W, u, K.edge);
    this.text(s, W / 2, H - 9 * u, { small: true, color: K.muted, align: 'center' });
  }
  // a message, in a box above the hints
  toast(s, color = K.red) {
    const { u, W, H } = this, w = this.width(s) + 16 * u;
    this.rect(W / 2 - w / 2 - u, H - 31 * u, w + 2 * u, 15 * u, K.ink);
    this.rect(W / 2 - w / 2, H - 30 * u, w, 13 * u, 'rgba(30, 12, 10, 0.95)');
    this.rect(W / 2 - w / 2, H - 30 * u, u * 2, 13 * u, color);
    this.text(s, W / 2, H - 27 * u, { color, align: 'center' });
  }
}
