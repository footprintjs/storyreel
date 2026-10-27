/**
 * A scored self-review. A rubric is data: a name, a scale, named points, and the least score each point must have
 * before a render is approved. The review lays out, for each point, the stills and the evidence a reviewer (a person, or
 * a model) needs to score it; the scores go into the render's making-of record; an approval refuses a render whose
 * scores fall short of the rubric its recipe names. The library never scores anything: it lays out and it records.
 *
 *   "rubric": {"name": "explainer", "scale": [1, 10], "least": 8, "points": [
 *     {"id": "opening", "label": "The opening holds attention", "ask": "Do the first seconds give a reason to keep watching?", "look": "opening"},
 *     {"id": "words", "label": "Words and numbers read easily", "look": "words"},
 *     {"id": "idea", "label": "The one idea is clear", "look": "shots"}]}
 *
 * A point's `look` says what to lay out for it (LOOKS): the film's opening, its words, its faces, its shots, its sound,
 * or each scene's settled picture. The looks are the mechanism; what a rubric asks, and how high it sets the bar, belong
 * to whoever writes it.
 */
import {readFileSync} from 'node:fs';
import {writeOutput} from './files.mjs';
import {claimsCount} from './claims.mjs';
import {stableJson} from './hash.mjs';

/** What each look lays out for a point: its stills, and the evidence beside them. */
export const LOOKS = Object.freeze({
  opening: 'the first seconds: stills across them, the words said, whether the picture moves (the review\'s hook check), what the first shot is for',
  words: 'the lines meant to be read: stills as they settle, the lines up too briefly to read, the review\'s findings on words, the numbers and their sources',
  faces: 'the faces: stills where a kit draws a mouth, and who speaks',
  shots: 'each shot: its settled still, what it is for (intent), its answers to the scene questions and what does not progress',
  sound: 'the sound: stills at the effect sounds, each against the beat nearest it, what the sound asks of the ear, the voice check',
  settled: 'each scene\'s settled still',
});
/** A rubric's scale when it names none: whole scores from 1 to 10. */
export const RUBRIC_SCALE = Object.freeze([1, 10]);
/** The most stills one point lays out. */
export const MOST_STILLS = 6;
/** The seconds the opening look reads: the review's hook (review.mjs · REVIEW_DEFAULTS.hook; pinned equal by a test). */
export const OPENING_SECONDS = 3;

const RUBRIC_KEYS = ['name', 'scale', 'least', 'points'], POINT_KEYS = ['id', 'label', 'ask', 'look'];
const SHAPE = '{"name", "scale"?: [1, 10], "least"?: 8 or {"<point id>": 8}, "points": [{"id", "label", "ask"?, "look"?}]}';
const words = v => typeof v === 'string' && /[\p{L}\p{M}\p{N}]/u.test(v);
/** The rubrics readRubric made: taken as they are; anything else is read first. */
const READ = new WeakSet(), asRubric = r => (READ.has(r) ? r : readRubric(r));

/**
 * A rubric, checked: {name, scale: [lowest, highest], points: [{id, label, ask?, look}], least: {id: score} | null},
 * frozen. `scale` whole numbers, lowest first (RUBRIC_SCALE when none); each point's `id` one word of its own, its
 * `label` what it is in words, `ask` the question a reviewer answers (optional), `look` one of LOOKS ('settled' when
 * none); `least` the least score every point needs (a number), or some points' (by id) — none: the scores are recorded
 * and nothing is required of them. Anything else refuses, naming the fix.
 */
