/**
 * A reference film broken down into a spec to match ("match this"). An agent cannot watch a film, but it can read
 * numbers and look at contact sheets: breakdown(videoFile) reads the file once, small and grey (footage.mjs), and says
 * what a viewer sees — the cuts and what kind they are (a hard cut, a dissolve, a fade, a dip through one colour), the
 * shots and their lengths, the pacing, where the motion lives in each shot and whether the camera moves or things move
 * inside the frame, whether a shot shows lettering (a heuristic, never OCR), and, given a beat map, which cuts land on
 * the beat. It writes breakdown.json (the spec), breakdown.md (the same in plain words, breakdown-text.mjs), a contact
 * sheet per shot, one overview sheet, and record.json (the breakdown's own record).
 *
 * The breakdown is a footprintjs flowchart, so every verdict is a decision with its evidence — each rule's measures
 * against its thresholds — and an LLM can read why a change is a cut and not a flash, or a shot is still:
 *
 *   probe          the file's facts (ffprobe): length, frame rates, size as shown, sound; a varying frame rate warned of
 *   frames         every frame read once, small and grey, at one constant rate on the file's own timestamps
 *   find-cuts      the fades (from the runs of one colour), then the frames whose change peaks: the cut candidates
 *   cuts           a fan-out: each candidate decided — a flash, a step of a fade, a cut, or a change that is no cut
 *   find-gradual   the fades, and the stretches that change gradually outside the cuts and flashes
 *   gradual        a fan-out: each decided — dip, fade-in, fade-out, dissolve, or motion
 *   shots          the shots between the transitions, and the pacing
 *   find-motion    each shot's motion measures
 *   motion         a fan-out: each shot decided — still, the camera moves, or things move inside the frame
 *   stills         shot by shot: its colour stills read, its lettering measured, its sheet drawn, then let go
 *   lettering      a fan-out: each shot decided — lettered or not (a heuristic, never OCR)
 *   verdicts       each shot's two verdicts side by side
 *   beats          a decider: the beat map run on the sound, or why not (no sound, no beat map)
 *   overview       one still of every shot on one sheet
 *   spec           breakdown.json and breakdown.md
 */
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {createCanvas} from '@napi-rs/canvas';
import {flowChart, narrative, decide} from 'footprintjs';
import {ffmpegProbe} from './finished.mjs';
import {contactSheet} from './sheet.mjs';
import {GRID, readFootage, cutsAndFades, gradualCandidates, shotMotion, energyCurve} from './footage.mjs';
import {eachStill, readLettering, cornerMarks, logoCandidates, lettering} from './stills.mjs';
import {breakdownText} from './breakdown-text.mjs';

export {breakdownText};

/** The thresholds the verdicts use. Grey differences and spreads are mean grey levels, 0–255, on frames read `width` wide. */
export const BREAKDOWN = Object.freeze({
  width: 160,          // frames are read this wide, grey
  cutJump: 12,         // a cut: one frame changes by at least this much …
  cutRatio: 3,         // … and at least this many times the change of the frames around it
  flashLasting: .4,    // a flash: less than this share of a one-frame change lasts into the next frame
  blank: 1.5,          // a frame whose grey levels spread less than this is one colour (finished.mjs · FINISHED.blank)
  minFade: .2,         // seconds: a fade to or from one colour takes at least this long (a quicker one is a cut) …
  maxFade: 4,          // … and is followed at most this far from its colour
  maxHold: 1,          // seconds of one colour a dip may hold between its fades
  gradualFloor: .8,    // a gradual change: frames that change at least this much, one to the next …
  gradualFrames: 3,    // … for at least this many frames
  minChange: 12,       // a dissolve goes at least this far (the difference between its ends) …
  coherence: .7,       // … in a straight line (that difference over its path, frame by frame) …
  mix: .3,             // … its middle frame the even mix of its ends (off by less than this share of the change) …
  moved: .5,           // … less than this share of it explained by a shift of the whole picture …
  maxGradual: 3,       // … in at most this many seconds
  stillCell: 2,        // a shot is still when no cell of the 6 × 4 grid changes, on average, by this much a frame
  minPan: .02,         // the camera moves: the whole picture shifts by this share of the frame a second or more …
  explained: .5,       // … that shift explains this share of the change …
  share: .6,           // … and this share of the frame changes at once (things moving inside it change a part)
  textArea: .008,      // a shot is lettered when rows of sharp strokes cover this share of a still (a heuristic, not OCR)
  logoShots: 3,        // a corner mark is the film's logo when it stays put in this many shots or more …
  logoShare: .75,      // … and in this share of them, or more (a film of two shots has no logo: its marks are lettering)
  onBeat: .05,         // seconds: a cut this close to a beat lands on it (beats.mjs · BEATS.onBeat)
  closeTempo: .9,      // a tempo whose next alternative scores this much of it or more is a close call
  stillWidth: 480,     // colour stills, for the sheets and the lettering, are read this wide
  maxCandidates: 5000, // at most this many candidates of a kind are decided
});

// ── The verdicts: rules over measures, decided with decide() so the record keeps the evidence ───────────────

/** What a candidate for a cut can be. */
const CUT = t => ({key: 'verdict', noun: 'cut candidate', rules: [
  {when: {lasting: {lt: t.flashLasting}}, then: 'flash', label: 'one frame unlike the frames on both sides, which are alike: a flash'},
  {when: {fade: {gte: t.minFade}}, then: 'fade-step', label: 'a step of a fade through one colour (its last into the colour, or its first out of it): part of the fade, not a cut'},
  {when: {jump: {gte: t.cutJump}, ratio: {gte: t.cutRatio}}, then: 'cut', label: 'the picture jumps in one frame, far more than the frames around it change'}],
fallback: {branch: 'change', label: 'a change, but not one frame\'s jump above the frames around it: motion, not a cut'}});

/** What a gradual change can be. */
const GRADUAL = t => ({key: 'verdict', noun: 'gradual change', rules: [
  {when: {startSpread: {gte: t.blank}, leastSpread: {lt: t.blank}, endSpread: {gte: t.blank}, seconds: {gte: t.minFade}}, then: 'dip', label: 'the picture fades to one colour and fades back in'},
  {when: {startSpread: {lt: t.blank}, endSpread: {gte: t.blank}, seconds: {gte: t.minFade}}, then: 'fade-in', label: 'the picture fades in from one colour'},
  {when: {startSpread: {gte: t.blank}, endSpread: {lt: t.blank}, seconds: {gte: t.minFade}}, then: 'fade-out', label: 'the picture fades out to one colour'},
  {when: {change: {gte: t.minChange}, coherence: {gte: t.coherence}, mix: {lte: t.mix}, moved: {lt: t.moved}, seconds: {lte: t.maxGradual}}, then: 'dissolve', label: 'one picture becomes another, each frame between a mix of the two'}],
fallback: {branch: 'motion', label: 'the picture changes over these frames, but not as a mix of two pictures: motion'}});

