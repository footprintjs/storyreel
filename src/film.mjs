/**
 * Compile a recipe into one film timeline: frame(ctx, t) draws the whole film at any second, on
 * the same clock as the paced narration.
 *
 * A film opens on a story and then plays its stages, one per narration scene:
 *   story   — the opening world, drawn by a STORY KIT (built in: whiteboard; add your own)
 *   stages  — built-in types code · api · recap · summary · world, plus types from STAGE KITS
 *             (e.g. a course's agent loop)
 * The story and the stages are joined in one of two ways:
 *   pushIn    — the camera pushes into one story prop, which becomes a paper card, and the stages
 *               hand over on that one page (the lesson shape: idea → build → loop → recap)
 *   no pushIn — every stage is a SHOT: a world (any story kit, full frame) or paper, entering
 *               with a fade, a wipe, an iris, a page turn or a cut; paper stages in a row hand over on one page
 * Over any of it: guesses (pause and guess) and a steps track (kits/paper/steps-track.mjs). On-screen words may be keys into a string table.
 * Director notes (notes.mjs) lay camera words over the film: a camera speed, cuts, pushes. Camera moves by
 * name (camera.mjs, placed by camerawork.mjs) move the camera over the picture: pan, dolly, orbit, rack focus…
 * See README.md for the data.
 *
 * The compile runs as a list of stages (src/film/, one module each: see src/film/README.md). Each stage takes the one
 * state object the stages before it filled, and adds its own named results to it; this file only runs them in order.
 */
import {drainSteps, recordSteps, step} from './record.mjs';
import {readOptions} from './film/options.mjs';
import {timeClock} from './film/clock.mjs';
import {readSources} from './film/sources.mjs';
import {loadKits} from './film/kits.mjs';
import {directStage} from './film/direct.mjs';
import {buildStory} from './film/story.mjs';
import {buildStages} from './film/stages.mjs';
import {placeCard} from './film/card.mjs';
import {planShots} from './film/plan.mjs';
import {rowOfShots} from './film/shots.mjs';
import {readGuesses} from './film/guesses.mjs';
import {readStepsTrackStage} from './film/steps-track.mjs';
import {pageStage} from './film/page.mjs';
import {teaserStage} from './film/teaser.mjs';
import {worldDrawing} from './film/world-drawing.mjs';
import {pictureStage} from './film/picture.mjs';
import {labelsStage} from './film/labels.mjs';
import {changesStage} from './film/changes.mjs';
import {regionsStage} from './film/regions.mjs';
import {probesStage} from './film/probes.mjs';
import {entrancesStage} from './film/entrances.mjs';
import {cameraStage} from './film/camera.mjs';
import {notesAppliedStage} from './film/notes-applied.mjs';
import {watchingStage} from './film/watching.mjs';
import {readingStage} from './film/reading.mjs';
import {soundsStage} from './film/sounds.mjs';
import {momentsStage} from './film/moments.mjs';
import {stillsStage} from './film/stills.mjs';
import {inputsStage} from './film/inputs.mjs';
import {claimsStage} from './film/claims.mjs';
import {filmOf} from './film/result.mjs';
import {inputsSummary, buildSummary, notesSummary, checksOf, linesSummary} from './film/summaries.mjs';

