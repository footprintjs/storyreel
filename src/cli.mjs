#!/usr/bin/env node
/**
 * storyreel <tool> [--flag value …] — the review tools from the command line (tools.mjs), for people and for
 * agents: read first (timeline, review), look last (part, still). The project's storyreel.config.mjs names the
 * film; every flag goes to its film() too (--ep ep1 --voice work/ep1/voice). `storyreel beats <song>` needs no project:
 * it prints the song's beat map as text (beats.mjs · beatMapText), so a person can settle an unsure tempo in seconds.
 */
import path from 'node:path';
import {TOOLS, CONFIG, loadProject, loadInputs, readInputs} from './tools.mjs';
import {SOUNDS_HELP} from './sounds/cli.mjs';
// Loaded first, so the picture's channel is taken from the environment before any project code runs (mcp.mjs · sendPicture).
import {serveMcp, startOf, sendPicture} from './mcp.mjs';

const BEATS_HELP = `  beats    <song> — the song's tempo as the beat map hears it (no project needed): the verdict, the candidate tempi with
           their scores, and why each level of the beat is unsure; an unsure tempo is settled by giving music.bpm
             --bpm  the tempo you hear, to check it: the map is then sure
             --ffmpeg  the FFmpeg to read the song with`;
const SHARE_HELP = `  share    <video> — a copy of a finished film to send to a person (no project needed): small (854 wide), quick to start
           on a phone (its index first), and a poster still; beside the film as <name>.share.mp4 and <name>.poster.jpg
             --width  the copy's width in pixels, even, 160–3840 (854)
             --crf  its quality, 16–40: lower is better and larger (28)
             --poster  the poster's moment, in seconds (6, or a shorter film's middle)
             --out  the folder to write them in (default: the film's)
             --ffmpeg  the FFmpeg to run`;
const BREAKDOWN_USAGE = `storyreel breakdown <video.mp4> [--out dir] [--beats [--bpm n]] [--ffmpeg path]   a reference film broken down into a spec to match: shots, cuts, pacing, motion (breakdown.mjs); it needs no project, and FFmpeg 5.1 or later
             --beats  read the sound's beats too (beats.mjs · beatMap): which cuts land on the beat — an unsure tempo says so, and judges cuts only against the beats every candidate shares
             --bpm  the tempo you hear, for the beat map (with --beats): the map is then sure
             --ffmpeg  the FFmpeg to run (the breakdown's and the beat map's)`;

/** What a failed breakdown's record says (error.record): where it stopped, and its last decisions with their evidence. */
function recordSoFar(record) {
  if (!Array.isArray(record) || !record.length) return '';
  // The error itself is said once, above: the record's own line for it (an error entry) is not repeated.
  const last = record.at(-1), decisions = record.filter(e => e.type === 'condition').slice(-5);
  return `\nThe record so far (${record.length} ${record.length === 1 ? 'entry' : 'entries'}) stops in "${last.stageName ?? last.stageId ?? '?'}"${last.type === 'error' ? '.' : `: ${last.text}`}${decisions.length ? `\nIts last decisions:${decisions.map(e => `\n  ${e.text}`).join('')}` : ''}`;
}

/** A refusal of the command line: said with the usage, exit 2. */
const usageError = message => { console.error(`storyreel breakdown: ${message}\n${BREAKDOWN_USAGE}`); process.exit(2); };

/**
 * storyreel breakdown <video> [--out dir] [--beats [--bpm n]] [--ffmpeg path]: the spec, its plain words and its files
 * (breakdown.mjs · breakdown). --beats reads the beats with the beat map (beats.mjs · beatMap), --bpm handed to it as
 * its own option; without --beats nothing is read but the picture and whether there is sound. A beat map that refuses
 * its options (code BEAT_OPTIONS) refuses the breakdown (exit 2); a sound it cannot read is recorded as not run.
 */
