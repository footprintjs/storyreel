/**
 * Releasing a film: one interface for every place it is posted, one adapter per platform.
 *
 *   interface   makeRelease({targets, post, out, ...makeFilm options}) — the same call whatever the platform
 *   adapters    one module per platform (src/targets/*.mjs), imported only when a release names it (TARGETS):
 *               a film posted only to YouTube never loads the TikTok adapter
 *   strategies  what differs between platforms, as data inside each adapter: the video's shape (a layout,
 *               layout.mjs), its length, the text fields and their limits, the thumbnail, who the platform is for
 *               (its minimum age) and how the post's text is composed (YouTube adds the chapters)
 *
 * A release refuses BEFORE rendering what it can know then (an audience the platform does not admit, a title too
 * long, a thumbnail of the wrong shape, a part longer than the platform takes) and checks the rest after (the
 * film's own length, the text with the chapters added). Each target gets a folder: the video in the platform's
 * shape, its caption files, its thumbnail, and post.json + post.txt with the text ready to paste — and nothing
 * else, so the folder is what gets uploaded; the render's working files and its record (making-of.json) go to
 * <out>/work/<target>/, and the clean folder's files are linked from there (one copy on disk). Uploading is not
 * a release's job: a platform's upload needs the account owner's sign-in and stays a separate step.
 *
 * A platform's limits change: every adapter says when its facts were checked and where (`facts`), and a target
 * may override a limit (`{target: 'tiktok', limits: {seconds: {max: 3600}}}`) without a new release of the library.
 * An adapter of your own is an object of the same shape (checkAdapter says what is missing), passed in `targets`.
 *
 * For a big screen a target may ask for a larger picture (`{target: 'youtube', scale: 2}`: 3840×2160, every line
 * redrawn sharp, layout.mjs · formatScale) and the film's render for the finer encode (`render: {quality: 'high'}`).
 * The thumbnail may be the film's poster (`post.thumbnail: 'poster'`), drawn at the platform's thumbnail size. What
 * in the film is realistic and made with AI is declared (`post.synthetic: ['voice']` for a synthetic voice
 * narrating), and an adapter whose platform asks for it says so in the post (YouTube: altered or synthetic content).
 */
import {mkdirSync, writeFileSync, copyFileSync, readFileSync, statSync, linkSync, rmSync} from 'node:fs';
import path from 'node:path';
import {makeFilm} from './pipeline.mjs';
import {FORMAT_NAMES, formatScale} from './layout.mjs';

/** The built-in adapters, each loaded on first use. */
export const TARGETS = Object.freeze({
  youtube: () => import('./targets/youtube.mjs'),
  'youtube-shorts': () => import('./targets/youtube-shorts.mjs'),
  linkedin: () => import('./targets/linkedin.mjs'),
  tiktok: () => import('./targets/tiktok.mjs'),
  'instagram-reels': () => import('./targets/instagram-reels.mjs'),
});
export const TARGET_NAMES = Object.freeze(Object.keys(TARGETS));
/** Who a film is made for: 'kids' (directed at children) or 'general' (anyone, a teaser for parents included). */
export const AUDIENCES = Object.freeze(['kids', 'general']);
const POST_KEYS = ['title', 'description', 'tags', 'audience', 'thumbnail', 'lang', 'synthetic'];
const TARGET_KEYS = ['target', 'name', 'from', 'to', 'header', 'crop', 'captions', 'limits', 'scale'];

/** The adapter interface: what every platform adapter must say. Returns the adapter; refuses naming what is missing. */
export function checkAdapter(a) {
  const where = `release target ${JSON.stringify(a?.name ?? '?')}`;
  if (!a || typeof a !== 'object') throw new TypeError('a release target is a built-in name or an adapter object {name, label, video, limits, audience, thumbnail, facts, post}');
  for (const key of ['name', 'label']) if (!(typeof a[key] === 'string' && a[key].trim())) throw new TypeError(`${where}: ${key} must be a word`);
  if (!FORMAT_NAMES.includes(a.video?.format)) throw new TypeError(`${where}: video.format must be ${FORMAT_NAMES.join(', ')}`);
  if (!(a.limits?.seconds && a.limits.seconds.max > 0)) throw new TypeError(`${where}: limits.seconds {min?, max} is the length the platform takes`);
  for (const [field, l] of Object.entries(a.limits.text ?? {})) if (!(Number.isInteger(l.max) && l.max > 0)) throw new TypeError(`${where}: limits.text.${field}.max must be a whole number`);
  if (!(a.audience && (a.audience.kids === 'madeForKids' || a.audience.kids === 'refuse') && Number.isInteger(a.audience.minAge))) throw new TypeError(`${where}: audience {minAge, kids: 'madeForKids' | 'refuse'} says who the platform is for`);
  if (a.thumbnail !== null && !(a.thumbnail && a.thumbnail.width > 0 && a.thumbnail.height > 0)) throw new TypeError(`${where}: thumbnail is {width, height, maxBytes?} or null (the platform picks a frame)`);
  if (!(a.facts?.checked && Array.isArray(a.facts.sources))) throw new TypeError(`${where}: facts {checked: date, sources: [url]} says when its limits were checked`);
  if (typeof a.post !== 'function') throw new TypeError(`${where}: post(post, {chapters, seconds}) composes the text fields`);
  return a;
}

