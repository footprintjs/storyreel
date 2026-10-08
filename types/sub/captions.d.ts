export {spokenTracks} from '../index.js';
/** Draw a caption centred in a box (output pixels): bold words on a dark pill, the word being said in the accent. */
export function drawCaption(ctx: unknown, caption: {words: {text: string}[]; active: number} | null, box: import('../index.js').Box, style?: {size?: number; font?: string; ink?: string; accent?: string; pill?: string}): void;
