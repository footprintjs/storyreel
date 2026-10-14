// Verdicts (verdict.mjs): what a check answers — passed, failed, or not run — decided with decide() over what it
// measured, so the record keeps the rule, the values and the thresholds. Nothing measured is never a pass. In the
// review, a verdict check of your own has the same shape as the built-in ones.
import test from 'node:test';
import assert from 'node:assert/strict';
import {flowChart, narrative} from 'footprintjs';
import {VERDICTS, readVerdict, verdictChart, verdictsText} from '../src/verdict.mjs';
import {compileFilm, evenTimings} from '../src/index.mjs';
import {reviewPart, REVIEW_CHECKS} from '../src/review.mjs';

const rules = {rules: [{when: {late: {gt: 2}}, then: 'failed', label: 'more than two late'}, {when: {seen: {eq: 0}}, then: 'not run', label: 'nothing seen'}], passed: 'two late or fewer'};
/** Run a verdict chart as a subflow of a one-stage chart; returns the verdict, why, and the record's condition lines. */
async function decideOver(measure, {verdict = rules, on} = {}) {
  const trace = narrative(), chart = verdictChart({name: 'late', id: 'late', measure, verdict, on});
  const run = await flowChart('start', () => {}, 'start').addSubFlowChartNext('late', chart, 'late', {outputMapper: o => ({out: {verdict: o.verdict, why: o.why}})}).build().recorder(trace).run();
  return {...(run?.state ?? run?.sharedState).out, said: trace.getEntries().filter(e => e.type === 'condition').map(e => e.text)};
}

test('a verdict is decided over what was measured, and the record says why', async () => {
  assert.deepEqual(VERDICTS, ['passed', 'failed', 'not run']);
  const failed = await decideOver(s => { s.late = 3; s.seen = 5; s.measured = true; });
  assert.deepEqual([failed.verdict, failed.why], ['failed', 'more than two late']);
  assert.match(failed.said[0], /It evaluated Rule 1 "more than two late": late 3 gt 2 ✓, and chose late\/failed/);
  const passed = await decideOver(s => { s.late = 1; s.seen = 5; s.measured = true; });
  assert.deepEqual([passed.verdict, passed.why], ['passed', 'two late or fewer']);
  const none = await decideOver(s => { s.late = 0; s.seen = 0; s.measured = true; });
  assert.deepEqual([none.verdict, none.why], ['not run', 'nothing seen']);
});

test('nothing measured is not run, never a pass; a verdict may act on its answer (a refusal)', async () => {
  const unmeasured = await decideOver(s => { s.late = 0; });
  assert.deepEqual([unmeasured.verdict, unmeasured.why], ['not run', 'nothing was measured']);
  await assert.rejects(decideOver(s => { s.late = 9; s.measured = true; }, {on: {failed: s => { throw new Error(`refused: ${s.why}`); }}}), /refused: more than two late/);
});

test('a verdict\'s rules are checked as written', () => {
  assert.equal(readVerdict(rules), rules);
  for (const [spec, message] of [
    [null, /verdict must be \{rules: \[\{when, then, label\}\], passed: 'what passing means'\}/],
    [{rules: {}, passed: 'x'}, /verdict\.rules must be a list/],
    [{rules: []}, /verdict\.passed says what passing means, in words/],
    [{rules: [{when: 1, then: 'failed', label: 'x'}], passed: 'y'}, /verdict\.rules\[0\]\.when is a decide\(\) filter/],
    [{rules: [{when: {a: {gt: 1}}, then: 'maybe', label: 'x'}], passed: 'y'}, /verdict\.rules\[0\]\.then is 'passed', 'failed', 'not run', not "maybe"/],
    [{rules: [{when: {a: {gt: 1}}, then: 'failed'}], passed: 'y'}, /verdict\.rules\[0\]\.label says what the rule means/],
  ]) assert.throws(() => readVerdict(spec), message);
  assert.equal(verdictsText([{check: 'a', label: 'A', verdict: 'failed', why: 'because', summary: '3 of 4'}, {check: 'b', verdict: 'not run', why: 'no parts'}]), 'A · failed: because (3 of 4)\nb · not run: no parts');
});

