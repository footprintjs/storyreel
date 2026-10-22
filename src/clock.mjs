/**
 * The lesson clock: one timeline from the paced narration timings. A beat names what is SAID
 * ({scene, phrase}); the clock turns it into seconds on the whole-lesson timeline. A phrase the
 * narration does not contain refuses the recipe (no silent fallback to a guessed time). A silent
 * scene's directions are its "narration" here: a beat names a direction the way it names a phrase,
 * and the directions are never spoken (clock.mjs · directionTimings). A beat may name a moment
 * written in the narration instead ("{hop}": script.mjs): the clock reads what is said — the
 * narration without its marks — and finds each moment by the letters said before it.
 */
import {normSpeech, checkSlots, findSlot, spokenMap, spokenOffset, shownWords, unsaidDigits} from 'footprint-narration';
import {sceneScript, momentOf, momentFix, shownMark} from './script.mjs';

/** How long one direction may last, in seconds: long enough to see, short enough to stay a beat. */
export const DIRECTION_SECONDS = Object.freeze([.2, 20]);

/**
 * A storyboard scene is spoken (`narration`: what is said) or silent (`silent`: directions, each
 * [text, seconds]), never both: a direction inside a spoken scene waits for the shared beat (design
 * section 10). Anything else refuses, naming the fix. Returns 'spoken' or 'silent'.
 */
export function checkScene(scene, i = 0) {
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) throw new TypeError(`storyboard scene ${i} must be an object: {"id", "narration"} or {"id", "silent": [["a direction", seconds], …]}`);
  const name = `storyboard scene ${scene.id ?? i}`, spoken = scene.narration !== undefined, silent = scene.silent !== undefined;
  if (spoken && silent) throw new Error(`${name} has both narration and silent: a scene is spoken or silent, not both (directions inside a spoken scene are not supported yet); move the directions into a silent scene of their own`);
  if (!spoken && !silent) throw new Error(`${name} has no narration and no silent: give "narration": "what is said", or "silent": [["the door opens", 1.0], …]`);
  if (scene.speaker !== undefined && !(typeof scene.speaker === 'string' && scene.speaker.trim())) throw new TypeError(`${name}: speaker must name who says the scene (a word, e.g. "robot"), not ${JSON.stringify(scene.speaker)}`);
  if (spoken) {
    if (typeof scene.narration !== 'string') throw new TypeError(`${name}: narration must be the words said, as one string`);
    const script = sceneScript(scene, i);   // its marks (script.mjs): one not as written refuses
    if (scene.say !== undefined) checkSlotsSaid(script, scene.say, name);   // number slots (footprint-narration), in what is said
    return 'spoken';
  }
  if (scene.say !== undefined) throw new Error(`${name}: say is for a spoken scene (what the voice says for a word the captions show); a silent scene says nothing`);
  if (!Array.isArray(scene.silent) || !scene.silent.length) throw new TypeError(`${name}: silent must list its directions, e.g. "silent": [["the door opens", 1.0]]`);
  const [lo, hi] = DIRECTION_SECONDS;
  scene.silent.forEach((direction, k) => {
    if (!Array.isArray(direction) || direction.length !== 2) throw new TypeError(`${name}: silent[${k}] must be [text, seconds], e.g. ["the door opens", 1.0], not ${JSON.stringify(direction)}`);
    const [text, seconds] = direction;
    if (typeof text !== 'string' || !normSpeech(text)) throw new TypeError(`${name}: silent[${k}] must start with the direction's words (letters or digits), not ${JSON.stringify(text)}`);
    if (typeof seconds !== 'number' || !(seconds >= lo && seconds <= hi)) throw new RangeError(`${name}: silent[${k}] "${text}" must last ${lo}..${hi} seconds, not ${JSON.stringify(seconds)}`);
  });
  sceneScript(scene, i);   // a direction takes no marks (script.mjs)
  return 'silent';
}

/**
 * A spoken scene's number slots, in what is said (script.mjs · said: its marks out): each shown text whole and in
 * order (footprint-narration · checkSlots), and no moment inside one — the voice says a slot as one run of words, so a
 * moment has no word to stand before there.
 */
