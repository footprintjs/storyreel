/**
 * Stage 7 of the compile: the stages, each owning a scene of the narration — its keys checked, its world built (a
 * world stage), its code read and tokenized, and every phrase it names put on the clock, in the order the recipe lists
 * them. Its own stage because a stage's spec is read in one place, and everything after reads the built stages only.
 *
 * Reads: recipe, push, clock, data, motion, cast, within, transitions, stageKits, compileWorld, hung.
 * Writes: stages.
 */
import {icons} from '../kits/whiteboard/board.mjs';
import {tokenize, excerpt} from '../kits/paper/code.mjs';
import {readEntrance} from '../transitions.mjs';
import {readThought} from '../thought/index.mjs';
import {PLAN_KEYS, STAGE_KEYS, COMMON_KEYS, KIT_STAGE_ENGINE_KEYS, WORLD_KEYS, BUILT_IN_STAGES} from './keys.mjs';
import {valueFrom} from './util.mjs';

export async function buildStages(state) {
  const {recipe, push, clock, data, motion, cast, within, transitions, stageKits, compileWorld, hung} = state;
  // Stages, each owning a scene of the narration.
  const stages = [];
  for (const spec of recipe.stages ?? []) {
    const impl = stageKits[spec.type], where = `stage ${spec.scene}`;
    if (!BUILT_IN_STAGES.has(spec.type) && !impl) throw new Error(`${where} has type "${spec.type}", which no kit provides: pass the kit that adds it (kits: [myKit]), or use a built-in type (${[...BUILT_IN_STAGES].join(', ')})`);
    const allowed = spec.type === 'world' ? WORLD_KEYS : impl?.keys ? new Set([...COMMON_KEYS, ...KIT_STAGE_ENGINE_KEYS, ...impl.keys]) : STAGE_KEYS;
    // Which keys the engine itself reads on this stage (a kit's declared keys are never among them).
    const own = new Set(impl?.keys ?? []), reads = key => !own.has(key) && (!impl || !impl.keys || KIT_STAGE_ENGINE_KEYS.has(key));
    if (spec.frame !== undefined && !allowed.has('frame')) throw new Error(`${where} has a frame, and a frame is for a world (the story, or a stage of "type": "world"): a ${spec.type} stage has the page to itself`);
    for (const key of Object.keys(spec)) if (!allowed.has(key)) throw new Error(`${where} has unsupported key ${key} (it takes ${[...allowed].join(', ')})`);
    if (push && spec.enter !== undefined) throw new Error(`${where} has enter, and a film with a pushIn hands its stages over on one page (enter is for films without one): leave enter out`);
    if (push && spec.type === 'world') throw new Error(`${where} is a world, and a film with a pushIn keeps one page (worlds are for films without one)`);
    if (!push && ((spec.glows && reads('glows')) || (spec.columns && reads('columns')))) throw new Error(`${where} glows card rows, and the film has no card (pushIn): leave glows and columns out, or give the film a pushIn`);
    if (spec.chrome !== undefined && typeof spec.chrome !== 'boolean') throw new Error(`${where}: chrome must be true or false`);
    if (spec.card !== undefined && spec.card !== false) throw new Error(`${where}: card may only be false (the stage takes the whole page)`);
    const st = {...spec, start: clock.start(spec.scene)};
    if (!push) st.entrance = readEntrance(spec.enter, where, transitions);
    if (spec.type === 'world') {
      for (const key of [...PLAN_KEYS, 'frame']) if (spec.world && Object.hasOwn(spec.world, key)) throw new Error(`${where}: ${key} belongs on the stage, beside world (the engine reads it there), not inside world (the kit's own spec)`);
      st.world = {...hung(compileWorld(spec.world, where), {frame: readThought(spec.frame, where), from: st.start}), kit: spec.world.kit};
    }
    if (reads('code') && spec.code) {
      const source = excerpt(within(spec.code.file), {elide: spec.code.elide ?? []});
      st.lines = await tokenize(source, spec.code.emphasis ?? {});
      st.reveal = (spec.reveal ?? []).map(([line, ref]) => [line, clock.at(ref)]);
      if (spec.code.allAt) { const at = clock.at(spec.code.allAt); st.reveal = st.lines.map((_, i) => [i, at + .2 + i * .12]); }
      for (const [line] of st.reveal) if (!(line >= 0 && line < st.lines.length)) throw new Error(`${where} reveals line ${line}, the code has ${st.lines.length}: lines count from 0, the last is ${st.lines.length - 1}`);
    }
    st.focusAt = (reads('focus') ? spec.focus ?? [] : []).map(f => ({from: f.lines[0], to: f.lines[1], tone: f.tone, a: clock.at(f.from), b: clock.at(f.to)}));
    st.glowAt = (reads('glows') ? spec.glows ?? [] : []).map(g => ({row: g.row, lines: g.lines, a: clock.at(g.from), b: clock.at(g.to)}));
    // Signs beside code lines, from a phrase to the end of the stage (or `to`); a card column ringed while named.
    st.marksAt = (reads('marks') ? spec.marks ?? [] : []).map(m => {
      if (!icons[m.icon]) throw new Error(`${where} marks line ${m.line} with "${m.icon}"; the signs are ${Object.keys(icons).join(', ')}`);
      if (!(m.line >= 0 && m.line < (st.lines?.length ?? 0))) throw new Error(`${where} marks line ${m.line}, the code has ${st.lines?.length ?? 0}: lines count from 0, the last is ${(st.lines?.length ?? 0) - 1}`);
      return {line: m.line, icon: m.icon, a: clock.at(m.from), b: m.to ? clock.at(m.to) : Infinity};
    });
    st.columnsAt = (reads('columns') ? spec.columns ?? [] : []).map(k => ({key: k.key, a: clock.at(k.from), b: clock.at(k.to)}));
    if (reads('footer') && spec.footer) st.footerAt = clock.at(spec.footer.at);
    if (reads('list') && spec.list) st.listAt = spec.list.map(item => ({...item, t: clock.at(item.at), detail: valueFrom(data, item.value)}));
    if (impl) { st.kit = impl; st.handle = st.kit.compile(spec, {clock, data, motion, cast}); }
    if (reads('cards') && spec.cards) st.cardsAt = spec.cards.map(c => ({...c, t: clock.at(c.at)}));
    if (reads('closing') && spec.closing) st.closingAt = clock.at(spec.closing.at);
    if (reads('hero') && spec.hero) st.heroAt = {...spec.hero, until: clock.at(spec.hero.until)};
    if (spec.type === 'recap') {
      st.keysAt = [{t: st.start, f: spec.frames.length - 1}, ...spec.keys.map(k => ({t: clock.at(k.at), f: k.f}))];
      if (spec.teaser) st.teaserAt = {...spec.teaser, at: clock.at(spec.teaser.at), from: clock.at(spec.teaser.rewind.from), to: clock.at(spec.teaser.rewind.to)};
    }
    stages.push(st);
  }
  state.stages = stages;
}
