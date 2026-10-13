/**
 * The beat map's signal work, as plain functions of samples: a radix-2 FFT, onset strength (spectral flux, log
 * compressed, split in three bands), tempo by autocorrelation with a prior, beats by dynamic programming (Ellis
 * 2007), beats moved onto the transient they sit on, downbeats from low-band onsets, the drop, and a sound's peak.
 * beats.mjs runs them as a flowchart and records every verdict; nothing here decides, reads files or records.
 */

/** The analysis settings: the rate the song is read at, the FFT size and hop, the band edges (Hz), the log compression. */
export const ANALYSIS = Object.freeze({rate: 22050, size: 1024, hop: 256, low: 200, mid: 2000, compression: 100});

/** An in-place radix-2 FFT for one size (a power of two): fft(re, im) turns the two arrays into the spectrum. */
export function fftOf(n) {
  if (!(Number.isInteger(n) && n >= 2 && (n & (n - 1)) === 0)) throw new Error(`fft: the size must be a power of two, not ${n}`);
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2), swap = new Uint32Array(n);
  for (let k = 0; k < n / 2; k++) { cos[k] = Math.cos(2 * Math.PI * k / n); sin[k] = -Math.sin(2 * Math.PI * k / n); }
  for (let i = 0, bits = Math.log2(n); i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); swap[i] = r; }
  return (re, im) => {
    for (let i = 0; i < n; i++) { const j = swap[i]; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1, step = n / len;
      for (let i = 0; i < n; i += len) for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half, wr = cos[k * step], wi = sin[k * step];
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  };
}

/** A Hann window of n points. */
const hann = n => Float64Array.from({length: n}, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / n));

/**
 * Onset strength, frame by frame (frame i is centred on sample i·hop): the spectral flux — how much each bin's
 * log-compressed magnitude rose since the frame before — summed per band (low below `low` Hz, mid up to `mid`, high
 * above), each band's flux a mean per bin so the few low bins weigh as much as the many high ones. Also each band's
 * power, for the downbeats and the drop. Returns {frameRate, frames, flux: {low, mid, high, all}, power: {low, mid, high}}.
 */
export function onsetStrength(samples, rate, {size = ANALYSIS.size, hop = ANALYSIS.hop, low = ANALYSIS.low, mid = ANALYSIS.mid, compression = ANALYSIS.compression} = {}) {
  const frames = Math.floor(samples.length / hop) + 1, bins = size / 2 + 1, fft = fftOf(size), win = hann(size);
  const lowTop = Math.max(2, Math.round(low * size / rate)), midTop = Math.max(lowTop + 1, Math.round(mid * size / rate));
  const band = k => (k < lowTop ? 0 : k < midTop ? 1 : 2), counts = [lowTop - 1, midTop - lowTop, bins - midTop];
  const flux = [0, 1, 2].map(() => new Float32Array(frames)), power = [0, 1, 2].map(() => new Float32Array(frames));
  const re = new Float64Array(size), im = new Float64Array(size);
  let before = new Float64Array(bins), now = new Float64Array(bins);
  for (let f = 0; f < frames; f++) {
    const from = f * hop - size / 2;
    for (let i = 0; i < size; i++) { const at = from + i; re[i] = at >= 0 && at < samples.length ? samples[at] * win[i] : 0; im[i] = 0; }
    fft(re, im);
    // The DC bin carries no onset: bins 1 … size/2.
    for (let k = 1; k < bins; k++) {
      const m2 = re[k] * re[k] + im[k] * im[k], b = band(k);
      now[k] = Math.log1p(compression * Math.sqrt(m2));
      power[b][f] += m2;
      if (f > 0) flux[b][f] += Math.max(0, now[k] - before[k]);
    }
    [before, now] = [now, before];
  }
  for (const b of [0, 1, 2]) for (let f = 0; f < frames; f++) flux[b][f] /= Math.max(1, counts[b]);
  const all = new Float32Array(frames);
  for (let f = 0; f < frames; f++) all[f] = flux[0][f] + flux[1][f] + flux[2][f];
  return {frameRate: rate / hop, frames, flux: {low: flux[0], mid: flux[1], high: flux[2], all}, power: {low: power[0], mid: power[1], high: power[2]}};
}

/** How strongly a tempo is preferred: 1 inside the range, falling off by a third of an octave's spread outside it. */
export function tempoPrior(bpm, [lo, hi] = [70, 180], spread = 1 / 3) {
  const out = bpm < lo ? Math.log2(lo / bpm) : bpm > hi ? Math.log2(bpm / hi) : 0;
  return Math.exp(-.5 * (out / spread) ** 2);
}

