/**
 * The beat map of a song: its tempo, beats, bars and drop. A film that cuts on the beat needs to know where the beats
 * are, and an automatic beat grid is never to be trusted blindly — so the map is a footprintjs flowchart (decode →
 * onsets → tempo → beats → bars → drop) whose record says, for every verdict, what it weighed: the tempo chosen against
 * its alternatives, where the bars start, where the drop is and why. The signal work is plain functions (dsp.mjs); the
 * song is read through FFmpeg as mono samples, as render.mjs and finished.mjs read sound.
 */
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {flowChart, narrative, decide} from 'footprintjs';
import {QUIET, plainNarrative} from './record.mjs';
import {ANALYSIS, onsetStrength, tempoCandidates, lowPulse, levelEvidence, trackBeats, refineBeats, gridTempo, onsetSupport, downbeatScores, dropCandidate, peakOfSamples, firstAtOrAfter} from './dsp.mjs';

/**
 * The beat map's rules. range: the tempos preferred (BPM; others are weighed down, never refused). meter: beats in a bar
 * (a 4/4 guess). downbeat: the margin for the beat that starts a bar. drop: the dB a drop's rise must hold, both halves of
 * the window after it. window: the seconds of song either side a drop is judged over. fade, sudden: a rise that takes
 * longer than `fade` seconds to climb and makes less than `sudden` of itself at once is a fade-in, not a drop. onBeat: the
 * tolerance onBeat(t) takes by default (seconds). level: the tests a level of the beat passes to be certain (levelTests).
 */
export const BEATS = Object.freeze({range: Object.freeze([70, 180]), meter: 4, downbeat: .1, drop: 3, window: 4, fade: 2, sudden: .5, onBeat: .05,
  level: Object.freeze({phase: .8, kicked: .75, low: .5, steady: .5, fill: Object.freeze({2: .55, 3: .2, 4: .2}), margin: .3})});
/** The levels of the beat tried against the strongest tempo: every relative, a quarter to four times it. */
const LEVELS = Object.freeze([1 / 4, 1 / 3, 1 / 2, 1, 2, 3, 4]);

/**
 * The tests one level of the beat must pass to be certain — two pieces of evidence that must agree. When the song has a
 * low-band (kick) pulse: the kicks land on the level's beats (phase) and on nearly every one of them (kicked: the kicks
 * themselves fill the half-beats of the level below), and no kick falls between them (low fill, at halves, thirds and
 * quarters). Whatever the song: the beats carry its body evenly (steady), and no subdivision is filled — the half-beats
 * not as strong as the beats (hats on the eighths may sound there), the thirds and quarters not at all (a level whose
 * every quarter-beat sounds is too slow). With no low-band pulse, the level's own score must stand `margin` over every
 * other level tried. Returns the names of the tests it fails; none, and it passes.
 */
export function levelTests(level, all, rules = BEATS.level) {
  const fails = [], e = level.evidence, pulse = e.phase !== null;
  if (pulse) {
    if (!(e.phase >= rules.phase)) fails.push('phase');
    if (!(e.kicked >= rules.kicked)) fails.push('kicked');
    for (const k of [2, 3, 4]) if (e.fill[k].low >= rules.low) fails.push(`kick between (${k})`);
  }
  if (!(e.steady >= rules.steady)) fails.push('steady');
  for (const k of [2, 3, 4]) if (e.fill[k].full >= rules.fill[k]) fails.push(`filled (${k})`);
  if (!pulse && all.some(other => other !== level && other.score > level.score - rules.margin)) fails.push('margin');
  return fails;
}
const OPTION_KEYS = ['bpm', 'drop', 'range', 'ffmpeg'];
const ffmpegOf = given => given ?? process.env.FFMPEG_BIN ?? 'ffmpeg';

