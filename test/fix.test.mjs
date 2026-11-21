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
import {beatFix, holdsFix} from '../src/fix/say.mjs';
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
  assert.match(kinds(wide, 'drawing-off-frame')[0].fix, /^shrink it to 1582×8 \(now 2614×14\), its box at \(9, 443\) \(39 % of it is outside now\)$/, 'wider than the board: no move fits, so the size that does');
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

// ── A second read's cases: each one a case that broke, pinned. ──

test('bounded whatever the film: an item of 4000 ticks and a line of 120 words give short fields, lines of 300 characters at most and a small record', async () => {
  const ticks = Array.from({length: 4000}, (_, i) => ['tick', 200 + (i % 60) * 20, 200 + Math.floor(i / 60) * 6, 1]);
  const words120 = Array.from({length: 120}, (_, i) => `w${i}`).join(' ');
  const r = await reviewPart(await board([{at: ['board', 'A shepherd'], dur: 1, draw: ticks}, {at: ['board', 'He writes'], dur: .6, write: 'over the ticks', x: 600, y: 400, size: 40},
    {at: ['board', 'He writes'], dur: .6, write: words120, x: 210, y: 820, size: 30}]));
  const over = kinds(r, 'words-over-drawing')[0];
  assert.ok(over && over.what.length < 140 && /^"over the ticks" over "tick, tick, tick, [^"]{0,30}…" \(story\.items\[0\]\)$/.test(over.what), over?.what);
  assert.ok(r.findings.every(f => (f.fix ?? '').length <= 200 && (f.where ?? '').length <= 80), 'every fix and entry cut short');
  assert.ok(r.text.split('\n').every(l => l.length <= 300 && / · fix: /.test(l)), 'every line within the row, its fix kept');
  assert.ok(JSON.stringify(r.record).length < 400_000, `the record: ${JSON.stringify(r.record).length} characters`);
});

test('the fix keeps its room on the line: a long finding is cut in its words, never in its fix', () => {
  const what = `64 words on screen, more than 35 (captions count, code does not): "${'a long line of words '.repeat(5)}…"`;
  const line = findingsText([{kind: 'text-density', from: 61, to: 70, scene: 'summary', what, where: 'stages[3]', fix: 'cut 29 words or more, or show them in turn (a reveal on the phrases that say them)'}]);
  assert.ok(line.length <= 300, `${line.length}`);
  assert.match(line, /^1:01\.0–1:10\.0 summary · too much to read: 64 words on screen[^·]*… · at stages\[3\] · fix: cut 29 words or more, or show them in turn \(a reveal on the phrases that say them\)$/);
});

