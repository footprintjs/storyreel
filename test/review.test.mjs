// Reviewing a part by reading it (review.mjs): the words a frame draws, read with their boxes; the checks picked
// by what the part has, each run as its own subflow; findings as spans on the film clock, as text; the record.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {compileFilm, evenTimings} from '../src/index.mjs';
import {compileLayout} from '../src/layout.mjs';
import {wordsAt, reviewPart, findingsText, REVIEW_CHECKS} from '../src/review.mjs';

// One long spoken scene; the picture: a title, two labels over each other from 2 s to 4 s, a word under the
// caption band from 5 s to 7 s, a word past the right edge throughout, a moving square until 8 s, then nothing moves.
const storyboard = {title: 'Review', scenes: [{id: 'talk', narration: 'This is a test film with many words, so that the captions show for a long time and the picture keeps still at the end, while the voice goes on and on.'}]};
const words = {name: 'words', story: {compile: () => ({hang: 1, draw: (c, t) => {
  c.fillStyle = '#f3eee3'; c.fillRect(0, 0, 1600, 900);
  c.fillStyle = '#222'; c.font = '40px sans-serif'; c.textBaseline = 'middle';
  c.textAlign = 'center'; c.fillText('TITLE', 800, 100);
  c.textAlign = 'left'; c.fillText('Edge', 1580, 450);
  if (t >= 2 && t < 4) { c.fillText('Alpha', 400, 400); c.fillText('Beta', 430, 405); }
  if (t >= 5 && t < 7) { c.textAlign = 'center'; c.fillText('Under', 800, 820); }
  c.fillRect(100 + Math.min(t, 8) * 50, 600, 40, 40);
}})}};
const film = await compileFilm({storyboard, timings: evenTimings(storyboard, {wordSeconds: .5}), recipe: {story: {kit: 'words'}}, kits: [words]});
const near = (a, b, d = .3) => Math.abs(a - b) <= d;

test('wordsAt reads every line a frame draws, with its box through the transform (output pixels) and its alpha', () => {
  const plain = wordsAt(film, 1), title = plain.find(w => w.text === 'TITLE');
  assert.ok(title && near((title.box[0] + title.box[2]) / 2, 800, 3) && title.box[1] < 100 && title.box[3] > 100, `the title, centred on 800: ${JSON.stringify(title)}`);
  assert.equal(title.alpha, 1);
  const big = compileLayout(film, {format: 'landscape'}), framed = wordsAt(film, 1, {layout: big}).find(w => w.text === 'TITLE');
  assert.ok(near((framed.box[0] + framed.box[2]) / 2, 960, 4), 'through the layout: 1920 wide, so the centre is 960');
  assert.deepEqual(wordsAt(film, 3).filter(w => ['Alpha', 'Beta'].includes(w.text)).map(w => w.text), ['Alpha', 'Beta']);
});

test('a review picks its checks by what the part has, runs each as its own subflow, and names what it finds with times', async () => {
  const r = await reviewPart(film, {layout: {format: 'landscape', captions: true, scale: 2}});
  assert.deepEqual([...r.ran].sort(), ['cut-off', 'hook', 'stale', 'still', 'text-density', 'under-captions', 'words-overlap'], 'a director\'s checks too: the hook (the part starts the film), how much there is to read, something new every few seconds');
  assert.equal(r.findings.filter(f => ['hook', 'text-density'].includes(f.kind)).length, 0, 'the square moves from the first frame, and there is little to read');
  const one = kind => r.findings.filter(f => f.kind === kind);
  const [overlap] = one('words-overlap'), [under] = one('under-captions'), [edge] = one('cut-off'), [still] = one('still');
  assert.ok(overlap && overlap.what === '"Alpha" and "Beta"' && near(overlap.from, 2) && near(overlap.to, 3.75), JSON.stringify(overlap));
  assert.ok(under && under.what === '"Under"' && near(under.from, 5) && near(under.to, 6.75), JSON.stringify(under));
  assert.ok(edge && edge.what === '"Edge"' && edge.from === 0, JSON.stringify(edge));
  assert.ok(still && near(still.from, 8) && still.to > 13, JSON.stringify(still));
  assert.equal(one('words-overlap').length + one('under-captions').length, 2, 'nothing else: the title overlaps nothing, and is clear of the captions');
  assert.match(r.text, /^0:00\.0–0:\d\d\.\d talk · cut off at the edge: "Edge"$/m);
  assert.match(r.text, /^0:02\.0–0:03\.8 talk · words over words: "Alpha" and "Beta"$/m);
  assert.equal(r.facts.captions, true);
  assert.ok(r.record.some(e => /pick-checks/i.test(JSON.stringify(e))), 'the review leaves its own record');
});

