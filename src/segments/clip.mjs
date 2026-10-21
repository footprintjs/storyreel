/**
 * A review clip: stretches of the film back to back, each made of piece files (the cache's, or just drawn), each with a
 * label drawn in the corner while its own frames play — the painter's stamp, never FFmpeg's drawtext (missing from many
 * builds) — and, given the film's voice, that stretch of the voice under it. One FFmpeg pass, at the draft encode.
 * (storyreel changes --render: changes.mjs.)
 */
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {ENCODE, stampPicture} from '../paint.mjs';
import {writeOutput} from '../files.mjs';

/**
 * Write the clip into `file` (a working file: the caller moves it into place).
 * @param windows [{label, from, to, labelled: [first, last] frame of the window, parts: [{file, start, end}]}] — from/to:
 *                the window on the film clock (the voice's seconds); parts: the piece files it is made of, in order, each
 *                its frames [start, end)
 * @param voice   the film's voice as one WAV on the film clock, or null (a silent clip)
 */
export async function writeClip({windows, fps, width, height, voice = null, file, work, ffmpeg}) {
  if (!windows.length) throw new Error('writeClip: give the stretches to show');
  const inputs = [], graph = [], joined = [];
  const input = f => { inputs.push('-i', f); return inputs.length / 2 - 1; };   // the input's index in FFmpeg's graph
  const parts = windows.map(w => w.parts.map(p => ({...p, at: input(p.file)})));
  const pictures = await Promise.all(windows.map(w => stampPicture({stamp: w.label, width, height})));
  const labels = pictures.map((png, j) => input(writeOutput(path.join(work, `clip-label-${j}.png`), png)));
  const said = voice ? input(voice) : null;
  if (said !== null && windows.length > 1) graph.push(`[${said}:a]asplit=${windows.length}${windows.map((_, j) => `[voice${j}]`).join('')}`);
  windows.forEach((w, j) => {
    parts[j].forEach((p, k) => graph.push(`[${p.at}:v]trim=start_frame=${p.start}:end_frame=${p.end},setpts=PTS-STARTPTS[w${j}p${k}]`));
    graph.push(`${parts[j].map((_, k) => `[w${j}p${k}]`).join('')}concat=n=${parts[j].length}:v=1:a=0[w${j}]`);
    graph.push(`[w${j}][${labels[j]}:v]overlay=0:0:enable='between(n,${w.labelled[0]},${w.labelled[1]})'[v${j}]`);
    if (said !== null) graph.push(`[${windows.length > 1 ? `voice${j}` : `${said}:a`}]atrim=start=${w.from.toFixed(6)}:end=${w.to.toFixed(6)},asetpts=PTS-STARTPTS[a${j}]`);
    joined.push(`[v${j}]`, ...(said !== null ? [`[a${j}]`] : []));
  });
  graph.push(`${joined.join('')}concat=n=${windows.length}:v=1:a=${said !== null ? 1 : 0}[v]${said !== null ? '[a]' : ''}`);
  const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', graph.join(';'), '-map', '[v]', ...(said !== null ? ['-map', '[a]', '-c:a', 'aac', '-b:a', '128k'] : []),
    '-c:v', 'libx264', ...ENCODE.draft, '-r', String(fps), '-movflags', '+faststart', file], {encoding: 'utf8'});
  if (r.error || r.status !== 0) throw new Error(`ffmpeg could not write the review clip: ${r.error?.message ?? String(r.stderr).slice(-400)}`);
  return file;
}

