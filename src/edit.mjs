/**
 * An edit: parts of one film joined into one video, in order, with an end card after them — what a Short cut from an
 * episode is. Pure: the edit is data, and every answer here is a function of a frame of the output.
 *
 *   cuts   [{from, to, follow?, join?}] — each a stretch of the film clock. from/to are seconds, a beat ([scene, phrase],
 *          {scene, phrase, …}) or a scene ({scene: id}: its start for from, its end for to). `follow` is where that
 *          stretch's crop looks (layout.mjs · crop: keys {at, x, y?, width?, cut?}, or 'focus'), in place of the layout's.
 *   join   the three settings an editor gives a join, the same for every join unless a cut (or the end card) gives
 *          its own: `cut`, where the cut point lands — 'silence' (the default: a cut point inside a spoken word moves
 *          to the silence beside it, so no word is clipped) or 'exact'; `overlap`, frames the two sides cross-fade,
 *          picture and sound (0, the default: a hard cut); `pop`, frames of the theme's paper over the picture just
 *          after a hard cut, hiding the seam (0, the default: none; 1–3).
 *   end    {lines: [text, …], seconds, join?} — a card after the last cut, drawn in the film's theme (endcard.mjs).
 *
 * The frames: cut i shows film frames start_i + f / fps (start_i on the film's frame grid) for its `frames`; it begins
 * in the output at `at` = the previous one's end minus the overlap of the join between them. In an overlap the frame
 * belongs to the LATER side: its caption, never the earlier side's (captionOwner) — a caption never outlives its cut.
 */

export {drawEndCard} from './endcard.mjs';

/** A join's three settings, their defaults and ranges. */
export const JOIN_DEFAULTS = Object.freeze({cut: 'silence', overlap: 0, pop: 0});
const JOIN_KEYS = Object.keys(JOIN_DEFAULTS), CUT_KEYS = ['from', 'to', 'follow', 'join'], END_KEYS = ['lines', 'seconds', 'join'], EDIT_KEYS = ['cuts', 'end', 'join'];
const MAX_CUTS = 20, MAX_OVERLAP = 30, MAX_POP = 3;
/** How far before a word a cut moved into the silence starts (and after a word one ends), at most: half the gap, when the gap is shorter. */
export const SILENCE_PAD = .12;

/** A join as given ({cut?, overlap?, pop?}) over its defaults, checked. `where` names it in a refusal. */
export function readJoin(given, base = JOIN_DEFAULTS, where = 'join') {
  if (given === undefined) return base;
  if (!given || typeof given !== 'object' || Array.isArray(given)) throw new Error(`${where} is {cut?, overlap?, pop?}: the cut point ('silence' or 'exact'), the frames the two sides cross-fade, the frames of paper that hide a hard cut`);
  for (const key of Object.keys(given)) if (!JOIN_KEYS.includes(key)) throw new Error(`${where} has unsupported key ${key} (a join is {${JOIN_KEYS.join(', ')}})`);
  const own = Object.fromEntries(Object.entries(given).filter(([, v]) => v !== undefined));
  // An overlap given here drops a pop it would inherit (and a pop an overlap): the two are ways of making one join.
  const j = {...base, ...(own.overlap && own.pop === undefined ? {pop: 0} : {}), ...(own.pop && own.overlap === undefined ? {overlap: 0} : {}), ...own};
  if (j.cut !== 'silence' && j.cut !== 'exact') throw new Error(`${where}.cut is 'silence' (a cut point inside a spoken word moves to the silence beside it) or 'exact', not ${JSON.stringify(j.cut)}`);
  if (!(Number.isInteger(j.overlap) && j.overlap >= 0 && j.overlap <= MAX_OVERLAP)) throw new Error(`${where}.overlap is the frames the two sides cross-fade, a whole number 0–${MAX_OVERLAP} (0: a hard cut), not ${JSON.stringify(j.overlap)}`);
  if (!(Number.isInteger(j.pop) && j.pop >= 0 && j.pop <= MAX_POP)) throw new Error(`${where}.pop is the frames of paper that hide a hard cut, a whole number 0–${MAX_POP} (0: none), not ${JSON.stringify(j.pop)}`);
  if (j.pop && j.overlap) throw new Error(`${where}: a pop hides a hard cut, and an overlap has no hard cut to hide: give overlap or pop, not both`);
  return Object.freeze(j);
}

