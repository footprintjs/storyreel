// The breakdown with the beat map (breakdown.mjs + beats.mjs): short films made here with FFmpeg — coloured cards cut
// at known times over a song made sample by sample (test/songs.mjs) — broken down with `storyreel breakdown --beats`
// and with breakdown(file, {beatMap}). A sure map judges every cut; an unsure one judges a cut only against the beats
// every candidate shares and the song hits (beats.mjs · safeBeats) and says the rest cannot be judged; a sound with no
// music is recorded as not read; a beat option the map refuses refuses the breakdown.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {breakdown, breakdownText} from '../src/breakdown.mjs';
import {beatMap, safeBeats} from '../src/beats.mjs';
import {rhythm, wavFile, silenced} from './songs.mjs';
import {tempDir} from './tmp.mjs';

const has = cmd => !spawnSync(cmd, ['-version']).error;
const skip = has('ffmpeg') && has('ffprobe') ? false : 'needs ffmpeg and ffprobe';
const ffmpeg = args => { const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], {encoding: 'utf8'}); assert.equal(r.status, 0, r.stderr); };
const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const run = args => spawnSync(process.execPath, [cli, 'breakdown', ...args], {encoding: 'utf8'});
const FPS = 25, frame = t => Math.round(t * FPS) / FPS, COLOURS = ['red', 'blue', 'green', 'yellow', 'white'];

