/**
 * ride — a wire's packets on the film's clock, by footprint-story/motion's numbers: the run's seconds from a speed in px
 * (rideSeconds), where a packet is over its run (rideProfile, eased by length; withHold for a rest at the end), how much
 * of it shows (showStops: in over 12% of the ride, out over the run's last 15%, or kept at the end), and where it fades
 * before a stretch a block hides (hiddenRamps). StoryDeck turns the very same stops into CSS (deck/rides.js); here they
 * are read at t. WHY the shared numbers: at the same second of a run a deck's packet and a film's stand at the same
 * share of the same line.
 *
 * Packets loop on one clock, each its share of a run behind the one before (a deck's `-k × period / packets` delay),
 * from the wire's `start` (or the moment it appears; else the film's start). A pure function of t: nothing is stepped.
 */
import {hiddenRamps, rideProfile, rideSeconds, showStops, withHold} from 'footprint-story/motion';
import {ISO_LIMITS} from './read.mjs';

/** A running packet's radius in px, as StoryDeck draws it (deck.css · .run, r 7). */
export const PACKET_RADIUS = 7;

/** A value on stops [[time, value], …] (straight lines between, held past the ends): a film's own interpolation of CSS's linear(). */
export function onStops(stops, u) {
  if (u <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [t1, v1] = stops[i];
    if (u <= t1) { const [t0, v0] = stops[i - 1]; return t1 > t0 ? v0 + ((v1 - v0) * (u - t0)) / (t1 - t0) : v1; }
  }
  return stops.at(-1)[1];
}

/**
 * How a wire's packets ride its line, worked out once: {period, ride, show, ramps, from} or null for none. `w` the wire
 * (read.mjs), `length` its line's px, `from` the second its packets begin. A px speed whose run falls outside 0.5–60 s
 * is refused, naming the speeds that line takes.
 */
export function rideOf(w, length, from) {
  if (!w.packets) return null;
  const [least, most] = ISO_LIMITS.seconds, ease = w.ride, along = length * (1 + ease[0] + ease[1]);
  let seconds = w.seconds;
  if (w.perSecond) {
    const asked = along / w.perSecond;
    if (!(asked >= least && asked <= most)) {
      const slowest = Math.ceil((along / most) * 10) / 10, fastest = Math.floor((along / least) * 10) / 10;
      throw new Error(`${w.who}: speed "${w.perSecond}px": its line is ${Math.round(length)} px long, so a run would take ${+asked.toFixed(2)} s, and a run takes ${least} to ${most} s — give it ${slowest}px to ${fastest}px, or its seconds (3)`);
    }
    seconds = rideSeconds(length, w.perSecond, ease);
  }
  const hold = w.rest ?? 0, period = seconds + hold, share = seconds / period, steady = along / seconds;
  return {period, seconds, ride: withHold(rideProfile(ease, length), share), show: showStops(share, {end: w.rest !== null}),
    ramps: w.behind ? hiddenRamps(w.cable.unseen, length, steady, ease, {radius: PACKET_RADIUS}) : [], from};
}

/** How much of a packet at share `p` of its line shows by the hidden ramps: 1 in the open, 0 behind a block, straight between (deck/rides.js · seenOf). */
function seenAt(ramps, p) {
  let seen = 1;
  for (const [outFrom, outTo, backFrom, backTo] of ramps) {
    const terms = [...(outTo > outFrom ? [(outTo - p) / (outTo - outFrom)] : []), ...(backTo > backFrom ? [(p - backFrom) / (backTo - backFrom)] : [])];
    seen = Math.min(seen, terms.length ? Math.max(0, Math.min(1, Math.max(...terms))) : 0);
  }
  return seen;
}

/**
 * The packets of a wire at t: [{share, alpha, k}] — where each is along the line (0 to 1, by length) and how much of it
 * shows (0 to 1). The first leaves at `from`, each next a share of a run after it, so once all have left they stand
 * where a deck's loops stand (spaced period / packets apart). None before it begins.
 */
export function packetsAt(r, packets, t) {
  if (!r || t < r.from) return [];
  const out = [];
  for (let k = 0; k < packets; k++) {
    const into = t - r.from - (k * r.period) / packets;
    if (into < 0) continue;
    const u = (into % r.period) / r.period, share = onStops(r.ride, u);
    out.push({share, alpha: onStops(r.show, u) * seenAt(r.ramps, share), k});
  }
  return out;
}
