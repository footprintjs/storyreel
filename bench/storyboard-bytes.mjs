#!/usr/bin/env node
/**
 * What a model writes for a film from a conversation, against what it would otherwise write by hand: the storyboard, and the
 * film's own storyboard and recipe made from it. Bytes, with tokens as an estimate at four bytes each. It measures this one
 * example's writing only, not the rounds of fixing, nor a recipe a person would have drawn differently.
 *   node bench/storyboard-bytes.mjs
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {readStoryboard} from 'footprint-story/storyboard';
import {filmFromBoard} from '../src/storyboard/film.mjs';

const here = fileURLToPath(new URL('../examples/found/', import.meta.url));
const read = (file) => JSON.parse(readFileSync(here + file, 'utf8'));
const story = read('story.json'), {storyboard, recipe} = filmFromBoard(readStoryboard(story, {conversation: read('chat.json')}));
const size = (value) => JSON.stringify(value).length, written = size(story), made = size(storyboard) + size(recipe);
console.log(`the agent writes     ${written} bytes (~${Math.round(written / 4)} tokens)`);
console.log(`instead of           ${made} bytes (~${Math.round(made / 4)} tokens)`);
console.log(`saved on this example ${Math.round((1 - written / made) * 100)}%`);
