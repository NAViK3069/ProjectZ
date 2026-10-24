// Gun editor: draw a gun pixel by pixel as separate parts, mark where the
// hands hold it and where things happen (muzzle, ejection port, mag well,
// charging handle...), set how it reloads and what's worked after a shot, and
// see it in a live preview held by the real character - then save it into the
// project (assets/guns/<key>.json) where the game picks it up.
//
// The gun is kept in the game's own source format (see customguns.js): parts as
// rows of palette letters, points and slots in gun pixels. Every change rebuilds
// the art with the game's own builder, so what you see is what the game draws.

import { GUN_ART, GUN_PAL, HANDS, ATTACH_ART, buildGunArt } from '../combat/gunart.js';
import { WEAPONS, customDef } from '../combat/weapons.js';
import { CLASSES, CALIBERS } from '../combat/catalog.js';
import { CUSTOM_GUNS } from '../combat/customguns.js';
import { Player } from '../entities/player.js';
import { Particles } from '../fx/particles.js';
import { loadImages, makeCanvas } from '../engine/pixel.js';

const $ = (id) => document.getElementById(id);
const clone = (o) => JSON.parse(JSON.stringify(o));
const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k instanceof Node ? k : document.createTextNode(k));
  return e;
};

// ---------- what can be set ----------

// The view: gun pixels from (VX, VY), VW x VH of them.
const VX = -10, VY = -12, VW = 64, VH = 32;

const POINTS = [
  ['grip', 'มือลั่นไก', 'จับด้ามปืน + จุดหมุนของปืน', '#ff5a4a'],
  ['support', 'มือประคอง', 'มือซ้ายจับการ์ดหน้า', '#ffa63d'],
  ['trigger', 'ไกปืน', 'ตำแหน่งไก', '#ffe14a'],
  ['muzzle', 'ปากกระบอก', 'กระสุนและไฟปากกระบอกออกตรงนี้', '#ffffff'],
  ['port', 'ช่องคัดปลอก', 'ปลอกกระสุนกระเด็นออก / ใส่กระสุนทางบน', '#e8b84a'],
  ['magwell', 'ช่องใส่แม็ก', 'ถอด/ใส่แม็ก · ใส่ลูกปรายทางล่าง', '#5ee06a'],
  ['handle', 'คันชักลูก', 'มือมาดึงตรงนี้ตอนขึ้นลำ / ชักลูกเลื่อน', '#5fd3ff'],
  ['light', 'ปลายรางไฟ', 'ไฟฉาย/เลเซอร์ติดใต้จุดนี้', '#ff6af0'],
  ['lever', 'จุดหมุนคันโยก', 'คันโยก (lever) หมุนรอบจุดนี้', '#c49bff'],
];
const SLOTS = [
  ['sight', 'ศูนย์เล็ง / กล้อง', 'redDot'],
  ['muzzle', 'ปลายลำกล้อง', 'suppressor'],
  ['under', 'ใต้การ์ด (กริปหน้า)', 'vgrip'],
  ['side', 'รางข้าง (ไฟฉาย/เลเซอร์)', 'flashlight'],
];
// Part roles: a part with one of these names moves / swaps in the game.
const ROLES = [
  ['', 'ชิ้นส่วนธรรมดา', 'ไม่ขยับ'],
  ['mag', 'แม็กกาซีน', 'หลุดออกและเปลี่ยนตอนรีโหลด'],
  ['bolt', 'ลูกเลื่อน', 'ถอยหลังในช่องคัดปลอกทุกนัด'],
  ['handle', 'คันชักลูก', 'ถูกดึงตอนรีโหลด / ขึ้นลำ'],
  ['slide', 'สไลด์ (ปืนพก)', 'ถอยหลังทุกนัด'],
  ['pump', 'ด้ามปั๊ม', 'เลื่อนไปกลับตอนปั๊ม'],
  ['trigger', 'ไก', 'ขยับตอนเหนี่ยว'],
  ['lever', 'คันโยก', 'หมุนลงตอนขึ้นลำ'],
  ['stock', 'พานท้าย', 'เปลี่ยนเป็นพานท้ายของแต่งได้'],
  ['sight', 'ศูนย์เหล็ก', 'พับหายเมื่อติดกล้อง'],
];
const STATS = [
  ['damage', 'ความแรง/นัด', 1],
  ['fireInterval', 'ยิงทุก (วินาที)', 0.005],
  ['magSize', 'จุกระสุน', 1],
  ['reloadTime', 'เวลารีโหลด (วิ)', 0.05],
  ['shellTime', 'ใส่ทีละนัด (วิ/นัด)', 0.01],
  ['burst', 'ยิงชุดละ (0 = ไม่)', 1],
  ['pellets', 'ลูกปราย (0 = ไม่)', 1],
  ['spread', 'กระจาย', 0.005],
  ['recoil', 'ถีบถอย', 0.1],
  ['climb', 'ปืนเงย', 0.01],
  ['bulletSpeed', 'ความเร็วกระสุน', 10],
];
const TOOLS = [
  ['pencil', 'ดินสอ', 'B'],
  ['eraser', 'ยางลบ', 'E'],
  ['fill', 'เทสี', 'G'],
  ['picker', 'ดูดสี', 'I'],
  ['move', 'ย้ายชิ้น', 'M'],
  ['point', 'วางจุด', 'P'],
];
const SPARE = '0123456789!#$%&*+=?<>@^~;:'.split('');   // chars for extra colours

// ---------- state ----------

let gun = null;            // the gun being edited (customguns.js format)
let cur = null;            // the part being drawn on
let tool = 'pencil';
let color = 'd';
let pointSel = 'grip';     // which point the point tool places
const hidden = new Set();  // parts hidden in the editor only
const view = { grid: true, hands: true, points: true, dim: false, mods: false };
let undo = [], redo = [];
let dirty = false;

const paint = $('paint'), pctx = paint.getContext('2d');
let Z = 10;                // screen px per gun pixel

// ---------- loading a gun ----------

const STAT_KEYS = STATS.map(([k]) => k).concat(['auto', 'caliber']);

// A gun the game has (built-in or custom) in editor form.
function fromGame(key) {
  const custom = CUSTOM_GUNS.find((c) => c.key === key);
  if (custom) return clone(custom);
  const d = WEAPONS[key], a = GUN_ART[d.art];
  const { parts, pal, ...rest } = a;
  const art = clone(rest);
  art.parts = {};
  for (const [n, p] of Object.entries(parts)) art.parts[n] = { x: p.x, y: p.y, rows: [...p.rows] };
  const stats = {};
  for (const k of STAT_KEYS) if (d[k] !== undefined) stats[k] = d[k];
  return {
    key, name: d.name, cls: d.cls, base: key, stats,
    reload: d.reload, action: d.action?.part === 'pump' ? 'pump' : d.action?.part === 'bolt' ? 'bolt' : d.action?.part === 'lever' ? 'lever' : 'none',
    loadFrom: d.loadFrom === 'top' ? 'top' : 'below', rack: !d.noRack, pal: { ...(pal ?? {}) }, art,
  };
}

