import type {Film, Storyboard, Recipe, Kit} from './index.js';

/**
 * The preview studio: a local page for directing a film (127.0.0.1 only; GET, and HEAD only for the page's own files and
 * the voice). The routes that draw, check or compile what a query names (a frame, a card, a pick, a Try) answer the
 * studio's own page only (Sec-Fetch-Site same-origin or none, or a browser that does not say); one Try compiles at a
 * time (409 while one does), and the last few compiled are kept. Its one write is a note left on the film (POST
 * /api/note, from its own page only: Sec-Fetch-Site same-origin, its own Origin, JSON of at most 16 KB holding
 * {version, t, x?, y?, words}), written as a signed line of feedback.md beside `source.file`, its place read from the film.
 * A note and a Try each leave their run for `storyreel log` in load()'s `out`.
 * It answers only at its own address (`url`: a random key in the path), so another user of the machine reaching the
 * port can neither read the film nor post a note.
 */
export function startStudio(options: {
  /**
   * kits: the kits the film was compiled with, so the transitions sheet and the gallery show their transitions too.
   * compile: the film compiled as this one was but from another recipe — what the gallery's Try plays (a copy of the
   * recipe with a pick in it, compiled in memory; nothing of the film is written). Without it, Try refuses.
   * out: the project's out folder, where a note's and a Try's runs are kept for `storyreel log` (none: not kept).
   */
  load(): Promise<{film: Film; storyboard: Storyboard; recipe: Recipe; title?: string; source?: {file: string; prefix?: string}; audio?: string | null; kits?: Kit[]; compile?: (recipe: Recipe) => Promise<Film>; out?: string}>;
  watch?: string[];
  port?: number;
  log?: (line: string) => void;
  /** Where the person's note key lives, outside the project (default: STORYREEL_HOME, else ~/.storyreel): notes are signed with it. */
  home?: string;
}): Promise<{
  /** The studio's own address, its random key in the path (http://127.0.0.1:<port>/<key>/): every route is under it; anything else is 403. */
  url: string;
  port: number;
  /** Load the film again (what a change to a watched file does): the refusal's words, or null. */
  reload(): Promise<string | null>;
  /** What the studio keeps in memory, each bounded: the gallery's cards drawn (and their bytes), the picks tried kept compiled. */
  held(): {cards: number; cardBytes: number; tries: number};
  close(): Promise<void>;
}>;
