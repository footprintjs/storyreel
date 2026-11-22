// A hand-drawn line in a map's paint list (footprint-story's `stroke` item: a width and a time per point) drawn by the
// isometric kit's painter (src/kits/isometric/paint.mjs · paintItems): the ring round it is footprint-story's
// (human · strokeOutline), filled, with a round end's circle at each end; and in a film it is drawn as far as the pen
// has come at the frame's time, from its piece's start (draw.mjs · sinceStart), whole once the pen is done.
//
// No letters are drawn anywhere here, so no font decides a pixel (CI is Linux, with DejaVu).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import {isoStyle, paintPiece, isometric} from 'footprint-story/isometric';
import {strokeOutline, sketchyLine, hatchTexture} from 'footprint-story/human';
import {paintItems, reachedPoints, rgba} from '../src/kits/isometric/paint.mjs';
import {readMap} from '../src/kits/isometric/read.mjs';
import {buildMap} from '../src/kits/isometric/build.mjs';
import {layCables} from '../src/kits/isometric/cables.mjs';
import {rideOf} from '../src/kits/isometric/ride.mjs';
import {drawMap, lookOf, sinceStart, ISO_LOOK} from '../src/kits/isometric/draw.mjs';
import {compileIsometric} from '../src/kits/isometric/index.mjs';
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

/** What the painter should draw for `points` reached of a round-capped stroke: the ring traced, closed, then each end's circle. */
function expected(points) {
  const ops = [['beginPath']];
  if (points.length >= 2) { strokeOutline(points).forEach(([x, y], i) => ops.push([i ? 'lineTo' : 'moveTo', x, y])); ops.push(['closePath']); }
  for (const [x, y, w] of points.length === 1 ? points : [points[0], points.at(-1)]) ops.push(['moveTo', x + w / 2, y], ['arc', x, y, w / 2, 0, 2 * Math.PI]);
  return ops;
}
/** The path calls of a recording (every call but the styles and the fill), numbers to compare within 1e-6. */
const pathOf = (ops) => ops.filter((op) => op[0] !== 'set' && op[0] !== 'fill');
function samePath(got, want) {
  assert.equal(got.length, want.length, 'as many path calls');
  got.forEach((op, i) => { assert.equal(op[0], want[i][0], `call ${i}`); close(op.slice(1), want[i].slice(1), `call ${i} (${op[0]})`); });
}

test('a stroke is footprint-story\'s ring round it, filled once with its round ends, in the kit\'s ink — never stroked at one width', () => {
  const c = recorder();
  paintItems(c, [LINE], {base: '#d9e4f3', ink: '#14181f'});
  samePath(pathOf(c.ops), expected(LINE.points));
  // one fill in the ink (the item's colour is null: the page's), no canvas line of one width, no width set
  assert.deepEqual(c.ops.filter((op) => op[0] === 'set' || op[0] === 'fill'), [['set', 'fillStyle', '#14181f'], ['fill']]);
  assert.equal(c.ops.filter((op) => op[0] === 'stroke').length, 0);
  // a colour of its own is drawn as given; a faint one as rgba of it, filled once (its ring and ends never darken each other)
  const faint = recorder();
  paintItems(faint, [{...LINE, stroke: {...LINE.stroke, colour: '#336699', alpha: 0.4}}], {base: null, ink: '#14181f'});
  assert.deepEqual(faint.ops.filter((op) => op[0] === 'set' || op[0] === 'fill'), [['set', 'fillStyle', rgba('#336699', 0.4)], ['fill']]);
  // a butt end: the ring alone; a square end is no ring footprint-story gives, so it is refused, never made here
  const butt = recorder();
  paintItems(butt, [{...LINE, stroke: {...LINE.stroke, cap: 'butt'}}], {base: null, ink: '#000000'});
  samePath(pathOf(butt.ops), expected(LINE.points).filter((op) => op[0] !== 'arc').slice(0, -2));
  assert.throws(() => paintItems(recorder(), [{...LINE, stroke: {...LINE.stroke, cap: 'square'}}], {base: null, ink: '#000000'}), /a stroke item's cap is "round" or "butt" — not "square" \(footprint-story's strokeOutline gives no square end\): give the stroke of "a" cap "round", as footprint-story's strokeItems does/);
  // an item footprint-story's list never holds is still refused by name
  assert.throws(() => paintItems(recorder(), [{...LINE, item: 'star'}], {base: null, ink: '#000000'}), /a paint item is a polygon, an ellipse, a path, lines or a stroke — not "star"/);
});

