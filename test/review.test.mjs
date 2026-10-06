// Reviewing a part by reading it (review.mjs): the words a frame draws, read with their boxes; the checks picked
// by what the part has, each run as its own subflow; findings as spans on the film clock, as text; the record.
import test from 'node:test';
import assert from 'node:assert/strict';
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
  assert.deepEqual([...r.ran].sort(), ['cut-off', 'hook', 'still', 'text-density', 'under-captions', 'words-overlap'], 'a director\'s checks too: the hook (the part starts the film), how much there is to read');
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
