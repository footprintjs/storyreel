/**
 * Footage: a video read as numbers, for breakdown.mjs. Every frame is read once, small and grey (finished.mjs ·
 * ffmpegProbe's frames), and kept only as the few measures the breakdown asks of it: how much it changed from the frame
 * before (over the whole picture and in each cell of a coarse grid), how spread its grey levels are (one colour, or a
 * picture), a thumbnail to compare frames far apart, and its row and column means (projections), from which a shift of
 * the whole picture is found. On those: the candidates for a cut or a gradual change, each with the measures a rule
 * reads; a shot's motion; text-like strokes in a still; and colour stills, read in one more pass.
 *
 * Grey levels are a video's (limited range, 16–235): differences and spreads are scaled to 0–255 (VIDEO), as
 * finished.mjs scales them.
 */
import {spawn} from 'node:child_process';

const VIDEO = 255 / 219;
/** The coarse grid where motion is measured: 6 cells across, 4 down. */
export const GRID = Object.freeze({cols: 6, rows: 4});
/** The thumbnail kept of every frame: 32 cells across (and as many down as the picture's shape gives). */
const THUMB = 32;

const round = (v, digits = 2) => +v.toFixed(digits);
const median = list => { if (!list.length) return 0; const s = [...list].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const percentile = (list, p) => { if (!list.length) return 0; const s = [...list].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

// ── Reading every frame ────────────────────────────────────────────────────────────────────────────────────

/** Which thumbnail cell, and which grid cell, each pixel falls in; and how many pixels each cell holds. */
function layoutOf(W, H) {
  const TH = Math.max(2, Math.round(THUMB * H / W)), cells = (across, down) => {
    const of = new Int32Array(W * H), count = new Float32Array(across * down);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = Math.floor(y * down / H) * across + Math.floor(x * across / W); of[y * W + x] = c; count[c]++; }
    return {of, count};
  };
  return {TW: THUMB, TH, thumb: cells(THUMB, TH), grid: cells(GRID.cols, GRID.rows)};
}

/** One frame's own measures: its mean and spread, its thumbnail and its projections. */
function measureFrame(f, grey) {
  const {W, H, layout} = f, thumb = new Float32Array(layout.TW * layout.TH), cols = new Float32Array(W), rows = new Float32Array(H);
  let sum = 0, squares = 0;
  for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
    const v = grey[i]; sum += v; squares += v * v; cols[x] += v; rows[y] += v; thumb[layout.thumb.of[i]] += v;
  }
  const N = W * H, mean = sum / N;
  for (let x = 0; x < W; x++) cols[x] /= H;
  for (let y = 0; y < H; y++) rows[y] /= W;
  for (let c = 0; c < thumb.length; c++) thumb[c] /= layout.thumb.count[c];
  f.spread.push(Math.sqrt(Math.max(0, squares / N - mean * mean)) * VIDEO);
  f.thumbs.push(thumb); f.cols.push(cols); f.rows.push(rows);
}

/** How a frame changed from the one before: overall, in each grid cell, and how much of the frame changed at once. */
function compareFrames(f, before, grey) {
  const {layout} = f, cells = new Float32Array(GRID.cols * GRID.rows);
  let sum = 0;
  for (let i = 0; i < grey.length; i++) { const dv = Math.abs(grey[i] - before[i]); sum += dv; cells[layout.grid.of[i]] += dv; }
  for (let c = 0; c < cells.length; c++) cells[c] = cells[c] / layout.grid.count[c] * VIDEO;
  const most = Math.max(...cells), floor = Math.max(1, .25 * most);
  f.d.push(sum / grey.length * VIDEO); f.cells.push(cells);
  f.share.push(most < 1 ? 0 : cells.filter(v => v >= floor).length / cells.length);
}

