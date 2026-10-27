/**
 * Before a long render: does this machine have what the film needs? The local FFmpeg is asked, never assumed — its own
 * lists of encoders, filters, muxers and demuxers (ffmpeg -encoders, -filters, -muxers, -demuxers), ffprobe's version
 * — and the fonts the theme names are looked up where the pictures are drawn (@napi-rs/canvas · GlobalFonts).
 *
 *   needs      what a render may need (NEEDS), each with what it is for and when: a stamp needs FFmpeg's overlay, an
 *              edit's cross-fade its acrossfade, the finished-file check ffprobe and showinfo; the theme's font stacks
 *   a status   'available' (the list names it), 'missing' (the list was read and does not), or 'unknown' (the list
 *              could not be read: the program did not run, or printed nothing a reader recognises). Never 'available'
 *              on a guess.
 *   a report   {ffmpeg, ffprobe, items, ok, sure}: ok when nothing a render cannot do without is missing (a missing font
 *              only changes the face words are drawn in), sure when nothing is unknown. doctorText says it as lines;
 *              `storyreel doctor --json` prints the report itself, for agents.
 *
 * A release asks first (release.mjs · makeRelease), so a missing piece refuses in seconds, not after the render.
 * Every program is run through `run(command, args)` (spawnSync by default): a test hands in its own listing.
 */
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {ffprobeBeside} from './spawned.mjs';
import {loadTheme} from './theme.mjs';

export const STATUSES = Object.freeze(['available', 'missing', 'unknown']);

/**
 * What a render may need from FFmpeg: {kind, name, for, when?}. `when(o)` says whether a render with these options
 * needs it ({check, edit, quality, stamp, music, found}); without `when`, every render does. Asked with no options
 * (the command line), the doctor asks for every one.
 */
export const NEEDS = Object.freeze([
  {kind: 'program', name: 'ffmpeg', for: 'every render: the picture, the sound, the mux'},
  {kind: 'program', name: 'ffprobe', for: 'reading a finished file (the finished-file check)', when: o => o.check},
  {kind: 'encoder', name: 'libx264', for: 'the picture, as H.264'},
  {kind: 'encoder', name: 'aac', for: 'the sound, as AAC'},
  {kind: 'muxer', name: 'mp4', for: 'the video file'},
  {kind: 'demuxer', name: 'concat', for: 'joining the voice, and the picture\'s pieces'},
  {kind: 'demuxer', name: 'lavfi', for: 'generated silence (a silent scene, a film with no voice)'},
  {kind: 'filter', name: 'loudnorm', for: 'loudness, in two passes'},
  {kind: 'filter', name: 'ebur128', for: 'each sound measured apart (voice, effects, music)'},
  {kind: 'filter', name: 'anullsrc', for: 'generated silence'},
  {kind: 'filter', name: 'amix', for: 'the voice, the effects and the music mixed'},
  {kind: 'filter', name: 'aresample', for: 'every sound at 48 kHz'},
  {kind: 'filter', name: 'aformat', for: 'the mix in stereo for the loudness passes'},
  {kind: 'filter', name: 'apad', for: 'the sound padded to the picture\'s length'},
  {kind: 'filter', name: 'adelay', for: 'each sound placed on its moment'},
  {kind: 'filter', name: 'volume', for: 'each sound\'s level'},
  {kind: 'filter', name: 'atrim', for: 'a sound or a song cut to its stretch'},
  {kind: 'filter', name: 'afade', for: 'a song\'s fade, a hard cut faded over 10 ms'},
  {kind: 'filter', name: 'concat', for: 'an edit\'s sound joined cut to cut'},
  {kind: 'filter', name: 'volumedetect', for: 'a found sound\'s level', when: o => o.found},
  {kind: 'filter', name: 'acrossfade', for: 'an edit\'s overlapping joins', when: o => o.edit},
  {kind: 'filter', name: 'scale', for: 'the high-quality encode\'s colours, the finished-file check', when: o => o.quality === 'high' || o.check},
  {kind: 'filter', name: 'format', for: 'the high-quality encode, the finished-file check', when: o => o.quality === 'high' || o.check},
  {kind: 'filter', name: 'setparams', for: 'the high-quality encode\'s colour tags (BT.709)', when: o => o.quality === 'high'},
  {kind: 'filter', name: 'overlay', for: 'a stamp burned over the joined pieces', when: o => o.stamp},
  {kind: 'filter', name: 'showinfo', for: 'the finished-file check (each frame\'s time)', when: o => o.check},
]);
/** FFmpeg's list for each kind of component. */
const LISTS = Object.freeze({encoder: '-encoders', filter: '-filters', muxer: '-muxers', demuxer: '-demuxers'});
/** One line of each list: the name after the flags (a format's line may name several, comma-separated). */
const LINE = Object.freeze({
  encoder: /^\s*[VAS][.A-Z]{5}\s+(\S+)/,
  filter: /^\s*[.A-Z|]{2,3}\s+(\S+)\s+\S*->\S*/,
  muxer: /^\s*(?:[DEd.]\s?){1,3}\s+(\S+)/,
  demuxer: /^\s*(?:[DEd.]\s?){1,3}\s+(\S+)/,
});
/** The generic font families a CSS stack may end in: the face drawn for one depends on the machine. */
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong']);
/** The font StoryReel brings (fonts/), registered where it is drawn (pen.mjs, the whiteboard). */
const BUNDLED = Object.freeze({Caveat: fileURLToPath(new URL('../fonts/caveat/Caveat.ttf', import.meta.url))});

