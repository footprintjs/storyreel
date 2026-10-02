#!/usr/bin/env node
/**
 * storyreel <tool> [--flag value …] — the review tools from the command line (tools.mjs), for people and for
 * agents: read first (timeline, review), look last (part, still). The project's storyreel.config.mjs names the
 * film; every flag goes to its film() too (--ep ep1 --voice work/ep1/voice).
 */
import {TOOLS, CONFIG, loadProject} from './tools.mjs';

const [command, ...rest] = process.argv.slice(2), flags = {};
for (let i = 0; i < rest.length; i++) {
  if (!rest[i].startsWith('--')) { console.error(`storyreel: "${rest[i]}" is not a flag (flags are --name value)`); process.exit(2); }
  const next = rest[i + 1];
  flags[rest[i].slice(2)] = next === undefined || next.startsWith('--') ? 'true' : (i++, next);
}
if (!command || command === 'help' || command === '--help' || !TOOLS[command]) {
  const lines = Object.entries(TOOLS).map(([name, t]) => `  ${name.padEnd(9)}${t.about}\n${Object.entries(t.args).map(([a, d]) => `             --${a}  ${d}`).join('\n')}`);
  (TOOLS[command] || !command || command === 'help' || command === '--help' ? console.log : console.error)(`storyreel <tool> [--flag value …]   (the film is named in ./${CONFIG}; --config another file)\n\n${lines.join('\n')}\n\nRead first, look last: timeline → review → fix → part → still.`);
  process.exit(command && command !== 'help' && command !== '--help' && !TOOLS[command] ? 2 : 0);
}
try {
  const project = await loadProject(flags), out = await TOOLS[command].run(project, flags);
  console.log(typeof out === 'string' ? out : out.text);
} catch (e) {
  console.error(`storyreel ${command}: ${e.message}`); process.exit(1);
}
