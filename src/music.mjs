/**
 * Music under a film, cut on its beat. fitToMusic moves each scene start (a cut, and the transition anchored on it)
 * onto the nearest beat within a tolerance and can start the song so its drop lands on a key moment of the film. It
 * changes only the scenes' lengths (the silence after a scene's last word), each scene's by at most the tolerance, so
 * every word, drawing and key keeps its place inside its scene: a scene is never made shorter than its last word, its
 * latest keyed moment or the lead of the entrance that follows it allow (fitToMusic · floorsOf). The moves add up along
 * the film; each cut's drift is recorded, and of two beats within the tolerance the one that brings the drift back is
 * taken. It is a footprintjs flowchart: each cut's verdict (moved onto a beat, already on one, held by the drop, kept
 * because no beat is near, kept because every near beat would cut into a word) is decide() evidence in its record. The
 * song itself is a beat map (beats.mjs).
 */
import {readFileSync, existsSync} from 'node:fs';
import {writeOutput, securePath} from './files.mjs';
import path from 'node:path';
import {flowChart, narrative, decide} from 'footprintjs';
import {makeClock, checkScene, spokenText} from './clock.mjs';
import {phrasesIn} from './anchors.mjs';
import {firstAtOrAfter} from './dsp.mjs';
import {hashOf, hashBytes} from './hash.mjs';
import {QUIET, plainNarrative} from './record.mjs';
import {safeBeats} from './beats.mjs';
import {readEntrance, transitionCatalog} from './transitions.mjs';

/**
 * The music's rules. tolerance: the most a scene's length changes for its cut (seconds, by default). clear: the
 * silence a shortened scene keeps after its last word or key. handOver: the seconds before a cut a hand-over on the
 * page begins (film.mjs · into: the old stage leaves 0.65 s ahead). gain: the song's level under the voice (0..1 of its
 * own). fadeOut: the seconds the song fades over at the film's end. onBeat: closer than this, a cut is already on its beat.
 */
export const MUSIC = Object.freeze({tolerance: .15, clear: .1, handOver: .65, gain: .2, fadeOut: 1.5, onBeat: .001});
const MUSIC_KEYS = ['file', 'gain', 'snap', 'dropOn', 'bpm', 'drop', 'fadeOut'];
const PLACE_KEYS = ['file', 'start', 'gain', 'fadeOut'];

const round = (v, places = 5) => +v.toFixed(places);
/** A scene's last word (or direction) end on its own clock, 0 for a scene with none. */
const lastWordEnd = timing => (timing.words ?? []).filter(w => w.text.replace(/[^\p{L}\p{N}]/gu, '')).at(-1)?.end ?? 0;

/** The snap option: false (no cut moves), true (the default tolerance) or {tolerance} (seconds, 0.01–0.5). */
function readSnap(snap, who) {
  if (snap === undefined || snap === false || snap === null) return null;
  if (snap === true) return {tolerance: MUSIC.tolerance};
  if (typeof snap !== 'object' || Array.isArray(snap)) throw new Error(`${who}: snap is true, false or {tolerance} (the most a scene's length changes, seconds), not ${JSON.stringify(snap)}`);
  for (const key of Object.keys(snap)) if (key !== 'tolerance') throw new Error(`${who}: snap takes {tolerance} (the most a scene's length changes, seconds), not ${key}`);
  const tolerance = snap.tolerance ?? MUSIC.tolerance;
  if (!(typeof tolerance === 'number' && tolerance >= .01 && tolerance <= .5)) throw new Error(`${who}: snap.tolerance is the most a scene's length changes, 0.01–0.5 seconds, not ${JSON.stringify(tolerance)}`);
  return {tolerance};
}

