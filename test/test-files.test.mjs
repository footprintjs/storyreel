import test from 'node:test';
import assert from 'node:assert/strict';
import {suite, shards, readShard, testFiles, QUICK_SECONDS} from '../scripts/test-files.mjs';

const all = suite();

test('every slow file named in slow-files.json is a test file of the suite, with its seconds', () => {
  for (const [file, seconds] of Object.entries(all.slow)) {
    assert.ok(all.files.includes(file), `${file} is no test file: take it out of test/slow-files.json`);
    assert.ok(Number.isFinite(seconds) && seconds > QUICK_SECONDS, `${file}: its seconds, more than a quick file's`);
  }
});

test('the parts take every file exactly once, for any count, and the quick run leaves the slow ones out', () => {
  for (const total of [1, 2, 3, 4, 7]) {
    const parts = Array.from({length: total}, (_, i) => testFiles({shard: `${i + 1}/${total}`}));
    assert.deepEqual(parts.flat().sort(), testFiles().sort(), `${total} parts`);
  }
  const quick = testFiles({quick: true});
  assert.ok(quick.length > 0 && quick.every(f => !Object.hasOwn(all.slow, f.slice('test/'.length))));
  assert.equal(quick.length + Object.keys(all.slow).length, all.files.length);
});

test('three parts take about equal time, by the measured seconds', () => {
  const seconds = shards(all, 3).map(p => p.seconds), most = Math.max(...seconds), least = Math.min(...seconds);
  assert.ok(most - least <= Math.max(...Object.values(all.slow)), `parts of ${seconds.join(', ')} s`);
});

test('a part is asked for as 2/3, and anything else refuses, naming the form', () => {
  assert.deepEqual(readShard('2/3'), {index: 2, total: 3});
  for (const bad of ['0/3', '4/3', '2', '2/0', 'a/b', '', undefined]) assert.throws(() => readShard(bad), /like 2\/3/);
});
