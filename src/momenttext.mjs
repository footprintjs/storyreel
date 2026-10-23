/**
 * Moments as the review tools say them and read them back — one owner for both ways, as clocktext.mjs is for times on
 * the film clock: a line says a moment as scene+seconds (sceneTime: the timeline, a still's labels, a refusal's
 * places) and a still or a strip reads it (momentAt), so whatever a line says goes back to --at as it is. A moment can
 * be named by what is said there too, found on the film's clock as a recipe's beat is:
 *
 *   today+64.7       64.7 s after the scene "today" starts: a scene's timeline prints its times so
 *   264.7 · 4:24.7   seconds, or m:ss, on the film clock: a window's or the whole film's timeline prints seconds
 *   today:Ten ones   when "Ten ones" is said in today (said once; its commas left out: words match whatever the punctuation)
 *   today:{hop}      the moment {hop} written in today's narration (script.mjs)
 *   today:{hop}+0.5  half a second after it: +seconds after either
 */
import {clockSeconds} from './clocktext.mjs';
import {checkPhrase, exactPhrases, PLACES_SHOWN} from './anchors.mjs';
import {momentOf, shownMark} from './script.mjs';

/** The ways a moment is written, as a refusal names them. */
export const MOMENT_FORMS = 'scene+seconds, seconds or m:ss on the film clock, or what is said: scene:phrase or scene:{moment}, +seconds after either';
/** How far a time said to the hundredth may be from what it names: half a hundredth, either way. */
export const HUNDREDTH = .005;
/** The film's scene ids, in order (one the storyboard gives twice names its last scene, as the clock's start does). */
export const sceneIds = film => film.timings.scenes.map(s => s.id);

/**
 * Where a time falls: {index, id, time}, the scene and the seconds into it (the clock's locate). A beat's time is kept
 * to the millisecond (film.beats), so one a hair before a scene's start by that rounding is that scene's, at 0.
 */
export function placeOf(film, t) {
  const {index, id} = film.clock.locate(t + 5e-4);
  return {index, id, time: Math.max(0, t - film.clock.offsets[index])};
}

/** A scene id scene+seconds can say: not empty, no space at either end, no "+", "," or control character. */
const sayable = id => id !== '' && id === id.trim() && !/[+,\u0000-\u001f\u007f]/.test(id);

/**
 * A time on the film clock as scene+seconds, from the start of the scene it falls in (placeOf), to the hundredth. In a
 * scene whose id would not read back as written — one the storyboard gives twice (it names the last such scene), or
 * one with a "+" or "," in it — the time is said in seconds on the film clock: either way, it reads back as itself.
 */
export function sceneTime(film, t) {
  const {index, id, time} = placeOf(film, t);
  return sayable(id) && film.clock.start(id) === film.clock.offsets[index] ? `${id}+${time.toFixed(2)}` : t.toFixed(2);
}

/**
 * One moment as written → seconds on the film clock (not yet held to the film), or a refusal naming `tool`: one "+" at
 * most and no control character (a moment's words are printed as its label), then a time on the film clock
 * (clockForm), else what is said (saidForm).
 */
export function momentAt(film, text, tool) {
  const parts = text.split('+');
  if (parts.length > 2 || /[\u0000-\u001f\u007f]/.test(text)) throw notAMoment(film, text, tool);
  const t = clockForm(film, parts) ?? saidForm(film, parts, `${tool}: ${JSON.stringify(text)}`);
  if (t === null) throw notAMoment(film, text, tool);
  return t;
}

/**
 * A moment named on the film clock alone, or null: scene+seconds and plain seconds read exactly as the tools always
 * read them (the seconds as Number reads them), then m:ss (clocktext.mjs · clockSeconds).
 */
function clockForm(film, parts) {
  const [id, off] = parts.length > 1 ? parts : [null, parts[0]];
  if (!id || sceneIds(film).includes(id)) { const t = (id ? film.clock.start(id) : 0) + Number(off); if (Number.isFinite(t)) return t; }
  if (id === null && /^\d+:\d/.test(off)) { try { return clockSeconds(off); } catch { /* no time on the film clock */ } }
  return null;
}

/**
 * A moment named by what is said — the longest scene id the text starts with, a colon, the phrase or the moment — and
 * +seconds after it: seconds on the film clock, or null when no scene starts it or the seconds are none. What is said
 * that names no one place refuses after `named` (saidAt).
 */
function saidForm(film, [said, plus = '0'], named) {
  const scene = sceneIds(film).filter(s => said.startsWith(`${s}:`)).sort((a, b) => b.length - a.length)[0], seconds = Number(plus);
  return scene === undefined || !Number.isFinite(seconds) ? null : saidAt(film, scene, said.slice(scene.length + 1), named) + seconds;
}

/**
 * The refusal of what is no moment: the ways one is written, and the film's scenes. Words with no scene before them
 * are, most often, a phrase cut at its own comma (the moments are split at commas): that is said too.
 */
function notAMoment(film, text, tool) {
  const words = !/[:+]/.test(text) && /\p{L}/u.test(text);
  return new Error(`${tool}: ${JSON.stringify(text)} is not a moment (${MOMENT_FORMS}; the scenes are ${sceneIds(film).join(', ')})${words ? ' — words name a moment after their scene (scene:phrase), and a phrase\'s own commas are left out: the moments are split at commas' : ''}`);
}

/**
 * When a phrase, or a moment ("{hop}"), is said in a scene, on the film clock — read as a recipe's beat is read, by
 * anchors.mjs · checkPhrase, through the clock's places (its at() would log the lookup among the film's beats, which
 * the timeline lists) — or a refusal after `named` that says why there is no one place (whyNot).
 */
function saidAt(film, scene, phrase, named) {
  if (!phrase.trim()) throw new Error(`${named} names nothing said: write the words after the colon (${scene}:what is said) or a moment (${scene}:{name})`);
  const check = checkPhrase(film.clock, {scene, phrase});
  if (!check.problem) return check.places[0].start;
  throw new Error(`${named} — ${whyNot(film, scene, phrase, check)}`);
}

/**
 * Why a phrase or a moment names no one place, with the fix, each time as scene+seconds: said more than once (where,
 * and the words said only at each place, as storyreel anchors suggests them: anchors.mjs · exactPhrases), braces that
 * name no moment (the clock's own reason: script.mjs · momentOf), a moment the scene does not have (with the ones it
 * has), or words not said (with the nearest words said).
 */
function whyNot(film, scene, phrase, {problem, places, near}) {
  const at = t => sceneTime(film, t);
  if (problem === 'ambiguous') {
    const shown = places.slice(0, PLACES_SHOWN), alone = exactPhrases(film.clock, scene, shown).map(e => `"${e.phrase}" (${at(e.at)})`);
    const where = `${shown.map(p => at(p.start)).join(' · ')}${places.length > shown.length ? ` · … ${places.length - shown.length} more` : ''}`;
    return `said ${places.length} times in ${scene} (${where}): name one by its time${alone.length ? `, or by words said only there, as storyreel anchors suggests them: ${alone.join(' · ')}` : ''}`;
  }
  let name; try { name = momentOf(phrase, null); } catch (e) { return e.message; }
  if (name !== null) {
    const has = film.clock.moments(scene).map(m => `${shownMark(m.name)} (${at(m.t)})`);
    return `${scene} has no moment ${shownMark(name)} (${has.length ? `its moments: ${has.join(' · ')}` : 'it has none'})`;
  }
  return `not said in ${scene}${near ? `; the nearest words said: "${near.phrase}" (${at(near.start)})` : ''}`;
}
