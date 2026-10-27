/**
 * How a thing travels from one holder to another: a strategy, by name. Each is an arc (principles.mjs · arc: a
 * point-to-point path that curves a little, as a hand's does) eased over its seconds. A travel that anticipates winds
 * the thing back a little before it goes (principles.mjs · anticipate); one that lands squashes it on landing and lets
 * it wobble and settle (principles.mjs · squash). Pure functions of time.
 *
 *   hop    a count: up and over, into the container       toss  a give: hand to hand, across
 *   lift   a pick up or a take out: up to the hands       drop  a put in: down into the container
 *   slide  straight along, no arc
 */
import {arc, anticipate, squash} from '../principles.mjs';
import {easeNamed} from '../ease.mjs';

export const TRAVELS = Object.freeze({
  hop: Object.freeze({seconds: .45, bend: .45, ease: 'inOut', anticipate: true, land: 900}),
  toss: Object.freeze({seconds: .55, bend: .3, ease: 'inOut', anticipate: true, land: 600}),
  lift: Object.freeze({seconds: .35, bend: .12, ease: 'inOut', anticipate: false, land: 0}),
  drop: Object.freeze({seconds: .4, bend: .2, ease: 'in', anticipate: false, land: 700}),
  slide: Object.freeze({seconds: .5, bend: 0, ease: 'inOut', anticipate: false, land: 0}),
});
export const TRAVEL_NAMES = Object.freeze(Object.keys(TRAVELS));

/** A travel's name → the strategy; an unknown name refuses, naming the travels. */
export function readTravel(name, where) {
  if (!(typeof name === 'string' && Object.hasOwn(TRAVELS, name))) throw new Error(`${where}: travel is one of ${TRAVEL_NAMES.join(', ')}, not ${JSON.stringify(name)}`);
  return name;
}

/** Where a thing is on its way, u (0..1) through the trip's seconds: the eased arc from `from` to `to`. */
export function travelPoint(name, from, to, u) {
  const s = TRAVELS[name], e = easeNamed(s.ease)(Math.max(0, Math.min(1, u)));
  return s.bend ? arc(from, to, e, {bend: s.bend, toward: 'up'}) : [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e];
}

/**
 * What the principles add to a thing at t from its trips: the wind-back before each trip that anticipates (an offset
 * [dx, dy]) and the squash of each landing ({sx, sy}, volume kept). `trips` are [{start, end, travel, from, to}] with
 * from and to the launch and landing points.
 */
export function principlesAt(trips, t) {
  let dx = 0, dy = 0;
  const landings = [];
  for (const trip of trips) {
    const s = TRAVELS[trip.travel];
    if (s.anticipate && t > trip.start - .2 && t < trip.start + .15) {
      const [ax, ay] = anticipate(t, {at: trip.start, distance: [trip.to[0] - trip.from[0], trip.to[1] - trip.from[1]]});
      dx += ax; dy += ay;
    }
    if (s.land > 0 && t >= trip.end && t < trip.end + .6) landings.push({at: trip.end, speed: s.land});
  }
  const {sx, sy} = landings.length ? squash(t, {landings}) : {sx: 1, sy: 1};
  return {dx, dy, sx, sy};
}
