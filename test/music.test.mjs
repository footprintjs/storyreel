// Music under a film (music.mjs): scene starts moved onto the song's beats within a tolerance — never by more, never
// past a spoken word — the song started so its drop lands on a key moment, sound effects placed by their peaks, and
// makeFilm running it all as stages of its own. Every cut's verdict is decide() evidence in the fit's record. Without
// the option nothing changes (pinned by hand against main: the same MP4 bytes, silent and voiced).
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {evenTimings, makeClock, makeFilm} from '../src/index.mjs';
import {fitToMusic, fitVoice, readMusic, readSongPlacement, requireOverlap, MUSIC} from '../src/music.mjs';
import {compileFilm} from '../src/film.mjs';
import {renderFilm} from '../src/render.mjs';
import {createMotionSound, resolveSoundEvents, soundPeak} from '../src/sound.mjs';
import {peakOfSamples} from '../src/beats.mjs';
import {musicUnderVoice} from '../src/listening.mjs';
import {song, wavFile} from './songs.mjs';

const ffmpegBin = process.env.FFMPEG_BIN || 'ffmpeg';
const ffmpeg = spawnSync(ffmpegBin, ['-version']).status === 0;
const needs = {skip: ffmpeg ? false : 'ffmpeg not on PATH'};
const tmp = () => mkdtempSync(path.join(tmpdir(), 'storyreel-music-'));
const hello = fileURLToPath(new URL('../examples/hello/', import.meta.url));
const helloBoard = JSON.parse(readFileSync(hello + 'storyboard.json', 'utf8')), helloRecipe = JSON.parse(readFileSync(hello + 'recipe.json', 'utf8'));
const small = {width: 160, height: 90, fps: 4};

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

test('each scene start moves onto the nearest beat; each scene\'s length changes by at most the tolerance; the words keep their places', async () => {
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
    assert.ok(Math.abs(cut.drift - (clock.offsets[i + 1] - makeClock(board, timings).offsets[i + 1])) < 1e-3, 'the drift is how far the cut now sits from where it was');
  }
  fit.timings.scenes.forEach((t, i) => {
    assert.ok(Math.abs(t.duration - timings.scenes[i].duration) <= .3 + 1e-9, `${t.id}'s length changes by at most the tolerance`);
    assert.deepEqual(t.words, timings.scenes[i].words, 'only the scenes\' lengths change');
    assert.ok(t.duration >= lastWord(t) + MUSIC.clear - 1e-9, `${t.id} keeps its last word and the silence after it`);
  });
  const lines = verdicts(fit.record);
  assert.match(lines[0], /The song starts with the film.*with-film/);
  assert.match(lines[1], /A beat within the tolerance that keeps every scene's words and keys \(of two, the one that brings the drift back\)": keepWords=\d.*chose move/);
  assert.match(lines.at(-1), /Every cut is fitted.*done/);
  assert.equal(fit.record.filter(e => e.type === 'loop').length, 3, 'one pass of the loop per cut');
  assert.ok(fit.record.some(e => /Write drift = /.test(e.text)), 'each cut\'s drift is in the record');
  assert.ok(fit.record.every(e => !('rawValue' in e)), 'the record keeps no live values');
  assert.deepEqual((await fitToMusic({storyboard: board, timings, beats})).cuts, [], 'snap is off unless asked for, as in makeFilm');
});

