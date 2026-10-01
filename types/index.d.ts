// Types for footprint-storyreel (the code is plain JavaScript; these describe its public surface).

/** A spoken phrase: [scene, phrase] or [scene, phrase, plus seconds], or the object form. */
export type Beat = [scene: string, phrase: string] | [scene: string, phrase: string, plus: number]
  | {scene: string; phrase: string; edge?: 'start' | 'end'; plus?: number; nth?: number};

export interface Storyboard {
  title?: string;
  scenes: {id: string; title?: string; narration: string; [key: string]: unknown}[];
  [key: string]: unknown;
}

export interface SceneTiming {
  id: string;
  duration: number;
  words: {text: string; start: number; end: number}[];
  alignment: {status: 'available'; [key: string]: unknown};
  audio?: string;
  [key: string]: unknown;
}
export interface Timings { scenes: SceneTiming[]; [key: string]: unknown }

export interface Pacing {
  sceneTail: number;
  holds: {scene: string; after: string; seconds: number}[];
  tails?: Record<string, number>;
  voiceSpeed?: number;
}

/** A director's note: its words, and exactly one camera word. */
export type DirectorNote =
  | {note: string; speed: number}
  | {note: string; cut: string}
  | {note: string; push: {at: [number, number]; zoom?: number; from: Beat; to: Beat; seconds?: number}};

/** A recipe is data: see the README for every key. */
export interface Recipe {
  story?: {kit: string; [key: string]: unknown};
  pushIn?: {after: string; rest: number; turn?: number; zoom?: number; hang?: number; caption: string};
  card?: Record<string, unknown>;
  stages?: {type: string; scene: string; [key: string]: unknown}[];
  guesses?: {after: Beat; question: string; answer?: string; place?: 'top' | 'center' | 'bottom'; until?: Beat}[];
  notes?: DirectorNote[];
  recalls?: Record<string, Beat>;
  poster?: Beat;
  reading?: 'report' | 'refuse';
  [key: string]: unknown;
}

export interface Clock {
  total: number;
  offsets: number[];
  start(scene: string): number;
  end(scene: string): number;
  spokenEnd(scene: string): number;
  at(beat: Beat): number;
  pauseAfter(beat: Beat): {start: number; end: number};
  locate(t: number): {index: number; id: string; time: number};
}

/** What is drawn where: a box on the 1600×900 frame and the recipe entry that drew it. */
export interface Region { box: [number, number, number, number]; path: string; label: string }

export type SoundType = 'tap' | 'slide' | 'settle' | 'question' | 'chime';

export interface Film {
  /** Seconds. */
  total: number;
  clock: Clock;
  timings: Timings;
  sounds: {time: number; type: SoundType}[];
  /** Draw the film at t into a context whose transform maps 1600×900 onto the frame. Pure. */
  frame(ctx: CanvasRenderingContext2D | unknown, t: number): void;
  /** Every phrase the recipe named, when it is said, and the recipe entry that asked for it. */
  beats: {ref: Beat; t: number; path: string | null}[];
  strings: string[];
  /** The director's notes as applied, in the order written. */
  notes: Record<string, unknown>[];
  /** Lines shown for less time than they need to be read. */
  reading: {path: string; text: string; at: number; seconds: number; needs: number}[];
  /** The recipe's poster frame (seconds), or null. */
  posterAt: number | null;
  /** Stills worth checking: each settled picture and each change half way. */
  moments(): {t: number; kind: 'settled' | 'moving'; label: string}[];
  regionsAt(t: number): Region[];
  pointAt(t: number, x: number, y: number): {frame: [number, number]; world?: {path: string; at: [number, number]}};
}

