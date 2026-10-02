// The review tools (tools.mjs) and the command line (cli.mjs): read first (timeline, review), look last (part, still).
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadProject, timeline, review, still, TOOLS} from '../src/tools.mjs';

const project = fileURLToPath(new URL('./fixtures/tools/', import.meta.url)), cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const run = (args, cwd = project) => spawnSync(process.execPath, [cli, ...args], {cwd, encoding: 'utf8'});
const has = cmd => !spawnSync(cmd, ['-version']).error;

test('the tools read the project\'s film: its timeline and its review as text, a still as one picture', async () => {
  const out = mkdtempSync(path.join(tmpdir(), 'storyreel-tools-')), p = await loadProject({cwd: project, out});
  assert.match(await timeline(p, {scene: 'two', handles: 0}), /^two: [\d.]+–[\d.]+ s of [\d.]+ s \(times from its start\)\n0\.00  ── two$/m);
  assert.match(await review(p), /review \(under-captions, words-overlap, cut-off, still\):\n0:02\.0–0:03\.8 one · words over words: "Alpha" and "Beta"/);
  const s = await still(p, {at: 'one+2.5,two+0'});
  assert.ok(existsSync(s.file) && s.file.endsWith('.png'), s.text);
  await assert.rejects(still(p, {at: 'three+1'}), /"three\+1" is not a moment \(scene\+seconds, or seconds; the scenes are one, two\)/);
  assert.deepEqual(Object.keys(TOOLS), ['timeline', 'review', 'part', 'still']);
});

test('the command line: each tool by name, its flags to the film too; refusals name the fix', () => {
  const help = run(['help']);
  assert.equal(help.status, 0); assert.match(help.stdout, /Read first, look last: timeline → review → fix → part → still\./);
  const r = run(['review', '--scene', 'one']);
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /words over words: "Alpha" and "Beta"/);
  const none = run(['review'], tmpdir());
  assert.equal(none.status, 1); assert.match(none.stderr, /no storyreel\.config\.mjs in .*: a project names its film there/);
  assert.equal(run(['draw']).status, 2, 'an unknown tool is a usage error');
});

test('part: the scenes with their handles, rendered quickly, reviewed first', {skip: has('ffmpeg') ? false : 'needs ffmpeg'}, () => {
  const out = mkdtempSync(path.join(tmpdir(), 'storyreel-part-')), r = run(['part', '--scene', 'two', '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /two: [\d.]+–[\d.]+ s .* — review/);
  assert.match(r.stdout, new RegExp(`${out.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/parts/two\\.mp4 · [\\d.]+ s · made in [\\d.]+ s · checks`));
});
