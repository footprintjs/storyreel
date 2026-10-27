/**
 * The stage's lookups and the refusals every action shares. Each refusal names the action and the fix, and is checked
 * against the story as it stands at the action's moment (plan.mjs runs the actions' events in time order).
 * `S` is the plan being built (plan.mjs).
 */
import {readTravel} from './travel.mjs';
import {personX, presentAt, itemPoint} from './positions.mjs';
import {own} from './own.mjs';
import {EPS, shown, s2} from './say.mjs';

// ── lookups by name ──────────────────────────────────────────────────────────────────────────────────────────────────
export function person(S, id, path, what = 'who') {
  const P = typeof id === 'string' ? S.people.get(id) : null;
  if (!P) throw new Error(`${path}: ${what} is a cast member (${[...S.people.keys()].join(', ') || 'the cast is empty'}), not ${shown(id)}`);
  return P;
}
export function group(S, id, path, what = 'what') {
  const keys = typeof id === 'string' ? S.groups.get(id) : null;
  if (!keys) throw new Error(`${path}: ${what} is a prop (${[...S.groups.keys()].join(', ') || 'there are no props'}), not ${shown(id)}`);
  return keys.map(k => S.items.get(k));
}
export function container(S, id, path, what) {
  const C = typeof id === 'string' ? S.containers.get(id) : null;
  if (!C) throw new Error(`${path}: ${what} is a container (${[...S.containers.keys()].join(', ') || 'there are none: a container is a prop whose kind has slots'}), not ${shown(id)}`);
  return C;
}
export function howMany(a, path) {
  if (a.n === undefined) return 1;
  if (!(Number.isInteger(a.n) && a.n >= 1)) throw new Error(`${path}: n is how many, a whole number of 1 or more, not ${shown(a.n)}`);
  return a.n;
}
export const travelOf = (a, path) => readTravel(a.travel ?? a.rule.travel, `${path}.travel`);

// ── people ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export function onStage(P, t, path) {
  if (!P.on) throw new Error(`${path}: ${P.id} is off stage at ${s2(t)}: give them an enter before this action`);
}
/** One action at a time: a person is ready for an action once the one before has ended. */
export function ready(P, from, a) {
  if (from < P.busyUntil - EPS) throw new Error(`${a.path} (${a.do}): ${P.id} is still busy with ${P.busyWith} until ${s2(P.busyUntil)}, and this starts at ${s2(from)}: one action at a time (start it after, or give the one before less to do)`);
}
export function occupy(S, P, from, to, a) {
  ready(P, from, a);
  P.busyUntil = Math.max(P.busyUntil, to); P.busyWith = `${a.path.slice(S.where.length + 2)} (${a.do})`; P.doing.push({start: from, end: to, verb: a.do});
  S.until(to);
}
/** A person turns to face x (from where they stand at t). */
export function face(P, t, x) { const d = Math.sign(x - personX(P, t)); if (d) P.facings.push({at: t, facing: d}); }
export function reachable(S, P, t, I, path, what) {
  const at = itemPoint(S, I, t), x = personX(P, t);
  if (Math.abs(at[0] - x) > P.reach + EPS) throw new Error(`${path}: ${P.id} (at x ${Math.round(x)}) is ${Math.round(Math.abs(at[0] - x))} px from ${what} (at x ${Math.round(at[0])}) at ${s2(t)}, and reaches ${Math.round(P.reach)}: give ${P.id} a walkTo to it first`);
}

// ── things ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export function isOpen(S, C, t, path) {
  if (S.doors.get(C.id)?.open === false) throw new Error(`${path}: ${C.id} is shut at ${s2(t)}: open it first`);
}
/** Whether a thing has landed by t (it is not on its way anywhere). */
export const landed = (I, t) => t >= I.freeAt - EPS;
export function free(I, t, path) {
  if (!landed(I, t)) throw new Error(`${path}: ${I.key} is still on its way until ${s2(I.freeAt)}; it moves again only once it has landed`);
}

// ── what a point, a look or a walk aims at ───────────────────────────────────────────────────────────────────────────
/** A thing a person may point or look at, at t: a person on stage, a prop on stage, a spot, a region of the place. */
export function target(S, on, t, path, {viewer = false} = {}) {
  const spots = S.stage.place.adapter.spots, regions = S.stage.place.adapter.regions;
  if (viewer && on === 'viewer') return null;
  if (S.people.has(on)) { if (!presentAt(S.people.get(on), t)) throw new Error(`${path}: ${on} is off stage at ${s2(t)}: give them an enter before this, or name someone on stage`); return on; }
  if (S.groups.has(on)) { if (!group(S, on, path).some(I => I.on && I.now.type !== 'gone')) throw new Error(`${path}: no ${on} is on stage at ${s2(t)}: give it an enter before this, or name a thing on stage`); return on; }
  if (own(spots, on) || own(regions, on)) return on;
  throw new Error(`${path}: on is a cast member, a prop, a spot or a region of the place${viewer ? ', or "viewer"' : ''} (${[...S.people.keys(), ...S.groups.keys(), ...Object.keys(spots ?? {}), ...Object.keys(regions ?? {})].join(', ')}), not ${shown(on)}`);
}
/** Where a target stands across the floor at t. */
export function xOf(S, on, t) {
  if (S.people.has(on)) return personX(S.people.get(on), t);
  if (S.groups.has(on)) { const xs = group(S, on, '').filter(I => I.on && I.now.type !== 'gone').map(I => itemPoint(S, I, t)[0]); return xs.reduce((a, b) => a + b, 0) / xs.length; }
  const s = own(S.stage.place.adapter.spots, on); if (s) return s[0];
  const r = own(S.stage.place.adapter.regions, on); return (r[0] + r[2]) / 2;
}
