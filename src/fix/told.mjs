// told — what the film already knows and a review must say: a key the director left out (film.director.dropped).
//
// WHY: it lived only on the film's record, so an agent that runs `storyreel check` after an edit was never told. A
// director that leaves out the close-up the voice asked for, with the seconds that would keep it, is a finding like any
// other: it names its recipe entry and the fix, at its own level (DROP_KINDS). Read from the film, never worked out
// again here.

/**
 * A left-out key's level (director/framing.mjs · DROP_LEVELS) as the kind of finding: `director` asks for a fix (a shot
 * the rules asked for, lost to the voice's timing), `director-note` is advice (the director's own grammar held it back).
 * A level the director adds later is a finding to fix until it is mapped.
 */
export const DROP_KINDS = Object.freeze({warn: 'director', note: 'director-note'});

/** When a key left out would have landed: its own time, else its scene's start (a film compiled without the voice's times). */
const dropAt = (film, d) => (Number.isFinite(d.t) ? d.t : film.clock.start(d.scene));

/** The keys the director left out whose moment falls in the window. */
export const dropsIn = (film, window) => (film.director?.dropped ?? []).filter(d => { const t = dropAt(film, d); return t >= window.from - 1e-9 && t <= window.to + 1e-9; });

/** What was left out, in a few words: the shot (or the mood), the sentence, and where it would have landed. */
function leftOutWhat(d) {
  const into = d.path === null || d.path === undefined ? '' : d.path === 'focus' ? ' in the focus' : ` in ${d.path}'s ${d.kind === 'mood' ? 'acting' : 'camera'}`;
  const shot = d.kind === 'mood' ? `${d.who}'s "${d.mood}" (${d.name})` : `the ${d.name} key on "${[d.on].flat().join('" + "')}"${d.size ? ` (${d.size})` : ''}`;
  return `${shot} at ${d.said}${into}: ${d.why}`;
}

/** The director's left-out keys as hits: [{kind, t, what, where, fix?}], each at the moment it would have landed. Its entry is the recipe's `director`. */
export function droppedShots({film, window}) {
  return dropsIn(film, window).map(d => ({kind: DROP_KINDS[d.level] ?? 'director', t: dropAt(film, d), what: leftOutWhat(d), where: 'director', ...(d.fix ? {fix: d.fix} : {})}));
}
