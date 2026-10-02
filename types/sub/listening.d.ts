export type {ListeningFinding} from '../index.js';
import type {ListeningFinding} from '../index.js';
/** share: at most this share of the changes of picture sound (about half silent), judged from `least` changes; under: LU the effects stay under the voice. */
export const LISTENING: Readonly<{share: number; least: number; under: number}>;
/** A recipe's `listening` setting checked: 'report' (the default) or 'refuse'. */
export function listeningMode(value: unknown): 'report' | 'refuse';
/** What the sounds of the changes of picture ask of the ear: a sound on most of them, or the same cue twice running. */
export function changeSounds(changes: {at: number; where: string; sound: string | null}[], rule?: {share: number; least: number; under: number}): ListeningFinding[];
/** The effects against the voice, measured apart (LUFS): a finding when the effects are less than `under` LU under the voice. */
export function effectsUnderVoice(levels: {voice: number | null; effects: number | null}, rule?: {share: number; least: number; under: number}): ListeningFinding | null;