/**
 * Read every frame of the file once (the probe's frames, `width` pixels wide) into the measures the breakdown keeps:
 * d[k] (the change from frame k-1 to k, 0–255), spread[k] (one colour under about 1.5), share[k] (how much of the grid changed at once),
 * cells[k] (the change in each grid cell), thumbs[k], cols[k] and rows[k]. Frame k is at k / fps.
 */
export async function readFootage(probe, file, meta, {width = 160} = {}) {
  const W = width, H = Math.max(2, 2 * Math.round(width * meta.video.height / meta.video.width / 2));
  const f = {fps: meta.video.fps, W, H, layout: layoutOf(W, H), n: 0, d: [0], share: [0], cells: [new Float32Array(GRID.cols * GRID.rows)], spread: [], thumbs: [], cols: [], rows: []};
  let before = null;
  f.n = await probe.frames(file, {width: W, height: H}, (_, grey) => {
    measureFrame(f, grey);
    if (before) compareFrames(f, before, grey);
    before = grey;
  });
  if (!f.n) throw new Error(`breakdown: no frames could be read from ${file}`);
  f.steps = stepsOf(f);
  return f;
}

// ── Comparing frames ───────────────────────────────────────────────────────────────────────────────────────

/** How different two frames are, on their thumbnails (0–255). */
export function thumbDiff(f, i, j) {
  const a = f.thumbs[i], b = f.thumbs[j];
  let s = 0; for (let c = 0; c < a.length; c++) s += Math.abs(a[c] - b[c]);
  return s / a.length * VIDEO;
}
/** Running sums of the thumbnail change from frame to frame: the path the picture travels from frame a to frame b. */
function stepsOf(f) {
  const sums = new Float64Array(f.n);
  for (let k = 1; k < f.n; k++) sums[k] = sums[k - 1] + thumbDiff(f, k - 1, k);
  return sums;
}
const pathBetween = (f, a, b) => f.steps[b] - f.steps[a];
/** How far frame m is from the even mix of frames a and b, as a share of how far a is from b (0: m is the mix). */
function mixError(f, a, m, b, change) {
  const A = f.thumbs[a], B = f.thumbs[b], M = f.thumbs[m];
  let s = 0; for (let c = 0; c < M.length; c++) s += Math.abs(M[c] - (A[c] + B[c]) / 2);
  return s / M.length * VIDEO / Math.max(change, 1e-6);
}

/**
 * How far q is p moved along its length (q[x] ≈ p[x − shift]), to a fraction of a sample (a parabola through the
 * best whole shift and its neighbours), and how much of the difference that move explains (0..1).
 */
export function shiftOf(p, q) {
  const n = p.length, reach = Math.max(1, Math.floor(n / 4));
  const cost = s => { let t = 0, k = 0; for (let x = Math.max(0, s); x < Math.min(n, n + s); x++) { t += Math.abs(q[x] - p[x - s]); k++; } return k ? t / k : Infinity; };
  const costs = new Map();
  for (let s = -reach; s <= reach; s++) costs.set(s, cost(s));
  let best = 0;
  for (const [s, c] of costs) if (c < costs.get(best) - 1e-9) best = s;
  const still = costs.get(0), least = costs.get(best);
  let shift = best;
  if (Math.abs(best) < reach) { const l = costs.get(best - 1), r = costs.get(best + 1), bend = l - 2 * least + r; if (bend > 1e-9) shift = best + .5 * (l - r) / bend; }
  return {shift, explained: still > 1e-6 ? Math.max(0, 1 - least / still) : 0, change: still};
}

/** How the whole picture moved from frame a to frame b (pixels at the read width), and how much of the change that move explains. */
export function moveBetween(f, a, b) {
  const x = shiftOf(f.cols[a], f.cols[b]), y = shiftOf(f.rows[a], f.rows[b]), change = x.change + y.change;
  return {dx: x.shift, dy: y.shift, explained: change > 1e-6 ? (x.change * x.explained + y.change * y.explained) / change : 0, change};
}

