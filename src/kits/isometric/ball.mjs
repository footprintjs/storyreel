/**
 * ball — the film's round kind painted by footprint-story (0.37.0: `paintPiece` with `kind: 'ball'`), in the world's
 * style, then turned and moved as its pose says. Plain paint lists in, plain paint lists out; paint.mjs draws them.
 *
 *   paintBall(b, grid, style, colours)   the ball's {box, centre, outline, items} as footprint-story paints it as built
 *   ballItemsAt(b, grid, turn)           its built list with each seam item's points the turned marks (the level seam
 *                                        first: turn.mjs · ballPicture), the list itself when unturned
 *   posedItems(items, pose)              every point of a list put where the pose says (its move and squash)
 *   handSeamsRefused(motions)            a move that turns a ball whose line draws its seams by hand: refused
 *
 * WHY footprint-story paints it: until 0.50.0 the kit drew a ball itself (turn.mjs · ballPaint) and so refused one in a
 * world with a style, which paints only the map's own pieces. footprint-story 0.37.0 paints StoryReel 0.44.0's ball in
 * every style and look, its outline, middle, box and seams pinned against StoryReel's own code; one painter, so a deck
 * and a film draw the same ball. Its one difference: the edge is drawn with the disc, before the seams (the kit drew it
 * after them), so where a seam ends on the edge only its antialiased fringe can differ.
 *
 * WHY the turned marks are swapped in here: footprint-story paints a ball as built (its seams the level and the
 * upright great circle). A turned ball's outline is the same however it turns; only its seams turn, so each seam item's
 * points are the turned ones (footprint-story's README says exactly this). A line that draws a ball's seams by hand
 * (`human:sketchy`) leaves no seam item to swap — its seams are strokes planned as built — so a move that turns such a
 * ball is refused, naming the fix, rather than drawn with seams that do not turn.
 */
import {paintPiece, posed} from 'footprint-story/isometric';
import {ballPicture, centreOf, UNTURNED} from './turn.mjs';
import {TURNING_KINDS} from './motion-read.mjs';

/** The ball as footprint-story paints it as built, in `style` (an isoStyle), with `colours` ({base} or undefined). */
export const paintBall = (b, grid, style, colours) => paintPiece(style, {name: b.name, kind: 'ball', at: b.at, size: b.size}, grid, colours);

const pathOf = (line) => [['move', ...line[0]], ...line.slice(1).map((p) => ['line', ...p])];

/** The ball's built list (`b.paint`) turned by `turn`: each seam item, in order, takes its turned mark's points. */
export function ballItemsAt(b, grid, turn) {
  if (turn === UNTURNED) return b.paint;
  const marks = ballPicture(grid, centreOf(b), b.size[0] / 2, turn).marks;
  let k = 0;
  return b.paint.map((it) => (it.role === 'seam' ? {...it, segments: pathOf(marks[k++])} : it));
}

/**
 * A path's steps under a pose: each point moved; an arc's centre moved and its radii scaled by the squash (its angles
 * are the ellipse's own parameter, which an axis-aligned squash keeps).
 */
const posedSegments = (segments, pose, at) => segments.map(([op, ...n]) => {
  if (op === 'move' || op === 'line') return [op, ...at(n)];
  if (op === 'arc') return [op, ...at(n.slice(0, 2)), n[2] * (pose.sx ?? 1), n[3] * (pose.sy ?? 1), ...n.slice(4)];
  return [op, ...n];
});

/**
 * A paint list under a pose (footprint-story · posed: its move, and a bounce's squash about its pivot): every point put
 * where the pose says, an ellipse's and an arc's radii scaled with it; widths, times, fills and strokes as they are, as
 * the kit always moved a ball (its lines keep their width while it squashes).
 */
export function posedItems(items, pose) {
  const at = (p) => posed(p, pose), sx = pose.sx ?? 1, sy = pose.sy ?? 1;
  return items.map((it) => {
    if (it.item === 'polygon') return {...it, points: it.points.map(at)};
    if (it.item === 'path') return {...it, segments: posedSegments(it.segments, pose, at)};
    if (it.item === 'lines') return {...it, segments: it.segments.map(([x1, y1, x2, y2]) => [...at([x1, y1]), ...at([x2, y2])])};
    if (it.item === 'stroke') return {...it, points: it.points.map(([x, y, w, t]) => [...at([x, y]), w, t])};
    const [cx, cy] = at([it.cx, it.cy]);
    return {...it, cx, cy, rx: it.rx * sx, ry: it.ry * sy};   // an ellipse, the one item left (paint.mjs draws no other)
  });
}

/** Whether a ball's built list keeps its seams as items (every line but one that draws them by hand). */
const seamed = (b) => b.paint.some((it) => it.role === 'seam');

/**
 * The read motions (motion-read.mjs) against the built map: a roll or a tumble of a ball whose line draws its seams by
 * hand is refused, naming the entry and the fix (see the head). `line`: the style's line, for the words.
 */
export function handSeamsRefused(motions, line) {
  const m = motions.find((x) => x.piece.kind === 'ball' && Object.hasOwn(TURNING_KINDS, x.do) && !seamed(x.piece));
  if (m) throw new Error(`${m.who}: a ${m.do} turns the ball, and this world's line "${line}" draws a ball's seams by hand as it is built — they could not be drawn turning: throw it (do: "throw") or slide it (do: "slide"), or write another line beside the look ("line": "ink")`);
}