function blank() {
  const g = fromGame('m4a1');
  g.key = 'my_gun';
  g.name = 'MY GUN';
  g.art.parts = { body: { x: 6, y: 1, rows: [] } };
  g.art.order = ['body'];
  g.pal = {};
  return g;
}

function load(g) {
  gun = g;
  gun.art.order ??= Object.keys(gun.art.parts);
  gun.art.points ??= {};
  gun.art.slots ??= {};
  gun.pal ??= {};
  cur = gun.art.order.at(-1) ?? null;
  hidden.clear();
  undo = [];
  redo = [];
  dirty = false;
  apply();
  buildAll();
}

// ---------- editing helpers ----------

function snapshot() {
  undo.push(JSON.stringify(gun));
  if (undo.length > 150) undo.shift();
  redo = [];
  dirty = true;
}

function restore(json) {
  const keepCur = cur;
  gun = JSON.parse(json);
  cur = gun.art.parts[keepCur] ? keepCur : gun.art.order.at(-1) ?? null;
  apply();
  buildAll();
}

const width = (p) => Math.max(0, ...p.rows.map((r) => r.length));

// Set one gun pixel of a part (growing its rows as needed). ch '.' = clear.
function put(p, gx, gy, ch) {
  if (!p.rows.length) {
    if (ch === '.') return;
    p.x = gx;
    p.y = gy;
    p.rows = [ch];
    return;
  }
  let lx = gx - p.x, ly = gy - p.y;
  if (ch === '.' && (lx < 0 || ly < 0 || ly >= p.rows.length || lx >= p.rows[ly].length)) return;
  if (lx < 0) {
    p.rows = p.rows.map((r) => '.'.repeat(-lx) + r);
    p.x += lx;
    lx = 0;
  }
  if (ly < 0) {
    p.rows = [...Array(-ly).fill(''), ...p.rows];
    p.y += ly;
    ly = 0;
  }
  while (p.rows.length <= ly) p.rows.push('');
  const r = p.rows[ly].padEnd(lx + 1, '.');
  p.rows[ly] = r.slice(0, lx) + ch + r.slice(lx + 1);
}

function get(p, gx, gy) {
  const lx = gx - p.x, ly = gy - p.y;
  return p.rows[ly]?.[lx] ?? '.';
}

// Drop empty rows / columns round a part.
function trim(p) {
  const w = width(p);
  p.rows = p.rows.map((r) => r.padEnd(w, '.'));
  while (p.rows.length && !/[^.]/.test(p.rows[0])) { p.rows.shift(); p.y++; }
  while (p.rows.length && !/[^.]/.test(p.rows.at(-1))) p.rows.pop();
  if (!p.rows.length) return;
  let left = Math.min(...p.rows.map((r) => r.search(/[^.]/)).filter((i) => i >= 0));
  if (left > 0) { p.rows = p.rows.map((r) => r.slice(left)); p.x += left; }
  p.rows = p.rows.map((r) => r.replace(/\.+$/, ''));
}

function flood(p, gx, gy, ch) {
  const w = width(p), hgt = p.rows.length;
  const target = get(p, gx, gy);
  if (target === ch) return;
  const inside = (x, y) => x >= p.x && y >= p.y && x < p.x + w && y < p.y + hgt;
  if (!inside(gx, gy)) return put(p, gx, gy, ch);
  const stack = [[gx, gy]], seen = new Set();
  while (stack.length) {
    const [x, y] = stack.pop(), k = x + ',' + y;
    if (seen.has(k) || !inside(x, y) || get(p, x, y) !== target) continue;
    seen.add(k);
    put(p, x, y, ch);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
}

// Topmost visible part with a pixel at (gx, gy).
function partAt(gx, gy) {
  for (const n of [...gun.art.order].reverse()) {
    if (hidden.has(n)) continue;
    const p = gun.art.parts[n];
    if (get(p, gx, gy) !== '.') return n;
  }
  return null;
}

const pal = () => ({ ...GUN_PAL, ...gun.pal });

// ---------- building it the game's way ----------

let art = null, def = null;

function apply() {
  const src = clone(gun.art);
  src.pal = gun.pal;
  if (gun.art.lever) src.lever = gun.art.lever;
  art = buildGunArt(gun.key, src);
  def = customDef(gun);
  WEAPONS[gun.key] = def;
  preview.setGun();
  draw();
  checks();
}

// ---------- the paint canvas ----------

function fit() {
  const stage = $('stage');
  Z = Math.max(5, Math.floor(Math.min((stage.clientWidth - 24) / VW, (stage.clientHeight - 24) / VH)));
  paint.width = VW * Z;
  paint.height = VH * Z;
  draw();
}

const sx = (gx) => (gx - VX) * Z, sy = (gy) => (gy - VY) * Z;

function draw() {
  if (!art) return;
  const c = pctx;
  c.imageSmoothingEnabled = false;
  // a dim checkerboard so see-through pixels read as empty
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    c.fillStyle = (x + y) % 2 ? '#20261d' : '#1a2018';
    c.fillRect(x * Z, y * Z, Z, Z);
  }
  // the gun, part by part (with the game's automatic outlines)
  for (const n of art.order) {
    const p = art.parts[n];
    if (!p || hidden.has(n)) continue;
    c.globalAlpha = view.dim && n !== cur ? 0.3 : 1;
    c.drawImage(p.img, sx(p.x - 1), sy(p.y - 1), p.img.width * Z, p.img.height * Z);
  }
  c.globalAlpha = 1;
  // attachments on their slots, to check they sit right
  if (view.mods) {
    for (const [slot, , k] of SLOTS) {
      const s = gun.art.slots[slot];
      if (!s || s === true) continue;
      const a = ATTACH_ART[k];
      c.globalAlpha = 0.85;
      c.drawImage(a.img, sx(s.x - a.anchor.x - 1), sy(s.y - a.anchor.y - 1), a.img.width * Z, a.img.height * Z);
    }
    c.globalAlpha = 1;
  }
  // the hands where they hold it
  if (view.hands) {
    c.globalAlpha = 0.75;
    for (const [hand, pt] of [['trigger', gun.art.points.grip], ['support', gun.art.points.support]]) {
      if (!pt) continue;
      const H = HANDS[hand];
      c.drawImage(H.img, sx(pt.x - H.at.x - 1), sy(pt.y - H.at.y - 1), H.img.width * Z, H.img.height * Z);
    }
    c.globalAlpha = 1;
  }
  // grid
  if (view.grid && Z >= 6) {
    c.strokeStyle = 'rgba(255,255,255,0.05)';
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 0; x <= VW; x++) { c.moveTo(x * Z + 0.5, 0); c.lineTo(x * Z + 0.5, VH * Z); }
    for (let y = 0; y <= VH; y++) { c.moveTo(0, y * Z + 0.5); c.lineTo(VW * Z, y * Z + 0.5); }
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.13)';
    c.beginPath();
    c.moveTo(sx(0) + 0.5, 0); c.lineTo(sx(0) + 0.5, VH * Z);
    c.moveTo(0, sy(0) + 0.5); c.lineTo(VW * Z, sy(0) + 0.5);
    c.stroke();
  }
  // the part being drawn on
  const p = cur && gun.art.parts[cur];
  if (p?.rows.length) {
    c.setLineDash([4, 3]);
    c.strokeStyle = '#9bd65a';
    c.strokeRect(sx(p.x) - 1.5, sy(p.y) - 1.5, width(p) * Z + 3, p.rows.length * Z + 3);
    c.setLineDash([]);
  }
  // points and slots
  if (view.points) {
    for (const [slot, label] of SLOTS) {
      const s = gun.art.slots[slot];
      if (!s || s === true) continue;
      c.strokeStyle = '#7fb7d9';
      c.lineWidth = 2;
      c.strokeRect(sx(s.x) + 2, sy(s.y) + 2, Z - 4, Z - 4);
      c.lineWidth = 1;
      if (hover && hover.x === s.x && hover.y === s.y) tag(c, sx(s.x) + Z, sy(s.y) + 2, '▢ ' + label, '#7fb7d9');
    }
    for (const [k, label, , col] of POINTS) {
      const pt = pointOf(k);
      if (!pt) continue;
      const x = sx(pt.x + 0.5), y = sy(pt.y + 0.5);
      c.fillStyle = '#000';
      c.beginPath(); c.arc(x, y, Math.max(4, Z * 0.42), 0, Math.PI * 2); c.fill();
      c.fillStyle = col;
      c.beginPath(); c.arc(x, y, Math.max(3, Z * 0.32), 0, Math.PI * 2); c.fill();
      if (tool === 'point' && k === pointSel) {
        c.strokeStyle = '#fff';
        c.lineWidth = 2;
        c.beginPath(); c.arc(x, y, Math.max(6, Z * 0.6), 0, Math.PI * 2); c.stroke();
        c.lineWidth = 1;
      }
      // a label only for the point being placed and the one under the mouse (they'd pile up otherwise)
      const near = hover && Math.hypot(pt.x + 0.5 - hover.fx, pt.y + 0.5 - hover.fy) < 0.8;
      if (near || (tool === 'point' && k === pointSel)) tag(c, x + Z * 0.5, y - Z * 0.5, label, col);
    }
  }
  // the pixel under the mouse
  if (hover && (tool === 'pencil' || tool === 'eraser' || tool === 'fill')) {
    c.strokeStyle = '#fff';
    c.strokeRect(sx(hover.x) + 0.5, sy(hover.y) + 0.5, Z - 1, Z - 1);
    if (tool !== 'eraser' && color !== '.') {
      c.globalAlpha = 0.6;
      c.fillStyle = pal()[color];
      c.fillRect(sx(hover.x) + 2, sy(hover.y) + 2, Z - 4, Z - 4);
      c.globalAlpha = 1;
    }
  }
}

