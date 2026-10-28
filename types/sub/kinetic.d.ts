import type {Clock, StoryWorld, Kit} from '../index.js';
import type {MoveName} from './moves.js';

/** A word of a kinetic stage: its text, landing when the voice says it — or {text, at}, landing at its own anchor. */
export type KineticWord = string | {text: string; at: [string, string] | [string, string, number] | {scene: string; phrase: string; edge?: 'start' | 'end'; plus?: number; nth?: number}};
/** A kinetic stage's spec (the world's own keys, beside `kit: 'kinetic'`). */
export interface KineticSpec {
  kit?: 'kinetic';
  /** the scene whose voice the words follow (each lands when it is said, in order) */
  scene?: string;
  words: KineticWord[];
  /** one word at a time (slam, the default), or building up line under line (stack) */
  style?: 'slam' | 'stack';
  /** the entrance each word makes: a text entrance from the shared table (slam) */
  move?: MoveName;
  /** the ground and the ink swap at every word */
  flip?: boolean;
  /** [ground, ink], two hex colours */
  colors?: [string, string];
  /** a sound at every word that lands (tap, click, whoosh …) */
  sound?: string | null;
  /** the largest a word is drawn, px on the 1600×900 frame (480) */
  size?: number;
}
/** The kit's numbers: the largest a word is drawn, the default colours, the face, how much of the frame's width a word may fill, line height, an earlier stacked word's dimness, the most words. */
export const KINETIC: Readonly<{size: number; colors: readonly [string, string]; font: string; fit: number; line: number; dim: number; most: number}>;
/** The words compiled against the film's clock: a world (draw, texts for the reading check, sounds). */
export function compileKinetic(spec: KineticSpec, clock: Clock): StoryWorld;
/** The kinetic kit: words that slam in as the voice says them. Pass it in `kits`; a world stage or the story names it (`kit: 'kinetic'`). */
export const kineticKit: Kit;