function checkSlotsSaid(script, say, name) {
  checkSlots(script.said, say, {name, field: 'say'});
  let from = 0;
  say.forEach(([shown], k) => {
    const at = findSlot(script.said, shown, from), end = at + shown.length, inside = script.moments.find(m => m.offset > at && m.offset < end);
    if (inside) throw new Error(`${name}: the moment ${shownMark(inside.name)} stands inside the number slot "${shown}" (say[${k}]), which the voice says as one run: put it before or after "${shown}"`);
    from = end;
  });
}

/**
 * Number slots: `say: [[shown, spoken], …]` — the captions show `shown` ("16.67 ms"), the voice says `spoken`
 * ("sixteen point six seven milliseconds"). A voice drops or garbles digits, so a number is written for the voice
 * in words and shown on screen in digits. The slots are footprint-narration's (spokenMap, checkSlots): a slot is a
 * POSITION — each shown text where it stands whole, in order — and a scene's map is made from them.
 */
/** What a spoken scene says (script.mjs · said): its narration without its marks — as written when it has none. */
const saidOf = (scene, i) => (typeof scene.narration === 'string' ? sceneScript(scene, i).said : scene.narration);
/** A spoken scene's map of what is said, its slots checked first as the storyboard names them (`storyboard scene <id or index>: say[k] …`). */
function sceneMap(scene, i) {
  const text = saidOf(scene, i);
  if (scene.say !== undefined) checkSlots(text, scene.say, {name: `storyboard scene ${scene.id ?? i ?? '(no id)'}`, field: 'say'});
  return spokenMap(text, {slots: scene.say ?? []});
}
const slotsOf = scene => (scene?.say !== undefined && scene.narration !== undefined ? sceneMap(scene) : null);

/** What the voice says for a scene: its narration without its marks (script.mjs), with each number slot's spoken words in place of what is shown. */
export function spokenText(scene) {
  if (scene.say === undefined) return saidOf(scene);
  return sceneMap(scene).spoken;
}

/**
 * Numbers in the narration the voice would have to read as digits: [{scene, text}] — every run of digits
 * not in a number slot (a slot is a position: the same digits written again elsewhere are not said).
 * A voice tool can refuse these before it speaks (a voice drops or garbles digits); write them as `say` slots.
 */
export function unsaidNumbers(storyboard) {
  return storyboard.scenes.flatMap((scene, i) => (scene.narration === undefined ? []
    : unsaidDigits(sceneMap(scene, i)).map(text => ({scene: scene.id, text}))));
}

/** A scene's text, checked (clock.mjs · checkScene): what its words spell — the narration as spoken (number slots in words), or its directions joined. */
export const sceneText = (scene, i) => checkScene(scene, i) === 'silent' ? scene.silent.map(([text]) => text).join(' ') : spokenText(scene);

/**
 * A silent scene's timing, in the shape a voice aligner writes: each direction's words spread evenly
 * over its seconds (a word's start is its share's start, its end the next word's start), the duration
 * the sum of the seconds plus `tail`, alignment method 'directions'. No audio: the pacing and the
 * render make the silence (pacing.mjs · applyPacing, render.mjs · renderFilm).
 */
export function directionTimings(scene, {tail = 0} = {}) {
  if (checkScene(scene) !== 'silent') throw new Error(`directionTimings takes a silent scene; ${scene.id} has narration`);
  if (!(Number.isFinite(tail) && tail >= 0)) throw new RangeError(`directionTimings: tail must be seconds, 0 or more, not ${JSON.stringify(tail)}`);
  let at = 0; const words = [];
  for (const [text, seconds] of scene.silent) {
    const parts = text.split(/\s+/).filter(w => normSpeech(w)), share = seconds / parts.length;
    parts.forEach((w, k) => words.push({text: w, start: +(at + k * share).toFixed(3), end: +(at + (k + 1) * share).toFixed(3)}));
    at += seconds;
  }
  return {id: scene.id, duration: +(at + tail).toFixed(3), words, alignment: {status: 'available', method: 'directions'}};
}

/**
 * Timings for every storyboard scene: a voice knows only the spoken scenes, so each silent scene its
 * timings leave out is filled in by directionTimings (no tail; pacing adds it). A spoken scene left out
 * refuses. Pure: returns new timings, the given ones untouched.
 */
