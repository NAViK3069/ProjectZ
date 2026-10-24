// The survival mode's screens and extras: the camp's people (NPCs), the HUD
// additions (day / clock, hunger, the generator, jobs, markers to the camp and
// airdrops), the map (M), the plane and falling crates, and what the panels at
// the generator / workbench / Sarge / the trader show.

import { makeCanvas, rect } from '../engine/pixel.js';
import { drawText, textWidth } from './font.js';
import { ORIGIN_X, ORIGIN_Y, enterFacing } from '../entities/rig.js';
import { ITEMS } from '../game/items.js';
import { RECIPES, LEVELS, DAY_LEN } from '../game/apocalypse.js';
import { MAT } from '../world/apocmap.js';

const C = { frame: '#050604', panel: '#1b2117', text: '#e8ecd8', dim: '#7c8670', gold: '#ffd84a', green: '#9bd65a', red: '#ff5a4a', food: '#e8a14a', fuel: '#e86a3a', blue: '#7fb7d9' };

// ---------- the camp's people ----------

// The survivors at camp use the player's sprite, recoloured.
export class Npc {
  constructor(images, x, y, name, role, hue) {
    Object.assign(this, { x, y, name, role });
    this.sortY = y;
    this.facing = 1;
    this.t = Math.random() * 6;
    const tint = (img) => {
      const [c, g] = makeCanvas(img.width, img.height);
      g.filter = `hue-rotate(${hue}deg) saturate(0.7)`;
      g.drawImage(img, 0, 0);
      return c;
    };
    this.parts = { head: tint(images.head), body: tint(images.body), legL: tint(images.legL), legR: tint(images.legR) };
    const [s] = makeCanvas(13, 5);
    const sg = s.getContext('2d');
    sg.fillStyle = 'rgba(8, 10, 6, 0.4)';
    sg.beginPath();
    sg.ellipse(6.5, 2.5, 6.5, 2.5, 0, 0, Math.PI * 2);
    sg.fill();
    this.shadow = s;
  }

  update(dt, player) {
    this.t += dt;
    if (Math.abs(player.x - this.x) > 3 && Math.hypot(player.x - this.x, player.y - this.y) < 120) this.facing = player.x > this.x ? 1 : -1;
  }

  drawShadow(ctx) {
    ctx.drawImage(this.shadow, Math.round(this.x) - 6, Math.round(this.y) - 3);
  }

  draw(ctx) {
    const P = this.parts, breathe = Math.sin(this.t * 2) > 0.6 ? 1 : 0;
    enterFacing(ctx, Math.round(this.x), Math.round(this.y), this.facing);
    const ox = -ORIGIN_X, oy = -ORIGIN_Y;
    ctx.drawImage(P.legL, ox, oy);
    ctx.drawImage(P.legR, ox, oy);
    ctx.drawImage(P.body, ox, oy + breathe);
    ctx.drawImage(P.head, ox, oy + breathe);
    // a hat to tell them apart: Sarge's beret, the trader's cap
    if (this.role === 'sarge') {
      rect(ctx, '#2f3a22', -5, -27 + breathe, 9, 3);
      rect(ctx, '#3f4a2c', -4, -28 + breathe, 7, 1);
      rect(ctx, '#e8b84a', 2, -27 + breathe, 1, 1);
    } else {
      rect(ctx, '#7a3326', -5, -27 + breathe, 9, 3);
      rect(ctx, '#7a3326', 3, -25 + breathe, 4, 1);
    }
    ctx.restore();
  }
}

// ---------- in the sky: the plane and the crates coming down ----------

const PLANE = (() => {
  const [c, g] = makeCanvas(46, 34);
  const col = '#2a2e30';
  rect(g, col, 20, 2, 6, 30);        // fuselage
  rect(g, col, 2, 12, 42, 6);        // wings
  rect(g, col, 12, 27, 22, 4);       // tail
  rect(g, '#3a4044', 21, 3, 4, 28);
  rect(g, '#14181a', 6, 13, 3, 4);   // engines
  rect(g, '#14181a', 37, 13, 3, 4);
  return c;
})();

