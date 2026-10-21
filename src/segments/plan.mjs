/**
 * Where a film's picture is cut into cached pieces. First by rows (planSegments: one per shot, from the moment its
 * entrance starts, so a transition is never cut in two), then each row into pieces of at most `chunkSeconds`
 * (planPieces), so a re-voiced sentence or a moved note redraws the seconds around it, not the whole shot.
 *
 * A row is cut where a scene starts (when that leaves both sides at least `minSeconds`) and where a sentence starts
 * (a word after one that ends a sentence, or after a pause; at least half a piece after the cut before it), then
 * every `chunkSeconds` from there, the last piece taking a remainder shorter than `minSeconds`. Cuts are counted from
 * each scene's and each sentence's start, never from the film's: a sentence re-voiced longer moves the sentences after
 * it whole, and their pieces keep their keys (keys are on a piece's own clock: segments/material.mjs), so they are
 * reused. Every piece is whole frames, starts on its own key frame (each is its own encode), and together they draw
 * every frame once, in order.
 */

/**
 * The film's rows as segments: one per row of pictures (film.rows), on whole frames — segment i covers frames
 * [f0, f1), each frame exactly once, in order — so joined they draw exactly the frames one pass would. A row
 * whose picture starts before the row ahead of it (an entrance longer than the scene before) takes over from
 * that row, which never shows alone: its entries join the next segment. A row shorter than `minSeconds`
 * joins the segment before it (a segment per quick cut would cost more in joins than it saves).
 * @param blur  true when frames are drawn with motion blur: a frame just after a cut then also draws a
 *              moment before it, so a segment that starts at a cut draws the row before it too
 * @returns [{index, f0, f1, from, to, paths, before, scenes, entrances}] — before: the paths of the row an entrance
 *          (or a blurred cut) also draws, or null; entrances: each entrance inside it, [{f0, f1, type, before}] — its
 *          frames, its transition and the row it also draws while it plays
 */
export function planSegments(film, {fps = 30, frames = Math.ceil(film.total * fps), minSeconds = 1.5, blur = false} = {}) {
  if (!Array.isArray(film.rows) || !film.rows.length) throw new Error('planSegments: this film has no rows (compile it with StoryReel 0.4 or later)');
  let latest = 0;
  const raw = film.rows.map((r, j) => {
    // A row's first frame is the first one at or after its picture starts (an earlier one still shows the row before).
    latest = j === 0 ? 0 : Math.max(latest, Math.min(frames, Math.max(0, Math.ceil(r.from * fps - 1e-6))));
    const before = r.enter && (r.enter.type !== 'cut' || blur) ? [...film.rows[j - 1].paths] : null;
    // While the entrance plays it draws the row before (a blurred cut, for its first frame: its subframes reach back).
    const ends = r.enter ? Math.min(frames, Math.max(latest + 1, Math.ceil((r.from + (r.enter.seconds ?? 0)) * fps - 1e-6) + (blur ? 1 : 0))) : latest;
    return {f0: latest, paths: [...r.paths], before, rewinds: r.rewinds ?? null, entrances: r.enter ? [{f0: latest, f1: ends, type: r.enter.type, before}] : []};
  });
  raw.forEach((s, j) => { s.f1 = j + 1 < raw.length ? raw[j + 1].f0 : frames; });
  // A row that never shows alone (no frames of its own) is drawn by the next one: its entries join it.
  const shown = [];
  let carried = [], carriedIn = [];
  for (const s of raw) {
    if (s.f1 > s.f0) { s.paths.unshift(...carried); s.entrances.unshift(...carriedIn); carried = []; carriedIn = []; shown.push(s); }
    else { carried.push(...s.paths, ...(s.before ?? [])); carriedIn.push(...s.entrances); }
  }
  if (carried.length && shown.length) { shown.at(-1).paths.push(...carried); shown.at(-1).entrances.push(...carriedIn); }
  const out = [];
  for (const s of shown) {
    const last = out.at(-1);
    if (last && (s.f1 - s.f0) < minSeconds * fps) { last.f1 = s.f1; last.paths.push(...s.paths); last.entrances.push(...s.entrances); last.rewinds ??= s.rewinds; continue; }
    if (last && (last.f1 - last.f0) < minSeconds * fps) { last.f1 = s.f1; last.paths.push(...s.paths); last.entrances.push(...s.entrances); last.before ??= s.before; last.rewinds ??= s.rewinds; continue; }
    out.push({...s, entrances: [...s.entrances]});
  }
  if (out[0]?.f0 !== 0 || out.at(-1)?.f1 !== frames || out.some((s, i) => s.f1 <= s.f0 || (i && s.f0 !== out[i - 1].f1))) throw new Error(`planSegments: the segments do not cover frames 0–${frames} once each, in order (${out.map(s => `${s.f0}–${s.f1}`).join(', ')}); this is a bug in planning, please report it`);
  const offsets = film.clock.offsets, ids = film.timings.scenes.map(s => s.id), durations = film.timings.scenes.map(s => s.duration);
  return out.map((s, index) => {
    const from = s.f0 / fps, to = s.f1 / fps;
    const scenes = ids.filter((_, i) => offsets[i] < to && offsets[i] + durations[i] > from);
    const entrances = s.entrances.map(e => Object.freeze({f0: e.f0, f1: e.f1, type: e.type, before: e.before && Object.freeze([...new Set(e.before)])}));
    return Object.freeze({index, f0: s.f0, f1: s.f1, from, to, paths: Object.freeze([...new Set(s.paths)]), before: s.before && Object.freeze([...new Set(s.before)]), scenes: Object.freeze(scenes),
      entrances: Object.freeze(entrances), ...(s.rewinds ? {rewinds: s.rewinds} : {})});
  });
}