/** How a shot moves. */
const MOTION = t => ({key: 'motion', noun: 'shot', rules: [
  {when: {busiest: {lt: t.stillCell}}, then: 'still', label: 'nothing in the frame changes: even its busiest part stays put'},
  {when: {pan: {gte: t.minPan}, explained: {gte: t.explained}, share: {gte: t.share}}, then: 'camera', label: 'the whole picture shifts together: the camera moves'}],
fallback: {branch: 'inside', label: 'parts of the picture change while the frame holds: things move inside it'}});

/**
 * Whether a mark that stays in a corner is the film's logo (left out of the lettering): the one rule, at least
 * `logoShots` shots and `logoShare` of them. Its known miss: a name shown in three shots of four reads as a logo.
 */
const LOGO = t => ({key: 'verdict', noun: 'corner mark', rules: [
  {when: {shots: {gte: t.logoShots}, share: {gte: t.logoShare}}, then: 'logo', label: 'it stays put in a corner of most of the film\'s shots: the film\'s logo'}],
fallback: {branch: 'not-logo', label: 'it stays in a corner of too few of the film\'s shots: lettering, not a logo'}});

/** Whether a shot shows lettering. */
const TEXT = t => ({key: 'text', noun: 'shot', rules: [
  {when: {textArea: {gte: t.textArea}}, then: 'text', label: 'rows of sharp strokes, as lettering makes (a heuristic, not OCR)'}],
fallback: {branch: 'no-text', label: 'no rows of sharp strokes like lettering, beyond a mark that stays in a corner'}});

