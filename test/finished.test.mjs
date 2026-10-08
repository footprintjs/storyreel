// Checks on the finished file (finished.mjs): each check is a strategy over what a probe (the adapter) read,
// so each is tested here on frames and sound made to order — a flash, a blank run, a late cut, a repeated
// frame at a join, a missing voice, drifting captions — and then once on a real render read by FFmpeg.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createCanvas} from '@napi-rs/canvas';
import {captionChunks as chunksOf, captionFile, readCaptions} from 'footprint-narration';
import {compileFilm, evenTimings, paceTimings, renderFilm, makeFilm, cartoonKit, spokenTracks} from '../src/index.mjs';
import {checkVideo, FINISHED_CHECK_NAMES, FINISHED} from '../src/finished.mjs';

const captionChunks = (film, options) => chunksOf(spokenTracks(film), options);

const W = 160, H = 90, fps = 10;
/** A probe that reads frames and sound made to order (grey levels, W×H) instead of a file. */
const fakeProbe = ({frames, audio = null, seconds = frames.length / fps}) => ({
  name: 'fake',
  probe: () => ({seconds, video: {seconds, fps, width: W, height: H, frames: frames.length}, audio: audio ? {seconds: audio.seconds} : null}),
  async frames(_file, _size, each) { frames.forEach((f, i) => each(i, f)); return frames.length; },
  sound: () => audio.samples,
});
const grey = fill => Uint8Array.from({length: W * H}, (_, i) => fill(i % W, Math.floor(i / W)));
const stripes = shift => grey(x => 40 + ((x + shift) % 40) * 4);   // a pattern that moves `shift` pixels
const solid = v => grey(() => v);
const check = (frames, options = {}) => checkVideo({file: 'made.mp4', probe: fakeProbe({frames, ...options.probe}), ...options, probe: fakeProbe({frames, ...options.probe})});

test('a flash frame — unlike both neighbours, which are alike — is found; a cut, a step from one picture to another, is not', async () => {
  const frames = Array.from({length: 30}, (_, i) => (i === 12 ? solid(250) : i < 20 ? stripes(i) : solid(60 + i)));
  const report = await check(frames, {checks: ['flash']});
  assert.deepEqual(report.findings.map(f => [f.check, f.at, f.severity]), [['flash', 1.2, 'problem']]);
  assert.match(report.findings[0].text, /a flash frame at 1.20 s \(frame 12\)/);
  assert.equal(report.ok, false);
});

test('a blank run is worth a look without the film; a run shorter than FINISHED.blankFrames is not', async () => {
  const frames = Array.from({length: 40}, (_, i) => ((i >= 10 && i < 15) || (i >= 30 && i < 32) ? solid(0) : stripes(i)));
  const report = await check(frames, {checks: ['blank']});
  assert.deepEqual(report.findings.map(f => [f.at, f.severity]), [[1, 'look']], `only the ${FINISHED.blankFrames}+ frame run`);
  assert.match(report.findings[0].text, /5 blank frames \(one colour\) from 1.00 s/);
  assert.equal(report.ok, true, 'a look is not a problem');
});

test('the picture and the sound run as long as each other and as the brief', async () => {
  const frames = Array.from({length: 30}, (_, i) => stripes(i));
  const longer = await check(frames, {checks: ['duration'], probe: {audio: {seconds: 4, samples: new Float32Array(1)}}});
  assert.match(longer.findings[0].text, /the sound runs 1.00 s longer than the picture/);
  const brief = await check(frames, {checks: ['duration'], expect: {seconds: 60}});
  assert.match(brief.findings[0].text, /it is 3.0 s; the brief asks for 60 s/);
  assert.equal((await check(frames, {checks: ['duration'], expect: {seconds: 3.5, tolerance: 1}})).findings.length, 0);
});

