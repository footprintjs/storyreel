/**
 * Stage 6 of the compile: the story — its kit draws the opening world on a sheet (1600×900) that hangs on the paper —
 * and, when the film pushes in, the push-in: the card the camera pushes into, when it starts, how long it turns, and
 * where the prop sits on the page. Its own stage because the story is the film's first shot and the push-in's geometry
 * is what the card, the stages and the camera all measure from.
 *
 * Reads: recipe, notes, clock, compileWorld, hung.
 * Writes: storyIntent, storyContinuity, storyReads, storyQuestions, storySpec, story, push, card, boardEnd, TURN,
 * storyWorld, ZOOM, propCentre, geo.
 */
import {readQuestions, QUESTIONS} from '../progression.mjs';
import {readThought} from '../thought/index.mjs';

export function buildStory(state) {
  const {recipe, notes, clock} = state;
  // The story: its kit draws the opening world on a sheet (1600×900) that hangs on the paper.
  const {intent: storyIntent, continuity: storyContinuity, reads: storyReads, frame: storyFrame, ...storyRest} = recipe.story ?? {kit: 'whiteboard', ...recipe.whiteboard};
  // Its answers to the five scene questions are the engine's too (progression.mjs): read, then left out of what the kit gets.
  const storyQuestions = readQuestions(storyRest, 'the story'), storySpec = Object.fromEntries(Object.entries(storyRest).filter(([key]) => !QUESTIONS.includes(key)));
  const story = state.compileWorld(storySpec, 'the story');
  // A film may be story only (no push-in, no card, no paper stages).
  const push = recipe.pushIn ?? null;
  if (push && storyFrame !== undefined) throw new Error('the story: a frame is for a film without a pushIn (the camera pushes into the story\'s page, which hangs on the paper): leave frame out, or the pushIn');
  if (recipe.card && !push) throw new Error('The recipe has a card and no pushIn: the card is the story prop the camera pushes into');
  const card = recipe.card ?? {prop: [700, 350, 900, 550], rows: [], template: {}, aside: {at: [800, 450], scale: 1}};
  const boardEnd = push ? clock.spokenEnd(push.after) + push.rest : Infinity, TURN = (push?.turn ?? 1) / notes.speed;
  const storyWorld = {...state.hung(story, {hang: push?.hang, frame: readThought(storyFrame, 'the story')}), kit: storySpec.kit}, {S, BX, BY} = storyWorld, ZOOM = push?.zoom ?? 1;
  // Geometry in 1600×900 units: the sheet hangs on the paper at scale S; the camera pushes into the prop.
  const onPage = (bx, by) => [BX + bx * S, BY + by * S];
  const propCentre = onPage((card.prop[0] + card.prop[2]) / 2, (card.prop[1] + card.prop[3]) / 2);
  const geo = {zoomScale: S * ZOOM, pushed: (bx, by) => { const [x, y] = onPage(bx, by); return [800 + (x - propCentre[0]) * ZOOM, 450 + (y - propCentre[1]) * ZOOM]; }};
  Object.assign(state, {storyIntent, storyContinuity, storyReads, storyQuestions, storySpec, story, push, card, boardEnd, TURN, storyWorld, ZOOM, propCentre, geo});
}
