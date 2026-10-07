/** A feel: a spring's stiffness and damping. */
export interface Feel {k: number; d: number}
export type FeelName = 'snappy' | 'default' | 'heavy' | 'playful';
export const FEELS: Readonly<Record<FeelName, Readonly<Feel>>>;
export const FEEL_NAMES: readonly FeelName[];
/** A feel as given (a name or {k, d}), checked. */
export function readFeel(feel?: FeelName | Feel): Feel;
/** A damped spring 0 → 1, t seconds after it starts (0 before); under-damped feels overshoot. */
export function spring(t: number, feel?: FeelName | Feel): number;
/** The scale of something arriving at `at`: 0 → 1 with the feel's overshoot (playful by default). */
export function pop(t: number, at: number, feel?: FeelName | Feel): number;
/** A value with several targets [[time, value], …]: one spring per change, continuous, a pure function of t. */
export function track(t: number, keys: [number, number][], feel?: FeelName | Feel): number;
