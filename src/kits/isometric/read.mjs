/**
 * read — an isometric world's recipe entry, checked: every refusal names the entry (`stage map: isometric
 * blocks[2] ("db")`) and the fix. Plain data in, plain data out; nothing is placed or drawn here.
 *
 * The words are StoryDeck's (README "Blocks on a floor"), as data: a deck's `data-k` is `name`, `data-iso` is `kind`,
 * `data-at`/`data-size` are `at`/`size`, `data-iso-group` is `group`, `data-ports` is `ports`, a block's `<b>` and
 * `<small>` are `label` and `small`, a floor's `data-label` is `label`, a wire's `data-arrow="lap.rj45 to sw.p1"` is
 * `arrow` (the same grammar, a trailing bend "0" drawing it straight), and `data-head`, `data-packets`, `data-speed`,
 * `data-ride`, `data-rest`, `data-trail`, `data-behind` are `head`, `packets`, `speed`, `ride`, `rest`, `trail`,
 * `behind`. WHY the same words: a map written for a deck is written for a film by moving its attributes into keys.
 *
 * What a film adds: `appear` (when a piece comes in: an anchor, [scene, phrase, plus?]) and a wire's `start` (when its
 * packets begin to ride) — a deck has clicks for both; a film has its voice.
 */
import {readPorts, readThing, MOST_FLOOR_LABEL, MOST_ROUTES} from 'footprint-story/isometric';
import {MOST_EASE} from 'footprint-story/motion';

/** The keys an isometric world takes (beside `kit`), each piece's keys, and the limits. */
export const WORLD_KEYS = Object.freeze(['kit', 'blocks', 'floors', 'wires', 'grid', 'area', 'strict']);
const BLOCK_KEYS = Object.freeze(['name', 'kind', 'at', 'size', 'label', 'small', 'color', 'tone', 'group', 'ports', 'appear']);
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
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
/** A name a wire's arrow can say: letters, digits, `_` and `-` — no space and no dot (the dot names a port: "sw.p1"). */
const NAME = /^[\p{L}\p{N}_-]+$/u;
/** A label is plain words: a control, a direction mark or a character that draws nothing reads differently on screen and in a note. */
const UNPLAIN = /\p{Cc}|(?!‍)\p{Cf}|[\uD800-\uDFFF]/u;

const own = (o, k) => Object.hasOwn(o, k) && o[k] !== undefined;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const nums = (v, lengths) => Array.isArray(v) && lengths.includes(v.length) && v.every(Number.isFinite);
const shown = (v) => { const s = JSON.stringify(v) ?? String(v); return s.length > 60 ? `${s.slice(0, 59)}…` : s; };
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
  const text = v.replace(/[\t\n\r]+/g, ' ').trim();
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
  if (typeof v !== 'string' || !v.trim() || v.length > 100) throw new Error(`${who}: group names the group it belongs to ("backend"), 1 to 100 letters — not ${shown(v)}`);
  return v;
}

/** One block (or cylinder), checked: {name, kind, at|null, size, label, small, color, tone, group, ports, appear, path, who}. */
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
  if (kind === 'cylinder' && Math.abs(size[0] - size[1]) > 1e-9) throw new Error(`${who}: a cylinder is round — its size is [wide, wide, high], the same width and depth (not ${shown(size)})`);
  if (own(b, 'color') && !HEX.test(b.color)) throw new Error(`${who}: color is a hex colour ("#bcd6f3") — its top is drawn lighter and its sides darker; not ${shown(b.color)}`);
  if (own(b, 'tone') && !TONES.includes(b.tone)) throw new Error(`${who}: tone is ${TONES.join(', ')} (the theme's colours for each) — not ${shown(b.tone)}`);
  if (own(b, 'color') && own(b, 'tone')) throw new Error(`${who}: give it a color or a tone, not both`);
  const small = words(b.small, who, 'small', ISO_LIMITS.label), label = words(b.label, who, 'label', ISO_LIMITS.label);
  if (small && !label) throw new Error(`${who}: small is the line under its label — give it a label too`);
  let ports = [];
  if (own(b, 'ports')) {
    if (!Array.isArray(b.ports)) throw new Error(`${who}: ports is a list, [{"name": "p1", "at": [x, y, z]}] in its own tiles (x along its width, y along its depth, z up from its base)`);
    b.ports.forEach((p, k) => keysOf(p, ['name', 'at', 'face'], `${who}: ports[${k}]`));
    try { ports = readPorts(b.ports, size, kind === 'cylinder', `"${name}"`).map(({name: n, at: a, face, seen}) => ({name: n, at: [...a], face, seen})); } catch (e) {
      throw new Error(`${who}: ${e.message.replace(/^isometric: /, '')}`, {cause: e});
    }
  }
  return {name, kind, at, size: [...size], label, small, color: b.color ?? null, tone: b.tone ?? null, group: groupOf(b.group, who), ports, appear: appearOf(b.appear, who), path, who};
}

