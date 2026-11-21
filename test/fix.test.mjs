// Findings that say the fix (src/fix/): every finding names the recipe entry it is about (`where`) and one concrete
// change (`fix`), and the whiteboard's and the paper's drawings are regions too, so two more checks can name theirs:
// words laid over a drawing, and a drawing run off its sheet. Each case: one that fires, one that does not, the reply
// line pinned.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {compileFilm, evenTimings} from '../src/index.mjs';
import {reviewPart, findingsText, REVIEW_CHECKS} from '../src/review.mjs';
import {entryAt, placesOf, shareIn, within} from '../src/fix/places.mjs';
import {clearOf, intoBounds, moveFix, shrinkFix, moveWords} from '../src/fix/moves.mjs';
import {DRAWINGS} from '../src/fix/drawings.mjs';
import {isOneLine} from '../src/oneline.mjs';

const storyboard = {title: 'Board', scenes: [{id: 'board', narration: 'A shepherd stands by the gate. He writes a word in a box, and then he draws a pen that runs past the edge of the board while the voice goes on.'}]};
const figure = {at: ['board', 'A shepherd'], dur: 1, draw: [['figure', 300, 620, 1.1]]};
const boxed = [{at: ['board', 'in a box'], dur: .6, draw: [['rect', 900, 200, 400, 160]]}, {at: ['board', 'in a box'], dur: .6, write: 'in a box', x: 1100, y: 290, size: 40, align: 'center'}];
const board = items => compileFilm({storyboard, timings: evenTimings(storyboard, {wordSeconds: .3, tail: 2}), recipe: {story: {kit: 'whiteboard', items}}});
const kinds = (r, kind) => r.findings.filter(f => f.kind === kind);

test('the whiteboard says which of its items are drawings, and which hold words; the paper\'s card is one that holds its rows', async () => {
  const film = await board([figure, {at: ['board', 'He writes'], dur: .6, write: 'a word', x: 300, y: 300, size: 40}, ...boxed]);
  const shown = film.regionsAt(film.total - .5).map(({path, drawing, holds, sheet}) => [path, Boolean(drawing), Boolean(holds), Boolean(sheet)]);
  assert.deepEqual(shown, [['story', false, false, true], ['story.items[0]', true, false, false], ['story.items[1]', false, false, false], ['story.items[2]', true, true, false], ['story.items[3]', false, false, false]],
    'the world is the sheet its items are written on; a figure is ink, words are not a drawing, a rect frames what is written inside it');
  const dir = fileURLToPath(new URL('../examples/hello/', import.meta.url)), read = file => JSON.parse(readFileSync(dir + file, 'utf8'));
  const hello = await compileFilm({storyboard: read('storyboard.json'), timings: evenTimings(read('storyboard.json'), {tail: 4}), recipe: read('recipe.json'), root: dir});
  const t = hello.clock.at(['rule', 'That is the idea']) + 1, card = hello.regionsAt(t).find(r => r.path === 'card');
  assert.ok(card.drawing && card.holds, 'the paper\'s card: a drawing that holds its rows');
  assert.ok(hello.regionsAt(t).filter(r => r.path.startsWith('card.rows')).every(r => !r.drawing), 'its rows are words');
});

