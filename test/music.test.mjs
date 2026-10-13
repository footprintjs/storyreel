// Music under a film (music.mjs): scene starts moved onto the song's beats within a tolerance — never by more, never
// past a spoken word — the song started so its drop lands on a key moment, sound effects placed by their peaks, and
// makeFilm running it all as stages of its own. Every cut's verdict is decide() evidence in the fit's record. Without
// the option nothing changes (pinned by hand against main: the same MP4 bytes, silent and voiced).
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {evenTimings, makeClock, makeFilm} from '../src/index.mjs';
import {fitToMusic, fitVoice, readMusic, readSongPlacement, MUSIC} from '../src/music.mjs';
import {createMotionSound, resolveSoundEvents, soundPeak} from '../src/sound.mjs';
import {peakOfSamples} from '../src/beats.mjs';
import {musicUnderVoice} from '../src/listening.mjs';
import {song, wavFile} from './songs.mjs';

const ffmpegBin = process.env.FFMPEG_BIN || 'ffmpeg';
const ffmpeg = spawnSync(ffmpegBin, ['-version']).status === 0;
const needs = {skip: ffmpeg ? false : 'ffmpeg not on PATH'};
const tmp = () => mkdtempSync(path.join(tmpdir(), 'storyreel-music-'));

const board = {scenes: [
  {id: 'one', narration: 'A shepherd kept his sheep on the hill.'},
  {id: 'two', narration: 'Each morning they went out to the grass.'},
  {id: 'three', narration: 'Each evening they came home again.'},
  {id: 'four', narration: 'And he counted every one of them.'}]};
const grid = (period, count = 200, from = 0) => Array.from({length: count}, (_, k) => +(from + k * period).toFixed(6));
/** The beat (in an ascending list) nearest t. */
const nearest = (beats, t) => beats.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a));
const lastWord = timing => timing.words.at(-1).end;
const verdicts = record => record.filter(e => e.type === 'condition').map(e => e.text);