const SIGN = {gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', ne: '≠', in: 'in', notIn: 'not in'};
const TEST = {gt: (a, b) => a > b, gte: (a, b) => a >= b, lt: (a, b) => a < b, lte: (a, b) => a <= b};
/**
 * A measure as a check shows it: rounded to 3 decimals, or as many more (up to 6) as it takes to show why the check went
 * the way it did — the rule compared the exact value, and 1.4995 < 1.5 must not read "1.5 < 1.5 ✓".
 */
function shownAgainst(actual, op, threshold, result) {
  const v = Number(actual);
  if (!Number.isFinite(v) || !TEST[op] || typeof threshold !== 'number') return actual;
  for (let d = 3; d <= 6; d++) { const shown = +v.toFixed(d); if (TEST[op](shown, threshold) === result) return String(shown); }
  return String(v);
}
/**
 * A decision's evidence, short: the verdict, the rule that gave it, and every rule tried with its checks ("jump 54.7 ≥ 12
 * ✓"). The labels are the decision's own (without the candidate's name the record's copy carries).
 */
function whyOf(evidence, {rules, fallback}) {
  const won = evidence.rules.find(r => r.matched);
  return {verdict: evidence.chosen, because: won ? rules[won.ruleIndex].label : fallback.label,
    rules: evidence.rules.map(r => ({then: r.branch, met: r.matched,
      checks: (r.conditions ?? []).map(c => `${c.key} ${shownAgainst(c.actualSummary, c.op, c.threshold, c.result)} ${SIGN[c.op] ?? c.op} ${c.threshold} ${c.result ? '✓' : '✗'}`), ...(r.matchError ? {error: r.matchError} : {})}))};
}

/**
 * A decider on a chart: decide() over the scope's measures, each label carrying the candidate's name (its number and
 * time: "cut candidate 37 at 12.48 s: …"), so every line of the record says which candidate it decided; the evidence
 * written beside the verdict; one branch per verdict.
 */
function addDecision(chart, decision) {
  const {key, noun, rules, fallback} = decision, verdicts = [...rules.map(r => r.then), fallback.branch];
  let list = chart.addDeciderFunction(`decide ${key}`, s => {
    const name = `${noun} ${s.candidate} at ${s.at} s`;
    const result = decide(s, rules.map(r => ({...r, label: `${name}: ${r.label}`})), {...fallback, label: `${name}: ${fallback.label}`});
    s[`${key}Why`] = whyOf(result.evidence, decision);
    return result;
  }, `decide-${key}`, `Which rule the measures meet: ${verdicts.join(', ')}`);
  for (const verdict of verdicts) list = list.addFunctionBranch(verdict, verdict, s => { s[key] = verdict; });
  return list.setDefault(fallback.branch).end();
}

/** One candidate's chart: its number and time, and its measures, into the scope (top-level keys, as the rules read them); then its decision. */
function verdictChart(decision) {
  const chart = flowChart('measures', s => {
    const item = s.$getValue('item');
    s.candidate = item.n; s.at = item.at;
    for (const [k, v] of Object.entries(item.measures)) s[k] = v;
  }, 'measures', 'The candidate\'s number, time and measures, as the rules read them');
  return addDecision(chart, decision).build();
}

/** How many candidates are decided at once: each decision runs as a small run of its own, so a batch bounds the memory they hold together. */
const BATCH = 100;

/**
 * Every candidate decided, BATCH at a time: a subflow that takes the next batch of its `items` (each numbered in the whole
 * list), decides each in a fan-out (verdictChart: one subflow and one decision per candidate), appends the answers to
 * `decided`, and loops back while candidates are left (a decision of its own, on how many are left). Its record keeps
 * every decision with its evidence, as one fan-out over all of them would.
 */
function decideAll(decision, what) {
  return flowChart('take a batch', s => {
    const from = s.taken ?? 0;
    s.batch = (s.$getValue('items') ?? []).slice(from, from + BATCH).map((x, j) => ({...x, n: from + j + 1}));
    s.taken = from + s.batch.length;
  }, 'take-batch', `The next ${BATCH} ${what}, numbered in the whole list`)
    .addParallelForEach('decide each', 'each', {items: s => s.batch, branch: () => verdictChart(decision), maxBranches: BATCH, into: 'answers', failFast: true}, `Each of the batch: ${[...decision.rules.map(r => r.then), decision.fallback.branch].join(', ')}`)
    .addFunction('keep the answers', s => { s.$update('decided', s.$getValue('answers')); s.left = s.total - s.taken; }, 'keep-answers', 'The batch\'s answers, after the ones before; how many are left')
    .addDeciderFunction('more', s => decide(s, [{when: {left: {gt: 0}}, then: 'next-batch', label: `${s.left} of the ${s.total} ${what} are left`}], {branch: 'all-decided', label: `all ${s.total} ${what} are decided`}), 'more', 'Whether candidates are left')
    .addFunctionBranch('next-batch', `decide the next ${BATCH}`, () => {}, undefined, {loopTo: 'take-batch'})
    .addFunctionBranch('all-decided', 'done', () => {})
    .setDefault('all-decided').end().build();
}

/** A mount of decideAll: the parent's list under `items` in, its answers out under `into` (in the list's order). */
const decideMount = (items, into) => ({inputMapper: s => { const list = s[items] ?? []; return {items: list, total: list.length}; }, outputMapper: out => ({[into]: out.decided ?? []})});
/** The candidates as decided (a fan-out's results): each with its verdicts and their evidence. */
const decidedOf = (results, keys) => results.map(r => ({...r.item, ...Object.fromEntries(keys.flatMap(k => [[k, r[k]], [`${k}Why`, r[`${k}Why`]]]))}));
const decided = (s, into, keys) => decidedOf(s.$getValue(into) ?? [], keys);

// ── Options ────────────────────────────────────────────────────────────────────────────────────────────────

const OPTION_KEYS = ['out', 'beatMap', 'beatOptions', 'ffmpeg', 'probe', 'thresholds'];
/** Thresholds that count pixels, frames or candidates: whole numbers (a width at least 16 pixels). */
const WHOLE = {width: 16, stillWidth: 16, gradualFrames: 1, maxCandidates: 1, logoShots: 1};

/** The thresholds, checked: each a known name and a number, 0 or more (a count, a whole number). */
function readThresholds(thresholds) {
  if (!thresholds || typeof thresholds !== 'object' || Array.isArray(thresholds)) throw new Error(`breakdown: thresholds is an object, {cutJump: 20}, not ${JSON.stringify(thresholds)}`);
  for (const [k, v] of Object.entries(thresholds)) {
    if (!Object.hasOwn(BREAKDOWN, k)) throw new Error(`breakdown: "${k}" is not a threshold; the thresholds are ${Object.keys(BREAKDOWN).join(', ')}`);
    if (!(Number.isFinite(v) && v >= 0)) throw new Error(`breakdown: thresholds.${k} is a number, 0 or more, not ${JSON.stringify(v)}`);
    if (k in WHOLE && !(Number.isInteger(v) && v >= WHOLE[k])) throw new Error(`breakdown: thresholds.${k} is a whole number, ${WHOLE[k]} or more, not ${v}`);
  }
  return {...BREAKDOWN, ...thresholds};
}

/**
 * The beat map's own options are its own: the breakdown checks only that they are an object it can hand on with its
 * FFmpeg ({...beatOptions, ffmpeg}), never their names or values — those rules have one owner, the reader. A reader that
 * finds its options wrong says so by throwing an error with `code: 'BEAT_OPTIONS'`, and the breakdown refuses with it
 * (readBeatsStage); any other error is a sound it could not read.
 */
function readBeatOptions(beatOptions) {
  if (!beatOptions || typeof beatOptions !== 'object' || Array.isArray(beatOptions)) throw new Error(`breakdown: beatOptions are the beat map's own options, an object handed on with ffmpeg ({bpm: 120}), not ${JSON.stringify(beatOptions)}`);
}

/** The options, checked: an unknown key or threshold refuses, naming the ones there are. */
function readOptions(videoFile, options) {
  if (typeof videoFile !== 'string' || !videoFile) throw new Error('breakdown: give the video file, breakdown("film.mp4", {out})');
  if (!existsSync(videoFile)) throw new Error(`breakdown: there is no file at ${videoFile}: give the path of a video (an .mp4)`);
  for (const k of Object.keys(options)) if (!OPTION_KEYS.includes(k)) throw new Error(`breakdown: "${k}" is not an option; the options are ${OPTION_KEYS.join(', ')}`);
  const {beatMap = null, ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg', thresholds = {}} = options;
  if (beatMap !== null && typeof beatMap !== 'function') throw new Error('breakdown: beatMap is a function, beatMap(audioFile, {ffmpeg, ...beatOptions}) → {bpm, beats: [seconds], drop?}, or left out');
  const {beatOptions = {}} = options;
  readBeatOptions(beatOptions);
  if (typeof ffmpeg !== 'string' || !ffmpeg) throw new Error('breakdown: ffmpeg is the FFmpeg to run (a path or a name on the PATH)');
  if (options.probe !== undefined && !(typeof options.probe?.probe === 'function' && typeof options.probe?.frames === 'function')) throw new Error('breakdown: probe reads the file, {probe(file), frames(file, size, each)} (finished.mjs · ffmpegProbe)');
  if (options.out !== undefined && !(typeof options.out === 'string' && options.out)) throw new Error('breakdown: out is the folder to write, a path');
  const out = path.resolve(options.out ?? `${path.basename(videoFile, path.extname(videoFile))}-breakdown`);
  return {file: path.resolve(videoFile), out, beatMap, beatOptions, ffmpeg, probe: options.probe ?? ffmpegProbe({ffmpeg}), t: readThresholds(thresholds)};
}

// ── The file and its frames ────────────────────────────────────────────────────────────────────────────────

const round = (v, digits = 2) => +v.toFixed(digits);
const sum = list => list.reduce((s, v) => s + v, 0);
const median = list => { const s = [...list].sort((a, b) => a - b), m = s.length >> 1; return !s.length ? 0 : s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * The rate the frames are read at, decided: the file's nominal rate (every frame of a variable-rate file falls on it),
 * unless that is past 120 a second or more than twice the average, when the average. The times hold either way: each
 * frame is laid on the clock by its own time (finished.mjs · onSlots).
 */
const RATE = Object.freeze({rules: [{when: {nominal: {lte: 120}, ratio: {lte: 2}}, then: 'nominal-rate', label: 'every frame falls on the nominal rate, at most 120 a second and at most twice the average: read at it'}],
  fallback: {branch: 'average-rate', label: 'the nominal rate is past 120 a second or more than twice the average: read at the average'}});
const rateDecider = s => { const result = decide(s, RATE.rules, RATE.fallback); s.rateWhy = whyOf(result.evidence, RATE); return result; };

/** Read at the rate decided; a warning when the average and the nominal rates differ by more than 1%. */
const readAt = (run, which) => s => {
  const {fps, rate = fps} = run.meta.video, read = which === 'nominal' ? rate : fps;
  run.rate = {read};
  if (Math.abs(fps - rate) > .01 * rate) run.warnings.unshift(`the frame rate varies (average ${round(fps, 3)}, nominal ${round(rate, 3)} a second): the frames were read at ${round(read, 3)} a second, each on its own time, so the times hold`);
  s.rate = round(read, 3);
  if (run.warnings.length) s.warning = run.warnings.join('; ');
};

/** The probe's facts, or a refusal naming why there is nothing to break down (sound only: finished.mjs · ffmpegProbe finds no picture). */
function probeOf(o) {
  try { return o.probe.probe(o.file); } catch (e) {
    if (/has no picture/.test(String(e?.message))) throw new Error(`breakdown: ${o.file} has no picture to break down (it holds no video stream): give a video`, {cause: e});
    throw e;
  }
}

/** The file's facts. */
const probeStage = run => s => {
  run.meta = probeOf(run.o);
  const v = run.meta.video;
  if (!(v.fps > 0 && v.width > 0 && v.height > 0)) throw new Error(`breakdown: ${run.o.file} has no frame rate or size the probe can read (fps ${v.fps}, ${v.width}×${v.height})`);
  run.warnings = Number.isFinite(v.seconds) ? [] : ['the file names no length: it is counted from the frames read'];
  const nominal = v.rate ?? v.fps;
  Object.assign(s, {file: path.basename(run.o.file), seconds: Number.isFinite(v.seconds) ? round(v.seconds, 3) : null, fps: round(v.fps, 3), width: v.width, height: v.height,
    rotation: v.rotation ?? 0, sound: Boolean(run.meta.audio), beatMap: Boolean(run.o.beatMap), nominal, average: v.fps, ratio: nominal / v.fps});
};

/** Every frame, read once. */
const framesStage = run => async s => {
  run.footage = await readFootage(run.o.probe, run.o.file, run.meta, {width: run.o.t.width, rate: run.rate.read});
  s.frames = run.footage.n; s.readAs = `${run.footage.W}×${run.footage.H} grey, ${round(run.rate.read, 3)} frames a second`;
};

/** Too many candidates of a kind refuses, naming the threshold that would make fewer. */
function bounded(list, what, fix, max) {
  if (list.length > max) throw new Error(`breakdown: ${list.length} ${what}, more than the ${max} it decides (maxCandidates): raise ${fix}, or maxCandidates`);
  return list;
}

/** The fades first (a fade's last step into its colour is no cut), then the cut candidates with the fade each is a step of. */
const findCutsStage = run => s => {
  const {cuts, fades} = cutsAndFades(run.footage, run.o.t), {fps} = run.footage;
  run.fades = fades;
  s.fades = fades.map(x => ({hold: x.hold.map(k => round(k / fps, 3)), into: x.into?.map(k => round(k / fps, 3)) ?? null, out: x.out?.map(k => round(k / fps, 3)) ?? null}));
  s.cutCandidates = bounded(cuts, 'frames could be cuts', 'thresholds.cutJump', run.o.t.maxCandidates);
};

/** The breaks — the cuts and the flashes — then the gradual changes: the fades, and dissolves outside the breaks. */
const findGradualStage = run => s => {
  run.cuts = decided(s, 'cutVerdicts', ['verdict']);
  run.breaks = new Set();
  for (const c of run.cuts) { if (c.verdict === 'cut') run.breaks.add(c.frames[1]); if (c.verdict === 'flash') [c.flashFrame, c.flashEnd].forEach(x => run.breaks.add(x)); }
  s.breaks = run.breaks.size;
  s.gradualCandidates = bounded(gradualCandidates(run.footage, run.breaks, run.fades, run.o.t), 'stretches could be gradual changes', 'thresholds.gradualFloor', run.o.t.maxCandidates);
};

// ── Shots ──────────────────────────────────────────────────────────────────────────────────────────────────

/** The transitions, as the spec reports them: a cut on its frame; a gradual one over its frames, at its middle (a fade where it meets its colour). */
function transitionsOf(run) {
  const {fps} = run.footage;
  const cuts = run.cuts.filter(c => c.verdict === 'cut').map(c => ({kind: 'cut', at: c.at, frame: c.frames[1], frames: c.frames, why: c.verdictWhy}));
  const changes = run.gradual.filter(g => g.verdict !== 'motion').map(g => ({kind: g.verdict, at: g.at, from: round(g.frames[0] / fps, 3), to: round(g.frames[1] / fps, 3), seconds: round(g.measures.seconds, 3),
    frame: Math.round(g.at * fps), frames: g.frames, ...(g.opens && g.verdict === 'fade-in' ? {opens: true} : {}), ...(g.closes && g.verdict === 'fade-out' ? {closes: true} : {}), why: g.verdictWhy}));
  return [...cuts, ...changes].sort((a, b) => a.at - b.at);
}
const splits = tr => !tr.opens && !tr.closes;

/** Which transition names a boundary when several fall on one frame (a fade out to black, then a cut to white): the cut first. */
const FIRST = ['cut', 'dissolve', 'dip', 'fade-out', 'fade-in'];

/**
 * How a shot begins or ends: the transitions there — the first names it (its kind, time and length), the others that fall
 * on the same frame are `also` — or the film's own start or end.
 */
const edgeOf = (group, none) => {
  if (!group?.length) return {kind: none};
  const [tr, ...more] = group;
  return {kind: tr.kind, at: tr.at, ...(tr.seconds ? {seconds: tr.seconds} : {}), ...(more.length ? {also: more.map(x => x.kind)} : {})};
};

/**
 * The shots between the transitions that split, one boundary per frame (the transitions on it grouped): [start, end) in
 * frames, and the clean frames inside (no transition touches them).
 */
function shotsOf(transitions, n, fps) {
  const groups = new Map();
  for (const tr of transitions.filter(splits).sort((a, b) => FIRST.indexOf(a.kind) - FIRST.indexOf(b.kind))) if (tr.frame > 0 && tr.frame < n) groups.set(tr.frame, [...(groups.get(tr.frame) ?? []), tr]);
  const opening = transitions.filter(x => x.opens), closing = transitions.filter(x => x.closes);
  const edges = [{frame: 0, group: opening}, ...[...groups].sort((a, b) => a[0] - b[0]).map(([frame, group]) => ({frame, group})), {frame: n, group: closing}];
  return edges.slice(0, -1).map((e, i) => {
    const next = edges[i + 1], c0 = Math.max(e.frame, ...e.group.map(tr => tr.frames[1])), c1 = Math.min(next.frame - 1, ...next.group.map(tr => tr.frames[0]));
    return {index: i + 1, start: round(e.frame / fps, 3), end: round(next.frame / fps, 3), seconds: round((next.frame - e.frame) / fps, 3), in: edgeOf(e.group, 'start'), out: edgeOf(next.group, 'end'),
      frames: [e.frame, next.frame], clean: c1 >= c0 ? [c0, c1] : [Math.floor((c0 + c1) / 2), Math.floor((c0 + c1) / 2)]};
  });
}

/** A shot that is one colour all through (a slug of black between two shots, a colour card): the median spread of its clean frames is under `blank`. */
const oneColour = (f, {clean: [c0, c1]}, blank) => median(f.spread.slice(c0, c1 + 1)) < blank;

/** How the film is cut: the shot lengths, and the transitions between the shots by kind (each boundary by the transition that names it). */
function pacingOf(shots, seconds) {
  const lengths = shots.map(x => x.seconds), longest = shots.reduce((a, b) => (b.seconds > a.seconds ? b : a)), shortest = shots.reduce((a, b) => (b.seconds < a.seconds ? b : a));
  const kinds = {}; for (const shot of shots.slice(1)) kinds[shot.in.kind] = (kinds[shot.in.kind] ?? 0) + 1;
  return {shots: shots.length, median: round(median(lengths), 3), mean: round(sum(lengths) / shots.length, 3), shortest: {seconds: shortest.seconds, shot: shortest.index},
    longest: {seconds: longest.seconds, shot: longest.index}, cutsPerMinute: round((shots.length - 1) / (seconds / 60), 1), transitions: kinds};
}

const shotsStage = run => s => {
  run.gradual = decided(s, 'gradualVerdicts', ['verdict']);
  run.transitions = transitionsOf(run);
  run.shots = shotsOf(run.transitions, run.footage.n, run.footage.fps).map(shot => (oneColour(run.footage, shot, run.o.t.blank) ? {...shot, blank: true} : shot));
  run.pacing = pacingOf(run.shots, run.footage.n / run.footage.fps);
  s.transitions = run.transitions.length; s.shots = run.shots.length; s.pacing = run.pacing;
};

const findMotionStage = run => s => {
  run.moves = run.shots.map(shot => shotMotion(run.footage, shot.clean[0], shot.clean[1], {skip: run.breaks}));
  s.shotMeasures = run.moves.map((m, i) => ({kind: 'shot', index: run.shots[i].index, at: run.shots[i].start, measures: m.measures}));
};

// ── Stills, shot by shot ───────────────────────────────────────────────────────────────────────────────────

/**
 * The frames a shot's sheet shows (and its lettering is read from): 3 to 6, evenly over its clean frames — or over the
 * whole shot when a transition takes more than half of it (a title fading in for most of its shot is the shot).
 */
function sheetFrames({clean: [c0, c1], frames: [f0, f1], seconds}) {
  const [a, b] = c1 - c0 >= (f1 - 1 - f0) / 2 ? [c0, c1] : [f0, f1 - 1], count = Math.min(6, Math.max(3, Math.ceil(seconds / 2) + 1));
  return [...new Set(Array.from({length: count}, (_, i) => Math.round(a + (b - a) * (.1 + .8 * i / (count - 1)))))];
}

/**
 * A still or a thumbnail (rgb) painted into a scratch canvas of its size, kept and painted over for every picture
 * of that size: a canvas holds native memory the garbage collector does not see, so one per picture would pile up.
 */
const scratch = new Map();
function canvasOf({width, height, rgb}) {
  const key = `${width}x${height}`;
  if (!scratch.has(key)) { const c = createCanvas(width, height); scratch.set(key, {c, img: c.getContext('2d').createImageData(width, height)}); }
  const {c, img} = scratch.get(key);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) { img.data[j] = rgb[i]; img.data[j + 1] = rgb[i + 1]; img.data[j + 2] = rgb[i + 2]; img.data[j + 3] = 255; }
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

/** Pictures as something contactSheet can draw: a reel whose frame at t is the picture of the frame read there, fitted to the 1600×900 frame. */
function reelOf(pictures, rate) {
  return {frame(ctx, t) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1600, 900);
    const p = pictures.get(Math.round(t * rate)); if (!p) return;
    const c = canvasOf(p), k = Math.min(1600 / c.width, 900 / c.height), w = c.width * k, h = c.height * k;
    ctx.drawImage(c, (1600 - w) / 2, (900 - h) / 2, w, h);
  }};
}

/**
 * A small copy of a still for the overview (192 pixels wide): all that is kept of a shot once its sheet is drawn. Each
 * pixel the mean of the still's pixels under it, worked out here (a canvas would hold native memory per copy).
 */
function thumbnailOf({width: W, height: H, rgb}, width = 192) {
  const height = Math.max(2, Math.round(width * H / W)), small = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * H / height), y1 = Math.max(y0 + 1, Math.floor((y + 1) * H / height));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * W / width), x1 = Math.max(x0 + 1, Math.floor((x + 1) * W / width)), sum = [0, 0, 0];
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) for (let c = 0; c < 3; c++) sum[c] += rgb[3 * (yy * W + xx) + c];
      for (let c = 0; c < 3; c++) small[3 * (y * width + x) + c] = Math.round(sum[c] / ((y1 - y0) * (x1 - x0)));
    }
  }
  return {width, height, rgb: small};
}

