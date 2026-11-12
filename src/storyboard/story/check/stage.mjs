/** The check stage and the judge: done, fix one piece at a time, or stop. */
import {choose} from '../engine.mjs';
import {checkBoard} from './check.mjs';

/** The most fix rounds by default. */
export const MOST_FIX = 3;

export function check(scope, run) {
  const {problems, fixBriefs, facts} = checkBoard(run.work.board, run.source.all());
  run.work.problems = problems;
  run.work.fixBriefs = fixBriefs;
  Object.assign(scope, facts);
  scope.fixesLeft = run.input.mostFix - scope.fixRound;
}

/** The judge's rules, first match: the order is the reasoning. */
export const JUDGE_RULES = Object.freeze([
  {when: {problemCount: {eq: 0}}, then: 'board-ok', label: 'The board reads against the whole conversation, and a film can draw it'},
  {when: {unpieced: {gt: 0}}, then: 'stop', label: 'A problem no single piece holds (the board\'s shape, or text that is not JSON): fixing a piece cannot help'},
  {when: {fixesLeft: {gt: 0}}, then: 'fix', label: 'Some pieces have problems and fix rounds are left: each piece at fault goes back on its own'},
]);
export const JUDGE_FALLBACK = Object.freeze({branch: 'stop', label: 'The fix rounds are used up: the run stops with the problems on the record, and no board'});

export const judge = (scope) => choose(scope, JUDGE_RULES, JUDGE_FALLBACK);
