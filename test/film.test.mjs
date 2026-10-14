import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, writeFileSync, mkdirSync, statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCanvas} from '@napi-rs/canvas';
import {compileFilm, evenTimings, makeFilm, changedFrames, approveFilm} from '../src/index.mjs';
import {PINS_HERE} from './golden.mjs';
import {tempDir} from './tmp.mjs';

const hello = fileURLToPath(new URL('../examples/hello/', import.meta.url));
const storyboard = JSON.parse(readFileSync(hello + 'storyboard.json', 'utf8'));
const recipe = JSON.parse(readFileSync(hello + 'recipe.json', 'utf8'));
const timings = evenTimings(storyboard, {tail: 4});
const film = await compileFilm({storyboard, timings, recipe, root: hello});
const hashAt = (f, t) => { const c = createCanvas(320, 180), x = c.getContext('2d'); x.scale(.2, .2); f.frame(x, t); return createHash('sha256').update(c.data()).digest('hex'); };

test('even timings: every word timed in order, so every phrase resolves', () => {
  assert.equal(timings.scenes.length, 2);
  assert.ok(timings.scenes.every(s => s.words.every((w, i) => w.end > w.start && (i === 0 || w.start >= s.words[i - 1].end))));
  assert.ok(film.beats.length > 10, 'the recipe named its phrases and each was resolved');
  assert.ok(film.beats.every(b => Number.isFinite(b.t) && b.t >= 0 && b.t <= film.total));
});

test('a film is a pure function of time: the same moment draws the same pixels, in any order', async () => {
  const again = await compileFilm({storyboard, timings, recipe, root: hello});
  const times = [0, 3.3, 9.1, film.total * .6, film.total - .1];
  const forward = times.map(t => hashAt(film, t)), backward = [...times].reverse().map(t => hashAt(again, t)).reverse();
  assert.deepEqual(forward, backward);
});

/**
 * Law 4, every frame restores the canvas: after each frame the transform, alpha, compositing, shadow and
 * filter are as they were, and a fill of the whole frame reaches its corners (a leaked clip would show there).
 */
const FILL = [18, 52, 86];
function assertRestored(x, t) {
  const m = x.getTransform(), at = `at ${t.toFixed(2)} s`;
  assert.ok(Math.abs(m.a - .1) < 1e-6 && Math.abs(m.d - .1) < 1e-6 && m.b === 0 && m.c === 0 && m.e === 0 && m.f === 0, `transform leaked ${at}`);
  assert.equal(x.globalAlpha, 1, `alpha leaked ${at}`);
  assert.equal(x.globalCompositeOperation, 'source-over', `compositing leaked ${at}`);
  assert.equal(x.shadowBlur, 0, `shadow leaked ${at}`);
  if (typeof x.filter === 'string') assert.equal(x.filter, 'none', `filter leaked ${at}`);
  x.fillStyle = `rgb(${FILL.join(',')})`; x.fillRect(0, 0, 1600, 900);
  for (const [px, py] of [[0, 0], [159, 0], [0, 89], [159, 89]]) assert.deepEqual([...x.getImageData(px, py, 1, 1).data.slice(0, 3)], FILL, `clip leaked ${at}: the corner ${px},${py} was not filled`);
}
const {FILMS, compileExample} = await import('./golden.mjs');
for (const name of Object.keys(FILMS)) test(`every frame restores the canvas: ${name} (transform, alpha, compositing, shadow, filter, clip)`, async () => {
  const f = await compileExample(name), c = createCanvas(160, 90), x = c.getContext('2d');
  for (let t = 0; t < f.total; t += f.total / 30) { x.resetTransform(); x.scale(.1, .1); f.frame(x, t); assertRestored(x, t); }
});

test('the restore check sees a leaked clip, compositing, shadow and filter', () => {
  const leaks = {clip: x => { x.save(); x.beginPath(); x.rect(0, 0, 800, 450); x.clip(); }, compositing: x => { x.globalCompositeOperation = 'multiply'; }, shadow: x => { x.shadowBlur = 4; }};
  if (typeof createCanvas(1, 1).getContext('2d').filter === 'string') leaks.filter = x => { x.filter = 'blur(2px)'; };
  for (const [what, leak] of Object.entries(leaks)) {
    const x = createCanvas(160, 90).getContext('2d'); x.scale(.1, .1); leak(x);
    assert.throws(() => assertRestored(x, 0), new RegExp(`${what} leaked`));
  }
});

