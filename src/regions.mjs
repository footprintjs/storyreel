/**
 * What is drawn where: boxes on the 1600×900 frame, each naming the recipe entry that drew it —
 * "story.items[3]", "stages[2].reveal[1]", "card.rows[0]", "guesses[0]". The preview studio asks
 * which box a click hit and shows that entry. A box is a drawing's extent, not its pixels, so the
 * smallest box that holds a point is the most specific answer.
 *
 * A view is a uniform scale then a shift (p → p·z + (tx, ty)): every camera in a film is one. A camera move
 * may also roll the frame (camera.mjs · dutch, handheld): then the view carries `r`, a turn in radians
 * applied with the scale (p → R(r)·p·z + (tx, ty)). `r` is optional and 0 when absent, and a view without it
 * is computed exactly as before, so every film without a rolled camera gets the same numbers.
 */

/** The identity view, or a scale and a shift (and a turn r, in radians, when it is not 0). */
export const view = (z = 1, tx = 0, ty = 0, r = 0) => (r ? {z, tx, ty, r} : {z, tx, ty});

/** A point turned by r radians about the origin (r = 0: the point itself, untouched). */
const turned = (r, x, y) => (r ? [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)] : [x, y]);

/**
 * `outer` composed after `inner` (inner is applied first). Named compose, never `then`: an export named `then` makes
 * the module's namespace a thenable, so `await import('footprint-storyreel/regions')` would never settle.
 */
export const compose = (outer, inner) => {
  const ro = outer.r ?? 0, ri = inner.r ?? 0;
  if (!ro && !ri) return {z: outer.z * inner.z, tx: outer.z * inner.tx + outer.tx, ty: outer.z * inner.ty + outer.ty};
  const [ix, iy] = turned(ro, inner.tx, inner.ty);
  return view(outer.z * inner.z, outer.z * ix + outer.tx, outer.z * iy + outer.ty, ro + ri);
};

/** The view drawn by ctx.translate(tx, ty); ctx.scale(z, z); ctx.translate(-sx, -sy) — a camera {sx, sy, z, tx, ty}. */
export const about = ({sx, sy, z, tx, ty}) => ({z, tx: tx - sx * z, ty: ty - sy * z});

/** A box [x0, y0, x1, y1] seen through a view (turned: the box that holds its four turned corners). */
export const through = (v, [x0, y0, x1, y1]) => {
  if (!v.r) return [x0 * v.z + v.tx, y0 * v.z + v.ty, x1 * v.z + v.tx, y1 * v.z + v.ty];
  const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => { const [u, w] = turned(v.r, x * v.z, y * v.z); return [u + v.tx, w + v.ty]; });
  const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

/** A point on the frame, back through a view (e.g. a click → the coordinates a recipe uses). */
export const back = (v, [x, y]) => (v.r ? turned(-v.r, (x - v.tx) / v.z, (y - v.ty) / v.z) : [(x - v.tx) / v.z, (y - v.ty) / v.z]);

/** The regions that hold (x, y): the most specific (smallest box) first; on a tie, the one drawn last. */
export function hitTest(regions, x, y) {
  const area = ({box: [x0, y0, x1, y1]}) => (x1 - x0) * (y1 - y0);
  return regions.map((r, order) => ({...r, order}))
    .filter(({box: [x0, y0, x1, y1]}) => x >= x0 && x <= x1 && y >= y0 && y <= y1)
    .sort((a, b) => area(a) - area(b) || b.order - a.order)
    .map(({order, ...r}) => r);
}
