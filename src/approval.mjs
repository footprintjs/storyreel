/**
 * An approval lock. When a person approves a film, `approveFilm` records what they approved: a hash of
 * the storyboard, the recipe, the pacing and (when there is one) the voice. `makeFilm({…, approval})`
 * then refuses to render if any of them changed since, naming what changed and when it was approved —
 * so a "final" render can only be the film someone actually watched and approved.
 *
 * Hashes are of the data, not of its spelling: keys are sorted before hashing, so reformatting a JSON
 * file or reordering its keys changes nothing; changing a word, a phrase or a number does.
 */
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';

/** JSON with every object's keys sorted: the same data always spells the same text. */
export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}
const hashOf = value => createHash('sha256').update(stableJson(value)).digest('hex').slice(0, 16);

/** The voice's identity: its timings.json (every word's time) and every audio file it names, hashed. */
function voiceHash(narrationDir) {
  const file = path.join(narrationDir, 'timings.json');
  if (!existsSync(file)) throw new Error(`approval: ${narrationDir} has no timings.json (give the voice folder the film is rendered with)`);
  const timings = JSON.parse(readFileSync(file, 'utf8')), h = createHash('sha256').update(stableJson(timings));
  for (const s of timings.scenes ?? []) if (s.audio) { const a = path.join(narrationDir, s.audio); if (existsSync(a)) h.update(readFileSync(a)); }
  return h.digest('hex').slice(0, 16);
}

/** What a film is made of, hashed: the parts an approval locks. */
export function filmHashes({storyboard, recipe, pacing = null, narrationDir = null}) {
  if (!storyboard?.scenes) throw new Error('approval: give the storyboard');
  if (!recipe || typeof recipe !== 'object') throw new Error('approval: give the recipe');
  return {storyboard: hashOf(storyboard), recipe: hashOf(recipe), pacing: hashOf(pacing), ...(narrationDir ? {voice: voiceHash(narrationDir)} : {})};
}

/**
 * Approve a film as it is now: who approved it, when, and the hashes of what they saw.
 * @returns {schemaVersion, approved (ISO time), by, note?, hashes}
 */
export function approveFilm({storyboard, recipe, pacing = null, narrationDir = null, by, note = null, at = new Date()}) {
  if (typeof by !== 'string' || !by.trim()) throw new Error('approveFilm: say who approves it (by: "a name")');
  return {schemaVersion: 1, approved: at.toISOString(), by: by.trim(), ...(note ? {note} : {}), hashes: filmHashes({storyboard, recipe, pacing, narrationDir})};
}

/**
 * Whether the film is still what was approved: {ok, changed: [part names]}. A part the approval locked but
 * the render no longer has (no voice now, say) counts as changed.
 */
export function checkApproval(approval, inputs) {
  if (!approval || approval.schemaVersion !== 1 || !approval.hashes) throw new Error('checkApproval: not an approval (make one with approveFilm)');
  const now = filmHashes(inputs), changed = Object.keys(approval.hashes).filter(k => approval.hashes[k] !== now[k]);
  if (now.voice && !approval.hashes.voice) changed.push('voice');
  return {ok: changed.length === 0, changed};
}

/** Refuse a render of anything but the approved film, naming what changed and when it was approved. */
export function requireApproval(approval, inputs) {
  const {ok, changed} = checkApproval(approval, inputs);
  if (ok) return;
  throw new Error(`The film changed since ${approval.by} approved it on ${approval.approved.slice(0, 10)}: ${changed.join(', ')} ${changed.length > 1 ? 'differ' : 'differs'} from what was approved. Approve it again (approveFilm), or render it as a draft without the approval.`);
}
