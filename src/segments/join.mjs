/**
 * Join the picture's pieces into one video with FFmpeg's concat demuxer. Every piece is encoded with the same
 * settings and starts on its own key frame, so a picture without a stamp is joined without re-encoding. A draft
 * stamp is never drawn into a cached piece (its label would be in every key, and a new label would redraw the film):
 * it is burned once here, over every frame, from a picture the painter drew (paint.mjs · stampPicture) — one re-encode
 * with the render's own settings, never FFmpeg's drawtext (missing from many builds).
 */
import {writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {concatList} from '../ffconcat.mjs';
import {encodeWithoutFilter} from '../paint.mjs';

/**
 * The default joiner, run with the render's FFmpeg: join(files, out, {stamp}) — `stamp` ({png, quality}): the stamp's
 * picture laid over every frame (the frames re-encoded at `quality`, their colours as the pieces have them); without
 * one, the pieces are copied as they are.
 */
export function ffmpegJoin({ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg'} = {}) {
  return {
    name: 'ffmpeg-concat',
    join(files, out, {stamp = null} = {}) {
      const list = `${out}.txt`;
      writeFileSync(list, concatList(files));
      const burn = stamp ? encodeWithoutFilter(stamp.quality) : null;
      const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, ...(burn ? ['-i', path.resolve(stamp.png),
        '-filter_complex', `[1:v]${burn.colour}format=yuva420p[stamp];[0:v][stamp]overlay=0:0:format=yuv420[v]`, '-map', '[v]', '-c:v', 'libx264', ...burn.args] : ['-c', 'copy']), out], {encoding: 'utf8'});
      if (r.error || r.status !== 0) throw new Error(`ffmpeg could not join ${files.length} segments into ${path.basename(out)}${stamp ? ' with the stamp' : ''}: ${r.error?.message ?? String(r.stderr).slice(-400)}`);
      return out;
    },
  };
}