/** A target as given (a name, an adapter, or {target, …options}) → {adapter, options}; a built-in loads here, lazily. */
export async function loadTarget(spec) {
  const given = typeof spec === 'string' || (spec && typeof spec === 'object' && 'post' in spec && typeof spec.post === 'function') ? {target: spec} : spec;
  if (!given || typeof given !== 'object') throw new TypeError(`a release target is a name (${TARGET_NAMES.join(', ')}), an adapter, or {target, from?, to?, header?, crop?, captions?, limits?, scale?}`);
  for (const key of Object.keys(given)) if (!TARGET_KEYS.includes(key)) throw new Error(`release target has unsupported key ${key} (the keys are ${TARGET_KEYS.join(', ')})`);
  let adapter = given.target;
  if (typeof adapter === 'string') {
    if (!TARGETS[adapter]) throw new Error(`no release target called "${adapter}" (built in: ${TARGET_NAMES.join(', ')}; or pass an adapter object)`);
    adapter = (await TARGETS[adapter]()).default;
  }
  checkAdapter(adapter);
  if (given.scale !== undefined) formatScale(adapter.video.format, given.scale);   // known before a frame is drawn
  const limits = given.limits ? mergeLimits(adapter.limits, given.limits) : adapter.limits;
  return {adapter: {...adapter, limits}, options: {name: given.name ?? adapter.name, from: given.from, to: given.to, header: given.header, crop: given.crop, captions: given.captions, scale: given.scale}};
}
const mergeLimits = (base, over) => ({...base, ...over, seconds: {...base.seconds, ...over.seconds}, text: {...base.text, ...over.text}});

/**
 * The post as given, checked: {title, description, tags?, audience, thumbnail?, lang?, synthetic?}. thumbnail: an image
 * file, or 'poster' (the film's poster at the platform's size); synthetic: what is realistic and made with AI, in words.
 */
export function readPost(post) {
  if (!post || typeof post !== 'object') throw new TypeError('post is {title, description, audience, tags?, thumbnail?, lang?}');
  for (const key of Object.keys(post)) if (!POST_KEYS.includes(key)) throw new Error(`post has unsupported key ${key} (the keys are ${POST_KEYS.join(', ')})`);
  if (!(typeof post.title === 'string' && post.title.trim())) throw new TypeError('post.title is the title people see');
  if (post.thumbnail !== undefined && !(typeof post.thumbnail === 'string' && post.thumbnail.trim())) throw new TypeError("post.thumbnail is an image file, or 'poster' (the film's poster, drawn at the platform's thumbnail size)");
  if (post.synthetic !== undefined && !(Array.isArray(post.synthetic) && post.synthetic.every(w => typeof w === 'string' && w.trim()))) throw new TypeError("post.synthetic lists what in the film is realistic and made with AI, in words (['voice'] for a synthetic voice narrating): platforms that ask are told");
  if (typeof (post.description ?? '') !== 'string') throw new TypeError('post.description is text');
  if (!AUDIENCES.includes(post.audience)) throw new TypeError(`post.audience must be ${AUDIENCES.map(a => `'${a}'`).join(' or ')}: 'kids' when the film is made for children (YouTube marks it made for kids; platforms for older people refuse it), 'general' otherwise (a teaser for parents is 'general')`);
  if (post.tags !== undefined && !(Array.isArray(post.tags) && post.tags.every(t => typeof t === 'string' && t.trim()))) throw new TypeError('post.tags is a list of words');
  return {description: '', tags: [], synthetic: [], ...post};
}

/**
 * Everything a release can know before rendering, for one target: [{problem, fix}] (empty: go ahead). `seconds` is
 * the part's length when it is known (from/to given), else left for after the render; `poster` whether the film has
 * one (null: not known).
 */
