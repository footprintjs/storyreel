// text — a check's reply: the verdict first, then what to fix, worst first, then what changed since the run before.
import {oneLine} from '../oneline.mjs';

/** How many problems a reply lists in full; the rest are counted, by their kind. */
export const CHECK_TOP = 8;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The first line: clean, fix <n>, or broken — and the counts behind it. */
export function verdictLine({verdict, errors, advice, stopped}) {
  if (verdict === 'broken') return `broken — the film does not compile: ${oneLine(stopped)}`;
  const also = advice ? `${plural(advice, 'piece')} of advice` : '';
  return verdict === 'clean' ? `clean — nothing to fix${also ? ` · ${also}` : ''}` : `fix ${errors} — ${plural(errors, 'error')}${also ? `, ${also}` : ''}`;
}

/** What changed since the check before, as one line. */
export function sinceLine({fixed, added, round, first}) {
  if (first) return 'since the run before: this is the first check kept here';
  const moved = fixed || added ? `${fixed} fixed, ${added} new` : 'nothing changed';
  return `since the run before: ${moved} · round ${round}`;
}

/**
 * The whole reply. `all`: every problem (default: the first CHECK_TOP, the rest counted); `more`: how to ask for all.
 * said: {verdict, errors, advice, stopped, head, problems, notRun, changes, since}.
 */
export function checkText(said, {all = false, more = 'storyreel check --full'} = {}) {
  const {problems, notRun = [], changes = null, since, head = null} = said;
  const shown = all ? problems : problems.slice(0, CHECK_TOP), rest = problems.length - shown.length;
  const kinds = rest ? [...problems.slice(shown.length).reduce((m, p) => m.set(p.kind, (m.get(p.kind) ?? 0) + 1), new Map())].map(([kind, n]) => `${n} ${kind}`).join(', ') : '';
  return [verdictLine(said), ...(head ? [head] : []),
    ...shown.map(p => `${p.level === 'error' ? 'fix ' : 'note'} ${p.line}`),
    ...(rest ? [`… ${rest} more (${kinds}): ${more}`] : []),
    ...notRun.map(line => `not run · ${line}`),
    ...(changes ? [`changes: ${oneLine(changes)}`] : []),
    sinceLine(since)].join('\n');
}
