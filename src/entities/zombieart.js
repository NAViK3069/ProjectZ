// Procedural zombie art, following the zombie design sheet: a big square head
// with glowing red eyes, a small body, short legs and floating clawed hands
// (no arms) - the same build as the player. Every look is assembled from a
// skin, an outfit, optional headgear/extras and a body size, so one painter
// covers all the variants.
//
// Each part (head, body, legs, hands) is its own canvas the size of the full
// frame (W x H, feet at the bottom centre) with an automatic black outline.

import { makeCanvas, silhouette } from '../engine/pixel.js';

const K = '#0b0d0a';
const BLOOD = '#8f1b1b', BLOOD_D = '#5e0e0e', BONE = '#d9d2b5', MOUTH = '#2a0e0e', TEETH = '#d9d2b5';

// skins: l light, m mid, d dark, x darkest
export const SKINS = {
  rot: { l: '#a3b38c', m: '#849671', d: '#627356', x: '#465840' },
  pale: { l: '#b9bca4', m: '#999d84', d: '#727661', x: '#53584a' },
  burned: { l: '#5a3a30', m: '#3d2822', d: '#2a1a16', x: '#1a100c' },
  frozen: { l: '#d8ecff', m: '#a6c8ec', d: '#7399c4', x: '#4d6f9c' },
  toxic: { l: '#a8e866', m: '#76c23e', d: '#4f962a', x: '#336a1a' },
};

// clothes: l/m/d shirt, p/P trousers, s shoes
const CLOTHES = {
  basic: { l: '#77806a', m: '#5c6552', d: '#434b3b', p: '#3b3f44', P: '#2c2f33', s: '#1c1c1c' },
  ragged: { l: '#8a7f6a', m: '#6d6352', d: '#4f473a', p: '#3e3a33', P: '#2d2a25', s: '#1c1c1c' },
  worker: { l: '#5d7fb0', m: '#476892', d: '#33507a', p: '#2f3c55', P: '#232d40', s: '#2a2018' },
  soldier: { l: '#5f6b45', m: '#4a5536', d: '#363f27', p: '#434c31', P: '#323a24', s: '#1c1c1c' },
  police: { l: '#3f5088', m: '#2f3d6c', d: '#222c52', p: '#262f4f', P: '#1b223a', s: '#111111' },
  scientist: { l: '#eceee6', m: '#cfd2c8', d: '#a6aa9e', p: '#3b3f44', P: '#2c2f33', s: '#1c1c1c' },
  prisoner: { l: '#e88a3e', m: '#cc6a26', d: '#9c4c18', p: '#cc6a26', P: '#9c4c18', s: '#1c1c1c' },
  civilian: { l: '#4f6d96', m: '#3d5a80', d: '#2c4262', p: '#33476a', P: '#25344f', s: '#3a2a20' },
  hooded: { l: '#3b3f4d', m: '#2c2f3a', d: '#1f2129', p: '#1f2129', P: '#16171d', s: '#111111' },
  riot: { l: '#4a4f58', m: '#33373e', d: '#23262b', p: '#2a2d33', P: '#1d1f23', s: '#111111' },
  charred: { l: '#3a2a24', m: '#2a1c18', d: '#1c1210', p: '#2a1c18', P: '#1c1210', s: '#111111' },
  icy: { l: '#9cb6d0', m: '#7d97b3', d: '#5f7894', p: '#4f6680', P: '#3a4d62', s: '#2a3442' },
  rags: { l: '#5f6650', m: '#4a503e', d: '#363a2d', p: '#33372b', P: '#26291f', s: '#1c1c1c' },
  bare: { l: '#7a6e60', m: '#5f5448', d: '#463e34', p: '#2e2e36', P: '#222229', s: '#151515' },
};

