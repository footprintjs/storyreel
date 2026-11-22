/**
 * motion-side — the moves a body makes along a level, planned side on: `roll`, `slide` and `tumble` (footprint-story
 * 0.31). Each is footprint-story's intent in the upright plane through the body's way — x along the way from where it
 * starts, y down, in the world's own px — and the kit lays the samples back on the floor along that way.
 *
 *   SIDE_ROWS                 roll, slide and tumble: their rows of motion.mjs · INTENT_OF
 *
 * Where a sample puts the body's foot (`sideFoot`) and the world's own px in a tile (`worldPx`) are footprint-story's
 * (`/isometric`, 0.32.0), as are the place rules these rows check a way by (`landingUnder`, `overTop`, `cornerOf`).
 *
 * WHY side on, not on the frame: these models move a body along a level floor under gravity, and a floor seen from a
 * corner is no level line on the frame — a roll planned on the frame would run down a 27° slope. In the upright plane
 * through its way the floor is level and gravity is down, as the models take them; and the turn a sample gives
 * (+ clockwise side on: a roll to +x turns +) is the body rolling forward about the line in the floor across its way,
 * which turn.mjs draws in three dimensions.
 *
 * WHY the world's px are a tile's true length: the grid is a parallel projection, and a floor line running level across
 * the frame (along a column less a row) is drawn at its true length — a tile's width over √2 for each tile. Lengths and
 * heights in that plane are the same px, so distance / radius is a true turn. (A throw is planned on the frame, where a
 * height is drawn foreshortened, cos 30° of it: those moves are as 0.43.0 planned them.)
 *
 * What a film adds to footprint-story's words: `to` as the world's places (a block's name or tiles, motion-read.mjs);
 * the radius, shape and floor from the block itself — the author writes intent only.
 */
import {landingUnder, overTop, cornerOf} from 'footprint-story/isometric';

const round3 = (v) => Math.round(v * 1000) / 1000;
const tilesText = (t) => `[${t.map((v) => round3(v)).join(', ')}]`;
/** How near two lifts may be and still be one level, in tiles: far under a pixel. */
const LEVEL = 1e-6;
/** How near a heading must lie to a row or a column to run along it (a unit vector's part): floats, not a slant. */
const ALONG = 1e-9;

const onWords = (u) => (u.block ? `"${u.block.name}"'s top (lift ${round3(u.lift)})` : 'the floor');
/** Tiles written for a fix, with a lift only when it is above the floor. */
const placeText = (c, r, lift) => `[${round3(c)}, ${round3(r)}${lift > LEVEL ? `, ${round3(lift)}` : ''}]`;

/** The way from `foot` to `to` on the floor: {length, heading} (tiles, a unit), or a refusal when there is none. */
function wayOf(e, foot, to, words) {
  const d = [to[0] - foot[0], to[1] - foot[1]], length = Math.hypot(d[0], d[1]);
  if (length < LEVEL) throw new Error(`${e.who}: to is ${words} — a ${e.do} goes somewhere along the floor: give a place apart from where it stands`);
  return {length, heading: [d[0] / length, d[1] / length]};
}

/**
 * A roll or a slide: along the level the block rests on — the floor, or the top of a block (its middle over it at both
 * ends: a straight way between two points of a top stays on it) — to `to`, at that level. footprint-story picks the
 * start speed that brings it to rest exactly there. A roll's radius is the ball's; a slide's foot rides the floor.
 */
function alongLevel(e, {foot, at, piece, target, others, unit}, rolls) {
  const under = landingUnder(at, piece.size, others), name = piece.name;
  if (Math.abs(foot[2] - under.lift) > LEVEL) throw new Error(`${e.who}: a ${e.do} goes along what "${name}" rests on, and it stands in the air at lift ${round3(foot[2])} (under it is ${onWords(under)}) — let it fall first (do: "fall"), or tumble it down (do: "tumble")`);
  if (!overTop(foot, under)) throw new Error(`${e.who}: "${name}" rests on the edge of ${onWords(under)}, its middle past it — a ${e.do} along it would leave it at once: stand it on the top (at), or let it fall`);
  const to = target(e.to, 'to');
  if (Math.abs(to[2] - under.lift) > LEVEL) {
    const fix = e.to.block ? `${e.do} it to tiles beside "${e.to.block.name}" (${placeText(to[0], to[1], under.lift)}), or throw it up (do: "throw")` : `give to at its level (${placeText(to[0], to[1], under.lift)}), or tumble it there (do: "tumble")`;
    throw new Error(`${e.who}: a ${e.do} keeps to the level it starts on, ${onWords(under)}, and to is at lift ${round3(to[2])} — ${fix}`);
  }
  const {length, heading} = wayOf(e, foot, to, 'where it stands');
  const there = landingUnder(cornerOf(to, piece.size), piece.size, others);
  if (there.block !== under.block || !overTop(to, under)) {
    throw new Error(`${e.who}: its way runs off ${onWords(under)} — at to ${tilesText(to)} its middle is past the top's edge, and a ${e.do} keeps to the level it starts on: a to on that top, or throw it (do: "throw")`);
  }
  const lift = under.lift, r = rolls ? piece.size[0] / 2 : 0, y = -unit * (lift + r) || 0;   // || 0: on the floor, 0 and never −0
  const intent = rolls ? {from: [0, y], to: [unit * length, y], radius: unit * r, shape: 'ball'} : {from: [0, y], to: [unit * length, y]};
  return {intent, end: [to[0], to[1], lift], tie: 'foot', leans: under.block ? [under.block] : [], side: {origin: [foot[0], foot[1]], heading, unit, offset: r, levels: [lift]}, turns: rolls};
}

