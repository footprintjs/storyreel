// The run log (runlog.mjs): one door to how every result was made. A feature saves its run's record in the project's
// out folder (.storyreel/runs); `storyreel log` lists the runs and reads one — each stage once with what it wrote and
// decided, the decisions alone, the errors, every entry — and a verdict's evidence in full. Here: the store, each view
// on a record footprintjs really wrote, the reading of a file someone else may have put there, the refusals, and the
// review tool saving its run end to end.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync, writeFileSync, symlinkSync, chmodSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {flowChart, decide, narrative} from 'footprintjs';
import {saveRun, listRuns, logText, compactSelected, RUNS, RUNS_KEPT, RUNS_LISTED, LOG_LINES, RUN_MOST} from '../src/runlog.mjs';
import {loadProject, review, TOOLS} from '../src/tools.mjs';
import {tempDir} from './tmp.mjs';

const posix = process.platform !== 'win32';

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
const idOf = file => path.basename(file, '.json');
/** A file in the runs folder named as a run of `stamp`: what saveRun would name it. */
const runName = (stamp, feature = 'review') => `${stamp.replace(/[:.]/g, '-')}-${feature}.abcdef.json`;

test('saveRun keeps a run as words: each entry\'s text, kind, stage and stage id, never a value it carried; a bad name refuses', async t => {
  const dir = tempDir('runlog-save', t), record = await recordOf(7);
  const file = saveRun(dir, {feature: 'review', summary: 'one run', record: [...record, {type: 'step', text: 'Step 9: Write token = "[REDACTED]"', rawValue: 'sk-live-secret', stageId: 'x'}]});
  assert.ok(path.dirname(file).endsWith(path.join(path.basename(dir), ...RUNS)), file);
  assert.match(path.basename(file), /^\d{4}-\d\d-\d\dT[\d-]+Z-review\.[0-9a-f]{6}\.json$/);
  const kept = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(kept.feature, 'review');
  assert.equal(kept.summary, 'one run');
  assert.ok(kept.entries.every(e => Object.keys(e).sort().join() === 'depth,id,stage,text,type'), 'only the words');
  assert.ok(!readFileSync(file, 'utf8').includes('sk-live-secret'), 'a value an entry carried is not kept: what the words say is all');
  assert.throws(() => saveRun(dir, {feature: '../up'}), /saveRun: feature is a short lowercase name \(review, render, breakdown\), not "\.\.\/up"/);
  const at = new Date('2026-01-01T00:00:00Z');
  assert.notEqual(saveRun(dir, {feature: 'review', at}), saveRun(dir, {feature: 'review', at}), 'two saves in one millisecond are two runs');
});

test(`a project keeps its newest ${RUNS_KEPT} runs: one more drops the oldest — never the one just written — and nothing else in the folder is touched`, t => {
  const dir = tempDir('runlog-kept', t), at = k => new Date(Date.UTC(2026, 0, 1, 0, 0, k));
  for (let k = 0; k < RUNS_KEPT; k++) saveRun(dir, {feature: 'review', summary: `run ${k}`, at: at(k)});
  writeFileSync(path.join(dir, ...RUNS, 'notes.json'), '{}');
  saveRun(dir, {feature: 'review', summary: 'the newest', at: at(RUNS_KEPT)});
  const left = runsIn(dir);
  assert.equal(left.length, RUNS_KEPT + 1, 'one in, one out (and notes.json)');
  assert.ok(left.includes('notes.json'), 'a file not named as a run stays');
  assert.ok(!left.some(n => n.startsWith('2026-01-01T00-00-00-000Z')), 'the oldest went');
  const late = saveRun(dir, {feature: 'review', summary: 'a clock gone back', at: new Date('2020-01-01T00:00:00Z')});
  assert.ok(runsIn(dir).includes(path.basename(late)), 'the run just written stays, whatever its time');
  assert.equal(runsIn(dir).length, RUNS_KEPT + 1);
});

