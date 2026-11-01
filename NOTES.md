# ProjectZ notes

## Where things stand

The game is now **ARENA**: the side-view brawler in the research lab
(Superfighters / Gun Mayhem style). It's the front page, `index.html`, and
`start.bat` opens it.

It opens on a main menu: STORY, SINGLE PLAYER, MULTIPLAYER and TRAINING (the
gun editor, `editor.html`, is off the menu). SINGLE PLAYER (you against bots, after the room setup),
MULTIPLAYER (online rooms, below) and TRAINING (every gun, melee weapon and
skill from the cabinets or TAB, dummies to try them on) are built; STORY shows
a "coming soon" page (`MODES` in `src/arena/main.js`).

## Playing online

It's on GitHub Pages: https://navik3069.github.io/ProjectZ/ (the repo's `main`
branch, served as it is - there's no build step; `.nojekyll` keeps Pages from
touching it). Push to `main` and it's live a minute later.

MULTIPLAYER: choose a server, then make a room or join one from the list, set
it up, everyone READY, the host STARTs. A room has 8 slots in two columns (in
TEAMS, the left BLUE and the right RED - JOIN on a side's banner moves you
over; each side wears its colour and starts on its own half of the map); the
host opens or closes each one or puts a bot in it - the only bots are the
ones in slots - and players click an open slot to move to it. A room that's
playing (or full) can still be joined, to watch (A / D or a click switches
who); at the end of the match the watchers get the open slots. Hold TAB in a
match for the scores. CREATE ROOM asks for a name and an optional password
(a padlock in the room list; joining asks for it - only the host checks it).
The host can rename the room or change the password from the room.
On a player's slot the host has KICK (out, and not back for a minute) and
HOST (they take the room over - it keeps its name, `rid`, so the lobby and
everyone in it carry on); both ask SURE? first. In a match, ESC: the host
can END THE MATCH (everyone back to the room) or CLOSE THE ROOM (twice); a
player can go BACK TO THE ROOM (out of that match, WATCH it from there).

The others draw everyone a moment behind the host's latest state, eased
between states (`clientFrame`), so movement stays smooth however unevenly
states arrive; the moment grows with the gaps between them.

A player's own fighter isn't waited for: a stand-in of it runs the movement
on their own screen at once (`predict` in `src/arena/online.js`) and where
it is goes to the host with their controls, which the host takes (unless
it's far off, or something the host runs is moving them - a dash, the
grapple, a lunge, a respawn). Shots, hits, health and skills stay the host's.

Skills: YOUR SKILL and BOT SKILLS (RANDOM, one of them, or NONE) are picked
from a list (the setup screen, and the room for online); SKILLS (Q) OFF turns
them all off. In a match, the box at the bottom right shows your skill and
whether it's READY, in use, or how long the wait is. Bots use theirs
(`useSkill` in `src/arena/ai.js`), and with nobody in sight (you're cloaked,
say) they search where they last saw you, pick things up, roam and hop.

Everything online goes through Photon (Photon Realtime, its cloud;
`src/arena/net.js`). The app is "ProjectZ" in the Photon dashboard (App ID in
`net.js`; it's not a secret - every Photon web game has its App ID in the
page). The free plan allows 20 players online at once across the whole game.
A "server" is a Photon region (SINGAPORE, HONG KONG, JAPAN, KOREA, INDIA,
EUROPE); the server screen estimates each one's ping and recommends the
nearest. The lobby is Photon's list of rooms in that region; a room's lobby
details (name, mode, map, players, locked, host) are the room's properties,
kept up by its host. The SDK is a copy in `src/vendor/photon-realtime.js`
(the npm package "photon-realtime" 4.4.0, its Node-only tail cut off), loaded
the first time you go online. Players on a different `APP_VERSION` don't meet.

The host's browser runs the game; the others send their controls and draw
the state the host sends 20 times a second - only what changed - plus the
effects that went off (`src/arena/online.js`). A hidden tab gets no frames,
so online a worker keeps time instead (`backupClock` in `src/arena/main.js`)
and the game runs on at full speed with the host's tab in the background or
minimised; and however slowly frames come, the game makes up the time in
1/30 s steps (`runFor`). The host leaving ends the room (HOST hands it over
first). Our own shots come in from the host already on their way; each is
drawn coming out of the gun and catching up in 0.12 s (`N.shots`).
Between the host's states, each screen carries on what only moves with
time - limbs, the gun's kick and flash, a reload's motion, a swing, a
skill building up (`Fighter.coast`) - and eases the others' aim, so it all
moves at the screen's rate. A player's own gun fires and starts reloading on
their screen at once (the host fires the real shot); for a moment after,
their ammo and reload stand over the host's not-yet-updated copy.

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
- `src/ui/` except `font.js` and `kit.js` (HUD, menus, inventory screen, armory)
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

The Arena's own code is all in `src/arena/`, plus `src/ui/kit.js` - the look of
every Arena menu (panels, buttons, the setting rows, the bigger 5x7 font from
`font.js`), so a new screen matches the others by using it.

### Links between the pages

- `src/main.js`: the top-down title menu has an ARENA item -> `index.html`.
- `src/editor/editor.js`: TEST opens `topdown.html?gun=<key>#training`;
  the back button goes to `index.html` (the Arena).
