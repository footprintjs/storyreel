/**
 * Stage 11 of the compile: pause and guess — a question over any scene while the narration holds a pause after it,
 * each checked against the pause and its scene's end. Its own stage because a guess is read from the recipe once,
 * and the drawing, the regions, the reading check and the sounds read the guesses it made.
 *
 * Reads: recipe, clock.
 * Writes: guesses.
 */
import {GUESS_PLACES} from '../kits/paper/paper.mjs';
import {GUESS_KEYS} from './keys.mjs';

export function readGuesses(state) {
  const {recipe, clock} = state;
  // Pause and guess: a question over any scene while the narration holds a pause after it.
  const guesses = (recipe.guesses ?? []).map((g, n) => {
    for (const key of Object.keys(g)) if (!GUESS_KEYS.has(key)) throw new Error(`guess ${n} has unsupported key ${key} (a guess takes ${[...GUESS_KEYS].join(', ')})`);
    if (typeof g.question !== 'string' || !g.question.trim()) throw new Error(`guess ${n} needs a question`);
    if (g.answer !== undefined && (typeof g.answer !== 'string' || !g.answer.trim())) throw new Error(`guess ${n}: answer must be words`);
    const place = g.place ?? 'top';
    if (!Object.hasOwn(GUESS_PLACES, place)) throw new Error(`guess ${n}: place must be ${Object.keys(GUESS_PLACES).join(', ')}`);
    const {start, end} = clock.pauseAfter(g.after), [scene, phrase] = Array.isArray(g.after) ? g.after : [g.after.scene, g.after.phrase];
    if (end - start < 1) throw new Error(`guess "${g.question}": the narration pauses ${(end - start).toFixed(2)} s after "${phrase}"; a guess needs a hold there of at least 1 s (pacing.holds)`);
    // The answer is shown (at least .8 s) and the card gone (a .5 s fade) inside the question's own
    // scene, before the hand-over to the next one begins (.6 s before the scene ends).
    const room = clock.end(scene) - end, needs = g.answer ? 1.9 : 1.4, last = clock.end(scene) - 1.1;
    if (room < needs) throw new Error(`guess "${g.question}": the pause after "${phrase}" ends ${room.toFixed(2)} s before its scene does; the answer needs ${needs} s in the same scene (say it after the pause)`);
    const until = g.until ? clock.at(g.until) : g.answer ? Math.min(end + 2.6, last) : end + .3;
    if (!(until > end)) throw new Error(`guess "${g.question}": until must come after the pause`);
    if (until > last) throw new Error(`guess "${g.question}": until must be 1.1 s before its scene ends, so the card is gone before the hand-over`);
    return {question: g.question, answer: g.answer, place, start, end, until};
  });
  state.guesses = guesses;
}