function tag(c, x, y, text, col) {
  c.font = '11px system-ui, sans-serif';
  const w = c.measureText(text).width;
  c.fillStyle = 'rgba(0,0,0,0.65)';
  c.fillRect(x - 2, y - 11, w + 4, 14);
  c.fillStyle = col;
  c.fillText(text, x, y);
}

// A point, by key ('lever' lives at art.lever.pivot).
function pointOf(k) {
  if (k === 'lever') return gun.art.lever?.pivot ?? null;
  return gun.art.points[k] ?? null;
}
function setPoint(k, pt) {
  if (k === 'lever') {
    if (pt) gun.art.lever = { ...(gun.art.lever ?? {}), pivot: pt };
    else delete gun.art.lever;
  } else if (pt) gun.art.points[k] = pt;
  else delete gun.art.points[k];
}

// ---------- mouse on the canvas ----------

let hover = null, stroke = null;

function gunPos(e) {
  const r = paint.getBoundingClientRect();
  const fx = (e.clientX - r.left) / Z + VX, fy = (e.clientY - r.top) / Z + VY;
  return { x: Math.floor(fx), y: Math.floor(fy), fx, fy };
}

paint.addEventListener('contextmenu', (e) => e.preventDefault());
paint.addEventListener('pointerdown', (e) => {
  paint.setPointerCapture(e.pointerId);
  const g = gunPos(e), right = e.button === 2;
  if (tool === 'picker' || e.altKey) {
    const n = partAt(g.x, g.y);
    if (n) {
      color = get(gun.art.parts[n], g.x, g.y);
      selectPart(n);
      buildLeft();
    }
    return;
  }
  if (tool === 'point') {
    // grab the nearest point under the mouse, or place the selected one here
    const near = POINTS.find(([k]) => { const p = pointOf(k); return p && Math.hypot(p.x + 0.5 - g.fx, p.y + 0.5 - g.fy) < 0.8; });
    if (near) pointSel = near[0];
    snapshot();
    stroke = { kind: 'point' };
    placePoint(g);
    buildPoints();
    return;
  }
  const p = cur && gun.art.parts[cur];
  if (!p) return say('เลือกหรือเพิ่มชิ้นส่วนก่อน (แท็บ ชิ้นส่วน)', true);
  snapshot();
  if (tool === 'move') {
    stroke = { kind: 'move', from: g, x: p.x, y: p.y };
    return;
  }
  if (tool === 'fill') {
    flood(p, g.x, g.y, right ? '.' : color);
    trim(p);
    apply();
    return;
  }
  stroke = { kind: 'paint', last: g, ch: right || tool === 'eraser' ? '.' : color };
  put(p, g.x, g.y, stroke.ch);
  apply();
});

paint.addEventListener('pointermove', (e) => {
  const g = gunPos(e);
  hover = g;
  $('stPos').textContent = `x ${g.x}  y ${g.y}`;
  if (stroke?.kind === 'paint') {
    const p = gun.art.parts[cur];
    // a line from the last pixel, so fast strokes don't leave gaps
    const { x: x0, y: y0 } = stroke.last, n = Math.max(Math.abs(g.x - x0), Math.abs(g.y - y0));
    for (let i = 1; i <= n; i++) put(p, Math.round(x0 + ((g.x - x0) * i) / n), Math.round(y0 + ((g.y - y0) * i) / n), stroke.ch);
    stroke.last = g;
    apply();
  } else if (stroke?.kind === 'move') {
    const p = gun.art.parts[cur];
    p.x = stroke.x + (g.x - stroke.from.x);
    p.y = stroke.y + (g.y - stroke.from.y);
    apply();
  } else if (stroke?.kind === 'point') {
    placePoint(g);
  } else {
    draw();
  }
});

paint.addEventListener('pointerup', () => {
  if (stroke?.kind === 'paint') {
    trim(gun.art.parts[cur]);
    apply();
    buildParts();
  }
  if (stroke?.kind === 'point') buildPoints();
  stroke = null;
});
paint.addEventListener('pointerleave', () => { hover = null; draw(); });

function placePoint(g) {
  // points sit on whole or half pixels
  const pt = { x: Math.round((g.fx - 0.5) * 2) / 2, y: Math.round((g.fy - 0.5) * 2) / 2 };
  setPoint(pointSel, pt);
  apply();
}

// ---------- panels ----------

function say(text, bad = false) {
  const m = $('msg');
  m.textContent = text;
  m.className = bad ? 'bad' : '';
  clearTimeout(say.t);
  say.t = setTimeout(() => (m.textContent = ''), 3500);
}

