export {makeClock, ramp, speechIndex, phraseMatches, evenTimings, directionTimings, withDirections, sceneText, spokenText, unsaidNumbers} from '../index.js';
import type {StoryboardScene} from '../index.js';
/** How long one direction may last, in seconds: [0.2, 20]. */
export const DIRECTION_SECONDS: readonly [number, number];
/** Refuses a scene that is not exactly one of spoken (narration) or silent (directions); says which it is. */
export function checkScene(scene: StoryboardScene, index?: number): 'spoken' | 'silent';
/** A scene's moment by name, from its speechIndex: {name, at, start, end} on the scene's own clock — at: when the word after the mark starts; start–end: the pause at the mark — or a refusal naming the moments it has. */
export function momentIn(index: unknown, name: string, id: string, what?: string): {name: string; at: number; start: number; end: number};
/** A time on the film clock to the tenth, m:ss.s (1:21.5), rounded first: 59.96 s is 1:00.0, never 0:60.0. (A chapter's time, m:ss, is footprint-narration's clockText.) */
export function clockTenths(t: number): string;
