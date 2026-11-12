/** The merge stage: the windows' points as one list; their words stay in working memory, their facts go to state. */
import {mergePoints, pointFacts} from './merge.mjs';

export function merge(scope, run) {
  const picked = run.work.picks.map((got) => got?.value ?? []);
  const {points, dropped, conflicts} = mergePoints(picked);
  run.work.points = points;
  scope.points = points.map(pointFacts);
  scope.pointCount = points.length;
  scope.merged = {dropped, conflicts, refusedWindows: run.work.picks.filter((got) => got?.refused).length};
}
