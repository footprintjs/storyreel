// Platform safe zones (zones.mjs, the vertical targets' `ui`), the phone still (phone.mjs, still --phone), loudness per
// target (release.mjs · targetLoudness) and the doctor (doctor.mjs, storyreel doctor).
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync, writeFileSync, chmodSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCanvas, loadImage} from '@napi-rs/canvas';
import {compileFilm, evenTimings, renderFilm} from '../src/index.mjs';
import {compileLayout} from '../src/layout.mjs';
import {readZones, readUi, zoneRects, overlapOf, clearSpan, fitBlock, uiFindings, uiReport} from '../src/zones.mjs';
import {loadTarget, checkAdapter, makeRelease, targetLoudness, TARGET_NAMES} from '../src/release.mjs';
import {doctor, doctorText, parseList, fontStatus, requireDoctor, stackFamilies} from '../src/doctor.mjs';
import {phoneSheet, PHONE} from '../src/phone.mjs';
import {loadProject, still} from '../src/tools.mjs';
import {tempDir} from './tmp.mjs';

const storyboard = {title: 'Platform Test', scenes: [
  {id: 'one', title: 'The start', narration: 'A short film about pebbles and sheep, made for a test of everything.'},
  {id: 'two', title: 'The middle', narration: 'One pebble for every single sheep that walks out of the gate.'},
]};
const slide = {name: 'slide', story: {compile: () => ({hang: 1, draw: (c, t) => { c.fillStyle = '#2a77a8'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#fff'; c.fillRect(300 + (t % 2) * 400, 400, 100, 100); },
  // A named face, low and to the right on the frame: the TikTok column covers it in the vertical crop.
  regionsAt: () => [{box: [1100, 600, 1200, 700], path: 'face', label: 'the hero\'s face', name: 'hero face'}]})}};
const inputs = {storyboard, timings: evenTimings(storyboard, {wordSeconds: 1.2}), recipe: {story: {kit: 'slide'}}, kits: [slide]};
const film = await compileFilm(inputs);
const VERTICAL = ['youtube-shorts', 'tiktok', 'instagram-reels'];
const zonesOf = async name => (await loadTarget(name)).adapter.ui;
const px = (zones, w = 1080, h = 1920) => Object.fromEntries(zoneRects(zones, w, h).map(z => [z.name, z.rect.map(v => Math.round(v))]));
const pixelsOf = (draw, w = 1080, h = 1920) => { const c = createCanvas(w, h), ctx = c.getContext('2d'); draw(ctx); return Buffer.from(ctx.getImageData(0, 0, w, h).data); };

test('zones are data: rectangles in fractions of the frame, checked, refused with the fix', () => {
  const zones = readZones([{name: 'action column', box: [.7222, .4375, .2778, .5625], basis: 'measured'}]);
  assert.ok(Object.isFrozen(zones) && Object.isFrozen(zones[0]));
  assert.deepEqual(px(zones)['action column'], [780, 840, 1080, 1920], 'fractions → the format\'s pixels');
  assert.throws(() => readZones([{name: 'strip', box: [0, .8, 1, .3]}]), /ui\.zones\[0\]\.box is \[x, y, width, height\] in fractions of the frame, inside it \(0–1\): \[0, 0\.78, 1, 0\.22\] is the foot's 22%/);
  assert.throws(() => readZones([{name: 'strip', box: [0, .8, 1, .2], basis: 'guess'}]), /basis is 'measured' or 'estimate'/);
  assert.throws(() => readZones([{name: 'strip', box: [0, .8, 1, .2], colour: 'grey'}]), /has unsupported key colour \(a zone is \{name, box, basis\}\)/);
  assert.throws(() => readZones([{box: [0, .8, 1, .2]}]), /name says what the app draws there/);
  assert.throws(() => readUi({zones: [], covered: 'warn'}), /covered is 'report' .* or 'refuse'/);
  assert.throws(() => readUi({zones: [], faces: 'hero'}), /faces lists the named things/);
  assert.deepEqual(readUi({zones: []}), {zones: [], covered: 'report', faces: []}, 'report by default; no faces unless named');
});

test('zone geometry: an overlap needs more than a shared edge; the clear stretch stays centred when it can', () => {
  assert.equal(overlapOf([0, 0, 100, 100], [100, 0, 200, 100]), null, 'a shared edge is no overlap');
  assert.deepEqual(overlapOf([0, 0, 100, 100], [60, 50, 200, 120]), [60, 50, 100, 100]);
  const column = [{name: 'column', rect: [780, 840, 1080, 1920]}];
  assert.deepEqual(clearSpan([120, 960], column), [300, 780], 'narrowed about the centre (540): centred text stays centred');
  assert.deepEqual(clearSpan([120, 960], [{name: 'left', rect: [0, 0, 600, 10]}]), [600, 960], 'the centre covered: the stretch itself');
  assert.equal(clearSpan([120, 960], [{name: 'band', rect: [0, 0, 1080, 10]}]), null, 'a band across: nothing clear');
  // A block: kept untouched when clear, narrowed off a column, moved out of a band.
  const place = ([x0, x1], dy) => ({rects: [[Math.max(x0, 540 - 300), 1300 + dy, Math.min(x1, 540 + 300), 1400 + dy]]});
  const clear = fitBlock(place, [120, 960], [{name: 'top', rect: [0, 0, 1080, 200]}], {height: 1920});
  assert.deepEqual([clear.fitted, clear.covered, clear.placed.rects], [false, [], [[240, 1300, 840, 1400]]]);
  const narrowed = fitBlock(place, [120, 960], column, {height: 1920});
  assert.deepEqual([narrowed.fitted, narrowed.covered, narrowed.placed.rects[0][2]], [true, [], 780]);
  const moved = fitBlock(place, [120, 960], [{name: 'strip', rect: [0, 1250, 1080, 1920]}], {height: 1920});
  assert.deepEqual([moved.fitted, moved.covered, moved.placed.rects[0][3]], [true, [], 1250], 'out of the strip, upward: its nearer side');
  const nowhere = fitBlock(place, [120, 960], [{name: 'all', rect: [0, 0, 1080, 1920]}], {height: 1920});
  assert.equal(nowhere.covered.length, 1, 'no room anywhere: what is still covered is said');
});

test('fitBlock narrows off a column only while the block keeps to two lines inside its rows: else it stays as it was, reported', () => {
  // A block that wraps by its span's width: one line from 700 px, two from 400, three below — no font involved.
  const place = lines => ([x0, x1], dy) => {
    const n = lines(x1 - x0), rects = Array.from({length: n}, (_, i) => [x0 + 20, 1300 + dy + i * 60, x1 - 20, 1360 + dy + i * 60]);
    return {lines: rects.map((_, i) => i), rects};
  };
  const column = [{name: 'column', rect: [780, 840, 1080, 1920]}], span = [120, 960], rows = [1290, 1470];
  const twoLines = fitBlock(place(w => (w >= 700 ? 1 : w >= 400 ? 2 : 3)), span, column, {height: 1920, rows});
  assert.deepEqual([twoLines.fitted, twoLines.placed.rects.length, twoLines.covered], [true, 2, []], 'x 300–780 (480 wide): two lines, clear');
  const threeLines = fitBlock(place(w => (w >= 700 ? 1 : 3)), span, column, {height: 1920, rows});
  assert.deepEqual([threeLines.fitted, threeLines.placed.rects, threeLines.covered.length], [false, [[140, 1300, 940, 1360]], 1], 'three lines would be needed: as it was, and reported');
  const tall = fitBlock(place(w => (w >= 700 ? 1 : 2)), span, column, {height: 1920, rows: [1300, 1360]});
  assert.equal(tall.fitted, false, 'two lines would leave the band\'s rows (a one-line band): as it was');
});

test('the vertical targets declare their app\'s UI as zones, each measured or estimated, with its source and date', async () => {
  for (const name of VERTICAL) {
    const {adapter} = await loadTarget(name);
    assert.ok(adapter.ui.zones.length >= 3 && adapter.ui.zones.every(z => ['measured', 'estimate'].includes(z.basis)), `${name}: every zone says where its numbers come from`);
    // A side band is a number the platform prints, but not UI it says it draws there: an edge is an estimate, everything else in the ad figure measured.
    for (const z of [...adapter.ui.zones, ...adapter.ui.ads].filter(q => /edge/.test(q.name))) assert.equal(z.basis, 'estimate', `${name}: ${z.name} is an estimate`);
    assert.ok(adapter.ui.ads.filter(z => !/edge/.test(z.name)).every(z => z.basis === 'measured'), `${name}: the rest of the published ad safe zone is measured`);
    assert.match(adapter.facts.ui.note, /edges?\b[^.;]*\bestimates?/, `${name}: the note says the edges are estimates`);
    assert.match(adapter.facts.ui.checked, /^\d{4}-\d{2}-\d{2}$/); assert.ok(adapter.facts.ui.sources.length && adapter.facts.ui.note, name);
    assert.equal(adapter.ui.covered, 'report');
    // The captions' box (y 1298–1460) is clear of the foot's strip. The title band's BOX starts at y 285, 3 px above
    // Shorts' top bar (288): its words are drawn lower, so no title of one to three lines, with or without the line under
    // it, reaches any top bar — and none is moved by one.
    const z = px(adapter.ui.zones), ctx = createCanvas(2, 2).getContext('2d');
    assert.ok(z['caption strip'][1] >= 1460 && z['top bar'][3] <= 288, name);
    const bar = adapter.ui.zones.filter(q => q.name === 'top bar');
    for (const title of ['Pebbles', 'One pebble for every sheep: how counting began', 'Learn to Count: the missing crayon, the pebbles, and every sheep that walked out of the gate'])
      for (const sub of [undefined, 'Little Aha Stories']) {
        const fit = compileLayout(film, {format: 'vertical', header: {title, ...(sub ? {sub} : {})}, ui: {zones: bar}}).titleFit(ctx);
        assert.deepEqual([fit.fitted, fit.covered], [false, []], `${name}: "${title}"${sub ? ' with its line' : ''} is drawn below the top bar`);
      }
  }
  // The numbers read off each platform's own figure.
  assert.deepEqual(px((await zonesOf('tiktok')).ads), {'top bar': [0, 0, 1080, 240], 'left edge': [0, 0, 120, 1920], 'right edge': [960, 0, 1080, 1920], 'action column': [780, 840, 1080, 1920], 'caption strip': [0, 1260, 1080, 1920]}, 'TikTok\'s In-Feed template (720×1280: 160, 80, 120 from 720 above the foot, 440)');
  assert.deepEqual(px((await zonesOf('youtube-shorts')).ads), {'top bar': [0, 0, 1080, 288], 'left edge': [0, 0, 48, 1920], 'action column': [888, 0, 1080, 1920], 'caption strip': [0, 1248, 1080, 1920]}, 'Google\'s vertical ad figure (288, 48, 192, 672)');
  assert.deepEqual(px((await zonesOf('instagram-reels')).ads)['caption strip'], [0, 1248, 1080, 1920], 'Meta\'s 35% at the foot');
  for (const name of TARGET_NAMES.filter(n => !VERTICAL.includes(n))) assert.equal((await loadTarget(name)).adapter.ui, undefined, `${name} declares no app UI: its outputs are as they were`);
});

test('a target\'s own ui: the published ad zone, zones of its own, faces, refuse, or none; an adapter\'s ui is checked', async () => {
  const ads = (await loadTarget({target: 'tiktok', ui: {zones: 'ads', covered: 'refuse', faces: ['hero face']}})).options.ui;
  assert.deepEqual([ads.zones.at(-1).box, ads.covered, ads.faces], [[0, .65625, 1, .34375], 'refuse', ['hero face']]);
  assert.equal((await loadTarget({target: 'tiktok', ui: false})).options.ui, undefined, 'false: no app UI, the bands as the format places them');
  await assert.rejects(loadTarget({target: 'youtube', ui: {covered: 'refuse'}}), /YouTube declares no app UI over its video \(ui\.zones\): give ui\.zones yourself/);
  await assert.rejects(loadTarget({target: 'youtube', ui: {zones: 'ads'}}), /ui\.zones 'ads' is the platform's published ad safe zone, and YouTube declares none/);
  await assert.rejects(loadTarget({target: 'tiktok', ui: {zones: [{name: 'x', box: [0, 0, 2, 1]}]}}), /release target "tiktok": ui\.zones\[0\]\.box is \[x, y, width, height\]/);
  await assert.rejects(loadTarget({target: 'tiktok', ui: {colour: 'grey'}}), /ui has unsupported key colour/);
  const {adapter} = await loadTarget('tiktok');
  assert.throws(() => checkAdapter({...adapter, ui: {zones: [{name: 'x', box: [0, 0, 1, 1.5]}]}}), /release target "tiktok": ui\.zones\[0\]\.box/);
  assert.throws(() => checkAdapter({...adapter, loudness: {I: -14}}), /loudness\.TP is missing/);
  assert.throws(() => checkAdapter({...adapter, facts: {...adapter.facts, ui: {checked: '2026-10-27'}}}), /facts\.ui, when given, is \{checked: date, sources: \[url\], note\?\}/);
});

// The 0.22.0 bands, as they were drawn (layout.mjs · drawHeader, captions.mjs · drawCaption, before the zones): a layout
// with no ui — and one whose zones touch none of its text — draws exactly these pixels.
function wrap(ctx, words, width) { const out = ['']; for (const word of words) { const next = out.at(-1) ? `${out.at(-1)} ${word}` : word; if (ctx.measureText(next).width > width && out.at(-1)) out.push(word); else out[out.length - 1] = next; } return out; }
function balancedLines(ctx, text, width) { const words = text.split(/\s+/).filter(Boolean), lines = wrap(ctx, words, width); if (lines.length < 2) return lines; let lo = 0, hi = width; for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (wrap(ctx, words, mid).length > lines.length) lo = mid; else hi = mid; } return wrap(ctx, words, hi); }
function header022(ctx, {title, sub, box: [x, y, w, h]}, ink, sans) {
  ctx.save(); ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let size = 64; const font = s => `800 ${s}px ${sans}`; const lines = text => balancedLines(ctx, text, w);
  ctx.font = font(size); let wrapped = lines(title);
  while (size > 34 && wrapped.length * size * 1.15 + (sub ? 44 : 0) > h) { size -= 4; ctx.font = font(size); wrapped = lines(title); }
  const total = wrapped.length * size * 1.15 + (sub ? 44 : 0); let cy = y + h / 2 - total / 2 + size * .55;
  for (const line of wrapped) { ctx.fillText(line, x + w / 2, cy); cy += size * 1.15; }
  if (sub) { ctx.font = `600 32px ${sans}`; ctx.globalAlpha *= .7; ctx.fillText(sub, x + w / 2, cy + 6); }
  ctx.restore();
}
function caption022(ctx, caption, [x, y, w, h], {size = 54, font, ink = '#ffffff', accent = '#ffd34d', pill = 'rgba(20, 22, 30, .82)'} = {}) {
  if (!caption) return;
  ctx.save(); ctx.font = `800 ${size}px ${font}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const space = ctx.measureText(' ').width, widths = caption.words.map(word => ctx.measureText(word.text).width);
  const lines = [[]]; let lineWidth = 0;
  caption.words.forEach((_, i) => { const add = (lines.at(-1).length ? space : 0) + widths[i]; if (lines.at(-1).length && lineWidth + add > w - size) { lines.push([]); lineWidth = 0; } lineWidth += (lines.at(-1).length ? space : 0) + widths[i]; lines.at(-1).push(i); });
  const lineH = size * 1.25, top = y + h / 2 - (lines.length * lineH) / 2;
  lines.forEach((line, n) => {
    const lw = line.reduce((s, i, k) => s + widths[i] + (k ? space : 0), 0), cy = top + lineH * (n + .5); let cx = x + w / 2 - lw / 2;
    ctx.fillStyle = pill; ctx.beginPath(); ctx.roundRect(cx - size * .35, cy - lineH / 2, lw + size * .7, lineH, lineH * .3); ctx.fill();
    for (const i of line) { ctx.fillStyle = i === caption.active ? accent : ink; ctx.fillText(caption.words[i].text, cx, cy + 1); cx += widths[i] + space; }
  });
  ctx.restore();
}

test('byte for byte: without ui (or with zones its text never touches) the bands are drawn as 0.22.0 drew them', () => {
  const spec = {format: 'vertical', captions: true, header: {title: 'One pebble for every sheep: how counting began', sub: 'a test'}};
  const plain = compileLayout(film, spec), apart = compileLayout(film, {...spec, ui: {zones: [{name: 'corner', box: [0, 0, .02, .02]}]}});
  const sans = film.theme?.type?.sans ?? '"Helvetica Neue", Helvetica, Arial, sans-serif', ink = film.theme?.palette?.ink ?? '#23211c', {captions} = plain.boxes;
  for (const t of [0.5, 2, 5.5, 9, 14, 20]) {
    const reference = pixelsOf(ctx => { header022(ctx, {title: spec.header.title, sub: 'a test', box: [100, 285, 880, 185]}, ink, sans); caption022(ctx, plain.captionAt(t), captions, {size: 54, font: sans}); });
    assert.ok(pixelsOf(ctx => plain.overlay(ctx, t)).equals(reference), `t = ${t}: no ui, the 0.22.0 pixels`);
    assert.ok(pixelsOf(ctx => apart.overlay(ctx, t)).equals(reference), `t = ${t}: zones that touch nothing, the same pixels`);
  }
});

test('TikTok: a caption that would reach under the buttons is narrowed about its centre, and only that one', () => {
  const zones = readUi({zones: [{name: 'action column', box: [.7222, .4375, .2778, .5625]}]}).zones;
  const plain = compileLayout(film, {format: 'vertical', captions: true}), fitted = compileLayout(film, {format: 'vertical', captions: true, ui: {zones}});
  const ctx = createCanvas(2, 2).getContext('2d'), long = {words: 'pebbles and sheep, made'.split(' ').map(text => ({text})), active: 0}, short = {words: [{text: 'One'}], active: 0};
  const before = plain.ui === undefined && fitted.captionFit(ctx, short);
  assert.deepEqual([before.fitted, before.covered], [false, []], 'a short caption is clear: drawn as it always was');
  const after = fitted.captionFit(ctx, long);
  assert.equal(after.fitted, true); assert.deepEqual(after.covered, []);
  assert.ok(after.rects.every(r => r[2] <= 780 + .5 && r[0] >= 300 - .5), `inside x 300–780, centred on the picture: ${JSON.stringify(after.rects)}`);
  for (const t of [1.5, 3]) assert.ok(pixelsOf(c => plain.overlay(c, t, {caption: short})).equals(pixelsOf(c => fitted.overlay(c, t, {caption: short}))), 'the clear one: the same pixels');
});

test('a column never moves a caption up or down: a word too wide for the clear stretch stays low and is reported', () => {
  const zones = readUi({zones: [{name: 'action column', box: [.7222, .4375, .2778, .5625]}]}).zones;
  const plain = compileLayout(film, {format: 'vertical', captions: true, ui: {zones: []}}), fitted = compileLayout(film, {format: 'vertical', captions: true, ui: {zones}});
  const ctx = createCanvas(2, 2).getContext('2d'), cap = text => ({words: text.split(' ').map(w => ({text: w})), active: 0});
  const rows = rects => [Math.min(...rects.map(r => r[1])), Math.max(...rects.map(r => r[3]))];
  const word = fitted.captionFit(ctx, cap('internationalisation'));
  assert.equal(word.covered.length, 1, 'still under the column: reported');
  assert.equal(word.covered[0].zone, 'action column');
  const [top, bottom] = rows(word.rects), box = plain.boxes.captions;
  assert.ok(top >= box[1] && bottom <= box[1] + box[3], `kept in the captions' band (y ${box[1]}–${box[1] + box[3]}), not moved into the picture: ${top}–${bottom}`);
  // Whatever the machine's face measures, a caption under a column ends one of two ways: narrowed to at most two lines
  // inside its band and clear, or drawn exactly as it was and reported.
  for (const text of ['responsibilities and communication', 'pebbles and sheep, made', 'understanding responsibilities together']) {
    const before = plain.captionFit(ctx, cap(text)), after = fitted.captionFit(ctx, cap(text)), [t2, b2] = rows(after.rects);
    assert.ok(t2 >= box[1] - .5 && b2 <= box[1] + box[3] + .5, `${text}: inside the band`);
    if (after.fitted) assert.deepEqual([after.rects.length <= 2, after.covered], [true, []], `${text}: narrowed, two lines at most, clear`);
    else assert.deepEqual([after.rects, [...new Set(after.covered.map(h => h.zone))]], [before.rects, before.rects.some(r => r[2] > 780.5) ? ['action column'] : []], `${text}: as it was, and reported`);
  }
  const {findings} = uiFindings(film, compileLayout(film, {format: 'vertical', captions: true, ui: {zones}}), {});
  assert.ok(findings.every(f => f.kind === 'caption' && f.rect[1] >= box[1] - 1), 'nothing reported has been moved up');
});

test('the check fires on a caption under the UI, and on a named face; with covered: \'refuse\' the render refuses before a frame is drawn', async t => {
  const everywhere = [{name: 'whole screen', box: [0, 0, 1, 1]}];
  const framed = compileLayout(film, {format: 'vertical', captions: true, header: {title: 'Pebbles'}, ui: {zones: everywhere}});
  const {findings} = uiFindings(film, framed, {from: 0, to: 10});
  assert.equal(findings[0].kind, 'title'); assert.ok(findings.filter(f => f.kind === 'caption').length >= 2, JSON.stringify(findings.map(f => f.kind)));
  assert.ok(findings.every(f => f.zone === 'whole screen' && f.at < 10));
  // A face: the hero's face, under TikTok's column through the vertical crop (centred: frame x 200–1400 → output 0–1080).
  const tiktok = compileLayout(film, {format: 'vertical', ui: {zones: (await zonesOf('tiktok')).zones, faces: ['hero face']}});
  const report = uiReport(film, [{framed: tiktok, from: 0, to: 2}]);
  assert.deepEqual(report.findings.map(f => [f.kind, f.name, f.zone, f.at, f.until]), [['face', 'hero face', 'action column', 0, 2]], 'one run, from its first sample to the end of the stretch');
  assert.match(report.findings[0].text, /^"hero face" at 0\.00 s–2\.00 s is under the action column \(x 810–900, y 1020–1110\)$/);
  assert.match(report.findings[0].fix, /frame "hero face" off the action column \(it covers x 780–1080, y 840–1920\)/);
  // Refused before anything is written: the render's folder is never made.
  const out = path.join(tempDir('zones', t), 'refused', 'film.mp4');
  await assert.rejects(renderFilm({film, storyboard, timings: film.timings, out, layout: {format: 'vertical', captions: true, ui: {zones: everywhere, covered: 'refuse'}}}),
    /^Error: layout\.ui: \d+ places are under the app's UI \(covered: 'refuse'\): the caption "A short film[^"]*" at 0\.\d\d s is under the whole screen \(x \d+–\d+, y \d+–\d+\) — give layout\.captions\.box a box clear of the whole screen \(it covers x 0–1080, y 0–1920\), or a shorter chunk \(captions\.maxWords\);.*Or covered: 'report' to render and say so$/);
  assert.equal(existsSync(path.dirname(out)), false, 'refused before a folder is made');
});

test('a render reports what is under the UI (and how the bands were fitted); without ui, nothing is said', async t => {
  const dir = tempDir('zones-render', t), zones = (await zonesOf('tiktok')).zones;
  const r = await renderFilm({film, storyboard, timings: film.timings, out: path.join(dir, 'a', 'film.mp4'), to: 1, quality: 'draft', whole: true,
    layout: {format: 'vertical', captions: true, header: {title: 'Pebbles'}, ui: {zones, faces: ['hero face']}}});
  assert.equal(r.ui.covered, 'report'); assert.equal(r.ui.ok, false);
  assert.deepEqual(r.ui.zones.find(z => z.name === 'action column'), {name: 'action column', basis: 'measured', rect: [780, 840, 1080, 1920]});
  assert.deepEqual(r.ui.findings.map(f => f.kind), ['face']);
  const plain = await renderFilm({film, storyboard, timings: film.timings, out: path.join(dir, 'b', 'film.mp4'), to: 1, quality: 'draft', whole: true, layout: {format: 'vertical', captions: true}});
  assert.equal(plain.ui, undefined);
});

test('loudness per target: Shorts, TikTok and Reels name −14 LUFS and −1 dBTP; the others keep the render\'s default', async () => {
  for (const name of VERTICAL) {
    const {adapter} = await loadTarget(name);
    assert.deepEqual(adapter.loudness, {I: -14, TP: -1}, name);
    assert.ok(adapter.facts.loudness.sources.length && /publishes no loudness target/.test(adapter.facts.loudness.note), `${name}: where the goal comes from, and that it is an estimate`);
    assert.deepEqual(targetLoudness(adapter), {I: -14, TP: -1});
    assert.deepEqual(targetLoudness(adapter, {}, {loudness: {I: -16, TP: -1.5}}), {I: -16, TP: -1.5}, 'one value the caller chose for the film wins');
    assert.deepEqual(targetLoudness(adapter, {loudness: {I: -12, TP: -1}}, {loudness: {I: -16, TP: -1.5}}), {I: -12, TP: -1}, 'the target\'s own over everything');
  }
  for (const name of TARGET_NAMES.filter(n => !VERTICAL.includes(n))) assert.equal(targetLoudness((await loadTarget(name)).adapter), undefined, `${name}: the render's own default, so its output is as it was`);
  await assert.rejects(loadTarget({target: 'tiktok', render: {loudness: {I: -14}}}), /release target "tiktok": render\.loudness\.TP is missing/);
});

test('a release: each target at its platform\'s loudness, its app\'s UI reported, the record keeping both', async t => {
  const out = tempDir('platforms', t), post = {title: 'Pebbles', description: 'How counting began.', audience: 'general'};
  const [yt, tt] = await makeRelease({...inputs, out, render: {quality: 'draft'}, targets: [{target: 'youtube', to: 1}, {target: 'tiktok', to: 1, ui: {faces: ['hero face']}}], post});
  assert.deepEqual([yt.loudness.I, yt.loudness.TP, tt.loudness.I, tt.loudness.TP], [-16, -1.5, -14, -1], 'YouTube as it was; TikTok at its goal');
  assert.equal(yt.covered, undefined); assert.deepEqual(tt.covered.map(f => [f.kind, f.name, f.zone]), [['face', 'hero face', 'action column']]);
  const made = JSON.parse(readFileSync(tt.makingOf, 'utf8'));
  assert.deepEqual([made.loudness.target.I, made.ui.findings.length, made.ui.zones.length], [-14, 1, 5]);
  assert.equal(JSON.parse(readFileSync(yt.makingOf, 'utf8')).ui, undefined);
  assert.equal(JSON.parse(readFileSync(path.join(tt.dir, 'post.json'), 'utf8')).facts.ui.checked, '2026-10-27', 'the post says when the zones were checked');
});

// FFmpeg's lists as FFmpeg 9 prints them, cut short, and as FFmpeg 4.4 printed its formats (two flag columns).
const ENCODERS = 'Encoders:\n V..... = Video\n A..... = Audio\n ------\n V....D libx264              libx264 H.264 / AVC\n A....D aac                  AAC (Advanced Audio Coding)\n';
const FILTERS = 'Filters:\n  T.. = Timeline support\n  | = Source or sink filter\n  ------\n .. acrossfade        N->A       Cross fade.\n .. anullsrc          |->A       Null audio source.\n TS xfade             VV->V      Cross fade.\n .. amix              N->A       Mix.\n';
const MUXERS9 = 'Formats:\n D.. = Demuxing supported\n .E. = Muxing supported\n ..d = Is a device\n ---\n  E  mp4             MP4 (MPEG-4 Part 14)\n  E  dash            DASH Muxer\n';
const DEMUXERS9 = 'Formats:\n D.. = Demuxing supported\n ---\n D   concat          Virtual concatenation script\n D d lavfi           Libavfilter virtual input device\n D   mov,mp4,m4a,3gp,3g2,mj2 QuickTime / MOV\n';
const FORMATS44 = 'File formats:\n D. = Demuxing supported\n .E = Muxing supported\n --\n D  concat          Virtual concatenation script\n  E mp4             MP4 (MPEG-4 Part 14)\n DE avi             AVI (Audio Video Interleaved)\n';
// FFmpeg 4.4 to 8.0 print no dashed line under the filters' legend (fftools/opt_common.c · show_filters; 4.4: cmdutils.c),
// three flag columns to 7.1 (" %c%c%c %-17s %-10s %s") and two in 8.0 (" %c%c %-17s %-10s %s"). The legend, verbatim:
const LEGEND_71 = 'Filters:\n  T.. = Timeline support\n  .S. = Slice threading\n  ..C = Command support\n  A = Audio input/output\n  V = Video input/output\n  N = Dynamic number and/or type of input/output\n  | = Source or sink filter\n';
const LEGEND_80 = 'Filters:\n  T.. = Timeline support\n  .S. = Slice threading\n  A = Audio input/output\n  V = Video input/output\n  N = Dynamic number and/or type of input/output\n  | = Source or sink filter\n';
const filterLine = (flags, name, pads, about) => ` ${flags} ${name.padEnd(17)} ${pads.padEnd(10)} ${about}`;
const FILTERS_71 = LEGEND_71 + [filterLine('...', 'abench', 'A->A', 'Benchmark part of a filtergraph.'), filterLine('..C', 'acrossfade', 'AA->A', 'Cross fade two input audio streams.'),
  filterLine('...', 'anullsrc', '|->A', 'Null audio source, return empty audio frames.'), filterLine('..C', 'amix', 'N->A', 'Audio mixing.'), filterLine('TSC', 'scale', 'V->V', 'Scale the input video size and/or convert the image format.')].join('\n') + '\n';
const FILTERS_80 = LEGEND_80 + [filterLine('..', 'loudnorm', 'A->A', 'EBU R128 loudness normalization'), filterLine('TS', 'xfade', 'VV->V', 'Cross fade one video with another video.')].join('\n') + '\n';
const fake = (lists, version = 'ffmpeg version 7.1.1 Copyright (c) the FFmpeg developers') => (command, args) => (args.at(-1) === '-version' ? {status: 0, stdout: version} : {status: 0, stdout: lists[args.at(-1)] ?? ''});

test('the doctor reads FFmpeg\'s own lists: what each names, in this FFmpeg\'s format and an older one\'s', () => {
  assert.deepEqual([...parseList('encoder', ENCODERS)], ['libx264', 'aac']);
  assert.deepEqual([...parseList('filter', FILTERS)], ['acrossfade', 'anullsrc', 'xfade', 'amix']);
  assert.deepEqual([...parseList('muxer', MUXERS9)], ['mp4', 'dash'], 'a name starting with a flag letter is still the name');
  assert.deepEqual([...parseList('demuxer', DEMUXERS9)], ['concat', 'lavfi', 'mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2'], 'a device flag, and a line naming several');
  assert.deepEqual([...parseList('demuxer', FORMATS44)], ['concat', 'mp4', 'avi'], 'FFmpeg 4.4\'s two flag columns');
  assert.deepEqual([...parseList('filter', FILTERS_71)], ['abench', 'acrossfade', 'anullsrc', 'amix', 'scale'], 'FFmpeg 4.4–7.1: no dashed line, three flag columns');
  assert.deepEqual([...parseList('filter', FILTERS_80)], ['loudnorm', 'xfade'], 'FFmpeg 8.0: no dashed line, two flag columns');
  for (const legend of [LEGEND_71, LEGEND_80]) assert.equal(parseList('filter', legend), null, 'a legend alone names no filter: unknown');
  for (const text of ['', 'ffmpeg: unrecognized option', 'Encoders:\n ------\n', 'Encoders:\n V..... = Video\n A..... = Audio\n']) assert.equal(parseList('encoder', text), null, `${JSON.stringify(text)}: not a list — unknown, never missing`);
  assert.deepEqual(stackFamilies('"Avenir Next", Arial ,sans-serif'), ['Avenir Next', 'Arial', 'sans-serif']);
});

test('the doctor: available, missing (the fix named), unknown when a list cannot be read — never a guess', () => {
  const lists = {'-encoders': ENCODERS, '-filters': FILTERS, '-muxers': MUXERS9, '-demuxers': DEMUXERS9}, fonts = {has: f => f === 'Arial' || f === 'Menlo' || f === 'Georgia' || f === 'Caveat'};
  const r = doctor({ffmpeg: 'ff', ffprobe: 'fp', render: {edit: true}, run: fake(lists), fonts});
  const status = name => r.items.find(i => i.name === name)?.status;
  assert.deepEqual([status('libx264'), status('acrossfade'), status('lavfi'), status('loudnorm'), status('setparams')], ['available', 'available', 'available', 'missing', undefined], 'only what this render needs is asked (no high quality: no setparams)');
  assert.match(r.items.find(i => i.name === 'loudnorm').why, /ff has no filter called loudnorm: use an FFmpeg built with it .* FFMPEG_BIN \(--ffmpeg\)/);
  assert.equal(r.ffprobe, null, 'no check: ffprobe not asked'); assert.equal(r.ok, false); assert.equal(r.sure, true);
  assert.throws(() => requireDoctor(r, 'release'), /^Error: release: this machine cannot make it — missing: filter loudnorm \(loudness, in two passes\), .*storyreel doctor lists what is there$/);
  assert.match(doctorText(r), /^ffmpeg 7\.1\.1 \(ff\): available\n\nmissing {3}filter {2}loudnorm/);
  // A list that cannot be read: unknown, with why — and the render is not refused for it.
  const garbled = doctor({ffmpeg: 'ff', render: {}, run: fake({...lists, '-filters': 'Filters:\nnothing here'}), fonts});
  assert.ok(garbled.items.filter(i => i.kind === 'filter').every(i => i.status === 'unknown' && /printed no list this doctor can read/.test(i.why)));
  assert.deepEqual([garbled.ok, garbled.sure], [true, false]); assert.doesNotThrow(() => requireDoctor(garbled));
  const failing = doctor({ffmpeg: 'ff', render: {}, fonts, run: (c, args) => (args.at(-1) === '-version' ? {status: 0, stdout: 'ffmpeg version 7'} : {status: 1, stderr: 'Segmentation fault'})});
  assert.ok(failing.items.filter(i => i.kind !== 'program' && i.kind !== 'font').every(i => i.status === 'unknown' && /ff did not answer \(exit 1\): Segmentation fault/.test(i.why)));
  // No FFmpeg at all: it is missing, and what it would list is unknown.
  const none = doctor({ffmpeg: '/nowhere/ffmpeg', render: {}, fonts, run: () => ({status: null, error: Object.assign(new Error('spawnSync ENOENT'), {code: 'ENOENT'})})});
  assert.equal(none.ffmpeg.status, 'missing'); assert.match(none.ffmpeg.why, /there is no \/nowhere\/ffmpeg to run: install FFmpeg/);
  assert.ok(none.items.filter(i => i.kind === 'encoder').every(i => i.status === 'unknown'));
});

test('the doctor\'s fonts: the family a stack is drawn in, missing when none is installed, unknown when the fonts cannot be read', () => {
  assert.deepEqual(fontStatus('"Avenir Next",Arial,sans-serif', {has: f => f === 'Arial'}), {status: 'available', why: 'drawn in Arial'});
  assert.equal(fontStatus('"Avenir Next",Arial,sans-serif', {has: () => false}).status, 'missing');
  assert.equal(fontStatus('"Avenir Next",Arial', {has: () => { throw new Error('no fonts'); }}).status, 'unknown');
  const r = doctor({ffmpeg: 'ff', render: {}, run: fake({'-encoders': ENCODERS, '-filters': FILTERS, '-muxers': MUXERS9, '-demuxers': DEMUXERS9}), fonts: {has: () => false}, themes: ['paper']});
  assert.ok(r.missing.some(i => i.kind === 'font')); assert.doesNotThrow(() => requireDoctor({...r, missing: r.missing.filter(i => i.kind === 'font')}), 'a font that falls back is said, never refused');
  assert.equal(doctor({ffmpeg: 'ff', render: {}, run: fake({}), fonts: null, themes: ['paper']}).items.filter(i => i.kind === 'font').every(i => i.status === 'unknown'), true);
});

test('a release asks the doctor first: no FFmpeg, or one without loudnorm, refuses in seconds, before anything renders', async t => {
  const out = tempDir('doctor-release', t), started = Date.now();
  await assert.rejects(makeRelease({...inputs, out, render: {ffmpeg: '/nowhere/ffmpeg'}, targets: ['youtube'], post: {title: 'Pebbles', audience: 'kids'}}),
    /^Error: release: this machine cannot make it — missing: program ffmpeg \(every render: the picture, the sound, the mux\)\. there is no \/nowhere\/ffmpeg to run/);
  assert.ok(Date.now() - started < 10000); assert.equal(existsSync(path.join(out, 'youtube')), false, 'nothing rendered');
  // An FFmpeg as Ubuntu's apt gives it (no dashed line under the filters' legend) built without loudnorm: refused, naming it.
  const bin = path.join(tempDir('fake-ffmpeg', t), 'ffmpeg'), lists = {'-encoders': ENCODERS, '-filters': FILTERS_71, '-muxers': MUXERS9, '-demuxers': DEMUXERS9};
  writeFileSync(bin, `#!/usr/bin/env node\nconst lists = ${JSON.stringify(lists)}, flag = process.argv.at(-1);\nprocess.stdout.write(flag === '-version' ? 'ffmpeg version 6.1.1-3ubuntu5 Copyright (c) 2000-2023 the FFmpeg developers\\n' : lists[flag] ?? '');\n`);
  chmodSync(bin, 0o755);
  await assert.rejects(makeRelease({...inputs, out, render: {ffmpeg: bin}, targets: ['youtube'], post: {title: 'Pebbles', audience: 'kids'}}),
    /^Error: release: this machine cannot make it — missing: filter loudnorm \(loudness, in two passes\), filter ebur128 .*has no filter called loudnorm: use an FFmpeg built with it/);
  assert.equal(existsSync(path.join(out, 'youtube')), false, 'nothing rendered');
});

test('covered: \'refuse\' in a release refuses before any target renders and before any folder is made', async t => {
  const out = tempDir('refuse-first', t), everywhere = [{name: 'whole screen', box: [0, 0, 1, 1]}];
  await assert.rejects(makeRelease({...inputs, out, targets: [{target: 'youtube', to: 1}, {target: 'tiktok', to: 2, ui: {zones: everywhere, covered: 'refuse'}}], post: {title: 'Pebbles', audience: 'general'}}),
    /^Error: release to TikTok: layout\.ui: \d+ places? (is|are) under the app's UI \(covered: 'refuse'\): the title band at 0\.00 s is under the whole screen/);
  assert.deepEqual(readdirSync(out), [], 'YouTube, listed first, was not rendered, and no folder was made');
  // Its part only: a cut whose captions are clear of a zone at the top passes, and the release goes on (checked, not rendered here).
  const top = [{name: 'top bar', box: [0, 0, 1, .125]}];
  const {options} = await loadTarget({target: 'tiktok', to: 2, ui: {zones: top, covered: 'refuse'}});
  assert.equal(options.ui.covered, 'refuse');
});

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
test('storyreel doctor: text for people, --json for agents, exit 1 when something a render needs is missing', {skip: spawnSync('ffmpeg', ['-version']).error ? 'no ffmpeg' : false}, () => {
  const json = spawnSync(process.execPath, [cli, 'doctor', '--json'], {encoding: 'utf8'});
  assert.equal(json.status, 0, json.stderr);
  const report = JSON.parse(json.stdout);
  assert.equal(report.ffmpeg.status, 'available'); assert.ok(report.items.some(i => i.name === 'loudnorm' && i.status === 'available'));
  const missing = spawnSync(process.execPath, [cli, 'doctor', '--ffmpeg', '/nowhere/ffmpeg'], {encoding: 'utf8'});
  assert.equal(missing.status, 1); assert.match(missing.stdout, /Not ready: program ffmpeg missing — a render would fail\./);
  assert.equal(spawnSync(process.execPath, [cli, 'doctor', '--loud'], {encoding: 'utf8'}).status, 2);
  assert.match(spawnSync(process.execPath, [cli, 'help', 'doctor'], {encoding: 'utf8'}).stdout, /^storyreel doctor \[--json\]/);
});

test('a phone still: the frames at phone size, the app\'s UI as grey shapes, what is under it outlined and said', async t => {
  const zones = (await zonesOf('tiktok')).zones, moments = [{t: 1, label: 'one'}, {t: 5, label: 'two'}];
  const {png, frames} = await phoneSheet(film, {layout: {format: 'vertical', captions: true, header: {title: 'Pebbles'}, ui: {zones, faces: ['hero face']}}, moments});
  const img = await loadImage(png), {pad, bezel, width} = PHONE;
  assert.deepEqual([img.width, img.height], [pad + 2 * (width + 2 * bezel + pad), pad + Math.round(1920 * width / 1080) + 2 * bezel + PHONE.label + pad], 'two phones, 390 px across');
  assert.deepEqual(frames.map(f => f.covered.map(h => [h.kind, h.zone])), [[['face', 'action column']], [['face', 'action column']]]);
  // Through the review tool, as an agent calls it: still --phone <target>.
  const project = await loadProject({cwd: fileURLToPath(new URL('./fixtures/tools/', import.meta.url)), out: tempDir('phone', t)});
  const s = await still(project, {phone: 'tiktok', at: 'one+2.5,two+0'});
  assert.ok(existsSync(s.file) && path.basename(s.file).startsWith('phone-tiktok-'), s.file);
  assert.match(s.text, /· 2 phones \(TikTok, 390 px wide\): one\+2\.5 \([\d.]+ s\), two\+0 \([\d.]+ s\)\nthe app's UI: top bar \(measured\), left edge \(estimate\), right edge \(estimate\), action column \(measured\), caption strip \(estimate\)\n/);
  await assert.rejects(still(project, {phone: 'myspace', at: 'one+1'}), /still: --phone names a release target \(youtube, youtube-shorts/);
  await assert.rejects(still(project, {phone: 'tiktok', at: 'one+1', width: 50}), /with --phone, width is each phone's width in pixels, 200–1080/);
  await assert.rejects(still(project, {at: 'one+1', title: 'x'}), /title is the title band's words in a phone still/);
});
