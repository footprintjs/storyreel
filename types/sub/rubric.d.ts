import type {Film, Rubric, RubricLook, RubricSpec} from '../index.js';
export type {Rubric, RubricLook, RubricPoint, RubricSpec} from '../index.js';
/** What each look lays out for a point: its stills and the evidence beside them. */
export const LOOKS: Readonly<Record<RubricLook, string>>;
/** A rubric's scale when it names none: [1, 10]. */
export const RUBRIC_SCALE: readonly [number, number];
/** The most stills one point lays out. */
export const MOST_STILLS: number;
/** The seconds the opening look reads (the review's hook). */
export const OPENING_SECONDS: number;
/** A rubric, checked: a name, a scale, points (each look 'settled' when none), least scores per point (or null); anything else refuses, naming the fix. */
export function readRubric(value: unknown, where?: string): Rubric;
/** A recipe's `rubric`, checked, or null when it names none. */
export function readRubricRule(value: unknown): Rubric | null;
/** One point laid out: its stills (moments on the film clock, labelled) and its evidence (lines). */
export interface RubricSheetPoint { id: string; label: string; ask?: string; look: RubricLook; stills: {t: number; label: string}[]; evidence: string[] }
/** What a reviewer needs to score each point of a rubric, as data: the library scores nothing. */
export function rubricSheet(film: Film, rubric: Rubric | RubricSpec, options?: {review?: {ran?: string[]; findings?: {kind: string; from: number; to: number; what: string}[]} | null; record?: Record<string, any> | null; opening?: number}): {name: string; scale: readonly [number, number]; least: Readonly<Record<string, number>> | null; points: RubricSheetPoint[]};
/** The sheet as text, in one stable layout; `files[id]` the picture drawn of a point's stills. */
export function rubricText(sheet: ReturnType<typeof rubricSheet>, options?: {files?: Record<string, string>}): string;
/** Scores for every point, checked: "id=8,id=7" or {id: 8} → {id: score}, in the rubric's order. */
export function readScores(scores: string | Record<string, number>, rubric: Rubric | RubricSpec): Readonly<Record<string, number>>;
/** The scores as the making-of keeps them; `met` and `short` when the rubric requires least scores. */
export interface RubricRecord { name: string; scale: [number, number]; points: string[]; least?: Record<string, number>; scores?: Record<string, number>; by?: string; scored?: string; met?: boolean; short?: {id: string; score: number | null; least: number}[] }
export function scoresRecord(options: {rubric: Rubric | RubricSpec; scores: string | Record<string, number>; by: string; at?: Date}): RubricRecord;
/** The points scored under their least (none when nothing is required, or all are met). */
export function rubricShort(record: RubricRecord | null | undefined): {id: string; score: number | null; least: number}[];
/** What the film is made from that a person sees: a record whose own (film.inputs) differ is of another film. */
export const SEEN_INPUTS: readonly string[];
/** Record a render's scores in its making-of.json (rewritten whole). Refused: a failed render's record, a render of a part, a record of another film than `inputs` (film.inputs, when given), and a rubric that is not the recipe's (name, scale, points and least, as the record keeps them). */
export function recordScores(makingOf: string, options: {rubric: Rubric | RubricSpec; scores: string | Record<string, number>; by: string; at?: Date; inputs?: Record<string, unknown> | null}): RubricRecord;
/** Why a render's record may not be approved yet (no scores, or one under its least), or null. */
export function rubricRefusal(record: RubricRecord | null | undefined): string | null;
