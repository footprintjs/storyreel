/**
 * The project's run log: one door to how every result was made. Each feature that runs on a footprintjs flowchart keeps
 * its record (every stage, what it wrote, every decide() with the rule that matched and the values it read), and saves
 * it in the project's out folder, beside the renders and their cache: `<out>/.storyreel/runs/<time>-<feature>.<6 hex>.json`
 * (its id: the name without .json — a run's number moves when another is saved, its id never).
 * `storyreel log` lists them newest first and prints one run, short by default, so a person or an agent walks a result
 * back through the record instead of re-running it or looking at pictures. The render's own making-of.json in that
 * folder is listed beside them.
 *
 *   saveRun(out, {feature, summary, record, verdicts?})   → the file written (the oldest beyond RUNS_KEPT dropped)
 *   listRuns(out)                                         → [{n, id, feature, at, summary, entries, verdicts, file}] newest first
 *   logText(out, {run?, only?, check?, all?})             → the list (the newest RUNS_LISTED), or one run as text
 *
 * One run reads four ways (`only`):
 *   (default)   each stage once: what it wrote, what it decided and the values the decision read
 *   decisions   only the decisions (decide() and select()), each with what it read
 *   errors      only the errors
 *   steps       every entry as the record says it
 * and `check` prints one verdict's evidence in full: everything its check measured (each faint word, each broken part).
 *
 * A record keeps each entry's words (text), its kind and its stage; never a value it carried (rawValue: a live object,
 * possibly large), so a saved run holds what the record SAYS, as the narrative says it. Those words include short
 * summaries of the values read and written (footprintjs says a string of up to 80 characters as it is, an object by its
 * keys): a chart that handles a private value redacts it (footprintjs redaction) before its narrative says it. A
 * verdict's evidence is the check's own measured values, kept as data. What the log reads back it reads as a file someone else
 * may have put there: only a plain file, bounded, of the shape saveRun writes, its text shown as plain lines.
 */
import {readdirSync, existsSync, lstatSync, rmSync} from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {outputFolder, writeOutput, readPlainFile} from './files.mjs';

/** Where the runs live, inside the out folder. */
export const RUNS = Object.freeze(['.storyreel', 'runs']);
/** How many runs a project keeps: saving one more drops the oldest. */
export const RUNS_KEPT = 100;
/** How many runs the list shows by default (all: every one). */
export const RUNS_LISTED = 10;
/** How many lines one run prints by default (all: every one). */
export const LOG_LINES = 40;
/** How long one line of a stage's writes or a decision's reads runs before it is cut (… marks the cut). */
export const LINE_CHARS = 200;
/** The ways to read one run (`only`), the default first. */
export const VIEWS = Object.freeze(['stages', 'decisions', 'errors', 'steps']);
const RUN_FILE = /^\d{4}-\d\d-\d\dT[\d-]+Z-[a-z][a-z-]{0,30}\.[0-9a-f]{6}\.json$/;
/** The most bytes read of a saved run, and of a render's making-of.json: more is not ours, and not read. */
export const RUN_MOST = 4 * 1024 * 1024, MAKING_OF_MOST = 32 * 1024 * 1024;
const FEATURE = /^[a-z][a-z-]{0,30}$/;
/** Text read from a file, made one plain line: control, line-separator and bidi-override characters become spaces. */
const oneLine = x => String(x).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, ' ');

/** A record's entries as words: {type, text, depth, stage, id} each (a line break in the text kept as ⏎), nothing it carried. */
export const plainEntries = record => (record ?? []).map(e => ({type: String(e.type), text: String(e.text ?? '').replace(/\r?\n/g, '⏎'), depth: e.depth ?? 0,
  stage: e.stageName ?? e.stageId ?? null, id: e.stageId ?? null}));

/** Verdicts as the run keeps them: {check, label, verdict, why, measured, summary?} each, the measured values as data. */
const plainVerdicts = verdicts => (verdicts ?? []).map(v => ({check: v.check, label: v.label, verdict: v.verdict, why: v.why ?? '', measured: v.measured ?? {}, ...(v.summary ? {summary: v.summary} : {})}));

