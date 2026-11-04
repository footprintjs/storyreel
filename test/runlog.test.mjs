// The run log (runlog.mjs): one door to how every result was made. A feature saves its run's record in the project
// out folder (.storyreel/runs); `storyreel log` lists the runs and reads one — each stage once with what it wrote and decided, the
// decisions alone, the errors, every entry — and a verdict's evidence in full. Here: the store, each view on a record
// footprintjs really wrote, the refusals, and the review tool saving its run end to end.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {flowChart, decide, narrative} from 'footprintjs';
import {saveRun, listRuns, logText, compactSelected, RUNS, RUNS_KEPT, LOG_LINES} from '../src/runlog.mjs';
import {loadProject, review, TOOLS} from '../src/tools.mjs';
import {tempDir} from './tmp.mjs';

/** A small real record: a stage that measures, a decider over what it measured, a branch that answers. */
async function recordOf(score) {
  const chart = flowChart('measure', s => { s.score = score; s.note = 'measured once'; }, 'measure')
    .addDeciderFunction('judge', s => decide(s, [{when: {score: {gt: 5}}, then: 'high', label: 'the score is above 5'}], {branch: 'low', label: 'the score is 5 or less'}), 'judge')
    .addFunctionBranch('high', 'high', s => { s.answer = 'high'; })
    .addFunctionBranch('low', 'low', s => { s.answer = 'low'; })
    .setDefault('low').end().build();
  const trace = narrative();
  await chart.recorder(trace).run();
  return trace.getEntries();
}

const runsIn = dir => readdirSync(path.join(dir, ...RUNS)).filter(n => n.endsWith('.json')).sort();

test('saveRun keeps a run in the project as words: each entry\'s text, kind and stage, never a value it carried; a bad name refuses', async t => {
  const dir = tempDir('runlog-save', t), record = await recordOf(7);
  const file = saveRun(dir, {feature: 'review', summary: 'one run', record: [...record, {type: 'step', text: 'Step 9: Write secret = …', rawValue: {key: 'hidden'}}]});
  assert.ok(path.dirname(file).endsWith(path.join(path.basename(dir), ...RUNS)), file);
  const kept = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(kept.feature, 'review');
  assert.equal(kept.summary, 'one run');
  assert.ok(kept.entries.every(e => Object.keys(e).sort().join() === 'depth,stage,text,type'), 'only the words');
  assert.ok(!readFileSync(file, 'utf8').includes('hidden'), 'a value an entry carried is not kept');
  assert.throws(() => saveRun(dir, {feature: '../up'}), /saveRun: feature is a short lowercase name \(review, render, breakdown\), not "\.\.\/up"/);
});

test(`a project keeps its newest ${RUNS_KEPT} runs: one more drops the oldest, and nothing else in the folder is touched`, t => {
  const dir = tempDir('runlog-kept', t), at = k => new Date(Date.UTC(2026, 0, 1, 0, 0, k));
  for (let k = 0; k < RUNS_KEPT; k++) saveRun(dir, {feature: 'review', summary: `run ${k}`, at: at(k)});
  writeFileSync(path.join(dir, ...RUNS, 'notes.json'), '{}');
  assert.equal(runsIn(dir).length, RUNS_KEPT + 1);
  saveRun(dir, {feature: 'review', summary: 'the newest', at: at(RUNS_KEPT)});
  const left = runsIn(dir);
  assert.equal(left.length, RUNS_KEPT + 1, 'one in, one out');
  assert.ok(left.includes('notes.json'), 'a file not named as a run stays');
  assert.ok(!left.some(n => n.startsWith('2026-01-01T00-00-00-000Z')), 'the oldest went');
  assert.equal(listRuns(dir)[0].summary, 'the newest');
});

