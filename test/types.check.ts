// Checked by test/types.test.mjs with tsc: what the types accept, and what they refuse.
import type {Recipe, DirectorNote, Film, Kit, ContextKit, KitContext, Loudness, Storyboard, frameHashes, compileFilm, CameraMove} from '../types/index.js';
import type {startStudio} from '../types/studio.js';
import type {coverZoom, speedRamp, layersAt, readCameraMove} from '../types/sub/camera.js';
import type {settleTime} from '../types/sub/motion.js';
import type {view} from '../types/sub/regions.js';
import {sliceForKey, keysReadFromExecutionTree} from 'foottrace';

const notes: DirectorNote[] = [
  {note: 'The zooms feel rushed', speed: .7},
  {note: 'Hard cut into the loop', cut: 'inside'},
  {note: 'Push in on the card', push: {at: [380, 490], zoom: 1.3, from: ['build', 'The order line'], to: ['build', 'The policy line']}},
];
export const recipe: Recipe = {story: {kit: 'whiteboard', items: []}, notes, reading: 'refuse', poster: ['summary', 'What to keep', 1]};
// Camera moves by name: a beat or seconds, an ease or a feel, each move's own settings.
export const camera: CameraMove[] = [
  {move: 'dolly-in', at: ['leak', 'leaves the building'], until: ['leak', 'the door'], on: 'database', amount: 1.4},
  {move: 'dutch', at: 12.5, seconds: 1, amount: 6, feel: 'heavy'},
  {move: 'rack-focus', at: ['turn', 'look'], from: 'hills', on: 'shepherd'},
  {move: 'handheld', at: ['turn', 'Stop'], amount: 5, seed: 2},
  {move: 'freeze', at: ['turn', 'Stop'], seconds: 1.5},
];
export const moving: Recipe = {...recipe, camera};
export const reduced = (make: typeof compileFilm, board: Storyboard, timings: Parameters<typeof compileFilm>[0]['timings']) => make({storyboard: board, timings, recipe: moving, reducedMotion: true});
export const zoomAt = (film: Film, t: number): number => film.cameraAt?.(t)?.z ?? 1;
export const played = (film: Film): string[] => film.camera?.moves.map(m => `${m.move}: ${m.played}`) ?? [];
export const layered: Kit = {name: 'layered', story: {compile: () => ({draw: () => {}, layers: [{name: 'sky', depth: 8}, {name: 'hero', depth: 1}], drawLayer: (ctx, t, name) => {}})}};
export const covering = (cover: typeof coverZoom, ramp: typeof speedRamp, settle: typeof settleTime): number => cover({x: 600, y: 450, r: .1}) + ramp(.5, .3) + settle('heavy');
export const rolled = (v: typeof view) => v(1.2, -40, -20, .1).r;
export const blurOf = (layers: typeof layersAt) => layers([{name: 'sky', depth: 8}], {focus: 1, blur: 8})[0].blur;
export const placed = (read: typeof readCameraMove) => read({move: 'pan', at: 2}, 'camera[0]', {at: () => 0, total: 10}).until;
// @ts-expect-error a freeze takes no ease
export const easedFreeze: CameraMove = {move: 'freeze', at: 3, ease: 'out'};
// @ts-expect-error a track follows a named thing
export const lostTrack: CameraMove = {move: 'track', at: 3};
// @ts-expect-error an ease or a feel, not both
export const twoEases: CameraMove = {move: 'pan', at: 3, ease: 'out', feel: 'heavy'};
// @ts-expect-error a whip pan is a transition, not a camera move
export const whip: CameraMove = {move: 'whip', at: 3};
export const kit: Kit = {name: 'plain', story: {motion: ['cameraSpeed'], compile: () => ({hang: 1, draw: () => {}})}};
export const seconds = (film: Film): number => film.total + film.moments().length + film.reading.length;
export type Studio = typeof startStudio;
export const doorKit: Kit = {name: 'door', story: {compile: () => ({draw: () => {}, sounds: [{time: 1, type: 'door', gain: .45}]})}};
export type HostKeys = Parameters<typeof compileFilm>[0]['hostKeys'];
// The compile record: its narrative and snapshot are footprintjs's own types.
export const firstStage = (film: Film): string | undefined => film.record?.narrative.find(e => e.type === 'stage')?.stageId;
export const commits = (film: Film): number => film.record?.snapshot.commitLog.length ?? 0;
// The engine owns the snapshot; the independent record reader accepts it without casts or adapters.
export const sliceRecord = (film: Film, key: string) => film.record
  ? sliceForKey(film.record.snapshot.commitLog, key, keysReadFromExecutionTree(film.record.snapshot.executionTree))
  : undefined;
export const recorded = (film: typeof compileFilm, board: Storyboard, timings: Parameters<typeof compileFilm>[0]['timings']) => film({storyboard: board, timings, recipe: {}, record: true});
export const atMoments = (film: Film, hash: typeof frameHashes) => hash(film, {times: film.moments().map(m => m.t), width: 320});

export const silent: Loudness = {type: 'skipped', target: {I: -16, TP: -1.5}, measured: {I: null, TP: null, LRA: 0, thresh: -70, offset: null}, reason: 'the audio is silent'};

// @ts-expect-error record is true or false
export const recordWord = (film: typeof compileFilm, board: Storyboard, timings: Parameters<typeof compileFilm>[0]['timings']) => film({storyboard: board, timings, recipe: {}, record: 'yes'});
// @ts-expect-error a narrative entry keeps no live raw value
export const raw = (film: Film) => film.record?.narrative[0].rawValue;
// @ts-expect-error a note needs its words
export const noWords: DirectorNote = {cut: 'inside'};
// @ts-expect-error reading is 'report' or 'refuse'
export const strict: Recipe = {reading: 'strict'};
// @ts-expect-error frameHashes times are seconds, not labels
export const labelTimes = (film: Film, hash: typeof frameHashes) => hash(film, {times: ['settled']});
// @ts-expect-error frameHashes takes count or times, not both
export const bothKinds = (film: Film, hash: typeof frameHashes) => hash(film, {count: 5, times: [1]});
// @ts-expect-error a sound is one of the named sounds
export const boomKit: Kit = {name: 'boom', story: {compile: () => ({draw: () => {}, sounds: [{time: 1, type: 'boom'}]})}};
// @ts-expect-error a push needs from and to
export const halfPush: DirectorNote = {note: 'push', push: {at: [1, 2]}};

// @ts-expect-error the normalization type is linear, dynamic or skipped
export const loud: Loudness = {type: 'loud', target: {I: -16, TP: -1.5}, measured: {I: -20, TP: -3, LRA: 4, thresh: -30, offset: 0}};