// A pixel grid with an automatic outline round everything painted.
class Painter {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Array(w * h).fill(null);
  }

  set(x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
  }

  get(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y * this.w + x] : null;
  }

  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  // only over pixels that are already painted (details on a shape)
  over(x, y, c) {
    if (this.get(x, y) && this.get(x, y) !== K) this.set(x, y, c);
  }

  canvas() {
    const [c, g] = makeCanvas(this.w, this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        let col = this.get(x, y);
        if (!col && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const n = this.get(x + dx, y + dy); return n && n !== K; })) col = K;
        if (col) {
          g.fillStyle = col;
          g.fillRect(x, y, 1, 1);
        }
      }
    }
    return c;
  }
}

// a rounded block with a lit left/top edge and shaded right/bottom edge
function block(p, x0, y0, w, h, c, round = 2) {
  for (let j = 0; j < h; j++) {
    const inset = j === 0 || j === h - 1 ? round : j === 1 || j === h - 2 ? Math.max(0, round - 1) : 0;
    for (let i = inset; i < w - inset; i++) {
      let col = c.m;
      if (i <= inset || j <= 1) col = c.l;
      if (i >= w - inset - 2 || j >= h - 2) col = c.d;
      p.set(x0 + i, y0 + j, col);
    }
  }
}

// --- heads ---------------------------------------------------------------------

function paintHead(p, x0, y0, w, h, skin, look) {
  block(p, x0, y0, w, h, skin, 2);
  // brow ridge + sunken eyes (shifted to the right: the art faces right)
  const ey = y0 + Math.round(h * 0.45), e1 = x0 + Math.round(w * 0.38), e2 = x0 + Math.round(w * 0.7);
  // dark sockets with two glowing red pixels each
  for (const ex of [e1, e2]) {
    p.rect(ex - 1, ey - 1, 3, 1, skin.x);
    p.set(ex - 1, ey, skin.x);
    p.set(ex, ey, '#ff2d24');
    p.set(ex + 1, ey, '#ff2d24');
  }
  p.set(x0 + Math.round(w * 0.58), ey + 2, skin.d);   // nose
  p.set(x0 + 2, ey + 1, skin.d);                      // ear
  // mouth: dark slit with teeth and a blood drip
  const my = y0 + Math.round(h * 0.72), mx = x0 + Math.round(w * 0.4), mw = Math.max(3, Math.round(w * 0.42));
  for (let i = 0; i < mw; i++) {
    p.set(mx + i, my, MOUTH);
    p.set(mx + i, my + 1, i % 2 ? TEETH : MOUTH);
  }
  p.over(mx + 1, my + 2, BLOOD);
  if (look.spit) p.over(mx + 2, my + 2, '#7adf3a');
  // a torn scalp with bone showing on some
  if (look.wound) {
    p.over(x0 + 3, y0 + 2, BONE);
    p.over(x0 + 4, y0 + 2, BLOOD);
    p.over(x0 + 4, y0 + 3, BONE);
    p.over(x0 + 5, y0 + 3, BLOOD);
  }
  if (look.blood) {
    for (const [i, j] of [[w - 4, 1], [w - 3, 2], [w - 4, 3], [w - 3, 4], [1, h - 4], [2, h - 3]]) p.over(x0 + i, y0 + j, BLOOD);
  }
  if (look.cracks) for (const [i, j] of [[3, 2], [4, 3], [4, 4], [9, 1], [10, 2], [7, 9], [8, 10], [2, 7]]) p.over(x0 + i, y0 + j, '#ff6a1a');
  return [[e1, ey], [e1 + 1, ey], [e2, ey], [e2 + 1, ey]];
}

