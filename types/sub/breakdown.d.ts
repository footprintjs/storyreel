import type {VideoProbe} from '../index.js';

/** The thresholds the verdicts use (grey differences and spreads are mean grey levels, 0–255, on frames read `width` wide). */
export interface BreakdownThresholds {
  width: number; cutJump: number; cutRatio: number; flashLasting: number; /** a flash lasts at most this long (s, 0.1) */ maxFlash: number; blank: number; minFade: number; maxFade: number; maxHold: number;
  gradualFloor: number; gradualFrames: number; minChange: number; coherence: number; mix: number; moved: number; maxGradual: number;
  stillCell: number; minPan: number; explained: number; share: number; textArea: number; logoShots: number; logoShare: number; onBeat: number; closeTempo: number; stillWidth: number; maxCandidates: number;
}
export const BREAKDOWN: Readonly<BreakdownThresholds>;

/** A verdict's evidence, short: the verdict, the rule that gave it, and every rule tried with its checks ("jump 54.7 ≥ 12 ✓"). */
export interface Why {verdict: string; because: string; rules: {then: string; met: boolean; checks: string[]; error?: string}[]}

/** A tempo the beats also fit, and its score against the best (1). */
export interface BeatTempo {bpm: number; score: number}
/** A candidate tempo as a beat map may give it: with its own grid and how unsure it is of its phase (beats.mjs · TempoAlternative), read by safeBeats. */
export interface BeatCandidate extends BeatTempo {beats?: readonly number[]; phaseDoubt?: number}
/**
 * What a beat map answers (beats.mjs · beatMap's map fits it as it is): beats a minute, every beat (seconds into the sound),
 * the drop (or null), and — when it says them — how sure it is and the other tempos the beats fit, best first.
 */
export interface BeatMapAnswer {readonly bpm: number; readonly beats: readonly number[]; readonly drop?: number | null; readonly confidence?: number; readonly alternatives?: readonly BeatCandidate[];
  /** How the map chose its tempo, whether it is sure, and where the song hits: an unsure map's cuts are judged only against beats.mjs · safeBeats. */
  readonly verdict?: string; readonly sure?: boolean; readonly hits?: readonly number[]}
/**
 * Reads the beats of a sound: handed the video file itself (it reads the sound; beats.mjs · beatMap decodes it at 22050 Hz
 * mono), with the breakdown's `beatOptions` and the FFmpeg it runs. One that throws (a silent track, no steady beat) leaves the beats unread, saying why;
 * one that throws an error with `code: 'BEAT_OPTIONS'` (its options are wrong) makes the breakdown refuse.
 */
export type BeatReader = (videoFile: string, options: BeatOptions & {ffmpeg: string}) => BeatMapAnswer | Promise<BeatMapAnswer>;

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
/**
 * A cut against the beats it is judged by (safeBeats): on one, off them (a sure map), or not judged (null: an unsure map,
 * no beat every candidate shares near it; or `music: false`, no music playing there — beats.mjs · musicAt).
 */
export interface BeatCut {at: number; kind: TransitionKind; beat: number | null; off: number | null; onBeat: boolean | null; music?: false}
export type BreakdownBeats = {ran: false; why: string}
  | {ran: true; bpm: number; verdict?: string; sure: boolean; confidence?: number; alternatives?: BeatTempo[]; close?: BeatTempo; likely?: number[];
     /** the beats the cuts were judged against (beats.mjs · safeBeats): every beat, the shared ones, or none */ judged: {grid: string; beats: number; of: number};
     /** maybe: an unsure map's drop, not stated as fact */
     beats: number[]; drop: {at: number; maybe?: true; shot: number; nearestCut: BeatCut | null} | null; cuts: BeatCut[]; onBeat: number; unjudged?: number; noMusic?: number; of: number; within: number};

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
  /** each flash once: its first frame, and how long it lasts in frames of the rate read */
  flashes: {at: number; frame: number; frames: number; why: Why}[];
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
  /** how a fix is worded in the spec: 'api' (the default: an option of breakdown()) or 'cli' (a flag of storyreel breakdown, e.g. "add --bpm n") */
  hints?: 'api' | 'cli';
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

