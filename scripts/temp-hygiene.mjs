#!/usr/bin/env node
/**
 * Temp hygiene: run the test suite with a temp folder of its own (TMPDIR for every test file's process), then list
 * what is left in it. Nothing may be: every test removes the folders it makes (test/tmp.mjs · tempDir), and a render
 * removes its working files (render.mjs · closeRender). The suite gets a temp folder of its own so the count is honest
 * while other test runs share the machine's temp folder: they can neither add to it nor take from it. Exits 1 when
 * the suite fails or anything is left. Stopped (Ctrl-C, SIGTERM), it stops the suite, removes its own folder and exits
 * with the signal's code (130, 143): a script, unlike a library, may hold a signal.
 *
 * Memory: the files run in two passes so a CI machine (4 cores, 16 GB) never runs out. The few HEAVY files run one at
 * a time, after the rest; the rest run side by side, as many at once as the machine has cores (less one) and 4 GB
 * each (STORYREEL_TEST_CONCURRENCY sets it). Measured alone (macOS, `node --test --test-concurrency=1`, the whole
 * process tree): claims 6.0 GB, review 4.8 GB, slideshow 4.7 GB; every other file 2.5 GB or less (moves). Side by side
 * at Node's default — cores less one, three on CI — the three heavy ones could meet, about 20 GB at worst: the runner
 * was shut down mid-suite (run 38530058921).
 *   node scripts/temp-hygiene.mjs [test files…]      (npm run test:temp: every test/*.test.mjs)
 */
import {mkdtempSync, mkdirSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir, availableParallelism, totalmem} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

/** The test files that each take more than 3 GB alone: run one at a time. */
export const HEAVY = ['test/claims.test.mjs', 'test/review.test.mjs', 'test/slideshow.test.mjs'];
/** How many of the other files run at once: `given` (a number, from STORYREEL_TEST_CONCURRENCY), else cores less one and 4 GB of memory each; at least one. */
export const lightConcurrency = ({cores = availableParallelism(), memory = totalmem(), given = null} = {}) =>
  Number(given) >= 1 ? Math.floor(Number(given)) : Math.max(1, Math.min(cores - 1, Math.floor(memory / 2 ** 32)));

const repo = fileURLToPath(new URL('..', import.meta.url));

/** Run the suite's passes one after another (each a `node --test` of its own), the temp folder checked at the end. */
function main() {
  const given = process.argv.slice(2);
  const files = given.length ? given : readdirSync(path.join(repo, 'test')).filter(f => f.endsWith('.test.mjs')).sort().map(f => path.join('test', f));
  const heavy = files.filter(f => HEAVY.includes(f.split(path.sep).join('/'))), light = files.filter(f => !heavy.includes(f));
  const passes = [[light, lightConcurrency({given: process.env.STORYREEL_TEST_CONCURRENCY})], [heavy, 1]].filter(([list]) => list.length);
  const own = mkdtempSync(path.join(tmpdir(), 'storyreel-hygiene-')), tmp = path.join(own, 'tmp');
  mkdirSync(tmp);
  const finish = code => { rmSync(own, {recursive: true, force: true}); process.exit(code); };
  // The suite is a run of its own: run from inside a test runner, the runner's NODE_TEST_CONTEXT would make it a child of that run.
  const {NODE_TEST_CONTEXT: _runner, ...env} = process.env;
  let suite = null, stopped = null, failed = false;
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    process.on(signal, () => {
      if (stopped) return;
      stopped = code;
      // The pass running is stopped first (a Ctrl-C reaches it too, through the terminal), then the folder goes.
      if (suite && suite.exitCode === null && suite.signalCode === null) suite.kill(signal);
      else finish(code);
    });
  }
  const next = i => {
    if (stopped) { finish(stopped); return; }
    if (i === passes.length) { report(tmp, failed, finish); return; }
    const [list, concurrency] = passes[i];
    suite = spawn(process.execPath, ['--test', `--test-concurrency=${concurrency}`, ...list], {cwd: repo, env: {...env, TMPDIR: tmp, TMP: tmp, TEMP: tmp}, stdio: 'inherit'});
    suite.on('close', status => { failed ||= status !== 0; next(i + 1); });
  };
  next(0);
}

/** What the suite left in its temp folder, said; the exit code: 0 only when the suite passed and nothing is left. */
function report(tmp, failed, finish) {
  // node-compile-cache is Node's own cache of compiled modules, made once and reused by every run: not something a run leaks.
  const left = readdirSync(tmp).filter(n => n !== 'node-compile-cache'), ours = left.filter(n => n.startsWith('storyreel-'));
  console.log(`\ntemp hygiene: ${left.length} ${left.length === 1 ? 'entry' : 'entries'} left in the suite's temp folder (${ours.length} storyreel-*)${left.length ? `: ${left.slice(0, 20).join(', ')}${left.length > 20 ? ', …' : ''}` : ''}`);
  finish(!failed && !left.length ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
