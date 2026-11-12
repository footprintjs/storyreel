/**
 * The merge: every window's points as one list. Two points of one part that rest on a shared message are one point: kept
 * once when they say the same numbers, and marked `ask` when they do not, so a disagreement is never settled silently.
 * Code only: no model, no new words.
 */
import {numbersIn} from 'footprint-story/storyboard';

/** The most points a story is written from. */
export const MOST_POINTS = 24;

/** Why a point stands as it does: fixed words, the same whatever the points say. */
export const POINT_WHY = Object.freeze({
  cited: 'it rests on the messages it cites',
  unsure: 'the picker put it in what is not known',
  'cites-nothing': 'it claims something and cites no message: only the owner can say where it comes from',
  disagree: 'two points on the same messages say different numbers: only the owner can say which is right',
  plan: 'it says what happens next',
});

/** A point's standing before any check: known, not-sure or ask, and why. */
function standingOf({part, sources}) {
  if (part === 'unsure') return {standing: 'not-sure', why: 'unsure'};
  if (part === 'next') return {standing: 'known', why: 'plan'};
  return sources.length ? {standing: 'known', why: 'cited'} : {standing: 'ask', why: 'cites-nothing'};
}

const sameNumbers = (a, b) => { const x = numbersIn(a), y = new Set(numbersIn(b)); return x.length === y.size && x.every((n) => y.has(n)); };
const shares = (a, b) => a.some((id) => b.includes(id));

/**
 * {points, dropped, conflicts}. `picks`: each window's points in window order, [[{part, text, sources}]]. A point keeps the
 * first wording; its sources are every source of the points merged into it.
 */
export function mergePoints(picks) {
  const points = [];
  let dropped = 0, conflicts = 0;
  for (const point of picks.flat()) {
    const same = points.find((p) => p.part === point.part && p.sources.length && shares(p.sources, point.sources));
    if (same) {
      same.sources = [...new Set([...same.sources, ...point.sources])];
      if (!sameNumbers(same.text, point.text) && same.why !== 'disagree') { Object.assign(same, {standing: 'ask', why: 'disagree'}); conflicts++; }
      continue;
    }
    if (points.length >= MOST_POINTS) { dropped++; continue; }
    points.push({...point, sources: [...point.sources], ...standingOf(point)});
  }
  return {points, dropped, conflicts};
}

/** A point as state may hold it: its part, sources and standing, never its words. */
export const pointFacts = ({part, sources, standing, why}) => ({part, sources: [...sources], standing, why});
