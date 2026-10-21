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
import {statSync} from 'node:fs';
import {frameHashes} from './pins.mjs';
import {writeOutput} from './files.mjs';
import {stampPicture, encoderOf} from './paint.mjs';
import {codeCover} from './segments/code.mjs';
import {ownDrawingCode} from './segments/drawing.mjs';
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
export {changedRanges, changesText, clockOf, CHANGES_DEFAULTS} from './segments/changed.mjs';

/** How many pieces are drawn at once by default: a fair share of the machine's cores (one left free), at most 6. */
export const defaultParallel = () => Math.max(1, Math.min(6, availableParallelism() - 1));
/** The most pieces a picture is planned in (makeFilm runs each as its own subflow): a longer film gets longer pieces. */
export const MAX_PIECES = 1024;

const round = n => +n.toFixed(4);
const hex24 = text => createHash('sha256').update(text).digest('hex').slice(0, 24);
/** The newest change to the files a fingerprint made in this process covers (0 when it covers none it can name). */
const coveredNewest = fp => Math.max(0, ...(typeof fp === 'string' ? codeCover(fp)?.files ?? [] : []).map(f => { try { return statSync(f).mtimeMs; } catch { return Infinity; } }));
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
  // At most `parallel` pieces drawn at once, however many the caller starts (a fan-out starts them all), across every
  // render this strategy serves. What belongs to one render is kept by its job (a strategy shared by two renders at once
  // never mixes them): once one of its pieces fails, its others stop before drawing more (a failed render keeps nothing
  // half made); whether its pieces are kept; its code; what each slot was last drawn from.
  let running = 0, made = 0; const waiting = [], renders = new WeakMap();
  const slot = async () => { if (running >= parallel) await new Promise(r => waiting.push(r)); running++; };
  const free = () => { running--; waiting.shift()?.(); };
  const of = job => { if (!renders.has(job)) throw new Error('segmentedVideo: plan the render (plan(job)) before drawing its pieces'); return renders.get(job); };
  const stopIfFailed = (job, seg) => { const {failed} = of(job); if (failed) throw new Error(`segment ${seg.index} was not drawn: segment ${failed.index} failed (${failed.message})`); };
  /** What each slot of this film was last drawn from (the store's newest manifest per slot), read once a render. */
  const lastDrawn = (job, seg) => {
    const r = of(job);
    r.previous ??= typeof store.newest === 'function' ? store.newest(m => (m.film === seg.film ? m.slot : null)) : new Map();
    return r.previous.get(seg.slot)?.parts ?? null;
  };
  /** The manifest of the piece the store keeps under `key`, or null (a store without kept() is asked for the piece itself). */
  const keptManifest = key => (typeof store.kept === 'function' ? store.kept(key) : store.get(key)?.manifest) ?? null;
  /** Whether a kept piece was drawn where the planned one starts (as its manifest keeps it: rounded). */
  const moved = (m, seg) => Math.abs((m.from ?? round(seg.from)) - round(seg.from)) > 1e-6;
  /** The piece's frames at offsets inside it, hashed exactly as it is kept: drawn without the stamp, which the join burns over every frame. */
  const hasherFor = (job, seg) => { const hash = job.frameHasher({stamp: false}); return offsets => Object.fromEntries(offsets.map(o => [o, hash(seg.f0 + o, {poster: seg.index === 0 && o === 0})])); };
  /** The spot check (see the header): null when a kept piece's frames are this piece's, else why it is drawn again. */
  const spotCheck = (seg, m, hashesAt) => {
    const offsets = Object.keys(m.samples ?? {}).map(Number);
    const comparable = m.frames === seg.f1 - seg.f0 && offsets.length >= Math.min(samples, seg.f1 - seg.f0);
    if (comparable && Object.entries(hashesAt(offsets)).every(([o, h]) => m.samples[o] === h)) return null;
    return !comparable ? 'its kept copy was checked by fewer frames than asked' : moved(m, seg) ? 'it moved, and its frames moved with the film\'s clock'
      : 'its frames changed though its key did not (the key missed something)';
  };
  /** What weakens a render's keys (said after `note:` where it is read), shortest first. */
  const notesOf = job => {
    const {keeping, pieceCode} = of(job), unkeyed = code === undefined && !kitsCode ? unkeyedKits(job.film) : [];
    const runtime = typeof pieceCode === 'function' ? pieceCode.runtime ?? [] : [];
    const strategies = [job.film.attentionFrames?.focus?.code, job.film.attentionFrames?.emphasis?.code].some(Boolean);
    return [...(keeping ? [] : ['the code changed on disk after this render started: its pieces were drawn, not kept']),
      ...(code === null ? ['no code fingerprint was given: a change in the kits\' code is caught only by the spot check'] : []),
      ...(unkeyed.length ? [`kit ${unkeyed.join(', ')} says nothing of where its code lives (sources), and no kitsCode was given: an edit to it is caught only by the spot check`] : []),
      ...(runtime.length ? [`kit code loaded at run time is in no key (${runtime.slice(0, 3).join('; ')}${runtime.length > 3 ? '; …' : ''}): name those files in sources`] : []),
      ...(strategies ? ['a focus or emphasis strategy of your own is keyed by its own function\'s text, not by what it calls'] : [])];
  };
  return {
    name: 'segments',
    /** Where the pieces are kept (the store's folder, or its name). */
    cache: store.dir ?? store.name ?? null,
    /** The pieces, each with its key and its parts. */
    plan(job) {
      if (job.withIntro) throw new Error('segmentedVideo: an intro is not kept in segments; render it with wholeVideo(), or leave the intro out');
      if (job.start !== 0 || job.to < job.film.total - 1e-6) throw new Error('segmentedVideo: segments cover the whole film; render a part (from, to) with wholeVideo()');
      const render = {failed: null, previous: null, keeping: true, pieceCode: null}; renders.set(job, render);
      const {film} = job, keyRecipe = recipe ?? film.recipe;
      if (!keyRecipe) throw new Error('segmentedVideo: give the recipe (this film was not compiled with one StoryReel keeps: compile it with StoryReel 0.18 or later)');
      const recallTimes = [...new Set(film.beats.filter(b => b.path?.startsWith('recalls')).map(b => b.t))];
      // The poster (frame 0 of the first piece, which the spot check paints anyway) and the recalls (the film's own frames
      // a recap or a teaser draws, up to full screen: hashed at full size).
      const extra = {poster: job.poster === null || job.posterFrame === false ? null : frameHashes(film, {times: [+job.poster.toFixed(3)], width: 192}),
        recalls: recallTimes.length ? frameHashes(film, {times: recallTimes, width: 1600}) : null};
      const pieceCode = render.pieceCode = code !== undefined ? code : kitCode(film, {fallback: kitsCode});
      const id = filmId(film);
      // The frame settings, and the FFmpeg build that encodes the pieces (they are joined by copying: one set of H.264
      // parameters for the whole MP4, so a piece another build encoded is drawn again, never joined).
      const pixels = {...job.pixels, encoder: encoderOf(job.ffmpeg)};
      // A film long enough to need more than MAX_PIECES pieces is cut into longer ones (rows whole, at the longest).
      const cut = seconds => planPieces(film, {fps: job.fps, frames: job.frames, minSeconds, chunkSeconds: seconds, blur: Boolean(job.blur)});
      let seconds = chunkSeconds, plan = cut(seconds);
      while (plan.length > MAX_PIECES && seconds !== Infinity) { seconds = seconds * 2 > 600 ? Infinity : seconds * 2; plan = cut(seconds); }
      const keyed = plan.map(seg => ({...seg, film: id,
        ...pieceKey(film, seg, {recipe: keyRecipe, storyboard: job.storyboard, pixels, code: pieceCode, fps: job.fps, margin, layout: job.framed, extra}),
        forced: force.some(f => f === seg.index || seg.scenes.includes(f)),
      }));
      // Two pieces whose materials match (two quiet stretches of one long scene: a key says nothing of where a piece
      // sits) are two pieces all the same: each is told apart by its slot, so neither is ever kept in the other's file.
      const count = new Map(); for (const p of keyed) count.set(p.key, (count.get(p.key) ?? 0) + 1);
      // Code changed on disk after this process started is not the code it draws with: its pieces are drawn, not kept.
      const newest = Math.max(ownDrawingCode().newest, typeof pieceCode === 'function' ? pieceCode.newest ?? 0 : coveredNewest(pieceCode), coveredNewest(kitsCode));
      render.keeping = !(newest > performance.timeOrigin);
      return keyed.map(p => (count.get(p.key) > 1 ? {...p, key: hex24(`${p.key}|${p.slot}`)} : p));
    },
    /**
     * Why `one` would draw a piece, read before anything is drawn: null when the store keeps it, else the reason one
     * gives — 'forced', what changed since its slot was last drawn ("words changed"), or 'new'. A piece kept where it
     * starts is taken on its key, its video unread (the render's spot check still checks it); one kept elsewhere (an
     * earlier scene grew) is spot-checked now, as one() checks it, since a kit that animates on the film's clock redraws it.
     */
    why(job, seg) {
      of(job);
      if (seg.forced) return 'forced';
      const m = keptManifest(seg.key);
      if (!m) return whyDrawn(lastDrawn(job, seg), seg.parts) ?? 'new';
      return moved(m, seg) ? spotCheck(seg, m, hasherFor(job, seg)) : null;
    },
    /** What weakens this render's keys: the notes its report's line ends with. */
    notes: job => notesOf(job),
    /** One piece: reused when its key and its spot check match, drawn again otherwise. */
    async one(job, seg) {
      stopIfFailed(job, seg);
      const report = {index: seg.index, from: round(seg.from), to: round(seg.to), frames: seg.f1 - seg.f0, scenes: [...seg.scenes], key: seg.key, ...(seg.label ? {label: seg.label} : {})};
      const hashesAt = hasherFor(job, seg);
      // The render's own hold on the piece it joins: a link in its working folder (a copy on another disk), taken when the
      // piece is checked or drawn, so nothing put after that — by this render or another — changes what is joined.
      const own = path.join(job.work, `piece-${seg.index}.mp4`), held = file => (file === own ? own : writeOutput(own, {copy: file, link: true}));
      const kept = seg.forced ? null : store.get(seg.key, {into: own});
      let why = seg.forced ? 'forced' : null;
      if (kept) {
        why = spotCheck(seg, kept.manifest, hashesAt);
        if (why === null) return {...report, status: 'reused', file: held(kept.file)};
      }
      why ??= whyDrawn(lastDrawn(job, seg), seg.parts) ?? 'new';
      await slot();
      try {
        stopIfFailed(job, seg);
        const tmp = path.join(job.work, `segment-${seg.index}-${seg.key}-${process.pid}-${++made}.mp4`);   // in the render's work folder until the store takes it
        await job.encodeFrames({f0: seg.f0, f1: seg.f1, file: tmp, posterFirst: seg.index === 0, stamp: false});
        if (!of(job).keeping) return {...report, status: 'rendered', why, file: tmp};   // drawn with code older than its key: not kept
        held(tmp);
        store.put(seg.key, tmp, {key: seg.key, index: seg.index, from: round(seg.from), frames: seg.f1 - seg.f0, scenes: seg.scenes, film: seg.film, slot: seg.slot, ...(seg.label ? {label: seg.label} : {}), parts: seg.parts,
          samples: hashesAt(sampleOffsets(seg, samples, job.fps)), made: new Date().toISOString()});
        return {...report, status: 'rendered', why, file: own};
      } catch (e) {
        of(job).failed ??= {index: seg.index, message: e.message};
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
      const {keeping} = of(job), segments = done.map(({file: _f, ...d}) => d);
      // What weakens this render's keys, said where it is read (the line).
      const notes = notesOf(job);
      const report = {strategy: 'segments', store: store.dir ?? store.name, reused: segments.filter(s => s.status === 'reused').length, rendered: segments.filter(s => s.status === 'rendered').length,
        ...(notes.length ? {note: notes.join('; ')} : {}), ...(keeping ? {} : {kept: false}),
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
