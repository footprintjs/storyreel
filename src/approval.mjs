/**
 * An approval lock. A person watches a render and approves it: `approveFilm({record, by})` takes that
 * render's making-of.json, which lists what the film was made from, hashed — the storyboard, the timings,
 * the recipe, the strings, the data, the theme and every file the film read (film.mjs · inputs), the pacing,
 * the voice's audio, and a fingerprint of the kits' code when one was given (makeFilm's `code`).
 * `makeFilm({…, approval})` then refuses to render anything else, naming what changed and when it was
 * approved — so a "final" render can only be the film someone watched.
 *
 * What it does not lock is said in the record: the render's settings (size, format, captions — the same
 * approved film is made for every platform) and, unless a code fingerprint was given, the kits' code.
 */
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {stableJson} from './hash.mjs';

export {stableJson};

/** The voice: its timings.json and every audio file it names — each by name, length and bytes, so no two voices share a hash. */
export function voiceHash(narrationDir) {
  const file = path.join(narrationDir, 'timings.json');
  if (!existsSync(file)) throw new Error(`approval: ${narrationDir} has no timings.json (give the voice folder the film is rendered with)`);
  const timings = JSON.parse(readFileSync(file, 'utf8')), h = createHash('sha256').update(stableJson(timings));
  for (const s of timings.scenes ?? []) {
    if (!s.audio) continue;
    const audio = path.join(narrationDir, s.audio), bytes = existsSync(audio) ? readFileSync(audio) : null;
    h.update(`\0${s.audio}\0${bytes ? bytes.length : 'missing'}\0`); if (bytes) h.update(bytes);
  }
  return h.digest('hex').slice(0, 16);
}

/**
 * Approve a render as it was watched: who approved it, when, and what it was made from.
 * @param record  the render's making-of record: the path of its making-of.json, or the object
 * @returns {schemaVersion: 2, approved (ISO time), by, note?, render?, inputs}
 */
export function approveFilm({record, by, note = null, at = new Date()} = {}) {
  if (typeof by !== 'string' || !by.trim()) throw new Error('approveFilm: say who approves it (by: "a name")');
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) throw new Error('approveFilm: at is when it was approved, a Date (default: now)');
  const made = typeof record === 'string' ? JSON.parse(readFileSync(record, 'utf8')) : record;
  if (!made?.inputs?.storyboard || !made.inputs.recipe) throw new Error('approveFilm: give the making-of record of the render that was watched (record: its making-of.json, or the object); it lists what the film was made from');
  if (made.span && !made.span.whole) throw new Error(`approveFilm: that render shows ${made.span.from}–${made.span.to} s of a ${made.span.total} s film; an approval is of the whole film: approve a render of all of it`);
  return {schemaVersion: 2, approved: at.toISOString(), by: by.trim(), ...(note ? {note} : {}), ...(made.out ? {render: path.basename(made.out)} : {}), inputs: made.inputs};
}

/** An approval, checked: what approveFilm makes, or a refusal. */
export function readApproval(approval) {
  if (!approval || approval.schemaVersion !== 2 || typeof approval.by !== 'string' || !approval.by.trim() || typeof approval.approved !== 'string' || Number.isNaN(Date.parse(approval.approved))
    || !approval.inputs || typeof approval.inputs !== 'object') throw new Error('checkApproval: not an approval (make one with approveFilm from a render\'s making-of.json)');
  return approval;
}

/**
 * Whether a film is still what was approved: {ok, changed: [what differs]}. `inputs` is what the film is
 * made from now (makeFilm: the film's inputs, the pacing, the voice, the code); a file is named by its path.
 */
export function checkApproval(approval, inputs) {
  if (!inputs || typeof inputs !== 'object') throw new Error('checkApproval: give what the film is made from now (makeFilm: the film\'s inputs, the pacing, the voice, the code)');
  const was = readApproval(approval).inputs, changed = [];
  for (const key of [...new Set([...Object.keys(was), ...Object.keys(inputs)])].filter(k => k !== 'files').sort()) {
    if (stableJson(was[key] ?? null) === stableJson(inputs[key] ?? null)) continue;
    changed.push(key === 'code' && !inputs.code ? 'the kits\' code (no fingerprint given now)' : key);
  }
  const before = was.files ?? {}, now = inputs.files ?? {};
  for (const f of [...new Set([...Object.keys(before), ...Object.keys(now)])].sort()) if (before[f] !== now[f]) changed.push(`the file ${f}${!(f in now) ? ' (not read now)' : !(f in before) ? ' (not read then)' : ''}`);
  return {ok: changed.length === 0, changed};
}

/** A date as the person who approved it would say it: YYYY-MM-DD in this machine's time zone. */
const localDate = iso => new Date(iso).toLocaleDateString('en-CA');

/** Refuse a render of anything but the approved film, naming what changed and when it was approved. */
export function requireApproval(approval, inputs) {
  const {ok, changed} = checkApproval(approval, inputs);
  if (ok) return;
  throw new Error(`The film changed since ${approval.by} approved it on ${localDate(approval.approved)}: ${changed.join(', ')} ${changed.length > 1 ? 'differ' : 'differs'} from what was approved. Approve the new render (approveFilm with its making-of.json), or render it as a draft without the approval.`);
}

/** What an approval of these inputs does not lock (the record says so beside the approval). */
export const unlocked = inputs => ['the render settings (size, format and its bands, captions, intro, poster frame: the same film for every platform)', ...(inputs.code ? [] : ['the kits\' code (give makeFilm a code fingerprint: codeFingerprint)'])];
