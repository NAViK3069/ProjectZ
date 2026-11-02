// The game's sound, all of it made here with Web Audio, nothing to load. Guns are built as guns are heard: the crack
// at the front, the bang in the middle, the thump under it, the room after it, the action working - through a little
// grit - with a limiter over everything so a lot going on doesn't hammer. A quiet slow pad underneath for music.
// Volumes are kept in the browser.
//
// The game doesn't call it at every turn: `watch` looks at the state of things once a frame and plays what's changed,
// so it comes out the same for a player alone, a host, and someone in a game on the other end of the line.

const KEY = 'projectz.sound2';   // (a new name: everyone starts with it off, as it's not finished, till they turn it up)
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const rnd = (a, b) => a + Math.random() * (b - a);

class Sound {
  constructor() {
    this.vol = { master: 0, sfx: 0.8, music: 0.3 };
    try { Object.assign(this.vol, JSON.parse(localStorage.getItem(KEY) ?? '{}')); } catch { /* (no saved settings) */ }
    this.ctx = null;
    this.last = new Map();   // sound -> when it last played (the same one, not too thick and fast)
    this.voices = 0;
    this.seen = new WeakMap();
    this.once = new WeakSet();
    this.listener = { x: 0, y: 0 };
    const wake = () => this.start();
    for (const e of ['pointerdown', 'keydown']) addEventListener(e, wake, { passive: true });
  }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext ?? window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.limit = ctx.createDynamicsCompressor();
    Object.assign(this.limit.threshold, { value: -10 });
    Object.assign(this.limit.ratio, { value: 8 });
    Object.assign(this.limit.attack, { value: 0.002 });
    Object.assign(this.limit.release, { value: 0.2 });
    // (the limiter adds gain of its own: taken back off here, or the loudest shots go over the top)
    const trim = ctx.createGain();
    trim.gain.value = 0.8;
    this.master.connect(this.limit).connect(trim).connect(ctx.destination);
    this.meter = ctx.createAnalyser();
    this.meter.fftSize = 1024;
    trim.connect(this.meter);
    // the effects: rounded off at the top; slowed time closes this right down
    this.sfx = ctx.createGain();
    this.world = ctx.createBiquadFilter();
    this.world.type = 'lowpass';
    this.world.frequency.value = 17000;
    this.world.Q.value = 0.3;
    this.sfx.connect(this.world).connect(this.master);
    // the guns: a touch of grit on their way in
    this.guns = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const v = (i / 511.5) - 1; curve[i] = Math.tanh(v * 2.4) / Math.tanh(2.4); }
    this.guns.curve = curve;
    this.guns.oversample = '2x';
    this.guns.connect(this.sfx);
    this.music = ctx.createGain();
    this.music.connect(this.master);
    // white noise, for all that needs it
    const n = ctx.sampleRate * 2, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.apply();
    this.startMusic();
  }
  apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.03);
    this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.03);
    this.music.gain.setTargetAtTime(this.vol.music * 0.5, t, 0.1);
  }
  set(key, v) {
    this.vol[key] = Math.round(clamp01(v) * 20) / 20;
    try { localStorage.setItem(KEY, JSON.stringify(this.vol)); } catch { /* (private window) */ }
    this.apply();
  }

  // ---------- the pieces ----------
  // A voice: gain (and pan) on its way to the effects, gone once it's done.
  out(gain, pan, life, bus = this.sfx) {
    const c = this.ctx, g = c.createGain();
    g.gain.value = gain;
    let tail = g;
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; }
    tail.connect(bus);
    this.voices++;
    setTimeout(() => { this.voices--; try { tail.disconnect(); g.disconnect(); } catch { /* (gone) */ } }, (life + 0.1) * 1000);
    return g;
  }
  // A burst of filtered noise. type: lowpass / bandpass; from .. to: the filter's sweep.
  noise(dest, { at = 0, dur = 0.1, level = 1, attack = 0.002, type = 'lowpass', from = 2000, to = from, q = 0.7 }) {
    const c = this.ctx, t = c.currentTime + at, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf;
    s.loop = true;
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 1.8);
    s.stop(t + dur + 0.02);
  }
  // A held note, sliding from .. to, soft at both ends.
  tone(dest, { at = 0, dur = 0.15, level = 0.5, attack = 0.004, wave = 'sine', from = 440, to = from }) {
    const c = this.ctx, t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // ---------- the sounds ----------
  // Play one: at (x, y) in the world (quieter and to one side, the further from the camera), or right here with none.
  play(name, { x, y, vol = 1, gap = 0.03 } = {}) {
    if (!this.ctx || this.ctx.state !== 'running' || !this.vol.master || this.voices > 40) return;
    const now = this.ctx.currentTime;
    if (now - (this.last.get(name) ?? -9) < gap) return;
    const r = SOUNDS[name];
    if (!r) return;
    let level = vol, pan = 0;
    if (x !== undefined) {
      const dx = x - this.listener.x, dy = (y ?? this.listener.y) - this.listener.y, d = Math.hypot(dx, dy);
      level *= 1 / (1 + (d / 190) ** 2);
      if (level < 0.015) return;
      pan = Math.max(-0.7, Math.min(0.7, dx / 420));
    }
    this.last.set(name, now);
    const life = r.life ?? 0.6;
    r.make(this, this.out(level, pan, life, r.gun ? this.guns : this.sfx));
  }

  // Slowed time: the world goes dull and far off.
  muffle(on) {
    if (!this.ctx || this.muffled === on) return;
    this.muffled = on;
    this.world.frequency.setTargetAtTime(on ? 520 : 17000, this.ctx.currentTime, on ? 0.08 : 0.18);
  }

  // ---------- music: a slow pad, four soft chords going round ----------
  startMusic() {
    const CHORDS = [[110, 164.8, 220, 261.6], [87.3, 174.6, 220, 261.6], [130.8, 196, 261.6, 329.6], [98, 146.8, 196, 246.9]];
    let i = 0;
    const c = this.ctx, lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 620;
    lp.Q.value = 0.2;
    lp.connect(this.music);
    const next = () => {
      if (c.state === 'running' && this.vol.music > 0) {
        const t = c.currentTime, dur = 11;
        for (const f of CHORDS[i++ % CHORDS.length]) for (const det of [-3, 3]) {
          const o = c.createOscillator(), g = c.createGain();
          o.type = 'triangle';
          o.frequency.value = f;
          o.detune.value = det;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.05, t + 3.5);
          g.gain.setValueAtTime(0.05, t + dur - 3.5);
          g.gain.linearRampToValueAtTime(0.0001, t + dur);
          o.connect(g).connect(lp);
          o.start(t);
          o.stop(t + dur + 0.05);
        }
      }
      setTimeout(next, 8000);
    };
    next();
  }

  // ---------- what's happening ----------
  // Once a frame: what's changed since the last, played. `viewer`: who it's all being heard by.
  watch(game, viewer, cam, slowed, click) {
    if (click) this.play('ui', { gap: 0.04 });
    if (!this.ctx) return;
    this.listener.x = cam.x;
    this.listener.y = cam.y;
    this.muffle(!!slowed);
    const at = (o, extra = {}) => ({ x: o.x, y: o.y, ...extra });
    // the shots: one sound for a shotgun's handful
    const fired = new Set();
    for (const b of game.bullets) {
      if (this.once.has(b)) continue;
      this.once.add(b);
      const o = b.owner;
      if (!o || fired.has(o)) continue;
      fired.add(o);
      if (o.hidden && o !== viewer) continue;
      const cls = o.gun?.def.cls ?? 'pistol';
      this.play(`shot_${SOUNDS[`shot_${cls}`] ? cls : 'pistol'}`, at(o, { vol: o === viewer ? 0.95 : 0.8, gap: 0.015 }));
    }
    for (const list of [game.blasts, game.punches, game.bursts, game.numbers, game.grenades, game.arrows, game.voids, game.galaxies, game.bloods]) {
      for (const n of list ?? []) {
        if (this.once.has(n)) continue;
        this.once.add(n);
        if (list === game.blasts) this.play('boom', at(n, { vol: Math.min(1, (n.r ?? 60) / 60), gap: 0.05 }));
        else if (list === game.punches) this.play('stab', at(n));
        else if (list === game.bursts) this.play(n.kind === 'hack' || n.kind === 'chidori' ? 'hack' : n.kind === 'cut' ? 'katana' : 'shield_burst', at(n));
        else if (list === game.numbers) this.play(n.big ? 'hit_big' : 'hit', at(n, { gap: 0.05 }));
        else if (list === game.grenades) this.play('throw', at(n));
        else if (list === game.arrows) this.play('arrow', at(n, { gap: 0.05 }));
        else if (list === game.voids) this.play('void', at(n));
        else if (list === game.galaxies) this.play('galaxy', at(n));
        else if (list === game.bloods) this.play('bite', at(n, { gap: 0.04 }));
      }
    }
    for (const f of game.fighters) {
      let s = this.seen.get(f);
      if (!s) { s = {}; this.seen.set(f, s); }
      const quiet = f.hidden && f !== viewer, here = at(f, { vol: f === viewer ? 1 : 0.8 });
      if (s.alive && !f.alive && !f.isDecoy) this.play('down', here);
      if (f.alive && !quiet) {
        const ground = f.onGround || f.onLadder;
        if (s.ground === false && ground && (s.vy ?? 0) > 200) this.play('land', { ...here, vol: here.vol * 0.7, gap: 0.08 });
        if (s.ground && !ground && f.vy < -120 && !f.padT) this.play('jump', { ...here, vol: here.vol * 0.6, gap: 0.1 });
        if ((f.padT ?? 0) > (s.padT ?? 0)) this.play('pad', here);
        if (f.flipT >= 0 && !(s.flipT >= 0)) this.play('whoosh', { ...here, vol: here.vol * 0.5 });
        if (f.roll && !s.roll) this.play('whoosh', { ...here, vol: here.vol * 0.7 });
        const slashes = f.slashes?.length ?? 0;
        if (slashes > (s.slashes ?? 0)) this.play('swing', { ...here, gap: 0.06 });
        // the reload, step by step: the old mag out, the new one home, the bolt let go - or a shell at a time
        const w = f.gun, r = w?.reloading ? w.reload : -1, was = s.gunIs === w ? s.reloadAt ?? -1 : -1, shells = w?.def.reload === 'shells';
        if (r >= 0 && !shells) {
          if (was < 0) this.play('mag_out', here);
          if (was < 0.55 && r >= 0.55) this.play('mag_in', here);
          if (was < 0.82 && r >= 0.82) this.play('bolt', here);
        }
        if (r >= 0 && shells && s.gunIs === w && w.ammo > (s.ammo ?? 0)) this.play('shell_in', here);
        // working the pump or the bolt, after a shot
        if (w && (w.acting ?? 0) > 0 && !((s.acting ?? 0) > 0) && s.gunIs === w) this.play('bolt', { ...here, vol: here.vol * 0.9 });
        if (f.hook && !s.hook) this.play('grapple', here);
        if (f.cloak && !s.cloak) this.play('cloak', here);
        if (f.decoy && !s.decoy) this.play('clone', here);
        if (f.bow && !s.bow) this.play('charge_soft', here);
        if (f.mura && !s.mura) this.play('charge_low', here);
        if (f.blaze && !s.blaze) this.play('flame', here);
        if (f.gal && !s.gal) this.play('charge_low', here);
        if (f.summon && !s.summon) this.play('summon', here);
        if (f.lockOn && !s.lockOn) this.play('visor', here);
        if (f.lockOn?.target && f.lockOn.target !== s.lockTarget) this.play('locked', here);
        if (f.barrier && !s.barrier) this.play('shield_up', here);
        if (f.barrier && f.barrier.hit > (s.barrierHit ?? 0) + 0.3) this.play('shield_hit', { ...here, gap: 0.07 });
        if (f.card && !s.card) this.play('card_up', here);
        if (f.card?.on && !s.cardOn) this.play(`card_${f.card.kind}`, here);
        if (f.hackCast && !s.hackCast) this.play('hack_cast', here);
        if (f.batCast && !s.batCast) this.play('bats', here);
        if (f.wraith && !s.wraith) this.play('charge_low', here);
        if (f.chidori && !s.chidori) this.play('hack_cast', here);
        if (!f.wraith && s.wraith) this.play('dash', here);
        if (f.deflect && !s.deflect) this.play('charge_low', here);
        if (f.deflect?.phase === 'dash' && s.deflectPhase !== 'dash') this.play('dash', here);
        if ((f.deflect?.spark ?? 0) > (s.spark ?? 0) + 0.3) this.play('deflect', { ...here, gap: 0.04 });
        if (f.hackedT > (s.hackedT ?? 0) + 0.5) this.play('hacked', here);
        if (f.sande && !s.sande) this.play('sande_on', { vol: 1 });
        if (!f.sande && s.sande) this.play('sande_off', { vol: 0.9 });
        if (f === viewer && f.skill && (s.cd ?? 0) > 0 && !(f.skillCD > 0)) this.play('ready', { vol: 0.7, gap: 0.3 });
      }
      Object.assign(s, { wraith: !!f.wraith, chidori: !!f.chidori, alive: f.alive, ground: f.onGround || f.onLadder, vy: f.vy, padT: f.padT, flipT: f.flipT, roll: !!f.roll, slashes: f.slashes?.length ?? 0, gunIs: f.gun, reloadAt: f.gun?.reloading ? f.gun.reload : -1, ammo: f.gun?.ammo, acting: f.gun?.acting, hook: !!f.hook, cloak: !!f.cloak, decoy: !!f.decoy, bow: !!f.bow, mura: !!f.mura, blaze: !!f.blaze, gal: !!f.gal, summon: !!f.summon, lockOn: !!f.lockOn, lockTarget: f.lockOn?.target ?? null, barrier: !!f.barrier, barrierHit: f.barrier?.hit ?? 0, card: !!f.card, cardOn: !!f.card?.on, hackCast: !!f.hackCast, batCast: !!f.batCast, deflect: !!f.deflect, deflectPhase: f.deflect?.phase, spark: f.deflect?.spark ?? 0, hackedT: f.hackedT ?? 0, sande: !!f.sande, cd: f.skillCD });
    }
  }
}

