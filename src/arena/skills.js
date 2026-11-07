// What every skill is, to everything that isn't the skill itself: how it's aimed (and so what a phone does to help
// aim it), and what it threatens while it's coming (so the bots can see it and get out of the way). The skill's own
// working is in fighter.js (update<Name>) and main.js; its name, picture and words are main.js's SKILL_INFO; how a bot
// uses it is ai.js's BOT_SKILLS. A new skill goes in all four - checkSkills (below; ai.js runs it) says in the console
// which it's missing from.
//
// aim:
//   'self'  - nothing aimed: it's on you, or it finds its own way (cloak, the shield, shadow kill's nearest foe)
//   'dir'   - along the aim, as far as it goes (grapple, fangs, the beams)
//   'point' - to a point, the mouse (galaxy, judgement cut, chidori's lunge). A phone can aim which way, but not how
//             far - so there the point is put on the foe nearest the way it's aimed, within reach (phoneLock): as Q
//             goes down, and after while aiming(f) - the skill's going and still taking its point.
//   'pick'  - whoever's nearest the mouse (skill thief, target lock): the same help on a phone.
// danger(f, G): what's coming from f's skill right now, for anyone to keep out of - a list of
//   { line: true, x, y, a, w, len, t, front, speed } - from (x, y) along a, w either side, len long; it goes in t
//      (s; 0: it's going), its front got to `front` and running on at `speed` (Infinity: all at once)
//   { x, y, r, t } - a circle, going in t
// (only for skills that are worth getting out of the way of, and can be.)
// hits: the names its hits go by (a hit's hitHow) - how adaptation knows a hit for the skill's (adapt.js). One named
// after the skill itself needn't be listed.

import {
  SKILL_CD, GRAPPLE_RANGE, GAL_CAST, GAL_RANGE, LOCK_RANGE, STEAL_RANGE, CHIDORI_REACH, JC_RANGE, JC_R, JC_STANCE,
  EA_RANGE, EA_CHARGE, EA_SWING, EX_RANGE, EX_CHARGE, EX_SWING, EX_SPEED, EX_GUIDE, MURA_CHARGE, BLAZE_CHARGE, BLAZE_RANGE, ROAR_R, ROAR_CAST,
} from './fighter.js';

const chest = (f) => ({ x: f.x, y: f.y - 14 });

export const SKILLS = {
  grapple: { hits: ['GRAPPLE'], aim: 'dir', reach: GRAPPLE_RANGE },
  cloak: { hits: ['BACKSTAB'], aim: 'self' },
  decoy: { aim: 'self' },
  archery: { hits: ['ARROW'], aim: 'self' },   // (it locks on to whoever's in reach by itself)
  murasaki: { hits: ['MURASAKI'],
    aim: 'dir',
    danger: (f) => f.mura && f.mura.t > MURA_CHARGE * 0.4 ? [{ line: true, ...chest(f), a: f.aim, w: 22, len: 600, t: MURA_CHARGE - f.mura.t, front: 0, speed: 760 }] : null,
  },
  blaze: { hits: ['FLAME FIST'],
    aim: 'dir', reach: BLAZE_RANGE,
    danger: (f) => f.blaze?.phase === 'charge' ? [{ line: true, ...chest(f), a: f.aim, w: 18, len: BLAZE_RANGE + 20, t: BLAZE_CHARGE - (f.blaze.t ?? 0), front: 0, speed: 560 }] : null,
  },
  galaxy: { hits: ['GALAXY'],
    aim: 'point', reach: GAL_RANGE,
    danger: (f, G) => {
      const out = [];
      if (f.gal) out.push({ x: f.gal.x, y: f.gal.y, r: 115, t: Math.max(0, GAL_CAST - f.gal.t) });
      for (const o of G.galaxies ?? []) if (o.owner === f && !o.boomed) out.push({ x: o.x, y: o.y, r: 115, t: 0 });
      return out;
    },
  },
  demon: { hits: ['FLYING SWORDS'], aim: 'self' },
  lock: { hits: ['TARGET LOCK'], aim: 'pick', reach: LOCK_RANGE, aiming: (f) => !!f.lockOn },
  shield: { hits: ['BLUE SHIELD'], aim: 'self' },
  cards: { hits: ['BUFF CARDS'], aim: 'self' },
  hack: { aim: 'self' },
  sande: { aim: 'self' },
  vampire: { hits: ['BATS'], aim: 'self' },
  deflect: { hits: ['DEFLECT'], aim: 'dir' },
  chidori: { hits: ['CHIDORI'], aim: 'point', reach: CHIDORI_REACH, aiming: (f) => !!f.chidori && !f.chidori.lunged },
  octo: { aim: 'dir' },
  steal: { aim: 'pick', reach: STEAL_RANGE },
  jumper: { hits: ['RIFT'], aim: 'self' },
  fang: { hits: ['GOLDEN FANGS'], aim: 'dir', reach: 420 },
  aurum: { aim: 'dir' },
  reap: { hits: ['SHADOW KILL'], aim: 'self' },
  ea: { hits: ['ENUMA ELISH'],
    aim: 'dir', reach: EA_RANGE,
    danger: (f) => {
      const m = f.ea;
      if (!m) return null;
      if (m.phase === 'charge' && m.t > EA_CHARGE * 0.4) return [{ line: true, ...chest(f), a: f.aim, w: 28, len: EA_RANGE, t: EA_CHARGE - m.t + EA_SWING, front: 0, speed: 2600 }];
      if (m.phase === 'fire') return [{ line: true, ...chest(f), a: m.a, w: 28, len: EA_RANGE, t: Math.max(0, EA_SWING - m.t), front: m.len, speed: 2600 }];
      return null;
    },
  },
  excal: { hits: ['EXCALIBUR'],
    aim: 'dir', reach: EX_RANGE,
    danger: (f) => {
      const m = f.xc;
      if (!m) return null;
      if (m.phase === 'charge' && m.t > EX_CHARGE * 0.5) return [{ line: true, ...chest(f), a: f.aim, w: 34, len: EX_RANGE, t: EX_CHARGE - m.t + EX_GUIDE + EX_SWING, front: 0, speed: EX_SPEED }];
      if (m.phase === 'guide') return [{ line: true, ...chest(f), a: m.a, w: 34, len: EX_RANGE, t: EX_GUIDE - m.t + EX_SWING, front: 0, speed: EX_SPEED }];
      if (m.phase === 'fire') return [{ line: true, ...chest(f), a: m.a, w: 34, len: EX_RANGE, t: Math.max(0, EX_SWING - m.t), front: m.len, speed: EX_SPEED }];
      return null;
    },
  },
  judge: { hits: ['JUDGEMENT CUT'],
    aim: 'point', reach: JC_RANGE, aiming: (f) => f.jc?.phase === 'stance',
    danger: (f) => f.jc?.phase === 'stance' ? [{ x: f.jc.x, y: f.jc.y, r: JC_R + 14, t: JC_STANCE - f.jc.t }] : null,
  },
  adapt: { aim: 'self' },
  roar: {
    aim: 'self',
    danger: (f) => f.roarCast ? [{ x: f.x, y: f.y - 14, r: ROAR_R, t: ROAR_CAST - f.roarCast.t, los: true }] : null,   // (los: only in sight of it - a wall's cover)
  },
};

