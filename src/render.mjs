/**
 * Render a compiled film to an MP4: frames from film.frame(ctx, t), the paced narration scene by
 * scene (a silent scene with no audio plays generated silence), the sound accents per scene (at most
 * 64 each), loudness in two passes. FFmpeg must be on PATH.
 */
import {writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createCanvas} from '@napi-rs/canvas';
import {createMotionSound, soundsByScene} from './sound.mjs';
import {compileLayout} from './layout.mjs';
import {captionChunks, captionFile, FILE_CHUNKS} from './captions.mjs';

/**
 * Loudness in two passes (FFmpeg's loudnorm): measure the whole mixed film, then set it with ONE fixed
 * gain (`linear=true`) from what was measured, so a quiet opening stays quiet instead of being raised to
 * the voice's level. A film with no measurable loudness (pure silence: FFmpeg reports -inf) is left as
 * it is; loudnorm's varying mode turns silence into NaN and the AAC encoder refuses it. In linear mode
 * loudnorm reads the range target only as a gate (measured range above it → varying mode), so when the
 * caller set no LRA the second pass raises it to the measured range (render.mjs · effectiveTarget); what
 * can still force the varying mode is the true-peak limit, a film under 3 s, or an LRA the caller set.
 * The type it reports says so, and the making-of record flags it (pipeline.mjs · loudnessRecord).
 */
const LOUDNESS_FORMAT = 'aformat=channel_layouts=stereo';
const finite = s => { const n = Number(s); return Number.isFinite(n) ? n : null; };
const loudnormTarget = ({I, TP, LRA}) => `I=${I}:TP=${TP}${LRA === undefined ? '' : `:LRA=${LRA}`}`;

/** The last JSON report loudnorm printed on stderr (print_format=json), or null. */
export function parseLoudnormReport(stderr) {
  const found = String(stderr).match(/\{[^{}]*"input_i"[^{}]*\}/g);
  return found ? JSON.parse(found[found.length - 1]) : null;
}

/** A report's input measurement as numbers; -inf (silence) and anything unreadable become null. */
export function measuredLoudness(report) {
  return {I: finite(report.input_i), TP: finite(report.input_tp), LRA: finite(report.input_lra), thresh: finite(report.input_thresh), offset: finite(report.target_offset)};
}

/** The second pass's filter: the target, what the first pass measured, one fixed gain, a report. */
// measured_LRA=0 is FFmpeg's "not measured" sentinel (the option's default), answered with the varying
// mode; a steady film really measures 0, the easiest case for one gain, so it is sent as 0.1 (the range
// only gates linear mode). loudness.measured keeps the true value.
export function linearLoudnorm(target, m) {
  return `loudnorm=${loudnormTarget(target)}:measured_I=${m.I}:measured_TP=${m.TP}:measured_LRA=${Math.max(m.LRA, 0.1)}:measured_thresh=${m.thresh}:offset=${m.offset}:linear=true:print_format=json`;
}

/**
 * The second pass's target: the caller's, and when the caller set no LRA, the measured range rounded up
 * (at least FFmpeg's 7, at most its 50) — linear mode reads LRA only to decide whether to stay linear, so
 * raising it changes no sound; it only stops a quiet stretch from forcing the varying gain.
 */
export function effectiveTarget(target, m) {
  return target.LRA !== undefined ? target : {...target, LRA: Math.min(50, Math.max(7, Math.ceil(m.LRA)))};
}

