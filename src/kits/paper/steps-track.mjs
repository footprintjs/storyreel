/**
 * A steps track: a slim band of labelled stations over any scene, its playhead hopping station to station as the
 * voice names each one — backward with ⏪, or forward with ▶. The current station is lit, the ones behind are
 * ticked, and the NEXT one is a "?" until the playhead reaches it, so a viewer sees where the walk is and that one
 * more step is coming. A `flip` turns a finished rewind into play: the ⏪ turns over into ▶ and the track plays
 * forward through its own station list (it may name more steps than the walk back did).
 *
 * Use it for a process walked backward, then played forward: one finished picture taken apart need by need, then
 * built again in order.
 *
 * Everything is a pure function of time (stepsTrackAt), drawn on the 1600×900 frame in the theme's colours.
 * The band has no backdrop: its labels on their own small pills, a dotted path, the playhead's glow and one round mark
 * at its start. A review reads the labels like every other word (words over words, under the captions, cut off), so a
 * label over a scene's words is found. Two places: `bottom` (the default: under the landscape caption band) and `top`.
 */
import {ease, icons, drawIcon, shapes} from '../whiteboard/board.mjs';
import {drawTransport, TRANSPORT_WIDTH, spring} from './paper.mjs';

const PLACES = Object.freeze({top: 68, bottom: 874});
/** The track's numbers: where its band sits (its middle, frame units), how long a label may be, and its timing in seconds. */
export const STEPS_TRACK = Object.freeze({
  places: PLACES,
  label: 18,          // the longest label, in characters: it must fit its slot in the slim band
  stations: 8,        // the most stations in one walk
  hop: .5,            // the playhead leaves this long before a station is named and arrives as it is
  gap: .6,            // the least time between two stations (a hop and a breath)
  enter: .6,          // with no `from`: the track enters this long before its first station
  fade: .4,           // its entrance
  leave: .5,          // its exit, after `until`
  hold: 2.5,          // with no `until`: it stays this long after its last station
  flip: .2,           // each half of the mark's turn (it closes on ⏪, opens on ▶)
  pop: .45,           // a reached station's label settles
  rewind: Object.freeze({seconds: 1.5, min: .5, max: 4}),
});
const KEYS = ['place', 'direction', 'stations', 'flip', 'from', 'until', 'rewind'], STATION_KEYS = ['label', 'glyph', 'at'];
const FLIP_KEYS = ['at', 'stations'], REWIND_KEYS = ['to', 'seconds'];
// The band: the mark's middle, then the first and last station slots (a pill may reach 110 beyond a slot: inside the safe margin).
const MARK_X = 82, X0 = 228, X1 = 1424, PILL = 36, SIZE = 23, WIDEST = 220;

const shown = v => (typeof v === 'string' ? JSON.stringify(v) : Array.isArray(v) ? 'a list' : v === null ? 'null' : typeof v === 'object' ? 'an object' : String(v));
const clamp = v => Math.max(0, Math.min(1, v));
const isObject = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
function onlyKeys(spec, keys, where, what) {
  for (const k of Object.keys(spec)) if (!keys.includes(k)) throw new Error(`${where} has unsupported key ${k} (${what} takes ${keys.join(', ')})`);
}

/**
 * A station's label: the film's own word for the step, one line, 1 to STEPS_TRACK.label characters. Refusals name
 * the fix.
 */
function readLabel(label, where) {
  if (label === undefined || (typeof label === 'string' && !label.trim())) throw new Error(`${where} has no label: a station's label is the film's own word for that step (e.g. "layout"); write the word the narration says there`);
  if (typeof label !== 'string') throw new Error(`${where}.label must be words (a string), not ${shown(label)}`);
  const text = label.trim();
  // A line break, a control character or a direction override (it would show the word other than it is written) refuses.
  if (/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(text)) throw new Error(`${where}.label ${shown(text.slice(0, 40))} breaks its line or hides a control character: a station's label is one plain line in a slim band; keep the shortest word the narration uses`);
  if ([...text].length > STEPS_TRACK.label) throw new Error(`${where}.label ${shown(text.length > 40 ? `${text.slice(0, 40)}…` : text)} is ${[...text].length} characters; a station's label fits the slim band in ${STEPS_TRACK.label} or fewer — use the narration's shortest word for the step (e.g. "layout", not "the layout step")`);
  return text;
}

