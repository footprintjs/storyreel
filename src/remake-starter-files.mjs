/**
 * A starter's files (remake-starter.mjs · remakeStarter): a project folder that renders as it is — the storyboard and
 * the recipe, the plan it was made from, the project's storyreel.config.mjs (so every review tool reads it: sheet,
 * timeline, still …), render.mjs for the whole film, and a README that says what is still to give and where. Text only:
 * the caller writes them (storyreel remake --starter).
 */
import {remakePlanText} from './remake-text.mjs';

/** Text as one line of plain text: a control or format character or a line break in it (a file's name may hold one) a space. */
export const oneLine = text => String(text).replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, ' ');

/** JSON a person can edit: a value that fits on a line stays on one, the rest open up, two spaces a level. */
export function editableJson(value, indent = '', width = 116) {
  const flat = inline(value);
  if (value === null || typeof value !== 'object' || indent.length + flat.length <= width) return flat;
  const inner = `${indent}  `, items = Array.isArray(value) ? value.map(v => `${inner}${editableJson(v, inner, width)}`)
    : Object.entries(value).map(([k, v]) => `${inner}${JSON.stringify(k)}: ${editableJson(v, inner, width)}`);
  return `${Array.isArray(value) ? '[' : '{'}\n${items.join(',\n')}\n${indent}${Array.isArray(value) ? ']' : '}'}`;
}

/** A value on one line, a space after each comma and colon: {"text": "WORD 1", "at": ["scene-01", "words land", 0]}. */
const inline = value => (value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(inline).join(', ')}]`
  : `{${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(', ')}}`);

const READ = "const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));";

/** The project file: the film from storyboard.json and recipe.json, timed by the reference's own seconds or by the song. */
function configText({music}) {
  // Nothing the breakdown names (its file's name, any text) is written into code: a name could end a comment.
  const head = "// A starter film (storyreel remake --starter): an animatic in the reference's own rhythm, every card saying what goes\n// there. What is still to give, and where: README.md.\n";
  if (!music) return `${head}import {readFileSync} from 'node:fs';
import {evenTimings} from 'footprint-storyreel';
import {kineticKit} from 'footprint-storyreel/kits/kinetic';

${READ}

export default {film: () => {
  const storyboard = read('./storyboard.json');
  // Each scene lasts its directions' seconds, the reference's own time: nothing added after it.
  return {storyboard, recipe: read('./recipe.json'), kits: [kineticKit], timings: evenTimings(storyboard, {tail: 0}),
    out: 'out', render: {quality: 'draft', stamp: 'STARTER'}};
}};
`;
  return `${head}import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {beatMap} from 'footprint-storyreel/beats';
import {beatTimings} from 'footprint-storyreel/music';
import {kineticKit} from 'footprint-storyreel/kits/kinetic';

${READ}

/** Each scene's bars at the song's tempo, from the plan: the song times the film (beatTimings). */
const BARS = ${editableJson(music.bars)};

