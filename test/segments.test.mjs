// Re-render only what changed (segments.mjs): the plan covers every frame once, a segment's key keeps still
// when only an earlier scene moves and changes when its own shot changes, a second render reuses every
// segment, a forced or spot-check-failing segment is drawn again, the joined picture matches one pass, and
// makeFilm runs each segment as its own subflow.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, readdirSync, cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {compileFilm, evenTimings, paceTimings, renderFilm, makeFilm, wholeVideo, cartoonKit} from '../src/index.mjs';
import {planSegments, segmentKey, segmentedVideo, folderStore, codeFingerprint, sampleOffsets} from '../src/segments.mjs';

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
  assert.deepEqual(plan.slice(1).map(s => s.f0), film.rows.slice(1).map(r => Math.ceil(r.from * 30 - 1e-6)), 'a segment starts on the first frame at or after its entrance starts');
  assert.deepEqual(plan[1].before, ['story'], 'a fade into a world also draws the story');
  assert.ok(plan.every(s => s.scenes.length), 'each segment names the scenes it covers');
  // Short rows join the segment before them.
  const coarse = planSegments(film, {fps: 30, minSeconds: 10});
  assert.ok(coarse.length < plan.length, 'rows under 10 s join their neighbours');
  assert.equal(coarse.at(-1).f1, plan.at(-1).f1); coarse.forEach((s, i) => { if (i) assert.equal(s.f0, coarse[i - 1].f1); });
  assert.deepEqual(sampleOffsets({f0: 30, f1: 33}, 6), [0, 1, 2], 'a short segment samples each of its frames once, by its place in the segment');
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

// Review 2026-10-02: what a key must hold, a plan with no overlap, a check that sees what the video shows.
test('a long entrance that starts before the row ahead of it: segments still cover every frame once, in order', async () => {
  const {film} = await worlds(), rows = film.rows.map((r, j) => (j === 2 ? {...r, from: film.rows[1].from - 1} : r));
  const plan = planSegments({...film, rows}, {fps: 10, minSeconds: .1});
  assert.equal(plan[0].f0, 0); plan.forEach((s, i) => { assert.ok(s.f1 > s.f0); if (i) assert.equal(s.f0, plan[i - 1].f1); });
  assert.equal(plan.at(-1).f1, Math.ceil(film.total * 10));
  assert.ok(plan.some(s => s.paths.includes(film.rows[1].paths[0]) || s.before?.includes(film.rows[1].paths[0])), 'the row it took over from is drawn by a segment');
  const blurred = planSegments(film, {fps: 10, blur: true});
  assert.ok(blurred.slice(1).every(s => s.before), 'with motion blur, a segment starting at a cut draws the row before it too');
});

test('a key holds what reaches its frames: the guess card over it, the strings, every file the film read', async () => {
  const a = await worlds(), ka = keysOf(a), guessed = planSegments(a.film, {fps: 10}).findIndex(s => s.from < a.film.overlays[0].to && s.to > a.film.overlays[0].from);
  const answer = structuredClone(a.recipe); answer.guesses[0].answer = 'Four sheep.';
  const kb = keysOf(await worlds({recipe: answer}));
  assert.notEqual(kb[guessed], ka[guessed], 'the guess card\'s answer is in the key of the segment it is drawn over');
  assert.equal(kb.filter((k, i) => k !== ka[i]).length, 1, 'and only there');
  const storyboard = read('storyboard.json'), timings = paceTimings(storyboard, evenTimings(storyboard, {tail: .8}), read('pacing.json'));
  const withStrings = async strings => compileFilm({storyboard, timings, recipe: a.recipe, kits: [cartoonKit], root: dir, strings});
  const reworded = await withStrings({...read('strings/en.json'), 'valley.caption': 'They all came back.'});
  assert.notDeepEqual(keysOf({film: reworded, recipe: a.recipe, storyboard}), ka, 'a string\'s text is in the keys');
  const copy = mkdtempSync(path.join(tmpdir(), 'storyreel-files-')); cpSync(dir, copy, {recursive: true});
  writeFileSync(path.join(copy, 'count.ts'), readFileSync(path.join(copy, 'count.ts'), 'utf8') + '\n// one more line\n');
  const edited = await compileFilm({storyboard, timings, recipe: a.recipe, kits: [cartoonKit], root: copy, strings: read('strings/en.json')});
  assert.deepEqual(Object.keys(edited.inputs.files), ['count.ts']);
  assert.notDeepEqual(keysOf({film: edited, recipe: a.recipe, storyboard}), ka, 'a code file the film shows is in the keys');
});

test('the default joiner runs the render\'s own FFmpeg, and an FFmpeg that cannot start is a refusal, not a crash', async () => {
  const {film, storyboard, timings, recipe} = await worlds(), top = mkdtempSync(path.join(tmpdir(), 'storyreel-seg-'));
  assert.throws(() => segmentedVideo({store: folderStore(top), recipe}).join({dir: top, ffmpeg: 'no-such-ffmpeg-here'}, [{file: 'a.mp4'}]), /no-such-ffmpeg-here/);
  await assert.rejects(renderFilm({film, storyboard, timings, out: path.join(top, 'x', 'film.mp4'), width: 160, height: 90, fps: 5, ffmpeg: '/no/such/ffmpeg'}), /could not encode film-video.mp4/);
});