function buildAll() {
  buildGunSel();
  buildLeft();
  buildParts();
  buildPoints();
  buildReload();
  buildStats();
  status();
}

function buildGunSel() {
  const sel = $('gunSel');
  sel.innerHTML = '';
  const customKeys = new Set(CUSTOM_GUNS.map((c) => c.key));
  const groups = {};
  for (const d of Object.values(WEAPONS)) {
    if (d.spec) continue;
    (groups[d.cls] ??= []).push(d);
  }
  for (const [cls, list] of Object.entries(groups)) {
    const og = h('optgroup', { label: CLASSES[cls]?.label ?? cls });
    for (const d of list) og.append(h('option', { value: d.key, selected: d.key === gun.key }, `${d.name}${customKeys.has(d.key) ? '  ★' : ''}`));
    sel.append(og);
  }
  if (!WEAPONS[gun.key] || !Object.values(groups).flat().some((d) => d.key === gun.key)) sel.prepend(h('option', { value: gun.key, selected: true }, gun.name + ' (ใหม่)'));
}

function buildLeft() {
  const el = $('left');
  el.innerHTML = '';
  el.append(h('h3', {}, 'เครื่องมือ'));
  const tools = h('div', { class: 'tools' });
  for (const [k, label, key] of TOOLS) tools.append(h('button', { class: tool === k ? 'on' : '', onclick: () => setTool(k), title: `${label} (${key})` }, label, h('kbd', {}, key)));
  el.append(tools);
  el.append(h('div', { class: 'hint', style: 'margin-top:6px' }, 'คลิกซ้าย = วาด · คลิกขวา = ลบ · Alt+คลิก = ดูดสี/เลือกชิ้น'));

  el.append(h('h3', {}, 'สี'));
  const sw = h('div', { class: 'pal' });
  sw.append(h('div', { class: 'sw erase' + (color === '.' ? ' sel' : ''), title: 'ว่าง (ลบ)', onclick: () => { color = '.'; buildLeft(); } }));
  for (const [ch, hex] of Object.entries(GUN_PAL)) {
    sw.append(h('div', { class: 'sw' + (color === ch ? ' sel' : ''), style: `background:${hex}`, title: `${ch}  ${hex}`, onclick: () => { color = ch; if (tool === 'eraser') setTool('pencil'); buildLeft(); } }));
  }
  for (const [ch, hex] of Object.entries(gun.pal)) {
    const pick = h('input', { type: 'color', value: hex });
    pick.addEventListener('input', () => { gun.pal[ch] = pick.value; apply(); });
    pick.addEventListener('change', () => buildLeft());
    pick.addEventListener('click', (e) => { if (color !== ch) { e.preventDefault(); color = ch; buildLeft(); } });
    sw.append(h('div', { class: 'sw' + (color === ch ? ' sel' : ''), style: `background:${hex}`, title: `สีของปืนนี้ (${ch}) - คลิกอีกทีเพื่อเปลี่ยนสี` }, pick));
  }
  sw.append(h('button', { title: 'เพิ่มสีของตัวเอง', style: 'padding:0', onclick: addColor }, '+'));
  el.append(sw);
  el.append(h('div', { class: 'hint', style: 'margin-top:6px' }, 'ขอบดำรอบชิ้นส่วนใส่ให้อัตโนมัติเหมือนในเกม'));

  el.append(h('h3', {}, 'มุมมอง'));
  const checks = h('div', { class: 'checks' });
  for (const [k, label] of [['grid', 'ตาราง'], ['hands', 'แสดงมือที่จับ'], ['points', 'แสดงจุด & ช่องของแต่ง'], ['dim', 'จางชิ้นอื่น'], ['mods', 'ลองติดของแต่ง']]) {
    const cb = h('input', { type: 'checkbox', checked: view[k] });
    cb.addEventListener('change', () => { view[k] = cb.checked; draw(); });
    checks.append(h('label', {}, cb, label));
  }
  el.append(checks);
  el.append(h('h3', {}, 'คีย์ลัด'));
  el.append(h('div', { class: 'hint' }, 'Ctrl+Z ย้อน · Ctrl+Y ทำซ้ำ · Ctrl+S บันทึก · ลูกศร = เลื่อนชิ้นส่วน · [ ] = เลือกชิ้นก่อน/ถัดไป'));
}

function addColor() {
  const ch = SPARE.find((c) => !(c in GUN_PAL) && !(c in gun.pal));
  if (!ch) return say('สีเต็มแล้ว', true);
  snapshot();
  gun.pal[ch] = '#ff8844';
  color = ch;
  buildLeft();
  apply();
}

function setTool(k) {
  tool = k;
  buildLeft();
  status();
  draw();
}

function status() {
  $('stTool').textContent = 'เครื่องมือ: ' + TOOLS.find(([k]) => k === tool)[1] + (tool === 'point' ? ` → ${POINTS.find(([k]) => k === pointSel)[1]}` : '');
  $('stPart').textContent = cur ? `ชิ้นส่วน: ${cur}` : 'ยังไม่มีชิ้นส่วน';
}

function selectPart(n) {
  cur = n;
  buildParts();
  status();
  draw();
}

// --- tab: parts ---

function buildParts() {
  const el = $('tab-parts');
  el.innerHTML = '';
  el.append(h('div', { class: 'hint' }, 'ปืนประกอบจากหลายชิ้น วาดทีละชิ้น ชิ้นล่างสุดในรายการวาดทับด้านหน้าสุด ชิ้นที่ตั้ง "หน้าที่" ไว้จะขยับในเกม (แม็กหลุด ลูกเลื่อนถอย ฯลฯ)'));
  const list = h('div', { class: 'list', style: 'margin-top:8px' });
  gun.art.order.forEach((n, i) => {
    const p = gun.art.parts[n], role = ROLES.find(([r]) => r === n);
    list.append(h('div', { class: 'item' + (n === cur ? ' sel' : ''), onclick: () => selectPart(n) },
      h('button', { title: 'ซ่อน/แสดง (เฉพาะในหน้านี้)', onclick: (e) => { e.stopPropagation(); hidden.has(n) ? hidden.delete(n) : hidden.add(n); buildParts(); draw(); } }, hidden.has(n) ? '◌' : '●'),
      h('span', { class: 'name' }, n, ' ', h('small', {}, role ? `· ${role[1]}` : p.rows.length ? `${width(p)}×${p.rows.length}` : '(ว่าง)')),
      h('button', { title: 'ไปข้างหลัง', onclick: (e) => { e.stopPropagation(); moveOrder(i, -1); } }, '▲'),
      h('button', { title: 'มาข้างหน้า', onclick: (e) => { e.stopPropagation(); moveOrder(i, 1); } }, '▼')));
  });
  el.append(list);
  el.append(h('div', { class: 'row' },
    h('button', { onclick: addPart }, '+ เพิ่มชิ้น'),
    h('button', { onclick: dupPart, disabled: !cur }, 'ทำสำเนา'),
    h('button', { class: 'danger', onclick: delPart, disabled: !cur }, 'ลบชิ้น')));
  if (!cur) return;
  const p = gun.art.parts[cur];
  el.append(h('h3', {}, `ชิ้นส่วน "${cur}"`));
  const name = h('input', { type: 'text', value: cur });
  name.addEventListener('change', () => renamePart(name.value.trim()));
  el.append(h('div', { class: 'row' }, h('span', {}, 'ชื่อ'), name));
  const role = h('select', {});
  for (const [r, label, what] of ROLES) role.append(h('option', { value: r, selected: (ROLES.some(([x]) => x === cur) ? cur : '') === r }, `${label}${r ? ' — ' + what : ''}`));
  role.addEventListener('change', () => {
    if (role.value) renamePart(role.value);
    else if (ROLES.some(([x]) => x === cur)) renamePart(cur + '_part');
  });
  el.append(h('div', { class: 'row' }, h('span', {}, 'หน้าที่'), role));
  const xi = h('input', { type: 'number', value: p.x, step: 1 }), yi = h('input', { type: 'number', value: p.y, step: 1 });
  for (const [inp, k] of [[xi, 'x'], [yi, 'y']]) inp.addEventListener('change', () => { snapshot(); p[k] = Math.round(+inp.value); apply(); });
  el.append(h('div', { class: 'row' }, h('span', {}, 'ตำแหน่ง x / y'), xi, yi));
  el.append(h('div', { class: 'row' },
    h('button', { onclick: () => flip(p, 'h') }, 'กลับซ้าย-ขวา'),
    h('button', { onclick: () => flip(p, 'v') }, 'กลับบน-ล่าง'),
    h('button', { class: 'danger', onclick: () => { snapshot(); p.rows = []; apply(); buildParts(); } }, 'ล้างชิ้นนี้')));
}