const storyboard = {title: 'Mine', scenes: [{id: 'one', narration: 'a short film that has just enough words in it to be read for a while by the review'}]};
const plain = {name: 'plain', story: {compile: () => ({hang: 1, draw: c => { c.fillStyle = '#f3eee3'; c.fillRect(0, 0, 1600, 900); }})}};
const film = await compileFilm({storyboard, timings: evenTimings(storyboard, {wordSeconds: .4}), recipe: {story: {kit: 'plain'}}, kits: [plain]});
const only = extra => ({still: REVIEW_CHECKS.still, ...extra});

test('a verdict check of your own: measured values for its rules, its hits findings only when it fails', async () => {
  const long = {label: 'Short enough', why: 'always', when: () => true, measure: ({window, samples}) => ({measured: {seconds: window.to - window.from}, hits: samples.slice(0, 2).map(s => ({kind: 'long', t: s.t, what: 'too long'}))}),
    summary: m => `${m.seconds.toFixed(1)} s`};
  const failed = await reviewPart(film, {checks: only({long: {...long, verdict: {rules: [{when: {seconds: {gt: 1}}, then: 'failed', label: 'longer than a second'}], passed: 'a second or less'}}})});
  assert.deepEqual(failed.verdicts.map(v => [v.check, v.verdict, v.why]), [['long', 'failed', 'longer than a second']]);
  assert.ok(failed.verdicts[0].summary.endsWith(' s') && failed.verdicts[0].measured.seconds > 1);
  assert.deepEqual(failed.findings.filter(f => f.kind === 'long').map(f => f.what), ['too long'], 'its hits, held whatever their length (a reason, not a passing word)');
  const passed = await reviewPart(film, {checks: only({long: {...long, verdict: {rules: [{when: {seconds: {gt: 600}}, then: 'failed', label: 'longer than ten minutes'}], passed: 'ten minutes or less'}}})});
  assert.deepEqual(passed.verdicts.map(v => [v.verdict, v.why]), [['passed', 'ten minutes or less']]);
  assert.equal(passed.findings.filter(f => f.kind === 'long').length, 0);
  const unpicked = await reviewPart(film, {checks: only({long: {...long, when: () => false, notRun: 'the film is not long', verdict: {rules: [], passed: 'x'}}})});
  assert.deepEqual(unpicked.verdicts, [{check: 'long', label: 'Short enough', verdict: 'not run', why: 'the film is not long', measured: {}}]);
});

test('a verdict check that measures wrongly fails the review, naming it', async () => {
  const of = measure => ({label: 'Mine', when: () => true, measure, verdict: {rules: [], passed: 'x'}});
  await assert.rejects(reviewPart(film, {checks: only({mine: of(() => ({seconds: 1}))})}), /"mine": measure must return \{measured: \{name: value\}, hits\?: \[\{kind, t, what\}\]\}/);
  await assert.rejects(reviewPart(film, {checks: only({mine: of(async () => ({measured: {}}))})}), /"mine": measure returned a promise/);
  await assert.rejects(reviewPart(film, {checks: only({mine: of(() => ({measured: {verdict: 'passed'}}))})}), /"mine": measure's measured has verdict, a name the verdict keeps for itself/);
  await assert.rejects(reviewPart(film, {checks: only({mine: of(() => ({measured: {}, hits: [{kind: 'x', t: 'soon', what: 'y'}]}))})}), /"mine": measure's hit 0: t must be seconds on the film clock/);
  await assert.rejects(reviewPart(film, {checks: only({mine: of(() => ({measured: {}, hits: 'many'}))})}), /"mine": measure's hits must be a list of hits/);
  await assert.rejects(reviewPart(film, {checks: only({mine: of(() => { throw new Error('no ruler'); })})}), /"mine": no ruler/);
  await assert.rejects(reviewPart(film, {checks: only({mine: {...of(() => ({measured: {}})), verdict: {rules: [], passed: ''}}})}), /review check "mine": verdict\.passed says what passing means/);
});
