#!/usr/bin/env node
/**
 * One film, a version for every place it is posted: the hello example (silent, even word times) in the
 * four formats — each with burned-in captions, a title band where the shape has room, a crop that
 * follows the action in the tall ones, caption files beside the wide one, and motion blur.
 *   node examples/formats.mjs [out-dir]      → out/formats/<format>/hello.mp4 (+ poster.jpg, chapters.txt)
 * Each version goes in its own folder: a render writes poster.jpg and chapters.txt beside its video.
 */
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileFilm, evenTimings, renderFilm} from 'footprint-storyreel';

const dir = fileURLToPath(new URL('./hello/', import.meta.url)), read = f => JSON.parse(readFileSync(dir + f, 'utf8'));
const storyboard = read('storyboard.json'), timings = evenTimings(storyboard, {tail: 4});
const film = await compileFilm({storyboard, timings, recipe: read('recipe.json'), root: dir});
const header = {title: storyboard.title, sub: 'how counting began'};
// The crop's centre on the 1600-wide frame, moved on the phrases that bring something new.
const crop = [{at: ['story', 'a shepherd'], x: 330}, {at: ['story', 'for every sheep'], x: 900}, {at: ['story', 'he dropped one pebble'], x: 1360}, {at: ['story', 'came home', 1.5], x: 800}];
const VERSIONS = {
  landscape: {layout: {format: 'landscape', captions: true}, captionFiles: true},   // YouTube, X, LinkedIn (and a caption file for players that show their own)
  square: {layout: {format: 'square', header, captions: true}},                     // LinkedIn, X, Facebook feeds
  portrait: {layout: {format: 'portrait', header, captions: true, crop}},          // Instagram and Facebook feeds
  vertical: {layout: {format: 'vertical', header, captions: true, crop}},          // Shorts, Reels, TikTok
};
const outDir = path.resolve(process.argv[2] ?? 'out/formats');
for (const [name, options] of Object.entries(VERSIONS)) {
  const result = await renderFilm({film, storyboard, timings, out: path.join(outDir, name, 'hello.mp4'), motionBlur: 4, ...options});
  console.log(`${name.padEnd(9)} ${result.out}${result.captions ? `  + ${Object.values(result.captions).map(f => path.basename(f)).join(', ')}` : ''}`);
}
