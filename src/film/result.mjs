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
    allKits, direction, storyWorld} = state;
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
    ...(direction ? {director: directorRecord(direction)} : {}),
    // What the kits say of the worlds they built (a world's `notes`: [{level, path, message}], each naming its recipe
    // entry and the fix): only when a world says anything at all, so a film whose kits keep no notes is as it was.
    ...kitNotesOf(storyPathName, storyWorld, stages),
    // The worlds whose map can be built again as a footprintjs run, for its record (a world's `mapRun`): only when one can.
    ...mapRunsOf(storyPathName, storyWorld, stages),
    // The worlds whose pieces move by intent (a world's `motionRun`, `motionFindings`): only when one does.
    ...motionRunsOf(storyPathName, storyWorld, stages),
    // The focus's flights between its shots (attention.mjs, flight/): when the focus moves the camera. WHY on the film:
    // `storyreel check` runs them again as a chart for its record (check/cameras.mjs), and the review's `motion` check
    // reads their critics' findings, as it reads a world's moves'. A film whose focus moves no camera is as it was.
    ...(attention?.focus?.run ? {cameraRuns: Object.freeze([attention.focus.run])} : {})};
}

/** The recipe's worlds as [path, world]: the story's (its path `story`), then each stage's (`stages[1]`). */
const worldsOf = (storyPath, storyWorld, stages) => [[storyPath, storyWorld], ...stages.map((st, i) => [`stages[${i}]`, st.world])];

/**
 * Every world that can run its map again as a footprintjs chart (an optional kit field, `mapRun(options)`: the
 * isometric kit's, kits/isometric/flow.mjs), named by its recipe path (`story`, `stages[1]`): {mapRuns: [{name, kit,
 * run}]} when any has one, else {}. WHY on the film: a world is compiled on a synchronous path and a run is not, so the
 * run is handed out for a caller that can wait (`storyreel check`, check/maps.mjs). A film with no such world is as it was.
 */
function mapRunsOf(storyPath, storyWorld, stages) {
  const runs = worldsOf(storyPath, storyWorld, stages).filter(([, w]) => typeof w?.instance?.mapRun === 'function')
    .map(([name, w]) => Object.freeze({name, kit: w.kit, run: w.instance.mapRun}));
  return runs.length ? {mapRuns: Object.freeze(runs)} : {};
}

/**
 * Every world whose pieces move by intent (optional kit fields: `motionRun(options)`, the moves run again through
 * footprint-story's intent decider as a chart, and `motionFindings`, what its critics found: the isometric kit's,
 * kits/isometric/motion.mjs), named by its recipe path: {motionRuns: [{name, kit, run, findings}]} when any has one,
 * else {}. Each finding's path is made the recipe's (`story.motion[1]`, `stages[0].world.motion[0]`), as a kit's note's
 * is. WHY on the film: `storyreel check` runs each for its record (check/motions.mjs), and the review's `motion` check
 * reads the findings (review.mjs). A film whose worlds move nothing is as it was.
 */
function motionRunsOf(storyPath, storyWorld, stages) {
  const runs = worldsOf(storyPath, storyWorld, stages).filter(([, w]) => typeof w?.instance?.motionRun === 'function')
    .map(([name, w]) => {
      const at = name === storyPath ? name : `${name}.world`, findings = Array.isArray(w.instance.motionFindings) ? w.instance.motionFindings : [];
      return Object.freeze({name, kit: w.kit, run: w.instance.motionRun, findings: Object.freeze(findings.map((f) => Object.freeze({...f, path: `${at}.${f.path}`})))});
    });
  return runs.length ? {motionRuns: Object.freeze(runs)} : {};
}

/**
 * Every world's `notes` (an optional kit field: what it found and how to fix it, worded), with each note's path
 * made the recipe's (`story.wires[2]`, `stages[1].world.blocks[0]`): {kitNotes} when any world has a notes list, else {}.
 * WHY on the film: a warning that lives only on the world is a warning nobody reads; a kit that refuses would lose a
 * film over something a person may choose to keep.
 */
function kitNotesOf(storyPath, storyWorld, stages) {
  const worlds = worldsOf(storyPath, storyWorld, stages).map(([at, w]) => [at === storyPath ? at : `${at}.world`, w]).filter(([, w]) => Array.isArray(w?.instance?.notes));
  if (!worlds.length) return {};
  return {kitNotes: Object.freeze(worlds.flatMap(([at, w]) => w.instance.notes.map((n) => Object.freeze({level: n.level, path: `${at}.${n.path}`, message: n.message, kit: w.kit}))))};
}
