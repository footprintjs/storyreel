import type {Walk, walk} from './walk.js';

/** A foot: its place on the floor and its height off it (px). */
export interface Foot {x: number; lift: number}
/** An arm's angles (radians, + forward): the upper arm from hanging along the torso, the forearm from the upper arm. */
export interface ArmAngles {shoulder: number; elbow: number}
/** A leg's angles (radians, + forward): the thigh from the torso's line, the shin from the thigh (− as the knee bends). */
export interface LegAngles {hip: number; knee: number}
/** Angles a kit may bend a figure by, in the figure's own frame (drawn under scale(facing, 1)); [j] is on feet[j]'s side. */
export interface Joints {
  /** The hips-to-shoulders line from upright (the pose's lean). */
  torso: number;
  /** The head (shoulders to nose) from the torso's line. */
  neck: number;
  arms: [ArmAngles, ArmAngles];
  legs: [LegAngles, LegAngles];
}
/** Where a figure is at t: numbers a kit draws it from (the world's px). */
export interface Pose {
  /** The body's place on the floor (its hips), px. */
  x: number;
  /** How far the body rises (+) or sinks (−) from standing, px. */
  lift: number;
  /** Radians, + toward the way it faces. */
  lean: number;
  /** Each foot's place on the floor and its height off it. A planted foot never moves. */
  feet: [Foot, Foot];
  /** −1…1: + while the arm on feet[1]'s side is forward. */
  swing: number;
  /** 0 facing us … 1 turned along the way. */
  turn: number;
  facing: 1 | -1;
  /** Moving across the floor. */
  walking: boolean;
  /** Where in its motion the source is, by the source's own names. */
  phase: string;
  joints?: Joints;
}
/** Anything that moves a figure: a name, and the pose at t (film seconds), a pure function of time. */
export interface MotionSource<P extends Pose = Pose> {
  readonly name: string;
  poseAt(t: number): P;
  readonly start?: number;
  readonly end?: number;
}
/** The keys every pose has (joints is optional). */
export const POSE_KEYS: readonly string[];
/** A figure's torso (hips to shoulders) as a share of its standing height: 0.3. */
export const TORSO_SHARE: number;
/** A motion source, checked (a name, and poseAt as a function) and frozen; whatever else it carries is kept. */
export function motionSource<S extends {name: string; poseAt(t: number): Pose}>(source: S): Readonly<S>;
/** A planned walk (walk.mjs · walk), or walk's options to plan one, as a motion source. */
export function walkSource(plan: Walk | Parameters<typeof walk>[0]): Readonly<{name: 'walk'; poseAt(t: number): ReturnType<Walk['at']>; start: number; end: number}>;
/** A pose, checked: returned as it is, or the refusal names every key that is wrong (`where` names the pose). */
export function checkPose<P extends Pose>(pose: P, where?: string): P;
