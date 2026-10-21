// The chat edit loop (changes.mjs, storyreel changes): what an edit changed, read before anything is drawn — the full
// render's own keys, compared with its cache — then only those pieces drawn into the cache with a short clip of them,
// after which the full render only joins.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {writeFileSync, readFileSync, mkdirSync, existsSync, symlinkSync, readdirSync, rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeFilm, previewChanges, evenTimings} from '../src/index.mjs';
import {loadInputs, loadProject, fullRender, clockSeconds, TOOLS} from '../src/tools.mjs';
import {changedRanges, changesText, clockOf, reviewWindows} from '../src/segments.mjs';
import {folderStore} from '../src/segments/store.mjs';
import {tempDir} from './tmp.mjs';

const has = cmd => !spawnSync(cmd, ['-version']).error;
const FF = has('ffmpeg') && has('ffprobe') ? false : 'needs ffmpeg and ffprobe';
const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));

/**
 * A project of three scenes drawn by a tiny kit (a square moving on the film's clock; --still 1: standing), its full
 * render small; --edit 1 changes the second scene's entry, --longer 1 says five words more at the start of the first (19 whole
 * frames: a later piece moves and keeps its key), --force <scene> draws that scene's pieces always, --samples n checks n frames
 * of each, --dressed 1 adds a cast, strings, a layout and reduced motion, --voice names a voice.
 */
const CONFIG = `const plain = still => ({name: 'plain', story: {compile: spec => ({hang: 1, draw: (c, t) => {
  c.fillStyle = spec.tone === 2 ? '#c9b49a' : '#f3eee3'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#222'; c.fillRect(100 + (still ? 0 : t * 40), 600, 40, 40);
}})}});
export default {film: flags => ({
  storyboard: {title: 'Changes', scenes: [
    {id: 'one', narration: (flags.longer ? 'Here we begin, slowly now. ' : '') + 'A first scene with a few words in it, said slowly. It goes on for a while, so the square has time to move.'},
    {id: 'two', narration: (flags.dressed ? '{{hero}} says a second scene, a little shorter.' : 'And a second scene, a little shorter,') + ' with a sentence or two. Then it ends.'},
    {id: 'three', narration: 'The third scene closes the film with a last few words about the moving square.'}]},
  recipe: {story: {kit: 'plain'}, stages: [{type: 'world', scene: 'two', enter: 'fade', world: {kit: 'plain', ...(flags.edit ? {tone: 2} : {}), ...(flags.dressed ? {title: {$string: 'title'}} : {})}},
    {type: 'world', scene: 'three', enter: 'fade', world: {kit: 'plain'}}]},
  kits: [plain(Boolean(flags.still))], out: 'out', ...(flags.voice ? {narrationDir: flags.voice, pacing: {sceneTail: 1, holds: [{scene: 'one', after: 'said slowly', seconds: 1.2}]}} : {}),
  // Dressed: a cast in the narration and the strings, a string the second scene's entry names, the config's layout (the
  // full render takes it: no render.layout), and reduced motion.
  ...(flags.dressed ? {cast: {hero: {name: 'Amaira'}}, strings: {title: '{{hero}} counts'}, layout: {format: 'landscape', captions: true, scale: .5}, reducedMotion: true} : {}),
  render: {...(flags.dressed ? {} : {width: 320, height: 180}), fps: 10, quality: 'draft',
    segments: {chunkSeconds: 3, ...(flags.force ? {force: [flags.force]} : {}), ...(flags.samples ? {samples: Number(flags.samples)} : {})}},
})};
`;
const project = t => { const dir = tempDir('changes', t); writeFileSync(path.join(dir, 'storyreel.config.mjs'), CONFIG); return dir; };
const full = async (dir, flags = {}) => fullRender(await loadInputs({cwd: dir, ...flags}));
const picture = made => JSON.parse(readFileSync(made.makingOf, 'utf8')).picture;
const probe = (file, entries) => spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', entries, '-of', 'json', file], {encoding: 'utf8'});