/** A film of coloured cards cut at `cuts` (seconds, on the frame grid), `seconds` long, over `sound`: a WAV, a tone, or none. */
function film(dir, name, {cuts, seconds, sound}) {
  const edges = [0, ...cuts, seconds], file = path.join(dir, `${name}.mkv`);
  const cards = edges.slice(1).map((end, i) => `color=c=${COLOURS[i % COLOURS.length]}:s=160x90:r=${FPS}:d=${(end - edges[i]).toFixed(3)},format=yuv420p,setsar=1[v${i}]`);
  const graph = [...cards, `${cards.map((_, i) => `[v${i}]`).join('')}concat=n=${cards.length}:v=1:a=0[v]`].join(';');
  const audio = sound === 'tone' ? ['-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=22050:duration=${seconds}`] : sound ? ['-i', sound] : [];
  // The sound kept as PCM, so the beat map reads the samples it was made of.
  ffmpeg([...audio, '-filter_complex', graph, '-map', '[v]', ...(sound ? ['-map', '0:a', '-c:a', 'pcm_s16le'] : []), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-t', String(seconds), file]);
  return file;
}

/** A song from RHYTHMS as a WAV, and its true beats and length; `silent` stretches ([from, to]) leave only a noise floor. */
function music(dir, family, {bars = 5, lead = .2, silent = []} = {}) {
  const s = silenced(rhythm({bpm: 120, family, bars, lead}), silent);
  return {wav: wavFile(path.join(dir, `${family.replace(/\W+/g, '-')}-${bars}-${silent.flat().join('-')}.wav`), s.samples, s.rate), beats: s.beats, seconds: Math.floor(s.samples.length / s.rate * FPS) / FPS};
}

test('a sure map judges every cut: on the beat, or off it by how much — through storyreel breakdown --beats', {skip}, t => {
  const dir = tempDir('breakdown-beats', t), song = music(dir, 'four on the floor, eighth hats');
  // Cuts on the 5th and 9th beats, and one a quarter of a beat (0.125 s) after a beat.
  const cuts = [frame(song.beats[4]), frame(song.beats[8]), frame(song.beats[11] + .125)];
  const video = film(dir, 'sure', {cuts, seconds: song.seconds, sound: song.wav}), out = path.join(dir, 'out');
  const r = run([video, '--beats', '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  const b = JSON.parse(readFileSync(path.join(out, 'breakdown.json'), 'utf8')).audio.beats;
  assert.equal(b.ran, true); assert.equal(b.verdict, 'tempo-measured'); assert.equal(b.sure, true); assert.ok(Math.abs(b.bpm - 120) <= 1, `bpm ${b.bpm}`);
  assert.deepEqual(b.judged, {grid: 'every beat', beats: b.beats.length, of: b.beats.length});
  assert.deepEqual(b.cuts.map(c => c.onBeat), [true, true, false]);
  assert.ok(Math.abs(b.cuts[2].off - (cuts[2] - song.beats[11])) <= .02, `off by ${b.cuts[2].off}, made ${(cuts[2] - song.beats[11]).toFixed(2)} after its beat`);
  assert.equal(b.close, undefined, 'a sure map is no close call, whatever its alternatives score');
  assert.match(r.stdout, /## Cuts on the beat\n\n120 BPM \(confidence [\d.]+\), \d+ beats\. 2 of 3 cuts land on a beat \(within 0\.05 s\)\./);
  // Without --beats the beats are not read; a beat option the map refuses (code BEAT_OPTIONS) refuses the breakdown.
  const plain = run([video, '--out', path.join(dir, 'plain')]);
  assert.equal(plain.status, 0, plain.stderr); assert.match(plain.stdout, /Not run: no beat map was given/);
  const refused = run([video, '--beats', '--bpm', '5', '--out', path.join(dir, 'refused')]);
  assert.equal(refused.status, 2); assert.match(refused.stderr, /the beat map refused its options: beatMap: bpm is the song's tempo, a number 30–300/);
});

test('an unsure map judges a cut only against the beats every candidate shares and the song hits; the rest are not judged', {skip}, async t => {
  const dir = tempDir('breakdown-beats', t), song = music(dir, 'kick and snare only'), map = await beatMap(song.wav), shared = safeBeats(map).beats;
  assert.equal(map.sure, false, `the song's map is unsure (${map.verdict})`); assert.ok(shared.length >= 1, 'and keeps a shared beat or more');
  // A cut on a shared beat, one on a true beat no candidate shares, and one a quarter-beat off.
  const lone = song.beats.find(b => b > shared[0] + 1 && shared.every(s => Math.abs(s - b) > .2));
  const cuts = [frame(shared[0]), frame(lone), frame(lone + 1.125)].sort((a, b) => a - b);
  const video = film(dir, 'unsure', {cuts, seconds: song.seconds, sound: song.wav});
  const {spec, text} = await breakdown(video, {out: path.join(dir, 'out'), beatMap});
  const b = spec.audio.beats, byTime = Object.fromEntries(b.cuts.map(c => [frame(c.at), c.onBeat]));
  assert.equal(b.sure, false); assert.equal(b.verdict, 'tempo-close'); assert.ok(b.likely.length >= 1);
  assert.equal(b.judged.grid, 'shared'); assert.equal(b.judged.beats, shared.length);
  assert.equal(byTime[frame(shared[0])], true, 'on a beat every candidate shares');
  assert.equal(byTime[frame(lone)], null, 'a true beat no candidate shares: not called on the beat, nor off it');
  assert.equal(byTime[frame(lone + 1.125)], null, 'off the beat: not judged either');
  assert.equal(b.onBeat, 1); assert.equal(b.unjudged, 2);
  assert.match(text, /The tempo is unsure \(tempo-close\): a cut is judged only against the \d+ beats? of \d+ every candidate tempo shares and the song hits; give the tempo \(one of [\d, ]+ BPM\) to judge every cut\./);
  assert.match(text, /1 of 3 cuts land on such a beat \(within 0\.05 s\); 2 cannot be judged\./);
  assert.match(text, /not judged \(no beat every candidate shares near it\)/);
});

test('no music: a steady tone has no beats to read, and the breakdown says so; no sound at all, likewise', {skip}, async t => {
  const dir = tempDir('breakdown-beats', t);
  const toned = await breakdown(film(dir, 'tone', {cuts: [2], seconds: 4, sound: 'tone'}), {out: path.join(dir, 'tone'), beatMap});
  assert.equal(toned.spec.audio.beats.ran, false);
  // The sound was read and has no steady beat: told apart from a sound the beat map could not read; the fix worded for the
  // API here, for the command line there (breakdown.mjs · HINTS).
  assert.match(toned.spec.audio.beats.why, /^the sound has no steady beat \(its onsets are faint \([\d.]+, under 0\.6: a held tone or pad\)\); give it as breakdown\(file, \{beatMap, beatOptions: \{bpm: …\}\}\) to lay a grid anyway$/);
  assert.match(toned.text, /Not run: the sound has no steady beat \(/);
  const cli = run([path.join(dir, 'tone.mkv'), '--beats', '--out', path.join(dir, 'tone-cli')]);
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /Not run: the sound has no steady beat \(its onsets are faint \([\d.]+, under 0\.6: a held tone or pad\)\); add --bpm n to lay a grid anyway\./);
  const unread = await breakdown(path.join(dir, 'tone.mkv'), {out: path.join(dir, 'unread'), beatMap: () => { throw new Error('beatMap: FFmpeg could not read tone.mkv: Invalid data'); }});
  assert.equal(unread.spec.audio.beats.why, 'the beat map could not read the sound (beatMap: FFmpeg could not read tone.mkv: Invalid data)');
  assert.equal(toned.spec.shots.length, 2, 'the rest of the breakdown stands');
  const silent = await breakdown(film(dir, 'silent', {cuts: [2], seconds: 4, sound: null}), {out: path.join(dir, 'silent'), beatMap});
  assert.deepEqual(silent.spec.audio, {sound: false, beats: {ran: false, why: 'the video has no sound'}});
});

test('a beat counts only where music plays: a cut in a silent gap, before the music starts or after it stops is "no music here"', {skip}, async t => {
  const dir = tempDir('breakdown-beats', t), family = 'four on the floor, eighth hats', at = list => list.map(frame);
  const read = async (name, song, cuts) => (await breakdown(film(dir, name, {cuts, seconds: song.seconds, sound: song.wav}), {out: path.join(dir, name), beatMap})).spec.audio.beats;
  const byTime = b => Object.fromEntries(b.cuts.map(c => [frame(c.at), c.music === false ? 'no music' : c.onBeat]));
  // Kicks from 0 to 8 s and from 11 to 20 s; cuts at 9 and 10 s, in the gap, and at 4 and 14 s, on beats.
  const gap = await read('gap', music(dir, family, {bars: 10, lead: 0, silent: [[8.2, 11]]}), at([4, 9, 10, 14]));
  assert.deepEqual(byTime(gap), {4: true, 9: 'no music', 10: 'no music', 14: true}, JSON.stringify(gap.cuts));
  assert.equal(gap.noMusic, 2); assert.equal(gap.onBeat, 2);
  // Music from 6 to 14 s, cuts every 2 s: none before or after is called off the beat (it was "off by 4.00 s").
  const middle = await read('middle', music(dir, family, {bars: 10, lead: 0, silent: [[0, 5.9], [14.2, null]]}), at([2, 4, 6, 8, 10, 12, 14, 16, 18]));
  const m = byTime(middle);
  for (const x of [2, 4, 16, 18]) assert.equal(m[x], 'no music', `${x} s: ${JSON.stringify(middle.cuts)}`);
  for (const x of [6, 8, 10, 12, 14]) assert.notEqual(m[x], 'no music', `${x} s is in the music`);
  assert.equal(middle.noMusic, 4); assert.ok(middle.cuts.every(c => c.music === false || c.off === null || Math.abs(c.off) < 1), 'no cut is off the beat by seconds');
  // Music from 4 s.
  const late = await read('late', music(dir, family, {bars: 8, lead: 0, silent: [[0, 3.9]]}), at([1, 2, 6, 8]));
  assert.deepEqual(Object.values(byTime(late)).map(v => v === 'no music'), [true, true, false, false]);
  const {text} = await breakdown(path.join(dir, 'gap.mkv'), {out: path.join(dir, 'gap-text'), beatMap});
  assert.match(text, /2 of 4 cuts land on a beat \(within 0\.05 s\); 2 where no music plays\./); assert.match(text, /0:09\.0 hard cut: no music here/);
});

test('a given tempo sets the tempo, not the phase: kicks on every half-beat of the tempo given leave the phase unsure, and no cut is called on or off the beat', {skip}, async t => {
  const dir = tempDir('breakdown-beats', t), song = music(dir, 'four on the floor, off-beat hats', {bars: 6, lead: .2});
  // 120 BPM kicks, the tempo given as 60: every half-beat of 60 is a kick, so either phase is as well heard as the other.
  const map = await beatMap(song.wav, {bpm: 60});
  assert.equal(map.verdict, 'tempo-given'); assert.equal(map.phase, 'unsure'); assert.equal(map.sure, false);
  assert.deepEqual(safeBeats(map).beats, [], 'a film cuts on none of its beats');
  const video = film(dir, 'given', {cuts: [frame(song.beats[3]), frame(song.beats[6])], seconds: song.seconds, sound: song.wav});
  const b = (await breakdown(video, {out: path.join(dir, 'given-out'), beatMap, beatOptions: {bpm: 60}})).spec.audio.beats;
  assert.equal(b.sure, false); assert.deepEqual(b.cuts.map(c => c.onBeat), [null, null], 'not judged, never "0 of 2 on the beat"');
  assert.equal(b.phase, 'unsure'); assert.deepEqual(b.likely, [120], 'the tempo to try: the beats heard, twice the one given');
  assert.match(breakdownText((await breakdown(video, {out: path.join(dir, 'given-text'), beatMap, beatOptions: {bpm: 60}})).spec), /The tempo given \(60 BPM\) sits between the beats heard: its phase is unsure, so no cut is judged; try 120 BPM\./);
  // Given as 120, the same kicks are sure of their phase.
  assert.equal((await beatMap(song.wav, {bpm: 120})).sure, true);
});

test('an FFmpeg that is not there is a refusal, never a crash: the breakdown and the beat map reject, naming it', {skip}, async t => {
  const dir = tempDir('breakdown-beats', t), song = music(dir, 'four on the floor, eighth hats'), video = film(dir, 'missing', {cuts: [2], seconds: 4, sound: song.wav});
  const gone = '/nonexistent/ffmpeg';
  await assert.rejects(breakdown(video, {out: path.join(dir, 'missing-out'), ffmpeg: gone}), /there is no ffmpeg at \/nonexistent\/ffmpeg/);
  await assert.rejects(beatMap(song.wav, {ffmpeg: gone}), e => /beatMap: FFmpeg \(\/nonexistent\/ffmpeg\) could not run: there is no ffmpeg at/.test(e.message) && e.code === undefined);
});

test('an unsure map says "maybe" of its drop, and names a close call only at 0.9 of the best or more', {skip}, async t => {
  const dir = tempDir('breakdown-beats', t), song = music(dir, 'four on the floor, eighth hats'), video = film(dir, 'maybe', {cuts: [frame(song.beats[4])], seconds: song.seconds, sound: song.wav});
  const unsure = (score) => () => ({bpm: 120, beats: song.beats, drop: 5.6, verdict: 'tempo-close', sure: false, hits: song.beats,
    alternatives: [{bpm: 120, score: 1, beats: song.beats, phaseDoubt: .2}, {bpm: 60, score, beats: song.beats.filter((_, i) => i % 2 === 0), phaseDoubt: .3}]});
  const low = await breakdown(video, {out: path.join(dir, 'low'), beatMap: unsure(.8)});
  assert.equal(low.spec.audio.beats.drop.maybe, true); assert.match(low.text, /Maybe a drop at 0:05\.6 \(the map is unsure\)/);
  assert.equal(low.spec.audio.beats.close, undefined, 'a runner-up at 0.8 is no close call'); assert.doesNotMatch(low.text, /a close call/);
  const high = await breakdown(video, {out: path.join(dir, 'high'), beatMap: unsure(.95)});
  assert.deepEqual(high.spec.audio.beats.close, {bpm: 60, score: .95}); assert.match(high.text, /a close call: 60 BPM scores 0\.95 of it/);
  // The runner-up is never the winning tempo again: 192.8 beside a grid at 192.3 is the same tempo (one 1% rule).
  const cloud = await breakdown(video, {out: path.join(dir, 'cloud'), beatMap: () => ({bpm: 192.3, beats: song.beats, drop: null, verdict: 'tempo-close', sure: false,
    alternatives: [{bpm: 192.8, score: 1}, {bpm: 120.9, score: .989}, {bpm: 129.7, score: .987}]})});
  assert.deepEqual(cloud.spec.audio.beats.close, {bpm: 120.9, score: .99}); assert.doesNotMatch(cloud.text, /192\.8 BPM scores/);
  const sure = await breakdown(video, {out: path.join(dir, 'sure-drop'), beatMap: () => ({...unsure(.95)(), verdict: 'tempo-measured', sure: true})});
  assert.equal(sure.spec.audio.beats.drop.maybe, undefined); assert.match(sure.text, /The drop at 0:05\.6: shot/);
});
