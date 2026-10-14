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

test('a damaged file is told by time, never by the count its header states: a trimmed file is whole, a variable rate is whole', {skip}, () => {
  const r = python(`steady = lambda n, start=0, fps=30: [start + i * 1000 / fps for i in range(n)]
cases = {
  'clean':          (steady(120), 120, 30, 4.0),
  'trimmed at 2.2': (steady(54), 120, 30, 1.8),                    # ffmpeg -ss 2.2 -c copy: the header states 120, the edit list shows 54
  'trimmed at 1.0': (steady(90), 120, 30, 3.0),
  'variable mkv':   (steady(60) + [2000 + i * 50 for i in range(60)], 123, 30, 5.0),   # OpenCV estimates 123 frames
  'damaged at 50%': (steady(62), 120, 30, 4.0),
  'damaged at 35%': (steady(47), 120, 30, 4.0),
  'starts late':    (steady(90, 1000), 120, 30, 4.0),
  'no FFprobe, fewer': (steady(54), 120, 30, None),
  'no FFprobe, one short': (steady(119), 121, 30, None),
}
print(json.dumps({name: tool.unread_frames(*c) for name, c in cases.items()}))`);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), {
    'clean': ['whole', null], 'trimmed at 2.2': ['whole', null], 'trimmed at 1.0': ['whole', null], 'variable mkv': ['whole', null],
    'damaged at 50%': ['short', {frames: 58, why: 'damaged', read: [0, 2.067], duration: 4}],
    'damaged at 35%': ['refuse', {frames: 73, why: 'damaged', read: [0, 1.567], duration: 4}],
    'starts late': ['short', {frames: 30, why: 'damaged', read: [1, 4], duration: 4}],
    'no FFprobe, fewer': ['unsure', {frames: 66, why: 'unknown'}], 'no FFprobe, one short': ['whole', null],
  });
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
  // Ctrl-C reaches the tool and the relay alike: the relay ignores it and drains, so what is written after still arrives.
  const stopped = python(`import signal, time
os.setpgrp()
with tool.quiet_logs(False):
    try:
        os.write(2, b'E0000 00:00:1 a.cc:1] before\\n')
        os.killpg(os.getpgrp(), signal.SIGINT)
        time.sleep(1)
    except KeyboardInterrupt:
        os.write(2, b'E0000 00:00:1 b.cc:2] after Ctrl-C\\n')`);
  assert.equal(stopped.status, 0, stopped.stderr);
  assert.match(stopped.stderr, /before\nE0000 00:00:1 b\.cc:2\] after Ctrl-C\n/, 'both lines arrive');
  assert.doesNotMatch(stopped.stderr, /Traceback|KeyboardInterrupt/, 'and no traceback from the relay');
  // Run with stderr closed (2>&-): nothing to filter, nothing relayed, and the work goes on.
  const closed = python(`os.close(2)
sys.stderr = None
with tool.quiet_logs(False):
    print('ran')`);
  assert.deepEqual([closed.status, closed.stdout.trim()], [0, 'ran']);
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
