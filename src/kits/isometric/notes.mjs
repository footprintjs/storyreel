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
 * A note is {level: 'warn' | 'info', path, message}. With `strict: true` a warning refuses the film (index.mjs).
 */
import {hairpins, NO_ROUTE} from 'footprint-story/isometric';

/** Crossings are said from three on (wires cross in every diagram), turns from four: StoryDeck's thresholds. */
export const NOTE_FROM = Object.freeze({crosses: 3, turns: 4});
const STRAIGHT = {
  heights: ['info', 'the two stand at different heights'],
  foot: ['warn', 'one of the two has no free place at a foot that can be seen — move the blocks round it away, or make it wider (size)'],
  way: ['warn', 'there is no way along the floor between them — leave floor free round them'],
  work: ['info', 'the map is too big to lay every wire along the floor'],
  wide: ['info', 'the blocks stand too far apart for the smallest of them to lay wires between'],
  port: ['warn', 'one of its ports has no way out: another block stands right in front of it, or the floor there is closed — move that block, or the port'],
};
const SHOWN = 80;
const cut = (text) => ([...text].length > SHOWN ? `${[...text].slice(0, SHOWN).join('')}…` : text);

/** What there is to say of one wire's way: [{level, message}] (the entry is added by notesOf). */
function wireNotes(w) {
  const out = [], said = (level, message) => out.push({level, message}), r = w.route, {from, to} = w.arrow, plain = `${from.block.name} to ${to.block.name}`;
  if (!r) return out;   // written straight: what it asked for
  if (!r.points) {
    const key = Object.keys(NO_ROUTE).find((k) => NO_ROUTE[k] === r.why), [level, why] = STRAIGHT[key] ?? ['info', r.why];
    said(level, `is drawn straight, through the air, not along the floor: ${why}`);
    return out;
  }
  // a port on a back side starts (or ends) the cable behind its own block: said as that, not as a block to move
  const back = [0, 1].filter((k) => r.ports?.[k] && /^back-/.test(r.feet[k])).map((k) => (k ? to.block.name : from.block.name));
  const behind = r.behind.filter((name) => !back.includes(name));
  if (back.length) said('info', `plugs into a port on the back of ${back.join(', ')}: that stretch of it runs behind ${back.length === 1 ? 'that block' : 'those blocks'}, hidden`);
  if (behind.length) said('warn', `passes behind ${behind.join(', ')}: that stretch of it is hidden — move ${behind.length === 1 ? 'it' : 'them'} or the two blocks (at) so there is floor to see between, or draw the wire straight ("arrow": "${plain} 0")`);
  if (r.shared) said('warn', 'lies on another wire for want of room: a foot of a block has a place for three wires — make the block wider (size), or take a wire out');
  if (r.crosses >= NOTE_FROM.crosses) said('info', `crosses ${r.crosses} other wires`);
  if (r.bends >= NOTE_FROM.turns) said('info', `turns ${r.bends} times on its way`);
  for (const at of hairpins(r.path ?? [], r.ports ?? [])) {
    const [end, hook] = at.split('-'), name = end === 'start' ? from.block.name : to.block.name;
    if ((end === 'start' || end === 'end') && !hook) said('warn', `doubles back on itself where it leaves ${name}: that port faces away from where the cable goes — put the port on the side of ${name} that faces the way the cable runs (ports), or turn that block`);
    if ((end === 'start' || end === 'end') && hook === 'hook') said('info', `makes a short loop near its port on ${name} — moving the port along its side may straighten it`);
    if (at === 'middle') said('warn', 'doubles back on itself on the floor, a tight U-turn round something in its way — move the blocks so there is a straighter way, or draw the wire straight');
  }
  return out;
}

/** Every note on a built map, in the order of its entries: blocks, floors, wires. */
export function notesOf(map) {
  const notes = [], add = (p, level, message) => notes.push({level, path: p.path, message: `${p.who}: ${message}`});
  for (const b of map.blocks) {
    if (b.smallFitted && !b.smallFitted.fits) add(b, 'warn', `its small line "${cut(b.small)}" does not fit under its label even at ${b.smallFitted.size} px — shorten it, or give the block a bigger top (size)`);
    if (b.fitted && !b.fitted.fits) add(b, 'warn', `its label "${cut(b.label)}" does not fit its top even on two lines at ${b.fitted.size} px — shorten it, or give the block a bigger top (size: a top is as wide across its middle as the block's shorter side is long)`);
  }
  for (const f of map.floors) {
    if (f.place && !f.place.fits) add(f, 'warn', `its label "${cut(f.label)}" does not fit along its front edge even on two lines at the least size (or two lines are deeper than the floor) — shorten it, or make the floor longer (size)`);
    else if (f.place?.covered) add(f, 'warn', `its label "${cut(f.label)}" is covered by a block or a cable at every place along its front edge — leave floor clear along that edge (move a block, or make the floor longer)`);
  }
  for (const w of map.wires) for (const n of wireNotes(w)) add(w, n.level, n.message);
  return notes;
}