test('the lines: one per run of changed pieces, its scenes and reasons once each, whole seconds that hold it, then the count', () => {
  const piece = (index, why, scenes = ['a']) => ({index, f0: index * 60, f1: index * 60 + 60, from: index * 6, to: index * 6 + 6, scenes, why});
  const pieces = [piece(0, null), piece(1, 'words changed'), piece(2, 'words changed, beats moved', ['a', 'b']), piece(3, 'words changed', ['b']), piece(4, null, ['b']), piece(5, 'forced', ['c'])];
  const ranges = changedRanges(pieces);
  assert.deepEqual(ranges.map(r => [r.first, r.last, r.scenes, r.why]), [[1, 3, ['a', 'b'], ['words changed', 'beats moved']], [5, 5, ['c'], ['forced']]]);
  assert.equal(changesText({pieces, ranges, total: 36.4}), '0:06–0:24 a + b · words changed, beats moved\n0:30–0:36 c · forced\n4 of 6 pieces changed (0:24 of 0:36)', 'each reason said once');
  const odd = [{...piece(0, 'new'), from: 12.03, to: 16.5}];
  assert.equal(changesText({pieces: odd, ranges: changedRanges(odd), total: 257, cache: '/out/.storyreel/segments/x'}),
    '0:12–0:17 a · new\n1 of 1 pieces changed (0:04 of 4:17) · none kept yet in /out/.storyreel/segments/x', 'a range is said in whole seconds that hold it; a cache with none of the film says where it is');
  const many = Array.from({length: 25}, (_, i) => piece(i, i % 2 ? 'new' : null));
  assert.match(changesText({pieces: many, ranges: changedRanges(many), total: 150}), /\n… 2 more ranges\n12 of 25 pieces changed/, 'at most 10 ranges said, the rest counted');
  assert.equal(changesText({pieces: [piece(0, null)], ranges: [], total: 6}), '0 of 1 pieces changed (0:00 of 0:06)');
  assert.deepEqual([clockOf(59.99), clockOf(59.01, 'ceil'), clockOf(3725), clockOf(12.5, 'exact'), clockOf(12, 'exact'), clockOf(62.25, 'exact')], ['0:59', '1:00', '1:02:05', '0:12.5', '0:12', '1:02.25']);
});

test('the clip\'s stretches: each range\'s own pieces whole, with up to the handles of a neighbour either side — none at the film\'s ends, none where a neighbour is not there', () => {
  // Pieces 0–7 of 60 frames (piece 2 only 12); the changed ranges 0–1 (the film's start), 3, 5 and 7 (its end): pieces 4 and 6 are each two ranges' neighbour.
  const frames = [60, 60, 12, 60, 60, 60, 60, 60], f0 = frames.map((_, i) => frames.slice(0, i).reduce((a, b) => a + b, 0));
  const got = new Map(frames.map((n, i) => [i, {file: `p${i}.mp4`, frames: n}]));
  const range = (first, last) => ({first, last, f0: f0[first], f1: f0[last] + frames[last], from: f0[first] / 30, to: (f0[last] + frames[last]) / 30});
  const [start, three, five, end] = reviewWindows([range(0, 1), range(3, 3), range(5, 5), range(7, 7)], got, {handles: 1, fps: 30});
  const files = w => w.parts.map(p => `${p.file} ${p.start}–${p.end}`);
  assert.deepEqual(files(start), ['p0.mp4 0–60', 'p1.mp4 0–60', 'p2.mp4 0–12'], 'no lead at the film\'s start; a neighbour shorter than the handles: all of it');
  assert.deepEqual([start.from, start.to, start.frames, start.labelled, start.label], [0, 4.4, 132, [0, 119], '0:00–0:04']);
  assert.deepEqual(files(three), ['p2.mp4 0–12', 'p3.mp4 0–60', 'p4.mp4 0–30']);
  assert.deepEqual([three.from, three.to, three.labelled], [4, 7.4, [12, 71]]);
  assert.deepEqual(files(five), ['p4.mp4 30–60', 'p5.mp4 0–60', 'p6.mp4 0–30'], 'a piece between two ranges is the end of one\'s window and the start of the next\'s');
  assert.deepEqual([five.from, five.to, five.labelled], [7.4, 11.4, [30, 89]]);
  assert.deepEqual(files(end), ['p6.mp4 30–60', 'p7.mp4 0–60'], 'no tail at the film\'s end');
  const lonely = reviewWindows([range(3, 3)], new Map([[3, got.get(3)]]), {handles: 1, fps: 30})[0];
  assert.deepEqual([files(lonely), lonely.labelled, lonely.from, lonely.to], [['p3.mp4 0–60'], [0, 59], 4.4, 6.4], 'a neighbour not taken leaves its side without a handle');
  assert.deepEqual(files(reviewWindows([range(3, 3)], got, {handles: 0, fps: 30})[0]), ['p3.mp4 0–60'], 'no handles asked: none');
});

