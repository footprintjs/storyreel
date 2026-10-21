/**
 * Make a film as a footprintjs flowchart. Each stage is recorded as it runs, so every film comes
 * with its making-of record (making-of.json): the stages and how long they took, every phrase
 * that triggered a drawing and when (and the recipe entry that asked for it), the compile stage by
 * stage (compileFilm's record: its footprintjs narrative), the director's notes as applied, the
 * pacing, every number on screen and its source (the claims verdict, check-claims), the loudness as
 * measured and set, the tools and versions used.
 *
 * Heavy things (the compiled film, canvases) never enter the flowchart's tracked scope; stages
 * pass small values and file paths, as footprintjs expects.
 */
import {castFilm, checkCode, checkInputs, outFolder, pacedTimings, compileForRender, planPicture} from './prepare.mjs';
import {readFileSync, writeFileSync, rmSync, existsSync, statSync} from 'node:fs';
import {placeVoice, writeOutput, refuseFolders, makeFolder} from './files.mjs';
import path from 'node:path';
import {flowChart, narrative} from 'footprintjs';
import {finishRender, closeRender} from './render.mjs';
import {checkPictureOptions} from './picture.mjs';
import {makeScratch, sweepScratch} from './scratch.mjs';
import {readApproval, requireApproval, voiceHash, unlocked} from './approval.mjs';
import {hashOf} from './hash.mjs';
import {checkVideo, ffmpegProbe} from './finished.mjs';
import {verdictChart} from './verdict.mjs';
import {claimsCount, unsourcedClaims, claimText, CLAIMS_VERDICT} from './claims.mjs';
import {installedVersion, lockedVersions} from './versions.mjs';
import {codeCover, storyreelCode, MAX_PIECES} from './segments.mjs';
import {beatMap, likelyTempi} from './beats.mjs';
import {readMusic, musicHash, fitToMusic, fitVoice} from './music.mjs';

const version = installedVersion;
/** The code fingerprint with what it covered, for the record: {fingerprint, files?, packages?}. */
function codeRecord(fingerprint, root) {
  const cover = codeCover(fingerprint);
  const from = f => path.relative(root, f).split(path.sep).join('/');
  return cover ? {fingerprint, files: cover.files.map(from), packages: [...cover.packages],
    ...(cover.missing.length ? {missing: cover.missing.map(m => `${from(m.from)}: ${m.spec}`)} : {}), ...(cover.unfollowed.length ? {unfollowed: cover.unfollowed.map(u => `${from(u.from)}: ${u.code}`)} : {}),
    ...(cover.unparsed.length ? {unparsed: cover.unparsed.map(u => ({file: from(u.file), from: u.from}))} : {})}
    : {fingerprint, files: 'not listed: the fingerprint was made in another process'};
}
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
/**
 * The music in the making-of record: the song and its level, its beat map (tempo, the verdict and how sure, the levels
 * tried and why each failed, the alternatives, the drop), where it starts on the film, the grid the film actually cut
 * on (beats.mjs · safeBeats), every cut's verdict, the two records — the beat map's and the fit's — and, when the map is
 * unsure, the finding that says so and how to settle it.
 */
