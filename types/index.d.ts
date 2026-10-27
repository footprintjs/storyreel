// Types for footprint-storyreel (the code is plain JavaScript; these describe its public surface).
import type {CombinedNarrativeEntry, RuntimeSnapshot, DecisionEvidence} from 'footprintjs';
import type {EaseSpec} from './sub/ease.js';
import type {MoveName, Move, MoveFeelName} from './sub/moves.js';
import type {FeelName, Feel} from './sub/motion.js';
import type {StepsTrackSpec} from './sub/steps-track.js';

/**
 * A spoken phrase: [scene, phrase] or [scene, phrase, plus seconds], or the object form. The phrase may be a moment
 * written in the narration ("{hop}": when the word after the mark starts), which takes plus and no edge or nth.
 */
export type Beat = [scene: string, phrase: string] | [scene: string, phrase: string, plus: number]
  | {scene: string; phrase: string; edge?: 'start' | 'end'; plus?: number; nth?: number};

/** A silent scene's direction: what happens, and how long it lasts (0.2..20 s). Never spoken. */
export type Direction = [text: string, seconds: number];

/** A scene is spoken (`narration`) or silent (`silent`: directions), never both. */
export type StoryboardScene = {id: string; title?: string; /** Who says the scene: a name the voice step maps to a voice; kits read it through clock.speaking(t). */ speaker?: string;
  /** Number slots: [shown, spoken] — the captions show `shown` ("16.67 ms"), the voice says `spoken` ("sixteen point six seven milliseconds"; words only). Each shown text appears in the narration, in order. */
  say?: [string, string][];
  /** The scene shows example data (claims.mjs): its numbers need no source, and it says so on screen — true draws "Example data", a string draws those words (the film's language); false or left out, it is not. */
  example?: boolean | string; [key: string]: unknown}
  & ({/** What is said. Marks in it are never said nor shown: {name} a moment a beat or a hold names ("{hop}"), {@who} the speaker of the quoted line right after it ({@mom}"…": script.mjs; the voice step writes each word's speaker from it). */ narration: string; silent?: never}
    | {silent: Direction[]; narration?: never});

export interface Storyboard {
  title?: string;
  /** Where the numbers on screen (and the claims in words) come from (claims.mjs): a JSON file inside the film's root, or the list itself. */
  facts?: string | ClaimFact[];
  scenes: StoryboardScene[];
  [key: string]: unknown;
}
/** How a claim is known (claims.mjs · EVIDENCE): a source; a named person said it; grouped from verified facts, directly or through derived ones; carried past what is known; unresolved. */
export type EvidenceClass = 'verified' | 'reported' | 'derived' | 'extrapolated' | 'open';
/**
 * How a fact is known. Unclassed (no `evidence`): its `source` is required. Classed: `checked` says how it was checked
 * (for an open claim, what is still unresolved); "verified" and "reported" (with `by`, who said it) need a source;
 * "derived" is grouped from verified facts, directly or through derived ones (`from`, their ids); "extrapolated" names
 * its source or `from` (or both); "open" needs neither. A claim made from an open fact is as open as it, in a release. Once one fact in a list is classed, every fact is. `id` names a fact (for `from`, and recipe.evidence.allowOpen).
 */
export type FactKnown =
  | {source: string; id?: string; evidence?: never; checked?: never; by?: never; from?: never}
  | {evidence: 'verified'; source: string; checked: string; id?: string; by?: never; from?: never}
  | {evidence: 'reported'; source: string; by: string; checked: string; id?: string; from?: never}
  | {evidence: 'derived'; from: readonly string[]; checked: string; source?: string; id?: string; by?: never}
  | {evidence: 'extrapolated'; checked: string; from: readonly string[]; source?: string; id?: string; by?: never}
  | {evidence: 'extrapolated'; checked: string; source: string; from?: readonly string[]; id?: string; by?: never}
  | {evidence: 'open'; checked: string; source?: string; id?: string; by?: never; from?: never};
/** What a source is, as read (claims.mjs · sourceKind): a URL, a file inside the root, or neither — kept, and reported as unverified. */
export type SourceKind = 'url' | 'file' | 'unverified';
/** A fact a number on screen comes from: `value` as the screen shows it (16.67, 1000, or "3:15"), `text` the words it is shown with (the line must contain them), `source` a URL, a document or a record pointer. */
export type NumberFact = {value: number | string; text?: string; says?: never;
  /** What the source is, as read (claims.mjs · sourceKind). */
  readonly kind?: SourceKind} & FactKnown;
/** A claim in words, with no number (claims.mjs · findStatements): found wherever the film says or shows those words. It is always classed. */
export type WordsFact = {says: string; value?: never; text?: never; readonly kind?: SourceKind} & Exclude<FactKnown, {evidence?: never}>;
/** A fact the film's claims come from: a number's, or a claim in words. */
export type ClaimFact = NumberFact | WordsFact;
/** How the fact behind a claim is known, carried on the claim (only when the facts are classed). */
export interface ClaimKnown { id?: string; evidence?: EvidenceClass; checked?: string; by?: string; from?: readonly string[] }
/**
 * A number the film shows (claims.mjs), with its sign: the line it is in and where (`offset`), from when it is whole on
 * screen (`at`) to when it starts to leave (`to`), its scene and recipe entry (`captions` for the captions, `drawn` for a
 * word the review read off the picture), whether the scene is example data, and the backing fact's source (or null).
 */
export interface Claim extends ClaimKnown { number: string; line: string; offset: number; at: number; to: number; scene: string | null; path: string; example: boolean; source: string | null; sourceKind: SourceKind | null;
  /** The language it was read by (the film's lang), when the film has one. */
  lang?: string;
  /** Drawn as code (decorative.mjs · code): read as code writes numbers, whatever the film's language. */
  code?: true;
  /** Not one number as read: 'no language' ("2,5" in a film with none — a decimal comma, or a list?), or the language it is not one number in. Only a fact written the same way sources it. */
  ambiguous?: string }
/** When the example label is up: over an example scene, and on while any line it shows is still on screen. */
export interface ExampleLabel { from: number; to: number; words: string; scene: number }
/** A claim in words the film says (path 'captions': when its words are said) or shows (a line's recipe entry), with the fact behind it. */
export interface WordsClaim extends ClaimKnown { says: string; line: string; offset: number; at: number; to: number; scene: string | null; path: string; example: boolean; source: string | null; sourceKind: SourceKind | null; evidence: EvidenceClass; checked: string }
/**
 * Every number the film shows, with the facts the storyboard names (null: none, so the numbers outside example scenes
 * cannot be checked), each scene's example label (or null) and when a label is up; the claims in words (only when a fact
 * `says` one); the open claims a release may show anyway, each with its reason (recipe.evidence.allowOpen; only when given).
 */
export interface Claims { facts: readonly ClaimFact[] | null; examples: readonly (string | null)[]; labels: readonly ExampleLabel[]; numbers: readonly Claim[];
  statements?: readonly WordsClaim[]; allowOpen?: Readonly<Record<string, string>> }
/** Every claim the film says or shows outside example scenes with its class (claims.mjs · evidenceOf; the making-of's `claims.evidence`). `evidence: null`: a number no fact backs. */
export interface ClaimEvidence {
  classes: Record<EvidenceClass | 'unclassed', number>;
  claims: {claim: string; kind: 'number' | 'words'; evidence: EvidenceClass | null; said: 'spoken' | 'shown'; scene: string | null; path: string; at: number; id?: string; source?: string; sourceKind?: SourceKind; checked?: string; by?: string; from?: string[];
    /** The ids of the open facts a claim's `from` leads to: a release treats it as open. */
    restsOnOpen?: string[]}[];
  allowed?: Record<string, string>;
}
/**
 * A kit's drawn parts at one moment (geometry.mjs), in its own coordinates: segments by name — `a` the root, `b` the tip,
 * `width`, `mount` (the part `a` lands on: a segment or a region), `ends` ('mounted': `b` lands on it too), `contact`
 * (the end it rests on: it may not move while planted) — regions (boxes) by name, and pairs kept `apart` (never crossing).
 */
