/**
 * The director inside a film (film.mjs · compileSteps): before the worlds are built, each world whose kit takes
 * direction is planned and its keys placed (directWorlds); once every picture is built, the framing of the other
 * pictures lands in the film's focus (directFocus); the film keeps what happened (directorRecord: film.director, the
 * making-of record). Where the framing goes, picture by picture (`camera`):
 *
 *   auto     a world whose kit takes framing keys gets them in its own spec; every other picture is framed by the
 *            film's focus, which goes back to wide at each change of picture (so the two never move one picture)
 *   worlds   only the worlds whose kit takes framing keys; the other pictures are recorded as not directed, with why
 *   focus    every picture by the film's focus; a world whose own camera moves (or whose spec frames itself) is not
 *            framed, and says why
 *   off      no framing
 *
 * One camera everywhere: land.mjs · cameraTaken, asked for every picture by both. Pure but for `probe`, which builds a
 * world to read what it names.
 */
import {planFraming} from './framing.mjs';
import {planMoods} from './moods.mjs';
import {kitDirection, pictures, landWorld, cameraTaken, cameraKey, specPath} from './land.mjs';
import {readScript, speakersOf, listenersOf, recordKey} from './record.mjs';
import {settleTime, readFeel} from '../motion.mjs';

/** How long the focus's camera takes to arrive (its default feel, heavy): a change of picture's wide key lands that long before it. */
const SETTLE = settleTime(readFeel('heavy'));

/** The shot grammar's settings, as the planner takes them. */
export const grammar = ({table, gap, lead, closeUps, exchange}) => ({table, gap, lead, closeUps, exchange});

/** Where a placement sits in the recipe, as the record names it ("stages[3].world.camera", "story.acting", "focus"). */
const placedAt = p => (p.path === 'focus' ? 'focus' : specPath(p.path, p.key));
/** How each picture's framing goes under a camera setting: 'world', 'focus' or null (not framed), with why when null. */
function framedBy(camera, decl, kit) {
  if (camera === 'off') return {by: null, why: 'the director\'s camera is "off"'};
  if (decl?.camera && camera !== 'focus') return {by: 'world'};
  if (camera === 'worlds') return {by: null, why: `the kit "${kit ?? '(a page)'}" takes no framing keys (no direction.camera): "camera": "auto" frames it through the film's focus`};
  return {by: 'focus'};
}

/**
 * Plan and place the keys of every world whose kit takes direction. `probe(spec, path)` builds a world once to read
 * what it names (its regionsAt), without logging its beats. Returns the direction so far: {settings, reads, people,
 * clock, camera (the setting), shown (each picture: path, kit, scenes, decl, by), placements, proposals, dropped,
 * listeners}.
 */
export function directWorlds(settings, {storyboard, timings, clock, recipe, storyKits, probe}) {
  const reads = readScript(storyboard, timings, clock.offsets), people = speakersOf(reads);
  const shown = pictures(recipe, storyboard).map(p => {
    const decl = p.spec && storyKits[p.spec.kit] ? kitDirection(storyKits[p.spec.kit], p.spec, p.path) : null;
    return {...p, kit: p.spec?.kit ?? null, decl, ...framedBy(settings.camera, decl, p.spec?.kit)};
  });
  const out = {settings, reads, people, clock, camera: settings.camera, shown, placements: [], proposals: [], dropped: [], listeners: []};
  for (const p of shown) {
    const frames = p.by === 'world', acts = Boolean(p.decl?.acting) && settings.acting === 'worlds';
    if (!frames && !acts) continue;
    const instance = probe(p.spec, p.path), scenes = p.scenes.map(id => reads.get(id)), none = {keys: [], dropped: []};
    const names = (scene, t) => new Set((instance?.regionsAt?.(t ?? clock.start(scene)) ?? []).map(r => r.name).filter(Boolean));
    const framing = frames ? planFraming(scenes, {names, people, groups: p.decl.groups, ...grammar(settings)}) : none;
    const moods = acts ? planMoods(scenes, {table: settings.table, guesses: recipe.guesses ?? [], moods: p.decl.moods, rest: p.decl.rest, present: (who, scene, t) => names(scene, t).has(who)}) : none;
    const taken = frames ? cameraTaken(recipe, {landing: 'worlds', path: p.path, spec: p.spec, decl: p.decl}) : null;
    const landed = landWorld(p, p.decl, {camera: framing.keys, moods: moods.keys}, taken);
    const why = new Map(landed.kept.map(x => [x.key, x.why])), placed = k => (why.has(k) ? {placed: false, why: why.get(k)} : {placed: true});
    out.placements.push(...landed.placements);
    out.proposals.push(...framing.keys.map(k => recordKey('camera', p.path, k, placed(k))), ...moods.keys.map(k => recordKey('mood', p.path, k, placed(k))));
    out.dropped.push(...framing.dropped.map(k => recordKey('camera', p.path, k, {why: k.why})), ...moods.dropped.map(k => recordKey('mood', p.path, k, {why: k.why})));
    out.listeners.push(...listenersOf(p.scenes, reads, people, names));
  }
  return out;
}

