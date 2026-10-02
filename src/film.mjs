/**
 * Compile a recipe into one film timeline: frame(ctx, t) draws the whole film at any second, on
 * the same clock as the paced narration.
 *
 * A film opens on a story and then plays its stages, one per narration scene:
 *   story   — the opening world, drawn by a STORY KIT (built in: whiteboard; add your own)
 *   stages  — built-in types code · api · recap · summary · world, plus types from STAGE KITS
 *             (e.g. a course's agent loop)
 * The story and the stages are joined in one of two ways:
 *   pushIn    — the camera pushes into one story prop, which becomes a paper card, and the stages
 *               hand over on that one page (the lesson shape: idea → build → loop → recap)
 *   no pushIn — every stage is a SHOT: a world (any story kit, full frame) or paper, entering
 *               with a fade, a wipe, an iris, a page turn or a cut; paper stages in a row hand over on one page
 * Over any of it: guesses (pause and guess). On-screen words may be keys into a string table.
 * Director notes (notes.mjs) lay camera words over the film: a camera speed, cuts, pushes.
 * See README.md for the data.
 */
import {createCanvas} from '@napi-rs/canvas';
import {readFileSync, statSync, realpathSync} from 'node:fs';
import path from 'node:path';
import {insideRoot} from './files.mjs';
import {hashOf, hashBytes} from './hash.mjs';
import {inOut as ease} from './ease.mjs';
import {makePen} from './pen.mjs';
import {loadTheme} from './theme.mjs';
import {paperGround} from './ground.mjs';
import {makeClock, ramp} from './clock.mjs';
import {withStrings} from './strings.mjs';
import {whiteboardKit} from './kits/whiteboard/index.mjs';
import {icons} from './kits/whiteboard/board.mjs';
import {drawCard, drawStage, drawSummary, drawConnector, cardEdge, PANEL, drawRecap, recapSlotBox, drawRecallFramed, drawGuess, GUESS_PLACES, GUESS_FLIP, cardPlacement, cardRowBoxes, stageBoxes} from './kits/paper/paper.mjs';
import {tokenize, excerpt} from './kits/paper/code.mjs';
import {readNotes, placePushes, pushAt} from './notes.mjs';
import {view, then, about, through, back} from './regions.mjs';
import {tooShortToRead, readingMode, readingPace} from './reading.mjs';
import {readIntent, readContinuity, checkContinuity, tooMuchTooFast, distinctMoments, watchingMode, watchingText, WATCHING, readReads, checkReads} from './shots.mjs';
import {checkSound, soundsByScene, MAX_SOUNDS_PER_SCENE} from './sound.mjs';
import {listeningMode, changeSounds, listeningText} from './listening.mjs';
import {step, drainSteps, recordSteps} from './record.mjs';
import {readEntrance, transitionCatalog, ghostPainter, layerCrossfader, CUT} from './transitions.mjs';

/** The recipe's own top-level keys: anything else refuses, unless the host application names it in `hostKeys`. */
const RECIPE_KEYS = ['story', 'whiteboard', 'pushIn', 'card', 'stages', 'guesses', 'notes', 'recalls', 'poster', 'reading', 'watching', 'listening', 'paperStyle'];
/** What every shot may say about itself (shots.mjs): what it is for, and what is true when it starts and ends. */
const PLAN_KEYS = ['intent', 'continuity', 'reads'];
const STAGE_KEYS = new Set(['type', 'scene', 'chip', 'chipDark', 'title', 'file', 'label', 'code', 'lh', 'reveal', 'focus', 'glows', 'footer', 'list', 'loop', 'cards', 'closing', 'hero', 'frames', 'keys', 'teaser', 'enter', 'chrome', 'marks', 'columns', 'card', ...PLAN_KEYS]);
/** What every stage may carry; a stage kit that lists its own `keys` accepts these plus its own. */
const COMMON_KEYS = ['type', 'scene', 'chip', 'chipDark', 'title', 'enter', 'chrome', 'card', ...PLAN_KEYS];
/**
 * The engine's stage features (code, reveal, focus, glows, marks, columns, list, cards…) are read on
 * the BUILT-IN stage types only. A kit stage gets the common keys and the footer; every key a kit
 * declares is the kit's own, and the engine never reads it (a kit's `marks` may mean tally marks).
 */
const KIT_STAGE_ENGINE_KEYS = new Set(['footer']);
const WORLD_KEYS = new Set(['type', 'scene', 'world', 'enter', ...PLAN_KEYS]);
const BUILT_IN_STAGES = new Set(['code', 'api', 'recap', 'summary', 'world']);
const GUESS_KEYS = new Set(['after', 'question', 'answer', 'place', 'until']);

/**
 * Refuse a recipe key the engine does not read (law 1: an unknown key refuses). A host application that
 * keeps its own data in the recipe (e.g. a glossary under "terms") names those keys in `hostKeys`: they
 * are allowed and the engine ignores them.
 */
function checkRecipeKeys(recipe, hostKeys) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) throw new Error('The recipe must be an object ({story, stages, …})');
  if (!Array.isArray(hostKeys) || !hostKeys.every(k => typeof k === 'string' && k)) throw new Error('compileFilm: hostKeys must be a list of key names (e.g. ["terms"])');
  for (const k of hostKeys) if (RECIPE_KEYS.includes(k)) throw new Error(`compileFilm: hostKeys names "${k}", which is the recipe's own key (the engine reads it); hostKeys are only for keys your application reads itself`);
  for (const key of Object.keys(recipe)) if (!RECIPE_KEYS.includes(key) && !hostKeys.includes(key)) throw new Error(`The recipe has unsupported key "${key}". A recipe takes ${RECIPE_KEYS.join(', ')}. If your application reads "${key}" itself, name it: compileFilm({…, hostKeys: ["${key}"]})`);
}

/**
 * At most MAX_SOUNDS_PER_SCENE sounds in a scene, counted the way renderFilm mixes them (sound.mjs ·
 * soundsByScene), so the film refuses when it is built, not after every frame is encoded.
 */
function checkSoundCounts(sounds, clock, storyboard, timings) {
  soundsByScene(sounds, clock.offsets, timings.scenes.map(s => s.duration)).forEach((list, i) => {
    if (list.length <= MAX_SOUNDS_PER_SCENE) return;
    const kinds = Object.entries(Object.groupBy(list, e => e.type)).map(([type, l]) => `${type} ×${l.length}`).join(', ');
    throw new Error(`Scene "${storyboard.scenes[i].id}" has ${list.length} sounds (${kinds}); a scene takes at most ${MAX_SOUNDS_PER_SCENE}: make fewer (a kit's sounds count too), or spread them over more scenes`);
  });
}

/**
 * How far the hand-over INTO a stage has come at t: eased over `seconds`, starting `lead` before
 * the stage's scene starts — or a step on the scene's first frame when the director cut into it.
 */
const into = (st, t, lead, seconds) => st.cut ? (t >= st.start ? 1 : 0) : ramp(t, st.start - lead, seconds);

/** Point the canvas through a camera {sx, sy, z, tx, ty}: translate to (tx, ty), scale z, about (sx, sy). */
const aim = (ctx, c) => { ctx.translate(c.tx, c.ty); ctx.scale(c.z, c.z); ctx.translate(-c.sx, -c.sy); };

/**
 * What a story kit that declares `context: true` is compiled with: kit.compile(spec, context). Frozen,
 * and with no way to draw the film (only the engine draws clips, and nothing can call the film while it
 * is still being built). `library` and `labels` are the recipe's; no recipe carries them yet, so both are
 * empty. A file the kit opens goes through `readFile`, which loads only from inside root (files.mjs ·
 * insideRoot, as the recipe's own files do).
 */
function kitContext({clock, motion, theme, root, inside = file => insideRoot(root, file)}) {
  return Object.freeze({clock, motion, theme, root, library: Object.freeze({}), labels: Object.freeze({}),
    insideRoot: inside, readFile: file => readFileSync(inside(file))});
}

/**
 * The files a film reads through its root (code excerpts, a kit's readFile and insideRoot), each hashed when
 * it is first asked for: `note(realPath)` records it, `list()` gives {path relative to root: hash}. A folder,
 * or a file that does not exist, is not recorded.
 */
function fileLedger(root) {
  const seen = new Map(), base = (() => { try { return realpathSync(path.resolve(root)); } catch { return path.resolve(root); } })();
  return {
    note(real) {
      if (!seen.has(real)) { let hash = null; try { if (statSync(real).isFile()) hash = hashBytes(readFileSync(real)); } catch { /* not there: nothing read */ } seen.set(real, hash); }
      return real;
    },
    list: () => Object.fromEntries([...seen].filter(([, h]) => h).map(([real, h]) => [path.relative(base, real).split(path.sep).join('/'), h]).sort(([a], [b]) => a.localeCompare(b))),
  };
}

/** Whether a story kit takes the context (`context: true`) or today's (spec, clock, motion). */
function usesContext(storyKit, name) {
  const asked = storyKit.context ?? false;
  if (typeof asked !== 'boolean') throw new Error(`The story kit "${name}" declares context: ${JSON.stringify(asked)}; context is true (compile(spec, context)) or false / left out (compile(spec, clock, motion))`);
  return asked;
}

/**
 * A world's optional `ready` (a Promise: e.g. its images decoding), settled at once into
 * {error} | null so a refusal that comes early is never an unhandled rejection while the film is built.
 */
function readyOf(instance, name, where) {
  const ready = instance?.ready;
  if (ready === undefined) return null;
  if (typeof ready?.then !== 'function') throw new Error(`${where}: the kit "${name}" returned ready that is not a Promise; ready is optional, and when given it is a Promise that settles once the world can draw (e.g. its images have decoded)`);
  return Promise.resolve(ready).then(() => null, error => ({error, name, where}));
}