// ── Candidates for a cut ───────────────────────────────────────────────────────────────────────────────────

/**
 * How much of a one-frame change lasts: the frame after it against the frame before it (a cut: about 1; a flash, the
 * picture back as it was: near 0). Both ways round, since the flash frame may be either side of the biggest change:
 * `frame` is the one that would be the flash (k, or k − 1 when the change into k is the flash ending).
 */
function lasting(f, k) {
  const after = k + 1 < f.n ? thumbDiff(f, k - 1, k + 1) / Math.max(thumbDiff(f, k - 1, k), 1) : Infinity;
  const before = k >= 2 ? thumbDiff(f, k - 2, k) / Math.max(thumbDiff(f, k - 2, k - 1), 1) : Infinity;
  const least = Math.min(after, before);
  return {value: Number.isFinite(least) ? least : 1, frame: before < after ? k - 1 : k};
}

/**
 * Every frame whose change is a peak at least half a cut's (`cutJump`, `cutRatio`), with what a rule reads: `jump` (its
 * change, 0–255), `around` (the median change of the frames around it), `ratio` (jump over around, around taken as
 * at least 1) and `lasting`; and `flashFrame`, the frame that would be a flash. Near misses are candidates too, so the
 * record says why each was not a cut.
 */
export function cutCandidates(f, {cutJump, cutRatio}) {
  const out = [], reach = Math.max(3, Math.round(f.fps / 3));
  for (let k = 1; k < f.n; k++) {
    const jump = f.d[k];
    if (!(jump >= f.d[k - 1] && jump > (f.d[k + 1] ?? -Infinity)) || jump < cutJump / 2) continue;
    const near = [];
    for (let j = Math.max(1, k - reach); j <= Math.min(f.n - 1, k + reach); j++) if (Math.abs(j - k) > 1) near.push(f.d[j]);
    const around = median(near), ratio = jump / Math.max(around, 1);
    if (ratio < cutRatio / 2) continue;
    const last = lasting(f, k);
    out.push({kind: 'cut', at: round(k / f.fps, 3), frames: [k - 1, k], flashFrame: last.frame, measures: {jump: round(jump, 1), around: round(around, 1), ratio: round(ratio, 1), lasting: round(last.value)}});
  }
  return out;
}

// ── Candidates for a gradual change ────────────────────────────────────────────────────────────────────────

/**
 * The stretches where the picture keeps changing: frames whose change reaches `floor`, allowing one quiet frame inside;
 * a break (a cut or a flash) ends one. Each is [a, b]: a, the frame before its first change; b, the last frame that
 * changed. Two stretches are one across a hold of one colour no longer than `hold` frames (the black of a dip).
 */
function changingStretches(f, breaks, floor, blank, hold) {
  const out = []; let first = -1, last = -1, quiet = 0;
  const close = () => { if (first >= 0) out.push([first - 1, last]); first = -1; quiet = 0; };
  for (let k = 1; k < f.n; k++) {
    if (breaks.has(k)) { close(); continue; }
    if (f.d[k] >= floor) { if (first < 0) first = k; last = k; quiet = 0; } else if (first >= 0 && ++quiet > 1) close();
  }
  close();
  return joinHolds(f, out, {breaks, blank, hold});
}

/** Stretches joined across a hold: the first ends on one colour, every frame to the second is that colour, and nothing breaks in between. */
function joinHolds(f, stretches, {breaks, blank, hold}) {
  const out = [];
  const held = (from, to) => { for (let k = from; k <= to; k++) if (f.spread[k] >= blank || (k > from && breaks.has(k))) return false; return true; };
  for (const s of stretches) {
    const before = out.at(-1);
    if (before && s[0] - before[1] <= hold && held(before[1], s[0])) before[1] = s[1]; else out.push([...s]);
  }
  return out;
}

