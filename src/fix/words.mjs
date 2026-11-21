// words — `where` and `fix` for a finding about a word on screen: the recipe entry that drew it, and the move that clears it.
//
// WHY: the review reads words as the frame draws them (review.mjs · wordsAt: text and a box in output pixels), which
// knows nothing of the recipe. The film's regions do (places.mjs), so a word is named by the entry under it and moved in
// that entry's units — never by a second reading of the picture.
import {clearOf, intoBounds, moveFix, shrinkFix} from './moves.mjs';

const middle = ([x0, y0, x1, y1]) => [(x0 + x1) / 2, (y0 + y1) / 2];

/**
 * A word that must move clear of a box (another word, the caption band): {where, fix}. All boxes in output pixels;
 * `bounds` the output frame; `clear` names what it clears, for the fix ('"Alpha" (stages[0].title)', 'the captions');
 * `ways` the directions it may move (moves.mjs · clearOf).
 */
export function wordClear(places, t, word, obstacle, bounds, clear, {ways} = {}) {
  const where = places.wordEntry(t, word).path, d = clearOf(word.box, obstacle, bounds, ways ? {ways} : {});
  if (!d) return {where, fix: `no single move takes it clear of ${clear} inside the frame: make it smaller, or show it at another moment`};
  return {where, fix: moveFix(places.outDelta(t, middle(word.box), d), {entry: places.entry(where), clear})};
}

/** A word running off the frame: {where, fix} — the move that brings it in, or the size that fits it. Boxes in output pixels. */
export function wordInto(places, t, word, bounds) {
  const where = places.wordEntry(t, word).path, need = intoBounds(word.box, bounds), entry = places.entry(where);
  if (!need) return {where, fix: 'move it in from the edge'};
  if (need.shrink) {
    const fb = places.frameBox(t, word.box), [a, b] = [places.toRecipe(t, [fb[0], fb[1]]), places.toRecipe(t, [fb[2], fb[3]])];
    return {where, fix: shrinkFix(need.shrink, [b[0] - a[0], b[1] - a[1]], {entry})};
  }
  return {where, fix: moveFix(places.outDelta(t, middle(word.box), need.move), {entry})};
}