/** A key moment, checked: ["scene", "phrase", plus?] with a finite plus, or null. */
function readKey(key, who) {
  if (key === null || key === undefined) return null;
  if (!(Array.isArray(key) && key.length >= 2 && key.length <= 3 && typeof key[0] === 'string' && typeof key[1] === 'string' && (key[2] === undefined || Number.isFinite(key[2])))) throw new Error(`${who}: dropOn names the moment the drop lands on, as a key does: ["scene", "phrase", plus?] (plus a finite number of seconds), not ${JSON.stringify(key)}`);
  return key;
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
  if (!existsSync(file)) throw new Error(`${who}: there is no song at ${file}: give the path of a WAV or MP3 file (relative to the film's root)`);
  return file;
}

/**
 * makeFilm's `music`, checked before anything runs: {file, gain?, snap?, dropOn?, bpm?, drop?, fadeOut?}. dropOn is a
 * moment of the film, named as every key is (["scene", "phrase", plus?]); bpm (30–300) and drop (seconds into the song)
 * override the beat map's. An unknown key refuses.
 */
export function readMusic(music) {
  const who = 'music';
  if (!music || typeof music !== 'object' || Array.isArray(music)) throw new Error(`${who} must be {file, gain?, snap?, dropOn?, bpm?, drop?, fadeOut?}`);
  for (const key of Object.keys(music)) if (!MUSIC_KEYS.includes(key)) throw new Error(`${who}: ${key} is not a key; music takes ${MUSIC_KEYS.join(', ')}`);
  const {bpm, drop} = music;
  if (bpm !== undefined && !(typeof bpm === 'number' && bpm >= 30 && bpm <= 300)) throw new Error(`${who}: bpm is the song's tempo, a number 30–300 (it overrides the measured one), not ${JSON.stringify(bpm)}`);
  if (drop !== undefined && !(typeof drop === 'number' && Number.isFinite(drop) && drop >= 0)) throw new Error(`${who}: drop is the second the song drops, a number from 0 (it overrides the measured one), not ${JSON.stringify(drop)}`);
  return {file: songFile(music.file, who), ...readLevel(music, who), snap: readSnap(music.snap, who), dropOn: readKey(music.dropOn, who), beats: {...(bpm !== undefined ? {bpm} : {}), ...(drop !== undefined ? {drop} : {})}};
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

/**
 * A song that plays during none of the film refuses (it would be mixed as silence): `seconds` its length (null:
 * unknown, not checked), `start` where it begins on the film clock, `total` the film's length.
 */
export function requireOverlap({start, seconds, total, who}) {
  if (!Number.isFinite(seconds)) return;
  const heard = Math.min(total, start + seconds) - Math.max(0, start);
  if (heard > 0) return;
  throw new Error(`${who}: the song (${round(seconds, 2)} s) placed at film second ${round(start, 2)} never plays during the film (0–${round(total, 2)} s): ${start >= total ? 'start it before the film ends' : 'start it later, or give a drop and a key moment nearer the song\'s own'}`);
}

/** Where the scenes start on the film clock, from their lengths. */
const offsetsOf = durations => durations.reduce((out, d, i) => (out.push(i ? out[i - 1] + durations[i - 1] : 0), out), []);

/**
 * How far before each scene's start its picture begins to change (seconds, by scene index): a stage's entrance lead
 * (transitions.mjs · readEntrance: three quarters of its change) or, on one page, the hand-over (MUSIC.handOver); an
 * entrance left out is taken as the longer of a fade and a hand-over. The story's scenes are one world: none.
 */
function entranceLeads(recipe, kits, ids) {
  const leads = new Array(ids.length).fill(0), catalog = transitionCatalog(kits ?? []), push = Boolean(recipe?.pushIn);
  for (const spec of recipe?.stages ?? []) {
    const i = ids.indexOf(spec?.scene);
    if (i <= 0) continue;
    leads[i] = !push && spec.enter !== undefined ? readEntrance(spec.enter, `stage ${spec.scene}`, catalog).lead : Math.max(MUSIC.handOver, readEntrance(undefined, `stage ${spec.scene}`, catalog).lead);
  }
  return leads;
}

/**
 * The shortest each scene may become: its last word, and every moment the recipe keys to it (a drawing at
 * ["scene", "last phrase", 0.4] lands after the last word), then the silence kept after them — at least `clear`, and at
 * least the lead of the entrance into the next scene, which plays in this one's tail. Without a recipe, the words only.
 */
function floorsOf({storyboard, timings, recipe, kits}) {
  const ids = storyboard.scenes.map(s => s.id), latest = timings.scenes.map(lastWordEnd);
  if (recipe) {
    const clock = makeClock(storyboard, timings);
    for (const {ref: key} of phrasesIn(recipe, new Set(ids))) {
      const scene = Array.isArray(key) ? key[0] : key.scene, i = ids.indexOf(scene);
      let at; try { at = clock.at(key) - clock.start(scene); } catch { continue; }   // a phrase not said: the compile refuses it
      latest[i] = Math.max(latest[i], at);
    }
  }
  const leads = recipe ? entranceLeads(recipe, kits, ids) : ids.map(() => 0);
  return latest.map((t, i) => t + Math.max(MUSIC.clear, leads[i + 1] ?? 0));
}

/** Where cut i sits against the anchor (the film's start, or the key moment the drop holds): the frame drift is measured in. */
function againstAnchor(work, durations, i) {
  const offsets = offsetsOf(durations);
  return offsets[i] - (work.key === null ? 0 : offsets[work.anchor] + work.key);
}

/**
 * One cut's choices against the song: every beat within the tolerance, nearest first, each with the scene the move
 * shortens (or null), whether that scene keeps its floor, and the cut's drift after it. A cut after the anchor scene
 * moves by lengthening or shortening the scene before it; a cut before it (the drop holds the anchor scene), the
 * scene after it. Each scene changes for one cut only, so by at most the tolerance.
 */
function choicesFor(work, i) {
  const at = offsetsOf(work.durations)[i] - work.songStart(), {tolerance} = work.snap;
  const drift = againstAnchor(work, work.durations, i) - againstAnchor(work, work.base, i);
  const from = firstAtOrAfter(work.beats, at - tolerance - 1e-9), choices = [];
  for (let j = from; j < work.beats.length && work.beats[j] <= at + tolerance + 1e-9; j++) {
    const by = work.beats[j] - at, after = i > work.anchor;
    const shortens = after ? (by < 0 ? i - 1 : null) : (by > 0 ? i : null), next = shortens === null ? null : work.durations[shortens] - Math.abs(by);
    choices.push({beat: work.beats[j], by, shortens, keeps: shortens === null || next >= work.floor[shortens] - 1e-9, drift: drift + by});
  }
  return {at, drift, choices: choices.sort((a, b) => Math.abs(a.by) - Math.abs(b.by))};
}

/** Of the beats a cut may move to, the one that leaves the least drift (then the nearest). */
const pick = choices => choices.filter(c => c.keeps).sort((a, b) => Math.abs(a.drift) - Math.abs(b.drift) || Math.abs(a.by) - Math.abs(b.by))[0];

/**
 * Fit a film to a song. timings: the paced timings; beats: a beat map (beats.mjs · beatMap: its `beats`, `drop` and
 * `seconds`, on the song's clock); snap: false (the default: no cut moves), true or {tolerance}; dropOn: a key
 * (["scene", "phrase", plus?]) the song's drop lands on, or null (the song starts with the film); recipe and kits: the
 * film's, so no scene is made shorter than its keyed moments or the entrance after it (floorsOf). A cut lands only on
 * the beats beats.mjs · safeBeats allows: every beat of a sure map, only those every candidate shares of an unsure one.
 * Returns {timings (the scenes' lengths changed), start (the film second the song's first second plays at), cuts:
 * [{scene, verdict, by, beat, drift, at, why}], cutOn: {grid, beats, of, tempi}, record}.
 */
export async function fitToMusic({storyboard, timings, beats, snap = false, dropOn = null, recipe = null, kits = []}) {
  const snapping = readSnap(snap, 'fitToMusic'), rule = snapping ?? {tolerance: 0}, key = readKey(dropOn, 'fitToMusic');
  if (!Array.isArray(beats?.beats)) throw new Error('fitToMusic: beats is the song\'s beat map (beatMap(file)), with its beats in seconds');
  if (timings?.scenes?.length !== storyboard?.scenes?.length) throw new Error('fitToMusic: give the storyboard and its paced timings, one timing per scene');
  const ids = storyboard.scenes.map(s => s.id), durations = timings.scenes.map(s => s.duration), song = Number.isFinite(beats.seconds) ? beats.seconds : null;
  // The beats a cut may land on (beats.mjs · safeBeats): every beat of a sure map; of an unsure one, only those every
  // candidate shares — the one rule the pipeline reads too.
  const cutOn = safeBeats(beats);
  const work = {ids, snap: rule, beats: cutOn.beats, durations, base: [...durations], queue: [], cuts: [], anchor: 0, key: null};
  work.floor = floorsOf({storyboard, timings, recipe, kits});
  work.songStart = () => (work.key === null ? 0 : offsetsOf(work.durations)[work.anchor] + work.key - beats.drop);
  const chart = flowChart('read-cuts', s => {
    s.scenes = ids.length; s.tolerance = rule.tolerance; s.snap = snapping !== null;
    s.dropOn = key; s.songDrop = beats.drop ?? null; s.songSeconds = song; s.grid = cutOn.grid; s.cutBeats = cutOn.shared;
    if (key !== null) {
      if (beats.drop === null || beats.drop === undefined) throw new Error(`fitToMusic: dropOn needs the song's drop, and the beat map found none (nothing rises and holds after a quieter build): give the drop, music.drop (the second the song drops)`);
      if (song !== null && beats.drop > song) throw new Error(`fitToMusic: the song's drop (${beats.drop} s) is past its end (${song} s): give the second it drops, inside it (music.drop)`);
      const clock = makeClock(storyboard, timings), at = clock.at(key);
      if (!(at >= 0 && at <= clock.total)) throw new Error(`fitToMusic: dropOn ${JSON.stringify(key)} is at ${round(at, 3)} s, outside the film (0–${round(clock.total, 3)} s): name a moment inside it (a smaller plus)`);
      const {index, time} = clock.locate(at);
      work.anchor = index; work.key = time; work.floor[index] = Math.max(work.floor[index], time + MUSIC.clear);
      s.key = round(at, 3);
    } else s.key = null;
  }, 'read-cuts', 'The cuts (each scene start after the first), the shortest each scene may become, and the key moment, if the drop lands on one')
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
      const {at, drift, choices} = choicesFor(work, i);
      work.choices = choices; work.drift = drift;
      s.cut = ids[i]; s.held = work.key !== null && i === work.anchor; s.at = round(at, 3); s.drift = round(drift, 4);
      s.offBy = choices.length ? round(Math.abs(choices[0].by), 4) : null; s.within = choices.length; s.keepWords = choices.filter(c => c.keeps).length;
    }, 'next-cut', 'The next cut, against the beats near it, and how far the cuts before it have moved it (its drift)')
    .addDeciderFunction('snap-cut', s => decide(s, [
      {when: s => s.cut === null, then: 'done', label: 'Every cut is fitted'},
      {when: s => s.held === true, then: 'held', label: 'The drop holds this scene: its start is where the key moment puts it'},
      {when: s => s.offBy !== null && s.offBy <= MUSIC.onBeat, then: 'on-beat', label: 'Already on a beat'},
      {when: s => s.keepWords > 0, then: 'move', label: 'A beat within the tolerance that keeps every scene\'s words and keys (of two, the one that brings the drift back)'},
      {when: s => s.within > 0, then: 'keep-word', label: 'Every beat within the tolerance would cut into a scene\'s words, keys or the entrance after it'},
    ], {branch: 'keep-far', label: 'No beat within the tolerance'}), 'snap-cut', 'Each cut onto a beat, or why not')
    .addFunctionBranch('done', 'done', s => { s.fitted = work.cuts.length; }, 'every cut fitted')
    .addFunctionBranch('held', 'held', () => note(work, 'held', null, 'the drop holds this scene'), 'held by the drop', {loopTo: 'next-cut'})
    .addFunctionBranch('on-beat', 'on-beat', () => note(work, 'on-beat', work.choices[0], 'already on a beat'), 'already on a beat', {loopTo: 'next-cut'})
    .addFunctionBranch('move', 'move', s => { const c = pick(work.choices); move(work, c); s.moved = round(c.by, 4); s.drift = round(c.drift, 4); }, 'moved onto a beat', {loopTo: 'next-cut'})
    .addFunctionBranch('keep-word', 'keep-word', () => note(work, 'kept', null, 'every beat within the tolerance would cut into a scene\'s words, keys or the entrance after it'), 'kept: a word', {loopTo: 'next-cut'})
    .addFunctionBranch('keep-far', 'keep-far', () => note(work, 'kept', null, 'no beat within the tolerance'), 'kept: no beat near', {loopTo: 'next-cut'})
    .end()
    .addFunction('fitted', s => {
      s.start = round(work.songStart(), 4); s.moved = work.cuts.filter(c => c.verdict === 'moved').length;
      s.seconds = round(work.durations.reduce((a, d) => a + d, 0), 3);
      requireOverlap({start: work.songStart(), seconds: song, total: s.seconds, who: 'fitToMusic'});
    }, 'fitted', 'The film\'s new lengths and where the song starts');
  const trace = narrative();
  await chart.setLogger(QUIET).build().recorder(trace).run();
  const offsets = offsetsOf(work.durations);
  const cuts = work.cuts.sort((a, b) => a.index - b.index).map(({index, ...c}) => ({...c, at: round(offsets[index], 4)}));
  return {timings: {...timings, scenes: timings.scenes.map((t, i) => (work.durations[i] === t.duration ? t : {...t, duration: round(work.durations[i])}))},
    start: round(work.songStart(), 5), cuts, cutOn: {grid: cutOn.grid, beats: cutOn.shared, of: cutOn.of, tempi: cutOn.tempi, ...(cutOn.unsure ? {unsure: cutOn.unsure} : {})}, record: plainNarrative(trace)};
}

