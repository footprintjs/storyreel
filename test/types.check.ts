// Checked by test/types.test.mjs with tsc: what the types accept, and what they refuse.
import type {Recipe, DirectorNote, Film, Kit, Loudness, frameHashes, compileFilm} from '../types/index.js';
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

// The documented subpaths carry types too.
import type {makeClock, normSpeech} from '../types/sub/clock.js';
import type {hitTest, View} from '../types/sub/regions.js';
import type {tooShortToRead} from '../types/sub/reading.js';
import type {compileWhiteboard, Board} from '../types/sub/whiteboard.js';
import type {compileCartoon} from '../types/sub/cartoon.js';
import type {paceTimings, shiftWords} from '../types/sub/pacing.js';
export type Subpaths = [typeof makeClock, typeof normSpeech, typeof hitTest, View, typeof tooShortToRead, typeof compileWhiteboard, Board, typeof compileCartoon, typeof paceTimings, typeof shiftWords];
