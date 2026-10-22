/**
 * Moments as the review tools say them and read them back — one owner for both ways, as clocktext.mjs is for times on
 * the film clock: a line says a moment as scene+seconds (sceneTime: the timeline, a still's labels) and a still or a
 * strip reads it (momentAt), so whatever a line says goes back to --at as it is.
 *
 *   today+64.7       64.7 s after the scene "today" starts: a scene's timeline prints its times so
 *   264.7 · 4:24.7   seconds, or m:ss, on the film clock: a window's or the whole film's timeline prints seconds
 */
import {clockSeconds} from './clocktext.mjs';

/** The ways a moment is written, as a refusal names them. */
export const MOMENT_FORMS = 'scene+seconds, or seconds or m:ss on the film clock';

/** A time on the film clock as scene+seconds: from the start of the scene it falls in (the clock's locate), to the hundredth. */
export function sceneTime(film, t) {
  const {id, time} = film.clock.locate(t);
  return `${id}+${time.toFixed(2)}`;
}

/**
 * One moment as written → seconds on the film clock (not yet held to the film), or a refusal naming `tool`. The forms
 * the tools have always read come first, read exactly as ever — scene+seconds and plain seconds, the seconds as Number
 * reads them — then m:ss (clocktext.mjs · clockSeconds). One "+" at most and no control character: a moment's words
 * are printed as its label.
 */
export function momentAt(film, text, tool) {
  const parts = text.split('+'), ids = film.timings.scenes.map(s => s.id);
  if (parts.length > 2 || /[\u0000-\u001f\u007f]/.test(text)) throw notAMoment(film, text, tool);
  const [id, off] = parts.length > 1 ? parts : [null, text];
  if (!id || ids.includes(id)) { const t = (id ? film.clock.start(id) : 0) + Number(off); if (Number.isFinite(t)) return t; }
  if (id === null && /^\d+:\d/.test(text)) { try { return clockSeconds(text); } catch { /* no time on the film clock: refused below */ } }
  throw notAMoment(film, text, tool);
}

/** The refusal of what is no moment: the ways one is written, and the film's scenes. */
const notAMoment = (film, text, tool) => new Error(`${tool}: ${JSON.stringify(text)} is not a moment (${MOMENT_FORMS}; the scenes are ${film.timings.scenes.map(s => s.id).join(', ')})`);