export interface Parts {
  segments: Record<string, {a: [number, number]; b: [number, number]; width?: number; mount?: string; ends?: 'free' | 'mounted';
    /** The end that rests on the ground while it is planted ('a', 'b', or true: flat), or false in the air; a planted end never moves from where it was first planted. */
    contact?: boolean | 'a' | 'b'}>;
  regions?: Record<string, [number, number, number, number]>;
  apart?: [string, string][];
}
/** What a check answers (verdict.mjs): 'not run' is never a pass. */
export type Verdict = 'passed' | 'failed' | 'not run';
/** A verdict's rules: each a decide() filter over the measured values (or a function of the scope), the verdict it gives and what it means; `passed` says what passing means. */
export interface VerdictRules { rules: readonly {when: Record<string, Record<string, unknown>> | ((scope: any) => boolean); then: Verdict; label: string}[]; passed: string }

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
  /** after: a phrase of the scene (the hold goes in the pause after it), or a moment written in its narration ("{dots}": the pause at the mark). */
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
  /**
   * The five scene questions (progression.mjs), one short sentence each: what exists now, what changed, why it changed,
   * what became possible, what constraint remains. film.shots and the making-of carry them; recipe.progression checks
   * that the story moves one world on (report by default, or refuse).
   */
  exists?: string;
  changed?: string;
  why?: string;
  opens?: string;
  remains?: string;
}
/** The answers a shot gave to the five scene questions (ShotPlan). */
export interface SceneAnswers { exists?: string; changed?: string; why?: string; opens?: string; remains?: string }
/** What does not progress (progression.mjs · checkProgression): a scene that changes nothing, a change the next scene's exists does not carry, an opening never used, a constraint never answered. */
export interface ProgressionFinding { kind: 'changes-nothing' | 'not-carried' | 'opens-unused' | 'remains-unanswered'; path: string; where: string; next?: string; text: string }
/** A point of a rubric (rubric.mjs): its id, what it is, the question a reviewer answers, what to lay out for it (rubric.mjs · LOOKS). */
export interface RubricPoint { id: string; label: string; ask?: string; look?: RubricLook }
/** What a rubric point lays out: the film's opening, its words, its faces, its shots, its sound, or each scene's settled picture. */
export type RubricLook = 'opening' | 'words' | 'faces' | 'shots' | 'sound' | 'settled';
/** A rubric as written: a name, a scale (whole scores, lowest first: [1, 10] by default), the least score every point (or some, by id) needs before approval, and its points. */
export interface RubricSpec { name: string; scale?: [number, number]; least?: number | Record<string, number>; points: RubricPoint[] }
/** A rubric, checked (rubric.mjs · readRubric). */
export interface Rubric { readonly name: string; readonly scale: readonly [number, number]; readonly points: readonly Readonly<Required<Pick<RubricPoint, 'id' | 'label' | 'look'>> & {ask?: string}>[]; readonly least: Readonly<Record<string, number>> | null }
/** One declared read (ShotPlan.reads). */
export interface Read { what: string; at: Beat; min?: number; region?: string }

/**
 * A recipe is data: see the README for every key. At run time an unknown top-level key refuses, unless the
 * host application names it in compileFilm's `hostKeys` (keys it reads itself; the engine ignores them).
 */
export interface Recipe {
  /** The opening world; its `intent`, `continuity` and `frame` are the engine's (read, then left out of what the kit gets). */
  story?: {kit: string; frame?: WorldFrame; [key: string]: unknown} & ShotPlan;
  /** The older spelling of a whiteboard story: {items, erasers, spots…} without `kit`. */
  whiteboard?: Record<string, unknown>;
  /** The built-in theme's name when compileFilm gets no `theme`. */
  paperStyle?: string;
  pushIn?: {after: string; rest: number; turn?: number; zoom?: number; hang?: number; caption: string};
  card?: Record<string, unknown>;
  /** A world stage's `intent` and `continuity` sit on the stage, beside `world` (inside `world` they refuse); so does its `frame` (worlds only). */
  stages?: ({type: string; scene: string; enter?: Enter; frame?: WorldFrame; [key: string]: unknown} & ShotPlan)[];
  guesses?: {after: Beat; question: string; answer?: string; place?: 'top' | 'center' | 'bottom'; until?: Beat}[];
  /** A steps track over every shot (footprint-storyreel/kits/paper/steps-track): every moment a beat. */
  stepsTrack?: StepsTrackSpec<Beat>;
  notes?: DirectorNote[];
  recalls?: Record<string, Beat>;
  poster?: Beat;
  /** Reading time: 'report' (the default), 'refuse', or {rule, pace: 'words' (0.3 s a word, at least 1 s) | 'letters' (1.5 s + a fifteenth of a second a letter)}; the rule covers declared reads too. */
  reading?: 'report' | 'refuse' | {rule?: 'report' | 'refuse'; pace?: 'words' | 'letters'};
  /** Too much, too fast (shots.mjs · WATCHING): 'report' (the default: film.watching lists it) or 'refuse'. */
  watching?: 'report' | 'refuse';
  /** What the sound asks of the ear (listening.mjs): 'report' (the default: film.listening lists it) or 'refuse'. */
  listening?: 'report' | 'refuse';
  /** Where the viewer looks (attention.mjs): keys name a thing in the picture (or "wide") on a beat; the strategy shows it (camera, spotlight, dim, none, or your own). */
  focus?: {strategy: string | string[]; feel?: string | {k: number; d: number}; safe?: [number, number, number, number]; keys: {at: Beat; on: string; size?: 'medium' | 'close' | 'insert'}[]};
  /** Words put in front of the viewer on their beat (pop: big, then a label in the corner; corner; none; or your own). */
  emphasis?: {strategy: string; feel?: string | {k: number; d: number}; words: {at: Beat; text: string; until?: Beat}[]};
  /** Camera moves by name (camera.mjs · CAMERA_MOVES), in the order they start: one picture each, one camera (they take turns with a moving focus and the pushes). */
  camera?: CameraMove[];
  /** Found sounds (footprint-storyreel/sounds): allowShareAlike lets CC BY-SA ones play, which puts the whole film under CC BY-SA. */
  foundSounds?: {allowShareAlike?: boolean};
  /** The five scene questions (ShotPlan): 'report' (the default: film.progression lists what does not progress) or 'refuse'. */
  progression?: 'report' | 'refuse';
  /** The open claims a release may say or show anyway, each by its fact's id with the reason (claims.mjs · readAllowOpen). */
  evidence?: {allowOpen: Record<string, string>};
  /** The rubric a render is scored on before approval (rubric.mjs): `storyreel review --rubric` lays it out, its scores go into the making-of, an approval refuses scores under `least`. */
  rubric?: RubricSpec;
  [key: string]: unknown;
}

/** The camera moves (camera.mjs · CAMERA_MOVES). */
export type CameraMoveName = 'pan' | 'tilt' | 'dolly-in' | 'dolly-out' | 'crane' | 'dutch' | 'truck' | 'track' | 'orbit' | 'dolly-zoom' | 'rack-focus' | 'handheld' | 'speed-ramp' | 'freeze';
/** view: the framing; follow: a framing that follows a named thing; depth: a world's layers; texture: handheld; time: the picture's clock. */
export type CameraFamily = 'view' | 'follow' | 'depth' | 'texture' | 'time';
/** When a camera move starts or arrives: a beat, or seconds on the film's clock. */
export type CameraTime = Beat | number;
/** When a move plays: `at`, then `until` or `seconds` (left out: the move's own length; handheld: to the film's end). */
interface CameraSpan { at: CameraTime; until?: CameraTime; seconds?: number }
/** How a view, follow or depth move eases: a curve by name (inOut when neither is given), or a spring feel fitted to its seconds. */
type CameraEase = {ease?: EaseSpec; feel?: never} | {ease?: never; feel?: FeelName | Feel};
/**
 * A camera move. view — pan (`amount` px across, + right), tilt (px down, + down), dolly-in / dolly-out (`amount` times
 * closer / farther; `on`: toward a named thing, as far as the edges allow), crane (`amount` px it rises, `scale` times
 * closer as it goes), dutch (`amount`: degrees the frame rolls to; 0 levels it); follow — truck (sideways) and track
 * (both ways) follow a named thing (`on`); depth, on a world's layers — orbit (`amount`: px a layer infinitely far would slide; a layer at depth d slides amount × (1 − 1/d)),
 * dolly-zoom (`amount`: how much the background grows behind the subject), rack-focus (from the layer `from` to the
 * layer `on`, `amount` px of blur); texture — handheld (`amount` px of drift, `seed`); time — speed-ramp (`amount`:
 * the picture's speed half way), freeze. A whip pan is a transition (`enter: "whip"`), not a move.
 */