// headgear painted over the top of the head
function paintGear(p, x0, y0, w, h, gear) {
  const top = (rows, c) => {
    for (let j = 0; j < rows; j++) {
      const inset = j === 0 ? 3 : j === 1 ? 1 : 0;
      for (let i = inset; i < w - inset; i++) p.set(x0 + i, y0 + j - 1, i <= inset + 1 || j === 0 ? c.l : i >= w - inset - 2 ? c.d : c.m);
    }
  };
  switch (gear) {
    case 'hardhat':
      top(5, { l: '#ffb84a', m: '#ef8f22', d: '#b86412' });
      p.rect(x0 - 1, y0 + 3, w + 2, 1, '#b86412');
      p.set(x0 + Math.round(w / 2), y0 - 1, '#ffd88a');
      break;
    case 'helmet':
      top(5, { l: '#4a4f45', m: '#353a31', d: '#25291f' });
      p.rect(x0, y0 + 3, w, 1, '#1c1f18');
      break;
    case 'cap':
      top(4, { l: '#36477a', m: '#26335c', d: '#1b2444' });
      p.rect(x0 + Math.round(w * 0.45), y0 + 2, Math.round(w * 0.65), 1, '#111520');   // peak
      p.set(x0 + Math.round(w * 0.55), y0, '#e8c84a');                                  // badge
      break;
    case 'hood':
      for (let j = -1; j < h - 2; j++) {
        p.set(x0 - 1, y0 + j, '#2c2f3a');
        p.set(x0, y0 + j, '#3b3f4d');
        p.set(x0 + 1, y0 + j, '#2c2f3a');
      }
      top(4, { l: '#3b3f4d', m: '#2c2f3a', d: '#1f2129' });
      for (let j = 0; j < h - 2; j++) p.set(x0 + w - 1, y0 + j, '#1f2129');
      break;
    case 'hairRagged':
      for (let i = 0; i < w; i++) {
        const tall = (i * 7) % 3;
        for (let j = 0; j <= tall + 1; j++) p.set(x0 + i, y0 - j + 1, j === tall + 1 ? '#5a4632' : '#3d2f22');
      }
      break;
    case 'hairWhite':
      for (let i = -1; i <= w; i++) {
        const tall = ((i * 5) % 4) + 1;
        for (let j = 0; j <= tall; j++) p.set(x0 + i, y0 - j + 2, j === tall ? '#ffffff' : '#c8c8c0');
      }
      break;
    case 'hairBlack':
      top(4, { l: '#2a2a30', m: '#1b1b20', d: '#121216' });
      p.set(x0 + 1, y0 + 3, '#1b1b20');
      break;
    case 'spikes':
      for (let i = 0; i < w; i += 2) for (let j = 0; j < 3 + (i % 4 === 0 ? 1 : 0); j++) p.set(x0 + i, y0 - j, j ? '#2a2420' : '#3d342c');
      break;
    case 'ice':
      for (const i of [2, 5, 8, 11]) for (let j = 0; j < 3; j++) p.set(x0 + i, y0 - j, j ? '#e8f6ff' : '#a6c8ec');
      break;
    case 'riot': {
      top(6, { l: '#4a4f58', m: '#2a2d33', d: '#1b1d21' });
      // visor
      p.rect(x0 + 2, y0 + Math.round(h * 0.35), w - 3, 3, '#121418');
      p.rect(x0 + 3, y0 + Math.round(h * 0.35) + 1, w - 5, 1, '#3a414c');
      break;
    }
    case 'glasses':
      break;
  }
}

// --- bodies ---------------------------------------------------------------------

