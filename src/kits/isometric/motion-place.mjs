/**
 * motion-place — where things are in an isometric world while its pieces move: places in tiles, what a block lands on,
 * whether a place is on the frame, a moving foot's place worked back from where it is drawn, and whether a move passes
 * through another block. Pure numbers on the built map's grid; nothing is planned (motion.mjs) or drawn here.
 *
 *   footOf(at, size) / topOf(at, size) / cornerOf(foot, size)   a block's foot and top from its corner `at`, and back
 *   landingUnder(at, size, others)                              the highest top under a block that is not above it
 *   overTop(foot, under)                                        whether a foot is over that top (the floor holds everywhere)
 *   offFrame(px)                                                null, or how far off the 1600×900 frame a point is
 *   drawnOff(outline, rope)                                     what of a drawn block (or its rope) is off the frame
 *   footTiles(grid)                                             a moving foot's place from where it is on the frame
 *   sweptThrough(size, from, to, others)                        the block it goes deepest into on a straight stretch, and how deep, or null
 *   posed(point, pose)                                          a point of a block as built, where its pose puts it
 *
 * WHY its own module: motion.mjs plans and records; these are the facts it plans from, each one rule, read once.
 */

/** A block's foot and top in tiles (the middle of its footprint, at its lift and at its height), and its corner from its foot. */
export const footOf = (at, size) => [at[0] + size[0] / 2, at[1] + size[1] / 2, at[2] ?? 0];
export const topOf = (at, size) => [at[0] + size[0] / 2, at[1] + size[1] / 2, (at[2] ?? 0) + size[2]];
export const cornerOf = (foot, size) => [foot[0] - size[0] / 2, foot[1] - size[1] / 2, foot[2]];

/** How close two numbers may be and still count as one place, in tiles: far under what a pixel shows. */
const SAME = 1e-6;
/**
 * How deep a moving block may go into another before it is said to pass through it, in tiles: a twentieth of a tile.
 * Ours. WHY not 0: a block resting on a top touches it, and a place worked back from the frame (footTiles) is exact only
 * to a few billionths.
 */
export const THROUGH_MOST = 0.05;

/** How far two spans overlap (0 when they do not). */
const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/**
 * Where a block falls to: the highest top of the `others` ({block, at} each, at a corner) whose footprint overlaps its
 * own and which is not above its foot, else the floor — {lift, block, at}, block null for the floor, `at` that block's
 * corner (null for the floor). WHY the highest: a box dropped over a server lands on the server, never through it to the
 * floor.
 */
export function landingUnder(at, size, others) {
  let best = {lift: 0, block: null, at: null};
  for (const o of others) {
    const top = (o.at[2] ?? 0) + o.block.size[2];
    if (top > (at[2] ?? 0) + SAME || top <= best.lift) continue;
    if (overlap(at[0], at[0] + size[0], o.at[0], o.at[0] + o.block.size[0]) > SAME && overlap(at[1], at[1] + size[1], o.at[1], o.at[1] + o.block.size[1]) > SAME) best = {lift: top, block: o.block, at: o.at};
  }
  return best;
}

/**
 * Whether a foot (the middle of a footprint, tiles) is over what holds it ({block, at}: landingUnder's): inside that
 * block's top, edges included, or anywhere on the floor. WHY its middle: a body whose middle is past the edge of the top
 * it rests on would tip off it, however much of its footprint still overlaps the top.
 */
export const overTop = (foot, under) => !under.block || [0, 1].every((k) => foot[k] >= under.at[k] - SAME && foot[k] <= under.at[k] + under.block.size[k] + SAME);

/** The frame the moves are planned and drawn on: the film's 1600×900 sheet. */
export const FRAME = Object.freeze([1600, 900]);
/** Null when a point is on the frame, else how far off it lies ("1234 px to the right"). */
export function offFrame([x, y]) {
  const [w, h] = FRAME, said = [];
  // a whole pixel at least: a point a tenth of a pixel off is off, and "0 px" would say it is not
  const px = (v) => Math.max(1, Math.round(v));
  if (x < 0) said.push(`${px(-x)} px to the left`); else if (x > w) said.push(`${px(x - w)} px to the right`);
  if (y < 0) said.push(`${px(-y)} px above`); else if (y > h) said.push(`${px(y - h)} px below`);
  return said.length ? said.join(' and ') : null;
}

