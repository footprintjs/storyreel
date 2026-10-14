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
import {spawned, startError, ffprobeBeside} from './spawned.mjs';
import {ANALYSIS, onsetStrength, tempoCandidates, sameTempo, periodicity, onsetPeak, lowPulse, backbeatPulse, levelEvidence, hitsOf, trackBeats, refineBeats, gridTempo, onsetSupport, downbeatScores, dropCandidate, peakOfSamples, firstAtOrAfter} from './dsp.mjs';

/**
 * The beat map's rules. range: the tempos preferred (BPM; others are weighed down, never refused). meter: beats in a bar
 * (a 4/4 guess). downbeat: the margin for the beat that starts a bar. drop: the dB a drop's rise must hold, both halves of
 * the window after it. window: the seconds of song either side a drop is judged over. fade, sudden: a rise that takes
 * longer than `fade` seconds to climb and makes less than `sudden` of itself at once is a fade-in, not a drop. onBeat: the
 * tolerance onBeat(t) takes by default (seconds). steady: the floors under which a sound has no steady beat to measure
 * (its onsets' periodicity at the strongest tempo, a `swell` seconds' moving average taken out first; their strength,
 * onsetPeak) — speech, noise, music with a free tempo, a held tone or pad. likely: the score a candidate tempo needs to be named as one to settle an
 * unsure map with (likelyTempi). safe: what an unsure map lets a film cut on (safeBeats). level: the tests a level of the
 * beat passes to be certain (levelTests).
 */
export const BEATS = Object.freeze({range: Object.freeze([70, 180]), meter: 4, downbeat: .1, drop: 3, window: 4, fade: 2, sudden: .5, onBeat: .05, likely: .5,
  steady: Object.freeze({periodicity: .15, onsets: .6, swell: .5}),
  safe: Object.freeze({tolerance: .035, phaseDoubt: .9, hit: .6, local: .3, near: 4, quiet: .1}),
  level: Object.freeze({pulse: 8, phase: .8, kicked: .75, low: .5, steady: .5, fill: Object.freeze({2: .55, 3: .2, 4: .2, any: .55}), halfTime: .375, margin: .3})});
/** The levels of the beat tried against the strongest tempo: every relative, a quarter to four times it. */
const LEVELS = Object.freeze([1 / 4, 1 / 3, 1 / 2, 1, 2, 3, 4]);

/** The kick tests: the kicks land on the level's beats (phase), on nearly every one (kicked), and never between them. */
function kickTests(e, rules) {
  if (e.phase === null) return [];
  const fails = [];
  if (!(e.phase >= rules.phase)) fails.push('phase');
  if (!(e.kicked >= rules.kicked)) fails.push('kicked');
  for (const k of [2, 3, 4]) if (e.fill[k].low >= rules.low) fails.push(`kick between (${k})`);
  return fails;
}

/**
 * The in-between tests: the beats carry the song's body evenly (steady); no subdivision is filled — the half-beats not
 * as strong as the beats (hats on the eighths may sound there), the thirds and quarters not at all, and nothing anywhere
 * between the beats as strong as the half-beats may be (a layer off the grid: sixteenths against a beat of five); and a
 * backbeat, when the song has one, is not on every fourth beat (half time: the level below would hear it on every other
 * beat, as a backbeat, and the two cannot be told apart).
 */
function betweenTests(e, rules) {
  const fails = [];
  if (!(e.steady >= rules.steady)) fails.push('steady');
  for (const k of [2, 3, 4]) if (e.fill[k].full >= rules.fill[k]) fails.push(`filled (${k})`);
  if (e.fill.any.full >= rules.fill.any) fails.push('filled (between)');
  if (e.backbeat && e.backbeat.phase >= rules.phase && e.backbeat.covered <= rules.halfTime) fails.push('half-time');
  return fails;
}

/**
 * A backbeat on every other beat of a level: the snare or the clap lands on its beats (phase), on about half of them
 * (covered, between `halfTime` and 1 − `halfTime`), the next one two beats on (alternate). That level is the tactus the
 * backbeat names: 2 and 4 of a bar of four.
 */
