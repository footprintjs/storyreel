/**
 * cables — each wire put on the frame: a cable along the floor where the map laid one (its route's whole path, ports
 * and risers included, corners rounded by footprint-story/isometric · rounded), or a straight line through the air
 * where it is written straight or has no way. Plain numbers in, plain numbers out.
 *
 * StoryDeck's numbers (deck/cable.js, deck/transforms.js), unchanged: a cable's end stands 6 px off the foot it touches,
 * a straight wire's 6 px off the outline (GAP), two straight wires on one pair at most 80 px apart (LANE), at least 12 px
 * of wire between two blocks, its corners are rounded 0.4 of a tile, its line stops four fifths of an 18 px arrow's head short of the tip, and its
 * label stands on it on a plate, at the first of 13 places from its middle where no block is over it and no other
 * cable runs through (deck/cable.js · labelPlace, carried here: footprint-story keeps "a label's place on a way" out).
 * WHY those numbers and not our own: the film's cable is the deck's cable.
 */
import {rounded} from 'footprint-story/isometric';

export const ISO_CABLE = Object.freeze({clear: 6, gap: 6, lane: 80, least: 12, corner: 0.4, head: 18, sample: 6, walkMost: 512, label: Object.freeze({size: 18, char: 12, pad: 4}), edge: 3, tip: 16, looks: 60_000_000});
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

/**
 * How far a ray from `p` (inside an outline) along the unit vector `u` runs before it leaves the outline, through
 * whichever side it crosses: Infinity when it crosses none (deck/boxes.js · exitOutline, carried here).
 */
export function exitOutline(points, [px, py], [ux, uy]) {
  let least = Infinity;
  points.forEach(([ax, ay], i) => {
    const [bx, by] = points[(i + 1) % points.length], ex = bx - ax, ey = by - ay, cross = ux * ey - uy * ex;
    if (Math.abs(cross) < 1e-12) return;   // the ray runs along this side: it leaves by another
    const t = ((ax - px) * ey - (ay - py) * ex) / cross, along = ((ax - px) * uy - (ay - py) * ux) / cross;
    if (t > 1e-9 && along >= -1e-9 && along <= 1 + 1e-9) least = Math.min(least, t);
  });
  return least;
}

/**
 * A quadratic curve from `a` to `e` drawn towards `c`, as a way: {start, pieces, length, at(share)} — the shape
 * `rounded` gives, so a straight wire is drawn and ridden as a cable is (a packet stands at a share of its length).
 * Walked in 64 straight runs, as StoryDeck measures a curve (deck/rides.js · curveLength).
 */
export function curveWay(a, c, e, runs = 64) {
  const pts = Array.from({length: runs + 1}, (_, k) => { const t = k / runs; return [0, 1].map((i) => (1 - t) * (1 - t) * a[i] + 2 * (1 - t) * t * c[i] + t * t * e[i]); });
  const along = [0];
  for (let k = 1; k <= runs; k++) along.push(along[k - 1] + dist(pts[k - 1], pts[k]));
  const length = along[runs];
  const at = (share) => {
    const want = Math.max(0, Math.min(1, share)) * length;
    let k = 1;
    while (k < runs && along[k] < want) k++;
    const span = along[k] - along[k - 1], u = span > 0 ? (want - along[k - 1]) / span : 0;
    return [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * u, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * u];
  };
  return {start: [...a], pieces: [{corner: [...c], to: [...e]}], length, at};
}

/**
 * The wires drawn straight, through the air — written with a bend ("a to b 0", "a to b 40"), or with no way along the
 * floor — by StoryDeck's rule (deck/transforms.js · wiresBetween, carried here): the wires joining one pair are spread
 * across the line between the two blocks' middles, LANE apart at most and inside both, those running one way first
 * (each keeps to its left); each runs from GAP px off one block's outline to GAP px off the other's, and fewer than 12
 * px between is refused (the blocks touch or overlap). A bend curves it that many px off its straight line.
 */
