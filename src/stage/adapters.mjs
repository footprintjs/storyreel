/**
 * The stage's adapter port: how a kit hands the stage its drawings. The kit supplies three tables — places, people,
 * props — and the stage asks them by name. An unknown name refuses, listing what the kit has. The stage never draws a
 * place, a person or a prop itself; the kit never times or places one.
 *
 *   places[name]  {floor, spots?, regions?, draw(ctx, t), front?(ctx, t)}
 *                   floor: the floor's y (px); spots: {name: [x, y]} where props may stand; regions: {name: box} the
 *                   camera may frame; front: drawn over everything else (a counter people stand behind)
 *   people[kind]  {size, reach?, hand?, mouth?, walk?, draw(ctx, pose)}
 *                   size: standing height (px, it sets a walk's steps); reach (px; STAGE.reach × size by default);
 *                   walk: how they walk unless an action says (walk.mjs · WALKS name or style; a stroll by default);
 *                   hand: where held things sit, [dx, dy] from the feet for someone facing right, or (pose) → [x, y];
 *                   mouth: true when the drawing opens its mouth with pose.talk (the lip-sync check then reads it)
 *   props[kind]   {size: [w, h], slots?, slotAt?, opens?, draw(ctx, look), front?(ctx, look)}
 *                   drawn with its bottom centre at (0, 0) (the stage places, scales and fades it); slots: how many
 *                   things it holds (a container); slotAt(k, {capacity, item: [w, h]}) → [dx, dy] from its bottom
 *                   centre; opens: it has a door or lid (look.open, 0 shut … 1 open); front: drawn over what it holds
 *   badge?        (ctx, {x, y, n, pop, done}) a count's number, drawn your way (the stage has a plain one)
 */

import {readWalk} from '../walk.mjs';

const shown = v => (typeof v === 'function' ? 'a function' : JSON.stringify(v) ?? String(v));
const isPoint = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const isBox = b => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && b[2] > b[0] && b[3] > b[1];
const ownKeys = (o, allowed, where) => { for (const k of Object.keys(o)) if (!allowed.includes(k)) throw new Error(`${where} has "${k}"; it takes ${allowed.join(', ')}`); };

function checkPlace(p, where) {
  if (!p || typeof p !== 'object') throw new Error(`${where} is {floor, spots?, regions?, draw(ctx, t), front?}, not ${shown(p)}`);
  ownKeys(p, ['floor', 'spots', 'regions', 'draw', 'front'], where);
  if (!Number.isFinite(p.floor)) throw new Error(`${where}: floor is the floor's y in px, not ${shown(p.floor)}`);
  if (typeof p.draw !== 'function') throw new Error(`${where}: draw(ctx, t) draws the place`);
  if (p.front !== undefined && typeof p.front !== 'function') throw new Error(`${where}: front(ctx, t) draws over everything else: give it as a function, or leave it out`);
  for (const [name, at] of Object.entries(p.spots ?? {})) if (!isPoint(at)) throw new Error(`${where}: spot "${name}" is [x, y], not ${shown(at)}`);
  for (const [name, box] of Object.entries(p.regions ?? {})) if (!isBox(box)) throw new Error(`${where}: region "${name}" is a box [x0, y0, x1, y1], not ${shown(box)}`);
}

function checkPerson(p, where) {
  if (!p || typeof p !== 'object') throw new Error(`${where} is {size, reach?, hand?, mouth?, walk?, draw(ctx, pose)}, not ${shown(p)}`);
  ownKeys(p, ['size', 'reach', 'hand', 'mouth', 'walk', 'draw'], where);
  if (p.walk !== undefined) try { readWalk(p.walk); } catch (e) { throw new Error(`${where}: ${e.message}`, {cause: e}); }
  if (!(Number.isFinite(p.size) && p.size > 0)) throw new Error(`${where}: size is the standing height in px (it sets a walk's steps), not ${shown(p.size)}`);
  if (p.reach !== undefined && !(Number.isFinite(p.reach) && p.reach > 0)) throw new Error(`${where}: reach is px, above 0, not ${shown(p.reach)}`);
  if (p.hand !== undefined && !isPoint(p.hand) && typeof p.hand !== 'function') throw new Error(`${where}: hand is [dx, dy] from the feet (facing right), or (pose) → [x, y], not ${shown(p.hand)}`);
  if (p.mouth !== undefined && typeof p.mouth !== 'boolean') throw new Error(`${where}: mouth is true or false, not ${shown(p.mouth)}`);
  if (typeof p.draw !== 'function') throw new Error(`${where}: draw(ctx, pose) draws the person`);
}

function checkProp(p, where) {
  if (!p || typeof p !== 'object') throw new Error(`${where} is {size: [w, h], slots?, slotAt?, opens?, draw(ctx, look), front?}, not ${shown(p)}`);
  ownKeys(p, ['size', 'slots', 'slotAt', 'opens', 'draw', 'front'], where);
  if (!(isPoint(p.size) && p.size[0] > 0 && p.size[1] > 0)) throw new Error(`${where}: size is [w, h] in px, not ${shown(p.size)}`);
  if (p.slots !== undefined && !(Number.isInteger(p.slots) && p.slots >= 1)) throw new Error(`${where}: slots is how many things it holds, a whole number of 1 or more, not ${shown(p.slots)}`);
  if (p.slotAt !== undefined && typeof p.slotAt !== 'function') throw new Error(`${where}: slotAt(k, {capacity, item}) → [dx, dy] is optional, a function`);
  if (p.opens !== undefined && typeof p.opens !== 'boolean') throw new Error(`${where}: opens is true or false, not ${shown(p.opens)}`);
  for (const k of ['draw', 'front']) if (p[k] !== undefined && typeof p[k] !== 'function') throw new Error(`${where}: ${k}(ctx, look) is a function`);
  if (typeof p.draw !== 'function') throw new Error(`${where}: draw(ctx, look) draws the thing with its bottom centre at (0, 0)`);
}

/** A table of adapters by name, checked, as a lookup that refuses an unknown name listing the names it has. */
function table(given, what, check, kit) {
  if (!given || typeof given !== 'object' || Array.isArray(given)) throw new Error(`the stage kit "${kit}": ${what} is {name: adapter}, not ${shown(given)}`);
  const names = Object.keys(given);
  if (!names.length) throw new Error(`the stage kit "${kit}" has no ${what}: give at least one`);
  for (const name of names) check(given[name], `the stage kit "${kit}": ${what}.${name}`);
  const frozen = Object.freeze({...given});
  return {names: Object.freeze(names), get(name, where) {
    if (typeof name === 'string' && Object.hasOwn(frozen, name)) return frozen[name];
    throw new Error(`${where}: the stage kit "${kit}" has no ${what.replace(/s$/, '')} called ${shown(name)} (its ${what} are ${names.join(', ')})`);
  }};
}

/**
 * The kit's adapters, checked once: {places, people, props, badge?} → the port the stage asks by name:
 * place(name, where), person(kind, where), prop(kind, where), badge, and the names each table has.
 */
export function readAdapters({places, people, props, badge} = {}, kit = 'stage') {
  if (badge !== undefined && typeof badge !== 'function') throw new Error(`the stage kit "${kit}": badge(ctx, {x, y, n, pop, done}) is optional, a function`);
  const P = table(places, 'places', checkPlace, kit), H = table(people, 'people', checkPerson, kit), T = table(props, 'props', checkProp, kit);
  return Object.freeze({kit, place: P.get, person: H.get, prop: T.get, badge: badge ?? null, places: P.names, people: H.names, props: T.names});
}
