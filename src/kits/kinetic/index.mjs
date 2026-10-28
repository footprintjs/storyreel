/**
 * kinetic — words that slam in as the voice says them: kinetic type, a launch film's grammar, as a world kit. The
 * words are data; each lands on the moment the voice says it (the scene's said words, in order), enters with a move from
 * the shared table (footprint-story/motion: slam by default, any entrance a word may make) and holds until the next one
 * lands. Nothing is guessed: a word the voice never says needs a time of its own.
 *
 *   {"type": "world", "scene": "beat", "world": {"kit": "kinetic", "scene": "beat", "words": ["Every", "beat", "on", "cut"]}}
 *   {"kit": "kinetic", "scene": "beat", "words": ["Every", {"text": "BEAT", "at": ["beat", "on the beat"]}], "style": "stack", "flip": true}
 *
 * style   "slam" (the default): one word at a time, as big as it fits; "stack": the words build up, line under line,
 *         the earlier ones a little dimmer
 * move    the entrance each word makes (slam): a move from the shared table whose kind is entrance and use is text
 * flip    the ground and the ink swap at every word (a light card, a dark card), as a launch film cuts colour on the beat
 * colors  [ground, ink] ("#f3eee3", "#1a1a1a")
 * sound   a sound at every word that lands (tap, click, whoosh …), or none (the default)
 * size    the largest a word is drawn, px on the 1600×900 frame (480); a word too wide for the frame is drawn smaller
 */
import {moveAt, readMove} from 'footprint-story/motion';
import {applyMove} from '../../moves.mjs';
import {SOUND_NAMES} from '../../sound.mjs';

export const KINETIC = Object.freeze({size: 480, colors: Object.freeze(['#f3eee3', '#1a1a1a']), font: '"Avenir Next", Arial, sans-serif', fit: .86, line: 1.02, dim: .45, most: 40});
const STYLES = Object.freeze(['slam', 'stack']);
const KEYS = Object.freeze(['kit', 'scene', 'words', 'style', 'move', 'flip', 'colors', 'sound', 'size']);
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
/** A word as a reader and the voice compare it: its letters and digits, lower case. */
const bare = (s) => String(s).normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** The spec, checked: each refusal names the fix. */
function readSpec(spec, where) {
  for (const k of Object.keys(spec)) if (!KEYS.includes(k)) throw new Error(`${where}: kinetic takes ${KEYS.filter((x) => x !== 'kit').join(', ')} — not "${k}"`);
  const words = spec.words;
  if (!Array.isArray(words) || !words.length || words.length > KINETIC.most) throw new Error(`${where}: kinetic words is a list of 1 to ${KINETIC.most} words, each "text" or {text, at}`);
  const style = spec.style ?? 'slam';
  if (!STYLES.includes(style)) throw new Error(`${where}: kinetic style is ${STYLES.join(' or ')}, not ${JSON.stringify(spec.style)}`);
  const move = readMove(spec.move ?? 'slam', `${where}: kinetic move`);
  if (move.kind !== 'entrance' || !move.uses.includes('text')) throw new Error(`${where}: kinetic move "${move.name}" is not an entrance for text — name one that is (slam, pop, blur-in, drop-in, scale-in, fade-slide …)`);
  const colors = spec.colors ?? KINETIC.colors;
  if (!Array.isArray(colors) || colors.length !== 2 || !colors.every((c) => HEX.test(c))) throw new Error(`${where}: kinetic colors is [ground, ink], two hex colours ("#f3eee3"), not ${JSON.stringify(spec.colors)}`);
  if (spec.sound !== undefined && spec.sound !== null && !SOUND_NAMES.includes(spec.sound)) throw new Error(`${where}: kinetic sound is one of ${SOUND_NAMES.join(', ')}, or none — not ${JSON.stringify(spec.sound)}`);
  const size = spec.size ?? KINETIC.size;
  if (!(Number.isFinite(size) && size >= 24 && size <= 600)) throw new Error(`${where}: kinetic size is the largest a word is drawn, 24 to 600 px, not ${JSON.stringify(spec.size)}`);
  if (spec.flip !== undefined && typeof spec.flip !== 'boolean') throw new Error(`${where}: kinetic flip is true or false`);
  return {words, style, move, colors, flip: spec.flip === true, sound: spec.sound ?? null, size, scene: spec.scene ?? null};
}

