import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {compileFilm, evenTimings, createSound} from '../src/index.mjs';
import {SOUND_NAMES, MAX_SOUNDS_PER_SCENE, checkSound, soundsByScene, resolveSoundEvents} from '../src/sound.mjs';

const NEW = ['door', 'step', 'click', 'whoosh', 'crumble'];
const peak = r => r.metadata.actualPeakDBFS;

test('the five new sounds are named, each renders non-silent and under the ceiling', () => {
  assert.deepEqual(SOUND_NAMES, ['slide', 'settle', 'tap', 'question', 'chime', ...NEW]);
  for (const type of NEW) {
    const r = createSound({duration: 2, events: [{type, time: .2}]});
    assert.equal(r.metadata.silent, false, `${type} is heard`);
    assert.ok(peak(r) <= r.metadata.peakCeilingDBFS, `${type} stays under the ceiling (${peak(r)} dBFS)`);
    assert.equal(r.metadata.gain, 1, `${type} alone is quiet enough that the scene is not turned down`);
  }
});

test('a sound is the same every time (deterministic synthesis), and the first five sound as before', () => {
  const events = [{type: 'slide', time: .1}, {type: 'tap', time: .5}, {type: 'settle', time: .9}, {type: 'question', time: 1.3}, {type: 'chime', time: 1.8}, {type: 'tap', time: 3.95}];
  const sha = r => createHash('sha256').update(r.wav).digest('hex').slice(0, 16);
  // Pinned from the synthesis before the five new sounds came (0.2.0): gain 1 by default changes no sample.
  assert.equal(sha(createSound({duration: 4, events})), '36fe1093bf6670bf');
  const all = SOUND_NAMES.map((type, i) => ({type, time: .1 + i * .35}));
  assert.equal(sha(createSound({duration: 5, events: all})), sha(createSound({duration: 5, events: all})));
});

test('gain 0.5 is quieter than gain 1, and an event gain overrides the sound default', () => {
  for (const type of [...NEW, 'tap']) {
    const loud = createSound({duration: 2, events: [{type, time: .2, gain: 1}], peakCeilingDBFS: -18});
    const soft = createSound({duration: 2, events: [{type, time: .2, gain: .5}], peakCeilingDBFS: -18});
    assert.ok(peak(soft) < peak(loud) - 5, `${type}: half the gain is about 6 dB quieter (${peak(soft)} vs ${peak(loud)})`);
  }
  // door's default gain is .8: no gain is quieter than gain 1.
  assert.ok(peak(createSound({duration: 2, events: [{type: 'door', time: .2}]})) < peak(createSound({duration: 2, events: [{type: 'door', time: .2, gain: 1}]})));
  assert.equal(resolveSoundEvents([{type: 'door', time: .1, gain: .45}], null, 1)[0].gain, .45, 'the gain is kept on the resolved event');
});

test('gain is relative to its scene: a loud sound turns down every other sound in that scene', () => {
  const tap = [{type: 'tap', time: .1}], ceiling = -40;
  const alone = createSound({duration: 2, events: tap, peakCeilingDBFS: ceiling}), withChime = createSound({duration: 2, events: [...tap, {type: 'chime', time: 1}], peakCeilingDBFS: ceiling});
  assert.ok(withChime.metadata.gain < alone.metadata.gain, 'the chime sets the scene gain, and the tap is turned down with it');
});

test('an unknown sound name or a gain outside 0..1 refuses, naming the sounds there are', () => {
  assert.throws(() => createSound({duration: 1, events: [{type: 'boom', time: .1}]}), /"boom"; the sounds are slide, settle, tap, question, chime, door, step, click, whoosh, crumble/);
  for (const gain of [1.5, -.1, '1', NaN]) assert.throws(() => createSound({duration: 1, events: [{type: 'door', time: .1, gain}]}), /gain must be a number from 0 to 1/);
  assert.throws(() => checkSound({type: 'tapp', time: 1}, 'the story kit "farm"'), /the story kit "farm" makes a sound "tapp"; the sounds are slide, .*crumble/);
  assert.throws(() => checkSound(null, 'the story kit "farm"'), /makes a sound that is not \{time, type\}/);
  assert.throws(() => createSound({duration: 1, events: Array.from({length: MAX_SOUNDS_PER_SCENE + 1}, () => ({type: 'tap', time: .1}))}), /at most 64 entries/);
});

