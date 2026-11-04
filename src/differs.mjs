/**
 * A scene that differs from the real thing says so. A picture is believed: a process run 30 times faster, or a part drawn
 * far larger than it is, reads as how the thing is unless the film says otherwise. A scene declares how it differs —
 * how many times faster its time runs, what is out of scale — and the film says it, on screen, in the voice, or both:
 *
 *   storyboard.json   {"id": "inside", "narration": "Here it runs thirty times faster.",
 *                      "differs": {"time": 30, "scale": "The dots are drawn far larger than real", "said": "thirty times faster"}}
 *
 * On screen by default: a label per statement, top right, over the scene ("Time shown 30 times faster"; `shown` gives
 * the words in the film's language, or false for the voice alone). `said` names the phrase of the scene's narration
 * that says it, checked as every phrase a recipe names is. A verdict (the review's `differs`) reads the part it is
 * given: the labels as the frame draws them, the phrase where it is said, so a part cut to lose the phrase is caught. It
 * reads what is declared, and cannot see a speed-up nobody declared.
 *
 *   readDiffers(spec, where)             the declaration, checked: {time?, scale?, shown: [lines], said?}, or null
 *   differsOf(storyboard)                each scene's, in order (null: none)
 *   differsMeasure(differs, window, {wordsAt, ...})   what the verdict measures, and its findings
 */
import {drawnLines} from './claims.mjs';

/** What a scene's `differs` may hold. */
export const DIFFERS_KEYS = Object.freeze(['time', 'scale', 'shown', 'said']);
/** The longest statement a label holds: a label is read in a glance, and the rest belongs in the voice. */
export const DIFFERS_MOST = 70;

const plain = x => String(+x.toFixed(x >= 10 ? 0 : 2));
/** A time factor in words: 30 → "Time shown 30 times faster"; 0.04 → "Time shown 25 times slower". */
export const timeWords = time => (time > 1 ? `Time shown ${plain(time)} times faster` : `Time shown ${plain(1 / time)} times slower`);

const words = (value, name, where) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${where}: differs.${name} is words, not ${JSON.stringify(value)}`);
  const text = value.trim().replace(/\s+/g, ' ');
  if (text.length > DIFFERS_MOST) throw new Error(`${where}: differs.${name} is ${text.length} characters, more than a label can hold in a glance (${DIFFERS_MOST}): shorten it, and say the rest in the voice`);
  return text;
};

/** A scene's declaration checked, each refusal naming the fix: {time?, scale?, shown: [the labels' words], said?}, or null when it declares none. */
export function readDiffers(spec, where = 'differs') {
  if (spec === undefined || spec === null) return null;
  if (typeof spec !== 'object' || Array.isArray(spec)) throw new Error(`${where}: differs says how the scene differs from the real thing: {time: 30, scale: "the dots are drawn far larger than real", said: "thirty times faster"}, not ${JSON.stringify(spec)}`);
  const other = Object.keys(spec).find(k => !DIFFERS_KEYS.includes(k));
  if (other !== undefined) throw new Error(`${where}: differs takes ${DIFFERS_KEYS.join(', ')}, not ${JSON.stringify(other)}`);
  const {time, scale, shown, said} = spec;
  if (time !== undefined && !(typeof time === 'number' && Number.isFinite(time) && time > 0 && time !== 1)) throw new Error(`${where}: differs.time is how many times faster the picture runs than the real thing (30; 0.04 is 25 times slower), not ${JSON.stringify(time)}: 1 is real time, so leave it out`);
  if (time === undefined && scale === undefined) throw new Error(`${where}: differs says how the scene differs: give time (how many times faster it runs), scale (what is out of scale, in words), or both`);
  const out = {...(time === undefined ? {} : {time}), ...(scale === undefined ? {} : {scale: words(scale, 'scale', where)})};
  const lines = shown === false ? [] : shown === undefined ? [...(time === undefined ? [] : [timeWords(time)]), ...(scale === undefined ? [] : [out.scale])]
    : (Array.isArray(shown) ? shown : [shown]).map(line => words(line, 'shown', where));
  if (shown !== undefined && shown !== false && !lines.length) throw new Error(`${where}: differs.shown is the words on the picture, or false for the voice alone, not an empty list`);
  if (said !== undefined && (typeof said !== 'string' || !said.trim())) throw new Error(`${where}: differs.said is the phrase of the scene's narration that says how it differs, not ${JSON.stringify(said)}`);
  if (!lines.length && said === undefined) throw new Error(`${where}: differs.shown is false, so the voice must say it: give said, the phrase of the scene's narration that does`);
  return Object.freeze({...out, shown: Object.freeze(lines), ...(said === undefined ? {} : {said: said.trim()})});
}

/** Each scene's declaration, in the storyboard's order (null: the scene declares none). */
export const differsOf = storyboard => storyboard.scenes.map((scene, i) => readDiffers(scene?.differs, `storyboard scene ${scene?.id ?? i}`));

/** What the scene declares, in words, for a finding. */
const declared = d => [d.time === undefined ? null : timeWords(d.time).toLowerCase(), d.scale ?? null].filter(Boolean).join('; ');

/**
 * What the verdict reads, over a part (`window`): each declaring scene it reaches, its labels as the frame draws them
 * (wordsAt(t), at the middle of what the part shows of the scene) and its phrase where it is said. Returns {measured:
 * {scenes, shown, said, unstated (how many say it neither way), neither: [{scene, from, to, differs}]}, hits}.
 */
export function differsMeasure(differs, window, {wordsAt}) {
  const here = differs.filter(d => d.from < window.to - 1e-6 && d.to > window.from + 1e-6).map(d => {
    const from = Math.max(d.from, window.from), to = Math.min(d.to, window.to), drawn = drawnLines(wordsAt((from + to) / 2)).join(' ').replace(/\s+/g, ' ');
    return {d, from, shown: d.shown.length > 0 && d.shown.every(line => drawn.includes(line)), said: d.said !== undefined && d.saidAt >= window.from - 1e-6 && d.saidAt <= window.to + 1e-6};
  });
  const open = here.filter(x => !x.shown && !x.said);
  return {measured: {scenes: here.length, shown: here.filter(x => x.shown).length, said: here.filter(x => x.said).length, unstated: open.length,
    neither: open.map(x => ({scene: x.d.scene, from: x.d.from, to: x.d.to, differs: declared(x.d)}))},
  hits: open.map(x => ({kind: 'differs', t: x.from, what: `scene ${x.d.scene} declares it differs from the real thing (${declared(x.d)}), and here neither shows it nor says it: ${x.d.said ? `the phrase "${x.d.said}" falls outside this part: keep it in, or put the words on screen (differs.shown)` : 'something hides its label: move what covers the top right corner'}`}))};
}

/** The verdict (verdict.mjs). */
export const DIFFERS_VERDICT = Object.freeze({
  rules: Object.freeze([
    Object.freeze({when: Object.freeze({unstated: Object.freeze({gt: 0})}), then: 'failed', label: 'a scene declares it differs from the real thing, and neither shows nor says how'}),
  ]),
  passed: 'every scene that differs from the real thing says how, on screen or in the voice',
});
