/**
 * Rule tables decided on a footprintjs chart, the evidence kept: a rule table is {key, noun, rules: [{when, then, label}],
 * fallback: {branch, label}} — each `when` a decide() filter over a candidate's measures. decideAll decides every
 * candidate of a list with one table (a subflow: batches, each a fan-out of one small run per candidate), and every
 * verdict is written beside its why (whyOf): the verdict, the rule that gave it, and every rule tried with its checks
 * ("jump 54.7 ≥ 12 ✓"). The one shape every spec that keeps its decisions writes (breakdown.mjs, remake.mjs).
 */
import {flowChart, decide} from 'footprintjs';

const SIGN = {gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', ne: '≠', in: 'in', notIn: 'not in'};
const TEST = {gt: (a, b) => a > b, gte: (a, b) => a >= b, lt: (a, b) => a < b, lte: (a, b) => a <= b};

/**
 * A measure as a check shows it: rounded to 3 decimals, or as many more (up to 6) as it takes to show why the check went
 * the way it did — the rule compared the exact value, and 1.4995 < 1.5 must not read "1.5 < 1.5 ✓".
 */
function shownAgainst(actual, op, threshold, result) {
  const v = Number(actual);
  if (!Number.isFinite(v) || !TEST[op] || typeof threshold !== 'number') return actual;
  for (let d = 3; d <= 6; d++) { const shown = +v.toFixed(d); if (TEST[op](shown, threshold) === result) return String(shown); }
  return String(v);
}

/**
 * A decision's evidence, short: the verdict, the rule that gave it (its label, as the rule table has it), and every rule
 * tried with its checks. `rules` and `fallback` are the table the decision was made with.
 */
export function whyOf(evidence, {rules, fallback}) {
  const won = evidence.rules.find(r => r.matched);
  return {verdict: evidence.chosen, because: won ? rules[won.ruleIndex].label : fallback.label,
    rules: evidence.rules.map(r => ({then: r.branch, met: r.matched,
      checks: (r.conditions ?? []).map(c => `${c.key} ${shownAgainst(c.actualSummary, c.op, c.threshold, c.result)} ${SIGN[c.op] ?? c.op} ${c.threshold} ${c.result ? '✓' : '✗'}`), ...(r.matchError ? {error: r.matchError} : {})}))};
}

/**
 * A decider for one decision: decide() over the scope with the table, the why written under `whyKey` (whyOf). `about`,
 * when given, names what is decided in every label of the record (about(s): "scene-05 enter torn") — the why keeps
 * the table's own labels.
 */
export const decideWith = (table, whyKey, about = null) => s => {
  const named = about ? (who => ({rules: table.rules.map(r => ({...r, label: `${who}: ${r.label}`})), fallback: {...table.fallback, label: `${who}: ${table.fallback.label}`}}))(about(s)) : table;
  const result = decide(s, named.rules, named.fallback);
  s[whyKey] = whyOf(result.evidence, table);
  return result;
};

/**
 * A decider on a chart for one rule table, and one branch per verdict, each writing it under `key` (two rules may give
 * one verdict); the why under `${key}Why`; `about` names what is decided in the record's labels (decideWith).
 */
export function addDecider(chart, {name, id, description, table, key, about = null}) {
  let list = chart.addDeciderFunction(name, decideWith(table, `${key}Why`, about), id, description);
  for (const verdict of new Set([...table.rules.map(r => r.then), table.fallback.branch])) list = list.addFunctionBranch(verdict, verdict, s => { s[key] = verdict; });
  return list.setDefault(table.fallback.branch).end();
}

/**
 * A decider on a chart: decide() over the scope's measures, each label carrying the candidate's name (its number and
 * time: "cut candidate 37 at 12.48 s: …"), so every line of the record says which candidate it decided; the evidence
 * written beside the verdict; one branch per verdict.
 */
function addDecision(chart, decision) {
  const {key, noun, rules, fallback} = decision, verdicts = [...rules.map(r => r.then), fallback.branch];
  let list = chart.addDeciderFunction(`decide ${key}`, s => {
    const name = `${noun} ${s.candidate} at ${s.at} s`;
    const result = decide(s, rules.map(r => ({...r, label: `${name}: ${r.label}`})), {...fallback, label: `${name}: ${fallback.label}`});
    s[`${key}Why`] = whyOf(result.evidence, decision);
    return result;
  }, `decide-${key}`, `Which rule the measures meet: ${verdicts.join(', ')}`);
  for (const verdict of verdicts) list = list.addFunctionBranch(verdict, verdict, s => { s[key] = verdict; });
  return list.setDefault(fallback.branch).end();
}

/** One candidate's chart: its number and time, and its measures, into the scope (top-level keys, as the rules read them); then its decision. */
function verdictChart(decision) {
  const chart = flowChart('measures', s => {
    const item = s.$getValue('item');
    s.candidate = item.n; s.at = item.at;
    for (const [k, v] of Object.entries(item.measures)) s[k] = v;
  }, 'measures', 'The candidate\'s number, time and measures, as the rules read them');
  return addDecision(chart, decision).build();
}

/** How many candidates are decided at once: each decision runs as a small run of its own, so a batch bounds the memory they hold together. */
const BATCH = 100;

/**
 * Every candidate decided, BATCH at a time: a subflow that takes the next batch of its `items` (each numbered in the whole
 * list), decides each in a fan-out (verdictChart: one subflow and one decision per candidate), appends the answers to
 * `decided`, and loops back while candidates are left (a decision of its own, on how many are left). Its record keeps
 * every decision with its evidence, as one fan-out over all of them would.
 */
export function decideAll(decision, what) {
  return flowChart('take a batch', s => {
    const from = s.taken ?? 0;
    s.batch = (s.$getValue('items') ?? []).slice(from, from + BATCH).map((x, j) => ({...x, n: from + j + 1}));
    s.taken = from + s.batch.length;
  }, 'take-batch', `The next ${BATCH} ${what}, numbered in the whole list`)
    .addParallelForEach('decide each', 'each', {items: s => s.batch, branch: () => verdictChart(decision), maxBranches: BATCH, into: 'answers', failFast: true}, `Each of the batch: ${[...decision.rules.map(r => r.then), decision.fallback.branch].join(', ')}`)
    .addFunction('keep the answers', s => { s.$update('decided', s.$getValue('answers')); s.left = s.total - s.taken; }, 'keep-answers', 'The batch\'s answers, after the ones before; how many are left')
    .addDeciderFunction('more', s => decide(s, [{when: {left: {gt: 0}}, then: 'next-batch', label: `${s.left} of the ${s.total} ${what} are left`}], {branch: 'all-decided', label: `all ${s.total} ${what} are decided`}), 'more', 'Whether candidates are left')
    .addFunctionBranch('next-batch', `decide the next ${BATCH}`, () => {}, undefined, {loopTo: 'take-batch'})
    .addFunctionBranch('all-decided', 'done', () => {})
    .setDefault('all-decided').end().build();
}

/** A mount of decideAll: the parent's list under `items` in, its answers out under `into` (in the list's order). */
export const decideMount = (items, into) => ({inputMapper: s => { const list = s[items] ?? []; return {items: list, total: list.length}; }, outputMapper: out => ({[into]: out.decided ?? []})});
/** The candidates as decided (a fan-out's results): each with its verdicts and their evidence. */
const decidedOf = (results, keys) => results.map(r => ({...r.item, ...Object.fromEntries(keys.flatMap(k => [[k, r[k]], [`${k}Why`, r[`${k}Why`]]]))}));
export const decided = (s, into, keys) => decidedOf(s.$getValue(into) ?? [], keys);
