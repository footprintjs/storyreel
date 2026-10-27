/**
 * A stage as written → checked and resolved: the place (from the kit), the cast and the props (each with its
 * drawing), the actions with their beats turned into seconds. Data only: an unknown key refuses, naming the keys.
 *
 *   {place, cast: {id: {as?, x, facing?}}, props: {id: {kind, count?, at | in | with, slots?, open?}}, actions: […],
 *    aside?, sounds?}
 */
import {readAction} from './vocabulary.mjs';

export const STAGE_KEYS = Object.freeze(['place', 'cast', 'props', 'actions', 'aside', 'sounds']);
const CAST_KEYS = ['as', 'x', 'facing'], PROP_KEYS = ['kind', 'count', 'at', 'in', 'with', 'slots', 'open'];
const shown = v => JSON.stringify(v) ?? String(v);
/** A name a person or a prop goes by: it is a camera name and a fact's name, so a word, never a path or 'viewer'. */
const NAME = /^[\p{L}\p{N}_-]+$/u;

function checkName(id, what, where) {
  if (!NAME.test(id) || id === 'viewer') throw new Error(`${where}: ${what} "${id}" needs a name of letters, digits, _ or - (no spaces or dots; "viewer" is taken)`);
}
const isPoint = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
/** A beat is what the clock resolves ([scene, phrase, plus?] or {scene, phrase, …}), or seconds where the caller allows. */
const isBeat = b => Array.isArray(b) || (b && typeof b === 'object') || typeof b === 'number';

/** The facing as written ('left', 'right', or none: toward the middle of the frame) → -1 or 1. */
function readFacing(facing, x, where) {
  if (facing === undefined) return x < 800 ? 1 : -1;
  if (facing === 'right' || facing === 1) return 1;
  if (facing === 'left' || facing === -1) return -1;
  throw new Error(`${where}: facing is "left" or "right", not ${shown(facing)}`);
}

function readCast(cast, adapters, where) {
  if (!cast || typeof cast !== 'object' || Array.isArray(cast)) throw new Error(`${where}: cast is {id: {as?, x, facing?}}, not ${shown(cast)}`);
  return Object.entries(cast).map(([id, c]) => {
    const at = `${where}: cast.${id}`;
    checkName(id, 'a cast member', where);
    if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error(`${at} is {as?, x, facing?}, not ${shown(c)}`);
    for (const k of Object.keys(c)) if (!CAST_KEYS.includes(k)) throw new Error(`${at} has "${k}"; it takes ${CAST_KEYS.join(', ')}`);
    if (!Number.isFinite(c.x)) throw new Error(`${at}: x is where they stand on the floor (px), not ${shown(c.x)}`);
    const kind = c.as ?? id, adapter = adapters.person(kind, at);
    return Object.freeze({id, kind, adapter, x: c.x, facing: readFacing(c.facing, c.x, at), size: adapter.size, reach: adapter.reach ?? null});
  });
}

function readProps(props, adapters, place, castIds, where) {
  if (!props || typeof props !== 'object' || Array.isArray(props)) throw new Error(`${where}: props is {id: {kind, count?, at | in | with, slots?, open?}}, not ${shown(props)}`);
  const out = Object.entries(props).map(([id, p]) => {
    const at = `${where}: props.${id}`;
    checkName(id, 'a prop', where);
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error(`${at} is {kind, count?, at | in | with, slots?, open?}, not ${shown(p)}`);
    for (const k of Object.keys(p)) if (!PROP_KEYS.includes(k)) throw new Error(`${at} has "${k}"; it takes ${PROP_KEYS.join(', ')}`);
    const adapter = adapters.prop(p.kind, at), count = p.count ?? 1;
    if (!(Number.isInteger(count) && count >= 1 && count <= 100)) throw new Error(`${at}: count is how many there are, a whole number 1 to 100, not ${shown(p.count)}`);
    const places = ['at', 'in', 'with'].filter(k => p[k] !== undefined);
    if (places.length !== 1) throw new Error(`${at}: give exactly one of at (a place: [x, y] or a spot), in (a container) or with (a cast member)`);
    let start;
    if (p.at !== undefined) {
      const spot = typeof p.at === 'string' ? place.adapter.spots?.[p.at] : null;
      if (typeof p.at === 'string' && !spot) throw new Error(`${at}: the place "${place.name}" has no spot "${p.at}" (its spots are ${Object.keys(place.adapter.spots ?? {}).join(', ') || 'none: give [x, y]'})`);
      if (!spot && !isPoint(p.at)) throw new Error(`${at}: at is [x, y] (the bottom of the thing) or a spot name, not ${shown(p.at)}`);
      start = {type: 'ground', at: spot ?? p.at};
    } else if (p.in !== undefined) start = {type: 'in', id: p.in};
    else {
      if (!castIds.includes(p.with)) throw new Error(`${at}: with names a cast member (${castIds.join(', ') || 'there are none'}), not ${shown(p.with)}`);
      start = {type: 'with', id: p.with};
    }
    const capacity = p.slots ?? adapter.slots ?? null;
    if (p.slots !== undefined && !(Number.isInteger(p.slots) && p.slots >= 1)) throw new Error(`${at}: slots is how many things it holds, a whole number of 1 or more, not ${shown(p.slots)}`);
    if (capacity !== null && count !== 1) throw new Error(`${at}: a container is one thing (count 1); give each its own id`);
    if (p.open !== undefined && (typeof p.open !== 'boolean' || !adapter.opens)) throw new Error(`${at}: open is true or false, for a kind that opens (the kit's prop says opens: true)${adapter.opens ? '' : `; "${p.kind}" does not open`}`);
    return {id, kind: p.kind, adapter, count, start, capacity, opens: Boolean(adapter.opens), open: p.open ?? false, container: capacity !== null};
  });
  const byId = new Map(out.map(p => [p.id, p]));
  for (const p of out) if (p.start.type === 'in') {
    const c = byId.get(p.start.id);
    if (!c || !c.container) throw new Error(`${where}: props.${p.id}: in names a container (${out.filter(q => q.container).map(q => q.id).join(', ') || 'there are none: a container is a prop whose kind has slots'}), not ${shown(p.start.id)}`);
    for (let c2 = c, seen = new Set([p.id]); c2?.start.type === 'in'; c2 = byId.get(c2.start.id)) {
      if (seen.has(c2.id)) throw new Error(`${where}: props.${p.id} is inside itself (${[...seen].join(' in ')}): a container cannot hold what holds it`);
      seen.add(c2.id);
    }
  }
  for (const c of out.filter(q => q.container)) {
    const inside = out.filter(q => q.start.type === 'in' && q.start.id === c.id).reduce((n, q) => n + q.count, 0);
    if (inside > c.capacity) throw new Error(`${where}: props: ${inside} things start in ${c.id}, which holds ${c.capacity}`);
  }
  return out.map(Object.freeze);
}

