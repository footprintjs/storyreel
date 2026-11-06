/** footprint-storyreel/storyboard: a storyboard read by footprint-story/storyboard, as a film's own inputs. */
import type {Storyboard as StoryBoard} from 'footprint-story/storyboard';
import type {Recipe, Storyboard} from '../index.js';

/** A film's storyboard and recipe, as plain data. Throws, its `problems` listing everything a film cannot show. */
export function filmFromBoard(board: StoryBoard): {readonly storyboard: Storyboard; readonly recipe: Recipe};
