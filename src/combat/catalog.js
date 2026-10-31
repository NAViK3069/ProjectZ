// The full gun catalog: every gun's class, calibre, stats and art.
//
// Stats start from the class base and each gun overrides what's different.
// Art is a spec for the procedural builder (gunbuild.js); sizes are in world
// pixels (the art itself is drawn on a finer grid):
//   hand: 'long' | 'pistol'  which builder
//   stock / stockLen         solid, wood, skel, tube, fold, thumb, bullpup, pad, none
//   rec / recH               receiver length / height
//   hg / hgLen               handguard: rail, ak, wood, slim, vent, shroud, body, none
//   bar                      exposed barrel length; thick: barrel rows
//   mag / magN / magAt       stanag, curve, straight, box, pistol, grip, drum, bigdrum,
//                            beltbox, helical, top, tube, none; rows; x from the receiver
//   furn / body              furniture (black, grey, olive, wood, tan) / receiver metal
//   action                   'bolt' for bolt guns; pump; double (break-action)
//   extras                   carry, brake, supp, bipod, fgrip, cheek, irons, bullpup,
//                            topRail (flat-top picatinny rail), bead (shotgun front bead)

export const CLASSES = {
  pistol: { label: 'PISTOL', base: { reload: 'mag', auto: false, fireInterval: 0.14, magSize: 12, reloadTime: 1.25, damage: 38, bulletSpeed: 640, spread: 0.03, recoil: 2.5, climb: 0.36, shake: 1.5, price: 300, ammoPrice: 150, caliber: '9mm' } },
  smg: { label: 'SMG', base: { reload: 'mag', auto: true, fireInterval: 0.065, magSize: 30, reloadTime: 1.5, damage: 22, bulletSpeed: 680, spread: 0.09, recoil: 1.8, climb: 0.12, shake: 0.9, price: 1000, ammoPrice: 300, caliber: '9mm' } },
  rifle: { label: 'ASSAULT RIFLE', base: { reload: 'mag', auto: true, fireInterval: 0.095, magSize: 30, reloadTime: 1.8, damage: 32, bulletSpeed: 780, spread: 0.045, recoil: 2.2, climb: 0.15, shake: 1.2, price: 1400, ammoPrice: 400, caliber: '5.56' } },
  sniper: { label: 'SNIPER', base: { reload: 'mag', auto: false, fireInterval: 1.0, magSize: 5, reloadTime: 2.1, damage: 140, bulletSpeed: 1200, spread: 0.004, pierce: 3, recoil: 5, climb: 0.5, shake: 4, price: 2000, ammoPrice: 400, caliber: '.308', speedMul: 0.94, defaultAttach: { sight: 'scope' } } },
  shotgun: { label: 'SHOTGUN', base: { reload: 'shells', shellTime: 0.45, auto: false, pellets: 8, range: 140, fireInterval: 0.62, magSize: 6, damage: 24, bulletSpeed: 600, spread: 0.2, recoil: 4, climb: 0.45, shake: 3, price: 900, ammoPrice: 300, caliber: '12g' } },
  lmg: { label: 'LMG', base: { reload: 'mag', auto: true, fireInterval: 0.08, magSize: 100, reloadTime: 3.6, damage: 30, bulletSpeed: 760, spread: 0.075, recoil: 2, climb: 0.1, shake: 1.4, price: 2500, ammoPrice: 500, caliber: '7.62', speedMul: 0.86 } },
};

export const BOLT = { action: { part: 'bolt', travel: 4, time: 0.55, delay: 0.25, hand: 'handle' }, noRack: true };
export const PUMP = { action: { part: 'pump', travel: 4, time: 0.36, delay: 0.12, hand: 'support' } };
const SEMI_SHOTGUN = { action: undefined, fireInterval: 0.26 };

