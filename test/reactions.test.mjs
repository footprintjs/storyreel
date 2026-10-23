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

test('nothing reacts while the listener speaks: a nod, a lean or a brighten under way lets go before her turn', () => {
  // Grandpa and Amaira take quick turns: each of his sentences would still be acted on when she starts to answer.
  const quick = {scenes: [
    {id: 'g1', speaker: 'grandpa', narration: 'That is all.'}, {id: 'a1', speaker: 'amaira', narration: 'Yes.'},
    {id: 'g2', speaker: 'grandpa', narration: 'Do you know why?'}, {id: 'a2', speaker: 'amaira', narration: 'No.'},
    {id: 'g3', speaker: 'grandpa', narration: 'It was easy!'}, {id: 'a3', speaker: 'amaira', narration: 'Wow.'},
  ]};
  const fast = makeClock(quick, evenTimings(quick, {lead: .1, tail: .3}));
  const at = (t, options) => reactionAt(fast, t, 'amaira', {chance: 1, seed: 3, ...options});
  for (const [scene, kind] of [['a1', 'nod'], ['a2', 'lean'], ['a3', 'brighten']]) {
    const turn = fast.turns().find(g => g.scene === scene);
    const before = Array.from({length: 30}, (_, k) => at(turn.start - .3 + k / 100)[kind]);
    assert.ok(before.some(v => Math.abs(v) > .05), `a ${kind} is under way just before her turn in ${scene}`);
    for (let t = turn.start; t <= turn.end; t += 1 / 240) {
      const r = at(t);
      assert.deepEqual([r.nod, r.lean, r.brighten], [0, 0, 0], `nothing moves at ${t.toFixed(3)} s, in her own turn (${scene})`);
    }
    let worst = 0;
    for (let t = turn.start - .4; t < turn.start; t += 1 / 240) worst = Math.max(worst, Math.abs(at(t + 1 / 240)[kind] - at(t)[kind]));
    assert.ok(worst < .06, `the ${kind} lets go smoothly (largest step ${worst.toFixed(3)} at 240 fps)`);
  }
});

test('nobody reacts to the narrator, and a listener reacts only to the others', () => {
  assert.ok(sample('grandpa', {}, clock.start('told') + 1, clock.total).every(f => f.nod === 0 && f.lean === 0 && f.brighten === 0), 'the narrator is nobody on screen');
  assert.ok(sample('grandpa').every(f => f.nod === 0 || f.cause.nod.speaker === 'amaira'), 'grandpa reacts only to amaira');
});

test('the listener looks at the speaker (clock.gaze)', () => {
  const mid = words[3].start;
  assert.deepEqual(reactionAt(clock, mid, 'amaira').look, clock.gaze(mid, 'amaira'));
  assert.equal(reactionAt(clock, mid, 'amaira').look.at, 'grandpa');
  assert.equal(reactionAt({turns: () => [], words: () => []}, 1, 'amaira').look, null, 'a clock with no gaze: no look');
});

test('two listeners rarely react in step; one listener is the same every time', () => {
  const a = sample('amaira'), b = sample('kavin');
  const start = frames => frames.filter((f, k) => f.nod !== 0 && (k === 0 || frames[k - 1].nod === 0)).map(f => +f.t.toFixed(3));
  assert.notDeepEqual(start(a), start(b), 'they start their nods at different moments');
  assert.ok(a.some((f, k) => Math.abs(f.nod - b[k].nod) > .1), 'their heads differ');
  assert.deepEqual(sample('amaira', {seed: 7}), sample('amaira', {seed: 7}), 'a pure function of time');
  assert.notDeepEqual(start(sample('amaira', {seed: 7})), start(sample('amaira', {seed: 8})), 'the seed sets the timing');
  assert.deepEqual(reactionAt(clock, 3.3, 'amaira'), reactionAt(makeClock(board, evenTimings(board)), 3.3, 'amaira'), 'the same on another clock of the same film');
});

