import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {callTool, startOf} from '../src/mcp.mjs';
import {pacedTimings} from '../src/prepare.mjs';
import {readInputs} from '../src/tools.mjs';
import {fakeKit} from './fake-kit.mjs';

const CLI = fileURLToPath(new URL('../src/cli.mjs', import.meta.url)), FOUND = fileURLToPath(new URL('../examples/found/', import.meta.url));
const folders = [], folder = () => { const dir = mkdtempSync(path.join(tmpdir(), 'narrate-')); folders.push(dir); return dir; };
test.after(() => folders.forEach(dir => rmSync(dir, {recursive: true, force: true})));
const run = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], {cwd, encoding: 'utf8'});
const inputsAt = async dir => (await readInputs({cwd: dir})).inputs;

/** A project of the found film, as `create` makes it. */
function createdFilm() {
  const dir = folder();
  for (const f of ['story.json', 'chat.json']) writeFileSync(path.join(dir, f), readFileSync(path.join(FOUND, f)));
  execFileSync(process.execPath, [CLI, 'create', '--from', 'story.json', '--conversation', 'chat.json', '--to', 'film'], {cwd: dir});
  return path.join(dir, 'film');
}

/** A project of our own: a film of these scenes, with this narrationDir. */
function film(scenes, {narrationDir = 'voice', extra = ''} = {}) {
  const dir = folder();
  writeFileSync(path.join(dir, 'storyboard.json'), JSON.stringify({title: 'T', scenes}));
  writeFileSync(path.join(dir, 'recipe.json'), JSON.stringify({story: {}, stages: []}));
  writeFileSync(path.join(dir, 'storyreel.config.mjs'), `import {readFileSync} from 'node:fs';
const read = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
export default {film: () => ({storyboard: read('./storyboard.json'), recipe: read('./recipe.json'), out: 'out'${narrationDir ? `, narrationDir: '${narrationDir}'` : ''}${extra}})};
`);
  return dir;
}

test('a created film: only reads with no voice, then a kit voices it, and the film is timed by the voice', async () => {
  const dir = createdFilm(), {kit, said} = fakeKit(folder());
  const read = run(dir, 'narrate');
  assert.equal(read.status, 0, read.stderr);
  assert.match(read.stdout, /^0 of \d scenes voiced · \d to voice · 0 silent · 0 s so far/);
  assert.match(read.stdout, /next: storyreel narrate --kit/);
  assert.match(read.stdout, /the film stays silent until every scene is voiced/);
  assert.equal(existsSync(path.join(dir, 'voice')), false, 'asking writes nothing');
  assert.equal((await inputsAt(dir)).voiced, false);

  const first = run(dir, 'narrate', '--kit', kit, '--only', '1');
  assert.equal(first.status, 0, first.stderr);
  assert.equal(said().length, 1);
  assert.match(first.stdout, /^1 of \d scenes voiced/);
  assert.match(first.stdout, /the film stays silent until every scene is voiced/);
  assert.doesNotMatch(first.stdout, /a line a kit prints/, 'a kit\'s own output is not the answer');
  assert.equal(existsSync(path.join(dir, 'voice', 'timings.json')), false);

  const all = run(dir, 'narrate', '--kit', kit);
  assert.equal(all.status, 0, all.stderr);
  assert.match(all.stdout, /the film is timed by this voice now/);
  assert.ok(said().some(line => line.includes('four thousand three hundred fifty-five')), 'its numbers are said in words');
  assert.equal((await inputsAt(dir)).voiced, true);
  const timings = JSON.parse(readFileSync(path.join(dir, 'voice', 'timings.json'), 'utf8'));
  assert.deepEqual(timings.scenes.map(s => s.id), JSON.parse(readFileSync(path.join(dir, 'storyboard.json'), 'utf8')).scenes.map(s => s.id));
  for (const s of timings.scenes) assert.ok(existsSync(path.join(dir, 'voice', s.audio)), s.audio);

  const timeline = run(dir, 'timeline');
  assert.equal(timeline.status, 0, timeline.stderr);
  const before = said().length;
  assert.match(run(dir, 'narrate').stdout, /the film is timed by this voice now/, 'asked later with no voice named, the clips are found');
  assert.equal(said().length, before);
  assert.ok(!JSON.stringify(readFileSync(path.join(dir, 'voice', 'cache', 'recipe.json'), 'utf8')).includes('private note'));
});

