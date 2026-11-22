/**
 * read — an isometric world's recipe entry, checked: every refusal names the entry (`stage map: isometric
 * blocks[2] ("db")`) and the fix. Plain data in, plain data out; nothing is placed or drawn here.
 *
 * The words are StoryDeck's (README "Blocks on a floor"), as data: a deck's `data-k` is `name`, `data-iso` is `kind`,
 * `data-at`/`data-size` are `at`/`size`, `data-iso-group` is `group`, `data-ports` is `ports`, a block's `<b>` and
 * `<small>` are `label` and `small`, its `data-break` is `break`, a floor's `data-label` is `label`, a wire's `data-arrow="lap.rj45 to sw.p1"` is
 * `arrow` (the same grammar, a trailing bend "0" drawing it straight), and `data-head`, `data-packets`, `data-speed`,
 * `data-ride`, `data-rest`, `data-trail`, `data-behind` are `head`, `packets`, `speed`, `ride`, `rest`, `trail`,
 * `behind`. WHY the same words: a map written for a deck is written for a film by moving its attributes into keys.
 *
 * What a film adds: `appear` (when a piece comes in: an anchor, [scene, phrase, plus?]) and a wire's `start` (when its
 * packets begin to ride) — a deck has clicks for both; a film has its voice.
 *
 * `style` is footprint-story's style row as it is (`isoStyle`: a named choice per column), checked here only so a
 * refusal names the recipe entry; the choices and their options are footprint-story's, never listed again here.
 */
import {readPorts, readThing, isoStyle, ISO_STYLE_COLUMNS, ISO_STYLE_CHOICES, MOST_FLOOR_LABEL, MOST_ROUTES} from 'footprint-story/isometric';
import {MOST_EASE} from 'footprint-story/motion';
import {BREAK_RULES} from 'footprint-story/layout';

/** The keys an isometric world takes (beside `kit`), each piece's keys, and the limits. */
export const WORLD_KEYS = Object.freeze(['kit', 'blocks', 'floors', 'wires', 'grid', 'area', 'style', 'strict']);
const BLOCK_KEYS = Object.freeze(['name', 'kind', 'at', 'size', 'label', 'small', 'break', 'color', 'tone', 'group', 'ports', 'appear']);
const FLOOR_KEYS = Object.freeze(['name', 'at', 'size', 'label', 'color', 'group', 'appear']);
const WIRE_KEYS = Object.freeze(['name', 'arrow', 'label', 'head', 'packets', 'speed', 'ride', 'rest', 'trail', 'behind', 'appear', 'start']);
const GRID_KEYS = Object.freeze(['tile', 'at', 'rise']);
export const KINDS = Object.freeze(['block', 'cylinder']);
export const TONES = Object.freeze(['ok', 'warn', 'bad']);
/**
 * The limits, StoryDeck's where it has one: 256 pieces a map (iso.js · MOST_ISO_PIECES), 6 packets a wire and a run
 * of 0.5 to 60 s (transforms.js, rides.js), a rest of at most 60 s, a trail 0.5 to 24 px wide; a block a 2 × 2 × 1
 * when it gives no size (iso.js · USUAL_SIZE); a run 3 s when the wire gives no speed (transforms.js · wireOptions).
 */
export const ISO_LIMITS = Object.freeze({pieces: 256, packets: 6, seconds: Object.freeze([0.5, 60]), rest: 60, trail: Object.freeze([0.5, 24]),
  label: 120, wireLabel: 60, name: 64, usualSize: Object.freeze([2, 2, 1]), runSeconds: 3});
/** The one hex-colour rule (draw.mjs reads it too). */
export const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
/** The most entries a list the world holds may have before it is read (a port list, an at, a trail): far past any map. */
const MOST_ITEMS = 4096;
/** A name a wire's arrow can say: letters, digits, `_` and `-` — no space and no dot (the dot names a port: "sw.p1"). */
const NAME = /^[\p{L}\p{N}_-]+$/u;
/** A label is plain words: a control, a direction mark or a character that draws nothing reads differently on screen and in a note. */
const UNPLAIN = /\p{Cc}|(?!\u{200D})\p{Cf}|[\uD800-\uDFFF]/u;
/** What folds to one space in a label: tabs, line ends, and the line and paragraph separators (U+2028, U+2029). */
const FOLD = /[\t\n\r\p{Zl}\p{Zp}]+/gu;

