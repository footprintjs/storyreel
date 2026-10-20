/**
 * storyreel sounds search|add|list — found sounds from the command line (sounds/index.mjs), compact: one line a sound.
 * The Openverse adapter is imported only when a command needs the network (search, add); `list` reads the film offline.
 * soundsCommand returns the exit code: 0 done, 1 refused (the line says why and what to do), 2 not understood.
 */
import {searchSounds, addSound, listSounds, candidateLine, addedText, listedText} from './index.mjs';
import {usableLicences, LICENCES} from '../found.mjs';

/** The usage, as `storyreel --help` lists it (test/skills.test.mjs reads its command and flag lines). */
export const SOUNDS_HELP = `  sounds   search "<words>" | add <id> --as <name> | list — recorded sound effects from Openverse, fetched once into the
           film's sounds/ folder (sounds.json keeps each one's licence and attribution); renders read them offline
             --as  add: the sound's name in the film (lower case, dashes: page-turn); a sound event names it {type: 'found', name}
             --film  add, list: the film's folder, where sounds/ is (default: here)
             --limit  search: how many to show, 1–20 (default 5)
             --allow-share-alike  search, add, list: CC BY-SA sounds too (they put the whole film under CC BY-SA)`;
const USAGE = `storyreel sounds search "<words>" [--limit n] [--allow-share-alike]
storyreel sounds add <id> --as <name> [--film dir] [--allow-share-alike]
storyreel sounds list [--film dir] [--allow-share-alike]`;
const FLAGS = {search: ['limit', 'allow-share-alike'], add: ['as', 'film', 'allow-share-alike'], list: ['film', 'allow-share-alike']};
const SWITCHES = new Set(['allow-share-alike']);

/** The command line read: {sub, word, flags}, or a refusal (exit 2) in words. */
function readArgs(args) {
  const [sub, ...rest] = args, flags = {};
  if (!Object.hasOwn(FLAGS, sub ?? '')) return {error: `"${sub ?? ''}" is not a sounds command; they are search, add and list`};
  let word = null;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) { if (word !== null) return {error: `"${a}" is not understood (quote the words of a search: "page turn")`}; word = a; continue; }
    const flag = a.slice(2);
    if (!FLAGS[sub].includes(flag)) return {error: `--${flag} is not a flag of sounds ${sub} (it takes ${FLAGS[sub].map(f => `--${f}`).join(', ')})`};
    if (SWITCHES.has(flag)) { flags[flag] = true; continue; }
    if (rest[i + 1] === undefined || rest[i + 1].startsWith('--')) return {error: `--${flag} needs a value`};
    flags[flag] = rest[++i];
  }
  if (sub !== 'list' && word === null) return {error: sub === 'search' ? 'name what to search for: sounds search "page turn"' : 'name the sound: sounds add <id> --as <name> (sounds search lists ids)'};
  if (sub === 'list' && word !== null) return {error: `"${word}" is not understood: sounds list takes only --film`};
  if (sub === 'add' && !flags.as) return {error: 'sounds add needs --as <name>: the name the film calls it by (e.g. --as page-turn)'};
  if (flags.limit !== undefined && !/^\d{1,2}$/.test(flags.limit)) return {error: `--limit is a whole number 1–20, not ${JSON.stringify(flags.limit)}`};
  return {sub, word, flags};
}

/**
 * Run `storyreel sounds …`: `source` is the sound source (default: Openverse, imported here only when needed); `out`
 * and `err` print a line (a test collects them). Returns the exit code.
 */
export async function soundsCommand(args, {source = null, out = console.log, err = console.error} = {}) {
  if (args.includes('--help') || args[0] === 'help') { out(`${USAGE}\n\n${SOUNDS_HELP}`); return 0; }
  const read = readArgs(args);
  if (read.error) { err(`storyreel sounds: ${read.error}\n${USAGE}`); return 2; }
  const {sub, word, flags} = read, allowShareAlike = flags['allow-share-alike'] === true;
  const from = async () => source ?? (await import('./openverse.mjs')).openverse();
  try {
    if (sub === 'search') {
      const src = await from(), found = await searchSounds(src, word, {limit: flags.limit === undefined ? 5 : Number(flags.limit), allowShareAlike});
      const under = usableLicences({allowShareAlike}).map(k => LICENCES[k].name).join(', ');
      out(found.length ? found.map(candidateLine).join('\n') : `nothing found for "${word}" under ${under}: try other words`);
      if (src.limits) out(`${src.name}: ${src.limits}`);
    } else if (sub === 'add') {
      out(addedText(await addSound({source: await from(), id: word, as: flags.as, film: flags.film ?? '.', allowShareAlike})));
    } else {
      const listed = listSounds(flags.film ?? '.', {allowShareAlike});
      out(listed.length ? listed.map(listedText).join('\n') : 'no found sounds here: add one with npx storyreel sounds add <id> --as <name>');
      if (listed.some(l => l.state !== 'ok')) return 1;
    }
    return 0;
  } catch (e) {
    err(`storyreel sounds ${sub}: ${e?.message ?? e}`);
    return 1;
  }
}
