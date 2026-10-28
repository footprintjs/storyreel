/**
 * A breakdown's spec in plain words (breakdown.md, breakdown.mjs · breakdown): the shot list with timings, the pacing,
 * where the motion lives, lettering, and the cuts against the beats. Text only: it reads the spec and nothing else.
 */
import {clockTenths} from './clock.mjs';
import {GRID} from './footage.mjs';

const round = (v, digits = 2) => +v.toFixed(digits);
const ROWS = ['top', 'upper middle', 'lower middle', 'bottom'], COLS = ['far left', 'left', 'centre left', 'centre right', 'right', 'far right'];
const uniqueSorted = list => [...new Set(list)].sort((a, b) => a - b);

/** Where a grid's change lives, in words: the rows and the columns of its busy cells (half its busiest, or more). */
export function whereWords(grid) {
  const most = Math.max(0, ...grid.flat());
  if (!(most > 0)) return 'nowhere';
  const hot = grid.flatMap((row, r) => row.flatMap((v, c) => (v >= most / 2 ? [[r, c]] : [])));
  const rows = uniqueSorted(hot.map(([r]) => r)), cols = uniqueSorted(hot.map(([, c]) => c));
  if (rows.length === GRID.rows && cols.length === GRID.cols) return 'all over the frame';
  const down = rows.length === GRID.rows ? 'top to bottom' : rows.length === 1 ? `the ${ROWS[rows[0]]} row` : `the ${ROWS[rows[0]]} to ${ROWS[rows.at(-1)]} rows`;
  const across = cols.length === GRID.cols ? 'across the frame' : cols.length === 1 ? `at the ${COLS[cols[0]]}` : `from the ${COLS[cols[0]]} to the ${COLS[cols.at(-1)]}`;
  return `${down}, ${across}`;
}
const HEAT = ' .:-=+*#%@';
/** A grid as text, one character a cell, darker for more change. */
const heatText = grid => { const most = Math.max(1e-9, ...grid.flat()); return grid.map(row => row.map(v => HEAT[Math.round(v / most * (HEAT.length - 1))]).join(' ')).join('\n'); };

const KIND_WORDS = {cut: 'hard cut', dissolve: 'dissolve', dip: 'dip through one colour', 'fade-in': 'fade in', 'fade-out': 'fade out', start: 'start', end: 'end'};
const secondsText = v => `${round(v, 2)} s`;
const edgeText = edge => `${KIND_WORDS[edge.kind] ?? edge.kind}${edge.seconds ? ` ${secondsText(edge.seconds)}` : ''}${edge.also ? `, with a ${edge.also.map(k => KIND_WORDS[k] ?? k).join(' and a ')}` : ''}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The heading: the video's facts, and anything it warns of (a varying frame rate). */
function headLines(spec) {
  const v = spec.video;
  return [`# Breakdown: ${spec.file}`, '', `${secondsText(v.seconds)}${v.lengthFrom === 'frames' ? ' (counted from its frames: the file names no length)' : ''} · ${v.width}×${v.height}${v.rotation ? ` (turned ${v.rotation}°)` : ''} · ${v.fps} fps · sound: ${v.sound ? 'yes' : 'no'} · read ${spec.read.width}×${spec.read.height} grey, every frame at ${spec.read.rate} a second.`,
    ...spec.warnings.map(w => `\n**Warning:** ${w}.`)];
}

/** The shot list: when each shot runs, how it comes in, how it moves, whether it is lettered. */
function shotLines(spec) {
  return ['## Shots', '', '| # | from | to | length | comes in by | motion | lettering |', '|---|---|---|---|---|---|---|',
    ...spec.shots.map(x => `| ${x.index} | ${clockTenths(x.start)} | ${clockTenths(x.end)} | ${secondsText(x.seconds)} | ${edgeText(x.in)} | ${x.motion.words} | ${x.text.verdict === 'text' ? 'yes' : '–'} |`)];
}

/** The pacing: the shot lengths, the transitions by kind, the fades that open or close the film, the flash frames. */
function pacingLines(spec) {
  const p = spec.pacing, kinds = Object.entries(p.transitions).map(([k, n]) => `${n} ${KIND_WORDS[k] ?? k}${n > 1 ? 's' : ''}`);
  const edges = spec.transitions.filter(tr => tr.opens || tr.closes).map(tr => `${tr.opens ? 'opens' : 'closes'} with a ${KIND_WORDS[tr.kind]} (${secondsText(tr.seconds)})`);
  return ['## Pacing', '', `${plural(p.shots, 'shot')} in ${secondsText(spec.video.seconds)}: median ${secondsText(p.median)}, mean ${secondsText(p.mean)}; shortest ${secondsText(p.shortest.seconds)} (#${p.shortest.shot}), longest ${secondsText(p.longest.seconds)} (#${p.longest.shot}); ${p.cutsPerMinute} cuts a minute.`,
    kinds.length ? `Between the shots: ${kinds.join(', ')}.` : 'One shot: no cut.',
    ...(edges.length ? [`The film ${edges.join(' and ')}.`] : []),
    ...(spec.flashes.length ? [`Flashes (a moment unlike the frames either side, back within 0.1 s): ${spec.flashes.map(x => clockTenths(x.at)).join(', ')}.`] : [])];
}

