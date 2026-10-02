export {approveFilm, checkApproval} from '../index.js';
export type {Approval, FilmInputs} from '../index.js';
import type {Approval, FilmInputs} from '../index.js';
/** JSON with every object's keys sorted: the same data always spells the same text. */
export function stableJson(value: unknown): string;
/** The voice: its timings.json and every audio file it names, each by name, length and bytes. */
export function voiceHash(narrationDir: string): string;
/** An approval, checked: what approveFilm makes, or a refusal. */
export function readApproval(approval: unknown): Approval;
/** Refuse a render of anything but the approved film, naming what changed and when it was approved. */
export function requireApproval(approval: Approval, inputs: FilmInputs): void;
/** What an approval of these inputs does not lock (the record says so beside the approval). */
export function unlocked(inputs: FilmInputs): string[];
