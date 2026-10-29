/**
 * A remake plan in plain words (remake.mjs · remakePlan): the choices with their reasons, the scenes, and what is still
 * to give — for a person to approve before anything is made. Text only: it reads the plan and nothing else.
 */
import {clockTenths} from './clock.mjs';

const KIND_WORDS = {kinetic: 'kinetic type', montage: 'a montage', blank: 'plain ground', title: 'a title', still: 'a still picture', camera: 'a camera move', moving: 'a moving picture'};
const MUSIC_WORDS = {'music-first': 'its song times it (music first)', 'song-under': 'its words time it, with any song under', unsure: 'the tempo is unsure', 'not-read': 'the beats were not read'};
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : /(s|sh|ch|x)$/.test(word) ? 'es' : 's'}`;
const secondsText = v => `${+v.toFixed(2)} s`;
const sentence = text => `${text[0].toUpperCase()}${text.slice(1)}`;
/** A choice's reason in words, with the checks of the rule that gave it: the numbers it read ("median 0.333 < 1.5 ✓"). */
const reasonText = why => { const won = why.rules.find(r => r.met); return `${sentence(why.because)}${won?.checks.length ? ` (${won.checks.join(', ')})` : ''}`; };

/** An entrance as a stage's `enter` names it, in words. */
const enterText = enter => enter === null ? 'the start' : typeof enter === 'string' ? `a ${enter}` : `a ${enter.type}, ${enter.seconds} s`;
/** What a scene is, in words: its kind, and how many words or pictures it takes. */
const kindText = x => `${KIND_WORDS[x.kind] ?? x.kind}${x.kind === 'kinetic' ? `, ${plural(x.shots.length, 'word')}` : x.kind === 'montage' ? `, ${plural(x.shots.length, 'picture')}` : ''}`;
/** A list of shot numbers, runs shortened: 3–9, 12. */
function shotsText(shots) {
  const runs = [];
  for (const n of shots) { const last = runs.at(-1); if (last && n === last[1] + 1) last[1] = n; else runs.push([n, n]); }
  return runs.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', ');
}

/** The heading and the three choices for the whole film: its pace, its music, how its scenes come in. */
function choiceLines(plan) {
  const {from, pace, music, enter} = plan;
  const musicLine = `**Music: ${MUSIC_WORDS[music.verdict] ?? music.verdict}.** ${music.verdict === 'not-read' && music.notRead ? `${sentence(music.why.because)}: ${music.notRead}.` : `${reasonText(music.why)}.`}`
    + (music.verdict === 'music-first' ? ` At ${music.bpm} BPM its scenes take the bars below: ${secondsText(music.seconds)}, beside the reference's ${secondsText(from.seconds)}.` : '');
  const enterLine = enter === null ? null : `**Between scenes: ${enterText(enter.type)}** (${enter.scenes} of ${enter.of}).${enter.type === 'fade' ? '' : ` Write "enter": "${enter.type}" on each stage that takes it; left out, a stage fades in.`}`;
  return [`# Make one like ${from.file}`, '', `A draft plan from its breakdown: ${plural(from.shots, 'shot')} in ${secondsText(from.seconds)}, as ${plural(plan.scenes.length, 'scene')}. Nothing is made from it until you approve it.`, '',
    `**Pace: ${pace.name}.** ${reasonText(pace.why)}.`, '', musicLine, ...(enterLine ? ['', enterLine] : [])];
}

/** The scenes: when each runs, its shots, what it is and why, and how it comes in. */
function sceneLines(plan) {
  const bars = plan.music.verdict === 'music-first';
  return ['## Scenes', '', `| scene | from | to | length | shots | what | comes in by |${bars ? ' bars |' : ''} why |`, `|---|---|---|---|---|---|---|${bars ? '---|' : ''}---|`,
    ...plan.scenes.map(x => `| ${x.id} | ${clockTenths(x.from)} | ${clockTenths(x.to)} | ${secondsText(x.seconds)} | ${shotsText(x.shots)} | ${kindText(x)} | ${enterText(x.enter)} |${bars ? ` ${x.bars}${x.every ? `, a ${x.kind === 'montage' ? 'picture' : 'word'} every ${plural(x.every, 'beat')}` : ''} |` : ''} ${x.why.because} |`)];
}

/** Each entrance that is not a plain cut, and each flash, with its reason. */
function noteLines(plan) {
  const entrances = plan.scenes.filter(x => x.in !== 'cut' && x.in !== 'start').map(x => `- ${x.id} comes in by ${enterText(x.enter)}: ${x.enterWhy}.`);
  const flashes = plan.scenes.filter(x => x.flashes).map(x => `- ${x.id}: ${plural(x.flashes.length, 'flash')} at ${x.flashes.map(clockTenths).join(', ')} (a moment unlike the frames either side: a flip of the ground, or a frame of one colour).`);
  return [...(entrances.length ? ['', '## How the scenes come in', '', ...entrances] : []), ...(flashes.length ? ['', '## Flashes', '', ...flashes] : [])];
}

/** What is still to give: the words and pictures, the scenes that need the same named together; then the music or the timing. */
function todoLines(plan) {
  const same = new Map();
  for (const x of plan.todo) { const key = `${x.scene ? 'scene' : 'film'}: ${x.what}`; same.set(key, [...(same.get(key) ?? []), x]); }
  const lines = [...same.values()].map(list => `- ${list[0].scene ? `${list.map(x => x.scene).join(', ')}: ` : ''}${list[0].what}.`);
  return ['', '## Still to give', '', ...lines, '',
    'Approve the plan as it is, or change a threshold and plan again (remakePlan(spec, {thresholds: {quick: 1.5}}), or storyreel remake --quick 1.5).'];
}

/** The plan in plain words (markdown): the choices, the scenes, the entrances and flashes, and what is still to give. */
export function remakePlanText(plan) {
  return [...choiceLines(plan), '', ...sceneLines(plan), ...noteLines(plan), ...todoLines(plan)].join('\n') + '\n';
}