/**
 * When each word lands: the next said word of the scene that matches it (letters and digits, any case), in order; a word
 * written {text, at} at its anchor (clock.at). A word the voice does not say, without an at, refuses — naming what is said.
 */
function landings(s, clock, where) {
  const said = s.scene === null ? [] : clock.words(s.scene);
  let from = 0;
  return s.words.map((w, i) => {
    const text = typeof w === 'string' ? w : w?.text;
    if (typeof text !== 'string' || !text.trim()) throw new Error(`${where}: kinetic words[${i}] is "text" or {text, at}, not ${JSON.stringify(w)}`);
    if (typeof w === 'object' && w.at !== undefined) return {text: text.trim(), at: clock.at(w.at)};
    if (s.scene === null) throw new Error(`${where}: kinetic word "${text}" has no time — name the scene whose voice the words follow (scene), or give it {text, at}`);
    const k = said.findIndex((x, j) => j >= from && bare(x.text) === bare(text));
    if (k < 0) {
      const left = said.slice(from).map((x) => x.text).join(' ');
      throw new Error(`${where}: kinetic word "${text}" is not said in scene "${s.scene}" after the words before it${left ? ` (still to come: "${left.slice(0, 80)}")` : ''} — write it as the voice says it, or give it {text, at}`);
    }
    from = k + 1;
    return {text: text.trim(), at: said[k].start};
  });
}

/** The words, compiled: a world kit's handle — draw(ctx, t), texts(), sounds. */
export function compileKinetic(spec, clock) {
  const where = spec?.scene ? `kinetic in scene "${spec.scene}"` : 'kinetic';
  const s = readSpec(spec ?? {}, where), lands = landings(s, clock, where);
  for (let i = 1; i < lands.length; i++) if (lands[i].at < lands[i - 1].at) throw new Error(`${where}: kinetic word "${lands[i].text}" lands before "${lands[i - 1].text}" — the words land in the order written: write them in the order they are said, or give "${lands[i].text}" a later at`);
  const end = s.scene === null ? clock.total : clock.end(s.scene);
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
      const v = moveAt(s.move, t, {start: lands[i].at}), box = [x - 800, y - px / 2, x + 800, y + px / 2];
      c.save();
      c.globalAlpha = alpha;
      if (applyMove(c, v, {box})) { c.font = fontAt(px); c.fillText(lands[i].text, x, y); }
      c.restore();
    };
    if (k >= 0 && s.style === 'slam') one(k, 800, 450, sized(c, lands[k].text, s.size), 1);
    if (k >= 0 && s.style === 'stack') {
      const px = Math.min(...lands.slice(0, k + 1).map((w) => sized(c, w.text, s.size)), 900 / ((k + 1) * KINETIC.line)), top = 450 - ((k + 1) * px * KINETIC.line) / 2;
      for (let i = 0; i <= k; i++) one(i, 800, top + (i + .5) * px * KINETIC.line, px, i === k ? 1 : KINETIC.dim);
    }
    c.restore();
  };
  const until = (i) => (i + 1 < lands.length ? lands[i + 1].at : end);
  return {
    hang: 1,
    draw,
    /** For the reading check: each word from its landing until the next lands (in a stack, until the stack ends). */
    texts: () => lands.map((w, i) => ({text: w.text, from: w.at, to: s.style === 'stack' ? end : until(i), path: `words[${i}]`})),
    sounds: s.sound ? lands.map((w) => ({time: w.at, type: s.sound})) : [],
  };
}

export const kineticKit = {name: 'kinetic', story: {compile: compileKinetic}, sources: {entry: () => [new URL('./index.mjs', import.meta.url)]}};
