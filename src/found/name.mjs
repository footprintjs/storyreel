/**
 * A found sound's name, the sound event's type that names one, and that event's own fields (its trim): the one rule
 * for each, in a leaf that imports nothing, so the synthesis (sound.mjs), the film and the record check a found sound's
 * shape without loading any file or network code.
 */

/** The type of a sound event that names a found sound: {time, type: 'found', name, gain?}. */
export const FOUND = 'found';
/** Lower case, a letter first, then letters, digits and dashes, at most 40: a file name with no way out of its folder. */
const NAME = /^[a-z][a-z0-9-]{0,39}$/;
export const isFoundName = v => typeof v === 'string' && NAME.test(v);
/** A found sound's trim: `from` and `to`, seconds into its recording, each left out or a finite number from 0, `to` after `from`. */
export const isTrim = (from, to) => (from === undefined || (typeof from === 'number' && Number.isFinite(from) && from >= 0))
  && (to === undefined || (typeof to === 'number' && Number.isFinite(to) && to > 0)) && (from === undefined || to === undefined || to > from);
/** What a found sound event carries besides its time and gain: its name, and its trim when it has one. */
export const foundFields = e => ({name: e.name, ...(e.from !== undefined ? {from: e.from} : {}), ...(e.to !== undefined ? {to: e.to} : {})});

export function checkFoundName(name, who) {
  if (!isFoundName(name)) throw new Error(`${who}: a found sound's name is lower case, a letter first, then letters, digits and dashes, at most 40 (e.g. "page-turn"), not ${JSON.stringify(String(name)).slice(0, 60)}`);
  return name;
}
