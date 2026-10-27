/**
 * The stage (`footprint-storyreel/stage`): a scene as data — a place, a cast, props, and actions from a small fixed
 * vocabulary — played by the library and drawn by a kit. The library owns the timing and motion of every action (as
 * pure functions of time), the refusals, the names the camera frames, and the continuity record; the kit supplies the
 * drawings through three adapters (places, people, props). See docs/design/2026-10-stage.md.
 *
 *   const stage = compileStage(spec, {adapters, at?, clock?})   at: a beat → seconds (standalone: seconds as numbers)
 *   stage.draw(ctx, t) · stage.stateAt(t) · stage.regionsAt(t) · stage.ledger · stage.facts · stage.sounds · stage.end
 *   stageDrawings({name, places, people, props, badge?})        the drawings a stage uses, as a kit a film takes:
 *                                                               a recipe names them {"kit": name, …}
 *   demoDrawings                                                tiny built-in drawings of plain shapes, to try it with
 */
export {compileStage} from './compile.mjs';
export {ACTIONS, ACTION_NAMES, BADGES, BADGE_NAMES} from './vocabulary.mjs';
export {TRAVELS, TRAVEL_NAMES} from './travel.mjs';
export {STAGE} from './timing.mjs';
export {STAGE_KEYS} from './read.mjs';
export {readAdapters} from './adapters.mjs';
export {plainBadge} from './paint.mjs';
export {stageDrawings} from './drawings.mjs';
export {demoDrawings, DEMO} from './demo.mjs';
