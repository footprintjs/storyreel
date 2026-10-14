#!/usr/bin/env node
/**
 * The typed entry points: every package.json export that has a `types` condition (at any depth of its conditions),
 * named the way @arethetypeswrong/cli's --entrypoints takes them ("." and subpaths without their "./"). The one list
 * both workflows check, so CI and the publish can never check different ones (an export without types — the drawing
 * internals, the README says — is left out):
 *   npx @arethetypeswrong/cli --pack --profile esm-only --entrypoints $(node scripts/typed-entrypoints.mjs)
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

/** Whether an export's target (a path, or an object of conditions) has `types` anywhere in it. */
const typed = target => target !== null && typeof target === 'object' && ('types' in target || Object.values(target).some(typed));

/** The typed entry points of a package.json, in its exports' order: "." and subpaths without "./". */
export function typedEntrypoints(pkg) {
  return Object.entries(pkg.exports ?? {}).filter(([, target]) => typed(target)).map(([key]) => (key === '.' ? '.' : key.replace(/^\.\//, '')));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(typedEntrypoints(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))).join(' '));
}
