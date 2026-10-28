/**
 * Make one like this: a reference film's breakdown (breakdown.mjs) read as a draft plan for a film made here — its scenes,
 * its pace, how each scene comes in, and whether its song times it — every choice with its why, read from the
 * breakdown's numbers. Nothing is made: the plan is data, and the same in plain words (remake-text.mjs), for a person to
 * approve first; what a breakdown cannot know — the words, the pictures, the song — it lists as still to give.
 *
 * The plan is a footprintjs flowchart, so each choice is a decision with its evidence:
 *
 *   read    the breakdown checked; its shots grouped into scenes: a run of quick shots joined by hard cuts is one scene
 *           (a burst: one word or one picture a shot), any other shot a scene of its own
 *   pace    a decider: promo or lesson (footprint-story/motion · PACES), over the median shot and the cuts a minute
 *   beats   the breakdown's beats as the music rules read them: read or not, sure or not, the share of cuts on a beat
 *   music   a decider: time the film by its song (music first), lay the song under, settle the tempo first, or the
 *           beats were not read — over the breakdown's beats
 *   kinds   each scene decided: kinetic type, a montage, plain ground, a title, a still, a camera move, a moving picture
 *   plan    each scene's entrance (the reference's own, as a stage's `enter` names it), its bars under music first,
 *           and what is still to give
 */
import {flowChart, narrative} from 'footprintjs';
import {SECONDS} from 'footprint-story/motion';
import {decideWith, decideAll, decideMount, decided} from './decisions.mjs';
import {BEATS} from './beats.mjs';
import {MUSIC} from './music.mjs';
import {QUIET} from './record.mjs';
import {remakePlanText} from './remake-text.mjs';

export {remakePlanText};

/** The thresholds the plan's choices use. */
export const REMAKE = Object.freeze({
  quick: 1,          // seconds: a shot shorter than this is quick; quick shots joined by hard cuts are one scene (a burst)
  lettered: .5,      // a scene with this share of its shots lettered, or more, is words: kinetic type (a burst) or a title
  promoMedian: 1.5,  // seconds: half the shots shorter than this cut at a promo's pace …
  promoCuts: 30,     // … as does a film that cuts this often a minute, or more
  onBeat: .5,        // this share of the cuts judged against the beats, or more, on a beat: the film is cut to its song
});

const round = (v, digits = 3) => +v.toFixed(digits);
const percent = share => `${Math.round(share * 100)} %`;

// ── The choices: rule tables, decided with decide() so the record keeps the evidence ──────────────────────────

/** The pace a film made like it keeps (footprint-story/motion · PACES). */
const PACE = t => ({rules: [
  {when: {median: {lt: t.promoMedian}}, then: 'promo', label: `half its shots last less than ${t.promoMedian} s: a promo's pace`},
  {when: {cutsPerMinute: {gte: t.promoCuts}}, then: 'promo', label: `it cuts ${t.promoCuts} times a minute or more: a promo's pace`}],
fallback: {branch: 'lesson', label: `its shots hold (half last ${t.promoMedian} s or longer) and it cuts less than ${t.promoCuts} times a minute: a lesson's pace`}});

/** Whether a song times the film: the breakdown's beats, and how many of its cuts land on one. */
const SONG = t => ({rules: [
  {when: {beatsRead: {eq: false}}, then: 'not-read', label: 'the breakdown did not read the beats'},
  {when: {sure: {eq: false}}, then: 'unsure', label: 'the beat map is unsure of the tempo: settle it before a film is timed to it'},
  {when: {judgedCuts: {gt: 0}, onBeatShare: {gte: t.onBeat}}, then: 'music-first', label: `${percent(t.onBeat)} or more of its judged cuts land on a beat: it is cut to its song, so its song times it`}],
fallback: {branch: 'song-under', label: `fewer than ${percent(t.onBeat)} of its judged cuts land on a beat: its cuts follow the picture, so its words time it, with any song under`}});