/** Run FFmpeg and keep what it reports (loudnorm prints its JSON at the info level, on stderr); a missing or killed FFmpeg fails here. */
function runReporting(ffmpeg, args) {
  const r = spawnSync(ffmpeg, ['-y', '-hide_banner', '-nostats', '-loglevel', 'info', ...args], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  if (r.error || r.status !== 0) {
    const why = r.error ? r.error.message : r.status === null ? `killed by ${r.signal}` : `exit ${r.status}`;
    throw new Error(`ffmpeg failed (${why}): ${args.join(' ').slice(0, 200)}\n${String(r.stderr ?? '').slice(-800)}`);
  }
  return r.stderr;
}

/** Why a measurement cannot drive the second pass, or null: silence (no integrated loudness), else the fields FFmpeg left unreadable. */
export function unusableReason(m) {
  if (m.I === null) return 'the audio is silent: there is no loudness to measure';
  const missing = Object.keys(m).filter(k => m[k] === null);
  return missing.length ? `could not read: ${missing.join(', ')}` : null;
}

/** Pass 1: measure the mixed film's loudness (render.mjs · measuredLoudness), and why it is unusable, if it is. */
function measureFilm(ffmpeg, wav, target) {
  const report = parseLoudnormReport(runReporting(ffmpeg, ['-i', wav, '-af', `${LOUDNESS_FORMAT},loudnorm=${loudnormTarget(target)}:print_format=json`, '-f', 'null', '-']));
  if (!report) throw new Error('ffmpeg loudnorm printed no measurement (print_format=json); is this FFmpeg built with loudnorm?');
  const measured = measuredLoudness(report);
  return {measured, reason: unusableReason(measured)};
}

/**
 * Pass 2, while the video and sound are muxed: one fixed gain from the measurement, or none for a silent
 * film. Returns {type, target, measured, reason?}: type is FFmpeg's reported normalization type
 * ('linear' when one fixed gain was kept, 'dynamic' when loudnorm fell back to varying it) or 'skipped';
 * target is what the second pass asked for (render.mjs · effectiveTarget).
 */
function muxWithLoudness({ffmpeg, video, wav, out, target}) {
  const {measured, reason} = measureFilm(ffmpeg, wav, target);
  const mux = af => ['-i', video, '-i', wav, '-map', '0:v', '-map', '1:a', '-af', af, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out];
  if (reason) {
    runReporting(ffmpeg, mux(`${LOUDNESS_FORMAT},aresample=48000`));
    return {type: 'skipped', target, measured, reason};
  }
  const asked = effectiveTarget(target, measured);
  const report = parseLoudnormReport(runReporting(ffmpeg, mux(`${LOUDNESS_FORMAT},${linearLoudnorm(asked, measured)},aresample=48000`)));
  if (!report?.normalization_type) throw new Error('ffmpeg loudnorm did not report its normalization type in the second pass');
  return {type: report.normalization_type, target: asked, measured};
}

const LOUDNESS_KEYS = {I: 'integrated loudness, LUFS, -70..-5', TP: 'true peak, dBTP, -9..0', LRA: 'loudness range, LU, 1..50'};
const LOUDNESS_RANGE = {I: [-70, -5], TP: [-9, 0], LRA: [1, 50]};

/** The `loudness` render option: I and TP required, LRA optional, each a finite number in FFmpeg's range; anything else refuses with the fix. */
export function checkLoudnessTarget(loudness) {
  const all = 'loudness takes {I, TP, LRA?}: ' + Object.entries(LOUDNESS_KEYS).map(([k, v]) => `${k} (${v})`).join(', ');
  if (!loudness || typeof loudness !== 'object' || Array.isArray(loudness)) throw new Error(`loudness must be an object, e.g. {I: -16, TP: -1.5}; ${all}`);
  for (const key of Object.keys(loudness)) {
    if (LOUDNESS_KEYS[key]) continue;
    const near = Object.keys(LOUDNESS_KEYS).find(k => k.toLowerCase() === key.toLowerCase());
    throw new Error(near ? `loudness.${key} is not a key: use ${near} (${LOUDNESS_KEYS[near]})` : `loudness.${key} is not a key; ${all}`);
  }
  for (const [key, [lo, hi]] of Object.entries(LOUDNESS_RANGE)) {
    const v = loudness[key];
    if (v === undefined && key === 'LRA') continue;
    if (v === undefined) throw new Error(`loudness.${key} is missing: give ${key} (${LOUDNESS_KEYS[key]}), e.g. {I: -16, TP: -1.5}`);
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`loudness.${key} must be a finite number (${LOUDNESS_KEYS[key]}), not ${JSON.stringify(v)}`);
    if (v < lo || v > hi) throw new Error(`loudness.${key} = ${v} is outside FFmpeg's range: use ${lo}..${hi} (${LOUDNESS_KEYS[key]})`);
  }
}

/**
 * The voice, scene by scene, into `voice`: each scene's audio from narrationDir, and generated silence
 * of its duration for a silent scene whose timing names no audio (clock.mjs · directionTimings). FFmpeg's
 * concat joins only files of one format, so when any silence is generated every part is first made
 * 48 kHz mono; a film with audio for every scene is joined as it always was.
 */