export function withDirections(board, timings) {
  const given = timings?.scenes ?? []; let j = 0;
  const scenes = board.scenes.map((scene, i) => {
    if (given[j]?.id === scene.id) return given[j++];
    if (checkScene(scene, i) === 'silent') return directionTimings(scene);
    throw new Error(`Timing ${j} is ${given[j]?.id ?? 'missing'}, expected ${scene.id} (only a silent scene may be left out of the timings)`);
  });
  if (j !== given.length) throw new Error(`The timings have ${given.length - j} scene(s) the storyboard does not: ${given.slice(j).map(s => s.id).join(', ')}`);
  return {...timings, scenes};
}

/**
 * Index a scene's measured words against its text (clock.mjs · sceneText: what the narration says, or a
 * silent scene's directions), or null when the timings are not complete (every word timed, in order, and
 * together spelling the text exactly). `moments`: where the narration's moments fall among the words
 * (momentsIn).
 */
export function speechIndex(scene, timing) {
  if (timing?.alignment?.status !== 'available' || !Array.isArray(timing.words) || !timing.words.length) return null;
  let content = '', previous = 0; const words = [];
  for (const word of timing.words) {
    const text = normSpeech(word.text); if (!text) continue;
    if (!Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < previous - .025 || word.end < word.start || word.end > timing.duration + .025) return null;
    words.push({...word, from: content.length, to: content.length + text.length}); content += text; previous = word.end;
  }
  if (content !== normSpeech(sceneText(scene))) return null;
  const slots = scene.silent === undefined ? slotsOf(scene) : null;
  return {content, words, slots, moments: momentsIn(scene, words, slots, timing.duration)};
}

/**
 * Where a spoken scene's moments (script.mjs) fall among its timed words, on the scene's own clock: [{name, at, start,
 * end}] — `at` when the word after the mark starts (with none after it, when the last word ends); `start`–`end` the
 * pause there, from the end of the word before the mark to the start of the word after it (the scene's start or end
 * where there is none). A mark is found by its letters: what is said before it, normalized as the words are (a number
 * slot counted as the voice says it), so the normalizing never sees a mark. One the timings put inside a word refuses.
 */
function momentsIn(scene, words, slots, duration) {
  if (scene.silent !== undefined || !words.length) return [];
  const {said, moments} = sceneScript(scene);
  return moments.map(({name, offset}) => {
    const shown = normSpeech(said.slice(0, offset)).length, from = slots ? spokenOffset(slots, shown) : shown;
    const inside = words.find(w => w.from < from && w.to > from);
    if (inside) throw new Error(`storyboard scene ${scene.id}: the moment ${shownMark(name)} falls inside the timed word ${JSON.stringify(inside.text)}: a moment stands between words — move it before or after the word, or time the word as two`);
    const k = words.findIndex(w => w.from >= from), after = k < 0 ? null : words[k], before = k < 0 ? words.at(-1) : words[k - 1] ?? null;
    return Object.freeze({name, at: after ? after.start : before.end, start: before ? before.end : 0, end: after ? after.start : duration});
  });
}

/** A scene's moment by name, from its speechIndex ({name, at, start, end}), or a refusal naming the moments it has (the first ten). */
export function momentIn(index, name, id, what = 'Moment') {
  const moment = index.moments.find(m => m.name === name);
  if (moment) return moment;
  const has = index.moments.map(m => shownMark(m.name)), shown = has.slice(0, 10).join(', ') + (has.length > 10 ? `, … ${has.length - 10} more` : '');
  throw new Error(`${what} not in ${id}: "${shownMark(name)}" (${has.length ? `its moments: ${shown}` : 'it has no moments'})`);
}

/** Every offset where `needle` starts in `text`. */
function* occurrences(text, needle) {
  for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + 1)) yield at;
}

/**
 * Every place a phrase is spoken: [{start, end}] in scene seconds, word-aligned, in order. A scene with
 * number slots matches the phrase as the voice says it ("sixty hertz") and as written ("60 Hz"): both
 * find the same words, and each place is listed once.
 */
