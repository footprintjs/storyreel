/**
 * The thought frame as a recipe writes it: "thought", or {"type": "thought", corner?, size?, seed?, color?, ink?}. Its
 * five settings are written as a transition's are and read by the one reader (settings.mjs · readSettings), so a bad one
 * refuses in the same words as a bad entrance setting; cloudBurst takes the same five.
 */
import {readSettings} from '../settings.mjs';
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
const FRAME_KEYS = Object.freeze(['type', ...Object.keys(THOUGHT_SETTINGS)]);
const shown = v => (typeof v === 'number' ? String(v) : JSON.stringify(v));

/**
 * A world's frame from the recipe: "thought", or {"type": "thought", …its settings}; left out, null (the world hangs on
 * its sheet as before). Returns its settings and its cloud (shape.mjs · thoughtCloud); anything else refuses, naming the fix.
 */
export function readThought(value, where) {
  if (value === undefined) return null;
  const spec = value === 'thought' ? {type: 'thought'} : value;
  if (!spec || typeof spec !== 'object' || Array.isArray(spec) || spec.type !== 'thought') throw new Error(`${where}: frame must be "thought" or {"type": "thought", "corner"?, "size"?, "seed"?, "color"?, "ink"?} (a thought cloud is the one frame there is), not ${shown(value)}`);
  for (const key of Object.keys(spec)) if (!FRAME_KEYS.includes(key)) throw new Error(`${where}: frame has unsupported key ${key} (a thought frame takes ${Object.keys(THOUGHT_SETTINGS).join(', ')})`);
  const p = readSettings(THOUGHT_SETTINGS, spec, where, {key: 'frame', type: 'thought frame'});
  return Object.freeze({type: 'thought', ...p, cloud: thoughtCloud(p)});
}
