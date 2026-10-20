/**
 * Found sounds, fetched: the port a sound source fills, and what `npx storyreel sounds` does with one. A source is OUR
 * shape (checkSoundSource), so Openverse (sounds/openverse.mjs) is one adapter and another library could be the next:
 *
 *   {name, search(words, {licences, limit}) → [candidate], candidate(id) → candidate, fetch(candidate, {into, maxBytes}) → {file, bytes, record},
 *    limits?: its rate limits in words, as its last answer reported them}
 *   a candidate: {id, title, creator, license, licenseVersion, seconds, source, attribution, url, landing, bytes}
 *
 * searchSounds asks for the licences the gate lets through (found.mjs · usableLicences). addSound fetches a sound ONCE
 * into the film's sounds/ folder: the gate first (before a byte is fetched), the file into a private scratch folder
 * (scratch.mjs · makeScratch), probed by ffprobe as a separate program (probeAudio: audio, one of AUDIO_EXTENSIONS, at
 * most FOUND_LIMITS.seconds), hashed, renamed onto <name>.<ext> (files.mjs · writeOutput), and its record written into
 * sounds/sounds.json — in a sounds/ folder that is the film's own (files.mjs · outputFolder). A sound already there,
 * file and all, is not fetched again. listSounds reads the library offline and says what each sound's state is.
 */
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {readFileSync, rmSync} from 'node:fs';
import {securePath, outputFolder, writeOutput} from '../files.mjs';
import {makeScratch} from '../scratch.mjs';
import {ffprobeBeside} from '../spawned.mjs';
import {SOUNDS_FOLDER, LIBRARY_FILE, FOUND_LIMITS, AUDIO_EXTENSIONS, LICENCES, checkFoundName, licenceVerdict, usableLicences,
  foundRecord, readLibrary, libraryText, sha256Of, useFound, plainText, shown} from '../found.mjs';

/** A sound source checked: {name, search, candidate, fetch}. */
export function checkSoundSource(source) {
  const missing = ['search', 'candidate', 'fetch'].filter(k => typeof source?.[k] !== 'function');
  if (!source || typeof source.name !== 'string' || !/^[a-z][a-z0-9-]{0,30}$/.test(source.name) || missing.length) {
    throw new Error(`a sound source is {name, search(words, {licences, limit}), candidate(id), fetch(candidate, {into, maxBytes})}${missing.length ? ` (this one has no ${missing.join(', ')})` : ''}: use footprint-storyreel/sounds/openverse, or write one to that shape`);
  }
  return source;
}

/** The words a search takes: 1–200 characters, no control characters. */
function checkWords(words) {
  if (typeof words !== 'string' || !words.trim() || words.length > 200 || !shown(words)) {
    throw new Error(`sounds search takes a few words, 1–200 characters on one line (e.g. "page turn"), not ${JSON.stringify(plainText(words, 40))}`);
  }
  return words.trim();
}

/** Up to `limit` candidates for `words`, under the licences a film may use (CC BY-SA too with allowShareAlike). */
export async function searchSounds(source, words, {limit = 5, allowShareAlike = false} = {}) {
  checkSoundSource(source);
  if (!(Number.isInteger(limit) && limit >= 1 && limit <= 20)) throw new Error(`sounds search --limit is a whole number 1–20, not ${JSON.stringify(limit)}`);
  const licences = usableLicences({allowShareAlike});
  // The source is asked for these licences only; what it answers is held to them again (the gate has one table, not the server's).
  return (await source.search(checkWords(words), {licences, limit})).filter(c => licences.includes(c?.license)).slice(0, limit);
}

/** A licence in words: "CC BY 4.0", or the code made plain when the gate does not know it. */
const licenceText = (licence, version) => `${Object.hasOwn(LICENCES, licence) ? LICENCES[licence].name : plainText(licence, 20)}${version ? ` ${version}` : ''}`;
const secondsText = s => (Number.isFinite(s) ? `${s.toFixed(s < 10 ? 2 : 1)} s` : '? s');
/** One candidate on one line: id · title · licence · seconds · source. */
export const candidateLine = c => [c.id, plainText(c.title, 60) || 'untitled', licenceText(c.license, c.licenseVersion), secondsText(c.seconds), plainText(c.source, 30) || '?'].join(' · ');

/**
 * What ffprobe, run as its own program, says of a file: {ext, seconds} when it is audio StoryReel keeps, else a refusal.
 * Audio means at least one sound stream and no picture (a cover image attached to an MP3 is allowed).
 */
