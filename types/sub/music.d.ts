import type {Storyboard, Timings} from '../index.js';
import type {RecordEntry} from './beats.js';

/** A key: a moment of the film named by what is said there, ["scene", "phrase", plus?]. */
export type KeyMoment = [scene: string, phrase: string, plus?: number];
/** Scene starts onto the beat: true (the default tolerance), false, or {tolerance}: the most a cut moves, 0.01–0.5 s. */
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

/** One cut's verdict: moved onto a beat (by seconds, against the song), already on one, held by the drop, or kept, and why. */
export interface MusicCut { scene: string; verdict: 'moved' | 'on-beat' | 'held' | 'kept'; by: number; beat: number | null; why: string; at: number }

/** The music's rules: the default tolerance, the silence kept after a shortened scene's last word, the gain, the fade, on-beat closeness. */
export const MUSIC: Readonly<{tolerance: number; clear: number; gain: number; fadeOut: number; onBeat: number}>;
/**
 * Fit a film to a song: scene starts onto the nearest beat within the tolerance (never more, never past a spoken word),
 * the song started so its drop lands on `dropOn`. Only the scenes' lengths change. `record` is the fit's flowchart narrative.
 */
export function fitToMusic(options: {storyboard: Storyboard; timings: Timings; beats: {beats: readonly number[]; drop?: number | null}; snap?: Snap; dropOn?: KeyMoment | null}): Promise<{timings: Timings; start: number; cuts: MusicCut[]; record: RecordEntry[]}>;
/** A voiced cut fitted: each moved scene's 16-bit PCM WAV in `runDir` (a copy of the voice) padded or cut short to its new length. */
export function fitVoice(runDir: string, before: Timings, after: Timings): Timings;