/** A song (any file FFmpeg reads) as mono samples at `rate`; a missing file or an FFmpeg that cannot read it refuses, naming the fix. */
function decodeAudio(file, {rate, ffmpeg, who}) {
  if (typeof file !== 'string' || !file.trim()) throw new Error(`${who}: give the sound as a file path (any audio FFmpeg reads), not ${JSON.stringify(file)}`);
  if (!existsSync(file)) throw new Error(`${who}: there is no file at ${file}`);
  const r = spawnSync(ffmpeg, ['-v', 'error', '-nostdin', '-i', file, '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-'], {maxBuffer: 2 ** 31 - 1});
  if (r.error) throw new Error(`${who}: FFmpeg (${ffmpeg}) could not run: ${r.error.message}; install FFmpeg, or name it with the ffmpeg option or FFMPEG_BIN`);
  if (r.status !== 0) throw new Error(`${who}: FFmpeg could not read ${path.basename(file)}: ${String(r.stderr).trim().slice(-300)}`);
  const bytes = r.stdout;
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length - (bytes.length % 4)));
}

/** The options, checked: an unknown key or a value out of range refuses, naming the fix. */
function readOptions(options) {
  if (options === undefined || options === null) options = {};
  if (typeof options !== 'object' || Array.isArray(options)) throw new Error('beatMap: options must be an object: {bpm?, drop?, range?, ffmpeg?}');
  for (const key of Object.keys(options)) if (!OPTION_KEYS.includes(key)) throw new Error(`beatMap: ${key} is not an option; the options are ${OPTION_KEYS.join(', ')}`);
  const {bpm = null, drop = null, range = BEATS.range, ffmpeg} = options;
  if (bpm !== null && !(typeof bpm === 'number' && bpm >= 30 && bpm <= 300)) throw new Error(`beatMap: bpm is the song's tempo, a number 30–300 (it overrides the measured one), not ${JSON.stringify(bpm)}`);
  if (drop !== null && !(typeof drop === 'number' && Number.isFinite(drop) && drop >= 0)) throw new Error(`beatMap: drop is the second the song drops (it overrides the measured one), not ${JSON.stringify(drop)}`);
  if (!(Array.isArray(range) && range.length === 2 && range.every(v => typeof v === 'number' && v >= 30 && v <= 300) && range[0] < range[1])) throw new Error(`beatMap: range is the tempos preferred, [low, high] BPM within 30–300, e.g. [70, 180], not ${JSON.stringify(range)}`);
  return {bpm, drop, range: [...range], ffmpeg: ffmpegOf(ffmpeg)};
}

const round = (v, places = 4) => +v.toFixed(places);
const argmax = list => list.reduce((best, v, i) => (v > list[best] ? i : best), 0);

/**
 * The flowchart: each stage writes small values into the record (counts, seconds, scores) and keeps the samples and
 * spectra outside it, as footprintjs expects (pipeline.mjs header). Returns the map's values and the record.
 */