// A scene is spoken or silent (directions: [text, seconds]), never both.
export const board: Storyboard = {scenes: [{id: 'open', silent: [['the door opens', 1], ['Mia walks to the stall', 3]]}, {id: 'stall', narration: 'Mia counts her cups.'}]};
// @ts-expect-error a scene with narration cannot carry directions too
export const both: Storyboard = {scenes: [{id: 'open', narration: 'Hello.', silent: [['the door opens', 1]]}]};
// @ts-expect-error a direction is [text, seconds], not an object
export const objectDirection: Storyboard = {scenes: [{id: 'open', silent: [{text: 'the door opens', seconds: 1}]}]};

// A story kit on the context contract gets one context object; its world may say when it is ready.
export const contextKit: ContextKit = {name: 'pictures', story: {context: true, compile: (spec, context: KitContext) => {
  const bytes: Uint8Array = context.readFile(String(spec.src)), real: string = context.insideRoot('pics/cup.png');
  return {hang: 1, ready: Promise.resolve(bytes.length + real.length), draw: () => {}};
}}};
// @ts-expect-error a context kit's compile takes the context, not (spec, clock, motion)
export const mixedKit: ContextKit = {name: 'mixed', story: {context: true, compile: (spec: unknown, clock: {at(b: unknown): number}, motion: {cameraSpeed: number}) => ({draw: () => {}})}};
// @ts-expect-error ready is a Promise
export const eagerKit: Kit = {name: 'eager', story: {compile: () => ({draw: () => {}, ready: true})}};
// Both contracts go to compileFilm side by side; an old kit written inline keeps its contextual types.
export type BothKits = Parameters<typeof compileFilm>[0]['kits'];
export const bothKits: BothKits = [contextKit, doorKit];
export const inline = (film: typeof compileFilm, board: Storyboard, timings: Parameters<typeof compileFilm>[0]['timings']) =>
  film({storyboard: board, timings, recipe, kits: [{name: 'inline', story: {compile: (spec, clock) => ({draw: () => {}, sounds: [{time: clock.at(['a', 'b']), type: 'tap'}]})}}]});
// @ts-expect-error a context kit says so: context: true
export const unsaid: ContextKit = {name: 'unsaid', story: {compile: (spec: unknown, context: KitContext) => ({draw: () => {}})}};
// @ts-expect-error the context cannot be changed
export const writeContext = (context: KitContext) => { context.root = '/'; };

// The documented subpaths carry types too.
import type {makeClock, checkScene} from '../types/sub/clock.js';
import type {hitTest, View} from '../types/sub/regions.js';
import type {tooShortToRead} from '../types/sub/reading.js';
import type {compileWhiteboard, Board} from '../types/sub/whiteboard.js';
import type {compileCartoon} from '../types/sub/cartoon.js';
import type {paceTimings, shiftWords} from '../types/sub/pacing.js';
import type {EASES, easeNamed, Ease, EaseName} from '../types/sub/ease.js';
export type Subpaths = [typeof makeClock, typeof checkScene, typeof hitTest, View, typeof tooShortToRead, typeof compileWhiteboard, Board, typeof compileCartoon, typeof paceTimings, typeof shiftWords, typeof EASES, typeof easeNamed, Ease, EaseName];
export const backEase = (table: typeof EASES): Ease => table.back;
export const springEase = (table: typeof EASES): Ease => table.spring;
export const bounceEase = (table: typeof EASES): Ease => table.bounce;
// @ts-expect-error wobble is not in the table
export const wobbleEase = (table: typeof EASES): Ease => table.wobble;

// Formats: a layout per platform; caption files beside the video.
import type {Layout, Enter, Transition, renderFilm as RenderFilm, transitionCatalog as Catalog} from '../types/index.js';
export const shorts: Layout = {format: 'vertical', header: {title: 'Yes, No, or Not Enough Evidence', sub: 'a talk'}, captions: {maxWords: 4}, crop: [{at: ['agent', 'answers yes'], x: 1200}, {at: ['title', 'Yes'], x: 800, width: 1600}]};
export const feed: Layout = {format: 'square', captions: true, background: '#f3eee3'};
export const versions = (render: typeof RenderFilm, film: Film, board: Storyboard) => render({film, storyboard: board, timings: film.timings, out: 'out/shorts.mp4', layout: shorts, motionBlur: {subframes: 6}, captionFiles: ['vtt']});
export const paper = (film: Film): unknown => film.theme;
// @ts-expect-error the formats are landscape, square, portrait and vertical
export const tiktok: Layout = {format: 'tiktok'};
// @ts-expect-error a crop key is {at, x}
export const cropAt: Layout = {format: 'vertical', crop: [{at: ['a', 'b'], y: 300}]};
// @ts-expect-error caption files are vtt or srt
export const ass = (render: typeof RenderFilm, film: Film, board: Storyboard) => render({film, storyboard: board, timings: film.timings, out: 'x.mp4', captionFiles: ['ass']});
export const master = (render: typeof RenderFilm, film: Film, board: Storyboard) => render({film, storyboard: board, timings: film.timings, out: 'x.mp4', layout: {format: 'landscape', scale: 2}, quality: 'high'});
export const draftPart = (render: typeof RenderFilm, film: Film, board: Storyboard) => render({film, storyboard: board, timings: film.timings, out: 'x.mp4', part: {scenes: ['talk'], handles: 1}, layout: {format: 'landscape', scale: .5}, quality: 'draft'});
// @ts-expect-error quality is 'standard' or 'high'
export const ultra = (render: typeof RenderFilm, film: Film, board: Storyboard) => render({film, storyboard: board, timings: film.timings, out: 'x.mp4', quality: 'ultra'});

// Transitions: a name, or a name with settings; a kit adds its own.
export const entrances: Enter[] = ['push', {type: 'wipe', from: 'top', seconds: .6}, {type: 'whip', sound: false}, {type: 'iris', at: [800, 420]}, 'curtain'];
const curtain: Transition = {family: 'theatre', seconds: 1.2, ease: 'inOut', sound: 'whoosh', params: {color: {color: true, default: '#7a1020'}},
  draw: (ctx, {e, from, to, p}) => { (e < .5 ? from : to)(ctx); void p.color; }};