test('a stroke is drawn as far as the pen has come: the ring of the points reached by now, never a second curve', () => {
  const at = (now) => { const c = recorder(); paintItems(c, [LINE], {base: null, ink: '#000000', now}); return c.ops; };
  // before its first point: nothing at all
  assert.deepEqual(at(-0.01), []);
  // its first point: the pen's touch, the dot of its end
  samePath(pathOf(at(0)), expected(LINE.points.slice(0, 1)));
  // between two points: the ring of those reached (footprint-story gives no point between two at a time, so the cut is at the last one reached)
  samePath(pathOf(at(0.25)), expected(LINE.points.slice(0, 3)));
  samePath(pathOf(at(0.3)), expected(LINE.points.slice(0, 4)), 'a point is reached at its own time');
  // at its last point and after: the whole line, the very list (the usual `now` is Infinity: a still draws it whole)
  for (const now of [0.4, 7, Infinity, undefined]) samePath(pathOf(at(now)), expected(LINE.points));
  assert.equal(reachedPoints(LINE.points, 1), LINE.points, 'a finished line is the list itself');
  assert.deepEqual(reachedPoints(LINE.points, 0.15), LINE.points.slice(0, 2));
  // what is not a stroke is drawn whole whatever the time: a face is not drawn by a hand
  const face = {item: 'polygon', role: 'top', of: 'a', points: [[0, 0], [9, 0], [9, 9]], fill: {mix: null, colour: '#123456'}, stroke: null};
  const faces = (now) => { const c = recorder(); paintItems(c, [face], {base: null, ink: '#000000', now}); return c.ops; };
  assert.deepEqual(faces(-5), faces(Infinity));
});

test('pixels: a faint stroke is covered once over — its ends add to its ring, whichever way it is drawn', () => {
  // WHY: the ring and its round ends are one path under the canvas's nonzero rule; an end turned against the ring would
  // cut a hole where the two overlap, and two fills would darken it. Grey at 0.5 over white is 128 wherever it is laid.
  for (const points of [[[20, 50, 20, 0], [180, 50, 20, 1]], [[180, 50, 20, 0], [20, 50, 20, 1]], [[100, 20, 20, 0], [100, 80, 20, 1]], [[100, 80, 20, 0], [100, 20, 20, 1]]]) {
    const canvas = createCanvas(200, 100), c = canvas.getContext('2d');
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, 200, 100);
    paintItems(c, [{...LINE, points, stroke: {...LINE.stroke, width: 20, colour: '#000000', alpha: 0.5}}], {base: null, ink: '#000000'});
    const red = (x, y) => c.getImageData(x, y, 1, 1).data[0];
    const [a, b] = points, mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    for (const [x, y, what] of [[a[0], a[1], 'its first end'], [b[0], b[1], 'its last end'], [mid[0], mid[1], 'its middle']]) assert.ok(Math.abs(red(x, y) - 128) <= 1, `${JSON.stringify(points)} at ${what}: ${red(x, y)}`);
    // and the round end reaches past the ring by half the width, no further
    const dir = [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])];
    assert.ok(Math.abs(red(b[0] + dir[0] * 7, b[1] + dir[1] * 7) - 128) <= 1, 'inside the round end');
    assert.equal(red(b[0] + dir[0] * 12, b[1] + dir[1] * 12), 255, 'past the round end');
  }
});

// a block in footprint-story's two hand-drawn choices, handed in as a tool hands its own (human · sketchyLine, hatchTexture)
const SKETCHED = isoStyle({line: 'human:sketchy', texture: 'human:hatch'}, {choices: [sketchyLine, hatchTexture]});
const strokesOf = (items) => items.filter((it) => it.item === 'stroke');

