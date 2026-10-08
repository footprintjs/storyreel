import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, existsSync, readFileSync, readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {loadImage} from '@napi-rs/canvas';
import {evenTimings} from '../src/index.mjs';
import {makeRelease, loadTarget, checkAdapter, planProblems, readPost, TARGETS, TARGET_NAMES} from '../src/release.mjs';
import {xLength} from '../src/targets/x.mjs';
import {youtubeChapters as chaptersOf} from 'footprint-narration';

/** YouTube's chapter lines for [[seconds, name]] (the adapter's input) over a video of `length` s. */
const youtubeChapters = (pairs, length) => chaptersOf(pairs.map(([at, title]) => ({at, title})), {length}).lines;
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
  assert.deepEqual(TARGET_NAMES, ['youtube', 'youtube-shorts', 'linkedin', 'tiktok', 'instagram-reels', 'x']);
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
  assert.match(planProblems(yt, readPost(kids), {seconds: -30})[0].problem, /shorter than YouTube takes/, 'a part that ends before it starts is the release\'s refusal, not the chapter rule\'s');
  const longer = (await loadTarget({target: 'tiktok', limits: {seconds: {max: 3600}}})).adapter;
  assert.equal(longer.limits.seconds.max, 3600); assert.equal(longer.limits.seconds.min, 1, 'the rest of the limit stays');
});

test('X: a post counted as twitter-text 3.1.0 counts it, the library X publishes — a link 23, an emoji 2, a code point 1 or 2, NFC first', () => {
  assert.equal(xLength('hello'), 5);
  assert.equal(xLength('see https://example.com/a/very/long/path?q=1'), 4 + 23);
  assert.equal(xLength('see https://example.com.'), 4 + 23 + 1, 'the full stop after a link is text');
  assert.equal(xLength('storyreel.dev and node.js'), 23 + 5 + 7, 'a name with a dot is a link only when it ends in a top-level domain X knows: js is none');
  assert.equal(xLength('Node.js, footprint.mjs, index.html, package.json'), 48, 'file names are text, letter by letter');
  assert.equal(xLength('README.md'), 23, '…unless one ends in a country\'s domain (md, Moldova): then it is a link to X too');
  assert.equal(xLength('mail sanjay@example.com now'), 27, 'an address: the domain after @ is no link');
  assert.equal(xLength('#node.js $x.com -x.com'), 8 + 1 + 6 + 1 + 6, 'nor after #, $ or -');
  assert.equal(xLength('http://localhost:3000'), 21, 'a host without a top-level domain is no link');
  assert.equal(xLength('👋🏽 🇱🇺 👨\u{200D}👩\u{200D}👧'), 2 + 1 + 2 + 1 + 2);
  assert.equal(xLength('1\u{FE0F}\u{20E3} 🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}'), 2 + 1 + 2, 'a keycap, the England flag: one emoji each');
  assert.equal(xLength('© ©\u{FE0F}'), 1 + 1 + 2, '© is a sign of the light range until U+FE0F makes it an emoji');
  assert.equal(xLength('日本 مرحبا'), 4 + 1 + 5, 'Chinese and Japanese 2 each; Arabic, like Latin, 1');
  assert.equal(xLength('e\u{301}'), 1, 'composed first: é is one');
  assert.equal(xLength('— “quoted” …'), 1 + 1 + 1 + 6 + 1 + 1 + 2, 'dashes and quotes count 1; the ellipsis (U+2026) is outside X\'s light ranges: 2');
});

test('X: xLength is twitter-text 3.1.0\'s count, row by row (test/fixtures/x-counts.json, made from it by scripts/x-counts.mjs)', () => {
  const {versions, rows} = JSON.parse(readFileSync(new URL('./fixtures/x-counts.json', import.meta.url), 'utf8'));
  assert.deepEqual(versions, {'twitter-text': '3.1.0', 'twemoji-parser': '11.0.2'});
  assert.ok(rows.length >= 150, `${rows.length} rows`);
  assert.deepEqual(rows.filter(r => xLength(r.text) !== r.weightedLength).map(r => ({...r, xLength: xLength(r.text)})), [], 'every row as twitter-text counts it');
  const newer = rows.filter(r => r.group === 'newer emoji');
  assert.ok(newer.length >= 10 && newer.every(r => r.weightedLength >= 2), 'an emoji newer than twemoji-parser 11.0.2 counts as its parts: never less than the 2 X counts');
});

