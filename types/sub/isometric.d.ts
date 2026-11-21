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
  /** a warning about the map refuses the film */
  strict?: boolean;
}
/** What the kit says of the map it built, each naming the recipe entry and the fix. */
export interface IsoNote { readonly level: 'warn' | 'info'; readonly path: string; readonly message: string }
/** The map as built: who placed it, the tile, every block, floor and cable (frame px, rounded to a tenth). */
export interface IsoRecord {
  readonly placed: 'build' | 'hand'; readonly tile: number; readonly fitted: boolean;
  readonly blocks: readonly {name: string; kind: 'block' | 'cylinder'; at: number[]; size: number[]; lines?: string[]; nameSize?: number; fits?: boolean}[];
  readonly floors: readonly {name: string | null; at: number[]; size: number[]; lines?: string[]; fits?: boolean; covered?: boolean}[];
  readonly cables: readonly {name: string | null; from: string; to: string; along: boolean; ports?: (string | null)[]; points: [number, number][]; length: number; unseen: [number, number][]; behind?: string[]; crosses?: number; shared?: number; bends?: number; period?: number}[];
}
/** The world compiled: StoryWorld (draw, regionsAt, texts, parts) with the kit's notes and the map's record. */
export function compileIsometric(spec: IsometricSpec, context: Pick<KitContext, 'clock'> & {theme?: unknown; where?: string}): StoryWorld & {notes: readonly IsoNote[]; map: IsoRecord};
/** The isometric kit: pass it in `kits`; a world stage or the story names it (`kit: 'isometric'`). */
export const isometricKit: ContextKit;
/** The limits: pieces a world, packets a wire, a run's seconds, a rest, a trail's width, label letters, a name's letters, a block's usual size, a run's usual seconds. */
export const ISO_LIMITS: Readonly<{pieces: number; packets: number; seconds: readonly [number, number]; rest: number; trail: readonly [number, number]; label: number; wireLabel: number; name: number; usualSize: readonly [number, number, number]; runSeconds: number}>;
/** StoryDeck's fitting numbers: tile range, grouped least, inset, floor margin, name and small sizes, the share of a top's room a name takes. */
export const ISO_FIT: Readonly<{most: number; least: number; grouped: number; inset: number; margin: number; name: Readonly<{size: number; least: number}>; small: Readonly<{size: number; least: number}>; clear: number}>;
/** The look where the theme has none. */
export const ISO_LOOK: Readonly<{tone: string; glow: string; line: number; grid: number; cable: number; label: number; smallInk: number; appear: number}>;
/** A running packet's radius, px. */
export const PACKET_RADIUS: number;
/** When a crossing count and a turn count are said. */
export const NOTE_FROM: Readonly<{crosses: number; turns: number}>;
/** A wire's arrow read against the blocks: its two ends and whether it is drawn straight. */
export function readArrow(arrow: string, who: string, blocks: readonly {name: string; ports: readonly {name: string}[]}[]): {from: {block: unknown; port: string | null}; to: {block: unknown; port: string | null}; straight: boolean};
