/**
 * The actions as events in time order. Most actions are one event, on their beat; a count is one event a beat (each
 * thing hops on its own word), and a count on fingers is one event as the hands come up and one for each fold or
 * raise. Events run in time order, the list order breaking ties, so each sees the story exactly as it stands at its
 * moment — a count's later beats have not happened yet when something else starts between them.
 *
 *   {at, a, beat}   beat: the count's beat index, the fold or raise index, or null for an action's own event
 */
export function eventsOf(actions) {
  const out = [];
  for (const a of actions) {
    if (a.do === 'count') a.times.forEach((at, beat) => out.push({at, a, beat, order: beat}));
    else if (a.do === 'countOnFingers') {
      out.push({at: a.start, a, beat: null, order: 0});
      (a.fold ?? a.raise ?? []).forEach((at, beat) => out.push({at, a, beat, order: beat + 1}));
    } else out.push({at: a.start, a, beat: null, order: 0});
  }
  return out.sort((x, y) => x.at - y.at || x.a.i - y.a.i || x.order - y.order);
}