export type CameraMove = CameraSpan & (
  | ({move: 'pan' | 'tilt' | 'dutch' | 'orbit' | 'dolly-zoom'; amount?: number} & CameraEase)
  | ({move: 'dolly-in' | 'dolly-out'; amount?: number; on?: string | null} & CameraEase)
  | ({move: 'crane'; amount?: number; scale?: number} & CameraEase)
  | ({move: 'truck' | 'track'; on: string} & CameraEase)
  | ({move: 'rack-focus'; on: string; from?: string | null; amount?: number} & CameraEase)
  | {move: 'handheld'; amount?: number; seed?: number; ease?: never; feel?: never}
  | {move: 'speed-ramp'; amount?: number; ease?: never; feel?: never}
  | {move: 'freeze'; ease?: never; feel?: never});
/** The camera's state: the point of the frame-as-drawn it centres, its zoom (1: the whole frame) and its roll (radians, clockwise). */
export interface CameraState { x: number; y: number; z: number; r: number }
/** A camera move as the film played it (film.camera.moves): when (seconds), its settings, how it played, and until when what it drew lasts (null: the film's end). */
export interface CameraMovePlayed {
  path: string; move: CameraMoveName; family: CameraFamily; at: number; until: number;
  played: 'move' | 'cut' | 'off' | 'kept'; lasts: number | null;
  /** The world a depth move acted on (its recipe path). */
  world?: string;
  /** How far the camera scaled to keep the frame covered, when it had to (a pan at the whole frame, a dutch angle). */
  covers?: number;
  /** A view or follow move's resolved end framing, as the viewer sees it (and for a follow, a hash of the path it took). */
  ends?: CameraState & {path?: string};
  ease?: EaseSpec; feel?: FeelName | Feel;
  [setting: string]: unknown;
}
/** The camera moves as played (camerawork.mjs): moves, or cuts for reduced motion — and why (the decision's evidence) — each move placed, and the plan's footprintjs narrative. */
export interface CameraRecord {
  motion: 'moves' | 'cuts';
  decision: DecisionEvidence;
  moves: CameraMovePlayed[];
  narrative: Omit<CombinedNarrativeEntry, 'rawValue'>[];
}
/** What one camera move setting takes: a number in a range (its unit in words), the name of a thing in the picture, or of a world's layer. */
export type CameraSetting = {number: readonly [number, number]; default: number; unit: string} | {name: true; default?: string | null} | {layer: true; default?: string | null};
/** A camera move in the catalog: its family, its default length (seconds; handheld: to the film's end), its settings, what it moves, and its family's function. */
export interface CameraMoveDef {
  family: CameraFamily; seconds: number; params: Readonly<Record<string, Readonly<CameraSetting>>>;
  axes(p: Readonly<Record<string, unknown>>): string[];
  aim?(state: CameraState, p: Readonly<Record<string, unknown>>, box: [number, number, number, number] | null): Partial<CameraState>;
  follow?(box: [number, number, number, number]): Partial<CameraState>;
  depth?(p: Readonly<Record<string, unknown>>, layers: readonly WorldLayer[], before: {orbit: number; zoom: number; focus: number | null; blur: number}): Record<string, number>;
  remap?(u: number, p: Readonly<Record<string, unknown>>): number;
}
export const CAMERA_MOVES: Readonly<Record<CameraMoveName, Readonly<CameraMoveDef>>>;
export const CAMERA_MOVE_NAMES: readonly CameraMoveName[];
/** A world's layer: its name and its depth (1: the subject's plane; 2 twice as far; 0.5 half way to the camera). */
export interface WorldLayer { name: string; depth: number }

/** One finding of the watching check (shots.mjs · tooMuchTooFast). */
export type Watching = {kind: 'burst'; path: string; where: string; at: number; moments: number; seconds: number};

/**
 * A world's frame (thought/): the world drawn inside a cartoon thought cloud, a trail of three little circles toward
 * `corner` (the cloud leans away from it). `size` is the cloud's share of the frame (0.5–0.9, 0.8), and the world is
 * drawn at it; `seed` picks the scallops (0–10000, 3); `color` and `ink` are its paper and outline (null: the theme's
 * card and ink). `backdrop` is the ground round the cloud: a hex colour (flat), {color, vignette?} (lighter near the cloud,
 * darker at the edges; vignette 0–1, 0.5), or null (the shot's own ground); it darkens in as the trail rises and
 * cloudBurst clears it on its pop. As the shot starts, the trail pops up from the corner, then the cloud opens (a change
 * of picture). On the story or a "type": "world" stage only (another stage refuses it). A cloudBurst out of it pops the
 * same cloud: the settings it leaves out are the frame's.
 */
