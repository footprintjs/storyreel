/**
 * motion-cover — what a moving block hides: another block's name (its label and small line on its top) that a moved
 * block is drawn over. A ball thrown onto a server's top sits on the server's name.
 *
 *   coversOf(map, moves, poseAt) → {hidden: Map(block → [[from, to], …]), findings: [{intent, critic, level, what, fix}]}
 *
 * WHY: the kit says which words are on screen to be read, and when (`texts()`): the reading and contrast checks measure
 * exactly those. A name a moved block covers is not there to read, so its span ends while it is covered — and the kit
 * says so itself (`reel:covers`, a finding naming the move, the name and the fix) rather than leaving a check to find a
 * word "too faint" behind a block, which depends on how wide the host's font draws it.
 *
 * A name's place is worked out from the built map's numbers only (its fitted lines and size, as draw.mjs lays them
 * out), never from a font: a line is taken as wide as NAME_WIDTH of its size per letter, a little wider than the
 * widest the kit's fonts draw, so a word that peeks out from under a block on any host is counted covered.
 */
import {posed} from './motion-place.mjs';

/** How wide a letter of a name is taken, as a share of its size: wider than the fonts draw a name, so any host's word is inside. Ours. */
export const NAME_WIDTH = 0.7;

/** A block's name on its top as a box on the frame, as built ([x0, y0, x1, y1]), or null when it has none: draw.mjs · drawBlock's layout. */
function nameBox(b) {
  if (!b.fitted?.lines.length) return null;
  const {lines, size} = b.fitted, lh = size * 1.15, sf = b.smallFitted, small = sf ? sf.size * 1.15 + 2 : 0, height = lines.length * lh + small;
  const wide = Math.max(...lines.map((l) => [...l].length * size), sf ? [...sf.lines.join(' ')].length * sf.size : 0) * NAME_WIDTH;
  const [cx, cy] = b.shape.centre;
  return [cx - wide / 2, cy - height / 2, cx + wide / 2, cy + height / 2];
}

/** Whether a polygon (frame points) and a box overlap: their bounds meet, and the box is not wholly outside the polygon's convex hull's sides. */
function overlaps(points, [x0, y0, x1, y1]) {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  if (Math.max(...xs) <= x0 || Math.min(...xs) >= x1 || Math.max(...ys) <= y0 || Math.min(...ys) >= y1) return false;
  // a separating side of the outline (it is convex, its points in order round it): every box corner beyond it
  const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], n = points.length, turn = Math.sign(area(points));
  for (let i = 0; i < n; i += 1) {
    const [ax, ay] = points[i], [bx, by] = points[(i + 1) % n];
    if (corners.every(([x, y]) => turn * ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) < 0)) return false;
  }
  return true;
}
const area = (p) => p.reduce((s, [x, y], i) => { const [x2, y2] = p[(i + 1) % p.length]; return s + x * y2 - x2 * y; }, 0);

/**
 * Which names the moving blocks hide, and when. `moves` (motion.mjs, each with its samples' moments `times`), `poseAt`
 * (motion.mjs · poseAt). A name is hidden at a moment when a moved block's outline there overlaps its box and the moved
 * block is drawn in front of the named one (grid.backToFront of the two, where each stands). The moments read are every
 * move's samples; between them nothing moves, so a state holds until the next one (after the last, for good).
 * `findings`: a move that comes to rest over a name — its last moment hides one — names the move, the name and the fix.
 */
export function coversOf(map, moves, poseAt) {
  const named = map.blocks.map((b) => ({block: b, box: nameBox(b)})).filter((n) => n.box), movers = [...new Set(moves.map((m) => m.piece))];
  const placeOf = (b, t) => poseAt(b, t)?.at ?? [b.at[0], b.at[1], b.at[2] ?? 0];
  const hiddenAt = (n, t) => {
    const own = poseAt(n.block, t), box = own ? [posed([n.box[0], n.box[1]], own), posed([n.box[2], n.box[3]], own)].flat() : n.box;
    return movers.find((p) => {
      const pose = p !== n.block ? poseAt(p, t) : null;
      if (!pose || !overlaps(p.shape.outline.map((q) => posed(q, pose)), box)) return false;
      const both = [{b: n.block, at: placeOf(n.block, t)}, {b: p, at: placeOf(p, t)}];
      return map.grid.backToFront(both, (x) => ({at: x.at, size: x.b.size}))[1].b === p;
    }) ?? null;
  };
  const times = [...new Set(moves.flatMap((m) => m.times))].sort((a, b) => a - b), hidden = new Map();
  for (const n of named) {
    const spans = [];
    let from = null;
    for (const t of times) {
      const by = hiddenAt(n, t);
      if (by && from === null) from = t;
      if (!by && from !== null) { spans.push([from, t]); from = null; }
    }
    if (from !== null) spans.push([from, Infinity]);
    if (spans.length) hidden.set(n.block, spans);
  }
  const findings = moves.flatMap((m, i) => {
    const end = m.times.at(-1), over = named.filter((n) => n.block !== m.piece && hiddenAt(n, end) === m.piece);
    return over.map((n) => ({intent: i, critic: 'reel:covers', level: 'warn',
      what: `it comes to rest over "${n.block.name}"'s name ("${n.block.fitted.lines.join(' ')}"), which is hidden from then`,
      fix: `land it clear of the name (to: tiles beside "${n.block.name}", or a corner of its top), or accept it when it is meant ("accept": ["reel:covers"])`}));
  });
  return {hidden, findings};
}
