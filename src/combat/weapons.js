// Weapon stats, ammo, attachments, reloading and part animation. The art
// (modular parts, attachment points) is in gunart.js.
//
// Moving parts per shot: the trigger pulls, the bolt carrier slams back in
// the ejection port (pistol: the slide), and the case flies out of the port.
// Pump and bolt-action guns are cycled by hand after each shot instead.
//
// Reserve ammo isn't stored on the gun: it's whatever ammo of the gun's
// calibre is in the inventory (see `ammoSource`).

import { spriteFromRows } from '../engine/pixel.js';
import { GUN_ART, ATTACH_ART, drawGun, gunIcon, muzzleOffset } from './gunart.js';
import { CATALOG, CLASSES, BOLT, PUMP, LEVER } from './catalog.js';
import { CUSTOM_GUNS } from './customguns.js';

// Every gun in the catalog, keyed by its catalog key (m9, ak47, awm...).
export const WEAPONS = {};
for (const [key, name, cls, over, art] of CATALOG) {
  WEAPONS[key] = { ...CLASSES[cls].base, ...over, key, name, cls, art: typeof art === 'string' ? art : key };
}
// A gun from the gun editor -> a weapon def. It starts from its class, keeps
// the base gun's special reload if it uses one ('steps'), then takes what the
// editor set: what has to be worked after a shot, where shells go in, the stats.
export function customDef(src) {
  const cls = CLASSES[src.cls] ? src.cls : 'rifle';
  const base = WEAPONS[src.base];
  const def = { ...CLASSES[cls].base };
  if (src.reload === 'steps' && base?.steps) {
    for (const k of ['reload', 'reloadTime', 'keepsShells', 'openAngle', 'steps', 'breakOpen', 'handPath', 'holding', 'revolver']) if (base[k] !== undefined) def[k] = base[k];
  } else {
    def.reload = src.reload === 'shells' ? 'shells' : 'mag';
  }
  const art = src.art ?? {};
  const act = src.action ?? 'none';
  if (act === 'pump') def.action = { ...PUMP.action, travel: art.pump?.travel ?? PUMP.action.travel };
  else if (act === 'bolt') def.action = { ...BOLT.action, travel: art.bolt?.travel ?? BOLT.action.travel };
  else if (act === 'lever') def.action = { ...LEVER.action };
  else def.action = undefined;
  if (src.loadFrom === 'top') def.loadFrom = 'top';
  else delete def.loadFrom;
  def.noRack = src.rack === false || act === 'bolt';
  for (const [k, v] of Object.entries(src.stats ?? {})) if (v !== null && v !== '') def[k] = v;
  if (!def.burst) delete def.burst;
  if (!def.pellets) delete def.pellets;
  if (def.reload === 'shells') def.shellTime ??= 0.45;
  return { ...def, key: src.key, name: src.name || src.key.toUpperCase(), cls, art: src.key, custom: true, base: src.base };
}
for (const c of CUSTOM_GUNS) WEAPONS[c.key] = customDef(c);

// Classes in display order, with their guns.
export const WEAPON_CLASSES = Object.entries(CLASSES).map(([cls, c]) => ({ cls, label: c.label, guns: Object.values(WEAPONS).filter((w) => w.cls === cls) }));

// What each attachment does to the gun's handling.
export const ATTACH_STATS = {
  redDot: { spread: 0.8 },
  holo: { spread: 0.85, climb: 0.9 },
  scope: { spread: 0.55, lean: 1.8 },
  suppressor: { damage: 0.92, shake: 0.6, flash: 'small' },
  compensator: { climb: 0.55, recoil: 0.8 },
  vgrip: { spread: 0.85, climb: 0.8 },
  agrip: { reloadTime: 0.9, climb: 0.9 },
  extMag: { magSize: 1.5, reloadTime: 1.1 },
  drumMag: { magSize: 2.4, reloadTime: 1.35 },
  heavyStock: { climb: 0.7, recoil: 0.8 },
  flashlight: {},
  laser: { spread: 0.8 },
  laserLight: { spread: 0.85 },
};

