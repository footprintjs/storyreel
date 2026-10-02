// Number slots (clock.mjs · say): the voice says words, the captions show digits. The scene's text is what
// is spoken; a beat may name a phrase as shown or as spoken; numbers left as digits are listed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {checkScene, spokenText, shownWords, unsaidNumbers, makeClock, evenTimings, sceneText} from '../src/clock.mjs';
import {compileFilm, captionChunks, captionFile} from '../src/index.mjs';

const scene = {id: 'frame', narration: 'One frame takes 16.67 ms, at 60 Hz.', say: [['16.67 ms', 'sixteen point six seven milliseconds'], ['60 Hz', 'sixty hertz']]};

test('the voice says the spoken words; the scene\'s text is what is spoken', () => {
  assert.equal(spokenText(scene), 'One frame takes sixteen point six seven milliseconds, at sixty hertz.');
  assert.equal(sceneText(scene), spokenText(scene));
  assert.equal(spokenText({id: 'x', narration: 'No slots here.'}), 'No slots here.');
  assert.deepEqual(evenTimings({scenes: [scene]}).scenes[0].words.map(w => w.text).slice(3, 8), ['sixteen', 'point', 'six', 'seven', 'milliseconds,']);
});

test('the shown words collapse each spoken run back into its digits, timed from its first word to its last', () => {
  const words = evenTimings({scenes: [scene]}).scenes[0].words, shown = shownWords(scene, words);
  assert.deepEqual(shown.map(w => w.text), ['One', 'frame', 'takes', '16.67 ms,', 'at', '60 Hz.']);
  assert.equal(shown[3].start, words[3].start); assert.equal(shown[3].end, words[7].end);
});

test('a beat names a phrase as shown or as spoken, the same moment either way', () => {
  const clock = makeClock({scenes: [scene]}, evenTimings({scenes: [scene]}));
  assert.equal(clock.at(['frame', 'takes 16.67 ms']), clock.at(['frame', 'takes sixteen point six seven milliseconds']));
  assert.equal(clock.at(['frame', 'at 60 Hz']), clock.at(['frame', 'at sixty hertz']));
});

test('a slot that is not in the narration, out of order, or spoken in digits refuses, naming the fix', () => {
  assert.throws(() => checkScene({id: 'a', narration: 'One 16 ms.', say: [['17 ms', 'seventeen milliseconds']]}), /does not have/);
  assert.throws(() => checkScene({id: 'a', narration: 'A 1 then 2.', say: [['2', 'two'], ['1', 'one']]}), /in order/);
  assert.throws(() => checkScene({id: 'a', narration: 'A 2.', say: [['2', 'two 2']]}), /say it in words/);
  assert.throws(() => checkScene({id: 'a', narration: 'A 2.', say: [['2']]}), /must be \[shown, spoken\]/);
  assert.throws(() => checkScene({id: 'a', silent: [['a door', 1]], say: [['1', 'one']]}), /a silent scene says nothing/);
});

test('numbers left as digits are listed for the voice tool to refuse', () => {
  assert.deepEqual(unsaidNumbers({scenes: [{id: 'a', narration: 'In 1868, at 16.67 ms.', say: [['16.67 ms', 'sixteen point six seven milliseconds']]}, {id: 'b', silent: [['3 doors', 1]]}]}), [{scene: 'a', text: '1868'}]);
});

test('a film\'s captions and caption file show the digits the voice said in words', async () => {
  const storyboard = {scenes: [scene, {id: 'next', narration: 'That is one frame.'}]};
  const film = await compileFilm({storyboard, timings: evenTimings(storyboard), recipe: {story: {kit: 'whiteboard', items: [{at: ['frame', 'takes 16.67 ms'], dur: .8, write: '16.67 ms', x: 800, y: 400, size: 60, align: 'center'}]}}});
  const words = captionChunks(film).flatMap(c => c.words.map(w => w.text));
  assert.ok(words.includes('16.67 ms,') && words.includes('60 Hz.'), words.join(' '));
  assert.ok(!words.includes('sixteen'), 'the spoken run is not captioned word by word');
  assert.match(captionFile(captionChunks(film, {maxWords: 12, breaks: 'sentence'}), 'srt'), /16\.67 ms, at 60 Hz\./);
});

test('makeFilm reads the voice folder\'s word check: words not heard are listed, or refused', async () => {
  const {readVoiceCheck} = await import('../src/pipeline.mjs');
  const {mkdtempSync, writeFileSync, utimesSync} = await import('node:fs'), path = (await import('node:path')).default, {tmpdir} = await import('node:os');
  const voice = mkdtempSync(path.join(tmpdir(), 'storyreel-check-'));
  writeFileSync(path.join(voice, 'timings.json'), '{"scenes": []}');
  assert.equal(readVoiceCheck(voice), null, 'no check, nothing to say');
  writeFileSync(path.join(voice, 'word-check.json'), JSON.stringify({notHeardCount: 2, scenes: [{scene: 'next', lowWords: [['sixteen', 0.02]], notHeard: ['sixteen', 'point']}, {scene: 'cold', silent: true}]}));
  const check = readVoiceCheck(voice);
  assert.deepEqual(check.notHeard, [{scene: 'next', word: 'sixteen'}, {scene: 'next', word: 'point'}]);
  assert.deepEqual(check.lowWords, [{scene: 'next', word: 'sixteen', score: 0.02}]);
  assert.equal(check.stale, undefined);
  utimesSync(path.join(voice, 'word-check.json'), new Date(2020, 0, 1), new Date(2020, 0, 1));
  assert.match(readVoiceCheck(voice).stale, /older than timings.json/);
});
