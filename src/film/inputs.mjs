/**
 * Stage 29 of the compile: what the film was made from, hashed (hash.mjs) — the storyboard, timings, recipe, strings,
 * data, theme, every file read through the root, the cast, the facts, the found sounds, the language, the director's
 * keys — and each string's own hash. Its own stage because an approval locks these (approval.mjs) and every segment's
 * key holds them (segments.mjs): what goes in here decides what a change redraws.
 *
 * Reads: storyboard, timings, given, strings, data, paper, files, castGiven, reducedMotion, camerawork, factList,
 * foundUsed, filmLang, direction.
 * Writes: inputs, stringHashes.
 */
import {hashOf} from '../hash.mjs';

export function inputsStage(state) {
  const {storyboard, timings, given, strings, data, paper, files, castGiven, reducedMotion, camerawork, factList, foundUsed, filmLang, direction} = state;
  // What the film was made from, hashed (hash.mjs): an approval locks these (approval.mjs), and every segment's
  // key holds the ones that reach every frame (segments.mjs). Files: every one read through the root while the
  // film was built.
  const inputs = Object.freeze({storyboard: hashOf(storyboard), timings: hashOf(timings), recipe: hashOf(given), strings: strings ? hashOf(strings) : null,
    data: data === null ? null : hashOf(data), theme: hashOf(paper), files: Object.freeze(files.list()), ...(castGiven ? {cast: hashOf(castGiven)} : {}),
    // A film whose camera moves are cut for reduced motion is another film: an approval of the moving one does not cover it.
    ...(reducedMotion && camerawork ? {reducedMotion: true} : {}),
    ...(factList ? {facts: hashOf(factList.map(({kind, ...written}) => written))} : {}),   // the facts as written
    // The found sounds it plays, by name, file hash and licence: an approval locks them (none: the key is left out).
    ...(foundUsed.length ? {sounds: hashOf(foundUsed.map(f => ({name: f.name, sha256: f.record.sha256, license: f.record.license})))} : {}),
    ...(filmLang ? {lang: filmLang} : {}),   // the language its numbers are read by: an approval of the film in one is not of it in another
    // The keys the director placed (none: the key is left out): an approval of a directed film covers what it chose.
    ...(direction?.placements.length ? {director: hashOf(direction.placements)} : {})});
  // Each string's own hash (segments.mjs): a segment's key holds only the strings its entries name, so changing one
  // word redraws the segments that show it, not the whole film. Not part of `inputs` (the table's hash is).
  const stringHashes = strings ? Object.freeze(Object.fromEntries(Object.keys(strings).map(k => [k, hashOf(strings[k])]))) : null;
  Object.assign(state, {inputs, stringHashes});
}
