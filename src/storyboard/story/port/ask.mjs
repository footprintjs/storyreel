/**
 * How a stage asks: the brief goes to the run's driver, the answer is read by the stage's own check, and an answer it cannot
 * use is thrown for the stage's retry policy to ask again. On the last attempt the refusal is kept as an outcome instead
 * ({refused: code}), so a run that cannot get a usable answer says where and why, rather than failing with no board.
 */
import {attemptOf} from '../engine.mjs';
import {askJson, isMalformed} from './port.mjs';

/** {value} as `read` gives it from the answer, or {refused: code} on the last attempt. `read` throws MalformedAnswer. */
export async function askOrRefuse(scope, run, b, read) {
  try {
    return {value: read(await askJson(run.model, b, {stage: b.stage, scope}, (error) => { run.work.modelError = error; }))};
  } catch (error) {
    const {attempt, of} = attemptOf(scope);
    if (isMalformed(error) && attempt >= of) return {refused: error.code};
    throw error;
  }
}
