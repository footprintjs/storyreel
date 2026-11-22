// A hand-drawn line in a map's paint list (footprint-story's `stroke` item: a width and a time per point) drawn by the
// isometric kit's painter (src/kits/isometric/paint.mjs · paintItems): the part drawn by now is footprint-story's
// (human · strokeAt) and so is the one capped ring round it (human · strokeOutline); the painter only fills that ring,
// by the non-zero rule. In a film the line is drawn as far as the pen has come at the frame's time, from its piece's
// start (draw.mjs · sinceStart), whole once the pen is done. And a world styled by hand (`human:sketchy`,
// `human:hatch`) builds, draws and is recorded with those names.
//
// No letters are drawn in the pinned pictures, so no font decides a pixel (CI is Linux, with DejaVu).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import {isoStyle, paintPiece, isometric, USUAL_STYLE} from 'footprint-story/isometric';
import {strokeAt, strokeOutline, sketchyLine, hatchTexture} from 'footprint-story/human';
import {paintItems, rgba, strokeRing} from '../src/kits/isometric/paint.mjs';
import {strokeNotes, STROKE_BUDGET} from '../src/kits/isometric/notes.mjs';
import {sinceStart, ISO_LOOK} from '../src/kits/isometric/draw.mjs';
import {compileIsometric} from '../src/kits/isometric/index.mjs';
import {STYLE_CHOICES} from '../src/kits/isometric/read.mjs';
import {loadTheme} from '../src/index.mjs';
import {PINS_HERE} from './golden.mjs';

/** A canvas that keeps every call and every style set, in order. */
function recorder() {
  const ops = [], state = {globalAlpha: 1};
  return new Proxy({}, {
    get: (_, key) => (key === 'ops' ? ops : key in state ? state[key] : (...args) => { ops.push([key, ...args]); }),
    set: (_, key, value) => { state[key] = value; ops.push(['set', key, value]); return true; },
  });
}
const close = (a, b, what) => { assert.equal(a.length, b.length, what); a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) <= 1e-6, `${what}: ${v} against ${b[i]}`)); };

// a stroke as footprint-story's strokeItems writes one: thin at its ends, a time per point, rising
const LINE = Object.freeze({item: 'stroke', role: 'ink', of: 'a', fill: null, stroke: {colour: null, alpha: 1, width: 3, join: 'round', cap: 'round'},
  points: [[10, 20, 1, 0], [20, 22, 2.5, 0.1], [30, 26, 3, 0.2], [40, 32, 2, 0.3], [50, 40, 1, 0.4]]});

/** The path the painter should trace for `item` at `now`: footprint-story's ring of the part drawn, closed. */
function expected(item, now = Infinity) {
  const ring = strokeOutline(strokeAt(item.points, now), {cap: item.stroke.cap});
  return ring.length ? [['beginPath'], ...ring.map(([x, y], i) => [i ? 'lineTo' : 'moveTo', x, y]), ['closePath']] : [];
}
/** The path calls of a recording (every call but the styles and the fill), numbers compared within 1e-6. */
const pathOf = (ops) => ops.filter((op) => op[0] !== 'set' && op[0] !== 'fill');
function samePath(got, want) {
  assert.equal(got.length, want.length, 'as many path calls');
  got.forEach((op, i) => { assert.equal(op[0], want[i][0], `call ${i}`); close(op.slice(1), want[i].slice(1), `call ${i} (${op[0]})`); });
}
const paint = (item, now, colours = {base: null, ink: '#14181f'}) => { const c = recorder(); paintItems(c, [item], {...colours, now}); return c.ops; };

