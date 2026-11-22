// The isometric kit's painter (src/kits/isometric/paint.mjs): a piece's paint list (footprint-story's style step) drawn
// on a canvas as the list says, and the kit painting the built map's lists with it instead of drawing faces itself.
// The pixels are pinned in golden.json (film.test.mjs); here a recording canvas checks the calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {paintItems, mix, rgba} from '../src/kits/isometric/paint.mjs';
import {readMap} from '../src/kits/isometric/read.mjs';
import {buildMap} from '../src/kits/isometric/build.mjs';
import {layCables} from '../src/kits/isometric/cables.mjs';
import {rideOf} from '../src/kits/isometric/ride.mjs';
import {drawMap, lookOf, ISO_LOOK} from '../src/kits/isometric/draw.mjs';
import {loadTheme} from '../src/index.mjs';

/** A canvas that keeps every call and every style set, in order (a method it does not know is recorded too). */
function recorder() {
  const ops = [], state = {globalAlpha: 1};
  const c = new Proxy({}, {
    get: (_, key) => (key === 'ops' ? ops : key in state ? state[key] : (...args) => { ops.push([key, ...args]); }),
    set: (_, key, value) => { state[key] = value; ops.push(['set', key, value]); return true; },
  });
  return c;
}

const stroke = (over = {}) => ({colour: null, alpha: 1, width: 2.5, join: 'round', cap: 'butt', ...over});

test('the painter draws every kind of item, each traced, filled and stroked as the list says', () => {
  const items = [
    {item: 'polygon', role: 'left', of: 'a', points: [[0, 0], [10, 0], [10, 10]], fill: {mix: ['#000000', 0.06], colour: null}, stroke: stroke()},
    {item: 'ellipse', role: 'top', of: 'a', cx: 5, cy: 6, rx: 7, ry: 3, fill: {mix: ['#ffffff', 0.2], colour: '#123456'}, stroke: stroke({colour: '#abcdef', width: 4, join: 'bevel', cap: 'square'})},
    {item: 'path', role: 'side', of: 'a', segments: [['move', 1, 2], ['line', 1, 8], ['arc', 5, 8, 4, 2, Math.PI, 0, true], ['arc', 5, 8, 4, 2, 0, 1, false], ['line', 9, 2], ['close']], fill: {mix: null, colour: null}, stroke: null},
    {item: 'lines', role: 'grid', of: 'a', segments: [[0, 0, 4, 4], [4, 0, 0, 4]], fill: null, stroke: stroke({alpha: 0.16, width: 1.5, join: 'miter'})},
  ];
  const c = recorder();
  paintItems(c, items, {base: '#d9e4f3', ink: '#14181f'});
  assert.deepEqual(c.ops, [
    // a polygon: its fill is the recipe over the kit's base; its stroke the kit's ink, as the hex itself at alpha 1
    ['beginPath'], ['moveTo', 0, 0], ['lineTo', 10, 0], ['lineTo', 10, 10], ['closePath'],
    ['set', 'fillStyle', mix('#d9e4f3', '#000000', 0.06)], ['fill'],
    ['set', 'strokeStyle', '#14181f'], ['set', 'lineWidth', 2.5], ['set', 'lineJoin', 'round'], ['set', 'lineCap', 'butt'], ['stroke'],
    // an ellipse, whole: a colour the list gives is drawn as given, fill and stroke alike, with the stroke's own width, join and cap
    ['beginPath'], ['ellipse', 5, 6, 7, 3, 0, 0, 2 * Math.PI],
    ['set', 'fillStyle', '#123456'], ['fill'],
    ['set', 'strokeStyle', '#abcdef'], ['set', 'lineWidth', 4], ['set', 'lineJoin', 'bevel'], ['set', 'lineCap', 'square'], ['stroke'],
    // a path with arcs, each turned the way the list counts it; a fill with no mix is the base itself; no stroke, none drawn
    ['beginPath'], ['moveTo', 1, 2], ['lineTo', 1, 8], ['ellipse', 5, 8, 4, 2, 0, Math.PI, 0, true], ['ellipse', 5, 8, 4, 2, 0, 0, 1, false], ['lineTo', 9, 2], ['closePath'],
    ['set', 'fillStyle', '#d9e4f3'], ['fill'],
    // loose lines: no fill; a faint stroke as rgba of the ink
    ['beginPath'], ['moveTo', 0, 0], ['lineTo', 4, 4], ['moveTo', 4, 0], ['lineTo', 0, 4],
    ['set', 'strokeStyle', 'rgba(20,24,31,0.16)'], ['set', 'lineWidth', 1.5], ['set', 'lineJoin', 'miter'], ['set', 'lineCap', 'butt'], ['stroke'],
  ]);
  // no base (a floor with no colour of its own): a recipe comes to nothing, so nothing is filled; a given colour still is
  const bare = recorder();
  paintItems(bare, items, {base: null, ink: '#14181f'});
  assert.deepEqual(bare.ops.filter((op) => op[0] === 'set' && op[1] === 'fillStyle'), [['set', 'fillStyle', '#123456']]);
  assert.equal(bare.ops.filter((op) => op[0] === 'fill').length, 1);
  // a #rgb base mixes as its #rrggbb (a recipe may write either), and rgba reads it the same way
  assert.equal(mix('#abc', '#000000', 0.5), mix('#aabbcc', '#000000', 0.5));
  assert.equal(rgba('#abc', 0.5), 'rgba(170,187,204,0.5)');
  // what footprint-story's list never holds is refused, never skipped
  assert.throws(() => paintItems(recorder(), [{...items[0], item: 'star'}], {base: null, ink: '#000000'}), /a paint item is a polygon, an ellipse, a path or lines — not "star"/);
  assert.throws(() => paintItems(recorder(), [{...items[2], segments: [['move', 0, 0], ['curve', 1, 1]]}], {base: null, ink: '#000000'}), /path has no step "curve"/);
});

