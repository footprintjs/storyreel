/**
 * Which test files a run takes: every test/*.test.mjs, one part of them (`--shard 2/3`), or the quick ones (`--quick`).
 * The files that render real films take most of the suite's time, so test/slow-files.json names them with their seconds,
 * measured on one machine: a part is filled slowest first into the emptiest part, so the parts take about equal time,
 * and the quick run leaves them out. A file not named there counts as quick, at QUICK_SECONDS. Prints one path a line.
 *
 *   node scripts/test-files.mjs                 every file
 *   node scripts/test-files.mjs --shard 2/3     the second of three parts (CI runs the three at once)
 *   node scripts/test-files.mjs --quick         every file that renders no film (npm run test:quick)
 */
import {readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
/** What a file not named in slow-files.json counts for, in seconds. */
export const QUICK_SECONDS = 2;

/** The suite's files, by name, and the seconds slow-files.json gives the slow ones. */
export function suite(root = repo) {
  const files = readdirSync(path.join(root, 'test')).filter(f => f.endsWith('.test.mjs')).sort();
  const slow = JSON.parse(readFileSync(path.join(root, 'test', 'slow-files.json'), 'utf8'));
  return {files, slow};
}

/** "2/3" → {index: 2, total: 3}; anything else refuses, naming the form. */
export function readShard(text) {
  const m = /^(\d+)\/(\d+)$/.exec(String(text ?? '')), index = Number(m?.[1]), total = Number(m?.[2]);
  if (!m || total < 1 || index < 1 || index > total) throw new RangeError(`--shard takes a part and a count, like 2/3, not ${JSON.stringify(text)}`);
  return {index, total};
}

/** The files of each part: slowest first, each into the part with the fewest seconds so far (ties to the lower part). */
export function shards({files, slow}, total) {
  const parts = Array.from({length: total}, () => ({files: [], seconds: 0}));
  const weight = f => slow[f] ?? QUICK_SECONDS;
  for (const f of [...files].sort((a, b) => weight(b) - weight(a) || (a < b ? -1 : 1))) {
    const part = parts.reduce((low, p) => (p.seconds < low.seconds ? p : low));
    part.files.push(f); part.seconds += weight(f);
  }
  return parts.map(p => ({files: p.files.sort(), seconds: p.seconds}));
}

/** The files a run takes, as paths from the repository: all, one part, or the quick ones. */
export function testFiles({shard, quick = false} = {}, root = repo) {
  const s = suite(root);
  let files = s.files;
  if (quick) files = files.filter(f => !Object.hasOwn(s.slow, f));
  if (shard !== undefined) { const {index, total} = readShard(shard); files = shards({...s, files}, total)[index - 1].files; }
  return files.map(f => path.join('test', f));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), at = args.indexOf('--shard');
  const other = args.find((a, i) => a !== '--quick' && a !== '--shard' && i !== at + 1);
  if (other !== undefined) { console.error(`test-files: "${other}" is not understood: give --shard 2/3, --quick, or nothing`); process.exit(2); }
  try { console.log(testFiles({quick: args.includes('--quick'), ...(at < 0 ? {} : {shard: args[at + 1]})}).join('\n')); }
  catch (e) { console.error(`test-files: ${e.message}`); process.exit(2); }
}
