// An isometric world's `style` (src/kits/isometric/read.mjs · readStyle, build.mjs · specOf): a row of footprint-story's
// named style choices handed to the map build, so the paint list the kit's painter draws follows it. A world with no
// style is exactly today's (the example films' frames stay as test/golden.json pins them); a written style is drawn as
// it asks (an outlined 5 px line at 5 px, `line: "none"` with no outline); a wrong one is refused naming the entry and
// the fix; and the record says the style each world was built in.
//
// The style's pictures are pinned here, not in golden.json: golden.json pins the example films (test/golden.mjs ·
// FILMS), and these are three small worlds drawn alone, beside the test that says why they differ.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import {USUAL_STYLE} from 'footprint-story/isometric';
import {compileFilm, evenTimings, loadTheme} from '../src/index.mjs';
import {isometricKit, compileIsometric} from '../src/kits/isometric/index.mjs';
import {readMap} from '../src/kits/isometric/read.mjs';
import {specOf} from '../src/kits/isometric/build.mjs';
import {PINS_HERE} from './golden.mjs';

const theme = loadTheme('paper');
// no label anywhere: the pinned pictures hold no letters, so no font decides a pixel of them
const WORLD = {blocks: [{name: 'web'}, {name: 'api', size: [2, 2, 1.6], group: 'back'}, {name: 'db', kind: 'cylinder', size: [1.8, 1.8, 1.2], group: 'back'}],
  floors: [{group: 'back', color: '#eef3f8'}], wires: [{arrow: 'web to api'}, {arrow: 'api to db'}]};
const OUTLINED = {line: {name: 'ink', width: 5}}, NONE = {line: 'none'};
const USUAL_ROW = {...USUAL_STYLE, effects: [...USUAL_STYLE.effects]};

const world = (style, where = 'stage map') => compileIsometric({...WORLD, ...(style === undefined ? {} : {style})}, {clock: {at: () => 0}, theme, where});
/** A world drawn at 10 s on the 1600×900 sheet: its pixels' hash and how many are near the ink (an edge's pixels). */
function picture(style) {
  const canvas = createCanvas(1600, 900), c = canvas.getContext('2d');
  world(style).draw(c, 10);
  const data = c.getImageData(0, 0, 1600, 900).data;
  let ink = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] < 60 && data[i + 1] < 60 && data[i + 2] < 60) ink += 1;
  return {hash: createHash('sha256').update(data).digest('hex'), ink};
}

/** A canvas that keeps every call and every style set, in order. */
function recorder() {
  const ops = [], state = {globalAlpha: 1};
  return new Proxy({}, {
    get: (_, key) => (key === 'ops' ? ops : key in state ? state[key] : (...args) => { ops.push([key, ...args]); }),
    set: (_, key, value) => { state[key] = value; ops.push(['set', key, value]); return true; },
  });
}
/** Each stroke the canvas drew, with the line width set when it was drawn and the item kind traced before it. */
function strokes(ops) {
  const out = [];
  let width = null, traced = null;
  for (const op of ops) {
    if (op[0] === 'set' && op[1] === 'lineWidth') width = op[2];
    if (['moveTo', 'ellipse', 'arc'].includes(op[0]) && traced === null) traced = op[0];
    if (op[0] === 'beginPath') traced = null;
    if (op[0] === 'stroke') out.push({width, traced});
  }
  return out;
}

test('a world with no style is today\'s: no style in the spec, and the paint lists of a style written as the usual one', () => {
  const read = readMap(WORLD, 'stage map');
  assert.equal(read.style, null);
  assert.ok(!('style' in specOf(read, 'stage map')), 'the spec has no style key: byte for byte what it was before worlds took one');
  // every column written as its usual choice draws the very same lists
  const usual = world(), written = world({shape: 'box', shading: 'tones', line: 'ink', palette: 'theme', texture: 'none', effects: []});
  const lists = (w) => { const c = recorder(); w.draw(c, 10); return c.ops; };
  assert.deepEqual(lists(written), lists(usual));
});