/** Write a cut's verdict down: the scene, what happened, how far it moved against the song, the beat, its drift after. */
function note(work, verdict, choice, why) {
  const moved = choice && verdict === 'moved';
  work.cuts.push({scene: work.ids[work.current], index: work.current, verdict, by: moved ? round(choice.by, 4) : 0, beat: choice ? choice.beat : null, drift: round(moved ? choice.drift : work.drift, 4), why});
}

/** Move a cut onto a beat: the scene before it (after the anchor) or after it (before the anchor) changes its length. */
function move(work, choice) {
  const i = work.current;
  if (i > work.anchor) work.durations[i - 1] += choice.by; else work.durations[i] -= choice.by;
  note(work, 'moved', choice, choice.shortens === null ? 'onto a beat, adding silence' : 'onto a beat, shortening the silence after a scene\'s last word');
}

/** A 16-bit PCM WAV, read: its rate, its channels and its sample frames (the bytes after the header). */
function readWav(bytes, name) {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`music: ${name} is not a WAV file: convert it (ffmpeg -i song.mp3 song.wav)`);
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
 * cut-short end faded over 10 ms, and renamed onto its name (files.mjs · writeOutput: a link there is replaced, never
 * written through); its length is then exactly its audio's. before: the timings fitToMusic was given;
 * after: what it returned. Returns the timings to render with.
 */