const own = (o, k) => Object.hasOwn(o, k) && o[k] !== undefined;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const nums = (v, lengths) => Array.isArray(v) && lengths.includes(v.length) && v.every(Number.isFinite);
/** A value as a refusal quotes it: JSON, at most 60 characters, one line (a value thousands of letters long gives a short refusal). */
export const shown = (v) => {
  let s; try { s = JSON.stringify(v) ?? String(v); } catch { s = Object.prototype.toString.call(v); }
  s = s.replace(/[\p{Zl}\p{Zp}]/gu, ' ');
  return s.length > 60 ? `${s.slice(0, 59)}…` : s;
};

/** A refusal raised while a value is copied as plain data: passed on as it is, never wrapped twice. */
class PlainRefusal extends Error {}
/** One own field's value, never through a getter. */
function field(o, k, who) {
  const d = Object.getOwnPropertyDescriptor(o, k);
  if (!d) return undefined;
  if (d.get || d.set) throw new PlainRefusal(`${who} is a getter — write it as a plain value (JSON)`);
  return d.value;
}
/**
 * A recipe value copied as plain data, each field read once by its own value: a getter is never run (refused, in
 * words), a list longer than MOST_ITEMS is refused before its entries are read, and what throws while it is read
 * (a proxy's trap) is refused naming the entry. WHY: the kit reads a field more than once (to check it, then to use
 * it); a getter could answer differently each time, and its throw would surface as someone else's error.
 */
function plain(v, who, depth = 0) {
  if (v === null || typeof v !== 'object') return v;
  try {
    if (depth > 6) throw new PlainRefusal(`${who} is nested too deeply — write a world's entries as plain data a few levels deep`);
    if (Array.isArray(v)) {
      const n = Object.getOwnPropertyDescriptor(v, 'length').value;
      if (n > MOST_ITEMS) throw new PlainRefusal(`${who} is a list of at most ${MOST_ITEMS} entries — this one has ${n}`);
      const items = Array.from({length: n}, (_, i) => plain(field(v, String(i), `${who}[${i}]`), `${who}[${i}]`, depth + 1));
      // a list of plain words and numbers, every entry read by its own value, is handed on as itself: the film knows an
      // anchor (["map", "the API"]) by the very list the recipe wrote, to name its entry in the record (film/clock.mjs)
      return items.every((x) => x === null || typeof x !== 'object') ? v : items;
    }
    const keys = Object.keys(v);
    if (keys.length > MOST_ITEMS) throw new PlainRefusal(`${who} has at most ${MOST_ITEMS} keys — this one has ${keys.length}`);
    return Object.fromEntries(keys.map((k) => { const at = `${who}.${shown(k).slice(1, -1)}`; return [k, plain(field(v, k, at), at, depth + 1)]; }));
  } catch (e) {
    if (e instanceof PlainRefusal) throw e;
    throw new PlainRefusal(`${who} could not be read as plain data (${shown(String(e?.message ?? e))}) — write it as JSON`, {cause: e});
  }
}
/** An at as an anchor is written: [scene, phrase, plus?] or {scene, phrase, …} (the clock checks the phrase). */
export const anchorLike = (a) => (Array.isArray(a) ? a.length >= 2 && a.length <= 3 && typeof a[0] === 'string' && typeof a[1] === 'string' && (a.length === 2 || Number.isFinite(a[2]))
  : isObject(a) && typeof a.scene === 'string' && typeof a.phrase === 'string');

function keysOf(o, keys, who) {
  if (!isObject(o)) throw new Error(`${who} is an object of ${keys.join(', ')} — not ${shown(o)}`);
  for (const k of Object.keys(o)) if (!keys.includes(k)) throw new Error(`${who} takes ${keys.join(', ')} — not "${k}"`);
}
function words(v, who, key, most) {
  if (v === undefined) return null;
  if (typeof v !== 'string' || !v.trim()) throw new Error(`${who}: ${key} is words ("Server") — not ${shown(v)}`);
  const text = v.replace(FOLD, ' ').trim();
  if ([...text].length > most) throw new Error(`${who}: ${key} is at most ${most} letters — this one has ${[...text].length}: shorten it`);
  if (UNPLAIN.test(text)) throw new Error(`${who}: ${key} is plain words — take out the control or direction character in it`);
  return text;
}
function appearOf(v, who, key = 'appear') {
  if (v === undefined) return null;
  if (!anchorLike(v)) throw new Error(`${who}: ${key} is an anchor, ["scene", "phrase"] (or ["scene", "phrase", seconds after]) — not ${shown(v)}`);
  return v;
}
function nameOf(v, who, required) {
  if (v === undefined && !required) return null;
  if (typeof v !== 'string' || !NAME.test(v) || [...v].length > ISO_LIMITS.name) throw new Error(`${who}: name is one word a wire's arrow can say (letters, digits, _ and -, at most ${ISO_LIMITS.name}; no space, no dot: the dot names a port) — not ${shown(v)}`);
  return v;
}
function groupOf(v, who) {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || !v.trim()) throw new Error(`${who}: group names the group it belongs to ("backend") — not ${shown(v)}`);
  return words(v, who, 'group', 100);
}