/** The runs of one-colour frames (spread under `blank`) inside [a, b]. */
function blankRuns(f, [a, b], blank) {
  const out = []; let p = -1;
  for (let k = a; k <= b + 1; k++) {
    const isBlank = k <= b && f.spread[k] < blank;
    if (isBlank && p < 0) p = k;
    if (!isBlank && p >= 0) { out.push([p, k - 1]); p = -1; }
  }
  return out;
}

/**
 * The fade around a run of one colour: back while the frames before it had more spread (fading out), on while the frames
 * after it gain spread (fading in). Null when neither side fades — a run of one colour that is the picture itself (a
 * colour card, or a dissolve between two of them) is no fade.
 */
function fadeSpan(f, [a, b], [p, q]) {
  let s = p; while (s > a && f.spread[s - 1] >= f.spread[s] + .25) s--;
  let e = q; while (e < b && f.spread[e + 1] >= f.spread[e] + .25) e++;
  return s < p || e > q ? {span: [s, e], middle: (p + q) / 2} : null;
}

/**
 * What a rule reads of a gradual change from frame a to frame b: how far the picture goes (`change`, 0–255), how
 * straight (`coherence`: that change over the path frame by frame, 1 for a mix that only moves one way), whether its
 * middle frame is the even mix of its ends (`mix`: 0 when it is), how much a shift of the whole picture explains
 * (`moved`), how long it takes (`seconds`), and the spread of its first, least and last frames (one colour: a fade).
 * Its time (`at`) is its middle, or the given frame (the middle of a fade's hold).
 */
function gradualMeasures(f, [a, b], middle = (a + b) / 2) {
  const mid = Math.round((a + b) / 2), change = thumbDiff(f, a, b);
  let least = Infinity; for (let k = a; k <= b; k++) least = Math.min(least, f.spread[k]);
  return {kind: 'gradual', at: round(middle / f.fps, 3), frames: [a, b],
    measures: {change: round(change, 1), coherence: round(change / Math.max(pathBetween(f, a, b), 1e-6)), mix: round(mixError(f, a, mid, b, change)), moved: round(moveBetween(f, a, b).explained),
      seconds: round((b - a) / f.fps, 3), startSpread: round(f.spread[a], 1), leastSpread: round(least, 1), endSpread: round(f.spread[b], 1)}};
}

/** Close enough to a dissolve to be decided: a little looser than the rules, so near misses are recorded too. */
const nearDissolve = ({measures: m}, t) => m.change >= t.minChange / 2 && m.coherence >= t.coherence - .15 && m.mix <= t.mix + .15 && m.seconds <= t.maxGradual;
const score = ({measures: m}) => m.coherence - m.mix;

/** A window that may be a dissolve, grown at either end while the change between its ends keeps growing and stays straight. */
function grow(f, [a, b], found, t) {
  let best = found;
  const tried = ([x, y]) => {
    if (x < a || y > b || (y - x) / f.fps > t.maxGradual) return null;
    const m = gradualMeasures(f, [x, y]);
    return m.measures.change > best.measures.change * 1.01 && m.measures.coherence >= t.coherence - .15 ? m : null;
  };
  for (let moved = true; moved;) {
    moved = false;
    const [s, e] = best.frames;
    for (const span of [[s - 1, e], [s, e + 1]]) { const m = tried(span); if (m) { best = m; moved = true; break; } }
  }
  return best;
}

/** Dissolves inside a changing stretch: the stretch itself when it is near one; else windows of 0.5, 1 and 2 s slid along it, the best that do not overlap. */
function dissolvesIn(f, run, t) {
  const [a, b] = run;
  if (b - a < t.gradualFrames) return [];
  const whole = gradualMeasures(f, run);
  if (nearDissolve(whole, t)) return [whole];
  const step = Math.max(1, Math.round(f.fps / 10)), hits = [];
  for (const half of [.25, .5, 1].map(s => Math.max(2, Math.round(s * f.fps)))) {
    for (let c = a + half; c + half <= b; c += step) { const m = gradualMeasures(f, [c - half, c + half]); if (nearDissolve(m, t)) hits.push(m); }
  }
  const kept = [];
  for (const h of hits.sort((x, y) => score(y) - score(x))) if (!kept.some(k => h.frames[0] <= k.frames[1] && k.frames[0] <= h.frames[1])) kept.push(h);
  return kept.map(h => grow(f, run, h, t));
}