/**
 * The names one of FFmpeg's lists gives (`kind`: encoder, filter, muxer, demuxer), read from its text: a Set, or null
 * when the text is not such a list (no "---" line under its legend, or no line after it that reads as one) — the
 * doctor then says 'unknown', never 'missing'.
 */
export function parseList(kind, text) {
  const lines = String(text ?? '').split(/\r?\n/), start = lines.findIndex(l => /^\s*-{2,}\s*$/.test(l));
  if (start < 0 || !LINE[kind]) return null;
  const names = new Set();
  for (const line of lines.slice(start + 1)) { const m = LINE[kind].exec(line); if (m) for (const n of m[1].split(',')) if (n) names.add(n); }
  return names.size ? names : null;
}

/** A program's version line ("ffmpeg version 9.0.2 …" → "9.0.2"), or null. */
export const versionOf = text => /\bversion\s+(\S+)/.exec(String(text ?? ''))?.[1] ?? null;

/** spawnSync, its text out and how it ended: {stdout, stderr, status, error}. */
const runSync = (command, args) => spawnSync(command, args, {encoding: 'utf8', timeout: 30000, maxBuffer: 1 << 24});

/** Why a program did not answer, in words, and whether it is there at all. */
function failure(command, r) {
  if (r.error?.code === 'ENOENT') return {status: 'missing', why: `there is no ${command} to run: install FFmpeg (it brings ffprobe), or name one with FFMPEG_BIN (--ffmpeg)`};
  const how = r.error ? r.error.message : r.status === null ? `stopped by ${r.signal}` : `exit ${r.status}`;
  return {status: 'unknown', why: `${command} did not answer (${how}): ${String(r.stderr ?? '').trim().slice(-200) || 'it printed nothing'}`};
}

/** A program asked for its version: {status, version?, why?}. */
function program(command, run) {
  const r = run(command, ['-hide_banner', '-version']);
  if (r.error || r.status !== 0) return failure(command, r);
  return {status: 'available', version: versionOf(r.stdout) ?? versionOf(r.stderr)};
}

