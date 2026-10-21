// The steps track (kits/paper/steps-track.mjs): a slim band of stations over any scene — the playhead walks back with
// ⏪, a flip turns it into ▶ and it plays forward — and its place in a film (recipe.stepsTrack, with a rewind cue).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createCanvas} from '@napi-rs/canvas';
import {readStepsTrack, stepsTrackAt, stepsTrackBox, stepsTrackLines, drawStepsTrack, STEPS_TRACK} from '../src/kits/paper/steps-track.mjs';
import {makePen} from '../src/pen.mjs';
import {loadTheme} from '../src/theme.mjs';
import {compileFilm, evenTimings} from '../src/index.mjs';
import {wordsAt} from '../src/review.mjs';
import {compileLayout} from '../src/layout.mjs';

const walk = (more = {}) => ({direction: 'back', stations: [{label: 'picture', at: 1}, {label: 'x, y', at: 3}, {label: 'z', at: 5}],
  flip: {at: 7, stations: [{label: 'HTML', at: 8}, {label: 'layout', at: 9}, {label: 'picture', at: 10}]}, ...more});
const states = (track, t) => stepsTrackAt(track, t).stations.map(s => `${s.text || '·'}:${s.state}`).join(' ');
const paper = loadTheme('paper');
const drawn = (track, t, canvas = createCanvas(1600, 900)) => {
  const ctx = canvas.getContext('2d'); ctx.reset(); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1600, 900);
  drawStepsTrack(ctx, makePen(ctx, paper, {baseScale: 1}), track, t);
  return createHash('sha256').update(ctx.getImageData(0, 0, 1600, 900).data).digest('hex');
};

test('each station is lit when the voice names it, the ones behind ticked, the next a "?", the rest not yet shown', () => {
  const track = readStepsTrack(walk());
  assert.equal(stepsTrackAt(track, .3), null, 'before it enters (0.6 s before its first station)');
  assert.equal(states(track, .6), '?:next ·:ahead ·:ahead', 'entering: the first step is still a question');
  assert.equal(states(track, 1), 'picture:current ?:next ·:ahead');
  assert.equal(states(track, 2.9), 'picture:current ?:next ·:ahead', 'mid-hop the next is still a "?"');
  assert.equal(states(track, 3), 'picture:visited x, y:current ?:next');
  assert.equal(states(track, 6.9), 'picture:visited x, y:visited z:current');
  assert.equal(stepsTrackAt(track, 12.9).stations.at(-1).state, 'current', 'it stays until 2.5 s after the last station, then leaves');
  assert.equal(stepsTrackAt(track, 13.1), null);
});

test('the playhead hops: it leaves a station 0.5 s before the next is named, eased, and arrives as it is', () => {
  const track = readStepsTrack(walk()), x = t => stepsTrackAt(track, t).walks[0].head, slots = stepsTrackAt(track, 6).stations.map(s => s.x);
  assert.equal(x(2.4), slots[0], 'resting on the first station');
  assert.ok(x(2.75) < slots[0] && x(2.75) > slots[1], 'on its way back (right to left)');
  assert.ok(Math.abs(x(2.75) - (slots[0] + slots[1]) / 2) < 1, 'half way at half the hop: an even ease');
  assert.equal(x(3), slots[1], 'arrived as the voice names it');
  assert.ok(slots[0] > slots[1] && slots[1] > slots[2], 'a walk back runs right to left, toward the mark');
  assert.ok(stepsTrackAt(track, 9.5).stations[0].x < stepsTrackAt(track, 9.5).stations[1].x, 'played forward it runs left to right');
});

test('the marks: ⏪ while it walks back, ▶ once the flip turns it over, and ▶ for a track that only plays forward', () => {
  const track = readStepsTrack(walk());
  assert.equal(stepsTrackAt(track, 4).mark, '⏪');
  assert.equal(stepsTrackAt(track, 4).direction, 'back');
  assert.equal(stepsTrackAt(track, 7.25).mark, '▶');
  assert.equal(stepsTrackAt(track, 7.25).direction, 'forward');
  const forward = readStepsTrack({direction: 'forward', stations: [{label: 'HTML', at: 1}, {label: 'DOM', at: 2}]});
  assert.equal(stepsTrackAt(forward, 1.5).mark, '▶');
});

