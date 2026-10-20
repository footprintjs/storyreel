/**
 * Found sounds: recorded sound effects a film keeps beside it. `npx storyreel sounds add` fetches each ONCE (sounds.mjs,
 * through a sound source such as sounds/openverse.mjs) into the film's sounds/ folder as <name>.<ext>, described in
 * sounds/sounds.json; from then on a film reads them offline, and a render never touches the network.
 *
 * This module is the library's offline half, the one owner of each of its rules:
 *   - the licence gate, one table (LICENCES · licenceVerdict): CC0 and CC BY are used; CC BY-SA only when the film
 *     opts in (it puts the whole film under CC BY-SA); NC, ND and any licence it does not know are refused, saying why;
 *   - the record (foundRecord) and its text, made plain and capped (plainText), wherever it is written, read or shown;
 *   - the library read from a film's root (readLibrary) and a sound checked before a film uses it (useFound): its
 *     record's own licence through the gate, its file inside the root, its size and sha256 the record's.
 *
 * Threat model. Every field of a record came over the network, and sounds.json sits in a folder anyone may edit: all
 * of it is untrusted. Text may hold control characters, bidi overrides, newlines or a novel: it is made plain and capped
 * before a terminal or CREDITS.txt sees it. The gate reads the record's own licence field at every use, so an edited
 * record cannot unlock NC or ND without also claiming a licence the source never gave — and the sha256 ties the file to
 * the record, so a swapped file refuses. A file name is never the record's to choose: it is <name>.<ext>, the name a
 * strict slug, the extension one of AUDIO_EXTENSIONS.
 */
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFileSync, statSync, existsSync} from 'node:fs';
import {insideRoot} from './files.mjs';

/** Where a film keeps its found sounds, inside its root, and the record of them. */
export const SOUNDS_FOLDER = 'sounds', LIBRARY_FILE = 'sounds.json';
/** The most a found sound's file may hold, and its longest length: an effect, not a song. */
export const FOUND_LIMITS = Object.freeze({bytes: 20 * 1024 * 1024, seconds: 300});
/** The audio files a found sound is kept as (the extension comes from probing the file, never from the server's name). */
export const AUDIO_EXTENSIONS = Object.freeze(['mp3', 'wav', 'ogg', 'flac']);

/** A found sound's name: lower case, a letter first, then letters, digits and dashes (a file name with no way out of its folder). */
const NAME = /^[a-z][a-z0-9-]{0,39}$/;
export const isFoundName = v => typeof v === 'string' && NAME.test(v);
export function checkFoundName(name, who) {
  if (!isFoundName(name)) throw new Error(`${who}: a found sound's name is lower case, a letter first, then letters, digits and dashes, at most 40 (e.g. "page-turn"), not ${JSON.stringify(String(name)).slice(0, 60)}`);
  return name;
}

/**
 * The licence gate's one table, by the source's licence code: `use` is 'yes', 'share-alike' (only with
 * allowShareAlike) or 'no' (with why).
 */
export const LICENCES = Object.freeze({
  cc0: {name: 'CC0', use: 'yes'},
  by: {name: 'CC BY', use: 'yes'},
  'by-sa': {name: 'CC BY-SA', use: 'share-alike'},
  'by-nc': {name: 'CC BY-NC', use: 'no', why: 'NC allows no commercial use, and a film is posted where ads run'},
  'by-nd': {name: 'CC BY-ND', use: 'no', why: 'ND allows no changes, and mixing a sound into a film changes it'},
  'by-nc-sa': {name: 'CC BY-NC-SA', use: 'no', why: 'NC allows no commercial use, and a film is posted where ads run'},
  'by-nc-nd': {name: 'CC BY-NC-ND', use: 'no', why: 'NC allows no commercial use and ND no changes, and mixing a sound into a film changes it'},
  pdm: {name: 'Public Domain Mark', use: 'no', why: 'the Public Domain Mark labels a work as free where its maker lived, it grants nothing, and whether it is free depends on the country'},
  'sampling+': {name: 'Sampling+', use: 'no', why: 'Sampling+ allows parts of a work in a new one on conditions this gate does not read'},
  'nc-sampling+': {name: 'NC Sampling+', use: 'no', why: 'NC allows no commercial use, and a film is posted where ads run'},
});
/** The licence codes a search asks for: those the gate lets through, CC BY-SA too when the film opts in. */
export const usableLicences = ({allowShareAlike = false} = {}) => Object.keys(LICENCES).filter(k => LICENCES[k].use === 'yes' || (allowShareAlike && LICENCES[k].use === 'share-alike'));

/**
 * The gate: {licence, name, shareAlike} for a licence a film may use, or a refusal that says why and what to do.
 * `who` names the sound ('the found sound "page-turn"').
 */
