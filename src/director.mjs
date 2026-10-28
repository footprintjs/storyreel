/**
 * The automatic director: it reads the script — the narration's sentences, who says each, how each ends, the moments
 * written in it — the scenes, the recipe's pauses and guesses, and what each picture names (its regions), and PROPOSES
 * direction as the recipe keys a person would write: camera framing keys and acting moods. The proposals are data,
 * recorded with the rule behind each one (film.director, the making-of record), so a person or an AI writes only the
 * exceptions — and explicit recipe keys always win over proposed ones.
 *
 *   "director": "on"                        the neutral rules, the framing where it lands best
 *   "director": {"lang", "rules", "camera", "acting", "gap", "lead"}       (director/settings.mjs)
 *   "director": "off", or no director       the film exactly as without one
 *
 * The strategies, each its own module and each replaceable as data:
 *   director/rules.mjs      the rule table: which lines frame a face, which change one — neutral by default (a question
 *                           or an exclamation frames the speaker close; whoever answers a pause and guess thinks); rules
 *                           with words are the film's own data (a recipe's rules, an application's
 *                           compileFilm({strategies: {director: {en: table}}}))
 *   director/framing.mjs    the shot grammar: wide on a new scene, close on a speaker's line, back to medium, an insert
 *                           on a thing the narration names, a medium on a person it names
 *   director/moods.mjs      the acting: a line's mood, thinking through a pause and guess, back to rest
 *   director/land.mjs       where keys land, picture by picture: a world whose kit takes direction (its spec's own
 *                           keys), or the film's focus; one camera (cameraTaken) for both
 * Listeners get no keys: they react through footprint-storyreel/acting · reactionAt, read from the same voice.
 *
 * `direct()` is the director outside a film: proposals for a storyboard, nothing compiled, planned as one picture the
 * way a world's camera is (its first sentence keeps the establishing shot). compileFilm runs it when the recipe asks
 * (director/film.mjs).
 */
import {readDirector} from './director/settings.mjs';
import {readRules, NEUTRAL_RULES, RULE_SHOTS, matchLine, wordsOf, endOf} from './director/rules.mjs';
import {planFraming, FRAMING} from './director/framing.mjs';
import {planMoods} from './director/moods.mjs';
import {cameraKey, actingKeys} from './director/land.mjs';
import {readScript, offsetsOf, speakersOf, listenersOf, recordKey} from './director/record.mjs';
import {grammar} from './director/film.mjs';

export {readDirector, readRules, NEUTRAL_RULES, RULE_SHOTS, matchLine, wordsOf, endOf, FRAMING};

/** What a picture names, as the planners ask: null (on trust), a Set, or (scene, t) → Set. */
function namesOf(names) {
  if (names === null || names === undefined) return null;
  if (typeof names === 'function') return (scene, t) => new Set(names(scene, t) ?? []);
  if (Array.isArray(names)) return new Set(names);
  if (typeof names === 'object') return scene => new Set(names[scene] ?? []);
  throw new Error(`direct: names is what the picture names — a list, {scene: list} or (scene, t) → list — not ${JSON.stringify(names)}`);
}

/**
 * The director outside a film: proposals for a storyboard, as recipe keys and with why. Pure. Options:
 *   storyboard   the scenes
 *   timings      the voice's timings, or null: who says each word and when (without them: {@who} lines, the scene's
 *                speaker, and no seconds — so no gap is kept and no spacing checked)
 *   guesses      the recipe's guesses ({after}), for the pause and guess
 *   names        what the picture names: a list, {scene: list} or (scene, t) → list; left out, every name is taken on
 *                trust (a face is "<who>.face") and nothing the narration names is framed
 *   director     the recipe's director ("on", or its settings)
 *   lang, rules  the language, and the application's rule tables by language ({en: table})
 *   moods, rest  what the kit can act (a list, or {who: list}) and its rest mood
 *   groups       whether the camera frames several names together (a two-shot; default true, as the film's focus does)
 * Returns {lang, rules, focus: {strategy: "camera", keys}, acting: {who: [{at, mood}]}, proposals, dropped, listeners}.
 */
export function direct({storyboard, timings = null, guesses = [], names = null, director = 'on', lang = null, rules = null, moods = null, rest = null, groups = true}) {
  if (!storyboard || !Array.isArray(storyboard.scenes)) throw new Error('direct: give the storyboard ({scenes: [...]})');
  const settings = readDirector(director, {lang, tables: rules});
  if (!settings) throw new Error('direct: the director is "off"; give "on" or its settings');
  const reads = readScript(storyboard, timings, timings ? offsetsOf(timings) : null), people = speakersOf(reads), ids = [...reads.keys()], known = namesOf(names);
  const scenes = ids.map(id => reads.get(id)), {table} = settings;
  const present = (who, scene, t) => { const n = typeof known === 'function' ? known(scene, t) : known; return n === null || n.has(who); };
  const framing = planFraming(scenes, {names: known, people, groups, ...grammar(settings)}), acted = planMoods(scenes, {table, guesses, moods, rest, present});
  return {lang: settings.lang, rules: table.source, focus: {strategy: 'camera', keys: framing.keys.map(cameraKey)}, acting: actingKeys(acted.keys),
    proposals: [...framing.keys.map(k => recordKey('camera', null, k)), ...acted.keys.map(k => recordKey('mood', null, k))],
    dropped: [...framing.dropped.map(k => recordKey('camera', null, k, {why: k.why})), ...acted.dropped.map(k => recordKey('mood', null, k, {why: k.why}))],
    listeners: {by: 'reactionAt', scenes: listenersOf(ids, reads, people, known)}};
}
