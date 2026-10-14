#!/usr/bin/env node
/**
 * Temp hygiene: run the test suite with a temp folder of its own (TMPDIR for every test file's process), then list
 * what is left in it. Nothing may be: every test removes the folders it makes (test/tmp.mjs · tempDir), and a render
 * removes its working files (render.mjs · closeRender). The suite gets a temp folder of its own so the count is honest
 * while other test runs share the machine's temp folder: they can neither add to it nor take from it. Exits 1 when
 * the suite fails or anything is left. Stopped (Ctrl-C, SIGTERM), it stops the suite, removes its own folder and exits
 * with the signal's code (130, 143): a script, unlike a library, may hold a signal.
 *   node scripts/temp-hygiene.mjs [test files…]      (npm run test:temp: every test/*.test.mjs)
 */
import {mkdtempSync, mkdirSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const given = process.argv.slice(2);
const files = given.length ? given : readdirSync(path.join(repo, 'test')).filter(f => f.endsWith('.test.mjs')).sort().map(f => path.join('test', f));
const own = mkdtempSync(path.join(tmpdir(), 'storyreel-hygiene-')), tmp = path.join(own, 'tmp');
mkdirSync(tmp);

const finish = code => { rmSync(own, {recursive: true, force: true}); process.exit(code); };
// The suite is a run of its own: run from inside a test runner, the runner's NODE_TEST_CONTEXT would make it a child of that run.
const {NODE_TEST_CONTEXT: _runner, ...env} = process.env;
const suite = spawn(process.execPath, ['--test', ...files], {cwd: repo, env: {...env, TMPDIR: tmp, TMP: tmp, TEMP: tmp}, stdio: 'inherit'});
let stopped = null;
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  process.on(signal, () => {
    if (stopped) return;
    stopped = code;
    // The suite is stopped first (a Ctrl-C reaches it too, through the terminal), then the folder goes.
    if (suite.exitCode === null && suite.signalCode === null) suite.kill(signal);
    else finish(code);
  });
}
suite.on('close', status => {
  if (stopped) { finish(stopped); return; }
  // node-compile-cache is Node's own cache of compiled modules, made once and reused by every run: not something a run leaks.
  const left = readdirSync(tmp).filter(n => n !== 'node-compile-cache'), ours = left.filter(n => n.startsWith('storyreel-'));
  console.log(`\ntemp hygiene: ${left.length} ${left.length === 1 ? 'entry' : 'entries'} left in the suite's temp folder (${ours.length} storyreel-*)${left.length ? `: ${left.slice(0, 20).join(', ')}${left.length > 20 ? ', …' : ''}` : ''}`);
  finish(status === 0 && !left.length ? 0 : 1);
});
