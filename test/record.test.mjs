// The compile recorded with footprintjs (compileFilm({…, record: true}); record.mjs · recordSteps): five named
// stages, every line as when.<recipe path> = seconds, a slice from a line back to the inputs, the same pixels
// with the record off, and a record that survives structuredClone. A refused build keeps its record.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sliceForKey, sliceToJSON, formatSlice, keysReadFromExecutionTree} from 'footprintjs/trace';
import {FILMS, compileExample} from './golden.mjs';
import {frameHashes} from '../src/index.mjs';
import {COMPILE_STAGES} from '../src/record.mjs';

const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
const recipeOf = name => JSON.parse(readFileSync(new URL(`../examples/${name}/recipe.json`, import.meta.url), 'utf8'));
const FILM_KEYS = ['total', 'clock', 'timings', 'sounds', 'frame', 'beats', 'strings', 'notes', 'reading', 'posterAt', 'moments', 'regionsAt', 'pointAt', 'theme', 'shots', 'watching'];
/** A slice from a key in a record, its reads taken from the record's own execution tree. */
const sliceOf = (record, key) => sliceForKey(record.snapshot.commitLog, key, keysReadFromExecutionTree(record.snapshot.executionTree));
/** The stages a slice walked through (sliceToJSON keys its nodes by runtimeStageId). */
const stagesIn = slice => Object.keys(sliceToJSON(slice).nodes);

for (const name of Object.keys(FILMS)) {
  test(`${name}: every line is recorded as when.<recipe path>, and its slice reaches read inputs`, async () => {
    const film = await compileExample(name, {record: true}), {narrative, snapshot} = film.record;
    assert.deepEqual(narrative.filter(e => e.type === 'stage').map(e => [e.stageId, e.stageName]), COMPILE_STAGES, 'the five stages, in order');
    for (const b of film.beats) assert.equal(snapshot.sharedState[`when.${b.path}`], b.t, `when.${b.path}`);
    const key = `when.${film.beats[0].path}`, slice = sliceOf(film.record, key), nodes = stagesIn(slice);
    assert.equal(slice.missing, undefined, formatSlice(slice));
    assert.ok(nodes.some(id => id.startsWith('resolve-lines#')), 'written by resolve lines');
    assert.ok(nodes.some(id => id.startsWith('read-inputs#')), `the slice reaches read inputs:\n${formatSlice(slice)}`);
    assert.match(formatSlice(slice), /read inputs .*← via lines/);
  });
}

test('the record holds small values only, and survives structuredClone and JSON', async () => {
  const film = await compileExample('worlds', {record: true}), copy = structuredClone(film.record);
  assert.deepEqual(copy.narrative, film.record.narrative);
  assert.deepEqual(JSON.parse(JSON.stringify(copy.snapshot.sharedState)), copy.snapshot.sharedState, 'no function, canvas or class in the scope');
  assert.ok(film.record.narrative.every(e => !('rawValue' in e)), 'the narrative keeps no live values');
  // One key per world and per stage, with its kit, scene and recipe path; the notes as applied; the checks.
  const state = copy.snapshot.sharedState, recipe = recipeOf('worlds');
  // A shot's intent and facts ride with it (shots.mjs), so a slice from a stage says what the stage was for.
  const plan = st => ({...(st.intent ? {intent: st.intent} : {}), ...(st.continuity ? {continuity: {start: st.continuity.start ?? {}, end: st.continuity.end ?? {}}} : {})});
  assert.deepEqual(state['world.story'], {kit: recipe.story.kit, path: 'story', ...plan(recipe.story)});
  recipe.stages.forEach((st, i) => assert.deepEqual(state[`stage.stages[${i}]`], {type: st.type, kit: st.world?.kit ?? 'paper', scene: st.scene, path: `stages[${i}]`, ...plan(st)}));
  assert.ok(recipe.stages.some(st => st.continuity) && recipe.story.intent, 'the worlds example states intents and facts, so this reaches them');
  assert.deepEqual(state['checks.continuity'].facts, {'sheep out': 3});
  assert.equal(state['checks.watching'].rule, 'report');
  assert.deepEqual(state.recipe, Object.keys(recipe));
  assert.equal(state['checks.reading'].rule, 'report');
  assert.ok(state['checks.sounds'].busiest <= state['checks.sounds'].limit);
  // The slice still reads from the copy (a stored record answers as the live one does).
  assert.ok(stagesIn(sliceOf(copy, `when.${film.beats.at(-1).path}`)).some(id => id.startsWith('read-inputs#')));
});

test('record off (the default): the same film, no record, the same pixels as recorded', async () => {
  const off = await compileExample('hello'), on = await compileExample('hello', {record: true});
  assert.deepEqual(Object.keys(off), FILM_KEYS, 'the return keys are unchanged');
  assert.deepEqual(Object.keys(on), [...FILM_KEYS, 'record']);
  assert.deepEqual(on.beats, off.beats);
  assert.deepEqual(on.notes, off.notes);
  assert.deepEqual(frameHashes(on), golden.hello, 'recording draws no different pixel');
  assert.deepEqual(frameHashes(off), golden.hello);
});

test('record with notes and a teaser: the notes as applied and the pixels pinned', async () => {
  const film = await compileExample('recap', {record: true}), state = film.record.snapshot.sharedState;
  film.notes.forEach((n, i) => assert.deepEqual(state[`note.notes[${i}]`], n));
  assert.deepEqual(state['checks.reading'].tooShort, film.reading.map(l => l.path));
  assert.deepEqual(frameHashes(film), golden.recap);
});

test('record refuses anything but true or false, naming the fix', async () => {
  await assert.rejects(compileExample('hello', {record: 'yes'}), /record must be true \(the compile is recorded with footprintjs: film.record\) or false/);
  await assert.rejects(compileExample('hello', {record: 1}), /record must be true/);
});

test('a refused build keeps its record: the error names the stage that refused', async () => {
  const error = await compileExample('recap', {record: true, recipe: {...recipeOf('recap'), reading: 'refuse'}}).then(() => null, e => e);
  assert.match(error?.message ?? '', /Too short to read/);
  assert.ok(error.record, 'the error carries the record');
  const stages = error.record.narrative.filter(e => e.type === 'stage').map(e => e.stageId);
  assert.deepEqual(stages, ['read-inputs', 'build-worlds-and-stages', 'guesses-and-notes'], 'resolve lines never ran');
  assert.ok(error.record.narrative.some(e => e.type === 'error' && /at checks: .*Too short to read/.test(e.text)), 'the refusal is in the narrative, at checks');
  assert.ok(structuredClone(error.record).snapshot.sharedState['stage.stages[0]'], 'what ran before the refusal is kept');
  // Off, the same refusal carries no record.
  const plain = await compileExample('recap', {recipe: {...recipeOf('recap'), reading: 'refuse'}}).then(() => null, e => e);
  assert.match(plain.message, /Too short to read/);
  assert.equal(plain.record, undefined);
});

test('the recorded stages and the compile stay in step: a segment out of order refuses', async () => {
  const {recordSteps, step} = await import('../src/record.mjs');
  const summary = () => ({reads: [], writes: {}});
  async function* skips() { yield step('read-inputs', summary); yield step('checks', summary); }
  await assert.rejects(recordSteps(skips()), /reached "checks" where the stage "build-worlds-and-stages" was expected \(film.mjs · compileSteps yields once per COMPILE_STAGES entry, in order\)/);
  async function* short() { yield step('read-inputs', summary); return {}; }
  await assert.rejects(recordSteps(short()), /reached its end where the stage "build-worlds-and-stages" was expected/);
});
