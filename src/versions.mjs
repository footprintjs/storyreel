/**
 * The installed versions of what StoryReel draws and records with: the making-of record names them (pipeline.mjs ·
 * TOOLS), and every segment's key holds them (segments.mjs), so an update that draws differently is never reused.
 */
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);

/** A dependency's installed version (from its package.json, even when its exports hide that file), or 'unknown'. */
export function installedVersion(name) {
  try { return require(`${name}/package.json`).version; } catch {}
  try { let dir = path.dirname(require.resolve(name)); for (let i = 0; i < 6; i++, dir = path.dirname(dir)) { try { const p = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')); if (p.name === name) return p.version; } catch {} } } catch {}
  return 'unknown';
}

/** What draws a frame: the canvas, the marker strokes, the sketched shapes, the code tokens, the burned-in captions' words. */
export const DRAWING = Object.freeze(['@napi-rs/canvas', 'perfect-freehand', 'roughjs', 'shiki', 'footprint-narration']);
