/**
 * Where everyone and everything is at t, from the plan (plan.mjs): a person's place on the floor, the way they face,
 * their hands; a thing's point (its bottom centre) at rest in its holder or on its way between two. Pure functions
 * of time: the plan is data, and these only read it.
 *
 * A holder is where a thing is: {type: 'ground', at, dx} | {type: 'in', id, slot} | {type: 'with', id, slot} |
 * {type: 'gone'} | {type: 'off'}. A thing in a container sits in its slot, so it moves when the container moves; a
 * thing in someone's hands moves with them.
 */
import {travelPoint} from './travel.mjs';

const last = (list, t) => { let found = null; for (const e of list) { if (e.at <= t) found = e; else break; } return found; };

/** The walk under way (or last finished) at t: {start, end, plan} or null. */
const walkOf = (P, t) => { let w = null; for (const x of P.walks) { if (x.start <= t) w = x; else break; } return w; };

/** A person's place on the floor at t (px). */
export const personX = (P, t) => { const w = walkOf(P, t); return w ? w.plan.at(t).x : P.x0; };
/** The walk's pose while it runs (from its set-off to settled), else null. */
export const walkPoseAt = (P, t) => { const w = walkOf(P, t); return w && t <= w.end ? w.plan.at(t) : null; };
/** The way a person faces at t: 1 (right) or -1 (left). */
export const facingAt = (P, t) => last(P.facings, t).facing;
/** Whether a person is on stage at t. */
export const presentAt = (P, t) => last(P.presence, t).on;

/** Where a person's hands hold things at t ([x, y] on the sheet): the kit's `hand`, mirrored by the way they face. */
export function handAt(plan, P, t) {
  const x = personX(P, t), facing = facingAt(P, t), walk = walkPoseAt(P, t), h = P.adapter.hand;
  if (typeof h === 'function') return h({x, y: plan.floor, facing, size: P.size, walk});
  const [dx, dy] = h ?? [.3 * P.size, -.5 * P.size];
  return [x + facing * dx, plan.floor + dy - (walk?.lift ?? 0)];
}

/** A person's head (what a look or a point at them aims at). */
export const headAt = (plan, P, t) => [personX(P, t), plan.floor - .85 * P.size];

/** Slot k in a container, from its bottom centre: the kit's slotAt, or rows across its width, filled from the bottom. */
export function slotOffset(C, slot, size) {
  const capacity = C.capacity, item = size;
  if (C.adapter.slotAt) return C.adapter.slotAt(slot, {capacity, item});
  const [cw] = C.adapter.size, [w, h] = item, per = Math.max(1, Math.floor(cw * .9 / w)), row = Math.floor(slot / per), col = slot % per;
  const inRow = Math.min(per, capacity - row * per);
  return [(col - (inRow - 1) / 2) * w, -4 - row * h * .8];
}

/** Where a holder holds `item` at t (the item's bottom centre), or null for gone and off. */
export function holderPoint(plan, holder, item, t) {
  if (holder.type === 'ground') return [holder.at[0] + holder.dx, holder.at[1]];
  if (holder.type === 'in') {
    const C = plan.containers.get(holder.id), [cx, cy] = itemPoint(plan, plan.items.get(holder.id), t), [dx, dy] = slotOffset(C, holder.slot, item.size);
    return [cx + dx, cy + dy];
  }
  if (holder.type === 'with') {
    const P = plan.people.get(holder.id), [hx, hy] = handAt(plan, P, t), f = facingAt(P, t);
    return [hx + f * holder.slot * .55 * item.size[0], hy + item.size[1] / 2 - holder.slot * 3];
  }
  return null;
}

/** The trip a thing is on at t, or null. */
export const tripAt = (I, t) => I.trips.find(tr => t >= tr.start && t < tr.end) ?? null;
/** The holder a thing rests in at t (between trips). */
export const stayAt = (I, t) => last(I.stays, t).holder;

/** A trip's launch point (where it was when it set off) and landing point (where its holder is now). */
export function tripEnds(plan, I, trip, t) {
  return [holderPoint(plan, trip.from, I, trip.start), holderPoint(plan, trip.to, I, t)];
}

/** A thing's point at t (bottom centre): on its way, or at rest in its holder (null when it is gone or off). */
export function itemPoint(plan, I, t) {
  const trip = tripAt(I, t);
  if (!trip) return holderPoint(plan, stayAt(I, t), I, t);
  const [from, to] = tripEnds(plan, I, trip, t);
  return travelPoint(trip.travel, from, to, (t - trip.start) / (trip.end - trip.start));
}

/** Whether a holder is on stage at t: a person present, a container itself shown (and not gone). */
export function holderShown(plan, holder, t) {
  if (holder.type === 'ground') return true;
  if (holder.type === 'with') return presentAt(plan.people.get(holder.id), t);
  if (holder.type === 'in') return itemShown(plan, plan.items.get(holder.id), t);
  return false;
}

/** Whether a thing is on stage at t: popped in and not out, not faded away, and its holder shown. */
export function itemShown(plan, I, t) {
  if (I.pops.in !== null && t < I.pops.in) return false;
  if (I.pops.out !== null && t >= I.pops.out + plan.popOut) return false;
  if (I.fade && t >= I.fade.end) return false;
  const trip = tripAt(I, t);
  return trip ? true : holderShown(plan, stayAt(I, t), t);
}
