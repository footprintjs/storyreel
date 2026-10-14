/**
 * A geometry audit for drawn parts, as an anatomy check reads a figure: a limb stays on the body it hangs from, two
 * limbs that must never cross do not, and a foot planted on the ground does not slide while it is planted.
 *
 * A kit that wants its drawing audited gives its PARTS at any moment — parts(t) on a world (a stage kit: parts(handle,
 * t)) — in its own coordinates (before any camera), as the numbers it draws from:
 *
 *   parts(t) → {segments: {"arm left": {a: [x, y], b: [x, y], width: 16, mount: "robe"}, …},
 *               regions:  {"robe": [x0, y0, x1, y1], …},
 *               apart:    [["arm left", "arm right"], …]}
 *
 *   a, b     a segment's two ends: `a` is its root, `b` its tip; width its thickness (0 by default)
 *   mount    the part `a` must land on: a segment (touching it, widths counted) or a region (inside it)
 *   ends     'free' (the default: only `a` is held) or 'mounted' (`b` lands on the mount too: a strap, a hand rail)
 *   contact  the end that rests on the ground while it is planted: 'a', 'b', or true (both: flat on the floor); false
 *            or left out while it is in the air. A planted end never moves from where it was first planted, until the
 *            part lifts. Read it from the pose — walk.mjs's feet are planted while `lift` is 0, and a rolling foot rests
 *            on its heel while its toes are up (angle > 0), flat at 0, and on its toe while its heel is up (angle < 0):
 *            name that end, and the foot passes while it rolls about it
 *   apart    pairs of segments whose centre lines must never cross (a joint they share is no crossing)
 *
 * The audit samples the kit's parts every GEOMETRY.every seconds over a stretch of the film (film.partsAt) and says
 * what breaks, when, by the recipe entry that drew it.
 */

/**
 * The thresholds, in the kit's own pixels (the 1600×900 frame at a full-frame world's rest).
 *   every  seconds between moments read: a frame at 30 fps, so a step's lift (a quarter second or more) is never missed
 *   reach  how far past touching a mounted end may sit before it has come off (2 px: under a stroke's own wobble)
 *   slide  how far a planted end may be from where it was first planted (1 px: rounding, never a step — a drift of
 *          a fraction of a pixel a moment adds up, and fails)
 *   jump   the most the picture's clock may run per second of the film's and still be the same picture moving on: a
 *          speed ramp plays it at up to 2.5 × (camera.mjs · speedRamp), so 3 × is a jump — a freeze ending, a cut
 * Moments further apart than 1.5 × every (the parts were not on screen in between), or across a jump of the picture's
 * clock, start the planted ends again: what was planted before is not the same picture's.
 */
export const GEOMETRY = Object.freeze({every: 1 / 30, reach: 2, slide: 1, jump: 3});
const ENDS = ['free', 'mounted'];
const SEGMENT_KEYS = ['a', 'b', 'width', 'mount', 'ends', 'contact'];
const isPoint = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const isBox = b => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && b[2] >= b[0] && b[3] >= b[1];

/**
 * A kit's parts at one moment, checked: {segments, regions, apart}. `where` names the kit's entry and the moment, so a
 * refusal says whose parts are wrong and how to write them.
 */
