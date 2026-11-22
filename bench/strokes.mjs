/**
 * What a hand-drawn map costs a frame (kits/isometric · paint.mjs): a world of 64 blocks (8 × 8, no labels) drawn
 * plain, in `human:sketchy` + `human:hatch`, with the hatch at spacing 4, and in each named look, each frame on the 1600 × 900 sheet drawn
 * whole (every stroke finished). Each world drawn RUNS times after a warm-up; the median milliseconds printed, with the
 * world's stroke count and its grain marks (a `lines` item's segments: the summary's `marks`). `node bench/strokes.mjs [runs]`. Quote a figure only from a run of this script on a quiet machine.
 */
import {createCanvas} from '@napi-rs/canvas';
import {compileIsometric} from '../src/kits/isometric/index.mjs';
import {loadTheme} from '../src/index.mjs';

const RUNS = Number(process.argv[2] ?? 30);
const median = (list) => { const s = [...list].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const blocks = Array.from({length: 64}, (_, i) => ({name: `b${i}`, at: [(i % 8) * 2, Math.floor(i / 8) * 2], size: [1.2, 1.2, 1]}));
const WORLDS = {
  plain: undefined,
  hatched: {line: 'human:sketchy', texture: 'human:hatch'},
  'spacing 4': {line: 'human:sketchy', texture: {name: 'human:hatch', spacing: 4}},
  // the named looks (0.49.0): the grain lays its marks as one `lines` item a face, not as strokes
  outlined: {look: 'outlined'},
  'line-art': {look: 'line-art'},
  'paper-grain': {look: 'paper-grain'},
  duotone: {look: 'duotone'},
};
// the grain at its finest over big faces: 256 blocks 3 tiles wide, spacing 4 (notes.mjs · MARKS_PER_STROKE)
const BIG = Array.from({length: 256}, (_, i) => ({name: `g${i}`, at: [(i % 16) * 4.8, Math.floor(i / 16) * 4.8], size: [3, 3, 1]}));

console.log(`a 64-block world (the last: 256 big blocks) drawn whole, median of ${RUNS} frames (ms), node ${process.version}`);
console.log('world        strokes   marks   frame ms');
for (const [name, style, list] of [...Object.entries(WORLDS).map(([n, s]) => [n, s, blocks]), ['grain 256×4', {texture: {name: 'human:grain', spacing: 4}}, BIG]]) {
  const world = compileIsometric({blocks: list, ...(style ? {style} : {})}, {clock: {at: () => 0}, theme: loadTheme('paper'), where: 'bench'});
  const c = createCanvas(1600, 900).getContext('2d'), frame = () => { const t0 = performance.now(); world.draw(c, 1e6); return performance.now() - t0; };
  frame();
  const times = Array.from({length: RUNS}, frame);
  console.log(`${name.padEnd(12)} ${String(world.summary.strokes ?? 0).padStart(7)} ${String(world.summary.marks ?? 0).padStart(7)}   ${median(times).toFixed(1).padStart(8)}`);
}