export function readRubric(value, where = 'rubric') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${where} is a rubric, ${SHAPE}, not ${JSON.stringify(value)}`);
  for (const key of Object.keys(value)) if (!RUBRIC_KEYS.includes(key)) throw new Error(`${where} has ${key}; a rubric takes ${RUBRIC_KEYS.join(', ')}`);
  if (!words(value.name)) throw new Error(`${where}: name says which rubric it is, in words ("explainer"), not ${JSON.stringify(value.name)}`);
  const scale = value.scale ?? RUBRIC_SCALE;
  if (!(Array.isArray(scale) && scale.length === 2 && scale.every(Number.isInteger) && scale[0] < scale[1])) throw new Error(`${where}: scale is the lowest and highest score, whole numbers, lowest first ([1, 10]), not ${JSON.stringify(value.scale)}`);
  if (!Array.isArray(value.points) || !value.points.length) throw new Error(`${where}: points lists what is scored, [{"id": "opening", "label": "The opening holds attention", "ask"?: "…", "look"?: "opening"}]`);
  const ids = new Set(), points = value.points.map((p, i) => {
    const at = `${where}.points[${i}]`;
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error(`${at} is {"id", "label", "ask"?, "look"?}`);
    for (const key of Object.keys(p)) if (!POINT_KEYS.includes(key)) throw new Error(`${at} has ${key}; a point takes ${POINT_KEYS.join(', ')}`);
    if (!(typeof p.id === 'string' && /^[\p{L}\p{M}\p{N}_-]+$/u.test(p.id))) throw new Error(`${at}: id names the point, one word ("opening"), not ${JSON.stringify(p.id)}`);
    if (ids.has(p.id)) throw new Error(`${at}: id "${p.id}" is another point's too: give each point an id of its own`);
    ids.add(p.id);
    if (!words(p.label)) throw new Error(`${at}: label says what the point is, in words ("The opening holds attention")`);
    if (p.ask !== undefined && !words(p.ask)) throw new Error(`${at}: ask is the question a reviewer answers, in words, or left out`);
    if (p.look !== undefined && !Object.hasOwn(LOOKS, p.look)) throw new Error(`${at}: look is what to lay out for it — ${Object.keys(LOOKS).join(', ')} — not ${JSON.stringify(p.look)}`);
    return Object.freeze({id: p.id, label: p.label.trim(), ...(p.ask !== undefined ? {ask: p.ask.trim()} : {}), look: p.look ?? 'settled'});
  });
  const inScale = n => Number.isInteger(n) && n >= scale[0] && n <= scale[1];
  let least = null;
  if (typeof value.least === 'number') {
    if (!inScale(value.least)) throw new Error(`${where}: least is a whole score ${scale[0]}–${scale[1]}, not ${value.least}`);
    least = Object.fromEntries(points.map(p => [p.id, value.least]));
  } else if (value.least !== undefined && value.least !== null) {
    if (!value.least || typeof value.least !== 'object' || Array.isArray(value.least)) throw new Error(`${where}: least is the least score every point needs (8), or some points' ({"opening": 9}), not ${JSON.stringify(value.least)}`);
    for (const [id, n] of Object.entries(value.least)) {
      if (!ids.has(id)) throw new Error(`${where}: least names "${id}", which is no point of the rubric (its points: ${[...ids].join(', ')})`);
      if (!inScale(n)) throw new Error(`${where}: least.${id} is a whole score ${scale[0]}–${scale[1]}, not ${JSON.stringify(n)}`);
    }
    least = {...value.least};
  }
  const rubric = Object.freeze({name: value.name.trim(), scale: Object.freeze([...scale]), points: Object.freeze(points), least: least && Object.freeze(least)});
  READ.add(rubric);
  return rubric;
}

/** A recipe's `rubric`, checked (readRubric): the rubric a render is scored on before it is approved, or null when it names none. */
export const readRubricRule = value => (value === undefined ? null : readRubric(value, 'recipe.rubric'));