/** One block (or cylinder), checked: {name, kind, at|null, size, label, small, rule|null, color, tone, group, ports, appear, path, who}. */
function readBlock(b, i, where) {
  const path = `blocks[${i}]`, first = `${where}: isometric ${path}`;
  keysOf(b, BLOCK_KEYS, first);
  const name = nameOf(b.name, first, true), who = `${first} ("${name}")`;
  const kind = b.kind ?? 'block';
  if (!KINDS.includes(kind)) throw new Error(`${who}: kind is ${KINDS.join(' or ')} — not ${shown(b.kind)}`);
  const size = own(b, 'size') ? b.size : [...ISO_LIMITS.usualSize];
  if (!nums(size, [3])) throw new Error(`${who}: size is [wide, deep, high] in tiles ([2, 2, 1]) — not ${shown(b.size)}`);
  if (own(b, 'at') && !nums(b.at, [2, 3])) throw new Error(`${who}: at is where it stands, [col, row] on the floor (a third number lifts it) — not ${shown(b.at)}`);
  const at = own(b, 'at') ? [b.at[0], b.at[1], b.at[2] ?? 0] : null;
  try { readThing({at: at ?? [0, 0], size}, `a ${kind}`); } catch (e) { throw new Error(`${who}: ${e.message.replace(/^isometric: /, '')}`, {cause: e}); }
  // exactly equal, as footprint-story's map spec reads a cylinder (0.39.0: a billionth apart passed here, and the grid then refused it)
  if (kind === 'cylinder' && size[0] !== size[1]) throw new Error(`${who}: a cylinder is round — its size is [wide, wide, high], the same width and depth (not ${shown(size)})`);
  if (own(b, 'color') && !HEX.test(b.color)) throw new Error(`${who}: color is a hex colour ("#bcd6f3") — its top is drawn lighter and its sides darker; not ${shown(b.color)}`);
  if (own(b, 'tone') && !TONES.includes(b.tone)) throw new Error(`${who}: tone is ${TONES.join(', ')} (the theme's colours for each) — not ${shown(b.tone)}`);
  if (own(b, 'color') && own(b, 'tone')) throw new Error(`${who}: give it a color or a tone, not both`);
  const small = words(b.small, who, 'small', ISO_LIMITS.label), label = words(b.label, who, 'label', ISO_LIMITS.label);
  if (small && !label) throw new Error(`${who}: small is the line under its label — give it a label too`);
  // how its label breaks onto two lines: a deck's data-break, footprint-story's named rules ("even" the usual)
  if (own(b, 'break') && !BREAK_RULES.includes(b.break)) throw new Error(`${who}: break is ${BREAK_RULES.map((r) => `"${r}"`).join(' or ')} — "fill" sets the label's first line as full as it goes, "even" (the usual) makes the two lines alike; not ${shown(b.break)}`);
  if (own(b, 'break') && !label) throw new Error(`${who}: break says how its label breaks onto two lines — give it a label too`);
  let ports = [];
  if (own(b, 'ports')) {
    if (!Array.isArray(b.ports)) throw new Error(`${who}: ports is a list, [{"name": "p1", "at": [x, y, z]}] in its own tiles (x along its width, y along its depth, z up from its base)`);
    b.ports.forEach((p, k) => { keysOf(p, ['name', 'at', 'face'], `${who}: ports[${k}]`); nameOf(p.name, `${who}: ports[${k}]`, true); });
    try { ports = readPorts(b.ports, size, kind === 'cylinder', `"${name}"`).map(({name: n, at: a, face, seen}) => ({name: n, at: [...a], face, seen})); } catch (e) {
      throw new Error(`${who}: ${e.message.replace(/^isometric: /, '')}`, {cause: e});
    }
  }
  return {name, kind, at, size: [...size], label, small, rule: own(b, 'break') ? b.break : null, color: b.color ?? null, tone: b.tone ?? null, group: groupOf(b.group, who), ports, appear: appearOf(b.appear, who), path, who};
}

