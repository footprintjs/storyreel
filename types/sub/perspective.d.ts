/** A point of the room on the frame: where it lands and how small it looks (1 on the front line). */
export interface RoomPoint { x: number; y: number; scale: number }
/** A point on the floor: across (px on the front line), how far back (px), how high off the floor (px). */
export interface FloorPoint { x: number; depth: number; height?: number }
/** One room's perspective grid (one-point: the back wall faces us; what runs into the room meets at the vanishing point). */
export interface Room {
  readonly horizon: number; readonly vanish: number; readonly front: number; readonly focal: number;
  /** How small a thing looks at a depth: 1 on the front line, toward 0 far back. */
  scaleAt(depth: number): number;
  /** A floor point (x on the front line, depth px back), lifted `height` px, on the frame. */
  at(x: number, depth?: number, height?: number): RoomPoint;
  /** n evenly spaced points from a to b (a rail into the room), in the order given, each with its depth. */
  along(a: FloorPoint, b: FloorPoint, n: number): (RoomPoint & {depth: number})[];
  /** The items sorted so the furthest is drawn first (painter's order); ties keep their order. */
  backToFront<T>(items: T[], depthOf?: (item: T) => number): T[];
  /** A floor line running into the room from x on the front line to the vanishing point. */
  toward(x: number): [[number, number], [number, number]];
  /** How far a thing at that depth moves when the camera pans by `shift` at the front line. */
  parallax(depth: number, shift: number): number;
}
/** A room's grid: horizon (y), vanishing point (x), the floor's front edge (y, scale 1), focal (how deep it feels). */
export function perspective(options: {horizon: number; vanish?: number; front?: number; focal?: number}): Room;
