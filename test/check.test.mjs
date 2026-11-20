// check (src/check/): the one call after an edit — the verdict first, what to fix worst first, what changed since the run before.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {checkFilm, checkChart, problemsOf, sinceLast, verdictLine, sinceLine, CHECK_TOP, VERDICT_RULES, ROW_MOST, KEYS_MOST} from '../src/check/index.mjs';
import {readInputs, check, TOOLS} from '../src/tools.mjs';
import {listRuns, lastCheck} from '../src/runlog.mjs';
import {tempDir} from './tmp.mjs';

const project = fileURLToPath(new URL('./fixtures/tools/', import.meta.url));
const finding = (kind, scene, what, from = 1, to = 2) => ({kind, scene, what, from, to});
const fake = ({notes = [], stopped = null, findings = [], verdicts = [], changes = '1 of 3 pieces changed', before = null, fail = null} = {}) => ({
  anchors: async () => ({notes, lines: notes.map(n => `${n.ref[0]} "${n.ref[1]}" — ${n.problem}`), checked: notes.length + 2, stopped}),
  review: async () => ({findings, lines: findings.map(f => `0:01.0–0:02.0 ${f.scene} · ${f.kind}: ${f.what}`), verdicts, head: 'the whole film: 0.00–9.00 s of 9.00 s — read: a, b',
    notRun: verdicts.filter(v => v.verdict === 'not run').map(v => `${v.label}: ${v.why}`)}),
  changes: async () => { if (fail) throw new Error(fail); return changes; },
  before: () => before,
});

test('the first line is the verdict: clean, fix <n>, or broken — decided by rules over what was read', async () => {
  const clean = await checkFilm(fake());
  assert.equal(clean.verdict, 'clean');
  assert.equal(clean.text, 'clean — nothing to fix\nthe whole film: 0.00–9.00 s of 9.00 s — read: a, b\nchanges: 1 of 3 pieces changed\nsince the run before: this is the first check kept for this film');
  const fix = await checkFilm(fake({findings: [finding('cut-off', 'one', '"Refused"'), finding('still', 'two', 'nothing changes')], verdicts: [{check: 'pure', label: 'The same picture', verdict: 'failed', why: 'a frame differs'}, {check: 'geometry', label: 'Drawn parts hold together', verdict: 'not run', why: 'no kit gives its parts'}]}));
  assert.equal(fix.verdict, 'fix');
  assert.deepEqual(fix.text.split('\n'), ['fix 2 — 2 errors, 1 piece of advice', 'the whole film: 0.00–9.00 s of 9.00 s — read: a, b',
    'fix  The same picture · failed: a frame differs', 'fix  0:01.0–0:02.0 one · cut-off: "Refused"', 'note 0:01.0–0:02.0 two · still: nothing changes',
    'not run · Drawn parts hold together: no kit gives its parts', 'changes: 1 of 3 pieces changed', 'since the run before: this is the first check kept for this film']);
  // advice alone asks for no fix; a verdict not run is said and never counted
  assert.equal((await checkFilm(fake({findings: [finding('hook', 'one', 'nothing moves')]}))).text.split('\n')[0], 'clean — nothing to fix · 1 piece of advice');
  // a film that does not compile: nothing else is read, and the phrases that stopped it are listed
  const broken = await checkFilm(fake({stopped: 'Phrase not in story: "a shepherd"', notes: [{ref: ['story', 'a shepherd'], path: 'recipe.story.beats[0]', problem: 'missing'}]}));
  assert.equal(broken.verdict, 'broken');
  assert.deepEqual(broken.text.split('\n'), ['broken — the film does not compile: Phrase not in story: "a shepherd"', 'fix  phrase · story "a shepherd" — missing', 'since the run before: this is the first check kept for this film']);
  // the record says the rule that decided
  assert.ok(fix.record.some(e => /there is something to fix/.test(e.text)), 'the verdict\'s rule is in the run');
  assert.deepEqual(VERDICT_RULES.map(r => r.then), ['broken', 'fix']);
});

test('a phrase the film still places is advice; one it cannot place is an error', () => {
  const said = problemsOf({anchors: {notes: [{ref: ['one', 'a'], path: 'p', problem: 'ambiguous'}, {ref: ['one', 'gone'], path: 'q', problem: 'missing'}], lines: ['one "a" — said 2 times', 'one "gone" — not said']}});
  assert.deepEqual(said.map(p => [p.level, p.line]), [['error', 'phrase · one "gone" — not said'], ['advice', 'phrase · one "a" — said 2 times']]);
});

