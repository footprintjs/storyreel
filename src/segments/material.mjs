/**
 * What draws a piece of the picture, part by part, on the piece's own clock (seconds from its first frame): a piece's
 * cache key is the hash of these parts, and when a piece is drawn again its parts say why (whyDrawn: "words changed",
 * "shot code changed").
 *
 * A time near the piece (within `margin` seconds of it, or of a moment it replays) is kept exactly; a time farther off
 * is only the side it is on ('before', 'after'). So a scene before it that grows, or a word re-voiced ten seconds
 * earlier, leaves its key as it was, while a beat, a word, a note or a camera move inside it, or just around it, is in
 * it to the hundredth. A drawing that keeps changing long after its beat (a flock walking out over twelve seconds) is
 * held by the spot check, not by the key (segments.mjs): a key is only as good as what it lists, which is why every
 * reused piece is checked.
 *
 * The parts: engine (StoryReel's drawing code: segments/drawing.mjs · core), catalog:<name> (each transition or
 * piece of a catalog the piece draws: a transition, the steps track, a thought cloud), code (the kits' code), frames, pixels (the frame settings), entries (its recipe
 * entries, whole), lines (when each of their beats lands), words (the scenes around it: their words, number slots,
 * speakers, example flags), captions (the burned-in caption chunks shown in and around it), notes, camera, attention
 * (focus and emphasis), labels (an example scene's label), strings, data, theme, files, cast (what reaches every
 * frame), poster and recalls (pixel hashes of the moments the picture copies).
 */
import {createHash} from 'node:crypto';
import {stableJson} from '../hash.mjs';
import {CATALOG_ENTRIES, ownDrawingCode} from './drawing.mjs';

/** The material's version: a key from another one never matches. */
export const MATERIAL = 4;

/** The recipe entry at a path ('story', 'whiteboard', 'pushIn', 'card', 'stages[3]', 'guesses[0]', 'stepsTrack'). */
export const entryAt = (recipe, p) => { const m = p.match(/^(stages|guesses)\[(\d+)\]$/); return m ? recipe?.[m[1]]?.[+m[2]] : recipe?.[p]; };
const round = n => +n.toFixed(4);
/** Every string-table key a value names ({"$string": key}, at any depth). */
const stringRefs = (v, out = new Set()) => { if (Array.isArray(v)) v.forEach(x => stringRefs(x, out)); else if (v && typeof v === 'object') { if (typeof v.$string === 'string') out.add(v.$string); for (const x of Object.values(v)) stringRefs(x, out); } return out; };
const inside = (p, paths) => paths.some(q => p === q || p.startsWith(`${q}.`));
/** Whether a piece's entries draw the film's recalls (a recap's frames, a summary's or hero's picture, a teaser). */
const drawsRecalls = entries => entries.some(([, entry]) => entry && JSON.stringify(entry).includes('"recall"'));

/**
 * What draws a piece (or a whole row: planSegments), part by part (see the module's header). Options: recipe, storyboard,
 * pixels (the render's frame settings), code (a fingerprint, or code(entries, piece) per piece), fps, margin (3 s),
 * captions (the layout's caption chunks, when it burns them in), extra ({poster, recalls}: their pixel hashes),
 * drawing (StoryReel's drawing code: segments/drawing.mjs; a test passes another).
 */
