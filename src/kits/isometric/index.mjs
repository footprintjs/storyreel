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
 * with no size fitted round their blocks, each name fitted to its top, each piece painted in the world's `style`
 * (footprint-story's style row; today's look when left out). See README.md beside this file for every key.
 *
 * What a film reads of it: `regionsAt(t)` (every block, floor and wire by its name, so a push or a camera move frames
 * "server"; each label by its own path), `texts()` (every label, for the reading check), `parts(t)` (each packet
 * mounted on the stretch of its cable it rides, for the geometry audit: a packet off its cable fails it), `notes`
 * (what the kit says of the map, worded with the fix: the film carries them as `film.kitNotes`, and its record beside
 * the world's entry), `summary` (the counts the record keeps) and `map` (the whole record: placed by whom, the tile,
 * every block's place, every cable's corners, length and hidden stretches) and `mapRun` (the map built again by
 * footprint-story's map flow, a run whose record says why: flow.mjs). With `strict: true` a warning refuses.
 *
 * `motion` moves blocks by intent ({"piece": "box", "do": "fall"}): footprint-story decides each move's model, duration
 * and curve (motion.mjs), the block is drawn where the samples put it — turned, for a roll or a tumble (turn.mjs) —
 * framed there, and the world's record names each move's model, reason and seconds. A world with no motion is exactly as
 * it was. A `ball` (kind) is the film's own round block, the one that rolls.
 */
import {readMap} from './read.mjs';
import {buildMap} from './build.mjs';
import {mapRun} from './flow.mjs';
import {walkWay} from 'footprint-story/isometric';
import {layCables} from './cables.mjs';
import {notesOf} from './notes.mjs';
import {rideOf, packetsAt} from './ride.mjs';
import {drawMap, lookOf, inAt} from './draw.mjs';
import {drawnOutline} from './turn.mjs';
import {planMotions} from './motion.mjs';

export {ISO_LIMITS, readArrow} from './read.mjs';
export {ISO_FIT} from './build.mjs';
export {ISO_LOOK} from './draw.mjs';
export {PACKET_RADIUS} from './ride.mjs';
export {NOTE_FROM} from './notes.mjs';
export {MOTION_DOS, MOTION_KEYS, MOST_MOTIONS, REEL_CRITICS} from './motion-read.mjs';
export {MOTION_FRAME} from './motion.mjs';

const boxOf = (points) => { const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
const round1 = (v) => Math.round(v * 10) / 10;

/** A floor label's box on the frame: its lines' block laid flat by its matrix, foot on the edge. */
function floorLabelBox(f) {
  const {x, y, matrix: [a, b, c, d], size, lines} = f.place, w = Math.max(...lines.map((l) => [...l].length)) * size * 0.6, h = lines.length * size * 1.15;
  return boxOf([[0, -h], [w, -h], [w, 0], [0, 0]].map(([u, v]) => [x + a * u + c * v, y + b * u + d * v]));
}

/** [from, Infinity) less the hidden spans ([[from, to], …], in order): the stretches a word is on screen to be read. */
function shownSpans(from, hidden) {
  const out = [];
  let at = from;
  for (const [h0, h1] of hidden) {
    if (h1 <= at) continue;
    if (h0 > at) out.push([at, h0]);
    at = Math.max(at, h1);
  }
  if (at < Infinity) out.push([at, Infinity]);
  return out;
}

/** A plain value frozen at every level. */
const frozen = (v) => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); Object.values(v).forEach(frozen); } return v; };

/**
 * The style the map was built in, as footprint-story's record of it (`{row, options}`: a name per column, the options
 * written): the built map's own `style`, so the usual row when the world wrote none. WHY from the built map, not the
 * recipe: the record says what drew the map, with every column the world left out filled in. A copy (the record is
 * plain data), frozen at every level: it sits in the frozen summary, whose other values are numbers and words.
 */
const styleOf = (map) => frozen(structuredClone(map.built.style));

