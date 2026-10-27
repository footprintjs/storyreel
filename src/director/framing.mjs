/**
 * The director's framing: where the camera looks, sentence by sentence, as a camera crew's shot grammar — proposed as
 * the keys a world's camera (or the film's focus) already takes: {at: beat, on: a name, several names, or "wide",
 * size?}. Restrained by default: a camera that cuts on every line is the director a person has to correct.
 *
 *   scene     a new scene in the same picture opens wide. A world's camera starts each world wide by itself, and
 *             keeps that establishing shot through the world's first sentence (nothing is framed there but a key
 *             moment: `starts`). The film's focus spans every picture, so it goes back to wide for each change of
 *             picture (`changes`: arriving wide as the new picture comes) — a key no gap ever leaves out — and frames
 *             nothing over a picture it does not direct (`skip`).
 *   line      a speaker's line a shot rule names (rules.mjs: by default a question or an exclamation) frames their face
 *             at the rule's size — the region "<who>.face", else "<who>" — within the close-up budget: only the first
 *             such line of a turn that follows someone else (another speaker or the narrator), at most
 *             `closeUps.perTurn` in a turn and `closeUps.perScene` in a scene. A rule's key moment (`key: true`) is
 *             framed whatever the budget says. A line the budget holds back changes nothing when the camera already
 *             holds its speaker; otherwise the rules below decide (back to medium, wide on someone else's turn).
 *   exchange  when the other speaker answers within `exchange` seconds and the picture names both, the camera frames
 *             the two together (a medium two-shot, on: [a, b]) and holds them while they go back and forth — no
 *             close-ups in between but key moments. Only where the camera frames several names (`groups`).
 *   insert    a narrated sentence (the narrator's, not a character's line) that names a thing the picture names — by its
 *             region name, or by an alias the rules give ({"sacks": "row"}) — frames it (insert, or the alias's size);
 *             named again once the camera has looked elsewhere, it is framed again
 *   person    a narrated sentence that names someone the picture draws ("Mia looks at her hands") frames them medium,
 *             the first time it names them in the scene — unless a thing is named too (the thing is what to look at),
 *             or they said the line just before it ("…," says Mia: an attribution names who spoke)
 *   after     back from a close-up to a medium shot of the same person; back from a thing to wide
 *   turn      wide when someone else speaks while the camera holds people who are not them
 *
 * Every key lands on a sentence's beat, `lead` seconds before its words (a scene's first sentence: on them) — and only
 * where the picture names what it frames at that moment: a thing first drawn on its own words is framed on them, with
 * no lead, and one not there yet is left out, with why. One camera
 * move at a time: a key comes at least `gap` seconds after the one before it (with the voice's timings), or it is left
 * out — unless it is a line's or an exchange's own framing and the key before it is a lower one, which it takes the
 * place of. Every key left out or held back is kept, with why, so the record says what the director did not do. Pure.
 */
import {matchLine, wordsOf} from './rules.mjs';

/** The defaults: the gap between camera keys, how far a key lands before its words, the close-up budget, the exchange window (seconds). */
export const FRAMING = Object.freeze({gap: 2, lead: .2, closeUps: Object.freeze({perScene: 2, perTurn: 1}), exchange: 4});
/** How much a reason weighs when two keys are too close: a line's or an exchange's own framing beats a thing or a person beats the rest. */
const RANK = Object.freeze({picture: Infinity, line: 3, exchange: 3, insert: 2, person: 2, after: 1, turn: 1, scene: 0});
const WIDE = Object.freeze({on: 'wide', size: null, who: null});

/** The names a place has at t (a Set), or null when they are not known (every name is taken on trust). */
const known = (names, t, scene) => (typeof names === 'function' ? names(scene, t) : names);
/** Whether a place has a name (on trust when its names are not known). */
const has = (names, name) => names === null || names.has(name);
/** Who a framing holds: [] for wide or a thing, else the people in it. */
const holding = frame => [frame.who ?? []].flat();
/** Whether two lists of names are the same names. */
const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));

/** The face of who speaks, as the picture names it: "<who>.face", else "<who>", else null. Not known: "<who>.face". */
function faceOf(who, names) {
  if (names === null) return `${who}.face`;
  return names.has(`${who}.face`) ? `${who}.face` : names.has(who) ? who : null;
}

/** Whether a name is a person: whoever speaks in the film, and any name another name hangs a part on ("mia" of "mia.face"). */
function isPerson(name, people, names) {
  if (people.has(name) || name.includes('.')) return true;
  for (const n of names) if (n.startsWith(`${name}.`)) return true;
  return false;
}

/**
 * What a narrated sentence names that the picture names: {thing: {on, size}, person} — the first thing (by its region
 * name, any case, or an alias) and the first person, either null. Names with a part (".face") are not looked for.
 */
