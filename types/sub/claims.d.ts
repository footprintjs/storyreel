import type {Claim, Claims, NumberFact, Storyboard, VerdictRules} from '../index.js';
export type {Claim, Claims, NumberFact} from '../index.js';
/** The numbers a text shows, in order, each with its sign: footprint-narration's digit runs, less a run that is part of a name (right after a cased letter, or after a hyphen after one: H2O, MP4, COVID-19). */
export function numbersIn(text: string): string[];
/** The value a number stands for ("1,000,000" → 1000000, "16.67" → 16.67, "−5" → −5); one that is not one value ("1,000" and "1.000": a thousand, or one?; a time "3:15"; a version "1.2.3") stays as written. */
export function numberValue(run: string): number | string;
/** A facts list, checked: [{value, text?, source}]; anything else refuses, naming the fix. */
export function readFacts(list: unknown, where?: string): NumberFact[];
/** Each scene's example label ("Example data", or the scene's own words), or null for a scene that is not example data. */
export function exampleScenes(storyboard: Storyboard): (string | null)[];
/** The numbers shown, each with the fact that backs it or the example scene it sits in, in time order. */
export function findClaims(shown: {text: string; line?: string; offset?: number; at: number; to: number; scene: number; path: string}[], options?: {facts?: readonly NumberFact[] | null; examples?: readonly (string | null)[]; scenes?: string[]}): Claim[];
/** The numbers the picture draws that no declared claim holds, from the words the review reads off its frames (path 'drawn'). */
export function drawnClaims(samples: {t: number; words: {text: string}[]}[], options: {claims: Claims; sceneOf(t: number): number; scenes?: string[]}): Claim[];
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
