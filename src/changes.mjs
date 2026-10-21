/**
 * See an edit before the full render (storyreel changes): which pieces of the picture it changed — the default cache's
 * keys, planned as the full render plans them — and, asked, only those pieces drawn, kept in the cache, and shown back
 * to back in a short review clip.
 *
 *   previewChanges(film)                  one line per changed range ("0:12–0:18 left · its recipe entries changed"),
 *                                         then the count ("2 of 33 pieces changed (0:06 of 3:02)")
 *   previewChanges(film, {render: true})  and those pieces drawn and kept, so the full render draws none of them again;
 *                                         and a clip, <out folder>/changes/review.mp4: each changed range with `handles`
 *                                         (1 s) of the pieces either side, its time in the corner, the film's voice under it
 *
 * `film` is what makeFilm takes for the full render, its out, render and code included: it is made ready as makeFilm
 * makes it (prepare.mjs · prepareFull), so each key is the one the full render looks for. Nothing is drawn but the
 * changed pieces: the neighbours a clip shows are the cache's, each spot-checked as a render checks it (segments.mjs ·
 * one). What the keys cannot see (a kit that names no `sources`) only the full render's spot check catches: the count
 * says so after `note:`.
 */
import path from 'node:path';
import {voiceTrack} from './render.mjs';
import {prepareFull} from './prepare.mjs';
import {makeFolder, outputFolder, writeOutput, refuseFolders} from './files.mjs';
import {changedRanges, changesText, CHANGES_DEFAULTS} from './segments/changed.mjs';
import {reviewWindows, writeClip} from './segments/clip.mjs';
import {clockOf} from './clocktext.mjs';

/**
 * What an edit changed, and — with `render` — those pieces drawn into the cache and a clip of them (see the header).
 * @param film    makeFilm's options for the full render ({storyboard, recipe, kits, narrationDir | timings, pacing, …,
 *                out, render, code}): its out names the folder whose cache is compared
 * @param render  true: draw the changed pieces (kept for the full render) and write the clip — none when every piece
 *                changed (the clip would be the film: the full render shows it, drawing nothing again)
 * @param handles seconds of the pieces either side of a change in the clip, 0–5 (1)
 * @param clip    where the clip is written (an .mp4; default <out folder>/changes/review.mp4)
 * @returns {text, pieces, ranges, cache, total, seconds} — and with render: drawn [{index, frames, why, kept}], kept
 *          (whether every piece drawn is in the cache), clip {file, seconds} (when there is one)
 */
export async function previewChanges(film, {render: draw = false, handles = CHANGES_DEFAULTS.handles, clip = null} = {}) {
  if (typeof draw !== 'boolean') throw new Error(`previewChanges: render is true (draw the changed pieces and a clip of them) or false, not ${JSON.stringify(draw)}`);
  if (!(typeof handles === 'number' && handles >= 0 && handles <= 5)) throw new Error(`previewChanges: handles is the seconds of the pieces shown either side of a change, 0–5 (${CHANGES_DEFAULTS.handles} by default), not ${JSON.stringify(handles)}`);
  if (clip !== null && !(typeof clip === 'string' && clip.toLowerCase().endsWith('.mp4'))) throw new Error(`previewChanges: clip is the .mp4 the review clip is written to, not ${JSON.stringify(clip)}`);
  const started = performance.now(), elapsed = () => (performance.now() - started) / 1000, full = await prepareFull(film);
  try {
    const {job, video} = full;
    if (typeof video.why !== 'function') throw new Error(`previewChanges: this render draws its picture whole (${video.name === 'whole' ? 'whole: true, a part, from/to or an intro' : `the strategy ${video.name}`}), so nothing is kept to compare with: preview the full render of the whole film, drawn in pieces (the default)`);
    const plan = video.plan(job), notes = video.notes?.(job) ?? [];
    const pieces = plan.map(seg => ({index: seg.index, f0: seg.f0, f1: seg.f1, from: seg.from, to: seg.to, frames: seg.f1 - seg.f0, scenes: [...seg.scenes], key: seg.key, label: seg.label, why: video.why(job, seg)}));
    const ranges = changedRanges(pieces), text = changesText({pieces, ranges, total: job.film.total, cache: video.cache, notes});
    const said = {text, pieces, ranges, cache: video.cache, total: job.film.total};
    if (!draw) return {...said, seconds: elapsed()};
    // Nothing changed by the keys: the full render reuses every piece — after its spot check, which the note (when there is one) says what it alone can catch.
    if (!ranges.length) return {...said, text: `${text}\nnothing to draw${notes.length ? '' : ': the full render reuses every piece'}`, seconds: elapsed()};
    const {got, drawn, lost} = await drawChanged(job, video, plan, pieces, ranges, handles);
    const whole = drawn.length && pieces.every(p => p.why !== null);
    const made = whole ? null : await clipOf(job, reviewWindows(ranges, got, {handles, fps: job.fps}), clip);
    const kept = drawn.every(d => d.kept);
    return {...said, text: `${text}\n${drawnLine({made, drawn, pieces, kept, lost, seconds: elapsed()})}`, drawn, kept, ...(made ? {clip: made} : {}), seconds: elapsed()};
  } finally { full.close(); }
}

