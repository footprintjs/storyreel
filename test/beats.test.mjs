// The beat map (beats.mjs) on songs made here, sample by sample, so every beat, bar and drop is known exactly: a click
// track at a known tempo with a kick on the one, a quiet build, then a drop. No downloaded audio. The map is a flowchart:
// its tempo, bars and drop are each decide() evidence in its record.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {beatMap, beatMapOf, peakOf, peakOfSamples, safeBeats, likelyTempi, beatMapText, levelTests, BEATS} from '../src/beats.mjs';
import {fftOf, tempoPrior, onsetStrength, lowPulse, backbeatPulse} from '../src/dsp.mjs';
import {song, rhythm, wavFile, noiseFrom} from './songs.mjs';
import {tempDir} from './tmp.mjs';

const ffmpeg = spawnSync(process.env.FFMPEG_BIN || 'ffmpeg', ['-version']).status === 0;
const needs = {skip: ffmpeg ? false : 'ffmpeg not on PATH'};
const tmp = () => tempDir('beats');

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
  assert.ok(map.record.every(e => !('rawValue' in e)), 'the record keeps no live values');
  assert.ok(Math.abs(map.seconds - s.samples.length / s.rate) < .01);
  // Every verdict is decide() evidence in the record, with what it weighed.
  const lines = verdicts(map.record), writes = map.record.filter(e => e.type === 'step').map(e => e.text);
  // A kick on every fourth click is no kick on every beat, and the half tempo scores near: the right tempo, said to be
  // close (a level claimed wrongly is what must never happen), and the record says what kept it from sure.
  assert.match(lines[0], /fell back to default "No level of the beat, or more than one, passes both tests.*tempo-close/);
  assert.equal(map.verdict, 'tempo-close'); assert.equal(map.sure, false);
  assert.ok(['kicked', 'margin'].some(name => map.levels.find(l => Math.abs(l.bpm - 123) < 1).fails.includes(name)), 'the tempo itself fails the kick test, or the margin');
  assert.ok(map.levels.every(l => l.fails.length), 'no level passes');
  assert.ok(writes.some(t => /Write strongest = 123/.test(t)) && writes.some(t => /Write levels = "30\.\d+: /.test(t)), 'the record says what it weighed');
  assert.match(lines[1], /Low-band onsets mark one beat in 4.*chose bars-measured/);
  assert.match(lines[2], /largest rise in low and mid energy.*arriving at once.*held=.*ramp=.*chose drop-measured/);
  assert.deepEqual(map.record.filter(e => e.type === 'stage').map(e => e.stageId), ['decode', 'onsets', 'choose-tempo', 'tempo-close', 'track-beats', 'find-bars', 'bars-measured', 'measure-rise', 'find-drop', 'drop-measured']);
  assert.doesNotThrow(() => structuredClone(map.record));
});

test('another tempo, and a song with no drop: the beats follow it, and no drop is found (the record says why)', needs, async () => {
  const s = song({bpm: 92, count: 30, one: 0}), file = wavFile(path.join(tmp(), 'steady.wav'), s.samples, s.rate);
  const map = await beatMap(file);
  assert.ok(Math.abs(map.bpm - 92) <= 1, `bpm ${map.bpm}`);
  assert.ok(worst(map.beats, s.beats) <= .02 && worst(s.beats, map.beats) <= .02);
  assert.ok(worst(map.bars, s.bars) <= .02);
  assert.equal(map.drop, null);
  assert.match(verdicts(map.record)[0], /No level of the beat, or more than one, passes both tests.*tempo-close/, 'a kick on one beat in four is not a kick on every beat');
  assert.match(verdicts(map.record)[2], /Nothing rises and holds after a quieter build: the song has no drop.*drop-none/);
});

test('a click track: at 92 BPM one level passes both tests and it is measured; at 123 and 140 its half scores too near to be sure; with a kick every fourth click, never sure', async () => {
  const plain = song({bpm: 92, count: 64, one: 9, rate: 22050}), map = await beatMapOf(plain.samples, 22050);
  assert.ok(Math.abs(map.bpm - 92) <= 1, `bpm ${map.bpm}`);
  assert.match(verdicts(map.record)[0], /One level of the beat passes both tests.*passing=.*strongest=92.*chose tempo-measured/);
  assert.deepEqual(map.levels.filter(l => !l.fails.length).map(l => Math.round(l.bpm)), [92]);
  assert.ok(worst(map.beats, plain.beats) <= .02 && worst(plain.beats, map.beats) <= .02);
  for (const bpm of [123, 140]) for (const one of [9, 1]) {
    const s = song({bpm, count: 64, one, rate: 22050}), heard = await beatMapOf(s.samples, 22050);
    assert.ok(Math.abs(heard.bpm - bpm) <= 1, `${bpm}: bpm ${heard.bpm}`);
    assert.match(verdicts(heard.record)[0], /tempo-close/);
    assert.ok(heard.levels.find(l => Math.abs(l.bpm - bpm) < 1).fails.includes(one === 9 ? 'margin' : 'kicked'), `${bpm}: what keeps it from sure`);
  }
});

for (const bpm of [150, 175, 210]) test(`${bpm} BPM, where the half (or a third) scores strongest: right, or an honest "close" that names it`, async () => {
  const s = song({bpm, count: 64, rate: 22050}), map = await beatMapOf(s.samples, 22050);
  const right = Math.abs(map.bpm - bpm) <= 1, offered = map.alternatives.some(a => Math.abs(a.bpm - bpm) <= 1);
  assert.ok(right || offered, `${map.bpm} BPM, and ${bpm} is not among ${JSON.stringify(map.alternatives)}`);
  if (right) {
    assert.ok(worst(map.beats, s.beats) <= .02 && worst(s.beats, map.beats) <= .02, 'every click a beat');
  } else {
    assert.match(verdicts(map.record)[0], /tempo-close/, 'a tempo at another level is never recorded as clear');
    assert.ok([2, 3].some(k => Math.abs(map.bpm * k - bpm) <= 2), `${map.bpm} is the same beat at another level`);
  }
});

test('the rhythms the last review found claimed wrongly: dembow at 95, 128, 150 and 172, loud sixteenth hats with the kick on one at 70 — now right, or said to be close', async () => {
  const cases = [...[95, 128, 150, 172].map(bpm => ({family: 'dembow', bpm})), {family: 'sixteenths, kick on one only', bpm: 70}];
  for (const {family, bpm} of cases) {
    const map = await beatMapOf(rhythm({bpm, family}).samples, 22050), verdict = verdicts(map.record)[0], right = Math.abs(map.bpm - bpm) <= Math.max(1, bpm * .01);
    assert.ok(right || /tempo-close/.test(verdict), `${family} at ${bpm}: ${map.bpm}, ${verdict}`);
    assert.ok(right || map.alternatives.some(a => Math.abs(a.bpm - bpm) <= Math.max(1, bpm * .01)), `${family} at ${bpm}: the right tempo among the alternatives`);
  }
});

test('two pulses as strong as each other (120 and 160 at once): "close", and both are among the alternatives', async () => {
  const a = song({bpm: 120, count: 40, one: 9, rate: 22050}), b = song({bpm: 160, count: 53, one: 9, rate: 22050});
  const mix = Float32Array.from({length: Math.min(a.samples.length, b.samples.length)}, (_, i) => a.samples[i] + b.samples[i]);
  const map = await beatMapOf(mix, 22050);
  assert.match(verdicts(map.record)[0], /fell back to default "No level of the beat, or more than one, passes both tests.*tempo-close/);
  for (const bpm of [120, 160]) assert.ok(map.alternatives.some(x => Math.abs(x.bpm - bpm) <= 1), `${bpm} among ${JSON.stringify(map.alternatives)}`);
});

for (const bpm of [120, 92]) test(`a pad held from the first sample under a click track at ${bpm} BPM: no beat at 0, every click found`, async () => {
  const s = song({bpm, count: 32, pad: .2, rate: 22050}), map = await beatMapOf(s.samples, 22050);
  assert.ok(Math.abs(map.bpm - bpm) <= 1, `bpm ${map.bpm}`);
  assert.ok(map.beats[0] > .2, `first beat ${map.beats[0]}: the pad's start is not an onset`);
  assert.equal(map.beats.length, s.beats.length);
  assert.ok(worst(map.beats, s.beats) <= .02 && worst(s.beats, map.beats) <= .02);
});

for (const lead of [.04, .05]) for (const pad of [0, .1]) test(`a first click ${lead * 1000} ms in (an encoder's delay)${pad ? ', over a pad' : ''}: found, with no beat at 0, at 92, 120 and 140 BPM`, async () => {
  for (const bpm of [92, 120, 140]) {
    const s = song({bpm, count: 24, lead, pad, one: 9, rate: 22050}), map = await beatMapOf(s.samples, 22050);
    assert.ok(Math.abs(map.bpm - bpm) <= 1, `${bpm}: bpm ${map.bpm}`);
    assert.ok(Math.abs(map.beats[0] - lead) <= .02, `${bpm}: first beat ${map.beats[0]}`);
    assert.equal(map.beats.length, s.beats.length, `${bpm}: every click a beat, no more`);
    assert.ok(worst(map.beats, s.beats) <= .02 && worst(s.beats, map.beats) <= .02);
  }
});

for (const intro of [12, 20]) test(`a ${intro} s quiet intro: the beats start with the music, not before it`, async () => {
  for (const pad of [0, .1]) {
    const s = song({bpm: 120, count: 20, lead: intro, pad, rate: 22050}), map = await beatMapOf(s.samples, 22050);
    assert.equal(map.beats.length, 20, `${pad ? 'over a pad' : 'over a noise floor'}: ${map.beats.length} beats, the first at ${map.beats[0]}`);
    assert.ok(worst(map.beats, s.beats) <= .02 && worst(s.beats, map.beats) <= .02);
    assert.ok(Math.abs(map.bpm - 120) <= 1);
  }
});

test('a song whose first click is in its first 16 ms: the first beat is found there, never before the song starts', async () => {
  const s = song({bpm: 120, count: 24, lead: .008, rate: 22050}), map = await beatMapOf(s.samples, 22050);
  assert.ok(Math.abs(map.beats[0] - .008) <= .02, `first beat ${map.beats[0]}`);
  assert.ok(map.beats.every(b => b >= 0));
  const padded = song({bpm: 120, count: 24, lead: .008, pad: .2, rate: 22050}), under = await beatMapOf(padded.samples, 22050);
  assert.ok(Math.abs(under.beats[0] - .008) <= .02 && worst(padded.beats, under.beats) <= .02, `under a pad too: first beat ${under.beats[0]}`);
  assert.ok(worst(map.beats, s.beats) <= .02 && worst(s.beats, map.beats) <= .02);
});

test('a slow fade-in is not a drop (the record says it is a fade-in); a step to the same level is', async () => {
  const quiet = .05, fade = song({bpm: 120, count: 44, dropAt: 0, lead: 0, rate: 22050, envelope: t => (t < 6 ? quiet : t < 12 ? quiet + (1 - quiet) * (t - 6) / 6 : 1)});
  const faded = await beatMapOf(fade.samples, 22050);
  assert.equal(faded.drop, null);
  assert.match(verdicts(faded.record)[2], /The rise holds, but it is a fade-in: it climbs over more than 2 s with no hit at its start.*ramp=.*sudden=.*chose drop-fade/);
  const step = song({bpm: 120, count: 44, dropAt: 0, lead: 0, rate: 22050, envelope: t => (t < 6 ? quiet : 1)});
  const stepped = await beatMapOf(step.samples, 22050);
  assert.ok(Math.abs(stepped.drop - 6) <= .25, `drop ${stepped.drop}`);
  assert.match(verdicts(stepped.record)[2], /arriving at once.*drop-measured/);
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
  await assert.rejects(beatMapOf(song({bpm: 120, count: 8, rate: 22050}).samples, 22050, {drop: 99}), /drop 99 s is past the end of samples \(5\.3 s\): give the second the song drops, inside it/);
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

test('a refusal of the options carries code BEAT_OPTIONS; a sound that cannot be read or measured does not', async () => {
  const code = async promise => { try { await promise; } catch (e) { return e.code ?? null; } return 'no error'; };
  assert.equal(await code(beatMap('x.wav', {tempo: 120})), 'BEAT_OPTIONS', 'an unknown key');
  assert.equal(await code(beatMap('x.wav', {bpm: 5})), 'BEAT_OPTIONS', 'a bpm out of range');
  assert.equal(await code(beatMapOf(song({bpm: 120, count: 8, rate: 22050}).samples, 22050, {drop: 99})), 'BEAT_OPTIONS', 'a drop past the end');
  assert.equal(await code(beatMapOf(new Float32Array(10), 44100)), 'BEAT_OPTIONS', 'samples at another rate');
  assert.equal(await code(beatMap(path.join(tmp(), 'missing.wav'))), null, 'a file that is not there');
  assert.equal(await code(beatMapOf(new Float32Array(22050), 22050)), null, 'a song with nothing to measure');
});

test('the kick pulse hears kicks, not bass notes: a kick dies away within 0.1 s, a bass note sustains', () => {
  const pulse = family => { const s = rhythm({bpm: 110, family}), o = onsetStrength(s.samples, 22050); return lowPulse(o, o.frameRate).length; };
  assert.equal(pulse('four on the floor, eighth hats'), 48, 'every kick');
  assert.ok(pulse('backbeat, eighth-note bass') <= 24, 'never a bass note: at most the 24 kicks');
  assert.equal(pulse('bass on quarters with chords'), 0, 'a bass alone is no kick pulse');
});

test('the rhythms of the sixth review: an eighth-note bass under a backbeat, eighth-note kicks — never double claimed as sure', async () => {
  for (const [family, bpm] of [['backbeat, eighth-note bass', 95], ['backbeat, eighth-note bass', 128], ['eighth-note kicks, snare on 2 and 4', 95], ['eighth-note kicks, snare on 2 and 4', 128]]) {
    const map = await beatMapOf(rhythm({bpm, family}).samples, 22050), right = Math.abs(map.bpm - bpm) <= Math.max(1, bpm * .01);
    assert.ok(right || !map.sure, `${family} at ${bpm}: ${map.bpm}, ${map.verdict}`);
  }
});

test('safeBeats: a sure map cuts on every beat; an unsure one only where every candidate agrees, and nowhere when one is unsure of its phase', () => {
  const grid = (period, n, from = 0) => Array.from({length: n}, (_, k) => +(from + k * period).toFixed(4));
  const map = (sure, alternatives) => ({sure, bpm: 120, beats: grid(.5, 24), alternatives});
  const half = {bpm: 60, score: .9, phaseDoubt: .4, beats: grid(1, 12)};
  assert.deepEqual(safeBeats(map(true, [])).beats, grid(.5, 24));
  assert.equal(safeBeats(map(true, [])).grid, 'every beat');
  const twice = safeBeats(map(false, [{bpm: 120, score: 1, phaseDoubt: .3, beats: grid(.5, 24)}, half]));
  assert.deepEqual(twice.beats, grid(1, 12), 'two tempi a level apart: the slower grid');
  assert.equal(twice.grid, 'shared'); assert.equal(twice.of, 24);
  const fourThree = safeBeats(map(false, [{bpm: 120, score: 1, phaseDoubt: .3, beats: grid(.5, 24)}, {bpm: 160, score: .9, phaseDoubt: .3, beats: grid(.375, 32)}]));
  assert.deepEqual(fourThree.beats, grid(1.5, 8), 'a 4:3 pair: the beats they meet on');
  const doubt = safeBeats(map(false, [{bpm: 120, score: 1, phaseDoubt: .3, beats: grid(.5, 24)}, {...half, phaseDoubt: .95}]));
  assert.deepEqual(doubt.beats, []); assert.match(doubt.grid, /unsure of its phase/); assert.deepEqual(doubt.unsure, [60]);
  assert.deepEqual(safeBeats({beats: [1, 2, 3]}).beats, [1, 2, 3], 'a hand-made map is taken as sure');
  // Of the beats every candidate shares, only those where the song hits: an echo's grid the candidates agree on is dropped.
  const heard = safeBeats({...map(false, [{bpm: 120, score: 1, phaseDoubt: .3, beats: grid(.5, 24)}, half]), hits: grid(1, 6)});
  assert.deepEqual(heard.beats, grid(1, 6)); assert.equal(heard.unheard, 6);
  assert.deepEqual(safeBeats({...map(true, []), hits: []}).beats, grid(.5, 24), 'a sure map cuts on every beat, as before');
});

const right = (map, bpm) => Math.abs(map.bpm - bpm) <= Math.max(1, bpm * .01);

test('a backbeat names the tactus: a kick (with its click) and a bass on every eighth under a snare on 2 and 4 — the double is never claimed', async () => {
  for (const bpm of [70, 95, 120, 150]) {
    const map = await beatMapOf(rhythm({bpm, family: 'kick and bass on the eighths, snare on 2 and 4'}).samples, 22050);
    assert.ok(right(map, bpm) || !map.sure, `${bpm}: ${map.bpm}, ${map.verdict}`);
    const double = map.levels.find(l => Math.abs(l.bpm - 2 * bpm) <= .02 * bpm);
    if (double) assert.ok(double.fails.includes('backbeat slower'), `${bpm}: the double fails on the backbeat (${double.fails})`);
  }
  // Four on the floor with claps on 2 and 4 keeps its tempo: the claps name the beat it already has.
  for (const family of ['four on the floor, club', 'four on the floor, humanised']) for (const bpm of [70, 95, 120, 150]) {
    const map = await beatMapOf(rhythm({bpm, family}).samples, 22050);
    assert.ok(right(map, bpm), `${family} at ${bpm}: ${map.bpm}, ${map.verdict}`);
  }
});

test('a backbeat rings: a kick\'s beater click on every eighth is not a snare on every eighth (backbeatPulse)', () => {
  const s = rhythm({bpm: 95, family: 'kick and bass on the eighths, snare on 2 and 4'}), o = onsetStrength(s.samples, 22050);
  assert.equal(backbeatPulse(o, o.frameRate).length, 24, 'the 24 snares of twelve bars, never the 96 clicks');
});

test('levelTests: a backbeat on every other beat of a slower level refuses every faster one; without it, the faster one passes', () => {
  const clean = {phase: 1, kicked: 1, steady: 1, backbeat: null, fill: {any: {full: 0}, 2: {full: 0, low: 0}, 3: {full: 0, low: 0}, 4: {full: 0, low: 0}}};
  const slow = {bpm: 70, score: .9, evidence: {...clean, backbeat: {phase: 1, covered: .5, alternate: 1}}}, fast = {bpm: 140, score: 1, evidence: clean};
  assert.deepEqual(levelTests(fast, [slow, fast]), ['backbeat slower']);
  assert.deepEqual(levelTests(slow, [slow, fast]), [], 'the level the backbeat names may pass');
  assert.deepEqual(levelTests(fast, [{...slow, evidence: clean}, fast]), [], 'no backbeat: nothing to refuse it on');
  assert.deepEqual(levelTests(fast, [{...slow, evidence: {...clean, backbeat: {phase: 1, covered: 1, alternate: 0}}}, fast]), [], 'a snare on every beat names no slower level');
});

test('a dotted-eighth delay: no cut on an echo the candidates agree on, nor on its ring-out past the song\'s end (70, 110, 140)', async () => {
  let rungOut = 0;
  for (const bpm of [70, 110, 140]) {
    const s = rhythm({bpm, family: 'a dotted-eighth delay on the rim and snare'}), map = await beatMapOf(s.samples, 22050);
    assert.deepEqual(safeBeats(map).beats.filter(t => !s.beats.some(u => Math.abs(u - t) <= .05)), [], `${bpm}: ${map.verdict}, no cut off a true beat`);
    // A sure map cuts on every beat, so it keeps none in the echo's ring-out; an unsure one may keep one there, never cut on.
    if (map.sure) assert.deepEqual(map.beats.filter(t => t > s.beats.at(-1) + .05), [], `${bpm}: no beat after the last true beat`);
    // The echo rings on past the song's end, and the tracker carried beats into it: the record says they were dropped.
    if (map.record.some(e => /ringOut = [1-9]/.test(e.text ?? ''))) rungOut++;
  }
  assert.ok(rungOut >= 1, 'the ring-out rule is what keeps the echo out');
});

test('a song\'s ring-out holds no beat, sure map or not: an 808 sub sounding on past the last hit, a dub echo on the snare (70, 85)', async () => {
  for (const family of ['808 sub on the quarters, snare on 2 and 4', 'backbeat, a dub echo on the snare']) for (const bpm of [70, 85]) {
    const s = rhythm({bpm, family}), map = await beatMapOf(s.samples, 22050), last = s.beats.at(-1);
    assert.deepEqual(map.beats.filter(t => t > last + .05), [], `${family} at ${bpm} (${map.verdict}): no beat after the last true beat, ${last.toFixed(3)} s`);
    assert.deepEqual(safeBeats(map).beats.filter(t => !s.beats.some(u => Math.abs(u - t) <= .05)), [], `${family} at ${bpm}: no cut off a true beat`);
    if (family.startsWith('808') && bpm === 85) assert.ok(map.sure, 'the 808 at 85 is a sure map: the rule holds for sure maps too');
  }
});

test('likelyTempi and beatMapText: the tempi an unsure map could be, and the map as text a person settles it from', () => {
  const unsure = {sure: false, verdict: 'tempo-close', bpm: 140.2, seconds: 30, beats: [1, 2], drop: null,
    alternatives: [{bpm: 140.2, score: 1}, {bpm: 70.1, score: .8}, {bpm: 46.7, score: .3}], levels: [{bpm: 70.1, score: .8, fails: ['kicked']}, {bpm: 140.2, score: 1, fails: ['half-time', 'backbeat slower']}]};
  assert.deepEqual(likelyTempi(unsure), [140, 70], `scores of ${BEATS.likely} or more`);
  assert.deepEqual(likelyTempi({sure: true, bpm: 119.6}), [120]);
  const text = beatMapText(unsure, {source: 'theme.mp3'});
  assert.match(text, /^theme\.mp3 · 30 s · tempo-close \(unsure/);
  assert.match(text, /140\.20 BPM {2}1\.00\n {4}70\.10 BPM {2}0\.80\n {4}46\.70 BPM {2}0\.30 {2}\(unlikely\)/);
  assert.match(text, /140\.20 BPM {2}half-time, backbeat slower/);
  assert.match(text, /one of 140, 70 BPM; the map is then sure/);
});

test('storyreel beats <song>: the verdict, the candidate tempi with their scores, why each level is unsure; --help lists it', needs, () => {
  const s = rhythm({bpm: 95, family: 'kick and bass on the eighths, snare on 2 and 4'}), file = wavFile(path.join(tmp(), 'song.wav'), s.samples, s.rate);
  const cli = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src', 'cli.mjs'), run = (...args) => spawnSync(process.execPath, [cli, ...args], {encoding: 'utf8'});
  const read = run('beats', file);
  assert.equal(read.status, 0, read.stderr);
  assert.match(read.stdout, /^song\.wav · [\d.]+ s · tempo-\w+ \((sure|unsure)/);
  assert.match(read.stdout, /candidate tempi \(score against the strongest\):\n {2,}[\d.]+ BPM {2}1\.00/);
  assert.match(read.stdout, /levels of the beat tried/);
  const given = run('beats', file, '--bpm', '95');
  assert.match(given.stdout, /tempo-given \(sure/);
  assert.equal(run('beats', file, '--tempo', '95').status, 2, 'an unknown flag');
  const bare = run('beats', file, '--bpm');
  assert.equal(bare.status, 2, 'a --bpm with no number'); assert.match(bare.stderr, /--bpm needs a number/);
  assert.match(run('beats', file, '--bpm', 'fast').stderr, /--bpm needs a number, the tempo you hear \(e\.g\. --bpm 95\), not "fast"/);
  assert.equal(run('beats').status, 2, 'no song');
  assert.equal(run('beats', path.join(tmp(), 'missing.wav')).status, 1, 'a song that is not there');
  assert.match(run('--help').stdout, /beats {4}<song> — the song's tempo/);
});