export const stageKit: Kit = {name: 'stage', transitions: {curtain}};
export const names = (catalog: typeof Catalog): string[] => Object.keys(catalog([stageKit]));
export const withEnter: Recipe = {story: {kit: 'red'}, stages: [{type: 'world', scene: 'b', enter: {type: 'push', from: 'left'}, world: {kit: 'blue'}}]};
// @ts-expect-error a push comes from left, right, top or bottom
export const north: Enter = {type: 'push', from: 'north'};
// @ts-expect-error a transition's ease is a name from the ease table
export const wobble: Transition = {...curtain, ease: 'wobble'};
// @ts-expect-error a transition draws
export const noDraw: Transition = {family: 'x', seconds: 1, ease: 'inOut', sound: null};
// The paper transitions: names, a seed for a ragged edge, a ring's size, a morph's boxes, a colour that is the theme's.
export const paperEntrances: Enter[] = ['torn', {type: 'torn', direction: 'left', drift: 40, seed: 3}, {type: 'inkBleed', at: [1400, 200], color: null}, {type: 'ringIris', at: [1060, 400], radius: 120, width: 20, accent: '#1e7a4c'},
  {type: 'glassSheet', from: 'bottom', tint: '#c8e0ff'}, {type: 'curl', corner: 'top-left'}, {type: 'fold', line: 'vertical'}, {type: 'eraser', color: '#334455'}, {type: 'morph', fromBox: [0, 0, 400, 300], toBox: [0, 0, 1600, 900]}];
export const boxed: Transition = {...curtain, params: {frame: {box: true, default: [0, 0, 100, 100]}, ink: {color: true, default: null}}};
// @ts-expect-error a curl lifts from a corner
export const curlNorth: Enter = {type: 'curl', corner: 'north'};
// @ts-expect-error a box is four numbers
export const shortBox: Enter = {type: 'morph', fromBox: [0, 0, 400]};
// A thought: a world in a thought cloud, and the burst that ends it; a kit's transition says where its sound lands.
export const remembered: Recipe = {story: {kit: 'draws', frame: 'thought'}, stages: [
  {type: 'world', scene: 'dream', frame: {type: 'thought', corner: 'bottom-right', size: .75, seed: 9, color: null, ink: '#1b1f27'}, world: {kit: 'draws'}},
  {type: 'world', scene: 'now', enter: {type: 'cloudBurst', corner: 'bottom-right', size: .75, seed: 9, sound: {type: 'found', name: 'bubble-pop'}}, world: {kit: 'draws'}}]};
export const popping: Transition = {...curtain, hitAt: .3};
export const darkened: Recipe = {story: {kit: 'draws', frame: {type: 'thought', backdrop: '#111111'}}, stages: [
  {type: 'world', scene: 'dream', frame: {type: 'thought', backdrop: {color: '#2b2622', vignette: .6}}, world: {kit: 'draws'}}]};
// @ts-expect-error a backdrop's colour is its color
export const colourBackdrop: Recipe = {story: {kit: 'draws', frame: {type: 'thought', backdrop: {colour: '#111111'}}}};
// @ts-expect-error the trail points to a corner
export const northCloud: Recipe = {story: {kit: 'draws', frame: {type: 'thought', corner: 'north'}}};
// @ts-expect-error a thought cloud is the one frame there is
export const dreamFrame: Recipe = {story: {kit: 'draws', frame: 'dream'}};

// The shot plan: what each shot is for, and the facts it starts and ends with; framing by name; gaze.
export const planned: Recipe = {
  story: {kit: 'whiteboard', items: [], intent: 'Open on the question.', continuity: {end: {order: 'none'}}},
  stages: [{type: 'world', scene: 'race', intent: 'Show the app refusing a stale offer.', continuity: {start: {order: 'none', size: 'M'}, end: {size: 'L'}}, world: {kit: 'second'}}],
  watching: 'refuse',
};
export const closeOn: DirectorNote = {note: 'Close on the robot', push: {on: 'robot', size: 'close', from: ['click', 'How do I know'], to: ['click', 'done']}};
export const looking = (film: Film): string | null => film.clock.gaze(1, 'user')?.at ?? null;
export const firstIntent = (film: Film): string | null => film.shots[0].intent;
export const bursts = (film: Film): number => film.watching.filter(w => w.kind === 'burst').length;
// @ts-expect-error a framing is medium, close or insert
export const wide: DirectorNote = {note: 'wide', push: {on: 'robot', size: 'wide', from: ['a', 'b'], to: ['a', 'c']}};
// @ts-expect-error a fact is a word, a number or true/false
export const listFact: Recipe = {stages: [{type: 'world', scene: 'x', continuity: {start: {sizes: ['M']}}}]};
// @ts-expect-error watching is 'report' or 'refuse'
export const loud: Recipe = {watching: 'loud'};
// @ts-expect-error a push aims at a point or a named thing, not both
export const both: DirectorNote = {note: 'both', push: {at: [1, 2], on: 'robot', from: ['a', 'b'], to: ['a', 'c']}};
export const blend = (film: Film): number => film.clock.gaze(1, 'user')?.also?.amount ?? 0;

// Re-render only what changed: a segmented picture strategy, its store and its report.
import {segmentedVideo, folderStore, wholeVideo as whole, planSegments, codeFingerprint} from '../types/sub/segments.js';
import type {SegmentsReport} from '../types/index.js';
export const segmented = (recipe: Recipe) => segmentedVideo({store: folderStore('work/segments'), recipe, code: codeFingerprint(['film/kits']), force: [2, 'race'], parallel: 2});
export const onePass = whole();
export const rows = (film: Film): number => film.rows.filter(r => r.enter?.type === 'iris').length + planSegments(film, {fps: 30}).length;
export const reusedOf = (r: SegmentsReport): number => r.segments.filter(s => s.status === 'reused').length + r.reused;
// @ts-expect-error a segmented render needs a store
export const noStore = segmentedVideo({recipe: {}});
// Pieces by default: the cache's options, whole for debugging, one line to read, a kit that says where its code lives.
import {planPieces, pictureLine, kitCode, drawingCode} from '../types/sub/segments.js';
import {renderFilm as renderPieces} from '../types/sub/render.js';
import type {Timings} from '../types/index.js';
export const draft = (film: Film, storyboard: Storyboard, timings: Timings) => renderPieces({film, storyboard, timings, out: 'out/draft.mp4', stamp: 'DRAFT · v4', segments: {cap: 2 * 1024 ** 3, chunkSeconds: 8, parallel: 4, kitsCode: 'fp'}});
export const debug = (film: Film, storyboard: Storyboard, timings: Timings) => renderPieces({film, storyboard, timings, out: 'out/whole.mp4', whole: true});
export const pictureSaid = (r: SegmentsReport): string => `${pictureLine(r)} ${pictureLine(r, {full: true})} ${r.line}`;
export const pieces = (film: Film): string[] => planPieces(film, {chunkSeconds: 6}).map(p => `${p.label} ${p.slot} ${p.enters.join(',')}`);
export const shotsKit: Kit = {name: 'shots', story: {compile: () => ({hang: 1, draw: () => {}})}, sources: {entry: spec => [new URL(`./shots/${spec.shot}.mjs`, 'file:///kit/')], shared: ['kit/index.mjs']}};
export const perPiece = (film: Film) => kitCode(film, {fallback: 'fp'})([], {paths: ['story']});
export const core: string = drawingCode().core;
// @ts-expect-error whole is true or left out
export const wholeYes = (film: Film, storyboard: Storyboard, timings: Timings) => renderPieces({film, storyboard, timings, out: 'x.mp4', whole: 'yes'});
// @ts-expect-error force names segments by index or scene id
export const badForce = segmentedVideo({store: folderStore('x'), recipe: {}, force: [true]});

