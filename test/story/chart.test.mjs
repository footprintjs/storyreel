// The story chart end to end, on a scripted fake model: the route, the shape, the fix loop and its limit, retries, stops,
// and the record saying why each choice was made.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {readStoryboard} from 'footprint-story/storyboard';
import {storyFromConversation} from '../../src/storyboard/story.mjs';
import {CHAT, PICKED, STORY, scripted} from './fakes.test.mjs';

const run = (script, options = {}) => { const fake = scripted(script); return {fake, made: storyFromConversation({conversation: {messages: CHAT}, model: fake.model, ...options})}; };
const decisions = (record) => record.narrative.filter((e) => e.type === 'condition').map((e) => e.text);
const WRONG = {...STORY, checked: STORY.checked.map((c, i) => (i === 1 ? {...c, found: '26 hidden characters took 9999 ms'} : c))};

test('a conversation in one window: one pick, one shape, one board, and every scene known or not sure for a reason', async () => {
  const {fake, made} = run({pick: [PICKED], write: [STORY]});
  const result = await made;
  assert.equal(result.stopped, null);
  assert.equal(result.shape, 'what-we-found');
  assert.deepEqual(result.board, readStoryboard(STORY, {conversation: CHAT}));
  assert.equal(result.standing['checked-2'].standing, 'known');
  assert.equal(result.standing['unsure-1'].standing, 'not-sure');
  assert.deepEqual(result.ask, []);
  assert.deepEqual([fake.asked('pick'), fake.asked('write'), fake.asked('fix')], [1, 1, 0]);
  const why = decisions(result.record);
  assert.match(why[0], /The conversation fits in one window.*windowCount 1 eq 1/);
  assert.match(why[1], /Every window has been picked from/);
  assert.match(why[2], /One drawable shape fits the points.*fitCount 1 eq 1/);
  assert.match(why[3], /The board reads against the whole conversation.*problemCount 0 eq 0/);
});

test('a wrong board makes the fix loop run: only the piece at fault goes back, and it ends not sure', async () => {
  const {fake, made} = run({pick: [PICKED], write: [WRONG], fix: [STORY.checked[1]]});
  const result = await made, state = result.record.snapshot.sharedState;
  assert.equal(result.stopped, null);
  assert.equal(result.board.scenes.find((s) => s.id === 'checked-2').title, STORY.checked[1].found);
  assert.equal(fake.asked('fix'), 1);
  assert.ok(fake.briefs.find((b) => b.stage === 'fix').material.startsWith('checked[1]\n'));
  assert.deepEqual(state.fixes, [{round: 1, piece: 'checked[1]', problems: 1, tries: 1, answered: true}]);
  assert.equal(result.standing['checked-2'].standing, 'not-sure');
  assert.equal(result.standing['checked-1'].standing, 'known');
  const why = decisions(result.record);
  assert.match(why.at(-2), /fix rounds are left: each piece at fault goes back on its own.*fixesLeft 3 gt 0/);
  assert.match(why.at(-1), /The board reads/);
});

test('a model that keeps writing it wrong stops at the limit, with the problems on the result and no board', async () => {
  const {fake, made} = run({pick: [PICKED], write: [WRONG], fix: [WRONG.checked[1]]});
  const result = await made;
  assert.equal(result.board, null);
  assert.deepEqual(result.stopped, {at: 'judge', why: 'fixes-used-up'});
  assert.equal(fake.asked('fix'), 3);
  assert.deepEqual(result.problems.map((p) => p.at), ['checked[1]']);
  assert.equal(result.record.snapshot.sharedState.fixRound, 3);
  assert.match(decisions(result.record).at(-1), /The fix rounds are used up/);
  assert.ok(result.record.narrative.some((e) => e.type === 'break'));
});

test('mostFix is data: none means the first wrong board stops the run', async () => {
  const {fake, made} = run({pick: [PICKED], write: [WRONG]}, {mostFix: 0});
  assert.deepEqual((await made).stopped, {at: 'judge', why: 'fixes-used-up'});
  assert.equal(fake.asked('fix'), 0);
});

test('an answer it cannot use is asked again by the retry policy, and the record says so', async () => {
  const {fake, made} = run({pick: ['not json at all', PICKED], write: [STORY]});
  const result = await made;
  assert.equal(result.stopped, null);
  assert.equal(fake.asked('pick'), 2);
  assert.ok(result.record.narrative.some((e) => e.type === 'attempt' && /Attempt 1 of 2 at pick failed/.test(e.text)));
});