function musicRecord(song, beats, fit) {
  const unsure = !beats.sure && song.snap;
  return {file: path.basename(song.file), gain: song.gain, fadeOut: song.fadeOut, start: fit.start,
    beats: {bpm: beats.bpm, verdict: beats.verdict, sure: beats.sure, levels: beats.levels, alternatives: beats.alternatives.map(({bpm, score}) => ({bpm, score})),
      beats: beats.beats.length, bars: beats.bars.length, drop: beats.drop, confidence: beats.confidence, seconds: beats.seconds, record: beats.record},
    fit: {snap: song.snap, ...(song.dropOn ? {dropOn: song.dropOn} : {}), cutOn: fit.cutOn, cuts: fit.cuts, record: fit.record},
    ...(unsure && beats.phase === 'unsure' ? {findings: [{kind: 'phase-unsure', tempi: likelyTempi(beats), text: `the tempo given (${beats.bpm} BPM) sits between the beats heard: its phase is unsure, so no cut moves onto the beat — try music.bpm ${likelyTempi(beats)[0]}`}]} : {}),
    ...(unsure && beats.phase !== 'unsure' ? {findings: [{kind: 'tempo-unsure', tempi: likelyTempi(beats), text: `tempo unsure (close): cuts only on beats every candidate shares (${fit.cutOn.beats} of ${fit.cutOn.of}${fit.cutOn.unsure ? `; none, as ${fit.cutOn.unsure.join(', ')} BPM is unsure of its phase` : ''}); give music.bpm (one of ${likelyTempi(beats).join(', ')}) to cut on every beat — storyreel beats <song> shows why`}]} : {})};
}

/** The most parts a picture is planned in (segments.mjs · MAX_PIECES: a longer film is planned in longer pieces). */
const MAX_PARTS = MAX_PIECES;

/**
 * @param storyboard, recipe, data, kits, theme, root, hostKeys — as compileFilm
 * @param narrationDir a folder with the UNPACED timings.json and the scene audio (or null → silent;
 *                     then pass `timings` with word times, e.g. evenTimings(storyboard)). It is only ever read: the
 *                     render paces a copy of what it reads — timings.json and each scene's audio, which must be named
 *                     inside the folder (files.mjs · copyVoice) — and that copy becomes <out dir>/narration, so an out
 *                     folder that overlaps the voice folder is refused before anything is written (requireVoiceApart)
 * @param pacing       {sceneTail, holds, tails?, voiceSpeed?} — applied to a copy of the narration, or
 *                     to the word times of a silent cut (the same holds, so a pause-and-guess waits)
 * @param strings      the string table for the film's language ({key: text})
 * @param lang         the language the film is shown in (a BCP 47 tag: "de", "fr", "en-IN", "ta"): it names the string
 *                     table, and the numbers on screen are read by it (compileFilm's lang, film.lang)
 * @param out          the .mp4 to write; making-of.json is written beside it
 * @param render       extra options for renderFilm (intro, stamp, from, to, width, height, layout, motionBlur,
 *                     captionFiles, video, whole, segments…); a layout, motion blur or caption files are written into the
 *                     record as `version`. The picture is drawn in pieces kept beside the video by default (picture.mjs ·
 *                     pictureStrategy), each its own subflow, and the record's `picture` says which were drawn — and
 *                     why — and which were reused (picture.line, one line to read)
 * @param voiceCheck   'report' (the default: the record lists the words the voice check scored low or did not hear,
 *                     from the voice folder's word-check.json) or 'refuse' (a word not heard refuses the film, and so
 *                     does a voice with no check, or a check older than the voice's timings)
 * @param approval     an approval (approval.mjs · approveFilm, made from a watched render's making-of.json): the
 *                     render refuses if anything it was made from changed since (the record's `inputs`); the record
 *                     keeps who approved it, when, and what the approval does not lock
 * @param code         a fingerprint of the kits' drawing code (segments.mjs · codeFingerprint), kept in the record's
 *                     inputs: with it an approval locks the kits' code too, and a cached piece a kit draws that says
 *                     nothing of where its code lives (kit.sources) is keyed by it
 * @param check        checks on the finished file (finished.mjs · checkVideo): null (the default: none), 'report'
 *                     (the record's `finished` lists what they found) or 'refuse' (a problem refuses the film);
 *                     `expect: {seconds, tolerance?}` is the length the brief asks for
 * @param music        a song under the film (music.mjs · readMusic): {file, gain?, snap?, dropOn?, bpm?, drop?, fadeOut?}.
 *                     Its beat map (beats.mjs · beatMap) and the fit (music.mjs · fitToMusic: scene starts onto the beat, the
 *                     drop on a key moment) run as stages of their own after the pacing; a voiced cut's audio is cut to the new
 *                     lengths in the run's copy (music.mjs · fitVoice); the record's `music` keeps both records. Left out, nothing
 *                     changes.
 * @param reducedMotion true: the recipe's camera moves are cut to their end framing, handheld off (as compileFilm);
 *                     the record's `camera` says how they were played and why, and the film's inputs say so
 * @param claims       every number on screen has a source (claims.mjs: a fact the storyboard names, or an example
 *                     scene), a verdict the record keeps with its decide() evidence: 'report' (the default: the record's
 *                     `claims` lists the numbers with no source) or 'refuse' (one refuses the film before it is drawn,
 *                     and so does a film whose numbers cannot be checked: the storyboard names no facts)
 */
