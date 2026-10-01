import type {Clock, StoryWorld} from '../index.js';
export {cartoonKit} from '../index.js';
export function compileCartoon(spec: Record<string, unknown>, clock: Clock, motion?: {cameraSpeed: number}): StoryWorld;