test('kits are plug-ins: a story kit draws the opening world; unknown kits and stage types refuse', async () => {
  // A one-prop story kit: a red square, full frame (no hanging board).
  const squareKit = {name: 'square', story: {compile: () => ({hang: 1, spotAt: () => null, sounds: [{time: .5, type: 'tap'}], draw: c => { c.fillStyle = '#ff0000'; c.fillRect(700, 350, 200, 200); }})}};
  const custom = await compileFilm({storyboard, timings, recipe: {...recipe, story: {kit: 'square'}}, root: hello, kits: [squareKit]});
  const c = createCanvas(1600, 900), x = c.getContext('2d'); custom.frame(x, 1);
  assert.deepEqual([...x.getImageData(800, 450, 1, 1).data.slice(0, 3)], [255, 0, 0]);
  assert.ok(custom.sounds.some(s => s.type === 'tap' && s.time === .5));
  await assert.rejects(compileFilm({storyboard, timings, recipe: {...recipe, story: {kit: 'nowhere'}}, root: hello}), /No story kit "nowhere"/);
  await assert.rejects(compileFilm({storyboard, timings, recipe: {...recipe, stages: [{...recipe.stages[0], type: 'hologram'}]}, root: hello}), /which no kit provides/);
  await assert.rejects(compileFilm({storyboard, timings, recipe: {...recipe, stages: [{...recipe.stages[0], sparkle: 1}]}, root: hello}), /unsupported key sparkle/);
});

const ffmpeg = spawnSync(process.env.FFMPEG_BIN || 'ffmpeg', ['-version']).status === 0;
test('makeFilm: a footprintjs pipeline writes the film and its making-of record', {skip: ffmpeg ? false : 'ffmpeg not on PATH'}, async () => {
  const out = path.join(tempDir('film'), 'hello.mp4');
  const result = await makeFilm({storyboard, recipe, root: hello, timings, out, render: {width: 320, height: 180, fps: 6}});
  assert.ok(existsSync(result.out));
  const record = JSON.parse(readFileSync(result.makingOf, 'utf8'));
  assert.equal(record.beats.length, film.beats.length);
  assert.deepEqual(record.beats[0].said, {scene: 'story', phrase: 'a shepherd', plus: 0});
  assert.ok(record.pipeline.some(e => /check-inputs/.test(e.text ?? '')) && record.pipeline.some(e => /render-film/.test(e.text ?? '')), 'the stages are in the footprintjs narrative');
  assert.ok(record.tools.every(t => t.name && t.license));
  // The compile, stage by stage (compileFilm's record): its five stages, and every line as when.<recipe path>.
  assert.deepEqual(record.compile.filter(e => e.type === 'stage').map(e => e.stageId), ['read-inputs', 'build-worlds-and-stages', 'guesses-and-notes', 'checks', 'resolve-lines']);
  assert.ok(record.compile.some(e => e.key === 'when.story.items[0].at'), 'a resolved line is in the compile record');
  // Loudness in two passes: the type FFmpeg reported is recorded. The hello film is silence and a few quiet
  // taps (a measured range above FFmpeg's default 7); with no LRA set the range target follows the
  // measurement (render.mjs · effectiveTarget), so one fixed gain is kept and nothing is flagged.
  assert.equal(record.loudness.type, 'linear', JSON.stringify(record.loudness));
  assert.ok(Object.values(record.loudness.measured).every(Number.isFinite), 'the whole film was measured');
  assert.ok(record.loudness.target.LRA >= Math.ceil(record.loudness.measured.LRA), 'the range target asked for is recorded');
  assert.equal(record.loudness.flag, undefined);
  // A finished run's record is as it always was: no failed mark, and its keys in their order.
  assert.deepEqual(Object.keys(record), ['schemaVersion', 'made', 'out', 'seconds', 'chapters', 'span', 'inputs', 'pacing', 'claims', 'beats', 'sounds', 'loudness', 'tools', 'pipeline', 'compile']);
});

// A picture strategy whose plan throws: the run fails in its plan-picture stage, after the film is compiled.
const failingVideo = (boom, before = () => {}) => ({name: 'failing', plan: () => { before(); throw boom; }, one: async () => ({}), join: async () => [], render: async () => ({})});
const failedRecordIn = dir => JSON.parse(readFileSync(path.join(dir, 'making-of.failed.json'), 'utf8'));