/** What a scene is: one rule table for every scene (decisions.mjs · decideAll). */
const KIND = t => ({key: 'kind', noun: 'scene', rules: [
  {when: {shots: {gte: 2}, lettered: {gte: t.lettered}}, then: 'kinetic', label: `a run of quick shots, ${percent(t.lettered)} or more of them lettered: kinetic type, a word a shot`},
  {when: {shots: {gte: 2}}, then: 'montage', label: 'a run of quick shots, most of them without lettering: a montage, a picture a shot'},
  {when: {blank: {eq: true}}, then: 'blank', label: 'one shot of one colour: a beat of plain ground'},
  {when: {lettered: {gte: t.lettered}}, then: 'title', label: 'one shot, lettered: words held on screen'},
  {when: {motion: {eq: 'still'}}, then: 'still', label: 'one shot, nothing in it moving: a still picture'},
  {when: {motion: {eq: 'camera'}}, then: 'camera', label: 'one shot, the whole picture moving together: a camera move over a picture'}],
fallback: {branch: 'moving', label: 'one shot, things moving inside the frame: a moving picture'}});

/** The scene kinds, in the order the rules try them. */
export const SCENE_KINDS = Object.freeze([...KIND(REMAKE).rules.map(r => r.then), KIND(REMAKE).fallback.branch]);

/** A decider and one branch per verdict, each writing it under `key` (two rules may give one verdict). */
function addDecider(chart, {name, id, description, table, key}) {
  let list = chart.addDeciderFunction(name, decideWith(table, `${key}Why`), id, description);
  for (const verdict of new Set([...table.rules.map(r => r.then), table.fallback.branch])) list = list.addFunctionBranch(verdict, verdict, s => { s[key] = verdict; });
  return list.setDefault(table.fallback.branch).end();
}

// ── Read: the breakdown checked, its shots grouped into scenes ─────────────────────────────────────────────

const SPEC = 'a breakdown\'s spec (breakdown.json, or breakdown(file).spec): {schemaVersion: 1, file, video, shots, transitions, flashes, pacing, audio}';

/** The breakdown, checked as far as the plan reads it: a wrong one refuses, naming what a breakdown gives. */
function readSpec(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error(`remakePlan: give ${SPEC}`);
  if (spec.spec && typeof spec.spec === 'object') throw new Error('remakePlan: this is what breakdown() returns; give its spec (breakdown(file).spec), or read breakdown.json');
  if (spec.schemaVersion !== 1) throw new Error(`remakePlan: give ${SPEC}; this one has schemaVersion ${JSON.stringify(spec.schemaVersion)} (run storyreel breakdown again with this version)`);
  if (!Array.isArray(spec.shots) || !spec.shots.length) throw new Error(`remakePlan: give ${SPEC}; its shots are a list of one shot or more`);
  spec.shots.forEach((x, i) => {
    if (!x || !Number.isFinite(x.index) || !Number.isFinite(x.start) || !Number.isFinite(x.end) || !Number.isFinite(x.seconds) || typeof x.in?.kind !== 'string' || typeof x.motion?.verdict !== 'string' || typeof x.text?.verdict !== 'string')
      throw new Error(`remakePlan: shots[${i}] is a breakdown's shot, {index, start, end, seconds, in: {kind}, motion: {verdict}, text: {verdict}} (run storyreel breakdown again)`);
  });
  if (!spec.video || !Number.isFinite(spec.video.seconds) || typeof spec.video.sound !== 'boolean') throw new Error(`remakePlan: give ${SPEC}; its video names its seconds and whether it has sound`);
  if (!Array.isArray(spec.flashes)) throw new Error(`remakePlan: give ${SPEC}; its flashes are a list ([] when there are none)`);
  if (!spec.pacing || !Number.isFinite(spec.pacing.median) || !Number.isFinite(spec.pacing.cutsPerMinute)) throw new Error(`remakePlan: give ${SPEC}; its pacing names the median shot and the cuts a minute`);
  if (!spec.audio?.beats || typeof spec.audio.beats.ran !== 'boolean') throw new Error(`remakePlan: give ${SPEC}; its audio.beats says whether the beats were read ({ran: false, why} or the beats)`);
  const b = spec.audio.beats;
  if (b.ran && !(Number.isFinite(b.bpm) && b.bpm > 0 && typeof b.sure === 'boolean' && Array.isArray(b.cuts) && b.cuts.every(c => c && (c.onBeat === null || typeof c.onBeat === 'boolean')) && Number.isFinite(b.onBeat)))
    throw new Error('remakePlan: its audio.beats were read, so they give {ran: true, bpm, sure, cuts: [{onBeat}], onBeat}, as storyreel breakdown --beats writes them (run it again)');
  return spec;
}

