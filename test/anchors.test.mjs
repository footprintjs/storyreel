// The anchors (anchors.mjs): every phrase a film is keyed to, checked in one pass — not said, said more than once, an
// nth past the last place, an unknown scene — with where each is named and words that name each place alone; and the
// compile that notes them instead of stopping at the first (compileFilm's anchors: 'note').
import test from 'node:test';
import assert from 'node:assert/strict';
import {compileFilm, evenTimings, makeClock} from '../src/index.mjs';
import {checkPhrase, nearestWords, exactPhrases, standIn, anchorsText} from '../src/anchors.mjs';

const storyboard = {title: 'Anchors', scenes: [
  {id: 'add', narration: 'The party dresses: one ten and two ones. The uniforms: one ten and five ones. One ten, two tens!'},
  {id: 'seal', narration: 'Then he seals the tokens in a clay envelope, so the count stays safe.'},
  {id: 'tens', narration: 'Ten, then ten, then ten, then ten, then ten more.'},
]};
const timings = evenTimings(storyboard), clock = makeClock(storyboard, timings);
/** A kit whose spec names beats, resolved as any kit resolves them (each twice: a kit may read a beat more than once). */
const beats = {name: 'beats', story: {compile: (spec, c) => { for (const b of spec.beats) { c.at(b); c.at(b); } return {hang: 1, draw() {}}; }}};
const film = list => compileFilm({storyboard, timings, recipe: {story: {kit: 'beats', beats: list}}, kits: [beats], anchors: 'note'});