test('each scene start moves onto the nearest beat, never by more than the tolerance; the words keep their places', async () => {
  const timings = evenTimings(board, {tail: 1}), beats = {beats: grid(.5), drop: null};
  const fit = await fitToMusic({storyboard: board, timings, beats, snap: {tolerance: .3}});
  const clock = makeClock(board, fit.timings);
  assert.equal(fit.start, 0, 'without a key moment the song starts with the film');
  for (const [i, cut] of fit.cuts.entries()) {
    assert.equal(cut.scene, board.scenes[i + 1].id);
    assert.ok(['moved', 'on-beat'].includes(cut.verdict), cut.why);
    assert.ok(Math.abs(cut.by) <= .3 + 1e-9, `${cut.scene} moved ${cut.by}`);
    assert.ok(Math.abs(clock.offsets[i + 1] - nearest(beats.beats, clock.offsets[i + 1])) < 1e-4, `${cut.scene} starts on a beat`);
    assert.equal(cut.at, +clock.offsets[i + 1].toFixed(4));
  }
  fit.timings.scenes.forEach((t, i) => {
    assert.deepEqual(t.words, timings.scenes[i].words, 'only the scenes\' lengths change');
    assert.ok(t.duration >= lastWord(t) + MUSIC.clear - 1e-9, `${t.id} keeps its last word and the silence after it`);
  });
  const lines = verdicts(fit.record);
  assert.match(lines[0], /The song starts with the film.*with-film/);
  assert.match(lines[1], /A beat within the tolerance, and the move cuts no word": keepWords=\d.*chose move/);
  assert.match(lines.at(-1), /Every cut is fitted.*done/);
  assert.equal(fit.record.filter(e => e.type === 'loop').length, 3, 'one pass of the loop per cut');
});

test('a cut stays put, saying why, when no beat is near or every near beat would cut into a word', async () => {
  const timings = evenTimings(board, {tail: 1}), cut = timings.scenes[0].duration;
  // The one beat near the first cut lies 0.12 s before it; the scene before it has only 0.15 s after its last word.
  const tight = {...timings, scenes: timings.scenes.map((t, i) => (i === 0 ? {...t, duration: lastWord(t) + .15} : t))};
  const near = await fitToMusic({storyboard: board, timings: tight, beats: {beats: [lastWord(tight.scenes[0]) + .03], drop: null}, snap: {tolerance: .15}});
  assert.equal(near.cuts[0].verdict, 'kept');
  assert.match(near.cuts[0].why, /would cut into a spoken word/);
  assert.match(verdicts(near.record)[1], /Every beat within the tolerance would cut into a spoken word": within=1.*keep-word/);
  assert.equal(near.timings.scenes[0].duration, tight.scenes[0].duration);
  const far = await fitToMusic({storyboard: board, timings, beats: {beats: [cut + .4], drop: null}, snap: {tolerance: .1}});
  assert.deepEqual(far.cuts.map(c => c.verdict), ['kept', 'kept', 'kept']);
  assert.match(verdicts(far.record)[1], /No beat within the tolerance.*keep-far/);
  assert.deepEqual(far.timings.scenes.map(s => s.duration), timings.scenes.map(s => s.duration));
  const off = await fitToMusic({storyboard: board, timings, beats: {beats: grid(.5), drop: null}, snap: false});
  assert.deepEqual(off.cuts, [], 'snap: false moves no cut');
});

test('the drop lands on the key moment: the song starts to put it there, and the cuts either side fit around it', async () => {
  const timings = evenTimings(board, {tail: 1}), drop = 8, beats = {beats: grid(.5, 60, .25), drop};
  const key = ['three', 'came home'];
  const fit = await fitToMusic({storyboard: board, timings, beats, snap: {tolerance: .3}, dropOn: key});
  const clock = makeClock(board, fit.timings);
  assert.ok(Math.abs(clock.at(key) - fit.start - drop) < 1e-6, 'the key moment is the drop, on the song\'s clock');
  const byScene = Object.fromEntries(fit.cuts.map(c => [c.scene, c]));
  assert.equal(byScene.three.verdict, 'held');
  assert.match(byScene.three.why, /the drop holds this scene/);
  for (const id of ['two', 'four']) {
    const t = clock.start(id) - fit.start;
    assert.ok(Math.abs(t - nearest(beats.beats, t)) < 1e-4, `${id} starts on a beat of the song (${byScene[id].verdict})`);
  }
  assert.match(verdicts(fit.record)[0], /The song starts so its drop lands on the key moment.*drop-on-key/);
  assert.match(verdicts(fit.record)[1], /The drop holds this scene.*held=true.*held/);
  // Without a drop there is nothing to land: refused, naming the fix.
  await assert.rejects(fitToMusic({storyboard: board, timings, beats: {beats: grid(.5), drop: null}, dropOn: key}), /dropOn needs the song's drop, and the beat map found none.*music\.drop/);
  // The drop placed with no cut moved.
  const placed = await fitToMusic({storyboard: board, timings, beats, snap: false, dropOn: key});
  assert.ok(Math.abs(makeClock(board, placed.timings).at(key) - placed.start - drop) < 1e-6);
  assert.deepEqual(placed.cuts, []);
});

test('a voiced cut follows: each moved scene\'s audio is padded or cut short by whole frames, its length its audio\'s', () => {
  const dir = tmp(), rate = 48000, tone = seconds => Float32Array.from({length: Math.round(seconds * rate)}, (_, i) => .3 * Math.sin(2 * Math.PI * 440 * i / rate));
  const before = {scenes: [{id: 'a', duration: 2, audio: 'a.wav', words: []}, {id: 'b', duration: 1.5, audio: 'b.wav', words: []}, {id: 'c', duration: 1, words: []}]};
  wavFile(path.join(dir, 'a.wav'), tone(2), rate); wavFile(path.join(dir, 'b.wav'), tone(1.5), rate);
  const after = {scenes: [{...before.scenes[0], duration: 2.12345}, {...before.scenes[1], duration: 1.3}, {...before.scenes[2], duration: 1.2}]};
  const fitted = fitVoice(dir, before, after);
  const frames = file => (readFileSync(path.join(dir, file)).length - 44) / 2;
  assert.equal(frames('a.wav'), Math.round(2.12345 * rate));
  assert.equal(frames('b.wav'), Math.round(1.3 * rate));
  assert.equal(fitted.scenes[0].duration, +(Math.round(2.12345 * rate) / rate).toFixed(5));
  assert.equal(fitted.scenes[1].duration, 1.3);
  assert.equal(fitted.scenes[2].duration, 1.2, 'a scene with no audio (a generated silence) keeps its new length');
  const b = readFileSync(path.join(dir, 'b.wav'));
  assert.equal(b.readInt16LE(b.length - 2), 0, 'a cut-short end is faded, no click');
  writeFileSync(path.join(dir, 'x.mp3'), 'not audio');
  assert.throws(() => fitVoice(dir, {scenes: [{duration: 1, audio: 'x.mp3'}]}, {scenes: [{duration: 1.1, audio: 'x.mp3'}]}), /x\.mp3 is not a WAV file/);
});

test('sound effects placed by their peaks: soundAt "peak" lands each sound\'s loudest moment on its moment', () => {
  for (const type of ['door', 'whoosh', 'click']) {
    const {wav} = createMotionSound({duration: 3, events: [{type, time: 1.5}], soundAt: 'peak'}), pcm = wav.subarray(44);
    const samples = Float32Array.from({length: pcm.length / 2}, (_, i) => pcm.readInt16LE(i * 2) / 32768);
    assert.ok(Math.abs(peakOfSamples(samples, 48000) - 1.5) <= .005, `${type} peaks at ${peakOfSamples(samples, 48000)}`);
  }
  assert.ok(soundPeak('door') > .3 && soundPeak('click') < .02, 'a door thuds a third of a second in; a click at once');
  assert.deepEqual(resolveSoundEvents([{type: 'door', time: 1}], null, 3), [{type: 'door', time: 1, end: 1.55}], 'left out, nothing changes');
  const [placed] = resolveSoundEvents([{type: 'door', time: 1}], null, 3, {soundAt: 'peak'});
  assert.equal(placed.hit, 1); assert.equal(placed.time, +(1 - soundPeak('door')).toFixed(10));
  assert.equal(resolveSoundEvents([{type: 'door', time: .1}], null, 3, {soundAt: 'peak'})[0].time, 0, 'never before its scene starts');
  assert.throws(() => resolveSoundEvents([], null, 1, {soundAt: 'middle'}), /soundAt is 'start'.*or 'peak'/);
  assert.throws(() => soundPeak('bell'), /"bell" is not a sound; the sounds are slide/);
});

test('the music options are checked, each refusal naming the fix', () => {
  const dir = tmp(), file = wavFile(path.join(dir, 's.wav'), new Float32Array(100), 8000);
  assert.deepEqual(readMusic({file}), {file, gain: MUSIC.gain, fadeOut: MUSIC.fadeOut, snap: null, dropOn: null, beats: {}});
  assert.deepEqual(readMusic({file, snap: true, bpm: 120}).snap, {tolerance: MUSIC.tolerance});
  assert.throws(() => readMusic({file, offset: 2}), /music: offset is not a key; music takes file, gain, snap, dropOn, bpm, drop, fadeOut/);
  assert.throws(() => readMusic({file: path.join(dir, 'none.mp3')}), /there is no song at/);
  assert.throws(() => readMusic({file, snap: {tolerance: 2}}), /snap\.tolerance is the most a cut moves, 0\.01–0\.5 seconds/);
  assert.throws(() => readMusic({file, snap: {within: .1}}), /snap takes \{tolerance\}/);
  assert.throws(() => readMusic({file, gain: 3}), /gain is the song's level under the voice, 0\.\.1/);
  assert.throws(() => readMusic({file, dropOn: 'three'}), /dropOn names the moment the drop lands on, as a key does: \["scene", "phrase", plus\?\]/);
  assert.throws(() => readSongPlacement({file, at: 1}), /at is not a key; it takes file, start, gain, fadeOut/);
  assert.equal(readSongPlacement({file, start: -2}).start, -2);
  assert.equal(musicUnderVoice({voice: -20, music: -35}), null);
  assert.match(musicUnderVoice({voice: -20, music: -24}).text, /the music is 4\.0 LU under the voice.*a lower music gain/);
});

const hello = fileURLToPath(new URL('../examples/hello/', import.meta.url));
const helloBoard = JSON.parse(readFileSync(hello + 'storyboard.json', 'utf8')), helloRecipe = JSON.parse(readFileSync(hello + 'recipe.json', 'utf8'));
const small = {width: 160, height: 90, fps: 4};

test('makeFilm with music: the beat map and the fit run as stages, the drop lands on its key, the record keeps both records', needs, async () => {
  const dir = tmp(), s = song({bpm: 123, count: 40, dropAt: 16}), file = wavFile(path.join(dir, 'song.wav'), s.samples, s.rate);
  const key = ['rule', 'If a pebble is left over'];
  const result = await makeFilm({storyboard: helloBoard, recipe: helloRecipe, root: hello, timings: evenTimings(helloBoard, {tail: 4}), out: path.join(dir, 'out/film.mp4'),
    render: {...small, soundAt: 'peak'}, music: {file, snap: true, dropOn: key}});
  const record = JSON.parse(readFileSync(result.makingOf, 'utf8'));
  assert.deepEqual(record.pipeline.filter(e => e.type === 'stage' && e.depth === 0).map(e => e.stageId).slice(0, 5), ['check-inputs', 'pace-narration', 'map-beats', 'fit-to-music', 'compile-film']);
  const {music} = record;
  assert.equal(music.file, 'song.wav');
  assert.ok(Math.abs(music.beats.bpm - 123) <= 1 && Math.abs(music.beats.drop - s.drop) <= .25);
  const keyAt = record.beats.find(b => b.said.phrase === key[1]).at;
  assert.ok(Math.abs(keyAt - music.start - music.beats.drop) < 1e-3, `the key moment (${keyAt} s) is the drop on the song's clock`);
  assert.equal(music.fit.cuts[0].verdict, 'held');
  assert.ok(verdicts(music.beats.record).length === 3 && verdicts(music.fit.record).length >= 2, 'both records keep their verdicts');
  assert.ok(Number.isFinite(result.loudness.roles.music), 'the song is in the mix, measured as its own role');
  assert.ok(record.inputs.music, 'an approval locks the song');
  assert.equal(record.version.soundAt, 'peak');
  await assert.rejects(makeFilm({storyboard: helloBoard, recipe: helloRecipe, root: hello, timings: evenTimings(helloBoard, {tail: 4}), out: path.join(dir, 'x/film.mp4'), render: {music: {file}}, music: {file}}), /leave render\.music out/);
});

test('makeFilm with music and a voice: the run\'s copy of each moved scene\'s audio is cut to its new length', needs, async () => {
  const dir = tmp(), s = song({bpm: 104, count: 70}), file = wavFile(path.join(dir, 'song.wav'), s.samples, s.rate);
  const voice = path.join(dir, 'voice'); mkdirSync(voice);
  const timings = evenTimings(helloBoard, {tail: 4});
  // A tone per scene for the voice, each exactly its scene's length (a canonical 44-byte WAV header).
  const voiced = {scenes: timings.scenes.map((t, i) => {
    wavFile(path.join(voice, `s${i}.wav`), Float32Array.from({length: Math.round(t.duration * 48000)}, (_, k) => .2 * Math.sin(2 * Math.PI * (300 + 100 * i) * k / 48000)), 48000);
    return {...t, audio: `s${i}.wav`};
  })};
  writeFileSync(path.join(voice, 'timings.json'), JSON.stringify(voiced));
  const result = await makeFilm({storyboard: helloBoard, recipe: helloRecipe, root: hello, narrationDir: voice, out: path.join(dir, 'out/film.mp4'), render: small, music: {file, snap: {tolerance: .3}}});
  const record = JSON.parse(readFileSync(result.makingOf, 'utf8')), cut = record.music.fit.cuts[0];
  assert.equal(cut.verdict, 'moved', cut.why);
  const paced = JSON.parse(readFileSync(path.join(dir, 'out/narration/timings.json'), 'utf8'));
  for (const t of paced.scenes) assert.equal(t.duration, +(((readFileSync(path.join(dir, 'out/narration', t.audio)).length - 44) / 2 / 48000)).toFixed(5), `${t.id}: its length is its audio's`);
  const songBeats = s.beats.map(b => b), start = paced.scenes[0].duration;
  assert.ok(Math.abs(start - nearest(songBeats, start)) <= .002, `the second scene starts on a beat (${start})`);
  assert.equal(readFileSync(path.join(voice, 's0.wav')).length - 44, Math.round(voiced.scenes[0].duration * 48000) * 2, 'the voice folder itself is never touched');
});
