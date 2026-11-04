/**
 * The project's run log: one door to how every result was made. Each feature that runs on a footprintjs flowchart keeps
 * its record (every stage, what it wrote, every decide() with the rule that matched and the values it read), and saves
 * it in the project's out folder, beside the renders and their cache: `<out>/.storyreel/runs/<time>-<feature>.json`.
 * `storyreel log` lists them newest first and prints one run, short by default, so a person or an agent walks a result
 * back through the record instead of re-running it or looking at pictures. The render's own making-of.json in that
 * folder is listed beside them.
 *
 *   saveRun(out, {feature, summary, record, verdicts?})   → the file written (the oldest beyond RUNS_KEPT dropped)
 *   listRuns(out)                                         → [{n, feature, at, summary, entries, verdicts, file}] newest first
 *   logText(out, {run?, only?, check?, all?})             → the list, or one run as text
 *
 * One run reads four ways (`only`):
 *   (default)   each stage once: what it wrote, what it decided and the values the decision read
 *   decisions   only the decisions (decide() and select()), each with what it read
 *   errors      only the errors
 *   steps       every entry as the record says it
 * and `check` prints one verdict's evidence in full: everything its check measured (each faint word, each broken part).
 *
 * A record keeps each entry's words (text), its kind and its stage; never a value it carried (rawValue: a live object,
 * possibly large, possibly private), so a saved run holds what the record SAYS, as the narrative says it. A verdict's
 * evidence is the check's own measured values, kept as data.
 */
import {readdirSync, readFileSync, statSync, existsSync, lstatSync, rmSync} from 'node:fs';
import path from 'node:path';
import {outputFolder, writeOutput} from './files.mjs';

/** Where the runs live, inside the out folder. */
export const RUNS = Object.freeze(['.storyreel', 'runs']);
/** How many runs a project keeps: saving one more drops the oldest. */
export const RUNS_KEPT = 100;
/** How many lines one run prints by default (all: every one). */
export const LOG_LINES = 40;
/** How long one line of a stage's writes or a decision's reads runs before it is cut (… marks the cut). */
export const LINE_CHARS = 200;
/** The ways to read one run (`only`), the default first. */
export const VIEWS = Object.freeze(['stages', 'decisions', 'errors', 'steps']);
const RUN_FILE = /^\d{4}-\d\d-\d\dT[\d-]+Z-[a-z][a-z-]*\.json$/;

/** A record's entries as words: {type, text, depth, stage} each, nothing it carried. */
export const plainEntries = record => (record ?? []).map(e => ({type: e.type, text: String(e.text ?? ''), depth: e.depth ?? 0, stage: e.stageName ?? e.stageId ?? null}));

/** Verdicts as the run keeps them: {check, label, verdict, why, measured, summary?} each, the measured values as data. */
const plainVerdicts = verdicts => (verdicts ?? []).map(v => ({check: v.check, label: v.label, verdict: v.verdict, why: v.why ?? '', measured: v.measured ?? {}, ...(v.summary ? {summary: v.summary} : {})}));

