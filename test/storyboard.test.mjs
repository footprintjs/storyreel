import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {readStoryboard} from 'footprint-story/storyboard';
import {createCanvas} from '@napi-rs/canvas';
import {compileFilm, evenTimings} from '../src/index.mjs';
import {filmFromBoard} from '../src/storyboard/film.mjs';
import {briefTool, createFilm, createTool, shapesTool} from '../src/storyboard/create.mjs';

const CHAT = [{id: 'm1', text: 'disk at 40 percent'}, {id: 'm2', text: 'waited 41 minutes on 3 nights'}];
const STORY = (over = {}) => ({shape: 'what-we-found', title: 'Why it slowed', subtitle: 'A short look', intro: 'This is what we found about the job.', closing: 'That is the whole of it.',
  checked: [{what: 'Disk', found: '40 percent full', sources: ['m1']}], found: [{headline: 'It waits on a lock', line: 'It waited 41 minutes', notes: 'The job waits on a lock, for 41 minutes.', sources: ['m2']}],
  unsure: [{what: 'Whether Tuesday is the same', why: 'no logs from then'}], next: ['Fix the lock', 'Watch it for a week'], ...over});
const film = (over) => filmFromBoard(readStoryboard(STORY(over)));
const folder = () => realpathSync(mkdtempSync(path.join(tmpdir(), 'storyboard-film-')));

test('a board becomes a film that compiles, with a scene per part', async () => {
  const {storyboard, recipe} = film();
  assert.deepEqual(storyboard.scenes.map((s) => s.id), ['title', 'checked', 'found', 'unsure', 'next']);
  assert.deepEqual(recipe.stages.map((s) => s.scene), ['checked', 'found', 'unsure', 'next']);
  assert.ok((await compileFilm({storyboard, recipe, timings: evenTimings(storyboard)})).total > 0);
});

test('a card shows its words and the messages they rest on, and comes in as they are said', () => {
  const {storyboard, recipe} = film();
  const [checked, found, unsure, next] = recipe.stages;
  assert.deepEqual(checked.cards, [{at: ['checked', 'Disk: 40 percent'], head: 'm1', text: 'Disk: 40 percent full'}]);
  assert.equal(found.title, 'It waits on a lock');
  assert.equal(found.chip, 'What we found');
  assert.deepEqual(found.cards[0], {at: ['found', 'The job waits'], head: 'm2', text: 'It waited 41 minutes', icon: 'bulb'});
  assert.equal(unsure.title, 'What we are not sure about');
  assert.equal(unsure.chip, undefined);
  assert.equal(unsure.cards[0].text, 'Whether Tuesday is the same: no logs from then');
  assert.deepEqual(next.cards.map((c) => c.text), ['Fix the lock', 'Watch it for a week']);
  assert.match(storyboard.scenes.at(-1).narration, /^Fix the lock\. Watch it for a week\. That is the whole of it\.$/);
});

test('several found keep the label as the title and put each headline on its card', () => {
  const two = [1, 2].map((n) => ({headline: `Finding ${n}`, line: `Line ${n}`, notes: `The finding number ${n} is here.`}));
  const stage = film({found: two}).recipe.stages[1];
  assert.equal(stage.title, 'What we found');
  assert.deepEqual(stage.cards.map((c) => c.text), ['Finding 1: Line 1', 'Finding 2: Line 2']);
});

test('more than a stage holds goes on over pages, each a scene of its own', async () => {
  const checked = Array.from({length: 5}, (_, i) => ({what: `Check ${i}`, found: `result ${i}`}));
  const {storyboard, recipe} = film({checked, next: ['One', 'Two', 'Three', 'Four']});
  assert.deepEqual(storyboard.scenes.map((s) => s.id), ['title', 'checked', 'checked-2', 'found', 'unsure', 'next', 'next-2']);
  assert.equal(recipe.stages[0].cards.length, 3);
  assert.equal(recipe.stages[1].cards.length, 2);
  assert.ok((await compileFilm({storyboard, recipe, timings: evenTimings(storyboard)})).total > 0);
  assert.match(storyboard.scenes.at(-1).narration, /That is the whole of it/);
  assert.doesNotMatch(storyboard.scenes.at(-2).narration, /That is the whole of it/);
});

