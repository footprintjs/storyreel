/**
 * The thought cloud's entrance, a pure function of the seconds since its shot began: the trail's circles pop up one after
 * another from the corner toward the cloud, each with a small overshoot (motion.mjs · spring), then the cloud opens out
 * of the trail (about its anchor), its scallops filling out one after another round from there. At rest from
 * THOUGHT_ENTRANCE.settled on: exactly the cloud, so its regions are exact and nothing creeps.
 */
import {spring} from '../motion.mjs';
import {smooth} from '../frame.mjs';

/**
 * The entrance, in seconds from the shot's start: each trail circle's pop (from the corner out), the cloud's opening, the
 * step between its scallops, the backdrop darkening in (from, to: as the trail rises and the cloud starts to open), and
 * when all of it has settled.
 */
export const THOUGHT_ENTRANCE = Object.freeze({trail: Object.freeze([0, .14, .28]), cloud: .38, scallops: .02, backdrop: Object.freeze([0, .75]), settled: 1.6});
/** The circles pop with a small overshoot (about 8 %); the cloud opens a little softer (about 2.5 %). */
const POP = Object.freeze({k: 260, d: 20}), OPEN = Object.freeze({k: 190, d: 21});

/**
 * The cloud `age` seconds into its shot: {trail: [three circles' sizes, from the corner out], open (the cloud's size
 * about its anchor), bulge (each scallop's share of its depth; null: all full), backdrop (how far the ground round the
 * cloud has darkened in, 0..1, eased)}, each 0 before its turn and 1 once it has settled. Before the shot nothing shows;
 * from THOUGHT_ENTRANCE.settled on it is exactly the cloud at rest.
 */
export function thoughtAt(cloud, age) {
  if (!(age > 0)) return {trail: [0, 0, 0], open: 0, bulge: cloud.rank.map(() => 0), backdrop: 0};
  if (age >= THOUGHT_ENTRANCE.settled) return {trail: [1, 1, 1], open: 1, bulge: null, backdrop: 1};
  const {trail, cloud: opens, scallops, backdrop: [from, to]} = THOUGHT_ENTRANCE;
  return {trail: trail.map(at => spring(age - at, POP)), open: spring(age - opens, OPEN),
    bulge: cloud.rank.map(k => .4 + .6 * spring(age - opens - scallops * k, POP)), backdrop: smooth(from, to, age)};
}

/** The cloud's growth at `age` as a camera about its anchor ({sx, sy, z, tx, ty}: regions.mjs · about): what is drawn in it is seen through it. */
export function thoughtCamera(cloud, age) {
  const [x, y] = cloud.anchor;
  return {sx: x, sy: y, z: thoughtAt(cloud, age).open, tx: x, ty: y};
}