test('a check that needs what is not given is skipped, saying why; an unknown check refuses', async () => {
  const report = await check([stripes(0), stripes(1)]);
  assert.deepEqual(report.checked, ['duration', 'blank', 'flash']);
  assert.deepEqual(report.skipped.map(s => s.check), ['handovers', 'voice', 'lipsync', 'captions']);
  assert.match(report.skipped.find(s => s.check === 'voice').why, /give the film/);
  await assert.rejects(check([stripes(0)], {checks: ['wobble']}), /"wobble" is not a check; the checks are duration, blank, flash, handovers, voice, lipsync, captions/);
  assert.deepEqual(FINISHED_CHECK_NAMES, ['duration', 'blank', 'flash', 'handovers', 'voice', 'lipsync', 'captions']);
});

// A film with a cut: a red story, a blue world, then a green one entered with a cut.
const storyboard = {title: 'T', scenes: [{id: 'a', narration: 'This is the first world, all in red.'}, {id: 'b', narration: 'Now the second world arrives, all in blue.'}, {id: 'c', narration: 'And a third world comes after it.'}]};
const world = (name, color) => ({name, story: {compile: () => ({hang: 1, spotAt: () => null, sounds: [], draw: c => { c.fillStyle = color; c.fillRect(0, 0, 1600, 900); }})}});
const film = await compileFilm({storyboard, timings: evenTimings(storyboard), kits: [world('red', '#f00'), world('blue', '#00f'), world('green', '#0f0')],
  recipe: {story: {kit: 'red'}, stages: [{type: 'world', scene: 'b', world: {kit: 'blue'}}, {type: 'world', scene: 'c', enter: 'cut', world: {kit: 'green'}}]}});
/** The film's frame at t, grey, W×H: what a probe would read from a perfect render. */
const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
const drawn = (f, t) => { ctx.resetTransform(); ctx.clearRect(0, 0, W, H); ctx.scale(W / 1600, H / 900); f.frame(ctx, Math.max(0, Math.min(f.total, t))); const d = ctx.getImageData(0, 0, W, H).data; return Uint8Array.from({length: W * H}, (_, i) => Math.round(.299 * d[4 * i] + .587 * d[4 * i + 1] + .114 * d[4 * i + 2])); };

test('with the film: a cut that lands a frame late is found; one that lands on its frame is not', async () => {
  const n = Math.ceil(film.total * fps), cut = Math.ceil(film.clock.start('c') * fps - 1e-6);
  const right = Array.from({length: n}, (_, f) => drawn(film, f / fps)), late = right.map((g, f) => (f === cut ? right[cut - 1] : g));
  assert.equal((await check(right, {film, checks: ['handovers']})).findings.length, 0);
  const report = await check(late, {film, checks: ['handovers']});
  assert.equal(report.findings.length, 1); assert.match(report.findings[0].text, /the cut into stages\[1\] lands 1 frame late/);
});

