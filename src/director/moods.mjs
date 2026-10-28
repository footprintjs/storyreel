/**
 * The director's acting: each speaker's moods through a picture, proposed as the keys a world's acting already takes
 * — {who: [{at: beat, mood}]}, acted by footprint-storyreel/acting · moodAt (anticipation, a take, a cross-fade).
 *
 *   line    a speaker's line a mood rule names (rules.mjs; the neutral table names none: mood rules are the film's
 *           data) gives them that mood, the first of the rule's moods the world's kit can act
 *   guess   whoever answers a pause and guess (the first speaker after it, in its scene) takes the table's guess mood
 *           ("thinking") from the sentence before the pause until they answer
 *   rest    a held mood goes back to the kit's rest mood when someone else speaks, when its own speaker answers a guess,
 *           and when a new scene opens in the same picture (a kit with no rest mood keeps the mood until the next one)
 *
 * Listeners are not given moods: they react through footprint-storyreel/acting · reactionAt (a nod after a sentence,
 * a lean on a question, a brighten on an exclamation), read from the same voice. Two changes for one person closer
 * than a change takes to act (acting.mjs · ACTING: fade and settle) leave the later one out, with why. Pure.
 */
import {ACTING} from '../acting.mjs';
import {momentOf} from '../script.mjs';
import {normSpeech} from 'footprint-narration';
import {matchLine} from './rules.mjs';

/** The least seconds between two of one person's changes: what a change takes to act (moodAt refuses closer). */
const SPACING = Math.max(ACTING.fade, ACTING.settle) + .05;

/** The first of a rule's moods a person can act (`can`: their kit's moods, or null to take any), or null. */
const pick = (moods, can) => (can === null ? moods[0] : moods.find(m => can.includes(m)) ?? null);

/** Where a word's first letter or digit stands in what is said (a word may open with a quote). */
const letterOf = w => w.from + w.text.search(/[\p{L}\p{M}\p{N}]/u);

/** The sentence a guess's pause comes after, in a scene read: its index, or -1 when the scene does not say it. */
function beforePause(read, after) {
  const ref = Array.isArray(after) ? {phrase: after[1], nth: undefined} : after;
  const name = momentOf(ref.phrase, null);
  if (name !== null) {
    const m = read.moments.find(x => x.name === name);
    return m ? read.sentences.findLastIndex(s => s.first !== undefined && letterOf(read.words[s.first]) < m.offset) : -1;
  }
  const needle = normSpeech(ref.phrase);
  let at = 0, seen = 0;
  const starts = read.words.map(w => { const k = at; at += normSpeech(w.text).length; return k; });
  for (let k = read.bounds.content.indexOf(needle); needle && k >= 0; k = read.bounds.content.indexOf(needle, k + 1)) {
    if (!read.bounds.starts.has(k) || !read.bounds.ends.has(k + needle.length)) continue;
    if (seen++ !== (ref.nth ?? 0)) continue;
    const last = starts.findLastIndex(s => s < k + needle.length);
    return read.sentences.findIndex(s => last >= s.first && last <= s.last);
  }
  return -1;
}

/** Each guess in a scene read: {question: the sentence before its pause, who: the first speaker after it}. */
function guessesIn(read, guesses) {
  return guesses.filter(g => (Array.isArray(g.after) ? g.after[0] : g.after?.scene) === read.scene).flatMap(g => {
    const n = read.words.length ? beforePause(read, g.after) : -1, answer = n < 0 ? null : read.sentences.slice(n + 1).find(s => s.speaker);
    return answer ? [{question: n, who: answer.speaker}] : [];
  });
}

/**
 * The mood keys for one picture: {keys: [{who, scene, at, t, mood, rule, name, said}], dropped}. `scenes`: each scene
 * read (sentences.mjs), in film order; `table`: the rules; `guesses`: the recipe's ({after}); `moods`: what the kit can
 * act — a list, {who: list}, or null (any); `rest`: its rest mood, or null; `present(who, scene, t)`: whether the
 * picture has that person (a kit acts only the people it draws).
 */
export function planMoods(scenes, {table, guesses = [], moods = null, rest = null, present = () => true}) {
  const keys = [], dropped = [], held = new Map(), lastAt = new Map();
  const can = who => (moods === null || Array.isArray(moods) ? moods : moods[who] ?? []);
  const key = (who, s, mood, rule, name) => {
    const k = {who, scene: s.scene, at: s.at, t: s.t, mood, rule, name, said: s.text};
    const before = lastAt.get(who);
    if (s.t !== null && before !== undefined && s.t - before < SPACING) { dropped.push({...k, why: `${(s.t - before).toFixed(2)} s after ${who}'s last change: a change takes ${SPACING.toFixed(2)} s to act`}); return; }
    keys.push(k); if (s.t !== null) lastAt.set(who, s.t);
    if (mood === rest) held.delete(who); else held.set(who, {mood, rule});
  };
  const toRest = (who, s, rule) => { if (rest !== null && held.has(who)) key(who, s, rest, rule, rule); };
  scenes.forEach((read, j) => {
    const asked = guessesIn(read, guesses);
    read.sentences.forEach((s, n) => {
      if (n === 0 && j > 0) for (const who of [...held.keys()]) toRest(who, s, 'scene');
      for (const g of asked.filter(x => x.question === n)) {
        const mood = table.guess && present(g.who, s.scene, s.t) ? pick(table.guess, can(g.who)) : null;
        if (mood && held.get(g.who)?.mood !== mood) key(g.who, s, mood, 'guess', 'guess');
      }
      if (!s.speaker) return;
      for (const who of [...held.keys()]) if (who !== s.speaker) toRest(who, s, 'rest');
      const rule = matchLine(s, table).mood, mood = rule?.mood && present(s.speaker, s.scene, s.t) ? pick(rule.mood, can(s.speaker)) : null;
      if (rule?.mood && !mood) dropped.push({who: s.speaker, scene: s.scene, at: s.at, t: s.t, mood: rule.mood[0], rule: 'line', name: rule.name, said: s.text, why: present(s.speaker, s.scene, s.t) ? `the picture's kit acts none of ${rule.mood.join(', ')} for ${s.speaker}` : `${s.speaker} is not in the picture`});
      if (mood && held.get(s.speaker)?.mood !== mood) key(s.speaker, s, mood, 'line', rule.name);
      else if (!mood && held.get(s.speaker)?.rule === 'guess') toRest(s.speaker, s, 'rest');
    });
  });
  return {keys, dropped};
}