// The approval lock.
import {approveFilm as approve, checkApproval as check} from '../types/sub/approval.js';
export const approved = (film: Film) => check(approve({record: 'out/draft/making-of.json', by: 'S'}), film.inputs).ok;
export const fromObject = (film: Film) => approve({record: {inputs: film.inputs, out: 'draft.mp4'}, by: 'S', note: 'final'}).inputs.files;
// @ts-expect-error an approval says who approves it
export const anonymous = () => approve({record: 'out/draft/making-of.json'});
// @ts-expect-error an approval is made from a render's record, not from the storyboard and recipe
export const fromParts = (storyboard: Storyboard, recipe: Recipe) => approve({storyboard, recipe, by: 'S'});

// Number slots: the voice says words, the captions show digits.
import {spokenText, unsaidNumbers} from '../types/index.js';
export const slotted: Storyboard = {scenes: [{id: 'frame', narration: 'One frame is 16.67 ms.', say: [['16.67 ms', 'sixteen point six seven milliseconds']]}]};
export const said = spokenText(slotted.scenes[0]) + unsaidNumbers(slotted).length;
// @ts-expect-error a slot is a pair [shown, spoken]
export const halfSlot: Storyboard = {scenes: [{id: 'x', narration: 'A 2.', say: [['2']]}]};

// Declared reads and the letters pace.
export const withReads: Recipe = {stages: [{type: 'world', scene: 'loop', reads: [{what: 'the loop turns', at: ['loop', 'That is a loop'], min: 2.5, region: 'ring'}], world: {kit: 'draws'}}], reading: {rule: 'report', pace: 'letters'}};
export const problems = (film: Film): string[] => film.reads.flatMap(r => (r.problem ? [r.problem] : []));
// @ts-expect-error the reading pace is words or letters
export const fastPace: Recipe = {reading: {pace: 'fast'}};

// Acting: mood changes acted, an idle layer, a head that follows the eyes.
import {moodAt, idleAt, follows, ACTING} from '../types/sub/acting.js';
export const acted = moodAt([{at: 0, mood: 'calm'}, {at: 2, mood: 'surprised', take: .6}], 2.1, {overshoot: ACTING.overshoot});
export const squint: number = Math.max(acted.anticipation, idleAt(2.1, {seed: 3}).blink);
export const head: (t: number) => number = follows((t: number) => t * 2, .2);
// @ts-expect-error a mood key names its mood
export const noMood = moodAt([{at: 0}], 1);

// Through a named thing: the two match transitions, and a kit's own that looks for things in the pictures.
export const throughs: Enter[] = [{type: 'through', region: 'window'}, {type: 'through', region: 'ring', shape: 'round'}, {type: 'match', region: 'ring', into: 'loop'}];
export const portal: Transition = {family: 'match', seconds: 1, ease: 'inOut', sound: null, params: {region: {name: true}, into: {name: true, default: null}},
  regions: p => ({from: [String(p.region)]}), draw(ctx, {e, from, to, boxes}) { const [x0] = boxes.from.window ?? [0]; (e < .5 ? from : to)(ctx); ctx.fillRect(x0, 0, 1, 1); }};
// @ts-expect-error a through's opening is a box or round
export const oval: Enter = {type: 'through', region: 'ring', shape: 'oval'};
// @ts-expect-error a name setting's default is a name or null
export const badName: Transition = {...portal, params: {region: {name: true, default: 3}}};

// The reading paces, the reads checks and the clock's shown words, as typed.
import {LETTERS, READING, secondsToRead, readingPace, lettersIn} from '../types/sub/reading.js';
import {READS, readReads, checkReads} from '../types/sub/shots.js';
export const paces = [secondsToRead('change the picture', LETTERS), secondsToRead('a line', READING), secondsToRead('x', readingPace({pace: 'letters'})), lettersIn('ab')];
export const checked = checkReads(readReads([{what: 'the ring', at: ['loop', 'turns'], min: READS.min}], 'x').map(r => ({...r, t: 1})), {from: 0, to: 9, where: 'x'}).map(r => r.problem ?? r.what);
export const shown = (film: Film) => film.clock.shownWords(0).map(w => w.text);
// @ts-expect-error a pace is words or letters
export const badPace = secondsToRead('x', {perSyllable: 1});

// Checks on the finished file.
import {checkVideo, FINISHED_CHECK_NAMES} from '../types/index.js';
import {ffmpegProbe, FINISHED} from '../types/sub/finished.js';
export const finishedOk = async (film: Film) => (await checkVideo({file: 'out/film.mp4', film, voiced: true, expect: {seconds: 240, tolerance: 5}, checks: ['flash', 'voice'], probe: ffmpegProbe()})).ok;
export const thresholds = FINISHED.change + FINISHED_CHECK_NAMES.length;
// @ts-expect-error the checks are named
export const badCheck = checkVideo({file: 'x.mp4', checks: ['wobble']});

// Lips in sync: a world that says where its mouths are, drawn with the library's mouth.
import {mouthAt} from '../types/sub/acting.js';
export const talkingWorld = (clock: Parameters<typeof mouthAt>[0]): import('../types/index.js').StoryWorld => ({draw: () => {}, mouthsAt: t => [{who: 'robot', open: mouthAt(clock, t, 'robot')}]});
export const mouthsNow = (film: Film) => film.mouthsAt(1).map(m => m.who);

// Listening: what the sound asks of the ear.
import {changeSounds, effectsUnderVoice} from '../types/sub/listening.js';
export const heard = (film: Film) => [...film.listening, ...changeSounds([{at: 1, where: 'stage a', sound: 'whoosh'}]), effectsUnderVoice({voice: -16, effects: null})].length;
export const quietFilm: Recipe = {listening: 'refuse'};
// @ts-expect-error listening is report or refuse
export const loudFilm: Recipe = {listening: 'loud'};