/** Up to `most` of a list, spread evenly over it (the first and the last kept). */
const spread = (list, most = MOST_STILLS) => (list.length <= most ? list : Array.from({length: most}, (_, k) => list[Math.round(k * (list.length - 1) / (most - 1))]));
const secs = t => `${t.toFixed(2)} s`, cut = (s, n = 40) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
/** A moment held inside the film (a frame is taken at its last millisecond at most). */
const inside = (film, t) => Math.max(0, Math.min(film.total - .001, t));
/** Each scene's settled picture (film.moments). */
const settled = film => film.moments().filter(m => m.kind === 'settled').map(m => ({t: m.t, label: m.label}));
/** The findings of a review of these kinds, as lines. */
const findingLines = (review, kinds) => (review?.findings ?? []).filter(f => kinds.includes(f.kind)).map(f => `${secs(f.from)} ${f.kind}: ${f.what}`);

/** What each look lays out: (film, {review, record, opening}) → {stills: [{t, label}], evidence: [line]}. */
const LAYOUTS = {
  opening(film, {review, opening}) {
    const end = Math.min(opening, film.total), stills = [0, .25, .5, .75, 1].map(k => ({t: inside(film, k * end), label: secs(k * end)}));
    const said = film.timings.scenes.flatMap((sc, i) => (sc.words ?? []).map(w => ({text: w.text, t: film.clock.offsets[i] + w.start}))).filter(w => w.t < end).map(w => w.text).join(' ');
    const hook = !review ? 'the review was not run, so its hook check is not here' : !review.ran?.includes('hook') ? 'the review\'s hook check did not run (the part reviewed does not start the film, or is shorter than its opening)'
      : (review.findings ?? []).some(f => f.kind === 'hook') ? `the review's hook check: nothing moves in the first ${opening} s` : `the review's hook check: the picture moves in the first ${opening} s`;
    const first = film.shots?.[0];
    return {stills, evidence: [said ? `said in the first ${opening} s: "${said}"` : `nothing is said in the first ${opening} s`, hook, ...(first?.intent ? [`the first shot is for: "${first.intent}"`] : [])]};
  },
  words(film, {review}) {
    const short = film.reading ?? [], lines = [...(film.lines ?? [])].filter(l => Number.isFinite(l.from) && l.from < film.total).sort((a, b) => a.from - b.from), picked = [];
    for (const l of [...short.map(r => ({t: r.at + r.seconds / 2, label: cut(r.text)})), ...lines.map(l => ({t: Math.min(l.from + .5, (l.from + Math.min(l.to, film.total)) / 2), label: cut(l.text)}))]) {
      if (!picked.some(p => Math.abs(p.t - l.t) < .5)) picked.push({...l, t: inside(film, l.t)});
    }
    const count = film.claims ? claimsCount(film.claims) : null;
    return {stills: spread(picked.slice(0, MOST_STILLS * 3)).sort((a, b) => a.t - b.t), evidence: [
      `${lines.length} line${lines.length === 1 ? '' : 's'} meant to be read; ${short.length} up too briefly to read`,
      ...short.slice(0, 3).map(r => `"${cut(r.text, 60)}" (${r.path}) is up ${r.seconds} s and needs ${r.needs} s`),
      ...(review ? findingLines(review, ['under-captions', 'words-overlap', 'cut-off', 'text-density']).slice(0, 4) : ['the review was not run, so its findings on words are not here']),
      ...(count?.numbers ? [`${count.numbers} number${count.numbers === 1 ? '' : 's'} on screen: ${count.sourced} sourced, ${count.examples} in example scenes${count.factsGiven ? `, ${count.unsourced} with no source` : ', no facts to check them against'}`] : [])]};
  },
  faces(film) {
    const seen = [];
    for (let t = 0; t < film.total; t += .5) { const mouths = film.mouthsAt?.(t) ?? []; if (mouths.length) seen.push({t, who: [...new Set(mouths.map(m => m.who ?? 'someone'))]}); }
    if (!seen.length) return {stills: spread(settled(film)), evidence: ['no kit on screen draws a mouth (mouthsAt): the stills are each scene\'s settled picture — score the expression the drawing shows']};
    const speakers = [...new Set(seen.flatMap(s => s.who))];
    return {stills: spread(seen).map(s => ({t: s.t, label: `${secs(s.t)} ${s.who.join(', ')}`})), evidence: [`a mouth is drawn at ${seen.length} of ${Math.ceil(film.total / .5)} moments read (every 0.5 s)`, `who: ${speakers.join(', ')}`]};
  },
  shots(film) {
    const answers = s => ['exists', 'changed', 'why', 'opens', 'remains'].filter(k => s[k]).map(k => `${k} "${s[k]}"`);
    const found = film.progression ?? [];
    return {stills: spread(settled(film)), evidence: [...(film.shots ?? []).map(s => `${s.where}: ${s.intent ? `for "${s.intent}"` : 'no intent'}${answers(s).length ? `; ${answers(s).join('; ')}` : ''}`),
      ...(found.length ? [`${found.length} thing${found.length === 1 ? '' : 's'} that do${found.length === 1 ? 'es' : ''} not progress: ${found.slice(0, 3).map(f => f.text).join('; ')}`] : [])]};
  },
  sound(film, {record}) {
    const sounds = film.sounds ?? [], beats = film.beats ?? [], shown = spread(sounds);
    const near = s => beats.reduce((best, b) => (!best || Math.abs(b.t - s.time) < Math.abs(best.t - s.time) ? b : best), null);
    const voice = record?.voice ? [`the voice check: ${record.voice.lowWords?.length ?? 0} word${record.voice.lowWords?.length === 1 ? '' : 's'} scored low, ${record.voice.notHeard?.length ?? 0} not heard`] : [];
    return {stills: shown.map(s => ({t: inside(film, s.time), label: `${s.type} ${secs(s.time)}`})), evidence: [
      `${sounds.length} effect sound${sounds.length === 1 ? '' : 's'}`,
      ...shown.map(s => { const b = near(s); return `${s.type} at ${secs(s.time)}${b ? ` — the nearest beat "${b.path ?? JSON.stringify(b.ref)}" at ${secs(b.t)} (${Math.abs(b.t - s.time).toFixed(2)} s off)` : ''}`; }),
      ...(film.listening ?? []).slice(0, 3).map(f => f.text), ...voice]};
  },
  settled: film => ({stills: spread(settled(film)), evidence: []}),
};

