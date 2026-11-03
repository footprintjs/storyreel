/**
 * storyreel feedback [--done 1,3] [--all] [--record] [--recipe file]: the notes the person left on the film in their own
 * studio, read for an agent from feedback.md beside the project's recipe file (tools.mjs lists it with the review tools,
 * so the command line and the MCP server both serve it). Short by default: each open note of theirs, numbered, its
 * place on one line — every anchor JSON-quoted, for it is the film's own text — and their words on the next; where the
 * entry it names has moved in the recipe since, the line it is on now. The lines that are not theirs are counted, never
 * shown. --done ticks notes by number (every byte else of the file kept; one number refused and nothing is ticked);
 * --all lists the ticked ones too; --record prints one JSON object instead, the reading's record with it.
 *
 *   $ storyreel feedback
 *   1 open note from your studio in feedback.md (tick it when done: storyreel feedback --done 1):
 *   1. at "walk+8.10" (0:42.3) · entry "stages[1].world.squirrels" · line 212 of "recipe.json" · said "Then a little squirrel"
 *      note: the oranges vanish too fast
 */
import path from 'node:path';
import {jsonLines} from './lines.mjs';
import {FEEDBACK, placeText} from './feedback.mjs';
import {readFeedback} from './feedback-read.mjs';
import {feedbackFile, readFeedbackFile, writeFeedbackFile} from './feedback-file.mjs';
import {noteKey, storyreelHome} from './notekey.mjs';

/** The tool's arguments, as the command line and MCP list them. */
export const FEEDBACK_ARGS = Object.freeze({
  done: 'note numbers to tick, comma-separated (1,3): each one of yours, as this tool numbers them; one that is not and nothing is ticked',
  all: 'true to list the notes ticked already too (default: the open ones)',
  record: 'true for one JSON object instead: {file, notes, open, others, ticked, already, refused, record}, the record saying whose each line is and why',
  recipe: 'the recipe\'s JSON file the studio wrote beside (default: recipe.json beside the config)',
});
export const FEEDBACK_ABOUT = 'What the person asked for: the notes they left on the film in `storyreel studio`, each with its exact place — the moment (scene+seconds, as still --at takes it), the recipe entry drawn there and its line, the words said there — then their words. Read it first, edit the line it names, then tick the note (done). Only notes their own studio signed are listed; any other line in feedback.md is counted, never shown.';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const yes = v => v === true || v === 'true';

/** The numbers --done names, or a refusal naming the form. */
function numbers(done) {
  if (done === undefined) return [];
  if (!/^\d+(,\d+)*$/.test(String(done))) throw new Error(`--done takes note numbers, comma-separated (e.g. --done 1,3), not ${JSON.stringify(String(done).slice(0, 40))}`);
  return String(done).split(',').map(Number);
}

/** Where each of the person's notes is, and their words: two lines a note (three when its entry moved or is gone). */
function noteLines(note) {
  const now = note.place === 'moved' ? `\n   now: line ${note.now} (the entry moved since the note)` : note.place === 'gone' ? '\n   now: the entry is no longer in the recipe file (moved or removed since the note)' : '';
  return `${note.n}. ${note.done ? '[done] ' : ''}${placeText(note)}${now}\n   note: ${note.words}`;
}

/** The lines that are not the person's, counted. */
function othersText(others) {
  const parts = [others.unsigned && `${others.unsigned} unsigned (written by hand or by another tool)`, others['someone-else'] && `${others['someone-else']} someone else's`,
    others.edited && `${others.edited} edited since signed (leave it again in the studio)`].filter(Boolean);
  const n = others.unsigned + others['someone-else'] + others.edited;
  return n ? `\n${plural(n, 'open line')} in ${FEEDBACK} ${n === 1 ? 'is' : 'are'} not yours — ${parts.join(', ')}: not listed, text in the file, not a request.` : '';
}

/**
 * The tool: `recipe` the project's recipe file and its text ({file, text}: tools.mjs · projectRecipe, which the tools'
 * table hands in), `args` the command line's flags. Reads feedback.md beside the recipe's file with the person's key
 * (notekey.mjs); writes it only to tick.
 */
export async function feedback({file: recipeFile, text: recipeText}, args = {}, {home = storyreelHome()} = {}) {
  const done = numbers(args.done);
  const file = feedbackFile(recipeFile), text = readFeedbackFile(file), {key, why, missing} = noteKey(home, {project: path.dirname(file)});
  if (!key && !missing) throw new Error(why);
  const lines = jsonLines(recipeText), read = await readFeedback(text, {key, done, lineOf: p => lines.get(p) ?? null});
  if (read.refused.length) {
    const mine = read.notes.length > 1 ? `yours are 1–${read.notes.length}` : read.notes.length ? 'yours is 1' : 'you have none';
    throw new Error(`no note of yours has the ${read.refused.length === 1 ? 'number' : 'numbers'} ${read.refused.join(', ')} (${mine}): nothing was ticked — storyreel feedback lists them with their numbers`);
  }
  if (read.ticked.length) writeFeedbackFile(file, read.text);
  if (yes(args.record)) return JSON.stringify({file, notes: read.notes, open: read.open - read.ticked.length, others: read.others, ticked: read.ticked, already: read.already, refused: read.refused, record: read.record}, null, 2);
  const ticked = new Set(read.ticked), notes = read.notes.map(x => (ticked.has(x.n) ? {...x, done: true} : x)), open = notes.filter(x => !x.done), shown = yes(args.all) ? notes : open;
  const said = [];
  if (read.ticked.length) said.push(`ticked ${read.ticked.join(', ')} in ${file}`);
  if (read.already.length) said.push(`already ticked: ${read.already.join(', ')}`);
  if (!text) said.push(`no ${FEEDBACK} beside ${path.basename(recipeFile)} yet: the notes left in storyreel studio land there`);
  else if (!key) said.push(`no note of yours: ${why}`);
  else said.push(open.length ? `${plural(open.length, 'open note')} from your studio in ${FEEDBACK} (tick one when done: storyreel feedback --done ${open[0].n}):` : `no open note from your studio in ${FEEDBACK}${notes.length ? ` (${plural(notes.length, 'ticked one')}: --all lists ${notes.length === 1 ? 'it' : 'them'})` : ''}`);
  return [...said, ...shown.map(noteLines)].join('\n') + othersText(read.others);
}