// Review (types/sub/review.d.ts): a part read as text; a check of your own has the same shape.
import type {ReviewCheck} from '../types/sub/review.js';
export const mineCheck: ReviewCheck = {label: 'The title is there', when: () => true, find: ({samples}) => samples.filter(s => !s.words.length).map(s => ({kind: 'empty', t: s.t, what: 'no words'}))};
// A check sees the part itself (no handles), the frozen stretches, and which checks run beside it.
export const frozenCheck: ReviewCheck = {label: 'Frozen', when: () => true, find: ({part, frozen, picked}) => picked.includes('still') ? [] : frozen.map(r => ({kind: 'frozen', t: Math.max(r.from, part.from), what: `frozen until ${r.to}`}))};
// @ts-expect-error a check finds with find(review)
export const badCheck: ReviewCheck = {label: 'x', when: () => true};
// Release (types/sub/release.d.ts): targets by name, with options, or an adapter of your own; a post says who it is for.
import type {ReleaseAdapter, ReleaseTarget, ReleasePost} from '../types/sub/release.js';
const mine: ReleaseAdapter = {name: 'mine', label: 'Mine', video: {format: 'square', captions: true}, limits: {seconds: {max: 60}, text: {text: {max: 500}}},
  audience: {minAge: 13, kids: 'refuse'}, thumbnail: null, facts: {checked: '2026-10-02', sources: []}, post: p => ({text: p.title})};
export const targets: ReleaseTarget[] = ['youtube', {target: 'youtube-shorts', from: 0, to: 60}, mine];
export const teaser: ReleasePost = {title: 'Pebbles', audience: 'general'};
export const big: ReleaseTarget = {target: 'youtube', scale: 2};
export const framed: ReleaseAdapter = {...mine, limits: {seconds: {max: 60}, frame: [{width: 1920, height: 1200}, {width: 1200, height: 1900}]}};
export const counted: ReleaseTarget = {target: 'x', limits: {text: {text: {count: (s: string) => [...s].length}}}};
// @ts-expect-error a frame is {width, height}
export const halfFramed: ReleaseTarget = {target: 'x', limits: {frame: [{width: 1920}]}};
export const voiced: ReleasePost = {title: 'Pebbles', audience: 'general', thumbnail: 'poster', synthetic: ['voice']};
// @ts-expect-error synthetic is a list of words
export const voicedWrong: ReleasePost = {title: 'Pebbles', audience: 'general', synthetic: 'voice'};
// @ts-expect-error an audience is 'kids' or 'general'
export const wrong: ReleasePost = {title: 'Pebbles', audience: 'everyone'};

// The cast: a role's name and the look a kit reads; a context kit reads it as context.cast.
import type {Cast, KitContext as CastContext} from '../types/index.js';
export const heroDress = (ctx: CastContext): unknown => ctx.cast?.hero?.dress;
export const cast: Cast = {hero: {name: 'Amaira', outfit: 'stripes'}};
// @ts-expect-error a role needs its name
export const nameless: Cast = {hero: {outfit: 'stripes'}};

// Cartoon habits (motion.ts) and walks (walk.ts): a held drawing, a part that swings, a walk's pose.
import {heldTime, follow, lag, TIMING_NAMES} from '../types/sub/motion.js';
import {walk, WALKS, WALK_NAMES, readWalk, type WalkPose, type WalkStyle} from '../types/sub/walk.js';
export const held: number = heldTime(1.23, 'twos', {fps: 30}) + heldTime(1, 3);
export const swingX: number = lag((u: number) => u * 100, 2, {from: 0, feel: 'playful', drag: 5});
export const swingXY: number[] = follow((u: number) => [u * 100, 40], 2, {from: 0});
export const timings: readonly string[] = TIMING_NAMES;
// @ts-expect-error a timing is a name or a number of frames
heldTime(1, 'fours');
const strollWalk = walk({from: 130, to: 1800, start: 13.6, size: 475, style: 'stroll'});
export const pose: WalkPose = strollWalk.at(14);
export const footX: number = pose.feet[0].x + strollWalk.arrive + strollWalk.end + strollWalk.steps;
export const springier: WalkStyle = readWalk({...WALKS.bouncy, bob: .06});
export const walkNames: readonly string[] = WALK_NAMES;
// @ts-expect-error a walk needs the figure's size
walk({from: 0, to: 100, start: 0});