function namedIn(s, names, people, aliases) {
  if (names === null || s.speaker !== null) return {thing: null, person: null};
  const named = new Map([...names].filter(n => !n.includes('.')).map(n => [n.toLowerCase(), n]));
  let thing = null, person = null;
  for (const word of s.words) {
    const alias = aliases[word], on = alias && names.has(alias.on) ? alias.on : named.get(word);
    if (!on) continue;
    if (isPerson(on, people, names)) person ??= on;
    else thing ??= {on, size: alias?.size ?? 'insert'};
  }
  return {thing, person};
}

/** The close-up budget's word on a line: null (it may close), or why it is held back. */
function budgetSays(turn, closes, {perScene, perTurn}) {
  if (!turn.follows) return `${turn.speaker} speaks again after the narrator, still their turn: a turn that follows someone else gets the close-up`;
  if (perTurn !== null && turn.closes >= perTurn) return `${turn.speaker}'s turn has had its close-up${perTurn === 1 ? '' : 's'} (closeUps.perTurn ${perTurn})`;
  if (perScene !== null && closes >= perScene) return `the scene has had its close-ups (closeUps.perScene ${perScene})`;
  return null;
}

/**
 * The framing a sentence asks for, given what the camera holds (`last`): {frame, rule, name} — or {hold: true, why?}
 * when the shot that is up stays, or null when it asks for nothing.
 */
function framingOf(s, c) {
  const {last} = c, held = holding(last);
  if (s.speaker) {
    const rule = matchLine(s, c.table).shot, face = rule?.shot ? faceOf(s.speaker, c.names) : null;
    const close = face && {frame: {on: face, size: rule.shot, who: s.speaker}, rule: 'line', name: rule.name};
    const already = close && last.on === face && last.size === rule.shot;
    if (close && rule.key) return already ? {hold: true} : {...close, key: true};
    if (c.reply && c.groups && has(c.names, c.reply) && has(c.names, s.speaker)) {
      const pair = [c.reply, s.speaker];
      return same(held, pair) ? {hold: true} : {frame: {on: pair, size: 'medium', who: pair}, rule: 'exchange', name: 'exchange'};
    }
    if (held.length > 1 && held.includes(s.speaker)) return {hold: true};
    if (close) {
      const why = budgetSays(c.turn, c.closes, c.closeUps);
      if (!why) return already ? {hold: true} : close;
      c.held(close, why);
      if (held.includes(s.speaker)) return {hold: true};
    }
  }
  const {thing, person} = namedIn(s, c.names, c.people, c.aliases);
  if (thing && last.on === thing.on) return {hold: true};
  if (thing) return {frame: {on: thing.on, size: thing.size, who: null}, rule: 'insert', name: 'insert'};
  if (!thing && person && !c.shown.has(person) && !held.includes(person) && c.before?.speaker?.toLowerCase() !== person.toLowerCase())
    return {frame: {on: person, size: 'medium', who: person}, rule: 'person', name: 'person'};
  if (last.on !== 'wide' && !held.length) return {frame: WIDE, rule: 'after', name: 'after'};
  if (held.length && s.speaker && !held.includes(s.speaker)) return {frame: WIDE, rule: 'turn', name: 'turn'};
  if (last.size === 'close' && held.length === 1) return {frame: has(c.names, held[0]) ? {on: held[0], size: 'medium', who: held[0]} : WIDE, rule: 'after', name: 'after'};
  return null;
}

/** A key as proposed: the beat, what it frames, and why (its rule, the sentence). */
const keyOf = (s, frame, rule, name, at, t) => ({scene: s.scene, at, t, on: frame.on, ...(frame.size ? {size: frame.size} : {}), who: frame.who ?? null, rule, name, said: s.text, speaker: s.speaker});

/**
 * Who speaks before a sentence, as the budget and the exchange read it: the turn it opens or goes on with, and the
 * speaker it answers (`reply`: the one who spoke last, when they are someone else and stopped at most `exchange`
 * seconds before — without timings, at most one narrated sentence before), or null.
 */
function turnAt(read, n, turn, exchange) {
  const s = read.sentences[n], before = read.sentences[n - 1];
  if (!s.speaker) return {turn: null, reply: null};
  if (turn && before?.speaker === s.speaker) return {turn, reply: null};
  let k = n - 1; while (k >= 0 && !read.sentences[k].speaker) k--;
  const prev = k >= 0 ? read.sentences[k] : null, between = n - 1 - k;
  const near = prev && (s.t !== null && prev.until !== null ? s.t - prev.until <= exchange : between <= 1);
  return {turn: {speaker: s.speaker, follows: !prev || prev.speaker !== s.speaker, closes: 0}, reply: exchange > 0 && prev && prev.speaker !== s.speaker && near ? prev.speaker : null};
}

