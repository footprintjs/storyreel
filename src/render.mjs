/**
 * Render a compiled film to an MP4: frames from film.frame(ctx, t), the paced narration scene by
 * scene, the sound accents per scene (at most 64 each), loudness in two passes. FFmpeg must be on PATH.
 */
import {writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createCanvas} from '@napi-rs/canvas';
import {createMotionSound, soundsByScene} from './sound.mjs';

/**
 * Loudness in two passes (FFmpeg's loudnorm): measure the whole mixed film, then set it with ONE fixed
 * gain (`linear=true`) from what was measured, so a quiet opening stays quiet instead of being raised to
 * the voice's level. A film with no measurable loudness (pure silence: FFmpeg reports -inf) is left as
 * it is; loudnorm's varying mode turns silence into NaN and the AAC encoder refuses it. FFmpeg falls back
 * to that varying mode when one gain would break the true-peak limit, the range is above its target, the
 * film is under 3 s, or the measured range is exactly 0 (its option's default, read as "not measured");
 * the type it reports says so, and the making-of record flags it (pipeline.mjs · loudnessRecord).
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
export function linearLoudnorm(target, m) {
  return `loudnorm=${loudnormTarget(target)}:measured_I=${m.I}:measured_TP=${m.TP}:measured_LRA=${m.LRA}:measured_thresh=${m.thresh}:offset=${m.offset}:linear=true:print_format=json`;
}

/** Run FFmpeg and keep what it reports (loudnorm prints its JSON at the info level, on stderr). */
function runReporting(ffmpeg, args) {
  const r = spawnSync(ffmpeg, ['-y', '-hide_banner', '-nostats', '-loglevel', 'info', ...args], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  if (r.status) throw new Error(`ffmpeg failed: ${args.join(' ').slice(0, 200)}\n${String(r.stderr).slice(-800)}`);
  return r.stderr;
}

/** Pass 1: measure the mixed film's loudness (render.mjs · measuredLoudness); `unusable` when there is none to use. */
function measureFilm(ffmpeg, wav, target) {
  const report = parseLoudnormReport(runReporting(ffmpeg, ['-i', wav, '-af', `${LOUDNESS_FORMAT},loudnorm=${loudnormTarget(target)}:print_format=json`, '-f', 'null', '-']));
  if (!report) throw new Error('ffmpeg loudnorm printed no measurement (print_format=json); is this FFmpeg built with loudnorm?');
  const measured = measuredLoudness(report);
  return Object.values(measured).every(v => v !== null) ? {measured} : {measured, unusable: true};
}

/**
 * Pass 2, while the video and sound are muxed: one fixed gain from the measurement, or none for a silent
 * film. Returns {type, target, measured, reason?}: type is FFmpeg's reported normalization type
 * ('linear' when one fixed gain was kept, 'dynamic' when loudnorm fell back to varying it) or 'skipped'.
 */
function muxWithLoudness({ffmpeg, video, wav, out, target}) {
  const {measured, unusable} = measureFilm(ffmpeg, wav, target);
  const mux = af => ['-i', video, '-i', wav, '-map', '0:v', '-map', '1:a', '-af', af, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out];
  if (unusable) {
    runReporting(ffmpeg, mux(`${LOUDNESS_FORMAT},aresample=48000`));
    return {type: 'skipped', target, measured, reason: 'the audio is silent: there is no loudness to measure'};
  }
  const report = parseLoudnormReport(runReporting(ffmpeg, mux(`${LOUDNESS_FORMAT},${linearLoudnorm(target, measured)},aresample=48000`)));
  if (!report?.normalization_type) throw new Error('ffmpeg loudnorm did not report its normalization type in the second pass');
  return {type: report.normalization_type, target, measured};
}

const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * @param film       from compileFilm
 * @param storyboard the storyboard (scene titles become chapters)
 * @param timings    the PACED timings ({scenes: [{id, duration, audio}]}); audio paths relative to narrationDir
 * @param narrationDir where the paced scene audio lives (null → a silent film)
 * @param out        the .mp4 to write (its folder receives the working files)
 * @param intro      optional {seconds, draw(ctx, t, {width, height, handoff}), wav?: Buffer} — a title before the film
 * @param stamp      optional text stamped on every frame (e.g. 'DRAFT · NOT APPROVED')
 * @param from,to    render part of the film (seconds on the film clock); the intro plays only when from < 0
 * @param poster     the film second to use as the poster (default: the recipe's `poster`, film.posterAt): it is
 *                   written beside the video (poster.jpg) and REPLACES the video's first frame, so every
 *                   platform's thumbnail shows it (the length and the sound's sync are unchanged)
 * @param loudness   the target {I, TP, LRA?} (LUFS, dBTP, LU) for the two loudness passes (render.mjs · muxWithLoudness)
 * @returns {out, seconds, chapters, poster?, loudness: {type, target, measured, reason?}}
 */
export async function renderFilm({film, storyboard, timings, narrationDir = null, out, width = 1280, height = 720, fps = 30, intro = null, stamp = null,
  from = intro ? -intro.seconds : 0, to = film.total, poster = film.posterAt ?? null, peakCeilingDBFS = -20, loudness = {I: -16, TP: -1.5}, ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg'}) {
  const dir = path.dirname(path.resolve(out)); mkdirSync(dir, {recursive: true});
  const k = width / 1600, canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
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
    ctx.resetTransform(); ctx.globalAlpha = 1; ctx.clearRect(0, 0, width, height); ctx.scale(k, k); film.frame(ctx, poster); ctx.resetTransform();
    posterFile = path.join(dir, 'poster.jpg'); writeFileSync(posterFile, await canvas.encode('jpeg', 90));
  }
  const frameOrPoster = async draw => { if (posterFirst) { posterFirst = false; ctx.resetTransform(); ctx.globalAlpha = 1; ctx.clearRect(0, 0, width, height); ctx.scale(k, k); film.frame(ctx, poster); ctx.resetTransform(); } else draw(); await push(); };
  if (withIntro) {
    const handoff = createCanvas(width, height); { const c = handoff.getContext('2d'); c.scale(k, k); film.frame(c, 0); }
    for (let f = 0; f < Math.round(intro.seconds * fps); f++) await frameOrPoster(() => { ctx.resetTransform(); ctx.globalAlpha = 1; ctx.clearRect(0, 0, width, height); intro.draw(ctx, f / fps, {width, height, handoff}); });
  }
  for (let f = 0; f < Math.ceil((to - start) * fps); f++) {
    await frameOrPoster(() => { ctx.resetTransform(); ctx.globalAlpha = 1; ctx.clearRect(0, 0, width, height); ctx.scale(k, k); film.frame(ctx, start + f / fps); ctx.resetTransform(); });
  }
  ff.stdin.end(); await once(ff, 'close');

  // Audio: narration end to end (or silence), the accents on the same clock, the intro's sound first.
  const run = args => { const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...args], {stdio: 'inherit'}); if (r.status) throw new Error(`ffmpeg failed: ${args.join(' ').slice(0, 200)}`); };
  const voice = path.join(dir, 'film-voice.wav');
  if (narrationDir) {
    writeFileSync(path.join(dir, 'film-narration.txt'), timings.scenes.map(s => `file '${path.resolve(narrationDir, s.audio)}'`).join('\n') + '\n');
    run(['-f', 'concat', '-safe', '0', '-i', path.join(dir, 'film-narration.txt'), '-ar', '48000', '-ac', '1', voice]);
  } else run(['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', String(film.total), voice]);
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
  return {out: path.resolve(out), seconds: lead + to - start, chapters: chapters.map(([t, n]) => `${clock(t)} ${n}`), loudness: loudnessSet, ...(posterFile ? {poster: posterFile} : {})};
}