async function breakdownCommand(args) {
  if (args.includes('--help') || args.includes('help')) { console.log(BREAKDOWN_USAGE); return; }
  let video = null, out, beats = false, bpm, ffmpeg;
  const valueOf = (i, flag, what) => { if (args[i + 1] === undefined || args[i + 1].startsWith('--')) usageError(`${flag} needs ${what}`); return args[i + 1]; };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') out = valueOf(i++, '--out', 'a folder');
    else if (args[i] === '--beats') beats = true;
    else if (args[i] === '--bpm') bpm = valueOf(i++, '--bpm', 'a number, the tempo you hear (e.g. --bpm 95)');
    else if (args[i] === '--ffmpeg') ffmpeg = valueOf(i++, '--ffmpeg', 'the path of an FFmpeg');
    else if (!args[i].startsWith('--') && video === null) video = args[i];
    else usageError(`"${args[i]}" is not understood`);
  }
  if (!video) usageError('name the video');
  if (bpm !== undefined && !/^\d+(\.\d+)?$/.test(bpm)) usageError(`--bpm needs a number, the tempo you hear (e.g. --bpm 95), not ${JSON.stringify(bpm)}`);
  if (bpm !== undefined && !beats) usageError('--bpm is the beat map\'s: add --beats');
  const {breakdown} = await import('./breakdown.mjs'), reader = beats ? (await import('./beats.mjs')).beatMap : null;
  try {
    const {text, files} = await breakdown(video, {hints: 'cli', ...(out ? {out} : {}), ...(ffmpeg ? {ffmpeg} : {}), ...(reader ? {beatMap: reader, beatOptions: bpm !== undefined ? {bpm: Number(bpm)} : {}} : {})});
    console.log(`${text}\n${files.json}\n${files.md}\n${files.overview} · ${files.sheets.length} shot sheet${files.sheets.length === 1 ? '' : 's'} in ${files.sheets.length ? files.sheets[0].replace(/[^/\\]*$/, '') : '-'}\n${files.record}`);
  } catch (e) {
    console.error(`storyreel breakdown: ${String(e?.message ?? e).replace(/^breakdown: /, '')}${recordSoFar(e?.record)}`);
    process.exit(e?.cause?.code === 'BEAT_OPTIONS' ? 2 : 1);
  }
}