// A gun, in layers: the crack (a split second of the very top), the bang (a burst through the middle, closing fast),
// the thump under it, the room answering, the action working a moment after.
// crack, bang: how loud, thump: Hz, tail: seconds of room; bright: how far up the bang opens.
const gun = ({ crack = 1, bang = 1, bright = 5200, low = 1100, thump = 95, kick = 1, dur = 0.08, tail = 0.28, room = 1, mech = 1 }) => ({
  gun: true,
  life: dur + tail + 0.2,
  make: (a, d) => {
    const p = rnd(0.96, 1.04);
    a.noise(d, { dur: 0.016, level: 1.3 * crack, type: 'highpass', from: 3400 * p, to: 2600, attack: 0.0006 });
    a.noise(d, { dur, level: 1.15 * bang, from: bright * p, to: low * p, attack: 0.0008 });
    a.noise(d, { dur: dur * 0.6, level: 0.5 * bang, type: 'bandpass', from: 1500 * p, to: 700, q: 0.8, attack: 0.001 });
    a.tone(d, { dur: dur * 1.5, level: 1.05 * kick, from: thump * 3 * p, to: thump * p, attack: 0.001 });
    a.noise(d, { at: 0.012, dur: tail, level: 0.28 * room, from: 2200 * p, to: 260, attack: 0.012 });
    a.noise(d, { at: tail * 0.3, dur: tail * 0.9, level: 0.08 * room, type: 'bandpass', from: 900, to: 350, q: 0.8, attack: 0.02 });
    if (mech) a.noise(d, { at: 0.035 + dur * 0.4, dur: 0.018, level: 0.16 * mech, type: 'bandpass', from: 3600 * p, q: 3, attack: 0.001 });
  },
});
// Metal on metal: a hard little click, ringing for a moment.
const clack = (a, d, at, f, level = 0.6, ring = 0.03) => {
  a.noise(d, { at, dur: 0.012, level, type: 'highpass', from: f, to: f * 0.8, attack: 0.0005 });
  a.noise(d, { at, dur: 0.03, level: level * 0.8, type: 'bandpass', from: f * 0.6, q: 2.5, attack: 0.0006 });
  a.tone(d, { at, dur: ring, level: level * 0.18, from: f * 0.9, to: f * 0.75, wave: 'triangle', attack: 0.0006 });
};
const SOUNDS = {
  shot_pistol: gun({ crack: 0.9, bang: 0.85, bright: 5000, low: 1300, thump: 130, kick: 0.75, dur: 0.06, tail: 0.22, room: 0.8 }),
  shot_smg: gun({ crack: 0.8, bang: 0.72, bright: 5600, low: 1500, thump: 150, kick: 0.6, dur: 0.045, tail: 0.15, room: 0.6, mech: 0.7 }),
  shot_rifle: gun({ crack: 1.05, bang: 1, bright: 6000, low: 1100, thump: 105, kick: 0.95, dur: 0.075, tail: 0.3, room: 1 }),
  shot_lmg: gun({ crack: 1, bang: 1.05, bright: 5200, low: 900, thump: 88, kick: 1.05, dur: 0.085, tail: 0.3, room: 1, mech: 1.1 }),
  shot_shotgun: gun({ crack: 1.1, bang: 1.25, bright: 3800, low: 480, thump: 68, kick: 1.3, dur: 0.15, tail: 0.5, room: 1.3, mech: 0 }),
  shot_sniper: gun({ crack: 1.35, bang: 1.25, bright: 7000, low: 600, thump: 58, kick: 1.4, dur: 0.13, tail: 0.85, room: 1.6, mech: 0 }),
  mag_out: { life: 0.3, make: (a, d) => { clack(a, d, 0, 2600, 0.5); a.noise(d, { at: 0.03, dur: 0.09, level: 0.14, type: 'bandpass', from: 1400, to: 900, q: 1.2, attack: 0.01 }); clack(a, d, 0.13, 1500, 0.22); } },
  mag_in: { life: 0.3, make: (a, d) => { a.noise(d, { dur: 0.05, level: 0.14, type: 'bandpass', from: 900, to: 1500, q: 1.2, attack: 0.012 }); clack(a, d, 0.05, 2100, 0.72); a.tone(d, { at: 0.05, dur: 0.05, level: 0.26, from: 170, to: 110, attack: 0.001 }); } },
  bolt: { life: 0.4, make: (a, d) => { clack(a, d, 0, 2900, 0.62); a.noise(d, { at: 0.012, dur: 0.07, level: 0.12, type: 'bandpass', from: 1800, to: 2400, q: 1.5, attack: 0.008 }); clack(a, d, 0.1, 2200, 0.8); a.tone(d, { at: 0.1, dur: 0.05, level: 0.2, from: 200, to: 120, attack: 0.001 }); } },
  shell_in: { life: 0.25, make: (a, d) => { a.noise(d, { dur: 0.04, level: 0.1, type: 'bandpass', from: 1100, to: 1700, q: 1.3, attack: 0.008 }); clack(a, d, 0.04, 1800, 0.5, 0.05); } },
  boom: { life: 1.3, gun: true, make: (a, d) => { a.noise(d, { dur: 0.03, level: 1, type: 'highpass', from: 2400, attack: 0.001 }); a.tone(d, { dur: 0.65, level: 1.1, from: 150, to: 32, attack: 0.002 }); a.noise(d, { dur: 0.85, level: 0.75, from: 3200, to: 90, attack: 0.002 }); } },
  stab: { life: 0.4, make: (a, d) => { a.noise(d, { dur: 0.14, level: 0.32, type: 'bandpass', from: 2400, to: 800, q: 1 }); a.tone(d, { dur: 0.22, level: 0.24, from: 880, to: 520, wave: 'triangle' }); } },
  hit: { life: 0.2, make: (a, d) => { a.noise(d, { dur: 0.03, level: 0.22, type: 'bandpass', from: 1100, to: 500, q: 1.2, attack: 0.001 }); a.tone(d, { dur: 0.05, level: 0.2, from: 190, to: 110, attack: 0.001 }); } },
  hit_big: { life: 0.3, make: (a, d) => { a.noise(d, { dur: 0.02, level: 0.5, type: 'highpass', from: 3000, attack: 0.001 }); a.tone(d, { dur: 0.09, level: 0.26, from: 1240, to: 1040, wave: 'triangle', attack: 0.001 }); a.tone(d, { dur: 0.09, level: 0.3, from: 180, to: 95, attack: 0.001 }); } },
  down: { life: 0.8, make: (a, d) => { a.tone(d, { dur: 0.42, level: 0.34, from: 190, to: 58 }); a.noise(d, { dur: 0.22, level: 0.14, from: 700, to: 200 }); } },
  land: { life: 0.2, make: (a, d) => { a.tone(d, { dur: 0.09, level: 0.26, from: 95, to: 55 }); a.noise(d, { dur: 0.06, level: 0.08, from: 500, to: 180 }); } },
  jump: { life: 0.2, make: (a, d) => a.noise(d, { dur: 0.11, level: 0.09, type: 'bandpass', from: 500, to: 1300, q: 0.6, attack: 0.02 }) },
  pad: { life: 0.5, make: (a, d) => { a.tone(d, { dur: 0.3, level: 0.26, from: 180, to: 560, wave: 'triangle' }); a.noise(d, { dur: 0.22, level: 0.12, type: 'bandpass', from: 700, to: 2200 }); } },
  whoosh: { life: 0.4, make: (a, d) => a.noise(d, { dur: 0.26, level: 0.16, type: 'bandpass', from: 500, to: 1500, q: 0.8, attack: 0.07 }) },
  swing: { life: 0.3, make: (a, d) => a.noise(d, { dur: 0.15, level: 0.16, type: 'bandpass', from: 700, to: 1700, q: 0.9, attack: 0.03 }) },
  throw: { life: 0.3, make: (a, d) => a.noise(d, { dur: 0.18, level: 0.13, type: 'bandpass', from: 600, to: 1100, attack: 0.04 }) },
  ui: { life: 0.2, make: (a, d) => a.tone(d, { dur: 0.07, level: 0.14, from: 620, to: 700, wave: 'triangle' }) },
  ready: { life: 0.6, make: (a, d) => { a.tone(d, { dur: 0.18, level: 0.12, from: 660, wave: 'sine' }); a.tone(d, { at: 0.08, dur: 0.28, level: 0.12, from: 990, wave: 'sine' }); } },
  // the skills
  grapple: { life: 0.3, make: (a, d) => { a.noise(d, { dur: 0.13, level: 0.14, type: 'bandpass', from: 1000, to: 2400 }); a.tone(d, { dur: 0.12, level: 0.1, from: 300, to: 620, wave: 'triangle' }); } },
  cloak: { life: 0.7, make: (a, d) => { a.tone(d, { dur: 0.5, level: 0.18, from: 620, to: 210 }); a.noise(d, { dur: 0.45, level: 0.08, type: 'bandpass', from: 1400, to: 400, attack: 0.05 }); } },
  clone: { life: 0.6, make: (a, d) => { a.noise(d, { dur: 0.42, level: 0.15, from: 1200, to: 300, attack: 0.04 }); a.tone(d, { dur: 0.36, level: 0.13, from: 200, to: 300 }); } },
  charge_soft: { life: 1, make: (a, d) => a.tone(d, { dur: 0.8, level: 0.14, from: 280, to: 560, attack: 0.1 }) },
  charge_low: { life: 1.1, make: (a, d) => { a.tone(d, { dur: 0.9, level: 0.2, from: 70, to: 150, attack: 0.15 }); a.tone(d, { dur: 0.9, level: 0.09, from: 210, to: 420, attack: 0.2, wave: 'triangle' }); } },
  flame: { life: 0.8, make: (a, d) => a.noise(d, { dur: 0.6, level: 0.2, from: 450, to: 1500, attack: 0.12 }) },
  summon: { life: 1, make: (a, d) => { for (const [f, at] of [[392, 0], [523, 0.1], [659, 0.2]]) a.tone(d, { at, dur: 0.6, level: 0.1, from: f, wave: 'sine', attack: 0.04 }); } },
  arrow: { life: 0.3, make: (a, d) => a.noise(d, { dur: 0.13, level: 0.12, type: 'bandpass', from: 1700, to: 800, q: 1.4 }) },
  void: { life: 0.8, make: (a, d) => { a.tone(d, { dur: 0.55, level: 0.26, from: 240, to: 60 }); a.noise(d, { dur: 0.5, level: 0.13, from: 1300, to: 200 }); } },
  galaxy: { life: 2.2, make: (a, d) => { a.tone(d, { dur: 2, level: 0.34, from: 90, to: 38, attack: 0.2 }); a.noise(d, { dur: 1.8, level: 0.1, type: 'bandpass', from: 300, to: 1400, attack: 0.5 }); } },
  visor: { life: 0.5, make: (a, d) => { a.tone(d, { dur: 0.12, level: 0.1, from: 880, wave: 'sine' }); a.tone(d, { at: 0.09, dur: 0.2, level: 0.1, from: 1320, wave: 'sine' }); } },
  locked: { life: 0.3, make: (a, d) => a.tone(d, { dur: 0.1, level: 0.09, from: 1100, to: 1000, wave: 'triangle' }) },
  shield_up: { life: 0.7, make: (a, d) => { a.tone(d, { dur: 0.5, level: 0.2, from: 200, to: 420, attack: 0.05 }); a.tone(d, { dur: 0.45, level: 0.07, from: 800, to: 1200, attack: 0.08 }); a.noise(d, { dur: 0.3, level: 0.06, type: 'bandpass', from: 1000, to: 2000 }); } },
  shield_hit: { life: 0.3, make: (a, d) => { a.tone(d, { dur: 0.14, level: 0.16, from: 520, to: 340, wave: 'triangle' }); a.noise(d, { dur: 0.06, level: 0.06, type: 'bandpass', from: 1800, q: 2 }); } },
  shield_burst: { life: 0.9, make: (a, d) => { a.tone(d, { dur: 0.45, level: 0.36, from: 280, to: 60 }); a.noise(d, { dur: 0.42, level: 0.24, from: 1700, to: 200 }); a.tone(d, { dur: 0.2, level: 0.08, from: 1400, to: 700, wave: 'triangle' }); } },
  card_up: { life: 0.5, make: (a, d) => a.noise(d, { dur: 0.2, level: 0.12, type: 'bandpass', from: 1000, to: 2200, q: 1, attack: 0.03 }) },
  card_red: { life: 0.7, make: (a, d) => { a.noise(d, { dur: 0.4, level: 0.16, from: 500, to: 1500, attack: 0.05 }); a.tone(d, { dur: 0.35, level: 0.14, from: 220, to: 440, wave: 'triangle' }); } },
  card_green: { life: 0.9, make: (a, d) => { for (const [f, at] of [[523, 0], [659, 0.09], [784, 0.18]]) a.tone(d, { at, dur: 0.45, level: 0.1, from: f, attack: 0.02 }); } },
  card_blue: { life: 0.6, make: (a, d) => { a.tone(d, { dur: 0.3, level: 0.12, from: 440, to: 980, wave: 'sine' }); a.noise(d, { dur: 0.3, level: 0.1, type: 'bandpass', from: 900, to: 2400, attack: 0.04 }); } },
  card_purple: { life: 0.8, make: (a, d) => { a.tone(d, { dur: 0.6, level: 0.15, from: 660, to: 220 }); a.tone(d, { dur: 0.6, level: 0.08, from: 990, to: 330, wave: 'triangle' }); } },
  hack_cast: { life: 0.5, make: (a, d) => { for (let i = 0; i < 4; i++) a.tone(d, { at: i * 0.07, dur: 0.05, level: 0.06, from: 880 + i * 220, wave: 'triangle' }); } },
  hack: { life: 0.9, make: (a, d) => { a.tone(d, { dur: 0.5, level: 0.18, from: 700, to: 110, wave: 'triangle' }); a.noise(d, { dur: 0.45, level: 0.1, type: 'bandpass', from: 2200, to: 500, q: 1.2 }); } },
  hacked: { life: 0.6, make: (a, d) => { for (let i = 0; i < 3; i++) a.tone(d, { at: i * 0.1, dur: 0.07, level: 0.09, from: 520 - i * 90, wave: 'triangle' }); } },
  bats: { life: 1, make: (a, d) => { for (let i = 0; i < 10; i++) a.noise(d, { at: i * 0.045, dur: 0.05, level: 0.16, type: 'bandpass', from: 1800 + i * 90, q: 2, attack: 0.004 }); a.tone(d, { dur: 0.5, level: 0.16, from: 1200, to: 2200, wave: 'triangle', attack: 0.05 }); } },
  bite: { life: 0.3, make: (a, d) => { a.noise(d, { dur: 0.05, level: 0.2, type: 'bandpass', from: 1400, q: 1.4 }); a.tone(d, { dur: 0.16, level: 0.14, from: 240, to: 520, attack: 0.01 }); } },
  katana: { life: 0.6, make: (a, d) => { a.noise(d, { dur: 0.32, level: 0.3, type: 'highpass', from: 2800, to: 6000, attack: 0.03 }); a.tone(d, { dur: 0.4, level: 0.14, from: 2400, to: 3200, wave: 'triangle', attack: 0.04 }); } },
  deflect: { life: 0.4, make: (a, d) => { clack(a, d, 0, 4200, 0.7, 0.12); a.tone(d, { dur: 0.2, level: 0.2, from: 3200, to: 2400, wave: 'triangle', attack: 0.001 }); } },
  dash: { life: 0.5, make: (a, d) => { a.noise(d, { dur: 0.26, level: 0.5, type: 'bandpass', from: 700, to: 4000, q: 0.7, attack: 0.02 }); a.noise(d, { at: 0.14, dur: 0.1, level: 0.3, type: 'highpass', from: 3000, attack: 0.002 }); } },
  // Sandevistan: the world dropping away under you, a slow beat; and coming back up
  sande_on: { life: 2.4, make: (a, d) => {
    a.tone(d, { dur: 0.9, level: 0.42, from: 340, to: 42, attack: 0.01 });
    a.tone(d, { dur: 0.6, level: 0.12, from: 1500, to: 220, wave: 'triangle' });
    a.noise(d, { dur: 0.8, level: 0.2, type: 'bandpass', from: 3000, to: 200, q: 0.8 });
    for (const at of [0.7, 1.45]) a.tone(d, { at, dur: 0.3, level: 0.28, from: 70, to: 42 });
  } },
  sande_off: { life: 0.9, make: (a, d) => {
    a.tone(d, { dur: 0.55, level: 0.26, from: 50, to: 320, attack: 0.05 });
    a.noise(d, { dur: 0.5, level: 0.16, type: 'bandpass', from: 240, to: 2600, q: 0.8, attack: 0.06 });
  } },
};

export const sound = new Sound();
