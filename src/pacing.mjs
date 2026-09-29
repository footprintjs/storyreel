/**
 * Narration pacing: short holds of silence inserted BETWEEN words, plus a
 * settling tail at each scene end. The approved words are untouched; only the
 * gaps between them grow. Every hold is recorded, and the token timings are
 * shifted by exactly the inserted samples, so captions and visual cues stay
 * on the same measured clock.
 *
 * binding.pacing = {voiceSpeed, sceneTail, holds: [{scene, after, seconds}], tails?: {sceneId: seconds}}
 *   after = a phrase of that scene's narration; the hold goes in the pause after it.
 *   tails = a longer settle for one scene (the silence a transition to the next scene plays over).
 */
import {readFile, writeFile, copyFile, access} from 'node:fs/promises';
import path from 'node:path';
import {speechIndex, phraseMatches} from './clock.mjs';

const FADE = .015; // seconds of fade either side of an insertion (no clicks)

export function validatePacing(pacing, board) {
  if (pacing === undefined) return null;
  if (!pacing || typeof pacing !== 'object' || Array.isArray(pacing)) throw new TypeError('pacing must be an object');
  for (const key of Object.keys(pacing)) if (!['voiceSpeed', 'sceneTail', 'holds', 'tails'].includes(key)) throw new TypeError(`pacing has unsupported key ${key}`);
  if (!(pacing.voiceSpeed >= .8 && pacing.voiceSpeed <= 1.1)) throw new RangeError('pacing.voiceSpeed must be between 0.8 and 1.1');
  if (!(pacing.sceneTail >= .3 && pacing.sceneTail <= 3)) throw new RangeError('pacing.sceneTail must be between 0.3 and 3 seconds');
  if (!Array.isArray(pacing.holds) || pacing.holds.length > 120) throw new TypeError('pacing.holds must list at most 120 holds');
  for (const [i, hold] of pacing.holds.entries()) {
    if (!hold || typeof hold !== 'object') throw new TypeError(`holds[${i}] must be an object`);
    for (const key of Object.keys(hold)) if (!['scene', 'after', 'seconds'].includes(key)) throw new TypeError(`holds[${i}] has unsupported key ${key}`);
    // Up to 6 s: a pause-and-guess for young children waits that long.
    if (!(hold.seconds >= .1 && hold.seconds <= 6)) throw new RangeError(`holds[${i}].seconds must be between 0.1 and 6`);
    if (typeof hold.after !== 'string' || !hold.after.trim()) throw new TypeError(`holds[${i}].after must be a phrase`);
    const scene = board?.scenes.find(s => s.id === hold.scene);
    if (board && !scene) throw new TypeError(`holds[${i}].scene is not a storyboard scene`);
  }
  if (pacing.tails !== undefined) {
    if (!pacing.tails || typeof pacing.tails !== 'object' || Array.isArray(pacing.tails)) throw new TypeError('pacing.tails must be an object of scene id → seconds');
    for (const [id, seconds] of Object.entries(pacing.tails)) {
      if (!(seconds >= .3 && seconds <= 8)) throw new RangeError(`pacing.tails.${id} must be between 0.3 and 8 seconds`);
      if (board && !board.scenes.some(s => s.id === id)) throw new TypeError(`pacing.tails.${id} is not a storyboard scene`);
    }
  }
  return pacing;
}
/** The settle after a scene's last word: its own tail if the binding gives one, else the shared one. */
export const tailFor = (pacing, sceneId) => pacing.tails?.[sceneId] ?? pacing.sceneTail;

