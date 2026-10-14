// A reference film broken down (breakdown.mjs): films made here with FFmpeg, whose cuts, fades, shots and motion are
// known, read back. The main one: a red card with a one-frame flash, a hard cut, a crossfade between two cards, a white
// box moving across black, a camera panning over a texture, a dip through black into a lettered card, and a tone under
// it all. Beside it: variable-rate clips, eased fades, a cut to black, a picture stored on its side, a logo across shots
// and a name in one, a film of 110 quick shots, a raw stream with no length, and a file with sound only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createCanvas, GlobalFonts} from '@napi-rs/canvas';
import {breakdown, breakdownText, BREAKDOWN} from '../src/breakdown.mjs';
import {selectFrames, stillsArgs, filterFromFile, eachStill} from '../src/stills.mjs';
import {ffmpegProbe, showinfoReader, onSlots} from '../src/finished.mjs';
import {tempDir} from './tmp.mjs';

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
 * cut at 4.8 · a box moving right 4.8–6.8 · cut · a pan to the right 6.8–8.8,
 * fading out from 8.4 · the lettered card fading in to 9.2, until 10.4.
 */
function makeReference(dir, {sound = true} = {}) {
  const card = drawn(path.join(dir, 'card.png'), {width: 320, height: 180, background: '#2b2d33', lines: [['Match this', 44, 160, 80], ['one shot, one beat', 26, 160, 130]]});
  const file = path.join(dir, sound ? 'reference.mp4' : 'silent.mp4');
  const graph = [
    `color=c=red:s=320x180:r=25:d=1.6,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='eq(n\\,20)',${V}[a]`,
    `color=c=blue:s=320x180:r=25:d=2.2,${V}[b]`, `color=c=yellow:s=320x180:r=25:d=2,${V}[c]`, '[b][c]xfade=transition=fade:duration=1:offset=1.2[bc]',
    'color=c=black:s=320x180:r=25:d=2[bg]', 'color=c=white:s=40x40:r=25:d=2[box]', `[bg][box]overlay=x='20+120*t':y=70,${V}[d]`,
    `nullsrc=s=800x240:r=25:d=2,geq=lum='${TEXTURE}':cb=128:cr=128,crop=320:180:'20+60*t':20,fade=t=out:st=1.6:d=0.4,${V}[e]`,
    `[0:v]fps=25,${V},fade=t=in:st=0:d=0.4[f]`, '[a][bc][d][e][f]concat=n=5:v=1:a=0[v]'].join(';');
  ffmpeg(['-loop', '1', '-framerate', '25', '-t', '1.6', '-i', card,
    ...(sound ? ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=22050:duration=10.4'] : []),
    '-filter_complex', graph, '-map', '[v]', ...(sound ? ['-map', '1:a', '-c:a', 'aac'] : []), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
  return file;
}

const dir = skip ? null : tempDir('breakdown-test');   // the films made here are large: removed after the file (test/tmp.mjs)
const reference = skip ? null : makeReference(dir);
let first = null;
const brokenDown = () => (first ??= breakdown(reference, {out: path.join(dir, 'out')}));

test('the probe: length, frame rate, size and sound', {skip}, async () => {
  const {spec} = await brokenDown();
  near(spec.video.seconds, 10.4, FRAME, 'the length'); near(spec.video.fps, 25, .01, 'the frame rate'); near(spec.video.frames, 260, 1, 'the frames');
  assert.deepEqual([spec.video.width, spec.video.height, spec.video.sound, spec.video.rotation, spec.video.variable], [320, 180, true, undefined, undefined]);
  assert.deepEqual([spec.read.width, spec.read.height, spec.read.rate], [BREAKDOWN.width, 90, 25]);
  assert.equal(spec.read.why.verdict, 'nominal-rate'); assert.deepEqual(spec.read.why.rules[0].checks, ['nominal 25 ≤ 120 ✓', 'ratio 1 ≤ 2 ✓']);
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

test('lettering is a heuristic: the lettered card reads as lettered; the cards, box and texture do not', {skip}, async () => {
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
  assert.match(text, /\| 3 \| 0:03\.3 \| 0:04\.8 \| 1\.\d+ s \| dissolve 1(\.\d+)? s \| one colour all through \| – \|/);
  assert.match(text, /#5 \(0:06\.8\): the camera pans right/);
  assert.match(text, /Not run: no beat map was given/);
  assert.equal(files.sheets.length, 6);
  for (const f of [files.overview, ...files.sheets]) assert.equal(readFileSync(f).subarray(1, 4).toString(), 'PNG', f);
  assert.deepEqual(spec.sheets.shots, files.sheets.map(f => path.relative(path.dirname(files.json), f)));
  assert.deepEqual(JSON.parse(readFileSync(files.record, 'utf8')), record);
  const decisions = record.filter(e => e.type === 'condition').map(e => e.text);
  assert.ok(decisions.some(t => /jump [\d.]+ gte 12 ✓, ratio [\d.]+ gte 3 ✓, and chose cuts\/each~\d+\/cut/.test(t)), 'a cut is a decision with its evidence');
  assert.ok(decisions.some(t => /chose gradual\/each~\d+\/dissolve/.test(t)) && decisions.some(t => /chose motion\/each~\d+\/camera/.test(t)));
  assert.ok(decisions.some(t => /default "all \d+ cut candidates are decided"/.test(t)), 'the candidates are decided in batches, and the record says when all are');
  assert.ok(decisions.some(t => /default "no beat map was given/.test(t)), 'why the beats were not read');
});

test('a beat map, when given, is handed the sound, its own options and this run\'s FFmpeg; it says which cuts land on a beat, the drop, and a close tempo call', {skip}, async () => {
  let heard = null;
  const beatMap = async (file, options) => {
    heard = {file, options, there: existsSync(file), bytes: readFileSync(file).length};
    return Object.freeze({bpm: 75, beats: Object.freeze([4.8, 1.6, 4.0, 8.0]), drop: 7.5, confidence: .8, alternatives: Object.freeze([{bpm: 75, score: 1}, {bpm: 150, score: .95}])});
  };
  const {spec, text} = await breakdown(reference, {out: path.join(dir, 'beats'), beatMap, beatOptions: {bpm: 75}});
  assert.ok(heard.there && heard.bytes > 1000 && heard.file.endsWith('.wav'), 'the beat map hears the sound as a WAV');
  assert.deepEqual(heard.options, {bpm: 75, ffmpeg: process.env.FFMPEG_BIN || 'ffmpeg'});
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
  const {spec, text} = await breakdown(reference, {out: path.join(dir, 'no-tempo'), beatMap: () => { throw new Error('the sound has no repeating onsets to measure a tempo from; give options.bpm to lay a grid anyway'); }});
  assert.deepEqual(spec.audio.beats, {ran: false, why: 'the beat map could not read the sound: the sound has no repeating onsets to measure a tempo from; give options.bpm to lay a grid anyway (give it as breakdown(file, {beatMap, beatOptions: {bpm: …}}))'});
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

test('a film of 110 quick shots: every cut; every decision names its candidate across the batches of 100; over 100 stills in one pass', {skip}, async () => {
  const file = path.join(dir, 'quick.mp4');
  ffmpeg(['-f', 'lavfi', '-i', 'nullsrc=s=160x90:r=25:d=22,geq=lum=\'20+mod(floor(T/0.2)*53\\,200)\':cb=128:cr=128', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
  assert.match(selectFrames(Array.from({length: 135}, (_, i) => i)), /^\(\(\(/, 'a balanced sum, not a flat one');
  const {spec, files, record} = await breakdown(file, {out: path.join(dir, 'quick')});
  assert.equal(spec.shots.length, 110); assert.equal(spec.transitions.filter(t => t.kind === 'cut').length, 109);
  assert.equal(files.sheets.length, 110);
  const decisions = record.filter(e => e.type === 'condition' && /cut candidate \d+ at /.test(e.text)).map(e => e.text);
  assert.equal(decisions.length, spec.considered.cuts.candidates);
  assert.equal(new Set(decisions).size, decisions.length, 'every cut decision is its own line');
  for (const t of spec.transitions.filter(x => x.kind === 'cut')) assert.ok(decisions.some(d => d.includes(` at ${t.at} s: `)), `the decision of the cut at ${t.at} s names it`);
  assert.ok(record.some(e => e.type === 'condition' && /left \d+ gt 0 ✓, and chose cuts\/decide the next 100/.test(e.text)), 'the batch loop says how many are left');
  const stills = record.find(e => e.key === 'stills' && e.type === 'step');
  assert.ok(Number(/= (\d+)/.exec(stills.text)[1]) > 100, stills.text);
});

test('the stills\' filter goes to FFmpeg in a file: 9,000 stills fit, though their selection is longer than one argument may be', {skip}, () => {
  const {args, filter} = stillsArgs({ffmpeg: 'ffmpeg', file: 'film.mp4', frames: Array.from({length: 9000}, (_, i) => 3 * i), width: 480, height: 270, rate: 25, script: '/tmp/filter.txt'});
  assert.ok(filter.length > 131072, `the selection is ${filter.length} bytes`);
  assert.equal((filter.match(/eq\(n/g) ?? []).length, 9000);
  assert.ok(args.every(a => a.length < 1000), 'no argument carries it');
  assert.equal(args[args.indexOf('/tmp/filter.txt') - 1], filterFromFile('ffmpeg'));
  assert.match(filterFromFile('ffmpeg'), /^(-\/filter:v|-filter_script:v)$/);
});

test('a picture that dims a little and cuts to black is cut, not faded: shot, black, shot', {skip}, async () => {
  // A texture whose contrast falls 8% over its last second, a hard cut to black for 1 s, then a hard cut to a new texture.
  const file = path.join(dir, 'dimmed.mp4');
  ffmpeg(['-filter_complex', [`nullsrc=s=320x180:r=25:d=2,geq=lum='128+(${TEXTURE}-128)*(1-0.08*max(0,T-1))':cb=128:cr=128,${V}[a]`,
    `color=c=black:s=320x180:r=25:d=1,${V}[b]`, `nullsrc=s=320x180:r=25:d=1,geq=lum='128+50*sin(Y/6)+40*sin((X-Y)/9)':cb=128:cr=128,${V}[c]`, '[a][b][c]concat=n=3:v=1:a=0[v]'].join(';'),
  '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
  const {spec} = await breakdown(file, {out: path.join(dir, 'dimmed')});
  assert.deepEqual(spec.transitions.map(t => t.kind), ['cut', 'cut'], JSON.stringify(spec.transitions.map(t => [t.kind, t.at, t.seconds])));
  const expected = [[0, 2], [2, 3], [3, 4]];
  assert.equal(spec.shots.length, 3);
  spec.shots.forEach((shot, i) => { near(shot.start, expected[i][0], FRAME, `shot ${i + 1} starts`); near(shot.end, expected[i][1], FRAME, `shot ${i + 1} ends`); });
  assert.equal(spec.shots[1].blank, true, 'the black is a slug of its own');
});

test('read faster than the file\'s average rate, a repeated frame takes no part: a one-frame flash is one flash, not two cuts', {skip}, async () => {
  const file = path.join(dir, 'flash.mp4');
  ffmpeg(['-f', 'lavfi', '-i', `nullsrc=s=320x180:r=25:d=2,geq=lum='if(eq(N\\,20)\\,235\\,90)+20*sin(X/7)':cb=128:cr=128`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
  const real = ffmpegProbe(), probe = {...real, probe: f => { const m = real.probe(f); return {...m, video: {...m.video, rate: 50}}; }};
  const {spec} = await breakdown(file, {out: path.join(dir, 'flash'), probe});
  assert.equal(spec.read.rate, 50, 'read at the nominal rate, every frame twice');
  assert.equal(spec.flashes.length, 1); near(spec.flashes[0].at, .8, .021, 'the flash');
  assert.deepEqual(spec.transitions, []); assert.equal(spec.shots.length, 1);
});

test('variable-rate cut times land on the frame shown at that time — after a dropped frame, and when the picture starts late', {skip}, async () => {
  // 30 a second with every third frame dropped (nominal 30, average 20): the new picture's first frame is at 1.833 s.
  const dropped = path.join(dir, 'dropped.mp4'), late = path.join(dir, 'late.mp4');
  ffmpeg(['-f', 'lavfi', '-i', 'nullsrc=s=320x180:r=30:d=4,geq=lum=\'if(lt(N,55),80,200)+20*sin(X/7)\':cb=128:cr=128', '-vf', 'select=\'not(eq(mod(n\\,3)\\,2))\'', '-fps_mode', 'vfr', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', dropped]);
  const first = await breakdown(dropped, {out: path.join(dir, 'dropped')});
  assert.equal(first.spec.video.variable, true);
  assert.deepEqual(first.spec.transitions.map(t => t.kind), ['cut']); near(first.spec.transitions[0].at, 55 / 30, .001, 'the cut, on the frame shown then');
  // The same picture starting 0.1 s after the file's clock (the sound starts at 0): the cut is shown at 1.933 s.
  const plain = path.join(dir, 'plain30.mp4');
  ffmpeg(['-f', 'lavfi', '-i', 'nullsrc=s=320x180:r=30:d=4,geq=lum=\'if(lt(N,55),80,200)+20*sin(X/7)\':cb=128:cr=128', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', plain]);
  ffmpeg(['-f', 'lavfi', '-i', 'sine=d=4.1', '-itsoffset', '0.1', '-i', plain, '-map', '0:a', '-map', '1:v', '-c:v', 'copy', '-c:a', 'aac', late]);
  const second = await breakdown(late, {out: path.join(dir, 'late')});
  near(second.spec.transitions[0].at, .1 + 55 / 30, .001, 'the cut, on the file\'s clock');
});

test('a raw stream that names no length says so, and is measured from its frames', {skip}, async () => {
  const mp4 = path.join(dir, 'tosplit.mp4'), raw = path.join(dir, 'raw.h264');
  ffmpeg(['-f', 'lavfi', '-i', 'nullsrc=s=320x180:r=25:d=2,geq=lum=\'if(lt(T,1),80,200)+20*sin(X/7)\':cb=128:cr=128', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4]);
  ffmpeg(['-i', mp4, '-c:v', 'copy', '-bsf:v', 'h264_mp4toannexb', '-f', 'h264', raw]);
  const {spec, text} = await breakdown(raw, {out: path.join(dir, 'raw')});
  assert.equal(spec.video.lengthFrom, 'frames'); assert.ok(Number.isFinite(spec.video.seconds) && spec.video.seconds > 0);
  assert.ok(!/NaN/.test(text), 'never NaN');
  assert.match(text, /counted from its frames: the file names no length/);
  assert.ok(spec.warnings.includes('the file names no length: it is counted from the frames read'));
});

test('a file whose clock does not start at 0 is read whole: a transport stream, and an MP4 offset by half a second', {skip}, async () => {
  // 4 s at 25 fps: a flash at frame 25 (1.0 s), grey 80 until 2.0 s, then grey 200.
  const made = path.join(dir, 'clocked.mp4'), ts = path.join(dir, 'clocked.ts'), offset = path.join(dir, 'offset.mp4');
  ffmpeg(['-f', 'lavfi', '-i', 'nullsrc=s=320x180:r=25:d=4,geq=lum=\'if(eq(N\\,25)\\,235\\,if(lt(T\\,2)\\,80\\,200))+20*sin(X/7)\':cb=128:cr=128', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', made]);
  ffmpeg(['-i', made, '-c', 'copy', '-f', 'mpegts', ts]);
  ffmpeg(['-i', made, '-c', 'copy', '-output_ts_offset', '0.5', offset]);
  for (const file of [ts, offset]) {
    const {spec} = await breakdown(file, {out: path.join(dir, path.basename(file) + '-out')});
    near(spec.video.frames, 100, 1, `${path.basename(file)}: every frame`);
    assert.equal(spec.flashes.length, 1, path.basename(file)); near(spec.flashes[0].at, 1, FRAME, `${path.basename(file)}: the flash`);
    assert.deepEqual(spec.transitions.map(t => t.kind), ['cut'], path.basename(file)); near(spec.transitions[0].at, 2, FRAME, `${path.basename(file)}: the cut`);
  }
});

test('a variable-rate recording with still frames keeps its cuts: a repeat is a frame no new frame reached, not a frame that looks the same', {skip}, async () => {
  // Nominal 60, about half the frames kept (a screen recording): red with a white flash at 1.0 s, blue from 2.0 s.
  const flashy = path.join(dir, 'screen.mp4');
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=60:d=3', '-vf', `drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='eq(n\\,60)',drawbox=x=0:y=0:w=iw:h=ih:color=blue:t=fill:enable='gte(t\\,2)',select='not(mod(n\\,2))+eq(mod(n\\,13)\\,1)+eq(n\\,60)'`, '-fps_mode', 'vfr', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', flashy]);
  const one = await breakdown(flashy, {out: path.join(dir, 'screen')});
  assert.equal(one.spec.video.variable, true);
  assert.equal(one.spec.flashes.length, 1); near(one.spec.flashes[0].at, 1, 1 / 60, 'the flash');
  assert.deepEqual(one.spec.transitions.map(t => t.kind), ['cut']); near(one.spec.transitions[0].at, 2, 1 / 30, 'the cut');
  assert.equal(one.spec.shots.length, 2);
  // Slides changing every second, nominal 30 with every third frame dropped: all four changes, as the constant-rate copy has.
  const slides = path.join(dir, 'slides.mp4'), steady = path.join(dir, 'slides-steady.mp4'), lum = 'lum=\'40+40*floor(T)\':cb=128:cr=128';
  ffmpeg(['-f', 'lavfi', '-i', `nullsrc=s=320x180:r=30:d=5,geq=${lum}`, '-vf', 'select=\'not(eq(mod(n\\,3)\\,2))\'', '-fps_mode', 'vfr', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', slides]);
  ffmpeg(['-f', 'lavfi', '-i', `nullsrc=s=320x180:r=30:d=5,geq=${lum}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', steady]);
  for (const file of [slides, steady]) {
    const {spec} = await breakdown(file, {out: path.join(dir, path.basename(file) + '-out')});
    assert.deepEqual(spec.transitions.map(t => t.kind), ['cut', 'cut', 'cut', 'cut'], path.basename(file));
    spec.transitions.forEach((t, i) => near(t.at, i + 1, 1 / 30, `${path.basename(file)}: cut ${i + 1}`));
    assert.equal(spec.shots.length, 5);
  }
});

test('an eased (cos²) fade whose last frames sit just under one colour is one fade out: the rules read exact values, never a rounding', {skip}, async () => {
  // A probe that hands over frames made here, so the spread is known exactly: a fixed pattern of ±1 on 40% of the pixels,
  // its amplitude eased (cos²) from 50 grey levels at 1 s down to 2 at 4 s. At 2 the spread is 1.47 — under one colour's
  // 1.5, and 1.5 once rounded to one decimal, which is how the earlier code compared it.
  const n = 100, fps = 25, W = 160, H = 90, pattern = Int8Array.from({length: W * H}, (_, i) => (i * 7919 % 10 < 2 ? 1 : i * 7919 % 10 < 4 ? -1 : 0));
  const amplitude = k => Math.round(2 + 48 * Math.cos(Math.PI / 2 * Math.min(Math.max(k / fps - 1, 0) / 2.7, 1)) ** 2);
  const file = path.join(dir, 'pattern.mp4');
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=gray:s=320x180:r=25:d=4', '-pix_fmt', 'yuv420p', file]);
  const real = ffmpegProbe();
  const probe = {name: 'made', probe: () => ({seconds: n / fps, video: {seconds: n / fps, fps, rate: fps, width: 320, height: 180, rotation: 0, frames: n}, audio: null}),
    async frames(_file, {width, height}, each) {
      assert.deepEqual([width, height], [W, H]);
      for (let k = 0; k < n; k++) { const a = amplitude(k); each(k, Uint8Array.from(pattern, p => 128 + a * p), k); }
      return n;
    }, sound: real.sound};
  const {spec} = await breakdown(file, {out: path.join(dir, 'cos2'), probe});
  assert.deepEqual(spec.transitions.map(t => t.kind), ['fade-out'], JSON.stringify(spec.transitions.map(t => [t.kind, t.at, t.why.rules.flatMap(r => r.checks)])));
  assert.equal(spec.transitions[0].closes, true);
  assert.equal(spec.shots.length, 1, 'no phantom shot at the end');
  const end = spec.transitions[0].why.rules.find(r => r.then === 'fade-out').checks.find(c => c.startsWith('endSpread'));
  assert.match(end, /^endSpread 1\.47\d* < 1\.5 ✓$/, 'the check shows the value it compared');
});

test('beat options are the reader\'s own: handed on untouched; only an error the reader codes BEAT_OPTIONS refuses', {skip}, async () => {
  const seen = [];
  const reader = code => (file, options) => {
    seen.push(options);
    throw Object.assign(new Error(`beatMap: tempo is not an option; the options are bpm, drop, range, ffmpeg`), code ? {code} : {});
  };
  await assert.rejects(breakdown(reference, {out: path.join(dir, 'typed'), beatMap: reader('BEAT_OPTIONS'), beatOptions: {tempo: 120}}),
    /the beat map refused its options: beatMap: tempo is not an option; the options are bpm, drop, range, ffmpeg/);
  assert.deepEqual(seen[0], {tempo: 120, ffmpeg: process.env.FFMPEG_BIN || 'ffmpeg'}, 'handed on as given, with the breakdown\'s FFmpeg');
  const {spec} = await breakdown(reference, {out: path.join(dir, 'untyped'), beatMap: reader(null), beatOptions: {tempo: 120}});
  assert.equal(spec.audio.beats.ran, false, 'any other error is a sound the reader could not read');
  assert.match(spec.audio.beats.why, /^the beat map could not read the sound: beatMap: tempo is not an option/);
});

test('showinfo\'s times are read from its integer pts and time base: exact past 1,000 s and 10,000 s, where FFmpeg 6 rounds pts_time', () => {
  // FFmpeg before 7 prints pts_time with %.6g: six significant digits. Lines as it prints them, at 23.976 and 29.97 fps.
  const g6 = t => String(Number(t.toPrecision(6)));
  for (const [rate, num, den, label] of [[24000 / 1001, 1001, 24000, '23.976'], [30000 / 1001, 1001, 30000, '29.97']]) {
    for (const from of [1000, 10000]) {
      const first = Math.ceil(from * rate), lines = [`[Parsed_showinfo_2 @ 0x1] config in time_base: 1/${den}, frame_rate: ${den}/${num}`];
      for (let n = 0; n < 600; n++) { const pts = (first + n) * num; lines.push(`[Parsed_showinfo_2 @ 0x1] n:${String(n).padStart(4)} pts:${String(pts).padStart(10)} pts_time:${g6(pts / den)} duration:${num}`); }
      const read = showinfoReader(), frames = lines.map(read).filter(Boolean);
      assert.equal(frames.length, 600);
      frames.forEach(({n, time}) => assert.equal(time, (first + n) * num / den, `${label} fps, frame ${n} past ${from} s`));
      // Laid on slots at the file's rate, every frame shows in a slot of its own: none dropped, none repeated.
      const shown = [], slots = onSlots(rate, (slot, grey, source) => { if (slot >= first) shown.push(source); });
      for (const {n, time} of frames) slots.frame(null, time, n);
      slots.end();
      assert.deepEqual(shown, frames.map(f => f.n), `${label} fps past ${from} s: every frame in its own slot`);
      // The six digits alone would not do: they lose frames.
      const rounded = [], loose = onSlots(rate, (slot, grey, source) => { if (slot >= first) rounded.push(source); });
      lines.slice(1).forEach((line, n) => loose.frame(null, Number(/pts_time:(\S+)/.exec(line)[1]), n)); loose.end();
      assert.ok(new Set(rounded).size < 600, `${label} fps past ${from} s: pts_time alone drops frames (${new Set(rounded).size} of 600)`);
    }
  }
});

test('showinfo\'s integer form is exact in any time base: 1/90000 and 1001/30000', () => {
  const read = showinfoReader();
  assert.equal(read('[Parsed_showinfo_0 @ 0x2] config in time_base: 1/90000, frame_rate: 30000/1001'), null);
  assert.deepEqual(read('[Parsed_showinfo_0 @ 0x2] n:100000 pts:300300000 pts_time:3336.67 duration:3003'), {n: 0, time: 300300000 / 90000}, 'the reader\'s own count, from 0');
  assert.equal(read('[Parsed_showinfo_0 @ 0x2] config in time_base: 1001/30000, frame_rate: 30000/1001'), null);
  assert.deepEqual(read('[Parsed_showinfo_0 @ 0x2] n:400000 pts: 400000 pts_time:13346.7 duration:1'), {n: 1, time: 400000 * 1001 / 30000});
  assert.ok(Number.isNaN(read('[Parsed_showinfo_0 @ 0x2] n:400001 pts:NOPTS pts_time:NOPTS duration:1').time), 'a frame without a timestamp has no time');
  assert.equal(read('[h264 @ 0x3] n: 5 pts: 10 pts_time:1'), null, 'only showinfo\'s lines');
});

/**
 * A film of plain shots (`seconds` each, the greys far enough apart to cut) with corner marks over the shots named (from 1):
 * `bug` a channel's mark at the top right, `caption` two lines at the bottom right, `name` a name at the bottom left.
 */
function cornerFilm(label, {seconds, bug = [], caption = [], name = []}) {
  const marks = {bug: [['STORYREEL', 16, 282, 16]], caption: [['Paris', 15, 285, 148], ['1889', 15, 285, 165]], name: [['Ada Lovelace', 14, 41, 147], ['mathematician', 14, 41, 165]]};
  const total = seconds.reduce((a, b) => a + b, 0), starts = seconds.map((_, i) => seconds.slice(0, i).reduce((a, b) => a + b, 0));
  const greys = ['0x282828', '0x6e6e6e', '0x464646', '0x8c8c8c', '0x323232', '0x787878', '0x505050', '0x969696', '0x3c3c3c', '0x828282'];
  const during = shots => shots.map(i => `between(t\\,${starts[i - 1]}\\,${starts[i - 1] + seconds[i - 1] - .02})`).join('+') || '0';
  const inputs = [], overlays = [];
  for (const [kind, shots] of Object.entries({bug, caption, name})) {
    if (!shots.length) continue;
    inputs.push('-loop', '1', '-framerate', '25', '-t', String(total), '-i', drawn(path.join(dir, `${label}-${kind}.png`), {width: 320, height: 180, lines: marks[kind]}));
    overlays.push(during(shots));
  }
  const backs = seconds.map((d, i) => `color=c=${greys[i % greys.length]}:s=320x180:r=25:d=${d}[s${i}]`), file = path.join(dir, `${label}.mp4`);
  let last = 'bg';
  const layers = overlays.map((when, k) => { const out = `l${k}`, line = `[${last}][${k}:v]overlay=enable='${when}'[${out}]`; last = out; return line; });
  ffmpeg([...inputs, '-filter_complex', [...backs, `${seconds.map((_, i) => `[s${i}]`).join('')}concat=n=${seconds.length}:v=1:a=0[bg]`, ...layers, `[${last}]${V}[v]`].join(';'),
    '-map', '[v]', '-t', String(total), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
  return file;
}

/** A film's corner marks as decided: [verdict, shots it stays in] for each, and each shot's lettering. */
async function cornerVerdicts(label, film) {
  const {spec, record} = await breakdown(cornerFilm(label, film), {out: path.join(dir, label)});
  const marks = record.filter(e => e.type === 'condition' && /corner mark \d+ at /.test(e.text)).map(e => (/chose logos\/each~\d+\/logo\.$/.test(e.text) ? 'logo' : 'not-logo'));
  return {shots: spec.shots.length, text: spec.shots.map(x => x.text.verdict), marks, record};
}

test('a corner mark is the film\'s logo when it stays put in 3 shots or more and three quarters of them — the one rule', {skip}, async () => {
  const cases = [
    ['aba', {seconds: [1.5, 1.5, 1.5], caption: [1, 3]}, ['text', 'no-text', 'text'], 'a caption that comes back after a cutaway (2 of 3) is lettering'],
    ['bug3', {seconds: [1.5, 1.5, 1.5], bug: [1, 2, 3], name: [2]}, ['no-text', 'text', 'no-text'], 'a bug in all 3 shots is the logo; a name in one is lettering'],
    ['bug124', {seconds: [1.5, 1.5, 1.5, 1.5], bug: [1, 2, 4]}, ['no-text', 'no-text', 'no-text', 'no-text'], 'a bug in shots 1, 2 and 4 of 4 is the logo'],
    ['caption12', {seconds: [1.5, 1.5, 1.5, 1.5], caption: [1, 2]}, ['text', 'text', 'no-text', 'no-text'], 'a caption over shots 1–2 of 4 is lettering'],
    ['bug8of10', {seconds: Array(10).fill(1), bug: [2, 3, 4, 5, 6, 7, 8, 9]}, Array(10).fill('no-text'), 'a bug missing from the title and the credits (8 of 10) is the logo'],
    ['station', {seconds: [7, 1.5, 1.5], bug: [1, 2, 3]}, ['no-text', 'no-text', 'no-text'], 'a station bug over shots of 7, 1.5 and 1.5 s is the logo'],
  ];
  for (const [label, film, text, what] of cases) {
    const got = await cornerVerdicts(label, film);
    assert.equal(got.shots, film.seconds.length, `${what}: the shots`);
    assert.deepEqual(got.text, text, what);
    const bugs = film.bug?.length ? got.marks.filter(m => m === 'logo').length : 0;
    assert.equal(bugs > 0, Boolean(film.bug?.length), `${what}: ${JSON.stringify(got.marks)}`);
  }
});

test('the logo rule\'s known miss: a name shown in 3 shots of 4 reads as the film\'s logo, and the record says so', {skip}, async () => {
  const got = await cornerVerdicts('lower-third', {seconds: [1.5, 1.5, 1.5, 1.5], caption: [1, 2, 3]});
  assert.deepEqual(got.text, ['no-text', 'no-text', 'no-text', 'no-text'], 'left out as a logo (the known miss)');
  assert.ok(got.record.some(e => e.type === 'condition' && /corner mark \d+ at 0 s: it stays put in a corner of most of the film's shots: the film's logo": shots 3 gte 3 ✓, share 0\.75 gte 0\.75 ✓/.test(e.text)), 'the decision, with its evidence');
});

test('a film of two shots has no logo by the rule: its corner marks are lettering', {skip}, async () => {
  const got = await cornerVerdicts('two', {seconds: [1.5, 1.5], caption: [1, 2]});   // a mark in both shots
  assert.deepEqual(got.text, ['text', 'text']);
  assert.ok(got.marks.length > 0 && got.marks.every(m => m === 'not-logo'), JSON.stringify(got.marks));
});

test('a picture that changes size mid-stream is read on one count: two transport streams joined, and a WebM', {skip}, async () => {
  // 2 s at 320×180 (dark), then 6 s at 640×360 (bright), joined as cat joins them; and the same as a WebM, 2 s and 2 s.
  const small = path.join(dir, 'small.ts'), large = path.join(dir, 'large.ts'), joined = path.join(dir, 'joined.ts');
  ffmpeg(['-f', 'lavfi', '-i', 'nullsrc=s=320x180:r=25:d=2,geq=lum=\'80+20*sin(X/7)\':cb=128:cr=128', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-f', 'mpegts', small]);
  ffmpeg(['-f', 'lavfi', '-i', 'nullsrc=s=640x360:r=25:d=6,geq=lum=\'200+20*sin(X/14)\':cb=128:cr=128', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-f', 'mpegts', large]);
  writeFileSync(joined, Buffer.concat([readFileSync(small), readFileSync(large)]));
  const {spec} = await breakdown(joined, {out: path.join(dir, 'joined')});
  near(spec.video.frames, 200, 2, 'every frame, once');
  assert.deepEqual(spec.transitions.map(t => t.kind), ['cut']); near(spec.transitions[0].at, 2, FRAME, 'the change of picture');
  assert.equal(spec.shots.length, 2); near(spec.shots[1].end, 8, 2 * FRAME, 'the second shot ends with the file');
  // The stills are selected by the same running count: frame 10 is the small dark picture, frame 150 the large bright one.
  const means = new Map();
  await eachStill('ffmpeg', joined, [10, 150], {width: 48, height: 27}, (k, {rgb}) => { means.set(k, rgb.reduce((a, v) => a + v, 0) / rgb.length); });
  assert.ok(means.get(10) < 110 && means.get(150) > 170, `the stills come from both sizes: ${JSON.stringify([...means])}`);
  // A WebM whose size changes mid-stream: FFmpeg rebuilds its filter chain there, and showinfo's own count starts again.
  const [a, b, list, webm] = ['a.webm', 'b.webm', 'webm.txt', 'joined.webm'].map(x => path.join(dir, x));
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x303030:s=320x180:r=25:d=2', '-c:v', 'libvpx', '-b:v', '200k', a]);
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=0xd0d0d0:s=640x360:r=25:d=2', '-c:v', 'libvpx', '-b:v', '200k', b]);
  writeFileSync(list, `file '${a}'\nfile '${b}'\n`);
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', webm]);
  const second = await breakdown(webm, {out: path.join(dir, 'joined-webm')});
  near(second.spec.video.frames, 100, 2, 'the WebM: every frame, once');
  assert.deepEqual(second.spec.transitions.map(t => t.kind), ['cut']); near(second.spec.transitions[0].at, 2, FRAME, 'the WebM: the change of picture');
});

test('showinfo\'s frames are counted by the reader, through a rebuilt filter chain: n starts again at 0, the count runs on', () => {
  const read = showinfoReader(), lines = [
    '[Parsed_showinfo_2 @ 0x1] config in time_base: 1/90000, frame_rate: 25/1',
    '[Parsed_showinfo_2 @ 0x1] n:   0 pts:      0 pts_time:0', '[Parsed_showinfo_2 @ 0x1] n:   1 pts:   3600 pts_time:0.04',
    '[Parsed_showinfo_2 @ 0x2] config in time_base: 1/1000, frame_rate: 25/1',
    '[Parsed_showinfo_2 @ 0x2] n:   0 pts:     80 pts_time:0.08', '[Parsed_showinfo_2 @ 0x2] n:   1 pts:    120 pts_time:0.12'];
  assert.deepEqual(lines.map(read).filter(Boolean), [{n: 0, time: 0}, {n: 1, time: .04}, {n: 2, time: .08}, {n: 3, time: .12}]);
});

test('refusals name the fix', {skip}, async () => {
  await assert.rejects(breakdown(path.join(dir, 'nothing.mp4')), /there is no file at .*nothing\.mp4: give the path of a video/);
  await assert.rejects(breakdown(reference, {output: dir}), /"output" is not an option; the options are out, beatMap, beatOptions, ffmpeg, probe, thresholds/);
  await assert.rejects(breakdown(reference, {beatMap: () => ({bpm: 1, beats: []}), beatOptions: 120}), /beatOptions are the beat map's own options, an object handed on with ffmpeg \(\{bpm: 120\}\), not 120/);
  const notVideo = path.join(dir, 'notes.mp4'); writeFileSync(notVideo, 'not a video');
  await assert.rejects(breakdown(notVideo, {out: path.join(dir, 'notes')}), /ffprobe could not read the file .*notes\.mp4: [\s\S]* — give a video file FFmpeg reads \(try `ffprobe ".*notes\.mp4"` to see why it does not\)/);
  await assert.rejects(breakdown(reference, {thresholds: {cutJmp: 10}}), /"cutJmp" is not a threshold; the thresholds are width, cutJump/);
  await assert.rejects(breakdown(reference, {thresholds: {cutJump: -1}}), /thresholds\.cutJump is a number, 0 or more/);
  await assert.rejects(breakdown(reference, {thresholds: {width: 10.5}}), /thresholds\.width is a whole number, 16 or more, not 10\.5/);
  await assert.rejects(breakdown(reference, {beatMap: 'beats.json'}), /beatMap is a function, beatMap\(audioFile, \{ffmpeg, \.\.\.beatOptions\}\) → \{bpm, beats: \[seconds\], drop\?\}/);
  const tone = path.join(dir, 'tone.m4a');
  ffmpeg(['-f', 'lavfi', '-i', 'sine=d=1', tone]);
  await assert.rejects(breakdown(tone, {out: path.join(dir, 'tone')}), /tone\.m4a has no picture to break down \(it holds no video stream\): give a video/);
  const wrong = await breakdown(reference, {out: path.join(dir, 'wrong'), beatMap: () => ({tempo: 120})}).catch(e => e);
  assert.match(wrong.message, /a beat map answers \{bpm, beats: \[seconds, …\], drop\?: seconds \| null, confidence\?: 0\.\.1, alternatives\?: \[\{bpm, score, beats\?, phaseDoubt\?\}\], verdict\?, sure\?, hits\?: \[seconds, …\]\}; its bpm is beats a minute/);
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
  assert.equal(sound.status, 1); assert.match(sound.stderr, /no picture to break down[\s\S]*The record so far \(1 entry\) stops in "probe"\./);
  assert.equal(sound.stderr.split('no picture to break down').length - 1, 1, 'the error is said once');
});