test('segments: a moved segment is reused only when its frames did not move with the clock; a file cut short is drawn again', {skip: has('ffmpeg') && has('ffprobe') ? false : 'needs ffmpeg and ffprobe'}, async () => {
  const top = mkdtempSync(path.join(tmpdir(), 'storyreel-seg-')), store = folderStore(path.join(top, 'cache'));
  const render = async (name, made) => renderFilm({film: made.film, storyboard: made.storyboard, timings: made.timings, out: path.join(top, name, 'film.mp4'), width: 320, height: 180, fps: 10, video: segmentedVideo({store, recipe: made.recipe, code: 'kits'})});
  await render('a', await worlds());
  // The first scene one second longer (ten whole frames): every later segment moves.
  const moved = await render('b', await worlds({longer: 1}));
  // Segment 1 holds the grown scene's words (its key changed); 2 and 3 kept their keys and moved.
  const [, , wipe, iris] = moved.video.segments;
  assert.equal(wipe.status, 'rendered'); assert.match(wipe.why, /it moved, and its frames moved with the film's clock/, 'the wipe draws the cartoon, whose clouds drift on the film clock');
  assert.equal(iris.status, 'reused', 'the iris into the whiteboard does not: moved, it is the same picture');
  // A cached file cut short (a copy that failed half way) is never reused.
  const file = path.join(top, 'cache', `${iris.key}.mp4`);
  writeFileSync(file, readFileSync(file).subarray(0, 1000));
  const again = await render('c', await worlds({longer: 1}));
  assert.equal(again.video.segments.find(s => s.key === iris.key).status, 'rendered', 'the cut-short segment is drawn again');
});

test('a pushIn film\'s one segment holds its push-in and card; a teaser\'s segment holds every row it rewinds through', async () => {
  const {compileExample} = await import('./golden.mjs'), example = n => JSON.parse(readFileSync(fileURLToPath(new URL(`../examples/${n}/recipe.json`, import.meta.url)), 'utf8'));
  const key = async (name, recipe) => { const film = await compileExample(name, {recipe}); return planSegments(film, {fps: 10}).map(seg => segmentKey(film, seg, {recipe, pixels, code: 'kits', fps: 10})); };
  const hello = example('hello'), caption = structuredClone(hello); caption.pushIn.caption = 'A different caption.';
  assert.notDeepEqual(await key('hello', caption), await key('hello', hello), 'the push-in\'s caption is in the key');
  const recap = example('recap'), story = structuredClone(recap), item = story.story.items.findIndex(i => i.dur !== undefined);
  story.story.items[item].dur += .2;
  const [was, now] = [await key('recap', recap), await key('recap', story)];
  assert.notEqual(now.at(-1), was.at(-1), 'the teaser rewinds through the story, so its segment changes with it');
  const {wholeVideo: fromSegments} = await import('../src/segments.mjs');
  assert.equal(typeof fromSegments, 'function', 'wholeVideo is on the segments subpath, as its types say');
});

test('a segment begins on the first frame that shows its row, and a teaser\'s segment holds the moments it replays', async () => {
  const {compileExample} = await import('./golden.mjs'), example = n => JSON.parse(readFileSync(fileURLToPath(new URL(`../examples/${n}/recipe.json`, import.meta.url)), 'utf8'));
  const recap = await compileExample('recap'), plan = planSegments(recap, {fps: 10});
  for (const [i, s] of plan.entries()) if (i) assert.ok(s.f0 / 10 >= recap.rows.find(r => r.paths.some(p => s.paths.includes(p)))?.from - 1e-6 || s.before, `segment ${i} does not start before its row`);
  const teasing = plan.find(s => s.rewinds);
  assert.ok(teasing, 'the recap film\'s last segment replays earlier moments');
  const offsets = sampleOffsets(teasing, 6, 10), {at, until} = teasing.rewinds;
  assert.ok(offsets.some(o => (teasing.f0 + o) / 10 >= at && (teasing.f0 + o) / 10 <= until), 'and is spot-checked inside the rewind');
  // A guess over the story: replayed by the rewind, so in the teaser segment's key.
  const recipe = example('recap'), story = (await compileExample('recap')).clock;
  const key = async r => { const f = await compileExample('recap', {recipe: r}); return planSegments(f, {fps: 10}).map(seg => segmentKey(f, seg, {recipe: r, pixels, code: 'kits', fps: 10})).at(-1); };
  const sceneOne = JSON.parse(readFileSync(fileURLToPath(new URL('../examples/recap/storyboard.json', import.meta.url)), 'utf8')).scenes[0].id;
  assert.ok(story.start(sceneOne) >= 0);
  const before = await key(recipe), withNote = structuredClone(recipe);
  withNote.notes = [...(recipe.notes ?? []), {note: 'push in on the board', push: {at: [800, 450], zoom: 1.2, from: [sceneOne, recap.clock.words(sceneOne)[0].text], to: [sceneOne, recap.clock.words(sceneOne).at(-1).text]}}];
  assert.notEqual(await key(withNote), before, 'a push the rewind replays is in its key');
});
