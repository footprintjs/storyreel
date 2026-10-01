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
import {readFileSync} from 'node:fs';
import {insideRoot} from './files.mjs';
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
import {tooShortToRead, readingMode} from './reading.mjs';
import {checkSound, soundsByScene, MAX_SOUNDS_PER_SCENE} from './sound.mjs';

/** The recipe's own top-level keys: anything else refuses, unless the host application names it in `hostKeys`. */
const RECIPE_KEYS = ['story', 'whiteboard', 'pushIn', 'card', 'stages', 'guesses', 'notes', 'recalls', 'poster', 'reading', 'paperStyle'];
const STAGE_KEYS = new Set(['type', 'scene', 'chip', 'chipDark', 'title', 'file', 'label', 'code', 'lh', 'reveal', 'focus', 'glows', 'footer', 'list', 'loop', 'cards', 'closing', 'hero', 'frames', 'keys', 'teaser', 'enter', 'chrome', 'marks', 'columns', 'card']);
/** What every stage may carry; a stage kit that lists its own `keys` accepts these plus its own. */
const COMMON_KEYS = ['type', 'scene', 'chip', 'chipDark', 'title', 'enter', 'chrome', 'card'];
/**
 * The engine's stage features (code, reveal, focus, glows, marks, columns, list, cards…) are read on
 * the BUILT-IN stage types only. A kit stage gets the common keys and the footer; every key a kit
 * declares is the kit's own, and the engine never reads it (a kit's `marks` may mean tally marks).
 */
const KIT_STAGE_ENGINE_KEYS = new Set(['footer']);
const WORLD_KEYS = new Set(['type', 'scene', 'world', 'enter']);
const BUILT_IN_STAGES = new Set(['code', 'api', 'recap', 'summary', 'world']);
const ENTERS = new Set(['fade', 'wipe', 'iris', 'page', 'cut']);
const GUESS_KEYS = new Set(['after', 'question', 'answer', 'place', 'until']);
/** A hard cut: the new shot is there, whole, on the scene's first frame. */
const CUT = Object.freeze({type: 'cut', seconds: 0, lead: 0, at: [800, 450]});