function layStraight(map, wires) {
  const {gap, lane: LANE, least} = ISO_CABLE, middle = (b) => [b.shape.box.x + b.shape.box.w / 2, b.shape.box.y + b.shape.box.h / 2];
  const pairOf = (w) => [w.arrow.from.block.name, w.arrow.to.block.name].sort().join('\u{0}'), lanes = new Map();
  for (const w of wires) lanes.set(pairOf(w), [...(lanes.get(pairOf(w)) ?? []), w]);
  for (const [key, list] of lanes) { const along = (w) => w.arrow.from.block.name === key.split('\u{0}')[0]; lanes.set(key, [...list.filter(along), ...list.filter((w) => !along(w))]); }
  for (const w of wires) {
    const [A, B] = [w.arrow.from.block, w.arrow.to.block].sort((p, q) => (p.name < q.name ? -1 : 1)), ca = middle(A), cb = middle(B), len = dist(ca, cb);
    if (len === 0) throw new Error(`${w.who}: ${A.name} and ${B.name} share a middle on the frame — move one of them (give it another at)`);
    const u = [(cb[0] - ca[0]) / len, (cb[1] - ca[1]) / len], n = [-u[1], u[0]], neg = (v) => [-v[0], -v[1]];
    const across = (b) => Math.min(exitOutline(b.shape.outline, middle(b), n), exitOutline(b.shape.outline, middle(b), neg(n)));
    const lane = lanes.get(pairOf(w)), k = lane.indexOf(w), most = Math.max(0, Math.min(across(A), across(B)) - 8);
    const step = lane.length > 1 ? Math.min(LANE, (2 * most) / (lane.length - 1)) : 0, off = (k - (lane.length - 1) / 2) * step;
    const pa = [ca[0] + n[0] * off, ca[1] + n[1] * off], pb = [cb[0] + n[0] * off, cb[1] + n[1] * off];
    const ta = exitOutline(A.shape.outline, pa, u) + gap, tb = exitOutline(B.shape.outline, pb, neg(u)) + gap;
    if (!(len - ta - tb >= least)) {
      const why = w.route?.why;
      throw new Error(why ? `${w.who}: no way along the floor was laid for it (${why}), and ${A.name} and ${B.name} are too close for a straight wire between them — move them apart (at)`
        : `${w.who}: ${A.name} and ${B.name} are too close for a wire between them (they touch or overlap) — move them apart (at)`);
    }
    const start = [pa[0] + u[0] * ta, pa[1] + u[1] * ta], end = [pb[0] - u[0] * tb, pb[1] - u[1] * tb];
    const [a, e] = w.arrow.from.block === A ? [start, end] : [end, start];
    // one curve with one control point beside the middle of the run, `bend` px off it (deck/transforms.js · wireSvg)
    const dx = e[0] - a[0], dy = e[1] - a[1], l = Math.hypot(dx, dy) || 1, bend = w.arrow.bend;
    const c = [(a[0] + e[0]) / 2 - (dy / l) * bend, (a[1] + e[1]) / 2 + (dx / l) * bend];
    const tl = dist(c, e) || 1, back = w.head ? ISO_CABLE.head * 0.8 : 0, tip = [e[0] - ((e[0] - c[0]) / tl) * back, e[1] - ((e[1] - c[1]) / tl) * back];
    const way = curveWay(a, c, tip);
    w.cable = {points: [a, c, e], way, length: way.length, tile: 0, ends: [null, null], leads: [null, null], unseen: []};
  }
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
 * Every wire on the frame: w.cable (cableOf, or layStraight's curve), and w.labelAt / w.labelHalf for one with a label. A wire is
 * straight when it is written so, or when the map found it no way (its route's `why`).
 */
export function layCables(map) {
  const {grid} = map, o = grid.at(0, 0), x = grid.at(1, 0), tile = Math.hypot(x.x - o.x, x.y - o.y);
  for (const w of map.wires) if (w.route?.points) w.cable = cableOf(w, grid, tile);
  layStraight(map, map.wires.filter((w) => !w.route?.points));
  const walks = map.wires.map((w) => walk(w.cable.way)), hides = map.blocks.map((b) => b.shape.outline), looks = {left: ISO_CABLE.looks};
  map.wires.forEach((w, i) => {
    if (!w.label) return;
    w.labelHalf = labelHalf(w.label);
    w.labelAt = labelAt(w.cable, w.labelHalf, hides, walks.filter((_, k) => k !== i), looks);
    const [lx, ly] = w.labelAt, [hx, hy] = w.labelHalf;
    hides.push([[lx - hx, ly - hy], [lx + hx, ly - hy], [lx + hx, ly + hy], [lx - hx, ly + hy]]);
  });
}
