// Loudness in two passes (render.mjs · muxWithLoudness): measure the whole mixed film, then one fixed gain;
// pure silence is left as it is; the making-of record keeps the type and flags anything not 'linear'.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileFilm, evenTimings, makeFilm, renderFilm} from '../src/index.mjs';
import {parseLoudnormReport, measuredLoudness, linearLoudnorm} from '../src/render.mjs';
import {loudnessRecord} from '../src/pipeline.mjs';

const hello = fileURLToPath(new URL('../examples/hello/', import.meta.url));
const storyboard = JSON.parse(readFileSync(hello + 'storyboard.json', 'utf8'));
const recipe = JSON.parse(readFileSync(hello + 'recipe.json', 'utf8'));
const timings = evenTimings(storyboard, {tail: 4});
const small = {width: 160, height: 90, fps: 4};
const ffmpegBin = process.env.FFMPEG_BIN || 'ffmpeg';
const ffmpeg = spawnSync(ffmpegBin, ['-version']).status === 0;
const tmp = () => mkdtempSync(path.join(tmpdir(), 'storyreel-loud-'));

const REPORT = (i, type) => `[Parsed_loudnorm_1 @ 0x1] \n{\n\t"input_i" : "${i}",\n\t"input_tp" : "-3.10",\n\t"input_lra" : "4.20",\n\t"input_thresh" : "-30.50",\n\t"output_i" : "-16.00",\n\t"normalization_type" : "${type}",\n\t"target_offset" : "0.40"\n}\n`;

test('loudnorm reports: the last JSON block is read; -inf and unreadable numbers become null', () => {
  const report = parseLoudnormReport(`noise {"a": 1}\n${REPORT('-40.00', 'dynamic')}more lines\n${REPORT('-20.50', 'linear')}size=N/A`);
  assert.equal(report.normalization_type, 'linear');
  assert.deepEqual(measuredLoudness(report), {I: -20.5, TP: -3.1, LRA: 4.2, thresh: -30.5, offset: .4});
  assert.equal(parseLoudnormReport('no report here'), null);
  const silent = measuredLoudness(parseLoudnormReport(REPORT('-inf', 'linear').replace('"0.40"', '"inf"')));
  assert.equal(silent.I, null); assert.equal(silent.offset, null); assert.equal(silent.TP, -3.1);
});

test('the second pass: the target, the first pass\'s measurement, one fixed gain, a report', () => {
  const f = linearLoudnorm({I: -16, TP: -1.5}, {I: -20.5, TP: -3.1, LRA: 4.2, thresh: -30.5, offset: .4});
  assert.equal(f, 'loudnorm=I=-16:TP=-1.5:measured_I=-20.5:measured_TP=-3.1:measured_LRA=4.2:measured_thresh=-30.5:offset=0.4:linear=true:print_format=json');
  assert.match(linearLoudnorm({I: -16, TP: -1.5, LRA: 11}, {I: -20, TP: -3, LRA: 4, thresh: -30, offset: 0}), /^loudnorm=I=-16:TP=-1\.5:LRA=11:measured_I=-20:/);
});

test('the making-of record flags every type that is not linear, and names why', () => {
  const measured = {I: -20, TP: -3, LRA: 4, thresh: -30, offset: 0}, target = {I: -16, TP: -1.5};
  assert.deepEqual(loudnessRecord({type: 'linear', target, measured}), {type: 'linear', target, measured});
  assert.match(loudnessRecord({type: 'dynamic', target, measured}).flag, /normalised "dynamic", not "linear".*quiet moments may be raised/);
  assert.match(loudnessRecord({type: 'skipped', target, measured: {...measured, I: null}, reason: 'the audio is silent'}).flag, /^not normalised: the audio is silent/);
});

test('a partial render of only the silent opening passes: loudness is skipped, and the record says so', {skip: ffmpeg ? false : 'ffmpeg not on PATH'}, async () => {
  const out = path.join(tmp(), 'opening.mp4');
  const result = await makeFilm({storyboard, recipe, root: hello, timings, out, render: {...small, from: 0, to: 2}});
  assert.equal(result.seconds, 2);
  assert.equal(result.loudness.type, 'skipped');
  assert.equal(result.loudness.measured.I, null);
  const record = JSON.parse(readFileSync(result.makingOf, 'utf8'));
  assert.equal(record.loudness.type, 'skipped');
  assert.match(record.loudness.flag, /not normalised: the audio is silent/);
});

/** The integrated loudness FFmpeg's ebur128 reads from a finished file. */
const integrated = file => Number(spawnSync(ffmpegBin, ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-'], {encoding: 'utf8'}).stderr.match(/Integrated loudness:\s*I:\s*(-?[\d.]+) LUFS/)[1]);

test('a steady voice is set with one fixed gain: type linear, no flag, and the film lands on the target', {skip: ffmpeg ? false : 'ffmpeg not on PATH'}, async () => {
  const dir = tmp();
  // Pink noise that rises and falls stands in for the voice (seeded, one file per scene, about -27 LUFS).
  // Not a steady sound: its loudness range would measure exactly 0, which FFmpeg's loudnorm reads as
  // "not measured" (0 is the option's default) and answers with its varying mode.
  const voiced = {scenes: timings.scenes.map((s, i) => {
    spawnSync(ffmpegBin, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `anoisesrc=d=${s.duration}:c=pink:a=0.3:seed=${7 + i},volume=volume='0.7+0.3*sin(2*t)':eval=frame`, '-ar', '48000', '-ac', '1', path.join(dir, `scene-${i}.wav`)]);
    return {...s, audio: `scene-${i}.wav`};
  })};
  const film = await compileFilm({storyboard, timings: voiced, recipe, root: hello});
  const result = await renderFilm({film, storyboard, timings: voiced, narrationDir: dir, out: path.join(dir, 'out', 'voiced.mp4'), ...small, from: 0, to: 8});
  assert.equal(result.loudness.type, 'linear');
  assert.ok(Object.values(result.loudness.measured).every(Number.isFinite), 'every measurement is a number');
  assert.equal(loudnessRecord(result.loudness).flag, undefined);
  assert.ok(Math.abs(integrated(result.out) - -16) < 1, `the film is set to -16 LUFS (read ${integrated(result.out)})`);
});