test('with the film: a frame repeated where two segments join is found, while the picture moves', async () => {
  // A film that moves all the time: stripes drifting across the frame.
  const moving = {total: 4, rows: [], timings: {scenes: []}, clock: {offsets: [], words: () => [], shownWords: () => []},
    frame(c, t) { for (let x = 0; x < 1600; x += 100) { c.fillStyle = (x / 100) % 2 ? '#222' : '#ddd'; c.fillRect((x + t * 300) % 1600, 0, 100, 900); } }};
  const frames = Array.from({length: 40}, (_, f) => drawn(moving, f / fps)), join = 20;
  assert.equal((await check(frames, {film: moving, joins: [join], checks: ['handovers']})).findings.length, 0);
  const repeated = frames.map((g, f) => (f === join ? frames[join - 1] : g));
  const report = await check(repeated, {film: moving, joins: [join], checks: ['handovers']});
  assert.match(report.findings[0]?.text ?? '', /a frame repeats where two segments join \(frame 20/);
});

test('the voice is there when the render has one: silence where the film says words is a problem', async () => {
  const frames = Array.from({length: Math.ceil(film.total * fps)}, (_, f) => drawn(film, f / fps)), rate = 16000, n = Math.ceil(film.total * rate);
  const silent = await check(frames, {film, voiced: true, checks: ['voice'], probe: {audio: {seconds: film.total, samples: new Float32Array(n)}}});
  assert.equal(silent.findings.length, 3, 'all three scenes'); assert.match(silent.findings[0].text, /the voice is not there in scene a: 8 of 8 words are quieter than -50 dBFS/);
  const speech = Float32Array.from({length: n}, (_, i) => .2 * Math.sin(i / 3));
  assert.equal((await check(frames, {film, voiced: true, checks: ['voice'], probe: {audio: {seconds: film.total, samples: speech}}})).findings.length, 0);
  assert.match((await check(frames, {film, voiced: true, checks: ['voice']})).findings[0].text, /the film has words and the file has no sound/);
  assert.deepEqual((await check(frames, {film, checks: ['voice']})).skipped, [{check: 'voice', why: 'the render has no voice (voiced: true when it does)'}]);
});

test('captions: in order, inside the picture, and each starting with its first word', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'storyreel-cap-')), file = (name, text) => { const p = path.join(dir, name); writeFileSync(p, text); return p; };
  const frames = Array.from({length: Math.ceil(film.total * fps)}, (_, f) => drawn(film, f / fps)), chunks = captionChunks(film);
  const right = file('right.srt', captionFile(chunks, 'srt'));
  assert.equal((await check(frames, {film, captions: right, checks: ['captions']})).findings.length, 0, 'made from the film: no drift');
  const late = await check(frames, {film, captions: file('late.vtt', captionFile(chunks, 'vtt', {offset: .8})), checks: ['captions']});
  assert.ok(late.findings.some(f => /starts 0.80 s after its first word is said/.test(f.text)), late.findings.map(f => f.text).join(' | '));
  assert.ok(late.findings.some(f => /the last caption ends at [\d.]+ s, after the picture/.test(f.text)), 'shifted late, the last one also outlasts the picture');
  const bad = file('bad.srt', '1\n00:00:01,000 --> 00:00:03,000\nOne\n\n2\n00:00:02,500 --> 00:00:04,000\nTwo\n\n3\n00:01:00,000 --> 00:01:02,000\nLate\n');
  const texts = (await check(frames, {captions: bad, checks: ['captions']})).findings.map(f => f.text);
  assert.ok(texts.some(t => /caption 2 starts before caption 1 ends/.test(t)) && texts.some(t => /the last caption ends at 62.00 s, after the picture/.test(t)), texts.join(' | '));
  assert.deepEqual(readCaptions('WEBVTT\n\n00:01.500 --> 00:02.000 align:start\nHi there\n'), [{start: 1.5, end: 2, text: 'Hi there'}]);
});

const has = cmd => !spawnSync(cmd, ['-version']).error;
test('on a real render, read by FFmpeg: every frame is there, the checks pass, and a frame burned white is found', {skip: has('ffmpeg') && has('ffprobe') ? false : 'needs ffmpeg and ffprobe'}, async () => {
  const dir = fileURLToPath(new URL('../examples/worlds/', import.meta.url)), read = f => JSON.parse(readFileSync(dir + f, 'utf8'));
  const board = read('storyboard.json'), timings = paceTimings(board, evenTimings(board, {tail: .8}), read('pacing.json')), recipe = read('recipe.json');
  const worlds = await compileFilm({storyboard: board, timings, recipe, kits: [cartoonKit], root: dir, strings: read('strings/en.json')});
  const top = mkdtempSync(path.join(tmpdir(), 'storyreel-finished-'));
  const made = await renderFilm({film: worlds, storyboard: board, timings, out: path.join(top, 'film.mp4'), width: 320, height: 180, fps, captionFiles: ['srt']});
  const report = await checkVideo({file: made.out, film: worlds, captions: made.captions.srt});
  assert.equal(report.frames, Math.ceil(worlds.total * fps), 'the mux keeps every frame (FFmpeg\'s -shortest used to drop the last few)');
  assert.deepEqual(report.findings, []); assert.equal(report.ok, true);
  const broken = path.join(top, 'broken.mp4');
  spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', made.out, '-vf', "drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='eq(n,123)'", '-c:a', 'copy', broken]);
  const found = await checkVideo({file: broken, film: worlds, checks: ['flash']});
  assert.deepEqual(found.findings.map(f => f.at), [12.3]);
});

