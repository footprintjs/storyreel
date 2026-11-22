/**
 * The focus camera's flights between shots, as three steps: read the shots, plan each flight, check each flight. The
 * compile runs them one after another (planFlights); `storyreel check` runs the very same functions as a footprintjs
 * chart (run.mjs), so its record answers why a flight takes its time.
 *
 *   planFlights({shots}) → {shots, flights, findings, 'flight-<k>', 'findings-<k>'}
 *   viewAt(flights, t)   → the focus view {cx, cy, z, sx, sy, box, w} at t (kept covering the frame)
 *
 * WHO DECIDES WHAT. The author writes intent on each focus key: what the shot frames (on, size), and how to get there
 * (`do`: "fly", the default, or "cut"; `seconds` to fly over a length of their own). StoryReel frames each shot (where
 * the camera points and how close: attention.mjs, footprint-story/layout · frameZoom, the rule StoryDeck frames by).
 * footprint-story/shot · planCameraMove decides the flight between two shots — its kind (slerp, arc or cut), its path and
 * its seconds, timed by minimum jerk under its limits (45°/s turn, 1 frame height a second slide, 2× a second growth) —
 * and its critics (checkCameraMove) say what still looks wrong. StoryReel draws the path.
 *
 * THE PICTURE AS A SCENE. A StoryReel picture is drawn flat, so it is a scene of cards on the plane z = 0 facing the
 * camera, y up (a box [x0, y0, x1, y1] on the 1600 × 900 frame is a card at its middle, y negated), and every shot is
 * seen from the front, level. A focus view {cx, cy, z, sx, sy} (the picture's point cx, cy lands on the frame at sx, sy,
 * zoomed z) is the camera that looks at (cx, −cy, 0) through the normal lens with the frame's height at the target
 * 900 / z (so distance = focal × 900 / z), its picture slid by `shift` so the target lands at (sx, sy). Exactly: a point
 * of the picture lands where the view puts it. So a flight between two front views never turns (a slerp of 0°): its
 * target slides in a line and its zoom grows by equal ratios, the same at every speed.
 *
 * WHY views go in as camera numbers, not shot words: footprint-story frames a flat card by its height alone at its own
 * shares (SIZES) and knows no safe area; StoryReel's framing (FRAMINGS within focus.safe, from 1× to 3×) is the film's.
 */
import {planCameraMove, checkCameraMove, sampleCameraMove, LENSES} from 'footprint-story/shot';

const W = 1600, H = 900, FOCAL = LENSES.normal, FRAME = Object.freeze([W, H]);
/** The critics StoryReel adds to footprint-story's (CAMERA_CRITICS): a flight cut short by the next key. Ours. */
export const REEL_FLIGHT_CRITICS = Object.freeze(['reel:cut-short']);
const r3 = n => +n.toFixed(3);
const deepFreeze = v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const x of Object.values(v)) deepFreeze(x); } return v; };

/** A focus view as footprint-story's camera numbers: the front, level, through the normal lens (see above). */
export const cameraOf = v => ({target: [v.cx, -v.cy, 0], azimuth: 0, elevation: 0, distance: FOCAL * H / v.z, focal: FOCAL, aperture: 0, shift: [(v.sx - W / 2) / W, (H / 2 - v.sy) / H]});
/** footprint-story's camera back as a focus view: the exact inverse of cameraOf. */
export const viewOfCamera = c => ({cx: c.target[0], cy: -c.target[1], z: c.focal * H / c.distance, sx: W / 2 + W * c.shift[0], sy: H / 2 - H * c.shift[1]});
/** A view kept covering the frame (StoryReel's rule, as the spring kept it): the point it frames moved in as far as the edges ask. */
export const covering = v => ({...v, cx: Math.min(W - (W - v.sx) / v.z, Math.max(v.sx / v.z, v.cx)), cy: Math.min(H - (H - v.sy) / v.z, Math.max(v.sy / v.z, v.cy))});

/** The picture as drawn before any key: the whole frame, nothing in focus. */
export const WIDE_VIEW = Object.freeze({cx: W / 2, cy: H / 2, z: 1, sx: W / 2, sy: H / 2, box: Object.freeze([0, 0, W, H]), w: 0});
const lerp = (a, b, u) => a + (b - a) * u;
const mixed = (a, b, u) => ({cx: lerp(a.cx, b.cx, u), cy: lerp(a.cy, b.cy, u), z: lerp(a.z, b.z, u), sx: lerp(a.sx, b.sx, u), sy: lerp(a.sy, b.sy, u), box: a.box.map((x, i) => lerp(x, b.box[i], u)), w: lerp(a.w, b.w, u)});

/**
 * Step 1, read: the shots as the compile framed them (attention.mjs · readFocus), checked for what this module needs.
 * Each shot: {path, t, on (names, [] for wide), view {cx, cy, z, sx, sy, box, w}, do ('fly' | 'cut'), seconds (or
 * null), accept (critic names), things ([{name, box}]: what it frames, as drawn at t)}.
 */