export function planProblems(adapter, post, {seconds = null, poster = null} = {}) {
  const problems = [], {limits} = adapter;
  if (post.audience === 'kids' && adapter.audience.kids === 'refuse')
    problems.push({problem: `${adapter.label} is for people aged ${adapter.audience.minAge} and over, and this film is made for kids`, fix: `post the full film where children watch (YouTube, marked made for kids); here, post a teaser for parents with audience: 'general'`});
  if (post.thumbnail === 'poster' && adapter.thumbnail && poster === false)
    problems.push({problem: 'the thumbnail is to be the film\'s poster, and the film has none', fix: 'name the poster in the recipe (poster: a phrase that is said), or give post.thumbnail an image file'});
  if (seconds !== null) problems.push(...lengthProblems(adapter, seconds));
  const text = adapter.post(post, {chapters: [], seconds: seconds ?? 0});
  problems.push(...textProblems(adapter, text));
  return problems;
}
function lengthProblems(adapter, seconds) {
  const {min = 0, max} = adapter.limits.seconds;
  if (seconds > max) return [{problem: `${seconds.toFixed(1)} s is longer than ${adapter.label} takes (${max} s)`, fix: `release a part: {target: '${adapter.name}', from, to} at most ${max} s long`}];
  if (seconds < min) return [{problem: `${seconds.toFixed(1)} s is shorter than ${adapter.label} takes (${min} s)`, fix: 'release a longer part'}];
  return [];
}
function textProblems(adapter, text) {
  return Object.entries(adapter.limits.text ?? {}).flatMap(([field, {max}]) => {
    const n = [...String(text[field] ?? '')].length;
    return n > max ? [{problem: `${adapter.label}'s ${field} is ${n} characters, more than its ${max}`, fix: `shorten the ${field}`}] : [];
  });
}
const refuse = (adapter, problems) => { if (problems.length) throw new Error(`release to ${adapter.label}: ${problems.map(p => `${p.problem} (${p.fix})`).join('; ')}`); };

/** The thumbnail checked against the platform's: its size in pixels and bytes. Returns null when the platform takes none. */
async function checkThumbnail(adapter, file) {
  if (!file || !adapter.thumbnail) return null;
  const {loadImage} = await import('@napi-rs/canvas');
  const img = await loadImage(readFileSync(file)), {width, height, maxBytes} = adapter.thumbnail, bytes = statSync(file).size;
  if (Math.abs(img.width / img.height - width / height) > .01) refuse(adapter, [{problem: `the thumbnail is ${img.width}×${img.height}, not the ${width}×${height} shape`, fix: `make it ${width}×${height}`}]);
  if (maxBytes && bytes > maxBytes) refuse(adapter, [{problem: `the thumbnail is ${(bytes / 1e6).toFixed(1)} MB, over ${(maxBytes / 1e6).toFixed(1)} MB`, fix: 'save it as a smaller JPEG'}]);
  return file;
}

/** The folder (inside a release's `out`) that holds each target's working files and record, apart from what is posted. */
export const WORK = 'work';

/** A file of the render in the clean folder: linked (one copy on disk), or copied where a link cannot be made. */
function deliver(file, dir) {
  const to = path.join(dir, path.basename(file));
  rmSync(to, {force: true});
  try { linkSync(file, to); } catch { copyFileSync(file, to); }
  return to;
}

/** The thumbnail in the target's folder: the image given, or the film's poster drawn at the platform's size; null when the platform takes none. */
async function placeThumbnail(adapter, given, poster, dir) {
  if (!given || !adapter.thumbnail) return null;
  if (given !== 'poster') { const file = path.join(dir, `thumbnail${path.extname(given)}`); copyFileSync(given, file); return file; }
  if (!poster) refuse(adapter, [{problem: 'the thumbnail is to be the film\'s poster, and the render made none', fix: 'name the poster in the recipe (poster: a phrase that is said)'}]);
  const {createCanvas, loadImage} = await import('@napi-rs/canvas');
  const img = await loadImage(readFileSync(poster)), {width, height, maxBytes} = adapter.thumbnail;
  const canvas = createCanvas(width, height), ctx = canvas.getContext('2d'), s = Math.max(width / img.width, height / img.height);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (width - img.width * s) / 2, (height - img.height * s) / 2, img.width * s, img.height * s);   // filling the frame, centred
  const file = path.join(dir, 'thumbnail.jpg');
  for (const q of [92, 85, 75]) { const jpg = await canvas.encode('jpeg', q); if (!maxBytes || jpg.length <= maxBytes) { writeFileSync(file, jpg); return file; } }
  refuse(adapter, [{problem: `the poster is over ${(maxBytes / 1e6).toFixed(1)} MB even as a plainer JPEG`, fix: 'give post.thumbnail an image file'}]);
}

/** A render's chapter line ("1:05 The middle") → [seconds, name], as adapters take it. */
const chapterOf = line => { const [, stamp, name] = /^(\S+)\s+(.*)$/.exec(line); return [stamp.split(':').reduce((s, part) => s * 60 + +part, 0), name]; };

