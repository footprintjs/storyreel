/**
 * The check: the existing readers, unchanged. footprint-story's storyboardProblems reads the board against the whole
 * conversation; once it reads, a film's own reader (filmFromBoard) adds what a film cannot show. The problems are grouped
 * into pieces by storyboardFixBriefs, so each piece at fault can be sent back on its own. Code only.
 */
import {readStoryboard, storyboardFixBriefs, storyboardProblems} from 'footprint-story/storyboard';
import {FILM_SHAPES, filmFromBoard} from '../../film.mjs';

/** Every problem of the board: the storyboard's own, then, once it reads, the film's. */
export function problemsOf(board, conversation) {
  const problems = storyboardProblems(board, {conversation});
  if (problems.length) return problems;
  const read = readStoryboard(board, {conversation});
  if (!FILM_SHAPES.includes(read.shape)) return [];
  try { filmFromBoard(read); return []; } catch (error) {
    if (Array.isArray(error?.problems)) return error.problems;
    throw error;
  }
}

/** The note the reader adds when it lists only the first problems: not a problem of its own. */
const isMoreNote = (problem) => problem.at === '';

/**
 * {problems, fixBriefs, facts}: the problems, one fix brief per piece at fault, and what state may hold of them: counts and
 * the pieces' names (code writes those names, never the board).
 */
export function checkBoard(board, conversation) {
  const problems = problemsOf(board, conversation), fixBriefs = storyboardFixBriefs(board, problems, {conversation});
  const facts = {
    problemCount: problems.length,
    unpieced: fixBriefs.rest.filter((p) => !isMoreNote(p)).length,
    pieces: fixBriefs.briefs.map((b) => ({piece: b.piece, problems: b.problems.length})),
  };
  return {problems, fixBriefs, facts};
}