test('create again: the timings go with the old words, the clips stay, and only changed words cost anything', () => {
  const dir = createdFilm(), {kit, said} = fakeKit(folder()), project = path.dirname(dir);
  run(dir, 'narrate', '--kit', kit);
  const voiced = said().length;
  execFileSync(process.execPath, [CLI, 'create', '--from', 'story.json', '--conversation', 'chat.json', '--to', 'film'], {cwd: project});
  assert.equal(existsSync(path.join(dir, 'voice', 'timings.json')), false, 'the words may have changed');
  assert.match(run(dir, 'narrate').stdout, /the film is timed by this voice now/, 'the same words join again for nothing');
  assert.equal(said().length, voiced);

  const board = JSON.parse(readFileSync(path.join(dir, 'storyboard.json'), 'utf8'));
  board.scenes[0].narration = `${board.scenes[0].narration} And one more thing to say.`;
  writeFileSync(path.join(dir, 'storyboard.json'), JSON.stringify(board));
  const changed = run(dir, 'narrate');
  assert.match(changed.stdout, /1 to voice/);
  assert.match(changed.stdout, /the film stays silent/);
  assert.equal(existsSync(path.join(dir, 'voice', 'timings.json')), false);
});

test('a silent scene is left to the clock, and a line said twice gets a sound of its own each time, because pacing cuts into it', async () => {
  const line = 'The same words said twice.';
  const dir = film([{id: 'a', narration: line}, {id: 'b', silent: [['the door opens', 1]]}, {id: 'c', narration: line}]), {kit, said} = fakeKit(folder());
  const done = run(dir, 'narrate', '--kit', kit);
  assert.equal(done.status, 0, done.stderr);
  assert.match(done.stdout, /^2 of 2 scenes voiced · 0 to voice · 1 silent/);
  assert.deepEqual(said(), [line], 'one clip');
  const {scenes} = JSON.parse(readFileSync(path.join(dir, 'voice', 'timings.json'), 'utf8'));
  assert.deepEqual(scenes.map(s => [s.id, s.audio]), [['a', 'said-1.wav'], ['c', 'said-3.wav']]);
  const {inputs, said: board} = await readInputs({cwd: dir});
  const copy = path.join(folder(), 'copy');
  mkdirSync(copy);
  const paced = await pacedTimings({storyboard: board, narrationDir: inputs.narrationDir, pacing: {voiceSpeed: 1, sceneTail: .5, holds: [{scene: 'a', after: 'same words', seconds: .3}]}, copy});
  assert.deepEqual(paced.scenes.map(s => s.id), ['a', 'b', 'c'], 'a render reads this voice folder and paces a copy');
  assert.ok(paced.scenes[0].duration > scenes[0].duration);
  assert.deepEqual(readdirSync(path.join(dir, 'voice')).filter(f => f.includes('unpaced')), [], 'never in place');
});

test('it refuses what it cannot do, naming the fix, before any voicing', () => {
  const {kit, said} = fakeKit(folder());
  const refused = (dir, pattern, ...args) => { const r = run(dir, 'narrate', ...args); assert.equal(r.status, 1, r.stdout); assert.match(r.stderr, pattern); };
  const plain = [{id: 'a', narration: 'Some plain words here.'}];
  refused(film(plain, {narrationDir: null}), /add narrationDir: 'voice'/);
  refused(film(plain, {extra: `, timings: {scenes: []}`}), /gives its own timings/);
  const foreign = film(plain);
  mkdirSync(path.join(foreign, 'voice'));
  writeFileSync(path.join(foreign, 'voice', 'timings.json'), '{"scenes":[]}');
  refused(foreign, /holds a voice narrate did not make/);
  refused(foreign, /holds a voice narrate did not make/, '--kit', kit);
  assert.equal(readFileSync(path.join(foreign, 'voice', 'timings.json'), 'utf8'), '{"scenes":[]}');
  refused(film(plain), /name the voice too/, '--only', '1');
  refused(film(plain), /recordings need the voice kit too/, '--takes', 'x');
  refused(film(plain), /--only is empty/, '--kit', kit, '--only', '');
  refused(film(plain), /is not a step/, '--kit', kit, '--only', 'first');
  refused(film(plain), /no voice settings/, '--kit', folder());
  const digits = film([{id: 'a', narration: 'It took 16 tries.'}]);
  refused(digits, /"16" in a: write them as number slots/, '--kit', kit);
  assert.match(run(digits, 'narrate').stdout, /to fix first: .*"16" in a/, 'reading says so too');
  refused(film([{id: 'a', narration: '{@ana}"Hello there."'}]), /one voice would say every line/, '--kit', kit);
  assert.deepEqual(said(), []);
});

test('a clip with no timed words cannot time a film, and says so', () => {
  const dir = film([{id: 'a', narration: 'Some plain words here.'}]), {kit} = fakeKit(folder());
  const python = path.join(kit, '.venv-voice', 'bin', 'python');
  writeFileSync(python, readFileSync(python, 'utf8').replace("return {id: s.id, audio: s.id + '.wav', duration, words};", "return {id: s.id, audio: s.id + '.wav', duration};"));
  const r = run(dir, 'narrate', '--kit', kit);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /scene "a": its clip has no timed words/);
  assert.equal(existsSync(path.join(dir, 'voice', 'timings.json')), false);
});

const textOf = r => r.content[0].text;