export function drawSky(ctx, apoc) {
  const pl = apoc.plane;
  if (pl) {
    // its shadow sweeps over the ground, the plane itself high above
    const a = Math.atan2(pl.dy, pl.dx) + Math.PI / 2;
    for (const [ox, oy, alpha] of [[40, 60, 0.25], [0, 0, 0.95]]) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(Math.round(pl.x + ox), Math.round(pl.y + oy - 80));
      ctx.rotate(a);
      ctx.drawImage(PLANE, -23, -17);
      ctx.restore();
    }
  }
  for (const d of apoc.drops) {
    if (d.landed) continue;
    const x = Math.round(d.x), y = Math.round(d.y - d.z);
    // shadow on the ground, the crate under a chute
    ctx.fillStyle = 'rgba(8, 10, 6, 0.35)';
    ctx.fillRect(x - 8, Math.round(d.y) - 2, 16, 3);
    ctx.fillStyle = '#d9d4c0';
    ctx.beginPath();
    ctx.ellipse(x, y - 30, 16, 8, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#c23a2e';
    ctx.fillRect(x - 3, y - 38, 6, 8);
    ctx.fillStyle = '#a8a28e';
    for (const sx of [-14, -5, 5, 14]) ctx.fillRect(x + sx * 0.6, y - 30, 1, 20);
    ctx.fillStyle = '#10140d';
    ctx.fillRect(x - 9, y - 12, 18, 13);
    ctx.fillStyle = '#4a5a6a';
    ctx.fillRect(x - 8, y - 11, 16, 11);
    ctx.fillStyle = '#c23a2e';
    ctx.fillRect(x - 8, y - 6, 16, 2);
  }
}

// ---------- HUD ----------

