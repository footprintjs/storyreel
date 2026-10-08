import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, existsSync, readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import {compileFilm, evenTimings, renderFilm, makeFilm} from '../src/index.mjs';
import {captionChunks as chunksOf, captionAt, captionFile, FILE_CHUNKS} from 'footprint-narration';
import {spokenTracks} from '../src/captions.mjs';

/** A film's caption chunks: footprint-narration's chunker over the film's spoken tracks. */
const captionChunks = (film, options) => chunksOf(spokenTracks(film), options);
import {compileLayout, cropWindow, formatOf, FORMAT_NAMES} from '../src/layout.mjs';
import {makePainter, readMotionBlur, readCaptionFiles, partWindow, partTimeline, timelineText, prepareRender} from '../src/render.mjs';

// A silent opening, then two spoken scenes; a world that is red with a white square sliding fast.
const storyboard = {title: 'Formats', scenes: [
  {id: 'open', silent: [['the door opens', 1.0], ['she walks in', 1.5]]},
  {id: 'talk', narration: 'Two searches. Both find nothing, so what do they mean? Not always the same thing.'},
  {id: 'end', narration: 'Come to the talk to see how.'},
]};
const slide = {name: 'slide', story: {compile: () => ({hang: 1, draw: (c, t) => { c.fillStyle = '#ff0000'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#ffffff'; c.fillRect(300 + (t % 2) * 400, 400, 100, 100); }})}};
const recipe = {story: {kit: 'slide'}};
const film = await compileFilm({storyboard, timings: evenTimings(storyboard), recipe, kits: [slide]});
const at = (scene, phrase) => film.clock.at([scene, phrase]);
const text = c => c.words.map(w => w.text).join(' ');

test('captions: the spoken words in short chunks, broken after punctuation; a silent scene is never captioned', () => {
  const chunks = captionChunks(film, {maxWords: 4});
  assert.ok(chunks.every(c => c.words.length <= 5), 'at most maxWords words a chunk (one more only to finish a clause)');
  assert.ok(chunks.every(c => c.start >= film.clock.end('open')), 'nothing from the silent scene (its directions are not spoken)');
  assert.deepEqual(chunks.map(text), ['Two searches.', 'Both find nothing,', 'so what do they mean?', 'Not always the same thing.', 'Come to the talk', 'to see how.'],
    'a clause-ending word joins a full chunk instead of standing alone');
  chunks.forEach((c, i) => { if (chunks[i + 1]) assert.ok(c.end <= chunks[i + 1].start + 1e-9, 'chunks never overlap'); });
  // A file's cues: whole sentences, never more characters than two lines hold.
  assert.deepEqual(captionChunks(film, FILE_CHUNKS).map(text), ['Two searches.', 'Both find nothing, so what do they mean?', 'Not always the same thing.', 'Come to the talk to see how.']);
  assert.deepEqual(captionChunks(film, {maxWords: 20, maxChars: 20, breaks: 'sentence'}).map(text).slice(1, 3), ['Both find nothing,', 'so what do they'], 'maxChars closes a chunk before the word that would not fit');
  assert.throws(() => captionChunks(film, {maxWords: 0}), /maxWords must be a whole number 1–20/);
  assert.throws(() => captionChunks(film, {maxChars: 5}), /maxChars must be a whole number of at least 12/);
  assert.throws(() => captionChunks(film, {breaks: 'comma'}), /breaks must be 'clause' or 'sentence'/);
});

test('captions: the word being said is the active one', () => {
  const chunks = captionChunks(film), c = captionAt(chunks, at('talk', 'searches') + .01);
  assert.equal(c.words[c.active].text, 'searches.');
  assert.equal(captionAt(chunks, film.clock.start('open') + .5), null, 'no caption over the silent opening');
});

test('caption files: WebVTT and SRT, on the video\'s clock, two lines at most', () => {
  const w = (t, start, end) => ({text: t, start, end});
  const chunks = [{start: 1, end: 2.5, words: [w('Two', 1, 1.4), w('searches.', 1.4, 2.1)]},
    {start: 2.5, end: 4.25, words: 'Both find nothing, so what do they mean, really, in the end?'.split(' ').map((t, i) => w(t, 2.5 + i * .1, 2.6 + i * .1))}];
  assert.equal(captionFile(chunks, 'vtt'), 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.500\nTwo searches.\n\n2\n00:00:02.500 --> 00:00:04.250\nBoth find nothing, so what do\nthey mean, really, in the end?\n');
  assert.equal(captionFile(chunks, 'srt', {offset: 3600 - 1}), '1\n01:00:00,000 --> 01:00:01,500\nTwo searches.\n\n2\n01:00:01,500 --> 01:00:03,250\nBoth find nothing, so what do\nthey mean, really, in the end?\n');
  assert.equal(captionFile(chunks, 'srt', {from: 2, to: 3, offset: -2}), '1\n00:00:00,000 --> 00:00:00,500\nTwo searches.\n\n2\n00:00:00,500 --> 00:00:01,000\nBoth find nothing, so what do\nthey mean, really, in the end?\n', 'a partial render keeps the cues it covers, cut at its edges');
  assert.throws(() => captionFile(chunks, 'ass'), /kind must be 'vtt' or 'srt'/);
  assert.deepEqual(readCaptionFiles(true), ['vtt', 'srt']); assert.deepEqual(readCaptionFiles(['srt']), ['srt']); assert.deepEqual(readCaptionFiles(false), []);
  assert.throws(() => readCaptionFiles(['vtt', 'vtt']), /captionFiles must be true or a list of 'vtt' and\/or 'srt'/);
});

test('layouts: four formats with their sizes; the bands take the film\'s paper; refusals name the fix', () => {
  assert.deepEqual(FORMAT_NAMES, ['landscape', 'square', 'portrait', 'vertical']);
  const sizes = Object.fromEntries(FORMAT_NAMES.map(f => [f, (({width, height}) => [width, height])(compileLayout(film, {format: f}))]));
  assert.deepEqual(sizes, {landscape: [1920, 1080], square: [1080, 1080], portrait: [1080, 1350], vertical: [1080, 1920]});
  const v = compileLayout(film, {format: 'vertical', header: {title: 'T'}, captions: {size: 60, box: [100, 1300, 880, 160]}});
  assert.deepEqual(v.boxes, {film: [0, 480, 1080, 810], header: [100, 285, 880, 185], captions: [100, 1300, 880, 160]});
  formatOf('square').film[0] = 99; assert.equal(formatOf('square').film[0], 0, 'formatOf hands out a copy');
  const bad = (spec, re) => assert.throws(() => compileLayout(film, spec), re);
  bad({format: 'tiktok'}, /layout.format must be landscape, square, portrait, vertical/);
  bad({format: 'vertical', music: 1}, /unsupported key music/);
  bad({format: 'landscape', header: {title: 'Hi'}}, /has no title band/);
  bad({format: 'square', crop: []}, /a crop applies to portrait and vertical/);
  bad({format: 'vertical', crop: [{at: ['talk', 'Two searches'], x: 2000}]}, /0–1600/);
  bad({format: 'vertical', crop: [{at: ['end', 'Come'], x: 500}, {at: ['talk', 'Two'], x: 900}]}, /in the order they are spoken/);
  bad({format: 'vertical', crop: [null]}, /layout.crop\[0\] must be \{at: beat, x, width\?\}/);
  bad({format: 'vertical', crop: [{at: ['talk', 'Two searches'], x: 800, width: 2000}]}, /layout.crop\[0\].width must be 400–1600 \(how much of the frame's width the crop shows; 1200 is the format's\)/);
  bad({format: 'vertical', crop: [{at: ['talk', 'Two searches'], x: 800, zoom: 2}]}, /unsupported key zoom \(a crop key is \{at, x, width\?\}\)/);
  bad({format: 'vertical', header: {sub: 'no title'}}, /header must be \{title, sub\?, box\?\} with words in the title, or false/);
  assert.equal(compileLayout(film, {format: 'landscape', header: false, captions: false}).boxes.header, undefined, 'false is no band, for a header as for captions');
  bad({format: 'vertical', header: {title: 'T', subtitle: 'x'}}, /layout.header has unsupported key subtitle/);
  bad({format: 'vertical', header: {title: 'T', sub: 3}}, /layout.header.sub must be words/);
  bad({format: 'vertical', captions: 'yes'}, /captions must be true or \{maxWords\?, size\?, box\?\}/);
  bad({format: 'vertical', captions: {font: 'x'}}, /layout.captions has unsupported key font/);
  bad({format: 'vertical', captions: {size: 8}}, /captions.size must be 24–120/);
  bad({format: 'vertical', captions: {maxWords: 30}}, /maxWords must be a whole number 1–20/);
  bad({format: 'vertical', captions: {box: [0, 1800, 1080, 200]}}, /captions.box must be \[x, y, width, height\] inside the 1080×1920 picture/);
  bad({format: 'square', background: 12}, /layout.background must be a colour/);
});

test('a layout at a scale draws the same picture larger: 2 makes landscape 3840×2160 (4K); the sizes stay whole and even', () => {
  const big = compileLayout(film, {format: 'landscape', captions: true, scale: 2});
  assert.deepEqual([big.width, big.height], [3840, 2160]);
  assert.deepEqual(big.boxes, {film: [0, 0, 3840, 2160], captions: [320, 1720, 3200, 320]}, 'the boxes in output pixels');
  const c = createCanvas(3840, 2160), ctx = c.getContext('2d'); big.picture(ctx, 0);
  const px = (x, y) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3).join(',');
  assert.equal(px(3839, 2159), '255,0,0', 'the film fills the larger picture to its far corner');
  assert.equal(px(840, 1080), '255,255,255', 'and every thing in it is where it was, twice as far from the corner (the square at 300, 400 on the 1600-wide frame)');
  assert.deepEqual((({width, height}) => [width, height])(compileLayout(film, {format: 'vertical', scale: 1.5})), [1620, 2880]);
  assert.deepEqual((({width, height}) => [width, height])(compileLayout(film, {format: 'landscape', scale: .5})), [960, 540], 'a half-size draft');
  for (const scale of [3, .25, 1.0001, '2']) assert.throws(() => compileLayout(film, {format: 'landscape', scale}), /layout\.scale must be 0\.5–2 and keep the landscape size whole and even \(1920×1080 at 1; 2 makes 3840×2160, 4K\)/);
});

test('a part with its handles: the scenes asked for and a moment of the film either side; refusals name the fix', () => {
  assert.deepEqual(partWindow(film, {scene: 'talk', handles: 1}), {from: +(film.clock.start('talk') - 1).toFixed(3), to: +(film.clock.end('talk') + 1).toFixed(3)});
  assert.equal(partWindow(film, {scenes: ['open']}).from, 0, 'never before the film starts');
  assert.equal(partWindow(film, {scenes: ['talk', 'end'], handles: 5}).to, film.total, 'nor after it ends');
  const late = {timings: {scenes: [{id: 'a'}, {id: 'c'}]}, total: 21.299999999999997, clock: {start: id => ({a: 0, c: 14.2})[id], end: id => ({a: 14.2, c: 21.299999999999997})[id]}};
  assert.equal(partWindow(late, {scene: 'c'}).to, late.total, 'an end between two milliseconds stays the end: rounded first, then held to the film (21.3 is past it)');
  assert.throws(() => partWindow(film, {scene: 'middle'}), /no scene called "middle" \(the scenes are open, talk, end\)/);
  assert.throws(() => partWindow(film, {scene: 'talk', handles: 20}), /handles is the seconds shown before and after the part/);
  assert.throws(() => prepareRender({film, part: {scene: 'talk'}, from: 0}), /a part or from\/to, not both/);
});

test('a part\'s timeline: the scenes and beats in it as text, on the part\'s own clock, each once', () => {
  const said = ['b', 'the network does the waiting'], fake = {timings: {scenes: [{id: 'a', duration: 5}, {id: 'b', duration: 5}]}, clock: {offsets: [0, 5]}, total: 10,
    beats: [{ref: said, t: 6.2, path: 'stages[1].world.beats.waiting'}, {ref: said, t: 6.2, path: 'stages[1].world.beats.waiting'}, {ref: ['a', 'early'], t: 1, path: null}]};
  const rows = partTimeline(fake, {from: 3.5, to: 10});
  assert.deepEqual(rows, [{t: 1.5, kind: 'scene', scene: 'b'}, {t: 2.7, kind: 'beat', scene: 'b', phrase: 'the network does the waiting', entry: 'stages[1].world.beats.waiting'}]);
  assert.equal(timelineText(rows), '1.50  ── b\n2.70  "the network does the waiting" → stages[1].world.beats.waiting');
});

test('a quick look at one part: its scenes with handles, at half size, in the draft encode', {skip: spawnSync('ffmpeg', ['-version']).error ? 'needs ffmpeg' : false}, async () => {
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'storyreel-part-')), 'part.mp4'), part = {scene: 'talk', handles: 1};
  const r = await renderFilm({film, storyboard, timings: evenTimings(storyboard), out, part, quality: 'draft', layout: {format: 'landscape', scale: .5}});
  const w = partWindow(film, part);
  assert.ok(Math.abs(r.seconds - (w.to - w.from)) < .1, `the part and its handles: ${r.seconds} s`);
  assert.equal(spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', out], {encoding: 'utf8'}).stdout.trim(), '960,540');
});

test('a crop follows its keys, eased, never leaves the frame\'s width, and may widen to the whole frame', () => {
  const keys = [{t: 10, x: 300}, {t: 20, x: 1500}, {t: 30, x: 800, width: 1600}, {t: 40, x: 800, width: 600}];
  const at = t => cropWindow(keys, t, [900, 900]);
  assert.deepEqual(at(0), {x0: 350, y0: 0, w: 900, h: 900}, 'centred before the first key, at the format\'s width');
  assert.equal(at(11).x0, 0, 'at x 300 the crop is held inside the frame (left edge 0)');
  assert.equal(at(21).x0, 700, 'and at x 1500 inside its right edge (1600 - 900)');
  const mid = at(20.4).x0; assert.ok(mid > 0 && mid < 700, 'easing between keys');
  assert.deepEqual(at(31), {x0: 0, y0: -350, w: 1600, h: 1600}, 'the whole frame: a window taller than the frame, paper above and below');
  const between = at(30.4); assert.ok(between.w > 900 && between.w < 1600 && between.h === between.w, 'widening eases too');
  assert.deepEqual(at(41), {x0: 500, y0: 150, w: 600, h: 600}, 'and narrows to come closer');
  assert.deepEqual(cropWindow([], 5, [1200, 900]), {x0: 200, y0: 0, w: 1200, h: 900}, 'a 4:3 crop keeps the frame\'s height');
});

test('a vertical picture: the title band under the app\'s top bar, the film in a 4:3 crop, the captions under it, all inside the safe zone', () => {
  const layout = compileLayout(film, {format: 'vertical', header: {title: 'Yes, No, or Not Enough Evidence', sub: 'a talk'}, captions: true, crop: [{at: ['talk', 'Two searches'], x: 400}]});
  const c = createCanvas(1080, 1920), ctx = c.getContext('2d'), t = at('talk', 'searches') + .02;
  layout.picture(ctx, t); layout.overlay(ctx, t);
  const px = (x, y) => [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)];
  const bg = [0xf3, 0xee, 0xe3];
  assert.deepEqual(px(540, 1000), [255, 0, 0], 'the film fills its square');
  assert.deepEqual(px(540, 120), bg, 'above the title band: the film\'s paper, under the app\'s own bar');
  const inked = y => { let n = 0; for (let x = 100; x < 980; x += 3) if (px(x, y)[0] < 120) n++; return n; };
  assert.ok([330, 350, 370, 390, 410].some(y => inked(y) > 5), 'the title is drawn in the band below the top bar');
  assert.deepEqual(px(540, 1285), [255, 0, 0], 'the film ends at y 1290');
  // The caption sits under the film, inside what Shorts, Reels and TikTok leave clear (y 1298–1460, x 120–960).
  const pill = y => { let n = 0; for (let x = 100; x < 980; x += 4) { const [r, g, b] = px(x, y); if (r < 110 && g < 110 && b < 120) n++; } return n; };
  assert.ok(pill(1379) > 20, 'a caption pill is drawn under the film');
  assert.equal(pill(1250), 0, 'it covers no picture');
  assert.equal(pill(1520), 0, 'and nothing to read below the safe line');
  for (let y = 1300; y < 1460; y += 10) assert.deepEqual(px(1010, y), bg, `the right column, where the app's buttons are, has nothing to read (${y})`);
  const m = ctx.getTransform(); assert.ok(m.a === 1 && m.e === 0 && ctx.globalAlpha === 1, 'the layout restores the canvas');
  layout.picture(ctx, t); layout.overlay(ctx, t, {still: true});
  assert.equal(pill(1379), 0, 'a still (the poster) has no caption');
  assert.ok([330, 350, 370, 390, 410].some(y => inked(y) > 5), 'and keeps the title band');
});

test('motion blur: fast moves smear, still moments stay sharp; the option refuses what it cannot do', () => {
  const draw = blur => { const c = createCanvas(320, 180), ctx = c.getContext('2d'); makePainter({film, framed: null, blur, width: 320, height: 180, fps: 30, ctx})(at('talk', 'searches')); return ctx; };
  const sharp = draw(null), blurred = draw(readMotionBlur({subframes: 8, shutter: 1}));
  // At the square's moving edge the blurred picture is part white, part red.
  const t = at('talk', 'searches'), edge = Math.round((300 + (t % 2) * 400 + 100) * .2);
  const s = [...sharp.getImageData(edge - 1, 90, 1, 1).data.slice(0, 3)], b = [...blurred.getImageData(edge - 1, 90, 1, 1).data.slice(0, 3)];
  assert.deepEqual(s, [255, 255, 255]); assert.ok(b[1] < 250 && b[1] > 5, `a blend at the edge (${b})`);
  assert.equal(readMotionBlur(null), null); assert.deepEqual(readMotionBlur(6), {subframes: 6, shutter: .5});
  assert.throws(() => readMotionBlur(1), /subframes must be a whole number 2–16/);
  assert.throws(() => readMotionBlur({subframes: 4, shutter: 2}), /shutter must be 0.1–1/);
  assert.throws(() => readMotionBlur({subframes: 4, angle: 180}), /unsupported key angle/);
});

const ffmpeg = spawnSync(process.env.FFMPEG_BIN || 'ffmpeg', ['-version']).status === 0;
test('renderFilm in the vertical format writes a 1080×1920 video, and its caption files on the video\'s clock', {skip: ffmpeg ? false : 'ffmpeg not on PATH'}, async () => {
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'formats-')), 'vertical.mp4');
  const result = await renderFilm({film, storyboard, timings: film.timings, out, fps: 4, from: 2, to: 4, poster: null,
    layout: {format: 'vertical', header: {title: 'Formats'}, captions: true}, motionBlur: 2, captionFiles: true});
  assert.ok(existsSync(result.out)); assert.equal(result.format, 'vertical');
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', result.out], {encoding: 'utf8'});
  if (probe.status === 0) assert.equal(probe.stdout.trim(), '1080,1920');
  // The render covers film time 2–4 s: the first cue moves 2 s earlier, and is cut where the render ends.
  const first = captionChunks(film, FILE_CHUNKS)[0], ms = Math.round((first.start - 2) * 1000);
  assert.ok(first.start > 2 && first.start < 4 && first.end > 4, 'the first cue starts inside the render and runs past its end');
  assert.equal(readFileSync(result.captions.vtt, 'utf8'), `WEBVTT\n\n1\n00:00:01.${String(ms - 1000).padStart(3, '0')} --> 00:00:02.000\nTwo searches.\n`);
  assert.equal(readFileSync(result.captions.srt, 'utf8'), `1\n00:00:01,${String(ms - 1000).padStart(3, '0')} --> 00:00:02,000\nTwo searches.\n`);
  await assert.rejects(renderFilm({film, storyboard, timings: film.timings, out, layout: {format: 'square'}, intro: {seconds: 1, draw: () => {}}}), /takes none/);
  await assert.rejects(renderFilm({film, storyboard, timings: film.timings, out, layout: {format: 'square'}, width: 720}), /the square layout is 1080×1080; leave width and height out/);
});

test('makeFilm records the version it made: the format, the motion blur, the caption files', {skip: ffmpeg ? false : 'ffmpeg not on PATH'}, async () => {
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'formats-')), 'square.mp4');
  const made = await makeFilm({storyboard, recipe, kits: [slide], timings: evenTimings(storyboard), out,
    render: {fps: 4, from: 2, to: 3, poster: null, layout: {format: 'square', header: {title: 'Formats'}, captions: true}, motionBlur: 3, captionFiles: ['srt']}});
  const record = JSON.parse(readFileSync(made.makingOf, 'utf8'));
  assert.deepEqual(record.version, {format: 'square', motionBlur: 3, captionFiles: ['captions.srt']});
});
