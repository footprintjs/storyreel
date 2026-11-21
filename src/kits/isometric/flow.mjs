/**
 * flow — the kit's map built again by footprint-story's map flow, so a run's record says why the map is as it is.
 *
 *   mapRun(map)  → run({sink, recorders}) → {snapshot, differs}
 *
 * WHY: a world is compiled on a synchronous path, so the kit draws with buildIsoMap (build.mjs); a footprintjs run is
 * asynchronous. `storyreel check` runs this flow beside the compile (check/maps.mjs): one stage per step of the same
 * functions buildIsoMap runs, its record kept as a file, so `storyreel log --why at --map story` walks a block's place
 * back through the place step and the decision that let it run (footprint-story/mapflow, docs/design/2026-11-map-flow.md).
 *
 * It is handed the very spec and policy buildIsoMap was handed (`map.spec`, ISO_FIT): never made again here. Its map is
 * compared with the kit's built map: they must be equal (footprint-story pins it with a property test). `differs` is
 * null, or where they first part ("at[2][0]: 3 here, 4 in the kit's"), for the check to say aloud: the film draws the
 * kit's map, so a difference is a fault of the two compositions, never of the film, and never a silent one.
 */
import {isDeepStrictEqual} from 'node:util';
import {ISO_FIT} from './build.mjs';

/** The most characters a value is shown with in `differs`. */
const SHOWN = 60;
const shown = (v) => { const s = JSON.stringify(v) ?? String(v); return s.length > SHOWN ? `${s.slice(0, SHOWN - 1)}…` : s; };

/** Where two plain values first part, as a path and both values ("view.tile[0]: 120 here, 96 in the kit's"), or null. */
export function firstDifference(here, kit, at = '') {
  if (isDeepStrictEqual(here, kit)) return null;
  const both = (v) => v !== null && typeof v === 'object';
  if (both(here) && both(kit) && Array.isArray(here) === Array.isArray(kit)) {
    const keys = [...new Set([...Object.keys(here), ...Object.keys(kit)])];
    for (const k of keys) {
      const deeper = firstDifference(here[k], kit[k], Array.isArray(here) ? `${at}[${k}]` : at ? `${at}.${k}` : k);
      if (deeper) return deeper;
    }
  }
  return `${at || 'the map'}: ${shown(here)} here, ${shown(kit)} in the kit's`;
}

/**
 * The map flow's run of a built map (build.mjs · buildMap: it keeps `spec` and `built`). The run is the caller's to
 * record: `sink` (footprintjs/sinks · fileSink, the caller closes it) and `recorders` (controlDepRecorder()) go to
 * footprint-story/mapflow · runMapFlow as they are. Loaded when first run, so a film that never asks pays nothing.
 */
export function mapRun(map) {
  return async ({sink, recorders = []} = {}) => {
    const {runMapFlow} = await import('footprint-story/mapflow');
    const {map: flowed, snapshot} = await runMapFlow(map.spec, ISO_FIT, {...(sink ? {sink} : {}), recorders});
    return {snapshot, differs: firstDifference(flowed, map.built)};
  };
}
