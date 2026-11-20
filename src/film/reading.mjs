/**
 * Stage 25 of the compile: reading time (reading.mjs) and what the film shows (claims.mjs) — every line meant to be
 * read, the emphasis words and the captions as shown, each from when it is whole on screen to when it starts to leave;
 * when the example label and the labels on how a scene differs are up; every line long enough to read; and the reads,
 * one at a time, each while its shot is on screen and about a thing that is there. Its own stage because these lines
 * are the film's text: the reading check, the claims and the labels all read the one list it makes.
 *
 * Reads: recipe, storyboard, timings, clock, resolve, entries, attention, examples, declaredDiffers, plan, stages,
 * storyWorld, push, boardEnd, TURN, buildStage, MOVE0, guesses, stepsTrack, teaser, arrivalOf, named.
 * Writes: shown, labels, differsUp, lines, readingRule, reading, reads (and entries: a differs phrase's path).
 */
import {GUESS_FLIP} from '../kits/paper/paper.mjs';
import {stepsTrackLines} from '../kits/paper/steps-track.mjs';
import {labelSpans} from '../claims.mjs';
import {saidPath, saidRef} from '../differs.mjs';
import {tooShortToRead, readingMode, readingPace} from '../reading.mjs';
import {checkReads} from '../shots.mjs';

