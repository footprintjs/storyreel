/**
 * footprint-storyreel/director: the automatic director. It reads the script (sentences, speakers, end marks, moments),
 * the scenes and what each picture names, and proposes camera framing keys and acting moods as recipe keys, each with
 * the rule behind it. Its own rules are neutral (end marks only); rules with words are the film's data.
 */
import type {Beat, Storyboard, Timings} from '../index.js';

/** The framings a shot rule may ask for (how much of the frame the face fills). */
export type RuleShot = 'medium' | 'close' | 'insert';
/** A shot rule: a speaker's line one of its patterns names frames their face at `shot` (null: the line is out of the later rules' hands); `key: true` marks a key moment, framed whatever the close-up budget says. */
export interface ShotRule { name: string; when: string | string[]; shot: RuleShot | null; key?: boolean }
/** A mood rule: a speaker's line one of its patterns names gives them the first of its moods the kit can act (null: no mood). */
export interface MoodRule { name: string; when: string | string[]; mood: string | string[] | null }
/**
 * A rule table, as data: patterns are the line as said with … for any words ("Oh…!", "Why…?", "Yes!"); a pattern ending
 * with ? ! or . asks for that end. `guess`: the mood of whoever answers a pause and guess.
 */
export interface DirectorRules {
  lang?: string; shots?: ShotRule[]; moods?: MoodRule[]; guess?: string | string[] | null;
  /** A word the narration says → the region name the picture gives it ("sacks": "row"), or {on, size}. None built in. */
  aliases?: Record<string, string | {on: string; size?: RuleShot}>;
}
/** A pattern, read. */
export interface ReadPattern { readonly text: string; readonly parts: readonly (string | symbol)[]; readonly end: '.' | '!' | '?' | null }
/** A rule table, read (readRules): every pattern read, the parts in the order they are read, and where each came from. */
export interface ReadRules {
  readonly lang: string | null;
  /** Where each part came from, in the order read: 'the recipe', 'the application\'s "en" table', 'neutral'. */
  readonly source: readonly string[];
  readonly shots: readonly {name: string; when: readonly ReadPattern[]; shot: RuleShot | null; key: boolean}[];
  readonly moods: readonly {name: string; when: readonly ReadPattern[]; mood: readonly string[] | null}[];
  readonly guess: readonly string[] | null;
  /** Word → {on, size} (size null: the thing's default, insert); the recipe's over the application's. */
  readonly aliases: Readonly<Record<string, {on: string; size: RuleShot | null}>>;
}

/** The recipe's director: "on", "off" (or absent: the film exactly as without one), or its settings. */
export type DirectorSpec = 'on' | 'off' | {
  /** The language the narration is in (default: the film's): picks the application's rule table. */
  lang?: string;
  /** The recipe's own rules, read before the application's and the neutral ones. */
  rules?: DirectorRules;
  /** Where framing keys land, picture by picture: auto (default: a world whose kit takes them in its spec, every other picture through the film's focus), worlds (only those worlds; the rest recorded as not framed), focus (every picture through the focus), off. */
  camera?: 'auto' | 'worlds' | 'focus' | 'off';
  /** Whether mood keys land in each world whose kit takes them (default worlds). */
  acting?: 'worlds' | 'off';
  /** The least seconds between two camera keys (default 2). */
  gap?: number;
  /** How many seconds before its words a camera key lands (default 0.2; a scene's first sentence: on its words). */
  lead?: number;
  /** The close-up budget: how many a scene, and one speaker's turn, may have (defaults 2 and 1; null: no limit). A rule's key moment is outside it. */
  closeUps?: {perScene?: number | null; perTurn?: number | null};
  /** How many seconds may pass before the other speaker replies for the two to be framed together (default 4; 0: never). */
  exchange?: number;
};

/**
 * What a story kit takes from the director, for a world (`story.direction`: this, or a function of the world's spec,
 * null for a world it does not direct): the spec keys that take framing keys and mood keys, the moods it can act, and
 * the mood a held one returns to.
 */
export interface KitDirection {
  camera?: string; acting?: string; moods?: string[] | Record<string, string[]>; rest?: string;
  /** Its camera frames several names together (on: [a, b], the box round them): two people talking get a two-shot. */
  groups?: boolean;
}

