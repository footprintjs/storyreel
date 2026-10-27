/**
 * What the director reads once for a whole film, and the shape it keeps its proposals in: every scene read
 * (sentences.mjs), who speaks, who is on screen to listen, and a proposal as the record writes it. Pure.
 */
import {readScene} from './sentences.mjs';

const round = t => (t === null || t === undefined ? null : +t.toFixed(3));

/** Every scene read for the director, by id, in film order: with the voice's timings (and `offsets`, where each scene starts) when given. */
export function readScript(storyboard, timings, offsets) {
  return new Map(storyboard.scenes.map((scene, i) => [scene.id, readScene(scene, i, {timing: timings?.scenes?.[i] ?? null, offset: offsets ? offsets[i] : null})]));
}

/** Where each scene starts, from timings alone (their durations, in order). */
export function offsetsOf(timings) {
  let at = 0;
  return timings.scenes.map(s => { const o = at; at += s.duration; return o; });
}

/** Everyone who speaks in the film. */
export const speakersOf = reads => new Set([...reads.values()].flatMap(r => r.sentences.map(s => s.speaker)).filter(Boolean));

/** Who is on screen in each scene (the speakers the picture names, else the scene's own speakers): each reacts by reactionAt. */
export function listenersOf(scenes, reads, people, names) {
  return scenes.map(id => {
    const read = reads.get(id), t = read.sentences[0]?.t ?? null, here = typeof names === 'function' ? names(id, t) : names;
    const speaking = new Set(read.sentences.map(s => s.speaker).filter(Boolean));
    return {scene: id, people: [...(here ? [...people].filter(p => here.has(p)) : speaking)].sort()};
  }).filter(s => s.people.length);
}

/** A proposal as the record keeps it: where it lands, its beat and time, what it frames or acts, the rule and the sentence. */
export const recordKey = (kind, path, k, extra = {}) => ({kind, path, scene: k.scene, at: k.at, t: round(k.t),
  ...(kind === 'camera' ? {on: k.on, ...(k.size ? {size: k.size} : {})} : {who: k.who, mood: k.mood}), rule: k.rule, name: k.name ?? k.rule, said: k.said, ...extra});
