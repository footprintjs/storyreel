/**
 * isometric — StoryDeck's isometric maps as a StoryReel world kit: blocks and cylinders on a floor seen from a corner,
 * floors with their names, groups, cables between blocks and ports, and packets riding the cables. Every number is
 * footprint-story's (`/isometric` places, lays, fits and orders; `/motion` rides), so a film and a deck draw the same
 * map the same way. The kit only draws on the canvas and words what it finds.
 *
 *   {"type": "world", "scene": "map", "world": {"kit": "isometric",
 *     "blocks": [{"name": "you", "label": "You", "small": "a browser"}, {"name": "server", "label": "Server", "size": [2, 2, 1.6]},
 *                {"name": "db", "kind": "cylinder", "label": "Database", "size": [1.8, 1.8, 1.2]}],
 *     "wires":  [{"name": "w1", "arrow": "you to server", "packets": 1, "speed": "260px"}, {"arrow": "server to db", "label": "SQL"}]}}
 *
 * Placed when no block has an `at` (arrange across the frame; arrangeByGroup when any has a group), the grid fitted to
 * the frame (or `area`) unless written in numbers, cables laid by routes (ports, keep-clear of hidden floor), floors
 * with no size fitted round their blocks, each name fitted to its top. See README.md beside this file for every key.
 *
 * What a film reads of it: `regionsAt(t)` (every block, floor and wire by its name, so a push or a camera move frames
 * "server"; each label by its own path), `texts()` (every label, for the reading check), `parts(t)` (each packet
 * mounted on the stretch of its cable it rides, for the geometry audit: a packet off its cable fails it), and `notes`
 * (what the kit says of the map, worded with the fix) and `map` (the record: placed by whom, the tile, every block's
 * place, every cable's corners, length and hidden stretches). With `strict: true` a warning refuses the film.
 */
import {readMap} from './read.mjs';
import {buildMap} from './build.mjs';
import {layCables, walk} from './cables.mjs';
import {notesOf} from './notes.mjs';
import {rideOf, packetsAt} from './ride.mjs';
import {drawMap, lookOf, inAt} from './draw.mjs';

export {ISO_LIMITS, readArrow} from './read.mjs';
export {ISO_FIT} from './build.mjs';
export {ISO_CABLE, LABEL_PLACES} from './cables.mjs';
export {ISO_LOOK} from './draw.mjs';
export {PACKET_RADIUS, onStops} from './ride.mjs';
export {NOTE_FROM} from './notes.mjs';

