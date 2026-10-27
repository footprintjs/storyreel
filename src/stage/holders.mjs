/**
 * Where things are and how they move between holders. A container's slots and a person's hands are taken as a thing
 * sets off toward them and freed as it leaves, so a thing on its way already counts where it is going: an 11th thing
 * never gets into ten slots, whatever lands when. `S` is the plan being built (plan.mjs).
 */
import {TRAVELS} from './travel.mjs';
import {isOpen, free} from './checks.mjs';
import {EPS, s2} from './say.mjs';

/** The first free slot under `capacity`, or -1. */
export function takeSlot(map, capacity) { for (let s = 0; s < capacity; s++) if (!map.has(s)) return s; return -1; }

/** A holder for a thing, taking its slot: on the ground as given, in a container's free slot, or in a person's hands. */
export function holderFor(S, spec, I) {
  if (spec.type === 'ground') return spec;
  if (spec.type === 'in') { const C = S.containers.get(spec.id), slot = takeSlot(C.used, C.capacity); C.used.set(slot, I.key); return {type: 'in', id: spec.id, slot}; }
  const P = S.people.get(spec.id), slot = takeSlot(P.hands, Infinity); P.hands.set(slot, I.key); return {type: 'with', id: spec.id, slot};
}
/** Free the slot a holder held. */
export function release(S, h) {
  if (h.type === 'in') S.containers.get(h.id).used.delete(h.slot);
  else if (h.type === 'with') S.people.get(h.id).hands.delete(h.slot);
}

/** Every thing in its starting holder: a group on the ground spreads in a row; in a container or hands, a slot each. */
export function placeAtStart(S, props) {
  for (const p of props) {
    const keys = S.groups.get(p.id);
    keys.forEach((key, k) => {
      const I = S.items.get(key), w = p.adapter.size[0] * 1.1;
      I.now = p.start.type === 'ground' ? {type: 'ground', at: p.start.at, dx: (k - (keys.length - 1) / 2) * w} : holderFor(S, p.start, I);
      I.stays.push({at: -Infinity, holder: I.now});
    });
  }
}

/**
 * Move a thing to a holder on a trip, setting off at `start`: it leaves its holder (freeing the slot) and takes its
 * new one (a slot it holds while on its way), and it lands TRAVELS[travel].seconds later. Refuses a thing still on
 * its way, a shut container either end, a container into itself, a full one, and a container still filling or
 * emptying. Returns when it lands.
 */
export function move(S, I, to, start, travel, path) {
  free(I, start, path);
  const from = I.now, seconds = TRAVELS[travel].seconds, end = start + seconds;
  if (from.type === 'in') isOpen(S, S.containers.get(from.id), start, path);
  const C = to.type === 'in' ? S.containers.get(to.id) : null;
  if (C) {
    for (let c = C; c; c = S.containers.get(S.items.get(c.id).now.id)) if (c.id === I.key) throw new Error(`${path}: ${I.key} cannot go into ${to.id}, which is inside it: put it somewhere else`);
    if (takeSlot(C.used, C.capacity) < 0) throw new Error(`${path}: ${C.id} holds ${C.capacity}, and it is full at ${s2(start)}: give it more slots, or put the thing somewhere else`);
    isOpen(S, C, start, path);
  }
  const self = S.containers.get(I.key);
  if (self && start < self.busyUntil - EPS) throw new Error(`${path}: ${I.key} is still being filled or emptied until ${s2(self.busyUntil)}; move it once the last thing has landed`);
  release(S, from);
  const holder = holderFor(S, to, I);
  I.trips.push({start, end, from, to: holder, travel});
  I.stays.push({at: end, holder});
  I.now = holder; I.freeAt = end;
  for (const c of [from.type === 'in' ? S.containers.get(from.id) : null, C]) if (c) c.busyUntil = Math.max(c.busyUntil, end);
  S.until(end);
  return end;
}
