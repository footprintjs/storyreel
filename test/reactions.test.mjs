// Listener reactions (reactions.mjs): while another character speaks, a listener nods a moment after each sentence,
// leans in on a question and brightens on an exclamation — all read from the voice's own timings — and two listeners
// never react in step.
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeClock, evenTimings} from '../src/clock.mjs';
import {reactionAt, REACTING} from '../src/acting.mjs';

const board = {scenes: [
  {id: 'tell', speaker: 'grandpa', narration: 'Long ago, people counted with stones. They kept them in a bag. Can you guess why? It was easy!'},
  {id: 'answer', speaker: 'amaira', narration: 'Because stones last.'},
  {id: 'told', narration: 'And so they did.'},
]};
const clock = makeClock(board, evenTimings(board));
const words = clock.words('tell'), ends = words.filter(w => /[.!?]$/.test(w.text));
const sample = (who, options, from = 0, to = clock.total, step = 1 / 60) => Array.from({length: Math.ceil((to - from) / step)}, (_, k) => ({t: from + k * step, ...reactionAt(clock, from + k * step, who, options)}));

test('a nod lands after a sentence ends, never during its words', () => {
  const frames = sample('amaira');
  const nodding = frames.filter(f => f.nod !== 0);
  assert.ok(nodding.length, 'she nods');
  for (const f of nodding) {
    const s = f.cause.nod;
    assert.equal(s.speaker, 'grandpa');
    assert.ok(f.t >= s.end + REACTING.delay - 1e-9, `the nod at ${f.t.toFixed(2)} s comes after "${s.text}" ends (${s.end} s) and a beat`);
    assert.ok(f.t <= s.end + REACTING.delay + REACTING.spread + REACTING.nodFor + 1e-9, 'and within its spread and its length');
    assert.ok(!words.some(w => w.start <= f.t && f.t < w.end && w.start >= s.start && w.end <= s.end), 'never while a word of that sentence is said');
  }
  assert.ok(nodding.every(f => f.cause.nod.mark === '.'), 'a statement nods; a question leans and an exclamation brightens instead');
});

test('a nod dips, comes back up a little past rest, and settles', () => {
  const frames = sample('amaira'), first = frames.findIndex(f => f.nod !== 0), run = [];
  for (let k = first; k < frames.length && frames[k].cause.nod === frames[first].cause.nod; k++) run.push(frames[k].nod);
  const deepest = Math.max(...run), rebound = Math.min(...run);
  assert.ok(deepest > .3 && deepest <= REACTING.nod + 1e-9, `a soft dip (${deepest.toFixed(2)})`);
  assert.ok(rebound < 0 && rebound > -.2, `a little back up past rest (${rebound.toFixed(2)})`);
  assert.ok(run.indexOf(deepest) < run.indexOf(rebound), 'down first, then the rebound');
  assert.ok(Math.abs(run[0]) < .05 && Math.abs(run.at(-1)) < .05, 'it starts and ends at rest');
});

test('a question leans the listener in until the answer; an exclamation brightens', () => {
  const question = clock.words('tell').find(w => w.text === 'why?'), exclaim = clock.words('tell').at(-1), answer = clock.words('answer')[0].start;
  const during = reactionAt(clock, question.end, 'amaira');
  assert.ok(during.lean > .3, `leaning in as the question ends (${during.lean.toFixed(2)})`);
  assert.equal(during.cause.lean.mark, '?'); assert.equal(during.cause.lean.text, 'Can you guess why?');
  assert.ok(reactionAt(clock, question.end + .5, 'amaira').lean > .3, 'held while the answer is awaited');
  assert.equal(reactionAt(clock, question.end + REACTING.leanHold + REACTING.leanBack + .01, 'amaira').lean, 0, 'and back');
  const bright = reactionAt(clock, exclaim.end + .4, 'amaira');
  assert.ok(bright.brighten > .5, `brightens at "It was easy!" (${bright.brighten.toFixed(2)})`);
  assert.equal(bright.cause.brighten.mark, '!');
  assert.equal(reactionAt(clock, exclaim.end + REACTING.brightenFor + .3, 'amaira').brighten, 0, 'and it passes');
  assert.ok(answer > exclaim.end, '(the answer comes after)');
});