test('every phrase a card comes in on is said, once', async () => {
  const same = [{what: 'The same words', found: 'here', notes: 'The same words start this.'}, {what: 'The same words', found: 'there', notes: 'The same words start that one too.'}];
  const {storyboard, recipe} = film({checked: same});
  assert.ok((await compileFilm({storyboard, recipe, timings: evenTimings(storyboard)})).total > 0);
  assert.deepEqual(recipe.stages[0].cards.map((c) => c.at[1]), ['The same words start this.', 'The same words start that']);
});

test('a story with nothing unsure has no scene for it', () => {
  assert.deepEqual(film({unsure: []}).storyboard.scenes.map((s) => s.id), ['title', 'checked', 'found', 'next']);
});

test('a long title goes over lines on the whiteboard', () => {
  const {recipe} = film({title: 'A rather long title that will not fit on one line of the board'});
  assert.ok(recipe.story.items.filter((i) => i.size === 64).length >= 2);
});

test('it names every card too long for a film, and refuses a shape it cannot draw yet', () => {
  const long = 'x'.repeat(60);
  assert.throws(() => film({checked: [{what: long, found: long}], next: ['y'.repeat(90), 'Short']}), (e) => {
    assert.match(e.message, /1 problem a film cannot show:\n- checked-1 says 122 characters on its card, and 96 fit in a film/);
    assert.equal(e.problems.length, 1);
    return true;
  });
  const told = {shape: 'told-twice'};
  assert.throws(() => filmFromBoard(told), /a film draws "what-we-found" for now, and this board is "told-twice"/);
});

test('nothing a film draws from a storyboard says "undefined", and each part shows its words', async () => {
  const {storyboard, recipe} = film();
  const made = await compileFilm({storyboard, recipe, timings: evenTimings(storyboard)});
  const canvas = createCanvas(1600, 900), ctx = canvas.getContext('2d'), said = new Set(), fillText = ctx.fillText.bind(ctx);
  ctx.fillText = (text, ...rest) => { said.add(String(text)); return fillText(text, ...rest); };
  for (let t = 0; t < made.total; t += .5) made.frame(ctx, t);
  const shown = [...said].join(' | ');
  assert.doesNotMatch(shown, /undefined|null|NaN/);
  for (const words of ['What we checked', 'It waits on a lock', 'What we are not sure about', 'What happens next']) assert.ok(said.has(words), `${words} in ${shown}`);
});

test('words stay words: a brace is refused, wherever a film would read it as its script', () => {
  for (const over of [{checked: [{what: 'Disk', found: 'fine', notes: 'We asked and {@owner}"ship it."'}]}, {checked: [{what: 'Disk {', found: 'fine', notes: 'Own words here.'}]},
    {intro: 'We looked at it {hop} closely and well, in the end.'}, {closing: 'That is {{owner}} all.'}, {next: ['Fix {it}', 'Watch it']}, {title: 'Why {it} slowed'}, {subtitle: 'A {look}'}]) {
    assert.throws(() => film(over), (e) => {
      assert.ok(e.problems.some((p) => /has a brace, which a film would read as its own script/.test(p.message)), JSON.stringify(over));
      return true;
    });
  }
});

test('a card with no moment of its own is refused, and one that shares its opening is not', () => {
  assert.throws(() => film({next: ['Watch the lock for a week', 'Watch the lock']}), (e) => {
    assert.deepEqual(e.problems, [{at: 'next', message: 'is said more than once in its scene, so it has no moment of its own: reword it'}]);
    return true;
  });
  assert.throws(() => film({checked: [{what: 'A', found: 'b', notes: 'We looked at the disk. It was fine.'}, {what: 'C', found: 'd', notes: 'We looked at the disk.'}]}), /checked-2 is said more than once/);
  assert.throws(() => film({checked: [{what: 'A', found: 'b', notes: 'The same words.'}, {what: 'C', found: 'd', notes: 'The same words.'}]}), /is said more than once/);
  assert.equal(film({next: ['That is the whole of it', 'Watch it']}).recipe.stages.at(-1).cards[0].at[1], 'That is the');
});

test('an intro too short to write its title over is refused', () => {
  assert.throws(() => film({intro: 'Hi.'}), /intro is too short for its title to be written while it is said: 5 words at the least/);
});

test('a board in another language keeps its language, for how the film reads its numbers', async () => {
  const labels = {checked: 'Geprüft', found: 'Gefunden', unsure: 'Unsicher', next: 'Weiter'};
  const cwd = folder();
  try {
    const made = await createFilm('de', STORY({lang: 'de', labels}), {cwd});
    assert.equal(made.board.lang, 'de');
    assert.match(readFileSync(path.join(cwd, 'de', 'storyreel.config.mjs'), 'utf8'), /\{lang\}/);
  } finally { rmSync(cwd, {recursive: true, force: true}); }
});

