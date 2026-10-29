/**
 * kinetic — words that slam in as the voice says them: kinetic type, a launch film's grammar, as a world kit. The
 * words are data; each lands on the moment the voice says it (the scene's said words, in order), enters with a move from
 * the shared table (footprint-story/motion: slam by default, any entrance a word may make) and holds until the next one
 * lands. Nothing is guessed: a word the voice never says needs a time of its own.
 *
 *   {"type": "world", "scene": "beat", "world": {"kit": "kinetic", "scene": "beat", "words": ["Every", "beat", "on", "cut"]}}
 *   {"kit": "kinetic", "scene": "beat", "words": ["Every", {"text": "BEAT", "at": ["beat", "on the beat"]}], "style": "stack", "flip": true}
 *
 * on      "voice" (the default): each word on its spoken word; "beats": word after word on the scene's beats (a film timed
 *         by its song: footprint-storyreel/music · beatTimings), `every` beats apart (1)
 * style   "slam" (the default): one word at a time, as big as it fits; "stack": the words build up, line under line,
 *         the earlier ones a little dimmer
 * move    the entrance each word makes (slam): a move from the shared table whose kind is entrance and use is text
 * flip    the ground and the ink swap at every word (a light card, a dark card), as a launch film cuts colour on the beat
 * colors  [ground, ink] ("#f3eee3", "#1a1a1a")
 * sound   a sound at every word that lands (tap, click, whoosh …), or none (the default)
 * size    the largest a word is drawn, px on the 1600×900 frame (480); a word too wide for the frame is drawn smaller
 *
 * No words ("words": []) is the ground alone: a beat of plain colour between words, as a launch film cuts to one.
 */
import {moveAt, readMove, MOVES, MOVE_NAMES} from 'footprint-story/motion';
import {applyMove} from '../../moves.mjs';
import {SOUND_NAMES} from '../../sound.mjs';

export const KINETIC = Object.freeze({size: 480, colors: Object.freeze(['#f3eee3', '#1a1a1a']), font: '"Avenir Next", Arial, sans-serif', fit: .86, line: 1.02, dim: .45, most: 40});

/** A move a whole word makes: an entrance for text that neither splits the word into words or letters nor counts it up. */
const wholeWord = (move) => move.kind === 'entrance' && move.uses.includes('text') && move.split === undefined && move.props.progress === undefined;
/** The built-in moves a word may enter with (`move`): the one rule, read by the kit and by the studio's gallery. */
export const WORD_MOVES = Object.freeze(MOVE_NAMES.filter((name) => wholeWord(MOVES[name])));

/** A word's entrance, checked: a move's name (or one of your own, as data) that a whole word makes; a refusal names the ones that are. */
export function readWordMove(given, where) {
  if (typeof given === 'string' && !Object.hasOwn(MOVES, given)) throw new Error(`${where}: kinetic move "${given}" is not a move — name one a whole word makes (${WORD_MOVES.join(', ')})`);
  const move = readMove(given, `${where}: kinetic move`);
  if (!wholeWord(move)) throw new Error(`${where}: kinetic move "${move.name}" is not an entrance a whole word makes — name one that is (${WORD_MOVES.join(', ')})`);
  return move;
}
const STYLES = Object.freeze(['slam', 'stack']);
const KEYS = Object.freeze(['kit', 'scene', 'words', 'on', 'every', 'style', 'move', 'flip', 'colors', 'sound', 'size']);
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
/** A word as a reader and the voice compare it: its letters, their marks (a vowel sign is part of its word) and digits, lower case. */
const bare = (s) => String(s).normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '');
/** Seconds after a word lands before it can be read (a slam is blurred and faint that long): its text counts from then. */
const LEGIBLE = .2;

