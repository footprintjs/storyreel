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
 * else (and CREDITS.txt: what the film was made with), so the folder is what gets uploaded; the render's working files and its record (making-of.json) go to
 * <out>/work/<target>/, and the clean folder's files are linked from there (one copy on disk). Uploading is not
 * a release's job: a platform's upload needs the account owner's sign-in and stays a separate step.
 *
 * A platform's limits change: every adapter says when its facts were checked and where (`facts`), and a target
 * may override a limit (`{target: 'tiktok', limits: {seconds: {max: 3600}}}`) without a new release of the library;
 * the limits as overridden are checked as an adapter's are, and a key given as undefined is not given (the
 * platform's value stays). An adapter of your own is an object of the same shape (checkAdapter says what is
 * missing), passed in `targets`. A platform that takes a video only up to some size says so (`limits.frame`: the
 * largest frames, one per orientation), and a render larger than that is refused before it starts.
 *
 * For a big screen a target may ask for a larger picture (`{target: 'youtube', scale: 2}`: 3840×2160, every line
 * redrawn sharp, layout.mjs · formatScale) and the film's render for the finer encode (`render: {quality: 'high'}`).
 * The thumbnail may be the film's poster (`post.thumbnail: 'poster'`), drawn at the platform's thumbnail size. What
 * in the film is realistic and made with AI is declared (`post.synthetic: ['voice']` for a synthetic voice
 * narrating), and an adapter whose platform asks for it says so in the post (YouTube: altered or synthetic content).
 *
 * A Short cut from an episode: `cuts` (stretches of the film joined in order, each with where its crop looks:
 * `follow`), `join` (each join's cut point, overlap and pop), `end` (a card after them), `fill` (the picture fills the
 * tall frame between the title band and below the captions) — an edit (edit.mjs), rendered as one video. A target's
 * own `render` settings (posterFrame, quality) go over the film's: `render: {posterFrame: false}` starts a target on
 * the film's own frame; an edit's joins never show the poster.
 */
import {readChapters} from 'footprint-narration';
import {readFileSync, statSync} from 'node:fs';
import {writeOutput, outputFolder, refuseFolders, securePath} from './files.mjs';
import {readCaptionFiles} from './render.mjs';
import path from 'node:path';
import {makeFilm} from './pipeline.mjs';
import {FORMAT_NAMES, formatOf, formatScale} from './layout.mjs';
import {checkEdit} from './edit.mjs';
import {QUALITIES} from './paint.mjs';
import {creditLines} from './found/index.mjs';

/** The built-in adapters, each loaded on first use. */
export const TARGETS = Object.freeze({
  youtube: () => import('./targets/youtube.mjs'),
  'youtube-shorts': () => import('./targets/youtube-shorts.mjs'),
  linkedin: () => import('./targets/linkedin.mjs'),
  tiktok: () => import('./targets/tiktok.mjs'),
  'instagram-reels': () => import('./targets/instagram-reels.mjs'),
  x: () => import('./targets/x.mjs'),
});
export const TARGET_NAMES = Object.freeze(Object.keys(TARGETS));
/** Who a film is made for: 'kids' (directed at children) or 'general' (anyone, a teaser for parents included). */
export const AUDIENCES = Object.freeze(['kids', 'general']);
const POST_KEYS = ['title', 'description', 'tags', 'audience', 'thumbnail', 'lang', 'synthetic', 'credits'];
const TARGET_KEYS = ['target', 'name', 'from', 'to', 'header', 'crop', 'captions', 'limits', 'scale', 'cuts', 'join', 'end', 'fill', 'keep', 'render'];
/** The render settings a target may give for itself, over the film's (makeRelease's render). */
const TARGET_RENDER_KEYS = ['posterFrame', 'quality'];

