/**
 * turn — a body turned where it is, drawn as the world's own grid sees it: a block or a ball turned about the line in the
 * floor across its way, its faces, outline and marks as points on the frame. Pure numbers on the built map's grid;
 * nothing is planned (motion.mjs, motion-side.mjs) or painted (draw.mjs) here.
 *
 *   turnAxis(heading)                       the line a body rolling along `heading` ([dc, dr], a unit) turns about
 *   turning(axis, angle) · compose(a, b)    that turn as a 3×3 matrix in tiles (Rodrigues); a after b
 *   onFace(m)                               whether a turned block shows its faces as built (each axis onto an axis)
 *   towardViewer(grid)                      the way to the viewer, in tiles: what of a body faces it is seen
 *   centreOf(b, at)                         a block's middle in tiles, at its corner `at` (as built when left out)
 *   boxPicture(grid, centre, size, m)       a block turned by m: the faces seen ({points, normal}) and its outline
 *   ballPicture(grid, centre, radius, m)    a ball turned by m: its outline, its middle, and the seen halves of its marks
 *   boxPaint(picture, at, look)             a turned block's paint list: its seen faces, each toned by the way it faces
 *   reachOver(a0, a1)                       how far a block turning from a0 to a1 reaches, as a share of its half side
 *   drawnOutline(b, pose, grid)             a block's outline on the frame at its pose, turned when it is
 *
 * WHY in three dimensions: the grid looks down on the floor at 30°, and a body rolling along it turns about a level line
 * across its way. Turning its picture on the frame would be a turn about the line to the viewer, which no body rolling on
 * this floor makes; so the body's corners (or a ball's marks) are turned in tiles, by the angle the samples give, and put
 * on the frame by the grid's own numbers (`grid.at`). The angle is never worked out here: it comes from footprint-story.
 *
 * WHY a ball shows two marks: a ball's outline is the same however it turns, so only marks on it show the turn — two
 * great circles, the half of each that faces the viewer, as a beach ball's seams.
 *
 * WHY paint lists: the kit has one canvas painter (paint.mjs · paintItems), and draw.mjs traces no shape itself; a turned
 * block is handed to it as a list in footprint-story's paint-item shape (`polygon` items, each fill a recipe over the
 * kit's base colour and each stroke in the kit's ink), as a built block is. A ball's list is footprint-story's own
 * (ball.mjs), its seams swapped for the marks ballPicture turns.
 */
import {posed} from 'footprint-story/isometric';

/** The turn that leaves a body as it was built. */
export const UNTURNED = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]);

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const n = Math.hypot(...a); return a.map((v) => v / n); };
/** A 3×3 matrix (nine numbers, row by row) applied to a vector. */
export const apply = (m, [x, y, z]) => [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];

/**
 * The line a body rolling along `heading` ([dc, dr], a unit on the floor) turns about: up × heading, so a turn by a
 * positive angle carries its top forward along the way — footprint-story's sign (a roll to +x turns +, clockwise side on).
 */
export const turnAxis = ([dc, dr]) => [-dr, dc, 0];

/** The turn by `angle` (radians) about `axis` (a unit, in tiles), as a matrix: Rodrigues' formula. */
export function turning([ax, ay, az], angle) {
  const c = Math.cos(angle), s = Math.sin(angle), k = 1 - c;
  return [c + ax * ax * k, ax * ay * k - az * s, ax * az * k + ay * s,
    ay * ax * k + az * s, c + ay * ay * k, ay * az * k - ax * s,
    az * ax * k - ay * s, az * ay * k + ax * s, c + az * az * k];
}

/** Two turns one after the other: `b` first, then `a`. */
export function compose(a, b) {
  const out = new Array(9);
  for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) out[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return out;
}

/** How near a matrix entry must be to −1, 0 or 1 to count as one: a turn of quarter turns, worked out in floats. */
const FACE = 1e-9;
/** Whether a turn carries each axis onto an axis (quarter turns only): a block so turned shows faces where it was built. */
export const onFace = (m) => m.every((v) => Math.min(Math.abs(v), Math.abs(Math.abs(v) - 1)) < FACE);
/** Whether a turn is no turn at all. */
export const isUnturned = (m) => m.every((v, i) => Math.abs(v - UNTURNED[i]) < FACE);

/**
 * The way to the viewer in tiles, a unit: the direction the grid draws as a point (the null of its projection), the
 * one with height (the viewer looks down). A face whose outward normal leans toward it is seen. Read from the grid's
 * own numbers only, so a grid written with another rise or tile still says what it shows.
 */
export function towardViewer(grid) {
  const o = grid.at(0, 0, 0), [a, b, c] = [grid.at(1, 0, 0), grid.at(0, 1, 0), grid.at(0, 0, 1)].map((p) => [p.x - o.x, p.y - o.y]);
  const n = cross([a[0], b[0], c[0]], [a[1], b[1], c[1]]);
  return unit(n[2] < 0 ? n.map((v) => -v) : n);
}

/** A block's middle in tiles, standing at its corner `at` (its built `at` when left out). */
export const centreOf = (b, at = b.at) => [at[0] + b.size[0] / 2, at[1] + b.size[1] / 2, (at[2] ?? 0) + b.size[2] / 2];

const onFrame = (grid, [c, r, z]) => { const p = grid.at(c, r, z); return [p.x, p.y]; };

