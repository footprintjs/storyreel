/**
 * Found sounds (footprint-storyreel/sounds): recorded sound effects fetched once into a film's sounds/ folder through a
 * sound source (footprint-storyreel/sounds/openverse), recorded in sounds/sounds.json, read offline by every render.
 */

/** A sound a source offers: its id there, plain words, licence, length and where it comes from. */
export interface SoundCandidate {
  id: string; title: string; creator: string; license: string; licenseVersion: string; seconds: number | null;
  source: string; attribution: string; url: string | null; landing: string | null; bytes: number | null;
}
/** A sound source, in StoryReel's own shape: Openverse is one adapter (footprint-storyreel/sounds/openverse). */
export interface SoundSource {
  name: string;
  search(words: string, options: {licences: string[]; limit: number}): Promise<SoundCandidate[]>;
  candidate(id: string): Promise<SoundCandidate>;
  /** The candidate's file, written only into `into` (a folder StoryReel made for it), at most maxBytes. */
  fetch(candidate: SoundCandidate, options: {into: string; maxBytes: number}): Promise<{file: string; bytes: number; record: Partial<SoundCandidate>}>;
  /** Its rate limits in words, as its last answer reported them. */
  readonly limits?: string | null;
}
/** A found sound's record in sounds/sounds.json: every text made plain, the licence URL built from the code and version. */
export interface FoundRecord {
  name: string; file: string; from: string; id: string; title: string; creator: string;
  license: string; licenseVersion: string | null; licenseUrl: string | null; attribution: string;
  source: string; url: string | null; landing: string | null; seconds: number | null; sha256: string | null; bytes: number | null;
}
/** The licence gate's table: 'yes', 'share-alike' (only with allowShareAlike), or 'no' with why. */
export const LICENCES: Readonly<Record<string, {name: string; use: 'yes' | 'share-alike' | 'no'; why?: string}>>;
/** The licence codes a film may use (CC BY-SA too with allowShareAlike). */
export function usableLicences(options?: {allowShareAlike?: boolean}): string[];
/** The gate: the licence, or a refusal that says why and what to do. */
export function licenceVerdict(licence: string, options?: {allowShareAlike?: boolean; who?: string}): {licence: string; name: string; shareAlike: boolean};
/** Text from a source made plain: control and bidi characters removed, one line, at most `max` characters. */
export function plainText(value: unknown, max: number): string;
/** A film's library, {name: record}, from <root>/sounds/sounds.json (empty when there is none). */
export function readLibrary(root: string): Readonly<Record<string, Readonly<FoundRecord>>>;
/** A found sound checked for use: in the library, through the gate, its file inside the root with the record's size and sha256. */
export function useFound(root: string, name: string, options?: {allowShareAlike?: boolean}): Readonly<{name: string; file: string; record: FoundRecord}>;
/** A source checked to be {name, search, candidate, fetch}. */
export function checkSoundSource<S extends SoundSource>(source: S): S;
/** Up to `limit` (1–20, 5) candidates for the words, under the licences a film may use. */
export function searchSounds(source: SoundSource, words: string, options?: {limit?: number; allowShareAlike?: boolean}): Promise<SoundCandidate[]>;
/** One candidate on one line: id · title · licence · seconds · source. */
export function candidateLine(candidate: SoundCandidate): string;
/** ffprobe's word on a file: {ext, seconds} for audio StoryReel keeps, else a refusal. */
export function probeAudio(file: string, options?: {ffprobe?: string}): {ext: 'mp3' | 'wav' | 'ogg' | 'flac'; seconds: number};
/** Fetch a sound once into <film>/sounds/<as>.<ext> and record it; a sound already there, file checked, is not fetched again. */
export function addSound(options: {source: SoundSource; id: string; as: string; film?: string; allowShareAlike?: boolean; probe?: typeof probeAudio}): Promise<{name: string; record: FoundRecord; fetched: boolean; file: string}>;
/** The film's found sounds, each with its state: 'ok', or what is wrong and the command that fixes it. */
export function listSounds(film?: string, options?: {allowShareAlike?: boolean}): {record: FoundRecord; state: string}[];
export function addedText(added: {name: string; record: FoundRecord; fetched: boolean}): string;
export function listedText(listed: {record: FoundRecord; state: string}): string;
