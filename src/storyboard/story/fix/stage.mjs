/**
 * The fix branch: one round, one brief per piece at fault. A piece answered this round is kept, so a retry of the stage asks
 * only the pieces still to answer. On the last attempt a piece with no usable answer is left as it was, and the whole board
 * goes back to the check.
 */
import {askOrRefuse} from '../port/ask.mjs';
import {applyPiece, fixBrief} from './fix.mjs';

export async function fix(scope, run) {
  const round = scope.fixRound + 1, {instructions, briefs} = run.work.fixBriefs;
  const start = (run.work.roundStart[round] ??= run.work.board), answers = (run.work.rounds[round] ??= new Map());
  for (const piece of briefs) {
    if (!answers.has(piece.piece)) answers.set(piece.piece, await askOrRefuse(scope, run, fixBrief(instructions, piece), (answer) => (applyPiece(start, piece, answer), answer)));
  }
  run.work.board = briefs.reduce((board, piece) => { const got = answers.get(piece.piece); return got.refused ? board : applyPiece(board, piece, got.value); }, start);
  run.work.fixed.push(...briefs.filter((piece) => !answers.get(piece.piece).refused).map((piece) => piece.piece));
  scope.fixRound = round;
  scope.fixes = [...scope.fixes, ...briefs.map(({piece, problems}) => {
    const got = answers.get(piece);
    return {round, piece, problems: problems.length, ...(got.refused ? {refused: got.refused} : {answered: true})};
  })];
}
