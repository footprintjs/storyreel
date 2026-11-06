/**
 * `storyreel narrate`: a film's voice, in one command. footprint-story/voice owns the voicing and the clip cache; what is the
 * film's own is its lines (what each scene says, numbers in words) and the voice folder a render reads: timings.json beside
 * one WAV per scene, each its own, because pacing cuts into it. Silent scenes are left out: the clock times them from their
 * directions. A kit runs Python on this machine, so its folder comes from the person's command or the MCP server's start,
 * never from a project's files or a call.
 */
import {existsSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import path from 'node:path';
import {narrate, narrationSummary, narrationVoice} from 'footprint-story/voice';
import {checkScene, spokenText, unsaidNumbers} from './clock.mjs';
import {writeOutput} from './files.mjs';
import {sceneScript} from './script.mjs';

export const NARRATE_ABOUT = 'What each scene says, voiced or not, and how far the narration has got. With a voice kit it voices what is missing, keeping every clip it finishes, and times the film by the voice once every scene is voiced.';
export const NARRATE_ARGS = Object.freeze({kit: 'your voice kit\'s folder: it voices what is missing (a kit runs Python on this machine)', takes: 'a folder of your own recordings, lined up by the kit\'s aligner instead', only: 'the scenes to voice now, by number, like 1-3,7'});
export const NARRATE_MCP_ARGS = Object.freeze({say: 'voice what is missing: "all", or scenes like "1-3,7"; left out, it only reads. It needs a server started with --kit, takes minutes, and keeps every clip it finishes, so a call that times out can be made again'});

const MADE_BY_NARRATE = '.storyreel-narrate', TIMINGS = 'timings.json', SCENE_SOUND = /^said-\d+\.wav$/;

/** A voice folder narrate made loses what it told the film; a cached clip stays, so the same words cost nothing to join again. */
export function forgetVoice(folder) {
  if (!existsSync(path.join(folder, MADE_BY_NARRATE))) return;
  rmSync(path.join(folder, TIMINGS), {force: true});
  for (const name of readdirSync(folder)) if (SCENE_SOUND.test(name)) rmSync(path.join(folder, name), {force: true});
}

/** The voice folder the film names, refused when it would never be heard or holds a voice made another way. */
function voiceFolder({inputs, cwd}) {
  if (inputs.timings) throw new Error('film() gives its own timings, so no voice would be heard: take them out, and name narrationDir');
  if (!inputs.narrationDir) throw new Error('name where the voice goes: add narrationDir: \'voice\' to what film() returns in the project\'s config, and pacing: {sceneTail: 0.8, holds: []} once it is voiced');
  const folder = path.resolve(cwd, inputs.narrationDir);
  if (existsSync(path.join(folder, TIMINGS)) && !existsSync(path.join(folder, MADE_BY_NARRATE))) throw new Error(`${inputs.narrationDir} holds a voice narrate did not make: name another narrationDir, so it is not overwritten`);
  return folder;
}

/** One voice says every line here, so a film with its speakers' lines is voiced another way. */
function refuseSeveralSpeakers(storyboard) {
  const scene = storyboard.scenes.find((s, i) => s.narration !== undefined && (s.speaker !== undefined || sceneScript(s, i).lines.length > 0));
  if (scene) throw new Error(`scene "${scene.id}" names who says it, and one voice would say every line: voice each speaker with your own step (storyreel script gives the lines), or take the names out`);
}

/** The folder a render reads, once every scene is voiced: a WAV per scene and their timings. */
function joinVoice(folder, voiced) {
  const unfit = voiced.find(({clip}) => !clip.words?.length || !clip.audio.endsWith('.wav'));
  if (unfit) throw new Error(`scene "${unfit.id}": its clip has ${unfit.clip.words?.length ? 'no WAV' : 'no timed words'}, and a film needs both: voice it with a kit that aligns its words, or take the clip out of the cache`);
  writeOutput(path.join(folder, MADE_BY_NARRATE), 'This folder was made by storyreel narrate, which may write here again.\n');
  const scenes = voiced.map(({id, n, clip}) => {
    const audio = `said-${n}.wav`;
    writeOutput(path.join(folder, audio), readFileSync(clip.audio));
    return {id, audio, duration: clip.duration, words: clip.words, alignment: {status: 'available', method: 'storyreel narrate'}};
  });
  writeOutput(path.join(folder, TIMINGS), `${JSON.stringify({provider: 'storyreel narrate', scenes}, null, 1)}\n`);
}

/** `storyreel narrate [--kit folder] [--takes folder] [--only 1-3,7]`: as text. With no voice it reads, and joins what is already voiced. */
export async function narrateTool({inputs, cwd, said}, {kit, takes, only} = {}) {
  if (only && !kit) throw new Error('--only picks the scenes to voice: name the voice too, --kit <folder>');
  const folder = voiceFolder({inputs, cwd}), cache = path.join(folder, 'cache'), lines = said.scenes.map((s, i) => ({id: s.id, text: checkScene(s, i) === 'silent' ? '' : spokenText(s)}));
  const unsaid = unsaidNumbers(said), digits = unsaid.map(u => `"${u.text}" in ${u.scene}`).join(', ');
  if (kit) {
    refuseSeveralSpeakers(said);
    if (unsaid.length) throw new Error(`a voice drops or garbles digits, and the film says ${digits}: write them as number slots (say) before voicing`);
  }
  const {engine, profile} = narrationVoice({cache, kit, takes});
  const report = await narrate(lines, {cache, profile, engine, only});
  forgetVoice(folder);
  const whole = report.voiced > 0 && report.toVoice === 0;
  if (whole) joinVoice(folder, report.lines.filter(l => l.state === 'voiced'));
  const hint = 'storyreel narrate --kit <your voice kit> (over MCP: a server started with --kit, and call narrate with say)';
  return [narrationSummary(report, {noun: 'scenes', hint}),
    ...(unsaid.length ? [`to fix first: a voice drops or garbles digits, and the film says ${digits}: write them as number slots (say)`] : []),
    whole ? 'the film is timed by this voice now. next: storyreel timeline · storyreel review' : 'the film stays silent until every scene is voiced'].join('\n');
}
