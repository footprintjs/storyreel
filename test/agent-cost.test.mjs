// What an agent reads and writes to make the main path's farm film (scripts/agent-cost.mjs), held to the checked-in
// baseline: a number that grows more than GROWTH over it fails. To accept a growth (or record a cut), run
// `node scripts/agent-cost.mjs --baseline` — a deliberate act, reviewed, with a line in the CHANGELOG.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {measure, table, BASELINE, GROWTH, COMMANDS} from '../scripts/agent-cost.mjs';
import {tempDir} from './tmp.mjs';

const ffmpeg = !spawnSync('ffmpeg', ['-version']).error;

test('what an agent reads and writes for the farm film stays within its baseline', {timeout: 300_000}, t => {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const rows = measure(tempDir('agentcost', t), {commands: ffmpeg ? COMMANDS : COMMANDS.filter(c => c[0] !== 'part')});
  t.diagnostic(`\n${table(rows)}`);
  const grown = rows.filter(r => !baseline[r.name] || r.bytes > baseline[r.name].bytes * (1 + GROWTH))
    .map(r => `${r.name}: ${r.bytes} B, the baseline ${baseline[r.name]?.bytes ?? 'has none'}`);
  assert.deepEqual(grown, [], `grown more than ${GROWTH * 100} % (cut it, or update the baseline deliberately: node scripts/agent-cost.mjs --baseline, and say so in the CHANGELOG)`);
  for (const name of Object.keys(baseline)) assert.ok(rows.some(r => r.name === name) || (name.startsWith('storyreel part') && !ffmpeg), `${name} is in the baseline but no longer measured`);
});