/**
 * The pieces' defaults: a piece is at most 6 s (a remainder under minSeconds joins the piece before it); a sentence
 * starts a piece when a pause of at least `pause` seconds comes before it, or the word before it ends a sentence.
 */
export const PIECE_DEFAULTS = Object.freeze({chunkSeconds: 6, minSeconds: 1.5, pause: .3});
/** A word that ends a sentence: a full stop, a question or exclamation mark, an ellipsis, then any closing quote or bracket. */
const ENDS_SENTENCE = /[.!?…。！？]["'”’)\]]*$/u;

/**
 * The moments a piece replays from earlier in the film (a teaser's rewind, a steps track's rewind cue): what it draws
 * at those times is drawn from those moments, so its key holds them too. [{at, until, from, to}]: played over at–until,
 * showing from–to. Read from film.replays (StoryReel 0.18), or a teaser row's rewinds.
 */
const replaysOf = film => film.replays ?? film.rows.flatMap(r => (r.rewinds ? [r.rewinds] : []));

/**
 * The film's pieces: each row (planSegments) cut where a scene or a sentence starts and every `chunkSeconds` from there
 * (see the module's header). Each piece: {index, segment, f0, f1, from, to, paths, before, scenes, enters, replays, slot, label}
 * — paths: the row's recipe entries (whole); before: the row an entrance crossing the piece also draws, or null;
 * enters: the transitions that play in it; replays: the earlier moments it replays; slot: which piece of which scene it
 * is (the same slot in the next render is "this piece" when the making-of record says why it was drawn again).
 * chunkSeconds: Infinity keeps each row whole.
 */
export function planPieces(film, {fps = 30, frames = Math.ceil(film.total * fps), minSeconds = PIECE_DEFAULTS.minSeconds, chunkSeconds = PIECE_DEFAULTS.chunkSeconds, pause = PIECE_DEFAULTS.pause, blur = false} = {}) {
  if (!(chunkSeconds === Infinity || (typeof chunkSeconds === 'number' && chunkSeconds >= 1 && chunkSeconds <= 600))) throw new Error(`chunkSeconds is the longest piece a row is cut into, 1–600 seconds (Infinity keeps each row whole), not ${JSON.stringify(chunkSeconds)}`);
  const segments = planSegments(film, {fps, frames, minSeconds, blur}), replays = replaysOf(film);
  const C = chunkSeconds === Infinity ? Infinity : Math.max(1, Math.round(chunkSeconds * fps)), M = Math.max(1, Math.round(minSeconds * fps));
  const frameOf = t => Math.min(frames, Math.max(0, Math.ceil(t * fps - 1e-6)));
  const starts = film.timings.scenes.map((s, i) => ({id: s.id, f: frameOf(film.clock.offsets[i])}));
  // Where each scene's sentences start, after its first: a cut there keeps every later sentence's pieces whole when an
  // earlier one is re-voiced longer or shorter (they move, and keep their keys). Kept only at least half a piece apart.
  const sentences = film.timings.scenes.flatMap((s, i) => {
    const words = (s.words ?? []).filter(w => w && Number.isFinite(w.start) && Number.isFinite(w.end)), out = [];
    words.forEach((w, k) => { if (k && (ENDS_SENTENCE.test(String(words[k - 1].text ?? '')) || w.start - words[k - 1].end >= pause)) out.push({id: s.id, f: frameOf(film.clock.offsets[i] + w.start), n: out.length + 1}); });
    return out;
  });
  const offsets = film.clock.offsets, durations = film.timings.scenes.map(s => s.duration), S = Math.max(M, Math.round((chunkSeconds === Infinity ? 0 : chunkSeconds / 2) * fps));
  const pieces = [];
  for (const seg of segments) {
    // Where it is cut: its first frame; each scene start inside it that leaves both sides at least M frames; and,
    // when it is cut into pieces at all, each sentence start that leaves at least S frames after the cut before it.
    const first = starts.find(s => s.f === seg.f0), own = first ?? starts.find(s => s.f >= seg.f0) ?? starts.at(-1);
    const scenes = [{f: seg.f0, scene: own.id, start: Boolean(first), n: 0}];
    for (const s of starts) if (s.f > seg.f0 && s.f < seg.f1 && s.f - scenes.at(-1).f >= M && seg.f1 - s.f >= M) scenes.push({f: s.f, scene: s.id, start: true, n: 0});
    // Sentence cuts only inside each scene's own stretch, so they never move a scene's cut: a stretch's cuts depend on
    // its own words alone, and a change in one scene leaves every other scene's pieces as they were.
    const anchors = scenes.flatMap((a, k) => {
      const end = k + 1 < scenes.length ? scenes[k + 1].f : seg.f1, kept = [a];
      if (C !== Infinity) for (const x of sentences) if (x.f > a.f && x.f < end && x.f - kept.at(-1).f >= S && end - x.f >= M) kept.push({f: x.f, scene: x.id, start: false, n: x.n});
      return kept;
    });
    const parts = [];
    anchors.forEach((a, k) => {
      const end = k + 1 < anchors.length ? anchors[k + 1].f : seg.f1;
      for (let f = a.f, n = 0; f < end; n++) {
        const next = f + C <= end - M ? f + C : end;
        parts.push({f0: f, f1: next, slot: `${a.scene}${a.start ? '' : a.n ? `.${a.n}` : '<'}#${n}`, scene: a.scene});
        f = next;
      }
    });
    for (const p of parts) {
      const from = p.f0 / fps, to = p.f1 / fps, entrances = seg.entrances.filter(e => e.f0 < p.f1 && e.f1 > p.f0);
      const before = [...new Set(entrances.flatMap(e => e.before ?? []))], plays = replays.filter(r => r.at < to && r.until > from);
      pieces.push(Object.freeze({index: pieces.length, segment: seg.index, f0: p.f0, f1: p.f1, from, to, paths: seg.paths, before: before.length ? Object.freeze(before) : null,
        scenes: Object.freeze(film.timings.scenes.map(s => s.id).filter((_, i) => offsets[i] < to && offsets[i] + durations[i] > from)),
        enters: Object.freeze([...new Set(entrances.map(e => e.type))]), replays: Object.freeze(plays.map(r => Object.freeze({at: r.at, until: r.until, from: r.from, to: r.to}))),
        slot: p.slot, label: parts.length === 1 ? p.scene : `${p.scene} ${Math.floor(from)}–${Math.ceil(to)} s`}));
    }
  }
  if (pieces.some((p, i) => p.f1 <= p.f0 || (i ? p.f0 !== pieces[i - 1].f1 : p.f0 !== 0)) || pieces.at(-1).f1 !== frames) throw new Error(`planPieces: the pieces do not cover frames 0–${frames} once each, in order; this is a bug in planning, please report it`);
  return pieces;
}

/**
 * Where in a piece it is spot-checked: `count` frame offsets spread over it, first and last included — and two more
 * inside each stretch it replays from earlier (a teaser's rewind, a steps track's rewind cue), which the spread may miss.
 */
export function sampleOffsets(seg, count = 6, fps = 30) {
  const n = seg.f1 - seg.f0, k = Math.min(count, n);
  const spread = Array.from({length: k}, (_, i) => Math.round(i * (n - 1) / Math.max(1, k - 1)));
  const plays = seg.replays ?? (seg.rewinds ? [seg.rewinds] : []);
  const inside = count ? plays.flatMap(r => [1 / 3, 2 / 3].map(u => Math.round((r.at + (r.until - r.at) * u) * fps) - seg.f0)).filter(o => o >= 0 && o < n) : [];
  return [...new Set([...spread, ...inside])].sort((a, b) => a - b);
}