async function analyse(read, source, options) {
  const o = readOptions(options), work = {};
  // Certain only when exactly one level of the beat passes every test (levelTests): the kick pulse and the in-betweens
  // agree on it. Anything else is tempo-close, the strongest taken, the alternatives listed.
  const one = s => s.passing.length === 1;
  const tempoRules = [
    {when: s => s.bpmGiven !== null, then: 'tempo-given', label: 'The tempo was given (options.bpm)'},
    {when: s => one(s) && s.passing[0] === s.strongest, then: 'tempo-measured', label: 'One level of the beat passes both tests — the kick pulse and the in-betweens agree — and it is the strongest'},
    {when: s => one(s) && s.passing[0] > s.strongest, then: 'tempo-faster', label: 'One level of the beat passes both tests — the kick pulse and the in-betweens agree — and it is faster than the strongest'},
    {when: s => one(s) && s.passing[0] < s.strongest, then: 'tempo-slower', label: 'One level of the beat passes both tests — the kick pulse and the in-betweens agree — and it is slower than the strongest'},
  ];
  const barRules = [{when: s => s.barClarity >= BEATS.downbeat, then: 'bars-measured', label: `Low-band onsets mark one beat in ${BEATS.meter}: the bars start there`}];
  const dropRules = [
    {when: s => s.dropGiven !== null, then: 'drop-given', label: 'The drop was given (options.drop)'},
    {when: s => (s.held ?? -Infinity) >= BEATS.drop && (s.ramp <= BEATS.fade || s.sudden >= BEATS.sudden), then: 'drop-measured', label: `The largest rise in low and mid energy that holds ${BEATS.drop} dB or more, after a quieter build, arriving at once`},
    {when: s => (s.held ?? -Infinity) >= BEATS.drop && s.ramp > BEATS.fade && s.sudden < BEATS.sudden, then: 'drop-fade', label: `The rise holds, but it is a fade-in: it climbs over more than ${BEATS.fade} s with no hit at its start, so the song has no drop`},
  ];
  /** The tempo's period in frames, and the BPM it is written as. */
  const useTempo = (s, bpm) => { work.period = 60 * work.onsets.frameRate / bpm; s.tempo = round(bpm, 2); };
  /** The bars: every `meter`-th beat from the phase (beats before it are a pickup). */
  const useBars = (s, phase) => { work.bars = work.beats.filter((_, i) => i >= phase && (i - phase) % BEATS.meter === 0); s.barStart = phase; s.bars = work.bars.length; };
  const chart = flowChart('decode', s => {
    work.samples = read(); work.rate = ANALYSIS.rate;
    if (!work.samples.length) throw new Error(`beatMap: ${source} has no sound to measure`);
    s.source = source; s.seconds = round(work.samples.length / work.rate, 3); s.rate = work.rate;
    if (o.drop !== null && o.drop > s.seconds) throw new Error(`beatMap: drop ${o.drop} s is past the end of ${source} (${s.seconds} s): give the second the song drops, inside it`);
  }, 'decode', 'The song read as mono samples')
    .addFunction('onsets', s => {
      work.onsets = onsetStrength(work.samples, work.rate);
      work.pulse = lowPulse(work.onsets.power, work.onsets.frameRate);
      s.frames = work.onsets.frames; s.frameRate = round(work.onsets.frameRate, 3);
    }, 'onsets', 'Onset strength: spectral flux, log-compressed, in three bands')
    .addDeciderFunction('choose-tempo', s => {
      work.candidates = tempoCandidates(work.onsets.flux.all, work.onsets.frameRate, {range: o.range, count: 8});
      if (!work.candidates.length && o.bpm === null) throw new Error(`beatMap: ${source} has no repeating onsets to measure a tempo from; give options.bpm to lay a grid anyway`);
      s.alternatives = work.candidates.map(({bpm, score}) => ({bpm, score}));
      s.bpmGiven = o.bpm; s.strongest = work.candidates[0]?.bpm ?? null;
      // Every level of the beat, a quarter to four times the strongest, tried against both pieces of evidence.
      work.levels = work.candidates.length ? levelsOf(work) : [];
      s.pulse = work.pulse.length;
      // Each level and the tests it fails, as words the record can show.
      s.levels = work.levels.map(l => `${l.bpm}: ${l.fails.length ? l.fails.join(', ') : 'passes'}`).join(' · ');
      s.passing = work.levels.filter(l => !l.fails.length).map(l => l.bpm);
      return decide(s, tempoRules, {branch: 'tempo-close', label: 'No level of the beat, or more than one, passes both tests: the strongest is taken, and the alternatives say what else it could be'});
    }, 'choose-tempo', 'The tempo: the onsets\' autocorrelation, weighed by the preferred range, every level of the beat tried against the kick pulse and the in-betweens')
    .addFunctionBranch('tempo-given', 'tempo-given', s => useTempo(s, o.bpm), 'the given tempo')
    .addFunctionBranch('tempo-measured', 'tempo-measured', s => useTempo(s, s.passing[0]), 'the measured tempo')
    .addFunctionBranch('tempo-faster', 'tempo-faster', s => useTempo(s, s.passing[0]), 'a faster level, the evidence agreeing')
    .addFunctionBranch('tempo-slower', 'tempo-slower', s => useTempo(s, s.passing[0]), 'a slower level, the evidence agreeing')
    .addFunctionBranch('tempo-close', 'tempo-close', s => useTempo(s, work.candidates[0].bpm), 'the strongest tempo, the others close')
    .end()
    .addFunction('track-beats', s => {
      const fr = work.onsets.frameRate, frames = trackBeats(work.onsets.flux.all, work.period, {frameRate: fr});
      work.beats = refineBeats(work.samples, work.rate, frames.map(f => f / fr)).map(t => round(t));
      // The BPM the grid keeps (a line through the beats: exact where the tempo is steady), unless one was given.
      work.bpm = o.bpm ?? round(gridTempo(work.beats, work.period / fr) ?? 60 * fr / work.period, 2);
      work.confidence = round(onsetSupport(work.onsets.flux.all, fr, work.beats), 2);
      s.beats = work.beats.length; s.bpm = work.bpm; s.confidence = work.confidence;
    }, 'track-beats', 'Beats by dynamic programming (Ellis 2007), each moved onto the transient it sits on')
    .addDeciderFunction('find-bars', s => {
      const scores = downbeatScores(work.onsets.flux.low, work.onsets.frameRate, work.beats, BEATS.meter), sorted = [...scores].sort((a, b) => b - a);
      s.downbeats = scores; s.strongestPhase = argmax(scores);
      s.barClarity = work.beats.length >= 2 * BEATS.meter ? round(1 - sorted[1], 3) : 0;
      return decide(s, barRules, {branch: 'bars-guessed', label: `No beat in ${BEATS.meter} stands out in the low band: the bars start on the first beat (a ${BEATS.meter}/4 guess)`});
    }, 'find-bars', `Bars: a ${BEATS.meter}/4 guess, the downbeat from low-band onsets`)
    .addFunctionBranch('bars-measured', 'bars-measured', s => useBars(s, s.strongestPhase), 'bars from the low band')
    .addFunctionBranch('bars-guessed', 'bars-guessed', s => useBars(s, 0), 'bars from the first beat')
    .end()
    .addFunction('measure-rise', s => {
      const {low, mid} = work.onsets.power, found = dropCandidate(Float32Array.from(low, (v, i) => v + mid[i]), work.onsets.frameRate, {window: BEATS.window});
      work.measuredDrop = found?.at ?? null;
      s.measuredDrop = found ? round(found.at, 3) : null; s.rise = found?.rise ?? null; s.held = found?.held ?? null; s.build = found?.build ?? null;
      s.ramp = found?.ramp ?? null; s.sudden = found?.sudden ?? null;
    }, 'measure-rise', `The largest rise in low and mid energy: ${BEATS.window} s after against ${BEATS.window} s before, each half after held; how long it climbs, how much at once`)
    .addDeciderFunction('find-drop', s => {
      s.dropGiven = o.drop;
      return decide(s, dropRules, {branch: 'drop-none', label: 'Nothing rises and holds after a quieter build: the song has no drop'});
    }, 'find-drop', 'The drop: the largest sustained rise in low and mid energy after a quieter build')
    .addFunctionBranch('drop-given', 'drop-given', s => { work.drop = o.drop; s.drop = o.drop; }, 'the given drop')
    .addFunctionBranch('drop-measured', 'drop-measured', s => {
      // A drop lands on a beat: the measured rise is moved onto the nearest one within a quarter of a beat.
      const near = nearestOf(work.beats, work.measuredDrop), quarter = work.period / work.onsets.frameRate / 4;
      work.drop = near !== null && Math.abs(near - work.measuredDrop) <= quarter ? near : round(work.measuredDrop);
      s.drop = work.drop; s.dropOnBeat = work.drop === near;
    }, 'the measured drop, on its beat')
    .addFunctionBranch('drop-fade', 'drop-fade', s => { work.drop = null; s.drop = null; s.fadeIn = work.measuredDrop === null ? null : round(work.measuredDrop, 3); }, 'a fade-in, not a drop')
    .addFunctionBranch('drop-none', 'drop-none', s => { work.drop = null; s.drop = null; }, 'no drop')
    .end();
  const trace = narrative();
  await chart.setLogger(QUIET).build().recorder(trace).run();
  return {bpm: work.bpm, beats: work.beats, bars: work.bars, drop: work.drop, confidence: work.confidence, levels: work.levels.map(({bpm, score, fails}) => ({bpm, score, fails})),
    alternatives: work.candidates.map(({bpm, score}) => ({bpm, score})), seconds: round(work.samples.length / work.rate, 3), record: plainNarrative(trace)};
}

