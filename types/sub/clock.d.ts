export {makeClock, ramp, speechIndex, phraseMatches, evenTimings, directionTimings, withDirections, sceneText} from '../index.js';
import type {StoryboardScene} from '../index.js';
/** How long one direction may last, in seconds: [0.2, 20]. */
export const DIRECTION_SECONDS: readonly [number, number];
/** Refuses a scene that is not exactly one of spoken (narration) or silent (directions); says which it is. */
export function checkScene(scene: StoryboardScene, index?: number): 'spoken' | 'silent';
/** Letters and digits only, lower case: how narration text and spoken words are compared. */
export function normSpeech(text: string): string;
