// Screen-space HUD drawn in "HUD pixels" (same size as a world pixel):
// portrait + health/stamina bars + round + money top-left, weapon + ammo
// bottom-left, round banner, damage flash and the game-over screen.

import { artW, artH } from '../combat/gunart.js';
import { drawText, textWidth } from './font.js';
import { MAX_HP, MAX_STAMINA } from '../entities/player.js';
import { THROWABLES } from '../combat/throwables.js';

const C = {
  frame: '#050604',
  panel: '#1b2117',
  panelHi: '#2c3526',
  hp: '#d7313d',
  hpHi: '#ff6670',
  hpLost: '#f4e7d0',
  stamina: '#3fd0a0',
  staminaHi: '#8af0cc',
  barBg: '#0f130d',
  green: '#9bd65a',
  text: '#e8ecd8',
  red: '#ff4a4a',
};

export class Hud {
  constructor(headImg) {
    this.head = headImg;
    this.hpShown = MAX_HP;   // trailing "lost health" bar
    this.floaters = [];      // "-$900" that drift up from the money
    this.denyTime = 0;       // money shakes red when you can't afford something
    this.noticeText = '';
    this.noticeTime = 0;
    this.promptRect = null;  // css-px rect of the buy prompt (tappable on touch)
  }

  spent(amount) {
    this.floaters.push({ text: `-$${amount}`, t: 0 });
  }

  deny() {
    this.denyTime = 0.45;
  }

  notice(text) {
    this.noticeText = text;
    this.noticeTime = 1.2;
  }