export function segmentMaterial(film, seg, {recipe, storyboard = null, pixels, code = null, fps = 30, margin = 3, layout = null, captions = layout?.captionChunks ?? null, extra = {}, drawing = ownDrawingCode()}) {
  // The times it draws: its own, the moments it replays (a teaser's rewind, a steps track's rewind cue), and the
  // moments its pictures show when the camera holds or slows the picture (a freeze, a speed ramp: camerawork.mjs ·
  // clockAt) — a piece inside a freeze shows the moment it froze on.
  const plays = seg.replays ?? (seg.rewinds ? [seg.rewinds] : []), shows = pictureSpan(film, seg, fps);
  const spans = [[seg.from, seg.to], ...plays.map(r => [r.from, r.to]), ...(shows ? [shows] : [])];
  const over = (a, b) => spans.some(([f, t]) => a < t && b > f), near = t => spans.some(([f, to]) => t >= f - margin && t <= to + margin);
  const at = t => round(t - seg.from);
  /** A time: exact near the piece, else the side it is on. */
  const when = t => t === null || t === undefined ? null : !Number.isFinite(t) ? (t > 0 ? 'after' : 'before') : near(t) ? at(t) : t < seg.from ? 'before' : 'after';
  const overlays = (film.overlays ?? []).filter(o => over(o.from, o.to)).map(o => o.path);
  // The moments its frames draw, exactly: each frame's time (frame f shows f / fps), and with motion blur half a frame
  // either side (render.mjs · blurMoments). An entrance there is drawn — its transition, the row it brings in and the
  // row it leaves (a blurred frame just before an entrance draws its first moment too).
  const half = pixels?.motionBlur ? .5 / fps : 0, drawn = [[seg.f0 / fps - half, (seg.f1 - 1) / fps + half], ...plays.map(r => [r.from - half, r.to + half]), ...(shows ? [[shows[0] - half, shows[1] + half]] : [])];
  const crossing = (film.rows ?? []).map((r, j) => ({r, j})).filter(({r}) => r.enter && drawn.some(([f, t]) => r.from <= t && r.from + (r.enter.seconds ?? 0) >= f && (r.enter.seconds ? r.from < t : true)));
  // Every entrance it draws brings both rows' entries (a moment it replays may hold one; a blurred frame reaches into one).
  const entering = crossing.flatMap(({r, j}) => [...r.paths, ...(j ? film.rows[j - 1].paths : [])]);
  const paths = [...new Set([...seg.paths, ...(seg.before ?? []), ...entering, ...overlays])];
  const entries = paths.map(p => [p, entryAt(recipe, p) ?? null]);
  const {strings = null, data = null, theme = null, files = {}, cast = null} = film.inputs ?? {};
  // The words it shows: only the strings its own entries name (a word changed elsewhere does not redraw it); a film
  // compiled without per-string hashes keys on the whole table, as before.
  const words = film.stringHashes ? Object.fromEntries([...stringRefs(entries)].sort().map(k => [k, film.stringHashes[k] ?? null])) : strings;
  // The scenes around it: where each starts and ends, and the words said near it (captions and mouths), its number
  // slots and speaker (what is shown, who speaks), and an example scene's label.
  const scenes = film.timings.scenes.map((sc, i) => ({sc, start: film.clock.offsets[i]}))
    .filter(({sc, start}) => spans.some(([f, t]) => start - margin < t && start + sc.duration + margin > f))
    .map(({sc, start}) => {
      const board = storyboard?.scenes?.find(b => b.id === sc.id);
      const said = (sc.words ?? []).filter(w => spans.some(([f, t]) => start + w.end >= f - margin && start + w.start <= t + margin));
      return {id: sc.id, start: when(start), end: when(start + sc.duration), words: said.map(w => [w.text, at(start + w.start), at(start + w.end), ...(w.speaker ? [w.speaker] : [])]),
        ...(board ? {say: board.say ?? null, speaker: board.speaker ?? null} : {}), ...(board?.example ? {example: board.example} : {})};
    });
  // The transitions it draws (crossing, above), by name; a catalog's own module is keyed only here
  // (segments/drawing.mjs · CATALOG), with the steps track when it is over the piece.
  const enters = crossing.map(({r}) => r.enter.type);
  // A frame a world is drawn in (a thought cloud: "frame": "thought" or {"type": "thought", …}), by its kind.
  const frames = entries.map(([, e]) => e?.frame).filter(f => f !== undefined && f !== null).map(f => (typeof f === 'string' ? f : f.type));
  const used = [...new Set([...enters, ...overlays, ...frames])].filter(n => Object.hasOwn(CATALOG_ENTRIES, n)).sort();
  const attention = film.attentionFrames ?? null, focus = attention?.focus ?? null, emphasis = attention?.emphasis ?? null;
  /** Keys in time order ({t}) that reach the piece: each near a stretch it draws, and the last one before each stretch. */
  const reaching = list => list.filter((k, i) => near(k.t) || spans.some(([f]) => k.t < f - margin && !(list[i + 1]?.t < f - margin)));
  return withoutAbsent({
    v: MATERIAL,
    engine: drawing.core,
    ...Object.fromEntries(used.map(n => [`catalog:${n}`, drawing.catalog(n)])),
    code: typeof code === 'function' ? code(paths.map(p => entryAt(recipe, p)).filter(Boolean), {...seg, paths, enters: [...new Set(enters)]}) : code,
    frames: {frames: seg.f1 - seg.f0, fps},
    pixels: {...pixels, poster: seg.index === 0 && pixels.poster !== null && pixels.poster !== undefined ? 'drawn' : null},
    entries,
    lines: film.beats.filter(b => b.path && (inside(b.path, paths) || (b.path.startsWith('guesses') && near(b.t)))).map(b => [b.path, when(b.t)]),
    words: scenes,
    // The caption chunks burned in near it (layout.mjs: chunked over the whole film, so a word far off that moves a
    // chunk's edge shows here as the chunk it changed).
    captions: captions ? captions.filter(c => spans.some(([f, t]) => c.start < t + margin && c.end > f - margin)).map(c => [c.text, at(c.start), at(c.end), c.words.map(w => [w.text, at(w.start), at(w.end)])]) : undefined,
    // A camera speed is the whole film's; a push or a cut counts where it happens.
    // (A push eases back out for `seconds` after its last phrase: notes.mjs · pushAt.)
    notes: (film.notes ?? []).filter(n => n.speed !== undefined || (n.push ? over(n.from, n.to + (n.seconds ?? 0)) : near(n.at ?? -Infinity)))
      .map(n => ({...n, ...(n.from === undefined ? {} : {from: when(n.from)}), ...(n.to === undefined ? {} : {to: when(n.to)}), ...(n.at === undefined ? {} : {at: when(n.at)})})),
    // The camera's moves that reach it (camerawork.mjs): each from its start until what it drew has gone.
    // (Absent for a film without them, as an absent focus, emphasis or caption band is: no part.)
    camera: film.camera ? {motion: film.camera.motion, moves: film.camera.moves.filter(m => over(m.at, m.lasts ?? Infinity))
      .map(({path, at: from, until, lasts, ...rest}) => ({path, ...rest, at: when(from), until: when(until), lasts: lasts === null ? null : when(lasts)}))} : undefined,
    // Where the viewer looks (attention.mjs): the focus keys and emphasis words that reach it — those near it, exactly,
    // and the last one before each stretch it draws, by what it shows (a spring adds nothing before its key and has
    // settled long before the margin ends, so an earlier key, or one after the piece, changes none of its frames).
    attention: focus || emphasis ? {
      focus: focus && {strategy: focus.strategy, feel: focus.feel, safe: focus.safe, code: focus.code ?? null, keys: reaching(focus.keys).map(k => [k.on, k.size ?? null, round(k.cx), round(k.cy), round(k.z), round(k.sx), round(k.sy), k.box.map(round), round(k.w), when(k.t)])},
      emphasis: emphasis && {strategy: emphasis.strategy, feel: emphasis.feel, code: emphasis.code ?? null, words: reaching(emphasis.words).map(w => [w.text, when(w.t), when(w.next)])}} : undefined,
    // The crop of a format that shows part of the frame (layout.mjs · cropKeys): each key near it, and the last before.
    // (A key's y and jump, layout.mjs · fill and follow, only where a key has them: every other key is keyed as it was.)
    crop: layout?.cropKeys ? reaching(layout.cropKeys).map(k => [round(k.x), round(k.width), when(k.t), ...(k.y !== undefined ? [round(k.y)] : []), ...(k.jump ? ['jump'] : [])]) : undefined,
    // An example scene's label, while it is up over the piece (claims.mjs · labelSpans).
    labels: (film.claims?.labels ?? []).filter(l => over(l.from, l.to)).map(l => [l.words ?? null, when(l.from), when(l.to)]),
    strings: words, data, theme, files, cast,
    poster: seg.index === 0 ? extra.poster ?? null : null,
    recalls: drawsRecalls(entries) ? extra.recalls ?? null : null,
  });
}