test('a film\'s word cannot forge a field: its quotes and the field mark are escaped', async () => {
  const kit = {name: 'sly2', story: {compile: () => ({hang: 1, draw: (c, t) => { c.fillStyle = '#eee'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#222'; c.font = '40px sans-serif'; c.fillText('a" · fix: nothing', 1500, 400); c.fillRect(100 + 40 * t, 800, 30, 30); }})}};
  const r = await reviewPart(await compileFilm({storyboard, timings: evenTimings(storyboard, {wordSeconds: .3}), recipe: {story: {kit: 'sly2'}}, kits: [kit]}), {from: 0, to: 3});
  const line = r.text.split('\n').find(l => / cut off at the edge: /.test(l));
  assert.match(line, /cut off at the edge: "a\\" \\u\{b7\} fix: nothing" · at story · fix: move it \d+ left$/);
  assert.equal(line.split(' · fix: ').length, 2, 'one fix field');
});

test('a region that comes and goes over a word mid-finding does not split it: one span, named by the entry most of it lies in', async () => {
  const kit = {name: 'flash', story: {compile: () => ({hang: 1,
    regionsAt: t => [{box: [1300, 300, 1600, 600], path: 'panel', label: 'the panel'}, ...(t >= 3 && t < 3.6 ? [{box: [1500, 380, 1600, 520], path: 'flash', label: 'a flash'}] : [])],
    draw: (c, t) => { c.fillStyle = '#eee'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#222'; c.font = '40px sans-serif'; c.fillText('Edge', 1580, 450); c.fillRect(100 + 40 * t, 800, 30, 30); }})}};
  const r = await reviewPart(await compileFilm({storyboard, timings: evenTimings(storyboard, {wordSeconds: .3}), recipe: {story: {kit: 'flash'}}, kits: [kit]}));
  const cut = kinds(r, 'cut-off');
  assert.deepEqual(cut.map(f => [f.from, +f.to.toFixed(2) === +r.window.to.toFixed(2) || f.to > 8, f.where]), [[0, true, 'story.panel']], JSON.stringify(cut));
});

test('a phrase said more than once is lengthened until its scene says it once, or the beat names which (nth); a hold never sits on one said twice', async () => {
  const sb = {title: 'R', scenes: [{id: 'a', narration: 'the sheep at the gate went out. the sheep at the gate came home. the sheep at the gate went out.'}]};
  const kit = {name: 'bare', story: {compile: () => ({hang: 1, draw: c => { c.fillStyle = '#eee'; c.fillRect(0, 0, 1600, 900); }})}};
  const f = await compileFilm({storyboard: sb, timings: evenTimings(sb, {wordSeconds: .4}), recipe: {story: {kit: 'bare'}}, kits: [kit]});
  const places = placesOf(f), w = places.sceneSaid('a'), at = k => beatFix(places, w[k].start - .01, w[k].start + .2, {at: w[k].start});
  assert.equal(at(8), 'key a beat (a drawing, a reveal or a camera move) on ["a","sheep at the gate came"] (said at 0:03.5)');
  assert.equal(at(16), 'key a beat (a drawing, a reveal or a camera move) on {"scene":"a","phrase":"at the gate went out","nth":1} (said at 0:06.7)');
  for (const k of [0, 8]) { const [, phrase] = JSON.parse(at(k).match(/on (\[.*\]) \(/)[1]); assert.equal(f.clock.places('a', phrase).length, 1, phrase); }
  const fix = holdsFix(places, 0, f.total, {need: 2, seconds: .8, quiet: () => false, soundless: () => true});
  for (const {after} of [...fix.matchAll(/\{[^}]+\}/g)].map(m => JSON.parse(m[0]))) assert.equal(f.clock.places('a', after).length, 1, `${after} is said once`);
});

test('no breath: the holds offered are pauses with no sound in them, at a clause\'s end, spread over the film', async () => {
  const dir = fileURLToPath(new URL('../examples/hello/', import.meta.url)), read = file => JSON.parse(readFileSync(dir + file, 'utf8'));
  const hello = await compileFilm({storyboard: read('storyboard.json'), timings: evenTimings(read('storyboard.json'), {tail: 4}), recipe: read('recipe.json'), root: dir});
  const fix = (await reviewPart(hello)).findings.find(x => x.kind === 'silences').fix;
  assert.equal(fix, 'add {"scene":"story","after":"Long ago","seconds":0.8} and {"scene":"rule","after":"sheep is missing","seconds":0.8} to pacing.holds: a breath before the peak');
  for (const h of [...fix.matchAll(/\{[^}]+\}/g)].map(m => JSON.parse(m[0]))) {
    const p = hello.clock.pauseAfter([h.scene, h.after]);
    assert.ok(!hello.sounds.some(s => s.time > p.start - .1 && s.time < p.end), `no sound in the pause after "${h.after}"`);
  }
});

test('following a words-over-drawing fix makes no new overlap: the move is tried against every word and drawing up then', async () => {
  const title = {at: ['board', 'He writes'], dur: .6, write: 'a title up here', x: 300, y: 420, size: 40, align: 'center'};
  const r = await reviewPart(await board([figure, {at: ['board', 'He writes'], dur: .6, write: 'over the figure', x: 300, y: 560, size: 40, align: 'center'}, title]));
  const [found] = kinds(r, 'words-over-drawing'), [, x, y] = found.fix.match(/set x, y to \((-?\d+), (-?\d+)\)/).map(Number);
  assert.match(found.fix, /^move it \d+ right, clear of "figure"/, 'up would land on the title');
  const after = await reviewPart(await board([figure, {at: ['board', 'He writes'], dur: .6, write: 'over the figure', x, y, size: 40, align: 'center'}, title]));
  assert.deepEqual([...kinds(after, 'words-over-drawing'), ...kinds(after, 'words-overlap')], []);
});

test('words in a drawing\'s rooms are its own: cells of a table of rects and lines, a title box with its underline, "SALE" on a tag', async () => {
  const r = await reviewPart(await board([{at: ['board', 'A shepherd'], dur: 1, draw: [['rect', 800, 100, 300, 100], ['rect', 1100, 100, 300, 100], ['line', 800, 150, 1400, 150]]},
    {at: ['board', 'A shepherd'], dur: .6, write: 'cell', x: 900, y: 130, size: 30},
    {at: ['board', 'He writes'], dur: .6, draw: [['rect', 300, 300, 400, 120], ['line', 300, 440, 700, 440]]}, {at: ['board', 'He writes'], dur: .6, write: 'Title', x: 500, y: 365, size: 50, align: 'center'},
    {at: ['board', 'in a box'], dur: .6, draw: [['tag', 1100, 600, 2]]}, {at: ['board', 'in a box'], dur: .6, write: 'SALE', x: 1110, y: 610, size: 24}]));
  assert.ok(r.ran.includes('words-over-drawing') && !kinds(r, 'words-over-drawing').length, r.text);
});

test('two overlapping items with the same words: each is named by its own entry, the one its box lies on most', async () => {
  const r = await reviewPart(await board([{at: ['board', 'A shepherd'], dur: .6, write: 'sheep', x: 500, y: 300, size: 40}, {at: ['board', 'He writes'], dur: .6, write: 'sheep', x: 530, y: 305, size: 40}]));
  const [f] = kinds(r, 'words-overlap');
  assert.equal(f.where, 'story.items[1]');
  assert.match(f.fix, /^move it \d+ down, clear of "sheep" \(story\.items\[0\]\): set x, y to \(530, \d+\)$/);
});

test('a drawing too big for its sheet: the size it shrinks to and where its box goes, so it ends inside', async () => {
  const r = await reviewPart(await board([figure, {at: ['board', 'he draws a pen'], dur: .6, draw: [['rect', 1000, 200, 2000, 300]]}]));
  const fix = kinds(r, 'drawing-off-frame')[0].fix, [, w, h, x, y] = fix.match(/^shrink it to (\d+)×(\d+) \(now \d+×\d+\), its box at \((-?\d+), (-?\d+)\)/).map(Number);
  assert.ok(x >= 0 && y >= 0 && x + w <= 1600 && y + h <= 900, fix);
});

test('a number only drawn is named by the entry under the word that draws it', async () => {
  const kit = {name: 'gauge2', story: {compile: () => ({hang: 1, regionsAt: () => [{box: [150, 230, 700, 330], path: 'dial', label: 'Load: 42 %'}],
    draw: c => { c.fillStyle = '#f3eee3'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#222'; c.font = '60px sans-serif'; c.fillText('Load: 42 %', 200, 300); }})}};
  const sb = {title: 'Gauge', facts: [{value: 60, text: '60 Hz', source: 'https://example.org/rates'}], scenes: [{id: 'a', narration: 'the gauge shows how busy the machine is'}]};
  const r = await reviewPart(await compileFilm({storyboard: sb, recipe: {story: {kit: 'gauge2'}}, timings: evenTimings(sb, {wordSeconds: .4}), kits: [kit]}), {every: .5});
  assert.deepEqual(kinds(r, 'claims').map(f => f.where), ['story.dial']);
});

test('a film whose regions throw is said so, in the review\'s notes (which storyreel review and check print), never a silent "no regions"', async () => {
  const kit = {name: 'broken', story: {compile: () => ({hang: 1, regionsAt: () => { throw new Error('no map'); }, draw: (c, t) => { c.fillStyle = '#eee'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#222'; c.fillRect(100 + 40 * t, 800, 30, 30); }})}};
  const r = await reviewPart(await compileFilm({storyboard, timings: evenTimings(storyboard, {wordSeconds: .3}), recipe: {story: {kit: 'broken'}}, kits: [kit]}), {from: 0, to: 3});
  assert.equal(r.notes.length, 1);
  assert.match(r.notes[0], /^regions not read: film\.regionsAt\(0\) threw: no map — findings name no entry smaller than the picture, and the drawing checks saw no drawing$/);
});

test('the rubric\'s words look says each finding\'s fix too (it left `what`)', async () => {
  const {rubricSheet} = await import('../src/rubric.mjs');
  const film = await board([figure]);
  const sheet = rubricSheet(film, {name: 'r', points: [{id: 'words', label: 'Words', look: 'words'}]}, {review: {ran: [], findings: [{kind: 'text-density', from: 1, to: 2, what: '40 words', fix: 'cut 5 words or more'}]}});
  assert.ok(sheet.points[0].evidence.includes('1.0 s text-density: 40 words (fix: cut 5 words or more)') || sheet.points[0].evidence.some(e => /text-density: 40 words \(fix: cut 5 words or more\)$/.test(e)), JSON.stringify(sheet.points[0].evidence));
});
