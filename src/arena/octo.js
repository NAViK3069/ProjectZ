// The octo arms skill's look: four steel arms out of the back, Doctor Octopus style - each a chain of jointed plates,
// one after another like the joints of a stem, a dark spine showing in the seams, curling up over the shoulders, a
// three-fingered claw at the end round a gun's grip, a red eye in it. As it starts, each reaches out and a gun comes into
// being in its claw; at the end each flings its gun away (see fighter.js: octoEnd) and draws back in. All in
// pixels. (The arms go behind the body, the guns in front of it, the eyes and the light after the lighting.)

import { drawGun, GUN_ART } from '../combat/gunart.js';
import { pixLine, glowAt } from './pixfx.js';

const hash = (a, b, c) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
// a disc of whole pixels
function disc(ctx, x, y, r, col) {
  ctx.fillStyle = col;
  const X = Math.round(x), Y = Math.round(y), R = Math.ceil(r);
  for (let dy = -R; dy <= R; dy++) {
    const w = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
    ctx.fillRect(X - w, Y + dy, w * 2 + 1, 1);
  }
}
// One plate of an arm at (x, y), lying along (ux, uy): hl long either side of its middle, hw wide either side. Worked
// out pixel by pixel so it's crisp at any angle: lit along its top edge, shadowed along the bottom, a darker band at
// each end where it meets the next.
function plate(ctx, x, y, ux, uy, hl, hw) {
  const nx = -uy, ny = ux, R = Math.ceil(Math.max(hl, hw)) + 1, X = Math.round(x), Y = Math.round(y), up = ny < 0 ? 1 : -1;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const px = X + dx + 0.5 - x, py = Y + dy + 0.5 - y, al = px * ux + py * uy, ac = px * nx + py * ny;
    if (Math.abs(al) > hl || Math.abs(ac) > hw) continue;
    if (Math.abs(al) > hl - 0.7 && Math.abs(ac) > hw - 0.7) continue;   // (the corners rounded off)
    const side = ac * up;
    ctx.fillStyle = Math.abs(al) > hl - 0.9 ? '#353c46' : side > hw - 1.1 ? '#b4c0cc' : side < -hw + 1.1 ? '#262c34' : side > 0 ? '#6c7682' : '#56606c';
    ctx.fillRect(X + dx, Y + dy, 1, 1);
  }
}

// Where the shoulders' root is, for f: the arms come out of the upper back.
export const octoRoot = (f) => ({ x: f.x - f.facing * 3, y: f.y + f.pose.body - 17 });

// The arms, behind the body: a curve from the back to each claw, a dark spine along it, plates along that - big at the
// root, smaller to the claw.
export function drawOctoArms(ctx, f) {
  const m = f.octo, root = octoRoot(f), t = f.game.time;
  m.arms.forEach((a, i) => {
    const tip = f.octoTip(i);
    // the curve: up and back off the shoulders first, then round to the claw
    const cx = root.x - f.facing * (10 + i * 3) + Math.sin(t * 1.7 + i) * 3, cy = root.y - 20 - (i % 2) * 6 + Math.cos(t * 1.3 + i * 2) * 2;
    const at = (q) => { const u = 1 - q; return { x: u * u * root.x + 2 * u * q * cx + q * q * tip.x, y: u * u * root.y + 2 * u * q * cy + q * q * tip.y }; };
    const len = Math.hypot(tip.x - root.x, tip.y - root.y) + Math.hypot(cx - root.x, cy - root.y) * 0.5;
    if (len < 3) return;
    // the spine, dark, in the seams
    const n = Math.max(4, Math.ceil(len / 2));
    for (let j = 0; j <= n; j++) { const p = at(j / n); disc(ctx, p.x, p.y, 2.2 - (j / n) * 0.9, '#0d1014'); }
    // the plates, root to claw
    const segs = Math.max(2, Math.round(len / 4.6));
    for (let j = 0; j < segs; j++) {
      const q = (j + 0.5) / segs, p = at(q), p2 = at(Math.min(1, q + 0.02)), p1 = at(Math.max(0, q - 0.02));
      const dx = p2.x - p1.x, dy = p2.y - p1.y, d = Math.hypot(dx, dy) || 1;
      plate(ctx, p.x, p.y, dx / d, dy / d, 1.9, 3.3 - q * 1.4);
    }
    // the root: a collar on the back
    disc(ctx, root.x, root.y, 4, '#0d1014');
    disc(ctx, root.x, root.y, 3, '#5d6773');
    ctx.fillStyle = '#b4c0cc';
    ctx.fillRect(Math.round(root.x) - 1, Math.round(root.y) - 2, 3, 1);
  });
}