function read({shots}) {
  if (!Array.isArray(shots) || !shots.length) throw new Error('the focus flights need the shots: [{path, t, on, view, do, seconds, accept, things}]');
  return {shots: shots.map(s => ({path: s.path, t: s.t, on: [...s.on], view: {...s.view, box: [...s.view.box]}, do: s.do, seconds: s.seconds, accept: [...s.accept], things: s.things.map(x => ({name: x.name, box: [...x.box]}))}))};
}

/** A flight's view at `u` seconds into it: the planned sample (or a cut's end), its veil box and focus blended by the same progress. */
function sampleView(f, u) {
  if (f.kind === 'cut' || u >= f.seconds) return f.to;
  const s = sampleCameraMove(f.move, Math.max(0, u));
  return {...mixed(f.from, f.to, s.progress), ...viewOfCamera(s.camera)};
}

/**
 * Step 2, plan: each shot's flight, from the view on screen as its key lands to its own. A flight is planned by
 * footprint-story (`do: 'fly'`), or is the cut its key asks for (`do: 'cut'`: no path, its view at once — footprint-story
 * has no asked-for cut: its cuts come of a turn past cutPast or a fly too far, and a front view never turns). A key that
 * lands before the flight above it has arrived cuts that one short where it is: the next sets off from there, from rest
 * (footprint-story plans between two shots only; a path through more is not there yet), and the check says so.
 */
function plan({shots}) {
  const flights = [], out = {};
  shots.forEach((shot, k) => {
    const before = flights[k - 1], u = before ? shot.t - before.t : 0;
    if (before && u < before.seconds) before.cutShort = {after: r3(u), by: shot.path};
    const from = before ? sampleView(before, u) : WIDE_VIEW;
    const base = {path: shot.path, t: shot.t, from, to: shot.view};
    const flight = shot.do === 'cut'
      ? {...base, kind: 'cut', rule: 'asked', seconds: 0, reason: `do: 'cut' → cut: the key asks for one, so the camera is on ${shot.on.length ? `"${shot.on.join('" + "')}"` : 'the whole frame'} at once`, move: null}
      : flown(base, shot);
    flights.push(flight);
  });
  for (const [k, f] of flights.entries()) out[`flight-${k}`] = flightRecord(f);
  return {flights, ...out};
}

/** A fly, planned by footprint-story between the two views as cameras. */
function flown(base, shot) {
  const move = planCameraMove({do: 'fly', from: cameraOf(base.from), to: cameraOf(base.to), who: shot.path, ...(shot.seconds === null ? {} : {seconds: shot.seconds})});
  return {...base, kind: move.kind, rule: move.choice.rule, seconds: move.seconds, reason: move.reason, move};
}

/** What the record keeps of a flight: its kind and why, its seconds and what set them, where it went — not the path. */
const flightRecord = f => ({path: f.path, at: r3(f.t), kind: f.kind, rule: f.rule, seconds: r3(f.seconds),
  ...(f.move ? {limitedBy: f.move.basis.limitedBy, comfortSeconds: f.move.basis.comfortSeconds, secondsGiven: f.move.basis.secondsGiven} : {}),
  from: viewRecord(f.from), to: viewRecord(f.to), reason: f.reason, ...(f.cutShort ? {cutShort: {...f.cutShort}} : {})});
const viewRecord = v => ({cx: r3(v.cx), cy: r3(v.cy), z: r3(v.z)});

/**
 * Step 3, check: footprint-story's critics on each flight (in-sight, turn-speed, travel-speed, line-of-action, horizon),
 * read on the scene of what its two shots frame, and StoryReel's own: `reel:cut-short`, a flight the next key cuts
 * short (the camera stops where it is and sets off again: a jolt no critic of one flight can see). Each finding names
 * its key, when it is seen, and the fix in the recipe's words; a critic its key names in `accept` is kept, marked.
 */
