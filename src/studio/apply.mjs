/**
 * Apply kept picks (picks.mjs) to a recipe, on a footprintjs flowchart, so every run keeps a record an agent can read —
 * which line, what kind, which rule took it or refused it and why:
 *
 *   read → line → which kind (a decider) → measure → takes it? (a decider) → keep the verdict → more lines? (loops) → apply
 *
 * Every line is checked before any is applied; one refusal and none is (each refusal says its reason — the rule's
 * label — and its fix). applyPicks works on the recipe as data (the studio's Try and Keep); applyLines on its JSON text,
 * keeping the text's layout (storyreel apply). No file is read or written here.
 *
 *   await applyLines(text, ['scene-05 enter torn', 'scene-03 move pop'], {scenes, catalog})
 *     → {text, changes: [{line, scene, kind, name, path, before, after}], record}
 */
import {flowChart, decide, narrative} from 'footprintjs';
import {TRANSITIONS} from '../transitions.mjs';
import {WORD_MOVES} from '../kits/kinetic/index.mjs';
import {addDecider} from '../decisions.mjs';
import {QUIET, plainNarrative} from '../record.mjs';
import {editableJson} from '../remake-starter-files.mjs';
import {PICK_FORM, lineFacts, putPicks, changeText} from './picks.mjs';

/** The most lines one run applies (each is a pass of the chart's loop, and the loop is bounded). */
export const MOST_LINES = 200;
const listed = names => names.join(', ');

// ── The checks: rule tables, decided with decide() so the record keeps the evidence ──────────────────────────────

/** Which kind of line: not a pick, an entrance, or a word move. */
const KIND = {rules: [
  {when: {form: {eq: false}}, then: 'not-a-pick', label: `it is not a pick: a pick is ${PICK_FORM}`},
  {when: {kind: {eq: 'enter'}}, then: 'enter', label: 'an entrance: it sets the enter of the stage that plays its scene'}],
fallback: {branch: 'move', label: 'a word move: it sets the move of its scene\'s kinetic world'}};

/**
 * Whether the film takes the line: its scene, the place its kind goes, and its name. Each refusal's label is its reason;
 * `fix` names what would do (the scenes that take one, the names this film has), for the message.
 */
const CHECK = {rules: [
  {when: {lineIs: {eq: 'not-a-pick'}}, then: 'refused', label: 'it is not a pick', fix: f => f.formError},
  {when: {sceneKnown: {eq: false}}, then: 'refused', label: 'its scene is not in the storyboard', fix: (f, film) => `the scenes are ${listed(film.scenes)}`},
  {when: {lineIs: {eq: 'enter'}, pushIn: {eq: true}}, then: 'refused', label: 'the film has a pushIn, which hands its stages over on one page, so no stage enters with a transition', fix: () => 'enter is for a film without one'},
  {when: {lineIs: {eq: 'enter'}, stagePlays: {eq: false}}, then: 'refused', label: 'no stage plays its scene, so nothing enters there (the story opens the film; a scene with no stage stays in the shot before it)',
    fix: f => (f.takes.length ? `a transition goes on a stage's scene: ${listed(f.takes)}` : 'this film has no stages')},
  {when: {lineIs: {eq: 'enter'}, inCatalog: {eq: false}}, then: 'refused', label: 'its name is not a transition of this film', fix: (f, film) => `the transitions are ${listed(Object.keys(film.catalog))}`},
  {when: {lineIs: {eq: 'enter'}, defaults: {eq: false}}, then: 'refused', label: 'its transition needs a setting a line cannot give (a pick takes a transition\'s defaults)',
    fix: f => `${f.settingsError.replace(`${f.pick.line}: `, '')}; give this one in the recipe ("enter": {"type": "${f.pick.name}", …})`},
  {when: {lineIs: {eq: 'move'}, kineticWorld: {eq: false}}, then: 'refused', label: 'its scene has no kinetic world (kits/kinetic), so there is no word to move',
    fix: f => (f.takes.length ? `the scenes with one are ${listed(f.takes)}` : 'this film has none: a word move is for kinetic type')},
  {when: {lineIs: {eq: 'move'}, moveKnown: {eq: false}}, then: 'refused', label: 'its name is not a move', fix: () => `name one a whole word makes: ${listed(WORD_MOVES)}`},
  {when: {lineIs: {eq: 'move'}, wholeWord: {eq: false}}, then: 'refused', label: 'its move is not an entrance a whole word makes', fix: () => `name one that is: ${listed(WORD_MOVES)}`}],
fallback: {branch: 'takes-it', label: 'its scene takes it, and its name is one this film has'}};

/** The table as decide() reads it: the rules without their fixes (its evidence is kept in the record, as plain data). */
const CHECK_TABLE = {rules: CHECK.rules.map(({fix, ...rule}) => rule), fallback: CHECK.fallback};
/** A refusal in words: the line, the rule's reason, its fix (a line that is no pick says so in the reader's own words). */
const refusalOf = (rule, f, film) => (f.facts.form ? `${f.pick.line}: ${rule.label} — ${rule.fix(f, film)}` : rule.fix(f, film));

// ── The chart ───────────────────────────────────────────────────────────────────────────────────────────────────

