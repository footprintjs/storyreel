/**
 * Re-render only what changed. A film's picture is made in pieces — each row of pictures (a shot, from the moment its
 * entrance starts) cut where a scene starts and every few seconds (segments/plan.mjs) — and each piece is kept in a
 * cache under a key built from what draws it (segments/material.mjs): its recipe entries, the beats, words, notes,
 * camera moves and focus around it on its own clock, what reaches every frame (the strings, the data, the theme, the
 * cast, every file the film read), the frame settings, StoryReel's drawing code (segments/drawing.mjs: only code that
 * paints, and only the transitions it plays) and the kits' code (segments/kitcode.mjs: each kit's own `sources`). When
 * something changes, only the pieces whose key changed are drawn again; the rest are reused, and all of them are joined
 * into one video. The sound is never cached: it is mixed for the whole film each time (render.mjs · finishRender).
 *
 * This is the default way a film is drawn (picture.mjs · pictureStrategy: the cache beside the video). Three seams, so
 * each part can be swapped: the strategy (wholeVideo() draws every frame in one pass; segmentedVideo() this one), the
 * store (segments/store.mjs · folderStore) and the joiner (segments/join.mjs · ffmpegJoin, which burns a draft stamp
 * once over the joined picture: pieces are drawn without it, so a new label redraws nothing).
 *
 * A key is only as good as what it lists, so a reused piece must also pass a spot check: a few of its frames are
 * painted again exactly as the piece shows them (the layout, the motion blur, the poster) and must match the ones kept
 * when it was drawn. The check cannot be turned off (samples is at least 1). A piece that moved is reused only when its
 * frames did not move with the film's clock — a kit that animates on it (the cartoon's drifting clouds) makes it draw
 * again — and a key whose frames still changed is drawn again, saying so.
 */
import path from 'node:path';
import {availableParallelism} from 'node:os';
import {createHash} from 'node:crypto';
import {frameHashes} from './pins.mjs';
import {writeOutput} from './files.mjs';
import {stampPicture, encoderOf} from './paint.mjs';
import {planPieces, sampleOffsets, PIECE_DEFAULTS} from './segments/plan.mjs';
import {pieceKey, whyDrawn} from './segments/material.mjs';
import {ffmpegJoin} from './segments/join.mjs';
import {kitCode, unkeyedKits} from './segments/kitcode.mjs';
import {pictureLine} from './segments/report.mjs';

export {wholeVideo} from './whole.mjs';
export {codeFingerprint, codeCover, sourceCode, engineFingerprint, storyreelCode, CODE_EXTENSIONS} from './segments/code.mjs';
export {planSegments, planPieces, sampleOffsets, PIECE_DEFAULTS} from './segments/plan.mjs';
export {segmentMaterial, segmentKey, pieceKey, whyDrawn, PART_WHY} from './segments/material.mjs';
export {folderStore, STORE_DEFAULTS} from './segments/store.mjs';
export {ffmpegJoin} from './segments/join.mjs';
export {drawingCode, CATALOG, NOT_DRAWING} from './segments/drawing.mjs';
export {kitCode} from './segments/kitcode.mjs';
export {pictureLine} from './segments/report.mjs';

/** How many pieces are drawn at once by default: a fair share of the machine's cores (one left free), at most 6. */
export const defaultParallel = () => Math.max(1, Math.min(6, availableParallelism() - 1));
/** The most pieces a picture is planned in (makeFilm runs each as its own subflow): a longer film gets longer pieces. */
export const MAX_PIECES = 1024;

const round = n => +n.toFixed(4);
/** Which film a piece is of, across renders: its scenes, by id (a re-voiced or re-drawn film is the same film). */
const filmId = film => createHash('sha256').update(JSON.stringify(film.timings.scenes.map(s => s.id))).digest('hex').slice(0, 24);

