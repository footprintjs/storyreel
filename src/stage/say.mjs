/**
 * How the stage says things in its refusals and its ledger: a value, a time, where a thing is, a beat's ordinal.
 *
 * A holder is where a thing is: {type: 'ground', at, dx} | {type: 'in', id, slot} | {type: 'with', id, slot} |
 * {type: 'gone'} | {type: 'off'}.
 */

export const EPS = 1e-9;
/** A value as a message shows it. */
export const shown = v => JSON.stringify(v) ?? String(v);
/** A time as a message shows it: "3.20 s". */
export const s2 = t => `${t.toFixed(2)} s`;
export const list = v => (Array.isArray(v) ? v : [v]);
/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th, 21st. */
export const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** Where a holder is, in words: "in bag", "with girl", "on the ground", "gone", "off stage". */
export const holderName = h => (h.type === 'in' ? `in ${h.id}` : h.type === 'with' ? `with ${h.id}` : h.type === 'ground' ? 'on the ground' : h.type === 'gone' ? 'gone' : 'off stage');
/** The ledger's short key for a holder: the container's or person's id, or ground, gone, offstage. */
export const holderKey = h => (h.type === 'in' || h.type === 'with' ? h.id : h.type === 'off' ? 'offstage' : h.type);
/** Where a thing is as the story stands (a thing whose prop went off stage is off stage). */
export const nowOf = I => (I.on || I.now.type === 'gone' ? I.now : {type: 'off'});

/** Things, by where they are: "9 in crate, 1 with keeper". */
export function describe(items) {
  const by = new Map();
  for (const I of items) { const n = holderName(nowOf(I)); by.set(n, (by.get(n) ?? 0) + 1); }
  return [...by].map(([n, k]) => `${k} ${n}`).join(', ') || 'none';
}
