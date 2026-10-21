/**
 * A found sound's record, as sounds/sounds.json keeps it (foundRecord): every field checked or made plain, whether it
 * is written after a fetch or read back from a file anyone may have edited. A record never names a path: its file is
 * <name>.<ext> or nothing.
 */
import {isFoundName} from './name.mjs';
import {plainText, shown} from './text.mjs';
import {LICENCES, licenceName, licenceUrl, licenceVersion} from './licences.mjs';

/** The most a found sound's file may hold, and its longest length: an effect, not a song. */
export const FOUND_LIMITS = Object.freeze({bytes: 20 * 1024 * 1024, seconds: 300});
/** The audio files a found sound is kept as (the extension comes from probing the file, never from the server's name). */
export const AUDIO_EXTENSIONS = Object.freeze(['mp3', 'wav', 'ogg', 'flac']);
/** FFmpeg's and ffprobe's input options for a found sound: read it as a local file, as one of AUDIO_EXTENSIONS, nothing else (a playlist inside cannot make them fetch). */
export const AUDIO_ONLY = Object.freeze(['-protocol_whitelist', 'file', '-format_whitelist', AUDIO_EXTENSIONS.join(',')]);
/** How long each of a record's texts may be. */
export const TEXT = Object.freeze({title: 120, creator: 80, attribution: 400, source: 40, id: 64});

/** An https URL as a URL parses it (one line, nothing unshown), or null. */
function https(v) {
  if (typeof v !== 'string' || v.length > 2000 || !shown(v) || /\s/.test(v)) return null;
  try { const url = new URL(v); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}

/** `from` is the source ('openverse'), `id` its id, `source` the site the sound came from there. */
export function foundRecord(r) {
  const licence = typeof r.license === 'string' ? r.license : '', version = licenceVersion(r.licenseVersion), known = Object.hasOwn(LICENCES, licence);
  const title = plainText(r.title, TEXT.title) || 'untitled', creator = plainText(r.creator, TEXT.creator) || 'unknown', deed = licenceUrl(licence, version);
  const file = typeof r.file === 'string' && isFoundName(r.name) && AUDIO_EXTENSIONS.some(x => r.file === `${r.name}.${x}`) ? r.file : null;
  return {
    name: r.name, file, from: plainText(r.from, TEXT.source), id: plainText(r.id, TEXT.id), title, creator,
    license: licence, licenseVersion: version, licenseUrl: deed,
    attribution: plainText(r.attribution, TEXT.attribution) || `"${title}" by ${creator}, ${licenceName(licence, version)}${known ? ` (${deed})` : ''}`,
    source: plainText(r.source, TEXT.source), url: https(r.url), landing: https(r.landing),
    seconds: Number.isFinite(r.seconds) && r.seconds > 0 ? +r.seconds.toFixed(3) : null,
    sha256: typeof r.sha256 === 'string' && /^[0-9a-f]{64}$/.test(r.sha256) ? r.sha256 : null,
    bytes: Number.isInteger(r.bytes) && r.bytes > 0 && r.bytes <= FOUND_LIMITS.bytes ? r.bytes : null,
  };
}

/**
 * A found sound event's trim checked against its recording (record.seconds, as ffprobe measured it at add): {from, to}
 * in seconds, `to` null for the recording's end. The shape (numbers, to after from) is sound.mjs · checkSound's.
 */
export function trimOf(event, record) {
  const who = `the found sound "${record.name}"`, length = record.seconds, from = event.from ?? 0, to = event.to ?? null;
  if (length !== null && from >= length) throw new Error(`${who} is ${length.toFixed(2)} s long, and its "from" (${from}) is past its end: give "from" under ${length.toFixed(2)}`);
  if (length !== null && to !== null && to > length + .005) throw new Error(`${who} is ${length.toFixed(2)} s long, and its "to" (${to}) is past its end: give "to" at most ${length.toFixed(2)}, or leave it out to play to the end`);
  return {from, to: to ?? length};
}

/** The command that fetches a sound again, for a refusal to name. */
export const addCommand = record => `npx storyreel sounds add ${record?.id && /^[\w-]{1,64}$/.test(record.id) ? record.id : '<id>'} --as ${isFoundName(record?.name) ? record.name : '<name>'}`;