test('a check that does not fit is not picked (no caption band, no caption check); a check of your own has the same shape', async () => {
  const titled = {label: 'The title is there', why: 'always', when: () => true, find: ({samples}) => samples.filter(s => !s.words.some(w => w.text === 'TITLE')).map(s => ({kind: 'no-title', t: s.t, what: 'no title'}))};
  const r = await reviewPart(film, {from: 1, to: 4, checks: {...REVIEW_CHECKS, titled}});
  assert.deepEqual([...r.ran].sort(), ['cut-off', 'text-density', 'titled', 'words-overlap'], 'no captions without a layout, no hook after the start, and 3 s is too short to stand still');
  assert.equal(r.findings.filter(f => f.kind === 'no-title').length, 0);
  await assert.rejects(reviewPart(film, {checks: {broken: {label: 'x'}}}), /review check "broken" must be \{label, why\?, when\(scope\), find\(review\)\}/);
  assert.equal(findingsText([{kind: 'still', from: 61.25, to: 67, scene: 'end', what: 'the picture does not change'}]), '1:01.3–1:07.0 end · nothing changes: the picture does not change');
  assert.equal(findingsText([{kind: 'loop', from: 59.96, to: 119.97, scene: 'end', what: 'x'}]), '1:00.0–2:00.0 end · the loop jumps: x', 'rounded to the tenth before the minutes: never 0:60.0');
});

test('a director\'s checks: no hook when nothing moves in the first 3 s; too much to read at once; no breath when the voice never pauses', async () => {
  const board = {title: 'Director', scenes: [{id: 'a', narration: Array.from({length: 36}, (_, i) => `word${i}`).join(' ') + '.'}, {id: 'b', narration: Array.from({length: 36}, (_, i) => `more${i}`).join(' ') + '.'}]};
  const lines = Array.from({length: 8}, (_, i) => `this is line ${i} of a long block`);
  const kit = {name: 'still-start', story: {compile: () => ({hang: 1, draw: (c, t) => {
    c.fillStyle = '#eee'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#222'; c.font = '30px sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'left';
    if (t >= 3.5) c.fillRect(100 + t * 20, 700, 40, 40);              // nothing moves until 3.5 s
    if (t >= 10 && t < 13) lines.forEach((l, i) => c.fillText(l, 200, 150 + i * 60));   // 64 words for 3 s
  }})}};
  const tight = await compileFilm({storyboard: board, timings: evenTimings(board, {wordSeconds: .5, tail: .3}), recipe: {story: {kit: 'still-start'}}, kits: [kit]});
  const r = await reviewPart(tight);
  const of = kind => r.findings.filter(f => f.kind === kind);
  assert.ok(of('hook').length === 1 && of('hook')[0].from === 0 && near(of('hook')[0].to, 3), JSON.stringify(of('hook')));
  assert.ok(of('text-density').length === 1 && near(of('text-density')[0].from, 10) && near(of('text-density')[0].to, 12.75) && of('text-density')[0].what === 'more than 35 words on screen');
  assert.match(of('silences')[0]?.what ?? '', /^no real silence \(0\.8 s or more with nothing playing\)/);
  const paused = await compileFilm({storyboard: board, timings: evenTimings(board, {wordSeconds: .5, tail: 1.5}), recipe: {story: {kit: 'still-start'}}, kits: [kit]});
  assert.match((await reviewPart(paused)).findings.find(f => f.kind === 'silences')?.what ?? '', /^only one real silence/, 'the pause between the two scenes is one breath');
});

