// Playing on a phone: the screen's controls stand in for the keyboard and mouse, so the game (and online) hears the
// same keys as ever. Left thumb: a stick, anywhere on the left - sideways to walk, right out to run, up to jump, down to
// crouch. Right thumb: a stick, anywhere on the right that isn't a button - it points the gun, and pushed far out it
// fires. Round them, the buttons. On the menus a tap is a click and a drag scrolls.
// Only ever played sideways and full screen: until then a screen that asks for it stands in front of everything.

import { drawText, textWidth } from '../ui/font.js';

const standalone = () => matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const canAsk = () => !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);

// A phone or tablet: touch is what it's mainly driven by (a laptop with a touch screen still has its mouse).
export const isPhone = navigator.maxTouchPoints > 0 && (matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));

const STICK_R = 54;        // css px: how far a stick goes
const WALK_AT = 0.3, UP_AT = 0.62, RUN_AT = 0.92, AIM_AT = 0.2, FIRE_AT = 0.72;   // how far out each starts (0..1)
const AIM_REACH = 110;     // world px: how far out the crosshair sits
const FACE_AFTER = 0.7;    // not aiming for this long: the gun turns to the way you're walking
const DRAG_ROW = 22;       // css px dragged on a menu for one notch of the wheel

class Stick {
  constructor() { this.id = null; this.ox = this.oy = this.x = this.y = 0; }
  start(e) { this.id = e.pointerId; this.ox = this.x = e.clientX; this.oy = this.y = e.clientY; }
  move(e) {
    this.x = e.clientX;
    this.y = e.clientY;
    // (the base follows the thumb when it drags past the rim)
    const dx = this.x - this.ox, dy = this.y - this.oy, d = Math.hypot(dx, dy);
    if (d > STICK_R) { this.ox = this.x - (dx / d) * STICK_R; this.oy = this.y - (dy / d) * STICK_R; }
  }
  get on() { return this.id !== null; }
  get vec() {
    const dx = this.x - this.ox, dy = this.y - this.oy, d = Math.hypot(dx, dy), m = this.on ? Math.min(1, d / STICK_R) : 0;
    return { x: d ? (dx / d) * m : 0, y: d ? (dy / d) * m : 0, m };
  }
}

// A disc in square blocks of side p, with a rim.
function disc(ctx, cx, cy, r, p, fill, rim) {
  cx = Math.round(cx);
  cy = Math.round(cy);
  for (let y = -r; y < r; y += p) {
    const h = y + p / 2, w = Math.round(Math.sqrt(Math.max(0, r * r - h * h)) / p) * p;
    if (w <= 0) continue;
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(cx - w, cy + y, w * 2, p); }
    if (rim) {
      const in2 = (r - p) * (r - p) - h * h, wi = in2 > 0 ? Math.round(Math.sqrt(in2) / p) * p : 0;
      ctx.fillStyle = rim;
      ctx.fillRect(cx - w, cy + y, w - wi, p);
      ctx.fillRect(cx + wi, cy + y, w - wi, p);
    }
  }
}

export class TouchControls {
  // how: combat() - the controls are up; aimFrom() - the shoulder, css px, and css px to a world px; scroll() - a tap is
  // only a tap once it's let go, a drag scrolls; showEsc() - nothing else on the screen gets you out; skill() - what's on Q
  constructor(input, how) {
    this.input = input;
    this.how = how;
    this.move = new Stick();
    this.aim = new Stick();
    this.held = new Map();      // pointer -> button
    this.tap = null;            // a finger on a menu: { id, y, moved, late }
    this.dir = { x: 1, y: 0 };  // where the gun points
    this.idle = 9;
    this.wasCombat = false;
    this.testFull = false;
    input.touchOn = true;
    input.onTouch = (e) => this.down(e);
    addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') this.moved(e); });
    const up = (e) => { if (e.pointerType !== 'mouse') this.up(e); };
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    addEventListener('blur', () => this.clear());
  }

