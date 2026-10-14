// The renders the skills describe, run as written: the main path's farm film (plugin/skills/storyreel-cartoon/SKILL.md)
// rendered as its small draft (make.mjs, its result a real path), approved and rendered final (release.md · approve.mjs),
// a render into a team folder anyone can write to refused, and the approval refusing once the kit's code changes. Minutes of FFmpeg, so not part of `npm test`: `npm run test:skills:render`
// (its own CI job). The quick checks of the same pages are test/skills.test.mjs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, appendFileSync, statSync, mkdirSync, chmodSync, realpathSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {blocksOf, run, project} from './skills-blocks.mjs';

const skills = fileURLToPath(new URL('../plugin/skills/storyreel-cartoon/', import.meta.url));
const filesOf = page => blocksOf(readFileSync(path.join(skills, page), 'utf8')).filter(b => b.file);
const RENDER = {timeout: 300_000};

test('the farm film renders as the skills say: a small draft (real paths), approved, rendered final; a team folder and a changed kit are refused', async t => {
  const dir = project(t), started = Date.now(), took = () => `${((Date.now() - started) / 1000).toFixed(1)} s`;
  for (const b of [...filesOf('SKILL.md'), ...filesOf('release.md').filter(b => b.file === 'approve.mjs')]) writeFileSync(path.join(dir, b.file), b.code);
  const read = file => JSON.parse(readFileSync(path.join(dir, file), 'utf8'));

  const draft = await run(['make.mjs'], dir, RENDER);
  assert.equal(draft.code, 0, `make.mjs: ${draft.err || draft.out}`);
  const made = read('out/draft/making-of.json');
  assert.ok(statSync(path.join(dir, 'out/draft/film.mp4')).size > 0);
  assert.equal(made.span.whole, true);
  assert.equal(made.seconds, 20.8);
  assert.equal(made.finished.ok, true, JSON.stringify(made.finished.findings));
  assert.ok(made.inputs.code, 'the draft is rendered with the kit\'s code fingerprint, so an approval locks it');
  // Results report real paths, in the disk's own spelling (release.md: on macOS /var/… comes back as /private/var/…).
  assert.equal(draft.out.trim().split(' ')[0], path.join(realpathSync.native(dir), 'out', 'draft', 'film.mp4'));
  t.diagnostic(`draft: ${took()}`);

  // A team folder anyone can write to, with no sticky bit, is refused before anything is drawn, naming the fix (release.md).
  mkdirSync(path.join(dir, 'team')); chmodSync(path.join(dir, 'team'), 0o777);
  writeFileSync(path.join(dir, 'team-make.mjs'), readFileSync(path.join(dir, 'make.mjs'), 'utf8').replace("out: 'out/draft/film.mp4'", "out: 'team/film.mp4'"));
  const team = await run(['team-make.mjs'], dir, RENDER);
  assert.notEqual(team.code, 0, 'a render into a folder others can change must refuse');
  assert.match(team.err, /team can be changed by other users \(mode 0777, no sticky bit\).*render into a folder of your own and copy the film out/);

  const final = await run(['approve.mjs'], dir, RENDER);
  assert.equal(final.code, 0, `approve.mjs: ${final.err || final.out}`);
  assert.equal(read('approval.json').by, 'Sam');
  assert.equal(read('out/final/making-of.json').approval.by, 'Sam');
  assert.ok(statSync(path.join(dir, 'out/final/film.mp4')).size > 0);
  t.diagnostic(`approved and final: ${took()}`);

  appendFileSync(path.join(dir, 'farm.mjs'), '\n// an edit after the approval\n');
  const refused = await run(['approve.mjs'], dir, RENDER);
  assert.notEqual(refused.code, 0, 'a final render of a changed kit must refuse');
  assert.match(refused.err, /The film changed since Sam approved it on \d{4}-\d{2}-\d{2}: code differs from what was approved/);
});
