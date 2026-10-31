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

Skills: YOUR SKILL and BOT SKILLS (RANDOM, one of them, or NONE) are picked
from a list (the setup screen, and the room for online); SKILLS (Q) OFF turns
them all off. In a match, the box at the bottom right shows your skill and
whether it's READY, in use, or how long the wait is. Bots use theirs
(`useSkill` in `src/arena/ai.js`), and with nobody in sight (you're cloaked,
say) they search where they last saw you, pick things up, roam and hop.

There's no game server: players connect to each other directly (WebRTC),
introduced through Trystero over public Nostr relays (`src/arena/net.js`; the
library comes from jsDelivr, pinned). A "server" is a region: a couple of
relays there (THAILAND - Chon Buri; SINGAPORE; JAPAN; EUROPE), picked by
their IP's location and their ping from Thailand. The server screen pings
each one live and recommends the nearest. Public relays come and go - if one
stops answering, swap it in `SERVERS` (check it with a two-tab test: both
should see each other in its lobby).

The host's browser runs the game; the others send their controls and draw
the state the host sends 20 times a second - only what changed - plus the
effects that went off (`src/arena/online.js`). A hidden tab gets no frames,
so online a worker keeps time instead (`backupClock` in `src/arena/main.js`)
and the game runs on at full speed with the host's tab in the background or
minimised; and however slowly frames come, the game makes up the time in
1/30 s steps (`runFor`). The host leaving ends the room. Some networks (strict NATs, some mobile data) can't
connect directly; that would need a TURN relay, which isn't set up.

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
