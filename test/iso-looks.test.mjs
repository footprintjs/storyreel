// A world names one of footprint-story's looks (0.34: outlined, line-art; 0.35: paper-grain, duotone) as its style,
// `{"style": {"look": "duotone"}}` (src/kits/isometric/read.mjs · readStyle); the choices handed in are
// footprint-story's own list (HUMAN_STYLE_CHOICES); a look on a dark ground takes the ground's colours where it has its
// own (looks.mjs · groundedStyle), and a block's name is written in the ink that reads on its face (looks.mjs · nameInk),
// so StoryReel's own contrast check reads every look clean on a light ground and a dark one. The grain's marks count
// against the 0.46 stroke budget (notes.mjs · MARKS_PER_STROKE).
//
// The small worlds' pictures hold no letters, so no font decides a pixel of them; the example film (examples/iso-looks)
// is pinned in golden.json on the paper theme.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createCanvas} from '@napi-rs/canvas';
import {USUAL_STYLE, ISO_LOOKS, DUOTONE} from 'footprint-story/isometric';
import {HUMAN_STYLE_CHOICES} from 'footprint-story/human';
import {compileFilm, evenTimings, loadTheme, validateTheme} from '../src/index.mjs';
import {reviewPart, REVIEW_CHECKS} from '../src/review.mjs';
import {compileIsometric, isometricKit, MARKS_PER_STROKE, STROKE_BUDGET} from '../src/kits/isometric/index.mjs';
import {STYLE_CHOICES} from '../src/kits/isometric/read.mjs';
import {lookOf, ISO_LOOK} from '../src/kits/isometric/draw.mjs';
import * as READ from '../src/kits/isometric/read.mjs';
import * as BUILD from '../src/kits/isometric/build.mjs';
import {groundedStyle, nameInk, darkGround, ratioOf} from '../src/kits/isometric/looks.mjs';
import {markCount, drawnNotes, strokeNotes} from '../src/kits/isometric/notes.mjs';
import {PINS_HERE} from './golden.mjs';

const LOOKS = ['outlined', 'line-art', 'paper-grain', 'duotone'];
const paper = loadTheme('paper');
// a dark theme: the paper theme's type and sizes, a night palette (ground #161b22, ink #e8e4da)
const night = validateTheme({...structuredClone(paper), id: 'night', palette: {...paper.palette, bg: '#161b22', glow: '#1f2630', panel: '#1c222b', edge: '#3a4350', ink: '#e8e4da', dim: '#a8a294', card: '#1c222b', well: '#242b35'}});
const USUAL_ROW = {...USUAL_STYLE, effects: [...USUAL_STYLE.effects]};
// no label anywhere: the pinned pictures hold no letters
const WORLD = {blocks: [{name: 'web'}, {name: 'api', size: [2, 2, 1.6], group: 'back', tone: 'ok'}, {name: 'db', kind: 'cylinder', size: [1.8, 1.8, 1.2], group: 'back', tone: 'warn'}],
  floors: [{group: 'back'}], wires: [{arrow: 'web to api'}, {arrow: 'api to db'}]};
const world = (style, theme = paper, extra = {}) => compileIsometric({...WORLD, ...extra, ...(style === undefined ? {} : {style})}, {clock: {at: () => 0}, theme, where: 'stage map'});

test('a world names a look: footprint-story\'s row under its name, handed in as written, the record keeping the name', () => {
  for (const look of LOOKS) {
    const w = world({look}), row = {...USUAL_ROW, ...Object.fromEntries(Object.entries(ISO_LOOKS[look]).map(([k, v]) => [k, typeof v === 'string' ? v : v.name]))};
    assert.deepEqual(groundedStyle({look}, lookOf(paper), 'w').style, {look}, `${look}: the build is handed the row as written`);
    assert.deepEqual(w.summary.style.row, row, `${look}: the look's row`);
    assert.equal(w.summary.style.look, look, 'footprint-story\'s record names the look');
    assert.deepEqual(w.summary.look, {name: look, ground: 'light'});
    assert.deepEqual(w.map.look, {name: look, ground: 'light'});
  }
  // a column written beside the look replaces the look's entry for it, whole
  assert.equal(world({look: 'line-art', line: {name: 'contour', width: 4}}).summary.style.options.line.width, 4);
  // a world with no look keeps its record as it was: no `look` key
  assert.ok(!('look' in world().summary) && !('look' in world({line: 'none'}).map));
});

