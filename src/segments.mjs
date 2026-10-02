/**
 * Re-render only what changed. A film's picture is made in segments — one per row of pictures
 * (film.rows: a shot, from the moment its entrance starts) — and each segment is kept in a cache under a
 * key built from what draws it: the recipe entries of its rows (and of the row an entrance also draws),
 * the guess cards over it, every line they resolved, the words spoken in and around it, the director's
 * notes over it, what reaches every frame (the strings, the data, the theme, every file the film read:
 * film.inputs), the frame settings and the drawing code. When something changes, only the segments whose
 * key changed are drawn again; the rest are reused, and all of them are joined into one video. The sound is
 * never cached: it is mixed for the whole film each time (render.mjs · finishRender), which is quick and
 * keeps it seamless.
 *
 * Three seams, so each part can be swapped (the strategy, and the two adapters it uses):
 *   - a strategy makes the picture: wholeVideo() (render.mjs; every frame in one pass) or segmentedVideo();
 *   - a store keeps segments between renders: folderStore(dir) keeps each as <key>.mp4 + <key>.json;
 *   - a joiner joins segment files: ffmpegJoin() (FFmpeg's concat demuxer, no re-encode: every segment is
 *     encoded with the same settings, each starting on a key frame).
 *
 * A key is on the segment's own clock, so a segment can keep it when only an earlier scene grows. But a key
 * is only as good as what it lists, so a reused segment must also pass a spot check: a few of its frames are
 * painted again exactly as the video shows them (the job's painter: layout, motion blur, stamp) at the same
 * places in the segment, and must match the ones kept when it was drawn. A segment that moved is reused only
 * when its frames did not move with the film's clock — a kit that animates on it (the cartoon's drifting
 * clouds) makes it draw again — and a key whose frames still changed is drawn again, saying so.
 */