export function fitVoice(runDir, before, after) {
  runDir = securePath(runDir);   // the voice folder's REAL path, nothing on the way another user could rearrange (files.mjs · securePath)
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
    writeOutput(file, writeWav(wav, out));   // renamed onto its name: a link there is replaced, never written through (files.mjs · writeOutput)
    return {...t, duration: round(was.duration + (keep - frames) / wav.rate)};
  })};
}

/**
 * Music first: a film timed by its song. Each scene lasts whole bars (`bars`: a number for every scene, or {scene: n,
 * default?}), the first starting on the song's first downbeat at or after `from` (song seconds), the next where the
 * last one's bars end; each word — a spoken scene's, or a silent one's directions — lands on a beat of its scene, one
 * per beat in order (`every` beats apart), and holds until the next. Each scene's timing carries its beats (scene
 * seconds), for clock.beats(scene): what a kinetic stage lands its words on ("on": "beats"). No voice is timed this way
 * — a voice cannot hit beats — so it is for a film the song carries: kinetic type, captions, a montage.
 *
 * beats: the song's beat map (beats.mjs · beatMap): its beats and bars, on the song's clock; an unsure map refuses (give
 * music.bpm, or a song with a clearer beat). Returns {timings, start: the film second the song's first second plays at
 * (renderFilm's music.start), from: the song second the film starts at, bars: [{scene, bars, seconds}]}.
 */