function moveOrder(i, d) {
  const o = gun.art.order, j = i + d;
  if (j < 0 || j >= o.length) return;
  snapshot();
  [o[i], o[j]] = [o[j], o[i]];
  apply();
  buildParts();
}

function addPart() {
  let n = 'part', i = 1;
  while (gun.art.parts[n + i]) i++;
  n += i;
  snapshot();
  gun.art.parts[n] = { x: 4, y: 2, rows: [] };
  gun.art.order.push(n);
  cur = n;
  apply();
  buildParts();
  status();
  say(`เพิ่มชิ้น ${n} แล้ว วาดบนผืนผ้าใบได้เลย`);
}

function dupPart() {
  const p = gun.art.parts[cur];
  let n = cur + '_copy', i = 2;
  while (gun.art.parts[n]) n = cur + '_copy' + i++;
  snapshot();
  gun.art.parts[n] = { x: p.x + 1, y: p.y + 1, rows: [...p.rows] };
  gun.art.order.splice(gun.art.order.indexOf(cur) + 1, 0, n);
  cur = n;
  apply();
  buildParts();
}

function delPart() {
  if (!confirm(`ลบชิ้นส่วน "${cur}"?`)) return;
  snapshot();
  delete gun.art.parts[cur];
  gun.art.order = gun.art.order.filter((x) => x !== cur);
  cur = gun.art.order.at(-1) ?? null;
  apply();
  buildParts();
  status();
}

function renamePart(n) {
  n = n.replace(/[^a-zA-Z0-9_]/g, '');
  if (!n || n === cur) return buildParts();
  if (gun.art.parts[n]) {
    say(`มีชิ้นชื่อ "${n}" อยู่แล้ว`, true);
    return buildParts();
  }
  snapshot();
  gun.art.parts[n] = gun.art.parts[cur];
  delete gun.art.parts[cur];
  gun.art.order = gun.art.order.map((x) => (x === cur ? n : x));
  if (hidden.delete(cur)) hidden.add(n);
  cur = n;
  apply();
  buildParts();
  status();
}

function flip(p, dir) {
  snapshot();
  const w = width(p);
  if (dir === 'h') p.rows = p.rows.map((r) => [...r.padEnd(w, '.')].reverse().join(''));
  else p.rows = [...p.rows].reverse();
  trim(p);
  apply();
}

// --- tab: points & hands ---

function buildPoints() {
  const el = $('tab-points');
  el.innerHTML = '';
  el.append(h('div', { class: 'hint' }, 'เลือกจุด แล้วคลิกบนภาพปืนเพื่อวาง (หรือลากจุดที่มีอยู่) จุดพวกนี้บอกเกมว่ามือจับตรงไหน กระสุนออกตรงไหน ปลอกกระเด็นตรงไหน ใส่แม็กตรงไหน'));
  const list = h('div', { class: 'list', style: 'margin-top:8px' });
  for (const [k, label, what, col] of POINTS) {
    const pt = pointOf(k);
    list.append(h('div', { class: 'item' + (tool === 'point' && pointSel === k ? ' sel' : ''), onclick: () => { pointSel = k; setTool('point'); buildPoints(); } },
      h('span', { class: 'dot', style: `background:${col}` }),
      h('span', { class: 'name' }, label, ' ', h('small', {}, what)),
      h('small', {}, pt ? `${pt.x}, ${pt.y}` : 'ยังไม่วาง'),
      pt && k !== 'grip' ? h('button', { title: 'เอาออก', onclick: (e) => { e.stopPropagation(); snapshot(); setPoint(k, null); apply(); buildPoints(); } }, '✕') : null));
  }
  el.append(list);

  el.append(h('h3', {}, 'ช่องของแต่ง'));
  el.append(h('div', { class: 'hint' }, 'ติ๊กเพื่อเปิดช่อง แล้วกด "วาง" และคลิกบนภาพ (ติ๊ก "ลองติดของแต่ง" ทางซ้ายเพื่อดูว่าพอดีไหม)'));
  for (const [slot, label] of SLOTS) {
    const s = gun.art.slots[slot];
    const on = h('input', { type: 'checkbox', checked: !!s });
    on.addEventListener('change', () => {
      snapshot();
      if (on.checked) gun.art.slots[slot] = { x: 10, y: 0 };
      else delete gun.art.slots[slot];
      if (slot === 'side' && !on.checked) gun.art.noRail = true;
      if (slot === 'side' && on.checked) delete gun.art.noRail;
      apply();
      buildPoints();
    });
    el.append(h('div', { class: 'row' }, h('label', {}, on, label),
      s ? h('button', { onclick: () => { slotPick = slot; say('คลิกบนภาพเพื่อวางช่อง ' + label); } }, 'วาง') : null,
      s ? h('small', { class: 'hint' }, `${s.x}, ${s.y}`) : null));
  }
  for (const [slot, label] of [['mag', 'เปลี่ยนแม็กแต่งได้ (แม็กยาว/ดรัม)'], ['stock', 'เปลี่ยนพานท้ายแต่งได้']]) {
    const on = h('input', { type: 'checkbox', checked: !!gun.art.slots[slot] });
    on.addEventListener('change', () => { snapshot(); if (on.checked) gun.art.slots[slot] = true; else delete gun.art.slots[slot]; apply(); });
    el.append(h('div', { class: 'row' }, h('label', {}, on, label)));
  }
}

