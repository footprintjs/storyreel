/**
 * A verdict: what a check answers — passed, failed, or not run — decided with footprintjs's decide(), so the record of
 * the run that asked keeps WHY: the rule that matched, the measured values it read and the thresholds it compared them
 * with ("It evaluated Rule 2 "most of the time is still": stillShare 0.72 gt 0.5 ✓, and chose failed").
 *
 * A check that could not run is never a pass: it says 'not run', and why. A verdict's rules are data —
 *
 *   {rules: [{when: {stillShare: {gt: .5}}, then: 'failed', label: 'most of the running time is still'}],
 *    passed: 'the shots move for most of their running time'}
 *
 * — each `when` a decide() filter over the numbers the check measured (or a function of the scope), `then` a verdict,
 * `label` what the rule means; `passed` says what passing means (the verdict no rule chose). Pure measurement stays in
 * plain functions (slideshow.mjs, geometry.mjs, claims.mjs); this is where it becomes an answer.
 */
import {flowChart, decide} from 'footprintjs';

export const VERDICTS = Object.freeze(['passed', 'failed', 'not run']);
/** A verdict as a stage id (an id has no space). */
const branchOf = verdict => verdict.replace(' ', '-');

/** A verdict's rules, checked: refuses anything else, naming the fix. Returns them as given. */
export function readVerdict(spec, where = 'verdict') {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error(`${where} must be {rules: [{when, then, label}], passed: 'what passing means'}`);
  if (!Array.isArray(spec.rules)) throw new Error(`${where}.rules must be a list of {when, then, label}`);
  if (typeof spec.passed !== 'string' || !spec.passed.trim()) throw new Error(`${where}.passed says what passing means, in words`);
  spec.rules.forEach((r, i) => {
    if (!r || typeof r !== 'object' || (typeof r.when !== 'function' && (!r.when || typeof r.when !== 'object'))) throw new Error(`${where}.rules[${i}].when is a decide() filter over the measured numbers ({stillShare: {gt: 0.5}}) or a function of the scope`);
    if (!VERDICTS.includes(r.then)) throw new Error(`${where}.rules[${i}].then is ${VERDICTS.map(v => `'${v}'`).join(', ')}, not ${JSON.stringify(r.then)}`);
    if (typeof r.label !== 'string' || !r.label.trim()) throw new Error(`${where}.rules[${i}].label says what the rule means, in words`);
  });
  return spec;
}

/**
 * The verdict as stages of a footprintjs flowchart: `measure` (a stage function that puts what it measured on the scope
 * and, once it has, sets `measured: true`), then a decider that decides over those values with decide(), then one branch
 * per verdict, which writes `verdict` (and calls `on[verdict](scope)` when given: a refusal, say). The decider writes
 * `why`: the matched rule's label, or what passing means. Nothing measured is 'not run', never a pass: that rule comes
 * first. Returns the built chart (mount it as a subflow).
 */
export function verdictChart({name, id, measure, verdict, description = '', on = {}}) {
  readVerdict(verdict, `${id}: verdict`);
  const rules = [{when: {measured: {ne: true}}, then: 'not run', label: 'nothing was measured'}, ...verdict.rules]
    .map(r => ({when: r.when, then: branchOf(r.then), label: r.label}));
  const decider = s => {
    const d = decide(s, rules, {branch: 'passed', label: verdict.passed});
    s.why = d.evidence.rules.find(r => r.matched)?.label ?? d.evidence.defaultLabel;
    return d;
  };
  const answer = v => s => { s.verdict = v; on[v]?.(s); };
  let chart = flowChart(name, measure, id, description)
    .addDeciderFunction(`${name}: verdict`, decider, 'verdict', 'The verdict, decided over what was measured');
  for (const v of VERDICTS) chart = chart.addFunctionBranch(branchOf(v), v, answer(v));
  return chart.setDefault('passed').end().build();
}

/** The verdicts as lines: "No slideshow · failed: most of the running time inside the shots is still (72 % of 41.3 s)". */
export const verdictsText = verdicts => verdicts.map(v => `${v.label ?? v.check} · ${v.verdict}: ${v.why}${v.summary ? ` (${v.summary})` : ''}`).join('\n');
