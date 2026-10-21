/**
 * A steps track (footprint-storyreel/kits/paper/steps-track): a slim band of labelled stations over any scene, its
 * playhead hopping station to station — back with ⏪, or forward with ▶ — the current station lit, the ones behind
 * ticked, the next one a "?" until it is reached; a flip turns a finished rewind into play. Use it for a process
 * walked backward, then played forward.
 */
export interface StepsTrackStationSpec<At = number> { label: string; at: At; glyph?: 'tag' | 'clock' | 'flashlight' }
export interface StepsTrackSpec<At = number> {
  direction: 'back' | 'forward';
  stations: StepsTrackStationSpec<At>[];
  /** Where the band sits (default bottom: under the landscape caption band). */
  place?: 'top' | 'bottom';
  /** Only with direction "back": when the ⏪ turns into ▶, and the stations then played forward. */
  flip?: {at: At; stations: StepsTrackStationSpec<At>[]};
  from?: At;
  until?: At;
  /** Only with direction "back", in a film: the picture plays back to `to` (in its own shot) as the track enters. */
  rewind?: {to: At; seconds?: number};
}
export interface StepsTrackStation { readonly label: string; readonly glyph: string | null; readonly at: number }
export interface StepsTrack {
  readonly place: 'top' | 'bottom'; readonly y: number; readonly direction: 'back' | 'forward';
  readonly stations: readonly StepsTrackStation[];
  readonly flip: {readonly at: number; readonly stations: readonly StepsTrackStation[]} | null;
  readonly from: number; readonly until: number;
  readonly rewind: {readonly to: number; readonly from: number; readonly seconds: number} | null;
}
export type StationState = 'visited' | 'current' | 'next' | 'ahead';
export interface StationAt { readonly label: string; readonly glyph: string | null; readonly state: StationState; readonly text: string; readonly x: number; readonly pop: number }
export interface WalkAt { readonly direction: 'back' | 'forward'; readonly head: number; readonly room: number; readonly alpha: number; readonly stations: readonly StationAt[] }
export interface StepsTrackAt {
  readonly alpha: number; readonly direction: 'back' | 'forward'; readonly mark: '⏪' | '▶'; readonly turn: number;
  readonly stations: readonly StationAt[]; readonly walks: readonly WalkAt[];
}
export const STEPS_TRACK: Readonly<{
  places: Readonly<{top: number; bottom: number}>; label: number; stations: number; hop: number; gap: number; enter: number;
  fade: number; leave: number; hold: number; flip: number; pop: number; rewind: Readonly<{seconds: number; min: number; max: number}>;
}>;
/** Read and check a track; `at` turns a moment as written into seconds (left out: moments are seconds). */
export function readStepsTrack(spec: StepsTrackSpec<unknown>, options?: {where?: string; at?: ((moment: unknown) => number) | null}): StepsTrack;
export function stepsTrackAt(track: StepsTrack, t: number): StepsTrackAt | null;
export function stepsTrackBox(track: StepsTrack, t: number): [number, number, number, number] | null;
export function stepsTrackLines(track: StepsTrack): {text: string; from: number; to: number; path: string}[];
/** Draw the track at t on a 1600×900 frame with a pen (footprint-storyreel/pen · makePen). */
export function drawStepsTrack(ctx: unknown, pen: unknown, track: StepsTrack, t: number): void;
