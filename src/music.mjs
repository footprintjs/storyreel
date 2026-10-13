/**
 * Music under a film, cut on its beat. fitToMusic moves each scene start (a cut, and the transition anchored on it)
 * onto the nearest beat within a tolerance — never by more, and never past a spoken word — and can start the song so
 * its drop lands on a key moment of the film. It changes only the scenes' lengths (the silence after a scene's last
 * word), so every word, beat and drawing keeps its place inside its scene. It is a footprintjs flowchart: each cut's
 * verdict (moved onto a beat, already on one, held by the drop, kept because no beat is near, kept because every near
 * beat would cut into a word) is decide() evidence in its record. The song itself is a beat map (beats.mjs).
 */
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {flowChart, narrative, decide} from 'footprintjs';
import {makeClock} from './clock.mjs';
import {firstAtOrAfter} from './dsp.mjs';
import {hashOf, hashBytes} from './hash.mjs';
import {QUIET} from './record.mjs';

/**
 * The music's rules. tolerance: the most a cut moves against the song (seconds, by default). clear: the silence a
 * shortened scene keeps after its last word. gain: the song's level under the voice (0..1 of its own). fadeOut: the
 * seconds the song fades over at the film's end. onBeat: closer than this, a cut is already on its beat.
 */
export const MUSIC = Object.freeze({tolerance: .15, clear: .1, gain: .2, fadeOut: 1.5, onBeat: .001});
const MUSIC_KEYS = ['file', 'gain', 'snap', 'dropOn', 'bpm', 'drop', 'fadeOut'];
const PLACE_KEYS = ['file', 'start', 'gain', 'fadeOut'];

const round = (v, places = 5) => +v.toFixed(places);
/** A scene's last word (or direction) end on its own clock, 0 for a scene with none. */
const lastWordEnd = timing => (timing.words ?? []).filter(w => w.text.replace(/[^\p{L}\p{N}]/gu, '')).at(-1)?.end ?? 0;

/** The snap option: false (no cut moves), true (the default tolerance) or {tolerance} (seconds, 0.01–0.5). */
function readSnap(snap, who) {
  if (snap === undefined || snap === false) return null;
  if (snap === true) return {tolerance: MUSIC.tolerance};
  if (!snap || typeof snap !== 'object' || Array.isArray(snap)) throw new Error(`${who}: snap is true, false or {tolerance} (the most a cut moves, seconds), not ${JSON.stringify(snap)}`);
  for (const key of Object.keys(snap)) if (key !== 'tolerance') throw new Error(`${who}: snap takes {tolerance} (the most a cut moves, seconds), not ${key}`);
  const tolerance = snap.tolerance ?? MUSIC.tolerance;
  if (!(typeof tolerance === 'number' && tolerance >= .01 && tolerance <= .5)) throw new Error(`${who}: snap.tolerance is the most a cut moves, 0.01–0.5 seconds, not ${JSON.stringify(tolerance)}`);
  return {tolerance};
}

/** A gain (0..1 of the song's own level) and a fade (0–10 s), checked. */
function readLevel({gain = MUSIC.gain, fadeOut = MUSIC.fadeOut}, who) {
  if (!(typeof gain === 'number' && gain >= 0 && gain <= 1)) throw new Error(`${who}: gain is the song's level under the voice, 0..1 of its own (${MUSIC.gain} by default), not ${JSON.stringify(gain)}`);
  if (!(typeof fadeOut === 'number' && fadeOut >= 0 && fadeOut <= 10)) throw new Error(`${who}: fadeOut is the seconds the song fades over at the film's end, 0–10, not ${JSON.stringify(fadeOut)}`);
  return {gain, fadeOut};
}

/** A song file that exists, or a refusal naming it. */
function songFile(file, who) {
  if (typeof file !== 'string' || !file.trim()) throw new Error(`${who}: file is the song (any audio FFmpeg reads), e.g. "music/theme.mp3"`);
  if (!existsSync(file)) throw new Error(`${who}: there is no song at ${file}`);
  return file;
}

/**
 * makeFilm's `music`, checked: {file, gain?, snap?, dropOn?, bpm?, drop?, fadeOut?}. dropOn is a moment of the film,
 * named as every key is (["scene", "phrase", plus?]); bpm and drop override the beat map's. An unknown key refuses.
 */
