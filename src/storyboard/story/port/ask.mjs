/**
 * How a stage asks: the brief goes to the run's driver, the answer is read by the stage's own check, and an answer it cannot
 * use is retried. On the last try the refusal is kept as an outcome instead ({refused: code}), so a run that cannot get a
 * usable answer says where and why, rather than failing with no board.
 */
import {attemptOf} from '../engine.mjs';
import {ASK_RETRY, askJson, isMalformed} from './port.mjs';

/** One ask per stage attempt, retried by the stage's policy: {value}, or {refused: code} on its last attempt. */
export async function askOrRefuse(scope, run, b, read) {
  try {
    return {value: read(await askJson(run.model, b))};
  } catch (error) {
    const {attempt, of} = attemptOf(scope);
    if (isMalformed(error) && attempt >= of) return {refused: error.code};
    throw error;
  }
}

/**
 * One ask with its own tries, for a stage that asks several times (the fix, once per piece): each ask gets the policy's
 * tries whatever the asks before it used. {value, tries} or {refused: code, tries}. A model that fails is never retried.
 */
export async function askWithTries(run, b, read, tries = ASK_RETRY.attempts) {
  for (let n = 1; ; n++) {
    try {
      return {value: read(await askJson(run.model, b)), tries: n};
    } catch (error) {
      if (!isMalformed(error)) throw error;
      if (n >= tries) return {refused: error.code, tries: n};
    }
  }
}