function readStations(list, where, when) {
  if (!Array.isArray(list) || !list.length) throw new Error(`${where} must list the stations, in the order the walk reaches them: [{label, at}, …]`);
  if (list.length > STEPS_TRACK.stations) throw new Error(`${where} has ${list.length} stations; a slim band holds ${STEPS_TRACK.stations} at most — join steps the narration names together, or split the walk`);
  return Object.freeze(list.map((s, i) => {
    const at = `${where}[${i}]`;
    if (!isObject(s)) throw new Error(`${at} must be a station {label, at, glyph?}, not ${shown(s)}`);
    onlyKeys(s, STATION_KEYS, at, 'a station');
    const label = readLabel(s.label, at);
    if (s.glyph !== undefined && !Object.hasOwn(icons, s.glyph)) throw new Error(`${at}.glyph must be one of ${Object.keys(icons).join(', ')} (a tiny sign beside the label), not ${shown(s.glyph)}`);
    if (s.at === undefined) throw new Error(`${at} needs at: the moment the voice names "${label}"`);
    return Object.freeze({label, glyph: s.glyph ?? null, at: when(s.at, `${at}.at`)});
  }));
}

function inOrder(list, where, after = -Infinity, afterWhat = null) {
  list.forEach((s, i) => {
    const before = i ? list[i - 1].at : after, gap = s.at - before;
    if (!(gap >= STEPS_TRACK.gap - 1e-9)) {
      const what = i ? 'the station before it' : afterWhat;
      if (what) throw new Error(`${where}[${i}] ("${s.label}") comes ${gap.toFixed(2)} s after ${what}; a station needs at least ${STEPS_TRACK.gap} s (the playhead's hop is ${STEPS_TRACK.hop} s) — name it later`);
    }
  });
}

/**
 * A steps track, read and checked: {place, direction, stations: [{label, glyph?, at}], flip?: {at, stations},
 * from?, until?, rewind?: {to, seconds?}} → the frozen track, every moment in seconds. `at` turns a moment as
 * written into seconds (a film passes its clock: a beat names what is said); left out, moments are seconds.
 * `where` names the track in a refusal. `rewind` is the film's cue (film.mjs): from `from`, for `seconds`, the
 * picture plays back to `to`, under the rewind look (paper.mjs · drawRewind), while the track enters.
 */
