/** footprint-storyreel/storyboard: a storyboard read by footprint-story/storyboard, as a film's own inputs. */
import type {Storyboard as StoryBoard} from 'footprint-story/storyboard';

/** A film's storyboard and recipe, as plain data. Throws, its `problems` listing everything a film cannot show. */
export function filmFromBoard(board: StoryBoard): {
  readonly storyboard: {readonly title: string; readonly scenes: readonly {readonly id: string; readonly title: string; readonly narration: string}[]};
  readonly recipe: Record<string, unknown>;
};
