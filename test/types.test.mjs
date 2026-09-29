import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Any TypeScript compiler will do: TSC_BIN, or one found in a sibling checkout.
const tsc = [process.env.TSC_BIN, ...['../node_modules/.bin/tsc', '../../../node_modules/.bin/tsc', '../../../../agentfootprint/node_modules/.bin/tsc'].map(p => fileURLToPath(new URL(p, import.meta.url)))].find(p => p && existsSync(p));
test('the TypeScript types accept a real recipe and refuse the mistakes', {skip: tsc ? false : 'no tsc found (set TSC_BIN)'}, () => {
  const r = spawnSync(tsc, ['--noEmit', '--strict', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'es2022', fileURLToPath(new URL('./types.check.ts', import.meta.url))], {encoding: 'utf8'});
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