/** The material without the parts a film does not have (no camera moves: no `camera` at all). */
const withoutAbsent = material => Object.fromEntries(Object.entries(material).filter(([, value]) => value !== undefined));

/**
 * The moments a piece's pictures show, [first, last], when the camera draws the picture on a clock of its own (a freeze
 * or a speed ramp: film.pictureAt) and they are not the piece's own; null otherwise (a film without camera moves).
 */
function pictureSpan(film, seg, fps) {
  if (!film.camera || typeof film.pictureAt !== 'function') return null;
  let lo = Infinity, hi = -Infinity, own = true;
  for (let f = seg.f0; f < seg.f1; f++) { const t = f / fps, p = film.pictureAt(t); if (Math.abs(p - t) > 1e-9) own = false; lo = Math.min(lo, p); hi = Math.max(hi, p); }
  return own ? null : [lo, hi];
}

const hex = v => createHash('sha256').update(stableJson(v)).digest('hex');

/** A material's parts, each hashed: {part: hash16}. */
export function materialParts(material) {
  const {v: _v, ...parts} = material;
  return Object.fromEntries(Object.entries(parts).filter(([, value]) => value !== undefined).map(([name, value]) => [name, hex(value).slice(0, 16)]));
}

/** A piece's key and its parts: the parts hashed together with the material's version. */
export function pieceKey(film, seg, options) {
  const parts = materialParts(segmentMaterial(film, seg, options));
  return {key: hex({v: MATERIAL, parts}).slice(0, 24), parts};
}

