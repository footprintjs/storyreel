// Found sounds offline (src/found.mjs, film.mjs, render.mjs, release.mjs): the licence gate's one table, a library a
// film can trust only as far as its sha256s, a film that names a found sound (checked when it is built, locked by an
// approval), a render that mixes it from its file without the network, and credits written from the records.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {compileFilm, evenTimings, renderFilm, makeFilm} from '../src/index.mjs';
import {LICENCES, usableLicences, licenceVerdict, plainText, foundRecord, readLibrary, useFound, libraryText, sha256Of, creditLines, shown} from '../src/found.mjs';
import {checkSound, createMotionSound, readSoundChoice} from '../src/sound.mjs';
import {readEntrance} from '../src/transitions.mjs';
import {creditsText} from '../src/release.mjs';
import {tempDir} from './tmp.mjs';

const WAV = createMotionSound({duration: .5, events: [{type: 'door', time: 0}]}).wav;
const ffmpeg = spawnSync(process.env.FFMPEG_BIN || 'ffmpeg', ['-version']).status === 0;
const ID = 'ec2e245c-465b-4ba7-9ea4-620f3555b291';

/** A film folder with found sounds in its library: {name: {license, bytes?}} → each kept as <name>.wav. */
function filmWith(sounds, t) {
  const root = tempDir('found-film', t), dir = path.join(root, 'sounds'), library = {};
  mkdirSync(dir);
  for (const [name, {license = 'by', version = '4.0', bytes = WAV, title = `A ${name}`, attribution}] of Object.entries(sounds)) {
    writeFileSync(path.join(dir, `${name}.wav`), bytes);
    library[name] = foundRecord({name, file: `${name}.wav`, from: 'openverse', id: ID, title, creator: 'a-maker', license, licenseVersion: version, attribution,
      source: 'freesound', url: 'https://cdn.example.org/x.wav', seconds: .5, sha256: sha256Of(bytes), bytes: bytes.length});
  }
  writeFileSync(path.join(dir, 'sounds.json'), libraryText(library));
  return root;
}
const editLibrary = (root, edit) => { const file = path.join(root, 'sounds', 'sounds.json'), data = JSON.parse(readFileSync(file, 'utf8')); edit(data.sounds); writeFileSync(file, JSON.stringify(data)); };

test('the licence gate is one table: CC0 and CC BY used, CC BY-SA only by opting in, NC, ND and the unknown refused saying why', () => {
  const outcome = code => { try { return licenceVerdict(code).shareAlike ? 'share-alike' : 'yes'; } catch (e) { return e.message; } };
  assert.equal(outcome('cc0'), 'yes'); assert.equal(outcome('by'), 'yes');
  assert.match(outcome('by-sa'), /is CC BY-SA: using it puts the whole film under CC BY-SA too — to accept that, give the recipe "foundSounds": \{"allowShareAlike": true\}/);
  assert.equal(licenceVerdict('by-sa', {allowShareAlike: true}).shareAlike, true);
  for (const code of ['by-nc', 'by-nc-sa', 'nc-sampling+']) assert.match(outcome(code), /which a film cannot use: NC allows no commercial use, and a film is posted where ads run — pick a CC0 or CC BY sound/);
  assert.match(outcome('by-nd'), /ND allows no changes, and mixing a sound into a film changes it/);
  assert.match(outcome('by-nc-nd'), /NC allows no commercial use and ND no changes/);
  assert.match(outcome('pdm'), /Public Domain Mark .* grants nothing/);
  for (const code of ['', 'CC-BY', 'gpl', undefined, 'constructor', '__proto__']) assert.match(outcome(code), /which StoryReel does not know: a film uses CC0 and CC BY sounds/, String(code));
  assert.deepEqual(usableLicences(), ['cc0', 'by']); assert.deepEqual(usableLicences({allowShareAlike: true}), ['cc0', 'by', 'by-sa']);
  assert.equal(Object.values(LICENCES).filter(l => l.use === 'no').every(l => l.why), true, 'every refusal has its why');
});

test('a record is made plain: no control, bidi or line-break character, capped lengths, the licence URL built from the code', () => {
  const r = foundRecord({name: 'x', file: 'x.wav', id: 'abc', title: `T\u0000i\u001b[2Jt‮le\n${'é'.repeat(300)}`, creator: 'c\r\nInjected: yes', license: 'by', licenseVersion: '4.0',
    attribution: `"T" by c  is licensed\u0007 ${'z'.repeat(1000)}`, url: 'http://not-https.example/x', landing: 'javascript:alert(1)', sha256: 'nothex', bytes: -1, seconds: Infinity});
  for (const key of ['title', 'creator', 'attribution']) assert.ok(shown(r[key]) && !/[\r\n]/.test(r[key]), `${key}: ${JSON.stringify(r[key]).slice(0, 80)}`);
  assert.equal(r.creator, 'c Injected: yes');
  assert.equal([...r.title].length, 120); assert.ok(r.title.endsWith('…'));
  assert.equal(r.attribution.length, 400);
  assert.deepEqual([r.url, r.landing, r.sha256, r.bytes, r.seconds, r.licenseUrl], [null, null, null, null, null, 'https://creativecommons.org/licenses/by/4.0/']);
  assert.equal(foundRecord({license: 'cc0', licenseVersion: '1.0'}).licenseUrl, 'https://creativecommons.org/publicdomain/zero/1.0/');
  assert.equal(foundRecord({license: 'by', title: 'Knock', creator: 'a'}).attribution, '"Knock" by a, CC BY (https://creativecommons.org/licenses/by/4.0/)', 'no attribution given: one written from the record');
  assert.equal(plainText('a​⁦b', 10), 'a b');
});

