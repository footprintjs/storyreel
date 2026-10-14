/**
 * A loop's seam. Looped, a clip's last frame is the next repeat's first: the body is carried on by the loop's
 * travel and the clip starts again. The seam is measured with the feet, in the room (torso lengths): a foot that does
 * not meet itself there would slide or jump at every repeat. Pure functions.
 */

/** How far each foot at frame b is from where it was at frame a, carried on by `travel` (x) between them. */
export function footSlides(feet, a, b, travel) {
  return feet.map(t => Math.hypot(t[b].x - t[a].x - travel, t[b].y - t[a].y));
}

/** A track's step per frame at f (from the frame before to the frame after). */
function stepAt(t, f) {
  const p = Math.max(0, f - 1), q = Math.min(t.length - 1, f + 1);
  return {x: (t[q].x - t[p].x) / (q - p), y: (t[q].y - t[p].y) / (q - p)};
}

/** How far apart the feet are at frames a and b — where each is, and how it moves — with the body's travel between them. */
function mismatch(feet, root, a, b) {
  const travel = root[b].x - root[a].x;
  let slide = 0, move = 0;
  for (const t of feet) {
    slide = Math.max(slide, Math.hypot(t[b].x - t[a].x - travel, t[b].y - t[a].y));
    const [sa, sb] = [stepAt(t, a), stepAt(t, b)];
    move = Math.max(move, Math.hypot(sb.x - sa.x, sb.y - sa.y));
  }
  return {slide, move};
}

/**
 * The longest clip searched for a cut (frames): every pair of frames is tried. Measured where no two frames meet:
 * 1,800 frames took about 0.1 s, 3,600 (2 minutes at 30 fps) about 0.4 s, 5,400 about 0.85 s.
 */
export const CUT_SEARCH_LIMIT = 3600;

/**
 * Where to cut a clip so it loops: frames a < b, at least `least` apart, whose feet meet within `tolerance` — where
 * each foot is, and how far it moves in a frame, the body carried on by its travel between them. Of those, the
 * closest of the longest: any stretch within `slack` frames of the longest that meets (a stretch a frame longer that
 * meets less well is no better). Returns {cut: {a, b, slide} | null, searched: {done, frames, limit}}: a clip longer
 * than `limit` frames is not searched (done: false), so "no cut" is said only of a clip that was.
 */
export function bestCut(feet, root, {tolerance, least = 2, slack = 2, limit = CUT_SEARCH_LIMIT}) {
  const n = root.length, searched = {done: n <= limit, frames: n, limit};
  if (!searched.done) return {cut: null, searched};
  let near = [], longest = -1;   // the stretches that meet, within slack of the longest so far
  for (let a = 0; a + least < n; a++) {
    for (let b = n - 1; b >= a + least && b - a >= longest - slack; b--) {
      const {slide, move} = mismatch(feet, root, a, b);
      if (slide > tolerance || move > tolerance) continue;
      if (b - a > longest) { longest = b - a; near = near.filter(c => c.b - c.a >= longest - slack); }
      near.push({a, b, slide});
    }
  }
  return {cut: near.reduce((best, c) => (!best || c.slide < best.slide ? c : best), null), searched};
}
