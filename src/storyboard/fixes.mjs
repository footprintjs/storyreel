/**
 * What `create` says back when it refuses a board: every problem, grouped by the piece that holds it, each piece with what it
 * says now and the messages it cites. It is longer than a bare list of problems: what it spares is rewriting a board kept in a
 * file, as only the pieces at fault need changing. Create takes no piece on its own, so this says what form to answer in, and a
 * board given as text is given whole again. Everything from the board or the conversation stays one data line under its piece,
 * and only code writes a piece's name.
 */
import {dataLine, storyboardFixBriefs} from 'footprint-story/storyboard';

const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const LEFT_OUT = 'more left out, to keep this short: find them in your storyboard and your conversation';
const IN_A_FILE = 'Fix each piece where it stands in your storyboard file, change nothing else, and run create again.';
const AS_TEXT = 'Fix each piece, then give create the whole storyboard again with those pieces changed: it takes no piece on its own.';

const pieceText = ({piece, material, left}) => [piece, material, ...(left ? [`(${left} ${LEFT_OUT})`] : [])].join('\n');
const restLine = ({at, message}) => dataLine({problem: `${at} ${message}`.trim()});

/**
 * The refusal to show for what `createFilm` threw: a new error with `problems` and `briefs`, its message the briefs. What is not
 * a board's refusal, or what no piece can fix (a shape a film cannot draw), comes back as it was. `file`: whether the board came
 * from a file, which says what form the answer takes.
 */
export function withFixBriefs(refused, input, conversation, {file = false} = {}) {
  if (!Array.isArray(refused?.problems)) return refused;
  const {instructions, briefs, rest} = storyboardFixBriefs(input, refused.problems, {conversation});
  if (!briefs.length) return refused;
  const named = briefs.reduce((n, brief) => n + brief.problems.length, 0);
  const message = [
    `this storyboard has ${rest.length ? 'at least ' : ''}${count(named, 'problem')}, in ${count(briefs.length, 'piece')}. ${file ? IN_A_FILE : AS_TEXT}`,
    instructions,
    `The ${briefs.length === 1 ? 'piece' : 'pieces'}, as material:\n\n${briefs.map(pieceText).join('\n\n')}`,
    ...(rest.length ? [`Also:\n${rest.map(restLine).join('\n')}`] : []),
  ].join('\n\n');
  return Object.assign(new TypeError(message), {problems: refused.problems, briefs});
}