for (const def of Object.values(WEAPONS)) {
  const art = GUN_ART[def.art];
  def.points = art.points;
  def.slots = Object.keys(art.slots);
  def.shell = def.shellColor ? { w: 2, h: 1, color: def.shellColor } : art.shell;

  def.img = gunIcon(def.art, def.defaultAttach);   // the whole gun, for cases and the HUD
}

const FLASH = spriteFromRows([
  '..Y......',
  '.YWY..O..',
  'YWWWYY.O.',
  '.YWY..O..',
  '..Y......',
], { W: '#fffbe6', Y: '#ffd85a', O: '#ff9a3c' });

const BIG_FLASH = spriteFromRows([
  '...Y.Y......',
  '..YWYWY..O..',
  '.YWWWWWYY.O.',
  'YWWWWWWWWYYO',
  '.YWWWWWYY.O.',
  '..YWYWY..O..',
  '...Y.Y......',
], { W: '#fffbe6', Y: '#ffd85a', O: '#ff9a3c' });

const SMALL_FLASH = spriteFromRows(['.Y.', 'YWY', '.Y.'], { W: '#fffbe6', Y: '#ffd85a' });

// Mag reload timeline (fraction of reloadTime).
export const RELOAD_EVENTS = { magOut: 0.15, magIn: 0.64, rack: 0.88 };
const MAG_SLIDE = 0.08;    // mag starts sliding out
const MAG_SEAT = 0.58;     // new mag appears at the well
const MAG_DROP = 4;        // px the mag slides before it falls / when it's seated
// Within one shell's load cycle, when the shell goes in.
export const SHELL_IN = 0.82;
// Within an action cycle (pump/bolt), when the spent case flies out.
const ACTION_EJECT = 0.45;
const DRAW_TIME = 0.3;     // raising a gun after switching to it
const CYCLE_TIME = 0.06;   // bolt carrier / slide slamming back on a shot

export class Weapon {
  constructor(def) {
    this.def = def;
    this.art = GUN_ART[def.art];
    this.attach = { ...(def.defaultAttach ?? {}) };   // slot -> attachment key
    this.ammo = def.magSize;
    this.ammoSource = null;   // { count(caliber), take(caliber, n) } - the inventory
    this.cooldown = 0;
    this.recoil = 0;      // current kick-back in px
    this.climb = 0;       // current muzzle climb in radians
    this.flash = 0;
    this.reload = -1;     // reload progress 0..1 (per shell for 'shells'), or -1 when not reloading
    this.cycle = 0;       // which shell we're on during a shell reload
    this.acting = 0;      // seconds left in a pump/bolt stroke
    this.actDelay = 0;
    this.spent = false;   // a fired case is still in the chamber (action guns)
    this.cycleT = 0;      // bolt carrier / slide snapping back after a shot
    this.heat = 0;        // +1 per shot, cools off over time
    this.drawT = DRAW_TIME;
    this.events = [];     // things that happened this frame (for effects)
    this.ammo = this.magSize;
    this.cond = 100;      // condition (survival mode: wears as it's fired, repaired with a kit)
    this.reloadMul = 1;   // reload speed (coffee)
  }

  // Guns only wear out in the survival mode.
  static wear = false;

  // How badly worn: 0 (fine) .. 1 (falling apart).
  get worn() {
    return Weapon.wear ? Math.max(0, (50 - this.cond) / 50) : 0;
  }

  // --- stats, with attachments applied ---

  mod(stat) {
    let k = 1;
    for (const a of Object.values(this.attach)) k *= ATTACH_STATS[a]?.[stat] ?? 1;
    return k;
  }

