/**
 * A storyboard read by footprint-story/storyboard, as a film's own inputs: its storyboard (what is said, by scene) and its
 * recipe (what is drawn when each phrase is said). Plain data in, plain data out, so the words a model wrote stay words: they
 * only ever reach a film as text to speak and to draw. A "what we found" board is a title on the whiteboard, then paper cards.
 */
import {autoRules, spokenMap} from 'footprint-story';
import {normSpeech} from 'footprint-story';

const PER_STAGE = 3;       // what a summary stage draws side by side
const MOST_ON_CARD = 96;   // what four lines of a card hold
const MOST_TITLED = 60;    // what a stage's title holds on one line
const MOST_LINE = 34;      // what one line of the whiteboard's title holds

const chunks = (list, size) => Array.from({length: Math.ceil(list.length / size)}, (_, i) => list.slice(i * size, (i + 1) * size));
const sentence = (text) => (/[.!?…。！？]$/u.test(text) ? text : `${text}.`);
const occurrences = (whole, part) => { let n = 0; for (let at = whole.indexOf(part); at >= 0; at = whole.indexOf(part, at + 1)) n++; return n; };

/** The shortest opening of these words, three at the least, said only once in the scene: the moment they start. Null when no opening is. */
function phraseOf(words, sceneText) {
  const list = words.trim().split(/\s+/), whole = normSpeech(sceneText);
  for (let k = Math.min(3, list.length); k <= list.length; k++) {
    const phrase = list.slice(0, k).join(' ');
    if (occurrences(whole, normSpeech(phrase)) === 1) return phrase;
  }
  return null;
}

/** A title broken into the whiteboard's lines, each drawn on its own. */
function titleLines(title) {
  const lines = [];
  for (const word of title.split(/\s+/)) {
    if (lines.length && `${lines.at(-1)} ${word}`.length <= MOST_LINE) lines[lines.length - 1] += ` ${word}`;
    else lines.push(word);
  }
  return lines;
}

/** The whiteboard's first scene: the title in big writing, and the subtitle under it. */
function titleStory(scene) {
  const phrase = phraseOf(scene.narration, scene.narration), lines = titleLines(scene.title), top = 430 - (lines.length - 1) * 44;
  const items = lines.map((write, i) => ({at: ['title', phrase, i * .3], dur: .6, write, x: 800, y: top + i * 88, size: 64, align: 'center'}));
  if (scene.beat.subtitle) items.push({at: ['title', phrase, lines.length * .3], dur: .6, write: scene.beat.subtitle, x: 800, y: top + lines.length * 88 + 8, size: 36, align: 'center', color: 'blue'});
  return {kit: 'whiteboard', defaultErase: null, erasers: {}, items, spots: []};
}

/** What one card says, by part. A claim names the messages it rests on above its words. */
function cardOf(scene, soloFound) {
  const {beat} = scene, head = beat.sources.join(' · ');
  if (beat.group === 'checked') return {head, text: `${beat.name}: ${beat.line}`};
  if (beat.group === 'found') return {head, text: soloFound ? beat.name : `${scene.title}: ${beat.name}`, icon: 'bulb'};
  return {head, text: `${scene.title}: ${beat.name}`};
}

/** A number as written, with its percent sign when it has one: 4355, 1,000, 0.4.0, 20%. */
const NUMBER = /\d+(?:[.,]\d+)*%?/g;
const AUTO = autoRules();
const inWords = (digits) => spokenMap(digits, {rules: AUTO}).spoken;

/** A written number as a voice says it: the whole part as one number, what follows a point digit by digit, so 12.05 is not 12.5. */
function saidNumber(shown) {
  const [whole, ...parts] = shown.replace(/%$/, '').replace(/,/g, '').split('.');
  const said = [inWords(whole), ...parts.map((part) => [...part].map(inWords).join(' '))].join(' point ');
  return shown.endsWith('%') ? `${said} percent` : said;
}

