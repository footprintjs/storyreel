#!/usr/bin/env node
/**
 * A film from a conversation: chat.json is what was said, story.json is the storyboard an agent wrote from it. It is checked
 * against the conversation, drawn as a film's own inputs, and made, silent.
 *   node examples/found/make.mjs [out.mp4]
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {readStoryboard} from 'footprint-story/storyboard';
import {makeFilm, evenTimings} from 'footprint-storyreel';
import {filmFromBoard} from 'footprint-storyreel/storyboard';

const here = fileURLToPath(new URL('.', import.meta.url));
const read = (file) => JSON.parse(readFileSync(here + file, 'utf8'));
const board = readStoryboard(read('story.json'), {conversation: read('chat.json')});
const {storyboard, recipe} = filmFromBoard(board);
const out = process.argv[2] ?? `${here}out/found.mp4`;
const result = await makeFilm({storyboard, recipe, root: here, timings: evenTimings(storyboard, {tail: 3}), out});
console.log(`${result.out} · ${result.seconds.toFixed(1)} s · numbers checked: ${board.verified}\n${result.chapters.join('\n')}`);