/**
 * A shot's stills come in: its rows of strokes read (small, kept for the lettering once every shot is read), its sheet
 * drawn and written, a thumbnail of its middle kept, the stills let go.
 */
async function finishShot(run, i, stills) {
  const shot = run.shots[i], frames = run.sheetFrames[i], {fps} = run.footage, kind = run.motion[i].motion === 'still' ? 'settled' : 'moving';
  run.reads[i] = readLettering([...stills.values()]);
  const file = `shots/shot-${String(shot.index).padStart(2, '0')}.png`;
  writeFileSync(path.join(run.o.out, file), await contactSheet(reelOf(stills, fps), {moments: frames.map((k, j) => ({t: k / fps, label: `shot ${shot.index} · ${j + 1}/${frames.length}`, kind})), columns: Math.min(3, frames.length), width: 1200}));
  run.sheets.shots[i] = file;
  const middle = frames[Math.floor(frames.length / 2)], still = stills.get(middle) ?? [...stills.values()][0];
  if (still) run.thumbnails.set(middle, thumbnailOf(still));
}

/**
 * The stills, shot by shot, in one FFmpeg pass (stills.mjs · eachStill): a shot is finished when the first still of the
 * next comes in, so only one shot's stills are ever held; the overview keeps a thumbnail of each, and each shot keeps its
 * rows of strokes. Last, the marks that stay in a corner, joined across shots: the candidates for the film's logo (stills.mjs
 * · logoCandidates), each decided next (LOGO).
 */