test('makeFilm: a run that fails writes making-of.failed.json, marked failed, never replaces a finished record, and throws the same error', async t => {
  const dir = tempDir('film-failed', t), out = path.join(dir, 'hello.mp4'), boom = new Error('the plan broke');
  const finished = '{"a finished render": true}';
  writeFileSync(path.join(dir, 'making-of.json'), finished);
  await assert.rejects(makeFilm({storyboard, recipe, root: hello, timings, out, render: {width: 320, height: 180, fps: 6, video: failingVideo(boom)}}), e => e === boom);
  assert.equal(readFileSync(path.join(dir, 'making-of.json'), 'utf8'), finished, 'a finished record is never replaced');
  const record = failedRecordIn(dir);
  assert.deepEqual(record.failed, {error: 'the plan broke'});
  assert.equal(record.schemaVersion, 1);
  assert.ok(record.inputs.storyboard && record.inputs.recipe, 'what the film was made from, as far as the run got');
  assert.ok(record.pipeline.some(e => /compile-film/.test(e.text ?? '')), 'the stages that ran are in the footprintjs narrative');
  assert.ok(!record.pipeline.some(e => /render-film/.test(e.text ?? '')), 'and none after the failure');
  assert.ok(record.compile.length > 0 && record.tools.length > 0);
  assert.equal(record.out, undefined, 'no film was made');
  assert.equal(existsSync(out), false);
  // A failed render is never approved.
  assert.throws(() => approveFilm({record: path.join(dir, 'making-of.failed.json'), by: 'S'}), /that render failed \(the plan broke\)/);
});

test('makeFilm: a failure in the first stage writes the record too', async t => {
  const dir = tempDir('film-failed-early', t);
  await assert.rejects(makeFilm({storyboard: {...storyboard, scenes: []}, recipe, root: hello, timings, out: path.join(dir, 'hello.mp4')}), /The storyboard has no scenes/);
  const early = failedRecordIn(dir);
  assert.match(early.failed.error, /^The storyboard has no scenes/);
  assert.equal(early.inputs, undefined, 'nothing compiled, nothing claimed');
});

test('makeFilm: any thrown value is rethrown as itself, and the record keeps it as text it can always make', async t => {
  const hostile = {
    'a string': ['not an Error', 'not an Error'],
    'a throwing toString': [{toString() { throw new Error('no text'); }}, null],
    'a null-prototype object': [Object.create(null), null],
    'a Proxy whose traps throw': [new Proxy({}, {get() { throw new Error('trap'); }, getPrototypeOf() { throw new Error('trap'); }, has() { throw new Error('trap'); }, ownKeys() { throw new Error('trap'); }}), null],
  };
  for (const [name, [value, text]] of Object.entries(hostile)) {
    const dir = tempDir('film-failed-hostile', t);
    // Caught by hand: assert.rejects hands the reason back from an async function, which reads a Proxy's `then`.
    let caught;
    try { await makeFilm({storyboard, recipe, root: hello, timings, out: path.join(dir, 'hello.mp4'), render: {video: failingVideo(value)}}); } catch (e) { caught = e; }
    assert.ok(caught === value, `${name}: rethrown as itself`);
    assert.equal(failedRecordIn(dir).failed.error, text ?? 'a thrown value that cannot be shown as text', name);
  }
});

test('makeFilm: a failed record that cannot be written never replaces the error', async t => {
  const dir = tempDir('film-failed-unwritable', t), boom = new Error('boom');
  const blockRecord = () => mkdirSync(path.join(dir, 'making-of.failed.json'));
  await assert.rejects(makeFilm({storyboard, recipe, root: hello, timings, out: path.join(dir, 'hello.mp4'), render: {video: failingVideo(boom, blockRecord)}}), e => e === boom);
  assert.ok(statSync(path.join(dir, 'making-of.failed.json')).isDirectory(), 'the folder in its place is left as it was');
});