export const backbeatEveryOther = (e, rules = BEATS.level) => Boolean(e?.backbeat && e.backbeat.phase >= rules.phase && e.backbeat.covered >= rules.halfTime
  && e.backbeat.covered <= 1 - rules.halfTime && e.backbeat.alternate >= rules.phase);

/** A level whose beats are the backbeat: it lands on them (phase), and on nearly every one (covered, 1 − `halfTime`). */
const onTheBackbeat = (e, rules) => Boolean(e?.backbeat && e.backbeat.phase >= rules.phase && e.backbeat.covered >= 1 - rules.halfTime);

/**
 * The tests one level of the beat must pass to be certain — two pieces of evidence that must agree: the kick pulse
 * (kickTests, when the song has one) and the in-betweens (betweenTests). Two rules read the other levels tried: with no
 * kick pulse, the level's own score must stand `margin` over every other; and a backbeat names the tactus — when it is
 * on every other beat of one level (backbeatEveryOther), no other can be certain: not a faster one, however steady its
 * own beats (a kick and a bass on every eighth fill every beat of the double: 'backbeat slower'), nor a slower one
 * whose beats are the backbeat alone (onTheBackbeat: an 808 on the quarters under a snare on 2 and 4, heard at half the
 * tempo on the snares: 'backbeat faster'). Returns the names of the tests it fails; none, and it passes.
 */
export function levelTests(level, all, rules = BEATS.level) {
  const e = level.evidence, fails = [...kickTests(e, rules), ...betweenTests(e, rules)];
  if (e.phase === null && all.some(other => other !== level && other.score > level.score - rules.margin)) fails.push('margin');
  const named = all.filter(other => other !== level && backbeatEveryOther(other.evidence, rules));
  if (named.some(other => other.bpm < level.bpm)) fails.push('backbeat slower');
  if (named.some(other => other.bpm > level.bpm) && onTheBackbeat(e, rules)) fails.push('backbeat faster');
  return fails;
}

/**
 * A level refused by the kicks alone: it fails only because kicks fall between its beats (and so off them), while its
 * in-betweens, heard with the kicks taken out (`masked`), pass. When some level is, the kick pulse alone decided against
 * it — one piece of evidence, not two — and no other level may be certain (an eighth-note bass heard as kicks makes the
 * true beat look too slow).
 */
export function refusedByKicksAlone(level, rules = BEATS.level) {
  const kicks = kickTests(level.evidence, rules);
  return kicks.length > 0 && kicks.every(name => name === 'phase' || name.startsWith('kick between')) && betweenTests(level.masked, rules).length === 0;
}
const OPTION_KEYS = ['bpm', 'drop', 'range', 'ffmpeg'];
const ffmpegOf = given => given ?? process.env.FFMPEG_BIN ?? 'ffmpeg';

/** The file given, checked: a path to something there (any file FFmpeg reads). */
function requireSoundFile(file, who) {
  if (typeof file !== 'string' || !file.trim()) throw new Error(`${who}: give the sound as a file path (any audio FFmpeg reads), not ${JSON.stringify(file)}`);
  if (!existsSync(file)) throw new Error(`${who}: there is no file at ${file}`);
}
const decodeArgs = (file, rate) => ['-v', 'error', '-nostdin', '-i', file, '-vn', '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-'];
const cannotRun = (who, ffmpeg, error) => new Error(`${who}: FFmpeg (${ffmpeg}) could not run: ${startError(ffmpeg, error)}; install FFmpeg, or name it with the ffmpeg option or FFMPEG_BIN`);

/** A short sound (a sound effect) as mono samples at `rate`, read at once (peakOf); the samples are a view, not a copy. */
function decodeAudio(file, {rate, ffmpeg, who}) {
  requireSoundFile(file, who);
  const r = spawnSync(ffmpeg, decodeArgs(file, rate), {maxBuffer: 2 ** 31 - 1});
  if (r.error) throw cannotRun(who, ffmpeg, r.error);
  if (r.status !== 0) throw new Error(`${who}: FFmpeg could not read ${path.basename(file)}: ${String(r.stderr).trim().slice(-300)}`);
  const bytes = r.stdout, n = Math.floor(bytes.length / 4);
  return bytes.byteOffset % 4 === 0 ? new Float32Array(bytes.buffer, bytes.byteOffset, n) : new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + 4 * n));
}