/** The thresholds, checked: each a known name and a number, more than 0 (a share at most 1). */
function readThresholds(thresholds = {}) {
  if (!thresholds || typeof thresholds !== 'object' || Array.isArray(thresholds)) throw new Error(`remakePlan: thresholds is an object, {quick: 1.5}, not ${JSON.stringify(thresholds)}`);
  for (const [k, v] of Object.entries(thresholds)) {
    if (!Object.hasOwn(REMAKE, k)) throw new Error(`remakePlan: "${k}" is not a threshold; the thresholds are ${Object.keys(REMAKE).join(', ')}`);
    if (!(Number.isFinite(v) && v > 0)) throw new Error(`remakePlan: thresholds.${k} is a number more than 0, not ${JSON.stringify(v)}`);
    if ((k === 'lettered' || k === 'onBeat') && v > 1) throw new Error(`remakePlan: thresholds.${k} is a share, more than 0 and at most 1 (0.5), not ${v}`);
  }
  return {...REMAKE, ...thresholds};
}

/**
 * The scenes: a quick shot that a hard cut joins to a run of quick shots joins it (a burst); any other shot starts a
 * scene. Each with its shots, its time and the measures the kind rules read.
 */
function scenesOf(shots, t) {
  const scenes = [];
  for (const shot of shots) {
    const quick = shot.seconds < t.quick, last = scenes.at(-1);
    if (last?.burst && quick && shot.in.kind === 'cut') last.shots.push(shot);
    else scenes.push({burst: quick, shots: [shot]});
  }
  return scenes.map((x, i) => {
    const first = x.shots[0], lettered = x.shots.filter(s => s.text.verdict === 'text').length;
    return {id: `scene-${String(i + 1).padStart(2, '0')}`, from: first.start, to: x.shots.at(-1).end, shots: x.shots,
      measures: {shots: x.shots.length, lettered: round(lettered / x.shots.length), blank: x.shots.length === 1 && first.blank === true, motion: first.motion.verdict}};
  });
}

/** The beats as the music rules read them: read or not, sure or not, and the share of the judged cuts on a beat. */
function beatMeasures(beats) {
  if (!beats.ran) return {beatsRead: false, sure: null, judgedCuts: 0, onBeatShare: 0};
  const judged = beats.cuts.filter(c => c.onBeat !== null).length;
  return {beatsRead: true, sure: beats.sure !== false, judgedCuts: judged, onBeatShare: judged ? round(beats.onBeat / judged) : 0};
}

function readStage(s, run) {
  const {spec, t} = run;
  run.scenes = scenesOf(spec.shots, t);
  s.file = spec.file; s.shots = spec.shots.length; s.scenes = run.scenes.length;
  s.median = spec.pacing.median; s.cutsPerMinute = spec.pacing.cutsPerMinute;
  s.sceneMeasures = run.scenes.map(x => ({at: x.from, measures: x.measures}));
}

// ── Plan: each scene's entrance, bars and what is still to give ─────────────────────────────────────────────

/** A transition's seconds kept inside what a transition may take (footprint-story/motion · SECONDS). */
const within = seconds => Math.min(SECONDS[1], Math.max(SECONDS[0], seconds));

/**
 * How a scene comes in, as a stage's `enter` names it, from how the reference's shot comes in: a hard cut is a cut, a
 * dissolve a fade, a dip or a fade in from one colour a dip; a change quicker than any transition takes is a cut. The
 * first scene has none: a film starts on its first picture.
 */
