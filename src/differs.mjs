/**
 * A scene that differs from the real thing says so. A picture is believed: a process run 30 times faster, or a part drawn
 * far larger than it is, reads as how the thing is unless the film says otherwise. A scene declares how it differs —
 * how many times faster its time runs, what is out of scale — and the film says it, on screen, in the voice, or both:
 *
 *   storyboard.json   {"id": "inside", "narration": "Here it runs thirty times faster.",
 *                      "differs": {"time": 30, "scale": "The dots are drawn far larger than real", "said": "thirty times faster"}}
 *
 * On screen by default: a label per statement, top right, over the scene ("Time shown 30 times faster"; `shown` gives
 * the words in the film's language, or false for the voice alone). `said` names the phrase of the scene's narration
 * that says it (one per statement, for the voice alone), checked as every phrase a recipe names is. Every statement
 * declared has a line or a phrase of its own, so none goes unstated. A verdict (the review's `differs`) reads the part it
 * is given: the labels as the frame draws them, long enough to read, the phrase where it is said whole, so a part cut to
 * lose it is caught. It reads what is declared, and cannot see a speed-up nobody declared.
 *
 *   readDiffers(spec, where)             the declaration, checked: {time?, scale?, shown: [lines], said?: [phrases]}, or null
 *   differsOf(storyboard, {lang})        each scene's, in order, held to its scene (null: none)
 *   ownFigure(line, time, lang)          whether a label's number is the film's own declaration, no claim about the world
 *   asLabel(ctx, mark, draw)             draw a label's words with a mark the review reads (labelMark)
 *   differsReached(film, part)           the declaring scenes whose picture reaches a part
 *   differsMeasure(film, part, options)  what the verdict measures, and its findings
 */
import {normSpeech} from 'footprint-story';
import {numbersIn, numberValue, CLAIMS_VERDICT} from './claims.mjs';
import {secondsToRead, READING} from './reading.mjs';

/** What a scene's `differs` may hold. */
export const DIFFERS_KEYS = Object.freeze(['time', 'scale', 'shown', 'said']);
/** The longest statement a label holds: a label is read in a glance, and the rest belongs in the voice. */
export const DIFFERS_MOST = 70;
/** The longest phrase `said` names: the few words of the narration that say it, not a passage. */
export const DIFFERS_SAID_MOST = 120;
/** How far a time factor goes, faster or slower: past it no viewer reads the number, so it belongs in words (`scale`). */
export const DIFFERS_TIME_MOST = 1e9;

const plain = x => String(+x.toFixed(x >= 10 ? 0 : 2));
/** A time factor in words: 30 → "Time shown 30 times faster"; 0.04 → "Time shown 25 times slower". */
export const timeWords = time => (time > 1 ? `Time shown ${plain(time)} times faster` : `Time shown ${plain(1 / time)} times slower`);
/** The values a number may have and still be the declared factor: as written, and as the time words say it. */
const factorsOf = time => (time > 1 ? [time, +plain(time)] : [time, 1 / time, +plain(1 / time)]);

/** Spaces and control characters made one space: a declaration's words stay on one line wherever they are printed. */
const folded = text => text.replace(/[\s\p{Cc}]+/gu, ' ').trim();

const words = (value, name, where) => {
  const text = typeof value === 'string' ? folded(value) : '';
  if (!text) throw new Error(`${where}: differs.${name} is words, not ${JSON.stringify(value)}`);
  if (text.length > DIFFERS_MOST) throw new Error(`${where}: differs.${name} is ${text.length} characters, more than a label can hold in a glance (${DIFFERS_MOST}): shorten it, and say the rest in the voice`);
  return text;
};

/** A time factor checked: a number a label can say, neither real time nor past what a viewer reads. */
function readTime(time, where) {
  const what = `${where}: differs.time is how many times faster the picture runs than the real thing (30; 0.04 is 25 times slower), not ${JSON.stringify(time)}`;
  if (!(typeof time === 'number' && Number.isFinite(time) && time > 0)) throw new Error(what);
  if (plain(time > 1 ? time : 1 / time) === '1') throw new Error(`${what}: it reads as 1 time, and 1 is real time, so leave it out (a factor that shows is 1.01 or more, or 0.99 or less)`);
  if (time > DIFFERS_TIME_MOST || time < 1 / DIFFERS_TIME_MOST) throw new Error(`${what}: past ${DIFFERS_TIME_MOST} times either way no viewer reads the number, so say it in words in differs.scale`);
}

