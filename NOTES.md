# ProjectZ notes

## Where things stand

The game is now **ARENA**: the side-view brawler in the research lab
(Superfighters / Gun Mayhem style). It's the front page, `index.html`, and
`start.bat` opens it.

## The 2.5D top-down game is shelved, not deleted

The original top-down zombie shooter (survive the lab in rounds, a training
range, the gun shop / armory, the inventory) still works. It's just off the
menus so it doesn't get in the way while the Arena gets the attention.

- **To play it:** run the server (`start.bat` or `node server.js`) and open
  `http://localhost:5173/topdown.html`. Its training range is
  `topdown.html#training`.
- **Nothing links to it** from the Arena. The gun editor's TEST button still
  opens a gun in its training range, since that's the only place to fire
  one at targets.
- **To bring it back to the front:** swap the pages back (`topdown.html` ->
  `index.html`, the Arena to its own page) and update the links listed
  below.

### Its files

These belong to the top-down game only:

- `topdown.html`, `src/main.js` (its game loop, menus, rounds)
- `src/world/` (the 2.5D lab and training maps, props, gun cases)
- `src/entities/player.js`, `zombie.js`, `zombieart.js`, `dummy.js`
- `src/fx/lighting.js`
- `src/game/` (rounds, hazards, inventory, items, loot)
- `src/ui/` except `font.js` (HUD, menus, inventory screen, armory)
- `src/combat/bullets.js`, `explosives.js`, `throwables.js`, `spec.js`

### Shared with the Arena (careful when changing them)

The Arena reuses these, so a change here changes both games:

- `src/engine/` (renderer, input, pixel helpers)
- `src/ui/font.js`
- `src/entities/rig.js` and the character art in `assets/player/`
- `src/combat/gunart.js`, `gunbuild.js`, `catalog.js`, `weapons.js`,
  `melee.js`, `customguns.js` (all the guns and melee weapons, and the gun
  editor's guns in `assets/guns/`)
- `src/fx/particles.js` (only the top-down game draws with it, but it
  reads the shared gun art)

The Arena's own code is all in `src/arena/`.

### Links between the pages

- `src/main.js`: the top-down title menu has an ARENA item -> `index.html`.
- `src/editor/editor.js`: TEST opens `topdown.html?gun=<key>#training`;
  the back button goes to `index.html` (the Arena).