test('nothing reacts while the listener speaks, nor to the narrator', () => {
  const own = clock.turns().find(g => g.speaker === 'amaira');
  assert.ok(sample('amaira', {}, own.start, own.end).every(f => f.nod === 0), 'no nods during her own turn');
  assert.ok(sample('grandpa', {}, clock.start('told'), clock.total).every(f => f.nod === 0 && f.lean === 0 && f.brighten === 0), 'the narrator is nobody on screen');
  assert.ok(sample('grandpa').every(f => f.nod === 0 || f.cause.nod.speaker === 'amaira'), 'grandpa reacts only to amaira');
});

test('the listener looks at the speaker (clock.gaze)', () => {
  const mid = words[3].start;
  assert.deepEqual(reactionAt(clock, mid, 'amaira').look, clock.gaze(mid, 'amaira'));
  assert.equal(reactionAt(clock, mid, 'amaira').look.at, 'grandpa');
  assert.equal(reactionAt({turns: () => [], words: () => []}, 1, 'amaira').look, null, 'a clock with no gaze: no look');
});

test('two listeners never react in step; one listener is the same every time', () => {
  const a = sample('amaira'), b = sample('kavin');
  const start = frames => frames.filter((f, k) => f.nod !== 0 && (k === 0 || frames[k - 1].nod === 0)).map(f => +f.t.toFixed(3));
  assert.notDeepEqual(start(a), start(b), 'they start their nods at different moments');
  assert.ok(a.some((f, k) => Math.abs(f.nod - b[k].nod) > .1), 'their heads differ');
  assert.deepEqual(sample('amaira', {seed: 7}), sample('amaira', {seed: 7}), 'a pure function of time');
  assert.notDeepEqual(start(sample('amaira', {seed: 7})), start(sample('amaira', {seed: 8})), 'the seed sets the timing');
  assert.deepEqual(reactionAt(clock, 3.3, 'amaira'), reactionAt(makeClock(board, evenTimings(board)), 3.3, 'amaira'), 'the same on another clock of the same film');
});

test('fewer nods than sentences: chance', () => {
  const statements = ends.filter(w => w.text.endsWith('.')).length;
  const nods = frames => new Set(frames.filter(f => f.nod !== 0).map(f => f.cause.nod.end)).size;
  assert.equal(nods(sample('amaira', {chance: 1})), statements, 'chance 1: a nod for every statement');
  assert.equal(nods(sample('amaira', {chance: 0})), 0, 'chance 0: none');
});

test('bad calls refuse, naming the problem', () => {
  assert.throws(() => reactionAt({}, 1, 'a'), /clock is the film's clock \(makeClock\): it reads turns\(\) and words\(scene\)/);
  assert.throws(() => reactionAt(clock, 1, null), /who is the listener's name .* the narrator is nobody on screen/);
  assert.throws(() => reactionAt(clock, NaN, 'a'), /t is a time in seconds/);
  assert.throws(() => reactionAt(clock, 1, 'a', {wobble: 1}), /unknown option wobble; it takes delay, spread/);
  assert.throws(() => reactionAt(clock, 1, 'a', {nodFor: 0}), /nodFor is seconds, above 0/);
  assert.throws(() => reactionAt(clock, 1, 'a', {delay: -1}), /delay is seconds, 0 or more/);
  assert.throws(() => reactionAt(clock, 1, 'a', {nod: 2}), /nod is how big the reaction is: give a number 0..1 \(e.g. 0.5\), not 2/);
  assert.throws(() => reactionAt(clock, 1, 'a', {chance: 1.5}), /chance is the share of sentences a listener nods at: give a number 0..1/);
  assert.throws(() => reactionAt(clock, 1, 'a', {seed: 'x'}), /seed is a number/);
});
