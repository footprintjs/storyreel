# Learn from a reference video

A director who admires a film says "match this". An agent cannot watch it, but it can read numbers and look at a few
contact sheets. A breakdown reads any MP4 once, small and grey, and writes down what a viewer would note: every cut
and what kind it is, the shots and their lengths, the pacing, where the motion is and whether the camera moves, which
shots carry lettering, and (with `--beats`) which cuts land on the beat. It needs FFmpeg 5.1 or later.

```sh
npx storyreel breakdown reference.mp4 --out work/reference
npx storyreel breakdown reference.mp4 --out work/reference --beats --bpm 120
```

No project is needed. `--beats` reads the sound's beats with the beat map ([music.md](music.md)); `--bpm` hands it
the tempo you hear (the map is then sure); without `--beats` nothing about the beats is read. It prints the breakdown in plain words and writes, in the `--out` folder:

| file | what it holds |
|---|---|
| `breakdown.md` | a table of the shots: from, to, length, how each comes in (hard cut, dip, dissolve, fade), its motion, lettering |
| `breakdown.json` | the spec: `video`, `shots` (each with `in`, `seconds`, `motion`, `text`), `transitions`, `flashes`, `pacing`, `motion`, `audio`, `considered` |
| `shots/shot-01.png` … | a contact sheet per shot: 3 to 6 stills across it |
| `overview.png` | one still of every shot |
| `record.json` | the run's narrative: every candidate cut and shot decided with `decide()`, its measures against the thresholds |

## Read it in this order

1. `breakdown.md`: the shape of the film in a minute of reading.
2. `breakdown.json` · `pacing`: `shots`, `median` and `mean` shot length, `shortest`, `longest`, `cutsPerMinute`,
   `transitions` by kind. These are the numbers to match.
3. A shot's `motion.why` (the rule that decided `still`, `camera` or `inside`, with its checks) and `record.json`
   when a verdict looks wrong: it says what was measured, never guess past it.
4. `overview.png` and a shot's sheet, last, for the look (colour, framing).

## Turn it into a recipe

- **Scene lengths** follow the shot lengths: a direction's seconds in a silent scene, or pacing holds and tails
  ([voice.md](voice.md#pacing-room-for-the-pictures-to-land)).
- **How each shot comes in** maps to a stage's `enter`: a hard cut is `"cut"`, a dip is `{"type": "dip", "color": …}`,
  a dissolve is `"fade"` ([kits.md](kits.md#three-ways-a-kit-draws)).
- **Motion**: `camera` with a pan or tilt direction maps to a camera move ([camera.md](camera.md)); `inside` means
  things move in a held frame; `still` warns of a slide (the review's slideshow verdict, [checks.md](checks.md#no-slideshow)).
- **Cuts on the beat** (`--beats`): `spec.audio.beats` gives the tempo, its `verdict` and whether it is `sure`, and
  each cut on the beat (within 0.05 s) or off it. Cuts are judged only against the beats a film may cut on: an unsure
  tempo judges a cut only against the beats every candidate shares (the rest are `unjudged`, `onBeat: null`) and
  names the tempi to try (`likely`: listen, then run again with `--bpm`); a cut where no music plays is "no music
  here" (`noMusic`), never off the beat. A sound with no steady beat (speech, a pad) is recorded as not read, and why.
  Then fit your film to the same song ([music.md](music.md#into-a-film)).

```js
import {breakdown} from 'footprint-storyreel/breakdown';
import {beatMap} from 'footprint-storyreel/beats';

// The beat reader is handed the video itself; beatOptions go to it untouched (here: the tempo you hear).
const {spec, text, files} = await breakdown('reference.mp4', {out: 'work/reference', beatMap, beatOptions: {bpm: 120}});
console.log(spec.pacing, spec.audio.beats);
```

`thresholds: {cutJump: 20}` changes one threshold (`footprint-storyreel/breakdown` · `BREAKDOWN` lists them; an
unknown name refuses). A failed run prints where its record stopped and its last decisions.

## Make one like it

`storyreel remake work/reference` reads the breakdown as a draft plan — scenes, pace, entrances, whether the song
times it, each with its why, and what is still to give. Show it to the person first: nothing is made until they
approve it. Approved, `--starter <folder>` makes it into a film that renders as it is: an animatic in the reference's
rhythm, every card ("WORD 1", "TITLE", a grey "PICTURE") landing when the reference cuts. Its README says what to give
and where; fill in the words in its recipe.json and render again.

```sh
npx storyreel remake work/reference                          # the plan, in words (--json for the data)
npx storyreel remake work/reference --starter work/like-it   # approved: the starter folder
cd work/like-it && npx storyreel sheet && node render.mjs
```

To change how a scene comes in or how its words land, the person picks by eye: `npx storyreel studio` in the folder
opens the gallery (every transition and word move playing; Try puts one on the scene at the playhead, Keep copies its
line). Apply the lines they kept without reading the recipe — every line is checked first, and one that refuses
writes nothing and names the fix (`--record` prints the check's record as JSON):

```sh
npx storyreel apply "scene-03 enter torn" "scene-02 move pop"
```

## Its limits

A wipe, a push or a zoom between shots reads as motion (often as a short moving shot between two cuts); a slow change
(a board drawn stroke by stroke) can read as still; lettering is a guess from strokes, never read (no OCR); heavy grain
through a dip can hide the black. When a verdict matters, check its `why` and the shot's sheet.
