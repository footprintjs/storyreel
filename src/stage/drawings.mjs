/**
 * The drawings a stage uses, as a kit a film compiles: stageDrawings({name, places, people, props, badge?}). A recipe
 * names them like any story kit — {"kit": name, "place", …} on the story or inside a `world` stage — and gets a world
 * whose actions are timed on the film's clock (phrases, Law 2), with the stage's names for the camera, its sounds,
 * mouths that open with the voice (for people whose drawing says mouth: true), and its continuity: the facts it starts
 * and ends with (joined with the shot's own and carried to the next shot, unless the stage is `aside`) and its ledger,
 * both in the film's record. A refusal names the recipe entry (the kit context's `where`) and the place.
 */
import {readAdapters} from './adapters.mjs';
import {compileStage} from './compile.mjs';
import {mouthAt} from '../acting.mjs';

export function stageDrawings({name, ...adapters} = {}) {
  if (!(typeof name === 'string' && name.trim())) throw new Error('stageDrawings: name is the drawings\' name, the "kit" a recipe names');
  const port = readAdapters(adapters, name);
  const compile = (spec, context) => {
    const {kit, ...rest} = spec ?? {}, clock = context.clock;
    const stage = compileStage(rest, {adapters: port, at: ref => clock.at(ref), clock, where: `${context.where ?? 'the stage'} (the "${rest.place}" stage)`});
    const talkers = Object.entries(rest.cast ?? {}).filter(([id, c]) => port.person(c?.as ?? id, id).mouth).map(([id]) => id);
    const mouthsAt = t => stage.stateAt(t).people.filter(p => talkers.includes(p.who)).map(p => ({who: p.who, open: mouthAt(clock, t, p.who)}));
    return {hang: 1, draw: stage.draw, regionsAt: stage.regionsAt, sounds: [...stage.sounds], ledger: stage.ledger,
      ...(stage.continuity ? {continuity: stage.continuity} : {}), ...(talkers.length ? {mouthsAt} : {})};
  };
  return Object.freeze({name, adapters: port, story: Object.freeze({context: true, compile})});
}