/**
 * The segmented strategy: plan the pieces, reuse each one whose key and spot check match, draw the rest, and join
 * them. `force` names pieces to draw again whatever their key says (a piece index, or a scene id it covers).
 * @param store        where pieces are kept (folderStore(dir)) — required
 * @param recipe       the film's recipe (each piece's entries are part of its key); left out, the one the film was
 *                     compiled from (film.recipe)
 * @param code         the kits' code in each key: a fingerprint (codeFingerprint([kitsFolder]): in every key), code per
 *                     piece (sourceCode(sources)), null (none: only the spot check sees a kit change), or left out — each
 *                     kit's own `sources` (segments/kitcode.mjs), and `kitsCode` for the kits that declare none
 * @param kitsCode     a fingerprint of all the kits' code, keyed into every piece a kit without `sources` draws
 * @param joiner       how pieces are joined: join(files, out, {stamp}) (default: ffmpegJoin with the render's FFmpeg)
 * @param samples      how many frames of a reused piece are painted again to check it (6; 1–60: never off)
 * @param chunkSeconds the longest piece a row is cut into (6; Infinity keeps rows whole)
 * @param minSeconds   the shortest piece (1.5): a shorter row joins the one before it, a shorter remainder its piece
 * @param margin       how far around a piece a beat, word or note counts by its exact time (3 s)
 * @param parallel     how many pieces are drawn at once (a fair share of the cores: availableParallelism − 1, at most 6)
 */