function joinVoice(run, {dir, storyboard, timings, narrationDir, voice}) {
  const given = timings.scenes.map((s, i) => {
    if (s.audio) return path.resolve(narrationDir, s.audio);
    if (storyboard.scenes[i]?.silent === undefined) throw new Error(`scene ${s.id} has no audio in its timing: only a silent scene's audio is generated`);
    return null;
  });
  const parts = !given.includes(null) ? given : given.map((file, i) => {
    const part = path.join(dir, `film-voice-${i}.wav`);
    run(file ? ['-i', file, '-ar', '48000', '-ac', '1', part] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', String(timings.scenes[i].duration), part]);
    return part;
  });
  writeFileSync(path.join(dir, 'film-narration.txt'), parts.map(f => `file '${f}'`).join('\n') + '\n');
  run(['-f', 'concat', '-safe', '0', '-i', path.join(dir, 'film-narration.txt'), '-ar', '48000', '-ac', '1', voice]);
}

const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** The motionBlur option: null, a number of subframes, or {subframes 2–16, shutter 0.1–1 (default 0.5)}. */
export function readMotionBlur(v) {
  if (v === null || v === undefined || v === false) return null;
  const o = typeof v === 'number' ? {subframes: v} : v;
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('motionBlur must be a number of subframes or {subframes, shutter}');
  for (const key of Object.keys(o)) if (!['subframes', 'shutter'].includes(key)) throw new Error(`motionBlur has unsupported key ${key} (the keys are subframes, shutter)`);
  const shutter = o.shutter ?? .5;
  if (!(Number.isInteger(o.subframes) && o.subframes >= 2 && o.subframes <= 16)) throw new Error('motionBlur.subframes must be a whole number 2–16');
  if (!(typeof shutter === 'number' && shutter >= .1 && shutter <= 1)) throw new Error('motionBlur.shutter must be 0.1–1 (the share of a frame\'s time the blur spans)');
  return {subframes: o.subframes, shutter};
}

/**
 * The painter: one output picture at film time t into ctx — the film (in its layout, if any), averaged
 * over the motion-blur subframes, then the layout's bands on top (never blurred). A still (the poster)
 * takes no blur and no caption (a thumbnail shows the picture and the title band). Every call leaves ctx
 * with an identity transform and full alpha.
 */
export function makePainter({film, framed, blur, width, height, fps, ctx}) {
  const k = width / 1600;
  const picture = (c, t) => { c.resetTransform(); c.globalAlpha = 1; c.clearRect(0, 0, width, height); if (framed) framed.picture(c, t); else { c.scale(k, k); film.frame(c, t); } c.resetTransform(); };
  const sub = blur ? createCanvas(width, height) : null, subCtx = sub?.getContext('2d');
  return (t, {still = false} = {}) => {
    if (!blur || still) picture(ctx, t);
    else {
      // A running average: subframe i is laid over the first i at 1 / (i + 1), so each counts once.
      const span = blur.shutter / fps, n = blur.subframes;
      for (let i = 0; i < n; i++) {
        const at = Math.max(0, Math.min(film.total, t + (i / (n - 1) - .5) * span));
        if (i === 0) { picture(ctx, at); continue; }
        picture(subCtx, at); ctx.globalAlpha = 1 / (i + 1); ctx.drawImage(sub, 0, 0); ctx.globalAlpha = 1;
      }
    }
    if (framed) { framed.overlay(ctx, t, {still}); ctx.resetTransform(); ctx.globalAlpha = 1; }
  };
}

/**
 * @param film       from compileFilm
 * @param storyboard the storyboard (scene titles become chapters)
 * @param timings    the PACED timings ({scenes: [{id, duration, audio}]}); audio paths relative to narrationDir
 *                   (a silent scene may name none: render.mjs · joinVoice generates its silence)
 * @param narrationDir where the paced scene audio lives (null → a silent film)
 * @param out        the .mp4 to write (its folder receives the working files)
 * @param intro      optional {seconds, draw(ctx, t, {width, height, handoff}), wav?: Buffer} — a title before the film
 * @param stamp      optional text stamped on every frame (e.g. 'DRAFT · NOT APPROVED')
 * @param from,to    render part of the film (seconds on the film clock); the intro plays only when from < 0
 * @param poster     the film second to use as the poster (default: the recipe's `poster`, film.posterAt): it is
 *                   written beside the video (poster.jpg) and REPLACES the video's first frame, so every
 *                   platform's thumbnail shows it (the length and the sound's sync are unchanged)
 * @param loudness   the target {I, TP, LRA?} (LUFS, dBTP, LU) for the two loudness passes (render.mjs · muxWithLoudness)
 * @param layout     a format for a platform ({format: landscape | square | portrait | vertical, header?, captions?, crop?};
 *                   layout.mjs · compileLayout): the output takes that format's size (width or height beside it refuses)
 * @param motionBlur {subframes, shutter?} (or a number of subframes): each frame is the average of that many moments
 *                   spread over `shutter` (0.5 by default) of the frame's time, so fast moves blur as a camera's would
 * @param captionFiles true (both) or a list of 'vtt' / 'srt': caption files beside the video (captions.vtt,
 *                   captions.srt) on the video's clock, for players that show their own captions (captions.mjs · captionFile)
 * @returns {out, seconds, chapters, poster?, format?, captions?: {vtt?, srt?}, loudness: {type, target, measured, reason?}}
 */
export async function renderFilm({film, storyboard, timings, narrationDir = null, out, width: givenWidth, height: givenHeight, fps = 30, intro = null, stamp = null,
  from = intro ? -intro.seconds : 0, to = film.total, poster = film.posterAt ?? null, peakCeilingDBFS = -20, loudness = {I: -16, TP: -1.5}, layout = null, motionBlur = null,
  captionFiles = false, ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg'}) {
  checkLoudnessTarget(loudness);
  const blur = readMotionBlur(motionBlur), captionKinds = readCaptionFiles(captionFiles);
  const framed = layout ? compileLayout(film, layout) : null;
  // A layout's format sets the size; a size given beside it would be silently ignored, so it refuses.
  if (framed && (givenWidth !== undefined || givenHeight !== undefined)) throw new Error(`renderFilm: the ${framed.format} layout is ${framed.width}×${framed.height}; leave width and height out (they size a render without a layout)`);
  const width = framed?.width ?? givenWidth ?? 1280, height = framed?.height ?? givenHeight ?? 720;
  if (framed && intro && framed.format !== 'landscape') throw new Error(`renderFilm: an intro is drawn for the landscape frame; the ${framed.format} layout takes none (leave intro out)`);
  const dir = path.dirname(path.resolve(out)); mkdirSync(dir, {recursive: true});
  const k = width / 1600, canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
  const paint = makePainter({film, framed, blur, width, height, fps, ctx});
  to = Math.min(to, film.total);
  const withIntro = intro && from < 0, start = Math.max(0, from);
  const drawStamp = () => {
    if (!stamp) return;
    ctx.save(); ctx.font = '600 16px Menlo'; const w = ctx.measureText(stamp).width + 24;
    ctx.fillStyle = 'rgba(179,63,54,.92)'; ctx.fillRect(width - w - 16, 14, w, 28); ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(stamp, width - w - 4, 28); ctx.restore();
  };
  const video = path.join(dir, 'film-video.mp4');
  const ff = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', `${width}x${height}`, '-framerate', String(fps), '-i', 'pipe:0', '-c:v', 'libx264', '-preset', 'fast', '-crf', '19', '-pix_fmt', 'yuv420p', video], {stdio: ['pipe', 'ignore', 'inherit']});
  const push = async () => { drawStamp(); if (!ff.stdin.write(canvas.data())) await once(ff.stdin, 'drain'); };
  // The poster: drawn once, written beside the video, and sent as the video's first frame.
  let posterFile = null, posterFirst = poster !== null;
  if (posterFirst) {
    paint(poster, {still: true});
    posterFile = path.join(dir, 'poster.jpg'); writeFileSync(posterFile, await canvas.encode('jpeg', 90));
  }
  const frameOrPoster = async draw => { if (posterFirst) { posterFirst = false; paint(poster, {still: true}); } else draw(); await push(); };
  if (withIntro) {
    const handoff = createCanvas(width, height); { const c = handoff.getContext('2d'); c.scale(k, k); film.frame(c, 0); }
    for (let f = 0; f < Math.round(intro.seconds * fps); f++) await frameOrPoster(() => { ctx.resetTransform(); ctx.globalAlpha = 1; ctx.clearRect(0, 0, width, height); intro.draw(ctx, f / fps, {width, height, handoff}); });
  }
  for (let f = 0; f < Math.ceil((to - start) * fps); f++) {
    await frameOrPoster(() => paint(start + f / fps));
  }
  ff.stdin.end(); await once(ff, 'close');

  // Audio: narration end to end (or silence), the accents on the same clock, the intro's sound first.
  const run = args => { const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...args], {stdio: 'inherit'}); if (r.status) throw new Error(`ffmpeg failed: ${args.join(' ').slice(0, 200)}`); };
  const voice = path.join(dir, 'film-voice.wav');
  if (narrationDir) joinVoice(run, {dir, storyboard, timings, narrationDir, voice});
  else run(['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', String(film.total), voice]);
  // Each scene's sounds on its own clock (sound.mjs · soundsByScene, the rule compileFilm counted them by).
  const byScene = soundsByScene(film.sounds, film.clock.offsets, timings.scenes.map(s => s.duration));
  const sfxParts = timings.scenes.map((s, i) => {
    const file = path.join(dir, `film-sfx-${i}.wav`);
    writeFileSync(file, createMotionSound({duration: s.duration, events: byScene[i], peakCeilingDBFS}).wav);
    return file;
  });
  writeFileSync(path.join(dir, 'film-sfx.txt'), sfxParts.map(f => `file '${f}'`).join('\n') + '\n');
  run(['-f', 'concat', '-safe', '0', '-i', path.join(dir, 'film-sfx.txt'), '-ar', '48000', '-ac', '1', path.join(dir, 'film-sfx.wav')]);
  run(['-i', voice, '-i', path.join(dir, 'film-sfx.wav'), '-filter_complex', '[0:a]aresample=48000[a];[1:a]aresample=48000[b];[a][b]amix=inputs=2:normalize=0:duration=first', '-ac', '1', path.join(dir, 'film-lesson.wav')]);
  const parts = [];
  if (withIntro) {
    const introWav = path.join(dir, 'film-intro.wav');
    if (intro.wav) writeFileSync(introWav, intro.wav); else run(['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', String(intro.seconds), introWav]);
    run(['-i', introWav, '-ar', '48000', '-ac', '1', path.join(dir, 'film-intro48.wav')]); parts.push(path.join(dir, 'film-intro48.wav'));
  }
  run(['-ss', String(start), '-t', String(to - start), '-i', path.join(dir, 'film-lesson.wav'), path.join(dir, 'film-part.wav')]); parts.push(path.join(dir, 'film-part.wav'));
  writeFileSync(path.join(dir, 'film-audio.txt'), parts.map(p => `file '${p}'`).join('\n') + '\n');
  run(['-f', 'concat', '-safe', '0', '-i', path.join(dir, 'film-audio.txt'), '-ar', '48000', '-ac', '1', path.join(dir, 'film-audio.wav')]);
  const loudnessSet = muxWithLoudness({ffmpeg, video, wav: path.join(dir, 'film-audio.wav'), out: path.resolve(out), target: loudness});
  // Chapters on the output's clock, for review and YouTube.
  const lead = withIntro ? intro.seconds : 0;
  const chapters = [...(withIntro ? [[0, intro.title ?? 'Title']] : []), ...storyboard.scenes.map((s, i) => [lead + film.clock.offsets[i] - start, s.title ?? s.id])].filter(([t]) => t >= 0);
  writeFileSync(path.join(dir, 'chapters.txt'), chapters.map(([t, n]) => `${clock(t)} ${n}`).join('\n') + '\n');
  // Caption files on the output's clock too (the same shift as the chapters), for the cues the render covers.
  const captions = {};
  if (captionKinds.length) {
    const chunks = captionChunks(film, FILE_CHUNKS);
    for (const kind of captionKinds) { captions[kind] = path.join(dir, `captions.${kind}`); writeFileSync(captions[kind], captionFile(chunks, kind, {offset: lead - start, from: start, to})); }
  }
  return {out: path.resolve(out), seconds: lead + to - start, chapters: chapters.map(([t, n]) => `${clock(t)} ${n}`), loudness: loudnessSet,
    ...(posterFile ? {poster: posterFile} : {}), ...(framed ? {format: framed.format} : {}), ...(captionKinds.length ? {captions} : {})};
}

/** The captionFiles option: false, true (both kinds) or a list of 'vtt' / 'srt'. */
export function readCaptionFiles(v) {
  if (v === false || v === undefined || v === null) return [];
  if (v === true) return ['vtt', 'srt'];
  if (!Array.isArray(v) || !v.length || !v.every(k => k === 'vtt' || k === 'srt') || new Set(v).size !== v.length) throw new Error(`captionFiles must be true or a list of 'vtt' and/or 'srt', not ${JSON.stringify(v)}`);
  return v;
}
