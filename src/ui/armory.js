// Training armory: pick any weapon, melee weapon, throwable or attachment,
// or let a zombie of any type out into the range. Tabs along the top, cards
// in a grid, the hovered card's stats along the bottom. Guns go into the
// slot chosen with SLOT 2 / SLOT 3.
//
// Layout is in HUD pixels; zones are rebuilt every draw and hit-tested on
// click (mouse) or tap (touch).

import { drawText, textWidth } from './font.js';
import { WEAPON_CLASSES, ATTACH_STATS } from '../combat/weapons.js';
import { MELEE } from '../combat/melee.js';
import { SPEC } from '../combat/spec.js';
import { THROWABLES } from '../combat/throwables.js';
import { ATTACH_ART } from '../combat/gunart.js';
import { ITEMS, itemIcon } from '../game/items.js';
import { TYPES } from '../entities/zombie.js';
import { zombieArt } from '../entities/zombieart.js';

const C = {
  bg: 'rgba(5, 7, 4, 0.88)',
  panel: '#141a11',
  edge: '#2c3526',
  card: '#1d2419',
  cardHi: '#2b3624',
  sel: '#9bd65a',
  text: '#e8ecd8',
  dim: '#7c8670',
  red: '#ff5a4a',
  gold: '#ffd84a',
  frame: '#050604',
};
const CARD_W = 66, CARD_H = 36;

const ZOMBIE_INFO = {
  common: 'SHAMBLER', runner: 'FAST', leaper: 'POUNCES', spitter: 'SPITS ACID', suicide: 'EXPLODES',
  armored: 'RIOT SHIELD', tank: 'BIG + TOUGH', burned: 'FIRE ON DEATH', frozen: 'SLOWS YOU', toxic: 'GAS ON DEATH', brute: 'BOSS',
};

// One picture per zombie type: its head and body, from the zombie art.
const zombieThumbs = {};
function zombieThumb(type) {
  if (zombieThumbs[type]) return zombieThumbs[type];
  const a = zombieArt(TYPES[type].looks[0]);
  const c = document.createElement('canvas');
  c.width = a.W;
  c.height = a.H;
  const g = c.getContext('2d');
  for (const k of ['legL', 'legR', 'body', 'head']) if (a[k]) g.drawImage(a[k], 0, 0);
  zombieThumbs[type] = c;
  return c;
}

export class ArmoryScreen {
  // game: { player, equipGun(def, slot), equipMelee(def), giveThrowable(id), attach(key),
  //         spawnZombie(type), clearZombies(), resetStats(), settings: { infAmmo, god } }
  constructor(game) {
    this.game = game;
    this.tabs = [
      ...WEAPON_CLASSES.map((c) => ({ key: c.cls, label: c.cls === 'rifle' ? 'RIFLE' : c.label, cards: c.guns.map((def) => ({ kind: 'gun', def, img: def.img, name: def.name })) })),
      { key: 'spec', label: 'SPEC', cards: Object.values(SPEC).map((def) => ({ kind: 'gun', def, img: def.img, name: def.name })) },
      { key: 'melee', label: 'MELEE', cards: Object.values(MELEE).map((def) => ({ kind: 'melee', def, img: def.img, name: def.name })) },
      { key: 'throw', label: 'THROW', cards: Object.values(THROWABLES).map((t) => ({ kind: 'throw', def: t, img: itemIcon(ITEMS[t.id]), name: t.name })) },
      { key: 'mods', label: 'MODS', cards: Object.keys(ATTACH_ART).map((k) => ({ kind: 'mod', key: k, img: itemIcon(ITEMS[k]), name: ITEMS[k].name })) },
      { key: 'zombie', label: 'ZOMBIES', cards: Object.keys(TYPES).map((t) => ({ kind: 'zombie', type: t, img: null, name: t.toUpperCase() })) },
    ];
    this.tab = 0;
    this.slot = 0;          // which gun slot new guns go in (0 = slot 2, 1 = slot 3)
    this.hover = null;
    this.zones = [];
    this.flash = null;      // { text, t } feedback line
  }

