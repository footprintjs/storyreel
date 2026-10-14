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

/** The drum kit, each voice a function of seconds since its hit (22050 Hz or any rate), at full level before `level`. */
const kitVoices = noise => ({
  kick: a => .7 * Math.exp(-a * 18) * Math.sin(2 * Math.PI * (55 + 60 * Math.exp(-a * 40)) * a),
  sub: a => .6 * Math.exp(-a * 4) * Math.sin(2 * Math.PI * (48 + 40 * Math.exp(-a * 30)) * a),
  snare: a => Math.exp(-a * 25) * (.35 * noise() + .25 * Math.sin(2 * Math.PI * 190 * a)),
  clap: a => (a < .03 ? Math.exp(-((a * 1000) % 10) * .4) : Math.exp(-(a - .03) * 30)) * .3 * noise(),
  rim: a => .3 * Math.exp(-a * 60) * Math.sin(2 * Math.PI * 1250 * a),
  // A kick with its beater's click: a 3 ms burst of noise across the bands on top of the body.
  punch: a => .7 * Math.exp(-a * 18) * Math.sin(2 * Math.PI * (55 + 60 * Math.exp(-a * 40)) * a) + .25 * Math.exp(-a * 300) * noise(),
  ride: a => .08 * Math.exp(-a * 6) * (Math.sin(2 * Math.PI * 3100 * a) + Math.sin(2 * Math.PI * 4700 * a) + .5 * noise()),
});
/** A plucked bass note at f0 Hz, `length` seconds: it sustains (a slow decay) and is let go over its last 10 ms. */
const bassNote = (f0, length) => a => .35 * Math.min(1, a / .005) * Math.exp(-a * 3) * Math.min(1, Math.max(0, (length - a) / .01))
  * (Math.sin(2 * Math.PI * f0 * a) + .5 * Math.sin(2 * Math.PI * 2 * f0 * a) + .25 * Math.sin(2 * Math.PI * 3 * f0 * a));
/** A held chord (three notes), `length` seconds, a soft attack: harmony, not an onset. */
const chordNote = length => a => .06 * Math.min(1, a / .03) * Math.min(1, Math.max(0, (length - a) / .03)) * [220, 277.2, 329.6].reduce((sum, f) => sum + Math.sin(2 * Math.PI * f * a), 0);
/** A high-passed noise burst (a hat): `decay` per second. */
const hatVoice = (noise, decay) => { let hp = 0, last = 0; return a => { const n = noise(); hp = .9 * (hp + n - last); last = n; return Math.exp(-a * decay) * hp; }; };

/**
 * Rhythms by family, on a grid (`grid` steps a beat: 4 sixteenths, or 3 triplet eighths) over `steps` steps (one bar
 * of four beats, or two for a clave). Each voice lists its steps, or [step, level]; `level` scales the voice. The
 * tempo corpus (test/tempo-corpus.test.mjs) plays each at seven tempi; the truth is always the quarter-note beat.
 */