test('a time on the film clock: seconds or m:ss, read from short text only', () => {
  assert.deepEqual(['12', '12.5', '0:12', '1:02.5', '1:00:00', ' 7 '].map(t => clockSeconds(t, 'from')), [12, 12.5, 12, 62.5, 3600, 7]);
  for (const bad of ['', 'abc', '-1', '1:60', '0:12:99', '1e3', '12.1234', '0x10', '1:2:3:4', '9'.repeat(30), '١٢']) {
    assert.throws(() => clockSeconds(bad, 'from'), /^Error: from is a time on the film clock: seconds \(12\.5\) or m:ss \(0:12\), not /, JSON.stringify(bad));
  }
});

test('the store names a kept piece\'s manifest from the manifest and the size, never from a link or a key that is not one', t => {
  const dir = tempDir('kept', t), store = folderStore(path.join(dir, 'cache')), video = path.join(dir, 'piece.mp4'), key = 'a'.repeat(24);
  writeFileSync(video, Buffer.alloc(2048, 1));
  assert.equal(store.kept(key), null);
  store.put(key, video, {frames: 2, from: 6, samples: {0: '0123456789abcdef'}});
  assert.deepEqual([store.kept(key).key, store.kept(key).from, store.kept(key).bytes], [key, 6, 2048]);
  writeFileSync(path.join(dir, 'cache', `${key}.mp4`), Buffer.alloc(10));
  assert.equal(store.kept(key), null, 'a video of another size is not the piece');
  const other = 'b'.repeat(24);
  writeFileSync(path.join(dir, 'b.mp4'), Buffer.alloc(2048, 2)); store.put(other, path.join(dir, 'b.mp4'), {frames: 2, samples: {0: '0123456789abcdef'}});
  const elsewhere = path.join(dir, 'elsewhere.mp4'); writeFileSync(elsewhere, readFileSync(path.join(dir, 'cache', `${other}.mp4`)));
  rmSync(path.join(dir, 'cache', `${other}.mp4`)); symlinkSync(elsewhere, path.join(dir, 'cache', `${other}.mp4`));
  assert.equal(store.kept(other), null, 'a link at a piece\'s name is never read');
  assert.throws(() => store.kept('../../etc/passwd'), /is not a piece's key \(24 hex digits\)/);
});

test('changes: before the first render every piece is new; after it, none; an edit names its pieces and why; with render only they are drawn, and the full render then only joins', {skip: FF}, async t => {
  const dir = project(t);
  const cold = await previewChanges(await full(dir));
  // The kit says nothing of where its code lives: the lines say so, as a render's line does.
  const NOTE = ' · note: kit plain says nothing of where its code lives (sources), and no kitsCode was given: an edit to it is caught only by the spot check';
  assert.match(cold.text, /^0:00–0:\d\d one \+ two \+ three · new\n(\d+) of \1 pieces changed \(0:\d\d of 0:\d\d\) · none kept yet in .*\/out\/\.storyreel\/segments\/frame-320x180-draft · note: /);
  assert.ok(cold.text.endsWith(NOTE), cold.text);
  await makeFilm(await full(dir));
  const same = await previewChanges(await full(dir));
  assert.deepEqual([same.ranges, same.pieces.every(p => p.why === null)], [[], true], 'the full render\'s keys are the preview\'s');
  assert.equal(same.text, `0 of ${same.pieces.length} pieces changed (0:00 of ${clockOf(same.total, 'nearest')})${NOTE}`);
  assert.ok(same.seconds < 10, `a preview reads, never draws (${same.seconds.toFixed(1)} s)`);

  // An edit to the second scene's entry: its pieces, and the entrances that draw it, for the reason a render gives.
  const edited = await previewChanges(await full(dir, {edit: '1'}));
  assert.equal(edited.ranges.length, 1);
  assert.deepEqual(edited.ranges[0].why, ['its recipe entries changed']);
  assert.ok(edited.ranges[0].scenes.includes('two'));
  const changed = edited.pieces.filter(p => p.why !== null), frames = changed.reduce((n, p) => n + p.frames, 0);
  assert.ok(changed.length < edited.pieces.length, 'the pieces of the first scene are kept');
  assert.match(edited.text, new RegExp(`\\n${changed.length} of ${edited.pieces.length} pieces changed`));

  // With render: only those pieces drawn, into the cache; the clip is them, with up to 1 s of the film either side.
  const shown = await previewChanges(await full(dir, {edit: '1'}), {render: true});
  assert.deepEqual(shown.drawn.map(d => d.index), changed.map(p => p.index));
  assert.equal(shown.kept, true);
  assert.ok(shown.clip.file.endsWith(path.join('out', 'changes', 'review.mp4')) && existsSync(shown.clip.file), shown.clip.file);
  const r = edited.ranges[0], lead = r.first > 0 ? 10 : 0, tail = r.last + 1 < edited.pieces.length ? 10 : 0;
  const streams = JSON.parse(probe(shown.clip.file, 'stream=codec_type,nb_read_frames').stdout).streams;
  assert.deepEqual(streams.map(s => [s.codec_type, Number(s.nb_read_frames)]), [['video', lead + frames + tail]], 'the changed frames with a handle either side, and no sound: the film is silent');
  assert.match(shown.text, new RegExp(`\\n.*out/changes/review\\.mp4 · 0:\\d\\d · ${changed.length} pieces? drawn \\(${frames} frames\\) and kept: the full render reuses them · made in [\\d.]+ s$`));
  assert.deepEqual(readdirSync(path.join(dir, 'out')).filter(n => n.startsWith('.storyreel-work') || n.startsWith('.narration')), [], 'no working files left');

  const after = await previewChanges(await full(dir, {edit: '1'}));
  assert.equal(after.ranges.length, 0, 'what the preview drew is kept');
  const made = picture(await makeFilm(await full(dir, {edit: '1'})));
  assert.equal(made.rendered, 0, made.line);
  assert.match(made.line, /^picture: all \d+ pieces reused/);
});

test('changes, voiced: the voice is paced as makeFilm paces it (a hold, a tail), so its keys are the full render\'s; the clip carries the voice of its windows', {skip: FF}, async t => {
  const dir = project(t), voice = path.join(tempDir('changesvoice', t), 'voice');
  mkdirSync(voice);
  const {inputs} = await loadInputs({cwd: dir}), even = evenTimings(inputs.storyboard, {tail: 1});
  const scenes = even.scenes.map((s, i) => {
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=${300 + 150 * i}:sample_rate=24000`, '-t', String(s.duration), '-c:a', 'pcm_s16le', path.join(voice, `${s.id}.wav`)]);
    return {...s, audio: `${s.id}.wav`};
  });
  writeFileSync(path.join(voice, 'timings.json'), JSON.stringify({...even, scenes}));
  await makeFilm(await full(dir, {voice}));
  assert.equal((await previewChanges(await full(dir, {voice}))).ranges.length, 0, 'the paced voice\'s film is the full render\'s');
  const shown = await previewChanges(await full(dir, {voice, edit: '1'}), {render: true});
  const streams = JSON.parse(probe(shown.clip.file, 'stream=codec_type').stdout).streams.map(s => s.codec_type);
  assert.deepEqual(streams, ['video', 'audio']);
  const loud = spawnSync('ffmpeg', ['-v', 'info', '-i', shown.clip.file, '-af', 'volumedetect', '-f', 'null', '-'], {encoding: 'utf8'}).stderr;
  assert.ok(Number(/mean_volume: (-?[\d.]+) dB/.exec(loud)?.[1]) > -40, `the voice is heard under the clip: ${/mean_volume.*/.exec(loud)?.[0]}`);
  assert.equal(readdirSync(path.join(dir, 'out')).filter(n => n.startsWith('.narration')).length, 0, 'the voice\'s copy is removed');
  assert.equal(picture(await makeFilm(await full(dir, {voice, edit: '1'}))).rendered, 0);
});

test('changes after an earlier scene grew: a later piece kept elsewhere is spot-checked now — drawn again when its frames move with the film\'s clock, kept when they do not', {skip: FF}, async t => {
  const MOVED = 'it moved, and its frames moved with the film\'s clock';
  for (const still of [false, true]) {
    const dir = project(t), flags = still ? {still: '1'} : {};
    await makeFilm(await full(dir, flags));
    const grown = await previewChanges(await full(dir, {...flags, longer: '1'})), later = grown.pieces.filter(p => !p.scenes.includes('one'));
    assert.ok(later.length > 1, 'pieces of the later scenes, which moved whole and kept their keys');
    if (still) assert.ok(later.some(p => p.why === null) && !grown.pieces.some(p => p.why === MOVED), `a standing picture is the same where it moved: ${later.map(p => p.why).join(' | ')}`);
    else assert.ok(later.every(p => p.why === MOVED), `a moving one is not: ${later.map(p => p.why).join(' | ')}`);
    await previewChanges(await full(dir, {...flags, longer: '1'}), {render: true});
    assert.equal(picture(await makeFilm(await full(dir, {...flags, longer: '1'}))).rendered, 0, 'the full render draws nothing the preview did not');
  }
});

test('a forced piece is listed as forced, drawn by the preview, and kept', {skip: FF}, async t => {
  const dir = project(t);
  await makeFilm(await full(dir));
  const shown = await previewChanges(await full(dir, {force: 'three'}), {render: true});
  assert.ok(shown.ranges.length === 1 && shown.ranges[0].why.join() === 'forced' && shown.ranges[0].scenes.includes('three'), shown.text);
  assert.equal(shown.kept, true);
  assert.match(shown.text, / drawn \(\d+ frames\) and kept, but forced: every render draws them again · made in/);
});

test('a kept piece checked by fewer frames than now asked is listed, as the render would draw it', {skip: FF}, async t => {
  const dir = project(t);
  await makeFilm(await full(dir));
  const more = await previewChanges(await full(dir, {samples: '12'}));
  assert.ok(more.pieces.every(p => p.why === 'its kept copy was checked by fewer frames than asked'), more.text);
});

test('changes on a dressed film — a cast, strings, the config\'s layout, reduced motion — has the full render\'s keys', {skip: FF}, async t => {
  const dir = project(t), flags = {dressed: '1'};
  const options = await full(dir, flags);
  assert.deepEqual([options.render.layout?.format, options.reducedMotion, options.cast?.hero?.name], ['landscape', true, 'Amaira'], 'the full render takes the config\'s layout, reduced motion and cast');
  assert.ok((await loadProject({cwd: dir, ...flags})).film.total > 0, 'the review tools load it too: a silent film is timed by what is said, the cast\'s names in it');
  await makeFilm(options);
  const same = await previewChanges(await full(dir, flags));
  assert.deepEqual(same.ranges, [], same.text);
  assert.match(same.cache, /\/out\/\.storyreel\/segments\/landscape-960x540-draft$/);
});

test('changes refuses what it cannot compare: a picture drawn whole, a film fitted to a song, handles out of range', async t => {
  const dir = project(t), film = await full(dir);
  const {segments: _segments, ...render} = film.render;
  await assert.rejects(previewChanges({...film, render: {...render, whole: true}}), /this render draws its picture whole \(whole: true, a part, from\/to or an intro\), so nothing is kept to compare with/);
  await assert.rejects(previewChanges({...film, music: {file: 'song.mp3'}}), /fitted to a song \(music\)/);
  await assert.rejects(previewChanges(film, {handles: 9}), /handles is the seconds of the pieces shown either side of a change, 0–5/);
  await assert.rejects(previewChanges({...film, out: ''}), /give the full render's out/);
  assert.equal(readdirSync(path.join(dir, 'out')).filter(n => n.startsWith('.storyreel-work')).length, 0, 'a refusal leaves no working folder');
});

test('the command line: changes and changes --render in a project, part over a window of the film clock', {skip: FF}, t => {
  const dir = project(t), run = (...args) => spawnSync(process.execPath, [cli, ...args], {cwd: dir, encoding: 'utf8'});
  const listed = run('changes');
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /^0:00–0:\d\d one \+ two \+ three · new\n\d+ of \d+ pieces changed/);
  const drawn = run('changes', '--render');
  assert.equal(drawn.status, 0, drawn.stderr);
  assert.match(drawn.stdout, /\nno clip: every piece changed \(the full render shows them\) · \d+ pieces drawn \(\d+ frames\) and kept: the full render reuses them/, 'a first preview draws the film into the cache, and shows no clip of all of it');
  assert.match(run('changes').stdout, /^0 of \d+ pieces changed/, 'the preview\'s pieces are kept: the full render only joins');
  const window = run('part', '--from', '0:02', '--to', '4.5');
  assert.equal(window.status, 0, window.stderr);
  assert.match(window.stdout, /^0:02–0:04\.5: 0\.50–6\.00 s of [\d.]+ s — review/);
  assert.match(window.stdout, /\/out\/parts\/window-2-4\.5\.mp4 · 5\.5 s · made in/);
  for (const [args, said] of [[['part', '--from', 'soon', '--to', '3'], /from is a time on the film clock/], [['part', '--from', '3', '--to', '2'], /to must come after from \(0:03 to 0:02\)/],
    [['part', '--from', '3'], /a window needs both from and to/], [['part', '--scene', 'one', '--from', '1', '--to', '2'], /name the scenes \(scene\) or a window \(from, to\), not both/],
    [['part', '--from', '9:00', '--to', '9:30'], /from \(9:00\) is past the film's end/], [['changes', '--handles', 'lots'], /handles is the seconds/]]) {
    const r = run(...args);
    assert.equal(r.status, 1, `${args.join(' ')}: ${r.stdout}`); assert.match(r.stderr, said, args.join(' '));
  }
  const help = run('changes', '--help');
  assert.match(help.stdout, /^storyreel changes .*\n {2}--render {2}true to draw the changed pieces/);
  assert.ok(!existsSync(path.join(dir, 'out', 'film.mp4')), 'changes never makes the full render');
  assert.deepEqual(Object.keys(TOOLS.changes.args), ['render', 'handles']);
});