/**
 * The framing of the pictures the film's focus directs, once every picture is built. `names(t)` is what the picture
 * names at t (a Set); `ownCamera(path)` whether that picture's world moves its own camera (its cameraMoves). The focus
 * goes back to wide at every change of picture — a key no gap leaves out, landing the time its spring takes to arrive
 * before the change, so the new picture opens wide — frames nothing over a picture a world's camera
 * directs, and leaves a picture whose camera is taken (cameraTaken) unframed, each key there kept with why. Adds the
 * proposals to `direction`; returns the placement ({path: 'focus', key: 'focus', value}), or null.
 */
export function directFocus(direction, {recipe, storyboard, names, ownCamera = () => false}) {
  const focusPictures = direction.shown.filter(p => p.by === 'focus');
  if (!focusPictures.length) return null;
  const {settings, clock} = direction, ids = storyboard.scenes.map(s => s.id), at = (scene, t) => names(t ?? 0);
  const pictureOf = new Map(direction.shown.flatMap(p => p.scenes.map(id => [id, p])));
  const changes = new Map(direction.shown.slice(1).map(p => [p.scenes[0], clock.start(p.scenes[0]) - SETTLE]));
  const skip = new Set(direction.shown.filter(p => p.by !== 'focus').flatMap(p => p.scenes));
  const framing = planFraming(ids.map(id => direction.reads.get(id)), {names: at, people: direction.people, groups: true, starts: new Set(), changes, skip, ...grammar(settings)});
  const takenIn = new Map(focusPictures.map(p => [p.path, cameraTaken(recipe, {landing: 'focus', path: p.path, spec: p.spec, decl: p.decl, moves: ownCamera(p.path)})]));
  const whyNot = k => (k.rule === 'picture' ? null : takenIn.get(pictureOf.get(k.scene)?.path) ?? null);
  const kept = framing.keys.filter(k => !whyNot(k));
  direction.proposals.push(...framing.keys.map(k => recordKey('camera', 'focus', k, whyNot(k) ? {placed: false, why: whyNot(k)} : {placed: true})));
  direction.dropped.push(...framing.dropped.map(k => recordKey('camera', 'focus', k, {why: k.why})));
  direction.listeners.push(...listenersOf(focusPictures.flatMap(p => p.scenes), direction.reads, direction.people, at));
  if (!kept.some(k => k.rule !== 'picture')) return null;
  const placement = {path: 'focus', key: 'focus', value: {strategy: 'camera', keys: kept.map(cameraKey)}};
  direction.placements.push(placement);
  return placement;
}

/** What the film keeps of its direction (film.director, the making-of record): the settings, each picture and how it was framed, what landed where, every proposal with why. */
export function directorRecord(direction) {
  const {settings} = direction;
  return {lang: settings.lang, rules: settings.table.source, camera: settings.camera, acting: settings.acting, gap: settings.gap, lead: settings.lead, closeUps: settings.closeUps, exchange: settings.exchange,
    pictures: direction.shown.map(p => ({path: p.path, kit: p.kit, scenes: p.scenes, camera: p.by, acting: Boolean(p.decl?.acting) && settings.acting === 'worlds', ...(p.why ? {why: p.why} : {})})),
    placed: direction.placements.map(p => ({path: placedAt(p), keys: p.value})),
    proposals: direction.proposals, dropped: direction.dropped, listeners: {by: 'reactionAt', scenes: direction.listeners}};
}
