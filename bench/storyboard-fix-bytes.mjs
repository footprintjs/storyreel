#!/usr/bin/env node
/**
 * What `create` says back on a refusal, before and now, on examples/found with one number changed, beside what a host that keeps
 * nothing would resend. Bytes, with tokens as an estimate at four bytes each. The refusal itself got larger. What a host keeping
 * its file saves is not rewriting the board, and this bench does not measure that: it counts what is sent back, on this one
 * example and this one mistake, with no model run.
 *   node bench/storyboard-fix-bytes.mjs
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {storyboardBrief, storyboardProblems} from 'footprint-story/storyboard';
import {createFilm, createTool} from '../src/storyboard/create.mjs';

const here = fileURLToPath(new URL('../examples/found/', import.meta.url));
const read = (file) => JSON.parse(readFileSync(here + file, 'utf8'));
const story = read('story.json'), chat = read('chat.json');
const seeded = {...story, checked: story.checked.map((c, i) => (i === 1 ? {...c, found: c.found.replace('4355', '4356')} : c))};
const refused = (made) => made.then(() => { throw new Error('create took the seeded mistake: change the seed in this bench'); }, (error) => error);

const {instructions, material} = storyboardBrief(seeded.shape, {conversation: chat});
const problems = storyboardProblems(seeded, {conversation: chat});
if (problems.length !== 1) throw new Error(`the seeded mistake should be one problem, and it is ${problems.length}: change the seed in this bench`);
const before = await refused(createFilm('never-made', seeded, {conversation: chat, cwd: here}));   // what create passed on before: the reader's own list
const now = await refused(createTool(null, {story: JSON.stringify(seeded), to: 'never-made', conversation: 'chat.json', cwd: here}));

const size = (text) => Buffer.byteLength(text);
const row = (name, bytes) => console.log(`${name.padEnd(58)} ${String(bytes).padStart(6)} bytes (~${Math.round(bytes / 4)} tokens)`);
const said = size(before.message), fix = size(now.message), whole = size(instructions) + size(material);
const resent = whole + size(JSON.stringify(seeded)) + size(problems.map((p) => `${p.at} ${p.message}`).join('\n'));
row('what create said back before', said);
row('what create says back now', fix);
row('  of which the piece at fault', now.briefs.reduce((n, brief) => n + size(brief.material), 0));
row('a host keeping nothing: the whole brief again', whole);
row('a host keeping nothing: the brief, the board, its problem', resent);
console.log(`${now.briefs.length} piece at fault: ${now.briefs.map((b) => b.piece).join(', ')}`);
console.log(`the refusal itself got larger: ${(fix / said).toFixed(1)}x what create said back before`);
console.log(`only for a host keeping nothing: ${(whole / fix).toFixed(1)}x smaller than the whole brief, ${(resent / fix).toFixed(1)}x smaller than the brief, the board and its problem`);
console.log('a host keeping its file saves not rewriting the board: this bench does not measure that');
