#!/usr/bin/env node
/**
 * One map, five looks: the same isometric world named in each of footprint-story's looks (kits/isometric, `style`,
 * `{"look": …}`, footprint-story 0.34, 0.35 and 0.37) — `outlined` (a bold contour, the sticker look), `line-art` (ink
 * lines on paper), `paper-grain` (a fine seeded grain over every face), `duotone` (two inks on paper; the ok / warn tones
 * are the page's and kept) and `sketchy` (drawn by hand, the sides hatched). On a dark theme line-art, sketchy and
 * duotone take the theme's ground and ink (looks.mjs). Silent
 * (evenly spaced word times).
 *   node examples/iso-looks/make.mjs [out.mp4]
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {makeFilm, evenTimings} from 'footprint-storyreel';
import {isometricKit} from 'footprint-storyreel/kits/isometric';

const here = fileURLToPath(new URL('.', import.meta.url));
const read = (file) => JSON.parse(readFileSync(here + file, 'utf8'));
const storyboard = read('storyboard.json');
const result = await makeFilm({storyboard, recipe: read('recipe.json'), kits: [isometricKit], root: here,
  timings: evenTimings(storyboard, {tail: 1.5}), out: process.argv[2] ?? `${here}out/iso-looks.mp4`, render: {stamp: 'FOOTPRINT STORYREEL · FIVE LOOKS'}});
console.log(`${result.out} · ${result.seconds.toFixed(1)} s · making-of: ${result.makingOf}`);