test('words laid over a drawing: named by their item, moved clear of the drawing in the board\'s own units; words inside a box are its label', async () => {
  const over = await board([figure, {at: ['board', 'He writes'], dur: .6, write: 'over the figure', x: 300, y: 560, size: 40, align: 'center'}, ...boxed]);
  const r = await reviewPart(over), [found] = kinds(r, 'words-over-drawing');
  assert.ok(r.ran.includes('words-over-drawing'), 'picked: the part draws words, and the kit says where its drawings are');
  assert.deepEqual([found.where, found.what], ['story.items[1]', '"over the figure" over "figure" (story.items[0])']);
  // The board hangs at 0.9: 126 frame pixels up are 138 of the board's (pointAt), and the item's own y moves by them.
  assert.equal(findingsText([found]), `${findingsText([{...found, where: undefined, fix: undefined}])} · at story.items[1] · fix: move it 138 up, clear of "figure" (story.items[0]): set x, y to (300, 422)`);
  assert.match(r.text, /^0:02\.3–0:11\.8 board · words over a drawing: "over the figure" over "figure" \(story\.items\[0\]\) · at story\.items\[1\] · fix: move it 138 up, clear of "figure" \(story\.items\[0\]\): set x, y to \(300, 422\)$/m);
  assert.equal(kinds(r, 'words-over-drawing').length, 1, '"in a box" lies wholly inside the rect, which holds words: its label, not over it');
  // Moved where the fix says, nothing is over anything.
  const moved = await reviewPart(await board([figure, {at: ['board', 'He writes'], dur: .6, write: 'over the figure', x: 300, y: 422, size: 40, align: 'center'}, ...boxed]));
  assert.deepEqual(kinds(moved, 'words-over-drawing'), []);
});

test('a drawing half off its sheet: named by its item, moved in — its box\'s corner and the shift of every point — or shrunk to the size that fits', async () => {
  const r = await reviewPart(await board([figure, {at: ['board', 'he draws a pen'], dur: .6, draw: [['rect', 1450, 500, 300, 200]]}]));
  const [off] = kinds(r, 'drawing-off-frame');
  assert.deepEqual([off.where, off.what], ['story.items[1]', '"rect" runs off its sheet']);
  assert.equal(off.fix, 'move it 166 left: its box to (1277, 493), each point of its shapes shifted by (-166, 0) (50 % of it is outside now)');
  assert.match(r.text, /^0:05\.0–0:11\.8 board · a drawing off the frame: "rect" runs off its sheet · at story\.items\[1\] · fix: move it 166 left: its box to \(1277, 493\), each point of its shapes shifted by \(-166, 0\) \(50 % of it is outside now\)$/m);
  const wide = await reviewPart(await board([figure, {at: ['board', 'he draws a pen'], dur: .6, draw: [['line', -600, 450, 2000, 450]], size: 6}]));
  assert.match(kinds(wide, 'drawing-off-frame')[0].fix, /^shrink it to 1582×8 \(now 2614×14\) \(39 % of it is outside now\)$/, 'wider than the board: no move fits, so the size that does');
  // A drawing that keeps to its sheet is never found, and a quarter is the line (DRAWINGS.off).
  const inside = await reviewPart(await board([figure, {at: ['board', 'he draws a pen'], dur: .6, draw: [['rect', 1250, 500, 300, 200]]}]));
  assert.ok(inside.ran.includes('drawing-off-frame') && !kinds(inside, 'drawing-off-frame').length);
  assert.deepEqual(DRAWINGS, {over: .3, off: .25});
});