export type WorldFrame = 'thought' | {type: 'thought'; corner?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'; size?: number; seed?: number; color?: string | null; ink?: string | null; backdrop?: string | {color: string; vignette?: number | null} | null};

/** The built-in transitions (transitions.mjs · TRANSITIONS). */
export type TransitionName = 'cut' | 'fade' | 'dip' | 'cloudBurst' | 'wipe' | 'split' | 'clock' | 'torn' | 'eraser' | 'iris' | 'inkBleed' | 'ringIris'
  | 'push' | 'slide' | 'whip' | 'glassSheet' | 'zoom' | 'page' | 'curl' | 'fold' | 'through' | 'match' | 'morph';
/**
 * A shot's entrance: a transition's name (a kit's own too), or its name with settings — `seconds` (0.2–4),
 * `ease`, `sound` (a sound, or false for none) and the transition's own: `from` (push, slide, whip, wipe,
 * glassSheet: left | right | top | bottom; eraser: left | right), `direction` (torn: the way the rip travels, right | left |
 * bottom | top), `drift` (torn: px the new picture comes along with the tear, 0–200), `line` (split: vertical | horizontal; fold:
 * the crease, horizontal | vertical), `at` (iris, zoom, inkBleed, ringIris: [x, y]), `color` (dip, eraser, and the
 * ink, ring or outline of inkBleed, ringIris, morph: a hex colour; null is the transition's default, the theme's for those three), `accent` (ringIris:
 * its other half), `tint` (glassSheet), `seed` (torn, inkBleed: the ragged edge's shape, 0–10000; cloudBurst: the
 * cloud's scallops), `radius` and `width` (ringIris: its size at the start, its thickness), `corner` (curl; cloudBurst:
 * where the thought's trail points), `size` (cloudBurst: the cloud's share of the frame, 0.5–0.9), `ink` (cloudBurst:
 * the cloud's outline; with `color`, its paper; null: the theme's), `region` (through, match: the name of a
 * thing in the picture it leaves — required; morph: optional), `into` (match, morph: the thing's name in the new
 * picture, when it differs), `fromBox` / `toBox` (morph, without names: [x0, y0, x1, y1]), `shape` (through: box | round).
 * Left out: a fade. Or a move from the vocabulary (`footprint-storyreel/moves`) that a whole picture can make —
 * {move: 'soft-rise', seconds?, feel?, sound?}: the new picture moves in over the old one on the move's own curve
 * (or its `feel`'s: a move feel, a spring feel, or {k, d}); silent unless it names a sound.
 */
export type Enter = TransitionName | (string & {}) | ({type: TransitionName | (string & {}); seconds?: number; ease?: EaseSpec; sound?: SoundType | FoundSoundChoice | false;
  from?: 'left' | 'right' | 'top' | 'bottom'; line?: 'vertical' | 'horizontal'; at?: [number, number]; color?: string | null;
  region?: string; into?: string; shape?: 'box' | 'round'; seed?: number; radius?: number; width?: number; accent?: string | null;
  tint?: string; corner?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'; fromBox?: FrameBox; toBox?: FrameBox; size?: number; ink?: string | null;
  direction?: 'left' | 'right' | 'top' | 'bottom'; drift?: number;
  move?: never; [setting: string]: unknown})
  | {move: MoveName | (string & {}) | Move; seconds?: number; feel?: MoveFeelName | FeelName | Feel; sound?: SoundType | FoundSoundChoice | false; type?: never};
/**
 * A transition's setting: one of some words, a point, a colour, a number or a box, each with its default (a colour's
 * may be null: the draw picks it, e.g. the theme's); or the name of a thing in the picture (no default: the recipe
 * must give it; default null: it may be left out).
 */
export type TransitionSetting = {oneOf: readonly string[]; default: string} | {point: true; default: readonly [number, number]}
  | {color: true; default: string | null} | {number: readonly [number, number]; default: number} | {box: true; default: FrameBox}
  | {name: true; default?: string | null};
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
  /** What a browser groups it under (the built-in families: cut, dissolve, wipe, iris, motion, zoom, page, match). */
  family: string;
  /** Its default length, 0.2–4 s. */
  seconds: number;
  ease: EaseSpec;
  sound: SoundType | null;
  /** Where in the change its sound hits: the e its draw reaches it at, from 0 (its first moment, the default) to below 1 (cloudBurst's pop: 0.3). However the change is eased, the sound lands where e reaches it. */
  hitAt?: number;
  /** true when an overshooting ease (back, outBack, spring, a four-number curve past 0..1) may drive it. */
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
  /** Every place a phrase is said in a scene, in order, on the whole-lesson clock (none: not said); a beat's `nth` picks one. A moment ("{hop}") is one place, its time. */
  places(scene: string, phrase: string): {start: number; end: number}[];
  /** The moments written in a scene's narration ({name}), in order, on the whole-lesson clock (none in a silent scene). */
  moments(scene: string): {name: string; t: number}[];
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
export type SoundEvent = { time: number; type: SoundType; gain?: number } | FoundSoundEvent;
/**
 * A found sound at a time: a recording kept in the film's sounds/ folder, added once with `npx storyreel sounds add <id>
 * --as <name>` (footprint-storyreel/sounds), mixed from its file at render (never fetched then). `gain` 0..1 (default 1)
 * of its own level, after it is turned down to the effects' ceiling when it peaks over it. `from` / `to`: the span of the
 * recording to play, in seconds into it (left out: from its start, to its end), checked against its length.
 */
export interface FoundSoundEvent { time: number; type: 'found'; name: string; gain?: number; from?: number; to?: number }
/** An entrance's found sound: the same as a found sound event, without its time (the change of picture is its time). */
export type FoundSoundChoice = { type: 'found'; name: string; gain?: number; from?: number; to?: number };
/** A found sound a film plays, checked when it was built (its record, its file inside the root): see footprint-storyreel/sounds. */
export interface UsedFoundSound { name: string; file: string; record: import('./sub/sounds.js').FoundRecord; root: string; allowShareAlike: boolean }

export interface Film {
  /** Seconds. */
  total: number;
  clock: Clock;
  timings: Timings;
  sounds: SoundEvent[];
  /** The found sounds its sounds name, each checked (licence, file, sha256) when the film was built. */
  foundSounds: readonly UsedFoundSound[];
  /** Draw the film at t into a context whose transform maps 1600×900 onto the frame. Pure. */
  frame(ctx: CanvasRenderingContext2D | unknown, t: number, options?: {window?: {x0: number; y0: number; w: number; h: number} | null}): void;
  /** Every phrase the recipe named, when it is said, and the recipe entry that asked for it. */
  beats: {ref: Beat; t: number; path: string | null}[];
  /** Each phrase not as written, with compileFilm's anchors: 'note' (none otherwise). */
  anchors: AnchorNote[];
  strings: string[];
  /** The director's notes as applied, in the order written. */
  notes: Record<string, unknown>[];
  /** The recipe's focus and emphasis as placed on the clock (strategy, keys/words with their times), or null. */
  attention: {focus?: {strategy: string; keys: {t: number; on: string; size?: string}[]}; emphasis?: {strategy: string; words: {t: number; text: string}[]}} | null;
  /** Where the focus is at t (the camera's point and zoom, the named thing's box, how focused 0–1), or null without a focus. */
  focusAt: ((t: number) => {cx: number; cy: number; z: number; box: [number, number, number, number]; w: number}) | null;
  /** The recipe's camera moves as played (camerawork.mjs), or null without them. */
  camera: CameraRecord | null;
  /** The camera's framing at t, always covering the frame (null at rest); null without camera moves. Handheld's drift is not a framing. */
  cameraAt: ((t: number) => CameraState | null) | null;
  /** Lines shown for less time than they need to be read. */
  reading: {path: string; text: string; at: number; seconds: number; needs: number}[];
  /** Every declared read (ShotPlan.reads), timed, with what is wrong with it if anything (two at once, too late, a region not there). */
  reads: {path: string; what: string; at: number; min: number; region?: string; problem?: string}[];
  /** Every shot — the story, then each stage — on screen from `from` to `to`, with what it says it is for and the facts it starts and ends with (null when it states none). */
  shots: ({path: string; where: string; scene: string; from: number; to: number; intent: string | null; start: Record<string, Fact> | null; end: Record<string, Fact> | null; moments: number;
    /** The world's own continuity record, beat by beat, when its kit keeps one (the stage: footprint-storyreel/stage · LedgerEntry). */
    ledger?: readonly {readonly at: number; readonly [key: string]: unknown}[]} & SceneAnswers)[];
  /** Bursts: more than 4 moments in 2 s of one shot — too fast to take in. */
  watching: Watching[];
  /** What does not progress, read from the shots' answers to the five scene questions (absent when no shot answers one). */
  progression?: readonly ProgressionFinding[];
  /** The recipe's rubric, checked (absent when it names none). */
  rubric?: Rubric;
  /** What the sound asks of the ear: a sound on most changes of picture, or the same cue twice running (listening.mjs). */
  listening: ListeningFinding[];
  /**
   * The film as rows of pictures (segments.mjs plans renders from them): `from` — when the row's picture starts to
   * arrive (its entrance begins); `paths` — the recipe entries that draw it; `enter` — how it arrives (null for the
   * first row). A film with a pushIn is one row (`pushIn: true`).
   */
  rows: FilmRow[];
  /** What is drawn over every shot for a while: the guess cards ({path: 'guesses[n]', from, to}) and a steps track ({path: 'stepsTrack', from, to}). */
  overlays: readonly {path: string; from: number; to: number}[];
  /** What the film was made from, hashed: its storyboard, timings, recipe, strings, data, theme and every file it read through its root. */
  inputs: FilmInputs;
  /** Each string's own hash (a segment's key holds only the strings its entries name); null without a string table. */
  stringHashes: Readonly<Record<string, string>> | null;
  /** The moments that replay earlier pictures (a teaser's rewind, a steps track's rewind cue): played at–until, showing from–to. A cached piece's key holds what it replays. */
  replays: readonly {at: number; until: number; from: number; to: number}[];
  /** The recipe it was compiled from, as given (its strings unresolved), frozen: the default cache keys each piece's entries from it. */
  recipe: Readonly<Recipe>;
  /** Its kits by name (the built-in whiteboard too): the default cache keys a piece by the code of the kits that draw it (Kit.sources). */
  kits: Readonly<Record<string, Kit | ContextKit>>;
  /** Which kit draws each recipe entry, by path ('story', 'stages[2]'); a built-in stage, drawn by the engine itself, is absent. */
  drawnBy: Readonly<Record<string, string>>;
  /** The focus keys and emphasis words as they frame and show the picture (a cached piece's key holds the ones that reach it), or null. */
  attentionFrames: {focus: {strategy: string; feel: unknown; safe: number[]; keys: {t: number; on: string; size: string | null; cx: number; cy: number; z: number; sx: number; sy: number; box: number[]; w: number}[]} | null;
    emphasis: {strategy: string; feel: unknown; words: {t: number; text: string; next: number}[]} | null} | null;
  /** The mouths drawn at t (each kit on screen that draws one says so: mouthsAt), with the recipe entry that drew it. */
  mouthsAt(t: number): {who: string | null; open: number; path: string}[];
  /** The parts drawn at t (each kit on screen that gives them: parts), with the recipe entry that drew them: what the geometry audit reads. Read on the picture's clock. */
  partsAt(t: number): (Parts & {path: string})[];
  /** The picture's clock at t: the voice's, except in a camera's freeze (held) or speed ramp (slow, then catching up). */
  pictureAt(t: number): number;
  /** Every line the film shows to be read (titles, footers, list lines, a world's words, guess cards, the push-in caption, an example scene's label): when it is whole on screen, when it starts to leave, when its last ink goes (`gone`, an eraser's end, when it has one), the recipe entry. */
  lines: readonly {text: string; from: number; to: number; gone?: number; path: string}[];
  /** Every change of picture: each stage's arrival (the push-in, an entrance, a hand-over, a cut) and the teaser, from–to. */
  changes: readonly {from: number; to: number; what: string}[];
  /** Every number the film shows and where it comes from: a fact the storyboard names, or an example scene. */
  claims: Claims;
  /** The language the film is shown in (compileFilm's lang, canonical BCP 47), or null: its numbers are read by it. */
  lang: string | null;
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
 * `world.<path>`, `stage.stages[i]`, `guess.guesses[n]`, `note.notes[i]`, `checks.reading|watching|continuity|sounds|ready` (and `checks.progression` when a shot answers a scene question), and
 * `when.<recipe path>` (seconds) for every line resolved. Detached: it survives structuredClone. Read a
 * slice with foottrace: `sliceForKey(snapshot.commitLog, key, keysReadFromExecutionTree(snapshot.executionTree))`.
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
  /** Its drawn parts at t, in its own coordinates (before any camera), for the geometry audit: the numbers it draws them from. */
  parts?(t: number): Parts;
  /**
   * A held layer, drawn on the frame (1600×900) over the picture and outside its camera: a transition or a director's push
   * never moves it (a presenter in the corner, a title band). Through a change of picture the leaving shot's layer crosses
   * into the arriving one's, exactly: the same layer in both stays itself. A film with a pushIn draws none.
   */
  overlay?(ctx: any, t: number): void;
  /** The lines it shows to be read: whole from `from`, starting to leave at `to`, its last ink gone at `gone` (an eraser's end; `to` when left out). */
  texts?(): {text: string; from: number; to: number; gone?: number; path: string}[];
  /** Settles once the world can draw (e.g. its images have decoded); compileFilm waits for it before drawing recalls and before returning. */
  ready?: Promise<unknown>;
  /**
   * Its layers, back to front (the farthest first), each at a depth: how far from the camera, as a multiple of the
   * subject's distance. A camera's depth moves (orbit, dolly-zoom, rack-focus) draw the world layer by layer.
   */
  layers?: readonly WorldLayer[];
  /** Draws one layer, by name, on a clear sheet: every layer, back to front, draws what draw does. */
  drawLayer?(ctx: any, t: number, name: string, spot: unknown): void;
  /** When the kit's own camera moves (seconds on the film's clock): a push note and a camera move take turns with it (the cartoon kit's camera keys). */
  cameraMoves?: readonly {from: number; to: number}[];
}

/**
 * What a story kit that declares `context: true` is compiled with (frozen). It has no way to draw the film.
 * `library` and `labels` are the recipe's (empty until the recipe carries them).
 */
/** Who is in the film, as configuration: each role's name (said and shown where the text has {{role}}) and anything a kit draws them with. */
export type Cast = Readonly<Record<string, Readonly<{name: string} & Record<string, unknown>>>>;
export function readCast(cast: unknown): Cast | null;
/** A text with {{role}} replaced by the role's name; a role the cast lacks refuses. */
export function castText(text: string, cast: Cast | null, where?: string): string;
/** Any JSON value with {{role}} replaced in every string (a storyboard, a recipe, a string table). */
export function withCast<T>(value: T, cast: Cast | null, where?: string): T;
export interface KitContext {
  readonly clock: Clock;
  readonly motion: {readonly cameraSpeed: number};
  readonly theme: Record<string, unknown>;
  /** The film's root folder, as compileFilm got it. */
  readonly root: string;
  /** The film's cast (cast.mjs): {role: {name, …the look the kit reads}}, frozen; null without one. */
  readonly cast: Cast | null;
  readonly library: Readonly<Record<string, unknown>>;
  readonly labels: Readonly<Record<string, unknown>>;
  /** The real path of a file inside root; a path outside it (a sibling folder, a link out) refuses. */
  insideRoot(file: string): string;
  /** A file's bytes, read only from inside root (insideRoot). */
  readFile(file: string): Uint8Array;
}

/**
 * Where a kit's drawing code lives: the default cache keys each piece by the code of the entries it draws (each entry's
 * files and everything they import; the shared files as they are), so editing one shot redraws only the pieces that
 * show it. Files are paths or file URLs: new URL(`./shots/${spec.shot}.mjs`, import.meta.url).
 */
export interface KitSources {
  /** The files that draw this spec (what the kit compiles: the story's spec, a world stage's `world`, a kit stage's own spec), followed through their imports. */
  entry(spec: any): (string | URL)[] | null | undefined;
  /** Files every entry uses, hashed as they are (a kit's index imports every shot, so its imports are not followed). */
  shared?: (string | URL)[];
  /** The files that draw one of the kit's transitions, by its name. */
  transition?(name: string): (string | URL)[] | null | undefined;
}

/** A plug-in: a story kit draws a world; stage kits add stage types; a kit may add transitions. A story kit on the context contract is a ContextKit. */
export interface Kit {
  name: string;
  /** Where its drawing code lives (the default cache keys each piece by it); without it, a piece it draws is keyed by makeFilm's `code`, or only spot-checked. */
  sources?: KitSources;
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
    compile(spec: any, context: {clock: Clock; data: unknown; motion: {cameraSpeed: number}; cast: Cast | null}): unknown;
    draw(ctx: any, pen: any, theme: any, handle: any, t: number, cardBox: [number, number, number, number] | null): void;
    card?(handle: any, t: number): {rows: unknown; glow: unknown; pop: unknown};
    place?(handle: any): {at: [number, number]; scale: number};
    sounds?(handle: any): SoundEvent[];
    regions?(handle: any, t: number, cardBox: [number, number, number, number] | null): Region[];
    /** The mouths the stage draws at t, for the lip-sync check. */
    mouthsAt?(handle: any, t: number): {who: string | null; open: number}[];
    /** The parts the stage draws at t, for the geometry audit. */
    parts?(handle: any, t: number): Parts;
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
  /** The language the film is shown in, a BCP 47 tag ("de", "fr", "en-IN", "ta"): the numbers on screen are read by it (film.lang). Without one, a number the languages read apart ("2,5", "1,000") is ambiguous. */
  lang?: string | null;
  /** Top-level recipe keys the host application reads itself: allowed, and ignored by the engine. */
  hostKeys?: string[];
  /** Who is in the film ({role: {name, …}}): {{role}} in the text becomes the name; kits get it as context.cast. */
  cast?: Record<string, {name: string} & Record<string, unknown>> | null;
  /** true: the compile runs as a footprintjs flowchart and the film carries `record` (default false: no record). */
  record?: boolean;
  /** true: the recipe's camera moves are cut to their end framing, handheld off, a speed ramp in step (default false). Only those: a focus, push notes, a kit's camera and transitions play as written. */
  reducedMotion?: boolean;
  /** Strategies of your own for the recipe's focus and emphasis (attention.mjs), by name. */
  strategies?: {focus?: Record<string, {show(ctx: any, view: import('./sub/attention.js').FocusView, paint: (ctx: any) => void, theme: unknown): void}>; emphasis?: Record<string, {draw(ctx: any, t: number, word: {t: number; text: string; next: number}, theme: unknown): void}>} | null;
  /**
   * 'refuse' (default): a phrase the recipe names that its scene does not say stops the compile. 'note': each phrase
   * not as written is noted in film.anchors (a missing one stands at the nearest words said), so all are checked in one pass.
   */
  anchors?: 'refuse' | 'note';
}
/** A phrase not as written (compileFilm's anchors: 'note'): where it is named, what is wrong, every place it is said, and for a missing one the nearest words said ('moment': a moment named with nth or edge). */
export interface AnchorNote {ref: Beat; path: string | null; problem: 'missing' | 'ambiguous' | 'past' | 'scene' | 'moment'; places: {start: number; end: number}[]; near?: {phrase: string; start: number; end: number} | null}
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
  roles?: {voice: number | null; effects: number | null; music?: number | null};
}
/** One thing the sound asks too much of the ear for (listening.mjs). */
export interface ListeningFinding { kind: 'every-change' | 'same-twice' | 'effects-loud' | 'music-loud'; at: number; where?: string; text: string }