/** Where the motion lives: the verdicts counted, each moving shot in words, the whole film's grid as text. */
function motionLines(spec) {
  const m = spec.motion.shots;
  return ['## Where the motion lives', '', `${m.still} still, ${m.camera} with the camera moving, ${m.inside} with things moving inside the frame.`,
    ...spec.shots.filter(x => x.motion.verdict !== 'still').map(x => `- #${x.index} (${clockTenths(x.start)}): ${x.motion.words}${x.motion.verdict === 'camera' ? `, ${round(x.motion.pan * 100, 1)}% of the frame a second` : `, mostly ${whereWords(x.motion.grid)}`}.`),
    '', 'The whole film, change by cell (6 across, 4 down; darker is more):', '', '```', heatText(spec.motion.grid), '```'];
}

/** Lettering, said to be a heuristic, and the corner marks it left out. */
function letteringLines(spec) {
  const marked = spec.shots.filter(x => x.text.mark > 0).map(x => `#${x.index}`);
  return ['## Lettering on screen', '', `A heuristic: ${spec.text.heuristic}.`, spec.text.shots.length ? `Lettered: ${spec.text.shots.map(i => `#${i}`).join(', ')}.` : 'No shot looks lettered.',
    ...(marked.length ? [`A mark that stays in a corner (a logo, a watermark) was left out in ${marked.join(', ')}.`] : [])];
}

/** The tempo, said to be close when the next tempo the beats fit scores nearly as well. */
const tempoText = b => `${round(b.bpm, 1)} BPM${b.confidence !== undefined ? ` (confidence ${b.confidence})` : ''}${b.close ? `; a close call: ${round(b.close.bpm, 1)} BPM scores ${b.close.score} of it` : ''}`;

/** The cuts against the beats, or why they were not read. */
function beatLines(b) {
  if (!b.ran) return ['## Cuts on the beat', '', `Not run: ${b.why}.`];
  const out = ['## Cuts on the beat', ''];
  if (b.sure === false) {
    // An unsure map: a cut is judged only against the beats every candidate shares and the song hits (beats.mjs · safeBeats).
    out.push(b.phase === 'unsure'
      ? `${tempoText(b)}, ${plural(b.beats.length, 'beat')}. The tempo given (${round(b.bpm, 1)} BPM) sits between the beats heard: its phase is unsure, so no cut is judged${b.likely?.length ? `; try ${b.likely[0]} BPM` : ''}.`
      : `${tempoText(b)}, ${plural(b.beats.length, 'beat')}. The tempo is unsure (${b.verdict ?? 'a close call'}): a cut is judged only against the ${plural(b.judged.beats, 'beat')} of ${b.judged.of} every candidate tempo shares and the song hits${b.likely?.length ? `; give the tempo (one of ${b.likely.join(', ')} BPM) to judge every cut` : ''}.`,
      `${b.onBeat} of ${b.of} cuts land on such a beat (within ${b.within} s); ${b.unjudged} cannot be judged${b.noMusic ? `; ${b.noMusic} where no music plays` : ''}.`);
  } else out.push(`${tempoText(b)}, ${plural(b.beats.length, 'beat')}. ${b.onBeat} of ${b.of} cuts land on a beat (within ${b.within} s)${b.noMusic ? `; ${b.noMusic} where no music plays` : ''}.`);
  for (const c of b.cuts) out.push(`- ${clockTenths(c.at)} ${KIND_WORDS[c.kind] ?? c.kind}: ${c.music === false ? 'no music here' : c.onBeat === null ? 'not judged (no beat every candidate shares near it)' : c.beat === null ? 'no beat' : c.onBeat ? `on the beat (${c.off >= 0 ? '+' : ''}${c.off.toFixed(2)} s)` : `off the beat by ${Math.abs(c.off).toFixed(2)} s`}`);
  // An unsure map does not state its drop as fact.
  const drop = d => `${d.maybe ? 'Maybe a drop' : 'The drop'} at ${clockTenths(d.at)}${d.maybe ? ' (the map is unsure)' : ''}: shot #${d.shot} is on screen${d.nearestCut ? `; the nearest cut is ${Math.abs(d.nearestCut.at - d.at).toFixed(2)} s away` : ''}.`;
  out.push(b.drop ? drop(b.drop) : 'No drop.');
  return out;
}

/** The spec in plain words (breakdown.md): the shot list with timings, the pacing, where the motion lives, lettering, and the cuts against the beats. */
export function breakdownText(spec) {
  return `${[...headLines(spec), '', ...shotLines(spec), '', ...pacingLines(spec), '', ...motionLines(spec), '', ...letteringLines(spec), '', ...beatLines(spec.audio.beats)].join('\n')}\n`;
}
