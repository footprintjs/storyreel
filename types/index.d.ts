// Types for footprint-storyreel (the code is plain JavaScript; these describe its public surface).
import type {CombinedNarrativeEntry, RuntimeSnapshot} from 'footprintjs';
import type {EaseName} from './sub/ease.js';

/** A spoken phrase: [scene, phrase] or [scene, phrase, plus seconds], or the object form. */
export type Beat = [scene: string, phrase: string] | [scene: string, phrase: string, plus: number]
  | {scene: string; phrase: string; edge?: 'start' | 'end'; plus?: number; nth?: number};

/** A silent scene's direction: what happens, and how long it lasts (0.2..20 s). Never spoken. */
export type Direction = [text: string, seconds: number];

/** A scene is spoken (`narration`) or silent (`silent`: directions), never both. */
export type StoryboardScene = {id: string; title?: string; /** Who says the scene: a name the voice step maps to a voice; kits read it through clock.speaking(t). */ speaker?: string;
  /** Number slots: [shown, spoken] — the captions show `shown` ("16.67 ms"), the voice says `spoken` ("sixteen point six seven milliseconds"; words only). Each shown text appears in the narration, in order. */
  say?: [string, string][]; [key: string]: unknown}
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
  | {note: string; push: {at: [number, number]; zoom?: number; on?: never; size?: never; from: Beat; to: Beat; seconds?: number}}
  /** A push on a thing the world's kit NAMES in its regions, framed medium (half the frame), close or insert (a detail): the zoom follows from its size. */
  | {note: string; push: {on: string; size?: Framing; at?: never; zoom?: never; from: Beat; to: Beat; seconds?: number}};
/** How much of the frame a pushed-on thing fills (notes.mjs · FRAMINGS): medium ½, close ~¾, insert nearly all. */
export type Framing = 'medium' | 'close' | 'insert';
/** A fact a shot states: a word, a number or true/false. */
export type Fact = string | number | boolean;
/**
 * What a shot says about itself (shots.mjs): `intent` — what it is for, one sentence of at most 140 characters;
 * `continuity` — the facts true when it starts and when it ends. A shot's start must agree with what the shots
 * before it left (the film refuses a contradiction, naming both shots and the fact).
 */
export interface ShotPlan {
  intent?: string;
  continuity?: {start?: Record<string, Fact>; end?: Record<string, Fact>};
  /**
   * What the viewer must take in during the shot, one at a time: `what` (words), `at` (the phrase it starts on),
   * `min` (the least seconds it needs, 0.5–15; 2 by default) and `region` (the named thing it is about, optional).
   * Two at once, one the shot ends before, or one about a thing that is not there are listed in film.reads.
   */
  reads?: Read[];
}
/** One declared read (ShotPlan.reads). */
export interface Read { what: string; at: Beat; min?: number; region?: string }

/**
 * A recipe is data: see the README for every key. At run time an unknown top-level key refuses, unless the
 * host application names it in compileFilm's `hostKeys` (keys it reads itself; the engine ignores them).
 */
export interface Recipe {
  /** The opening world; its `intent` and `continuity` are the engine's (read, then left out of what the kit gets). */
  story?: {kit: string; [key: string]: unknown} & ShotPlan;
  /** The older spelling of a whiteboard story: {items, erasers, spots…} without `kit`. */
  whiteboard?: Record<string, unknown>;
  /** The built-in theme's name when compileFilm gets no `theme`. */
  paperStyle?: string;
  pushIn?: {after: string; rest: number; turn?: number; zoom?: number; hang?: number; caption: string};
  card?: Record<string, unknown>;
  /** A world stage's `intent` and `continuity` sit on the stage, beside `world` (inside `world` they refuse). */
  stages?: ({type: string; scene: string; enter?: Enter; [key: string]: unknown} & ShotPlan)[];
  guesses?: {after: Beat; question: string; answer?: string; place?: 'top' | 'center' | 'bottom'; until?: Beat}[];
  notes?: DirectorNote[];
  recalls?: Record<string, Beat>;
  poster?: Beat;
  /** Reading time: 'report' (the default), 'refuse', or {rule, pace: 'words' (0.3 s a word, at least 1 s) | 'letters' (1.5 s + a fifteenth of a second a letter)}; the rule covers declared reads too. */
  reading?: 'report' | 'refuse' | {rule?: 'report' | 'refuse'; pace?: 'words' | 'letters'};
  /** Too much, too fast (shots.mjs · WATCHING): 'report' (the default: film.watching lists it) or 'refuse'. */
  watching?: 'report' | 'refuse';
  /** What the sound asks of the ear (listening.mjs): 'report' (the default: film.listening lists it) or 'refuse'. */
  listening?: 'report' | 'refuse';
  [key: string]: unknown;
}