test('a library a film can trust only as far as its sha256s: a swapped file, a refused licence, a name with a way out all refuse', t => {
  const root = filmWith({knock: {}}, t);
  assert.equal(useFound(root, 'knock').record.sha256, sha256Of(WAV));
  writeFileSync(path.join(root, 'sounds', 'knock.wav'), 'another sound');
  assert.throws(() => useFound(root, 'knock'), /the found sound "knock"'s file sounds\/knock\.wav is not the one its record names \(size or sha256 differ\): add it again with npx storyreel sounds add ec2e245c-465b-4ba7-9ea4-620f3555b291 --as knock/);
  const nc = filmWith({knock: {license: 'by-nc'}}, t);
  assert.throws(() => useFound(nc, 'knock'), /the found sound "knock" is CC BY-NC, which a film cannot use/, 'the record\'s own licence, read at every use');
  const away = filmWith({knock: {}}, t);
  editLibrary(away, s => { s.knock.file = '../../outside.wav'; });
  assert.throws(() => useFound(away, 'knock'), /its file must be knock\.<mp3\|wav\|ogg\|flac>/);
  editLibrary(away, s => { s['../evil'] = s.knock; });
  assert.throws(() => readLibrary(away), /has an entry "\.\.\/evil" that is not a found sound/);
  writeFileSync(path.join(away, 'sounds', 'sounds.json'), '{"schemaVersion": 1, "sounds": [1]}');
  assert.throws(() => readLibrary(away), /is not a found-sound library/);
  writeFileSync(path.join(away, 'sounds', 'sounds.json'), 'not json');
  assert.throws(() => readLibrary(away), /is not JSON/);
  assert.throws(() => useFound(filmWith({}, t), 'knock'), /"knock" is not in sounds\/sounds\.json: add it with npx storyreel sounds add <id> --as knock \(find an id with npx storyreel sounds search "<words>"\)/);
  assert.deepEqual(readLibrary(tempDir('found-empty', t)), {}, 'no library: none');
});

test('a sound event and an entrance may name a found sound; the shape is checked where every sound is', () => {
  assert.doesNotThrow(() => checkSound({time: 1, type: 'found', name: 'page-turn', gain: .5}, 'the kit "k"'));
  assert.throws(() => checkSound({time: 1, type: 'found', name: '../x'}, 'the kit "k"'), /the kit "k" makes a found sound whose name is not one/);
  assert.throws(() => checkSound({time: 1, type: 'found', name: 'ok', gain: 2}, 'the kit "k"'), /gain must be a number from 0 to 1/);
  assert.throws(() => checkSound({time: 1, type: 'boom'}, 'the kit "k"'), /the sounds are .*, or a found sound \{type: 'found', name\}/);
  assert.deepEqual(readSoundChoice({type: 'found', name: 'tear', gain: .6}), {type: 'found', name: 'tear', gain: .6});
  assert.equal(readSoundChoice({type: 'found', name: 'tear', extra: 1}), null);
  assert.deepEqual(readEntrance({type: 'wipe', sound: {type: 'found', name: 'tear'}}, 'x').sound, {type: 'found', name: 'tear'});
  assert.throws(() => readEntrance({type: 'wipe', sound: {type: 'found', name: 'Tear'}}, 'stage b'), /enter\.sound must be false or a sound: .* \(not .*\), or a found sound: \{"type": "found", "name": "page-turn"/);
});

// A film: a red world whose kit knocks at 0.5 s, then a blue one entering with a found sound.
const storyboard = {title: 'T', scenes: [{id: 'a', narration: 'This is the first world, all in red.'}, {id: 'b', narration: 'Now the second world arrives, all in blue.'}]};
const timings = evenTimings(storyboard);
const world = (name, color, sounds = []) => ({name, story: {compile: () => ({hang: 1, spotAt: () => null, sounds, draw: c => { c.fillStyle = color; c.fillRect(0, 0, 1600, 900); }})}});
const kits = [world('red', '#ff0000', [{time: .5, type: 'found', name: 'knock', gain: .8}]), world('blue', '#0000ff')];
const recipe = (more = {}) => ({story: {kit: 'red'}, stages: [{type: 'world', scene: 'b', enter: {type: 'fade', sound: {type: 'found', name: 'tear'}}, world: {kit: 'blue'}}], ...more});
const film = (root, more) => compileFilm({storyboard, timings, kits, root, recipe: recipe(more)});

test('a film names found sounds: each checked when it is built, its record kept, an approval locking it', async t => {
  const root = filmWith({knock: {}, tear: {license: 'cc0', version: '1.0'}}, t), f = await film(root);
  assert.deepEqual(f.foundSounds.map(s => [s.name, s.record.license]), [['knock', 'by'], ['tear', 'cc0']]);
  assert.deepEqual(f.sounds.filter(s => s.type === 'found').map(s => [s.name, s.gain ?? 1]), [['knock', .8], ['tear', 1]]);
  assert.ok(f.inputs.sounds, 'the found sounds are among the film\'s inputs (an approval locks them)');
  const plain = await compileFilm({storyboard, timings, kits: [world('red', '#f00'), world('blue', '#00f')], root, recipe: {story: {kit: 'red'}, stages: [{type: 'world', scene: 'b', enter: 'fade', world: {kit: 'blue'}}]}});
  assert.equal('sounds' in plain.inputs, false, 'a film without found sounds: its inputs as before');
  // Refused when it is built, naming the fix.
  await assert.rejects(film(filmWith({knock: {}}, t)), /the found sound "tear" is not in sounds\/sounds\.json \(it has knock\): add it with npx storyreel sounds add <id> --as tear/);
  const sa = filmWith({knock: {license: 'by-sa'}, tear: {}}, t);
  await assert.rejects(film(sa), /"knock" is CC BY-SA: using it puts the whole film under CC BY-SA too/);
  assert.equal((await film(sa, {foundSounds: {allowShareAlike: true}})).foundSounds[0].record.license, 'by-sa');
  await assert.rejects(film(root, {foundSounds: {shareAlike: true}}), /recipe\.foundSounds takes \{"allowShareAlike": true\}/);
});

test('credits come from the records, made plain; a CC BY-SA sound says what it means for the film', t => {
  const root = filmWith({knock: {attribution: '"Knock" by a-maker\r\n\u001b[2J is licensed under CC BY 4.0.'}, rustle: {license: 'by-sa'}}, t), library = readLibrary(root);
  const text = creditsText({title: 'T', credits: []}, [], Object.values(library));
  assert.match(text, /\nSounds\n- "Knock" by a-maker \[2J is licensed under CC BY 4\.0\.\n- "A rustle" by a-maker, CC BY-SA 4\.0 \(https:\/\/creativecommons\.org\/licenses\/by-sa\/4\.0\/\)\n\nBecause it uses sounds under CC BY-SA, this film is shared under CC BY-SA too/);
  assert.ok(shown(text.replace(/\n/g, ' ')), 'nothing unshown reaches CREDITS.txt');
  assert.deepEqual(creditLines([]), []);
  assert.doesNotMatch(creditsText({title: 'T'}, []), /Sounds/, 'no found sounds: no Sounds section');
});

test('a render mixes found sounds from their files, offline, measured with the effects; a changed file refuses', {skip: ffmpeg ? false : 'needs ffmpeg'}, async t => {
  const root = filmWith({knock: {}, tear: {}}, t), f = await film(root), out = path.join(tempDir('found-render', t), 'film.mp4');
  const fetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('a render touched the network'); };
  try {
    const made = await renderFilm({film: f, storyboard, timings, out, width: 160, height: 90, fps: 4});
    assert.ok(Number.isFinite(made.loudness.roles.effects) && made.loudness.roles.effects > -60, `the found sounds are heard among the effects (${made.loudness.roles.effects} LUFS)`);
  } finally { globalThis.fetch = fetch; }
  writeFileSync(path.join(root, 'sounds', 'tear.wav'), WAV.subarray(0, WAV.length - 2));
  await assert.rejects(renderFilm({film: f, storyboard, timings, out, width: 160, height: 90, fps: 4}), /the found sound "tear"'s file sounds\/tear\.wav is not the one its record names .*: add it again with npx storyreel sounds add/);
});

test('makeFilm keeps each found sound\'s record in the making-of, for the release\'s credits', {skip: ffmpeg ? false : 'needs ffmpeg'}, async t => {
  const root = filmWith({knock: {}, tear: {license: 'cc0', version: '1.0'}}, t), out = path.join(tempDir('found-made', t), 'film.mp4');
  const made = await makeFilm({storyboard, recipe: recipe(), kits, root, timings, out, render: {width: 160, height: 90, fps: 4}});
  const record = JSON.parse(readFileSync(made.makingOf, 'utf8'));
  assert.deepEqual(record.foundSounds.map(r => [r.name, r.license, r.sha256]), [['knock', 'by', sha256Of(WAV)], ['tear', 'cc0', sha256Of(WAV)]]);
  assert.match(creditsText({title: 'T'}, record.tools, record.foundSounds), /Sounds\n- "A knock" by a-maker, CC BY 4\.0/);
});