export function phraseMatches(index, phrase) {
  if (!index) return [];
  const needle = normSpeech(phrase); if (!needle) return [];
  const spans = [...occurrences(index.content, needle)].map(at => [at, at + needle.length]);
  if (index.slots) for (const at of occurrences(index.slots.norm.shown, needle)) {
    const a = spokenOffset(index.slots, at), b = spokenOffset(index.slots, at + needle.length, {end: true});
    if (a !== null && b !== null && b > a) spans.push([a, b]);
  }
  const seen = new Set(), result = [];
  for (const [a, b] of spans.sort((x, y) => x[0] - y[0] || x[1] - y[1])) {
    if (seen.has(`${a}:${b}`)) continue; seen.add(`${a}:${b}`);
    const first = index.words.find(w => w.from === a), last = index.words.find(w => w.to === b);
    if (first && last) result.push({start: first.start, end: last.end});
  }
  return result;
}

export function makeClock(board, timings) {
  if (timings.scenes.length !== board.scenes.length) throw new Error(`Scene timing count mismatch${board.scenes.some(s => s?.silent) ? ' (a voice that leaves out the silent scenes: fill them with withDirections(storyboard, timings))' : ''}`);
  const offsets = [], speech = {}, spoken = {}, byId = {}, maps = [];   // maps[i]: scene i's own spoken map (ids may repeat)
  let at = 0;
  board.scenes.forEach((scene, i) => {
    checkScene(scene, i);
    const timing = timings.scenes[i];
    if (timing.id !== scene.id) throw new Error(`Timing ${i} is ${timing.id}, expected ${scene.id}: give the timings in the storyboard's scene order`);
    offsets.push(at); byId[scene.id] = i;
    speech[scene.id] = speechIndex(scene, timing);
    if (!speech[scene.id]) throw new Error(`Complete word timings are required for ${scene.id}: give every word of its narration a timing ({text, start, end}), or time it with evenTimings`);
    maps[i] = speech[scene.id].slots;
    const words = timing.words.filter(w => w.text.replace(/[^\p{L}\p{N}]/gu, ''));
    spoken[scene.id] = {first: words[0].start, last: words.at(-1).end};
    at += timing.duration;
  });
  const total = at;
  const sceneIndex = id => { if (!(id in byId)) throw new Error(`Unknown scene ${id} (the scenes are ${Object.keys(byId).join(', ')})`); return byId[id]; };
  /**
   * A ref's moment (script.mjs · momentOf: its phrase is "{name}") — {at, start, end} on its scene's clock
   * (speechIndex) — or null when it names a phrase. A moment is one time: nth and edge refuse (script.mjs · momentFix).
   */
  const momentFor = r => {
    const name = momentOf(r.phrase, `${r.scene} "${r.phrase}"`), fix = name === null ? null : momentFix(r);
    if (fix) throw new Error(`${r.scene} "${r.phrase}": ${fix}`);
    return name === null ? null : momentIn(speech[r.scene], name, r.scene);
  };
  // Each scene's said words on the whole-lesson clock (a silent scene's directions are seen, never said).
  // Who says each word: the word's own `speaker` (a voice step that knows who said what writes it — the narrator and
  // the characters taking turns inside one scene), else the scene's, else null (the narrator).
  const said = board.scenes.map((scene, i) => scene.silent !== undefined ? []
    : timings.scenes[i].words.filter(w => w.text.replace(/[^\p{L}\p{N}]/gu, '')).map(w => {
      if (w.speaker !== undefined && w.speaker !== null && !(typeof w.speaker === 'string' && w.speaker.trim())) throw new TypeError(`${scene.id}: the word "${w.text}" has speaker ${JSON.stringify(w.speaker)}; a word's speaker names who says it (a word), or is left out (the scene's speaker, or the narrator)`);
      return Object.freeze({text: w.text, start: offsets[i] + w.start, end: offsets[i] + w.end, speaker: w.speaker ?? scene.speaker ?? null, ...(w.speaker ? {own: true} : {})});
    }));
  // Each character's turns: in each scene, every run of words said by one speaker (a scene's own speaker is one run).
  const turns = board.scenes.flatMap((scene, i) => {
    const runs = [];
    for (const w of said[i]) {
      if (w.speaker === null) { runs.push(null); continue; }
      const last = runs.at(-1);
      if (last && last.speaker === w.speaker) last.end = w.end; else runs.push({scene: scene.id, speaker: w.speaker, start: w.start, end: w.end});
    }
    return runs.filter(Boolean).map(r => Object.freeze(r));
  });
  return {
    total, offsets,
    /** Whole-lesson seconds where scene `id` starts. */
    start: id => offsets[sceneIndex(id)],
    /** Whole-lesson seconds where scene `id` ends (its paced audio, tail included). */
    end: id => offsets[sceneIndex(id)] + timings.scenes[sceneIndex(id)].duration,
    /** Whole-lesson seconds of the last spoken word's end in scene `id`. */
    spokenEnd: id => offsets[sceneIndex(id)] + spoken[id].last,
    /**
     * A beat reference → seconds. ref = [scene, phrase] | [scene, phrase, plus] |
     * {scene, phrase, edge?: 'start'|'end', plus?, nth?}. A phrase may be a moment written in the
     * narration ("{hop}": script.mjs): when the word after the mark starts, plus `plus` (no nth, no edge).
     */
    at(ref) {
      const r = Array.isArray(ref) ? {scene: ref[0], phrase: ref[1], plus: ref[2]} : ref;
      const i = sceneIndex(r.scene), moment = momentFor(r);
      if (moment) return offsets[i] + moment.at + (r.plus ?? 0);
      const match = phraseMatches(speech[r.scene], r.phrase)[r.nth ?? 0];
      if (!match) throw new Error(`Phrase not in ${r.scene}: "${r.phrase}"`);
      return offsets[i] + (r.edge === 'end' ? match.end : match.start) + (r.plus ?? 0);
    },
    /**
     * The pause after a phrase: {start, end} in whole-lesson seconds, from the phrase's last word
     * to the next spoken word (or the scene's end). A pacing hold after the phrase is this pause.
     * At a moment ("{hop}"), the pause at the mark: from the end of the word before it to the start
     * of the word after it.
     */
    pauseAfter(ref) {
      const r = Array.isArray(ref) ? {scene: ref[0], phrase: ref[1]} : ref;
      const i = sceneIndex(r.scene), moment = momentFor(r);
      if (moment) return {start: offsets[i] + moment.start, end: offsets[i] + moment.end};
      const match = phraseMatches(speech[r.scene], r.phrase)[r.nth ?? 0];
      if (!match) throw new Error(`Phrase not in ${r.scene}: "${r.phrase}"`);
      const next = speech[r.scene].words.find(w => w.start >= match.end - 1e-6);
      return {start: offsets[i] + match.end, end: offsets[i] + (next ? next.start : timings.scenes[i].duration)};
    },
    /**
     * Every place a phrase is said in scene `id`, in order, on the whole-lesson clock: [{start, end}] — none when it is
     * not said. A ref's `nth` picks one of these (at, pauseAfter); the anchors (anchors.mjs) read them all. A moment
     * ("{hop}") is one place, its time (start and end alike); none when the scene has no such moment, and a speaker tag
     * is no place (at says why).
     */
    places: (id, phrase) => {
      const i = sceneIndex(id);
      let name; try { name = momentOf(phrase); } catch { return []; }
      if (name === null) return phraseMatches(speech[id], phrase).map(m => ({start: offsets[i] + m.start, end: offsets[i] + m.end}));
      const moment = speech[id].moments.find(m => m.name === name);
      return moment ? [{start: offsets[i] + moment.at, end: offsets[i] + moment.at}] : [];
    },
    /** The moments written in scene `id`'s narration (script.mjs), in order, on the whole-lesson clock: [{name, t}] (none in a silent scene). */
    moments: id => { const i = sceneIndex(id); return speech[id].moments.map(m => Object.freeze({name: m.name, t: offsets[i] + m.at})); },
    /** Which scene a whole-lesson time falls in, and the time inside it. */
    locate(t) {
      let i = offsets.length - 1; while (i > 0 && t < offsets[i]) i--;
      return {index: i, id: board.scenes[i].id, time: t - offsets[i]};
    },
    /** The words to show for scene i (captions): its timed words with number slots collapsed into what is shown, on the scene's own clock. */
    shownWords: i => shownWords(maps[i], timings.scenes[i].words ?? []),
    /** The words said in scene `id`, on the whole-lesson clock: [{text, start, end}] (none in a silent scene). */
    words: id => said[sceneIndex(id)].map(({text, start, end, speaker, own}) => Object.freeze({text, start, end, ...(own ? {speaker} : {})})),
    /**
     * Who is saying a word at t: {scene, speaker, word, start, end} (speaker: the storyboard scene's `speaker`,
     * or null; start/end: the word's, on the whole-lesson clock), or null between words and in silent scenes —
     * so a kit can move the right character's mouth with the voice.
     */
    speaking(t) {
      let i = offsets.length - 1; while (i > 0 && t < offsets[i]) i--;
      const w = said[i].find(x => t >= x.start && t < x.end);
      return w ? {scene: board.scenes[i].id, speaker: w.speaker, word: w.text, start: w.start, end: w.end} : null;
    },
    /** Every character's turn to speak: [{scene, speaker, start, end}] on the whole-lesson clock, in order. */
    turns: () => turns.slice(),
    /**
     * Where `who` looks at t: at the character who is speaking (a listener looks at the speaker), as
     * {at: the speaker's name, amount: 0..1} — turning toward them `turn` seconds before their first word
     * and back `hold` seconds after their last — or null when nobody else is speaking. A speaker never
     * looks at itself, and a narrator (a scene with no speaker) is nobody on screen. A speaker who talks
     * twice in a row holds the look between the turns; when one speaker hands over to another, the one
     * looked at more wins and `also` names the other ({at, amount}), so a kit can blend the two instead
     * of jumping. A kit turns its character's eyes or head toward `at` by `amount`.
     */
    gaze(t, who, {turn = .3, hold = .5} = {}) {
      // A speaker's turns in a row whose looks would meet are one span: the listener holds the look between them.
      const spans = [];
      for (const g of turns) {
        const last = spans.at(-1);
        if (last && last.speaker === g.speaker && g.start - turn <= last.end + hold) last.end = g.end;
        else spans.push({speaker: g.speaker, start: g.start, end: g.end});
      }
      const by = new Map();
      for (const g of spans) {
        if (g.speaker === who || t < g.start - turn || t > g.end + hold) continue;
        const amount = Math.min(ramp(t, g.start - turn, turn), 1 - ramp(t, g.end, hold));
        const was = by.get(g.speaker);
        if (amount > 0 && (!was || amount > was.amount || (amount === was.amount && g.start > was.start))) by.set(g.speaker, {amount, start: g.start});
      }
      const ranked = [...by].map(([at, {amount, start}]) => ({at, amount: easeTurn(amount), start})).sort((a, b) => b.amount - a.amount || b.start - a.start);
      if (!ranked.length) return null;
      const [first, second] = ranked;
      return {at: first.at, amount: first.amount, ...(second ? {also: {at: second.at, amount: second.amount}} : {})};
    },
  };
}