/** One finding of the watching check (shots.mjs · tooMuchTooFast). */
export type Watching = {kind: 'burst'; path: string; where: string; at: number; moments: number; seconds: number};

/** The built-in transitions (transitions.mjs · TRANSITIONS). */
export type TransitionName = 'cut' | 'fade' | 'dip' | 'wipe' | 'split' | 'clock' | 'iris' | 'push' | 'slide' | 'whip' | 'zoom' | 'page' | 'through' | 'match';
/**
 * A shot's entrance: a transition's name (a kit's own too), or its name with settings — `seconds` (0.2–3),
 * `ease`, `sound` (a sound, or false for none) and the transition's own: `from` (push, slide, whip, wipe:
 * left | right | top | bottom), `line` (split: vertical | horizontal), `at` (iris, zoom: [x, y]), `color`
 * (dip: a hex colour), `region` (through, match: the name of a thing in the picture it leaves — required),
 * `into` (match: the thing's name in the new picture, when it differs), `shape` (through: box | round).
 * Left out: a fade.
 */
export type Enter = TransitionName | (string & {}) | ({type: TransitionName | (string & {}); seconds?: number; ease?: EaseName; sound?: SoundType | false;
  from?: 'left' | 'right' | 'top' | 'bottom'; line?: 'vertical' | 'horizontal'; at?: [number, number]; color?: string;
  region?: string; into?: string; shape?: 'box' | 'round'; [setting: string]: unknown});
/** A transition's setting: one of some words, a point, a colour or a number, each with its default; or the name of a thing in the picture (no default: the recipe must give it; default null: it may be left out). */
export type TransitionSetting = {oneOf: readonly string[]; default: string} | {point: true; default: readonly [number, number]}
  | {color: true; default: string} | {number: readonly [number, number]; default: number} | {name: true; default?: string | null};