// placing an attachment slot: the next click on the canvas
let slotPick = null;
paint.addEventListener('pointerdown', (e) => {
  if (!slotPick) return;
  e.stopImmediatePropagation();
  const g = gunPos(e);
  snapshot();
  gun.art.slots[slotPick] = { x: g.x, y: g.y };
  slotPick = null;
  apply();
  buildPoints();
}, { capture: true });

// --- tab: reload & action ---

function buildReload() {
  const el = $('tab-reload');
  el.innerHTML = '';
  const base = WEAPONS[gun.base];
  const sel = (value, options, onchange) => {
    const s = h('select', {});
    for (const [v, label] of options) s.append(h('option', { value: v, selected: v === value }, label));
    s.addEventListener('change', () => { snapshot(); onchange(s.value); apply(); buildReload(); });
    return s;
  };
  const reloads = [['mag', 'เปลี่ยนแม็กกาซีน'], ['shells', 'ใส่ทีละนัด (ลูกซอง/ปืนลูกเลื่อน)']];
  if (base?.steps) reloads.push(['steps', `พิเศษตามต้นแบบ (${base.name}: หักลำ/ลูกโม่)`]);
  el.append(h('div', { class: 'row' }, h('span', {}, 'วิธีรีโหลด'), sel(gun.reload, reloads, (v) => (gun.reload = v))));
  if (gun.reload === 'shells') el.append(h('div', { class: 'row' }, h('span', {}, 'ใส่กระสุนทาง'), sel(gun.loadFrom, [['below', 'ล่าง — ช่องใส่แม็ก (มือประคอง)'], ['top', 'บน — ช่องคัดปลอก (มือลั่นไก)']], (v) => (gun.loadFrom = v))));
  el.append(h('div', { class: 'row' }, h('span', {}, 'หลังยิงแต่ละนัด'), sel(gun.action, [['none', 'ไม่ต้องทำอะไร (กึ่งอัตโนมัติ/ออโต้)'], ['pump', 'ปั๊ม — มือประคองเลื่อนด้ามปั๊ม'], ['bolt', 'ลูกเลื่อน — มือดึงคันชักลูก'], ['lever', 'คันโยก — หมุนปืนง้างคันโยก']], (v) => (gun.action = v))));
  if (gun.reload === 'mag' && gun.action !== 'bolt') {
    const rack = h('input', { type: 'checkbox', checked: gun.rack !== false });
    rack.addEventListener('change', () => { snapshot(); gun.rack = rack.checked; apply(); buildReload(); });
    el.append(h('div', { class: 'row' }, h('label', {}, rack, 'จบรีโหลดด้วยการดึงคันชักลูก')));
  }
  el.append(h('h3', {}, 'ระยะที่ชิ้นส่วนเลื่อน (px)'));
  for (const [k, label] of [['bolt', 'ลูกเลื่อน (bolt)'], ['slide', 'สไลด์ (slide)'], ['pump', 'ด้ามปั๊ม (pump)']]) {
    if (!gun.art.parts[k] && !gun.art[k]) continue;
    const inp = h('input', { type: 'number', value: gun.art[k]?.travel ?? 3, min: 0, max: 12, step: 1 });
    inp.addEventListener('change', () => { snapshot(); gun.art[k] = { ...(gun.art[k] ?? {}), travel: +inp.value }; apply(); });
    el.append(h('div', { class: 'row' }, h('span', {}, label), inp));
  }
  if (!['bolt', 'slide', 'pump'].some((k) => gun.art.parts[k])) el.append(h('div', { class: 'hint' }, 'ตั้งหน้าที่ชิ้นส่วนเป็น ลูกเลื่อน / สไลด์ / ด้ามปั๊ม ในแท็บชิ้นส่วน เพื่อให้มันเลื่อนได้'));
  el.append(h('h3', {}, 'เวลา'));
  for (const [k, label, step] of STATS.filter(([k]) => k === 'reloadTime' || k === 'shellTime')) {
    if (k === 'shellTime' && gun.reload !== 'shells') continue;
    el.append(statRow(k, label, step));
  }
  el.append(h('h3', {}, 'ท่าทางที่จะเกิดขึ้น'));
  el.append(h('div', { class: 'explain', id: 'explain' }));
  el.append(h('div', { id: 'warns' }));
  checks();
}

// What the hands will do, in words, plus warnings for anything missing.
function checks() {
  const ex = $('explain'), wr = $('warns');
  if (!ex || !gun) return;
  const P = (k) => `<b>${POINTS.find(([x]) => x === k)[1]}</b>`;
  const steps = [];
  if (gun.reload === 'mag') {
    steps.push(`มือประคองดึงแม็กเก่าออกที่ ${P('magwell')}`, 'ไปหยิบแม็กใหม่ที่เอว', `ดันแม็กใหม่เข้า ${P('magwell')}`);
    if (gun.rack !== false && gun.action !== 'bolt') steps.push(`ดึง ${P('handle')} ขึ้นลำ`);
  } else if (gun.reload === 'shells') {
    if (gun.loadFrom === 'top') steps.push(`มือลั่นไกหยิบกระสุนจากเอวทีละนัด`, `ใส่ลงทาง ${P('port')} ด้านบน`, 'ซ้ำจนเต็ม');
    else steps.push(`มือประคองหยิบกระสุนจากเอวทีละนัด`, `ดันเข้า ${P('magwell')} ใต้ปืน`, 'ซ้ำจนเต็ม');
  } else {
    steps.push('ทำตามท่าของปืนต้นแบบ (หักลำ / สลัดลูกโม่ · ทิ้งปลอก · ใส่กระสุน · ปิด)');
  }
  const after = { none: 'ยิงแล้วยิงต่อได้เลย ปลอกกระเด็นออกจาก ' + P('port'), pump: `มือประคองเลื่อน <b>ด้ามปั๊ม</b> ไปกลับ ปลอกกระเด็นออกจาก ${P('port')}`, bolt: `มือลั่นไกไปดึง ${P('handle')} (ลูกเลื่อน) ปลอกกระเด็นออกจาก ${P('port')}`, lever: 'หมุนปืนรอบมือง้าง <b>คันโยก</b> รอบ ' + P('lever') }[gun.action];
  ex.innerHTML = `<div>รีโหลด: ${steps.map((s, i) => `${i + 1}. ${s}`).join(' → ')}</div><div style="margin-top:6px">หลังยิง: ${after}</div>`;
  const W = [];
  const parts = gun.art.parts, pts = gun.art.points;
  if (!pts.grip) W.push('ยังไม่ได้วางจุด "มือลั่นไก"');
  if (!pts.muzzle) W.push('ยังไม่ได้วางจุด "ปากกระบอก"');
  if (!pts.port) W.push('ยังไม่ได้วางจุด "ช่องคัดปลอก" (ปลอกจะไม่มีที่ออก)');
  if (gun.reload === 'mag' && !parts.mag) W.push('รีโหลดแบบแม็ก แต่ยังไม่มีชิ้นส่วนหน้าที่ "แม็กกาซีน"');
  if (gun.reload === 'mag' && !pts.magwell) W.push('ยังไม่ได้วางจุด "ช่องใส่แม็ก"');
  if (gun.reload === 'shells' && gun.loadFrom !== 'top' && !pts.magwell) W.push('ใส่กระสุนทางล่าง ต้องวางจุด "ช่องใส่แม็ก"');
  if (gun.action === 'pump' && !parts.pump) W.push('แบบปั๊ม แต่ยังไม่มีชิ้นส่วนหน้าที่ "ด้ามปั๊ม"');
  if (gun.action === 'lever' && !parts.lever) W.push('แบบคันโยก แต่ยังไม่มีชิ้นส่วนหน้าที่ "คันโยก"');
  if (gun.action === 'lever' && !gun.art.lever?.pivot) W.push('แบบคันโยก ต้องวาง "จุดหมุนคันโยก"');
  if ((gun.action === 'bolt' || (gun.reload === 'mag' && gun.rack !== false)) && !pts.handle && !parts.handle && !parts.slide) W.push('ยังไม่ได้วาง "คันชักลูก" (มือจะไปจับที่มือประคองแทน)');
  if (!pts.support && gun.cls !== 'pistol') W.push('ยังไม่ได้วางจุด "มือประคอง"');
  wr.innerHTML = W.map((w) => `<div class="warn">⚠ ${w}</div>`).join('');
}

