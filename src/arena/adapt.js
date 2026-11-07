// Adaptation (skill, Q): a dharma wheel turning over the head. Whatever last did something to you - a sniper's
// round, a grenade, a skill, a drum going up, being caught in someone's Sandevistan - Q, and the wheel turns: a
// moment adapting (ADAPT_SPIN), and from then on that does nothing to you. Up to ADAPT_MAX things at once: a fourth
// pushes the first out.
//
// What a thing is, to the wheel, is its harm key:
//   'gun:<class>'   - shot by a gun of that sort (sniper, rifle, smg, pistol, shotgun, lmg): any gun of it
//   'melee'         - a blade, a blunt thing, fists     'thrown' - something thrown at you
//   'grenade'       - a grenade's blast                 'barrel' - an explosive drum's
//   'skill:<key>'   - a skill (its own key, as in SKILL_CD)
//   'how:<HOW>'     - anything else that hurts, by the name it goes by (hitHow)
// Being hurt names it by itself (harmFrom, below): a shot, a blast or a melee blow says what it is as it lands
// (hitSrc, hitRef on the one it lands on); a skill's hits go by their hitHow, which skills.js maps to the skill
// (SKILLS[k].hits - a new skill's hits are found by its name anyway). What isn't a hit is noted where it happens
// (Fighter.noteHarm): caught in a Sandevistan, hacked, a hit stopped by a blue shield, a buff card's other side.
//
// And what adapting to something does, beyond its damage (Fighter.adaptedTo, and where each is checked):
//   skill:sande  - its stopped world doesn't stop you        skill:shield - your hits go through blue shields
//   skill:decoy / skill:cloak / skill:cards - you see whoever's hidden by it (the double's maker, the cloaked, the
//   phantom)                                                  skill:hack / skill:steal - they can't hack you
//   skill:galaxy - the black hole doesn't drag you            skill:cards - its other side does nothing to you

// (nothing imported: fighter.js uses this, and skills.js needs fighter.js - main.js hands the skills in, nameSkills)

export const ADAPT_MAX = 3;      // things adapted to at once
export const ADAPT_SPIN = 1.2;   // the wheel turning: how long adapting takes
export const ADAPT_CD = 10;      // the wait after
export const ADAPT_RECENT = 8;   // how long ago the last thing can have been, to adapt to it (s)

const GUNS = { sniper: 'SNIPERS', rifle: 'RIFLES', smg: 'SMGS', pistol: 'PISTOLS', shotgun: 'SHOTGUNS', lmg: 'MACHINE GUNS' };
const OTHER = { melee: 'MELEE', thrown: 'THROWN WEAPONS', grenade: 'GRENADES', barrel: 'EXPLOSIVE DRUMS' };

// skill names (main.js hands them in: SKILL_INFO's), and the hits each skill's known by (skills.js: SKILLS[k].hits)
let names = {};
const HOW = { GRENADE: 'grenade', THROWN: 'thrown', FISTS: 'melee' };
export function nameSkills(map, skills) {
  names = map;
  for (const [k, s] of Object.entries(skills)) for (const h of s.hits ?? []) HOW[h] = 'skill:' + k;
  for (const [k, n] of Object.entries(map)) HOW[n] ??= 'skill:' + k;   // (a skill's hits named after it: found anyway)
}

// What's just hurt v, as the wheel knows it: { key, ref } (ref: the gun, blade or skill, for its picture) or null.
export function harmFrom(v) {
  if (v.hitSrc) return { key: v.hitSrc, ref: v.hitRef ?? null };
  const h = v.hitHow;
  if (!h) return null;
  const key = HOW[h] ?? 'how:' + h;
  return { key, ref: key.startsWith('skill:') ? key.slice(6) : null };
}

// Its name, for the screen.
export function harmName(key) {
  if (!key) return '';
  const [kind, k] = key.split(':');
  if (kind === 'gun') return GUNS[k] ?? 'GUNS';
  if (kind === 'skill') return names[k] ?? k.toUpperCase();
  if (kind === 'how') return k;
  return OTHER[key] ?? key.toUpperCase();
}

// ---------- the wheel ----------
// Pixels: a gold rim with a dark edge, eight spokes from a hub, and a knob at the end of each spoke out past the rim,
// lit from above. (x, y) its middle, r the rim, ang how far it's turned, tilt how flat it's seen (1: face on; small:
// lying flat over a head, seen from the side). light: 0..1, how much it's shining.
const GOLD = { ink: '#2a1a06', dark: '#7a5414', mid: '#c89a3a', lit: '#f0c860', hi: '#fff4c0' };
export function drawWheel(ctx, x, y, r, ang, tilt = 1, light = 0) {
  const px = (X, Y, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(X), Math.round(Y), 1, 1); };
  const at = (a, rr) => [x + Math.cos(a) * rr, y + Math.sin(a) * rr * tilt];
  const spokes = [];
  for (let i = 0; i < 8; i++) spokes.push(ang + (i * Math.PI) / 4);
  const back = (a) => Math.sin(a) < 0 && tilt < 0.9;   // (the far side, lying flat: darker, and drawn first)
  // the far spokes and knobs, then the rim, then the near ones
  const spoke = (a) => {
    const far = back(a);
    for (let s = 2; s < r; s += 0.5) { const [X, Y] = at(a, s); px(X, Y, far ? GOLD.dark : light > 0.5 ? GOLD.hi : GOLD.mid); }
  };
  const knob = (a) => {
    const far = back(a), [X, Y] = at(a, r + 2.5), s = r > 10 ? 2 : 1;
    ctx.fillStyle = GOLD.ink;
    ctx.fillRect(Math.round(X) - s, Math.round(Y) - s, s * 2 + 1, s * 2 + 1);
    ctx.fillStyle = far ? GOLD.dark : GOLD.mid;
    ctx.fillRect(Math.round(X) - s + 1, Math.round(Y) - s + 1, s * 2 - 1, s * 2 - 1);
    if (!far) px(X - (s > 1 ? 1 : 0), Y - (s > 1 ? 1 : 0), light > 0.3 ? GOLD.hi : GOLD.lit);
  };
  for (const a of spokes) if (back(a)) { spoke(a); knob(a); }
  // the rim: dark edges, gold, lit on its upper side
  const n = Math.ceil(r * 7);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, up = -Math.sin(a) * (tilt < 0.9 ? -1 : 1);
    const far = tilt < 0.9 && Math.sin(a) < 0;
    const [ox, oy] = at(a, r + 1), [mx, my] = at(a, r), [ix, iy] = at(a, r - 1);
    px(ox, oy, GOLD.ink);
    px(mx, my, far ? GOLD.dark : light > 0.6 ? GOLD.hi : up > 0.3 ? GOLD.lit : GOLD.mid);
    if (r > 6) px(ix, iy, far ? GOLD.ink : GOLD.dark);
  }
  for (const a of spokes) if (!back(a)) { spoke(a); knob(a); }
  // the hub
  ctx.fillStyle = GOLD.ink;
  ctx.fillRect(Math.round(x) - 2, Math.round(y) - 1, 5, 3);
  ctx.fillStyle = light > 0.4 ? GOLD.hi : GOLD.lit;
  ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 2);
}
