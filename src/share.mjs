/**
 * A copy of a finished film to send to a person — a review page, a chat, a phone: small and quick to load, with a
 * poster. The video at `width` (854 by default: 480p) in H.264 (yuv420p, which every browser plays) and AAC, its index
 * at the front (faststart: it plays before it has all arrived), and one still at `poster` seconds as a JPEG — what a
 * page shows before play. The film itself is never touched.
 *
 *   shareCopy('out/ep1.mp4') → {video: 'out/ep1.share.mp4', poster: 'out/ep1.poster.jpg', seconds, bytes, width, height}
 *   storyreel share out/ep1.mp4 [--width 854] [--crf 28] [--poster 6] [--out folder] [--ffmpeg path]
 *
 * A page that plays it on a phone loads the whole file first and plays it from memory (a hosted file may not answer a
 * browser's range requests, which a bare <video src> needs to start).
 */
import path from 'node:path';
import {existsSync, statSync, rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {writeOutput, outputFolder, refuseFolders} from './files.mjs';
import {tempScratch} from './scratch.mjs';
import {ffmpegProbe} from './finished.mjs';

/** The share copy's defaults: its width (px, the height follows), its quality (x264's CRF: lower is better and larger), its poster's moment (s; a shorter film's middle). */
export const SHARE_DEFAULTS = Object.freeze({width: 854, crf: 28, poster: 6});


/**
 * The share copy and its poster, beside the film (or in `out`): <name>.share.mp4 and <name>.poster.jpg. FFmpeg makes
 * them in a scratch folder of this run's own (scratch.mjs · tempScratch), and each is moved onto its place whole
 * (files.mjs · writeOutput), so a page never reads half a file.
 */
export function shareCopy(file, {width = SHARE_DEFAULTS.width, crf = SHARE_DEFAULTS.crf, poster: asked, out = null, ffmpeg = 'ffmpeg'} = {}) {
  const film = path.resolve(String(file ?? ''));
  if (!file || !existsSync(film) || !statSync(film).isFile()) throw new Error(`share: no video at ${JSON.stringify(file)}: name a finished film (storyreel share out/film.mp4)`);
  if (!(Number.isInteger(width) && width >= 160 && width <= 3840 && width % 2 === 0)) throw new Error(`share: width is an even number of pixels 160–3840 (854 is 480p), not ${JSON.stringify(width)}`);
  if (!(Number.isInteger(crf) && crf >= 16 && crf <= 40)) throw new Error(`share: crf is x264's quality, a whole number 16–40 (lower: better and larger; 28 by default), not ${JSON.stringify(crf)}`);
  // (Read as the finished-file check reads a video: ffprobe beside the FFmpeg named, its length and its picture.)
  const probe = ffmpegProbe({ffmpeg}), {seconds} = probe.probe(film);
  if (!(seconds > 0)) throw new Error(`share: ${film} has no length: name a video (an .mp4 a render wrote)`);
  const poster = asked ?? Math.min(SHARE_DEFAULTS.poster, seconds / 2);
  if (!(Number.isFinite(poster) && poster >= 0 && poster < seconds)) throw new Error(`share: poster is the moment its still is taken, 0 to ${seconds.toFixed(2)} s (the film's length), not ${JSON.stringify(poster)}`);
  const folder = out ? outputFolder(path.resolve(out), []) : path.dirname(film), name = path.basename(film, path.extname(film));
  const video = path.join(folder, `${name}.share.mp4`), still = path.join(folder, `${name}.poster.jpg`);
  refuseFolders([video, still]);   // (before anything is made: a folder at either name)
  // (A run that FFmpeg did not finish — a status not 0, or a signal — is never moved onto an output.)
  const run = (args, what) => {
    const r = spawnSync(ffmpeg, ['-y', '-hide_banner', '-nostdin', '-loglevel', 'error', ...args], {encoding: 'utf8'});
    if (r.error || r.status !== 0) throw new Error(`share: FFmpeg could not make the ${what}: ${r.error?.message ?? (String(r.stderr ?? '').trim().slice(-300) || `stopped by ${r.signal}`)} — check that ${film} plays`);
  };
  const work = tempScratch(), tv = path.join(work, 'share.mp4'), tp = path.join(work, 'poster.jpg');
  try {
    run(['-i', film, '-vf', `scale=${width}:-2`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', tv], 'copy');
    run(['-ss', String(poster), '-i', film, '-frames:v', '1', '-vf', `scale=${width}:-2`, '-q:v', '4', tp], 'poster');
    writeOutput(video, {move: tv}); writeOutput(still, {move: tp});
  } finally { rmSync(work, {recursive: true, force: true}); }
  const made = probe.probe(video).video;
  return {video, poster: still, seconds, bytes: statSync(video).size, width: made.width, height: made.height};
}

/** The share copy as one line: where it is, how big, how long, its size on screen, and its poster. */
export const shareText = s => `${s.video} · ${(s.bytes / 1e6).toFixed(1)} MB · ${Math.floor(s.seconds / 60)}:${String(Math.floor(s.seconds % 60)).padStart(2, '0')} · ${s.width}×${s.height ?? '?'} — poster ${s.poster}`;
