/**
 * sketch — the board's drawings drawn as a hand draws them. Each `draw` item, and each eureka's bulb, is handed to
 * footprint-story's intent decider as a `do: 'sketch'` intent (footprint-story/human · planIntents, the `hand-sketch`
 * model: planSketch); its plan says the order of the strokes and why, the pen's pace, width and tremor along each, and
 * its lifts between them. The board only paints what the plan says.
 *
 *   planSketches(drawings)   drawings: [{path, who, at, seconds, shapes, size, seed, accept, eureka?}] (index.mjs reads them)
 *                            → {intents, planned, sketches (one a part), byDrawing, findings, notes, summary, strokes, run}
 *   partsOf(drawing)         → the drawing in parts footprint-story plans one at a time (one part, unless it is too big)
 *   sketchDraw(parts, ink)   → a timeline item's draw(ctx, s) (board.mjs · renderTimeline): the ink so far, and the pen's tip
 *   shapeOf(points, extra)   → a polyline as footprint-story's sketch shape: closed when it ends where it starts
 *   sketchFindings(drawings, findings) → footprint-story's findings as the review's, each on its item, fixes in recipe words
 *
 * WHY footprint-story decides it: the board drew every stroke in the order its shapes were written, at one eased pace
 * over the whole item, and the marker jumped from one stroke's end to the next's start in no time. A hand does none of
 * that: it starts at the top left, draws a shared corner once, runs on without lifting where lines meet, slows into a
 * bend, and lifts and reaches between strokes. All of that is footprint-story's (src/human/strokes/README.md), the same
 * numbers a deck draws by. The author still writes what to draw, when and for how long (`at`, `dur`): `dur` is the plan's
 * `seconds`, so the pen's own pace is scaled to land on it and the film's clock does not move.
 *
 * WHY the ink is footprint-story's ring: each stroke is a `stroke` paint item (human · strokeItems: a width and a time
 * per point), filled by the isometric kit's one stroke painter (kits/isometric/paint.mjs · paintItems:
 * strokeOutline(strokeAt(points, now), {cap}) by the non-zero rule, a finished ring built once). The hand's tip is
 * sampled from the very same plan (human · sampleMove, the model's own sample), so the marker is always on the end of
 * the ink, and in the air between strokes it is where the pen is on its way to the next.
 */
import {planIntents, sampleMove, strokeItems, MOST_INTENTS, MOST_SHAPES, MOST_SHAPE_POINTS, MOST_SKETCH_POINTS} from 'footprint-story/human';
import {paintItems} from '../isometric/paint.mjs';
import {firstDifference} from '../isometric/flow.mjs';
import {strokeNotes} from '../isometric/notes.mjs';

/** The board's frame in its own units: what footprint-story's critics read a sketch against. */
export const BOARD_FRAME = Object.freeze([1600, 900]);
/** How near a polyline's end must come to its start to be a closed shape: the same point (a rect, a ring, a tag). */
const CLOSES = 1e-9;
/** The marker widths a drawing takes (px): the `hand-sketch` model's `width` range, said in the recipe's word `size`. */
export const MARKER_SIZE = Object.freeze({least: 0.25, most: 20});

/**
 * A polyline as a sketch shape (footprint-story · readShapes): `closed` when its last point is its first (that point
 * given once), so the hand draws it in one stroke round; else an open line. `extra`: layer, group.
 * WHY by its points, not by a flag: every shape the board draws is a list of points (board.mjs), and one that ends
 * where it starts is a closed one whoever made it — an author's `poly` too.
 */
export function shapeOf(points, extra = {}) {
  const a = points[0], b = points.at(-1), closes = points.length > 3 && Math.hypot(a[0] - b[0], a[1] - b[1]) <= CLOSES;
  return {points: (closes ? points.slice(0, -1) : points).map(([x, y]) => [x, y]), ...(closes ? {closed: true} : {}), ...extra};
}

/**
 * Each critic's fix in the recipe's words (a whiteboard item has no `layer`, `group`, `fill` or `model`, which
 * footprint-story's fixes name, and its time is `dur`, not `seconds`). A critic footprint-story adds later keeps its own
 * fix until it is worded here. `pace` (footprint-story 0.36.0) names the seconds a drawing needs, so its fix is worded
 * from its own numbers (paceFix).
 */
