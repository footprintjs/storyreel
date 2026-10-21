// The suite's memory (scripts/temp-hygiene.mjs): the test files run as many at once as the machine has cores (less
// one) and 4 GB each, and the suite's peak — its whole process tree — and its heaviest files are said at the end.
import test from 'node:test';
import assert from 'node:assert/strict';
import {concurrency, treeMemory} from '../scripts/temp-hygiene.mjs';

test('as many test files at once as there are cores less one and 4 GB each; at least one; STORYREEL_TEST_CONCURRENCY sets it', () => {
  const GB = 2 ** 30;
  assert.equal(concurrency({cores: 4, memory: 16 * GB}), 3, 'a GitHub runner: 3, as Node\'s own default');
  assert.equal(concurrency({cores: 4, memory: 7 * GB}), 1, 'a small machine: memory decides');
  assert.equal(concurrency({cores: 18, memory: 48 * GB}), 12, 'a large one: memory still caps it');
  assert.equal(concurrency({cores: 1, memory: 64 * GB}), 1, 'one core: one at a time');
  assert.equal(concurrency({cores: 18, memory: 48 * GB, given: '2'}), 2, 'set by hand');
  assert.equal(concurrency({cores: 4, memory: 16 * GB, given: 'lots'}), 3, 'a value that is no number is ignored');
});

test('the suite\'s memory is read from ps: the whole tree under the script, and each test file with what runs under it (FFmpeg)', () => {
  const ps = [
    '    1     0   4000 /sbin/launchd',
    '  100     1  50000 node scripts/temp-hygiene.mjs test/claims.test.mjs test/review.test.mjs',
    '  101   100  80000 /usr/bin/node --import ./test/fonts.mjs --test --test-concurrency=3 test/claims.test.mjs test/review.test.mjs',
    '  102   101 900000 /usr/bin/node --import ./test/fonts.mjs --test-reporter=tap /home/me/storyreel/test/claims.test.mjs',
    '  103   102 300000 ffmpeg -y -loglevel error -i pipe:0 film-video.mp4',
    '  104   101 200000 /usr/bin/node --import ./test/fonts.mjs --test-reporter=tap /home/me/storyreel/test/review.test.mjs',
    '  105   101  70000 /usr/bin/node --test-reporter=tap /home/me/storyreel/test/skills-render.mjs',
    '  200     1 999999 node elsewhere.mjs',
  ].join('\n');
  const {total, files} = treeMemory(ps, 100);
  assert.equal(total, (50000 + 80000 + 900000 + 300000 + 200000 + 70000) * 1024, 'the tree under the script, nothing beside it');
  assert.deepEqual(files, [['test/claims.test.mjs', 1200000 * 1024], ['test/review.test.mjs', 200000 * 1024], ['test/skills-render.mjs', 70000 * 1024]], 'each file with FFmpeg under it; the runner (--test) is no file, nor the script whose args name the files');
  assert.deepEqual(treeMemory('', 100), {total: 0, files: []});
});
