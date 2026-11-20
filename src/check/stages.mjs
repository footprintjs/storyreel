// stages — what each stage of a check does (the chart, chart.mjs, is wiring only). Each reads the run's wiring (`run`:
// what the caller gave it to do the work with) and writes on the scope what it found, in numbers and names: the
// record of a check then says what it read and why it answered as it did.
import {decide} from 'footprintjs';
import {problemsOf, sinceLast, KEYS_MOST} from './problems.mjs';

const count = (problems, level) => problems.filter(p => p.level === level).length;
const cut = text => { const said = String(text); return said.length > 300 ? `${said.slice(0, 299)}…` : said; };

/** Every phrase the film is keyed to, checked — and whether the film compiles at all. */
export const readAnchors = run => async s => {
  run.anchors = await run.does.anchors();
  s.phrasesChecked = run.anchors.checked;
  s.phraseProblems = run.anchors.notes.length;
  run.fromPhrases = problemsOf({anchors: run.anchors});
  s.phraseErrors = count(run.fromPhrases, 'error'); s.phraseAdvice = count(run.fromPhrases, 'advice');
  s.compiles = run.anchors.stopped === null;
  if (!s.compiles) s.stopped = cut(run.anchors.stopped);
};

/** The film read as a picture: its findings and its verdicts. Not run on a film that does not compile. */
export const reviewFilm = run => async s => {
  run.fromPicture = [];
  if (!s.compiles) { s.reviewed = false; s.pictureErrors = 0; s.pictureAdvice = 0; return; }
  run.review = await run.does.review();
  s.reviewed = true;
  s.findings = run.review.findings.length;
  run.fromPicture = problemsOf({review: run.review});
  s.pictureErrors = count(run.fromPicture, 'error'); s.pictureAdvice = count(run.fromPicture, 'advice');
  s.verdictsNotPassed = run.review.verdicts.filter(v => v.verdict !== 'passed').map(v => `${v.check}: ${v.verdict}`);
};

/** What the edit redraws, as the full render would: said beside the answer, never counted in it. One that cannot be read says why. */
export const readChanges = run => async s => {
  if (!s.compiles) { s.changesRead = false; return; }
  try { run.changes = await run.does.changes(); s.changesRead = true; } catch (e) { run.changes = `not read (${cut(e?.message ?? e)})`; s.changesRead = false; }
};

/** How many things ask for a fix: the phrases' and the picture's, added. Its own stage, so the record says exactly what the count was added from. */
export const countErrors = () => s => { s.errors = s.phraseErrors + s.pictureErrors; };

/** How much is advice, the same way. */
export const countAdvice = () => s => { s.advice = s.phraseAdvice + s.pictureAdvice; };

/**
 * This check beside the one before it. What it compares with comes from outside the run (the last check kept, and
 * each problem's key): the record holds the answer, and why.mjs says under every answer that it holds no more.
 */
export const compare = run => s => {
  const all = [...run.fromPhrases, ...run.fromPicture];
  run.problems = [...all.filter(p => p.level === 'error'), ...all.filter(p => p.level === 'advice')];
  run.keys = run.problems.map(p => p.key).slice(0, KEYS_MOST);
  run.since = sinceLast(run.keys, run.does.before());
  s.fixedSinceLast = run.since.fixed; s.newSinceLast = run.since.added; s.round = run.since.round;
};

/** The rules of the verdict, first match: broken before anything else, then anything to fix. */
export const VERDICT_RULES = Object.freeze([
  {when: {compiles: {eq: false}}, then: 'broken', label: 'the film does not compile, so nothing else could be read'},
  {when: {errors: {gt: 0}}, then: 'fix', label: 'there is something to fix'},
]);

/** The verdict, decided over what the stages wrote: broken, fix or clean. */
export const decideVerdict = () => s => {
  const d = decide(s, VERDICT_RULES, {branch: 'clean', label: 'the film compiles and nothing asks for a fix (advice asks for none)'});
  s.why = d.evidence.rules.find(r => r.matched)?.label ?? d.evidence.defaultLabel;
  return d;
};

/** One branch a verdict: it writes the verdict the reply's first line says. */
export const answer = (run, verdict) => s => { s.verdict = verdict; run.verdict = verdict; };
