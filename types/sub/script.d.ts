export {said, momentsOf, linesOf, sceneScript, momentOf} from '../index.js';
export type {Moment, SpeakerLine, SceneScript} from '../index.js';
/** What a beat that names a moment must leave out (a moment is one time: no nth, no edge), as the fix says it; null when it names it as written. */
export function momentFix(ref: {nth?: number; edge?: 'start' | 'end'}): string | null;
/** A moment's name as a refusal shows it: in its braces, cut to 40 characters. */
export function shownMark(name: string): string;