/**
 * What a reviewer needs to score each point of a rubric: {name, scale, least, points: [{id, label, ask?, look, stills:
 * [{t, label}], evidence: [line]}]} — as data; the stills are moments on the film clock (draw them with contactSheet).
 * review: what reviewPart returned (its hook check and its findings on words), or null; record: the render's making-of
 * record (its voice check), or null; opening: the seconds the opening look reads.
 */
export function rubricSheet(film, rubric, {review = null, record = null, opening = OPENING_SECONDS} = {}) {
  const r = asRubric(rubric);
  return {name: r.name, scale: r.scale, least: r.least, points: r.points.map(p => ({...p, ...LAYOUTS[p.look](film, {review, record, opening})}))};
}

/** The least scores in words: "at least 8 on every point", "at least: opening 9, words 8", or that nothing is required. */
const leastText = r => {
  if (!r.least) return 'Nothing is required of the scores: they are recorded.';
  const values = r.points.map(p => r.least[p.id]);
  return values.every(v => v === values[0]) ? `The recipe asks for at least ${values[0]} on every point before approval.` : `The recipe asks, before approval, for at least: ${r.points.filter(p => r.least[p.id] !== undefined).map(p => `${p.id} ${r.least[p.id]}`).join(', ')}.`;
};
/**
 * The sheet as text, in one stable layout: the rubric and its scale, what is required, then each point — its id, label
 * and look, the question, its stills (`files[id]`: the picture drawn of them, when one was) and its evidence.
 */