/** The spec, checked: each refusal names the fix. */
function readSpec(spec, where) {
  for (const k of Object.keys(spec)) if (!KEYS.includes(k)) throw new Error(`${where}: kinetic takes ${KEYS.filter((x) => x !== 'kit').join(', ')} — not "${k}"`);
  const words = spec.words;
  if (!Array.isArray(words) || words.length > KINETIC.most) throw new Error(`${where}: kinetic words is a list of up to ${KINETIC.most} words, each "text" or {text, at} ([]: the ground alone, a beat of plain colour)`);
  const style = spec.style ?? 'slam';
  if (!STYLES.includes(style)) throw new Error(`${where}: kinetic style is ${STYLES.join(' or ')}, not ${JSON.stringify(spec.style)}`);
  const move = readWordMove(spec.move ?? 'slam', where);
  const colors = spec.colors ?? KINETIC.colors;
  if (!Array.isArray(colors) || colors.length !== 2 || !colors.every((c) => HEX.test(c))) throw new Error(`${where}: kinetic colors is [ground, ink], two hex colours ("#f3eee3"), not ${JSON.stringify(spec.colors)}`);
  if (spec.sound !== undefined && spec.sound !== null && !SOUND_NAMES.includes(spec.sound)) throw new Error(`${where}: kinetic sound is one of ${SOUND_NAMES.join(', ')}, or none — not ${JSON.stringify(spec.sound)}`);
  const size = spec.size ?? KINETIC.size;
  if (!(Number.isFinite(size) && size >= 24 && size <= 600)) throw new Error(`${where}: kinetic size is the largest a word is drawn, 24 to 600 px, not ${JSON.stringify(spec.size)}`);
  if (spec.flip !== undefined && typeof spec.flip !== 'boolean') throw new Error(`${where}: kinetic flip is true or false`);
  const on = spec.on ?? 'voice', every = spec.every ?? 1;
  if (on !== 'voice' && on !== 'beats') throw new Error(`${where}: kinetic on is "voice" (each word as it is said) or "beats" (word after word on the scene's beats), not ${JSON.stringify(spec.on)}`);
  // 8 is music.mjs · MUSIC.mostEvery (not imported: a kit stays off the song's I/O); a test pins the two equal.
  if (!(Number.isInteger(every) && every >= 1 && every <= 8)) throw new Error(`${where}: kinetic every is the beats between two words, a whole number 1–8, not ${JSON.stringify(spec.every)}`);
  if (spec.every !== undefined && on !== 'beats') throw new Error(`${where}: kinetic every counts beats — set on: "beats" too, or leave every out`);
  return {words, on, every, style, move, colors, flip: spec.flip === true, sound: spec.sound ?? null, size, scene: spec.scene ?? null};
}

/**
 * When each word lands: the next said word of the scene that matches it (letters and digits, any case), in order; a word
 * written {text, at} at its anchor (clock.at). A word the voice does not say, without an at, refuses — naming what is said.
 */
/** An at as an anchor is written: [scene, phrase, plus?] or {scene, phrase, …}. */
const anchorLike = (a) => (Array.isArray(a) ? a.length >= 2 && a.length <= 3 && typeof a[0] === 'string' && typeof a[1] === 'string'
  : a && typeof a === 'object' && typeof a.scene === 'string' && typeof a.phrase === 'string');

function landings(s, clock, where) {
  if (s.on === 'beats') return onBeats(s, clock, where);
  const said = s.scene === null ? [] : clock.words(s.scene);
  let from = 0;
  return s.words.map((w, i) => {
    const text = typeof w === 'string' ? w : w?.text;
    if (typeof text !== 'string' || !text.trim()) throw new Error(`${where}: kinetic words[${i}] is "text" or {text, at}, not ${JSON.stringify(w)}`);
    if (typeof w === 'object' && w.at !== undefined) {
      if (!anchorLike(w.at)) throw new Error(`${where}: kinetic word "${text}": at is an anchor, ["scene", "phrase"] (or ["scene", "phrase", seconds after]) — not ${JSON.stringify(w.at)}`);
      return {text: text.trim(), at: clock.at(w.at)};
    }
    if (s.scene === null) throw new Error(`${where}: kinetic word "${text}" has no time — name the scene whose voice the words follow (scene), or give it {text, at}`);
    if (!said.length) throw new Error(`${where}: kinetic word "${text}": scene "${s.scene}" says no words — give each word {text, at}`);
    if (!bare(text)) throw new Error(`${where}: kinetic word "${text}" has no letter or digit for the voice to say — give it {text, at}`);
    if (/\s/.test(text.trim())) throw new Error(`${where}: kinetic word "${text}" is several words — one said word per entry ("Every", "beat"), or give it {text, at} to land them as one`);
    const k = said.findIndex((x, j) => j >= from && bare(x.text) === bare(text));
    if (k < 0) {
      const left = said.slice(from).map((x) => x.text).join(' ');
      throw new Error(`${where}: kinetic word "${text}" is not said in scene "${s.scene}" after the words before it${left ? ` (still to come: "${left.slice(0, 80)}")` : ''} — write it as the voice says it (a number said in words is written as it is said), or give it {text, at}`);
    }
    from = k + 1;
    return {text: text.trim(), at: said[k].start};
  });
}

/**
 * When each word lands on the scene's beats (clock.beats: a film timed by its song): word after word, `every` beats
 * apart; a word written {text, at} at its anchor, the words after it on the beats after that.
 */
function onBeats(s, clock, where) {
  if (s.scene === null) throw new Error(`${where}: kinetic on "beats" lands the words on a scene's beats — name the scene (scene)`);
  const beats = typeof clock.beats === 'function' ? clock.beats(s.scene) : [];
  if (!beats.length) throw new Error(`${where}: kinetic on "beats": scene "${s.scene}" has no beats — time the film by its song (footprint-storyreel/music · beatTimings), or land the words on the voice (on: "voice")`);
  let next = 0;
  return s.words.map((w, i) => {
    const text = typeof w === 'string' ? w : w?.text;
    if (typeof text !== 'string' || !text.trim()) throw new Error(`${where}: kinetic words[${i}] is "text" or {text, at}, not ${JSON.stringify(w)}`);
    if (typeof w === 'object' && w.at !== undefined) {
      if (!anchorLike(w.at)) throw new Error(`${where}: kinetic word "${text}": at is an anchor, ["scene", "phrase"] (or ["scene", "phrase", seconds after]) — not ${JSON.stringify(w.at)}`);
      const at = clock.at(w.at);
      next = beats.findIndex(b => b > at + 1e-9); if (next < 0) next = beats.length;
      return {text: text.trim(), at};
    }
    if (next >= beats.length) throw new Error(`${where}: kinetic word "${text}" has no beat left in scene "${s.scene}" (${beats.length} beats, a word every ${s.every}) — give the scene more bars, or fewer words`);
    const at = beats[next];
    next += s.every;
    return {text: text.trim(), at};
  });
}