const FIXES = Object.freeze({
  'pen-lifts': 'give the lines that meet the same corner points (a line that starts on a shape\'s corner, not beside it), so the pen runs on without a lift — or draw the parts that never meet as items of their own',
  'stroke-order': 'draw what goes inside a shape after it: put it in an item of its own, at a later phrase',
  'hatch-gaps': 'a board\'s drawing is lines, not fills: report it to footprint-story',
});

const up2 = n => Math.ceil(n * 100 - 1e-9) / 100;
/** footprint-story's pace fix: the seconds that bring the drawing to its limit, and the seconds a hand's own pace takes. */
const PACE_FIX = /^slow it: seconds: ([\d.]+) \(or more; ([\d.]+) draws it at a hand's own pace\)$/;

/**
 * The `pace` critic's fix in the recipe's words: footprint-story's seconds as the item's `dur`. A drawing in parts
 * (partsOf) gives each part its length's share of `dur`, so the dur a part's seconds need is those seconds over its
 * share, rounded up to the hundredth as footprint-story rounds. A eureka's bulb has no `dur` (it is drawn in its own
 * 0.75 s, at a hand's pace since 0.49.0): its fix says so, should one be found. A fix not in those words (too much to
 * draw in one move) is footprint-story's, with "draw it in parts" said as the board says it.
 */
function paceFix(fix, d) {
  const m = PACE_FIX.exec(fix);
  if (!m) return fix.replace(/draw it in parts$/, 'draw it in items of their own, one after another');
  if (d.eureka) return `a eureka's bulb is drawn in its ${d.seconds} s — accept it (accept: ["pace"]), or draw the bulb as a draw item of its own, its dur ${m[1]} or more`;
  const share = d.seconds / (d.dur ?? d.seconds), dur = n => up2(Number(n) / share);
  return `give it "dur": ${dur(m[1])} or more (${dur(m[2])} draws it at a hand's own pace)`;
}

/** A finding's fix in the recipe's words (FIXES, paceFix), else footprint-story's own. */
const fixOf = (f, d) => (f.critic === 'pace' ? paceFix(f.fix, d) : FIXES[f.critic] ?? f.fix);

const round3 = n => +n.toFixed(3);
const lengthOf = points => points.reduce((n, p, i) => (i ? n + Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) : n), 0);

/**
 * The most corners one part of a drawing hands footprint-story: a quarter of the drawn points it plans one sketch
 * with (MOST_SKETCH_POINTS, 16000) — planSketch refuses a sketch whose strokes' corners, three points each at most,
 * would not fit, and a closed shape adds its closing corner. Ours.
 */
export const PART_POINTS = Math.floor(MOST_SKETCH_POINTS / 4);

/**
 * A drawing in parts footprint-story plans one at a time: one part, the drawing itself, unless it holds more shapes
 * (MOST_SHAPES) or corners (PART_POINTS) than one sketch takes, or a line of more points than a shape holds — that
 * line is cut in pieces whose ends meet, each a part of its own (in one sketch footprint-story would join them again
 * at their shared corner into one stroke, and a stroke holds at most 1365 corners).
 * WHY parts, not a refusal: footprint-story's own word for such a drawing is "draw it in parts", and an item the board
 * drew before (an item of 4000 ticks, test/fix.test.mjs) is drawn still. Each part takes the share of the item's `dur`
 * its lines' length is of the whole, one after another, so the item still ends at its `dur`; between two parts the pen
 * goes on at once (the parts are planned apart, so no lift is planned between them). Each part is `{…drawing, shapes,
 * offset (seconds after the item begins), seconds, part: [k, n] when n > 1, who}`.
 */
