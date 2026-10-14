# The checks: what each one reads, and what to do

A frame is a pure function of time, so StoryReel checks a film by reading it, before anything renders: where every
word lands, whether the picture moves, whether a drawn foot slides, whether a number has a source. Each check names
the moment, the scene and the recipe entry, so the fix is a lookup, not a hunt. There are four layers:

1. **The compile refuses** what cannot be right: a phrase not in the storyboard, an unknown key, a camera move that
   would uncover the frame, a guess with no pause. The message names the fix; compiled with `record: true`, the refusal
   carries `error.record`.
2. **The compile lists** what is weak, without refusing: `film.reading` (lines up too briefly to read),
   `film.watching` (more than 4 moments in 2 s<!-- WATCHING.burst.most WATCHING.burst.seconds -->), `film.reads`, `film.listening` (too many sounds on cuts).
   `"reading": "refuse"`, `"watching": "refuse"`, `"listening": "refuse"` in the recipe make each one a refusal.
3. **The review** reads the picture as text and gives findings and three verdicts: `npx storyreel review`, or
   `footprint-storyreel/review` · `reviewPart` in code.
4. **The finished file** is checked after a render: `makeFilm({…, check: 'report'})` writes `finished` into
   `making-of.json` (its length, blank runs, flash frames, joins; the voice and lip sync in a voiced render;
   captions); `check: 'refuse'` turns a problem into a refusal.

## The review's findings

