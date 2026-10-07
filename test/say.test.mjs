// Number slots (clock.mjs · say): the voice says words, the captions show digits. The scene's text is what
// is spoken; a beat may name a phrase as shown or as spoken; numbers left as digits are listed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {captionChunks, captionFile} from 'footprint-narration';
import {checkScene, spokenText, unsaidNumbers, makeClock, evenTimings, sceneText} from '../src/clock.mjs';
import {compileFilm, spokenTracks} from '../src/index.mjs';

/** The words a caption shows for one scene, through the clock (footprint-narration's shownWords over the scene's slots). */
const shownWords = (scene, words) => makeClock({scenes: [scene]}, {scenes: [{...evenTimings({scenes: [scene]}).scenes[0], words}]}).shownWords(0);

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
  const words = captionChunks(spokenTracks(film)).flatMap(c => c.words.map(w => w.text));
  assert.ok(words.includes('16.67 ms,') && words.includes('60 Hz.'), words.join(' '));
  assert.ok(!words.includes('sixteen'), 'the spoken run is not captioned word by word');
  assert.match(captionFile(captionChunks(spokenTracks(film), {maxWords: 12, breaks: 'sentence'}), 'srt'), /16\.67 ms, at 60 Hz\./);
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

// A slot is a position (review 2026-10-02): the digits are shown where the slot is, and nowhere else.
const capt = s => shownWords(s, evenTimings({scenes: [s]}).scenes[0].words).map(w => w.text).join(' ');
test('captions put the digits where the slot is, keep the punctuation around it, and keep a word the slot is joined to', () => {
  assert.equal(capt({id: 'a', narration: 'Three sheep went out, and 3 came home.', say: [['3', 'three']]}), 'Three sheep went out, and 3 came home.');
  assert.equal(capt({id: 'a', narration: 'Refresh at ("60 Hz") today.', say: [['60 Hz', 'sixty hertz']]}), 'Refresh at ("60 Hz") today.');
  assert.equal(capt({id: 'a', narration: 'A 3-pebble bag.', say: [['3', 'three']]}), 'A 3-pebble bag.');
  assert.equal(capt({id: 'a', narration: 'Wait 2—then go.', say: [['2', 'two']]}), 'Wait 2—then go.');
  assert.equal(capt({id: 'a', narration: 'Take 2 steps, then 12 more.', say: [['2', 'two'], ['12', 'twelve']]}), 'Take 2 steps, then 12 more.');
});

test('the same digits written again are not a slot there: the voice would read them, so they are listed', () => {
  const twice = {id: 'a', narration: 'At 60 Hz the screen redraws at 60 Hz.', say: [['60 Hz', 'sixty hertz']]};
  assert.equal(spokenText(twice), 'At sixty hertz the screen redraws at 60 Hz.');
  assert.deepEqual(unsaidNumbers({scenes: [twice]}), [{scene: 'a', text: '60'}]);
  const nested = {id: 'a', narration: 'Take 2 steps, then 12 more.', say: [['2', 'two'], ['12', 'twelve']]};
  assert.equal(spokenText(nested), 'Take two steps, then twelve more.');
  assert.deepEqual(unsaidNumbers({scenes: [nested]}), [], 'a slot inside another number is no number left unsaid');
  const clock = makeClock({scenes: [nested]}, evenTimings({scenes: [nested]}));
  assert.equal(clock.at(['a', 'then 12 more']), clock.at(['a', 'then twelve more']), 'a phrase with the second slot finds its words');
  assert.equal(clock.at(['a', 'Take 2']), clock.at(['a', 'take two']));
});

test('a phrase written as shown matches like any phrase: any case, any spacing; part of a slot covers all of it', () => {
  const clock = makeClock({scenes: [scene]}, evenTimings({scenes: [scene]}));
  for (const phrase of ['AT 60 HZ', 'at 60hz', 'at, 60 Hz!']) assert.equal(clock.at(['frame', phrase]), clock.at(['frame', 'at sixty hertz']), phrase);
  assert.equal(clock.at(['frame', 'takes 16.67']), clock.at(['frame', 'takes sixteen point six seven milliseconds']));
  assert.equal(clock.at({scene: 'frame', phrase: 'takes 16.67', edge: 'end'}), clock.at({scene: 'frame', phrase: 'milliseconds', edge: 'end'}), 'the slot\'s whole run');
});

test('a pacing hold after a phrase written as shown holds where the same phrase as spoken would', async () => {
  const {paceTimings} = await import('../src/pacing.mjs');
  const storyboard = {scenes: [scene]}, even = evenTimings(storyboard);
  const pacing = after => ({voiceSpeed: 1, sceneTail: .5, holds: [{scene: 'frame', after: 'takes 16.67 ms', seconds: 1}].map(h => ({...h, after}))});
  const shownHold = paceTimings(storyboard, even, pacing('takes 16.67 ms')), spokenHold = paceTimings(storyboard, even, pacing('takes sixteen point six seven milliseconds'));
  assert.deepEqual(shownHold.scenes[0].words, spokenHold.scenes[0].words);
  assert.ok(shownHold.scenes[0].duration > even.scenes[0].duration);
});

// Recheck 2026-10-02: a slot stands whole (not inside a longer number or word); two slots in one word both show.
test('a slot stands whole: "2" is not found inside 12, B2 or 2012', () => {
  assert.equal(spokenText({id: 'a', narration: 'Take 12 steps, then 2 more.', say: [['2', 'two']]}), 'Take 12 steps, then two more.');
  assert.equal(spokenText({id: 'a', narration: 'Pick the B2 seat, row 2.', say: [['2', 'two']]}), 'Pick the B2 seat, row two.');
  assert.equal(spokenText({id: 'a', narration: 'In 2012, 2 sheep left.', say: [['2', 'two']]}), 'In 2012, two sheep left.');
  assert.throws(() => checkScene({id: 'a', narration: 'In 2012 they left.', say: [['2', 'two']]}), /does not have as a whole/);
  assert.deepEqual(unsaidNumbers({scenes: [{id: 'a', narration: 'Take 12 steps, then 2 more.', say: [['2', 'two']]}]}), [{scene: 'a', text: '12'}]);
});

test('two slots in one spoken word both show, and the slots after them still collapse', () => {
  assert.equal(capt({id: 'a', narration: 'A 3-4 split.', say: [['3', 'three'], ['4', 'four']]}), 'A 3-4 split.');
  assert.equal(capt({id: 'a', narration: 'Score 3-4 then 5 more.', say: [['3', 'three'], ['4', 'four'], ['5', 'five']]}), 'Score 3-4 then 5 more.');
});
