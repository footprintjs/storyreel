// A starter film from a remake plan (remake-starter.mjs): the plan made into a storyboard and a recipe that render as
// they are — each scene as long as the reference's, each card landing when the reference cuts to its shot, every cut
// showing — with what is still to give and where; under music first, timed by the song. Plans of specs written here;
// and end to end, a film made with FFmpeg planned, made into a starter folder, rendered and broken down again.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdirSync, symlinkSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createCanvas} from '@napi-rs/canvas';
import {remakePlan, remakeStarter, STARTER, breakdown} from '../src/breakdown.mjs';
import {compileFilm, evenTimings} from '../src/index.mjs';
import {beatTimings} from '../src/music.mjs';
import {kineticKit, compileKinetic} from '../src/kits/kinetic/index.mjs';
import {editableJson} from '../src/remake-starter-files.mjs';
import {shot, specOf, quickWords, beatsOf, makeReference, skip} from './remake-specs.mjs';
import {song as clickTrack, wavFile} from './songs.mjs';
import {tempDir} from './tmp.mjs';

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const near = (a, b, within = 1e-6) => Math.abs(a - b) <= within;
const compile = ({storyboard, recipe}, timings = evenTimings(storyboard, {tail: 0})) => compileFilm({storyboard, timings, recipe, kits: [kineticKit]});
/** The worlds of a starter's recipe, in scene order: the story, then each stage's. */
const worldsOf = recipe => [recipe.story, ...recipe.stages.map(s => s.world)];
/** A starter's files written into a new folder whose project imports footprint-storyreel as an installed package: this one. */
function folderOf(files, dir) {
  mkdirSync(path.join(dir, 'node_modules'), {recursive: true});
  symlinkSync(fileURLToPath(new URL('..', import.meta.url)), path.join(dir, 'node_modules', 'footprint-storyreel'), 'dir');
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, name), text);
  return dir;
}
const pixel = (film, t) => { const c = createCanvas(1600, 900), x = c.getContext('2d'); film.frame(x, t); return [...x.getImageData(2, 2, 1, 1).data.slice(0, 3)].join(','); };

// Every kind: four quick words, plain ground, a title, a montage of three, a camera move, a moving picture, one of 25 s
// (two directions), and a 0.15 s picture dissolved to (held 0.2 s, the least a scene lasts).
const spec = specOf([...quickWords(4), shot(2, {blank: true}), shot(1.2, {text: true}), shot(.4), shot(.4), shot(.4), shot(2, {motion: 'camera', camera: 'left'}),
  shot(1.5, {motion: 'inside'}), shot(25, {motion: 'inside'}), shot(.15, {enter: 'dissolve', took: .5})], {flashes: [.5]});

test('each scene is the reference\'s: as long, its cards landing when the reference cuts to each shot, coming in as the plan says', async () => {
  const plan = await remakePlan(spec), starter = remakeStarter(plan);
  assert.deepEqual(plan.scenes.map(x => x.kind), ['kinetic', 'blank', 'title', 'montage', 'camera', 'moving', 'moving', 'still']);
  assert.deepEqual(starter.storyboard.scenes.map(x => [x.id, x.silent]), [
    ['scene-01', [['words land', 1.2]]], ['scene-02', [['plain ground', 2]]], ['scene-03', [['a title', 1.2]]], ['scene-04', [['pictures cut', 1.2]]],
    ['scene-05', [['a camera move', 2]]], ['scene-06', [['a moving picture', 1.5]]], ['scene-07', [['a moving picture', 12.5], ['a moving picture, part 2', 12.5]]],
    ['scene-08', [['a still picture', .2]]]], 'one direction a scene, its seconds the reference\'s (in parts of at most 20 s; never under 0.2 s)');
  const film = await compile(starter);
  plan.scenes.forEach(x => assert.ok(near(film.clock.start(x.id), x.from, 1e-3), `${x.id} starts at ${x.from} s, as in the reference`));
  // Each card lands when the reference cuts to its shot; plain ground has none; a held shot one card.
  const worlds = worldsOf(starter.recipe);
  assert.deepEqual(worlds.map(w => w.words.map(c => c.text)), [['WORD 1', 'WORD 2', 'WORD 3', 'WORD 4'], [], ['TITLE'], ['PICTURE 1', 'PICTURE 2', 'PICTURE 3'], ['CAMERA MOVE'], ['MOVING PICTURE'], ['MOVING PICTURE'], ['PICTURE']]);
  worlds.forEach((w, i) => compileKinetic(w, film.clock).words.forEach((c, k) => assert.ok(near(c.at, plan.scenes[i].starts[k], 1e-3), `${plan.scenes[i].id} card ${k + 1} at ${plan.scenes[i].starts[k]} s`)));
  assert.deepEqual(starter.recipe.stages.map(s => s.enter), plan.scenes.slice(1).map(x => x.enter), 'each stage comes in as the plan says');
  assert.deepEqual(starter.recipe.stages.at(-1).enter, {type: 'fade', seconds: .5});
  assert.equal(starter.recipe.pace, plan.pace.name);
  // Every cut shows: a scene's first ground is never the ground the last one ends on; a picture to come is grey.
  for (let i = 1; i < plan.scenes.length; i++) assert.notEqual(pixel(film, film.clock.start(plan.scenes[i].id) + .02), pixel(film, film.clock.start(plan.scenes[i].id) - .02), `the cut to ${plan.scenes[i].id} shows`);
  assert.deepEqual(worlds.map(w => w.colors.includes(STARTER.pictures[0])), [false, false, false, true, true, true, true, true]);
  assert.deepEqual(worlds.map(w => w.flip === true), [true, false, false, true, false, false, false, false], 'a run swaps ground and ink at each card');
});

