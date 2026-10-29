import type {Film, Storyboard, Recipe, Kit} from './index.js';

/** The preview studio: a local, read-only page for directing a film (127.0.0.1 only). */
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
}): Promise<{url: string; port: number; reload(): Promise<string | null>; close(): Promise<void>}>;