export function readStepsTrack(spec, {where = 'stepsTrack', at = null} = {}) {
  const when = (v, what) => {
    if (at) return at(v);
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error(`${what} is a moment in seconds (0 or more), not ${shown(v)}`);
    return v;
  };
  if (!isObject(spec)) throw new Error(`${where} must be a steps track: {direction: "back" | "forward", stations: [{label, at}], place?, flip?, from?, until?, rewind?}`);
  onlyKeys(spec, KEYS, where, 'a steps track');
  const place = spec.place ?? 'bottom';
  if (!Object.hasOwn(PLACES, place)) throw new Error(`${where}.place must be ${Object.keys(PLACES).join(' or ')} (a slim band at the frame's top or foot), not ${shown(place)}`);
  if (spec.direction !== 'back' && spec.direction !== 'forward') throw new Error(`${where}.direction must be "back" (⏪: a process walked backward) or "forward" (▶), not ${shown(spec.direction)}`);
  const stations = readStations(spec.stations, `${where}.stations`, when);
  inOrder(stations, `${where}.stations`);
  let flip = null;
  if (spec.flip !== undefined) {
    if (spec.direction !== 'back') throw new Error(`${where}.flip turns a finished rewind into play: give direction "back", or leave flip out`);
    if (!isObject(spec.flip)) throw new Error(`${where}.flip must be {at, stations}: when the ⏪ turns into ▶, and the stations played forward`);
    onlyKeys(spec.flip, FLIP_KEYS, `${where}.flip`, 'a flip');
    if (spec.flip.at === undefined) throw new Error(`${where}.flip needs at: the moment the walk back turns into play`);
    const flipAt = when(spec.flip.at, `${where}.flip.at`), last = stations.at(-1);
    if (!(flipAt - last.at >= STEPS_TRACK.gap - 1e-9)) throw new Error(`${where}.flip comes ${(flipAt - last.at).toFixed(2)} s after the last station ("${last.label}"); the walk back needs at least ${STEPS_TRACK.gap} s at its end before it turns`);
    const forward = readStations(spec.flip.stations, `${where}.flip.stations`, when);
    inOrder(forward, `${where}.flip.stations`, flipAt, 'flip.at (the mark takes 0.4 s to turn over)');
    flip = Object.freeze({at: flipAt, stations: forward});
  }
  const first = stations[0].at, lastAt = (flip ? flip.stations : stations).at(-1).at;
  const from = spec.from === undefined ? Math.max(0, first - STEPS_TRACK.enter) : when(spec.from, `${where}.from`);
  if (!(from <= first)) throw new Error(`${where}.from comes after its first station ("${stations[0].label}"): name a moment at or before it (the track enters before the walk starts)`);
  const until = spec.until === undefined ? lastAt + STEPS_TRACK.hold : when(spec.until, `${where}.until`);
  if (!(until > lastAt)) throw new Error(`${where}.until must come after its last station, so the last step is seen`);
  let rewind = null;
  if (spec.rewind !== undefined) {
    if (spec.direction !== 'back') throw new Error(`${where}.rewind is the cue for a walk backward: give direction "back", or leave rewind out`);
    if (!isObject(spec.rewind)) throw new Error(`${where}.rewind must be {to, seconds?}: the picture plays back to \`to\` as the track enters`);
    onlyKeys(spec.rewind, REWIND_KEYS, `${where}.rewind`, 'a rewind');
    if (spec.rewind.to === undefined) throw new Error(`${where}.rewind needs to: the earlier moment the picture plays back to`);
    const to = when(spec.rewind.to, `${where}.rewind.to`), {min, max} = STEPS_TRACK.rewind, seconds = spec.rewind.seconds ?? STEPS_TRACK.rewind.seconds;
    if (!(to < from)) throw new Error(`${where}.rewind.to must come before the track enters (${from.toFixed(2)} s): a rewind plays the picture back`);
    if (typeof seconds !== 'number' || !(seconds >= min && seconds <= max)) throw new Error(`${where}.rewind.seconds is how long the rewind plays, ${min} to ${max} s (${STEPS_TRACK.rewind.seconds} unless given), not ${shown(seconds)}`);
    rewind = Object.freeze({to, from, seconds});
  }
  return Object.freeze({place, y: PLACES[place], direction: spec.direction, stations, flip, from, until, rewind});
}

/** The slots of n stations, in walking order: a walk back starts at the right (it heads for the mark), forward at the left. */
function slotsOf(n, dir) {
  return Array.from({length: n}, (_, i) => { const u = n === 1 ? .5 : i / (n - 1); return dir === 'back' ? X1 - (X1 - X0) * u : X0 + (X1 - X0) * u; });
}