/** A CSS font stack's families, unquoted ('"Avenir Next",Arial,sans-serif' → ['Avenir Next', 'Arial', 'sans-serif']). */
export const stackFamilies = stack => String(stack).split(',').map(f => f.trim().replace(/^["']|["']$/g, '').trim()).filter(Boolean);

/**
 * A font stack as drawn here: 'available' with the family it is drawn in (the first named one that is installed),
 * 'missing' when none of its named families is (the canvas falls back to a face of its own: words measure
 * differently), 'unknown' when the installed fonts cannot be read. `fonts.has(family)` answers for a family.
 */
export function fontStatus(stack, fonts) {
  const named = stackFamilies(stack).filter(f => !GENERIC.has(f.toLowerCase()));
  if (!named.length) return {status: 'available', why: 'a generic family only: drawn in this machine\'s own face for it'};
  try {
    const found = named.find(f => fonts.has(f));
    return found ? {status: 'available', why: `drawn in ${found}`}
      : {status: 'missing', why: `none of ${named.join(', ')} is installed: words are drawn in the canvas's own fallback face, and measure differently — install one, or give the theme a font this machine has`};
  } catch (e) { return {status: 'unknown', why: `the installed fonts could not be read: ${e.message}`}; }
}

/** The installed fonts as the canvas sees them ({has(family)}), the bundled ones registered first; null when they cannot be read. */
function canvasFonts() {
  try {
    const {GlobalFonts} = createRequire(import.meta.url)('@napi-rs/canvas');
    for (const [family, file] of Object.entries(BUNDLED)) if (!GlobalFonts.has(family) && existsSync(file)) GlobalFonts.registerFromPath(file, family);
    return {has: family => GlobalFonts.has(family)};
  } catch { return null; }
}

/** The font stacks a theme names (its `type` entries that are stacks): [[role, stack]]; a theme that cannot be read is said in `items`, unknown. */
function stacksOf(theme, items) {
  try {
    const t = typeof theme === 'string' ? loadTheme(theme) : theme;
    return Object.entries(t?.type ?? {}).filter(([, v]) => typeof v === 'string');
  } catch (e) {
    items.push({kind: 'font', name: String(typeof theme === 'string' ? theme : theme?.id ?? 'theme'), for: 'the theme\'s type', status: 'unknown', why: `the theme could not be read: ${e.message}`});
    return [];
  }
}

/**
 * Ask this machine what a render needs. options: {ffmpeg?, ffprobe?, render?: {check, edit, quality, stamp, music,
 * found} (left out: everything in NEEDS), themes?: [name or theme] (default ['paper', 'storybook']: the built-in
 * looks), fonts?: {has(family)} (default: the canvas's), run?: (command, args) → {stdout, stderr, status, error}}.
 * Returns {ffmpeg: {path, status, version?, why?}, ffprobe: {…} | null, items: [{kind, name, for, status, why?}],
 * missing: [items], unknown: [items], ok, sure}.
 */
export function doctor({ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg', ffprobe = process.env.FFPROBE_BIN || ffprobeBeside(ffmpeg), render = null, themes = ['paper', 'storybook'], fonts = canvasFonts(), run = runSync} = {}) {
  const wanted = NEEDS.filter(n => !render || !n.when || n.when(render));
  const ff = {path: ffmpeg, ...program(ffmpeg, run)};
  const probe = wanted.some(n => n.name === 'ffprobe') ? {path: ffprobe, ...program(ffprobe, run)} : null;
  const lists = {};
  const listOf = kind => {
    if (kind in lists) return lists[kind];
    if (ff.status !== 'available') return (lists[kind] = {names: null, why: `${ffmpeg} could not be asked (${ff.why})`});
    const r = run(ffmpeg, ['-hide_banner', LISTS[kind]]);
    if (r.error || r.status !== 0) return (lists[kind] = {names: null, why: failure(ffmpeg, r).why});
    const names = parseList(kind, r.stdout || r.stderr);
    return (lists[kind] = {names, why: names ? null : `${ffmpeg} ${LISTS[kind]} printed no list this doctor can read`});
  };
  const items = wanted.map(n => {
    const said = {kind: n.kind, name: n.name, for: n.for};
    if (n.kind === 'program') { const p = n.name === 'ffmpeg' ? ff : probe; return {...said, status: p.status, ...(p.why ? {why: p.why} : {})}; }
    const {names, why} = listOf(n.kind);
    if (!names) return {...said, status: 'unknown', why};
    return names.has(n.name) ? {...said, status: 'available'}
      : {...said, status: 'missing', why: `${ffmpeg} has no ${n.kind} called ${n.name}: use an FFmpeg built with it (a full build: brew install ffmpeg, apt install ffmpeg) and name it with FFMPEG_BIN (--ffmpeg)`};
  });
  const seen = new Set();
  for (const theme of themes) for (const [role, stack] of stacksOf(theme, items)) {
    if (seen.has(stack)) continue; seen.add(stack);
    const s = fonts ? fontStatus(stack, fonts) : {status: 'unknown', why: 'the installed fonts could not be read (@napi-rs/canvas · GlobalFonts)'};
    items.push({kind: 'font', name: stack, for: `the theme's ${role} type${typeof theme === 'string' ? ` (${theme})` : ''}`, ...s});
  }
  const missing = items.filter(i => i.status === 'missing'), unknown = items.filter(i => i.status === 'unknown');
  return {ffmpeg: ff, ffprobe: probe, items, missing, unknown, ok: !missing.some(i => i.kind !== 'font'), sure: !unknown.length};
}

/** A report as lines to read: the programs, then each item by its status (missing first), then the verdict. */
export function doctorText(report) {
  const prog = (p, name) => (p ? `${name} ${p.version ?? '?'} (${p.path}): ${p.status}` : null);
  const order = {missing: 0, unknown: 1, available: 2};
  const rows = [...report.items].sort((a, b) => order[a.status] - order[b.status]).map(i => `${i.status.padEnd(9)} ${i.kind.padEnd(7)} ${i.name.padEnd(24)} ${i.for}${i.why && (i.status !== 'available' || i.kind === 'font') ? `\n          → ${i.why}` : ''}`);
  const verdict = !report.ok ? `Not ready: ${report.missing.filter(i => i.kind !== 'font').map(i => `${i.kind} ${i.name}`).join(', ')} missing — a render would fail.`
    : report.missing.length ? `Ready to render; ${report.missing.length} font stack${report.missing.length > 1 ? 's fall' : ' falls'} back to another face.`
      : 'Ready: everything a render needs is there.';
  return [prog(report.ffmpeg, 'ffmpeg'), prog(report.ffprobe, 'ffprobe'), '', ...rows, '', `${verdict}${report.sure ? '' : ` ${report.unknown.length} could not be asked (unknown): see why above.`}`].filter(l => l !== null).join('\n');
}

/**
 * Refuse when a render cannot be made here: anything but a font missing. `who` names the caller ('release'). Returns
 * the report (unknowns and missing fonts are the caller's to say).
 */
export function requireDoctor(report, who = 'render') {
  const fatal = report.missing.filter(i => i.kind !== 'font');
  if (fatal.length) throw new Error(`${who}: this machine cannot make it — missing: ${fatal.map(i => `${i.kind} ${i.name} (${i.for})`).join(', ')}. ${fatal[0].why}. storyreel doctor lists what is there`);
  return report;
}