function paintBody(p, x0, y0, w, h, cloth, look, skin) {
  block(p, x0, y0, w, h, cloth, 1);
  const cx = x0 + Math.floor(w / 2);
  switch (look.outfit) {
    case 'worker':
      // hi-vis straps
      for (let j = 1; j < h - 2; j++) {
        p.over(x0 + 2, y0 + j, '#ef8f22');
        p.over(x0 + w - 4, y0 + j, '#ef8f22');
      }
      p.rect(x0 + 1, y0 + Math.round(h * 0.55), w - 2, 1, '#ffd84a');
      break;
    case 'soldier':
      for (const [i, j] of [[2, 2], [5, 4], [8, 1], [3, 6], [9, 5], [6, 7]]) p.over(x0 + i, y0 + j, '#2c3420');
      p.rect(x0, y0 + h - 3, w, 1, '#1c1f18');
      break;
    case 'police':
      p.over(x0 + 3, y0 + 2, '#e8c84a');   // badge
      p.rect(x0, y0 + h - 3, w, 1, '#111111');
      p.over(cx, y0 + 1, '#b8c0d8');
      break;
    case 'scientist':
      for (let j = 0; j < h - 2; j++) p.over(cx, y0 + j, '#a6aa9e');   // coat opening
      p.over(cx, y0 + 1, '#c7302f');
      p.over(cx, y0 + 2, '#c7302f');
      p.over(cx, y0 + 3, '#8f1b1b');
      p.over(x0 + 2, y0 + 3, '#a6aa9e');
      break;
    case 'prisoner':
      p.rect(x0 + 2, y0 + 2, 3, 2, '#f2f2ea');
      p.over(x0 + 3, y0 + 2, '#222');
      break;
    case 'civilian':
      for (let j = 0; j < h - 2; j++) p.over(cx, y0 + j, '#d8d8d0');
      break;
    case 'hooded':
      p.rect(x0 + 2, y0 + Math.round(h * 0.55), w - 4, 2, '#1f2129');
      break;
    case 'riot':
      p.rect(x0 + 1, y0 + 1, w - 2, Math.round(h * 0.5), '#3c4048');
      for (let i = 2; i < w - 2; i += 3) p.over(x0 + i, y0 + 2, '#5a606a');
      break;
    case 'bare':
      // bare torso, blood, belt
      for (let j = 0; j < h - 3; j++) for (let i = 1; i < w - 1; i++) p.over(x0 + i, y0 + j, i < 2 || j < 1 ? skin.l : i > w - 4 ? skin.d : skin.m);
      p.rect(x0, y0 + h - 3, w, 1, '#2a1a10');
      for (const [i, j] of [[3, 2], [4, 3], [w - 5, 4], [w - 4, 5]]) p.over(x0 + i, y0 + j, BLOOD);
      break;
  }
  if (look.tears) {
    p.over(x0 + w - 3, y0 + 3, skin.m);
    p.over(x0 + w - 4, y0 + 4, skin.m);
    p.over(x0 + 2, y0 + h - 4, skin.m);
  }
  if (look.blood || look.outfit === 'basic' || look.outfit === 'ragged') {
    for (const [i, j] of [[cx - x0 + 1, 2], [cx - x0 + 2, 3], [cx - x0 + 1, 4]]) p.over(x0 + i, y0 + j, BLOOD);
  }
  if (look.blood) for (const [i, j] of [[2, 1], [3, 2], [2, 3], [w - 3, h - 4], [w - 4, h - 3]]) p.over(x0 + i, y0 + j, BLOOD_D);
  if (look.cracks) for (const [i, j] of [[2, 2], [3, 3], [w - 3, 5], [w - 4, 6], [5, h - 4]]) p.over(x0 + i, y0 + j, '#ff6a1a');
  if (look.ice) for (const [i, j] of [[1, 1], [w - 2, 2], [3, 4]]) p.over(x0 + i, y0 + j, '#e8f6ff');
}

function paintLeg(p, x0, y0, w, h, cloth) {
  p.rect(x0, y0, w, h - 1, cloth.p);
  p.rect(x0, y0, 1, h - 1, cloth.p);
  p.rect(x0 + w - 1, y0, 1, h - 1, cloth.P);
  p.rect(x0, y0 + h - 1, w, 1, cloth.s);
}

// floating hand: a round fist, lit on the top-left and shaded bottom-right
function paintHand(p, x0, y0, w, h, skin) {
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const nx = (i - cx) / (w / 2), ny = (j - cy) / (h / 2);
      if (nx * nx + ny * ny > 1.15) continue;          // round off the corners
      p.set(x0 + i, y0 + j, nx + ny < -0.5 ? skin.l : nx + ny > 0.5 ? skin.d : skin.m);
    }
  }
  if (w >= 6) for (let i = 1; i < w - 1; i += 2) p.over(x0 + i, y0 + Math.floor(h * 0.6), skin.d);   // knuckles
}

