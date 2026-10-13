/**
 * A cartoon figure drawn from a pose (pose.mjs), so any motion source moves it: a planned walk, or motion copied
 * from a video (mocap.mjs · fromPose). A round head, a shirt, limbs as thick round strokes. Its feet go exactly where
 * the pose puts them — a planted foot never slides — and its knees bend forward to reach them (a foot out of reach
 * brings the hips down, never the foot up). Its arms and head bend by the pose's joints when it has them; a walk's
 * pose has none, and its arms swing with `swing`.
 *
 *   drawFigure(ctx, source.poseAt(t), {floor: 760, size: 420})
 *   figureAt(pose, {floor, size}) → the points it is drawn through, in px (for a check, or a kit's own drawing)
 *
 * Proportions are in torso lengths (pose.mjs · TORSO_SHARE of `size`, the figure's standing height): thigh and shin
 * 0.85 each, upper arm 0.55, forearm 0.5, neck 0.2, head 0.32 across its radius.
 */
import {TORSO_SHARE} from '../../pose.mjs';

const BONES = Object.freeze({thigh: .85, shin: .85, upper: .55, fore: .5, neck: .2, head: .32});
export const FIGURE_COLORS = Object.freeze({skin: '#f3c39b', shirt: '#e2574c', legs: '#3b4a6b', shoes: '#2e2c38', ink: '#2e2c38'});

/** A step of `len` px at `angle` from straight down (+ forward, the way `facing` points), on the canvas (y down). */
const toward = (p, angle, len, facing) => ({x: p.x + facing * Math.sin(angle) * len, y: p.y + Math.cos(angle) * len});

/** The knee joining a hip and a foot with these bones, bent forward; a foot out of reach straightens the leg toward it. */
function kneeFor(hip, foot, thigh, shin, facing) {
  const dx = foot.x - hip.x, dy = foot.y - hip.y, d = Math.hypot(dx, dy);
  if (d < 1e-9) return {x: hip.x + facing * thigh, y: hip.y};
  const u = {x: dx / d, y: dy / d};
  if (d >= thigh + shin) return {x: hip.x + u.x * thigh, y: hip.y + u.y * thigh};
  const along = (thigh * thigh + d * d - shin * shin) / (2 * d), out = Math.sqrt(Math.max(0, thigh * thigh - along * along));
  const n = {x: -u.y, y: u.x}, side = n.x * facing >= 0 ? 1 : -1;   // the normal that points the way it faces
  return {x: hip.x + u.x * along + n.x * out * side, y: hip.y + u.y * along + n.y * out * side};
}

/** The hips, lowered as far as the feet need: each foot within reach of a nearly straight leg. */
function hipsOver(pose, feet, floor, T) {
  const reach = (BONES.thigh + BONES.shin) * T * .999, hip = {x: pose.x, y: floor - (BONES.thigh + BONES.shin) * T * .98 - pose.lift};
  for (const foot of feet) {
    const dx = foot.x - hip.x;
    if (Math.abs(dx) < reach) hip.y = Math.max(hip.y, foot.y - Math.sqrt(reach * reach - dx * dx));
  }
  return hip;
}

/** One arm's angles (from hanging, + forward): the pose's joints, or a walk's swing. */
const armAngles = (pose, j) => pose.joints?.arms?.[j] ?? {shoulder: (j === 1 ? 1 : -1) * .5 * pose.swing, elbow: .25};

/**
 * The points the figure is drawn through, in px on the canvas: {hip, shoulder, head: {x, y, r}, knees, feet, elbows,
 * hands, near} — near is the side drawn in front (the left, facing +x). `floor` is the floor's y (px).
 */
export function figureAt(pose, {floor, size}) {
  if (!Number.isFinite(floor) || !(size > 0)) throw new Error(`figureAt: floor is the floor's y (px) and size the figure's standing height (px, above 0), not floor ${floor}, size ${size}`);
  const T = size * TORSO_SHARE, F = pose.facing, feet = pose.feet.map(f => ({x: f.x, y: floor - f.lift}));
  const hip = hipsOver(pose, feet, floor, T), lean = pose.lean;
  const shoulder = toward(hip, Math.PI - lean, T, F);
  const tilt = lean + (pose.joints?.neck ?? 0), r = BONES.head * T;
  const head = {...toward(shoulder, Math.PI - tilt, BONES.neck * T + r, F), r};
  const knees = feet.map(foot => kneeFor(hip, foot, BONES.thigh * T, BONES.shin * T, F));
  // An arm's angle is from the torso's line, and a torso leaning forward turns that line back by its lean (pose.mjs).
  const elbows = [0, 1].map(j => toward(shoulder, armAngles(pose, j).shoulder - lean, BONES.upper * T, F));
  const hands = [0, 1].map(j => { const a = armAngles(pose, j); return toward(elbows[j], a.shoulder - lean + a.elbow, BONES.fore * T, F); });
  return {hip, shoulder, head, knees, feet, elbows, hands, near: F === 1 ? 0 : 1, unit: T};
}

const stroke = (ctx, points, color, width) => {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
  for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();
};

/** Draw the figure for a pose (pose.mjs) standing on `floor` (its y, px), `size` px tall; colours as FIGURE_COLORS. */
export function drawFigure(ctx, pose, {floor, size, colors = {}} = {}) {
  const C = {...FIGURE_COLORS, ...colors}, P = figureAt(pose, {floor, size}), T = P.unit, F = pose.facing, far = 1 - P.near;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const leg = j => { stroke(ctx, [P.hip, P.knees[j], P.feet[j]], C.legs, .26 * T); ctx.fillStyle = C.shoes; ctx.beginPath(); ctx.ellipse(P.feet[j].x + F * .1 * T, P.feet[j].y, .2 * T, .1 * T, 0, 0, 7); ctx.fill(); };
  const arm = j => { stroke(ctx, [P.shoulder, P.elbows[j], P.hands[j]], C.shirt, .2 * T); ctx.fillStyle = C.skin; ctx.beginPath(); ctx.arc(P.hands[j].x, P.hands[j].y, .1 * T, 0, 7); ctx.fill(); };
  // Back to front: the far arm and leg, the body, the near leg and arm, the head.
  ctx.globalAlpha *= .85; arm(far); leg(far); ctx.globalAlpha /= .85;
  stroke(ctx, [P.hip, P.shoulder], C.shirt, .5 * T);
  leg(P.near); arm(P.near);
  ctx.fillStyle = C.skin; ctx.beginPath(); ctx.arc(P.head.x, P.head.y, P.head.r, 0, 7); ctx.fill();
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(P.head.x + F * .4 * P.head.r * (pose.turn ?? 0), P.head.y - .1 * P.head.r, .1 * P.head.r, 0, 7); ctx.fill();
  ctx.restore();
}
