/**
 * How a render's picture is made when the caller does not say: in pieces kept in a cache beside the video
 * (segments.mjs), so the next render draws only what changed and reuses the rest. renderFilm and makeFilm both ask here.
 *
 *   video: <strategy>   the caller's: segmentedVideo({store, …}) or wholeVideo()
 *   whole: true         every frame in one pass (wholeVideo()): to debug the cache, never needed for a final render
 *   a part or an intro  drawn whole (the cache holds whole films)
 *   otherwise           pieces in <out folder>/.storyreel/segments/<format>-<W>x<H>-<quality>, a cache held to
 *                       `segments.cap` (4 GB), with `segments` options for the rest
 */
import path from 'node:path';
import {wholeVideo} from './whole.mjs';
import {segmentedVideo} from './segments.mjs';
import {folderStore} from './segments/store.mjs';
import {outputFolder, ownFoldersIn} from './files.mjs';

/** Where the default cache lives inside the out folder. */
export const SEGMENTS_FOLDER = Object.freeze(['.storyreel', 'segments']);
const SEGMENT_KEYS = ['dir', 'cap', 'chunkSeconds', 'minSeconds', 'margin', 'parallel', 'samples', 'force', 'code', 'kitsCode'];

/** The picture options a render takes (video, whole, segments), checked before anything is drawn. */
export function checkPictureOptions({video, whole, segments} = {}) {
  if (whole !== undefined && typeof whole !== 'boolean') throw new Error(`whole is true (every frame in one pass, to debug the cache) or left out, not ${JSON.stringify(whole)}`);
  if (whole && video) throw new Error('a render takes video (a strategy) or whole: true, not both');
  if (segments === undefined || segments === null) return;
  if (typeof segments !== 'object' || Array.isArray(segments)) throw new Error(`segments is the cache's options {${SEGMENT_KEYS.join(', ')}}, not ${JSON.stringify(segments)}`);
  for (const key of Object.keys(segments)) if (!SEGMENT_KEYS.includes(key)) throw new Error(`segments has unsupported key ${key} (the keys are ${SEGMENT_KEYS.join(', ')})`);
  if (video || whole) throw new Error(`segments sets the default cache's options; with ${video ? 'video (a strategy of your own)' : 'whole: true'} there is no default cache: leave segments out`);
  if (segments.dir !== undefined && !(typeof segments.dir === 'string' && segments.dir.trim())) throw new Error(`segments.dir is the folder the cache is kept in, not ${JSON.stringify(segments.dir)}`);
}

/** The default cache's folder for a render: one per format, size and quality, inside the out folder. */
export const defaultCacheName = job => `${job.framed?.format ?? 'frame'}-${job.width}x${job.height}-${job.quality ?? 'standard'}`;

/**
 * The strategy for a render (see the module's header). `job` is the prepared render (render.mjs · prepareRender);
 * kitsCode, a fingerprint of the kits' code (makeFilm's `code`), keys every piece a kit without `sources` draws.
 */
export function pictureStrategy(options, job, {kitsCode = null} = {}) {
  checkPictureOptions(options);
  const {video, whole, segments = {}} = options;
  if (video) return video;
  if (whole || job.withIntro || job.start !== 0 || job.to < job.film.total - 1e-6) return wholeVideo();
  const {dir, cap, code, kitsCode: given, ...rest} = segments ?? {};
  // The default cache: inside the out folder, each level a real folder of ours (a link there is refused, never read),
  // made — and checked again — only when the first piece is kept.
  const names = [...SEGMENTS_FOLDER, defaultCacheName(job)];
  const store = dir ? folderStore(dir, {...(cap === undefined ? {} : {cap})})
    : folderStore(ownFoldersIn(job.dir, names), {...(cap === undefined ? {} : {cap}), make: () => outputFolder(job.dir, names)});
  return segmentedVideo({store, ...(code === undefined ? {} : {code}), kitsCode: given ?? kitsCode, ...rest});
}

/** Where the default cache of a render into `out` would be (for a script that wants to show or clear it). */
export const defaultCacheDir = (out, {format = 'frame', width, height, quality = 'standard'}) => path.join(path.dirname(path.resolve(out)), ...SEGMENTS_FOLDER, `${format}-${width}x${height}-${quality}`);
