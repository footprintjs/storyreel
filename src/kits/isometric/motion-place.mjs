/**
 * motion-place — where things are in an isometric world while its pieces move: places in tiles, what a block lands on,
 * whether a place is on the frame, a moving foot's place worked back from where it is drawn, and whether a move passes
 * through another block. Pure numbers on the built map's grid; nothing is planned (motion.mjs) or drawn here.
 *
 *   footOf(at, size) / topOf(at, size) / cornerOf(foot, size)   a block's foot and top from its corner `at`, and back
 *   landingUnder(at, size, others)                              the highest top under a block that is not above it
 *   offFrame(px)                                                null, or how far off the 1600×900 frame a point is
 *   footTiles(grid)                                             a moving foot's place from where it is on the frame
 *   passesThrough(piece, at, others)                            the block it goes deepest into, and how deep, or null
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
 * own and which is not above its foot, else the floor — {lift, block}, block null for the floor. WHY the highest: a box
 * dropped over a server lands on the server, never through it to the floor.
 */
export function landingUnder(at, size, others) {
  let best = {lift: 0, block: null};
  for (const o of others) {
    const top = (o.at[2] ?? 0) + o.block.size[2];
    if (top > (at[2] ?? 0) + SAME || top <= best.lift) continue;
    if (overlap(at[0], at[0] + size[0], o.at[0], o.at[0] + o.block.size[0]) > SAME && overlap(at[1], at[1] + size[1], o.at[1], o.at[1] + o.block.size[1]) > SAME) best = {lift: top, block: o.block};
  }
  return best;
}

/** The frame the moves are planned and drawn on: the film's 1600×900 sheet. */
export const FRAME = Object.freeze([1600, 900]);
/** Null when a point is on the frame, else how far off it lies ("1234 px to the right"). */
export function offFrame([x, y]) {
  const [w, h] = FRAME, said = [];
  if (x < 0) said.push(`${Math.round(-x)} px to the left`); else if (x > w) said.push(`${Math.round(x - w)} px to the right`);
  if (y < 0) said.push(`${Math.round(-y)} px above`); else if (y > h) said.push(`${Math.round(y - h)} px below`);
  return said.length ? said.join(' and ') : null;
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
 * The block among `others` ({block, at} each) that a block of `piece`'s size at corner `at` goes deepest into, and how
 * deep (tiles: the least of its overlaps along the three axes), when that is past THROUGH_MOST; else null. Touching is
 * not passing through: a block resting on a top overlaps it by nothing in height.
 */
export function passesThrough(piece, at, others) {
  let deepest = null;
  for (const o of others) {
    const s = o.block.size, depth = Math.min(overlap(at[0], at[0] + piece.size[0], o.at[0], o.at[0] + s[0]), overlap(at[1], at[1] + piece.size[1], o.at[1], o.at[1] + s[1]),
      overlap(at[2], at[2] + piece.size[2], o.at[2] ?? 0, (o.at[2] ?? 0) + s[2]));
    if (depth > THROUGH_MOST && (!deepest || depth > deepest.depth)) deepest = {block: o.block, depth};
  }
  return deepest;
}