/** A scene with its numbers said in words (`say`: the captions keep the digits). A board's numbers are plain digits, which a voice garbles. */
function withNumbersSaid(scene) {
  const say = (scene.narration.match(NUMBER) ?? []).map((shown) => [shown, saidNumber(shown)]);
  return say.length ? {...scene, say} : scene;
}

/** {storyboard, recipe}: a film's own inputs. Throws, its `problems` listing everything a film cannot show, each at its place. */
export function filmFromBoard(board) {
  if (board.shape !== 'what-we-found') throw Object.assign(new TypeError(`a film draws "what-we-found" for now, and this board is "${board.shape}"`), {problems: [{at: 'shape', message: 'a film draws "what-we-found" for now'}]});
  const of = (part) => board.scenes.filter((s) => s.part === part), problems = [], scenes = [], stages = [];
  const say = (at, message) => problems.push({at, message});
  // a film's script reads braces as its own marks ({moment}, {@who}"…", {{role}}), and has no way to write one as a word: what a storyboard says stays words
  for (const s of board.scenes) {
    const words = [s.title, s.narration, s.beat.subtitle, s.beat.name, s.beat.line, ...(s.beat.points ?? [])];
    if (words.some((w) => w && /[{}]/.test(w))) say(s.id, 'has a brace, which a film would read as its own script: take it out');
  }
  const [title] = of('title'), found = of('found'), soloFound = found.length === 1 && found[0].title.length <= MOST_TITLED;
  const least = titleLines(title.title).length + (title.beat.subtitle ? 1 : 0) + 3;
  if (title.narration.trim().split(/\s+/).length < least) say('intro', `is too short for its title to be written while it is said: ${least} words at the least`);
  /** The moment these words start, or a problem: without one place to come in on, a card would land at the wrong moment. */
  const moment = (words, sceneText, at) => phraseOf(words, sceneText) ?? (say(at, 'is said more than once in its scene, so it has no moment of its own: reword it'), words.trim());
  scenes.push({id: 'title', title: title.title, narration: title.narration});
  for (const part of ['checked', 'found', 'unsure']) {
    chunks(of(part), PER_STAGE).forEach((told, page) => {
      const id = page ? `${part}-${page + 1}` : part, narration = told.map((s) => sentence(s.narration)).join(' ');
      scenes.push({id, title: board.labels[part], narration});
      const cards = told.map((s) => {
        const card = cardOf(s, soloFound);
        if (card.text.length > MOST_ON_CARD) say(s.id, `says ${card.text.length} characters on its card, and ${MOST_ON_CARD} fit in a film: shorten it`);
        return {at: [id, moment(s.narration, narration, s.id)], ...card};
      });
      // the label says the part: as the chip above a headline of its own, or as the title itself, never as both
      stages.push(part === 'found' && soloFound ? {type: 'summary', scene: id, chip: board.labels[part], title: found[0].title, cards} : {type: 'summary', scene: id, title: board.labels[part], cards});
    });
  }
  const [last] = of('next'), pages = chunks(last.beat.points, PER_STAGE);
  pages.forEach((points, page) => {
    const id = page ? `next-${page + 1}` : 'next', said = points.map(sentence).join(' ');
    const narration = page === pages.length - 1 ? `${said} ${sentence(last.narration)}` : said;
    scenes.push({id, title: board.labels.next, narration});
    const cards = points.map((text) => {
      if (text.length > MOST_ON_CARD) say('next', `says ${text.length} characters on its card, and ${MOST_ON_CARD} fit in a film: shorten it`);
      return {at: [id, moment(text, said, 'next')], head: '', text};
    });
    stages.push({type: 'summary', scene: id, title: board.labels.next, cards});
  });
  if (problems.length) throw Object.assign(new TypeError(`this storyboard has ${problems.length} problem${problems.length === 1 ? '' : 's'} a film cannot show:\n- ${problems.map((p) => `${p.at} ${p.message}`).join('\n- ')}`), {problems});
  return {storyboard: {title: board.title, scenes: scenes.map(withNumbersSaid)}, recipe: {story: titleStory(title), stages}};
}
