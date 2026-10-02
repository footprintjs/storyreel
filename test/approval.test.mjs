// The approval lock (approval.mjs): an approval is made from the making-of record of the render a person
// watched — what the film was made from, hashed; a render with it refuses anything changed since, naming
// what (a file by its path); reformatting changes nothing; the record keeps it and says what it does not lock.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, readFileSync, cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {approveFilm, checkApproval, compileFilm, makeFilm, evenTimings} from '../src/index.mjs';
import {stableJson, requireApproval, voiceHash} from '../src/approval.mjs';
import {hashOf} from '../src/hash.mjs';

const dir = fileURLToPath(new URL('../examples/hello/', import.meta.url)), read = f => JSON.parse(readFileSync(dir + f, 'utf8'));
const storyboard = read('storyboard.json'), recipe = read('recipe.json');
const at = new Date('2026-10-02T09:00:00Z');
/** A film's inputs as makeFilm records them (here without a voice or a code fingerprint). */
const inputsOf = async ({board = storyboard, rec = recipe, timings = evenTimings(board, {tail: 4}), root = dir} = {}) =>
  ({...(await compileFilm({storyboard: board, timings, recipe: rec, root})).inputs, pacing: hashOf(null)});
const recordOf = async options => ({out: '/renders/draft.mp4', inputs: await inputsOf(options)});

test('an approval is made from a watched render\'s record: who, when, which render, what it was made from', async () => {
  const record = await recordOf(), a = approveFilm({record, by: 'Sanjay', note: 'final for the talk', at});
  assert.deepEqual([a.schemaVersion, a.by, a.approved, a.note, a.render], [2, 'Sanjay', '2026-10-02T09:00:00.000Z', 'final for the talk', 'draft.mp4']);
  assert.deepEqual(Object.keys(a.inputs).sort(), ['data', 'files', 'pacing', 'recipe', 'storyboard', 'strings', 'theme', 'timings']);
  assert.deepEqual(Object.keys(a.inputs.files), ['rule.ts'], 'every file the film read, by its path from the root');
  assert.throws(() => approveFilm({record}), /say who approves it/);
  assert.throws(() => approveFilm({record: {out: 'x.mp4'}, by: 'S'}), /give the making-of record of the render that was watched/);
});

test('the same data in another order is the same film; a changed word, file or timing is not, and each is named', async () => {
  const a = approveFilm({record: await recordOf(), by: 'S', at});
  const reordered = Object.fromEntries(Object.entries(recipe).reverse());
  assert.equal(stableJson(reordered), stableJson(recipe));
  assert.deepEqual(checkApproval(a, await inputsOf({rec: reordered})), {ok: true, changed: []});
  const edited = structuredClone(storyboard); edited.scenes[0].narration += ' Again.';
  assert.deepEqual(checkApproval(a, await inputsOf({board: edited})).changed, ['storyboard', 'timings']);
  assert.deepEqual(checkApproval(a, await inputsOf({timings: evenTimings(storyboard, {tail: 4, wordSeconds: .6})})).changed, ['timings'], 'a silent cut\'s timings set every beat');
  const copy = mkdtempSync(path.join(tmpdir(), 'storyreel-approve-')); cpSync(dir, copy, {recursive: true});
  writeFileSync(path.join(copy, 'rule.ts'), readFileSync(path.join(copy, 'rule.ts'), 'utf8').replace(/pebble/, 'stone'));
  assert.deepEqual(checkApproval(a, await inputsOf({root: copy})).changed, ['the file rule.ts'], 'a code file the recipe shows');
  assert.deepEqual(checkApproval({...a, inputs: {...a.inputs, code: 'abc'}}, a.inputs).changed, ['the kits\' code (no fingerprint given now)']);
  const changedBoard = await inputsOf({board: edited});
  assert.throws(() => requireApproval(a, changedBoard), /changed since S approved it on 2026-10-02: storyboard, timings differ from what was approved/);
});