The review's first line lists the checks that ran, by id (`review (hook, stale, still, slideshow, geometry,
claims)`); a check runs only when the part has what it reads (no caption band, no caption check).

| id | finding | what it means | the usual fix |
|---|---|---|---|
| `under-captions` | under the captions | words drawn where the caption band shows | move them up, or `focus.safe` / a crop |
| `words-overlap` | words over words | two words overlap | move one, or let the first leave first |
| `cut-off` | cut off at the edge | a word runs off the frame (a camera move can push it off) | move it in, or end the move sooner |
| `hook` | no hook | nothing moves in the first 3 s<!-- REVIEW_DEFAULTS.hook --> of the film | start something moving at once |
| `text-density` | too much to read | more than 35 words<!-- REVIEW_DEFAULTS.maxWords --> on screen at once: draws joined into words as a reader sees them (a word drawn in coloured pieces is one; "=" or "(" is none), captions included, code drawn in `code()` left out; the finding quotes the words it counted | fewer words, or in turns |
| `silences` | no breath | a spoken part of 30 s<!-- REVIEW_DEFAULTS.breath --> or more with under two real silences (0.8 s<!-- REVIEW_DEFAULTS.minSilence -->, no sound) | a pacing hold before the peak |
| `stale` | nothing new | no scene, no beat, no new word for 5 s<!-- REVIEW_DEFAULTS.newEvery --> (the picture may still move) | a beat: a phrase the kit or the recipe acts on |
| `still` | nothing changes | the picture is frozen for 5 s<!-- REVIEW_DEFAULTS.stillFor --> or more | something alive in the shot (a cloud, a blink) |
| `loop` | the loop jumps | `--loop true`: the part's end does not come round to its start | trim it to whole cycles |
| `frozen-voice` | a freeze over the voice | a camera `freeze` holds a drawing the voice names, or a mouth while its speaker talks | move the freeze off the line |
| `example-lingers` | example data over real numbers | an example scene's line, and its label, stay up into a real scene | erase that line before the scene |
| `slideshow` | held still | a shot holds still for more than 3 s<!-- SLIDESHOW.hold --> at a time (the verdict below) | motion inside the shot |
| `geometry` | the drawing breaks | a drawn part comes off, crosses or slides (the verdict below) | fix the kit's drawing |
| `claims` | no source | a number on screen has no source (the verdict below) | a fact, or an example scene |

"Nothing changes", "nothing new" and the slideshow's "held still" are advice: a held title can be right, and then
say why you keep it. Every other finding names something to fix: most are facts about the drawing (where a word
landed, when), while `silences` is about the voice's pauses, `claims` about sources and `hook` about the opening.

## The three verdicts

Each says `passed`, `failed` or `not run`, with why, decided with footprintjs's `decide()` (the evidence is in
`review.record`). **`not run` has checked nothing**: never report it as passed.

### No slideshow

The shots must move inside themselves. Each shot is read in its middle (transitions cut out) as small grey frames;
a still stretch longer than 3 s<!-- SLIDESHOW.hold --> is **dead**. It fails when more than half the shots' running time is dead, or more
than 85% is still at all (a deck of slides swapped every 3 s). A kit cannot exempt itself. Fix: motion inside the
shot (a move, a drift, an idle), not more cuts. `footprint-storyreel/slideshow` · `slideshowOf(film)` measures it alone,
with the thresholds as data (`footprint-storyreel/slideshow` · `SLIDESHOW`; `slideshowOf(film, {rule: {...SLIDESHOW, hold: 4}})`):

| threshold | value | what it is |
|---|---|---|
| `width` | 160 | frames are read this many pixels wide |
| `level` | 4 | grey levels a cell must change by to count as changed |
| `area` | 0.0002 | share of the cells that must change for a step to move |
| `hold` | 3 | seconds still before a stretch is dead |
| `most` | 0.5 | share of the running time dead that fails the film |
| `cover` | 0.0025 | a shot whose changes touch less of the frame than this never moves |
| `still` | 0.85 | share of the running time still at all that fails the film |

### Drawn parts hold together

Runs only when a kit gives its `parts(t)`: `{segments: {name: {a: [x, y], b: [x, y], width?, mount?, ends?, contact?}},
regions?: {name: [x0, y0, x1, y1]}, apart?: [[name, name]]}`, in the kit's own coordinates, from the same numbers it
draws with. A segment's root `a` must stay on its `mount`: touching the mounted segment (both widths counted), or
inside the mounted region's box, within 2 px<!-- GEOMETRY.reach --> (a break says how far off it is: `"sail 1" comes off "hub" (16 px …)`); a pair in `apart`
must never cross; an end named by `contact` (`'a'`, `'b'`, `true` for both, `false` in the air) must not slide more
than 1 px<!-- GEOMETRY.slide --> while it rests. Read `contact` from the pose: a walk's foot rests while its `lift` is 0. The main path's
`farm.mjs` gives legs this way ([SKILL.md](SKILL.md)); `footprint-storyreel/geometry` · `geometryOf(film)` runs it alone.

### Every number has a source

Every number on screen (a line, a caption, a word a kit draws, a card's row, code) must match a **fact** the
storyboard names, or sit in a scene marked as **example data**. A storyboard with no `facts` gets `not run` as soon
as a number shows outside an example scene.

```js run
import assert from 'node:assert/strict';
import {compileFilm, evenTimings} from 'footprint-storyreel';
import {reviewPart} from 'footprint-storyreel/review';

const recipe = {story: {kit: 'whiteboard', items: [
  {at: ['stall', 'Mia sold'], dur: 1, write: 'Sold 12 cups', x: 800, y: 300, size: 64, align: 'center'}]}};
const scene = {id: 'stall', narration: 'Mia sold lemonade at her stall all morning, one cup at a time.'};
const verdictOf = async storyboard => {
  const film = await compileFilm({storyboard, recipe, timings: evenTimings(storyboard)});
  return (await reviewPart(film)).verdicts.find(v => v.check === 'claims');
};
assert.equal((await verdictOf({scenes: [scene]})).verdict, 'not run');                                     // no facts
const failed = await verdictOf({facts: [{value: 13, source: 'https://example.org/ledger'}], scenes: [scene]});
assert.equal(failed.verdict, 'failed');                                                                    // 12 has no source
assert.deepEqual(failed.measured.unsourcedNumbers.map(n => [n.number, n.scene, n.path]), [['12', 'stall', 'story.items[0]']]);
assert.equal((await verdictOf({facts: [{value: 12, text: '12 cups', source: 'https://example.org/ledger'}], scenes: [scene]})).verdict, 'passed');
assert.equal((await verdictOf({facts: [], scenes: [{...scene, example: true}]})).verdict, 'passed');        // example data
```

- **A fact** is `{value, text?, source}`. `value` is the number as shown (`16.67`, `-5`, `1000000` for
  "1,000,000"; as written when it is not one value: `"3:15"`). `text` is the words it must be shown with ("12 cups",
  so 12 sheep is not sourced by it). `source` is a URL (notes may follow it after a space: `"https://x.org/t table 2"`),
  a file inside the film's root (`run.json#steps[2]`), or words, which pass as **unverified**. `facts` is the list, or a JSON file inside the root.
