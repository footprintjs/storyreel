#!/usr/bin/env node
/**
 * Motion copied from a video, drawn: a cartoon figure moved by a person's keypoints (footprint-storyreel/mocap),
 * eight moments side by side on one PNG, and what the conversion found — the contacts, the gaps it filled, and why.
 *   node examples/mocap/strip.mjs keypoints.json [out.png]
 * keypoints.json is what tools/pose-from-video.py writes; in a checkout of the repo, the tests' synthetic walk is
 * test/fixtures/mocap/walk.coco.json.
 */
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCanvas} from '@napi-rs/canvas';
import {fromPose} from 'footprint-storyreel/mocap';
import {drawFigure} from 'footprint-storyreel/kits/cartoon/figure';

const here = fileURLToPath(new URL('.', import.meta.url));
const file = process.argv[2];
if (!file) {
  console.error('give a keypoints JSON: node examples/mocap/strip.mjs keypoints.json [out.png] (tools/pose-from-video.py writes one; in a checkout, test/fixtures/mocap/walk.coco.json)');
  process.exit(1);
}
const out = process.argv[3] ?? path.join(here, 'out/strip.png');
const size = 300, floor = 380, cell = 200;

const source = await fromPose(JSON.parse(readFileSync(file, 'utf8')), {x: 0, size});
const {record} = source, seconds = record.timing.pass;   // played once: the whole clip
const canvas = createCanvas(cell * 8, 420), ctx = canvas.getContext('2d');
ctx.fillStyle = '#f6f1e7'; ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = '#c9bfa8'; ctx.fillRect(0, floor + 8, canvas.width, 3);
for (let i = 0; i < 8; i++) {
  // Each moment in its own cell: the body centred there, its feet where the pose puts them around it.
  const pose = source.poseAt(source.start + seconds * i / 7);
  ctx.save(); ctx.translate(cell * i + cell / 2 - pose.x, 0);
  drawFigure(ctx, pose, {floor, size});
  ctx.restore();
}
mkdirSync(path.dirname(out), {recursive: true});
writeFileSync(out, canvas.toBuffer('image/png'));
console.log(`${out} · ${record.kept.count} frames at ${record.fps} fps · facing ${record.facing.how} (${record.facing.why})`);
for (const c of record.contacts) console.log(`  ${c.foot} foot planted ${c.film[0]}–${c.film[1]} s (frames ${c.frames.join('–')}): ${c.why}`);
for (const g of record.gaps) console.log(`  ${g.at.length} gap${g.at.length > 1 ? 's' : ''} of ${g.missing} frame${g.missing > 1 ? 's' : ''} (${g.edge}): ${g.how} — ${g.why}`);
