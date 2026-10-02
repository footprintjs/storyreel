import type {Fact, Watching} from '../index.js';

/** The longest intent, in characters. */
export const INTENT_MAX: number;
/** Too much, too fast: moments closer than `together` s are one; a burst is more than `burst.most` in `burst.seconds`. */
export const WATCHING: {readonly together: number; readonly burst: {readonly most: number; readonly seconds: number}};
/** A shot's moments, merged: a time closer than `together` s to the last kept one is the same moment. */
export function distinctMoments(times: number[], rule?: typeof WATCHING): number[];
/** A shot's intent, checked: one sentence, at most INTENT_MAX characters; null when none is given. */
export function readIntent(value: unknown, where: string): string | null;
/** A shot's continuity, checked: {start, end} (each a flat list of facts); null when none is given. */
export function readContinuity(value: unknown, where: string): {start: Record<string, Fact>; end: Record<string, Fact>} | null;
/** Walk the shots in film order, carrying facts forward; refuses the first contradiction. Returns the facts at the end. */
export function checkContinuity(plan: {where: string; continuity: {start: Record<string, Fact>; end: Record<string, Fact>} | null}[]): Record<string, Fact>;
/** The shots that ask too much, too fast. */
export function tooMuchTooFast(shots: {path: string; where: string; moments: number[]}[], rule?: typeof WATCHING): Watching[];
export function watchingMode(value: unknown): 'report' | 'refuse';
/** One finding in words. */
export function watchingText(finding: Watching): string;
/** A read's limits: `min` (the least time it needs) by default, and the range it may be (seconds). */
export const READS: {readonly min: number; readonly least: number; readonly most: number};
/** A declared read: what the viewer must take in, on a phrase, with the least time it needs, about a named thing. */
export interface ReadSpec { what: string; at: import('../index.js').Beat; min: number; region?: string }
/** A shot's reads, checked (an unknown key, an empty `what`, a `min` outside READS refuse); [] when none are given. */
export function readReads(value: unknown, where: string): ReadSpec[];
/**
 * A shot's timed reads (t: when each starts) checked against the shot (from: when it starts to arrive; to: when it
 * starts to leave): one before or after the shot, two at once, or one the shot leaves before it lands. Returns them
 * in time order, each as given, with a `problem` where there is one.
 */
export function checkReads<R extends {what: string; t: number; min: number}>(reads: R[], options: {from?: number; to: number; where: string}): (R & {problem?: string})[];
