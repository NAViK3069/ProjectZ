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

How a player's screen keeps up with the host's game (`src/arena/online.js`;
the top of the file has the short version):

- **Prediction:** each 1/60 s of play is a numbered command. It runs at once on
  a stand-in of the player's fighter (`runOwn`, `stepOwn`) and goes to the host,
  which runs the same commands in order at the same step (`updateRemotes`). Only
  controls go in: the host is never told where anyone is, and can't be sped up by
  sending more (`bank`).
- **Reconciliation:** the host's word on their fighter comes back with the number
  of the last command it's run. The stand-in goes there and runs the commands not
  yet heard back about again (`reconcile`). Normally that lands on the same spot;
  a knock or a black hole's pull comes out in it, and any difference is eased away.
- **Interpolation:** everyone else is drawn a little in the past, between two
  states. How far (`N.delay`) follows how unevenly states really arrive.
- **What's in hand:** gun, melee swing, slot and throw run at once on the player's
  screen too (`stepOwn`; hits don't count there). Shots have the same spread on both
  ends (`shotSeed`). The host's word on what's in hand waits until it's run
  everything the player's done (`N.combatSeq`, `N.deferred`).
- **Lag compensation:** a player's shot or melee hit is judged against where they
  saw everyone (`pastOf`, at most `MAX_REWIND` back).
- **Skills are still the host's:** starting one waits a trip there and back; once
  it's going its movement (the grapple's reel, a dash) is predicted like the rest.

Testing a bad connection: `?lag=40&jitter=25` on both pages holds back everything
each one sends. F9 in a match, or `arena.online.netStats`, shows messages and bytes
a second, how far behind others are drawn, jitter, commands unheard, and FIX (how far
the last correction moved the player - it should stay near 0).

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

The host's browser runs the game; the others send commands and get states
30 times a second (20 with more than 5 in the room, to stay under Photon's 500
messages a second in a room). A state has only what's changed (`changed`, with a
rule per field for what each screen can carry on by itself; `Fighter.coast`). A
shot's sent once, and each screen carries it on; how far it got is sent when it
ends. A hidden tab gets no frames, so online a worker keeps time instead
(`backupClock` in `src/arena/main.js`) and the game runs on at full speed with
the host's tab in the background or minimised; and however slowly frames come,
the game makes up the time in 1/30 s steps (`runFor`).

If the host's connection or tab goes, the first of the others in the room takes it
over (`hostGone`): the match is over, as the game ran on that machine, but the room,
its slots and its settings carry on. CLOSE THE ROOM still ends it for everyone. A
player whose connection drops is taken back in by themselves (`getBack`), keeps their
id for the tab (`sessionStorage`), and the host keeps their seat for `SEAT_HOLD` s,
so a reload can also come back to it from the lobby.

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