/** The phrases `said` names, checked and folded: one, or a list; null when it names none. */
function readSaid(said, where) {
  if (said === undefined) return null;
  const list = Array.isArray(said) ? said : [said];
  const refuse = value => new Error(`${where}: differs.said is the phrase of the scene's narration that says how it differs (or a list, one per statement), not ${JSON.stringify(value)}`);
  if (!list.length) throw refuse(said);
  const phrases = list.map(one => {
    if (typeof one !== 'string' || !normSpeech(one)) throw refuse(one);
    const text = folded(one);
    if (text.length > DIFFERS_SAID_MOST) throw new Error(`${where}: differs.said is ${text.length} characters, more than a phrase (${DIFFERS_SAID_MOST}): name the few words that say it`);
    if (/[{}]/.test(text)) throw new Error(`${where}: differs.said is the words the voice says, not a moment: "${text}" says nothing`);
    return text;
  });
  if (new Set(phrases.map(normSpeech)).size < phrases.length) throw refuse(said);
  return phrases;
}

/** The numbers written in a line, as digits (a digit inside a word, as in "H2O", is none of them). */
const figures = line => line.match(/(?<![\p{L}\p{N}])\d+(?:[.,]\d+)*/gu) ?? [];
/** A written number's values, whichever way a language writes it: 1,000 and 1.000 may be a thousand, 1,5 and 1.5 one and a half. */
const readings = run => [run.replace(/,/g, ''), run.replace(/\./g, ''), run.replace(/\./g, '').replace(',', '.')].map(Number);

/**
 * A number in the line that says the time, when it is not the declared factor: the line contradicts the declaration.
 * With `time` alone every line says it; with `scale` too the first of two or more does (a line for each, the time first);
 * a single line beside a phrase cannot be told, and its number stays a claim (ownFigure).
 */
function contradicting({time, scale}, lines) {
  if (time === undefined) return null;
  const says = scale === undefined ? lines : lines.length >= 2 ? [lines[0]] : [];
  return says.flatMap(figures).find(run => !readings(run).some(v => factorsOf(time).includes(v))) ?? null;
}

/** A scene's declaration checked, each refusal naming the fix: {time?, scale?, shown: [the labels' words], said?: [the phrases]}, or null when it declares none. */
export function readDiffers(spec, where = 'differs') {
  if (spec === undefined || spec === null) return null;
  if (typeof spec !== 'object' || Array.isArray(spec)) throw new Error(`${where}: differs says how the scene differs from the real thing: {time: 30, scale: "the dots are drawn far larger than real", said: "thirty times faster"}, not ${JSON.stringify(spec)}`);
  const other = Object.keys(spec).find(k => !DIFFERS_KEYS.includes(k));
  if (other !== undefined) throw new Error(`${where}: differs takes ${DIFFERS_KEYS.join(', ')}, not ${JSON.stringify(other)}`);
  const {time, scale, shown, said} = spec;
  if (time !== undefined) readTime(time, where);
  if (time === undefined && scale === undefined) throw new Error(`${where}: differs says how the scene differs: give time (how many times faster it runs), scale (what is out of scale, in words), or both`);
  const out = {...(time === undefined ? {} : {time}), ...(scale === undefined ? {} : {scale: words(scale, 'scale', where)})};
  const lines = shown === false ? [] : shown === undefined ? [...(time === undefined ? [] : [timeWords(time)]), ...(scale === undefined ? [] : [out.scale])]
    : (Array.isArray(shown) ? shown : [shown]).map(line => words(line, 'shown', where));
  if (shown !== undefined && shown !== false && !lines.length) throw new Error(`${where}: differs.shown is the words on the picture, or false for the voice alone, not an empty list`);
  const phrases = readSaid(said, where);
  if (!lines.length && !phrases) throw new Error(`${where}: differs.shown is false, so the voice must say it: give said, the phrase of the scene's narration that does`);
  const statements = statementsOf(out), says = new Set(lines).size + (phrases?.length ?? 0);
  if (says < statements) throw new Error(`${where}: differs declares both time and scale and says only ${says} thing: give each its own line in differs.shown or its own phrase in differs.said (said takes a list), so neither goes unstated`);
  const wrong = contradicting(out, lines);
  if (wrong !== null) throw new Error(`${where}: differs.shown says ${wrong} where differs.time says ${time}: leave shown out for the default words, or write the number declared (and with scale too, the time's line first)`);
  return Object.freeze({...out, shown: Object.freeze(lines), ...(phrases ? {said: Object.freeze(phrases)} : {})});
}