test('a fill over the whole frame veils the words under it: under a near-opaque one they are not on screen', async () => {
  const kit = {name: 'veiled', story: {compile: () => ({hang: 1, draw: (c, t) => {
    c.fillStyle = '#eeeeee'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#222'; c.font = '40px sans-serif'; c.textBaseline = 'middle'; c.fillText('UNDER', 400, 400);
    if (t >= 1) { c.fillStyle = 'rgba(20, 20, 30, .9)'; c.fillRect(0, 0, 1600, 900); }
    c.fillStyle = '#ffffff'; c.fillText('OVER', 800, 400);
  }})}};
  const f = await compileFilm({storyboard, timings: evenTimings(storyboard, {wordSeconds: .5}), recipe: {story: {kit: 'veiled'}}, kits: [kit]});
  assert.equal(wordsAt(f, .5).find(w => w.text === 'UNDER').alpha, 1);
  const after = wordsAt(f, 1.5);
  assert.ok(after.find(w => w.text === 'UNDER').alpha < .2, 'veiled'); assert.equal(after.find(w => w.text === 'OVER').alpha, 1);
});

test('text too small to read is texture: a photo of a page does not count as words on screen', async () => {
  const kit = {name: 'tiny', story: {compile: () => ({hang: 1, draw: c => {
    c.fillStyle = '#eeeeee'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#222'; c.textBaseline = 'middle';
    c.font = '40px sans-serif'; c.fillText('READ ME', 200, 200);
    c.font = '6px sans-serif'; for (let i = 0; i < 60; i++) c.fillText('tiny words here', 600 + (i % 6) * 60, 400 + Math.floor(i / 6) * 9);
  }})}};
  const f = await compileFilm({storyboard, timings: evenTimings(storyboard, {wordSeconds: .5}), recipe: {story: {kit: 'tiny'}}, kits: [kit]});
  const r = await reviewPart(f, {from: 1, to: 3});
  assert.equal(r.findings.filter(x => x.kind === 'text-density').length, 0, '180 tiny words are not reading');
  assert.equal((await reviewPart(f, {from: 1, to: 3, minHeight: .001})).findings.filter(x => x.kind === 'text-density').length, 1, 'counted when asked to');
});

// Borrowed from motion directors (2026-10-08): something new every few seconds, and a loop that comes round.
test('nothing new: the picture moves, but no scene, no beat and no new words come for longer than newEvery', async () => {
  const r = await reviewPart(film);
  const stale = r.findings.filter(f => f.kind === 'stale'), [still] = r.findings.filter(f => f.kind === 'still');
  assert.deepEqual(stale.map(f => [f.from, f.to]), [[5.25, 7.75]], 'after the new words ("Under", at 5 s: their own sample shows something new) while the square moves');
  assert.equal(stale[0].what, 'nothing new for 12.1 s since 0:05.0 (no scene, no beat, no new words)', 'the gap: from the last new moment to the end');
  assert.ok(still && still.from === 8 && still.to === 17, `from 8 s the picture is frozen, and only the still check says so: ${JSON.stringify(still)}`);
  const alone = await reviewPart(film, {checks: {stale: REVIEW_CHECKS.stale}});
  assert.deepEqual(alone.findings.map(f => [f.kind, f.from, f.to]), [['stale', 5.25, 17]], 'without the still check, a frozen stretch is nothing new too');
  assert.equal((await reviewPart(film, {newEvery: 20})).findings.filter(f => f.kind === 'stale').length, 0, 'a longer allowance finds none');
  assert.ok(!(await reviewPart(film, {from: 1, to: 4})).ran.includes('stale'), 'a part shorter than the allowance is not checked');
  await assert.rejects(reviewPart(film, {newEvery: 0}), /newEvery must be seconds, more than 0/);
});

// Four still slides, each its own colour: every scene start is new, and each slide is frozen until the next.
const twelve = 'one two three four five six seven eight nine ten eleven twelve.';
const slideBoard = {title: 'Slides', scenes: ['p', 'q', 'r', 's'].map(id => ({id, narration: twelve}))};
let slideCuts = [0, Infinity, Infinity, Infinity];
const slidesKit = {name: 'slides', story: {compile: () => ({hang: 1, draw: (c, t) => { c.fillStyle = ['#c00', '#0a0', '#00c', '#aa0'][slideCuts.filter(o => t >= o).length - 1]; c.fillRect(0, 0, 1600, 900); }})}};
const slides = await compileFilm({storyboard: slideBoard, timings: evenTimings(slideBoard, {wordSeconds: .5, tail: 1}), recipe: {story: {kit: 'slides'}}, kits: [slidesKit]});
slideCuts = slides.clock.offsets.slice();