test('a window with no usable points after the retry is marked, and no shape fits what is left', async () => {
  const {fake, made} = run({pick: [{points: [{part: 'found', text: 'x', sources: ['m99']}]}]});
  const result = await made;
  assert.equal(fake.asked('pick'), 2);
  const state = result.record.snapshot.sharedState;
  assert.deepEqual(state.pick, {window: 0, messages: 5, points: 0, refused: 'outside-window'});
  assert.equal(state.refusedWindows, 1);
  assert.deepEqual(result.stopped, {at: 'choose-shape', why: 'none-fits'});
  assert.match(decisions(result.record).at(-1), /No drawable shape fits the points/);
  assert.equal(fake.asked('write'), 0);
});

test('a shape the drawer does not draw stops the run before anything is written', async () => {
  const {fake, made} = run({pick: [PICKED]}, {shape: 'told-twice'});
  const result = await made;
  assert.deepEqual(result.stopped, {at: 'choose-shape', why: 'asked-undrawable'});
  assert.match(decisions(result.record).at(-1), /not one the drawer draws.*askedDrawable false eq false/);
  assert.equal(fake.asked('write'), 0);
});

test('a write that is never an object stops the run at the write', async () => {
  const {fake, made} = run({pick: [PICKED], write: ['[]']});
  assert.deepEqual((await made).stopped, {at: 'write', why: 'model-refused'});
  assert.equal(fake.asked('write'), 2);
});

test('a model that throws rejects the run at once, never asked again, its own error off the record and on the cause', async () => {
  const boom = new Error('the provider said no');
  let asked = 0;
  const error = await storyFromConversation({conversation: {messages: CHAT}, model: {answer: () => { asked++; throw boom; }}}).catch((e) => e);
  assert.equal(error.name, 'ModelFailed');
  assert.equal(asked, 1, 'a model that failed is not retried');
  assert.equal(error.cause, boom);
  assert.doesNotMatch(JSON.stringify(error.record), /provider said no/);
});

test('each piece of a fix round gets its own tries: a later piece is not left one by an earlier one', async () => {
  const twoWrong = {...WRONG, found: STORY.found.map((f) => ({...f, line: 'It took 7777 ms'}))};
  const answers = {'checked[1]': ['nonsense', STORY.checked[1]], 'found[0]': ['nonsense', STORY.found[0]]}, used = {};
  const fix = (b) => { const piece = b.material.split('\n')[0]; used[piece] = (used[piece] ?? 0) + 1; return answers[piece][used[piece] - 1]; };
  const {made} = run({pick: [PICKED], write: [twoWrong], fix: [fix]});
  const result = await made;
  assert.equal(result.stopped, null);
  assert.deepEqual(result.record.snapshot.sharedState.fixes.map((f) => [f.piece, f.tries, Boolean(f.answered)]), [['checked[1]', 2, true], ['found[0]', 2, true]]);
});

test('a long conversation is picked window by window, and no pick brief is larger than a window', async () => {
  const filler = Array.from({length: 40}, (_, i) => ({id: `f${i}`, text: 'more talk about the work, '.repeat(4)}));
  const script = {pick: [(b) => (b.ids.includes('m1') ? PICKED : {points: []})], write: [STORY]};
  const {fake, made} = run(script, {conversation: {messages: [...CHAT, ...filler]}, window: 2048});
  const result = await made, state = result.record.snapshot.sharedState;
  assert.ok(state.windowCount > 2);
  assert.equal(fake.asked('pick'), state.windowCount);
  for (const b of fake.briefs.filter((x) => x.stage === 'pick')) assert.ok(Buffer.byteLength(b.material) <= 2048);
  assert.match(decisions(result.record)[0], /larger than one window/);
  assert.equal(result.stopped, null);
});

test('the chart reaches footprintjs through engine.mjs alone', () => {
  const root = fileURLToPath(new URL('../../src/storyboard/story/', import.meta.url));
  const files = [...readdirSync(root, {recursive: true}).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs')), '../story.mjs'];
  const importing = files.filter((f) => /from 'footprintjs/.test(readFileSync(path.join(root, f), 'utf8')));
  assert.deepEqual(importing, ['engine.mjs']);
});
