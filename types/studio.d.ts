import type {Film, Storyboard, Recipe, Kit} from './index.js';

/**
 * The preview studio: a local, read-only page for directing a film (127.0.0.1 only; GET, and HEAD only for the page's own
 * files and the voice). The routes that draw, check or compile what a query names (a frame, a card, a pick, a Try) answer
 * the studio's own page only (Sec-Fetch-Site same-origin or none, or a browser that does not say); one Try compiles at a
 * time (409 while one does), and the last few compiled are kept.
 */
export function startStudio(options: {
  /**
   * kits: the kits the film was compiled with, so the transitions sheet and the gallery show their transitions too.
   * compile: the film compiled as this one was but from another recipe — what the gallery's Try plays (a copy of the
   * recipe with a pick in it, compiled in memory; nothing is written). Without it, Try refuses.
   */
  load(): Promise<{film: Film; storyboard: Storyboard; recipe: Recipe; title?: string; source?: {file: string; prefix?: string}; audio?: string | null; kits?: Kit[]; compile?: (recipe: Recipe) => Promise<Film>}>;
  watch?: string[];
  port?: number;
  log?: (line: string) => void;
}): Promise<{
  url: string;
  port: number;
  /** Load the film again (what a change to a watched file does): the refusal's words, or null. */
  reload(): Promise<string | null>;
  /** What the studio keeps in memory, each bounded: the gallery's cards drawn (and their bytes), the picks tried kept compiled. */
  held(): {cards: number; cardBytes: number; tries: number};
  close(): Promise<void>;
}>;
