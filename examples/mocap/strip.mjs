#!/usr/bin/env node
/**
 * Motion copied from a video, drawn: a cartoon figure moved by a person's keypoints (footprint-storyreel/mocap),
 * eight moments side by side on one PNG, and what the conversion found — the contacts, the gaps it filled, and why.
 *   node examples/mocap/strip.mjs [keypoints.json] [out.png]
 * keypoints.json is what tools/pose-from-video.py writes. In a checkout of the repo it defaults to the synthetic
 * walk the tests use (test/fixtures/mocap/walk.coco.json).
 */
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCanvas} from '@napi-rs/canvas';
import {fromPose} from 'footprint-storyreel/mocap';
import {drawFigure} from 'footprint-storyreel/kits/cartoon/figure';

const here = fileURLToPath(new URL('.', import.meta.url));
const file = process.argv[2] ?? path.join(here, '../../test/fixtures/mocap/walk.coco.json');
const out = process.argv[3] ?? path.join(here, 'out/strip.png');
const size = 300, floor = 380, cell = 200;

const source = await fromPose(JSON.parse(readFileSync(file, 'utf8')), {x: 0, size});
const {record} = source, seconds = record.timing.pass;
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
for (const g of record.gaps) console.log(`  ${g.joint} frames ${g.frames.join('–')}: ${g.how} — ${g.why}`);