test('makeFilm checks the finished file when asked: the record lists what was found; refuse turns a problem into a refusal', {skip: has('ffmpeg') && has('ffprobe') ? false : 'needs ffmpeg and ffprobe'}, async () => {
  const dir = fileURLToPath(new URL('../examples/hello/', import.meta.url)), read = f => JSON.parse(readFileSync(dir + f, 'utf8'));
  const board = read('storyboard.json'), recipe = read('recipe.json'), timings = evenTimings(board, {tail: 4}), top = mkdtempSync(path.join(tmpdir(), 'storyreel-finished-'));
  const made = await makeFilm({storyboard: board, recipe, root: dir, timings, out: path.join(top, 'a', 'film.mp4'), render: {width: 320, height: 180, fps}, check: 'report'});
  const record = JSON.parse(readFileSync(made.makingOf, 'utf8'));
  assert.equal(record.finished.ok, true); assert.deepEqual(record.finished.checked, ['duration', 'blank', 'flash', 'handovers']);
  assert.ok(record.pipeline.some(e => /check-finished/.test(e.text ?? e.stageName ?? JSON.stringify(e))), 'a stage of its own in the run');
  await assert.rejects(makeFilm({storyboard: board, recipe, root: dir, timings, out: path.join(top, 'b', 'film.mp4'), render: {width: 320, height: 180, fps}, check: 'refuse', expect: {seconds: 10}}), /The finished file has 1 problem \(check: 'refuse'\): duration: it is [\d.]+ s; the brief asks for 10 s/);
  await assert.rejects(makeFilm({storyboard: board, recipe, root: dir, timings, out: path.join(top, 'c', 'film.mp4'), check: 'always'}), /check is 'report'/);
});

// Lips in sync: a robot that speaks two scenes, drawn by a kit that says where its mouth is.
import {mouthAt} from '../src/acting.mjs';
const talking = {scenes: [{id: 'a', speaker: 'robot', narration: 'Hello there, I am the robot, and I will tell you how the frame is drawn every time the screen asks for one.'},
  {id: 'b', speaker: 'robot', narration: 'First the work, then the paint, then the picture, and then it waits for the next turn of the loop again.'}]};
const mouthKit = (shut = false) => ({name: 'mouths', story: {compile: (spec, clock) => ({hang: 1, draw: c => { c.fillStyle = '#334'; c.fillRect(0, 0, 1600, 900); },
  mouthsAt: t => [{who: 'robot', open: shut ? 0 : mouthAt(clock, t, 'robot')}]})}});
const talker = async (shut = false) => compileFilm({storyboard: talking, timings: evenTimings(talking), kits: [mouthKit(shut)], recipe: {story: {kit: 'mouths'}}});
/** A voice made from the mouth itself, `shift` seconds late (negative: early), silent over [quiet0, quiet1). */
const voiceOf = (f, {shift = 0, quiet = [0, 0]} = {}) => { const rate = 16000; return Float32Array.from({length: Math.ceil(f.total * rate)}, (_, i) => { const t = i / rate; return t >= quiet[0] && t < quiet[1] ? 0 : .3 * mouthAt(f.clock, t - shift, 'robot') * Math.sin(2 * Math.PI * 200 * t); }); };
const lips = async (f, samples) => (await check([solid(50)], {film: f, voiced: true, checks: ['lipsync'], probe: {seconds: f.total, audio: {seconds: f.total, samples}}})).findings.map(x => x.text);