/**
 * The tempo's candidates, ranked: each local peak of the onset envelope's autocorrelation (lags of 30 … 300 BPM,
 * refined between frames by a parabola), weighted by the prior (tempoPrior). Returns [{bpm, period (frames), score}]
 * best first, scores relative to the best (1), at most `count`, none under 5% of it.
 */
export function tempoCandidates(envelope, frameRate, {range = [70, 180], count = 5} = {}) {
  const n = envelope.length, mean = envelope.reduce((a, v) => a + v, 0) / Math.max(1, n), x = Float64Array.from(envelope, v => v - mean);
  const lag0 = Math.max(2, Math.floor(frameRate * 60 / 300)), lag1 = Math.min(n - 2, Math.ceil(frameRate * 60 / 30));
  const ac = new Float64Array(lag1 + 2);
  for (let lag = lag0 - 1; lag <= lag1 + 1; lag++) { let s = 0; for (let t = 0; t + lag < n; t++) s += x[t] * x[t + lag]; ac[lag] = s / Math.max(1, n - lag); }
  const found = [];
  for (let lag = lag0; lag <= lag1; lag++) {
    const [a, b, c] = [ac[lag - 1], ac[lag], ac[lag + 1]];
    if (!(b > a && b >= c && b > 0)) continue;
    const bend = a - 2 * b + c, p = bend < 0 ? .5 * (a - c) / bend : 0, period = lag + p, bpm = 60 * frameRate / period;
    found.push({bpm, period, score: (b - .25 * (a - c) * p) * tempoPrior(bpm, range)});
  }
  found.sort((p, q) => q.score - p.score);
  const best = found[0]?.score ?? 0;
  return found.filter(c => c.score >= .05 * best).slice(0, count).map(c => ({bpm: +c.bpm.toFixed(2), period: c.period, score: +(c.score / best).toFixed(3)}));
}

/**
 * The envelope less its moving average over `reach` frames either side (a high-pass, as Ellis 2007 filters it): a
 * steady wash of noise or a held pad flux a little on every frame, and only what stands above it is an onset.
 */
function detrended(envelope, reach) {
  const n = envelope.length, sums = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) sums[i + 1] = sums[i] + envelope[i];
  return Float64Array.from(envelope, (v, i) => { const a = Math.max(0, i - reach), b = Math.min(n, i + reach + 1); return v - (sums[b] - sums[a]) / (b - a); });
}

/** A copy of the envelope divided by its standard deviation (Ellis 2007 scales the onsets so the tightness means the same for every song). */
function normalised(envelope) {
  const n = envelope.length, mean = envelope.reduce((a, v) => a + v, 0) / n;
  const sd = Math.sqrt(envelope.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(1, n - 1)) || 1;
  return Float64Array.from(envelope, v => v / sd);
}

/** The onsets smoothed by a Gaussian a 32nd of a beat wide: the score of a beat at each frame. */
function localScore(onsets, period) {
  const reach = Math.round(period), kernel = Float64Array.from({length: 2 * reach + 1}, (_, i) => Math.exp(-.5 * ((i - reach) * 32 / period) ** 2));
  const out = new Float64Array(onsets.length);
  for (let t = 0; t < onsets.length; t++) { let s = 0; for (let k = -reach; k <= reach; k++) { const at = t + k; if (at >= 0 && at < onsets.length) s += onsets[at] * kernel[k + reach]; } out[t] = s; }
  return out;
}

/** The last beat: the last peak of the cumulative score above half the median peak (librosa's rule, after Ellis). */
function lastBeat(cumulative) {
  const peaks = [];
  for (let t = 1; t < cumulative.length - 1; t++) if (cumulative[t] > cumulative[t - 1] && cumulative[t] >= cumulative[t + 1]) peaks.push(t);
  if (!peaks.length) return cumulative.length - 1;
  const sorted = peaks.map(t => cumulative[t]).sort((a, b) => a - b), median = sorted[sorted.length >> 1];
  return peaks.filter(t => 2 * cumulative[t] > median).at(-1) ?? peaks.at(-1);
}

/**
 * Leading and trailing beats on weak onsets dropped: under half the RMS of the beats' scores. The chain runs on through
 * a song's silent intro and its fading end at the period it costs nothing to keep; those beats sit on no onset.
 */
function trimmed(beats, score) {
  const at = beats.map(b => score[b]), floor = .5 * Math.sqrt(at.reduce((a, v) => a + v * v, 0) / Math.max(1, at.length));
  let a = 0, b = beats.length - 1;
  while (a <= b && at[a] <= floor) a++;
  while (b >= a && at[b] <= floor) b--;
  return beats.slice(a, b + 1);
}

