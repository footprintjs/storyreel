// Who says each word (clock.mjs): a word's own `speaker` — written by a voice step that knows who said what — drives
// speaking, turns, gaze and the mouth, so the narrator and the characters can take turns inside one scene. Without
// word speakers, nothing changes. And captions end a sentence that ends inside a quote.
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeClock, evenTimings, compileFilm, captionChunks} from '../src/index.mjs';

const board = {scenes: [{id: 'shop', narration: 'Amaira is helping today. Amaira, can you count the cups? Yes! One, two, three. Good. Then Mom goes on.'}]};
/** Even word times, each word said by whoever the script says. */
function voiced(who) {
  const t = evenTimings(board);
  t.scenes[0].words = t.scenes[0].words.map((w, k) => ({...w, ...(who(k, w.text) ? {speaker: who(k, w.text)} : {})}));
  return t;
}
// Words 0–3 narrator, 4–9 mom ("Amaira, can you count the cups?"), 10–13 amaira ("Yes! One, two, three."), 14 mom ("Good."), 15–18 narrator.
const who = k => (k >= 4 && k <= 9 ? 'mom' : k >= 10 && k <= 13 ? 'amaira' : k === 14 ? 'mom' : null);

test('a word\'s own speaker: speaking, turns and gaze follow who says each word', () => {
  const timings = voiced(who), clock = makeClock(board, timings), words = clock.words('shop');
  assert.deepEqual(clock.turns().map(r => r.speaker), ['mom', 'amaira', 'mom'], 'one run per speaker, the narrator in between is nobody\'s turn');
  assert.equal(clock.speaking((words[5].start + words[5].end) / 2).speaker, 'mom');
  assert.equal(clock.speaking((words[11].start + words[11].end) / 2).speaker, 'amaira');
  assert.equal(clock.speaking((words[1].start + words[1].end) / 2).speaker, null, 'a word with no speaker is the narrator\'s');
  const amaira = (words[11].start + words[11].end) / 2;
  assert.equal(clock.gaze(amaira, 'mom').at, 'amaira', 'Mom looks at Amaira while she speaks');
  assert.deepEqual(Object.keys(words[5]), ['text', 'start', 'end', 'speaker'], 'a word that carried a speaker keeps it');
  assert.deepEqual(Object.keys(words[1]), ['text', 'start', 'end'], 'one that did not, does not grow one');
  assert.throws(() => makeClock(board, voiced(k => (k === 2 ? 7 : null))), /the word "helping" has speaker 7/);
});

test('without word speakers nothing changes: a scene\'s speaker is one turn, as before', () => {
  const scenes = {scenes: [{id: 'a', speaker: 'robot', narration: 'Done! I animated the menu.'}, {id: 'b', narration: 'Until then, a tip.'}]};
  const clock = makeClock(scenes, evenTimings(scenes));
  assert.deepEqual(clock.turns().map(r => [r.scene, r.speaker]), [['a', 'robot']]);
  assert.deepEqual(clock.words('a').map(w => Object.keys(w)), clock.words('a').map(() => ['text', 'start', 'end']));
});

test('captions end a sentence that ends inside a quote', async () => {
  const quoted = {scenes: [{id: 'q', narration: 'She said, "We open tomorrow!" Then she smiled. "Can you help me?" he asked.'}]};
  const film = await compileFilm({storyboard: quoted, timings: evenTimings(quoted), recipe: {story: {kit: 'whiteboard', items: []}}});
  const lines = captionChunks(film, {maxWords: 20, breaks: 'sentence'}).map(c => c.words.map(w => w.text).join(' '));
  assert.deepEqual(lines, ['She said, "We open tomorrow!"', 'Then she smiled.', '"Can you help me?"', 'he asked.']);
});
