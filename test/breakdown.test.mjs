// A reference film broken down (breakdown.mjs): a film made here with FFmpeg, whose cuts, fades, shots and motion are
// known, read back — a red card with a one-frame flash, a hard cut, a crossfade between two cards, a white box moving
// across black, a camera panning over a texture, a dip through black into a lettered card, and a tone under it all.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, existsSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createCanvas, GlobalFonts} from '@napi-rs/canvas';
import {breakdown, breakdownText, BREAKDOWN} from '../src/breakdown.mjs';

const has = cmd => !spawnSync(cmd, ['-version']).error;
const skip = has('ffmpeg') && has('ffprobe') ? false : 'needs ffmpeg and ffprobe';
const near = (actual, expected, within, what) => assert.ok(Math.abs(actual - expected) <= within, `${what}: ${actual}, expected ${expected} ± ${within}`);
const FRAME = 1 / 25;

/** A dark card lettered in the bundled hand (the same on every machine). */
function letteredCard(file) {
  GlobalFonts.registerFromPath(fileURLToPath(new URL('../fonts/caveat/Caveat.ttf', import.meta.url)), 'Caveat');
  const c = createCanvas(320, 180), x = c.getContext('2d');
  x.fillStyle = '#2b2d33'; x.fillRect(0, 0, 320, 180);
  x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '700 44px Caveat'; x.fillText('Match this', 160, 80);
  x.font = '700 26px Caveat'; x.fillText('one shot, one beat', 160, 130);
  writeFileSync(file, c.toBuffer('image/png'));
}

/**
 * The reference, 320×180 at 25 fps, 10.4 s: red 0–1.6 (white at frame 20) · cut · blue, dissolving 2.8–3.8 into yellow ·
 * cut at 4.8 · a box moving right 4.8–6.8 · cut · a pan to the right 6.8–8.8, fading out from 8.4 · the lettered card
 * fading in to 9.2, until 10.4.
 */
