/** One line of a flowchart's narrative (footprintjs): what a stage did, read or wrote, and each decision with its evidence. */
export interface RecordEntry { type: string; text: string; depth: number; stageId?: string; stageName?: string; runtimeStageId?: string; [key: string]: unknown }

/**
 * A tempo the onsets also fit: its BPM, its score relative to the best (1), its own grid of beats, and its phase doubt —
 * the onset strength half a beat off its grid against the strength on it (near 1 or above: the grid may sit on the "and").
 */
export interface TempoAlternative { readonly bpm: number; readonly score: number; readonly phaseDoubt: number; readonly beats: readonly number[] }

/** How the map chose its tempo: measured and certain, a faster or slower level certain, unsure (close), or given. */
export type TempoVerdict = 'tempo-measured' | 'tempo-faster' | 'tempo-slower' | 'tempo-close' | 'tempo-given';

/**
 * A song's beat map (beats.mjs · beatMap): its tempo, beats, bars and drop on the song's own clock, how sure it is, and
 * the record of the flowchart that made it — every verdict (the tempo against its alternatives, where the bars start,
 * where the drop is) with its evidence.
 */
export interface BeatMap {
  /** The grid's tempo: a line through the beats (or the one given). */
  readonly bpm: number;
  /** How the tempo was chosen; `tempo-close` when no single level of the beat passes both tests. */
  readonly verdict: TempoVerdict;
  /** False exactly when the verdict is `tempo-close`: cut only on safeBeats(map), the beats every candidate shares. */
  readonly sure: boolean;
  /** Every beat, seconds, each on the transient it sits on. */
  readonly beats: readonly number[];
  /** Where the song actually hits (dsp.mjs · hitsOf): attacks in the low or mid band, no echo — an unsure map cuts only on a shared beat with one. */
  readonly hits: readonly number[];
  /** Every bar's first beat (a 4/4 guess; the downbeat from low-band onsets). */
  readonly bars: readonly number[];
  /** Where the song drops (the largest sustained rise in low and mid energy after a quieter build, arriving at once), on its beat; null when nothing rises and holds, or the rise is a fade-in. */
  readonly drop: number | null;
  /** The share of the beats that sit on a measured onset, 0..1. */
  readonly confidence: number;
  /** The tempos the onsets fit, best first (up to eight): when the record says `tempo-close`, the right one is likely among them. */
  readonly alternatives: readonly TempoAlternative[];
  /** Every level of the beat tried (a quarter to four times the strongest), its score, and the tests it fails (`levelTests`): certain only when exactly one fails none. */
  readonly levels: readonly BeatLevel[];
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

/**
 * One level of the beat tried: its BPM, its score among the candidates (0 when it is none), the tests it fails ([] passes),
 * and `kicksAlone` when the kicks alone refused it (refusedByKicksAlone) — then no other level may be certain.
 */
export interface BeatLevel { readonly bpm: number; readonly score: number; readonly fails: readonly string[]; readonly kicksAlone?: true }
/**
 * The tests a level must pass to be certain (levelTests): a kick pulse of at least `pulse` hits (phase, kicked, no kick
 * between) and the in-betweens (steady, no subdivision filled, nothing filled anywhere between, not a half-time
 * backbeat covering at most `halfTime` of the beats), and the score margin when there is no kick pulse.
 */
export interface LevelRules { pulse: number; phase: number; kicked: number; low: number; steady: number; fill: {2: number; 3: number; 4: number; any: number}; halfTime: number; margin: number }
/**
 * What safeBeats keeps: beats within `tolerance` seconds on every candidate's grid, none when a candidate's phase doubt
 * reaches `phaseDoubt`, and only where the song hits — an attack at least `hit` of the median one on the beats, the
 * strongest within `local` of a beat either side.
 */
export interface SafeRules { tolerance: number; phaseDoubt: number; hit: number; local: number }
/** The beat map's rules: the preferred tempos, the meter, the downbeat's margin, the drop's dB and window, what makes a fade-in, onBeat's tolerance, the score of a likely tempo, safeBeats' rules, the level tests. */
export const BEATS: Readonly<{range: readonly [number, number]; meter: number; downbeat: number; drop: number; window: number; fade: number; sudden: number; onBeat: number; likely: number; safe: Readonly<SafeRules>; level: Readonly<LevelRules>}>;
/** The evidence one level is judged on (dsp.mjs · levelEvidence): the backbeat's share on its beats, the share of its beats that carry it, and how often the next one is two beats on. */
export interface LevelEvidence { phase: number | null; kicked: number | null; steady: number; backbeat?: {phase: number; covered: number; alternate: number} | null; fill: Record<2 | 3 | 4, {full: number; low: number}> & {any?: {full: number}} }
/** A backbeat on every other beat of a level (2 and 4): that level is the tactus, and no faster one may be certain. */
export function backbeatEveryOther(evidence: LevelEvidence | null | undefined, rules?: LevelRules): boolean;
/** The tests one level of the beat fails (none: it passes), from its evidence (dsp.mjs · levelEvidence) and the other levels tried ('margin', 'backbeat slower'). */
export function levelTests(level: {bpm: number; score: number; evidence: LevelEvidence; masked?: LevelEvidence}, all: {bpm?: number; score: number; evidence?: LevelEvidence}[], rules?: LevelRules): string[];
/** Whether a level was refused by the kicks alone: its only failures are kick tests, and its in-betweens with the kicks masked pass. */
export function refusedByKicksAlone(level: {fails: readonly string[]; masked?: LevelEvidence; evidence: LevelEvidence; bpm: number; score: number}, rules?: LevelRules): boolean;

/**
 * The beats a film may cut on (the product rule): a sure map, every beat; an unsure (`tempo-close`) one, only the beats
 * every listed candidate's grid shares, and none when any candidate is unsure of its phase. A map without `sure` (a
 * hand-made list of beats) is taken as sure.
 */
export interface SafeBeats {
  readonly beats: readonly number[];
  readonly grid: 'every beat' | 'shared' | 'none: a candidate is unsure of its phase';
  /** How many beats were kept, of how many the map holds. */
  readonly shared: number;
  readonly of: number;
  /** The candidates' tempi the beats were checked against. */
  readonly tempi: readonly number[];
  /** The tempi unsure of their phase, when that left no beat. */
  readonly unsure?: readonly number[];
  /** The beats every candidate shares where the song does not hit (dropped), when the map has its hits. */
  readonly unheard?: number;
}
export function safeBeats(map: {beats: readonly number[]; sure?: boolean; hits?: readonly number[]; alternatives?: readonly {bpm: number; beats?: readonly number[]; phaseDoubt?: number}[]}, options?: {tolerance?: number; doubt?: number}): SafeBeats;
/** The tempi an unsure map could be: its candidates scoring at least `least` (BEATS.likely), whole BPM, strongest first; a sure map's own. */
export function likelyTempi(map: {sure?: boolean; bpm?: number; alternatives?: readonly {bpm: number; score: number}[]}, least?: number): number[];
/** The map as text for a person settling its tempo (`storyreel beats <song>`): the verdict, the candidate tempi and scores, every level tried and why, how to settle it. */
export function beatMapText(map: BeatMap | {sure: boolean; verdict: string; bpm: number; seconds: number; beats: readonly number[]; drop?: number | null; alternatives?: readonly {bpm: number; score: number}[]; levels?: readonly BeatLevel[]}, options?: {source?: string}): string;

/** An error for the caller's options (an unknown key, a value out of range, a drop past the song's end, samples not mono Float32 at 22050 Hz): `code` is 'BEAT_OPTIONS'. An error reading the sound carries no such code. */
export interface BeatOptionsError extends Error { code: 'BEAT_OPTIONS' }
/** A song's beat map, read through FFmpeg (any audio it reads). Bad options reject with a BeatOptionsError. */
export function beatMap(audioFile: string, options?: BeatMapOptions): Promise<BeatMap>;
/** The same from mono samples at 22050 Hz (-1..1). */
export function beatMapOf(samples: Float32Array, rate: 22050, options?: Omit<BeatMapOptions, 'ffmpeg'>): Promise<BeatMap>;
/** The moment of a sound's loudest transient, seconds from its start: start it at `eventTime - peakOf(file)`. */
export function peakOf(soundFile: string, options?: {ffmpeg?: string}): number;
/** The same from mono samples in hand. */
export function peakOfSamples(samples: ArrayLike<number>, rate: number, options?: {window?: number}): number;
