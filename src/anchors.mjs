/**
 * Anchors: every phrase a film is keyed to — each beat the recipe names (["scene", "phrase", plus?] or {scene, phrase,
 * nth?}) and each pacing hold ({scene, after}) — checked against what is said, all at once. A compile stops at the
 * first phrase that is not said, and a phrase said more than once quietly names its first place; an edit to the
 * narration can do both to many beats at once. Here every phrase is checked in one pass, with where it is named and the
 * words that would name it exactly:
 *
 *   missing    not said in its scene: the nearest words that are, and when
 *   ambiguous  said more than once, with no nth: each place, and a few words said only there
 *   past       its nth names a place after the last one
 *   scene      its scene is not the film's
 *
 * compileFilm({anchors: 'note'}) notes each one in film.anchors and keeps a missing phrase at its nearest words (else at
 * its scene's start), so the rest of the film still compiles and every phrase is checked; `storyreel anchors` says them
 * (tools.mjs · anchors). Pure: it reads the film's clock (clock.mjs · places, words, start).
 */

/** The most words a suggested phrase runs to: past it, a scene says the same words too often to name a place by them. */
const MOST_WORDS = 8;
/** A phrase as typed into a recipe: its words, no punctuation (phrases match whatever the punctuation). */
const plain = text => String(text).replace(/[^\p{L}\p{N}'’]+/gu, ' ').trim();
/** A ref as an object, whichever way it is written. */
export const refOf = ref => (Array.isArray(ref) ? {scene: ref[0], phrase: ref[1], plus: ref[2]} : ref);

/**
 * The longest run of a missing phrase's words that the scene does say (at least two words, or one of five letters or
 * more: "the" names nothing; of runs as long, the one with the most letters), with its first place: {phrase, start,
 * end}, or null.
 */
export function nearestWords(clock, scene, phrase) {
  const words = plain(phrase).split(/\s+/).filter(Boolean), letters = run => run.replace(/[\s'’]/g, '').length;
  for (let n = words.length - 1; n >= 1; n--) {
    let best = null;
    for (let from = 0; from + n <= words.length; from++) {
      const run = words.slice(from, from + n).join(' ');
      if ((n === 1 && letters(run) < 5) || (best && letters(run) <= letters(best.phrase))) continue;
      const [place] = clock.places(scene, run);
      if (place) best = {phrase: run, ...place};
    }
    if (best) return best;
  }
  return null;
}

/**
 * For each place a phrase is said, a few more words that the scene says only there: [{phrase, at}] — what to write
 * instead of a phrase said more than once. `keep`: the edge the phrase is timed by, which the fix keeps where it was —
 * 'start' (a beat: words are added after it) or 'end' (a pause, edge: 'end': words are added before it); only when no
 * such run names the place alone does the fix move that edge (its time, `at`, says so). Of runs as good, the one that
 * runs across fewer sentence ends, then the shorter. A place no run of up to MOST_WORDS words names alone is left out.
 */
export function exactPhrases(clock, scene, places, {keep = 'start'} = {}) {
  const said = clock.words(scene), ends = w => /[.!?…]['’"”]?$/.test(w.text);
  return places.map(place => {
    const first = said.findIndex(w => Math.abs(w.start - place.start) < 1e-6), last = said.findLastIndex(w => w.end <= place.end + 1e-6);
    if (first < 0 || last < first) return null;
    const tries = [];
    for (let extra = 1; last - first + extra < MOST_WORDS; extra++) {
      for (let before = 0; before <= extra; before++) {
        const a = first - before, b = last + extra - before;
        if (a < 0 || b >= said.length) continue;
        tries.push({a, b, moves: keep === 'start' ? before > 0 : extra - before > 0, across: said.slice(a, b).filter(ends).length});
      }
    }
    tries.sort((x, y) => x.moves - y.moves || x.across - y.across || (x.b - x.a) - (y.b - y.a));
    for (const {a, b} of tries) {
      const phrase = plain(said.slice(a, b + 1).map(w => w.text).join(' '));
      if (clock.places(scene, phrase).length === 1) return {phrase, at: keep === 'start' ? said[a].start : said[b].end};
    }
    return null;
  }).filter(Boolean);
}

/**
 * One phrase, checked against its scene: {problem: null | 'missing' | 'ambiguous' | 'past' | 'scene', places, near?}.
 * `places`: every place it is said (clock · places); `near`: for a missing phrase, the nearest words said.
 */
export function checkPhrase(clock, ref) {
  const r = refOf(ref);
  if (typeof clock?.places !== 'function') throw new Error('checkPhrase reads a film\'s clock: pass film.clock, or makeClock(storyboard, timings)');
  let places;
  try { places = clock.places(r.scene, r.phrase); } catch { return {problem: 'scene', places: []}; }
  if (!places.length) return {problem: 'missing', places, near: nearestWords(clock, r.scene, r.phrase)};
  if (r.nth !== undefined && !(r.nth < places.length)) return {problem: 'past', places};
  if (r.nth === undefined && places.length > 1) return {problem: 'ambiguous', places};
  return {problem: null, places};
}

/**
 * Where a phrase that is not as written stands while the compile goes on (compileFilm's anchors: 'note'): a missing
 * phrase at the nearest words said (else at its scene's start), a past nth at the last place, an unknown scene at the
 * film's start. `how` is the clock's own: 'at' (seconds) or 'pauseAfter' ({start, end}, half a second of pause).
 */
export function standIn(clock, ref, check, how) {
  const r = refOf(ref), place = check.problem === 'missing' ? check.near : check.problem === 'past' ? check.places.at(-1) : null;
  if (!place) { const start = check.problem === 'scene' ? 0 : clock.start(r.scene); return how === 'at' ? start + (r.plus ?? 0) : {start, end: start + .5}; }
  return how === 'at' ? (r.edge === 'end' ? place.end : place.start) + (r.plus ?? 0) : {start: place.end, end: place.end + .5};
}

/** A time as the timeline prints it: seconds on the film clock, two decimals. */
const secs = t => `${t.toFixed(2)} s`;
/** A noted phrase as one line: where it is named, what is wrong, and what to write instead. */
function lineOf(clock, n) {
  const r = refOf(n.ref), named = `${r.scene} "${r.phrase}"${n.path ? ` → ${n.path}` : ''}`;
  if (n.problem === 'scene') return `${named} — no scene "${r.scene}"`;
  if (n.problem === 'missing') return `${named} — not said${n.near ? `; the nearest words said: "${n.near.phrase}" (${secs(n.near.start)})` : ''}`;
  if (n.problem === 'past') return `${named} — nth ${r.nth}, but it is said ${n.places.length} time${n.places.length > 1 ? 's' : ''} (nth counts from 0)`;
  const keep = n.path?.startsWith('pacing.') || r.edge === 'end' ? 'end' : 'start', exact = exactPhrases(clock, r.scene, n.places, {keep});
  return `${named} — said ${n.places.length} times; the first is used (${secs(n.places[0][keep])})${exact.length ? `. Each alone: ${exact.map(e => `"${e.phrase}" (${secs(e.at)})`).join(' · ')}` : ''}`;
}

/** At most this many lines a kind, unless asked for every one. */
export const ANCHORS_TOP = 10;
/**
 * The anchors as text: the count, then each kind's lines. notes: the compile's (film.anchors) and the pacing's, each
 * {ref, path, problem, places, near?}; checked: how many phrases were checked; stopped: the compile's error, when it
 * stopped before every phrase was reached (a stand-in time can break a kit's order); clock: the film's, for the fixes.
 */
export function anchorsText({clock, notes, checked, stopped = null}, {full = false} = {}) {
  const kinds = [['missing', 'not said'], ['past', 'past the last place'], ['scene', 'no such scene'], ['ambiguous', 'said more than once (the first place is used)']];
  const count = kinds.map(([kind, said]) => [notes.filter(n => n.problem === kind), said]).filter(([list]) => list.length);
  const head = !checked && !notes.length ? 'no phrase is named: the recipe keys nothing to the voice, and the pacing holds nothing'
    : `${checked} phrase${checked === 1 ? '' : 's'} checked${count.length ? `: ${count.map(([list, said]) => `${list.length} ${said.replace(/ \(.*\)$/, '')}`).join(', ')}` : ': each said once, where it is named'}`;
  const body = count.map(([list, said]) => `${said}:\n${(full ? list : list.slice(0, ANCHORS_TOP)).map(n => `  ${lineOf(clock, n)}`).join('\n')}${!full && list.length > ANCHORS_TOP ? `\n  … ${list.length - ANCHORS_TOP} more: --full lists every one` : ''}`);
  return [head, ...body, ...(stopped ? [`the compile stopped before every phrase was checked: ${stopped}\nfix the phrases above and run it again`] : [])].join('\n');
}