  // ---------- full screen, sideways ----------
  get full() { return this.testFull || !!(document.fullscreenElement || document.webkitFullscreenElement) || standalone(); }
  get upright() { return innerHeight > innerWidth; }
  get blocked() { return !this.full || this.upright; }
  ask() {
    const el = document.documentElement, go = el.requestFullscreen ?? el.webkitRequestFullscreen;
    if (!go || this.full) return;
    Promise.resolve(go.call(el, { navigationUI: 'hide' })).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
    navigator.wakeLock?.request('screen').catch(() => {});   // (no going dark in the middle of a fight)
  }

  // ---------- the buttons ----------
  // Round the place the right thumb rests, in an arc; the small ones along the top. (css px)
  layout() {
    const W = innerWidth, H = innerHeight, r = Math.max(20, Math.min(30, H * 0.085)), m = 14;
    const ax = W - m - 2.7 * r, ay = H - m - 2.7 * r, skill = this.how.skill();
    const arc = (a, d = 4.5) => ({ x: ax + Math.cos((a * Math.PI) / 180) * d * r, y: ay + Math.sin((a * Math.PI) / 180) * d * r });
    const list = [
      { id: 'jump', key: 'Space', label: 'JUMP', r: r * 1.25, ...arc(180, 4.9) },
      { id: 'roll', key: 'ShiftLeft', label: 'ROLL', r, ...arc(212) },
      { id: 'skill', key: 'KeyQ', label: skill.cd > 0 ? String(Math.ceil(skill.cd)) : 'SKILL', r, dim: skill.cd > 0, gold: true, ...arc(240) },
      { id: 'hit', key: 'Mouse2', label: 'HIT', r, ...arc(267) },
      { id: 'reload', key: 'KeyR', label: 'RELOAD', r, ...arc(294) },
    ];
    if (!skill.has) list.splice(2, 1);
    const s = r * 0.72, gap = s * 2.3, top = s + 8;
    [['menu', 'Escape', 'MENU'], ['tab', 'Tab', 'TAB'], ['use', 'KeyE', 'USE'], ['swap', null, 'SWAP'], ['throw', 'KeyG', 'THROW'], ['nade', 'KeyF', 'NADE']].forEach(([id, key, label], i) => list.push({ id, key, label, r: s, x: W - m - s - gap * i, y: top }));
    return { list, ax, ay, r };
  }
  buttonAt(x, y) {
    let best = null, bd = Infinity;
    for (const b of this.layout().list) {
      const d = Math.hypot(x - b.x, y - b.y);
      if (d < b.r * 1.15 && d < bd) { best = b; bd = d; }
    }
    return best;
  }
  escAt(x, y) { return this.how.showEsc() && Math.hypot(x - (innerWidth - 34), y - 28) < 30; }