// --- tab: stats ---

function statRow(k, label, step) {
  const v = gun.stats[k] ?? def?.[k] ?? 0;
  const inp = h('input', { type: 'number', value: v, step, min: 0 });
  inp.addEventListener('change', () => { snapshot(); gun.stats[k] = +inp.value; apply(); if (k === 'fireInterval') buildStats(); });
  return h('div', { class: 'row' }, h('span', {}, label), inp, k === 'fireInterval' ? h('small', { class: 'hint' }, `≈ ${Math.round(60 / Math.max(0.01, +v))} นัด/นาที`) : null);
}

function buildStats() {
  const el = $('tab-stats');
  el.innerHTML = '';
  const name = h('input', { type: 'text', value: gun.name, maxlength: 24 });
  name.addEventListener('change', () => { snapshot(); gun.name = name.value.toUpperCase(); apply(); buildGunSel(); });
  el.append(h('div', { class: 'row' }, h('span', {}, 'ชื่อปืน'), name));
  const key = h('input', { type: 'text', value: gun.key, maxlength: 40, title: 'ชื่อไฟล์ (a-z 0-9 _) ถ้าใช้คีย์ของปืนเดิมในเกม จะเป็นการแก้ปืนนั้น' });
  key.addEventListener('change', () => {
    const k = key.value.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!k) return buildStats();
    snapshot();
    gun.key = k;
    apply();
    buildStats();
    buildGunSel();
  });
  el.append(h('div', { class: 'row' }, h('span', {}, 'คีย์ (ชื่อไฟล์)'), key));
  el.append(h('div', { class: 'hint' }, WEAPONS[gun.key] && !WEAPONS[gun.key].custom && gun.key === gun.base ? 'คีย์นี้เป็นปืนเดิมของเกม บันทึกแล้วจะแทนที่ปืนเดิม (กดลบเพื่อคืนค่า)' : 'คีย์ใหม่ = ปืนกระบอกใหม่ในคลังอาวุธ'));
  const cls = h('select', {});
  for (const [k, c] of Object.entries(CLASSES)) cls.append(h('option', { value: k, selected: k === gun.cls }, c.label));
  cls.addEventListener('change', () => { snapshot(); gun.cls = cls.value; apply(); });
  el.append(h('div', { class: 'row' }, h('span', {}, 'ประเภท'), cls));
  const cal = h('select', {});
  for (const c of CALIBERS) cal.append(h('option', { value: c, selected: c === (gun.stats.caliber ?? def.caliber) }, c));
  cal.addEventListener('change', () => { snapshot(); gun.stats.caliber = cal.value; apply(); });
  el.append(h('div', { class: 'row' }, h('span', {}, 'กระสุน'), cal));
  const auto = h('input', { type: 'checkbox', checked: !!(gun.stats.auto ?? def.auto) });
  auto.addEventListener('change', () => { snapshot(); gun.stats.auto = auto.checked; apply(); });
  el.append(h('div', { class: 'row' }, h('label', {}, auto, 'ยิงออโต้ (กดค้าง)')));
  for (const [k, label, step] of STATS) if (k !== 'reloadTime' && k !== 'shellTime') el.append(statRow(k, label, step));
}

function buildTabs() {
  const tabs = [['parts', 'ชิ้นส่วน'], ['points', 'จุด & มือ'], ['reload', 'รีโหลด'], ['stats', 'ค่าพลัง']];
  const bar = $('tabs');
  const show = (k) => {
    for (const [t] of tabs) $('tab-' + t).classList.toggle('on', t === k);
    for (const b of bar.children) b.classList.toggle('on', b.dataset.k === k);
  };
  for (const [k, label] of tabs) bar.append(h('button', { 'data-k': k, onclick: () => show(k) }, label));
  show('parts');
}

// ---------- the live preview: the real character holding it ----------