test('what is still to give says where it goes; what the starter does not make is said', async () => {
  const plan = await remakePlan(spec), {give, notes} = remakeStarter(plan);
  assert.deepEqual(give.map(g => [g.scene ?? null, g.give, g.place ?? null]), [['scene-01', 'words', 'story.words'], ['scene-03', 'words', 'stages[1].world.words'], ['scene-04', 'pictures', 'stages[2].world.words'],
    ['scene-05', 'pictures', 'stages[3].world.words'], ['scene-06', 'pictures', 'stages[4].world.words'], ['scene-07', 'pictures', 'stages[5].world.words'], ['scene-08', 'pictures', 'stages[6].world.words'],
    [null, 'beats', null], [null, 'timing', null]]);
  assert.equal(give[0].where, 'In recipe.json, its words: in place of "WORD 1" … "WORD 4", each keeping its at (when the reference cuts to its shot)');
  assert.equal(give[2].where, 'Not yet: a film here cannot show a picture file, so its grey cards stand in');
  assert.equal(give[3].what, 'a picture for the camera to move over (it moves left)', 'what a scene needs is the plan\'s own words');
  assert.deepEqual(notes, ['Held 0.2 s, the least a scene lasts here: scene-08 (in the reference, shorter), so every cut after it comes later by the difference',
    'The flash the plan lists is not made: add it as a card of its own if you want it']);
  assert.match(give.at(-1).where, /A voice times it instead: give each scene its narration in place of its directions, then in storyreel\.config\.mjs name the voice's folder \(narrationDir\) and take out timings$/);
});

test('a run of more shots than a kinetic world takes is scenes of its own, cut as the reference cuts: every card kept, numbered through the run', async () => {
  // 45 quick words, then a blank first in a second film: a starter may open on plain ground.
  const plan = await remakePlan(specOf([...quickWords(45), shot(2)])), starter = remakeStarter(plan);
  assert.deepEqual(starter.storyboard.scenes.map(x => [x.id, x.silent]), [['scene-01', [['words land', 6.9]]], ['scene-01-2', [['words land', 6.6]]], ['scene-02', [['a still picture', 2]]]]);
  const [one, two] = worldsOf(starter.recipe);
  assert.deepEqual([one.words.length, one.words[0].text, two.words[0].text, two.words.at(-1).text], [23, 'WORD 1', 'WORD 24', 'WORD 45']);
  assert.equal(starter.recipe.stages[0].enter, 'cut', 'the reference cuts there');
  const film = await compile(starter), lands = [one, two].flatMap(w => compileKinetic(w, film.clock).words.map(c => c.at));
  lands.forEach((at, k) => assert.ok(near(at, plan.scenes[0].starts[k], 1e-3), `card ${k + 1} at ${plan.scenes[0].starts[k]} s`));
  assert.equal(starter.give[0].where, 'In recipe.json, its words (in 2 scenes: scene-01, scene-01-2): in place of "WORD 1" … "WORD 45", each keeping its at (when the reference cuts to its shot)');
  // Under music first: each part enough bars for its cards, the last the rest of the plan's.
  const beat = await remakePlan(specOf([...quickWords(45), shot(2)], {beats: beatsOf({on: 3, of: 4})})), timed = remakeStarter(beat);
  assert.deepEqual([beat.scenes[0].bars, timed.music.bars], [12, {'scene-01': 6, 'scene-01-2': 6, 'scene-02': 1}]);
  // A plan whose own scene has a part's name: refused, naming it.
  assert.throws(() => remakeStarter({...plan, scenes: [plan.scenes[0], {...plan.scenes[1], id: 'scene-01-2'}]}), /scene-01 is split into scenes of at most 40 cards, and the plan already has a scene scene-01-2: rename that one/);
  const blank = remakeStarter(await remakePlan(specOf([shot(2, {blank: true}), shot(2)], {beats: beatsOf({on: 1, of: 1})})));
  assert.deepEqual(blank.recipe.story, {kit: 'kinetic', scene: 'scene-01', words: [], colors: [...STARTER.words]}, 'plain ground first, on no beats');
});

test('under music first the song times it: the plan\'s bars for beatTimings, the cards on the scene\'s beats, every few apart', async () => {
  // 120 BPM: 4 words in 1.2 s are one bar, a word a beat; 9 pictures need three bars; a held shot of 4.2 s two bars.
  const plan = await remakePlan(specOf([...quickWords(4), shot(4.2), ...Array.from({length: 9}, () => shot(.3))], {beats: beatsOf({on: 3, of: 4})}));
  const starter = remakeStarter(plan);
  assert.deepEqual(starter.music, {bars: {'scene-01': 1, 'scene-02': 2, 'scene-03': 3}});
  assert.deepEqual(worldsOf(starter.recipe).map(w => [w.on, w.every, w.words]), [['beats', 1, ['WORD 1', 'WORD 2', 'WORD 3', 'WORD 4']], ['beats', undefined, ['PICTURE']],
    ['beats', 1, Array.from({length: 9}, (_, k) => `PICTURE ${k + 1}`)]]);
  // A song at 120 BPM: a beat every 0.5 s from 1.0 s, a bar every 2 s.
  const song = {sure: true, bpm: 120, beats: Array.from({length: 96}, (_, i) => 1 + i * .5), bars: Array.from({length: 24}, (_, i) => 1 + i * 2)};
  const {timings} = beatTimings(starter.storyboard, song, {bars: starter.music.bars});
  const film = await compile(starter, timings);
  worldsOf(starter.recipe).forEach(w => assert.deepEqual(compileKinetic(w, film.clock).words.map(c => c.at), film.clock.beats(w.scene).slice(0, w.words.length), `${w.scene}: a card a beat`));
  assert.deepEqual(starter.give.filter(g => !g.scene).map(g => g.give), ['song']);
  // Two words held 3 s each are one scene of three bars, a word every six beats: the cards that far apart.
  const slow = remakeStarter(await remakePlan(specOf([shot(3, {text: true}), shot(3, {text: true})], {beats: beatsOf({on: 1, of: 1})}), {thresholds: {quick: 4}}));
  assert.deepEqual([slow.music.bars, slow.recipe.story.every], [{'scene-01': 3}, 6]);
  const spaced = await compile(slow, beatTimings(slow.storyboard, song, {bars: slow.music.bars}).timings);
  assert.deepEqual(compileKinetic(slow.recipe.story, spaced.clock).words.map(c => c.at), [0, 6].map(k => spaced.clock.beats('scene-01')[k]));
  assert.match(starter.files['storyreel.config.mjs'], /const BARS = \{"scene-01": 1, "scene-02": 2, "scene-03": 3\};/);
  assert.match(starter.files['README.md'], /The song times this film: put it at song\.wav here, or add --song <file>/);
});

test('the files: a folder that renders as it is, JSON a person can edit, nothing the breakdown names written into code', async () => {
  const plan = await remakePlan({...spec, file: 'x\n*/ import("node:child_process") // y.mp4'}), starter = remakeStarter(plan, {title: 'Our launch'});
  assert.deepEqual(Object.keys(starter.files), ['storyboard.json', 'recipe.json', 'plan.json', 'storyreel.config.mjs', 'render.mjs', 'README.md']);
  assert.deepEqual(JSON.parse(starter.files['storyboard.json']), starter.storyboard);
  assert.deepEqual(JSON.parse(starter.files['recipe.json']), starter.recipe);
  const kept = JSON.parse(starter.files['plan.json']);
  assert.deepEqual([kept.record, kept.scenes.length], [undefined, plan.scenes.length], 'the plan it was made from, its record left out');
  for (const name of ['storyreel.config.mjs', 'render.mjs']) assert.doesNotMatch(starter.files[name], /child_process|y\.mp4/, `${name} holds no text from the breakdown`);
  assert.match(starter.files['storyreel.config.mjs'], /evenTimings\(storyboard, \{tail: 0\}\)/);
  assert.match(starter.files['recipe.json'], /^ {6}\{"text": "WORD 1", "at": \["scene-01", "words land", 0\]\},$/m, 'a card a line');
  assert.match(starter.files['README.md'], /^# Our launch: a starter film\n/);
  assert.match(starter.files['README.md'], /made this folder from x \*\/ import\("node:child_process"\) \/\/ y\.mp4's breakdown/, 'a name with a line break in it shown on one line');
  assert.equal(remakeStarter(plan).storyboard.title, 'Like x */ import("node:child_process") // y.mp4');
  assert.match(starter.files['README.md'], /^- \*\*scene-04: 3 pictures, one a shot\.\*\* Not yet: a film here cannot show a picture file, so its grey cards stand in\.$/m);
  assert.match(starter.files['README.md'], /^## The plan it was made from\n\nA draft plan from its breakdown: /m);
  assert.equal(editableJson({a: [1, 2], b: 'c'}), '{"a": [1, 2], "b": "c"}');
  assert.equal(editableJson({a: [1, 2]}, '', 8), '{\n  "a": [1, 2]\n}');
});

test('refusals name the fix', async () => {
  const plan = await remakePlan(spec), scene = (i, change) => ({...plan, scenes: plan.scenes.map((x, k) => (k === i ? {...x, ...change} : x))});
  assert.throws(() => remakeStarter(null), /remakeStarter: give remakePlan's plan \(storyreel remake --json, or remakePlan\(spec\)\)/);
  assert.throws(() => remakeStarter({...plan, scenes: []}), /its scenes are a list of one scene or more/);
  assert.throws(() => remakeStarter({...plan, pace: undefined}), /it names its pace, its music and the file it was made from/);
  assert.throws(() => remakeStarter(scene(1, {id: 'scene-01'})), /scenes\[1\] needs an id of its own, letters, digits, - and _ \("scene-01"\), not "scene-01"/);
  assert.throws(() => remakeStarter(scene(0, {id: 'a/b'})), /scenes\[0\] needs an id of its own/);
  assert.throws(() => remakeStarter(scene(2, {kind: 'cartoon'})), /scenes\[2\] \(scene-03\): its kind is one of kinetic, montage, blank, title, still, camera, moving, not "cartoon"/);
  assert.throws(() => remakeStarter(scene(0, {starts: undefined})), /its shots and when each starts \(starts\) are lists of one length — make the plan again \(storyreel remake\)/);
  assert.throws(() => remakeStarter(scene(0, {starts: [0, .3, .2, .9]})), /starts\[2\] is when its shot starts, in order, inside the scene \(0–1\.2 s\), not 0\.2/);
  assert.throws(() => remakeStarter(scene(0, {to: 0})), /from, to and seconds are its time in the reference, from before to/);
  assert.throws(() => remakeStarter({...plan, music: {verdict: 'music-first'}}), /scenes\[0\] \(scene-01\): the song times this film, so each scene has its bars, a whole number 1–64, not undefined/);
  assert.throws(() => remakeStarter(plan, {title: ' '}), /title is the film's, some words, not " "/);
  assert.throws(() => remakeStarter(scene(0, {seconds: .5})), /scenes\[0\] \(scene-01\): from, to and seconds are its time in the reference, from before to, seconds the time between/);
  assert.throws(() => remakeStarter(scene(0, {id: '__proto__'})), /scenes\[0\] needs an id of its own/);
  for (const todo of ['words', [null], [{give: 'constructor', what: 'x'}], [{give: 'words', what: 3}]]) assert.throws(() => remakeStarter({...plan, todo}), /its todo is a list of \{scene\?, give, what\}, each give one of words, pictures, split, song, tempo, beats, timing/);
});

test('end to end: a film broken down, planned and made into a starter folder that renders as it is — every cut of the reference a cut of the starter', {skip}, async () => {
  const dir = tempDir('remake-starter'), out = path.join(dir, 'reference-breakdown'), folder = path.join(dir, 'like-it');
  const {spec: ref} = await breakdown(makeReference(dir), {out});
  const made = spawnSync(process.execPath, [cli, 'remake', out, '--starter', folder], {encoding: 'utf8'});
  assert.equal(made.status, 0, made.stderr);
  assert.match(made.stdout, /## A starter film, in .*like-it\n\nstoryboard\.json, recipe\.json, plan\.json, storyreel\.config\.mjs, render\.mjs, README\.md: it renders as it is/);
  folderOf({}, folder);
  const render = spawnSync(process.execPath, [path.join(folder, 'render.mjs')], {encoding: 'utf8', cwd: dir});
  assert.equal(render.status, 0, render.stderr);
  const {spec: again} = await breakdown(path.join(folder, 'out', 'film.mp4'), {out: path.join(dir, 'starter-breakdown')});
  const cuts = [...again.shots.map(x => x.start), ...again.flashes.map(f => f.at)];
  for (const x of ref.shots.slice(1)) assert.ok(cuts.some(t => near(t, x.start, .05)), `the reference cuts at ${x.start} s; the starter cuts at ${cuts.join(', ')}`);
  // The review tools read the folder as a project: when each scene starts, in it.
  const timeline = spawnSync(process.execPath, [cli, 'timeline'], {encoding: 'utf8', cwd: folder});
  assert.equal(timeline.status, 0, timeline.stderr);
  assert.match(timeline.stdout, /── scene-02/);
  // Made again into the same folder: refused, nothing replaced.
  const before = readFileSync(path.join(folder, 'recipe.json'), 'utf8');
  writeFileSync(path.join(folder, 'recipe.json'), `${before} `);
  const twice = spawnSync(process.execPath, [cli, 'remake', out, '--starter', folder], {encoding: 'utf8'});
  assert.equal(twice.status, 2);
  assert.match(twice.stderr, /already has storyboard\.json, recipe\.json, plan\.json, storyreel\.config\.mjs, render\.mjs, README\.md: name a new folder for the starter \(a file there is never replaced\)/);
  assert.equal(readFileSync(path.join(folder, 'recipe.json'), 'utf8'), `${before} `);
  const file = spawnSync(process.execPath, [cli, 'remake', out, '--starter', path.join(folder, 'README.md')], {encoding: 'utf8'});
  assert.equal(file.status, 2);
  assert.match(file.stderr, /README\.md is a file: name a folder for the starter/);
  const json = spawnSync(process.execPath, [cli, 'remake', out, '--json', '--starter', path.join(dir, 'as-data')], {encoding: 'utf8'});
  assert.equal(json.status, 0, json.stderr);
  const data = JSON.parse(json.stdout);
  assert.deepEqual([data.record, data.starter.files.length, data.starter.give.map(g => g.give)], [undefined, 6, ['words', 'pictures', 'timing']]);
  const none = spawnSync(process.execPath, [cli, 'remake', out, '--starter'], {encoding: 'utf8'});
  assert.equal(none.status, 2);
  assert.match(none.stderr, /--starter needs the folder to make the starter film in \(e\.g\. --starter work\/like-it\)/);
});

test('end to end, music first: the folder maps its song, times each scene in whole bars and renders with the song under it', {skip}, async () => {
  const plan = await remakePlan(specOf([...quickWords(4), shot(4.2), ...Array.from({length: 9}, () => shot(.3))], {beats: beatsOf({on: 3, of: 4})}));
  const folder = folderOf(remakeStarter(plan).files, path.join(tempDir('remake-music'), 'like-it'));
  // A click track's tempo is unsure between 120 and its half: its tempo given (--bpm), as the README says.
  const timeline = () => spawnSync(process.execPath, [cli, 'timeline', '--bpm', '120'], {encoding: 'utf8', cwd: folder});
  const silent = timeline();
  assert.notEqual(silent.status, 0, silent.stdout);
  assert.match(silent.stderr, /the song times this film: put it at .*song\.wav, or name it \(--song <file>\)/);
  const click = clickTrack({bpm: 120, count: 40, one: 0});
  wavFile(path.join(folder, 'song.wav'), click.samples, click.rate);
  const timed = timeline();
  assert.equal(timed.status, 0, timed.stderr);
  // 1 + 2 + 3 bars at 120 BPM: the scenes start 2 s and 6 s after the first, the film lasts 12 s.
  assert.match(timed.stdout, /^the whole film: 0\.00–12\.00 s of 12\.00 s/);
  assert.match(timed.stdout, /^2\.00 +── scene-02$/m);
  assert.match(timed.stdout, /^6\.00 +── scene-03$/m);
  const render = spawnSync(process.execPath, [path.join(folder, 'render.mjs'), '--bpm', '120'], {encoding: 'utf8'});
  assert.equal(render.status, 0, render.stderr);
  const streams = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', path.join(folder, 'out', 'film.mp4')], {encoding: 'utf8'});
  assert.deepEqual(streams.stdout.trim().split('\n').sort(), ['audio', 'video'], 'the song is under it');
});