test('twelve scenes: the moves add up, so of two beats within the tolerance the one that brings the drift back is taken', async () => {
  const twelve = {scenes: Array.from({length: 12}, (_, i) => ({id: `s${i}`, narration: `Scene ${['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][i]} is short.`}))};
  // Every scene 4.17 s long against a beat every 0.4 s: each cut lands 0.17 s further past a beat than the last.
  const even = evenTimings(twelve, {tail: 1}), timings = {...even, scenes: even.scenes.map(t => ({...t, duration: 4.17}))};
  const beats = {beats: grid(.4, 200), drop: null}, tolerance = .3;
  const fit = await fitToMusic({storyboard: twelve, timings, beats, snap: {tolerance}});
  const clock = makeClock(twelve, fit.timings), was = makeClock(twelve, timings);
  assert.equal(fit.cuts.length, 11);
  for (const [k, cut] of fit.cuts.entries()) {
    assert.equal(cut.verdict, 'moved', cut.why);
    assert.ok(Math.abs(clock.offsets[k + 1] - nearest(beats.beats, clock.offsets[k + 1])) < 1e-4, `${cut.scene} on a beat`);
    assert.ok(Math.abs(cut.drift) <= tolerance + 1e-9, `${cut.scene} drifts ${cut.drift}`);
  }
  fit.timings.scenes.forEach((t, i) => assert.ok(Math.abs(t.duration - 4.17) <= tolerance + 1e-9, `${t.id} changed by ${t.duration - 4.17}`));
  assert.ok(Math.abs(clock.offsets[11] - was.offsets[11]) <= tolerance, 'the last cut sits within the tolerance of where it was');
  assert.ok(fit.cuts.some(c => c.by > .2), 'somewhere the farther beat was taken, to bring the drift back');
});

