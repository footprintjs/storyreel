// problems — what a check found, as one list a reply can order and a later run can compare with.
//
// A problem is {level: 'error' | 'advice', kind, key, line}: `line` what the reply says of it (one line, cut to
// ROW_MOST), `kind` what sort it is (for the count of those not listed), `key` what it is — a short hash of its sort,
// its scene and its words with every number taken out, so the same finding two seconds later, or 71 % still where it
// was 72 %, is the same finding.
import {createHash} from 'node:crypto';
import {oneLine} from '../oneline.mjs';

/** The kinds of finding that are advice, not errors (a held title can be right): review.mjs lists them after the rest too. */
export const ADVICE_KINDS = Object.freeze(['still', 'stale', 'slideshow', 'hook']);
/** A phrase the film still places (said more than once: the first place is used; a moment named with nth or edge: the moment is used): advice. */
const SOFT_PHRASES = Object.freeze(['ambiguous', 'moment']);
/** The most a row of the reply holds, and the most keys a run keeps: a reply and a run's file are small whatever the film. */
export const ROW_MOST = 300, KEYS_MOST = 300;

const refOf = ref => (Array.isArray(ref) ? {scene: ref[0], phrase: ref[1]} : ref ?? {});
const row = text => { const line = oneLine(text); return line.length > ROW_MOST ? `${line.slice(0, ROW_MOST - 1)}…` : line; };
/** A problem's key: its parts as a list (so a "|" in a phrase joins nothing), numbers out, hashed short. */
const keyOf = parts => createHash('sha256').update(JSON.stringify(parts.map(p => String(p ?? '').replace(/\d+(\.\d+)?/g, '#')))).digest('hex').slice(0, 16);

/**
 * Every problem of one check, errors first then advice, each group in the order found:
 * anchors: {notes: [{ref, path, problem}], lines: [text]} (a phrase the film is keyed to, each with its line);
 * review: {findings: [{kind, scene, what}], lines: [text], verdicts: [{check, label, verdict, why}]}.
 * A verdict that failed is one error — unless its own findings are listed as errors (a verdict's findings carry its
 * check's name as their kind): then they are what to fix, and the verdict is not counted a second time.
 */
export function problemsOf({anchors = null, review = null}) {
  const out = [], findings = review?.findings ?? [];
  (anchors?.notes ?? []).forEach((n, i) => {
    const r = refOf(n.ref);
    out.push({level: SOFT_PHRASES.includes(n.problem) ? 'advice' : 'error', kind: 'phrase', key: keyOf(['phrase', n.problem, r.scene, r.phrase, n.path]), line: row(`phrase · ${anchors.lines[i]}`)});
  });
  for (const v of review?.verdicts ?? []) {
    if (v.verdict !== 'failed') continue;
    const itsOwn = findings.some(f => f.kind === v.check && !ADVICE_KINDS.includes(f.kind));
    if (!itsOwn) out.push({level: 'error', kind: v.check, key: keyOf(['verdict', v.check]), line: row(`${v.label ?? v.check} · ${v.verdict}: ${v.why}`)});
  }
  findings.forEach((f, i) => out.push({level: ADVICE_KINDS.includes(f.kind) ? 'advice' : 'error', kind: f.kind, key: keyOf(['finding', f.kind, f.scene, f.what]), line: row(review.lines[i])}));
  return [...out.filter(p => p.level === 'error'), ...out.filter(p => p.level === 'advice')];
}

/**
 * This check beside the one before: {fixed, added, round, first, capped} — how many of the last run's problems are
 * gone, how many are new, and which round of fixing this is (1 after a clean run or the first; one more each run that
 * still has something to fix). `before`: {keys, round, verdict} of the last check kept for this film, or null. A key
 * held twice counts twice. `capped`: one of the two lists was cut at KEYS_MOST, so the counts are not said.
 */
export function sinceLast(keys, before) {
  if (!before) return {fixed: 0, added: 0, round: 1, first: true, capped: false};
  const round = before.verdict === 'clean' ? 1 : before.round + 1;
  if (keys.length >= KEYS_MOST || before.keys.length >= KEYS_MOST) return {fixed: 0, added: 0, round, first: false, capped: true};
  const left = new Map();
  for (const k of before.keys) left.set(k, (left.get(k) ?? 0) + 1);
  let added = 0;
  for (const k of keys) { const n = left.get(k) ?? 0; if (n) left.set(k, n - 1); else added += 1; }
  return {fixed: [...left.values()].reduce((sum, n) => sum + n, 0), added, round, first: false, capped: false};
}