/** One floor, checked: {name, at|null, size|null, label, color, group, appear, path, who}. */
function readFloor(f, i, where) {
  const path = `floors[${i}]`, first = `${where}: isometric ${path}`;
  keysOf(f, FLOOR_KEYS, first);
  const name = nameOf(f.name, first, false), who = name ? `${first} ("${name}")` : first;
  if (own(f, 'size') && !(nums(f.size, [2]) && f.size.every((n) => Number.isInteger(n) && n >= 1 && n <= 256))) throw new Error(`${who}: size is [cols, rows], whole numbers 1 to 256 — not ${shown(f.size)}`);
  if (own(f, 'at') && !nums(f.at, [2])) throw new Error(`${who}: at is its far corner, [col, row] — not ${shown(f.at)}`);
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
  const form = '"you to server" (a block\'s name, or "block.port", at each end; "you to server 0" draws it straight)';
  if (typeof arrow !== 'string') throw new Error(`${who}: arrow is ${form} — not ${shown(arrow)}`);
  const m = /^\s*(\S+)\s+to\s+(\S+)(?:\s+(-?\d+(?:\.\d+)?))?\s*$/.exec(arrow);
  if (!m) throw new Error(`${who}: arrow is ${form} — not ${shown(arrow)}`);
  const end = (text) => {
    const byName = blocks.find((b) => b.name === text);
    if (byName) return {block: byName, port: null};
    const dot = text.lastIndexOf('.'), block = dot > 0 ? blocks.find((b) => b.name === text.slice(0, dot)) : null;
    if (!block) throw new Error(`${who}: arrow "${arrow}" names "${text.slice(0, dot > 0 ? dot : undefined)}", which is no block here — the blocks are ${blocks.map((b) => b.name).join(', ') || 'none'}`);
    const port = text.slice(dot + 1);
    if (!block.ports.some((p) => p.name === port)) throw new Error(`${who}: arrow "${arrow}": ${block.name} has no port "${port}" — ${block.ports.length ? `its ports are ${block.ports.map((p) => p.name).join(', ')}` : `give it ports ([{"name": "${port}", "at": [x, y, z]}])`}`);
    return {block, port};
  };
  const from = end(m[1]), to = end(m[2]);
  if (from.block === to.block) throw new Error(`${who}: arrow "${arrow}" joins ${from.block.name} to itself — name another block at one end ("arrow": "${from.block.name} to ${blocks.find((b) => b !== from.block)?.name ?? 'other'}")`);
  return {from, to, straight: m[3] !== undefined};
}

/** One wire, checked: {name, arrow, label, head, packets, seconds|null, perSecond|null, ride, rest, trail, behind, appear, start, path, who}. */
function readWire(w, i, where, blocks) {
  const path = `wires[${i}]`, first = `${where}: isometric ${path}`;
  keysOf(w, WIRE_KEYS, first);
  const name = nameOf(w.name, first, false), who = `${first}${name ? ` ("${name}")` : typeof w.arrow === 'string' ? ` (${w.arrow.trim()})` : ''}`;
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
  const tile = g.tile;
  if (!(Number.isFinite(tile) && tile > 0) && !(nums(tile, [2]) && tile.every((n) => n > 0))) throw new Error(`${who}: tile is a tile's width in px (120), or [width, height] for another angle — not ${shown(tile)}`);
  if (!nums(g.at, [2])) throw new Error(`${who}: at is where the floor's far corner stands on the frame, [x, y] — not ${shown(g.at)}`);
  if (own(g, 'rise') && !(Number.isFinite(g.rise) && g.rise > 0)) throw new Error(`${who}: rise is a unit of height in px, above 0 — not ${shown(g.rise)}`);
  return {tile, origin: [...g.at], ...(own(g, 'rise') ? {rise: g.rise} : {})};
}

/** The world's entry, checked: {blocks, floors, wires, grid, area, strict}. `where` names the recipe entry (`stage map`, `the story`). */
export function readMap(spec, where) {
  keysOf(spec, WORLD_KEYS, `${where}: the isometric world`);
  for (const key of ['blocks', 'floors', 'wires']) if (own(spec, key) && !Array.isArray(spec[key])) throw new Error(`${where}: isometric ${key} is a list — not ${shown(spec[key])}`);
  const blocks = (spec.blocks ?? []).map((b, i) => readBlock(b, i, where));
  if (!blocks.length) throw new Error(`${where}: an isometric world draws blocks on a floor — give it blocks: [{"name": "you"}, {"name": "server"}]`);
  const floors = (spec.floors ?? []).map((f, i) => readFloor(f, i, where));
  if (blocks.length + floors.length > ISO_LIMITS.pieces) throw new Error(`${where}: an isometric world holds at most ${ISO_LIMITS.pieces} blocks and floors, and this one has ${blocks.length + floors.length} — split it into two worlds`);
  const wires = (spec.wires ?? []).map((w, i) => readWire(w, i, where, blocks));
  if (wires.length > MOST_ROUTES) throw new Error(`${where}: an isometric world lays at most ${MOST_ROUTES} wires, and this one has ${wires.length} — split it into two worlds`);
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
  const grid = readGrid(spec.grid, where);
  if (grid && own(spec, 'area')) throw new Error(`${where}: isometric area is where a fitted picture goes; this grid is written in numbers — give one or the other`);
  return {blocks, floors, wires, grid, area, strict: spec.strict === true, placed: unplaced.length ? 'build' : 'hand'};
}