  get magSize() { return Math.round(this.def.magSize * this.mod('magSize')); }
  get spread() { return this.def.spread * this.mod('spread') * (1 + this.worn * 0.9); }
  get climbAmount() { return this.def.climb * this.mod('climb'); }
  get recoilAmount() { return this.def.recoil * this.mod('recoil'); }
  get shake() { return this.def.shake * this.mod('shake'); }
  get damage() { return this.def.damage * this.mod('damage'); }
  get reloadTime() { return (this.def.reloadTime ?? 1) * this.mod('reloadTime'); }
  get lean() { return this.mod('lean'); }
  get suppressed() { return this.def.suppressed || this.attach.muzzle === 'suppressor'; }
  // side rail: a flashlight and / or a laser, shining from the front of it
  get hasLight() { return this.attach.side === 'flashlight' || this.attach.side === 'laserLight'; }
  get hasLaser() { return this.attach.side === 'laser' || this.attach.side === 'laserLight'; }
  // where the beams leave the rail device (its red laser lens / its torch lens)
  get laserEmitter() {
    const s = this.art.slots.side;
    return { x: s.x + 1, y: s.y + 0.5 };
  }
  get lightEmitter() {
    const s = this.art.slots.side;
    return { x: s.x + 1, y: s.y + (this.attach.side === 'laserLight' ? 1.5 : 1) };
  }
  get icon() {
    const key = JSON.stringify(this.attach);
    if (this._iconKey !== key) {
      this._iconKey = key;
      this._icon = gunIcon(this.def.art, this.attach);
    }
    return this._icon;
  }

  // Where the bullets come out, in gun pixels (a suppressor moves it forward).
  get muzzle() {
    const m = this.art.points.muzzle;
    return { x: m.x + muzzleOffset(this.attach), y: m.y };
  }

  get reserve() {
    return this.ammoSource ? this.ammoSource.count(this.def.caliber) : 0;
  }

  canAttach(key) {
    const slot = ATTACH_ART[key]?.slot;
    return !!slot && this.def.slots.includes(slot);
  }

  get reloading() {
    return this.reload >= 0;
  }

  // 0..1 through the current pump/bolt stroke, or -1.
  get actionProgress() {
    return this.acting > 0 && this.actDelay <= 0 ? 1 - this.acting / this.def.action.time : -1;
  }

  // How far the pump/bolt is pulled back right now (px).
  get actionOffset() {
    const t = this.actionProgress;
    if (t < 0) return 0;
    return Math.round(Math.sin(Math.PI * Math.min(1, t * 1.15)) * this.def.action.travel);
  }

  // 0..1 how far the gun is still coming up after being switched to.
  get raising() {
    return Math.max(0, this.drawT / DRAW_TIME);
  }

  update(dt) {
    this.events.length = 0;

    this.cooldown -= dt;
    this.flash -= dt;
    this.cycleT -= dt;
    this.drawT -= dt;
    this.recoil *= Math.exp(-16 * dt);
    this.climb *= Math.exp(-12 * dt);
    this.heat = Math.max(0, this.heat - dt * 4);   // shots fired lately (a laser is dead on for the first few)

    if (this.actDelay > 0) {
      this.actDelay -= dt;   // let the kick land before working the action
    } else if (this.acting > 0) {
      const before = this.actionProgress;
      this.acting -= dt;
      const after = this.acting > 0 ? this.actionProgress : 1;
      if (before <= 0 && after > 0) this.events.push('actionStart');
      if (before < ACTION_EJECT && after >= ACTION_EJECT) {
        this.events.push('action');
        if (this.spent) this.events.push('eject');
        this.spent = false;
      }
      if (this.acting <= 0 && this.reloadQueued) {
        this.reloadQueued = false;
        this.startReload();
      }
    }

    if (!this.reloading) return;
    const rdt = dt * this.reloadMul;
    if (this.def.reload === 'shells') this.updateShells(rdt);
    else if (this.def.reload === 'steps') this.updateSteps(rdt);
    else this.updateMag(rdt);
  }