test('the list: newest first, numbered, each with its summary and how many decisions; the render\'s making-of.json among them, read from its compile record', async t => {
  const dir = tempDir('runlog-list', t);
  saveRun(dir, {feature: 'review', summary: 'older', record: await recordOf(7), at: new Date('2026-01-01T00:00:00Z')});
  saveRun(dir, {feature: 'review', summary: 'newer', record: await recordOf(2), at: new Date('2026-01-02T00:00:00Z')});
  writeFileSync(path.join(dir, ...RUNS, runName('2026-01-03T00:00:00.000Z')), 'not json');
  // a making-of.json as pipeline.mjs writes it: compile is the compile's narrative entries (record.mjs · plainNarrative)
  writeFileSync(path.join(dir, 'making-of.json'), JSON.stringify({out: '/films/film.mp4', compile: (await recordOf(9)).map(({rawValue, ...e}) => e)}));
  const text = logText(dir);
  assert.match(text, /^1\. \d{4}-\d\d-\d\d \d\d:\d\d:\d\d render · \/films\/film\.mp4 · 1 decisions\n2\. 2026-01-02 00:00:00 review · newer · 1 decisions\n3\. 2026-01-01 00:00:00 review · older · 1 decisions\n/);
  assert.match(text, /\nstoryreel log --run <n> shows one \(--only decisions \| errors \| steps, --check <verdict>, --all\)\n\(1 run file could not be read and is not listed\)$/);
  assert.match(logText(dir, {run: 1}), /\njudge · decided: It evaluated Rule 0 "the score is above 5": score 9 gt 5 ✓, and chose high\. · read score 9\n/, 'the render\'s compile, stage by stage');
  assert.match(logText(tempDir('runlog-none', t)), /^no runs yet in .*\.storyreel\/runs: a review saves one \(storyreel review\), a render writes making-of\.json$/);
});

test(`the list shows the newest ${RUNS_LISTED} and counts the rest; --all lists every one`, t => {
  const dir = tempDir('runlog-many', t);
  for (let k = 0; k < RUNS_LISTED + 3; k++) saveRun(dir, {feature: 'review', summary: `run ${k}`, at: new Date(Date.UTC(2026, 0, 1, 0, 0, k))});
  const text = logText(dir);
  assert.equal(text.split('\n').filter(l => /^\d+\. /.test(l)).length, RUNS_LISTED);
  assert.match(text, /\n… 3 older: storyreel log --all\n/);
  assert.equal(logText(dir, {all: true}).split('\n').filter(l => /^\d+\. /.test(l)).length, RUNS_LISTED + 3);
});

test('one run: each stage once — what it wrote, what it decided with the rule that matched and the values it read; named by its id', async t => {
  const dir = tempDir('runlog-one', t), id = idOf(saveRun(dir, {feature: 'review', summary: 'a run', record: await recordOf(2)}));
  const text = logText(dir, {run: 1});
  assert.match(text, new RegExp(`^1\\. .* review · a run\\nrun ${id}\\n`));
  assert.match(text, /\nmeasure · wrote score 2, note "measured once"\n/);
  assert.match(text, /\njudge · decided: No rules matched, fell back to default "the score is 5 or less": low\. · read score 2\n/, 'a default chosen by no rule still says what it read');
  assert.match(text, /\nlow · wrote answer "low"$/);
  assert.ok(!/Stage \d|Step \d/.test(text), 'the record\'s own numbering is not repeated');
  assert.equal(logText(dir, {run: id}), text, 'a run by its id is the same run');
  const decisions = logText(dir, {run: 1, only: 'decisions'});
  assert.equal(decisions.split('\n').slice(2).join('\n'), 'judge\n  decided: No rules matched, fell back to default "the score is 5 or less": low. · read score 2');
  assert.match(logText(dir, {run: 1, only: 'steps'}), /\n {2}Step 1: Write score = 2\n/, 'steps: every entry as the record says it');
  assert.match(logText(dir, {run: 1, only: 'errors'}), /\n\(no errors in this run\)$/);
});