export function readParts(parts, where) {
  if (!parts || typeof parts !== 'object' || Array.isArray(parts)) throw new Error(`${where}: parts(t) returns {segments: {name: {a, b, width?, mount?, ends?, contact?}}, regions?: {name: [x0, y0, x1, y1]}, apart?: [[name, name]]}`);
  const segments = parts.segments ?? {}, regions = parts.regions ?? {}, apart = parts.apart ?? [];
  if (typeof segments !== 'object' || Array.isArray(segments)) throw new Error(`${where}: segments is {name: {a: [x, y], b: [x, y], …}}`);
  if (typeof regions !== 'object' || Array.isArray(regions)) throw new Error(`${where}: regions is {name: [x0, y0, x1, y1]}`);
  for (const [name, s] of Object.entries(segments)) {
    const it = `${where}: segment "${name}"`;
    if (!s || typeof s !== 'object') throw new Error(`${it} must be {a: [x, y], b: [x, y], width?, mount?, ends?, contact?}`);
    for (const key of Object.keys(s)) if (!SEGMENT_KEYS.includes(key)) throw new Error(`${it} has ${key}; a segment takes ${SEGMENT_KEYS.join(', ')}`);
    if (!isPoint(s.a) || !isPoint(s.b)) throw new Error(`${it}: a and b are its two ends, [x, y] each`);
    if (s.width !== undefined && !(Number.isFinite(s.width) && s.width >= 0)) throw new Error(`${it}: width is its thickness in px, 0 or more`);
    if (s.ends !== undefined && !ENDS.includes(s.ends)) throw new Error(`${it}: ends is 'free' (only a is held) or 'mounted' (b lands on the mount too), not ${JSON.stringify(s.ends)}`);
    if (s.ends === 'mounted' && s.mount === undefined) throw new Error(`${it}: ends 'mounted' needs a mount (the part both ends land on)`);
    if (s.contact !== undefined && typeof s.contact !== 'boolean' && s.contact !== 'a' && s.contact !== 'b') throw new Error(`${it}: contact names the end that rests on the ground ('a', 'b', or true for both), or is false while it is in the air, not ${JSON.stringify(s.contact)}`);
    if (s.mount !== undefined) {
      if (s.mount === name) throw new Error(`${it} is mounted on itself`);
      if (!Object.hasOwn(segments, s.mount) && !Object.hasOwn(regions, s.mount)) throw new Error(`${it} is mounted on "${s.mount}", which is not among its parts (segments: ${Object.keys(segments).join(', ') || 'none'}; regions: ${Object.keys(regions).join(', ') || 'none'})`);
    }
  }
  for (const [name, box] of Object.entries(regions)) if (!isBox(box)) throw new Error(`${where}: region "${name}" is a box, [x0, y0, x1, y1]`);
  if (!Array.isArray(apart)) throw new Error(`${where}: apart is a list of pairs, [["arm left", "arm right"]]`);
  apart.forEach((pair, i) => {
    if (!Array.isArray(pair) || pair.length !== 2 || pair[0] === pair[1]) throw new Error(`${where}: apart[${i}] is a pair of two segments' names`);
    for (const n of pair) if (!Object.hasOwn(segments, n)) throw new Error(`${where}: apart[${i}] names "${n}", which is not one of its segments`);
  });
  return {segments, regions, apart};
}

// Plane geometry: a point's distance to a segment and to a box; whether two segments cross.
const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1];
const cross = (p, q) => p[0] * q[1] - p[1] * q[0];
const length = p => Math.hypot(p[0], p[1]);
function toSegment(p, a, b) {
  const ab = sub(b, a), n = dot(ab, ab), u = n ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / n)) : 0;
  return length(sub(p, [a[0] + u * ab[0], a[1] + u * ab[1]]));
}
const toBox = (p, [x0, y0, x1, y1]) => Math.hypot(Math.max(x0 - p[0], 0, p[0] - x1), Math.max(y0 - p[1], 0, p[1] - y1));
/** Whether two segments' centre lines cross: properly, through each other; a shared end (a joint) or a touch is no crossing. */
export function crosses([a, b], [c, d]) {
  const near = (p, q) => length(sub(p, q)) < .5;
  if (near(a, c) || near(a, d) || near(b, c) || near(b, d)) return false;
  const r = sub(b, a), s = sub(d, c), den = cross(r, s);
  if (Math.abs(den) < 1e-9) return false;   // parallel: never through each other
  const u = cross(sub(c, a), s) / den, v = cross(sub(c, a), r) / den;
  return u > 1e-6 && u < 1 - 1e-6 && v > 1e-6 && v < 1 - 1e-6;
}

/** How far a segment's end sits off its mount: 0 or less when it lands on it (touching, both widths counted). */
function offMount(end, segment, mount, {segments, regions}) {
  const half = (segment.width ?? 0) / 2;
  if (Object.hasOwn(segments, mount)) { const m = segments[mount]; return toSegment(end, m.a, m.b) - half - (m.width ?? 0) / 2; }
  return toBox(end, regions[mount]) - half;
}

/**
 * Audit parts over a stretch: samples [{t, picture?, parts: [{path, …parts}]}] in time order (film.partsAt at each t,
 * `rule.every` apart; `picture`, the picture's clock there — film.pictureAt — when a camera holds or ramps it). Returns
 * {checked: {mounts, pairs, planted}, breaks: [{rule: 'mount' | 'cross' | 'slide', path, part, other?, end?, t, px?}]} —
 * every moment something breaks: an end `px` off its mount, a pair crossing, a planted end `px` from where it was first
 * planted.
 */
