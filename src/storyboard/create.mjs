/**
 * The storyboard's command-line and MCP door: the shapes there are, the brief for whichever model writes one, and a film's
 * folder made from what it wrote. Read and checked by footprint-story/storyboard, drawn by film.mjs. Nothing here runs what a
 * storyboard says: it reaches a film only as text, and every file stays inside the project.
 */
import {existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync} from 'node:fs';
import path from 'node:path';
import {readStoryboard, storyShapes, storyboardBrief} from 'footprint-story/storyboard';
import {evenTimings} from '../clock.mjs';
import {compileFilm} from '../film.mjs';
import {writeOutput} from '../files.mjs';
import {filmFromBoard} from './film.mjs';

const MOST_BYTES = {storyboard: 1 << 20, conversation: 32 << 20};

/** A path the project holds, by its real path, so a link cannot lead out: the file's path, or a refusal naming the fix. */
function inProject(file, what, cwd) {
  const full = path.resolve(cwd, file), root = realpathSync(cwd);
  let existing = full;
  while (!existsSync(existing)) existing = path.dirname(existing);
  const real = realpathSync(existing);
  if (real !== root && !real.startsWith(root + path.sep)) throw new Error(`${what} "${file}" is outside this project: run this from the folder that holds it`);
  return full;
}

function readJson(file, what, cwd) {
  const full = inProject(file, what, cwd);
  if (!existsSync(full) || !statSync(full).isFile()) throw new Error(`no ${what} file "${file}": name a JSON file in this project`);
  if (statSync(full).size > MOST_BYTES[what]) throw new Error(`${what} "${file}" is too big: ${MOST_BYTES[what]} bytes is the most`);
  try { return JSON.parse(readFileSync(full, 'utf8')); } catch (e) { throw new Error(`${what} "${file}" is not valid JSON: ${e.message}`); }
}

const CONFIG = `// Written by storyreel create. Change story.json and create again for a film's words; this file is yours, and create leaves it alone.
import {readFileSync} from 'node:fs';

const read = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
export default {film: () => ({storyboard: read('./storyboard.json'), recipe: read('./recipe.json'), out: 'out'})};
`;

/** A film's folder from a storyboard: {folder, board, seconds, scenes}. New or empty, or one create made before (its story.json). */
export async function createFilm(to, input, {conversation, cwd = process.cwd()} = {}) {
  const folder = inProject(to, 'folder', cwd), board = readStoryboard(input, {conversation}), {storyboard, recipe} = filmFromBoard(board);
  const held = existsSync(folder) ? readdirSync(folder).filter((f) => !f.startsWith('.')) : [];
  if (held.length && !held.includes('story.json')) throw new Error(`${to} already holds files, and create did not make it: name a new or empty folder, so nothing is overwritten`);
  const film = await compileFilm({storyboard, recipe, timings: evenTimings(storyboard), root: cwd});
  mkdirSync(folder, {recursive: true});
  const write = (name, text) => writeOutput(path.join(folder, name), text);
  write('story.json', `${JSON.stringify(input, null, 1)}\n`);
  write('storyboard.json', `${JSON.stringify(storyboard, null, 1)}\n`);
  write('recipe.json', `${JSON.stringify(recipe, null, 1)}\n`);
  if (!existsSync(path.join(folder, 'storyreel.config.mjs'))) write('storyreel.config.mjs', CONFIG);
  return {folder, board, seconds: film.total, scenes: storyboard.scenes.length};
}

/** `storyreel create --from story.json --to my-film [--conversation chat.json]`: as text. */
export async function createTool(_, {from, to, conversation, cwd = process.cwd()} = {}) {
  if (!from || !to) throw new Error('name the storyboard and the new folder: --from story.json --to my-film');
  const messages = conversation ? readJson(conversation, 'conversation', cwd) : undefined;
  const made = await createFilm(to, readJson(from, 'storyboard', cwd), {conversation: messages, cwd});
  const checked = made.board.verified ? 'its numbers were checked against the conversation' : 'its numbers were not checked: name a --conversation to check them';
  return `✓ ${to} · ${made.board.shape} · ${made.scenes} scenes · ${made.seconds.toFixed(1)} s, silent\n  ${checked}\n  next, from ${to}: storyreel timeline · storyreel review · storyreel part --scene found`;
}

/** `storyreel shapes`: the shapes there are, and how to fill each, as JSON a model can read. */
export const shapesTool = () => JSON.stringify(storyShapes());

/** `storyreel brief --shape what-we-found [--conversation chat.json]`: what a model needs to write one. */
export function briefTool(_, {shape, conversation, cwd = process.cwd()} = {}) {
  if (!shape) throw new Error(`name the shape: --shape ${storyShapes().map((s) => s.name).join(' or ')}`);
  const {instructions, material} = storyboardBrief(shape, conversation ? {conversation: readJson(conversation, 'conversation', cwd)} : {});
  return material ? `${instructions}\n\nThe conversation, as material:\n${material}` : instructions;
}
