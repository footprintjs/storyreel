/**
 * The lesson clock: one timeline from the paced narration timings. A beat names what is SAID
 * ({scene, phrase}); the clock turns it into seconds on the whole-lesson timeline. A phrase the
 * narration does not contain refuses the recipe (no silent fallback to a guessed time).
 */
/** Letters and digits only, lower case: how narration text and spoken words are compared. */
export const normSpeech = text => String(text).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/**
 * Index a scene's measured words against its narration, or null when the timings are not
 * complete (every word timed, in order, and together spelling the narration exactly).
 */
export function speechIndex(scene, timing) {
  if (timing?.alignment?.status !== 'available' || !Array.isArray(timing.words) || !timing.words.length) return null;
  let content = '', previous = 0; const words = [];
  for (const word of timing.words) {
    const text = normSpeech(word.text); if (!text) continue;
    if (!Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < previous - .025 || word.end < word.start || word.end > timing.duration + .025) return null;
    words.push({...word, from: content.length, to: content.length + text.length}); content += text; previous = word.end;
  }
  if (content !== normSpeech(scene.narration)) return null;
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
  if (timings.scenes.length !== board.scenes.length) throw new Error('Scene timing count mismatch');
  const offsets = [], speech = {}, spoken = {}, byId = {};
  let at = 0;
  board.scenes.forEach((scene, i) => {
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
      const i = sceneIndex(r.scene), match = phraseMatches(speech[r.scene], r.phrase)[r.nth ?? 0];
      if (!match) throw new Error(`Phrase not in ${r.scene}: "${r.phrase}"`);
      return offsets[i] + (r.edge === 'end' ? match.end : match.start) + (r.plus ?? 0);
    },
    /**
     * The pause after a phrase: {start, end} in whole-lesson seconds, from the phrase's last word
     * to the next spoken word (or the scene's end). A pacing hold after the phrase is this pause.
     */
    pauseAfter(ref) {
      const r = Array.isArray(ref) ? {scene: ref[0], phrase: ref[1]} : ref;
      const i = sceneIndex(r.scene), match = phraseMatches(speech[r.scene], r.phrase)[r.nth ?? 0];
      if (!match) throw new Error(`Phrase not in ${r.scene}: "${r.phrase}"`);
      const next = speech[r.scene].words.find(w => w.start >= match.end - 1e-6);
      return {start: offsets[i] + match.end, end: offsets[i] + (next ? next.start : timings.scenes[i].duration)};
    },
    /** Which scene a whole-lesson time falls in, and the time inside it. */
    locate(t) {
      let i = offsets.length - 1; while (i > 0 && t < offsets[i]) i--;
      return {index: i, id: board.scenes[i].id, time: t - offsets[i]};
    },
  };
}

export const ramp = (t, at, d = .5) => Math.max(0, Math.min(1, (t - at) / d));

/**
 * Evenly spaced word times for a storyboard — for a silent film, a test, or a first cut before
 * any voice exists. Returns timings in the same shape a voice aligner writes.
 */
export function evenTimings(storyboard, {wordSeconds = .38, lead = .3, tail = .8} = {}) {
  return {provider: 'even', scenes: storyboard.scenes.map(scene => {
    let at = lead;
    const words = scene.narration.split(/\s+/).filter(Boolean).map(text => { const w = {text, start: +at.toFixed(3), end: +(at + wordSeconds * .9).toFixed(3)}; at += wordSeconds; return w; });
    return {id: scene.id, duration: +(at + tail).toFixed(3), words, alignment: {status: 'available', method: 'even-spacing'}};
  })};
}
