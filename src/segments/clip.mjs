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
import {rangeText} from './changed.mjs';

/**
 * The clip's stretches, one per changed range (segments/changed.mjs · changedRanges): the range's own pieces whole, with
 * up to `handles` seconds of the pieces either side where they can be taken (`got`: piece index → {file, frames}; a
 * neighbour not there, or the film's start or end, leaves that side without one). Each stretch: {label (the range's
 * times), from, to (the window on the film clock), frames, labelled: [first, last] frame of the window that is the
 * range's own, parts: [{file, start, end}] (frames of each file, in order)}.
 */
export function reviewWindows(ranges, got, {handles, fps}) {
  const h = Math.round(handles * fps);
  return ranges.map(r => {
    const before = got.get(r.first - 1), after = got.get(r.last + 1), own = r.f1 - r.f0;
    const lead = before ? Math.min(h, before.frames) : 0, tail = after ? Math.min(h, after.frames) : 0;
    const pieces = Array.from({length: r.last - r.first + 1}, (_, k) => got.get(r.first + k)).map(d => ({file: d.file, start: 0, end: d.frames}));
    return {label: rangeText(r), from: (r.f0 - lead) / fps, to: (r.f1 + tail) / fps, frames: lead + own + tail, labelled: [lead, lead + own - 1],
      parts: [...(lead ? [{file: before.file, start: before.frames - lead, end: before.frames}] : []), ...pieces, ...(tail ? [{file: after.file, start: 0, end: tail}] : [])]};
  });
}

/**
 * Write the clip into `file` (a working file: the caller moves it into place).
 * @param windows its stretches (reviewWindows): from/to on the film clock (the voice's seconds), the piece files each is
 *                made of, in order, each its frames [start, end)
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