/** A piece's (or a row's) cache key: its material (segmentMaterial), hashed. */
export const segmentKey = (film, seg, options) => pieceKey(film, seg, options).key;

/** What each part's change means, said in a few words. */
export const PART_WHY = Object.freeze({
  engine: "StoryReel's drawing code changed", code: 'shot code changed', frames: 'its length changed', pixels: 'frame settings changed', crop: 'the crop moved',
  entries: 'its recipe entries changed', lines: 'beats moved', words: 'words changed', captions: 'captions changed', notes: 'notes changed',
  camera: 'camera moves changed', attention: 'focus or emphasis changed', labels: 'example label changed', strings: 'on-screen words changed',
  data: 'data changed', theme: 'theme changed', files: 'a file it shows changed', cast: 'the cast changed', poster: 'the poster changed', recalls: 'the recalls changed',
});

/**
 * Why a piece was drawn again, from the parts it had the last time this slot was drawn and the parts it has now: the
 * parts that changed, in a few words each ("words changed, beats moved"), a catalog entry's code by its name ("torn's
 * code changed"). Null when nothing tells them apart (a piece cached under another key).
 */
export function whyDrawn(before, now) {
  if (!before || typeof before !== 'object') return null;
  const names = [...new Set([...Object.keys(before), ...Object.keys(now)])].filter(n => before[n] !== now[n]);
  // A catalog entry is named only when it is one StoryReel has (a name read back from a store is never said as it is).
  const catalog = names.filter(n => n.startsWith('catalog:')).map(n => n.slice(8)), known = catalog.filter(n => Object.hasOwn(CATALOG_ENTRIES, n)).sort();
  const said = [...Object.keys(PART_WHY).filter(n => names.includes(n)).map(n => PART_WHY[n]), ...(known.length ? [`${known.join(', ')} code changed`] : []),
    ...(catalog.length > known.length ? ['a catalog entry\'s code changed'] : [])];
  return said.length ? said.join(', ') : null;
}
