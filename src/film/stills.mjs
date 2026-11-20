/**
 * Stage 28 of the compile: the pictures the film takes of itself — the poster (the recipe's chosen frame, which
 * renderFilm bakes in as frame 0) and the recall images (the film's own frames, reused in the recap so the viewer sees
 * what they saw). Its own stage because it is the first to draw the film, so it runs last among the builders: every
 * world was made ready, and every camera placed, before a recall is drawn.
 *
 * Reads: recipe, clock, frame, recalls.
 * Writes: posterAt, recalls (filled).
 */
import {createCanvas} from '@napi-rs/canvas';

export function stillsStage(state) {
  const {recipe, clock, frame, recalls} = state;
  // A poster: the recipe's chosen frame (a phrase), for the thumbnail (renderFilm bakes it in as frame 0).
  const posterAt = recipe.poster === undefined ? null : clock.at(recipe.poster);

  // Recall images: the film's own frames, reused in the recap so the viewer sees what they saw. Every
  // world was made ready before the pushes were placed (its images decoded), so a recall keeps the loaded picture.
  for (const [name, ref] of Object.entries(recipe.recalls ?? {})) {
    const c = createCanvas(1600, 900); frame(c.getContext('2d'), clock.at(ref)); recalls[name] = c;
  }
  state.posterAt = posterAt;
}