export function rubricText(sheet, {files = {}} = {}) {
  return [`Rubric "${sheet.name}": score each point ${sheet.scale[0]}–${sheet.scale[1]} from its stills and evidence (the library scores nothing).`, leastText(sheet),
    ...sheet.points.map((p, i) => [`\n${i + 1}. ${p.id} — ${p.label} (look: ${p.look})`, ...(p.ask ? [`   ask: ${p.ask}`] : []),
      `   stills: ${files[p.id] ? `${files[p.id]} · ` : ''}${p.stills.length ? p.stills.map(s => s.label === secs(s.t) ? s.label : `${s.label} (${secs(s.t)})`).join(', ') : 'none'}`,
      '   evidence:', ...(p.evidence.length ? p.evidence.map(e => `   - ${e}`) : ['   - none beyond the stills'])].join('\n'))].join('\n');
}

/**
 * Scores for every point of a rubric, checked: "opening=8,words=7" or {"opening": 8, "words": 7} → {id: score}, frozen,
 * in the rubric's order. Every point scored once, each a whole score on the rubric's scale.
 */
export function readScores(scores, rubric) {
  const r = asRubric(rubric), ids = r.points.map(p => p.id), given = {};
  const scale = `a whole score ${r.scale[0]}–${r.scale[1]}`;
  if (typeof scores === 'string') {
    for (const part of scores.split(',').map(s => s.trim()).filter(Boolean)) {
      const m = /^([^=\s]+)\s*=\s*(\S+)$/.exec(part);
      if (!m) throw new Error(`scores are each point's score, "${ids.map(id => `${id}=8`).join(',')}", not ${JSON.stringify(part)}`);
      if (Object.hasOwn(given, m[1])) throw new Error(`scores name ${m[1]} twice: score each point once`);
      given[m[1]] = /^-?\d+$/.test(m[2]) ? Number(m[2]) : m[2];
    }
  } else if (scores && typeof scores === 'object' && !Array.isArray(scores)) Object.assign(given, scores);
  else throw new Error(`scores are each point's score, "${ids.map(id => `${id}=8`).join(',')}" or {"${ids[0]}": 8, …}, not ${JSON.stringify(scores)}`);
  for (const [id, n] of Object.entries(given)) {
    if (!ids.includes(id)) throw new Error(`scores name "${id}", which is no point of the rubric "${r.name}" (its points: ${ids.join(', ')})`);
    if (!(Number.isInteger(n) && n >= r.scale[0] && n <= r.scale[1])) throw new Error(`scores.${id} is ${scale}, not ${JSON.stringify(n)}`);
  }
  const missing = ids.filter(id => !Object.hasOwn(given, id));
  if (missing.length) throw new Error(`scores leave out ${missing.join(', ')}: score every point of the rubric "${r.name}" (${ids.join(', ')})`);
  return Object.freeze(Object.fromEntries(ids.map(id => [id, given[id]])));
}

/** The points scored under their least: [{id, score, least}] (none when nothing is required, or all are met). */
export const rubricShort = rec => (rec?.least ? Object.entries(rec.least).filter(([id, n]) => !(rec.scores?.[id] >= n)).map(([id, least]) => ({id, score: rec.scores?.[id] ?? null, least})) : []);

/**
 * The scores as the making-of record keeps them: {name, scale, points, least?, scores, by, scored, met?, short?} — `met`
 * and `short` (the points under their least) when the rubric requires a least score.
 */
export function scoresRecord({rubric, scores, by, at = new Date()}) {
  const r = asRubric(rubric), checked = readScores(scores, r);
  if (!words(by)) throw new Error('say who scored it: by ("a name", or the model that scored it)');
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) throw new Error('at is when it was scored, a Date (default: now)');
  const rec = {name: r.name, scale: [...r.scale], points: r.points.map(p => p.id), ...(r.least ? {least: {...r.least}} : {}), scores: {...checked}, by: by.trim(), scored: at.toISOString()};
  const short = rubricShort(rec);
  return {...rec, ...(r.least ? {met: short.length === 0, short} : {})};
}