test('over MCP: a call reads, a voice is the start\'s to give, and it reaches narrate alone', async () => {
  const dir = film([{id: 'a', narration: 'Some plain words here.'}, {id: 'b', narration: 'And some more of them.'}]), {kit, said} = fakeKit(folder());
  const noVoice = {cwd: dir, defaults: {}}, voice = {cwd: dir, defaults: {kit}};
  assert.match(textOf(await callTool('narrate', {}, noVoice)), /^0 of 2 scenes voiced/);
  const none = await callTool('narrate', {say: 'all'}, noVoice);
  assert.equal(none.isError, true);
  assert.match(textOf(none), /started with no voice/);
  for (const args of [{kit}, {takes: 'x'}, {say: 'all', kit}]) {
    const r = await callTool('narrate', args, voice);
    assert.equal(r.isError, true);
    assert.match(textOf(r), /fixed when the MCP server starts/);
  }
  assert.match(textOf(await callTool('narrate', {only: '1'}, voice)), /narrate takes no "only" \(it takes say\)/);
  assert.match(textOf(await callTool('narrate', {say: '--kit /evil'}, voice)), /would be read as a flag/);
  assert.match(textOf(await callTool('narrate', {say: 'first'}, voice)), /is not a step/);
  assert.match(textOf(await callTool('narrate', {say: '  '}, voice)), /say is "all"/);
  assert.match(textOf(await callTool('narrate', {}, voice)), /^0 of 2 scenes voiced/, 'asking never starts a long run, even with a voice');
  assert.deepEqual(said(), []);
  const one = await callTool('narrate', {say: '1'}, voice);
  assert.match(textOf(one), /^1 of 2 scenes voiced/);
  assert.doesNotMatch(textOf(one), /a line a kit prints/);
  const [whole, second] = await Promise.all([callTool('narrate', {say: 'all'}, voice), callTool('narrate', {say: 'all'}, voice)]);
  assert.match(textOf(whole), /^2 of 2 scenes voiced/);
  assert.equal(second.isError, true);
  assert.match(textOf(second), /being voiced already/, 'one voicing at a time');
  assert.equal(said().length, 2);
  assert.match(textOf(await callTool('narrate', {say: 'all'}, voice)), /^2 of 2 scenes voiced/, 'and free again once it is done');
  // the film's config sees no voice flag from any other tool's call
  const flagsSeen = path.join(dir, 'flags.json');
  writeFileSync(path.join(dir, 'storyreel.config.mjs'), `${readFileSync(path.join(dir, 'storyreel.config.mjs'), 'utf8').replace('film: () => ({', `film: (flags) => (writeFileSync(${JSON.stringify(flagsSeen)}, JSON.stringify(flags)), {`).replace("import {readFileSync}", "import {readFileSync, writeFileSync}")}`);
  await callTool('timeline', {}, voice);
  assert.equal(JSON.parse(readFileSync(flagsSeen, 'utf8')).kit, undefined);
});

test('numbers said in words: only those standing whole, a comma only grouping thousands, and the film still compiles', async () => {
  const {filmFromBoard} = await import('../src/storyboard/film.mjs');
  const {readStoryboard} = await import('footprint-story/storyboard');
  const story = JSON.parse(readFileSync(path.join(FOUND, 'story.json'), 'utf8'));
  const said = line => {
    const edited = {...structuredClone(story), intro: line};
    const {storyboard} = filmFromBoard(readStoryboard(edited));
    return storyboard.scenes[0].say ?? [];
  };
  assert.deepEqual(said('In 2026 we took 1,000 tries and 12.05 s, about 20% of it on version 0.4.0, here at the start.'),
    [['2026', 'two thousand twenty-six'], ['1,000', 'one thousand'], ['12.05', 'twelve point zero five'], ['20%', 'twenty percent'], ['0.4.0', 'zero point four point zero']]);
  assert.deepEqual(said('Then 1,2,3 came along and that was the very start of it.').map(([shown]) => shown), ['1', '2', '3']);
  assert.deepEqual(said('The 1st pattern from the 1990s in a 3D view, using GPT-4o at 5pm, ran 3x longer.').map(([shown]) => shown), [], 'digits joined to letters are no slot');
});

test('a voice folder is the project\'s, wherever the command was run from', () => {
  const dir = film([{id: 'a', narration: 'Some plain words here.'}], {extra: `, pacing: {sceneTail: 0.8, holds: []}`}), {kit} = fakeKit(folder());
  const parent = path.dirname(dir), at = path.basename(dir);
  assert.equal(run(parent, 'narrate', '--cwd', at, '--config', 'storyreel.config.mjs', '--kit', kit).status, 0);
  assert.ok(existsSync(path.join(dir, 'voice', 'timings.json')));
});

test('a server\'s voice is read from where it was started, whatever folder its calls run in', () => {
  const start = startOf({cwd: '/', kit: 'kit', takes: 'takes'}, '/some/where');
  assert.deepEqual(start.defaults, {kit: path.resolve('/some/where/kit'), takes: path.resolve('/some/where/takes')});
});
