/**
 * The film's camerawork: the recipe's `camera` moves (camera.mjs · CAMERA_MOVES) placed on the film's clock, held
 * to the rule that a film has ONE camera, played as moves or — for a viewer who asks for reduced motion — as cuts,
 * and aimed. The plan is made by a footprintjs flowchart, so the film's record says how each move was read and why
 * it was played the way it was (a decide() with its evidence):
 *
 *   read moves → one picture → one camera → motion? (decide: reduced motion) → cuts | moves → aim
 *
 * HOW IT COMPOSES (film/picture.mjs · frame). The picture is drawn on the picture's clock (a freeze or a speed ramp:
 * clockAt), a director's push moves it, the focus frames it (attention.mjs), then the camera's view is the outermost
 * lens, with handheld's drift over that. The view, the pushes and the focus run on the voice's clock; depth moves
 * act inside a world, on the picture's clock (a freeze stops them too).
 *
 * ONE CAMERA. A camera move (view, follow or depth) cannot run while something else moves the camera: a moving
 * focus (a camera-strategy focus, from each key until its spring settles: motion.mjs · settleTime), a director's
 * push (while it eases in or out), a world's spotlight, or a world's own camera (StoryWorld · cameraMoves: the
 * cartoon kit's camera keys) — as a push never runs over a spotlight or a kit's camera either. They take turns, and they compose: the camera frames a held push or focus, and a
 * focus that moves later frames inside the camera's held view. Two moves may run at once when they move different
 * things (a pan and a dutch), never the same one. Handheld is a texture, not a move: it runs under anything.
 *
 * ONE PICTURE. A move (but handheld) stays on one picture: one that runs across a change of picture (a hand-over, an
 * entrance, a cut, the push-in, the teaser) refuses, as a push does. Its framing holds until the picture changes, and
 * over the change it eases back to the whole frame (at a cut, at once), so every new picture opens wide. A world's
 * depth state holds until the world leaves; a rack focus opens its world focused on the layer it racks from.
 *
 * REDUCED MOTION (compileFilm({reducedMotion: true})). Each move cuts to its end framing on its first moment (a truck
 * or a track, whose end is wherever its thing is, at its last), the return over a change cuts at the change's start,
 * a speed ramp plays in step with the voice, handheld is off, and a freeze is kept (a still is not motion).
 *
 * This file is the chart's wiring only: each stage's work is in camerawork/stages.mjs, the lanes the moves become in
 * camerawork/lanes.mjs, and the checks on where the camera goes in camerawork/checks.mjs (see camerawork/README.md).
 */
import {flowChart, narrative} from 'footprintjs';
import {CAMERA_MOVE_NAMES} from './camera.mjs';
import {readMoves, onePicture, oneCamera, chooseMotion, played, aim, recordOf} from './camerawork/stages.mjs';

/** The flowchart's logger: a refusal is rethrown to the caller, so footprintjs does not print it a second time. */
const QUIET = Object.freeze({info() {}, log() {}, debug() {}, error() {}, warn: (...args) => console.warn(...args)});

/**
 * The camera plan for a recipe's `camera` list. `env` is what the film knows: clock (at: beat → seconds), total,
 * changes ([{from, to, what}]: every change of picture), named(name, tp) (the box of a named thing as drawn at
 * the picture's time tp, before any push), under(t) (the view the push and the focus put under the camera at t, or
 * null: through it a box is where the camera sees it), worldAt(t) ({world, path} on screen at t, or null on paper),
 * focus (attention.mjs · readFocus, or null), pushes (notes.mjs · placePushes), spotlight(t) (whose spotlight shows
 * at t, or null), kitCamera(a, b) (a world's own camera moving between a and b while it is on screen: {path, kit,
 * from, to}, or null), reducedMotion, and ground(ctx) (what lies under a moved view: the paper).
 * Returns {viewAt(t), viewOn(t), clockAt(t), depthAt(world, t), show(ctx, t, paint), record}.
 */
export async function planCamera(spec, env) {
  if (!Array.isArray(spec) || !spec.length) throw new Error(`camera is a list of moves, [{move, at, until?, …}] (the moves are ${CAMERA_MOVE_NAMES.join(', ')})`);
  const work = {moves: [], decision: null, cuts: false, plan: null};
  const chart = flowChart('read moves', s => readMoves(s, spec, env, work), 'read-moves', 'Each move checked against the catalog and put on the clock')
    .addFunction('one picture', s => onePicture(s, env, work), 'one-picture', 'Each move stays on one picture, and a depth move on a world with layers')
    .addFunction('one camera', s => oneCamera(s, env, work), 'one-camera', 'Nothing else moves the camera while a move does')
    .addDeciderFunction('motion', s => chooseMotion(s, work), 'motion', 'Moves, or cuts for reduced motion')
    .addFunctionBranch('cuts', 'cuts', s => played(s, work, true), 'Each move a cut to its end framing; handheld off; a speed ramp in step; a freeze kept')
    .addFunctionBranch('moves', 'moves', s => played(s, work, false), 'Each move as written')
    .setDefault('moves')
    .end()
    .addFunction('aim', s => aim(s, env, work), 'aim', 'Where each move takes the camera, kept covering the frame')
    .setLogger(QUIET).build();
  const trace = narrative();
  await chart.recorder(trace).run();
  return {...work.plan, record: recordOf(work, trace)};
}

