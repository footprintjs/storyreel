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
