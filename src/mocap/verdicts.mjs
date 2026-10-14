/**
 * Verdicts in the open: each choice the conversion makes (mocap.mjs · fromPose) is decide()'s, over facts written to
 * the flowchart's scope, so the record keeps the facts, the rule that won, its thresholds and a sentence that says
 * why. The rules live here, with the refusals they lead to.
 */
import {decide} from 'footprintjs';
import {RIG_JOINTS} from './keypoints.mjs';

const OPS = {lte: '≤', lt: '<', gte: '≥', gt: '>', eq: '=', ne: '≠', in: 'in', notIn: 'not in'};
const conditionText = c => `${c.key} ${c.actualSummary} ${OPS[c.op] ?? c.op} ${JSON.stringify(c.threshold)} ${c.result ? '✓' : '✗'}`;

/** decide()'s evidence as a sentence: the rule that matched and its conditions, or why none did. */
export function because(evidence) {
  const hit = evidence.rules.find(r => r.matched);
  if (hit) return `${hit.label}: ${(hit.conditions ?? []).map(conditionText).join(', ')}`;
  const missed = [...new Set(evidence.rules.map(r => (r.conditions ?? []).find(c => !c.result)).filter(Boolean).map(conditionText))];
  return `${evidence.defaultLabel ?? evidence.default}${missed.length ? ` (${missed.join('; ')})` : ''}`;
}

/**
 * What a stage found, written to the scope (the run's record) and to the source's record as the same plain values.
 * The source's record never reads the scope back: what a scope hands out is the stage's own, and lives with it.
 */
export function report(s, record, found) {
  for (const [key, value] of Object.entries(found)) { s[key] = value; record[key] = value; }
}

/** The facts written to the scope (so the record has them), then decide() over them: {how, why, evidence}. */
export function verdict(s, facts, rules, fallback) {
  for (const [key, value] of Object.entries(facts)) s[key] = value;
  const d = decide(s, rules, fallback);
  return {how: d.branch, why: because(d.evidence), evidence: d.evidence};
}

export const GAP_RULES = maxGap => [
  {when: {gapSeconds: {lte: maxGap}, gapEdge: {eq: 'inside'}}, then: 'bridge', label: 'short, and seen on both sides: drawn straight across'},
  {when: {gapSeconds: {lte: maxGap}, gapEdge: {in: ['start', 'end']}}, then: 'hold', label: 'short, at an edge of the clip: held at the nearest point seen'},
];
export const GAP_DEFAULT = {branch: 'refuse', label: 'longer than maxGap, or never seen: too long to guess'};
export const FACING_RULES = [
  {when: {facingAsked: {eq: 1}}, then: 'right', label: 'asked to face right (+x)'},
  {when: {facingAsked: {eq: -1}}, then: 'left', label: 'asked to face left (−x)'},
  {when: {travel: {gte: .5}}, then: 'right', label: 'it travels right'},
  {when: {travel: {lte: -.5}}, then: 'left', label: 'it travels left'},
  {when: {noseAhead: {gte: .1}}, then: 'right', label: 'its nose points right'},
  {when: {noseAhead: {lte: -.1}}, then: 'left', label: 'its nose points left'},
];
export const FACING_DEFAULT = {branch: 'right', label: 'it neither travels nor turns its head: facing right, as a figure is drawn'};
export const CONTACT_RULES = o => [
  {when: {stillSeconds: {gte: o.minContact}, overFloor: {lte: o.floorBand}}, then: 'planted', label: 'still long enough, on the floor: planted'},
  {when: {stillSeconds: {gte: o.minContact}}, then: 'aloft', label: 'still long enough, but off the floor (the top of a jump): not planted'},
];
export const CONTACT_DEFAULT = {branch: 'passing', label: 'slow too briefly to be a step: not planted'};
export const LOOP_RULES = seam => [
  {when: {loop: {eq: false}}, then: 'once', label: 'played once: it holds its last frame'},
  {when: {seamSlide: {lte: seam}}, then: 'loop', label: 'its feet meet at the seam: it loops, each repeat carrying on from where the last left off'},
];
export const LOOP_DEFAULT = {branch: 'refuse', label: 'its feet do not meet at the seam: looped, a foot would slide or jump there'};