test('soundsByScene: each scene its own sounds on its own clock, gain kept, the last .02 s dropped', () => {
  const sounds = [{time: .5, type: 'tap'}, {time: 1.99, type: 'tap'}, {time: 2.1, type: 'door', gain: .3}];
  assert.deepEqual(soundsByScene(sounds, [0, 2], [2, 3]), [[{type: 'tap', time: .5}], [{type: 'door', time: 2.1 - 2, gain: .3}]]);
});

// A small film: a story kit that makes the sounds a test gives it, and a stage kit that beeps.
const storyboard = {scenes: [
  {id: 'one', narration: 'Here is the first scene, with a few words in it to say.'},
  {id: 'two', narration: 'And here is the second scene, which says a little more.'},
]};
const timings = evenTimings(storyboard);
const storyKit = sounds => ({name: 'farm', story: {compile: () => ({hang: 1, sounds, draw: c => { c.fillStyle = '#eee'; c.fillRect(0, 0, 1600, 900); }})}});
const stageKit = sounds => ({name: 'beeper', stages: {beep: {keys: [], compile: () => ({}), draw: () => {}, sounds: () => sounds}}});
const film = ({story = [], stage = null, recipe = {}, hostKeys} = {}) => compileFilm({storyboard, timings, kits: [storyKit(story), ...(stage ? [stageKit(stage)] : [])],
  recipe: {story: {kit: 'farm'}, ...(stage ? {stages: [{type: 'beep', scene: 'two'}]} : {}), ...recipe}, ...(hostKeys ? {hostKeys} : {})});

test('a misspelled kit sound refuses when the film is built, naming the kit and the sounds there are', async () => {
  await assert.rejects(film({story: [{time: 1, type: 'tapp'}]}), /the story kit "farm" makes a sound "tapp"; the sounds are slide, settle, tap, question, chime, door, step, click, whoosh, crumble/);
  const two = timings.scenes[0].duration + 1;
  await assert.rejects(film({stage: [{time: two, type: 'whosh'}]}), /the stage kit "beeper" \(stage two\) makes a sound "whosh"/);
  await assert.rejects(film({story: [{time: 1, type: 'door', gain: 2}]}), /the story kit "farm": a sound's gain must be a number from 0 to 1/);
});

test('a kit sound keeps its gain into film.sounds, from story kits and stage kits alike', async () => {
  const two = timings.scenes[0].duration + 1;
  const f = await film({story: [{time: 1, type: 'door', gain: .45}, {time: 1.5, type: 'step'}], stage: [{time: two, type: 'crumble', gain: .3}]});
  assert.deepEqual(f.sounds.filter(s => s.type !== 'slide'), [{time: 1, type: 'door', gain: .45}, {time: 1.5, type: 'step'}, {time: two, type: 'crumble', gain: .3}]);
});

test('65 sounds in one scene refuse when the film is built; 64 compile', async () => {
  const many = n => Array.from({length: n}, (_, i) => ({time: .1 + i * .05, type: i % 2 ? 'tap' : 'step'}));
  assert.equal((await film({story: many(64)})).sounds.length, 64);
  await assert.rejects(film({story: many(65)}), /Scene "one" has 65 sounds \(step ×33, tap ×32\); a scene takes at most 64/);
});

test('the recipe top level is checked: an unknown key refuses, a host key named in hostKeys is allowed and ignored', async () => {
  await assert.rejects(film({recipe: {terms: {pebble: 'a small stone'}}}), /The recipe has unsupported key "terms"\. A recipe takes story, whiteboard, pushIn, card, stages, guesses, notes, recalls, poster, reading, paperStyle\. If your application reads "terms" itself, name it: compileFilm\(\{…, hostKeys: \["terms"\]\}\)/);
  await assert.rejects(film({recipe: {stage: []}}), /unsupported key "stage"/);
  const hosted = await film({recipe: {terms: {pebble: 'a small stone'}}, hostKeys: ['terms']}), plain = await film();
  assert.deepEqual(hosted.beats, plain.beats, 'the engine never reads a host key');
  await assert.rejects(film({hostKeys: ['story']}), /hostKeys names "story", which is the recipe's own key/);
  await assert.rejects(film({hostKeys: 'terms'}), /hostKeys must be a list of key names/);
  await assert.rejects(compileFilm({storyboard, timings, recipe: [], kits: [storyKit([])]}), /The recipe must be an object/);
});