/** The parts of [a, b] outside the given spans. */
function outside([a, b], spans) {
  const out = []; let from = a;
  for (const [s, e] of [...spans].sort((x, y) => x[0] - y[0])) { if (s > from) out.push([from, s]); from = Math.max(from, e); }
  if (b > from) out.push([from, b]);
  return out;
}

/**
 * Every gradual change worth deciding, outside the breaks (the cuts and flashes): a fade around each run of one colour
 * that the picture fades to or from (out, in, or a dip through it), and the dissolves the rest of each changing stretch
 * may hold. A stretch is where the change from frame to frame reaches `gradualFloor` (or twice the film's quietest
 * tenth, when that is more); a hold of one colour up to `maxHold` seconds joins two.
 */
export function gradualCandidates(f, breaks, t) {
  const floor = Math.max(t.gradualFloor, 2 * percentile(f.d.slice(1), .1));
  return changingStretches(f, breaks, floor, t.blank, Math.round(t.maxHold * f.fps)).flatMap(run => {
    const fades = blankRuns(f, run, t.blank).map(r => fadeSpan(f, run, r)).filter(Boolean);
    return [...fades.map(x => gradualMeasures(f, x.span, x.middle)), ...outside(run, fades.map(x => x.span)).flatMap(piece => dissolvesIn(f, piece, t))];
  }).sort((x, y) => x.frames[0] - y.frames[0]);
}

// ── A shot's motion ────────────────────────────────────────────────────────────────────────────────────────

/**
 * What a rule reads of a shot's motion between its clean frames c0..c1 (the frames no transition touches): `energy`
 * (the mean change from frame to frame), `busiest` (the change in its busiest grid cell, averaged over the shot),
 * `share` (how much of the frame changes at once, 0..1), and the shift of the whole picture — `pan` (how far it travels,
 * in frame widths or heights a second), `explained` (how much of the change that shift explains). Plus what is reported
 * beside the verdict: the grid (where the change lives), the direction the camera seems to move. Frames in `skip` (a
 * flash) are left out.
 */
export function shotMotion(f, c0, c1, {panStep = .2, skip = new Set()} = {}) {
  const grid = new Float64Array(GRID.cols * GRID.rows);
  let energy = 0, share = 0, count = 0;
  for (let k = c0 + 1; k <= c1; k++) {
    if (skip.has(k)) continue;
    energy += f.d[k]; share += f.share[k]; f.cells[k].forEach((v, c) => { grid[c] += v; }); count++;
  }
  const mean = v => (count ? v / count : 0), cells = Array.from(grid, mean);
  const camera = cameraMove(f, c0, c1, panStep);
  return {measures: {energy: round(mean(energy)), busiest: round(Math.max(0, ...cells)), share: round(mean(share)), pan: round(camera.pan, 3), explained: round(camera.explained)},
    grid: Array.from({length: GRID.rows}, (_, r) => cells.slice(r * GRID.cols, (r + 1) * GRID.cols).map(v => round(v, 1))), camera: camera.direction};
}

