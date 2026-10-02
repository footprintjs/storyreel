// The approval lock (approval.mjs): an approval records hashes of what a person saw; a render with it
// refuses anything changed since, naming the part; reformatting changes nothing; the record keeps it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, readFileSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {approveFilm, checkApproval, filmHashes, makeFilm, evenTimings} from '../src/index.mjs';
import {stableJson, requireApproval} from '../src/approval.mjs';

const dir = fileURLToPath(new URL('../examples/hello/', import.meta.url)), read = f => JSON.parse(readFileSync(dir + f, 'utf8'));
const storyboard = read('storyboard.json'), recipe = read('recipe.json');
const at = new Date('2026-10-02T09:00:00Z');

test('an approval records who, when and the hashes of what was approved', () => {
  const a = approveFilm({storyboard, recipe, by: 'Sanjay', note: 'final for the talk', at});
  assert.equal(a.by, 'Sanjay'); assert.equal(a.approved, '2026-10-02T09:00:00.000Z'); assert.equal(a.note, 'final for the talk');
  assert.deepEqual(Object.keys(a.hashes), ['storyboard', 'recipe', 'pacing']);
  assert.throws(() => approveFilm({storyboard, recipe}), /say who approves it/);
});

test('the same data in another order or spacing is the same film; a changed word is not', () => {
  const a = approveFilm({storyboard, recipe, by: 'S', at});
  const reordered = Object.fromEntries(Object.entries(recipe).reverse());
  assert.equal(stableJson(reordered), stableJson(recipe));
  assert.deepEqual(checkApproval(a, {storyboard, recipe: reordered}), {ok: true, changed: []});
  const edited = structuredClone(storyboard); edited.scenes[0].narration += ' Again.';
  assert.deepEqual(checkApproval(a, {storyboard: edited, recipe}), {ok: false, changed: ['storyboard']});
  assert.deepEqual(checkApproval(a, {storyboard, recipe, pacing: {sceneTail: .5, holds: []}}).changed, ['pacing']);
  assert.throws(() => requireApproval(a, {storyboard: edited, recipe}), /changed since S approved it on 2026-10-02: storyboard differs/);
  assert.throws(() => checkApproval({}, {storyboard, recipe}), /not an approval/);
});

test('a voice is part of the film: new audio or new word times refuse', () => {
  const voice = mkdtempSync(path.join(tmpdir(), 'storyreel-voice-'));
  writeFileSync(path.join(voice, 'timings.json'), JSON.stringify({scenes: [{id: 'story', duration: 3, audio: 'a.wav', words: []}]}));
  writeFileSync(path.join(voice, 'a.wav'), 'take one');
  const a = approveFilm({storyboard, recipe, narrationDir: voice, by: 'S', at});
  assert.ok(checkApproval(a, {storyboard, recipe, narrationDir: voice}).ok);
  writeFileSync(path.join(voice, 'a.wav'), 'take two');
  assert.deepEqual(checkApproval(a, {storyboard, recipe, narrationDir: voice}).changed, ['voice']);
  const noVoice = approveFilm({storyboard, recipe, by: 'S', at});
  assert.deepEqual(checkApproval(noVoice, {storyboard, recipe, narrationDir: voice}).changed, ['voice'], 'a voice added after approval is a change');
  assert.throws(() => filmHashes({storyboard, recipe, narrationDir: path.join(voice, 'missing')}), /has no timings.json/);
});

test('makeFilm with an approval refuses a changed film before drawing, and records the approval when it renders', {skip: spawnSync('ffmpeg', ['-version']).error ? 'needs ffmpeg' : false}, async () => {
  const top = mkdtempSync(path.join(tmpdir(), 'storyreel-approval-')), timings = evenTimings(storyboard, {tail: 4});
  const approval = approveFilm({storyboard, recipe, by: 'S', at});
  const edited = structuredClone(recipe); edited.poster = undefined;
  edited.story = {...edited.story, intent: 'Something else.'};
  await assert.rejects(makeFilm({storyboard, recipe: edited, root: dir, timings, out: path.join(top, 'x', 'film.mp4'), approval, render: {width: 320, height: 180, fps: 10}}), /recipe differs from what was approved/);
  const made = await makeFilm({storyboard, recipe, root: dir, timings, out: path.join(top, 'ok', 'film.mp4'), approval, render: {width: 320, height: 180, fps: 10}});
  const record = JSON.parse(readFileSync(made.makingOf, 'utf8'));
  assert.equal(record.approval.by, 'S'); assert.deepEqual(record.approval.hashes, approval.hashes);
});