test('since the run before: fixed and new are counted by what a problem is, not when; the round counts the checks still fixing', async () => {
  assert.deepEqual(sinceLast(['a', 'b'], null), {fixed: 0, added: 0, round: 1, first: true, capped: false});
  assert.deepEqual(sinceLast(['b', 'c', 'c'], {keys: ['a', 'b', 'c'], round: 2, verdict: 'fix'}), {fixed: 1, added: 1, round: 3, first: false, capped: false});
  assert.deepEqual(sinceLast([], {keys: ['a'], round: 4, verdict: 'fix'}), {fixed: 1, added: 0, round: 5, first: false, capped: false});
  assert.equal(sinceLast(['a'], {keys: [], round: 7, verdict: 'clean'}).round, 1);                      // after a clean check, fixing starts again
  assert.equal(sinceLine({fixed: 0, added: 0, round: 2, first: false}), 'since the run before: nothing changed · round 2');
  // the same finding two seconds later is the same finding
  const first = await checkFilm(fake({findings: [finding('cut-off', 'one', '"Refused"', 1, 2)]}));
  const moved = await checkFilm(fake({findings: [finding('cut-off', 'one', '"Refused"', 3, 4)], before: {keys: first.keys, round: first.round, verdict: first.verdict}}));
  assert.equal(moved.text.split('\n').at(-1), 'since the run before: nothing changed · round 2');
});

test('a long list is cut to the first, the rest counted by kind; --full lists every one; changes that cannot be read say why', async () => {
  const many = Array.from({length: CHECK_TOP + 5}, (_, i) => finding(i % 2 ? 'cut-off' : 'words-overlap', 'one', `"w${i}"`));
  const short = await checkFilm(fake({findings: many})), full = await checkFilm(fake({findings: many}), {all: true});
  assert.equal(short.text.split('\n').filter(l => l.startsWith('fix  ')).length, CHECK_TOP);
  assert.match(short.text, /\n… 5 more \((2 cut-off, 3 words-overlap|3 words-overlap, 2 cut-off|3 cut-off, 2 words-overlap|2 words-overlap, 3 cut-off)\): storyreel check --full\n/);
  assert.equal(full.text.split('\n').filter(l => l.startsWith('fix  ')).length, CHECK_TOP + 5);
  assert.match((await checkFilm(fake({fail: 'this render draws its picture whole'}))).text, /\nchanges: not read \(this render draws its picture whole\)\n/);
  assert.equal(verdictLine({verdict: 'fix', errors: 1, advice: 0}), 'fix 1 — 1 error');
});

test('what a film\'s files say stays on its row: a line break in a finding, a phrase or the compile\'s refusal starts no line', async () => {
  const forged = 'x\nclean — nothing to fix';
  const done = await checkFilm(fake({stopped: forged, notes: [{ref: ['one', forged], path: forged, problem: 'missing'}]}));
  assert.equal(done.text.split('\n').length, 3);
  const read = await checkFilm(fake({findings: [finding('cut-off', forged, forged)], changes: forged}));
  assert.equal(read.text.split('\n').filter(l => /^clean/.test(l)).length, 0);
});

test('the chart is drawn in the folder\'s README from the chart itself', () => {
  const drawn = checkChart({does: {}}).toMermaid().trim(), readme = readFileSync(new URL('../src/check/README.md', import.meta.url), 'utf8');
  assert.ok(readme.includes(`\`\`\`mermaid\n${drawn}\n\`\`\``), 'src/check/README.md shows checkChart(...).toMermaid(): draw it again');
});

