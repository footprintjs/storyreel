#!/usr/bin/env node
/**
 * Temp hygiene: run the test suite with a temp folder of its own (TMPDIR for every test file's process), then list
 * what is left in it. Nothing may be: every test removes the folders it makes (test/tmp.mjs · tempDir), and a render
 * removes its working files (render.mjs · closeRender). The suite gets a temp folder of its own so the count is honest
 * while other test runs share the machine's temp folder: they can neither add to it nor take from it. Exits 1 when
 * the suite fails or anything is left. Stopped (Ctrl-C, SIGTERM), it stops the suite, removes its own folder and exits
 * with the signal's code (130, 143): a script, unlike a library, may hold a signal.
 *
 * Memory: the files run as many at once as the machine has cores (less one) and 4 GB each (STORYREEL_TEST_CONCURRENCY
 * sets it), and the suite's memory is watched while it runs — its whole process tree, FFmpeg included, from `ps` every
 * half second — and said at the end: the peak, and the heaviest test files. A test file once needed 6–7 GB (a review
 * read every moment on a new canvas, whose native picture only a turn of the event loop gives back: review.mjs ·
 * readingCanvas) and a CI runner (16 GB) was shut down mid-suite; the line keeps the number in sight.
 *   node scripts/temp-hygiene.mjs [test files…]      (npm run test:temp: every test/*.test.mjs)
 */
import {mkdtempSync, mkdirSync, readdirSync, rmSync, appendFileSync} from 'node:fs';
import {tmpdir, availableParallelism, totalmem} from 'node:os';
import path from 'node:path';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

/** How many test files run at once: `given` (a number, from STORYREEL_TEST_CONCURRENCY), else cores less one and 4 GB of memory each; at least one. */
export const concurrency = ({cores = availableParallelism(), memory = totalmem(), given = null} = {}) =>
  Number(given) >= 1 ? Math.floor(Number(given)) : Math.max(1, Math.min(cores - 1, Math.floor(memory / 2 ** 32)));

/**
 * The memory of the process tree under `root`, from `ps -A -o pid=,ppid=,rss=,args=` (its text): {total, files} —
 * total the bytes resident in the whole tree, files [[test file, bytes]] for each test file's own process (its args
 * name the file; the runner's, `--test`, does not count as one) with everything under it.
 */
export function treeMemory(psText, root) {
  const procs = new Map();
  for (const line of String(psText).split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (m) procs.set(Number(m[1]), {ppid: Number(m[2]), bytes: Number(m[3]) * 1024, args: m[4], kids: []});
  }
  for (const [pid, p] of procs) if (pid !== p.ppid) procs.get(p.ppid)?.kids.push(pid);
  const sum = pid => { const p = procs.get(pid); return p ? p.bytes + p.kids.reduce((n, k) => n + sum(k), 0) : 0; };
  const files = [];
  const walk = pid => {
    const p = procs.get(pid);
    if (!p) return;
    const file = /(test\/[\w.-]+\.mjs)/.exec(p.args.split(path.sep).join('/'))?.[1];   // test/x.test.mjs, test/skills-render.mjs
    if (file && !/\s--test(\s|$)/.test(` ${p.args} `)) { files.push([file, sum(pid)]); return; }
    p.kids.forEach(walk);
  };
  procs.get(root)?.kids.forEach(walk);   // below the root: the script's own args may name test files
  return {total: sum(root), files};
}

/** Watch the memory of the tree under `root` every half second; stop() gives {peak, heaviest: [[file, bytes]]}, or null where `ps` cannot be run. */
function watchMemory(root) {
  let peak = 0, seen = false;
  const heaviest = new Map();
  const sample = () => {
    let text;
    try { text = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss=,args='], {encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore']}); } catch { return; }
    seen = true;
    const {total, files} = treeMemory(text, root);
    peak = Math.max(peak, total);
    for (const [file, bytes] of files) heaviest.set(file, Math.max(heaviest.get(file) ?? 0, bytes));
  };
  const timer = setInterval(sample, 500);
  return {stop: () => { clearInterval(timer); return seen ? {peak, heaviest: [...heaviest].sort((a, b) => b[1] - a[1])} : null; }};
}

const repo = fileURLToPath(new URL('..', import.meta.url));
const gb = bytes => `${(bytes / 2 ** 30).toFixed(1)} GB`;

function main() {
  const given = process.argv.slice(2);
  const files = given.length ? given : readdirSync(path.join(repo, 'test')).filter(f => f.endsWith('.test.mjs')).sort().map(f => path.join('test', f));
  const own = mkdtempSync(path.join(tmpdir(), 'storyreel-hygiene-')), tmp = path.join(own, 'tmp');
  mkdirSync(tmp);
  const finish = code => { rmSync(own, {recursive: true, force: true}); process.exit(code); };
  // The suite is a run of its own: run from inside a test runner, the runner's NODE_TEST_CONTEXT would make it a child of that run.
  const {NODE_TEST_CONTEXT: _runner, ...env} = process.env;
  const at = concurrency({given: process.env.STORYREEL_TEST_CONCURRENCY}), memory = watchMemory(process.pid);
  const suite = spawn(process.execPath, ['--import', './test/fonts.mjs', '--test', `--test-concurrency=${at}`, ...files], {cwd: repo, env: {...env, TMPDIR: tmp, TMP: tmp, TEMP: tmp}, stdio: 'inherit'});
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
    const used = memory.stop();
    if (stopped) { finish(stopped); return; }
    // node-compile-cache is Node's own cache of compiled modules, made once and reused by every run: not something a run leaks.
    const left = readdirSync(tmp).filter(n => n !== 'node-compile-cache'), ours = left.filter(n => n.startsWith('storyreel-'));
    console.log(`\ntemp hygiene: ${left.length} ${left.length === 1 ? 'entry' : 'entries'} left in the suite's temp folder (${ours.length} storyreel-*)${left.length ? `: ${left.slice(0, 20).join(', ')}${left.length > 20 ? ', …' : ''}` : ''}`);
    if (used) {
      const line = `memory: peak ${gb(used.peak)} for the suite, ${at} test file${at === 1 ? '' : 's'} at once; heaviest: ${used.heaviest.slice(0, 3).map(([f, b]) => `${path.basename(f)} ${gb(b)}`).join(', ') || 'none seen'}`;
      console.log(line);
      // On GitHub Actions the line goes on the run's page too.
      if (process.env.GITHUB_STEP_SUMMARY) try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`); } catch { /* the log has it */ }
    }
    finish(status === 0 && !left.length ? 0 : 1);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
