// The whiteboard draws by hand with footprint-story's plan (kits/whiteboard/sketch.mjs, 0.48.0): each drawing is a
// `do: 'sketch'` intent planned by the intent decider (the `hand-sketch` model: planSketch), so its stroke order, the
// pen's pace and width and its lifts are footprint-story's; the board fills each stroke's ring as far as the pen has
// come (the isometric painter: strokeOutline(strokeAt(points, now))) and draws the marker at the pen's own sample.
// The author's `dur` is the plan's seconds, so the film's clock does not move. Its critics reach the review's `motion`
// check, each on its item, with the fix in the recipe's words, and `accept` keeps one as written.
//
// No letters are drawn in the boards checked here, so no font decides a pixel.
import test from 'node:test';
import assert from 'node:assert/strict';
import {planIntents, sampleMove, strokeAt, strokeOutline, strokeItems, MOST_INTENTS, MOST_SHAPES, MOST_SHAPE_POINTS} from 'footprint-story/human';
import {compileWhiteboard, drawWhiteboard, whiteboardKit} from '../src/kits/whiteboard/index.mjs';
import {shapeOf, sketchFindings, planSketches, sketchDraw, partsOf, PART_POINTS, BOARD_FRAME, MARKER_SIZE} from '../src/kits/whiteboard/sketch.mjs';
import {shapes, stickFigure, renderTimeline, drawStrokes} from '../src/kits/whiteboard/board.mjs';
import {strokeNotes, STROKE_BUDGET} from '../src/kits/isometric/notes.mjs';
import {compileExample} from './golden.mjs';

const clock = {at: a => a};
/** A canvas that keeps every call and every style set, in order (a transform too: the marker's place). */
function recorder() {
  const ops = [];
  return new Proxy({}, {
    get: (_, key) => (key === 'ops' ? ops : key === 'measureText' ? (text) => ({width: 20 * text.length}) : key === 'createRadialGradient' || key === 'createLinearGradient' ? () => ({addColorStop() {}}) : (...args) => { ops.push([key, ...args]); }),
    set: (_, key, value) => { ops.push(['set', key, value]); return true; },
  });
}
const SPEC = Object.freeze({items: [
  {at: 1, dur: 1.2, draw: [['figure', 300, 620, 1.1]]},
  {at: 2, dur: 0.8, draw: [['ellipse', 700, 560, 60, 38], ['ellipse', 760, 520, 22, 20]], color: 'blue', size: 8, seed: 3},
  {at: 2.5, dur: 0.9, write: 'pebbles', x: 900, y: 300},
  {at: 3, eureka: [1400, 300]},
]});

test('a closed shape is one footprint-story takes as closed: a rect, a ring, a tag; an open line stays open', () => {
  assert.deepEqual(shapeOf(shapes.rect(10, 20, 100, 50)), {points: [[10, 20], [110, 20], [110, 70], [10, 70]], closed: true});
  const ring = shapeOf(shapes.ring(0, 0, 10, 20));
  assert.equal(ring.closed, true); assert.equal(ring.points.length, 48, 'the ring\'s 48 segments, its first point given once');
  assert.deepEqual(shapeOf([[0, 0], [10, 0], [10, 10]]), {points: [[0, 0], [10, 0], [10, 10]]});
  assert.deepEqual(shapeOf([[0, 0], [10, 0]], {layer: 'detail', group: 'g'}), {points: [[0, 0], [10, 0]], layer: 'detail', group: 'g'});
  // the open ellipse the paper kit's clock icon draws runs past its start, and stays the open line it is
  assert.equal(shapeOf(shapes.ellipse(0, 0, 10, 10)).closed, undefined);
  // a stick figure's head is a ring now: one stroke round, not an arc past its start
  assert.equal(shapeOf(stickFigure(0, 0)[0]).closed, true);
});