/**
 * What of a drawn block is off the frame: null, or {part: 'block' | 'rope', off} — its outline first (it is what is
 * seen), then a hang's rope. `outline` and `rope` are frame points.
 */
export function drawnOff(outline, rope = []) {
  const block = outline.map(offFrame).find(Boolean);
  if (block) return {part: 'block', off: block};
  const cord = rope.map(offFrame).find(Boolean);
  return cord ? {part: 'rope', off: cord} : null;
}

/**
 * A foot's place in tiles from where it is on the frame, during a move from `m.from` to `m.to` (tiles): a point on the
 * frame is a whole line of places, so the one taken is on the move's way — its column and row where the frame's
 * across-position puts them between the two ends (by `share` of the move's time when both ends stand on one such line),
 * its lift what then brings it to the point's height. WHY: the place projects to exactly where the block is drawn, so
 * the paint order (grid.backToFront) puts it among the others where it is seen, and a pass through a block is found
 * where it is seen. A lift under the floor (a wind-up's dip) is taken as on the floor. Only the grid's own numbers are
 * read: `grid.at` and `grid.tileAt`.
 */
export function footTiles(grid) {
  const o = grid.at(0, 0, 0), half = grid.at(1, 0, 0).y - o.y, up = o.y - grid.at(0, 0, 1).y;
  return ([x, y], m, share) => {
    const ground = grid.tileAt(x, y), u = ground.col - ground.row, u0 = m.from[0] - m.from[1], u1 = m.to[0] - m.to[1];
    const f = Math.abs(u1 - u0) > 1e-9 ? (u - u0) / (u1 - u0) : share;
    const c = m.from[0] + f * (m.to[0] - m.from[0]), r = m.from[1] + f * (m.to[1] - m.from[1]);
    return [c, r, Math.max(0, ((c + r) - (ground.col + ground.row)) * half / up)];
  };
}

/**
 * The deepest a block of `size` goes into the others on the straight stretch from corner `from` to corner `to`, each
 * other ({block, from, to}) moving straight too: {block, depth, share} (share of the stretch where it is deepest) past
 * THROUGH_MOST, or null. WHY swept, not sampled: a move is sampled 30 times a second, and a 30-tile reach covers a
 * tile and more between two samples — a block a tenth of a tile thin stands wholly between them. Over a stretch the
 * depth along each axis (min of two ends, less max of two starts: each end moving straight) is concave in the share,
 * so their least is too, and its highest point is found by golden-section search: nothing between samples is skipped.
 */
export function sweptThrough(size, from, to, others) {
  let deepest = null;
  const lerp = (a, b, u) => a + (b - a) * u;
  for (const o of others) {
    const s = o.block.size;
    // the stretch's whole box against the other's: apart, there is nothing to search
    if ([0, 1, 2].some((k) => Math.max(from[k], to[k]) + size[k] <= Math.min(o.from[k], o.to[k]) || Math.max(o.from[k], o.to[k]) + s[k] <= Math.min(from[k], to[k]))) continue;
    const depthAt = (u) => Math.min(...[0, 1, 2].map((k) => {
      const a0 = lerp(from[k], to[k], u), b0 = lerp(o.from[k], o.to[k], u);
      return Math.min(a0 + size[k], b0 + s[k]) - Math.max(a0, b0);
    }));
    let lo = 0, hi = 1;
    const g = (Math.sqrt(5) - 1) / 2;
    for (let n = 0; n < 60; n += 1) {
      const m1 = hi - g * (hi - lo), m2 = lo + g * (hi - lo);
      if (depthAt(m1) < depthAt(m2)) lo = m1; else hi = m2;
    }
    const share = (lo + hi) / 2, best = [0, 1, share].reduce((x, u) => (depthAt(u) > depthAt(x) ? u : x), share), depth = depthAt(best);
    if (depth > THROUGH_MOST && (!deepest || depth > deepest.depth)) deepest = {block: o.block, depth, share: best};
  }
  return deepest;
}

/** A point of a block as built, where its pose puts it (motion.mjs · poseAt): scaled about the pivot, then moved. */
export const posed = ([x, y], {dx, dy, pivot: [px, py], sx, sy}) => [px + (x - px) * sx + dx, py + (y - py) * sy + dy];