function check({shots, flights}) {
  const findings = [], out = {};
  flights.forEach((f, k) => {
    const shot = shots[k], prev = shots[k - 1] ?? null, said = [];
    const subjects = [...new Set([...(prev?.on ?? []), ...shot.on])];
    if (subjects.length) {
      // the cards each shot frames, at the key's time: the later shot's box where both name a thing
      const things = new Map([...(prev?.things ?? []), ...shot.things].map(x => [x.name, x]));
      const scene = {unit: 'px', things: [...things.values()].map(({name, box}) => ({name, at: [(box[0] + box[2]) / 2, -(box[1] + box[3]) / 2, 0], size: [Math.max(1, box[2] - box[0]), Math.max(1, box[3] - box[1])]}))};
      const path = f.kind === 'cut' ? {who: shot.path, samples: [{t: 0, camera: cameraOf(f.from)}, {t: 0, camera: cameraOf(f.to), cut: true}]} : f.move;
      for (const x of checkCameraMove(path, {scene, frame: FRAME, on: subjects, who: shot.path}).findings) said.push({critic: x.critic, level: x.level, what: unprefixed(x.message, shot.path), fix: inRecipeWords(x.fix, shot, prev)});
    }
    if (f.cutShort) {
      const next = shots[k + 1], late = r3(f.seconds - f.cutShort.after);
      said.push({critic: 'reel:cut-short', level: 'warn', what: `${next.path} lands ${f.cutShort.after} s into this flight of ${r3(f.seconds)} s, so the camera stops where it is and sets off again`,
        fix: `move ${next.path} ${late} s later, so this one arrives first; or give ${next.path} "do": "cut"`});
    }
    const kept = said.map(x => ({path: shot.path, from: f.t, to: f.t + (f.cutShort ? f.cutShort.after : f.seconds), critic: x.critic, level: shot.accept.includes(x.critic) ? 'accepted' : x.level, what: x.what, fix: x.fix}));
    out[`findings-${k}`] = kept.map(x => ({critic: x.critic, level: x.level, what: x.what, fix: x.fix}));
    findings.push(...kept);
  });
  return {findings, ...out};
}

/** A critic's message without its leading `who: ` (the finding names its key already). */
const unprefixed = (message, who) => (message.startsWith(`${who}: `) ? message.slice(who.length + 2) : message);
/**
 * footprint-story's fix in the recipe's words. Its fixes name its intent's keys: `seconds` is the key's own, a wider
 * framing is a size of the film's (FRAMINGS) or the whole frame, and a fly too far to time is a cut the key asks for.
 * A fix that would turn or lift the camera (lift, cutPast, by) is one a flat picture cannot take — it is seen from the
 * front only — so it is said as the change that can be made: frame wider, or cut. Anything else is kept as written.
 */
function inRecipeWords(fix, shot, prev) {
  const wider = `frame its ends wider: a wider size on ${prev ? `${prev.path} and ` : ''}${shot.path} ("medium"), or "on": "wide"`;
  const seconds = /^slow it: seconds: ([\d.]+)$/.exec(fix);
  if (seconds) return `slow it: give ${shot.path} "seconds": ${seconds[1]}`;
  if (fix === "frame its ends wider: size: 'wide' on from and to") return wider;
  if (/leave seconds out, and it cuts$/.test(fix)) return fix.replace(/leave seconds out, and it cuts$/, `leave "seconds" out of ${shot.path}, or give it "do": "cut"`);
  if (/\b(?:lift|cutPast|by): /.test(fix)) return `${wider}; or give ${shot.path} "do": "cut" (a flat picture is seen from the front: it cannot be flown over or round)`;
  return fix;
}

/** The three steps, in order: what each reads and writes, by name (run.mjs runs them as a chart; `-<k>` keys are each flight's). */
export const FLIGHT_STEPS = Object.freeze([
  Object.freeze({name: 'read', about: 'The focus keys as shots: what each frames and how it is reached', reads: Object.freeze([]), writes: Object.freeze(['shots']), run: read}),
  Object.freeze({name: 'plan', about: "Each flight between two shots, planned by footprint-story's camera planner (or cut, when its key asks)", reads: Object.freeze(['shots']), writes: Object.freeze(['flights']), perFlight: 'flight', run: plan}),
  Object.freeze({name: 'check', about: "footprint-story's camera critics on each flight, and the reel's own", reads: Object.freeze(['shots', 'flights']), writes: Object.freeze(['findings']), perFlight: 'findings', run: check}),
]);
/** Every key the steps write: the lists, and each flight's own (`flight-<k>`, `findings-<k>`). */
export const FLIGHT_KEYS = Object.freeze(FLIGHT_STEPS.flatMap(s => s.writes));
export const PER_FLIGHT = Object.freeze(FLIGHT_STEPS.filter(s => s.perFlight).map(s => s.perFlight));

/** The steps run one after another, as the compile runs them: everything they write, frozen. */
export function planFlights(input) {
  const state = {};
  for (const step of FLIGHT_STEPS) Object.assign(state, step.run(step === FLIGHT_STEPS[0] ? input : state));
  return deepFreeze(state);
}

/**
 * The focus view at t: before the first key the whole frame; else the flight of the last key landed, sampled where it
 * is (a flight cut short is replaced by the next from that moment), kept covering the frame.
 */
export function viewAt(flights, t) {
  const f = flights.findLast(x => t >= x.t);
  return f ? covering(sampleView(f, t - f.t)) : WIDE_VIEW;
}
/** How long a fly between two views takes as planned (no seconds given): what the director spaces its keys by. */
export const flightSeconds = (from, to) => planCameraMove({do: 'fly', from: cameraOf(from), to: cameraOf(to)}).seconds;
/** When each flight moves the camera: from its key until it arrives, or until the next key cuts it short ([] for a cut: a moment). */
export const movingOf = flights => flights.map((f, key) => ({from: f.t, to: f.t + (f.cutShort ? f.cutShort.after : f.seconds), key}));