test('each drawing is footprint-story\'s plan of it, over the author\'s dur: its order, its strokes (the fewest its corners allow) and its lifts', () => {
  const board = compileWhiteboard(SPEC, clock), {sketch} = board;
  assert.equal(sketch.sketches.length, 3, 'two draw items and a eureka\'s bulb; writing has no sketch');
  assert.deepEqual(sketch.sketches.map(s => s.path), ['items[0]', 'items[1]', 'items[3]']);
  // the very plan the intent decider makes of the same intents, with the board's frame
  assert.deepEqual(planIntents(sketch.intents, {frame: [...BOARD_FRAME]}).moves.map(m => m.plan), sketch.sketches.map(s => s.plan));
  for (const [k, s] of sketch.sketches.entries()) {
    assert.equal(s.move.model, 'hand-sketch');
    assert.ok(Math.abs(s.plan.seconds - [1.2, 0.8, 0.7][k]) < 1e-9, 'the drawing takes the author\'s dur (a eureka\'s bulb 0.7 s), lifts and all');
    assert.equal(s.plan.strokes.length, s.plan.least.outline + s.plan.least.detail, 'drawn in the fewest strokes its corners allow');
    assert.equal(s.plan.lifts.length, s.plan.strokes.length - 1, 'the pen lifts between strokes, and each lift takes time');
    assert.ok(s.plan.lifts.every(l => l.seconds > 0));
  }
  // the figure: its head meets its neck at a corner, so head, body and legs are one piece of lines (two strokes, its
  // four odd corners: neck, hip, two feet), its arms another (one) — three strokes, where the board drew four, in order
  assert.equal(sketch.sketches[0].plan.strokes.length, 3);
  assert.deepEqual(sketch.sketches[0].plan.least, {outline: 3, detail: 0});
  // the eureka's glass and base first, then its rays: outline, then detail
  const bulb = sketch.sketches[2].plan.strokes, firstRay = bulb.findIndex(s => s.layer === 'detail');
  assert.ok(firstRay > 0 && bulb.slice(firstRay).every(s => s.layer === 'detail'), 'every ray after the glass');
  // the seed names the piece: another seed, another tremor; the same seed, the same drawing
  const again = compileWhiteboard(SPEC, clock).sketch.sketches[1].plan, other = compileWhiteboard({items: [{...SPEC.items[1], seed: 4}]}, clock).sketch.sketches[0].plan;
  assert.deepEqual(again, sketch.sketches[1].plan);
  assert.notDeepEqual(other.strokes[0].xs, again.strokes[0].xs);
  assert.deepEqual(other.strokes.map(s => s.path), again.strokes.map(s => s.path), 'the same order and corners: only the hand\'s wobble differs');
});

test('the ink is footprint-story\'s ring of each stroke as far as the pen has come, and the marker is at the pen\'s own sample', () => {
  const board = compileWhiteboard({items: [SPEC.items[0]]}, clock), [s] = board.sketch.sketches;
  const items = strokeItems(s.plan, {of: s.path, role: 'line', colour: '#23262b', width: 6, at: 0});
  for (const since of [0.05, 0.4, s.plan.strokes[1].start - 0.01, 0.9, 1.19, 1.2, 3]) {
    const c = recorder();
    drawWhiteboard(c, board, 1 + since);
    // every path the board fills after its surface: the strokes' rings, in order, then the marker's own shapes
    const rings = items.map(it => strokeOutline(strokeAt(it.points, since), {cap: 'round'})).filter(r => r.length);
    const fills = c.ops.filter(op => op[0] === 'fill' && op[1] === 'nonzero').length;
    assert.equal(fills, rings.length, `at ${since} s: one non-zero fill a stroke drawn so far`);
    const moves = c.ops.filter(op => op[0] === 'moveTo');
    rings.forEach((ring, k) => assert.ok(moves.some(op => Math.abs(op[1] - ring[0][0]) < 1e-9 && Math.abs(op[2] - ring[0][1]) < 1e-9), `at ${since} s: ring ${k} traced from its first point`));
    const marker = c.ops.find(op => op[0] === 'translate');
    if (since >= s.plan.seconds) { assert.equal(marker, undefined, 'no marker once the drawing is done'); continue; }
    // (the board hands the item the frame's time less its start: the same seconds, to the last bit or two)
    const pen = sampleMove(s.move, 1 + since - 1);
    assert.deepEqual(marker.slice(1), [pen.x, pen.y], `at ${since} s the marker is where footprint-story's pen is`);
  }
  // in the air between two strokes the marker is on its way, not on either end, and nothing new is inked
  const lift = s.plan.lifts[0], mid = s.plan.strokes[0].start + s.plan.strokes[0].seconds + lift.seconds / 2, pen = sampleMove(s.move, mid);
  assert.equal(pen.down, 0, 'the pen is up');
  const end = [s.plan.strokes[0].xs.at(-1), s.plan.strokes[0].ys.at(-1)], next = [s.plan.strokes[1].xs[0], s.plan.strokes[1].ys[0]];
  assert.ok(Math.hypot(pen.x - end[0], pen.y - end[1]) > 1 && Math.hypot(pen.x - next[0], pen.y - next[1]) > 1, 'between the two');
});