/** What the kit made, for the record and for whoever checks it (a test, an agent): plain numbers, rounded to a tenth of a px. */
function recordOf(map) {
  return {placed: map.placed, tile: map.grid.tile[0], fitted: map.built.grid === 'fitted', style: styleOf(map),
    blocks: map.blocks.map((b) => ({name: b.name, kind: b.kind, at: [...b.at], size: [...b.size], ...(b.fitted ? {lines: [...b.fitted.lines], nameSize: b.fitted.size, fits: b.fitted.fits} : {}), ...(b.rule ? {break: b.rule} : {})})),
    floors: map.floors.map((f) => ({name: f.name, at: [...f.at], size: [...f.size], ...(f.place ? {lines: [...f.place.lines], fits: f.place.fits, covered: f.place.covered} : {})})),
    cables: map.wires.map((w) => ({name: w.name, from: w.arrow.from.block.name, to: w.arrow.to.block.name, along: Boolean(w.route?.points), ...(w.route?.ports?.some(Boolean) ? {ports: [...w.route.ports]} : {}),
      points: w.cable.points.map(([x, y]) => [round1(x), round1(y)]), length: round1(w.cable.length), unseen: w.cable.unseen.map(([lo, hi]) => [round1(lo), round1(hi)]),
      ...(w.route?.points ? {behind: [...w.route.behind], crosses: w.route.crosses, shared: w.route.shared, bends: w.route.bends} : {}), ...(w.riding ? {period: +w.riding.period.toFixed(3)} : {})}))};
}

