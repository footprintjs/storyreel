// footprint-storyreel/stage: a scene as data — a place, a cast, props and actions from a small fixed vocabulary —
// played by the library and drawn by a kit's adapters (docs/design/2026-10-stage.md).
import type {WalkName, WalkStyle, WalkPose} from './walk.js';

type CanvasContext = CanvasRenderingContext2D | any;
/** A beat: [scene, phrase] or [scene, phrase, plus], or {scene, phrase, …}; standalone (no clock), seconds. */
export type Beat = [string, string] | [string, string, number] | {scene: string; phrase: string; edge?: 'start' | 'end'; plus?: number; nth?: number} | number;
export type Side = 'left' | 'right';
export type Point = [number, number];
export type Box = [number, number, number, number];
export type TravelName = 'hop' | 'toss' | 'lift' | 'drop' | 'slide';
export type BadgeName = 'total' | 'each' | 'none';
type Walking = WalkName | WalkStyle;

// ── the data a recipe writes ────────────────────────────────────────────────────────────────────────────────────────
export interface CastMember {
  /** The person drawing (a kind the kit's people have); the id by default. */
  as?: string;
  /** Where they stand on the floor (px). */
  x: number;
  /** Toward the middle of the frame by default. */
  facing?: Side;
}
export interface Prop {
  kind: string;
  /** How many things of this kind (1 to 100; 1 by default). A container is one thing. */
  count?: number;
  /** On the ground: [x, y] (the bottom of the thing) or a spot the place names. Give exactly one of at, in, with. */
  at?: Point | string;
  /** In a container (a prop whose kind has slots). */
  in?: string;
  /** In a cast member's hands. */
  with?: string;
  /** How many things it holds (overrides the kind's). */
  slots?: number;
  /** A door or lid open at the start (a kind that opens). */
  open?: boolean;
}
export type StageAction =
  | {do: 'walkTo'; who: string | string[]; to: number | string; at: Beat; style?: Walking}
  | {do: 'enter'; who: string | string[]; at: Beat; from?: Side; style?: Walking}
  | {do: 'enter'; what: string; at: Beat}
  | {do: 'exit'; who: string | string[]; at: Beat; to?: Side; style?: Walking}
  | {do: 'exit'; what: string; at: Beat}
  | {do: 'pickUp'; who: string; what: string; n?: number; at: Beat; travel?: TravelName}
  | {do: 'give'; from: string; to: string; what: string; n?: number; at: Beat; travel?: TravelName}
  | {do: 'putInto'; who: string; what: string; n?: number; into: string; at: Beat; travel?: TravelName}
  | {do: 'takeOutOf'; who: string; what: string; n?: number; from: string; at: Beat; travel?: TravelName}
  | {do: 'count'; what: string; into: string; at: Beat[]; from?: string; who?: string; badge?: BadgeName; travel?: TravelName}
  | {do: 'fade'; what: string; n?: number; from?: string; at: Beat}
  | {do: 'point'; who: string; on: string; at: Beat; until?: Beat}
  | {do: 'open' | 'close'; what: string; who?: string; at: Beat}
  | {do: 'lookAt'; who: string | string[]; on: string; at: Beat}
  | {do: 'countOnFingers'; who: string; at: Beat; up: number; fold?: Beat[]; raise?: Beat[]; until?: Beat};
export type ActionName = StageAction['do'];
export interface StageSpec {
  /** A place the kit has. */
  place: string;
  cast?: Record<string, CastMember>;
  props?: Record<string, Prop>;
  /** In the order they start. */
  actions?: StageAction[];
  /** Outside the story's timeline (a flash-forward, a memory, a teaser): its facts are recorded, not carried. */
  aside?: boolean;
  /** false silences the stage's own sounds. */
  sounds?: boolean;
}
/** The stage as a recipe names it: a story-kit world. */
export interface StageWorld extends StageSpec { kit: string }

