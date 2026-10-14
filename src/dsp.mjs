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
  const re = new Float64Array(size), im = new Float64Array(size), opens = startsWithTransient(samples, rate, size);
  // A frame whose window, or the one before it, hangs off the song's start compares sound with the silence before it,
  // and one hanging off its end, sound with the silence after: neither change is the music's own. Those frames count
  // only where the song opens on a transient within a hop of the frame's centre (frame 0 rises from silence: `before`
  // starts at zero); a hit further in is heard by the first whole frames, as any other.
  const heard = f => (f * hop + size / 2 > samples.length ? false : (f - 1) * hop - size / 2 < 0 ? opens !== null && Math.abs(opens - f * hop) <= hop : true);
  let before = new Float64Array(bins), now = new Float64Array(bins);
  for (let f = 0; f < frames; f++) {
    const from = f * hop - size / 2;
    for (let i = 0; i < size; i++) { const at = from + i; re[i] = at >= 0 && at < samples.length ? samples[at] * win[i] : 0; im[i] = 0; }
    fft(re, im);
    // The DC bin carries no onset: bins 1 … size/2. A hit in the song's first milliseconds is an onset; a pad or a
    // noise floor already sounding at sample 0 is not (startsWithTransient), and neither is the song's end.
    const counted = heard(f);
    for (let k = 1; k < bins; k++) {
      const m2 = re[k] * re[k] + im[k] * im[k], b = band(k);
      now[k] = Math.log1p(compression * Math.sqrt(m2));
      power[b][f] += m2;
      if (counted) flux[b][f] += Math.max(0, now[k] - before[k]);
    }
    [before, now] = [now, before];
  }
  for (const b of [0, 1, 2]) for (let f = 0; f < frames; f++) flux[b][f] /= Math.max(1, counts[b]);
  // A frame left out at the start holds the song's usual flux there (the median of its first second), not a silence the
  // song never had: a zero would sink the frames around it, and a hit just after them with it.
  const opening = Math.ceil(size / 2 / hop) + 1, usual = Math.min(frames, opening + Math.round(rate / hop));
  for (const b of [0, 1, 2]) {
    const sorted = Array.from(flux[b].subarray(Math.min(opening, frames), usual)).sort((x, y) => x - y), median = sorted[sorted.length >> 1] ?? 0;
    for (let f = 0; f < Math.min(opening, frames); f++) if (!heard(f) && f * hop + size / 2 <= samples.length) flux[b][f] = median;
  }
  const all = new Float32Array(frames);
  for (let f = 0; f < frames; f++) all[f] = flux[0][f] + flux[1][f] + flux[2][f];
  return {frameRate: rate / hop, frames, flux: {low: flux[0], mid: flux[1], high: flux[2], all}, power: {low: power[0], mid: power[1], high: power[2]}};
}

/**
 * Where a song opens on a transient within its first `span` samples (the frames that hang off its start reach that
 * far): the first moment whose next `attack` seconds carry `least` times the attack energy (energyIndex · attacks) of
 * the `before` seconds ahead of it (refineBeats' test) — or, in the first `before` seconds, where less than that comes
 * ahead, `least` times the attack energy of the stretch `later` seconds on: a hit decays, a held sound does not.
 * Returns that sample, or null: a pad or a noise floor sounding from sample 0 is neither.
 */