/** The text ready to paste, one field after another. */
const postText = (adapter, fields) => `${adapter.label}\n\n${Object.entries(fields).map(([k, v]) => `## ${k}\n${Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'yes' : 'no') : v}`).join('\n\n')}\n`;

/**
 * Release a film to each target: the checks a release can make first, then for each target the video in its shape
 * (makeFilm with the adapter's layout), the text, the thumbnail, all in <out>/<target name>/. `film` is everything
 * makeFilm takes except `out`; `base` names the files (default: the film's title in lower case, dashed).
 * Returns [{target, dir, video, captions, thumbnail, post, makingOf}].
 */
export async function makeRelease({targets, post, out, base = null, ...film}) {
  if (!Array.isArray(targets) || !targets.length) throw new TypeError(`targets lists where the film goes (${TARGET_NAMES.join(', ')}, or adapters)`);
  if (!(typeof out === 'string' && out)) throw new TypeError('out is the folder the release goes in (one folder per target inside it)');
  const p = readPost(post), loaded = [];
  for (const spec of targets) loaded.push(await loadTarget(spec));
  const names = loaded.map(l => l.options.name); if (new Set(names).size !== names.length) throw new Error(`two targets are called the same (${names.join(', ')}): give one a name`);
  if (names.includes(WORK)) throw new Error(`a target cannot be called "${WORK}": that folder holds the renders' working files (give the target another name)`);
  // First everything that can be known before a frame is drawn, for every target: nothing renders if any refuses.
  const poster = film.render && 'poster' in film.render ? film.render.poster != null : film.recipe?.poster != null;
  for (const {adapter, options} of loaded) {
    const part = options.from !== undefined && options.to !== undefined ? options.to - options.from : null;
    refuse(adapter, planProblems(adapter, p, {seconds: part, poster}));
    if (p.thumbnail !== 'poster') await checkThumbnail(adapter, p.thumbnail);
  }
  const stem = base ?? (String(film.storyboard?.title ?? 'film').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'film');
  const released = [];
  for (const {adapter, options} of loaded) {
    const dir = path.join(out, options.name), work = path.join(out, WORK, options.name); mkdirSync(dir, {recursive: true}); mkdirSync(work, {recursive: true});
    const layout = {format: adapter.video.format, ...(adapter.video.captions || options.captions ? {captions: options.captions ?? adapter.video.captions} : {}),
      ...(options.header ? {header: options.header} : adapter.video.header && p.title ? {header: {title: p.title}} : {}), ...(options.crop ? {crop: options.crop} : {}), ...(options.scale !== undefined ? {scale: options.scale} : {})};
    // A platform that takes an uploaded thumbnail (YouTube) shows no frame of the video as one: it starts on the film's own.
    const render = {...(adapter.thumbnail && !(film.render && 'posterFrame' in film.render) ? {posterFrame: false} : {}), ...(film.render ?? {}), layout, ...(adapter.video.captionFiles ? {captionFiles: adapter.video.captionFiles} : {}),
      ...(options.from !== undefined ? {from: options.from} : {}), ...(options.to !== undefined ? {to: options.to} : {})};
    const result = await makeFilm({...film, out: path.join(work, `${stem}.mp4`), render});
    refuse(adapter, lengthProblems(adapter, result.seconds));
    const fields = adapter.post(p, {chapters: (result.chapters ?? []).map(chapterOf), seconds: result.seconds});
    refuse(adapter, textProblems(adapter, fields));
    const video = deliver(result.out, dir), captions = result.captions ? Object.fromEntries(Object.entries(result.captions).map(([kind, file]) => [kind, deliver(file, dir)])) : null;
    const thumbnail = await placeThumbnail(adapter, p.thumbnail, result.poster, dir);
    const record = {target: adapter.name, label: adapter.label, fields, video: path.basename(video), ...(captions ? {captions: Object.values(captions).map(f => path.basename(f))} : {}),
      ...(thumbnail ? {thumbnail: path.basename(thumbnail)} : {}), seconds: +result.seconds.toFixed(2), format: adapter.video.format, audience: p.audience, ...(p.synthetic.length ? {synthetic: p.synthetic} : {}), ...(p.lang ? {lang: p.lang} : {}), facts: adapter.facts};
    writeFileSync(path.join(dir, 'post.json'), JSON.stringify(record, null, 2));
    writeFileSync(path.join(dir, 'post.txt'), postText(adapter, fields));
    released.push({target: options.name, dir, video, captions, thumbnail, post: fields, makingOf: result.makingOf, work});
  }
  return released;
}
