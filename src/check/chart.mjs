// chart — a check as a footprintjs flowchart: wiring only (the stages are stages.mjs).
//
//   read the phrases → read the picture → what the edit redraws → beside the run before → verdict? → broken | fix | clean
import {flowChart} from 'footprintjs';
import {readAnchors, reviewFilm, readChanges, compare, decideVerdict, answer} from './stages.mjs';

export const CHECK_VERDICTS = Object.freeze(['broken', 'fix', 'clean']);
const QUIET = Object.freeze({info() {}, warn() {}, error() {}, log() {}, debug() {}});

/** The chart of one check. `run`: {does: {anchors, review, changes, before}}, and where the stages leave what the reply needs. */
export function checkChart(run) {
  let chart = flowChart('read the phrases', readAnchors(run), 'phrases', 'Every phrase the film is keyed to, checked in one pass; whether the film compiles')
    .addFunction('read the picture', reviewFilm(run), 'picture', 'The film read as text: its findings and its verdicts')
    .addFunction('what the edit redraws', readChanges(run), 'changes', 'The pieces of the picture the last edit changed')
    .addFunction('beside the run before', compare(run), 'since', 'The problems as one list, compared with the check before: fixed, new, the round')
    .addDeciderFunction('verdict', decideVerdict(run), 'verdict', 'broken, fix or clean, decided over what was read');
  for (const v of CHECK_VERDICTS) chart = chart.addFunctionBranch(v, v, answer(run, v));
  // (the engine's own lines of a stage that throws are not the reply's: the error says it once, and its run is kept)
  return chart.setDefault('clean').end().setLogger(QUIET).build();
}
