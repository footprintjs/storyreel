/**
 * The stage as a story kit (the port a film compiles): a recipe names it like any world — {"kit": name, "place", …}
 * on the story or inside a `world` stage — and gets a world whose actions are timed on the film's clock (phrases,
 * Law 2), with the stage's names for the camera, its sounds, mouths that open with the voice (for people whose kit
 * drawing says mouth: true), and its continuity: the facts it starts and ends with (checked with the shot's own, and
 * carried to the next shot, unless the stage is `aside`) and its ledger, both in the film's record.
 */
import {readAdapters} from './adapters.mjs';
import {compileStage} from './compile.mjs';
import {mouthAt} from '../acting.mjs';

export function stageKit({name, ...adapters} = {}) {
  if (!(typeof name === 'string' && name.trim())) throw new Error('stageKit: name is the kit\'s name, the "kit" a recipe names');
  const port = readAdapters(adapters, name);
  const compile = (spec, context) => {
    const {kit, ...rest} = spec ?? {}, clock = context.clock;
    const stage = compileStage(rest, {adapters: port, at: ref => clock.at(ref), clock, where: `the "${rest.place}" stage`});
    const talkers = Object.entries(rest.cast ?? {}).filter(([id, c]) => port.person(c?.as ?? id, id).mouth).map(([id]) => id);
    const mouthsAt = t => stage.stateAt(t).people.filter(p => talkers.includes(p.who)).map(p => ({who: p.who, open: mouthAt(clock, t, p.who)}));
    return {hang: 1, draw: stage.draw, regionsAt: stage.regionsAt, sounds: [...stage.sounds], ledger: stage.ledger,
      ...(stage.continuity ? {continuity: stage.continuity} : {}), ...(talkers.length ? {mouthsAt} : {})};
  };
  return Object.freeze({name, adapters: port, story: Object.freeze({context: true, compile})});
}