/** How many things a declaration says: the time, what is out of scale. */
const statementsOf = d => (d.time === undefined ? 0 : 1) + (d.scale === undefined ? 0 : 1);

/**
 * Each scene's declaration, in the storyboard's order (null: the scene declares none), held to its scene and its film: a
 * silent scene says nothing, so it names no phrase, and the default time words are English, so another language gives its own.
 */
export const differsOf = (storyboard, {lang = null} = {}) => storyboard.scenes.map((scene, i) => {
  const where = `storyboard scene ${scene?.id ?? i}`, d = readDiffers(scene?.differs, where);
  if (!d) return null;
  if (d.said && scene.silent !== undefined) throw new Error(`${where}: differs.said names a phrase the voice says, and a silent scene says nothing: put the words on screen (differs.shown), or narrate the scene`);
  if (lang && !/^en\b/i.test(lang) && d.time !== undefined && d.shown.includes(timeWords(d.time))) throw new Error(`${where}: "${timeWords(d.time)}" is English and the film is in "${lang}": give the words in its language (differs.shown), or false for the voice alone`);
  return d;
});

/** Where a scene's phrase is named in the storyboard. */
export const saidPath = (index, k, count) => `storyboard.scenes[${index}].differs.said${count > 1 ? `[${k}]` : ''}`;
/** A phrase as the clock is asked for it: any place it is said will do, so it is never ambiguous (anchors.mjs). */
export const saidRef = (scene, phrase) => Object.freeze({scene, phrase, nth: 0});
/** Each phrase a storyboard's scenes name, read as written, for when a compile stops before it reaches them (tools.mjs · anchors): [{ref, path}]. Never refuses. */
export const saidPhrases = storyboard => storyboard.scenes.flatMap((scene, i) => {
  const said = scene?.differs?.said, list = Array.isArray(said) ? said : said === undefined ? [] : [said];
  return list.filter(one => typeof one === 'string' && normSpeech(one)).map((one, k) => ({ref: saidRef(scene.id, folded(one)), path: saidPath(i, k, list.length)}));
});
/** Whether a beat only names what the voice says of how a scene differs: logged, and it changes nothing in the picture. */
export const saidBeat = beat => /^storyboard\.scenes\[\d+\]\.differs\.said\b/.test(beat?.path ?? '');

/**
 * Whether a label's number is the film's own declaration, no claim about the world: the time words, or a line whose only
 * number is the declared factor (read as the film's language writes numbers). Any other number is a claim.
 */
export function ownFigure(line, time, lang = null) {
  if (time === undefined) return false;
  if (line === timeWords(time)) return true;
  const numbers = numbersIn(line, {lang});
  if (numbers.length !== 1 || line.slice(line.indexOf(numbers[0]) + numbers[0].length).trimStart().startsWith('%')) return false;
  return factorsOf(time).includes(numberValue(numbers[0], {lang}));
}
/** How many labels among these declarations hold a number that is the film's own (ownFigure), for the claims verdict. */
export const ownFigureLines = (differs, lang = null) => differs.reduce((n, d) => n + d.shown.filter(line => /\p{Nd}/u.test(line) && ownFigure(line, d.time, lang)).length, 0);
/** The claims verdict of a film that declares: its label's own number is on screen, so "no number" would not be true. Any other film's stays CLAIMS_VERDICT. */
export const DECLARING_CLAIMS_VERDICT = Object.freeze({...CLAIMS_VERDICT, rules: Object.freeze([
  Object.freeze({when: Object.freeze({numbers: Object.freeze({eq: 0}), ownFigures: Object.freeze({gt: 0})}), then: 'passed', label: 'the only number on screen is the film\'s own, on how much faster or slower a scene runs'}),
  ...CLAIMS_VERDICT.rules])});

