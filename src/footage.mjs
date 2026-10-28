/**
 * Footage: a video read as numbers, for breakdown.mjs. Every frame is read once, small and grey (finished.mjs ·
 * ffmpegProbe's frames), and kept only as the few measures the breakdown asks of it: how much it changed from the frame
 * before (over the whole picture and in each cell of a coarse grid), how spread its grey levels are (one colour, or a
 * picture), a thumbnail to compare frames far apart, and its row and column means (projections), from which a shift of
 * the whole picture is found. On those: the candidates for a cut or a gradual change, each with the measures a rule
 * reads (the fades found first, from the runs of one colour); and a shot's motion. Colour stills and the strokes of
 * lettering are stills.mjs's.
 *
 * Grey levels are a video's (limited range, 16–235): differences and spreads are scaled to 0–255 (VIDEO), as
 * finished.mjs scales them.
 */
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
 * Read every frame of the file once (the probe's frames, `width` pixels wide, on a constant clock of `rate` slots a
 * second: finished.mjs · onSlots — slot k is the frame a player shows at k / rate, a variable-rate file's too) into the
 * measures kept: d[k] (the change from slot k-1 to k, 0–255), spread[k] (one colour under about 1.5), share[k] (how much
 * of the grid changed at once), cells[k] (the change in each grid cell), thumbs[k], cols[k] and rows[k]; and source[k],
 * the decoded frame slot k shows (a slot no new frame reached repeats the one before, known by its source).
 */
export async function readFootage(probe, file, meta, {width = 160, rate = meta.video.fps} = {}) {
  const W = width, H = Math.max(2, 2 * Math.round(width * meta.video.height / meta.video.width / 2));
  const f = {fps: rate, W, H, layout: layoutOf(W, H), n: 0, d: [0], share: [0], cells: [new Float32Array(GRID.cols * GRID.rows)], spread: [], thumbs: [], cols: [], rows: [], source: []};
  let before = null;
  f.n = await probe.frames(file, {width: W, height: H, fps: rate}, (k, grey, source) => {
    f.source.push(source ?? k);
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

// ── Candidates for a cut, and the fades ────────────────────────────────────────────────────────────────────

/**
 * The frames cut detection looks at: every slot that shows a new decoded frame (readFootage · source). A slot no new frame
 * reached repeats the one before — counted, a one-frame flash read twice over would be two cuts with a sliver of a shot
 * between. A new frame that looks the same as the one before (a still screen recording) is a frame, and counts.
 */
function distinctFrames(f) {
  const out = [0];
  for (let k = 1; k < f.n; k++) if (f.source[k] !== f.source[k - 1]) out.push(k);
  return out;
}

/**
 * How much of a change lasts (frames as `seq` lists them, seq[i] the change's): the frames up to `most` after it against
 * the frame before it (a cut: about 1; a flash, the picture back as it was: near 0) — the least of them. Both ways round,
 * since the change may be the flash's start or its end (a flash of several frames is a change in and a change out):
 * `frame` is the flash's first frame, `end` the frame the picture comes back on. `most` 1 reads a one-frame flash only.
 */
function lasting(f, seq, i, most = 1) {
  let least = Infinity, frame = seq[i], end = seq[i + 1] ?? seq[i] + 1;
  for (let j = 1; j <= most; j++) {
    if (i + j < seq.length) {   // the change starts a flash j frames long: frame i + j is the picture before it
      const v = thumbDiff(f, seq[i - 1], seq[i + j]) / Math.max(thumbDiff(f, seq[i - 1], seq[i]), 1);
      if (v < least) { least = v; frame = seq[i]; end = seq[i + j]; }
    }
    if (i - 1 - j >= 0) {       // the change ends one: frame i is the picture before it began
      const v = thumbDiff(f, seq[i - 1 - j], seq[i]) / Math.max(thumbDiff(f, seq[i - 1 - j], seq[i - 1]), 1);
      if (v < least) { least = v; frame = seq[i - j]; end = seq[i]; }
    }
  }
  return {value: Number.isFinite(least) ? least : 1, frame, end};
}

/** Every frame (of `seq`) whose change is a peak at least half a cut's, with its jump, the median change around it, and their ratio. */
function peaks(f, seq, {cutJump, cutRatio}) {
  const out = [], reach = Math.max(3, Math.round(f.fps / 3)), d = i => f.d[seq[i]];
  for (let i = 1; i < seq.length; i++) {
    const jump = d(i);
    if (!(jump >= d(i - 1) && jump > (i + 1 < seq.length ? d(i + 1) : -Infinity)) || jump < cutJump / 2) continue;
    const near = [];
    for (let j = Math.max(1, i - reach); j <= Math.min(seq.length - 1, i + reach); j++) if (Math.abs(j - i) > 1) near.push(d(j));
    const around = median(near), ratio = jump / Math.max(around, 1);
    if (ratio >= cutRatio / 2) out.push({k: seq[i], i, jump, around, ratio});
  }
  return out;
}

/**
 * The runs of one-colour frames (spread under `blank`) in the film: [p, q], first and last. A jump of `jump` or more
 * between two such frames (black cut to white, a red card cut to a blue one) starts a run of its own: one colour each.
 */
function blankRuns(f, blank, jump) {
  const out = []; let p = -1;
  for (let k = 0; k <= f.n; k++) {
    const isBlank = k < f.n && f.spread[k] < blank;
    if (p >= 0 && (!isBlank || f.d[k] >= jump)) { out.push([p, k - 1]); p = -1; }
    if (isBlank && p < 0) p = k;
  }
  return out;
}

/** How much a frame's spread may wobble (grain, motion) and still follow one trend. */
const wobble = v => Math.max(.3, .03 * v);

/**
 * The fade into a run of one colour starting at p: back from p while each frame before had at least the spread of the one
 * after it (within a wobble: a fade eased in or out moves too little in a frame to rise every frame), no further than
 * `lo`; then the frames still at the picture's own level are left out, so the fade starts where the picture starts to
 * go. [start, p], or null when it is shorter than `minFade` frames or does not cover most of the way (covered): a cut.
 */
function fadeInto(f, p, lo, minFade) {
  let s = p; while (s - 1 >= lo && f.spread[s - 1] >= f.spread[s] - wobble(f.spread[s])) s--;
  let top = 0; for (let k = s; k <= p; k++) top = Math.max(top, f.spread[k]);
  let start = s; for (let k = s; k < p; k++) if (f.spread[k] >= top - wobble(top)) start = k;
  return p - start >= minFade && covered(f.spread[p - 1], top) ? [start, p] : null;
}
/** The fade out of a run of one colour ending at q, the same forward, no further than `hi`: [q, end], or null. */
function fadeOutOf(f, q, hi, minFade) {
  let e = q; while (e + 1 <= hi && f.spread[e + 1] >= f.spread[e] - wobble(f.spread[e])) e++;
  let top = 0; for (let k = q; k <= e; k++) top = Math.max(top, f.spread[k]);
  let end = e; for (let k = e; k > q; k--) if (f.spread[k] >= top - wobble(top)) end = k;
  return end - q >= minFade && covered(f.spread[q + 1], top) ? [q, end] : null;
}
/**
 * A fade covers most of the way to its colour before its last step (into the colour) or after its first (out of it): the
 * picture at that step has at most half the spread it had. A picture that dims a little and then cuts to black was cut.
 */
const covered = (atStep, top) => atStep <= top / 2;

/**
 * The fades: around every run of one colour, the fade into it and the fade out of it, each found by following the
 * spread's trend (fadeInto, fadeOutOf), bounded by the runs either side, `maxFade` seconds, and every one-frame jump
 * between two pictures (a hard cut, which no fade crosses). A fade's own last step into the colour, or its first out of
 * it, may be a jump too: that one is inside the fade. Each: {hold: [p, q], into: [s, p] | null, out: [q, e] | null}.
 */
function fadesOf(f, jumps, t) {
  const runs = blankRuns(f, t.blank, t.cutJump), most = Math.round(t.maxFade * f.fps), least = Math.max(2, Math.round(t.minFade * f.fps));
  return runs.flatMap(([p, q], i) => {
    const lo = Math.max(i ? runs[i - 1][1] + 1 : 0, p - most, ...jumps.filter(k => k <= p)), hi = Math.min(i + 1 < runs.length ? runs[i + 1][0] - 1 : f.n - 1, q + most, ...jumps.filter(k => k > q).map(k => k - 1));
    const into = p > 0 ? fadeInto(f, p, lo, least) : null, out = q < f.n - 1 ? fadeOutOf(f, q, hi, least) : null;
    return into || out ? [{hold: [p, q], into, out}] : [];
  });
}

/** How long the fade is that the change into frame k belongs to (seconds; 0 when it is in none). */
function fadeHolding(fades, k, fps) {
  for (const {into, out} of fades) for (const span of [into, out]) if (span && span[0] < k && k <= span[1]) return (span[1] - span[0]) / fps;
  return 0;
}

/**
 * The candidates for a cut — every frame whose change is a peak at least half a cut's (`cutJump`, `cutRatio`) — with what
 * a rule reads: `jump` (its change, 0–255), `around` (the median change of the frames around it), `ratio` (jump over
 * around, around taken as at least 1), `lasting`, and `fade` (the length of the fade the change is a step of, or 0); and
 * `flashFrame` and `flashEnd`, the frame that would be a flash and the frame the picture comes back on. Near misses are candidates too, so the record says why each was not a
 * cut. Also the fades (fadesOf), found first, so a fade's last step into its colour is never taken for a cut.
 */
export function cutsAndFades(f, t) {
  const seq = distinctFrames(f), found = peaks(f, seq, t), between = ({k}) => f.spread[k - 1] >= t.blank && f.spread[k] >= t.blank;
  const fades = fadesOf(f, found.filter(p => p.jump >= t.cutJump && p.ratio >= t.cutRatio && between(p)).map(p => p.k), t);
  const most = Math.max(1, Math.round((t.maxFlash ?? 0) * f.fps));   // a flash's frames, at most
  const cuts = found.map(({k, i, jump, around, ratio}) => {
    const last = lasting(f, seq, i, most);
    return {kind: 'cut', at: round(k / f.fps, 3), frames: [k - 1, k], flashFrame: last.frame, flashEnd: last.end,
      measures: {jump, around, ratio, lasting: last.value, fade: fadeHolding(fades, k, f.fps)}};
  });
  return {cuts, fades};
}

// ── Candidates for a gradual change ────────────────────────────────────────────────────────────────────────

/**
 * The stretches where the picture keeps changing: frames whose change reaches `floor`, allowing one quiet frame inside;
 * a break (a cut or a flash) ends one. Each is [a, b]: a, the frame before its first change; b, the last frame that changed.
 */
function changingStretches(f, breaks, floor) {
  const out = []; let first = -1, last = -1, quiet = 0;
  const close = () => { if (first >= 0) out.push([first - 1, last]); first = -1; quiet = 0; };
  for (let k = 1; k < f.n; k++) {
    if (breaks.has(k)) { close(); continue; }
    if (f.d[k] >= floor) { if (first < 0) first = k; last = k; quiet = 0; } else if (first >= 0 && ++quiet > 1) close();
  }
  close();
  return out;
}

/**
 * What a rule reads of a gradual change from frame a to frame b (exact: a rule compares the value itself, never a rounding): how far the picture goes (`change`, 0–255), how
 * straight (`coherence`: that change over the path frame by frame, 1 for a mix that only moves one way), whether its
 * middle frame is the even mix of its ends (`mix`: 0 when it is), how much a shift of the whole picture explains
 * (`moved`), how long it takes (`seconds`), and the spread of its first, least and last frames (one colour: a fade).
 * Its time (`at`) is its middle, or the frame given (where a fade meets its colour).
 */
function gradualMeasures(f, [a, b], middle = (a + b) / 2, extra = {}) {
  const mid = Math.round((a + b) / 2), change = thumbDiff(f, a, b);
  let least = Infinity; for (let k = a; k <= b; k++) least = Math.min(least, f.spread[k]);
  return {kind: 'gradual', at: round(middle / f.fps, 3), frames: [a, b], ...extra,
    measures: {change, coherence: change / Math.max(pathBetween(f, a, b), 1e-6), mix: mixError(f, a, mid, b, change), moved: moveBetween(f, a, b).explained,
      seconds: (b - a) / f.fps, startSpread: f.spread[a], leastSpread: least, endSpread: f.spread[b]}};
}

/**
 * The candidates a fade gives: a dip when the picture fades into the colour and out of it with a hold of at most
 * `maxHold` seconds between (its time the hold's middle); else the fade in and the fade out apart. A lone fade owns its
 * hold: a fade out ends where the hold does (so a cut out of the hold is the same boundary, and no slug of one colour
 * stands between them), a fade in starts where the hold does; with both fades round a longer hold, the hold is a shot of
 * its own. A fade in from the film's first frame opens it, a fade out to its last closes it.
 */
function fadeCandidates(f, {hold: [p, q], into, out}, t) {
  if (into && out && (q - p + 1) / f.fps <= t.maxHold) return [gradualMeasures(f, [into[0], out[1]], (p + q) / 2)];
  const fadeOut = into && gradualMeasures(f, into, out ? p : Math.min(q + 1, f.n - 1), q === f.n - 1 ? {closes: true} : {});
  const fadeIn = out && gradualMeasures(f, out, into ? q : p, p === 0 ? {opens: true} : {});
  return [fadeOut, fadeIn].filter(Boolean);
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

/** The parts of [a, b] outside the given spans (spans that do not reach [a, b] are no part of it). */
function outside([a, b], spans) {
  const out = []; let from = a;
  for (const [s, e] of spans.filter(([s, e]) => e > a && s < b).sort((x, y) => x[0] - y[0])) { if (s > from) out.push([from, s]); from = Math.max(from, e); }
  if (b > from) out.push([from, b]);
  return out;
}

/**
 * Every gradual change worth deciding: the fades (cutsAndFades), and the dissolves the changing stretches may hold
 * outside the fades and the breaks (the cuts and flashes). A stretch is where the change from frame to frame reaches
 * `gradualFloor` (or twice the film's quietest tenth, when that is more).
 */
export function gradualCandidates(f, breaks, fades, t) {
  const floor = Math.max(t.gradualFloor, 2 * percentile(f.d.slice(1), .1)), spans = fades.flatMap(x => [x.into, x.out].filter(Boolean));
  const dissolves = changingStretches(f, breaks, floor).flatMap(run => outside(run, spans).flatMap(piece => dissolvesIn(f, piece, t)));
  return [...fades.flatMap(x => fadeCandidates(f, x, t)), ...dissolves].sort((x, y) => x.frames[0] - y.frames[0]);
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
  return {measures: {energy: mean(energy), busiest: Math.max(0, ...cells), share: mean(share), pan: camera.pan, explained: camera.explained},
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
  const pan = seconds ? travel / seconds : 0, net = Math.max(Math.abs(x) / f.W, Math.abs(y) / f.H) / (seconds || 1);
  // The content moves one way, so the camera went the other: content moving left is a camera panning right. A shift that
  // nets out (back and forth, or a shake) has no one direction: less than half its path, or under 0.5% of the frame a second.
  const direction = !seconds || net < .005 || net < pan / 2 ? null : Math.abs(x) / f.W >= Math.abs(y) / f.H ? (x < 0 ? 'right' : 'left') : (y < 0 ? 'down' : 'up');
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
