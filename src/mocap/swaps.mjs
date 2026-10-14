/**
 * Left and right traded. A detector sometimes labels a person's left ankle as their right for a frame or a few (a
 * side-on walker's legs cross and look alike), and a copied foot then jumps to the other foot and back. A pair traded
 * back moves far less from where it was a moment before than as labelled. Pure functions: the verdict, frame by frame,
 * is the stage's (mocap/stages.mjs · swapStage).
 */

/** The joints that come in a left and a right. */
export const PAIRS = Object.freeze(['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle']);

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * How far a pair moves from frame r to frame f, in units of `scale` (one torso length), as labelled (keep) and with
 * left and right traded (swap). Both points must be seen in both frames.
 */
export function pairMoves(left, right, r, f, scale) {
  return {keep: (dist(left[f], left[r]) + dist(right[f], right[r])) / scale, swap: (dist(left[f], right[r]) + dist(right[f], left[r])) / scale};
}

/** Trade a pair's left and right in frame f — the points and what was reported of them — in place. */
export function trade(tracks, reported, pair, f) {
  for (const book of [tracks, reported]) {
    const [l, r] = [book[`left_${pair}`], book[`right_${pair}`]];
    [l[f], r[f]] = [r[f], l[f]];
  }
}