function makeReference(dir, {sound = true} = {}) {
  const card = path.join(dir, 'card.png'), file = path.join(dir, sound ? 'reference.mp4' : 'silent.mp4');
  letteredCard(card);
  const v = 'format=yuv420p,setsar=1';
  const graph = [
    `color=c=red:s=320x180:r=25:d=1.6,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='eq(n\\,20)',${v}[a]`,
    `color=c=blue:s=320x180:r=25:d=2.2,${v}[b]`, `color=c=yellow:s=320x180:r=25:d=2,${v}[c]`, '[b][c]xfade=transition=fade:duration=1:offset=1.2[bc]',
    'color=c=black:s=320x180:r=25:d=2[bg]', 'color=c=white:s=40x40:r=25:d=2[box]', `[bg][box]overlay=x='20+120*t':y=70,${v}[d]`,
    `nullsrc=s=800x240:r=25:d=2,geq=lum='128+40*sin(X/5)+35*sin(X/13)+30*sin(Y/4)+25*sin((X+2*Y)/31)':cb=128:cr=128,crop=320:180:'20+60*t':20,fade=t=out:st=1.6:d=0.4,${v}[e]`,
    `[0:v]fps=25,${v},fade=t=in:st=0:d=0.4[f]`, '[a][bc][d][e][f]concat=n=5:v=1:a=0[v]'].join(';');
  const args = ['-v', 'error', '-y', '-loop', '1', '-framerate', '25', '-t', '1.6', '-i', card, ...(sound ? ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=22050:duration=10.4'] : []),
    '-filter_complex', graph, '-map', '[v]', ...(sound ? ['-map', '1:a', '-c:a', 'aac'] : []), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file];
  const r = spawnSync('ffmpeg', args, {encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
  return file;
}

const dir = skip ? null : mkdtempSync(path.join(tmpdir(), 'storyreel-breakdown-test-'));
const reference = skip ? null : makeReference(dir);
let first = null;
const brokenDown = () => (first ??= breakdown(reference, {out: path.join(dir, 'out')}));

test('the probe: length, frame rate, size and sound', {skip}, async () => {
  const {spec} = await brokenDown();
  assert.deepEqual(spec.video, {seconds: 10.4, fps: 25, width: 320, height: 180, frames: 260, sound: true});
  assert.deepEqual(spec.read, {width: BREAKDOWN.width, height: 90, frames: 'every frame, grey'});
});

test('hard cuts are found where the picture jumps in one frame, and a one-frame flash is a flash, not a cut', {skip}, async () => {
  const {spec} = await brokenDown(), cuts = spec.transitions.filter(t => t.kind === 'cut');
  assert.deepEqual(cuts.map(c => c.frame), [40, 120, 170]);
  for (const c of cuts) {
    assert.equal(c.why.verdict, 'cut');
    assert.match(c.why.rules.find(r => r.then === 'cut').checks.join(' '), /jump [\d.]+ ≥ 12 ✓ ratio [\d.]+ ≥ 3 ✓/);
  }
  assert.equal(spec.flashes.length, 1); assert.deepEqual([spec.flashes[0].frame, spec.flashes[0].at], [20, .8]);
  assert.match(spec.flashes[0].why.because, /a flash/);
  assert.equal(spec.shots[0].seconds, 1.6, 'the flash splits no shot');
});

test('a crossfade is a dissolve and a fade through black is a dip — both told apart from the cuts', {skip}, async () => {
  const {spec} = await brokenDown();
  assert.deepEqual(spec.transitions.map(t => t.kind), ['cut', 'dissolve', 'cut', 'cut', 'dip']);
  const [dissolve, dip] = [spec.transitions[1], spec.transitions[4]];
  near(dissolve.from, 2.8, 2 * FRAME, 'the dissolve starts'); near(dissolve.to, 3.8, 2 * FRAME, 'the dissolve ends'); near(dissolve.at, 3.3, FRAME, 'its middle');
  assert.deepEqual(dissolve.why.rules.at(-1).checks.map(c => c.split(' ')[0]), ['change', 'coherence', 'mix', 'moved', 'seconds']);
  assert.ok(dissolve.why.rules.at(-1).met);
  near(dip.from, 8.4, 2 * FRAME, 'the dip starts fading'); near(dip.to, 9.2, 2 * FRAME, 'the dip is back'); near(dip.at, 8.8, FRAME, 'the black');
  assert.match(dip.why.because, /fades to one colour and fades back in/);
  assert.deepEqual(spec.pacing.transitions, {cut: 3, dissolve: 1, dip: 1});
  assert.equal(spec.considered.gradual.dissolve, 1);
});

test('the shots: start, end and length, how each comes in, and the median and mean length', {skip}, async () => {
  const {spec} = await brokenDown();
  const expected = [[0, 1.6], [1.6, 3.3], [3.3, 4.8], [4.8, 6.8], [6.8, 8.8], [8.8, 10.4]];
  assert.equal(spec.shots.length, expected.length);
  spec.shots.forEach((shot, i) => { near(shot.start, expected[i][0], FRAME, `shot ${i + 1} starts`); near(shot.end, expected[i][1], FRAME, `shot ${i + 1} ends`); near(shot.seconds, shot.end - shot.start, 1e-6, `shot ${i + 1}'s length`); });
  assert.deepEqual(spec.shots.map(s => s.in.kind), ['start', 'cut', 'dissolve', 'cut', 'cut', 'dip']);
  assert.equal(spec.shots[2].in.seconds, 1);
  near(spec.pacing.median, 1.65, FRAME, 'the median shot'); near(spec.pacing.mean, 10.4 / 6, .001, 'the mean shot');
  assert.equal(spec.pacing.shots, 6);
});

test('still or moving: the cards are still, the box moves inside the frame, the pan moves the camera to the right', {skip}, async () => {
  const {spec} = await brokenDown(), [, , , box, pan, card] = spec.shots;
  assert.deepEqual(spec.shots.map(s => s.motion.verdict), ['still', 'still', 'still', 'inside', 'camera', 'still']);
  assert.deepEqual(spec.shots.map(s => Boolean(s.blank)), [true, true, true, false, false, false], 'a colour card is one colour all through');
  assert.equal(pan.motion.camera, 'right'); near(pan.motion.pan, 60 / 320, .01, 'the pan, in frame widths a second');
  assert.match(pan.motion.words, /the camera pans right/);
  assert.ok(box.motion.share < BREAKDOWN.share, 'the box changes a part of the frame at once');
  const rows = box.motion.grid.map(row => Math.max(...row));
  assert.ok(Math.min(rows[1], rows[2]) > 4 * Math.max(rows[0], rows[3]), `the box's motion lives in the middle rows: ${rows}`);
  assert.match(box.motion.why.rules.find(r => r.then === 'camera').checks.join(' '), /share [\d.]+ ≥ 0.6 ✗/);
  assert.match(card.motion.why.because, /nothing in the frame changes/);
  assert.equal(spec.motion.curve.length, Math.ceil(10.4 / .5));
});

test('lettering is a heuristic: the lettered card reads as lettered, the cards, box and texture do not', {skip}, async () => {
  const {spec} = await brokenDown();
  assert.deepEqual(spec.shots.map(s => s.text.verdict), ['no-text', 'no-text', 'no-text', 'no-text', 'no-text', 'text']);
  assert.deepEqual(spec.text.shots, [6]);
  assert.match(spec.text.heuristic, /no OCR/);
});

test('the files: breakdown.json, breakdown.md, a sheet per shot, the overview, and the record of every decision', {skip}, async () => {
  const {spec, text, record, files} = await brokenDown();
  assert.deepEqual(JSON.parse(readFileSync(files.json, 'utf8')), spec);
  assert.equal(readFileSync(files.md, 'utf8'), text);
  assert.equal(text, breakdownText(spec));
  assert.match(text, /\| 3 \| 0:03\.3 \| 0:04\.8 \| 1\.48 s \| dissolve 1 s \| one colour all through \| – \|/);
  assert.match(text, /#5 \(0:06\.8\): the camera pans right/);
  assert.match(text, /Not run: no beat map was given/);
  assert.equal(files.sheets.length, 6);
  for (const f of [files.overview, ...files.sheets]) assert.deepEqual([...readFileSync(f).subarray(1, 4)].map(c => String.fromCharCode(c)).join(''), 'PNG', f);
  assert.deepEqual(spec.sheets.shots, files.sheets.map(f => path.relative(path.dirname(files.json), f)));
  assert.deepEqual(JSON.parse(readFileSync(files.record, 'utf8')), record);
  const decisions = record.filter(e => e.type === 'condition').map(e => e.text);
  assert.ok(decisions.some(t => /jump [\d.]+ gte 12 ✓, ratio [\d.]+ gte 3 ✓, and chose cuts~\d+\/cut/.test(t)), 'a cut is a decision with its evidence');
  assert.ok(decisions.some(t => /chose gradual~\d+\/dissolve/.test(t)) && decisions.some(t => /chose motion~\d+\/camera/.test(t)));
  assert.ok(decisions.some(t => /default "no beat map was given/.test(t)), 'why the beats were not read');
});

test('a beat map, when given, says which cuts land on a beat and what is on screen at the drop', {skip}, async () => {
  let heard = null;
  const beatMap = async file => { heard = {file, there: existsSync(file), bytes: readFileSync(file).length}; return {bpm: 75, beats: [4.8, 1.6, 4.0, 8.0], drop: 7.5}; };
  const {spec, text} = await breakdown(reference, {out: path.join(dir, 'beats'), beatMap});
  assert.ok(heard.there && heard.bytes > 1000 && heard.file.endsWith('.wav'), 'the beat map hears the sound as a WAV');
  assert.equal(existsSync(heard.file), false, 'and the WAV is removed after');
  const b = spec.audio.beats;
  assert.equal(b.ran, true); assert.equal(b.bpm, 75); assert.deepEqual(b.beats, [1.6, 4, 4.8, 8]);
  assert.deepEqual(b.cuts.map(c => [c.kind, c.onBeat]), [['cut', true], ['dissolve', false], ['cut', true], ['cut', false], ['dip', false]]);
  assert.equal(b.onBeat, 2); assert.equal(b.of, 5);
  assert.equal(b.drop.shot, 5); near(b.drop.nearestCut.at, 6.8, FRAME, 'the cut nearest the drop');
  assert.match(text, /75 BPM, 4 beats\. 2 of 5 cuts land on a beat/);
  assert.match(text, /The drop at 0:07\.5: shot #5 is on screen/);
});

test('without sound the beats are not read, saying why; the beat map is never called', {skip}, async () => {
  const silent = makeReference(dir, {sound: false});
  let called = false;
  const {spec} = await breakdown(silent, {out: path.join(dir, 'silent'), beatMap: () => { called = true; return {bpm: 1, beats: []}; }});
  assert.equal(called, false);
  assert.deepEqual(spec.audio, {sound: false, beats: {ran: false, why: 'the video has no sound'}});
});

test('refusals name the fix', {skip}, async () => {
  await assert.rejects(breakdown(path.join(dir, 'nothing.mp4')), /there is no file at .*nothing\.mp4: give the path of a video/);
  await assert.rejects(breakdown(reference, {output: dir}), /"output" is not an option; the options are out, beatMap, ffmpeg, probe, thresholds/);
  await assert.rejects(breakdown(reference, {thresholds: {cutJmp: 10}}), /"cutJmp" is not a threshold; the thresholds are width, cutJump/);
  await assert.rejects(breakdown(reference, {thresholds: {cutJump: -1}}), /thresholds\.cutJump is a number, 0 or more/);
  await assert.rejects(breakdown(reference, {thresholds: {width: 10.5}}), /thresholds\.width is a whole number, 16 or more, not 10\.5/);
  await assert.rejects(breakdown(reference, {beatMap: 'beats.json'}), /beatMap is a function, beatMap\(audioFile\) → \{bpm, beats: \[seconds\], drop\?\}/);
  const wrong = await breakdown(reference, {out: path.join(dir, 'wrong'), beatMap: () => ({tempo: 120})}).catch(e => e);
  assert.match(wrong.message, /a beat map answers \{bpm, beats: \[seconds, …\], drop\?: seconds\}; its bpm is beats a minute/);
  assert.ok(wrong.record.some(e => e.stageId === 'read-beats'), 'a refused breakdown keeps its record, naming the stage');
  const failed = await breakdown(reference, {out: path.join(dir, 'failed'), beatMap: () => { throw new Error('no onset'); }}).catch(e => e);
  assert.match(failed.message, /the beat map failed on the sound: no onset/);
});

test('storyreel breakdown <video> --out dir: the spec in plain words, and where the files are', {skip}, () => {
  const out = path.join(dir, 'cli'), cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [cli, 'breakdown', reference, '--out', out], {encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /# Breakdown: reference\.mp4/);
  assert.match(r.stdout, new RegExp(`${path.join(out, 'breakdown.json').replace(/[\\.]/g, '\\$&')}`));
  assert.equal(JSON.parse(readFileSync(path.join(out, 'breakdown.json'), 'utf8')).shots.length, 6);
  const wrong = spawnSync(process.execPath, [cli, 'breakdown', reference, '--wide'], {encoding: 'utf8'});
  assert.equal(wrong.status, 2); assert.match(wrong.stderr, /"--wide" is not understood\nstoryreel breakdown <video\.mp4> \[--out dir\]/);
  const missing = spawnSync(process.execPath, [cli, 'breakdown', path.join(dir, 'gone.mp4')], {encoding: 'utf8'});
  assert.equal(missing.status, 1); assert.match(missing.stderr, /^storyreel breakdown: there is no file at/);
});