test('X: a square post up to 140 s, at most 280 as X counts, the chapters when they fit, a teaser for parents', async () => {
  const x = (await loadTarget('x')).adapter;
  assert.deepEqual([x.video.format, x.limits.seconds.max, x.thumbnail], ['square', 140, null]);
  assert.deepEqual(planProblems(x, readPost({...kids, audience: 'general'})), []);
  assert.match(planProblems(x, readPost(kids))[0].problem, /X is for people aged 13 and over/);
  assert.match(planProblems(x, readPost({...kids, audience: 'general'}), {seconds: 200})[0].fix, /release a part: \{target: 'x', from, to\} at most 140 s long/);
  const long = readPost({...kids, audience: 'general', description: '日本 '.repeat(60)});
  assert.match(planProblems(x, long)[0].problem, /X's text is 3\d\d characters, more than its 280/, 'counted as X counts: each of those characters is 2');
  const p = readPost({...kids, audience: 'general'}), chapters = [[0, 'The start'], [20, 'The middle'], [40, 'The end']];
  assert.equal(x.post(p, {chapters, seconds: 60, limits: x.limits}).text, 'Pebbles\n\nHow counting began.\n\n0:00 The start\n0:20 The middle\n0:40 The end\n\n#counting #kidsmaths');
  const crowded = readPost({...kids, audience: 'general', description: 'x'.repeat(230)});
  assert.doesNotMatch(x.post(crowded, {chapters, seconds: 60, limits: x.limits}).text, /0:00/, 'no room: the post goes without them');
  const premium = (await loadTarget({target: 'x', limits: {seconds: {max: 3 * 3600}, text: {text: {max: 25000}}}})).adapter;
  assert.equal(premium.limits.text.text.count, xLength, 'raising a limit keeps how X counts');
  assert.match(premium.post(crowded, {chapters, seconds: 60, limits: premium.limits}).text, /0:00 The start/, 'a Premium post has room');
  const many = Array.from({length: 51}, (_, i) => [i * 10, `Part ${i + 1}`]);
  assert.match(premium.post(p, {chapters: many.slice(0, 50), seconds: 600, limits: premium.limits}).text, /8:10 Part 50/, 'fifty times go in');
  assert.doesNotMatch(premium.post(p, {chapters: many, seconds: 600, limits: premium.limits}).text, /0:00/, 'X makes at most 50 times in a post into links: past that, the chapters stay out');
  assert.throws(() => checkAdapter({...x, limits: {seconds: {max: 1}, text: {text: {max: 1, count: 'x'}}}}), /limits.text.text.count, when given, is how the platform counts a text/);
});

test('X: a count given to the target decides, in the post as in the check', async () => {
  const x = (await loadTarget('x')).adapter, strict = s => xLength(s) + 50;
  const counted = (await loadTarget({target: 'x', limits: {text: {text: {count: strict}}}})).adapter;
  assert.equal(counted.limits.text.text.count, strict); assert.equal(counted.limits.text.text.max, 280, 'the rest of the limit stays');
  const roomy = readPost({...kids, audience: 'general', description: 'd'.repeat(200)}), chapters = [[0, 'The start'], [20, 'The middle'], [40, 'The end']];
  assert.match(x.post(roomy, {chapters, seconds: 60, limits: x.limits}).text, /0:00 The start/, 'as X counts, the chapters fit');
  assert.doesNotMatch(counted.post(roomy, {chapters, seconds: 60, limits: counted.limits}).text, /0:00/, 'as the target counts, they do not: the post goes without them');
  const full = readPost({...kids, audience: 'general', description: 'd'.repeat(240)});
  assert.deepEqual(planProblems(x, full), []);
  assert.match(planProblems(counted, full)[0].problem, /X's text is 321 characters, more than its 280/, 'and the check counts as the target does');
});

test('limits overridden are checked as an adapter\'s are; a key given as undefined is not given', async () => {
  for (const [limits, refusal] of [[{text: {text: {count: 'x'}}}, /release target "x": limits\.text\.text\.count, when given, is how the platform counts a text/], [{text: {text: {max: '10'}}}, /limits\.text\.text\.max must be a whole number/],
    [{seconds: {max: 0}}, /limits\.seconds \{min\?, max\} is the length the platform takes/], [{frame: [{width: 1920}]}, /limits\.frame, when given, lists the largest frames the platform takes/]])
    await assert.rejects(loadTarget({target: 'x', limits}), refusal);
  const x = (await loadTarget('x')).adapter;
  const kept = (await loadTarget({target: 'x', limits: {seconds: {max: undefined}, text: {text: {max: 25000, count: undefined}}, frame: undefined}})).adapter;
  assert.equal(kept.limits.text.text.count, xLength, 'count: undefined keeps how X counts');
  assert.deepEqual([kept.limits.text.text.max, kept.limits.seconds.max, kept.limits.frame], [25000, 140, x.limits.frame], 'the rest as the platform has it');
});

test('X takes a video of at most 1920×1200 (1200×1900 tall): a larger render is refused before a frame is drawn, with the scale that fits', async () => {
  const x = (await loadTarget('x')).adapter, p = {...kids, audience: 'general'};
  assert.deepEqual(x.limits.frame, [{width: 1920, height: 1200}, {width: 1200, height: 1900}]);
  assert.deepEqual([planProblems(x, readPost(p)), planProblems(x, readPost(p), {scale: 1.1})], [[], []], '1080×1080 and 1188×1188 fit');
  assert.deepEqual(planProblems(x, readPost(p), {scale: 2}), [{problem: '2160×2160 is larger than X takes, at most 1920×1200 or 1200×1900', fix: "release it at scale 1: {target: 'x'} makes 1080×1080"}]);
  const out = mkdtempSync(path.join(tmpdir(), 'release-'));
  await assert.rejects(makeRelease({...film, out, targets: [{target: 'x', scale: 2}], post: p}), /release to X: 2160×2160 is larger than X takes, at most 1920×1200 or 1200×1900 \(release it at scale 1/);
  assert.equal(existsSync(path.join(out, 'x')), false, 'nothing rendered');
  for (const name of TARGET_NAMES.filter(n => n !== 'x')) assert.equal((await loadTarget(name)).adapter.limits.frame, undefined, `${name} declares no largest frame`);
  assert.deepEqual(planProblems((await loadTarget('youtube')).adapter, readPost(kids), {scale: 2}), [], 'so YouTube takes 4K, as before');
  assert.match(planProblems((await loadTarget({target: 'x', limits: {frame: [{width: 720, height: 720}]}})).adapter, readPost(p))[0].fix, /a scale of at most 0\.66/, 'a frame smaller than the format names the scale');
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
  assert.equal(readFileSync(path.join(path.dirname(short.makingOf), 'chapters.txt'), 'utf8'), '0:00 The start\n', 'a part lists only the chapters it shows (the middle and the end start after its 6 s)');
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
  assert.match(credits, /^Credits — Pebbles\n\nMade with\n- footprint-storyreel [\d.]+ \(MIT AND Apache-2\.0\) — the film, drawn in code\n- footprintjs [\d.]+ \(MIT\)/, 'StoryReel\'s licence as package.json gives it: its own code MIT, the X counter Apache-2.0');
  assert.match(credits, /From the maker\n- Sheep drawn by hand\n\nThe narration is a synthetic voice\.\n$/);
  assert.ok(existsSync(yt.makingOf) && yt.makingOf.startsWith(path.join(out, 'work', 'youtube')), 'the record and the working files are kept apart, in work/<target>/');
  await assert.rejects(makeRelease({...film, out, targets: [{target: 'youtube', name: 'work'}], post: kids}), /a target cannot be called "work"/);
  const post = JSON.parse(readFileSync(path.join(yt.dir, 'post.json'), 'utf8'));
  assert.equal(post.fields.madeForKids, true); assert.equal(post.fields.alteredOrSynthetic, true); assert.deepEqual(post.synthetic, ['voice']);
  assert.match(readFileSync(path.join(yt.dir, 'post.txt'), 'utf8'), /## madeForKids\nyes\n\n## alteredOrSynthetic\nyes\n/); assert.match(post.fields.description, /How counting began\.\n\n0:00 The start\n0:\d\d The middle/);
  assert.match(readFileSync(path.join(short.dir, 'post.txt'), 'utf8'), /^YouTube Shorts\n\n## title\nPebbles/);
  assert.ok(short.post.description.endsWith('#Shorts'));
});
