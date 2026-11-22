// told — what the film already knows and a review must say: a key the director left out (film.director.dropped), and
// what a world's kit says of the world it built (film.kitNotes: a wire behind a block, a name that does not fit, a
// face whose grain was thinned).
//
// WHY: both lived only on the film's record, so an agent that runs `storyreel check` after an edit was never told. A
// director that leaves out the close-up the voice asked for, with the seconds that would keep it, and a map that says
// a wire is hidden behind a block, are findings like any other: each names its recipe entry and the fix, at its own
// level (DROP_KINDS, NOTE_KINDS). Read from the film, never worked out again here.
import {pictures} from '../director/land.mjs';

/**
 * A left-out key's level (director/framing.mjs · DROP_LEVELS) as the kind of finding: `director` asks for a fix (a shot
 * the rules asked for, lost to the voice's timing), `director-note` is advice (the director's own grammar held it back).
 * A level the director adds later is a finding to fix until it is mapped.
 */
export const DROP_KINDS = Object.freeze({warn: 'director', note: 'director-note'});
/** A world's note's level (a kit's `notes`: `warn` or `info`) as the kind of finding: `world` asks for a fix, `world-note` is advice. A level a kit adds later is a finding to fix until it is mapped. */
export const NOTE_KINDS = Object.freeze({warn: 'world', info: 'world-note'});

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

/**
 * Where each picture is on the film clock: {path → {from, to}} (director/land.mjs · pictures: the story, then each
 * stage, over the scenes it shows). A note names its world by the path it starts with (`story.wires[2]`,
 * `stages[1].world.blocks[0]`).
 */
function pictureSpans(film) {
  const ids = film.timings.scenes.map(s => s.id), out = new Map();
  for (const p of pictures(film.recipe ?? {}, {scenes: film.timings.scenes})) {
    const first = ids.indexOf(p.scenes[0]), last = ids.indexOf(p.scenes.at(-1));
    out.set(p.path, {from: film.clock.offsets[first], to: film.clock.offsets[last] + film.timings.scenes[last].duration});
  }
  return out;
}
const pictureOf = (spans, path) => [...spans.keys()].find(p => path === p || path.startsWith(`${p}.`) || path.startsWith(`${p}[`));

/**
 * The worlds' notes whose world is on screen in the window, each at the first moment it is: [{note, t}]. A note whose
 * world the film never shows (or cannot place) is said at the window's start: never left unsaid.
 */
export function notesIn(film, window) {
  if (!film.kitNotes?.length) return [];
  const spans = pictureSpans(film);
  return film.kitNotes.flatMap(note => {
    const span = spans.get(pictureOf(spans, note.path) ?? '');
    if (!span) return [{note, t: window.from}];
    // on screen inside the window, not only touching its edge (a part that ends where the next picture starts)
    return span.to > window.from + 1e-9 && span.from < window.to - 1e-9 ? [{note, t: Math.max(window.from, span.from)}] : [];
  });
}

/**
 * The worlds' notes as hits: [{kind, t, what, where, fix?}]. A note's message names its world and its entry (`stage
 * map: isometric wires[2] ("w3"): passes behind …`); its fix is the kit's own (`fix`, the words after " — " in the
 * message, which is then said without them).
 */
export function worldNotes({film, window}) {
  return notesIn(film, window).map(({note, t}) => {
    const tail = note.fix ? ` — ${note.fix}` : '', what = tail && note.message.endsWith(tail) ? note.message.slice(0, -tail.length) : note.message;
    return {kind: NOTE_KINDS[note.level] ?? 'world', t, what, where: note.path, ...(note.fix ? {fix: note.fix} : {})};
  });
}