export function drawApocHud(ctx, r, apoc, player, world, time, search) {
  const u = r.scale, W = r.width / u, H = r.height / u;
  const px = (x, y, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x * u), Math.round(y * u), Math.round(w * u), Math.round(h * u));
  };
  const text = (s, x, y, color, size = 1) => drawText(ctx, s, Math.round(x * u), Math.round(y * u), u * size, color);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // top middle: the day and the clock, sun or moon
  const night = apoc.phase === 'night' || apoc.phase === 'dusk';
  const title = `${night ? 'NIGHT' : 'DAY'} ${apoc.day}`;
  const cx = Math.round(W / 2);
  px(cx - 46, 3, 92, 20, 'rgba(5, 7, 4, 0.65)');
  text(title, cx - textWidth(title, 2) / 2, 6, night ? C.blue : C.gold, 2);
  const sub = apoc.phase === 'night' ? `${apoc.nightLeft + apoc.alive()} LEFT` : apoc.clock;
  text(sub, cx - textWidth(sub) / 2, 17, C.dim);
  // how much day is left
  if (apoc.phase === 'day') {
    px(cx - 40, 24, 80, 2, '#2a3126');
    px(cx - 40, 24, 80 * (1 - apoc.t / DAY_LEN), 2, apoc.t > DAY_LEN * 0.8 ? C.red : C.gold);
  }

  // under the money: food, and the generator's fuel
  const bx = 35, by = 36;
  const bar = (label, y, k, color) => {
    text(label, bx, y, C.dim);
    px(bx + 22, y, 40, 4, C.frame);
    px(bx + 23, y + 1, 38, 2, '#2a3126');
    px(bx + 23, y + 1, 38 * Math.max(0, k), 2, k < 0.25 && Math.sin(time * 8) > 0 ? C.red : color);
  };
  bar('FOOD', by, (player.hunger ?? 100) / 100, C.food);
  bar('GEN', by + 7, apoc.gen.fuel / apoc.maxFuel, C.fuel);
  text(`LV${apoc.gen.level + 1}`, bx + 64, by + 7, C.dim);
  // buffs
  let bxx = bx;
  for (const [id, left] of Object.entries(player.buffs)) {
    const s = `${{ energy: 'ENERGY', coffee: 'COFFEE', pills: 'PAINKILL', adrenaline: 'ADREN' }[id]} ${Math.ceil(left)}`;
    text(s, bxx, by + 14, C.green);
    bxx += textWidth(s) + 6;
  }
  // gun condition
  const w = player.weapon;
  if (!player.meleeOut && w && !w.def.spec) {
    const k = (w.cond ?? 100) / 100;
    text(`COND ${Math.round(k * 100)}%`, 6, H - 50, k < 0.25 ? C.red : k < 0.5 ? C.food : C.dim);
  }

  // jobs, top right (under the minimap)
  let qy = 72;
  if (apoc.quests.length) text('JOBS', W - 6 - textWidth('JOBS'), qy - 8, C.gold);
  for (const q of apoc.quests) {
    const s = `${q.text}  ${Math.min(q.have, q.need)}/${q.need}`;
    text(s, W - 6 - textWidth(s), qy, C.text);
    qy += 7;
  }

  // minimap, top right
  drawMinimap(ctx, u, W - 64, 4, 60, apoc, player, world, time);

  // markers at the screen edge: the camp, airdrops
  const view = { x: r.left, y: r.top, w: r.viewW, h: r.viewH };
  const marker = (wx, wy, color, label) => {
    const sx = wx - view.x, sy = wy - view.y;
    if (sx > 8 && sy > 8 && sx < view.w - 8 && sy < view.h - 8) return;
    const ccx = view.w / 2, ccy = view.h / 2, a = Math.atan2(sy - ccy, sx - ccx);
    const k = Math.min((view.w / 2 - 14) / Math.abs(Math.cos(a) || 1e-6), (view.h / 2 - 14) / Math.abs(Math.sin(a) || 1e-6));
    const mx = ccx + Math.cos(a) * k, my = ccy + Math.sin(a) * k;
    px(mx - 2, my - 2, 5, 5, C.frame);
    px(mx - 1, my - 1, 3, 3, color);
    const d = `${label} ${Math.round(Math.hypot(wx - player.x, wy - player.y) / 16)}M`;
    text(d, mx - textWidth(d) / 2, my + 5, color);
  };
  marker(world.camp.x, world.camp.y, C.green, 'CAMP');
  for (const d of apoc.drops) marker(d.x, d.y, C.red, 'DROP');

  // searching: a bar over your head
  if (search !== null) {
    const sx = player.x - view.x, sy = player.y - view.y - 34;
    px(sx - 13, sy, 26, 4, C.frame);
    px(sx - 12, sy + 1, 24 * search, 2, C.gold);
    text('SEARCHING', sx - textWidth('SEARCHING') / 2, sy - 7, C.text);
  }
  ctx.restore();
}

// ---------- the map ----------

let MAPIMG = null;
// A picture of the whole map, one pixel per cell.
function mapImage(world) {
  if (MAPIMG?.world === world) return MAPIMG.img;
  const [c, g] = makeCanvas(world.w, world.h);
  const col = { [MAT.GRASS]: '#3f5a2c', [MAT.DIRT]: '#5a4a34', [MAT.ROAD]: '#2a2c2e', [MAT.CONCRETE]: '#646760', [MAT.WOOD]: '#6e4a2c', [MAT.TILES]: '#8a8a7e', [MAT.GRAVEL]: '#5e5a50' };
  for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
    const v = world.get(x, y), k = y * world.w + x;
    g.fillStyle = v === 2 ? (world.wallKind[k] === 4 ? '#142016' : '#2a2420') : v === 3 ? '#8d9c9c' : v === 1 ? col[world.mat[k]] ?? '#3f5a2c' : '#080a07';
    g.fillRect(x, y, 1, 1);
  }
  g.fillStyle = 'rgba(20, 40, 18, 0.55)';
  for (const p of world.props) if (p.fade) g.fillRect(Math.floor(p.x / 16), Math.floor(p.y / 16), 1, 1);
  MAPIMG = { world, img: c };
  return c;
}

