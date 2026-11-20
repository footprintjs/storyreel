/**
 * Stage 9 of the compile: the plan of the shots (shots.mjs) — what each is for, what is true when it starts and ends
 * (one shot's start must agree with what the shots before it left), what the viewer must take in (its reads, each on
 * a phrase), and its answers to the five scene questions (progression.mjs), in film order. Its own stage because the
 * plan is checked here and read again by the watching, reading and record stages.
 *
 * Reads: recipe, storyboard, clock, story, stages, storyIntent, storyContinuity, storyReads, storyQuestions.
 * Writes: storyPathName, readRefs, plan, facts, progressionRule, progression, asked.
 */
import {readIntent, readContinuity, joinContinuity, checkContinuity, readReads} from '../shots.mjs';
import {readQuestions, checkProgression, progressionMode, progressionRefusal} from '../progression.mjs';

export function planShots(state) {
  const {recipe, storyboard, clock, story, stages, storyIntent, storyContinuity, storyReads, storyQuestions} = state;
  // The plan of the shots (shots.mjs): what each is for, and what is true when it starts and ends — one
  // shot's start must agree with what the shots before it left.
  const storyPathName = recipe.story ? 'story' : 'whiteboard';
  // Reads (shots.mjs · readReads): what the viewer must take in, each on a phrase (resolved here, so the record
  // logs it). Each keeps its declared index (k), so a problem names the read the recipe wrote; a read's phrase
  // is when something is taken in, not something new to see, so it is no moment (readRefs, below).
  const readRefs = new Set();
  const timedReads = (value, where) => readReads(value, where).map((r, k) => { readRefs.add(value[k].at); return {...r, k, t: clock.at(value[k].at)}; });
  const plan = [{path: storyPathName, where: 'the story', scene: storyboard.scenes[0]?.id, from: 0, stage: null,
    intent: readIntent(storyIntent, 'the story'), continuity: joinContinuity(readContinuity(storyContinuity, 'the story'), story.continuity, 'the story'), reads: timedReads(storyReads, 'the story'), questions: storyQuestions, ...ledgerOf(story, 'the story')},
  ...stages.map((st, i) => ({path: `stages[${i}]`, where: `stage ${st.scene}`, scene: st.scene, from: st.start, stage: st,
    intent: readIntent(st.intent, `stage ${st.scene}`), continuity: joinContinuity(readContinuity(st.continuity, `stage ${st.scene}`), st.world?.instance.continuity, `stage ${st.scene}`), reads: timedReads(st.reads, `stage ${st.scene}`), questions: readQuestions(st, `stage ${st.scene}`), ...ledgerOf(st.world?.instance, `stage ${st.scene}`)}))];
  // Film order is time order: a recipe may list its stages in any order, the plan never does.
  plan.sort((a, b) => a.from - b.from);
  plan.forEach((u, i) => { u.to = plan[i + 1]?.from ?? clock.total; });
  const facts = checkContinuity(plan);
  // The five scene questions (progression.mjs): one evolving world, read in film order — reported, or refused.
  const progressionRule = progressionMode(recipe.progression), progression = checkProgression(plan), asked = plan.some(u => u.questions);
  if (progressionRule === 'refuse' && !asked) throw new Error('progression: "refuse" checks the shots\' answers to the five scene questions, and no shot gives one: answer them on the story and the stages ("exists", "changed", "why", "opens", "remains"), or leave progression out');
  if (progressionRule === 'refuse' && progression.length) throw new Error(progressionRefusal(progression));
  Object.assign(state, {storyPathName, readRefs, plan, facts, progressionRule, progression, asked});
}

/** A world's optional `ledger` (its continuity record, beat by beat: the stage's), checked and kept for the shot: {ledger} or {}. */
function ledgerOf(instance, where) {
  const ledger = instance?.ledger;
  if (ledger === undefined) return {};
  if (!Array.isArray(ledger) || !ledger.every(e => e && typeof e === 'object' && Number.isFinite(e.at))) throw new Error(`${where}: its world's ledger is a list of {at, …} (its continuity record, beat by beat), not ${JSON.stringify(ledger)?.slice(0, 80)}`);
  return {ledger};
}