/** The shapes a film is posted in (layout.mjs): landscape 1920×1080, square 1080×1080, portrait 1080×1350, vertical 1080×1920 (portrait and vertical show a 4:3 crop). */
export type FormatName = 'landscape' | 'square' | 'portrait' | 'vertical';
/** A band's box in output pixels: [x, y, width, height]. */
export type Box = [x: number, y: number, width: number, height: number];
/**
 * A crop key (portrait and vertical): the window's centre from `at` (a beat, or seconds on the film clock) — x on the
 * 1600-wide frame, y on the 900-high frame (only where given; else centred) — its width (400–1600), and `cut: true` to
 * jump there instead of easing; or `{at, follow: 'focus', width?}`: from there the window follows the film (the
 * speaker's region while someone speaks, else the thing its focus names; follow.mjs) until the next key.
 */
export type CropKey = {at: Beat | number; x: number; y?: number; width?: number; cut?: boolean} | {at: Beat | number; follow: 'focus'; width?: number};
/** How a tall crop was framed when it follows or fills: the keys used, the ones nudged off a kept thing ([dx, dy]), and where a kept thing could not be kept whole. */
export interface CropFraming {follow?: Record<string, number>; keep: string[]; keys: {t: number; x: number; y?: number; width: number; jump?: true}[]; nudged: {t: number; by: [number, number]}[]; clipped: {t: number; names: string[]; why: string}[]}
/**
 * A version of the film for a platform: its format, a title band (not in landscape), captions burned in from
 * the word timings, crop keys that follow the action (portrait and vertical: {at: beat, x, width?}), and the
 * bands' colours (default: the film's paper and ink). Unknown keys refuse.
 */
