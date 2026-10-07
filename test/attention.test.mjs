// Attention (attention.mjs) and motion (motion.mjs): where the viewer looks, as strategies — a camera that eases
// to the named thing, a spotlight, a veil, none; words that land big and settle into a label; springs with a feel.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {compileFilm, evenTimings} from '../src/index.mjs';
import {spring, pop, track, readFeel, FEEL_NAMES} from '../src/motion.mjs';
import {FOCUS, EMPHASIS} from '../src/attention.mjs';
import {wordsAt} from '../src/review.mjs';

const storyboard = {title: 'Attention', scenes: [
  {id: 'a', narration: 'First the red square sits here, quietly, in its corner of the page.'},
  {id: 'b', narration: 'Then the blue one, and then back to all of it, the whole page at once.'},
]};
const two = {name: 'two', story: {compile: () => ({hang: 1,
  draw: c => { c.fillStyle = '#f3eee3'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#c0392b'; c.fillRect(200, 200, 200, 150); c.fillStyle = '#1f4f9c'; c.fillRect(1100, 500, 240, 160); },
  regionsAt: () => [{box: [200, 200, 400, 350], path: 'red', label: 'red', name: 'red'}, {box: [1100, 500, 1340, 660], path: 'blue', label: 'blue', name: 'blue'}],
})}};
const focus = (strategy = 'camera') => ({strategy, keys: [{at: ['a', 'red square'], on: 'red', size: 'medium'}, {at: ['b', 'the blue one'], on: 'blue', size: 'close'}, {at: ['b', 'back to all'], on: 'wide'}]});
const make = (recipe, options = {}) => compileFilm({storyboard, timings: evenTimings(storyboard, {wordSeconds: .5}), recipe: {story: {kit: 'two'}, ...recipe}, kits: [two], ...options});
const at = (film, scene, phrase) => film.clock.at([scene, phrase]);
/** The share of the frame painted in a colour, sampled every 8th pixel. */
function share(film, t, [r, g, b]) {
  const c = createCanvas(1600, 900), ctx = c.getContext('2d'); film.frame(ctx, t);
  const d = ctx.getImageData(0, 0, 1600, 900).data; let hit = 0, all = 0;
  for (let y = 0; y < 900; y += 8) for (let x = 0; x < 1600; x += 8) { const i = (y * 1600 + x) * 4; all++; if (Math.abs(d[i] - r) < 12 && Math.abs(d[i + 1] - g) < 12 && Math.abs(d[i + 2] - b) < 12) hit++; }
  return hit / all;
}

test('springs with a feel: 0 before they start, home after; playful overshoots, heavy does not; a track never jumps', () => {
  assert.deepEqual(FEEL_NAMES, ['snappy', 'default', 'heavy', 'playful']);
  assert.equal(spring(0, 'default'), 0); assert.ok(Math.abs(spring(3, 'default') - 1) < 1e-3);
  const peak = f => Math.max(...Array.from({length: 200}, (_, i) => spring(i / 100, f)));
  assert.ok(peak('playful') > 1.1, 'a pop overshoots'); assert.ok(peak('heavy') <= 1 + 1e-9, 'a camera does not');
  assert.equal(pop(1, 2), 0);
  assert.equal(track(1, [[0, 0], [1, 10]]), 0); assert.ok(Math.abs(track(5, [[0, 0], [1, 10]]) - 10) < 1e-3);
  const a = track(1.3, [[0, 0], [1, 10], [1.2, -10]]), b = track(1.301, [[0, 0], [1, 10], [1.2, -10]]);
  assert.ok(Math.abs(a - b) < .5, 'a change of target mid-move is still continuous');
  assert.deepEqual(readFeel({k: 100, d: 10}), {k: 100, d: 10});
  assert.throws(() => readFeel('bouncy'), /no feel called "bouncy" \(the feels are snappy, default, heavy, playful, or \{k, d\} of your own\)/);
});

test('a camera focus: wide before the first key, then it eases to frame each named thing, and back to wide', async () => {
  const film = await make({focus: focus()}), red = at(film, 'a', 'red square'), blue = at(film, 'b', 'the blue one');
  assert.deepEqual(film.attention.focus, {strategy: 'camera', keys: [{t: +red.toFixed(3), on: 'red', size: 'medium'}, {t: +blue.toFixed(3), on: 'blue', size: 'close'}, {t: +at(film, 'b', 'back to all').toFixed(3), on: 'wide'}]});
  const before = film.focusAt(red - .2), framed = film.focusAt(blue - .05), back = film.focusAt(film.total - .01);
  assert.deepEqual([before.z, before.cx, before.cy], [1, 800, 450]);
  assert.ok(framed.z > 2.9 && Math.abs(framed.cx - 300) < 2 && Math.abs(framed.cy - 275) < 2, `framed on red: ${JSON.stringify(framed)}`);
  assert.ok(Math.abs(back.z - 1) < .05, 'back to the whole frame');
  assert.ok(share(film, blue - .05, [192, 57, 43]) > 8 * share(await make({}), blue - .05, [192, 57, 43]), 'the red square fills much more of the frame while framed');
});

test('the same focus, another strategy: a spotlight darkens the rest and leaves the named thing as it was', async () => {
  const film = await make({focus: focus('spotlight')}), t = at(film, 'b', 'the blue one') - .05;
  assert.equal(film.attention.focus.strategy, 'spotlight');
  const c = createCanvas(1600, 900), ctx = c.getContext('2d'); film.frame(ctx, t);
  const px = (x, y) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
  assert.deepEqual(px(300, 275), [192, 57, 43], 'the named thing, untouched');
  assert.ok(px(800, 120).every((v, i) => v < [243, 238, 227][i] - 60), `the rest, darkened: ${px(800, 120)}`);
  assert.deepEqual(Object.keys(FOCUS), ['camera', 'spotlight', 'dim', 'none']);
});

test('emphasis: the words land big on their beat, then settle into a label in the top corner until the next', async () => {
  const film = await make({emphasis: {strategy: 'pop', words: [{at: ['a', 'red square'], text: 'RED'}, {at: ['b', 'the blue one'], text: 'BLUE'}]}});
  const red = at(film, 'a', 'red square');
  const big = wordsAt(film, red + .5).find(w => w.text === 'RED'), small = wordsAt(film, red + 2.5).find(w => w.text === 'RED');
  assert.ok(big && big.box[3] - big.box[1] > 50 && Math.abs((big.box[0] + big.box[2]) / 2 - 800) < 10, `big and centred: ${JSON.stringify(big)}`);
  assert.ok(small && small.box[0] < 120 && small.box[3] < 80 && small.box[3] - small.box[1] < 30, `a label in the corner: ${JSON.stringify(small)}`);
  assert.equal(wordsAt(film, at(film, 'b', 'the blue one') + .5).some(w => w.text === 'RED'), false, 'gone when the next words come');
  assert.deepEqual(Object.keys(EMPHASIS), ['pop', 'label', 'corner', 'none']);
});

test('refusals name the fix; a strategy of your own has the same shape', async () => {
  await assert.rejects(make({focus: {...focus(), strategy: 'zoom'}}), /focus\.strategy must be "camera", "spotlight", "dim", "none"/);
  await assert.rejects(make({focus: {strategy: 'camera', keys: [{at: ['a', 'red square'], on: 'green'}]}}), /focus\.keys\[0\]: nothing in the picture is called "green" .* the names there are red, blue/);
  await assert.rejects(make({focus: {strategy: 'camera', keys: [{at: ['b', 'the blue one'], on: 'blue'}, {at: ['a', 'red square'], on: 'red'}]}}), /focus\.keys\[1\] comes before the one above it/);
  await assert.rejects(make({focus: focus(), notes: [{note: 'push', push: {on: 'red', size: 'medium', from: ['a', 'red square'], to: ['a', 'quietly']}}]}), /a film has one camera/);
  const seen = [];
  const film = await make({focus: {...focus(), strategy: 'mine'}}, {strategies: {focus: {mine: {show(ctx, view, paint) { seen.push(view.w); paint(ctx); }}}}});
  film.frame(createCanvas(1600, 900).getContext('2d'), at(film, 'b', 'the blue one'));
  assert.equal(film.attention.focus.strategy, 'mine'); assert.equal(seen.length, 1);
});

test('a safe area: a framed thing sits at its centre (above burned-in captions), and the picture still covers the frame', async () => {
  const film = await make({focus: {...focus(), safe: [0, 0, 1600, 700]}}), v = film.focusAt(at(film, 'b', 'the blue one') - .05);
  assert.ok(Math.abs(v.sy - 350) < 1 && Math.abs(v.sx - 800) < 1, JSON.stringify(v));
  assert.ok(v.cx - v.sx / v.z >= -1e-6 && v.cx + (1600 - v.sx) / v.z <= 1600 + 1e-6 && v.cy - v.sy / v.z >= -1e-6 && v.cy + (900 - v.sy) / v.z <= 900 + 1e-6, 'the picture covers the frame');
  assert.deepEqual(film.attention.focus.safe, [0, 0, 1600, 700]);
  await assert.rejects(make({focus: {...focus(), safe: [0, 0, 100, 100]}}), /focus\.safe is \[x0, y0, x1, y1\] on the 1600×900 frame, at least 200 × 200/);
});

test('strategies compose: ["camera", "dim"] moves the camera and veils the rest of its view — and a reader of the picture sees the veil', async () => {
  const {wordsAt: read} = await import('../src/review.mjs');
  const labelled = {name: 'labelled', story: {compile: () => ({hang: 1,
    draw: c => { c.fillStyle = '#f3eee3'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#c0392b'; c.fillRect(200, 200, 200, 150); c.fillStyle = '#222'; c.font = '30px sans-serif'; c.textBaseline = 'middle'; c.fillText('NEAR', 230, 280); c.fillText('FAR', 600, 330); c.fillRect(1100, 500, 240, 160); },
    regionsAt: () => [{box: [200, 200, 400, 350], path: 'red', label: 'red', name: 'red'}, {box: [1100, 500, 1340, 660], path: 'blue', label: 'blue', name: 'blue'}],
  })}};
  const film = await compileFilm({storyboard, timings: evenTimings(storyboard, {wordSeconds: .5}), recipe: {story: {kit: 'labelled'}, focus: {...focus(), strategy: ['camera', 'dim']}}, kits: [labelled]});
  const t = at(film, 'b', 'the blue one') - .05, words = read(film, t);
  assert.equal(film.attention.focus.strategy, 'camera+dim');
  assert.equal(words.find(w => w.text === 'NEAR').alpha, 1, 'the named thing is clear');
  assert.ok(words.find(w => w.text === 'FAR').alpha < .5, `the rest is veiled: ${JSON.stringify(words.find(w => w.text === 'FAR'))}`);
  assert.ok(film.focusAt(t).z > 2, 'and the camera framed it');
  await assert.rejects(make({focus: {...focus(), strategy: ['camera', 'mover']}}, {strategies: {focus: {mover: {moves: true, show: (c, v, p) => p(c)}}}}), /only one of them may move the camera/);
});

test('emphasis "label": the words sit on the thing in focus, above its top-left corner, and travel with the camera', async () => {
  const film = await make({focus: focus('camera'), emphasis: {strategy: 'label', words: [{at: ['a', 'red square'], text: 'RED'}, {at: ['b', 'the blue one'], text: 'BLUE'}]}});
  const t = at(film, 'b', 'the blue one') - .05, v = film.focusAt(t);
  const red = [(200 - v.cx) * v.z + v.sx, (200 - v.cy) * v.z + v.sy];   // the red square's top-left corner on the frame
  const label = wordsAt(film, t).find(w => w.text === 'RED');
  assert.ok(label && Math.abs(label.box[0] - (Math.max(16, red[0]) + 16)) < 6 && label.box[3] < red[1], `on the red square: ${JSON.stringify({label, red})}`);
  const wide = await make({emphasis: {strategy: 'label', words: [{at: ['a', 'red square'], text: 'RED'}]}}), alone = wordsAt(wide, at(wide, 'a', 'red square') + 1).find(w => w.text === 'RED');
  assert.ok(alone && Math.abs((alone.box[0] + alone.box[2]) / 2 - 800) < 4 && alone.box[1] < 70, 'no focus: at the top, in the middle');
});

test('emphasis "label" glides as the focus comes and goes: no jump between the top middle and the thing', async () => {
  const film = await make({focus: focus('camera'), emphasis: {strategy: 'label', words: [{at: ['a', 'red square'], text: 'RED'}]}});
  // Where the view turns from wide to focused (and back), the label moves no more than a smooth move would in 1/240 s.
  const turns = [];
  for (let t = .05; t < film.total; t += .05) if ((film.focusAt(t - .05).w - .5) * (film.focusAt(t).w - .5) <= 0) turns.push(t);
  assert.ok(turns.length >= 2, 'the view turns focused and back');
  for (const turn of turns) {
    const spots = [];
    for (let t = turn - .15; t < turn + .15; t += 1 / 240) { const w = wordsAt(film, t).find(x => x.text === 'RED'); if (w) spots.push(w.box); }
    const step = Math.max(...spots.slice(1).map((b, i) => Math.hypot(b[0] - spots[i][0], b[1] - spots[i][1])));
    assert.ok(spots.length > 40 && step < 30, `near ${turn.toFixed(2)} s the label moves at most ${step.toFixed(1)} px in 1/240 s`);
  }
});