/** Wait for every world to be ready; the first that failed refuses the film, naming the world. */
async function readyWorlds(readies) {
  const failed = (await Promise.all(readies)).find(Boolean);
  if (failed) throw new Error(`${failed.where}: the kit "${failed.name}" was not ready: ${failed.error?.message ?? failed.error}`, {cause: failed.error});
}

/**
 * @param storyboard {scenes: [{id, narration, …}]}   (alias: board)
 * @param timings    {scenes: [{id, duration, words: [{text, start, end}], alignment: {status: 'available'}}]} — paced
 * @param recipe     the film's recipe (data only)
 * @param data       values the recipe quotes (e.g. a recorded run)   (alias: capture)
 * @param kits       [{name, story?: {compile(spec, clock, motion)} | {context: true, compile(spec, context)}, stages?: {type: impl}}]
 *                   — plug-ins; a story world may return `ready` (a Promise), awaited before recalls and the return
 * @param theme      a theme object, or the name of a built-in theme (default 'paper')
 * @param root       directory that recipe file paths (code excerpts) are relative to (default cwd)
 * @param strings    the string table for the film's language ({key: text}), when the recipe names strings
 * @param hostKeys   top-level recipe keys the host application reads itself (allowed, ignored); any other unknown key refuses
 * @param record     true → the compile runs as a footprintjs flowchart and the film carries `record`
 *                   {narrative, snapshot} (record.mjs · recordSteps); false (default) → no record, nothing else changes
 * @returns {total, clock, timings, sounds, frame(ctx, t), beats: [{ref, t, path}] (every phrase resolved, and the
 *          recipe entry that named it), strings: [keys used], notes: [the director's notes as applied],
 *          regionsAt(t) → [{box, path, label}] (what is drawn where), pointAt(t, x, y) → {frame, world?}, record?}
 */
export async function compileFilm(options) {
  const {record = false, ...rest} = options;
  if (typeof record !== 'boolean') throw new Error(`compileFilm: record must be true (the compile is recorded with footprintjs: film.record) or false (the default), not ${JSON.stringify(record)}`);
  return record ? recordSteps(compileSteps(rest)) : drainSteps(compileSteps(rest));
}

/**
 * The compile in five segments, one per record.mjs · COMPILE_STAGES entry: each ends in a `yield step(id,
 * summary)`, where `summary()` (called only when recording) says what the segment read and wrote.
 * The segments run the same code in the same order whether or not the compile is recorded.
 */