  // Break actions / revolvers: run down the def's timeline of steps.
  updateSteps(dt) {
    const before = this.reload, d = this.def;
    this.reload += dt / this.reloadTime;
    for (const [at, name] of d.steps) {
      if (before >= at || this.reload < at) continue;
      const want = name === 'loadAll' ? this.magSize - this.ammo : name === 'load' ? Math.min(1, this.magSize - this.ammo) : 0;
      if (want > 0) this.ammo += this.ammoSource ? this.ammoSource.take(d.caliber, want) : 0;
      this.events.push(name);
    }
    const shut = d.breakOpen?.[3] ?? 1;
    if (before < shut && this.reload >= shut) this.events.push('close');
    if (this.reload >= 1) this.reload = -1;
  }

  // How far a break action is hinged open right now (radians).
  get openAngle() {
    const o = this.def.breakOpen;
    if (!o || !this.reloading) return 0;
    const t = this.reload;
    const k = t < o[0] ? 0 : t < o[1] ? (t - o[0]) / (o[1] - o[0]) : t < o[2] ? 1 : t < o[3] ? 1 - (t - o[2]) / (o[3] - o[2]) : 0;
    return k * k * (3 - 2 * k) * this.def.openAngle;
  }

  // How far a loop lever is swung down (radians).
  get leverAngle() {
    const t = this.actionProgress;
    return t < 0 ? 0 : Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.9;
  }

  updateMag(dt) {
    const before = this.reload;
    this.reload += dt / this.reloadTime;
    for (const [name, at] of Object.entries(RELOAD_EVENTS)) {
      if (name === 'rack' && this.def.noRack) continue;
      if (before < at && this.reload >= at) this.events.push(name);
    }
    if (this.reload >= 1) {
      const want = this.magSize - this.ammo;
      this.ammo += this.ammoSource ? this.ammoSource.take(this.def.caliber, want) : 0;
      this.reload = -1;
      if (this.def.noRack) this.startAction();   // sniper: work the bolt to chamber a round
    }
  }

  updateShells(dt) {
    const before = this.reload;
    this.reload += dt / this.def.shellTime;
    if (before < SHELL_IN && this.reload >= SHELL_IN) {
      const got = this.ammoSource ? this.ammoSource.take(this.def.caliber, 1) : 0;
      this.ammo += got;
      this.events.push('shellIn');
    }
    if (this.reload >= 1) {
      if (this.ammo < this.magSize && this.reserve > 0) {
        this.reload -= 1;
        this.cycle++;
      } else {
        this.reload = -1;
        this.startAction();   // chamber a round
      }
    }
  }

  startAction(delay = 0) {
    if (!this.def.action) return;
    this.acting = this.def.action.time;
    this.actDelay = delay;
  }

  startReload() {
    if (this.acting > 0) {
      this.reloadQueued = true;   // finish working the pump/bolt first
      return false;
    }
    if (this.reloading || this.ammo >= this.magSize || this.reserve <= 0) return false;
    this.reload = 0;
    this.cycle = 0;
    return true;
  }

  cancelReload() {
    this.reload = -1;
  }

  // Taking off / putting on a mag attachment empties the gun back into the inventory.
  setAttachment(slot, key) {
    if (slot === 'mag' && this.ammo > 0 && this.ammoSource) {
      this.ammoSource.give(this.def.caliber, this.ammo);
      this.ammo = 0;
    }
    if (key) this.attach[slot] = key;
    else delete this.attach[slot];
  }