// The beat map (beats.ts) and music under a film (music.ts): a map's questions, the fit's verdicts, the options.
import {beatMap, peakOf, BEATS, type BeatMap} from '../types/sub/beats.js';
import {fitToMusic, MUSIC, type MusicOptions, type MusicCut} from '../types/sub/music.js';
export const mapped: Promise<BeatMap> = beatMap('song.mp3', {bpm: 120, range: [80, 160]});
export const onTheBeat = (map: BeatMap): boolean => map.onBeat(map.nearestBeat(3) ?? 0, BEATS.onBeat) && map.nextBeat(1) !== null && map.drop !== 0;
export const hitAt: number = peakOf('door.wav');
export const musicOptions: MusicOptions = {file: 'song.mp3', gain: .2, snap: {tolerance: MUSIC.tolerance}, dropOn: ['story', 'came home', .5]};
export const fitted = (storyboard: Storyboard, timings: import('../types/index.js').Timings, map: BeatMap): Promise<MusicCut[]> => fitToMusic({storyboard, timings, beats: map, snap: true}).then(f => f.cuts);
// An unsure map cuts only on the beats every candidate shares; the fit says which grid it cut on; bad options carry a code.
import {safeBeats, likelyTempi, beatMapText, backbeatEveryOther, type SafeBeats, type BeatOptionsError} from '../types/sub/beats.js';
export const settleWith = (map: BeatMap): string => `${beatMapText(map, {source: 'theme.mp3'})}\n${likelyTempi(map, BEATS.likely).join(', ')} · ${map.hits.length} hits · ${safeBeats(map).unheard ?? 0} unheard`;
export const tactus = (map: BeatMap): boolean => map.levels.some(l => l.fails.includes('backbeat slower')) || backbeatEveryOther({phase: 1, kicked: 1, steady: 1, backbeat: {phase: 1, covered: .5, alternate: 1}, fill: {2: {full: 0, low: 0}, 3: {full: 0, low: 0}, 4: {full: 0, low: 0}}});
export const cutOnly = (map: BeatMap): readonly number[] => map.sure ? map.beats : safeBeats(map).beats;
export const gridOf = (map: BeatMap): SafeBeats['grid'] => map.verdict === 'tempo-close' ? safeBeats(map, {tolerance: BEATS.safe.tolerance}).grid : 'every beat';
export const fitGrid = (storyboard: Storyboard, timings: import('../types/index.js').Timings, map: BeatMap): Promise<string> => fitToMusic({storyboard, timings, beats: map, snap: true}).then(f => `${f.cutOn.grid}: ${f.cutOn.beats} of ${f.cutOn.of}`);
export const isOptionsError = (e: unknown): e is BeatOptionsError => e instanceof Error && (e as Partial<BeatOptionsError>).code === 'BEAT_OPTIONS';
// @ts-expect-error a verdict is one of the five
export const badVerdict: BeatMap['verdict'] = 'tempo-maybe';
// @ts-expect-error dropOn is a key, not a scene id
export const badDrop: MusicOptions = {file: 'song.mp3', dropOn: 'story'};
// @ts-expect-error soundAt is 'start' or 'peak'
export const badAt: Parameters<typeof RenderFilm>[0]['soundAt'] = 'middle';
// Breakdown (types/sub/breakdown.d.ts): a reference film as a spec; a beat reader is any function that answers {bpm, beats, drop?}.
import {breakdown, BREAKDOWN} from '../types/sub/breakdown.js';
import {beatMap as readTheBeats} from '../types/sub/beats.js';
// The beat map fits the breakdown's reader as it is: its verdict, its candidates' grids and its hits are read by safeBeats.
export const withBeats = breakdown('ref.mp4', {beatMap: readTheBeats, beatOptions: {bpm: 120}}).then(r => r.spec.audio.beats.ran ? `${r.spec.audio.beats.sure} ${r.spec.audio.beats.judged.beats} ${r.spec.audio.beats.cuts.map(c => c.onBeat ?? 'not judged').join()}` : r.spec.audio.beats.why);
import type {BeatReader, BreakdownSpec} from '../types/sub/breakdown.js';
const beats: BeatReader = async () => ({bpm: 120, beats: Object.freeze([0.5, 1]), drop: null, confidence: .8, alternatives: [{bpm: 60, score: .9}]});
const wrapped: BeatReader = (file, {ffmpeg}) => ({bpm: 120, beats: [file.length, ffmpeg.length]});
export const brokenDown = breakdown('ref.mp4', {out: 'ref', beatMap: beats, thresholds: {cutJump: 15}}).then(r => r.spec.shots.map(s => `${s.motion.verdict} ${s.seconds} ${s.in.also?.join() ?? ''}`));
export const viaWrapper = breakdown('ref.mp4', {beatMap: wrapped, beatOptions: {bpm: 120}});
export const measured = (spec: BreakdownSpec): boolean => spec.video.lengthFrom === 'frames';
export const readWhy = (spec: BreakdownSpec): string => spec.read.why.verdict;
// The beat map's options are its own: any it takes are handed on.
export const tempo = breakdown('ref.mp4', {beatMap: beats, beatOptions: {tempo: 120}});
// @ts-expect-error beatOptions are an object
export const bare = breakdown('ref.mp4', {beatMap: beats, beatOptions: 120});
export const onBeat = (spec: BreakdownSpec): number => (spec.audio.beats.ran ? spec.audio.beats.onBeat + (spec.audio.beats.close?.score ?? 0) : 0) + BREAKDOWN.onBeat + spec.warnings.length;
// @ts-expect-error a threshold is a number
export const wordy = breakdown('ref.mp4', {thresholds: {cutJump: 'high'}});
// @ts-expect-error a beat reader answers its beats
export const noBeats: BeatReader = () => ({bpm: 120});

// Four-number curves (ease.ts), the move vocabulary (moves.ts) and the principles (principles.ts).
import {bezier, overshoots, type EaseSpec} from '../types/sub/ease.js';
import {moveAt, movesBy, stagger, readMove, applyMove, MOVES, type Move, type MoveValues} from '../types/sub/moves.js';
import {anticipate, squash, envelope, burst, arc} from '../types/sub/principles.js';
export const css: EaseSpec = 'cubic-bezier(0.16, 1, 0.3, 1)';
export const curve: Ease = bezier(.16, 1, .3, 1);
export const past: boolean = overshoots('outBack') && overshoots(css);
export const kitEase: Transition = {...curtain, ease: 'cubic-bezier(0.2, 0, 0, 1)'};
export const risen: MoveValues = moveAt('soft-rise', 1.2, {start: 1, feel: 'bouncy', reduced: false});
export const sprung: number = moveAt('pop', 1, {feel: {k: 200, d: 12}}).scale + MOVES.pop.seconds;
export const bouncyLogos: readonly Move[] = movesBy({feel: 'bouncy', use: 'logo', kind: 'entrance'});
export const words: number[] = stagger(['one', 'sheep'], 'text-reveal-word').map(w => w.delay);
export const nudge: Move = {name: 'nudge-in', kind: 'entrance', feel: 'crisp', uses: ['ui'], seconds: .3, ease: 'outQuint', props: {x: [30, 0]}};
export const read: Readonly<Move> = readMove(nudge);
export const shows: boolean = applyMove(null, risen, {box: [0, 0, 100, 100]});
export const moveEntrances: Enter[] = [{move: 'soft-rise'}, {move: 'pop', seconds: .6, feel: 'heavy', sound: false}, {move: nudge}];
// @ts-expect-error a move entrance takes no type
export const mixedEnter: Enter = {move: 'pop', type: 'push'};
// @ts-expect-error a move feels smooth, crisp, soft, heavy or bouncy
movesBy({feel: 'snappy'});
// @ts-expect-error a move's kind is entrance, exit, feedback or ambient
export const badMove: Move = {...nudge, kind: 'arrival'};
export const wound: number = anticipate(2, {at: 2, distance: 300});
export const woundXY: number[] = anticipate(2, {at: 2, distance: [300, 40]});
export const squashed: number = squash(1, {velocity: 800, landings: [{at: 1, speed: 1200}], axis: 'y'}).sx;
export const flash: number = envelope(.05, 'flash') + burst(1, [0.9, {at: 1, strength: .5}], {attack: .06, decay: .2});
export const curved: [number, number] = arc([0, 0], [800, 0], .5, {bend: .1, toward: 'up'});
// @ts-expect-error a burst's shape is flash, pop, shake or {attack, decay}
envelope(.1, 'boom');