test('an edit early in the film leaves the reactions to the last scene as they were (the segment cache stays local)', () => {
  const film = first => ({scenes: [
    {id: 'one', speaker: 'grandpa', narration: first},
    {id: 'two', speaker: 'amaira', narration: 'I see.'},
    {id: 'three', speaker: 'grandpa', narration: 'We counted sheep. We counted stones. Can you count them? Count with me!'},
  ]});
  const before = makeClock(film('Long ago, people counted with stones.'), evenTimings(film('Long ago, people counted with stones.')));
  const after = makeClock(film('Long, long ago, people in the hills counted sheep with stones. They kept them in a bag.'), evenTimings(film('Long, long ago, people in the hills counted sheep with stones. They kept them in a bag.')));
  const last = c => Array.from({length: 360}, (_, k) => { const r = reactionAt(c, c.start('three') + k / 60, 'amaira', {chance: .6}); return [r.nod, r.lean, r.brighten].map(v => +v.toFixed(9)); });   // (to the nanosecond's float noise: the times are on another clock)
  assert.ok(after.start('three') > before.start('three') + 1, '(the edit moves the last scene later)');
  assert.ok(last(before).some(([n]) => n !== 0), '(she reacts in the last scene)');
  assert.deepEqual(last(after), last(before), 'the same nods, leans and brightens, on the last scene\'s own clock');
});

test('a sentence said again in a scene draws its own reaction', () => {
  const twice = {scenes: [{id: 'yes', speaker: 'grandpa', narration: 'Yes. Yes. Yes. Yes. Yes. Yes.'}]};
  const c = makeClock(twice, evenTimings(twice, {wordSeconds: 1}));
  const starts = Array.from({length: 7 * 240}, (_, k) => k / 240).map(t => reactionAt(c, t, 'amaira', {chance: 1})).map((r, k, all) => (r.nod !== 0 && (k === 0 || all[k - 1].nod === 0) ? k / 240 - r.cause.nod.end : null)).filter(x => x !== null);
  assert.ok(starts.length >= 4, `she nods after most of them (${starts.length})`);
  assert.ok(new Set(starts.map(x => x.toFixed(3))).size > 1, 'not the same delay after every "Yes."');
});

test('back-to-back sentences: one nod at a time, and the head never jumps', () => {
  const rapid = {scenes: [{id: 'quick', speaker: 'grandpa', narration: 'Yes. No. Okay. Sure. Fine. Good.'}]};
  const c = makeClock(rapid, evenTimings(rapid));
  const frames = Array.from({length: Math.ceil(c.total * 240)}, (_, k) => ({t: k / 240, ...reactionAt(c, k / 240, 'amaira', {chance: 1})}));
  const starts = frames.filter((f, k) => f.nod !== 0 && (k === 0 || frames[k - 1].nod === 0 || frames[k - 1].cause.nod !== f.cause.nod)).map(f => f.t);
  assert.ok(starts.length >= 2 && starts.length < 6, `fewer nods than sentences (${starts.length} for 6): they would overlap`);
  starts.slice(1).forEach((t, k) => assert.ok(t - starts[k] >= REACTING.nodFor - 1 / 240, `a nod at ${t.toFixed(3)} s waits for the one at ${starts[k].toFixed(3)} s to finish`));
  let worst = 0;
  for (let k = 1; k < frames.length; k++) worst = Math.max(worst, Math.abs(frames[k].nod - frames[k - 1].nod));
  assert.ok(worst < .05, `the nod moves smoothly at 240 fps (largest step ${worst.toFixed(3)})`);
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
  assert.throws(() => reactionAt(clock, 1, 'a', {seed: 'x'}), /seed is a number \(e\.g\. 7; left out, one made from the listener's name\), not "x"/);
  // A number given as text, or null, is no number: it refuses instead of being read as one.
  assert.throws(() => reactionAt(clock, 1, 'a', {nod: '0.5'}), /nod is a number \(e\.g\. 0\.5\), not "0\.5"/);
  assert.throws(() => reactionAt(clock, 1, 'a', {delay: null}), /delay is a number \(e\.g\. 0\.15\), not null/);
  assert.throws(() => reactionAt(clock, 1, 'a', {nodFor: '1'}), /nodFor is a number/);
  assert.throws(() => reactionAt(clock, 1, 'a', {seed: null}), /seed is a number .* not null/);
  assert.throws(() => reactionAt(clock, 1, 'a', {chance: true}), /chance is a number/);
});
