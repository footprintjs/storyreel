/**
 * Stage 19 of the compile: what is drawn where (regions.mjs) — every box on the frame at t with the recipe entry that
 * drew it, through the same views the drawing uses (the sheet, the thought cloud, the push-in, the spotlight, then
 * the director's push, the focus and the camera); the world on screen at t; and the one thing called a name at t
 * (named), which pushes, camera moves, entrances and reads frame. Its own stage because the preview studio, the
 * checks and every framing by name read it, and it must agree with the drawing box for box.
 *
 * Reads: recipe, paper, stages, push, card, geo, storyWorld, boardEnd, TURN, MOVE0, MOVE1, moveTo, centrePlace, shots,
 * shotAt, guesses, stepsTrack, rewinding, teaser, recapStage, pictureClock, stateAt, stageSpec, kitCardBox, spotOf,
 * spotCamera, pushInCamera; at call time underView and camerawork (the camera stage).
 * Writes: storyPath, stagePath(st), worldOnScreen(t), shotRegions(shot, t), regionsAt(t), regionsUnder(t), named(name,
 * t), namedIn(regions, name, t).
 */
import {createCanvas} from '@napi-rs/canvas';
import {inOut as ease} from '../ease.mjs';
import {makePen} from '../pen.mjs';
import {GUESS_PLACES, GUESS_FLIP, cardPlacement, cardRowBoxes, stageBoxes, rewindAt} from '../kits/paper/paper.mjs';
import {stepsTrackBox} from '../kits/paper/steps-track.mjs';
import {view, compose, about, through} from '../regions.mjs';
import {thoughtAt, thoughtCamera} from '../thought/index.mjs';
import {into} from './util.mjs';

