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
import {breakdown} from '../src/breakdown.mjs';
import {beatMap, safeBeats} from '../src/beats.mjs';
import {rhythm, wavFile} from './songs.mjs';
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

/** A song from RHYTHMS as a WAV, and its true beats and length. */
function music(dir, family) {
  const s = rhythm({bpm: 120, family, bars: 5, lead: .2});
  return {wav: wavFile(path.join(dir, `${family.replace(/\W+/g, '-')}.wav`), s.samples, s.rate), beats: s.beats, seconds: Math.floor(s.samples.length / s.rate * FPS) / FPS};
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
  assert.match(toned.spec.audio.beats.why, /^the beat map could not read the sound: beatMap: sound\.wav has no beats to measure: none of the \d+ its onsets suggest sits on an onset/);
  assert.equal(toned.spec.shots.length, 2, 'the rest of the breakdown stands');
  const silent = await breakdown(film(dir, 'silent', {cuts: [2], seconds: 4, sound: null}), {out: path.join(dir, 'silent'), beatMap});
  assert.deepEqual(silent.spec.audio, {sound: false, beats: {ran: false, why: 'the video has no sound'}});
});