function entranceOf(scene, i) {
  const edge = scene.shots[0].in, took = Number.isFinite(edge.seconds) ? round(edge.seconds, 2) : null;
  if (i === 0) return {enter: null, because: edge.kind === 'fade-in' ? `the reference opens with a fade in${took ? ` (${took} s)` : ''}; a film here starts on its first picture` : 'the film starts on it'};
  if (edge.kind === 'cut') return {enter: 'cut', because: 'the reference cuts to it'};
  const as = {dissolve: 'fade', dip: 'dip', 'fade-in': 'dip'}[edge.kind] ?? 'fade', said = {dissolve: 'dissolves to it', dip: 'dips through one colour to it', 'fade-in': 'fades it in from one colour'}[edge.kind] ?? `comes in by a ${edge.kind}`;
  if (took !== null && took < SECONDS[0]) return {enter: 'cut', because: `the reference ${said} in ${took} s, quicker than any transition takes (${SECONDS[0]} s): a cut`};
  if (took === null) return {enter: as, because: `the reference ${said}: a ${as}`};
  const seconds = within(took);
  return {enter: {type: as, seconds}, because: `the reference ${said} in ${took} s: a ${as}${seconds !== took ? ` of ${seconds} s, the longest a transition takes` : ''}`};
}

/** The entrance most scenes after the first come in by, and how many do. */
function commonEntrance(scenes) {
  const counts = new Map();
  for (const x of scenes.slice(1)) { const type = typeof x.enter === 'string' ? x.enter : x.enter.type; counts.set(type, (counts.get(type) ?? 0) + 1); }
  const [type, count] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
  return type === undefined ? null : {type, scenes: count, of: scenes.length - 1};
}

/**
 * Bars for music first (music.mjs · beatTimings): the whole bars nearest a scene's seconds at the song's tempo, one at
 * least and at most MUSIC.mostBars (a longer scene is cut to it, and `longer` says so); a kinetic scene enough for one
 * beat a word, its words `every` beats apart (as many as fit, at most MUSIC.mostEvery).
 */
function barsOf({kind, seconds, words}, bpm) {
  const near = Math.max(1, Math.round(seconds / (BEATS.meter * 60 / bpm))), fit = kind === 'kinetic' ? Math.max(near, Math.ceil(words / BEATS.meter)) : near;
  const bars = Math.min(MUSIC.mostBars, fit), longer = fit > MUSIC.mostBars ? {longer: fit} : {};
  if (kind !== 'kinetic') return {bars, ...longer};
  return {bars, every: Math.max(1, Math.min(MUSIC.mostEvery, Math.floor(bars * BEATS.meter / words))), ...longer};
}

/** What a scene still needs from a person, by its kind: its words, its pictures, or nothing (plain ground). */
function sceneTodo({id, kind, words, camera}) {
  const what = {kinetic: `${words} words, one a shot, in the order they land`, montage: `${words} pictures, one a shot`, title: 'the words it holds on screen',
    still: 'a picture', camera: `a picture for the camera to move over${camera ? ` (it moves ${camera})` : ''}`, moving: 'a moving picture: footage, or a world that moves'}[kind];
  return what ? [{scene: id, give: kind === 'kinetic' || kind === 'title' ? 'words' : 'pictures', what}] : [];
}

/** What the music still needs: a song, its tempo settled, or its beats read; or the words' timing, when no song times it. */
function musicTodo(music, spec) {
  if (music.verdict === 'music-first') return [{give: 'song', what: `a song at about ${music.bpm} BPM, and its beat map (beatMap): beatTimings times the film by it`}];
  const timing = {give: 'timing', what: 'what times the words: a voice (narration), or evenTimings for a silent film'};
  if (music.verdict === 'unsure') return [{give: 'tempo', what: `the tempo you hear: storyreel breakdown ${spec.file} --beats --bpm <n>, then plan again`}, timing];
  if (music.verdict === 'not-read' && spec.video.sound) return [{give: 'beats', what: `the beats, read: storyreel breakdown ${spec.file} --beats, then plan again`}, timing];
  return [timing];
}

