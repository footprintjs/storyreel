/**
 * notes — what the kit says of the map it built, in words, each naming the recipe entry and the fix: a wire that passes
 * behind a block, lies on another, crosses many, turns often, doubles back, or is drawn straight (and why); a block's
 * name too long for its top; a floor's name that does not fit its edge or finds every place along it covered.
 *
 * The facts are footprint-story/isometric's (a route's `behind`, `shared`, `crosses`, `bends`, `why`; `hairpins`;
 * wordsToFit's `fits`; floorLabelPlace's `fits` and `covered`), and the words follow StoryDeck's `check`
 * (deck/cable.js · readWay, rule name-fit), with the fix written in recipe keys. WHY words: whoever writes the film —
 * a person or a model — is told "app to db passes behind logs" and moves one block, instead of looking at frames.
 *
 * A note is {level: 'warn' | 'info', path, message, fix?}: `fix` the change, when it names one — the words after " — " in
 * the message, so a check can say what is wrong and the fix apart (fix/told.mjs). With `strict: true` a warning
 * refuses the film (index.mjs).
 */
import {hairpins, NO_ROUTE} from 'footprint-story/isometric';

/** Crossings are said from three on (wires cross in every diagram), turns from four: StoryDeck's thresholds. */
export const NOTE_FROM = Object.freeze({crosses: 3, turns: 4});
const STRAIGHT = {
  heights: ['info', 'the two stand at different heights'],
  foot: ['warn', 'one of the two has no free place at a foot that can be seen', 'move the blocks round it away, or make it wider (size)'],
  way: ['warn', 'there is no way along the floor between them', 'leave floor free round them'],
  work: ['info', 'the map is too big to lay every wire along the floor'],
  wide: ['info', 'the blocks stand too far apart for the smallest of them to lay wires between'],
  port: ['warn', 'one of its ports has no way out: another block stands right in front of it, or the floor there is closed', 'move that block, or the port'],
};
/** A note's words: what is wrong, then " — " and the fix when there is one, which the note also carries apart. */
const worded = (what, fix = null) => (fix ? {message: `${what} — ${fix}`, fix} : {message: what});
const SHOWN = 80;
const cut = (text) => ([...text].length > SHOWN ? `${[...text].slice(0, SHOWN).join('')}…` : text);

/**
 * How many hand-drawn strokes a world may hold (ours): from `note` on, the world's notes say so (a frame of every stroke
 * finished cost about 23 ms at 2,496 strokes, 40 ms at 4,672, on the machine `bench/strokes.mjs` was run on, against
 * under 1 ms plain); past `most` the world is refused. WHY a budget: a hatch is a stroke per line, so a fine spacing
 * over many blocks multiplies into a film that draws for minutes; said once, with the fix, before anything renders.
 */
export const STROKE_BUDGET = Object.freeze({note: 2000, most: 20000});

/** The `stroke` items in a built map's paint lists (its blocks' and its floors'). */
export const strokeCount = (map) => [...map.blocks, ...map.floors].reduce((n, p) => n + p.paint.filter((it) => it.item === 'stroke').length, 0);

/**
 * How many marks of a texture's `lines` cost a frame what one stroke does (ours, measured by `bench/strokes.mjs` on one
 * machine, node 24): a stroke is a ring filled, about 9 µs a frame; a grain mark is one segment of a path stroked once a
 * face, about 0.25 to 0.3 µs — so 32 marks count as one stroke against STROKE_BUDGET. WHY counted at all: the grain
 * (`human:grain`, the `paper-grain` look) is one `lines` item a face but up to 2,048 marks in it, and a big world of
 * fine grain (256 blocks, spacing 4: 264,156 marks) draws about 67 ms a frame.
 */
export const MARKS_PER_STROKE = 32;