/** One floor, checked: {name, at|null, size|null, label, color, group, appear, path, who}. */
function readFloor(f, i, where) {
  const path = `floors[${i}]`, first = `${where}: isometric ${path}`;
  keysOf(f, FLOOR_KEYS, first);
  const name = nameOf(f.name, first, false), who = name ? `${first} ("${name}")` : first;
  if (own(f, 'size') && !(nums(f.size, [2]) && f.size.every((n) => Number.isInteger(n) && n >= 1 && n <= 256))) throw new Error(`${who}: size is [cols, rows], whole numbers 1 to 256 — not ${shown(f.size)}`);
  if (own(f, 'at') && !(nums(f.at, [2]) && f.at.every((n) => Math.abs(n) <= 1e6))) throw new Error(`${who}: at is its far corner, [col, row], no number further than 1000000 from 0 — not ${shown(f.at)}`);
  if (own(f, 'at') && !own(f, 'size')) throw new Error(`${who}: a floor with an at needs its size too ([8, 5]) — or give neither, and it is fitted round the blocks`);
  if (own(f, 'color') && !HEX.test(f.color)) throw new Error(`${who}: color is a hex colour for its ground ("#eef3f8") — not ${shown(f.color)}`);
  return {name, at: own(f, 'at') ? [...f.at] : own(f, 'size') ? [0, 0] : null, size: own(f, 'size') ? [...f.size] : null, label: words(f.label, who, 'label', MOST_FLOOR_LABEL),
    color: f.color ?? null, group: groupOf(f.group, who), appear: appearOf(f.appear, who), path, who};
}

/**
 * A wire's arrow, as StoryDeck reads `data-arrow`: "from to to", each end a block's name or "block.port", and a
 * trailing number (a bend) that draws it straight: {from: {block, port}, to: {block, port}, straight}.
 */
export function readArrow(arrow, who, blocks) {
  const form = '"you to server" (a block\'s name, or "block.port", at each end; a bend after it, "you to server 0", draws it straight, "you to server 40" curved 40 px)';
  if (typeof arrow !== 'string') throw new Error(`${who}: arrow is ${form} — not ${shown(arrow)}`);
  const m = /^\s*(\S+)\s+to\s+(\S+)(?:\s+(-?\d+(?:\.\d+)?))?\s*$/.exec(arrow);
  if (!m) throw new Error(`${who}: arrow is ${form} — not ${shown(arrow)}`);
  const list = (names) => shown(names.join(', ') || 'none').slice(1, -1);
  const end = (text) => {
    const byName = blocks.find((b) => b.name === text);
    if (byName) return {block: byName, port: null};
    const dot = text.lastIndexOf('.'), block = dot > 0 ? blocks.find((b) => b.name === text.slice(0, dot)) : null;
    if (!block) throw new Error(`${who}: arrow ${shown(arrow)} names ${shown(text.slice(0, dot > 0 ? dot : undefined))}, which is no block here — the blocks are ${list(blocks.map((b) => b.name))}`);
    const port = text.slice(dot + 1);
    if (!block.ports.some((p) => p.name === port)) throw new Error(`${who}: arrow ${shown(arrow)}: ${block.name} has no port ${shown(port)} — ${block.ports.length ? `its ports are ${list(block.ports.map((p) => p.name))}` : 'give it ports ([{"name": "p1", "at": [x, y, z]}])'}`);
    return {block, port};
  };
  const from = end(m[1]), to = end(m[2]);
  if (from.block === to.block) throw new Error(`${who}: arrow ${shown(arrow)} joins ${from.block.name} to itself — name another block at one end ("arrow": "${from.block.name} to ${blocks.find((b) => b !== from.block)?.name ?? 'other'}")`);
  const bend = m[3] === undefined ? null : Number(m[3]);
  // StoryDeck's rule (deck/transforms.js): a wire to a port runs along the floor, and a bend draws it straight
  if (bend !== null && (from.port || to.port)) throw new Error(`${who}: arrow ${shown(arrow)}: a wire to a port runs along the floor, and a bend draws it straight — take the bend out`);
  if (bend !== null && Math.abs(bend) > 2000) throw new Error(`${who}: arrow ${shown(arrow)}: a bend is how far the wire curves off its straight line, -2000 to 2000 px — not ${bend}`);
  return {from, to, straight: bend !== null, bend: bend ?? 0};
}

