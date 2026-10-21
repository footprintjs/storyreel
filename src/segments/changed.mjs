/**
 * What an edit changed, said before anything is drawn: the planned pieces the cache does not keep (segments.mjs ·
 * why), merged into ranges on the film clock, one short line each, then the count — what an agent reads:
 *
 *   0:12–0:18 left · its recipe entries changed
 *   2 of 33 pieces changed (0:06 of 3:02)
 *
 * The reasons are the ones a render's report gives (segments/material.mjs · whyDrawn). A range is said in whole seconds
 * that hold it (its start rounded down, its end up), so it can be handed back as a window (storyreel part --from --to).
 */
import {clockText} from 'footprint-narration';

/** The defaults: at most `lines` ranges said (the rest counted), and `handles` seconds of the pieces either side in a clip. */
export const CHANGES_DEFAULTS = Object.freeze({lines: 10, handles: 1});

/**
 * Seconds on the film clock as m:ss (h:mm:ss past an hour): rounded down ('floor', the default), up ('ceil'), to the
 * nearest second ('nearest'), or as given to the hundredth ('exact': 0:12.5).
 */
export function clockOf(t, round = 'floor') {
  if (round === 'exact') {
    const whole = Math.floor(t + 1e-6), part = +(t - whole).toFixed(2);
    return part > 0 && part < 1 ? `${clockText(Math.max(0, whole))}${part.toFixed(2).slice(1).replace(/0+$/, '')}` : clockText(Math.max(0, Math.round(t)));
  }
  const whole = round === 'ceil' ? Math.ceil(t - 1e-6) : round === 'nearest' ? Math.round(t) : Math.floor(t + 1e-6);
  return clockText(Math.max(0, whole));
}

/** A range's times as it is said: its start rounded down, its end up ("0:12–0:18"). */
export const rangeText = ({from, to}) => `${clockOf(from)}–${clockOf(to, 'ceil')}`;

/**
 * The changed pieces merged into ranges: pieces in order ({index, f0, f1, from, to, scenes, why}; why null when the
 * cache keeps it), each run of changed ones one range {first, last, f0, f1, from, to, scenes, why}: the scenes it covers
 * and what changed — its pieces' reasons, phrase by phrase ("words changed, beats moved"), each once, in order.
 */
export function changedRanges(pieces) {
  const ranges = [], add = (list, items) => { for (const x of items) if (!list.includes(x)) list.push(x); };
  for (const p of pieces) {
    if (p.why === null || p.why === undefined) continue;
    const last = ranges.at(-1), phrases = String(p.why).split(', ');
    if (last && last.last === p.index - 1) { Object.assign(last, {last: p.index, f1: p.f1, to: p.to}); add(last.scenes, p.scenes); add(last.why, phrases); }
    else ranges.push({first: p.index, last: p.index, f0: p.f0, f1: p.f1, from: p.from, to: p.to, scenes: [...p.scenes], why: [...new Set(phrases)]});
  }
  return ranges;
}

/**
 * The lines to read: one per range (at most `lines`, the rest counted), then the count of changed pieces and the seconds
 * they cover. When no piece of the film is kept at all (every one is 'new'), the count says where the cache is: a
 * first render, or a render made into another folder, size or quality, keeps none. `notes`: what weakens the keys (the
 * strategy's notes, as a render's line ends with them), after `note:`.
 */
export function changesText({pieces, ranges, total, cache = null, notes = []}, {lines = CHANGES_DEFAULTS.lines} = {}) {
  const changed = pieces.filter(p => p.why !== null && p.why !== undefined);
  const said = ranges.slice(0, lines).map(r => `${rangeText(r)} ${r.scenes.join(' + ')} · ${r.why.join(', ')}`);
  if (ranges.length > said.length) said.push(`… ${ranges.length - said.length} more range${ranges.length - said.length > 1 ? 's' : ''}`);
  const seconds = changed.reduce((n, p) => n + (p.to - p.from), 0);
  const none = changed.length && changed.length === pieces.length && changed.every(p => p.why === 'new') && cache ? ` · none kept yet in ${cache}` : '';
  const note = notes.length ? ` · note: ${notes.join('; ')}` : '';
  return [...said, `${changed.length} of ${pieces.length} pieces changed (${clockOf(seconds, 'nearest')} of ${clockOf(total, 'nearest')})${none}${note}`].join('\n');
}
