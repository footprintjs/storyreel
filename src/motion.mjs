/**
 * Motion with weight: closed-form springs, so every value is a pure function of time (frame 812 is drawn
 * without drawing 0–811) and moves the way a thing with mass does — it accelerates, settles, and, when the feel
 * says so, overshoots a hair. A FEEL is a strategy: a stiffness and a damping by name (snappy, default, heavy,
 * playful), or an object {k, d} of your own.
 *
 *   spring(t - at, 'playful')         0 → 1 from `at`, with a visible overshoot (a pop)
 *   track(t, [[0, 800], [2.5, 420]])  a value with many targets: one spring per change, so it never jumps
 */

/** The named feels. snappy: buttons, leading edges; default: cards, containers; heavy: big type, cameras; playful: pops, stickers. */
export const FEELS = Object.freeze({
  snappy: Object.freeze({k: 320, d: 30}),
  default: Object.freeze({k: 170, d: 26}),
  heavy: Object.freeze({k: 90, d: 20}),
  playful: Object.freeze({k: 220, d: 14}),
});
export const FEEL_NAMES = Object.freeze(Object.keys(FEELS));

/** A feel as given (a name, or {k, d}) → {k, d}; anything else refuses, naming the feels. */
export function readFeel(feel = 'default') {
  if (typeof feel === 'string') {
    if (!FEELS[feel]) throw new Error(`no feel called "${feel}" (the feels are ${FEEL_NAMES.join(', ')}, or {k, d} of your own)`);
    return FEELS[feel];
  }
  if (!(feel && Number.isFinite(feel.k) && Number.isFinite(feel.d) && feel.k > 0 && feel.d > 0)) throw new Error(`a feel is a name (${FEEL_NAMES.join(', ')}) or {k, d}: a stiffness and a damping, both above 0`);
  return feel;
}

/** A damped spring from 0 to 1, `t` seconds after it starts (0 before). Under-damped feels overshoot. */
export function spring(t, feel = 'default') {
  if (!(t > 0)) return 0;
  const {k, d} = readFeel(feel), w0 = Math.sqrt(k), zeta = d / (2 * w0);
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + (zeta * w0 / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);   // critically damped (and heavier): no overshoot
}

/** A pop: the scale of something arriving at `at`, 0 → 1 with the feel's overshoot (playful by default). */
export const pop = (t, at, feel = 'playful') => spring(t - at, feel);

/**
 * A value with several targets, [[time, value], …] in time order: the first value, plus one spring per change
 * starting at its own time — continuous however close the changes come, and still a pure function of t.
 */
export function track(t, keys, feel = 'default') {
  if (!Array.isArray(keys) || !keys.length || !keys.every(k => Array.isArray(k) && Number.isFinite(k[0]) && Number.isFinite(k[1]))) throw new Error('track: keys are [[time, value], …] (numbers), at least one');
  let v = keys[0][1];
  for (let i = 1; i < keys.length; i++) v += (keys[i][1] - keys[i - 1][1]) * spring(t - keys[i][0], feel);
  return v;
}