/**
 * Beats by dynamic programming (Ellis 2007, "Beat tracking by dynamic programming"): each frame's best score is its
 * onset plus the best earlier beat, half a period to two periods back, penalised by how far the gap strays from the
 * period, `tightness` times the squared log of their ratio. The best chain is read back from the last beat, and weak
 * beats at either end are dropped. Returns the beats' frames, in order.
 */
export function trackBeats(envelope, period, {tightness = 100} = {}) {
  if (!(period > 1)) throw new Error(`trackBeats: the period is a number of frames above 1, not ${period}`);
  const score = localScore(normalised(detrended(envelope, Math.round(period))), period), n = score.length, top = score.reduce((m, v) => Math.max(m, v), -Infinity);
  const cumulative = new Float64Array(n), back = new Int32Array(n).fill(-1);
  const near = Math.max(1, Math.round(period / 2)), far = Math.round(2 * period);
  let started = false;
  for (let t = 0; t < n; t++) {
    let best = -Infinity, from = -1;
    for (let gap = near; gap <= far; gap++) {
      const prior = t - gap, cost = -tightness * Math.log(gap / period) ** 2, value = cost + (prior >= 0 ? cumulative[prior] : 0);
      if (value > best) { best = value; from = prior; }
    }
    cumulative[t] = score[t] + best;
    // Before the first onset worth the name there is nothing to chain back to.
    if (!started && score[t] < .01 * top) back[t] = -1; else { back[t] = from; started = true; }
  }
  const beats = [];
  for (let t = lastBeat(cumulative); t >= 0; t = back[t]) beats.push(t);
  return trimmed(beats.reverse(), score);
}

/** Prefix sums of the squared samples: the energy of any stretch in one subtraction. */
function energyIndex(samples) {
  const sums = new Float64Array(samples.length + 1);
  for (let i = 0; i < samples.length; i++) sums[i + 1] = sums[i] + samples[i] * samples[i];
  return (a, b) => { a = Math.max(0, Math.min(samples.length, a)); b = Math.max(a, Math.min(samples.length, b)); return (sums[b] - sums[a]) / Math.max(1, b - a); };
}

/**
 * Each beat moved onto the transient it sits on: within `reach` seconds, the moment the energy of the next `attack`
 * seconds rises most over the `before` seconds ahead of it — if that rise is at least `least` times (a transient);
 * otherwise the beat stays where the frames put it. The frames are 11.6 ms apart and an onset registers as the
 * window reaches it, so a beat is placed on the sample its sound starts at.
 */
export function refineBeats(samples, rate, times, {reach = .035, attack = .005, before = .01, least = 2, step = .0005} = {}) {
  const energy = energyIndex(samples), a = Math.round(attack * rate), b = Math.round(before * rate), floor = 1e-12;
  return times.map(t => {
    let best = 0, at = t;
    for (let s = t - reach; s <= t + reach + 1e-9; s += step) {
      const i = Math.round(s * rate), ratio = (energy(i, i + a) + floor) / (energy(i - b, i) + floor);
      if (ratio > best) { best = ratio; at = i / rate; }
    }
    return best >= least ? at : t;
  });
}

/**
 * The tempo of a beat grid: each gap counted in periods (a skipped beat counts two), then a least-squares line through
 * (beat number, time). 60 / its slope is the BPM. null under two beats.
 */
export function gridTempo(times, period) {
  if (times.length < 2) return null;
  const index = [0];
  for (let i = 1; i < times.length; i++) index.push(index[i - 1] + Math.max(1, Math.round((times[i] - times[i - 1]) / period)));
  const n = times.length, mx = index.reduce((a, v) => a + v, 0) / n, my = times.reduce((a, v) => a + v, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (index[i] - mx) * (times[i] - my); sxx += (index[i] - mx) ** 2; }
  return sxx > 0 ? 60 / (sxy / sxx) : null;
}

/** The strongest value of a series within `reach` frames of frame f. */
const nearMax = (series, f, reach) => { let m = 0; for (let k = Math.max(0, f - reach); k <= Math.min(series.length - 1, f + reach); k++) m = Math.max(m, series[k]); return m; };

/**
 * The share of beats that sit on an onset: the envelope's peak within `reach` seconds of the beat stands `least` times
 * above the envelope's median over the `around` seconds either side of it (an onset stands out from what surrounds it;
 * a beat the chain carried through a held chord or a wash of noise does not).
 */