/** One wire, checked: {name, arrow, label, head, packets, seconds|null, perSecond|null, ride, rest, trail, behind, appear, start, path, who}. */
function readWire(w, i, where, blocks) {
  const path = `wires[${i}]`, first = `${where}: isometric ${path}`;
  keysOf(w, WIRE_KEYS, first);
  const name = nameOf(w.name, first, false), who = `${first}${name ? ` ("${name}")` : typeof w.arrow === 'string' ? ` (${shown(w.arrow.trim()).slice(1, -1)})` : ''}`;
  const arrow = readArrow(w.arrow, who, blocks);
  if (own(w, 'head') && w.head !== 'none') throw new Error(`${who}: head is "none" for a plain line that runs its whole length — or leave it out for an arrow's head`);
  const packets = w.packets ?? 0, [least, most] = ISO_LIMITS.seconds;
  if (!(Number.isInteger(packets) && packets >= 0 && packets <= ISO_LIMITS.packets)) throw new Error(`${who}: packets is how many ride it, a whole number 0 to ${ISO_LIMITS.packets} — not ${shown(w.packets)}`);
  for (const key of ['speed', 'ride', 'rest', 'trail', 'behind', 'start']) if (own(w, key) && !packets) throw new Error(`${who}: ${key} says how its packets ride — give it packets too`);
  // a speed is the seconds a run takes (3), or its px a second written "260px" (the run then takes the line's length over it)
  let seconds = null, perSecond = null;
  if (own(w, 'speed')) {
    const px = typeof w.speed === 'string' ? /^\s*(\d+(?:\.\d+)?|\.\d+)px(?:\/s)?\s*$/.exec(w.speed) : null;
    if (px && Number(px[1]) > 0) perSecond = Number(px[1]);
    else if (Number.isFinite(w.speed) && w.speed >= least && w.speed <= most) seconds = w.speed;
    else throw new Error(`${who}: speed is the seconds a packet takes to ride it, ${least} to ${most} (3), or its speed in px a second ("260px") — not ${shown(w.speed)}`);
  } else if (packets) seconds = ISO_LIMITS.runSeconds;
  // a ride eases out of its start and into its end over shares of the line's length: [0.15, 0.2], or one number for both
  let ride = [0, 0];
  if (own(w, 'ride')) {
    const ends = Number.isFinite(w.ride) ? [w.ride, w.ride] : w.ride;
    if (!(nums(ends, [2]) && ends.every((e) => e >= 0 && e <= MOST_EASE))) throw new Error(`${who}: ride is the shares of its length a packet eases over out of its start and into its end, each 0 to ${MOST_EASE}: [0.15, 0.2] (one number for both) — not ${shown(w.ride)}`);
    ride = [...ends];
  }
  if (own(w, 'rest') && !(Number.isFinite(w.rest) && w.rest >= 0 && w.rest <= ISO_LIMITS.rest)) throw new Error(`${who}: rest is the seconds a packet stays at the end when it arrives, 0 to ${ISO_LIMITS.rest} — not ${shown(w.rest)}`);
  let trail = null;
  if (own(w, 'trail')) {
    keysOf(w.trail, ['width', 'color'], `${who}: trail`);
    const [lo, hi] = ISO_LIMITS.trail;
    if (!(Number.isFinite(w.trail.width) && w.trail.width >= lo && w.trail.width <= hi) || !HEX.test(w.trail.color ?? '')) throw new Error(`${who}: trail is a line behind each packet, {"width": 3, "color": "#4a7bd0"} — ${lo} to ${hi} px wide, a hex colour`);
    trail = {width: w.trail.width, color: w.trail.color};
  }
  if (own(w, 'behind') && w.behind !== 'fade') throw new Error(`${who}: behind takes "fade" (where its cable runs behind a block its packets fade out and come back after it) — not ${shown(w.behind)}`);
  return {name, arrow, label: words(w.label, who, 'label', ISO_LIMITS.wireLabel), head: w.head !== 'none', packets, seconds, perSecond, ride, rest: own(w, 'rest') ? w.rest : null,
    trail, behind: w.behind === 'fade', appear: appearOf(w.appear, who), start: appearOf(w.start, who, 'start'), path, who};
}

