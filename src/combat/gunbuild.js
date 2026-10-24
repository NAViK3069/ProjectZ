// Procedural gun art. Builds the same structure as the hand-drawn guns in
// gunart.js (parts as palette rows, attachment points, slots, moving parts)
// from a short spec, so the whole catalog shares one look and every gun
// still has its own bolt, mag, trigger and charging handle that move.
//
// Parts are painted in absolute gun pixels on a sketch and trimmed to their
// bounding box afterwards. Guns point right; the bore line is y = 2.
//
// Long guns (rifles, SMGs, shotguns, snipers, LMGs):
//   stock | receiver (grip, trigger, mag, port) | handguard | barrel
// Handguns: slide over a frame, mag in the grip.

class Sketch {
  constructor() {
    this.m = new Map();
  }

  set(x, y, ch) {
    if (ch && ch !== '.' && ch !== ' ') this.m.set(`${x},${y}`, ch);
    return this;
  }

  rect(x, y, w, h, ch) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, ch);
    return this;
  }

  rows(x, y, rows) {
    rows.forEach((r, j) => [...r].forEach((ch, i) => this.set(x + i, y + j, ch)));
    return this;
  }

  part() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of this.m.keys()) {
      const [x, y] = k.split(',').map(Number);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    const rows = [];
    for (let y = y0; y <= y1; y++) {
      let s = '';
      for (let x = x0; x <= x1; x++) s += this.m.get(`${x},${y}`) ?? '.';
      rows.push(s);
    }
    return { x: x0, y: y0, rows };
  }
}

// furniture: [dark, mid, light]
const FURN = {
  black: ['f', 'g', 'e'],
  grey: ['e', 'd', 'c'],
  olive: ['o', 'O', 'P'],
  wood: ['v', 'w', 'W'],
  tan: ['u', 't', 'T'],
  red: ['v', 'R', 'r'],
};
// receiver metal: top edge, body, highlight, bottom
const BODY = {
  black: { top: 'f', main: 'g', hi: 'c', bot: 'e' },
  steel: { top: 'e', main: 'd', hi: 'l', bot: 'e' },
  tan: { top: 'u', main: 't', hi: 'T', bot: 'u' },
  olive: { top: 'o', main: 'O', hi: 'P', bot: 'o' },
  silver: { top: 'c', main: 'l', hi: 'S', bot: 'c' },
};

const rep = (ch, n) => ch.repeat(Math.max(0, n));

// --- magazines (rows, top-left at the magwell) ---
function magRows(type, n, [m, e, b]) {
  switch (type) {
    case 'stanag':
      return [rep(e, 3), m + m + e, ...Array.from({ length: n - 3 }, () => '.' + m + m + e), '..' + b + e];
    case 'curve': {
      const out = [];
      for (let i = 0; i < n; i++) {
        const off = Math.floor((i * i) / (n * 1.6));
        out.push(rep('.', off) + (i === 0 ? rep(e, 3) : i === n - 1 ? b + e + e : m + m + e));
      }
      return out;
    }
    case 'straight':
      return [...Array.from({ length: n - 1 }, () => m + m + m), b + e + e];
    case 'box':
      return [...Array.from({ length: n - 1 }, () => m + m + m + m), b + e + e + e];
    case 'pistol':
      return [...Array.from({ length: n - 1 }, () => m + m), b + e];
    case 'drum':
      return ['.' + rep(e, 3) + '.', e + m + m + m + e, m + m + 'c' + m + m, e + m + m + m + e, '.' + rep(e, 3) + '.'];
    case 'bigdrum':
      return ['.' + rep(e, 4) + '.', e + rep(m, 4) + e, m + m + 'c' + 'c' + m + m, m + rep(m, 4) + m, e + rep(m, 4) + e, '.' + rep(e, 4) + '.'];
    case 'beltbox':
      return [rep(e, 6), e + 'yyyy' + e, e + rep(m, 4) + e, e + rep(m, 4) + e, rep(b, 6)];
  }
  return [];
}