const stillsStage = run => async s => {
  const {width, height} = run.meta.video, w = run.o.t.stillWidth, h = Math.max(2, 2 * Math.round(w * height / width / 2));
  run.motion = decided(s, 'motionVerdicts', ['motion']);
  run.sheetFrames = run.shots.map(sheetFrames);
  run.reads = []; run.thumbnails = new Map(); run.sheets = {overview: 'overview.png', shots: []};
  mkdirSync(path.join(run.o.out, 'shots'), {recursive: true});
  // The stills are read by decoded frame (footage.mjs · readFootage's source): each serves every slot of a shot that shows it.
  const wanted = new Map();
  run.sheetFrames.forEach((frames, i) => frames.forEach(k => { const j = run.footage.source[k]; wanted.set(j, [...(wanted.get(j) ?? []), [i, k]]); }));
  const held = new Map();
  let at = 0;
  const finishUpTo = async i => { while (at < i) { await finishShot(run, at, held.get(at) ?? new Map()); held.delete(at); at++; } };
  const read = await eachStill(run.o.ffmpeg, run.o.file, [...wanted.keys()], {width: w, height: h}, async (j, still) => {
    const pairs = wanted.get(j);
    await finishUpTo(Math.min(...pairs.map(([i]) => i)));
    for (const [i, k] of pairs) { if (!held.has(i)) held.set(i, new Map()); held.get(i).set(k, still); }
  });
  await finishUpTo(run.shots.length);
  s.stills = read;
  s.logoCandidates = logoCandidates(run.reads.map(reads => cornerMarks(reads ?? [])), run.shots, run.reads.find(r => r?.length)?.[0].across ?? 0);
};

