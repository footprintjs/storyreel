/** The choose-shape decider and its three branches. */
import {choose, stopRun} from '../engine.mjs';
import {askOrRefuse} from '../port/ask.mjs';
import {FITS, SHAPE_FALLBACK, SHAPE_RULES, readShape, shapeBrief, shapeFacts} from './fits.mjs';

/** What each shape needs, in words, from FITS: "what-we-found needs 1 checked, 1 found, 1 next". */
const NEEDS = Object.entries(FITS).map(([shape, least]) => `${shape} needs ${Object.entries(least).map(([part, n]) => `${n} ${part}`).join(', ')}`).join('; ');

/** Why a run stopped at the shape, by code: fixed words that name the fix. */
export const NO_SHAPE = Object.freeze({
  'asked-undrawable': 'the shape asked for is not one the drawer draws: ask for one it draws, or leave shape out',
  'none-fits': `the points do not fill the parts of any shape the drawer draws (${NEEDS}): run it on a conversation that holds a finding, or check what the model picked`,
  'model-refused': 'the model named no shape among those that fit, twice: ask for one with the shape option',
});

export function chooseShape(scope, run) {
  const facts = shapeFacts({asked: run.input.shape, drawable: run.input.drawable, points: scope.points});
  Object.assign(scope, facts);
  return choose(scope, SHAPE_RULES, SHAPE_FALLBACK);
}

/** One shape fits: it is the one. */
export const shapeFits = (scope) => { scope.shape = scope.fitting[0]; };

/** Two or more fit and none was asked for: the model chooses among them. */
export async function shapeAsked(scope, run) {
  const fitting = scope.fitting, got = await askOrRefuse(scope, run, shapeBrief(fitting, scope.points), (answer) => readShape(answer, fitting));
  if (got.refused) return stopAt(scope, 'model-refused');
  scope.shape = got.value;
}

function stopAt(scope, why) {
  scope.stopped = {at: 'choose-shape', why};
  stopRun(scope, NO_SHAPE[why]);
}

/** No shape: the run stops here, saying why. */
export const noShape = (scope) => stopAt(scope, scope.askedDrawable === false ? 'asked-undrawable' : 'none-fits');