/** The adapter interface: what every platform adapter must say. Returns the adapter; refuses naming what is missing. */
export function checkAdapter(a) {
  const where = `release target ${JSON.stringify(a?.name ?? '?')}`;
  if (!a || typeof a !== 'object') throw new TypeError('a release target is a built-in name or an adapter object {name, label, video, limits, audience, thumbnail, facts, post}');
  for (const key of ['name', 'label']) if (!(typeof a[key] === 'string' && a[key].trim())) throw new TypeError(`${where}: ${key} must be a word`);
  if (!FORMAT_NAMES.includes(a.video?.format)) throw new TypeError(`${where}: video.format must be ${FORMAT_NAMES.join(', ')}`);
  if (!(a.limits?.seconds && a.limits.seconds.max > 0)) throw new TypeError(`${where}: limits.seconds {min?, max} is the length the platform takes`);
  for (const [field, l] of Object.entries(a.limits.text ?? {})) {
    if (!(Number.isInteger(l.max) && l.max > 0)) throw new TypeError(`${where}: limits.text.${field}.max must be a whole number`);
    if (l.count !== undefined && typeof l.count !== 'function') throw new TypeError(`${where}: limits.text.${field}.count, when given, is how the platform counts a text (text → number)`);
  }
  const whole = n => Number.isInteger(n) && n > 0, frame = a.limits.frame;
  if (frame !== undefined && !(Array.isArray(frame) && frame.length && frame.every(f => whole(f?.width) && whole(f?.height)))) throw new TypeError(`${where}: limits.frame, when given, lists the largest frames the platform takes ([{width, height}], one per orientation)`);
  if (!(a.audience && (a.audience.kids === 'madeForKids' || a.audience.kids === 'refuse') && Number.isInteger(a.audience.minAge))) throw new TypeError(`${where}: audience {minAge, kids: 'madeForKids' | 'refuse'} says who the platform is for`);
  if (a.thumbnail !== null && !(a.thumbnail && a.thumbnail.width > 0 && a.thumbnail.height > 0)) throw new TypeError(`${where}: thumbnail is {width, height, maxBytes?} or null (the platform picks a frame)`);
  if (!(a.facts?.checked && Array.isArray(a.facts.sources))) throw new TypeError(`${where}: facts {checked: date, sources: [url]} says when its limits were checked`);
  if (typeof a.post !== 'function') throw new TypeError(`${where}: post(post, {chapters, seconds, limits}) composes the text fields`);
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
  if (given.limits) checkAdapter({...adapter, limits});   // the limits as overridden answer to the same interface
  const where = `release target ${JSON.stringify(given.name ?? adapter.name)}`;
  return {adapter: {...adapter, limits}, options: {name: given.name ?? adapter.name, from: given.from, to: given.to, header: given.header, crop: given.crop, captions: given.captions, scale: given.scale,
    ...readEditOptions(given, adapter, where)}};
}

/**
 * A target's edit (cuts, join, end) and its own settings (fill, keep, render), checked before anything renders:
 * {edit?, fill?, keep?, render?}. A target with an end card and no cuts shows its from/to (or the whole film) as one cut.
 */