export function licenceVerdict(licence, {allowShareAlike = false, who = 'this sound'} = {}) {
  const code = typeof licence === 'string' ? licence : '', entry = Object.hasOwn(LICENCES, code) ? LICENCES[code] : null;
  const instead = 'pick a CC0 or CC BY sound (npx storyreel sounds search "<words>")';
  if (!entry) throw new Error(`${who} has the licence ${JSON.stringify(plainText(licence, 30))}, which StoryReel does not know: a film uses CC0 and CC BY sounds (CC BY-SA when it opts in) — ${instead}`);
  if (entry.use === 'no') throw new Error(`${who} is ${entry.name}, which a film cannot use: ${entry.why} — ${instead}`);
  if (entry.use === 'share-alike' && !allowShareAlike) throw new Error(`${who} is ${entry.name}: using it puts the whole film under ${entry.name} too — to accept that, give the recipe "foundSounds": {"allowShareAlike": true} (and sounds add --allow-share-alike), or ${instead}`);
  return {licence: code, name: entry.name, shareAlike: entry.use === 'share-alike'};
}

/** The licence's deed, built from its code and version (never a URL the source gave). */
export function licenceUrl(licence, version) {
  const v = /^\d{1,2}\.\d{1,2}$/.test(version ?? '') ? version : licence === 'cc0' ? '1.0' : '4.0';
  return licence === 'cc0' ? `https://creativecommons.org/publicdomain/zero/${v}/` : `https://creativecommons.org/licenses/${licence}/${v}/`;
}

/** Control characters, line and paragraph separators, zero-width and bidi controls, the byte-order mark: never shown. */
const UNSHOWN = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/gu;
/** Whether text holds nothing unshown (a control, separator, zero-width or bidi character). */
export const shown = text => !new RegExp(UNSHOWN.source, 'u').test(String(text));
/** Text from a source made plain: unshown characters become spaces, runs of space one, at most `max` characters (an ellipsis when cut). */
export function plainText(value, max) {
  const chars = [...String(value ?? '').replace(UNSHOWN, ' ').replace(/\s+/gu, ' ').trim()];
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : chars.join('');
}
/** How long each of a record's texts may be. */
const TEXT = Object.freeze({title: 120, creator: 80, attribution: 400, source: 40, id: 64});
const https = v => (typeof v === 'string' && /^https:\/\/[^\s]{1,2000}$/.test(v) ? v : null);

/**
 * A found sound's record, as sounds.json keeps it: every field checked or made plain (a record read back is put
 * through this again). `from` is the source ('openverse'), `id` its id, `source` the site it came from there.
 */
export function foundRecord(r) {
  const licence = typeof r.license === 'string' ? r.license : '', version = /^\d{1,2}\.\d{1,2}$/.test(r.licenseVersion ?? '') ? r.licenseVersion : null;
  const title = plainText(r.title, TEXT.title) || 'untitled', creator = plainText(r.creator, TEXT.creator) || 'unknown', entry = Object.hasOwn(LICENCES, licence) ? LICENCES[licence] : null;
  const named = entry ? `${entry.name}${version ? ` ${version}` : ''}` : plainText(licence, 30);
  return {
    name: r.name, file: r.file, from: plainText(r.from, TEXT.source), id: plainText(r.id, TEXT.id), title, creator,
    license: licence, licenseVersion: version, licenseUrl: entry ? licenceUrl(licence, version) : null,
    attribution: plainText(r.attribution, TEXT.attribution) || `"${title}" by ${creator}, ${named}${entry ? ` (${licenceUrl(licence, version)})` : ''}`,
    source: plainText(r.source, TEXT.source), url: https(r.url), landing: https(r.landing),
    seconds: Number.isFinite(r.seconds) && r.seconds > 0 ? +r.seconds.toFixed(3) : null,
    sha256: typeof r.sha256 === 'string' && /^[0-9a-f]{64}$/.test(r.sha256) ? r.sha256 : null,
    bytes: Number.isInteger(r.bytes) && r.bytes > 0 && r.bytes <= FOUND_LIMITS.bytes ? r.bytes : null,
  };
}

/** The file a found sound is kept as: <name>.<ext>, ext from AUDIO_EXTENSIONS. */
export const fileFor = (name, ext) => `${checkFoundName(name, 'fileFor')}.${AUDIO_EXTENSIONS.includes(ext) ? ext : 'invalid'}`;
/** The command that fetches a sound again, for a refusal to name. */
export const addCommand = record => `npx storyreel sounds add ${record?.id && /^[\w-]{1,64}$/.test(record.id) ? record.id : '<id>'} --as ${record?.name ?? '<name>'}`;

/**
 * A film's library: {name: record} from <root>/sounds/sounds.json (inside the root: files.mjs · insideRoot), each record
 * checked (foundRecord); an empty library when there is no such file. A malformed file refuses, naming it.
 */
