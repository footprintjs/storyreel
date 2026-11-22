import type {StoryWorld, ContextKit, KitContext} from '../index.js';

/** An anchor on the film's clock: [scene, phrase] or [scene, phrase, seconds after]. */
export type IsoAnchor = [string, string] | [string, string, number] | {scene: string; phrase: string; edge?: 'start' | 'end'; plus?: number; nth?: number};
/** A block (or a cylinder) on the floor: StoryDeck's data-k, data-iso, data-at, data-size, <b>, <small>, --iso-color, class ok/warn/bad, data-iso-group, data-ports. */
export interface IsoBlockSpec {
  /** one word a wire's arrow can say (no space, no dot): what a camera frames */
  name: string;
  kind?: 'block' | 'cylinder';
  /** [col, row] or [col, row, lift]; give every block one, or none (then they are placed from the wires) */
  at?: [number, number] | [number, number, number];
  /** [wide, deep, high] in tiles ([2, 2, 1]); a cylinder's width and depth are equal */
  size?: [number, number, number];
  /** its name on its top, fitted (one line at 26 px, two, then smaller to 16) */
  label?: string;
  /** the line under its label */
  small?: string;
  color?: string;
  tone?: 'ok' | 'warn' | 'bad';
  group?: string | null;
  /** points on its sides where a cable plugs in, in its own tiles */
  ports?: {name: string; at: [number, number, number]; face?: 'right' | 'left' | 'back-left' | 'back-right'}[];
  /** when it comes in (from the start when left out) */
  appear?: IsoAnchor;
}
/** A floor: tile lines, a name along its front edge; with no size, fitted round its blocks (its group's). */
export interface IsoFloorSpec { name?: string; at?: [number, number]; size?: [number, number]; label?: string; color?: string; group?: string | null; appear?: IsoAnchor }
/** A wire: StoryDeck's data-arrow, data-label, data-head, data-packets, data-speed, data-ride, data-rest, data-trail, data-behind. */
export interface IsoWireSpec {
  name?: string;
  /** "you to server", "lap.rj45 to sw.p1"; a trailing bend ("you to server 0") draws it straight */
  arrow: string;
  label?: string;
  head?: 'none';
  /** how many ride it, 0 to 6 */
  packets?: number;
  /** seconds a run takes (0.5 to 60, 3), or "260px" a second */
  speed?: number | `${number}px` | `${number}px/s`;
  /** shares of the length eased out of its start and into its end, each 0 to 0.5 (one number for both) */
  ride?: number | [number, number];
  /** seconds a packet rests at the end, 0 to 60 */
  rest?: number;
  trail?: {width: number; color: string};
  behind?: 'fade';
  appear?: IsoAnchor;
  /** when its packets begin to ride (when it appears; else the film's start) */
  start?: IsoAnchor;
}
/** An isometric world's spec (beside `kit: 'isometric'`). */
export interface IsometricSpec {
  kit?: 'isometric';
  blocks: IsoBlockSpec[];
  floors?: IsoFloorSpec[];
  wires?: IsoWireSpec[];
  /** "fit" (the default), or a grid in numbers: a tile's width in px (or [width, height]), where the floor's far corner stands */
  grid?: 'fit' | {tile: number | [number, number]; at: [number, number]; rise?: number};
  /** where a fitted picture goes on the 1600×900 frame, [x0, y0, x1, y1] */
  area?: [number, number, number, number];
  /** the look: footprint-story's style row, a named choice per column (`{line: {name: 'ink', width: 5}}`, `{line: 'none'}`); a column left out, or no style, is today's look */
  style?: IsoStyleRow;
  /** a warning about the map refuses the film */
  strict?: boolean;
  /** blocks that move by intent: footprint-story decides each move's model, duration and curve (at most 64) */
  motion?: IsoMotionSpec[];
}
/** A place in the world a move names: a block's name (its top's middle), or tiles [col, row] / [col, row, lift]. */
export type IsoPlace = string | [number, number] | [number, number, number];
/**
 * One move of a block, written as intent in footprint-story's words: `do` fall (straight down to the floor under it),
 * throw (onto `to`, through the air), hang (on a rope from the pin `from`, swinging to rest below it), settle or reach
 * (to `to`). The tool decides the model, the duration and the curve.
 */