// Step reloads (reload: 'steps'): a timeline of [time 0..1, event] -
//   dump: the spent cases fall out;  load: one round in;  loadAll: a speedloader
// breakOpen: [opening from, open by, closing from, shut by] (fractions);
// handPath: where the off hand goes ([time, point]); holding: [from, to, what].
// The spent cases stay in the chamber (keepsShells) until the gun is opened.
const BREAK_DOUBLE = {
  reload: 'steps', reloadTime: 2.3, keepsShells: true, openAngle: 0.55,
  steps: [[0.17, 'dump'], [0.48, 'load'], [0.74, 'load']],
  breakOpen: [0.03, 0.14, 0.84, 0.94],
  handPath: [[0, 'rest'], [0.18, 'rest'], [0.3, 'belt'], [0.36, 'belt'], [0.48, 'breech'], [0.56, 'belt'], [0.62, 'belt'], [0.74, 'breech'], [0.84, 'barrel'], [0.94, 'barrel'], [1, 'rest']],
  holding: [[0.33, 0.48, 'shell'], [0.59, 0.74, 'shell']],
};
const TOP_BREAK = {
  reload: 'steps', reloadTime: 2.4, keepsShells: true, openAngle: 0.75,
  steps: [[0.2, 'dump'], [0.66, 'loadAll']],
  breakOpen: [0.04, 0.16, 0.8, 0.9],
  handPath: [[0, 'rest'], [0.2, 'rest'], [0.34, 'belt'], [0.4, 'belt'], [0.6, 'breech'], [0.68, 'breech'], [0.8, 'barrel'], [0.9, 'barrel'], [1, 'rest']],
  holding: [[0.37, 0.66, 'loader']],
};
// Lever action: the lever swings down and back, and the gun is spun round the
// hand to do it (spin-cocking); shells go in through the top of the receiver.
export const LEVER = { action: { part: 'lever', travel: 3, time: 0.62, delay: 0.1, hand: 'trigger', spin: true }, loadFrom: 'top' };

