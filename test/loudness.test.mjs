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
import {parseLoudnormReport, measuredLoudness, linearLoudnorm, effectiveTarget, unusableReason, checkLoudnessTarget} from '../src/render.mjs';
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

test('a steady film measures a range of 0, FFmpeg\'s "not measured": it is sent as 0.1 so one gain is kept', () => {
  assert.match(linearLoudnorm({I: -16, TP: -1.5}, {I: -20, TP: -3, LRA: 0, thresh: -30, offset: 0}), /:measured_LRA=0\.1:/);
});

test('with no LRA set, the second pass raises the range target to the measured range (7..50), so a wide range keeps one gain', () => {
  const m = {I: -37.97, TP: -25.21, LRA: 14.2, thresh: -50.36, offset: 21.5}, target = {I: -16, TP: -1.5};
  assert.deepEqual(effectiveTarget(target, m), {I: -16, TP: -1.5, LRA: 15});
  assert.match(linearLoudnorm(effectiveTarget(target, m), m), /^loudnorm=I=-16:TP=-1\.5:LRA=15:measured_I=-37\.97:.*:measured_LRA=14\.2:/);
  assert.equal(effectiveTarget(target, {...m, LRA: 3}).LRA, 7, 'never below FFmpeg\'s default 7');
  assert.equal(effectiveTarget(target, {...m, LRA: 0}).LRA, 7);
  assert.equal(effectiveTarget(target, {...m, LRA: 80}).LRA, 50, 'never above FFmpeg\'s 50');
  assert.deepEqual(effectiveTarget({...target, LRA: 11}, m), {...target, LRA: 11}, 'an LRA the caller set is kept');
  assert.deepEqual(target, {I: -16, TP: -1.5}, 'the caller\'s target is not edited');
});

test('a measurement that cannot drive the second pass says why: silence only when there is no loudness, else the fields unread', () => {
  const m = {I: -20, TP: -3, LRA: 4, thresh: -30, offset: 0};
  assert.equal(unusableReason(m), null);
  assert.match(unusableReason({...m, I: null, offset: null}), /^the audio is silent/);
  assert.equal(unusableReason({...m, offset: null}), 'could not read: offset');
  assert.equal(unusableReason({...m, thresh: null, offset: null}), 'could not read: thresh, offset');
});

