// The beat map (beats.mjs) on songs made here, sample by sample, so every beat, bar and drop is known exactly: a click
// track at a known tempo with a kick on the one, a quiet build, then a drop. No downloaded audio. The map is a flowchart:
// its tempo, bars and drop are each decide() evidence in its record.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {beatMap, beatMapOf, peakOf, peakOfSamples, BEATS} from '../src/beats.mjs';
import {fftOf, tempoPrior} from '../src/dsp.mjs';
import {song, wavFile, noiseFrom} from './songs.mjs';

const ffmpeg = spawnSync(process.env.FFMPEG_BIN || 'ffmpeg', ['-version']).status === 0;
const needs = {skip: ffmpeg ? false : 'ffmpeg not on PATH'};
const tmp = () => mkdtempSync(path.join(tmpdir(), 'storyreel-beats-'));

/** The farthest a list of times lies from the nearest of another. */
const worst = (times, from) => Math.max(...times.map(t => Math.min(...from.map(u => Math.abs(u - t)))));
/** The decision lines of a record: what each decider examined and chose. */
const verdicts = record => record.filter(e => e.type === 'condition').map(e => e.text);

test('a click track with a build and a drop: BPM within 1, every beat within 20 ms, the bars on the kick, the drop within 0.25 s', needs, async () => {
  const s = song({bpm: 123, count: 40, dropAt: 16}), file = wavFile(path.join(tmp(), 'song.wav'), s.samples, s.rate);
  const map = await beatMap(file);
  assert.ok(Math.abs(map.bpm - 123) <= 1, `bpm ${map.bpm}`);
  assert.equal(map.beats.length, s.beats.length);
  assert.ok(worst(map.beats, s.beats) <= .02, `a beat ${worst(map.beats, s.beats)} s from its click`);
  assert.ok(worst(s.beats, map.beats) <= .02, `a click ${worst(s.beats, map.beats)} s from any beat`);
  assert.ok(worst(map.bars, s.bars) <= .02 && map.bars.length === s.bars.length, 'the bars start on the kick');
  assert.ok(Math.abs(map.drop - s.drop) <= .25, `drop ${map.drop} against ${s.drop}`);
  assert.ok(map.confidence >= .9, `confidence ${map.confidence}`);
  assert.equal(map.alternatives[0].score, 1);
  assert.ok(map.alternatives.some(a => Math.abs(a.bpm - 61.5) < 1), 'the half tempo is reported as an alternative');
  assert.ok(Math.abs(map.seconds - s.samples.length / s.rate) < .01);
  // Every verdict is decide() evidence in the record, with what it weighed.
  const lines = verdicts(map.record);
  assert.match(lines[0], /strongest period stands clear of the next.*strongest=123.*next=61.*clarity=.*chose tempo-measured/);
  assert.match(lines[1], /Low-band onsets mark one beat in 4.*chose bars-measured/);
  assert.match(lines[2], /largest rise in low and mid energy.*held=.*chose drop-measured/);
  assert.deepEqual(map.record.filter(e => e.type === 'stage').map(e => e.stageId), ['decode', 'onsets', 'choose-tempo', 'tempo-measured', 'track-beats', 'find-bars', 'bars-measured', 'measure-rise', 'find-drop', 'drop-measured']);
  assert.doesNotThrow(() => structuredClone(map.record));
});

test('another tempo, and a song with no drop: the beats follow it, and no drop is found (the record says why)', needs, async () => {
  const s = song({bpm: 92, count: 30, one: 0}), file = wavFile(path.join(tmp(), 'steady.wav'), s.samples, s.rate);
  const map = await beatMap(file);
  assert.ok(Math.abs(map.bpm - 92) <= 1, `bpm ${map.bpm}`);
  assert.ok(worst(map.beats, s.beats) <= .02 && worst(s.beats, map.beats) <= .02);
  assert.ok(worst(map.bars, s.bars) <= .02);
  assert.equal(map.drop, null);
  assert.match(verdicts(map.record)[2], /Nothing rises and holds after a quieter build: the song has no drop.*drop-none/);
});

test('a tempo and a drop given override the measured ones, and the record says they were given', needs, async () => {
  const s = song({bpm: 123, count: 24, dropAt: 8}), file = wavFile(path.join(tmp(), 'given.wav'), s.samples, s.rate);
  const map = await beatMap(file, {bpm: 123, drop: 4});
  assert.equal(map.bpm, 123);
  assert.equal(map.drop, 4);
  const lines = verdicts(map.record);
  assert.match(lines[0], /The tempo was given \(options\.bpm\).*chose tempo-given/);
  assert.match(lines[2], /The drop was given \(options\.drop\).*chose drop-given/);
  assert.ok(worst(map.beats, s.beats) <= .02);
});