const range = (n, every = 1, from = 0) => Array.from({length: Math.ceil((n - from) / every)}, (_, i) => from + i * every);
export const RHYTHMS = Object.freeze({
  // The reviewer's drum patterns (the fifty-six: eight patterns at seven tempi).
  'backbeat, eighth hats': {grid: 4, steps: 16, kick: [0, 8], snare: [4, 12], hat: range(16, 2)},
  'backbeat, sixteenth hats': {grid: 4, steps: 16, kick: [0, 8], snare: [4, 12], hat: range(16)},
  'four on the floor, off-beat hats': {grid: 4, steps: 16, kick: [0, 4, 8, 12], open: [2, 6, 10, 14]},
  'backbeat, loud hats': {grid: 4, steps: 16, kick: [0, 8], snare: [4, 12], hat: range(16, 2), level: {hat: 3}},
  'four on the floor, eighth hats': {grid: 4, steps: 16, kick: [0, 4, 8, 12], hat: range(16, 2)},
  'backbeat, ghost notes': {grid: 4, steps: 16, kick: [0, 8], snare: [4, 12, [7, .25], [9, .25], [15, .25]], hat: range(16, 2)},
  'kick and snare only': {grid: 4, steps: 16, kick: [0, 8], snare: [4, 12]},
  'backbeat, ride on the beat': {grid: 4, steps: 16, kick: [0, 8], snare: [4, 12], ride: range(16, 4)},
  // The nine families of the recheck.
  dembow: {grid: 4, steps: 16, kick: [0, 4, 8, 12], snare: [3, 6, 11, 14], hat: range(16, 2)},
  'son clave with kick': {grid: 4, steps: 32, kick: range(32, 4), rim: [0, 6, 12, 20, 24], hat: range(32, 2), level: {hat: .5}},
  'half-time shuffle': {grid: 3, steps: 12, kick: [0, 5], snare: [6, [1, .2], [4, .2], [7, .2], [10, .2]], hat: [0, 2, 3, 5, 6, 8, 9, 11]},
  'trap: rolling hats, half-time snare': {grid: 4, steps: 16, sub: [0, 7, 10], clap: [8], hat: range(16)},
  'four on the floor, club': {grid: 4, steps: 16, kick: [0, 4, 8, 12], clap: [4, 12], open: [2, 6, 10, 14], hat: range(16), level: {hat: .5}},
  breakbeat: {grid: 4, steps: 16, kick: [0, 2, 10], snare: [4, 12, [7, .3], [9, .3], [15, .3]], ride: range(16, 2)},
  'sixteenths, kick on one only': {grid: 4, steps: 16, kick: [0], hat: range(16), level: {hat: 3}},
  'bossa nova': {grid: 4, steps: 32, kick: [0, 6, 8, 14, 16, 22, 24, 30], rim: [0, 6, 12, 20, 26], hat: range(32, 2), level: {hat: .6}},
  funk: {grid: 4, steps: 16, kick: [0, 3, 10], snare: [4, 12, [7, .25], [9, .25], [14, .25]], hat: range(16), level: {hat: .8}},
  // The sets of the sixth review: a bass or a kick on the eighths, a human hand, a drifting tempo, 6/8, a pushed kick,
  // and harmony with no drums. 6/8 counts its dotted-quarter beat: three eighths a beat.
  'backbeat, eighth-note bass': {grid: 4, steps: 16, kick: [0, 8], snare: [4, 12], hat: range(16, 2), bass: range(16, 2), length: {bass: 2}},
  'eighth-note kicks, snare on 2 and 4': {grid: 4, steps: 16, kick: range(16, 2), snare: [4, 12], hat: range(16, 2)},
  'four on the floor, humanised': {grid: 4, steps: 16, kick: [0, 4, 8, 12], clap: [4, 12], open: [2, 6, 10, 14], humanise: .012},
  'backbeat, drifting tempo': {grid: 4, steps: 16, kick: [0, 8], snare: [4, 12], hat: range(16, 2), drift: .03},
  '6/8': {grid: 3, steps: 6, kick: [0], snare: [3], hat: range(6)},
  'kick on the and of two': {grid: 4, steps: 16, kick: [0, 6, 8], snare: [4, 12], hat: range(16, 2)},
  'bass on quarters with chords': {grid: 4, steps: 16, bass: range(16, 4), chord: [0, 8], length: {bass: 4, chord: 8}},
  // The seventh review: a kick (with its beater's click) and a bass both on every eighth under a snare on 2 and 4 — only
  // the backbeat names the beat.
  'kick and bass on the eighths, snare on 2 and 4': {grid: 4, steps: 16, punch: range(16, 2), bass: range(16, 2), snare: [4, 12], length: {bass: 1}, level: {punch: 2}},
  // A dotted-eighth delay on the rim and the snare: each repeat lands a sixteenth before the beat after, and rings on
  // past the song's end — the candidates can agree on an echo.
  'a dotted-eighth delay on the rim and snare': {grid: 4, steps: 16, kick: [0, 8], snare: [4, 12], rim: range(16, 4), echo: {delay: .75, gain: .7, on: ['rim', 'snare']}, level: {rim: 2}},
  // The eighth review: a song's ring-out — an 808 sub that sounds on past the last hit, a dub echo on the snare — holds
  // no beat.
  '808 sub on the quarters, snare on 2 and 4': {grid: 4, steps: 16, sub: range(16, 4), snare: [4, 12]},
  'backbeat, a dub echo on the snare': {grid: 4, steps: 16, kick: [0, 8], snare: [4, 12], hat: range(16, 2), echo: {delay: .75, gain: .5, on: ['snare']}},
  // Ill-posed: each is a pulse at more than one tempo, or on more than one phase, as much as at the true one — a snare
  // every other beat is as well a slower beat; three uneven kicks a bar fit several grids; claps alone between the beats
  // are as well on them. Kept to pin what the map says, never to be scored right or wrong.
  'snare only on 2 and 4': {grid: 4, steps: 16, snare: [4, 12]},
  'kick-only tresillo': {grid: 4, steps: 16, kick: [0, 6, 12]},
  'claps only on the off-beats': {grid: 4, steps: 16, clap: [2, 6, 10, 14]},
});
export const DRUM_PATTERNS = Object.freeze(Object.keys(RHYTHMS).slice(0, 8));
export const RHYTHM_FAMILIES = Object.freeze(Object.keys(RHYTHMS).slice(8, 17));
/** The ill-posed rhythms: no measure can tell their tempo or phase from another's (README: Known limits). */
export const ILL_POSED = Object.freeze(['snare only on 2 and 4', 'kick-only tresillo', 'claps only on the off-beats']);
export const LATER_SETS = Object.freeze(Object.keys(RHYTHMS).slice(17).filter(name => !ILL_POSED.includes(name)));

