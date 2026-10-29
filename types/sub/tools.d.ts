import type {Film} from '../index.js';
/**
 * The film's inputs a project's storyreel.config.mjs returns from film(flags). `render` and `code` are the full render's
 * (makeFilm's own): it writes its video into `out`, and `changes` compares with the cache there (fullRender).
 */
export interface ProjectInputs {storyboard: unknown; recipe: unknown; kits?: unknown[]; root?: string; narrationDir?: string; pacing?: Record<string, unknown>; timings?: unknown;
  layout?: import('../index.js').Layout | null; out?: string; strings?: unknown; data?: unknown; theme?: unknown; cast?: unknown; lang?: string;
  strategies?: unknown; reducedMotion?: boolean;
  /** The full render's own makeFilm options (fullRender carries them; the review tools do not read them). */
  render?: Record<string, unknown>; code?: string | null; music?: unknown; check?: 'report' | 'refuse' | null; expect?: {seconds?: number; tolerance?: number};
  voiceCheck?: 'report' | 'refuse'; claims?: 'report' | 'refuse'; approval?: unknown;
  /** Files `storyreel studio` compiles again on, besides the recipe's file and storyboard.json beside it: paths from the config's folder, or absolute. */
  watch?: string[]}
/** The project's inputs, timed (from its voice, or evenly) but not compiled. */
export interface ProjectSource {inputs: ProjectInputs & {voiced: boolean}; cwd: string}
export interface Project extends ProjectSource {film: Film}
export const CONFIG: 'storyreel.config.mjs';
/** The project's inputs from its config's film(flags), timed and not compiled (what changes reads: it prepares the film as the full render does). */
export function loadInputs(options?: {config?: string; cwd?: string; [flag: string]: unknown}): Promise<ProjectSource>;
/** The project's inputs as film(flags) gives them, not yet timed: `said`, the storyboard with the cast's names in it; `raw`, its timings before pacing (what anchors reads: it times the film itself). */
export interface ProjectConfig {inputs: ProjectInputs & {voiced: boolean}; cwd: string; said: unknown; raw: unknown}
export function readInputs(options?: {config?: string; cwd?: string; [flag: string]: unknown}): Promise<ProjectConfig>;
/** The project's full render as makeFilm's options: its film, its video in the project's out folder (film.mp4), the config's render (its layout by default) and code. */
export function fullRender(project: ProjectSource): import('../index.js').MakeFilmOptions;
/** A time on the film clock as a command takes it: seconds (12.5) or m:ss (0:12); anything else refuses, naming `name`. */
export function clockSeconds(value: string | number, name?: string): number;
/** The tools' defaults: a part's handles (seconds either side), a strip's frames and their rate, a still's width (px); a sheet's seconds between frames, frames to a sheet and width (px). */
export const TOOL_DEFAULTS: Readonly<{handles: number; frames: number; fps: number; width: number; every: number; per: number; sheetWidth: number}>;
/** The project's film, compiled once (paced from its voice folder's timings.json when it names one). */
export function loadProject(options?: {config?: string; cwd?: string; [flag: string]: unknown}): Promise<Project>;
/** The project's film compiled from its inputs, with another recipe when one is given (the studio's Try: a copy with a pick in it). */
export function compileProject(project: ProjectSource, recipe?: unknown): Promise<Film>;
/**
 * The file the project's recipe is written in — `recipe` (from cwd), or recipe.json beside the config — when it holds the
 * very recipe the config's film() gives with these flags; else a refusal naming the fix. What `storyreel apply` writes.
 */