/** The thresholds the remake plan's choices use. */
export interface RemakeThresholds {
  /** seconds: a shot shorter than this is quick; quick shots joined by hard cuts are one scene (1) */ quick: number;
  /** a scene with this share of its shots lettered, or more, is words: kinetic type or a title (0.5) */ lettered: number;
  /** seconds: half the shots shorter than this cut at a promo's pace (1.5) */ promoMedian: number;
  /** cuts a minute: this many or more is a promo's pace (30) */ promoCuts: number;
  /** this share of the judged cuts on a beat, or more: the film is cut to its song (0.5) */ onBeat: number;
}
export const REMAKE: Readonly<RemakeThresholds>;
/** What a scene is: kinetic type (a word a shot), a montage (a picture a shot), plain ground, a title, a still, a camera move, a moving picture. */
export type SceneKind = 'kinetic' | 'montage' | 'blank' | 'title' | 'still' | 'camera' | 'moving';
export const SCENE_KINDS: readonly SceneKind[];
/** How a scene comes in, as a stage's `enter` names it: a transition's name, or one with its seconds. */
export type RemakeEntrance = 'cut' | 'fade' | 'dip' | {type: 'fade' | 'dip'; seconds: number};
export interface RemakeScene {
  id: string; from: number; to: number; seconds: number;
  /** the reference's shots it stands for (their index) */ shots: number[];
  /** when each of its shots starts (film seconds, one a shot): where a starter lands its cards */ starts: number[];
  kind: SceneKind; why: Why;
  /** how the reference's first shot of it comes in */ in: ShotEdge['kind'];
  /** null: the first scene, which a film starts on */ enter: RemakeEntrance | null; enterWhy: string;
  /** the flashes inside it (seconds) */ flashes?: number[];
  /** music first: the scene's whole bars (beatTimings' bars, at most 64), and a kinetic scene's or a montage's beats between words or pictures (at most 8) */ bars?: number; every?: number;
  /** music first: the bars it would last, past the 64 a scene takes (its bars are cut to 64; the to-do says to split it) */ longer?: number;
}
export interface RemakePlan {
  from: {file: string; seconds: number; shots: number};
  pace: {name: 'promo' | 'lesson'; why: Why};
  /** music-first: the song times it (bpm, and seconds the bars run); song-under: its words time it; unsure: settle the tempo; not-read: the breakdown's why */
  music: {verdict: 'music-first' | 'song-under' | 'unsure' | 'not-read'; why: Why; bpm?: number; seconds?: number; notRead?: string};
  /** the entrance most scenes after the first come in by, and how many do (null: one scene) */
  enter: {type: string; scenes: number; of: number} | null;
  scenes: RemakeScene[];
  /** what a breakdown cannot know: each scene's words or pictures, then the song, its tempo, or what times the words */
  todo: {scene?: string; give: 'words' | 'pictures' | 'split' | 'song' | 'tempo' | 'beats' | 'timing'; what: string}[];
  thresholds: RemakeThresholds;
  /** the plan's footprintjs record: every choice a decision with its evidence */ record: unknown[];
}
/**
 * Make one like it: a draft plan for a film made like the reference, read from its breakdown's spec — scenes (a run of
 * quick shots joined by hard cuts is one), pace, entrances, music — every choice with its why. Nothing is made: a person
 * approves it first.
 */
export function remakePlan(breakdown: BreakdownSpec, options?: {thresholds?: Partial<RemakeThresholds>}): Promise<RemakePlan>;
/** The plan in plain words (markdown): the choices, the scenes, the entrances and flashes, and what is still to give. */
export function remakePlanText(plan: RemakePlan): string;

/** The starter's two families of cards, [ground, ink]: words on the kinetic kit's own, a picture to come on grey. */
export const STARTER: Readonly<{words: readonly [string, string]; pictures: readonly [string, string]}>;
/** One thing a starter still needs, and where it goes. */
export interface StarterGive {
  scene?: string;
  give: 'words' | 'pictures' | 'split' | 'song' | 'tempo' | 'beats' | 'timing';
  what: string;
  /** where it goes, as a sentence */ where: string;
  /** where the scene's cards are in recipe.json: story.words, or stages[i].world.words */ place?: string;
}
export interface RemakeStarter {
  /** each scene silent: one direction as long as the reference's scene (in parts of at most 20 s, never under 0.2 s) */
  storyboard: {title: string; scenes: {id: string; title: string; silent: [string, number][]}[]};
  /** the plan's pace; the first scene the story, the rest world stages coming in as the plan says; each a kinetic world of cards */
  recipe: {pace: string; story: Record<string, unknown>; stages: Record<string, unknown>[]};
  /** music first: each scene's bars, for beatTimings; else null (the reference's own seconds time it) */
  music: {bars: Record<string, number>} | null;
  give: StarterGive[];
  /** what the starter does not make: scenes held 0.2 s, the plan's flashes */ notes: string[];
  /** the folder's files by name: storyboard.json, recipe.json, plan.json, storyreel.config.mjs, render.mjs, README.md */
  files: Record<string, string>;
}
/**
 * A starter film from an approved plan: a storyboard and a recipe that render as they are — an animatic in the
 * reference's own rhythm, every card ("WORD 1", "TITLE", a grey "PICTURE") landing when the reference cuts to its shot —
 * with what is still to give and where, and the files of a project folder (storyreel remake --starter writes them).
 */
export function remakeStarter(plan: RemakePlan | Omit<RemakePlan, 'record'>, options?: {title?: string}): RemakeStarter;
