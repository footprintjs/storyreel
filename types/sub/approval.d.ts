export {approveFilm, checkApproval, filmHashes} from '../index.js';
export type {Approval} from '../index.js';
/** JSON with every object's keys sorted: the same data always spells the same text. */
export function stableJson(value: unknown): string;
/** Refuse a render of anything but the approved film, naming what changed and when it was approved. */
export function requireApproval(approval: import('../index.js').Approval, inputs: {storyboard: import('../index.js').Storyboard; recipe: import('../index.js').Recipe; pacing?: import('../index.js').Pacing | null; narrationDir?: string | null}): void;
