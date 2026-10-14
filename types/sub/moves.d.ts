import type {EaseSpec} from './ease.js';
import type {Feel, FeelName} from './motion.js';

/** What kind of moment a move is: something arriving, leaving, answering (a shake, a nod), or always there (a loop). */
export type MoveKind = 'entrance' | 'exit' | 'feedback' | 'ambient';
/** How a move feels, the way motion-reference libraries sort them. */
export type MoveFeelName = 'smooth' | 'crisp' | 'soft' | 'heavy' | 'bouncy';
/** What a move is for. */
export type MoveUse = 'ui' | 'text' | 'logo' | 'character' | '3d';
/** The shape a clip uncovers: from an edge, or a circle from the centre. */
export type MoveMask = 'left' | 'right' | 'top' | 'bottom' | 'iris';
/** A property a move animates. */
export type MoveProp = 'opacity' | 'x' | 'y' | 'scale' | 'rotate' | 'blur' | 'clip' | 'progress';
/** A property's motion: [from, to] on the move's curve; {from, to, ease?, span?} on its own; or around its rest — a swing either side (wave) or a rise and fall (swell), `cycles` times. */
export type MovePropSpec = readonly [number, number]
  | {from: number; to: number; ease?: EaseSpec; span?: readonly [number, number]}
  | {rest: number; wave: number; cycles: number; span?: readonly [number, number]}
  | {rest: number; swell: number; cycles: number; span?: readonly [number, number]};
export type MoveName = 'fade-slide' | 'soft-rise' | 'mask-wipe' | 'iris-open' | 'overshoot' | 'bounce-landing' | 'spring-follow' | 'pop'
  | 'text-reveal-word' | 'text-reveal-letter' | 'count-up' | 'line-draw' | 'blur-in' | 'scale-in' | 'drop-in' | 'slam'
  | 'fade-slide-out' | 'soft-sink' | 'mask-wipe-out' | 'iris-close' | 'pop-out' | 'blur-out' | 'scale-out' | 'drop-out'
  | 'shake' | 'wiggle' | 'nod' | 'marquee' | 'pulse' | 'float';
/**
 * A move, as data: its kind, feel and uses (to find it), its seconds, ONE curve (an ease, or a spring feel) and the
 * properties it animates. `mask` comes with a clip; `split` and `gap` (seconds between pieces) with a text reveal;
 * `loop` with an ambient move; `pairs` (the entrance it closes) with an exit.
 */
export interface Move {
  name: string;
  kind: MoveKind;
  feel: MoveFeelName;
  uses: readonly MoveUse[];
  seconds: number;
  ease?: EaseSpec;
  spring?: FeelName | Feel;
  props: Readonly<Partial<Record<MoveProp, MovePropSpec>>>;
  mask?: MoveMask;
  split?: 'word' | 'letter';
  gap?: number;
  loop?: true;
  pairs?: string;
}
/** A move's values at a moment: every property (at rest where the move leaves it alone), and the shape its clip uncovers. */
export interface MoveValues {
  /** 0..1 (rest 1). */ opacity: number;
  /** Pixels on the 1600×900 frame, an offset (rest 0). */ x: number;
  /** Pixels on the 1600×900 frame, an offset (rest 0). */ y: number;
  /** A factor (rest 1). */ scale: number;
  /** Degrees (rest 0). */ rotate: number;
  /** Pixels of blur (rest 0). */ blur: number;
  /** 0..1: how much of the thing its mask uncovers (rest 1). */ clip: number;
  /** 0..1: how much of the thing's own content shows — a line drawn, a number counted (rest 1). */ progress: number;
  /** The shape the clip uncovers, or null. */ mask: MoveMask | null;
}
/** What each property is when nothing moves it. */
export const REST: Readonly<Record<MoveProp, number>>;
/** The vocabulary: 16 entrances, 8 exits (each half its entrance's seconds), 3 feedback moves, 3 ambient loops. */
export const MOVES: Readonly<Record<MoveName, Readonly<Move>>>;
export const MOVE_NAMES: readonly MoveName[];
export const MOVE_KINDS: readonly MoveKind[];
export const MOVE_USES: readonly MoveUse[];
export const MASKS: readonly MoveMask[];
/** Each feel's curve when moveAt is asked for it: smooth outCubic, crisp the snappy spring, soft outQuint, heavy the heavy spring, bouncy the playful spring. */
export const MOVE_FEELS: Readonly<Record<MoveFeelName, Readonly<{ease: EaseSpec} | {spring: FeelName}>>>;
export const MOVE_FEEL_NAMES: readonly MoveFeelName[];
/** Practitioners' numbers: 0.09 s between words, 0.03 s between letters, an exit takes half its entrance. */
export const WORD_GAP: number;
export const LETTER_GAP: number;
export const EXIT_SHARE: number;
/** A move by name, or one of your own, checked as a frozen copy (what you pass is never frozen; yours is checked each time, so a change counts) against the laws: an entrance ends at rest, an exit starts at rest…; a spring move lasts until its spring is within 1% of rest. An unknown name refuses, naming the moves by kind. */
export function readMove(move: MoveName | (string & {}) | Move, where?: string): Readonly<Move>;
/** moveAt's options: when it starts (0), its seconds (its own), another curve (a move feel, a spring feel or {k, d}), reduced motion (jump to the end). */
export interface MoveAtOptions {start?: number; seconds?: number; feel?: MoveFeelName | FeelName | Feel; reduced?: boolean}
/** A move's values at t: before `start` its start, after its seconds its end; an ambient move repeats. Reduced motion jumps: the start until `start`, then the end. */
export function moveAt(move: MoveName | (string & {}) | Move, t: number, options?: MoveAtOptions): MoveValues;
/** Each item's delay: index × gap (seconds, or a text-reveal move's own gap). */
export function stagger<T>(items: readonly T[], gap: number | MoveName | (string & {}) | Move): {item: T; index: number; delay: number}[];
/** The moves that match every filter given, in the table's order. */
export function movesBy(filter?: {feel?: MoveFeelName; use?: MoveUse; kind?: MoveKind}): Readonly<Move>[];
/** Apply a move's values to a canvas for a thing drawn in box (the whole frame by default): opacity, offset, scale and turn about its centre, mask, blur. Save before, restore after; false when nothing shows. */
export function applyMove(ctx: any, values: MoveValues, options?: {box?: readonly [number, number, number, number]}): boolean;
