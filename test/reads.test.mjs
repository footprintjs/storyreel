// Declared reads (shots.mjs · readReads, checkReads) and the letters reading pace (reading.mjs · LETTERS):
// what the viewer must take in, one at a time, each with time to land before its shot ends, each about a
// thing that is there; and short labels given a fair time to be read.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {compileFilm, evenTimings, paceTimings, cartoonKit} from '../src/index.mjs';
import {readReads, checkReads, READS} from '../src/shots.mjs';
import {secondsToRead, LETTERS, READING, readingMode, readingPace} from '../src/reading.mjs';

const dir = fileURLToPath(new URL('../examples/worlds/', import.meta.url)), read = f => JSON.parse(readFileSync(dir + f, 'utf8'));
async function worlds(edit = r => r) {
  const storyboard = read('storyboard.json'), timings = paceTimings(storyboard, evenTimings(storyboard, {tail: .8}), read('pacing.json'));
  return compileFilm({storyboard, timings, recipe: edit(structuredClone(read('recipe.json'))), kits: [cartoonKit], root: dir, strings: read('strings/en.json')});
}

test('the letters pace gives short labels a fair time; the words pace stays the default', () => {
  assert.equal(secondsToRead('change the picture'), 1, 'by words: 3 words, at least 1 s');
  assert.equal(+secondsToRead('change the picture', LETTERS).toFixed(2), 2.57, 'by letters: 1.5 + 16 / 15');
  assert.equal(readingMode({rule: 'refuse', pace: 'letters'}), 'refuse');
  assert.equal(readingPace({pace: 'letters'}), LETTERS); assert.equal(readingPace('report'), READING);
  assert.throws(() => readingMode({pace: 'fast'}), /pace must be "words"/);
  assert.throws(() => readingMode({speed: 1}), /reading has speed/);
});

test('a read is what the viewer takes in, on a phrase, with the least time it needs', () => {
  assert.deepEqual(readReads([{what: 'the ring turns', at: ['a', 'b']}], 'x'), [{what: 'the ring turns', at: ['a', 'b'], min: READS.min}]);
  assert.throws(() => readReads([{what: '', at: ['a', 'b']}], 'x'), /what says what the viewer must take in/);
  assert.throws(() => readReads([{what: 'a', at: ['a', 'b'], min: 30}], 'x'), /min is the least time/);
  assert.throws(() => readReads([{what: 'a', at: ['a', 'b'], when: 1}], 'x'), /has when/);
});

