// Songs made sample by sample for the beat map's tests (beats.test.mjs, music.test.mjs): every beat, bar and drop known
// exactly, written as 16-bit PCM WAV. No downloaded audio.
import {writeFileSync} from 'node:fs';

/** A deterministic noise source (the same song every run). */
export const noiseFrom = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 31 - 1; };

/**
 * A song: `count` beats at `bpm` from `lead` seconds — a click on every beat, a 60 Hz kick on beat `one` of each bar —
 * quiet until beat `dropAt` (when given), then loud: a louder kick, a bass note on every beat and a wash of noise. The
 * truth comes back with it: every beat, every bar, the drop. `envelope(t)` scales the whole song (a fade-in); `pad` is
 * the level of a chord held from the first sample.
 */
export function song({bpm, count = 40, dropAt = null, one = 1, lead = .3, tail = 1, rate = 44100, envelope = null, pad = 0}) {
  const beat = 60 / bpm, x = new Float32Array(Math.round((lead + count * beat + tail) * rate)), noise = noiseFrom(7);
  const add = (t0, seconds, f) => { const a = Math.round(t0 * rate); for (let i = 0; i < seconds * rate && a + i < x.length; i++) x[a + i] += f(i / rate); };
  const beats = [], drop = dropAt === null ? null : lead + dropAt * beat;
  for (let k = 0; k < count; k++) {
    const t = lead + k * beat, loud = drop !== null && k >= dropAt;
    beats.push(t);
    add(t, .02, a => (loud ? .3 : .15) * Math.exp(-a * 300) * Math.sin(2 * Math.PI * 3000 * a));
    if (k % 4 === one) add(t, .15, a => (loud ? .6 : .2) * Math.exp(-a * 25) * Math.sin(2 * Math.PI * 60 * a));
    if (loud) add(t, .25, a => .25 * Math.exp(-a * 8) * Math.sin(2 * Math.PI * 110 * a));
  }
  for (let i = 0; i < x.length; i++) x[i] += (drop !== null && i / rate >= drop ? .08 : .005) * noise();
  // A held pad from the very first sample (a chord under everything): sound at sample 0 that is not an onset.
  if (pad) for (let i = 0; i < x.length; i++) x[i] += pad * (Math.sin(2 * Math.PI * 220 * i / rate) + .5 * Math.sin(2 * Math.PI * 330 * i / rate));
  // A level over the whole song (a fade-in, say): gain at each second.
  if (envelope) for (let i = 0; i < x.length; i++) x[i] *= envelope(i / rate);
  return {samples: x, rate, beats, bars: beats.filter((_, k) => k % 4 === one), drop};
}

/** Mono samples (-1..1) as a 16-bit PCM WAV file. */
export function wavFile(file, samples, rate) {
  const pcm = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0, 'ascii'); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8, 'ascii'); h.write('fmt ', 12, 'ascii'); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36, 'ascii'); h.writeUInt32LE(pcm.length, 40);
  writeFileSync(file, Buffer.concat([h, pcm]));
  return file;
}

/**
 * A drum pattern, the truth its quarter-note beats. kick 'backbeat': a kick on beats one and three and a snare on two
 * and four — the pattern whose kick alone repeats at half the tempo; 'four': a kick on every beat (four on the floor),
 * no snare. hats: 'eighths', 'sixteenths', or 'offbeats' (only on the "and" between beats), at `hatLevel` (0.12; a loud
 * hat is 0.35, as loud as the snare).
 */
export function groove({bpm, count = 48, lead = .25, tail = 1, rate = 22050, kick = 'backbeat', hats = 'eighths', hatLevel = .12}) {
  const beat = 60 / bpm, x = new Float32Array(Math.round((lead + count * beat + tail) * rate)), noise = noiseFrom(11);
  const add = (t0, seconds, f) => { const a = Math.round(t0 * rate); for (let i = 0; i < seconds * rate && a + i < x.length; i++) x[a + i] += f(i / rate); };
  const thump = a => .7 * Math.exp(-a * 18) * Math.sin(2 * Math.PI * (55 + 60 * Math.exp(-a * 40)) * a), snare = a => Math.exp(-a * 25) * (.35 * noise() + .25 * Math.sin(2 * Math.PI * 190 * a));
  const at = {eighths: [0, .5], sixteenths: [0, .25, .5, .75], offbeats: [.5]}[hats], beats = [];
  for (let k = 0; k < count; k++) {
    const t = lead + k * beat;
    beats.push(t);
    if (kick === 'four' || k % 2 === 0) add(t, .25, thump);
    if (kick === 'backbeat' && k % 2 === 1) add(t, .18, snare);
    for (const part of at) { let hp = 0, last = 0; add(t + part * beat, .04, a => { const n = noise(); hp = .9 * (hp + n - last); last = n; return hatLevel * Math.exp(-a * 120) * hp; }); }
  }
  for (let i = 0; i < x.length; i++) x[i] += .004 * noise();
  return {samples: x, rate, beats};
}
