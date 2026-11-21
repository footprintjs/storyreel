/**
 * cables — each wire put on the frame: a cable along the floor where the map laid one (its route's whole path, ports
 * and risers included, corners rounded by footprint-story/isometric · rounded), or a straight line through the air
 * where it is written straight or has no way. Plain numbers in, plain numbers out.
 *
 * The numbers and the rules are footprint-story/isometric's, as StoryDeck's are (moved there from both tools in
 * 0.35.0): a cable's end stands CABLE.clear (6) px off the foot it touches, its corners are rounded CABLE.corner of a
 * tile, its line stops CABLE.headShort of an 18 px head short of the tip; a straight wire's lanes, ends and bend are
 * lanesOf, straightRun and bentWire, and its curve is curveWay; a label's plate is labelHalf and its place on the
 * cable labelPlace (the first of 13 places from its middle where no block is over it and no other cable runs through).
 * WHY those and not our own: the film's cable is the deck's cable.
 */
import {bentWire, curveWay, held, labelHalf, labelPlace, lanesOf, rounded, straightRun, walkWay, CABLE} from 'footprint-story/isometric';

const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const length = (list) => list.slice(1).reduce((sum, p, i) => sum + dist(list[i], p), 0);
/** `p` moved `by` px towards `towards` (never past half the way there). */
const off = (p, towards, by) => { const far = dist(p, towards) || 1, k = Math.min(by, far / 2) / far; return [p[0] + (towards[0] - p[0]) * k, p[1] + (towards[1] - p[1]) * k]; };

/**
 * One laid wire on the frame (a route with points): {points, way, length, tile, ends, leads, unseen} — `points` its way
 * from 6 px off one foot (or its port) to the other, `way` its line rounded and stopped short for its head, `ends` each
 * port end's {seen, count} (null at a foot), `leads` the shares of the line a lead into a port on a seen side holds
 * (drawn again over its block), `unseen` the stretches a block hides in px along the line.
 */
function cableOf(w, grid, tile) {
  const route = w.route, lift = w.arrow.from.block.at[2];
  const path = route.path ?? route.points.map(([c, r]) => [c, r, lift]);
  const points = path.map(([c, r, h]) => { const p = grid.at(c, r, h ?? lift); return [p.x, p.y]; });
  const ports = route.ports ?? [null, null];
  if (!ports[0]) points[0] = off(points[0], points[1], CABLE.clear);
  if (!ports[1]) points[points.length - 1] = off(points.at(-1), points.at(-2), CABLE.clear);
  const riser = (p) => (p[2] ?? lift) > lift + 1e-9;
  const ends = [0, 1].map((k) => (ports[k] ? {seen: route.feet[k] === 'right' || route.feet[k] === 'left', count: riser(k ? path.at(-1) : path[0]) ? 3 : 2} : null));
  const back = w.head ? CABLE.head * CABLE.headShort : 0, tip = points.at(-1), before = points.at(-2), by = Math.max(0, Math.min(back, dist(tip, before) - 1));
  const way = rounded([...points.slice(0, -1), off(tip, before, by)], CABLE.corner * tile);
  // a lead's share: the run out of the port, its riser and on to the floor point (what a block in front of the port does not cover)
  const leadPx = (k) => (ends[k] ? length(k ? points.slice(-ends[k].count) : points.slice(0, ends[k].count)) : 0);
  const leads = [0, 1].map((k) => (ends[k]?.seen ? Math.min(1, leadPx(k) / way.length) : null));
  const start = leadPx(0);
  return {points, way, length: way.length, tile, ends, leads, unseen: route.unseen.map(([lo, hi]) => [start + lo * tile, start + hi * tile])};
}

/**
 * The wires drawn straight, through the air — written with a bend ("a to b 0", "a to b 40"), or with no way along the
 * floor — by StoryDeck's rule, footprint-story's (lanesOf, straightRun): the wires joining one pair are spread across the
 * line between the two blocks' middles, CABLE.lane apart at most and inside both, those running one way first (each
 * keeps to its left); each runs from CABLE.gap px off one block's outline to CABLE.gap px off the other's, and fewer
 * than CABLE.least px between is refused (the blocks touch or overlap). A bend curves it that many px off its straight
 * line (bentWire), and the curve is a way a packet rides by length (curveWay).
 */
function layStraight(map, wires) {
  const middle = (b) => [b.shape.box.x + b.shape.box.w / 2, b.shape.box.y + b.shape.box.h / 2];
  const lanes = lanesOf(wires.map((w) => [w.arrow.from.block.name, w.arrow.to.block.name]));
  wires.forEach((w, i) => {
    // in the pair's own direction (its names in order), so the wires both ways share one set of lanes
    const [A, B] = lanes[i].flip ? [w.arrow.to.block, w.arrow.from.block] : [w.arrow.from.block, w.arrow.to.block];
    const run = straightRun({middle: middle(A), outline: A.shape.outline}, {middle: middle(B), outline: B.shape.outline}, lanes[i]);
    if (run.why === 'middle') throw new Error(`${w.who}: ${A.name} and ${B.name} share a middle on the frame — move one of them (give it another at)`);
    if (run.why === 'close') {
      const why = w.route?.why;
      throw new Error(why ? `${w.who}: no way along the floor was laid for it (${why}), and ${A.name} and ${B.name} are too close for a straight wire between them — move them apart (at)`
        : `${w.who}: ${A.name} and ${B.name} are too close for a wire between them (they touch or overlap) — move them apart (at)`);
    }
    const [a, e] = lanes[i].flip ? [run.end, run.start] : [run.start, run.end];
    const bent = bentWire(a, e, w.arrow.bend, w.head ? CABLE.head * CABLE.headShort : 0), way = curveWay(a, bent.corner, bent.tip);
    w.cable = {points: [a, bent.corner, e], way, length: way.length, tile: 0, ends: [null, null], leads: [null, null], unseen: []};
  });
}

/**
 * Every wire on the frame: w.cable (cableOf, or layStraight's curve), and w.labelAt / w.labelHalf for one with a label. A wire is
 * straight when it is written so, or when the map found it no way (its route's `why`).
 */
export function layCables(map) {
  const {grid} = map, o = grid.at(0, 0), x = grid.at(1, 0), tile = Math.hypot(x.x - o.x, x.y - o.y);
  for (const w of map.wires) if (w.route?.points) w.cable = cableOf(w, grid, tile);
  layStraight(map, map.wires.filter((w) => !w.route?.points));
  // what a label keeps clear of: the blocks, the labels placed before it, and every other cable's walk (its own passed
  // over by its way) — the map's labels sharing one count of looks (CABLE.looks)
  const runs = map.wires.map((w) => ({...held(walkWay(w.cable.way)), of: w.cable.way})), hides = map.blocks.map((b) => held(b.shape.outline)), looks = {left: CABLE.looks};
  for (const w of map.wires) {
    if (!w.label) continue;
    w.labelHalf = labelHalf([...w.label].length);
    w.labelAt = labelPlace(w.cable.way, w.labelHalf, hides, runs, looks, w.cable.points.at(-1));
    const [lx, ly] = w.labelAt, [hx, hy] = w.labelHalf;
    hides.push(held([[lx - hx, ly - hy], [lx + hx, ly - hy], [lx + hx, ly + hy], [lx - hx, ly + hy]]));
  }
}
