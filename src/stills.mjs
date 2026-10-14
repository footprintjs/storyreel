/**
 * Stills, for breakdown.mjs: colour frames of a video read in one FFmpeg pass and handed over as they come (so the caller
 * holds one shot's stills at a time, never the film's), and how much of a shot's stills looks like lettering — a
 * heuristic, never OCR — leaving out a logo that stays in a corner across the film's shots.
 */
import {spawn, spawnSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

/**
 * One select expression for many frames, `eq(n,k)` for each: summed as a balanced tree, so its depth grows as log₂ of
 * the count (FFmpeg refuses an expression nested more than 100 deep, which a flat sum of 100 terms is).
 */
export function selectFrames(frames) {
  const terms = frames.map(k => `eq(n\\,${k})`);
  const sum = (lo, hi) => { if (hi - lo === 1) return terms[lo]; const mid = (lo + hi) >> 1; return `(${sum(lo, mid)}+${sum(mid, hi)})`; };
  return terms.length ? sum(0, terms.length) : '0';
}

/**
 * How an FFmpeg takes a filter from a file: `-/filter:v file` from FFmpeg 7 on, `-filter_script:v file` before it (7 deprecated
 * it, and later ones dropped it). Asked once per FFmpeg; a version it cannot read (a build from source) is taken as new.
 */
const scriptOptions = new Map();
export function filterFromFile(ffmpeg) {
  if (!scriptOptions.has(ffmpeg)) {
    const major = Number(/version n?(\d+)\./.exec(spawnSync(ffmpeg, ['-version'], {encoding: 'utf8'}).stdout ?? '')?.[1]);
    scriptOptions.set(ffmpeg, Number.isFinite(major) && major < 7 ? '-filter_script:v' : '-/filter:v');
  }
  return scriptOptions.get(ffmpeg);
}

/**
 * What FFmpeg is run with to read the stills: every decoded frame passed through (no frame dropped or repeated, as
 * finished.mjs · onSlots counts them), the frames wanted selected by number (`frames`: decoded frames, footage.mjs ·
 * readFootage's source), scaled. The filter goes in a file, `script`, since a long film's selection runs past what one
 * argument may hold (131,072 bytes on Linux). Returns {args, filter}.
 */
export function stillsArgs({ffmpeg, file, frames, width, height, script}) {
  const filter = `select='${selectFrames(frames)}',scale=${width}:${height}:flags=area`;
  return {filter, args: ['-v', 'error', '-i', file, filterFromFile(ffmpeg), script, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']};
}

/**
 * Colour stills of the given decoded frames, `width` × `height`, in one FFmpeg pass (stillsArgs), each handed to
 * `each(frame, {width, height, rgb})` as it comes, in frame order. `each` may be async: the next still is read once it
 * settles. Returns how many came.
 */
export async function eachStill(ffmpeg, file, frames, {width, height}, each) {
  const want = [...new Set(frames)].sort((a, b) => a - b), size = width * height * 3;
  if (!want.length) return 0;
  const dir = mkdtempSync(path.join(tmpdir(), 'storyreel-stills-')), script = path.join(dir, 'filter.txt');
  try { return await readStills(ffmpeg, stillsArgs({ffmpeg, file, frames: want, width, height, script}), {script, want, size, width, height}, each); } finally { rmSync(dir, {recursive: true, force: true}); }
}

/** One FFmpeg pass over the stills: the filter written to its file, the frames read off the pipe and handed over. */
async function readStills(ffmpeg, {args, filter}, {script, want, size, width, height}, each) {
  writeFileSync(script, filter);
  const ff = spawn(ffmpeg, args, {stdio: ['ignore', 'pipe', 'pipe']});
  // A still is filled in place from the chunks as they come (no buffer grown chunk by chunk), and handed over whole.
  let rgb = new Uint8Array(size), filled = 0, err = '', i = 0;
  ff.stderr.on('data', b => { err += b; });
  for await (const chunk of ff.stdout) {
    for (let at = 0; at < chunk.length;) {
      const take = Math.min(size - filled, chunk.length - at);
      rgb.set(chunk.subarray(at, at + take), filled); filled += take; at += take;
      if (filled === size) { if (i < want.length) await each(want[i++], {width, height, rgb}); rgb = new Uint8Array(size); filled = 0; }
    }
  }
  const code = await new Promise(r => (ff.exitCode !== null ? r(ff.exitCode) : ff.once('close', r)));
  if (code !== 0) throw new Error(`breakdown: ${ffmpeg} could not read the stills: ${err.slice(-300)}`);
  return i;
}

/**
 * The lettering-like rows of a still — a heuristic: the still is cut into 8-pixel blocks; a block is stroke-like when sharp
 * left-right edges (a step of `edge` grey levels or more) fill between 6% and 45% of it and reach at least 3 of its rows;
 * lettering is three or more such blocks side by side. Returns {across, down, runs: [{row, from, to}]} in blocks (to
 * exclusive).
 */
export function strokeRuns(still, options) { return strokeRunsOf(still, options); }
let greyScratch = new Float32Array(0);
function strokeRunsOf({width, height, rgb}, {edge = 48, block = 8} = {}) {
  // One grey buffer, grown when a still needs more and used for every still after: a still at a time, so none is shared.
  if (greyScratch.length < width * height) greyScratch = new Float32Array(width * height);
  const grey = greyScratch;
  for (let i = 0; i < width * height; i++) grey[i] = .299 * rgb[3 * i] + .587 * rgb[3 * i + 1] + .114 * rgb[3 * i + 2];
  const across = Math.floor(width / block), down = Math.floor(height / block), runs = [];
  const strokeLike = (bx, by) => {
    let edges = 0, rows = 0;
    for (let y = by * block; y < (by + 1) * block; y++) {
      let inRow = 0;
      for (let x = bx * block; x < (bx + 1) * block && x + 1 < width; x++) if (Math.abs(grey[y * width + x + 1] - grey[y * width + x]) >= edge) inRow++;
      edges += inRow; if (inRow) rows++;
    }
    const density = edges / (block * block);
    return density >= .06 && density <= .45 && rows >= 3;
  };
  for (let by = 0; by < down; by++) {
    let from = -1;
    for (let bx = 0; bx <= across; bx++) {
      if (bx < across && strokeLike(bx, by)) { if (from < 0) from = bx; continue; }
      if (from >= 0 && bx - from >= 3) runs.push({row: by, from, to: bx});
      from = -1;
    }
  }
  return {across, down, runs};
}

/**
 * The rows of strokes that read as lines of lettering: runs touching (in the next block row, overlapping across) are one
 * shape, and a shape is lettering when it is at least twice as wide as it is tall — a line of words, or a block of
 * lines. A drawn icon, a face or a logo is about as tall as it is wide, and is left out.
 */
function lines(runs) {
  const parent = runs.map((_, i) => i), root = i => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  runs.forEach((a, i) => runs.forEach((b, j) => { if (j > i && Math.abs(a.row - b.row) <= 1 && a.from < b.to && b.from < a.to) parent[root(i)] = root(j); }));
  const shapes = new Map();
  runs.forEach((r, i) => { const k = root(i), sh = shapes.get(k) ?? {from: Infinity, to: -Infinity, top: Infinity, bottom: -Infinity, runs: []}; sh.from = Math.min(sh.from, r.from); sh.to = Math.max(sh.to, r.to); sh.top = Math.min(sh.top, r.row); sh.bottom = Math.max(sh.bottom, r.row); sh.runs.push(r); shapes.set(k, sh); });
  return [...shapes.values()].filter(sh => sh.to - sh.from >= 2 * (sh.bottom - sh.top + 1)).flatMap(sh => sh.runs);
}

/** A shot's stills read for lettering: each still's rows of strokes in lines (strokeRuns, lines). Small: kept for every shot. */
export function readLettering(stills) {
  return stills.map(st => { const r = strokeRunsOf(st); return {...r, runs: lines(r.runs)}; });
}

/** Whether a row of strokes lies inside a corner quarter of the frame (`corner` of it across and down). */
const inCorner = ({row, from, to}, {across, down}, corner) => (to <= across * corner || from >= across * (1 - corner)) && (row < down * corner || row >= down * (1 - corner));

/** The blocks of a shot's corner marks that stay put: in a corner, stroke-like in every one of its stills (two or more). */
export function cornerMarks(reads, {corner = .25} = {}) {
  if (reads.length < 2 || !reads[0].across) return new Set();
  const {across} = reads[0], seen = new Map();
  for (const r of reads) for (const run of r.runs) if (inCorner(run, r, corner)) for (let bx = run.from; bx < run.to; bx++) { const k = run.row * across + bx; seen.set(k, (seen.get(k) ?? 0) + 1); }
  return new Set([...seen].filter(([, n]) => n === reads.length).map(([k]) => k));
}

/** The shapes a set of blocks makes (blocks touching across or down), each a list of block numbers. */
function shapesOf(blocks, across) {
  const left = new Set(blocks), out = [];
  for (const start of blocks) {
    if (!left.has(start)) continue;
    const shape = [], queue = [start]; left.delete(start);
    while (queue.length) {
      const b = queue.pop(); shape.push(b);
      const col = b % across, next = [col > 0 ? b - 1 : -1, col + 1 < across ? b + 1 : -1, b - across, b + across];
      for (const c of next) if (left.has(c)) { left.delete(c); queue.push(c); }
    }
    out.push(shape.sort((x, y) => x - y));
  }
  return out;
}

/**
 * The film's candidate logos: the marks that stay put in a corner of a shot (cornerMarks), joined across shots into
 * shapes, each with what a rule reads — in how many shots it stays (`shots`), what share of the film's shots that is
 * (`share`), and whether it spans the film (`spans`: 1 when its shots are in both the first and the last third of the
 * film's time, a shot counting in the third its middle lies in — a caption that comes back after a cutaway, in shots 1
 * and 3 of 4, does not). `shots` are the shots' {start, end}.
 */
export function logoCandidates(marksByShot, shots, across) {
  if (!across) return [];
  const end = Math.max(0, ...shots.map(x => x.end)), all = [...new Set(marksByShot.flatMap(m => [...m]))];
  return shapesOf(all, across).map(blocks => {
    const inShots = marksByShot.flatMap((marks, i) => (blocks.some(b => marks.has(b)) ? [i] : []));
    const middle = i => (shots[i].start + shots[i].end) / 2, thirds = inShots.some(i => middle(i) < end / 3) && inShots.some(i => middle(i) > 2 * end / 3);
    return {kind: 'logo', at: shots[inShots[0]].start, blocks, shotsWith: inShots.map(i => i + 1),
      measures: {shots: inShots.length, share: inShots.length / shots.length, spans: thirds ? 1 : 0}};
  }).filter(c => c.measures.shots > 0);
}

/**
 * How much of a shot looks lettered — a heuristic, never OCR: the most any of its stills shows of rows of strokes in
 * lines (readLettering), leaving out a row that is mostly the film's logo (logoCandidates, decided in breakdown.mjs). Returns {area, mark}, each a share
 * of the frame: the lettering, and the logo left out.
 */
export function lettering(reads, logo = new Set()) {
  if (!reads.length || !reads[0].across || !reads[0].down) return {area: 0, mark: 0};
  const {across, down} = reads[0];
  const isLogo = run => { let hits = 0; for (let bx = run.from; bx < run.to; bx++) if (logo.has(run.row * across + bx)) hits++; return hits * 2 >= run.to - run.from; };
  let area = 0, mark = 0;
  for (const r of reads) {
    let kept = 0, left = 0;
    for (const run of r.runs) { if (isLogo(run)) left += run.to - run.from; else kept += run.to - run.from; }
    area = Math.max(area, kept / (across * down)); mark = Math.max(mark, left / (across * down));
  }
  return {area, mark};
}
