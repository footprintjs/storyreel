// Songs made sample by sample for the beat map's tests (beats.test.mjs, music.test.mjs): every beat, bar and drop known
// exactly, written as 16-bit PCM WAV. No downloaded audio.
import {writeFileSync} from 'node:fs';

/** A deterministic noise source (the same song every run). */
export const noiseFrom = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 31 - 1; };

/**
 * A song: `count` beats at `bpm` from `lead` seconds — a click on every beat, a 60 Hz kick on beat `one` of each bar —
 * quiet until beat `dropAt` (when given), then loud: a louder kick, a bass note on every beat and a wash of noise. The
 * truth comes back with it: every beat, every bar, the drop.
 */
export function song({bpm, count = 40, dropAt = null, one = 1, lead = .3, tail = 1, rate = 44100}) {
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
