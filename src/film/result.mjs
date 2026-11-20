/**
 * The last stage of the compile: the film as handed back — what is drawn over every shot for a while (overlays), the
 * moments that replay earlier pictures (replays), which kit draws each recipe entry (drawnBy), and the film object
 * itself, every field in the order callers and the cache's keys have always seen. Its own module because it only
 * gathers: it decides nothing, so what a film carries is read in one place.
 *
 * Reads: every stage's results that the film carries (see the returned fields).
 * Returns: the film.
 */
import {directorRecord} from '../director/film.mjs';
import {deepFreeze} from './util.mjs';

export function filmOf(state) {
  const {guesses, stepsTrack, teaser, storyPathName, storySpec, stages, stageKitNames, clock, timings, sounds, foundUsed, listening, frame, beats, noted,
    used, notesApplied, attention, camerawork, reading, reads, posterAt, moments, regionsAt, pointAt, paper, shotsPlanned, watching, asked, progression,
    rubricRule, pace, rows, inputs, stringHashes, mouthsAt, partsAt, pictureClock, differsUp, labelsAt, lines, pictureChanges, claims, filmLang, directed,
    allKits, direction} = state;
  // What is drawn over every shot for a while: the guess cards, from their question to the card gone.
  const overlays = Object.freeze([...guesses.map((g, n) => Object.freeze({path: `guesses[${n}]`, from: g.start, to: g.until + .5})),
    ...(stepsTrack ? [Object.freeze({path: 'stepsTrack', from: stepsTrack.from, to: stepsTrack.until + .5})] : [])]);
  // The moments that replay earlier pictures (segments.mjs keys a piece by what it replays too): the teaser's rewind,
  // played at–until showing from–to, and a steps track's rewind cue (its own shot, played backward).
  const replays = Object.freeze([...(teaser ? [{at: teaser.at + 2.7, until: teaser.at + 4.8, from: Math.min(teaser.from, teaser.to), to: Math.max(teaser.from, teaser.to)}] : []),
    ...(stepsTrack?.rewind ? [{at: stepsTrack.rewind.from, until: stepsTrack.rewind.from + stepsTrack.rewind.seconds, from: Math.min(stepsTrack.rewind.to, stepsTrack.rewind.from), to: Math.max(stepsTrack.rewind.to, stepsTrack.rewind.from)}] : [])].map(Object.freeze));
  // Which kit draws each recipe entry (a built-in stage is the engine's own: absent), and the kits by name: a piece's
  // key holds the code of the kits that draw it (segments/kitcode.mjs, from each kit's `sources`).
  const drawnBy = Object.freeze(Object.fromEntries([[storyPathName, storySpec.kit], ...stages.map((st, i) => [`stages[${i}]`, st.world?.kit ?? stageKitNames[st.type] ?? null])].filter(([, kit]) => kit)));
  return {total: clock.total, clock, timings, sounds, foundSounds: foundUsed, listening, frame, beats, anchors: noted, strings: [...used], notes: notesApplied, attention: attention?.record ?? null, focusAt: attention?.focus?.viewAt ?? null,
    attentionFrames: attention?.frames ?? null,
    camera: camerawork?.record ?? null, cameraAt: camerawork?.viewAt ?? null, reading, reads, posterAt, moments, regionsAt, pointAt, theme: paper, shots: shotsPlanned, watching,
    // What does not progress (progression.mjs), only when a shot answers one of the five scene questions.
    ...(asked ? {progression: Object.freeze(progression.map(Object.freeze))} : {}),
    // The recipe's rubric (rubric.mjs): the scores a render needs before it is approved; absent when it names none.
    ...(rubricRule ? {rubric: rubricRule} : {}),
    // Its pace, when the recipe names one (the slideshow check holds it to it; a lesson's, when absent).
    ...(pace ? {pace} : {}),
    rows: Object.freeze(rows().map(Object.freeze)), overlays, replays, inputs, stringHashes, mouthsAt, partsAt, pictureAt: pictureClock,
    ...(differsUp.length ? {differs: Object.freeze(differsUp), labelsAt} : {}),
    lines: Object.freeze(lines.map(l => Object.freeze({...l}))), changes: Object.freeze(pictureChanges().map(c => Object.freeze({...c}))), claims, lang: filmLang,
    // What it was compiled from, kept for the cache's keys (segments.mjs): the recipe as given (its strings unresolved), with
    // the director's keys where they landed, frozen.
    recipe: deepFreeze(structuredClone(directed)), kits: Object.freeze(Object.fromEntries(allKits.map(k => [k.name, k]))), drawnBy,
    // What the director proposed, where each key landed, and why (director.mjs): only when the recipe asks for it.
    ...(direction ? {director: directorRecord(direction)} : {})};
}
