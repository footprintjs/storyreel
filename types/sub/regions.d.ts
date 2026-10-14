import type {Region} from '../index.js';
/** A scale then a shift (p → p·z + (tx, ty)); `r`, when present, turns it too (radians: p → R(r)·p·z + (tx, ty)) — a rolled camera's. */
export interface View { z: number; tx: number; ty: number; r?: number }
export function view(z?: number, tx?: number, ty?: number, r?: number): View;
/** `outer` composed after `inner` (inner first). Never named `then`: that would make the module a thenable. */
export function compose(outer: View, inner: View): View;
export function about(camera: {sx: number; sy: number; z: number; tx: number; ty: number}): View;
export function through(v: View, box: [number, number, number, number]): [number, number, number, number];
export function back(v: View, point: [number, number]): [number, number];
export function hitTest(regions: Region[], x: number, y: number): Region[];
