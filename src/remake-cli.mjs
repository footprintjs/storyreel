/**
 * storyreel remake <breakdown.json | its folder> [--quick s] [--json]: a draft plan for a film made like the reference
 * (remake.mjs · remakePlan), printed in plain words for a person to approve, or as JSON for an agent. It needs no project
 * and writes nothing. Exit 0 with the plan, 2 when the command line or the breakdown is wrong.
 */
import {readFileSync, statSync} from 'node:fs';
import path from 'node:path';

export const REMAKE_USAGE = `storyreel remake <breakdown.json | its folder> [--quick s] [--json]   make one like it: a draft plan from a breakdown (storyreel breakdown) — its scenes, pace, entrances and music, each with its why, and what is still to give; it needs no project and writes nothing
             --quick  seconds: a shot shorter than this is quick, and quick shots joined by hard cuts are one scene (1)
             --json   the plan as JSON, for agents (its record left out: each choice's why carries its evidence)`;

const refuse = message => { console.error(`storyreel remake: ${message}\n${REMAKE_USAGE}`); return 2; };

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
  let given = null, quick, json = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') json = true;
    else if (args[i] === '--quick') {
      quick = args[++i];
      if (quick === undefined || !/^\d+(\.\d+)?$/.test(quick) || !(Number(quick) > 0)) return refuse(`--quick needs seconds, more than 0 (e.g. --quick 1.5), not ${JSON.stringify(quick ?? null)}`);
    } else if (!args[i].startsWith('--') && given === null) given = args[i];
    else return refuse(`"${args[i]}" is not understood`);
  }
  if (given === null) return refuse('name the breakdown: its breakdown.json, or the folder storyreel breakdown wrote it in');
  const {remakePlan, remakePlanText} = await import('./remake.mjs');
  try {
    const plan = await remakePlan(readBreakdown(given), quick === undefined ? {} : {thresholds: {quick: Number(quick)}});
    const {record, ...data} = plan;
    console.log(json ? JSON.stringify(data, null, 2) : remakePlanText(plan));
    return 0;
  } catch (e) {
    console.error(`storyreel remake: ${String(e?.message ?? e).replace(/^remakePlan: /, '')}`);
    return 2;
  }
}