import {readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, copyFileSync, readdirSync, statSync, rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {frameHashes} from './pins.mjs';
import {stableJson} from './hash.mjs';
import {installedVersion, DRAWING} from './versions.mjs';

export {wholeVideo} from './render.mjs';

/** The extensions a code fingerprint reads: code, data, images and fonts. */
export const CODE_EXTENSIONS = Object.freeze(['.mjs', '.js', '.cjs', '.ts', '.mts', '.cts', '.tsx', '.jsx', '.json', '.ttf', '.otf', '.woff', '.woff2', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

/** Every file under the given folders (or the files themselves), hashed in path order: a fingerprint of drawing code. */
export function codeFingerprint(paths, {extensions = CODE_EXTENSIONS} = {}) {
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

/**
 * Code per segment, for a kit that draws many shots: `sources(entry)` names the files that draw a recipe entry (its
 * shot's module, say), and a segment's code is the fingerprint of the files its own entries name, everything they
 * import (relative imports followed; a package by its installed version) and the `shared` files (hashed as they
 * are, their imports not followed: a kit's index imports every shot). Editing one shot then draws again only the
 * segments that show it; the rest are reused. Give the result to segmentedVideo as `code`.
 */
export function sourceCode(sources, {shared = []} = {}) {
  if (typeof sources !== 'function') throw new Error("sourceCode: sources(entry) names the files that draw a recipe entry (e.g. its shot's module)");
  if (!Array.isArray(shared)) throw new Error('sourceCode: shared is a list of files every segment depends on');
  const known = new Map();   // file → {hash, files, packages}: a file's own bytes and what it imports, read once
  const read = file => {
    if (known.has(file)) return known.get(file);
    if (!existsSync(file)) throw new Error(`sourceCode: ${file} does not exist (named by sources or imported)`);
    const bytes = readFileSync(file), files = [], packages = [];
    if (/\.(mjs|js|cjs)$/.test(file)) for (const m of bytes.toString('utf8').matchAll(IMPORTS)) {
      const r = resolveImport(m[1] ?? m[2], file);
      if (r?.file) files.push(r.file); else if (r?.pkg) packages.push(r.pkg);
    }
    const entry = {hash: createHash('sha256').update(bytes).digest('hex'), files, packages};
    known.set(file, entry); return entry;
  };
  const name = f => `${path.basename(path.dirname(f))}/${path.basename(f)}`;
  return entries => {
    const files = new Map(), packages = new Set();
    const follow = f => { if (files.has(f)) return; const e = read(f); files.set(f, e.hash); e.packages.forEach(p => packages.add(p)); e.files.forEach(follow); };
    for (const e of entries) for (const f of sources(e) ?? []) follow(path.resolve(f));
    for (const f of shared) { const p = path.resolve(f); files.set(p, read(p).hash); }
    const h = createHash('sha256');
    for (const f of [...files.keys()].sort()) h.update(name(f)).update('\0').update(files.get(f)).update('\0');
    for (const p of [...packages].sort()) h.update(p).update('\0');
    return h.digest('hex').slice(0, 24);
  };
}
// import … from '…', export … from '…', import '…', import('…'): what a module reads its code from.
const IMPORTS = /(?:^|[^\w$.])(?:import|export)\s*(?:[\w$*{}\s,]+from\s*)?['"]([^'"\n]+)['"]|(?:^|[^\w$.])import\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g;
function resolveImport(spec, from) {
  if (spec.startsWith('node:')) return null;
  if (spec.startsWith('.') || spec.startsWith('/')) {
    const base = path.resolve(path.dirname(from), spec);
    const file = [base, `${base}.mjs`, `${base}.js`, path.join(base, 'index.mjs'), path.join(base, 'index.js')].find(f => existsSync(f) && statSync(f).isFile());
    if (!file) throw new Error(`sourceCode: ${from} imports ${spec}, which does not exist`);
    return {file};
  }
  const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
  for (let dir = path.dirname(from); ; dir = path.dirname(dir)) {
    const manifest = path.join(dir, 'node_modules', pkg, 'package.json');
    if (existsSync(manifest)) return {pkg: `${pkg}@${JSON.parse(readFileSync(manifest, 'utf8')).version ?? '?'}`};
    if (path.dirname(dir) === dir) return {pkg: `${pkg}@?`};   // a built-in module, or not installed beside the code
  }
}

/** StoryReel's own drawing code, its fonts, and the installed versions of what it draws with: part of every key. */
let ownCode = null;
const storyreelCode = () => ownCode ??= `${codeFingerprint(['./', '../fonts/'].map(p => fileURLToPath(new URL(p, import.meta.url))).filter(existsSync))}+${DRAWING.map(n => `${n}@${installedVersion(n)}`).join(',')}`;

/**
 * The film's segments: one per row of pictures (film.rows), on whole frames — segment i covers frames
 * [f0, f1), each frame exactly once, in order — so joined they draw exactly the frames one pass would. A row
 * whose picture starts before the row ahead of it (an entrance longer than the scene before) takes over from
 * that row, which never shows alone: its entries join the next segment. A row shorter than `minSeconds`
 * joins the segment before it (a segment per quick cut would cost more in joins than it saves).
 * @param blur  true when frames are drawn with motion blur: a frame just after a cut then also draws a
 *              moment before it, so a segment that starts at a cut draws the row before it too
 * @returns [{index, f0, f1, from, to, paths, before, scenes}] — before: the paths of the row an entrance
 *          (or a blurred cut) also draws, or null
 */
export function planSegments(film, {fps = 30, frames = Math.ceil(film.total * fps), minSeconds = 1.5, blur = false} = {}) {
  if (!Array.isArray(film.rows) || !film.rows.length) throw new Error('planSegments: this film has no rows (compile it with StoryReel 0.4 or later)');
  let latest = 0;
  const raw = film.rows.map((r, j) => {
    // A row's first frame is the first one at or after its picture starts (an earlier one still shows the row before).
    latest = j === 0 ? 0 : Math.max(latest, Math.min(frames, Math.max(0, Math.ceil(r.from * fps - 1e-6))));
    return {f0: latest, paths: [...r.paths], before: r.enter && (r.enter.type !== 'cut' || blur) ? [...film.rows[j - 1].paths] : null, rewinds: r.rewinds ?? null};
  });
  raw.forEach((s, j) => { s.f1 = j + 1 < raw.length ? raw[j + 1].f0 : frames; });
  // A row that never shows alone (no frames of its own) is drawn by the next one: its entries join it.
  const shown = [];
  let carried = [];
  for (const s of raw) {
    if (s.f1 > s.f0) { s.paths.unshift(...carried); carried = []; shown.push(s); }
    else carried.push(...s.paths, ...(s.before ?? []));
  }
  if (carried.length && shown.length) shown.at(-1).paths.push(...carried);
  const out = [];
  for (const s of shown) {
    const last = out.at(-1);
    if (last && (s.f1 - s.f0) < minSeconds * fps) { last.f1 = s.f1; last.paths.push(...s.paths); last.rewinds ??= s.rewinds; continue; }
    if (last && (last.f1 - last.f0) < minSeconds * fps) { last.f1 = s.f1; last.paths.push(...s.paths); last.before ??= s.before; last.rewinds ??= s.rewinds; continue; }
    out.push({...s});
  }
  if (out[0]?.f0 !== 0 || out.at(-1)?.f1 !== frames || out.some((s, i) => s.f1 <= s.f0 || (i && s.f0 !== out[i - 1].f1))) throw new Error(`planSegments: the segments do not cover frames 0–${frames} once each, in order (${out.map(s => `${s.f0}–${s.f1}`).join(', ')}); this is a bug in planning, please report it`);
  const offsets = film.clock.offsets, ids = film.timings.scenes.map(s => s.id), durations = film.timings.scenes.map(s => s.duration);
  return out.map((s, index) => {
    const from = s.f0 / fps, to = s.f1 / fps;
    const scenes = ids.filter((_, i) => offsets[i] < to && offsets[i] + durations[i] > from);
    return Object.freeze({index, f0: s.f0, f1: s.f1, from, to, paths: Object.freeze([...new Set(s.paths)]), before: s.before && Object.freeze([...new Set(s.before)]), scenes: Object.freeze(scenes), ...(s.rewinds ? {rewinds: s.rewinds} : {})});
  });
}

/** The recipe entry at a path ('story', 'whiteboard', 'pushIn', 'card', 'stages[3]', 'guesses[0]'). */
const entryAt = (recipe, p) => { const m = p.match(/^(stages|guesses)\[(\d+)\]$/); return m ? recipe[m[1]]?.[+m[2]] : recipe[p]; };
const round = n => +n.toFixed(4);
const inside = (p, paths) => paths.some(q => p === q || p.startsWith(`${q}.`));

/**
 * What draws a segment, on its own clock (seconds from its first frame), so a segment whose shot did not
 * change keeps its key when an earlier scene grows or shrinks by whole frames: the recipe entries of its rows
 * (and of the row an entrance also draws) and of the guess cards over it, every line they resolved, the words
 * spoken in and around it (captions and mouths), the director's notes over it, what reaches every frame (the
 * strings, the data, the theme, every file the film read: film.inputs), the frame settings, and the code.
 */
export function segmentMaterial(film, seg, {recipe, storyboard = null, pixels, code = null, fps = 30, margin = 3}) {
  // The times it draws: its own, and the moments a teaser in it replays (with their guess cards, pushes and words).
  const spans = [[seg.from, seg.to], ...(seg.rewinds ? [[seg.rewinds.from, seg.rewinds.to]] : [])], over = (a, b) => spans.some(([f, t]) => a < t && b > f);
  const overlays = (film.overlays ?? []).filter(o => over(o.from, o.to)).map(o => o.path);
  const paths = [...seg.paths, ...(seg.before ?? []), ...overlays], at = t => round(t - seg.from);
  const scenes = film.timings.scenes.map((sc, i) => ({sc, start: film.clock.offsets[i]}))
    .filter(({sc, start}) => over(start - margin, start + sc.duration + margin))
    .map(({sc, start}) => {
      const board = storyboard?.scenes?.find(b => b.id === sc.id);
      return {id: sc.id, start: at(start), duration: round(sc.duration), words: (sc.words ?? []).map(w => [w.text, at(start + w.start), at(start + w.end), ...(w.speaker ? [w.speaker] : [])]),
        ...(board ? {said: board.narration ?? board.silent ?? null, say: board.say ?? null, speaker: board.speaker ?? null} : {})};
    });
  const near = t => spans.some(([f, to]) => t >= f - margin && t <= to + margin);
  const {strings = null, data = null, theme = null, files = {}} = film.inputs ?? {};
  return {
    v: 2, storyreel: storyreelCode(), code: typeof code === 'function' ? code(paths.map(p => entryAt(recipe, p)).filter(Boolean)) : code, frames: seg.f1 - seg.f0, fps,
    pixels: {...pixels, poster: seg.index === 0 && pixels.poster !== null ? 'drawn' : null},
    entries: paths.map(p => [p, entryAt(recipe, p) ?? null]),
    lines: film.beats.filter(b => b.path && (inside(b.path, paths) || (b.path.startsWith('guesses') && near(b.t)))).map(b => [b.path, at(b.t)]),
    // A camera speed is the whole film's; a push or a cut counts where it happens.
    notes: (film.notes ?? []).filter(n => n.speed !== undefined || (n.push ? over(n.from, n.to) : near(n.at ?? -Infinity)))
      .map(n => ({...n, ...(n.from === undefined ? {} : {from: at(n.from)}), ...(n.to === undefined ? {} : {to: at(n.to)}), ...(n.at === undefined ? {} : {at: at(n.at)})})),
    scenes, inputs: {strings, data, theme, files},
  };
}

/** Whether a segment's entries draw the film's recalls (a recap's frames, a summary's or hero's picture, a teaser). */
const drawsRecalls = material => material.entries.some(([, entry]) => entry && JSON.stringify(entry).includes('"recall"'));

/** A segment's cache key: its material (segmentMaterial), hashed; the poster rides on the first, the recalls on those that draw them. */
export function segmentKey(film, seg, options) {
  const extra = options.extra ?? {}, material = segmentMaterial(film, seg, options);
  return createHash('sha256').update(stableJson({material, ...(seg.index === 0 ? {poster: extra.poster ?? null} : {}), ...(drawsRecalls(material) ? {recalls: extra.recalls ?? null} : {})})).digest('hex').slice(0, 24);
}

/**
 * Where in a segment it is spot-checked: `count` frame offsets spread over it, first and last included — and
 * two more inside a teaser's rewind when the segment plays one (a stretch of replayed moments the spread may miss).
 */
export function sampleOffsets(seg, count = 6, fps = 30) {
  const n = seg.f1 - seg.f0, k = Math.min(count, n);
  const spread = Array.from({length: k}, (_, i) => Math.round(i * (n - 1) / Math.max(1, k - 1)));
  const rewind = seg.rewinds && count ? [1 / 3, 2 / 3].map(u => Math.round((seg.rewinds.at + (seg.rewinds.until - seg.rewinds.at) * u) * fps) - seg.f0).filter(o => o >= 0 && o < n) : [];
  return [...new Set([...spread, ...rewind])].sort((a, b) => a - b);
}

/**
 * Keep segments as files in one folder: <key>.mp4 and <key>.json (the manifest). The default store. A
 * segment lands whole or not at all: its file arrives under a temporary name in the folder and is renamed
 * into place, and its manifest — written last — records the file's size, so a file cut short is never reused.
 */
export function folderStore(dir) {
  if (typeof dir !== 'string' || !dir) throw new Error('folderStore: give the folder the segments are kept in');
  const at = key => ({file: path.join(dir, `${key}.mp4`), json: path.join(dir, `${key}.json`)});
  let landing = 0;
  return {
    name: 'folder', dir: path.resolve(dir),
    get(key) {
      const {file, json} = at(key);
      if (!existsSync(file) || !existsSync(json)) return null;
      try {
        const manifest = JSON.parse(readFileSync(json, 'utf8'));
        return manifest.bytes === statSync(file).size ? {file, manifest} : null;
      } catch { return null; }
    },
    put(key, file, manifest) {
      mkdirSync(dir, {recursive: true});
      const to = at(key), part = path.join(dir, `.${key}.${process.pid}.${++landing}.part`);
      rmSync(to.json, {force: true});
      try { renameSync(file, part); } catch { copyFileSync(file, part); rmSync(file, {force: true}); }
      const bytes = statSync(part).size;
      renameSync(part, to.file);
      writeFileSync(to.json, JSON.stringify({...manifest, bytes}, null, 2));
      return to.file;
    },
  };
}

/** Join segment files into one video without re-encoding (FFmpeg's concat demuxer). The default joiner, run with the render's FFmpeg. */
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

/** The manifest version: what a kept segment's spot check reads (samples by frame offset in the segment). */
const MANIFEST = 2;

/**
 * The segmented strategy: plan the segments, reuse each one whose key and spot check match, draw the
 * rest, and join them. `force` names segments to draw again whatever their key says (a segment index, or
 * a scene id it covers) — for when you want to see a part fresh.
 * @param store    where segments are kept (folderStore(dir)) — required
 * @param recipe   the film's recipe (each segment's entries are part of its key) — required
 * @param code     a fingerprint of the drawing code outside StoryReel (codeFingerprint([kitsFolder])), or code per
 *                 segment (sourceCode(sources): a segment keyed by the code of its own shots, so an edit to one shot
 *                 draws only its segments again); without it a kit change is caught only by the spot check, and the
 *                 report says so
 * @param joiner   how segment files are joined (default: ffmpegJoin with the render's FFmpeg)
 * @param samples  how many frames of a reused segment are painted again to check it (6; 0 turns the check off)
 * @param parallel how many segments are drawn at once (2)
 */
export function segmentedVideo({store, recipe, code = null, joiner = null, force = [], samples = 6, minSeconds = 1.5, parallel = 2} = {}) {
  if (!store || typeof store.get !== 'function' || typeof store.put !== 'function') throw new Error('segmentedVideo: give a store (folderStore(dir)) to keep the segments in');
  if (!recipe || typeof recipe !== 'object') throw new Error('segmentedVideo: give the recipe (every segment\'s entries are part of its key)');
  if (!Array.isArray(force)) throw new Error('segmentedVideo: force is a list of segment indexes or scene ids');
  if (!(Number.isInteger(parallel) && parallel >= 1 && parallel <= 16)) throw new Error('segmentedVideo: parallel is how many segments are drawn at once, a whole number 1–16');
  if (!(Number.isInteger(samples) && samples >= 0 && samples <= 60)) throw new Error('segmentedVideo: samples is how many frames of a kept segment are checked, a whole number 0–60');
  // At most `parallel` segments drawn at once, however many the caller starts (a fan-out starts them all);
  // once one fails, the others stop before drawing any more (a failed render keeps nothing half made).
  let running = 0, failed = null, made = 0; const waiting = [];
  const slot = async () => { if (running >= parallel) await new Promise(r => waiting.push(r)); running++; };
  const free = () => { running--; waiting.shift()?.(); };
  const stopIfFailed = seg => { if (failed) throw new Error(`segment ${seg.index} was not drawn: segment ${failed.index} failed (${failed.message})`); };
  return {
    name: 'segments',
    /** The segments, each with its key. */
    plan(job) {
      if (job.withIntro) throw new Error('segmentedVideo: an intro is not kept in segments; render it with wholeVideo(), or leave the intro out');
      if (job.start !== 0 || job.to < job.film.total - 1e-6) throw new Error('segmentedVideo: segments cover the whole film; render a part (from, to) with wholeVideo()');
      failed = null;
      const {film} = job, recallTimes = [...new Set(film.beats.filter(b => b.path?.startsWith('recalls')).map(b => b.t))];
      const extra = {poster: job.poster === null || job.posterFrame === false ? null : frameHashes(film, {times: [+job.poster.toFixed(3)], width: 192}),
        recalls: recallTimes.length ? frameHashes(film, {times: recallTimes, width: 192}) : null};
      return planSegments(film, {fps: job.fps, frames: job.frames, minSeconds, blur: Boolean(job.blur)}).map(seg => ({
        ...seg, key: segmentKey(film, seg, {recipe, storyboard: job.storyboard, pixels: job.pixels, code, fps: job.fps, extra}),
        forced: force.some(f => f === seg.index || seg.scenes.includes(f)),
      }));
    },
    /** One segment: reused when its key and its spot check match, drawn again otherwise. */
    async one(job, seg) {
      stopIfFailed(seg);
      const report = {index: seg.index, from: round(seg.from), to: round(seg.to), frames: seg.f1 - seg.f0, scenes: [...seg.scenes], key: seg.key};
      const hash = job.frameHasher(), hashesAt = offsets => Object.fromEntries(offsets.map(o => [o, hash(seg.f0 + o, {poster: seg.index === 0 && o === 0})]));
      const kept = seg.forced ? null : store.get(seg.key);
      let why = seg.forced ? 'forced' : 'new or changed';
      if (kept) {
        const m = kept.manifest, offsets = Object.keys(m.samples ?? {}).map(Number);
        const comparable = m.v === MANIFEST && m.frames === seg.f1 - seg.f0;
        const same = comparable && (samples === 0 || (offsets.length > 0 && Object.entries(hashesAt(offsets)).every(([o, h]) => m.samples[o] === h)));
        if (same) return {...report, status: 'reused', file: kept.file};
        why = !comparable ? 'kept by an older StoryReel (drawn again)'
          : Math.abs((m.from ?? seg.from) - seg.from) > 1e-6 ? 'it moved, and its frames moved with the film\'s clock (drawn again)'
          : 'its frames changed though its key did not (the key missed something: drawn again)';
      }
      await slot();
      try {
        stopIfFailed(seg);
        const tmp = path.join(job.dir, `segment-${seg.index}-${seg.key}-${process.pid}-${++made}.mp4`);
        await job.encodeFrames({f0: seg.f0, f1: seg.f1, file: tmp, posterFirst: seg.index === 0});
        const file = store.put(seg.key, tmp, {v: MANIFEST, key: seg.key, index: seg.index, from: round(seg.from), frames: seg.f1 - seg.f0, scenes: seg.scenes,
          samples: samples ? hashesAt(sampleOffsets(seg, samples, job.fps)) : {}, made: new Date().toISOString()});
        return {...report, status: 'rendered', why, file};
      } catch (e) {
        failed ??= {index: seg.index, message: e.message};
        throw e;
      } finally { free(); }
    },
    /** Join the segments, in order, into the film's picture. */
    join(job, done) {
      const file = path.join(job.dir, 'film-video.mp4');
      (joiner ?? ffmpegJoin({ffmpeg: job.ffmpeg})).join(done.map(d => d.file), file);
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
