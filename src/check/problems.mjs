// problems — what a check found, as one list a reply can order and a later run can compare with.
//
// A problem is {level: 'error' | 'advice', key, line}: `line` what the reply says of it (one line), `key` what it is,
// without the times an edit elsewhere moves (a finding two seconds later is still the same finding).
import {oneLine} from '../oneline.mjs';

/** The kinds of finding that are advice, not errors (a held title can be right): review.mjs lists them after the rest too. */
export const ADVICE_KINDS = Object.freeze(['still', 'stale', 'slideshow', 'hook']);
/** A phrase the film still places (said more than once: the first place is used; a moment named with nth or edge: the moment is used): advice. */
const SOFT_PHRASES = Object.freeze(['ambiguous', 'moment']);
/** A verdict that asks for a change. 'not run' asks for nothing: it is said, never counted. */
const ASKS = new Set(['failed', 'refused']);

const refOf = ref => (Array.isArray(ref) ? {scene: ref[0], phrase: ref[1]} : ref ?? {});

/**
 * Every problem of one check, errors first then advice, each group in the order found:
 * anchors: {notes: [{ref, path, problem}], lines: [text]} (a phrase the film is keyed to and cannot find, each with its line);
 * review: {findings: [{kind, scene, what, from, to}], lines: [text], verdicts: [{check, label, verdict, why}]}.
 */
export function problemsOf({anchors = null, review = null}) {
  const out = [];
  (anchors?.notes ?? []).forEach((n, i) => {
    const r = refOf(n.ref);
    out.push({level: SOFT_PHRASES.includes(n.problem) ? 'advice' : 'error', key: `phrase|${n.problem}|${r.scene ?? ''}|${r.phrase ?? ''}|${n.path ?? ''}`, line: `phrase · ${anchors.lines[i]}`});
  });
  for (const v of review?.verdicts ?? []) if (ASKS.has(v.verdict)) out.push({level: 'error', key: `verdict|${v.check}`, line: `${v.label ?? v.check} · ${v.verdict}: ${v.why}`});
  (review?.findings ?? []).forEach((f, i) => out.push({level: ADVICE_KINDS.includes(f.kind) ? 'advice' : 'error', key: `finding|${f.kind}|${f.scene ?? ''}|${f.what}`, line: review.lines[i]}));
  return [...out.filter(p => p.level === 'error'), ...out.filter(p => p.level === 'advice')].map(p => ({level: p.level, key: oneLine(p.key).slice(0, KEY_MOST), line: oneLine(p.line)}));
}

/** The most a key holds, and the most keys a run keeps: a run's file is small whatever the film. */
export const KEY_MOST = 200, KEYS_MOST = 300;

/**
 * This check beside the one before: {fixed, added, round} — how many of the last run's problems are gone, how many are
 * new, and which round of fixing this is (1 after a clean run or the first; one more each run that still has something
 * to fix). `before`: {keys, round, verdict} of the last check kept, or null. A key held twice counts twice.
 */
export function sinceLast(keys, before) {
  if (!before) return {fixed: 0, added: 0, round: 1, first: true};
  const left = new Map();
  for (const k of before.keys) left.set(k, (left.get(k) ?? 0) + 1);
  let added = 0;
  for (const k of keys) { const n = left.get(k) ?? 0; if (n) left.set(k, n - 1); else added += 1; }
  const fixed = [...left.values()].reduce((sum, n) => sum + n, 0);
  return {fixed, added, round: before.verdict === 'clean' ? 1 : before.round + 1, first: false};
}
