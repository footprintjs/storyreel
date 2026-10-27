/**
 * The five scene questions: a scene is a state of one evolving world. Besides its intent and its continuity, a shot may
 * answer, in one short sentence each, what exists now (`exists`), what changed (`changed`), why it changed (`why`), what
 * became possible (`opens`) and what constraint remains (`remains`). Borrowed from a "progressive presentation" contract:
 * each slide is the one before it plus one change. The answers ride on film.shots and the making-of record, so the next
 * reader (a person, or the next AI) reads the story as data instead of working it out again from the pictures.
 *
 *   {"type": "world", "scene": "refused",
 *    "exists": "The cart holds three items and an offer made yesterday.",
 *    "changed": "The app refuses the offer at checkout.",
 *    "why": "The price changed after the offer was made.",
 *    "opens": "The person can ask for a fresh offer.",
 *    "remains": "A fresh offer still needs the seller's approval.", "world": {…}}
 *
 * The check (checkProgression) reads the WORDS, never the pictures and never the meaning: a later scene that shares no
 * word with an earlier answer has not picked it up, as far as the words can show. It finds a jump to a world the last
 * change never mentioned, and a missing answer. It cannot tell a change carried in other words ("the offer is refused",
 * then "checkout stops").
 */
import {secondSentence, INTENT_MAX} from './shots.mjs';

/** The five questions, in the order a scene answers them. */
export const QUESTIONS = Object.freeze(['exists', 'changed', 'why', 'opens', 'remains']);

/** What each question asks, with an answer to show in a refusal (a scene of an explainer about a checkout). */
export const QUESTION_ASKS = Object.freeze({
  exists: Object.freeze({asks: 'what exists now', example: 'The cart holds three items and an offer made yesterday.'}),
  changed: Object.freeze({asks: 'what changed', example: 'The app refuses the offer at checkout.'}),
  why: Object.freeze({asks: 'why it changed', example: 'The price changed after the offer was made.'}),
  opens: Object.freeze({asks: 'what became possible', example: 'The person can ask for a fresh offer.'}),
  remains: Object.freeze({asks: 'what constraint remains', example: 'A fresh offer still needs the seller\'s approval.'}),
});

/** The longest answer, in characters: one short sentence, as a shot's intent. */
export const ANSWER_MAX = INTENT_MAX;

/**
 * A shot's answers to the five questions, checked: {exists?, changed?, why?, opens?, remains?} (each one sentence of at
 * most ANSWER_MAX characters, trimmed), or null when it answers none. `shot` is the stage (or the story) as the recipe
 * gives it; its other keys are not read. Anything else refuses, naming the shot, the question and the fix.
 */
export function readQuestions(shot, where) {
  const out = {};
  for (const key of QUESTIONS) {
    const value = shot?.[key];
    if (value === undefined) continue;
    const {asks, example} = QUESTION_ASKS[key];
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${where}: ${key} says ${asks}, in one short sentence (e.g. "${example}"), not ${JSON.stringify(value)}`);
    const text = value.trim();
    if (text.length > ANSWER_MAX) throw new Error(`${where}: ${key} is ${text.length} characters; a scene's answer fits in ${ANSWER_MAX} (one short sentence)`);
    const second = secondSentence(text);
    if (second) throw new Error(`${where}: ${key} reads as two sentences at "${second}"; each answer is one short sentence: keep the one that says ${asks}, or, if it is one sentence, spell out the abbreviation`);
    out[key] = text;
  }
  return Object.keys(out).length ? Object.freeze(out) : null;
}

/** Check a recipe's `progression` setting: 'report' (the default: film.progression lists what it found) or 'refuse'. */
export function progressionMode(value) {
  if (value === undefined) return 'report';
  if (value !== 'report' && value !== 'refuse') throw new Error('progression must be "report" (the default: film.progression lists a scene that changes nothing, a change not carried forward, an opening never used, a constraint never answered) or "refuse"');
  return value;
}

/** Words that name no thing of the story (English): left out when two answers are compared. */
const FUNCTION_WORDS = new Set(('a an the and or but so if then than that this these those there here it its is are was were be been being am has have had '
  + 'do does did done can could will would shall should may might must to of in on at by for from with without into onto over under up down out off '
  + 'about as not no yes now still yet just only also too very more most less some any all each every both which who whom whose what when where why '
  + 'how he she they them their his her hers him we us our you your i me my again once while after before until because').split(' '));
/** Number words as digits, so "two items" and "2 items" are one word. */
const NUMBER_WORDS = Object.freeze(Object.fromEntries('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'
  .split(' ').map((w, i) => [w, String(i)])));