/**
 * @param storyboard {scenes: [{id, narration, …}]}   (alias: board)
 * @param timings    {scenes: [{id, duration, words: [{text, start, end}], alignment: {status: 'available'}}]} — paced
 * @param recipe     the film's recipe (data only)
 * @param data       values the recipe quotes (e.g. a recorded run)   (alias: capture)
 * @param kits       [{name, story?: {compile(spec, clock, motion)} | {context: true, compile(spec, context)}, stages?: {type: impl}}]
 *                   — plug-ins; a story world may return `ready` (a Promise), awaited before recalls and the return
 * @param theme      a theme object, or the name of a built-in theme (default 'paper')
 * @param root       directory that recipe file paths (code excerpts) are relative to (default cwd)
 * @param strings    the string table for the film's language ({key: text}), when the recipe names strings
 * @param lang       the language the film is shown in, a BCP 47 tag ("de", "fr", "en-IN", "ta"), or null: the numbers on
 *                   screen are read by it (claims.mjs · numberLocale) — film.lang, and film.inputs.lang when given
 * @param hostKeys   top-level recipe keys the host application reads itself (allowed, ignored); any other unknown key refuses
 * @param record     true → the compile runs as a footprintjs flowchart and the film carries `record`
 *                   {narrative, snapshot} (record.mjs · recordSteps); false (default) → no record, nothing else changes
 * @param reducedMotion true → the recipe's camera moves are played as cuts to their end framing, handheld off
 *                   (camerawork.mjs); false (default) → as written. A film without camera moves is the same either way
 * @param anchors    'refuse' (default) → a phrase the recipe names that its scene does not say stops the compile;
 *                   'note' → each phrase not as written (not said, said more than once with no nth, an nth past the
 *                   last place, an unknown scene) is noted in film.anchors, and one not said stands at the nearest words
 *                   said, so every phrase is checked in one pass (anchors.mjs; the anchors tool)
 * @returns {total, clock, timings, sounds, frame(ctx, t), beats: [{ref, t, path}] (every phrase resolved, and the
 *          recipe entry that named it), strings: [keys used], notes: [the director's notes as applied],
 *          regionsAt(t) → [{box, path, label}] (what is drawn where), pointAt(t, x, y) → {frame, world?}, camera (the
 *          camera moves as played, or null), cameraAt(t) → the camera's {x, y, z, r} (null at rest or without moves),
 *          anchors: [{ref, path, how, problem, places, near?}] (with anchors: 'note'; else none), record?}
 *          With anchors: 'note', a compile that stops anyway (a kit refusing a time a phrase stood in for) carries the
 *          phrases noted so far on its error (error.anchors), so none is lost.
 */
export async function compileFilm(options) {
  const {record = false, ...rest} = options, noted = [];
  if (typeof record !== 'boolean') throw new Error(`compileFilm: record must be true (the compile is recorded with footprintjs: film.record) or false (the default), not ${JSON.stringify(record)}`);
  try { return await (record ? recordSteps(compileSteps(rest, noted)) : drainSteps(compileSteps(rest, noted))); } catch (e) {
    if (rest.anchors === 'note' && e && typeof e === 'object') e.anchors = noted;
    throw e;
  }
}

/**
 * The compile in five segments, one per record.mjs · COMPILE_STAGES entry: each ends in a `yield step(id,
 * summary)`, where `summary()` (called only when recording) says what the segment read and wrote.
 * The segments run the same code in the same order whether or not the compile is recorded.
 * Each segment runs its stages (src/film/) in order over one state object, `state`: a stage reads what the stages
 * before it wrote there, by name, and writes its own results there, by name.
 */
async function* compileSteps({storyboard, board, timings, recipe, data, capture, kits = [], theme, root = process.cwd(), strings = null, lang = null, hostKeys = [], cast = null, strategies = null, reducedMotion = false, anchors = 'refuse'}, noted = []) {
  const state = {storyboard, board, timings, recipe, data, capture, kits, theme, root, strings, lang, hostKeys, cast, strategies, reducedMotion, anchors, noted};
  readOptions(state);
  timeClock(state);
  readSources(state);
  loadKits(state);
  directStage(state);
  yield step('read-inputs', () => inputsSummary({recipe: state.recipe, storyboard: state.storyboard, clock: state.base, notes: state.notes, strings: state.strings ? [...state.used] : null}));

  buildStory(state);
  await buildStages(state);
  placeCard(state);
  planShots(state);
  yield step('build-worlds-and-stages', () => buildSummary(state.storyPathName, state.storySpec.kit, state.stages, state.stageKitNames, state.plan));

  rowOfShots(state);
  readGuesses(state);
  readStepsTrackStage(state);
  pageStage(state);
  teaserStage(state);
  worldDrawing(state);
  pictureStage(state);
  labelsStage(state);
  changesStage(state);
  regionsStage(state);
  probesStage(state);
  await entrancesStage(state);
  await cameraStage(state);
  notesAppliedStage(state);
  yield step('guesses-and-notes', () => notesSummary(state.guesses, state.notesApplied, state.camerawork?.record ?? null));

  watchingStage(state);
  readingStage(state);
  soundsStage(state);
  momentsStage(state);
  stillsStage(state);
  yield step('checks', () => checksOf(state));
  // Every line the build resolved (the clock is a pure function of the paced word times, so the order it was asked in changes no second).
  yield step('resolve-lines', () => linesSummary(state.beats));

  inputsStage(state);
  claimsStage(state);
  return filmOf(state);
}
