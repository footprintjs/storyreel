export {TRANSITIONS, TRANSITION_NAMES, transitionCatalog} from '../index.js';
export type {TransitionName, Transition, BuiltInTransition, TransitionSetting, TransitionDraw, Enter, FrameBox} from '../index.js';
import type {Enter, BuiltInTransition, TransitionDraw} from '../index.js';
import type {Ease} from './ease.js';
/** A shot's entrance read from the recipe (an unknown name, key or setting refuses, naming what the transition takes). */
export function readEntrance(enter: Enter | undefined, where: string, catalog?: Record<string, Readonly<BuiltInTransition>>): {type: string; seconds: number; lead: number; ease: Ease; sound: string | null; p: Readonly<Record<string, unknown>>; draw: ((ctx: any, args: TransitionDraw) => void) | null; regions: ((p: Readonly<Record<string, unknown>>) => {from?: string[]; to?: string[]}) | null; at: readonly [number, number]};
/** A hard cut. */
export const CUT: Readonly<{type: 'cut'; seconds: 0; lead: 0; sound: null; p: Readonly<Record<string, never>>; at: readonly [number, number]}>;
/** ghost(ctx, alpha, paint): paint into a scratch picture at ctx's scale, laid over ctx at alpha. */
export function ghostPainter(): (ctx: any, alpha: number, paint: (ctx: any) => void) => void;