export function regionsStage(state) {
  const {recipe, paper, stages, push, card, geo, storyWorld, boardEnd, TURN, MOVE0, MOVE1, moveTo, centrePlace, shots, shotAt, guesses, stepsTrack, rewinding,
    teaser, recapStage, pictureClock, stateAt, stageSpec, kitCardBox, spotOf, spotCamera, pushInCamera} = state;
  // What is drawn where, for the preview studio (regions.mjs): each box names the recipe entry that drew it.
  const storyPath = recipe.story ? 'story' : 'whiteboard', stagePath = st => `stages[${stages.indexOf(st)}]`;
  const measure = makePen(createCanvas(8, 8).getContext('2d'), paper, {baseScale: 1});
  /** A world's view on the frame at t: its sheet hung on the paper (or in its cloud, as it opens), then the push-in's and the spotlight's cameras. */
  function worldView(w, t, spot, camera = null) {
    let v = view(w.S, w.BX, w.BY);
    if (w.frame) v = compose(about(thoughtCamera(w.frame.cloud, t - w.thoughtFrom)), v);
    if (camera) v = compose(about(camera), v);
    if (spot) v = compose(about(spotCamera(w, spot)), v);
    return v;
  }
  /** The world on screen at t (the part of the recipe that draws it, and its view), or null on paper. */
  function worldOnScreen(t) {
    if (push) {
      if (t >= boardEnd && ease((t - boardEnd - TURN * .45) / (TURN * .45)) >= .5) return null;
      return {w: storyWorld, path: storyPath, until: boardEnd, view: worldView(storyWorld, t, t < boardEnd ? spotOf(storyWorld, t) : null, t >= boardEnd ? pushInCamera(t) : null)};
    }
    return shotWorld(shots[shotAt(t)], t);
  }
  /** A shot's world at t (the part of the recipe that draws it, and its view), or null for a shot on paper or a thought cloud not yet open. */
  function shotWorld(shot, t) {
    if (shot.world?.frame && !(thoughtAt(shot.world.frame.cloud, t - shot.world.thoughtFrom).open > 0)) return null;
    const st = shot.world && stages.find(s => s.world === shot.world);
    return shot.world ? {w: shot.world, path: st ? `${stagePath(st)}.world` : storyPath, until: Infinity, view: worldView(shot.world, t, spotOf(shot.world, t))} : null;
  }
  /** Which reveal made a code line appear: its recipe entry. */
  const lineEntry = (st, i) => st.code?.allAt ? `${stagePath(st)}.code.allAt` : (k => k >= 0 ? `${stagePath(st)}.reveal[${k}]` : `${stagePath(st)}.code`)((st.reveal ?? []).findIndex(([n]) => n === i));
  function stageRegions(st, t) {
    const sp = stagePath(st), out = [], spec = stageSpec(st, t);
    // A stage that draws the whole page itself (a kit's, a recap, a summary) answers for the page; a kit may say more (kit.regions).
    if (spec.panel === false) out.push({box: [0, 0, 1600, 900], path: sp, label: `the ${st.type} stage`});
    const say = {title: () => [`${sp}.title`, st.title], panel: () => [sp, st.file ?? st.title], footer: () => [`${sp}.footer`, st.footer?.text],
      line: i => [lineEntry(st, i), st.lines[i].map(([text]) => text).join('').trim()], mark: k => [`${sp}.marks[${k}]`, st.marks[k].icon],
      focus: k => [`${sp}.focus[${k}]`, `lines ${st.focus[k].lines.join('–')}`], list: n => [`${sp}.list[${n}]`, st.list[n].what]};
    // A mark is an icon, ink that is not words: the review finds words laid over it and one half off the frame (Region.drawing).
    for (const b of stageBoxes(spec)) { const [path, label] = say[b.part](b.index); out.push({box: b.box, path, label: String(label ?? ''), ...(b.part === 'mark' ? {drawing: true} : {})}); }
    for (const r of st.kit?.regions?.(st.handle, t, push ? kitCardBox() : null) ?? []) out.push({box: r.box, path: `${sp}.${r.path}`, label: r.label ?? '', ...(r.name ? {name: r.name} : {}), ...drawn(r)});
    return out;
  }
  function cardRegions(t, now) {
    const move = Math.max(0, Math.min(1, (t - MOVE0) / (MOVE1 - MOVE0))), {box, camera} = cardPlacement(geo, card, {move, center: now.centre, aside: moveTo, loop: centrePlace}), v = about(camera);
    // The card is a drawing that holds its rows: a word inside it is its own, one laid across its edge is over it.
    return [{box: through(v, box), path: 'card', label: card.header ?? 'the card', drawing: true, holds: [through(v, box)]}, ...cardRowBoxes(geo, card).map(r => ({box: through(v, r.box), path: `card.rows[${r.index}]`, label: r.label}))];
  }
  function guessBox(g, t) {
    const text = g.answer && t >= g.end + GUESS_FLIP ? g.answer : g.question, w = Math.min(1440, measure.measure(text, 54, {display: true, weight: 700}) + 230), cy = GUESS_PLACES[g.place];
    return [800 - w / 2, cy - 75, 800 + w / 2, cy + 75];
  }
  /**
   * A kit's word that a region is a drawing — `drawing: true` and nothing else — and the boxes of it that frame words
   * (`holds`: a list of boxes; anything else is left out), seen through the view its region is (v: none on the page).
   */
  const isBox = b => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite);
  const drawn = (r, v = null) => {
    if (r.drawing !== true) return {};
    const rooms = Array.isArray(r.holds) ? r.holds.filter(isBox).slice(0, 64) : [];
    return {drawing: true, ...(rooms.length ? {holds: rooms.map(b => (v ? through(v, b) : b))} : {})};
  };
  /** A region seen through a view: its box and its rooms. */
  const seen = (v, r) => ({...r, box: through(v, r.box), ...(r.holds ? {holds: r.holds.map(b => through(v, b))} : {})});
  /** What is drawn where at t: [{box: [x0, y0, x1, y1], path, label, name?, drawing?, holds?}] on the frame, in drawing order. */
  function regionsAt(t) {
    if (teaser && t >= teaser.at) return [{box: [0, 0, 1600, 900], path: `${stagePath(recapStage)}.teaser`, label: 'the teaser'}];
    // In a steps track's rewind cue the picture is an earlier moment's (drawFrame): its regions are that moment's.
    const at = rewinding(t) ? rewindAt((t - stepsTrack.rewind.from) / stepsTrack.rewind.seconds, stepsTrack.rewind.from, stepsTrack.rewind.to) : t;
    const out = regionsUnder(pictureClock(at));
    // Through the push and the focus (underView), then the camera's moves (a rolled box: the box that holds it).
    const under = state.underView(at), framed = under ? out.map(r => seen(under, r)) : out;
    const lens = state.camerawork?.viewOn(at), shown = lens ? framed.map(r => seen(lens, r)) : framed;
    guesses.forEach((g, n) => { if (at >= g.start && at <= g.until + .5) shown.push({box: guessBox(g, at), path: `guesses[${n}]`, label: g.question}); });
    const band = stepsTrack && stepsTrackBox(stepsTrack, t);
    if (band) shown.push({box: band, path: 'stepsTrack', label: 'the steps track'});
    return shown;
  }
  /** What is drawn where at t before any director's push: the world's (or the page's) regions, on the frame. */
  function regionsUnder(t) {
    if (teaser && t >= teaser.at) return [{box: [0, 0, 1600, 900], path: `${stagePath(recapStage)}.teaser`, label: 'the teaser'}];
    if (!push) return shotRegions(shots[shotAt(t)], t);
    const world = worldOnScreen(t);
    if (world) return worldRegions(world, t);
    const out = [], now = stateAt(t);
    if (now.fade > 0) out.push(...cardRegions(t, now));
    for (const [st] of now.shown) out.push(...stageRegions(st, t));
    return out;
  }
  /** A world's regions on the frame: the world itself, then each thing its kit says it draws (regionsAt), through the world's view. */
  function worldRegions(world, t) {
    // `sheet`: this box is the 1600×900 sheet the world's items are written on (fix/places.mjs · sheetOf holds a drawing to it).
    const out = [{box: through(world.view, [0, 0, 1600, 900]), path: world.path, label: `the ${world.w.kit} world`, sheet: true}];
    for (const r of world.w.instance.regionsAt?.(Math.min(t, world.until)) ?? []) out.push({box: through(world.view, r.box), path: `${world.path}.${r.path}`, label: r.label ?? '', ...(r.name ? {name: r.name} : {}), ...drawn(r, world.view)});
    return out;
  }
  /** One shot's regions at t, on screen or not (a film without a pushIn): its world's, or its stages' on the page. */
  function shotRegions(shot, t) {
    const world = shotWorld(shot, t);
    if (world) return worldRegions(world, t);
    const out = [];
    shot.stages.forEach((st, k) => { const next = shot.stages[k + 1]; if (Math.min(k === 0 ? 1 : into(st, t, .2, .45), next ? 1 - into(next, t, .65, .45) : 1) > 0) out.push(...stageRegions(st, t)); });
    return out;
  }
  /**
   * The box of the one thing called `name` at t (a kit names things in its regions: regionsAt → {name}),
   * for a push that frames it (notes.mjs · FRAMINGS). Nothing by that name, or two, refuses.
   */
  const named = (name, t) => namedIn(regionsUnder(t), name, t);
  function namedIn(regions, name, t) {
    const hits = regions.filter(r => r.name === name);
    if (hits.length === 1) return hits[0].box;
    if (hits.length > 1) throw new Error(`${hits.length} things are called "${name}" at ${t.toFixed(2)} s; a name frames one thing`);
    const names = [...new Set(regions.map(r => r.name).filter(Boolean))];
    throw new Error(`nothing in the picture is called "${name}" at ${t.toFixed(2)} s; ${names.length ? `the names there are ${names.join(', ')}` : 'nothing there has a name (a kit names things in regionsAt: {box, path, label, name})'}`);
  }
  Object.assign(state, {storyPath, stagePath, worldOnScreen, shotRegions, regionsAt, regionsUnder, named, namedIn});
}