/** One walk at t: where its playhead is, and each station's state. `done`: the walk is over (the flip came): all ticked. */
function walkAt(list, dir, t, done, enteredAt) {
  const slots = slotsOf(list.length, dir), room = list.length > 1 ? Math.abs(slots[1] - slots[0]) - 16 : WIDEST;
  let cur = -1;
  if (done) cur = list.length - 1; else list.forEach((s, i) => { if (s.at <= t) cur = i; });
  let head = slots[Math.max(cur, 0)];
  const nx = cur + 1;
  if (!done && nx > 0 && nx < list.length) { const u = (t - (list[nx].at - STEPS_TRACK.hop)) / STEPS_TRACK.hop; if (u > 0) head = slots[nx - 1] + (slots[nx] - slots[nx - 1]) * ease(clamp(u)); }
  const stations = list.map((s, i) => {
    const state = done || i < cur ? 'visited' : i === cur ? 'current' : i === nx ? 'next' : 'ahead';
    // Since when it shows as it does: a reached station since it was reached; the next since the one before it was (or the track entered).
    const since = i <= cur ? s.at : i === nx ? (i ? list[i - 1].at : enteredAt) : Infinity;
    return Object.freeze({label: s.label, glyph: s.glyph, state, text: i <= cur ? s.label : i === nx ? '?' : '', x: slots[i], pop: clamp((t - since) / STEPS_TRACK.pop)});
  });
  return {direction: dir, head, room: Math.min(WIDEST, room), stations: Object.freeze(stations)};
}

/**
 * The track at t, or null when it is not on screen: {alpha, direction, mark: '⏪' | '▶', turn (the mark's width,
 * 0..1: it closes and opens as it flips), stations (the walk the playhead is on: [{label, glyph, state: 'visited' |
 * 'current' | 'next' | 'ahead', text: the label, '?' or '', x, pop}]), walks (every walk drawn now, each with its
 * alpha: through a flip, the walk back fades as the walk forward comes in)}.
 */
export function stepsTrackAt(track, t) {
  const {fade, leave, flip: half} = STEPS_TRACK;
  const alpha = Math.min(ease(clamp((t - track.from) / fade)), 1 - ease(clamp((t - track.until) / leave)));
  if (!(alpha > 0)) return null;
  const F = track.flip ? track.flip.at : Infinity, turned = t >= F + half, k = (t - F) / half;
  const turn = !(k >= 0) || k >= 2 ? 1 : k < 1 ? 1 - ease(k) : ease(k - 1);
  const back = {...walkAt(track.stations, track.direction, t, t >= F, track.from), alpha: track.flip ? 1 - ease(clamp((t - F) / (2 * half))) : 1};
  const walks = [back];
  if (track.flip && t >= F) walks.push({...walkAt(track.flip.stations, 'forward', t, false, F), alpha: ease(clamp((t - F - half) / (2 * half)))});
  const on = turned ? walks[1] : walks[0], direction = turned ? 'forward' : track.direction;
  return Object.freeze({alpha, direction, mark: direction === 'back' ? '⏪' : '▶', turn, stations: on.stations, walks: Object.freeze(walks.filter(w => w.alpha > 0).map(Object.freeze))});
}

/** Where the band is at t, on the frame ([x0, y0, x1, y1]), or null when it is not on screen. */
export function stepsTrackBox(track, t) {
  return stepsTrackAt(track, t) ? [MARK_X - 26, track.y - 22, X1 + WIDEST / 2, track.y + 22] : null;
}

/** The lines a viewer reads, for the reading check: each label from when it is reached until its walk leaves. */
export function stepsTrackLines(track) {
  const gone = track.until + STEPS_TRACK.leave, backGone = track.flip ? track.flip.at : gone;
  return [...track.stations.map((s, i) => ({text: s.label, from: s.at, to: backGone, path: `stations[${i}]`})),
    ...(track.flip?.stations ?? []).map((s, i) => ({text: s.label, from: s.at, to: gone, path: `flip.stations[${i}]`}))];
}

/** A pill: the station's shape (filled, outlined, or dashed). */
function pill(c, x, y, w, {fill = null, stroke = null, dash = null, width = 2}) {
  c.beginPath(); c.roundRect(x - w / 2, y - PILL / 2, w, PILL, PILL / 2);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.save(); c.strokeStyle = stroke; c.lineWidth = width; if (dash) c.setLineDash(dash); c.stroke(); c.restore(); }
}