/** A box on the 1600×900 frame: [x0, y0, x1, y1]. */
export type FrameBox = readonly [number, number, number, number];
/** What a transition's draw is given (transitions.mjs): how far (eased), the two pictures, its settings, a scratch picture, the theme. */
export interface TransitionDraw {
  /** How far the change has come, 0..1, eased (an overshooting ease goes past 1 only where the transition allows it). */
  e: number;
  /** Draw the leaving picture into ctx (the 1600×900 frame through ctx's transform). */
  from(ctx: any): void;
  /** Draw the arriving picture into ctx. */
  to(ctx: any): void;
  /** The settings, checked, with the defaults filled in. */
  p: Readonly<Record<string, unknown>>;
  /** paint(c) into a scratch picture, laid over ctx at alpha: a see-through picture, drawn whole. */
  ghost(alpha: number, paint: (ctx: any) => void): void;
  theme: Record<string, unknown>;
  /** Where the things the transition names (its `regions`) are on the frame: the leaving picture's at the change's first moment, the arriving one's at its last. */
  boxes: Readonly<{from: Readonly<Record<string, FrameBox>>; to: Readonly<Record<string, FrameBox>>}>;
}
/** A transition a kit adds (kit.transitions): drawn through the same contract as the built-in ones; it must cover the whole frame at every e. */
export interface Transition {
  /** What a browser groups it under (the built-in families: cut, dissolve, wipe, iris, motion, zoom, page). */
  family: string;
  /** Its default length, 0.2–3 s. */
  seconds: number;
  ease: EaseName;
  sound: SoundType | null;
  /** true when an overshooting ease (back, spring) may drive it. */
  overshoot?: boolean;
  params?: Record<string, TransitionSetting>;
  /** The things it looks for, by name, in the picture it leaves (`from`) and the one it arrives at (`to`): the film finds them once and passes their boxes to draw. */
  regions?(p: Readonly<Record<string, unknown>>): {from?: string[]; to?: string[]};
  draw(ctx: any, args: TransitionDraw): void;
}
/** A built-in transition (the cut draws nothing: it is no transition at all). */
export interface BuiltInTransition extends Omit<Transition, 'draw'> { draw: Transition['draw'] | null }
export const TRANSITIONS: Readonly<Record<TransitionName, Readonly<BuiltInTransition>>>;
export const TRANSITION_NAMES: readonly TransitionName[];
/** The built-in transitions and every kit's own, each checked; a kit may not reuse a built-in name or another kit's. */
export function transitionCatalog(kits?: Kit[]): Record<string, Readonly<BuiltInTransition>>;
/** The transitions on one image (a row each, a still per moment of A becoming B), as a PNG. */
export function transitionSheet(options?: {catalog?: Record<string, Readonly<BuiltInTransition>>; moments?: number[]; width?: number}): Promise<Uint8Array>;

export interface Clock {
  total: number;
  offsets: number[];
  start(scene: string): number;
  end(scene: string): number;
  spokenEnd(scene: string): number;
  at(beat: Beat): number;
  pauseAfter(beat: Beat): {start: number; end: number};
  locate(t: number): {index: number; id: string; time: number};
  /** The words said in a scene, on the whole-lesson clock (none in a silent scene). */
  words(scene: string): {text: string; start: number; end: number}[];
  /** The words to show for scene i (captions), on the scene's own clock: each number slot's spoken run collapsed back into its digits, where the slot is. */
  shownWords(i: number): {text: string; start: number; end: number}[];
  /** Who is saying a word at t (the scene's `speaker`, or null), or null between words: for a talking mouth. */
  speaking(t: number): {scene: string; speaker: string | null; word: string; start: number; end: number} | null;
  /** Every character's turn to speak (a scene with a `speaker`, first said word to last), in order. */
  turns(): {scene: string; speaker: string; start: number; end: number}[];
  /**
   * Where `who` looks at t: at the character speaking (a listener looks at the speaker), turning `turn` seconds
   * (default 0.3) before their first word and back `hold` seconds (default 0.5) after their last; null when nobody
   * else speaks. A speaker never looks at itself; a narrator is nobody on screen. One speaker's turns in a row hold the
   * look; at a hand-over the stronger look wins and `also` names the other, so a kit can blend.
   */
  gaze(t: number, who: string, options?: {turn?: number; hold?: number}): {at: string; amount: number; also?: {at: string; amount: number}} | null;
}

