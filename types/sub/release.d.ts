import type {MakeFilmOptions, CropKey, Cut, EndCard, Join, EditRecord, Zone, UiFinding} from '../index.js';
import type {DoctorItem} from './doctor.js';

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
  /**
   * Where the platform's app draws over the video (zones.mjs): `zones` (an organic post's, each measured or estimated),
   * `ads` (the platform's published ad safe zone, when it publishes one), and what a render does when something is still
   * under them ('report', the default, or 'refuse').
   */
  ui?: {zones: Zone[]; ads?: Zone[]; covered?: 'report' | 'refuse'};
  /** The loudness the release normalises to on this platform (integrated LUFS, true peak dBTP); left out, the render's default (−16, −1.5). */
  loudness?: {I: number; TP: number; LRA?: number};
  /** When the limits were checked, and where; `ui` and `loudness` the same for the zones and the loudness goal. */
  facts: {checked: string; sources: string[]; ui?: {checked: string; sources: string[]; note?: string}; loudness?: {checked: string; sources: string[]; note?: string}};
  /** The text fields for this platform (chapters: [seconds, name] of the rendered part; limits: the target's, overrides included). */
  post(post: Required<Pick<ReleasePost, 'title' | 'description' | 'tags' | 'audience'>> & ReleasePost, context: {chapters: [number, string][]; seconds: number; limits: ReleaseAdapter['limits']}): Record<string, unknown>;
}
export type TargetName = 'youtube' | 'youtube-shorts' | 'linkedin' | 'tiktok' | 'instagram-reels' | 'x';
/** Limits overridden: only what changes (a key given as undefined is not given; the platform's value stays). */
export interface ReleaseLimits {seconds?: {min?: number; max?: number}; text?: Record<string, {max?: number; count?: (text: string) => number}>; frame?: {width: number; height: number}[]}
/** A target's own render settings, over the film's: posterFrame false starts it on the film's own frame; loudness over the platform's goal. */
export interface TargetRender {posterFrame?: boolean; quality?: 'standard' | 'draft' | 'high'; loudness?: {I: number; TP: number; LRA?: number}}
/** A target's app UI over its adapter's: zones of its own or 'ads' (the platform's published ad safe zone), report or refuse, the named faces to keep clear. */
export interface TargetUi {zones?: Zone[] | 'ads'; covered?: 'report' | 'refuse'; faces?: string[]}
/**
 * A target: a built-in name, an adapter, or one with options (a part from/to, a crop for the tall shapes, limits
 * overridden) — or a Short cut from the film: `cuts` joined in order (each with where its crop looks, `follow`), each
 * join's `join` (cut point, overlap, pop), an `end` card, the picture filling the tall frame (`fill`), the things the
 * crop never cuts (`keep`), and its own `render` settings.
 */
export type ReleaseTarget = TargetName | ReleaseAdapter | {target: TargetName | ReleaseAdapter; name?: string; from?: number; to?: number; header?: {title: string; sub?: string}; crop?: CropKey[] | 'focus'; captions?: boolean | object; limits?: ReleaseLimits; scale?: number;
  cuts?: Cut[]; join?: Join; end?: EndCard; fill?: boolean; keep?: string[]; render?: TargetRender;
  /** Over the platform's app UI (its adapter's `ui`), or false for none: the bands as the format places them. */
  ui?: TargetUi | false};
/**
 * One target released: `dir` holds what is posted and nothing else; `work` the render's working files and its record;
 * `edit` the edit as cut; `clipped` every place the crop's edge cuts a kept thing it could not keep whole.
 */
export interface Released {target: string; dir: string; video: string; captions: {srt?: string; vtt?: string} | null; thumbnail: string | null; credits: string; post: Record<string, unknown>; makingOf: string; work: string;
  edit?: EditRecord; clipped?: {cut?: number; t: number; names: string[]; why: string}[];
  /** The loudness the render asked for (the platform's goal, the film's, or the target's own). */
  loudness: {I: number; TP: number; LRA?: number};
  /** What is still under the platform's app UI, each with its fix (with covered: 'refuse' the release refuses instead). */
  covered?: UiFinding[];
  /** What the doctor could not ask, and fonts that fall back to another face: said, never refused. */
  doctor?: {unknown: DoctorItem[]; missing: DoctorItem[]}}
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
  edit?: {cuts: (Cut | (Omit<Cut, 'to'> & {to: null}))[]; end?: EndCard; join?: Join}; fill?: true; keep?: string[]; render?: TargetRender;
  /** The app UI as the target renders it: the adapter's zones with the target's over them, checked. */
  ui?: {zones: readonly Zone[]; covered: 'report' | 'refuse'; faces: readonly string[]}}}>;
export function readPost(post: unknown): ReleasePost & {description: string; tags: string[]; synthetic: string[]};
/** The loudness the render goes at when neither the target, the film nor the platform names one (render.mjs owns it). */
export {DEFAULT_LOUDNESS} from './render.js';
/** The loudness a target's render is set to: its own, else the film's render's, else the platform's goal, else undefined (the render's default). */
export function targetLoudness(adapter: ReleaseAdapter, own?: TargetRender, filmRender?: {loudness?: {I: number; TP: number; LRA?: number}}): {I: number; TP: number; LRA?: number} | undefined;
export function planProblems(adapter: ReleaseAdapter, post: ReleasePost, options?: {seconds?: number | null; poster?: boolean | null; scale?: number}): {problem: string; fix: string}[];
/** Release a film to each target: <out>/<target>/ the video in its shape, caption files, thumbnail, post.json + post.txt. */
export function makeRelease(options: Omit<MakeFilmOptions, 'out'> & {targets: ReleaseTarget[]; post: ReleasePost; out: string; base?: string}): Promise<Released[]>;
