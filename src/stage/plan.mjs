/**
 * The stage's plan: the actions played through once, as events in time order (events.mjs), into data the frame
 * reads (positions.mjs, scene.mjs). Each event is checked against the story as it stands at its moment and refused,
 * naming the fix, when it cannot happen (checks.mjs, holders.mjs, verbs.mjs).
 *
 *   people     each person's walks, facing, presence, arms, looks and fingers over time
 *   items      each thing's stays and trips (holders.mjs), its presence and pops, its fade
 *   badges     each count's number          sounds   the stage's own sounds
 *   ledger     after every event: who holds what, how many are where, who is on stage (ledger.mjs)
 *   facts      {start, end}: flat facts for the film's continuity check
 */
import {MOVES} from '../moves.mjs';
import {STAGE, chainHeld} from './timing.mjs';
import {eventsOf} from './events.mjs';
import {VERBS} from './verbs.mjs';
import {placeAtStart} from './holders.mjs';
import {facts} from './ledger.mjs';
import {list, EPS} from './say.mjs';

/** Who starts off stage: someone, or a prop, whose first action is to enter. */
function startsOff(actions, id, prop) {
  const first = actions.find(a => (prop ? a.what === id : [a.who, a.from, a.to].flatMap(v => (v === undefined ? [] : list(v))).includes(id)));
  return first?.do === 'enter' && (prop ? first.what === id : list(first.who ?? []).includes(id));
}

export function planStage(stage) {
  const {where, place, cast, props, actions} = stage;
  const S = {stage, where, floor: place.adapter.floor, popOut: MOVES['pop-out'].seconds,
    people: new Map(), items: new Map(), groups: new Map(), containers: new Map(), doors: new Map(),
    badges: [], sounds: [], ledger: [], end: 0, counting: new Map(), fingerKeys: new Map()};
  S.sound = (time, type) => { if (stage.sounds && type) S.sounds.push({time, type}); };
  S.until = t => { S.end = Math.max(S.end, t); };

  for (const c of cast) {
    const on = !startsOff(actions, c.id, false);
    S.people.set(c.id, {id: c.id, kind: c.kind, adapter: c.adapter, size: c.size, reach: c.reach ?? STAGE.reach * c.size, x0: c.x,
      presence: [{at: -Infinity, on}], walks: [], facings: [{at: -Infinity, facing: c.facing}], arms: [], looks: [], fingers: [], doing: [],
      on, busyUntil: -Infinity, busyWith: null, hands: new Map()});
  }
  for (const p of props) {
    const keys = p.count === 1 ? [p.id] : Array.from({length: p.count}, (_, k) => `${p.id}#${k + 1}`), on = !startsOff(actions, p.id, true);
    S.groups.set(p.id, keys);
    keys.forEach((key, k) => S.items.set(key, {key, prop: p.id, k, kind: p.kind, adapter: p.adapter, size: p.adapter.size, stays: [], trips: [],
      fade: null, presence: [{at: -Infinity, on}], pops: [], on, now: null, freeAt: -Infinity}));
    if (p.container) S.containers.set(p.id, {id: p.id, adapter: p.adapter, capacity: p.capacity, used: new Map(), busyUntil: -Infinity});
    if (p.opens) S.doors.set(p.id, {doors: [{at: -Infinity, open: p.open}], open: p.open});
  }
  placeAtStart(S, props);
  const start = facts(S);

  for (const e of eventsOf(actions)) VERBS[e.a.do](S, e);

  // A count's number stays until something next goes in or out of that container (or the thing itself moves on).
  const nextTrip = (I, from) => I.trips.find(tr => tr.start >= from - EPS)?.start ?? I.fade?.start ?? Infinity;
  for (const b of S.badges) {
    const after = b.lands.at(-1), I = S.items.get(b.on);
    const touches = [...S.items.values()].flatMap(J => J.trips.filter(tr => tr.start > after + EPS && [tr.from, tr.to].some(h => h.type === 'in' && h.id === b.on)).map(tr => tr.start));
    b.until = b.mode === 'each' ? nextTrip(I, after) : Math.min(nextTrip(I, after), ...touches);
  }
  // An arm (or a pair of hands) that starts while the last is still coming down carries on from there.
  for (const P of S.people.values()) { chainHeld(P.arms); chainHeld(P.fingers); }
  S.ledger = Object.freeze(S.ledger.map(Object.freeze));
  S.facts = Object.freeze({start: Object.freeze(start), end: Object.freeze(facts(S))});
  S.sounds.sort((x, y) => x.time - y.time);
  return S;
}
