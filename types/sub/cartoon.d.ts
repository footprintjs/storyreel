import type {Clock, Kit} from '../index.js';
export {cartoonKit} from '../index.js';
export function compileCartoon(spec: Record<string, unknown>, clock: Clock, motion?: {cameraSpeed: number}): ReturnType<NonNullable<Kit['story']>['compile']>;