export interface Layout {
  format: FormatName;
  header?: {title: string; sub?: string; box?: Box} | false;
  captions?: boolean | {maxWords?: number; size?: number; box?: Box};
  /** Portrait and vertical: the crop's keys (CropKey), or 'focus' (it follows the film throughout). */
  crop?: CropKey[] | 'focus';
  /** Vertical: the film fills the picture from under the title band to below the captions (1080×1165; the captions sit over its foot). */
  fill?: boolean;
  /** Portrait and vertical: the named things the crop's edge never cuts when it follows or fills ([] none; left out: every speaker). */
  keep?: string[];
  background?: string;
  ink?: string;
  /** 0.5–2 (default 1): the same picture at that many times the format's size, redrawn sharp; 2 makes landscape 3840×2160 (4K), 0.5 a quick draft. */
  scale?: number;
}
export const FORMAT_NAMES: readonly FormatName[];
/** A layout compiled for a film: the output size, where the film and the bands are, and the two drawing passes. */
export function compileLayout(film: Film, layout: Layout, span?: {from: number; to: number}): {width: number; height: number; format: FormatName;
  boxes: {film: Box; header?: Box; captions?: Box}; picture(ctx: any, t: number): void;
  /** The bands at t; `caption` given (an edit's) is drawn instead of the one at t, null for none. */
  overlay(ctx: any, t: number, options?: {still?: boolean; caption?: unknown | null}): void;
  /** The bands' paper. */
  paper: string;
  /** How the crop was framed, when it follows or fills. */
  framing?: CropFraming;
  /** The caption shown at t, or null (none showing, or no captions in this layout). */
  captionAt(t: number): unknown | null};

/** One row of pictures (Film.rows). */
export interface FilmRow { from: number; start: number; paths: string[];
  /** The entry the row begins with: its first stage, or the story. */
  stage: string;
  enter: {type: string; seconds: number; lead: number} | null; pushIn?: boolean;
  /** A teaser's row: the moments it replays (from–to) and when it plays them (at–until). */
  rewinds?: {from: number; to: number; at: number; until: number} }

/**
 * The film's speech as tracks, for footprint-narration's captionChunks: each spoken scene at its offset on the film clock, its words as
 * shown (number slots in digits); a silent scene has none. Chunk them, and write caption files, with footprint-narration.
 */
export function spokenTracks(film: Film): import('footprint-narration').Track[];

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
  /**
   * A folder for the render's working files (the picture without its sound, the voice and effects as WAVs, FFmpeg's
   * lists), kept after it. Left out, they go in a hidden folder beside the video, removed when the render ends,
   * finished or failed: only the outputs stay (the video, poster.jpg, chapters.txt, caption files).
   */
  work?: string | null;
  /** Caption files beside the video (captions.vtt, captions.srt) on its clock: true for both, or the kinds. */
  captionFiles?: boolean | ('vtt' | 'srt')[];
  /** 'standard' (the default: quick) or 'high' (for posting: a slower, finer encode, its colours converted and tagged as HD video's, BT.709). */
  quality?: 'standard' | 'draft' | 'high';
  /** Instead of from/to: those scenes and `handles` seconds (1.5) of the film around them, so both cuts are seen. */
  part?: {scenes: string[]; handles?: number} | {scene: string; handles?: number};
  /** true (the default): the poster replaces the first frame; false: written beside the video only (for a platform that takes an uploaded thumbnail). */
  posterFrame?: boolean;
  /**
   * How the picture is made. Left out: in pieces kept in a cache beside the video (<out folder>/.storyreel/segments/…),
   * each reused while nothing that draws it changed (a part or an intro is drawn whole). segmentedVideo({...}): a cache
   * of your own; wholeVideo(): every frame in one pass.
   */
  video?: VideoStrategy;
  /** true: every frame in one pass, to debug the cache (never needed for a final render). */
  whole?: boolean;
  /** The default cache's options. */
  segments?: SegmentOptions;
  /** A song under the film: its first second plays at film second `start` (negative: it begins that far in), at `gain` (0.2), fading over the last `fadeOut` seconds (1.5). */
  music?: import('./sub/music.js').SongPlacement | null;
  /** 'start' (the default: each sound begins on its moment) or 'peak' (each sound's loudest transient lands on it). */
  soundAt?: 'start' | 'peak';
  /** Instead of from/to or a part: stretches of the film joined in order into one video, with an end card after them (edit.mjs). */
  edit?: Edit | null;
}): Promise<{out: string; seconds: number; chapters: string[]; poster?: string; format?: FormatName; captions?: {vtt?: string; srt?: string}; loudness: Loudness; listening: ListeningFinding[]; video?: SegmentsReport;
  /** The edit as cut: each cut as given and as used (moved to a silence), where it plays, its join; the end card. */
  edit?: EditRecord;
  /** How a tall crop was framed (an edit's: one per cut, with its index). */
  framing?: CropFraming | (CropFraming & {cut: number})[]}>;

/** A join between two cuts: where the cut point lands ('silence': off a spoken word, the default; 'exact'), frames the two sides cross-fade (0–30, 0), frames of paper over a hard cut (0–3, 0). */
export interface Join {cut?: 'silence' | 'exact'; overlap?: number; pop?: number}
/** A cut's edge: a beat, or a scene ({scene}: its start for from, its end for to) — seconds on the film clock the fallback. */
export type CutTime = Beat | {scene: string} | number;
/** A stretch of the film in an edit; `follow` is where its tall crop looks (in place of the layout's crop); `join` the join into it. */
export interface Cut {from: CutTime; to: CutTime; follow?: CropKey[] | 'focus'; join?: Join}
/** A card after the last cut, in the film's theme: 1–4 lines (the first the biggest), held 0.5–10 s. */
export interface EndCard {lines: string[]; seconds: number; join?: Join}
/** An edit: its cuts in order, the end card, and the join every join takes unless a cut gives its own. */
export interface Edit {cuts: Cut[]; end?: EndCard; join?: Join}
/** An edit as its record keeps it. */
export interface EditRecord {
  cuts: {from: number; to: number; given: [number, number]; snapped?: {from?: [number, number]; to?: [number, number]; noSilence?: ('from' | 'to')[]}; at: number; frames: number; join?: Required<Join>}[];
  end?: {at: number; seconds: number; lines: string[]; join: Required<Join>};
  seconds: number;
}

