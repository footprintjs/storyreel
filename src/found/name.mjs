/**
 * A found sound's name, and the sound event's type that names one: the one rule, in a leaf that imports nothing, so the
 * synthesis (sound.mjs) and the transitions check a found sound's shape without loading any file or network code.
 */

/** The type of a sound event that names a found sound: {time, type: 'found', name, gain?}. */
export const FOUND = 'found';
/** Lower case, a letter first, then letters, digits and dashes, at most 40: a file name with no way out of its folder. */
const NAME = /^[a-z][a-z0-9-]{0,39}$/;
export const isFoundName = v => typeof v === 'string' && NAME.test(v);
export function checkFoundName(name, who) {
  if (!isFoundName(name)) throw new Error(`${who}: a found sound's name is lower case, a letter first, then letters, digits and dashes, at most 40 (e.g. "page-turn"), not ${JSON.stringify(String(name)).slice(0, 60)}`);
  return name;
}
