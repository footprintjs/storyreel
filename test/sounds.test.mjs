// Found sounds fetched (src/sounds/): the Openverse adapter, the download rules, `sounds add` and the CLI. No test here
// touches the network: Openverse is a stub fetch serving fixture JSON (test/fixtures/openverse/, the real answer's shape
// with hostile strings in it), and a sound file is a WAV StoryReel synthesizes (sound.mjs · createMotionSound).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, existsSync, readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {openverse, limitsOf} from '../src/sounds/openverse.mjs';
import {download, checkFileUrl} from '../src/sounds/download.mjs';
import {searchSounds, addSound, listSounds, candidateLine, checkSoundSource, probeAudio} from '../src/sounds/index.mjs';
import {soundsCommand} from '../src/sounds/cli.mjs';
import {readLibrary, sha256Of} from '../src/found/index.mjs';
import {createMotionSound} from '../src/sound.mjs';
import {tempDir} from './tmp.mjs';

const fixture = name => readFileSync(new URL(`./fixtures/openverse/${name}`, import.meta.url), 'utf8');
const LIMITS = {'x-ratelimit-limit-anon_burst': '20/min', 'x-ratelimit-available-anon_burst': '19', 'x-ratelimit-limit-anon_sustained': '200/day', 'x-ratelimit-available-anon_sustained': '199'};
const WAV = createMotionSound({duration: .4, events: [{type: 'door', time: 0}]}).wav;
const BY = 'ec2e245c-465b-4ba7-9ea4-620f3555b291', NC = '69390fd8-ef36-489f-8e57-a1cc40e19ccd', SA = '33333333-2222-4333-8444-555555555555';
const ffprobe = spawnSync(process.env.FFPROBE_BIN || 'ffprobe', ['-version']).status === 0;