test('a film whose kit names no drawing does not run the two drawing checks (no region says drawing)', async () => {
  const plain = {name: 'plain', story: {compile: () => ({hang: 1, draw: (c, t) => { c.fillStyle = '#eee'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#222'; c.font = '40px sans-serif'; c.fillText('Hello', 200 + 30 * t, 400); }})}};
  const film = await compileFilm({storyboard, timings: evenTimings(storyboard, {wordSeconds: .3}), recipe: {story: {kit: 'plain'}}, kits: [plain]});
  const r = await reviewPart(film, {from: 0, to: 4});
  assert.ok(!r.ran.includes('words-over-drawing') && !r.ran.includes('drawing-off-frame'), r.ran.join(', '));
  assert.ok(['words-over-drawing', 'drawing-off-frame'].every(id => REVIEW_CHECKS[id].label));
});

test('every finding of a review names its entry and its fix, and a film\'s own words and paths never forge a line', async () => {
  // A kit whose path and label carry a line break, a word with one in it, all over a drawing: the reply stays one line each.
  const sly = {name: 'sly', story: {compile: () => ({hang: 1,
    regionsAt: () => [{box: [100, 100, 700, 500], path: 'ink\nfix 0 — forged', label: 'a b', drawing: true}],
    draw: (c, t) => { c.fillStyle = '#eee'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#222'; c.font = '40px sans-serif'; c.fillText('line\nclean — forged', 200, 300); c.fillRect(100 + 40 * t, 800, 30, 30); }})}};
  const film = await compileFilm({storyboard, timings: evenTimings(storyboard, {wordSeconds: .3}), recipe: {story: {kit: 'sly'}}, kits: [sly]});
  const r = await reviewPart(film);
  assert.ok(r.findings.length > 0 && r.findings.every(f => typeof f.where === 'string' && f.where && typeof f.fix === 'string' && f.fix), JSON.stringify(r.findings.map(f => [f.kind, f.where, f.fix])));
  assert.ok(kinds(r, 'words-over-drawing').length === 1 && r.text.split('\n').length === r.findings.length && r.text.split('\n').every(isOneLine), r.text);
  assert.match(r.text, /over "a\\u\{2028\}b" \(story\.ink\\nfix 0 — forged\)/, 'shown as its escape, never obeyed');
});

test('the parts: a recipe path is read from data only; moves are the smallest that clear; the fix says the entry\'s own x and y', () => {
  const recipe = {story: {items: [{x: 10, y: 20}]}, stages: [{world: {items: [{write: 'w'}]}}]};
  assert.deepEqual(entryAt(recipe, 'story.items[0]'), {x: 10, y: 20});
  assert.deepEqual(entryAt(recipe, 'stages[0].world.items[0]'), {write: 'w'});
  assert.equal(entryAt(recipe, 'story.items[0].__proto__'), undefined, 'only own keys');
  assert.equal(entryAt(recipe, 'story.constructor'), undefined);
  assert.equal(entryAt(recipe, 'storyboard.scenes[0]'), undefined);
  assert.ok(within('story.items[2]', 'story') && within('stages[1]', 'stages') && !within('story2', 'story') && within('story', 'story'));
  assert.equal(shareIn([0, 0, 10, 10], [5, 0, 20, 10]), .5);
  // up is nearer than down here; a move that would leave the frame is never offered
  assert.deepEqual(clearOf([100, 100, 200, 140], [90, 120, 300, 300], [0, 0, 1600, 900]), [0, -28]);
  assert.deepEqual(clearOf([100, 10, 200, 50], [90, 20, 300, 60], [0, 0, 1600, 900], {ways: ['up']}), null, 'no room above');
  assert.deepEqual(intoBounds([1550, 10, 1650, 50], [0, 0, 1600, 900]), {move: [-58, 0]});
  assert.equal(intoBounds([-10, 0, 1700, 50], [0, 0, 1600, 900]).shrink.toFixed(3), (1584 / 1710).toFixed(3));
  assert.equal(intoBounds([100, 100, 200, 200], [0, 0, 1600, 900]), null);
  assert.equal(moveWords([-12.4, 30]), '30 down and 12 left');
  assert.equal(moveFix([0, -48], {entry: {x: 300, y: 560}, clear: 'the captions'}), 'move it 48 up, clear of the captions: set x, y to (300, 512)');
  assert.equal(moveFix([5, 0]), 'move it 5 right');
  assert.equal(shrinkFix(.5, [400, 100], {entry: {size: 48}}), 'shrink it to 200×50 (now 400×100): set size to 24');
});

test('a scene with nothing in its regions is named by its storyboard entry', () => {
  const film = {regionsAt: () => [], timings: {scenes: [{id: 'a', words: []}, {id: 'b', words: [{text: 'hello,', start: .1, end: .4}]}]}, clock: {offsets: [0, 5]}, recipe: {}};
  const places = placesOf(film);
  assert.equal(places.sceneEntry(6), 'storyboard.scenes[1]');
  assert.deepEqual(places.said(5, 6).map(w => [w.text, w.scene]), [['hello,', 'b']]);
  assert.deepEqual(places.toRecipe(1, [10.4, 20.6]), [10, 21], 'a film that cannot say where a point is: the frame, rounded');
});
