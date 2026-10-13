/** One line of a flowchart's narrative (footprintjs): what a stage did, read or wrote, and each decision with its evidence. */
export interface RecordEntry { type: string; text: string; depth: number; stageId?: string; stageName?: string; runtimeStageId?: string; [key: string]: unknown }

/** A tempo the onsets also fit: its BPM and its score relative to the best (1). */
export interface TempoAlternative { bpm: number; score: number }

/**
 * A song's beat map (beats.mjs · beatMap): its tempo, beats, bars and drop on the song's own clock, how sure it is, and
 * the record of the flowchart that made it — every verdict (the tempo against its alternatives, where the bars start,
 * where the drop is) with its evidence.
 */
export interface BeatMap {
  /** The grid's tempo: a line through the beats (or the one given). */
  readonly bpm: number;
  /** Every beat, seconds, each on the transient it sits on. */
  readonly beats: readonly number[];
  /** Every bar's first beat (a 4/4 guess; the downbeat from low-band onsets). */
  readonly bars: readonly number[];
  /** Where the song drops (the largest sustained rise in low and mid energy after a quieter build), on its beat; null when nothing rises and holds. */
  readonly drop: number | null;
  /** The share of the beats that sit on a measured onset, 0..1. */
  readonly confidence: number;
  /** The tempos the onsets fit, best first: a close second is a doubt worth reading. */
  readonly alternatives: readonly TempoAlternative[];
  /** The song's length. */
  readonly seconds: number;
  /** The flowchart's narrative: decode → onsets → tempo → beats → bars → drop. */
  readonly record: RecordEntry[];
  /** The beat nearest t (the earlier on a tie), or null when there are none. */
  nearestBeat(t: number): number | null;
  /** The first beat after t (strictly later), or null. */
  nextBeat(t: number): number | null;
  /** Whether a beat lies within `tolerance` seconds of t (0.05 by default). */
  onBeat(t: number, tolerance?: number): boolean;
}
/** bpm and drop override the measured ones; range is the tempos preferred ([70, 180]); ffmpeg names the FFmpeg to read with. */
export interface BeatMapOptions { bpm?: number | null; drop?: number | null; range?: [number, number]; ffmpeg?: string }

/** The beat map's rules: the preferred tempos, the margins a verdict needs, the meter, the drop's dB, its window, onBeat's tolerance. */
export const BEATS: Readonly<{range: readonly [number, number]; clear: number; meter: number; downbeat: number; drop: number; window: number; onBeat: number}>;
/** A song's beat map, read through FFmpeg (any audio it reads). */
export function beatMap(audioFile: string, options?: BeatMapOptions): Promise<BeatMap>;
/** The same from mono samples at 22050 Hz (-1..1). */
export function beatMapOf(samples: Float32Array, rate: 22050, options?: Omit<BeatMapOptions, 'ffmpeg'>): Promise<BeatMap>;
/** The moment of a sound's loudest transient, seconds from its start: start it at `eventTime - peakOf(file)`. */
export function peakOf(soundFile: string, options?: {ffmpeg?: string}): number;
/** The same from mono samples in hand. */
export function peakOfSamples(samples: ArrayLike<number>, rate: number, options?: {window?: number}): number;
