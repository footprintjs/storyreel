/**
 * The route: one pick brief, or one per window. Rules as data, chosen with decide(), so the record says which and why. A
 * caller never chooses: the bytes of the conversation do.
 */
import {choose} from '../engine.mjs';

export const ROUTE_RULES = Object.freeze([
  {when: {windowCount: {eq: 1}}, then: 'one-brief', label: 'The conversation fits in one window: one pick brief reads all of it'},
]);
export const ROUTE_FALLBACK = Object.freeze({branch: 'windowed', label: 'The conversation is larger than one window: it is picked window by window, and no brief is larger than a window'});

/** The decider: reads the window count read-source wrote. */
export const route = (scope) => choose(scope, ROUTE_RULES, ROUTE_FALLBACK);

/** Either branch starts the picking at the first window. */
export function startPicking(scope) {
  scope.windowAt = 0;
  scope.picks = [];
}