/** The edit as given, its shape checked (no film needed): {cuts, end, join}. Refuses naming what is wrong. */
export function checkEdit(edit) {
  if (!edit || typeof edit !== 'object' || Array.isArray(edit)) throw new Error('edit is {cuts: [{from, to, follow?, join?}], end?: {lines, seconds, join?}, join?}');
  for (const key of Object.keys(edit)) if (!EDIT_KEYS.includes(key)) throw new Error(`edit has unsupported key ${key} (an edit is {${EDIT_KEYS.join(', ')}})`);
  const join = readJoin(edit.join, JOIN_DEFAULTS, 'join');
  if (!Array.isArray(edit.cuts) || !edit.cuts.length || edit.cuts.length > MAX_CUTS) throw new Error(`cuts lists the stretches of the film joined in order, 1–${MAX_CUTS} of them: [{from, to, follow?, join?}]`);
  const cuts = edit.cuts.map((c, i) => {
    if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error(`cuts[${i}] is {from, to, follow?, join?}`);
    for (const key of Object.keys(c)) if (!CUT_KEYS.includes(key)) throw new Error(`cuts[${i}] has unsupported key ${key} (a cut is {${CUT_KEYS.join(', ')}})`);
    for (const edge of ['from', 'to']) if (c[edge] === undefined || c[edge] === null) throw new Error(`cuts[${i}].${edge} is where the cut ${edge === 'from' ? 'starts' : 'ends'}: seconds on the film clock, a beat [scene, phrase], or {scene}`);
    if (i === 0 && c.join !== undefined) throw new Error('cuts[0].join: the first cut has no join before it (a cut\'s join is the one into it); give the edges\' cut point as the target\'s join');
    return {from: c.from, to: c.to, ...(c.follow !== undefined ? {follow: c.follow} : {}), join: i === 0 ? join : readJoin(c.join, join, `cuts[${i}].join`)};
  });
  let end = null;
  if (edit.end !== undefined) {
    const e = edit.end;
    if (!e || typeof e !== 'object' || Array.isArray(e)) throw new Error('end is {lines: [text, …], seconds, join?}: a card after the last cut');
    for (const key of Object.keys(e)) if (!END_KEYS.includes(key)) throw new Error(`end has unsupported key ${key} (an end card is {${END_KEYS.join(', ')}})`);
    if (!Array.isArray(e.lines) || !e.lines.length || e.lines.length > 4 || !e.lines.every(l => typeof l === 'string' && l.trim())) throw new Error('end.lines is 1–4 lines of text, the first the biggest ("Watch the whole story", then a name)');
    if (!(typeof e.seconds === 'number' && e.seconds >= .5 && e.seconds <= 10)) throw new Error(`end.seconds is how long the card holds, 0.5–10, not ${JSON.stringify(e.seconds)}`);
    end = {lines: [...e.lines], seconds: e.seconds, join: readJoin(e.join, join, 'end.join')};
  }
  return {cuts, end, join};
}

/**
 * A cut point moved off a spoken word into the silence beside it: `words` [{start, end}] on the film clock, in order;
 * side 'from' starts before the word that t falls in, 'to' ends after it — SILENCE_PAD into the silence, or half the
 * gap to the next word when that is shorter. A t already in a silence stays. Returns {t, word?: index of the word moved off}.
 */
export function snapToSilence(words, t, side) {
  const k = words.findIndex(w => t > w.start + 1e-6 && t < w.end - 1e-6);
  if (k < 0) return {t};
  const w = words[k];
  if (side === 'from') { const gap = w.start - (words[k - 1]?.end ?? -Infinity); return {t: Math.max(0, w.start - Math.min(SILENCE_PAD, gap / 2)), word: k}; }
  const gap = (words[k + 1]?.start ?? Infinity) - w.end;
  return {t: w.end + Math.min(SILENCE_PAD, gap / 2), word: k};
}

/**
 * The edit placed on a film: `time(v, edge)` reads a cut's from/to as seconds on the film clock (render.mjs gives
 * the film's reader); `words` are the spoken words [{start, end, text?}] on that clock; `total` the film's length.
 * Returns {fps, cuts: [{index, from, to, given, snapped?, start, frames, at, join, follow?}], end: {at, frames, lines,
 * join} | null, frames, seconds}. Refuses a cut that ends before it starts, lies outside the film, or is shorter than
 * the overlaps it takes part in.
 */
