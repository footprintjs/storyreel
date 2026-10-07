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
// @ts-expect-error a check finds with find(review)
export const badCheck: ReviewCheck = {label: 'x', when: () => true};
// Release (types/sub/release.d.ts): targets by name, with options, or an adapter of your own; a post says who it is for.
import type {ReleaseAdapter, ReleaseTarget, ReleasePost} from '../types/sub/release.js';
const mine: ReleaseAdapter = {name: 'mine', label: 'Mine', video: {format: 'square', captions: true}, limits: {seconds: {max: 60}, text: {text: {max: 500}}},
  audience: {minAge: 13, kids: 'refuse'}, thumbnail: null, facts: {checked: '2026-10-02', sources: []}, post: p => ({text: p.title})};
export const targets: ReleaseTarget[] = ['youtube', {target: 'youtube-shorts', from: 0, to: 60}, mine];
export const teaser: ReleasePost = {title: 'Pebbles', audience: 'general'};
export const big: ReleaseTarget = {target: 'youtube', scale: 2};
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
