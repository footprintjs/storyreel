// A ball in a styled world (0.50.0): footprint-story paints the film's round kind (0.37: `paintPiece` with kind
// 'ball') in every style and look, and the kit turns and moves its list (src/kits/isometric/ball.mjs): each seam item
// takes the turned mark's points (turn.mjs · ballPicture, the level seam first) and every point goes where the pose
// says. A line that draws a ball's seams by hand (human:sketchy) keeps no seam item, so a move that turns that ball is
// refused (pinned in iso-roll.test.mjs). The pictures hold no letters, so no font decides a pixel of them.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import {SEAM} from 'footprint-story/isometric';
import {loadTheme, validateTheme} from '../src/index.mjs';
import {compileIsometric} from '../src/kits/isometric/index.mjs';
import {readMap} from '../src/kits/isometric/read.mjs';
import {buildMap} from '../src/kits/isometric/build.mjs';
import {ballItemsAt, posedItems} from '../src/kits/isometric/ball.mjs';
import {ballPicture, centreOf, turning, turnAxis, UNTURNED} from '../src/kits/isometric/turn.mjs';
import {PINS_HERE} from './golden.mjs';

const LOOKS = [undefined, 'outlined', 'line-art', 'paper-grain', 'duotone', 'sketchy'];
const styleOf = (look) => (look ? {look} : undefined);
const paper = loadTheme('paper');
const night = validateTheme({...structuredClone(paper), id: 'night', palette: {...paper.palette, bg: '#161b22', glow: '#1f2630', panel: '#1c222b', edge: '#3a4350', ink: '#e8e4da', dim: '#a8a294', card: '#1c222b', well: '#242b35'}});
const grid = {tile: 120, at: [800, 200]};
// a ball beside a block, untoned and toned, no label: the pictures hold no letters
const BLOCKS = [{name: 'ball', kind: 'ball', at: [1, 3], size: [1.4, 1.4, 1.4]}, {name: 'warm', kind: 'ball', at: [4, 1], tone: 'warn'}, {name: 'box', at: [3, 4]}];
const world = (look, theme = paper, extra = {}) => compileIsometric({grid, blocks: BLOCKS, ...styleOf(look) && {style: styleOf(look)}, ...extra}, {clock: {at: () => 0}, theme, where: 'stage s'});
const built = (look) => buildMap(readMap({grid, blocks: BLOCKS, ...styleOf(look) && {style: styleOf(look)}}, 's'), 's');
const close = (a, b, what, tol = 1e-9) => a.flat(2).forEach((v, i) => assert.ok(Math.abs(v - b.flat(2)[i]) <= tol, `${what}: ${v} vs ${b.flat(2)[i]}`));

function hashOf(look, theme) {
  const canvas = createCanvas(1600, 900), c = canvas.getContext('2d');
  world(look, theme).draw(c, 10);
  return createHash('sha256').update(c.getImageData(0, 0, 1600, 900).data).digest('hex').slice(0, 16);
}

test('a ball is drawn in every look, on a light ground and a dark one: six different pictures a ground, pinned', () => {
  const hashes = {};
  for (const [ground, theme] of [['light', paper], ['dark', night]]) {
    const mine = LOOKS.map((look) => hashOf(look, theme));
    assert.equal(new Set(mine).size, LOOKS.length, `${ground}: a picture a look`);
    LOOKS.forEach((look, i) => { hashes[`${look ?? 'today'} ${ground}`] = mine[i]; });
  }
  if (PINS_HERE) {
    assert.deepEqual(hashes, {
      'today light': 'cbf1274de6ccbec4', 'outlined light': 'cf0512fcb839628e', 'line-art light': '7fc224ef5ab82923', 'paper-grain light': 'bf5ad829f822626c', 'duotone light': '318516eb447d6d74', 'sketchy light': '63eae4bb278da987',
      'today dark': '8e6ab28292f004a0', 'outlined dark': '4a2910acf7661354', 'line-art dark': '52d463896a14057e', 'paper-grain dark': '356d1214b42f1ed0', 'duotone dark': '14338e1739d60c1f', 'sketchy dark': 'e80b26d0f1281d46',
    });
  }
});

