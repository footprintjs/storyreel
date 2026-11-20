/**
 * Stage 30 of the compile: the film's claims (claims.mjs) — every number it shows, each with the fact that backs it
 * or the example scene it sits in, a claim in words found where the film says or shows it, and the open claims a
 * release may show anyway. Its own stage because claims are checked against everything the film shows, so they are
 * found last, from the reading stage's lines and labels.
 *
 * Reads: factList, examples, labels, shown, differsUp, filmLang, storyboard, allowOpen.
 * Writes: claims.
 */
import {findClaims, findStatements} from '../claims.mjs';
import {ownFigure} from '../differs.mjs';

export function claimsStage(state) {
  const {factList, examples, labels, shown, differsUp, filmLang, storyboard, allowOpen} = state;
  // Claims (claims.mjs): every number the film shows, each with the fact that backs it or the example scene it sits in
  // (an example line is labelled for as long as it is up: labelSpans).
  // A fact may be a claim in words (`says`): found where the film says or shows those words (claims.mjs · findStatements).
  // The open claims the recipe lets a release show, each with its reason (recipe.evidence.allowOpen), ride along.
  const claims = Object.freeze({facts: factList, examples: Object.freeze([...examples]), labels: Object.freeze(labels.map(l => Object.freeze({...l}))),
    // A label on how a scene differs is a line it shows: a number in it is a claim, unless it is the declared factor (differs.mjs · ownFigure).
    numbers: Object.freeze(findClaims([...shown, ...differsUp.flatMap(d => d.shown.filter(text => !ownFigure(text, d.time, filmLang)).map(text => ({text, at: d.from, to: d.to, scene: d.index, path: `storyboard.scenes[${d.index}].differs`})))], {facts: factList, examples, scenes: storyboard.scenes.map(sc => sc.id), lang: filmLang}).map(Object.freeze)),
    ...(factList?.some(f => f.says !== undefined) ? {statements: Object.freeze(findStatements(shown, {facts: factList, examples, scenes: storyboard.scenes.map(sc => sc.id)}).map(Object.freeze))} : {}),
    ...(allowOpen ? {allowOpen} : {})});
  state.claims = claims;
}
