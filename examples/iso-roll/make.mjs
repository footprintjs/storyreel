#!/usr/bin/env node
/**
 * Rolling, sliding, tumbling: an isometric world's blocks moved along the floor by intent (kits/isometric, `motion`,
 * footprint-story 0.31). The recipe says only what happens — the ball rolls, the crate slides, the cube tumbles off the
 * shelf, the ball rolls back — and footprint-story decides each move's model, duration and curve: a roll without
 * slipping that turns by distance / radius and comes to rest exactly on its place, a slide slowed by friction, a
 * spinning flight that lands the cube on a face and slides it on. The kit draws each turn as the grid sees it: the
 * ball's marks turn forward, the cube turns end over end. Silent (evenly spaced word times).
 *   node examples/iso-roll/make.mjs [out.mp4]
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {makeFilm, evenTimings} from 'footprint-storyreel';
import {isometricKit} from 'footprint-storyreel/kits/isometric';

const here = fileURLToPath(new URL('.', import.meta.url));
const read = (file) => JSON.parse(readFileSync(here + file, 'utf8'));
const storyboard = read('storyboard.json');
const result = await makeFilm({storyboard, recipe: read('recipe.json'), kits: [isometricKit], root: here,
  timings: evenTimings(storyboard, {tail: 1.5}), out: process.argv[2] ?? `${here}out/iso-roll.mp4`, render: {stamp: 'FOOTPRINT STORYREEL · ROLL, SLIDE, TUMBLE'}});
console.log(`${result.out} · ${result.seconds.toFixed(1)} s · making-of: ${result.makingOf}`);
