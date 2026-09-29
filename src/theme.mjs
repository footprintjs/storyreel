/**
 * Themes: colours, type and surfaces for the paper parts of a film. A theme is data (JSON); the
 * package ships 'paper'. Pass your own object to compileFilm({theme}) for another look.
 */
import {readFileSync} from 'node:fs';

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
const NEEDS = {palette: ['bg', 'glow', 'panel', 'edge', 'ink', 'dim', 'available', 'unknown', 'reject', 'accent'], type: ['sans', 'mono', 'display'], canvas: ['width', 'height', 'safeMargin'], background: ['gridSize', 'grain'], surface: ['kind']};

/** Check that a theme has what the film draws with; returns it frozen. */
export function validateTheme(theme) {
  if (!theme || typeof theme !== 'object') throw new TypeError('A theme must be an object');
  for (const [section, keys] of Object.entries(NEEDS)) {
    if (!theme[section] || typeof theme[section] !== 'object') throw new TypeError(`theme.${section} is missing`);
    for (const key of keys) if (!(key in theme[section])) throw new TypeError(`theme.${section}.${key} is missing`);
  }
  for (const [key, value] of Object.entries(theme.palette)) if (!HEX.test(value)) throw new TypeError(`theme.palette.${key} must be a hex colour`);
  if (theme.canvas.width !== 1600 || theme.canvas.height !== 900) throw new RangeError('Films draw on a 1600×900 logical canvas');
  return deepFreeze(structuredClone(theme));
}
const deepFreeze = v => { if (v && typeof v === 'object') { for (const x of Object.values(v)) deepFreeze(x); Object.freeze(v); } return v; };

/** A built-in theme by name ('paper'). */
export function loadTheme(name) {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new TypeError('Invalid theme name');
  return validateTheme(JSON.parse(readFileSync(new URL(`../themes/${name}.json`, import.meta.url), 'utf8')));
}