/** Save one run of a feature into the out folder's runs: {feature, summary, record, verdicts?}. Returns the file written. */
export function saveRun(out, {feature, summary = '', record = [], verdicts = null, at = new Date()}) {
  if (!FEATURE.test(feature)) throw new Error(`saveRun: feature is a short lowercase name (review, render, breakdown), not ${JSON.stringify(feature)}`);
  const dir = outputFolder(out, RUNS), stamp = at.toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${stamp}-${feature}.${randomBytes(3).toString('hex')}.json`);   // two saves in one millisecond: two runs
  writeOutput(file, JSON.stringify({feature, at: at.toISOString(), summary: String(summary), entries: plainEntries(record), ...(verdicts ? {verdicts: plainVerdicts(verdicts)} : {})}, null, 1));
  dropOldRuns(dir, path.basename(file));
  return file;
}

/** Keep the newest RUNS_KEPT runs: the older ones (plain files named as a run, nothing else in the folder) go — never `kept`, the one just written. */
function dropOldRuns(dir, kept) {
  const runs = readdirSync(dir).filter(n => n !== kept && RUN_FILE.test(n) && lstatSync(path.join(dir, n)).isFile()).sort();
  for (const name of runs.slice(0, Math.max(0, runs.length - (RUNS_KEPT - 1)))) rmSync(path.join(dir, name), {force: true});
}

/**
 * A file of the runs folder read as a saved run, or null when it is not one. Read only as a plain file of at most
 * RUN_MOST bytes (files.mjs · readPlainFile: never through a link, never a FIFO), then checked for the shape saveRun
 * writes; every string it shows made one plain line, so a file cannot draw lines of its own in the log.
 */
function savedRun(file) {
  const r = JSON.parse(readPlainFile(file, {most: RUN_MOST, fix: 'a saved run is a file StoryReel wrote'}) ?? 'null');
  if (!r || typeof r !== 'object' || !FEATURE.test(r.feature) || typeof r.at !== 'string' || Number.isNaN(Date.parse(r.at)) || !Array.isArray(r.entries)) return null;
  if (!r.entries.every(e => e && typeof e.type === 'string' && typeof e.text === 'string')) return null;
  if (r.verdicts !== undefined && !(Array.isArray(r.verdicts) && r.verdicts.every(v => v && typeof v.check === 'string' && v.measured && typeof v.measured === 'object'))) return null;
  return {id: path.basename(file, '.json'), feature: r.feature, at: new Date(r.at).toISOString(), summary: oneLine(r.summary ?? ''), file, entries: readEntries(r.entries),
    ...(r.verdicts ? {verdicts: r.verdicts.map(v => ({check: oneLine(v.check), label: oneLine(v.label ?? v.check), verdict: oneLine(v.verdict ?? ''), why: oneLine(v.why ?? ''), measured: v.measured, ...(v.summary ? {summary: oneLine(v.summary)} : {})}))} : {})};
}

/** Entries read back from a file: each string shown made one plain line. */
const readEntries = entries => entries.map(e => ({type: e.type, text: oneLine(e.text), depth: Number.isInteger(e.depth) ? e.depth : 0,
  stage: typeof e.stage === 'string' ? oneLine(e.stage) : null, id: typeof e.id === 'string' ? oneLine(e.id) : null}));

/**
 * A render's making-of.json, as a run (read as savedRun reads, at most MAKING_OF_MOST bytes): its compile record
 * (`compile`, the compile's narrative entries, pipeline.mjs) — the entries a record of a run holds, taken as words.
 */
function renderRun(file) {
  const made = JSON.parse(readPlainFile(file, {most: MAKING_OF_MOST, fix: 'a making-of.json is a file the render wrote'}) ?? 'null');
  if (!made || typeof made !== 'object') return null;
  const compile = Array.isArray(made.compile) ? made.compile.filter(e => e && typeof e.type === 'string' && typeof e.text === 'string') : [];
  return {id: path.basename(file, '.json'), feature: 'render', at: lstatSync(file).mtime.toISOString(), summary: oneLine(made.out ?? 'a render'), entries: readEntries(plainEntries(compile)), file};
}

/** The runs in the out folder, newest first, numbered from 1: the saved ones and the render's making-of.json. */
export function listRuns(out) {
  const dir = path.join(out, ...RUNS), runs = [];
  const take = (read, file) => { let r = null; try { r = read(file); } catch { /* a link, a FIFO, too big, not JSON: counted below */ } if (r) runs.push(r); else runs.unread = (runs.unread ?? 0) + 1; };
  if (existsSync(dir)) for (const name of readdirSync(dir).filter(n => RUN_FILE.test(n))) take(savedRun, path.join(dir, name));
  for (const made of [path.join(out, 'making-of.json'), path.join(out, 'making-of.failed.json')].filter(f => existsSync(f))) take(renderRun, made);
  const listed = runs.sort((a, b) => b.at.localeCompare(a.at)).map((r, i) => ({n: i + 1, ...r}));
  listed.unread = runs.unread ?? 0;
  return listed;
}

const when = iso => iso.replace('T', ' ').slice(0, 19);
const said = r => (r.summary ? ` · ${r.summary}` : '');
const cut = (text, most = LINE_CHARS) => (text.length > most ? `${text.slice(0, most - 1)}…` : text);
/** A step entry read: "Step 4: Write stillShare = 0.096" → {verb: 'Write', key: 'stillShare', value: '0.096'} (a key may hold spaces). */
const STEP = /^Step \d+: (Read|Write|Update|Delete) (.+?)(?: = (.*))?$/s;
const stepOf = text => { const m = STEP.exec(text); return m ? {verb: m[1], key: m[2], value: m[3] ?? ''} : null; };
const pairs = steps => steps.map(s => (s.value === '' ? s.key : `${s.key} ${s.value}`)).join(', ');
const decisionText = text => text.replace(/^\[(Condition|Selected)\]:\s*/, '');

/**
 * Where the bracket opened at `from` closes in `text`, a quoted span ("…") skipped whole — footprintjs quotes a string
 * value as it is, so a bracket inside one is the value's — or -1 when it never does (the sentence cannot be read).
 */
function closeOf(text, from) {
  let depth = 0;
  for (let k = from; k < text.length; k++) {
    const c = text[k];
    if (c === '"') { const end = text.indexOf('"', k + 1); if (end < 0) return -1; k = end; } else if ('({['.includes(c)) depth++;
    else if (')}]'.includes(c) && --depth === 0) return k;
  }
  return -1;
}

/**
 * A selector's sentence, said once: footprintjs names each picked path with the values its when() read, and a selector
 * whose rules all read the same thing says it once per path. Kept: each path and its label; the values read, once.
 * A sentence it cannot read for sure (a quote or bracket never closed) is kept as it is: never a shortened misreading.
 */
export function compactSelected(text) {
  const said = decisionText(text), read = new Set();
  let kept = '', k = 0;
  while (k < said.length) {
    if (said[k] === '"') { const end = said.indexOf('"', k + 1); if (end < 0) return said; kept += said.slice(k, end + 1); k = end + 1; continue; }
    if (said.startsWith(' (', k) && /^\w+=/.test(said.slice(k + 2))) {
      const close = closeOf(said, k + 1);
      if (close < 0) return said;
      for (const one of splitTop(said.slice(k + 2, close))) read.add(one);
      k = close + 1; continue;
    }
    kept += said[k++];
  }
  return `${kept}${read.size ? ` · read ${[...read].join(', ')}` : ''}`;
}

/** Split "a=1, b={x, y}" at its top-level commas only, a quoted span skipped whole. */
function splitTop(text) {
  const parts = [];
  let depth = 0, from = 0;
  for (let k = 0; k < text.length; k++) {
    const c = text[k];
    if (c === '"') { const end = text.indexOf('"', k + 1); k = end < 0 ? text.length : end; } else if ('({['.includes(c)) depth++; else if (')}]'.includes(c)) depth--;
    else if (c === ',' && depth === 0) { parts.push(text.slice(from, k).trim()); from = k + 1; }
  }
  parts.push(text.slice(from).trim());
  return parts.filter(Boolean);
}

/**
 * The record cut into stages: consecutive entries of one stage, in order (a subflow's enter and exit lines dropped),
 * one stage by its id (a selector's line carries only the id; its stage line the name too), shown by its name.
 */
function stagesOf(entries) {
  const stages = [];
  for (const e of entries) {
    if (e.type === 'subflow') continue;
    const last = stages.at(-1), key = e.id ?? e.stage, named = e.stage !== null && e.stage !== e.id;
    if (last && last.key === key && e.type !== 'stage') { last.entries.push(e); if (named && !last.named) Object.assign(last, {stage: e.stage, named}); }
    else stages.push({key, stage: e.stage ?? e.id ?? '(run)', named, entries: [e]});
  }
  return stages;
}

/** One stage as lines: its name, what it wrote, each decision with what it read; an error as said. */
function stageLines({stage, entries}, {decisionsOnly = false} = {}) {
  const steps = entries.filter(e => e.type === 'step').map(e => stepOf(e.text) ?? {verb: null, text: e.text});
  const reads = steps.filter(s => s.verb === 'Read'), writes = steps.filter(s => s.verb === 'Write' || s.verb === 'Update');
  const deletes = steps.filter(s => s.verb === 'Delete'), unread = steps.filter(s => s.verb === null);
  const lines = [];
  for (const e of entries) {
    if (e.type === 'condition') lines.push(`  decided: ${decisionText(e.text)}${reads.length ? cut(` · read ${pairs(reads)}`) : ''}`);
    else if (e.type === 'selector') lines.push(`  picked: ${cut(compactSelected(e.text), LINE_CHARS * 2)}`);
    else if (e.type === 'fork' && !decisionsOnly) lines.push(`  ${decisionText(e.text).replace(/^\[Parallel\]:\s*/, '')}`);
    else if (e.type === 'error' && !decisionsOnly) lines.push(`  error: ${e.text}`);
  }
  if (decisionsOnly) return lines.length ? [stage, ...lines] : [];
  // a step the reader cannot take apart is shown as the record says it, never dropped
  lines.unshift(...[writes.length && `  wrote ${pairs(writes)}`, deletes.length && `  deleted ${deletes.map(d => d.key).join(', ')}`, ...unread.map(u => `  ${u.text}`)].filter(Boolean).map(l => cut(l)));
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
  if (!v) throw new Error(`run ${r.id} has no verdict "${check}"${r.verdicts?.length ? `: its verdicts are ${r.verdicts.map(x => x.check).join(', ')}` : ' (only a review keeps verdicts)'}`);
  const value = x => JSON.stringify(x);
  const lines = Object.entries(v.measured).flatMap(([k, x]) => (Array.isArray(x) && x.length && typeof x[0] === 'object'
    ? [`${oneLine(k)}: ${x.length}`, ...x.map(item => `  ${value(item)}`)]
    : [`${oneLine(k)}: ${value(x)}`]));
  return [`${v.label} · ${v.verdict}: ${v.why}${v.summary ? ` (${v.summary})` : ''}`, ...(lines.length ? lines : ['nothing measured'])].join('\n');
}

/**
 * The log as text: without `run`, the list (newest first, one line each: number, time, feature, summary, how many
 * decisions; the newest RUNS_LISTED unless `all`); with `run` (its number or its id), that run in one of VIEWS (`only`, the stages by default), at most LOG_LINES lines
 * unless `all`, the rest counted with the call that shows them; with `check` too, that verdict's evidence in full.
 */
export function logText(out, {run = null, only = null, check = null, all = false} = {}) {
  const runs = listRuns(out), unread = runs.unread ? `\n(${runs.unread} run file${runs.unread === 1 ? '' : 's'} could not be read and ${runs.unread === 1 ? 'is' : 'are'} not listed)` : '';
  if (!runs.length) return `no runs yet in ${path.join(out, ...RUNS)}: a review saves one (storyreel review), a render writes making-of.json${unread}`;
  const decisions = r => r.entries.filter(e => e.type === 'condition' || e.type === 'selector').length;
  if (run === null) {
    if (check !== null || only !== null) throw new Error(`--${check !== null ? 'check' : 'only'} reads one run: give its number (--run 1)`);
    const listed = all ? runs : runs.slice(0, RUNS_LISTED);
    return listed.map(r => `${r.n}. ${when(r.at)} ${r.feature}${said(r)}${decisions(r) ? ` · ${decisions(r)} decisions` : ''}`).join('\n')
      + (runs.length > listed.length ? `\n… ${runs.length - listed.length} older: storyreel log --all` : '')
      + `\nstoryreel log --run <n> shows one (--only ${VIEWS.slice(1).join(' | ')}, --check <verdict>, --all)${unread}`;
  }
  const r = runs.find(x => x.id === String(run)) ?? (/^\d+$/.test(String(run)) ? runs.find(x => x.n === Number(run)) : undefined);
  if (!r) throw new Error(`there is no run ${run}: the runs are 1–${runs.length}, or a run's id (storyreel log lists them)`);
  if (check !== null) return checkText(r, String(check));
  const view = only ?? VIEWS[0];
  if (!VIEWS.includes(view)) throw new Error(`--only is ${VIEWS.slice(1).join(', ')} (or nothing, for the stages), not ${JSON.stringify(only)}`);
  const shown = runLines(r, view), lines = all ? shown : shown.slice(0, LOG_LINES);
  // the head names the run by its id, and so do the calls it offers: a number moves when another run is saved
  const head = `${r.n}. ${when(r.at)} ${r.feature}${said(r)}\nrun ${r.id}`;
  const evidence = r.verdicts?.length ? `\nevidence: storyreel log --run ${r.id} --check ${r.verdicts.map(v => v.check).join('|')}` : '';
  const more = shown.length > lines.length ? `\n… ${shown.length - lines.length} more: storyreel log --run ${r.id}${only ? ` --only ${only}` : ''} --all` : '';
  return `${head}\n${lines.join('\n') || `(no ${view} in this run)`}${more}${evidence}`;
}