test('the map answers where the beats are: nearestBeat, nextBeat, onBeat', async () => {
  const s = song({bpm: 120, count: 16, rate: 22050});
  const map = await beatMapOf(s.samples, 22050);
  const b = map.beats;
  assert.equal(map.nearestBeat(b[3] + .1), b[3]);
  assert.equal(map.nearestBeat(b[3] + .4), b[4]);
  assert.equal(map.nearestBeat(-5), b[0]);
  assert.equal(map.nextBeat(b[3]), b[4], 'the next beat is strictly after t');
  assert.equal(map.nextBeat(b[3] - .01), b[3]);
  assert.equal(map.nextBeat(b.at(-1) + 1), null);
  assert.equal(map.onBeat(b[5] + .04), true);
  assert.equal(map.onBeat(b[5] + .08), false);
  assert.equal(map.onBeat(b[5] + .08, .1), true);
  assert.ok(Object.isFrozen(map) && Object.isFrozen(map.beats));
  assert.equal(JSON.parse(JSON.stringify(map)).nearestBeat, undefined, 'the questions are not data');
});

test('a sound\'s peak: the moment of its loudest transient, within 5 ms', needs, async () => {
  const rate = 44100, x = new Float32Array(rate), noise = noiseFrom(3), hit = .3;
  for (let i = 0; i < x.length; i++) x[i] = .01 * noise();
  // A whoosh-like swell that rises into a hit at 0.3 s and rings out.
  for (let i = 0; i < .25 * rate; i++) x[Math.round((hit - .25) * rate) + i] += .1 * (i / (.25 * rate)) ** 2 * noise();
  for (let i = 0; i < .4 * rate; i++) { const a = i / rate; x[Math.round(hit * rate) + i] += .8 * Math.exp(-a * 30) * Math.sin(2 * Math.PI * 900 * a); }
  const file = wavFile(path.join(tmp(), 'hit.wav'), x, rate);
  assert.ok(Math.abs(peakOf(file) - hit) <= .005, `peak ${peakOf(file)}`);
  assert.ok(Math.abs(peakOfSamples(x, rate) - hit) <= .005);
  assert.equal(peakOfSamples(new Float32Array(100), rate), 0, 'silence peaks at its start');
});

test('options and inputs are checked, each refusal naming the fix', async () => {
  await assert.rejects(beatMap('x.wav', {tempo: 120}), /tempo is not an option; the options are bpm, drop, range, ffmpeg/);
  await assert.rejects(beatMap('x.wav', {bpm: 500}), /bpm is the song's tempo, a number 30–300/);
  await assert.rejects(beatMap('x.wav', {range: [180, 70]}), /range is the tempos preferred/);
  await assert.rejects(beatMap(path.join(tmp(), 'missing.wav')), /beatMap: there is no file at/);
  await assert.rejects(beatMapOf(new Float32Array(10), 44100), /must be at 22050 Hz, not 44100/);
  await assert.rejects(beatMapOf([0, 0], 22050), /Float32Array/);
  await assert.rejects(beatMapOf(new Float32Array(22050), 22050), /no repeating onsets to measure a tempo from; give options\.bpm/);
  assert.throws(() => peakOf(''), /peakOf: give the sound as a file path/);
});

test('the DSP: the FFT is exact on a pure tone, and the prior prefers 70–180 BPM', () => {
  const n = 64, re = Float64Array.from({length: n}, (_, i) => Math.cos(2 * Math.PI * 5 * i / n)), im = new Float64Array(n);
  fftOf(n)(re, im);
  assert.ok(Math.abs(re[5] - n / 2) < 1e-9 && Math.abs(re[n - 5] - n / 2) < 1e-9);
  assert.ok([...re].every((v, k) => k === 5 || k === n - 5 || Math.abs(v) < 1e-9));
  assert.throws(() => fftOf(48), /power of two/);
  assert.equal(tempoPrior(120), 1);
  assert.equal(tempoPrior(70), 1);
  assert.ok(tempoPrior(60) < 1 && tempoPrior(60) > tempoPrior(40));
  assert.ok(tempoPrior(240) < tempoPrior(200));
  assert.deepEqual(BEATS.range, [70, 180]);
});