// Three verdicts (verdict.mjs): no slideshow, parts that hold together, every number with a source.
import {slideshowOf, SLIDESHOW, SLIDESHOW_VERDICT} from '../types/sub/slideshow.js';
import {geometryOf, auditParts, readParts, crosses, GEOMETRY} from '../types/sub/geometry.js';
import {numbersIn, readFacts, exampleScenes, claimsCount, unsourcedClaims, claimText, type Claim} from '../types/sub/claims.js';
import {reviewPart as review, verdictsText, reviewSummary, wordsOnScreen, type VerdictCheck, type ReviewVerdict} from '../types/sub/review.js';
import type {Parts, NumberFact, Verdict} from '../types/index.js';
export const deadShare = (film: Film): number => slideshowOf(film, {every: .25, rule: {...SLIDESHOW, hold: 4, most: .7}}).deadShare;
export const slideRules: readonly unknown[] = SLIDESHOW_VERDICT.rules;
export const limb: Parts = {segments: {arm: {a: [0, 0], b: [10, 0], width: 8, mount: 'body', ends: 'free', contact: false}, foot: {a: [0, 9], b: [3, 9], contact: 'a'}}, regions: {body: [-5, -5, 5, 5]}, apart: [['arm', 'arm']]};
// @ts-expect-error contact names an end: 'a', 'b', or true
export const heeled: Parts = {segments: {foot: {a: [0, 9], b: [3, 9], contact: 'heel'}}};
// @ts-expect-error ends is 'free' or 'mounted'
export const loose: Parts = {segments: {arm: {a: [0, 0], b: [10, 0], ends: 'both'}}};
export const audited: number = auditParts([{t: 0, parts: [{...limb, path: 'story'}]}], GEOMETRY).breaks.length + geometryOf({} as Film).checked.mounts + (crosses([[0, 0], [1, 1]], [[0, 1], [1, 0]]) ? 1 : 0) + Object.keys(readParts(limb, 'story').segments).length;
export const sourced: NumberFact[] = readFacts([{value: 16.67, text: '16.67 ms', source: 'https://example.org'}]);
// @ts-expect-error a fact needs its source
export const unsourcedFact: NumberFact = {value: 1};
export const exampleBoard: Storyboard = {facts: 'facts.json', scenes: [{id: 'a', example: true, narration: 'Say 12 cups.'}, {id: 'b', example: 'Beispieldaten', narration: 'Sag 12.'}]};
export const firstNumber: string = numbersIn('60 Hz')[0] + (exampleScenes(exampleBoard)[0] ?? '');
export const unsourced = (film: Film): string[] => unsourcedClaims(film.claims).map((c: Claim) => claimText(c)).concat(String(claimsCount(film.claims).unsourced));
export const answered = async (film: Film): Promise<Verdict[]> => (await review(film)).verdicts.map((v: ReviewVerdict) => v.verdict);
export const verdictLines = (verdicts: ReviewVerdict[]): string => verdictsText(verdicts);
export const myVerdict: VerdictCheck = {label: 'Short enough', when: () => true, measure: ({window}) => ({measured: {seconds: window.to - window.from}}),
  verdict: {rules: [{when: {seconds: {gt: 600}}, then: 'failed', label: 'longer than ten minutes'}], passed: 'ten minutes or less'}};
// @ts-expect-error a verdict rule's then is passed, failed or not run
export const badVerdict: VerdictCheck = {label: 'x', when: () => true, measure: () => ({measured: {}}), verdict: {rules: [{when: {}, then: 'maybe', label: 'x'}], passed: 'y'}};
export const partsAtNow = (film: Film): number => film.partsAt(1).length + film.lines.length + film.changes.length + (film.claims.facts?.length ?? 0) + film.claims.examples.length + film.claims.labels.length + film.pictureAt(1);
export const stillAll = (film: Film): number => slideshowOf(film).stillShare + slideshowOf(film).stillShots.length + SLIDESHOW.cover + SLIDESHOW.still + GEOMETRY.jump;
// The review's follow-ups: drawn words joined only where they touch (DRAWN), and an example line beside real numbers.
import {drawnLines, DRAWN, lingeringExamples, lingerText} from '../types/sub/claims.js';
import {REVIEW_CHECKS as CHECKS} from '../types/sub/review.js';
export const joined: string = drawnLines([{text: '12', box: [0, 0, 30, 24]}, {text: '30', box: [34, 0, 64, 24]}])[0] + (DRAWN.touch + DRAWN.mark + DRAWN.near);
export const lingers = (film: Film): string[] => lingeringExamples(film.claims, {scenes: [{from: 0, to: film.total}], examples: film.claims.examples, ids: ['a']}).filter(g => g.numbers.length).map(g => lingerText(g));
export const lingerCheck: string = CHECKS['example-lingers'].label;
export const sharedNumbers: ReviewCheck = {label: 'Drawn numbers', when: () => true, find: ({drawn, lingers: stretches}) => [...drawn.map(c => ({kind: 'drawn', t: c.at, what: c.number})), ...stretches.map(g => ({kind: 'lingers', t: g.from, what: g.scene ?? ''}))]};
// Decorative text (types/sub/decorative.d.ts): drawn and read, never a claim; a line's last ink (`gone`) on a kit's texts.
import {decorative, isDecorative, DECORATIVE} from '../types/sub/decorative.js';
import type {Word} from '../types/sub/review.js';
export const numbered = (ctx: {fillText(t: string, x: number, y: number): void}): number => decorative(ctx, c => { c.fillText('1', 0, 0); return 1; }) + (isDecorative(ctx) ? 1 : 0);
export const marked = (w: Word): boolean => w.decorative === true && typeof DECORATIVE === 'symbol';
export const joins: number = DRAWN.point + DRAWN.size + DRAWN.baseline;
import {HOLD, drawnClaims as heldDrawn} from '../types/sub/claims.js';
export const heldFor = (film: Film): number => heldDrawn([{t: 0, words: [{text: 'load 42 %'}]}], {claims: film.claims, sceneOf: () => 0, wordsAt: () => []}).length + HOLD.seconds + HOLD.step + HOLD.fine;
export const lastInk = (film: Film): number => film.lines.reduce((n, l) => Math.max(n, l.gone ?? l.to), 0);
// The film's language (compileFilm's lang): numbers read by it.
import {numberLocale, numberValue} from '../types/sub/claims.js';
import type {CompileFilmOptions} from '../types/index.js';
export const readInLang = (film: Film): string => `${numberValue('2,5', {lang: film.lang})} ${numberLocale('en-IN')?.secondary ?? 0} ${film.inputs.lang ?? ''} ${film.claims.numbers[0]?.ambiguous ?? ''}`;
export const inGerman = (o: CompileFilmOptions): CompileFilmOptions => ({...o, lang: 'de'});
// Code is read as code (types/sub/decorative.d.ts · code): a mark beside decorative.
import {code, isCode, CODE} from '../types/sub/decorative.js';
import {CODE_READING} from '../types/sub/claims.js';
export const coded = (ctx: {fillText(t: string, x: number, y: number): void}): boolean => code(ctx, c => { c.fillText('x = 16.67;', 0, 0); return isCode(c); }) && typeof CODE === 'symbol' && CODE_READING.cut === ',';
export const codeWord = (w: Word): boolean => w.code === true;
// regions composes views (compose, never then); codeCover lists what a code fingerprint covered.
import {compose, view as regionView} from '../types/sub/regions.js';
import {codeCover} from '../types/sub/segments.js';
export const composed = compose(regionView(2), regionView(1, 5, 5)).z;
export const covered = (fp: string): number => (codeCover(fp)?.files.length ?? 0) + (codeCover(fp)?.packages.length ?? 0);

