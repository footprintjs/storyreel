/**
 * The paper and ink a paper transition (transitions/paper/) and a thought cloud (thought/) draw with: the film's theme's
 * palette (theme.mjs), or the built-in paper theme's when the caller passes none. One owner, so every paper transition
 * tears, folds and inks the same paper, and a thought cloud is cut from it too.
 */
import {loadTheme} from './theme.mjs';

let paperTheme = null;
/**
 * `paper` a sheet's face, `back` its back (a torn lip, a page's flap), `fold` the shade in a crease, `ground` what the
 * paper lies on, `ink` the ink; `accent` and `second` the theme's own colours for a setting left at null.
 */
export function paperTokens(theme) {
  const p = theme?.palette ?? (paperTheme ??= loadTheme('paper')).palette;
  return {paper: p.card ?? p.panel, back: p.panel ?? p.card, fold: p.well ?? p.edge, ground: p.bg, ink: p.ink, accent: p.accent, second: p.available};
}

