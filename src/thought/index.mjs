/**
 * A thought cloud: a world drawn inside a cartoon thought bubble — a scalloped cloud with an ink outline and a soft
 * shadow, and a trail of three little circles toward a corner — for a memory, a recap, a daydream. No one is thinking
 * it: remembering is the cloud. A world takes it as its frame in the recipe, and the film hangs the world's sheet in
 * the cloud instead of on the paper (film.mjs · drawWorld):
 *
 *   {"story": {"kit": "draws", "shot": "recap", "frame": "thought"}, …}
 *   {"type": "world", "scene": "dream", "frame": {"type": "thought", "corner": "bottom-right", "size": 0.75}, "world": {…}}
 *
 * The cloudBurst transition (transitions/paper/burst.mjs) pops the same cloud into puffs: the same corner, size and seed
 * are the same cloud, and in a film it takes the frame's own when the recipe leaves them out.
 *
 *   corner  where the trail points: bottom-left (the default) · bottom-right · top-left · top-right; the cloud leans a
 *           little toward the opposite corner, to leave the trail room
 *   size    the cloud's share of the frame, 0.5–0.9 (0.8). The world is drawn at that scale, so the cloud is a window
 *           onto all of it but its corners, and the words in it stay readable
 *   seed    the scallops, 0–10000 (3): a seeded shape (seeded.mjs), the same on every frame and every machine
 *   color   the cloud's paper (null: the theme's card); `ink` its outline (null: the theme's ink)
 *   backdrop the ground round the cloud (the frame's alone): null, the shot's own; a hex colour, flat; or
 *           {color, vignette}, lighter near the cloud and darker at the edges. It darkens in with the entrance, and
 *           cloudBurst clears it on the pop, so a dark backdrop never lingers on the next shot
 *
 * The parts, each its own module: recipe.mjs (the frame as written, its settings), shape.mjs (the cloud as numbers),
 * entrance.mjs (its entrance, a pure function of time) and draw.mjs (on a canvas).
 */
export {THOUGHT_CORNERS, THOUGHT_SETTINGS, readThought, readBackdrop} from './recipe.mjs';
export {thoughtCloud} from './shape.mjs';
export {THOUGHT_ENTRANCE, thoughtAt, thoughtCamera} from './entrance.mjs';
export {cloudPath, drawThought, CLOUD_LINE} from './draw.mjs';
