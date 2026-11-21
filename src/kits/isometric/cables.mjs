/**
 * cables — each wire put on the frame: a cable along the floor where the map laid one (its route's whole path, ports
 * and risers included, corners rounded by footprint-story/isometric · rounded), or a straight line through the air
 * where it is written straight or has no way. Plain numbers in, plain numbers out.
 *
 * StoryDeck's numbers (deck/cable.js, deck/transforms.js), unchanged: a cable's end stands 6 px off the foot it touches,
 * its corners are rounded 0.4 of a tile, its line stops four fifths of an 18 px arrow's head short of the tip, and its
 * label stands on it on a plate, at the first of 13 places from its middle where no block is over it and no other
 * cable runs through (deck/cable.js · labelPlace, carried here: footprint-story keeps "a label's place on a way" out).
 * WHY those numbers and not our own: the film's cable is the deck's cable.
 */
import {rounded} from 'footprint-story/isometric';

export const ISO_CABLE = Object.freeze({clear: 6, corner: 0.4, head: 18, sample: 6, walkMost: 512, label: Object.freeze({size: 18, char: 12, pad: 4}), edge: 3, tip: 16, looks: 60_000_000});
/** Where a label may stand along its cable: the middle first, then a twentieth further to each side by turns, a fifth to four fifths of the way (deck/cable.js · LABEL_PLACES). */
export const LABEL_PLACES = Object.freeze(Array.from({length: 13}, (_, k) => +(0.5 + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 0.05).toFixed(2)));

const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const length = (list) => list.slice(1).reduce((sum, p, i) => sum + dist(list[i], p), 0);
/** `p` moved `by` px towards `towards` (never past half the way there). */
const off = (p, towards, by) => { const far = dist(p, towards) || 1, k = Math.min(by, far / 2) / far; return [p[0] + (towards[0] - p[0]) * k, p[1] + (towards[1] - p[1]) * k]; };

/** A way walked from share `from` to share `to`: points ISO_CABLE.sample px apart at most (and never more than walkMost). */
export function walk(way, from = 0, to = 1) {
  const steps = Math.min(ISO_CABLE.walkMost, Math.max(1, Math.ceil(((to - from) * way.length) / ISO_CABLE.sample)));
  return Array.from({length: steps + 1}, (_, k) => way.at(from + ((to - from) * k) / steps));
}

/** Whether a point is inside an outline (its points in order round it). */
export function inside(outline, [x, y]) {
  let odd = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, yi] = outline[i], [xj, yj] = outline[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) odd = !odd;
  }
  return odd;
}

/** Where the segment from `a` (inside an outline) towards `b` leaves the outline: the last crossing of its edges, or `a`. */
function exitPoint(outline, a, b) {
  let best = 0;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const p = outline[j], q = outline[i], d = [b[0] - a[0], b[1] - a[1]], e = [q[0] - p[0], q[1] - p[1]], den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-12) continue;
    const s = ((p[0] - a[0]) * e[1] - (p[1] - a[1]) * e[0]) / den, u = ((p[0] - a[0]) * d[1] - (p[1] - a[1]) * d[0]) / den;
    if (s >= 0 && s <= 1 && u >= 0 && u <= 1) best = Math.max(best, s);
  }
  return [a[0] + (b[0] - a[0]) * best, a[1] + (b[1] - a[1]) * best];
}

/** A port's place on the frame: its block's corner plus the port's own tiles. */
const portPoint = (grid, block, name) => { const p = block.ports.find((q) => q.name === name); const at = grid.at(block.at[0] + p.at[0], block.at[1] + p.at[1], block.at[2] + p.at[2]); return [at.x, at.y]; };

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
  if (!ports[0]) points[0] = off(points[0], points[1], ISO_CABLE.clear);
  if (!ports[1]) points[points.length - 1] = off(points.at(-1), points.at(-2), ISO_CABLE.clear);
  const riser = (p) => (p[2] ?? lift) > lift + 1e-9;
  const ends = [0, 1].map((k) => (ports[k] ? {seen: route.feet[k] === 'right' || route.feet[k] === 'left', count: riser(k ? path.at(-1) : path[0]) ? 3 : 2} : null));
  const back = w.head ? ISO_CABLE.head * 0.8 : 0, tip = points.at(-1), before = points.at(-2), by = Math.max(0, Math.min(back, dist(tip, before) - 1));
  const way = rounded([...points.slice(0, -1), off(tip, before, by)], ISO_CABLE.corner * tile);
  // a lead's share: the run out of the port, its riser and on to the floor point (what a block in front of the port does not cover)
  const leadPx = (k) => (ends[k] ? length(k ? points.slice(-ends[k].count) : points.slice(0, ends[k].count)) : 0);
  const leads = [0, 1].map((k) => (ends[k]?.seen ? Math.min(1, leadPx(k) / way.length) : null));
  const start = leadPx(0);
  return {points, way, length: way.length, tile, ends, leads, unseen: route.unseen.map(([lo, hi]) => [start + lo * tile, start + hi * tile])};
}