async function* compileSteps({storyboard, board, timings, recipe, data, capture, kits = [], theme, root = process.cwd(), strings = null, hostKeys = []}) {
  storyboard ??= board; data ??= capture ?? null;
  checkRecipeKeys(recipe, hostKeys);
  const given = recipe, used = new Set(); recipe = withStrings(recipe, strings, used);
  const entries = recipePaths(recipe);
  // The director's notes: one camera speed for the film (story kits take it as motion.cameraSpeed), cuts, pushes.
  const notes = readNotes(recipe.notes), motion = Object.freeze({cameraSpeed: notes.speed});
  // Every phrase the recipe names is logged as it is resolved: the film's making-of record says which
  // spoken words triggered which drawing.
  const beats = [], base = makeClock(storyboard, timings);
  const clock = {...base,
    at: ref => { const t = base.at(ref); beats.push({ref, t: +t.toFixed(3), path: entries.get(ref) ?? null}); return t; },
    pauseAfter: ref => { const p = base.pauseAfter(ref); beats.push({ref, t: +p.start.toFixed(3), path: entries.get(ref) ?? null}); return p; }};
  const paper = typeof theme === 'object' && theme ? theme : loadTheme(theme ?? recipe.paperStyle ?? 'paper');
  // Files the recipe names load only from inside root (files.mjs · insideRoot: real paths, so no link leads out),
  // and every one the film reads is hashed into its inputs (fileLedger).
  const files = fileLedger(root), within = file => files.note(insideRoot(root, file));
  const allKits = [whiteboardKit, ...kits];
  const storyKits = Object.fromEntries(allKits.filter(k => k.story).map(k => [k.name, k.story]));
  const stageKits = Object.fromEntries(allKits.flatMap(k => Object.entries(k.stages ?? {})));
  const stageKitNames = Object.fromEntries(allKits.flatMap(k => Object.keys(k.stages ?? {}).map(type => [type, k.name])));
  // The transitions a shot may enter with: the built-in collection and every kit's own (transitions.mjs).
  const transitions = transitionCatalog(allKits);
  const worldKits = new Set();
  // What a context kit gets (kitContext); every world's `ready`, settled before recalls are drawn (readyWorlds).
  const context = kitContext({clock, motion, theme: paper, root, inside: within}), readies = [];
  const compileWorld = (spec, where) => {
    const kit = storyKits[spec?.kit];
    if (!kit) throw new Error(`No story kit "${spec?.kit}" for ${where} (have: ${Object.keys(storyKits).join(', ')})`);
    // A camera speed covers EVERY camera move, so a world whose kit cannot follow it refuses the note.
    if (notes.speed !== 1 && !kit.motion?.includes('cameraSpeed')) throw new Error(`note "${notes.speedNote.note}": ${where} is drawn by the kit "${spec.kit}", which does not take a camera speed (a story kit that does lists motion: ['cameraSpeed'] and divides its camera moves' seconds by motion.cameraSpeed)`);
    worldKits.add(spec.kit);
    const instance = usesContext(kit, spec.kit) ? kit.compile(spec, context) : kit.compile(spec, clock, motion);
    readies.push(readyOf(instance, spec.kit, where));
    return instance;
  };
  /** A world on its sheet: hung on the paper at scale S (1 = full frame). */
  const hung = (instance, hang) => { const S = hang ?? instance.hang ?? .9; return {instance, S, BX: 1600 * (1 - S) / 2, BY: 900 * (1 - S) / 2 + 7.5 * (S < 1 ? 1 : 0)}; };
  yield step('read-inputs', () => inputsSummary({recipe, storyboard, clock: base, notes, strings: strings ? [...used] : null}));

  // The story: its kit draws the opening world on a sheet (1600×900) that hangs on the paper.
  const {intent: storyIntent, continuity: storyContinuity, reads: storyReads, ...storySpec} = recipe.story ?? {kit: 'whiteboard', ...recipe.whiteboard};
  const story = compileWorld(storySpec, 'the story');
  // A film may be story only (no push-in, no card, no paper stages).
  const push = recipe.pushIn ?? null;
  if (recipe.card && !push) throw new Error('The recipe has a card and no pushIn: the card is the story prop the camera pushes into');
  const card = recipe.card ?? {prop: [700, 350, 900, 550], rows: [], template: {}, aside: {at: [800, 450], scale: 1}};
  const boardEnd = push ? clock.spokenEnd(push.after) + push.rest : Infinity, TURN = (push?.turn ?? 1) / notes.speed;
  const storyWorld = {...hung(story, push?.hang), kit: storySpec.kit}, {S, BX, BY} = storyWorld, ZOOM = push?.zoom ?? 1;
  // Geometry in 1600×900 units: the sheet hangs on the paper at scale S; the camera pushes into the prop.
  const onPage = (bx, by) => [BX + bx * S, BY + by * S];
  const propCentre = onPage((card.prop[0] + card.prop[2]) / 2, (card.prop[1] + card.prop[3]) / 2);
  const geo = {zoomScale: S * ZOOM, pushed: (bx, by) => { const [x, y] = onPage(bx, by); return [800 + (x - propCentre[0]) * ZOOM, 450 + (y - propCentre[1]) * ZOOM]; }};

  // Stages, each owning a scene of the narration.
  const stages = [];
  for (const spec of recipe.stages ?? []) {
    const impl = stageKits[spec.type], where = `stage ${spec.scene}`;
    if (!BUILT_IN_STAGES.has(spec.type) && !impl) throw new Error(`${where} has type "${spec.type}", which no kit provides`);
    const allowed = spec.type === 'world' ? WORLD_KEYS : impl?.keys ? new Set([...COMMON_KEYS, ...KIT_STAGE_ENGINE_KEYS, ...impl.keys]) : STAGE_KEYS;
    // Which keys the engine itself reads on this stage (a kit's declared keys are never among them).
    const own = new Set(impl?.keys ?? []), reads = key => !own.has(key) && (!impl || !impl.keys || KIT_STAGE_ENGINE_KEYS.has(key));
    for (const key of Object.keys(spec)) if (!allowed.has(key)) throw new Error(`${where} has unsupported key ${key}`);
    if (push && spec.enter !== undefined) throw new Error(`${where} has enter, and a film with a pushIn hands its stages over on one page (enter is for films without one)`);
    if (push && spec.type === 'world') throw new Error(`${where} is a world, and a film with a pushIn keeps one page (worlds are for films without one)`);
    if (!push && ((spec.glows && reads('glows')) || (spec.columns && reads('columns')))) throw new Error(`${where} glows card rows, and the film has no card (pushIn)`);
    if (spec.chrome !== undefined && typeof spec.chrome !== 'boolean') throw new Error(`${where}: chrome must be true or false`);
    if (spec.card !== undefined && spec.card !== false) throw new Error(`${where}: card may only be false (the stage takes the whole page)`);
    const st = {...spec, start: clock.start(spec.scene)};
    if (!push) st.entrance = readEntrance(spec.enter, where, transitions);
    if (spec.type === 'world') {
      for (const key of PLAN_KEYS) if (spec.world && Object.hasOwn(spec.world, key)) throw new Error(`${where}: ${key} belongs on the stage, beside world (the engine reads it there), not inside world (the kit's own spec)`);
      st.world = {...hung(compileWorld(spec.world, where)), kit: spec.world.kit};
    }
    if (reads('code') && spec.code) {
      const source = excerpt(within(spec.code.file), {elide: spec.code.elide ?? []});
      st.lines = await tokenize(source, spec.code.emphasis ?? {});
      st.reveal = (spec.reveal ?? []).map(([line, ref]) => [line, clock.at(ref)]);
      if (spec.code.allAt) { const at = clock.at(spec.code.allAt); st.reveal = st.lines.map((_, i) => [i, at + .2 + i * .12]); }
      for (const [line] of st.reveal) if (!(line >= 0 && line < st.lines.length)) throw new Error(`${where} reveals line ${line}, the code has ${st.lines.length}`);
    }
    st.focusAt = (reads('focus') ? spec.focus ?? [] : []).map(f => ({from: f.lines[0], to: f.lines[1], tone: f.tone, a: clock.at(f.from), b: clock.at(f.to)}));
    st.glowAt = (reads('glows') ? spec.glows ?? [] : []).map(g => ({row: g.row, lines: g.lines, a: clock.at(g.from), b: clock.at(g.to)}));
    // Signs beside code lines, from a phrase to the end of the stage (or `to`); a card column ringed while named.
    st.marksAt = (reads('marks') ? spec.marks ?? [] : []).map(m => {
      if (!icons[m.icon]) throw new Error(`${where} marks line ${m.line} with "${m.icon}"; the signs are ${Object.keys(icons).join(', ')}`);
      if (!(m.line >= 0 && m.line < (st.lines?.length ?? 0))) throw new Error(`${where} marks line ${m.line}, the code has ${st.lines?.length ?? 0}`);
      return {line: m.line, icon: m.icon, a: clock.at(m.from), b: m.to ? clock.at(m.to) : Infinity};
    });
    st.columnsAt = (reads('columns') ? spec.columns ?? [] : []).map(k => ({key: k.key, a: clock.at(k.from), b: clock.at(k.to)}));
    if (reads('footer') && spec.footer) st.footerAt = clock.at(spec.footer.at);
    if (reads('list') && spec.list) st.listAt = spec.list.map(item => ({...item, t: clock.at(item.at), detail: valueFrom(data, item.value)}));
    if (impl) { st.kit = impl; st.handle = st.kit.compile(spec, {clock, data, motion}); }
    if (reads('cards') && spec.cards) st.cardsAt = spec.cards.map(c => ({...c, t: clock.at(c.at)}));
    if (reads('closing') && spec.closing) st.closingAt = clock.at(spec.closing.at);
    if (reads('hero') && spec.hero) st.heroAt = {...spec.hero, until: clock.at(spec.hero.until)};
    if (spec.type === 'recap') {
      st.keysAt = [{t: st.start, f: spec.frames.length - 1}, ...spec.keys.map(k => ({t: clock.at(k.at), f: k.f}))];
      if (spec.teaser) st.teaserAt = {...spec.teaser, at: clock.at(spec.teaser.at), from: clock.at(spec.teaser.rewind.from), to: clock.at(spec.teaser.rewind.to)};
    }
    stages.push(st);
  }
  // A stage kit may take the card into the middle of its scene (place) and drive its rows (card).
  const buildStage = stages[0], moveTo = card.aside, centreStage = stages.find(s => s.kit?.place), MOVE0 = buildStage ? buildStage.start - 1.05 : Infinity, MOVE1 = MOVE0 + .9;
  const centrePlace = centreStage ? centreStage.kit.place(centreStage.handle) : {at: [800, 600], scale: .58};
  const namedAt = card.named ? clock.at(card.named.at) : Infinity;
  // The push-in (the camera, then the page typed over it) is done before the card moves aside for the first stage.
  if (push && buildStage && boardEnd + TURN * .9 > MOVE0) throw new Error(`The push-in ends at ${(boardEnd + TURN * .9).toFixed(2)} s${notes.speed !== 1 ? ` (at camera speed ${notes.speed} it takes ${TURN.toFixed(2)} s)` : ''}, after the card moves aside for the first stage at ${MOVE0.toFixed(2)} s: give the scene before ${buildStage.scene} a longer tail (pacing.tails), or the push-in a shorter turn`);
  // The plan of the shots (shots.mjs): what each is for, and what is true when it starts and ends — one
  // shot's start must agree with what the shots before it left.
  const storyPathName = recipe.story ? 'story' : 'whiteboard';
  // Reads (shots.mjs · readReads): what the viewer must take in, each on a phrase (resolved here, so the record
  // logs it). Each keeps its declared index (k), so a problem names the read the recipe wrote; a read's phrase
  // is when something is taken in, not something new to see, so it is no moment (readRefs, below).
  const readRefs = new Set();
  const timedReads = (value, where) => readReads(value, where).map((r, k) => { readRefs.add(value[k].at); return {...r, k, t: clock.at(value[k].at)}; });
  const plan = [{path: storyPathName, where: 'the story', scene: storyboard.scenes[0]?.id, from: 0, stage: null,
    intent: readIntent(storyIntent, 'the story'), continuity: readContinuity(storyContinuity, 'the story'), reads: timedReads(storyReads, 'the story')},
  ...stages.map((st, i) => ({path: `stages[${i}]`, where: `stage ${st.scene}`, scene: st.scene, from: st.start, stage: st,
    intent: readIntent(st.intent, `stage ${st.scene}`), continuity: readContinuity(st.continuity, `stage ${st.scene}`), reads: timedReads(st.reads, `stage ${st.scene}`)}))];
  // Film order is time order: a recipe may list its stages in any order, the plan never does.
  plan.sort((a, b) => a.from - b.from);
  plan.forEach((u, i) => { u.to = plan[i + 1]?.from ?? clock.total; });
  const facts = checkContinuity(plan);
  yield step('build-worlds-and-stages', () => buildSummary(storyPathName, storySpec.kit, stages, stageKitNames, plan));

  // Director's cuts: the scene's stage arrives on a hard cut instead of its hand-over or entrance.
  for (const [scene, n] of notes.cuts) {
    const st = stages.find(s => s.scene === scene);
    if (!st) throw new Error(`note "${n.note}": no stage starts at scene ${scene}; a cut goes into a stage's scene`);
    if (push && st === buildStage) throw new Error(`note "${n.note}": ${scene} is the first stage, which arrives with the push-in`);
    st.cutNote = n;
    if (push) { st.cut = true; st.cutWas = 'hand-over'; }
  }

  // Without a push-in, the film is a row of shots: the story, then each world, each run of paper.
  const shots = [{world: storyWorld, stages: [], start: 0}];
  // Where the things a shot's entrance goes through are (transitions.mjs · boxes), by shot: found once the worlds are ready.
  const entranceBoxes = new Map(), NO_BOXES = Object.freeze({from: Object.freeze({}), to: Object.freeze({})});
  if (!push) for (const st of stages) {
    const last = shots.at(-1);
    if (st.type !== 'world' && !last.world && st.enter === undefined) {
      last.stages.push(st);
      if (st.cutNote) { st.cut = true; st.cutWas = 'hand-over'; }
    } else {
      if (st.cutNote) { st.cutWas = st.entrance.type; st.entrance = CUT; }
      shots.push({world: st.world ?? null, stages: st.world ? [] : [st], start: st.start, enter: st.entrance});
    }
  }

  // Pause and guess: a question over any scene while the narration holds a pause after it.
  const guesses = (recipe.guesses ?? []).map((g, n) => {
    for (const key of Object.keys(g)) if (!GUESS_KEYS.has(key)) throw new Error(`guess ${n} has unsupported key ${key}`);
    if (typeof g.question !== 'string' || !g.question.trim()) throw new Error(`guess ${n} needs a question`);
    if (g.answer !== undefined && (typeof g.answer !== 'string' || !g.answer.trim())) throw new Error(`guess ${n}: answer must be words`);
    const place = g.place ?? 'top';
    if (!Object.hasOwn(GUESS_PLACES, place)) throw new Error(`guess ${n}: place must be ${Object.keys(GUESS_PLACES).join(', ')}`);
    const {start, end} = clock.pauseAfter(g.after), [scene, phrase] = Array.isArray(g.after) ? g.after : [g.after.scene, g.after.phrase];
    if (end - start < 1) throw new Error(`guess "${g.question}": the narration pauses ${(end - start).toFixed(2)} s after "${phrase}"; a guess needs a hold there of at least 1 s (pacing.holds)`);
    // The answer is shown (at least .8 s) and the card gone (a .5 s fade) inside the question's own
    // scene, before the hand-over to the next one begins (.6 s before the scene ends).
    const room = clock.end(scene) - end, needs = g.answer ? 1.9 : 1.4, last = clock.end(scene) - 1.1;
    if (room < needs) throw new Error(`guess "${g.question}": the pause after "${phrase}" ends ${room.toFixed(2)} s before its scene does; the answer needs ${needs} s in the same scene (say it after the pause)`);
    const until = g.until ? clock.at(g.until) : g.answer ? Math.min(end + 2.6, last) : end + .3;
    if (!(until > end)) throw new Error(`guess "${g.question}": until must come after the pause`);
    if (until > last) throw new Error(`guess "${g.question}": until must be 1.1 s before its scene ends, so the card is gone before the hand-over`);
    return {question: g.question, answer: g.answer, place, start, end, until};
  });

  const blank = createCanvas(1600, 900);
  { const c = blank.getContext('2d'); c.fillStyle = paper.palette.bg; c.fillRect(0, 0, 1600, 900); paperGround(makePen(c, paper, {baseScale: 1}), paper.background); }
  const sheet = createCanvas(1600, 900);
  const recalls = {};

  /** Which stages show at t, with their weights, and what the card shows. */
  function stateAt(t) {
    const shown = [];
    stages.forEach((st, i) => {
      // Hand-over, not a crossfade: the old stage leaves before the new one arrives (titles never overlap).
      const next = stages[i + 1], enter = i === 0 ? 1 : into(st, t, .2, .45), leave = next ? 1 - into(next, t, .65, .45) : 1;
      const w = Math.min(enter, leave); if (w > 0) shown.push([st, w]);
    });
    let rows = card.template, glow = {};
    const current = [...stages].reverse().find(s => t >= s.start - (s.cut ? 0 : .5)) ?? buildStage;
    for (const g of current.glowAt ?? []) glow[g.row] = Math.max(glow[g.row] ?? 0, Math.min(ease((t - g.a) / .35), 1 - ease((t - g.b) / .45)));
    let pop = {};
    if (current.kit?.card) ({rows, glow, pop} = current.kit.card(current.handle, t));
    const columns = {};
    for (const k of current.columnsAt ?? []) columns[k.key] = Math.max(columns[k.key] ?? 0, Math.min(ease((t - k.a) / .35), 1 - ease((t - k.b) / .45)));
    const afterCentre = centreStage && stages[stages.indexOf(centreStage) + 1];
    const centre = centreStage ? Math.min(into(centreStage, t, .5, .9), 1 - (afterCentre ? into(afterCentre, t, .5, .9) : 0)) : 0;
    const summary = stages.find(s => s.cardsAt || s.type === 'recap');
    // A stage with card: false has the whole page: the card leaves while it plays and comes back after.
    let hidden = 0;
    stages.forEach((st, i) => { if (st.card === false) { const next = stages[i + 1]; hidden = Math.max(hidden, Math.min(into(st, t, .5, .6), next ? 1 - into(next, t, .5, .6) : 1)); } });
    const fade = (summary ? 1 - into(summary, t, .5, .6) : 1) * (1 - hidden);
    return {shown, rows, glow, pop, centre, fade, columns};
  }

  /** The recap's playhead at t: eased hops between the named keys. */
  function recapFocus(st, t) {
    let f = st.keysAt[0].f;
    for (const k of st.keysAt.slice(1)) { if (t < k.t) break; const u = ease(Math.min(1, (t - k.t) / .9)); f = f + (k.f - f) * u; }
    return f;
  }
  /** The card's box once it sits in the middle of a kit's scene: [x, y, w, h] (e.g. for a border beam). */
  function kitCardBox() {
    const [x0, y0] = geo.pushed(card.prop[0], card.prop[1]), [x1, y1] = geo.pushed(card.prop[2], card.prop[3]), {at: [lx, ly], scale: s} = centrePlace;
    return [lx - (x1 - x0) * s / 2, ly - (y1 - y0) * s / 2, (x1 - x0) * s, (y1 - y0) * s];
  }
  function stageSpec(st, t) {
    const out = {chip: st.chip, chipDark: st.chipDark, title: st.title, file: st.file, label: st.label, lh: st.lh, chrome: st.chrome, panel: st.type === 'code' || st.type === 'api' ? undefined : false};
    // Without a card, a stage has the page to itself: its panel is centred.
    if (!push) out.panelX = (1600 - PANEL.PW) / 2;
    if (st.lines) { out.code = st.lines; out.codeSize = st.code.size; out.shown = i => { const r = st.reveal.find(([n]) => n === i); return r ? (t - r[1]) / .55 : 0; }; }
    // A code line and the card line it defines are joined while the voice names them.
    const links = (st.glowAt ?? []).filter(g => g.lines).map(g => ({...g, w: Math.min(ease((t - g.a) / .35), 1 - ease((t - g.b) / .45))})).filter(g => g.w > 0);
    if (links.length && st.lines) out.custom = (c, P) => links.forEach(g => {
      const row = card.rows.find(r => r.key === g.row), [rx, ry] = cardEdge(geo, card, card.aside, row.by), tone = card.template[g.row].tone;
      const lh = st.lh ?? 36, y = PANEL.Y0 + 92 + ((g.lines[0] + g.lines[1]) / 2) * lh;
      drawConnector(c, P, [PANEL.X0 - 6, y], [rx + 6, ry], P.C[tone], g.w, t);
    });
    out.focus = st.focusAt.map(f => ({from: f.from, to: f.to, tone: f.tone, w: Math.min(ramp(t, f.a, .35), 1 - ramp(t, f.b, .4))}));
    if (st.marksAt.length) out.marks = st.marksAt.map(m => ({line: m.line, icon: m.icon, w: Math.min((t - m.a) / .45, 1 - ramp(t, m.b, .4))}));
    if (st.footerAt !== undefined) out.footer = [st.footer.text, st.footer.tone ?? 'accent', ramp(t, st.footerAt)];
    if (st.listAt) out.list = st.listAt.map(item => [item.what, item.detail, ramp(t, item.t)]);
    if (st.kit) out.custom = (c, P) => st.kit.draw(c, P, paper, st.handle, t, push ? kitCardBox() : null);
    if (st.type === 'recap') out.custom = (c, P) => {
      // Match cut in: the last screen shrinks into its place at the end of the strip.
      const last = st.frames.length - 1, shrink = ease(ramp(t, st.start - .3, 1.1)), to = recapSlotBox(last, 1.55);
      drawRecap(c, P, st.frames.map(fr => ({...fr, image: recalls[fr.recall]})), {f: recapFocus(st, t), enter: ramp(t, st.start + .3, .7), hide: shrink < 1 ? last : -1, t});
      if (shrink < 1 && recalls[st.frames[last].recall]) drawRecallFramed(c, P, recalls[st.frames[last].recall], ...[0, 0, 1600, 900].map((v, j) => v + (to[j] - v) * shrink), shrink);
    };
    if (st.cardsAt) out.custom = (c, P) => drawSummary(c, P, st.cardsAt.map(k => ({...k, alpha: ramp(t, k.t), image: k.recall ? recalls[k.recall] : null})),
      st.closingAt !== undefined ? {text: st.closing.text, alpha: ramp(t, st.closingAt)} : null,
      st.heroAt ? {text: st.heroAt.text, sub: st.heroAt.sub, image: recalls[st.heroAt.recall], alpha: ramp(t, st.start - .3, .6), morph: ramp(t, st.heroAt.until - .2, .9),
        into: st.cardsAt.findIndex(k => k.recall === st.heroAt.recall)} : null);
    return out;
  }

  const recapStage = stages.find(s => s.teaserAt), teaser = recapStage?.teaserAt, nest = createCanvas(1600, 900);
  /**
   * The teaser for the next film: the answer frame fills the screen, a stamp asks the next
   * question, the recorded scene rewinds, and the next title arrives.
   */
  function drawTeaser(ctx, t) {
    const u = t - teaser.at, P = makePen(ctx, paper, {baseScale: 1});
    ctx.drawImage(blank, 0, 0);
    if (u < 2.7) {
      const grow = ease(Math.min(1, u / 1.0)), from = recapSlotBox(5, 1.55), r = from.map((v, j) => v + ([0, 0, 1600, 900][j] - v) * grow);
      if (recalls[teaser.recall]) drawRecallFramed(ctx, P, recalls[teaser.recall], ...r, 1);
      const s = u - 1.2;
      if (s > 0) {
        const k = Math.min(1, s / .35), sc = 1.7 - .7 * ease(k);
        ctx.save(); ctx.translate(800, 450); ctx.rotate(-.1); ctx.scale(sc, sc); ctx.globalAlpha *= Math.min(1, s / .15);
        ctx.font = '700 64px Caveat'; const w = ctx.measureText(teaser.stamp).width + 80;
        ctx.fillStyle = 'rgba(255,250,245,.9)'; ctx.beginPath(); ctx.roundRect(-w / 2, -58, w, 116, 18); ctx.fill();
        ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 7; ctx.beginPath(); ctx.roundRect(-w / 2, -58, w, 116, 18); ctx.stroke();
        ctx.fillStyle = '#c0392b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(teaser.stamp, 0, 4); ctx.restore();
      }
      return;
    }
    if (u < 4.8) {
      // Rewind: the recorded scene plays backwards, fast.
      const k = ease((u - 2.7) / 2.1), back = teaser.from + (teaser.to - teaser.from) * k;
      const n = nest.getContext('2d'); n.resetTransform(); n.clearRect(0, 0, 1600, 900); frame(n, back);
      ctx.drawImage(nest, 0, 0);
      ctx.fillStyle = 'rgba(28,36,54,.16)'; ctx.fillRect(0, 0, 1600, 900);
      ctx.fillStyle = 'rgba(255,255,255,.06)'; for (let y = (u * 400) % 8; y < 900; y += 8) ctx.fillRect(0, y, 1600, 2);
      ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.roundRect(1330, 40, 230, 54, 27); ctx.fill();
      ctx.fillStyle = '#fff'; for (const dx of [0, 26]) { ctx.beginPath(); ctx.moveTo(1372 + dx, 52); ctx.lineTo(1350 + dx, 67); ctx.lineTo(1372 + dx, 82); ctx.fill(); }
      P.text('REWIND', 1470, 68, 22, '#fff', {mono: true, weight: 700});
      return;
    }
    // The next film's title card.
    const v = u - 4.8, a = ease(Math.min(1, v / .6)), N = teaser.next;
    ctx.save(); ctx.globalAlpha *= a;
    ctx.font = '700 18px Menlo'; const cw = ctx.measureText(N.chip).width + 40;
    ctx.fillStyle = P.C.accent; ctx.beginPath(); ctx.roundRect(800 - cw / 2, 300, cw, 40, 20); ctx.fill();
    P.text(N.chip, 800, 321, 18, paper.palette.bg, {mono: true, weight: 700});
    P.text(N.title, 800, 420, 76, P.C.ink, {display: true, weight: 700});
    const uw = P.measure(N.title, 76, {display: true, weight: 700}) * ease(Math.min(1, Math.max(0, (v - .3) / .7)));
    ctx.fillStyle = P.C.available; ctx.beginPath(); ctx.roundRect(800 - uw / 2, 470, uw, 7, 4); ctx.fill();
    P.alpha(ease(Math.min(1, Math.max(0, (v - .7) / .6))), () => P.text(N.sub, 800, 540, 32, P.C.dim, {display: true}));
    ctx.restore();
  }

  /**
   * A world at t: its kit draws on the sheet, the sheet hangs on the paper, the camera follows the
   * world's spotlight (and, for the story of a pushIn film, pushes into the prop: `camera`).
   */
  function drawWorld(ctx, w, t, spot, until = Infinity, camera = null) {
    { const c = sheet.getContext('2d'); c.resetTransform(); c.clearRect(0, 0, 1600, 900); w.instance.draw(c, Math.min(t, until), spot); }
    ctx.drawImage(blank, 0, 0); // the page under the camera: a push never uncovers the frame edge
    ctx.save();
    if (spot) aim(ctx, spotCamera(w, spot));
    if (camera) aim(ctx, camera);
    ctx.drawImage(blank, 0, 0);
    if (w.S < 1) { ctx.save(); ctx.shadowColor = 'rgba(60,50,35,.22)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 8; ctx.drawImage(sheet, w.BX, w.BY, 1600 * w.S, 900 * w.S); ctx.restore(); }
    else ctx.drawImage(sheet, 0, 0);
    ctx.restore();
  }
  const spotOf = (w, t) => w.instance.spotAt ? w.instance.spotAt(t) : null;
  /** A spotlight's camera on a world: {sx, sy, z, tx, ty} (translate to (tx, ty), scale z, about (sx, sy)). */
  function spotCamera(w, spot) {
    const sx = w.BX + spot.cx * w.S, sy = w.BY + spot.cy * w.S, z = 1 + (spot.zoom - 1) * spot.w;
    let tx = sx + (800 - sx) * .25 * spot.w, ty = sy + (450 - sy) * .25 * spot.w;
    // A full-frame world must stay covering the frame while the camera pushes (no edge showing).
    if (w.S >= 1) { tx = Math.min(sx * z, Math.max(1600 - (1600 - sx) * z, tx)); ty = Math.min(sy * z, Math.max(900 - (900 - sy) * z, ty)); }
    return {sx, sy, z, tx, ty};
  }
  /** The push into the story prop at t (from boardEnd): a camera like spotCamera's. */
  function pushInCamera(t) {
    const e = ease((t - boardEnd) / (TURN * .6)), z = 1 + (ZOOM - 1) * e;
    return {sx: propCentre[0], sy: propCentre[1], z, tx: propCentre[0] + (800 - propCentre[0]) * e, ty: propCentre[1] + (450 - propCentre[1]) * e};
  }

  /** A pushIn film at t: the story, the push into the prop, the card and the stages on one page. */
  function drawPushed(ctx, t) {
    drawWorld(ctx, storyWorld, t, t < boardEnd ? spotOf(storyWorld, t) : null, boardEnd, t >= boardEnd ? pushInCamera(t) : null);
    if (t >= boardEnd) {
      const typed = ease((t - boardEnd - TURN * .45) / (TURN * .45)), now = stateAt(t), P = makePen(ctx, paper, {baseScale: 1});
      ctx.save(); ctx.globalAlpha = typed; ctx.drawImage(blank, 0, 0);
      const move = Math.max(0, Math.min(1, (t - MOVE0) / (MOVE1 - MOVE0)));
      P.alpha(1 - move, () => P.text(push.caption, 800, Math.min(860, geo.pushed(0, card.prop[3])[1] + 60), 30, P.C.ink, {display: true, weight: 600}));
      drawCard(ctx, P, geo, card, {rows: now.rows, glow: now.glow, pop: now.pop, named: ramp(t, namedAt, .6), alpha: now.fade,
        place: {move, center: now.centre, aside: moveTo, loop: centrePlace}, columns: now.columns});
      const intro = ease((t - MOVE0 - .3) / .7);
      for (const [st, w] of now.shown) drawStage(ctx, P, paper, intro * w, stageSpec(st, t));
      ctx.restore();
    }
  }

  /** One shot at t, opaque: a world, or paper with its stages handing over on the page. */
  function drawShot(ctx, shot, t) {
    if (shot.world) { drawWorld(ctx, shot.world, t, spotOf(shot.world, t)); return; }
    ctx.drawImage(blank, 0, 0);
    const P = makePen(ctx, paper, {baseScale: 1});
    shot.stages.forEach((st, k) => {
      const next = shot.stages[k + 1], enter = k === 0 ? 1 : into(st, t, .2, .45), leave = next ? 1 - into(next, t, .65, .45) : 1;
      const w = Math.min(enter, leave); if (w > 0) drawStage(ctx, P, paper, w, stageSpec(st, t));
    });
  }
  const ghost = ghostPainter();
  /** The shot that is arriving over the one leaving, through its transition (transitions.mjs). */
  function drawTransition(ctx, j, t, e) {
    const shot = shots[j], prev = shots[j - 1], en = shot.enter;
    en.draw(ctx, {e, from: c => drawShot(c, prev, t), to: c => drawShot(c, shot, t), p: en.p, ghost: (alpha, paint) => ghost(ctx, alpha, paint), theme: paper, boxes: entranceBoxes.get(shot) ?? NO_BOXES});
  }
  /** A film without a pushIn at t: the current shot, or the next one arriving over it. */
  /** Which shot is on screen (or arriving) at t. */
  function shotAt(t) {
    let j = 0;
    while (j + 1 < shots.length && t >= shots[j + 1].start - shots[j + 1].enter.lead) j++;
    return j;
  }
  function drawShots(ctx, t) {
    const j = shotAt(t), shot = shots[j], u = j === 0 || shot.enter.type === 'cut' ? 1 : ramp(t, shot.start - shot.enter.lead, shot.enter.seconds);
    if (u >= 1) { drawShot(ctx, shot, t); return; }
    drawTransition(ctx, j, t, shot.enter.ease(u));
  }
  /**
   * The held layers (a world's `overlay(ctx, t)`, on the frame): drawn over the picture and outside its camera,
   * so a transition or a director's push never moves them — a presenter in the corner, a title band. Through a
   * change of picture the leaving shot's layer crosses into the arriving one's (layerCrossfader): the same layer
   * in both stays exactly itself.
   */
  const crossfade = layerCrossfader();
  const overlayOf = (shot, t) => (shot.world?.instance.overlay ? c => shot.world.instance.overlay(c, t) : null);
  function drawOverlays(ctx, t) {
    const j = shotAt(t), shot = shots[j], u = j === 0 || shot.enter.type === 'cut' ? 1 : ramp(t, shot.start - shot.enter.lead, shot.enter.seconds);
    const now = overlayOf(shot, t);
    if (u >= 1) { if (now) { ctx.save(); now(ctx); ctx.restore(); } return; }
    crossfade(ctx, Math.max(0, Math.min(1, shot.enter.ease(u))), overlayOf(shots[j - 1], t), now);
  }

  /** The whole film at t, drawn into ctx whose transform maps 1600×900 onto the frame. */
  function frame(ctx, t) {
    if (teaser && t >= teaser.at) { drawTeaser(ctx, t); return; }
    // A director's push moves the camera over the picture; the guess cards stay where they are.
    const cam = pushAt(pushes, t);
    if (cam) { ctx.save(); aim(ctx, cam); }
    if (push) drawPushed(ctx, t); else drawShots(ctx, t);
    if (cam) ctx.restore();
    if (!push) drawOverlays(ctx, t);
    for (const g of guesses) if (t >= g.start && t <= g.until + .5) drawGuess(ctx, makePen(ctx, paper, {baseScale: 1}), paper, g, t);
  }

  /**
   * Where the picture changes: the push-in, each hand-over, entrance and cut, the teaser. A
   * director's push stays on one picture, so it may not run across any of these.
   */
  /** How a stage arrives: {from, to, what} — the push-in, a shot's entrance, a hand-over on the page, or a cut. */
  function arrivalOf(st) {
    if (push && st === buildStage) return {from: boardEnd, to: Math.max(boardEnd + TURN, st.start + .25), what: 'the push-in'};
    const shot = !push && shots.find(s => s.stages[0] === st || (st.world && s.world === st.world));
    if (shot) {
      const e = shot.enter;
      return e.type === 'cut' ? {from: st.start, to: st.start, what: `the cut into ${st.scene}`}
        : {from: st.start - e.lead, to: Math.max(st.start - e.lead + e.seconds, st.type === 'recap' ? st.start + 1 : 0), what: `the ${e.type} into ${st.scene}`};
    }
    return st.cut ? {from: st.start, to: st.start, what: `the cut into ${st.scene}`}
      : {from: st.start - .65, to: st.start + (st.type === 'recap' ? 1 : .4), what: `the hand-over to ${st.scene}`};
  }
  function pictureChanges() {
    const out = stages.map(arrivalOf);
    if (teaser) out.push({from: teaser.at, to: clock.total, what: 'the teaser'});
    return out;
  }
  /** The world whose spotlight shows at t (its name), or null. */
  function spotlightAt(t) {
    if (push) return t < boardEnd && spotOf(storyWorld, t) ? 'the story' : null;
    const j = shotAt(t), w = shots[j].world;
    return w && spotOf(w, t) ? (j === 0 ? 'the story' : `the world in ${stages.find(s => s.world === w).scene}`) : null;
  }
  // What is drawn where, for the preview studio (regions.mjs): each box names the recipe entry that drew it.
  const storyPath = recipe.story ? 'story' : 'whiteboard', stagePath = st => `stages[${stages.indexOf(st)}]`;
  const measure = makePen(createCanvas(8, 8).getContext('2d'), paper, {baseScale: 1});
  /** A world's view on the frame: its sheet hung on the paper, then the push-in's and the spotlight's cameras. */
  function worldView(w, spot, camera = null) {
    let v = view(w.S, w.BX, w.BY);
    if (camera) v = then(about(camera), v);
    if (spot) v = then(about(spotCamera(w, spot)), v);
    return v;
  }
  /** The world on screen at t (the part of the recipe that draws it, and its view), or null on paper. */
  function worldOnScreen(t) {
    if (push) {
      if (t >= boardEnd && ease((t - boardEnd - TURN * .45) / (TURN * .45)) >= .5) return null;
      return {w: storyWorld, path: storyPath, until: boardEnd, view: worldView(storyWorld, t < boardEnd ? spotOf(storyWorld, t) : null, t >= boardEnd ? pushInCamera(t) : null)};
    }
    return shotWorld(shots[shotAt(t)], t);
  }
  /** A shot's world at t (the part of the recipe that draws it, and its view), or null for a shot on paper. */
  function shotWorld(shot, t) {
    const st = shot.world && stages.find(s => s.world === shot.world);
    return shot.world ? {w: shot.world, path: st ? `${stagePath(st)}.world` : storyPath, until: Infinity, view: worldView(shot.world, spotOf(shot.world, t))} : null;
  }
  /** Which reveal made a code line appear: its recipe entry. */
  const lineEntry = (st, i) => st.code?.allAt ? `${stagePath(st)}.code.allAt` : (k => k >= 0 ? `${stagePath(st)}.reveal[${k}]` : `${stagePath(st)}.code`)((st.reveal ?? []).findIndex(([n]) => n === i));
  function stageRegions(st, t) {
    const sp = stagePath(st), out = [], spec = stageSpec(st, t);
    // A stage that draws the whole page itself (a kit's, a recap, a summary) answers for the page; a kit may say more (kit.regions).
    if (spec.panel === false) out.push({box: [0, 0, 1600, 900], path: sp, label: `the ${st.type} stage`});
    const say = {title: () => [`${sp}.title`, st.title], panel: () => [sp, st.file ?? st.title], footer: () => [`${sp}.footer`, st.footer?.text],
      line: i => [lineEntry(st, i), st.lines[i].map(([text]) => text).join('').trim()], mark: k => [`${sp}.marks[${k}]`, st.marks[k].icon],
      focus: k => [`${sp}.focus[${k}]`, `lines ${st.focus[k].lines.join('–')}`], list: n => [`${sp}.list[${n}]`, st.list[n].what]};
    for (const b of stageBoxes(spec)) { const [path, label] = say[b.part](b.index); out.push({box: b.box, path, label: String(label ?? '')}); }
    for (const r of st.kit?.regions?.(st.handle, t, push ? kitCardBox() : null) ?? []) out.push({box: r.box, path: `${sp}.${r.path}`, label: r.label ?? '', ...(r.name ? {name: r.name} : {})});
    return out;
  }
  function cardRegions(t, now) {
    const move = Math.max(0, Math.min(1, (t - MOVE0) / (MOVE1 - MOVE0))), {box, camera} = cardPlacement(geo, card, {move, center: now.centre, aside: moveTo, loop: centrePlace}), v = about(camera);
    return [{box: through(v, box), path: 'card', label: card.header ?? 'the card'}, ...cardRowBoxes(geo, card).map(r => ({box: through(v, r.box), path: `card.rows[${r.index}]`, label: r.label}))];
  }
  function guessBox(g, t) {
    const text = g.answer && t >= g.end + GUESS_FLIP ? g.answer : g.question, w = Math.min(1440, measure.measure(text, 54, {display: true, weight: 700}) + 230), cy = GUESS_PLACES[g.place];
    return [800 - w / 2, cy - 75, 800 + w / 2, cy + 75];
  }
  /** What is drawn where at t: [{box: [x0, y0, x1, y1], path, label}] on the frame, in drawing order. */
  function regionsAt(t) {
    if (teaser && t >= teaser.at) return [{box: [0, 0, 1600, 900], path: `${stagePath(recapStage)}.teaser`, label: 'the teaser'}];
    const out = regionsUnder(t);
    const cam = pushAt(pushes, t), seen = cam ? out.map(r => ({...r, box: through(about(cam), r.box)})) : out;
    guesses.forEach((g, n) => { if (t >= g.start && t <= g.until + .5) seen.push({box: guessBox(g, t), path: `guesses[${n}]`, label: g.question}); });
    return seen;
  }
  /** What is drawn where at t before any director's push: the world's (or the page's) regions, on the frame. */
  function regionsUnder(t) {
    if (teaser && t >= teaser.at) return [{box: [0, 0, 1600, 900], path: `${stagePath(recapStage)}.teaser`, label: 'the teaser'}];
    if (!push) return shotRegions(shots[shotAt(t)], t);
    const world = worldOnScreen(t);
    if (world) return worldRegions(world, t);
    const out = [], now = stateAt(t);
    if (now.fade > 0) out.push(...cardRegions(t, now));
    for (const [st] of now.shown) out.push(...stageRegions(st, t));
    return out;
  }
  /** A world's regions on the frame: the world itself, then each thing its kit says it draws (regionsAt), through the world's view. */
  function worldRegions(world, t) {
    const out = [{box: through(world.view, [0, 0, 1600, 900]), path: world.path, label: `the ${world.w.kit} world`}];
    for (const r of world.w.instance.regionsAt?.(Math.min(t, world.until)) ?? []) out.push({box: through(world.view, r.box), path: `${world.path}.${r.path}`, label: r.label ?? '', ...(r.name ? {name: r.name} : {})});
    return out;
  }
  /** One shot's regions at t, on screen or not (a film without a pushIn): its world's, or its stages' on the page. */
  function shotRegions(shot, t) {
    const world = shotWorld(shot, t);
    if (world) return worldRegions(world, t);
    const out = [];
    shot.stages.forEach((st, k) => { const next = shot.stages[k + 1]; if (Math.min(k === 0 ? 1 : into(st, t, .2, .45), next ? 1 - into(next, t, .65, .45) : 1) > 0) out.push(...stageRegions(st, t)); });
    return out;
  }
  /**
   * The box of the one thing called `name` at t (a kit names things in its regions: regionsAt → {name}),
   * for a push that frames it (notes.mjs · FRAMINGS). Nothing by that name, or two, refuses.
   */
  const named = (name, t) => namedIn(regionsUnder(t), name, t);
  function namedIn(regions, name, t) {
    const hits = regions.filter(r => r.name === name);
    if (hits.length === 1) return hits[0].box;
    if (hits.length > 1) throw new Error(`${hits.length} things are called "${name}" at ${t.toFixed(2)} s; a name frames one thing`);
    const names = [...new Set(regions.map(r => r.name).filter(Boolean))];
    throw new Error(`nothing in the picture is called "${name}" at ${t.toFixed(2)} s; ${names.length ? `the names there are ${names.join(', ')}` : 'nothing there has a name (a kit names things in regionsAt: {box, path, label, name})'}`);
  }
  /**
   * The mouths drawn at t, for the lip-sync check (finished.mjs): each kit on screen that draws one says so —
   * a world's instance.mouthsAt(t), a kit stage's mouthsAt(handle, t) → [{who, open: 0..1}] (who: the speaker
   * it belongs to, null for the narrator). [{who, open, path}].
   */
  function mouthsAt(t) {
    if (teaser && t >= teaser.at) return [];
    const out = [], world = worldOnScreen(t), add = (list, path) => { for (const m of list ?? []) out.push({who: m.who ?? null, open: Math.max(0, Math.min(1, Number(m.open) || 0)), path}); };
    if (world) add(world.w.instance.mouthsAt?.(Math.min(t, world.until)), world.path);
    else {
      const shown = push ? stateAt(t).shown.map(([st]) => st) : shots[shotAt(t)].stages;
      for (const st of shown) add(st.kit?.mouthsAt?.(st.handle, t), stagePath(st));
    }
    return out;
  }
  /**
   * A point on the frame at t in the recipe's own coordinates: `frame` (as a push note's `at` means it:
   * before any push) and, over a world, `world` {path, at} (the sheet's, as its items are placed).
   */
  function pointAt(t, x, y) {
    const cam = teaser && t >= teaser.at ? null : pushAt(pushes, t), [fx, fy] = cam ? back(about(cam), [x, y]) : [x, y], world = !(teaser && t >= teaser.at) && worldOnScreen(t);
    const round = n => Math.round(n);
    return {frame: [round(fx), round(fy)], ...(world ? {world: {path: world.path, at: back(world.view, [fx, fy]).map(round)}} : {})};
  }

  // A push on a named thing reads the worlds' regions, so every world is ready first (its images decoded).
  await readyWorlds(readies);
  // An entrance that goes through a named thing (transitions.mjs · regions) finds it once, here: in the picture
  // it leaves at the change's first moment, in the one it arrives at at its last. The draw reads these boxes,
  // so a frame stays a pure function of time; a name the picture does not have refuses, naming the ones it has.
  if (!push) shots.forEach((shot, j) => {
    const en = shot.enter;
    if (!j || !en.regions) return;
    const st = shot.stages[0] ?? stages.find(s => s.world === shot.world), where = `stage ${st.scene}`, want = en.regions(en.p);
    const lists = want && typeof want === 'object' && !Array.isArray(want) && ['from', 'to'].every(side => want[side] === undefined || (Array.isArray(want[side]) && want[side].every(n => typeof n === 'string' && n.trim())));
    if (!lists) throw new Error(`${where}: the ${en.type}'s regions(p) must return {from?: [names], to?: [names]}`);
    // Every thing a setting names is looked up: one regions(p) leaves out would never be checked.
    const looked = new Set([...(want.from ?? []), ...(want.to ?? [])]);
    for (const [name, value] of Object.entries(en.p)) if (en.names?.includes(name) && value !== null && !looked.has(value)) throw new Error(`${where}: the ${en.type}'s ${name} names "${value}", which its regions(p) does not look for`);
    const t0 = Math.max(0, shot.start - en.lead), t1 = Math.min(clock.total, t0 + en.seconds);
    const names = side => {
      const list = want?.[side] ?? [];
      if (!Array.isArray(list) || !list.every(n => typeof n === 'string' && n.trim())) throw new Error(`${where}: the ${en.type}'s regions(p) must return {from?: [names], to?: [names]}`);
      return list;
    };
    const find = (side, sh, t) => Object.freeze(Object.fromEntries(names(side).map(name => [name, entranceBox(sh, name, t, {where, type: en.type, side})])));
    entranceBoxes.set(shot, Object.freeze({from: find('from', shots[j - 1], t0), to: find('to', shot, t1)}));
  });
  /** The box of the thing an entrance names, in the picture it leaves (side 'from') or arrives at ('to'), at t; it must be on the frame. */
  function entranceBox(shot, name, t, {where, type, side}) {
    const picture = side === 'from' ? 'the picture it leaves' : 'the picture it arrives at';
    let box;
    try { box = namedIn(shotRegions(shot, t), name, t); } catch (err) { throw new Error(`${where}: the ${type} looks for "${name}" in ${picture}, and ${err.message}`); }
    const w = Math.min(1600, box[2]) - Math.max(0, box[0]), h = Math.min(900, box[3]) - Math.max(0, box[1]);
    if (!(w >= 4 && h >= 4)) throw new Error(`${where}: the ${type} goes through "${name}" in ${picture}, which is not on the frame at ${t.toFixed(2)} s (its box is [${box.map(n => Math.round(n)).join(', ')}])`);
    return Object.freeze([...box]);
  }
  const pushes = placePushes(notes.pushes, {clock, speed: notes.speed, changes: pictureChanges(), spotlight: spotlightAt, total: clock.total, named});

  // The notes as applied, in the order written: the making-of record says what each one changed.
  const applied = new Map();
  if (notes.speedNote) applied.set(notes.speedNote, {note: notes.speedNote.note, speed: notes.speed, ...(push ? {pushIn: {seconds: +TURN.toFixed(3), was: push.turn ?? 1}} : {}), worlds: [...worldKits], pushes: pushes.length});
  for (const st of stages) if (st.cutNote) applied.set(st.cutNote, {note: st.cutNote.note, cut: st.scene, at: +st.start.toFixed(3), was: st.cutWas});
  for (const p of pushes) applied.set(p.given, {note: p.note, push: {at: p.at, zoom: p.zoom, ...(p.on ? {on: p.on, size: p.size} : {})}, from: +p.a.toFixed(3), to: +p.b.toFixed(3), seconds: +p.seconds.toFixed(3)});
  const notesApplied = (recipe.notes ?? []).map(n => applied.get(n));
  yield step('guesses-and-notes', () => notesSummary(guesses, notesApplied));

  // Watching time (shots.mjs): each shot's moments — the phrases the recipe names while it is on screen —
  // never too many, too close together. Phrases that are not something to see are left out, by identity:
  // a push's camera words, a teaser's rewind (it names the past), the poster and the recalls.
  const notMoments = new Set([...notes.pushes.flatMap(n => [n.push.from, n.push.to]), ...stages.flatMap(st => st.teaser ? [st.teaser.rewind.from, st.teaser.rewind.to] : []),
    ...(recipe.poster ? [recipe.poster] : []), ...Object.values(recipe.recalls ?? {}), ...readRefs]);
  const momentsOf = u => beats.filter(b => !notMoments.has(b.ref) && b.t >= u.from && b.t < u.to).map(b => b.t);
  const watchingRule = watchingMode(recipe.watching);
  const watching = tooMuchTooFast(plan.map(u => ({path: u.path, where: u.where, moments: momentsOf(u)})), WATCHING);
  if (watchingRule === 'refuse' && watching.length) throw new Error(`Too much, too fast (the recipe says watching: "refuse"): ${watching.slice(0, 3).map(watchingText).join('; ')}${watching.length > 3 ? `; and ${watching.length - 3} more` : ''}`);
  const shotsPlanned = plan.map(u => ({path: u.path, where: u.where, scene: u.scene, from: +u.from.toFixed(3), to: +u.to.toFixed(3), intent: u.intent, start: u.continuity?.start ?? null, end: u.continuity?.end ?? null, moments: distinctMoments(momentsOf(u)).length}));

  // Reading time (reading.mjs): every line meant to be read stays up, whole, long enough to read.
  const readingRule = readingMode(recipe.reading), reading = tooShortToRead(readableLines(), readingPace(recipe.reading));
  // Reads: one at a time, each while its shot is on screen — from when it starts to arrive until the next one
  // does — with its time before the shot leaves, each about a thing that is there the whole time it needs.
  const leavesAt = i => plan[i + 1] ? (plan[i + 1].stage ? arrivalOf(plan[i + 1].stage).from : plan[i + 1].from) : (teaser ? teaser.at : clock.total);
  const reads = plan.flatMap((u, i) => checkReads(u.reads, {from: u.stage ? arrivalOf(u.stage).from : 0, to: leavesAt(i), where: u.where}).map(r => {
    const out = {path: `${u.path}.reads[${r.k}]`, what: r.what, at: +r.t.toFixed(3), min: r.min, ...(r.region ? {region: r.region} : {}), ...(r.problem ? {problem: r.problem} : {})};
    if (r.region && !out.problem) for (const t of Array.from({length: Math.floor(r.min / .1) + 1}, (_, k) => Math.min(clock.total, r.t + Math.min(r.min - .02, .02 + k * .1)))) {
      try { named(r.region, t); } catch (e) { out.problem = `${u.where}: "${r.what}" is about "${r.region}" for ${r.min} s from ${r.t.toFixed(2)} s: ${e.message}`; break; }
    }
    return out;
  })).sort((a, b) => a.at - b.at || a.path.localeCompare(b.path));
  const readProblems = reads.filter(r => r.problem);
  if (readingRule === 'refuse' && readProblems.length) throw new Error(`Reads that cannot land (the recipe says reading: "refuse"): ${readProblems.slice(0, 3).map(r => r.problem).join('; ')}${readProblems.length > 3 ? `; and ${readProblems.length - 3} more` : ''}`);
  if (readingRule === 'refuse' && reading.length) throw new Error(`Too short to read (the recipe says reading: "refuse"): ${reading.slice(0, 3).map(l => `"${l.text}" (${l.path}) is up ${l.seconds} s and needs ${l.needs} s`).join('; ')}${reading.length > 3 ? `; and ${reading.length - 3} more` : ''}`);
  /** Every line the film shows to be read, with when it is whole on screen and when it starts to leave. */
  function readableLines() {
    const lines = [], leaves = i => stages[i + 1] ? arrivalOf(stages[i + 1]).from : (teaser ? teaser.at : clock.total);
    const worldLines = (w, prefix, from, to) => { for (const l of w.instance.texts?.() ?? []) lines.push({...l, path: `${prefix}.${l.path}`, from: Math.max(l.from, from), to: Math.min(l.to, to)}); };
    worldLines(storyWorld, recipe.story ? 'story' : 'whiteboard', 0, push ? boardEnd + TURN * .45 : (stages[0] ? arrivalOf(stages[0]).from : clock.total));
    stages.forEach((st, i) => {
      const sp = `stages[${i}]`, whole = arrivalOf(st).to, gone = leaves(i);
      if (st.world) worldLines(st.world, `${sp}.world`, whole, gone);
      if (st.title && st.chrome !== false && !st.world) lines.push({text: st.title, from: whole, to: gone, path: `${sp}.title`});
      if (st.footerAt !== undefined) lines.push({text: st.footer.text, from: Math.max(whole, st.footerAt + .5), to: gone, path: `${sp}.footer`});
      (st.listAt ?? []).forEach((item, k) => lines.push({text: `${item.what} ${item.detail}`, from: Math.max(whole, item.t + .5), to: gone, path: `${sp}.list[${k}]`}));
      if (st.closingAt !== undefined) lines.push({text: st.closing.text, from: Math.max(whole, st.closingAt + .5), to: gone, path: `${sp}.closing`});
    });
    if (push && buildStage) lines.push({text: push.caption, from: boardEnd + TURN * .9, to: MOVE0, path: 'pushIn.caption'});
    guesses.forEach((g, n) => {
      lines.push({text: g.question, from: g.start + .35, to: g.answer ? g.end : g.until + .5, path: `guesses[${n}].question`});
      if (g.answer) lines.push({text: g.answer, from: g.end + 2 * GUESS_FLIP, to: g.until, path: `guesses[${n}].answer`});
    });
    return lines;
  }

  // Sound design: quiet accents on the actions, a chime on the eurekas and the answer. A kit's sounds are
  // checked by name and gain here (sound.mjs · checkSound), and keep their gain.
  const sounds = [];
  const add = (time, type, gain) => { if (Number.isFinite(time) && time >= 0 && time < clock.total) sounds.push(gain === undefined ? {time, type} : {time, type, gain}); };
  const addKitSounds = (list, who) => { for (const s of list ?? []) { checkSound(s, who); add(s.time, s.type, s.gain); } };
  addKitSounds(story.sounds, `the story kit "${storySpec.kit}"`);
  if (push) { add(boardEnd, 'slide'); add(MOVE0, 'slide'); }
  for (const shot of shots.slice(1)) if (shot.enter.sound) add(shot.start - shot.enter.lead, shot.enter.sound);
  for (const st of stages) {
    if (st.world) addKitSounds(st.world.instance.sounds, `the story kit "${st.world.kit}" (stage ${st.scene})`);
    for (const [, at] of st.reveal ?? []) add(at, 'tap');
    for (const item of st.listAt ?? []) add(item.t, 'tap');
    for (const k of st.cardsAt ?? []) add(k.t, 'settle');
    if (st.kit?.sounds) addKitSounds(st.kit.sounds(st.handle), `the stage kit "${stageKitNames[st.type]}" (stage ${st.scene})`);
  }
  if (recapStage) {
    for (const k of recapStage.keysAt.slice(1)) add(k.t, 'tap');
    if (teaser) { add(teaser.at + 1.2, 'settle'); add(teaser.at + 2.7, 'slide'); add(teaser.at + 3.6, 'slide'); add(teaser.at + 4.8, 'chime'); }
  }
  for (const g of guesses) { add(g.start, 'question'); if (g.answer) add(g.end, 'chime'); }
  sounds.sort((a, b) => a.time - b.time);
  checkSoundCounts(sounds, clock, storyboard, timings);
  // Listening (listening.mjs): about half the changes of picture silent, never the same cue twice running.
  const listeningRule = listeningMode(recipe.listening);
  const listening = push ? [] : changeSounds(shots.slice(1).map(shot => ({at: shot.start - shot.enter.lead, where: `stage ${(shot.stages[0] ?? stages.find(st => st.world === shot.world)).scene}`, sound: shot.enter.sound})));
  if (listeningRule === 'refuse' && listening.length) throw new Error(`The sound asks too much of the ear (the recipe says listening: "refuse"): ${listening.slice(0, 3).map(listeningText).join('; ')}${listening.length > 3 ? `; and ${listening.length - 3} more` : ''}`);

  /**
   * The moments worth a still (sheet.mjs): each scene's picture once it has settled, and each change of
   * picture half way through — [{t, kind: 'settled' | 'moving', label}], in time order.
   */
  function moments() {
    const out = [], changes = pictureChanges().filter(c => c.to > c.from);
    for (const c of changes) out.push({t: (c.from + c.to) / 2, kind: 'moving', label: `mid ${c.what}`});
    for (const p of pushes) out.push({t: p.a + p.seconds / 2, kind: 'moving', label: `mid push: ${p.note}`});
    storyboard.scenes.forEach(sc => {
      // The quietest point of the scene: half way between the end of anything arriving and the next change.
      const from = Math.max(clock.start(sc.id), ...changes.filter(c => c.to <= clock.end(sc.id)).map(c => c.to)), to = Math.min(clock.end(sc.id), ...changes.filter(c => c.from > from).map(c => c.from));
      out.push({t: to > from ? (from + to) / 2 : (clock.start(sc.id) + clock.end(sc.id)) / 2, kind: 'settled', label: sc.title ?? sc.id});
    });
    return out.filter(m => m.t >= 0 && m.t < clock.total).sort((a, b) => a.t - b.t);
  }

  /**
   * The film as rows of pictures (segments.mjs plans renders from them): when each row's picture starts
   * to arrive (`from`: its entrance begins, `lead` seconds before its first scene), the recipe entries that
   * draw it (`paths`), and how it arrives (`enter`: null for the first; a cut, or a transition that draws
   * the row before it too). A film with a pushIn is one row: its stages hand over on one page.
   */
  function rows() {
    if (push) return [{from: 0, start: 0, paths: [storyPath, 'pushIn', 'card', ...stages.map(stagePath)], enter: null, pushIn: true}];
    // A teaser rewinds through the film (drawTeaser draws earlier moments), so its row draws every row's entries,
    // and says which moments it replays (`rewinds`: from–to, played at–until) for what they bring with them.
    const everything = [storyPath, ...stages.map(stagePath)];
    return shots.map((shot, j) => {
      const teasing = !shot.world && shot.stages.some(st => st.teaserAt);
      return {
        from: j === 0 ? 0 : shot.start - shot.enter.lead, start: shot.start,
        paths: j === 0 ? [storyPath] : shot.world ? [stagePath(stages.find(st => st.world === shot.world))] : teasing ? everything : shot.stages.map(stagePath),
        enter: j === 0 ? null : {type: shot.enter.type, seconds: shot.enter.seconds, lead: shot.enter.lead},
        ...(teasing ? {rewinds: Object.freeze({from: Math.min(teaser.from, teaser.to), to: Math.max(teaser.from, teaser.to), at: teaser.at + 2.7, until: teaser.at + 4.8})} : {}),
      };
    });
  }

  // A poster: the recipe's chosen frame (a phrase), for the thumbnail (renderFilm bakes it in as frame 0).
  const posterAt = recipe.poster === undefined ? null : clock.at(recipe.poster);

  // Recall images: the film's own frames, reused in the recap so the viewer sees what they saw. Every
  // world was made ready before the pushes were placed (its images decoded), so a recall keeps the loaded picture.
  for (const [name, ref] of Object.entries(recipe.recalls ?? {})) {
    const c = createCanvas(1600, 900); frame(c.getContext('2d'), clock.at(ref)); recalls[name] = c;
  }
  yield step('checks', () => checksSummary({readingRule, reading, reads, watchingRule, watching, facts, sounds, byScene: soundsByScene(sounds, clock.offsets, timings.scenes.map(s => s.duration)), worlds: readies.filter(Boolean).length, recalls: Object.keys(recipe.recalls ?? {})}));
  // Every line the build resolved (the clock is a pure function of the paced word times, so the order it was asked in changes no second).
  yield step('resolve-lines', () => linesSummary(beats));
  // What the film was made from, hashed (hash.mjs): an approval locks these (approval.mjs), and every segment's
  // key holds the ones that reach every frame (segments.mjs). Files: every one read through the root while the
  // film was built.
  const inputs = Object.freeze({storyboard: hashOf(storyboard), timings: hashOf(timings), recipe: hashOf(given), strings: strings ? hashOf(strings) : null,
    data: data === null ? null : hashOf(data), theme: hashOf(paper), files: Object.freeze(files.list())});
  // What is drawn over every shot for a while: the guess cards, from their question to the card gone.
  const overlays = Object.freeze(guesses.map((g, n) => Object.freeze({path: `guesses[${n}]`, from: g.start, to: g.until + .5})));
  return {total: clock.total, clock, timings, sounds, listening, frame, beats, strings: [...used], notes: notesApplied, reading, reads, posterAt, moments, regionsAt, pointAt, theme: paper, shots: shotsPlanned, watching,
    rows: Object.freeze(rows().map(Object.freeze)), overlays, inputs, mouthsAt};
}

/** What reading the inputs gave (record.mjs): the recipe's top-level keys, each scene's seconds, the notes, the strings used. */
function inputsSummary({recipe, storyboard, clock, notes, strings}) {
  const lines = Object.fromEntries(storyboard.scenes.map(sc => [sc.id, {start: +clock.start(sc.id).toFixed(3), end: +clock.end(sc.id).toFixed(3)}]));
  return {reads: [], writes: {recipe: Object.keys(recipe), lines, notes: {written: (recipe.notes ?? []).length, speed: notes.speed}, ...(strings ? {strings} : {})}};
}
/** One key per world and per stage: its kit, its scene and its recipe path (a built-in stage is drawn by the paper kit). */
function buildSummary(storyPath, storyKit, stages, stageKitNames, plan) {
  // A shot's intent and its facts ride with it (absent when it states none), so a slice from a stage says what it was for.
  // The plan is in film order; each entry is found by its recipe path, so a recipe that lists its stages out of order still records each stage's own.
  const said = path => { const u = plan.find(x => x.path === path); return {...(u?.intent ? {intent: u.intent} : {}), ...(u?.continuity ? {continuity: u.continuity} : {})}; };
  const writes = {[`world.${storyPath}`]: {kit: storyKit, path: storyPath, ...said(storyPath)}};
  stages.forEach((st, i) => { writes[`stage.stages[${i}]`] = {type: st.type, kit: st.world?.kit ?? stageKitNames[st.type] ?? 'paper', scene: st.scene, path: `stages[${i}]`, ...said(`stages[${i}]`)}; });
  return {reads: ['recipe', 'lines'], writes};
}
/** Each guess's pause and when its card is gone, and each director's note as applied. */
function notesSummary(guesses, notesApplied) {
  const writes = {}, s = n => +n.toFixed(3);
  guesses.forEach((g, n) => { writes[`guess.guesses[${n}]`] = {start: s(g.start), end: s(g.end), until: s(g.until)}; });
  notesApplied.forEach((a, i) => { if (a) writes[`note.notes[${i}]`] = a; });
  return {reads: ['lines', 'notes', 'stage.'], writes};
}
/** What the checks found: the reading rule and the lines too short to read, the busiest scene's sounds, the worlds waited for. */
function checksSummary({readingRule, reading, reads = [], watchingRule, watching, facts, sounds, byScene, worlds, recalls}) {
  return {reads: ['world.', 'stage.', 'guess.', 'note.'], writes: {
    'checks.reading': {rule: readingRule, tooShort: reading.map(l => l.path), ...(reads.length ? {reads: reads.length, readProblems: reads.filter(r => r.problem).map(r => r.path)} : {})},
    'checks.watching': {rule: watchingRule, found: watching.map(w => ({kind: w.kind, path: w.path, at: w.at, moments: w.moments}))},
    'checks.continuity': {facts},
    'checks.sounds': {count: sounds.length, busiest: Math.max(0, ...byScene.map(l => l.length)), limit: MAX_SOUNDS_PER_SCENE},
    'checks.ready': {worlds, recalls}}};
}
/** A resolved line's key: when.<the recipe entry that named it>, or the phrase itself when no entry did. */
const beatKey = b => `when.${b.path ?? `(no entry) ${JSON.stringify(b.ref)}`}`;
/** Every beat as when.<path> = seconds, read from the scenes' seconds. */
function linesSummary(beats) {
  return {reads: ['lines'], writes: Object.fromEntries(beats.map(b => [beatKey(b), b.t]))};
}

/** Every list and object in the recipe → its path ("story.items[3].at"), so a beat can name the entry that asked for it. */
function recipePaths(recipe) {
  const paths = new Map();
  const walk = (value, where) => {
    if (!value || typeof value !== 'object' || paths.has(value)) return;
    paths.set(value, where);
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${where}[${i}]`));
    else for (const [k, v] of Object.entries(value)) walk(v, where ? `${where}.${k}` : k);
  };
  walk(recipe, '');
  return paths;
}

/** A value shown on screen, read from the film's data by a small path (e.g. "paused.status"). */
function valueFrom(data, value) {
  if (typeof value === 'string') return value;
  const got = value.path.split('.').reduce((o, k) => o?.[k], data);
  if (got === undefined) throw new Error(`The data has no ${value.path}`);
  return value.format.replace('{}', Array.isArray(got) ? `['${got.join("', '")}']` : String(got));
}