test('the flip: the mark closes on ⏪ and opens on ▶, the walk back is ticked through, and the forward list starts as a "?"', () => {
  const track = readStepsTrack(walk()), half = STEPS_TRACK.flip;
  assert.equal(stepsTrackAt(track, 6.99).turn, 1);
  assert.ok(stepsTrackAt(track, 7 + half / 2).turn < 1 && stepsTrackAt(track, 7 + half / 2).mark === '⏪', 'closing');
  assert.ok(stepsTrackAt(track, 7 + half).turn < .01, 'edge-on: neither mark');
  assert.ok(stepsTrackAt(track, 7 + 1.5 * half).turn > 0 && stepsTrackAt(track, 7 + 1.5 * half).mark === '▶', 'opening on ▶');
  assert.equal(stepsTrackAt(track, 7 + 2 * half).turn, 1);
  const turning = stepsTrackAt(track, 7.3);
  assert.equal(turning.walks.length, 2, 'through the flip the walk back fades as the walk forward comes in');
  assert.deepEqual(turning.walks[0].stations.map(s => s.state), ['visited', 'visited', 'visited'], 'the finished rewind: every step ticked');
  assert.equal(states(track, 7.9), '?:next ·:ahead ·:ahead');
  assert.equal(states(track, 9), 'HTML:visited layout:current ?:next');
  assert.equal(states(track, 10), 'HTML:visited layout:visited picture:current');
  assert.equal(stepsTrackAt(track, 7.9).walks[0].stations[0].x, stepsTrackAt(track, 6.9).walks[0].head, 'the walk back ends where play begins: the playhead does not jump');
});

test('the same moment draws the same pixels, whatever was drawn before it on the context', () => {
  const track = readStepsTrack(walk()), canvas = createCanvas(1600, 900);
  for (const t of [1.2, 2.8, 7.1, 7.3, 9.6]) {
    const fresh = drawn(track, t);
    assert.equal(drawn(track, t), fresh, `again at ${t}`);
    drawn(track, t + 1.7, canvas);
    assert.equal(drawn(track, t, canvas), fresh, `after another moment on the same context, at ${t}`);
  }
  assert.notEqual(drawn(track, 2.7), drawn(track, 2.8), 'mid-hop it moves');
});

test('a label is the film\'s own words: an empty, long, broken or missing one refuses, naming the fix', () => {
  const one = label => () => readStepsTrack({direction: 'back', stations: [{label, at: 1}]});
  assert.throws(one(''), /stepsTrack.stations\[0\] has no label: a station's label is the film's own word for that step \(e.g. "layout"\); write the word the narration says there/);
  assert.throws(one('   '), /has no label/);
  assert.throws(one(undefined), /has no label/);
  assert.throws(one(7), /label must be words \(a string\), not 7/);
  assert.throws(one('the whole render tree step'), /is 26 characters; a station's label fits the slim band in 18 or fewer — use the narration's shortest word/);
  assert.throws(one('DOM\nCSSOM'), /breaks its line/);
  assert.equal(readStepsTrack({direction: 'back', stations: [{label: '  layout ', at: 1}]}).stations[0].label, 'layout', 'trimmed');
  assert.equal(readStepsTrack({direction: 'back', stations: [{label: 'x'.repeat(18), at: 1}]}).stations[0].label.length, 18, 'eighteen fits');
});