export function startsWithTransient(samples, rate, span, {attack = .005, before = .01, later = [.015, .035], least = 2, step = .0005} = {}) {
  const energy = energyIndex(samples, {attacks: true}), a = Math.round(attack * rate), b = Math.round(before * rate), floor = 1e-12;
  const [l0, l1] = later.map(s => Math.round(s * rate)), hop = Math.max(1, Math.round(step * rate));
  for (let i = 0; i < b; i += hop) if (energy(i, i + a) + floor >= least * (energy(i + l0, i + l1) + floor)) return i;
  for (let i = b; i <= span; i += hop) if (energy(i, i + a) + floor >= least * (energy(i - b, i) + floor)) return i;
  return null;
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
 * Leading and trailing beats that sit on no onset dropped (onsetAt, the test onsetSupport counts by). The chain runs on
 * through a song's quiet intro and its fading end at the period it costs nothing to keep; those beats sit on nothing.
 * Each beat is judged against its own surroundings, so an intro of most of the beats cannot move the bar for the rest.
 * When no beat passes, there is nothing to trim against: the chain is kept.
 */
function trimmed(beats, envelope, frameRate) {
  const on = onsetAt(envelope, frameRate);
  let a = 0, b = beats.length - 1;
  while (a <= b && !on(beats[a])) a++;
  while (b >= a && !on(beats[b])) b--;
  return a > b ? beats : beats.slice(a, b + 1);
}

/**
 * Beats by dynamic programming (Ellis 2007, "Beat tracking by dynamic programming"): each frame's best score is its
 * onset plus the best earlier beat, half a period to two periods back, penalised by how far the gap strays from the
 * period, `tightness` times the squared log of their ratio. The best chain is read back from the last beat, and weak
 * beats at either end are dropped. Returns the beats' frames, in order.
 */
export function trackBeats(envelope, period, {tightness = 100, frameRate = ANALYSIS.rate / ANALYSIS.hop} = {}) {
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
  return trimmed(beats.reverse(), envelope, frameRate);
}

/**
 * Prefix sums of the squared samples: the energy of any stretch in one subtraction. With `attacks`, of the samples'
 * first difference — a high-pass that hears an attack over a held low note (a 220 Hz pad is 24 dB down, a 3 kHz click 2).
 */
function energyIndex(samples, {attacks = false} = {}) {
  const sums = new Float64Array(samples.length + 1);
  for (let i = 0; i < samples.length; i++) { const v = attacks ? (i ? samples[i] - samples[i - 1] : 0) : samples[i]; sums[i + 1] = sums[i] + v * v; }
  return (a, b) => { a = Math.max(0, Math.min(samples.length, a)); b = Math.max(a, Math.min(samples.length, b)); return (sums[b] - sums[a]) / Math.max(1, b - a); };
}

/**
 * Each beat moved onto the transient it sits on: within `reach` seconds, the moment the attack energy (energyIndex ·
 * attacks) of the next `attack` seconds rises most over the `before` seconds ahead of it — if that rise is at least `least` times (a transient);
 * otherwise the beat stays where the frames put it. The frames are 11.6 ms apart and an onset registers as the
 * window reaches it, so a beat is placed on the sample its sound starts at — never before the song's first, and
 * only where `attack` seconds of the song come ahead of it to rise over.
 */
export function refineBeats(samples, rate, times, {reach = .035, attack = .005, before = .01, least = 2, step = .0005} = {}) {
  const energy = energyIndex(samples, {attacks: true}), a = Math.round(attack * rate), b = Math.round(before * rate), floor = 1e-12;
  return times.map(t => {
    let best = 0, at = t;
    for (let s = t - reach; s <= t + reach + 1e-9; s += step) {
      // A moment needs some song ahead of it to rise over (`attack` seconds at least): at the very start nothing has.
      const i = Math.round(s * rate);
      if (i < a) continue;
      const ratio = (energy(i, i + a) + floor) / (energy(i - b, i) + floor);
      if (ratio > best) { best = ratio; at = i / rate; }
    }
    return Math.max(0, best >= least ? at : t);
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
 * Whether a frame sits on an onset: the envelope's peak within `reach` seconds of it stands `least` times above what
 * surrounds it — the `level` quantile of the envelope over the `around` seconds either side, the frame's own `reach`
 * left out. An onset stands out from its surroundings; a beat the chain carried through a held chord, a wash of noise
 * or a quiet intro does not: on a beat grid laid over a noise floor or a pad, the peaks stand at most about 1.6 times
 * the upper quartile, a click or a drum hit 2.6 times and more (a median would let the noise by). Returns frame => boolean.
 */
export function onsetAt(envelope, frameRate, {reach = .05, around = .5, least = 2, level = .75} = {}) {
  const span = Math.ceil(reach * frameRate), wide = Math.ceil(around * frameRate);
  const background = f => {
    const w = [];
    for (let k = Math.max(0, f - wide); k <= Math.min(envelope.length - 1, f + wide); k++) if (Math.abs(k - f) > span) w.push(envelope[k]);
    w.sort((a, b) => a - b);
    return w[Math.floor(level * (w.length - 1))] ?? 0;
  };
  return f => nearMax(envelope, f, span) > least * background(f) + 1e-12;
}

/** The share of beats (seconds) that sit on an onset (onsetAt). */
export function onsetSupport(envelope, frameRate, times, options = {}) {
  if (!times.length) return 0;
  const on = onsetAt(envelope, frameRate, options);
  return times.filter(t => on(Math.round(t * frameRate))).length / times.length;
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
 * window of it, the frame whose power (two frames, 23 ms) rises most over the `focus` seconds before it.
 * How it arrives tells a drop from a fade-in: `ramp`, the seconds from the drop until the level (smoothed over twice
 * `focus`) comes within 1.5 dB of where it settles (its highest in the two windows after), and `sudden`, the share of
 * that whole climb made across the `focus` seconds either side of the drop. A drop is there at once; a fade-in keeps
 * climbing. Returns {at (seconds), rise, held, build (dB under the loudest window), ramp, sudden}, or null when the song
 * is too short to hold two windows or nothing rises and holds.
 */
export function dropCandidate(power, frameRate, {window = 4, focus = .5, quiet = 50} = {}) {
  const n = power.length, sums = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) sums[i + 1] = sums[i] + power[i];
  const w = Math.min(Math.round(window * frameRate), Math.floor(n / 3)), h = Math.max(1, w >> 1), f = Math.max(1, Math.min(Math.round(focus * frameRate), h));
  if (w < 2) return null;
  const mean = (a, b) => { a = Math.max(0, a); b = Math.min(n, b); return b > a ? (sums[b] - sums[a]) / (b - a) : 0; }, db = p => 10 * Math.log10(p + 1e-20);
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
  const {i, build, rise} = sharpest, level = j => db(mean(j - f, j + f + 1)), end = Math.min(n - 1, i + 2 * w);
  // Where the level settles after the drop, and how long it takes to get within 1.5 dB of it.
  let settles = -Infinity, there = i;
  for (let j = i; j <= end; j++) settles = Math.max(settles, level(j));
  while (there < end && level(there) < settles - 1.5) there++;
  return {at: i / frameRate, rise: +rise.toFixed(2), held: +sharpest.held.toFixed(2), build: +(db(loudest) - build).toFixed(2),
    ramp: +((there - i) / frameRate).toFixed(2), sudden: +Math.max(0, (db(mean(i, i + f)) - db(mean(i - f, i))) / Math.max(1e-9, settles - build)).toFixed(2)};
}

/**
 * The candidates that are the same beat at another level: `faster` ones at about 2 or 3 times `bpm`, or (faster false)
 * slower ones at about ½ or ⅓ of it — within `within` of an octave. A slower one is the autocorrelation's echo of any
 * steady pulse (a beat every period also recurs every two); a faster one may be the beat itself, heard at half speed.
 */
export function metricalRelatives(bpm, candidates, {faster = true, within = .04} = {}) {
  const ratios = faster ? [2, 3] : [1 / 2, 1 / 3];
  return candidates.filter(c => ratios.some(k => Math.abs(Math.log2(c.bpm / bpm) - Math.log2(k)) <= within));
}

/**
 * How full the beats in between are: the onset envelope's peak (within 23 ms) at the k − 1 points that split each gap
 * between consecutive beats into k, against its peak at the beats, as a ratio of their means. Near 1, onsets fill the
 * beats in between (the faster level is the beat); near 0, the beats stand alone.
 */
export function betweenSupport(envelope, frameRate, times, k) {
  if (times.length < 2 || !(k >= 2)) return 0;
  const at = t => nearMax(envelope, Math.round(t * frameRate), 2);
  let on = 0, between = 0, n = 0;
  for (let i = 1; i < times.length; i++) {
    on += at(times[i - 1]);
    for (let j = 1; j < k; j++) { between += at(times[i - 1] + (times[i] - times[i - 1]) * j / k); n++; }
  }
  return on > 0 ? (between / n) / (on / (times.length - 1)) : 0;
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