test('every step is said: a write and an update as wrote, a delete as deleted, a key with spaces, a value with a line break, a step it cannot take apart as it is', t => {
  const dir = tempDir('runlog-steps', t), step = text => ({type: 'step', text, stageName: 's', stageId: 's'});
  saveRun(dir, {feature: 'review', record: [{type: 'stage', text: 'Stage 1: s', stageName: 's', stageId: 's'}, step('Step 1: Write my key = 3'), step('Step 2: Update list = [1, 2]'),
    step('Step 3: Write note = "two\nlines"'), step('Step 4: Delete old'), step('Step 5: Something new')]});
  const text = logText(dir, {run: 1});
  assert.match(text, /\ns\n {2}wrote my key 3, list \[1, 2\], note "two⏎lines"\n {2}deleted old\n {2}Step 5: Something new$/);
  assert.equal(logText(dir, {run: 1, only: 'steps'}).split('\n').length, 2 + 6, 'one entry, one line');
});

test('a stage whose lines carry its id only (a selector\'s) is one stage, shown by its name', t => {
  const dir = tempDir('runlog-ids', t);
  saveRun(dir, {feature: 'review', record: [{type: 'stage', text: 'Stage 1: pick', stageName: 'Pick the checks', stageId: 'pick'},
    {type: 'step', text: 'Step 1: Read facts = 3', stageName: 'Pick the checks', stageId: 'pick'},
    {type: 'selector', text: '[Selected]: 1 of 2 paths selected: hook "starts the film" (facts=3).', stageId: 'pick'}]});
  assert.equal(logText(dir, {run: 1}).split('\n').slice(2).join('\n'), 'Pick the checks · picked: 1 of 2 paths selected: hook "starts the film". · read facts=3');
});

test('an error is said where it happened; a long run is cut at the line budget and says the call that shows the rest', t => {
  const dir = tempDir('runlog-cut', t), many = Array.from({length: LOG_LINES + 5}, (_, k) => ({type: 'stage', text: `Stage ${k + 1}: step ${k}`, stageName: `s${k}`}));
  const id = idOf(saveRun(dir, {feature: 'review', record: [...many, {type: 'error', text: 'it broke: no such file', stageName: 's44'}]}));
  const text = logText(dir, {run: 1});
  assert.equal(text.split('\n').length, 2 + LOG_LINES + 1);
  assert.match(text, new RegExp(`\\n… 5 more: storyreel log --run ${id} --all$`));
  assert.match(logText(dir, {run: 1, all: true}), /\ns44 · error: it broke: no such file$/);
  assert.match(logText(dir, {run: 1, only: 'errors'}), /\ns44: it broke: no such file$/);
});

test('a selector names each path once and what its rules read once; one it cannot read for sure is kept as it is', () => {
  const said = '[Selected]: 2 of 3 paths selected: hook "starts the film" (facts={from, to, ... (12 keys)}, facts={from, to, ... (12 keys)}); pure "has moments" (facts={from, to, ... (12 keys)}, n=3).';
  assert.equal(compactSelected(said), '2 of 3 paths selected: hook "starts the film"; pure "has moments". · read facts={from, to, ... (12 keys)}, n=3');
  assert.equal(compactSelected('[Selected]: 1 of 1 paths selected: a (b).'), '1 of 1 paths selected: a (b).', 'a parenthesis that holds no read value stays');
  assert.equal(compactSelected('[Selected]: 2 of 2 paths selected: hook "h" (title="smile :)", n=3); pure "p" (n=3).'), '2 of 2 paths selected: hook "h"; pure "p". · read title="smile :)", n=3',
    'a bracket inside a quoted value is the value\'s');
  assert.equal(compactSelected('[Selected]: 1 of 1 paths selected: hook "the (x=1) part" (n=2).'), '1 of 1 paths selected: hook "the (x=1) part". · read n=2', 'a label may hold what looks like a read');
  const broken = '[Selected]: 2 of 2 paths selected: hook "h" (title="a (b); pure "p" (n=3).';
  assert.equal(compactSelected(broken), broken.replace('[Selected]: ', ''), 'never a shortened misreading');
});