/** A plug-in: a story kit draws a world; stage kits add stage types. */
export interface Kit {
  name: string;
  story?: {
    /** The motion words it follows, e.g. ['cameraSpeed'] (a speed note refuses a world whose kit lacks it). */
    motion?: string[];
    compile(spec: any, clock: Clock, motion: {cameraSpeed: number}): {
      hang?: number;
      draw(ctx: any, t: number, spot: unknown): void;
      spotAt?(t: number): {cx: number; cy: number; r: number; zoom: number; w: number} | null;
      sounds?: {time: number; type: SoundType}[];
      regionsAt?(t: number): Region[];
      texts?(): {text: string; from: number; to: number; path: string}[];
    };
  };
  stages?: Record<string, {
    keys?: string[];
    compile(spec: any, context: {clock: Clock; data: unknown; motion: {cameraSpeed: number}}): unknown;
    draw(ctx: any, pen: any, theme: any, handle: any, t: number, cardBox: [number, number, number, number] | null): void;
    card?(handle: any, t: number): {rows: unknown; glow: unknown; pop: unknown};
    place?(handle: any): {at: [number, number]; scale: number};
    sounds?(handle: any): {time: number; type: SoundType}[];
    regions?(handle: any, t: number, cardBox: [number, number, number, number] | null): Region[];
  }>;
}

export function compileFilm(options: {
  storyboard: Storyboard; timings: Timings; recipe: Recipe; data?: unknown; kits?: Kit[];
  theme?: string | Record<string, unknown>; root?: string; strings?: Record<string, string> | null;
}): Promise<Film>;

export function renderFilm(options: {
  film: Film; storyboard: Storyboard; timings: Timings; narrationDir?: string | null; out: string;
  width?: number; height?: number; fps?: number; stamp?: string | null; from?: number; to?: number; poster?: number | null;
  intro?: {seconds: number; title?: string; wav?: Uint8Array; draw(ctx: any, t: number, info: {width: number; height: number; handoff: unknown}): void} | null;
  peakCeilingDBFS?: number; loudness?: {I: number; TP: number}; ffmpeg?: string;
}): Promise<{out: string; seconds: number; chapters: string[]; poster?: string}>;

export function makeFilm(options: {
  storyboard: Storyboard; recipe: Recipe; data?: unknown; kits?: Kit[]; theme?: string | Record<string, unknown>; root?: string;
  narrationDir?: string | null; timings?: Timings | null; pacing?: Pacing | null; strings?: Record<string, string> | null; lang?: string | null;
  out: string; render?: Record<string, unknown>;
}): Promise<{out: string; seconds: number; chapters: string[]; poster?: string; makingOf: string}>;

export function makeClock(storyboard: Storyboard, timings: Timings): Clock;
export function evenTimings(storyboard: Storyboard, options?: {wordSeconds?: number; lead?: number; tail?: number}): Timings;
export function paceTimings(storyboard: Storyboard, timings: Timings, pacing: Pacing): Timings;
export function applyPacing(options: {runDir: string; board: Storyboard; timings: Timings; pacing: Pacing}): Promise<Timings>;
export function validatePacing(pacing: Pacing, board: Storyboard): void;
export function tailFor(pacing: Pacing, sceneId: string): number;
export function speechIndex(scene: Storyboard['scenes'][number], timing: SceneTiming): unknown;
export function phraseMatches(index: unknown, phrase: string): {start: number; end: number}[];
export function ramp(t: number, at: number, d?: number): number;
export function withStrings<T>(recipe: T, strings: Record<string, string> | null, used?: Set<string>): T;
export function createSound(options: {duration: number; events: {time: number; type: SoundType}[]; peakCeilingDBFS?: number}): {wav: Uint8Array};
export function loadTheme(name?: string): Record<string, unknown>;
export function validateTheme(theme: unknown): void;
export const whiteboardKit: Kit;
export const cartoonKit: Kit;
/** Hashes at `count` evenly spaced moments (default 24), or at the given `times` (seconds, rounded to the millisecond). */
export function frameHashes(film: Film, options?: {count?: number; width?: number; times?: number[]}): Record<string, string>;
export function changedFrames(pinned: Record<string, string>, now: Record<string, string>): string[];
export function contactSheet(film: Film, options?: {moments?: {t: number; label: string; kind?: string}[]; columns?: number; width?: number}): Promise<Uint8Array>;
