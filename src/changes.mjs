/**
 * See an edit before the full render (storyreel changes): which pieces of the picture it changed — the default cache's
 * keys, planned as the full render plans them — and, asked, only those pieces drawn, kept in the cache, and shown back
 * to back in a short review clip.
 *
 *   previewChanges(film)                  one line per changed range ("0:12–0:18 left · its recipe entries changed"),
 *                                         then the count ("2 of 33 pieces changed (0:06 of 3:02)")
 *   previewChanges(film, {render: true})  and those pieces drawn and kept, so the full render only joins and mixes; and a
 *                                         clip, <out folder>/changes/review.mp4: each changed range with `handles` (1 s)
 *                                         of the pieces either side, its time in the corner, the film's voice under it
 *
 * `film` is what makeFilm takes for the full render, its out, render and code included: the film is cast, paced and
 * compiled as makeFilm does it (pipeline.mjs · castFilm, pacedTimings, compileForRender) and its render prepared and
 * planned the same way, so each key is the one the full render looks for. Nothing is drawn but the changed pieces: the
 * neighbours a clip shows are the cache's, each spot-checked as a render checks it (segments.mjs · one). A film fitted
 * to a song (makeFilm's music) is refused: the fit moves its scenes, and a preview does not run it.
 */
import path from 'node:path';
import {rmSync} from 'node:fs';
import {castFilm, pacedTimings, compileForRender} from './pipeline.mjs';
import {validatePacing} from './pacing.mjs';
import {prepareRender, closeRender, voiceTrack} from './render.mjs';
import {pictureStrategy} from './picture.mjs';
import {securePath, makeFolder, outputFolder, writeOutput, refuseFolders, requireVoiceApart} from './files.mjs';
import {makeScratch, sweepScratch} from './scratch.mjs';
import {changedRanges, changesText, rangeText, clockOf, CHANGES_DEFAULTS} from './segments/changed.mjs';
import {writeClip} from './segments/clip.mjs';

/**
 * What an edit changed, and — with `render` — those pieces drawn into the cache and a clip of them (see the header).
 * @param film    makeFilm's options for the full render ({storyboard, recipe, kits, narrationDir | timings, pacing, …,
 *                out, render, code}): its out names the folder whose cache is compared
 * @param render  true: draw the changed pieces (kept for the full render) and write the clip
 * @param handles seconds of the pieces either side of a change in the clip, 0–5 (1)
 * @param clip    where the clip is written (an .mp4; default <out folder>/changes/review.mp4)
 * @returns {text, pieces, ranges, cache, total, seconds} — and with render: clip {file, seconds}, drawn [{index, frames, why}],
 *          kept (false when a piece drawn could not be kept)
 */
export async function previewChanges(film, {render: draw = false, handles = CHANGES_DEFAULTS.handles, clip = null} = {}) {
  if (typeof draw !== 'boolean') throw new Error(`previewChanges: render is true (draw the changed pieces and a clip of them) or false, not ${JSON.stringify(draw)}`);
  if (!(typeof handles === 'number' && handles >= 0 && handles <= 5)) throw new Error(`previewChanges: handles is the seconds of the pieces shown either side of a change, 0–5 (${CHANGES_DEFAULTS.handles} by default), not ${JSON.stringify(handles)}`);
  if (clip !== null && !(typeof clip === 'string' && clip.toLowerCase().endsWith('.mp4'))) throw new Error(`previewChanges: clip is the .mp4 the review clip is written to, not ${JSON.stringify(clip)}`);
  const started = performance.now(), elapsed = () => (performance.now() - started) / 1000, full = await prepareFull(film);
  try {
    const {job, video} = full, plan = video.plan(job);
    const pieces = plan.map(seg => ({index: seg.index, f0: seg.f0, f1: seg.f1, from: seg.from, to: seg.to, frames: seg.f1 - seg.f0, scenes: [...seg.scenes], key: seg.key, label: seg.label, why: video.why(job, seg)}));
    const ranges = changedRanges(pieces), text = changesText({pieces, ranges, total: job.film.total, cache: video.cache, notes: video.notes?.(job) ?? []});
    const said = {text, pieces, ranges, cache: video.cache, total: job.film.total};
    if (!draw) return {...said, seconds: elapsed()};
    if (!ranges.length) return {...said, text: `${text}\nnothing to draw: the full render only joins`, seconds: elapsed()};
    const {windows, drawn} = await drawChanged(full, plan, pieces, ranges, handles);
    const file = await clipOf(full, windows, clip), clipSeconds = windows.reduce((n, w) => n + w.frames, 0) / job.fps;
    const kept = drawn.every(d => video.why(job, plan[d.index]) === null);
    return {...said, text: `${text}\n${drawnLine({file, clipSeconds, drawn, pieces, kept, seconds: elapsed()})}`, clip: {file, seconds: clipSeconds}, drawn, kept, seconds: elapsed()};
  } finally { full.close(); }
}

/** What a preview drew, in one line: the clip and its length, the pieces drawn (one beside a change only when its kept copy failed its check), whether they were kept. */
function drawnLine({file, clipSeconds, drawn, pieces, kept, seconds}) {
  const frames = drawn.reduce((n, d) => n + d.frames, 0), besides = drawn.filter(d => pieces[d.index].why === null);
  return `${file} · ${clockOf(clipSeconds, 'nearest')} · ${drawn.length} piece${drawn.length > 1 ? 's' : ''} drawn (${frames} frames)`
    + (besides.length ? `, ${besides.length} beside a change: ${besides[0].why}` : '')
    + (kept ? ' and kept: the full render reuses them' : ', not all kept: a file a key reads changed on disk after this started')
    + ` · made in ${seconds.toFixed(1)} s`;
}

