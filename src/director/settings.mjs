/**
 * The recipe's `director`, read: "on", "off" (or absent: the film exactly as without one), or its settings —
 *
 *   {"lang": "en", "rules": {…}, "camera": "auto" | "worlds" | "focus" | "off", "acting": "worlds" | "off", "gap": 2, "lead": 0.2,
 *    "closeUps": {"perScene": 2, "perTurn": 1}, "exchange": 4}
 *
 * lang: the language the narration is in (default: the film's), which picks the application's rule table; rules: the
 * recipe's own rules (rules.mjs), read first; camera: where framing keys land, picture by picture (director/film.mjs:
 * auto — a world whose kit takes them in its spec, every other picture through the film's focus; worlds — only those
 * worlds, the rest recorded as not framed; focus — every picture through the focus; off); acting: whether mood keys
 * land in each world whose kit takes them; gap: the least seconds
 * between two camera keys; lead: how many seconds before its words a camera key lands; closeUps: the close-up budget —
 * how many a scene may have, how many in one speaker's turn (null: no limit; a rule's key moment is outside it);
 * exchange: how many seconds may pass between one speaker's turn and the other's reply for the two to be framed
 * together (0: never). Pure.
 */
import {readRules} from './rules.mjs';
import {FRAMING} from './framing.mjs';

const SPEC_KEYS = ['lang', 'rules', 'camera', 'acting', 'gap', 'lead', 'closeUps', 'exchange'];
export const CAMERA_LANDINGS = Object.freeze(['auto', 'worlds', 'focus', 'off']), ACTING_LANDINGS = Object.freeze(['worlds', 'off']);

/**
 * The director's settings: null when it is off, else {lang, table, camera, acting, gap, lead} (table: the rules read,
 * readRules). `lang`: the film's language; `tables`: the application's rule tables by language (strategies.director).
 */
export function readDirector(spec, {lang = null, tables = null} = {}) {
  if (spec === undefined || spec === 'off') return null;
  if (spec !== 'on' && (!spec || typeof spec !== 'object' || Array.isArray(spec))) throw new Error(`director is "on", "off" or {lang?, rules?, camera?, acting?, gap?, lead?}, not ${JSON.stringify(spec)}`);
  const s = spec === 'on' ? {} : spec;
  for (const key of Object.keys(s)) if (!SPEC_KEYS.includes(key)) throw new Error(`director has unsupported key ${key} (it takes ${SPEC_KEYS.join(', ')})`);
  const camera = s.camera ?? 'auto', acting = s.acting ?? 'worlds', gap = s.gap ?? FRAMING.gap, lead = s.lead ?? FRAMING.lead;
  if (!CAMERA_LANDINGS.includes(camera)) throw new Error(`director.camera is ${CAMERA_LANDINGS.map(c => `"${c}"`).join(', ')} (where the framing keys land, picture by picture: auto = a world whose kit takes them in its spec, every other picture through the film's focus), not ${JSON.stringify(camera)}`);
  if (!ACTING_LANDINGS.includes(acting)) throw new Error(`director.acting is "worlds" (each world whose kit takes mood keys) or "off", not ${JSON.stringify(acting)}`);
  if (!(typeof gap === 'number' && gap >= 0 && gap <= 30)) throw new Error(`director.gap is the least seconds between two camera keys, 0–30, not ${JSON.stringify(gap)}`);
  if (!(typeof lead === 'number' && lead >= 0 && lead <= 2)) throw new Error(`director.lead is how many seconds before its words a camera key lands, 0–2, not ${JSON.stringify(lead)}`);
  const closeUps = readCloseUps(s.closeUps), exchange = s.exchange ?? FRAMING.exchange;
  if (!(typeof exchange === 'number' && exchange >= 0 && exchange <= 30)) throw new Error(`director.exchange is how many seconds may pass before the other speaker replies for the two to be framed together, 0–30 (0: never), not ${JSON.stringify(exchange)}`);
  if (s.lang !== undefined && !(typeof s.lang === 'string' && s.lang.trim())) throw new Error(`director.lang is the language the narration is in ("en"), not ${JSON.stringify(s.lang)}`);
  if (tables !== null && (typeof tables !== 'object' || Array.isArray(tables))) throw new Error(`director: the application's rule tables are {lang: table} (strategies.director, e.g. {"en": {"moods": […]}}), not ${JSON.stringify(tables)}`);
  const said = s.lang ?? lang ?? null;
  if (said === null && tables !== null && Object.keys(tables).length) throw new Error(`director: the application gives rule tables by language (${Object.keys(tables).join(', ')}), and the film says no language: give compileFilm({…, lang}) or "director": {"lang": "…"}`);
  return Object.freeze({lang: said, table: readRules({lang: said, rules: s.rules ?? null, tables}), camera, acting, gap, lead, closeUps, exchange});
}

/** The close-up budget: {perScene, perTurn}, each a count or null (no limit), the defaults where left out. */
function readCloseUps(given) {
  if (given === undefined) return FRAMING.closeUps;
  if (!given || typeof given !== 'object' || Array.isArray(given)) throw new Error(`director.closeUps is {"perScene"?: 2, "perTurn"?: 1} (how many close-ups a scene, and one speaker's turn, may have; null: no limit), not ${JSON.stringify(given)}`);
  for (const key of Object.keys(given)) if (key !== 'perScene' && key !== 'perTurn') throw new Error(`director.closeUps has unsupported key ${key} (it takes perScene, perTurn)`);
  const out = {...FRAMING.closeUps, ...given};
  for (const key of ['perScene', 'perTurn']) if (out[key] !== null && !(Number.isInteger(out[key]) && out[key] >= 0)) throw new Error(`director.closeUps.${key} is a count, 0 or more, or null (no limit), not ${JSON.stringify(out[key])}`);
  return Object.freeze(out);
}