export function readMusic(music) {
  const who = 'music';
  if (!music || typeof music !== 'object' || Array.isArray(music)) throw new Error(`${who} must be {file, gain?, snap?, dropOn?, bpm?, drop?, fadeOut?}`);
  for (const key of Object.keys(music)) if (!MUSIC_KEYS.includes(key)) throw new Error(`${who}: ${key} is not a key; music takes ${MUSIC_KEYS.join(', ')}`);
  const {dropOn = null, bpm, drop} = music;
  if (dropOn !== null && !(Array.isArray(dropOn) && typeof dropOn[0] === 'string' && typeof dropOn[1] === 'string' && (dropOn[2] === undefined || typeof dropOn[2] === 'number'))) throw new Error(`${who}: dropOn names the moment the drop lands on, as a key does: ["scene", "phrase", plus?], not ${JSON.stringify(dropOn)}`);
  return {file: songFile(music.file, who), ...readLevel(music, who), snap: readSnap(music.snap, who), dropOn, beats: {...(bpm !== undefined ? {bpm} : {}), ...(drop !== undefined ? {drop} : {})}};
}

/** What the music adds to what a film is made from (an approval locks it): the song's bytes and every setting. */
export const musicHash = song => hashOf({song: hashBytes(readFileSync(song.file)), gain: song.gain, fadeOut: song.fadeOut, snap: song.snap, dropOn: song.dropOn, beats: song.beats});

/**
 * renderFilm's `music`: where the song plays on the film clock, checked. {file, start?, gain?, fadeOut?}: the song's
 * first second plays at film second `start` (0 by default; a negative start begins the song that far in).
 */
export function readSongPlacement(music) {
  const who = 'renderFilm music';
  if (!music || typeof music !== 'object' || Array.isArray(music)) throw new Error(`${who} must be {file, start?, gain?, fadeOut?}`);
  for (const key of Object.keys(music)) if (!PLACE_KEYS.includes(key)) throw new Error(`${who}: ${key} is not a key; it takes ${PLACE_KEYS.join(', ')}`);
  const start = music.start ?? 0;
  if (!(typeof start === 'number' && Number.isFinite(start))) throw new Error(`${who}: start is the film second the song's first second plays at (negative: the song begins that far in), not ${JSON.stringify(start)}`);
  return {file: songFile(music.file, who), start, ...readLevel(music, who)};
}

/** The beat in an ascending list nearest t, or null. */
const nearestOf = (beats, t) => { const i = firstAtOrAfter(beats, t), a = beats[i - 1], b = beats[i]; return a === undefined ? b ?? null : b === undefined ? a : t - a <= b - t ? a : b; };

/** Where the scenes start on the film clock, from their lengths. */
const offsetsOf = durations => durations.reduce((out, d, i) => (out.push(i ? out[i - 1] + durations[i - 1] : 0), out), []);

/**
 * One cut's choices against the song: every beat within the tolerance, nearest first, each with the scene the move
 * shortens (or null) and whether that scene keeps its words. A cut after the anchor scene moves by lengthening or
 * shortening the scene before it; a cut before it (the drop holds the anchor scene), the scene after it.
 */
function choicesFor(work, i) {
  const at = offsetsOf(work.durations)[i] - work.songStart(), {tolerance} = work.snap;
  const from = firstAtOrAfter(work.beats, at - tolerance - 1e-9), choices = [];
  for (let j = from; j < work.beats.length && work.beats[j] <= at + tolerance + 1e-9; j++) {
    const by = work.beats[j] - at, after = i > work.anchor;
    const shortens = after ? (by < 0 ? i - 1 : null) : (by > 0 ? i : null), next = shortens === null ? null : work.durations[shortens] - Math.abs(by);
    choices.push({beat: work.beats[j], by, shortens, keeps: shortens === null || next >= work.floor[shortens] - 1e-9});
  }
  return {at, choices: choices.sort((a, b) => Math.abs(a.by) - Math.abs(b.by))};
}

/**
 * Fit a film to a song. timings: the paced timings; beats: a beat map (beats.mjs · beatMap: its `beats` and `drop`, on
 * the song's clock); snap: true, false or {tolerance}; dropOn: a key (["scene", "phrase", plus?]) the song's drop lands
 * on, or null (the song starts with the film). Returns {timings (the scenes' lengths changed), start (the film second
 * the song's first second plays at), cuts: [{scene, verdict, by, beat, at, why}], record}.
 */
