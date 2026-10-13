/**
 * A reference film broken down into a spec to match ("match this"). An agent cannot watch a film, but it can read
 * numbers and look at contact sheets: breakdown(videoFile) reads the file once, small and grey (footage.mjs), and says
 * what a viewer sees — the cuts and what kind they are (a hard cut, a dissolve, a fade, a dip through one colour), the
 * shots and their lengths, the pacing, where the motion lives in each shot and whether the camera moves or things move
 * inside the frame, whether a shot shows lettering (a heuristic, never OCR), and, given a beat map, which cuts land on
 * the beat. It writes breakdown.json (the spec), breakdown.md (the same in plain words), a contact sheet per shot, one
 * overview sheet, and record.json (the breakdown's own record).
 *
 * The breakdown is a footprintjs flowchart, so every verdict is a decision with its evidence — each rule's measures
 * against its thresholds — and an LLM can read why a change is a cut and not a flash, or a shot is still:
 *
 *   probe          the file's facts (ffprobe): length, frame rate, size, sound
 *   frames         every frame read once, small and grey, into a few measures each (kept outside the scope)
 *   find-cuts      the frames whose change peaks: the candidates for a cut, with their measures
 *   cuts           a fan-out: each candidate decided — cut, flash, or a change that is no cut
 *   find-gradual   the stretches that change gradually, outside the cuts and flashes
 *   gradual        a fan-out: each decided — dip, fade-in, fade-out, dissolve, or motion
 *   shots          the shots between the transitions, and the pacing
 *   stills         colour stills of every shot in one pass, and how much of each looks like lettering
 *   find-motion    each shot's motion measures
 *   motion         a fan-out: each shot decided — still, the camera moves, or things move inside the frame
 *   lettering      a fan-out: each shot decided — lettered or not (a heuristic, never OCR)
 *   verdicts       each shot's two verdicts side by side
 *   beats          a decider: the beat map run on the sound, or why not (no sound, no beat map)
 *   sheets         a contact sheet per shot, and the overview
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
import {clockTenths} from './clock.mjs';
import {GRID, readFootage, cutCandidates, gradualCandidates, shotMotion, energyCurve, readStills, textArea} from './footage.mjs';

/** The thresholds the verdicts use. Grey differences and spreads are mean grey levels, 0–255, on frames read `width` wide. */
export const BREAKDOWN = Object.freeze({
  width: 160,          // frames are read this wide, grey
  cutJump: 12,         // a cut: one frame changes by at least this much …
  cutRatio: 3,         // … and at least this many times the change of the frames around it
  flashLasting: .4,    // a flash: less than this share of a one-frame change lasts into the next frame
  gradualFloor: .8,    // a gradual change: frames that change at least this much, one to the next …
  gradualFrames: 3,    // … for at least this many frames
  blank: 1.5,          // a frame whose grey levels spread less than this is one colour (finished.mjs · FINISHED.blank)
  maxHold: 1,          // seconds of one colour a dip may hold between its fades
  minChange: 12,       // a dissolve goes at least this far (the difference between its ends) …
  coherence: .7,       // … in a straight line (that difference over its path, frame by frame) …
  mix: .3,             // … its middle frame the even mix of its ends (off by less than this share of the change) …
  moved: .5,           // … less than this share of it explained by a shift of the whole picture …
  maxGradual: 3,       // … in at most this many seconds
  stillCell: 2,        // a shot is still when no cell of the 6 × 4 grid changes, on average, by this much a frame
  minPan: .02,         // the camera moves: the whole picture shifts by this share of the frame a second or more …
  explained: .5,       // … that shift explains this share of the change …
  share: .6,           // … and this share of the frame changes at once (things moving inside it change a part)
  textArea: .005,      // a still is lettered when rows of sharp strokes cover this share of it (a heuristic, not OCR)
  onBeat: .1,          // seconds: a cut this close to a beat lands on it
  stillWidth: 480,     // colour stills, for the sheets and the lettering, are read this wide
  maxCandidates: 5000, // at most this many candidates of a kind are decided
});

// ── The verdicts: rules over measures, decided with decide() so the record keeps the evidence ───────────────

/** What a candidate for a cut can be. */
const CUT = t => ({key: 'verdict', rules: [
  {when: {lasting: {lt: t.flashLasting}}, then: 'flash', label: 'one frame unlike the frames on both sides, which are alike: a flash'},
  {when: {jump: {gte: t.cutJump}, ratio: {gte: t.cutRatio}}, then: 'cut', label: 'the picture jumps in one frame, far more than the frames around it change'}],
fallback: {branch: 'change', label: 'a change, but not one frame\'s jump above the frames around it: motion, not a cut'}});

