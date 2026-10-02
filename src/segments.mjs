/**
 * Re-render only what changed. A film's picture is made in segments — one per row of pictures
 * (film.rows: a shot, from the moment its entrance starts) — and each segment is kept in a cache under
 * a key built from everything that draws it. When the storyboard, the recipe or the drawing code
 * changes, only the segments whose key changed are drawn again; the rest are reused, and all of them are
 * joined into one video. The sound is never cached: it is mixed for the whole film each time (render.mjs ·
 * finishRender), which is quick and keeps it seamless.
 *
 * Three seams, so each part can be swapped (the strategy, and the two adapters it uses):
 *   - a strategy makes the picture: wholeVideo() (render.mjs; every frame in one pass) or segmentedVideo();
 *   - a store keeps segments between renders: folderStore(dir) keeps each as <key>.mp4 + <key>.json;
 *   - a joiner joins segment files: ffmpegJoin() (FFmpeg's concat demuxer, no re-encode: every segment is
 *     encoded with the same settings, each starting on a key frame).
 *
 * A key is only as good as what it lists, so a reused segment must also pass a spot check: a few of its
 * frames are drawn again (small, at sample moments) and their fingerprints must match the ones kept when
 * it was rendered. A change the key missed (a world reading a moment outside its own lines, say) shows
 * there, and the segment is drawn again.
 */
import {readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, copyFileSync, readdirSync, statSync, rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {frameHashes} from './pins.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');

/** Every file under the given folders (or the files themselves), hashed in path order: a fingerprint of drawing code. */
export function codeFingerprint(paths, {extensions = ['.mjs', '.js', '.json', '.ttf', '.otf', '.png', '.jpg', '.svg']} = {}) {
  if (!Array.isArray(paths) || !paths.length) throw new Error('codeFingerprint: give the folders or files that hold the drawing code (e.g. the film\'s kits folder)');
  const files = [];
  const walk = p => {
    if (!existsSync(p)) throw new Error(`codeFingerprint: ${p} does not exist`);
    if (statSync(p).isDirectory()) { for (const name of readdirSync(p).sort()) if (!name.startsWith('.') && name !== 'node_modules') walk(path.join(p, name)); }
    else if (extensions.includes(path.extname(p).toLowerCase())) files.push(p);
  };
  for (const p of paths) walk(path.resolve(p));
  const h = createHash('sha256');
  for (const f of files) h.update(path.basename(f)).update('\0').update(readFileSync(f)).update('\0');
  return h.digest('hex').slice(0, 24);
}

/** StoryReel's own drawing code (transitions, layout, captions, kits): part of every key. */
let ownCode = null;
const storyreelCode = () => ownCode ??= codeFingerprint([fileURLToPath(new URL('.', import.meta.url))]);

/**
 * The film's segments: one per row of pictures (film.rows), on whole frames — segment i covers frames
 * [f0, f1) — so joined they draw exactly the frames one pass would. A row shorter than `minSeconds` joins
 * the segment before it (a segment per quick cut would cost more in joins than it saves).
 * @returns [{index, f0, f1, from, to, paths, before, scenes}] — before: the paths of the row an entrance
 *          transition also draws (null after a cut)
 */
export function planSegments(film, {fps = 30, frames = Math.ceil(film.total * fps), minSeconds = 1.5} = {}) {
  if (!Array.isArray(film.rows) || !film.rows.length) throw new Error('planSegments: this film has no rows (compile it with StoryReel 0.4 or later)');
  const raw = film.rows.map((r, j) => ({f0: j === 0 ? 0 : Math.min(frames, Math.max(0, Math.round(r.from * fps))), paths: [...r.paths],
    before: r.enter && r.enter.type !== 'cut' ? [...film.rows[j - 1].paths] : null}));
  raw.forEach((s, j) => { s.f1 = j + 1 < raw.length ? raw[j + 1].f0 : frames; });
  const out = [];
  for (const s of raw.filter(s => s.f1 > s.f0)) {
    const last = out.at(-1);
    if (last && (s.f1 - s.f0) < minSeconds * fps) { last.f1 = s.f1; last.paths.push(...s.paths); continue; }
    if (last && (last.f1 - last.f0) < minSeconds * fps) { last.f1 = s.f1; last.paths.push(...s.paths); last.before ??= s.before; continue; }
    out.push({...s});
  }
  const offsets = film.clock.offsets, ids = film.timings.scenes.map(s => s.id), durations = film.timings.scenes.map(s => s.duration);
  return out.map((s, index) => {
    const from = s.f0 / fps, to = s.f1 / fps;
    const scenes = ids.filter((_, i) => offsets[i] < to && offsets[i] + durations[i] > from);
    return Object.freeze({index, f0: s.f0, f1: s.f1, from, to, paths: Object.freeze([...new Set(s.paths)]), before: s.before && Object.freeze(s.before), scenes: Object.freeze(scenes)});
  });
}

/** The recipe entry at a path ('story', 'whiteboard', 'stages[3]'). */
const entryAt = (recipe, p) => { const m = p.match(/^stages\[(\d+)\]$/); return m ? recipe.stages?.[+m[1]] : recipe[p]; };
const round = n => +n.toFixed(4);
const inside = (p, paths) => paths.some(q => p === q || p.startsWith(`${q}.`));