test('the cartoon kit: a full-frame world, deterministic, and every frame restores the canvas', async () => {
  const {cartoonKit} = await import('../src/index.mjs');
  const dir = fileURLToPath(new URL('../examples/shepherd/', import.meta.url));
  const sb = JSON.parse(readFileSync(dir + 'storyboard.json', 'utf8')), rc = JSON.parse(readFileSync(dir + 'recipe.json', 'utf8'));
  const tm = evenTimings(sb, {tail: 3.5});
  const a = await compileFilm({storyboard: sb, timings: tm, recipe: rc, kits: [cartoonKit], root: dir});
  const b = await compileFilm({storyboard: sb, timings: tm, recipe: rc, kits: [cartoonKit], root: dir});
  for (const t of [1, 12.5, a.total * .7, a.total - .2]) assert.equal(hashAt(a, t), hashAt(b, t), `same pixels at ${t}`);
  assert.ok(a.sounds.some(s => s.type === 'chime'), 'the eureka rings');
  assert.equal(a.sounds.filter(s => s.type === 'tap').length, 4 + 3, 'a pebble in for each of 4 sheep, out for each of the 3 that come home');
  const c = createCanvas(160, 90), x = c.getContext('2d');
  for (let t = 0; t < a.total; t += a.total / 25) { x.resetTransform(); x.scale(.1, .1); a.frame(x, t); assert.equal(x.globalAlpha, 1); const m = x.getTransform(); assert.ok(Math.abs(m.a - .1) < 1e-6 && m.e === 0 && m.f === 0, `transform leaked at ${t}`); }
  // The frame is always covered by the world: no paper shows at the corners, even while the camera pushes in.
  // The paper under the camera is drawn first; if a corner shows it, the world failed to cover the frame.
  const {loadTheme} = await import('../src/theme.mjs'), bg = loadTheme('paper').palette.bg, paperRgb = [1, 3, 5].map(i => parseInt(bg.slice(i, i + 2), 16));
  const full = createCanvas(1600, 900), fx = full.getContext('2d');
  for (const t of [2, 20, a.total * .85]) { a.frame(fx, t); for (const [px, py] of [[1, 1], [1598, 1], [1, 898], [1598, 898]]) { const d = [...fx.getImageData(px, py, 1, 1).data.slice(0, 3)]; assert.ok(d.some((v, i) => Math.abs(v - paperRgb[i]) > 6), `paper showing at ${px},${py} (t=${t})`); } }
});

// The pins were recorded with macOS's fonts (golden.mjs · PINS_HERE).
test('pixel pins: the example films draw exactly the frames recorded in test/golden.json', {skip: PINS_HERE ? false : 'pins are recorded with macOS fonts'}, async () => {
  const {hashFilms} = await import('./golden.mjs');
  const pinned = JSON.parse(readFileSync(fileURLToPath(new URL('./golden.json', import.meta.url)), 'utf8'));
  const now = await hashFilms();
  for (const film of Object.keys(pinned)) {
    const changed = changedFrames(pinned[film], now[film]);
    assert.deepEqual(changed, [], `${film} changed at ${changed.join(', ')} s (re-record with node test/golden.mjs --write only for an intended change)`);
  }
});

test('a recipe with no story refuses, naming what to give: the film\'s first shot is its story world, an empty board is said', async () => {
  const sb = {title: 'No story', scenes: [{id: 'a', narration: 'only a stage after this'}]}, timings = evenTimings(sb);
  const refused = /compileFilm: the recipe has no story, and the film's first shot is its story world: give "story": \{"kit": "whiteboard", "items": \[\]\} for an empty board, or \{"kit": "<your kit>", …\}/;
  for (const recipe of [{}, {stages: []}, {story: null}]) await assert.rejects(compileFilm({storyboard: sb, recipe, timings}), refused, JSON.stringify(recipe));
  await assert.rejects(compileFilm({storyboard: sb, recipe: {story: 'whiteboard'}, timings}), /compileFilm: the recipe's story is the story world, \{"kit": "whiteboard", "items": \[…\]\} or \{"kit": "<your kit>", …\}, not "whiteboard"/);
  await assert.rejects(compileFilm({storyboard: sb, recipe: {story: {kit: 'whiteboard'}}, timings}), /whiteboard: items is the list of what the board draws \(\[\] for an empty board\), not undefined/);
  const empty = await compileFilm({storyboard: sb, recipe: {story: {kit: 'whiteboard', items: []}}, timings});
  assert.ok(empty.total > 0, 'an empty board, said, compiles');
});