/** A world built and laid as the kit compiles it (index.mjs · compileIsometric), every piece in from the start. */
function builtWorld(world) {
  const map = buildMap(readMap(world, 'paint'), 'paint');
  layCables(map);
  for (const p of [...map.blocks, ...map.floors, ...map.wires]) p.appearAt = null;
  for (const w of map.wires) w.riding = rideOf(w, w.cable.length, 0);
  return map;
}

const WORLD = {
  blocks: [{name: 'web', label: 'Web'}, {name: 'api', label: 'API', color: '#bcd6f3', group: 'back'}, {name: 'db', kind: 'cylinder', label: 'Data', tone: 'warn', size: [1.8, 1.8, 1.2], group: 'back'}],
  floors: [{group: 'back', label: 'Back end', color: '#eef3f8'}, {at: [0, 0], size: [3, 3]}],
  wires: [{arrow: 'web to api', label: 'https', packets: 1}, {arrow: 'api to db'}],
};

/** Where `part` stands in `whole` as one unbroken run, or -1. */
const runAt = (whole, part) => {
  const key = (op) => JSON.stringify(op), w = whole.map(key), p = part.map(key);
  for (let i = 0; i + p.length <= w.length; i += 1) if (p.every((op, k) => op === w[i + k])) return i;
  return -1;
};

test('the kit paints each piece\'s list from the built map, in the kit\'s colours, and draws no face itself', () => {
  const map = builtWorld(WORLD), look = lookOf(loadTheme('paper'));
  // each piece holds the built map's own list (the style step's output), never a copy
  map.blocks.forEach((b, i) => assert.equal(b.paint, map.built.paints[i]));
  map.floors.forEach((f, i) => assert.equal(f.paint, map.built.floorPaints[i]));
  const c = recorder();
  drawMap(c, map, 10, look);
  // each piece's list, painted alone with the colours the kit picks, is one unbroken run of what the whole map drew
  const base = {web: ISO_LOOK.tone, api: '#bcd6f3', db: mix(look.tones.warn, '#ffffff', 0.6)};
  const alone = (items, colours) => { const one = recorder(); paintItems(one, items, colours); return one.ops; };
  const runs = [
    ...map.floors.map((f) => alone(f.paint, {base: f.color, ink: look.ink})),
    ...map.order.map((b) => alone(b.paint, {base: base[b.name], ink: look.ink})),
  ];
  let after = -1;
  for (const run of runs) {
    const at = runAt(c.ops, run);
    assert.ok(at > after, 'each list painted whole, floors first, then the blocks back to front');
    after = at;
  }
  // a list swapped for another is what is drawn: the kit reads the list, it does not trace the shape's faces again
  const marker = [{item: 'polygon', role: 'top', of: 'db', points: [[1, 1], [2, 1], [2, 2]], fill: {mix: null, colour: '#010203'}, stroke: null}];
  const db = map.blocks.find((b) => b.name === 'db'), was = alone(db.paint, {base: base.db, ink: look.ink});
  db.paint = marker;
  const swapped = recorder();
  drawMap(swapped, map, 10, look);
  assert.ok(runAt(swapped.ops, alone(marker, {base: base.db, ink: look.ink})) >= 0, 'the swapped list is painted');
  assert.equal(runAt(swapped.ops, was), -1, 'and the faces it replaced are not drawn by any other code');
  assert.equal(swapped.ops.filter((op) => op[0] === 'ellipse').length, 0, 'the cylinder\'s top was its list\'s only ellipse');
});

test('draw.mjs traces no face: no faces read, no ellipse, no face tones — it hands each list to paint.mjs', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/kits/isometric/draw.mjs', import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.ok(!/\.faces\b|\bellipse\(|FACE_TONES|\btrace\(/.test(source), 'draw.mjs draws a face itself');
  assert.match(source, /import \{paintItems[^}]*\} from '\.\/paint\.mjs'/);
  assert.match(source, /paintItems\(c, f\.paint, /);
  assert.match(source, /paintItems\(c, b\.paint, /);
});

test('ISO_LOOK\'s edge width and tile-line alpha are the ones the paint list carries', () => {
  const map = builtWorld(WORLD);
  const strokes = (role) => [...map.built.paints, ...map.built.floorPaints].flat().filter((it) => it.role === role).map((it) => it.stroke);
  assert.ok(strokes('top').length && strokes('top').every((s) => s.width === ISO_LOOK.line && s.alpha === 1));
  assert.ok(strokes('grid').length && strokes('grid').every((s) => s.alpha === ISO_LOOK.grid));
});

test('the kit\'s colour mix is footprint-story\'s mixColour for every #rrggbb (one rule; the kit keeps its own only to read #rgb until mixColour does)', async () => {
  const {mixColour} = await import('footprint-story/isometric');
  const hex = (n) => `#${(n & 0xffffff).toString(16).padStart(6, '0')}`;
  // a fixed walk over the colour cube (no Math.random: the same cases every run)
  for (let k = 0; k < 4000; k++) {
    const a = hex(k * 2654435761), b = hex(k * 40503 + 7), share = (k % 101) / 100;
    assert.equal(mix(a, b, share), mixColour(a, b, share), `${a} toward ${b} by ${share}`);
  }
});