test('an approval is checked before it is used: anything else is not an approval, said plainly', () => {
  for (const bad of [{}, {schemaVersion: 1, by: 'S', approved: at.toISOString(), hashes: {}}, {schemaVersion: 2, by: 'S', inputs: {}}, {schemaVersion: 2, by: 'S', approved: 'yesterday', inputs: {}}])
    assert.throws(() => checkApproval(bad, {}), /not an approval \(make one with approveFilm from a render's making-of.json\)/);
});

test('the date an approval names is the approver\'s own day, not the UTC one', () => {
  const late = new Date(2026, 9, 2, 23, 30), a = {schemaVersion: 2, by: 'S', approved: late.toISOString(), inputs: {recipe: 'x'}};
  assert.throws(() => requireApproval(a, {recipe: 'y'}), /approved it on 2026-10-02: recipe differs/);
});

test('a voice is its timings and its audio, file by file: moving sound from one file to another is a change', () => {
  const voice = mkdtempSync(path.join(tmpdir(), 'storyreel-voice-')), timings = {scenes: [{id: 'a', audio: 'a.wav'}, {id: 'b', audio: 'b.wav'}]};
  writeFileSync(path.join(voice, 'timings.json'), JSON.stringify(timings));
  writeFileSync(path.join(voice, 'a.wav'), 'take one'); writeFileSync(path.join(voice, 'b.wav'), 'two');
  const before = voiceHash(voice);
  writeFileSync(path.join(voice, 'a.wav'), 'take'); writeFileSync(path.join(voice, 'b.wav'), ' onetwo');
  assert.notEqual(voiceHash(voice), before);
  assert.throws(() => voiceHash(path.join(voice, 'missing')), /has no timings.json/);
});

test('makeFilm: approve the draft you watched; the final render with it records the approval, and a change refuses before drawing', {skip: spawnSync('ffmpeg', ['-version']).error ? 'needs ffmpeg' : false}, async () => {
  const top = mkdtempSync(path.join(tmpdir(), 'storyreel-approval-')), timings = evenTimings(storyboard, {tail: 4}), render = {width: 320, height: 180, fps: 10};
  const draft = await makeFilm({storyboard, recipe, root: dir, timings, out: path.join(top, 'draft', 'film.mp4'), render});
  const approval = approveFilm({record: draft.makingOf, by: 'S', at});
  const final = await makeFilm({storyboard, recipe, root: dir, timings, out: path.join(top, 'final', 'film.mp4'), approval, render: {...render, stamp: null}});
  const record = JSON.parse(readFileSync(final.makingOf, 'utf8'));
  assert.equal(record.approval.by, 'S'); assert.equal(record.approval.render, 'film.mp4');
  assert.deepEqual(record.inputs, approval.inputs, 'the final render is made from what was approved');
  assert.ok(record.approval.unlocked.some(u => /render settings/.test(u)) && record.approval.unlocked.some(u => /kits' code/.test(u)), 'it says what it does not lock');
  const edited = structuredClone(recipe); edited.story = {...edited.story, intent: 'Something else.'};
  await assert.rejects(makeFilm({storyboard, recipe: edited, root: dir, timings, out: path.join(top, 'x', 'film.mp4'), approval, render}), /recipe differs from what was approved/);
  await assert.rejects(makeFilm({storyboard, recipe, root: dir, timings: evenTimings(storyboard, {tail: 4, wordSeconds: .6}), out: path.join(top, 'y', 'film.mp4'), approval, render}), /timings differs/);
  const locked = await makeFilm({storyboard, recipe, root: dir, timings, out: path.join(top, 'code', 'film.mp4'), code: 'kits-v1', render});
  const lockedApproval = approveFilm({record: locked.makingOf, by: 'S', at});
  await assert.rejects(makeFilm({storyboard, recipe, root: dir, timings, out: path.join(top, 'code2', 'film.mp4'), code: 'kits-v2', approval: lockedApproval, render}), /code differs/);
  await assert.rejects(makeFilm({storyboard, recipe, root: dir, timings, out: path.join(top, 'z', 'film.mp4'), approval: {by: 'S'}, render}), /not an approval/);
});