/** The grid as written: "fit" (the default), or {tile, at, rise?} — a tile's width in px (or [width, height]), where the floor's far corner stands. */
function readGrid(g, where) {
  if (g === undefined || g === 'fit') return null;
  const who = `${where}: isometric grid`;
  keysOf(g, GRID_KEYS, who);
  const tile = g.tile, sides = Number.isFinite(tile) ? [tile, tile / 2] : tile;
  if (!(nums(sides, [2]) && sides[0] >= 8 && sides[0] <= 2000 && sides[1] > 0 && sides[1] <= sides[0])) throw new Error(`${who}: tile is a tile's width in px, 8 to 2000 (120), or [width, height] for another angle, the height above 0 and no more than the width — not ${shown(tile)}`);
  if (!(nums(g.at, [2]) && g.at.every((n) => Math.abs(n) <= 1e6))) throw new Error(`${who}: at is where the floor's far corner stands on the frame, [x, y], no number further than 1000000 from 0 — not ${shown(g.at)}`);
  if (own(g, 'rise') && !(Number.isFinite(g.rise) && g.rise > 0 && g.rise <= 5000)) throw new Error(`${who}: rise is a unit of height in px, above 0 and at most 5000 — not ${shown(g.rise)}`);
  return {tile, origin: [...g.at], ...(own(g, 'rise') ? {rise: g.rise} : {})};
}

/** A choice's names as a refusal lists them: "ink" or "none"; "a", "b" or "c". */
const either = (names) => names.map((n) => `"${n}"`).join(', ').replace(/, ([^,]*)$/, ' or $1');

/**
 * The world's style as written, or null (today's look): a row of footprint-story's named choices, one per column —
 * `{"line": {"name": "ink", "width": 5}}`, `{"line": "none"}` — a column left out its usual choice. Handed to the map
 * build as it is (build.mjs · specOf); footprint-story's `isoStyle` makes the style from it.
 *
 * WHY the columns and the choices' names are checked here, from footprint-story's own lists (ISO_STYLE_COLUMNS,
 * ISO_STYLE_CHOICES): a wrong word is the commonest mistake, and its refusal should name this entry and list the words
 * there are, in the kit's words. What only a choice knows (its options, their ranges, a pairing that cannot work) is
 * left to `isoStyle`, run once here so its refusal too comes back in the entry's name, before anything is built.
 */
function readStyle(s, where) {
  if (s === undefined) return null;
  const who = `${where}: isometric style`, columns = ISO_STYLE_COLUMNS.join(', ');
  if (!isObject(s)) throw new Error(`${who} is a row of style choices, a column each ({"line": {"name": "ink", "width": 5}} for an outlined look, {"line": "none"} for none): the columns are ${columns} — not ${shown(s)}`);
  for (const k of Object.keys(s)) if (!ISO_STYLE_COLUMNS.includes(k)) throw new Error(`${who} takes the columns ${columns} (a column left out keeps today's look) — not ${shown(k)}`);
  // one entry: a choice's name, or {name, …its options}; its name one of the column's choices
  const entry = (v, column, at) => {
    const names = ISO_STYLE_CHOICES[column];
    const name = typeof v === 'string' ? v : isObject(v) ? v.name : undefined;
    if (typeof name !== 'string') throw new Error(`${who}: ${at} is a choice's name, or {"name": …, its options} — the ${column} choices are ${names.length ? either(names) : 'none yet'}; not ${shown(v)}`);
    if (!names.includes(name)) throw new Error(`${who}: ${at} has no choice ${shown(name)} — ${names.length ? `the ${column} choices are ${either(names)}` : `there are no ${column} yet: leave ${column} out`}`);
  };
  for (const column of ISO_STYLE_COLUMNS) {
    if (!own(s, column)) continue;
    if (column !== 'effects') { entry(s[column], column, column); continue; }
    if (!Array.isArray(s.effects)) throw new Error(`${who}: effects is a list of effects, each adding to the whole — not ${shown(s.effects)}`);
    s.effects.forEach((e, i) => entry(e, 'effects', `effects[${i}]`));
  }
  // footprint-story's own check: each choice's options (a width from 0.5 to 20 px …) and the pairings that cannot work
  try { isoStyle(s); } catch (e) { throw new Error(`${who}: ${String(e?.message ?? e).replace(/^isometric: /, '').replace(/^the style's /, '')}`, {cause: e}); }
  // a copy: the spec is frozen at every level (build.mjs), and a list the recipe wrote is handed on as itself by plain()
  return structuredClone(s);
}