// --- stocks (x 0..S-1, rows from `top`) ---
function paintStock(sk, type, S, top, H, F, B, drop = 0) {
  const [fd, fm, fl] = F;
  if (type === 'solid' || type === 'wood') {
    // butt taller than the wrist; optional drop at the back (AK)
    for (let x = 0; x < S; x++) {
      const back = 1 - x / S, d = Math.round(drop * back);
      const y0 = top + d, y1 = top + H - 1 + (x < S * 0.45 ? 1 : 0) + d - (x >= S - 2 ? 1 : 0);
      for (let y = y0; y <= y1; y++) sk.set(x, y, x === 0 ? fd : y === y0 ? fl : y === y1 ? fd : fm);
    }
  } else if (type === 'skel') {
    sk.rect(0, top, S, 1, fm);
    sk.rect(0, top, 1, H, fd);
    sk.rect(0, top + H - 1, 3, 1, fm);
    for (let j = 1; j < H; j++) sk.set(Math.round(S - 1 - ((j - 1) * (S - 3)) / Math.max(1, H - 2)), top + j, fm);
    sk.set(1, top, fl);
  } else if (type === 'tube') {
    sk.rect(3, top + 1, S - 3, 2, B.bot);
    sk.rect(3, top + 1, S - 3, 1, 'd');
    sk.rect(0, top, 3, H + 1, fm);
    sk.rect(0, top, 1, H + 1, fd);
    sk.rect(1, top, 2, 1, fl);
  } else if (type === 'fold') {
    sk.rect(0, top, S, 1, fm);
    sk.rect(0, top + H - 2, S, 1, fm);
    sk.rect(0, top, 1, H - 1, fd);
  } else if (type === 'thumb') {
    sk.rect(0, top, S, 1, fl);
    sk.set(0, top, fd);
    sk.rect(0, top + 1, S, 1, fm);
    sk.set(0, top + 1, fd);
    sk.rect(0, top + 2, 2, 1, fm);
    sk.rect(4, top + 2, S - 4, 1, fm);
    sk.rect(0, top + 3, 3, 1, fd);
  } else if (type === 'bullpup') {
    sk.rect(0, top, S, H + 1, fm);
    sk.rect(0, top, S, 1, fl);
    sk.rect(0, top, 1, H + 1, fd);
    sk.rect(1, top + H, S - 1, 1, fd);
  } else if (type === 'pad') {
    sk.rect(0, top + 1, S, 2, fm);
    sk.rect(0, top + 1, 1, 2, fd);
  }
}

// --- handguards (x hx..hx+G-1) ---
function paintHandguard(sk, type, hx, G, top, H, F, B) {
  const [fd, fm, fl] = F;
  if (type === 'rail') {
    sk.rect(hx, top, G, 1, 'd');
    for (let j = 1; j < H - 1; j++) for (let i = 0; i < G; i++) sk.set(hx + i, top + j, (i + j) % 2 ? 'e' : 'd');
    sk.rect(hx, top + H - 1, G, 1, 'e');
  } else if (type === 'ak') {
    sk.rect(hx, top, G - 1, 1, 'e');              // gas tube
    sk.rect(hx, top + 1, G - 2, 1, fl);
    sk.rect(hx, top + 2, G, 1, fm);
    sk.rect(hx, top + 3, G, 1, fd);
  } else if (type === 'wood') {
    sk.rect(hx, top + 1, G, 1, fl);
    sk.rect(hx, top + 2, G, H - 3, fm);
    sk.rect(hx, top + H - 1, G, 1, fd);
  } else if (type === 'slim') {
    sk.rect(hx, top + 1, G, H - 2, fm);
    sk.rect(hx, top + H - 1, G, 1, fd);
    sk.set(hx, top + 1, fl);
  } else if (type === 'vent') {
    sk.rect(hx, top, G, 1, fm);
    for (let i = 0; i < G; i++) if (i % 2 === 0) sk.set(hx + i, top + 1, fm);
    sk.rect(hx, top + 2, G, H - 3, fm);
    sk.rect(hx, top + H - 1, G, 1, fd);
  } else if (type === 'shroud') {
    sk.rect(hx, top, G, 1, 'e');
    for (let i = 0; i < G; i++) if (i % 3 !== 1) sk.set(hx + i, top + 1, 'e');
    for (let i = 0; i < G; i++) if (i % 3 !== 1) sk.set(hx + i, top + 2, 'f');
    sk.rect(hx, top + 3, G, 1, 'f');
  } else if (type === 'body') {
    // the receiver just carries on (bullpups, boxy SMGs)
    sk.rect(hx, top, G, 1, B.top);
    sk.rect(hx, top + 1, G, H - 2, B.main);
    sk.rect(hx, top + H - 1, G, 1, B.bot);
  }
}

