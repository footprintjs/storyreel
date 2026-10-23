// A Short cut from an episode (edit.mjs, follow.mjs, endcard.mjs, layout.mjs · fill, release.mjs · cuts): cuts joined
// in order with a cut point, an overlap and a pop at each join, an end card, a tall picture that fills and follows, and
// the poster kept off every join. The refusals first, then the pure answers, then renders.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import {compileFilm, evenTimings, renderFilm, makeFilm} from '../src/index.mjs';
import {compileLayout, cropWindow, formatOf} from '../src/layout.mjs';
import {inOut} from '../src/ease.mjs';
import {checkEdit, readJoin, placeEdit, editFrame, snapToSilence, captionInCut, chunksThrough, chaptersThrough, joinFrames, JOIN_DEFAULTS, SILENCE_PAD} from '../src/edit.mjs';
import {segmentedVideo} from '../src/segments.mjs';
import {folderStore} from '../src/segments/store.mjs';
import {followFocus, keepWhole, focusTarget, windowAt} from '../src/follow.mjs';
import {makeEditPainter} from '../src/editpaint.mjs';
import {prepareRender, filmTime, closeRender, editSound} from '../src/render.mjs';
import {loadTarget, makeRelease} from '../src/release.mjs';
import {spokenTracks} from '../src/captions.mjs';
import {tempDir} from './tmp.mjs';

const noFFmpeg = spawnSync('ffmpeg', ['-version']).error ? 'needs ffmpeg' : false;

// Three scenes, a word every 0.5 s (0.45 s long): one by the narrator, two by Amaira (5 words) then Mom, three by the narrator.
const storyboard = {title: 'Shorts Test', scenes: [
  {id: 'one', title: 'The start', narration: 'A short film about pebbles and sheep, made for a test.'},
  {id: 'two', title: 'The middle', narration: 'One pebble for every sheep that walks out of the gate.'},
  {id: 'three', title: 'The end', narration: 'And that is how the counting began, long ago.'},
]};
const timings = evenTimings(storyboard, {wordSeconds: .5});
timings.scenes[1].words.forEach((w, i) => { w.speaker = i < 5 ? 'amaira' : 'mom'; });
const AMAIRA = [200, 300, 420, 800], MOM = [1100, 300, 1320, 800];
// The picture: blue, a white bar as long as the time (so two moments differ), the two people as boxes.
const slide = {name: 'slide', story: {compile: () => ({hang: 1,
  draw: (c, t) => { c.fillStyle = '#2a77a8'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#fff'; c.fillRect(0, 40, 80 * (t % 19), 30); c.fillStyle = '#e0a030'; c.fillRect(AMAIRA[0], AMAIRA[1], 220, 500); c.fillRect(MOM[0], MOM[1], 220, 500); },
  regionsAt: () => [{box: AMAIRA, path: 'amaira', label: 'Amaira', name: 'amaira'}, {box: MOM, path: 'mom', label: 'Mom', name: 'mom'}]})}};
const recipe = {story: {kit: 'slide'}, poster: ['one', 'pebbles and sheep']};
const film = await compileFilm({storyboard, timings, recipe, kits: [slide]});
const words = spokenTracks(film).flatMap(tr => tr.words.map(w => ({start: tr.offset + w.start, end: tr.offset + w.end})));
const FPS = 30;
const place = (edit, fps = FPS) => placeEdit(checkEdit(edit), {time: filmTime(film), words, total: film.total, fps});
const ffprobe = (file, args) => spawnSync('ffprobe', ['-v', 'error', ...args, '-of', 'csv=p=0', file], {encoding: 'utf8'}).stdout.trim();
/** Frame n of a video as RGBA bytes (width × height). */
const frameOf = (file, n, [w, h]) => spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `select=eq(n\\,${n})`, '-vframes', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], {maxBuffer: 1 << 28}).stdout.subarray(0, w * h * 4);
const pixel = (rgba, w, x, y) => [...rgba.subarray((y * w + x) * 4, (y * w + x) * 4 + 3)];
const near = (a, b, tol = 14) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

// ── Refusals ─────────────────────────────────────────────────────────────────────────────────────────────────────────