function drawMinimap(ctx, u, x0, y0, size, apoc, player, world, time) {
  const img = mapImage(world), R = 28;   // cells shown round you
  const cx = player.x / 16, cy = player.y / 16;
  ctx.save();
  ctx.beginPath();
  ctx.arc((x0 + size / 2) * u, (y0 + size / 2) * u, (size / 2) * u, 0, Math.PI * 2);
  ctx.fillStyle = '#050604';
  ctx.fill();
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  const s = (size * u) / (R * 2);
  ctx.drawImage(img, cx - R, cy - R, R * 2, R * 2, x0 * u, y0 * u, size * u, size * u);
  const dot = (wx, wy, color, n = 2) => {
    const mx = (x0 + size / 2) * u + (wx / 16 - cx) * s, my = (y0 + size / 2) * u + (wy / 16 - cy) * s;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(mx - n * u / 2), Math.round(my - n * u / 2), n * u, n * u);
  };
  dot(world.camp.x, world.camp.y, C.green, 3);
  for (const d of apoc.drops) dot(d.x, d.y, Math.sin(time * 6) > 0 ? C.red : '#ffffff', 3);
  for (const z of apoc.g.rounds.zombies) if (z.dying < 0 && z.alert && Math.hypot(z.x - player.x, z.y - player.y) < 400) dot(z.x, z.y, '#c23a2e', 1);
  dot(player.x, player.y, '#ffffff', 2);
  ctx.restore();
  ctx.strokeStyle = '#2c3526';
  ctx.lineWidth = u;
  ctx.beginPath();
  ctx.arc((x0 + size / 2) * u, (y0 + size / 2) * u, (size / 2) * u, 0, Math.PI * 2);
  ctx.stroke();
}

// The full map (M): everything, the places you've found named.
export function drawMapScreen(ctx, r, apoc, player, world, time) {
  const u = r.scale, W = r.width / u, H = r.height / u;
  const img = mapImage(world);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(5, 7, 4, 0.9)';
  ctx.fillRect(0, 0, r.width, r.height);
  const size = Math.min(W - 20, H - 30), s = size / world.w, x0 = Math.round(W / 2 - size / 2), y0 = 18;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, x0 * u, y0 * u, size * u, size * u);
  const at = (wx, wy) => [x0 + (wx / 16) * s, y0 + (wy / 16) * s];
  const text = (t, x, y, color) => drawText(ctx, t, Math.round(x * u), Math.round(y * u), u, color);
  const dot = (wx, wy, color, n) => {
    const [mx, my] = at(wx, wy);
    ctx.fillStyle = color;
    ctx.fillRect(Math.round((mx - n / 2) * u), Math.round((my - n / 2) * u), n * u, n * u);
  };
  for (const p of world.pois) {
    const [mx, my] = at(p.x, p.y);
    dot(p.x, p.y, p.visited ? C.gold : C.dim, 2);
    if (p.visited) text(p.name, mx - textWidth(p.name) / 2, my + 3, C.gold);
  }
  dot(world.camp.x, world.camp.y, C.green, 4);
  text('CAMP', at(world.camp.x, 0)[0] - textWidth('CAMP') / 2, at(0, world.camp.y)[1] + 4, C.green);
  for (const d of apoc.drops) dot(d.x, d.y, Math.sin(time * 6) > 0 ? C.red : '#ffffff', 4);
  dot(player.x, player.y, '#ffffff', 3);
  text(`MAP  -  SEED ${world.seed}`, 8, 6, C.gold);
  text('M / ESC CLOSE', W - 8 - textWidth('M / ESC CLOSE'), 6, C.dim);
  ctx.restore();
}

// ---------- what the panels show ----------

const need = (inv, needs) => Object.entries(needs).map(([id, n]) => `${n} ${ITEMS[id].name}${inv.countId(id) < n ? '!' : ''}`).join('  ');

