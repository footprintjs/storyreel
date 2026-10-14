// Checked by test/mocap.test.mjs with tsc: the motion-source port, fromPose and the figure, as a kit author uses them.
import {fromPose, MOCAP, SCHEME_NAMES, type Keypoints, type MocapSource, type ClipPose, type MocapError} from '../types/sub/mocap.js';
import {motionSource, walkSource, checkPose, TORSO_SHARE, type Pose, type MotionSource} from '../types/sub/pose.js';
import {drawFigure, figureAt, FIGURE_COLORS} from '../types/sub/figure.js';
import {walk} from '../types/sub/walk.js';

const keypoints: Keypoints = {scheme: 'coco-17', fps: 30, coordinates: 'pixels', frames: [[[1, 2, .9], null], {nose: [1, 2, .8]}, null]};
export const made: Promise<MocapSource> = fromPose(keypoints, {x: 200, size: 400, loop: true, seam: .04, smooth: {beta: .3}, facing: -1, from: .5});
export const pose = async (): Promise<ClipPose> => (await made).poseAt(1);
export const elbow = async (): Promise<number> => (await pose()).joints.arms[1].elbow;
export const planted = async (): Promise<number> => (await made).record.contacts[0].film[0];
export const chosen = async (): Promise<string> => (await made).record.gaps[0].evidence.chosen;
export const places = async (): Promise<number> => (await made).record.gaps[0].at.length + (await made).record.dropouts[0].runs;
export const cutFrom = (e: MocapError): number | undefined => e.record?.loop?.cut?.from;
export const roll = async (): Promise<number> => (await pose()).feet[0].angle;
export const loopHow = async (): Promise<'once' | 'loop' | 'refuse'> => (await made).record.loop.how;
export const anySource = async (): Promise<MotionSource> => made;
export const planned: MotionSource = walkSource(walk({from: 0, to: 100, start: 0, size: 400}));
export const fromOptions = walkSource({from: 0, to: 100, start: 0, size: 400, style: 'tiptoe'});
export const checked: Pose = checkPose(planned.poseAt(1));
export const mine = motionSource({name: 'still', poseAt: (t: number): Pose => ({...checked, x: t})});
export const feetY = (ctx: unknown, p: Pose): number => { drawFigure(ctx, p, {floor: 760, size: 420, colors: {shirt: '#000'}}); return figureAt(p, {floor: 760, size: 420}).feet[0].y; };
export const numbers: number = MOCAP.maxGap + MOCAP.smooth.minCutoff + TORSO_SHARE + FIGURE_COLORS.skin.length + SCHEME_NAMES.length;
export const refused = (e: MocapError): number => e.record?.refused?.length ?? 0;
// @ts-expect-error fromPose needs where the figure stands and how tall it is
fromPose(keypoints, {});
// @ts-expect-error a scheme is coco-17 or mediapipe-33
export const wrong: Keypoints = {scheme: 'openpose', fps: 30, coordinates: 'pixels', frames: []};
// @ts-expect-error a pose's facing is 1 or -1
export const sideways: Pose = {...checked, facing: 0};
// @ts-expect-error a foot has its roll (main's WalkFoot)
export const flat: Pose = {...checked, feet: [{x: 0, lift: 0}, {x: 0, lift: 0}]};