function drawStation(c, P, s, y, room) {
  const C = P.C, grow = s.state === 'ahead' ? 1 : 1 + .3 * (1 - spring(s.pop));
  c.save(); c.translate(s.x, y); c.scale(grow, grow);
  if (s.state === 'ahead') { c.fillStyle = C.faint ?? C.dim; c.beginPath(); c.arc(0, 0, 5.5, 0, Math.PI * 2); c.fill(); c.restore(); return; }
  if (s.state === 'next') {
    // What comes next is not known yet: a dashed outline (no fill: it hides nothing) around a "?".
    pill(c, 0, 0, 54, {stroke: C.accent, dash: [5, 5]});
    P.text('?', 0, 1, SIZE + 2, C.accent, {weight: 700});
    c.restore(); return;
  }
  const lit = s.state === 'current', weight = lit ? 700 : 600, sign = (lit ? 0 : 22) + (s.glyph ? 24 : 0);
  const textW = Math.min(P.measure(s.label, SIZE, {weight}), room - 28 - sign), w = textW + 28 + sign, left = -w / 2 + 14;
  pill(c, 0, 0, w, lit ? {fill: C.accent} : {fill: C.card ?? C.bg, stroke: C.edge, width: 1.5});
  const ink = lit ? C.bg : C.ink;
  if (!lit) { c.save(); c.strokeStyle = C.available; c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); shapes.tick(left + 8, 1, .62).forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py))); c.stroke(); c.restore(); }
  if (s.glyph) drawIcon(c, s.glyph, left + (lit ? 0 : 22) + 10, 0, .3, ink, 1.6);
  P.text(s.label, left + sign + textW / 2, 1, SIZE, ink, {weight, max: textW});
  c.restore();
}

/**
 * The track at t over whatever is drawn: the dotted path flowing the way the walk goes, the travelled part solid,
 * the playhead's glow (the recap's), the stations, and the mark at the band's start — ⏪ in the theme's reject red
 * while it walks back, turning over into ▶ in its available green at the flip.
 */
export function drawStepsTrack(c, P, track, t) {
  const st = stepsTrackAt(track, t);
  if (!st) return;
  const y = track.y, C = P.C;
  c.save(); c.globalAlpha *= st.alpha;
  c.save(); c.globalAlpha *= .55; c.strokeStyle = C.dim; c.lineWidth = 3; c.setLineDash([2, 10]); c.lineCap = 'round';
  c.lineDashOffset = (st.direction === 'back' ? 1 : -1) * t * 20;
  c.beginPath(); c.moveTo(MARK_X + 34, y); c.lineTo(X1, y); c.stroke(); c.restore();
  for (const w of st.walks) {
    c.save(); c.globalAlpha *= w.alpha;
    const start = w.stations[0].x;
    c.strokeStyle = C.accent; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(start, y); c.lineTo(w.head, y); c.stroke();
    const g = c.createRadialGradient(w.head, y, 0, w.head, y, 34);
    g.addColorStop(0, 'rgba(255,200,80,.9)'); g.addColorStop(1, 'rgba(255,200,80,0)'); c.fillStyle = g; c.fillRect(w.head - 34, y - 34, 68, 68);
    for (const s of w.stations) drawStation(c, P, s, y, w.room);
    c.restore();
  }
  const dir = st.mark === '⏪' ? 'back' : 'forward', mw = TRANSPORT_WIDTH[dir] * .5;
  c.save(); c.translate(MARK_X, y); c.scale(Math.max(st.turn, .002), 1);
  c.fillStyle = dir === 'back' ? (C.reject ?? C.accent) : (C.available ?? C.accent); c.beginPath(); c.arc(0, 0, 23, 0, Math.PI * 2); c.fill();
  drawTransport(c, dir, -mw * 1.2 / 2 + (dir === 'forward' ? 2 : 0), 0, .6, C.bg);
  c.restore();
  c.restore();
}