test('a style is accepted as footprint-story writes it: a name, or {name, …options}, any column left out', () => {
  for (const style of [OUTLINED, NONE, {line: 'ink'}, {line: {name: 'ink', width: 0.5}}, {line: {name: 'ink', width: 20}}, {shading: 'tones', effects: []}, {}]) {
    assert.doesNotThrow(() => world(style), JSON.stringify(style));
  }
  // the recipe's own lists are left as written: the kit hands the build a copy (the spec is frozen)
  const effects = [], recipe = {...WORLD, style: {effects}};
  compileIsometric(recipe, {clock: {at: () => 0}, theme, where: 'stage map'});
  assert.ok(!Object.isFrozen(effects), 'the recipe\'s own list is not frozen by the build');
});

test('a wrong style is refused, naming the entry, the words there are and the fix', () => {
  const refused = (style, pattern) => assert.throws(() => world(style), pattern, JSON.stringify(style));
  refused('outlined', /^Error: stage map: isometric style is a row of style choices, a column each \(\{"line": \{"name": "ink", "width": 5\}\} for an outlined look, \{"line": "none"\} for none\): the columns are shape, shading, line, palette, texture, effects — not "outlined"$/);
  refused(['ink'], /stage map: isometric style is a row of style choices/);
  refused({colour: 'red'}, /^Error: stage map: isometric style takes the columns shape, shading, line, palette, texture, effects \(a column left out keeps today's look\) — not "colour"$/);
  refused({line: 'dashed'}, /^Error: stage map: isometric style: line has no choice "dashed" — the line choices are "ink" or "none"$/);
  refused({shading: 'flat'}, /^Error: stage map: isometric style: shading has no choice "flat" — the shading choices are "tones"$/);
  refused({line: {width: 5}}, /^Error: stage map: isometric style: line is a choice's name, or \{"name": …, its options\} — the line choices are "ink" or "none"; not \{"width":5\}$/);
  refused({line: 5}, /stage map: isometric style: line is a choice's name/);
  refused({effects: ['glow']}, /^Error: stage map: isometric style: effects\[0\] has no choice "glow" — there are no effects yet: leave effects out$/);
  refused({effects: 'glow'}, /^Error: stage map: isometric style: effects is a list of effects, each adding to the whole — not "glow"$/);
  // what only the choice knows: its options and their ranges (footprint-story's words, in the entry's name)
  refused({line: {name: 'ink', width: 50}}, /^Error: stage map: isometric style: line "ink" takes a width from 0\.5 to 20 px — not 50$/);
  refused({line: {name: 'ink', width: '5'}}, /stage map: isometric style: line "ink" takes a width from 0\.5 to 20 px — not "5"/);
  refused({line: {name: 'ink', colour: '#ff0000'}}, /^Error: stage map: isometric style: line "ink" takes width — not "colour"$/);
  refused({line: {name: 'none', width: 3}}, /^Error: stage map: isometric style: line "none" takes no options — not "width"$/);
  // a getter is refused, never run (read.mjs · plain), as every other key of the world
  const sneaky = {...WORLD, style: Object.defineProperty({}, 'line', {get: () => 'ink', enumerable: true})};
  assert.throws(() => compileIsometric(sneaky, {clock: {at: () => 0}, theme, where: 'stage map'}), /stage map: isometric\.style\.line is a getter — write it as a plain value \(JSON\)/);
});

test('the kit draws what the style asks: an outlined line at its width, and no outline on the faces with line "none"', () => {
  const drawn = (style) => { const c = recorder(); world(style).draw(c, 10); return strokes(c.ops); };
  const usual = drawn(undefined), outlined = drawn(OUTLINED), none = drawn(NONE);
  // a face's edge is a stroke of 2.5 px today; 5 px outlined; none at all with line "none" (the floor's 1.5 px tile lines,
  // the 4 px cables and the arrow heads are the same in each)
  const edges = (list, width) => list.filter((s) => s.width === width).length;
  assert.ok(edges(usual, 2.5) >= 7, `today's faces are edged at 2.5 px (${edges(usual, 2.5)})`);
  assert.equal(edges(outlined, 2.5), 0, 'outlined: no edge at 2.5 px');
  assert.equal(edges(outlined, 5), edges(usual, 2.5), 'outlined: every edge at 5 px');
  assert.equal(edges(none, 2.5) + edges(none, 5), 0, 'line "none": no face is edged');
  assert.ok(edges(none, 1.5) > 0 && edges(none, 1.5) === edges(usual, 1.5), 'line "none" keeps the floor\'s tile lines (its tiles, not an outline)');
  assert.equal(none.length, usual.length - edges(usual, 2.5), 'nothing else is stroked differently');
});

test('pixels: an outlined world and a no-outline world differ from today\'s and from each other, ink as each asks', () => {
  const usual = picture(undefined), outlined = picture(OUTLINED), none = picture(NONE);
  assert.equal(new Set([usual.hash, outlined.hash, none.hash]).size, 3, 'three different pictures');
  assert.equal(picture({line: 'ink'}).hash, usual.hash, 'the usual line written out is today\'s picture');
  assert.ok(none.ink < usual.ink && usual.ink < outlined.ink, `the ink on the frame: none ${none.ink} < today ${usual.ink} < outlined ${outlined.ink}`);
  // the pictures pinned, where pins can be compared (golden.mjs · PINS_HERE): re-pin only for an intended change
  if (PINS_HERE) {
    assert.deepEqual({usual: usual.hash, outlined: outlined.hash, none: none.hash}, {
      usual: '47ccac7f9ada4496081c5aea5cef1e08b0259ab5fbde49aea3967fcc7c9d65de',
      outlined: '71755da1db441043a9594a9b037de4d2e40ba776490ec8238566dfb18214397a',
      none: 'b4c23f53c3098bb8ebfc124354e6ceaeb96f111d65410ab37b8e91c49f6add6f',
    });
  }
});

test('the record says the style each world was built in: the world\'s record, its summary in the compile\'s record, and the map flow\'s record', async () => {
  const outlined = world(OUTLINED), usual = world();
  assert.deepEqual(outlined.map.style, {row: USUAL_ROW, options: {line: {width: 5}}});
  assert.deepEqual(usual.map.style, {row: USUAL_ROW, options: {}}, 'no style written: the usual row, every column filled in');
  assert.deepEqual(world(NONE).summary.style, {row: {...USUAL_ROW, line: 'none'}, options: {}});
  // the compile's record keeps the summary beside the world's entry
  const sb = {scenes: [{id: 'one', narration: 'A map drawn with a heavy outline.'}]};
  const film = await compileFilm({storyboard: sb, timings: evenTimings(sb), recipe: {story: {kit: 'isometric', ...WORLD, style: OUTLINED}}, kits: [isometricKit], record: true});
  assert.deepEqual(film.record.snapshot.sharedState['world.story'].summary.style, {row: USUAL_ROW, options: {line: {width: 5}}});
  // the map flow (storyreel check's record) reads the very spec, style and all, and builds the kit's map
  const run = await outlined.mapRun();
  assert.equal(run.differs, null);
  assert.deepEqual(run.snapshot.sharedState.style, {row: USUAL_ROW, options: {line: {width: 5}}});
  // a refusal through the film names the recipe entry from the top
  await assert.rejects(compileFilm({storyboard: sb, timings: evenTimings(sb), recipe: {story: {kit: 'isometric', ...WORLD, style: {line: 'dashed'}}}, kits: [isometricKit]}),
    /the story: isometric style: line has no choice "dashed" — the line choices are "ink" or "none"/);
});
