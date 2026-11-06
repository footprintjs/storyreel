/**
 * What `create` says back when it refuses a board: every problem, grouped by the piece that holds it, each piece with what it
 * says now and the messages it cites. So a fix round resends a few hundred bytes, not the whole brief. Everything from the
 * board or the conversation stays one JSON line under its piece, and only code writes a piece's name.
 */
import {storyboardFixBriefs} from 'footprint-story/storyboard';

const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const LEFT_OUT = 'more left out, to keep this short: find them in your storyboard and your conversation';

const pieceText = ({piece, material, left}) => [piece, material, ...(left ? [`(${left} ${LEFT_OUT})`] : [])].join('\n');
const restLine = ({at, message}) => JSON.stringify({problem: `${at} ${message}`.trim()});

/**
 * The refusal to show for what `createFilm` threw: a new error with `problems` and `briefs`, its message the briefs. What is not
 * a board's refusal, or what no piece can fix (a shape a film cannot draw), comes back as it was.
 */
export function withFixBriefs(refused, input, conversation) {
  if (!Array.isArray(refused?.problems)) return refused;
  const {instructions, briefs, rest} = storyboardFixBriefs(input, refused.problems, {conversation});
  if (!briefs.length) return refused;
  const named = briefs.reduce((n, brief) => n + brief.problems.length, 0);
  const message = [
    `this storyboard has ${count(named, 'problem')}, in ${count(briefs.length, 'piece')}: fix each piece where it stands in your storyboard, change nothing else, and run create again.`,
    instructions,
    `The ${briefs.length === 1 ? 'piece' : 'pieces'}, as material:\n\n${briefs.map(pieceText).join('\n\n')}`,
    ...(rest.length ? [`Also:\n${rest.map(restLine).join('\n')}`] : []),
  ].join('\n\n');
  return Object.assign(new TypeError(message), {problems: refused.problems, briefs});
}