const LABEL = Symbol.for('footprint-storyreel.differs-label');
/** Draw a label's words with a mark: {scene, line, piece, pieces, own?}. It rides on the context while `draw` runs, as decorative.mjs's marks do; a frame drawn without the review is unchanged by it. */
export function asLabel(ctx, mark, draw) {
  const was = ctx[LABEL];
  ctx[LABEL] = mark;
  try { return draw(ctx); } finally { ctx[LABEL] = was; }
}
/** The mark on words drawn on this context now, or null. */
export const labelMark = ctx => ctx?.[LABEL] ?? null;

/** When the picture first shows a moment of its own clock: at that moment, unless a freeze or a speed ramp holds it back. */
function firstShowing(x, film) {
  const m = (film.camera?.moves ?? []).find(c => c.family === 'time' && c.played !== 'off' && x > c.at && x <= c.until);
  if (!m) return x;
  let lo = m.at, hi = m.until;
  while (hi - lo > 1e-3) { const mid = (lo + hi) / 2; if (film.pictureAt(mid) >= x) hi = mid; else lo = mid; }
  return hi;
}
/**
 * The declaring scenes whose picture reaches a part, each with the stretch of the part it is on screen: [{d, from, to}].
 * A scene's picture is on screen on the picture's clock (film.pictureAt), so a freeze carries it, and its label, on.
 */
export const differsReached = (film, part) => (film.differs ?? []).flatMap(d => {
  const from = Math.max(firstShowing(d.from, film), part.from), to = Math.min(firstShowing(d.to, film), part.to);
  return to - from > 1e-6 ? [{d, from, to}] : [];
});

/** How a line reads at one moment from its pieces (the words marked for it): null when whole, or why not. */
function lineProblem(pieces, {frameBox, coveredBy, minAlpha}) {
  if (!pieces.length || new Set(pieces.map(w => w.differs.piece)).size !== pieces[0].differs.pieces || pieces.some(w => w.alpha < minAlpha)) return {hidden: true};
  const [x0, y0, x1, y1] = frameBox;
  if (pieces.some(({box}) => box[0] < x0 - 1 || box[1] < y0 - 1 || box[2] > x1 + 1 || box[3] > y1 + 1)) return {cut: true};
  const under = pieces.map(w => coveredBy(w.box)).find(Boolean);
  return under ? {under} : null;
}
/** A scene's labels read over the stretch they should be up, as drawn: [{text, seconds, needs, problem}]. At most 24 frames a scene. */
function labelsRead(d, from, to, options) {
  const lines = d.shown.map(text => ({text, seconds: 0, needs: secondsToRead(text, options.pace), problem: null}));
  if (!lines.length) return lines;
  const reads = Math.max(5, Math.min(24, Math.ceil((to - from) / .25))), slice = (to - from) / reads;
  for (let r = 0; r < reads; r++) {
    const marked = options.wordsAt(from + (r + .5) * slice).filter(w => w.differs?.scene === d.index);
    lines.forEach((line, k) => {
      const problem = lineProblem(marked.filter(w => w.differs.line === k), options);
      if (problem) line.problem ??= problem; else line.seconds += slice;
    });
  }
  return lines;
}
/** What the scene declares, in words, for a finding. */
const declared = d => [d.time === undefined ? null : timeWords(d.time).toLowerCase(), d.scale ?? null].filter(Boolean).join('; ');
const secs = n => `${n.toFixed(1)} s`;
/** Why a line is not read, in words naming the fix. */
function lineFix({text, seconds, needs, problem}) {
  if (problem?.cut) return `its label "${text}" runs past the edge of what is shown: shorten it (differs.shown), widen the crop, or say it in the voice (differs.said)`;
  if (problem?.under) return `its label "${text}" is under the ${problem.under}: move the ${problem.under}, or say it in the voice (differs.said)`;
  if (problem?.hidden) return 'something hides its label: move what covers the top right corner';
  return `its label "${text}" is up ${secs(seconds)} and needs ${secs(needs)} to read: hold the scene longer, shorten the words, or say it in the voice (differs.said)`;
}
/** Why a phrase is not heard, in words naming the fix. */
const phraseFix = ({phrase, places}) => (places.length ? `the phrase "${phrase}" falls outside this part: keep it in, or put the words on screen (differs.shown)` : `the phrase "${phrase}" is not said in the scene: say it, or fix differs.said`);

