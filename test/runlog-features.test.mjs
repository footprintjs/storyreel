// Each feature leaves its run for `storyreel log`, end to end: a breakdown, a remake, an apply, a review, a render, a note
// and a Try in the studio, and a reading of the notes — done or refused, each answer unchanged when the run cannot be
// saved. test/runlog.test.mjs holds the store and the views; here, what each feature hands them.
import test from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {compileFilm, evenTimings, makeFilm} from '../src/index.mjs';
import {kineticKit} from '../src/kits/kinetic/index.mjs';
import {breakdown} from '../src/breakdown.mjs';
import {reviewPart} from '../src/review.mjs';
import {keepRun, listRuns, logText, RUNS} from '../src/runlog.mjs';
import {loadProject, fullRender} from '../src/tools.mjs';
import {startStudio} from '../src/studio/server.mjs';
import {feedback} from '../src/studio/feedback-tool.mjs';
import {noteKey} from '../src/studio/notekey.mjs';
import {tempDir} from './tmp.mjs';
import {installed} from './studio-run.mjs';
import {shot, specOf, makeReference, skip} from './remake-specs.mjs';

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const hello = fileURLToPath(new URL('../examples/hello/', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/tools/storyreel.config.mjs', import.meta.url));
const storyreel = (cwd, ...args) => spawnSync(process.execPath, [cli, ...args], {cwd, encoding: 'utf8'});
const posix = process.platform !== 'win32', modes = posix && process.getuid?.() !== 0 ? false : 'needs POSIX modes, not as root';
const decisions = run => run.entries.filter(e => e.type === 'condition');

test('a breakdown leaves its run in its own folder, and `storyreel log --out` reads it with no project; a refused one leaves what it got to', {skip}, async t => {
  const dir = tempDir('runs-breakdown', t), out = path.join(dir, 'reference-breakdown'), reference = makeReference(dir);
  const {text} = await breakdown(reference, {out});
  assert.doesNotMatch(text, /not saved/);
  const [run] = listRuns(out);
  assert.equal(run.feature, 'breakdown');
  assert.match(run.summary, /^reference\.mp4: \d+ shots$/);
  assert.ok(decisions(run).length > 0, 'its decisions');
  const log = storyreel(dir, 'log', '--out', out);
  assert.equal(log.status, 0, log.stderr);
  assert.match(log.stdout, /^1\. .* breakdown · reference\.mp4: \d+ shots · \d+ decisions\n/);
  assert.doesNotMatch(log.stdout, /config/);
  const wrong = path.join(dir, 'wrong'), sounding = path.join(dir, 'reference.mp4.sound.mp4');   // a beat map is asked only of a film with a sound
  assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', reference, '-f', 'lavfi', '-i', 'sine=d=30', '-shortest', '-c:v', 'copy', sounding]).status, 0);
  await assert.rejects(breakdown(sounding, {out: wrong, beatMap: () => ({tempo: 120})}), /a beat map answers/);
  const [failed] = listRuns(wrong);
  assert.match(failed.summary, /^reference\.mp4\.sound\.mp4 — failed: .*a beat map answers/);
  assert.ok(failed.entries.some(e => e.id === 'read-beats'), 'the record names the stage it stopped at');
  assert.match(logText(wrong, {run: 1, only: 'errors'}), /a beat map answers/);
  const said = storyreel(dir, 'breakdown', reference, '--out', path.join(dir, 'said'));
  assert.equal(said.status, 0, said.stderr);
  assert.match(said.stdout, /\nhow it was made: storyreel log --out .*said\n$/, 'the command says where to walk it back');
});

/** A breakdown.json in a folder of its own: what `storyreel remake` reads, with no video. */
function breakdownFolder(t, name = 'runs-remake') {
  const folder = tempDir(name, t);
  writeFileSync(path.join(folder, 'breakdown.json'), JSON.stringify(specOf([shot(2), shot(2), shot(.3, {text: true}), shot(.3, {text: true})])));
  return folder;
}

test('a remake leaves its run beside the breakdown it read, each choice\'s rule in it, its output unchanged', t => {
  const folder = breakdownFolder(t), json = storyreel(folder, 'remake', folder, '--json');
  assert.equal(json.status, 0, json.stderr);
  assert.equal(json.stderr, '');
  assert.ok(Array.isArray(JSON.parse(json.stdout).scenes), 'stdout stays the plan as JSON');
  const [run] = listRuns(folder);
  assert.equal(run.feature, 'remake');
  assert.equal(run.summary, `${JSON.parse(json.stdout).scenes.length} scenes from ${path.basename(folder)}`);
  assert.ok(decisions(run).some(e => /pace|promo|lesson/.test(e.text)), 'the pace\'s rule');
  storyreel(folder, 'remake', path.join(folder, 'breakdown.json'));
  assert.equal(listRuns(folder).length, 2, 'named by its file: the same folder');
});

test('a remake with --starter leaves its run in the starter\'s out folder, where that film\'s own log finds it; a starter it cannot make leaves it beside the breakdown', t => {
  const folder = breakdownFolder(t), starter = path.join(folder, 'like-it');
  const made = storyreel(folder, 'remake', folder, '--starter', starter);
  assert.equal(made.status, 0, made.stderr);
  assert.equal(listRuns(path.join(starter, 'out'))[0].feature, 'remake');
  const again = storyreel(folder, 'remake', folder, '--starter', starter);
  assert.equal(again.status, 2);
  assert.match(listRuns(folder)[0].summary, /^failed: .*already has .*: name a new folder/);
  const bad = tempDir('runs-remake-none', t);
  assert.equal(storyreel(bad, 'remake', path.join(bad, 'nothing-here')).status, 2);
  assert.equal(existsSync(path.join(bad, ...RUNS)), false, 'no breakdown read, no chart run: no run');
});

/** A project of one kit-worded film; `door` a transition that passes every line's check and that the film refuses to compile. */
function applyProject(t) {
  const dir = installed(tempDir('runs-apply', t));
  const episode = {title: 'Ep', scenes: [{id: 'open', silent: [['first words', 1.5]]}, {id: 'shop', silent: [['second words', 1.5]]}]};
  const recipe = {story: {kit: 'kinetic', scene: 'open', words: [{text: 'ONE', at: ['open', 'first']}]},
    stages: [{type: 'world', scene: 'shop', enter: 'cut', world: {kit: 'kinetic', scene: 'shop', words: [{text: 'TWO', at: ['shop', 'second']}]}}]};
  writeFileSync(path.join(dir, 'recipe.json'), JSON.stringify(recipe, null, 2));
  writeFileSync(path.join(dir, 'storyboard.json'), JSON.stringify(episode));
  writeFileSync(path.join(dir, 'storyreel.config.mjs'), `import {readFileSync} from 'node:fs';
import {evenTimings} from 'footprint-storyreel';
import {kineticKit} from 'footprint-storyreel/kits/kinetic';
const curtain = {family: 'theatre', seconds: 1, ease: 'inOut', sound: null, params: {}, draw(ctx, {e, from, to}) { (e < .5 ? from : to)(ctx); }};
const door = {...curtain, regions: () => ({to: ['door']})};
const read = name => JSON.parse(readFileSync(new URL('./' + name, import.meta.url), 'utf8'));
export default {film: () => { const storyboard = read('storyboard.json'); return {storyboard, recipe: read('recipe.json'), kits: [kineticKit, {name: 'stage', transitions: {door}}], timings: evenTimings(storyboard, {tail: 0})}; }};
`);
  return dir;
}

test('an apply leaves its run, written or refused, in the project\'s out folder; the recipe changes only when it was written', {skip: posix ? false : 'links need rights on Windows'}, t => {
  const dir = applyProject(t), out = path.join(dir, 'out'), file = path.join(dir, 'recipe.json'), before = readFileSync(file, 'utf8');
  const refused = storyreel(dir, 'apply', 'attic enter fade');
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /\nThe recipe was not changed\.\n/);
  assert.equal(readFileSync(file, 'utf8'), before);
  const [no] = listRuns(out);
  assert.equal(no.feature, 'apply');
  assert.match(no.summary, /^failed: attic enter fade: /);
  assert.ok(no.entries.some(e => e.type === 'condition' && /attic enter fade/.test(e.text)), 'the rule that refused it');
  const broke = storyreel(dir, 'apply', 'shop enter door');
  assert.equal(broke.status, 2);
  assert.equal(readFileSync(file, 'utf8'), before);
  assert.match(listRuns(out)[0].summary, /^failed: the recipe with this line does not compile: /);
  const done = storyreel(dir, 'apply', 'shop enter fade');
  assert.equal(done.status, 0, done.stderr);
  assert.notEqual(readFileSync(file, 'utf8'), before);
  assert.match(listRuns(out)[0].summary, /^1 change written to recipe\.json: shop enter fade$/);
  assert.deepEqual(readdirSync(dir).sort(), ['node_modules', 'out', 'recipe.json', 'storyboard.json', 'storyreel.config.mjs'], 'nothing beside the recipe');
  assert.match(storyreel(dir, 'log').stdout, /^1\. .* apply · 1 change written to recipe\.json: shop enter fade/);
});

test('an apply whose run cannot be saved still writes the recipe, and says why the run was not kept', {skip: posix && modes === false ? false : 'needs POSIX modes, not as root'}, t => {
  const dir = applyProject(t), out = path.join(dir, 'open-out');
  mkdirSync(out); chmodSync(out, 0o775);
  writeFileSync(path.join(dir, 'storyreel.config.mjs'), readFileSync(path.join(dir, 'storyreel.config.mjs'), 'utf8').replace('timings: evenTimings(storyboard, {tail: 0})', 'timings: evenTimings(storyboard, {tail: 0}), out: \'open-out\''));
  const done = storyreel(dir, 'apply', 'shop enter fade');
  assert.equal(done.status, 0, done.stderr);
  assert.match(done.stderr, /^storyreel apply: this apply's run was not saved for storyreel log: /);
  assert.match(done.stdout, /1 change written\n$/);
});

test('a review that fails carries its record: its stages so far, in the log with what it failed on', async t => {
  const dir = tempDir('runs-review-failed', t);
  writeFileSync(path.join(dir, 'storyreel.config.mjs'), `export {default} from ${JSON.stringify(pathToFileURL(fixture).href)};\n`);
  const {film} = await loadProject({cwd: dir, out: path.join(dir, 'out')});
  const error = await reviewPart(film, {checks: {boom: {label: 'Boom', when: () => true, find: () => { throw new Error('the check broke'); }}}}).catch(e => e);
  assert.match(error.message, /a check failed, so the review is incomplete — "boom": the check broke/);
  assert.ok(error.record.some(e => e.stageId === 'read-part'), 'its stages so far');
});

test('a real render is one run of the log: the film\'s own stages and the compile\'s', {skip}, async t => {
  const dir = tempDir('runs-render', t), out = path.join(dir, 'out');
  writeFileSync(path.join(dir, 'storyreel.config.mjs'), `export {default} from ${JSON.stringify(pathToFileURL(fixture).href)};\n`);
  await makeFilm(fullRender(await loadProject({cwd: dir, out})));
  const [run] = listRuns(out);
  assert.equal(run.feature, 'render');
  assert.match(run.summary, /film\.mp4$/);
  assert.ok(run.entries.length > 5, `its entries: ${run.entries.length}`);
  const stages = new Set(run.entries.map(e => e.id));
  assert.ok(stages.has('read-inputs'), `the compile's stages: ${[...stages].join(', ')}`);
  assert.ok([...stages].some(id => id && !/^(read-inputs|build|guesses|checks|resolve)/.test(id)), `the film's own stages: ${[...stages].join(', ')}`);
});

/** The hello film in a folder of its own, its recipe file known and its out folder named: a studio on it. */
async function helloStudio(t, {out = null} = {}) {
  const dir = tempDir('runs-studio', t), file = path.join(dir, 'recipe.json'), home = path.join(tempDir('runs-home', t), 'storyreel'), said = [];
  copyFileSync(`${hello}recipe.json`, file); copyFileSync(`${hello}rule.ts`, path.join(dir, 'rule.ts'));
  const storyboard = JSON.parse(readFileSync(`${hello}storyboard.json`, 'utf8')), timings = evenTimings(storyboard, {tail: 4}), folder = out ?? path.join(dir, 'out');
  const compile = recipe => compileFilm({storyboard, recipe, root: dir, timings});
  const load = async () => { const recipe = JSON.parse(readFileSync(file, 'utf8')); return {film: await compile(recipe), storyboard, recipe, source: {file}, compile, out: folder}; };
  const studio = await startStudio({load, watch: [], port: 0, log: line => said.push(line), home});
  t.after(() => studio.close());
  return {studio, dir, file, home, out: folder, said, film: await (await fetch(`${studio.url}api/film`)).json()};
}
const leave = ({studio}, note) => fetch(`${studio.url}api/note`, {method: 'POST', body: JSON.stringify(note),
  headers: {'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: new URL(studio.url).origin}});

test('a note left in the studio leaves its run, naming its place, and never the person\'s key', async t => {
  const s = await helloStudio(t);
  const left = await leave(s, {version: s.film.version, t: 4.3, x: 350, y: 560, words: 'the shepherd walks in too fast'});
  assert.equal(left.status, 200);
  const [run] = listRuns(s.out);
  assert.equal(run.feature, 'note');
  assert.match(run.summary, /^at story\+4\.30 \(.*\) on story\.items\[0\]$/);
  assert.ok(decisions(run).some(e => /entry|drawing|note at/.test(e.text)), 'which entry it names, and why');
  const {key} = noteKey(s.home, {project: path.dirname(s.file)}), text = readFileSync(run.file, 'utf8');
  for (const form of [key.toString('hex'), key.toString('base64')]) assert.ok(!text.includes(form), 'the key is not in the run');
  const none = await helloStudio(t);
  assert.equal(existsSync(path.join(none.out, ...RUNS)), false, 'nothing kept before anything is done');
});

test('a Try leaves its run: the pick\'s checks, and what became of it — tried, refused by a check, or refused by the compile', async t => {
  const out = path.join(tempDir('runs-try', t), 'out'), curtain = {family: 'theatre', seconds: 1, ease: 'inOut', sound: null, params: {}, draw(ctx, {e, from, to}) { (e < .5 ? from : to)(ctx); }};
  const kits = [kineticKit, {name: 'stage', transitions: {door: {...curtain, regions: () => ({to: ['door']})}}}];
  const storyboard = {title: 'Ep', scenes: [{id: 'open', silent: [['first words', 1.5]]}, {id: 'shop', silent: [['second words', 1.5]]}]}, timings = evenTimings(storyboard, {tail: 0});
  const recipe = {story: {kit: 'kinetic', scene: 'open', words: [{text: 'ONE', at: ['open', 'first']}]},
    stages: [{type: 'world', scene: 'shop', enter: 'cut', world: {kit: 'kinetic', scene: 'shop', words: [{text: 'TWO', at: ['shop', 'second']}]}}]};
  const compile = copy => compileFilm({storyboard, recipe: copy, kits, timings});
  const studio = await startStudio({load: async () => ({film: await compile(recipe), storyboard, recipe, kits, compile, out}), watch: [], port: 0, log: () => {}, home: path.join(tempDir('runs-try-home', t), 'storyreel')});
  t.after(() => studio.close());
  const ask = (route, scene, name) => fetch(`${studio.url}api/${route}?scene=${scene}&kind=enter&name=${name}`);
  const tried = await ask('try', 'shop', 'fade');
  assert.equal(tried.status, 200, await tried.clone().text());
  const [run] = listRuns(out);
  assert.equal(run.feature, 'try');
  assert.match(run.summary, /^shop enter fade, tried on the film of version \d+$/);
  assert.ok(decisions(run).length > 0, 'the checks');
  assert.equal((await ask('try', 'attic', 'fade')).status, 422);
  assert.match(listRuns(out)[0].summary, /^failed: attic enter fade: /);
  assert.ok(decisions(listRuns(out)[0]).some(e => /attic enter fade/.test(e.text)), 'the rule that refused it');
  assert.equal((await ask('try', 'shop', 'door')).status, 422);
  assert.match(listRuns(out)[0].summary, /^shop enter door — failed: /);
  assert.equal((await ask('pick', 'attic', 'fade')).status, 422);
  assert.equal(listRuns(out).length, 3, 'a pick only looked at is no run: it is checked, not tried');
});

test('a note whose run cannot be saved is still taken: the studio says why in its own log', {skip: modes}, async t => {
  const out = tempDir('runs-open-out', t);
  chmodSync(out, 0o775);
  const s = await helloStudio(t, {out});
  const left = await leave(s, {version: s.film.version, t: 1, words: 'still taken'});
  assert.equal(left.status, 200);
  assert.ok(readFileSync(path.join(realpathSync(s.dir), 'feedback.md'), 'utf8').includes('still taken'));
  assert.ok(s.said.some(l => /^studio: this note's run was not saved for storyreel log: /.test(l)), s.said.join('\n'));
});

test('a reading of the notes leaves its run: whose each line is, and a tick refused; a project with no notes file leaves none', async t => {
  const s = await helloStudio(t), out = path.join(s.dir, 'kept'), recipe = {file: s.file, text: readFileSync(s.file, 'utf8')}, keep = run => keepRun(out, run), home = s.home;
  assert.match(await feedback(recipe, {}, {home, keep}), /no feedback\.md beside recipe\.json yet/);
  assert.equal(listRuns(out).length, 0);
  assert.equal((await leave(s, {version: s.film.version, t: 2, words: 'one note'})).status, 200);
  await feedback(recipe, {}, {home, keep});
  const [read] = listRuns(out);
  assert.equal(read.feature, 'feedback');
  assert.equal(read.summary, '1 of yours, 1 open');
  assert.ok(decisions(read).some(e => /yours|signed|mine/.test(e.text)), `whose the line is: ${decisions(read).map(e => e.text).join(' | ')}`);
  await assert.rejects(feedback(recipe, {done: '9'}, {home, keep}), /no note of yours is 9/);
  assert.match(listRuns(out)[0].summary, /^failed: no note of yours is 9/);
  await feedback(recipe, {done: '1'}, {home, keep});
  assert.equal(listRuns(out)[0].summary, '1 of yours, 0 open, ticked 1');
  assert.match(await feedback(recipe, {}, {home, keep: () => 'this feedback\'s run was not saved for storyreel log: a reason'}), /\n\(this feedback's run was not saved for storyreel log: a reason\)$/);
  assert.equal(JSON.parse(await feedback(recipe, {record: 'true'}, {home, keep: () => 'why'})).unsaved, 'why');
});
