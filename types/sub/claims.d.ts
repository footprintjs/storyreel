import type {Claim, Claims, NumberFact, Storyboard, VerdictRules} from '../index.js';
export type {Claim, Claims, NumberFact} from '../index.js';
/** The numbers a text shows, in order: footprint-narration's digit runs, less a run right after a letter (part of a name: H2O, MP4, v2). */
export function numbersIn(text: string): string[];
/** The value a number stands for ("1,000" → 1000, "16.670" → 16.67); a time or a version stays as written. */
export function numberValue(run: string): number | string;
/** A facts list, checked: [{value, text?, source}]; anything else refuses, naming the fix. */
export function readFacts(list: unknown, where?: string): NumberFact[];
/** Each scene's example label ("Example data", or the scene's own words), or null for a scene that is not example data. */
export function exampleScenes(storyboard: Storyboard): (string | null)[];
/** The numbers shown, each with the fact that backs it or the example scene it sits in, in time order. */
export function findClaims(shown: {text: string; line?: string; offset?: number; at: number; scene: number; path: string}[], options?: {facts?: NumberFact[] | null; examples?: (string | null)[]; scenes?: string[]}): Claim[];
/** What the claims add up to, for the verdict. */
export function claimsCount(claims: Claims): {numbers: number; examples: number; sourced: number; open: number; unsourced: number; factsGiven: boolean};
/** The numbers with no source, outside example scenes (none without facts: then the check cannot run). */
export function unsourcedClaims(claims: Claims): Claim[];
/** The fix for a number with no source, in words. */
export function claimFix(claim: Claim): string;
/** A number with no source, in words, with its scene, its entry and the fix. */
export function claimText(claim: Claim): string;
/** The verdict: passed when nothing is shown; not run when the numbers have no facts to be checked against; failed when one has no source. */
export const CLAIMS_VERDICT: Readonly<VerdictRules>;