export function generatorPanel(apoc) {
  const inv = apoc.g.player.inventory, L = LEVELS[apoc.gen.level], next = LEVELS[apoc.gen.level + 1];
  return {
    title: `GENERATOR  LV${apoc.gen.level + 1}`,
    lines: [`FUEL ${Math.ceil(apoc.gen.fuel)} / ${apoc.maxFuel}   LIGHT ${L.light}`, apoc.gen.fuel <= 0 ? 'OUT OF FUEL - THE LIGHTS ARE OFF' : 'THE DEAD ARE SLOW IN ITS LIGHT'],
    rows: [
      { text: 'ADD FUEL CAN (+35)', right: `X${inv.countId('fuelCan')}`, ok: inv.countId('fuelCan') > 0, why: 'NO FUEL CANS', action: () => apoc.refuel('fuelCan') },
      { text: 'ADD WOOD (+6)', right: `X${inv.countId('wood')}`, ok: inv.countId('wood') > 0, why: 'NO WOOD', action: () => apoc.refuel('wood') },
      next
        ? { text: `UPGRADE TO LV${apoc.gen.level + 2}`, sub: `LIGHT ${next.light}  TANK ${next.fuel}  NEW RECIPES`, right: `${next.scrap} SCRAP`, ok: inv.countId('scrap') >= next.scrap, why: `NEEDS ${next.scrap} SCRAP`, action: () => apoc.upgrade() }
        : { text: 'MAX LEVEL', ok: false },
    ],
  };
}

export function benchPanel(apoc) {
  const inv = apoc.g.player.inventory, lv = apoc.gen.level + 1;
  return {
    title: 'WORKBENCH',
    lines: [`GENERATOR LV${lv} - LEVEL IT UP FOR MORE`],
    rows: RECIPES.map((r) => {
      const [, name, tier, needs, makes] = r;
      if (tier > lv) return { text: name, sub: `NEEDS GENERATOR LV${tier}`, ok: false, why: `UPGRADE THE GENERATOR TO LV${tier}` };
      return { text: name + (makes.place ? '  (PLACE)' : ''), sub: need(inv, needs), ok: apoc.canCraft(r), why: 'NOT ENOUGH MATERIALS', action: () => apoc.craft(r) };
    }),
  };
}

export function sargePanel(apoc) {
  const rows = [];
  for (const q of apoc.quests) {
    if (q.kind === 'bring') {
      const have = apoc.g.player.inventory.countId(q.id);
      rows.push({ text: `HAND IN: ${q.text}`, right: `+$${q.reward}`, sub: `YOU HAVE ${have}`, ok: have >= q.need, why: 'NOT ENOUGH YET', action: () => apoc.handIn(q) });
    } else rows.push({ text: q.text, sub: `IN PROGRESS ${Math.min(q.have, q.need)}/${q.need}`, right: `+$${q.reward}`, ok: false, why: 'STILL TO DO', color: '#9bd65a' });
  }
  apoc.offers.forEach((q, i) => rows.push({ text: `TAKE: ${q.text}`, right: `+$${q.reward}`, ok: apoc.quests.length < 3, why: '3 JOBS AT A TIME', action: () => apoc.accept(i) }));
  return {
    title: 'SARGE',
    lines: [`"KEEP THAT GENERATOR RUNNING, KID."`, `JOBS DONE ${apoc.questsDone}   NEW JOBS EVERY MORNING`],
    rows,
  };
}

export function traderPanel(apoc) {
  return {
    title: 'TRADER',
    lines: [`CASH $${apoc.g.money}   NEW STOCK EVERY MORNING`],
    rows: apoc.stock.map((s) => ({
      text: s.kind === 'gun' ? `${s.def.name}  (${s.def.caliber.toUpperCase()})` : ITEMS[s.id].name,
      sub: s.kind === 'item' ? ITEMS[s.id].info ?? ({ ammo: 'AMMO', food: 'FOOD', drink: 'DRINK', med: 'MEDICAL', repair: 'REPAIR', armor: 'ARMOR', helmet: 'HELMET', backpack: 'BACKPACK', attachment: 'ATTACHMENT', material: 'MATERIAL', fuel: 'FUEL', throwable: 'THROWABLE' })[ITEMS[s.id].type] : s.def.cls.toUpperCase(),
      right: `$${s.price}`,
      ok: apoc.g.money >= s.price,
      why: 'NOT ENOUGH CASH',
      action: () => apoc.buy(s),
    })),
  };
}