export function placeEdit(checked, {time, words, total, fps}) {
  const {cuts: given, end} = checked;
  const cuts = given.map((c, i) => {
    const from0 = time(c.from, 'from', `cuts[${i}].from`), to0 = time(c.to, 'to', `cuts[${i}].to`);
    if (!(from0 >= 0 && to0 <= total + 1e-6)) throw new Error(`cuts[${i}] is ${from0.toFixed(2)}–${to0.toFixed(2)} s, outside the film (0–${total.toFixed(2)} s)`);
    if (!(to0 > from0)) throw new Error(`cuts[${i}] ends (${to0.toFixed(2)} s) before it starts (${from0.toFixed(2)} s)`);
    // The cut point of the join before (the first cut: the edge's) and of the join after (the last: the end card's, or the edge's).
    const before = c.join.cut, after = (given[i + 1]?.join ?? end?.join ?? checked.join).cut;
    const a = before === 'silence' ? snapToSilence(words, from0, 'from') : {t: from0}, b = after === 'silence' ? snapToSilence(words, to0, 'to') : {t: to0};
    const from = a.t, to = Math.min(total, b.t), start = Math.floor(from * fps + 1e-6) / fps, frames = Math.ceil((to - start) * fps - 1e-6);
    const snapped = {...(a.word !== undefined ? {from: [+from0.toFixed(3), +from.toFixed(3)]} : {}), ...(b.word !== undefined ? {to: [+to0.toFixed(3), +to.toFixed(3)]} : {})};
    return {index: i, from, to, given: [+from0.toFixed(3), +to0.toFixed(3)], ...(Object.keys(snapped).length ? {snapped} : {}), start, frames, join: c.join, ...(c.follow !== undefined ? {follow: c.follow} : {})};
  });
  let at = 0;
  cuts.forEach((c, i) => {
    const overlap = i ? c.join.overlap : 0, prev = cuts[i - 1];
    if (overlap && (overlap > c.frames / 2 || overlap > prev.frames / 2)) throw new Error(`cuts[${i}].join.overlap: ${overlap} frames is more than half of ${overlap > c.frames / 2 ? `cuts[${i}]` : `cuts[${i - 1}]`} (${Math.min(c.frames, prev.frames)} frames): give a shorter overlap or a longer cut`);
    if (c.frames < 2) throw new Error(`cuts[${i}] is ${c.frames} frame${c.frames === 1 ? '' : 's'} long: a cut shows at least 2`);
    c.at = i ? prev.at + prev.frames - overlap : 0;
    at = c.at + c.frames;
  });
  let card = null;
  if (end) {
    const frames = Math.round(end.seconds * fps), overlap = end.join.overlap, last = cuts.at(-1);
    if (overlap > last.frames / 2 || overlap > frames / 2) throw new Error(`end.join.overlap: ${overlap} frames is more than half of ${overlap > frames / 2 ? 'the end card' : 'the last cut'}: give a shorter overlap`);
    card = {at: at - overlap, frames, lines: end.lines, join: end.join};
    at = card.at + frames;
  }
  return {fps, cuts, end: card, frames: at, seconds: at / fps};
}

/**
 * What output frame f shows: {kind: 'cut', cut, t, pop?} — cut index and film second — or {kind: 'blend', under:
 * {cut, t}, over: {cut, t} | {end: true, u}, a} in an overlap (a: how much of the later side shows, 0–1, never 0 or 1),
 * or {kind: 'end', u} (u: seconds into the card). `pop` is true on a hard cut's first `pop` frames.
 */