/** The convex hull of frame points, in order round it (Andrew's monotone chain). */
function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const side = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => list.reduce((h, q) => { while (h.length >= 2 && side(h.at(-2), h.at(-1), q) <= 0) h.pop(); h.push(q); return h; }, []);
  const lower = half(p), upper = half([...p].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * A block of `size` with its middle at `centre` (tiles), turned by `m`: its faces the viewer sees, each
 * {points (four, round it, on the frame), normal (outward, in tiles)}, and its outline (the hull of its corners). A
 * convex body's seen faces never overlap, so they may be painted in any order.
 */
export function boxPicture(grid, centre, size, m) {
  const view = towardViewer(grid), half = size.map((v) => v / 2), faces = [];
  for (let k = 0; k < 3; k += 1) for (const s of [-1, 1]) {
    const axis = [0, 0, 0]; axis[k] = s;
    const normal = apply(m, axis);
    if (dot(normal, view) <= FACE) continue;
    const [i, j] = [0, 1, 2].filter((x) => x !== k);
    const points = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
      const local = [0, 0, 0]; local[k] = s * half[k]; local[i] = u * half[i]; local[j] = v * half[j];
      const p = apply(m, local);
      return onFrame(grid, [centre[0] + p[0], centre[1] + p[1], centre[2] + p[2]]);
    });
    faces.push({points, normal});
  }
  const corners = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const p = apply(m, [sx * half[0], sy * half[1], sz * half[2]]);
    corners.push(onFrame(grid, [centre[0] + p[0], centre[1] + p[1], centre[2] + p[2]]));
  }
  return {faces, outline: hull(corners)};
}

/** How many points a ball's outline and each mark are drawn with: far finer than a pixel at any size a frame shows. */
const ROUND = 72;

/**
 * A ball of `radius` (tiles) with its middle at `centre`, turned by `m`: its outline (the great circle across the way to
 * the viewer, put on the frame: a circle on the usual grid), its middle on the frame, and its two marks — the great
 * circles that lie, as built, level and upright along the rows — each the arc of its half that faces the viewer.
 */
export function ballPicture(grid, centre, radius, m) {
  const view = towardViewer(grid);
  const across = Math.abs(view[2]) < 1 - 1e-9 ? unit(cross(view, [0, 0, 1])) : [1, 0, 0], up = cross(view, across);
  const at = (a, b, t) => [0, 1, 2].map((k) => centre[k] + radius * (Math.cos(t) * a[k] + Math.sin(t) * b[k]));
  const outline = Array.from({length: ROUND}, (_, n) => onFrame(grid, at(across, up, (2 * Math.PI * n) / ROUND)));
  // a great circle's seen half is one arc: the half round the point that leans most toward the viewer (edge on, a line)
  const marks = [[[1, 0, 0], [0, 1, 0]], [[0, 1, 0], [0, 0, 1]]].map(([u, v]) => {
    const a = apply(m, u), b = apply(m, v), facing = Math.atan2(dot(b, view), dot(a, view));
    return Array.from({length: ROUND / 2 + 1}, (_, n) => onFrame(grid, at(a, b, facing - Math.PI / 2 + (Math.PI * n) / (ROUND / 2))));
  });
  return {outline, centre: onFrame(grid, centre), marks};
}

/**
 * A turned block's paint list (paint.mjs · paintItems draws it): each seen face a polygon, its points put where `at`
 * says (the pose's move), filled by a recipe over the block's colour and edged in the ink `look.line` wide. A face's
 * recipe is the built faces' by the way it faces — 20% toward white facing up, 6% toward black facing the lower left
 * (+row), 18% facing the lower right (+col) — blended by how much it faces each (the squared share of its normal), net of
 * white against black: so a face turning from the top to a side darkens smoothly, and square on it is the built colour
 * exactly.
 */
export function boxPaint(picture, at, look) {
  const stroke = {colour: null, alpha: 1, width: look.line, join: 'round', cap: 'butt'};
  return picture.faces.map(({points, normal: [nc, nr, nz]}) => {
    const w = [Math.max(0, nz) ** 2, Math.max(0, nr) ** 2, Math.max(0, nc) ** 2], sum = w[0] + w[1] + w[2] || 1;
    const net = (0.2 * w[0] - 0.06 * w[1] - 0.18 * w[2]) / sum;
    return {item: 'polygon', points: points.map(at), fill: {mix: net >= 0 ? ['#ffffff', net] : ['#000000', -net], colour: null}, stroke};
  });
}

/**
 * How far a block whose side along its way and height are one length 2a reaches from its middle while it turns from
 * angle a0 to a1, as a share of a: the most of |cos θ| + |sin θ| over the turn — 1 square on, √2 corner on (at π/4 and
 * every quarter turn on). WHY: what a turning block may pass through is the box it fills over the turn, never less.
 */
export function reachOver(a0, a1) {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1), f = (t) => Math.abs(Math.cos(t)) + Math.abs(Math.sin(t));
  const corner = Math.ceil((lo - Math.PI / 4) / (Math.PI / 2)) * (Math.PI / 2) + Math.PI / 4;
  return corner <= hi ? Math.SQRT2 : Math.max(f(lo), f(hi));
}

/**
 * A block's outline on the frame at its pose (motion.mjs · poseAt): as built under the pose's move and squash
 * (footprint-story · posed), or, for a block turned off its faces, the outline of its turned corners. A ball's outline is
 * the same however it turns, so it is moved as built. What a camera frames and what must stay on the frame.
 */
export function drawnOutline(b, pose, grid) {
  if (!pose) return b.shape.outline;
  if (pose.turn && b.kind === 'block' && !onFace(pose.turn)) return boxPicture(grid, centreOf(b), b.size, pose.turn).outline.map((p) => posed(p, pose));
  return b.shape.outline.map((p) => posed(p, pose));
}
