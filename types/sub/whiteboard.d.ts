import type {Clock, Kit, Region} from '../index.js';
export {whiteboardKit} from '../index.js';
/** A compiled board (opaque: pass it back to the functions below). */
export type Board = {readonly __board: unique symbol};
export function compileWhiteboard(spec: Record<string, unknown>, clock: Clock, motion?: {cameraSpeed: number}): Board;
export function boardRegions(board: Board, t: number): Region[];
export function boardTexts(board: Board): {text: string; from: number; to: number; path: string}[];
export function spotAt(board: Board, t: number): {cx: number; cy: number; r: number; zoom: number; w: number} | null;
export function drawWhiteboard(ctx: unknown, board: Board, t: number, spot?: unknown): void;
export type {Kit};
