export {makeFilm} from '../index.js';
/** The voice check a voice folder carries (word-check.json): low-scored words, words the listen-back did not hear, and whether it is stale. */
export function readVoiceCheck(narrationDir: string): {lowWords: {scene: string; word: string; score: number}[]; notHeard: {scene: string; word: string}[]; checked: boolean; stale?: string} | null;