export function partsOf(drawing) {
  const pieces = drawing.shapes.flatMap(sh => {
    if (sh.points.length <= MOST_SHAPE_POINTS) return [{shape: sh, cut: false}];
    const ring = sh.closed ? [...sh.points, sh.points[0]] : sh.points, out = [], {closed, ...rest} = sh;
    for (let i = 0; i < ring.length - 1; i += MOST_SHAPE_POINTS - 1) out.push({shape: {...rest, points: ring.slice(i, i + MOST_SHAPE_POINTS)}, cut: true});
    return out;
  });
  const parts = [[]];
  let corners = 0;
  for (const {shape: sh, cut} of pieces) {
    if (parts.at(-1).length && (cut || parts.at(-1).length >= MOST_SHAPES || corners + sh.points.length > PART_POINTS)) { parts.push([]); corners = 0; }
    parts.at(-1).push(sh); corners += sh.points.length + (sh.closed ? 1 : 0);
  }
  if (parts.length === 1) return [{...drawing, shapes: parts[0], offset: 0}];
  const lengths = parts.map(p => p.reduce((n, sh) => n + lengthOf(sh.closed ? [...sh.points, sh.points[0]] : sh.points), 0)), total = lengths.reduce((a, b) => a + b, 0) || 1;
  let offset = 0;
  return parts.map((shapes, k) => {
    const seconds = drawing.seconds * lengths[k] / total, part = {...drawing, shapes, offset, seconds, at: drawing.at + offset, part: [k + 1, parts.length], who: `${drawing.who} (part ${k + 1} of ${parts.length})`};
    offset += seconds;
    return part;
  });
}

/** footprint-story's refusal in the board's name. */
const refusal = e => new Error(`whiteboard: ${String(e?.message ?? e).replace(/^human: /, '')}`, {cause: e});

/** The intents planned in one list; a refusal that names no entry is found by planning each alone. */
function planned(intents) {
  try { return planIntents(intents, {frame: [...BOARD_FRAME]}); } catch (e) {
    for (const intent of intents) try { planIntents([intent], {frame: [...BOARD_FRAME]}); } catch (alone) { throw refusal(alone); }
    throw refusal(e);
  }
}

/**
 * The board's drawings planned. Each drawing: {path ('items[3]'), who (its words), at (film seconds), seconds (its
 * `dur`), shapes (sketch shapes), size (the marker's width), seed, accept (critics kept as written)}. Throws in the
 * item's name when a size is out of range, an accepted critic is not one its sketch is checked by, the board draws
 * more than footprint-story plans in one list, its strokes pass the budget, or footprint-story refuses a sketch.
 */
export function planSketches(drawings) {
  for (const d of drawings) {
    if (!(Number.isFinite(d.size) && d.size >= MARKER_SIZE.least && d.size <= MARKER_SIZE.most)) throw new Error(`whiteboard ${d.who}: size is the marker's width in px, from ${MARKER_SIZE.least} to ${MARKER_SIZE.most} — not ${JSON.stringify(d.size)}`);
  }
  if (drawings.length > MOST_INTENTS) throw new Error(`whiteboard: the board has ${drawings.length} drawings (each draw item, and each eureka's bulb), and footprint-story plans at most ${MOST_INTENTS} in one list — draw some on a world stage of their own ({"type": "world", "world": {"kit": "whiteboard", …}})`);
  // each part knows its drawing and that drawing's whole `dur` (a pace fix is worded in it: paceFix)
  const parts = drawings.flatMap((d, drawing) => partsOf(d).map(p => ({...p, drawing, dur: d.seconds})));
  if (parts.length > MOST_INTENTS) throw new Error(`whiteboard: the board's drawings come to ${parts.length} parts to plan (a drawing past ${MOST_SHAPES} shapes or ${PART_POINTS} corners is drawn in parts), and footprint-story plans at most ${MOST_INTENTS} in one list — draw some on a world stage of their own ({"type": "world", "world": {"kit": "whiteboard", …}})`);
  // the seed names the piece (footprint-story seeds a sketch's tremor by its name and its shapes, never its timing), so
  // the same drawing with the same seed wobbles the same way whenever it is drawn, and another seed differently
  const intents = parts.map(d => Object.freeze({do: 'sketch', name: `seed ${d.seed}`, who: d.who, shapes: d.shapes, seconds: d.seconds, model: {name: 'hand-sketch', width: d.size}}));
  const plan = parts.length ? planned(intents) : null;
  const sketches = parts.map((d, i) => {
    const move = plan.moves[i];
    // an accepted critic is one this sketch is checked by: a name it is not would accept nothing, silently
    for (const name of d.accept) if (!move.checks.includes(name)) throw new Error(`whiteboard ${d.who}: accept names "${name}", which its drawing (${move.model}) is not checked by — its critics are ${move.checks.join(', ')}`);
    return Object.freeze({...d, move, plan: move.plan});
  });
  const strokes = sketches.reduce((n, s) => n + s.plan.strokes.length, 0);
  const notes = strokeNotes(strokes, 'whiteboard', {who: 'the whiteboard', what: "the board's drawings", path: 'items', fix: 'draw fewer or plainer shapes, or wipe the board (an eraser) and draw the rest on a world stage of its own'});
  const findings = sketchFindings(sketches, plan?.findings ?? []);
  // what the film's record keeps (film/summaries.mjs): each drawing's few numbers, never its points; footprint-story's
  // reason for its order and pace is in the check's record (`log --why duration-<k> --motion story`)
  const summary = Object.freeze({strokes, sketches: Object.freeze(sketches.map(s => Object.freeze({path: s.path, at: round3(s.at), seconds: round3(s.plan.seconds),
    strokes: s.plan.strokes.length, lifts: s.plan.lifts.length, least: s.plan.least.outline + s.plan.least.detail, ...(s.part ? {part: Object.freeze([...s.part])} : {}),
    ...(s.accept.length ? {accepted: Object.freeze([...s.accept])} : {})})))});
  // each drawing's parts, in order: what a timeline item draws (sketchDraw)
  const byDrawing = drawings.map((_, k) => Object.freeze(sketches.filter(s => s.drawing === k)));
  return {intents: Object.freeze(intents), planned: plan, sketches, byDrawing, findings, notes, summary, strokes, run: parts.length ? runOf(intents, plan) : null};
}