export async function fitToMusic({storyboard, timings, beats, snap = true, dropOn = null}) {
  const snapping = readSnap(snap, 'fitToMusic'), rule = snapping ?? {tolerance: 0};
  if (!Array.isArray(beats?.beats)) throw new Error('fitToMusic: beats is the song\'s beat map (beatMap(file)), with its beats in seconds');
  if (timings?.scenes?.length !== storyboard?.scenes?.length) throw new Error('fitToMusic: give the storyboard and its paced timings, one timing per scene');
  const ids = storyboard.scenes.map(s => s.id);
  const work = {ids, snap: rule, beats: [...beats.beats], durations: timings.scenes.map(s => s.duration), queue: [], cuts: [], anchor: 0, key: null};
  // A shortened scene keeps its last word and the silence after it; the anchor scene also keeps its key moment.
  work.floor = timings.scenes.map(s => lastWordEnd(s) + MUSIC.clear);
  work.songStart = () => (work.key === null ? 0 : offsetsOf(work.durations)[work.anchor] + work.key - beats.drop);
  const chart = flowChart('read-cuts', s => {
    s.scenes = ids.length; s.tolerance = rule.tolerance; s.snap = snapping !== null;
    s.dropOn = dropOn; s.songDrop = beats.drop ?? null;
    if (dropOn !== null) {
      if (beats.drop === null || beats.drop === undefined) throw new Error(`fitToMusic: dropOn needs the song's drop, and the beat map found none (nothing rises and holds after a quieter build): give the drop, music.drop (the second the song drops)`);
      const clock = makeClock(storyboard, timings), at = clock.at(dropOn), {index, time} = clock.locate(at);
      work.anchor = index; work.key = time; work.floor[index] = Math.max(work.floor[index], time + MUSIC.clear);
      s.key = round(at, 3);
    } else s.key = null;
  }, 'read-cuts', 'The cuts (each scene start after the first) and the key moment, if the drop lands on one')
    .addDeciderFunction('place-song', s => decide(s, [
      {when: s => s.dropOn !== null && s.songDrop !== null, then: 'drop-on-key', label: 'The song starts so its drop lands on the key moment'},
    ], {branch: 'with-film', label: 'The song starts with the film'}), 'place-song', 'Where the song starts')
    .addFunctionBranch('drop-on-key', 'drop-on-key', s => {
      // The anchor scene is held; the cuts after it are fitted forward, then the ones before it backward from it.
      const n = ids.length, a = work.anchor;
      work.queue = s.snap ? [...(a > 0 ? [a] : []), ...Array.from({length: n - 1 - a}, (_, k) => a + 1 + k), ...Array.from({length: Math.max(0, a - 1)}, (_, k) => a - 1 - k)] : [];
      s.anchor = ids[a];
    }, 'the drop holds its scene')
    .addFunctionBranch('with-film', 'with-film', s => { work.queue = s.snap ? ids.slice(1).map((_, k) => k + 1) : []; s.anchor = ids[0]; }, 'the film start holds')
    .end()
    .addFunction('next-cut', s => {
      const i = work.queue.shift();
      work.current = i ?? null;
      if (i === undefined) { s.cut = null; return; }
      const {at, choices} = choicesFor(work, i);
      work.choices = choices;
      s.cut = ids[i]; s.held = work.key !== null && i === work.anchor; s.at = round(at, 3);
      s.offBy = choices.length ? round(Math.abs(choices[0].by), 4) : null; s.within = choices.length; s.keepWords = choices.filter(c => c.keeps).length;
    }, 'next-cut', 'The next cut, against the beats near it')
    .addDeciderFunction('snap-cut', s => decide(s, [
      {when: s => s.cut === null, then: 'done', label: 'Every cut is fitted'},
      {when: s => s.held === true, then: 'held', label: 'The drop holds this scene: its start is where the key moment puts it'},
      {when: s => s.offBy !== null && s.offBy <= MUSIC.onBeat, then: 'on-beat', label: 'Already on a beat'},
      {when: s => s.keepWords > 0, then: 'move', label: 'A beat within the tolerance, and the move cuts no word'},
      {when: s => s.within > 0, then: 'keep-word', label: 'Every beat within the tolerance would cut into a spoken word'},
    ], {branch: 'keep-far', label: 'No beat within the tolerance'}), 'snap-cut', 'Each cut onto a beat, or why not')
    .addFunctionBranch('done', 'done', s => { s.fitted = work.cuts.length; }, 'every cut fitted')
    .addFunctionBranch('held', 'held', () => note(work, 'held', null, 'the drop holds this scene'), 'held by the drop', {loopTo: 'next-cut'})
    .addFunctionBranch('on-beat', 'on-beat', () => note(work, 'on-beat', work.choices[0], 'already on a beat'), 'already on a beat', {loopTo: 'next-cut'})
    .addFunctionBranch('move', 'move', s => { const c = work.choices.find(x => x.keeps); move(work, c); s.moved = round(c.by, 4); }, 'moved onto a beat', {loopTo: 'next-cut'})
    .addFunctionBranch('keep-word', 'keep-word', () => note(work, 'kept', null, 'every beat within the tolerance would cut into a spoken word'), 'kept: a word', {loopTo: 'next-cut'})
    .addFunctionBranch('keep-far', 'keep-far', () => note(work, 'kept', null, 'no beat within the tolerance'), 'kept: no beat near', {loopTo: 'next-cut'})
    .end()
    .addFunction('fitted', s => {
      s.start = round(work.songStart(), 4); s.moved = work.cuts.filter(c => c.verdict === 'moved').length;
      s.seconds = round(work.durations.reduce((a, d) => a + d, 0), 3);
    }, 'fitted', 'The film\'s new lengths and where the song starts');
  const trace = narrative();
  await chart.setLogger(QUIET).build().recorder(trace).run();
  const offsets = offsetsOf(work.durations);
  const cuts = work.cuts.sort((a, b) => a.index - b.index).map(({index, ...c}) => ({...c, at: round(offsets[index], 4)}));
  return {timings: {...timings, scenes: timings.scenes.map((t, i) => (work.durations[i] === t.duration ? t : {...t, duration: round(work.durations[i])}))},
    start: round(work.songStart(), 5), cuts, record: trace.getEntries()};
}

