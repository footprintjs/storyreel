# Approve and release

## Approve the film that was watched

A "final" render should be the film someone actually watched. Every `makeFilm` render's `making-of.json` lists what
the film was made from, hashed (`inputs`): the storyboard, the timings, the recipe, the strings, the data, the theme,
the cast, the facts, the language, every file it read, the pacing, the voice's audio, a song, `reducedMotion` (when
the recipe has camera moves), `render.soundAt: 'peak'` (the one render setting that changes the film), what draws it
(`storyreel`: StoryReel's version; `engine`: StoryReel's own code and the versions of the libraries it draws with;
`footprintjs`: the version the making-of record and its verdicts run on), and the kit's code when you pass `code`.
`approveFilm` takes the record of the render the person watched; `makeFilm({…, approval})` then refuses to render
anything else, naming what changed: "storyreel version (A approved, B now)", "StoryReel's code (same version X)" (a
`file:` dependency or a local edit), "footprintjs version (…)", "code" (the kit's), "recipe", "the file …". After an
`npm update`, re-approve: a footprintjs patch keeps every cached segment (segments hold the engine's fingerprint, not
footprintjs's version) but needs a new approval.

**The kit's code.** `codeFingerprint(paths)` hashes the files and folders it is given and everything they read: relative
static imports, transitively, and literal `import('…')` and `require('…')`; JavaScript and TypeScript (`.ts`, `.mts`,
`.cts`, `.tsx`, `.jsx`; `./x.js` finds `x.ts`); assets loaded by a literal `new URL('…', import.meta.url)`; a linked or
workspace package's code, followed as the film's own; each installed package as `name@version`. What it cannot follow it
lists in the record (`code.missing`, `code.unfollowed`, `code.unparsed`, [record.md](record.md)). A kit that loads
files another way (`readFile` with a path, an asset path built at run time) names that folder in `codeFingerprint([…])`,
or an edit there changes the film without the approval noticing.

```js file=approve.mjs
import {readFileSync, writeFileSync} from 'node:fs';
import {approveFilm, makeFilm, evenTimings, codeFingerprint} from 'footprint-storyreel';
import {farmKit} from './farm.mjs';

const read = file => JSON.parse(readFileSync(file, 'utf8'));
const storyboard = read('storyboard.json'), recipe = read('recipe.json'), code = codeFingerprint(['farm.mjs']);
// When the person signs off on the draft they watched (rendered with the same code fingerprint):
writeFileSync('approval.json', JSON.stringify(approveFilm({record: 'out/draft/making-of.json', by: 'Sam', note: 'first cut'}), null, 2));
// The final render: refused if anything it is made from changed since.
await makeFilm({storyboard, recipe, kits: [farmKit], timings: evenTimings(storyboard), code, approval: read('approval.json'),
  out: 'out/final/film.mp4', render: {quality: 'high'}});
```

The hashes are of the data, not its spelling, so reformatting a file changes nothing. An approval does not lock the
other render settings (size, format, captions, quality): the same approved film is made for every platform. An approval is of the
whole film; a part render cannot be approved. A draft rendered without `code` and a final with it differ (`code`), so
render both with the same `code`.

## One film, every platform

The film is always drawn on its 1600×900 frame; a **layout** puts it into the shape each place plays, with a title
band and a caption band where the shape leaves room. `render: {layout: {format, header?, captions?, crop?, scale?}}`.

| format | size | where | the picture |
|---|---|---|---|
| `landscape` | 1920×1080 | YouTube, X, LinkedIn | the whole frame; captions over its foot |
| `square` | 1080×1080 | feeds | title band, the whole frame, captions |
| `portrait` | 1080×1350 | Instagram and Facebook feeds | title band, a 4:3 crop, captions |
| `vertical` | 1080×1920 | Shorts, Reels, TikTok | title band, a 4:3 crop, captions |

- **Captions** come from the voice's own word times (or a silent film's even times; directions are never captioned).
  The layout's `captions` decides whether they are burned into the picture; `captionFiles: true` in `render` only adds
  `captions.vtt` and `captions.srt` beside the video, whatever the layout burns in.
- **A crop follows the action** in portrait and vertical: `crop: [{at: [scene, phrase], x}]` eases the crop's centre
  (an x on the 1600-wide frame) to `x` at each phrase; it is centred until the first.
- `scale: .5` is a half-size draft of a format; `scale: 2` with `quality: 'high'` is 4K for YouTube.
- **The poster** (`"poster": [scene, phrase, seconds]` in the recipe) is written as `poster.jpg` and made the first
  frame; `post.thumbnail: 'poster'` draws it at a platform's thumbnail size (a film with no poster is refused).
- Give each version its own folder: a render writes `poster.jpg` and `chapters.txt` beside its video.

## The post for each platform: makeRelease

`footprint-storyreel/release` · `makeRelease({…film, post, targets, out})` takes everything `makeFilm` takes, plus the
post and where it goes. Targets: `youtube`, `youtube-shorts`, `linkedin`, `tiktok`, `instagram-reels`, `x`, each as a
name or `{target, from?, to?, crop?, scale?, header?, captions?, limits?}`. `post` is `{title, description, audience:
'kids' | 'general', tags?, thumbnail?: 'poster' | an image, synthetic?: ['voice'], credits?}`.

```js
import {readFileSync} from 'node:fs';
import {evenTimings} from 'footprint-storyreel';
import {makeRelease} from 'footprint-storyreel/release';
import {farmKit} from './farm.mjs';

const read = file => JSON.parse(readFileSync(file, 'utf8'));
const storyboard = read('storyboard.json'), recipe = read('recipe.json');
await makeRelease({storyboard, recipe, kits: [farmKit], timings: evenTimings(storyboard), out: 'release/ep01',
  post: {title: 'A walk on the farm', description: 'A short walk, a bird, a wave.', audience: 'general'},
  targets: ['youtube', {target: 'youtube-shorts', from: 0, to: 20}]});
// release/ep01/youtube/: the video, captions.srt + .vtt, post.json, post.txt (the text to paste), CREDITS.txt
// release/ep01/work/youtube/: the render as made (video, chapters, captions) and its making-of.json; the files above link to it
```

Whatever can be known before a frame is drawn is checked first, for every target, and nothing renders if one
refuses: the audience (TikTok, Instagram, X and LinkedIn refuse a film made for kids, with the fix), a title over the
limit, a thumbnail of the wrong shape, a part too long. The length and the text with its chapters are checked after.
Uploading is not a release's job: it needs the account owner's sign-in.

```js run
import assert from 'node:assert/strict';
import {loadTarget, planProblems, readPost, TARGET_NAMES} from 'footprint-storyreel/release';

const post = readPost({title: 'How counting began', description: 'One sheep, one pebble.', audience: 'kids'});
const plan = {};
for (const name of TARGET_NAMES) {
  const {adapter} = await loadTarget(name);
  plan[name] = [adapter.video.format, planProblems(adapter, post, {seconds: 50}).map(p => p.problem)];
}
assert.deepEqual(plan.youtube, ['landscape', []]);   // YouTube takes a film made for kids (and marks it so)
assert.deepEqual(plan.tiktok, ['vertical', ['TikTok is for people aged 13 and over, and this film is made for kids']]);
assert.deepEqual(Object.keys(plan).filter(n => plan[n][1].length), ['linkedin', 'tiktok', 'instagram-reels', 'x']);
```