/** The length of a file's sound, from ffprobe beside the FFmpeg (null when it cannot say). */
function soundSeconds(file, ffmpeg) {
  const r = spawnSync(ffprobeBeside(ffmpeg), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {encoding: 'utf8'});
  const seconds = Number(String(r.stdout).trim());
  return r.status === 0 && Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/**
 * A song — or a video's sound: any file FFmpeg reads — as mono samples at `rate`, streamed from FFmpeg straight into
 * one Float32Array made for its length (ffprobe's), so an hour of sound is held once (318 MB at 22050 Hz), never as a
 * pipe's buffer and then its copy. A length it cannot know, or one longer than said, grows the array (the rare copy).
 */
async function streamAudio(file, {rate, ffmpeg, who}) {
  requireSoundFile(file, who);
  const said = soundSeconds(file, ffmpeg);
  let samples = new Float32Array(Math.ceil(((said ?? 60) + 1) * rate)), bytes = new Uint8Array(samples.buffer), filled = 0, err = '';
  const {child, finished} = spawned(ffmpeg, decodeArgs(file, rate), {stdio: ['ignore', 'pipe', 'pipe']});
  child.stderr.on('data', b => { err = (err + b).slice(-2000); });
  for await (const chunk of child.stdout) {
    if (filled + chunk.length > bytes.length) {
      const grown = new Float32Array(Math.ceil((filled + chunk.length) / 4 * 1.5)); new Uint8Array(grown.buffer).set(bytes.subarray(0, filled));
      samples = grown; bytes = new Uint8Array(grown.buffer);
    }
    bytes.set(chunk, filled); filled += chunk.length;
  }
  let code;
  try { code = await finished; } catch (e) { throw cannotRun(who, ffmpeg, e); }
  if (code !== 0) throw new Error(`${who}: FFmpeg could not read ${path.basename(file)}: ${err.trim().slice(-300)}`);
  return samples.subarray(0, Math.floor(filled / 4));
}

/**
 * A refusal of the caller's options (not of the sound): it carries `code: 'BEAT_OPTIONS'`, so a caller can tell "you asked
 * for something wrong" from "the song could not be read or measured", which carry no code.
 */
const optionsError = message => Object.assign(new Error(message), {code: 'BEAT_OPTIONS'});

/** The options, checked: an unknown key or a value out of range refuses, naming the fix (optionsError). */
function readOptions(options) {
  if (options === undefined || options === null) options = {};
  if (typeof options !== 'object' || Array.isArray(options)) throw optionsError('beatMap: options must be an object: {bpm?, drop?, range?, ffmpeg?}');
  for (const key of Object.keys(options)) if (!OPTION_KEYS.includes(key)) throw optionsError(`beatMap: ${key} is not an option; the options are ${OPTION_KEYS.join(', ')}`);
  const {bpm = null, drop = null, range = BEATS.range, ffmpeg} = options;
  if (bpm !== null && !(typeof bpm === 'number' && bpm >= 30 && bpm <= 300)) throw optionsError(`beatMap: bpm is the song's tempo, a number 30–300 (it overrides the measured one), not ${JSON.stringify(bpm)}`);
  if (drop !== null && !(typeof drop === 'number' && Number.isFinite(drop) && drop >= 0)) throw optionsError(`beatMap: drop is the second the song drops (it overrides the measured one), not ${JSON.stringify(drop)}`);
  if (!(Array.isArray(range) && range.length === 2 && range.every(v => typeof v === 'number' && v >= 30 && v <= 300) && range[0] < range[1])) throw optionsError(`beatMap: range is the tempos preferred, [low, high] BPM within 30–300, e.g. [70, 180], not ${JSON.stringify(range)}`);
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
  // Certain only when exactly one level passes and no other was refused by the kicks alone (refusedByKicksAlone).
  const one = s => s.passing.length === 1 && s.kicksAlone.length === 0;
  const tempoRules = [
    {when: s => s.bpmGiven !== null, then: 'tempo-given', label: 'The tempo was given (options.bpm)'},
    {when: s => one(s) && s.passing[0] === s.strongest, then: 'tempo-measured', label: 'One level of the beat passes both tests — the kick pulse and the in-betweens agree, and no other level was refused by the kicks alone — and it is the strongest'},
    {when: s => one(s) && s.passing[0] > s.strongest, then: 'tempo-faster', label: 'One level of the beat passes both tests — the kick pulse and the in-betweens agree, and no other level was refused by the kicks alone — and it is faster than the strongest'},
    {when: s => one(s) && s.passing[0] < s.strongest, then: 'tempo-slower', label: 'One level of the beat passes both tests — the kick pulse and the in-betweens agree, and no other level was refused by the kicks alone — and it is slower than the strongest'},
  ];
  const barRules = [{when: s => s.barClarity >= BEATS.downbeat, then: 'bars-measured', label: `Low-band onsets mark one beat in ${BEATS.meter}: the bars start there`}];
  const dropRules = [
    {when: s => s.dropGiven !== null, then: 'drop-given', label: 'The drop was given (options.drop)'},
    {when: s => (s.held ?? -Infinity) >= BEATS.drop && (s.ramp <= BEATS.fade || s.sudden >= BEATS.sudden), then: 'drop-measured', label: `The largest rise in low and mid energy that holds ${BEATS.drop} dB or more, after a quieter build, arriving at once`},
    {when: s => (s.held ?? -Infinity) >= BEATS.drop && s.ramp > BEATS.fade && s.sudden < BEATS.sudden, then: 'drop-fade', label: `The rise holds, but it is a fade-in: it climbs over more than ${BEATS.fade} s with no hit at its start, so the song has no drop`},
  ];
  /** The tempo's period in frames, and the BPM it is written as. */
  const useTempo = (s, bpm, verdict) => { work.period = 60 * work.onsets.frameRate / bpm; work.verdict = verdict; s.tempo = round(bpm, 2); };
  /** The bars: every `meter`-th beat from the phase (beats before it are a pickup). */
  const useBars = (s, phase) => { work.bars = work.beats.filter((_, i) => i >= phase && (i - phase) % BEATS.meter === 0); s.barStart = phase; s.bars = work.bars.length; };
  const chart = flowChart('decode', async s => {
    work.samples = await read(); work.rate = ANALYSIS.rate;
    if (!work.samples.length) throw new Error(`beatMap: ${source} has no sound to measure`);
    work.seconds = round(work.samples.length / work.rate, 3); s.source = source; s.seconds = work.seconds; s.rate = work.rate;
    if (o.drop !== null && o.drop > s.seconds) throw optionsError(`beatMap: drop ${o.drop} s is past the end of ${source} (${s.seconds} s): give the second the song drops, inside it`);
  }, 'decode', 'The song read as mono samples')
    .addFunction('onsets', s => {
      work.onsets = onsetStrength(work.samples, work.rate);
      work.pulse = lowPulse(work.onsets, work.onsets.frameRate); work.backbeat = backbeatPulse(work.onsets, work.onsets.frameRate);
      s.frames = work.onsets.frames; s.frameRate = round(work.onsets.frameRate, 3);
    }, 'onsets', 'Onset strength: spectral flux, log-compressed, in three bands')
    .addDeciderFunction('choose-tempo', s => {
      work.candidates = tempoCandidates(work.onsets.flux.all, work.onsets.frameRate, {range: o.range, count: 8});
      if (!work.candidates.length && o.bpm === null) throw new Error(`beatMap: ${source} has no repeating onsets to measure a tempo from; give options.bpm to lay a grid anyway`);
      // A steady beat, or none: onsets that come again a period on (periodicity), and onsets at all (onsetPeak). Speech has
      // onsets with no period; a held tone or pad has none to speak of. Neither has a beat to measure, unless one is given.
      s.periodicity = work.candidates.length ? round(periodicity(work.onsets.flux.all, work.candidates[0].period, {reach: Math.round(BEATS.steady.swell * work.onsets.frameRate)}), 3) : 0;
      s.onsets = round(onsetPeak(work.onsets.flux.all), 3);
      if (o.bpm === null && (s.periodicity < BEATS.steady.periodicity || s.onsets < BEATS.steady.onsets)) {
        throw new Error(`beatMap: ${source} has no steady beat: ${s.onsets < BEATS.steady.onsets ? `its onsets are faint (${s.onsets}, under ${BEATS.steady.onsets}: a held tone or pad)` : `its onsets keep no steady period (periodicity ${s.periodicity}, under ${BEATS.steady.periodicity}: speech, noise, or music with a free tempo)`}; give options.bpm to lay a grid anyway`);
      }
      s.alternatives = work.candidates.map(({bpm, score}) => ({bpm, score}));
      s.bpmGiven = o.bpm; s.strongest = work.candidates[0]?.bpm ?? null;
      // Every level of the beat, a quarter to four times the strongest, tried against both pieces of evidence.
      work.levels = work.candidates.length ? levelsOf(work) : [];
      s.pulse = work.pulse.length;
      // Each level and the tests it fails, as words the record can show.
      s.levels = work.levels.map(l => `${l.bpm}: ${l.fails.length ? l.fails.join(', ') : 'passes'}`).join(' · ');
      s.passing = work.levels.filter(l => !l.fails.length).map(l => l.bpm);
      s.kicksAlone = work.levels.filter(l => l.kicksAlone).map(l => l.bpm);
      return decide(s, tempoRules, {branch: 'tempo-close', label: 'No level of the beat, or more than one, passes both tests, or one was refused by the kicks alone: the strongest is taken, and the alternatives say what else it could be'});
    }, 'choose-tempo', 'The tempo: the onsets\' autocorrelation, weighed by the preferred range, every level of the beat tried against the kick pulse and the in-betweens')
    .addFunctionBranch('tempo-given', 'tempo-given', s => useTempo(s, o.bpm, 'tempo-given'), 'the given tempo')
    .addFunctionBranch('tempo-measured', 'tempo-measured', s => useTempo(s, s.passing[0], 'tempo-measured'), 'the measured tempo')
    .addFunctionBranch('tempo-faster', 'tempo-faster', s => useTempo(s, s.passing[0], 'tempo-faster'), 'a faster level, the evidence agreeing')
    .addFunctionBranch('tempo-slower', 'tempo-slower', s => useTempo(s, s.passing[0], 'tempo-slower'), 'a slower level, the evidence agreeing')
    .addFunctionBranch('tempo-close', 'tempo-close', s => useTempo(s, work.candidates[0].bpm, 'tempo-close'), 'the strongest tempo, the others close')
    .end()
    .addFunction('track-beats', s => {
      const fr = work.onsets.frameRate, frames = trackBeats(work.onsets.flux.all, work.period, {frameRate: fr});
      const tracked = refineBeats(work.samples, work.rate, frames.map(f => f / fr)).map(t => round(t));
      // Where the song actually hits (dsp.mjs · hitsOf): an unsure map's film cuts only on a shared beat that has one; and
      // no map, sure or not, keeps a beat after the song's last hit — its ring-out (an 808's tail, an echo) is not a beat.
      work.hits = hitsOf(work.onsets, fr, tracked, work.period / fr, {share: BEATS.safe.hit, local: BEATS.safe.local, near: BEATS.safe.near, quiet: BEATS.safe.quiet}).map(t => round(t));
      const lastHit = work.hits.at(-1) ?? Infinity;
      work.beats = tracked.filter(t => t <= lastHit + BEATS.safe.tolerance); work.ringOut = tracked.length - work.beats.length;
      // The BPM the grid keeps (a line through the beats: exact where the tempo is steady), unless one was given.
      work.bpm = o.bpm ?? round(gridTempo(work.beats, work.period / fr) ?? 60 * fr / work.period, 2);
      work.confidence = round(onsetSupport(work.onsets.flux.all, fr, work.beats), 2);
      // Every listed candidate's own grid, tracked and refined the same way: when the map is unsure, a film cuts only
      // where they all agree (safeBeats).
      work.grids = work.candidates.map(c => (Math.abs(60 * fr / c.period - 60 * fr / work.period) < 1e-6 ? work.beats
        : refineBeats(work.samples, work.rate, trackBeats(work.onsets.flux.all, c.period, {frameRate: fr}).map(f => f / fr)).map(t => round(t))));
      // How sure each grid is of its phase: the onsets half a beat later, against those on its beats (near 1: it could as
      // well sit on the and).
      const at = t => { const f = Math.round(t * fr); let m = 0; for (let k = f - 2; k <= f + 2; k++) m = Math.max(m, work.onsets.flux.all[k] ?? 0); return m; };
      const mean = v => v.reduce((a, x) => a + x, 0) / Math.max(1, v.length);
      const doubtOf = g => (g.length < 4 ? 1 : round(mean(g.slice(1).map((t, i) => at((t + g[i]) / 2))) / Math.max(1e-9, mean(g.map(at))), 3));
      work.phaseDoubt = work.grids.map(doubtOf);
      // A given tempo sets the tempo, not the phase: the phase is the onsets' (the tracker's), and when the half-beats are
      // heard as strongly as the beats the map is not sure of it — safeBeats then keeps no beat.
      if (o.bpm !== null) { work.givenDoubt = doubtOf(work.beats); work.phaseUnsure = work.givenDoubt >= BEATS.safe.phaseDoubt; s.phaseDoubt = work.givenDoubt; }
      s.beats = work.beats.length; s.bpm = work.bpm; s.confidence = work.confidence; s.grids = work.grids.length; s.hits = work.hits.length;
      if (work.ringOut) s.ringOut = work.ringOut;
      work.samples = null;   // the rest of the map reads the spectra: an hour of samples is let go here
    }, 'track-beats', 'Beats by dynamic programming (Ellis 2007), each moved onto the transient it sits on; every candidate\'s grid beside them')
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
  const alternatives = work.phaseUnsure ? [{bpm: work.bpm, score: 1, phaseDoubt: work.givenDoubt, beats: work.beats}]
    : work.candidates.map(({bpm, score}, i) => ({bpm, score, phaseDoubt: work.phaseDoubt[i], beats: work.grids[i]}));
  return {bpm: work.bpm, verdict: work.verdict, sure: work.verdict !== 'tempo-close' && !work.phaseUnsure, ...(work.phaseUnsure ? {phase: 'unsure'} : {}),
    beats: work.beats, hits: work.hits, bars: work.bars, drop: work.drop, confidence: work.confidence,
    levels: work.levels.map(({bpm, score, fails, kicksAlone}) => ({bpm, score, fails, ...(kicksAlone ? {kicksAlone} : {})})),
    alternatives, seconds: work.seconds, record: plainNarrative(trace)};
}

/**
 * Every level of the beat a quarter to four times the strongest tempo (30–300 BPM), each tracked on its own, with its
 * evidence (dsp.mjs · levelEvidence) — once as heard, once with the kicks taken out (where a kick lands, only the mid
 * and high bands) — its score among the candidates (0 when it is none), the tests it fails, and whether the kicks alone
 * refused it. A kick pulse or a backbeat of fewer than BEATS.level.pulse hits is none.
 */
function levelsOf(work) {
  const fr = work.onsets.frameRate, {all, low, mid, high} = work.onsets.flux, strongest = work.candidates[0].bpm, least = BEATS.level.pulse;
  const pulse = work.pulse.length >= least ? work.pulse : [], backbeat = work.backbeat.length >= least ? work.backbeat : [];
  const kickAt = new Uint8Array(all.length);
  for (const t of pulse) { const f = Math.round(t * fr); for (let d = -2; d <= 2; d++) if (f + d >= 0 && f + d < all.length) kickAt[f + d] = 1; }
  const bands = {all, low, body: Float32Array.from(low, (v, i) => v + mid[i])};
  const masked = {all: Float32Array.from(all, (v, i) => (kickAt[i] ? mid[i] + high[i] : v)), low, body: Float32Array.from(mid, (v, i) => (kickAt[i] ? v : v + low[i]))};
  const levels = LEVELS.map(k => strongest * k).filter(bpm => bpm >= 30 && bpm <= 300).map(bpm => {
    const beats = trackBeats(all, 60 * fr / bpm, {frameRate: fr}).map(f => f / fr);
    const score = work.candidates.find(c => Math.abs(c.bpm - bpm) <= .02 * bpm)?.score ?? 0;
    return {bpm: round(bpm, 2), score, evidence: levelEvidence(bands, fr, beats, pulse, {backbeat}), masked: levelEvidence(masked, fr, beats, pulse, {backbeat})};
  });
  return levels.map(l => ({...l, fails: levelTests(l, levels), kicksAlone: refusedByKicksAlone(l)}));
}

/**
 * Whether music is playing at t: a heard hit of the map's (`map.hits`, dsp.mjs · hitsOf) within one beat period of it.
 * The tracker carries its grid on through a silent gap, before the music starts and after it stops; a beat there, or a
 * cut there, is on nothing. A map without hits is not asked (true).
 */
export function musicAt(map, t) {
  if (!map?.hits) return true;
  const hit = nearestOf(map.hits, t);
  return hit !== null && Math.abs(hit - t) <= periodOf(map) + 1e-9;
}
/** A map's beat period: 60 / its BPM, or (a hand-made map with none) the median gap between its beats. */
function periodOf(map) {
  if (map.bpm > 0) return 60 / map.bpm;
  const gaps = (map.beats ?? []).slice(1).map((b, i) => b - map.beats[i]).sort((a, b) => a - b);
  return gaps[gaps.length >> 1] ?? Infinity;
}

/**
 * The beats a film may cut on: the one rule for every caller (pipeline.mjs · map-beats, music.mjs · fitToMusic,
 * breakdown.mjs · beatsReport). Only where music is playing (musicAt: a heard hit within a beat period), sure map or
 * not. A sure map (measured, faster, slower or given) — every such beat. An unsure one (tempo-close, or a given tempo
 * unsure of its phase) — only the beats EVERY listed candidate's grid shares (each within `tolerance` seconds): the right
 * tempo is among the candidates, so a beat they all share is a true beat, whichever of them is right — for two tempi a
 * level apart, the slower grid; for a 4:3 pair, the beats they meet on. And none at all when a candidate is unsure of its
 * own phase (`phaseDoubt` at least `doubt`: the onsets half a beat from its grid are nearly as strong as those on it),
 * for then its grid could as well sit on the and, and so could the beats it shares. And of the beats they share, only
 * those where the song actually hits (`map.hits`: an attack in the low or mid band within `tolerance`, not an echo) —
 * the candidates can agree on an echo's grid, a delay's repeat a sixteenth before the beat. A hand-made map ({beats}, no
 * verdict) is taken as sure; one without `hits` is not asked for them.
 * Returns {beats, grid: 'every beat' | 'shared' | 'none: a candidate is unsure of its phase', shared, of, tempi, silent?,
 * unheard?}: `silent`, the beats where no music plays; `unheard`, the shared beats where the song does not hit.
 */
export function safeBeats(map, {tolerance = BEATS.safe.tolerance, doubt = BEATS.safe.phaseDoubt} = {}) {
  const every = [...(map?.beats ?? [])], all = every.filter(t => musicAt(map, t)), silent = every.length - all.length, quiet = silent ? {silent} : {};
  if (map?.sure !== false) return {beats: all, grid: 'every beat', shared: all.length, of: every.length, tempi: map?.bpm === undefined ? [] : [map.bpm], ...quiet};
  const listed = map.alternatives ?? [], tempi = listed.map(a => a.bpm), unsure = listed.filter(a => a.phaseDoubt >= doubt).map(a => a.bpm);
  if (unsure.length) return {beats: [], grid: 'none: a candidate is unsure of its phase', unsure, shared: 0, of: every.length, tempi, ...quiet};
  const grids = listed.map(a => a.beats ?? []), within = (list, t) => list.length > 0 && Math.abs(nearestOf(list, t) - t) <= tolerance;
  const agreed = all.filter(t => grids.every(g => within(g, t))), beats = map.hits ? agreed.filter(t => within(map.hits, t)) : agreed;
  return {beats, grid: 'shared', shared: beats.length, of: every.length, tempi, ...quiet, ...(map.hits ? {unheard: agreed.length - beats.length} : {})};
}

/**
 * The tempi an unsure map could be: its candidates scoring at least `least` (BEATS.likely), strongest first, rounded to
 * a whole BPM — the ones a person picks from to settle it (give music.bpm, or beatMap's bpm). A sure map: its own. A given
 * tempo unsure of its phase (the half-beats as strong as the beats): twice it, the beats heard.
 */
export function likelyTempi(map, least = BEATS.likely) {
  if (map?.sure !== false) return map?.bpm === undefined ? [] : [Math.round(map.bpm)];
  // A given tempo whose phase is unsure sits between the beats heard: the beat is twice as fast.
  if (map.phase === 'unsure') return [Math.round(2 * map.bpm)];
  return [...new Set((map.alternatives ?? []).filter(a => a.score >= least).map(a => Math.round(a.bpm)))];
}

/**
 * The map as text, for a person settling its tempo (`storyreel beats <song>`, cli.mjs): the verdict and whether it is
 * sure, the candidate tempi with their scores, every level of the beat tried and the tests it failed, and how to
 * settle an unsure map (give the tempo: the map is then sure).
 */
export function beatMapText(map, {source = 'the song'} = {}) {
  const pad = (v, n) => String(v).padStart(n), likely = likelyTempi(map);
  const how = map.sure ? 'sure: a film cuts on every beat where music plays' : map.phase === 'unsure' ? `the tempo given sits between the beats heard — its phase unsure, so a film cuts on none; try ${likely[0]} BPM`
    : 'unsure: a film cuts only on the beats every candidate shares';
  const lines = [`${source} · ${map.seconds} s · ${map.verdict} (${how}) · ${map.bpm} BPM, ${map.beats.length} beats`];
  if (map.alternatives?.length) lines.push('', 'candidate tempi (score against the strongest):', ...map.alternatives.map(a => `  ${pad(a.bpm.toFixed(2), 7)} BPM  ${a.score.toFixed(2)}${a.score >= BEATS.likely ? '' : '  (unlikely)'}`));
  if (map.levels?.length) lines.push('', 'levels of the beat tried (a level is sure only when it passes every test, and no other does):', ...map.levels.map(l => `  ${pad(l.bpm.toFixed(2), 7)} BPM  ${l.fails.length ? l.fails.join(', ') : 'passes'}${l.kicksAlone ? ' (refused by the kicks alone)' : ''}`));
  if (!map.sure && map.verdict !== 'tempo-given') lines.push('', `settle it: give the tempo you hear — music.bpm in makeFilm, or beatMap(file, {bpm}) — one of ${likely.join(', ')} BPM; the map is then sure, and a film cuts on every beat.`);
  // An unsure map does not state its drop as fact: the rise is measured, but placed on a grid it is unsure of.
  if (map.drop !== null && map.drop !== undefined) lines.push('', map.sure ? `drop at ${map.drop} s` : `maybe a drop at ${map.drop} s (the map is unsure)`);
  return lines.join('\n');
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
  return Object.freeze({...values, beats, hits: Object.freeze([...(values.hits ?? [])]), bars: Object.freeze([...values.bars]), alternatives: Object.freeze(values.alternatives.map(a => Object.freeze({...a, beats: Object.freeze([...a.beats])}))),
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
  return makeMap(await analyse(() => streamAudio(audioFile, {rate: ANALYSIS.rate, ffmpeg: o.ffmpeg, who: 'beatMap'}), path.basename(String(audioFile)), options));
}

/** The same map from mono samples already in hand (a Float32Array, -1..1), resampled to the analysis rate by the caller: `rate` must be 22050. */
export async function beatMapOf(samples, rate, options = {}) {
  if (!(samples instanceof Float32Array)) throw optionsError('beatMapOf: samples must be a Float32Array of mono samples (-1..1)');
  if (rate !== ANALYSIS.rate) throw optionsError(`beatMapOf: the samples must be at ${ANALYSIS.rate} Hz, not ${rate} (resample them, or give the file to beatMap)`);
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

export {peakOfSamples, sameTempo};