export function auditParts(samples, rule = GEOMETRY) {
  const checked = {mounts: 0, pairs: 0, planted: 0}, breaks = [];
  let planted = new Map(), last = null;
  for (const {t, picture = t, parts} of samples) {
    // Not the next moment (the parts were off screen in between), or the picture's clock jumped (a freeze ending): what
    // was planted before is not known to be still there. A freeze holding, or a speed ramp, is the same picture moving on.
    const dt = last && t - last.t, dp = last && picture - last.picture;
    if (last && (dt > rule.every * 1.5 + 1e-9 || dp < -1e-9 || dp > rule.jump * dt + 1e-9)) planted = new Map();
    last = {t, picture};
    const now = new Map();
    for (const given of parts) {
      const where = `${given.path} at ${t.toFixed(2)} s`, p = readParts(given, where);
      for (const [name, s] of Object.entries(p.segments)) {
        if (s.mount !== undefined) for (const end of s.ends === 'mounted' ? [s.a, s.b] : [s.a]) {
          checked.mounts++;
          const off = offMount(end, s, s.mount, p);
          if (off > rule.reach) breaks.push({rule: 'mount', path: given.path, part: name, other: s.mount, t, px: +off.toFixed(1)});
        }
        if (s.contact) {
          // Each planted end is held to where it was first planted (anchors), for as long as the part stays planted.
          const key = `${given.path}\u0000${name}`, anchors = {...planted.get(key)};
          for (const end of s.contact === true ? ['a', 'b'] : [s.contact]) {
            if (!anchors[end]) { anchors[end] = s[end]; continue; }
            checked.planted++;
            const moved = length(sub(s[end], anchors[end]));
            if (moved > rule.slide) breaks.push({rule: 'slide', path: given.path, part: name, end, t, px: +moved.toFixed(1)});
          }
          now.set(key, anchors);
        }
      }
      for (const [m, n] of p.apart) {
        checked.pairs++;
        if (crosses([p.segments[m].a, p.segments[m].b], [p.segments[n].a, p.segments[n].b])) breaks.push({rule: 'cross', path: given.path, part: m, other: n, t});
      }
    }
    planted = now;   // a part planted now keeps its anchors; one lifted is forgotten, and plants again where it lands
  }
  return {checked, breaks};
}

/** A break in words, the same for every moment of one stretch: "story: \"sheep 2 leg 1\" comes off \"sheep 2 body\", where it is mounted". */
export function breakText(b) {
  if (b.rule === 'mount') return `${b.path}: "${b.part}" comes off "${b.other}", where it is mounted`;
  if (b.rule === 'cross') return `${b.path}: "${b.part}" crosses "${b.other}", which it must keep apart from`;
  return `${b.path}: "${b.part}" slides while it is planted`;
}

/**
 * Read a film's parts over [from, to] and audit them: {samples (moments with parts), parts (distinct), checked, breaks,
 * worst: [{text, px?, t}] the largest of each break}. A film with no kit that gives its parts has nothing to audit.
 */
export function geometryOf(film, {from = 0, to = film.total, rule = GEOMETRY} = {}) {
  const samples = [];
  for (let k = 0, t = from; t <= to + 1e-9; t = from + ++k * rule.every) {
    const at = Math.min(film.total, +t.toFixed(4)), parts = film.partsAt?.(at) ?? [];
    if (parts.length) samples.push({t: at, picture: film.pictureAt?.(at) ?? at, parts});
  }
  const {checked, breaks} = auditParts(samples, rule), worst = new Map();
  for (const b of breaks) { const text = breakText(b), w = worst.get(text); if (!w || (b.px ?? 0) > (w.px ?? 0)) worst.set(text, {text, t: b.t, ...(b.px !== undefined ? {px: b.px} : {})}); }
  const names = new Set(samples.flatMap(s => s.parts.flatMap(p => Object.keys(p.segments ?? {}).map(n => `${p.path}\u0000${n}`))));
  return {samples: samples.length, parts: names.size, checked, breaks, worst: [...worst.values()]};
}

/** The verdict (verdict.mjs): not run when the parts declare nothing to check; failed when anything breaks. */
export const GEOMETRY_VERDICT = Object.freeze({
  rules: Object.freeze([
    Object.freeze({when: Object.freeze({checks: Object.freeze({eq: 0})}), then: 'not run', label: 'the parts declare nothing to check (no mount, no pair kept apart, no planted part)'}),
    Object.freeze({when: Object.freeze({broken: Object.freeze({gt: 0})}), then: 'failed', label: 'a drawn part breaks: an end comes off its mount, a pair crosses, or a planted part slides'}),
  ]),
  passed: 'every mounted end stays on, no pair kept apart crosses, and no planted part slides',
});
