// Music first (music.mjs · beatTimings): a film timed by its song — each scene whole bars from a downbeat, its words on
// its beats, its beats on the clock (clock.beats) — and a kinetic stage that lands its words on them (on: "beats").
import test from 'node:test';
import assert from 'node:assert/strict';
import {compileFilm, evenTimings, makeClock} from '../src/index.mjs';
import {beatTimings} from '../src/music.mjs';
import {kineticKit, compileKinetic} from '../src/kits/kinetic/index.mjs';

// a song at 120 BPM: a beat every 0.5 s from 1.0 s, a bar (4 beats) every 2 s
const song = {sure: true, bpm: 120, beats: Array.from({length: 64}, (_, i) => 1 + i * .5), bars: Array.from({length: 16}, (_, i) => 1 + i * 2)};
const storyboard = {title: 'Beat', scenes: [{id: 'open', narration: 'Every beat'}, {id: 'drop', narration: 'lands on a cut every time'}, {id: 'card', silent: [['the logo', 1]]}]};

test('each scene lasts whole bars from the first downbeat at or after from; its words land on its beats; start places the song', () => {
  const r = beatTimings(storyboard, song, {bars: {open: 1, default: 2}, from: .5});
  assert.equal(r.from, 1, 'the first bar at or after 0.5 s');
  assert.equal(r.start, -1, 'the song plays from 1 s into it as the film begins');
  assert.deepEqual(r.bars, [{scene: 'open', bars: 1, seconds: 2}, {scene: 'drop', bars: 2, seconds: 4}, {scene: 'card', bars: 2, seconds: 4}]);
  const [open, drop, card] = r.timings.scenes;
  assert.deepEqual(open.words, [{text: 'Every', start: 0, end: .5}, {text: 'beat', start: .5, end: 2}], 'one per beat; the last holds to the scene\'s end');
  assert.deepEqual(open.beats, [0, .5, 1, 1.5]);
  assert.deepEqual(drop.words.map((w) => w.start), [0, .5, 1, 1.5, 2, 2.5], 'lands on a cut every time: six words, six beats');
  assert.deepEqual(card.words.map((w) => w.text), ['the', 'logo'], 'a silent scene\'s directions land on its beats too');
  assert.equal(open.alignment.method, 'beats');
  assert.deepEqual(beatTimings(storyboard, song, {bars: {drop: 3, default: 2}, every: 2}).timings.scenes[0].words.map((w) => w.start), [0, 1], 'every 2 beats: a word a second at 120 BPM');
});

test('the clock knows a scene\'s beats on the film\'s clock; timings without beats give none', () => {
  const {timings} = beatTimings(storyboard, song, {bars: {open: 1, default: 2}});
  const clock = makeClock(storyboard, timings);
  assert.deepEqual([...clock.beats('drop')], [2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5]);
  assert.deepEqual([...makeClock(storyboard, evenTimings(storyboard)).beats('drop')], []);
});

test('refusals name the fix: an unsure beat, no bar left, too many words, bars and every out of range', () => {
  assert.throws(() => beatTimings(storyboard, {...song, sure: false, verdict: 'tempo-close'}), /the song's beat is unsure \(tempo-close\) — give its tempo \(music\.bpm\) when you map it, or choose a song with a clearer beat/);
  assert.throws(() => beatTimings(storyboard, song, {from: 40}), /the song has no bar at or after 40 s \(its last starts at 31\.00 s\) — start earlier \(from\)/);
  assert.throws(() => beatTimings(storyboard, song, {bars: 8}), /the song runs out of bars at scene "drop" \(\d+ left, it asks 8\) — give the scenes fewer bars, or start earlier \(from\)/);
  assert.throws(() => beatTimings(storyboard, song, {bars: 1, every: 2}), /scene "drop" has 6 words and 2 beats to land them on \(1 bar, a word every 2 beats\) — give it more bars, or fewer words/);
  assert.throws(() => beatTimings(storyboard, song, {bars: {open: 1}}), /scene "drop" lasts a whole number of bars, 1–64/);
  assert.throws(() => beatTimings(storyboard, song, {every: 0}), /every is the beats between two words, a whole number 1–8/);
  assert.throws(() => beatTimings(storyboard, {beats: []}), /beats is the song's beat map \(beatMap\(file\)\), with its beats and bars/);
});

test('a kinetic stage lands its words on the beats: word after word, every N beats; an at in among them; refusals name the fix', async () => {
  const {timings} = beatTimings(storyboard, song, {bars: {open: 1, default: 2}});
  const film = await compileFilm({storyboard, timings, recipe: {story: {kit: 'kinetic', scene: 'open', on: 'beats', words: ['EVERY', 'BEAT']},
    stages: [{type: 'world', scene: 'drop', enter: 'cut', world: {kit: 'kinetic', scene: 'drop', on: 'beats', every: 2, words: ['LANDS', 'ON', 'THE', 'CUT'], flip: true}}]}, kits: [kineticKit]});
  const beats = film.clock.beats('drop');
  assert.deepEqual(compileKinetic({scene: 'drop', on: 'beats', every: 2, words: ['LANDS', 'ON', 'THE', 'CUT']}, film.clock).words.map((w) => w.at), [beats[0], beats[2], beats[4], beats[6]]);
  const mixed = compileKinetic({scene: 'drop', on: 'beats', words: ['A', {text: 'B', at: ['drop', 'cut']}, 'C']}, film.clock).words.map((w) => w.at);
  assert.equal(mixed[1], film.clock.at(['drop', 'cut']));
  assert.ok(mixed[2] > mixed[1] && beats.includes(mixed[2]), 'the word after an at lands on the next beat after it');
  assert.throws(() => compileKinetic({scene: 'drop', on: 'beats', every: 4, words: ['A', 'B', 'C']}, film.clock), /kinetic word "C" has no beat left in scene "drop" \(8 beats, a word every 4\) — give the scene more bars, or fewer words/);
  const voiced = makeClock(storyboard, evenTimings(storyboard));
  assert.throws(() => compileKinetic({scene: 'drop', on: 'beats', words: ['A']}, voiced), /scene "drop" has no beats — time the film by its song \(footprint-storyreel\/music · beatTimings\), or land the words on the voice \(on: "voice"\)/);
  assert.throws(() => compileKinetic({scene: 'drop', every: 2, words: ['lands']}, voiced), /kinetic every counts beats — set on: "beats" too, or leave every out/);
  assert.throws(() => compileKinetic({scene: 'drop', on: 'drums', words: ['lands']}, voiced), /kinetic on is "voice" \(each word as it is said\) or "beats"/);
});