test('the timeline: a drawing\'s draw gives the tip while drawing, words are written on as before, the marker shows the last pen still down', () => {
  const s = planSketches([{path: 'items[0]', who: 'items[0]', at: 0, seconds: 1, shapes: [shapeOf(shapes.rect(100, 100, 200, 100))], size: 6, seed: 1, accept: []}]).sketches[0];
  const draw = sketchDraw([s], '#123456'), c = recorder();
  assert.deepEqual(draw(c, 0.5), (({x, y}) => [x, y])(sampleMove(s.move, 0.5)));
  assert.equal(draw(c, 1), null, 'done at its seconds');
  assert.ok(c.ops.some(op => op[0] === 'set' && op[1] === 'fillStyle' && op[2] === '#123456'), 'in the item\'s ink');
  // renderTimeline hands each item its seconds since it began, and puts the marker at the tip of the last one drawing
  const seen = [], r = recorder();
  renderTimeline(r, [{at: 2, draw: (_, since) => { seen.push(since); return [10, 20]; }}, {at: 5, draw: () => { throw new Error('not begun'); }}], 3.25);
  assert.deepEqual(seen, [1.25]);
  assert.deepEqual(r.ops.find(op => op[0] === 'translate').slice(1), [10, 20]);
  // a word item still reveals left to right, its marker at the edge of the reveal
  const board = compileWhiteboard({items: [SPEC.items[2]]}, clock), w = recorder();
  drawWhiteboard(w, board, 2.5 + 0.45);
  assert.ok(w.ops.some(op => op[0] === 'fillText' && op[1] === 'pebbles'));
  assert.ok(w.ops.some(op => op[0] === 'translate'), 'the marker writes');
});

test('critics: the review\'s finding names the item and the fix in the recipe\'s words; accept keeps one as written, and an unknown name is refused', () => {
  const drawings = [{path: 'items[2]', who: 'items[2] ("box")', at: 4, seconds: 1.5, accept: []}, {path: 'items[5]', who: 'items[5]', at: 7, seconds: 1, accept: ['pen-lifts']}];
  const found = (intent) => ({intent, critic: 'pen-lifts', level: 'warn', message: `${drawings[intent].who}: its lines take 3 strokes where 1 would draw them, each line once (2 more lifts of the pen) — it reads as traced piece by piece, not drawn`, fix: "draw shared corners once: … use model: 'hand-sketch'"});
  const [one, two] = sketchFindings(drawings, [found(0), found(1)]);
  assert.deepEqual({...one, fix: undefined}, {path: 'items[2]', from: 4, to: 5.5, critic: 'pen-lifts', level: 'warn', what: 'its lines take 3 strokes where 1 would draw them, each line once (2 more lifts of the pen) — it reads as traced piece by piece, not drawn', fix: undefined});
  assert.match(one.fix, /the same corner points/); assert.doesNotMatch(one.fix, /model|layer|group/, 'in the recipe\'s words: a whiteboard item has no model, layer or group');
  assert.equal(two.level, 'accepted', 'an accepted critic is shown as accepted, never as a fault');
  // an unworded critic keeps footprint-story's fix
  assert.equal(sketchFindings(drawings, [{...found(0), critic: 'later'}])[0].fix, found(0).fix);
  // accept on a real board: a critic it is checked by is taken, any other refused naming its critics
  assert.equal(compileWhiteboard({items: [{...SPEC.items[0], accept: ['pen-lifts']}]}, clock).sketch.summary.sketches[0].accepted[0], 'pen-lifts');
  assert.throws(() => compileWhiteboard({items: [{...SPEC.items[0], accept: ['jerk']}]}, clock), /whiteboard items\[0\]: accept names "jerk", which its drawing \(hand-sketch\) is not checked by — its critics are pen-lifts, stroke-order, hatch-gaps/);
  assert.throws(() => compileWhiteboard({items: [{...SPEC.items[0], accept: 'pen-lifts'}]}, clock), /whiteboard item 0: accept is a list of the critics/);
  assert.throws(() => compileWhiteboard({items: [{...SPEC.items[2], accept: ['pen-lifts']}]}, clock), /words written on \(write\) have none/);
  // a board drawn well finds nothing: every drawing in the fewest strokes, outline first
  assert.deepEqual(compileWhiteboard(SPEC, clock).sketch.findings, []);
});