test('one phrase: said once, not said, said more than once, an nth past the last, an unknown scene', () => {
  assert.equal(checkPhrase(clock, ['add', 'two tens']).problem, null);
  assert.equal(checkPhrase(clock, {scene: 'add', phrase: 'one ten', nth: 2}).problem, null, 'an nth that names a place');
  const missing = checkPhrase(clock, ['seal', 'he keeps them in one clay envelope']);
  assert.equal(missing.problem, 'missing'); assert.equal(missing.near.phrase, 'clay envelope', 'the nearest words: the longest run said, the most letters of runs as long');
  const many = checkPhrase(clock, ['add', 'One ten']);
  assert.equal(many.problem, 'ambiguous'); assert.equal(many.places.length, 3);
  assert.equal(checkPhrase(clock, {scene: 'add', phrase: 'one ten', nth: 3}).problem, 'past');
  for (const nth of [-1, 1.5]) assert.equal(checkPhrase(clock, {scene: 'add', phrase: 'one ten', nth}).problem, 'past', `nth ${nth} names no place`);
  assert.equal(checkPhrase(clock, ['nowhere', 'one ten']).problem, 'scene');
  assert.equal(nearestWords(clock, 'seal', 'the cow said moo'), null, 'no run worth naming: "the" names nothing');
  assert.throws(() => checkPhrase({}, ['add', 'x']), /checkPhrase reads a film's clock: pass film\.clock, or makeClock\(storyboard, timings\)/);
});

test('each place alone: words added after a beat keep its time; before a pause, its end', () => {
  const places = clock.places('add', 'one ten');
  const starts = exactPhrases(clock, 'add', places), ends = exactPhrases(clock, 'add', places, {keep: 'end'});
  assert.deepEqual(starts.map(e => e.phrase), ['one ten and two', 'one ten and five', 'One ten two']);
  assert.deepEqual(starts.map(e => e.at), places.map(p => p.start), 'each fix starts where its place starts');
  for (const e of starts) assert.equal(clock.places('add', e.phrase).length, 1, `"${e.phrase}" is said once`);
  assert.deepEqual(ends.map(e => e.at), places.map(p => p.end), 'each fix ends where its place ends');
  assert.ok(ends.every(e => /one ten$/i.test(e.phrase)), `words added before: ${ends.map(e => e.phrase)}`);
});

test('the compile notes every phrase not as written, once each, and goes on; by default it stops at the first', async () => {
  const f = await film([['add', 'two tens'], ['add', 'One ten'], ['seal', 'he keeps them in one clay envelope', .5], {scene: 'add', phrase: 'one ten', nth: 7}, ['nowhere', 'x']]);
  assert.deepEqual(f.anchors.map(n => [n.problem, n.path]), [['ambiguous', 'story.beats[1]'], ['missing', 'story.beats[2]'], ['past', 'story.beats[3]'], ['scene', 'story.beats[4]']], 'one note each, though each is read twice');
  const at = f.beats.find(b => b.path === 'story.beats[2]').t, near = clock.places('seal', 'clay envelope')[0].start + .5;
  assert.ok(Math.abs(at - near) < 1e-3, `a missing phrase stands at the nearest words said (${at} vs ${near})`);
  assert.equal(f.beats.find(b => b.path === 'story.beats[3]').t, +clock.places('add', 'one ten').at(-1).start.toFixed(3), 'a past nth, at the last place');
  assert.deepEqual((await compileFilm({storyboard, timings, recipe: {story: {kit: 'beats', beats: [['add', 'two tens']]}}, kits: [beats]})).anchors, [], 'refuse (the default) notes nothing');
  await assert.rejects(compileFilm({storyboard, timings, recipe: {story: {kit: 'beats', beats: [['seal', 'he keeps them']]}}, kits: [beats]}), /Phrase not in seal: "he keeps them"/);
  await assert.rejects(compileFilm({storyboard, timings, recipe: {story: {kit: 'beats', beats: []}}, kits: [beats], anchors: 'warn'}), /anchors must be 'refuse' \(the default: .*\) or 'note'/);
  assert.equal(standIn(clock, ['nowhere', 'x', 2], {problem: 'scene', places: []}, 'at'), 2);
  const pause = standIn(clock, ['seal', 'he keeps them in one clay envelope'], checkPhrase(clock, ['seal', 'he keeps them in one clay envelope']), 'pauseAfter');
  assert.ok(pause.end - pause.start >= 1, 'a pause stood in is long enough for a guess');
});

test('note mode notes only the recipe\'s own phrases: a kit that probes nth until the clock refuses still stops', async () => {
  const found = [], probes = {name: 'probes', story: {compile: (spec, c) => { let n = 0; for (;; n++) { try { c.at({scene: 'add', phrase: 'one ten', nth: n}); } catch { break; } } found.push(n); return {hang: 1, draw() {}}; }}};
  const f = await compileFilm({storyboard, timings, recipe: {story: {kit: 'probes'}}, kits: [probes], anchors: 'note'});
  assert.deepEqual(found, [3]); assert.deepEqual(f.anchors, [], 'a phrase a kit builds for itself is read as ever, never noted');
  const stopping = {name: 'stopping', story: {compile: (spec, c) => { c.at(spec.first); throw new Error('stopping: a kit refuses'); }}};
  const error = await compileFilm({storyboard, timings, recipe: {story: {kit: 'stopping', first: ['seal', 'he keeps them']}}, kits: [stopping], anchors: 'note'}).catch(e => e);
  assert.match(error.message, /stopping: a kit refuses/); assert.deepEqual(error.anchors.map(n => [n.problem, n.path, n.how]), [['missing', 'story.first', 'at']], 'what was noted before the stop rides on the error');
});

test('the text: the count, then each kind with where it is named and what to write; the first 10 a kind unless asked', async () => {
  const f = await film([['add', 'One ten'], ['seal', 'he keeps them in one clay envelope']]);
  const text = anchorsText({clock: f.clock, notes: f.anchors, checked: 2});
  assert.match(text, /^2 phrases checked: 1 not said, 1 said more than once\n/);
  assert.match(text, /not said:\n {2}seal "he keeps them in one clay envelope" → story\.beats\[1\] — not said; the nearest words said: "clay envelope" \([\d.]+ s\)/);
  assert.match(text, /said more than once \(the first place is used\):\n {2}add "One ten" → story\.beats\[0\] — said 3 times; the first is used \([\d.]+ s\)\. Each alone: "one ten and two" \([\d.]+ s\) · "one ten and five" \([\d.]+ s\) · "One ten two" \([\d.]+ s\)/);
  const lots = await film(Array.from({length: 12}, (_, i) => ['seal', `nothing like ${i}`]));
  const short = anchorsText({clock: lots.clock, notes: lots.anchors, checked: 12}), full = anchorsText({clock: lots.clock, notes: lots.anchors, checked: 12}, {full: true});
  assert.match(short, /… 2 more: --full lists every one/); assert.equal(full.split('\n').length, 14);
  assert.equal(anchorsText({clock, notes: [], checked: 3}), '3 phrases checked: each said once, where it is named');
  assert.match(anchorsText({clock, notes: [], checked: 0}), /^no phrase is named/);
  assert.match(anchorsText({clock, notes: [], checked: 1, stopped: 'a kit refused'}), /^the compile stopped, so the recipe's phrases were read from the recipe itself: 1 checked\nthe compile stopped: a kit refused\nfix the phrases above, and run it again$/);
  // A pause (a guess, a hold) is timed by its end: its first place and each fix say the end, and fixes add words before.
  const places = clock.places('add', 'one ten'), pause = anchorsText({clock, notes: [{ref: ['add', 'one ten'], path: 'guesses[0].after', how: 'pauseAfter', problem: 'ambiguous', places}], checked: 1});
  assert.match(pause, new RegExp(`the first is used \\(${places[0].end.toFixed(2)} s\\)\\. Each alone: "[^"]*one ten" \\(${places[0].end.toFixed(2)} s\\)`), pause);
  // A phrase said many times lists three places, and counts the rest.
  const many = anchorsText({clock, notes: [{ref: ['tens', 'ten'], path: 'x', how: 'at', problem: 'ambiguous', places: clock.places('tens', 'ten')}], checked: 1});
  assert.match(many, /said 5 times; .* · … 2 more$/); assert.equal((many.match(/ \(\d+\.\d+ s\)/g) ?? []).length, 4, 'the first place, then three fixes');
});
