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

/** Gaps over the same frames, as one: {frames, edge, missing, seconds, joints} (a person out of view loses every joint at once). */
function byFrames(gaps) {
  const groups = new Map();
  for (const g of gaps) {
    const key = `${g.frames}|${g.edge}`;
    if (!groups.has(key)) groups.set(key, {frames: g.frames, edge: g.edge, missing: g.missing, seconds: g.seconds, joints: []});
    groups.get(key).joints.push(g.joint);
  }
  return [...groups.values()];
}

/** The refusal for gaps too long to fill ([{joint, frames, edge, missing, seconds}]): the joints, their frames, the fixes. */
export function gapRefusal(refused, o) {
  const who = joints => (joints.length === RIG_JOINTS.length ? 'every joint (nobody in view) is' : `${joints.join(', ')} ${joints.length > 1 ? 'are' : 'is'}`);
  const one = g => (g.edge === 'whole' ? `${who(g.joints)} never seen (frames ${g.frames[0]}–${g.frames[1]})` : `${who(g.joints)} missing in frames ${g.frames[0]}–${g.frames[1]} (${g.missing} frames, ${g.seconds} s)`);
  const groups = byFrames(refused), named = groups.slice(0, 6).map(one).join('; ') + (groups.length > 6 ? `; and ${groups.length - 6} more` : '');
  return new Error(`fromPose "${o.name}": ${refused.length} gap${refused.length > 1 ? 's are' : ' is'} too long to fill: ${named}. At most ${o.maxGap} s (maxGap) is filled in: trim the clip past ${refused.length > 1 ? 'them' : 'it'} (from, to: seconds of the video), film it again with the whole body in view, or raise maxGap`);
}

/**
 * The refusal for a loop whose feet do not meet at its seam: which foot, by how much (torso lengths and px), between
 * which frames — and the fix: the cut (from, to) where they do meet, or what to film when none does.
 */
export function loopRefusal({foot, slide, px, frames, cut}, o) {
  const fix = cut ? `trim it to whole cycles: from ${cut.from} to ${cut.to} (frames ${cut.frames[0]}–${cut.frames[1]}) meet within ${cut.px} px`
    : 'no two frames of this clip meet: film a few whole cycles of the motion';
  return new Error(`fromPose "${o.name}": looped, its ${foot} foot is ${px} px (${slide} torso lengths) from where it starts at the seam (frame ${frames[1]} against frame ${frames[0]}), and at most ${o.seam} (seam) is joined, so it would slide or jump at every repeat. To loop it, ${fix}; or play it once (loop: false)`);
}
