import type {Beat, ContextKit} from '../index.js';

/** A moment on the film clock and the recording time shown there, in seconds. */
export interface FootageKey {at: number | Beat; video: number}
/** A named box in the original recording's pixels, before contain/cover fitting. */
export interface FootageRegion {name: string; box: [left: number, top: number, right: number, bottom: number]}
/** A local, muted recording used as the story or a world stage. Runtime admission checks every bound. */
export interface FootageSpec {
  kit?: 'footage';
  scene: string;
  /** MP4 or WebM inside the film root; URLs and links outside root refuse. */
  file: string;
  /** contain preserves the whole recording (default); cover crops to fill the frame. */
  fit?: 'contain' | 'cover';
  /** A three- or six-digit hex colour, default #15151b. */
  background?: string;
  /** Decoded sampling rate, a whole number from 1 to 30; default 12. */
  fps?: number;
  /** Decode width, a whole number from 160 to 1920; default 1600. */
  width?: number;
  /** Film times strictly increase; video times never decrease. Equal video times hold a frame. */
  keys?: FootageKey[];
  regions?: FootageRegion[];
}
/** Shared admission, decoding and remapping bounds; reduce the recording or decode settings when refused. */
export const FOOTAGE: Readonly<{
  fps: number; width: number; maxSeconds: number; maxBytes: number; maxFrames: number;
  maxSourcePixels: number; maxFrameBytes: number; maxCacheBytes: number; memoryBytes: number;
  maxKeys: number; maxRegions: number; minRate: number; maxRate: number; timeoutMs: number;
  maxPreparing: number; maxRequests: number;
}>;
/** Explicit local tools. FFmpeg defaults to FFMPEG_BIN or PATH; omitted ffprobe first checks beside FFmpeg, then PATH. No media is fetched. */
export function createFootageKit(options?: {ffmpeg?: string; ffprobe?: string}): ContextKit;
/** Recorded-video world kit; compileFilm awaits its prepared frames before drawing. */
export const footageKit: ContextKit;
