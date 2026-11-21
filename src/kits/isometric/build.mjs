/**
 * build — the map's numbers, all from footprint-story/isometric: where each block stands (arrange, arrangeByGroup), the
 * way each wire runs along the floor (routes, with its ports), the grid that fits the picture into the frame (gridFor),
 * the floors fitted round what stands on them, each block's faces (block, cylinder), its name fitted to its top
 * (wordsToFit with room), the order they are painted in (backToFront) and where each floor's name lies (floorLabelPlace).
 * Nothing is drawn here. WHY one place: a deck builds a map in deck/iso.js with these same calls in this same order,
 * so a film and a deck place, lay and fit the same map the same way.
 *
 * Tiles in, frame px out (the 1600×900 sheet). The cables are put on the frame by cables.mjs.
 */
import {arrange, arrangeByGroup, floorLabelPlace, gridFor, isometric, routes, wordsToFit, GROUP_MARGIN} from 'footprint-story/isometric';

/**
 * StoryDeck's numbers (deck/iso.js), unchanged: a fitted tile 96 to 160 px wide (64 at least for a map of groups), the
 * px a fitted picture keeps clear of the area's edges, the tiles of floor a fitted floor shows round its blocks, a
 * name's size and the least it shrinks to, and the share of a top's room a name is given. The small line's 18 px is
 * StoryDeck's too (.iso-say small); the least it shrinks to, 12, is the film's.
 */
export const ISO_FIT = Object.freeze({most: 160, least: 96, grouped: 64, inset: 40, margin: 1, name: Object.freeze({size: 26, least: 16}), small: Object.freeze({size: 18, least: 12}), clear: 0.9});

/** Where each block stands when none has an at: by group when any has one (arrangeByGroup), else across the frame (arrange). */
function placeBlocks(map, where) {
  if (map.placed === 'hand') return;
  const links = map.wires.map((w) => [w.arrow.from.block.name, w.arrow.to.block.name]);
  let at;
  try {
    at = map.blocks.some((b) => b.group !== null)
      ? arrangeByGroup(map.blocks.map((b) => ({name: b.name, size: b.size, group: b.group})), links)
      : arrange(map.blocks.map((b) => ({name: b.name, size: b.size})), links, {across: true}).things.map((t) => t.at);
  } catch (e) {
    throw new Error(`${where}: the isometric blocks cannot be placed from their wires: ${e.message.replace(/^isometric: /, '')} — or give every block an at`, {cause: e});
  }
  map.blocks.forEach((b, i) => { b.at = [at[i][0], at[i][1], at[i][2] ?? 0]; });
}

/**
 * Every wire laid along the floor (routes): the kit knows each block by its index, so a refusal of a name is never the
 * kit's. A wire written straight (a trailing bend) is not laid. Gives each wire {route} — the kit's answer (its `why`
 * when it has no way) — or {route: null} for a straight one.
 */
function layWires(map, where) {
  const things = map.blocks.map((b, i) => ({name: String(i), at: b.at, size: b.size, round: b.kind === 'cylinder', ...(b.ports.length ? {ports: b.ports.map(({name, at, face}) => ({name, at, face}))} : {})}));
  const idOf = (b) => String(map.blocks.indexOf(b)), end = ({block, port}) => (port ? {thing: idOf(block), port} : idOf(block));
  const asked = map.wires.filter((w) => !w.arrow.straight);
  let found = [];
  try { found = asked.length ? routes(things, asked.map((w) => [end(w.arrow.from), end(w.arrow.to)])) : []; } catch (e) { throw new Error(`${where}: the isometric wires cannot be laid: ${e.message.replace(/^isometric: /, '')} — check each wire's arrow and the blocks' ports`, {cause: e}); }
  const nameOf = (id) => map.blocks[Number(id)].name;
  for (const w of map.wires) {
    const k = asked.indexOf(w), r = k < 0 ? null : found[k];
    w.route = r && {...r, from: w.arrow.from.block.name, to: w.arrow.to.block.name, ...(r.behind ? {behind: r.behind.map(nameOf)} : {})};
  }
}

/** The floor points the laid wires reach, [[col, row, lift], …]: a wire round a block reaches past the blocks. */
const reachOf = (map) => map.wires.flatMap((w) => (w.route?.points ? (w.route.path ?? []).map(([c, r, h]) => [c, r, h ?? 0]) : []));

/** Each floor with no size fitted round the blocks on it (its group's, or all and their wires), a tile showing on every side. */
function fitFloors(map, reach) {
  for (const f of map.floors) {
    if (f.size !== null) continue;
    const on = f.group === null ? map.blocks : map.blocks.filter((b) => b.group === f.group), reached = f.group === null ? reach : [];
    const margin = f.group === null ? ISO_FIT.margin : GROUP_MARGIN;
    const far = (axis, end) => (end ? Math.ceil(Math.max(...on.map((b) => b.at[axis] + b.size[axis]), ...reached.map((p) => p[axis])) - 1e-9) : Math.floor(Math.min(...on.map((b) => b.at[axis]), ...reached.map((p) => p[axis])) + 1e-9));
    f.at = [far(0, false) - margin, far(1, false) - margin];
    f.size = [far(0, true) + margin - f.at[0], far(1, true) + margin - f.at[1]];
    if (Math.max(...f.size) > 256) throw new Error(`${f.who}: fitted round its blocks the floor would be ${f.size[0]} by ${f.size[1]} tiles, and a floor is at most 256 a side — give it an at and a size of its own, or take it out`);
  }
}