/**
 * The stage as written, checked: `at` turns a beat into seconds (the film's clock; standalone, seconds as numbers).
 * Returns {where, place: {name, adapter}, cast, props, actions, aside, sounds}.
 */
export function readStage(spec, {adapters, at, where = 'the stage'}) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error(`${where} is {place, cast, props, actions}, not ${shown(spec)}`);
  for (const k of Object.keys(spec)) if (!STAGE_KEYS.includes(k)) throw new Error(`${where} has "${k}"; a stage takes ${STAGE_KEYS.join(', ')}`);
  if (spec.aside !== undefined && typeof spec.aside !== 'boolean') throw new Error(`${where}: aside is true (outside the story's timeline: a flash-forward, a memory) or false, not ${shown(spec.aside)}`);
  if (spec.sounds !== undefined && typeof spec.sounds !== 'boolean') throw new Error(`${where}: sounds is true or false, not ${shown(spec.sounds)}`);
  const place = {name: spec.place, adapter: adapters.place(spec.place, `${where}: place`)};
  const cast = readCast(spec.cast ?? {}, adapters, where), props = readProps(spec.props ?? {}, adapters, place, cast.map(c => c.id), where);
  const names = [...cast.map(c => ['cast', c.id]), ...props.map(p => ['props', p.id]), ...Object.keys(place.adapter.regions ?? {}).map(n => ['the place', n])], seen = new Map();
  for (const [what, name] of names) {
    if (seen.has(name)) throw new Error(`${where}: two things are called "${name}" (${seen.get(name)} and ${what}): a name is what the camera frames, so each is one thing's`);
    seen.set(name, what);
  }
  if (!Array.isArray(spec.actions ?? [])) throw new Error(`${where}: actions is a list, in the order they start`);
  const beat = (ref, path) => {
    if (!isBeat(ref)) throw new Error(`${path} is a beat ([scene, phrase] or [scene, phrase, plus]), not ${shown(ref)}`);
    let s;
    try { s = at(ref); } catch (e) { throw new Error(`${path}: ${e.message}`, {cause: e}); }
    if (!Number.isFinite(s)) throw new Error(`${path} is a beat ([scene, phrase] or [scene, phrase, plus]), not ${shown(ref)}`);
    return s;
  };
  const beats = (list, path, what) => {
    if (!Array.isArray(list) || !list.length || typeof list[0] === 'string') throw new Error(`${path} is a list of beats, ${what} ([[scene, phrase], …]), not ${shown(list)}`);
    return list.map((b, k) => beat(b, `${path}[${k}]`));
  };
  let last = -Infinity, lastPath = null;
  const actions = (spec.actions ?? []).map((a, i) => {
    const path = `${where}: actions[${i}]`, rule = readAction(a, path), times = a.do === 'count' ? beats(a.at, `${path}.at`, 'one per thing') : [beat(a.at, `${path}.at`)];
    const out = {...a, i, path, rule, times, start: times[0]};
    if (a.do === 'count') times.forEach((t, k) => { if (k && t < times[k - 1]) throw new Error(`${path}.at[${k}] (${t.toFixed(2)} s) comes before at[${k - 1}] (${times[k - 1].toFixed(2)} s): one thing a beat, in order`); });
    if (a.until !== undefined) out.until = beat(a.until, `${path}.until`);
    for (const k of ['fold', 'raise']) if (a[k] !== undefined) out[k] = beats(a[k], `${path}.${k}`, 'one finger each');
    if (out.start < last - 1e-9) throw new Error(`${path} (${a.do}) starts at ${out.start.toFixed(2)} s, before ${lastPath} (${last.toFixed(2)} s): list the actions in the order they start`);
    last = out.start; lastPath = `actions[${i}]`;
    return Object.freeze(out);
  });
  return Object.freeze({where, place, cast, props, actions, aside: spec.aside ?? false, sounds: spec.sounds ?? true});
}