export function segmentedVideo({store, recipe = null, code, kitsCode = null, joiner = null, force = [], samples = 6, minSeconds = PIECE_DEFAULTS.minSeconds, chunkSeconds = PIECE_DEFAULTS.chunkSeconds, margin = 3, parallel = defaultParallel()} = {}) {
  if (!store || typeof store.get !== 'function' || typeof store.put !== 'function') throw new Error('segmentedVideo: give a store (folderStore(dir)) to keep the segments in');
  if (recipe !== null && (typeof recipe !== 'object' || Array.isArray(recipe))) throw new Error('segmentedVideo: recipe is the film\'s recipe (every piece\'s entries are part of its key), or left out for the one the film was compiled from');
  if (!Array.isArray(force)) throw new Error('segmentedVideo: force is a list of segment indexes or scene ids');
  if (!(Number.isInteger(parallel) && parallel >= 1 && parallel <= 16)) throw new Error('segmentedVideo: parallel is how many segments are drawn at once, a whole number 1–16');
  if (!(Number.isInteger(samples) && samples >= 1 && samples <= 60)) throw new Error('segmentedVideo: samples is how many frames of a kept segment are checked, a whole number 1–60 (the check is what makes a reused piece safe: it cannot be turned off)');
  if (!(typeof margin === 'number' && margin >= 0 && margin <= 30)) throw new Error('segmentedVideo: margin is how many seconds around a piece count by their exact time, 0–30');
  if (!(chunkSeconds === Infinity || (typeof chunkSeconds === 'number' && chunkSeconds >= 1 && chunkSeconds <= 600))) throw new Error(`segmentedVideo: chunkSeconds is the longest piece a row is cut into, 1–600 seconds (Infinity keeps each row whole), not ${JSON.stringify(chunkSeconds)}`);
  if (!(typeof minSeconds === 'number' && minSeconds >= .1 && minSeconds <= 60)) throw new Error(`segmentedVideo: minSeconds is the shortest piece, 0.1–60 seconds, not ${JSON.stringify(minSeconds)}`);
  if (code !== undefined && code !== null && typeof code !== 'string' && typeof code !== 'function') throw new Error('segmentedVideo: code is a fingerprint (codeFingerprint), code per piece (sourceCode), null, or left out (the kits\' own sources)');
  if (kitsCode !== null && typeof kitsCode !== 'string') throw new Error('segmentedVideo: kitsCode is a fingerprint of all the kits\' code (codeFingerprint([kitsFolder])), or left out');
  // At most `parallel` pieces drawn at once, however many the caller starts (a fan-out starts them all);
  // once one fails, the others stop before drawing any more (a failed render keeps nothing half made).
  let running = 0, failed = null, made = 0, previous = null; const waiting = [];
  const slot = async () => { if (running >= parallel) await new Promise(r => waiting.push(r)); running++; };
  const free = () => { running--; waiting.shift()?.(); };
  const stopIfFailed = seg => { if (failed) throw new Error(`segment ${seg.index} was not drawn: segment ${failed.index} failed (${failed.message})`); };
  /** What each slot of this film was last drawn from (the store's newest manifest per slot), read once a render. */
  const lastDrawn = seg => {
    previous ??= typeof store.newest === 'function' ? store.newest(m => (m.film === seg.film ? m.slot : null)) : new Map();
    return previous.get(seg.slot)?.parts ?? null;
  };
  return {
    name: 'segments',
    /** The pieces, each with its key and its parts. */
    plan(job) {
      if (job.withIntro) throw new Error('segmentedVideo: an intro is not kept in segments; render it with wholeVideo(), or leave the intro out');
      if (job.start !== 0 || job.to < job.film.total - 1e-6) throw new Error('segmentedVideo: segments cover the whole film; render a part (from, to) with wholeVideo()');
      failed = null; previous = null;
      const {film} = job, keyRecipe = recipe ?? film.recipe;
      if (!keyRecipe) throw new Error('segmentedVideo: give the recipe (this film was not compiled with one StoryReel keeps: compile it with StoryReel 0.18 or later)');
      const recallTimes = [...new Set(film.beats.filter(b => b.path?.startsWith('recalls')).map(b => b.t))];
      const extra = {poster: job.poster === null || job.posterFrame === false ? null : frameHashes(film, {times: [+job.poster.toFixed(3)], width: 192}),
        recalls: recallTimes.length ? frameHashes(film, {times: recallTimes, width: 192}) : null};
      const pieceCode = code !== undefined ? code : kitCode(film, {fallback: kitsCode}), id = filmId(film);
      // The frame settings, and the FFmpeg build that encodes the pieces (they are joined by copying: one set of H.264
      // parameters for the whole MP4, so a piece another build encoded is drawn again, never joined).
      const pixels = {...job.pixels, encoder: encoderOf(job.ffmpeg)};
      // A film long enough to need more than MAX_PIECES pieces is cut into longer ones (rows whole, at the longest).
      const cut = seconds => planPieces(film, {fps: job.fps, frames: job.frames, minSeconds, chunkSeconds: seconds, blur: Boolean(job.blur)});
      let seconds = chunkSeconds, plan = cut(seconds);
      while (plan.length > MAX_PIECES && seconds !== Infinity) { seconds = seconds * 2 > 600 ? Infinity : seconds * 2; plan = cut(seconds); }
      return plan.map(seg => ({...seg, film: id,
        ...pieceKey(film, seg, {recipe: keyRecipe, storyboard: job.storyboard, pixels, code: pieceCode, fps: job.fps, margin, captions: job.framed?.captionChunks ?? null, extra}),
        forced: force.some(f => f === seg.index || seg.scenes.includes(f)),
      }));
    },
    /** One piece: reused when its key and its spot check match, drawn again otherwise. */
    async one(job, seg) {
      stopIfFailed(seg);
      const report = {index: seg.index, from: round(seg.from), to: round(seg.to), frames: seg.f1 - seg.f0, scenes: [...seg.scenes], key: seg.key, ...(seg.label ? {label: seg.label} : {})};
      // The piece as it is kept: drawn without the stamp, which the join burns over every frame.
      const hash = job.frameHasher({stamp: false}), hashesAt = offsets => Object.fromEntries(offsets.map(o => [o, hash(seg.f0 + o, {poster: seg.index === 0 && o === 0})]));
      const kept = seg.forced ? null : store.get(seg.key);
      let why = seg.forced ? 'forced' : null;
      if (kept) {
        const m = kept.manifest, offsets = Object.keys(m.samples ?? {}).map(Number);
        const comparable = m.frames === seg.f1 - seg.f0 && offsets.length >= Math.min(samples, seg.f1 - seg.f0);
        if (comparable && Object.entries(hashesAt(offsets)).every(([o, h]) => m.samples[o] === h)) return {...report, status: 'reused', file: kept.file};
        why = !comparable ? 'its kept copy was checked by fewer frames than asked'
          : Math.abs((m.from ?? round(seg.from)) - round(seg.from)) > 1e-6 ? 'it moved, and its frames moved with the film\'s clock'   // as the manifest keeps it (rounded)
          : 'its frames changed though its key did not (the key missed something)';
      }
      why ??= whyDrawn(lastDrawn(seg), seg.parts) ?? 'new';
      await slot();
      try {
        stopIfFailed(seg);
        const tmp = path.join(job.work, `segment-${seg.index}-${seg.key}-${process.pid}-${++made}.mp4`);   // in the render's work folder until the store takes it
        await job.encodeFrames({f0: seg.f0, f1: seg.f1, file: tmp, posterFirst: seg.index === 0, stamp: false});
        const file = store.put(seg.key, tmp, {key: seg.key, index: seg.index, from: round(seg.from), frames: seg.f1 - seg.f0, scenes: seg.scenes, film: seg.film, slot: seg.slot, ...(seg.label ? {label: seg.label} : {}), parts: seg.parts,
          samples: hashesAt(sampleOffsets(seg, samples, job.fps)), made: new Date().toISOString()});
        return {...report, status: 'rendered', why, file};
      } catch (e) {
        failed ??= {index: seg.index, message: e.message};
        throw e;
      } finally { free(); }
    },
    /** Join the pieces, in order, into the film's picture — with the stamp burned over it when the render has one. */
    async join(job, done) {
      const file = path.join(job.work, 'film-video.mp4');   // the joined picture: a working file (render.mjs · closeRender removes it)
      const stamp = job.stamp ? {png: writeOutput(path.join(job.work, 'film-stamp.png'), await stampPicture({stamp: job.stamp, width: job.width, height: job.height})), quality: job.quality ?? 'standard'} : null;
      await (joiner ?? ffmpegJoin({ffmpeg: job.ffmpeg})).join(done.map(d => d.file), file, {stamp});
      // The store held to its size: the pieces used longest ago go, never one this render used.
      const trimmed = typeof store.trim === 'function' ? store.trim({keep: new Set(done.map(d => d.key))}) : null;
      const segments = done.map(({file: _f, ...d}) => d), unkeyed = code === undefined && !kitsCode ? unkeyedKits(job.film) : [];
      const report = {strategy: 'segments', store: store.dir ?? store.name, reused: segments.filter(s => s.status === 'reused').length, rendered: segments.filter(s => s.status === 'rendered').length,
        ...(code === null ? {note: 'no code fingerprint was given: a change in the drawing code is caught only by the spot check'} : unkeyed.length ? {note: `the kits ${unkeyed.join(', ')} say nothing of where their code lives (kit.sources) and no kitsCode was given: a change in their code is caught only by the spot check`} : {}),
        ...(trimmed?.evicted?.length ? {evicted: trimmed.evicted.length} : {}), ...(stamp ? {stamp: 'burned at the join'} : {}), segments};
      return {file, report: {...report, line: pictureLine(report)}};
    },
    /** All of it: every piece started at once, `parallel` drawn at a time (makeFilm runs them as a fan-out: pipeline.mjs). */
    async render(job) {
      const settled = await Promise.allSettled(this.plan(job).map(seg => this.one(job, seg)));
      // Every piece settled before anything is said: a failed render leaves no encode running in its working folder.
      const lost = settled.filter(r => r.status === 'rejected').map(r => r.reason);
      if (lost.length) throw lost.find(e => !/ was not drawn: segment \d+ failed/.test(e?.message ?? '')) ?? lost[0];   // the piece that failed, not the ones it stopped
      return this.join(job, settled.map(r => r.value));
    },
  };
}