// Long gun from a spec. See the catalog for what the fields mean.
export function longGun(o) {
  const F = FURN[o.furn ?? 'black'], B = BODY[o.body ?? 'black'];
  const H = o.recH ?? 4, top = 1, bot = top + H;
  const shotgun = !!o.shotgun;
  const cy = shotgun ? top : top + 1;           // bore line row
  const S = o.stock === 'none' ? 0 : o.stockLen ?? 6;
  const R = o.rec ?? 9, G = o.hg === 'none' ? 0 : o.hgLen ?? 8;
  const rx = S, hx = rx + R, bx = hx + G;
  let mx = bx + (o.bar ?? 3);
  const P = {};
  const sk = (n) => (P[n] ??= new Sketch());

  // receiver
  const rec = sk('receiver');
  rec.rect(rx, top, R, 1, B.top);
  rec.rect(rx, top + 1, R, H - 2, B.main);
  rec.rect(rx, top + H - 1, R, 1, B.bot);
  rec.set(rx + 1, top + 1, B.hi);
  if (o.recDetail !== false && R > 6) rec.rect(rx + 2, top + H - 2, Math.min(3, R - 4), 1, B.bot);

  // barrel (runs through the handguard), double barrels, or a fat suppressor
  if (o.supp) {
    const L = o.bar ?? 8;
    sk('barrel').rect(bx, cy - 1, L, 1, 'd').rect(bx, cy, L, 1, 'g').rect(bx, cy + 1, L, 1, 'e').set(bx + L - 1, cy, 'h');
    mx = bx + L;
  } else if (o.double) {
    sk('barrel').rect(hx, cy, mx - hx, 1, 'c').rect(hx, cy + 1, mx - hx, 1, 'd').rect(hx, cy + 2, mx - hx, 1, 'c').rect(hx, cy + 3, mx - hx, 1, 'e');
  } else {
    const thick = o.thick ?? 2;
    const b = sk('barrel').rect(hx, cy, mx - hx, 1, shotgun ? 'c' : 'd');
    if (thick > 1) b.rect(hx, cy + 1, mx - hx, 1, shotgun ? 'd' : 'f');
    if (thick > 2) b.rect(hx, cy - 1, mx - hx, 1, 'e');
  }
  if (o.brake) {
    sk('brake').rows(mx, cy - 1, ['ddd', 'f.f', 'fff', 'ddd']);
    mx += 3;
  }

  // handguard / tube mag / pump
  if (G > 0) paintHandguard(sk('handguard'), o.hg ?? 'rail', hx, G, top + (shotgun ? 1 : 0), H - (shotgun ? 1 : 0), F, B);
  if (shotgun && !o.double && o.mag === 'tube') sk('tube').rect(hx, cy + 2, Math.max(4, mx - hx - 3), 1, 'e');
  if (o.pump) {
    const n = o.pumpLen ?? 6, px = hx + (o.pumpAt ?? 1);
    sk('pump').rect(px, cy + 2, n, 1, F[2]).rect(px, cy + 3, n, 1, F[1]);
    for (let i = 0; i < n; i++) sk('pump').set(px + i, cy + 4, i % 2 ? F[1] : F[0]);
  }

  // stock
  if (S > 0) paintStock(sk('stock'), o.stock ?? 'solid', S, top, H, F, B, o.drop ?? 0);

  // sights
  // front sight: on the handguard's front end, or out at the muzzle (always, with no handguard)
  if (o.post !== false && !o.carry) sk('post').set(o.postAtMuzzle || G === 0 ? mx - 2 : bx - 2, top - 1, 'f');
  if (o.irons) sk('sight').rows(rx + 2, top - 1, ['f.f']);
  if (o.carry) {
    const L = o.carryLen ?? R - 2;
    sk('carry').rect(rx + 1, top - 2, L, 1, B.top).set(rx + 1, top - 1, B.top).set(rx + L, top - 1, B.top);
    if (o.post !== false) sk('post').rect(bx - 2, top - 2, 1, 2, 'f');
  }

  // grip, trigger, guard
  const gx = rx + (o.gripAt ?? 1);
  const [fd, fm] = FURN[o.gripFurn ?? o.furn ?? 'black'];
  // grip: a separate pistol grip, or (classic wooden guns, thumbhole stocks) just
  // the stock's wrist running down to the trigger
  if (o.grip === 'wrist') sk('grip').rows(gx - 1, bot, [fd + fm + fm, '.' + fm + fm]);
  else sk('grip').rows(gx, bot, [fm + fm + fd, fm + fd, fm + fd, fd + fd]);
  sk('trigger').set(gx + 3, bot, 'h');
  // lever action: the trigger guard is a loop lever that swings down to work the action
  if (o.lever) sk('lever').rows(gx + 1, bot, ['.ffff', 'f...f', '.fff.']);
  else sk('guard').rows(gx + 3, bot, ['.f', 'ff']);

  // magazine
  const magType = o.mag ?? 'stanag';
  let magwell = null;
  const mpal = o.magPal ?? ['e', 'd', 'c'];
  if (magType === 'top') {
    // lies along the top of the receiver (P90)
    const L = o.magLen ?? R + 4;
    sk('mag').rect(o.bullpup ? 2 : rx, top - 1, L, 1, 'b').set(o.bullpup ? 2 : rx, top - 1, 'c');
    magwell = { x: (o.bullpup ? 2 : rx) + L / 2, y: top - 1 };
  } else if (magType === 'helical') {
    sk('mag').rect(hx, bot, G, 1, 'e').rect(hx, bot + 1, G, 1, 'd').rect(hx, bot + 2, G - 1, 1, 'f');
    magwell = { x: hx + G / 2, y: bot };
  } else if (magType === 'grip') {
    sk('mag').rows(gx, bot + 1, magRows('pistol', o.magN ?? 4, mpal));
    magwell = { x: gx + 1, y: bot + 2 };
  } else if (magType !== 'tube' && magType !== 'none') {
    const mgx = o.bullpup ? Math.max(1, rx - (o.magBack ?? 5)) : rx + (o.magAt ?? 6);
    const n = o.magN ?? 5;
    sk('mag').rows(mgx - (magType === 'beltbox' || magType === 'bigdrum' ? 1 : 0), bot, magRows(magType, n, mpal));
    magwell = { x: mgx + 1, y: bot };
    if (magType === 'beltbox') sk('belt').rows(mgx + 2, bot - 1, ['yy']);
  }
  magwell ??= { x: gx + 4, y: bot };

  // fixed foregrip, bipod, cheek riser
  const fgx = hx + (o.fgripAt ?? 2);
  if (o.fgrip) sk('fgrip').rows(fgx, bot - (shotgun ? 0 : 0), [fm + fm, fm + fd, fm + fd, fd + fd]);
  if (o.bipod) sk('bipod').rect(mx - (o.bipodBack ?? 9), bot - 1 + (G > 0 ? 1 : 0), 6, 1, 'f');
  if (o.cheek && S > 0) sk('cheek').rect(2, top - 1, S - 3, 1, F[2]);

  // action: bolt carrier in the port + charging handle; a bolt handle for bolt guns
  const portX = o.bullpup ? Math.max(2, Math.round(S * 0.6)) : rx + Math.round(R * 0.55);
  let bolt = null, handlePt = null;
  if (o.action === 'bolt') {
    sk('bolt').rows(portX + 1, top + H - 1, ['l', 'l', 'cc']);
    handlePt = { x: portX + 2, y: top + H + 2 };
    bolt = { travel: 4, manual: true };
  } else if (o.lever) {
    // the breech block slides back as the lever opens; no charging handle
    sk('bolt').rect(portX - 1, cy, 3, 1, 'l');
    bolt = { travel: 3, manual: true };
  } else if (!o.pump && !o.double) {
    sk('bolt').rect(portX - 1, cy, o.boltLen ?? 2, 1, 'l');
    bolt = { travel: o.boltTravel ?? 2 };
    if (o.handle === 'side') sk('handle').set(portX + 2, cy + 1, 'l').set(portX + 3, cy + 1, 'c');
    else if (o.handle !== 'none') sk('handle').rect(o.bullpup ? 1 : rx, top - 1, 2, 1, 'c');
  }

  // a top mag (P90) lies on the receiver, so it has to go over it
  const order = ['barrel', 'tube', magType === 'top' ? null : 'mag', 'stock', 'cheek', 'handguard', 'post', 'brake', 'receiver', 'belt', 'grip', 'guard', 'trigger', 'lever', 'fgrip', 'bipod', 'carry', 'bolt', 'handle', 'sight', 'pump', magType === 'top' ? 'mag' : null]
    .filter((n) => n && P[n]);
  const parts = {};
  for (const n of order) parts[n] = P[n].part();

  const gripPt = o.grip === 'wrist' ? { x: gx + 1, y: bot + 0.5 } : { x: gx + 1, y: bot + 1 };
  const support = o.pump
    ? { x: hx + (o.pumpAt ?? 1) + (o.pumpLen ?? 6) / 2, y: cy + 3.5 }
    : o.fgrip ? { x: fgx + 1, y: bot + 1.5 } : { x: G > 0 ? hx + G * 0.55 : hx + 1, y: bot + 0.5 };
  const sightY = o.carry ? top - 3 : top - 1;
  const slots = { sight: { x: rx + Math.min(4, R - 2), y: sightY }, muzzle: { x: mx, y: cy } };
  if (G >= 5 && !o.fgrip && !o.pump && !shotgun) slots.under = { x: hx + 3, y: bot };
  if (['stanag', 'curve', 'straight', 'box'].includes(magType)) slots.mag = true;
  if (['solid', 'wood', 'skel', 'tube', 'fold', 'thumb'].includes(o.stock ?? 'solid') && S > 0) slots.stock = true;
  if (o.supp) delete slots.muzzle;
  // classic guns don't take modern bolt-ons: no foregrips, rail lights, swapped
  // stocks - and a classic shotgun no optics or muzzle devices either
  if (o.noUnder) delete slots.under;
  if (o.classic) {
    delete slots.under;
    delete slots.stock;
    if (shotgun) {
      delete slots.sight;
      delete slots.muzzle;
    }
  }

  const art = {
    parts,
    order,
    points: {
      grip: gripPt,
      support,
      magwell,
      muzzle: { x: mx, y: cy + 0.5 },
      light: { x: Math.max(hx, bx - 1), y: bot - 0.5 },
      port: { x: portX, y: cy - 0.5 },
      trigger: { x: gx + 3, y: bot },
    },
    slots,
  };
  if (handlePt) art.points.handle = handlePt;
  if (bolt) art.bolt = bolt;
  if (o.pump) art.pump = { travel: 4 };
  if (o.lever) art.lever = { pivot: { x: gx + 5.5, y: bot + 0.5 } };
  if (o.double) {
    // break action: the barrels swing down on a hinge under their back end
    art.hinge = { x: hx, y: cy + 4 };
    art.breakParts = ['barrel'];
    art.points.breech = { x: hx + 1, y: cy + 1.5 };
  }
  if (magType === 'top') art.magDir = -1;
  if (o.classic || o.noRail) art.noRail = true;
  if (shotgun) art.shell = { w: 2, h: 1, color: '#c23a2e' };
  return art;
}