test('the ball is footprint-story\'s: its outline, middle and box the ones the kit turned before, its list the style\'s', () => {
  for (const look of LOOKS) {
    const map = built(look);
    for (const b of map.blocks.filter((x) => x.kind === 'ball')) {
      const pic = ballPicture(map.grid, centreOf(b), b.size[0] / 2, UNTURNED);
      close(b.shape.outline, pic.outline, `${look}: ${b.name}'s outline`);
      close([b.shape.centre], [pic.centre], `${look}: ${b.name}'s middle`);
      const xs = pic.outline.map((p) => p[0]), ys = pic.outline.map((p) => p[1]);
      close([[b.shape.box.x, b.shape.box.y, b.shape.box.w, b.shape.box.h]], [[Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]], `${look}: ${b.name}'s box`);
      assert.ok(b.paint.every((it) => it.of === b.name), `${look}: every item is the ball's`);
      assert.equal(b.paint.filter((it) => it.role === 'top').length, 1, `${look}: one silhouette, a face as a top is`);
      assert.equal(b.paint.filter((it) => it.role === 'seam').length, look === 'sketchy' ? 0 : 2, `${look}: two seam items, or none when the line draws them by hand`);
    }
  }
  // today's look: the ball the kit drew before — its disc 20% toward white, edged in the ink 2.5 px; its seams the ink
  // at half, 2 px, round (footprint-story's SEAM: the kit's own mark and markLine, gone with its copy of the painter)
  const [top, ...seams] = built(undefined).blocks[0].paint;
  assert.deepEqual([top.item, top.fill.mix, top.stroke], ['polygon', ['#ffffff', 0.2], {colour: null, alpha: 1, width: 2.5, join: 'round', cap: 'butt'}]);
  assert.deepEqual(SEAM, {alpha: 0.5, share: 4 / 5});
  for (const s of seams) assert.deepEqual([s.item, s.role, s.stroke], ['path', 'seam', {colour: null, alpha: 0.5, width: 2, join: 'round', cap: 'round'}]);
  // a sketched ball's strokes are counted against the stroke budget with the map's others
  assert.ok(world('sketchy').summary.strokes > world('sketchy', paper, {blocks: BLOCKS.filter((b) => b.kind !== 'ball')}).summary.strokes);
});

test('a turned ball: each seam item takes its turned mark, level seam first; unturned, the built list itself', () => {
  for (const look of LOOKS.filter((l) => l !== 'sketchy')) {
    const map = built(look), b = map.blocks[0];
    assert.equal(ballItemsAt(b, map.grid, UNTURNED), b.paint, `${look}: unturned, the built list`);
    // the marks of no turn are the built seams, point for point: so the swap puts each in its own seam's place
    assert.deepEqual(ballItemsAt(b, map.grid, [...UNTURNED]), b.paint, `${look}: the marks of no turn are the seams`);
    const turn = turning(turnAxis([1, 0]), 0.7), items = ballItemsAt(b, map.grid, turn), marks = ballPicture(map.grid, centreOf(b), b.size[0] / 2, turn).marks;
    const swapped = items.filter((it) => it.role === 'seam');
    swapped.forEach((it, k) => assert.deepEqual(it.segments, [['move', ...marks[k][0]], ...marks[k].slice(1).map((p) => ['line', ...p])], `${look}: seam ${k} is mark ${k}`));
    items.forEach((it, i) => { if (it.role !== 'seam') assert.equal(it, b.paint[i], `${look}: the rest of the list as built`); });
  }
});

test('a moved ball: every point of its list put where the pose says, widths and times kept', () => {
  // a move by (1, -3) and a squash ×2 across, ×1 down, about the pivot (0, 0): x → 2x + 1, y → y − 3
  const pose = {dx: 1, dy: -3, pivot: [0, 0], sx: 2, sy: 1};
  const items = [{item: 'polygon', points: [[0, 0], [1, 2]]}, {item: 'path', segments: [['move', 1, 1], ['line', 2, 3], ['arc', 1, 1, 2, 2, 0, 1, false], ['close']]}, {item: 'lines', segments: [[0, 1, 2, 3]]},
    {item: 'stroke', points: [[1, 1, 0.5, 0], [2, 2, 1, 0.1]]}, {item: 'ellipse', cx: 1, cy: 1, rx: 2, ry: 1}];
  assert.deepEqual(posedItems(items, pose), [{item: 'polygon', points: [[1, -3], [3, -1]]}, {item: 'path', segments: [['move', 3, -2], ['line', 5, 0], ['arc', 3, -2, 4, 2, 0, 1, false], ['close']]},
    {item: 'lines', segments: [[1, -2, 5, 0]]}, {item: 'stroke', points: [[3, -2, 0.5, 0], [5, -1, 1, 0.1]]}, {item: 'ellipse', cx: 3, cy: -2, rx: 4, ry: 1}]);
  // a sketched ball slides, drawn by hand as it goes, the same at any moment in any order
  const w = world('sketchy', paper, {motion: [{piece: 'ball', do: 'slide', to: [1, 6]}]}), hash = (t) => { const c = createCanvas(400, 225).getContext('2d'); c.scale(0.25, 0.25); w.draw(c, t); return createHash('sha256').update(c.getImageData(0, 0, 400, 225).data).digest('hex'); };
  const [a, b] = [hash(0.4), hash(1.2)];
  assert.notEqual(a, b, 'it moves');
  assert.equal(hash(0.4), a);
});