// A review said short, and the words a reader counts.
const short: string = reviewSummary({findings: [{kind: "still", from: 0, to: 5, scene: "a", what: "x"}]}, {more: "--full lists every one"});
const onScreen: number = wordsOnScreen([{text: "a b", box: [0, 0, 9, 9]}]).count;
void short; void onScreen;

// Found sounds: an event and an entrance name one; a recipe may opt into CC BY-SA; the sounds subpath and its Openverse source.
import type {SoundEvent} from '../types/index.js';
import type {searchSounds, addSound, licenceVerdict as gate, SoundSource} from '../types/sub/sounds.js';
import type {openverse as ov} from '../types/sub/openverse.js';
export const knock: SoundEvent = {time: 1, type: 'found', name: 'knock', gain: .5};
export const trimmedTear: Enter = {type: 'torn', sound: {type: 'found', name: 'paper-tear', from: 1.35, to: 4.25}};
export const tearIn: Enter = {type: 'torn', sound: {type: 'found', name: 'paper-tear', gain: .7}};
export const optIn: Recipe = {story: {kit: 'whiteboard', items: []}, foundSounds: {allowShareAlike: true}};
export const fetchOnce = (add: typeof addSound, source: SoundSource) => add({source, id: 'ec2e245c-465b-4ba7-9ea4-620f3555b291', as: 'page-turn', film: 'films/ep2'});
export const lookFor = async (search: typeof searchSounds, make: typeof ov) => (await search(make({token: null}), 'page turn', {limit: 5})).map(c => c.id);
export const shareAlike = (verdict: typeof gate): boolean => verdict('by-sa', {allowShareAlike: true}).shareAlike;
// @ts-expect-error a found sound event names its sound
export const nameless: SoundEvent = {time: 1, type: 'found'};

// The chat edit loop: what an edit changed, on the full render's own options (the config's fullRender), and a clip of it.
import type {previewChanges} from '../types/index.js';
import type {loadInputs, fullRender, clockSeconds} from '../types/sub/tools.js';
import type {changesText, changedRanges} from '../types/sub/segments.js';
export const previewed = async (preview: typeof previewChanges, load: typeof loadInputs, full: typeof fullRender, clock: typeof clockSeconds) => {
  const r = await preview(full(await load({ep: 'ep1'})), {render: true, handles: 1});
  return r.ranges.length + (r.clip?.seconds ?? 0) + clock('0:12') + r.pieces.filter(p => p.why === null).length;
};
export const relined = (text: typeof changesText, ranges: typeof changedRanges) => text({pieces: [], ranges: ranges([]), total: 0}, {lines: 3});
// @ts-expect-error render is true or false
export const badPreview = (preview: typeof previewChanges, film: Parameters<typeof previewChanges>[0]) => preview(film, {render: 'yes'});

// The anchors: a compile that notes every phrase not as written; the tool that says them; the clock's places.
import type {readInputs, anchors, sheet, shareCopy} from '../types/sub/tools.js';
import type {FOCUS, LOOP, FocusView} from '../types/sub/attention.js';
export const noted = (make: typeof compileFilm, board: Storyboard, timings: Parameters<typeof compileFilm>[0]['timings']) => make({storyboard: board, timings, recipe: moving, anchors: 'note'})
  .then(f => f.anchors.filter(n => n.problem === 'missing').map(n => n.near?.phrase ?? n.path).length + f.clock.places('a', 'red square').length);
// @ts-expect-error anchors is 'refuse' or 'note'
export const badAnchors = (make: typeof compileFilm, board: Storyboard, timings: Parameters<typeof compileFilm>[0]['timings']) => make({storyboard: board, timings, recipe: moving, anchors: 'warn'});
export const anchorsChecked = async (read: typeof readInputs, check: typeof anchors, at: typeof sheet, project: Parameters<typeof sheet>[0]) =>
  (await check(await read({ep: 'ep1'}), {full: true})).length + (await at(project, {scene: 'a', every: 2})).files.length;
export const shared = (share: typeof shareCopy) => share('out/film.mp4', {width: 854, poster: 2}).bytes;
export const circled = (focus: typeof FOCUS, loop: typeof LOOP, view: FocusView) => focus.circle.show(null, view, () => {}, null) ?? loop.draw + (view.since ?? 0);

// One script: moments ({name}) and speaker tags ({@who}) in the narration; a beat or a hold names a moment as a phrase.
import {said as saidText, momentsOf, linesOf, sceneScript, momentOf, type Moment, type SpeakerLine, type SceneScript, type Beat} from '../types/index.js';
import {sceneScript as scriptOfScene, momentFix} from '../types/sub/script.js';
import {spokenIn} from '../types/sub/clock.js';
import type {script as scriptTool, ScriptScene, TOOLS as Tools} from '../types/sub/tools.js';
export const scripts: Storyboard = {scenes: [{id: 'today', narration: 'Ten ones {dots} make a ten {hop}. {@mom}"And ten tens?"'}]};
export const spoken: string = saidText(scripts.scenes[0].narration ?? '', {name: 'storyboard scene today'});
export const moments: Moment[] = momentsOf('Ten ones {dots} make a ten.'), lines: SpeakerLine[] = linesOf('{@mom}"Hi."');
export const offsets: number = moments[0].offset + lines[0].offset;
export const scripted: SceneScript = sceneScript(scripts.scenes[0], 0);
export const silentScript: string | null = scriptOfScene({id: 'open', silent: [['the door opens', 1]]}).said;
export const named: string | null = momentOf('{hop}', 'a beat') ?? momentOf('{hop}', null);
export const fixed: string | null = momentFix({nth: 0});
export const lineSaid: string = spokenIn(scripts.scenes[0], lines[0].offset, lines[0].offset + lines[0].say.length);
export const atMoment: Beat[] = [['today', '{dots}'], ['today', '{hop}', .5], {scene: 'today', phrase: '{dots}', plus: .2}];
export const heldAtMoment: Recipe = {guesses: [{after: ['today', '{dots}'], question: 'How many?'}]};
export const momentsOn = (film: Film): number => film.clock.moments('today').reduce((t, m) => t + m.t, 0) + film.anchors.filter(n => n.problem === 'moment').length;
export const scriptRead = async (run: typeof scriptTool, read: typeof readInputs, tools: typeof Tools) => {
  const [scene] = JSON.parse(await run(await read({}))) as ScriptScene[];
  return `${scene.speaker ?? ''}${scene.said}${scene.lines[0]?.spoken ?? ''}${tools.script.load}`;
};
// @ts-expect-error a moment is a name, not a number
export const badMoment = momentOf(3);
// @ts-expect-error a moment's place in what is said is its offset (at is seconds, as on the clock)
export const oldPlace = (m: Moment) => m.at;
