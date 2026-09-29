/**
 * What is drawn where: boxes on the 1600×900 frame, each naming the recipe entry that drew it —
 * "story.items[3]", "stages[2].reveal[1]", "card.rows[0]", "guesses[0]". The preview studio asks
 * which box a click hit and shows that entry. A box is a drawing's extent, not its pixels, so the
 * smallest box that holds a point is the most specific answer.
 *
 * A view is a uniform scale then a shift (p → p·z + (tx, ty)): every camera in a film is one.
 */

/** The identity view, or a scale and a shift. */
export const view = (z = 1, tx = 0, ty = 0) => ({z, tx, ty});

/** `outer` after `inner` (inner is applied first). */
export const then = (outer, inner) => ({z: outer.z * inner.z, tx: outer.z * inner.tx + outer.tx, ty: outer.z * inner.ty + outer.ty});

/** The view drawn by ctx.translate(tx, ty); ctx.scale(z, z); ctx.translate(-sx, -sy) — a camera {sx, sy, z, tx, ty}. */
export const about = ({sx, sy, z, tx, ty}) => ({z, tx: tx - sx * z, ty: ty - sy * z});

/** A box [x0, y0, x1, y1] seen through a view. */
export const through = (v, [x0, y0, x1, y1]) => [x0 * v.z + v.tx, y0 * v.z + v.ty, x1 * v.z + v.tx, y1 * v.z + v.ty];

/** A point on the frame, back through a view (e.g. a click → the coordinates a recipe uses). */
export const back = (v, [x, y]) => [(x - v.tx) / v.z, (y - v.ty) / v.z];

/** The regions that hold (x, y): the most specific (smallest box) first; on a tie, the one drawn last. */
export function hitTest(regions, x, y) {
  const area = ({box: [x0, y0, x1, y1]}) => (x1 - x0) * (y1 - y0);
  return regions.map((r, order) => ({...r, order}))
    .filter(({box: [x0, y0, x1, y1]}) => x >= x0 && x <= x1 && y >= y0 && y <= y1)
    .sort((a, b) => area(a) - area(b) || b.order - a.order)
    .map(({order, ...r}) => r);
}
