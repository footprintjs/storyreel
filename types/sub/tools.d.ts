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
  voiceCheck?: 'report' | 'refuse'; claims?: 'report' | 'refuse'; approval?: unknown}
/** The project's inputs, timed (from its voice, or evenly) but not compiled. */
export interface ProjectSource {inputs: ProjectInputs & {voiced: boolean}; cwd: string}
export interface Project extends ProjectSource {film: Film}
export const CONFIG: 'storyreel.config.mjs';
/** The project's inputs from its config's film(flags), timed and not compiled (what changes reads: it prepares the film as the full render does). */
export function loadInputs(options?: {config?: string; cwd?: string; [flag: string]: unknown}): Promise<ProjectSource>;
/** The project's full render as makeFilm's options: its film, its video in the project's out folder (film.mp4), the config's render (its layout by default) and code. */
export function fullRender(project: ProjectSource): import('../index.js').MakeFilmOptions;
/** A time on the film clock as a command takes it: seconds (12.5) or m:ss (0:12); anything else refuses, naming `name`. */
export function clockSeconds(value: string | number, name?: string): number;
/** The tools' defaults: a part's handles (seconds either side), a strip's frames and their rate, a still's width (px). */
export const TOOL_DEFAULTS: Readonly<{handles: number; frames: number; fps: number; width: number}>;
/** The project's film, compiled once (paced from its voice folder's timings.json when it names one). */
export function loadProject(options?: {config?: string; cwd?: string; [flag: string]: unknown}): Promise<Project>;
/** A part: its scenes, or a window on the film clock (from and to: seconds or m:ss), with the seconds shown either side. */
export interface PartArgs {scene?: string | string[]; scenes?: string | string[]; from?: number | string; to?: number | string; handles?: number | string}
export function timeline(project: Project, args?: PartArgs): Promise<string>;
/** loop: 'true' (or true) when the part is made to loop — the end of its own scenes (not the handles) must come round to their start. */
export function review(project: Project, args?: PartArgs & {loop?: boolean | string}): Promise<string>;
export function part(project: Project, args: PartArgs): Promise<string>;
/** What an edit changed before the full render (previewChanges on fullRender): one line per changed range, then the count; render: true draws only those pieces (kept) and writes a short clip of them. */
export function changes(project: ProjectSource, args?: {render?: boolean | string; handles?: number | string}): Promise<string>;
export function still(project: Project, args: {at: string | string[]; width?: number | string}): Promise<{text: string; file: string}>;
/** A fast move frame by frame: `frames` (12) consecutive frames at `fps` (30) around one moment, side by side as a PNG. */
export function strip(project: Project, args: {at: string; frames?: number | string; fps?: number | string; width?: number | string}): Promise<{text: string; file: string}>;
/** A tool: what it runs, what it does, what it takes; `picture` when its result is an image (MCP returns it as one); `compile: false` when it reads the inputs and prepares the film itself. */
export interface Tool {run(project: Project | ProjectSource, args: Record<string, unknown>): Promise<string | {text: string; file: string}>; about: string; args: Record<string, string>; picture?: boolean; compile?: false}
export const TOOLS: Readonly<Record<'timeline' | 'review' | 'part' | 'changes' | 'still' | 'strip', Tool>>;
