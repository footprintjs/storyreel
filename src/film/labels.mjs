/**
 * Stage 17 of the compile: the labels the film puts in the corner of what is shown — an example scene says so
 * (claims.mjs · exampleScenes), and a scene that differs from the real thing says how (differs.mjs) — and where they
 * sit, for what looks at them without drawing (labelsAt). Its own stage because a label must be seen whatever the
 * crop: it is placed in the shown window, outside the camera, and its spans are found later, by the reading stage.
 *
 * Reads: paper, filmLang, teaser, pictureClock; at draw time labels and differsUp (set by the reading stage).
 * Writes: exampleLabel(ctx, t, window), differsLabel(ctx, t, window), labelsAt(ctx, t, window).
 */
import {chip, chipLines, chipWidth} from '../attention.mjs';
import {ownFigure, asLabel} from '../differs.mjs';

export function labelsStage(state) {
  const {paper, filmLang, teaser, pictureClock} = state;
  /**
   * An example scene says so on screen (claims.mjs · exampleScenes): a small label — the emphasis corner label's look
   * (attention.mjs · chip) — in the top right corner of what is shown (the frame, or a crop's window of it), over the
   * scene and on while any line it shows is still on screen (claims.mjs · labelSpans).
   */
  function exampleLabel(ctx, t, window) {
    const words = state.labels.find(l => t >= l.from && t < l.to)?.words;
    if (!words) return;
    const right = window ? Math.min(1600, window.x0 + window.w) : 1600, top = window ? Math.max(0, window.y0) : 0;
    chip(ctx, words, 1, paper, {right: right - 40, y: top + 26});
  }
  /**
   * A scene that differs from the real thing says so (differs.mjs): a label per statement, in the example label's look,
   * under it when that one is up, each kept inside what is shown (a crop's narrower window breaks a long one). It goes
   * with the scene's picture, on the picture's clock: a freeze that holds the picture holds its label. Each placed:
   * {text, statement, right, y, mark} (mark: what the review reads it by, differs.mjs · asLabel).
   */
  function placedLabels(ctx, t, window) {
    const at = pictureClock(t), up = state.differsUp.find(d => at >= d.from && at < d.to);
    if (!up?.shown.length) return [];
    const right = window ? Math.min(1600, window.x0 + window.w) : 1600, left = window ? Math.max(0, window.x0) : 0, top = window ? Math.max(0, window.y0) : 0;
    let y = top + 26 + (state.labels.some(l => t >= l.from && t < l.to) ? 48 : 0);
    return up.shown.flatMap((statement, line) => {
      const pieces = chipLines(ctx, statement, paper, right - left - 80);
      return pieces.map((text, piece) => {
        const placed = {text, statement, right: right - 40, y, mark: {scene: up.index, line, piece, pieces: pieces.length, ...(ownFigure(statement, up.time, filmLang) ? {own: true} : {})}};
        y += 48;
        return placed;
      });
    });
  }
  function differsLabel(ctx, t, window) {
    for (const {text, right, y, mark} of placedLabels(ctx, t, window)) asLabel(ctx, mark, () => chip(ctx, text, 1, paper, {right, y}));
  }
  /** Where the labels sit on the frame at t, for what looks at them without drawing (zones.mjs): [{name, box}]. */
  const labelsAt = (ctx, t, window) => (teaser && t >= teaser.at ? [] : placedLabels(ctx, t, window).map(l => ({name: l.statement, box: [l.right - chipWidth(ctx, l.text, paper), l.y, l.right, l.y + 40]})));
  Object.assign(state, {exampleLabel, differsLabel, labelsAt});
}