// --- sizes ----------------------------------------------------------------------
// W x H frame (feet at bottom centre), and where each part sits.
const SIZES = {
  normal: { W: 32, H: 32, head: [9, 4, 15, 14], body: [10, 17, 12, 11], legs: [[11, 27, 4, 5], [17, 27, 4, 5]], hand: [4, 4] },
  big: { W: 44, H: 42, head: [13, 4, 18, 16], body: [10, 19, 24, 16], legs: [[13, 34, 7, 8], [24, 34, 7, 8]], hand: [6, 6] },
  huge: { W: 56, H: 54, head: [17, 4, 22, 19], body: [10, 22, 36, 21], legs: [[16, 42, 9, 12], [31, 42, 9, 12]], hand: [8, 8] },
};

// Build every part for a look. Returns frames, eye pixels and hit boxes.
export function buildZombie(look) {
  const S = SIZES[look.size ?? 'normal'];
  const skin = SKINS[look.skin ?? 'rot'], cloth = CLOTHES[look.outfit ?? 'basic'];
  const part = (fn) => {
    const p = new Painter(S.W, S.H);
    fn(p);
    return p.canvas();
  };
  let eyes;
  const [hx, hy, hw, hh] = S.head, [bx, by, bw, bh] = S.body;
  const head = part((p) => {
    eyes = paintHead(p, hx, hy, hw, hh, skin, look);
    if (look.gear) paintGear(p, hx, hy, hw, hh, look.gear);
    if (look.gear === 'hairWhite') {
      // round glasses over the eyes
      for (const [ex, ey] of [eyes[0], eyes[2]]) p.rect(ex - 2, ey - 2, 4, 1, '#1c1c1c');
      p.rect(eyes[1][0] + 1, eyes[1][1] - 2, eyes[2][0] - eyes[1][0] - 2, 1, '#1c1c1c');
    }
  });
  const body = part((p) => paintBody(p, bx, by, bw, bh, cloth, look, skin));
  const legL = part((p) => paintLeg(p, ...S.legs[0], cloth));
  const legR = part((p) => paintLeg(p, ...S.legs[1], cloth));
  const [hw2, hh2] = S.hand;
  const handP = new Painter(hw2 + 2, hh2 + 2);
  paintHand(handP, 1, 1, hw2, hh2, skin);
  const hand = handP.canvas();
  const handBackP = new Painter(hw2 + 2, hh2 + 2);
  paintHand(handBackP, 1, 1, hw2, hh2, { l: skin.m, m: skin.d, d: skin.x, x: K });
  const handBack = handBackP.canvas();

  // extras drawn behind the body: a bomb pack, a riot shield is separate
  let back = null;
  if (look.bombs) {
    back = part((p) => {
      for (let i = 0; i < 3; i++) {
        p.rect(bx - 3, by + 1 + i * 3, 5, 2, '#c7302f');
        p.set(bx - 3, by + 1 + i * 3, '#e85a50');
      }
      p.rect(bx - 2, by, 1, 10, '#2a2a2a');
    });
  }
  let shield = null;
  if (look.shield) {
    const sp = new Painter(10, 22);
    sp.rect(0, 0, 9, 21, '#2f343c');
    sp.rect(1, 1, 7, 19, '#3c434d');
    sp.rect(2, 3, 5, 4, '#7d8ea3');      // window
    sp.rect(2, 3, 5, 1, '#aab8c8');
    sp.rect(1, 12, 7, 1, '#d7d7d0');     // POLICE stripe
    shield = sp.canvas();
  }

  const ox = S.W / 2, oyH = S.H;
  const art = {
    W: S.W, H: S.H, ox, head, body, legL, legR, hand, handBack, back, shield,
    eyes: eyes.map(([x, y]) => [x - ox, y - oyH]),          // relative to the feet
    neck: by - S.H + 1,
    headBox: { half: hw / 2 + 1, top: hy - S.H - 2, bottom: hy + hh - S.H - 1 },
    bodyBox: { half: bw / 2 + 1, top: by - S.H, bottom: 0 },
    // where the two floating hands hover: one reaching out in front, one held close at the chest
    handAt: { x: bw / 2 + 7, y: by - S.H + Math.round(bh * 0.3) },
    handNear: { x: bw / 2 - 1, y: by - S.H + Math.round(bh * 0.55) },
  };
  art.white = {};
  for (const k of ['head', 'body', 'legL', 'legR']) art.white[k] = silhouette(art[k], '#ffffff');
  // pieces for gore
  const crop = (img, x, y, w, h) => {
    const [c, g] = makeCanvas(w, h);
    g.drawImage(img, x, y, w, h, 0, 0, w, h);
    return c;
  };
  art.gibs = {
    head: crop(head, hx - 2, hy - 4, hw + 4, hh + 6),
    skullL: crop(head, hx - 1, hy - 3, Math.ceil(hw / 2) + 1, Math.ceil(hh / 2) + 2),
    skullR: crop(head, hx + Math.floor(hw / 2), hy - 3, Math.ceil(hw / 2) + 1, Math.ceil(hh / 2) + 2),
    jaw: crop(head, hx + 1, hy + Math.round(hh * 0.6), hw - 1, Math.round(hh * 0.4) + 1),
    torsoL: crop(body, bx - 1, by - 1, Math.ceil(bw / 2) + 1, Math.ceil(bh * 0.6) + 1),
    torsoR: crop(body, bx + Math.floor(bw / 2), by - 1, Math.ceil(bw / 2) + 1, Math.ceil(bh * 0.6) + 1),
    hips: crop(body, bx - 1, by + Math.floor(bh * 0.6), bw + 2, Math.ceil(bh * 0.4) + 1),
    leg: crop(legL, S.legs[0][0] - 1, S.legs[0][1] - 1, S.legs[0][2] + 2, S.legs[0][3] + 2),
    hand,
  };
  return art;
}