test('lip sync: a mouth on its voice passes; one the sound runs late or early beyond what the eye forgives is found', async () => {
  const f = await talker();
  assert.equal(typeof f.mouthsAt, 'function'); assert.deepEqual(f.mouthsAt(f.clock.words('a')[2].start + .05).map(m => m.who), ['robot']);
  assert.deepEqual(await lips(f, voiceOf(f)), [], 'in sync');
  const [late] = await lips(f, voiceOf(f, {shift: .25}));
  assert.match(late ?? '', /robot's mouth leads the voice by (2[3-6]\d) ms \(the eye notices sound more than 125 ms behind\)/);
  const [early] = await lips(f, voiceOf(f, {shift: -.1}));
  assert.match(early ?? '', /robot's mouth trails the voice by (\d{2,3}) ms \(the eye notices sound more than 45 ms ahead\)/);
  assert.deepEqual(await lips(f, voiceOf(f, {shift: .03})), [], 'a frame off is forgiven');
});

test('lip sync: a mouth moving while nothing is heard, and a voice heard from a shut mouth, are found', async () => {
  const f = await talker(), words = f.clock.words('b');
  const quiet = await lips(f, voiceOf(f, {quiet: [words[3].start, words[6].end]}));
  assert.ok(quiet.some(t => /robot's mouth moves for [\d.]+ s at [\d.]+ s while nothing is heard/.test(t)), quiet.join(' | '));
  const shut = await talker(true);
  const [heard] = await lips(shut, voiceOf(f));
  assert.match(heard ?? '', /robot is heard saying \d+ words with the mouth shut \(from "Hello" at/);
});

test('mouthAt: open only while its owner says a word, once a syllable or so; never for someone else', async () => {
  const f = await talker(), w = f.clock.words('a')[0], mid = (w.start + w.end) / 2;
  assert.ok(mouthAt(f.clock, mid, 'robot') >= 0 && mouthAt(f.clock, mid, 'robot') <= 1);
  assert.equal(mouthAt(f.clock, mid, 'person'), 0, 'not this one\'s word');
  assert.equal(mouthAt(f.clock, f.total + 1, 'robot'), 0, 'between words or after them, shut');
  assert.throws(() => mouthAt(f.clock, mid, 'robot', {syllable: 0}), /syllable is the seconds of one open-and-close/);
});

test('lip sync: a mouth that closes a tenth of a second late is worth a look; longer is a problem', async () => {
  const f = await talker(), w = f.clock.words('b')[5];
  // Silence the last part of one word: the mouth keeps moving that long with nothing heard.
  const tail = async seconds => (await check([solid(50)], {film: f, voiced: true, checks: ['lipsync'], probe: {seconds: f.total, audio: {seconds: f.total, samples: voiceOf(f, {quiet: [w.end - seconds, w.end]})}}})).findings;
  const short = await tail(.12);
  assert.ok(short.length === 0 || short.every(x => x.severity === 'look'), short.map(x => x.text).join(' | '));
  const long = await tail(.3);
  assert.ok(long.some(x => x.severity === 'problem' && /moves for [\d.]+ s/.test(x.text)), long.map(x => `${x.severity}: ${x.text}`).join(' | '));
});

// Review 2026-10-02 (features 7–9): the part rendered, an intro, exact cut frames, silent scenes, two speakers, honest skips.
/** Frames exactly as the encoder makes them: the intro's (round(intro × fps), here black), then the film at from + f / fps. */
const encoded = (f, {fps: rate = fps, from = 0, to = f.total, intro = 0} = {}) => [
  ...Array.from({length: Math.round(intro * rate)}, () => solid(0)),
  ...Array.from({length: Math.ceil((to - from) * rate)}, (_, k) => drawn(f, from + k / rate))];
const probeOf = (frames, rate, audio = null) => ({name: 'fake', probe: () => ({seconds: frames.length / rate, video: {seconds: frames.length / rate, fps: rate, width: W, height: H, frames: frames.length}, audio}),
  async frames(_f, _s, each) { frames.forEach((g, i) => each(i, g)); return frames.length; }, sound: () => audio.samples});

test('a cut is expected where the encoder shows it, to the last bit of the clock (no false "a frame late")', async () => {
  const board = {scenes: [{id: 'a', narration: 'One two three.'}, {id: 'b', narration: 'Four five six seven eight.'}, {id: 'c', narration: 'Nine ten.'}]};
  const kits3 = [world('red', '#ff0000'), world('blue', '#0000ff'), world('green', '#00ff00')];
  const f = await compileFilm({storyboard: board, timings: evenTimings(board, {tail: .5}), kits: kits3, recipe: {story: {kit: 'red'}, stages: [{type: 'world', scene: 'b', enter: 'cut', world: {kit: 'blue'}}, {type: 'world', scene: 'c', enter: 'cut', world: {kit: 'green'}}]}});
  for (const rate of [24, 25, 30]) {
    const frames = encoded(f, {fps: rate});
    assert.deepEqual((await checkVideo({file: 'x.mp4', film: f, checks: ['handovers'], probe: probeOf(frames, rate)})).findings, [], `at ${rate} fps`);
  }
});

test('an intro is the caller\'s drawing: a black opening is not a blank film, and the cuts and words after it line up', async () => {
  const frames = encoded(film, {intro: 2.01});
  const report = await checkVideo({file: 'x.mp4', film, intro: 2.01, checks: ['duration', 'blank', 'flash', 'handovers'], probe: probeOf(frames, fps)});
  assert.deepEqual(report.findings, []);
});

test('a part of the film (from, to) is checked as the part: its length, its cuts, its words', async () => {
  const from = 3, to = 9, frames = encoded(film, {from, to});
  const report = await checkVideo({file: 'x.mp4', film, from, to, checks: ['duration', 'blank', 'flash', 'handovers'], probe: probeOf(frames, fps)});
  assert.deepEqual(report.findings, []);
  const whole = await checkVideo({file: 'x.mp4', film, checks: ['duration'], probe: probeOf(frames, fps)});
  assert.match(whole.findings[0]?.text ?? '', /the picture is 6.00 s; the film is [\d.]+ s/, 'without from/to the same file is the whole film, and too short');
  await assert.rejects(checkVideo({file: 'x.mp4', film, from: 5, to: 2, probe: probeOf(frames, fps)}), /to is where the part ends on the film's clock, after from/);
});

test('captions around a silent scene: its directions are never captioned, so they never count as words', async () => {
  const board = {scenes: [{id: 'a', narration: 'The sheep go out in the morning.'}, {id: 'gate', silent: [['The gate opens slowly', 1.5]]}, {id: 'b', narration: 'The shepherd counts the pebbles.'}]};
  const f = await compileFilm({storyboard: board, timings: evenTimings(board), recipe: {story: {kit: 'whiteboard', items: []}}});
  const dir = mkdtempSync(path.join(tmpdir(), 'storyreel-cap-')), cues = path.join(dir, 'c.srt');
  writeFileSync(cues, captionFile(captionChunks(f), 'srt'));
  const frames = encoded(f);
  assert.deepEqual((await checkVideo({file: 'x.mp4', film: f, captions: cues, checks: ['captions'], probe: probeOf(frames, fps)})).findings, []);
});

test('lip sync with two speakers and a narrator: each mouth is lined up around its own words', async () => {
  const board = {scenes: [{id: 'n', narration: 'Once upon a time, two friends met at the shop and had a long talk.'},
    {id: 'r', speaker: 'robot', narration: 'Hello there, I am the robot, and I will tell you how the frame is drawn every time.'},
    {id: 'g', speaker: 'girl', narration: 'Thank you robot, that was a very good story about the loop and the screen.'}]};
  const kit = {name: 'two', story: {compile: (spec, clock) => ({hang: 1, draw: c => { c.fillStyle = '#334'; c.fillRect(0, 0, 1600, 900); },
    mouthsAt: t => [{who: 'robot', open: mouthAt(clock, t, 'robot')}, {who: 'girl', open: mouthAt(clock, t, 'girl')}]})}};
  const f = await compileFilm({storyboard: board, timings: evenTimings(board), kits: [kit], recipe: {story: {kit: 'two'}}});
  const rate = 16000, voice = shift => Float32Array.from({length: Math.ceil(f.total * rate)}, (_, i) => { const t = i / rate;
    return .3 * Math.max(mouthAt(f.clock, t - shift, 'robot'), mouthAt(f.clock, t - shift, 'girl'), mouthAt(f.clock, t - shift, null)) * Math.sin(2 * Math.PI * 200 * t); });
  const lips2 = async shift => (await checkVideo({file: 'x.mp4', film: f, voiced: true, checks: ['lipsync'], probe: probeOf([solid(50)], fps, {seconds: f.total, samples: voice(shift)})})).findings.map(x => x.text);
  assert.deepEqual(await lips2(0), []);
  const late = await lips2(.25);
  assert.ok(late.some(t => /robot's mouth leads the voice/.test(t)) && late.some(t => /girl's mouth leads the voice/.test(t)), late.join(' | '));
});

test('lip sync is skipped, saying why, when no kit on screen draws a mouth; the sound is read at 16 kHz', async () => {
  let asked = null;
  const p = {...probeOf([solid(50)], fps, {seconds: film.total, samples: new Float32Array(16000)}), sound: (_f, {rate}) => { asked = rate; return new Float32Array(Math.ceil(film.total * rate)); }};
  const report = await checkVideo({file: 'x.mp4', film, voiced: true, checks: ['lipsync'], probe: p});
  assert.deepEqual(report.checked, []); assert.deepEqual(report.skipped, [{check: 'lipsync', why: 'no kit on screen draws a mouth (a world\'s mouthsAt)'}]);
  assert.equal(asked, 16000, 'an /s/ lives above 4 kHz');
});

test('the probe finds ffprobe beside the FFmpeg it is given, or on the PATH', {skip: has('ffmpeg') && has('ffprobe') ? false : 'needs ffmpeg and ffprobe'}, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'storyreel-ffmpeg-')), real = spawnSync('which', ['ffmpeg'], {encoding: 'utf8'}).stdout.trim();
  spawnSync('ln', ['-s', real, path.join(dir, 'ffmpeg')]);   // a folder holding only ffmpeg, as ffmpeg-static ships it
  const {ffmpegProbe} = await import('../src/finished.mjs');
  const clip = path.join(dir, 'clip.mp4');
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=160x90:d=1', '-pix_fmt', 'yuv420p', clip]);
  assert.equal(ffmpegProbe({ffmpeg: path.join(dir, 'ffmpeg')}).probe(clip).video.width, 160);
});

test('makeFilm checks a part as the part, and a check that cannot read the file is reported, not thrown, unless it must refuse', {skip: has('ffmpeg') && has('ffprobe') ? false : 'needs ffmpeg and ffprobe'}, async () => {
  const dir = fileURLToPath(new URL('../examples/hello/', import.meta.url)), read = f => JSON.parse(readFileSync(dir + f, 'utf8'));
  const board = read('storyboard.json'), recipe = read('recipe.json'), timings = evenTimings(board, {tail: 4}), top = mkdtempSync(path.join(tmpdir(), 'storyreel-part-'));
  const part = await makeFilm({storyboard: board, recipe, root: dir, timings, out: path.join(top, 'part', 'film.mp4'), render: {width: 160, height: 90, fps, from: 5, to: 15}, check: 'refuse'});
  assert.equal(JSON.parse(readFileSync(part.makingOf, 'utf8')).finished.ok, true, 'a part is checked as the part');
  const was = process.env.FFPROBE_BIN; process.env.FFPROBE_BIN = '/no/such/ffprobe';
  try {
    const made = await makeFilm({storyboard: board, recipe, root: dir, timings, out: path.join(top, 'r', 'film.mp4'), render: {width: 160, height: 90, fps}, check: 'report'});
    const finished = JSON.parse(readFileSync(made.makingOf, 'utf8')).finished;
    assert.equal(finished.ok, null); assert.match(finished.error, /ffprobe could not read the file/);
    await assert.rejects(makeFilm({storyboard: board, recipe, root: dir, timings, out: path.join(top, 'x', 'film.mp4'), render: {width: 160, height: 90, fps}, check: 'refuse'}), /The finished file could not be checked \(check: 'refuse'\)/);
  } finally { if (was === undefined) delete process.env.FFPROBE_BIN; else process.env.FFPROBE_BIN = was; }
});