test('the loudness option is checked: I and TP required, LRA optional, finite and in FFmpeg\'s range; anything else names the fix', async () => {
  checkLoudnessTarget({I: -16, TP: -1.5}); checkLoudnessTarget({I: -23, TP: -1, LRA: 11});
  assert.throws(() => checkLoudnessTarget({I: -16, TP: -1.5, lra: 11}), /loudness\.lra is not a key: use LRA \(loudness range, LU/);
  assert.throws(() => checkLoudnessTarget({I: -16, TP: -1.5, gain: 2}), /loudness\.gain is not a key; loudness takes \{I, TP, LRA\?\}/);
  assert.throws(() => checkLoudnessTarget({I: -16}), /loudness\.TP is missing: give TP \(true peak, dBTP/);
  assert.throws(() => checkLoudnessTarget({TP: -1.5}), /loudness\.I is missing/);
  assert.throws(() => checkLoudnessTarget({I: '-16', TP: -1.5}), /loudness\.I must be a finite number .*not "-16"/);
  assert.throws(() => checkLoudnessTarget({I: -16, TP: NaN}), /loudness\.TP must be a finite number/);
  assert.throws(() => checkLoudnessTarget({I: -16, TP: 3}), /loudness\.TP = 3 is outside FFmpeg's range: use -9\.\.0/);
  assert.throws(() => checkLoudnessTarget({I: -16, TP: -1.5, LRA: 0}), /loudness\.LRA = 0 is outside FFmpeg's range: use 1\.\.50/);
  assert.throws(() => checkLoudnessTarget(null), /loudness must be an object, e\.g\. \{I: -16, TP: -1\.5\}/);
  const film = await compileFilm({storyboard, timings, recipe, root: hello});
  await assert.rejects(renderFilm({film, storyboard, timings, out: path.join(tmp(), 'x.mp4'), ...small, loudness: {I: -16, TP: -1.5, lra: 11}}), /loudness\.lra is not a key: use LRA/);
});

test('the making-of record flags every type that is not linear, and names why', () => {
  const measured = {I: -20, TP: -3, LRA: 4, thresh: -30, offset: 0}, target = {I: -16, TP: -1.5};
  assert.deepEqual(loudnessRecord({type: 'linear', target, measured}), {type: 'linear', target, measured});
  assert.match(loudnessRecord({type: 'dynamic', target, measured}).flag, /normalised "dynamic", not "linear".*the LRA you set.*quiet moments may be raised/);
  // When the peak is what blocked one gain, the record names the loudest target one gain can reach.
  const peaky = loudnessRecord({type: 'dynamic', target: {I: -18, TP: -1.5}, measured: {I: -19.98, TP: -2.93, LRA: 14.7, thresh: -31.5, offset: -.3}});
  assert.match(peaky.flag, /the loudest peak \(-2.93 dBTP\) reaches the -1.5 dBTP limit at I = -18.6 LUFS — ask for loudness I -18.6 or lower to keep one fixed gain/);
  assert.doesNotMatch(loudnessRecord({type: 'dynamic', target: {I: -20, TP: -1.5}, measured: {I: -19.98, TP: -2.93, LRA: 30, thresh: -31.5, offset: 0}}).flag, /ask for loudness/, 'no advice when the peak is not the cause');
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

/** One scene audio file per scene, made by FFmpeg's lavfi source `src` (given the scene's duration). */
const voicedTimings = (dir, src) => ({scenes: timings.scenes.map((s, i) => {
  spawnSync(ffmpegBin, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', src(s.duration, i), '-ar', '48000', '-ac', '1', path.join(dir, `scene-${i}.wav`)]);
  return {...s, audio: `scene-${i}.wav`};
})});

test('a voice that rises and falls is set with one fixed gain: type linear, no flag, and the film lands on the target', {skip: ffmpeg ? false : 'ffmpeg not on PATH'}, async () => {
  const dir = tmp();
  // Pink noise that rises and falls stands in for the voice (seeded, one file per scene, about -27 LUFS).
  const voiced = voicedTimings(dir, (d, i) => `anoisesrc=d=${d}:c=pink:a=0.3:seed=${7 + i},volume=volume='0.7+0.3*sin(2*t)':eval=frame`);
  const film = await compileFilm({storyboard, timings: voiced, recipe, root: hello});
  const result = await renderFilm({film, storyboard, timings: voiced, narrationDir: dir, out: path.join(dir, 'out', 'voiced.mp4'), ...small, from: 0, to: 8});
  assert.equal(result.loudness.type, 'linear');
  assert.ok(Object.values(result.loudness.measured).every(Number.isFinite), 'every measurement is a number');
  assert.ok(result.loudness.target.LRA >= 7, 'the record shows the range target the second pass asked for');
  assert.equal(loudnessRecord(result.loudness).flag, undefined);
  assert.ok(Math.abs(integrated(result.out) - -16) < 1, `the film is set to -16 LUFS (read ${integrated(result.out)})`);
});

test('a perfectly steady tone (its range measures 0) is set with one fixed gain too', {skip: ffmpeg ? false : 'ffmpeg not on PATH'}, async () => {
  const dir = tmp();
  const steady = voicedTimings(dir, d => `sine=f=440:d=${d},volume=0.05`);
  const film = await compileFilm({storyboard, timings: steady, recipe, root: hello});
  const result = await renderFilm({film, storyboard, timings: steady, narrationDir: dir, out: path.join(dir, 'out', 'steady.mp4'), ...small, from: 3, to: 7});
  assert.equal(result.loudness.measured.LRA, 0, 'the record keeps the true measured range');
  assert.equal(result.loudness.type, 'linear');
});