/** Write a cut's verdict down: the scene, what happened, by how much it moved against the song, the beat it is on. */
function note(work, verdict, choice, why) {
  work.cuts.push({scene: work.ids[work.current], index: work.current, verdict, by: choice && verdict === 'moved' ? round(choice.by, 4) : 0, beat: choice ? choice.beat : null, why});
}

/** Move a cut onto a beat: the scene before it (after the anchor) or after it (before the anchor) changes its length. */
function move(work, choice) {
  const i = work.current;
  if (i > work.anchor) work.durations[i - 1] += choice.by; else work.durations[i] -= choice.by;
  note(work, 'moved', choice, choice.shortens === null ? 'onto the nearest beat, adding silence' : 'onto the nearest beat, shortening the silence after a scene\'s last word');
}

/** A 16-bit PCM WAV, read: its rate, its channels and its sample frames (the bytes after the header). */
function readWav(bytes, name) {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`music: ${name} is not a WAV file`);
  let at = 12, fmt = null, data = null;
  while (at + 8 <= bytes.length) {
    const id = bytes.toString('ascii', at, at + 4), size = bytes.readUInt32LE(at + 4);
    if (id === 'fmt ') fmt = {format: bytes.readUInt16LE(at + 8), channels: bytes.readUInt16LE(at + 10), rate: bytes.readUInt32LE(at + 12), bits: bytes.readUInt16LE(at + 22)};
    if (id === 'data') data = bytes.subarray(at + 8, Math.min(bytes.length, at + 8 + size));
    at += 8 + size + (size % 2);
  }
  if (!fmt || !data || ![1, 0xfffe].includes(fmt.format) || fmt.bits !== 16) throw new Error(`music: ${name} must be a 16-bit PCM WAV for its scene to be cut to the beat (as pacing needs): convert the voice, or leave snap out`);
  return {...fmt, frame: 2 * fmt.channels, data};
}

/** A 16-bit PCM WAV of these sample frames, its header canonical. */
function writeWav({rate, channels}, data) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii'); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii'); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2 * channels, 28); header.writeUInt16LE(2 * channels, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii'); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Seconds of fade at a cut-short end (no click where the silence after the last word is cut). */
const FADE = .01;

/**
 * A voiced cut fitted to the song: each scene whose length fitToMusic changed has its audio (in runDir, the run's copy
 * of the voice — never the voice folder itself) padded with silence or cut short to match, by whole sample frames, a
 * cut-short end faded over 10 ms; its length is then exactly its audio's. before: the timings fitToMusic was given;
 * after: what it returned. Returns the timings to render with.
 */
export function fitVoice(runDir, before, after) {
  return {...after, scenes: after.scenes.map((t, i) => {
    const was = before.scenes[i];
    if (t.duration === was.duration || !t.audio) return t;
    const file = path.join(runDir, t.audio), wav = readWav(readFileSync(file), t.audio), frames = wav.data.length / wav.frame;
    const keep = Math.max(0, frames + Math.round((t.duration - was.duration) * wav.rate)), out = Buffer.alloc(keep * wav.frame);
    wav.data.copy(out, 0, 0, Math.min(wav.data.length, out.length));
    if (keep < frames) {
      const fade = Math.min(keep, Math.round(FADE * wav.rate));
      for (let k = 0; k < fade; k++) for (let c = 0; c < wav.channels; c++) { const at = (keep - 1 - k) * wav.frame + 2 * c; out.writeInt16LE(Math.round(out.readInt16LE(at) * k / fade), at); }
    }
    writeFileSync(file, writeWav(wav, out));
    return {...t, duration: round(was.duration + (keep - frames) / wav.rate)};
  })};
}
