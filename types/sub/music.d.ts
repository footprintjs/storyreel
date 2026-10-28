import type {Storyboard, Timings} from '../index.js';
import type {RecordEntry} from './beats.js';

/** A key: a moment of the film named by what is said there, ["scene", "phrase", plus?]. */
export type KeyMoment = [scene: string, phrase: string, plus?: number];
/** Scene starts onto the beat: true (the default tolerance), false (off: the default), or {tolerance}: the most a scene's length changes, 0.01–0.5 s. */
export type Snap = boolean | {tolerance?: number};

/** makeFilm's `music`: the song, its level, the snapping, the key its drop lands on, and overrides for its beat map. */
export interface MusicOptions {
  /** The song (any audio FFmpeg reads). */
  file: string;
  /** Its level under the voice, 0..1 of its own (0.2). */
  gain?: number;
  /** Scene starts moved onto its beats (off by default). */
  snap?: Snap;
  /** The moment of the film its drop lands on: the song starts where that puts it. */
  dropOn?: KeyMoment | null;
  /** The song's tempo, overriding the measured one. */
  bpm?: number;
  /** The second the song drops, overriding the measured one. */
  drop?: number;
  /** Seconds it fades out over at the film's end (1.5). */
  fadeOut?: number;
}
/** renderFilm's `music`: where the song plays on the film clock (`start`: negative begins it that far in), its level, its fade. */
export interface SongPlacement { file: string; start?: number; gain?: number; fadeOut?: number }

/**
 * One cut's verdict: moved onto a beat (`by` seconds, against the song), already on one, held by the drop, or kept, and
 * why; `drift`: how far the cut now sits from where it was, against the film's start or the key moment (the moves add up).
 */
export interface MusicCut { scene: string; verdict: 'moved' | 'on-beat' | 'held' | 'kept'; by: number; beat: number | null; drift: number; why: string; at: number }

/** The music's rules: the default tolerance, the silence kept after a shortened scene's last word or key, a page hand-over's lead, the gain, the fade, on-beat closeness. */
export const MUSIC: Readonly<{tolerance: number; clear: number; handOver: number; gain: number; fadeOut: number; onBeat: number; /** music first: the most bars a scene lasts (64) */ mostBars: number; /** the most beats between two words (8) */ mostEvery: number}>;
/** The grid a fit cut on (beats.mjs · safeBeats): every beat of a sure map, or only the beats every candidate of an unsure one shares (`beats` of `of` kept), or none when a candidate is unsure of its phase. */
export interface MusicCutOn { grid: 'every beat' | 'shared' | 'none: a candidate is unsure of its phase'; beats: number; of: number; tempi: readonly number[]; unsure?: readonly number[] }
/** Music first: timings from a song — each scene whole bars, its words on its beats, its beats carried for clock.beats; start places the song for renderFilm. */
export function beatTimings(storyboard: Storyboard, beats: {beats: readonly number[]; bars: readonly number[]; sure?: boolean; verdict?: string},
  options?: {bars?: number | Record<string, number>; from?: number; every?: number}): {timings: Timings; start: number; from: number; bars: {scene: string; bars: number; seconds: number}[]};
/**
 * Fit a film to a song: scene starts onto a beat within the tolerance — each scene's length changed by at most it, and
 * never below its last word, its latest keyed moment or the lead of the entrance after it (give the recipe and kits) —
 * the song started so its drop lands on `dropOn`. Of two beats within the tolerance, the one that brings the drift back.
 * Only the scenes' lengths change. A key outside the film, a drop past the song's end (`beats.seconds`) or a song that
 * would never play refuses. `record` is the fit's flowchart narrative.
 */
export function fitToMusic(options: {storyboard: Storyboard; timings: Timings; beats: {beats: readonly number[]; drop?: number | null; seconds?: number; sure?: boolean; bpm?: number; alternatives?: readonly {bpm: number; beats?: readonly number[]; phaseDoubt?: number}[]}; snap?: Snap; dropOn?: KeyMoment | null; recipe?: import('../index.js').Recipe | null; kits?: unknown[]}): Promise<{timings: Timings; start: number; cuts: MusicCut[]; cutOn: MusicCutOn; record: RecordEntry[]}>;
/** A voiced cut fitted: each moved scene's 16-bit PCM WAV in `runDir` (a copy of the voice) padded or cut short to its new length. */
export function fitVoice(runDir: string, before: Timings, after: Timings): Timings;
