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
export const atMoments = (film: Film, hash: typeof frameHashes) => hash(film, {times: film.moments().map(m => m.t), width: 320});

export const silent: Loudness = {type: 'skipped', target: {I: -16, TP: -1.5}, measured: {I: null, TP: null, LRA: 0, thresh: -70, offset: null}, reason: 'the audio is silent'};

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
// @ts-expect-error spring is not in the table yet
export const springEase = (table: typeof EASES): Ease => table.spring;