function readEditOptions(given, adapter, where) {
  const out = {};
  if (given.render !== undefined) {
    const r = given.render;
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error(`${where}: render is the target's own render settings {${TARGET_RENDER_KEYS.join(', ')}}`);
    for (const key of Object.keys(r)) if (!TARGET_RENDER_KEYS.includes(key)) throw new Error(`${where}: render has unsupported key ${key} (a target's own render settings are ${TARGET_RENDER_KEYS.join(', ')}; the rest are the film's: makeRelease's render)`);
    if (r.posterFrame !== undefined && typeof r.posterFrame !== 'boolean') throw new Error(`${where}: render.posterFrame is true (the poster replaces the first frame) or false (the video starts on the film's own frame)`);
    if (r.quality !== undefined && !QUALITIES.includes(r.quality)) throw new Error(`${where}: render.quality must be ${QUALITIES.map(q => `'${q}'`).join(' or ')}`);
    out.render = r;
  }
  if (given.fill !== undefined) {
    if (given.fill !== true && given.fill !== false) throw new Error(`${where}: fill is true (the picture fills the frame from under the title band to below the captions) or left out`);
    if (given.fill && !formatOf(adapter.video.format).fill) throw new Error(`${where}: fill: the ${adapter.video.format} format has no filled picture; leave fill out, or use a vertical target (YouTube Shorts, TikTok, Instagram Reels)`);
    if (given.fill) out.fill = true;
  }
  if (given.keep !== undefined) {
    // Its names are checked with the layout (layout.mjs); a format with no crop, now: nothing there is cut at its edge.
    if (!formatOf(adapter.video.format).crop) throw new Error(`${where}: keep: the ${adapter.video.format} format shows the whole frame, so nothing is cut at its edge; leave keep out, or use a portrait or vertical target`);
    out.keep = given.keep;
  }
  if (given.cuts === undefined && given.end === undefined) {
    if (given.join !== undefined) throw new Error(`${where}: join says how cuts are joined; give cuts (or an end card), or leave join out`);
    return out;
  }
  if (given.cuts !== undefined && (given.from !== undefined || given.to !== undefined)) throw new Error(`${where}: a target takes cuts or from/to, not both (each cut has its own from and to)`);
  if (given.cuts !== undefined && given.crop !== undefined) throw new Error(`${where}: with cuts, each cut says where its crop looks (follow): leave the target's crop out`);
  const cuts = given.cuts ?? [{from: given.from ?? 0, to: given.to ?? null, ...(given.crop !== undefined ? {follow: given.crop} : {})}];
  const edit = {cuts, ...(given.end !== undefined ? {end: given.end} : {}), ...(given.join !== undefined ? {join: given.join} : {})};
  // Its shape refuses now (edit.mjs · checkEdit); a cut left to run to the film's end (to: null) is placed at the render.
  checkEdit({...edit, cuts: Array.isArray(cuts) ? cuts.map(c => (c && c.to === null ? {...c, to: 0} : c)) : cuts});
  out.edit = edit;
  return out;
}
// A key given as undefined is not given: the platform's value stays ({count: undefined} keeps how X counts).
const given = o => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined));
const mergeLimits = (base, over) => ({...base, ...given(over), seconds: {...base.seconds, ...given(over.seconds)},
  text: Object.fromEntries([...new Set([...Object.keys(base.text ?? {}), ...Object.keys(over.text ?? {})])].map(f => [f, {...base.text?.[f], ...given(over.text?.[f])}]))});   // a field keeps how it is counted

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
  if (post.credits !== undefined && !(Array.isArray(post.credits) && post.credits.every(c => typeof c === 'string' && c.trim()))) throw new TypeError("post.credits lists what the film uses that the maker brought, one line each (e.g. 'Icons: Simple Icons, CC0'): they go into CREDITS.txt");
  return {description: '', tags: [], synthetic: [], credits: [], ...post};
}

/**
 * Everything a release can know before rendering, for one target: [{problem, fix}] (empty: go ahead). `seconds` is
 * the part's length when it is known (from/to given), else left for after the render; `poster` whether the film has
 * one (null: not known); `scale` the target's (the render's size, checked against the platform's largest frame).
 */