/** A wire drawn straight, through the air: from where a line between the two leaves one outline to where it meets the other (a port end: the port). */
function straightOf(w, grid) {
  const {from, to} = w.arrow, mid = (b) => b.shape.centre;
  const a0 = from.port ? portPoint(grid, from.block, from.port) : mid(from.block), b0 = to.port ? portPoint(grid, to.block, to.port) : mid(to.block);
  const a = from.port ? a0 : exitPoint(from.block.shape.outline, a0, b0), b = to.port ? b0 : exitPoint(to.block.shape.outline, b0, a0);
  const back = w.head ? ISO_CABLE.head * 0.8 : 0, by = Math.max(0, Math.min(back, dist(a, b) - 1));
  const way = rounded([a, off(b, a, by)], 0);
  return {points: [a, b], way, length: way.length, tile: 0, ends: [null, null], leads: [null, null], unseen: []};
}

/** The half-size of a label's plate: a generous width a letter, the line's height, a little air (deck/transforms.js · labelBox). */
export const labelHalf = (label) => [([...label].length * ISO_CABLE.label.char) / 2 + ISO_CABLE.label.pad, ISO_CABLE.label.size / 2 + ISO_CABLE.label.pad];

/**
 * Where a cable's label stands (deck/cable.js · labelPlace): the first of LABEL_PLACES where no outline in `hides` (the
 * blocks, and the labels placed before) covers its plate and no other cable's walk runs through it; else the place
 * where the least of it is hidden, then the least crossed, then the earliest. `looks` bounds the work for the world.
 */
function labelAt(cable, half, hides, runs, looks) {
  const {sample, edge, tip: tipPx} = ISO_CABLE, way = cable.way;
  const across = Math.max(1, Math.ceil((2 * half[0]) / sample)), down = Math.max(1, Math.ceil((2 * half[1]) / sample));
  const box = ([x, y], r) => [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]];
  const ends = [box(cable.points.at(-1), tipPx), box(way.start, tipPx / 2)], over = [...hides, ...ends];
  let best = null;
  for (const t of LABEL_PLACES) {
    const at = way.at(t), near = over.filter((o) => o.some(([x, y]) => Math.abs(x - at[0]) < half[0] + 200 && Math.abs(y - at[1]) < half[1] + 200));
    const cost = (across + 1) * (down + 1) * near.reduce((n, o) => n + o.length, 0) + runs.reduce((n, r) => n + r.length, 0);
    if (cost > looks.left) break;
    looks.left -= cost;
    let hidden = 0, crossed = 0;
    for (let i = 0; near.length && i <= across; i++) for (let j = 0; j <= down; j++) {
      const p = [at[0] - half[0] + (2 * half[0] * i) / across, at[1] - half[1] + (2 * half[1] * j) / down];
      if (near.some((o) => inside(o, p))) hidden += 1;
    }
    for (const run of runs) for (const [x, y] of run) if (Math.abs(x - at[0]) < half[0] + edge && Math.abs(y - at[1]) < half[1] + edge) crossed += 1;
    if (!hidden && !crossed) return at;
    if (!best || hidden < best.hidden || (hidden === best.hidden && crossed < best.crossed)) best = {at, hidden, crossed};
  }
  return best ? best.at : way.at(0.5);
}

/**
 * Every wire on the frame: w.cable (cableOf or straightOf), and w.labelAt / w.labelHalf for one with a label. A wire is
 * straight when it is written so, or when the map found it no way (its route's `why`).
 */
export function layCables(map) {
  const {grid} = map, o = grid.at(0, 0), x = grid.at(1, 0), tile = Math.hypot(x.x - o.x, x.y - o.y);
  for (const w of map.wires) w.cable = w.route?.points ? cableOf(w, grid, tile) : straightOf(w, grid);
  const walks = map.wires.map((w) => walk(w.cable.way)), hides = map.blocks.map((b) => b.shape.outline), looks = {left: ISO_CABLE.looks};
  map.wires.forEach((w, i) => {
    if (!w.label) return;
    w.labelHalf = labelHalf(w.label);
    w.labelAt = labelAt(w.cable, w.labelHalf, hides, walks.filter((_, k) => k !== i), looks);
    const [lx, ly] = w.labelAt, [hx, hy] = w.labelHalf;
    hides.push([[lx - hx, ly - hy], [lx + hx, ly - hy], [lx + hx, ly + hy], [lx - hx, ly + hy]]);
  });
}