/** A way to make the picture (segments.mjs): plan the parts, make each one, join them; render runs the three in order. */
export interface VideoStrategy {
  name: string;
  /** A segmented strategy: where its pieces are kept; why one() would draw a piece (null: the store keeps it), read before anything is drawn; what weakens its keys. */
  cache?: string | null;
  why?(job: unknown, part: unknown): string | null;
  notes?(job: unknown): string[];
  plan(job: unknown): unknown[];
  one(job: unknown, part: unknown): Promise<unknown>;
  join(job: unknown, done: unknown[]): {file: string; report?: unknown} | Promise<{file: string; report?: unknown}>;
  render(job: unknown): Promise<{file: string; report?: unknown}>;
}
/** One piece's fate in a segmented render: drawn (and why: "words changed", "shot code changed", "new"…) or reused. */
export interface SegmentReport { index: number; from: number; to: number; frames: number; scenes: string[]; key: string; label?: string; status: 'rendered' | 'reused'; why?: string }
/** What a segmented render did: how many pieces were drawn and how many were reused, each one, and `line`, all of it in one short line to read. */
export interface SegmentsReport { strategy: 'segments'; store: string; reused: number; rendered: number; line: string; note?: string; stamp?: 'burned at the join'; evicted?: number;
  /** false when a file a key reads changed after the render started: its pieces were drawn, not kept. */
  kept?: false; segments: SegmentReport[] }
/** The default cache's options (renderFilm's and makeFilm's render.segments). */
export interface SegmentOptions {
  /** The folder it is kept in (default: <out folder>/.storyreel/segments/<format>-<W>x<H>-<quality>). */
  dir?: string;
  /** The most it holds, in bytes (4 GB): after a render, the pieces used longest ago go first. */
  cap?: number;
  /** The longest piece a row is cut into, seconds (6; Infinity keeps rows whole); the shortest (1.5). */
  chunkSeconds?: number; minSeconds?: number;
  /** How far around a piece a beat, word or note counts by its exact time (3 s). */
  margin?: number;
  /** How many pieces are drawn at once (availableParallelism − 1, at most 6); how many frames of a reused one are checked (6, at least 1). */
  parallel?: number; samples?: number;
  /** Pieces drawn again whatever their keys say: an index, or a scene id they cover. */
  force?: (number | string)[];
  /** The kits' code in each key (left out: each kit's own sources); kitsCode keys the pieces a kit without sources draws. */
  code?: string | SegmentCode | null; kitsCode?: string | null;
}
/** Where pieces are kept between renders (folderStore(dir) is the default): get by key (a piece that passes every check, or null), put a file under a key. */
export interface SegmentStore { name: string; dir?: string;
  /** A kept piece that passes every check, or null; `into`: a file in the render's working folder that takes the piece first (the bytes checked are the ones joined). */
  get(key: string, options?: {into?: string | null}): {file: string; manifest: Record<string, unknown>} | null; put(key: string, file: string, manifest: Record<string, unknown>): string;
  /** The manifest of the piece kept under `key`, from the manifest and its size (its bytes are hashed only when it is taken), or null. Without it, get() answers. */
  kept?(key: string): Record<string, unknown> | null;
  /** The newest manifest of each group `group` names (what each slot was last drawn from: the reasons a piece was drawn again). */
  newest?(group: (manifest: Record<string, unknown>) => string | null | undefined): Map<string, Record<string, unknown>>;
  /** Evict the pieces used longest ago until the store fits its cap, never one in `keep`. */
  trim?(options?: {keep?: Set<string>; cap?: number; now?: number}): {bytes: number; evicted: string[]} }
/** How piece files are joined into one video (ffmpegJoin() is the default: no re-encode, or one when `stamp` is burned over every frame). */
export interface SegmentJoiner { name: string; join(files: string[], out: string, options?: {stamp?: {png: string; quality: 'standard' | 'draft' | 'high'} | null}): string | Promise<string> }
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
/** Code per piece (segments.mjs · sourceCode, kitCode): a piece's own entries (and its paths and the transitions it plays) → the fingerprint of the code that draws them. */
export type SegmentCode = (entries: unknown[], piece?: {paths: string[]; enters?: string[]}) => string | null;
export function segmentedVideo(options: {store: SegmentStore; recipe?: Recipe | null; code?: string | SegmentCode | null; kitsCode?: string | null; joiner?: SegmentJoiner | null; force?: (number | string)[]; samples?: number; minSeconds?: number; chunkSeconds?: number; margin?: number; parallel?: number}): VideoStrategy;
/** Keep pieces as <key>.mp4 + <key>.json in one folder (hex keys only; no link read; a manifest of the right shape; the bytes it recorded), held to `cap` bytes (4 GB). */
export function folderStore(dir: string, options?: {cap?: number; grace?: number}): SegmentStore;
/** Join piece files with FFmpeg's concat demuxer, without re-encoding — or burning a stamp over every frame, with one. */
export function ffmpegJoin(options?: {ffmpeg?: string}): SegmentJoiner;
/** One planned segment: frames [f0, f1), seconds [from, to), the recipe entries that draw it, the row an entrance (or a blurred cut) also draws, the scenes it covers. */
export interface Segment { index: number; f0: number; f1: number; from: number; to: number; paths: string[]; before: string[] | null; scenes: string[];
  /** Each entrance inside it: its frames, its transition, and the row it also draws while it plays. */
  entrances?: {f0: number; f1: number; type: string; before: string[] | null}[] }
/** One piece of a row (planPieces): which row (`segment`), the transitions that play in it, the moments it replays, its slot (the same piece across renders) and a label to read ("forward 12–18 s"). */
export interface Piece extends Segment { segment: number; enters: string[]; replays: {at: number; until: number; from: number; to: number}[]; slot: string; label: string }
/** The film's segments: one per row of pictures, on whole frames, covering every frame once and in order (a row that never shows alone joins the next); `blur`: frames are drawn with motion blur. */
export function planSegments(film: Film, options?: {fps?: number; frames?: number; minSeconds?: number; blur?: boolean}): Segment[];
/** The film's pieces: each row cut where a scene or a sentence starts (a word after one that ends a sentence, or after a `pause` of 0.3 s) and every `chunkSeconds` (6) from there, so an edit redraws the seconds around it; together every frame once, in order. */
export function planPieces(film: Film, options?: {fps?: number; frames?: number; minSeconds?: number; chunkSeconds?: number; pause?: number; blur?: boolean}): Piece[];
/** What a segmented render drew, in one short line ("picture: 3 of 41 pieces drawn (title: shot code changed; …), 38 reused"); `full`: every reason. */
export function pictureLine(report: SegmentsReport | undefined, options?: {full?: boolean; top?: number}): string;
/** A segment's cache key (on its own clock, so a segment further on keeps it when an earlier scene grows by whole frames). */
export function segmentKey(film: Film, segment: Segment, options: {recipe: Recipe; storyboard?: Storyboard | null; pixels: Record<string, unknown>; code?: string | SegmentCode | null; fps?: number; margin?: number; extra?: {poster?: unknown; recalls?: unknown}}): string;
/** A fingerprint of drawing code: every file under the folders given and every file they read (relative and TypeScript imports, transitively; a linked package's code; `new URL('…', import.meta.url)` assets; never into node_modules but StoryReel's own modules, read by content), and each other package in node_modules by its installed version. What it cannot follow is listed (codeCover), never thrown on. */
export function codeFingerprint(paths: string[], options?: {extensions?: string[]}): string;
/** What a fingerprint made in this process covered: every file (real paths, sorted), every package ('name@version'), the relative imports that lead nowhere and the imports chosen at run time; or null. */
export function codeCover(fingerprint: string): Readonly<{files: readonly string[]; packages: readonly string[]; missing: readonly {from: string; spec: string}[]; unfollowed: readonly {from: string; code: string}[]; unparsed: readonly {file: string; from: number}[]}> | null;
/** The engine's whole fingerprint: StoryReel's own files and the versions of what draws a frame (versions.mjs · DRAWING), nothing else; `versionOf` stubs a version. An approval locks it; a cached piece holds the narrower drawing fingerprint (footprint-storyreel/segments · drawingCode). */
export function engineFingerprint(options?: {versionOf?: (name: string) => string}): string;
/** StoryReel's own code fingerprint (every file of its code, its fonts, the versions of what it draws with): locked by an approval. */
export function storyreelCode(): string;

/** What a film was made from, hashed (keys sorted first: reformatting changes nothing): film.inputs, and makeFilm adds the pacing, the voice and the kits' code. */
export interface FilmInputs { storyboard: string; timings: string; recipe: string; strings: string | null; data: string | null; theme: string;
  /** Every file the film read through its root, by its path from the root. */
  files: Readonly<Record<string, string>>; pacing?: string; voice?: string; code?: string;
  /** makeFilm adds what draws and decides the film: StoryReel's version and its code (`engine`: storyreelCode), and footprintjs's version (an approval locks them). */
  storyreel?: string; footprintjs?: string; engine?: string;
  /** Present when the film's camera moves were cut for reduced motion: another film, as far as an approval goes. */
  reducedMotion?: true;
  /** The facts the storyboard names (storyboard.facts), hashed on their own: an approval locks them; they are in no segment's key (they draw nothing). */
  facts?: string;
  /** The language the film's numbers are read by, when it has one: an approval of the film in one language is not of it in another. */
  lang?: string }