/** The marks (segments) of the `lines` items a texture lays over a map's faces: every `lines` item but the floors' tile lines (role `grid`, the map's own). */
export const markCount = (map) => [...map.blocks, ...map.floors].reduce((n, p) => n + p.paint.reduce((k, it) => k + (it.item === 'lines' && it.role !== 'grid' ? it.segments.length : 0), 0), 0);

/**
 * A world's hand-drawn strokes and texture marks against STROKE_BUDGET (strokeNotes): with no marks, exactly the
 * strokes' notes; with marks, the two counted together, a stroke for every MARKS_PER_STROKE marks, worded so.
 */
export function drawnNotes(strokes, marks, where) {
  if (!marks) return strokeNotes(strokes, where);
  const load = strokes + Math.ceil(marks / MARKS_PER_STROKE);
  return strokeNotes(load, where, {what: `the map's hand-drawn lines (${strokes} strokes) and its texture's ${marks} marks (${MARKS_PER_STROKE} marks a stroke)`,
    fix: 'give the grain or the hatch a wider spacing (texture: {"name": "human:grain", "spacing": 32}), take the texture out, or draw fewer blocks'});
}

/**
 * A world's strokes against STROKE_BUDGET: [] under `note`, one note from it, a refusal past `most` — each naming the
 * world's style (`${where}: isometric style`) and the fix. `count`: strokeCount of the built map.
 * The options are another kit's own words for the same budget (the whiteboard's drawings, kits/whiteboard/sketch.mjs) — who it
 * is, what the strokes are of, the note's path and the fix; the isometric world's are the usual ones.
 */
export function strokeNotes(count, where, {who = `${where}: isometric style`, what = "the map's hand-drawn lines", path = 'style',
  fix = `give the hatch a wider spacing (texture: {"name": "human:hatch", "spacing": 16}), take the texture out, or draw fewer blocks`} = {}) {
  if (count > STROKE_BUDGET.most) throw new Error(`${who}: ${what} come to ${count} strokes, and a world draws at most ${STROKE_BUDGET.most} — ${fix}`);
  if (count < STROKE_BUDGET.note) return [];
  return [{level: 'info', path, ...worded(`${who}: ${what} come to ${count} strokes (a note from ${STROKE_BUDGET.note}, refused past ${STROKE_BUDGET.most}): each frame fills every stroke drawn so far, so the film renders slower`, `to lighten it, ${fix}`)}];
}

/** What there is to say of one wire's way: [{level, message, fix?}] (the entry is added by notesOf). */
function wireNotes(w) {
  const out = [], said = (level, what, fix) => out.push({level, what, fix}), r = w.route, {from, to} = w.arrow, plain = `${from.block.name} to ${to.block.name}`;
  if (!r) return out;   // written straight: what it asked for
  if (!r.points) {
    const key = Object.keys(NO_ROUTE).find((k) => NO_ROUTE[k] === r.why), [level, why, fix] = STRAIGHT[key] ?? ['info', r.why];
    said(level, `is drawn straight, through the air, not along the floor: ${why}`, fix);
    return out;
  }
  // a port on a back side starts (or ends) the cable behind its own block: said as that, not as a block to move
  const back = [0, 1].filter((k) => r.ports?.[k] && /^back-/.test(r.feet[k])).map((k) => (k ? to.block.name : from.block.name));
  const behind = r.behind.filter((name) => !back.includes(name));
  if (back.length) said('info', `plugs into a port on the back of ${back.join(', ')}: that stretch of it runs behind ${back.length === 1 ? 'that block' : 'those blocks'}, hidden`);
  if (behind.length) said('warn', `passes behind ${behind.join(', ')}: that stretch of it is hidden`, `move ${behind.length === 1 ? 'it' : 'them'} or the two blocks (at) so there is floor to see between, or draw the wire straight ("arrow": "${plain} 0")`);
  if (r.shared) said('warn', 'lies on another wire for want of room: a foot of a block has a place for three wires', 'make the block wider (size), or take a wire out');
  if (r.crosses >= NOTE_FROM.crosses) said('info', `crosses ${r.crosses} other wires`);
  if (r.bends >= NOTE_FROM.turns) said('info', `turns ${r.bends} times on its way`);
  for (const at of hairpins(r.path ?? [], r.ports ?? [])) {
    const [end, hook] = at.split('-'), name = end === 'start' ? from.block.name : to.block.name;
    if ((end === 'start' || end === 'end') && !hook) said('warn', `doubles back on itself where it leaves ${name}: that port faces away from where the cable goes`, `put the port on the side of ${name} that faces the way the cable runs (ports), or turn that block`);
    if ((end === 'start' || end === 'end') && hook === 'hook') said('info', `makes a short loop near its port on ${name}`, 'moving the port along its side may straighten it');
    if (at === 'middle') said('warn', 'doubles back on itself on the floor, a tight U-turn round something in its way', 'move the blocks so there is a straighter way, or draw the wire straight');
  }
  return out;
}

