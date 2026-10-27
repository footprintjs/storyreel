/**
 * Where a crop looks, decided from the film itself (layout.mjs asks here): a crop that FOLLOWS. Strategies by name
 * (FOLLOW), the interface the same for each: (film, {from, to, window: [w, h], width}) → crop keys [{t, x, y, width,
 * jump?}] on the film clock. Pure: the keys are worked out once, from the film's own record — who speaks when
 * (film.clock.turns), what the focus names (film.attention.focus.keys), what is drawn where (film.regionsAt) — and
 * the window at any t is then a function of t (layout.mjs · cropWindow).
 *
 *   focus   the speaker's region while someone speaks (with the focus's named thing, when both fit the window), else
 *           the thing the focus names, else where the window last was (the middle at first). A new key only when the
 *           target leaves the window's middle (DEAD_ZONE of its size), at most one a HOLD apart, eased; at a scene cut the
 *           window jumps with the picture.
 *
 * And for every crop that follows (and every key of a filled picture): keepWhole moves a key the least it must so the
 * window's edge never cuts a kept thing (a person: by default every speaker the film has, as the kits name them in
 * their regions) — whole inside, or whole outside — and says when it cannot (the thing is wider than the window, two
 * kept things leave no place, or a key someone wrote would have to move further than NUDGE of the window's width:
 * what it frames was chosen, so it stays, and the cut is reported).
 */

const STEP = .25, DEAD_ZONE = .18, HOLD = 1, MOVE = .8, MARGIN = 8, LISTEN = [.3, .5];
const SAMPLES = 40;   // at most, per key, for the keep-whole check
/** How far keepWhole may move a key someone wrote, as a share of the window's width (a followed key: as far as it must). */
export const NUDGE = .15;

/** The window's place on the 1600×900 frame for a centre and a width: {x0, y0, w, h} (as layout.mjs · cropWindow places it). */
export function windowAt({x, y = 450, width}, [cw, ch]) {
  const w = width, h = w * ch / cw;
  return {x0: Math.max(0, Math.min(1600 - w, x - w / 2)), y0: h >= 900 ? 450 - h / 2 : Math.max(0, Math.min(900 - h, y - h / 2)), w, h};
}

/** The film's speakers: every name a word is said by (film.clock.turns), in the order they first speak. */
export const filmSpeakers = film => [...new Set((film.clock.turns?.() ?? []).map(t => t.speaker).filter(Boolean))];

/** The named things at t: name → box (a name drawn twice is left out: it names no one thing). */
function namedAt(film, t) {
  const seen = new Map();
  for (const r of film.regionsAt?.(t) ?? []) if (r.name) seen.set(r.name, seen.has(r.name) ? null : r.box);
  return seen;
}
const union = boxes => [Math.min(...boxes.map(b => b[0])), Math.min(...boxes.map(b => b[1])), Math.max(...boxes.map(b => b[2])), Math.max(...boxes.map(b => b[3]))];

/**
 * What the focus strategy looks at, at t: {x, y, why: 'speaker' | 'focus' | 'both'} or null (nothing named to look at).
 * `turns` [{speaker, start, end}]; `focusKeys` [{t, on}] (on: a name, several, or "wide"); w the window's width.
 */
export function focusTarget(film, t, {turns, focusKeys, w}) {
  const names = namedAt(film, t);
  const turn = turns.findLast(g => t >= g.start - LISTEN[0] && t <= g.end + LISTEN[1]);
  const speaker = turn && names.get(turn.speaker), on = focusKeys.findLast(k => t >= k.t)?.on;
  // A key may frame several things (on: [a, b]): the box round the ones named here.
  const boxes = on && on !== 'wide' ? [on].flat().map(n => names.get(n)).filter(Boolean) : [], thing = boxes.length ? union(boxes) : null;
  const pick = speaker && thing && union([speaker, thing])[2] - union([speaker, thing])[0] <= w * .9 ? ['both', union([speaker, thing])] : speaker ? ['speaker', speaker] : thing ? ['focus', thing] : null;
  if (!pick) return null;
  const [why, b] = pick;
  return {x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2, why};
}

/** The focus strategy (see the module's header): keys from `from` to `to` for a window `width` wide in a crop of [cw, ch]. */
export function followFocus(film, {from, to, crop, width}) {
  const [cw, ch] = crop, w = width ?? cw, h = w * ch / cw;
  const turns = film.clock.turns?.() ?? [], focusKeys = film.attention?.focus?.keys ?? [];
  const cuts = film.clock.offsets.filter(s => s > from + 1e-6 && s < to - 1e-6);
  const events = [...cuts, ...turns.map(g => g.start), ...focusKeys.map(k => k.t)].filter(s => s > from && s < to);
  const grid = Array.from({length: Math.max(0, Math.floor((to - from) / STEP))}, (_, i) => from + (i + 1) * STEP).filter(s => s < to);
  const times = [...new Set([from, ...events, ...grid].map(s => +s.toFixed(4)))].sort((a, b) => a - b);
  const keys = [], why = {speaker: 0, focus: 0, both: 0, held: 0};
  let prev = from;
  for (const t of times) {
    const cut = cuts.find(s => s > prev + 1e-6 && s <= t + 1e-6);
    prev = t;
    const at = cut ?? t, target = focusTarget(film, at, {turns, focusKeys, w}), last = keys.at(-1);
    // The first key opens the stretch where it looks (the middle when nothing is named there), at once.
    if (!last) { keys.push({t: from, x: target?.x ?? 800, y: target?.y ?? 450, width: w, jump: true, why: target?.why ?? 'held'}); continue; }
    if (!target) continue;
    const far = Math.abs(target.x - last.x) > w * DEAD_ZONE || (h < 900 && Math.abs(target.y - last.y) > h * DEAD_ZONE);
    if (cut !== undefined && far) keys.push({t: cut, x: target.x, y: target.y, width: w, jump: true, why: target.why});
    else if (far && at - last.t >= HOLD) keys.push({t: at, x: target.x, y: target.y, width: w, why: target.why});
  }
  for (const k of keys) why[k.why]++;
  return {keys: keys.map(({why: _, ...k}) => k), why};
}