/** The world, compiled: `spec` the recipe's world entry; `context` the kit context (clock, theme, where). */
export function compileIsometric(spec, context) {
  const {clock, theme, where = 'the isometric world'} = context;
  const map = buildMap(readMap(spec ?? {}, where), where);
  layCables(map);
  // each anchor resolved in the name of the piece that wrote it: a phrase the voice never says names blocks[2].appear
  const at = (p, key) => {
    if (p[key] === null) return null;
    try { return clock.at(p[key]); } catch (e) { throw new Error(`${p.who}: ${key}: ${e.message}`, {cause: e}); }
  };
  for (const p of [...map.blocks, ...map.floors, ...map.wires]) p.appearAt = at(p, 'appear');
  for (const w of map.wires) {
    const start = at(w, 'start') ?? w.appearAt ?? 0;
    w.riding = rideOf(w, w.cable.length, start);
  }
  const notes = Object.freeze(notesOf(map).map((n) => Object.freeze(n)));
  const warned = notes.filter((n) => n.level === 'warn');
  if (map.strict && warned.length) throw new Error(`${where}: the isometric map has ${warned.length} warning${warned.length === 1 ? '' : 's'} (strict: true): ${warned.slice(0, 3).map((n) => n.message.slice(where.length + 2)).join('; ')}${warned.length > 3 ? `; and ${warned.length - 3} more` : ''}`);
  // the blocks that move by intent: every move decided by footprint-story (motion.mjs), timed on the film's clock; none
  // written, nothing planned, and the world is drawn, framed and recorded exactly as before worlds took a motion
  const motion = map.motion.length ? planMotions(map, map.motion, clock, where) : null;
  const look = lookOf(theme), shownAt = (p, t) => p.appearAt === null || t >= p.appearAt;   // named from its moment on, as it starts to come in
  // the moving blocks' poses at t, and the paint order with each where it is now: footprint-story's back-to-front order
  // (grid.backToFront) of every block, a moved one at its pose's place; the built order while nothing has moved yet
  const movedAt = (t) => {
    const poses = new Map(map.blocks.map((b) => [b, motion.poseAt(b, t)]).filter(([, p]) => p));
    return {poses, order: poses.size ? map.grid.backToFront(map.blocks, (b) => ({at: poses.get(b)?.at ?? b.at, size: b.size})) : map.order};
  };
  // whether a moved block covers a block's name at t (motion-cover.mjs): its name is then neither drawn nor listed to read
  const hiddenAt = (b, t) => (motion?.hidden.get(b) ?? []).some(([from, to]) => t >= from && t < to);
  // a block's outline where it is drawn at t: as built, or where its move has put it, turned as it is (turn.mjs)
  // (and a hanging block's rope with it: a camera that frames the block frames what it hangs from)
  const outlineAt = (b, t) => { const pose = motion?.poseAt(b, t) ?? null; return pose ? [...drawnOutline(b, pose, map.grid), ...(pose.rope ?? [])] : b.shape.outline; };
  const walks = map.wires.map((w) => walkWay(w.cable.way));
  return {
    hang: 1,
    sounds: [],
    notes,
    map: Object.freeze({...recordOf(map), ...(motion ? {motions: motion.record} : {})}),
    // the map built again by footprint-story's map flow, its run recorded: `storyreel check` runs it (flow.mjs, check/maps.mjs)
    mapRun: mapRun(map),
    // the moves run again through footprint-story's intent decider as a chart, its run recorded (`storyreel check`:
    // check/motions.mjs), and what its critics found, each naming its entry and the fix (the review's `motion` check)
    ...(motion ? {motionRun: motion.run, motionFindings: motion.findings, motionIntents: motion.intents} : {}),
    // what the film's record keeps of this world (film/summaries.mjs · buildSummary): a few counts and the style it was
    // built in, never the map itself
    summary: Object.freeze({placed: map.placed, tile: map.grid.tile[0], style: styleOf(map), blocks: map.blocks.length, floors: map.floors.length, wires: map.wires.length,
      along: map.wires.filter((w) => w.route?.points).length, packets: map.wires.reduce((n, w) => n + w.packets, 0), ...(motion ? {motions: motion.summary} : {})}),
    draw: motion ? (c, t) => { const {poses, order} = movedAt(t); drawMap(c, map, t, look, {poseOf: (b) => poses.get(b) ?? null, order, hidden: (b) => hiddenAt(b, t)}); } : (c, t) => drawMap(c, map, t, look),
    // every piece by its name, once it has come in: a push or a camera move frames "server"; a label by its own path
    regionsAt: (t) => [
      ...map.floors.flatMap((f) => (shownAt(f, t) ? [{box: boxOf(f.shape.outline), path: f.path, label: f.label ?? `floor ${f.name ?? f.path}`, ...(f.name ? {name: f.name} : {})},
        ...(f.place ? [{box: floorLabelBox(f), path: `${f.path}.label`, label: f.label}] : [])] : [])),
      ...map.wires.flatMap((w, i) => (shownAt(w, t) ? [{box: boxOf(walks[i]), path: w.path, label: w.label ?? `${w.arrow.from.block.name} to ${w.arrow.to.block.name}`, ...(w.name ? {name: w.name} : {})},
        ...(w.label ? [{box: [w.labelAt[0] - w.labelHalf[0], w.labelAt[1] - w.labelHalf[1], w.labelAt[0] + w.labelHalf[0], w.labelAt[1] + w.labelHalf[1]], path: `${w.path}.label`, label: w.label}] : [])] : [])),
      ...map.order.filter((b) => shownAt(b, t)).map((b) => ({box: boxOf(outlineAt(b, t)), path: b.path, label: b.label ?? b.name, name: b.name})),
    ],
    // every label, from when it has come in: the block's name and its small line, a floor's name, a cable's label
    // (a block's name is on screen from when it has come in, less the stretches a moved block covers it: motion-cover.mjs)
    texts: () => [
      ...map.blocks.flatMap((b) => [...(b.fitted?.lines.length ? [{text: b.fitted.lines.join(' '), path: `${b.path}.label`}] : []), ...(b.small ? [{text: b.small, path: `${b.path}.small`}] : [])]
        .flatMap((l) => shownSpans((b.appearAt ?? 0) + 0.35, motion?.hidden.get(b) ?? []).map(([from, to]) => ({...l, from, to})))),
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
