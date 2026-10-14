#!/usr/bin/env node
/**
 * Temp hygiene: run the whole test suite with a temp folder of its own (TMPDIR for every test file's process), then
 * list what is left in it. Nothing may be: every test removes the folders it makes (test/tmp.mjs · tempDir), and a
 * render removes its working files (render.mjs · prepareRender's work folder). The suite gets a temp folder of its own
 * so the count is honest while other test runs share the machine's temp folder: they can neither add to it nor take
 * from it. Exits 1 when the suite fails or anything is left.
 *   node scripts/temp-hygiene.mjs            (npm run test:temp)
 */
import {mkdtempSync, mkdirSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const files = readdirSync(path.join(repo, 'test')).filter(f => f.endsWith('.test.mjs')).sort().map(f => path.join('test', f));
const own = mkdtempSync(path.join(tmpdir(), 'storyreel-hygiene-')), tmp = path.join(own, 'tmp');
mkdirSync(tmp);
let status = 1;
try {
  const run = spawnSync(process.execPath, ['--test', ...files], {cwd: repo, env: {...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp}, stdio: 'inherit'});
  // node-compile-cache is Node's own cache of compiled modules, made once and reused by every run: not something a run leaks.
  const left = readdirSync(tmp).filter(n => n !== 'node-compile-cache'), ours = left.filter(n => n.startsWith('storyreel-'));
  console.log(`\ntemp hygiene: ${left.length} ${left.length === 1 ? 'entry' : 'entries'} left in the suite's temp folder (${ours.length} storyreel-*)${left.length ? `: ${left.slice(0, 20).join(', ')}${left.length > 20 ? ', …' : ''}` : ''}`);
  status = run.status === 0 && !left.length ? 0 : 1;
} finally {
  rmSync(own, {recursive: true, force: true});
}
process.exit(status);