// ── what a kit supplies ─────────────────────────────────────────────────────────────────────────────────────────────
export interface PersonPose {
  who: string; kind: string; x: number; y: number; size: number; facing: 1 | -1;
  /** walk.mjs's pose while walking, else null. */
  walk: WalkPose | null;
  /** An arm toward a point: amount 0 at rest … 1 out (passing 1 a little as it arrives; a little below 0 as it winds back). */
  arm: {to: Point; amount: number; why: string} | null;
  /** Where the eyes go (null: the kit's own look). */
  look: {to: Point; amount: number} | null;
  /** fingersAt's hands while counting on fingers; `shown` (0..1) is the hands coming up. */
  fingers: {up: number; from: number | null; hands: {left: number[]; right: number[]}; shown: number} | null;
  /** The props they hold. */
  holding: string[];
  /** The action they are doing, or null. */
  action: ActionName | null;
  /** How open their mouth is (0..1), from the voice (0 without a clock). */
  talk: number;
  t: number;
}
export interface PropLook {
  x: number; y: number; sx: number; sy: number; scale: number; opacity: number;
  /** A door or lid: 0 shut … 1 open (null for a kind that does not open). */
  open: number | null;
  /** How many things it holds now (null for a thing that is not a container). */
  count: number | null;
  k: number; t: number;
}
export interface PlaceAdapter {
  /** The floor's y (px). */
  floor: number;
  /** Where props may stand: {name: [x, y]}. */
  spots?: Record<string, Point>;
  /** What the camera may frame: {name: box}. */
  regions?: Record<string, Box>;
  draw(ctx: CanvasContext, t: number): void;
  /** Drawn over everything else (a counter people stand behind). */
  front?(ctx: CanvasContext, t: number): void;
}
export interface PersonAdapter {
  /** Standing height (px): it sets a walk's steps. */
  size: number;
  /** How far they reach from where they stand (px); STAGE.reach × size by default. */
  reach?: number;
  /** Where held things sit: [dx, dy] from the feet for someone facing right, or (pose) → [x, y]. */
  hand?: Point | ((pose: {x: number; y: number; facing: 1 | -1; size: number; walk: WalkPose | null}) => Point);
  /** The drawing opens its mouth with pose.talk (the lip-sync check reads it). */
  mouth?: boolean;
  /** How they walk unless an action says (a stroll by default). */
  walk?: Walking;
  draw(ctx: CanvasContext, pose: PersonPose): void;
}
export interface PropAdapter {
  size: [number, number];
  /** A container: how many things it holds. */
  slots?: number;
  /** Slot k's place from the container's bottom centre (rows across its width by default). */
  slotAt?(k: number, info: {capacity: number; item: [number, number]}): Point;
  /** It has a door or lid (look.open). */
  opens?: boolean;
  /** Drawn with its bottom centre at (0, 0); the stage places, scales and fades it. */
  draw(ctx: CanvasContext, look: PropLook): void;
  /** Drawn over what it holds. */
  front?(ctx: CanvasContext, look: PropLook): void;
}
export interface Badge { x: number; y: number; n: number; pop: number; done: boolean; opacity: number }
export interface StageAdapters {
  places: Record<string, PlaceAdapter>;
  people: Record<string, PersonAdapter>;
  props: Record<string, PropAdapter>;
  badge?(ctx: CanvasContext, badge: Badge): void;
}
export interface AdapterPort {
  readonly kit: string;
  place(name: string, where: string): PlaceAdapter;
  person(kind: string, where: string): PersonAdapter;
  prop(kind: string, where: string): PropAdapter;
  readonly badge: StageAdapters['badge'] | null;
  readonly places: readonly string[]; readonly people: readonly string[]; readonly props: readonly string[];
}

// ── what the stage gives back ───────────────────────────────────────────────────────────────────────────────────────
export type Fact = string | number;
export interface StageFacts { readonly start: Readonly<Record<string, Fact>>; readonly end: Readonly<Record<string, Fact>> }
export interface LedgerEntry {
  readonly at: number;
  /** The action (and beat) it records: "actions[2].at[4]". */
  readonly path: string;
  readonly do: ActionName;
  readonly said: string;
  /** How many of each prop are where: {apples: {bag: 7, pet1: 1, gone: 1}} (a container's or person's id, ground, gone, offstage). */
  readonly where: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /** What each person holds: {girl: {bag: 1}}. */
  readonly holds: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /** Who is on stage. */
  readonly on: readonly string[];
  readonly count?: number;
  readonly fingers?: number;
}
export interface StageState {
  t: number;
  people: PersonPose[];
  items: Array<PropLook & {key: string; prop: string; kind: string; layer: string}>;
  badges: Badge[];
}
export interface StageRegion { box: Box; path: string; label: string; name: string }
export interface Stage {
  readonly place: string;
  stateAt(t: number): StageState;
  draw(ctx: CanvasContext, t: number): void;
  regionsAt(t: number): StageRegion[];
  readonly sounds: ReadonlyArray<{readonly time: number; readonly type: string}>;
  readonly ledger: readonly LedgerEntry[];
  readonly facts: StageFacts;
  /** The facts the film carries across shots (null for a stage aside). */
  readonly continuity: StageFacts | null;
  /** When the last action settles (seconds). */
  readonly end: number;
}
export function compileStage(spec: StageSpec, options: {adapters: StageAdapters | AdapterPort; at?: (beat: Beat) => number; clock?: unknown; where?: string}): Stage;
export function stageKit(kit: StageAdapters & {name: string}): {readonly name: string; readonly adapters: AdapterPort; readonly story: {readonly context: true; compile(spec: StageWorld, context: unknown): unknown}};
export function readAdapters(adapters: StageAdapters, kit?: string): AdapterPort;
export function plainBadge(ctx: CanvasContext, badge: Badge): void;

export interface ActionRule { readonly keys: readonly string[]; readonly needs: readonly string[]; readonly either?: readonly string[]; readonly group?: boolean; readonly travel?: TravelName; readonly sound?: string }
export const ACTIONS: Readonly<Record<ActionName, ActionRule>>;
export const ACTION_NAMES: readonly ActionName[];
export const BADGES: Readonly<Record<BadgeName, string>>;
export const BADGE_NAMES: readonly BadgeName[];
export interface Travel { readonly seconds: number; readonly bend: number; readonly ease: string; readonly anticipate: boolean; readonly land: number }
export const TRAVELS: Readonly<Record<TravelName, Travel>>;
export const TRAVEL_NAMES: readonly TravelName[];
interface Swing { readonly anticipate: number; readonly move: number; readonly settle: number; readonly lift: number; readonly overshoot: number }
export const STAGE: Readonly<{arm: Swing; door: Swing; hold: number; lower: number; fade: number; look: number; badge: number; fingers: number; reach: number; offstage: number}>;
export const STAGE_KEYS: readonly string[];
/** The demo kit's adapters: places shop, park, room; people adult, child, pet; props apple, bag, crate, box. */
export const DEMO: Readonly<StageAdapters>;
export const demoKit: ReturnType<typeof stageKit>;
