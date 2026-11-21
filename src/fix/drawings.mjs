// drawings — two checks the words alone cannot make: words laid over a drawing, and a drawing run off its sheet.
//
// WHY: the review reads words (review.mjs · wordsAt), and sees a drawing only as the picture changing. The kits that
// draw ink — the whiteboard's shapes, the paper's marks and card — say where it is as regions marked `drawing`
// (regions.mjs; film.regionsAt), the same boxes the preview studio's hit test reads. So a drawing is found, named by its
// recipe entry and moved in that entry's own units without a second map of the picture.
import {shareIn, within} from './places.mjs';
import {clearOf, intoBounds, moveFix, shrinkFix} from './moves.mjs';

/**
 * The thresholds, as data: a word is laid over a drawing when `over` (30 %) or more of its box lies on the drawing's box
 * (a box is a drawing's extent, not its ink, so a word grazing a corner is not over it); a drawing runs off when `off`
 * (25 %) or more of its box lies outside its sheet — a quarter cut away already reads as a mistake, not a framing.
 */
export const DRAWINGS = Object.freeze({over: .3, off: .25});

const label = r => (r.label ? `"${r.label}"` : 'the drawing');
const middle = ([x0, y0, x1, y1]) => [(x0 + x1) / 2, (y0 + y1) / 2];

/**
 * Words laid over a drawing, sample by sample: [{kind: 'words-over-drawing', t, what, where, fix}]. A word that is the
 * drawing's own (its entry is the drawing's, or inside it: the card's rows) is not over it, and neither is a word wholly
 * inside a drawing that holds words (a box, a ring, a bubble, the card: Region.holds). A word named only by its world
 * (a kit that draws words without a region of their own) can be over any drawing in that world.
 */
export function wordsOverDrawings({samples, places}) {
  return samples.flatMap(({t, words}) => {
    const drawings = places.regions(t).filter(r => r.drawing);
    if (!drawings.length) return [];
    return words.flatMap(w => {
      const box = places.frameBox(t, w.box), own = places.wordEntry(t, w);
      const under = drawings.find(d => !within(own.path, d.path) && shareIn(box, d.box) >= DRAWINGS.over && !(d.holds && shareIn(box, d.box) > .99));
      if (!under) return [];
      // The move is found on the frame and kept on the word's own sheet (its world, or the frame), then said in its units.
      const room = own.region ? places.sheetOf(t, own.region) : places.sheetOf(t, under), d = clearOf(box, under.box, room);
      const clear = `${label(under)} (${under.path})`;
      const fix = d ? moveFix(places.delta(t, middle(box), d), {entry: places.entry(own.path), clear}) : `no single move takes it clear of ${clear} on its sheet: move the drawing, or show the words at another moment`;
      return [{kind: 'words-over-drawing', t, what: `"${w.text}" over ${label(under)} (${under.path})`, where: own.path, fix}];
    });
  });
}

/**
 * Drawings run off their sheet, sample by sample: [{kind: 'drawing-off-frame', t, what, where, fix}]. A drawing inside a
 * world is held to the world's sheet (the world's region, Region.sheet), so a camera that frames the world closer never
 * makes one; a drawing on the page is held to the frame, at moments the camera is at rest (`zoomed` false).
 */
export function drawingsOffFrame({samples, places}) {
  return samples.flatMap(({t, zoomed}) => places.regions(t).filter(r => r.drawing).flatMap(r => {
    const sheet = places.sheetOf(t, r), onPage = sheet[0] === 0 && sheet[1] === 0 && sheet[2] === 1600 && sheet[3] === 900;
    if (onPage && zoomed) return [];
    const outside = 1 - shareIn(r.box, sheet);
    if (outside < DRAWINGS.off) return [];
    const need = intoBounds(r.box, sheet), corner = places.toRecipe(t, [r.box[0], r.box[1]]), entry = places.entry(r.path), far = places.toRecipe(t, [r.box[2], r.box[3]]);
    // (a drawing's `size` is its stroke, not its scale: the size it shrinks to is said as its box)
    const fix = need?.shrink ? shrinkFix(need.shrink, [far[0] - corner[0], far[1] - corner[1]])
      : moveFix(places.delta(t, [r.box[0], r.box[1]], need?.move ?? [0, 0]), {entry, corner});
    return [{kind: 'drawing-off-frame', t, what: `${label(r)} runs off ${onPage ? 'the frame' : 'its sheet'}`, where: r.path, fix: `${fix} (${Math.round(outside * 100)} % of it is outside now)`}];
  }));
}