test('the list: newest first, numbered, each with its summary and how many decisions; the render\'s making-of.json in the same out folder among them; an unreadable run is counted', async t => {
  const dir = tempDir('runlog-list', t);
  saveRun(dir, {feature: 'review', summary: 'older', record: await recordOf(7), at: new Date('2026-01-01T00:00:00Z')});
  saveRun(dir, {feature: 'review', summary: 'newer\nsecond line', record: await recordOf(2), at: new Date('2026-01-02T00:00:00Z')});
  writeFileSync(path.join(dir, ...RUNS, '2026-01-03T00-00-00-000Z-review.json'), 'not json');
  writeFileSync(path.join(dir, 'making-of.json'), JSON.stringify({compile: {narrative: ['Stage 1: The process began with compile.', '[Condition]: It chose wide.']}, video: {line: 'film.mp4, 12 s'}}));
  const text = logText(dir);
  assert.match(text, /^1\. \d{4}-\d\d-\d\d \d\d:\d\d:\d\d render · film\.mp4, 12 s · 1 decisions\n2\. 2026-01-02 00:00:00 review · newer · 1 decisions\n3\. 2026-01-01 00:00:00 review · older · 1 decisions\n/);
  assert.match(text, /\nstoryreel log --run <n> shows one \(--only decisions \| errors \| steps, --check <verdict>, --all\)\n\(1 run file could not be read and is not listed\)$/);
  assert.match(logText(tempDir('runlog-none', t)), /^no runs yet in .*\.storyreel\/runs: a review saves one \(storyreel review\), a render writes making-of\.json$/);
});

test('one run: each stage once — what it wrote, what it decided with the rule that matched and the values it read', async t => {
  const dir = tempDir('runlog-one', t);
  saveRun(dir, {feature: 'review', summary: 'a run', record: await recordOf(2)});
  const text = logText(dir, {run: 1});
  assert.match(text, /^1\. .* review · a run\n/);
  assert.match(text, /\nmeasure · wrote score 2, note "measured once"\n/);
  assert.match(text, /\njudge · decided: No rules matched, fell back to default "the score is 5 or less": low\. · read score 2\n/, 'a default chosen by no rule still says what it read');
  assert.match(text, /\nlow · wrote answer "low"$/);
  assert.ok(!/Stage \d|Step \d/.test(text), 'the record\'s own numbering is not repeated');
  const decisions = logText(dir, {run: 1, only: 'decisions'});
  assert.equal(decisions.split('\n').slice(1).join('\n'), 'judge\n  decided: No rules matched, fell back to default "the score is 5 or less": low. · read score 2');
  assert.match(logText(dir, {run: 1, only: 'steps'}), /\n {2}Step 1: Write score = 2\n/, 'steps: every entry as the record says it');
  assert.match(logText(dir, {run: 1, only: 'errors'}), /\n\(no errors in this run\)$/);
});

test('an error is said where it happened; a long run is cut at the line budget and says the call that shows the rest', t => {
  const dir = tempDir('runlog-cut', t), many = Array.from({length: LOG_LINES + 5}, (_, k) => ({type: 'stage', text: `Stage ${k + 1}: step ${k}`, stageName: `s${k}`}));
  saveRun(dir, {feature: 'review', record: [...many, {type: 'error', text: 'it broke: no such file', stageName: 's44'}]});
  const text = logText(dir, {run: 1});
  assert.equal(text.split('\n').length, 1 + LOG_LINES + 1);
  assert.match(text, /\n… 5 more: storyreel log --run 1 --all$/);
  assert.match(logText(dir, {run: 1, all: true}), /\ns44 · error: it broke: no such file$/);
  assert.match(logText(dir, {run: 1, only: 'errors'}), /\ns44: it broke: no such file$/);
});