/** Minimal PCM16 mono WAV reader/writer for the synthesizer's output. */
function readPcm16(buffer) {
  let at = 12, fmt, data;
  while (at + 8 <= buffer.length) {
    const id = buffer.toString('ascii', at, at + 4), size = buffer.readUInt32LE(at + 4);
    if (id === 'fmt ') fmt = {format: buffer.readUInt16LE(at + 8), channels: buffer.readUInt16LE(at + 10), rate: buffer.readUInt32LE(at + 12), bits: buffer.readUInt16LE(at + 22)};
    if (id === 'data') data = buffer.subarray(at + 8, at + 8 + size);
    at += 8 + size + (size % 2);
  }
  if (!fmt || !data || fmt.format !== 1 || fmt.channels !== 1 || fmt.bits !== 16) throw new Error('Pacing expects mono PCM16 narration');
  const samples = new Int16Array(data.length / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = data.readInt16LE(i * 2);
  return {rate: fmt.rate, samples};
}
function writePcm16({rate, samples}) {
  const header = Buffer.alloc(44), body = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) body.writeInt16LE(samples[i], i * 2);
  header.write('RIFF', 0, 'ascii'); header.writeUInt32LE(36 + body.length, 4); header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii'); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii'); header.writeUInt32LE(body.length, 40);
  return Buffer.concat([header, body]);
}

/**
 * The quietest 10 ms inside [from, to] seconds — where a pause is least audible. Never past `to`
 * (the next word's start): a pause cut into the next word would leave that word's time unshifted.
 */
function quietestPoint({rate, samples}, from, to) {
  const win = Math.max(1, Math.round(rate * .01)), a = Math.floor(from * rate), b = Math.max(a + 1, Math.floor(to * rate) - win);
  let best = a, bestEnergy = Infinity;
  for (let i = a; i <= b; i += Math.max(1, win >> 2)) {
    let e = 0; for (let j = i; j < Math.min(samples.length, i + win); j++) e += samples[j] * samples[j];
    if (e < bestEnergy) { bestEnergy = e; best = i + (win >> 1); }
  }
  const hi = Math.floor(to * rate), lo = Math.min(Math.floor(from * rate), hi);
  return Math.min(samples.length, Math.max(0, lo, Math.min(hi, best)));
}

/**
 * Plan (pure): where each hold goes, in samples, for one scene.
 * Returns [{after, seconds, sample, time}] sorted by time; throws on an unmatched phrase.
 */
export function planHolds(scene, timing, holds, wav) {
  const speech = speechIndex(scene, timing);
  if (!speech) throw new Error(`Pacing needs complete token timings for ${scene.id}`);
  return holds.filter(h => h.scene === scene.id).map(hold => {
    const match = phraseMatches(speech, hold.after)[0];
    if (!match) throw new Error(`Pacing phrase not found in ${scene.id}: "${hold.after}"`);
    const next = timing.words.find(w => w.start >= match.end - 1e-6 && w.text.replace(/[^\p{L}\p{N}]/gu, ''));
    const sample = quietestPoint(wav, match.end, next ? next.start : Math.min(timing.duration, match.end + .2));
    return {after: hold.after, seconds: hold.seconds, sample, time: sample / wav.rate};
  }).sort((a, b) => a.sample - b.sample);
}

/** Insert silence (with short fades) at planned points and extend the tail. Pure on arrays. */
export function applyHolds(wav, plan, tailSamples) {
  const extra = plan.reduce((n, h) => n + Math.round(h.seconds * wav.rate), 0);
  const out = new Int16Array(wav.samples.length + extra + tailSamples);
  const fade = Math.round(FADE * wav.rate);
  let src = 0, dst = 0;
  for (const hold of plan) {
    const copy = wav.samples.subarray(src, hold.sample);
    out.set(copy, dst);
    for (let k = 0; k < Math.min(fade, copy.length); k++) out[dst + copy.length - 1 - k] = Math.round(out[dst + copy.length - 1 - k] * (k / fade));
    dst += copy.length; src = hold.sample;
    dst += Math.round(hold.seconds * wav.rate);
    for (let k = 0; k < fade && src + k < wav.samples.length; k++) wav.samples[src + k] = Math.round(wav.samples[src + k] * (k / fade));
  }
  out.set(wav.samples.subarray(src), dst);
  return {rate: wav.rate, samples: out};
}

/** Shift token timings by the holds inserted before each token. */
export function shiftWords(words, plan) {
  return words.map(w => {
    const before = plan.filter(h => h.time <= w.start + 1e-9).reduce((n, h) => n + h.seconds, 0);
    return {...w, start: +(w.start + before).toFixed(5), end: +(w.end + before).toFixed(5)};
  });
}

