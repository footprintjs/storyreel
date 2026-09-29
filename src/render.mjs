/**
 * Render a compiled film to an MP4: frames from film.frame(ctx, t), the paced narration scene by
 * scene, the sound accents per scene (at most 64 each), one loudness pass. FFmpeg must be on PATH.
 */
import {writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createCanvas} from '@napi-rs/canvas';
import {createMotionSound} from './sound.mjs';

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
 * @returns {out, seconds, chapters, poster?}
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
  const sfxParts = timings.scenes.map((s, i) => {
    const t0 = film.clock.offsets[i], file = path.join(dir, `film-sfx-${i}.wav`);
    const events = film.sounds.filter(e => e.time >= t0 && e.time < t0 + s.duration - .02).map(e => ({type: e.type, time: e.time - t0}));
    writeFileSync(file, createMotionSound({duration: s.duration, events, peakCeilingDBFS}).wav);
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
  run(['-i', video, '-i', path.join(dir, 'film-audio.wav'), '-map', '0:v', '-map', '1:a', '-af', `aformat=channel_layouts=stereo,loudnorm=I=${loudness.I}:TP=${loudness.TP},aresample=48000`, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', path.resolve(out)]);
  // Chapters on the output's clock, for review and YouTube.
  const lead = withIntro ? intro.seconds : 0;
  const chapters = [...(withIntro ? [[0, intro.title ?? 'Title']] : []), ...storyboard.scenes.map((s, i) => [lead + film.clock.offsets[i] - start, s.title ?? s.id])].filter(([t]) => t >= 0);
  writeFileSync(path.join(dir, 'chapters.txt'), chapters.map(([t, n]) => `${clock(t)} ${n}`).join('\n') + '\n');
  return {out: path.resolve(out), seconds: lead + to - start, chapters: chapters.map(([t, n]) => `${clock(t)} ${n}`), ...(posterFile ? {poster: posterFile} : {})};
}
