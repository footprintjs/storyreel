export const READING: {readonly perWord: number; readonly least: number};
export function wordsIn(text: string): number;
export function secondsToRead(text: string, rule?: {perWord: number; least: number}): number;
export function tooShortToRead(lines: {text: string; from: number; to: number; path: string}[], rule?: {perWord: number; least: number}): {path: string; text: string; at: number; seconds: number; needs: number}[];
export function readingMode(value: unknown): 'report' | 'refuse';
