/**
 * Stills, for breakdown.mjs: colour frames of a video read in one FFmpeg pass and handed over as they come (so the caller
 * holds one shot's stills at a time, never the film's), and how much of a shot's stills looks like lettering — a
 * heuristic, never OCR.
 */
import {spawn} from 'node:child_process';

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
 * Colour stills of the given frames, `width` × `height`, in one FFmpeg pass: the video resampled to `rate` frames a
 * second (as footage.mjs · readFootage reads it, so frame k is the same frame in both), the frames selected by number,
 * and each handed to `each(frame, {width, height, rgb})` as it comes, in frame order. `each` may be async: the next
 * still is read once it settles. Returns how many came.
 */
export async function eachStill(ffmpeg, file, frames, {width, height, rate}, each) {
  const want = [...new Set(frames)].sort((a, b) => a - b), size = width * height * 3;
  if (!want.length) return 0;
  const vf = `fps=${rate},select='${selectFrames(want)}',scale=${width}:${height}:flags=area`;
  const ff = spawn(ffmpeg, ['-v', 'error', '-i', file, '-vf', vf, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], {stdio: ['ignore', 'pipe', 'pipe']});
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
let greyScratch = new Float32Array(0);
export function strokeRuns({width, height, rgb}, {edge = 48, block = 8} = {}) {
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

/**
 * How much of a shot looks lettered — a heuristic, never OCR: the most any of its stills shows of rows of strokes in
 * lines (strokeRuns, lines), leaving out a mark that stays put in a corner (a channel's logo, a watermark): a row of strokes inside a corner quarter of the
 * frame whose blocks are stroke-like in every still (two stills or more). Returns {area, mark}, each a share of the frame:
 * the lettering, and the corner mark left out.
 */
export function lettering(stills, {corner = .25} = {}) {
  const read = stills.map(s => { const r = strokeRuns(s); return {...r, runs: lines(r.runs)}; });
  if (!read.length || !read[0].across || !read[0].down) return {area: 0, mark: 0};
  const {across, down} = read[0], seen = new Uint16Array(across * down);
  for (const r of read) for (const run of r.runs) for (let bx = run.from; bx < run.to; bx++) seen[run.row * across + bx]++;
  const inCorner = run => (run.to <= across * corner || run.from >= across * (1 - corner)) && (run.row < down * corner || run.row >= down * (1 - corner));
  const stays = run => { let fixed = 0; for (let bx = run.from; bx < run.to; bx++) if (seen[run.row * across + bx] === read.length) fixed++; return fixed * 2 >= run.to - run.from; };
  let area = 0, mark = 0;
  for (const r of read) {
    let kept = 0, left = 0;
    for (const run of r.runs) { if (read.length >= 2 && inCorner(run) && stays(run)) left += run.to - run.from; else kept += run.to - run.from; }
    area = Math.max(area, kept / (across * down)); mark = Math.max(mark, left / (across * down));
  }
  return {area, mark};
}