test('each gap and each frozen stretch is its own finding: equal ones side by side never merge into one span', async () => {
  const alone = await reviewPart(slides, {checks: {stale: REVIEW_CHECKS.stale}});
  assert.deepEqual(alone.findings.map(f => [f.scene, f.what]), [
    ['p', 'nothing new for 7.3 s since 0:00.0 (no scene, no beat, no new words)'], ['q', 'nothing new for 7.3 s since 0:07.3 (no scene, no beat, no new words)'],
    ['r', 'nothing new for 7.3 s since 0:14.6 (no scene, no beat, no new words)'], ['s', 'nothing new for 7.3 s since 0:21.9 (no scene, no beat, no new words)']], 'four gaps, four spans');
  assert.ok(alone.findings.every((f, i) => f.from > slideCuts[i]), 'a gap starts after its new moment: the scene start shows something new');
  const r = await reviewPart(slides, {checks: {stale: REVIEW_CHECKS.stale, still: REVIEW_CHECKS.still}});
  const frozen = r.findings.filter(f => f.kind === 'still');
  assert.deepEqual(frozen.map(f => f.what), ['the picture does not change for 7.3 s from 0:00.0', 'the picture does not change for 7.0 s from 0:07.5',
    'the picture does not change for 7.0 s from 0:14.8', 'the picture does not change for 7.0 s from 0:22.0'], 'four stretches, three of them 7.0 s long side by side, still four spans');
  assert.equal(r.findings.filter(f => f.kind === 'stale').length, 0, 'every frozen stretch is said once, by the still check');
});

// Three still scenes (red, green, blue) on a clock whose end is not a whole millisecond (21.299999999999997).
const colourBoard = {title: 'Loop', scenes: ['a', 'b', 'c'].map(id => ({id, narration: twelve}))};
let colourCuts = [0, Infinity, Infinity];
const colourKit = {name: 'colours', story: {compile: () => ({hang: 1, draw: (c, t) => { c.fillStyle = ['#c00', '#0a0', '#00c'][colourCuts.filter(o => t >= o).length - 1]; c.fillRect(0, 0, 1600, 900); }})}};
const colours = await compileFilm({storyboard: colourBoard, timings: evenTimings(colourBoard, {wordSeconds: .5}), recipe: {story: {kit: 'colours'}}, kits: [colourKit]});
colourCuts = colours.clock.offsets.slice();

test('a part made to loop: the end of its own scenes must come round to their start, or the loop jumps', async () => {
  assert.notEqual(colours.total, +colours.total.toFixed(3), 'the film ends between two milliseconds');
  const loops = async options => {
    const r = await reviewPart(colours, {loop: true, ...options});
    assert.ok(r.ran.includes('loop'), `the loop check ran (${JSON.stringify(options)}): ${r.ran}`);
    return r.findings.filter(f => f.kind === 'loop');
  };
  const [whole] = await loops({});
  assert.ok(whole && whole.what === 'the end is not the start: the loop jumps' && whole.scene === 'c', `red to blue: it jumps, said in the last scene: ${JSON.stringify(whole)}`);
  for (const scene of ['a', 'b', 'c']) for (const handles of [1.5, 0]) assert.deepEqual(await loops({part: {scene, handles}}), [], `${scene} is one colour, whatever its handles show either side: it comes round`);
  assert.equal((await loops({part: {scenes: ['a', 'b'], handles: 0}})).length, 1, 'red to green jumps');
  assert.ok(!(await reviewPart(colours)).ran.includes('loop'), 'checked only when the part is made to loop');
});