function planStage(s, run) {
  // The plan is handed out: plain copies of what the scope holds, never its proxies or its committed values.
  const plain = key => structuredClone(s.$getValue(key));
  const {spec} = run, kinds = structuredClone(decided(s, 'sceneKinds', ['kind'])), beats = spec.audio.beats;
  const music = {verdict: plain('music'), why: plain('musicWhy'), ...(beats.ran ? {bpm: beats.bpm} : {notRead: beats.why})};
  const scenes = run.scenes.map((x, i) => {
    const {enter, because} = entranceOf(x, i), kind = kinds[i].kind, seconds = round(x.to - x.from);
    const flashes = spec.flashes.filter(f => f.at >= x.from && f.at < x.to).map(f => f.at);
    return {id: x.id, from: x.from, to: x.to, seconds, shots: x.shots.map(sh => sh.index), kind, why: kinds[i].kindWhy, in: x.shots[0].in.kind, enter, enterWhy: because,
      ...(flashes.length ? {flashes} : {}), ...(music.verdict === 'music-first' ? barsOf({kind, seconds, words: x.shots.length}, beats.bpm) : {})};
  });
  if (music.verdict === 'music-first') music.seconds = round(scenes.reduce((n, x) => n + x.bars, 0) * BEATS.meter * 60 / beats.bpm);
  const longer = scenes.filter(x => x.longer).map(x => ({scene: x.id, give: 'split', what: `it lasts ${x.longer} bars at ${beats.bpm} BPM, more than the ${MUSIC.mostBars} a scene takes: split it into scenes, or keep ${MUSIC.mostBars} bars`}));
  const todo = [...scenes.flatMap((x, i) => sceneTodo({id: x.id, kind: x.kind, words: x.shots.length, camera: run.scenes[i].shots[0].motion.camera})), ...longer, ...musicTodo(music, spec)];
  run.plan = {from: {file: spec.file, seconds: spec.video.seconds, shots: spec.shots.length},
    pace: {name: plain('pace'), why: plain('paceWhy')}, music, enter: commonEntrance(scenes), scenes, todo, thresholds: run.t};
  s.planned = scenes.map(x => `${x.id} ${x.kind}`);
}

/**
 * A draft plan for a film made like the reference: {from, pace: {name, why}, music: {verdict, why, bpm?, seconds?,
 * notRead?}, enter: the entrance most scenes come in by, scenes: [{id, from, to, seconds, shots, kind, why, in (how the
 * reference's shot comes in), enter, enterWhy, flashes?, bars?, every?}], todo: [{scene?, give, what}], thresholds, record}. `breakdown` is the spec
 * (breakdown.json); `thresholds` override REMAKE. Every choice says why; the record keeps each decision's evidence.
 */
export async function remakePlan(breakdown, {thresholds} = {}) {
  const run = {spec: readSpec(breakdown), t: readThresholds(thresholds)}, t = run.t;
  let chart = flowChart('read', s => readStage(s, run), 'read', 'The breakdown checked; its shots grouped into scenes: a run of quick shots joined by hard cuts is one');
  chart = addDecider(chart, {name: 'pace', id: 'pace', description: 'The pace: promo or lesson, over the median shot and the cuts a minute', table: PACE(t), key: 'pace'});
  chart = chart.addFunction('beats', s => { Object.assign(s, beatMeasures(run.spec.audio.beats)); }, 'beats', 'The beats as the music rules read them: read or not, sure or not, and the share of the judged cuts on a beat');
  chart = addDecider(chart, {name: 'music', id: 'music', description: 'Whether a song times the film, over the breakdown\'s beats', table: SONG(t), key: 'music'});
  chart = chart.addSubFlowChartNext('kinds', decideAll(KIND(t), 'scenes'), 'decide each scene', decideMount('sceneMeasures', 'sceneKinds'))
    .addFunction('plan', s => planStage(s, run), 'plan', 'Each scene\'s entrance, its bars under music first, and what is still to give');
  const trace = narrative();
  await chart.setLogger(QUIET).build().recorder(trace).run();
  return {...run.plan, record: JSON.parse(JSON.stringify(trace.getEntries().map(({rawValue, ...entry}) => entry)))};
}
