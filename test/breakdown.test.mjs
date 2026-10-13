// A reference film broken down (breakdown.mjs): films made here with FFmpeg, whose cuts, fades, shots and motion are
// known, read back. The main one: a red card with a one-frame flash, a hard cut, a crossfade between two cards, a white
// box moving across black under a corner logo, a camera panning over a texture, a dip through black into a lettered
// card, and a tone under it all. Beside it: a variable-rate clip, eased fades, a picture stored on its side, a film of
// 45 quick shots, and a file with sound only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, existsSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createCanvas, GlobalFonts} from '@napi-rs/canvas';
import {breakdown, breakdownText, BREAKDOWN} from '../src/breakdown.mjs';
import {selectFrames} from '../src/stills.mjs';

const has = cmd => !spawnSync(cmd, ['-version']).error;
const skip = has('ffmpeg') && has('ffprobe') ? false : 'needs ffmpeg and ffprobe';
const near = (actual, expected, within, what) => assert.ok(Math.abs(actual - expected) <= within + 1e-9, `${what}: ${actual}, expected ${expected} ± ${within}`);
const FRAME = 1 / 25;
const ffmpeg = args => { const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], {encoding: 'utf8'}); assert.equal(r.status, 0, r.stderr); };
const V = 'format=yuv420p,setsar=1';
/** A texture as a geq expression: grey, varied in both directions, the same in every frame. */
const TEXTURE = '128+40*sin(X/5)+35*sin(X/13)+30*sin(Y/4)+25*sin((X+2*Y)/31)';

/** A PNG drawn in the bundled hand (the same on every machine): a dark lettered card, or a small logo on nothing. */
function drawn(file, {width, height, background = null, lines}) {
  GlobalFonts.registerFromPath(fileURLToPath(new URL('../fonts/caveat/Caveat.ttf', import.meta.url)), 'Caveat');
  const c = createCanvas(width, height), x = c.getContext('2d');
  if (background) { x.fillStyle = background; x.fillRect(0, 0, width, height); }
  x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (const [text, size, cx, cy] of lines) { x.font = `700 ${size}px Caveat`; x.fillText(text, cx, cy); }
  writeFileSync(file, c.toBuffer('image/png'));
  return file;
}

/**
 * The reference, 320×180 at 25 fps, 10.4 s: red 0–1.6 (white at frame 20) · cut · blue, dissolving 2.8–3.8 into yellow ·
 * cut at 4.8 · a box moving right 4.8–6.8 under a logo in the bottom-right corner · cut · a pan to the right 6.8–8.8,
 * fading out from 8.4 · the lettered card fading in to 9.2, until 10.4.
 */