/** A shot's entrance: 'fade' | 'wipe' | 'iris' | 'page' (a page turn) | 'cut', or {type, seconds, at: [x, y] (the iris centre)}. */
function entrance(enter, where) {
  const e = typeof enter === 'string' ? {type: enter} : enter ?? {type: 'fade'};
  if (!e || typeof e !== 'object' || !ENTERS.has(e.type)) throw new Error(`${where}: enter must be fade, wipe, iris, page or cut`);
  for (const key of Object.keys(e)) if (!['type', 'seconds', 'at'].includes(key)) throw new Error(`${where}: enter has unsupported key ${key}`);
  if (e.type === 'cut') { if (Object.keys(e).length > 1) throw new Error(`${where}: a cut takes no seconds and no centre`); return CUT; }
  const seconds = e.seconds ?? (e.type === 'page' ? 1.1 : .8);
  if (!(seconds >= .2 && seconds <= 3)) throw new Error(`${where}: enter.seconds must be between 0.2 and 3`);
  if (e.at !== undefined && !(Array.isArray(e.at) && e.at.length === 2 && e.at.every(Number.isFinite))) throw new Error(`${where}: enter.at must be [x, y]`);
  // Most of the change happens in the silence before the scene's first word.
  return {type: e.type, seconds, lead: seconds * .75, at: e.at ?? [800, 450]};
}

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
function kitContext({clock, motion, theme, root}) {
  const inside = file => insideRoot(root, file);
  return Object.freeze({clock, motion, theme, root, library: Object.freeze({}), labels: Object.freeze({}),
    insideRoot: inside, readFile: file => readFileSync(inside(file))});
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
 * @returns {total, clock, timings, sounds, frame(ctx, t), beats: [{ref, t, path}] (every phrase resolved, and the
 *          recipe entry that named it), strings: [keys used], notes: [the director's notes as applied],
 *          regionsAt(t) → [{box, path, label}] (what is drawn where), pointAt(t, x, y) → {frame, world?}}
 */
export async function compileFilm({storyboard, board, timings, recipe, data, capture, kits = [], theme, root = process.cwd(), strings = null, hostKeys = []}) {
  storyboard ??= board; data ??= capture ?? null;
  checkRecipeKeys(recipe, hostKeys);
  const used = new Set(); recipe = withStrings(recipe, strings, used);
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
  // Files the recipe names load only from inside root (files.mjs · insideRoot: real paths, so no link leads out).
  const within = file => insideRoot(root, file);
  const allKits = [whiteboardKit, ...kits];
  const storyKits = Object.fromEntries(allKits.filter(k => k.story).map(k => [k.name, k.story]));
  const stageKits = Object.fromEntries(allKits.flatMap(k => Object.entries(k.stages ?? {})));
  const stageKitNames = Object.fromEntries(allKits.flatMap(k => Object.keys(k.stages ?? {}).map(type => [type, k.name])));
  const worldKits = new Set();
  // What a context kit gets (kitContext); every world's `ready`, settled before recalls are drawn (readyWorlds).
  const context = kitContext({clock, motion, theme: paper, root}), readies = [];
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

  // The story: its kit draws the opening world on a sheet (1600×900) that hangs on the paper.
  const storySpec = recipe.story ?? {kit: 'whiteboard', ...recipe.whiteboard};
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
    if (!push) st.entrance = entrance(spec.enter, where);
    if (spec.type === 'world') st.world = {...hung(compileWorld(spec.world, where)), kit: spec.world.kit};
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
  const layers = new Map();
  /** A canvas the size of ctx's frame in device pixels (for a fade drawn at full resolution). */
  function layerFor(m) {
    const w = Math.ceil(1600 * Math.abs(m.a)), h = Math.ceil(900 * Math.abs(m.d)), key = `${w}x${h}`;
    if (!layers.has(key)) layers.set(key, createCanvas(w, h));
    return layers.get(key);
  }
  /** The shot that is arriving, over the one leaving: a fade, a wipe (left to right) or an iris. */
  function drawEntering(ctx, shot, t, e) {
    const {type, at: [cx, cy]} = shot.enter;
    if (type === 'fade') {
      const m = ctx.getTransform(), layer = layerFor(m), lc = layer.getContext('2d');
      lc.resetTransform(); lc.clearRect(0, 0, layer.width, layer.height); lc.setTransform(m.a, 0, 0, m.d, 0, 0);
      drawShot(lc, shot, t);
      ctx.save(); ctx.globalAlpha *= e; ctx.setTransform(1, 0, 0, 1, m.e, m.f); ctx.drawImage(layer, 0, 0); ctx.restore();
      return;
    }
    if (type === 'page') { drawPageTurn(ctx, shot, t, e); return; }
    ctx.save(); ctx.beginPath();
    if (type === 'wipe') ctx.rect(0, 0, 1600 * e, 900);
    else ctx.arc(cx, cy, e * Math.hypot(Math.max(cx, 1600 - cx), Math.max(cy, 900 - cy)), 0, Math.PI * 2);
    ctx.clip(); drawShot(ctx, shot, t); ctx.restore();
    // The moving edge, softly shaded so the eye follows it.
    ctx.save();
    if (type === 'wipe') {
      const x = 1600 * e, g = ctx.createLinearGradient(x, 0, x + 40, 0);
      g.addColorStop(0, 'rgba(40,32,20,.22)'); g.addColorStop(1, 'rgba(40,32,20,0)'); ctx.fillStyle = g; ctx.fillRect(x, 0, 40, 900);
    } else {
      ctx.strokeStyle = 'rgba(40,32,20,.28)'; ctx.lineWidth = 8; ctx.beginPath();
      ctx.arc(cx, cy, e * Math.hypot(Math.max(cx, 1600 - cx), Math.max(cy, 900 - cy)), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  /**
   * A page turn: the old shot is a page lifting from its right edge and folding over to the left.
   * Right of the fold, the new shot is uncovered (in the lifting page's shadow); left of it, the
   * page's back — paper, darker at the fold; further left, what is still flat of the old page.
   */
  function drawPageTurn(ctx, shot, t, e) {
    const f = 1600 * (1 - e), back = Math.max(0, 2 * f - 1600), paperBack = paper.palette.card ?? paper.palette.bg;
    ctx.save(); ctx.beginPath(); ctx.rect(f, 0, 1600 - f, 900); ctx.clip(); drawShot(ctx, shot, t); ctx.restore();
    ctx.save();
    const shade = ctx.createLinearGradient(f, 0, f + 80, 0); shade.addColorStop(0, 'rgba(30,20,10,.3)'); shade.addColorStop(1, 'rgba(30,20,10,0)');
    ctx.fillStyle = shade; ctx.fillRect(f, 0, 80, 900);
    if (f > back) {
      ctx.fillStyle = paperBack; ctx.fillRect(back, 0, f - back, 900);
      const curl = ctx.createLinearGradient(back, 0, f, 0);
      curl.addColorStop(0, 'rgba(255,255,255,.35)'); curl.addColorStop(.7, 'rgba(60,40,20,.06)'); curl.addColorStop(1, 'rgba(60,40,20,.28)');
      ctx.fillStyle = curl; ctx.fillRect(back, 0, f - back, 900);
      ctx.strokeStyle = 'rgba(60,40,20,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(back, 0); ctx.lineTo(back, 900); ctx.stroke();
    }
    ctx.restore();
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
    drawShot(ctx, shots[j - 1], t);
    drawEntering(ctx, shot, t, ease(u));
  }

  /** The whole film at t, drawn into ctx whose transform maps 1600×900 onto the frame. */
  function frame(ctx, t) {
    if (teaser && t >= teaser.at) { drawTeaser(ctx, t); return; }
    // A director's push moves the camera over the picture; the guess cards stay where they are.
    const cam = pushAt(pushes, t);
    if (cam) { ctx.save(); aim(ctx, cam); }
    if (push) drawPushed(ctx, t); else drawShots(ctx, t);
    if (cam) ctx.restore();
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
  const pushes = placePushes(notes.pushes, {clock, speed: notes.speed, changes: pictureChanges(), spotlight: spotlightAt, total: clock.total});

  // Reading time (reading.mjs): every line meant to be read stays up, whole, long enough to read.
  const readingRule = readingMode(recipe.reading), reading = tooShortToRead(readableLines());
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
  for (const shot of shots.slice(1)) if (shot.enter.type !== 'fade' && shot.enter.type !== 'cut') add(shot.start - shot.enter.lead, 'slide');
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
    const shot = shots[shotAt(t)], st = shot.world && stages.find(s => s.world === shot.world);
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
    for (const r of st.kit?.regions?.(st.handle, t, push ? kitCardBox() : null) ?? []) out.push({box: r.box, path: `${sp}.${r.path}`, label: r.label ?? ''});
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
    const out = [], world = worldOnScreen(t);
    if (world) {
      out.push({box: through(world.view, [0, 0, 1600, 900]), path: world.path, label: `the ${world.w.kit} world`});
      for (const r of world.w.instance.regionsAt?.(Math.min(t, world.until)) ?? []) out.push({box: through(world.view, r.box), path: `${world.path}.${r.path}`, label: r.label ?? ''});
    } else if (push) {
      const now = stateAt(t);
      if (now.fade > 0) out.push(...cardRegions(t, now));
      for (const [st] of now.shown) out.push(...stageRegions(st, t));
    } else {
      const shot = shots[shotAt(t)];
      shot.stages.forEach((st, k) => { const next = shot.stages[k + 1]; if (Math.min(k === 0 ? 1 : into(st, t, .2, .45), next ? 1 - into(next, t, .65, .45) : 1) > 0) out.push(...stageRegions(st, t)); });
    }
    const cam = pushAt(pushes, t), seen = cam ? out.map(r => ({...r, box: through(about(cam), r.box)})) : out;
    guesses.forEach((g, n) => { if (t >= g.start && t <= g.until + .5) seen.push({box: guessBox(g, t), path: `guesses[${n}]`, label: g.question}); });
    return seen;
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

  // A poster: the recipe's chosen frame (a phrase), for the thumbnail (renderFilm bakes it in as frame 0).
  const posterAt = recipe.poster === undefined ? null : clock.at(recipe.poster);

  // The notes as applied, in the order written: the making-of record says what each one changed.
  const applied = new Map();
  if (notes.speedNote) applied.set(notes.speedNote, {note: notes.speedNote.note, speed: notes.speed, ...(push ? {pushIn: {seconds: +TURN.toFixed(3), was: push.turn ?? 1}} : {}), worlds: [...worldKits], pushes: pushes.length});
  for (const st of stages) if (st.cutNote) applied.set(st.cutNote, {note: st.cutNote.note, cut: st.scene, at: +st.start.toFixed(3), was: st.cutWas});
  for (const p of pushes) applied.set(p.given, {note: p.note, push: {at: p.at, zoom: p.zoom}, from: +p.a.toFixed(3), to: +p.b.toFixed(3), seconds: +p.seconds.toFixed(3)});
  const notesApplied = (recipe.notes ?? []).map(n => applied.get(n));

  // Recall images: the film's own frames, reused in the recap so the viewer sees what they saw. Every
  // world is ready first (its images decoded), so a recall keeps the loaded picture and so does the film.
  await readyWorlds(readies);
  for (const [name, ref] of Object.entries(recipe.recalls ?? {})) {
    const c = createCanvas(1600, 900); frame(c.getContext('2d'), clock.at(ref)); recalls[name] = c;
  }
  return {total: clock.total, clock, timings, sounds, frame, beats, strings: [...used], notes: notesApplied, reading, posterAt, moments, regionsAt, pointAt};
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
