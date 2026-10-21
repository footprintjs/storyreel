export {makeFilm} from '../index.js';
/** The voice check a voice folder carries (word-check.json): low-scored words, words the listen-back did not hear, and whether it is stale. */
export function readVoiceCheck(narrationDir: string): {lowWords: {scene: string; word: string; score: number}[]; notHeard: {scene: string; word: string}[]; checked: boolean; stale?: string} | null;
/** The one way a render reads its text (makeFilm, previewChanges): the cast's names put into the storyboard, the recipe and the strings. */
export function castFilm(film: {storyboard: import('../index.js').Storyboard; recipe: import('../index.js').Recipe; strings?: Record<string, string> | null; cast?: Record<string, unknown> | null}): {storyboard: import('../index.js').Storyboard; recipe: import('../index.js').Recipe; strings: Record<string, string> | null};
/** The one way a render paces its film (makeFilm, previewChanges): a voice copied into `copy` and paced there, or a silent film's word times. */
export function pacedTimings(film: {storyboard: import('../index.js').Storyboard; narrationDir?: string | null; timings?: import('../index.js').Timings | null; pacing?: import('../index.js').Pacing | null; copy?: string | null}): Promise<import('../index.js').Timings>;
/** The one way a render compiles its film (makeFilm, previewChanges): makeFilm's inputs and defaults, the paced timings, recorded. */
export function compileForRender(film: Omit<import('../index.js').MakeFilmOptions, 'out'>, timings: import('../index.js').Timings): Promise<import('../index.js').Film>;
