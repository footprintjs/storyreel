/**
 * What each segment of the compile reports to its record (record.mjs · step): small values about what it read and
 * wrote, made only when the compile is recorded. Its own module because these are the record's words, not the film's:
 * they decide nothing the film draws, and the next change (a real footprintjs chart) replaces them in one place.
 */
import {MAX_SOUNDS_PER_SCENE, soundsByScene} from '../sound.mjs';

/** What reading the inputs gave (record.mjs): the recipe's top-level keys, each scene's seconds, the notes, the strings used. */
export function inputsSummary({recipe, storyboard, clock, notes, strings}) {
  const lines = Object.fromEntries(storyboard.scenes.map(sc => [sc.id, {start: +clock.start(sc.id).toFixed(3), end: +clock.end(sc.id).toFixed(3)}]));
  return {reads: [], writes: {recipe: Object.keys(recipe), lines, notes: {written: (recipe.notes ?? []).length, speed: notes.speed}, ...(strings ? {strings} : {})}};
}
/** One key per world and per stage: its kit, its scene and its recipe path (a built-in stage is drawn by the paper kit). */
export function buildSummary(storyPath, storyKit, stages, stageKitNames, plan) {
  // A shot's intent and its facts ride with it (absent when it states none), so a slice from a stage says what it was for.
  // The plan is in film order; each entry is found by its recipe path, so a recipe that lists its stages out of order still records each stage's own.
  const said = path => { const u = plan.find(x => x.path === path); return {...(u?.intent ? {intent: u.intent} : {}), ...(u?.continuity ? {continuity: u.continuity} : {}), ...(u?.questions ? {questions: u.questions} : {}), ...(u?.ledger ? {ledger: u.ledger} : {})}; };
  const writes = {[`world.${storyPath}`]: {kit: storyKit, path: storyPath, ...said(storyPath)}};
  stages.forEach((st, i) => { writes[`stage.stages[${i}]`] = {type: st.type, kit: st.world?.kit ?? stageKitNames[st.type] ?? 'paper', scene: st.scene, path: `stages[${i}]`, ...said(`stages[${i}]`)}; });
  return {reads: ['recipe', 'lines'], writes};
}
/** Each guess's pause and when its card is gone, each director's note as applied, and each camera move as played. */
export function notesSummary(guesses, notesApplied, camera = null) {
  const writes = {}, s = n => +n.toFixed(3);
  guesses.forEach((g, n) => { writes[`guess.guesses[${n}]`] = {start: s(g.start), end: s(g.end), until: s(g.until)}; });
  notesApplied.forEach((a, i) => { if (a) writes[`note.notes[${i}]`] = a; });
  for (const m of camera?.moves ?? []) writes[`camera.${m.path}`] = {move: m.move, at: m.at, until: m.until, played: m.played};
  return {reads: ['lines', 'notes', 'stage.'], writes};
}
/** What the checks found: the reading rule and the lines too short to read, the busiest scene's sounds, the worlds waited for. */
export function checksSummary({readingRule, reading, reads = [], watchingRule, watching, facts, sounds, byScene, worlds, recalls, progression = null}) {
  return {reads: ['world.', 'stage.', 'guess.', 'note.'], writes: {
    'checks.reading': {rule: readingRule, tooShort: reading.map(l => l.path), ...(reads.length ? {reads: reads.length, readProblems: reads.filter(r => r.problem).map(r => r.path)} : {})},
    'checks.watching': {rule: watchingRule, found: watching.map(w => ({kind: w.kind, path: w.path, at: w.at, moments: w.moments}))},
    'checks.continuity': {facts},
    // The five scene questions, only when a shot answers one: the rule and what does not progress.
    ...(progression ? {'checks.progression': {rule: progression.rule, found: progression.found.map(f => ({kind: f.kind, path: f.path}))}} : {}),
    'checks.sounds': {count: sounds.length, busiest: Math.max(0, ...byScene.map(l => l.length)), limit: MAX_SOUNDS_PER_SCENE},
    'checks.ready': {worlds, recalls}}};
}
/** The checks segment's report, read from the compile's state (checksSummary's arguments, by name). */
export function checksOf(state) {
  const {readingRule, reading, reads, watchingRule, watching, facts, sounds, clock, timings, readies, recipe, asked, progressionRule, progression} = state;
  return checksSummary({readingRule, reading, reads, watchingRule, watching, facts, sounds, byScene: soundsByScene(sounds, clock.offsets, timings.scenes.map(s => s.duration)), worlds: readies.filter(Boolean).length, recalls: Object.keys(recipe.recalls ?? {}),
    ...(asked ? {progression: {rule: progressionRule, found: progression}} : {})});
}
/** A resolved line's key: when.<the recipe entry that named it>, or the phrase itself when no entry did. */
const beatKey = b => `when.${b.path ?? `(no entry) ${JSON.stringify(b.ref)}`}`;
/** Every beat as when.<path> = seconds, read from the scenes' seconds. */
export function linesSummary(beats) {
  return {reads: ['lines'], writes: Object.fromEntries(beats.map(b => [beatKey(b), b.t]))};
}