const [command, ...given] = process.argv.slice(2), flags = {};
if (command === 'breakdown') { await breakdownCommand(given); process.exit(0); }
// sounds needs no project: its own usage, flags and exit codes (sounds/cli.mjs; the Openverse adapter loads only for search and add).
if (command === 'sounds') { const {soundsCommand} = await import('./sounds/cli.mjs'); process.exit(await soundsCommand(given)); }
// `<command> --help` (or `help <command>`): that command's usage alone, on stdout, exit 0 — every command has one.
const asked = given.includes('--help') ? command : command === 'help' && given[0] ? given[0] : null;
if (asked) {
  const tool = TOOLS[asked];
  const usage = tool ? [`storyreel ${asked} [--flag value …]   ${tool.about}`, ...Object.entries(tool.args).map(([a, d]) => `  --${a}  ${d}`), `  --config  the project file (default ./${CONFIG}); any other flag reaches the config's film(flags)`].join('\n')
    : asked === 'beats' ? `storyreel beats <song> [--bpm n] [--ffmpeg path]\n${BEATS_HELP}`
    : asked === 'share' ? `storyreel share <video> [--width 854] [--crf 28] [--poster 6] [--out folder] [--ffmpeg path]\n${SHARE_HELP}`
    : asked === 'breakdown' ? BREAKDOWN_USAGE
    : asked === 'sounds' ? SOUNDS_HELP
    : asked === 'mcp' ? `storyreel mcp [--flag value …]   serves ${Object.keys(TOOLS).join(', ')} over MCP (stdio); the project (--config, --cwd) and the film's own flags (e.g. --out work/out) are fixed here for every call, and a call passes only its tool's arguments`
    : null;
  if (usage) { console.log(usage); process.exit(0); }
  console.error(`storyreel: "${asked}" is not a command; the commands are ${[...Object.keys(TOOLS), 'beats', 'share', 'sounds', 'breakdown', 'mcp'].join(', ')} (storyreel help lists them all)`); process.exit(2);
}
// beats takes the song first, share the video: a path, not a flag.
const song = (command === 'beats' || command === 'share') && given[0] !== undefined && !given[0].startsWith('--') ? given[0] : null, rest = song === null ? given : given.slice(1);
for (let i = 0; i < rest.length; i++) {
  if (!rest[i].startsWith('--')) { console.error(`storyreel: "${rest[i]}" is not a flag (flags are --name value)`); process.exit(2); }
  const next = rest[i + 1];
  flags[rest[i].slice(2)] = next === undefined || next.startsWith('--') ? 'true' : (i++, next);
}
if (command === 'mcp') {
  // The project is fixed here, at start (mcp.mjs · startOf): a call can never name another config or folder.
  let start; try { start = startOf(flags); } catch (e) { console.error(`storyreel mcp: ${e.message}`); process.exit(2); }
  await serveMcp(start); process.exit(0);
}
if (command === 'share') {
  if (song === null) { console.error(`storyreel share: name the finished film (storyreel share out/film.mp4)\n\n${SHARE_HELP}`); process.exit(2); }
  const other = Object.keys(flags).find(f => !['width', 'crf', 'poster', 'out', 'ffmpeg'].includes(f));
  if (other) { console.error(`storyreel share: --${other} is not a flag of share (the flags are --width, --crf, --poster, --out and --ffmpeg)`); process.exit(2); }
  // A flag given with no value reads as 'true': each needs its value (a whole number, seconds, a folder, a path).
  const needs = {width: /^\d+$/, crf: /^\d+$/, poster: /^\d+(\.\d+)?$/, out: /^(?!true$)./, ffmpeg: /^(?!true$)./};
  const what = {width: 'a whole number of pixels (e.g. --width 854)', crf: 'a whole number (e.g. --crf 28)', poster: 'seconds (e.g. --poster 6)', out: 'a folder (e.g. --out share)', ffmpeg: 'the path of an FFmpeg (e.g. --ffmpeg /usr/local/bin/ffmpeg)'};
  const wrong = Object.keys(needs).find(f => flags[f] !== undefined && !needs[f].test(flags[f]));
  if (wrong) { console.error(`storyreel share: --${wrong} needs ${what[wrong]}${flags[wrong] === 'true' ? '' : `, not ${JSON.stringify(flags[wrong])}`}`); process.exit(2); }
  const {shareCopy, shareText} = await import('./share.mjs'), num = f => (flags[f] === undefined ? undefined : Number(flags[f]));
  try { console.log(shareText(shareCopy(song, {width: num('width'), crf: num('crf'), poster: num('poster'), out: flags.out ?? null, ffmpeg: flags.ffmpeg ?? 'ffmpeg'}))); process.exit(0); }
  catch (e) { console.error(`storyreel ${e.message}`); process.exit(/^share: (width|crf|poster|no video)/.test(e.message) ? 2 : 1); }
}
if (command === 'beats') {
  if (song === null) { console.error(`storyreel beats: name the song (storyreel beats music/theme.mp3)\n\n${BEATS_HELP}`); process.exit(2); }
  const unknown = Object.keys(flags).filter(f => f !== 'bpm' && f !== 'ffmpeg');
  if (unknown.length) { console.error(`storyreel beats: --${unknown[0]} is not a flag of beats (the flags are --bpm and --ffmpeg)`); process.exit(2); }
  // A flag given with no value reads as 'true': --bpm needs its number, --ffmpeg its path.
  if (flags.bpm !== undefined && !/^\d+(\.\d+)?$/.test(flags.bpm)) { console.error(`storyreel beats: --bpm needs a number, the tempo you hear (e.g. --bpm 95)${flags.bpm === 'true' ? '' : `, not ${JSON.stringify(flags.bpm)}`}`); process.exit(2); }
  if (flags.ffmpeg === 'true') { console.error('storyreel beats: --ffmpeg needs the path of an FFmpeg (e.g. --ffmpeg /usr/local/bin/ffmpeg)'); process.exit(2); }
  const {beatMap, beatMapText} = await import('./beats.mjs');
  try {
    const map = await beatMap(song, {...(flags.bpm !== undefined ? {bpm: Number(flags.bpm)} : {}), ...(flags.ffmpeg ? {ffmpeg: flags.ffmpeg} : {})});
    console.log(beatMapText(map, {source: path.basename(song)})); process.exit(0);
  } catch (e) { console.error(`storyreel beats: ${e.message}`); process.exit(e.code === 'BEAT_OPTIONS' ? 2 : 1); }
}
if (!command || command === 'help' || command === '--help' || !TOOLS[command]) {
  const lines = [...Object.entries(TOOLS).map(([name, t]) => [`  ${name.padEnd(9)}${t.about}`, ...Object.entries(t.args).map(([a, d]) => `             --${a}  ${d}`)].join('\n')), BEATS_HELP, SHARE_HELP, SOUNDS_HELP];
  (TOOLS[command] || !command || command === 'help' || command === '--help' ? console.log : console.error)(`storyreel <tool> [--flag value …]   (the film is named in ./${CONFIG}; --config another file)\n\n${lines.join('\n')}\n\nRead first, look last: timeline → review → fix → part → still.\nAfter an edit to the words (narration, recipe, pacing): anchors first.\nAfter an edit: changes (what it redraws) → changes --render (only those pieces, and a short clip of them).\nstoryreel mcp [--flag value …] serves the same tools over MCP (stdio); the project (--config, --cwd) and the film's own flags are fixed when it starts.\n${BREAKDOWN_USAGE}`);
  process.exit(command && command !== 'help' && command !== '--help' && !TOOLS[command] ? 2 : 0);
}
try {
  // A tool that prepares the film itself reads the config without compiling it first: changes as the full render does
  // ('inputs': timed), anchors with its own timing ('config': not yet timed).
  const load = {config: readInputs, inputs: loadInputs}[TOOLS[command].load] ?? loadProject;
  const project = await load(flags), out = await TOOLS[command].run(project, flags);
  console.log(typeof out === 'string' ? out : out.text);
  for (const file of out?.files ?? [out?.file]) sendPicture(file);   // run by the MCP server for a still, a strip or a sheet: each picture's path on its own pipe, never read out of the text
} catch (e) {
  console.error(`storyreel ${command}: ${e.message}`); process.exit(1);
}