/** The chart for one run: `run` holds what the stages read (the recipe, the lines, the film) and what they decide. */
function applyChart(run) {
  let chart = flowChart('read', s => { s.lines = run.lines.length; s.n = 0; }, 'read', 'The lines to apply, checked against the film\'s scenes and transitions')
    .addFunction('line', s => {
      run.facts = lineFacts(run.recipe, run.lines[s.n], run.film);
      s.line = String(run.lines[s.n]); s.form = run.facts.facts.form; s.kind = run.facts.facts.kind; s.n += 1;
    }, 'line', 'The next line: whether it is a pick, and of which kind');
  chart = addDecider(chart, {name: 'which kind', id: 'kind', description: 'Which kind of line: an entrance, a word move, or not a pick', table: KIND, key: 'lineIs', about: s => s.line})
    .addFunction('measure', s => { const {form, kind, ...measures} = run.facts.facts; Object.assign(s, measures); }, 'measure', 'What is true of its scene and its name in this film');
  chart = addDecider(chart, {name: 'takes it?', id: 'check', description: 'Whether the film takes the line: its scene, its stage or kinetic world, its name', table: CHECK_TABLE, key: 'verdict', about: s => s.line})
    .addFunction('keep the verdict', s => {
      // Handed out of the scope: a plain copy, never its proxy.
      const why = structuredClone(s.$getValue('verdictWhy')), f = run.facts, rule = CHECK.rules.find(r => r.label === why.because);
      run.checked.push(s.verdict === 'takes-it' ? {pick: f.pick, place: f.place} : {refused: refusalOf(rule, f, run.film)});
      s.left = s.lines - s.n;
    }, 'keep-verdict', 'The line\'s verdict kept, with its reason')
    .addDeciderFunction('more lines?', s => decide(s, [{when: {left: {gt: 0}}, then: 'next-line', label: `${s.left} of the ${s.lines} lines ${s.left === 1 ? 'is' : 'are'} left`}],
      {branch: 'all-checked', label: s.lines === 1 ? 'the line is checked' : `all ${s.lines} lines are checked`}), 'more', 'Whether lines are left to check')
    .addFunctionBranch('next-line', 'check the next line', () => {}, undefined, {loopTo: 'line'})
    .addFunctionBranch('all-checked', 'every line checked', () => {})
    .setDefault('all-checked').end()
    .addFunction('apply', s => {
      const refused = run.checked.filter(c => c.refused);
      s.refused = refused.length;
      if (refused.length) return;   // one refusal and nothing is applied
      run.result = putPicks(run.recipe, run.checked);
      s.changes = run.result.changes.map(changeText);
    }, 'apply', 'With no line refused, each put in its place, in order (a later one of the same scene and kind wins); with one refused, none');
  return chart;
}

/**
 * The picks (lines, or {scene, kind, name}) applied to a copy of the recipe: {recipe, changes: [{line, scene, kind, name,
 * path, before, after}], record} — path where each went ("stages[3].enter"); the record the run's narrative, plain JSON.
 * Every line is checked before any is applied; when one or more refuse, nothing is, and the error lists each refusal
 * (error.refusals) and carries the record (error.record).
 * @param scenes   the film's scene ids (its storyboard's): the ones a line may name
 * @param catalog  the film's transitions (transitions.mjs · transitionCatalog(kits): its kits' are picks too)
 */
export async function applyPicks(recipe, lines, {scenes, catalog = TRANSITIONS} = {}) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) throw new Error('applyPicks: give the recipe (an object)');
  if (!Array.isArray(scenes) || !Array.isArray(lines) || !lines.length) throw new Error('applyPicks: give the lines (a list of one or more) and the film\'s scenes (its storyboard\'s ids)');
  if (lines.length > MOST_LINES) throw new Error(`applyPicks: at most ${MOST_LINES} lines at once, not ${lines.length}`);
  const run = {recipe, lines: lines.map(l => (l && typeof l === 'object' ? `${l.scene} ${l.kind} ${l.name}` : l)), film: {scenes, catalog}, checked: [], result: null};
  const trace = narrative();
  await applyChart(run).setLogger(QUIET).build().recorder(trace).run();
  const record = JSON.parse(JSON.stringify(plainNarrative(trace))), refusals = run.checked.filter(c => c.refused).map(c => c.refused);
  if (refusals.length) {
    const message = refusals.length === 1 ? refusals[0] : `${refusals.length} of ${lines.length} lines refuse:\n${refusals.map(r => `  ${r}`).join('\n')}`;
    throw Object.assign(new Error(message), {refusals, record});
  }
  return {...run.result, record};
}

/**
 * A JSON text's layout, as a writer for a new value: the one it was written in — JSON.stringify's, with its indent (two
 * spaces, four, a tab) or on one line — so an edit changes only the lines it changes; any other layout is written as a
 * person edits JSON (remake-starter-files.mjs · editableJson). A final line break is kept as it was.
 */
export function jsonLayout(text) {
  const value = JSON.parse(text), body = text.replace(/\r?\n$/, ''), end = body.length < text.length ? '\n' : '';
  const indent = /^[{[]\r?\n([ \t]+)\S/.exec(body)?.[1] ?? '';
  const written = [indent, ''].find(i => JSON.stringify(value, null, i) === body);
  return written === undefined ? v => `${editableJson(v)}${end}` : v => `${JSON.stringify(v, null, written)}${end}`;
}

/**
 * The lines applied to a recipe's JSON text (applyPicks): {text, changes, record} — the recipe's new text in its own
 * layout (jsonLayout). A refusal is applyPicks's: nothing is applied.
 */
export async function applyLines(recipeText, lines, {scenes, catalog} = {}) {
  let recipe;
  try { recipe = JSON.parse(recipeText); } catch (e) { throw new Error(`the recipe is not JSON (${e.message})`, {cause: e}); }
  const applied = await applyPicks(recipe, lines, {scenes, catalog});
  return {text: jsonLayout(recipeText)(applied.recipe), changes: applied.changes, record: applied.record};
}