/**
 * A tumble: through the air spinning, landing its foot on `to` (a block's top or the floor, no higher than it starts),
 * then rolling on (a ball) or sliding on (a block) along the same way, as footprint-story's landing rule says. Where it
 * comes to rest is footprint-story's: `endOf(sample)` takes the plan's last sample, and refuses an end off the top it
 * landed on. A block tumbles end over end about one of its own edges, so its way runs along a row or a column, and it
 * is as long along its way as it is high: then each face it lands on shows the very block again (turn.mjs draws it in
 * between). A cylinder is refused in motion-read.mjs.
 */
function tumble(e, {foot, at, piece, target, others, unit}) {
  const to = target(e.to, 'to'), name = piece.name;
  const {length, heading} = wayOf(e, foot, to, `straight ${to[2] < foot[2] ? 'below' : 'above'} it (a tumble flies across: or let it fall, do: "fall")`);
  if (to[2] > foot[2] + LEVEL) throw new Error(`${e.who}: a tumble flies down onto to, and to (lift ${round3(to[2])}) is above where "${name}" starts (lift ${round3(foot[2])}) — throw it up (do: "throw"), or tumble it to a place no higher`);
  let r, shape = 'ball';
  if (piece.kind === 'block') {
    const along = Math.abs(heading[0]) > 1 - ALONG ? 0 : Math.abs(heading[1]) > 1 - ALONG ? 1 : null;
    if (along === null) throw new Error(`${e.who}: a block tumbles end over end about one of its own edges, so its way runs along a row or a column, and this one runs between them — to: ${placeText(to[0], foot[1], to[2])} or ${placeText(foot[0], to[1], to[2])}`);
    if (Math.abs(piece.size[along] - piece.size[2]) > ALONG) {
      const size = [...piece.size]; size[along] = piece.size[2];
      throw new Error(`${e.who}: a block tumbling end over end lands on a face, and shows the same block again only when it is as long along its way as it is high — "${name}" is ${round3(piece.size[along])} tiles along its way and ${round3(piece.size[2])} high: make them equal (size: ${tilesText(size)}), or slide it (do: "slide")`);
    }
    r = piece.size[2] / 2; shape = 'box';
  } else r = piece.size[0] / 2;
  const landing = landingUnder(cornerOf(to, piece.size), piece.size, others);
  if (Math.abs(landing.lift - to[2]) > LEVEL || !overTop(to, landing)) throw new Error(`${e.who}: to ${tilesText(to)} is in the air (under it is ${onWords(landing)}) — land it on a block's top (to: its name) or on the floor (to: [col, row])`);
  const intent = {from: [0, -unit * (foot[2] + r)], to: [unit * length, -unit * (to[2] + r)], radius: unit * r, shape};
  const goesOn = shape === 'ball' ? 'rolls' : 'slides', slows = shape === 'ball' ? 'resistance' : 'kinetic';
  const endOf = (sample) => {
    const along = sample.x / unit, end = [foot[0] + along * heading[0], foot[1] + along * heading[1], to[2]];
    const there = landingUnder(cornerOf(end, piece.size), piece.size, others);
    if (there.block !== landing.block || !overTop(end, landing)) {
      throw new Error(`${e.who}: it lands on ${onWords(landing)} and ${goesOn} on ${round3(along - length)} tiles, off its edge — it would come to rest on nothing: land it on the floor (to: [col, row]), nearer the top's far side, or slow it once it lands (model: {"name": "free-spin", "${slows}": …})`);
    }
    return end;
  };
  return {intent, endOf, tie: 'foot', leans: landing.block ? [landing.block] : [], side: {origin: [foot[0], foot[1]], heading, unit, offset: r, levels: [foot[2], to[2]]}, turns: true};
}

/** The three rows (motion.mjs · INTENT_OF takes them as they are). */
export const SIDE_ROWS = Object.freeze({
  roll: (e, place) => alongLevel(e, place, true),
  slide: (e, place) => alongLevel(e, place, false),
  tumble,
});