export interface IsoMotionSpec {
  /** the block that moves, by its name; a block a wire joins cannot move */
  piece: string;
  do: 'fall' | 'throw' | 'hang' | 'settle' | 'reach';
  /** when it begins (when the block appears; else the film's start) */
  at?: IsoAnchor;
  /** where it ends: a throw's, a settle's and a reach's (a fall and a hang take none) */
  to?: IsoPlace;
  /** a hang's pin (only a hang takes one) */
  from?: IsoPlace;
  /** footprint-story's wrappers, innermost first: [{wrapper: 'anticipate'}] — anticipate, follow-through, hold, overshoot (at most 4) */
  wrap?: {wrapper: string; [option: string]: unknown}[];
  /** one of footprint-story's models for the family ("bounce", or {name: 'bounce', squash: 0.2}); left out, its family's usual */
  model?: string | {name: string; [option: string]: unknown};
  /** critics whose findings this move keeps (["arc"]: a straight slide is meant): shown as accepted, never a fault; each must be one its model is checked by, or "reel:contact" */
  accept?: string[];
}
/** One move as the world's record keeps it: footprint-story's choice, reason and seconds, and when it begins on the film's clock. */
export interface IsoMotionRecord {
  readonly path: string; readonly piece: string; readonly do: string; readonly at: number; readonly seconds: number;
  readonly model: string; readonly by: 'usual' | 'named'; readonly reason: string; readonly wrappers: readonly string[];
  /** the critics its entry accepts (absent when none) */
  readonly accepted?: readonly string[];
}
/** What a critic found in a move: its entry, when the move runs, the critic, and the fix in footprint-story's words. */
export interface IsoMotionFinding { readonly path: string; readonly from: number; readonly to: number; readonly critic: string; readonly level: 'warn' | 'note' | 'accepted' | string; readonly what: string; readonly fix: string }
/** One column's choice: its name, or {name, …its options} (footprint-story's isoStyle). */
export type IsoStyleEntry = string | {name: string; [option: string]: string | number | boolean};
/** A style row as a world writes it: footprint-story's columns, each left out its usual choice. */
export interface IsoStyleRow { shape?: IsoStyleEntry; shading?: IsoStyleEntry; line?: IsoStyleEntry; palette?: IsoStyleEntry; texture?: IsoStyleEntry; effects?: IsoStyleEntry[] }
/** The style a map was built in, as footprint-story records it: every column's name, and the options written. */
export interface IsoStyleRecord {
  readonly row: {readonly shape: string; readonly shading: string; readonly line: string; readonly palette: string; readonly texture: string; readonly effects: readonly string[]};
  readonly options: Readonly<Record<string, unknown>>;
}
/** What the kit says of the map it built, each naming the recipe entry and the fix. */
export interface IsoNote { readonly level: 'warn' | 'info'; readonly path: string; readonly message: string }
/** The map as built: who placed it, the tile, every block, floor and cable (frame px, rounded to a tenth). */
export interface IsoRecord {
  readonly placed: 'build' | 'hand'; readonly tile: number; readonly fitted: boolean; readonly style: IsoStyleRecord;
  readonly blocks: readonly {name: string; kind: 'block' | 'cylinder'; at: number[]; size: number[]; lines?: string[]; nameSize?: number; fits?: boolean}[];
  readonly floors: readonly {name: string | null; at: number[]; size: number[]; lines?: string[]; fits?: boolean; covered?: boolean}[];
  readonly cables: readonly {name: string | null; from: string; to: string; along: boolean; ports?: (string | null)[]; points: [number, number][]; length: number; unseen: [number, number][]; behind?: string[]; crosses?: number; shared?: number; bends?: number; period?: number}[];
  /** each move of a world with a motion (absent when it has none) */
  readonly motions?: readonly IsoMotionRecord[];
}
/** The world compiled: StoryWorld (draw, regionsAt, texts, parts) with the kit's notes and the map's record. */
export function compileIsometric(spec: IsometricSpec, context: Pick<KitContext, 'clock'> & {theme?: unknown; where?: string}): StoryWorld & {notes: readonly IsoNote[]; map: IsoRecord;
  /** a world with a motion: what footprint-story's critics found, and the intents it was handed (frame px) */
  motionFindings?: readonly IsoMotionFinding[]; motionIntents?: readonly Readonly<Record<string, unknown>>[]};
/** The isometric kit: pass it in `kits`; a world stage or the story names it (`kit: 'isometric'`). */
export const isometricKit: ContextKit;
/** The limits: pieces a world, packets a wire, a run's seconds, a rest, a trail's width, label letters, a name's letters, a block's usual size, a run's usual seconds. */
export const ISO_LIMITS: Readonly<{pieces: number; packets: number; seconds: readonly [number, number]; rest: number; trail: readonly [number, number]; label: number; wireLabel: number; name: number; usualSize: readonly [number, number, number]; runSeconds: number}>;
/** The numbers the kit builds its maps with: footprint-story's film policy (ISO_MAP_POLICIES.film) — tile range, grouped least, inset, floor margin under `fit`; name and small sizes; the share of a top's room a name takes; which floors a fitted picture holds. */
export const ISO_FIT: Readonly<{fit: Readonly<{most: number; least: number; grouped: number; inset: number; margin: number}>; name: Readonly<{size: number; least: number}>; small: Readonly<{size: number; least: number}> | null; clear: number; hold: 'groups' | 'groups-and-labels'}>;
/** The look where the theme has none. */
export const ISO_LOOK: Readonly<{tone: string; glow: string; line: number; grid: number; cable: number; label: number; smallInk: number; appear: number; rope: number}>;
/** What a block can do in a film (footprint-story's words), and the places each takes: `to` where it ends, `from` a hang's pin. */
export const MOTION_DOS: Readonly<Record<'fall' | 'throw' | 'hang' | 'settle' | 'reach', Readonly<{to: boolean; from: boolean}>>>;
/** The keys a motion entry takes. */
export const MOTION_KEYS: readonly string[];
/** The most motion entries a world holds (footprint-story's most intents). */
export const MOST_MOTIONS: number;
/** The frame the moves are planned on: [1600, 900]. */
export const MOTION_FRAME: readonly [number, number];
/** The kit's own critics beside footprint-story's: "reel:contact", a move that passes through another block. */
export const REEL_CRITICS: readonly string[];
/** A running packet's radius, px. */
export const PACKET_RADIUS: number;
/** When a crossing count and a turn count are said. */
export const NOTE_FROM: Readonly<{crosses: number; turns: number}>;
/** A wire's arrow read against the blocks: its two ends and whether it is drawn straight. */
export function readArrow(arrow: string, who: string, blocks: readonly {name: string; ports: readonly {name: string}[]}[]): {from: {block: unknown; port: string | null}; to: {block: unknown; port: string | null}; straight: boolean};
