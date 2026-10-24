// Guns made (or redrawn) in the gun editor (editor.html). Each is a JSON file
// in assets/guns/, listed in assets/guns/index.json; they're loaded before the
// gun art and stats are built, so a custom gun is a gun like any other - and
// one with the key of a built-in gun replaces it.
//
// File format (what the editor saves):
//   key, name, cls ('pistol' | 'smg' | 'rifle' | 'sniper' | 'shotgun' | 'lmg'), base (gun it started from)
//   stats: { damage, fireInterval, magSize, reloadTime, shellTime, auto, burst, pellets, spread, recoil, climb, caliber }
//   reload: 'mag' | 'shells' | 'steps' (steps: the base gun's break-open / revolver timeline)
//   action: 'none' | 'pump' | 'bolt' | 'lever'   what has to be worked after each shot
//   loadFrom: 'below' | 'top'                    where shells go in (shell reloads)
//   rack: whether a mag reload ends by pulling the charging handle
//   pal: extra colours { char: '#rrggbb' } on top of the gun palette
//   art: { parts: { name: { x, y, rows } }, order, points, slots, bolt, slide, pump, ... }
//        (the same as a hand-drawn gun in gunart.js)

async function load() {
  try {
    const idx = await fetch('assets/guns/index.json', { cache: 'no-store' });
    if (!idx.ok) return [];
    const keys = await idx.json();
    const guns = await Promise.all(keys.map((k) => fetch(`assets/guns/${k}.json`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
    return guns.filter((g) => g?.key && g.art?.parts);
  } catch {
    return [];
  }
}

export const CUSTOM_GUNS = await load();
