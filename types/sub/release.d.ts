import type {MakeFilmOptions} from '../index.js';

/** Who a film is made for: 'kids' (directed at children) or 'general' (anyone; a teaser for parents included). */
export type Audience = 'kids' | 'general';
/**
 * The post: the text people see and who the film is for. `thumbnail` is an image file (checked against each platform's)
 * or 'poster' (the film's poster, drawn at the platform's size); `synthetic` lists what in the film is realistic and
 * made with AI (['voice'] for a synthetic voice narrating), so platforms that ask are told.
 */
export interface ReleasePost {title: string; description?: string; tags?: string[]; audience: Audience; thumbnail?: string | 'poster'; lang?: string; synthetic?: string[]}
/** A platform adapter: the interface every target implements (src/targets/*.mjs are the built-in ones). */
export interface ReleaseAdapter {
  name: string;
  label: string;
  /** The video's shape: a layout format, with the title band and burned-in captions where the platform wants them. */
  video: {format: 'landscape' | 'square' | 'portrait' | 'vertical'; header?: boolean; captions?: boolean; captionFiles?: ('srt' | 'vtt')[]};
  limits: {seconds: {min?: number; max: number}; text?: Record<string, {max: number}>};
  /** Who the platform is for: its minimum age, and what it does with a film made for kids. */
  audience: {minAge: number; kids: 'madeForKids' | 'refuse'};
  thumbnail: {width: number; height: number; maxBytes?: number} | null;
  /** When the limits were checked, and where. */
  facts: {checked: string; sources: string[]};
  /** The text fields for this platform (chapters: [seconds, name] of the rendered part). */
  post(post: Required<Pick<ReleasePost, 'title' | 'description' | 'tags' | 'audience'>> & ReleasePost, context: {chapters: [number, string][]; seconds: number}): Record<string, unknown>;
}
export type TargetName = 'youtube' | 'youtube-shorts' | 'linkedin' | 'tiktok' | 'instagram-reels';
/** A target: a built-in name, an adapter, or one with options (a part from/to, a crop for the tall shapes, limits overridden). */
export type ReleaseTarget = TargetName | ReleaseAdapter | {target: TargetName | ReleaseAdapter; name?: string; from?: number; to?: number; header?: {title: string; sub?: string}; crop?: unknown[]; captions?: boolean | object; limits?: Partial<ReleaseAdapter['limits']>; scale?: number};
export interface Released {target: string; dir: string; video: string; captions: {srt?: string; vtt?: string} | null; thumbnail: string | null; post: Record<string, unknown>; makingOf: string}

export const TARGETS: Readonly<Record<TargetName, () => Promise<{default: ReleaseAdapter}>>>;
export const TARGET_NAMES: readonly TargetName[];
export const AUDIENCES: readonly Audience[];
export function checkAdapter(adapter: unknown): ReleaseAdapter;
export function loadTarget(spec: ReleaseTarget): Promise<{adapter: ReleaseAdapter; options: {name: string; from?: number; to?: number; header?: object; crop?: unknown[]; captions?: unknown; scale?: number}}>;
export function readPost(post: unknown): ReleasePost & {description: string; tags: string[]; synthetic: string[]};
export function planProblems(adapter: ReleaseAdapter, post: ReleasePost, options?: {seconds?: number | null; poster?: boolean | null}): {problem: string; fix: string}[];
/** Release a film to each target: <out>/<target>/ the video in its shape, caption files, thumbnail, post.json + post.txt. */
export function makeRelease(options: Omit<MakeFilmOptions, 'out'> & {targets: ReleaseTarget[]; post: ReleasePost; out: string; base?: string}): Promise<Released[]>;
