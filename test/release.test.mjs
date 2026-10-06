import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, existsSync, readFileSync, readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {loadImage} from '@napi-rs/canvas';
import {evenTimings} from '../src/index.mjs';
import {makeRelease, loadTarget, checkAdapter, planProblems, readPost, TARGETS, TARGET_NAMES} from '../src/release.mjs';
import {youtubeChapters} from '../src/targets/youtube.mjs';
import {sceneChapters} from '../src/render.mjs';

const storyboard = {title: 'Release Test', scenes: [
  {id: 'one', title: 'The start', narration: 'A short film about pebbles and sheep, made for a test.'},
  {id: 'two', title: 'The middle', narration: 'One pebble for every sheep that walks out of the gate.'},
  {id: 'three', title: 'The end', narration: 'And that is how the counting began, long ago.'},
]};
const slide = {name: 'slide', story: {compile: () => ({hang: 1, draw: (c, t) => { c.fillStyle = '#2a77a8'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#fff'; c.fillRect(300 + (t % 2) * 400, 400, 100, 100); }})}};
const film = {storyboard, timings: evenTimings(storyboard, {wordSeconds: 1.2}), recipe: {story: {kit: 'slide'}, poster: ['one', 'pebbles and sheep']}, kits: [slide]};
const kids = {title: 'Pebbles', description: 'How counting began.', audience: 'kids', tags: ['counting', 'kids maths']};
const probe = (file, entries = 'width,height') => spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', `stream=${entries}`, '-of', 'csv=p=0', file], {encoding: 'utf8'}).stdout.trim();

test('one interface, an adapter per platform, each loaded only when a release names it', async () => {
  assert.deepEqual(TARGET_NAMES, ['youtube', 'youtube-shorts', 'linkedin', 'tiktok', 'instagram-reels']);
  assert.ok(Object.values(TARGETS).every(load => typeof load === 'function'), 'a loader, not a module: nothing is imported until asked');
  for (const name of TARGET_NAMES) { const {adapter} = await loadTarget(name); assert.equal(adapter.name, name); assert.ok(adapter.facts.checked && adapter.facts.sources.length, `${name} says when its facts were checked`); }
  await assert.rejects(loadTarget('myspace'), /no release target called "myspace" \(built in: youtube/);
  assert.throws(() => checkAdapter({name: 'mine', label: 'Mine', video: {format: 'landscape'}}), /limits.seconds/);
});

test('who the platform is for: a film made for kids is marked so on YouTube, and refused where people are 13 and over, with the fix', async () => {
  const yt = (await loadTarget('youtube')).adapter, tt = (await loadTarget('tiktok')).adapter, li = (await loadTarget('linkedin')).adapter;
  assert.deepEqual(planProblems(yt, readPost(kids)), []);
  assert.equal(yt.post(readPost(kids), {chapters: [], seconds: 60}).madeForKids, true);
  const [p] = planProblems(tt, readPost(kids));
  assert.match(p.problem, /TikTok is for people aged 13 and over/); assert.match(p.fix, /teaser for parents with audience: 'general'/);
  assert.match(planProblems(li, readPost(kids))[0].problem, /aged 16 and over/);
  assert.deepEqual(planProblems(tt, readPost({...kids, audience: 'general'})), [], 'a teaser for parents goes');
  assert.throws(() => readPost({title: 'x'}), /post.audience must be 'kids' or 'general'/);
});

test('limits: text and length checked against each platform, and a target may override a limit', async () => {
  const yt = (await loadTarget('youtube')).adapter, shorts = (await loadTarget('youtube-shorts')).adapter;
  assert.match(planProblems(yt, readPost({...kids, title: 'x'.repeat(101)}))[0].problem, /title is 101 characters, more than its 100/);
  assert.match(planProblems(shorts, readPost(kids), {seconds: 200})[0].fix, /release a part: \{target: 'youtube-shorts', from, to\} at most 180 s long/);
  const longer = (await loadTarget({target: 'tiktok', limits: {seconds: {max: 3600}}})).adapter;
  assert.equal(longer.limits.seconds.max, 3600); assert.equal(longer.limits.seconds.min, 1, 'the rest of the limit stays');
});

test('YouTube chapters: the first at 0:00, each at least 10 s (a shorter one joins the one before), at least three or none', () => {
  assert.deepEqual(youtubeChapters([[0, 'Open'], [4, 'Title'], [30, 'Middle'], [95, 'End']], 120), ['0:00 Title', '0:30 Middle', '1:35 End']);
  assert.deepEqual(youtubeChapters([[0, 'A'], [20, 'B'], [40, 'C'], [115, 'D']], 120), ['0:00 A', '0:20 B', '0:40 C'], 'a last chapter under 10 s is left out');
  assert.deepEqual(youtubeChapters([[0, 'A'], [20, 'B']], 60), [], 'two chapters are not chapters to YouTube');
});

test('chapters: a titled scene starts one and an untitled one goes on with it; without any titles, every scene is one, by its id', () => {
  assert.deepEqual(sceneChapters([{id: 'a', title: 'A'}, {id: 'b'}, {id: 'c', title: 'C'}, {id: 'd'}], [0, 5, 12, 30]), [[0, 'A'], [12, 'C']]);
  assert.deepEqual(sceneChapters([{id: 'a'}, {id: 'b'}], [0, 5]), [[0, 'a'], [5, 'b']]);
});

test('refused before a frame is drawn: a poster thumbnail for a film with no poster, a scale the format cannot take; synthetic is a list of words', async () => {
  const out = mkdtempSync(path.join(tmpdir(), 'release-'));
  await assert.rejects(makeRelease({...film, recipe: {story: {kit: 'slide'}}, out, targets: ['youtube'], post: {...kids, thumbnail: 'poster'}}), /the thumbnail is to be the film's poster, and the film has none \(name the poster in the recipe/);
  await assert.rejects(makeRelease({...film, out, targets: [{target: 'youtube', scale: 3}], post: kids}), /layout\.scale must be 0\.5–2/);
  assert.equal(existsSync(path.join(out, 'youtube')), false, 'nothing rendered');
  assert.equal((await loadTarget({target: 'youtube', scale: 2})).options.scale, 2);
  assert.throws(() => readPost({...kids, synthetic: 'voice'}), /post\.synthetic lists what in the film is realistic and made with AI/);
  const {adapter} = await loadTarget('youtube');
  assert.equal(adapter.post(readPost(kids), {chapters: [], seconds: 60}).alteredOrSynthetic, false, 'nothing declared, nothing marked');
});

test('a release: each target its own folder — the video in its shape, captions, thumbnail, the text to paste; a refusal renders nothing', async () => {
  const out = mkdtempSync(path.join(tmpdir(), 'release-'));
  await assert.rejects(makeRelease({...film, out: path.join(out, 'no'), targets: ['youtube', 'tiktok'], post: kids}), /TikTok is for people aged 13/);
  assert.equal(existsSync(path.join(out, 'no')), false, 'refused before anything rendered, even the YouTube version');
  const done = await makeRelease({...film, render: {quality: 'high'}, out, targets: ['youtube', {target: 'youtube-shorts', name: 'short', to: 6}], post: {...kids, thumbnail: 'poster', synthetic: ['voice'], credits: ['Sheep drawn by hand']}});
  const [yt, short] = done;
  assert.equal(probe(yt.video), '1920,1080'); assert.equal(probe(short.video), '1080,1920');
  assert.equal(probe(yt.video, 'color_space,color_transfer,color_primaries'), 'bt709,bt709,bt709', 'the high-quality encode: colours converted and tagged as HD video\'s');
  const firstFrame = (file, x, y) => [...spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-frames:v', '1', '-vf', `crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {encoding: 'buffer'}).stdout];
  assert.ok(firstFrame(yt.video, 420, 540).every(v => v > 200), 'YouTube takes the thumbnail as a file: its video starts on the film\'s own first frame (the white square at the start), not the poster');
  const thumb = await loadImage(readFileSync(yt.thumbnail)); assert.deepEqual([thumb.width, thumb.height], [1280, 720], 'the poster, drawn at YouTube\'s thumbnail size');
  assert.ok(existsSync(path.join(yt.dir, 'captions.srt')) && existsSync(path.join(yt.dir, 'thumbnail.jpg')), 'YouTube: caption files and the thumbnail beside the video');
  assert.equal(short.thumbnail, null, 'Shorts pick their own frame');
  assert.deepEqual(readdirSync(yt.dir).sort(), ['CREDITS.txt', 'captions.srt', 'captions.vtt', 'post.json', 'post.txt', 'release-test.mp4', 'thumbnail.jpg'], 'the folder holds what is posted and nothing else');
  assert.deepEqual(readdirSync(short.dir).sort(), ['CREDITS.txt', 'post.json', 'post.txt', 'release-test.mp4']);
  const credits = readFileSync(yt.credits, 'utf8');
  assert.match(credits, /^Credits — Pebbles\n\nMade with\n- footprint-storyreel [\d.]+ \(MIT\) — the film, drawn in code\n- footprintjs [\d.]+ \(MIT\)/);
  assert.match(credits, /From the maker\n- Sheep drawn by hand\n\nThe narration is a synthetic voice\.\n$/);
  assert.ok(existsSync(yt.makingOf) && yt.makingOf.startsWith(path.join(out, 'work', 'youtube')), 'the record and the working files are kept apart, in work/<target>/');
  await assert.rejects(makeRelease({...film, out, targets: [{target: 'youtube', name: 'work'}], post: kids}), /a target cannot be called "work"/);
  const post = JSON.parse(readFileSync(path.join(yt.dir, 'post.json'), 'utf8'));
  assert.equal(post.fields.madeForKids, true); assert.equal(post.fields.alteredOrSynthetic, true); assert.deepEqual(post.synthetic, ['voice']);
  assert.match(readFileSync(path.join(yt.dir, 'post.txt'), 'utf8'), /## madeForKids\nyes\n\n## alteredOrSynthetic\nyes\n/); assert.match(post.fields.description, /How counting began\.\n\n0:00 The start\n0:\d\d The middle/);
  assert.match(readFileSync(path.join(short.dir, 'post.txt'), 'utf8'), /^YouTube Shorts\n\n## title\nPebbles/);
  assert.ok(short.post.description.endsWith('#Shorts'));
});
