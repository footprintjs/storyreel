/** footprint-storyreel/storyboard/story: a conversation in, a checked storyboard out, by a chart whose record says why. */
import type {Storyboard as StoryBoard, StoryMessage, StoryShapeName, StoryboardProblem} from 'footprint-story/storyboard';

/** What every stage that asks sends: instructions (code's words) and material (data lines) kept apart. */
export interface StoryBrief {
  readonly stage: 'pick' | 'choose-shape' | 'write' | 'fix';
  readonly instructions: string;
  readonly material: string;
  readonly expects: 'points' | 'shape' | 'board' | 'piece';
  /** The message ids its material holds. */
  readonly ids: readonly string[];
}
/** Answers briefs with JSON text. `at` is the asking stage's name and nothing more: a driver never holds the chart's scope. */
export interface StoryDriver {
  readonly kind?: string;
  answer(brief: StoryBrief, at: {readonly stage: string}): string | Promise<string>;
}
/** A driver from the app's own model call. */
export function inProcess(fn: (brief: StoryBrief) => string | Promise<string>): StoryDriver;

export interface StoryOptions {
  readonly conversation: {readonly file: string} | {readonly messages: readonly StoryMessage[]};
  readonly model: StoryDriver;
  /** Ask for a shape; left out, code chooses from what the points fill. */
  readonly shape?: StoryShapeName;
  /** The shapes the drawer draws: a film's by default. */
  readonly drawable?: readonly StoryShapeName[];
  /** One window, in bytes: 96 KB by default, 1024 at the least. */
  readonly window?: number;
  /** Fix rounds: 3 by default, 0 to 10. */
  readonly mostFix?: number;
  /** The project a conversation file is read in. */
  readonly cwd?: string;
}
export type StoryStanding = 'known' | 'not-sure' | 'ask';
export interface StorySceneStanding {
  readonly standing: StoryStanding;
  /** Why, as a code: cited, unsure, plan, frame, fixed, disagree, cites-nothing, no-point. */
  readonly why: string;
  /** The message ids it cites (the record names them by ordinal; ids come back here from working memory). */
  readonly sources: readonly string[];
  /** The index of the point it tells in the record's points, or null. */
  readonly point: number | null;
}
export interface StoryAsk { readonly scene?: string; readonly point?: number; readonly window?: number; readonly why: string }
export interface StoryResult {
  /** The read storyboard, or null when the run stopped. */
  readonly board: StoryBoard | null;
  readonly shape: StoryShapeName | null;
  readonly standing: Readonly<Record<string, StorySceneStanding>>;
  /** What only the owner can answer; the run does not stop for it. */
  readonly ask: readonly StoryAsk[];
  /** Where and why the run stopped, or null. */
  readonly stopped: {readonly at: 'choose-shape' | 'write' | 'judge'; readonly why: string} | null;
  /** What was left when the run stopped at the judge. */
  readonly problems: readonly StoryboardProblem[];
  /**
   * The run's record: its narrative and snapshot, with counts, bytes, a hash, window offsets and message ordinals, never
   * words or message ids. `snapshot` is null (and `incomplete` says why) only when it could not be copied.
   */
  readonly record: {readonly narrative: readonly object[]; readonly snapshot: object | null; readonly incomplete?: string};
}
/**
 * Run the chart. A model that throws, or a stage that fails, rejects the run in fixed words, its own error as `cause`.
 * Merge finds duplicates and disagreements within a window only: a disagreement across windows is not found yet.
 */
export function storyFromConversation(options: StoryOptions): Promise<StoryResult>;
/** The chart, drawn as Mermaid text from the real chart. */
export function storyMermaid(): string;