export function readLibrary(root) {
  const file = insideRoot(root, path.join(SOUNDS_FOLDER, LIBRARY_FILE));
  if (!existsSync(file)) return Object.freeze({});
  if (statSync(file).size > 1024 * 1024) throw new Error(`${SOUNDS_FOLDER}/${LIBRARY_FILE} is over 1 MB: it is not a found-sound library StoryReel wrote — move it aside and add the sounds again (npx storyreel sounds add <id> --as <name>)`);
  let data;
  try { data = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${SOUNDS_FOLDER}/${LIBRARY_FILE} is not JSON (${plainText(e.message, 80)}): fix it, or move it aside and add the sounds again`, {cause: e}); }
  if (!data || typeof data !== 'object' || data.schemaVersion !== 1 || !data.sounds || typeof data.sounds !== 'object' || Array.isArray(data.sounds)) {
    throw new Error(`${SOUNDS_FOLDER}/${LIBRARY_FILE} is not a found-sound library ({"schemaVersion": 1, "sounds": {name: record}}): move it aside and add the sounds again`);
  }
  const out = {};
  for (const [name, record] of Object.entries(data.sounds)) {
    if (!isFoundName(name) || !record || typeof record !== 'object') throw new Error(`${SOUNDS_FOLDER}/${LIBRARY_FILE} has an entry ${JSON.stringify(plainText(name, 40))} that is not a found sound: remove it, or add it again with npx storyreel sounds add <id> --as <name>`);
    out[name] = Object.freeze(foundRecord({...record, name}));
  }
  return Object.freeze(out);
}

/** The library as sounds.json holds it: names in order, two-space JSON, a newline at the end. */
export const libraryText = library => `${JSON.stringify({schemaVersion: 1, sounds: Object.fromEntries(Object.keys(library).sort().map(n => [n, library[n]]))}, null, 2)}\n`;

/** A file's sha256, hex. */
export const sha256Of = bytes => createHash('sha256').update(bytes).digest('hex');

/**
 * A found sound checked for use: in the library, through the gate (its record's own licence), its file inside the root
 * and the record's own (<name>.<ext>, its size and sha256). Returns {name, file (its real path), record}; refuses,
 * naming the `sounds add` command that fixes it.
 */
export function useFound(root, name, {library = readLibrary(root), allowShareAlike = false} = {}) {
  const who = `the found sound "${name}"`;
  const record = Object.hasOwn(library, name) ? library[name] : null;
  if (!record) throw new Error(`${who} is not in ${SOUNDS_FOLDER}/${LIBRARY_FILE}${Object.keys(library).length ? ` (it has ${Object.keys(library).join(', ')})` : ''}: add it with npx storyreel sounds add <id> --as ${name} (find an id with npx storyreel sounds search "<words>")`);
  licenceVerdict(record.license, {allowShareAlike, who});
  const ext = typeof record.file === 'string' ? record.file.slice(record.file.lastIndexOf('.') + 1) : '';
  if (record.file !== `${name}.${ext}` || !AUDIO_EXTENSIONS.includes(ext) || !record.sha256 || !record.bytes) throw new Error(`${who}'s record is not one sounds add wrote (its file must be ${name}.<${AUDIO_EXTENSIONS.join('|')}>, with its sha256 and size): add it again with ${addCommand(record)}`);
  const file = insideRoot(root, path.join(SOUNDS_FOLDER, record.file));
  checkFoundFile(file, record);
  return Object.freeze({name, file, record});
}

/**
 * A found sound's file checked against its record, the one check (useFound when a film is built, the render again just
 * before it mixes the file): there, a file, its size and sha256 the record's. Refuses, naming the sounds add fix.
 */
export function checkFoundFile(file, record) {
  const who = `the found sound "${record.name}"`;
  let stat = null;
  try { stat = statSync(file); } catch { /* missing: said below */ }
  if (!stat?.isFile()) throw new Error(`${who} has no file ${SOUNDS_FOLDER}/${record.file}: add it again with ${addCommand(record)}`);
  if (stat.size !== record.bytes || sha256Of(readFileSync(file)) !== record.sha256) throw new Error(`${who}'s file ${SOUNDS_FOLDER}/${record.file} is not the one its record names (size or sha256 differ): add it again with ${addCommand(record)}`);
  return file;
}

/** The credit lines for the found sounds a film used: each one's attribution, plain, and a line when one is CC BY-SA. */
export function creditLines(records) {
  const lines = records.map(r => `- ${plainText(r.attribution, TEXT.attribution)}`);
  const shareAlike = records.some(r => r.license === 'by-sa');
  return shareAlike ? [...lines, '', 'Because it uses sounds under CC BY-SA, this film is shared under CC BY-SA too (https://creativecommons.org/licenses/by-sa/4.0/).'] : lines;
}