/** A rhythm from RHYTHMS at `bpm`, `bars` long; returns {samples, rate, beats} with the quarter-note beats as truth. */
export function rhythm({bpm, family, bars = 12, lead = .25, tail = 1, rate = 22050}) {
  const spec = RHYTHMS[family];
  if (!spec) throw new Error(`no rhythm "${family}"`);
  const beat = 60 / bpm, step = beat / spec.grid, noise = noiseFrom(17), jitter = noiseFrom(29), voices = kitVoices(noise);
  const patternBeats = spec.steps / spec.grid, repeats = Math.ceil(bars * 4 / patternBeats), total = repeats * spec.steps;
  // Where step n falls: evenly, or (drift) on a tempo that wanders ±drift around its mean over every 32 beats.
  const at = n => (spec.drift ? lead + beat * (n / spec.grid - spec.drift * 32 / (2 * Math.PI) * (Math.cos(2 * Math.PI * n / spec.grid / 32) - 1)) : lead + n * step);
  const x = new Float32Array(Math.round((at(total) + tail) * rate));
  const wet = new Float32Array(spec.echo ? x.length : 0);
  const add = (t0, seconds, f, gain, into = x) => { const a = Math.max(0, Math.round(t0 * rate)); for (let i = 0; i < seconds * rate && a + i < into.length; i++) into[a + i] += gain * f(i / rate); };
  const sounds = {punch: [voices.punch, .3], kick: [voices.kick, .3], sub: [voices.sub, .8], snare: [voices.snare, .2], clap: [voices.clap, .12], rim: [voices.rim, .08], ride: [voices.ride, .5],
    hat: [null, .04, 120, .12], open: [null, .15, 15, .1]};
  for (let r = 0; r < repeats; r++) for (const [voice, hits] of Object.entries(spec)) {
    if (!sounds[voice] && voice !== 'bass' && voice !== 'chord') continue;
    const [f, seconds, decay, base] = sounds[voice] ?? [], scale = (spec.level?.[voice] ?? 1) * (base ?? 1);
    for (const [index, hit] of hits.entries()) {
      const [n, level] = Array.isArray(hit) ? hit : [hit, 1], when = at(r * spec.steps + n) + (spec.humanise ? spec.humanise * jitter() : 0);
      const length = spec.length?.[voice] ? at(r * spec.steps + n + spec.length[voice]) - at(r * spec.steps + n) : seconds;
      const sound = voice === 'bass' ? bassNote(index % 4 === 2 ? 82.4 : 55, length) : voice === 'chord' ? chordNote(length) : f ?? hatVoice(noise, decay);
      add(when, length, sound, scale * level, spec.echo?.on.includes(voice) ? wet : x);
    }
  }
  // A delay (echo) on the voices `echo.on`: fed back `delay` beats later at `gain`, each repeat `gain` of the last (a
  // dotted-eighth delay is 0.75 of a beat: the first repeat of a hit on a beat lands a sixteenth before the next beat).
  if (spec.echo) { const d = Math.round(spec.echo.delay * beat * rate); for (let i = d; i < wet.length; i++) wet[i] += spec.echo.gain * wet[i - d]; for (let i = 0; i < x.length; i++) x[i] += wet[i]; }
  for (let i = 0; i < x.length; i++) x[i] += .004 * noise();
  const beats = Array.from({length: repeats * patternBeats}, (_, k) => at(k * spec.grid));
  // The true tempo is the song's own mean (a drifting tempo's is not quite the one it wanders around).
  return {samples: x, rate, beats, bpm: (beats.length - 1) * 60 / (beats.at(-1) - beats[0])};
}