/** What is drawn where: a box on the 1600×900 frame and the recipe entry that drew it; `name`, when a kit gives one, is what a push can frame (`on`). */
export interface Region { box: [number, number, number, number]; path: string; label: string; name?: string }

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
  /** Every declared read (ShotPlan.reads), timed, with what is wrong with it if anything (two at once, too late, a region not there). */
  reads: {path: string; what: string; at: number; min: number; region?: string; problem?: string}[];
  /** Every shot — the story, then each stage — on screen from `from` to `to`, with what it says it is for and the facts it starts and ends with (null when it states none). */
  shots: {path: string; where: string; scene: string; from: number; to: number; intent: string | null; start: Record<string, Fact> | null; end: Record<string, Fact> | null; moments: number}[];
  /** Bursts: more than 4 moments in 2 s of one shot — too fast to take in. */
  watching: Watching[];
  /** What the sound asks of the ear: a sound on most changes of picture, or the same cue twice running (listening.mjs). */
  listening: ListeningFinding[];
  /**
   * The film as rows of pictures (segments.mjs plans renders from them): `from` — when the row's picture starts to
   * arrive (its entrance begins); `paths` — the recipe entries that draw it; `enter` — how it arrives (null for the
   * first row). A film with a pushIn is one row (`pushIn: true`).
   */
  rows: FilmRow[];
  /** What is drawn over every shot for a while: the guess cards ({path: 'guesses[n]', from, to}). */
  overlays: readonly {path: string; from: number; to: number}[];
  /** What the film was made from, hashed: its storyboard, timings, recipe, strings, data, theme and every file it read through its root. */
  inputs: FilmInputs;
  /** The mouths drawn at t (each kit on screen that draws one says so: mouthsAt), with the recipe entry that drew it. */
  mouthsAt(t: number): {who: string | null; open: number; path: string}[];
  /** The recipe's poster frame (seconds), or null. */
  posterAt: number | null;
  /** Stills worth checking: each settled picture and each change half way. */
  moments(): {t: number; kind: 'settled' | 'moving'; label: string}[];
  regionsAt(t: number): Region[];
  pointAt(t: number, x: number, y: number): {frame: [number, number]; world?: {path: string; at: [number, number]}};
  /** The theme the film is drawn with: a layout's bands take its paper, ink and sans type. */
  theme: Record<string, unknown>;
  /** Only with compileFilm({…, record: true}): the compile as a footprintjs run. */
  record?: CompileRecord;
}

/**
 * The compile, recorded with footprintjs (compileFilm's `record: true`). Five stages: read inputs, build worlds
 * and stages, guesses and notes, checks, resolve lines. Scope keys: `recipe`, `lines`, `notes`, `strings`,
 * `world.<path>`, `stage.stages[i]`, `guess.guesses[n]`, `note.notes[i]`, `checks.reading|watching|continuity|sounds|ready`, and
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
  /** The mouths it draws at t (who: the speaker each belongs to, null for the narrator; open: 0..1), for the lip-sync check. */
  mouthsAt?(t: number): {who: string | null; open: number}[];
  /**
   * A held layer, drawn on the frame (1600×900) over the picture and outside its camera: a transition or a director's push
   * never moves it (a presenter in the corner, a title band). Through a change of picture the leaving shot's layer crosses
   * into the arriving one's, exactly: the same layer in both stays itself. A film with a pushIn draws none.
   */
  overlay?(ctx: any, t: number): void;
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

/** A plug-in: a story kit draws a world; stage kits add stage types; a kit may add transitions. A story kit on the context contract is a ContextKit. */
export interface Kit {
  name: string;
  /** Transitions a recipe can name in a shot's `enter`, as it names the built-in ones. */
  transitions?: Record<string, Transition>;
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
    /** The mouths the stage draws at t, for the lip-sync check. */
    mouthsAt?(handle: any, t: number): {who: string | null; open: number}[];
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
  /** Each role measured apart before the mix (integrated loudness, LUFS; null when there is none): the effects stay well under the voice. */
  roles?: {voice: number | null; effects: number | null};
}
/** One thing the sound asks too much of the ear for (listening.mjs). */
export interface ListeningFinding { kind: 'every-change' | 'same-twice' | 'effects-loud'; at: number; where?: string; text: string }

/** The shapes a film is posted in (layout.mjs): landscape 1920×1080, square 1080×1080, portrait 1080×1350, vertical 1080×1920 (portrait and vertical show a 4:3 crop). */
export type FormatName = 'landscape' | 'square' | 'portrait' | 'vertical';
/** A band's box in output pixels: [x, y, width, height]. */
export type Box = [x: number, y: number, width: number, height: number];
/**
 * A version of the film for a platform: its format, a title band (not in landscape), captions burned in from
 * the word timings, crop keys that follow the action (portrait and vertical: {at: beat, x, width?}), and the
 * bands' colours (default: the film's paper and ink). Unknown keys refuse.
 */
