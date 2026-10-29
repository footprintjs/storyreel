/**
 * storyreel remake <breakdown.json | its folder> [--quick s] [--json] [--starter folder]: a draft plan for a film made
 * like the reference (remake.mjs · remakePlan), printed in plain words for a person to approve, or as JSON for an agent;
 * with --starter, the approved plan made into a starter film's folder (remake-starter.mjs · remakeStarter), which never
 * replaces a file already there. It needs no project. Exit 0 with the plan, 2 when the command line, the breakdown or the
 * folder is wrong.
 */
import {lstatSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {makeFolder, writeOutput} from './files.mjs';

export const REMAKE_USAGE = `storyreel remake <breakdown.json | its folder> [--quick s] [--json] [--starter folder]   make one like it: a draft plan from a breakdown (storyreel breakdown) — its scenes, pace, entrances and music, each with its why, and what is still to give; it needs no project, and writes only a starter
             --quick    seconds: a shot shorter than this is quick, and quick shots joined by hard cuts are one scene (1)
             --json     the plan as JSON, for agents (its record left out: each choice's why carries its evidence)
             --starter  a folder to make the approved plan into a starter film: an animatic in the reference's rhythm that renders as it is (storyboard.json, recipe.json, plan.json, storyreel.config.mjs, render.mjs, README.md: what to give, and where); a file already there is never replaced`;

const refuse = message => { console.error(`storyreel remake: ${message}\n${REMAKE_USAGE}`); return 2; };

/** Whether anything is at `at` — a file, a folder, or a link, even one that leads nowhere. */
const taken = at => { try { lstatSync(at); return true; } catch { return false; } };

/**
 * The starter's files written into `folder`: made when missing, through its real path (files.mjs · makeFolder: nothing
 * on the way another user could rearrange), each written as every output is (files.mjs · writeOutput: a link at its
 * name replaced, never written through). A person's edits are never lost: a folder holding any of the names — a file,
 * a folder or a link — is refused before anything is written.
 */
function writeStarter(folder, files) {
  if (taken(folder) && !statSync(folder).isDirectory()) throw new Error(`${folder} is a file: name a folder for the starter`);
  const there = Object.keys(files).filter(name => taken(path.join(folder, name)));
  if (there.length) throw new Error(`${folder} already has ${there.join(', ')}: name a new folder for the starter (a file there is never replaced)`);
  const made = makeFolder(folder);
  for (const [name, text] of Object.entries(files)) writeOutput(path.join(made, name), text);
}

/** The breakdown's spec: the file named, or breakdown.json in the folder named. */
function readBreakdown(given) {
  let file = given;
  try { if (statSync(given).isDirectory()) file = path.join(given, 'breakdown.json'); } catch { throw new Error(`no file or folder at ${given}: name a breakdown.json (storyreel breakdown <video> --out <folder> writes one)`); }
  let text;
  try { text = readFileSync(file, 'utf8'); } catch (e) {
    throw new Error(e?.code === 'ENOENT' ? `no breakdown.json in ${given}: run storyreel breakdown <video> --out ${given} first` : `${file} cannot be read (${e?.code ?? e?.message}): make it readable, or name another breakdown.json`);
  }
  try { return JSON.parse(text); } catch (e) { throw new Error(`${file} is not JSON (${e.message}): name the breakdown.json storyreel breakdown wrote`); }
}

export async function remakeCommand(args) {
  if (args.includes('--help') || args[0] === 'help') { console.log(REMAKE_USAGE); return 0; }
  let given = null, quick, json = false, starter = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') json = true;
    else if (args[i] === '--quick') {
      quick = args[++i];
      if (quick === undefined || !/^\d+(\.\d+)?$/.test(quick) || !(Number(quick) > 0)) return refuse(`--quick needs seconds, more than 0 (e.g. --quick 1.5), not ${JSON.stringify(quick ?? null)}`);
    } else if (args[i] === '--starter') {
      starter = args[++i] ?? null;
      if (starter === null || starter.startsWith('--') || !starter.trim()) return refuse('--starter needs the folder to make the starter film in (e.g. --starter work/like-it)');
    } else if (!args[i].startsWith('--') && given === null) given = args[i];
    else return refuse(`"${args[i]}" is not understood`);
  }
  if (given === null) return refuse('name the breakdown: its breakdown.json, or the folder storyreel breakdown wrote it in');
  const {remakePlan, remakePlanText} = await import('./remake.mjs');
  try {
    const plan = await remakePlan(readBreakdown(given), quick === undefined ? {} : {thresholds: {quick: Number(quick)}});
    const {record, ...data} = plan;
    if (starter === null) { console.log(json ? JSON.stringify(data, null, 2) : remakePlanText(plan)); return 0; }
    const {remakeStarter} = await import('./remake-starter.mjs');
    const made = remakeStarter(plan);
    writeStarter(starter, made.files);
    const files = Object.keys(made.files);
    console.log(json ? JSON.stringify({...data, starter: {folder: starter, files, give: made.give, notes: made.notes}}, null, 2)
      : `${remakePlanText(plan)}\n## A starter film, in ${starter}\n\n${files.join(', ')}: it renders as it is, every card saying what goes there. In that folder, npx storyreel sheet shows a still of each scene and node render.mjs the whole film; its README.md says what is still to give, and where.\n`);
    return 0;
  } catch (e) {
    console.error(`storyreel remake: ${String(e?.message ?? e).replace(/^remake(Plan|Starter): /, '')}`);
    return 2;
  }
}