/**
 * Everything that draws a segment, on its own clock (seconds from its first frame), so a segment whose
 * shot did not change keeps its key when an earlier scene grows or shrinks: the recipe entries of its
 * rows (and of the row an entrance also draws), every line they resolved, the words spoken in and around
 * it (captions and mouths), the director's notes over it, the frame settings, and the drawing code.
 */
export function segmentMaterial(film, seg, {recipe, storyboard = null, pixels, code = null, fps = 30, margin = 3}) {
  const paths = [...seg.paths, ...(seg.before ?? [])], at = t => round(t - seg.from);
  const scenes = film.timings.scenes.map((sc, i) => ({sc, start: film.clock.offsets[i]}))
    .filter(({sc, start}) => start < seg.to + margin && start + sc.duration > seg.from - margin)
    .map(({sc, start}) => {
      const board = storyboard?.scenes?.find(b => b.id === sc.id);
      return {id: sc.id, start: at(start), duration: round(sc.duration), words: (sc.words ?? []).map(w => [w.text, at(start + w.start), at(start + w.end)]),
        ...(board ? {said: board.narration ?? board.silent ?? null, speaker: board.speaker ?? null} : {})};
    });
  const near = t => t >= seg.from - margin && t <= seg.to + margin;
  return {
    v: 1, storyreel: storyreelCode(), code, frames: seg.f1 - seg.f0, fps,
    pixels: {...pixels, poster: seg.index === 0 && pixels.poster !== null ? 'drawn' : null},
    entries: paths.map(p => [p, entryAt(recipe, p) ?? null]),
    lines: film.beats.filter(b => b.path && (inside(b.path, paths) || (b.path.startsWith('guesses') && near(b.t)))).map(b => [b.path, at(b.t)]),
    // A camera speed is the whole film's; a push or a cut counts where it happens.
    notes: (film.notes ?? []).filter(n => n.speed !== undefined || (n.push ? (n.from < seg.to && n.to > seg.from) : near(n.at ?? -Infinity)))
      .map(n => ({...n, ...(n.from === undefined ? {} : {from: at(n.from)}), ...(n.to === undefined ? {} : {to: at(n.to)}), ...(n.at === undefined ? {} : {at: at(n.at)})})),
    scenes, theme: film.theme ?? null,
  };
}

/** A segment's cache key: its material (segmentMaterial), hashed; the poster and the recalls ride along. */
export function segmentKey(film, seg, options) {
  const extra = options.extra ?? {};
  return sha(JSON.stringify({material: segmentMaterial(film, seg, options), ...(seg.index === 0 ? {poster: extra.poster ?? null} : {}), recalls: extra.recalls ?? null})).slice(0, 24);
}

/** The moments a segment is spot-checked at: `count` frames spread over it, first and last included. */
export function sampleMoments(seg, {fps = 30, count = 6} = {}) {
  const n = seg.f1 - seg.f0, picks = [...new Set(Array.from({length: Math.min(count, n)}, (_, k) => seg.f0 + Math.round(k * (n - 1) / Math.max(1, Math.min(count, n) - 1))))];
  return picks.map(f => +(f / fps).toFixed(3)).filter((t, i, all) => all.indexOf(t) === i);
}

/** Keep segments as files in one folder: <key>.mp4 and <key>.json (the manifest). The default store. */
export function folderStore(dir) {
  if (typeof dir !== 'string' || !dir) throw new Error('folderStore: give the folder the segments are kept in');
  const at = key => ({file: path.join(dir, `${key}.mp4`), json: path.join(dir, `${key}.json`)});
  return {
    name: 'folder', dir: path.resolve(dir),
    get(key) {
      const {file, json} = at(key);
      if (!existsSync(file) || !existsSync(json)) return null;
      try { return {file, manifest: JSON.parse(readFileSync(json, 'utf8'))}; } catch { return null; }
    },
    put(key, file, manifest) {
      mkdirSync(dir, {recursive: true});
      const to = at(key);
      try { renameSync(file, to.file); } catch { copyFileSync(file, to.file); rmSync(file, {force: true}); }
      writeFileSync(to.json, JSON.stringify(manifest, null, 2));
      return to.file;
    },
  };
}

/** Join segment files into one video without re-encoding (FFmpeg's concat demuxer). The default joiner. */
export function ffmpegJoin({ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg'} = {}) {
  return {
    name: 'ffmpeg-concat',
    join(files, out) {
      const list = `${out}.txt`;
      writeFileSync(list, files.map(f => `file '${path.resolve(f).replace(/'/g, "'\\''")}'`).join('\n') + '\n');
      const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out], {encoding: 'utf8'});
      if (r.error || r.status !== 0) throw new Error(`ffmpeg could not join ${files.length} segments into ${path.basename(out)}: ${r.error?.message ?? String(r.stderr).slice(-400)}`);
      return out;
    },
  };
}

