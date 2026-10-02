// Checked by test/types.test.mjs with tsc: what the types accept, and what they refuse.
import type {Recipe, DirectorNote, Film, Kit, ContextKit, KitContext, Loudness, Storyboard, frameHashes, compileFilm} from '../types/index.js';
import type {startStudio} from '../types/studio.js';

const notes: DirectorNote[] = [
  {note: 'The zooms feel rushed', speed: .7},
  {note: 'Hard cut into the loop', cut: 'inside'},
  {note: 'Push in on the card', push: {at: [380, 490], zoom: 1.3, from: ['build', 'The order line'], to: ['build', 'The policy line']}},
];
export const recipe: Recipe = {story: {kit: 'whiteboard', items: []}, notes, reading: 'refuse', poster: ['summary', 'What to keep', 1]};
export const kit: Kit = {name: 'plain', story: {motion: ['cameraSpeed'], compile: () => ({hang: 1, draw: () => {}})}};
export const seconds = (film: Film): number => film.total + film.moments().length + film.reading.length;
export type Studio = typeof startStudio;
export const doorKit: Kit = {name: 'door', story: {compile: () => ({draw: () => {}, sounds: [{time: 1, type: 'door', gain: .45}]})}};
export type HostKeys = Parameters<typeof compileFilm>[0]['hostKeys'];
// The compile record: its narrative and snapshot are footprintjs's own types.
export const firstStage = (film: Film): string | undefined => film.record?.narrative.find(e => e.type === 'stage')?.stageId;
export const commits = (film: Film): number => film.record?.snapshot.commitLog.length ?? 0;
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
import type {makeClock, normSpeech} from '../types/sub/clock.js';
import type {hitTest, View} from '../types/sub/regions.js';
import type {tooShortToRead} from '../types/sub/reading.js';
import type {compileWhiteboard, Board} from '../types/sub/whiteboard.js';
import type {compileCartoon} from '../types/sub/cartoon.js';
import type {paceTimings, shiftWords} from '../types/sub/pacing.js';
import type {EASES, easeNamed, Ease, EaseName} from '../types/sub/ease.js';
export type Subpaths = [typeof makeClock, typeof normSpeech, typeof hitTest, View, typeof tooShortToRead, typeof compileWhiteboard, Board, typeof compileCartoon, typeof paceTimings, typeof shiftWords, typeof EASES, typeof easeNamed, Ease, EaseName];
export const backEase = (table: typeof EASES): Ease => table.back;
export const springEase = (table: typeof EASES): Ease => table.spring;
// @ts-expect-error bounce is not in the table yet
export const bounceEase = (table: typeof EASES): Ease => table.bounce;

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
// @ts-expect-error force names segments by index or scene id
export const badForce = segmentedVideo({store: folderStore('x'), recipe: {}, force: [true]});

// The approval lock.
import {approveFilm as approve, checkApproval as check} from '../types/sub/approval.js';
export const approved = (storyboard: Storyboard, recipe: Recipe) => check(approve({storyboard, recipe, by: 'S'}), {storyboard, recipe}).ok;
// @ts-expect-error an approval says who approves it
export const anonymous = (storyboard: Storyboard, recipe: Recipe) => approve({storyboard, recipe});

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
