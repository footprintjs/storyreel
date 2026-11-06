#!/usr/bin/env node
/**
 * What one fix round sends: the whole brief again against what `create` says back, on examples/found with one number changed.
 * Bytes, with tokens as an estimate at four bytes each. It measures this one example and this one mistake, with no model run,
 * and only what is sent: a model answering with the piece, or with the whole board, is not measured here.
 *   node bench/storyboard-fix-bytes.mjs
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {storyboardBrief, storyboardProblems} from 'footprint-story/storyboard';
import {createTool} from '../src/storyboard/create.mjs';

const here = fileURLToPath(new URL('../examples/found/', import.meta.url));
const read = (file) => JSON.parse(readFileSync(here + file, 'utf8'));
const story = read('story.json'), chat = read('chat.json');
const seeded = {...story, checked: story.checked.map((c, i) => (i === 1 ? {...c, found: c.found.replace('4355', '4356')} : c))};

const {instructions, material} = storyboardBrief(seeded.shape, {conversation: chat});
const problems = storyboardProblems(seeded, {conversation: chat});
if (problems.length !== 1) throw new Error(`the seeded mistake should be one problem, and it is ${problems.length}: change the seed in this bench`);
const refusal = await createTool(null, {story: JSON.stringify(seeded), to: 'never-made', conversation: 'chat.json', cwd: here}).then(
  () => { throw new Error('create took the seeded mistake: change the seed in this bench'); },
  (refused) => refused,
);

const size = (text) => Buffer.byteLength(text);
const row = (name, bytes) => console.log(`${name.padEnd(44)} ${String(bytes).padStart(6)} bytes (~${Math.round(bytes / 4)} tokens)`);
const whole = size(instructions) + size(material);
const resent = whole + size(JSON.stringify(seeded)) + size(problems.map((p) => `${p.at} ${p.message}`).join('\n'));
const fix = size(refusal.message), piece = refusal.briefs.reduce((n, brief) => n + size(brief.material), 0);
row('the whole brief again', whole);
row('the whole brief, the board and its problem', resent);
row('what create says back now', fix);
row('  of which the piece at fault', piece);
console.log(`${refusal.briefs.length} piece at fault: ${refusal.briefs.map((b) => b.piece).join(', ')}`);
console.log(`smaller than the whole brief ${(whole / fix).toFixed(1)}x, and than the brief with the board and its problem ${(resent / fix).toFixed(1)}x`);