test('a loop in motion comes round when its motion does: the end is read at the end, not a moment before it', async () => {
  // Once a scene a dot circles (265 px a second: a millisecond before the end it is a quarter of a pixel short), and a
  // hand, a card, a picture and a word turn — redrawn a hair apart, their edges come out a few levels off where nothing moved.
  const board = {title: 'Orbit', scenes: [{id: 'one', narration: twelve}, {id: 'two', narration: twelve}]};
  const sprite = createCanvas(200, 120), sx = sprite.getContext('2d');
  sx.fillStyle = '#3b82f6'; sx.fillRect(0, 0, 200, 120); sx.fillStyle = '#fff'; sx.font = '40px sans-serif'; sx.fillText('Card', 20, 75);
  let starts = [0, Infinity];
  const orbit = (name, turns) => ({name, story: {compile: () => ({hang: 1, draw: (c, t) => {
    const i = t >= starts[1] ? 1 : 0, k = 2 * Math.PI * turns * (t - starts[i]) / (starts[1] - starts[0]);
    c.fillStyle = '#eee'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#c00'; c.beginPath(); c.arc(800 + 300 * Math.cos(k), 450 + 300 * Math.sin(k), 60, 0, 2 * Math.PI); c.fill();
    c.strokeStyle = '#000'; c.lineWidth = 4; c.beginPath(); c.moveTo(800, 450); c.lineTo(800 + 200 * Math.cos(k), 450 + 200 * Math.sin(k)); c.stroke();
    c.save(); c.translate(350, 450); c.rotate(k); c.fillStyle = '#0a0'; c.fillRect(-120, -40, 240, 80); c.restore();
    c.save(); c.translate(1250, 450); c.rotate(k); c.drawImage(sprite, -100, -60); c.restore();
    c.save(); c.translate(800, 150); c.rotate(k); c.fillStyle = '#222'; c.font = '60px sans-serif'; c.fillText('round', -70, 20); c.restore();
  }})}});
  for (const [name, turns, jumps] of [['orbit-round', 1, 0], ['orbit-short', 1.01, 1]]) {
    const kit = orbit(name, turns), f = await compileFilm({storyboard: board, timings: evenTimings(board, {wordSeconds: .5}), recipe: {story: {kit: kit.name}}, kits: [kit]});
    starts = f.clock.offsets.slice();
    for (const scene of ['one', 'two']) {
      const r = await reviewPart(f, {part: {scene}, loop: true, checks: {loop: REVIEW_CHECKS.loop}});
      assert.equal(r.findings.length, jumps, `${turns} turns in ${scene}: ${jumps ? 'a hundredth of a turn short, it jumps' : 'it comes round'}`);
    }
  }
});

test('a loop that jumps at its seam is caught however small the jump: a dot, a thin hand, a label, a shade, a digit', async () => {
  // Each film cuts to a second picture 2 s before its end, so its end is not its start.
  const board = {title: 'Seam', scenes: [{id: 'one', narration: twelve}]};
  const ground = (c, colour) => { c.fillStyle = colour; c.fillRect(0, 0, 1600, 900); };
  const JUMPS = {
    'a 12-px dot moves 600 px': (c, end) => { ground(c, '#eee'); c.fillStyle = '#111'; c.beginPath(); c.arc(end ? 1200 : 400, 450, 6, 0, 2 * Math.PI); c.fill(); },
    'a 4-px clock hand turns 90°': (c, end) => { ground(c, '#fff'); c.strokeStyle = '#000'; c.lineWidth = 4; c.beginPath(); c.moveTo(800, 450); c.lineTo(end ? 1000 : 800, end ? 450 : 250); c.stroke(); },
    'a 20-px label goes from "Step 1" to "Step 9"': (c, end) => { ground(c, '#fff'); c.fillStyle = '#222'; c.font = '20px sans-serif'; c.fillText(end ? 'Step 9' : 'Step 1', 100, 100); },
    'a 300×120 card turns 32 levels bluer': (c, end) => { ground(c, '#fff'); c.fillStyle = end ? '#5ba2f6' : '#3b82f6'; c.fillRect(650, 390, 300, 120); },
    'a 12-px counter goes from 12:00 to 12:01 (too few pixels: the words say it)': (c, end) => { ground(c, '#fff'); c.fillStyle = '#222'; c.font = '12px sans-serif'; c.fillText(end ? '12:01' : '12:00', 700, 450); },
  };
  let seamAt = Infinity;
  for (const [jump, draw] of Object.entries(JUMPS)) {
    const kit = {name: 'seam', story: {compile: () => ({hang: 1, draw: (c, t) => draw(c, t >= seamAt)})}};
    const f = await compileFilm({storyboard: board, timings: evenTimings(board, {wordSeconds: .5}), recipe: {story: {kit: 'seam'}}, kits: [kit]});
    seamAt = f.total - 2;
    assert.equal((await reviewPart(f, {part: {scene: 'one'}, loop: true, checks: {loop: REVIEW_CHECKS.loop}})).findings.length, 1, `${jump}: the loop jumps`);
  }
});