/** A stub fetch: routes [match, answer(url, init)] in order; every call kept ({url, headers}). Unrouted: 404. */
function stubFetch(routes) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({url, headers: {...init.headers}});
    const route = routes.find(([match]) => (typeof match === 'string' ? url.startsWith(match) : match.test(url)));
    return route ? route[1](url, init) : new Response('no such thing', {status: 404});
  };
  return {fetch, calls};
}
const answer = (body, status = 200, headers = {}) => () => new Response(body, {status, headers: {'content-type': 'application/json', ...LIMITS, ...headers}});
const API = 'https://api.openverse.org/v1/audio/';
/** Openverse as the fixtures answer it: the search, three sounds by id, and their files on another host. */
const openverseStub = (more = []) => stubFetch([...more,
  [`${API}?`, answer(fixture('search.json'))], [`${API}${BY}/`, answer(fixture('detail-by.json'))], [`${API}${NC}/`, answer(fixture('detail-nc.json'))],
  [`${API}${SA}/`, answer(fixture('detail-sa.json'))], [/^https:\/\/cdn\.example\.org\//, () => new Response(WAV, {headers: {'content-length': String(WAV.length)}})]]);

test('search: one compact line a sound, every word made plain, only the licences a film may use, the limits said', async () => {
  const {fetch, calls} = openverseStub(), source = openverse({fetch, token: null}), found = await searchSounds(source, 'page turn');
  // The NC result, the mature one and the one whose id is not an id are left out, whatever the server sent.
  assert.deepEqual(found.map(c => c.id), [BY, 'ae81dc37-a10f-46f3-8619-9af22a898885']);
  const asked = new URL(calls[0].url);
  assert.deepEqual([asked.searchParams.get('q'), asked.searchParams.get('license'), asked.searchParams.get('page_size'), asked.searchParams.get('mature')], ['page turn', 'cc0,by', '5', 'false']);
  assert.equal(candidateLine(found[0]), `${BY} · Page Turn - paper_turn_over.wav · CC BY 4.0 · 0.95 s · freesound`);
  const hostile = candidateLine(found[1]);
  assert.ok(!/[\u0000-\u001f\u007f-\u009f‪-‮]/.test(hostile) && !hostile.includes('\n'), `no control or bidi character reaches the terminal: ${JSON.stringify(hostile)}`);
  assert.match(hostile, /Page Turn \[31m RED evil second line · CC0 1\.0 · 1\.98 s/);
  assert.ok(found[1].attribution.length <= 400 && !/[\r\n]/.test(found[1].attribution), 'the attribution is one line, capped');
  assert.equal(source.limits, '19 of 20/min and 199 of 200/day left');
  assert.ok(!('authorization' in calls[0].headers), 'no key: none sent');
  await searchSounds(source, 'paper', {allowShareAlike: true});
  assert.equal(new URL(calls[1].url).searchParams.get('license'), 'cc0,by,by-sa', 'CC BY-SA only when the film opts in');
  await assert.rejects(searchSounds(source, 'a\nb'), /a few words, 1–200 characters on one line/);
  await assert.rejects(searchSounds(source, 'page', {limit: 50}), /--limit is a whole number 1–20/);
  assert.deepEqual(limitsOf(new Headers({'x-ratelimit-available-key_burst': '3', 'x-ratelimit-limit-key_burst': '60/min'})), {burst: {available: '3', limit: '60/min'}});
});

test('a 429 stops with when to try again, and is never retried; other failures say what to do', async () => {
  const busy = stubFetch([[API, answer('{}', 429, {'retry-after': '42', 'x-ratelimit-available-anon_burst': '0'})]]);
  await assert.rejects(searchSounds(openverse({fetch: busy.fetch, token: null}), 'page'), /Openverse says too many requests \(0 of 20\/min and 199 of 200\/day left\): try again in 42 s — StoryReel does not retry on its own/);
  assert.equal(busy.calls.length, 1, 'one request, no loop');
  const spent = stubFetch([[API, answer('{}', 429, {'x-ratelimit-available-anon_sustained': '0'})]]);
  await assert.rejects(searchSounds(openverse({fetch: spent.fetch, token: null}), 'page'), /try again tomorrow/);
  const down = stubFetch([[API, answer('oops', 503)]]);
  await assert.rejects(searchSounds(openverse({fetch: down.fetch, token: null}), 'page'), /Openverse answered the search with 503: try again later/);
  const garbled = stubFetch([[API, answer('<html>')]]);
  await assert.rejects(searchSounds(openverse({fetch: garbled.fetch, token: null}), 'page'), /not JSON/);
});

test('an id is checked before it is asked for; the key goes to Openverse only, never to a file host or a message', async () => {
  const {fetch, calls} = openverseStub([[`${API}${NC}/`, answer('{}', 500)]]), source = openverse({fetch, token: 'sekret-token-123'});
  await assert.rejects(source.candidate('../../admin?x=1'), /an Openverse id is like ec2e245c-/);
  assert.equal(calls.length, 0, 'nothing asked for a malformed id');
  const film = tempDir('found-key');
  if (ffprobe) await addSound({source, id: BY, as: 'page-turn', film});
  else await source.fetch(await source.candidate(BY), {into: film});
  const api = calls.filter(c => c.url.startsWith(API)), files = calls.filter(c => !c.url.startsWith(API));
  assert.ok(api.length && api.every(c => c.headers.authorization === 'Bearer sekret-token-123'), 'the API is asked with the key');
  assert.ok(files.length && files.every(c => !('authorization' in c.headers)), 'the file host never sees it');
  const failure = await source.candidate(NC).then(() => null, e => e.message);
  assert.match(failure, /answered the sound .* with 500/); assert.ok(!failure.includes('sekret'), 'no message carries the key');
});

test('download: https only, every redirect checked, no address on this machine, a byte cap and a timeout', async () => {
  for (const [href, re] of [['http://cdn.example.org/a.wav', /only over https/], ['file:///etc/passwd', /only over https/], ['https://user:pw@cdn.example.org/a.wav', /user name or password/],
    ['https://localhost/a.wav', /on this machine or its network/], ['https://127.0.0.1/a.wav', /on this machine/], ['https://[::1]/a.wav', /on this machine/], ['https://10.1.2.3/a.wav', /on this machine/],
    ['https://169.254.169.254/latest', /on this machine/], ['https://192.168.0.9/a', /on this machine/], ['https://[::ffff:127.0.0.1]/a', /on this machine/], ['not a url', /not a URL/],
    ['https://localhost./a', /on this machine/], ['https://foo.localhost./a', /on this machine/], ['https://[::7f00:1]/a', /on this machine/], ['https://[64:ff9b::7f00:1]/a', /on this machine/],
    ['https://[fec0::1]/a', /on this machine/], ['https://100.64.0.1/a', /on this machine/], ['https://localhost../a', /on this machine/]]) {
    assert.throws(() => checkFileUrl(href), re, href);
  }
  assert.equal(checkFileUrl('https://cdn.example.org/a.wav').hostname, 'cdn.example.org');
  const redirect = to => () => new Response(null, {status: 302, headers: {location: to}});
  await assert.rejects(download('https://a.example/x', {fetch: stubFetch([['https://a.example/', redirect('http://b.example/x')]]).fetch}), /a redirect of the sound file is at http:\/\/ — StoryReel fetches only over https/);
  await assert.rejects(download('https://a.example/x', {fetch: stubFetch([['https://a.example/', redirect('https://192.168.1.1/x')]]).fetch}), /a redirect of the sound file is at 192\.168\.1\.1/);
  await assert.rejects(download('https://a.example/x', {fetch: stubFetch([['https://a.example/', redirect('https://a.example/y')]]).fetch}), /redirects more than 3 times/);
  const followed = await download('https://a.example/x', {fetch: stubFetch([['https://a.example/x', redirect('/y')], ['https://a.example/y', () => new Response(WAV)]]).fetch});
  assert.deepEqual([followed.bytes.equals(WAV), followed.url], [true, 'https://a.example/y']);
  let pulls = 0;
  const huge = () => new Response(new ReadableStream({pull(c) { pulls++; c.enqueue(new Uint8Array(1024)); }}), {headers: {'content-length': String(30 * 1024 * 1024)}});
  await assert.rejects(download('https://a.example/x', {fetch: stubFetch([['https://a.example/', huge]]).fetch}), /the sound file is 30\.0 MB, over the 20 MB it may be: pick a shorter sound/);
  assert.ok(pulls <= 1, 'refused from its Content-Length, before the body is read');
  const endless = () => new Response(new ReadableStream({pull(c) { c.enqueue(new Uint8Array(4096)); }}));   // no Content-Length, no end
  await assert.rejects(download('https://a.example/x', {maxBytes: 300000, fetch: stubFetch([['https://a.example/', endless]]).fetch}), /the sound file is more than 0\.3 MB, over the 0\.3 MB it may be: pick a shorter sound/);
  // A host that never answers. AbortSignal.timeout's timer does not hold the event loop open (a real request's socket
  // does), so the stub holds it open itself until the download gives up.
  const never = async (url, {signal}) => new Promise((_, reject) => { const hold = setInterval(() => {}, 1000); signal.addEventListener('abort', () => { clearInterval(hold); reject(signal.reason); }); });
  await assert.rejects(download('https://a.example/x', {timeoutMs: 50, fetch: never}), /did not arrive within 0\.05 s: try again later/);
  await assert.rejects(download('https://a.example/x', {fetch: stubFetch([['https://a.example/', () => new Response(new Uint8Array(0))]]).fetch}), /came back empty/);
  // The API's answer is capped the same way: a page of results is small, an endless one refused.
  const flood = stubFetch([[API, () => new Response(new ReadableStream({pull(c) { c.enqueue(new Uint8Array(65536)); }}), {headers: LIMITS})]]);
  await assert.rejects(searchSounds(openverse({fetch: flood.fetch, token: null}), 'page'), /Openverse's answer to the search is more than 2 MB, over the 2 MB it may be: try again with fewer results/);
});

test('sounds add: the licence before a byte, the file probed and hashed, kept as <name>.<ext>, recorded once', {skip: ffprobe ? false : 'no ffprobe'}, async () => {
  const film = tempDir('found-add'), {fetch, calls} = openverseStub(), source = openverse({fetch, token: null}), fileCalls = () => calls.filter(c => !c.url.startsWith(API)).length;
  const added = await addSound({source, id: BY, as: 'page-turn', film});
  assert.equal(added.fetched, true); assert.equal(path.basename(added.file), 'page-turn.wav', 'named <name>.<ext>, never by the server');
  const record = readLibrary(film)['page-turn'];
  assert.deepEqual({...record, seconds: Math.round(record.seconds * 10) / 10}, {name: 'page-turn', file: 'page-turn.wav', from: 'openverse', id: BY, title: 'Page Turn - paper_turn_over.wav', creator: 'a-maker',
    license: 'by', licenseVersion: '4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: '"Page Turn - paper_turn_over.wav" by a-maker is licensed under CC BY 4.0. To view a copy of this license, visit https://creativecommons.org/licenses/by/4.0/.',
    source: 'freesound', url: `https://cdn.example.org/previews/ec2e245c.wav`, landing: 'https://sounds.example.org/sounds/ec2e245c', seconds: .4, sha256: sha256Of(WAV), bytes: WAV.length});
  assert.deepEqual(readdirSync(path.join(film, 'sounds')).sort(), ['page-turn.wav', 'sounds.json'], 'nothing else left in sounds/ (the scratch folder is gone)');
  // Once: the same sound again fetches nothing; a changed file is fetched again.
  assert.equal((await addSound({source, id: BY, as: 'page-turn', film})).fetched, false); assert.equal(fileCalls(), 1);
  writeFileSync(path.join(film, 'sounds', 'page-turn.wav'), 'tampered');
  assert.equal((await addSound({source, id: BY, as: 'page-turn', film})).fetched, true); assert.equal(fileCalls(), 2);
  await assert.rejects(addSound({source, id: SA, as: 'page-turn', film}), /already has "page-turn" \(openverse ec2e245c-.*\): give this one another --as/);
  // The gate, before a byte: NC never fetched; BY-SA only with the opt-in, saying what it costs.
  await assert.rejects(addSound({source, id: NC, as: 'book', film}), /openverse sound 69390fd8-.* is CC BY-NC, which a film cannot use: NC allows no commercial use/);
  await assert.rejects(addSound({source, id: SA, as: 'rustle', film}), /is CC BY-SA: using it puts the whole film under CC BY-SA too — to accept that/);
  assert.equal(fileCalls(), 2, 'no file fetched for a refused licence');
  assert.equal((await addSound({source, id: SA, as: 'rustle', film, allowShareAlike: true})).record.license, 'by-sa');
  // A record never names a path: an edited sounds.json that points a sound's file outside sounds/ cannot make a repair
  // delete it (the record keeps only <name>.<ext>).
  const victim = path.join(film, 'victim.txt'), library = path.join(film, 'sounds', 'sounds.json');
  writeFileSync(victim, 'keep me');
  const data = JSON.parse(readFileSync(library, 'utf8')); data.sounds['page-turn'].file = '../victim.txt'; writeFileSync(library, JSON.stringify(data));
  assert.equal(readLibrary(film)['page-turn'].file, null);
  assert.equal((await addSound({source, id: BY, as: 'page-turn', film})).fetched, true, 'the broken record is repaired by fetching again');
  assert.equal(readFileSync(victim, 'utf8'), 'keep me', 'and nothing outside sounds/ was touched');
  // A sound kept under a licence the film has not opted into is refused as such, without asking the source again.
  const asked = calls.length;
  await assert.rejects(addSound({source, id: SA, as: 'rustle', film}), /the found sound "rustle" is CC BY-SA: using it puts the whole film under CC BY-SA too/);
  assert.equal(calls.length, asked, 'no request for a refusal the record already answers');
  await assert.rejects(addSound({source, id: BY, as: 'x', film: path.join(film, 'no-such-folder')}), /the film's folder .*no-such-folder is not a folder: give --film the folder the film is in/);
  // A name is a slug: no way out of sounds/.
  for (const as of ['../evil', 'Page', 'a/b', '', 'x'.repeat(41)]) await assert.rejects(addSound({source, id: BY, as, film}), /a found sound's name is lower case/, as);
  assert.ok(!existsSync(path.join(film, 'evil.wav')) && !existsSync(path.join(path.dirname(film), 'evil.wav')));
});

test('sounds add refuses a file that is not a sound, and a source that writes outside its folder, leaving nothing behind', {skip: ffprobe ? false : 'no ffprobe'}, async () => {
  const film = tempDir('found-bad'), candidate = {id: 'x1', title: 'Fake', creator: 'z', license: 'cc0', licenseVersion: '1.0', seconds: 1, source: 's', attribution: '', url: 'https://cdn.example.org/x', landing: null, bytes: null};
  const textSource = {name: 'stub', search: async () => [], candidate: async () => candidate, fetch: async (c, {into}) => { const f = path.join(into, 'download'); writeFileSync(f, '<html>not audio</html>'); return {file: f, bytes: 22, record: {}}; }};
  await assert.rejects(addSound({source: textSource, id: 'x1', as: 'fake', film}), /the fetched file is not a sound|is html|not one of mp3, wav, ogg, flac/);
  assert.deepEqual(readdirSync(path.join(film, 'sounds')), [], 'no file, no record, no scratch folder');
  const outside = tempDir('found-outside');
  const sneaky = {...textSource, fetch: async () => { const f = path.join(outside, 'download'); writeFileSync(f, WAV); return {file: f, bytes: WAV.length, record: {}}; }};
  await assert.rejects(addSound({source: sneaky, id: 'x1', as: 'fake', film}), /wrote its file outside the folder it was given/);
  assert.throws(() => checkSoundSource({name: 'x', search() {}}), /this one has no candidate, fetch/);
  assert.throws(() => probeAudio(path.join(film, 'nothing.wav')), /not a sound/);
});

const ffmpegBin = process.env.FFMPEG_BIN || 'ffmpeg', encoders = spawnSync(ffmpegBin, ['-hide_banner', '-encoders'], {encoding: 'utf8'}).stdout ?? '';
test('ffprobe names the file\'s kind (the kept extension), whatever the server called it: wav, mp3, flac; a video or a playlist refuses', {skip: ffprobe ? false : 'no ffprobe'}, async t => {
  const dir = tempDir('found-probe', t), wav = path.join(dir, 'a'), encode = (args, out) => assert.equal(spawnSync(ffmpegBin, ['-v', 'error', '-y', ...args, out]).status, 0);
  writeFileSync(wav, WAV);
  assert.equal(probeAudio(wav).ext, 'wav');
  for (const [encoder, ext] of [['libmp3lame', 'mp3'], ['flac', 'flac']]) {
    await t.test(ext, {skip: encoders.includes(encoder) ? false : `no ${encoder} encoder`}, () => {
      const out = path.join(dir, `b-${ext}.bin`);   // a name that says nothing: the kind comes from the bytes
      encode(['-i', wav, '-c:a', encoder, '-f', ext], out);
      assert.equal(probeAudio(out).ext, ext);
    });
  }
  await t.test('a video', {skip: encoders.includes('mpeg4') || encoders.includes('libx264') ? false : 'no video encoder'}, () => {
    const video = path.join(dir, 'v.bin');
    encode(['-f', 'lavfi', '-i', 'color=c=red:s=32x32:d=0.5', '-f', 'mp4'], video);
    assert.throws(() => probeAudio(video), /not a sound|not one of mp3, wav, ogg, flac/);
  });
  // A playlist names other files (a download could name anything, over the network too). ffprobe reads one fine without
  // the whitelist ("the fetched file is hls, not one of …"); with it (AUDIO_ONLY) the format is refused outright. The
  // segment here is local, so nothing goes over the network either way.
  await t.test('a playlist', {skip: encoders.includes(' aac ') ? false : 'no aac encoder'}, () => {
    encode(['-i', wav, '-c:a', 'aac', '-f', 'mpegts'], path.join(dir, 'seg.ts'));
    const playlist = path.join(dir, 'q.m3u8');
    writeFileSync(playlist, '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n#EXTINF:0.4,\nseg.ts\n#EXT-X-ENDLIST\n');
    assert.throws(() => probeAudio(playlist), /the fetched file is not a sound \(ffprobe finds no audio, or a picture\)/);
  });
});

test('the CLI: compact lines, exit 0 done, 1 refused, 2 not understood; list reads offline and names the fix', {skip: ffprobe ? false : 'no ffprobe'}, async () => {
  const film = tempDir('found-cli'), {fetch} = openverseStub(), source = openverse({fetch, token: null});
  const run = async args => { const lines = []; const code = await soundsCommand(args, {source, out: l => lines.push(l), err: l => lines.push(l)}); return {code, text: lines.join('\n')}; };
  const search = await run(['search', 'page turn']);
  assert.equal(search.code, 0); assert.equal(search.text.split('\n').length, 3, 'two sounds and the limits line');
  assert.match(search.text, /^ec2e245c-.* · CC BY 4\.0 · 0\.95 s · freesound\n.*\nopenverse: 19 of 20\/min and 199 of 200\/day left$/);
  const add = await run(['add', BY, '--as', 'page-turn', '--film', film]);
  assert.deepEqual([add.code, add.text], [0, 'page-turn: sounds/page-turn.wav · CC BY 4.0 · 0.40 s · "Page Turn - paper_turn_over.wav" by a-maker']);
  assert.deepEqual(await run(['list', '--film', film]), {code: 0, text: 'page-turn · CC BY 4.0 · 0.40 s · ok'});
  writeFileSync(path.join(film, 'sounds', 'page-turn.wav'), 'swapped');
  const listed = await run(['list', '--film', film]);
  assert.equal(listed.code, 1); assert.match(listed.text, /^page-turn · CC BY 4\.0 · 0\.40 s · file sounds\/page-turn\.wav is not the one its record names .*: add it again with npx storyreel sounds add ec2e245c-465b-4ba7-9ea4-620f3555b291 --as page-turn$/);
  assert.equal((await run(['add', NC, '--as', 'book', '--film', film])).code, 1);
  for (const args of [['fetch'], ['add', BY], ['search'], ['search', 'a', '--film', 'x'], ['list', 'extra'], ['search', 'a', '--limit', 'many']]) assert.equal((await run(args)).code, 2, args.join(' '));
  assert.equal(listSounds(tempDir('found-none')).length, 0);
  // `storyreel help sounds` and `storyreel sounds --help` say the same usage.
  const cli = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src', 'cli.mjs');
  for (const args of [['help', 'sounds'], ['sounds', '--help']]) {
    const r = spawnSync(process.execPath, [cli, ...args], {encoding: 'utf8'});
    assert.equal(r.status, 0, args.join(' ')); assert.match(r.stdout, /sounds {3}search "<words>" \| add <id> --as <name> \| list/);
  }
});