// Every skill's danger to `me` that's on its way: [{ d, f, t, eta }] - d the shape, eta how long till it reaches them.
export function dangersTo(me, G) {
  const out = [], cx = me.x, cy = me.y - 14;
  for (const f of G.fighters) {
    if (f === me || !f.alive || !G.foes(f, me)) continue;
    const list = SKILLS[f.usingSkill]?.danger?.(f, G);
    if (!list) continue;
    for (const d of list) {
      if (d.line) {
        const ux = Math.cos(d.a), uy = Math.sin(d.a), dx = cx - d.x, dy = cy - d.y, along = dx * ux + dy * uy;
        if (along < -10 || along > d.len || Math.abs(dx * uy - dy * ux) > d.w + 8) continue;
        out.push({ d, f, eta: d.t + Math.max(0, along - d.front) / d.speed });
      } else if (Math.hypot(cx - d.x, cy - d.y) < d.r + 8 && (!d.los || G.los(d.x, d.y, cx, cy))) out.push({ d, f, eta: d.t });
    }
  }
  return out;
}

// On a phone: the foe a point skill goes to - the one nearest the way it's aimed, within its reach (and not too far
// off that way). null: none, or not this skill / not now. now: Q's going down (or would: for showing who it'd be).
export function phoneLock(f, G, now) {
  const s = SKILLS[f.usingSkill];
  if (!s || (s.aim !== 'point' && s.aim !== 'pick') || !f.alive) return null;
  const ready = f.skillCD <= 0 && !(f.hackedT > 0) && !f.skillBusy;
  if (!(now && ready) && !(f.skillBusy && s.aiming?.(f))) return null;
  const sx = f.x, sy = f.y - 14, ax = Math.cos(f.aim), ay = Math.sin(f.aim);
  let best = null, bs = Infinity;
  for (const v of G.fighters) {
    if (v === f || !v.alive || v.vanish || (v.hidden && !v.glimpsed) || !G.foes(f, v)) continue;
    const p = f.seen ? f.seen(v) : v, dx = p.x - sx, dy = p.y - 14 - sy, d = Math.hypot(dx, dy);
    if (d > s.reach * 1.15 || d < 1) continue;
    const off = Math.acos(Math.max(-1, Math.min(1, (dx * ax + dy * ay) / d)));
    if (off > 0.5) continue;
    const score = off + (d / s.reach) * 0.15;
    if (score < bs) { bs = score; best = v; }
  }
  return best;
}

// Anything a skill should be in and isn't: said in the console (once). lists: { name: [keys] }.
export function checkSkills(lists) {
  const all = Object.keys(SKILL_CD), have = { SKILLS: Object.keys(SKILLS), ...lists };
  for (const [name, keys] of Object.entries(have)) {
    const missing = all.filter((k) => !keys.includes(k));
    if (missing.length) console.warn(`skills missing from ${name}: ${missing.join(', ')}`);
  }
}