export function probeAudio(file, {ffprobe = process.env.FFPROBE_BIN || ffprobeBeside(process.env.FFMPEG_BIN || 'ffmpeg')} = {}) {
  const r = spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_type:stream_disposition=attached_pic:format=format_name,duration', '-of', 'json', file], {encoding: 'utf8', maxBuffer: 1 << 20, timeout: 30000});
  if (r.error?.code === 'ENOENT') throw new Error(`there is no ffprobe at ${ffprobe}: install FFmpeg (it brings ffprobe), or name one with FFPROBE_BIN`);
  let info = null;
  try { info = r.status === 0 ? JSON.parse(r.stdout) : null; } catch { /* said below */ }
  const streams = Array.isArray(info?.streams) ? info.streams : [], formats = String(info?.format?.format_name ?? '').split(',');
  const ext = AUDIO_EXTENSIONS.find(x => formats.includes(x)), seconds = Number(info?.format?.duration);
  if (!streams.some(s => s.codec_type === 'audio') || streams.some(s => s.codec_type === 'video' && s.disposition?.attached_pic !== 1)) throw new Error('the fetched file is not a sound (ffprobe finds no audio, or a picture): pick another sound');
  if (!ext) throw new Error(`the fetched file is ${plainText(formats.join(','), 40) || 'of no format ffprobe names'}, not one of ${AUDIO_EXTENSIONS.join(', ')}: pick another sound`);
  if (!(seconds > 0 && seconds <= FOUND_LIMITS.seconds)) throw new Error(`the fetched sound is ${Number.isFinite(seconds) ? `${seconds.toFixed(1)} s` : 'of no length ffprobe can read'}; a found sound is up to ${FOUND_LIMITS.seconds} s: pick a shorter sound`);
  return {ext, seconds};
}

/**
 * Fetch the source's sound `id` into <film>/sounds/<as>.<ext> and record it in sounds/sounds.json, once: a sound already
 * there under that name, from the same source and id, with its file as recorded, is not fetched again. Returns
 * {name, record, fetched, file}. `probe` is probeAudio (a test hands in its own).
 */
export async function addSound({source, id, as, film = '.', allowShareAlike = false, probe = probeAudio}) {
  checkSoundSource(source);
  const name = checkFoundName(as, 'sounds add --as'), root = securePath(film);
  const library = readLibrary(root), had = Object.hasOwn(library, name) ? library[name] : null;
  if (had && (had.from !== source.name || had.id !== id)) throw new Error(`${SOUNDS_FOLDER}/${LIBRARY_FILE} already has "${name}" (${had.from} ${had.id}, "${had.title}"): give this one another --as, or remove "${name}" from ${LIBRARY_FILE} first`);
  if (had) {
    try { return {name, record: useFound(root, name, {library, allowShareAlike}).record, fetched: false, file: path.join(root, SOUNDS_FOLDER, had.file)}; } catch { /* missing or changed: fetched again below */ }
  }
  const who = `${source.name} sound ${plainText(id, 64)}`, candidate = await source.candidate(id);
  licenceVerdict(candidate.license, {allowShareAlike, who});   // before a byte of it is fetched
  const folder = outputFolder(root, SOUNDS_FOLDER), scratch = makeScratch(folder, '.storyreel-sound');
  try {
    const got = await source.fetch(candidate, {into: scratch, maxBytes: FOUND_LIMITS.bytes});
    if (path.dirname(path.resolve(got.file)) !== scratch) throw new Error(`the ${source.name} source wrote its file outside the folder it was given: a source writes only into {into}`);   // refusal: a source adapter's bug
    const {ext, seconds} = probe(got.file), bytes = readFileSync(got.file);
    if (bytes.length > FOUND_LIMITS.bytes) throw new Error(`the fetched sound is over ${FOUND_LIMITS.bytes / 1024 / 1024} MB: pick a shorter sound`);
    const record = foundRecord({...candidate, ...got.record, name, file: `${name}.${ext}`, from: source.name, id: candidate.id, seconds, sha256: sha256Of(bytes), bytes: bytes.length});
    licenceVerdict(record.license, {allowShareAlike, who});   // the record's own licence, as it will be read at every use
    writeOutput(path.join(folder, record.file), {move: got.file});
    if (had?.file && had.file !== record.file) rmSync(path.join(folder, had.file), {force: true});   // the old file of this same sound under another extension (foundRecord: only ever <name>.<ext>)
    writeOutput(path.join(folder, LIBRARY_FILE), libraryText({...library, [name]: record}));
    return {name, record, fetched: true, file: path.join(folder, record.file)};
  } finally { rmSync(scratch, {recursive: true, force: true}); }
}

/** The film's found sounds, each with its state: 'ok', or what is wrong and the command that fixes it (read offline). */
export function listSounds(film = '.', {allowShareAlike = false} = {}) {
  const root = securePath(film), library = readLibrary(root);
  return Object.values(library).map(record => {
    try { useFound(root, record.name, {library, allowShareAlike}); return {record, state: 'ok'}; } catch (e) { return {record, state: e.message}; }
  });
}

/** What sounds add did, in one line. */
export const addedText = ({name, record, fetched}) => `${name}: ${SOUNDS_FOLDER}/${record.file} · ${licenceText(record.license, record.licenseVersion)} · ${secondsText(record.seconds)} · "${plainText(record.title, 60)}" by ${plainText(record.creator, 40)}${fetched ? '' : ' (already there, file checked: nothing fetched)'}`;
/** A listed sound in one line: name · licence · seconds · its state. */
export const listedText = ({record, state}) => `${record.name} · ${licenceText(record.license, record.licenseVersion)} · ${secondsText(record.seconds)} · ${state === 'ok' ? 'ok' : state.replace(/^the found sound "[^"]*"\s*/, '')}`;
export {LICENCES, usableLicences, licenceVerdict, plainText, readLibrary, useFound} from '../found.mjs';