/** The lettering, each shot's, leaving out the corner marks decided to be the film's logo. */
const findLetteringStage = run => s => {
  const logo = new Set(decided(s, 'logoVerdicts', ['verdict']).filter(c => c.verdict === 'logo').flatMap(c => c.blocks));
  run.lettering = run.reads.map(reads => lettering(reads ?? [], logo));
  s.logoBlocks = logo.size;
  s.letteringMeasures = run.lettering.map((l, i) => ({kind: 'shot', index: run.shots[i].index, at: run.shots[i].start, measures: {textArea: l.area, mark: l.mark}}));
};

/** Each shot's verdicts, its motion and its lettering, side by side. */
const verdictsStage = run => s => {
  const text = decided(s, 'textVerdicts', ['text']);
  run.verdicts = run.motion.map((m, i) => ({...m, text: text[i].text, textWhy: text[i].textWhy}));
  s.verdicts = run.verdicts.map(v => `${v.motion} · ${v.text}`);
};

// ── Beats ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Whether the beats can be read. */
const BEATS = Object.freeze({rules: [{when: {sound: {eq: false}}, then: 'no-sound', label: 'the video has no sound'}, {when: {beatMap: {eq: true}}, then: 'read-beats', label: 'a beat map was given'}],
  fallback: {branch: 'beats-not-run', label: 'no beat map was given (breakdown(file, {beatMap}))'}});
const beatsDecider = s => {
  const result = decide(s, BEATS.rules, BEATS.fallback);
  s.beatsWhy = whyOf(result.evidence, BEATS);
  return result;
};

const SHAPE = 'a beat map answers {bpm, beats: [seconds, …], drop?: seconds | null, confidence?: 0..1, alternatives?: [{bpm, score}]}';
/** A beat map's answer, checked (beats.mjs · beatMap answers this shape): a wrong answer is a wiring mistake, and refuses. */
function readBeats(answer) {
  if (!answer || typeof answer !== 'object') throw new Error(`breakdown: ${SHAPE}, not ${answer === null ? 'null' : typeof answer}`);
  const {bpm, beats, drop = null, confidence, alternatives = []} = answer;
  if (!(Number.isFinite(bpm) && bpm > 0)) throw new Error(`breakdown: ${SHAPE}; its bpm is beats a minute, more than 0, not ${JSON.stringify(bpm)}`);
  if (!Array.isArray(beats) || !beats.every(Number.isFinite)) throw new Error(`breakdown: ${SHAPE}; its beats are a list of seconds`);
  if (drop !== null && !Number.isFinite(drop)) throw new Error(`breakdown: ${SHAPE}; its drop is seconds, or null when there is none, not ${JSON.stringify(drop)}`);
  if (confidence !== undefined && !(Number.isFinite(confidence) && confidence >= 0 && confidence <= 1)) throw new Error(`breakdown: ${SHAPE}; its confidence is 0..1, not ${JSON.stringify(confidence)}`);
  if (!Array.isArray(alternatives) || !alternatives.every(a => Number.isFinite(a?.bpm) && Number.isFinite(a?.score))) throw new Error(`breakdown: ${SHAPE}; its alternatives are [{bpm, score}]`);
  return {bpm, beats: [...beats].sort((a, b) => a - b), drop, ...(confidence !== undefined ? {confidence} : {}), alternatives: alternatives.map(a => ({bpm: a.bpm, score: a.score}))};
}

/** The video's sound as a WAV in a folder of its own: the file, or why it could not be written. */
function soundOf(run, dir) {
  const wav = path.join(dir, 'sound.wav'), r = spawnSync(run.o.ffmpeg, ['-v', 'error', '-y', '-i', run.o.file, '-vn', '-acodec', 'pcm_s16le', wav], {encoding: 'utf8'});
  return r.error || r.status !== 0 ? {why: `FFmpeg could not read the sound: ${r.error?.message ?? String(r.stderr).trim().slice(-300)}`} : {wav};
}

/**
 * Why a beat map could not read the sound, in its own words; when they ask for one of its options, how to give it here
 * (breakdown hands the beat map `beatOptions`).
 */
function notRead(error) {
  const said = String(error?.message ?? error), option = /options\.(\w+)/.exec(said)?.[1];
  return `the beat map could not read the sound: ${said}${option ? ` (give it as breakdown(file, {beatMap, beatOptions: {${option}: …}}))` : ''}`;
}

/**
 * The beats: the sound handed to the beat map with its options and this run's FFmpeg (beatMap(wav, {...beatOptions, ffmpeg})),
 * the folder removed after.
 * A beat map that cannot read the sound (a silent track, no tempo) is no failure of the breakdown: the spec says the beats
 * were not read, and why. A beat map that answers in the wrong shape refuses (readBeats).
 */
const readBeatsStage = run => async s => {
  const dir = mkdtempSync(path.join(tmpdir(), 'storyreel-breakdown-'));
  try {
    const sound = soundOf(run, dir);
    if (sound.why) run.beatsFailed = sound.why;
    else {
      let answer;
      try { answer = await run.o.beatMap(sound.wav, {...run.o.beatOptions, ffmpeg: run.o.ffmpeg}); } catch (e) {
        // The one refusal a reader can make: its options are wrong (code 'BEAT_OPTIONS'), a wiring mistake. Anything else
        // it throws is a sound it could not read, recorded as not run.
        if (e?.code === 'BEAT_OPTIONS') throw new Error(`breakdown: the beat map refused its options: ${e.message}`, {cause: e});
        run.beatsFailed = notRead(e);
      }
      if (!run.beatsFailed) run.beats = readBeats(answer);
    }
  } finally { rmSync(dir, {recursive: true, force: true}); }
  if (run.beats) { s.bpm = run.beats.bpm; s.beatCount = run.beats.beats.length; s.drop = run.beats.drop; } else s.beatsFailed = run.beatsFailed;
};

