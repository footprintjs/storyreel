/**
 * The lesson clock: one timeline from the paced narration timings. A beat names what is SAID
 * ({scene, phrase}); the clock turns it into seconds on the whole-lesson timeline. A phrase the
 * narration does not contain refuses the recipe (no silent fallback to a guessed time). A silent
 * scene's directions are its "narration" here: a beat names a direction the way it names a phrase,
 * and the directions are never spoken (clock.mjs · directionTimings).
 */
/** Letters and digits only, lower case: how narration text and spoken words are compared. */
export const normSpeech = text => String(text).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

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
    if (scene.say !== undefined) checkSay(scene, name);
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
  return 'silent';
}

/**
 * Number slots: `say: [[shown, spoken], …]` — the captions show `shown` ("16.67 ms"), the voice says
 * `spoken` ("sixteen point six seven milliseconds"). A voice drops or garbles digits, so a number is
 * written for the voice in words and shown on screen in digits. Each `shown` must appear in the
 * narration, in order; `spoken` is words only (no digits — that is the point).
 */
function checkSay(scene, name) {
  if (!Array.isArray(scene.say) || !scene.say.length) throw new TypeError(`${name}: say must list pairs [shown, spoken], e.g. "say": [["16.67 ms", "sixteen point six seven milliseconds"]]`);
  let from = 0;
  scene.say.forEach((pair, k) => {
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(x => typeof x === 'string' && normSpeech(x))) throw new TypeError(`${name}: say[${k}] must be [shown, spoken], two strings with words, not ${JSON.stringify(pair)}`);
    const [shown, said] = pair;
    if (/[0-9]/.test(said)) throw new Error(`${name}: say[${k}] "${said}" has digits; say it in words (a voice drops or garbles digits)`);
    const at = scene.narration.indexOf(shown, from);
    if (at < 0) throw new Error(`${name}: say[${k}] shows "${shown}", which the narration does not have${from ? ' after the slot before it' : ''}; each shown text must appear in the narration, in order`);
    from = at + shown.length;
  });
}

/** What the voice says for a scene: its narration with each number slot's spoken words in place of what is shown. */
export function spokenText(scene) {
  if (!scene.say) return scene.narration;
  let out = '', rest = scene.narration;
  for (const [shown, said] of scene.say) { const at = rest.indexOf(shown); out += rest.slice(0, at) + said; rest = rest.slice(at + shown.length); }
  return out + rest;
}

/** A phrase as the voice says it: every number slot's shown text in it replaced by its spoken words. */
export function spokenPhrase(scene, phrase) {
  let out = String(phrase);
  for (const [shown, said] of scene?.say ?? []) out = out.split(shown).join(said);
  return out;
}

/**
 * The words to show for a scene: its timed words, with each number slot's spoken run collapsed back
 * into what is shown ("sixteen point six seven milliseconds." → "16.67 ms."), timed from the run's first
 * word to its last — so captions show digits while the voice said words.
 */
export function shownWords(scene, words) {
  if (!scene?.say) return words;
  const out = [...words];
  let k = 0;
  for (const [shown, said] of scene.say) {
    const target = normSpeech(said);
    for (let i = k; i < out.length; i++) {
      let acc = '', j = i;
      while (j < out.length && acc.length < target.length) acc += normSpeech(out[j++].text);
      if (acc === target) {
        const last = out[j - 1], tail = String(last.text).match(/[^\p{L}\p{N}]+$/u)?.[0] ?? '';
        out.splice(i, j - i, {text: shown + tail, start: out[i].start, end: last.end});
        k = i + 1; break;
      }
    }
  }
  return out;
}

/**
 * Numbers in the narration the voice would have to read as digits: [{scene, text}] — every run of digits
 * not inside a number slot's shown text. A voice tool can refuse these before it speaks (a voice drops
 * or garbles digits); write them as `say` slots.
 */
export function unsaidNumbers(storyboard) {
  const out = [];
  for (const scene of storyboard.scenes) {
    if (scene.narration === undefined) continue;
    let text = scene.narration;
    for (const [shown] of scene.say ?? []) text = text.split(shown).join(' ');
    for (const m of text.matchAll(/[0-9][0-9.,:]*/g)) out.push({scene: scene.id, text: m[0].replace(/[.,:]+$/, '')});
  }
  return out;
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
 * Index a scene's measured words against its text (clock.mjs · sceneText: the narration, or a silent
 * scene's directions), or null when the timings are not complete (every word timed, in order, and
 * together spelling the text exactly).
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
  return {content, words};
}

/** Every place a phrase is spoken: [{start, end}] in scene seconds, word-aligned. */
export function phraseMatches(index, phrase) {
  if (!index) return [];
  const needle = normSpeech(phrase), result = []; if (!needle) return result;
  let from = 0;
  while (from < index.content.length) {
    const at = index.content.indexOf(needle, from); if (at < 0) break; from = at + 1;
    const first = index.words.find(w => w.from === at), last = index.words.find(w => w.to === at + needle.length);
    if (first && last) result.push({start: first.start, end: last.end});
  }
  return result;
}