// Each gun as it's held - grip at the claw, pointing where you aim, turned over when that's left so it's the right way
// up. Then the claw round it.
export function drawOctoGuns(ctx, f, weapons) {
  const m = f.octo;
  m.arms.forEach((a, i) => {
    const tip = f.octoTip(i), def = weapons[a.key], ux = Math.cos(tip.ang), uy = Math.sin(tip.ang);
    if (tip.held) {
      ctx.save();
      ctx.translate(Math.round(tip.x), Math.round(tip.y));
      ctx.rotate(tip.ang);
      if (ux < 0) ctx.scale(1, -1);
      if (tip.grow < 1) ctx.globalAlpha = tip.grow;
      const art = GUN_ART[def.art];
      drawGun(ctx, def.art, { slide: a.kick > 0.5 ? art.slide?.travel ?? 0 : 0, bolt: a.kick > 0.5 ? art.bolt?.travel ?? 0 : 0, trigger: a.kick > 0.5 ? 1 : 0 });
      ctx.restore();
    }
    // the claw: three steel fingers closed round the grip (open, with nothing in it)
    const fx = Math.round(tip.x), fy = Math.round(tip.y), open = tip.held ? 0.7 : 1.1;
    for (const da of [-open, open, Math.PI]) {
      const b = tip.ang + da;
      ctx.fillStyle = '#0d1014';
      pixLine(ctx, fx, fy + 1, fx + Math.cos(b) * 4, fy + Math.sin(b) * 4 + 1);
      ctx.fillStyle = '#9aa6b4';
      pixLine(ctx, fx, fy, fx + Math.cos(b) * 4, fy + Math.sin(b) * 4);
    }
    disc(ctx, fx - ux * 2, fy - uy * 2, 2, '#2a3038');
  });
}

// After the lighting: the red eye in each claw, going out as the arms draw in; a gun coming into being - a box of light
// round where it'll be, a line sweeping across it, sparks.
export function drawOctoGlow(ctx, f, t) {
  const m = f.octo, tick = Math.floor(t * 20);
  m.arms.forEach((a, i) => {
    const tip = f.octoTip(i);
    const ex = Math.round(tip.x - Math.cos(tip.ang) * 2), ey = Math.round(tip.y - Math.sin(tip.ang) * 2), pulse = 0.7 + 0.3 * Math.sin(t * 6 + i);
    const eye = 1 - tip.gone;
    if (eye > 0) {
      glowAt(ctx, ex, ey, 7, [[0, `rgba(255, 60, 40, ${0.5 * pulse * eye})`], [1, 'rgba(255, 40, 20, 0)']]);
      ctx.globalAlpha = eye;
      ctx.fillStyle = '#ff3a2a';
      ctx.fillRect(ex, ey, 1, 1);
      ctx.globalAlpha = 1;
    }
    if (!(tip.grow > 0 && tip.grow < 1) || m.gone >= 0) return;
    const k = tip.grow, w = 30, h = 10, x0 = -8, line = x0 + k * w;
    glowAt(ctx, tip.x + Math.cos(tip.ang) * (line + 2), tip.y + Math.sin(tip.ang) * (line + 2), 14, [[0, 'rgba(255, 140, 80, 0.5)'], [1, 'rgba(255, 80, 40, 0)']]);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(Math.round(tip.x), Math.round(tip.y));
    ctx.rotate(tip.ang);
    // the box round it, flickering
    ctx.globalAlpha = (1 - k * 0.6) * (tick % 3 ? 1 : 0.5);
    ctx.fillStyle = '#ff8a5a';
    for (const [x, y, ww, hh] of [[x0, -h / 2, w, 1], [x0, h / 2, w, 1], [x0, -h / 2, 1, h], [x0 + w, -h / 2, 1, h + 1]]) ctx.fillRect(x, y, ww, hh);
    // the line sweeping along it
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(line), -h / 2, 1, h + 1);
    ctx.fillStyle = '#ffb080';
    ctx.fillRect(Math.round(line) - 1, -h / 2, 1, h + 1);
    // sparks off the line
    ctx.globalAlpha = 0.8;
    for (let j = 0; j < 9; j++) {
      ctx.fillStyle = j % 3 ? '#ff6a3a' : '#ffffff';
      ctx.fillRect(Math.round(line + (hash(i, j, tick) - 0.5) * 3), Math.round(-h / 2 + hash(j, i, tick) * h), 1, 1);
    }
    ctx.restore();
  });
}
