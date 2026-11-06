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
import {withFixBriefs} from './fixes.mjs';
import {forgetVoice} from '../narrate.mjs';

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
import {existsSync, readFileSync} from 'node:fs';

const at = (file) => new URL(file, import.meta.url);
const read = (file) => JSON.parse(readFileSync(at(file), 'utf8'));
const {lang} = read('./story.json');
// Once storyreel narrate has voiced every scene, the voice times the film, with this settle after each scene's last word.
const voiced = () => (existsSync(at('./voice/timings.json')) ? {pacing: {sceneTail: 0.8, holds: []}} : {});
export default {film: () => ({storyboard: read('./storyboard.json'), recipe: read('./recipe.json'), out: 'out', narrationDir: 'voice', ...voiced(), ...(lang ? {lang} : {})})};
`;
/** The one file only create writes: how it knows a folder is its own, whatever else the folder holds. */
const MADE_BY_CREATE = '.storyreel-create';

/**
 * A film's folder from a storyboard: {folder, board, seconds, scenes}. New or empty, or one create made before. `inputs`: files
 * this call reads, which may already stand in the folder, so a project of one conversation can become the film itself.
 */
export async function createFilm(to, input, {conversation, cwd = process.cwd(), inputs = []} = {}) {
  const folder = inProject(to, 'folder', cwd), board = readStoryboard(input, {conversation}), {storyboard, recipe} = filmFromBoard(board);
  const own = new Set(inputs.map((file) => path.resolve(cwd, file)));
  const held = existsSync(folder) ? readdirSync(folder).filter((f) => !f.startsWith('.') && !own.has(path.join(folder, f))) : [];
  if (held.length && !existsSync(path.join(folder, MADE_BY_CREATE))) throw new Error(`${to} already holds files, and create did not make it: name a new or empty folder, so nothing is overwritten`);
  const film = await compileFilm({storyboard, recipe, timings: evenTimings(storyboard), root: cwd, ...(board.lang ? {lang: board.lang} : {})});
  mkdirSync(folder, {recursive: true});
  const write = (name, text) => writeOutput(path.join(folder, name), text);
  write(MADE_BY_CREATE, 'This folder was made by storyreel create, which may write here again.\n');
  write('story.json', `${JSON.stringify(input, null, 1)}\n`);
  write('storyboard.json', `${JSON.stringify(storyboard, null, 1)}\n`);
  write('recipe.json', `${JSON.stringify(recipe, null, 1)}\n`);
  if (!existsSync(path.join(folder, 'storyreel.config.mjs'))) write('storyreel.config.mjs', CONFIG);
  forgetVoice(path.join(folder, 'voice'));   // its timings were for the words before: narrate joins them again, for nothing where the words are the same
  return {folder, board, seconds: film.total, scenes: storyboard.scenes.length};
}

/** The storyboard as written: its file, or its JSON given in the call, as an assistant with no way to write a file gives it. */
function storyOf({from, story}, cwd) {
  if (Boolean(from) === Boolean(story)) throw new Error('give the storyboard one way: --from story.json, or --story with its JSON');
  if (from) return readJson(from, 'storyboard', cwd);
  if (Buffer.byteLength(story) > MOST_BYTES.storyboard) throw new Error(`the storyboard is too big: ${MOST_BYTES.storyboard} bytes is the most`);
  try { return JSON.parse(story); } catch (e) { throw new Error(`--story is not valid JSON: ${e.message}`); }
}

/** `storyreel create --from story.json --to my-film [--conversation chat.json]`, or `--story '{…}'`: as text. A refused board comes back as one short brief per piece at fault. */
export async function createTool(_, {from, story, to, conversation, cwd = process.cwd()} = {}) {
  if (!to) throw new Error('name the new folder: --to my-film, or --to . for this one');
  const input = storyOf({from, story}, cwd), messages = conversation ? readJson(conversation, 'conversation', cwd) : undefined;
  const made = await createFilm(to, input, {conversation: messages, cwd, inputs: [from, conversation].filter(Boolean)}).catch((refused) => { throw withFixBriefs(refused, input, messages); });
  const checked = made.board.verified ? 'its numbers were checked against the conversation' : 'its numbers were not checked: name a --conversation to check them';
  const where = path.resolve(cwd, to) === path.resolve(cwd) ? 'next' : `next, from ${to}`;
  return `✓ ${to} · ${made.board.shape} · ${made.scenes} scenes · ${made.seconds.toFixed(1)} s, silent\n  ${checked}\n  ${where}: storyreel timeline · storyreel review · storyreel part --scene found`;
}

/** `storyreel shapes`: the shapes there are, and how to fill each, as JSON a model can read. */
export const shapesTool = () => JSON.stringify(storyShapes());

/** `storyreel brief --shape what-we-found [--conversation chat.json]`: what a model needs to write one. */
export function briefTool(_, {shape, conversation, cwd = process.cwd()} = {}) {
  if (!shape) throw new Error(`name the shape: --shape ${storyShapes().map((s) => s.name).join(' or ')}`);
  const {instructions, material} = storyboardBrief(shape, conversation ? {conversation: readJson(conversation, 'conversation', cwd)} : {});
  return material ? `${instructions}\n\nThe conversation, as material:\n${material}` : instructions;
}
