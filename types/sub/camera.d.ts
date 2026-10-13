export {CAMERA_MOVES, CAMERA_MOVE_NAMES} from '../index.js';
export type {CameraMoveName, CameraFamily, CameraTime, CameraMove, CameraState, CameraMovePlayed, CameraRecord, CameraSetting, CameraMoveDef, WorldLayer} from '../index.js';
import type {CameraMove, CameraMoveDef, CameraMoveName, CameraFamily, CameraState, WorldLayer, Beat} from '../index.js';
import type {Ease} from './ease.js';
import type {View} from './regions.js';

/** The camera at rest: the frame as the film draws it without one ({x: 800, y: 450, z: 1, r: 0}). */
export const REST: Readonly<CameraState>;
/** The most a camera scales the picture: a move that would need more to keep the frame covered refuses. */
export const MAX_ZOOM: number;
/** The least zoom that keeps the picture covering the 1600×900 frame with the camera centred on (x, y), rolled r; Infinity off the picture. */
export function coverZoom(state: {x: number; y: number; r?: number}): number;
/** A state with its zoom raised, where it must be, to keep the frame covered. */
export function covered(state: CameraState): CameraState;
/** A state as a view on the frame (regions.mjs): p → R(r)·(p − (x, y))·z + the frame's centre. */
export function viewOf(state: CameraState): View;
/** Point a canvas through a state (translate to the frame's centre, roll, zoom, back from the point it centres). */
export function aimAt(ctx: any, state: CameraState): void;
/** A speed ramp's clock: u (how far through its span the voice is, 0..1) → how far the picture is; `middle` is its speed half way, 1 at both ends, in step at both. */
export function speedRamp(u: number, middle: number): number;
/** Handheld at t as a state over the frame: a slow seeded drift of up to `amount` px and a little roll, at strength w (0..1), its zoom covering the farthest drift. */
export function handheldAt(t: number, settings: {amount: number; seed: number}, w?: number): CameraState;
/** Each layer of a world (back to front) as the depth moves leave it: a slide, a scale about the sheet's centre, a blur (px). */
export function layersAt(layers: readonly WorldLayer[], state?: {orbit?: number; zoom?: number; focus?: number | null; blur?: number}): {name: string; dx: number; scale: number; blur: number}[];
/** One entry of a recipe's `camera` list, checked and put on the clock (an unknown move, key or setting refuses, naming what there is). */
export function readCameraMove(entry: CameraMove | unknown, where: string, clock: {at(beat: Beat): number; total: number}): {
  path: string; move: CameraMoveName; family: CameraFamily; def: Readonly<CameraMoveDef>; at: number; until: number;
  p: Readonly<Record<string, unknown>>; ease: Ease | null; eased: {ease: string} | {feel: unknown} | null;
};
