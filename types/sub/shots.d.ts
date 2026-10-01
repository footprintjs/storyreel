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