export function beatTimings(storyboard, beats, {bars = 2, from = 0, every = 1} = {}) {
  const who = 'beatTimings';
  if (!Array.isArray(beats?.beats) || !Array.isArray(beats?.bars)) throw new Error(`${who}: beats is the song's beat map (beatMap(file)), with its beats and bars in seconds`);
  if (beats.sure === false) throw new Error(`${who}: the song's beat is unsure (${beats.verdict ?? 'two tempi close'}) — give its tempo (music.bpm) when you map it, or choose a song with a clearer beat`);
  if (!(Number.isFinite(from) && from >= 0)) throw new Error(`${who}: from is the song second to start at, 0 or more, not ${JSON.stringify(from)}`);
  if (!(Number.isInteger(every) && every >= 1 && every <= 8)) throw new Error(`${who}: every is the beats between two words, a whole number 1–8, not ${JSON.stringify(every)}`);
  const scenes = storyboard?.scenes ?? [];
  const barsOf = id => {
    const n = typeof bars === 'number' ? bars : bars?.[id] ?? bars?.default;
    if (!(Number.isInteger(n) && n >= 1 && n <= 64)) throw new Error(`${who}: scene "${id}" lasts a whole number of bars, 1–64 (bars: 2, or {"${id}": 4, "default": 2}), not ${JSON.stringify(n)}`);
    return n;
  };
  let bar = beats.bars.findIndex(t => t >= from - 1e-9);
  if (bar < 0) throw new Error(`${who}: the song has no bar at or after ${from} s (its last starts at ${beats.bars.at(-1)?.toFixed(2) ?? '—'} s) — start earlier (from)`);
  const filmStart = beats.bars[bar], out = [], made = [];
  for (const scene of scenes) {
    const kind = checkScene(scene), n = barsOf(scene.id);
    if (bar + n >= beats.bars.length) throw new Error(`${who}: the song runs out of bars at scene "${scene.id}" (${beats.bars.length - 1 - bar} left, it asks ${n}) — give the scenes fewer bars, or start earlier (from)`);
    const a = beats.bars[bar], b = beats.bars[bar + n], inside = beats.beats.filter(t => t >= a - 1e-9 && t < b - 1e-9).map(t => +(t - a).toFixed(3));
    const texts = (kind === 'silent' ? scene.silent.map(([text]) => text).join(' ') : spokenText(scene)).split(/\s+/).filter(Boolean);
    const slots = inside.filter((_, k) => k % every === 0), duration = +(b - a).toFixed(3);
    if (texts.length > slots.length) throw new Error(`${who}: scene "${scene.id}" has ${texts.length} words and ${slots.length} beats to land them on (${n} bar${n === 1 ? '' : 's'}${every > 1 ? `, a word every ${every} beats` : ''}) — give it more bars, or fewer words`);
    const words = texts.map((text, k) => ({text, start: slots[k], end: k + 1 < texts.length ? slots[k + 1] : duration}));
    out.push({id: scene.id, duration, words, beats: inside, alignment: {status: 'available', method: 'beats'}});
    made.push({scene: scene.id, bars: n, seconds: duration});
    bar += n;
  }
  return {timings: {provider: 'beats', scenes: out}, start: +(-filmStart).toFixed(3), from: filmStart, bars: made};
}