/** Save one run of a feature into the out folder's runs: {feature, summary, record, verdicts?}. Returns the file written. */
export function saveRun(out, {feature, summary = '', record = [], verdicts = null, at = new Date()}) {
  if (!/^[a-z][a-z-]{0,30}$/.test(feature)) throw new Error(`saveRun: feature is a short lowercase name (review, render, breakdown), not ${JSON.stringify(feature)}`);
  const dir = outputFolder(out, RUNS), stamp = at.toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${stamp}-${feature}.json`);
  writeOutput(file, JSON.stringify({feature, at: at.toISOString(), summary: String(summary), entries: plainEntries(record), ...(verdicts ? {verdicts: plainVerdicts(verdicts)} : {})}, null, 1));
  dropOldRuns(dir);
  return file;
}

/** Keep the newest RUNS_KEPT runs: the older ones (plain files named as a run, nothing else in the folder) go. */
function dropOldRuns(dir) {
  const runs = readdirSync(dir).filter(n => RUN_FILE.test(n) && lstatSync(path.join(dir, n)).isFile()).sort();
  for (const name of runs.slice(0, Math.max(0, runs.length - RUNS_KEPT))) rmSync(path.join(dir, name), {force: true});
}

/** A render's making-of.json, as a run: its compile record when it kept one. */
function renderRun(file) {
  const made = JSON.parse(readFileSync(file, 'utf8')), compile = made.compile ?? {};
  const entries = Array.isArray(compile.narrative) ? compile.narrative.map(text => ({type: /^\[Condition\]/.test(text) ? 'condition' : 'stage', text, depth: 0, stage: null})) : [];
  return {feature: 'render', at: statSync(file).mtime.toISOString(), summary: made.video?.line ?? made.out ?? 'a render', entries, file};
}

/** The runs in the out folder, newest first, numbered from 1: the saved ones and the render's making-of.json. */
export function listRuns(out) {
  const dir = path.join(out, ...RUNS), runs = [];
  if (existsSync(dir)) for (const name of readdirSync(dir).filter(n => RUN_FILE.test(n))) {
    try { const r = JSON.parse(readFileSync(path.join(dir, name), 'utf8')); runs.push({...r, entries: r.entries ?? [], file: path.join(dir, name)}); } catch { runs.unread = (runs.unread ?? 0) + 1; }
  }
  for (const made of [path.join(out, 'making-of.json'), path.join(out, 'making-of.failed.json')].filter(f => existsSync(f))) {
    try { runs.push(renderRun(made)); } catch { runs.unread = (runs.unread ?? 0) + 1; }
  }
  const listed = runs.sort((a, b) => b.at.localeCompare(a.at)).map((r, i) => ({n: i + 1, ...r}));
  listed.unread = runs.unread ?? 0;
  return listed;
}

const when = iso => iso.replace('T', ' ').slice(0, 19);
const said = r => (r.summary ? ` · ${r.summary.split('\n')[0]}` : '');
const cut = (text, most = LINE_CHARS) => (text.length > most ? `${text.slice(0, most - 1)}…` : text);
/** A step entry read: "Step 4: Write stillShare = 0.096" → {verb: 'Write', key: 'stillShare', value: '0.096'}. */
const STEP = /^Step \d+: (Read|Write|Update|Delete) (\S+)(?: = (.*))?$/;
const stepOf = text => { const m = STEP.exec(text); return m ? {verb: m[1], key: m[2], value: m[3] ?? ''} : null; };
const pairs = steps => steps.map(s => (s.value === '' ? s.key : `${s.key} ${s.value}`)).join(', ');
const decisionText = text => text.replace(/^\[(Condition|Selected)\]:\s*/, '');

/**
 * A selector's sentence, said once: footprintjs names each picked path with the values its when() read, and a selector
 * whose rules all read the same thing says it once per path. Kept: each path and its label; the values read, once.
 */
export function compactSelected(text) {
  const said = decisionText(text), read = new Set();
  let kept = '', i = 0;
  while (i < said.length) {
    const open = said.indexOf(' (', i);
    if (open < 0 || !/^\w+=/.test(said.slice(open + 2))) { kept += said.slice(i, open < 0 ? said.length : open + 2); i = open < 0 ? said.length : open + 2; continue; }
    let depth = 0, close = open + 1;  // the group's own closing parenthesis: a value summary may hold one, "(12 keys)"
    for (; close < said.length; close++) { if (said[close] === '(' || said[close] === '{' || said[close] === '[') depth++; else if (said[close] === ')' || said[close] === '}' || said[close] === ']') { depth--; if (depth === 0) break; } }
    const inputs = said.slice(open + 2, close);
    for (const one of splitTop(inputs)) read.add(one);
    kept += said.slice(i, open); i = close + 1;
  }
  return `${kept}${read.size ? ` · read ${[...read].join(', ')}` : ''}`;
}

/** Split "a=1, b={x, y}" at its top-level commas only. */
function splitTop(text) {
  const parts = [];
  let depth = 0, from = 0;
  for (let k = 0; k < text.length; k++) {
    const c = text[k];
    if ('({['.includes(c)) depth++; else if (')}]'.includes(c)) depth--;
    else if (c === ',' && depth === 0) { parts.push(text.slice(from, k).trim()); from = k + 1; }
  }
  parts.push(text.slice(from).trim());
  return parts.filter(Boolean);
}

/** The record cut into stages: consecutive entries of one stage, in order (a subflow's enter and exit lines dropped). */
function stagesOf(entries) {
  const stages = [];
  for (const e of entries) {
    if (e.type === 'subflow') continue;
    const last = stages.at(-1);
    if (last && last.stage === e.stage && e.type !== 'stage') last.entries.push(e);
    else stages.push({stage: e.stage ?? '(run)', entries: [e]});
  }
  return stages;
}

/** One stage as lines: its name, what it wrote, each decision with what it read; an error as said. */
function stageLines({stage, entries}, {decisionsOnly = false} = {}) {
  const steps = entries.map(e => (e.type === 'step' ? stepOf(e.text) : null)).filter(Boolean);
  const reads = steps.filter(s => s.verb === 'Read'), writes = steps.filter(s => s.verb !== 'Read');
  const lines = [];
  for (const e of entries) {
    if (e.type === 'condition') lines.push(`  decided: ${decisionText(e.text)}${reads.length ? cut(` · read ${pairs(reads)}`) : ''}`);
    else if (e.type === 'selector') lines.push(`  picked: ${cut(compactSelected(e.text), LINE_CHARS * 2)}`);
    else if (e.type === 'fork' && !decisionsOnly) lines.push(`  ${decisionText(e.text).replace(/^\[Parallel\]:\s*/, '')}`);
    else if (e.type === 'error' && !decisionsOnly) lines.push(`  error: ${e.text}`);
  }
  if (decisionsOnly) return lines.length ? [stage, ...lines] : [];
  if (writes.length) lines.unshift(cut(`  wrote ${pairs(writes)}`));
  return lines.length === 1 ? [cut(`${stage} · ${lines[0].trim()}`, LINE_CHARS + stage.length)] : [stage, ...lines];
}

/** One run's lines for a view (VIEWS). */
function runLines(r, only) {
  if (only === 'steps') return r.entries.map(e => `${'  '.repeat(Math.min(e.depth, 4))}${e.text}`);
  if (only === 'errors') return r.entries.filter(e => e.type === 'error').map(e => `${e.stage ? `${e.stage}: ` : ''}${e.text}`);
  return stagesOf(r.entries).flatMap(s => stageLines(s, {decisionsOnly: only === 'decisions'}));
}

/** One verdict's evidence in full: its answer and why, then each measured value (a list one item a line). */
function checkText(r, check) {
  const v = (r.verdicts ?? []).find(x => x.check === check);
  if (!v) throw new Error(`run ${r.n} has no verdict "${check}"${r.verdicts?.length ? `: its verdicts are ${r.verdicts.map(x => x.check).join(', ')}` : ' (only a review keeps verdicts)'}`);
  const value = x => JSON.stringify(x);
  const lines = Object.entries(v.measured).flatMap(([k, x]) => (Array.isArray(x) && x.length && typeof x[0] === 'object'
    ? [`${k}: ${x.length}`, ...x.map(item => `  ${value(item)}`)]
    : [`${k}: ${value(x)}`]));
  return [`${v.label} · ${v.verdict}: ${v.why}${v.summary ? ` (${v.summary})` : ''}`, ...(lines.length ? lines : ['nothing measured'])].join('\n');
}

/**
 * The log as text: without `run`, the list (newest first, one line each: number, time, feature, summary, how many
 * decisions); with `run` (its number), that run in one of VIEWS (`only`, the stages by default), at most LOG_LINES lines
 * unless `all`, the rest counted with the call that shows them; with `check` too, that verdict's evidence in full.
 */
export function logText(out, {run = null, only = null, check = null, all = false} = {}) {
  const runs = listRuns(out), unread = runs.unread ? `\n(${runs.unread} run file${runs.unread === 1 ? '' : 's'} could not be read and ${runs.unread === 1 ? 'is' : 'are'} not listed)` : '';
  if (!runs.length) return `no runs yet in ${path.join(out, ...RUNS)}: a review saves one (storyreel review), a render writes making-of.json${unread}`;
  const decisions = r => r.entries.filter(e => e.type === 'condition' || e.type === 'selector').length;
  if (run === null) {
    if (check !== null || only !== null) throw new Error(`--${check !== null ? 'check' : 'only'} reads one run: give its number (--run 1)`);
    return runs.map(r => `${r.n}. ${when(r.at)} ${r.feature}${said(r)}${decisions(r) ? ` · ${decisions(r)} decisions` : ''}`).join('\n')
      + `\nstoryreel log --run <n> shows one (--only ${VIEWS.slice(1).join(' | ')}, --check <verdict>, --all)${unread}`;
  }
  const r = runs.find(x => x.n === Number(run));
  if (!r) throw new Error(`there is no run ${run}: the runs are 1–${runs.length} (storyreel log lists them)`);
  if (check !== null) return checkText(r, String(check));
  const view = only ?? VIEWS[0];
  if (!VIEWS.includes(view)) throw new Error(`--only is ${VIEWS.slice(1).join(', ')} (or nothing, for the stages), not ${JSON.stringify(only)}`);
  const shown = runLines(r, view), lines = all ? shown : shown.slice(0, LOG_LINES);
  const head = `${r.n}. ${when(r.at)} ${r.feature}${said(r)}`;
  const evidence = r.verdicts?.length ? `\nevidence: storyreel log --run ${r.n} --check ${r.verdicts.map(v => v.check).join('|')}` : '';
  const more = shown.length > lines.length ? `\n… ${shown.length - lines.length} more: storyreel log --run ${r.n}${only ? ` --only ${only}` : ''} --all` : '';
  return `${head}\n${lines.join('\n') || `(no ${view} in this run)`}${more}${evidence}`;
}