  open() {
    const p = this.game.player;
    this.slot = p.slot;
    this.flash = null;
  }

  say(text, color = C.sel) {
    this.flash = { text, color, t: 1.6 };
  }

  update(mouse, { down, right }) {
    this.mouse = mouse;
    this.hover = this.zoneAt(mouse);
    if (down && this.hover) this.activate(this.hover, false);
    if (right && this.hover) this.activate(this.hover, true);
  }

  tap(pt) {
    const z = this.zoneAt(pt);
    if (z) this.activate(z, false);
  }

  zoneAt(pt) {
    if (!pt) return null;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (pt.x >= z.x && pt.y >= z.y && pt.x < z.x + z.w && pt.y < z.y + z.h) return z;
    }
    return null;
  }

  // alt: right click - for guns, put it in the other slot
  activate(z, alt) {
    const g = this.game, p = g.player;
    if (z.kind === 'tab') return (this.tab = z.index);
    if (z.kind === 'slot') return (this.slot = z.index);
    if (z.kind === 'toggle') {
      g.settings[z.key] = !g.settings[z.key];
      g.applySettings();
      return;
    }
    if (z.kind === 'action') return z.run();
    const c = z.card;
    if (!c) return;
    if (c.kind === 'gun') {
      const slot = alt ? 1 - this.slot : this.slot;
      g.equipGun(c.def, slot);
      this.say(`${c.name} -> SLOT ${slot + 2}`);
    } else if (c.kind === 'melee') {
      g.equipMelee(c.def);
      this.say(`${c.name} -> SLOT 1`);
    } else if (c.kind === 'throw') {
      g.giveThrowable(c.def.id);
      this.say(`${c.name} SELECTED  (G)`);
    } else if (c.kind === 'mod') {
      const res = g.attach(c.key);
      const gun = p.weapon?.def.name ?? 'NOTHING';
      this.say(res === 'on' ? `${c.name} ON ${gun}` : res === 'off' ? `${c.name} REMOVED` : `${c.name} DOES NOT FIT ${gun}`, res ? C.sel : C.red);
    } else if (c.kind === 'zombie') {
      g.spawnZombie(c.type);
      this.say(`${c.name} RELEASED IN LANE 3`, C.red);
    }
  }

  // Is this card what you have right now?
  current(c) {
    const p = this.game.player;
    if (c.kind === 'gun') return p.weapons.some((w) => w?.def === c.def);
    if (c.kind === 'melee') return p.melee.def === c.def;
    if (c.kind === 'throw') return p.throwSel === c.def.id;
    if (c.kind === 'mod') return !!p.weapon && Object.values(p.weapon.attach).includes(c.key);
    return false;
  }

  draw(ctx, r, time) {
    const u = r.scale, W = r.width / u, H = r.height / u;
    const px = (x, y, w, h, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x * u), Math.round(y * u), Math.round(w * u), Math.round(h * u));
    };
    // dark text on a lit button gets no drop shadow
    const text = (s, x, y, color, size = 1) => drawText(ctx, s, Math.round(x * u), Math.round(y * u), u * size, color, color === C.frame ? null : undefined);
    const img = (im, x, y, s = 1) => ctx.drawImage(im, Math.round(x * u), Math.round(y * u), Math.round(im.width * s * u), Math.round(im.height * s * u));
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, r.width, r.height);
    this.zones = [];
    const zone = (z) => this.zones.push(z);
    const hovered = (x, y, w, h) => this.mouse && this.mouse.x >= x && this.mouse.y >= y && this.mouse.x < x + w && this.mouse.y < y + h;

    // sized for the biggest tab, so it doesn't jump about when switching
    const pw = Math.min(W - 12, 6 * (CARD_W + 4) + 16);
    const most = Math.max(...this.tabs.map((t) => t.cards.length)), cols0 = Math.max(1, Math.floor((pw - 12) / (CARD_W + 4)));
    const ph = Math.min(H - 12, 80 + Math.ceil(most / cols0) * (CARD_H + 4) + 30);
    const x0 = Math.round(W / 2 - pw / 2), y0 = Math.max(6, Math.round(H / 2 - ph / 2));
    px(x0 - 1, y0 - 1, pw + 2, ph + 2, C.frame);
    px(x0, y0, pw, ph, C.panel);
    px(x0, y0, pw, 1, C.edge);
    text('ARMORY', x0 + 8, y0 + 6, C.gold, 2);
    const hint = 'CLICK = EQUIP   RCLICK = OTHER SLOT   ESC = CLOSE';
    if (pw > textWidth(hint) + 80) text(hint, x0 + pw - 8 - textWidth(hint), y0 + 9, C.dim);

    // tabs (wrap onto more rows on narrow screens)
    let tx = x0 + 8, ty = y0 + 22;
    this.tabs.forEach((t, i) => {
      const w = textWidth(t.label) + 8;
      if (tx + w > x0 + pw - 6) {
        tx = x0 + 8;
        ty += 12;
      }
      const on = i === this.tab, hov = hovered(tx, ty, w, 10);
      px(tx, ty, w, 10, on ? C.sel : hov ? C.cardHi : C.card);
      text(t.label, tx + 4, ty + 3, on ? C.frame : C.text);
      zone({ kind: 'tab', index: i, x: tx, y: ty, w, h: 10 });
      tx += w + 3;
    });

    // options: target slot for guns, toggles, actions
    let ox = x0 + 8;
    const oy = ty + 15;
    const button = (label, on, z, color = C.sel) => {
      const w = textWidth(label) + 8, hov = hovered(ox, oy, w, 10);
      px(ox, oy, w, 10, C.frame);
      px(ox + 1, oy + 1, w - 2, 8, on ? color : hov ? C.cardHi : C.card);
      text(label, ox + 4, oy + 3, on ? C.frame : C.text);
      zone({ ...z, x: ox, y: oy, w, h: 10 });
      ox += w + 4;
    };
    const tab = this.tabs[this.tab];
    if (['pistol', 'smg', 'rifle', 'sniper', 'shotgun', 'lmg', 'mods'].includes(tab.key)) {
      text(tab.key === 'mods' ? 'ON:' : 'TO:', ox, oy + 3, C.dim);
      ox += 16;
      if (tab.key === 'mods') button(this.game.player.weapon?.def.name ?? 'NO GUN', true, { kind: 'none' });
      else for (const i of [0, 1]) button(`SLOT ${i + 2}`, this.slot === i, { kind: 'slot', index: i });
      ox += 6;
    }
    const s = this.game.settings;
    button('INF AMMO', s.infAmmo, { kind: 'toggle', key: 'infAmmo' });
    button('GOD MODE', s.god, { kind: 'toggle', key: 'god' });
    if (tab.key === 'zombie') {
      button('FREEZE', s.freeze, { kind: 'toggle', key: 'freeze' }, '#7fb7f9');
      button('CLEAR', false, { kind: 'action', run: () => (this.game.clearZombies(), this.say('ZOMBIES CLEARED')) });
    } else {
      button('RESET STATS', false, { kind: 'action', run: () => (this.game.resetStats(), this.say('STATS RESET')) });
    }

    // cards
    const gy = oy + 16, cols = Math.max(1, Math.floor((pw - 12) / (CARD_W + 4)));
    const gx = x0 + Math.round((pw - cols * (CARD_W + 4) + 4) / 2);
    let hoverCard = null;
    tab.cards.forEach((c, i) => {
      const cx = gx + (i % cols) * (CARD_W + 4), cy = gy + Math.floor(i / cols) * (CARD_H + 4);
      if (cy + CARD_H > y0 + ph - 26) return;
      const hov = hovered(cx, cy, CARD_W, CARD_H), cur = this.current(c);
      if (hov) hoverCard = c;
      px(cx - 1, cy - 1, CARD_W + 2, CARD_H + 2, cur ? C.sel : C.frame);
      px(cx, cy, CARD_W, CARD_H, hov ? C.cardHi : C.card);
      const im = c.img ?? zombieThumb(c.type);
      const fit = Math.min((CARD_W - 6) / im.width, (CARD_H - 12) / im.height);
      const sc = fit >= 2 ? 2 : fit >= 1 ? 1 : fit;   // whole-pixel scales where it fits
      img(im, cx + CARD_W / 2 - (im.width * sc) / 2, cy + 2 + (CARD_H - 12 - im.height * sc) / 2, sc);
      const name = c.name.length > 15 ? c.name.slice(0, 15) : c.name;
      text(name, cx + CARD_W / 2 - textWidth(name) / 2, cy + CARD_H - 7, cur ? C.sel : C.text);
      zone({ kind: 'card', card: c, x: cx, y: cy, w: CARD_W, h: CARD_H });
    });

    // stats of the hovered card, or the last thing that happened
    const by = y0 + ph - 20;
    px(x0 + 6, by - 3, pw - 12, 1, C.edge);
    if (hoverCard) {
      const lines = this.describe(hoverCard);
      text(lines[0], x0 + 8, by, C.gold);
      text(lines[1], x0 + 8, by + 8, C.text);
    } else if (this.flash && (this.flash.t -= 1 / 60) > 0) {
      text(this.flash.text, x0 + 8, by + 4, this.flash.color);
    } else {
      text('1 MELEE   2 / 3 GUNS   G THROW   X NEXT THROWABLE', x0 + 8, by + 4, C.dim);
    }
    ctx.restore();
  }

  describe(c) {
    if (c.kind === 'gun' && c.def.spec) return [`${c.def.name}  -  ${c.def.desc}`, `${c.def.info}   BATTERY`];
    if (c.kind === 'gun') {
      const d = c.def, rpm = Math.round(60 / d.fireInterval);
      const fire = d.burst ? `${d.burst}-ROUND BURST` : d.auto ? 'AUTO' : d.action ? (d.action.part === 'pump' ? 'PUMP' : 'BOLT') : 'SEMI';
      return [`${d.name}  -  ${d.caliber.toUpperCase()}  ${fire}`, `DMG ${d.damage}${d.pellets ? 'X' + d.pellets : ''}   RPM ${rpm}   MAG ${d.magSize}   RELOAD ${d.reload === 'shells' ? d.shellTime + 'S/SHELL' : (d.reloadTime ?? 0) + 'S'}${d.pierce ? '   PIERCE ' + d.pierce : ''}`];
    }
    if (c.kind === 'melee') {
      const d = c.def;
      return [`${d.name}  -  ${d.style === 'saw' ? 'HOLD TO CUT' : d.style === 'stab' ? 'STAB' : 'SWING'}  ${d.hands === 2 ? 'TWO-HANDED' : 'ONE-HANDED'}`, `DMG ${d.damage}${d.style === 'saw' ? '/TICK' : ''}   SPEED ${d.time}S   REACH ${d.reach}   KNOCKBACK ${d.knock}`];
    }
    if (c.kind === 'throw') {
      const info = {
        grenade: 'FUSE 1.6S - BLAST', frag: 'BLAST + SHRAPNEL', smoke: 'ZOMBIES LOSE YOU IN THE CLOUD', flashbang: 'STUNS ZOMBIES THAT SEE IT',
        stun: 'SHOCKS + STUNS NEARBY', molotov: 'POOL OF FIRE', c4: 'G AGAIN TO DETONATE', landmine: 'STEP ON IT - BOOM', claymore: 'CONE OF STEEL BALLS',
        tripmine: 'LASER TRIPWIRE', flare: 'BRIGHT RED LIGHT', taser: 'ZAP + STUN THE FIRST IN LINE',
      };
      return [c.name, info[c.def.id] ?? ''];
    }
    if (c.kind === 'mod') {
      const st = ATTACH_STATS[c.key] ?? {};
      const parts = Object.entries(st).filter(([, v]) => typeof v === 'number').map(([k, v]) => `${k.toUpperCase()} X${v}`);
      return [`${c.name}  -  ${ATTACH_ART[c.key].slot.toUpperCase()}`, parts.join('   ')];
    }
    const T = TYPES[c.type];
    return [`${c.name}  -  ${ZOMBIE_INFO[c.type] ?? ''}`, `HP X${T.hp}   SPEED X${T.speed}   DMG ${T.damage}`];
  }
}
