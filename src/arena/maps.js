// The arena maps. Each builds its grid (row / fill / ladder), lamps, back-wall
// fittings, the props standing about (crates, drums, furniture - all of them
// break), and where everyone spawns - eight spots, four each side (in TEAMS,
// BLUE starts on the left, RED on the right). Rows count down from the top; a prop
// "on row r" stands on the floor whose top is row r.
//
// Made for up to eight, and to get about in: a jump gets you up 3 rows (a double jump, 6), so floors are
// joined by ladders and by catwalks 3 rows apart, several ways round each. A jump pad (L.pad) throws you up
// about 8 rows. The props stand mostly by the walls, not across the way.

import { SOLID, PLAT, ACID, EMPTY, LOW } from './level.js';

export const MAPS = {
  // Four floors of labs round an acid vat, big enough for eight. Each floor can be reached several ways:
  // a ladder at each end and in the middle of each wing, hops up the catwalks over the vat, a jump pad.
  lab: {
    name: 'THE LAB', w: 84, h: 34, theme: 'lab', desc: 'FOUR FLOORS ROUND AN ACID VAT',
    build(L) {
      L.shell();
      L.fill(1, 30, 82, 32, SOLID);                                                // the ground
      L.fill(30, 30, 53, 31, EMPTY); L.row(31, 30, 53, ACID);                      // the vat
      L.row(27, 32, 38, PLAT); L.row(27, 45, 51, PLAT); L.row(24, 39, 44, PLAT);   // catwalks over it
      L.row(21, 35, 37, PLAT); L.row(21, 46, 48, PLAT); L.row(18, 33, 50, PLAT);   // on up to the bridge
      L.row(23, 1, 24); L.row(23, 59, 82); L.row(23, 26, 31, PLAT); L.row(23, 52, 57, PLAT);   // second floor
      L.row(16, 1, 29); L.row(16, 54, 82);                                         // third floor
      L.row(13, 30, 33, PLAT); L.row(13, 50, 53, PLAT);                            // (ledges off it)
      L.row(9, 1, 5); L.row(9, 8, 26); L.row(9, 36, 47); L.row(9, 57, 75); L.row(9, 78, 82);   // the top floor
      L.row(5, 28, 34, PLAT); L.row(5, 49, 55, PLAT);
      for (const x of [10, 22, 61, 73]) L.ladder(x, 23, 29);
      for (const x of [6, 20, 63, 77]) L.ladder(x, 16, 22);
      for (const x of [3, 12, 22, 61, 71, 80]) L.ladder(x, 9, 15);
      L.ladder(41, 9, 17); L.ladder(31, 5, 12); L.ladder(52, 5, 12);
      L.fill(15, 28, 16, 29, SOLID); L.fill(67, 28, 68, 29, SOLID);                // something to hide behind
      L.fill(14, 21, 15, 22, SOLID); L.fill(68, 21, 69, 22, SOLID);
      L.fill(25, 14, 26, 15, SOLID); L.fill(57, 14, 58, 15, SOLID);
      L.fill(16, 7, 17, 8, SOLID); L.fill(66, 7, 67, 8, SOLID);
      L.pad(28, 30); L.pad(55, 30); L.pad(28, 16); L.pad(55, 16);
      for (const [x, y] of [[8, 1], [24, 1], [42, 1], [60, 1], [75, 1], [10, 10], [25, 10], [41, 10], [60, 10], [74, 10], [8, 17], [24, 17], [59, 17], [75, 17], [12, 24], [26, 24], [57, 24], [71, 24], [41, 19]]) L.lamp(x, y);
      L.deco.push(
        { kind: 'monitors', x: 11, y: 5.2 }, { kind: 'monitors', x: 68, y: 5.2 }, { kind: 'reactor', x: 38, y: 3.5 },
        { kind: 'server', x: 1.5, y: 10.4 }, { kind: 'server', x: 81, y: 10.4 }, { kind: 'server', x: 27, y: 10.4 },
        { kind: 'tank', x: 8, y: 18.5 }, { kind: 'tank', x: 17, y: 18.5 }, { kind: 'tank', x: 66, y: 18.5 }, { kind: 'tank', x: 74, y: 18.5 },
        { kind: 'window', x: 3, y: 25 }, { kind: 'window', x: 76, y: 25 }, { kind: 'door', x: 25, y: 26.2 }, { kind: 'door', x: 57, y: 26.2 },
        { kind: 'sign', x: 18, y: 25, text: 'LAB-07' }, { kind: 'sign', x: 62, y: 25, text: 'BIOHAZARD' }, { kind: 'sign', x: 38, y: 14.5, text: 'CORE ACCESS' },
        { kind: 'vent', x: 13, y: 11 }, { kind: 'vent', x: 67, y: 11 }, { kind: 'pipes', y: 1 }, { kind: 'pipes', y: 17 },
      );
      for (const [k, x, y] of [['crate', 3, 30], ['wcrate', 4, 30], ['barrel', 24, 30], ['barrel', 59, 30], ['crate', 79, 30], ['wcrate', 80, 30], ['cabinet', 18, 30], ['cabinet', 64, 30],
        ['table', 8, 23], ['chair', 11, 23], ['barrel', 23, 23], ['barrel', 60, 23], ['table', 75, 23], ['chair', 72, 23],
        ['crate', 2, 16], ['locker', 9, 16], ['table', 14, 16], ['barrel', 23, 16], ['barrel', 60, 16], ['table', 68, 16], ['locker', 74, 16], ['crate', 81, 16],
        ['wcrate', 9, 9], ['table', 19, 9], ['crate', 37, 9], ['crate', 46, 9], ['table', 62, 9], ['wcrate', 74, 9]]) L.prop(k, x, y);
      L.spawn(4, 9); L.spawn(7, 16); L.spawn(5, 23); L.spawn(7, 30);
      L.spawn(79, 9); L.spawn(76, 16); L.spawn(78, 23); L.spawn(76, 30);
    },
  },

  // A warehouse: containers to hop along the floor, a mezzanine each side, long catwalks, ledges by the roof.
  warehouse: {
    name: 'WAREHOUSE', w: 88, h: 32, theme: 'warehouse', desc: 'CONTAINERS, MEZZANINES AND LONG CATWALKS',
    build(L) {
      L.shell();
      L.fill(1, 29, 86, 30, SOLID);
      L.fill(26, 26, 31, 28, SOLID); L.fill(56, 26, 61, 28, SOLID);                // containers
      L.row(26, 35, 37, PLAT); L.row(26, 50, 52, PLAT); L.row(23, 38, 49, PLAT);   // the big shelving unit
      L.row(22, 1, 18); L.row(22, 69, 86);                                         // mezzanines
      L.row(19, 20, 23, PLAT); L.row(19, 64, 67, PLAT); L.row(20, 28, 31, PLAT); L.row(20, 56, 59, PLAT);
      L.row(16, 8, 26, PLAT); L.row(16, 30, 57, PLAT); L.row(16, 61, 79, PLAT);    // the long catwalks
      L.row(10, 1, 14, PLAT); L.row(10, 30, 57, PLAT); L.row(10, 73, 86, PLAT);    // up by the roof
      for (const [x, a, b] of [[12, 22, 28], [75, 22, 28], [12, 16, 21], [75, 16, 21], [5, 10, 21], [82, 10, 21], [43, 16, 22], [35, 10, 15], [52, 10, 15]]) L.ladder(x, a, b);
      L.pad(22, 29); L.pad(65, 29); L.pad(28, 16 + 4);
      for (const x of [10, 24, 44, 63, 78]) L.lamp(x, 1);
      for (const [x, y] of [[6, 11], [81, 11], [18, 17], [44, 17], [70, 17], [5, 23], [82, 23]]) L.lamp(x, y);
      L.deco.push(
        { kind: 'shelves', x: 38, y: 24, w: 12, h: 5 }, { kind: 'shelves', x: 2, y: 17, w: 5, h: 5 }, { kind: 'shelves', x: 81, y: 17, w: 5, h: 5 },
        { kind: 'rollup', x: 18, y: 26 }, { kind: 'rollup', x: 66, y: 26 }, { kind: 'forklift', x: 8, y: 27.25 }, { kind: 'forklift', x: 77, y: 27.25 },
        { kind: 'sign', x: 40, y: 20, text: 'LOADING BAY' }, { kind: 'sign', x: 8, y: 19, text: 'NO SMOKING' }, { kind: 'sign', x: 70, y: 19, text: 'BAY 2' }, { kind: 'vent', x: 44, y: 5 }, { kind: 'vent', x: 20, y: 5 }, { kind: 'vent', x: 66, y: 5 },
      );
      for (const [k, x, y, lift] of [
        ['wcrate', 2, 29], ['wcrate', 3, 29], ['wcrate', 2, 29, 14], ['pallet', 33, 29], ['barrel', 40, 29], ['wcrate', 46, 29], ['pallet', 53, 29], ['wcrate', 84, 29], ['wcrate', 85, 29], ['wcrate', 85, 29, 14],
        ['crate', 28, 26], ['barrel', 59, 26], ['wcrate', 2, 22], ['crate', 15, 22], ['barrel', 17, 22], ['barrel', 70, 22], ['crate', 72, 22], ['wcrate', 85, 22],
        ['wcrate', 15, 16], ['wcrate', 40, 16], ['barrel', 48, 16], ['wcrate', 72, 16], ['crate', 3, 10], ['crate', 84, 10], ['wcrate', 44, 10],
      ]) L.prop(k, x, y, 0, lift ?? 0);
      L.spawn(6, 10); L.spawn(7, 22); L.spawn(15, 16); L.spawn(6, 29);
      L.spawn(81, 10); L.spawn(80, 22); L.spawn(72, 16); L.spawn(81, 29);
    },
  },

  // An office block, four storeys round an atrium: desks and cubicles to fight over, a ladder well at each end.
  office: {
    name: 'OFFICE', w: 84, h: 34, theme: 'office', desc: 'FOUR STOREYS ROUND AN ATRIUM',
    build(L) {
      L.shell();
      L.row(32, 1, 82);
      for (const y of [25, 17, 9]) { L.row(y, 1, 35); L.row(y, 48, 82); }
      L.row(29, 38, 45, PLAT); L.row(21, 38, 45, PLAT); L.row(13, 38, 45, PLAT);   // gratings across the atrium
      L.row(26, 36, 37, PLAT); L.row(26, 46, 47, PLAT); L.row(18, 36, 37, PLAT); L.row(18, 46, 47, PLAT); L.row(10, 36, 37, PLAT); L.row(10, 46, 47, PLAT);
      for (const x of [8, 30, 53, 75]) { L.ladder(x, 25, 31); L.ladder(x, 9, 16); }
      for (const x of [18, 33, 50, 65]) L.ladder(x, 17, 24);
      // low cubicle walls to jump over or hide behind
      for (const [x, y] of [[16, 30], [67, 30], [24, 23], [59, 23], [11, 23], [72, 23], [14, 15], [69, 15], [26, 15], [57, 15], [18, 7], [64, 7]]) L.fill(x, y, x, y + 1, SOLID);
      L.pad(41, 32);
      for (const x of [6, 22, 41, 60, 76]) { L.lamp(x, 1); L.lamp(x, 18); }
      for (const x of [10, 26, 56, 72]) { L.lamp(x, 10); L.lamp(x, 26); }
      L.deco.push(
        { kind: 'citywindow', x: 4, y: 3, w: 6, h: 2 }, { kind: 'citywindow', x: 25, y: 3, w: 6, h: 2 }, { kind: 'citywindow', x: 53, y: 3, w: 6, h: 2 }, { kind: 'citywindow', x: 74, y: 3, w: 6, h: 2 },
        { kind: 'citywindow', x: 20, y: 11, w: 5, h: 2 }, { kind: 'citywindow', x: 59, y: 11, w: 5, h: 2 }, { kind: 'citywindow', x: 3, y: 19, w: 6, h: 2 }, { kind: 'citywindow', x: 75, y: 19, w: 6, h: 2 },
        { kind: 'citywindow', x: 21, y: 27, w: 6, h: 2 }, { kind: 'citywindow', x: 57, y: 27, w: 6, h: 2 },
        { kind: 'whiteboard', x: 13, y: 4 }, { kind: 'whiteboard', x: 68, y: 12 }, { kind: 'whiteboard', x: 25, y: 20 }, { kind: 'clock', x: 41, y: 3 }, { kind: 'clock', x: 28, y: 11 },
        { kind: 'elevator', x: 40, y: 29.95 }, { kind: 'plantpot', x: 2, y: 6.95 }, { kind: 'plantpot', x: 80, y: 14.95 }, { kind: 'plantpot', x: 2, y: 22.95 }, { kind: 'plantpot', x: 80, y: 29.95 }, { kind: 'sign', x: 37, y: 24, text: 'ATRIUM' }, { kind: 'sign', x: 70, y: 28, text: 'EXIT' },
      );
      for (const [k, x, y] of [
        ['desk', 11, 9], ['chair', 14, 9], ['monitor', 11, 9], ['desk', 26, 9], ['monitor', 26, 9], ['desk', 56, 9], ['monitor', 56, 9], ['desk', 70, 9], ['chair', 73, 9], ['monitor', 70, 9], ['cooler', 34, 9], ['cooler', 49, 9],
        ['desk', 4, 17], ['monitor', 4, 17], ['bookshelf', 22, 17], ['cabinet', 28, 17], ['cabinet', 55, 17], ['bookshelf', 62, 17], ['desk', 77, 17], ['monitor', 77, 17],
        ['desk', 4, 25], ['chair', 7, 25], ['monitor', 4, 25], ['desk', 20, 25], ['monitor', 20, 25], ['cooler', 28, 25], ['cooler', 55, 25], ['desk', 62, 25], ['monitor', 62, 25], ['desk', 76, 25], ['monitor', 76, 25],
        ['cabinet', 3, 32], ['desk', 11, 32], ['monitor', 11, 32], ['bookshelf', 24, 32], ['barrel', 35, 32], ['barrel', 48, 32], ['bookshelf', 59, 32], ['desk', 71, 32], ['monitor', 71, 32], ['wcrate', 80, 32],
      ]) L.prop(k, x, y);
      L.spawn(4, 9); L.spawn(7, 17); L.spawn(13, 25); L.spawn(5, 32);
      L.spawn(79, 9); L.spawn(76, 17); L.spawn(70, 25); L.spawn(78, 32);
    },
  },

  // Rooftops at night: five buildings with planks over the gaps - fall and you're gone.
  rooftops: {
    name: 'ROOFTOPS', w: 96, h: 30, theme: 'roof', openBottom: true, desc: 'OUTDOORS AT NIGHT - MIND THE GAPS',
    build(L) {
      L.fill(0, 16, 18, 29, SOLID);    // A
      L.fill(23, 13, 38, 29, SOLID);   // B (tallest)
      L.fill(43, 17, 54, 29, SOLID);   // C
      L.fill(59, 14, 74, 29, SOLID);   // D
      L.fill(79, 17, 95, 29, SOLID);   // E
      L.row(16, 19, 22, PLAT); L.row(17, 39, 42, PLAT); L.row(17, 55, 58, PLAT); L.row(17, 75, 78, PLAT);   // planks over the gaps
      L.ladder(39, 12, 16); L.ladder(58, 13, 16);                                  // (and up the taller side)
      L.fill(27, 10, 32, 12, SOLID);                                               // the stair hut on B
      L.row(7, 25, 34, PLAT); L.ladder(24, 7, 12);                                 // the water tower's walkway
      L.row(8, 61, 72, PLAT); L.ladder(60, 8, 13);                                 // the billboard's catwalk
      L.row(11, 6, 12, PLAT); L.ladder(5, 11, 15);                                 // a scaffold on A
      L.row(12, 84, 90, PLAT); L.ladder(83, 12, 16);                               // and one on E
      L.row(14, 46, 50, PLAT);                                                     // an AC duct on C
      L.fill(14, 14, 15, 15, SOLID); L.fill(68, 12, 69, 13, SOLID);                // chimneys
      L.pad(52, 17); L.pad(2, 16); L.pad(93, 17);
      for (const [x, y] of [[3, 15], [16, 15], [36, 12], [45, 16], [53, 16], [62, 13], [73, 13], [81, 16], [93, 16]]) L.lamp(x, y, true);
      L.deco.push(
        { kind: 'watertower', x: 27, y: 0.5 }, { kind: 'billboard', x: 62, y: 1.1 }, { kind: 'antenna', x: 90, y: 13, h: 4 }, { kind: 'antenna', x: 10, y: 7, h: 4 },
        { kind: 'antenna', x: 48, y: 13, h: 4 }, { kind: 'sign', x: 44, y: 19, text: 'HOTEL' }, { kind: 'sign', x: 60, y: 16, text: 'CITY BANK' },
      );
      for (const [k, x, y] of [['ac', 8, 16], ['wcrate', 12, 16], ['barrel', 17, 16], ['ac', 34, 13], ['wcrate', 25, 13], ['barrel', 37, 13], ['wcrate', 30, 10], ['ac', 49, 17], ['wcrate', 45, 17], ['ac', 64, 14], ['wcrate', 72, 14], ['pallet', 62, 14], ['barrel', 73, 14], ['ac', 86, 17], ['wcrate', 81, 17], ['wcrate', 9, 11], ['wcrate', 88, 12]]) L.prop(k, x, y);
      L.spawn(6, 16); L.spawn(10, 11); L.spawn(27, 13); L.spawn(30, 7);
      L.spawn(89, 17); L.spawn(86, 12); L.spawn(70, 14); L.spawn(66, 8);
    },
  },

  // A building site at sunset: the half-built block in the middle, scaffolds either side, open ground round it.
  site: {
    name: 'BUILDING SITE', w: 92, h: 32, theme: 'site', desc: 'OUTDOORS - GIRDERS AND SCAFFOLDING',
    build(L) {
      L.fill(0, 30, 91, 31, SOLID);                                                // the ground
      L.fill(0, 0, 0, 29, SOLID); L.fill(91, 0, 91, 29, SOLID);                    // the fences
      L.wall(16, 8, 75, 29);                                                       // the block (brick behind its frame)
      L.row(23, 16, 75); L.row(23, 44, 47, PLAT);                                  // first floor
      L.row(16, 22, 69); L.row(16, 44, 47, EMPTY);                                 // second floor
      L.row(19, 44, 47, PLAT);
      L.row(9, 30, 61, PLAT);                                                      // the top beams
      L.row(26, 3, 10, PLAT); L.row(26, 81, 88, PLAT); L.row(20, 4, 12, PLAT); L.row(20, 79, 87, PLAT); L.row(23, 12, 15, PLAT); L.row(23, 76, 79, PLAT);   // scaffolds
      L.row(13, 8, 17, PLAT); L.row(13, 74, 83, PLAT); L.row(16, 18, 21, PLAT); L.row(16, 70, 73, PLAT);
      for (const [x, a, b] of [[8, 20, 29], [83, 20, 29], [10, 13, 19], [81, 13, 19], [18, 23, 29], [73, 23, 29], [34, 23, 29], [57, 23, 29], [26, 16, 22], [65, 16, 22], [40, 16, 22], [51, 16, 22], [34, 9, 15], [57, 9, 15]]) L.ladder(x, a, b);
      L.fill(24, 28, 25, 29, SOLID); L.fill(66, 28, 67, 29, SOLID); L.fill(44, 28, 47, 29, SOLID);
      L.fill(30, 21, 31, 22, SOLID); L.fill(60, 21, 61, 22, SOLID); L.fill(32, 14, 33, 15, SOLID); L.fill(58, 14, 59, 15, SOLID);
      L.pad(13, 30); L.pad(78, 30); L.pad(42, 23);
      for (const [x, y] of [[3, 29], [14, 29], [40, 29], [52, 29], [77, 29], [88, 29], [24, 22], [46, 22], [68, 22]]) L.lamp(x, y, true);
      L.deco.push({ kind: 'crane', x: 86, y: 2, h: 28 }, { kind: 'cones', x: 20, y: 29 }, { kind: 'cones', x: 71, y: 29 }, { kind: 'cones', x: 42, y: 29 }, { kind: 'sign', x: 40, y: 26, text: 'HARD HAT AREA' }, { kind: 'sign', x: 28, y: 19, text: 'DANGER' });
      for (const [k, x, y, lift] of [
        ['wcrate', 3, 30], ['pallet', 6, 30], ['sandbags', 21, 30], ['barrel', 28, 30], ['pipes', 37, 30], ['wcrate', 50, 30], ['wcrate', 51, 30], ['wcrate', 50, 30, 14], ['barrel', 62, 30], ['sandbags', 70, 30], ['pallet', 85, 30], ['wcrate', 88, 30],
        ['wcrate', 20, 23], ['barrel', 38, 23], ['pallet', 52, 23], ['toolbox', 56, 23], ['wcrate', 71, 23], ['wcrate', 28, 16], ['sandbags', 38, 16], ['barrel', 53, 16], ['wcrate', 63, 16], ['wcrate', 5, 20], ['wcrate', 85, 20], ['toolbox', 44, 9], ['sandbags', 12, 13], ['sandbags', 79, 13],
      ]) L.prop(k, x, y, 0, lift ?? 0);
      L.spawn(5, 30); L.spawn(6, 20); L.spawn(20, 23); L.spawn(24, 16);
      L.spawn(86, 30); L.spawn(84, 20); L.spawn(71, 23); L.spawn(67, 16);
    },
  },

  // The reactor hall: a great shaft with the core down its middle and acid under it, galleries stepping up each side.
  reactor: {
    name: 'REACTOR', w: 80, h: 36, theme: 'lab', desc: 'GALLERIES ROUND THE CORE, ACID BELOW',
    build(L) {
      L.shell();
      L.fill(1, 33, 78, 34, SOLID); L.fill(25, 33, 54, 33, EMPTY); L.row(34, 25, 54, ACID);   // the floor, the pool
      L.fill(36, 31, 43, 33, SOLID);                                               // the core's foot, an island in the pool
      L.row(31, 27, 31, PLAT); L.row(31, 48, 52, PLAT);
      L.row(26, 1, 22); L.row(26, 57, 78); L.row(28, 24, 26, PLAT); L.row(28, 53, 55, PLAT);
      L.row(24, 30, 49, PLAT); L.row(27, 32, 34, PLAT); L.row(27, 45, 47, PLAT);   // the ring round the core
      L.row(19, 8, 28); L.row(19, 51, 71); L.row(21, 30, 31, PLAT); L.row(21, 48, 49, PLAT);
      L.row(18, 34, 45); L.row(12, 1, 18); L.row(12, 61, 78);
      L.row(15, 20, 24, PLAT); L.row(15, 55, 59, PLAT); L.row(11, 26, 53, PLAT);   // the gantry over it all
      for (const [x, a, b] of [[8, 26, 32], [20, 26, 32], [59, 26, 32], [71, 26, 32], [12, 19, 25], [24, 19, 25], [55, 19, 25], [67, 19, 25], [5, 12, 25], [74, 12, 25], [14, 12, 18], [65, 12, 18], [39, 18, 23], [39, 11, 17]]) L.ladder(x, a, b);
      L.fill(15, 24, 16, 25, SOLID); L.fill(63, 24, 64, 25, SOLID); L.fill(19, 17, 20, 18, SOLID); L.fill(59, 17, 60, 18, SOLID);
      L.pad(3, 33); L.pad(76, 33); L.pad(25, 19);L.pad(54, 19);
      for (const [x, y] of [[8, 1], [24, 1], [40, 1], [56, 1], [72, 1], [6, 13], [15, 13], [64, 13], [73, 13], [12, 20], [24, 20], [55, 20], [67, 20], [8, 27], [20, 27], [59, 27], [71, 27], [31, 25], [48, 25]]) L.lamp(x, y);
      L.deco.push(
        { kind: 'reactor', x: 37, y: 3 }, { kind: 'reactor', x: 37, y: 25.2 }, { kind: 'tank', x: 10, y: 7.3 }, { kind: 'tank', x: 67, y: 7.3 }, { kind: 'tank', x: 3, y: 21.3 }, { kind: 'tank', x: 75, y: 21.3 },
        { kind: 'server', x: 26, y: 13.4 }, { kind: 'server', x: 52, y: 13.4 }, { kind: 'monitors', x: 16, y: 15 }, { kind: 'monitors', x: 60, y: 15 },
        { kind: 'sign', x: 34, y: 15, text: 'CORE - KEEP OUT' }, { kind: 'sign', x: 9, y: 22, text: 'GALLERY A' }, { kind: 'sign', x: 62, y: 22, text: 'GALLERY B' }, { kind: 'vent', x: 28, y: 6 }, { kind: 'vent', x: 50, y: 6 }, { kind: 'pipes', y: 20 },
      );
      for (const [k, x, y] of [['crate', 12, 33], ['wcrate', 17, 33], ['barrel', 23, 33], ['barrel', 56, 33], ['wcrate', 62, 33], ['crate', 67, 33], ['crate', 2, 26], ['table', 17, 26], ['table', 61, 26], ['crate', 77, 26],
        ['barrel', 10, 19], ['locker', 16, 19], ['locker', 63, 19], ['barrel', 69, 19], ['wcrate', 37, 18], ['wcrate', 42, 18], ['crate', 2, 12], ['table', 9, 12], ['table', 69, 12], ['crate', 77, 12], ['barrel', 33, 11], ['barrel', 46, 11]]) L.prop(k, x, y);
      L.spawn(4, 12); L.spawn(10, 19); L.spawn(5, 26); L.spawn(6, 33);
      L.spawn(75, 12); L.spawn(69, 19); L.spawn(74, 26); L.spawn(73, 33);
    },
  },

  // A freight yard at dusk: rows of containers to climb, a loading gantry the length of it overhead.
  yard: {
    name: 'FREIGHT YARD', w: 100, h: 30, theme: 'site', desc: 'OUTDOORS - CONTAINERS UNDER A GANTRY',
    build(L) {
      L.fill(0, 28, 99, 29, SOLID);
      L.fill(0, 0, 0, 27, SOLID); L.fill(99, 0, 99, 27, SOLID);
      // containers, one and two high: three rows each, so one jump gets up a level
      for (const [x0, x1, top] of [[8, 14, 25], [18, 26, 25], [18, 22, 22], [34, 40, 25], [46, 53, 25], [46, 49, 22], [59, 65, 25], [73, 81, 25], [77, 81, 22], [85, 91, 25]]) L.fill(x0, top, x1, top + 2, SOLID);
      L.row(16, 2, 97, PLAT);                                                      // the gantry
      L.row(19, 28, 32, PLAT); L.row(19, 67, 71, PLAT); L.row(19, 42, 44, PLAT); L.row(19, 55, 57, PLAT); L.row(22, 28, 31, PLAT); L.row(22, 68, 71, PLAT);
      L.row(10, 20, 34, PLAT); L.row(10, 65, 79, PLAT); L.row(10, 44, 55, PLAT);   // the crane rails
      for (const [x, a, b] of [[4, 16, 27], [95, 16, 27], [33, 16, 27], [66, 16, 27], [50, 16, 24], [22, 10, 15], [77, 10, 15], [50, 10, 15]]) L.ladder(x, a, b);
      L.pad(16, 28); L.pad(83, 28); L.pad(43, 28); L.pad(56, 28);
      for (const [x, y] of [[2, 27], [15, 27], [31, 27], [42, 27], [56, 27], [70, 27], [84, 27], [97, 27]]) L.lamp(x, y, true);
      L.deco.push(
        { kind: 'crane', x: 12, y: 2, h: 26 }, { kind: 'crane', x: 86, y: 2, h: 26 }, { kind: 'cones', x: 29, y: 27 }, { kind: 'cones', x: 69, y: 27 }, { kind: 'cones', x: 41, y: 27 },
        { kind: 'sign', x: 46, y: 13, text: 'FREIGHT YARD 3' }, { kind: 'sign', x: 9, y: 26, text: 'HEAVY LOAD' }, { kind: 'sign', x: 74, y: 26, text: 'BAY 7' },
      );
      for (const [k, x, y, lift] of [['wcrate', 2, 28], ['pallet', 6, 28], ['barrel', 29, 28], ['sandbags', 31, 28], ['wcrate', 38, 28], ['pipes', 61, 28], ['barrel', 68, 28], ['sandbags', 70, 28], ['pallet', 93, 28], ['wcrate', 97, 28],
        ['wcrate', 10, 25], ['barrel', 24, 25], ['crate', 38, 25], ['barrel', 52, 25], ['crate', 62, 25], ['wcrate', 75, 25], ['wcrate', 89, 25], ['wcrate', 20, 22], ['wcrate', 47, 22], ['barrel', 79, 22],
        ['wcrate', 12, 16], ['barrel', 40, 16], ['wcrate', 60, 16], ['barrel', 88, 16], ['wcrate', 28, 10], ['wcrate', 72, 10]]) L.prop(k, x, y, 0, lift ?? 0);
      L.spawn(6, 16); L.spawn(11, 25); L.spawn(20, 22); L.spawn(6, 28);
      L.spawn(93, 16); L.spawn(88, 25); L.spawn(79, 22); L.spawn(93, 28);
    },
  },

  // A subway station: three platforms with the tracks between, a carriage standing at each (walk through it, or run along
  // its roof), the concourse above, the street level up top.
  metro: {
    name: 'SUBWAY', w: 96, h: 30, theme: 'metro', desc: 'PLATFORMS, TRACKS AND A CONCOURSE',
    build(L) {
      L.shell();
      L.fill(1, 27, 94, 28, SOLID);                                                // the track bed
      for (const [x0, x1] of [[1, 30], [42, 53], [65, 94]]) L.fill(x0, 24, x1, 26, SOLID);   // the platforms
      for (const [x0, x1] of [[33, 40], [55, 62]]) { L.row(22, x0, x1); L.fill(x0, 23, x0, 24, SOLID); L.fill(x1, 23, x1, 24, SOLID); }   // the carriages
      L.row(18, 1, 26); L.row(18, 69, 94); L.row(18, 38, 57, PLAT);                // the concourse, the bridge
      L.row(16, 28, 35, PLAT); L.row(16, 60, 67, PLAT); L.row(13, 24, 31, PLAT); L.row(13, 64, 71, PLAT);
      L.row(10, 1, 20); L.row(10, 75, 94); L.row(10, 40, 55, PLAT);                // the street level
      for (const x of [31, 41, 54, 64]) L.ladder(x, 24, 26);                       // up out of the tracks
      for (const x of [8, 22, 73, 87]) L.ladder(x, 18, 23);
      for (const x of [4, 16, 79, 91]) L.ladder(x, 10, 17);
      L.ladder(47, 18, 23); L.ladder(47, 10, 17);
      L.fill(14, 22, 15, 23, SOLID); L.fill(80, 22, 81, 23, SOLID); L.fill(11, 16, 12, 17, SOLID); L.fill(83, 16, 84, 17, SOLID); L.fill(9, 8, 10, 9, SOLID); L.fill(85, 8, 86, 9, SOLID);
      L.pad(28, 24); L.pad(67, 24); L.pad(44, 24);
      for (const x of [6, 22, 47, 73, 89]) L.lamp(x, 1);
      for (const x of [6, 19, 76, 89]) { L.lamp(x, 11); L.lamp(x, 19); }
      for (const x of [47, 37, 58]) L.lamp(x, 19);
      L.deco.push(
        { kind: 'sign', x: 10, y: 20.5, text: 'LINE 3' }, { kind: 'sign', x: 76, y: 20.5, text: 'LINE 3' }, { kind: 'sign', x: 44, y: 20.5, text: 'MIND THE GAP' }, { kind: 'sign', x: 10, y: 13, text: 'WAY OUT' }, { kind: 'sign', x: 76, y: 13, text: 'WAY OUT' },
        { kind: 'clock', x: 47, y: 5 }, { kind: 'door', x: 24, y: 20.2 }, { kind: 'door', x: 69, y: 20.2 }, { kind: 'vent', x: 30, y: 4 }, { kind: 'vent', x: 62, y: 4 }, { kind: 'pipes', y: 1 },
      );
      for (const [k, x, y] of [['table', 5, 24], ['chair', 18, 24], ['cooler', 25, 24], ['barrel', 48, 24], ['cooler', 70, 24], ['chair', 77, 24], ['table', 90, 24],
        ['wcrate', 2, 18], ['cabinet', 19, 18], ['cabinet', 76, 18], ['wcrate', 93, 18], ['barrel', 43, 18], ['barrel', 52, 18],
        ['crate', 2, 10], ['barrel', 18, 10], ['crate', 44, 10], ['crate', 51, 10], ['barrel', 77, 10], ['crate', 93, 10], ['pallet', 36, 27], ['pallet', 59, 27]]) L.prop(k, x, y);
      L.spawn(6, 10); L.spawn(6, 18); L.spawn(8, 24); L.spawn(21, 24);
      L.spawn(89, 10); L.spawn(89, 18); L.spawn(87, 24); L.spawn(74, 24);
    },
  },

  // Two towers at night with bridges between them, a room on every floor - fall between them and you're gone.
  towers: {
    name: 'TWIN TOWERS', w: 88, h: 40, theme: 'roof', openBottom: true, desc: 'OUTDOORS - BRIDGES BETWEEN TWO TOWERS',
    build(L) {
      for (const [x0, x1] of [[6, 26], [61, 81]]) {
        L.wall(x0, 6, x1, 33);
        L.fill(x0, 34, x1, 39, SOLID);
        for (const f of [6, 13, 20, 27]) {
          L.row(f, x0, x1);
          L.fill(x0, f + 1, x0, f + 3, SOLID); L.fill(x1, f + 1, x1, f + 3, SOLID);   // (the walls: a doorway under each)
        }
      }
      L.row(27, 15, 17, PLAT); L.row(27, 70, 72, PLAT);                            // (a way up from the jump pads below)
      for (const [x, a] of [[10, 27], [22, 20], [10, 13], [22, 6]]) { L.ladder(x, a, a + 6); L.ladder(87 - x, a, a + 6); }
      L.row(27, 27, 60, PLAT); L.row(13, 27, 60, PLAT);                            // the long bridges
      L.row(20, 27, 33, PLAT); L.row(20, 54, 60, PLAT); L.fill(38, 20, 49, 21, SOLID);   // the broken one, its middle still standing
      L.fill(42, 11, 45, 12, SOLID);
      L.fill(38, 33, 49, 35, SOLID); L.ladder(40, 27, 32); L.ladder(47, 27, 32);   // a slab hanging below it all
      L.row(20, 1, 5, PLAT); L.row(27, 1, 5, PLAT); L.row(20, 82, 86, PLAT); L.row(27, 82, 86, PLAT);   // balconies
      L.ladder(3, 20, 26); L.ladder(84, 20, 26);
      L.row(8, 28, 31, PLAT); L.row(8, 56, 59, PLAT); L.row(6, 34, 53, PLAT);      // the high wire
      L.row(3, 12, 20, PLAT); L.row(3, 67, 75, PLAT);
      L.pad(16, 34); L.pad(71, 34); L.pad(43, 33);
      for (const x of [12, 20, 67, 75]) for (const y of [7, 14, 21, 28]) L.lamp(x, y);
      for (const [x, y] of [[29, 26], [58, 26], [29, 12], [58, 12], [41, 19], [46, 19]]) L.lamp(x, y, true);
      L.deco.push(
        { kind: 'antenna', x: 8, y: 2, h: 4 }, { kind: 'antenna', x: 79, y: 2, h: 4 }, { kind: 'sign', x: 12, y: 30.5, text: 'TOWER A' }, { kind: 'sign', x: 67, y: 30.5, text: 'TOWER B' },
        { kind: 'citywindow', x: 14, y: 9, w: 5, h: 2 }, { kind: 'citywindow', x: 68, y: 9, w: 5, h: 2 }, { kind: 'citywindow', x: 13, y: 16, w: 5, h: 2 }, { kind: 'citywindow', x: 69, y: 16, w: 5, h: 2 },
      );
      for (const [k, x, y] of [['ac', 9, 6], ['wcrate', 18, 6], ['ac', 77, 6], ['wcrate', 69, 6],
        ['desk', 15, 13], ['monitor', 15, 13], ['cabinet', 24, 13], ['desk', 71, 13], ['monitor', 71, 13], ['cabinet', 63, 13],
        ['bookshelf', 8, 20], ['table', 15, 20], ['bookshelf', 79, 20], ['table', 71, 20],
        ['cooler', 24, 27], ['wcrate', 8, 27], ['cooler', 63, 27], ['wcrate', 79, 27],
        ['barrel', 8, 34], ['wcrate', 24, 34], ['barrel', 79, 34], ['wcrate', 63, 34], ['wcrate', 41, 20], ['barrel', 47, 20], ['sandbags', 36, 13], ['sandbags', 51, 13], ['barrel', 2, 20], ['barrel', 85, 20]]) L.prop(k, x, y);
      L.spawn(9, 13); L.spawn(20, 20); L.spawn(9, 27); L.spawn(20, 34);
      L.spawn(78, 13); L.spawn(67, 20); L.spawn(78, 27); L.spawn(67, 34);
    },
  },

  // A mine dug out of solid rock: three galleries each side of a great cavern, acid in its floor, scaffolds across it -
  // and, for those who know, a crawlway under the acid from one side to the other.
  mine: {
    name: 'THE MINE', w: 92, h: 36, theme: 'mine', desc: 'GALLERIES, A CAVERN AND A CRAWLWAY UNDER THE ACID',
    build(L) {
      L.fill(0, 0, 91, 35, SOLID);
      for (const [x0, y0, x1, y1] of [[27, 4, 64, 31], [3, 5, 26, 11], [3, 15, 27, 21], [3, 25, 28, 31], [65, 5, 88, 11], [64, 15, 88, 21], [63, 25, 88, 31]]) L.fill(x0, y0, x1, y1, EMPTY);
      L.row(31, 38, 53, ACID);
      L.fill(44, 4, 47, 7, SOLID);                                                 // a great stalactite
      L.row(28, 40, 51, PLAT); L.row(27, 30, 36, PLAT); L.row(27, 55, 61, PLAT); L.row(23, 38, 53, PLAT);   // the scaffolds
      L.row(19, 30, 36, PLAT); L.row(19, 55, 61, PLAT); L.row(15, 38, 53, PLAT); L.row(15, 29, 33, PLAT); L.row(15, 58, 62, PLAT); L.row(10, 40, 51, PLAT);
      for (const x of [6, 20, 71, 85]) { L.ladder(x, 12, 21); L.ladder(x, 22, 31); }
      L.ladder(45, 15, 22); L.ladder(45, 10, 14);
      L.row(33, 25, 66, LOW); L.row(34, 25, 66, EMPTY); L.ladder(24, 32, 34); L.ladder(67, 32, 34);   // the crawlway
      L.fill(13, 30, 14, 31, SOLID); L.fill(77, 30, 78, 31, SOLID); L.fill(12, 20, 13, 21, SOLID); L.fill(78, 20, 79, 21, SOLID); L.fill(11, 10, 12, 11, SOLID); L.fill(79, 10, 80, 11, SOLID);   // fallen rock
      L.pad(34, 32); L.pad(57, 32);
      for (const x of [9, 22, 69, 82]) { L.lamp(x, 5); L.lamp(x, 15); L.lamp(x, 25); }
      for (const x of [34, 57]) L.lamp(x, 4);
      for (const [x, y] of [[32, 26], [59, 26], [32, 18], [59, 18], [41, 22], [50, 22], [41, 14], [50, 14]]) L.lamp(x, y, true);
      L.deco.push(
        { kind: 'sign', x: 8, y: 7, text: 'SHAFT 1' }, { kind: 'sign', x: 74, y: 7, text: 'SHAFT 2' }, { kind: 'sign', x: 9, y: 17, text: 'DANGER' }, { kind: 'sign', x: 74, y: 27, text: 'NO LAMPS NO WORK' },
        { kind: 'sign', x: 26, y: 28, text: 'CRAWLWAY' }, { kind: 'sign', x: 42, y: 25, text: 'KEEP OFF' }, { kind: 'pipes', y: 5 },
      );
      for (const [k, x, y] of [['wcrate', 3, 12], ['barrel', 17, 12], ['toolbox', 23, 12], ['barrel', 74, 12], ['toolbox', 68, 12], ['wcrate', 88, 12],
        ['wcrate', 3, 22], ['pallet', 16, 22], ['sandbags', 24, 22], ['sandbags', 67, 22], ['pallet', 75, 22], ['wcrate', 88, 22],
        ['wcrate', 3, 32], ['pipes', 10, 32], ['barrel', 18, 32], ['barrel', 73, 32], ['pipes', 81, 32], ['wcrate', 88, 32], ['barrel', 29, 32], ['barrel', 62, 32], ['wcrate', 42, 15], ['wcrate', 49, 15], ['crate', 40, 23], ['crate', 51, 23]]) L.prop(k, x, y);
      L.spawn(4, 12); L.spawn(9, 22); L.spawn(8, 32); L.spawn(18, 12);
      L.spawn(87, 12); L.spawn(82, 22); L.spawn(83, 32); L.spawn(73, 12);
    },
  },

  // A sandstone arena under the sun: the stands stepping down to the sand, a passage running inside them, the gates at the top.
  colosseum: {
    name: 'COLOSSEUM', w: 88, h: 30, theme: 'sand', desc: 'OUTDOORS - THE STANDS, THE SAND, THE PASSAGE BENEATH',
    build(L) {
      L.fill(0, 28, 87, 29, SOLID);
      L.fill(0, 0, 0, 27, SOLID); L.fill(87, 0, 87, 27, SOLID);
      L.wall(1, 6, 7, 27); L.wall(80, 6, 86, 27); L.wall(1, 24, 36, 27); L.wall(51, 24, 86, 27);
      for (const [x0, x1, top] of [[1, 7, 10], [8, 13, 13], [14, 19, 16], [20, 25, 19], [26, 31, 22], [32, 36, 25]]) { L.fill(x0, top, x1, 27, SOLID); L.fill(87 - x1, top, 87 - x0, 27, SOLID); }   // the stands
      L.fill(1, 24, 31, 27, EMPTY); L.fill(56, 24, 86, 27, EMPTY); L.fill(32, 26, 36, 27, EMPTY); L.fill(51, 26, 55, 27, EMPTY);   // the passage, its arches
      for (const [x, a] of [[11, 13], [23, 19]]) { L.ladder(x, a, 27); L.ladder(87 - x, a, 27); }
      L.fill(41, 24, 46, 27, SOLID);                                               // the plinth
      L.row(20, 34, 53, PLAT); L.row(14, 38, 49, PLAT); L.ladder(43, 14, 19); L.ladder(43, 20, 23);
      L.row(7, 2, 6, PLAT); L.row(7, 81, 85, PLAT);
      L.pad(38, 28); L.pad(49, 28);
      for (const [x, y] of [[2, 9], [85, 9], [15, 15], [72, 15], [27, 21], [60, 21], [36, 19], [51, 19]]) L.lamp(x, y, true);
      for (const x of [6, 19, 68, 81]) L.lamp(x, 24);
      L.deco.push({ kind: 'sign', x: 3, y: 25, text: 'GATE A' }, { kind: 'sign', x: 76, y: 25, text: 'GATE B' }, { kind: 'cones', x: 39, y: 27 }, { kind: 'cones', x: 47, y: 27 });
      for (const [k, x, y] of [['sandbags', 5, 10], ['sandbags', 82, 10], ['wcrate', 12, 13], ['wcrate', 75, 13], ['barrel', 15, 16], ['barrel', 72, 16], ['sandbags', 22, 19], ['sandbags', 65, 19], ['barrel', 28, 22], ['barrel', 59, 22],
        ['wcrate', 3, 28], ['wcrate', 84, 28], ['pipes', 16, 28], ['pipes', 71, 28], ['barrel', 27, 28], ['barrel', 60, 28], ['wcrate', 40, 28], ['wcrate', 47, 28], ['crate', 37, 20], ['crate', 50, 20], ['wcrate', 42, 24], ['toolbox', 45, 14]]) L.prop(k, x, y);
      L.spawn(4, 10); L.spawn(10, 13); L.spawn(17, 16); L.spawn(22, 19);
      L.spawn(83, 10); L.spawn(77, 13); L.spawn(70, 16); L.spawn(65, 19);
    },
  },

  // A cargo ship at the quay by night: a pier each side, gangways to the deck, a hold to drop into, the bridge at the stern -
  // and the water under the gangways: fall in and you're gone.
  harbor: {
    name: 'CARGO SHIP', w: 104, h: 30, theme: 'harbor', openBottom: true, desc: 'OUTDOORS AT NIGHT - THE DECK, THE HOLD, THE WATER',
    build(L) {
      L.fill(0, 24, 14, 29, SOLID); L.fill(89, 24, 103, 29, SOLID);                // the piers
      L.fill(24, 22, 79, 29, SOLID);                                               // the hull
      L.row(23, 15, 23, PLAT); L.row(23, 80, 88, PLAT);                            // the gangways
      L.fill(38, 22, 65, 26, EMPTY); L.row(22, 46, 57, PLAT);                      // the hold, a grating over it
      L.ladder(40, 22, 26); L.ladder(63, 22, 26);
      L.fill(42, 25, 45, 26, SOLID); L.fill(58, 25, 61, 26, SOLID);
      L.fill(30, 20, 35, 21, SOLID); L.fill(30, 17, 33, 19, SOLID);                // containers on deck
      L.wall(68, 12, 77, 21);                                                      // the bridge
      L.row(17, 68, 77); L.row(12, 68, 77);
      for (const x of [68, 77]) { L.fill(x, 13, x, 14, SOLID); L.fill(x, 18, x, 19, SOLID); }
      L.ladder(72, 17, 21); L.ladder(72, 12, 16);
      L.row(8, 70, 75, PLAT);
      L.row(13, 40, 60, PLAT); L.ladder(50, 13, 21);                               // the deck crane's gantry
      L.row(17, 36, 39, PLAT); L.row(17, 61, 64, PLAT);
      L.row(16, 3, 12, PLAT); L.row(16, 91, 100, PLAT); L.ladder(2, 16, 23); L.ladder(101, 16, 23);   // the quay cranes
      L.pad(12, 24); L.pad(91, 24);
      for (const [x, y] of [[5, 23], [14, 23], [25, 21], [37, 21], [66, 21], [79, 21], [89, 23], [98, 23], [45, 12], [55, 12]]) L.lamp(x, y, true);
      L.lamp(72, 13); L.lamp(72, 18); for (const x of [46, 57]) L.lamp(x, 23);
      L.deco.push({ kind: 'crane', x: 6, y: 2, h: 22 }, { kind: 'crane', x: 94, y: 2, h: 22 }, { kind: 'antenna', x: 74, y: 3, h: 5 }, { kind: 'sign', x: 42, y: 28, text: 'ZX-7 CARGO' }, { kind: 'sign', x: 4, y: 26, text: 'QUAY 4' }, { kind: 'sign', x: 93, y: 26, text: 'QUAY 5' }, { kind: 'monitors', x: 70, y: 14 });
      for (const [k, x, y] of [['wcrate', 1, 24], ['barrel', 9, 24], ['pallet', 5, 24], ['pallet', 96, 24], ['barrel', 94, 24], ['wcrate', 102, 24],
        ['barrel', 25, 22], ['sandbags', 37, 22], ['sandbags', 66, 22], ['barrel', 79, 22], ['barrel', 35, 20], ['wcrate', 50, 27], ['barrel', 41, 27], ['pipes', 54, 27], ['barrel', 62, 27],
        ['cabinet', 74, 17], ['table', 70, 12], ['chair', 75, 12], ['wcrate', 47, 13], ['wcrate', 56, 13], ['wcrate', 10, 16], ['wcrate', 93, 16]]) L.prop(k, x, y);
      L.spawn(4, 24); L.spawn(7, 16); L.spawn(31, 17); L.spawn(26, 22);
      L.spawn(99, 24); L.spawn(96, 16); L.spawn(74, 12); L.spawn(70, 17);
    },
  },

  // TRAINING: a big test room in four parts - the ARMORY (cabinets: every
  // gun and melee weapon, the skills, medkits and drinks), the FIRING RANGE
  // (dummies near, far, high and walking), the MOVEMENT COURSE upstairs (a low
  // tunnel, a wall to double-jump, a catwalk to drop through, a gap, steps),
  // and the GRAPPLE SHAFT - tall, with ledges to swing between and a yard of
  // crates to break at the bottom (they come back). Room left for more.
  training: {
    name: 'TRAINING', w: 100, h: 30, theme: 'range', training: true,
    build(L) {
      L.shell();
      L.fill(1, 27, 98, 28, SOLID);                               // the ground floor
      L.row(14, 1, 62);                                           // the course's floor (the ceiling of the armory and range)
      L.fill(63, 1, 63, 23, SOLID);                              // the shaft's wall (a way in at the bottom; the course drops in over the top)
      L.fill(63, 1, 63, 13, EMPTY);

      // ARMORY (cols 1-24): the cabinets on the back wall, a ladder up to the course
      L.deco.push(
        { kind: 'gunlocker', x: 3, y: 23, w: 6, h: 4, use: 'guns' },
        { kind: 'skillbay', x: 11, y: 23, w: 4, h: 4, use: 'skills' },
        { kind: 'medcab', x: 17, y: 23, w: 5, h: 4, use: 'med' },
        { kind: 'sign', x: 9, y: 19, text: 'ARMORY' },
      );
      L.signs.push({ x: 6.5, y: 21, text: 'E - OPEN A CABINET' });
      L.ladder(23, 14, 26);
      L.spawn(14, 27);

      // FIRING RANGE (cols 25-62): a firing line, dummies at three distances,
      // one walking, one on a catwalk, one up high
      L.row(26, 25, 25);
      L.row(22, 44, 50, PLAT); L.ladder(43, 22, 26);
      L.row(18, 54, 59, PLAT); L.ladder(53, 18, 26);
      L.ladder(61, 14, 26);
      L.dummies.push({ x: 32, y: 27 }, { x: 40, y: 27 }, { x: 56, y: 27 }, { x: 47, y: 27, patrol: [35, 59] }, { x: 47, y: 22 }, { x: 57, y: 18 });
      L.deco.push({ kind: 'sign', x: 34, y: 16, text: 'FIRING RANGE' }, { kind: 'target', x: 36, y: 20 }, { kind: 'target', x: 59, y: 23 });

      // MOVEMENT COURSE (upstairs, cols 1-62)
      L.fill(7, 1, 12, 11, SOLID); L.row(12, 7, 12, LOW);        // a low tunnel: crouch or roll through
      L.fill(17, 10, 18, 13, SOLID);                             // too high for one jump: jump twice
      L.row(6, 22, 34, PLAT); L.ladder(21, 6, 13);               // a catwalk to drop through
      L.row(14, 37, 39, EMPTY);                                  // a gap (miss it: down into the range)
      L.row(11, 43, 46, PLAT); L.row(8, 48, 51, PLAT); L.row(5, 53, 56, PLAT);   // steps up
      L.signs.push(
        { x: 1.5, y: 9.5, text: 'CROUCH UNDER' }, { x: 13.3, y: 8, text: 'JUMP TWICE' }, { x: 23, y: 3.5, text: 'S S - DROP THROUGH' },
        { x: 36, y: 11, text: 'JUMP THE GAP' }, { x: 26, y: 12, text: 'SHIFT - ROLL' },
      );
      L.deco.push({ kind: 'sign', x: 2, y: 2, text: 'MOVEMENT COURSE' });

      // GRAPPLE SHAFT (cols 64-98): ledges and blocks at every height; crates to break on the floor
      for (const [x0, y, x1, v] of [[67, 21, 70], [76, 17, 79], [86, 21, 89], [93, 13, 96], [81, 9, 84], [69, 11, 72], [89, 4, 92], [66, 5, 68],
        [74, 13, 75, PLAT], [84, 15, 87, PLAT], [95, 20, 97, PLAT], [77, 4, 80, PLAT]]) L.row(y, x0, x1, v ?? SOLID);
      L.deco.push({ kind: 'sign', x: 70, y: 2, text: 'GRAPPLE SHAFT - Q' }, { kind: 'sign', x: 78, y: 24, text: 'DEMOLITION' });
      L.dummies.push({ x: 94, y: 13 }, { x: 82, y: 9 });
      for (const [k, x, y, lift] of [
        ['wcrate', 68, 27], ['wcrate', 69, 27], ['wcrate', 68, 27, 14], ['barrel', 72, 27], ['barrel', 73, 27], ['crate', 76, 27], ['crate', 77, 27], ['crate', 76, 27, 12],
        ['pallet', 84, 27], ['wcrate', 84, 27, 3], ['sandbags', 88, 27], ['barrel', 91, 27], ['wcrate', 94, 27], ['wcrate', 95, 27], ['wcrate', 94, 27, 14], ['locker', 97, 27],
        ['crate', 77, 17], ['barrel', 87, 21], ['crate', 30, 6], ['table', 26, 6],
      ]) L.prop(k, x, y, 0, lift ?? 0);

      for (const x of [5, 12, 19]) L.lamp(x, 15);
      for (const x of [30, 40, 50, 58]) L.lamp(x, 15);
      for (const x of [4, 15, 27, 40, 52]) L.lamp(x, 1);
      for (const x of [71, 82, 93]) L.lamp(x, 1);
      L.lamp(78, 18); L.lamp(88, 22);
    },
  },
};

export const MAP_KEYS = ['lab', 'warehouse', 'office', 'rooftops', 'site', 'reactor', 'yard', 'metro', 'towers', 'mine', 'colosseum', 'harbor'];