function makeReference(dir, {sound = true} = {}) {
  const card = drawn(path.join(dir, 'card.png'), {width: 320, height: 180, background: '#2b2d33', lines: [['Match this', 44, 160, 80], ['one shot, one beat', 26, 160, 130]]});
  const logo = drawn(path.join(dir, 'logo.png'), {width: 60, height: 30, lines: [['HX', 24, 30, 15]]});
  const file = path.join(dir, sound ? 'reference.mp4' : 'silent.mp4');
  const graph = [
    `color=c=red:s=320x180:r=25:d=1.6,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='eq(n\\,20)',${V}[a]`,
    `color=c=blue:s=320x180:r=25:d=2.2,${V}[b]`, `color=c=yellow:s=320x180:r=25:d=2,${V}[c]`, '[b][c]xfade=transition=fade:duration=1:offset=1.2[bc]',
    'color=c=black:s=320x180:r=25:d=2[bg]', 'color=c=white:s=40x40:r=25:d=2[box]', '[bg][box]overlay=x=\'20+120*t\':y=70[moving]', `[moving][1:v]overlay=x=255:y=145,${V}[d]`,
    `nullsrc=s=800x240:r=25:d=2,geq=lum='${TEXTURE}':cb=128:cr=128,crop=320:180:'20+60*t':20,fade=t=out:st=1.6:d=0.4,${V}[e]`,
    `[0:v]fps=25,${V},fade=t=in:st=0:d=0.4[f]`, '[a][bc][d][e][f]concat=n=5:v=1:a=0[v]'].join(';');
  ffmpeg(['-loop', '1', '-framerate', '25', '-t', '1.6', '-i', card, '-loop', '1', '-framerate', '25', '-t', '2', '-i', logo,
    ...(sound ? ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=22050:duration=10.4'] : []),
    '-filter_complex', graph, '-map', '[v]', ...(sound ? ['-map', '2:a', '-c:a', 'aac'] : []), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
  return file;
}

const dir = skip ? null : mkdtempSync(path.join(tmpdir(), 'storyreel-breakdown-test-'));
const reference = skip ? null : makeReference(dir);
let first = null;
const brokenDown = () => (first ??= breakdown(reference, {out: path.join(dir, 'out')}));

test('the probe: length, frame rate, size and sound', {skip}, async () => {
  const {spec} = await brokenDown();
  near(spec.video.seconds, 10.4, FRAME, 'the length'); near(spec.video.fps, 25, .01, 'the frame rate'); near(spec.video.frames, 260, 1, 'the frames');
  assert.deepEqual([spec.video.width, spec.video.height, spec.video.sound, spec.video.rotation, spec.video.variable], [320, 180, true, undefined, undefined]);
  assert.deepEqual([spec.read.width, spec.read.height, spec.read.rate], [BREAKDOWN.width, 90, 25]);
  assert.deepEqual(spec.warnings, []);
});

test('hard cuts are found where the picture jumps in one frame, and a one-frame flash is a flash, not a cut', {skip}, async () => {
  const {spec} = await brokenDown(), cuts = spec.transitions.filter(t => t.kind === 'cut');
  assert.equal(cuts.length, 3);
  cuts.forEach((c, i) => near(c.frame, [40, 120, 170][i], 1, `cut ${i + 1}`));
  for (const c of cuts) {
    assert.equal(c.why.verdict, 'cut');
    assert.match(c.why.rules.find(r => r.then === 'cut').checks.join(' '), /jump [\d.]+ ≥ 12 ✓ ratio [\d.]+ ≥ 3 ✓/);
  }
  assert.equal(spec.flashes.length, 1); near(spec.flashes[0].frame, 20, 1, 'the flash frame');
  assert.match(spec.flashes[0].why.because, /a flash/);
  near(spec.shots[0].seconds, 1.6, FRAME, 'the flash splits no shot: the first shot');
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
  near(spec.shots[2].in.seconds, 1, 2 * FRAME, 'the dissolve in');
  near(spec.pacing.median, 1.65, FRAME, 'the median shot'); near(spec.pacing.mean, 10.4 / 6, .01, 'the mean shot');
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
  near(spec.motion.curve.length, 10.4 / .5, 1, 'the motion curve, every 0.5 s');
});

test('lettering is a heuristic: the lettered card reads as lettered; a logo that stays in a corner is left out', {skip}, async () => {
  const {spec} = await brokenDown(), box = spec.shots[3];
  assert.deepEqual(spec.shots.map(s => s.text.verdict), ['no-text', 'no-text', 'no-text', 'no-text', 'no-text', 'text']);
  assert.ok(box.text.mark > 0, `the corner logo is seen, and left out: ${JSON.stringify(box.text)}`);
  assert.deepEqual(spec.text.shots, [6]);
  assert.match(spec.text.heuristic, /no OCR/);
});

test('the files: breakdown.json, breakdown.md, a sheet per shot, the overview, and the record of every decision', {skip}, async () => {
  const {spec, text, record, files} = await brokenDown();
  assert.deepEqual(JSON.parse(readFileSync(files.json, 'utf8')), spec);
  assert.equal(readFileSync(files.md, 'utf8'), text);
  assert.equal(text, breakdownText(spec));
  assert.match(text, /\| 3 \| 0:03\.3 \| 0:04\.8 \| 1\.\d+ s \| dissolve 1(\.\d+)? s \| one colour all through \| – \|/);
  assert.match(text, /#5 \(0:06\.8\): the camera pans right/);
  assert.match(text, /A mark that stays in a corner \(a logo, a watermark\) was left out in #4/);
  assert.match(text, /Not run: no beat map was given/);
  assert.equal(files.sheets.length, 6);
  for (const f of [files.overview, ...files.sheets]) assert.equal(readFileSync(f).subarray(1, 4).toString(), 'PNG', f);
  assert.deepEqual(spec.sheets.shots, files.sheets.map(f => path.relative(path.dirname(files.json), f)));
  assert.deepEqual(JSON.parse(readFileSync(files.record, 'utf8')), record);
  const decisions = record.filter(e => e.type === 'condition').map(e => e.text);
  assert.ok(decisions.some(t => /jump [\d.]+ gte 12 ✓, ratio [\d.]+ gte 3 ✓, and chose cuts\/each~\d+\/cut/.test(t)), 'a cut is a decision with its evidence');
  assert.ok(decisions.some(t => /chose gradual\/each~\d+\/dissolve/.test(t)) && decisions.some(t => /chose motion\/each~\d+\/camera/.test(t)));
  assert.ok(decisions.some(t => /default "every one of the cut candidates is decided"/.test(t)), 'the candidates are decided in batches, and the record says when all are');
  assert.ok(decisions.some(t => /default "no beat map was given/.test(t)), 'why the beats were not read');
});

test('a beat map, when given, is handed the sound and this run\'s FFmpeg; it says which cuts land on a beat, the drop, and a close tempo call', {skip}, async () => {
  let heard = null;
  const beatMap = async (file, options) => {
    heard = {file, options, there: existsSync(file), bytes: readFileSync(file).length};
    return Object.freeze({bpm: 75, beats: Object.freeze([4.8, 1.6, 4.0, 8.0]), drop: 7.5, confidence: .8, alternatives: Object.freeze([{bpm: 75, score: 1}, {bpm: 150, score: .95}])});
  };
  const {spec, text} = await breakdown(reference, {out: path.join(dir, 'beats'), beatMap});
  assert.ok(heard.there && heard.bytes > 1000 && heard.file.endsWith('.wav'), 'the beat map hears the sound as a WAV');
  assert.deepEqual(heard.options, {ffmpeg: process.env.FFMPEG_BIN || 'ffmpeg'});
  assert.equal(existsSync(heard.file), false, 'and the WAV is removed after');
  const b = spec.audio.beats;
  assert.equal(b.ran, true); assert.equal(b.bpm, 75); assert.deepEqual(b.beats, [1.6, 4, 4.8, 8]);
  assert.equal(b.within, .05); assert.equal(b.confidence, .8); assert.deepEqual(b.close, {bpm: 150, score: .95});
  assert.deepEqual(b.cuts.map(c => [c.kind, c.onBeat]), [['cut', true], ['dissolve', false], ['cut', true], ['cut', false], ['dip', false]]);
  assert.equal(b.onBeat, 2); assert.equal(b.of, 5);
  assert.equal(b.drop.shot, 5); near(b.drop.nearestCut.at, 6.8, FRAME, 'the cut nearest the drop');
  assert.match(text, /75 BPM \(confidence 0\.8\); a close call: 150 BPM scores 0\.95 of it, 4 beats\. 2 of 5 cuts land on a beat \(within 0\.05 s\)/);
  assert.match(text, /The drop at 0:07\.5: shot #5 is on screen/);
});

test('a beat map that cannot read the sound is no failure: the beats were not read, and the spec says why', {skip}, async () => {
  const {spec, text} = await breakdown(reference, {out: path.join(dir, 'no-tempo'), beatMap: () => { throw new Error('the sound has no repeating onsets to measure a tempo from'); }});
  assert.deepEqual(spec.audio.beats, {ran: false, why: 'the beat map could not read the sound: the sound has no repeating onsets to measure a tempo from'});
  assert.equal(spec.shots.length, 6, 'the rest of the breakdown stands');
  assert.match(text, /Not run: the beat map could not read the sound/);
});

test('without sound the beats are not read, saying why; the beat map is never called', {skip}, async () => {
  const silent = makeReference(dir, {sound: false});
  let called = false;
  const {spec} = await breakdown(silent, {out: path.join(dir, 'silent'), beatMap: () => { called = true; return {bpm: 1, beats: []}; }});
  assert.equal(called, false);
  assert.deepEqual(spec.audio, {sound: false, beats: {ran: false, why: 'the video has no sound'}});
});

test('a variable frame rate keeps its times: the cut lands where it is, the last shot ends with the file, and the spec warns', {skip}, async () => {
  // 25 fps with every fifth frame dropped (nominal 25, average about 20): grey 80 until 3.0 s, then grey 200.
  const file = path.join(dir, 'variable.mp4');
  ffmpeg(['-f', 'lavfi', '-i', 'nullsrc=s=320x180:r=25:d=6,geq=lum=\'if(lt(T,3),80,200)+20*sin(X/7)\':cb=128:cr=128', '-vf', 'select=\'not(eq(mod(n\\,5)\\,4))\'', '-fps_mode', 'vfr', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
  const {spec, record} = await breakdown(file, {out: path.join(dir, 'variable')});
  assert.equal(spec.video.variable, true); near(spec.video.fps, 20.1, .2, 'the average rate'); assert.equal(spec.video.rate, 25);
  assert.equal(spec.warnings.length, 1); assert.match(spec.warnings[0], /the frame rate varies \(average 20\.\d+, nominal 25 a second\)/);
  assert.ok(record.some(e => e.key === 'warning' && /the frame rate varies/.test(e.text)), 'the record keeps the warning');
  assert.deepEqual(spec.transitions.map(t => t.kind), ['cut']); near(spec.transitions[0].at, 3, FRAME, 'the cut');
  assert.equal(spec.shots.length, 2); near(spec.shots[1].end, 5.96, 2 * FRAME, 'the last shot ends with the file');
});

test('an eased fade out with a sudden last step, a short hold and a slow fade in are one dip — no cut, no phantom shots', {skip}, async () => {
  // Texture A for 2.2 s: smoothstep down to 15% from 1.0 to 1.92 s, then black (the last step a jump); texture B fades in
  // over 1.5 s on a smoothstep and holds to 4.8 s.
  const out = 'if(lt(T,1),1,if(lt(T,1.92),0.15+0.85*(1-(3*pow((T-1)/0.92,2)-2*pow((T-1)/0.92,3))),0))', into = '(3*pow(min(T/1.5,1),2)-2*pow(min(T/1.5,1),3))';
  const file = path.join(dir, 'fades.mp4');
  ffmpeg(['-filter_complex', [`nullsrc=s=320x180:r=25:d=2.2,geq=lum='16+(${TEXTURE}-16)*${out}':cb=128:cr=128,${V}[a]`,
    `nullsrc=s=320x180:r=25:d=2.6,geq=lum='16+(128+50*sin(Y/6)+40*sin((X-Y)/9)-16)*${into}':cb=128:cr=128,${V}[b]`, '[a][b]concat=n=2:v=1:a=0[v]'].join(';'),
  '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
  const {spec} = await breakdown(file, {out: path.join(dir, 'fades')});
  assert.deepEqual(spec.transitions.map(t => t.kind), ['dip'], JSON.stringify(spec.transitions.map(t => [t.kind, t.at])));
  const [dip] = spec.transitions;
  near(dip.from, 1, .25, 'the fade out starts'); near(dip.to, 2.2 + 1.5, .3, 'the fade in ends'); near(dip.at, 2.06, .1, 'the black');
  assert.equal(spec.shots.length, 2); assert.ok(spec.shots.every(s => s.seconds > 1), 'no phantom shots');
  assert.ok(spec.considered.cuts['fade-step'] >= 1, `the sudden last step is a step of the fade, not a cut: ${JSON.stringify(spec.considered.cuts)}`);
});

test('a camera that sways back and forth moves, but has no one direction', {skip}, async () => {
  const file = path.join(dir, 'sway.mp4');
  ffmpeg(['-f', 'lavfi', '-i', `nullsrc=s=800x240:r=25:d=2,geq=lum='${TEXTURE}':cb=128:cr=128,crop=320:180:'200+60*sin(2*PI*t)':20`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
  const {spec} = await breakdown(file, {out: path.join(dir, 'sway')});
  const [shot] = spec.shots;
  assert.equal(shot.motion.verdict, 'camera'); assert.equal(shot.motion.camera, null);
  assert.match(shot.motion.words, /the camera moves, with no one direction/);
});

test('a picture stored on its side is read as it is shown', {skip}, async () => {
  const plain = path.join(dir, 'landscape.mp4'), turned = path.join(dir, 'portrait.mp4');
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=25:d=1', '-pix_fmt', 'yuv420p', plain]);
  ffmpeg(['-display_rotation:v', '90', '-i', plain, '-c', 'copy', turned]);
  const {spec} = await breakdown(turned, {out: path.join(dir, 'portrait')});
  assert.deepEqual([spec.video.width, spec.video.height, spec.video.rotation], [180, 320, 90]);
  assert.deepEqual([spec.read.width, spec.read.height], [160, 284]);
  assert.equal(spec.shots.length, 1);
});

test('a film of 45 quick shots: every cut, and over 100 stills read in one pass', {skip}, async () => {
  const file = path.join(dir, 'quick.mp4');
  ffmpeg(['-f', 'lavfi', '-i', 'nullsrc=s=160x90:r=25:d=10.8,geq=lum=\'20+mod(floor(T/0.24)*53\\,200)\':cb=128:cr=128', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
  assert.match(selectFrames(Array.from({length: 135}, (_, i) => i)), /^\(\(\(/, 'a balanced sum, not a flat one');
  const {spec, files, record} = await breakdown(file, {out: path.join(dir, 'quick')});
  assert.equal(spec.shots.length, 45); assert.equal(spec.transitions.filter(t => t.kind === 'cut').length, 44);
  assert.equal(files.sheets.length, 45);
  const stills = record.find(e => e.key === 'stills' && e.type === 'step');
  assert.ok(Number(/= (\d+)/.exec(stills.text)[1]) > 100, stills.text);
});

test('refusals name the fix', {skip}, async () => {
  await assert.rejects(breakdown(path.join(dir, 'nothing.mp4')), /there is no file at .*nothing\.mp4: give the path of a video/);
  await assert.rejects(breakdown(reference, {output: dir}), /"output" is not an option; the options are out, beatMap, ffmpeg, probe, thresholds/);
  await assert.rejects(breakdown(reference, {thresholds: {cutJmp: 10}}), /"cutJmp" is not a threshold; the thresholds are width, cutJump/);
  await assert.rejects(breakdown(reference, {thresholds: {cutJump: -1}}), /thresholds\.cutJump is a number, 0 or more/);
  await assert.rejects(breakdown(reference, {thresholds: {width: 10.5}}), /thresholds\.width is a whole number, 16 or more, not 10\.5/);
  await assert.rejects(breakdown(reference, {beatMap: 'beats.json'}), /beatMap is a function, beatMap\(audioFile, \{ffmpeg\}\) → \{bpm, beats: \[seconds\], drop\?\}/);
  const tone = path.join(dir, 'tone.m4a');
  ffmpeg(['-f', 'lavfi', '-i', 'sine=d=1', tone]);
  await assert.rejects(breakdown(tone, {out: path.join(dir, 'tone')}), /tone\.m4a has no picture to break down \(it holds no video stream\): give a video/);
  const wrong = await breakdown(reference, {out: path.join(dir, 'wrong'), beatMap: () => ({tempo: 120})}).catch(e => e);
  assert.match(wrong.message, /a beat map answers \{bpm, beats: \[seconds, …\], drop\?: seconds \| null, confidence\?: 0\.\.1, alternatives\?: \[\{bpm, score\}\]\}; its bpm is beats a minute/);
  assert.ok(wrong.record.some(e => e.stageId === 'read-beats'), 'a refused breakdown keeps its record, naming the stage');
});

test('storyreel breakdown <video> --out dir: the spec in plain words and where the files are; a failure says where it stopped', {skip}, () => {
  const out = path.join(dir, 'cli'), cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url)), run = args => spawnSync(process.execPath, [cli, 'breakdown', ...args], {encoding: 'utf8'});
  const r = run([reference, '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /# Breakdown: reference\.mp4/);
  assert.ok(r.stdout.includes(path.join(out, 'breakdown.json')));
  assert.equal(JSON.parse(readFileSync(path.join(out, 'breakdown.json'), 'utf8')).shots.length, 6);
  const help = run(['--help']);
  assert.equal(help.status, 0); assert.match(help.stdout, /storyreel breakdown <video\.mp4> \[--out dir\].*FFmpeg 5\.1 or later/);
  const wrong = run([reference, '--wide']);
  assert.equal(wrong.status, 2); assert.match(wrong.stderr, /"--wide" is not understood\nstoryreel breakdown <video\.mp4> \[--out dir\]/);
  const missing = run([path.join(dir, 'gone.mp4')]);
  assert.equal(missing.status, 1); assert.match(missing.stderr, /^storyreel breakdown: there is no file at/);
  const sound = run([path.join(dir, 'tone.m4a'), '--out', path.join(dir, 'tone-cli')]);
  assert.equal(sound.status, 1); assert.match(sound.stderr, /no picture to break down[\s\S]*The record so far \(1 entry\) stops in "probe"/);
});
