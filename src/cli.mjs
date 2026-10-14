#!/usr/bin/env node
/**
 * storyreel <tool> [--flag value …] — the review tools from the command line (tools.mjs), for people and for
 * agents: read first (timeline, review), look last (part, still). The project's storyreel.config.mjs names the
 * film; every flag goes to its film() too (--ep ep1 --voice work/ep1/voice). `storyreel beats <song>` needs no project:
 * it prints the song's beat map as text (beats.mjs · beatMapText), so a person can settle an unsure tempo in seconds.
 */
import path from 'node:path';
import {TOOLS, CONFIG, loadProject} from './tools.mjs';

const BEATS_HELP = `  beats    <song> — the song's tempo as the beat map hears it (no project needed): the verdict, the candidate tempi with
           their scores, and why each level of the beat is unsure; an unsure tempo is settled by giving music.bpm
             --bpm  the tempo you hear, to check it: the map is then sure
             --ffmpeg  the FFmpeg to read the song with`;
const BREAKDOWN_USAGE = 'storyreel breakdown <video.mp4> [--out dir]   a reference film broken down into a spec to match: shots, cuts, pacing, motion (breakdown.mjs); it needs no project, and FFmpeg 5.1 or later';

/** What a failed breakdown's record says (error.record): where it stopped, and its last decisions with their evidence. */
function recordSoFar(record) {
  if (!Array.isArray(record) || !record.length) return '';
  // The error itself is said once, above: the record's own line for it (an error entry) is not repeated.
  const last = record.at(-1), decisions = record.filter(e => e.type === 'condition').slice(-5);
  return `\nThe record so far (${record.length} ${record.length === 1 ? 'entry' : 'entries'}) stops in "${last.stageName ?? last.stageId ?? '?'}"${last.type === 'error' ? '.' : `: ${last.text}`}${decisions.length ? `\nIts last decisions:${decisions.map(e => `\n  ${e.text}`).join('')}` : ''}`;
}

/** storyreel breakdown <video> [--out dir]: the spec, its plain words and its files (breakdown.mjs · breakdown). */
async function breakdownCommand(args) {
  if (args.includes('--help') || args.includes('help')) { console.log(BREAKDOWN_USAGE); return; }
  let video = null, out;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1] && !args[i + 1].startsWith('--')) out = args[++i];
    else if (!args[i].startsWith('--') && video === null) video = args[i];
    else { console.error(`storyreel breakdown: "${args[i]}" is not understood\n${BREAKDOWN_USAGE}`); process.exit(2); }
  }
  if (!video) { console.error(`storyreel breakdown: name the video\n${BREAKDOWN_USAGE}`); process.exit(2); }
  const {breakdown} = await import('./breakdown.mjs');
  try {
    const {text, files} = await breakdown(video, out ? {out} : {});
    console.log(`${text}\n${files.json}\n${files.md}\n${files.overview} · ${files.sheets.length} shot sheet${files.sheets.length === 1 ? '' : 's'} in ${files.sheets.length ? files.sheets[0].replace(/[^/\\]*$/, '') : '-'}\n${files.record}`);
  } catch (e) { console.error(`storyreel breakdown: ${String(e?.message ?? e).replace(/^breakdown: /, '')}${recordSoFar(e?.record)}`); process.exit(1); }
}

const [command, ...given] = process.argv.slice(2), flags = {};
if (command === 'breakdown') { await breakdownCommand(given); process.exit(0); }
// beats takes the song first: a path, not a flag.
const song = command === 'beats' && given[0] !== undefined && !given[0].startsWith('--') ? given[0] : null, rest = song === null ? given : given.slice(1);
for (let i = 0; i < rest.length; i++) {
  if (!rest[i].startsWith('--')) { console.error(`storyreel: "${rest[i]}" is not a flag (flags are --name value)`); process.exit(2); }
  const next = rest[i + 1];
  flags[rest[i].slice(2)] = next === undefined || next.startsWith('--') ? 'true' : (i++, next);
}
if (command === 'mcp') { const {serveMcp} = await import('./mcp.mjs'); await serveMcp({defaults: flags}); process.exit(0); }
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
  const lines = [...Object.entries(TOOLS).map(([name, t]) => `  ${name.padEnd(9)}${t.about}\n${Object.entries(t.args).map(([a, d]) => `             --${a}  ${d}`).join('\n')}`), BEATS_HELP];
  (TOOLS[command] || !command || command === 'help' || command === '--help' ? console.log : console.error)(`storyreel <tool> [--flag value …]   (the film is named in ./${CONFIG}; --config another file)\n\n${lines.join('\n')}\n\nRead first, look last: timeline → review → fix → part → still.\nstoryreel mcp [--flag value …] serves the same tools over MCP (stdio); the flags are every call's defaults.\n${BREAKDOWN_USAGE}`);
  process.exit(command && command !== 'help' && command !== '--help' && !TOOLS[command] ? 2 : 0);
}
try {
  const project = await loadProject(flags), out = await TOOLS[command].run(project, flags);
  console.log(typeof out === 'string' ? out : out.text);
} catch (e) {
  console.error(`storyreel ${command}: ${e.message}`); process.exit(1);
}