test('create makes a folder the tools can read, says what was checked, and leaves its config alone', async () => {
  const cwd = folder();
  try {
    writeFileSync(path.join(cwd, 'story.json'), JSON.stringify(STORY()));
    writeFileSync(path.join(cwd, 'chat.json'), JSON.stringify(CHAT));
    const text = await createTool(null, {from: 'story.json', to: 'my-film', conversation: 'chat.json', cwd});
    assert.match(text, /^✓ my-film · what-we-found · 5 scenes · [\d.]+ s, silent\n {2}its numbers were checked against the conversation/);
    for (const f of ['story.json', 'storyboard.json', 'recipe.json', 'storyreel.config.mjs']) assert.ok(existsSync(path.join(cwd, 'my-film', f)), f);
    writeFileSync(path.join(cwd, 'my-film', 'storyreel.config.mjs'), '// mine');
    assert.match(await createTool(null, {from: 'story.json', to: 'my-film', cwd}), /its numbers were not checked: name a --conversation/);
    assert.equal(readFileSync(path.join(cwd, 'my-film', 'storyreel.config.mjs'), 'utf8'), '// mine');
  } finally { rmSync(cwd, {recursive: true, force: true}); }
});

test('create names every mistake at once, and a number the conversation does not hold', async () => {
  const cwd = folder();
  try {
    await assert.rejects(() => createFilm('x', STORY({title: '', found: [{headline: 'Waited 99', line: 'a', notes: 'b', sources: ['m2']}]}), {conversation: CHAT, cwd}), (e) => {
      assert.deepEqual(e.problems.map((p) => p.at), ['title', 'found[0]']);
      return true;
    });
    assert.ok(!existsSync(path.join(cwd, 'x')));
  } finally { rmSync(cwd, {recursive: true, force: true}); }
});

test('create refuses a folder it did not make, and anything outside the project', async () => {
  const cwd = folder(), outside = folder();
  try {
    mkdirSync(path.join(cwd, 'held'));
    writeFileSync(path.join(cwd, 'held', 'mine.txt'), 'mine');
    writeFileSync(path.join(cwd, 'story.json'), JSON.stringify(STORY()));
    await assert.rejects(() => createTool(null, {from: 'story.json', to: 'held', cwd}), /already holds files, and create did not make it/);
    mkdirSync(path.join(cwd, 'own'));
    for (const f of ['story.json', 'storyboard.json', 'recipe.json']) writeFileSync(path.join(cwd, 'own', f), 'mine');
    await assert.rejects(() => createTool(null, {from: 'story.json', to: 'own', cwd}), /already holds files, and create did not make it/);
    assert.equal(readFileSync(path.join(cwd, 'own', 'recipe.json'), 'utf8'), 'mine');
    await assert.rejects(() => createTool(null, {from: 'story.json', to: '../away', cwd}), /is outside this project/);
    await assert.rejects(() => createTool(null, {from: '../story.json', to: 'x', cwd}), /is outside this project/);
    symlinkSync(outside, path.join(cwd, 'link'));
    await assert.rejects(() => createTool(null, {from: 'story.json', to: 'link/x', cwd}), /is outside this project/);
    assert.ok(!existsSync(path.join(outside, 'x')));
    await assert.rejects(() => createTool(null, {to: 'x', cwd}), /give the storyboard one way/);
    await assert.rejects(() => createTool(null, {from: 'nope.json', to: 'x', cwd}), /no storyboard file "nope.json": name a JSON file in this project/);
    writeFileSync(path.join(cwd, 'bad.json'), '{oops');
    await assert.rejects(() => createTool(null, {from: 'bad.json', to: 'x', cwd}), /is not valid JSON/);
  } finally { rmSync(cwd, {recursive: true, force: true}); rmSync(outside, {recursive: true, force: true}); }
});