- **An example scene** (`"example": true`, or the label in the film's language: `"example": "Beispieldaten"`)
  shows an "Example data" label while its lines are up; its numbers need no source.
- **The film's language** reads its numbers: `compileFilm({…, lang: 'de'})` reads "2,5 kg" as 2.5. Without `lang`, a
  number languages read apart ("1,000", "2,5") is ambiguous and needs a fact written the same way.
- **Digits of any script** are read as their values, with or without a language: Arabic-Indic "١٢٣", Devanagari
  "१२३" and full-width "０１２" are 123, 123 and 12. Full-width "，" and "．" are a group separator and a decimal point
  (`ja` "１，０００円" is 1000, "３．５kg" 3.5). A number that mixes scripts ("١2٣") is ambiguous. A fact written in
  native digits sources the same value.

```js run
import assert from 'node:assert/strict';
import {compileFilm, evenTimings} from 'footprint-storyreel';
import {numberValue, unsourcedClaims} from 'footprint-storyreel/claims';

assert.deepEqual(['١٢٣', '१२३', '０１２'].map(n => numberValue(n)), [123, 123, 12]);   // any script's digits
assert.deepEqual([numberValue('１，０００', {lang: 'ja'}), numberValue('３．５', {lang: 'ja'})], [1000, 3.5]);   // full-width separators
assert.equal(numberValue('١2٣'), '١2٣');                        // scripts mixed: ambiguous, kept as written
// A fact in Arabic-Indic digits sources the 12 a whiteboard writes.
const storyboard = {facts: [{value: '١٢', source: 'https://example.org/ledger'}], scenes: [{id: 'stall', narration: 'Mia sold lemonade at her stall.'}]};
const recipe = {story: {kit: 'whiteboard', items: [{at: ['stall', 'Mia sold'], dur: 1, write: 'Sold 12 cups', x: 800, y: 300, size: 64}]}};
const film = await compileFilm({storyboard, recipe, timings: evenTimings(storyboard)});
assert.equal(unsourcedClaims(film.claims).length, 0);
```
- **Words that claim nothing**, a kit's line numbers or a step counter, are drawn inside
  `footprint-storyreel/decorative` · `decorative` (`decorative(ctx, () => ctx.fillText('3', x, y))`); code is drawn
  inside `code(ctx, …)`, so its numbers are read as code ("." decimal, "_" joins digits) and still need a source.
- `makeFilm({…, claims: 'refuse'})` refuses a number with no source before anything is drawn (it reads declared
  lines only; the review also reads what the picture draws).

## The review in code

`reviewPart(film, {part?, every?, layout?, loop?, checks?})` returns `{text, findings, verdicts, verdictText,
timeline, record, …}`. `part: {scenes: ['farm'], handles: 1.5}` reviews some scenes with 1.5 s either side;
`layout` (a format, with `captions: true`) adds the caption checks; `every` is how often it reads the picture (0.25 s<!-- REVIEW_DEFAULTS.every -->
by default; smaller is finer and slower, and the claims check always reads at least every 0.25 s<!-- HOLD.step -->); `loop: true`
checks the seam of a part made to loop. A check of your own is `{label, why, when(scope), find(review)}` in `checks`.
The command line reviews with the defaults (`npx storyreel review --scene farm`); see the `storyreel-review` skill
([its SKILL.md](../storyreel-review/SKILL.md)).
