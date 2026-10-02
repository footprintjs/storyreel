export {compileLayout, FORMAT_NAMES} from '../index.js';
export type {Layout, FormatName, Box} from '../index.js';
import type {Box, FormatName} from '../index.js';
/** A layout's scale, checked: 1 (the default) to 2, keeping the format's size whole and even; refuses naming the sizes it would make. */
export function formatScale(format: FormatName, scale?: number): number;
/** A format's size and default boxes, as a copy. */
export function formatOf(name: FormatName): {width: number; height: number; film: Box; crop: [number, number] | null; header: Box | null; captions: Box; captionSize: number; maxWords: number};
/** The crop window at t on the frame: centre and width eased from key to key, kept inside the frame's width (a window taller than the frame shows the paper above and below). */
export function cropWindow(keys: {t: number; x: number; width?: number}[], t: number, crop: [width: number, height: number]): {x0: number; y0: number; w: number; h: number};