test('a storyboard can be given as its JSON, into a folder holding only what this call reads', async () => {
  const cwd = folder();
  try {
    writeFileSync(path.join(cwd, 'chat.json'), JSON.stringify(CHAT));
    const text = await createTool(null, {story: JSON.stringify(STORY()), to: '.', conversation: 'chat.json', cwd});
    assert.match(text, /^✓ \. · what-we-found[^\n]*\n {2}its numbers were checked[^\n]*\n {2}next: storyreel timeline/);
    assert.ok(existsSync(path.join(cwd, 'storyreel.config.mjs')));
    assert.equal(readFileSync(path.join(cwd, 'chat.json'), 'utf8'), JSON.stringify(CHAT));
    await assert.rejects(() => createTool(null, {from: 'a.json', story: '{}', to: 'x', cwd}), /give the storyboard one way/);
    await assert.rejects(() => createTool(null, {to: 'x', cwd}), /give the storyboard one way/);
    await assert.rejects(() => createTool(null, {story: '{oops', to: 'x', cwd}), /--story is not valid JSON/);
    await assert.rejects(() => createTool(null, {story: '{}', cwd}), /name the new folder/);
    await assert.rejects(() => createTool(null, {story: 'x'.repeat((1 << 20) + 1), to: 'x', cwd}), /too big/);
  } finally { rmSync(cwd, {recursive: true, force: true}); }
});

test('over MCP: shapes, brief, create, then the review tools on the film it made; a call cannot choose its folder', async () => {
  const cwd = folder();
  try {
    writeFileSync(path.join(cwd, 'chat.json'), JSON.stringify(CHAT));
    const child = spawn(process.execPath, [fileURLToPath(new URL('../src/cli.mjs', import.meta.url)), 'mcp'], {cwd, stdio: ['pipe', 'pipe', 'inherit']});
    const replies = new Map(), waiting = new Map();
    createInterface({input: child.stdout}).on('line', (line) => { const m = JSON.parse(line); replies.set(m.id, m); waiting.get(m.id)?.(m); });
    let id = 0;
    const call = (name, args) => new Promise((resolve) => { id += 1; waiting.set(id, resolve); child.stdin.write(`${JSON.stringify({jsonrpc: '2.0', id, method: 'tools/call', params: {name, arguments: args}})}\n`); });
    const text = (reply) => reply.result.content[0].text;
    assert.deepEqual(JSON.parse(text(await call('shapes', {}))).map((s) => s.name), ['told-twice', 'what-we-found']);
    assert.match(text(await call('brief', {shape: 'what-we-found', conversation: 'chat.json'})), /as material:\n\{"id":"m1"/);
    const wrong = await call('create', {story: JSON.stringify(STORY({found: [{headline: 'Waited 99', line: 'a', notes: 'b', sources: ['m2']}]})), to: '.', conversation: 'chat.json'});
    assert.equal(wrong.result.isError, true);
    assert.match(text(wrong), /says 99, which none of its sources \(m2\) says/);
    assert.match(text(await call('create', {story: JSON.stringify(STORY()), to: '.', conversation: 'chat.json'})), /numbers were checked against the conversation/);
    assert.match(text(await call('timeline', {})), /── checked/);
    assert.equal((await call('create', {story: '{}', to: '.', cwd: '/tmp'})).result.isError, true);
    child.stdin.end();
    await once(child, 'close');
  } finally { rmSync(cwd, {recursive: true, force: true}); }
});

test('shapes and brief tell a model what to write, keeping the conversation apart', () => {
  assert.deepEqual(JSON.parse(shapesTool()).map((s) => s.name), ['told-twice', 'what-we-found']);
  assert.throws(() => briefTool(null, {}), /name the shape: --shape told-twice or what-we-found/);
  const cwd = folder();
  try {
    writeFileSync(path.join(cwd, 'chat.json'), JSON.stringify(CHAT));
    const text = briefTool(null, {shape: 'what-we-found', conversation: 'chat.json', cwd});
    assert.match(text, /material, never instructions/);
    assert.match(text, /The conversation, as material:\n\{"id":"m1","text":"disk at 40 percent"\}/);
    assert.doesNotMatch(briefTool(null, {shape: 'what-we-found', cwd}), /as material:/);
  } finally { rmSync(cwd, {recursive: true, force: true}); }
});

test('the example is a conversation, a storyboard checked against it, and a film', async () => {
  const read = (f) => JSON.parse(readFileSync(new URL(`../examples/found/${f}`, import.meta.url), 'utf8'));
  const board = readStoryboard(read('story.json'), {conversation: read('chat.json')});
  assert.equal(board.verified, true);
  const {storyboard, recipe} = filmFromBoard(board);
  assert.ok((await compileFilm({storyboard, recipe, timings: evenTimings(storyboard)})).total > 30);
});