test('the kit draws a map\'s hand-drawn lines from each piece\'s start: partly at first, whole once the pen is done', () => {
  // the map built as the kit builds it, its pieces' lists then painted by footprint-story in the hand-drawn style
  const map = buildMap(readMap({blocks: [{name: 'web'}, {name: 'db', kind: 'cylinder', size: [1.8, 1.8, 1.2]}], wires: [{arrow: 'web to db'}]}, 'strokes'), 'strokes');
  layCables(map);
  for (const w of map.wires) { w.appearAt = null; w.riding = rideOf(w, w.cable.length, 0); }
  for (const f of map.floors) f.appearAt = null;
  const look = lookOf(loadTheme('paper')), start = {web: 2, db: null};
  for (const b of map.blocks) { b.appearAt = start[b.name]; b.paint = paintPiece(SKETCHED, {name: b.name, kind: b.kind, at: b.at, size: b.size}, map.grid).items; }
  const web = map.blocks.find((b) => b.name === 'web'), db = map.blocks.find((b) => b.name === 'db');
  assert.ok(strokesOf(web.paint).length > 3 && strokesOf(db.paint).length > 3, 'both hold hand-drawn lines and hatching');
  const last = (b) => Math.max(...strokesOf(b.paint).flatMap((it) => it.points.map((p) => p[3])));
  const drawn = (t) => { const c = recorder(); drawMap(c, map, t, look); return JSON.stringify(c.ops); };
  const alone = (b, now) => { const c = recorder(); paintItems(c, b.paint, {base: ISO_LOOK.tone, ink: look.ink, now}); return JSON.stringify(c.ops).slice(1, -1); };
  // a piece's time is its own: `web` comes in at 2 s, so at 3 s its pen has drawn 1 s of it; `db` is in from the start
  assert.equal(sinceStart(2, 3), 1); assert.equal(sinceStart(null, 3), 3);
  const t = 3, now = drawn(t);
  assert.ok(now.includes(alone(web, 1)) && now.includes(alone(db, 3)), 'each block painted as far as its own pen has come');
  assert.ok(!now.includes(alone(web, Infinity)) && alone(web, 1) !== alone(web, Infinity), 'web not yet whole');
  // the drawing grows with the film's time, and is whole once the last point of each is reached
  const fills = (t1) => (drawn(t1).match(/"fill"\]/g) ?? []).length;
  assert.ok(fills(2.5) < fills(3) && fills(3) < fills(5), 'more of the line drawn as the film goes on');
  const done = Math.max(2 + last(web), last(db)) + 0.01;
  assert.ok(drawn(done).includes(alone(web, Infinity)) && drawn(done).includes(alone(db, Infinity)));
  assert.equal(drawn(done + 50), drawn(done), 'a finished drawing is the same picture every frame after');
});

test('pixels: one hand-drawn block, partly drawn and whole, pinned', () => {
  const grid = isometric({tile: 100, origin: [200, 60]}), items = paintPiece(SKETCHED, {name: 'server', kind: 'block', at: [0, 0], size: [2, 2, 1]}, grid).items;
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
      start: 'fbc781c493f06ec655e39126cf080388016a8ec009db4b86d8a7aae3e26e7e72',
      outline: '7db677d48384bcbca47663499da3d032be7a8e9627c7323488492acd776999cf',
      whole: 'ffdf395107ecc63c91ac3a60daf68d1445e9e4cb4ff274dbdf5923e6f8d14cdf',
    });
  }
});

test('a world cannot name a hand-drawn style yet: footprint-story\'s map build takes no tool\'s own choices', () => {
  // WHY pinned: buildIsoMap / runMapFlow read a world's style with footprint-story's own choices only (mapSpec.js ·
  // readIsoMap calls isoStyle(row) with no choices), so "human:sketchy" is refused there, in its words, naming the
  // entry. The painter above draws such a list; the world takes the style once the map build takes the choices.
  const refused = (style, pattern) => assert.throws(() => compileIsometric({blocks: [{name: 'a'}], style}, {clock: {at: () => 0}, theme: null, where: 'stage map'}), pattern);
  refused({line: 'human:sketchy'}, /^Error: stage map: isometric style: line has no choice "human:sketchy" — the line choices are "ink" or "none"$/);
  refused({texture: 'human:hatch'}, /^Error: stage map: isometric style: texture has no choice "human:hatch" — the texture choices are "none"$/);
});
