import type {Pose} from './pose.js';

interface At {x: number; y: number}
export const FIGURE_COLORS: Readonly<{skin: string; shirt: string; legs: string; shoes: string; ink: string}>;
/** The points a figure is drawn through, px on the canvas; near: the side drawn in front; unit: one torso length, px. */
export interface FigurePoints {
  hip: At; shoulder: At; head: At & {r: number};
  knees: [At, At]; feet: [At, At]; elbows: [At, At]; hands: [At, At];
  near: 0 | 1; unit: number;
}
/** Where the figure for a pose is drawn: floor is the floor's y (px), size its standing height (px). */
export function figureAt(pose: Pose, place: {floor: number; size: number}): FigurePoints;
/** Draw the cartoon figure for a pose (from any motion source), standing on floor, size px tall. */
export function drawFigure(ctx: any, pose: Pose, place: {floor: number; size: number; colors?: Partial<typeof FIGURE_COLORS>}): void;
