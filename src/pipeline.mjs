/**
 * Make a film as a footprintjs flowchart. Each stage is recorded as it runs, so every film comes
 * with its making-of record (making-of.json): the stages and how long they took, every phrase
 * that triggered a drawing and when (and the recipe entry that asked for it), the compile stage by
 * stage (compileFilm's record: its footprintjs narrative), the director's notes as applied, the
 * pacing, the loudness as measured and set, the tools and versions used.
 *
 * Heavy things (the compiled film, canvases) never enter the flowchart's tracked scope; stages
 * pass small values and file paths, as footprintjs expects.
 */
import {readFileSync, writeFileSync, mkdirSync, cpSync, rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import {flowChart, narrative} from 'footprintjs';
import {applyPacing, validatePacing, paceTimings} from './pacing.mjs';
import {withDirections} from './clock.mjs';
import {compileFilm} from './film.mjs';
import {prepareRender, finishRender, wholeVideo, checkVideoStrategy} from './render.mjs';
import {requireApproval} from './approval.mjs';

const require = createRequire(import.meta.url);
/** A dependency's installed version (from its package.json, even when its exports hide that file). */
const version = name => {
  try { return require(`${name}/package.json`).version; } catch {}
  try { let dir = path.dirname(require.resolve(name)); for (let i = 0; i < 6; i++, dir = path.dirname(dir)) { try { const p = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')); if (p.name === name) return p.version; } catch {} } } catch {}
  return 'unknown';
};
const TOOLS = () => [
  {name: 'footprintjs', version: version('footprintjs'), license: 'MIT', detail: 'the making-of pipeline and its record'},
  {name: '@napi-rs/canvas', version: version('@napi-rs/canvas'), license: 'MIT', detail: 'drawing'},
  {name: 'perfect-freehand', version: version('perfect-freehand'), license: 'MIT', detail: 'marker strokes'},
  {name: 'roughjs', version: version('roughjs'), license: 'MIT', detail: 'sketched shapes'},
  {name: 'shiki', version: version('shiki'), license: 'MIT', detail: 'code tokens'},
  {name: 'Caveat', license: 'SIL OFL 1.1', detail: 'handwriting font'},
  {name: 'FFmpeg', license: 'LGPL/GPL (separate program)', detail: 'encoding and mixing'},
];
/**
 * The loudness for the making-of record (render.mjs · muxWithLoudness): kept as measured, and flagged
 * whenever the type is not 'linear' — a varying gain raises a quiet opening; a skipped pass set nothing.
 */
export function loudnessRecord(loudness) {
  if (loudness.type === 'linear') return loudness;
  const flag = loudness.type === 'skipped' ? `not normalised: ${loudness.reason}`
    : `normalised "${loudness.type}", not "linear": loudnorm varied the gain (the true-peak limit, a film under 3 s, or a measured range above the LRA you set blocks one fixed gain), so quiet moments may be raised${peakAdvice(loudness)}`;
  return {...loudness, flag};
}

/**
 * When the true-peak limit is what blocked one fixed gain, the target that one gain can reach: the gain
 * lifts the loudest peak by as much as it lifts the loudness, so I can rise at most to I + (TP limit − peak).
 */
function peakAdvice({target, measured}) {
  const {I, TP} = measured ?? {};
  if (![I, TP, target?.I, target?.TP].every(Number.isFinite)) return '';
  const reach = Math.floor((I + target.TP - TP) * 10) / 10;
  return reach < target.I ? `; here the loudest peak (${TP} dBTP) reaches the ${target.TP} dBTP limit at I = ${reach} LUFS — ask for loudness I ${reach} or lower to keep one fixed gain` : '';
}
const sha = text => createHash('sha256').update(text).digest('hex').slice(0, 16);
/** The most parts a picture is planned in (segments.mjs · planSegments makes one per row of pictures). */
const MAX_PARTS = 256;

/**
 * @param storyboard, recipe, data, kits, theme, root, hostKeys — as compileFilm
 * @param narrationDir a folder with the UNPACED timings.json and the scene audio (or null → silent;
 *                     then pass `timings` with word times, e.g. evenTimings(storyboard))
 * @param pacing       {sceneTail, holds, tails?, voiceSpeed?} — applied to a copy of the narration, or
 *                     to the word times of a silent cut (the same holds, so a pause-and-guess waits)
 * @param strings      the string table for the film's language ({key: text}); lang names it
 * @param out          the .mp4 to write; making-of.json is written beside it
 * @param render       extra options for renderFilm (intro, stamp, from, to, width, height, layout, motionBlur,
 *                     captionFiles, video…); a layout, motion blur or caption files are written into the record as
 *                     `version`; a segmentedVideo strategy renders each segment as its own subflow and the record's
 *                     `picture` says which were drawn and which were reused
 * @param approval     an approval (approval.mjs · approveFilm): the render refuses if the storyboard, the recipe, the
 *                     pacing or the voice changed since it was approved; the record keeps who approved it and when
 */
export async function makeFilm({storyboard, recipe, data = null, kits = [], theme, root = process.cwd(), hostKeys = [], narrationDir = null, timings = null, pacing = null, strings = null, lang = null, out, render = {}, approval = null}) {
  const dir = path.dirname(path.resolve(out)); mkdirSync(dir, {recursive: true});
  let film, paced, result, job, plan;
  const video = checkVideoStrategy(render.video ?? wholeVideo()), done = [];
  const stages = {
    'check-inputs': scope => {
      if (!storyboard?.scenes?.length) throw new Error('The storyboard has no scenes');
      // An approval locks what was approved: anything changed since refuses (approval.mjs · requireApproval).
      if (approval) { requireApproval(approval, {storyboard, recipe, pacing, narrationDir}); scope.approvedBy = approval.by; }
      // A silent cut has no voice speed to check; its holds and tails are checked the same way.
      if (pacing) validatePacing(narrationDir ? pacing : {voiceSpeed: 1, ...pacing}, storyboard);
      scope.scenes = storyboard.scenes.length;
      scope.storyboardHash = sha(JSON.stringify(storyboard)); scope.recipeHash = sha(JSON.stringify(recipe));
      if (strings) { scope.stringsHash = sha(JSON.stringify(strings)); scope.lang = lang; }
    },
    'pace-narration': async scope => {
      if (narrationDir) {
        const copy = path.join(dir, 'narration'); rmSync(copy, {recursive: true, force: true}); cpSync(narrationDir, copy, {recursive: true});
        const raw = JSON.parse(readFileSync(path.join(copy, 'timings.json'), 'utf8'));
        // A voice knows only the spoken scenes: a silent scene it left out gets its directions' timing (clock.mjs · withDirections).
        paced = pacing ? await applyPacing({runDir: copy, board: storyboard, timings: raw, pacing}) : withDirections(storyboard, raw);
        writeFileSync(path.join(copy, 'timings.json'), JSON.stringify(paced, null, 2));
        scope.narration = copy;
      } else {
        if (!timings) throw new Error('A silent film needs timings (word times per scene)');
        paced = pacing ? paceTimings(storyboard, timings, pacing) : withDirections(storyboard, timings); scope.narration = null;
      }
      scope.seconds = +paced.scenes.reduce((n, s) => n + s.duration, 0).toFixed(3);
      scope.pacing = paced.pacing ?? null;
    },
    'compile-film': async scope => {
      film = await compileFilm({storyboard, timings: paced, recipe, data, kits, theme, root, strings, hostKeys, record: true});
      scope.beats = film.beats.length; scope.sounds = film.sounds.length; scope.total = +film.total.toFixed(3);
    },
    // The picture: planned as one pass or as segments (render.mjs · wholeVideo, segments.mjs · segmentedVideo).
    'plan-picture': scope => {
      job = prepareRender({film, storyboard, timings: paced, narrationDir: scope.narration, out, ...render});
      plan = video.plan(job);
      if (plan.length > MAX_PARTS) throw new Error(`The picture is planned in ${plan.length} parts; at most ${MAX_PARTS} can be drawn (segments.mjs · planSegments: give the segments a larger minSeconds)`);
      scope.picture = {strategy: video.name, parts: plan.length};
      scope.parts = plan.map(p => ({index: p.index, frames: p.f1 - p.f0, ...(p.key ? {key: p.key, scenes: [...p.scenes]} : {})}));
    },
    'render-film': async scope => {
      const picture = await video.join(job, done);
      result = await finishRender(job, picture);
      scope.out = result.out; scope.chapters = result.chapters; scope.loudness = result.loudness.type;
      if (result.video) scope.reused = result.video.reused, scope.rendered = result.video.rendered;
    },
  };
  // Each part of the picture is its own subflow (a fan-out over the plan): the record says, part by part,
  // whether it was drawn or reused from the store.
  const part = (item, i) => flowChart('picture part', async s => {
    const r = await video.one(job, plan[i]); done[i] = r;
    s.status = r.status; s.frames = r.frames; if (r.why) s.why = r.why;
  }, 'part').build();
  const trace = narrative();
  const chart = flowChart('check-inputs', stages['check-inputs'], 'check-inputs')
    .addFunction('pace-narration', stages['pace-narration'], 'pace-narration')
    .addFunction('compile-film', stages['compile-film'], 'compile-film')
    .addFunction('plan-picture', stages['plan-picture'], 'plan-picture')
    .addParallelForEach('render-picture', 'render-picture', {items: scope => scope.parts ?? [], branch: part, maxBranches: MAX_PARTS, into: 'partsDone', failFast: true})
    .addFunction('render-film', stages['render-film'], 'render-film');
  const run = await chart.build().recorder(trace).run();
  const record = {
    schemaVersion: 1, made: new Date().toISOString(), out: result.out, seconds: result.seconds, chapters: result.chapters,
    inputs: {storyboard: run.state?.storyboardHash, recipe: run.state?.recipeHash, scenes: storyboard.scenes.length, ...(strings ? {strings: run.state?.stringsHash} : {})},
    ...(approval ? {approval: {by: approval.by, approved: approval.approved, ...(approval.note ? {note: approval.note} : {}), hashes: approval.hashes}} : {}),
    ...(strings ? {strings: {lang, used: film.strings}} : {}),
    pacing: paced.pacing ?? null,
    ...(result.poster ? {poster: {file: path.basename(result.poster), at: film.posterAt}} : {}),
    // The version made: its format (layout.mjs), its motion blur, the caption files beside it.
    ...(result.format || render.motionBlur || result.captions ? {version: {format: result.format ?? 'frame', ...(render.motionBlur ? {motionBlur: render.motionBlur} : {}),
      ...(result.captions ? {captionFiles: Object.values(result.captions).map(f => path.basename(f))} : {})}} : {}),
    ...(film.reading.length ? {reading: {tooShort: film.reading}} : {}),
    // Each beat: what was said, when, and the recipe entry that asked for it.
    beats: film.beats.map(({ref, t, path}) => ({said: Array.isArray(ref) ? {scene: ref[0], phrase: ref[1], plus: ref[2] ?? 0} : ref, at: t, ...(path ? {entry: path} : {})})),
    ...(film.notes.length ? {notes: film.notes} : {}),
    sounds: film.sounds.length,
    loudness: loudnessRecord(result.loudness),
    ...(result.video ? {picture: result.video} : {}),
    tools: TOOLS(),
    pipeline: trace.getEntries(),
    // The compile, stage by stage (record.mjs · recordSteps): what each stage read and wrote, every line as when.<recipe path>.
    compile: film.record.narrative,
  };
  const makingOf = path.join(dir, 'making-of.json');
  writeFileSync(makingOf, JSON.stringify(record, null, 2));
  return {...result, makingOf};
}