test('a stroke is footprint-story\'s capped ring round it, filled once by the non-zero rule in the kit\'s ink — never stroked at one width', () => {
  const ops = paint(LINE, undefined, {base: '#d9e4f3', ink: '#14181f'});
  samePath(pathOf(ops), expected(LINE));
  // one fill in the ink (the item's colour is null: the page's), by non-zero (the ring can cross itself at a round cap)
  assert.deepEqual(ops.filter((op) => op[0] === 'set' || op[0] === 'fill'), [['set', 'fillStyle', '#14181f'], ['fill', 'nonzero']]);
  assert.equal(ops.filter((op) => ['stroke', 'arc', 'ellipse'].includes(op[0])).length, 0, 'no canvas line, no circle of the kit\'s own: the cap is in the ring');
  // a colour of its own is drawn as given; a faint one as rgba of it, filled once
  assert.deepEqual(paint({...LINE, stroke: {...LINE.stroke, colour: '#336699', alpha: 0.4}}).filter((op) => op[0] === 'set'), [['set', 'fillStyle', rgba('#336699', 0.4)]]);
  // every cap the paint list takes is footprint-story's ring, each different
  const caps = ['round', 'butt', 'square'].map((cap) => { const item = {...LINE, stroke: {...LINE.stroke, cap}}; samePath(pathOf(paint(item)), expected(item)); return JSON.stringify(pathOf(paint(item))); });
  assert.equal(new Set(caps).size, 3);
  // an item footprint-story's list never holds is still refused by name
  assert.throws(() => paintItems(recorder(), [{...LINE, item: 'star'}], {base: null, ink: '#000000'}), /a paint item is a polygon, an ellipse, a path, lines or a stroke — not "star"/);
});

test('a stroke is drawn as far as the pen has come: footprint-story\'s stroke at that time, the pen\'s place between two points included', () => {
  assert.deepEqual(paint(LINE, -0.01), [], 'before its first point: nothing');
  for (const now of [0, 0.05, 0.25, 0.3, 0.399]) samePath(pathOf(paint(LINE, now)), expected(LINE, now));
  // between two points the line ends at the pen's place, not at the last point reached: it grows smoothly
  assert.notDeepEqual(JSON.stringify(pathOf(paint(LINE, 0.25))), JSON.stringify(pathOf(paint(LINE, 0.2))));
  assert.deepEqual(strokeAt(LINE.points, 0.25).at(-1).map((v) => +v.toFixed(9)), [35, 29, 2.5, 0.25]);
  // at its last point and after: the whole line (the usual `now` is Infinity: a still draws it whole)
  for (const now of [0.4, 7, Infinity, undefined]) samePath(pathOf(paint(LINE, now)), expected(LINE));
  // what is not a stroke is drawn whole whatever the time: a face is not drawn by a hand
  const face = {item: 'polygon', role: 'top', of: 'a', points: [[0, 0], [9, 0], [9, 9]], fill: {mix: null, colour: '#123456'}, stroke: null};
  assert.deepEqual(paint(face, -5), paint(face, Infinity));
});

test('pixels: a faint stroke is covered once over, its ends included, whichever way it is drawn', () => {
  // Grey at 0.5 over white is 128 wherever the ring lies: no hole where it crosses itself, no double cover at an end
  for (const points of [[[20, 50, 20, 0], [180, 50, 20, 1]], [[180, 50, 20, 0], [20, 50, 20, 1]], [[100, 20, 20, 0], [100, 80, 20, 1]], [[100, 80, 20, 0], [100, 20, 20, 1]]]) {
    const canvas = createCanvas(200, 100), c = canvas.getContext('2d');
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, 200, 100);
    paintItems(c, [{...LINE, points, stroke: {...LINE.stroke, width: 20, colour: '#000000', alpha: 0.5}}], {base: null, ink: '#000000'});
    const red = (x, y) => c.getImageData(x, y, 1, 1).data[0];
    const [a, b] = points, mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    for (const [x, y, what] of [[a[0], a[1], 'its first end'], [b[0], b[1], 'its last end'], [mid[0], mid[1], 'its middle']]) assert.ok(Math.abs(red(x, y) - 128) <= 1, `${JSON.stringify(points)} at ${what}: ${red(x, y)}`);
    // the round end reaches past the line by half its width, no further
    const dir = [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])];
    assert.ok(Math.abs(red(b[0] + dir[0] * 7, b[1] + dir[1] * 7) - 128) <= 1, 'inside the round end');
    assert.equal(red(b[0] + dir[0] * 12, b[1] + dir[1] * 12), 255, 'past the round end');
  }
});