/** The follow strategies, by name. */
export const FOLLOW = Object.freeze({focus: followFocus});

/** How a box lies against a span [a, b): 'in', 'out' or 'cut' (part inside, part out). */
const against = ([b0, b1], a, b) => (b0 >= a - .5 && b1 <= b + .5 ? 'in' : b1 <= a + .5 || b0 >= b - .5 ? 'out' : 'cut');

/** The best start along one axis for spans `spans` [[b0, b1, name]] (each sample's), the window `size` long in a frame `room` long. */
function bestStart(base, spans, size, room) {
  const clamp = v => Math.max(0, Math.min(room - size, v));
  const candidates = [base, ...spans.flatMap(([b0, b1]) => [b0 - MARGIN, b1 + MARGIN - size, b1 + MARGIN, b0 - MARGIN - size])].map(clamp);
  const inside = new Set(spans.filter(([b0, b1]) => against([b0, b1], base, base + size) === 'in').map(s => s[2]));
  const score = s => { let cut = 0, lost = 0; for (const [b0, b1, name] of spans) { const k = against([b0, b1], s, s + size); if (k === 'cut') cut++; else if (k === 'out' && inside.has(name)) lost++; } return {cut, lost, s}; };
  return candidates.map(score).sort((p, q) => p.cut - q.cut || p.lost - q.lost || Math.abs(p.s - base) - Math.abs(q.s - base))[0];
}

/**
 * The keys moved the least they must so the window's edge never cuts a kept thing while each key holds (from the
 * end of its move to the next key; `until` for the last): {keys, nudged: [{t, by: [dx, dy]}], cut: [{t, names, why}]}.
 * `keep` names the things to keep whole; `crop` [cw, ch] the format's crop.
 */
export function keepWhole(film, keys, {crop, keep, until}) {
  const nudged = [], cut = [];
  if (!keep.length || !film.regionsAt) return {keys, nudged, clipped: cut};
  const out = keys.map((k, i) => {
    const start = k.t + (k.jump ? 0 : MOVE), end = keys[i + 1]?.t ?? until;
    if (!(end > start)) return k;
    const n = Math.min(SAMPLES, Math.max(1, Math.ceil((end - start) / STEP)));
    const boxes = Array.from({length: n}, (_, j) => start + (end - start) * j / n).flatMap(t => [...namedAt(film, t)].filter(([name, b]) => b && keep.includes(name)));
    if (!boxes.length) return k;
    const win = windowAt(k, crop);
    let bx = bestStart(win.x0, boxes.map(([name, b]) => [b[0], b[2], name]), win.w, 1600);
    let by = win.h < 900 ? bestStart(win.y0, boxes.map(([name, b]) => [b[1], b[3], name]), win.h, 900) : {cut: 0, s: win.y0};
    // A written key moves at most NUDGE of the window: past that it stays where it was written, and the cut is reported.
    const far = k.given && (Math.abs(bx.s - win.x0) > NUDGE * win.w || Math.abs(by.s - win.y0) > NUDGE * win.h);
    if (far) { bx = {...bx, s: win.x0, cut: 1}; by = {...by, s: win.y0}; }
    const dx = Math.abs(bx.s - win.x0) > .5 ? bx.s - win.x0 : 0, dy = Math.abs(by.s - win.y0) > .5 ? by.s - win.y0 : 0;
    // The centre that puts the window where it is chosen (a key's own x may lie past the frame's edge, held there).
    const moved = dx || dy ? {...k, ...(dx ? {x: bx.s + win.w / 2} : {}), ...(dy ? {y: by.s + win.h / 2} : {})} : k;
    if (moved !== k) nudged.push({t: +k.t.toFixed(3), by: [Math.round(dx), Math.round(dy)]});
    if (bx.cut || by.cut) {
      const w2 = windowAt(moved, crop), names = [...new Set(boxes.filter(([, b]) => against([b[0], b[2]], w2.x0, w2.x0 + w2.w) === 'cut' || (w2.h < 900 && against([b[1], b[3]], w2.y0, w2.y0 + w2.h) === 'cut')).map(([name]) => name))];
      const wide = boxes.some(([name, b]) => names.includes(name) && (b[2] - b[0] > w2.w || b[3] - b[1] > w2.h));
      cut.push({t: +k.t.toFixed(3), names, why: wide ? 'wider than the window: give the key a larger width'
        : far ? `keeping them whole moves this written key more than ${Math.round(NUDGE * 100)}% of the window: move the key yourself, or give it a larger width`
          : 'no place for the window keeps every one whole: give a key of its own, or a larger width'});
    }
    return moved;
  });
  return {keys: out, nudged, clipped: cut};
}