test('the choices handed in are footprint-story\'s own list: the grain the paper-grain look names is taken, no list of StoryReel\'s', async () => {
  assert.equal(STYLE_CHOICES, HUMAN_STYLE_CHOICES);
  const w = world({look: 'paper-grain'});
  assert.ok(w.summary.marks > 0, 'the grain lays its marks');
  // the map flow `storyreel check` runs is handed the same list and builds the very same map
  const run = await w.mapRun();
  assert.equal(run.differs, null);
  assert.equal(run.snapshot.sharedState.style.look, 'paper-grain');
});

test('a look that is none, or one the row overrides whole, is refused naming the entry and the fix (footprint-story\'s words)', () => {
  const refused = (style, pattern) => assert.throws(() => world(style), pattern, JSON.stringify(style));
  refused({look: 'glitter'}, /^Error: stage map: isometric style: look is one of "outlined", "line-art", "paper-grain", "duotone" \(a row of choices under a name\), or none — not "glitter"$/);
  refused({look: 7}, /^Error: stage map: isometric style: look is one of .* — not 7$/);
  refused({look: 'duotone', palette: 'theme'}, /^Error: stage map: isometric style: look "duotone" sets palette, and the row writes it itself, so the look draws nothing — drop the look, or the palette written beside it$/);
  refused({look: 'line-art', shading: 'tones', line: 'ink'}, /look "line-art" sets shading and line, and the row writes each itself, so the look draws nothing — drop the look, or the shading and line written beside it$/);
  refused({look: 'duotone', texture: 'human:hatch'}, /^Error: stage map: isometric style: texture "human:hatch" cannot sit with palette "duotone" \(from the look "duotone": write palette beside it to change it\) — /);
  refused({look: 'paper-grain', texture: 'human:grain'}, /^Error: stage map: isometric style: look "paper-grain" sets texture, and the row writes it itself, so the look draws nothing — drop the look, or the texture written beside it$/);
  refused({texture: {name: 'human:grain', spacing: 2}}, /^Error: stage map: isometric style: texture "human:grain" takes a spacing from 4 to 200 px — not 2$/);
  // a ball is drawn in today's look whatever the style (read.mjs)
  assert.throws(() => world({look: 'outlined'}, paper, {blocks: [{name: 'ball', kind: 'ball'}], floors: [], wires: []}), /a ball is drawn in today's look, and this world names a style/);
});

test('on a dark ground, line-art and duotone take its colours: the paper the ground, the duotone\'s ink the theme\'s', () => {
  const look = lookOf(night);
  assert.ok(darkGround(look) && !darkGround(lookOf(paper)), 'the night ground is dark, the paper one light');
  // line-art: its paper shading the ground; its contour still the look's own, so the look is named beside it
  const art = world({look: 'line-art'}, night);
  assert.deepEqual(groundedStyle({look: 'line-art'}, look, 'w'), {style: {look: 'line-art', shading: {name: 'paper', colour: look.bg}}, look: {name: 'line-art', ground: 'dark'}});
  assert.equal(art.summary.style.look, 'line-art');
  assert.deepEqual(art.summary.look, {name: 'line-art', ground: 'dark'});
  // duotone: its one column takes the ground's colours, so its row is written out (a look that draws nothing of its
  // own is refused); the record keeps the name beside footprint-story's style
  const duo = world({look: 'duotone'}, night);
  assert.deepEqual(groundedStyle({look: 'duotone'}, look, 'w').style, {palette: {name: 'duotone', paper: look.bg, ink: look.ink, accent: DUOTONE.accent}});
  assert.ok(!('look' in duo.summary.style));
  assert.deepEqual(duo.summary.look, {name: 'duotone', ground: 'dark'});
  assert.deepEqual(duo.summary.style.options.palette, {accent: DUOTONE.accent, ink: look.ink, paper: look.bg});
  // the looks with no page colour of their own, and a column the recipe writes, are as written
  for (const style of [{look: 'outlined'}, {look: 'paper-grain'}, {look: 'line-art', shading: 'tones'}]) assert.deepEqual(groundedStyle(style, look, 'w').style, style, JSON.stringify(style));
  assert.deepEqual(groundedStyle(null, look, 'w'), {style: null, look: null}, 'no style: today\'s look, nothing recorded');
  // on a light ground every look is handed as written
  for (const l of LOOKS) assert.deepEqual(groundedStyle({look: l}, lookOf(paper), 'w').style, {look: l});
  // a dark ground whose colours make no duotone a name can be read on is refused, naming the entry and the fix
  const muddy = {...look, ink: '#8a6a50'};
  assert.throws(() => groundedStyle({look: 'duotone'}, muddy, 'stage map: isometric style'),
    /^Error: stage map: isometric style: the look "duotone" on this dark ground \(#161b22\) takes the ground's colours \(palette: .*\), and then palette "duotone": a name in its ink #8a6a50 stands .* : 1 on its tint .* — write the palette out in place of the look, with colours that read on this ground$/);
});

test('the drawing takes the ground: line-art\'s faces are the ground and its lines the ink; the duotone\'s lines the theme\'s ink', () => {
  const look = lookOf(night), lists = (style) => { const c = recorder(); world(style, night).draw(c, 10); return c.ops; };
  const fills = lists({look: 'line-art'}).filter((op) => op[0] === 'set' && op[1] === 'fillStyle').map((op) => op[2]);
  assert.ok(fills.includes(look.bg) && !fills.includes('#ffffff'), 'line-art on the night ground: faces of the ground, no white paper');
  const strokes = lists({look: 'duotone'}).filter((op) => op[0] === 'set' && op[1] === 'strokeStyle').map((op) => op[2]);
  assert.ok(strokes.includes(look.ink) && !strokes.includes(DUOTONE.ink), 'duotone on the night ground: its lines in the theme\'s ink, not the navy');
});

test('a duotone world hands its untoned blocks\' colours to the build, so the duotone tints them; a toned block stays the page\'s', () => {
  const {readMap} = READ, {specOf} = BUILD;
  const spec = (style, theme = paper) => specOf(Object.assign(readMap({...WORLD, style}, 'm'), {style: groundedStyle(readMap({...WORLD, style}, 'm').style, lookOf(theme), 'm').style}), 'm');
  for (const theme of [paper, night]) {
    const blocks = spec({look: 'duotone'}, theme).blocks;
    assert.deepEqual(blocks.map((b) => b.colours ?? null), [{base: ISO_LOOK.tone}, null, null], 'web, untoned, hands the kit\'s tone; api (ok) and db (warn) are the page\'s');
  }
  assert.deepEqual(spec({palette: 'duotone'}).blocks[0].colours, {base: ISO_LOOK.tone}, 'the palette written out, the same');
  for (const style of [{look: 'outlined'}, {look: 'line-art'}, {look: 'paper-grain'}, {line: 'none'}]) assert.ok(spec(style).blocks.every((b) => !('colours' in b)), `${JSON.stringify(style)}: no colours handed in`);
  // the web block's faces are the duotone's tints (light: toward the accent on white), its lines the duotone's ink
  const c = recorder();
  world({look: 'duotone'}).draw(c, 10);
  const fills = c.ops.filter((op) => op[0] === 'set' && op[1] === 'fillStyle').map((op) => op[2]), strokes = c.ops.filter((op) => op[0] === 'set' && op[1] === 'strokeStyle').map((op) => op[2]);
  assert.ok(strokes.includes(DUOTONE.ink), 'its lines in the duotone\'s ink');
  assert.ok(fills.some((f) => /^#f[0-9a-f]{5}$/.test(f) && f !== '#ffffff'), `a tint of the orange accent among the fills (${[...new Set(fills)].slice(0, 8).join(', ')})`);
});

test('a name is written in the ink that reads on its face: the theme\'s on every light-theme tone, the ground on a pale face of a dark theme', () => {
  const light = lookOf(paper), dark = lookOf(night);
  // the faces a name stands on: the usual tone, the ok / warn / bad tints, line-art's paper (StoryReel's tops, 20% to white)
  for (const face of ['#e1e9f5', '#d9e4f3', '#ffffff', '#c6e0d2', '#ead7bf', '#ecc6c3']) {
    assert.equal(nameInk(face, light), light.ink, `${face}: the paper theme's ink`);
    assert.equal(nameInk(face, dark), dark.bg, `${face}: on a dark theme, the ground`);
    assert.ok(ratioOf(nameInk(face, dark), face) >= 4.5);
  }
  assert.equal(nameInk(dark.bg, dark), dark.ink, 'a face of the dark ground: the theme\'s ink');
  assert.equal(nameInk(null, dark), dark.ink, 'no fill of its own: the ink');
});

/** The example film on a theme: its recipe and storyboard, silent, as golden.mjs compiles it. */
async function looksFilm(theme) {
  const dir = fileURLToPath(new URL('../examples/iso-looks/', import.meta.url)), read = (f) => JSON.parse(readFileSync(dir + f, 'utf8')), storyboard = read('storyboard.json');
  return {film: await compileFilm({storyboard, timings: evenTimings(storyboard, {tail: 1.5}), recipe: read('recipe.json'), kits: [isometricKit], root: dir, theme}), storyboard};
}

test('StoryReel\'s contrast check reads every look clean, on a light ground and a dark one: each look\'s scene read alone', async () => {
  const closest = {};
  for (const [ground, theme] of [['light', paper], ['dark', night]]) {
    const {film, storyboard} = await looksFilm(theme), ids = storyboard.scenes.map((s) => s.id);
    for (const [k, id] of ids.entries()) {
      // one look's scene at a time: the check judges a word by its best moment, so read together one look's faint word
      // would be hidden by another look's clear one
      const r = await reviewPart(film, {from: film.clock.start(id), to: k + 1 < ids.length ? film.clock.start(ids[k + 1]) : film.total, checks: {contrast: REVIEW_CHECKS.contrast}});
      const v = r.verdicts.find((x) => x.check === 'contrast');
      assert.equal(v.verdict, 'passed', `${id} on the ${ground} ground: ${JSON.stringify(v.measured)}`);
      assert.equal(v.measured.words, 7, `${id} on the ${ground} ground: every label read (3 names, a small line, a floor's name, 2 cable labels)`);
      assert.equal(v.measured.unseen, 0, `${id} on the ${ground} ground: no label drawn where it cannot be seen`);
      closest[`${id} ${ground}`] = `${v.measured.closest.text} ${v.measured.closest.ratio}`;
    }
  }
  // the word read nearest its threshold, per look and ground (fonts decide the pixels: pinned where pins compare)
  if (PINS_HERE) {
    assert.deepEqual(closest, {
      'outlined light': 'a browser 5.08', 'line-art light': 'a browser 5.55', 'paper-grain light': 'a browser 5.08', 'duotone light': 'a browser 5.09',
      'outlined dark': 'a browser 5.43', 'line-art dark': 'a browser 6.91', 'paper-grain dark': 'a browser 5.43', 'duotone dark': 'a browser 5.65',
    });
  }
});

/** A canvas that keeps every call and every style set, in order. */
function recorder() {
  const ops = [], state = {globalAlpha: 1};
  return new Proxy({}, {
    get: (_, key) => (key === 'ops' ? ops : key in state ? state[key] : (...args) => { ops.push([key, ...args]); }),
    set: (_, key, value) => { state[key] = value; ops.push(['set', key, value]); return true; },
  });
}

/** A world drawn at 10 s on the 1600×900 sheet: its pixels' hash. */
function hashOf(style, theme) {
  const canvas = createCanvas(1600, 900), c = canvas.getContext('2d');
  world(style, theme).draw(c, 10);
  return createHash('sha256').update(c.getImageData(0, 0, 1600, 900).data).digest('hex').slice(0, 16);
}

test('pixels: each look on each ground, pinned; four different pictures a ground, and every look differs from today\'s', () => {
  const hashes = {};
  for (const [ground, theme] of [['light', paper], ['dark', night]]) {
    const today = hashOf(undefined, theme), mine = LOOKS.map((look) => hashOf({look}, theme));
    assert.equal(new Set([today, ...mine]).size, 5, `${ground}: five different pictures`);
    LOOKS.forEach((look, i) => { hashes[`${look} ${ground}`] = mine[i]; });
  }
  assert.equal(hashOf({look: 'outlined'}, paper), hashOf({line: 'contour'}, paper), 'a look named and its row written out draw the same');
  if (PINS_HERE) {
    assert.deepEqual(hashes, {
      'outlined light': '7881ee9881fbabdb', 'line-art light': 'f85f1b449b70a084', 'paper-grain light': '86e966a71eaff34d', 'duotone light': '4fcadd91a9265fb1',
      'outlined dark': '5fbc457a3832f8cf', 'line-art dark': '82dd08c01448b891', 'paper-grain dark': '8f8d53263f6a9fe2', 'duotone dark': '86f55d18a28d0b2a',
    });
  }
});

test('the grain\'s marks count against the stroke budget: 32 marks a stroke, a note from 2000, refused past 20000', () => {
  const w = world({look: 'paper-grain'});
  assert.equal(MARKS_PER_STROKE, 32);
  assert.ok(w.summary.marks > 100 && !('strokes' in w.summary), `the grain's marks are counted (${w.summary.marks}), and it lays no strokes`);
  assert.ok(!('marks' in world().summary) && !('marks' in world({look: 'line-art'}).summary), 'a world with no texture marks keeps its summary as it was (the floor\'s tile lines are the map\'s own, not marks)');
  // strokes alone: exactly the strokes' notes
  for (const n of [0, STROKE_BUDGET.note, STROKE_BUDGET.most]) assert.deepEqual(drawnNotes(n, 0, 'stage map'), strokeNotes(n, 'stage map'));
  assert.deepEqual(drawnNotes(0, (STROKE_BUDGET.note - 1) * MARKS_PER_STROKE, 'stage map'), [], 'marks counted up to the next stroke: 63,968 marks are 1,999 strokes');
  assert.equal(drawnNotes(0, (STROKE_BUDGET.note - 1) * MARKS_PER_STROKE + 1, 'stage map').length, 1, 'one mark more is 2,000');
  const [note] = drawnNotes(10, STROKE_BUDGET.note * MARKS_PER_STROKE, 'stage map');
  assert.match(note.message, /^stage map: isometric style: the map's hand-drawn lines \(10 strokes\) and its texture's 64000 marks \(32 marks a stroke\) come to 2010 strokes \(a note from 2000, refused past 20000\): each frame fills every stroke drawn so far, so the film renders slower — to lighten it, give the grain or the hatch a wider spacing/);
  assert.throws(() => drawnNotes(0, STROKE_BUDGET.most * MARKS_PER_STROKE + 1, 'stage map'), /come to 20001 strokes, and a world draws at most 20000 — give the grain or the hatch a wider spacing \(texture: \{"name": "human:grain", "spacing": 32\}\), take the texture out, or draw fewer blocks$/);
  // the count is the built map's own: every `lines` item's segments but the floors' tile lines
  assert.equal(markCount({blocks: [{paint: [{item: 'lines', role: 'grain', segments: [[0, 0, 1, 1], [1, 1, 2, 2]]}]}], floors: [{paint: [{item: 'lines', role: 'grid', segments: [[0, 0, 9, 9]]}]}]}), 2);
});