/** What a gradual change can be. */
const GRADUAL = t => ({key: 'verdict', rules: [
  {when: {startSpread: {gte: t.blank}, leastSpread: {lt: t.blank}, endSpread: {gte: t.blank}}, then: 'dip', label: 'the picture fades to one colour and fades back in'},
  {when: {startSpread: {lt: t.blank}, endSpread: {gte: t.blank}}, then: 'fade-in', label: 'the picture fades in from one colour'},
  {when: {startSpread: {gte: t.blank}, endSpread: {lt: t.blank}}, then: 'fade-out', label: 'the picture fades out to one colour'},
  {when: {change: {gte: t.minChange}, coherence: {gte: t.coherence}, mix: {lte: t.mix}, moved: {lt: t.moved}, seconds: {lte: t.maxGradual}}, then: 'dissolve', label: 'one picture becomes another, each frame between a mix of the two'}],
fallback: {branch: 'motion', label: 'the picture changes over these frames, but not as a mix of two pictures: motion'}});

/** How a shot moves. */
const MOTION = t => ({key: 'motion', rules: [
  {when: {busiest: {lt: t.stillCell}}, then: 'still', label: 'nothing in the frame changes: even its busiest part stays put'},
  {when: {pan: {gte: t.minPan}, explained: {gte: t.explained}, share: {gte: t.share}}, then: 'camera', label: 'the whole picture shifts together: the camera moves'}],
fallback: {branch: 'inside', label: 'parts of the picture change while the frame holds: things move inside it'}});

/** Whether a shot shows lettering. */
const TEXT = t => ({key: 'text', rules: [
  {when: {textArea: {gte: t.textArea}}, then: 'text', label: 'rows of sharp strokes, as lettering makes (a heuristic, not OCR)'}],
fallback: {branch: 'no-text', label: 'no rows of sharp strokes like lettering'}});