/** The words, compiled: a world kit's handle — draw(ctx, t), texts(), sounds. */
export function compileKinetic(spec, clock) {
  const where = spec?.scene ? `kinetic in scene "${spec.scene}"` : 'kinetic';
  const s = readSpec(spec ?? {}, where), lands = landings(s, clock, where);
  for (let i = 1; i < lands.length; i++) {
    if (lands[i].at < lands[i - 1].at) throw new Error(`${where}: kinetic word "${lands[i].text}" lands before "${lands[i - 1].text}" — the words land in the order written: write them in the order they are said, or give "${lands[i].text}" a later at`);
    if (s.style === 'slam' && lands[i].at === lands[i - 1].at) throw new Error(`${where}: kinetic words "${lands[i - 1].text}" and "${lands[i].text}" land at once — one word at a time shows only the later: give one of them another at, or stack them (style "stack")`);
  }
  const end = s.scene === null ? clock.total : clock.end(s.scene);
  for (const w of lands) {
    if (s.scene !== null && w.at < clock.start(s.scene)) throw new Error(`${where}: kinetic word "${w.text}" lands before scene "${s.scene}" starts — give it an at inside the scene`);
    if (w.at >= end) throw new Error(`${where}: kinetic word "${w.text}" lands after ${s.scene === null ? 'the film' : `scene "${s.scene}"`} ends — give it an at inside the scene`);
  }
  const shown = (t) => { let k = -1; for (let i = 0; i < lands.length; i++) if (lands[i].at <= t + 1e-9) k = i; return k; };
  const fontAt = (px) => `800 ${px.toFixed(1)}px ${KINETIC.font}`;
  /** A word's size: as big as `size`, or as wide as the frame allows. */
  const sized = (c, text, most) => { c.font = fontAt(100); const w = c.measureText(text).width || 1; return Math.min(most, (100 * 1600 * KINETIC.fit) / w); };
  const draw = (c, t) => {
    const k = shown(t), flipped = s.flip && k >= 0 && k % 2 === 1, [ground, ink] = flipped ? [s.colors[1], s.colors[0]] : s.colors;
    c.save();
    c.fillStyle = ground; c.fillRect(0, 0, 1600, 900);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = ink;
    const one = (i, x, y, px, alpha) => {
      c.font = fontAt(px);
      // the move acts on the word's own box (a wipe or an iris uncovers the word, not the frame's width)
      const w = c.measureText(lands[i].text).width, v = moveAt(s.move, t, {start: lands[i].at}), box = [x - w / 2, y - px / 2, x + w / 2, y + px / 2];
      c.save();
      c.globalAlpha *= alpha;
      if (applyMove(c, v, {box})) c.fillText(lands[i].text, x, y);
      c.restore();
    };
    if (k >= 0 && s.style === 'slam') one(k, 800, 450, sized(c, lands[k].text, s.size), 1);
    if (k >= 0 && s.style === 'stack') {
      // one size for the whole stack, from all its words: an earlier line never jumps when a new one lands
      const n = lands.length, px = Math.min(...lands.map((w) => sized(c, w.text, s.size)), 900 / (n * KINETIC.line)), top = 450 - (n * px * KINETIC.line) / 2;
      for (let i = 0; i <= k; i++) one(i, 800, top + (i + .5) * px * KINETIC.line, px, i === k ? 1 : KINETIC.dim);
    }
    c.restore();
  };
  const until = (i) => (i + 1 < lands.length ? lands[i + 1].at : end);
  return {
    hang: 1,
    /** The words and when each lands, on the film's clock: what the kit read. */
    words: Object.freeze(lands.map((w) => Object.freeze({...w}))),
    draw,
    /** For the reading check: each word from when it can be read (LEGIBLE after it lands) until the next lands (in a stack, until the stack ends). */
    texts: () => lands.map((w, i) => { const to = s.style === 'stack' ? end : until(i); return {text: w.text, from: Math.min(w.at + LEGIBLE, to), to, path: `words[${i}]`}; }),
    sounds: s.sound ? lands.map((w) => ({time: w.at, type: s.sound})) : [],
  };
}

export const kineticKit = {name: 'kinetic', story: {compile: compileKinetic}, sources: {entry: () => [new URL('./index.mjs', import.meta.url)]}};
