/**
 * Director notes: a small, fixed set of camera words laid over a film without touching its beats.
 *
 *   {"note": "The zooms feel rushed", "speed": 0.7}           every camera move at 0.7× speed
 *   {"note": "Hard cut into the loop", "cut": "inside"}         the scene starts on a hard cut
 *   {"note": "Push in on the card", "push": {"at": [380, 490], "zoom": 1.3,
 *            "from": ["inside", "the order"], "to": ["inside", "twelve days"]}}
 *   {"note": "Close on the robot's question", "push": {"on": "robot", "size": "close",
 *            "from": ["click", "How do I know"], "to": ["click", "it's done"]}}
 *
 * A push names its target by a point (`at` and `zoom`) or by a NAME (`on` and `size`): a thing the world's
 * kit names in its regions (regionsAt → {name}), framed the way a camera crew frames a subject — medium,
 * close or insert — so the zoom follows from how big the thing is, never from a guessed number.
 * Every note carries its words (`note`) and exactly one camera word. A note the film cannot honour
 * refuses the recipe, and every note is written into the making-of record.
 */
import {inOut as ease} from './ease.mjs';

const WORDS = ['speed', 'cut', 'push'];
const NOTE_KEYS = new Set(['note', ...WORDS]);
const PUSH_KEYS = new Set(['at', 'zoom', 'on', 'size', 'from', 'to', 'seconds']);
/**
 * Framing a named thing: how much of the frame it fills (the larger of its width and height shares).
 * medium: half; close: about three quarters; insert: nearly all of it (a detail).
 */
export const FRAMINGS = Object.freeze({medium: .5, close: .72, insert: .9});
const ZOOM = Object.freeze([1.05, 3]);

/**
 * Read a recipe's notes. Returns {speed, speedNote, cuts: Map(sceneId → note), pushes: [note]}.
 * Only the shape is checked here; the film checks each note against itself (see film.mjs).
 */
export function readNotes(notes = []) {
  if (!Array.isArray(notes)) throw new Error('notes must be a list of director notes');
  const read = {speed: 1, speedNote: null, cuts: new Map(), pushes: []};
  notes.forEach((n, i) => {
    if (!n || typeof n !== 'object' || Array.isArray(n)) throw new Error(`note ${i} must be {"note": "…", and one of ${WORDS.join(', ')}}`);
    for (const key of Object.keys(n)) if (!NOTE_KEYS.has(key)) throw new Error(`note ${i} has unsupported key ${key}; the camera words are ${WORDS.join(', ')}`);
    if (typeof n.note !== 'string' || !n.note.trim()) throw new Error(`note ${i} needs its words ("note": "…"), so the making-of record says what was asked`);
    const words = WORDS.filter(w => n[w] !== undefined);
    if (words.length !== 1) throw new Error(`note "${n.note}" needs exactly one camera word (${WORDS.join(', ')}); it has ${words.length ? words.join(' and ') : 'none'}`);
    if (words[0] === 'speed') readSpeed(n, read);
    else if (words[0] === 'cut') readCut(n, read);
    else readPush(n, read);
  });
  return read;
}

function readSpeed(n, read) {
  if (!(typeof n.speed === 'number' && n.speed >= .25 && n.speed <= 4)) throw new Error(`note "${n.note}": speed must be a number between 0.25 and 4`);
  if (read.speedNote) throw new Error(`note "${n.note}": the film already has a speed ("${read.speedNote.note}"); one speed for the whole film`);
  read.speed = n.speed; read.speedNote = n;
}

function readCut(n, read) {
  if (typeof n.cut !== 'string' || !n.cut) throw new Error(`note "${n.note}": cut names a scene (its id)`);
  if (read.cuts.has(n.cut)) throw new Error(`note "${n.note}": scene ${n.cut} already has a cut ("${read.cuts.get(n.cut).note}")`);
  read.cuts.set(n.cut, n);
}

function readPush(n, read) {
  const p = n.push, where = `note "${n.note}": push`;
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error(`${where} must be {at, zoom, from, to} or {on, size, from, to}`);
  for (const key of Object.keys(p)) if (!PUSH_KEYS.has(key)) throw new Error(`${where} has unsupported key ${key}`);
  if ((p.at === undefined) === (p.on === undefined)) throw new Error(`${where} aims at a point (at) or at a named thing (on), exactly one of them`);
  if (p.on !== undefined) {
    if (typeof p.on !== 'string' || !p.on.trim()) throw new Error(`${where}.on names a thing in the picture (a name its kit gives in regionsAt), e.g. "robot"`);
    if (p.zoom !== undefined) throw new Error(`${where}: a push on "${p.on}" takes its zoom from size (${Object.keys(FRAMINGS).join(', ')}), not from zoom`);
    if (p.size !== undefined && !Object.hasOwn(FRAMINGS, p.size)) throw new Error(`${where}.size is ${Object.keys(FRAMINGS).join(', ')} (how much of the frame "${p.on}" fills), not ${JSON.stringify(p.size)}${p.size === 'wide' ? '; wide is the shot itself, so leave the push out' : ''}`);
  } else {
    if (!(Array.isArray(p.at) && p.at.length === 2 && p.at.every(Number.isFinite) && p.at[0] >= 0 && p.at[0] <= 1600 && p.at[1] >= 0 && p.at[1] <= 900)) throw new Error(`${where}.at must be [x, y] on the 1600×900 frame`);
    if (p.size !== undefined) throw new Error(`${where}: size frames a named thing (on); a push at a point takes zoom`);
  }
  if (p.zoom !== undefined && !(typeof p.zoom === 'number' && p.zoom > 1 && p.zoom <= 3)) throw new Error(`${where}.zoom must be above 1 and at most 3`);
  if (p.seconds !== undefined && !(typeof p.seconds === 'number' && p.seconds >= .2 && p.seconds <= 3)) throw new Error(`${where}.seconds (the ease in and out) must be between 0.2 and 3`);
  if (!p.from || !p.to) throw new Error(`${where} needs from and to: the phrases it starts and ends on`);
  read.pushes.push(n);
}

