/**
 * The thought frame as a recipe writes it: "thought", or {"type": "thought", corner?, size?, seed?, color?, ink?,
 * backdrop?}. The five cloud settings are written as a transition's are and read by the one reader (settings.mjs ·
 * readSettings), so a bad one refuses in the same words as a bad entrance setting; cloudBurst takes the same five. The
 * backdrop, the ground round the cloud, is the frame's alone: cloudBurst clears whatever the frame drew round its cloud.
 */
import {readSettings} from '../settings.mjs';
import {isHex} from '../colour.mjs';
import {thoughtCloud} from './shape.mjs';

export const THOUGHT_CORNERS = Object.freeze(['bottom-left', 'bottom-right', 'top-left', 'top-right']);
/** The frame's settings and cloudBurst's: where the trail points, the cloud's share of the frame, its scallops, its paper and its ink. */
export const THOUGHT_SETTINGS = Object.freeze({
  corner: Object.freeze({oneOf: THOUGHT_CORNERS, default: 'bottom-left'}),
  size: Object.freeze({number: Object.freeze([.5, .9]), default: .8}),
  seed: Object.freeze({number: Object.freeze([0, 10000]), default: 3}),
  color: Object.freeze({color: true, default: null}),
  ink: Object.freeze({color: true, default: null}),
});
const FRAME_KEYS = Object.freeze(['type', ...Object.keys(THOUGHT_SETTINGS), 'backdrop']);
const shown = v => (typeof v === 'number' ? String(v) : JSON.stringify(v));
/** A backdrop written as an object without its vignette gets this much: a soft one. */
const VIGNETTE = .5;

/**
 * The ground round the cloud: left out or null, the shot's own (the page, as before); a hex colour, flat; or
 * {color, vignette?}, that colour lighter near the cloud and darker toward the frame's edges (vignette 0–1, 0.5 by
 * default; 0 is flat). Returns {color, vignette} or null; anything else refuses, naming the fix.
 */
export function readBackdrop(value, where) {
  if (value === undefined || value === null) return null;
  const refuse = () => new Error(`${where}: frame.backdrop is the ground round the cloud: a hex colour such as "#111111" (flat), or {"color": "#2b2622", "vignette": 0.5} (lighter near the cloud, darker at the frame's edges; vignette 0–1), or null (the shot's own ground), not ${shown(value)}`);
  if (typeof value === 'string') {
    if (!isHex(value)) throw refuse();
    return Object.freeze({color: value, vignette: 0});
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw refuse();
  for (const key of Object.keys(value)) if (key !== 'color' && key !== 'vignette') throw new Error(`${where}: frame.backdrop has unsupported key ${key} (a backdrop takes color and vignette)`);
  if (value.color === undefined) throw new Error(`${where}: frame.backdrop needs color: a hex colour such as "#2b2622" (and vignette, 0–1, if it should be lighter near the cloud)`);
  if (!isHex(value.color)) throw new Error(`${where}: frame.backdrop.color must be a hex colour such as "#2b2622", not ${shown(value.color)}`);
  const vignette = value.vignette ?? VIGNETTE;
  if (!(typeof vignette === 'number' && vignette >= 0 && vignette <= 1)) throw new Error(`${where}: frame.backdrop.vignette is how much lighter near the cloud and darker at the edges: a number 0–1 (0 is flat; ${VIGNETTE} by default), not ${shown(vignette)}`);
  return Object.freeze({color: value.color, vignette});
}

/**
 * A world's frame from the recipe: "thought", or {"type": "thought", …its settings}; left out, null (the world hangs on
 * its sheet as before). Returns its settings and its cloud (shape.mjs · thoughtCloud); anything else refuses, naming the fix.
 */
export function readThought(value, where) {
  if (value === undefined) return null;
  const spec = value === 'thought' ? {type: 'thought'} : value;
  if (!spec || typeof spec !== 'object' || Array.isArray(spec) || spec.type !== 'thought') throw new Error(`${where}: frame must be "thought" or {"type": "thought", "corner"?, "size"?, "seed"?, "color"?, "ink"?, "backdrop"?} (a thought cloud is the one frame there is), not ${shown(value)}`);
  for (const key of Object.keys(spec)) if (!FRAME_KEYS.includes(key)) throw new Error(`${where}: frame has unsupported key ${key} (a thought frame takes ${FRAME_KEYS.slice(1).join(', ')})`);
  const p = readSettings(THOUGHT_SETTINGS, spec, where, {key: 'frame', type: 'thought frame'});
  return Object.freeze({type: 'thought', ...p, backdrop: readBackdrop(spec.backdrop, where), cloud: thoughtCloud(p)});
}