test('the rest of a track is checked too, every refusal saying what to write instead', () => {
  const read = spec => () => readStepsTrack(spec);
  assert.throws(read(walk({direction: 'sideways'})), /direction must be "back" \(⏪: a process walked backward\) or "forward" \(▶\)/);
  assert.throws(read(walk({place: 'middle'})), /place must be top or bottom/);
  assert.throws(read(walk({colour: 'red'})), /unsupported key colour/);
  assert.throws(read({direction: 'back', stations: []}), /must list the stations/);
  assert.throws(read({direction: 'back', stations: Array.from({length: 9}, (_, i) => ({label: `s${i}`, at: i}))}), /9 stations; a slim band holds 8 at most/);
  assert.throws(read({direction: 'back', stations: [{label: 'a', at: 1}, {label: 'b', at: 1.3}]}), /comes 0.30 s after the station before it; a station needs at least 0.6 s/);
  assert.throws(read({direction: 'back', stations: [{label: 'a', at: 1, glyph: 'star'}]}), /glyph must be one of tag, clock, flashlight/);
  assert.throws(read({direction: 'back', stations: [{label: 'a'}]}), /needs at: the moment the voice names "a"/);
  assert.throws(read({direction: 'back', stations: [{label: 'a', at: '1'}]}), /is a moment in seconds/);
  assert.throws(read({...walk(), direction: 'forward'}), /flip turns a finished rewind into play: give direction "back"/);
  assert.throws(read(walk({flip: {at: 5.2, stations: [{label: 'a', at: 8}]}})), /flip comes 0.20 s after the last station \("z"\)/);
  assert.throws(read(walk({flip: {at: 7, stations: [{label: 'a', at: 7.2}]}})), /comes 0.20 s after flip.at/);
  assert.throws(read(walk({from: 2})), /from comes after its first station/);
  assert.throws(read(walk({until: 9})), /until must come after its last station/);
  assert.throws(read(walk({rewind: {to: .1, seconds: 9}})), /rewind.seconds is how long the rewind plays, 0.5 to 4 s/);
  assert.throws(read(walk({rewind: {to: 2}})), /rewind.to must come before the track enters/);
});

test('the band never runs off the frame or into the landscape captions, and its box is where it draws', () => {
  const track = readStepsTrack(walk()), top = readStepsTrack(walk({place: 'top'}));
  const [x0, y0, x1, y1] = stepsTrackBox(track, 4);
  assert.ok(x0 >= 56 && x1 <= 1544 && y1 <= 900 - 4, 'inside the safe margin');
  assert.ok(y0 > 850, 'below the landscape caption band (frame y 717–850)');
  assert.ok(stepsTrackBox(top, 4)[1] >= 40, 'the top band leaves the corner label (an example scene\'s) its room');
  assert.equal(stepsTrackBox(track, .2), null);
  assert.deepEqual(stepsTrackLines(track).map(l => [l.text, l.from, l.to]), [['picture', 1, 7], ['x, y', 3, 7], ['z', 5, 7], ['HTML', 8, 13], ['layout', 9, 13], ['picture', 10, 13]]);
});

// A film: a world whose bar grows with time (so a rewind is seen), and a second world.
const storyboard = {title: 'Track', scenes: [
  {id: 'a', narration: 'Here is a picture. Let us walk backwards, need by need, one step at a time.'},
  {id: 'b', narration: 'First a place, then an order, then the layout of every box.'},
  {id: 'c', narration: 'Now play it forward: the page, the tree, the layout and the picture.'},
]};
const bar = (name, color) => ({name, story: {compile: () => ({hang: 1, spotAt: () => null, sounds: [], draw: (c, t) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, 1600, 900); c.fillStyle = color; c.fillRect(0, 300, Math.min(1600, t * 150), 200); }})}});
const kits = [bar('red', '#ff0000'), bar('blue', '#0000ff')];
const root = fileURLToPath(new URL('../examples/worlds/', import.meta.url));
const filmTrack = (more = {}) => ({place: 'bottom', direction: 'back', from: ['a', 'Let us walk backwards'], rewind: {to: ['a', 'Here is a picture']},
  stations: [{label: 'picture', at: ['a', 'need by need']}, {label: 'place', at: ['b', 'First a place']}, {label: 'layout', at: ['b', 'the layout']}],
  flip: {at: ['c', 'Now play it forward'], stations: [{label: 'page', at: ['c', 'the page']}, {label: 'tree', at: ['c', 'the tree']}, {label: 'picture', at: ['c', 'and the picture']}]}, ...more});
