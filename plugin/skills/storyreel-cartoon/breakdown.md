# Learn from a reference video

A director who admires a film says "match this". An agent cannot watch it, but it can read numbers and look at a few
contact sheets. A breakdown reads any MP4 once, small and grey, and writes down what a viewer would note: every cut
and what kind it is, the shots and their lengths, the pacing, where the motion is and whether the camera moves, which
shots carry lettering, and (with a beat map) which cuts land on the beat. It needs FFmpeg 5.1 or later.

```sh
npx storyreel breakdown reference.mp4 --out work/reference
```

No project is needed. It prints the breakdown in plain words and writes, in the `--out` folder:

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
- **Cuts on the beat**: give the breakdown a beat map in code, then fit your film to the same song
  ([music.md](music.md#into-a-film)).

```js
import {breakdown} from 'footprint-storyreel/breakdown';
import {beatMap} from 'footprint-storyreel/beats';

const {spec, text, files} = await breakdown('reference.mp4', {out: 'work/reference', beatMap});
console.log(spec.pacing, spec.audio.beats);   // the cuts that land within 0.05 s of a beat, when it could read the beats
```

`thresholds: {cutJump: 20}` changes one threshold (`footprint-storyreel/breakdown` · `BREAKDOWN` lists them; an
unknown name refuses). A failed run prints where its record stopped and its last decisions.

## Its limits

A wipe, a push or a zoom between shots reads as motion (often as a short moving shot between two cuts); a slow change
(a board drawn stroke by stroke) can read as still; lettering is a guess from strokes, never read (no OCR); heavy grain
through a dip can hide the black. When a verdict matters, check its `why` and the shot's sheet.