/**
 * The segmented strategy: plan the segments, reuse each one whose key and spot check match, draw the
 * rest, and join them. `force` names segments to draw again whatever their key says (a segment index, or
 * a scene id it covers) — for when you want to see a part fresh.
 * @param store   where segments are kept (folderStore(dir)) — required
 * @param recipe  the film's recipe (each segment's entries are part of its key) — required
 * @param code    a fingerprint of the drawing code outside StoryReel (codeFingerprint([kitsFolder])); without
 *                it a kit change is caught only by the spot check, and the report says so
 * @param joiner  how segment files are joined (ffmpegJoin())
 * @param samples how many frames of a reused segment are drawn again to check it (6; 0 turns the check off)
 */
export function segmentedVideo({store, recipe, code = null, joiner = ffmpegJoin(), force = [], samples = 6, minSeconds = 1.5, sampleWidth = 192, parallel = 2} = {}) {
  if (!store || typeof store.get !== 'function' || typeof store.put !== 'function') throw new Error('segmentedVideo: give a store (folderStore(dir)) to keep the segments in');
  if (!recipe || typeof recipe !== 'object') throw new Error('segmentedVideo: give the recipe (every segment\'s entries are part of its key)');
  if (!Array.isArray(force)) throw new Error('segmentedVideo: force is a list of segment indexes or scene ids');
  if (!(Number.isInteger(parallel) && parallel >= 1 && parallel <= 16)) throw new Error('segmentedVideo: parallel is how many segments are drawn at once, a whole number 1–16');
  const fingerprints = (film, times) => times.length ? frameHashes(film, {times, width: sampleWidth}) : {};
  // At most `parallel` segments drawn at once, however many the caller starts (a fan-out starts them all).
  let running = 0; const waiting = [];
  const slot = async () => { if (running >= parallel) await new Promise(r => waiting.push(r)); running++; };
  const free = () => { running--; waiting.shift()?.(); };
  return {
    name: 'segments',
    /** The segments, each with its key and the fingerprints of its sample frames. */
    plan(job) {
      if (job.withIntro) throw new Error('segmentedVideo: an intro is not kept in segments; render it with wholeVideo(), or leave the intro out');
      if (job.start !== 0 || job.to < job.film.total - 1e-6) throw new Error('segmentedVideo: segments cover the whole film; render a part (from, to) with wholeVideo()');
      const {film} = job, extra = {poster: job.poster === null ? null : fingerprints(film, [+job.poster.toFixed(3)]),
        recalls: recipe.recalls ? fingerprints(film, Object.values(recipe.recalls).map(ref => +film.clock.at(ref).toFixed(3)).filter((t, i, a) => a.indexOf(t) === i)) : null};
      return planSegments(film, {fps: job.fps, frames: job.frames, minSeconds}).map(seg => ({
        ...seg, key: segmentKey(film, seg, {recipe, storyboard: job.storyboard, pixels: job.pixels, code, fps: job.fps, extra}),
        samples: samples ? fingerprints(film, sampleMoments(seg, {fps: job.fps, count: samples})) : {},
        forced: force.some(f => f === seg.index || seg.scenes.includes(f)),
      }));
    },
    /** One segment: reused when its key and its spot check match, drawn again otherwise. */
    async one(job, seg) {
      const kept = seg.forced ? null : store.get(seg.key);
      const sameSamples = kept && JSON.stringify(kept.manifest.samples ?? {}) === JSON.stringify(seg.samples);
      const report = {index: seg.index, from: round(seg.from), to: round(seg.to), frames: seg.f1 - seg.f0, scenes: [...seg.scenes], key: seg.key};
      if (kept && sameSamples) return {...report, status: 'reused', file: kept.file};
      const why = seg.forced ? 'forced' : kept ? 'its frames changed though its key did not (the key missed something: drawn again)' : 'new or changed';
      const tmp = path.join(job.dir, `segment-${seg.index}-${seg.key}.mp4`);
      await slot();
      try { await job.encodeFrames({f0: seg.f0, f1: seg.f1, file: tmp, posterFirst: seg.index === 0}); } finally { free(); }
      const file = store.put(seg.key, tmp, {key: seg.key, index: seg.index, frames: seg.f1 - seg.f0, scenes: seg.scenes, samples: seg.samples, made: new Date().toISOString()});
      return {...report, status: 'rendered', why, file};
    },
    /** Join the segments, in order, into the film's picture. */
    join(job, done) {
      const file = path.join(job.dir, 'film-video.mp4');
      joiner.join(done.map(d => d.file), file);
      const segments = done.map(({file: _f, ...d}) => d);
      return {file, report: {strategy: 'segments', store: store.dir ?? store.name, reused: segments.filter(s => s.status === 'reused').length, rendered: segments.filter(s => s.status === 'rendered').length,
        ...(code ? {} : {note: 'no code fingerprint was given: a change in the drawing code is caught only by the spot check'}), segments}};
    },
    /** All of it, one segment after another (makeFilm runs the segments as a fan-out instead: pipeline.mjs). */
    async render(job) {
      const plan = this.plan(job), done = [];
      for (const seg of plan) done.push(await this.one(job, seg));
      return this.join(job, done);
    },
  };
}
