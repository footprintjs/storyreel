// places — where a finding is in the recipe the author wrote, and how far a thing must move there, in the entry's own
// units.
//
// WHY: a finding that says only a time and a scene makes whoever edits the film (a person, a model) look at the picture
// to learn what to change. The film already says what is drawn where — film.regionsAt(t): boxes on the 1600×900 frame,
// each naming the recipe entry that drew it (regions.mjs) — and where a point of the frame is in the recipe's own
// coordinates (film.pointAt: a world's sheet, or the page). A finding asks those two, so it names the entry and says the
// change in the units the entry is written in. No second map of the picture is kept here.
import {hitTest} from '../regions.mjs';
import {cutText} from './text.mjs';

const isBox = b => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite);
const areaOf = ([x0, y0, x1, y1]) => Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
/** Two boxes' common part, [x0, y0, x1, y1] (empty: zero area). */
export const meetOf = (a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
/** How much of box `a` lies inside box `b`, as a share of a's area (0 for a box with no area). */
export const shareIn = (a, b) => { const own = areaOf(a); return own > 0 ? areaOf(meetOf(a, b)) / own : 0; };
/** Whether one recipe path is the other, or inside it ("story.items[2]" is inside "story"). */
export const within = (path, outer) => path === outer || path.startsWith(`${outer}.`) || path.startsWith(`${outer}[`);

/**
 * The value at a recipe path ("stages[2].world.items[0]") in a recipe, or undefined. Only own keys of plain objects and
 * arrays are followed: a path is read from data, never used to reach anything else.
 */
export function entryAt(recipe, path) {
  let at = recipe;
  for (const m of String(path).matchAll(/([^.[\]]+)|\[(\d+)\]/g)) {
    const key = m[1] ?? Number(m[2]);
    if (at === null || typeof at !== 'object' || !Object.hasOwn(at, key)) return undefined;
    at = at[key];
  }
  return at;
}

/**
 * Where things are in one film, read through its own regions: `film` a compiled film, `layout` the review's compiled
 * layout (null: words are read on the frame itself). Returns:
 *   regions(t)          the film's regions at t (kept per millisecond: every check asks the same moments)
 *   frameBox(t, box)    a box in output pixels (a word's) on the 1600×900 frame
 *   sceneEntry(t)       the recipe entry drawing the picture at t: the largest region there (its world, its page), or
 *                       the storyboard's scene when nothing says
 *   wordEntry(t, word)  the recipe entry that drew a word: of the regions its box meets, one whose label is the word
 *                       exactly, then one whose label holds it, then any that is not a drawing — each time the one its
 *                       box overlaps most, then the smallest — then any; else sceneEntry. {path, region}
 *   sheetOf(t, region)  the box its recipe coordinates live on: its world's (the region marked sheet its path is
 *                       inside, or itself when it is one), or the frame
 *   toRecipe(t, point)  a point of the frame in the recipe's own units (a world's sheet, or the page)
 *   delta(t, from, d)   a move of d frame pixels from a frame point, in the recipe's units: [dx, dy]
 *   outDelta(t, p, d)   the same for a move of d output pixels from an output point (a word's)
 *   entry(path)         the recipe's value at a path (entryAt)
 *   said(from, to)      the words spoken in [from, to], in order: [{text, start, end, scene}]
 *   sceneSaid(id)       every word spoken in scene `id`, in order, the same way
 *   placesOf(id, p)     every place phrase p is said in scene `id` (the clock's own matching: clock.places), or null
 *                       when the film cannot say
 *   trouble()           why the film's regions could not be read (regionsAt threw), or null: said in the review's notes,
 *                       never a silent "no regions"
 */
export function placesOf(film, layout = null) {
  const kept = new Map();
  let trouble = null;
  const regions = t => {
    const key = +t.toFixed(3);
    if (!kept.has(key)) {
      let found = [];
      // A film whose regions throw is read as one with none — and the first error is kept, for the review to say.
      try { found = typeof film.regionsAt === 'function' ? film.regionsAt(t) : []; } catch (e) { found = []; trouble ??= `film.regionsAt(${key}) threw: ${cutText(e?.message ?? e, 120)}`; }
      kept.set(key, (Array.isArray(found) ? found : []).filter(r => r && isBox(r.box) && typeof r.path === 'string' && r.path));
    }
    return kept.get(key);
  };
  const frame = (t, p) => (layout?.frameAt ? layout.frameAt(t, p) : p);
  const frameBox = (t, [x0, y0, x1, y1]) => { const a = frame(t, [x0, y0]), b = frame(t, [x1, y1]); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; };
  const scenes = film.timings?.scenes ?? [], offsets = film.clock?.offsets ?? [];
  const sceneIndex = t => { let i = 0; offsets.forEach((o, k) => { if (o <= t + 1e-6) i = k; }); return i; };
  const sceneEntry = t => {
    const all = regions(t);
    if (all.length) return all.reduce((big, r) => (areaOf(r.box) > areaOf(big.box) ? r : big)).path;
    return `storyboard.scenes[${sceneIndex(t)}]`;
  };
  const wordEntry = (t, word) => {
    const box = frameBox(t, word.box), [x0, y0, x1, y1] = box, text = String(word.text).trim();
    // The regions the word's box meets, most overlap first, then the smallest (hitTest's order on a tie): of two items
    // labelled "sheep" the one under the word; a word half off the frame still meets the region it runs out of.
    const order = new Map(hitTest(regions(t), (x0 + x1) / 2, (y0 + y1) / 2).map((r, k) => [r, k]));
    const holding = regions(t).map(r => ({r, share: shareIn(box, r.box), area: areaOf(r.box), k: order.get(r) ?? Infinity})).filter(x => x.share > 0)
      .sort((a, b) => b.share - a.share || a.k - b.k || a.area - b.area).map(x => x.r);
    const words = holding.filter(r => !r.drawing), label = r => String(r.label).trim();
    const region = (text && (words.find(r => label(r) === text) ?? words.find(r => label(r).includes(text)))) || words[0] || holding[0] || null;
    return {path: region?.path ?? sceneEntry(t), region};
  };
  const sheetOf = (t, region) => {
    if (region.sheet) return region.box;
    const outer = regions(t).filter(r => r.sheet && r.path !== region.path && within(region.path, r.path)).sort((a, b) => b.path.length - a.path.length)[0];
    return outer?.box ?? [0, 0, 1600, 900];
  };
  const toRecipe = (t, [x, y]) => {
    let p = null;
    try { p = typeof film.pointAt === 'function' ? film.pointAt(t, x, y) : null; } catch { p = null; }
    const at = p?.world?.at ?? p?.frame;
    return Array.isArray(at) && at.every(Number.isFinite) ? at : [Math.round(x), Math.round(y)];
  };
  const delta = (t, [x, y], [dx, dy]) => { const a = toRecipe(t, [x, y]), b = toRecipe(t, [x + dx, y + dy]); return [b[0] - a[0], b[1] - a[1]]; };
  /** A move of d output pixels from an output point, in the recipe's units (through the frame). */
  const outDelta = (t, p, d) => { const a = frame(t, p), b = frame(t, [p[0] + d[0], p[1] + d[1]]); return delta(t, a, [b[0] - a[0], b[1] - a[1]]); };
  const all = scenes.flatMap((sc, i) => (sc.words ?? []).map(w => ({text: w.text, start: offsets[i] + w.start, end: offsets[i] + w.end, scene: sc.id}))).sort((a, b) => a.start - b.start);
  const said = (from, to) => all.filter(w => w.end > from && w.start < to);
  const sceneSaid = id => all.filter(w => w.scene === id);
  const phrasePlaces = (id, phrase) => { try { return typeof film.clock?.places === 'function' ? film.clock.places(id, phrase) : null; } catch { return null; } };
  return {regions, frameBox, sceneEntry, wordEntry, sheetOf, toRecipe, delta, outDelta, entry: path => entryAt(film.recipe, path), said, sceneSaid, placesOf: phrasePlaces, trouble: () => trouble};
}
