// tools/pose-from-video.py, its pure parts checked in plain Python (no MediaPipe, no model, no video, no download): the
// resampling onto a steady rate, the verdict on frames a damaged file could not give, the log relay (a fatal line
// written just before a native abort still arrives) and the messages a bad models folder ends in. The tool is loaded
// as a module: its MediaPipe imports are inside main(), which never runs here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, mkdirSync, chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const TOOL = fileURLToPath(new URL('../tools/pose-from-video.py', import.meta.url));
const PYTHON = process.env.PYTHON ?? 'python3';
const found = spawnSync(PYTHON, ['-I', '-c', 'import sys; print(sys.version_info >= (3, 8))'], {encoding: 'utf8'});
const skip = found.stdout?.trim() === 'True' ? false : `no Python 3.8+ as ${PYTHON} (set PYTHON)`;

/** Run Python with the tool loaded as `tool`; returns {status, stdout, stderr}. */
function python(code, ...args) {
  const prelude = `import importlib.util, json, os, sys\nspec = importlib.util.spec_from_file_location('tool', ${JSON.stringify(TOOL)})\ntool = importlib.util.module_from_spec(spec); spec.loader.exec_module(tool)\n`;
  return spawnSync(PYTHON, ['-I', '-B', '-c', prelude + code, ...args], {encoding: 'utf8'});   // (-B: no __pycache__ beside the tool)
}

test('the tool resamples a variable rate onto a steady one: a moment between two frames draws straight between them', {skip}, () => {
  const r = python(`P = lambda x: [[x, x, 0.9]]
seen = [(0.0, P(0.0)), (40.0, P(1.0)), (70.0, P(2.0)), (100.0, None), (133.0, P(4.0))]
print(json.dumps([None if f is None else f[0][0] for f in tool.resampled(seen, 30)]))`);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), [0, .833333, 1.888889, null], 'at 0, 33.3, 66.7 and 100 ms; the empty frame stays empty');
});

test('frames a damaged file could not give: whole within two frames, short past that (warned, written), refused past half', {skip}, () => {
  const r = python(`print(json.dumps([tool.unread_frames(*c) for c in [(120, 120), (118, 120), (117, 120), (62, 120), (60, 120), (47, 120), (50, 0), (3000, 3025)]]))`);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), [['whole', 0], ['whole', 2], ['short', 3], ['short', 58], ['short', 60], ['refuse', 73], ['unknown', 0], ['short', 25]]);
});

test('the log relay passes errors on as they come, a fatal one before an abort too, and holds back INFO and WARNING', {skip}, () => {
  for (const [ending, status] of [['os.abort()', 134], ['sys.exit(3)', 3]]) {
    const r = python(`with tool.quiet_logs(False):
    os.write(2, b'I0000 00:00:1 init.cc:1] noise\\nW0000 00:00:1 x.cc:2] a warning\\nINFO: Created a delegate\\nE0000 00:00:1 y.cc:3] an error\\nF0000 00:00:1 z.cc:4] fatal: the end\\n')
    ${ending}`);
    assert.equal(r.status === null ? 134 : r.status, status, `${ending}: ${r.stderr}`);
    assert.match(r.stderr, /E0000 00:00:1 y\.cc:3\] an error\nF0000 00:00:1 z\.cc:4\] fatal: the end\n/, `${ending}: the error and the fatal line arrive`);
    assert.doesNotMatch(r.stderr, /noise|a warning|Created a delegate/, `${ending}: INFO and WARNING held back`);
  }
  const shown = python(`with tool.quiet_logs(True):
    os.write(2, b'I0000 00:00:1 init.cc:1] noise\\n')`);
  assert.match(shown.stderr, /noise/, '--logs shows them all');
});

test('a bad models folder ends in a message, not a traceback, and nothing is downloaded', {skip}, () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'storyreel-tool-')), file = path.join(dir, 'a-file');
  writeFileSync(file, 'not a folder');
  const unreadable = path.join(dir, 'unreadable'), model = path.join(unreadable, 'pose_landmarker_heavy.task');
  mkdirSync(unreadable); writeFileSync(model, 'model bytes'); chmodSync(model, 0o000);
  const asFolder = path.join(dir, 'folder-model');
  mkdirSync(path.join(asFolder, 'pose_landmarker_heavy.task'), {recursive: true});
  const tried = folder => python(`try:
    tool.model_file('heavy', sys.argv[1], False)
except SystemExit as e:
    print(e.code)`, folder);
  const asFile = tried(file);
  assert.match(asFile.stdout, /^pose-from-video: the models folder .*a-file cannot be used \(.+\): give --models a folder$/m, asFile.stderr);
  for (const folder of [unreadable, asFolder]) {
    const r = tried(folder);
    assert.match(r.stdout, /^pose-from-video: the heavy model at .*pose_landmarker_heavy\.task cannot be read \(.+\): remove it to download it again, or give --models another folder$/m, r.stderr);
    assert.doesNotMatch(r.stderr, /Traceback|downloading/);
  }
  chmodSync(model, 0o644);
});