/** Which cuts land on a beat (within `onBeat` seconds), what is on screen at the drop, and whether the tempo was a close call. */
function beatsReport(run) {
  const {t} = run.o, {bpm, beats, drop, confidence, alternatives} = run.beats, nearest = x => beats.reduce((b, y) => (Math.abs(y - x) < Math.abs(b - x) ? y : b), beats[0]);
  const cuts = run.transitions.filter(splits).map(tr => {
    if (!beats.length) return {at: tr.at, kind: tr.kind, beat: null, off: null, onBeat: false};
    const beat = nearest(tr.at);
    return {at: tr.at, kind: tr.kind, beat: round(beat, 3), off: round(tr.at - beat, 3), onBeat: Math.abs(tr.at - beat) <= t.onBeat + 1e-9};
  });
  const atDrop = drop === null ? null : {at: round(drop, 3), shot: (run.shots.find(x => drop >= x.start && drop < x.end) ?? run.shots.at(-1)).index,
    nearestCut: cuts.length ? cuts.reduce((b, c) => (Math.abs(c.at - drop) < Math.abs(b.at - drop) ? c : b)) : null};
  const runnerUp = [...alternatives].sort((a, b) => b.score - a.score).find(a => Math.abs(a.bpm - bpm) > .5), best = Math.max(1e-9, ...alternatives.map(a => a.score));
  const close = runnerUp && runnerUp.score / best >= t.closeTempo ? {bpm: runnerUp.bpm, score: round(runnerUp.score / best, 2)} : null;
  return {ran: true, bpm, ...(confidence !== undefined ? {confidence} : {}), ...(alternatives.length ? {alternatives} : {}), ...(close ? {close} : {}),
    beats: beats.map(b => round(b, 3)), drop: atDrop, cuts, onBeat: cuts.filter(c => c.onBeat).length, of: cuts.length, within: t.onBeat};
}

// ── The overview and the spec ──────────────────────────────────────────────────────────────────────────────

/** A shot's motion in words: still (or one colour all through), the camera's move, or things moving inside the frame. */
function motionWords({motion}, shot, camera) {
  if (shot.blank) return 'one colour all through';
  if (motion === 'still') return 'still';
  if (motion === 'camera') return camera ? `the camera ${camera === 'left' || camera === 'right' ? 'pans' : 'tilts'} ${camera}` : 'the camera moves, with no one direction';
  return 'things move inside the frame';
}
/** The same, short enough for a sheet's label. */
function motionShort({motion}, shot, camera) {
  if (shot.blank) return 'one colour';
  if (motion === 'camera') return camera ? `${camera === 'left' || camera === 'right' ? 'pan' : 'tilt'} ${camera}` : 'camera';
  return motion === 'still' ? 'still' : 'things move';
}

/** How many stills a row of the overview holds: 6, or 10 for a film of more than 60 shots (a smaller sheet to read, and to draw). */
const overviewColumns = shots => Math.min(shots > 60 ? 10 : 6, shots);

const overviewStage = run => async s => {
  const {fps} = run.footage, middles = run.sheetFrames.map(frames => frames[Math.floor(frames.length / 2)]);
  const moments = run.shots.map((shot, i) => ({t: middles[i] / fps, label: `#${shot.index} ${shot.seconds.toFixed(1)} s · ${motionShort(run.verdicts[i], shot, run.moves[i].camera)}`, kind: run.verdicts[i].motion === 'still' ? 'settled' : 'moving'}));
  writeFileSync(path.join(run.o.out, 'overview.png'), await contactSheet(reelOf(run.thumbnails, fps), {moments, columns: overviewColumns(run.shots.length), width: 1600}));
  s.overview = run.shots.length;
};

/** The whole film's grid: each shot's, weighted by its clean frames. */
function filmGrid(shots, moves) {
  const total = sum(shots.map(x => x.clean[1] - x.clean[0])) || 1;
  return Array.from({length: GRID.rows}, (_, r) => Array.from({length: GRID.cols}, (_, c) => round(sum(moves.map((m, i) => m.grid[r][c] * (shots[i].clean[1] - shots[i].clean[0]))) / total, 1)));
}

/** Measures as the spec shows them: 3 decimals (the rules read them exact). */
const shown = measures => Object.fromEntries(Object.entries(measures).map(([k, v]) => [k, typeof v === 'number' ? round(v, 3) : v]));

/** One shot as the spec holds it. */
function shotSpec(run, i) {
  const shot = run.shots[i], v = run.verdicts[i], m = run.moves[i], camera = v.motion === 'camera' ? m.camera : undefined;
  return {index: shot.index, start: shot.start, end: shot.end, seconds: shot.seconds, in: shot.in, out: shot.out, ...(shot.blank ? {blank: true} : {}),
    motion: {verdict: v.motion, words: motionWords(v, shot, m.camera), ...(camera !== undefined ? {camera} : {}), ...shown(m.measures), grid: m.grid, why: v.motionWhy},
    text: {verdict: v.text, area: round(run.lettering[i].area, 4), mark: round(run.lettering[i].mark, 4), why: v.textWhy}, sheet: run.sheets.shots[i]};
}

/** The spec: what breakdown.json holds. */
function specOf(run, s) {
  const f = run.footage, count = verdict => run.verdicts.filter(v => v.motion === verdict).length;
  const tally = (list, verdicts) => Object.fromEntries([['candidates', list.length], ...verdicts.map(v => [v, list.filter(x => x.verdict === v).length])]);
  return {
    schemaVersion: 1, file: path.basename(run.o.file), made: new Date().toISOString(),
    video: {seconds: s.seconds ?? round(f.n / f.fps, 3), ...(s.seconds === null ? {lengthFrom: 'frames'} : {}), fps: s.fps, rate: s.rate, width: s.width, height: s.height, ...(s.rotation ? {rotation: s.rotation} : {}), frames: f.n, sound: s.sound, ...(run.warnings.some(w => w.startsWith('the frame rate varies')) ? {variable: true} : {})},
    read: {width: f.W, height: f.H, rate: round(f.fps, 3), frames: 'every frame, grey, laid on the rate by its own time', why: s.$getValue('rateWhy')},
    warnings: run.warnings,
    shots: run.shots.map((_, i) => shotSpec(run, i)),
    transitions: run.transitions.map(({frames, ...tr}) => tr),
    flashes: run.cuts.filter(c => c.verdict === 'flash').map(c => ({at: round(c.flashFrame / f.fps, 3), frame: c.flashFrame, why: c.verdictWhy})),
    pacing: run.pacing,
    motion: {shots: {still: count('still'), camera: count('camera'), inside: count('inside')}, grid: filmGrid(run.shots, run.moves), curve: energyCurve(f, run.breaks)},
    text: {heuristic: 'rows of sharp strokes, as lettering makes, leaving out a mark that stays in a corner (a logo); it never reads the words (no OCR)', shots: run.verdicts.flatMap((v, i) => (v.text === 'text' ? [run.shots[i].index] : []))},
    audio: {sound: s.sound, beats: run.beats ? beatsReport(run) : {ran: false, why: run.beatsFailed ?? s.$getValue('beatsWhy').because}},
    sheets: run.sheets,
    considered: {cuts: tally(run.cuts, ['cut', 'fade-step', 'flash', 'change']), gradual: tally(run.gradual, ['dip', 'fade-in', 'fade-out', 'dissolve', 'motion'])},
    thresholds: run.o.t, record: 'record.json',
  };
}

