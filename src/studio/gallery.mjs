/**
 * The studio's gallery: a card for every way a shot can come in — the film's transitions (transitions.mjs ·
 * transitionCatalog: the built-in ones and its kits') — and every way a word of kinetic type can land (kits/kinetic ·
 * WORD_MOVES), each playing on a loop, to pick by eye. A card's frames are drawn by the code that draws a film: a
 * transition between the two sample pictures (sheet.mjs · transitionSample), a move by the kinetic kit itself, on one
 * word: the move's own name. A card is one PNG, its frames in rows of `columns`, for the page to step through `fps` a
 * second: a hold on the picture before, the change at its own seconds, a hold after.
 *
 * Each card says only what the library's data says of it: a transition's family and seconds, a move's feel and seconds.
 */
import {createCanvas} from '@napi-rs/canvas';
import {MOVES} from '../moves.mjs';
import {transitionSample} from '../sheet.mjs';
import {compileKinetic, WORD_MOVES} from '../kits/kinetic/index.mjs';

/** A card's frame (px), its frames a second, the seconds held before and after the change, frames to a row of its PNG. */
export const CARD = Object.freeze({width: 320, height: 180, fps: 15, before: .5, after: .7, columns: 8});

/** A card as the page lists it: what it sets (enter, move), its name, what the data says of it, and its frames' layout. */
function cardOf(kind, name, about, seconds) {
  const frames = Math.round((CARD.before + seconds + CARD.after) * CARD.fps);
  return {kind, name, about, seconds, frames, columns: Math.min(frames, CARD.columns), fps: CARD.fps, width: CARD.width, height: CARD.height};
}

/** Every card, the transitions (the collection's order) and then the word moves (the move table's). */
export function galleryCards(catalog) {
  return [...Object.entries(catalog).map(([name, tr]) => cardOf('enter', name, `${tr.family} · ${tr.seconds} s`, tr.seconds)),
    ...WORD_MOVES.map(name => cardOf('move', name, `${MOVES[name].feel} · ${MOVES[name].seconds} s`, MOVES[name].seconds))];
}

/**
 * A word move as the kinetic kit draws it: a kinetic world of one word — the move's name — landing after the hold, on
 * a clock of its own (a word given its time: the kit reads only `at` and the end).
 */
function wordSample(name, seconds) {
  const lands = CARD.before, clock = {at: () => lands, total: lands + seconds + CARD.after};
  return compileKinetic({words: [{text: name, at: ['card', name]}], move: name}, clock).draw;
}

/** A transition on the card's clock: at t, (t − before) / seconds of the way through its change (a cut, 0 s, jumps at before). */
const transitionAt = sample => (c, t) => sample.draw(c, sample.seconds > 0 ? (t - CARD.before) / sample.seconds : t >= CARD.before ? 1 : 0);

/** A card's frames as one PNG: frame i at i / fps seconds on the card's own clock, laid left to right in rows of `columns`. */
export async function cardFrames(card, catalog) {
  const {frames, columns, width: w, height: h, fps} = card, rows = Math.ceil(frames / columns);
  const draw = card.kind === 'enter' ? transitionAt(transitionSample(card.name, catalog)) : wordSample(card.name, card.seconds);
  const sheet = createCanvas(columns * w, rows * h), c = sheet.getContext('2d');
  for (let i = 0; i < frames; i++) {
    c.save(); c.translate((i % columns) * w, Math.floor(i / columns) * h); c.beginPath(); c.rect(0, 0, w, h); c.clip(); c.scale(w / 1600, w / 1600);
    draw(c, i / fps);
    c.restore();
  }
  return sheet.encode('png');
}

/**
 * A cache with a bound on its entries and on their bytes, the oldest used dropped first: what the studio keeps of the
 * cards it drew (each asked for by a name checked against the gallery, so a loop of requests cannot grow it).
 */
export function boundedCache({most = 64, bytes = 64 * 2 ** 20} = {}) {
  const kept = new Map(); let held = 0;
  const drop = key => { held -= kept.get(key).length; kept.delete(key); };
  return {
    async get(key, make) {
      if (kept.has(key)) { const value = kept.get(key); kept.delete(key); kept.set(key, value); return value; }
      const value = await make();
      if (kept.has(key)) drop(key);
      kept.set(key, value); held += value.length;
      while (kept.size > most || (held > bytes && kept.size > 1)) drop(kept.keys().next().value);
      return value;
    },
    clear() { kept.clear(); held = 0; },
    get size() { return kept.size; },
    get bytes() { return held; },
  };
}
