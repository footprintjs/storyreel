import type {VideoProbe} from '../index.js';

/** The thresholds the verdicts use (grey differences and spreads are mean grey levels, 0–255, on frames read `width` wide). */
export interface BreakdownThresholds {
  width: number; cutJump: number; cutRatio: number; flashLasting: number; blank: number; minFade: number; maxFade: number; maxHold: number;
  gradualFloor: number; gradualFrames: number; minChange: number; coherence: number; mix: number; moved: number; maxGradual: number;
  stillCell: number; minPan: number; explained: number; share: number; textArea: number; logoShots: number; logoShare: number; onBeat: number; closeTempo: number; stillWidth: number; maxCandidates: number;
}
export const BREAKDOWN: Readonly<BreakdownThresholds>;

/** A verdict's evidence, short: the verdict, the rule that gave it, and every rule tried with its checks ("jump 54.7 ≥ 12 ✓"). */
export interface Why {verdict: string; because: string; rules: {then: string; met: boolean; checks: string[]; error?: string}[]}

/** A tempo the beats also fit, and its score against the best (1). */
export interface BeatTempo {bpm: number; score: number}
/**
 * What a beat map answers (beats.mjs · beatMap's map fits it as it is): beats a minute, every beat (seconds into the sound),
 * the drop (or null), and — when it says them — how sure it is and the other tempos the beats fit, best first.
 */
export interface BeatMapAnswer {readonly bpm: number; readonly beats: readonly number[]; readonly drop?: number | null; readonly confidence?: number; readonly alternatives?: readonly BeatTempo[]}
/**
 * Reads the beats of a sound: handed a WAV of the video's sound (in a folder removed after it answers), with the breakdown's
 * `beatOptions` and the FFmpeg it runs. One that throws (a silent track, no tempo) leaves the beats unread, saying why;
 * one that throws an error with `code: 'BEAT_OPTIONS'` (its options are wrong) makes the breakdown refuse.
 */
export type BeatReader = (audioFile: string, options: BeatOptions & {ffmpeg: string}) => BeatMapAnswer | Promise<BeatMapAnswer>;

/**
 * The beat map's own options (beats.mjs · beatMap takes {bpm, drop, range}): the breakdown hands them on untouched, with its
 * FFmpeg, and never checks their names or values — the reader does. A reader that finds them wrong throws an error with
 * `code: 'BEAT_OPTIONS'`, and the breakdown refuses with it; any other error the reader throws is a sound it could not
 * read, recorded as not run.
 */
export type BeatOptions = Record<string, unknown>;

export type TransitionKind = 'cut' | 'dissolve' | 'dip' | 'fade-in' | 'fade-out';
/**
 * A transition: a cut on its frame; a gradual one from `from` to `to`, at its middle (a lone fade where it meets its
 * colour's hold). A fade that opens or closes the film splits no shot.
 */
export interface BreakdownTransition {kind: TransitionKind; at: number; frame: number; from?: number; to?: number; seconds?: number; opens?: true; closes?: true; why: Why}
/** How a shot begins or ends: the transition there (others on the same frame are `also`), or the film's own start or end. */
export interface ShotEdge {kind: TransitionKind | 'start' | 'end'; at?: number; seconds?: number; also?: TransitionKind[]}
export interface BreakdownShot {
  index: number; start: number; end: number; seconds: number; in: ShotEdge; out: ShotEdge;
  /** one colour all through (a slug of black between two shots, a colour card) */ blank?: true;
  /** still, the camera moves (the whole picture shifts together; camera is null when it nets out to no one direction), or things move inside the frame; the grid is 4 rows of 6 cells, the mean change in each */
  motion: {verdict: 'still' | 'camera' | 'inside'; words: string; camera?: 'left' | 'right' | 'up' | 'down' | null; energy: number; busiest: number; share: number; pan: number; explained: number; grid: number[][]; why: Why};
  /** lettered or not: a heuristic (rows of sharp strokes in lines), never OCR; mark is the film's logo (a corner mark in several shots) left out */
  text: {verdict: 'text' | 'no-text'; area: number; mark: number; why: Why};
  /** the shot's contact sheet, relative to the out folder */ sheet: string;
}
export interface BeatCut {at: number; kind: TransitionKind; beat: number | null; off: number | null; onBeat: boolean}
export type BreakdownBeats = {ran: false; why: string}
  | {ran: true; bpm: number; confidence?: number; alternatives?: BeatTempo[]; close?: BeatTempo; beats: number[]; drop: {at: number; shot: number; nearestCut: BeatCut | null} | null; cuts: BeatCut[]; onBeat: number; of: number; within: number};

/** What breakdown.json holds. */
export interface BreakdownSpec {
  schemaVersion: 1; file: string; made: string;
  /** fps: the average frame rate; rate: the one read at; width and height as the picture is shown (rotation applied); variable: the rates differ; lengthFrom: 'frames' when the file names no length */
  video: {seconds: number; lengthFrom?: 'frames'; fps: number; rate: number; width: number; height: number; rotation?: number; frames: number; sound: boolean; variable?: true};
  /** why: the decision on the rate read at (the nominal, or the average) */
  read: {width: number; height: number; rate: number; frames: string; why: Why};
  /** what the reader should know before trusting the times (a varying frame rate) */ warnings: string[];
  shots: BreakdownShot[];
  transitions: BreakdownTransition[];
  flashes: {at: number; frame: number; why: Why}[];
  pacing: {shots: number; median: number; mean: number; shortest: {seconds: number; shot: number}; longest: {seconds: number; shot: number}; cutsPerMinute: number; transitions: Partial<Record<TransitionKind, number>>};
  motion: {shots: {still: number; camera: number; inside: number}; grid: number[][]; curve: {t: number; energy: number}[]};
  text: {heuristic: string; shots: number[]};
  audio: {sound: boolean; beats: BreakdownBeats};
  sheets: {overview: string; shots: string[]};
  considered: {cuts: Record<string, number>; gradual: Record<string, number>};
  thresholds: BreakdownThresholds; record: string;
}

export interface BreakdownOptions {
  /** the folder written (default: <video name>-breakdown in the working folder) */ out?: string;
  beatMap?: BeatReader | null;
  /** the beat map's own options, handed on untouched with ffmpeg; only the reader's error coded BEAT_OPTIONS refuses (BeatOptions) */
  beatOptions?: BeatOptions;
  /** the FFmpeg run for frames, stills and sound (FFMPEG_BIN, or the one on the PATH): 5.1 or later */ ffmpeg?: string;
  /** the adapter that reads the file (finished.mjs · ffmpegProbe) */ probe?: VideoProbe;
  thresholds?: Partial<BreakdownThresholds>;
}

/**
 * A reference video broken down into a spec to match: the shots, the cuts and their kinds, the pacing, where the motion
 * lives, lettering (a heuristic), the cuts against the beats. Writes breakdown.json, breakdown.md, a contact sheet per
 * shot, overview.png and record.json (the breakdown's footprintjs record: every verdict a decision with its evidence).
 */
export function breakdown(videoFile: string, options?: BreakdownOptions): Promise<{spec: BreakdownSpec; text: string; record: unknown[];
  files: {json: string; md: string; record: string; overview: string; sheets: string[]}}>;
/** The spec in plain words, as breakdown.md holds it. */
export function breakdownText(spec: BreakdownSpec): string;