// --- the looks on the design sheet --------------------------------------------
export const LOOKS = {
  basic: { skin: 'rot', outfit: 'basic' },
  blood: { skin: 'rot', outfit: 'basic', blood: true, wound: true },
  ragged: { skin: 'rot', outfit: 'ragged', gear: 'hairRagged', tears: true },
  worker: { skin: 'rot', outfit: 'worker', gear: 'hardhat' },
  soldier: { skin: 'rot', outfit: 'soldier', gear: 'helmet' },
  police: { skin: 'rot', outfit: 'police', gear: 'cap' },
  scientist: { skin: 'pale', outfit: 'scientist', gear: 'hairWhite' },
  prisoner: { skin: 'rot', outfit: 'prisoner' },
  civilian: { skin: 'pale', outfit: 'civilian', gear: 'hairBlack' },
  hooded: { skin: 'pale', outfit: 'hooded', gear: 'hood' },
  runner: { skin: 'rot', outfit: 'ragged', tears: true, blood: true },
  leaper: { skin: 'rot', outfit: 'rags', gear: 'spikes', tears: true },
  spitter: { skin: 'rot', outfit: 'police', spit: true, wound: true },
  infected: { skin: 'pale', outfit: 'rags', gear: 'spikes', blood: true, wound: true },
  suicide: { skin: 'rot', outfit: 'hooded', bombs: true },
  armored: { skin: 'rot', outfit: 'riot', gear: 'riot', shield: true },
  tank: { skin: 'rot', outfit: 'bare', size: 'big', blood: true, wound: true },
  burned: { skin: 'burned', outfit: 'charred', cracks: true },
  frozen: { skin: 'frozen', outfit: 'icy', gear: 'ice', ice: true },
  toxic: { skin: 'toxic', outfit: 'rags', tears: true, spit: true },
  brute: { skin: 'rot', outfit: 'bare', size: 'huge', blood: true, wound: true },
};
export const COMMON_LOOKS = ['basic', 'blood', 'ragged', 'worker', 'soldier', 'police', 'scientist', 'prisoner', 'civilian', 'hooded'];

const cache = {};
export const zombieArt = (key) => (cache[key] ??= buildZombie(LOOKS[key]));
