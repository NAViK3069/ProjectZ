// The arena maps. Each builds its grid (row / fill / ladder), lamps, back-wall
// fittings, the props standing about (crates, drums, furniture - all of them
// break), and where everyone spawns. Rows count down from the top; a prop
// "on row r" stands on the floor whose top is row r.

import { SOLID, PLAT, ACID, EMPTY, LOW } from './level.js';

export const MAPS = {
  // Three floors of labs over an acid vat.
  lab: {
    name: 'THE LAB', w: 48, h: 27, theme: 'lab', desc: 'THREE FLOORS OVER AN ACID VAT',
    build(L) {
      L.shell();
      L.row(7, 1, 46); L.row(7, 14, 17, PLAT); L.row(7, 22, 25, EMPTY); L.row(7, 30, 33, PLAT);
      L.row(8, 1, 3); L.row(8, 44, 46);
      L.row(13, 1, 46); L.row(13, 19, 28, PLAT); L.row(13, 3, 4, EMPTY); L.row(13, 43, 44, EMPTY);
      L.row(19, 1, 16); L.row(19, 31, 46); L.row(19, 19, 28, PLAT);
      L.row(25, 1, 16); L.row(25, 31, 46); L.row(24, 16, 16); L.row(24, 31, 31); L.row(25, 17, 30, ACID);
      L.row(4, 5, 9, PLAT); L.row(4, 38, 42, PLAT);
      L.row(10, 15, 18, PLAT); L.row(10, 29, 32, PLAT);
      L.row(16, 4, 8, PLAT); L.row(16, 39, 43, PLAT);
      L.row(22, 20, 27, PLAT); L.row(22, 6, 10, PLAT); L.row(22, 37, 41, PLAT);
      L.fill(23, 10, 24, 12, SOLID); L.fill(11, 2, 11, 3, SOLID); L.fill(36, 2, 36, 3, SOLID);
      L.ladder(6, 7, 12); L.ladder(41, 7, 12); L.ladder(11, 13, 18); L.ladder(36, 13, 18); L.ladder(7, 19, 24); L.ladder(40, 19, 24); L.ladder(2, 1, 6);
      for (const [x, y] of [[9, 1], [24, 1], [39, 1], [10, 8], [19, 8], [28, 8], [37, 8], [6, 14], [15, 14], [24, 14], [32, 14], [41, 14], [11, 20], [22, 20], [36, 20]]) L.lamp(x, y);
      L.deco.push(
        { kind: 'monitors', x: 13, y: 2 }, { kind: 'monitors', x: 29, y: 2 }, { kind: 'server', x: 44, y: 1 }, { kind: 'server', x: 3, y: 9 },
        { kind: 'tank', x: 19, y: 14 }, { kind: 'tank', x: 26, y: 14 }, { kind: 'tank', x: 2, y: 20 }, { kind: 'tank', x: 44, y: 20 },
        { kind: 'reactor', x: 21, y: 1 }, { kind: 'sign', x: 17, y: 9, text: 'LAB-07' }, { kind: 'sign', x: 34, y: 9, text: 'BIOHAZARD' },
        { kind: 'vent', x: 8, y: 9 }, { kind: 'vent', x: 38, y: 15 }, { kind: 'vent', x: 30, y: 4 },
        { kind: 'window', x: 13, y: 20 }, { kind: 'window', x: 31, y: 20 }, { kind: 'door', x: 45, y: 10 }, { kind: 'door', x: 1, y: 14 },
        { kind: 'pipes', y: 1 }, { kind: 'pipes', y: 14 },
      );
      for (const [k, x, y] of [['crate', 4, 7], ['crate', 43, 7], ['barrel', 27, 7], ['table', 20, 7], ['chair', 18, 7], ['crate', 2, 13], ['barrel', 9, 13], ['locker', 46, 13], ['table', 33, 13], ['chair', 35, 13], ['wcrate', 13, 13],
        ['barrel', 13, 19], ['crate', 14, 19], ['table', 34, 19], ['barrel', 45, 19], ['wcrate', 4, 25], ['barrel', 12, 25], ['crate', 42, 25], ['wcrate', 35, 25], ['cabinet', 9, 25], ['chair', 38, 25]]) L.prop(k, x, y);
      L.spawn(4, 7); L.spawn(43, 7); L.spawn(5, 25); L.spawn(42, 25);
    },
  },

  // A warehouse: a wide floor stacked with crates and shelving, mezzanines, high catwalks.
  warehouse: {
    name: 'WAREHOUSE', w: 52, h: 24, theme: 'warehouse', desc: 'CRATES, SHELVES AND HIGH CATWALKS',
    build(L) {
      L.shell();
      L.row(22, 1, 50);
      L.row(14, 1, 14); L.row(14, 37, 50);                       // mezzanines
      L.row(8, 10, 17, PLAT); L.row(8, 20, 31, PLAT); L.row(8, 34, 41, PLAT);   // high catwalks
      L.row(17, 20, 31, PLAT);                                    // the top of the big shelving unit
      L.row(5, 1, 6, PLAT); L.row(5, 45, 50, PLAT);               // ledges up by the roof
      L.ladder(12, 14, 21); L.ladder(39, 14, 21); L.ladder(11, 8, 13); L.ladder(40, 8, 13); L.ladder(3, 5, 13); L.ladder(48, 5, 13); L.ladder(25, 17, 21);
      for (const x of [8, 18, 26, 34, 44]) L.lamp(x, 1);
      L.lamp(5, 15); L.lamp(46, 15); L.lamp(25, 9);
      L.deco.push(
        { kind: 'shelves', x: 20, y: 17, w: 12, h: 5 }, { kind: 'shelves', x: 2, y: 9, w: 4, h: 5 }, { kind: 'shelves', x: 44, y: 9, w: 5, h: 5 },
        { kind: 'rollup', x: 15, y: 19 }, { kind: 'rollup', x: 33, y: 19 }, { kind: 'forklift', x: 41, y: 20.25 },
        { kind: 'sign', x: 22, y: 11, text: 'LOADING BAY' }, { kind: 'sign', x: 7, y: 16, text: 'NO SMOKING' }, { kind: 'vent', x: 28, y: 3 },
      );
      // crates everywhere, stacked
      for (const [k, x, y, lift] of [
        ['wcrate', 2, 22], ['wcrate', 3, 22], ['wcrate', 2, 22, 14], ['pallet', 6, 22], ['wcrate', 6, 22, 3], ['barrel', 9, 22], ['barrel', 10, 22],
        ['wcrate', 18, 22], ['wcrate', 19, 22], ['wcrate', 18, 22, 14], ['crate', 29, 22], ['wcrate', 31, 22], ['wcrate', 31, 22, 14], ['wcrate', 31, 22, 28],
        ['barrel', 35, 22], ['pallet', 45, 22], ['wcrate', 45, 22, 3], ['wcrate', 48, 22], ['wcrate', 49, 22],
        ['wcrate', 4, 14], ['crate', 8, 14], ['barrel', 13, 14], ['wcrate', 38, 14], ['crate', 43, 14], ['wcrate', 47, 14], ['wcrate', 47, 14, 14],
        ['wcrate', 23, 17], ['barrel', 28, 17], ['wcrate', 14, 8], ['wcrate', 37, 8], ['barrel', 26, 8],
      ]) L.prop(k, x, y, 0, lift ?? 0);
      L.spawn(5, 14); L.spawn(46, 14); L.spawn(14, 22); L.spawn(38, 22);
    },
  },

  // An office block, three floors with a lift shaft down the middle.
  office: {
    name: 'OFFICE', w: 50, h: 25, theme: 'office', desc: 'DESKS, CUBICLES AND A LIFT SHAFT',
    build(L) {
      L.shell();
      L.row(7, 1, 48); L.row(7, 23, 25, EMPTY);
      L.row(15, 1, 48); L.row(15, 23, 25, EMPTY);
      L.row(23, 1, 48);
      // low cubicle walls to jump over or hide behind
      L.fill(15, 5, 15, 6, SOLID); L.fill(34, 5, 34, 6, SOLID);
      L.fill(12, 13, 12, 14, SOLID); L.fill(37, 13, 37, 14, SOLID);
      L.fill(18, 21, 18, 22, SOLID); L.fill(31, 21, 31, 22, SOLID);
      L.row(11, 23, 25, PLAT); L.row(19, 23, 25, PLAT);            // gratings across the shaft
      L.ladder(4, 7, 14); L.ladder(46, 7, 14); L.ladder(8, 15, 22); L.ladder(41, 15, 22);
      for (const x of [7, 17, 32, 42]) { L.lamp(x, 1); L.lamp(x, 8); L.lamp(x, 16); }
      L.deco.push(
        { kind: 'citywindow', x: 6, y: 2, w: 6, h: 2 }, { kind: 'citywindow', x: 37, y: 2, w: 6, h: 2 }, { kind: 'citywindow', x: 18, y: 9, w: 4, h: 2 },
        { kind: 'citywindow', x: 27, y: 9, w: 4, h: 2 }, { kind: 'citywindow', x: 10, y: 17, w: 5, h: 2 }, { kind: 'citywindow', x: 34, y: 17, w: 5, h: 2 },
        { kind: 'elevator', x: 22.5, y: 4.95 }, { kind: 'whiteboard', x: 27, y: 3 }, { kind: 'whiteboard', x: 2, y: 10 }, { kind: 'clock', x: 20, y: 2 },
        { kind: 'plantpot', x: 1, y: 4.95 }, { kind: 'plantpot', x: 47, y: 12.95 }, { kind: 'plantpot', x: 47, y: 20.95 }, { kind: 'sign', x: 43, y: 18, text: 'EXIT' },
      );
      for (const [k, x, y] of [
        ['desk', 8, 7], ['chair', 10, 7], ['monitor', 8, 7], ['desk', 19, 7], ['chair', 21, 7], ['monitor', 19, 7], ['cabinet', 29, 7], ['desk', 39, 7], ['monitor', 39, 7], ['chair', 41, 7], ['cooler', 2, 7],
        ['desk', 6, 15], ['monitor', 6, 15], ['chair', 4, 15], ['bookshelf', 15, 15], ['desk', 30, 15], ['monitor', 30, 15], ['chair', 32, 15], ['cabinet', 44, 15], ['cooler', 20, 15],
        ['desk', 13, 23], ['monitor', 13, 23], ['chair', 15, 23], ['bookshelf', 22, 23], ['desk', 36, 23], ['monitor', 36, 23], ['chair', 34, 23], ['cabinet', 3, 23], ['wcrate', 46, 23], ['barrel', 26, 23],
      ]) L.prop(k, x, y);
      L.spawn(3, 7); L.spawn(46, 7); L.spawn(3, 15); L.spawn(46, 23);
    },
  },

  // Rooftops at night: four buildings with gaps between - fall and you're gone.
  rooftops: {
    name: 'ROOFTOPS', w: 60, h: 26, theme: 'roof', openBottom: true, desc: 'OUTDOORS AT NIGHT - MIND THE GAPS',
    build(L) {
      L.fill(0, 12, 14, 25, SOLID);                               // A
      L.fill(19, 9, 30, 25, SOLID);                               // B (tallest)
      L.fill(35, 14, 44, 25, SOLID);                              // C
      L.fill(49, 11, 59, 25, SOLID);                              // D
      L.row(12, 15, 17, PLAT); L.ladder(18, 9, 11);               // a plank over to B and up its side
      L.row(11, 31, 33, PLAT);                                    // an AC duct off B
      L.row(13, 45, 47, PLAT);                                    // a fire-escape landing off D
      L.fill(4, 9, 5, 11, SOLID); L.fill(55, 8, 56, 10, SOLID);  // chimneys
      L.fill(23, 6, 26, 8, SOLID);                                // the stair hut on B
      L.row(5, 22, 27, PLAT); L.ladder(21, 5, 8);                 // the water tower's walkway
      L.row(6, 51, 57, PLAT); L.ladder(50, 6, 10);                // the billboard's catwalk
      L.row(8, 7, 11, PLAT); L.ladder(8, 8, 11);                  // a scaffold on A
      for (const [x, y] of [[2, 11], [13, 11], [28, 8], [37, 13], [43, 13], [58, 10]]) L.lamp(x, y, true);
      L.deco.push(
        { kind: 'watertower', x: 22, y: 1 }, { kind: 'billboard', x: 51, y: 1.1 }, { kind: 'antenna', x: 40, y: 10, h: 4 }, { kind: 'antenna', x: 10, y: 4, h: 4 },
        { kind: 'sign', x: 36, y: 15, text: 'HOTEL' },
      );
      for (const [k, x, y] of [['ac', 2, 12], ['wcrate', 12, 12], ['barrel', 6, 12], ['ac', 28, 9], ['wcrate', 20, 9], ['barrel', 29, 9], ['ac', 39, 14], ['wcrate', 42, 14], ['barrel', 36, 14], ['ac', 53, 11], ['wcrate', 58, 11], ['pallet', 51, 11], ['wcrate', 9, 8]]) L.prop(k, x, y);
      L.spawn(8, 12); L.spawn(25, 9); L.spawn(41, 14); L.spawn(53, 11);
    },
  },

  // A building site at sunset: girders and scaffolding over open ground.
  site: {
    name: 'BUILDING SITE', w: 56, h: 26, theme: 'site', desc: 'OUTDOORS - GIRDERS AND SCAFFOLDING',
    build(L) {
      L.fill(0, 24, 55, 25, SOLID);                               // the ground
      L.fill(0, 0, 0, 23, SOLID); L.fill(55, 0, 55, 23, SOLID);   // site fences either end
      L.wall(12, 6, 43, 23);                                      // the half-built block (brick behind its frame)
      L.row(18, 12, 43); L.row(18, 26, 29, PLAT);                 // first floor girders
      L.row(12, 16, 39); L.row(12, 24, 25, EMPTY);                // second floor
      L.row(6, 20, 35, PLAT);                                     // the top beams
      L.row(20, 2, 8, PLAT); L.row(20, 47, 53, PLAT);             // scaffolds outside
      L.row(14, 4, 9, PLAT); L.row(14, 46, 51, PLAT);
      L.ladder(14, 18, 23); L.ladder(41, 18, 23); L.ladder(18, 12, 17); L.ladder(37, 12, 17); L.ladder(22, 6, 11); L.ladder(33, 6, 11); L.ladder(6, 14, 23); L.ladder(49, 14, 23);
      for (const [x, y] of [[3, 23], [52, 23], [27, 17]]) L.lamp(x, y, true);
      L.deco.push({ kind: 'crane', x: 50, y: 2, h: 22 }, { kind: 'cones', x: 10, y: 23 }, { kind: 'cones', x: 44, y: 23 }, { kind: 'sign', x: 24, y: 20, text: 'HARD HAT AREA' });
      for (const [k, x, y, lift] of [
        ['wcrate', 3, 24], ['pallet', 9, 24], ['sandbags', 9, 24, 3], ['barrel', 16, 24], ['pipes', 22, 24], ['wcrate', 30, 24], ['wcrate', 31, 24], ['wcrate', 30, 24, 14], ['barrel', 36, 24], ['sandbags', 45, 24], ['wcrate', 52, 24],
        ['wcrate', 20, 18], ['barrel', 33, 18], ['pallet', 38, 18], ['toolbox', 15, 18], ['wcrate', 28, 12], ['sandbags', 19, 12], ['barrel', 35, 12], ['wcrate', 4, 20], ['wcrate', 51, 20], ['toolbox', 30, 6],
      ]) L.prop(k, x, y, 0, lift ?? 0);
      L.spawn(4, 24); L.spawn(51, 24); L.spawn(20, 12); L.spawn(36, 12);
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

export const MAP_KEYS = ['lab', 'warehouse', 'office', 'rooftops', 'site'];