/**
 * Every level of the beat a quarter to four times the strongest tempo (30–300 BPM), each tracked on its own, with its
 * evidence (dsp.mjs · levelEvidence), its score among the candidates (0 when it is none) and the tests it fails.
 */
function levelsOf(work) {
  const fr = work.onsets.frameRate, {low, mid} = work.onsets.flux, strongest = work.candidates[0].bpm;
  const bands = {all: work.onsets.flux.all, low, body: Float32Array.from(low, (v, i) => v + mid[i])};
  const levels = LEVELS.map(k => strongest * k).filter(bpm => bpm >= 30 && bpm <= 300).map(bpm => {
    const beats = trackBeats(bands.all, 60 * fr / bpm, {frameRate: fr}).map(f => f / fr);
    const score = work.candidates.find(c => Math.abs(c.bpm - bpm) <= .02 * bpm)?.score ?? 0;
    return {bpm: round(bpm, 2), score, evidence: levelEvidence(bands, fr, beats, work.pulse)};
  });
  return levels.map(l => ({...l, fails: levelTests(l, levels)}));
}

/** The beat nearest t in an ascending list (the earlier one on a tie), or null for none. */
function nearestOf(beats, t) {
  if (!beats.length) return null;
  const i = firstAtOrAfter(beats, t), after = beats[i], before = beats[i - 1];
  if (after === undefined) return before;
  if (before === undefined) return after;
  return t - before <= after - t ? before : after;
}

