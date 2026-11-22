#!/usr/bin/env node
/**
 * Pieces that move: an isometric world's blocks moved by intent (kits/isometric, `motion`). The recipe says only what
 * happens — the box falls, the ball is thrown to the server — and footprint-story decides each move's model, duration
 * and curve: a fall under gravity onto the floor below the box, a 45° throw onto the server's top with a wind-up first.
 * Silent (evenly spaced word times).
 *   node examples/iso-motion/make.mjs [out.mp4]
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {makeFilm, evenTimings} from 'footprint-storyreel';
import {isometricKit} from 'footprint-storyreel/kits/isometric';

const here = fileURLToPath(new URL('.', import.meta.url));
const read = (file) => JSON.parse(readFileSync(here + file, 'utf8'));
const storyboard = read('storyboard.json');
const result = await makeFilm({storyboard, recipe: read('recipe.json'), kits: [isometricKit], root: here,
  timings: evenTimings(storyboard, {tail: 1.5}), out: process.argv[2] ?? `${here}out/iso-motion.mp4`, render: {stamp: 'FOOTPRINT STORYREEL · ISOMETRIC MOTION'}});
console.log(`${result.out} · ${result.seconds.toFixed(1)} s · making-of: ${result.makingOf}`);