test('a selector names each path once and what its rules read once, a summary holding parentheses included', () => {
  const said = '[Selected]: 2 of 3 paths selected: hook "starts the film" (facts={from, to, ... (12 keys)}, facts={from, to, ... (12 keys)}); pure "has moments" (facts={from, to, ... (12 keys)}, n=3).';
  assert.equal(compactSelected(said), '2 of 3 paths selected: hook "starts the film"; pure "has moments". · read facts={from, to, ... (12 keys)}, n=3');
  assert.equal(compactSelected('[Selected]: 1 of 1 paths selected: a (b).'), '1 of 1 paths selected: a (b).', 'a parenthesis that holds no read value stays');
});

test('a verdict\'s evidence in full: every value its check measured, a list one item a line', t => {
  const dir = tempDir('runlog-check', t);
  saveRun(dir, {feature: 'review', verdicts: [{check: 'contrast', label: 'Words stand out', verdict: 'failed', why: 'a word is too faint', summary: '2 words measured',
    measured: {words: 2, low: 1, faint: [{text: 'grey', ratio: 2.1, needs: 4.5, t: 3}]}}]});
  assert.equal(logText(dir, {run: 1, check: 'contrast'}), 'Words stand out · failed: a word is too faint (2 words measured)\nwords: 2\nlow: 1\nfaint: 1\n  {"text":"grey","ratio":2.1,"needs":4.5,"t":3}');
  assert.match(logText(dir, {run: 1}), /\nevidence: storyreel log --run 1 --check contrast$/);
  assert.throws(() => logText(dir, {run: 1, check: 'slideshow'}), /^Error: run 1 has no verdict "slideshow": its verdicts are contrast$/);
});

test('each wrong ask refuses, naming the fix', t => {
  const dir = tempDir('runlog-refuse', t);
  saveRun(dir, {feature: 'review'});
  assert.throws(() => logText(dir, {run: 4}), /^Error: there is no run 4: the runs are 1–1 \(storyreel log lists them\)$/);
  assert.throws(() => logText(dir, {run: 1, only: 'nope'}), /^Error: --only is decisions, errors, steps \(or nothing, for the stages\), not "nope"$/);
  assert.throws(() => logText(dir, {only: 'decisions'}), /^Error: --only reads one run: give its number \(--run 1\)$/);
  assert.throws(() => logText(dir, {check: 'contrast'}), /^Error: --check reads one run: give its number \(--run 1\)$/);
  assert.throws(() => logText(dir, {run: 1, check: 'contrast'}), /has no verdict "contrast" \(only a review keeps verdicts\)$/);
});

const fixture = fileURLToPath(new URL('./fixtures/tools/storyreel.config.mjs', import.meta.url));

test('storyreel review saves its run, verdicts with their evidence; the log tool reads it back', async t => {
  const dir = tempDir('runlog-review', t);
  writeFileSync(path.join(dir, 'storyreel.config.mjs'), `export {default} from ${JSON.stringify(pathToFileURL(fixture).href)};\n`);
  const out = path.join(dir, 'renders'), p = await loadProject({cwd: dir, out});
  await review(p, {});
  assert.deepEqual(readdirSync(dir).sort(), ['renders', 'storyreel.config.mjs'], 'the run goes in the out folder, nothing beside the project\'s own files');
  const [run] = listRuns(out);
  assert.equal(run.feature, 'review');
  assert.match(run.summary, /^the whole film: .* — review \(.*\): /);
  assert.ok(run.verdicts.length > 0 && run.verdicts.every(v => typeof v.check === 'string' && typeof v.measured === 'object'), 'every verdict, with what it measured');
  assert.ok(run.entries.some(e => e.type === 'condition'), 'each verdict\'s decision is in the record');
  const listed = await TOOLS.log.run(p, {});
  assert.match(listed, /^1\. .* review · the whole film: /);
  const one = await TOOLS.log.run(p, {run: '1', only: 'decisions'});
  assert.match(one, /\n {2}decided: .* · read measured true/, 'each verdict\'s decision with the values it read');
  assert.match(await TOOLS.log.run(p, {run: '1', check: run.verdicts[0].check}), new RegExp(`^${run.verdicts[0].label} · `));
});
