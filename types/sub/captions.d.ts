export {spokenTracks} from '../index.js';
import type {ZoneRect} from '../index.js';
/**
 * Draw a caption centred in a box (output pixels): bold words on a dark pill, the word being said in the accent. `zones`
 * (the app's UI over the picture, in the same pixels; `height` the picture's) lays it out clear of them.
 */
export function drawCaption(ctx: unknown, caption: {words: {text: string}[]; active: number} | null, box: import('../index.js').Box, style?: {size?: number; font?: string; ink?: string; accent?: string; pill?: string; zones?: readonly ZoneRect[] | null; height?: number}): void;
/** Where a caption is drawn in a box with these zones over the picture: each line's pill, whether it was fitted, what is still under a zone. */
export function captionFit(ctx: unknown, caption: {words: {text: string}[]; active: number}, box: import('../index.js').Box, style?: {size?: number; font?: string; zones?: readonly ZoneRect[]; height?: number}): {rects: number[][]; fitted: boolean; covered: {rect: number[]; zone: string; overlap: [number, number, number, number]}[]};
