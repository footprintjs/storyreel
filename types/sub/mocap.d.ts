import type {CombinedNarrativeEntry, DecisionEvidence} from 'footprintjs';
import type {Joints, MotionSource, Pose} from './pose.js';

export type SchemeName = 'coco-17' | 'mediapipe-33';
/** A point: [x, y, confidence] (confidence 0..1), or null when not seen. */
export type Point = [x: number, y: number, confidence: number] | null;
/** One frame: the scheme's points in its order, or by name (a name left out was not seen), or null (nobody found). */
export type KeypointFrame = Point[] | {[name: string]: Point} | null;
/** The keypoints JSON (tools/pose-from-video.py writes it). */
export interface Keypoints {
  scheme: SchemeName;
  /** The video's frames a second. */
  fps: number;
  /** normalised: x and y are shares of the width and the height ('normalized' is read too). */
  coordinates: 'pixels' | 'normalised' | 'normalized';
  /** The video's size in px: needed for normalised coordinates. */
  width?: number;
  height?: number;
  frames: KeypointFrame[];
}
/** The One Euro filter's settings: minCutoff and dCutoff in Hz, beta per torso length a second. */
export interface SmoothSettings {minCutoff: number; beta: number; dCutoff: number}
/** fromPose's settings; x and size are needed, the rest have defaults (MOCAP). Seconds, or torso lengths (hips to shoulders). */
export interface MocapOptions {
  /** Where the figure stands on the floor at the clip's first frame, px. */
  x: number;
  /** The figure's standing height, px (one torso length is TORSO_SHARE of it). */
  size: number;
  name?: string;
  minConfidence?: number;
  maxGap?: number;
  smooth?: Partial<SmoothSettings> | null;
  stillSpeed?: number;
  minContact?: number;
  floorBand?: number;
  blend?: number;
  walkSpeed?: number;
  frontal?: number;
  mirror?: boolean;
  facing?: 1 | -1 | null;
  /** Seconds of the video: keep only this stretch. */
  from?: number | null;
  to?: number | null;
  /** Film seconds: when the first kept frame is shown. */
  start?: number;
  speed?: number;
  loop?: boolean;
}
export const MOCAP: Readonly<Required<Omit<MocapOptions, 'x' | 'size' | 'smooth'>> & {smooth: Readonly<SmoothSettings>}>;
export const SCHEMES: Readonly<Record<SchemeName, readonly string[]>>;
export const SCHEME_NAMES: readonly SchemeName[];
/** The thirteen joints a figure is drawn from, named alike in both schemes. */
export const RIG_JOINTS: readonly string[];

/** A verdict: what was decided, a sentence that says why, and decide()'s own evidence. */
export interface Verdict<How extends string> {how: How; why: string; evidence: DecisionEvidence}
/** A run of frames a joint was missing in (video frame numbers), and how it was filled. */
export interface Gap extends Verdict<'bridge' | 'hold' | 'refuse'> {
  joint: string; frames: [number, number]; missing: number; seconds: number; edge: 'inside' | 'start' | 'end' | 'whole';
}
/** A run of frames the detector gave a joint under minConfidence. */
export interface Dropout {joint: string; frames: [number, number]; lowest: number}
/** A still stretch of a foot (video frame numbers), how long, how high over the floor (torso lengths), and the verdict. */
export interface Stillness<How extends string> extends Verdict<How> {
  foot: 'left' | 'right'; frames: [number, number]; lasts: number; overFloor: number;
  /** Blips of movement shorter than minContact inside the stretch, joined into it (absent when none). */
  blips?: number;
}
/** A planted foot: its spot (torso lengths from the first hip centre) and its film seconds (first pass). */
export interface Contact extends Stillness<'planted'> {spot: number; film: [number, number]}
export interface MocapRecord {
  name: string; scheme: SchemeName; fps: number; coordinates: 'pixels' | 'normalised';
  kept: {frames: [number, number]; count: number; seconds: number};
  /** Kept frames with nobody found. */
  nobody: number;
  dropouts: Dropout[];
  gaps: Gap[];
  /** One torso length (hips to shoulders) in the video, px. */
  torso: number;
  smoothing: (SmoothSettings & {filter: string}) | 'off';
  mirror: boolean;
  facing: Verdict<'right' | 'left'> & {facing: 1 | -1};
  /** Each angle's range over the clip, [least, most] radians. */
  angles: {[name: string]: [number, number]};
  /** The floor's height in torso lengths (y up, from the first hip centre). */
  floor: number;
  contacts: Contact[];
  notPlanted: Stillness<'aloft' | 'passing'>[];
  standing: {height: number; from: string; frames: number};
  /** Frames where a planted foot was out of the leg's reach, and by how much at most (torso lengths). */
  reach: {frames: number; most: number};
  timing: {start: number; speed: number; pass: number; end: number | null; after: 'hold' | 'repeat'; why: string; evidence: DecisionEvidence; period?: number; travel?: number; seam?: number};
  source: {name: string; start: number; end: number | null; frames: number; unit: number};
  /** The run's footprintjs narrative. */
  narrative: CombinedNarrativeEntry[];
}
/** A clip's pose: always with joints; phase before | clip | after. */
export interface ClipPose extends Pose {phase: 'before' | 'clip' | 'after'; joints: Joints}
export interface MocapSource extends MotionSource<ClipPose> {
  readonly start: number;
  /** Infinity when it loops. */
  readonly end: number;
  readonly record: MocapRecord;
}
/** A refusal from fromPose carries the record so far (and the gaps it refused). */
export interface MocapError extends Error {record?: Partial<MocapRecord> & {refused?: Gap[]}}
/** Motion from a video's keypoints, as a motion source; the conversion runs as a footprintjs flowchart. */
export function fromPose(keypoints: Keypoints, options: MocapOptions): Promise<MocapSource>;
