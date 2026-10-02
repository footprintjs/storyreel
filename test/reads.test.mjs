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
  assert.match(c.problem, /the shot ends at 10.00 s — lengthen the scene's tail/);
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
