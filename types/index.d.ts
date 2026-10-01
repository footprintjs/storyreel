// Types for footprint-storyreel (the code is plain JavaScript; these describe its public surface).
import type {CombinedNarrativeEntry, RuntimeSnapshot} from 'footprintjs';

/** A spoken phrase: [scene, phrase] or [scene, phrase, plus seconds], or the object form. */
export type Beat = [scene: string, phrase: string] | [scene: string, phrase: string, plus: number]
  | {scene: string; phrase: string; edge?: 'start' | 'end'; plus?: number; nth?: number};

/** A silent scene's direction: what happens, and how long it lasts (0.2..20 s). Never spoken. */
export type Direction = [text: string, seconds: number];

/** A scene is spoken (`narration`) or silent (`silent`: directions), never both. */
export type StoryboardScene = {id: string; title?: string; [key: string]: unknown}
  & ({narration: string; silent?: never} | {silent: Direction[]; narration?: never});

export interface Storyboard {
  title?: string;
  scenes: StoryboardScene[];
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

/**
 * A recipe is data: see the README for every key. At run time an unknown top-level key refuses, unless the
 * host application names it in compileFilm's `hostKeys` (keys it reads itself; the engine ignores them).
 */
export interface Recipe {
  story?: {kit: string; [key: string]: unknown};
  /** The older spelling of a whiteboard story: {items, erasers, spots…} without `kit`. */
  whiteboard?: Record<string, unknown>;
  /** The built-in theme's name when compileFilm gets no `theme`. */
  paperStyle?: string;
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

export type SoundType = 'tap' | 'slide' | 'settle' | 'question' | 'chime' | 'door' | 'step' | 'click' | 'whoosh' | 'crumble';
/**
 * A sound at a time. `gain` (0..1) overrides the sound's default; it is relative to its SCENE, because a
 * scene is scaled by one factor set by its loudest moment (a loud door turns down every tap in it).
 */
export interface SoundEvent { time: number; type: SoundType; gain?: number }

export interface Film {
  /** Seconds. */
  total: number;
  clock: Clock;
  timings: Timings;
  sounds: SoundEvent[];
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
  /** Only with compileFilm({…, record: true}): the compile as a footprintjs run. */
  record?: CompileRecord;
}

/**
 * The compile, recorded with footprintjs (compileFilm's `record: true`). Five stages: read inputs, build worlds
 * and stages, guesses and notes, checks, resolve lines. Scope keys: `recipe`, `lines`, `notes`, `strings`,
 * `world.<path>`, `stage.stages[i]`, `guess.guesses[n]`, `note.notes[i]`, `checks.reading|sounds|ready`, and
 * `when.<recipe path>` (seconds) for every line resolved. Detached: it survives structuredClone. Read a
 * slice with footprintjs/trace: `sliceForKey(snapshot.commitLog, key, keysReadFromExecutionTree(snapshot.executionTree))`.
 */
export interface CompileRecord {
  /** The footprintjs narrative, without its live raw values. */
  narrative: Omit<CombinedNarrativeEntry, 'rawValue'>[];
  /** getSnapshot() of the run, written with writeProvenance 'reads-prefix'. */
  snapshot: RuntimeSnapshot;
}

/** What a story kit's compile returns: a world the engine hangs on the paper and draws at any t. */
export interface StoryWorld {
  hang?: number;
  draw(ctx: any, t: number, spot: unknown): void;
  spotAt?(t: number): {cx: number; cy: number; r: number; zoom: number; w: number} | null;
  sounds?: SoundEvent[];
  regionsAt?(t: number): Region[];
  texts?(): {text: string; from: number; to: number; path: string}[];
  /** Settles once the world can draw (e.g. its images have decoded); compileFilm waits for it before drawing recalls and before returning. */
  ready?: Promise<unknown>;
}

/**
 * What a story kit that declares `context: true` is compiled with (frozen). It has no way to draw the film.
 * `library` and `labels` are the recipe's (empty until the recipe carries them).
 */
export interface KitContext {
  readonly clock: Clock;
  readonly motion: {readonly cameraSpeed: number};
  readonly theme: Record<string, unknown>;
  /** The film's root folder, as compileFilm got it. */
  readonly root: string;
  readonly library: Readonly<Record<string, unknown>>;
  readonly labels: Readonly<Record<string, unknown>>;
  /** The real path of a file inside root; a path outside it (a sibling folder, a link out) refuses. */
  insideRoot(file: string): string;
  /** A file's bytes, read only from inside root (insideRoot). */
  readFile(file: string): Uint8Array;
}

/** A plug-in: a story kit draws a world; stage kits add stage types. A story kit on the context contract is a ContextKit. */
export interface Kit {
  name: string;
  story?: {
    /** The motion words it follows, e.g. ['cameraSpeed'] (a speed note refuses a world whose kit lacks it). */
    motion?: string[];
    /** Today's contract: compile(spec, clock, motion). `context: true` is the other contract (ContextKit). */
    context?: false;
    compile(spec: any, clock: Clock, motion: {cameraSpeed: number}): StoryWorld;
  };
  stages?: Record<string, {
    keys?: string[];
    compile(spec: any, context: {clock: Clock; data: unknown; motion: {cameraSpeed: number}}): unknown;
    draw(ctx: any, pen: any, theme: any, handle: any, t: number, cardBox: [number, number, number, number] | null): void;
    card?(handle: any, t: number): {rows: unknown; glow: unknown; pop: unknown};
    place?(handle: any): {at: [number, number]; scale: number};
    sounds?(handle: any): SoundEvent[];
    regions?(handle: any, t: number, cardBox: [number, number, number, number] | null): Region[];
  }>;
}

/** A kit whose story kit declares `context: true`: compiled as compile(spec, context), one frozen KitContext. */
export interface ContextKit extends Omit<Kit, 'story'> {
  story: {
    motion?: string[];
    context: true;
    compile(spec: any, context: KitContext): StoryWorld;
  };
}

/** compileFilm's options; `K` is the kits it takes (see the two signatures below). */
export interface CompileFilmOptions<K = Kit | ContextKit> {
  storyboard: Storyboard; timings: Timings; recipe: Recipe; data?: unknown; kits?: K[];
  theme?: string | Record<string, unknown>; root?: string; strings?: Record<string, string> | null;
  /** Top-level recipe keys the host application reads itself: allowed, and ignored by the engine. */
  hostKeys?: string[];
  /** true: the compile runs as a footprintjs flowchart and the film carries `record` (default false: no record). */
  record?: boolean;
}
// Two signatures, so a kit written inline on today's contract keeps its contextual types (a list that
// mixes both contracts cannot give them: TypeScript cannot tell an unmarked story kit apart from the union).
export function compileFilm(options: CompileFilmOptions<Kit>): Promise<Film>;
export function compileFilm(options: CompileFilmOptions<Kit | ContextKit>): Promise<Film>;

/** What the two loudness passes measured and did (render.mjs · muxWithLoudness). */
export interface Loudness {
  /** FFmpeg's reported normalization type: 'linear' (one fixed gain), 'dynamic' (loudnorm varied the gain), or 'skipped' (silence: nothing to measure). */
  type: 'linear' | 'dynamic' | 'skipped';
  /** What the second pass asked for: integrated loudness (LUFS), true peak (dBTP), loudness range (LU; when the caller set none, the measured range rounded up, 7..50). A skipped pass keeps the caller's target. */
  target: {I: number; TP: number; LRA?: number};
  /** The first pass's measurement of the whole mixed film; -inf (silence) is null. */
  measured: {I: number | null; TP: number | null; LRA: number | null; thresh: number | null; offset: number | null};
  /** Why the pass was skipped: 'the audio is silent: …' for pure silence, else 'could not read: <fields>'. */
  reason?: string;
}

export function renderFilm(options: {
  film: Film; storyboard: Storyboard; timings: Timings; narrationDir?: string | null; out: string;
  width?: number; height?: number; fps?: number; stamp?: string | null; from?: number; to?: number; poster?: number | null;
  intro?: {seconds: number; title?: string; wav?: Uint8Array; draw(ctx: any, t: number, info: {width: number; height: number; handoff: unknown}): void} | null;
  /** Checked before rendering: I -70..-5 (LUFS), TP -9..0 (dBTP), LRA 1..50 (LU, optional); other keys refuse. */
  peakCeilingDBFS?: number; loudness?: {I: number; TP: number; LRA?: number}; ffmpeg?: string;
}): Promise<{out: string; seconds: number; chapters: string[]; poster?: string; loudness: Loudness}>;

/** makeFilm's options; `K` is the kits it takes (two signatures, as compileFilm). */
export interface MakeFilmOptions<K = Kit | ContextKit> {
  storyboard: Storyboard; recipe: Recipe; data?: unknown; kits?: K[]; theme?: string | Record<string, unknown>; root?: string; hostKeys?: string[];
  narrationDir?: string | null; timings?: Timings | null; pacing?: Pacing | null; strings?: Record<string, string> | null; lang?: string | null;
  out: string; render?: Record<string, unknown>;
}
export function makeFilm(options: MakeFilmOptions<Kit>): Promise<{out: string; seconds: number; chapters: string[]; poster?: string; loudness: Loudness; makingOf: string}>;
export function makeFilm(options: MakeFilmOptions<Kit | ContextKit>): Promise<{out: string; seconds: number; chapters: string[]; poster?: string; loudness: Loudness; makingOf: string}>;

export function makeClock(storyboard: Storyboard, timings: Timings): Clock;
export function evenTimings(storyboard: Storyboard, options?: {wordSeconds?: number; lead?: number; tail?: number}): Timings;
/** A silent scene's timing: its directions' words spread evenly over their seconds; alignment method 'directions'. */
export function directionTimings(scene: StoryboardScene, options?: {tail?: number}): SceneTiming;
/** The timings with every silent scene a voice left out filled in by directionTimings; a missing spoken scene refuses. */
export function withDirections(storyboard: Storyboard, timings: Timings): Timings;
/** A scene's text: its narration, or its directions joined (checked: one of the two, well formed). */
export function sceneText(scene: StoryboardScene): string;
export function paceTimings(storyboard: Storyboard, timings: Timings, pacing: Pacing): Timings;
export function applyPacing(options: {runDir: string; board: Storyboard; timings: Timings; pacing: Pacing}): Promise<Timings>;
export function validatePacing(pacing: Pacing, board: Storyboard): void;
export function tailFor(pacing: Pacing, sceneId: string): number;
export function speechIndex(scene: Storyboard['scenes'][number], timing: SceneTiming): unknown;
export function phraseMatches(index: unknown, phrase: string): {start: number; end: number}[];
export function ramp(t: number, at: number, d?: number): number;
export function withStrings<T>(recipe: T, strings: Record<string, string> | null, used?: Set<string>): T;
export function createSound(options: {duration: number; events: SoundEvent[]; peakCeilingDBFS?: number}): {wav: Uint8Array};
export function loadTheme(name?: string): Record<string, unknown>;
export function validateTheme(theme: unknown): void;
export const whiteboardKit: Kit;
export const cartoonKit: Kit;
/** Hashes at `count` evenly spaced moments (default 24), or at the given `times` (seconds, rounded to the millisecond). */
/** Evenly spaced moments (`count`, default 24) or the moments you name (`times`, seconds inside the film, each a distinct millisecond), not both. */
export function frameHashes(film: Film, options?: {count?: number; width?: number; times?: undefined} | {count?: undefined; width?: number; times: number[]}): Record<string, string>;
export function changedFrames(pinned: Record<string, string>, now: Record<string, string>): string[];
export function contactSheet(film: Film, options?: {moments?: {t: number; label: string; kind?: string}[]; columns?: number; width?: number}): Promise<Uint8Array>;