test('the window is held to the film, and every moment read is inside it, however its end rounds', async () => {
  const past = await reviewPart(colours, {to: colours.total + 3, checks: {still: REVIEW_CHECKS.still}});
  assert.deepEqual(past.window, {from: 0, to: colours.total}, 'past the end is the end, as a render\'s is');
  // From 0.05 s the samples land on 21.3 s, the end rounded up: read at the end itself, the last stretch reaches it.
  const late = await reviewPart(colours, {from: .05, checks: {still: REVIEW_CHECKS.still}});
  assert.equal(late.findings.at(-1).to, colours.total, JSON.stringify(late.findings.at(-1)));
  await assert.rejects(reviewPart(colours, {from: 30}), /review: nothing to read in 30\.00–21\.30 s: from must come before to, inside the film \(0–21\.30 s\)/);
});

test('a check that throws fails the review, naming it: it is never just missing from what ran', async t => {
  const printed = [t.mock.method(console, 'info'), t.mock.method(console, 'log')];
  const broken = {label: 'Broken', why: 'always', when: () => true, find: () => { throw new Error('no picture to read'); }};
  await assert.rejects(reviewPart(film, {from: 1, to: 4, checks: {...REVIEW_CHECKS, broken}}), /review: a check failed, so the review is incomplete — "broken": no picture to read/);
  const picky = {label: 'Picky', when: () => { throw new Error('no facts'); }, find: () => []};
  await assert.rejects(reviewPart(film, {from: 1, to: 4, checks: {broken, picky}}), /review: 2 checks failed, so the review is incomplete — "picky": no facts; "broken": no picture to read/, 'a when() that throws is a failure too, not a check that does not fit');
  assert.equal(printed.reduce((n, m) => n + m.mock.callCount(), 0), 0, 'nothing printed on stdout, where an MCP client would take it for the answer');
});

test('a check answers with its hits, [{kind, t, what}]: anything else fails the review, naming the check, and so does a result lost on the way', async t => {
  const printed = [t.mock.method(console, 'info'), t.mock.method(console, 'log')];
  const mine = find => reviewPart(film, {from: 1, to: 3, checks: {mine: {label: 'Mine', when: () => true, find}}});
  for (const [find, said] of [
    [async () => [], /"mine": find returned a promise: a check reads the shared samples and returns its hits/],
    [async () => { throw new Error('too late'); }, /"mine": find returned a promise/],
    [() => 7, /"mine": find must return a list of hits, \[\{kind, t, what\}\], not number/],
    [() => {}, /"mine": find must return a list of hits, \[\{kind, t, what\}\], not undefined/],
    [() => [{kind: 'x', t: NaN, what: 'w'}], /"mine": find's hit 0: t must be seconds on the film clock; a hit is \{kind, t, what\}/],
    [() => [{kind: 'x', t: 1, what: Symbol('w')}], /"mine": find's hit 0: what must be words \(a string\)/],
  ]) await assert.rejects(mine(find), said);
  const kept = await mine(({film: f}) => [2, 2.25, 2.5, 2.75, 3].map(t => ({kind: 'x', t, what: 'w', film: f, format: () => 'w'})));
  assert.deepEqual(kept.findings.map(({kind, from, to, what}) => ({kind, from, to, what})), [{kind: 'x', from: 2, to: 3, what: 'w'}], 'a hit is copied as {kind, t, what}: the film and a function it held stay out of the record');
  // A result the record cannot copy at the commit (simulated) never reaches the review: that is a failure too, in the engine's words.
  const clone = globalThis.structuredClone, poisoned = v => { try { return (JSON.stringify(v) ?? '').includes('LOST'); } catch { return false; } };
  t.mock.method(globalThis, 'structuredClone', (v, o) => { if (poisoned(v)) throw new DOMException('LOST could not be cloned.', 'DataCloneError'); return clone(v, o); });
  await assert.rejects(mine(() => [{kind: 'x', t: 1, what: 'LOST'}]), /review: a check failed, so the review is incomplete — "mine": it did not finish \(the engine: .*LOST could not be cloned/);
  assert.equal(printed.reduce((n, m) => n + m.mock.callCount(), 0), 0, 'the engine\'s own lines are kept for the report, never printed on stdout');
});