const SIGN = {gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', ne: '≠', in: 'in', notIn: 'not in'};
/** A decision's evidence, short: the verdict, the rule that gave it, and every rule tried with its checks ("jump 54.7 ≥ 12 ✓"). */
function whyOf(evidence) {
  const won = evidence.rules.find(r => r.matched);
  return {verdict: evidence.chosen, because: won?.label ?? evidence.defaultLabel ?? 'no rule matched',
    rules: evidence.rules.map(r => ({then: r.branch, met: r.matched,
      checks: (r.conditions ?? []).map(c => `${c.key} ${c.actualSummary} ${SIGN[c.op] ?? c.op} ${c.threshold} ${c.result ? '✓' : '✗'}`), ...(r.matchError ? {error: r.matchError} : {})}))};
}

/** A decider on a chart: decide() over the scope's measures, the evidence written beside the verdict, one branch per verdict. */
function addDecision(chart, {key, rules, fallback}) {
  const verdicts = [...rules.map(r => r.then), fallback.branch];
  let list = chart.addDeciderFunction(`decide ${key}`, s => {
    const result = decide(s, rules, fallback);
    s[`${key}Why`] = whyOf(result.evidence);
    return result;
  }, `decide-${key}`, `Which rule the measures meet: ${verdicts.join(', ')}`);
  for (const verdict of verdicts) list = list.addFunctionBranch(verdict, verdict, s => { s[key] = verdict; });
  return list.setDefault(fallback.branch).end();
}

/** One candidate's chart: its measures into the scope (top-level keys, as the rules read them), then each decision. */
function verdictChart(...decisions) {
  let chart = flowChart('measures', s => { for (const [k, v] of Object.entries(s.$getValue('item').measures)) s[k] = v; }, 'measures', 'The candidate\'s measures, as the rules read them');
  for (const d of decisions) chart = addDecision(chart, d);
  return chart.build();
}

/** A fan-out over a list of candidates in the scope: each decided by its own chart, the results in order under `into`. */
const fanOut = (items, into, chart, maxBranches) => ({items: s => s[items] ?? [], branch: () => chart(), maxBranches, into, failFast: true});
/** The candidates as decided (a fan-out's results): each with its verdicts and their evidence. */
const decidedOf = (results, keys) => results.map(r => ({...r.item, ...Object.fromEntries(keys.flatMap(k => [[k, r[k]], [`${k}Why`, r[`${k}Why`]]]))}));
const decided = (s, into, keys) => decidedOf(s.$getValue(into) ?? [], keys);

// ── Options ────────────────────────────────────────────────────────────────────────────────────────────────

const OPTION_KEYS = ['out', 'beatMap', 'ffmpeg', 'probe', 'thresholds'];
/** Thresholds that count pixels, frames or candidates: whole numbers (a width at least 16 pixels). */
const WHOLE = {width: 16, stillWidth: 16, gradualFrames: 1, maxCandidates: 1};

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

/** The options, checked: an unknown key or threshold refuses, naming the ones there are. */
function readOptions(videoFile, options) {
  if (typeof videoFile !== 'string' || !videoFile) throw new Error('breakdown: give the video file, breakdown("film.mp4", {out})');
  if (!existsSync(videoFile)) throw new Error(`breakdown: there is no file at ${videoFile}: give the path of a video (an .mp4)`);
  for (const k of Object.keys(options)) if (!OPTION_KEYS.includes(k)) throw new Error(`breakdown: "${k}" is not an option; the options are ${OPTION_KEYS.join(', ')}`);
  const {beatMap = null, ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg', thresholds = {}} = options;
  if (beatMap !== null && typeof beatMap !== 'function') throw new Error('breakdown: beatMap is a function, beatMap(audioFile) → {bpm, beats: [seconds], drop?}, or left out');
  if (typeof ffmpeg !== 'string' || !ffmpeg) throw new Error('breakdown: ffmpeg is the FFmpeg to run (a path or a name on the PATH)');
  if (options.probe !== undefined && !(typeof options.probe?.probe === 'function' && typeof options.probe?.frames === 'function')) throw new Error('breakdown: probe reads the file, {probe(file), frames(file, size, each)} (finished.mjs · ffmpegProbe)');
  if (options.out !== undefined && !(typeof options.out === 'string' && options.out)) throw new Error('breakdown: out is the folder to write, a path');
  const out = path.resolve(options.out ?? `${path.basename(videoFile, path.extname(videoFile))}-breakdown`);
  return {file: path.resolve(videoFile), out, beatMap, ffmpeg, probe: options.probe ?? ffmpegProbe({ffmpeg}), t: readThresholds(thresholds)};
}

// ── The stages ─────────────────────────────────────────────────────────────────────────────────────────────

const round = (v, digits = 2) => +v.toFixed(digits);
const sum = list => list.reduce((s, v) => s + v, 0);
const median = list => { const s = [...list].sort((a, b) => a - b), m = s.length >> 1; return !s.length ? 0 : s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** The file's facts. */
const probeStage = run => s => {
  run.meta = run.o.probe.probe(run.o.file);
  const v = run.meta.video;
  if (!(v.fps > 0 && v.width > 0 && v.height > 0)) throw new Error(`breakdown: ${run.o.file} has no frame rate or size the probe can read (fps ${v.fps}, ${v.width}×${v.height})`);
  Object.assign(s, {file: path.basename(run.o.file), seconds: round(v.seconds, 3), fps: round(v.fps, 3), width: v.width, height: v.height, sound: Boolean(run.meta.audio), beatMap: Boolean(run.o.beatMap)});
};

/** Every frame, read once. */
const framesStage = run => async s => {
  run.footage = await readFootage(run.o.probe, run.o.file, run.meta, {width: run.o.t.width});
  s.frames = run.footage.n; s.readAs = `${run.footage.W}×${run.footage.H} grey, every frame`;
};

/** Too many candidates of a kind refuses, naming the threshold that would make fewer. */
function bounded(list, what, fix, max) {
  if (list.length > max) throw new Error(`breakdown: ${list.length} ${what}, more than the ${max} it decides (maxCandidates): raise ${fix}, or maxCandidates`);
  return list;
}

const findCutsStage = run => s => { s.cutCandidates = bounded(cutCandidates(run.footage, run.o.t), 'frames could be cuts', 'thresholds.cutJump', run.o.t.maxCandidates); };

/** The breaks — the cuts and the flashes — then the gradual changes outside them. */
const findGradualStage = run => s => {
  run.cuts = decided(s, 'cutVerdicts', ['verdict']);
  run.breaks = new Set();
  for (const c of run.cuts) { if (c.verdict === 'cut') run.breaks.add(c.frames[1]); if (c.verdict === 'flash') [c.flashFrame, c.flashFrame + 1].forEach(x => run.breaks.add(x)); }
  s.breaks = run.breaks.size;
  s.gradualCandidates = bounded(gradualCandidates(run.footage, run.breaks, run.o.t), 'stretches could be gradual changes', 'thresholds.gradualFloor', run.o.t.maxCandidates);
};

/** Fades at the very start or end open or close the film: they split no shots. */
const splits = (tr, n) => !(tr.verdict === 'fade-in' && tr.frames[0] <= 1) && !(tr.verdict === 'fade-out' && tr.frames[1] >= n - 2);

/** The transitions, as the spec reports them: a cut on its frame; a gradual one over its frames, at its middle. */
function transitionsOf(run) {
  const {fps, n} = run.footage;
  const cuts = run.cuts.filter(c => c.verdict === 'cut').map(c => ({kind: 'cut', at: c.at, frame: c.frames[1], frames: c.frames, splits: true, why: c.verdictWhy}));
  const changes = run.gradual.filter(g => g.verdict !== 'motion').map(g => ({kind: g.verdict, at: g.at, from: round(g.frames[0] / fps, 3), to: round(g.frames[1] / fps, 3), seconds: g.measures.seconds,
    frame: Math.round(g.at * fps), frames: g.frames, splits: splits(g, n), why: g.verdictWhy}));
  return [...cuts, ...changes].sort((a, b) => a.at - b.at);
}

/** How a shot begins or ends: the transition there (its kind, time and length), or the film's own start or end. */
const edgeOf = (tr, none) => (tr ? {kind: tr.kind, at: tr.at, ...(tr.seconds ? {seconds: tr.seconds} : {})} : {kind: none});

/** The shots between the transitions that split: [start, end) in frames, and the clean frames inside (no transition touches them). */
function shotsOf(transitions, n, fps) {
  const cuts = [];
  for (const tr of transitions.filter(x => x.splits)) if (tr.frame > (cuts.at(-1)?.frame ?? 0) && tr.frame < n) cuts.push(tr);
  const edges = [{frame: 0, tr: transitions.find(x => !x.splits && x.kind === 'fade-in') ?? null}, ...cuts.map(tr => ({frame: tr.frame, tr})), {frame: n, tr: transitions.find(x => !x.splits && x.kind === 'fade-out') ?? null}];
  return edges.slice(0, -1).map((e, i) => {
    const next = edges[i + 1], c0 = e.tr ? Math.max(e.frame, e.tr.frames[1]) : e.frame, c1 = next.tr ? Math.min(next.frame - 1, next.tr.frames[0]) : next.frame - 1;
    return {index: i + 1, start: round(e.frame / fps, 3), end: round(next.frame / fps, 3), seconds: round((next.frame - e.frame) / fps, 3), in: edgeOf(e.tr, 'start'), out: edgeOf(next.tr, 'end'),
      frames: [e.frame, next.frame], clean: c1 >= c0 ? [c0, c1] : [Math.floor((c0 + c1) / 2), Math.floor((c0 + c1) / 2)]};
  });
}

/** How the film is cut: the shot lengths and the transitions by kind. */
function pacingOf(shots, transitions, seconds) {
  const lengths = shots.map(x => x.seconds), longest = shots.reduce((a, b) => (b.seconds > a.seconds ? b : a)), shortest = shots.reduce((a, b) => (b.seconds < a.seconds ? b : a));
  const kinds = {}; for (const tr of transitions.filter(x => x.splits)) kinds[tr.kind] = (kinds[tr.kind] ?? 0) + 1;
  return {shots: shots.length, median: round(median(lengths), 3), mean: round(sum(lengths) / shots.length, 3), shortest: {seconds: shortest.seconds, shot: shortest.index},
    longest: {seconds: longest.seconds, shot: longest.index}, cutsPerMinute: round((shots.length - 1) / (seconds / 60), 1), transitions: kinds};
}

const shotsStage = run => s => {
  run.gradual = decided(s, 'gradualVerdicts', ['verdict']);
  run.transitions = transitionsOf(run);
  run.shots = shotsOf(run.transitions, run.footage.n, run.footage.fps).map(shot => (oneColour(run.footage, shot, run.o.t.blank) ? {...shot, blank: true} : shot));
  run.pacing = pacingOf(run.shots, run.transitions, run.footage.n / run.footage.fps);
  s.transitions = run.transitions.length; s.shots = run.shots.length; s.pacing = run.pacing;
};

/** A shot that is one colour all through (a slug of black between two shots, say): the median spread of its clean frames is under `blank`. */
function oneColour(f, {clean: [c0, c1]}, blank) {
  return median(f.spread.slice(c0, c1 + 1)) < blank;
}

/** The frames a shot's sheet shows: 3 to 6, evenly over its clean frames. */
function sheetFrames({clean: [c0, c1], seconds}) {
  const count = Math.min(6, Math.max(3, Math.ceil(seconds / 2) + 1)), span = c1 - c0;
  return [...new Set(Array.from({length: count}, (_, i) => Math.round(c0 + span * (.1 + .8 * i / (count - 1)))))];
}

const stillsStage = run => async s => {
  const {width, height} = run.meta.video, w = run.o.t.stillWidth, h = Math.max(2, 2 * Math.round(w * height / width / 2));
  run.sheetFrames = run.shots.map(sheetFrames);
  run.stills = await readStills(run.o.ffmpeg, run.o.file, run.sheetFrames.flat(), {width: w, height: h});
  run.textAreas = run.sheetFrames.map(frames => Math.max(0, ...frames.map(k => (run.stills.has(k) ? textArea(run.stills.get(k)) : 0))));
  s.stills = run.stills.size;
};

const findMotionStage = run => s => {
  s.shotMeasures = run.shots.map((shot, i) => {
    const m = shotMotion(run.footage, shot.clean[0], shot.clean[1], {skip: run.breaks});
    return {kind: 'shot', index: shot.index, at: shot.start, measures: {...m.measures, textArea: round(run.textAreas[i], 4)}, grid: m.grid, camera: m.camera};
  });
};

/** Each shot's verdicts, its motion and its lettering, side by side. */
const verdictsStage = run => s => {
  const motion = decided(s, 'motionVerdicts', ['motion']), text = decided(s, 'textVerdicts', ['text']);
  run.verdicts = motion.map((m, i) => ({...m, text: text[i].text, textWhy: text[i].textWhy}));
  s.verdicts = run.verdicts.map(v => `${v.motion} · ${v.text}`);
};

/** Whether the beats can be read. */
const beatsDecider = s => {
  const result = decide(s, [{when: {sound: {eq: false}}, then: 'no-sound', label: 'the video has no sound'}, {when: {beatMap: {eq: true}}, then: 'read-beats', label: 'a beat map was given'}],
    {branch: 'beats-not-run', label: 'no beat map was given (breakdown(file, {beatMap}))'});
  s.beatsWhy = whyOf(result.evidence);
  return result;
};

/** A beat map's answer, checked: {bpm, beats: [seconds], drop?}. */
function readBeats(answer) {
  const shape = 'a beat map answers {bpm, beats: [seconds, …], drop?: seconds}';
  if (!answer || typeof answer !== 'object') throw new Error(`breakdown: ${shape}, not ${answer === null ? 'null' : typeof answer}`);
  const {bpm, beats, drop = null} = answer;
  if (!(Number.isFinite(bpm) && bpm > 0)) throw new Error(`breakdown: ${shape}; its bpm is beats a minute, more than 0, not ${JSON.stringify(bpm)}`);
  if (!Array.isArray(beats) || !beats.every(Number.isFinite)) throw new Error(`breakdown: ${shape}; its beats are a list of seconds`);
  if (drop !== null && !Number.isFinite(drop)) throw new Error(`breakdown: ${shape}; its drop is seconds, or null when there is none, not ${JSON.stringify(drop)}`);
  return {bpm, beats: [...beats].sort((a, b) => a - b), drop};
}

/** The sound as a WAV in a folder of its own, handed to the beat map, the folder removed after. */
const readBeatsStage = run => async s => {
  const dir = mkdtempSync(path.join(tmpdir(), 'storyreel-breakdown-')), wav = path.join(dir, 'sound.wav');
  try {
    const r = spawnSync(run.o.ffmpeg, ['-v', 'error', '-y', '-i', run.o.file, '-vn', '-acodec', 'pcm_s16le', wav], {encoding: 'utf8'});
    if (r.error || r.status !== 0) throw new Error(`breakdown: ${run.o.ffmpeg} could not read the sound: ${r.error?.message ?? String(r.stderr).slice(-300)}`);
    let answer;
    try { answer = await run.o.beatMap(wav); } catch (e) { throw new Error(`breakdown: the beat map failed on the sound: ${e?.message ?? e}`, {cause: e}); }
    run.beats = readBeats(answer);
  } finally { rmSync(dir, {recursive: true, force: true}); }
  s.bpm = run.beats.bpm; s.beatCount = run.beats.beats.length; s.drop = run.beats.drop;
};

/** Which cuts land on a beat (within `onBeat` seconds), and what is on screen at the drop. */
function beatsReport(run) {
  const {bpm, beats, drop} = run.beats, nearest = t => beats.reduce((b, x) => (Math.abs(x - t) < Math.abs(b - t) ? x : b), beats[0]);
  const cuts = run.transitions.filter(x => x.splits).map(tr => {
    if (!beats.length) return {at: tr.at, kind: tr.kind, beat: null, off: null, onBeat: false};
    const beat = nearest(tr.at);
    return {at: tr.at, kind: tr.kind, beat: round(beat, 3), off: round(tr.at - beat, 3), onBeat: Math.abs(tr.at - beat) <= run.o.t.onBeat + 1e-9};
  });
  const atDrop = drop === null ? null : {at: round(drop, 3), shot: (run.shots.find(x => drop >= x.start && drop < x.end) ?? run.shots.at(-1)).index,
    nearestCut: cuts.length ? cuts.reduce((b, c) => (Math.abs(c.at - drop) < Math.abs(b.at - drop) ? c : b)) : null};
  return {ran: true, bpm, beats: beats.map(b => round(b, 3)), drop: atDrop, cuts, onBeat: cuts.filter(c => c.onBeat).length, of: cuts.length, within: run.o.t.onBeat};
}

/** A still as a picture contactSheet can draw: a reel whose frame at t is the still read nearest it, fitted to the 1600×900 frame. */
function stillReel(stills, fps) {
  const pictures = new Map([...stills].map(([k, {width, height, rgb}]) => {
    const c = createCanvas(width, height), ctx = c.getContext('2d'), img = ctx.createImageData(width, height);
    for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) { img.data[j] = rgb[i]; img.data[j + 1] = rgb[i + 1]; img.data[j + 2] = rgb[i + 2]; img.data[j + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    return [k, c];
  }));
  return {frame(ctx, t) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1600, 900);
    const c = pictures.get(Math.round(t * fps)); if (!c) return;
    const k = Math.min(1600 / c.width, 900 / c.height), w = c.width * k, h = c.height * k;
    ctx.drawImage(c, (1600 - w) / 2, (900 - h) / 2, w, h);
  }};
}

const sheetsStage = run => async s => {
  const {fps} = run.footage, reel = stillReel(run.stills, fps), dir = path.join(run.o.out, 'shots');
  mkdirSync(dir, {recursive: true});
  run.sheets = {overview: 'overview.png', shots: []};
  for (const [i, shot] of run.shots.entries()) {
    const moving = run.verdicts[i].motion !== 'still' ? 'moving' : 'settled', frames = run.sheetFrames[i];
    const file = `shots/shot-${String(shot.index).padStart(2, '0')}.png`;
    writeFileSync(path.join(run.o.out, file), await contactSheet(reel, {moments: frames.map((k, j) => ({t: k / fps, label: `shot ${shot.index} · ${j + 1}/${frames.length}`, kind: moving})), columns: Math.min(3, frames.length), width: 1200}));
    run.sheets.shots.push(file);
  }
  const middles = run.sheetFrames.map(frames => frames[Math.floor(frames.length / 2)]);
  writeFileSync(path.join(run.o.out, 'overview.png'), await contactSheet(reel, {moments: run.shots.map((shot, i) => ({t: middles[i] / fps, label: `#${shot.index} ${shot.seconds.toFixed(1)} s · ${motionShort(run.verdicts[i], shot)}`, kind: run.verdicts[i].motion !== 'still' ? 'moving' : 'settled'})),
    columns: Math.min(6, run.shots.length), width: 1600}));
  s.sheets = run.sheets.shots.length + 1;
};

// ── The spec ───────────────────────────────────────────────────────────────────────────────────────────────

/** A shot's motion in words: still (or one colour all through), the camera's move, or things moving inside the frame. */
function motionWords({motion, camera}, shot) {
  if (shot.blank) return 'one colour all through';
  if (motion === 'still') return 'still';
  if (motion === 'camera') return camera ? `the camera ${camera === 'left' || camera === 'right' ? 'pans' : 'tilts'} ${camera}` : 'the camera moves';
  return 'things move inside the frame';
}
/** The same, short enough for a sheet's label. */
function motionShort({motion, camera}, shot) {
  if (shot.blank) return 'one colour';
  if (motion === 'camera') return camera ? `${camera === 'left' || camera === 'right' ? 'pan' : 'tilt'} ${camera}` : 'camera';
  return motion === 'still' ? 'still' : 'things move';
}

/** The whole film's grid: each shot's, weighted by its clean frames. */
function filmGrid(shots, measures) {
  const total = sum(shots.map(x => x.clean[1] - x.clean[0])) || 1;
  return Array.from({length: GRID.rows}, (_, r) => Array.from({length: GRID.cols}, (_, c) => round(sum(measures.map((m, i) => m.grid[r][c] * (shots[i].clean[1] - shots[i].clean[0]))) / total, 1)));
}

/** The spec: what breakdown.json holds. */
function specOf(run, s) {
  const {t} = run.o, f = run.footage, measures = s.$getValue('shotMeasures');
  const shots = run.shots.map((shot, i) => {
    const v = run.verdicts[i], m = measures[i], {textArea: area, ...moves} = m.measures;
    return {index: shot.index, start: shot.start, end: shot.end, seconds: shot.seconds, in: shot.in, out: shot.out, ...(shot.blank ? {blank: true} : {}),
      motion: {verdict: v.motion, words: motionWords(v, shot), ...(v.motion === 'camera' ? {camera: m.camera} : {}), ...moves, grid: m.grid, why: v.motionWhy},
      text: {verdict: v.text, area, why: v.textWhy}, sheet: run.sheets.shots[i]};
  });
  const count = verdict => run.verdicts.filter(v => v.motion === verdict).length;
  const tally = (list, verdicts) => Object.fromEntries([['candidates', list.length], ...verdicts.map(v => [v, list.filter(x => x.verdict === v).length])]);
  return {
    schemaVersion: 1, file: path.basename(run.o.file), made: new Date().toISOString(),
    video: {seconds: s.seconds, fps: s.fps, width: s.width, height: s.height, frames: f.n, sound: s.sound}, read: {width: f.W, height: f.H, frames: 'every frame, grey'},
    shots,
    transitions: run.transitions.map(({frames, splits: split, ...tr}) => (split ? tr : {...tr, opensOrCloses: true})),
    flashes: run.cuts.filter(c => c.verdict === 'flash').map(c => ({at: round(c.flashFrame / f.fps, 3), frame: c.flashFrame, why: c.verdictWhy})),
    pacing: run.pacing,
    motion: {shots: {still: count('still'), camera: count('camera'), inside: count('inside')}, grid: filmGrid(run.shots, measures), curve: energyCurve(f, run.breaks)},
    text: {heuristic: 'rows of sharp strokes, as lettering makes; it never reads the words (no OCR)', shots: run.verdicts.flatMap((v, i) => (v.text === 'text' ? [run.shots[i].index] : []))},
    audio: {sound: s.sound, beats: run.beats ? beatsReport(run) : {ran: false, why: s.$getValue('beatsWhy').because}},
    sheets: run.sheets,
    considered: {cuts: tally(run.cuts, ['cut', 'flash', 'change']), gradual: tally(run.gradual, ['dip', 'fade-in', 'fade-out', 'dissolve', 'motion'])},
    thresholds: t, record: 'record.json',
  };
}

const ROWS = ['top', 'upper middle', 'lower middle', 'bottom'], COLS = ['far left', 'left', 'centre left', 'centre right', 'right', 'far right'];
const uniqueSorted = list => [...new Set(list)].sort((a, b) => a - b);
/** Where a grid's change lives, in words: the rows and the columns of its busy cells (half its busiest, or more). */
function whereWords(grid) {
  const most = Math.max(0, ...grid.flat());
  if (!(most > 0)) return 'nowhere';
  const hot = grid.flatMap((row, r) => row.flatMap((v, c) => (v >= most / 2 ? [[r, c]] : [])));
  const rows = uniqueSorted(hot.map(([r]) => r)), cols = uniqueSorted(hot.map(([, c]) => c));
  if (rows.length === GRID.rows && cols.length === GRID.cols) return 'all over the frame';
  const down = rows.length === GRID.rows ? 'top to bottom' : rows.length === 1 ? `the ${ROWS[rows[0]]} row` : `the ${ROWS[rows[0]]} to ${ROWS[rows.at(-1)]} rows`;
  const across = cols.length === GRID.cols ? 'across the frame' : cols.length === 1 ? `at the ${COLS[cols[0]]}` : `from the ${COLS[cols[0]]} to the ${COLS[cols.at(-1)]}`;
  return `${down}, ${across}`;
}
const HEAT = ' .:-=+*#%@';
/** A grid as text, one character a cell, darker for more change. */
const heatText = grid => { const most = Math.max(1e-9, ...grid.flat()); return grid.map(row => row.map(v => HEAT[Math.round(v / most * (HEAT.length - 1))]).join(' ')).join('\n'); };

const KIND_WORDS = {cut: 'hard cut', dissolve: 'dissolve', dip: 'dip through one colour', 'fade-in': 'fade in', 'fade-out': 'fade out', start: 'start', end: 'end'};
const secondsText = v => `${round(v, 2)} s`;
const edgeText = edge => `${KIND_WORDS[edge.kind] ?? edge.kind}${edge.seconds ? ` ${secondsText(edge.seconds)}` : ''}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The shot list: when each shot runs, how it comes in, how it moves, whether it is lettered. */
function shotLines(spec) {
  return ['## Shots', '', '| # | from | to | length | comes in by | motion | lettering |', '|---|---|---|---|---|---|---|',
    ...spec.shots.map(x => `| ${x.index} | ${clockTenths(x.start)} | ${clockTenths(x.end)} | ${secondsText(x.seconds)} | ${edgeText(x.in)} | ${x.motion.words} | ${x.text.verdict === 'text' ? 'yes' : '–'} |`)];
}

/** The pacing: the shot lengths, the transitions by kind, the fades that open or close the film, the flash frames. */
function pacingLines(spec) {
  const p = spec.pacing, kinds = Object.entries(p.transitions).map(([k, n]) => `${n} ${KIND_WORDS[k] ?? k}${n > 1 ? 's' : ''}`);
  const edges = spec.transitions.filter(tr => tr.opensOrCloses).map(tr => `${tr.kind === 'fade-in' ? 'opens' : 'closes'} with a ${KIND_WORDS[tr.kind]} (${secondsText(tr.seconds)})`);
  return ['## Pacing', '', `${plural(p.shots, 'shot')} in ${secondsText(spec.video.seconds)}: median ${secondsText(p.median)}, mean ${secondsText(p.mean)}; shortest ${secondsText(p.shortest.seconds)} (#${p.shortest.shot}), longest ${secondsText(p.longest.seconds)} (#${p.longest.shot}); ${p.cutsPerMinute} cuts a minute.`,
    kinds.length ? `Between the shots: ${kinds.join(', ')}.` : 'One shot: no cut.',
    ...(edges.length ? [`The film ${edges.join(' and ')}.`] : []),
    ...(spec.flashes.length ? [`Flash frames (one frame unlike the frames either side): ${spec.flashes.map(x => clockTenths(x.at)).join(', ')}.`] : [])];
}

/** Where the motion lives: the verdicts counted, each moving shot in words, the whole film's grid as text. */
function motionLines(spec) {
  const m = spec.motion.shots;
  return ['## Where the motion lives', '', `${m.still} still, ${m.camera} with the camera moving, ${m.inside} with things moving inside the frame.`,
    ...spec.shots.filter(x => x.motion.verdict !== 'still').map(x => `- #${x.index} (${clockTenths(x.start)}): ${x.motion.words}${x.motion.verdict === 'camera' ? `, ${round(x.motion.pan * 100, 1)}% of the frame a second` : `, mostly ${whereWords(x.motion.grid)}`}.`),
    '', 'The whole film, change by cell (6 across, 4 down; darker is more):', '', '```', heatText(spec.motion.grid), '```'];
}

/** The cuts against the beats, or why they were not read. */
function beatLines(b) {
  if (!b.ran) return ['## Cuts on the beat', '', `Not run: ${b.why}.`];
  const out = ['## Cuts on the beat', '', `${round(b.bpm, 1)} BPM, ${plural(b.beats.length, 'beat')}. ${b.onBeat} of ${b.of} cuts land on a beat (within ${b.within} s).`];
  for (const c of b.cuts) out.push(`- ${clockTenths(c.at)} ${KIND_WORDS[c.kind] ?? c.kind}: ${c.beat === null ? 'no beat' : c.onBeat ? `on the beat (${c.off >= 0 ? '+' : ''}${c.off.toFixed(2)} s)` : `off the beat by ${Math.abs(c.off).toFixed(2)} s`}`);
  out.push(b.drop ? `The drop at ${clockTenths(b.drop.at)}: shot #${b.drop.shot} is on screen${b.drop.nearestCut ? `; the nearest cut is ${Math.abs(b.drop.nearestCut.at - b.drop.at).toFixed(2)} s away` : ''}.` : 'No drop.');
  return out;
}

/** The spec in plain words (breakdown.md): the shot list with timings, the pacing, where the motion lives, lettering, and the cuts against the beats. */
export function breakdownText(spec) {
  const v = spec.video;
  return `${[`# Breakdown: ${spec.file}`, '', `${secondsText(v.seconds)} · ${v.width}×${v.height} · ${v.fps} fps · sound: ${v.sound ? 'yes' : 'no'} · read ${spec.read.width}×${spec.read.height} grey, every frame.`, '',
    ...shotLines(spec), '', ...pacingLines(spec), '', ...motionLines(spec), '',
    '## Lettering on screen', '', `A heuristic: ${spec.text.heuristic}.`, spec.text.shots.length ? `Lettered: ${spec.text.shots.map(i => `#${i}`).join(', ')}.` : 'No shot looks lettered.', '',
    ...beatLines(spec.audio.beats)].join('\n')}\n`;
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
  const {t} = run.o, max = t.maxCandidates;
  return flowChart('probe', probeStage(run), 'probe', 'The file\'s facts: length, frame rate, size, sound')
    .addFunction('frames', framesStage(run), 'frames', 'Every frame read once, small and grey, into a few measures each')
    .addFunction('find cuts', findCutsStage(run), 'find-cuts', 'The frames whose change peaks: the candidates for a cut')
    .addParallelForEach('decide each cut', 'cuts', fanOut('cutCandidates', 'cutVerdicts', () => verdictChart(CUT(t)), max), 'Each candidate: a cut, a flash, or a change that is no cut')
    .addFunction('find gradual changes', findGradualStage(run), 'find-gradual', 'The stretches that change gradually, outside the cuts and flashes')
    .addParallelForEach('decide each gradual change', 'gradual', fanOut('gradualCandidates', 'gradualVerdicts', () => verdictChart(GRADUAL(t)), max), 'Each: a dip, a fade in or out, a dissolve, or motion')
    .addFunction('shots', shotsStage(run), 'shots', 'The shots between the transitions, and the pacing')
    .addFunction('stills', stillsStage(run), 'stills', 'Colour stills of every shot, and how much of each looks like lettering')
    .addFunction('find motion', findMotionStage(run), 'find-motion', 'Each shot\'s motion measures')
    .addParallelForEach('decide each shot\'s motion', 'motion', fanOut('shotMeasures', 'motionVerdicts', () => verdictChart(MOTION(t)), max), 'Each shot: still, the camera moves, or things move inside it')
    .addParallelForEach('decide each shot\'s lettering', 'lettering', fanOut('shotMeasures', 'textVerdicts', () => verdictChart(TEXT(t)), max), 'Each shot: lettered or not (a heuristic, not OCR)')
    .addFunction('verdicts', verdictsStage(run), 'verdicts', 'The shots as decided')
    .addDeciderFunction('beats', beatsDecider, 'beats', 'Whether the beats can be read: the sound, and a beat map')
    .addFunctionBranch('read-beats', 'read the beats', readBeatsStage(run))
    .addFunctionBranch('no-sound', 'no sound', () => {})
    .addFunctionBranch('beats-not-run', 'no beat map', () => {})
    .setDefault('beats-not-run').end()
    .addFunction('sheets', sheetsStage(run), 'sheets', 'A contact sheet per shot, and the overview')
    .addFunction('spec', specStage(run), 'spec', 'breakdown.json and breakdown.md')
    .setLogger(QUIET).build();
}

/** The record: the narrative, without its live raw values, as JSON holds it (what record.json reads back). */
const recordOf = trace => JSON.parse(JSON.stringify(trace.getEntries().map(({rawValue, ...entry}) => entry)));

/**
 * Break a video down into a spec to match. Returns {spec, text, record, files} — the spec (breakdown.json), the same in
 * plain words (breakdown.md), the breakdown's footprintjs record (record.json), and the files written under `out`
 * (default: <video name>-breakdown in the working folder). `beatMap(audioFile)` → {bpm, beats: [seconds], drop?} reads
 * the beats of the video's sound (a WAV it is handed); without one the spec says the beats were not read.
 * `thresholds` overrides BREAKDOWN; `probe` and `ffmpeg` are the adapter that reads the file (finished.mjs ·
 * ffmpegProbe) and the FFmpeg it runs. A refusal names the fix; a failed stage rejects with `error.record`.
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
