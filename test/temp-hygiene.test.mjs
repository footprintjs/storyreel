// The suite's memory (scripts/temp-hygiene.mjs): the heavy files run one at a time, the rest as many at once as the
// machine has cores (less one) and 4 GB each — so a CI runner (4 cores, 16 GB) never runs out mid-suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {HEAVY, lightConcurrency} from '../scripts/temp-hygiene.mjs';

test('the heavy files run alone: each is a test file that exists (a renamed one would quietly run side by side again)', () => {
  assert.ok(HEAVY.length > 0);
  for (const file of HEAVY) assert.ok(existsSync(fileURLToPath(new URL(`../${file}`, import.meta.url))), `${file} exists`);
});

test('the rest run as many at once as there are cores less one and 4 GB each; at least one; STORYREEL_TEST_CONCURRENCY sets it', () => {
  const GB = 2 ** 30;
  assert.equal(lightConcurrency({cores: 4, memory: 16 * GB}), 3, 'a GitHub runner: 3, as Node\'s own default');
  assert.equal(lightConcurrency({cores: 4, memory: 7 * GB}), 1, 'a small machine: memory decides');
  assert.equal(lightConcurrency({cores: 18, memory: 48 * GB}), 12, 'a large one: memory still caps it');
  assert.equal(lightConcurrency({cores: 1, memory: 64 * GB}), 1, 'one core: one at a time');
  assert.equal(lightConcurrency({cores: 18, memory: 48 * GB, given: '2'}), 2, 'set by hand');
  assert.equal(lightConcurrency({cores: 4, memory: 16 * GB, given: 'lots'}), 3, 'a value that is no number is ignored');
});
