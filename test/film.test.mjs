import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, mkdtempSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCanvas} from '@napi-rs/canvas';
import {compileFilm, evenTimings, makeFilm, changedFrames} from '../src/index.mjs';
import {PINS_HERE} from './golden.mjs';

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
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'storyreel-')), 'hello.mp4');
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