export function makeClock(board, timings) {
  if (timings.scenes.length !== board.scenes.length) throw new Error(`Scene timing count mismatch${board.scenes.some(s => s?.silent) ? ' (a voice that leaves out the silent scenes: fill them with withDirections(storyboard, timings))' : ''}`);
  const offsets = [], speech = {}, spoken = {}, byId = {};
  let at = 0;
  board.scenes.forEach((scene, i) => {
    checkScene(scene, i);
    const timing = timings.scenes[i];
    if (timing.id !== scene.id) throw new Error(`Timing ${i} is ${timing.id}, expected ${scene.id}`);
    offsets.push(at); byId[scene.id] = i;
    speech[scene.id] = speechIndex(scene, timing);
    if (!speech[scene.id]) throw new Error(`Complete word timings are required for ${scene.id}`);
    const words = timing.words.filter(w => w.text.replace(/[^\p{L}\p{N}]/gu, ''));
    spoken[scene.id] = {first: words[0].start, last: words.at(-1).end};
    at += timing.duration;
  });
  const total = at;
  const sceneIndex = id => { if (!(id in byId)) throw new Error(`Unknown scene ${id}`); return byId[id]; };
  // Each scene's said words on the whole-lesson clock (a silent scene's directions are seen, never said).
  const said = board.scenes.map((scene, i) => scene.silent !== undefined ? []
    : timings.scenes[i].words.filter(w => w.text.replace(/[^\p{L}\p{N}]/gu, '')).map(w => Object.freeze({text: w.text, start: offsets[i] + w.start, end: offsets[i] + w.end})));
  // Each character's turns: a scene with a speaker, from its first said word to its last.
  const turns = board.scenes.flatMap((scene, i) => scene.speaker && said[i].length ? [Object.freeze({scene: scene.id, speaker: scene.speaker, start: said[i][0].start, end: said[i].at(-1).end})] : []);
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
     * {scene, phrase, edge?: 'start'|'end', plus?, nth?}
     */
    at(ref) {
      const r = Array.isArray(ref) ? {scene: ref[0], phrase: ref[1], plus: ref[2]} : ref;
      const i = sceneIndex(r.scene), match = phraseMatches(speech[r.scene], spokenPhrase(board.scenes[i], r.phrase))[r.nth ?? 0];
      if (!match) throw new Error(`Phrase not in ${r.scene}: "${r.phrase}"`);
      return offsets[i] + (r.edge === 'end' ? match.end : match.start) + (r.plus ?? 0);
    },
    /**
     * The pause after a phrase: {start, end} in whole-lesson seconds, from the phrase's last word
     * to the next spoken word (or the scene's end). A pacing hold after the phrase is this pause.
     */
    pauseAfter(ref) {
      const r = Array.isArray(ref) ? {scene: ref[0], phrase: ref[1]} : ref;
      const i = sceneIndex(r.scene), match = phraseMatches(speech[r.scene], spokenPhrase(board.scenes[i], r.phrase))[r.nth ?? 0];
      if (!match) throw new Error(`Phrase not in ${r.scene}: "${r.phrase}"`);
      const next = speech[r.scene].words.find(w => w.start >= match.end - 1e-6);
      return {start: offsets[i] + match.end, end: offsets[i] + (next ? next.start : timings.scenes[i].duration)};
    },
    /** Which scene a whole-lesson time falls in, and the time inside it. */
    locate(t) {
      let i = offsets.length - 1; while (i > 0 && t < offsets[i]) i--;
      return {index: i, id: board.scenes[i].id, time: t - offsets[i]};
    },
    /** The words to show for scene i (captions): its timed words with number slots collapsed into what is shown, on the scene's own clock. */
    shownWords: i => shownWords(board.scenes[i], timings.scenes[i].words ?? []),
    /** The words said in scene `id`, on the whole-lesson clock: [{text, start, end}] (none in a silent scene). */
    words: id => said[sceneIndex(id)].slice(),
    /**
     * Who is saying a word at t: {scene, speaker, word, start, end} (speaker: the storyboard scene's `speaker`,
     * or null; start/end: the word's, on the whole-lesson clock), or null between words and in silent scenes —
     * so a kit can move the right character's mouth with the voice.
     */
    speaking(t) {
      let i = offsets.length - 1; while (i > 0 && t < offsets[i]) i--;
      const w = said[i].find(x => t >= x.start && t < x.end);
      return w ? {scene: board.scenes[i].id, speaker: board.scenes[i].speaker ?? null, word: w.text, start: w.start, end: w.end} : null;
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