// a world in footprint-story's two hand-drawn choices, as a recipe writes it; no labels, so no letters
const SKETCH_STYLE = {line: 'human:sketchy', texture: 'human:hatch'};
const WORLD = {blocks: [{name: 'web', appear: ['map', 'web']}, {name: 'db', kind: 'cylinder', size: [1.8, 1.8, 1.2]}], wires: [{arrow: 'web to db'}], style: SKETCH_STYLE};
const theme = loadTheme('paper');
const sketched = (world = WORLD) => compileIsometric(world, {clock: {at: (anchor) => (anchor[1] === 'web' ? 2 : 0)}, theme, where: 'stage map'});

test('a world styled by hand builds, and its record names the style: the world\'s, its summary and the map flow\'s', async () => {
  const world = sketched(), row = {...USUAL_STYLE, effects: [...USUAL_STYLE.effects], line: 'human:sketchy', texture: 'human:hatch'};
  assert.deepEqual(world.map.style, {row, options: {}});
  assert.deepEqual(world.summary.style, {row, options: {}});
  // the map flow (`storyreel check`) is handed the same choices and builds the very map the kit draws
  const run = await world.mapRun();
  assert.equal(run.differs, null);
  assert.deepEqual(run.snapshot.sharedState.style, {row, options: {}});
  // the choices the kit hands are footprint-story's own two, nothing of the kit's
  assert.deepEqual(STYLE_CHOICES, [sketchyLine, hatchTexture]);
  // an option is taken in footprint-story's words, and refused in them, naming the entry
  assert.doesNotThrow(() => sketched({...WORLD, style: {line: {name: 'human:sketchy', width: 4}, texture: {name: 'human:hatch', spacing: 12}}}));
  assert.throws(() => sketched({...WORLD, style: {line: {name: 'human:sketchy', width: 50}}}), /^Error: stage map: isometric style: line "human:sketchy" takes a width from 0\.5 to 20 — not 50$/);
});

test('the kit draws a hand-styled world\'s lines from each piece\'s start: partly at first, whole once the pen is done', () => {
  const world = sketched();
  const lists = (t) => { const c = recorder(); world.draw(c, t); return JSON.stringify(c.ops); };
  // `web` comes in at 2 s: at 3 s its pen has drawn 1 s of it; `db` is in from the start
  assert.equal(sinceStart(2, 3), 1); assert.equal(sinceStart(null, 3), 3);
  const fills = (t) => (lists(t).match(/"fill","nonzero"\]/g) ?? []).length;
  assert.ok(fills(0.5) < fills(3) && fills(3) <= fills(20), 'more of the lines drawn as the film goes on');
  assert.notEqual(lists(2.5), lists(3), 'the drawing moves between frames');
  assert.equal(lists(200), lists(400), 'a finished drawing is the same picture every frame after');
});

test('pixels: one hand-drawn block, partly drawn and whole, pinned', () => {
  const grid = isometric({tile: 100, origin: [200, 60]}), items = paintPiece(isoStyle(SKETCH_STYLE, {choices: STYLE_CHOICES}), {name: 'server', kind: 'block', at: [0, 0], size: [2, 2, 1]}, grid).items;
  const picture = (now) => {
    const canvas = createCanvas(400, 300), c = canvas.getContext('2d');
    c.fillStyle = '#f5f7fa'; c.fillRect(0, 0, 400, 300);
    paintItems(c, items, {base: ISO_LOOK.tone, ink: '#14181f', now});
    const data = c.getImageData(0, 0, 400, 300).data;
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] < 60) ink += 1;
    return {hash: createHash('sha256').update(data).digest('hex'), ink};
  };
  const shots = {start: picture(0.5), outline: picture(2.5), whole: picture(Infinity)};
  assert.ok(shots.start.ink < shots.outline.ink && shots.outline.ink < shots.whole.ink, `ink grows as the pen goes: ${shots.start.ink} < ${shots.outline.ink} < ${shots.whole.ink}`);
  assert.equal(picture(1e6).hash, shots.whole.hash, 'past its last point the block is whole');
  if (PINS_HERE) {
    assert.deepEqual(Object.fromEntries(Object.entries(shots).map(([k, v]) => [k, v.hash])), {
      start: '2e0d80f5446a34c26efb4221a93a83165cc6182f4d5e4cb18c06a3412af56704',
      outline: '5ea83ff49da9a96a50d1ef5315321da8487845c55e28f35fc7e7097d15684c89',
      whole: 'e7b1d0625e01bc89e9cd738538d7b734ed51f45fa48400be56b5898e16972ae8',
    });
  }
});

