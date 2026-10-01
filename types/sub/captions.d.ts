export {captionChunks, captionFile} from '../index.js';
export type {CaptionChunk} from '../index.js';
/** The chunks a caption file uses by default: sentences, at most two lines of 42 characters. */
export const FILE_CHUNKS: Readonly<{maxWords: 16; maxChars: 84; breaks: 'sentence'}>;
/** The caption at t: its words and which one is being said (-1 between words), or null. */
export function captionAt(chunks: import('../index.js').CaptionChunk[], t: number): {words: import('../index.js').CaptionChunk['words']; active: number} | null;
/** Draw a caption centred in a box (output pixels): bold words on a dark pill, the word being said in the accent. */
export function drawCaption(ctx: unknown, caption: {words: {text: string}[]; active: number} | null, box: import('../index.js').Box, style?: {size?: number; font?: string; ink?: string; accent?: string; pill?: string}): void;
