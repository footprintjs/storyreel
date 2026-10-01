// Silent scenes (clock.mjs · directionTimings): a storyboard scene with directions in place of narration.
// The clock treats a direction like a spoken phrase; the voice never says it; pacing refuses a hold after
// one but keeps the scene's tail; a voiced cut gets generated silence for it (pacing.mjs · applyPacing,
// render.mjs · joinVoice); the studio marks its words as not spoken.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, existsSync, copyFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileFilm, evenTimings, paceTimings, applyPacing, validatePacing, makeClock, makeFilm, renderFilm, directionTimings, withDirections, sceneText} from '../src/index.mjs';
import {planHolds} from '../src/pacing.mjs';
import {checkScene} from '../src/clock.mjs';
import {startStudio} from '../src/studio/server.mjs';

const hello = fileURLToPath(new URL('../examples/hello/', import.meta.url));
const read = f => JSON.parse(readFileSync(hello + f, 'utf8'));
const ffmpeg = spawnSync(process.env.FFMPEG_BIN || 'ffmpeg', ['-version']).status === 0;
const tmp = () => mkdtempSync(path.join(tmpdir(), 'storyreel-silent-'));
const small = {width: 160, height: 90, fps: 4};

// The hello film with a silent opening: the gate creaks, then the shepherd walks out (4 s, never spoken).
const open = {id: 'open', title: 'Morning', silent: [['the gate creaks open', 1.0], ['a shepherd walks out with his flock', 3.0]]};
const storyboard = {...read('storyboard.json'), scenes: [open, ...read('storyboard.json').scenes]};
const helloRecipe = read('recipe.json');
const recipe = {...helloRecipe, story: {...helloRecipe.story, items: [
  {at: ['open', 'a shepherd walks out'], dur: 1.0, draw: [['figure', 200, 620, 1]], seed: 9},
  ...helloRecipe.story.items]}};
const pacing = {voiceSpeed: 1, sceneTail: .8, holds: [{scene: 'story', after: 'came home', seconds: 1}], tails: {open: 1.2, story: 4}};

test('directionTimings: each direction\'s words spread evenly over its seconds; the duration is their sum plus the tail', () => {
  const t = directionTimings(open, {tail: .5});
  assert.deepEqual(t.alignment, {status: 'available', method: 'directions'});
  assert.equal(t.duration, 4.5);
  assert.deepEqual(t.words.slice(0, 4).map(w => [w.text, w.start, w.end]), [['the', 0, .25], ['gate', .25, .5], ['creaks', .5, .75], ['open', .75, 1]]);
  assert.deepEqual([t.words[4].start, t.words.at(-1).end], [1, 4], 'the second direction starts where the first ends');
  assert.equal(directionTimings(open).duration, 4, 'no tail unless asked');
  assert.equal(sceneText(open), 'the gate creaks open a shepherd walks out with his flock');
  assert.throws(() => directionTimings(storyboard.scenes[1]), /directionTimings takes a silent scene; story has narration/);
  assert.throws(() => directionTimings(open, {tail: -1}), /tail must be seconds, 0 or more/);
});

test('a recipe beat on a direction resolves to the direction\'s time, with plus, edge and nth as usual', async () => {
  const timings = evenTimings(storyboard, {tail: 4}), clock = makeClock(storyboard, timings);
  assert.equal(timings.scenes[0].duration, 8, 'evenTimings keeps the directions\' own seconds, with its tail');
  assert.equal(clock.at(['open', 'the gate creaks open']), 0);
  assert.equal(clock.at(['open', 'a shepherd walks out', .5]), 1.5);
  assert.equal(clock.at({scene: 'open', phrase: 'the gate creaks open', edge: 'end'}), 1);
  assert.equal(clock.at({scene: 'open', phrase: 'with his flock', edge: 'end'}), 4);
  assert.equal(clock.start('story'), 8, 'the spoken scene starts after the silent one and its tail');
  assert.throws(() => clock.at(['open', 'the door opens']), /Phrase not in open: "the door opens"/);
  const film = await compileFilm({storyboard, timings, recipe, root: hello});
  const beat = film.beats.find(b => Array.isArray(b.ref) && b.ref[0] === 'open');
  assert.deepEqual({t: beat.t, path: beat.path}, {t: 1, path: 'story.items[0].at'});
});