export default {film: async (flags = {}) => {
  const song = flags.song ? path.resolve(flags.song) : fileURLToPath(new URL('./song.wav', import.meta.url));
  if (!existsSync(song)) throw new Error(\`the song times this film: put it at \${song}, or name it (--song <file>)\`);
  const storyboard = read('./storyboard.json'), map = await beatMap(song, flags.bpm ? {bpm: Number(flags.bpm)} : {});
  const {timings, start} = beatTimings(storyboard, map, {bars: BARS});
  return {storyboard, recipe: read('./recipe.json'), kits: [kineticKit], timings, out: 'out',
    render: {quality: 'draft', stamp: 'STARTER', music: {file: song, start}}};
}};
`;
}

/** The whole film, as the review tools see it: the project's own render (tools.mjs · fullRender). */
function renderText({music}) {
  return `// The whole film, as the review tools see it (storyreel.config.mjs): out/film.mp4, a draft stamped STARTER.
import {fileURLToPath} from 'node:url';
import {makeFilm} from 'footprint-storyreel';
import {loadInputs, fullRender} from 'footprint-storyreel/tools';

const here = fileURLToPath(new URL('.', import.meta.url));
${music ? `// --song <file> and --bpm <n>, as the review tools take them.
const flags = {};
for (let i = 2; i < process.argv.length; i += 2) flags[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
await makeFilm(fullRender(await loadInputs({cwd: here, ...flags})));` : 'await makeFilm(fullRender(await loadInputs({cwd: here})));'}
`;
}

/** The plan in words, one heading level down: a section of the README. */
const planSection = plan => remakePlanText(plan).replace(/^# .*\n/, '').replace(/^(#+) /gm, '#$1 ').trim();

/** What is still to give, the scenes that need the same and take it the same way named together. */
function giveLines(give) {
  const same = new Map();
  for (const g of give) { const key = `${g.scene ? 'scene' : 'film'}\u0000${g.what}\u0000${g.where}`; same.set(key, [...(same.get(key) ?? []), g]); }
  return [...same.values()].map(([g, ...rest]) => { const what = oneLine(g.what); return `- **${g.scene ? `${[g, ...rest].map(x => x.scene).join(', ')}: ${what}` : `${what[0].toUpperCase()}${what.slice(1)}`}.** ${g.where}.`; });
}

/** What the folder is, how to see it, what is still to give and where, what it does not make, and the plan. */
function readmeText(plan, {storyboard, music, give, notes}) {
  const scenes = storyboard.scenes.length, seconds = +plan.scenes.reduce((n, x) => n + x.seconds, 0).toFixed(2);
  const lines = [`# ${storyboard.title}: a starter film`, '',
    `\`storyreel remake\` made this folder from ${plan.from.file}'s breakdown and the plan below: ${scenes} ${scenes === 1 ? 'scene' : 'scenes'} in ${seconds} s, in the`,
    'reference\'s own rhythm. It renders as it is — an animatic: every card says what goes there and lands when the reference',
    'cuts to its shot. Give it your words, pictures and song, and it becomes your film.', '',
    '## See it', '', 'In this folder:', '',
    '    npx storyreel sheet       a still of each scene', '    npx storyreel timeline    when each scene starts and each card lands',
    '    node render.mjs           the whole film: out/film.mp4, a draft stamped STARTER',
    ...(music ? ['', 'The song times this film: put it at song.wav here, or add --song <file> to each (and --bpm <n> when its tempo is unsure).'] : []),
    '', '## Still to give', '', ...giveLines(give),
    ...(notes.length ? ['', '## Not made', '', ...notes.map(n => `- ${n}.`)] : []),
    '', '## How it is made', '',
    '- Each scene is a silent scene of storyboard.json: a direction as long as the reference\'s scene (never spoken). Its cards',
    '  are a kinetic world in recipe.json — the first scene the story, the rest stages: words and titles on light and dark',
    '  cards, a picture to come on a grey one, plain ground the ground alone.',
    `- The pace is ${plan.pace.name} (recipe.json, "pace"); each stage comes in as the plan says ("enter").`,
    ...(music ? ['- The song times it: each scene its bars (BARS in storyreel.config.mjs), its cards on the beats.'] : []),
    '', '## The plan it was made from', '', planSection(plan), ''];
  return lines.join('\n');
}

/** The folder's files, by name: what remakeStarter hands back as `files`. */
export function starterFiles(plan, starter) {
  const {record, ...kept} = plan, shown = {...plan, from: {...plan.from, file: oneLine(plan.from.file)}};
  return {
    'storyboard.json': `${editableJson(starter.storyboard)}\n`,
    'recipe.json': `${editableJson(starter.recipe)}\n`,
    'plan.json': `${editableJson(kept)}\n`,
    'storyreel.config.mjs': configText(starter),
    'render.mjs': renderText(starter),
    'README.md': readmeText(shown, starter),
  };
}