export async function makeFilm({storyboard, recipe, data = null, kits = [], theme, root = process.cwd(), hostKeys = [], narrationDir = null, timings = null, pacing = null, strings = null, lang = null, out, render = {}, approval = null, voiceCheck = 'report', code = null, check = null, expect = {}, cast = null, strategies = null, music = null, reducedMotion = false, claims = 'report'}) {
  // The cast's names into the text before anything reads it: the pacing, the voice check, the chapters (cast.mjs).
  ({storyboard, recipe, strings} = castFilm({storyboard, recipe, strings, cast}));
  if (check !== null && check !== 'report' && check !== 'refuse') throw new Error(`check is 'report' (the record lists what the checks on the finished file found), 'refuse' (a problem refuses the film) or left out, not ${JSON.stringify(check)}`);
  if (voiceCheck !== 'report' && voiceCheck !== 'refuse') throw new Error(`voiceCheck is 'report' (the record lists words the voice check did not hear) or 'refuse' (the film refuses them), not ${JSON.stringify(voiceCheck)}`);
  if (claims !== 'report' && claims !== 'refuse') throw new Error(`claims is 'report' (the record lists the numbers on screen with no source) or 'refuse' (one refuses the film), not ${JSON.stringify(claims)}`);
  checkCode(code);
  if (approval) readApproval(approval);
  const song = music === null ? null : readMusic(music);
  if (song && render.music !== undefined) throw new Error('makeFilm takes the song as music ({file, snap?, dropOn?, …}), which also places it; leave render.music out');
  // First of all, the out folder's REAL path, with no folder on the way another user could rearrange: the film is made
  // through it only. Before anything is written, even the out folder: the voice is paced in the out folder and then
  // replaces its narration folder, so the two must not overlap (prepare.mjs · outFolder).
  const ready = outFolder({out, narrationDir}), {dir} = ready;
  out = ready.out;
  // The record is written last, after the video: a folder at its name refuses now (the render's own outputs are checked
  // when it is prepared, before a frame is drawn: render.mjs · prepareJob).
  refuseFolders([path.join(dir, 'making-of.json')]);
  makeFolder(dir);
  // Where the voice is paced: a copy of it, in a new folder made when the voice is read (scratch.mjs · makeScratch: one
  // only this user can open, never a path already there), after sweeping the copies stopped runs left. The render reads
  // it, and it becomes <out dir>/narration once the film is made, or is removed.
  const voices = sweepScratch(dir, '.narration');
  let copy = null;
  const dropCopy = () => { if (copy) rmSync(copy, {recursive: true, force: true}); };
  let film, paced, result, job, plan, inputs, finished = null, voice = null, placed = null, beats = null, fit = null;
  // How the picture is made is decided once the render is prepared (plan-picture); its options refuse now.
  checkPictureOptions(render);
  let video = null;
  const done = [];
  const stages = {
    'check-inputs': scope => {
      // A silent cut has no voice speed to check; its holds and tails are checked the same way (prepare.mjs · checkInputs).
      checkInputs({storyboard, narrationDir, pacing});
      scope.scenes = storyboard.scenes.length;
      if (strings) scope.lang = lang;
    },
    'pace-narration': async scope => {
      if (narrationDir) {
        // Paced in a folder of its own: it takes the place of <out dir>/narration only once the film is made (an approval
        // refused, numbers with no source, or a render that fails leave the folder's narration as it was; two films made
        // at once each read their own). The copy holds exactly what the render reads — timings.json and each scene's
        // audio — as new files (files.mjs · copyVoice): pacing rewrites them, and a voice given through links, or
        // read-only, is never paced in place. Nothing else is copied.
        copy = makeScratch(dir, '.narration');
        paced = await pacedTimings({storyboard, narrationDir, pacing, copy});
        scope.narration = copy;
        voice = readVoiceCheck(narrationDir);
        if (voiceCheck === 'refuse') {
          if (!voice) throw new Error(`voiceCheck: 'refuse' needs the voice's word check, and ${narrationDir} has no word-check.json: check the voice (check_words.py) before the final render`);
          if (!voice.checked) throw new Error(`voiceCheck: 'refuse' needs a word check that listened back (notHeardCount in ${path.join(narrationDir, 'word-check.json')}); this one only aligned the words: check the voice again (check_words.py)`);
          if (voice.stale) throw new Error(`voiceCheck: 'refuse': ${voice.stale}`);   // refusal: voice.stale says what to check again
          if (voice.notHeard.length) throw new Error(`The voice check did not hear ${voice.notHeard.map(w => `"${w.word}" (${w.scene})`).join(', ')}: choose another take (voice_takes.py), reword the line, or write a number as a say slot`);
        }
      } else {
        paced = await pacedTimings({storyboard, timings, pacing}); scope.narration = null;
      }
      scope.seconds = +paced.scenes.reduce((n, s) => n + s.duration, 0).toFixed(3);
      scope.pacing = paced.pacing ?? null;
    },
    // The song's beat map: its own flowchart, its record kept in making-of.json (music.beats.record).
    'map-beats': async scope => {
      beats = await beatMap(song.file, {...song.beats, ...(render.ffmpeg ? {ffmpeg: render.ffmpeg} : {})});
      scope.bpm = beats.bpm; scope.verdict = beats.verdict; scope.songBeats = beats.beats.length; scope.drop = beats.drop; scope.confidence = beats.confidence;
    },
    // The film fitted to it: scene starts onto the beat, the drop on its key moment; a voiced cut's audio follows (the
    // run's copy: a voice that cannot be cut — not a 16-bit PCM WAV — refuses, and the copy goes as any failed run's does).
    'fit-to-music': async scope => {
      fit = await fitToMusic({storyboard, timings: paced, beats, snap: song.snap ?? false, dropOn: song.dropOn, recipe, kits});
      paced = scope.narration ? fitVoice(scope.narration, paced, fit.timings) : fit.timings;
      if (scope.narration) writeFileSync(path.join(scope.narration, 'timings.json'), JSON.stringify(paced, null, 2));
      scope.start = fit.start; scope.cutOn = fit.cutOn.grid; scope.moved = fit.cuts.filter(c => c.verdict === 'moved').length;
      scope.seconds = +paced.scenes.reduce((n, s) => n + s.duration, 0).toFixed(3);
    },
    'compile-film': async scope => {
      film = await compileForRender({storyboard, recipe, data, kits, theme, root, strings, lang, hostKeys, cast, strategies, reducedMotion}, paced);
      scope.beats = film.beats.length; scope.sounds = film.sounds.length; scope.total = +film.total.toFixed(3);
      // What the film is made from (film.inputs, and the pacing, the voice, the kits' code): an approval locks all of it.
      // Sounds placed by their peaks change what is heard, so an approval locks that too — only when it is asked for.
      // …and what draws and decides it: StoryReel's version and its code (the engine's fingerprint, as every segment key
      // holds it: every file of its code and the versions of what it draws with — a `file:` dependency keeps its version
      // while its code changes), and footprintjs's version (versions.mjs · lockedVersions).
      inputs = {...film.inputs, pacing: hashOf(pacing), ...(narrationDir ? {voice: voiceHash(narrationDir)} : {}), ...(code ? {code} : {}), ...lockedVersions(), engine: storyreelCode(), ...(song ? {music: musicHash(song)} : {}), ...(render.soundAt === 'peak' ? {soundAt: 'peak'} : {})};
      if (approval) {
        try { requireApproval(approval, inputs); } catch (e) { if (scope.narration) rmSync(scope.narration, {recursive: true, force: true}); throw e; }
        scope.approvedBy = approval.by;
      }
    },
    // The film is made (approved, its claims checked, drawn and checked): the paced voice the render read — its own copy,
    // never a folder another run could replace — becomes <out dir>/narration. The last stage, so a film refused or
    // failed anywhere before it leaves the folder's narration as it was.
    'place-narration': scope => {
      if (!scope.narration) return;
      // Placed with the mode a plain folder gets (the copy was made 0700); another film placing its voice in this folder at
      // the same moment: tried once more, and said in the record (files.mjs · placeVoice).
      const final = path.join(dir, 'narration'), again = placeVoice(scope.narration, final);
      scope.narration = final; copy = null;
      if (again) { scope.placedAgain = again; placed = again; }
    },
    // The picture: planned as one pass or as segments (render.mjs · wholeVideo, segments.mjs · segmentedVideo).
    'plan-picture': scope => {
      // The job is held as soon as it is made: a refusal after it still records what its sweep removed (sweptRecord).
      ({video} = planPicture({film, storyboard, timings: paced, narrationDir: scope.narration, out, render, code,
        music: song ? {file: song.file, start: fit.start, gain: song.gain, fadeOut: song.fadeOut} : null}, made => { job = made; }));
      plan = video.plan(job);
      if (plan.length > MAX_PARTS) throw new Error(`The picture is planned in ${plan.length} parts; at most ${MAX_PARTS} can be drawn (segments.mjs · planPieces: give the segments a larger minSeconds)`);
      scope.picture = {strategy: video.name, parts: plan.length};
      scope.parts = plan.map(p => ({index: p.index, frames: p.f1 - p.f0, ...(p.key ? {key: p.key, scenes: [...p.scenes]} : {})}));
    },
    'render-film': async scope => {
      const picture = await video.join(job, done);
      result = await finishRender(job, picture);
      scope.out = result.out; scope.chapters = result.chapters; scope.loudness = result.loudness.type;
      if (result.video) { scope.reused = result.video.reused; scope.rendered = result.video.rendered; }
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
  // Every number on screen has a source (claims.mjs): a verdict decided with decide() over the counts (verdict.mjs), so the
  // record says why it passed, failed or could not run. A refusal comes before anything is drawn, and leaves the voice
  // folder as it was (the paced copy is removed).
  const refuse = message => { dropCopy(); throw new Error(message); };
  // What this check reads: the lines the film declares (film.claims), never the picture — it draws no frame. The review
  // reads what the picture draws too (claims.mjs · drawnClaims); the refusal and the record say so.
  const SAW = 'declared lines only (the review also reads what the picture draws)';
  const claimsCheck = verdictChart({name: 'check-claims', id: 'check-claims', description: 'Every number on screen, sourced by a fact or shown in an example scene', verdict: CLAIMS_VERDICT,
    measure: s => { Object.assign(s, claimsCount(film.claims)); s.measured = true; },
    on: claims !== 'refuse' ? {} : {
      failed: () => { const open = unsourcedClaims(film.claims); refuse(`The film shows ${open.length} number${open.length > 1 ? 's' : ''} with no source (claims: 'refuse'; the check saw ${SAW}): ${open.slice(0, 3).map(claimText).join('; ')}${open.length > 3 ? `; and ${open.length - 3} more` : ''}`); },
      'not run': s => refuse(`claims: 'refuse' needs the facts the numbers on screen come from (the check saw ${SAW}) — ${s.why}: give the storyboard "facts": "facts.json" ([{"value", "text"?, "source"}]), or mark the scenes that show example data "example": true`),
    }});
  const trace = narrative();
  let chart = flowChart('check-inputs', stages['check-inputs'], 'check-inputs')
    .addFunction('pace-narration', stages['pace-narration'], 'pace-narration');
  // Only a film with a song has the music's stages: without one, the pipeline and its record are as they were.
  if (song) chart = chart.addFunction('map-beats', stages['map-beats'], 'map-beats').addFunction('fit-to-music', stages['fit-to-music'], 'fit-to-music');
  chart = chart.addFunction('compile-film', stages['compile-film'], 'compile-film')
    .addSubFlowChartNext('check-claims', claimsCheck, 'check-claims', {outputMapper: o => ({claims: {verdict: o.verdict, why: o.why}})})
    .addFunction('plan-picture', stages['plan-picture'], 'plan-picture')
    .addParallelForEach('render-picture', 'render-picture', {items: scope => scope.parts ?? [], branch: part, maxBranches: MAX_PARTS, into: 'partsDone', failFast: true})
    .addFunction('render-film', stages['render-film'], 'render-film')
    .addFunction('check-finished', stages['check-finished'], 'check-finished')
    .addFunction('place-narration', stages['place-narration'], 'place-narration');
  // Finished or failed, what the run made to work with goes: the render's working files (render.mjs · closeRender:
  // kept only in a `work` folder the caller named) and a paced copy of the voice that never became <out dir>/narration.
  // What this run swept before making its own scratch folders (the ones stopped runs left: scratch.mjs), and what it could
  // not remove — skipped, never a reason to stop.
  const sweptRecord = () => {
    const swept = [...voices.swept, ...(job?.swept ?? [])], unswept = [...voices.failed, ...(job?.unswept ?? [])];
    return swept.length || unswept.length ? {swept: {count: swept.length, names: swept, ...(unswept.length ? {failed: unswept} : {})}} : {};
  };
  // A run that fails keeps its making-of record too: the failed run is the one most worth reading. It is written as
  // making-of.failed.json — a finished render's making-of.json is never replaced — marked failed with the error's text,
  // holding what the run got to (approval.mjs · approveFilm refuses it); then the error goes on to the caller as it was.
  // A record that cannot be written never takes the error's place.
  const keepFailedRecord = error => {
    try {
      const record = {
        schemaVersion: 1, failed: {error: errorText(error)}, made: new Date().toISOString(),
        ...(inputs ? {inputs} : {}),
        ...(voice ? {voice} : {}),
        ...(paced ? {pacing: paced.pacing ?? null} : {}),
        ...sweptRecord(),
        tools: TOOLS(),
        pipeline: trace.getEntries(),
        ...(film?.record ? {compile: film.record.narrative} : {}),
      };
      writeOutput(path.join(dir, 'making-of.failed.json'), JSON.stringify(record, null, 2));
    } catch { /* the run's own error is the one to see */ }
  };
  let run;
  try { run = await chart.build().recorder(trace).run(); }
  catch (error) { keepFailedRecord(error); throw error; }
  finally { closeRender(job); dropCopy(); }
  const record = {
    schemaVersion: 1, made: new Date().toISOString(), out: result.out, seconds: result.seconds, chapters: result.chapters,
    // What part of the film this render shows (an approval is of a render of the whole film).
    span: {from: job.start, to: +job.to.toFixed(3), total: +film.total.toFixed(3), whole: job.start === 0 && job.to >= film.total - 1e-6, ...(job.withIntro ? {intro: job.intro.seconds} : {})},
    // What the film was made from, hashed: approveFilm takes these from this record (approval.mjs).
    inputs,
    // The kits' code the fingerprint covers (segments.mjs · codeFingerprint follows the imports): every file, from the
    // film's root, and every package by its version — or only the fingerprint, when it was made in another process.
    ...(code ? {code: codeRecord(code, root)} : {}),
    ...(approval ? {approval: {by: approval.by, approved: approval.approved, ...(approval.note ? {note: approval.note} : {}), ...(approval.render ? {render: approval.render} : {}), unlocked: unlocked(inputs)}} : {}),
    ...(voice ? {voice} : {}),
    ...(strings ? {strings: {lang, used: film.strings}} : {}),
    pacing: paced.pacing ?? null,
    ...(result.poster ? {poster: {file: path.basename(result.poster), at: film.posterAt}} : {}),
    // The version made: its format (layout.mjs), its motion blur, sounds placed by their peaks, the caption files beside it.
    ...(result.format || render.motionBlur || result.captions || render.soundAt === 'peak' ? {version: {format: result.format ?? 'frame', ...(render.motionBlur ? {motionBlur: render.motionBlur} : {}), ...(render.soundAt === 'peak' ? {soundAt: 'peak'} : {}),
      ...(result.captions ? {captionFiles: Object.values(result.captions).map(f => path.basename(f))} : {})}} : {}),
    ...(film.reading.length ? {reading: {tooShort: film.reading}} : {}),
    // Every number on screen and where it comes from (claims.mjs), with the verdict and why (check-claims).
    claims: {...(run?.state ?? run?.sharedState ?? {}).claims, saw: SAW, ...(film.lang ? {lang: film.lang} : {}), ...claimsCount(film.claims), unsourced: unsourcedClaims(film.claims).map(c => ({number: c.number, scene: c.scene, path: c.path, at: c.at, fix: claimText(c)}))},
    // Each beat: what was said, when, and the recipe entry that asked for it.
    beats: film.beats.map(({ref, t, path}) => ({said: Array.isArray(ref) ? {scene: ref[0], phrase: ref[1], plus: ref[2] ?? 0} : ref, at: t, ...(path ? {entry: path} : {})})),
    ...(film.notes.length ? {notes: film.notes} : {}),
    ...sweptRecord(),
    // The voice was put in place on a second try (another film placed its own in this folder at the same moment).
    ...(placed ? {narration: {placedAgain: placed}} : {}),
    // The camera's moves as played (camerawork.mjs): moves, or cuts for reduced motion, and why; each move placed.
    ...(film.camera ? {camera: {motion: film.camera.motion, decision: film.camera.decision, moves: film.camera.moves}} : {}),
    sounds: film.sounds.length,
    // The found sounds it plays (found/): each one's record — source, id, licence, attribution, sha256 — for the credits
    // (release.mjs · creditsText reads them from here) and for anyone asking where a sound came from.
    ...(film.foundSounds?.length ? {foundSounds: film.foundSounds.map(f => f.record)} : {}),
    // What the sound asks of the ear (listening.mjs): the film's changes of picture and the effects against the voice.
    ...(film.listening.length || result.listening.length ? {listening: [...film.listening, ...result.listening]} : {}),
    loudness: loudnessRecord(result.loudness),
    // The song: its beat map and the fit, each with its own record (every verdict with its evidence).
    ...(song ? {music: musicRecord(song, beats, fit)} : {}),
    ...(result.video ? {picture: result.video} : {}),
    ...(finished ? {finished: {ok: finished.ok, checked: finished.checked, skipped: finished.skipped, findings: finished.findings, ...(finished.error ? {error: finished.error} : {})}} : {}),
    tools: TOOLS(),
    pipeline: trace.getEntries(),
    // The compile, stage by stage (record.mjs · recordSteps): what each stage read and wrote, every line as when.<recipe path>.
    compile: film.record.narrative,
  };
  const makingOf = path.join(dir, 'making-of.json');
  writeOutput(makingOf, JSON.stringify(record, null, 2));
  return {...result, makingOf};
}

/** The text of what a run threw, for its record: an Error's message, anything else as a string — never a throw itself. */
function errorText(error) {
  try { return error instanceof Error ? String(error.message) : String(error); } catch { return 'a thrown value that cannot be shown as text'; }
}