test('a scene is spoken or silent: mixing narration and directions, or a malformed direction, refuses with the fix', () => {
  const board = scene => ({scenes: [scene]});
  const refuses = (scene, why) => {
    assert.throws(() => checkScene(scene), why);
    assert.throws(() => evenTimings(board(scene)), why);
    assert.throws(() => makeClock(board(scene), {scenes: [{id: scene.id, duration: 1, words: [], alignment: {status: 'available'}}]}), why);
  };
  refuses({...open, narration: 'The gate creaks open.'}, /scene open has both narration and silent: a scene is spoken or silent, not both .*move the directions into a silent scene of their own/);
  refuses({id: 'open', title: 'Morning'}, /scene open has no narration and no silent: give "narration": "what is said", or "silent": \[\["the door opens", 1\.0\]/);
  refuses({id: 'open', silent: []}, /open: silent must list its directions/);
  refuses({id: 'open', silent: 'the gate creaks open'}, /open: silent must list its directions/);
  refuses({id: 'open', silent: [{text: 'the gate creaks open', seconds: 1}]}, /open: silent\[0\] must be \[text, seconds\], e\.g\. \["the door opens", 1\.0\]/);
  refuses({id: 'open', silent: [['the gate creaks open', 1, 'slowly']]}, /silent\[0\] must be \[text, seconds\]/);
  refuses({id: 'open', silent: [['…', 1]]}, /silent\[0\] must start with the direction's words/);
  refuses({id: 'open', silent: [['the gate creaks open', .1]]}, /silent\[0\] "the gate creaks open" must last 0\.2\.\.20 seconds, not 0\.1/);
  refuses({id: 'open', silent: [['the gate creaks open', 21]]}, /must last 0\.2\.\.20 seconds, not 21/);
  refuses({id: 'open', silent: [['the gate creaks open', '1']]}, /must last 0\.2\.\.20 seconds, not "1"/);
  assert.equal(checkScene(open), 'silent'); assert.equal(checkScene(storyboard.scenes[1]), 'spoken');
});

test('a hold after a direction refuses, naming the scene; the silent scene\'s tail still applies', () => {
  const hold = {sceneTail: .8, holds: [{scene: 'open', after: 'the gate creaks open', seconds: 1}]};
  const why = /pacing holds\[0\]: scene open is silent, and a hold cannot follow a direction \("the gate creaks open"\); lengthen that direction's seconds/;
  assert.throws(() => validatePacing({voiceSpeed: 1, ...hold}, storyboard), why);
  assert.throws(() => paceTimings(storyboard, evenTimings(storyboard), hold), why);
  assert.throws(() => planHolds(open, directionTimings(open), hold.holds, {rate: 24000, samples: new Int16Array(96000)}), /scene open is silent, and a hold cannot follow a direction/);
  const paced = paceTimings(storyboard, evenTimings(storyboard), pacing);
  assert.equal(paced.scenes[0].duration, 5.2, 'the directions\' 4 s, then pacing.tails.open');
  assert.match(paced.scenes[0].pacing.method, /^silent scene: the directions' seconds, then the tail/);
  assert.equal(paced.scenes[1].pacing.holds.length, 1, 'a spoken scene still takes its holds');
});

test('withDirections: a voice that knows only the spoken scenes is completed; a missing spoken scene refuses', () => {
  const spoken = evenTimings({scenes: storyboard.scenes.slice(1)});
  const full = withDirections(storyboard, spoken);
  assert.deepEqual(full.scenes.map(s => s.id), ['open', 'story', 'rule']);
  assert.equal(full.scenes[0].alignment.method, 'directions');
  assert.equal(spoken.scenes.length, 2, 'the given timings are untouched');
  assert.throws(() => withDirections(storyboard, {scenes: spoken.scenes.slice(1)}), /Timing 0 is rule, expected story \(only a silent scene may be left out/);
  assert.throws(() => withDirections(storyboard, {scenes: [...spoken.scenes, {id: 'extra'}]}), /scene\(s\) the storyboard does not: extra/);
  assert.throws(() => makeClock(storyboard, spoken), /count mismatch \(a voice that leaves out the silent scenes: fill them with withDirections/);
});

/** A PCM16 mono WAV: a soft tone of `seconds` at `rate` (a stand-in for a voice). */
function toneWav(seconds, rate = 24000) {
  const n = Math.round(seconds * rate), body = Buffer.alloc(n * 2), header = Buffer.alloc(44);
  for (let i = 0; i < n; i++) body.writeInt16LE(Math.round(3000 * Math.sin(2 * Math.PI * 220 * i / rate)), i * 2);
  header.write('RIFF', 0, 'ascii'); header.writeUInt32LE(36 + body.length, 4); header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii'); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii'); header.writeUInt32LE(body.length, 40);
  return Buffer.concat([header, body]);
}
/** A fake voice folder: audio and timings for the SPOKEN scenes only (a voice never says a direction). */
function voiceFolder() {
  const dir = tmp(), spoken = evenTimings({scenes: storyboard.scenes.filter(s => !s.silent)}, {tail: 4});
  spoken.scenes.forEach((s, i) => { s.audio = `scene-${i}.wav`; writeFileSync(path.join(dir, s.audio), toneWav(s.duration)); });
  writeFileSync(path.join(dir, 'timings.json'), JSON.stringify(spoken));
  return dir;
}
const samplesOf = buffer => { const data = buffer.subarray(44); return Array.from({length: data.length / 2}, (_, i) => data.readInt16LE(i * 2)); };

test('a voiced cut with a silent opening: pacing writes generated silence of the right length at the voice\'s rate, and the film compiles', async () => {
  const dir = voiceFolder(), timings = JSON.parse(readFileSync(path.join(dir, 'timings.json'), 'utf8'));
  const paced = await applyPacing({runDir: dir, board: storyboard, timings, pacing});
  assert.deepEqual(paced.scenes.map(s => s.id), ['open', 'story', 'rule']);
  const opening = paced.scenes[0], wav = readFileSync(path.join(dir, opening.audio));
  assert.equal(opening.audio, 'silent-open.wav');
  assert.equal(wav.readUInt32LE(24), 24000, 'the silence is at the voice\'s rate, so the scenes join');
  assert.ok(samplesOf(wav).every(v => v === 0), 'a direction is never spoken: its audio is silence');
  assert.equal(opening.duration, 5.2, 'the directions\' 4 s, then pacing.tails.open');
  assert.match(opening.pacing.method, /generated silence/);
  assert.ok(existsSync(path.join(dir, 'silent-open.unpaced.wav')), 'the unpaced silence is kept beside it, like any scene');
  await assert.rejects(applyPacing({runDir: dir, board: storyboard, timings: paced, pacing}), /Pacing already applied to open/);
  const film = await compileFilm({storyboard, timings: paced, recipe, root: hello});
  assert.equal(film.clock.at(['open', 'a shepherd walks out']), 1);
  assert.equal(film.clock.start('story'), 5.2);
});

test('the studio marks a direction\'s words as not spoken', async () => {
  const film = await compileFilm({storyboard, timings: evenTimings(storyboard, {tail: 4}), recipe, root: hello});
  const studio = await startStudio({load: async () => ({film, storyboard, recipe}), port: 0, log: () => {}});
  try {
    const json = await (await fetch(studio.url + 'api/film')).json();
    assert.deepEqual(json.scenes[0].silent, open.silent);
    assert.ok(json.scenes[0].words.length && json.scenes[0].words.every(w => w.spoken === false));
    assert.ok(json.scenes[1].words.every(w => w.spoken === true));
    const page = await (await fetch(studio.url + 'studio.js')).text(), css = await (await fetch(studio.url + 'studio.css')).text();
    assert.match(page, /w\.spoken === false/); assert.match(css, /span\[data-direction\] \{ font-style: italic/);
  } finally { await studio.close(); }
});

test('a silent cut with a silent opening renders (evenTimings + paceTimings)', {skip: ffmpeg ? false : 'ffmpeg not on PATH'}, async () => {
  const out = path.join(tmp(), 'silent.mp4');
  const result = await makeFilm({storyboard, recipe, root: hello, timings: evenTimings(storyboard), pacing, out, render: small});
  const record = JSON.parse(readFileSync(result.makingOf, 'utf8'));
  assert.ok(existsSync(result.out));
  assert.equal(record.pacing.silent, true);
  assert.equal(result.chapters[0], '0:00 Morning');
  assert.ok(record.beats.some(b => b.said.scene === 'open' && b.at === 1 && b.entry === 'story.items[0].at'));
});

test('a voiced cut with a silent opening renders: paced (generated silence in the voice folder) and unpaced (generated in the render)', {skip: ffmpeg ? false : 'ffmpeg not on PATH'}, async () => {
  const voice = voiceFolder();
  const result = await makeFilm({storyboard, recipe, root: hello, narrationDir: voice, pacing, out: path.join(tmp(), 'voiced.mp4'), render: small});
  const record = JSON.parse(readFileSync(result.makingOf, 'utf8'));
  assert.equal(record.pacing.scenes[0].scene, 'open'); assert.equal(record.pacing.scenes[0].after, 5.2);
  assert.equal(result.loudness.type, 'linear', 'the voice is measured and set; the silent opening stays quiet');
  // No pacing: the voice's timings lack the opening, and the render joins generated silence before the voice.
  const unpaced = voiceFolder(), timings = withDirections(storyboard, JSON.parse(readFileSync(path.join(unpaced, 'timings.json'), 'utf8')));
  const film = await compileFilm({storyboard, timings, recipe, root: hello}), dir = tmp();
  const rendered = await renderFilm({film, storyboard, timings, narrationDir: unpaced, out: path.join(dir, 'unpaced.mp4'), ...small, from: 0, to: 6});
  assert.equal(rendered.seconds, 6);
  assert.ok(existsSync(path.join(dir, 'film-voice-0.wav')), 'the opening\'s silence is generated in the render folder');
  assert.ok(!existsSync(path.join(unpaced, 'silent-open.wav')), 'the render never writes into the voice folder');
  // A spoken scene with no audio is not silence: it refuses.
  const missing = {...timings, scenes: timings.scenes.map((s, i) => i === 1 ? {...s, audio: undefined} : s)};
  await assert.rejects(renderFilm({film, storyboard, timings: missing, narrationDir: unpaced, out: path.join(tmp(), 'x.mp4'), ...small, from: 0, to: 1}), /scene story has no audio in its timing: only a silent scene's audio is generated/);
});
