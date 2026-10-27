import type {ProgressionFinding, SceneAnswers} from '../index.js';
export type {ProgressionFinding, SceneAnswers} from '../index.js';
/** The five scene questions, in the order a scene answers them. */
export const QUESTIONS: readonly ['exists', 'changed', 'why', 'opens', 'remains'];
/** What each question asks, with an answer a refusal shows. */
export const QUESTION_ASKS: Readonly<Record<'exists' | 'changed' | 'why' | 'opens' | 'remains', Readonly<{asks: string; example: string}>>>;
/** The longest answer, in characters (one short sentence, as a shot's intent). */
export const ANSWER_MAX: number;
/** A shot's answers, checked (each one sentence of at most ANSWER_MAX characters, trimmed), or null when it answers none. */
export function readQuestions(shot: unknown, where: string): Readonly<SceneAnswers> | null;
/** A recipe's `progression` setting, checked: 'report' (the default) or 'refuse'. */
export function progressionMode(value: unknown): 'report' | 'refuse';
/** The words of a sentence that name something, each as it is compared (lower case, number words as digits, a plural's or a tense's ending off). */
export function contentWords(text: string): string[];
/** The words of `a` that `b` says too: what one answer picks up from another. */
export function sharedWords(a: string, b: string): string[];
/** The story as one evolving world, checked in film order: what does not progress, each with its fix. Only the shots that answer a question take part. */
export function checkProgression(plan: {path: string; where: string; questions: Readonly<SceneAnswers> | null}[]): ProgressionFinding[];
/** The refusal a recipe that says progression: "refuse" gets. */
export function progressionRefusal(found: ProgressionFinding[]): string;