/** What a person approved: who, when, the render they watched, and what it was made from. */
export interface Approval { schemaVersion: 2; approved: string; by: string; note?: string; render?: string; inputs: FilmInputs }
/** Approve a render as it was watched, from its making-of record (the path of its making-of.json, or the object). A failed render's record refuses. */
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
  /** fps: the average frame rate; rate: the nominal one (they differ in a variable-rate file); width, height: as shown (a ±90° rotation swaps the stored size). */
  probe(file: string): {seconds: number; video: {seconds: number; fps: number; rate?: number; width: number; height: number; rotation?: number; frames: number | null}; audio: {seconds: number} | null};
  /** With fps, the frames are laid on a constant clock (slot k is the frame a player shows at k / fps) and each is told the decoded frame it shows (source): a slot no new frame reached repeats its source. */
  frames(file: string, size: {width: number; height: number; fps?: number | null}, each: (index: number, grey: Uint8Array, source?: number) => void): Promise<number>;
  sound(file: string, options?: {rate?: number}): Float32Array;
}
/**
 * Check a finished video: picture and sound lengths, blank stretches, flash frames, hand-overs a frame early or late and
 * joins that repeat a frame, the voice there and lips in sync with it (voiced renders), captions in order and on their words. With the film it was
 * made from, what the film meant (a dip to black, a cut, a silent scene) is never reported.
 */
export function checkVideo(options: {file: string; film?: Film | null; intro?: number; from?: number; to?: number | null; captions?: string | null; joins?: number[]; voiced?: boolean; expect?: {seconds?: number; tolerance?: number}; checks?: FinishedCheckName[]; probe?: VideoProbe}): Promise<FinishedReport>;
export const FINISHED_CHECK_NAMES: readonly FinishedCheckName[];

/** makeFilm's options; `K` is the kits it takes (two signatures, as compileFilm). */
export interface MakeFilmOptions<K = Kit | ContextKit> {
  storyboard: Storyboard; recipe: Recipe; data?: unknown; kits?: K[]; theme?: string | Record<string, unknown>; root?: string; hostKeys?: string[]; cast?: Record<string, {name: string} & Record<string, unknown>> | null;
  strategies?: CompileFilmOptions['strategies'];
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
  /** A song under the film: its beat map and the fit (scene starts onto the beat, the drop on a key moment) run as stages of their own; the record keeps both. */
  music?: import('./sub/music.js').MusicOptions | null;
  /** true: the recipe's camera moves are cut to their end framing, handheld off (as compileFilm). */
  reducedMotion?: boolean;
  /** Every number on screen has a source (a verdict, with its decide() evidence in the record): 'report' (the default: the record's `claims` lists the numbers with no source) or 'refuse' (one refuses the film before it is drawn, and so does a film whose numbers cannot be checked). */
  claims?: 'report' | 'refuse';
  /** true: this render leaves the house (makeRelease sets it) — a claim it says or shows (in its part, or its edit's cuts) whose fact is "open", or made from one, refuses it before a frame is drawn, unless the recipe allows that open fact with a reason (recipe.evidence.allowOpen). */
  release?: boolean;
}
/** What an edit changed (previewChanges): each planned piece and why the full render would draw it (null: kept), the runs of changed ones on the film clock, and the lines to read. */
export interface ChangesPreview {
  text: string; cache: string | null; total: number; seconds: number;
  pieces: {index: number; f0: number; f1: number; from: number; to: number; frames: number; scenes: string[]; key: string; label?: string; why: string | null}[];
  ranges: {first: number; last: number; f0: number; f1: number; from: number; to: number; scenes: string[]; why: string[]}[];
  /** With render: the pieces drawn (the changed ones; a neighbour only when its kept copy failed its check), whether all are kept, and the review clip (none when every piece changed). */
  drawn?: {index: number; frames: number; why?: string; kept: boolean}[]; kept?: boolean; clip?: {file: string; seconds: number};
}
/**
 * What an edit changed, before the full render: `film` is makeFilm's options for it (out, render and code too), cast,
 * paced, compiled and planned as makeFilm does, and each piece's key compared with the cache beside its out. `render`:
 * only the changed pieces drawn and kept (the full render then only joins), and a clip of them back to back with
 * `handles` (1) seconds of the film either side, each labelled with its time, the voice under it (<out folder>/changes/review.mp4, or `clip`).
 */
export function previewChanges(film: MakeFilmOptions<Kit | ContextKit>, options?: {render?: boolean; handles?: number; clip?: string | null}): Promise<ChangesPreview>;
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
/** A moment written in the narration ({name}): its name, and `offset`, where in said() the next spoken word starts (said()'s length when none follows). */
export interface Moment {name: string; offset: number}
/** A quoted line given a speaker ({@who}"…"): who says it, the line inside its quotes (its own marks out), and `offset`, where in said() it starts. A tag moves no mouth by itself: the voice step writes each word's speaker from the lines. */
export interface SpeakerLine {by: string; say: string; offset: number}
/** A storyboard scene's script: what is said, its speakers' lines and its moments (a silent scene: said null, none of either). */
export interface SceneScript {id: string; said: string | null; lines: SpeakerLine[]; moments: Moment[]}
/** What is said: the narration without its marks, the white space they leave tidied (as written when it has none). `name` names the text in a refusal. */
export function said(narration: string, options?: {name?: string}): string;
/** The narration's moments ({name}), in order. */
export function momentsOf(narration: string, options?: {name?: string}): Moment[];
/** The narration's quoted lines with a speaker tag ({@who}"…"), in order. */
export function linesOf(narration: string, options?: {name?: string}): SpeakerLine[];
/** A storyboard scene's script, every mark checked (a refusal names the scene). */
export function sceneScript(scene: StoryboardScene, index?: number): SceneScript;
/** The moment a beat's phrase names ("{hop}" → "hop"), or null for a phrase of words; a speaker tag, braces round anything but a name, or a mark with other words ("a {ten}") refuse. `where` prefixes the refusal (null: the reason alone). */
export function momentOf(phrase: string, where?: string | null): string | null;
export function paceTimings(storyboard: Storyboard, timings: Timings, pacing: Pacing): Timings;
export function applyPacing(options: {runDir: string; board: Storyboard; timings: Timings; pacing: Pacing}): Promise<Timings>;
export function validatePacing(pacing: Pacing, board: Storyboard): void;
export function tailFor(pacing: Pacing, sceneId: string): number;
export function speechIndex(scene: Storyboard['scenes'][number], timing: SceneTiming): unknown;
export function phraseMatches(index: unknown, phrase: string): {start: number; end: number}[];
export function ramp(t: number, at: number, d?: number): number;
export function withStrings<T>(recipe: T, strings: Record<string, string> | null, used?: Set<string>): T;
export function createSound(options: {duration: number; events: SoundEvent[]; peakCeilingDBFS?: number; soundAt?: 'start' | 'peak'}): {wav: Uint8Array};
export function loadTheme(name?: string): Record<string, unknown>;
export function validateTheme(theme: unknown): void;
export const whiteboardKit: Kit;
export const cartoonKit: Kit;
/** Hashes at `count` evenly spaced moments (default 24), or at the given `times` (seconds, rounded to the millisecond). */
/** Evenly spaced moments (`count`, default 24) or the moments you name (`times`, seconds inside the film, each a distinct millisecond), not both. */
/** Pixel pins: `each(t, ctx)`, when given, sees every frame once it is drawn (the review reads its grey levels from the same drawing). */
export function frameHashes(film: Film, options?: ({count?: number; width?: number; times?: undefined} | {count?: undefined; width?: number; times: number[]}) & {each?: ((t: number, ctx: any) => void) | null}): Record<string, string>;
export function changedFrames(pinned: Record<string, string>, now: Record<string, string>): string[];
export function contactSheet(film: Film, options?: {moments?: {t: number; label: string; kind?: string}[]; columns?: number; width?: number}): Promise<Uint8Array>;