/**
 * What the verdict reads, over a part: each declaring scene whose picture reaches it, its labels as the frame draws them
 * (the words marked at draw time, whole, inside `frameBox`, uncovered, for as long as they take to read), and each phrase
 * said whole inside `heardIn`. A scene has said it when its labels are read and they alone cover what it declares, or its
 * phrases are heard and they alone do, or both are reached. Returns {measured: {scenes, shown, said, unstated (how many
 * have not said it), brief (of those, how many have a label up too short to read), neither: [{scene, from, to, differs,
 * why}], says: [{scene, shown, said}]}, hits}.
 */
export function differsMeasure(film, part, {wordsAt, heardIn = part, frameBox = [0, 0, 1600, 900], coveredBy = () => null, minAlpha = .5, pace = READING}) {
  const here = differsReached(film, part).map(({d, from, to}) => {
    const lines = labelsRead(d, from, to, {wordsAt, frameBox, coveredBy, minAlpha, pace}), heard = d.heard ?? [];
    const unread = lines.filter(l => l.seconds < l.needs - 1e-6), unheard = heard.filter(h => !h.places.some(p => p.start >= heardIn.from - 1e-6 && p.end <= heardIn.to + 1e-6));
    const allRead = !unread.length, allHeard = !unheard.length, n = statementsOf(d);
    return {d, from, shown: lines.length > 0 && allRead, said: heard.length > 0 && allHeard, brief: unread.some(l => !l.problem),
      stated: (allRead && lines.length >= n) || (allHeard && heard.length >= n) || (allRead && allHeard),
      why: [...new Set([...unread.map(lineFix), ...unheard.map(phraseFix)])].join('; ')};
  });
  const open = here.filter(x => !x.stated);
  return {measured: {scenes: here.length, shown: here.filter(x => x.shown).length, said: here.filter(x => x.said).length, unstated: open.length, brief: open.filter(x => x.brief).length,
    neither: open.map(x => ({scene: x.d.scene, from: x.d.from, to: x.d.to, differs: declared(x.d), why: x.why})),
    says: here.map(x => ({scene: x.d.scene, shown: [...x.d.shown], said: [...(x.d.said ?? [])]}))},
  hits: open.map(x => ({kind: 'differs', t: x.from, what: `scene ${x.d.scene} declares it differs from the real thing (${declared(x.d)}), and here neither shows it nor says it: ${x.why}`}))};
}

/** The verdict's summary: the counts, then the words themselves, so a reader can judge them. */
export function differsSummary(m) {
  const said = ({scene, shown, said: phrases}) => `${scene}: ${[...(shown.length ? [`on screen ${shown.map(l => `"${l}"`).join(', ')}`] : []), ...(phrases.length ? [`in the voice ${phrases.map(p => `"${p}"`).join(', ')}`] : [])].join('; ')}`;
  const named = m.says.slice(0, 3).map(said).join(' · ') + (m.says.length > 3 ? ` · and ${m.says.length - 3} more` : '');
  return `${m.scenes} scene${m.scenes === 1 ? '' : 's'} differ${m.scenes === 1 ? 's' : ''}: ${m.shown} on screen, ${m.said} in the voice${m.unstated ? `, ${m.unstated} neither` : ''}${m.brief ? ` (${m.brief} too brief to read)` : ''} · ${named}`;
}

/** The verdict (verdict.mjs). */
export const DIFFERS_VERDICT = Object.freeze({
  rules: Object.freeze([
    Object.freeze({when: Object.freeze({brief: Object.freeze({gt: 0})}), then: 'failed', label: 'a scene that differs from the real thing has its label up too briefly to read, and the voice does not say it'}),
    Object.freeze({when: Object.freeze({unstated: Object.freeze({gt: 0})}), then: 'failed', label: 'a scene declares it differs from the real thing, and neither shows nor says how'}),
  ]),
  passed: 'every scene that differs from the real thing says how, on screen long enough to read or in the voice',
});