test('a cut stays put, saying why, when no beat is near or every near beat would cut into a word', async () => {
  const timings = evenTimings(board, {tail: 1}), cut = timings.scenes[0].duration;
  // The one beat near the first cut lies 0.12 s before it; the scene before it has only 0.15 s after its last word.
  const tight = {...timings, scenes: timings.scenes.map((t, i) => (i === 0 ? {...t, duration: lastWord(t) + .15} : t))};
  const near = await fitToMusic({storyboard: board, timings: tight, beats: {beats: [lastWord(tight.scenes[0]) + .03], drop: null}, snap: {tolerance: .15}});
  assert.equal(near.cuts[0].verdict, 'kept');
  assert.match(near.cuts[0].why, /would cut into a scene's words/);
  assert.match(verdicts(near.record)[1], /Every beat within the tolerance would cut into a scene's words, keys or the entrance after it": within=1.*keep-word/);
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

test('music that would be lost is refused: a key outside the film, a drop past the song\'s end, a song that never plays', async () => {
  const timings = evenTimings(board, {tail: 1}), beats = {beats: grid(.5, 40), drop: 8, seconds: 20}, total = makeClock(board, timings).total;
  await assert.rejects(fitToMusic({storyboard: board, timings, beats, dropOn: ['four', 'of them', 60]}), /dropOn \["four","of them",60\] is at [\d.]+ s, outside the film \(0–[\d.]+ s\): name a moment inside it/);
  await assert.rejects(fitToMusic({storyboard: board, timings, beats, dropOn: ['one', 'A shepherd', -5]}), /outside the film/);
  await assert.rejects(fitToMusic({storyboard: board, timings, beats: {...beats, drop: 25}, dropOn: ['three', 'came home']}), /the song's drop \(25 s\) is past its end \(20 s\)/);
  await assert.rejects(fitToMusic({storyboard: board, timings, beats, dropOn: ['three', 'came home', Number.NaN]}), /plus a finite number of seconds/);
  assert.throws(() => requireOverlap({start: total + 1, seconds: 20, total, who: 'w'}), /never plays during the film .*start it before the film ends/);
  assert.throws(() => requireOverlap({start: -30, seconds: 20, total, who: 'w'}), /never plays during the film .*start it later/);
  assert.doesNotThrow(() => requireOverlap({start: -10, seconds: 20, total, who: 'w'}));
  assert.doesNotThrow(() => requireOverlap({start: 5, seconds: null, total, who: 'w'}), 'a length that cannot be read is not checked');
});

test('renderFilm refuses a song placed where it never plays, before a frame is drawn', needs, async () => {
  const dir = tmp(), file = wavFile(path.join(dir, 'short.wav'), new Float32Array(44100 * 2).fill(.1), 44100);
  const film = await compileFilm({storyboard: helloBoard, timings: evenTimings(helloBoard, {tail: 4}), recipe: helloRecipe, root: hello});
  const render = start => renderFilm({film, storyboard: helloBoard, timings: film.timings, out: path.join(dir, 'x.mp4'), ...small, music: {file, start}});
  await assert.rejects(render(film.total + 1), /renderFilm music: the song \(2 s\) placed at film second [\d.]+ never plays during the film/);
  await assert.rejects(render(-5), /never plays during the film .*start it later/);
});

test('no scene is made shorter than its keyed moments or the entrance into the next scene allow', async () => {
  const even = evenTimings(board, {tail: 1}), clock = makeClock(board, even);
  // A drawing keyed 1.2 s after scene one's last phrase lands in its tail; give that scene 0.4 s after the key.
  const key = ['one', 'on the hill', 1.2], keyAt = clock.at(key) - clock.start('one');
  const timings = {...even, scenes: even.scenes.map((t, i) => (i === 0 ? {...t, duration: keyAt + .4} : t))};
  const before = {beats: [keyAt + .4 - .35], drop: null};   // a beat that would leave the key 0.05 s before the cut
  const recipe = {story: {kit: 'whiteboard', items: [{at: key, dur: .5, draw: []}]}};
  const words = await fitToMusic({storyboard: board, timings, beats: before, snap: {tolerance: .4}});
  assert.equal(words.cuts[0].verdict, 'moved', 'the words alone allow it');
  const keyed = await fitToMusic({storyboard: board, timings, beats: before, snap: {tolerance: .4}, recipe});
  assert.equal(keyed.cuts[0].verdict, 'kept', 'the keyed drawing does not');
  assert.match(keyed.cuts[0].why, /keys or the entrance after it/);
  // An entrance into scene two (a one-second fade begins 0.75 s before its start) plays in scene one's tail.
  const last = lastWord(even.scenes[0]), tail = {...even, scenes: even.scenes.map((t, i) => (i === 0 ? {...t, duration: last + .9} : t))};
  const beat = {beats: [last + .9 - .3], drop: null}, fade = {stages: [{type: 'world', scene: 'two', enter: {type: 'fade', seconds: 1}, world: {kit: 'whiteboard'}}]};
  assert.equal((await fitToMusic({storyboard: board, timings: tail, beats: beat, snap: {tolerance: .4}, recipe: fade})).cuts[0].verdict, 'kept', 'a 0.75 s lead does not fit in 0.6 s');
  const cut = {stages: [{type: 'world', scene: 'two', enter: 'cut', world: {kit: 'whiteboard'}}]};
  assert.equal((await fitToMusic({storyboard: board, timings: tail, beats: beat, snap: {tolerance: .4}, recipe: cut})).cuts[0].verdict, 'moved', 'a hard cut has no lead');
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
  assert.throws(() => readMusic({file, snap: {tolerance: 2}}), /snap\.tolerance is the most a scene's length changes, 0\.01–0\.5 seconds/);
  assert.throws(() => readMusic({file, snap: {within: .1}}), /snap takes \{tolerance\}/);
  assert.throws(() => readMusic({file, gain: 3}), /gain is the song's level under the voice, 0\.\.1/);
  assert.throws(() => readMusic({file, dropOn: 'three'}), /dropOn names the moment the drop lands on, as a key does: \["scene", "phrase", plus\?\]/);
  assert.throws(() => readMusic({file, dropOn: ['three', 'came home', NaN]}), /plus a finite number of seconds/);
  assert.throws(() => readMusic({file, dropOn: ['three', 'came home', Infinity]}), /plus a finite number of seconds/);
  assert.throws(() => readMusic({file, bpm: 400}), /music: bpm is the song's tempo, a number 30–300/);
  assert.throws(() => readMusic({file, drop: -1}), /music: drop is the second the song drops, a number from 0/);
  assert.deepEqual(readMusic({file, bpm: 120, drop: 30}).beats, {bpm: 120, drop: 30});
  assert.throws(() => readSongPlacement({file, at: 1}), /at is not a key; it takes file, start, gain, fadeOut/);
  assert.equal(readSongPlacement({file, start: -2}).start, -2);
  assert.equal(musicUnderVoice({voice: -20, music: -35}), null);
  assert.match(musicUnderVoice({voice: -20, music: -24}).text, /the music is 4\.0 LU under the voice.*a lower music gain/);
});


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
  assert.equal(record.inputs.soundAt, 'peak', 'sounds placed by their peaks change what is heard: an approval locks it');
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

test('without music nothing changes: the same stages, record, inputs and FFmpeg calls as before (pinned on main)', needs, async () => {
  const dir = tmp(), log = path.join(dir, 'calls.log'), shim = path.join(dir, 'ffmpeg'), out = path.join(dir, 'out');
  // An FFmpeg that writes down every call it is given, then runs the real one.
  writeFileSync(shim, `#!/bin/sh\nfor a in "$@"; do printf '%s\\037' "$a" >> '${log}'; done\nprintf '\\n' >> '${log}'\nexec "${ffmpegBin}" "$@"\n`); chmodSync(shim, 0o755);
  const result = await makeFilm({storyboard: helloBoard, recipe: helloRecipe, root: hello, timings: evenTimings(helloBoard, {tail: 4}), out: path.join(out, 'film.mp4'), render: {...small, from: 0, to: 2, ffmpeg: shim}});
  const record = JSON.parse(readFileSync(result.makingOf, 'utf8'));
  assert.deepEqual(record.pipeline.filter(e => e.type === 'stage' && e.depth === 0).map(e => e.stageId.split('~')[0]), ['check-inputs', 'pace-narration', 'compile-film', 'plan-picture', 'render-picture', 'render-film', 'check-finished']);
  assert.equal('music' in record, false);
  assert.deepEqual(Object.keys(record.loudness.roles), ['voice', 'effects']);
  assert.deepEqual(record.inputs, {storyboard: '390932da10154987', timings: '868ab614fc412af1', recipe: '9b351fe10b5a8e66', strings: null, data: null, theme: 'b5d0139a73be8b54', files: {'rule.ts': '8fc6d8dd3606be0f'}, pacing: '74234e98afe7498f'});
  const calls = readFileSync(log, 'utf8').trim().split('\n').map(l => l.split('\x1f').filter(Boolean).map(a => a.split(out).join('<dir>')).join(' '));
  assert.deepEqual(calls, [
    '-y -loglevel error -f rawvideo -pixel_format rgba -video_size 160x90 -framerate 4 -i pipe:0 -c:v libx264 -preset fast -crf 19 -pix_fmt yuv420p <dir>/film-video.mp4',
    '-y -loglevel error -f lavfi -i anullsrc=r=48000:cl=mono -t 31.78 <dir>/film-voice.wav',
    '-y -loglevel error -f concat -safe 0 -i <dir>/film-sfx.txt -ar 48000 -ac 1 <dir>/film-sfx.wav',
    '-hide_banner -nostats -i <dir>/film-sfx.wav -filter_complex ebur128=framelog=quiet -f null -',
    '-y -loglevel error -i <dir>/film-voice.wav -i <dir>/film-sfx.wav -filter_complex [0:a]aresample=48000[a];[1:a]aresample=48000[b];[a][b]amix=inputs=2:normalize=0:duration=first -ac 1 <dir>/film-lesson.wav',
    '-y -loglevel error -ss 0 -t 2 -i <dir>/film-lesson.wav <dir>/film-part.wav',
    '-y -loglevel error -f concat -safe 0 -i <dir>/film-audio.txt -ar 48000 -ac 1 <dir>/film-audio.wav',
    '-y -hide_banner -nostats -loglevel info -i <dir>/film-audio.wav -af aformat=channel_layouts=stereo,loudnorm=I=-16:TP=-1.5:print_format=json -f null -',
    '-y -hide_banner -nostats -loglevel info -i <dir>/film-video.mp4 -i <dir>/film-audio.wav -map 0:v -map 1:a -af aformat=channel_layouts=stereo,aresample=48000,apad -c:v copy -c:a aac -b:a 160k -t 2.000000 -movflags +faststart <dir>/film.mp4',
  ]);
});
