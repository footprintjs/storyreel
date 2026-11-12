/**
 * The fix branch: one round, one brief per piece at fault. Each piece gets the retry policy's tries of its own (counted per
 * piece, not per stage attempt, so a later piece is not left one try by an earlier one). A piece with no usable answer is
 * left as it was, and the whole board goes back to the check.
 */
import {askWithTries} from '../port/ask.mjs';
import {applyPiece, fixBrief} from './fix.mjs';

export async function fix(scope, run) {
  const round = scope.fixRound + 1, {instructions, briefs} = run.work.fixBriefs;
  const start = (run.work.roundStart[round] ??= run.work.board), answers = (run.work.rounds[round] ??= new Map());
  for (const piece of briefs) {
    // a piece already answered this round is the same stage, not a second ask
    if (!answers.has(piece.piece)) answers.set(piece.piece, await askWithTries(run, fixBrief(instructions, piece), (answer) => (applyPiece(start, piece, answer), answer)));
  }
  run.work.board = briefs.reduce((board, piece) => { const got = answers.get(piece.piece); return got.refused ? board : applyPiece(board, piece, got.value); }, start);
  run.work.fixed.push(...briefs.filter((piece) => !answers.get(piece.piece).refused).map((piece) => piece.piece));
  scope.fixRound = round;
  scope.fixes = [...scope.fixes, ...briefs.map(({piece, problems}) => {
    const got = answers.get(piece);
    return {round, piece, problems: problems.length, tries: got.tries, ...(got.refused ? {refused: got.refused} : {answered: true})};
  })];
}