/**
 * The framing keys for one place (a world, or the whole film): {keys, dropped}. `scenes`: each scene read
 * (sentences.mjs · readScene), in film order; `names`: a Set, a function (scene, t) → Set, or null (not known);
 * `people`: every speaker in the film; `table`: the rules (their aliases too); `groups`: whether the camera frames
 * several names together (a two-shot); `starts`: the scenes whose first sentence keeps the establishing shot (a world's
 * camera: its first scene, the default); `changes`: scene → seconds where the wide key for a new picture lands (the
 * film's focus; never before the key ahead of it); `skip`: scenes it does not frame; the gap, the lead, the close-up budget and the exchange
 * window (FRAMING).
 */
export function planFraming(scenes, {names = null, people = new Set(), table, groups = true, starts = null, changes = new Map(), skip = new Set(), gap = FRAMING.gap, lead = FRAMING.lead, closeUps = FRAMING.closeUps, exchange = FRAMING.exchange}) {
  const keys = [], dropped = [], aliases = table.aliases ?? {}, fresh = starts ?? new Set(scenes.slice(0, 1).map(r => r.scene));
  const last = () => keys.at(-1) ?? WIDE;
  const place = (key, rank) => {
    const prev = keys.at(-1);
    if (rank === RANK.picture) { keys.push(key); return true; }
    if (prev && key.t !== null && prev.t !== null && key.t - prev.t < gap) {
      if (!(rank >= RANK.line && RANK[prev.rule] < RANK.line)) { dropped.push({...key, why: `${(key.t - prev.t).toFixed(2)} s after the ${prev.rule} key on "${[prev.on].flat().join('" + "')}": one camera move at a time (gap ${gap} s)`}); return false; }
      keys.pop(); dropped.push({...prev, why: `the ${key.rule} key on "${[key.on].flat().join('" + "')}" ${(key.t - prev.t).toFixed(2)} s later takes its place`});
    }
    keys.push(key); return true;
  };
  /** Whether the place names everything a framing frames at t (wide: always; names not known: on trust). */
  const shows = (frame, scene, t) => frame.on === 'wide' || [frame.on].flat().every(n => has(known(names, t, scene), n));
  scenes.forEach((read, j) => {
    const shown = new Set(), first = read.sentences[0];
    let closes = 0, turn = null;
    if (first && changes.has(read.scene) && last().on !== 'wide') place(pictureKey(first, Math.max(changes.get(read.scene), last().t ?? -Infinity)), RANK.picture);
    if (skip.has(read.scene)) return;
    read.sentences.forEach((s, n) => {
      const opens = n === 0, at = opens || !lead ? s.at : withPlus(s.at, -lead), t = s.t === null ? null : s.t - (opens ? 0 : lead);
      if (opens && j > 0 && !changes.has(read.scene) && last().on !== 'wide') place(keyOf(s, WIDE, 'scene', 'scene', s.at, s.t), RANK.scene);
      const who = turnAt(read, n, turn, exchange); turn = who.turn;
      const held = (frame, why) => dropped.push({...keyOf(s, frame.frame, 'line', frame.name, at, t), why: `held: ${why}`});
      const want = framingOf(s, {last: last(), names: known(names, s.t, read.scene), people, table, aliases, groups, closeUps, closes, turn, reply: who.reply, before: read.sentences[n - 1] ?? null, shown, held});
      if (!want || want.hold) return;
      if (opens && fresh.has(read.scene) && !want.key) {
        dropped.push({...keyOf(s, want.frame, want.rule, want.name, at, t), why: 'held: a new picture keeps its establishing wide shot through its first sentence'});
        if (want.rule === 'line') turn.closes++;   // the turn's close-up was this line: it is not handed on to the next
        return;
      }
      // Framed only where the picture names it when the key lands: on its words when it is first drawn there.
      const [kAt, kT] = t === null || shows(want.frame, read.scene, t) ? [at, t] : [s.at, s.t];
      if (kT !== t && !shows(want.frame, read.scene, kT)) { dropped.push({...keyOf(s, want.frame, want.rule, want.name, at, t), why: `"${[want.frame.on].flat().join('" + "')}" is not in the picture at ${t.toFixed(2)} s`}); return; }
      if (!place(keyOf(s, want.frame, want.rule, want.name, kAt, kT), RANK[want.rule])) return;
      if (want.rule === 'person') shown.add(want.frame.on);
      if (want.rule === 'line' && !want.key) { closes++; turn.closes++; }
    });
  });
  return {keys, dropped};
}

/** The key that takes the film's focus back to wide where a new picture starts (seconds `t0`): the picture's first sentence, moved back to the change. */
function pictureKey(s, t0) {
  const at = s.t === null ? s.at : withPlus(s.at, +(t0 - s.t).toFixed(3));
  return {...keyOf(s, WIDE, 'picture', 'picture', at, s.t === null ? null : t0), said: s.text};
}

/** A beat moved by `plus` seconds (array or object form; a beat that already moves keeps its own and adds this). */
export function withPlus(beat, plus) {
  if (Array.isArray(beat)) return [beat[0], beat[1], +((beat[2] ?? 0) + plus).toFixed(3)];
  return {...beat, plus: +((beat.plus ?? 0) + plus).toFixed(3)};
}
