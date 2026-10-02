// Re-render only what changed (segments.mjs): the plan covers every frame once, a segment's key keeps still
// when only an earlier scene moves and changes when its own shot changes, a second render reuses every
// segment, a forced or spot-check-failing segment is drawn again, the joined picture matches one pass, and
// makeFilm runs each segment as its own subflow.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {compileFilm, evenTimings, paceTimings, renderFilm, makeFilm, wholeVideo, cartoonKit} from '../src/index.mjs';
import {planSegments, segmentKey, segmentedVideo, folderStore, codeFingerprint, sampleMoments} from '../src/segments.mjs';

const dir = fileURLToPath(new URL('../examples/worlds/', import.meta.url)), read = f => JSON.parse(readFileSync(dir + f, 'utf8'));
/** The worlds example (four rows: the story, then three worlds by fade, wipe and iris), its first scene `longer` seconds longer. */
async function worlds({longer = 0, recipe = read('recipe.json')} = {}) {
  const storyboard = read('storyboard.json'), timings = paceTimings(storyboard, evenTimings(storyboard, {tail: .8}), read('pacing.json'));
  // A longer first scene (after pacing, which sets each scene's tail): everything after it moves later.
  timings.scenes[0] = {...timings.scenes[0], duration: timings.scenes[0].duration + longer};
  const film = await compileFilm({storyboard, timings, recipe, kits: [cartoonKit], root: dir, strings: read('strings/en.json')});
  return {film, storyboard, timings, recipe};
}
const pixels = {width: 320, height: 180, fps: 10, layout: null, stamp: null, motionBlur: null, poster: null};
const keysOf = ({film, recipe, storyboard}) => planSegments(film, {fps: 10}).map(seg => segmentKey(film, seg, {recipe, storyboard, pixels, code: 'kits', fps: 10}));
const has = cmd => !spawnSync(cmd, ['-version']).error;
const frameCount = file => Number(spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', file], {encoding: 'utf8'}).stdout.trim());
const psnr = (a, b) => { const m = spawnSync('ffmpeg', ['-hide_banner', '-i', a, '-i', b, '-lavfi', 'psnr', '-f', 'null', '-'], {encoding: 'utf8'}).stderr.match(/average:(inf|[\d.]+)/); return !m ? NaN : m[1] === 'inf' ? Infinity : Number(m[1]); };

test('the plan covers every frame once, splits where a picture starts to arrive, and says what an entrance also draws', async () => {
  const {film} = await worlds(), plan = planSegments(film, {fps: 30});
  assert.equal(film.rows.length, 4, 'the worlds example is four rows');
  assert.equal(plan[0].f0, 0);
  plan.forEach((s, i) => { assert.ok(s.f1 > s.f0, `segment ${i} has frames`); if (i) assert.equal(s.f0, plan[i - 1].f1, `segment ${i} starts where ${i - 1} ends`); });
  assert.equal(plan.at(-1).f1, Math.ceil(film.total * 30), 'the last segment ends on the last frame');
  assert.deepEqual(plan.slice(1).map(s => s.f0), film.rows.slice(1).map(r => Math.round(r.from * 30)), 'a segment starts when its entrance starts');
  assert.deepEqual(plan[1].before, ['story'], 'a fade into a world also draws the story');
  assert.ok(plan.every(s => s.scenes.length), 'each segment names the scenes it covers');
  // Short rows join the segment before them.
  const coarse = planSegments(film, {fps: 30, minSeconds: 10});
  assert.ok(coarse.length < plan.length, 'rows under 10 s join their neighbours');
  assert.equal(coarse.at(-1).f1, plan.at(-1).f1); coarse.forEach((s, i) => { if (i) assert.equal(s.f0, coarse[i - 1].f1); });
  assert.deepEqual(sampleMoments({f0: 0, f1: 3}, {fps: 10, count: 6}), [0, .1, .2], 'a short segment samples each of its frames once');
});

test('a segment keeps its key when only an earlier scene grows, and changes when its own shot changes', async () => {
  const a = await worlds(), b = await worlds({longer: 1});
  const ka = keysOf(a), kb = keysOf(b);
  assert.notEqual(ka[0], kb[0], 'the segment with the longer scene changed');
  assert.equal(ka[2], kb[2], 'a later segment, on its own clock, did not');
  assert.equal(ka[3], kb[3]);
  const edited = structuredClone(a.recipe); edited.stages[2].intent = 'A different purpose for the last world.';
  const kc = keysOf(await worlds({recipe: edited}));
  assert.deepEqual([kc[0], kc[1], kc[2]], [ka[0], ka[1], ka[2]], 'the other segments keep their keys');
  assert.notEqual(kc[3], ka[3], 'the edited stage\'s segment changed');
  const film = a.film, seg = planSegments(film, {fps: 10})[1];
  assert.notEqual(segmentKey(film, seg, {recipe: a.recipe, storyboard: a.storyboard, pixels, code: 'kits', fps: 10}), segmentKey(film, seg, {recipe: a.recipe, storyboard: a.storyboard, pixels: {...pixels, stamp: 'DRAFT'}, code: 'kits', fps: 10}), 'a frame setting is part of the key');
  assert.notEqual(segmentKey(film, seg, {recipe: a.recipe, storyboard: a.storyboard, pixels, code: 'kits', fps: 10}), segmentKey(film, seg, {recipe: a.recipe, storyboard: a.storyboard, pixels, code: 'kits-edited', fps: 10}), 'the drawing code is part of the key');
});

test('codeFingerprint hashes the drawing code, and refuses what is not there', () => {
  const kits = fileURLToPath(new URL('../src/kits/', import.meta.url));
  assert.match(codeFingerprint([kits]), /^[0-9a-f]{24}$/);
  assert.equal(codeFingerprint([kits]), codeFingerprint([kits]));
  assert.throws(() => codeFingerprint([]), /give the folders or files/);
  assert.throws(() => codeFingerprint(['/no/such/folder']), /does not exist/);
});

test('segmentedVideo refuses what it cannot cache, naming the fix', async () => {
  assert.throws(() => segmentedVideo({recipe: {}}), /give a store/);
  assert.throws(() => segmentedVideo({store: folderStore('x')}), /give the recipe/);
  assert.throws(() => segmentedVideo({store: folderStore('x'), recipe: {}, parallel: 0}), /parallel is how many segments/);
  const {film, storyboard, timings, recipe} = await worlds(), out = path.join(mkdtempSync(path.join(tmpdir(), 'storyreel-seg-')), 'part.mp4');
  await assert.rejects(renderFilm({film, storyboard, timings, out, width: 320, height: 180, fps: 10, from: 2, to: 8, video: segmentedVideo({store: folderStore(path.join(path.dirname(out), 'cache')), recipe})}), /segments cover the whole film/);
  await assert.rejects(renderFilm({film, storyboard, timings, out, width: 320, height: 180, fps: 10, video: {render() {}}}), /video must be a picture strategy/);
});

test('segments: drawn once, reused next time, drawn again when forced or when the spot check fails; joined they match one pass', {skip: has('ffmpeg') && has('ffprobe') ? false : 'needs ffmpeg and ffprobe'}, async () => {
  const {film, storyboard, timings, recipe} = await worlds(), top = mkdtempSync(path.join(tmpdir(), 'storyreel-seg-')), store = folderStore(path.join(top, 'cache'));
  const render = (name, options = {}) => renderFilm({film, storyboard, timings, out: path.join(top, name, 'film.mp4'), width: 320, height: 180, fps: 10, video: segmentedVideo({store, recipe, code: 'kits', ...options})});
  const first = await render('a');
  assert.deepEqual([first.video.rendered, first.video.reused], [4, 0], 'every segment drawn the first time');
  const again = await render('b');
  assert.deepEqual([again.video.rendered, again.video.reused], [0, 4], 'every segment reused the second time');
  const forced = await render('c', {force: [2]});
  assert.deepEqual(forced.video.segments.map(s => s.status), ['reused', 'reused', 'rendered', 'reused']);
  assert.equal(forced.video.segments[2].why, 'forced');
  // A cached segment whose frames no longer match its key's promise is drawn again.
  const manifest = readdirSync(path.join(top, 'cache')).filter(f => f.endsWith('.json')).map(f => path.join(top, 'cache', f)).find(f => JSON.parse(readFileSync(f, 'utf8')).index === 1);
  const m = JSON.parse(readFileSync(manifest, 'utf8')); m.samples[Object.keys(m.samples)[0]] = '0000000000000000'; writeFileSync(manifest, JSON.stringify(m));
  const checked = await render('d');
  assert.equal(checked.video.segments[1].status, 'rendered'); assert.match(checked.video.segments[1].why, /key missed something/);
  // Joined, the segments are the one-pass picture: as many frames, the same pictures (both are lossy encodes).
  const whole = await renderFilm({film, storyboard, timings, out: path.join(top, 'whole', 'film.mp4'), width: 320, height: 180, fps: 10, video: wholeVideo()});
  assert.equal(frameCount(first.out), frameCount(whole.out), 'the same number of frames');
  const db = psnr(first.out, whole.out);
  assert.ok(db > 35, `the same pictures (PSNR ${db} dB)`);
});

test('makeFilm runs each segment as its own subflow and records which were drawn and which reused', {skip: has('ffmpeg') ? false : 'needs ffmpeg'}, async () => {
  const {film: _f, storyboard, timings, recipe} = await worlds(), top = mkdtempSync(path.join(tmpdir(), 'storyreel-seg-')), store = folderStore(path.join(top, 'cache'));
  const make = name => makeFilm({storyboard, recipe, kits: [cartoonKit], root: dir, strings: read('strings/en.json'), timings, out: path.join(top, name, 'film.mp4'),
    render: {width: 320, height: 180, fps: 10, video: segmentedVideo({store, recipe, code: 'kits'})}});
  await make('a');
  const second = await make('b'), record = JSON.parse(readFileSync(second.makingOf, 'utf8'));
  assert.equal(record.picture.strategy, 'segments');
  assert.deepEqual([record.picture.reused, record.picture.rendered], [4, 0]);
  assert.ok(record.pipeline.filter(e => /picture part/.test(e.text ?? '')).length >= 4, 'each segment is a subflow in the footprintjs narrative');
});