/** The world's entry, checked: {blocks, floors, wires, grid, area, style, strict}. `where` names the recipe entry (`stage map`, `the story`). */
export function readMap(given, where) {
  const top = `${where}: the isometric world`;
  if (!isObject(given)) throw new Error(`${top} is an object of ${WORLD_KEYS.join(', ')} — not ${shown(given)}`);
  // the lists' lengths first, by their own values: a world of a million wires is refused before one is read
  const length = (key) => {
    const v = field(given, key, `${where}: isometric ${key}`);
    if (v === undefined) return 0;
    if (!Array.isArray(v)) throw new Error(`${where}: isometric ${key} is a list — not ${shown(v)}`);
    return Object.getOwnPropertyDescriptor(v, 'length').value;
  };
  const counts = {blocks: length('blocks'), floors: length('floors'), wires: length('wires')};
  if (counts.blocks + counts.floors > ISO_LIMITS.pieces) throw new Error(`${where}: an isometric world holds at most ${ISO_LIMITS.pieces} blocks and floors, and this one has ${counts.blocks + counts.floors} — split it into two worlds`);
  if (counts.wires > MOST_ROUTES) throw new Error(`${where}: an isometric world lays at most ${MOST_ROUTES} wires, and this one has ${counts.wires} — split it into two worlds`);
  const spec = plain(given, `${where}: isometric`);
  keysOf(spec, WORLD_KEYS, top);
  const blocks = (spec.blocks ?? []).map((b, i) => readBlock(b, i, where));
  if (!blocks.length) throw new Error(`${where}: an isometric world draws blocks on a floor — give it blocks: [{"name": "you"}, {"name": "server"}]`);
  const floors = (spec.floors ?? []).map((f, i) => readFloor(f, i, where));
  const wires = (spec.wires ?? []).map((w, i) => readWire(w, i, where, blocks));
  // one name, one piece: a camera frames a piece by its name, and a wire's arrow says it
  const named = [...blocks, ...floors, ...wires].filter((p) => p.name);
  for (const [k, p] of named.entries()) {
    const other = named.findIndex((q) => q.name === p.name);
    if (other !== k) throw new Error(`${p.who}: "${p.name}" is the name of ${named[other].path} too — a camera frames a piece by its name, so give each its own`);
  }
  // all or none: the build does not guess where unplaced blocks go among placed ones (StoryDeck's rule)
  const unplaced = blocks.filter((b) => b.at === null);
  if (unplaced.length && unplaced.length < blocks.length) {
    throw new Error(`${where}: isometric ${unplaced.map((b) => `"${b.name}"`).join(', ')} ${unplaced.length === 1 ? 'has' : 'have'} no at and ${blocks.filter((b) => b.at).map((b) => `"${b.name}"`).join(', ')} ${blocks.length - unplaced.length === 1 ? 'has' : 'have'} one: the blocks are placed from the wires only when none has an at — take at off the others, or give every block one`);
  }
  for (const f of floors.filter((f) => f.group !== null)) if (!blocks.some((b) => b.group === f.group)) throw new Error(`${f.who}: its group "${f.group}" has no block — give blocks "group": "${f.group}", or take the group off the floor`);
  let area = [0, 0, 1600, 900];
  if (own(spec, 'area')) {
    const a = spec.area;
    if (!(nums(a, [4]) && a[2] - a[0] >= 100 && a[3] - a[1] >= 100)) throw new Error(`${where}: isometric area is where the picture is fitted on the 1600×900 frame, [x0, y0, x1, y1], at least 100 px each way — not ${shown(a)}`);
    area = [...a];
  }
  if (own(spec, 'strict') && typeof spec.strict !== 'boolean') throw new Error(`${where}: isometric strict is true (a warning about the map refuses the film) or false`);
  const grid = readGrid(spec.grid, where), style = readStyle(spec.style, where);
  if (grid && own(spec, 'area')) throw new Error(`${where}: isometric area is where a fitted picture goes; this grid is written in numbers — give one or the other`);
  return {blocks, floors, wires, grid, area, style, strict: spec.strict === true, placed: unplaced.length ? 'build' : 'hand'};
}