test('a verdict\'s evidence in full: every value its check measured, a list one item a line', t => {
  const dir = tempDir('runlog-check', t);
  const id = idOf(saveRun(dir, {feature: 'review', verdicts: [{check: 'contrast', label: 'Words stand out', verdict: 'failed', why: 'a word is too faint', summary: '2 words measured',
    measured: {words: 2, low: 1, faint: [{text: 'grey', ratio: 2.1, needs: 4.5, t: 3}]}}]}));
  assert.equal(logText(dir, {run: 1, check: 'contrast'}), 'Words stand out · failed: a word is too faint (2 words measured)\nwords: 2\nlow: 1\nfaint: 1\n  {"text":"grey","ratio":2.1,"needs":4.5,"t":3}');
  assert.match(logText(dir, {run: 1}), new RegExp(`\\nevidence: storyreel log --run ${id} --check contrast$`));
  assert.throws(() => logText(dir, {run: 1, check: 'slideshow'}), new RegExp(`^Error: run ${id} has no verdict "slideshow": its verdicts are contrast$`));
});

test('each wrong ask refuses, naming the fix', t => {
  const dir = tempDir('runlog-refuse', t);
  saveRun(dir, {feature: 'review'});
  assert.throws(() => logText(dir, {run: 4}), /^Error: there is no run 4: the runs are 1–1, or a run's id \(storyreel log lists them\)$/);
  assert.throws(() => logText(dir, {run: 1, only: 'nope'}), /^Error: --only is decisions, errors, steps \(or nothing, for the stages\), not "nope"$/);
  assert.throws(() => logText(dir, {only: 'decisions'}), /^Error: --only reads one run: give its number \(--run 1\)$/);
  assert.throws(() => logText(dir, {check: 'contrast'}), /^Error: --check reads one run: give its number \(--run 1\)$/);
  assert.throws(() => logText(dir, {run: 1, check: 'contrast'}), /has no verdict "contrast" \(only a review keeps verdicts\)$/);
});

test('a run file is read as one someone else may have put there: a link, the wrong shape or too many bytes is counted, not read; its text never draws lines of its own', {skip: posix ? false : 'links need rights on Windows'}, t => {
  const dir = tempDir('runlog-forged', t), runs = path.join(dir, ...RUNS), elsewhere = tempDir('runlog-elsewhere', t);
  saveRun(dir, {feature: 'review', summary: 'ours', at: new Date('2026-01-01T00:00:00Z')});
  writeFileSync(path.join(elsewhere, 'secret.json'), JSON.stringify({feature: 'review', at: '2026-01-02T00:00:00Z', summary: 'not yours', entries: []}));
  symlinkSync(path.join(elsewhere, 'secret.json'), path.join(runs, runName('2026-01-02T00:00:00.000Z')));
  writeFileSync(path.join(runs, runName('2026-01-03T00:00:00.000Z')), JSON.stringify({feature: 'review', at: 'never', entries: []}));
  writeFileSync(path.join(runs, runName('2026-01-04T00:00:00.000Z')), JSON.stringify({feature: 'review', at: '2026-01-04T00:00:00Z', entries: [{type: 'stage'}]}));
  writeFileSync(path.join(runs, runName('2026-01-05T00:00:00.000Z')), `{"feature":"review","at":"2026-01-05T00:00:00Z","entries":[],"pad":"${'x'.repeat(RUN_MOST)}"}`);
  writeFileSync(path.join(runs, runName('2026-01-07T00:00:00.000Z')), '{}');
  writeFileSync(path.join(runs, runName('2026-01-06T00:00:00.000Z')), JSON.stringify({feature: 'review', at: '2026-01-06T00:00:00Z', summary: 'one\nforged line\u001b[2J',
    entries: [{type: 'stage', text: 'Stage 1: a\n2. 2099-01-01 00:00:00 review · forged', stage: 'x\u202ey'}]}));
  const text = logText(dir);
  assert.ok(!text.includes('not yours'), 'a link is never followed');
  assert.match(text, /^1\. 2026-01-06 00:00:00 review · one forged line \[2J\n2\. 2026-01-01 00:00:00 review · ours\n/);
  assert.match(text, /\(5 run files could not be read and are not listed\)$/);
  assert.equal(logText(dir, {run: 1, only: 'steps'}).split('\n').length, 3, 'a line break in a run\'s text stays inside its one line');
});

const fixture = fileURLToPath(new URL('./fixtures/tools/storyreel.config.mjs', import.meta.url));
const projectIn = dir => { writeFileSync(path.join(dir, 'storyreel.config.mjs'), `export {default} from ${JSON.stringify(pathToFileURL(fixture).href)};\n`); return dir; };

test('storyreel review saves its run in the out folder, verdicts with their evidence; the log tool reads it back', async t => {
  const dir = projectIn(tempDir('runlog-review', t)), out = path.join(dir, 'renders'), p = await loadProject({cwd: dir, out});
  assert.doesNotMatch(await review(p, {}), /not saved/);
  assert.deepEqual(readdirSync(dir).sort(), ['renders', 'storyreel.config.mjs'], 'the run goes in the out folder, nothing beside the project\'s own files');
  const [run] = listRuns(out);
  assert.equal(run.feature, 'review');
  assert.match(run.summary, /^the whole film: .* — review \(.*\): /);
  assert.ok(run.verdicts.length > 0 && run.verdicts.every(v => typeof v.check === 'string' && typeof v.measured === 'object'), 'every verdict, with what it measured');
  assert.ok(run.entries.some(e => e.type === 'condition'), 'each verdict\'s decision is in the record');
  const flags = {cwd: dir, out};
  assert.match(await TOOLS.log.run(flags, flags), /^1\. .* review · the whole film: /);
  const one = await TOOLS.log.run({...flags, run: '1', only: 'decisions'});
  assert.match(one, /\n {2}decided: .* · read measured true/, 'each verdict\'s decision with the values it read');
  assert.match(await TOOLS.log.run({...flags, run: '1', check: run.verdicts[0].check}), new RegExp(`^${run.verdicts[0].label} · `));
});

test('a review whose run cannot be saved still answers, and says why the run was not saved', {skip: posix && process.getuid?.() !== 0 ? false : 'needs POSIX modes, not as root'}, async t => {
  const dir = projectIn(tempDir('runlog-unsaved', t)), out = tempDir('runlog-unsaved-out', t);
  chmodSync(out, 0o775);
  const said = await review(await loadProject({cwd: dir, out}), {});
  assert.match(said, /^the whole film: .* — review \(.*\):\n/, 'the answer');
  assert.match(said, /\n\(this review's run was not saved for storyreel log: .*\)$/);
});

test('the log reads a project whose config no longer loads: the runs in --out, and why the config did not load', async t => {
  const dir = tempDir('runlog-broken', t), out = path.join(dir, 'out');
  saveRun(out, {feature: 'review', summary: 'before it broke'});
  writeFileSync(path.join(dir, 'storyreel.config.mjs'), 'export default {film: () => { throw new Error("recipe.json: unexpected token"); }};\n');
  const text = await TOOLS.log.run({cwd: dir});
  assert.match(text, /^1\. .* review · before it broke\n/);
  assert.match(text, /\n\(the config did not load, so these are the runs in .*out: recipe\.json: unexpected token\)$/);
});