const recipe = (track = filmTrack()) => ({story: {kit: 'red'}, stages: [{type: 'world', scene: 'b', world: {kit: 'blue'}}, {type: 'world', scene: 'c', world: {kit: 'red'}}], stepsTrack: track});
const pixel = (film, t, x, y) => { const c = createCanvas(1600, 900), ctx = c.getContext('2d'); film.frame(ctx, t); return [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)]; };

test('in a film: the track is drawn over every shot, named in its regions, read by the reading check, and rewinds as it enters', async () => {
  const timings = evenTimings(storyboard), film = await compileFilm({storyboard, timings, recipe: recipe(), kits, root});
  const from = film.clock.at(['a', 'Let us walk backwards']), back = film.clock.at(['c', 'and the picture']);
  assert.ok(film.regionsAt(from + 1).some(r => r.path === 'stepsTrack'), 'its band is a region');
  assert.ok(!film.regionsAt(from - .1).some(r => r.path === 'stepsTrack'), 'not before it enters');
  assert.ok(film.overlays.some(o => o.path === 'stepsTrack'), 'an overlay: a segment it reaches is redrawn when it changes');
  assert.deepEqual(film.lines.filter(l => l.path.startsWith('stepsTrack')).map(l => l.text), ['picture', 'place', 'layout', 'page', 'tree', 'picture']);
  // The rewind: the REWIND badge and, under it, the picture of an earlier moment (a shorter bar).
  const badge = pixel(film, from + .7, 1340, 67);
  assert.ok(badge[0] > 150 && badge[1] < 90, `the red REWIND badge (${badge})`);
  assert.ok(!(pixel(film, from + 1.6, 1340, 67)[0] > 150 && pixel(film, from + 1.6, 1340, 67)[1] < 90), 'gone after its 1.5 s');
  const reach = t => { const c = createCanvas(1600, 900), ctx = c.getContext('2d'); film.frame(ctx, t); const row = ctx.getImageData(0, 400, 1600, 1).data; let x = 0; while (x < 1600 && row[4 * x] > 150 && row[4 * x + 1] < 120) x++; return x; };
  assert.ok(reach(from + 1.2) < reach(from) - 50, 'the picture plays back');
  // The words: its labels are read like every word, inside the frame, never under the landscape captions.
  const layout = compileLayout(film, {format: 'landscape', captions: true}), at = back + .5;
  const words = wordsAt(film, at, {layout}).filter(w => ['page', 'tree', 'picture'].includes(w.text));
  assert.equal(words.length, 3, 'the forward labels are on screen');
  for (const w of words) assert.ok(Math.min(...w.box.filter((_, i) => i % 2)) > 860 + 160 && Math.max(...w.box.filter((_, i) => i % 2)) < 1080, `"${w.text}" sits below the caption band (${w.box})`);
});

test('in a film: a rewind replays its own shot only, and a track with a bad key refuses the recipe', async () => {
  const timings = evenTimings(storyboard);
  await assert.rejects(compileFilm({storyboard, timings, recipe: recipe(filmTrack({from: ['b', 'First a place'], stations: [{label: 'place', at: ['b', 'then an order']}], flip: undefined, rewind: {to: ['a', 'Here is a picture']}})), kits, root}),
    /stepsTrack.rewind replays the shot it plays in \(b\): rewind.to must be inside that shot/);
  await assert.rejects(compileFilm({storyboard, timings, recipe: recipe(filmTrack({stations: [{label: '', at: ['a', 'need by need']}]})), kits, root}), /stepsTrack.stations\[0\] has no label/);
  await assert.rejects(compileFilm({storyboard, timings, recipe: {...recipe(), stepTrack: {}}, kits, root}), /stepTrack/);
});