  // 'fired', 'empty' (dry - starts a reload if there's ammo), or null.
  tryFire() {
    // a shell reload can be cut short to shoot (except mid-push), as long as there's a shell loaded
    const pushing = this.reload > SHELL_IN - 0.3 && this.reload < SHELL_IN;
    if (this.reloading && this.def.reload === 'shells' && this.ammo > 0 && !pushing) this.reload = -1;
    if (this.cooldown > 0 || this.reloading || this.acting > 0 || this.drawT > 0) return null;
    if (this.ammo <= 0) {
      this.cooldown = 0.25;
      this.startReload();
      return 'empty';
    }
    // a badly worn gun jams now and then
    if (Weapon.wear && this.cond < 25 && Math.random() < (25 - this.cond) / 220) {
      this.cooldown = 0.7;
      this.events.push('jam');
      return 'jam';
    }
    this.ammo--;
    if (Weapon.wear) this.cond = Math.max(0, this.cond - Math.min(0.4, Math.max(0.05, 0.03 + this.def.fireInterval * 0.3)));
    this.cooldown = this.def.fireInterval;
    if (this.def.burst) {
      // burst guns fire a few rounds per pull, then pause
      this.burstLeft = this.burstLeft > 0 ? this.burstLeft - 1 : this.def.burst - 1;
      if (this.burstLeft === 0 || this.ammo === 0) {
        this.burstLeft = 0;
        this.cooldown = this.def.burstDelay ?? 0.25;
      }
    }
    this.recoil = this.recoilAmount;
    this.climb = this.climbAmount;
    this.flash = 0.05;
    this.heat += 1;
    if (this.def.keepsShells) this.spentIn = (this.spentIn ?? 0) + 1;   // stays in the chamber till it's opened
    if (this.def.action) {
      this.spent = true;
      this.startAction(this.def.action.delay);
    } else {
      this.cycleT = CYCLE_TIME;   // self-loading: the bolt/slide cycles and throws the case
    }
    return 'fired';
  }

  // --- part positions ---

  get slideOffset() {
    const s = this.art.slide;
    if (!s) return 0;
    const lockedBack = this.ammo === 0 && (!this.reloading || this.reload < RELOAD_EVENTS.rack);
    if (lockedBack) return s.travel;
    if (this.reloading && this.reload >= 0.8 && this.reload < RELOAD_EVENTS.rack + 0.04) return s.travel;   // hand pulls it
    return this.cycleT > 0 ? Math.round((this.cycleT / CYCLE_TIME) * s.travel) : 0;
  }

  get boltOffset() {
    const b = this.art.bolt;
    if (!b) return 0;
    if (b.manual) return this.actionOffset;
    if (this.ammo === 0 && !this.reloading) return b.travel;   // bolt held open on an empty mag
    return this.cycleT > 0 ? Math.round((this.cycleT / CYCLE_TIME) * b.travel) : 0;
  }

  get handleOffset() {
    if (this.reloading && !this.def.noRack && this.reload >= 0.8 && this.reload < RELOAD_EVENTS.rack + 0.04) return 3;
    return 0;
  }

  get magDrop() {
    if (!this.reloading || this.def.reload !== 'mag') return 0;
    const t = this.reload, { magOut, magIn } = RELOAD_EVENTS;
    if (t < MAG_SLIDE) return 0;
    if (t < magOut) return Math.round(((t - MAG_SLIDE) / (magOut - MAG_SLIDE)) * MAG_DROP);
    if (t < MAG_SEAT) return null;
    if (t < magIn) return Math.round((1 - (t - MAG_SEAT) / (magIn - MAG_SEAT)) * MAG_DROP);
    return 0;
  }

  // The mag sprite this gun uses right now (for the one in the reloading hand / the dropped one).
  get magImg() {
    return (this.attach.mag && ATTACH_ART[this.attach.mag].img) || this.art.parts.mag?.img;
  }

  // Draw with the grip at the current transform origin, pointing along +x.
  draw(ctx) {
    drawGun(ctx, this.def.art, {
      attach: this.attach,
      bolt: this.boltOffset,
      handle: this.handleOffset,
      slide: this.slideOffset,
      pump: this.def.action?.part === 'pump' ? this.actionOffset : 0,
      open: this.openAngle,
      lever: this.def.action?.part === 'lever' ? this.leverAngle : 0,
      magDrop: this.magDrop,
      trigger: this.cycleT > 0 || this.flash > 0 ? 1 : 0,
    });
  }

  drawFlash(ctx) {
    if (this.flash <= 0) return;
    const { grip } = this.art.points, m = this.muzzle;
    const img = this.suppressed ? SMALL_FLASH : this.def.pellets || this.def.damage > 100 ? BIG_FLASH : FLASH;
    ctx.drawImage(img, m.x - grip.x, m.y - grip.y - img.height / 2);
  }
}