/**
 * Put the pushes on the film's clock and check each against the film: a push never runs across a
 * change of picture (a hand-over, an entrance, a cut, the push-in, the teaser), never while a
 * spotlight shows, and never over another push — one camera move at a time.
 * @param changes    [{from, to, what}] in seconds (a cut is a change with from === to)
 * @param spotlight  t → the name of the world whose spotlight shows at t, or null
 * @param named      (name, t) → the box [x0, y0, x1, y1] on the frame of the thing called `name` at t; it
 *                   refuses (naming what is there) when nothing or more than one thing has the name
 * @returns [{given (the note as written), note, at, zoom, on?, size?, a, b, seconds}] — in at a, out from b, each ease `seconds` long
 */
export function placePushes(pushes, {clock, speed, changes, spotlight, total, named}) {
  const placed = pushes.map(n => {
    const p = n.push, seconds = (p.seconds ?? 1) / speed, a = clock.at(p.from), b = clock.at(p.to), end = b + seconds;
    const aim = p.on === undefined ? {at: p.at, zoom: p.zoom ?? 1.25} : framing(n, boxOf(n, named, a));
    if (!(b > a)) throw new Error(`note "${n.note}": the push must end on a phrase after the one it starts on`);
    if (end > total) throw new Error(`note "${n.note}": the push eases out after the film ends`);
    for (const c of changes) if (a < c.to && end > c.from) throw new Error(`note "${n.note}": the push runs from ${a.toFixed(2)} s to ${end.toFixed(2)} s, across ${c.what} (${c.from.toFixed(2)} s); a push stays on one picture`);
    for (let t = a; t < end; t += .05) { const lit = spotlight(t); if (lit) throw new Error(`note "${n.note}": the push runs over ${lit}'s spotlight at ${t.toFixed(2)} s; one camera move at a time`); }
    return {given: n, note: n.note, ...aim, a, b, seconds};
  }).sort((x, y) => x.a - y.a);
  placed.forEach((p, i) => { const q = placed[i + 1]; if (q && q.a < p.b + p.seconds) throw new Error(`note "${q.note}": its push starts while "${p.note}" is still pushing; one camera move at a time`); });
  return placed;
}

/** The named thing's box at the push's start, or a refusal that says which note asked. */
function boxOf(n, named, t) {
  if (typeof named !== 'function') throw new Error(`note "${n.note}": a push on a named thing needs the film's regions (placePushes takes named)`);
  try { return named(n.push.on, t); } catch (error) { throw new Error(`note "${n.note}": ${error.message}`, {cause: error}); }
}

/**
 * Where a push on a named thing aims, and how far: the box's middle, and the zoom that makes the box fill
 * the framing's share of the frame (FRAMINGS), between 1.05 and 3. A thing already that big refuses.
 */
function framing(n, box) {
  const p = n.push, size = p.size ?? 'medium', [x0, y0, x1, y1] = box, w = x1 - x0, h = y1 - y0;
  const share = Math.max(w / 1600, h / 900), zoom = FRAMINGS[size] / share, pct = v => `${Math.round(v * 100)}%`;
  const work = Object.keys(FRAMINGS).filter(s => FRAMINGS[s] / share >= ZOOM[0] && FRAMINGS[s] / share <= ZOOM[1]);
  if (!(zoom >= ZOOM[0])) {
    throw new Error(`note "${n.note}": "${p.on}" already fills ${pct(share)} of the frame, so a ${size} framing would not push in; ${work.length ? `a ${work.join(' or ')} framing would` : 'no framing pushes in on it: leave the push out, or push on a smaller named thing'}`);
  }
  if (zoom > ZOOM[1]) throw new Error(`note "${n.note}": "${p.on}" fills ${pct(share)} of the frame; a ${size} framing needs ×${zoom.toFixed(1)}, more than the ×${ZOOM[1]} a push goes to (it would fill ${pct(share * ZOOM[1])}, not ${pct(FRAMINGS[size])}): ${work.length ? `a ${work.join(' or ')} framing would; or ` : ''}frame a larger named thing, or push at a point with at and zoom`);
  const at = [Math.max(0, Math.min(1600, (x0 + x1) / 2)), Math.max(0, Math.min(900, (y0 + y1) / 2))].map(v => Math.round(v));
  return {at, zoom: +zoom.toFixed(3), on: p.on, size};
}

/**
 * The push camera at t: {sx, sy, z, tx, ty} (translate to (tx, ty), scale z, about (sx, sy)), or null.
 * The point moves toward the centre as far as the frame allows: the picture always covers the frame.
 */
export function pushAt(pushes, t) {
  for (const p of pushes) {
    const w = Math.min(ease((t - p.a) / p.seconds), 1 - ease((t - p.b) / p.seconds));
    if (!(w > 0)) continue;
    const [sx, sy] = p.at, z = 1 + (p.zoom - 1) * w;
    const tx = Math.min(sx * z, Math.max(1600 - (1600 - sx) * z, sx + (800 - sx) * w));
    const ty = Math.min(sy * z, Math.max(900 - (900 - sy) * z, sy + (450 - sy) * w));
    return {sx, sy, z, tx, ty};
  }
  return null;
}