export interface Layout {
  format: FormatName;
  header?: {title: string; sub?: string; box?: Box} | false;
  captions?: boolean | {maxWords?: number; size?: number; box?: Box};
  /** Portrait and vertical: the crop's centre (x on the 1600-wide frame) and, optionally, its width (400–1600; up to the whole frame). */
  crop?: {at: Beat; x: number; width?: number}[];
  background?: string;
  ink?: string;
}
export const FORMAT_NAMES: readonly FormatName[];
/** A layout compiled for a film: the output size, where the film and the bands are, and the two drawing passes. */
export function compileLayout(film: Film, layout: Layout): {width: number; height: number; format: FormatName;
  boxes: {film: Box; header?: Box; captions?: Box}; picture(ctx: any, t: number): void; overlay(ctx: any, t: number, options?: {still?: boolean}): void};

/** One row of pictures (Film.rows). */
export interface FilmRow { from: number; start: number; paths: string[]; enter: {type: string; seconds: number; lead: number} | null; pushIn?: boolean }

/** A caption chunk on the film clock: its words, each timed. */
export interface CaptionChunk { start: number; end: number; words: {text: string; start: number; end: number}[] }
/** The spoken words in chunks (never a silent scene's directions): maxWords 1–20, maxChars ≥ 12, broken after a clause or a sentence. */
export function captionChunks(film: Film, options?: {maxWords?: number; maxChars?: number; breaks?: 'clause' | 'sentence'}): CaptionChunk[];
/** A WebVTT or SRT file's text, moved onto a video's clock (t + offset) and cut to [from, to] (film time). */
export function captionFile(chunks: CaptionChunk[], kind?: 'vtt' | 'srt', options?: {offset?: number; from?: number; to?: number; lineChars?: number}): string;

export function renderFilm(options: {
  film: Film; storyboard: Storyboard; timings: Timings; narrationDir?: string | null; out: string;
  width?: number; height?: number; fps?: number; stamp?: string | null; from?: number; to?: number; poster?: number | null;
  intro?: {seconds: number; title?: string; wav?: Uint8Array; draw(ctx: any, t: number, info: {width: number; height: number; handoff: unknown}): void} | null;
  /** Checked before rendering: I -70..-5 (LUFS), TP -9..0 (dBTP), LRA 1..50 (LU, optional); other keys refuse. */
  peakCeilingDBFS?: number; loudness?: {I: number; TP: number; LRA?: number}; ffmpeg?: string;
  /** A version for a platform: the output takes the format's size (width or height beside it refuses); only landscape takes an intro. */
  layout?: Layout | null;
  /** Each frame the average of `subframes` (2–16) moments over `shutter` (0.1–1, default 0.5) of its time; a number is the subframes. */
  motionBlur?: number | {subframes: number; shutter?: number} | null;
  /** Caption files beside the video (captions.vtt, captions.srt) on its clock: true for both, or the kinds. */
  captionFiles?: boolean | ('vtt' | 'srt')[];
  /** How the picture is made: wholeVideo() (the default: every frame in one pass) or segmentedVideo({...}) (cached segments, joined). */
  video?: VideoStrategy;
}): Promise<{out: string; seconds: number; chapters: string[]; poster?: string; format?: FormatName; captions?: {vtt?: string; srt?: string}; loudness: Loudness; listening: ListeningFinding[]; video?: SegmentsReport}>;