export function readingStage(state) {
  const {recipe, storyboard, timings, clock, resolve, entries, attention, examples, declaredDiffers, plan, stages, storyWorld, push, boardEnd, TURN,
    buildStage, MOVE0, guesses, stepsTrack, teaser, arrivalOf, named} = state;

  // Reading time (reading.mjs): every line meant to be read stays up, whole, long enough to read.
  // What the film shows (claims.mjs): every line meant to be read, the emphasis words and the captions as shown (a
  // number slot in its digits), each from when it is whole on screen to when it starts to leave, with its scene.
  const shownLines = readableLines(), sceneOf = t => clock.locate(t).index, captionsOf = (sc, i) => {
    if (sc.narration === undefined) return [];   // a silent scene's directions are never shown
    const words = clock.shownWords(i), line = words.map(w => w.text).join(' ');
    let offset = 0;   // where each word stands in the line
    return words.map(w => { const o = offset; offset += w.text.length + 1; return {text: w.text, line, offset: o, at: clock.offsets[i] + w.start, to: clock.offsets[i] + w.end, scene: i, path: 'captions'}; });
  };
  // An emphasis word is up from its beat until the next word's, or its own `until` (read again on the plain clock: no beat is logged twice).
  const emphasized = attention?.record?.emphasis?.words ?? [], untilOf = i => { const u = recipe.emphasis?.words?.[i]?.until; return u === undefined ? Infinity : resolve(u, 'at'); };
  const shown = [...shownLines.filter(l => Number.isFinite(l.from) && l.from < clock.total).map(l => ({text: l.text, at: Math.max(0, l.from), to: Math.min(clock.total, l.to), ...(l.gone !== undefined ? {gone: Math.min(clock.total, l.gone)} : {}), scene: sceneOf(Math.max(0, l.from)), path: l.path})),
    ...emphasized.map((w, i) => ({text: w.text, at: w.t, to: Math.min(untilOf(i), emphasized[i + 1]?.t ?? Infinity, clock.total), scene: sceneOf(w.t), path: `emphasis.words[${i}]`})),
    ...storyboard.scenes.flatMap(captionsOf)];
  // The example label (exampleLabel): over each example scene, and on while any line it shows is still on screen.
  const labels = state.labels = labelSpans(shown, {examples, scenes: storyboard.scenes.map((sc, i) => ({from: clock.offsets[i], to: clock.offsets[i] + timings.scenes[i].duration}))});
  // A scene's words on how it differs (differsLabel): over the scene, read as every line is; its phrases in the voice found
  // as every phrase is, each with every place it is said (the verdict needs one whole inside the part).
  const differsUp = state.differsUp = declaredDiffers.flatMap((d, i) => {
    if (!d) return [];
    const scene = storyboard.scenes[i].id, from = clock.offsets[i];
    const heard = d.said?.map((phrase, k) => {
      const ref = saidRef(scene, phrase);
      entries.set(ref, saidPath(i, k, d.said.length));
      clock.at(ref);
      return Object.freeze({phrase, places: Object.freeze(clock.places(scene, phrase).map(Object.freeze))});
    });
    return [Object.freeze({...d, scene, index: i, from, to: from + timings.scenes[i].duration, ...(heard ? {heard: Object.freeze(heard)} : {})})];
  });
  const lines = [...shownLines, ...labels.map(l => ({text: l.words, from: l.from, to: l.to, path: `storyboard.scenes[${l.scene}].example`})),
    ...differsUp.flatMap(d => d.shown.map(text => ({text, from: d.from, to: d.to, path: `storyboard.scenes[${d.index}].differs`})))];
  const readingRule = readingMode(recipe.reading), reading = tooShortToRead(lines, readingPace(recipe.reading));
  // Reads: one at a time, each while its shot is on screen — from when it starts to arrive until the next one
  // does — with its time before the shot leaves, each about a thing that is there the whole time it needs.
  const leavesAt = i => plan[i + 1] ? (plan[i + 1].stage ? arrivalOf(plan[i + 1].stage).from : plan[i + 1].from) : (teaser ? teaser.at : clock.total);
  const reads = plan.flatMap((u, i) => checkReads(u.reads, {from: u.stage ? arrivalOf(u.stage).from : 0, to: leavesAt(i), where: u.where}).map(r => {
    const out = {path: `${u.path}.reads[${r.k}]`, what: r.what, at: +r.t.toFixed(3), min: r.min, ...(r.region ? {region: r.region} : {}), ...(r.problem ? {problem: r.problem} : {})};
    if (r.region && !out.problem) for (const t of Array.from({length: Math.floor(r.min / .1) + 1}, (_, k) => Math.min(clock.total, r.t + Math.min(r.min - .02, .02 + k * .1)))) {
      try { named(r.region, t); } catch (e) { out.problem = `${u.where}: "${r.what}" is about "${r.region}" for ${r.min} s from ${r.t.toFixed(2)} s: ${e.message}`; break; }
    }
    return out;
  })).sort((a, b) => a.at - b.at || a.path.localeCompare(b.path));
  const readProblems = reads.filter(r => r.problem);
  if (readingRule === 'refuse' && readProblems.length) throw new Error(`Reads that cannot land (the recipe says reading: "refuse"): ${readProblems.slice(0, 3).map(r => r.problem).join('; ')}${readProblems.length > 3 ? `; and ${readProblems.length - 3} more` : ''}`);
  if (readingRule === 'refuse' && reading.length) throw new Error(`Too short to read (the recipe says reading: "refuse"): ${reading.slice(0, 3).map(l => `"${l.text}" (${l.path}) is up ${l.seconds} s and needs ${l.needs} s`).join('; ')}${reading.length > 3 ? `; and ${reading.length - 3} more` : ''}`);
  /** Every line the film shows to be read, with when it is whole on screen, when it starts to leave and (gone) when its last ink does. */
  function readableLines() {
    const lines = [], leaves = i => stages[i + 1] ? arrivalOf(stages[i + 1]).from : (teaser ? teaser.at : clock.total);
    // A line's `gone` (its last ink: an eraser's end) is held to the world's time on screen too, and never before its `to`.
    const worldLines = (w, prefix, from, to) => { for (const l of w.instance.texts?.() ?? []) lines.push({...l, path: `${prefix}.${l.path}`, from: Math.max(l.from, from), to: Math.min(l.to, to), ...(l.gone !== undefined ? {gone: Math.min(Math.max(l.gone, l.to), to)} : {})}); };
    worldLines(storyWorld, recipe.story ? 'story' : 'whiteboard', 0, push ? boardEnd + TURN * .45 : (stages[0] ? arrivalOf(stages[0]).from : clock.total));
    stages.forEach((st, i) => {
      const sp = `stages[${i}]`, whole = arrivalOf(st).to, gone = leaves(i);
      if (st.world) worldLines(st.world, `${sp}.world`, whole, gone);
      if (st.title && st.chrome !== false && !st.world) lines.push({text: st.title, from: whole, to: gone, path: `${sp}.title`});
      if (st.footerAt !== undefined) lines.push({text: st.footer.text, from: Math.max(whole, st.footerAt + .5), to: gone, path: `${sp}.footer`});
      (st.listAt ?? []).forEach((item, k) => lines.push({text: `${item.what} ${item.detail}`, from: Math.max(whole, item.t + .5), to: gone, path: `${sp}.list[${k}]`}));
      if (st.closingAt !== undefined) lines.push({text: st.closing.text, from: Math.max(whole, st.closingAt + .5), to: gone, path: `${sp}.closing`});
    });
    if (push && buildStage) lines.push({text: push.caption, from: boardEnd + TURN * .9, to: MOVE0, path: 'pushIn.caption'});
    guesses.forEach((g, n) => {
      lines.push({text: g.question, from: g.start + .35, to: g.answer ? g.end : g.until + .5, path: `guesses[${n}].question`});
      if (g.answer) lines.push({text: g.answer, from: g.end + 2 * GUESS_FLIP, to: g.until, path: `guesses[${n}].answer`});
    });
    if (stepsTrack) for (const l of stepsTrackLines(stepsTrack)) lines.push({...l, path: `stepsTrack.${l.path}.label`});
    return lines;
  }
  Object.assign(state, {shown, lines, readingRule, reading, reads});
}
