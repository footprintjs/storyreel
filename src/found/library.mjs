/**
 * A film's found-sound library: <root>/sounds/sounds.json and the files beside it. Read through the root (files.mjs ·
 * insideRoot: real paths, so no link leads out), every record checked again (record.mjs · foundRecord); a sound checked
 * for use (useFound: in the library, through the gate, its file the record's size and sha256), and its file checked
 * again just before a render mixes it (checkFoundFile).
 */
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFileSync, statSync, existsSync} from 'node:fs';
import {insideRoot} from '../files.mjs';
import {isFoundName} from './name.mjs';
import {plainText} from './text.mjs';
import {licenceVerdict} from './licences.mjs';
import {foundRecord, addCommand, AUDIO_EXTENSIONS} from './record.mjs';

/** Where a film keeps its found sounds, inside its root, and the record of them. */
export const SOUNDS_FOLDER = 'sounds', LIBRARY_FILE = 'sounds.json';

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
  licenceVerdict(record.license, {allowShareAlike, who, version: record.licenseVersion});
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