/**
 * The full render, made ready as makeFilm makes it, up to its plan: the cast, the pacing (a voice's in a copy of its
 * own), the compile, the render's job and its picture strategy — which must keep a cache (the default). close() removes
 * the working files and the voice's copy.
 */
async function prepareFull({out, render = {}, code = null, music = null, narrationDir = null, timings = null, pacing = null, ...inputs}) {
  if (music) throw new Error('previewChanges: this film is fitted to a song (music), whose fit moves its scenes, and a preview does not run it: render it with makeFilm');
  if (typeof out !== 'string' || !out.trim()) throw new Error('previewChanges: give the full render\'s out (the video makeFilm writes): the cache beside it is what the preview compares with');
  if (!render || typeof render !== 'object' || Array.isArray(render)) throw new Error(`previewChanges: render is the full render's options (makeFilm's render), not ${JSON.stringify(render)}`);
  const {storyboard, recipe, strings} = castFilm(inputs);
  if (!storyboard?.scenes?.length) throw new Error('The storyboard has no scenes: give it scenes: [{id, narration} or {id, silent: [[what happens, seconds]]}]');
  if (pacing) validatePacing(narrationDir ? pacing : {voiceSpeed: 1, ...pacing}, storyboard);
  // The out folder's real path, as makeFilm takes it (files.mjs · securePath); the voice is paced in a copy of its own there.
  const dir = securePath(path.dirname(path.resolve(out)));
  if (narrationDir) requireVoiceApart(narrationDir, dir);
  makeFolder(dir);
  sweepScratch(dir, '.narration');
  const copy = narrationDir ? makeScratch(dir, '.narration') : null;
  let job = null;
  const close = () => { closeRender(job); if (copy) rmSync(copy, {recursive: true, force: true}); };
  try {
    const paced = await pacedTimings({storyboard, narrationDir, timings, pacing, copy});
    const compiled = await compileForRender({...inputs, storyboard, recipe, strings}, paced);
    job = prepareRender({film: compiled, storyboard, timings: paced, narrationDir: copy, out: path.join(dir, path.basename(path.resolve(out))), ...render});
    const video = pictureStrategy(render, job, {kitsCode: code});
    if (typeof video.why !== 'function') throw new Error(`previewChanges: this render draws its picture whole (${video.name === 'whole' ? 'whole: true, a part, from/to or an intro' : `the strategy ${video.name}`}), so nothing is kept to compare with: preview the full render of the whole film, drawn in pieces (the default)`);
    return {job, video, storyboard, paced, copy, dir, close};
  } catch (e) { close(); throw e; }
}

/**
 * Draw each changed piece (one: kept in the cache, the 0.18 laws unchanged), then take each range's neighbours (one:
 * reused from the cache once its spot check passes). Returns the clip's windows — each range with `handles` seconds of
 * a neighbour either side, where there is one — and the pieces drawn.
 */
async function drawChanged({job, video}, plan, pieces, ranges, handles) {
  const settled = await Promise.allSettled(pieces.filter(p => p.why !== null).map(p => video.one(job, plan[p.index])));
  const lost = settled.filter(r => r.status === 'rejected').map(r => r.reason);
  if (lost.length) throw lost.find(e => !/ was not drawn: segment \d+ failed/.test(e?.message ?? '')) ?? lost[0];   // the piece that failed, not the ones it stopped
  const got = new Map(settled.map(r => [r.value.index, r.value]));
  // A neighbour shows only when the cache has it: one that cannot be taken leaves its side without a handle.
  const near = handles > 0 ? [...new Set(ranges.flatMap(r => [r.first - 1, r.last + 1]))].filter(i => i >= 0 && i < plan.length && pieces[i].why === null) : [];
  for (const r of await Promise.allSettled(near.map(i => video.one(job, plan[i])))) if (r.status === 'fulfilled') got.set(r.value.index, r.value);
  const h = Math.round(handles * job.fps);
  const windows = ranges.map(r => {
    const before = got.get(r.first - 1), after = got.get(r.last + 1), lead = before ? Math.min(h, before.frames) : 0, tail = after ? Math.min(h, after.frames) : 0;
    const own = Array.from({length: r.last - r.first + 1}, (_, k) => got.get(r.first + k)).map(d => ({file: d.file, start: 0, end: d.frames}));
    return {label: rangeText(r), from: (r.f0 - lead) / job.fps, to: (r.f1 + tail) / job.fps, frames: lead + (r.f1 - r.f0) + tail, labelled: [lead, lead + r.f1 - r.f0 - 1],
      parts: [...(lead ? [{file: before.file, start: before.frames - lead, end: before.frames}] : []), ...own, ...(tail ? [{file: after.file, start: 0, end: tail}] : [])]};
  });
  const drawn = [...got.values()].filter(d => d.status === 'rendered').sort((a, b) => a.index - b.index).map(d => ({index: d.index, frames: d.frames, why: d.why}));
  return {windows, drawn};
}

/** The clip, written in the render's working folder and moved into place (files.mjs · writeOutput): the voice under it when the film has one. */
async function clipOf({job, storyboard, paced, copy, dir}, windows, clip) {
  const final = clip === null ? path.join(outputFolder(dir, 'changes'), 'review.mp4') : path.join(makeFolder(path.dirname(path.resolve(clip))), path.basename(clip));
  refuseFolders([final]);
  const voice = copy ? voiceTrack({dir: job.work, storyboard, timings: paced, narrationDir: copy, ffmpeg: job.ffmpeg}) : null;
  const file = await writeClip({windows, fps: job.fps, width: job.width, height: job.height, voice, file: path.join(job.work, 'changes-review.mp4'), work: job.work, ffmpeg: job.ffmpeg});
  return writeOutput(final, {move: file});
}