  // training: the DPS meter's stats (null in survival)
  draw(ctx, r, { player, rounds, money, time, prompt, touch, training = null }) {
    const u = r.scale;
    const W = r.width / u, H = r.height / u;
    const px = (x, y, w, h, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x * u), Math.round(y * u), Math.round(w * u), Math.round(h * u));
    };
    const text = (s, x, y, color, size = 1) => drawText(ctx, s, Math.round(x * u), Math.round(y * u), u * size, color);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // damage flash + low health pulse
    const hurt = Math.max(0, 0.5 - player.hurtTime) * 0.8 + (player.hp < 35 && !player.dead ? 0.12 + 0.08 * Math.sin(time * 6) : 0);
    if (hurt > 0) {
      ctx.fillStyle = `rgba(150, 0, 0, ${hurt})`;
      ctx.fillRect(0, 0, r.width, r.height);
    }

    // --- portrait + bars ---
    const x0 = 6, y0 = 6;
    px(x0 - 1, y0 - 1, 26, 26, C.frame);
    px(x0, y0, 24, 24, C.panel);
    px(x0, y0, 24, 1, C.panelHi);
    ctx.drawImage(this.head, 5, 0, 22, 21, Math.round((x0 + 1) * u), Math.round((y0 + 3) * u), 22 * u, 21 * u);

    this.hpShown += (player.hp - this.hpShown) * Math.min(1, 0.05 + (this.hpShown > player.hp ? 0.04 : 1));
    const bx = x0 + 29, bw = 62;
    px(bx - 1, y0 - 1, bw + 2, 7, C.frame);
    px(bx, y0, bw, 5, C.barBg);
    px(bx, y0, (bw * Math.max(0, this.hpShown)) / MAX_HP, 5, C.hpLost);
    px(bx, y0, (bw * player.hp) / MAX_HP, 5, C.hp);
    px(bx, y0, (bw * player.hp) / MAX_HP, 1, C.hpHi);
    px(bx - 1, y0 + 7, bw + 2, 5, C.frame);
    px(bx, y0 + 8, bw, 3, C.barBg);
    px(bx, y0 + 8, (bw * player.stamina) / MAX_STAMINA, 3, C.stamina);
    px(bx, y0 + 8, (bw * player.stamina) / MAX_STAMINA, 1, C.staminaHi);
    // armor / helmet durability as thin bars under the stamina
    const eq = player.inventory.equip;
    [['armor', '#9aa4b8'], ['helmet', '#c9b45a']].forEach(([slot, color], i) => {
      const a = eq[slot];
      if (!a) return;
      px(bx + i * 32, y0 + 12, 30, 2, C.barBg);
      px(bx + i * 32, y0 + 12, (30 * a.durability) / a.def.durability, 2, color);
    });
    const dt = 1 / 60;
    if (training) {
      text('TRAINING', bx, y0 + 15, '#e6c63a');
      this.drawMeter(px, text, W, training, time);
    } else {
      text(`ROUND ${Math.max(1, rounds.round)}`, bx, y0 + 15, C.text);
      // money: shakes red when you can't afford something, spent amounts float up
      this.denyTime -= dt;
      const shake = this.denyTime > 0 ? Math.round(Math.sin(time * 60) * 1.5) : 0;
      text(`$${money}`, bx + shake, y0 + 22, this.denyTime > 0 ? C.red : C.green);
      for (const f of this.floaters) {
        f.t += dt;
        ctx.globalAlpha = Math.max(0, 1 - f.t);
        text(f.text, bx + textWidth(`$${money}`) + 4, y0 + 21 - f.t * 8, C.red);
      }
      ctx.globalAlpha = 1;
      this.floaters = this.floaters.filter((f) => f.t < 1);
    }

    // --- weapon + ammo (or the melee weapon) ---
    const w = player.held, melee = player.meleeOut, wy = H - 26;
    const img = w.icon, iw = artW(img), ih = artH(img);
    const pw = Math.max(46, iw + 6);
    px(x0 - 1, wy - 1, pw + 2, 21, C.frame);
    px(x0, wy, pw, 19, C.panel);
    px(x0, wy, pw, 1, C.panelHi);
    ctx.drawImage(img, Math.round((x0 + pw / 2 - iw / 2) * u), Math.round((wy + 9 - ih / 2) * u), iw * u, ih * u);
    const blink = Math.floor(time * 4) % 2 === 0;
    const ax = x0 + pw + 6;
    if (melee) {
      text(w.def.name, ax, wy + 4, C.text, 2);
      if (w.def.battery) {
        // battery %, spare packs, and the swap's progress
        const pct = Math.round(w.charge), spare = player.infinite ? 'INF' : player.inventory.countId('battery');
        text(`BATT ${pct}%  x${spare}`, ax, wy + 15, pct <= 0 ? (blink ? C.red : C.text) : pct < 25 ? '#ffb347' : '#9bd65a');
        if (w.reloading) {
          px(ax - 1, wy + 21 - 1, 42, 4, C.frame);
          px(ax, wy + 21, 40 * w.reload, 2, C.text);
        } else if (pct <= 0 && blink) text(spare === 0 ? 'NO BATTERY' : '[R] SWAP', ax + 64, wy + 15, C.red);
      } else {
        text(w.def.style === 'saw' ? 'HOLD TO CUT' : w.def.style === 'stab' ? 'STAB' : 'SWING', ax, wy + 15, '#6f7a62');
      }
    } else {
      const magColor = w.ammo === 0 ? (blink ? C.red : C.text) : w.ammo <= w.magSize / 4 ? '#ffb347' : C.text;
      text(String(w.ammo), ax, wy + 2, magColor, 2);
      const ammoW = textWidth(String(w.ammo), 2);
      text(player.infinite ? '/ INF' : `/ ${w.reserve}`, ax + ammoW + 3, wy + 7, '#a7ae98');
      text(w.def.name, ax, wy + 14, '#6f7a62');
      if (w.reloading) {
        px(ax - 1, wy + 21 - 1, 42, 4, C.frame);
        px(ax, wy + 21, 40 * w.reload, 2, C.text);
      } else if (w.ammo === 0 && w.reserve === 0 && blink) {
        text('NO AMMO', ax + Math.max(28, textWidth(w.def.name) + 6), wy + 14, C.red);
      }
    }
    // slots: 1 melee, 2 / 3 guns
    const slots = [['1', melee, false], ...player.weapons.map((w, i) => [String(i + 2), !melee && i === player.slot, !w])];
    slots.forEach(([n, on, empty], i) => text(n, x0 + 1 + i * 6, wy - 8, on ? C.text : empty ? '#262c22' : '#4c5544'));
    // rail light / laser: on or off (F)
    if (!melee && w.attach.side) {
      const what = w.hasLight && w.hasLaser ? 'LIGHT+LASER' : w.hasLight ? 'LIGHT' : 'LASER';
      text(`[F] ${what} ${player.lightOn ? 'ON' : 'OFF'}`, x0 + 1, wy - 18, player.lightOn ? '#ffd84a' : '#6f7a62');
    }
    // selected throwable: its picture, how many, [X] to switch
    const t = THROWABLES[player.throwSel], n = player.grenades;
    if (t) {
      const tx = x0 + 22, ty = wy - 10;
      ctx.globalAlpha = n > 0 ? 1 : 0.35;
      ctx.drawImage(t.img, Math.round(tx * u), Math.round((ty + 4 - t.img.height / 2 + 2) * u), t.img.width * u, t.img.height * u);
      text(`${player.infinite ? 'INF' : n} ${t.name}`, tx + t.img.width + 3, ty + 2, n > 0 ? '#c9d2b8' : '#6f7a62');
      ctx.globalAlpha = 1;
    }

    // --- buy prompt (bottom centre) ---
    this.promptRect = null;
    if (prompt && !player.dead) {
      const key = touch ? 'TAP' : '[E]';
      const price = prompt.free ? '' : prompt.full ? 'FULL' : `$${prompt.cost}`;
      const s = `${key} ${prompt.label}  `;
      const tw = textWidth(s) + textWidth(price);
      const bw2 = tw + 10, bh = 13, bx2 = Math.round(W / 2 - bw2 / 2), by = Math.round(H - 42);
      px(bx2 - 1, by - 1, bw2 + 2, bh + 2, C.frame);
      px(bx2, by, bw2, bh, C.panel);
      px(bx2, by, bw2, 1, '#cfe0cf');
      text(s, bx2 + 5, by + 4, C.text);
      const ok = prompt.full || prompt.money >= prompt.cost;
      text(price, bx2 + 5 + textWidth(s), by + 4, prompt.full ? '#a7ae98' : ok ? C.green : C.red);
      this.promptRect = { x: (bx2 * u) / r.dpr, y: (by * u) / r.dpr, w: (bw2 * u) / r.dpr, h: (bh * u) / r.dpr };
    }
    if (this.noticeTime > 0) {
      this.noticeTime -= 1 / 60;
      text(this.noticeText, W / 2 - textWidth(this.noticeText) / 2, H - 54, '#a7ae98');
    }

    // --- healing in progress ---
    if (player.useProgress >= 0) {
      const s = player.using.item.def.name, bw3 = 50, bx3 = Math.round(W / 2 - bw3 / 2), by3 = Math.round(H / 2 + 26);
      text(s, W / 2 - textWidth(s) / 2, by3 - 7, C.text);
      px(bx3 - 1, by3 - 1, bw3 + 2, 4, C.frame);
      px(bx3, by3, bw3 * player.useProgress, 2, C.green);
    }

    // --- boss health ---
    const boss = rounds.zombies.find((z) => z.boss && z.dying < 0);
    if (boss) {
      const bw4 = Math.min(160, W - 40), bx4 = Math.round(W / 2 - bw4 / 2), by4 = 10;
      text('BRUTE', W / 2 - textWidth('BRUTE') / 2, by4 - 1, C.red);
      px(bx4 - 1, by4 + 6, bw4 + 2, 5, C.frame);
      px(bx4, by4 + 7, bw4, 3, C.barBg);
      px(bx4, by4 + 7, (bw4 * Math.max(0, boss.hp)) / boss.maxHp, 3, C.hp);
    }
    // slowed by frost
    if ((player.slowT ?? 0) > 0) text('FROZEN', W / 2 - textWidth('FROZEN') / 2, H / 2 + 34, '#a6c8ec');

    // --- round banner ---
    if (rounds.banner > 0 && !player.dead) {
      const a = Math.min(1, rounds.banner, 3 - rounds.banner + 0.2);
      ctx.globalAlpha = Math.max(0, Math.min(1, a * 2));
      const s = rounds.bannerText ?? `ROUND ${rounds.round}`;
      text(s, W / 2 - textWidth(s, 3) / 2, H * 0.22, C.red, 3);
      ctx.globalAlpha = 1;
    }

    // --- game over ---
    if (player.dead) {
      ctx.fillStyle = 'rgba(10, 0, 0, 0.55)';
      ctx.fillRect(0, 0, r.width, r.height);
      const lines = [['YOU DIED', C.red, 4], [`ROUND ${rounds.round}  -  ${rounds.kills} KILLS`, C.text, 1]];
      let y = H * 0.38;
      for (const [s, color, size] of lines) {
        text(s, W / 2 - textWidth(s, size) / 2, y, color, size);
        y += 6 * size + 6;
      }
    }
    ctx.restore();
  }

  // Training DPS meter (top right).
  drawMeter(px, text, W, s, time) {
    const dps = s.dps, w = 92, x = W - w - 6, y = 6;
    px(x - 1, y - 1, w + 2, 46, C.frame);
    px(x, y, w, 44, C.panel);
    px(x, y, w, 1, C.panelHi);
    text('DPS', x + 4, y + 4, '#a7ae98');
    text(String(Math.round(dps)), x + 4, y + 11, dps > 0 ? '#ffd84a' : C.text, 2);
    const rows = [
      ['PEAK', Math.round(s.peak)],
      ['TOTAL', Math.round(s.total)],
      ['HITS', s.hits],
      ['HEAD', s.hits ? `${Math.round((100 * s.heads) / s.hits)}%` : '-'],
      ['LAST', time - s.lastT < 3 ? Math.round(s.last) : '-'],
    ];
    rows.forEach(([k, v], i) => {
      const ry = y + 4 + i * 8;
      text(k, x + 44, ry, '#6f7a62');
      text(String(v), x + w - 4 - textWidth(String(v)), ry, C.text);
    });
  }
}
