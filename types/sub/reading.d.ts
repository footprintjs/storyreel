/** The words pace (the default): 0.3 s a word, at least 1 s. */
export const READING: {readonly perWord: number; readonly least: number};
/** The letters pace (`"reading": {"pace": "letters"}`): 1.5 s to find the line, then a fifteenth of a second a letter. */
export const LETTERS: {readonly perLetter: number; readonly base: number};
/** A reading pace: by words (READING) or by letters (LETTERS). */
export type ReadingPace = typeof READING | typeof LETTERS;
export function wordsIn(text: string): number;
/** The letters and digits in a line (what the letters pace counts). */
export function lettersIn(text: string): number;
/** The seconds a line needs on screen to be read, at a pace (READING by default). */
export function secondsToRead(text: string, rule?: ReadingPace): number;
export function tooShortToRead(lines: {text: string; from: number; to: number; path: string}[], rule?: ReadingPace): {path: string; text: string; at: number; seconds: number; needs: number}[];
/** A recipe's `reading` setting checked: 'report', 'refuse', or {rule?, pace?: 'words' | 'letters'}; returns the rule. */
export function readingMode(value: unknown): 'report' | 'refuse';
/** The pace a recipe's `reading` asks for: READING (by words, the default) or LETTERS. */
export function readingPace(value: unknown): ReadingPace;