/** The whole picture's shift over a shot, in steps of `panStep` seconds: how far it travels a second, and how much of the change it explains. */
function cameraMove(f, c0, c1, panStep) {
  const span = c1 - c0, g = Math.max(1, Math.min(span, Math.round(panStep * f.fps)));
  let x = 0, y = 0, travel = 0, weight = 0, explained = 0, seconds = 0;
  for (let k = c0; k + g <= c1; k += g) {
    const m = moveBetween(f, k, k + g);
    seconds += g / f.fps;
    if (m.change < .05) continue;
    x += m.dx; y += m.dy; travel += Math.max(Math.abs(m.dx) / f.W, Math.abs(m.dy) / f.H);
    explained += m.explained * m.change; weight += m.change;
  }
  const pan = seconds ? travel / seconds : 0;
  // The content moves one way, so the camera went the other: content moving left is a camera panning right.
  const direction = !seconds || pan < 1e-3 ? null : Math.abs(x) / f.W >= Math.abs(y) / f.H ? (x < 0 ? 'right' : 'left') : (y < 0 ? 'down' : 'up');
  return {pan, explained: weight ? explained / weight : 0, direction};
}

/** The film's change from frame to frame, averaged every `every` seconds (the breaks — cuts and flashes — left out). */
export function energyCurve(f, breaks, every = .5) {
  const out = [];
  for (let i = 0; i * every < f.n / f.fps - 1e-9; i++) {
    const ks = [];
    for (let k = Math.max(1, Math.round(i * every * f.fps)); k < Math.min(f.n, Math.round((i + 1) * every * f.fps)); k++) if (!breaks.has(k)) ks.push(f.d[k]);
    out.push({t: round(i * every, 3), energy: round(ks.length ? ks.reduce((s, v) => s + v, 0) / ks.length : 0)});
  }
  return out;
}

// ── Stills and the strokes of lettering ────────────────────────────────────────────────────────────────────

/**
 * Colour stills of the given frames (ascending, each once), `width` pixels wide, in one FFmpeg pass that selects them
 * by number: a Map frame → {width, height, rgb}.
 */
export async function readStills(ffmpeg, file, frames, {width, height}) {
  const want = [...new Set(frames)].sort((a, b) => a - b), size = width * height * 3, out = new Map();
  if (!want.length) return out;
  const select = `select='${want.map(k => `eq(n\\,${k})`).join('+')}',scale=${width}:${height}:flags=area`;
  const ff = spawn(ffmpeg, ['-v', 'error', '-i', file, '-vf', select, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], {stdio: ['ignore', 'pipe', 'pipe']});
  let held = Buffer.alloc(0), err = '', i = 0;
  ff.stderr.on('data', b => { err += b; });
  for await (const chunk of ff.stdout) {
    held = held.length ? Buffer.concat([held, chunk]) : chunk;
    while (held.length >= size) { if (i < want.length) out.set(want[i++], {width, height, rgb: new Uint8Array(held.subarray(0, size))}); held = held.subarray(size); }
  }
  const code = await new Promise(r => ff.once('close', r));
  if (code !== 0) throw new Error(`breakdown: ${ffmpeg} could not read the stills: ${err.slice(-300)}`);
  return out;
}

/**
 * How much of a still looks like lettering — a heuristic, not OCR: the still is cut into 8-pixel blocks, a block is
 * stroke-like when sharp left-right edges (a step of `edge` grey levels or more) fill between 6% and 45% of it and reach
 * at least 3 of its rows, and lettering is three or more such blocks side by side. Returns the share of the still
 * (0..1) covered by such rows of blocks.
 */
export function textArea({width, height, rgb}, {edge = 48, block = 8} = {}) {
  const grey = new Float32Array(width * height);
  for (let i = 0; i < grey.length; i++) grey[i] = .299 * rgb[3 * i] + .587 * rgb[3 * i + 1] + .114 * rgb[3 * i + 2];
  const across = Math.floor(width / block), down = Math.floor(height / block);
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
  let lettered = 0;
  for (let by = 0; by < down; by++) {
    let run = 0;
    for (let bx = 0; bx <= across; bx++) {
      if (bx < across && strokeLike(bx, by)) { run++; continue; }
      if (run >= 3) lettered += run;
      run = 0;
    }
  }
  return across && down ? lettered / (across * down) : 0;
}
