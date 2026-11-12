/**
 * The pick stage, once per window, and the decider that loops it over the windows. The window's words are read from the
 * source and go only into the brief; the points' words stay in the run's working memory. State gets counts and ids.
 */
import {choose} from '../engine.mjs';
import {askOrRefuse} from '../port/ask.mjs';
import {pickBrief, readPicks} from './pick.mjs';

export async function pick(scope, run) {
  const at = scope.windowAt, b = pickBrief(run.source.window(at));
  // an answer already taken for this window is the same stage, not a second ask
  const got = run.work.picks[at] ?? await askOrRefuse(scope, run, b, (answer) => readPicks(answer, b.ids));
  run.work.picks[at] = got;
  // one fact per pass, under one key: each pass's commit keeps its own, so the record grows by one pick a window, not by
  // the whole list again
  scope.pick = {window: at, messages: b.ids.length, points: got.value?.length ?? 0, ...(got.refused ? {refused: got.refused} : {})};
  scope.pickedPoints += got.value?.length ?? 0;
  if (got.refused) scope.refusedWindows += 1;
  scope.windowsLeft = scope.windowCount - at - 1;
}

export const MORE_RULES = Object.freeze([
  {when: {windowsLeft: {gt: 0}}, then: 'more-windows', label: 'Windows are left to pick from: the next one is picked'},
]);
export const MORE_FALLBACK = Object.freeze({branch: 'all-picked', label: 'Every window has been picked from'});

/** The decider after each pick. */
export const nextWindow = (scope) => choose(scope, MORE_RULES, MORE_FALLBACK);
/** The looping branch: on to the next window. */
export const advance = (scope) => { scope.windowAt += 1; };
