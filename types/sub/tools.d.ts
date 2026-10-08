import type {Film} from '../index.js';
/** The film's inputs a project's storyreel.config.mjs returns from film(flags). */
export interface ProjectInputs {storyboard: unknown; recipe: unknown; kits?: unknown[]; root?: string; narrationDir?: string; pacing?: Record<string, unknown>; timings?: unknown;
  layout?: import('../index.js').Layout | null; out?: string; strings?: unknown; data?: unknown; theme?: unknown; cast?: unknown; lang?: string}
export interface Project {film: Film; inputs: ProjectInputs & {voiced: boolean}; cwd: string}
export const CONFIG: 'storyreel.config.mjs';
/** The project's film, compiled once (paced from its voice folder's timings.json when it names one). */
export function loadProject(options?: {config?: string; cwd?: string; [flag: string]: unknown}): Promise<Project>;
export interface PartArgs {scene?: string | string[]; scenes?: string | string[]; handles?: number | string}
export function timeline(project: Project, args?: PartArgs): Promise<string>;
/** loop: 'true' (or true) when the part is made to loop — the end of its own scenes (not the handles) must come round to their start. */
export function review(project: Project, args?: PartArgs & {loop?: boolean | string}): Promise<string>;
export function part(project: Project, args: PartArgs): Promise<string>;
export function still(project: Project, args: {at: string | string[]; width?: number | string}): Promise<{text: string; file: string}>;
/** A fast move frame by frame: `frames` (12) consecutive frames at `fps` (30) around one moment, side by side as a PNG. */
export function strip(project: Project, args: {at: string; frames?: number | string; fps?: number | string; width?: number | string}): Promise<{text: string; file: string}>;
/** A tool: what it runs, what it does, what it takes; `picture` when its result is an image (MCP returns it as one). */
export interface Tool {run(project: Project, args: Record<string, unknown>): Promise<string | {text: string; file: string}>; about: string; args: Record<string, string>; picture?: boolean}
export const TOOLS: Readonly<Record<'timeline' | 'review' | 'part' | 'still' | 'strip', Tool>>;