/** A way to make the picture (segments.mjs): plan the parts, make each one, join them; render runs the three in order. */
export interface VideoStrategy {
  name: string;
  plan(job: unknown): unknown[];
  one(job: unknown, part: unknown): Promise<unknown>;
  join(job: unknown, done: unknown[]): {file: string; report?: unknown} | Promise<{file: string; report?: unknown}>;
  render(job: unknown): Promise<{file: string; report?: unknown}>;
}
/** One segment's fate in a segmented render. */
export interface SegmentReport { index: number; from: number; to: number; frames: number; scenes: string[]; key: string; status: 'rendered' | 'reused'; why?: string }
/** What a segmented render did: how many segments were drawn and how many were reused, and each one. */
export interface SegmentsReport { strategy: 'segments'; store: string; reused: number; rendered: number; note?: string; segments: SegmentReport[] }
/** Where segments are kept between renders (folderStore(dir) is the default): get by key, put a file under a key. */
export interface SegmentStore { name: string; dir?: string; get(key: string): {file: string; manifest: Record<string, unknown>} | null; put(key: string, file: string, manifest: Record<string, unknown>): string }
/** How segment files are joined into one video (ffmpegJoin() is the default: no re-encode). */
export interface SegmentJoiner { name: string; join(files: string[], out: string): string }
/** The default strategy: every frame in one pass. */
export function wholeVideo(): VideoStrategy;
/**
 * Re-render only what changed: the film in segments (one per row of pictures, rows shorter than minSeconds joined),
 * each kept in the store under a key built from what draws it (its entries, the guess cards over it, its lines, words
 * and notes, film.inputs, the frame settings, the code), reused when its key AND a spot check of `samples` frames —
 * painted as the video shows them, at the same places in the segment — match, drawn again otherwise (or when `force`
 * names it: an index or a scene id), then joined (by default with the render's own FFmpeg). The sound is mixed for
 * the whole film each time. An intro or a part (from, to) refuses: use wholeVideo().
 */
export function segmentedVideo(options: {store: SegmentStore; recipe: Recipe; code?: string | null; joiner?: SegmentJoiner | null; force?: (number | string)[]; samples?: number; minSeconds?: number; parallel?: number}): VideoStrategy;
/** Keep segments as <key>.mp4 + <key>.json in one folder; a segment lands whole or not at all, and a file cut short is never reused. */
export function folderStore(dir: string): SegmentStore;
/** Join segment files with FFmpeg's concat demuxer, without re-encoding. */
export function ffmpegJoin(options?: {ffmpeg?: string}): SegmentJoiner;
/** One planned segment: frames [f0, f1), seconds [from, to), the recipe entries that draw it, the row an entrance (or a blurred cut) also draws, the scenes it covers. */
export interface Segment { index: number; f0: number; f1: number; from: number; to: number; paths: string[]; before: string[] | null; scenes: string[] }
/** The film's segments: one per row of pictures, on whole frames, covering every frame once and in order (a row that never shows alone joins the next); `blur`: frames are drawn with motion blur. */
export function planSegments(film: Film, options?: {fps?: number; frames?: number; minSeconds?: number; blur?: boolean}): Segment[];
/** A segment's cache key (on its own clock, so a segment further on keeps it when an earlier scene grows by whole frames). */
export function segmentKey(film: Film, segment: Segment, options: {recipe: Recipe; storyboard?: Storyboard | null; pixels: Record<string, unknown>; code?: string | null; fps?: number; margin?: number; extra?: {poster?: unknown; recalls?: unknown}}): string;
/** A fingerprint of drawing code: every file under the folders given, hashed in path order. */
export function codeFingerprint(paths: string[], options?: {extensions?: string[]}): string;

/** What a film was made from, hashed (keys sorted first: reformatting changes nothing): film.inputs, and makeFilm adds the pacing, the voice and the kits' code. */
export interface FilmInputs { storyboard: string; timings: string; recipe: string; strings: string | null; data: string | null; theme: string;
  /** Every file the film read through its root, by its path from the root. */
  files: Readonly<Record<string, string>>; pacing?: string; voice?: string; code?: string }
/** What a person approved: who, when, the render they watched, and what it was made from. */
export interface Approval { schemaVersion: 2; approved: string; by: string; note?: string; render?: string; inputs: FilmInputs }
/** Approve a render as it was watched, from its making-of record (the path of its making-of.json, or the object). */
export function approveFilm(options: {record: string | {inputs: FilmInputs; out?: string}; by: string; note?: string | null; at?: Date}): Approval;
/** Whether a film is still what was approved: {ok, changed} — which inputs differ, a file named by its path. */
export function checkApproval(approval: Approval, inputs: FilmInputs): {ok: boolean; changed: string[]};