test('two reads at once, or one the shot ends before, are named with the fix', () => {
  const [a, b] = checkReads([{what: 'first', t: 1, min: 2}, {what: 'second', t: 2, min: 2}], {to: 10, where: 'stage s'});
  assert.match(a.problem, /two reads at once/); assert.equal(b.problem, undefined);
  const [c] = checkReads([{what: 'late', t: 9, min: 2}], {to: 10, where: 'stage s'});
  assert.match(c.problem, /the shot starts to leave at 10.00 s — lengthen the scene's tail/);
  // A read outside its shot: before the shot arrives, or after the next one has begun to.
  const [early, after] = checkReads([{what: 'early', t: 1, min: 1}, {what: 'after', t: 12, min: 1}], {from: 5, to: 10, where: 'stage s'});
  assert.match(early.problem, /"early" starts at 1.00 s, before the shot is on screen \(it arrives at 5.00 s\)/);
  assert.match(after.problem, /"after" starts at 12.00 s, when the shot has started to leave \(at 10.00 s\)/);
});

test('a film names a read by the index the recipe gave it, keeps reads out of its moments, and checks a read against the next shot\'s arrival', async () => {
  // Declared out of time order: the late one first. Its problem names reads[0], the one the recipe wrote.
  const film = await worlds(r => { r.stages[0].reads = [{what: 'too late', at: ['valley', 'they all come home'], min: 15}, {what: 'fine', at: ['valley', 'lets the sheep out'], min: 1}]; return r; });
  assert.deepEqual(film.reads.map(x => [x.path, x.what, Boolean(x.problem)]), [['stages[0].reads[1]', 'fine', false], ['stages[0].reads[0]', 'too late', true]]);
  // Reads are taken in, not seen: declaring them does not add moments to the shot.
  const plain = await worlds(), withReads = await worlds(r => { r.stages[0].reads = [{what: 'one', at: ['valley', 'In the evening'], min: 1}, {what: 'two', at: ['valley', 'they all come home'], min: 1}]; return r; });
  assert.deepEqual(withReads.shots.map(x => x.moments), plain.shots.map(x => x.moments));
  // The deadline is when the next shot starts to arrive: the rule stage enters with a wipe before its scene starts.
  const late = await worlds(r => { r.stages[0].reads = [{what: 'last words', at: ['valley', 'they all come home'], min: 1}]; return r; });
  const valley = late.shots.find(x => x.path === 'stages[0]'), next = late.shots.find(x => x.path === 'stages[1]'), t = late.reads[0].at;
  const lead = .8 * .75, room = +(next.from - lead - t - .1).toFixed(2);
  assert.ok(room >= READS.least, `room for a read before the wipe (${room} s)`);
  const fits = await worlds(r => { r.stages[0].reads = [{what: 'before the wipe', at: ['valley', 'they all come home'], min: room}]; return r; });
  assert.equal(fits.reads[0].problem, undefined, 'a read that ends before the wipe starts is fine');
  const tooLate = await worlds(r => { r.stages[0].reads = [{what: 'into the wipe', at: ['valley', 'they all come home'], min: Math.min(15, +(next.from - t - .1).toFixed(2))}]; return r; });
  assert.match(tooLate.reads[0].problem ?? '', /the shot starts to leave at/, `the wipe starts before the scene does (valley ends ${valley.to})`);
});

test('a film lists its reads, timed, with their problems; a recipe that refuses refuses them', async () => {
  const film = await worlds(r => { r.stages[0].reads = [{what: 'the sheep go out', at: ['valley', 'lets the sheep out'], min: 1}]; return r; });
  assert.equal(film.reads.length, 1);
  assert.equal(film.reads[0].path, 'stages[0].reads[0]'); assert.equal(film.reads[0].problem, undefined);
  assert.ok(film.beats.some(b => b.path === 'stages[0].reads[0].at'), 'the read\'s phrase is logged with its recipe path');
  await assert.rejects(worlds(r => { r.stages[0].reads = [{what: 'one', at: ['valley', 'lets the sheep out'], min: 3}, {what: 'two', at: ['valley', 'lets the sheep out', .5], min: 1}]; r.reading = {rule: 'refuse'}; return r; }), /two reads at once/);
  const missing = await worlds(r => { r.stages[0].reads = [{what: 'the bag', at: ['valley', 'lets the sheep out'], region: 'no-such-thing'}]; return r; });
  assert.match(missing.reads[0].problem, /is about "no-such-thing"/);
});

test('a read about a thing needs the thing there for the whole time it takes', async () => {
  const storyboard = {scenes: [{id: 'a', narration: 'Look at the square while it is here, and keep looking for a while longer.'}, {id: 'b', narration: 'The end.'}]};
  const timings = evenTimings(storyboard), gone = timings.scenes[0].words[3].start + .5;   // the square goes half a second after "square"
  const kit = {name: 'squares', story: {compile: () => ({hang: 1, draw: c => { c.fillStyle = '#336'; c.fillRect(0, 0, 1600, 900); },
    regionsAt: t => (t < gone ? [{box: [600, 300, 1000, 600], path: 'square', label: 'the square', name: 'square'}] : [])})}};
  const film = await compileFilm({storyboard, timings, kits: [kit], recipe: {story: {kit: 'squares', reads: [{what: 'the square', at: ['a', 'the square'], min: 2, region: 'square'}]}}});
  assert.match(film.reads[0].problem, /"the square" is about "square" for 2 s from [\d.]+ s: nothing in the picture is called "square"/);
  const brief = await compileFilm({storyboard, timings, kits: [kit], recipe: {story: {kit: 'squares', reads: [{what: 'the square', at: ['a', 'the square'], min: .5, region: 'square'}]}}});
  assert.equal(brief.reads[0].problem, undefined, 'a read short enough to finish while it is there is fine');
});

test('a read\'s thing must be there all the time it needs, not only at a few instants', async () => {
  const storyboard = {scenes: [{id: 'a', narration: 'Look at the square while it is here, and keep looking for a while longer.'}, {id: 'b', narration: 'The end.'}]};
  const timings = evenTimings(storyboard), t = timings.scenes[0].words[2].start;   // "the square"
  const kit = {name: 'blinking', story: {compile: () => ({hang: 1, draw: c => { c.fillStyle = '#336'; c.fillRect(0, 0, 1600, 900); },
    regionsAt: x => (x - t > .3 && x - t < .9 ? [] : [{box: [600, 300, 1000, 600], path: 'square', label: 'the square', name: 'square'}])})}};
  const film = await compileFilm({storyboard, timings, kits: [kit], recipe: {story: {kit: 'blinking', reads: [{what: 'the square', at: ['a', 'the square'], min: 2, region: 'square'}]}}});
  assert.match(film.reads[0].problem ?? '', /is about "square" for 2 s/, 'gone for 0.6 s of the 2 it needs');
});