export function editFrame(edit, f) {
  const {cuts, end, fps} = edit;
  if (end && f >= end.at) {
    const u = (f - end.at) / fps, last = cuts.at(-1), k = f - last.at;
    if (k < last.frames) return {kind: 'blend', under: {cut: last.index, t: last.start + k / fps}, over: {end: true, u}, a: (f - end.at + 1) / (end.join.overlap + 1)};
    return {kind: 'end', u, ...(f - end.at < end.join.pop ? {pop: true} : {})};
  }
  let i = cuts.length - 1; while (i > 0 && f < cuts[i].at) i--;
  const c = cuts[i], t = c.start + (f - c.at) / fps;
  if (i > 0 && f - c.at < c.join.overlap) {
    const p = cuts[i - 1];
    return {kind: 'blend', under: {cut: p.index, t: p.start + (f - p.at) / fps}, over: {cut: i, t}, a: (f - c.at + 1) / (c.join.overlap + 1)};
  }
  return {kind: 'cut', cut: i, t, ...(i > 0 && f - c.at < c.join.pop ? {pop: true} : {})};
}

/**
 * The caption a frame of a cut may show: the one at film second t (captionAt), only when its chunk has a word that
 * starts inside the cut — a chunk said before the cut began (a caption lingers 0.6 s past its last word) belongs to
 * the stretch before, never to this one. `captionAt(t)` → {words, active} | null.
 */
export function captionInCut(cut, fps, t, captionAt) {
  const c = captionAt(t);
  if (!c) return null;
  const inside = inCut(cut, fps), keep = c.words.map((w, i) => [w, i]).filter(([w]) => inside(w));
  if (!keep.length) return null;
  if (keep.length === c.words.length) return c;
  // Only the words said inside the cut: a word said before it began was never heard here.
  return {words: keep.map(([w]) => w), active: keep.findIndex(([, i]) => i === c.active)};
}
/** Whether a word starts inside a cut's stretch of the film clock. */
const inCut = (cut, fps) => w => w.start >= cut.start - 1e-6 && w.start < cut.start + cut.frames / fps - 1e-6;

/** The output frame where each join lands (where the later side's first frame is): [{index, frame}] — cut joins, then the end card's. */
export const joinFrames = edit => [...edit.cuts.slice(1).map(c => ({index: c.index, frame: c.at})), ...(edit.end ? [{index: 'end', frame: edit.end.at}] : [])];

/**
 * The film's caption chunks [{start, end, text, words}] on the edit's clock: each chunk with a word starting inside a
 * cut, with only those words (one said before the cut began was never heard there), its times moved to where that cut
 * plays and held inside it (a chunk in two cuts is in both). For caption files.
 */
export function chunksThrough(edit, chunks) {
  return edit.cuts.flatMap(c => {
    const shift = c.at / edit.fps - c.start, end = (c.at + c.frames) / edit.fps, first = c.at / edit.fps;
    const inside = inCut(c, edit.fps);
    return chunks.map(k => [k, k.words.filter(inside)]).filter(([, words]) => words.length)
      .map(([k, words]) => ({...k, start: Math.max(first, words[0].start + shift), end: Math.min(end, k.end + shift), text: words.map(w => w.text).join(' '), words: words.map(w => ({...w, start: w.start + shift, end: w.end + shift}))}));
  });
}

/** The film's chapters [[seconds, name]] on the edit's clock: each cut opens with the chapter it is in, then the ones that start inside it (one name once in a row). */
export function chaptersThrough(edit, chapters) {
  const out = [];
  for (const c of edit.cuts) {
    const end = c.start + c.frames / edit.fps, shift = c.at / edit.fps - c.start;
    const open = chapters.filter(([t]) => t <= c.start + 1e-6).at(-1), inside = chapters.filter(([t]) => t > c.start + 1e-6 && t < end - 1e-6);
    for (const [t, name] of [...(open ? [[c.start, open[1]]] : []), ...inside]) if (out.at(-1)?.[1] !== name) out.push([+(t + shift).toFixed(3), name]);
  }
  return out;
}

/** The edit as its record keeps it: each cut as given and as used, the joins, the end card. */
export const editRecord = edit => ({
  cuts: edit.cuts.map(c => ({from: +c.from.toFixed(3), to: +c.to.toFixed(3), given: c.given, ...(c.snapped ? {snapped: c.snapped} : {}), at: +(c.at / edit.fps).toFixed(3), frames: c.frames,
    ...(c.index ? {join: {...c.join}} : {})})),
  ...(edit.end ? {end: {at: +(edit.end.at / edit.fps).toFixed(3), seconds: edit.end.frames / edit.fps, lines: edit.end.lines, join: {...edit.end.join}}} : {}),
  seconds: +edit.seconds.toFixed(3),
});