/**
 * A word as it is compared: lower case, a number word as its digits, a plural's "s" and an "ed", "ing", "ied" or "ies"
 * ending taken off ("counting" → "count", "stopped" → "stop", "tried" → "try", "offers" → "offer").
 */
function stem(word) {
  const w = word.toLowerCase();
  if (NUMBER_WORDS[w] !== undefined) return NUMBER_WORDS[w];
  if (/\p{N}/u.test(w)) return w;
  const cut = (end, put = '') => (w.length - end.length >= 3 && w.endsWith(end) ? w.slice(0, -end.length) + put : null);
  const undouble = s => (s && s.length >= 4 && /([^aeiouylsz])\1$/.test(s) ? s.slice(0, -1) : s);   // "stopp" → "stop"; "add" stays
  return cut('ies', 'y') ?? cut('ied', 'y') ?? undouble(cut('ing')) ?? undouble(cut('ed')) ?? (/(ss|us|is)$/.test(w) ? null : cut('s')) ?? w;
}
/** The words of a sentence that name something: its words less FUNCTION_WORDS and single letters, each as it is compared (stem). */
export function contentWords(text) {
  return [...new Set(String(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean).filter(w => !FUNCTION_WORDS.has(w.toLowerCase())).map(stem).filter(w => w.length > 1 || /\p{N}/u.test(w)))];
}
/** Two compared words are one: the same, or one starts the other and the shorter has four letters or more ("price", "priced"). */
const sameWord = (a, b) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));
/** The words of `a` that `b` says too (contentWords, sameWord): what one answer picks up from another. */
export function sharedWords(a, b) {
  const theirs = contentWords(b);
  return contentWords(a).filter(w => theirs.some(x => sameWord(w, x)));
}

/**
 * The story as one evolving world, checked in film order. plan: [{path, where, questions}] (questions: readQuestions,
 * or null). Only the shots that answer a question take part (a title card that answers none is left out), and the first
 * of them sets the world up. Returns what does not progress, [{kind, path, where, text}], in film order — each `text`
 * naming the fix:
 *   'changes-nothing'      a scene after the first says no `changed`: it moves nothing on
 *   'not-carried'          a scene's `changed` is not in the next scene's `exists` (no shared word, or no exists)
 *   'opens-unused'         a scene's `opens` is picked up by no later scene's `changed`
 *   'remains-unanswered'   a scene's `remains` is answered by no later scene's `changed` (the story ends with it)
 */
export function checkProgression(plan) {
  const asked = plan.filter(u => u.questions), found = [];
  const shares = (a, b) => sharedWords(a, b).length > 0, quote = s => `"${s}"`;
  asked.forEach((u, i) => {
    const q = u.questions, next = asked[i + 1], later = asked.slice(i + 1), at = {path: u.path, where: u.where};
    if (i > 0 && !q.changed) found.push({kind: 'changes-nothing', ...at, text: `${u.where} changes nothing (it says no "changed"): each scene after the first moves the world on — say what changed, in one sentence, or fold the scene into ${asked[i - 1].where}`});
    if (q.changed && next) {
      const exists = next.questions.exists;
      if (!exists) found.push({kind: 'not-carried', ...at, next: next.where, text: `${u.where} changed ${quote(q.changed)}, and ${next.where} does not say what exists: give ${next.where} "exists", carrying the change forward`});
      else if (!shares(q.changed, exists)) found.push({kind: 'not-carried', ...at, next: next.where, text: `${u.where} changed ${quote(q.changed)}, and ${next.where}'s exists (${quote(exists)}) shares no word with it: say what exists now that it changed`});
    }
    if (q.opens && !later.some(l => l.questions.changed && shares(q.opens, l.questions.changed))) found.push({kind: 'opens-unused', ...at, text: `${u.where} opens ${quote(q.opens)}, and no later scene's changed picks it up: show it used (a later scene's "changed"), or leave opens out`});
    if (q.remains && !later.some(l => l.questions.changed && shares(q.remains, l.questions.changed))) {
      found.push({kind: 'remains-unanswered', ...at, text: next
        ? `${u.where} leaves ${quote(q.remains)}, and no later scene's changed answers it, so the story ends with it: answer it in a later scene's "changed", or leave remains out`
        : `${u.where} is the story's last scene and leaves ${quote(q.remains)}, which nothing answers: answer it before the end, or leave remains out`});
    }
  });
  return found;
}

/** The refusal a recipe that says `progression: "refuse"` gets: the first three findings, and how many more. */
export const progressionRefusal = found => `The story does not progress (the recipe says progression: "refuse"): ${found.slice(0, 3).map(f => f.text).join('; ')}${found.length > 3 ? `; and ${found.length - 3} more` : ''}`;
