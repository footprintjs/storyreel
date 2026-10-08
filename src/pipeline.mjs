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
import {readCast, withCast} from './cast.mjs';
import {readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync, statSync, renameSync} from 'node:fs';
import path from 'node:path';
import {flowChart, narrative} from 'footprintjs';
import {applyPacing, validatePacing, paceTimings} from './pacing.mjs';
import {withDirections} from './clock.mjs';
import {compileFilm} from './film.mjs';
import {prepareRender, finishRender, wholeVideo, checkVideoStrategy} from './render.mjs';
import {readApproval, requireApproval, voiceHash, unlocked} from './approval.mjs';
import {hashOf} from './hash.mjs';
import {checkVideo, ffmpegProbe} from './finished.mjs';
import {installedVersion} from './versions.mjs';

const version = installedVersion;
const TOOLS = () => [
  {name: 'footprintjs', version: version('footprintjs'), license: 'MIT', detail: 'the making-of pipeline and its record'},
  {name: '@napi-rs/canvas', version: version('@napi-rs/canvas'), license: 'MIT', detail: 'drawing'},
  {name: 'perfect-freehand', version: version('perfect-freehand'), license: 'MIT', detail: 'marker strokes'},
  {name: 'roughjs', version: version('roughjs'), license: 'MIT', detail: 'sketched shapes'},
  {name: 'shiki', version: version('shiki'), license: 'MIT', detail: 'code tokens'},
  {name: 'footprint-narration', version: version('footprint-narration'), license: 'MIT', detail: 'the spoken text and the captions'},
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

/**
 * The voice check a voice folder carries (word-check.json, written by the voice tools' check_words.py):
 * every word forced alignment scored low, and every word the listen-back did not hear (a dropped word,
 * which alignment cannot see). Flagged stale when it is older than the folder's timings.json.
 */
export function readVoiceCheck(narrationDir) {
  const file = path.join(narrationDir, 'word-check.json');
  if (!existsSync(file)) return null;
  const report = JSON.parse(readFileSync(file, 'utf8')), spoken = (report.scenes ?? []).filter(s => !s.silent);
  const stale = statSync(file).mtimeMs < statSync(path.join(narrationDir, 'timings.json')).mtimeMs;
  return {lowWords: spoken.flatMap(s => (s.lowWords ?? []).map(([word, score]) => ({scene: s.scene, word, score}))),
    notHeard: spoken.flatMap(s => (s.notHeard ?? []).map(word => ({scene: s.scene, word}))), checked: report.notHeardCount !== undefined, ...(stale ? {stale: 'word-check.json is older than timings.json: check the voice again'} : {})};
}
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
 * @param voiceCheck   'report' (the default: the record lists the words the voice check scored low or did not hear,
 *                     from the voice folder's word-check.json) or 'refuse' (a word not heard refuses the film, and so
 *                     does a voice with no check, or a check older than the voice's timings)
 * @param approval     an approval (approval.mjs · approveFilm, made from a watched render's making-of.json): the
 *                     render refuses if anything it was made from changed since (the record's `inputs`); the record
 *                     keeps who approved it, when, and what the approval does not lock
 * @param code         a fingerprint of the kits' drawing code (segments.mjs · codeFingerprint), kept in the record's
 *                     inputs: with it an approval locks the kits' code too
 * @param check        checks on the finished file (finished.mjs · checkVideo): null (the default: none), 'report'
 *                     (the record's `finished` lists what they found) or 'refuse' (a problem refuses the film);
 *                     `expect: {seconds, tolerance?}` is the length the brief asks for
 */
export async function makeFilm({storyboard, recipe, data = null, kits = [], theme, root = process.cwd(), hostKeys = [], narrationDir = null, timings = null, pacing = null, strings = null, lang = null, out, render = {}, approval = null, voiceCheck = 'report', code = null, check = null, expect = {}, cast = null, strategies = null}) {
  // The cast's names into the text before anything reads it: the pacing, the voice check, the chapters (cast.mjs).
  if (cast) { const c = readCast(cast); storyboard = withCast(storyboard, c, 'storyboard'); recipe = withCast(recipe, c, 'recipe'); if (strings) strings = withCast(strings, c, 'strings'); }
  if (check !== null && check !== 'report' && check !== 'refuse') throw new Error(`check is 'report' (the record lists what the checks on the finished file found), 'refuse' (a problem refuses the film) or left out, not ${JSON.stringify(check)}`);
  if (voiceCheck !== 'report' && voiceCheck !== 'refuse') throw new Error(`voiceCheck is 'report' (the record lists words the voice check did not hear) or 'refuse' (the film refuses them), not ${JSON.stringify(voiceCheck)}`);
  if (code !== null && !(typeof code === 'string' && code.trim())) throw new Error("code is a fingerprint of the kits' drawing code (codeFingerprint([kitsFolder])), or left out");
  if (approval) readApproval(approval);
  const dir = path.dirname(path.resolve(out)); mkdirSync(dir, {recursive: true});
  let film, paced, result, job, plan, inputs, finished = null, voice = null;
  const video = checkVideoStrategy(render.video ?? wholeVideo()), done = [];
  const stages = {
    'check-inputs': scope => {
      if (!storyboard?.scenes?.length) throw new Error('The storyboard has no scenes');
      // A silent cut has no voice speed to check; its holds and tails are checked the same way.
      if (pacing) validatePacing(narrationDir ? pacing : {voiceSpeed: 1, ...pacing}, storyboard);
      scope.scenes = storyboard.scenes.length;
      if (strings) scope.lang = lang;
    },
    'pace-narration': async scope => {
      if (narrationDir) {
        // Paced in a folder of its own: it takes the place of <out dir>/narration only once the film is allowed
        // (an approval refused leaves the approved render's narration as it was). The voice's files are copied, never
        // linked: a voice folder given as a symbolic link (or holding links) would otherwise be paced in place, through
        // the link — its audio rewritten and its timings.json replaced by the paced ones.
        const copy = path.join(dir, `.narration-${process.pid}`); rmSync(copy, {recursive: true, force: true}); cpSync(narrationDir, copy, {recursive: true, dereference: true});
        const raw = JSON.parse(readFileSync(path.join(copy, 'timings.json'), 'utf8'));
        // A voice knows only the spoken scenes: a silent scene it left out gets its directions' timing (clock.mjs · withDirections).
        paced = pacing ? await applyPacing({runDir: copy, board: storyboard, timings: raw, pacing}) : withDirections(storyboard, raw);
        writeFileSync(path.join(copy, 'timings.json'), JSON.stringify(paced, null, 2));
        scope.narration = copy;
        voice = readVoiceCheck(narrationDir);
        if (voiceCheck === 'refuse') {
          if (!voice) throw new Error(`voiceCheck: 'refuse' needs the voice's word check, and ${narrationDir} has no word-check.json: check the voice (check_words.py) before the final render`);
          if (!voice.checked) throw new Error(`voiceCheck: 'refuse' needs a word check that listened back (notHeardCount in ${path.join(narrationDir, 'word-check.json')}); this one only aligned the words: check the voice again (check_words.py)`);
          if (voice.stale) throw new Error(`voiceCheck: 'refuse': ${voice.stale}`);
          if (voice.notHeard.length) throw new Error(`The voice check did not hear ${voice.notHeard.map(w => `"${w.word}" (${w.scene})`).join(', ')}: choose another take (voice_takes.py), reword the line, or write a number as a say slot`);
        }
      } else {
        if (!timings) throw new Error('A silent film needs timings (word times per scene)');
        paced = pacing ? paceTimings(storyboard, timings, pacing) : withDirections(storyboard, timings); scope.narration = null;
      }
      scope.seconds = +paced.scenes.reduce((n, s) => n + s.duration, 0).toFixed(3);
      scope.pacing = paced.pacing ?? null;
    },
    'compile-film': async scope => {
      film = await compileFilm({storyboard, timings: paced, recipe, data, kits, theme, root, strings, hostKeys, cast, strategies, record: true});
      scope.beats = film.beats.length; scope.sounds = film.sounds.length; scope.total = +film.total.toFixed(3);
      // What the film is made from (film.inputs, and the pacing, the voice, the kits' code): an approval locks all of it.
      inputs = {...film.inputs, pacing: hashOf(pacing), ...(narrationDir ? {voice: voiceHash(narrationDir)} : {}), ...(code ? {code} : {})};
      if (approval) {
        try { requireApproval(approval, inputs); } catch (e) { if (scope.narration) rmSync(scope.narration, {recursive: true, force: true}); throw e; }
        scope.approvedBy = approval.by;
      }
      if (scope.narration) { const final = path.join(dir, 'narration'); rmSync(final, {recursive: true, force: true}); renameSync(scope.narration, final); scope.narration = final; }
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
    // The finished file, checked (finished.mjs): what a person would catch watching it, against what the film meant.
    'check-finished': async scope => {
      if (!check) { scope.checked = false; return; }
      const joins = (result.video?.segments ?? []).slice(1).map(s => Math.round(s.from * job.fps) + (job.withIntro ? Math.round(job.intro.seconds * job.fps) : 0));
      try {
        finished = await checkVideo({file: result.out, film, intro: job.withIntro ? job.intro.seconds : 0, from: job.start, to: job.to, captions: result.captions?.srt ?? result.captions?.vtt ?? null,
          joins, voiced: Boolean(narrationDir), expect, probe: ffmpegProbe({ffmpeg: job.ffmpeg})});
      } catch (e) {
        // The checks could not read the file (no ffprobe, say): a report says so; a refusal refuses.
        if (check === 'refuse') throw new Error(`The finished file could not be checked (check: 'refuse'): ${e.message}`, {cause: e});
        finished = {ok: null, error: e.message, checked: [], skipped: [], findings: []};
      }
      scope.checked = finished.checked; scope.problems = finished.findings.filter(f => f.severity === 'problem').length;
      if (check === 'refuse' && !finished.ok) throw new Error(`The finished file has ${scope.problems} problem${scope.problems > 1 ? 's' : ''} (check: 'refuse'): ${finished.findings.filter(f => f.severity === 'problem').slice(0, 3).map(f => `${f.check}: ${f.text}`).join('; ')}`);
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
    .addFunction('render-film', stages['render-film'], 'render-film')
    .addFunction('check-finished', stages['check-finished'], 'check-finished');
  const run = await chart.build().recorder(trace).run();
  const record = {
    schemaVersion: 1, made: new Date().toISOString(), out: result.out, seconds: result.seconds, chapters: result.chapters,
    // What part of the film this render shows (an approval is of a render of the whole film).
    span: {from: job.start, to: +job.to.toFixed(3), total: +film.total.toFixed(3), whole: job.start === 0 && job.to >= film.total - 1e-6, ...(job.withIntro ? {intro: job.intro.seconds} : {})},
    // What the film was made from, hashed: approveFilm takes these from this record (approval.mjs).
    inputs,
    ...(approval ? {approval: {by: approval.by, approved: approval.approved, ...(approval.note ? {note: approval.note} : {}), ...(approval.render ? {render: approval.render} : {}), unlocked: unlocked(inputs)}} : {}),
    ...(voice ? {voice} : {}),
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
    // What the sound asks of the ear (listening.mjs): the film's changes of picture and the effects against the voice.
    ...(film.listening.length || result.listening.length ? {listening: [...film.listening, ...result.listening]} : {}),
    loudness: loudnessRecord(result.loudness),
    ...(result.video ? {picture: result.video} : {}),
    ...(finished ? {finished: {ok: finished.ok, checked: finished.checked, skipped: finished.skipped, findings: finished.findings, ...(finished.error ? {error: finished.error} : {})}} : {}),
    tools: TOOLS(),
    pipeline: trace.getEntries(),
    // The compile, stage by stage (record.mjs · recordSteps): what each stage read and wrote, every line as when.<recipe path>.
    compile: film.record.narrative,
  };
  const makingOf = path.join(dir, 'making-of.json');
  writeFileSync(makingOf, JSON.stringify(record, null, 2));
  return {...result, makingOf};
}