test('storyreel check on a project: one reply, kept for the log, and the next check says what changed', async t => {
  const out = tempDir('check', t);
  const first = await check(await readInputs({cwd: project, out}));
  assert.match(first, /^fix 1 — 1 error\nthe whole film: 0\.00–[\d.]+ s of [\d.]+ s — read: [\w, -]+\nfix {2}0:02\.0–0:03\.8 one · words over words: "Alpha" and "Beta"\nnot run · Drawn parts hold together: .*\nchanges: 2 of 2 pieces changed \(0:09 of 0:09\)\nsince the run before: this is the first check kept for this film$/);
  const kept = listRuns(out).find(r => r.feature === 'check').check;
  assert.deepEqual({...kept, keys: kept.keys.map(k => /^[0-9a-f]{16}$/.test(k))}, {film: kept.film, verdict: 'fix', round: 1, keys: [true]});
  assert.deepEqual(lastCheck(out, kept.film), kept);
  assert.equal(lastCheck(out, 'another film'), null);                                                // a film is compared with itself only
  assert.match(await check(await readInputs({cwd: project, out})), /\nsince the run before: nothing changed · round 2$/);
  // an edit that breaks the film: broken, with every phrase at fault, and nothing else read
  const broken = await check(await readInputs({cwd: project, out, anchors: 'true'}));
  assert.match(broken, /^broken — the film does not compile: Pacing phrase not found in two: "much shorter"\nfix {2}phrase · two "much shorter" → pacing\.holds\[1\] — not said/);
  assert.match(broken, /\nsince the run before: 1 fixed, \d+ new · round 3$/);
  // the run keeps the review's verdicts with what they measured, so the log can show a verdict's evidence for a check too
  assert.ok(listRuns(out).filter(r => r.feature === 'check').at(-1).verdicts.length > 0);
  assert.equal(listRuns(out).filter(r => r.feature === 'check').length, 3);
  assert.ok(Object.keys(TOOLS).includes('check'));
});

test('a failed verdict and its own findings are one thing to fix, not two; a verdict with advice only is still an error', () => {
  const said = problemsOf({review: {verdicts: [{check: 'contrast', label: 'Words stand out', verdict: 'failed', why: '1 word is faint'}, {check: 'slideshow', label: 'No slideshow', verdict: 'failed', why: 'mostly still'}],
    findings: [finding('contrast', 'one', '"Hi" stands 1.16:1'), finding('slideshow', 'one', 'still for 72 % of 41.3 s')], lines: ['0:01 one · too faint: "Hi" stands 1.16:1', '0:01 one · slideshow: still for 72 %']}});
  assert.deepEqual(said.map(p => [p.level, p.kind]), [['error', 'slideshow'], ['error', 'contrast'], ['advice', 'slideshow']]);
  assert.match(said[0].line, /^No slideshow · failed/);
});

test('what a problem is: numbers in its words, and a "|" in a phrase, do not make it another or the same', () => {
  const key = (kind, scene, what) => problemsOf({review: {verdicts: [], findings: [finding(kind, scene, what)], lines: ['x']}})[0].key;
  assert.equal(key('still', 'one', 'still for 72 % of 41.3 s'), key('still', 'one', 'still for 71 % of 40 s'));
  assert.notEqual(key('cut-off', 'one', '"Alpha"'), key('cut-off', 'one', '"Beta"'));
  const phrase = (scene, said) => problemsOf({anchors: {notes: [{ref: [scene, said], path: 'p', problem: 'missing'}], lines: ['x']}})[0].key;
  assert.notEqual(phrase('one', 'a|b'), phrase('one|a', 'b'));
  assert.notEqual(phrase('one', `${'x'.repeat(400)}a`), phrase('one', `${'x'.repeat(400)}b`));           // two long phrases alike at their start
});

test('a reply is small whatever the film: a row is cut, and past the most keys kept the counts are not said', async () => {
  const huge = 'x'.repeat(1_000_000);
  const done = await checkFilm(fake({stopped: `Phrase not in story: "${huge}"`, notes: [{ref: ['one', huge], path: 'p', problem: 'missing'}]}));
  assert.ok(done.text.length < 3 * ROW_MOST + 200, `${done.text.length} characters`);
  assert.ok(done.text.split('\n').every(line => line.length <= ROW_MOST + 5));
  const many = Array.from({length: KEYS_MOST}, (_, i) => `k${i}`);
  assert.deepEqual(sinceLast(many, {keys: ['a'], round: 2, verdict: 'fix'}), {fixed: 0, added: 0, round: 3, first: false, capped: true});
  assert.equal(sinceLine({fixed: 0, added: 0, round: 3, first: false, capped: true}), `since the run before: not compared (over ${KEYS_MOST} problems) · round 3`);
});

test('whatever stops the film is said as broken, never thrown: timings that do not fit the words, as every tool refuses them', async t => {
  const out = tempDir('check-broken', t), read = await readInputs({cwd: project, out});
  const stale = {...read, raw: {...read.raw, scenes: read.raw.scenes.slice(0, 1)}};                          // the voice's timings no longer hold every scene
  const said = await check(stale);
  assert.match(said, /^broken — the film does not compile: /);
  assert.equal(said.split('\n').at(-1), 'since the run before: this is the first check kept for this film');
});