/**
 * footprint-story's findings (planIntents' `findings`: {intent, critic, level, message, fix}) as the review's: each on
 * its item's path and the seconds it is drawn over, its words without the item's name (the path says it), the fix in
 * the recipe's words (FIXES), and a critic the item accepts marked `accepted` — shown as accepted, never as a fault.
 */
export function sketchFindings(drawings, findings) {
  return Object.freeze(findings.map(f => {
    const d = drawings[f.intent], what = f.message.startsWith(`${d.who}: `) ? f.message.slice(d.who.length + 2) : f.message;
    return Object.freeze({path: d.path, from: d.at, to: d.at + d.seconds, critic: f.critic, level: d.accept.includes(f.critic) ? 'accepted' : f.level, what, fix: fixOf(f, d)});
  }));
}

/**
 * The same intents run through footprint-story's intent decider as a footprintjs chart (runHumanFlow), so the run's
 * record answers why a drawing takes its strokes and its time: `storyreel check` runs it (check/motions.mjs), as it
 * runs a world's moves. Its result must equal the compile's: `differs` is null, or where they first part.
 * Loaded when first run: a film that never asks pays nothing.
 */
function runOf(intents, plan) {
  return async ({sink, recorders = []} = {}) => {
    const {runHumanFlow} = await import('footprint-story/humanflow');
    const {result, snapshot} = await runHumanFlow(intents, {frame: [...BOARD_FRAME], ...(sink ? {sink} : {}), recorders});
    return {snapshot, differs: firstDifference(result, plan)};
  };
}

/**
 * A planned drawing (its parts, in order: byDrawing) as a timeline item's draw: at `s` seconds into it, every stroke
 * as far as the pen has come (the isometric painter, in the item's ink), and the pen's tip while the drawing is not
 * done — the marker's place, from the plan's own sample (down and drawing, or up and on its way) — else null. The paint
 * items are made once, so a finished stroke's ring is built once (paint.mjs · strokeRing keeps it by its item).
 */
export function sketchDraw(parts, ink) {
  const painted = parts.map(p => ({p, items: strokeItems(p.plan, {of: p.path, role: 'line', colour: ink, width: p.size, at: 0})}));
  return (ctx, s) => {
    let tip = null;
    for (const {p, items} of painted) {
      const since = s - p.offset;
      if (since < 0) break;
      paintItems(ctx, items, {base: null, ink, now: since});
      if (since < p.plan.seconds) { const pen = sampleMove(p.move, since); tip = [pen.x, pen.y]; }
    }
    return tip;
  };
}