test('refusals: a marker size out of range, more drawings than footprint-story plans in one list, a shape footprint-story refuses, the stroke budget', () => {
  assert.throws(() => compileWhiteboard({items: [{...SPEC.items[0], size: 30}]}, clock), new RegExp(`whiteboard items\\[0\\]: size is the marker's width in px, from ${MARKER_SIZE.least} to ${MARKER_SIZE.most} — not 30`));
  const many = Array.from({length: MOST_INTENTS + 1}, (_, i) => ({at: i, dur: 0.5, draw: [['line', 10, 10 + i, 200, 10 + i]]}));
  assert.throws(() => compileWhiteboard({items: many}, clock), new RegExp(`the board has ${MOST_INTENTS + 1} drawings .* footprint-story plans at most ${MOST_INTENTS} in one list — draw some on a world stage of their own`));
  assert.equal(compileWhiteboard({items: many.slice(0, MOST_INTENTS)}, clock).sketch.sketches.length, MOST_INTENTS, 'as many as it plans are drawn');
  assert.throws(() => compileWhiteboard({items: [{at: 0, dur: 1, draw: [['line', 10, 10, 10, 10]]}]}, clock), /^Error: whiteboard: items\[0\] has nothing to draw/);
  // the 0.46 stroke budget, in the board's words
  assert.deepEqual(strokeNotes(STROKE_BUDGET.note - 1, 'whiteboard', {who: 'the whiteboard', what: "the board's drawings", path: 'items', fix: 'f'}), []);
  assert.match(strokeNotes(STROKE_BUDGET.note, 'whiteboard', {who: 'the whiteboard', what: "the board's drawings", path: 'items', fix: 'f'})[0].message, /^the whiteboard: the board's drawings come to 2000 strokes/);
  assert.throws(() => strokeNotes(STROKE_BUDGET.most + 1, 'whiteboard', {who: 'the whiteboard', what: "the board's drawings", path: 'items', fix: 'f'}), /a world draws at most 20000 — f/);
  // the isometric world's words are its own, as they were
  assert.match(strokeNotes(STROKE_BUDGET.note, 'stage map')[0].message, /^stage map: isometric style: the map's hand-drawn lines come to 2000 strokes/);
});

test('the kit hands out its drawings\' run (the intent decider as a chart): the same plan, and a record that says why', async () => {
  const world = whiteboardKit.story.compile(SPEC, clock, {cameraSpeed: 1});
  assert.equal(typeof world.motionRun, 'function'); assert.deepEqual(world.motionFindings, []);
  assert.deepEqual(world.summary.sketches.map(s => [s.path, s.strokes, s.lifts, s.least]), compileWhiteboard(SPEC, clock).sketch.sketches.map(s => [s.path, s.plan.strokes.length, s.plan.lifts.length, s.plan.strokes.length]));
  const {snapshot, differs} = await world.motionRun({});
  assert.equal(differs, null, 'the chart plans the drawings the board draws');
  assert.equal(snapshot.sharedState['duration-0'].strokes, 3, 'duration-0: the first drawing\'s strokes, lifts and seconds');
  assert.equal(snapshot.sharedState['model-0'].model, 'hand-sketch');
  // a board that draws nothing hands out nothing
  const words = whiteboardKit.story.compile({items: [SPEC.items[2]]}, clock, {cameraSpeed: 1});
  assert.ok(!('motionRun' in words) && !('summary' in words) && !('notes' in words));
});

test('a whiteboard film carries its drawings as a moving world: the review\'s motion check reads them, the record keeps their numbers', async () => {
  const film = await compileExample('hello');
  const [run] = film.motionRuns;
  assert.equal(run.name, 'story'); assert.equal(run.kit, 'whiteboard'); assert.deepEqual(run.findings, [], 'the example draws as a hand draws');
  const {differs} = await run.run({});
  assert.equal(differs, null);
});

test('the paper kit\'s marker lines are drawn whole, as before (drawStrokes takes no share any more)', () => {
  const c = recorder();
  drawStrokes(c, [shapes.rect(0, 0, 100, 50), [[0, 0], [10, 10]]], {color: '#c26a12', size: 5, seed: 41});
  assert.equal(c.ops.filter(op => op[0] === 'fill').length, 2, 'every line filled');
  assert.ok(c.ops.some(op => op[0] === 'set' && op[1] === 'fillStyle' && op[2] === '#c26a12'));
});

test('a drawing too big for one sketch is drawn in parts, one after another, ending at its dur; a line past a shape\'s points is cut where its pieces meet', () => {
  const ticks = Array.from({length: 4000}, (_, i) => ['tick', 200 + (i % 60) * 20, 200 + Math.floor(i / 60) * 6, 1]);
  const board = compileWhiteboard({items: [{at: 1, dur: 2, draw: ticks}]}, clock), parts = board.sketch.byDrawing[0];
  assert.ok(parts.length > 1, `${parts.length} parts`);
  parts.forEach((p, k) => {
    assert.deepEqual(p.part, [k + 1, parts.length]); assert.match(p.who, new RegExp(`^items\\[0\\] \\(part ${k + 1} of ${parts.length}\\)$`));
    assert.ok(p.shapes.length <= MOST_SHAPES && p.shapes.reduce((n, sh) => n + sh.points.length, 0) <= PART_POINTS);
    assert.ok(Math.abs(p.plan.seconds - p.seconds) < 1e-9);
    if (k) assert.ok(Math.abs(p.offset - (parts[k - 1].offset + parts[k - 1].seconds)) < 1e-9, 'each after the last');
  });
  assert.ok(Math.abs(parts.at(-1).offset + parts.at(-1).seconds - 2) < 1e-9, 'the item still ends at its dur');
  assert.equal(parts.reduce((n, p) => n + p.plan.strokes.length, 0), 4000, 'every tick drawn once');
  // the item's draw paints the parts begun, the marker on the one drawing
  const c = recorder(), tip = board.items[0].draw(c, parts[1].offset + 0.01);
  const pen = sampleMove(parts[1].move, 0.01);
  assert.ok(Math.abs(tip[0] - pen.x) < 1e-6 && Math.abs(tip[1] - pen.y) < 1e-6);
  // a line of more points than one shape holds: cut in pieces whose ends meet, each a part of its own (one sketch would
  // join them into one stroke, and a stroke holds at most 1365 corners)
  const long = Array.from({length: MOST_SHAPE_POINTS * 2 + 5}, (_, i) => [100 + i * 0.5, 400 + 20 * Math.sin(i / 30)]);
  const cut = partsOf({path: 'items[0]', who: 'items[0]', at: 0, seconds: 1, shapes: [shapeOf(long)], size: 6, seed: 1, accept: []});
  assert.equal(cut.length, 3); assert.ok(cut.every(p => p.shapes.length === 1));
  assert.deepEqual(cut[1].shapes[0].points[0], cut[0].shapes[0].points.at(-1), 'the pieces share their ends');
  assert.deepEqual(planSketches(cut).sketches.map(s => s.plan.strokes.length), [1, 1, 1], 'each piece one stroke');
});
