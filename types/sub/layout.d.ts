export {compileLayout, FORMAT_NAMES} from '../index.js';
export type {Layout, FormatName, Box, CropKey, CropFraming} from '../index.js';
import type {Box, FormatName, Film} from '../index.js';
/** A layout's scale, checked: 1 (the default) to 2, keeping the format's size whole and even; refuses naming the sizes it would make. */
export function formatScale(format: FormatName, scale?: number): number;
/** The size a draft's scale (2/3) makes of a format, "1280×720" for landscape. */
export function draftSize(format: FormatName): string;
/** A format's size and default boxes, as a copy. */
export function formatOf(name: FormatName): {width: number; height: number; film: Box; crop: [number, number] | null; header: Box | null; captions: Box; captionSize: number; maxWords: number; fill?: Box};
/**
 * The crop window at t on the frame: centre and width eased from key to key (a `jump` key is there at once), kept inside
 * the frame's width; up and down only where a key gives y (a window taller than the frame shows the paper above and below).
 */
export function cropWindow(keys: {t: number; x: number; width?: number; y?: number; jump?: boolean}[], t: number, crop: [width: number, height: number]): {x0: number; y0: number; w: number; h: number};
/** A crop key the film works out: the window's centre and width from t, and whether it jumps there. */
export interface FollowKey {t: number; x: number; y: number; width: number; jump?: true}
/** A follow strategy: the crop keys for the stretch from–to of a film, and how many keys each reason made. */
export type FollowStrategy = (film: Film, options: {from: number; to: number; crop: [number, number]; width?: number}) => {keys: FollowKey[]; why: Record<string, number>};
/** The follow strategies, by name: focus (the speaker's region while someone speaks, else the thing the focus names). */
export const FOLLOW: Readonly<{focus: FollowStrategy}>;
export const followFocus: FollowStrategy;
/** Keys moved the least they must so the window's edge never cuts a kept thing while each holds; where it cannot, said. */
/** How far keepWhole moves a key someone wrote (`given`), as a share of the window's width; a followed key moves as far as it must. */
export const NUDGE: number;
export function keepWhole<K extends {t: number; x: number; y?: number; width: number; jump?: boolean; given?: boolean}>(film: Film, keys: K[], options: {crop: [number, number]; keep: string[]; until: number}): {keys: K[]; nudged: {t: number; by: [number, number]}[]; clipped: {t: number; names: string[]; why: string}[]};