test('an edit refuses, before anything is drawn, what is not one — naming the fix', () => {
  const bad = (edit, re) => assert.throws(() => checkEdit(edit), re);
  bad(null, /edit is \{cuts: \[\{from, to, follow\?, join\?\}\]/);
  bad({cuts: [], end: {lines: ['x'], seconds: 1}}, /cuts lists the stretches of the film joined in order, 1–20/);
  bad({cuts: [{from: 0, to: 1}], trim: 1}, /edit has unsupported key trim/);
  bad({cuts: [{from: 0, to: 1, crop: []}]}, /cuts\[0\] has unsupported key crop \(a cut is \{from, to, follow, join\}\)/);
  bad({cuts: [{from: 0}]}, /cuts\[0\]\.to is where the cut ends/);
  bad({cuts: [{from: 0, to: 1, join: {pop: 1}}]}, /the first cut has no join before it/);
  bad({cuts: [{from: 0, to: 1}, {from: 2, to: 3, join: {overlap: 2, pop: 1}}]}, /cuts\[1\]\.join: a pop hides a hard cut, and an overlap has no hard cut to hide/);
  bad({cuts: [{from: 0, to: 1}], join: {pop: 4}}, /join\.pop is the frames of paper that hide a hard cut, a whole number 0–3/);
  bad({cuts: [{from: 0, to: 1}], join: {overlap: 1.5}}, /join\.overlap is the frames the two sides cross-fade, a whole number 0–30/);
  bad({cuts: [{from: 0, to: 1}], join: {cut: 'nearest'}}, /join\.cut is 'silence' .* or 'exact'/);
  bad({cuts: [{from: 0, to: 1}], join: {fade: 1}}, /join has unsupported key fade \(a join is \{cut, overlap, pop\}\)/);
  bad({cuts: [{from: 0, to: 1}], end: {lines: [], seconds: 2}}, /end\.lines is 1–4 lines of text/);
  bad({cuts: [{from: 0, to: 1}], end: {lines: ['Watch'], seconds: 30}}, /end\.seconds is how long the card holds, 0\.5–10/);
  bad({cuts: [{from: 0, to: 1}], end: {lines: ['Watch'], seconds: 2, colour: 'red'}}, /end has unsupported key colour/);
});

test('an edit placed on the film refuses a cut outside it, backwards, too short, or an overlap longer than half a side', () => {
  assert.throws(() => place({cuts: [{from: 2, to: 40}]}), /cuts\[0\] is 2\.00–40\.00 s, outside the film \(0–18\.80 s\)/);
  assert.throws(() => place({cuts: [{from: 5, to: 3}]}), /cuts\[0\] ends \(3\.\d\d s\) before it starts/);
  assert.throws(() => place({cuts: [{from: 6, to: 6.02}]}), /cuts\[0\] is 1 frame long: a cut shows at least 2/);
  assert.throws(() => place({cuts: [{from: 6, to: 6.4}, {from: 8, to: 12, join: {overlap: 10}}]}), /cuts\[1\]\.join\.overlap: 10 frames is more than half of cuts\[0\]/);
  assert.throws(() => place({cuts: [{from: 6, to: 6.4}], end: {lines: ['x'], seconds: 1, join: {overlap: 12}}}), /end\.join\.overlap: 12 frames is more than half of the last cut/);
  assert.throws(() => place({cuts: [{from: ['one', 'no such words'], to: 3}]}), /cuts\[0\]\.from: Phrase not in one: "no such words"/);
  assert.throws(() => place({cuts: [{from: {scene: 'one', at: 2}, to: 3}]}), /cuts\[0\]\.from: Unknown scene undefined|a scene is \{scene: id\}/);
  assert.throws(() => place({cuts: [{from: 'start', to: 3}]}), /cuts\[0\]\.from is seconds on the film clock, a beat \[scene, phrase\], or \{scene\}/);
});

test('a render takes an edit, or a part or from/to, never both; no intro; a cut that follows needs a tall layout; makeFilm\'s check refuses an edit', async () => {
  const out = path.join(tempDir('edit-refuse'), 'x.mp4'), edit = {cuts: [{from: 1, to: 3}]};
  assert.throws(() => prepareRender({film, storyboard, timings: film.timings, out, edit, from: 1}), /a render takes an edit .* or a part or from\/to, not both/);
  assert.throws(() => prepareRender({film, storyboard, timings: film.timings, out, edit, intro: {seconds: 1, draw() {}}}), /an edit joins parts of the film; it takes no intro/);
  assert.throws(() => prepareRender({film, storyboard, timings: film.timings, out, edit: {cuts: [{from: 1, to: 3, follow: 'focus'}]}}), /cuts\[0\]\.follow is where a tall picture's crop looks; give the render a layout/);
  assert.throws(() => prepareRender({film, storyboard, timings: film.timings, out, layout: {format: 'square'}, edit: {cuts: [{from: 1, to: 3, follow: 'focus'}]}}), /cuts\[0\]\.follow: the square format shows the whole frame, so there is no crop to follow/);
  assert.throws(() => prepareRender({film, storyboard, timings: film.timings, out, layout: {format: 'vertical'}, edit: {cuts: [{from: 1, to: 3}, {from: 4, to: 6, follow: [{at: 5, x: 3000}]}]}}), /cuts\[1\]\.follow\[0\]\.x must be a centre on the 1600-wide frame/, 'a follow\'s refusal names the cut\'s follow, not the layout\'s crop');
  await assert.rejects(makeFilm({storyboard, timings, recipe, kits: [slide], out, check: 'report', render: {edit}}), /check reads a render on the film's own clock, and an edit joins stretches of it/);
});

test('a release target refuses an edit it cannot make before any target renders', async () => {
  const bad = (spec, re) => assert.rejects(loadTarget(spec), re);
  await bad({target: 'youtube-shorts', cuts: [{from: 0, to: 2}], from: 1}, /a target takes cuts or from\/to, not both/);
  await bad({target: 'youtube-shorts', cuts: [{from: 0, to: 2}], crop: []}, /with cuts, each cut says where its crop looks \(follow\): leave the target's crop out/);
  await bad({target: 'youtube-shorts', join: {pop: 1}}, /join says how cuts are joined; give cuts \(or an end card\), or leave join out/);
  await bad({target: 'linkedin', fill: true}, /fill: the square format has no filled picture; leave fill out, or use a vertical target/);
  await bad({target: 'youtube-shorts', fill: 'yes'}, /fill is true .* or left out/);
  await bad({target: 'youtube-shorts', render: {layout: {}}}, /render has unsupported key layout \(a target's own render settings are posterFrame, quality/);
  await bad({target: 'youtube-shorts', render: {posterFrame: 'no'}}, /render\.posterFrame is true .* or false/);
  await bad({target: 'youtube-shorts', render: {quality: 'ultra'}}, /render\.quality must be 'standard' or 'draft' or 'high'/);
  await bad({target: 'youtube-shorts', cuts: [{from: 0, to: 2, join: {overlap: 2}}]}, /the first cut has no join before it/);
  await bad({target: 'youtube-shorts', end: {lines: ['Watch'], seconds: 99}}, /end\.seconds is how long the card holds/);
  await bad({target: 'youtube', keep: ['mom']}, /keep: the landscape format shows the whole frame, so nothing is cut at its edge/);
  const {options} = await loadTarget({target: 'youtube-shorts', from: 2, to: 9, end: {lines: ['Watch the whole story'], seconds: 2}});
  assert.deepEqual(options.edit, {cuts: [{from: 2, to: 9}], end: {lines: ['Watch the whole story'], seconds: 2}}, 'an end card on a part: the part is the one cut');
});

test('the layout refuses a fill, a key or a follow it cannot use', () => {
  const bad = (spec, re) => assert.throws(() => compileLayout(film, spec), re);
  bad({format: 'portrait', fill: true}, /layout\.fill: the portrait format has no filled picture; leave fill out, or use the vertical format/);
  bad({format: 'vertical', fill: 'tall'}, /layout\.fill is true .* or left out/);
  bad({format: 'vertical', crop: [{at: 1, x: 800, y: 1200}]}, /layout\.crop\[0\]\.y must be a centre on the 900-high frame/);
  bad({format: 'vertical', crop: [{at: 1, x: 800, cut: 'yes'}]}, /layout\.crop\[0\]\.cut is true/);
  bad({format: 'vertical', crop: [{at: 1, follow: 'speaker'}]}, /layout\.crop\[0\]\.follow is 'focus'/);
  bad({format: 'vertical', crop: [{at: 1, follow: 'focus', x: 300}]}, /layout\.crop\[0\] has unsupported key x/);
  bad({format: 'vertical', crop: [{at: 99, x: 300}]}, /layout\.crop\[0\]\.at is 99 s, outside the film: give a time from 0 to 18\.80 s/);
  bad({format: 'vertical', keep: 'amaira'}, /layout\.keep lists the named things/);
  bad({format: 'landscape', keep: ['amaira']}, /the landscape format shows the whole frame, so nothing is cut at its edge/);
});

// ── The pure answers ─────────────────────────────────────────────────────────────────────────────────────────────────

test('a cut point inside a spoken word moves to the silence beside it; one in a silence stays', () => {
  const w = [{start: 1, end: 1.45}, {start: 1.5, end: 1.95}, {start: 3, end: 3.4}];
  const tw = ({t, word}) => ({t, word});
  assert.deepEqual(tw(snapToSilence(w, 1.7, 'from')), {t: 1.475, word: 1}, 'a start goes before the word: half the 0.05 s gap');
  assert.ok(Math.abs(snapToSilence(w, 1.7, 'from').gap - .05) < 1e-9, 'and says how much silence it found');
  assert.deepEqual(tw(snapToSilence(w, 1.7, 'to')), {t: 1.95 + SILENCE_PAD, word: 1}, 'an end after it: the pad, the gap being longer');
  assert.deepEqual(snapToSilence(w, 2.5, 'from'), {t: 2.5}, 'a silence stays');
  assert.deepEqual(tw(snapToSilence(w, 1.2, 'from')), {t: 1 - SILENCE_PAD, word: 0}, 'the first word: the pad before it');
  const e = place({cuts: [{from: 4, to: 5.8}]}), x = place({cuts: [{from: 4, to: 5.8}], join: {cut: 'exact'}});
  assert.deepEqual(e.cuts[0].snapped, {from: [4, 3.775]}, 'film second 4 is inside "made" (3.8–4.25): the cut starts in the silence before it');
  assert.equal(x.cuts[0].snapped, undefined, 'cut: exact keeps the cut point');
  assert.equal(x.cuts[0].from, 4);
});

test('the frames of an edit: each cut where the one before ends, less the overlap; the end card after; frame f says what it shows', () => {
  const e = place({cuts: [{from: 4, to: 5.8}, {from: 6, to: 9, join: {pop: 2}}, {from: {scene: 'three'}, to: 16, join: {overlap: 4}}], end: {lines: ['Watch the whole story', 'Pebbles'], seconds: 1}});
  const [a, b, c] = e.cuts;
  assert.deepEqual([a.at, b.at, c.at, e.end.at], [0, a.frames, a.frames + b.frames - 4, a.frames + b.frames - 4 + c.frames]);
  assert.equal(e.frames, e.end.at + 30);
  assert.deepEqual(joinFrames(e), [{index: 1, frame: b.at}, {index: 2, frame: c.at}, {index: 'end', frame: e.end.at}]);
  assert.deepEqual(editFrame(e, 0), {kind: 'cut', cut: 0, t: a.start});
  assert.deepEqual(editFrame(e, b.at), {kind: 'cut', cut: 1, t: b.start, pop: true}, 'a pop on the hard cut\'s first frames');
  assert.equal(editFrame(e, b.at + 1).pop, true); assert.equal(editFrame(e, b.at + 2).pop, undefined, 'two frames of it');
  const blend = editFrame(e, c.at);
  assert.equal(blend.kind, 'blend'); assert.equal(blend.under.cut, 1); assert.equal(blend.over.cut, 2); assert.equal(blend.a, 1 / 5);
  assert.ok(Math.abs(blend.under.t - (b.start + (b.frames - 4) / FPS)) < 1e-9, 'the earlier side plays on under the overlap');
  assert.equal(editFrame(e, c.at + 3).a, 4 / 5); assert.equal(editFrame(e, c.at + 4).kind, 'cut');
  assert.deepEqual(editFrame(e, e.end.at), {kind: 'end', u: 0});
  assert.equal(scenesOf(e.cuts[2]), 'three');
  assert.equal(c.start, film.clock.start('three'), '{scene} is its start for from');
});
const scenesOf = cut => film.clock.locate(cut.start + 1e-6).id;

test('NO CAPTION FROM THE PREVIOUS CUT shows on any frame after a join — hard, popped or overlapped — frame-exact', () => {
  // Cut 1 ends after "test." (5.75 s); cut 2 starts in the silence at 6 s, where the film still shows "made for a test."
  // (a caption stays 0.6 s past its last word). Every frame from a join to the next is checked as the painter draws it.
  for (const join of [{}, {pop: 2}, {overlap: 6}]) {
    const e = place({cuts: [{from: 4, to: 5.8}, {from: 6, to: 9, join}, {from: {scene: 'three'}, to: 16, join}], end: {lines: ['Watch'], seconds: .5}});
    const framedCuts = e.cuts.map(c => compileLayout(film, {format: 'vertical', fill: true, header: {title: 'T'}, captions: true}, {from: c.start, to: c.start + c.frames / FPS}));
    const drawn = [];   // the caption each frame's bands were drawn with
    framedCuts.forEach((f, i) => { const overlay = f.overlay; f.overlay = (ctx, t, o = {}) => { if (!o.still) drawn.push({cut: i, caption: o.caption}); return overlay(ctx, t, o); }; });
    const W = 270, H = 480, ctx = createCanvas(W, H).getContext('2d');
    const paint = makeEditPainter({film, edit: e, framedCuts, blur: null, width: 1080, height: 1920, fps: FPS, ctx});
    // The hazard is real: at cut 2's first frame the film itself shows the caption cut 1 ended on.
    const raw = framedCuts[1].captionAt(e.cuts[1].start);
    assert.ok(raw && raw.words.every(w => w.start < e.cuts[1].start), `the film shows "${raw?.words.map(w => w.text).join(' ')}" at the join`);
    for (const {index, frame} of joinFrames(e).filter(j => j.index !== 'end')) {
      const cut = e.cuts[index], next = e.cuts[index + 1]?.at ?? e.end.at;
      for (let f = frame; f < next; f++) {
        drawn.length = 0; paint(f);
        assert.equal(drawn.length, 1, `frame ${f}: one set of bands`);
        assert.equal(drawn[0].cut, index, `frame ${f} (join ${JSON.stringify(join)}): the bands are cut ${index}'s, never the cut before`);
        const words = drawn[0].caption?.words ?? [];
        for (const w of words) assert.ok(w.start >= cut.from - 1e-6 && w.start < cut.to, `frame ${f}: "${w.text}" (${w.start} s) was said inside cut ${index}`);
      }
    }
  }
});

test('a caption that spans a cut point shows only the words said inside the cut', () => {
  const cut = {from: 3.775, to: 5.8}, chunk = {words: [{text: 'about', start: 3.3, end: 3.75}, {text: 'pebbles', start: 3.8, end: 4.25}, {text: 'and', start: 4.3, end: 4.75}], active: 1};
  assert.deepEqual(captionInCut(cut, 4, () => chunk), {words: chunk.words.slice(1), active: 0});
  assert.equal(captionInCut(cut, 4, () => ({words: chunk.words.slice(0, 1), active: 0})), null, 'a chunk said wholly before the cut: none');
  const inside = {words: chunk.words.slice(1), active: 0};
  assert.equal(captionInCut(cut, 4, () => inside), inside, 'a chunk wholly inside: as it is');
});

test('caption files and chapters on the edit\'s clock: each cut\'s words where it plays, its chapter at its start', () => {
  const e = place({cuts: [{from: 4, to: 5.8}, {from: ['two', 'every sheep'], to: {scene: 'two'}}]});
  const chunks = [{start: 3.3, end: 4.8, text: 'about pebbles and', words: [{text: 'about', start: 3.3, end: 3.75}, {text: 'pebbles', start: 3.8, end: 4.25}, {text: 'and', start: 4.3, end: 4.75}]}];
  const [c] = chunksThrough(e, chunks);
  assert.equal(c.text, 'pebbles and', 'the word said before the cut is left out');
  assert.ok(Math.abs(c.start - (3.8 - e.cuts[0].start)) < 1e-9, 'its time moved to where the cut plays');
  assert.deepEqual(chaptersThrough(e, [[0, 'The start'], [6.6, 'The middle'], [13.2, 'The end']]), [[0, 'The start'], [+(e.cuts[1].at / FPS).toFixed(3), 'The middle']]);
});

test('a filled vertical picture: the film from under the title band to below the captions, a window the frame\'s height', () => {
  const f = compileLayout(film, {format: 'vertical', fill: true, header: {title: 'T'}, captions: true});
  assert.deepEqual(f.boxes.film, formatOf('vertical').fill);
  assert.deepEqual(f.boxes.film, [0, 475, 1080, 1165]);
  assert.ok(f.boxes.film[1] >= f.boxes.header[1] + f.boxes.header[3], 'under the title band');
  assert.ok(f.boxes.film[1] + f.boxes.film[3] > f.boxes.captions[1] + f.boxes.captions[3], 'below the captions, which sit over its foot');
  const w = cropWindow(f.cropKeys, 1, [900 * 1080 / 1165, 900]);
  assert.ok(Math.abs(w.h - 900) < 1e-9 && w.y0 === 0, 'at its default width the window is the frame\'s whole height');
  const c = createCanvas(1080, 1920), ctx = c.getContext('2d'); f.picture(ctx, 1); f.overlay(ctx, 1);
  const px = (x, y) => [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)];
  assert.deepEqual(px(540, 480), [0x2a, 0x77, 0xa8], 'the film just under the band');
  assert.deepEqual(px(540, 1630), [0x2a, 0x77, 0xa8], 'and below the captions');
});

test('crop keys go up and down (y), jump at a cut (cut: true), and take seconds; a filled picture jumps at a scene cut', () => {
  const at = (keys, t) => cropWindow(keys, t, [1200, 900]);
  assert.deepEqual(at([{t: 0, x: 800, y: 100, width: 600}], 2), {x0: 500, y0: 0, w: 600, h: 450}, 'a short window held inside the frame at the top');
  assert.deepEqual(at([{t: 0, x: 800, y: 800, width: 600}], 2), {x0: 500, y0: 450, w: 600, h: 450}, 'and at the bottom');
  const mid = at([{t: 0, x: 800, y: 100, width: 600}, {t: 1, x: 800, y: 800, width: 600}], 1.4).y0;
  assert.ok(mid > 0 && mid < 450, 'easing up and down between keys');
  assert.equal(at([{t: 0, x: 300}, {t: 1, x: 1300, jump: true}], 1).x0, 400, 'a jump is there on its first frame (1300 − 600, held inside)');
  const layout = compileLayout(film, {format: 'vertical', fill: true, keep: [], crop: [{at: 1, x: 400}, {at: 6.2, x: 1200}, {at: ['two', 'walks out'], x: 600}, {at: 12, x: 900, cut: true}]});
  assert.deepEqual(layout.cropKeys.map(k => [+k.t.toFixed(3), k.jump ?? false]), [[0, true], [1, false], [6.6, true], [9.9, false], [12, true]],
    'the window opens on a key of its own; a move the scene cut (6.6 s) would fall inside jumps there at the cut; a key after the cut keeps its time and eases; cut: true jumps where it is');
  assert.ok(layout.cropKeys.every(k => !('given' in k)), 'the keys handed out are the window\'s, nothing else');
});

test('without the new keys a crop is what it was: the same keys, the same windows, no framing', () => {
  const layout = compileLayout(film, {format: 'vertical', crop: [{at: ['one', 'pebbles'], x: 300}, {at: ['two', 'sheep'], x: 1300, width: 900}]});
  assert.deepEqual(layout.cropKeys, [{t: film.clock.at(['one', 'pebbles']), x: 300, width: 1200}, {t: film.clock.at(['two', 'sheep']), x: 1300, width: 900}]);
  assert.equal(layout.framing, undefined);
  // The window as 0.21.0 computed it, for the same keys, at every tenth of a second.
  const MOVE = .8;
  const before = (keys, t, [cw, ch]) => { let x = 800, w = cw; for (const k of keys) { if (t < k.t) break; const u = inOut((t - k.t) / MOVE); x += (k.x - x) * u; w += ((k.width ?? cw) - w) * u; } const h = w * ch / cw; return {x0: Math.max(0, Math.min(1600 - w, x - w / 2)), y0: 450 - h / 2, w, h}; };
  for (let t = 0; t < film.total; t += .1) assert.deepEqual(cropWindow(layout.cropKeys, t, [1200, 900]), before(layout.cropKeys, t, [1200, 900]), `t ${t.toFixed(1)}`);
});

test('follow: focus — the window frames the speaker while they speak, jumps at a scene cut, and keeps both people whole', () => {
  const crop = [900 * 1080 / 1165, 900], {keys, why} = followFocus(film, {from: 0, to: film.total, crop});
  assert.equal(keys[0].t, 0); assert.equal(keys[0].jump, true, 'the stretch opens where it looks, at once');
  const two = film.clock.start('two'), atTwo = keys.find(k => Math.abs(k.t - two) < 1e-6);
  assert.ok(atTwo?.jump, 'a key at the scene cut, a jump');
  assert.equal(atTwo.x, (AMAIRA[0] + AMAIRA[2]) / 2, 'Amaira speaks first in scene two: her region');
  const momKey = keys.find(k => k.t > two && k.x === (MOM[0] + MOM[2]) / 2);
  assert.ok(momKey && !momKey.jump && momKey.t >= film.clock.at(['two', 'that walks']) - .3 - 1e-6, 'Mom\'s turn: the window pans (eased) to her as she starts');
  assert.ok(why.speaker >= 2);
  assert.equal(focusTarget(film, 1, {turns: film.clock.turns(), focusKeys: [], w: 834}), null, 'the narrator is nobody on screen: nothing to look at');
  const layout = compileLayout(film, {format: 'vertical', fill: true, crop: 'focus'});
  assert.deepEqual(layout.framing.keep, ['amaira', 'mom'], 'kept whole: every speaker');
  assert.deepEqual(layout.framing.clipped, []);
  for (let t = 0; t < film.total; t += .25) {
    const w = cropWindow(layout.cropKeys, t, crop);
    if (t % 1 > .7) continue;   // (a pan's middle passes over them: only the held windows are kept whole)
    for (const b of [AMAIRA, MOM]) assert.ok(b[2] <= w.x0 + .5 || b[0] >= w.x0 + w.w - .5 || (b[0] >= w.x0 - .5 && b[2] <= w.x0 + w.w + .5), `t ${t}: a person is whole inside or whole outside`);
  }
});

test('keep whole: a key whose window would cut a person moves the least it must; one it cannot help is reported', () => {
  const crop = [1200, 900];
  const {keys, nudged, clipped} = keepWhole(film, [{t: 0, x: 800, width: 834}], {crop, keep: ['amaira', 'mom'], until: 5});
  const w = windowAt(keys[0], crop);
  assert.ok(nudged.length === 1 && Math.abs(nudged[0].by[0]) < 200, `nudged by ${nudged[0]?.by}`);
  assert.ok([AMAIRA, MOM].every(b => b[2] <= w.x0 || b[0] >= w.x0 + w.w || (b[0] >= w.x0 && b[2] <= w.x0 + w.w)));
  assert.deepEqual(clipped, []);
  const crowd = {...film, regionsAt: () => [{box: [100, 100, 1500, 800], name: 'crowd'}]};
  const r = keepWhole(crowd, [{t: 0, x: 800, width: 600}], {crop, keep: ['crowd'], until: 5});
  assert.deepEqual(r.clipped, [{t: 0, names: ['crowd'], why: 'wider than the window: give the key a larger width'}]);
  assert.deepEqual(keepWhole(film, [{t: 0, x: 800, width: 834}], {crop, keep: [], until: 5}).nudged, [], 'keep: [] keeps nothing');
  // A key whose centre lies past the frame's edge (held inside it) moves from where its window is, not from its x.
  const edge = keepWhole(film, [{t: 0, x: 100, width: 600}], {crop, keep: ['amaira'], until: 5}), we = windowAt(edge.keys[0], crop);
  assert.ok(AMAIRA[2] <= we.x0 + we.w && AMAIRA[0] >= we.x0, `Amaira whole inside ${we.x0}–${we.x0 + we.w}`);
  // A key someone wrote moves at most NUDGE of the window: what it frames was chosen. Past that it stays, and is reported.
  const kid = {...film, regionsAt: () => [{box: [500, 300, 700, 800], name: 'kid'}]};
  const tall = [900 * 1080 / 1165, 900];   // the filled crop: a 600-wide window is 647 high, taller than the kid
  assert.equal(keepWhole(kid, [{t: 0, x: 900, width: 600}], {crop: tall, keep: ['kid'], until: 5}).nudged[0].by[0], -108, 'a followed key moves as far as it must (18% of the window)');
  const written = keepWhole(kid, [{t: 0, x: 900, width: 600, given: true}], {crop: tall, keep: ['kid'], until: 5});
  assert.deepEqual(written.nudged, []); assert.equal(written.keys[0].x, 900);
  assert.match(written.clipped[0].why, /keeping them whole moves this written key more than 15% of the window: move the key yourself/);
  // A filled picture with no key at its start opens on a key of its own, kept off the people too.
  const opened = compileLayout(film, {format: 'vertical', fill: true});
  assert.equal(opened.cropKeys[0].t, 0); assert.equal(opened.framing.nudged.length, 1, 'the centred window cut both: moved');
});

test('a release refuses makeFilm\'s check beside an edit before any target renders', async () => {
  const out = tempDir('pre-check');
  await assert.rejects(makeRelease({storyboard, timings, recipe, kits: [slide], out, check: 'report', post: {title: 'Pebbles', audience: 'kids'},
    targets: ['youtube', {target: 'youtube-shorts', cuts: [{from: 1, to: 3}]}]}), /release target "youtube-shorts": check reads a render on the film's own clock, and its cuts join stretches of it/);
  assert.ok(!existsSync(path.join(out, 'youtube')), 'the target before it rendered nothing');
});

test('a cut keeps to its cut points on the frame grid: where words touch, no frame of the next (or the one before) gets in — 24, 25 and 30 fps', () => {
  const words = [{text: 'one', start: .31, end: 1.03}, {text: 'two', start: 1.03, end: 1.77}, {text: 'three', start: 1.77, end: 2.41}, {text: 'four', start: 2.41, end: 3}];
  for (const fps of [24, 25, 30]) {
    const e = placeEdit(checkEdit({cuts: [{from: 1.2, to: 2}]}), {time: t => t, words, total: 4, fps}), [c] = e.cuts, end = c.start + c.frames / fps;
    assert.deepEqual(c.snapped, {from: [1.2, 1.03], to: [2, 2.41], noSilence: ['from', 'to']}, `${fps} fps: both cut points land where words touch, and say so`);
    assert.ok(c.start >= 1.03 - 1e-9 && c.start < 1.03 + 1 / fps, `${fps} fps: it starts on the first frame after "one" ends (${c.start})`);
    assert.ok(end <= 2.41 + 1e-9 && end > 2.41 - 1 / fps, `${fps} fps: it ends on the last frame before "four" starts (${end})`);
    const chunk = {start: 1.03, end: 3, text: 'two three four', words: words.slice(1)};
    assert.deepEqual(captionInCut(c, end - .001, () => ({words: chunk.words, active: 1})).words.map(w => w.text), ['two', 'three'], `${fps} fps: the burned caption leaves "four" out`);
    assert.equal(chunksThrough(e, [chunk])[0].text, 'two three', `${fps} fps: so does the caption file`);
  }
  const quiet = placeEdit(checkEdit({cuts: [{from: 1, to: 2}]}), {time: t => t, words: [], total: 4, fps: 30}).cuts[0];
  assert.deepEqual([quiet.start, quiet.frames, quiet.snapped], [1, 30, undefined], 'in a silence the grid rounds as it did');
});

test('a caption file\'s cue ends where the next join lands, as the burned captions do in an overlap', () => {
  const e = place({cuts: [{from: 4, to: 5.8}, {from: 6, to: 9, join: {overlap: 6}}]});
  const chunk = {start: 3.8, end: 6.35, text: 'made for a test.', words: [{text: 'made', start: 3.8, end: 4.25}, {text: 'for', start: 4.3, end: 4.75}, {text: 'a', start: 4.8, end: 5.25}, {text: 'test.', start: 5.3, end: 5.75}]};
  const [cue] = chunksThrough(e, [chunk]);
  assert.ok(cue.end <= e.cuts[1].at / FPS + 1e-9, `the cue ends at ${cue.end}, by the join at ${e.cuts[1].at / FPS}`);
});

test('a focus that pans just before a scene cut jumps at the cut instead (a filled picture never pans across one)', () => {
  // A scene cut at 5.5 s and Mom's turn at 5.1 s: the window would start easing to her at 5.0 s and run across the cut.
  const mom = [1100, 300, 1320, 800];
  const fake = {total: 10, frame() {}, theme: {}, clock: {offsets: [0, 5.5], turns: () => [{speaker: 'mom', start: 5.1, end: 6.5}], at() { throw new Error('no beats here'); }},
    regionsAt: () => [{name: 'mom', box: mom, path: 'mom'}, {name: 'amaira', box: AMAIRA, path: 'amaira'}]};
  for (const crop of ['focus', [{at: 0, follow: 'focus'}]]) {
    const {cropKeys: keys} = compileLayout(fake, {format: 'vertical', fill: true, crop});
    for (const k of keys) if (!k.jump) assert.ok(!fake.clock.offsets.some(s => s > k.t && s < k.t + .8), `the key at ${k.t} s eases across the cut at 5.5 s`);
    const atCut = keys.find(k => Math.abs(k.t - 5.5) < 1e-9);
    assert.ok(atCut?.jump, 'it jumps at the cut'); assert.ok(Math.abs(atCut.x - (mom[0] + mom[2]) / 2) < 1, 'to Mom');
  }
});

test('segmentedVideo refuses an edit: its pieces are keyed on the film clock (an edit is drawn whole)', {skip: noFFmpeg}, async () => {
  const dir = tempDir('seg-edit');
  await assert.rejects(renderFilm({film, storyboard, timings: film.timings, out: path.join(dir, 'x.mp4'), edit: {cuts: [{from: 1, to: 3}]}, video: segmentedVideo({store: folderStore(path.join(dir, 'cache'))})}),
    /segmentedVideo: an edit \(cuts joined, an end card\) is not kept in segments, which are keyed on the film clock; render it with wholeVideo\(\)/);
});

test('an edit\'s poster is framed at its own moment, kept off the people — not by cut 0\'s crop at another time', () => {
  const crop = [900 * 1080 / 1165, 900], whole = w => [AMAIRA, MOM].every(b => b[2] <= w.x0 + .5 || b[0] >= w.x0 + w.w - .5 || (b[0] >= w.x0 - .5 && b[2] <= w.x0 + w.w + .5));
  for (const follow of [[{at: 9, x: 1210}], 'focus']) {
    const out = path.join(tempDir('poster-edit'), 'x.mp4');
    const job = prepareRender({film, storyboard, timings: film.timings, out, layout: {format: 'vertical', fill: true, header: {title: 'T'}}, edit: {cuts: [{from: 9, to: 12, follow}]}});
    try {
      assert.notEqual(job.framed, job.framedCuts[0], 'the poster has its own layout');
      assert.ok(whole(cropWindow(job.framed.cropKeys, film.posterAt, crop)), `follow ${JSON.stringify(follow)}: the poster's window at ${film.posterAt} s cuts nobody`);
      assert.ok(job.framed.framing.nudged.length >= 1 && Array.isArray(job.framed.framing.clipped), 'and is kept whole by the same pass, reported in its framing');
    } finally { closeRender(job); }
  }
  // Cut 0's own crop at the poster's moment (centred, before its first key) would cut both of them.
  const job = prepareRender({film, storyboard, timings: film.timings, out: path.join(tempDir('poster-edit'), 'x.mp4'), layout: {format: 'vertical', fill: true}, edit: {cuts: [{from: 9, to: 12, follow: [{at: 9, x: 1210}]}]}});
  try { assert.ok(!whole(cropWindow(job.framedCuts[0].cropKeys, film.posterAt, crop))); } finally { closeRender(job); }
});

test('the joined sound: each cut from its own film second, an overlap cross-faded the right way, hard joins faded, the end card silent', {skip: noFFmpeg}, () => {
  const dir = tempDir('edit-sound'), lesson = path.join(dir, 'lesson.wav'), out = path.join(dir, 'joined.wav'), R = 48000;
  const ramp = t => .05 + .09 * t;   // the film's sound says what second it is
  const run = args => { const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]); if (r.status) throw new Error(String(r.stderr)); };
  run(['-f', 'lavfi', '-i', 'aevalsrc=0.05+0.09*t:s=48000:d=10', '-ac', '1', '-c:a', 'pcm_f32le', lesson]);
  const e = placeEdit(checkEdit({cuts: [{from: 1, to: 3}, {from: 6, to: 8, join: {overlap: 6}}, {from: 4, to: 5}], end: {lines: ['x'], seconds: 1}}), {time: t => t, words: [], total: 10, fps: 30});
  editSound(run, {edit: e, lesson, out});
  const raw = spawnSync('ffmpeg', ['-v', 'error', '-i', out, '-f', 'f32le', '-ac', '1', '-ar', String(R), '-'], {maxBuffer: 1 << 26}).stdout;
  const v = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4), at = s => v[Math.round(s * R)];
  const [a, b, c] = e.cuts, near2 = (x, y, tol = .003) => Math.abs(x - y) < tol;
  assert.ok(Math.abs(v.length - e.frames / 30 * R) <= 2, `as long as the picture (${v.length} samples)`);
  assert.ok(Math.abs(v[0]) < .01, 'the first cut fades in');
  assert.ok(near2(at(.02), ramp(a.start + .02)), 'cut 0 plays its own film seconds');
  const O = b.at / 30, A = s => ramp(a.start + (s - a.at / 30)), B = s => ramp(b.start + (s - O));
  assert.ok(near2(at(O + .1), (A(O + .1) + B(O + .1)) / 2, .006), 'half way through the overlap: half of each side');
  assert.ok(Math.abs(at(O + .01) - A(O + .01)) < Math.abs(at(O + .01) - B(O + .01)), 'the overlap starts on the earlier side');
  assert.ok(Math.abs(at(O + .19) - B(O + .19)) < Math.abs(at(O + .19) - A(O + .19)), 'and ends on the later one');
  assert.ok(near2(at(O + .25), ramp(b.start + .25)), 'then cut 1 plays its own film seconds');
  const J = c.at / 30;
  assert.ok(Math.abs(v[Math.round(J * R)]) < .01 && Math.abs(v[Math.round(J * R) - 1]) < .01, 'the hard join is faded out and in: no click');
  assert.ok(near2(at(J + .02), ramp(c.start + .02)), 'cut 2 from its own film second');
  const card = v.subarray(Math.round(e.end.at / 30 * R));
  assert.ok(card.length > R * .9 && card.every(x => Math.abs(x) < 1e-3), 'the end card is silent');
});

// ── Renders ──────────────────────────────────────────────────────────────────────────────────────────────────────────

test('an edit renders as one video: three cuts, a pop, an overlap, an end card; the poster only on frame 0, never a join', {skip: noFFmpeg}, async () => {
  const dir = tempDir('edit'), out = path.join(dir, 'short.mp4'), S = .5, W = 540, H = 960;
  const edit = {cuts: [{from: 4, to: 5.8, follow: 'focus'}, {from: 6, to: 9, follow: [{at: 8, x: 1200}], join: {pop: 2}}, {from: {scene: 'three'}, to: 16, join: {overlap: 4}}],
    end: {lines: ['Watch the whole story', 'Pebbles to ten'], seconds: 1}};
  const r = await renderFilm({film, storyboard, timings: film.timings, narrationDir: null, out, quality: 'draft', captionFiles: true, edit,
    layout: {format: 'vertical', fill: true, header: {title: 'Who has it?'}, captions: true, scale: S}});
  const e = place(edit);
  assert.equal(+ffprobe(out, ['-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames']), e.frames, 'every frame of the edit, no more');
  assert.ok(Math.abs(+ffprobe(out, ['-select_streams', 'a:0', '-show_entries', 'stream=duration']) - e.seconds) < .05, 'the sound as long as the picture');
  assert.equal(r.seconds, e.seconds); assert.deepEqual(r.edit.cuts.map(c => c.frames), e.cuts.map(c => c.frames));
  assert.deepEqual(r.framing.map(f => f.cut ?? (f.poster ? 'poster' : null)), [0, 1, 2, 'poster'], 'the framing of each cut (every one fills), and of the poster');
  const box = [0, 475, 1080, 1165].map(v => v * S), mid = [box[0] + box[2] / 2, box[1] + 40];
  const paper = [0xf3, 0xee, 0xe3], [, b, c] = e.cuts;
  const at = n => frameOf(out, n, [W, H]);
  // The pop: the picture covered with the paper on the hard cut's first two frames, the film on the third.
  for (const n of [b.at, b.at + 1]) assert.ok(near(pixel(at(n), W, ...mid.map(Math.round)), film.theme?.palette?.bg ? hex(film.theme.palette.bg) : paper), `frame ${n}: the pop`);
  assert.ok(near(pixel(at(b.at + 2), W, ...mid.map(Math.round)), [0x2a, 0x77, 0xa8], 30), 'then the film');
  // The end card: the theme's panel in the middle of the film box.
  const card = pixel(at(e.end.at + 5), W, Math.round(box[0] + box[2] / 2), Math.round(box[1] + box[3] * .2));
  assert.ok(!near(card, [0x2a, 0x77, 0xa8], 40), 'the end card covers the picture');
  // The poster is frame 0 only (posterFrame, the default): no join shows it.
  const poster = at(0);
  for (const n of [b.at, c.at, e.end.at]) assert.ok(meanDiff(poster, at(n)) > 2, `frame ${n} (a join) is not the poster`);
  // No caption from the cut before after a join: the caption band holds no dark pill for the silence that opens cut 2.
  const band = [120, 1298, 840, 162].map(v => Math.round(v * S));
  const dark = rgba => { for (let y = band[1]; y < band[1] + band[3]; y += 2) for (let x = band[0]; x < band[0] + band[2]; x += 2) { const [r0, g0, b0] = pixel(rgba, W, x, y); if (r0 < 60 && g0 < 60 && b0 < 70) return true; } return false; };
  assert.ok(dark(at(b.at - 3)), 'the caption is up at the end of cut 1 (the test can see a caption)');
  for (let n = b.at; n < b.at + 10; n++) assert.ok(!dark(at(n)), `frame ${n}: no caption from cut 1 after the join`);
  // The caption file on the edit's clock: cut 2's first cue starts where it plays, with its own words only.
  const srt = readFileSync(r.captions.srt, 'utf8');
  assert.ok(!/made for a test/.test(srt.split('\n\n').slice(1).join('\n')), 'cut 1\'s last line appears once, in cut 1');
});
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const meanDiff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 16) s += Math.abs(a[i] - b[i]); return s / (a.length / 16); };

test('one cut and an end card, without a layout: the card fills the frame in the film\'s theme; a pop before it', {skip: noFFmpeg}, async () => {
  const out = path.join(tempDir('edit-one'), 'one.mp4');
  const r = await renderFilm({film, storyboard, timings: film.timings, narrationDir: null, out, quality: 'draft', width: 320, height: 180, posterFrame: false,
    edit: {cuts: [{from: 1, to: 2.5}], end: {lines: ['Watch the whole story'], seconds: .5, join: {pop: 1}}}});
  const e = place({cuts: [{from: 1, to: 2.5}], end: {lines: ['x'], seconds: .5, join: {pop: 1}}});
  assert.equal(+ffprobe(out, ['-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames']), e.frames);
  assert.ok(Math.abs(+ffprobe(out, ['-select_streams', 'a:0', '-show_entries', 'stream=duration']) - e.seconds) < .05);
  const bg = hex(film.theme?.palette?.bg ?? '#f3eee3'), card = frameOf(out, e.end.at + 5, [320, 180]);
  assert.ok(near(pixel(card, 320, 4, 4), bg), 'the card\'s paper at the corner');
  assert.ok(near(pixel(frameOf(out, 3, [320, 180]), 320, 160, 150), [0x2a, 0x77, 0xa8], 30), 'the film before it');
  assert.equal(r.edit.end.join.pop, 1);
});

test('a Short released: three cuts with an end card, filling and following; the target turns its poster frame off', {skip: noFFmpeg}, async () => {
  const out = tempDir('short-release');
  const [r] = await makeRelease({storyboard, timings, recipe, kits: [slide], out, post: {title: 'Who has the pebble? #Shorts', audience: 'kids'},
    targets: [{target: 'youtube-shorts', fill: true, header: {title: 'Who has the pebble?', sub: 'Little Aha Stories'}, render: {posterFrame: false, quality: 'draft'}, scale: .5,
      cuts: [{from: 1, to: 4.5, follow: 'focus'}, {from: ['two', 'One pebble'], to: {scene: 'two'}, follow: 'focus', join: {overlap: 3}}, {from: {scene: 'three'}, to: 17}],
      join: {pop: 1}, end: {lines: ['Watch the whole story', 'Counting: From Pebbles to 10', 'Little Aha Stories'], seconds: 1.5}}]});
  const post = JSON.parse(readFileSync(path.join(r.dir, 'post.json'), 'utf8'));
  assert.equal(post.format, 'vertical');
  assert.equal(ffprobe(r.video, ['-select_streams', 'v:0', '-show_entries', 'stream=width,height']), '540,960');
  assert.deepEqual(r.edit.cuts.map(c => c.join?.overlap ?? null), [null, 3, 0]);
  assert.equal(r.edit.end.seconds, 1.5);
  assert.ok(Math.abs(post.seconds - r.edit.seconds) < .01);
  const made = JSON.parse(readFileSync(r.makingOf, 'utf8'));
  assert.equal(made.span.edit.cuts.length, 3, 'the record keeps the edit');
  assert.ok(Array.isArray(made.framing) && made.framing.every(f => Array.isArray(f.keys)), 'and how each cut was framed');
  assert.equal(r.clipped, undefined, 'nobody cut at the edge');
  // posterFrame: false — the first frame is the film's own, not the poster.
  const first = frameOf(r.video, 0, [540, 960]), poster = await (await import('@napi-rs/canvas')).loadImage(readFileSync(path.join(r.work, 'poster.jpg')));
  const c = createCanvas(540, 960), ctx = c.getContext('2d'); ctx.drawImage(poster, 0, 0);
  assert.ok(meanDiff(first, ctx.getImageData(0, 0, 540, 960).data) > 2, 'frame 0 is not the poster');
});

test('the join\'s defaults: a hard cut on the voice\'s silence, no overlap, no pop', () => {
  assert.deepEqual({...JOIN_DEFAULTS}, {cut: 'silence', overlap: 0, pop: 0});
  assert.deepEqual({...readJoin({overlap: 3}, {cut: 'silence', overlap: 0, pop: 2})}, {cut: 'silence', overlap: 3, pop: 0}, 'an overlap drops the pop it would inherit');
});
