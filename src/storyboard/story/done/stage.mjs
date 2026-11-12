/** The two ends of the judge: done with a board and a standing per scene, or stopped with the problems on the record. */
import {readStoryboard} from 'footprint-story/storyboard';
import {stopRun} from '../engine.mjs';
import {standingOf} from './standing.mjs';

export function done(scope, run) {
  const board = readStoryboard(run.work.board, {conversation: run.source.all()});
  const refused = run.work.picks.flatMap((got, window) => (got?.refused ? [window] : []));
  const {standing, ask} = standingOf(board, scope.points, run.work.fixed, refused, run.source.ordinalOf);
  run.work.result = board;
  scope.standing = standing;
  scope.ask = ask;
}

/** Why a run stopped at the judge, by code: fixed words that name the fix. */
export const STOPPED = Object.freeze({
  'fixes-used-up': 'the board still has problems after the last fix round: they are on the result; fix those pieces, or give more rounds with mostFix',
  unpieced: 'the board has a problem no single piece holds (its shape, or text that is not JSON): run again',
});

export function stop(scope) {
  const why = scope.unpieced > 0 ? 'unpieced' : 'fixes-used-up';
  scope.stopped = {at: 'judge', why};
  stopRun(scope, STOPPED[why]);
}
