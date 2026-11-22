/**
 * build — the read map handed to footprint-story/isometric · buildIsoMap, and what it built joined back onto the kit's
 * pieces. The steps (place, route, fitFloors, grid, shape, names, order, floorLabels, style) are footprint-story's, the one
 * copy a deck builds its maps with too; the kit's numbers are its film policy (ISO_MAP_POLICIES.film). Nothing is
 * placed, fitted or drawn here. WHY: the kit carried its own copy of these steps until 0.38.0; one copy cannot drift.
 *
 *   specOf(map, where)   the read map (read.mjs · readMap) → buildIsoMap's spec: plain data, each piece's `who` the kit's words,
 *                        and the world's style row (the style step paints each piece's list by it: paint.mjs draws it)
 *   buildMap(map, where) builds it, and puts on each piece the built map's own entries (frozen plain data, never a copy)
 *
 * Tiles in, frame px out (the 1600×900 sheet). The cables are put on the frame by cables.mjs.
 */
import {buildIsoMap, isometric, ISO_MAP_POLICIES} from 'footprint-story/isometric';
import {ballPicture, centreOf, UNTURNED} from './turn.mjs';
import {STYLE_CHOICES} from './read.mjs';
import {ISO_LOOK} from './draw.mjs';
import {inDuotone} from './looks.mjs';

/**
 * The kit's numbers: footprint-story's film policy, StoryReel 0.38.0's own numbers moved there — a fitted tile 96 to
 * 160 px wide (64 at least for a map of groups), 40 px kept clear of the area's edges, a fitted floor's tile round its
 * blocks, a name 26 px down to 16, the small line 18 down to 12, 0.9 of a top's room, every labelled floor held.
 */
export const ISO_FIT = ISO_MAP_POLICIES.film;

/** A plain value frozen at every level (the spec: lists and objects of numbers and words). */
const frozen = (v) => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); Object.values(v).forEach(frozen); } return v; };

/** What the spec names the whole map in a refusal: "stage map: the isometric map: the wires cannot be laid: …". */
const MAP_WHO = 'the isometric map';

/**
 * The read map as buildIsoMap's spec. Each piece's `who` is the kit's own entry words less the recipe entry
 * (`isometric blocks[2] ("db")`): the spec's refusals start with it, and buildMap puts the entry (`stage map: `) back,
 * so a refusal reads as the kit's always did. WHY not the whole words: a spec's `who` is at most 200 letters, and the
 * entry's name is the film's, of any length. A wire names its ends' blocks by name (one name, one piece: read.mjs).
 * A ball (the film's own kind, read.mjs · KINDS) is handed on as the cylinder round it: placed, ordered, routed to and
 * named on its top as that cylinder, which holds the whole ball.
 * A world printed in the duotone palette hands each block with no tone its colour (`colours: {base}`: its own, else the
 * kit's tone), so the duotone tints it; a toned block keeps the page's colour (looks.mjs says why). No other world hands
 * any colour: its spec is as it was.
 */
export function specOf(map, where) {
  const who = (p) => p.who.slice(where.length + 2);   // read.mjs words every piece `${where}: isometric <path>…`
  const tinted = inDuotone(map.style), colours = (b) => (tinted && !b.tone ? {colours: {base: b.color ?? ISO_LOOK.tone}} : {});
  return {
    who: MAP_WHO,
    blocks: map.blocks.map((b) => ({name: b.name, kind: b.kind === 'ball' ? 'cylinder' : b.kind, at: b.at, size: b.size, label: b.label, small: b.small, rule: b.rule, group: b.group,
      ports: b.ports.map(({name, at, face}) => ({name, at, face})), ...colours(b), who: who(b)})),
    // a floor with a size and no at was put at [0, 0] by read.mjs: the spec takes a floor's at and size together
    floors: map.floors.map((f) => ({name: f.name, at: f.at, size: f.size, label: f.label, group: f.group, who: who(f)})),
    wires: map.wires.map((w) => ({name: w.name, from: {block: w.arrow.from.block.name, port: w.arrow.from.port}, to: {block: w.arrow.to.block.name, port: w.arrow.to.port},
      straight: w.arrow.straight, who: who(w)})),
    grid: map.grid,   // {tile, origin, rise?} as read.mjs · readGrid wrote it, or null: fitted into the area
    area: map.area,
    // the style row as the recipe wrote it (read.mjs · readStyle); none written, no key: the spec is today's, byte for
    // byte, so a world with no style builds (and its map flow records) exactly what it did before worlds took one
    ...(map.style ? {style: map.style} : {}),
  };
}

/**
 * The map built (buildIsoMap with the film policy), and each piece given what the steps made for it — `at`, `shape`
 * ({box, centre, outline, faces}: the faces are the style's shape items), `paint` (its paint list: the style step's
 * `paints` / `floorPaints`, what paint.mjs draws), `fitted` and `smallFitted` (a block's name and small line), a
 * floor's `at`, `size`, `shape`, `paint` and label `place`, a wire's `route` (null: written straight) — and
 * the map its `grid` (made again from the built map's numbers: the built map holds no function), `order` (the blocks,
 * furthest first), `built` (the built map itself, frozen) and `spec` (what buildIsoMap was handed, for the map flow:
 * flow.mjs). Mutates the read map and returns it.
 */
export function buildMap(map, where) {
  // the spec is kept on the map (`spec`): the map flow is handed this very spec, never one made again (flow.mjs).
  // Frozen, every level, so nothing can change it between the build and the map flow's run of it.
  const spec = frozen(specOf(map, where));
  let built;
  // the kit's handed style choices beside the spec (read.mjs · STYLE_CHOICES): code, so never in the spec or the record
  try { built = buildIsoMap(spec, ISO_FIT, {choices: STYLE_CHOICES}); } catch (e) { throw new Error(`${where}: ${String(e?.message ?? e).replace(/^isometric: /, '')}`, {cause: e}); }
  map.blocks.forEach((b, i) => Object.assign(b, {at: built.at[i], shape: built.shapes[i], paint: built.paints[i], fitted: built.names[i], smallFitted: built.smalls[i]}));
  map.floors.forEach((f, i) => Object.assign(f, {at: built.floorTiles[i].at, size: built.floorTiles[i].size, shape: built.floorShapes[i], paint: built.floorPaints[i], place: built.floorLabels[i]}));
  map.wires.forEach((w, i) => { w.route = built.routes[i]; });
  const byName = new Map(map.blocks.map((b) => [b.name, b])), grid = isometric(built.view);
  // a ball's shape is the ball's, not its cylinder's: its outline what is drawn (a camera frames it, a cable is hidden
  // behind it), its centre its middle (its name is written there: on the cylinder's top it would float over the ball)
  for (const b of map.blocks.filter((x) => x.kind === 'ball')) {
    const ball = ballPicture(grid, centreOf(b), b.size[0] / 2, UNTURNED), xs = ball.outline.map((p) => p[0]), ys = ball.outline.map((p) => p[1]);
    b.shape = Object.freeze({...b.shape, centre: ball.centre, outline: ball.outline, box: {x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys)}});
  }
  return Object.assign(map, {spec, built, placed: built.placed, grid, order: built.order.map((name) => byName.get(name))});
}
