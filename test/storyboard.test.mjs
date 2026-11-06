import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {readStoryboard} from 'footprint-story/storyboard';
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
    await assert.rejects(() => createTool(null, {from: 'story.json', to: '../away', cwd}), /is outside this project/);
    await assert.rejects(() => createTool(null, {from: '../story.json', to: 'x', cwd}), /is outside this project/);
    symlinkSync(outside, path.join(cwd, 'link'));
    await assert.rejects(() => createTool(null, {from: 'story.json', to: 'link/x', cwd}), /is outside this project/);
    assert.ok(!existsSync(path.join(outside, 'x')));
    await assert.rejects(() => createTool(null, {to: 'x', cwd}), /name the storyboard and the new folder/);
    await assert.rejects(() => createTool(null, {from: 'nope.json', to: 'x', cwd}), /no storyboard file "nope.json": name a JSON file in this project/);
    writeFileSync(path.join(cwd, 'bad.json'), '{oops');
    await assert.rejects(() => createTool(null, {from: 'bad.json', to: 'x', cwd}), /is not valid JSON/);
  } finally { rmSync(cwd, {recursive: true, force: true}); rmSync(outside, {recursive: true, force: true}); }
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