const preview = (() => {
  const cv = $('preview'), ctx = cv.getContext('2d');
  const S = 4, LW = cv.width / S, LH = cv.height / S;
  const [floor, floorCtx] = makeCanvas(LW, LH);
  const world = {
    solidsIn: () => [], castRay: (x, y, dx, dy, max) => max, clearLine: () => true, isWall: () => false,
    stain: (fn) => fn(floorCtx), props: [],
  };
  const ENDLESS = { count: () => 999, take: (c, n) => n, give() {} };
  const particles = new Particles(world);
  let player = null, mouse = { x: LW - 6, y: LH / 2 - 4 }, firing = false, reloadNow = false, slow = false, mods = false;
  const renderer = { snap: (v) => Math.round(v * S) / S };
  const ready = loadImages({ head: 'assets/player/head.png', body: 'assets/player/body.png', legL: 'assets/player/leg_l.png', legR: 'assets/player/leg_r.png' }).then((imgs) => {
    player = new Player(imgs, LW / 2 - 8, LH / 2 + 12, { particles, bullets: { spawn() {} }, kick() {}, meleeHit() {}, useThrowable: () => false, spec: null });
    player.setAmmoSource(ENDLESS);
    player.infinite = true;
    setGun();
  });

  function setGun() {
    if (!player || !def) return;
    const w = player.weapons[0];
    if (w && w.def.key === def.key) {
      w.def = def;
      w.art = GUN_ART[def.art];
      w._iconKey = null;
      w.ammo = Math.min(w.ammo, def.magSize);
    } else {
      player.equipGun(def, 0);
      player.weapon.drawT = 0;
    }
    player.weapon.attach = mods ? { sight: art.slots.sight ? 'redDot' : undefined, muzzle: art.slots.muzzle ? 'suppressor' : undefined, under: art.slots.under ? 'vgrip' : undefined, side: art.slots.side ? 'laserLight' : undefined } : {};
    for (const k of Object.keys(player.weapon.attach)) if (!player.weapon.attach[k]) delete player.weapon.attach[k];
  }

  const pos = (e) => {
    const r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * LW, y: ((e.clientY - r.top) / r.height) * LH };
  };
  cv.addEventListener('pointermove', (e) => (mouse = pos(e)));
  cv.addEventListener('pointerdown', (e) => { mouse = pos(e); firing = true; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointerup', () => (firing = false));
  $('pvFire').addEventListener('pointerdown', () => (firing = true));
  $('pvFire').addEventListener('pointerup', () => (firing = false));
  $('pvFire').addEventListener('pointerleave', () => (firing = false));
  $('pvReload').addEventListener('click', () => reload());
  $('pvSlow').addEventListener('click', (e) => { slow = !slow; e.target.classList.toggle('on', slow); });
  $('pvMods').addEventListener('click', (e) => { mods = !mods; e.target.classList.toggle('on', mods); setGun(); });

  function reload() {
    if (!player) return;
    player.weapon.ammo = 0;   // from empty, so the whole reload plays
    reloadNow = true;
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000) * (slow ? 0.25 : 1);
    last = now;
    if (player) {
      const ox = player.x, oy = player.y - 9;
      player.update(dt, {
        move: { x: 0, y: 0 }, aim: Math.atan2(mouse.y - oy, mouse.x - ox), target: { x: mouse.x, y: mouse.y }, fire: firing, reload: reloadNow,
        sprint: false, heal: false, grenade: false, cycleThrow: false, toggleLight: false, switchTo: null, cycle: 0, roll: false,
      }, world);
      reloadNow = false;
      particles.update(dt);
      // keep the floor from filling up with brass
      floorCtx.globalCompositeOperation = 'destination-out';
      floorCtx.fillStyle = `rgba(0,0,0,${dt * 0.4})`;
      floorCtx.fillRect(0, 0, LW, LH);
      floorCtx.globalCompositeOperation = 'source-over';
      ctx.setTransform(S, 0, 0, S, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#3a4632';
      ctx.fillRect(0, 0, LW, LH);
      ctx.fillStyle = '#34402d';
      for (let y = 0; y < LH; y += 16) for (let x = (y / 16) % 2 ? 16 : 0; x < LW; x += 32) ctx.fillRect(x, y, 16, 16);
      ctx.drawImage(floor, 0, 0);
      particles.draw(ctx, 'ground');
      player.drawShadow(ctx, renderer);
      player.draw(ctx, renderer);
      particles.draw(ctx, 'mid');
      player.drawEmissive(ctx, renderer);
      particles.draw(ctx, 'air');
      // ammo
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillStyle = '#e8ecd8';
      const w = player.weapon;
      ctx.fillText(`${w.ammo}/${w.magSize}${w.reloading ? '  กำลังรีโหลด' : ''}`, 8, cv.height - 8);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  addEventListener('keydown', (e) => { if (e.code === 'KeyR' && !e.ctrlKey && document.activeElement?.tagName !== 'INPUT') reload(); });
  return { setGun, ready };
})();

// ---------- header buttons, keys ----------

async function save() {
  if (!/^[a-z0-9_-]{1,40}$/.test(gun.key)) return say('คีย์ใช้ได้แค่ a-z 0-9 _ -', true);
  if (!Object.values(gun.art.parts).some((p) => p.rows.length)) return say('ยังไม่ได้วาดอะไรเลย', true);
  for (const p of Object.values(gun.art.parts)) trim(p);
  try {
    const r = await fetch(`/api/guns/${gun.key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gun) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.status);
    const i = CUSTOM_GUNS.findIndex((c) => c.key === gun.key);
    if (i >= 0) CUSTOM_GUNS[i] = clone(gun);
    else CUSTOM_GUNS.push(clone(gun));
    dirty = false;
    buildGunSel();
    say(`บันทึกแล้ว → assets/guns/${gun.key}.json`);
    return true;
  } catch (e) {
    say('บันทึกไม่ได้: ' + e.message + ' (เปิดเกมด้วย start.bat / node server.js หรือยัง?)', true);
    return false;
  }
}

$('saveBtn').addEventListener('click', save);
$('testBtn').addEventListener('click', async () => {
  if (dirty && !(await save())) return;
  window.open(`index.html?gun=${encodeURIComponent(gun.key)}#training`, '_blank');
});
$('delBtn').addEventListener('click', async () => {
  if (!CUSTOM_GUNS.some((c) => c.key === gun.key)) return say('ปืนนี้ยังไม่ได้บันทึกเป็นไฟล์', true);
  if (!confirm(`ลบไฟล์ assets/guns/${gun.key}.json ?`)) return;
  await fetch(`/api/guns/${gun.key}`, { method: 'DELETE' });
  CUSTOM_GUNS.splice(CUSTOM_GUNS.findIndex((c) => c.key === gun.key), 1);
  say('ลบแล้ว (รีโหลดหน้าเพื่อดูปืนเดิม)');
  buildGunSel();
});
$('backBtn').addEventListener('click', () => { if (!dirty || confirm('ยังไม่ได้บันทึก กลับเกมเลยไหม?')) location.href = 'index.html'; });
$('newBtn').addEventListener('click', () => { if (!dirty || confirm('ทิ้งที่แก้ไว้?')) load(blank()); });
$('undoBtn').addEventListener('click', () => doUndo());
$('redoBtn').addEventListener('click', () => doRedo());
$('gunSel').addEventListener('change', (e) => {
  if (dirty && !confirm('ทิ้งที่แก้ไว้?')) return buildGunSel();
  load(fromGame(e.target.value));
});

function doUndo() {
  if (!undo.length) return;
  redo.push(JSON.stringify(gun));
  restore(undo.pop());
}
function doRedo() {
  if (!redo.length) return;
  undo.push(JSON.stringify(gun));
  restore(redo.pop());
}

addEventListener('keydown', (e) => {
  if (document.activeElement && ['INPUT', 'SELECT'].includes(document.activeElement.tagName)) return;
  const k = e.key.toLowerCase();
  if (e.ctrlKey && k === 'z') { e.preventDefault(); return e.shiftKey ? doRedo() : doUndo(); }
  if (e.ctrlKey && k === 'y') { e.preventDefault(); return doRedo(); }
  if (e.ctrlKey && k === 's') { e.preventDefault(); return save(); }
  if (e.ctrlKey) return;
  const t = TOOLS.find(([, , key]) => key.toLowerCase() === k);
  if (t) return setTool(t[0]);
  if (e.key === 'Escape') { slotPick = null; return; }
  if (e.key === '[' || e.key === ']') {
    const o = gun.art.order, i = o.indexOf(cur);
    if (o.length) selectPart(o[(i + (e.key === ']' ? 1 : -1) + o.length) % o.length]);
    return;
  }
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (arrows && cur) {
    e.preventDefault();
    snapshot();
    const p = gun.art.parts[cur];
    p.x += arrows[0];
    p.y += arrows[1];
    apply();
    buildParts();
  }
});
addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });
addEventListener('resize', fit);

// ---------- start ----------

buildTabs();
const start = new URLSearchParams(location.search).get('gun');
load(fromGame(WEAPONS[start] && !WEAPONS[start].spec ? start : 'm4a1'));
fit();