/** The tempi every rhythm is played at. */
export const CORPUS_TEMPI = Object.freeze([70, 85, 95, 110, 128, 150, 172]);
/** A level that fades in over 6 s from a quiet start at 6 s; one that dips for a quiet bridge; one that fades out. */
const fadeIn = t => (t < 6 ? .05 : t < 12 ? .05 + .95 * (t - 6) / 6 : 1), bridge = t => (t > 8 && t < 12 ? .15 : 1), fadeOut = end => t => (t > end - 6 ? Math.max(.02, (end - t) / 6) : 1);

/**
 * The tempo corpus: every song the beat map's certainty is checked against (test/tempo-corpus.test.mjs), each with
 * its true tempo (the quarter-note beat), made on demand. Five groups:
 * - 'drum patterns': the eight DRUM_PATTERNS at seven tempi (56);
 * - 'rhythm families': the nine RHYTHM_FAMILIES — dembow, son clave with a kick, half-time shuffle, trap hats over a
 *   half-time snare, four on the floor, breakbeat, sixteenths with the kick on one only, bossa nova, funk — at seven
 *   tempi (63);
 * - 'bass, hands, meters and echoes': a backbeat over an eighth-note bass, eighth-note kicks with the snare on 2 and 4,
 *   four on the floor played by hand (±12 ms), a tempo drifting ±3%, 6/8 (its dotted-quarter beat), a kick on the and
 *   of two, a bass on the quarters under held chords, a kick (with its beater's click) and a bass on every eighth under
 *   a snare on 2 and 4, a dotted-eighth delay on the rim and the snare, an 808 sub on the quarters under a snare on 2 and
 *   4, a backbeat with a dub echo (0.5) on the snare — at seven tempi (77);
 * - 'ill-posed': a snare alone on 2 and 4, a kick-only tresillo, claps alone on the off-beats — at seven tempi (21),
 *   pinned only to give a recorded verdict: no measure can tell their tempo or phase (ILL_POSED);
 * - 'songs': click tracks (plain, and with a kick every fourth click), builds and drops, pads, first clicks 0–50 ms
 *   in, quiet intros, fade-ins, a quiet bridge, a fade-out (66).
 */
export function tempoCorpus() {
  const list = [], add = (group, name, bpm, make) => list.push({group, name, bpm, make});
  const groupOf = family => (DRUM_PATTERNS.includes(family) ? 'drum patterns' : RHYTHM_FAMILIES.includes(family) ? 'rhythm families' : ILL_POSED.includes(family) ? 'ill-posed' : 'bass, hands, meters and echoes');
  for (const family of Object.keys(RHYTHMS)) for (const bpm of CORPUS_TEMPI) add(groupOf(family), `${family} at ${bpm}`, bpm, () => rhythm({bpm, family}));
  const click = (name, bpm, o) => add('songs', `${name} at ${bpm}`, bpm, () => song({bpm, count: 40, rate: 22050, one: 9, ...o}));
  for (const bpm of [92, 100, 110, 123, 128, 140, 150, 160, 175, 190, 210]) { click('click track', bpm); click('click track, a kick every fourth click', bpm, {one: 1}); }
  for (const bpm of [92, 110, 123, 140, 160]) click('build and drop', bpm, {one: 1, dropAt: 16});
  for (const bpm of [150, 175]) click('build and drop, plain', bpm, {dropAt: 16});
  for (const pad of [.1, .2, .3]) for (const bpm of [92, 120, 140]) click(`clicks over a ${pad} pad`, bpm, {pad});
  for (const lead of [.008, .02, .04, .05]) for (const bpm of [92, 120, 140]) click(`first click ${lead * 1000} ms in`, bpm, {lead});
  for (const [lead, pad, bpm] of [[.02, .3, 120], [.024, .1, 92], [.03, .2, 140], [.034, .3, 120]]) click(`first click ${lead * 1000} ms in over a ${pad} pad`, bpm, {lead, pad});
  for (const intro of [12, 20, 30]) click(`a ${intro} s quiet intro`, 120, {lead: intro, count: 20});
  for (const bpm of [100, 128]) click('a fade-in', bpm, {one: 1, lead: 0, envelope: fadeIn});
  click('a quiet bridge', 120, {one: 1, envelope: bridge});
  click('a fade-out', 110, {one: 1, envelope: fadeOut(.3 + 40 * 60 / 110)});
  for (const bpm of [100, 150]) click('clicks with a kick every fourth, over a pad', bpm, {one: 1, pad: .15});
  for (const bpm of [92, 120, 140]) click('click track, a kick on the first click', bpm, {one: 0});
  return list;
}