/**
 * Draw each changed piece (one: into the cache, the 0.18 laws unchanged), then take each range's neighbours (one:
 * reused from the cache once its spot check passes). A neighbour that cannot be taken leaves its side of the clip
 * without a handle, and is said (`lost`). Returns {got: index → one's result, drawn: the pieces drawn, lost}.
 */
async function drawChanged(job, video, plan, pieces, ranges, handles) {
  const settled = await Promise.allSettled(pieces.filter(p => p.why !== null).map(p => video.one(job, plan[p.index])));
  const failed = settled.filter(r => r.status === 'rejected').map(r => r.reason);
  if (failed.length) throw failed.find(e => !/ was not drawn: segment \d+ failed/.test(e?.message ?? '')) ?? failed[0];   // the piece that failed, not the ones it stopped
  const got = new Map(settled.map(r => [r.value.index, r.value])), lost = [];
  const near = handles > 0 ? [...new Set(ranges.flatMap(r => [r.first - 1, r.last + 1]))].filter(i => i >= 0 && i < plan.length && pieces[i].why === null) : [];
  for (const r of await Promise.allSettled(near.map(i => video.one(job, plan[i])))) {
    if (r.status === 'fulfilled') got.set(r.value.index, r.value); else lost.push(r.reason?.message ?? String(r.reason));
  }
  const drawn = [...got.values()].filter(d => d.status === 'rendered').sort((a, b) => a.index - b.index).map(d => ({index: d.index, frames: d.frames, why: d.why, kept: d.kept === true}));
  return {got, drawn, lost};
}

/** The clip, written in the render's working folder and moved into place (files.mjs · writeOutput): the voice under it when the film has one. */
async function clipOf(job, windows, clip) {
  const final = clip === null ? path.join(outputFolder(job.dir, 'changes'), 'review.mp4') : path.join(makeFolder(path.dirname(path.resolve(clip))), path.basename(clip));
  refuseFolders([final]);
  const voice = job.narrationDir ? voiceTrack(job) : null;
  const file = await writeClip({windows, fps: job.fps, width: job.width, height: job.height, voice, file: path.join(job.work, 'changes-review.mp4'), work: job.work, ffmpeg: job.ffmpeg});
  return {file: writeOutput(final, {move: file}), seconds: windows.reduce((n, w) => n + w.frames, 0) / job.fps};
}

/**
 * What a preview drew, in one line: the clip and its length (none when every piece changed), the pieces drawn — one
 * beside a change only when its kept copy failed its check, a forced one drawn again by every render — whether they
 * were kept, and a neighbour that could not be taken.
 */
function drawnLine({made, drawn, pieces, kept, lost, seconds}) {
  const frames = drawn.reduce((n, d) => n + d.frames, 0), besides = drawn.filter(d => pieces[d.index].why === null), forced = drawn.filter(d => d.why === 'forced').length;
  const reused = !forced ? ' and kept: the full render reuses them' : forced === drawn.length ? ' and kept, but forced: every render draws them again'
    : ` and kept: the full render reuses all but the ${forced} forced (every render draws those again)`;
  return `${made ? `${made.file} · ${clockOf(made.seconds, 'nearest')}` : 'no clip: every piece changed (the full render shows them)'} · ${drawn.length} piece${drawn.length > 1 ? 's' : ''} drawn (${frames} frames)`
    + (besides.length ? `, ${besides.length} beside a change: ${besides[0].why}` : '')
    + (kept ? reused : ', not all kept: a file a key reads changed on disk after this started')
    + (lost.length ? `; no handle where a neighbour could not be taken (${lost[0]})` : '')
    + ` · made in ${seconds.toFixed(1)} s`;
}