const boxOf = (points) => { const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
const round1 = (v) => Math.round(v * 10) / 10;

/** A floor label's box on the frame: its lines' block laid flat by its matrix, foot on the edge. */
function floorLabelBox(f) {
  const {x, y, matrix: [a, b, c, d], size, lines} = f.place, w = Math.max(...lines.map((l) => [...l].length)) * size * 0.6, h = lines.length * size * 1.15;
  return boxOf([[0, -h], [w, -h], [w, 0], [0, 0]].map(([u, v]) => [x + a * u + c * v, y + b * u + d * v]));
}

/** What the kit made, for the record and for whoever checks it (a test, an agent): plain numbers, rounded to a tenth of a px. */
function recordOf(map) {
  return {placed: map.placed, tile: map.grid.tile[0], fitted: !map.grid0,
    blocks: map.blocks.map((b) => ({name: b.name, kind: b.kind, at: [...b.at], size: [...b.size], ...(b.fitted ? {lines: [...b.fitted.lines], nameSize: b.fitted.size, fits: b.fitted.fits} : {})})),
    floors: map.floors.map((f) => ({name: f.name, at: [...f.at], size: [...f.size], ...(f.place ? {lines: [...f.place.lines], fits: f.place.fits, covered: f.place.covered} : {})})),
    cables: map.wires.map((w) => ({name: w.name, from: w.arrow.from.block.name, to: w.arrow.to.block.name, along: Boolean(w.route?.points), ...(w.route?.ports?.some(Boolean) ? {ports: [...w.route.ports]} : {}),
      points: w.cable.points.map(([x, y]) => [round1(x), round1(y)]), length: round1(w.cable.length), unseen: w.cable.unseen.map(([lo, hi]) => [round1(lo), round1(hi)]),
      ...(w.route?.points ? {behind: [...w.route.behind], crosses: w.route.crosses, shared: w.route.shared, bends: w.route.bends} : {}), ...(w.riding ? {period: +w.riding.period.toFixed(3)} : {})}))};
}

/** The world, compiled: `spec` the recipe's world entry; `context` the kit context (clock, theme, where). */
export function compileIsometric(spec, context) {
  const {clock, theme, where = 'the isometric world'} = context;
  const map = readMap(spec ?? {}, where);
  map.grid0 = map.grid;
  buildMap(map, where);
  layCables(map);
  const at = (anchor) => (anchor === null ? null : clock.at(anchor));
  for (const p of [...map.blocks, ...map.floors, ...map.wires]) p.appearAt = at(p.appear);
  for (const w of map.wires) {
    const start = at(w.start) ?? w.appearAt ?? 0;
    w.riding = rideOf(w, w.cable.length, start);
  }
  const notes = Object.freeze(notesOf(map).map((n) => Object.freeze(n)));
  const warned = notes.filter((n) => n.level === 'warn');
  if (map.strict && warned.length) throw new Error(`${where}: the isometric map has ${warned.length} warning${warned.length === 1 ? '' : 's'} (strict: true): ${warned.slice(0, 3).map((n) => n.message.slice(where.length + 2)).join('; ')}${warned.length > 3 ? `; and ${warned.length - 3} more` : ''}`);
  const look = lookOf(theme), shownAt = (p, t) => p.appearAt === null || t >= p.appearAt;   // named from its moment on, as it starts to come in
  const walks = map.wires.map((w) => walk(w.cable.way));
  return {
    hang: 1,
    sounds: [],
    notes,
    map: Object.freeze(recordOf(map)),
    draw: (c, t) => drawMap(c, map, t, look),
    // every piece by its name, once it has come in: a push or a camera move frames "server"; a label by its own path
    regionsAt: (t) => [
      ...map.floors.flatMap((f) => (shownAt(f, t) ? [{box: boxOf(f.shape.outline), path: f.path, label: f.label ?? `floor ${f.name ?? f.path}`, ...(f.name ? {name: f.name} : {})},
        ...(f.place ? [{box: floorLabelBox(f), path: `${f.path}.label`, label: f.label}] : [])] : [])),
      ...map.wires.flatMap((w, i) => (shownAt(w, t) ? [{box: boxOf(walks[i]), path: w.path, label: w.label ?? `${w.arrow.from.block.name} to ${w.arrow.to.block.name}`, ...(w.name ? {name: w.name} : {})},
        ...(w.label ? [{box: [w.labelAt[0] - w.labelHalf[0], w.labelAt[1] - w.labelHalf[1], w.labelAt[0] + w.labelHalf[0], w.labelAt[1] + w.labelHalf[1]], path: `${w.path}.label`, label: w.label}] : [])] : [])),
      ...map.order.filter((b) => shownAt(b, t)).map((b) => ({box: boxOf(b.shape.outline), path: b.path, label: b.label ?? b.name, name: b.name})),
    ],
    // every label, from when it has come in: the block's name and its small line, a floor's name, a cable's label
    texts: () => [
      ...map.blocks.flatMap((b) => [...(b.fitted?.lines.length ? [{text: b.fitted.lines.join(' '), path: `${b.path}.label`}] : []), ...(b.small ? [{text: b.small, path: `${b.path}.small`}] : [])].map((l) => ({...l, from: (b.appearAt ?? 0) + 0.35, to: Infinity}))),
      ...map.floors.filter((f) => f.place).map((f) => ({text: f.place.lines.join(' '), path: `${f.path}.label`, from: (f.appearAt ?? 0) + 0.35, to: Infinity})),
      ...map.wires.filter((w) => w.label).map((w) => ({text: w.label.toUpperCase(), path: `${w.path}.label`, from: (w.appearAt ?? 0) + 0.35, to: Infinity})),
    ],
    // each packet riding — its centre, width 0 — mounted on the stretch of its cable it is on by its share of the line
    // (geometry.mjs): the audit fails a packet drawn more than 2 px off its cable's line (the line is 4 px wide)
    parts: (t) => {
      const segments = {};
      map.wires.forEach((w, i) => {
        if (!shownAt(w, t)) return;
        const id = w.name ?? w.path, steps = walks[i].length - 1;
        for (const p of packetsAt(w.riding, w.packets, t)) {
          const k = Math.min(steps - 1, Math.max(0, Math.floor(p.share * steps))), here = w.cable.way.at(p.share);
          segments[`${id} stretch ${p.k + 1}`] = {a: walks[i][k], b: walks[i][k + 1], width: 4};
          segments[`${id} packet ${p.k + 1}`] = {a: here, b: here, width: 0, mount: `${id} stretch ${p.k + 1}`};
        }
      });
      return {segments};
    },
  };
}

/** The isometric kit: pass it in `kits`; a world stage or the story names it (`kit: 'isometric'`). `sources`: where its drawing code lives. */
export const isometricKit = {name: 'isometric', story: {context: true, compile: compileIsometric}, sources: {entry: () => [new URL('./index.mjs', import.meta.url)]}};