// Handgun from a spec: slide pistols, revolvers and boxy machine pistols.
export function handgun(o) {
  const L = o.len ?? 10, T = o.tall ?? 0;   // slide length; extra slide height (big pistols)
  const P = {};
  const sk = (n) => (P[n] ??= new Sketch());
  const S = BODY[o.body ?? 'black'], F = FURN[o.furn ?? 'black'];
  const [fd, fm, fl] = FURN[o.gripFurn ?? o.furn ?? 'black'];
  const art = { points: {}, slots: {} };

  if (o.revolver) {
    const bl = o.bar ?? 7;
    sk('frame').rect(1, 1, 8, 1, S.top).rect(1, 2, 8, 3, S.main).set(2, 2, S.hi);
    sk('cyl').rect(4, 1, 5, 4, 'd').rect(4, 1, 5, 1, 'c').set(5, 3, 'e').set(7, 3, 'e');
    sk('barrel').rect(9, 1, bl, 1, S.hi).rect(9, 2, bl, 1, S.main).rect(9, 3, bl - 1, 1, S.bot).set(8 + bl, 0, 'f');
    sk('hammer').rows(0, 0, ['ff.', '.f']);
    sk('grip').rows(0, 5, [fm + fm + fd, fl + fm + fd, '.' + fm + fm + fd, '.' + fd + fd]);
    sk('trigger').set(4, 5, 'h');
    sk('guard').rows(3, 5, ['..f', '.ff']);
    const order = ['grip', 'frame', 'barrel', 'cyl', 'hammer', 'guard', 'trigger'];
    art.parts = Object.fromEntries(order.map((n) => [n, P[n].part()]));
    art.order = order;
    Object.assign(art.points, { grip: { x: 1, y: 6 }, support: { x: 1.5, y: 8.5 }, magwell: { x: 6, y: 4 }, muzzle: { x: 9 + bl, y: 1.5 }, light: { x: 8 + bl, y: 3.5 }, port: { x: 6, y: 1 }, trigger: { x: 4, y: 5 } });
    art.slots = { sight: { x: 6, y: 0 } };
    art.revolver = true;
    // top-break: barrel and cylinder tip down on a hinge at the front of the frame
    art.hinge = { x: 8.5, y: 4.5 };
    art.breakParts = ['barrel', 'cyl'];
    art.points.breech = { x: 4, y: 2.5 };
    return art;
  }

  if (o.box) {
    // machine pistol: a boxy receiver with the bolt on top, mag in the grip (or ahead of it)
    sk('receiver').rect(0, 0, L, 1, S.top).rect(0, 1, L, 3, S.main).rect(0, 4, L, 1, S.bot).set(1, 1, S.hi);
    const bl = o.bar ?? 3;
    if (o.shroud) {
      const n = o.shroud;
      sk('barrel').rect(L, 1, n + bl, 2, 'd');
      sk('shroud').rect(L, 0, n, 1, 'e').rect(L, 3, n, 1, 'f');
      for (let i = 0; i < n; i += 2) sk('shroud').set(L + i, 1, 'e').set(L + i, 2, 'f');
    } else sk('barrel').rect(L, 1, bl, 1, 'd').rect(L, 2, bl, 1, 'f');
    const mx = L + (o.shroud ?? 0) + bl;
    sk('grip').rows(1, 5, [fm + fm + fd, fm + fd + '.', fm + fd + '.', fd + fd]);
    sk('trigger').set(4, 5, 'h');
    sk('guard').rows(3, 5, ['..f', '.ff']);
    const front = !!o.magFront;
    if (front) sk('mag').rows(5, 5, magRows('straight', o.magN ?? 5, ['e', 'd', 'c']));
    else sk('mag').rows(1, 6, ['ee', 'ee', 'ee', 'cd']);
    sk('bolt').rect(Math.round(L * 0.55), 1, 2, 1, 'l');
    sk('handle').rect(2, -1, 2, 1, 'c');
    if (o.stub) sk('stock').rect(-2, 1, 2, 2, F[1]);
    const order = ['mag', 'barrel', 'stock', 'receiver', 'shroud', 'grip', 'guard', 'trigger', 'bolt', 'handle'].filter((n) => P[n]);
    art.parts = Object.fromEntries(order.map((n) => [n, P[n].part()]));
    art.order = order;
    Object.assign(art.points, {
      grip: { x: 2, y: 6 }, support: front ? { x: 6.5, y: 7.5 } : { x: 2.5, y: 8.5 }, magwell: front ? { x: 6, y: 5 } : { x: 2, y: 8 },
      muzzle: { x: mx, y: 1.5 }, light: { x: L - 1, y: 4.5 }, port: { x: Math.round(L * 0.55), y: 1 }, trigger: { x: 4, y: 5 },
    });
    art.slots = { sight: { x: Math.round(L / 2), y: -1 }, muzzle: { x: mx, y: 1 }, mag: true };
    art.bolt = { travel: 2 };
    return art;
  }

  // slide pistol (the hand-drawn M9 is the template)
  const sl = sk('slide');
  sl.rect(0, 0, L, 1, S.hi === 'S' ? 'l' : 'c').set(L - 1, 0, o.dot ? 'r' : 'l');
  for (let j = 1; j < 2 + T; j++) {
    sl.rect(0, j, L, 1, S.main);
    if (j === 1) for (let i = 0; i < 4; i += 2) sl.set(i + 1, j, 'h');
  }
  sl.rect(0, 2 + T, L, 1, S.bot);
  if (o.port !== false) sl.set(Math.round(L * 0.6), 1, 'h');
  const fy = 3 + T;   // frame top
  sk('frame').rect(2, fy, L - 2, 1, F[1]).set(L - 1, fy, F[0]).rect(2, fy + 1, L - 6, 1, F[2]).rect(L - 3, fy + 1, 2, 1, F[0]);
  if (o.rail) sk('frame').rect(L - 4, fy + 1, 3, 1, 'h');
  sk('barrel').rect(L - 1, 2 + T - 1, 2, 1, 'd').rect(L - 1, 2 + T, 2, 1, 'e');
  if (o.comp) sk('comp').rect(L, 0, 3, 2 + T, 'd').set(L + 1, 1, 'h');
  sk('grip').rows(1, fy + 2, [fm + fm + fm, fm + fl + fm, fm + fl + fm, fd + fd + fd].slice(0, o.gripN ?? 4));
  if (o.hammer) sk('hammer').rows(-1, 1, ['f', 'f']);
  sk('trigger').set(5, fy + 2, 'h');
  sk('guard').rows(4, fy + 2, ['..f', '.ff']);
  sk('mag').rows(1, fy + 3, [...Array.from({ length: o.magN ?? 3 }, () => 'ee'), 'cd']);
  const order = ['mag', 'barrel', 'frame', 'grip', 'guard', 'trigger', 'hammer', 'slide', 'comp'].filter((n) => P[n]);
  art.parts = Object.fromEntries(order.map((n) => [n, P[n].part()]));
  art.order = order;
  const mx = L + 1 + (o.comp ? 3 : 0);
  Object.assign(art.points, {
    grip: { x: 2, y: fy + 3 }, support: { x: 2.5, y: fy + 5.5 }, magwell: { x: 2, y: fy + 5 },
    muzzle: { x: mx, y: 1.5 + T / 2 }, light: { x: L, y: fy + 1.5 }, port: { x: Math.round(L * 0.6), y: 0.5 }, trigger: { x: 5, y: fy + 2 },
  });
  art.slots = { sight: { x: Math.round(L / 2), y: -1 }, mag: true };
  if (!o.comp) art.slots.muzzle = { x: mx, y: 1 };
  art.slide = { travel: 3 };
  return art;
}
