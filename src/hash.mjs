/**
 * Hashes of data, the one way StoryReel spells them: keys sorted first, so the same data always hashes the
 * same (reformatting a JSON file or reordering its keys changes nothing; changing a word or a number does).
 * The film's inputs (film.mjs · inputs), an approval (approval.mjs) and a segment's key (segments.mjs) all
 * hash through here.
 */
import {createHash} from 'node:crypto';

/** JSON with every object's keys sorted: the same data always spells the same text. */
export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}

/** A short hash of data (stableJson), 16 hex digits. */
export const hashOf = value => createHash('sha256').update(stableJson(value)).digest('hex').slice(0, 16);

/** A short hash of bytes (a file's contents), 16 hex digits. */
export const hashBytes = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, 16);