  // ---------- fingers ----------
  down(e) {
    e.preventDefault?.();
    if (this.blocked) { this.ask(); return true; }
    const I = this.input, x = e.clientX, y = e.clientY;
    if (this.how.combat()) {
      const b = this.buttonAt(x, y);
      if (b) {
        this.held.set(e.pointerId, b);
        if (b.id === 'swap') I.wheel = 1;
        else { I.keys.add(b.key); I.pressed.add(b.key); }
      } else if (x < innerWidth * 0.42) { if (!this.move.on) this.move.start(e); } else if (!this.aim.on) this.aim.start(e);
      return true;
    }
    if (this.escAt(x, y)) { I.pressed.add('Escape'); return true; }
    if (this.tap) return true;
    // on a menu: the mouse
    const late = this.how.scroll();
    this.tap = { id: e.pointerId, y, moved: false, late };
    I.mouse.x = x;
    I.mouse.y = y;
    I.mouse.active = true;
    I.mouse.down = true;
    if (!late) I.pressed.add('Mouse0');
    return true;
  }
  moved(e) {
    if (this.move.id === e.pointerId) this.move.move(e);
    if (this.aim.id === e.pointerId) this.aim.move(e);
    if (this.tap?.id === e.pointerId) {
      const I = this.input;
      I.mouse.x = e.clientX;
      I.mouse.y = e.clientY;
      if (this.tap.late) {
        const n = Math.trunc((this.tap.y - e.clientY) / DRAG_ROW);
        if (n) { I.wheel += n; this.tap.y -= n * DRAG_ROW; this.tap.moved = true; }
      }
    }
  }
  up(e) {
    const I = this.input, b = this.held.get(e.pointerId);
    if (b) {
      this.held.delete(e.pointerId);
      if (b.key) I.keys.delete(b.key);
    }
    if (this.move.id === e.pointerId) this.move.id = null;
    if (this.aim.id === e.pointerId) this.aim.id = null;
    if (this.tap?.id === e.pointerId) {
      if (this.tap.late && !this.tap.moved) I.pressed.add('Mouse0');
      I.mouse.down = false;
      I.pressed.add('Mouse0Up');
      this.tap = null;
    }
  }
  clear() {
    const I = this.input;
    this.move.id = this.aim.id = null;
    this.held.clear();
    this.tap = null;
    for (const k of ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space', 'ShiftLeft', 'KeyQ', 'Mouse2', 'KeyR', 'Escape', 'Tab', 'KeyE', 'KeyG', 'KeyF']) I.keys.delete(k);
    I.mouse.down = false;
    I.touchRun = false;
  }
  key(code, on) {
    const I = this.input;
    if (on && !I.keys.has(code)) { I.keys.add(code); I.pressed.add(code); }
    else if (!on) I.keys.delete(code);
  }

  // ---------- each frame, before anyone reads the keys ----------
  update(dt) {
    const I = this.input, combat = this.how.combat() && !this.blocked;
    if (combat !== this.wasCombat) this.clear();   // (a finger held across the change means nothing on the other side)
    this.wasCombat = combat;
    if (!combat) return;
    const v = this.move.vec, a = this.aim.vec;
    this.key('KeyA', v.x < -WALK_AT);
    this.key('KeyD', v.x > WALK_AT);
    this.key('KeyW', v.y < -UP_AT);
    this.key('KeyS', v.y > UP_AT);
    I.touchRun = v.m > RUN_AT && Math.abs(v.x) > 0.7;
    if (a.m > AIM_AT) {
      this.dir = { x: a.x / a.m, y: a.y / a.m };
      this.idle = 0;
    } else if ((this.idle += dt) > FACE_AFTER && Math.abs(v.x) > WALK_AT) this.dir = { x: Math.sign(v.x), y: 0 };
    const fire = a.m > FIRE_AT;
    if (fire && !I.mouse.down) I.pressed.add('Mouse0');
    if (!fire && I.mouse.down) I.pressed.add('Mouse0Up');
    I.mouse.down = fire;
    // the crosshair, out along the gun: to the game, that's the mouse
    const s = this.how.aimFrom();
    I.mouse.active = true;
    I.mouse.x = s.x + this.dir.x * AIM_REACH * s.k;
    I.mouse.y = s.y + this.dir.y * AIM_REACH * s.k;
  }

  // ---------- drawing (device px) ----------
  draw(ctx, dpr) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.blocked) this.drawGate(ctx, dpr);
    else if (this.how.combat()) this.drawControls(ctx, dpr);
    else if (this.how.showEsc()) this.button(ctx, dpr, { x: innerWidth - 34, y: 28, r: 20, label: 'MENU' }, false);
    ctx.restore();
  }
  button(ctx, dpr, b, on) {
    const p = Math.max(1, Math.round(dpr)), R = Math.round(b.r * dpr / p) * p;
    disc(ctx, b.x * dpr, b.y * dpr, R, p, on ? 'rgba(255, 210, 90, 0.5)' : 'rgba(8, 14, 12, 0.32)', on ? '#ffd25a' : b.gold ? 'rgba(255, 210, 90, 0.8)' : 'rgba(220, 235, 225, 0.55)');
    const size = textWidth(b.label) * 2 * p < R * 1.8 ? 2 * p : p, w = textWidth(b.label) * size;
    drawText(ctx, b.label, Math.round(b.x * dpr - w / 2), Math.round(b.y * dpr - 3 * size), size, b.dim ? 'rgba(220, 235, 225, 0.45)' : on ? '#ffffff' : 'rgba(235, 245, 235, 0.85)');
  }
  drawControls(ctx, dpr) {
    const { list, ax, ay } = this.layout(), p = Math.max(1, Math.round(dpr)), down = new Set([...this.held.values()].map((b) => b.id));
    for (const b of list) this.button(ctx, dpr, b, down.has(b.id));
    const stick = (s, hx, hy, ring) => {
      const on = s.on, bx = on ? s.ox : hx, by = on ? s.oy : hy, R = Math.round(STICK_R * dpr / p) * p;
      disc(ctx, bx * dpr, by * dpr, R, p, 'rgba(8, 14, 12, 0.22)', on ? 'rgba(220, 235, 225, 0.6)' : 'rgba(220, 235, 225, 0.28)');
      if (ring) disc(ctx, bx * dpr, by * dpr, Math.round(R * ring / p) * p, p, null, 'rgba(255, 106, 90, 0.4)');
      const v = s.vec;
      disc(ctx, (bx + v.x * STICK_R) * dpr, (by + v.y * STICK_R) * dpr, Math.round(R * 0.42 / p) * p, p, on ? 'rgba(235, 245, 235, 0.55)' : 'rgba(235, 245, 235, 0.25)', null);
    };
    stick(this.move, 14 + STICK_R + 16, innerHeight - 14 - STICK_R - 16);
    stick(this.aim, ax, ay, FIRE_AT);
  }
  drawGate(ctx, dpr) {
    const W = ctx.canvas.width, H = ctx.canvas.height, u = Math.max(1, Math.round(Math.min(W, H) / 170));
    ctx.fillStyle = '#0b100f';
    ctx.fillRect(0, 0, W, H);
    const line = (t, y, size, col) => {
      let s = size;
      while (s > 1 && textWidth(t) * s > W * 0.92) s--;
      drawText(ctx, t, Math.round(W / 2 - (textWidth(t) * s) / 2), Math.round(y), s, col);
    };
    const mid = H * 0.5;
    line('PROJECTZ', mid - 34 * u, 4 * u, '#ffd25a');
    if (this.full) {
      line('TURN YOUR PHONE SIDEWAYS', mid, 2 * u, '#eef2e2');
      line('THE GAME ONLY PLAYS IN LANDSCAPE', mid + 16 * u, u, '#9aa89f');
    } else if (canAsk()) {
      const tw = 66 * u, th = 20 * u, tx = Math.round(W / 2 - tw / 2), ty = Math.round(mid - 4 * u);
      ctx.fillStyle = 'rgba(255, 210, 90, 0.16)';
      ctx.fillRect(tx, ty, tw, th);
      ctx.fillStyle = '#ffd25a';
      for (const [x, y, w, h] of [[tx, ty, tw, u], [tx, ty + th - u, tw, u], [tx, ty, u, th], [tx + tw - u, ty, u, th]]) ctx.fillRect(x, y, w, h);
      line('TAP TO PLAY', ty + 7 * u, u, '#ffffff');
      line('THE GAME ONLY PLAYS FULL SCREEN', ty + th + 10 * u, u, '#9aa89f');
    } else {
      line('THE GAME ONLY PLAYS FULL SCREEN', mid - 6 * u, u, '#eef2e2');
      line('TAP SHARE, THEN ADD TO HOME SCREEN', mid + 8 * u, u, '#9aa89f');
      line('THEN OPEN IT FROM THE NEW ICON', mid + 18 * u, u, '#9aa89f');
    }
  }
}