/**
 * Pace word timings without audio (a silent cut): each hold shifts the words after its phrase,
 * and each scene ends its tail after its last word — the same holds and tails a voiced cut gets,
 * so a picture that waits on a pause (a pause-and-guess) waits in the silent cut too. Pure.
 */
export function paceTimings(board, timings, pacing) {
  validatePacing({voiceSpeed: 1, ...pacing}, board);
  const scenes = board.scenes.map((scene, index) => {
    const timing = timings.scenes[index];
    if (timing?.id !== scene.id) throw new Error('Pacing scene identity mismatch');
    const speech = speechIndex(scene, timing);
    if (!speech) throw new Error(`Pacing needs complete word timings for ${scene.id}`);
    const plan = pacing.holds.filter(h => h.scene === scene.id).map(hold => {
      const match = phraseMatches(speech, hold.after)[0];
      if (!match) throw new Error(`Pacing phrase not found in ${scene.id}: "${hold.after}"`);
      return {after: hold.after, seconds: hold.seconds, time: match.end};
    }).sort((a, b) => a.time - b.time);
    // Like applyPacing: the last word's end plus EVERY hold (one after the last phrase shifts no word) plus the tail.
    const words = shiftWords(timing.words, plan), last = timing.words.filter(w => w.text.replace(/[^\p{L}\p{N}]/gu, '')).at(-1).end;
    return {...timing, words, duration: +(last + plan.reduce((n, h) => n + h.seconds, 0) + tailFor(pacing, scene.id)).toFixed(5),
      pacing: {holds: plan.map(({after, seconds, time}) => ({after, seconds, at: +time.toFixed(3)})), sceneTail: tailFor(pacing, scene.id), method: 'silent cut: word times shifted by each hold; no audio'}};
  });
  return {...timings, scenes, pacing: {sceneTail: pacing.sceneTail, holds: pacing.holds.length, silent: true}};
}

/**
 * Apply pacing to a run's narration in place (the unpaced WAV is kept beside it).
 * Mutates and returns `timings` with shifted words, new durations and a pacing record.
 */
export async function applyPacing({runDir, board, timings, pacing}) {
  validatePacing(pacing, board);
  const records = [];
  for (const [index, scene] of board.scenes.entries()) {
    const timing = timings.scenes[index];
    if (timing.id !== scene.id) throw new Error('Pacing scene identity mismatch');
    const file = path.join(runDir, timing.audio), original = file.replace(/\.wav$/, '.unpaced.wav');
    await access(original).then(() => { throw new Error(`Pacing already applied to ${scene.id}`); }, () => {});
    const wav = readPcm16(await readFile(file));
    const plan = planHolds(scene, timing, pacing.holds, wav);
    const lastWord = timing.words.filter(w => w.text.replace(/[^\p{L}\p{N}]/gu, '')).at(-1).end;
    const shiftedLast = lastWord + plan.reduce((n, h) => n + h.seconds, 0);
    const bodySamples = wav.samples.length + plan.reduce((n, h) => n + Math.round(h.seconds * wav.rate), 0);
    const tailSamples = Math.max(0, Math.round((shiftedLast + tailFor(pacing, scene.id)) * wav.rate) - bodySamples);
    const paced = applyHolds({rate: wav.rate, samples: Int16Array.from(wav.samples)}, plan, tailSamples);
    await copyFile(file, original);
    await writeFile(file, writePcm16(paced));
    const before = timing.duration;
    timing.words = shiftWords(timing.words, plan);
    timing.duration = +(paced.samples.length / wav.rate).toFixed(5);
    timing.pacing = {holds: plan.map(({after, seconds, time}) => ({after, seconds, at: +time.toFixed(3)})),
      sceneTail: tailFor(pacing, scene.id), unpacedDuration: before, unpacedAudio: path.relative(runDir, original), method: 'silence inserted at the quietest 10 ms between words; 15 ms fades; token timings shifted by the inserted samples'};
    records.push({scene: scene.id, before, after: timing.duration, holds: plan.length});
  }
  timings.pacing = {voiceSpeed: pacing.voiceSpeed, sceneTail: pacing.sceneTail, scenes: records};
  return timings;
}