/** One thing a check on the finished file found: where (seconds in the file), how serious ('problem': wrong; 'look': worth a look), what. */
export interface FinishedFinding { check: FinishedCheckName; at: number; severity: 'problem' | 'look'; text: string }
export type FinishedCheckName = 'duration' | 'blank' | 'flash' | 'handovers' | 'voice' | 'lipsync' | 'captions';
/** What the checks on a finished file found: `ok` when nothing is a problem; a check that needs what was not given is skipped, saying why. */
export interface FinishedReport { file: string; seconds: number; fps: number; frames: number | null; checked: FinishedCheckName[]; skipped: {check: FinishedCheckName; why: string}[]; findings: FinishedFinding[]; ok: boolean }
/** Reads a finished file for the checks (finished.mjs · ffmpegProbe is the default). */
export interface VideoProbe {
  name: string;
  probe(file: string): {seconds: number; video: {seconds: number; fps: number; width: number; height: number; frames: number | null}; audio: {seconds: number} | null};
  frames(file: string, size: {width: number; height: number}, each: (index: number, grey: Uint8Array) => void): Promise<number>;
  sound(file: string, options?: {rate?: number}): Float32Array;
}
/**
 * Check a finished video: picture and sound lengths, blank stretches, flash frames, hand-overs a frame early or late and
 * joins that repeat a frame, the voice there and lips in sync with it (voiced renders), captions in order and on their words. With the film it was
 * made from, what the film meant (a dip to black, a cut, a silent scene) is never reported.
 */
export function checkVideo(options: {file: string; film?: Film | null; intro?: number; captions?: string | null; joins?: number[]; voiced?: boolean; expect?: {seconds?: number; tolerance?: number}; checks?: FinishedCheckName[]; probe?: VideoProbe}): Promise<FinishedReport>;
/** A caption file's cues (WebVTT or SRT): [{start, end, text}]. */
export function readCaptions(text: string): {start: number; end: number; text: string}[];
export const FINISHED_CHECK_NAMES: readonly FinishedCheckName[];

/** makeFilm's options; `K` is the kits it takes (two signatures, as compileFilm). */
export interface MakeFilmOptions<K = Kit | ContextKit> {
  storyboard: Storyboard; recipe: Recipe; data?: unknown; kits?: K[]; theme?: string | Record<string, unknown>; root?: string; hostKeys?: string[];
  narrationDir?: string | null; timings?: Timings | null; pacing?: Pacing | null; strings?: Record<string, string> | null; lang?: string | null;
  out: string; render?: Record<string, unknown>;
  /** Refuse to render anything but what this approval locked: anything the film is made from, changed since (the record keeps who approved it, when, and what is not locked). */
  approval?: Approval | null;
  /** The voice folder's word-check.json: 'report' (the default: the record lists low and unheard words) or 'refuse' (a word not heard refuses, and so does a missing or stale check). */
  voiceCheck?: 'report' | 'refuse';
  /** A fingerprint of the kits' drawing code (codeFingerprint): kept in the record's inputs, so an approval locks the code too. */
  code?: string | null;
  /** Checks on the finished file (checkVideo): 'report' (the record's `finished` lists the findings) or 'refuse' (a problem refuses the film). */
  check?: 'report' | 'refuse' | null;
  /** The length the brief asks for, for the duration check. */
  expect?: {seconds?: number; tolerance?: number};
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
/** What the voice says for a scene: its narration with each number slot's spoken words in place of what is shown. */
export function spokenText(scene: StoryboardScene): string;
/** Numbers left as digits in the narration (not inside a say slot): a voice tool can refuse them before it speaks. */
export function unsaidNumbers(storyboard: Storyboard): {scene: string; text: string}[];
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
