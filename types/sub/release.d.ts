import type {MakeFilmOptions, CropKey, Cut, EndCard, Join, EditRecord} from '../index.js';

/** Who a film is made for: 'kids' (directed at children) or 'general' (anyone; a teaser for parents included). */
export type Audience = 'kids' | 'general';
/**
 * The post: the text people see and who the film is for. `thumbnail` is an image file (checked against each platform's)
 * or 'poster' (the film's poster, drawn at the platform's size); `synthetic` lists what in the film is realistic and
 * made with AI (['voice'] for a synthetic voice narrating), so platforms that ask are told.
 */
export interface ReleasePost {title: string; description?: string; tags?: string[]; audience: Audience; thumbnail?: string | 'poster'; lang?: string; synthetic?: string[]; credits?: string[]}
/** A platform adapter: the interface every target implements (src/targets/*.mjs are the built-in ones). */
export interface ReleaseAdapter {
  name: string;
  label: string;
  /** The video's shape: a layout format, with the title band and burned-in captions where the platform wants them. */
  video: {format: 'landscape' | 'square' | 'portrait' | 'vertical'; header?: boolean; captions?: boolean; captionFiles?: ('srt' | 'vtt')[]};
  /**
   * The length it takes, its text fields' limits — counted as the platform counts (`count`), else by code points — and,
   * when it has one, the largest frame it takes (`frame`, one per orientation: a larger render is refused before it starts).
   */
  limits: {seconds: {min?: number; max: number}; text?: Record<string, {max: number; count?: (text: string) => number}>; frame?: {width: number; height: number}[]};
  /** Who the platform is for: its minimum age, and what it does with a film made for kids. */
  audience: {minAge: number; kids: 'madeForKids' | 'refuse'};
  thumbnail: {width: number; height: number; maxBytes?: number} | null;
  /** When the limits were checked, and where. */
  facts: {checked: string; sources: string[]};
  /** The text fields for this platform (chapters: [seconds, name] of the rendered part; limits: the target's, overrides included). */
  post(post: Required<Pick<ReleasePost, 'title' | 'description' | 'tags' | 'audience'>> & ReleasePost, context: {chapters: [number, string][]; seconds: number; limits: ReleaseAdapter['limits']}): Record<string, unknown>;
}
export type TargetName = 'youtube' | 'youtube-shorts' | 'linkedin' | 'tiktok' | 'instagram-reels' | 'x';
/** Limits overridden: only what changes (a key given as undefined is not given; the platform's value stays). */
export interface ReleaseLimits {seconds?: {min?: number; max?: number}; text?: Record<string, {max?: number; count?: (text: string) => number}>; frame?: {width: number; height: number}[]}
/** A target's own render settings, over the film's: posterFrame false starts it on the film's own frame. */
export interface TargetRender {posterFrame?: boolean; quality?: 'standard' | 'draft' | 'high'}
/**
 * A target: a built-in name, an adapter, or one with options (a part from/to, a crop for the tall shapes, limits
 * overridden) — or a Short cut from the film: `cuts` joined in order (each with where its crop looks, `follow`), each
 * join's `join` (cut point, overlap, pop), an `end` card, the picture filling the tall frame (`fill`), the things the
 * crop never cuts (`keep`), and its own `render` settings.
 */
export type ReleaseTarget = TargetName | ReleaseAdapter | {target: TargetName | ReleaseAdapter; name?: string; from?: number; to?: number; header?: {title: string; sub?: string}; crop?: CropKey[] | 'focus'; captions?: boolean | object; limits?: ReleaseLimits; scale?: number;
  cuts?: Cut[]; join?: Join; end?: EndCard; fill?: boolean; keep?: string[]; render?: TargetRender};
/**
 * One target released: `dir` holds what is posted and nothing else; `work` the render's working files and its record;
 * `edit` the edit as cut; `clipped` every place the crop's edge cuts a kept thing it could not keep whole.
 */
export interface Released {target: string; dir: string; video: string; captions: {srt?: string; vtt?: string} | null; thumbnail: string | null; credits: string; post: Record<string, unknown>; makingOf: string; work: string;
  edit?: EditRecord; clipped?: {cut?: number; t: number; names: string[]; why: string}[]}
/** The folder inside a release's `out` that holds each target's working files and record. */
export const WORK: 'work';
/** CREDITS.txt: StoryReel and its tools, the found sounds' attribution lines (from the making-of record's foundSounds), the maker's credits. */
export function creditsText(post: ReleasePost, tools: {name: string; version?: string; license: string; detail?: string}[], sounds?: Partial<import('./sounds.js').FoundRecord>[]): string;

export const TARGETS: Readonly<Record<TargetName, () => Promise<{default: ReleaseAdapter}>>>;
export const TARGET_NAMES: readonly TargetName[];
export const AUDIENCES: readonly Audience[];
export function checkAdapter(adapter: unknown): ReleaseAdapter;
export function loadTarget(spec: ReleaseTarget): Promise<{adapter: ReleaseAdapter; options: {name: string; from?: number; to?: number; header?: object; crop?: unknown; captions?: unknown; scale?: number;
  /** A target's edit; a part with an end card and no `to` runs to the film's end (`to: null`, placed at the render). */
  edit?: {cuts: (Cut | (Omit<Cut, 'to'> & {to: null}))[]; end?: EndCard; join?: Join}; fill?: true; keep?: string[]; render?: TargetRender}}>;
export function readPost(post: unknown): ReleasePost & {description: string; tags: string[]; synthetic: string[]};
export function planProblems(adapter: ReleaseAdapter, post: ReleasePost, options?: {seconds?: number | null; poster?: boolean | null; scale?: number}): {problem: string; fix: string}[];
/** Release a film to each target: <out>/<target>/ the video in its shape, caption files, thumbnail, post.json + post.txt. */
export function makeRelease(options: Omit<MakeFilmOptions, 'out'> & {targets: ReleaseTarget[]; post: ReleasePost; out: string; base?: string}): Promise<Released[]>;