/**
 * The faces of a block whose grain footprint-story laid wider than the style's spacing (its paint item's role
 * `grain-thinned`: a face too big for a face's most marks is thinned evenly, never refused — footprint-story/human ·
 * grainTexture), as the words of a note. WHY say it: the grain on that face reads coarser than on the others, and only
 * the paint list knew.
 */
const thinnedFaces = (b) => b.paint.filter((it) => it.item === 'lines' && it.role === 'grain-thinned').length;

/**
 * How to lay the grain alike on every face: a smaller block, or the grain at twice its spacing everywhere (16 px when
 * none is written: footprint-story's) — written as the style's own texture, which a look's row does not take beside it
 * (read.mjs refuses a texture written beside a look that sets one), so a world that names a look is told to write it out.
 */
function grainFix(map) {
  const wider = 2 * (map.built.style.options?.texture?.spacing ?? 16), texture = `{"name": "human:grain", "spacing": ${wider}}`;
  return map.look ? `make the block smaller (size), or write the grain out wider on every face: "style": {"texture": ${texture}} in place of "look": "${map.look.name}"`
    : `make the block smaller (size), or give the grain a wider spacing on every face (texture: ${texture}, or wider)`;
}

/** Every note on a built map, in the order of its entries: blocks, floors, wires. */
export function notesOf(map) {
  const notes = [], add = (p, level, what, fix) => notes.push({level, path: p.path, ...worded(`${p.who}: ${what}`, fix)});
  for (const b of map.blocks) {
    if (b.smallFitted && !b.smallFitted.fits) add(b, 'warn', `its small line "${cut(b.small)}" does not fit under its label even at ${b.smallFitted.size} px`, 'shorten it, or give the block a bigger top (size)');
    if (b.fitted && !b.fitted.fits) add(b, 'warn', `its label "${cut(b.label)}" does not fit its top even on two lines at ${b.fitted.size} px`, 'shorten it, or give the block a bigger top (size: a top is as wide across its middle as the block\'s shorter side is long)');
    const thinned = thinnedFaces(b);
    if (thinned) add(b, 'info', `its paper grain is laid wider than the style's spacing on ${thinned} face${thinned === 1 ? '' : 's'}: ${thinned === 1 ? 'it is' : 'they are'} too big for the marks a face may hold, so the grain there reads coarser`, grainFix(map));
  }
  for (const f of map.floors) {
    if (f.place && !f.place.fits) add(f, 'warn', `its label "${cut(f.label)}" does not fit along its front edge even on two lines at the least size (or two lines are deeper than the floor)`, 'shorten it, or make the floor longer (size)');
    else if (f.place?.covered) add(f, 'warn', `its label "${cut(f.label)}" is covered by a block or a cable at every place along its front edge`, 'leave floor clear along that edge (move a block, or make the floor longer)');
  }
  for (const w of map.wires) for (const n of wireNotes(w)) add(w, n.level, n.what, n.fix);
  return notes;
}