/** What the film is made from that a person sees (film.inputs): a record whose own differ from these is of another film. */
export const SEEN_INPUTS = Object.freeze(['storyboard', 'recipe', 'facts', 'strings', 'data', 'files', 'theme', 'cast', 'lang']);
/** What a rubric asks, as the record keeps it: its name, scale, points (ids) and least scores. */
const asked = r => ({name: r.name, scale: [...r.scale], points: [...r.points], least: r.least ?? null});

/**
 * Record a render's scores in its making-of record (making-of.json, rewritten whole): the rubric's scores, who scored and
 * when. Refused: a failed render's record (score a render that finished); a render of a part (score a render of the
 * whole film); a record of another film — `inputs`, what the film laid out to score is made from now (film.inputs), when
 * given, must be the record's (SEEN_INPUTS): render again, then score; and a rubric that is not the one the render's
 * recipe names — its name, scale, points and least scores all as the record keeps them, so no rubric of the same name
 * with fewer points, a lower least or a wider scale can pass. Returns the rubric's record as written.
 */
export function recordScores(makingOf, {rubric, scores, by, at = new Date(), inputs = null}) {
  let made; try { made = JSON.parse(readFileSync(makingOf, 'utf8')); } catch (e) { throw new Error(`the scores go into the render's making-of record, and ${makingOf} cannot be read (${e.code ?? e.message}): render the film first, then score it`); }
  if (made?.failed) throw new Error(`${makingOf} is the record of a render that failed (${made.failed.error}): score a render that finished`);
  if (!made?.inputs) throw new Error(`${makingOf} is not a render's making-of record (it lists no inputs): give the making-of.json a render wrote`);
  if (made.span && !made.span.whole) throw new Error(`${makingOf} is the record of a render of ${made.span.from}–${made.span.to} s of a ${made.span.total} s film: render the whole film, then score it`);
  if (inputs) {
    const changed = SEEN_INPUTS.filter(k => stableJson(made.inputs[k] ?? null) !== stableJson(inputs[k] ?? null));
    if (changed.length) throw new Error(`${makingOf} is the record of another film than the one laid out to score (its ${changed.join(', ')} changed since that render): render again, then score`);
  }
  const rec = scoresRecord({rubric, scores, by, at});
  if (made.rubric) {
    const was = asked({...made.rubric, least: made.rubric.least ?? null}), now = asked(rec);
    const differ = Object.keys(was).filter(k => stableJson(was[k]) !== stableJson(now[k]));
    if (differ.length) throw new Error(`the render was made with its recipe's rubric "${was.name}" (points ${was.points.join(', ')}; scale ${was.scale.join('–')}; least ${was.least ? Object.entries(was.least).map(([id, n]) => `${id} ${n}`).join(', ') : 'none'}), and this one differs in its ${differ.join(', ')}: score it with the recipe's rubric (render again if the recipe changed)`);
  }
  writeOutput(makingOf, JSON.stringify({...made, rubric: rec}, null, 2));
  return rec;
}

/**
 * Why a render's record may not be approved yet, or null: its recipe's rubric asks for least scores, and the record has
 * no scores, or a point scored under its least. Read by approval.mjs · approveFilm.
 */
export function rubricRefusal(rec) {
  if (!rec?.least) return null;
  const asks = `the recipe's rubric "${rec.name}" asks for least scores before approval (${Object.entries(rec.least).map(([id, n]) => `${id} ${n}`).join(', ')})`;
  if (!rec.scores) return `${asks}, and this render has not been scored: score it (storyreel review --rubric, then --scores … --by …), then approve`;
  const short = rubricShort(rec);
  return short.length ? `${asks}, and ${short.map(s => `${s.id} scored ${s.score}`).join(', ')} (by ${rec.by}): fix ${short.length > 1 ? 'them' : 'it'}, render again and score it again` : null;
}
