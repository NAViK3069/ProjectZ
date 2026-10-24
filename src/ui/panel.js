// A simple menu panel in the HUD's pixel style, for the camp's machines and
// people (generator, workbench, quests, trader). A title, a line or two of
// text, then a list of rows; a row with an action can be clicked (or picked
// with W/S + E / Enter). Rows that can't be done right now show greyed out
// with a reason. Long lists scroll with the wheel.

import { drawText, textWidth } from './font.js';

const C = {
  bg: 'rgba(5, 7, 4, 0.78)', panel: '#141a11', edge: '#2c3526', row: '#1d2419', rowHi: '#2b3624',
  sel: '#9bd65a', text: '#e8ecd8', dim: '#7c8670', red: '#ff5a4a', gold: '#ffd84a', frame: '#050604',
};
const W = 230, ROW = 15;

export class Panel {
  // content(): { title, lines: [string], rows: [{ text, right?, sub?, ok?, action?, color? }] } - rebuilt every frame
  constructor() {
    this.content = null;
    this.sel = 0;
    this.scroll = 0;
    this.zones = [];
    this.flash = null;
  }

  open(content) {
    this.content = content;
    this.sel = 0;
    this.scroll = 0;
    this.flash = null;
  }

  say(text, color = C.sel) {
    this.flash = { text, color, t: 2 };
  }

  // returns false when the panel closes
  update(mouse, input) {
    const c = this.content();
    const rows = c.rows;
    if (input.wasPressed('Escape', 'Tab')) return false;
    if (input.wasPressed('KeyW', 'ArrowUp')) this.sel = (this.sel + rows.length - 1) % Math.max(1, rows.length);
    if (input.wasPressed('KeyS', 'ArrowDown')) this.sel = (this.sel + 1) % Math.max(1, rows.length);
    if (input.wheel) this.scroll = Math.max(0, this.scroll + input.wheel);
    let hover = null;
    for (const z of this.zones) if (mouse && mouse.x >= z.x && mouse.x < z.x + z.w && mouse.y >= z.y && mouse.y < z.y + z.h) hover = z;
    if (hover) this.sel = hover.i;
    const go = (input.wasPressed('Mouse0') && hover) || input.wasPressed('Enter', 'KeyE', 'Space');
    if (go && input.wasPressed('KeyE') && !hover && !rows[this.sel]?.action) return false;   // E with nothing to do: close
    if (go) {
      const r = rows[this.sel];
      if (r?.action && r.ok !== false) {
        const res = r.action();
        if (typeof res === 'string') this.say(res);
      } else if (r?.why) this.say(r.why, C.red);
    }
    if (this.flash && (this.flash.t -= 1 / 60) <= 0) this.flash = null;
    return true;
  }

  draw(ctx, r) {
    const u = r.scale, SW = r.width / u, SH = r.height / u;
    const c = this.content();
    const px = (x, y, w, h, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x * u), Math.round(y * u), Math.round(w * u), Math.round(h * u));
    };
    const text = (s, x, y, color) => drawText(ctx, s, Math.round(x * u), Math.round(y * u), u, color);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, r.width, r.height);
    const lines = c.lines ?? [];
    const maxRows = Math.max(3, Math.floor((SH - 70 - lines.length * 8) / ROW));
    const visible = Math.min(c.rows.length, maxRows);
    this.scroll = Math.min(this.scroll, Math.max(0, c.rows.length - visible));
    if (this.sel < this.scroll) this.scroll = this.sel;
    if (this.sel >= this.scroll + visible) this.scroll = this.sel - visible + 1;
    const H = 24 + lines.length * 8 + visible * ROW + 18;
    const x0 = Math.round(SW / 2 - W / 2), y0 = Math.round(SH / 2 - H / 2);
    px(x0 - 1, y0 - 1, W + 2, H + 2, C.frame);
    px(x0, y0, W, H, C.panel);
    px(x0, y0, W, 13, C.edge);
    text(c.title, x0 + 5, y0 + 4, C.gold);
    const close = 'ESC CLOSE';
    text(close, x0 + W - textWidth(close) - 5, y0 + 4, C.dim);
    let y = y0 + 17;
    for (const l of lines) {
      text(l, x0 + 6, y, C.text);
      y += 8;
    }
    y += 2;
    this.zones = [];
    for (let k = 0; k < visible; k++) {
      const i = this.scroll + k, row = c.rows[i], on = i === this.sel, ok = row.ok !== false;
      px(x0 + 4, y, W - 8, ROW - 2, on ? C.rowHi : C.row);
      if (on) px(x0 + 4, y, 2, ROW - 2, ok ? C.sel : C.red);
      text(row.text, x0 + 9, y + 2, ok ? row.color ?? C.text : C.dim);
      if (row.sub) text(row.sub, x0 + 9, y + 8, ok ? C.dim : '#4f574a');
      if (row.right) text(row.right, x0 + W - 9 - textWidth(row.right), y + 2, ok ? C.gold : C.dim);
      this.zones.push({ x: x0 + 4, y, w: W - 8, h: ROW - 2, i });
      y += ROW;
    }
    if (c.rows.length > visible) text(`${this.scroll + 1}-${this.scroll + visible} / ${c.rows.length}  WHEEL TO SCROLL`, x0 + 6, y, C.dim);
    if (this.flash) text(this.flash.text, x0 + W / 2 - textWidth(this.flash.text) / 2, y0 + H - 9, this.flash.color);
    ctx.restore();
  }
}
