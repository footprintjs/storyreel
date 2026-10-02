// Listening (listening.mjs): about half the changes of picture silent, never the same cue twice running, and the
// effects well under the voice — listed by the film, refused when the recipe says so, measured at render.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {compileFilm, evenTimings, paceTimings, renderFilm, cartoonKit} from '../src/index.mjs';
import {changeSounds, effectsUnderVoice, listeningMode, LISTENING} from '../src/listening.mjs';

const change = (at, sound, where = `stage s${at}`) => ({at, where, sound});

test('a sound on every change of picture is found; about half silent is not', () => {
  const whooshes = changeSounds([1, 2, 3, 4, 5].map(t => change(t, 'whoosh')));
  assert.deepEqual(whooshes.map(f => f.kind), ['every-change', 'same-twice', 'same-twice', 'same-twice', 'same-twice']);
  assert.match(whooshes[0].text, /5 of 5 changes of picture make a sound; about half should be silent/);
  assert.deepEqual(changeSounds([change(1, 'whoosh'), change(2, null), change(3, 'slide'), change(4, null), change(5, 'whoosh')]), [], 'half silent, never the same twice running');
  assert.deepEqual(changeSounds([change(1, 'slide'), change(2, 'slide'), change(3, 'whoosh')]).map(f => f.kind), ['same-twice'], `under ${LISTENING.least} changes the share is not judged`);
  assert.match(changeSounds([change(1, 'slide', 'stage a'), change(2, 'slide', 'stage b')])[0].text, /stage a and stage b both enter with a slide, one after the other/);
});

test('the effects stay at least 10 LU under the voice', () => {
  assert.match(effectsUnderVoice({voice: -16, effects: -20}).text, /the effects are 4.0 LU under the voice/);
  assert.equal(effectsUnderVoice({voice: -16, effects: -30}), null);
  assert.equal(effectsUnderVoice({voice: null, effects: -20}), null, 'nothing to compare without a voice');
  assert.equal(effectsUnderVoice({voice: -16, effects: -Infinity}), null);
});

const dir = fileURLToPath(new URL('../examples/worlds/', import.meta.url)), read = f => JSON.parse(readFileSync(dir + f, 'utf8'));
const storyboard = read('storyboard.json'), timings = paceTimings(storyboard, evenTimings(storyboard, {tail: .8}), read('pacing.json'));
const worlds = recipe => compileFilm({storyboard, timings, recipe, kits: [cartoonKit], root: dir, strings: read('strings/en.json')});

test('a film lists what its changes of picture ask of the ear; a recipe that refuses refuses it', async () => {
  const film = await worlds(read('recipe.json'));
  assert.deepEqual(film.listening.map(f => [f.kind, f.where]), [['same-twice', 'stage again']], 'the wipe and the iris both slide');
  const quiet = read('recipe.json'); quiet.stages[2].enter = {type: 'iris', at: [800, 420], sound: false};
  assert.deepEqual((await worlds(quiet)).listening, []);
  const refusing = read('recipe.json'); refusing.listening = 'refuse';
  await assert.rejects(worlds(refusing), /The sound asks too much of the ear \(the recipe says listening: "refuse"\): stage rule and stage again both enter with a slide/);
  assert.throws(() => listeningMode('loud'), /listening must be "report" or "refuse"/);
});

test('a render measures the effects apart: the record says how loud each role was', {skip: spawnSync('ffmpeg', ['-version']).error ? 'needs ffmpeg' : false}, async () => {
  const film = await worlds(read('recipe.json')), top = mkdtempSync(path.join(tmpdir(), 'storyreel-listen-'));
  const made = await renderFilm({film, storyboard, timings, out: path.join(top, 'film.mp4'), width: 160, height: 90, fps: 5});
  assert.equal(made.loudness.roles.voice, null, 'a silent cut has no voice to measure');
  assert.ok(Number.isFinite(made.loudness.roles.effects) && made.loudness.roles.effects < -10, `the effects measured (${made.loudness.roles.effects} LUFS)`);
  assert.deepEqual(made.listening, []);
});