test('a finished stroke\'s ring is built once (footprint-story\'s ring of the whole stroke); a stroke being drawn has its ring built at its frame', () => {
  // WHY pinned: a film draws every frame, and a hatched world holds thousands of strokes (bench/strokes.mjs)
  const item = {...LINE, points: LINE.points.map((p) => [...p]), stroke: {...LINE.stroke}};
  const whole = strokeRing(item, 0.4);
  assert.equal(strokeRing(item, 7), whole, 'the same ring, not built again');
  assert.equal(strokeRing(item, Infinity), whole);
  close(whole.flat(), strokeOutline(strokeAt(item.points, Infinity), {cap: 'round'}).flat(), 'the finished ring is footprint-story\'s whole ring');
  // a stroke being drawn: built at each frame, footprint-story's ring of the part drawn
  const part = strokeRing(item, 0.25);
  assert.notEqual(strokeRing(item, 0.25), part, 'a partial ring is not kept');
  close(part.flat(), strokeOutline(strokeAt(item.points, 0.25), {cap: 'round'}).flat(), 'the partial ring');
  assert.deepEqual(strokeRing(item, -1), []);
  // each item its own: an equal stroke in another item has its own ring
  const twin = {...item};
  assert.notEqual(strokeRing(twin, 1), whole);
});

test('a world\'s strokes have a budget (ours): a note from its note on, a refusal naming the style and the fix past its cap', () => {
  assert.deepEqual(STROKE_BUDGET, {note: 2000, most: 20000});
  assert.deepEqual(strokeNotes(STROKE_BUDGET.note - 1, 'stage map'), []);
  const [note] = strokeNotes(STROKE_BUDGET.note, 'stage map');
  assert.equal(note.level, 'info'); assert.equal(note.path, 'style');
  assert.match(note.message, /^stage map: isometric style: the map's hand-drawn lines come to 2000 strokes \(a note from 2000, refused past 20000\): each frame fills every stroke drawn so far, so the film renders slower — to lighten it, give the hatch a wider spacing/);
  assert.equal(strokeNotes(STROKE_BUDGET.most, 'stage map').length, 1);
  assert.throws(() => strokeNotes(STROKE_BUDGET.most + 1, 'stage map'), /^Error: stage map: isometric style: the map's hand-drawn lines come to 20001 strokes, and a world draws at most 20000 — give the hatch a wider spacing \(texture: \{"name": "human:hatch", "spacing": 16\}\), take the texture out, or draw fewer blocks$/);
  // a world counts its own: the summary keeps the count (none for a world with no strokes), and a big one is noted
  assert.equal(sketched().summary.strokes > 0, true);
  assert.ok(!('strokes' in compileIsometric({blocks: [{name: 'a'}]}, {clock: {at: () => 0}, theme, where: 'stage map'}).summary));
  const blocks = Array.from({length: 64}, (_, i) => ({name: `b${i}`, at: [(i % 8) * 2, Math.floor(i / 8) * 2], size: [1.2, 1.2, 1]}));
  const big = compileIsometric({blocks, style: SKETCH_STYLE}, {clock: {at: () => 0}, theme, where: 'stage map'});
  assert.equal(big.summary.strokes, 2496);
  assert.ok(big.notes.some((n) => n.path === 'style' && /come to 2496 strokes/.test(n.message)));
});
