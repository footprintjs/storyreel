/** The timing every mood change is acted with: seconds, except overshoot (how far a take falls back past rest, 0..1). */
export const ACTING: Readonly<{anticipate: number; reopen: number; fade: number; settle: number; overshoot: number}>;
/** A mood from `at` seconds on; take (0..1, default 1) is how big the reaction is — 0 for a change that only cross-fades. */
export interface MoodKey { at: number; mood: string; take?: number }
/** A character's mood at t, acted (see `moodAt`). */
export interface ActedMood {
  /** The mood now: the latest key at or before t (the first key's before it). */
  mood: string;
  /** The mood before the latest change (null before the first change); `u` says how far the change has gone. */
  from: string | null;
  /** How far the change has gone, 0..1 over `fade`: cross-fade colours with it. */
  u: number;
  /** 0..1: rises over `anticipate` before a change, falls over `reopen` after it. Squint the eyes with it: the face swaps while they are nearly shut. */
  anticipation: number;
  /** The take's stretch now: up to the key's take early, back past rest by overshoot × take, 0 at `settle`. */
  take: number;
  /** 0..1 with a little overshoot: a pose settling into the new mood. */
  settle: number;
}
/** A character's mood at t, acted: anticipation, a swap under the squint, a take that settles, a colour cross-fade. A key that repeats the mood is no change; refuses keys out of time order, two moods at one moment, and changes closer than max(fade, settle). */
export function moodAt(keys: readonly MoodKey[], t: number, options?: Partial<typeof ACTING>): ActedMood;
/** What a character does while nothing happens. */
export interface Idle {
  /** A scale, about 1 ± breath. */
  breath: number;
  /** 0 open .. 1 shut. */
  blink: number;
  /** Pixels, about ± sway. */
  sway: number;
  /** -1..1: a small look aside now and then, 0 most of the time. */
  glance: number;
}
/** The idle layer at t: breathe, blink, sway, glance. Give each character its own seed, so no two move in step. Periods are seconds above 0; blinkEvery: Infinity (or blinkFor: 0) never blinks; a blink takes under half of blinkEvery. */
export function idleAt(t: number, options?: {seed?: number; breath?: number; breathEvery?: number; blinkEvery?: number; blinkFor?: number; sway?: number; swayEvery?: number}): Idle;
/** A value that follows another `delay` seconds (default 0.15) behind it: the head follows where the eyes went. */
export function follows<T>(f: (t: number) => T, delay?: number): (t: number) => T;
/** How open `who`'s mouth is at t (0..1): it moves only while its owner says a word (clock.speaking; null is the narrator), once a syllable or so. */
export function mouthAt(clock: {speaking?(t: number): {speaker: string | null; start: number; end: number} | null}, t: number, who?: string | null, options?: {syllable?: number}): number;

/** The fingers of one hand, in the order every hand's numbers are returned in. */
export const FINGER_NAMES: readonly ['thumb', 'index', 'middle', 'ring', 'little'];
export type FingerName = typeof FINGER_NAMES[number];
/** The counting orders by name: the finger that counts first on a hand, then the next; the second hand counts in the same order. */
export const COUNTING_ORDERS: Readonly<{'thumb-first': readonly FingerName[]; 'index-first': readonly FingerName[]; 'little-first': readonly FingerName[]}>;
export type CountingOrder = keyof typeof COUNTING_ORDERS;
/** The timing every finger moves with: seconds (anticipate, move, settle, stagger) and extension (lift, overshoot). */
export const FINGERS: Readonly<{anticipate: number; move: number; settle: number; lift: number; overshoot: number; stagger: number}>;
/** A finger key: the first is `{at, up}` (how many are up from the start); then each folds, raises, or sets the count — one verb a key. */
export type FingerKey =
  | {at: number; up: number; fold?: never; raise?: never}
  | {at: number; fold: number; up?: never; raise?: never}
  | {at: number; raise: number; up?: never; fold?: never};
/** Each finger's extension in FINGER_NAMES order (thumb … little): 0 folded … 1 straight, a little past either end while it moves. */
export type Hand = [number, number, number, number, number];
/** The hands at t (see `fingersAt`). */
export interface Fingers {
  /** How many fingers are up now: the count after the latest key at or before t (draw this number). */
  up: number;
  /** The count before the latest change (null before the first change). */
  from: number | null;
  hands: {left: Hand; right: Hand};
}
/**
 * A child counting on fingers: ten up and one folded a beat (taking away), or one raised a beat (counting on). Each
 * finger winds back a little, moves quickly, overshoots and settles; the fingers up are the first in the counting
 * order (thumb first, left hand first by default), so a fold takes down the finger raised last. Refuses folding more
 * than are up, raising past ten, keys out of order, and changes closer than one change takes.
 */
export function fingersAt(keys: readonly FingerKey[], t: number, options?: Partial<typeof FINGERS> & {order?: CountingOrder | readonly FingerName[]; first?: 'left' | 'right'}): Fingers;

/** The timing every reaction is acted with: seconds (delay, spread, nodFor, leanHold, leanBack, brightenFor), sizes 0..1 (nod, lean, brighten), and how often a listener nods (chance). */
export const REACTING: Readonly<{delay: number; spread: number; nod: number; nodFor: number; chance: number; lean: number; leanHold: number; leanBack: number; brighten: number; brightenFor: number}>;
/** A sentence another character says: on the whole-lesson clock; mark '?', '!', '.' or null (a turn that ends without one); nth: how many times the speaker said these words in the scene before. */
export interface SaidSentence { scene: string; speaker: string; start: number; end: number; mark: '?' | '!' | '.' | null; text: string; nth: number }
/** How a listener reacts at t (see `reactionAt`). */
export interface Reaction {
  /** Head pitch, -1..1: positive dips the chin; a little negative is the head coming back up past rest. */
  nod: number;
  /** 0..1: leaning in toward a question, held while the answer is awaited. */
  lean: number;
  /** 0..1: a small smile or take when the speaker exclaims. */
  brighten: number;
  /** clock.gaze(t, who): where to turn the eyes (null when nobody else speaks, or the clock has no gaze). */
  look: {at: string; amount: number; also?: {at: string; amount: number}} | null;
  /** The sentence behind each reaction now, or null. */
  cause: {nod: SaidSentence | null; lean: SaidSentence | null; brighten: SaidSentence | null};
}
/**
 * How `who` reacts while others speak, from the clock's turns and its words' punctuation: a soft nod a moment after a
 * sentence ends, a lean in on a question, a brighten on an exclamation; nothing while `who` speaks (a reaction under
 * way lets go over the 0.15 s before their turn). The seed (by default from `who`) and each sentence's own words set
 * its delay and size, so two listeners rarely react in step, and an edit elsewhere in the film changes none of them.
 */
export function reactionAt(clock: {turns(): {scene: string; speaker: string; start: number; end: number}[]; words(scene: string): {text: string; start: number; end: number}[]; gaze?(t: number, who: string): Reaction['look']}, t: number, who: string, options?: Partial<typeof REACTING> & {seed?: number}): Reaction;