/** A framing key as a recipe writes it (a world's camera, or the film's focus). */
export interface DirectedFraming { at: Beat; on: string | string[]; size?: RuleShot }
/** One proposal, with why: where it lands (a recipe path, 'focus', or null outside a film), its beat and time, the rule and the sentence. */
export interface DirectorProposal {
  kind: 'camera' | 'mood'; path: string | null; scene: string; at: Beat; t: number | null;
  on?: string | string[]; size?: RuleShot; who?: string; mood?: string;
  /** line, exchange, person, insert, after, turn, scene, picture (the focus back to wide for a new picture) — framing; line, guess, rest, scene — moods. */
  rule: string;
  /** The rule's own name (a table rule's `name`). */
  name: string;
  /** The sentence it came from. */
  said: string;
  /** In a film: whether it landed, and why not (an explicit key won; the kit takes no such key; one camera). */
  placed?: boolean; why?: string;
}
/** Who is on screen in each scene: each reacts through acting · reactionAt, read from the voice (no keys). */
export interface DirectorListeners { by: 'reactionAt'; scenes: {scene: string; people: string[]}[] }
/** What a film keeps of its direction (film.director; the making-of record's `director`). */
export interface DirectorRecord {
  lang: string | null; rules: readonly string[]; camera: 'auto' | 'worlds' | 'focus' | 'off'; acting: 'worlds' | 'off'; gap: number; lead: number;
  closeUps: {perScene: number | null; perTurn: number | null}; exchange: number;
  /** Each picture (the story, then each stage, in film order) and how it was framed: by its world's own camera, by the film's focus, or not (with why). */
  pictures: {path: string; kit: string | null; scenes: string[]; camera: 'world' | 'focus' | null; acting: boolean; why?: string}[];
  /** What landed where, in recipe shape: {path: 'stages[3].world.camera', keys: [...]}. */
  placed: {path: string; keys: unknown}[];
  proposals: DirectorProposal[];
  /** Left out by the grammar itself (a key too soon after the last, a mood too soon after the last change), with why. */
  dropped: DirectorProposal[];
  listeners: DirectorListeners;
}

/** The library's own rules: a question or an exclamation from a speaker frames their face close; whoever answers a pause and guess thinks. */
export const NEUTRAL_RULES: Readonly<{shots: readonly ShotRule[]; moods: readonly MoodRule[]; guess: string}>;
export const RULE_SHOTS: readonly RuleShot[];
/** The framing's defaults: the gap between camera keys, how far a key lands before its words, the close-up budget, the exchange window. */
export const FRAMING: Readonly<{gap: number; lead: number; closeUps: Readonly<{perScene: number | null; perTurn: number | null}>; exchange: number}>;
/** The rule table a film is directed by: the recipe's rules, the application's for the language ({lang: table}), the neutral ones. */
export function readRules(options?: {lang?: string | null; rules?: DirectorRules | null; tables?: Record<string, DirectorRules> | null}, where?: string): ReadRules;
/** Which rules a line hits: the first shot rule and the first mood rule whose patterns match it. */
export function matchLine(line: string | {words: readonly string[]; end: string | null}, table: ReadRules): {shot: ReadRules['shots'][number] | null; mood: ReadRules['moods'][number] | null};
/** The words of a text as the rules compare them (lower case, ’ as '). */
export function wordsOf(text: string): string[];
/** How a line ends: '.', '!', '?', '…', or null. */
export function endOf(text: string): '.' | '!' | '?' | '…' | null;
/** The recipe's director, read: null when off. */
export function readDirector(spec: DirectorSpec | undefined, options?: {lang?: string | null; tables?: Record<string, DirectorRules> | null}):
  {lang: string | null; table: ReadRules; camera: 'auto' | 'worlds' | 'focus' | 'off'; acting: 'worlds' | 'off'; gap: number; lead: number;
   closeUps: {perScene: number | null; perTurn: number | null}; exchange: number} | null;
/** The director outside a film: proposals for a storyboard, as recipe keys and with why, planned as one picture the way a world's camera is. Pure. */
export function direct(options: {
  storyboard: Storyboard; timings?: Timings | null; guesses?: {after: Beat}[];
  /** What the picture names: a list, {scene: list} or (scene, t) → list; left out, names are taken on trust. */
  names?: string[] | Record<string, string[]> | ((scene: string, t: number | null) => Iterable<string>) | null;
  director?: DirectorSpec; lang?: string | null; rules?: Record<string, DirectorRules> | null;
  moods?: string[] | Record<string, string[]> | null; rest?: string | null;
  /** Whether the camera frames several names together (a two-shot); default true, as the film's focus does. */
  groups?: boolean;
}): {
  lang: string | null; rules: readonly string[];
  focus: {strategy: 'camera'; keys: DirectedFraming[]};
  acting: Record<string, {at: Beat; mood: string}[]>;
  proposals: DirectorProposal[]; dropped: DirectorProposal[]; listeners: DirectorListeners;
};