// [key, name, class, stat overrides, art]
export const CATALOG = [
  // --- pistols ---
  ['m9', 'M9', 'pistol', {}, { hand: 'pistol', len: 11, hammer: true, body: 'black' }],
  ['glock', 'GLOCK', 'pistol', { magSize: 17, fireInterval: 0.12, damage: 34 }, { hand: 'pistol', len: 10, port: true }],
  ['deagle', 'DESERT EAGLE', 'pistol', { caliber: '.45', damage: 85, magSize: 7, fireInterval: 0.3, recoil: 4, climb: 0.65, shake: 3, reloadTime: 1.5 }, { hand: 'pistol', len: 13, tall: 1, body: 'silver', furn: 'black' }],
  ['ruger', 'RUGER', 'pistol', { damage: 26, magSize: 10, fireInterval: 0.1, spread: 0.018, recoil: 1.5, climb: 0.2, shake: 0.8 }, { hand: 'box', len: 7, bar: 7, body: 'steel', furn: 'black' }],
  ['usp', 'USP', 'pistol', { caliber: '.45', damage: 44, magSize: 12, fireInterval: 0.15 }, { hand: 'pistol', len: 11, rail: true }],
  ['p226', 'P226', 'pistol', { damage: 40, magSize: 15 }, { hand: 'pistol', len: 11, rail: true, hammer: true, body: 'steel' }],
  ['revolver', 'REVOLVER', 'pistol', { caliber: '.45', damage: 95, magSize: 6, fireInterval: 0.36, reloadTime: 2.2, recoil: 4, climb: 0.6, shake: 2.6, revolver: true, ...TOP_BREAK }, { hand: 'pistol', revolver: true, bar: 7, body: 'steel', furn: 'wood' }],
  ['g18', 'G18', 'pistol', { auto: true, fireInterval: 0.055, magSize: 19, damage: 30, spread: 0.09, climb: 0.2 }, { hand: 'pistol', len: 10, comp: true, magN: 5 }],
  ['m1911', 'M1911', 'pistol', { caliber: '.45', damage: 50, magSize: 7, fireInterval: 0.16 }, { hand: 'pistol', len: 11, hammer: true, body: 'steel', furn: 'wood' }],
  ['tt', 'TT', 'pistol', { damage: 40, magSize: 8, bulletSpeed: 720 }, { hand: 'pistol', len: 10, hammer: true, body: 'black', furn: 'wood' }],
  ['mac10', 'MAC-10', 'pistol', { caliber: '.45', auto: true, fireInterval: 0.05, magSize: 30, damage: 26, spread: 0.13, climb: 0.14, recoil: 1.6 }, { hand: 'box', len: 7, bar: 3 }],
  ['p99', 'P99', 'pistol', { damage: 36, magSize: 15, fireInterval: 0.13 }, { hand: 'pistol', len: 10, furn: 'olive', dot: true }],
  ['tokarev', 'TOKAREV', 'pistol', { damage: 42, magSize: 8, bulletSpeed: 740 }, { hand: 'pistol', len: 10, hammer: true, body: 'silver', furn: 'wood' }],

  // --- SMGs ---
  ['ump45', 'UMP45', 'smg', { caliber: '.45', fireInterval: 0.085, damage: 30, magSize: 25 }, { hand: 'long', stock: 'fold', stockLen: 4, rec: 9, hg: 'body', hgLen: 4, bar: 2, mag: 'straight', magN: 5, magAt: 6, post: false, topRail: true }],
  ['mp5', 'MP5', 'smg', { fireInterval: 0.07, damage: 24 }, { hand: 'long', stock: 'solid', stockLen: 5, rec: 9, hg: 'slim', hgLen: 6, bar: 2, mag: 'curve', magN: 5, magAt: 5, post: true, postAtMuzzle: true, irons: true }],
  ['vector', 'VECTOR', 'smg', { caliber: '.45', fireInterval: 0.045, damage: 26, magSize: 25, climb: 0.07 }, { hand: 'long', stock: 'fold', stockLen: 4, rec: 9, recH: 5, hg: 'body', hgLen: 3, bar: 2, mag: 'straight', magN: 6, magAt: 7, post: false, gripAt: 1 , topRail: true}],
  ['p90', 'P90', 'smg', { fireInterval: 0.06, damage: 22, magSize: 50, reloadTime: 1.9 }, { hand: 'long', stock: 'bullpup', stockLen: 9, rec: 5, hg: 'slim', hgLen: 4, bar: 1, mag: 'top', bullpup: true, magLen: 12, furn: 'black', post: false, gripAt: 0 }],
  ['kriss', 'KRISS', 'smg', { caliber: '.45', fireInterval: 0.048, damage: 27, magSize: 30, climb: 0.07 }, { hand: 'long', stock: 'skel', stockLen: 5, rec: 9, recH: 5, body: 'tan', furn: 'tan', hg: 'body', hgLen: 3, bar: 5, mag: 'straight', magN: 6, magAt: 7, post: false , topRail: true}],
  ['mp7', 'MP7', 'smg', { fireInterval: 0.055, damage: 22, magSize: 40, bulletSpeed: 760 }, { hand: 'long', stock: 'tube', stockLen: 5, rec: 8, hg: 'body', hgLen: 3, bar: 2, mag: 'grip', magN: 5, fgrip: true, fgripAt: 0, post: false , topRail: true}],
  ['pp19', 'PP-19', 'smg', { fireInterval: 0.07, damage: 24 }, { hand: 'long', stock: 'fold', stockLen: 6, rec: 9, hg: 'ak', hgLen: 5, bar: 3, furn: 'black', mag: 'straight', magN: 6, magAt: 5, handle: 'side', postAtMuzzle: true }],
  ['tmp', 'TMP', 'smg', { fireInterval: 0.055, damage: 20, spread: 0.1 }, { hand: 'long', stock: 'none', rec: 9, hg: 'body', hgLen: 3, bar: 2, mag: 'grip', magN: 6, fgrip: true, fgripAt: 0, post: false }],
  ['bizon', 'BIZON', 'smg', { fireInterval: 0.07, damage: 22, magSize: 64, reloadTime: 2 }, { hand: 'long', stock: 'fold', stockLen: 6, rec: 8, hg: 'ak', hgLen: 7, bar: 2, mag: 'helical', handle: 'side', postAtMuzzle: true }],
  ['tac9', 'TAC-9', 'smg', { fireInterval: 0.06, damage: 22, magSize: 32, spread: 0.12 }, { hand: 'box', len: 8, shroud: 5, bar: 1, magFront: true, magN: 6 }],

  // --- assault rifles ---
  ['m4a1', 'M4A1', 'rifle', {}, { hand: 'long', stock: 'tube', stockLen: 7, rec: 9, hg: 'rail', hgLen: 8, bar: 4, mag: 'stanag', magN: 5, magAt: 6, topRail: true, postAtMuzzle: true }],
  ['ak47', 'AK-47', 'rifle', { caliber: '7.62', fireInterval: 0.1, damage: 38, spread: 0.055, climb: 0.2 }, { hand: 'long', stock: 'wood', stockLen: 7, drop: 1, furn: 'wood', rec: 10, hg: 'ak', hgLen: 7, bar: 5, mag: 'curve', magN: 6, magAt: 6, handle: 'side', postAtMuzzle: true }],
  ['scarh', 'SCAR-H', 'rifle', { caliber: '7.62', fireInterval: 0.11, damage: 44, magSize: 20 }, { hand: 'long', stock: 'skel', stockLen: 6, body: 'tan', furn: 'tan', rec: 9, hg: 'rail', hgLen: 8, bar: 3, mag: 'box', magN: 4, magPal: ['g', 'f', 'e'], handle: 'side' , topRail: true}],
  ['g36c', 'G36C', 'rifle', { fireInterval: 0.085, damage: 30 }, { hand: 'long', stock: 'skel', stockLen: 6, rec: 10, hg: 'slim', hgLen: 6, bar: 3, mag: 'curve', magN: 5, magPal: ['b', 'e', 'f'], carry: true, carryLen: 9 }],
  ['famas', 'FAMAS', 'rifle', { fireInterval: 0.065, damage: 30, magSize: 25 }, { hand: 'long', stock: 'bullpup', stockLen: 10, rec: 6, hg: 'slim', hgLen: 6, bar: 4, mag: 'stanag', magN: 5, bullpup: true, magBack: 6, carry: true, carryLen: 13, furn: 'black', gripAt: 0 }],
  ['aug', 'AUG', 'rifle', { fireInterval: 0.085, damage: 32, spread: 0.038 }, { hand: 'long', stock: 'bullpup', stockLen: 10, furn: 'olive', rec: 6, hg: 'slim', hgLen: 6, bar: 5, mag: 'stanag', magN: 5, magPal: ['b', 'e', 'f'], bullpup: true, magBack: 6, fgrip: true, fgripAt: 1, gripAt: 0, defaultAttach: { sight: 'holo' } }],
  ['hk416', 'HK416', 'rifle', { fireInterval: 0.09, damage: 33, climb: 0.13 }, { hand: 'long', stock: 'tube', stockLen: 7, rec: 9, hg: 'rail', hgLen: 9, bar: 3, mag: 'stanag', magN: 5 , topRail: true}],
  ['qbz95', 'QBZ-95', 'rifle', { fireInterval: 0.09, damage: 31 }, { hand: 'long', stock: 'bullpup', stockLen: 11, furn: 'olive', body: 'olive', rec: 6, hg: 'slim', hgLen: 5, bar: 5, mag: 'curve', magN: 5, bullpup: true, magBack: 6, carry: true, carryLen: 10, gripAt: 0 }],
  ['m16a4', 'M16A4', 'rifle', { burst: 3, fireInterval: 0.06, burstDelay: 0.28, damage: 35, spread: 0.035 }, { hand: 'long', stock: 'solid', stockLen: 7, rec: 9, hg: 'rail', hgLen: 11, bar: 5, mag: 'stanag', magN: 5 , topRail: true}],
  ['tar21', 'TAR-21', 'rifle', { fireInterval: 0.08, damage: 31 }, { hand: 'long', stock: 'bullpup', stockLen: 11, furn: 'tan', body: 'black', rec: 7, hg: 'slim', hgLen: 5, bar: 3, mag: 'stanag', magN: 5, bullpup: true, magBack: 6, gripAt: 0 , topRail: true}],

  // --- snipers ---
  ['awm', 'AWM', 'sniper', { ...BOLT, damage: 165 }, { hand: 'long', grip: 'wrist', stock: 'thumb', stockLen: 8, furn: 'olive', rec: 8, recH: 3, hg: 'none', bar: 14, thick: 2, brake: true, mag: 'box', magN: 2, action: 'bolt', bipod: true, bipodBack: 12, post: false, topRail: true }],
  ['m24', 'M24', 'sniper', { ...BOLT, noRack: false, reload: 'shells', shellTime: 0.42, damage: 140, shellColor: '#e8b84a', loadFrom: 'top' }, { hand: 'long', grip: 'wrist', stock: 'thumb', stockLen: 9, furn: 'tan', rec: 8, recH: 3, hg: 'none', bar: 15, mag: 'none', action: 'bolt', post: false }],
  ['dragunov', 'DRAGUNOV', 'sniper', { caliber: '7.62', fireInterval: 0.32, damage: 85, magSize: 10, pierce: 1, recoil: 3.5, shake: 2.5 }, { hand: 'long', noUnder: true, noRail: true, grip: 'wrist', stock: 'skel', stockLen: 9, furn: 'wood', rec: 10, hg: 'ak', hgLen: 7, bar: 9, mag: 'curve', magN: 4, handle: 'side', postAtMuzzle: true }],
  ['vss', 'VSS', 'sniper', { caliber: '7.62', auto: true, fireInterval: 0.085, damage: 42, magSize: 20, spread: 0.03, pierce: 0, recoil: 1.6, climb: 0.12, shake: 0.8, suppressed: true, speedMul: 1 }, { hand: 'long', noUnder: true, noRail: true, grip: 'wrist', stock: 'skel', stockLen: 8, furn: 'wood', rec: 9, hg: 'wood', hgLen: 4, bar: 10, supp: true, mag: 'box', magN: 4, handle: 'side' }],
  ['kar98k', 'KAR98K', 'sniper', { ...BOLT, noRack: false, reload: 'shells', shellTime: 0.42, damage: 150, shellColor: '#e8b84a', loadFrom: 'top' }, { hand: 'long', grip: 'wrist', classic: true, stock: 'wood', stockLen: 9, drop: 1, furn: 'wood', rec: 8, recH: 3, hg: 'wood', hgLen: 12, bar: 5, mag: 'none', action: 'bolt', postAtMuzzle: true }],
  ['m82a1', 'M82A1', 'sniper', { caliber: '.50', fireInterval: 0.45, damage: 220, magSize: 10, pierce: 4, recoil: 6, climb: 0.6, shake: 5, reloadTime: 2.6, speedMul: 0.85 }, { hand: 'long', stock: 'solid', stockLen: 8, rec: 12, recH: 5, hg: 'vent', hgLen: 9, bar: 6, thick: 2, brake: true, mag: 'box', magN: 4, magAt: 7, bipod: true, carry: true, carryLen: 6 }],
  ['barrett', 'BARRETT M82', 'sniper', { caliber: '.50', fireInterval: 0.45, damage: 225, magSize: 10, pierce: 4, recoil: 6, climb: 0.6, shake: 5, reloadTime: 2.6, speedMul: 0.85 }, { hand: 'long', stock: 'solid', stockLen: 8, body: 'tan', furn: 'tan', rec: 12, recH: 5, hg: 'vent', hgLen: 9, bar: 7, brake: true, mag: 'box', magN: 4, magAt: 7, bipod: true }],
  ['sv98', 'SV-98', 'sniper', { ...BOLT, damage: 150, magSize: 10 }, { hand: 'long', grip: 'wrist', stock: 'thumb', stockLen: 9, furn: 'black', rec: 8, recH: 3, hg: 'slim', hgLen: 6, bar: 10, mag: 'box', magN: 3, action: 'bolt', cheek: true, post: false , topRail: true}],
  ['ax50', 'AX-50', 'sniper', { ...BOLT, caliber: '.50', damage: 260, pierce: 5, recoil: 6, shake: 5, speedMul: 0.88 }, { hand: 'long', stock: 'skel', stockLen: 9, furn: 'grey', body: 'black', rec: 9, recH: 4, hg: 'rail', hgLen: 9, bar: 8, brake: true, mag: 'box', magN: 4, action: 'bolt', post: false , topRail: true}],
  ['m200', 'M200', 'sniper', { ...BOLT, caliber: '.50', damage: 240, magSize: 7, pierce: 5, recoil: 6, shake: 5, speedMul: 0.88 }, { hand: 'long', stock: 'tube', stockLen: 9, rec: 9, recH: 4, hg: 'vent', hgLen: 12, bar: 5, brake: true, mag: 'box', magN: 3, action: 'bolt', bipod: true, post: false , topRail: true}],

  // --- shotguns ---
  ['m870', 'M870', 'shotgun', { ...PUMP }, { hand: 'long', shotgun: true, stock: 'wood', stockLen: 6, furn: 'wood', rec: 8, hg: 'none', bar: 14, mag: 'tube', pump: true, pumpAt: 1, pumpLen: 6, post: false, bead: true }],
  ['spas12', 'SPAS-12', 'shotgun', { ...PUMP, magSize: 8, damage: 25 }, { hand: 'long', shotgun: true, stock: 'fold', stockLen: 6, rec: 8, hg: 'vent', hgLen: 9, bar: 4, mag: 'tube', pump: true, pumpAt: 1, pumpLen: 7, post: false , bead: true}],
  ['aa12', 'AA-12', 'shotgun', { reload: 'mag', reloadTime: 2.4, auto: true, fireInterval: 0.2, magSize: 20, damage: 18, spread: 0.22, recoil: 2.5, climb: 0.2 }, { hand: 'long', shotgun: true, stock: 'solid', stockLen: 6, rec: 11, recH: 5, hg: 'body', hgLen: 6, bar: 3, mag: 'drum', magAt: 5, carry: true, carryLen: 12, handle: 'none' }],
  ['m1014', 'M1014', 'shotgun', { ...SEMI_SHOTGUN, magSize: 7 }, { hand: 'long', shotgun: true, stock: 'tube', stockLen: 7, rec: 8, hg: 'slim', hgLen: 7, bar: 5, mag: 'tube', handle: 'none' , bead: true}],
  ['s12k', 'S12K', 'shotgun', { reload: 'mag', reloadTime: 2, fireInterval: 0.24, magSize: 8, damage: 22 }, { hand: 'long', shotgun: true, stock: 'fold', stockLen: 6, rec: 9, hg: 'ak', hgLen: 6, bar: 3, mag: 'box', magN: 4, handle: 'side' }],
  ['usas12', 'USAS-12', 'shotgun', { reload: 'mag', reloadTime: 2.2, auto: true, fireInterval: 0.17, magSize: 10, damage: 20, spread: 0.22, climb: 0.25 }, { hand: 'long', shotgun: true, stock: 'solid', stockLen: 6, rec: 10, recH: 5, hg: 'slim', hgLen: 6, bar: 4, mag: 'box', magN: 5, carry: true, carryLen: 10 }],
  ['saiga12', 'SAIGA-12', 'shotgun', { reload: 'mag', reloadTime: 2, fireInterval: 0.22, magSize: 8, damage: 22 }, { hand: 'long', shotgun: true, stock: 'solid', stockLen: 7, rec: 10, hg: 'ak', hgLen: 7, bar: 5, mag: 'curve', magN: 5, handle: 'side' }],
  ['ks23', 'KS-23', 'shotgun', { ...PUMP, pellets: 10, damage: 30, magSize: 4, spread: 0.26, recoil: 5, shake: 4 }, { hand: 'long', grip: 'wrist', classic: true, shotgun: true, stock: 'wood', stockLen: 7, furn: 'wood', rec: 9, recH: 5, hg: 'none', bar: 13, thick: 3, mag: 'tube', pump: true, pumpAt: 2, pumpLen: 7 , bead: true}],
  ['r870', 'R870', 'shotgun', { ...PUMP, spread: 0.24, damage: 23, magSize: 5 }, { hand: 'long', shotgun: true, stock: 'tube', stockLen: 6, rec: 8, hg: 'none', bar: 10, mag: 'tube', pump: true, pumpAt: 1, pumpLen: 6, furn: 'black' , bead: true}],
  ['dbs', 'DBS', 'shotgun', { ...BREAK_DOUBLE, magSize: 2, fireInterval: 0.16, damage: 26, pellets: 9, spread: 0.22 }, { hand: 'long', grip: 'wrist', classic: true, shotgun: true, double: true, stock: 'wood', stockLen: 7, drop: 1, furn: 'wood', rec: 6, hg: 'none', bar: 15, mag: 'none' , bead: true}],
  ['m1887', 'M1887', 'shotgun', { ...LEVER, magSize: 5, damage: 26, pellets: 8, spread: 0.21, fireInterval: 0.2, shellTime: 0.42 }, { hand: 'long', grip: 'wrist', classic: true, shotgun: true, lever: true, stock: 'wood', stockLen: 7, drop: 1, furn: 'wood', rec: 8, hg: 'wood', hgLen: 6, bar: 9, mag: 'tube', post: false , bead: true}],

  // --- LMGs ---
  ['m249', 'M249', 'lmg', { caliber: '5.56', fireInterval: 0.07, damage: 26 }, { hand: 'long', stock: 'skel', stockLen: 7, rec: 12, recH: 5, hg: 'rail', hgLen: 7, bar: 7, mag: 'beltbox', magAt: 6, carry: true, carryLen: 5, bipod: true , topRail: true}],
  ['rpk', 'RPK', 'lmg', { fireInterval: 0.1, damage: 36, magSize: 75 }, { hand: 'long', stock: 'wood', stockLen: 7, drop: 1, furn: 'wood', rec: 10, hg: 'ak', hgLen: 7, bar: 9, mag: 'bigdrum', magAt: 6, handle: 'side', bipod: true, postAtMuzzle: true }],
  ['m60', 'M60', 'lmg', { fireInterval: 0.1, damage: 40 }, { hand: 'long', stock: 'solid', stockLen: 8, rec: 12, recH: 5, hg: 'vent', hgLen: 8, bar: 9, mag: 'beltbox', magAt: 5, bipod: true, carry: true, carryLen: 4 }],
  ['pkp', 'PKP', 'lmg', { fireInterval: 0.085, damage: 38 }, { hand: 'long', stock: 'thumb', stockLen: 8, rec: 12, recH: 5, hg: 'shroud', hgLen: 10, bar: 5, mag: 'beltbox', magAt: 5, carry: true, carryLen: 5, bipod: true, handle: 'side' }],
  ['mg3', 'MG3', 'lmg', { fireInterval: 0.052, damage: 34, spread: 0.09 }, { hand: 'long', stock: 'solid', stockLen: 8, rec: 11, recH: 5, hg: 'shroud', hgLen: 13, bar: 2, mag: 'beltbox', magAt: 5, bipod: true }],
  ['lsat', 'LSAT', 'lmg', { caliber: '5.56', fireInterval: 0.075, damage: 28, magSize: 150 }, { hand: 'long', stock: 'tube', stockLen: 7, body: 'tan', furn: 'tan', rec: 11, recH: 5, hg: 'rail', hgLen: 8, bar: 6, mag: 'beltbox', magAt: 5, fgrip: true, fgripAt: 3 , topRail: true}],
  ['m240', 'M240', 'lmg', { fireInterval: 0.085, damage: 40 }, { hand: 'long', stock: 'skel', stockLen: 8, rec: 13, recH: 5, hg: 'rail', hgLen: 8, bar: 8, mag: 'beltbox', magAt: 5, carry: true, carryLen: 5, bipod: true }],
  ['rpd', 'RPD', 'lmg', { fireInterval: 0.09, damage: 36 }, { hand: 'long', stock: 'wood', stockLen: 8, drop: 1, furn: 'wood', rec: 10, hg: 'wood', hgLen: 6, bar: 12, mag: 'bigdrum', magAt: 6, bipod: true, postAtMuzzle: true, handle: 'side' }],
  ['mg42', 'MG42', 'lmg', { fireInterval: 0.048, damage: 34, spread: 0.095, magSize: 75 }, { hand: 'long', stock: 'solid', stockLen: 8, furn: 'wood', rec: 10, recH: 5, hg: 'shroud', hgLen: 14, bar: 2, mag: 'bigdrum', magAt: 7, bipod: true, handle: 'side' }],
  ['hk21', 'HK21', 'lmg', { fireInterval: 0.08, damage: 38 }, { hand: 'long', stock: 'solid', stockLen: 7, rec: 11, hg: 'slim', hgLen: 8, bar: 6, mag: 'beltbox', magAt: 5, bipod: true, irons: true, postAtMuzzle: true }],
];

// Ammo item per calibre (the inventory item that feeds the gun).
export const CALIBERS = ['9mm', '.45', '5.56', '7.62', '.308', '.50', '12g'];