export const ramp = (t, at, d = .5) => Math.max(0, Math.min(1, (t - at) / d));
/**
 * A time on the film clock as people read it, m:ss.s — the review's findings, a sheet's labels. Rounded to the tenth
 * before it is split into minutes, so 59.96 s is 1:00.0, never 0:60.0. (The studio page keeps a copy: it runs in the
 * browser on its own.)
 */
export const clockTenths = t => { const tenths = Math.round(t * 10); return `${Math.floor(tenths / 600)}:${(tenths % 600 / 10).toFixed(1).padStart(4, '0')}`; };
/** A head turning: slow, fast, slow. */
const easeTurn = u => (u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

/**
 * Evenly spaced word times for a storyboard — for a silent film, a test, or a first cut before
 * any voice exists. Returns timings in the same shape a voice aligner writes. A silent scene keeps
 * its directions' own seconds (clock.mjs · directionTimings), with the same tail.
 */
export function evenTimings(storyboard, {wordSeconds = .38, lead = .3, tail = .8} = {}) {
  return {provider: 'even', scenes: storyboard.scenes.map((scene, i) => {
    if (checkScene(scene, i) === 'silent') return directionTimings(scene, {tail});
    let at = lead;
    const words = spokenText(scene).split(/\s+/).filter(Boolean).map(text => { const w = {text, start: +at.toFixed(3), end: +(at + wordSeconds * .9).toFixed(3)}; at += wordSeconds; return w; });
    return {id: scene.id, duration: +(at + tail).toFixed(3), words, alignment: {status: 'available', method: 'even-spacing'}};
  })};
}