/**
 * Gaps over the same frames, of the same kind, as one: {frames, edge, missing, seconds, kept, kind, low, high, joints}
 * (a person out of view loses every joint at once).
 */
function byFrames(gaps) {
  const groups = new Map();
  for (const g of gaps) {
    const key = `${g.frames}|${g.edge}|${g.kind}`;
    if (!groups.has(key)) groups.set(key, {...g, joints: []});
    const group = groups.get(key);
    group.joints.push(g.joint);
    if (g.kind !== 'missing') { group.low = Math.min(group.low, g.low); group.high = Math.max(group.high, g.high); }
  }
  return [...groups.values()];
}

/** Which of a gap's frames are kept, when it reaches past a cut: said inside the clause's own brackets. */
const keptText = g => (g.kept ? `, of which ${g.kept[0]}–${g.kept[1]} are kept` : '');

/**
 * One group of refused gaps, as a clause. A gap is missing (the detector found nothing), unsure (it reported the
 * point, under minConfidence) or both — and the clause says which, since the fixes differ.
 */
function gapClause(g, o) {
  const all = g.joints.length === RIG_JOINTS.length, are = !all && g.joints.length > 1 ? 'are' : 'is';
  const who = all ? `every joint${g.kind === 'missing' ? ' (nobody in view)' : ''}` : g.joints.join(', ');
  const unsure = `reported only under minConfidence ${o.minConfidence} (at ${g.low}–${g.high})`;
  const frames = `${g.frames[0]}–${g.frames[1]}`;
  if (g.edge === 'whole') return g.kind === 'missing' ? `${who} ${are} never seen (frames ${frames}${keptText(g)})` : `${who} ${are} ${g.kind === 'unsure' ? unsure : `never seen, or ${unsure}`} in every frame (frames ${frames}${keptText(g)})`;
  const what = g.kind === 'missing' ? 'missing' : g.kind === 'unsure' ? unsure : `missing, or ${unsure},`;
  return `${who} ${are} ${what} in frames ${frames} (${g.missing} frames, ${g.seconds} s${keptText(g)})`;
}

/**
 * The refusal for gaps too long to fill ([{joint, frames, kept?, edge, missing, seconds, kind, low?, high?}]): the
 * joints, their frames, and the fixes for what made the gap — a point never found wants the whole body in view, a
 * point reported unsure wants a lower minConfidence. A gap is decided by its whole length, cut or not.
 */
export function gapRefusal(refused, o) {
  const groups = byFrames(refused), named = groups.slice(0, 6).map(g => gapClause(g, o)).join('; ') + (groups.length > 6 ? `; and ${groups.length - 6} more` : '');
  const them = refused.length > 1 ? 'them' : 'it', fixes = [`trim the clip past ${them} (from, to: seconds of the video)`];
  if (refused.some(g => g.kind !== 'unsure')) fixes.push('film it again with the whole body in view');
  if (refused.some(g => g.kind !== 'missing')) fixes.push(`lower minConfidence (${o.minConfidence}) to use the points the detector reported`);
  return new Error(`fromPose "${o.name}": ${refused.length} gap${refused.length > 1 ? 's are' : ' is'} too long to fill: ${named}. At most ${o.maxGap} s (maxGap) is filled in: ${fixes.join(', ')}, or raise maxGap`);
}

/**
 * The refusal for a loop whose feet do not meet at its seam: which foot, by how much (torso lengths and px), between
 * which frames — and the fix: the cut (from, to) where they do meet, what to film when no two frames do, or, for a
 * clip too long to search, that it was not searched.
 */
export function loopRefusal({foot, slide, px, frames, cut, searched}, o) {
  const fix = cut ? `trim it to whole cycles: from ${cut.from} to ${cut.to} (frames ${cut.frames[0]}–${cut.frames[1]}) meet within ${cut.px} px`
    : searched.done ? 'no two frames of this clip meet: film a few whole cycles of the motion'
      : `the clip is too long to search for a cut (${searched.frames} frames, more than ${searched.limit}): trim it to whole cycles yourself (from, to)`;
  return new Error(`fromPose "${o.name}": looped, its ${foot} foot is ${px} px (${slide} torso lengths) from where it starts at the seam (frame ${frames[1]} against frame ${frames[0]}), and at most ${o.seam} (seam) is joined, so it would slide or jump at every repeat. To loop it, ${fix}; or play it once (loop: false)`);
}
