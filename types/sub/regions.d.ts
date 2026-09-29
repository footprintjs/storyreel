import type {Region} from '../index.js';
export interface View { z: number; tx: number; ty: number }
export function view(z?: number, tx?: number, ty?: number): View;
export function then(outer: View, inner: View): View;
export function about(camera: {sx: number; sy: number; z: number; tx: number; ty: number}): View;
export function through(v: View, box: [number, number, number, number]): [number, number, number, number];
export function back(v: View, point: [number, number]): [number, number];
export function hitTest(regions: Region[], x: number, y: number): Region[];