/** The map: its values, frozen, with the three questions a cut asks of it. */
function makeMap(values) {
  const beats = Object.freeze([...values.beats]);
  return Object.freeze({...values, beats, bars: Object.freeze([...values.bars]), alternatives: Object.freeze(values.alternatives.map(a => Object.freeze(a))),
    levels: Object.freeze(values.levels.map(l => Object.freeze({...l, fails: Object.freeze([...l.fails])}))),
    nearestBeat: t => nearestOf(beats, t),
    nextBeat: t => beats[firstAtOrAfter(beats, t + 1e-6)] ?? null,
    onBeat: (t, tolerance = BEATS.onBeat) => { const n = nearestOf(beats, t); return n !== null && Math.abs(n - t) <= tolerance; }});
}

/**
 * A song's beat map. Returns {bpm, beats: [s], bars: [s], drop: s | null, confidence, alternatives: [{bpm, score}],
 * seconds, record, nearestBeat(t), nextBeat(t), onBeat(t, tolerance?)}: beats and bars on the song's own clock; drop
 * null when nothing rises and holds; confidence the share of beats that sit on an onset; alternatives the tempos the
 * onsets also fit, best first (score relative to the best); record the flowchart's narrative, every verdict with its
 * evidence. options: {bpm?, drop?} override the measured ones; range [low, high] is the tempos preferred (70–180).
 */
export async function beatMap(audioFile, options = {}) {
  const o = readOptions(options);
  if (typeof audioFile === 'string' && audioFile.trim() && !existsSync(audioFile)) throw new Error(`beatMap: there is no file at ${audioFile}`);
  return makeMap(await analyse(() => decodeAudio(audioFile, {rate: ANALYSIS.rate, ffmpeg: o.ffmpeg, who: 'beatMap'}), path.basename(String(audioFile)), options));
}

/** The same map from mono samples already in hand (a Float32Array, -1..1), resampled to the analysis rate by the caller: `rate` must be 22050. */
export async function beatMapOf(samples, rate, options = {}) {
  if (!(samples instanceof Float32Array)) throw new Error('beatMapOf: samples must be a Float32Array of mono samples (-1..1)');
  if (rate !== ANALYSIS.rate) throw new Error(`beatMapOf: the samples must be at ${ANALYSIS.rate} Hz, not ${rate} (resample them, or give the file to beatMap)`);
  return makeMap(await analyse(() => samples, 'samples', options));
}

/**
 * The moment of a sound's loudest transient, in seconds from its start (to 0.1 ms): start the sound at
 * `eventTime - peakOf(file)` and its hit lands on the event. Read at 48 kHz through FFmpeg.
 */
export function peakOf(soundFile, {ffmpeg} = {}) {
  const rate = 48000;
  return round(peakOfSamples(decodeAudio(soundFile, {rate, ffmpeg: ffmpegOf(ffmpeg), who: 'peakOf'}), rate));
}

export {peakOfSamples};