export function projectRecipe(project: ProjectSource | ProjectConfig, options?: {config?: string; recipe?: string}): {file: string; text: string; recipe: unknown};
/** A part: its scenes, or a window on the film clock (from and to: seconds or m:ss), with the seconds shown either side. */
export interface PartArgs {scene?: string | string[]; scenes?: string | string[]; from?: number | string; to?: number | string; handles?: number | string}
export function timeline(project: Project, args?: PartArgs): Promise<string>;
/** loop: 'true' (or true) when the part is made to loop — the end of its own scenes (not the handles) must come round to their start. */
export function review(project: Project, args?: PartArgs & {loop?: boolean | string}): Promise<string>;
export function part(project: Project, args: PartArgs): Promise<string>;
/** What an edit changed before the full render (previewChanges on fullRender): one line per changed range, then the count; render: true draws only those pieces (kept) and writes a short clip of them. */
export function changes(project: ProjectSource, args?: {render?: boolean | string; handles?: number | string}): Promise<string>;
/**
 * One picture: frames at the moments named (`at`: scene+seconds, seconds or m:ss on the film clock, scene:phrase or
 * scene:{moment}, +seconds after either; at most 30), or at every beat of one scene (`beats`; `from` and `to`, moments,
 * keep the beats between; at most 30 a picture, the rest named in the text) — never both.
 */
export function still(project: Project, args: {at: string | string[]; beats?: never; from?: never; to?: never; width?: number | string}
  | {beats: string; at?: never; from?: string | number; to?: string | number; width?: number | string}): Promise<{text: string; file: string}>;
/** Every phrase the film is keyed to (the pacing's holds, the recipe's beats), checked in one pass: the count, then each not said, said more than once, past its nth, in no scene or a moment named with nth or edge, where it is named, with what to write instead. full: every one (default: the first 10 a kind). */
export function anchors(project: ProjectConfig, args?: {full?: boolean | string}): Promise<string>;
/** The film's script as JSON, one spoken scene a line (silent scenes left out): each a ScriptScene. A mark not as written refuses, naming the scene. */
export function script(project: ProjectConfig): Promise<string>;
/** One scene of the script tool's JSON: the scene's own speaker, what is said, `spoken` only when the voice says something else (number slots in words), who says each line (with what the voice says in it, when that differs), and the moments. */
export interface ScriptScene {id: string; speaker?: string; said: string; spoken?: string; lines: (import('../index.js').SpeakerLine & {spoken?: string})[]; moments: import('../index.js').Moment[]}
/** The film (or scenes, or a window) at a glance: a frame every `every` seconds (4), `per` to a sheet (20), labelled with time and scene, as PNGs. */
export function sheet(project: Project, args?: PartArgs & {every?: number | string; per?: number | string; width?: number | string}): Promise<{text: string; file: string; files: string[]}>;
/** A copy of a finished film to send to a person: <name>.share.mp4 (width 854, H.264/AAC, faststart) and <name>.poster.jpg (at 6 s, or a shorter film's middle), beside it or in `out`. */
export function shareCopy(file: string, options?: {width?: number; crf?: number; poster?: number; out?: string | null; ffmpeg?: string}): {video: string; poster: string; seconds: number; bytes: number; width: number; height: number | null};
/** The share copy's defaults: width (px), crf (x264's quality), poster (s). */
export const SHARE_DEFAULTS: Readonly<{width: number; crf: number; poster: number}>;
/** A fast move frame by frame: `frames` (12) consecutive frames at `fps` (30) around one moment (as a still's `at` names one), side by side as a PNG. */
export function strip(project: Project, args: {at: string; frames?: number | string; fps?: number | string; width?: number | string}): Promise<{text: string; file: string}>;
/** A tool: what it runs, what it does, what it takes; `picture` when its result is an image (MCP returns it as one); `load`: 'inputs' when it reads the timed inputs and prepares the film itself (changes), 'config' when it reads the config's film untimed (anchors, script); none: the compiled film. */
export interface Tool {run(project: Project | ProjectSource | ProjectConfig, args: Record<string, unknown>): Promise<string | {text: string; file: string}>; about: string; args: Record<string, string>; picture?: boolean; load?: 'inputs' | 'config'}
export const TOOLS: Readonly<Record<'timeline' | 'review' | 'part' | 'anchors' | 'script' | 'changes' | 'still' | 'sheet' | 'strip', Tool>>;