export function onsetSupport(envelope, frameRate, times, {reach = .05, around = .5, least = 1.5} = {}) {
  if (!times.length) return 0;
  const span = Math.ceil(reach * frameRate), wide = Math.ceil(around * frameRate);
  const median = f => { const w = Array.from(envelope.subarray(Math.max(0, f - wide), Math.min(envelope.length, f + wide + 1))).sort((a, b) => a - b); return w[w.length >> 1] ?? 0; };
  return times.filter(t => { const f = Math.round(t * frameRate); return nearMax(envelope, f, span) > least * median(f) + 1e-12; }).length / times.length;
}

/**
 * Which beat in `meter` starts a bar: for each phase, the mean low-band onset at the beats of that phase (a kick
 * marks the one). Returns the scores, phase 0 for the first beat, relative to the strongest (1).
 */
export function downbeatScores(lowFlux, frameRate, times, meter = 4) {
  const sums = new Float64Array(meter), counts = new Float64Array(meter);
  times.forEach((t, i) => { sums[i % meter] += nearMax(lowFlux, Math.round(t * frameRate), 2); counts[i % meter]++; });
  const means = [...sums].map((s, i) => (counts[i] ? s / counts[i] : 0)), top = Math.max(...means) || 1;
  return means.map(m => +(m / top).toFixed(3));
}

/**
 * The drop: the largest sustained rise in low and mid band power after a quieter build. At every frame with `window`
 * seconds of song on both sides, the rise is the window after it against the window before it, in dB; it is sustained
 * when each half of the window after holds above the build (`held`: the weaker half's rise). A build that is silence is
 * not a build (more than `quiet` dB under the song's loudest window). Long windows find where the song rises; a build
 * that itself rises (a riser) pulls them early, so the drop is then placed by its first hit: within a quarter of the
 * window of it, the frame whose power (two frames, 23 ms) rises most over the `focus` seconds before it. Returns {at (seconds),
 * rise, held, build (dB under the loudest window)}, or null when the song is too short to hold two windows or nothing
 * rises and holds.
 */
export function dropCandidate(power, frameRate, {window = 4, focus = .5, quiet = 50} = {}) {
  const n = power.length, sums = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) sums[i + 1] = sums[i] + power[i];
  const w = Math.min(Math.round(window * frameRate), Math.floor(n / 3)), h = Math.max(1, w >> 1), f = Math.max(1, Math.min(Math.round(focus * frameRate), h));
  if (w < 2) return null;
  const mean = (a, b) => (sums[b] - sums[a]) / (b - a), db = p => 10 * Math.log10(p + 1e-20);
  let loudest = 0;
  for (let i = 0; i + w <= n; i++) loudest = Math.max(loudest, mean(i, i + w));
  const measure = i => { const build = db(mean(i - w, i)); return {i, build, rise: db(mean(i, i + w)) - build, held: db(Math.min(mean(i, i + h), mean(i + h, i + w))) - build}; };
  let best = null;
  for (let i = w; i + w <= n; i++) {
    const m = measure(i);
    if (m.build >= db(loudest) - quiet && m.held > 0 && (!best || m.rise > best.rise)) best = m;
  }
  if (!best) return null;
  let sharpest = best, jump = -Infinity;
  for (let i = Math.max(w, best.i - (w >> 2)); i <= Math.min(n - w, best.i + (w >> 2)); i++) {
    const m = measure(i), step = db(mean(i, i + 2)) - db(mean(i - f, i));
    if (m.held > 0 && step > jump) { jump = step; sharpest = m; }
  }
  return {at: sharpest.i / frameRate, rise: +sharpest.rise.toFixed(2), held: +sharpest.held.toFixed(2), build: +(db(loudest) - sharpest.build).toFixed(2)};
}

/**
 * A sound's peak: the moment of its loudest transient, in seconds from its start — the loudest `window` of it (by
 * energy), and in that window its loudest sample. Start the sound `peak` seconds before a moment and its hit lands
 * on the moment. 0 for silence.
 */
export function peakOfSamples(samples, rate, {window = .005} = {}) {
  if (!(rate > 0)) throw new Error(`peakOf: the sample rate must be above zero, not ${rate}`);
  const w = Math.max(1, Math.round(window * rate)), energy = energyIndex(samples);
  let start = 0, most = -1;
  for (let i = 0; i + w <= Math.max(w, samples.length); i++) { const e = energy(i, i + w); if (e > most) { most = e; start = i; } }
  if (!(most > 0)) return 0;
  let at = start;
  for (let i = start; i < Math.min(samples.length, start + w); i++) if (Math.abs(samples[i]) > Math.abs(samples[at])) at = i;
  return at / rate;
}

/** Binary search: the index of the first value in an ascending list that is >= t (the list's length when none is). */
export function firstAtOrAfter(list, t) {
  let lo = 0, hi = list.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (list[m] < t) lo = m + 1; else hi = m; }
  return lo;
}
