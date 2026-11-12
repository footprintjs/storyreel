/**
 * The fix: one piece of the board at a time. The brief is footprint-story's own (storyboardFixBriefs): the piece as written,
 * its problems, the messages it cites, as data lines. This adds only the form to answer in, as only the host knows what it
 * takes. The answer replaces that piece alone; the whole board is checked again by code.
 */
import {MalformedAnswer, brief, isRecord} from '../port/port.mjs';

const FORM = [
  'Answer with one JSON value and nothing else: the piece as it should be.',
  'For an entry such as checked[1], the entry itself. For a whole list such as checked, the list.',
  'For "frame", an object of only the top-level fields its problems name; a field given as null is taken out.',
].join('\n');

/** The port brief for one piece: the door's instructions and the form, its material as the door made it. */
export function fixBrief(instructions, pieceBrief) {
  const ids = [...pieceBrief.material.matchAll(/^\{"id":("(?:[^"\\]|\\.)*")/gm)].map((m) => JSON.parse(m[1]));
  return brief('fix', `${instructions}\n${FORM}`, `${pieceBrief.piece}\n${pieceBrief.material}`, ids);
}

const ENTRY = /^([^[\]]+)\[(\d+)\]$/;
const headOf = (at) => /^[^.[]+/.exec(at)?.[0] ?? at;
/** Set an own field, whatever its name: `__proto__` from JSON stays a field, never a prototype. */
const put = (target, key, value) => Object.defineProperty(target, key, {value, enumerable: true, writable: true, configurable: true});

/** The fields a frame piece may change: the heads of its problems' places, and the places as written. */
const frameFields = (problems) => new Set(problems.flatMap(({at}) => [headOf(at), at]));

/** A copy of the board with this piece replaced by the answer. Throws MalformedAnswer when the answer is not that piece. */
export function applyPiece(board, {piece, problems}, answer) {
  const copy = structuredClone(board), entry = ENTRY.exec(piece);
  if (piece === 'frame') {
    const allowed = frameFields(problems);
    if (!isRecord(answer) || !Object.keys(answer).every((key) => allowed.has(key) && key !== 'shape')) throw new MalformedAnswer('fix', 'not-a-piece');
    for (const [key, value] of Object.entries(answer)) { if (value === null) delete copy[key]; else put(copy, key, value); }
    return copy;
  }
  if (entry) {
    const [, list, index] = entry, held = copy[list];
    if (!isRecord(answer) || !Array.isArray(held) || Number(index) >= held.length) throw new MalformedAnswer('fix', 'not-a-piece');
    held[Number(index)] = answer;
    return copy;
  }
  if (!Array.isArray(answer)) throw new MalformedAnswer('fix', 'not-a-piece');
  put(copy, piece, answer);
  return copy;
}