const specStage = run => s => {
  run.spec = specOf(run, s);
  run.text = breakdownText(run.spec);
  writeFileSync(path.join(run.o.out, 'breakdown.json'), JSON.stringify(run.spec, null, 2));
  writeFileSync(path.join(run.o.out, 'breakdown.md'), run.text);
  s.written = ['breakdown.json', 'breakdown.md'];
};

// ── The flowchart ──────────────────────────────────────────────────────────────────────────────────────────

/** The flowchart's logger: a refusal is rethrown to the caller (and kept in the record), so it is not printed twice; warnings still reach the console. */
const QUIET = Object.freeze({info() {}, log() {}, debug() {}, error() {}, warn: (...args) => console.warn(...args)});

function breakdownChart(run) {
  const {t} = run.o;
  return flowChart('probe', probeStage(run), 'probe', 'The file\'s facts: length, frame rates, size as shown, sound')
    .addDeciderFunction('read rate', rateDecider, 'read-rate', 'The rate the frames are read at: the nominal, or the average')
    .addFunctionBranch('nominal-rate', 'read at the nominal rate', readAt(run, 'nominal'))
    .addFunctionBranch('average-rate', 'read at the average rate', readAt(run, 'average'))
    .setDefault('average-rate').end()
    .addFunction('frames', framesStage(run), 'frames', 'Every frame read once, small and grey, at one constant rate on the file\'s own timestamps')
    .addFunction('find cuts', findCutsStage(run), 'find-cuts', 'The fades, then the frames whose change peaks: the candidates for a cut')
    .addSubFlowChartNext('cuts', decideAll(CUT(t), 'cut candidates'), 'decide each cut', decideMount('cutCandidates', 'cutVerdicts'))
    .addFunction('find gradual changes', findGradualStage(run), 'find-gradual', 'The fades, and the stretches that change gradually outside the cuts and flashes')
    .addSubFlowChartNext('gradual', decideAll(GRADUAL(t), 'gradual changes'), 'decide each gradual change', decideMount('gradualCandidates', 'gradualVerdicts'))
    .addFunction('shots', shotsStage(run), 'shots', 'The shots between the transitions, and the pacing')
    .addFunction('find motion', findMotionStage(run), 'find-motion', 'Each shot\'s motion measures')
    .addSubFlowChartNext('motion', decideAll(MOTION(t), 'shots'), 'decide each shot\'s motion', decideMount('shotMeasures', 'motionVerdicts'))
    .addFunction('stills', stillsStage(run), 'stills', 'Shot by shot: its stills read, its lettering measured, its sheet drawn, then let go')
    .addSubFlowChartNext('logos', decideAll(LOGO(t), 'corner marks'), 'decide each corner mark', decideMount('logoCandidates', 'logoVerdicts'))
    .addFunction('find lettering', findLetteringStage(run), 'find-lettering', 'Each shot\'s lettering, leaving out the film\'s logo')
    .addSubFlowChartNext('lettering', decideAll(TEXT(t), 'shots'), 'decide each shot\'s lettering', decideMount('letteringMeasures', 'textVerdicts'))
    .addFunction('verdicts', verdictsStage(run), 'verdicts', 'The shots as decided')
    .addDeciderFunction('beats', beatsDecider, 'beats', 'Whether the beats can be read: the sound, and a beat map')
    .addFunctionBranch('read-beats', 'read the beats', readBeatsStage(run))
    .addFunctionBranch('no-sound', 'no sound', () => {})
    .addFunctionBranch('beats-not-run', 'no beat map', () => {})
    .setDefault('beats-not-run').end()
    .addFunction('overview', overviewStage(run), 'overview', 'One still of every shot on one sheet')
    .addFunction('spec', specStage(run), 'spec', 'breakdown.json and breakdown.md')
    .setLogger(QUIET).build();
}

/** The record: the narrative, without its live raw values, as JSON holds it (what record.json reads back). */
const recordOf = trace => JSON.parse(JSON.stringify(trace.getEntries().map(({rawValue, ...entry}) => entry)));

/**
 * Break a video down into a spec to match. Returns {spec, text, record, files} — the spec (breakdown.json), the same in
 * plain words (breakdown.md), the breakdown's footprintjs record (record.json), and the files written under `out`
 * (default: <video name>-breakdown in the working folder). `beatMap(audioFile, {ffmpeg})` → {bpm, beats: [seconds],
 * drop?, confidence?, alternatives?} reads the beats of the video's sound (a WAV it is handed; beats.mjs · beatMap fits
 * as it is); without one the spec says the beats were not read. `thresholds` overrides BREAKDOWN; `probe` and `ffmpeg`
 * are the adapter that reads the file (finished.mjs · ffmpegProbe) and the FFmpeg it runs (5.1 or later). A refusal
 * names the fix; a failed stage rejects with `error.record`, the record so far.
 */
export async function breakdown(videoFile, options = {}) {
  const run = {o: readOptions(videoFile, options ?? {})};
  mkdirSync(run.o.out, {recursive: true});
  const trace = narrative();
  try { await breakdownChart(run).recorder(trace).run(); } catch (error) {
    if (error && typeof error === 'object' && !('record' in error)) error.record = recordOf(trace);
    throw error;
  }
  const record = recordOf(trace), files = {json: path.join(run.o.out, 'breakdown.json'), md: path.join(run.o.out, 'breakdown.md'), record: path.join(run.o.out, 'record.json'),
    overview: path.join(run.o.out, 'overview.png'), sheets: run.sheets.shots.map(f => path.join(run.o.out, f))};
  writeFileSync(files.record, JSON.stringify(record, null, 2));
  return {spec: run.spec, text: run.text, record, files};
}