export function planProblems(adapter, post, {seconds = null, poster = null, scale} = {}) {
  const problems = [];
  if (post.audience === 'kids' && adapter.audience.kids === 'refuse')
    problems.push({problem: `${adapter.label} is for people aged ${adapter.audience.minAge} and over, and this film is made for kids`, fix: `post the full film where children watch (YouTube, marked made for kids); here, post a teaser for parents with audience: 'general'`});
  if (post.thumbnail === 'poster' && adapter.thumbnail && poster === false)
    problems.push({problem: 'the thumbnail is to be the film\'s poster, and the film has none', fix: 'name the poster in the recipe (poster: a phrase that is said), or give post.thumbnail an image file'});
  if (seconds !== null) problems.push(...lengthProblems(adapter, seconds));
  problems.push(...frameProblems(adapter, scale));
  const text = adapter.post(post, {chapters: [], seconds: seconds ?? 0, limits: adapter.limits});
  problems.push(...textProblems(adapter, text));
  return problems;
}
/** A render larger than every frame the platform takes (limits.frame), refused with the scale that fits. */
function frameProblems(adapter, scale) {
  const frames = adapter.limits.frame; if (!frames) return [];
  const {width: w, height: h} = formatOf(adapter.video.format), k = formatScale(adapter.video.format, scale), width = w * k, height = h * k;
  if (frames.some(f => width <= f.width && height <= f.height)) return [];
  const most = Math.max(...frames.map(f => Math.min(f.width / w, f.height / h)));   // the largest scale that fits one of them
  return [{problem: `${width}×${height} is larger than ${adapter.label} takes, at most ${frames.map(f => `${f.width}×${f.height}`).join(' or ')}`,
    fix: most >= 1 ? `release it at scale 1: {target: '${adapter.name}'} makes ${w}×${h}` : `release it at a scale of at most ${Math.floor(most * 100) / 100}`}];
}
function lengthProblems(adapter, seconds) {
  const {min = 0, max} = adapter.limits.seconds;
  if (seconds > max) return [{problem: `${seconds.toFixed(1)} s is longer than ${adapter.label} takes (${max} s)`, fix: `release a part: {target: '${adapter.name}', from, to} at most ${max} s long`}];
  if (seconds < min) return [{problem: `${seconds.toFixed(1)} s is shorter than ${adapter.label} takes (${min} s)`, fix: 'release a longer part'}];
  return [];
}
function textProblems(adapter, text) {
  return Object.entries(adapter.limits.text ?? {}).flatMap(([field, {max, count = s => [...s].length}]) => {
    const n = count(String(text[field] ?? ''));   // as the platform counts (X: links 23, emoji 2), else code points
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

/**
 * What the film was made with, for the post (CREDITS.txt): StoryReel and every tool its record lists (name, version,
 * licence, what for), the found sounds it plays (their attribution lines, as their record keeps them, made plain:
 * found/credits.mjs · creditLines — never typed by hand), then what the maker brought (post.credits), and the synthetic voice
 * when the post declares one.
 */
export function creditsText(post, tools, sounds = []) {
  const own = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const line = t => `- ${t.name}${t.version ? ` ${t.version}` : ''} (${t.license})${t.detail ? ` — ${t.detail}` : ''}`;
  return [`Credits — ${post.title}`, '', 'Made with', line({name: own.name, version: own.version, license: own.license, detail: 'the film, drawn in code'}), ...tools.map(line),
    ...(sounds.length ? ['', 'Sounds', ...creditLines(sounds)] : []),
    ...(post.credits?.length ? ['', 'From the maker', ...post.credits.map(c => `- ${c}`)] : []),
    ...(post.synthetic?.includes('voice') ? ['', 'The narration is a synthetic voice.'] : []), ''].join('\n');
}

/** An edit's length when every cut is given in seconds (the overlaps aside), else null: known only once the film is compiled. */
function editSeconds({cuts, end}) {
  if (!cuts.every(c => typeof c.from === 'number' && typeof c.to === 'number')) return null;
  return cuts.reduce((n, c) => n + c.to - c.from, 0) + (end?.seconds ?? 0);
}
/** A cut with no `to` (an end card on a whole film or from a second) runs to the film's end: its last scene's. */
const endOfFilm = (edit, storyboard) => ({...edit, cuts: edit.cuts.map(c => (c.to === null ? {...c, to: {scene: storyboard.scenes.at(-1).id}} : c))});

/** The folder (inside a release's `out`) that holds each target's working files and record, apart from what is posted. */
export const WORK = 'work';

/** A file of the render in the clean folder: linked (one copy on disk), or copied where a link cannot be made (files.mjs · writeOutput). */
const deliver = (file, dir) => writeOutput(path.join(dir, path.basename(file)), {copy: file, link: true});

/** The thumbnail in the target's folder: the image given, or the film's poster drawn at the platform's size; null when the platform takes none. */
async function placeThumbnail(adapter, given, poster, dir) {
  if (!given || !adapter.thumbnail) return null;
  if (given !== 'poster') return writeOutput(path.join(dir, `thumbnail${path.extname(given)}`), {copy: given});
  if (!poster) refuse(adapter, [{problem: 'the thumbnail is to be the film\'s poster, and the render made none', fix: 'name the poster in the recipe (poster: a phrase that is said)'}]);
  const {createCanvas, loadImage} = await import('@napi-rs/canvas');
  const img = await loadImage(readFileSync(poster)), {width, height, maxBytes} = adapter.thumbnail;
  const canvas = createCanvas(width, height), ctx = canvas.getContext('2d'), s = Math.max(width / img.width, height / img.height);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (width - img.width * s) / 2, (height - img.height * s) / 2, img.width * s, img.height * s);   // filling the frame, centred
  const file = path.join(dir, 'thumbnail.jpg');
  for (const q of [92, 85, 75]) { const jpg = await canvas.encode('jpeg', q); if (!maxBytes || jpg.length <= maxBytes) return writeOutput(file, jpg); }
  refuse(adapter, [{problem: `the poster is over ${(maxBytes / 1e6).toFixed(1)} MB even as a plainer JPEG`, fix: 'give post.thumbnail an image file'}]);
}

/** A render's chapter lines ("1:05 The middle") → [[seconds, name]], as adapters take them (footprint-narration · readChapters). */
const chaptersOf = lines => readChapters(lines.join('\n')).map(({at, title}) => [at, title]);

/** The places a crop's edge cuts a kept thing it could not keep whole, from the record's framing: {clipped} or nothing. */
function clippedOf(framing) {
  const list = (Array.isArray(framing) ? framing : framing ? [framing] : []).flatMap(f => (f.clipped ?? []).map(c => ({...(f.cut !== undefined ? {cut: f.cut} : {}), ...(f.poster ? {poster: true} : {}), ...c})));
  return list.length ? {clipped: list} : {};
}

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
  out = securePath(out);   // first: the out's REAL path, nothing on the way another user could rearrange (files.mjs · securePath); written through it only
  const p = readPost(post), loaded = [];
  for (const spec of targets) loaded.push(await loadTarget(spec));
  const names = loaded.map(l => l.options.name); if (new Set(names).size !== names.length) throw new Error(`two targets are called the same (${names.join(', ')}): give one a name`);
  if (names.includes(WORK)) throw new Error(`a target cannot be called "${WORK}": that folder holds the renders' working files (give the target another name)`);
  // First everything that can be known before a frame is drawn, for every target: nothing renders if any refuses.
  const poster = film.render && 'poster' in film.render ? film.render.poster != null : film.recipe?.poster != null;
  for (const {adapter, options} of loaded) {
    // makeFilm's check reads a render on the film's own clock: an edit refuses it here, before any target renders.
    if (options.edit && film.check !== undefined && film.check !== null) throw new Error(`release target ${JSON.stringify(options.name)}: check reads a render on the film's own clock, and its cuts join stretches of it; leave check out of this release, or release each cut's part (from, to) apart to check it`);
    const part = options.edit ? editSeconds(options.edit) : options.from !== undefined && options.to !== undefined ? options.to - options.from : null;
    refuse(adapter, planProblems(adapter, p, {seconds: part, poster, scale: options.scale}));
    if (p.thumbnail !== 'poster') await checkThumbnail(adapter, p.thumbnail);
  }
  const stem = base ?? (String(film.storyboard?.title ?? 'film').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'film');
  // Then, still before a frame is drawn, every target's folders and the names written in them: each folder inside `out`
  // a real one of the release's own that no one else can change (files.mjs · outputFolder), and no folder at a name a
  // file goes to (files.mjs · refuseFolders) — so a refusal never comes after another target's outputs, or its own.
  const folders = loaded.map(({adapter, options}) => {
    const dir = outputFolder(out, options.name), work = outputFolder(out, [WORK, options.name]);
    const captions = readCaptionFiles(adapter.video.captionFiles ?? film.render?.captionFiles ?? false).map(k => `captions.${k}`);
    const thumbnail = adapter.thumbnail && p.thumbnail ? [p.thumbnail === 'poster' ? 'thumbnail.jpg' : `thumbnail${path.extname(p.thumbnail)}`] : [];
    refuseFolders([`${stem}.mp4`, ...captions, ...thumbnail, 'post.json', 'post.txt', 'CREDITS.txt'].map(f => path.join(dir, f)));
    refuseFolders([`${stem}.mp4`, ...captions, 'chapters.txt', 'making-of.json', ...(poster ? ['poster.jpg'] : [])].map(f => path.join(work, f)));
    return {dir, work};
  });
  const released = [];
  for (const [i, {adapter, options}] of loaded.entries()) {
    const {dir, work} = folders[i];
    const layout = {format: adapter.video.format, ...(adapter.video.captions || options.captions ? {captions: options.captions ?? adapter.video.captions} : {}),
      ...(options.header ? {header: options.header} : adapter.video.header && p.title ? {header: {title: p.title}} : {}), ...(options.crop && !options.edit ? {crop: options.crop} : {}), ...(options.scale !== undefined ? {scale: options.scale} : {}),
      ...(options.fill ? {fill: true} : {}), ...(options.keep !== undefined ? {keep: options.keep} : {})};
    // A platform that takes an uploaded thumbnail (YouTube) shows no frame of the video as one: it starts on the film's own.
    // The target's own render settings (posterFrame, quality) go over the film's.
    const own = options.render ?? {}, posterSaid = (film.render && 'posterFrame' in film.render) || 'posterFrame' in own;
    const render = {...(adapter.thumbnail && !posterSaid ? {posterFrame: false} : {}), ...(film.render ?? {}), ...own, layout, ...(adapter.video.captionFiles ? {captionFiles: adapter.video.captionFiles} : {}),
      ...(options.edit ? {edit: endOfFilm(options.edit, film.storyboard)} : {}),
      ...(!options.edit && options.from !== undefined ? {from: options.from} : {}), ...(!options.edit && options.to !== undefined ? {to: options.to} : {})};
    const result = await makeFilm({...film, out: path.join(work, `${stem}.mp4`), render});
    refuse(adapter, lengthProblems(adapter, result.seconds));
    const fields = adapter.post(p, {chapters: chaptersOf(result.chapters ?? []), seconds: result.seconds, limits: adapter.limits});
    refuse(adapter, textProblems(adapter, fields));
    const video = deliver(result.out, dir), captions = result.captions ? Object.fromEntries(Object.entries(result.captions).map(([kind, file]) => [kind, deliver(file, dir)])) : null;
    const thumbnail = await placeThumbnail(adapter, p.thumbnail, result.poster, dir);
    const record = {target: adapter.name, label: adapter.label, fields, video: path.basename(video), ...(captions ? {captions: Object.values(captions).map(f => path.basename(f))} : {}),
      ...(thumbnail ? {thumbnail: path.basename(thumbnail)} : {}), seconds: +result.seconds.toFixed(2), format: adapter.video.format, audience: p.audience, ...(p.synthetic.length ? {synthetic: p.synthetic} : {}), ...(p.lang ? {lang: p.lang} : {}), facts: adapter.facts};
    writeOutput(path.join(dir, 'post.json'), JSON.stringify(record, null, 2));
    writeOutput(path.join(dir, 'post.txt'), postText(adapter, fields));
    const made = JSON.parse(readFileSync(result.makingOf, 'utf8')), sounds = Array.isArray(made.foundSounds) ? made.foundSounds.filter(r => r && typeof r === 'object') : [];
    const credits = writeOutput(path.join(dir, 'CREDITS.txt'), creditsText(p, made.tools ?? [], sounds));
    released.push({target: options.name, dir, video, captions, thumbnail, credits, post: fields, makingOf: result.makingOf, work,
      // An edit as cut (edit.mjs), and every place the crop could not keep a named thing whole (layout.mjs · framing).
      ...(result.edit ? {edit: result.edit} : {}), ...clippedOf(made.framing)});
  }
  return released;
}