/**
 * The grid: written in numbers, or fitted so the blocks — and the floor their wires reach, and every floor that names a
 * group or has a label — fill the area. WHY a labelled floor is held too (StoryDeck holds only a group's floor, and lets
 * any other run past the slide, where a click's camera can frame it): a film shows its whole frame, and a floor's name
 * run off it is a name nobody reads.
 */
function gridOf(map, where) {
  // the grid's own refusal, in the entry's name: isometric() and gridFor() say what is wrong with a number, never where
  const named = (what, make) => { try { return make(); } catch (e) { throw new Error(`${where}: isometric ${what}: ${e.message.replace(/^isometric: /, '')}`, {cause: e}); } };
  if (map.grid) return named('grid', () => isometric(map.grid));
  const [x0, y0, x1, y1] = map.area, inset = Math.min(ISO_FIT.inset, (x1 - x0) / 4, (y1 - y0) / 4);
  const held = map.floors.filter((f) => f.group !== null || f.label).flatMap(({at: [c, r], size: [w, d]}) => [[c, r, 0], [c + w, r, 0], [c, r + d, 0], [c + w, r + d, 0]]);
  const grouped = map.blocks.some((b) => b.group !== null);
  return named('picture (fitted into the area)', () => gridFor(map.blocks.map((b) => ({at: b.at, size: b.size})), [x0 + inset, y0 + inset, x1 - inset, y1 - inset],
    {most: ISO_FIT.most, least: grouped ? ISO_FIT.grouped : ISO_FIT.least, also: [...reachOf(map), ...held]}));
}

/** A round thing's outline as points round it: the upper half of its top, then the lower half of its foot (StoryDeck's roundOutline). */
function roundOutline(top, bottom, steps = 12) {
  const arc = (e, from) => Array.from({length: steps + 1}, (_, i) => { const a = from + (Math.PI * i) / steps; return [e.cx + e.rx * Math.cos(a), e.cy + e.ry * Math.sin(a)]; });
  return [...arc(top, Math.PI), ...arc(bottom, 0)];
}

/** Each block's faces on the frame, its outline, the middle of its top and its name fitted there: block.shape. */
function shapeBlocks(map, grid) {
  for (const b of map.blocks) {
    const thing = {at: b.at, size: b.size};
    if (b.kind === 'cylinder') {
      const c = grid.cylinder(thing);
      b.shape = {kind: 'cylinder', top: c.top, bottom: c.bottom, centre: [c.centre.x, c.centre.y], box: c.box, outline: roundOutline(c.top, c.bottom), room: (high) => grid.room({...thing, round: true}, high)};
    } else {
      const k = grid.block(thing), xy = (list) => list.map(({x, y}) => [x, y]);
      b.shape = {kind: 'block', top: xy(k.top), left: xy(k.left), right: xy(k.right), centre: [k.centre.x, k.centre.y], box: k.box, outline: xy(k.outline), room: (high) => grid.room(thing, high)};
    }
    // the name made to fit the top: one line at 26 px, else two, else smaller down to 16 (the same rule a deck uses)
    b.fitted = b.label ? wordsToFit(b.label, (high) => ISO_FIT.clear * b.shape.room(high), ISO_FIT.name) : null;
    // the small line under it, on one line in the room the top has at the stack's foot (the diamond narrows below its
    // middle): a deck leaves its <small> as written; a film's frame is smaller, and a line off its block reads as noise
    if (b.small) {
      const {size, least} = ISO_FIT.small, high = b.fitted.lines.length * b.fitted.size * 1.15 + 2 + size * 1.15;
      b.smallFitted = wordsToFit(b.small, [Math.max(1, ISO_FIT.clear * b.shape.room(high)), size * 1.15], {size, least});
    }
  }
}

/** Each floor's tile lines and outline on the frame, and where its label lies, clear of what is drawn over it (`covers`). */
function shapeFloors(map, grid, covers) {
  for (const f of map.floors) {
    let g;
    try { g = grid.floor({cols: f.size[0], rows: f.size[1], at: f.at}); } catch (e) { throw new Error(`${f.who}: ${e.message.replace(/^isometric: /, '')}`, {cause: e}); }
    f.shape = {outline: g.outline.map(({x, y}) => [x, y]), lines: g.lines, box: g.box};
    try { f.place = f.label ? floorLabelPlace({at: f.at, size: f.size}, grid, f.label, covers) : null; } catch (e) { throw new Error(`${f.who}: its label: ${e.message.replace(/^isometric: /, '')}`, {cause: e}); }
  }
}

/**
 * The map built: blocks placed, wires laid, the grid, the floors, each block's shape and fitted name, and the order the
 * blocks are painted in (furthest first). Mutates the read map (read.mjs · readMap) and returns it with `grid`, `order`.
 */
export function buildMap(map, where) {
  placeBlocks(map, where);
  layWires(map, where);
  fitFloors(map, reachOf(map));
  const grid = gridOf(map, where);
  shapeBlocks(map, grid);
  const order = grid.backToFront(map.blocks, (b) => ({at: b.at, size: b.size}));
  Object.assign(map, {grid, order});
  // what a floor's label keeps clear of: each block's outline, and each stretch of a laid cable as two points (StoryDeck's covers)
  const covers = map.floors.some((f) => f.label) ? [...map.blocks.map((b) => b.shape.outline),
    ...map.wires.flatMap((w) => { const path = w.route?.points ? w.route.path : []; return path.slice(1).map((b, i) => [path[i], b].map(([c, r, h]) => { const p = grid.at(c, r, h ?? 0); return [p.x, p.y]; })); })] : [];
  shapeFloors(map, grid, covers);
  return map;
}
