# A recording as a world

Use a real local recording when the product itself needs to be on screen. Its fit, named targets and time map are
recipe data, so a small edit keeps the existing camera, focus, captions, transitions and render cache.

```js
import {footageKit} from 'footprint-storyreel/kits/footage';

const recipe = {story: {kit: 'footage', scene: 'demo', file: 'demo/form.mp4',
  fit: 'contain', keys: [{at: 0, video: 0}, {at: 4, video: 4}, {at: 8, video: 4}],
  regions: [{name: 'result', box: [100, 180, 700, 360]}]}};
// Pass kits: [footageKit] to compileFilm or makeFilm, with a root containing demo/form.mp4.
```

The file must be at least four seconds long and its original dimensions must contain that box. This recipe holds
the fourth second from film time 4 onward. `at` also takes a phrase anchor such as `['demo', 'inspect the result']`.
Film times strictly increase; source times never decrease. Equal source times hold, other segments play linearly
at 1/8×–8×. Sparse keys hold at both ends. With no keys, normal playback starts with the scene, then holds the last
frame. Times belong to the film clock, not to a separate edit timeline.

Contain is the default: preserve the entire recording inside 1600×900, using `background` (`#15151b` by default)
around it. Cover crops the edges to fill the frame. A region uses `[left, top, right, bottom]` in original recording
pixels; the fit maps it to the frame. Use its `name` with existing camera/focus tools. Source audio is muted; there
is no source-audio option in this phase. Supply narration or music through the existing film APIs.

## Admission and preparation

FFmpeg and ffprobe must be installed locally and support the **`fd` input protocol**. `createFootageKit({ffmpeg,
ffprobe})` selects explicit tool paths. Omitted FFmpeg uses `FFMPEG_BIN` or PATH; omitted ffprobe first checks beside
the selected FFmpeg path, then PATH. If the installed tools lack the protocol, use a build that provides it.
StoryReel does not fetch tools, media, URLs or a recording script.

The untrusted local MP4/WebM stays inside the film root, including through real paths. The engine's
`context.fileInput(file, {maxBytes})` stream-hashes and records the admitted file for its world. Preparation
finishes before drawing; `draw(ctx, t)` selects a frame without launching a subprocess. Frames are seekable in any
order. File bytes and decode settings take part in cache keys; the full input set still binds approval.
Custom kits must include file admission in their returned world's `ready`; an unawaited Promise does not establish
that an input was admitted before drawing.

Prepared frames live under `<root>/.storyreel-footage/<cache key>/`, keyed by the source hash, sample rate, decode
size and decoder version. They are compressed RGBA blocks (`rgba-deflate-v1`) with the completion manifest written
last. An incomplete cache is refused, not silently reused or deleted: move the named incomplete folder aside, or
remove that owned cache folder, then retry with a stable recording. Cache directories remain for reuse; old takes
can accumulate on disk. The disk bound below is per prepared recording, not a bound on all past caches together.
Cache checksums detect corruption; they do not authenticate a cache against someone who can edit its files and
recompute the checksums. Use the project's owned cache, not an imported cache as signed provenance.

`FOOTAGE` owns the bounds:

| Input or operation | Bound | Fix when refused |
|---|---:|---|
| Input bytes | 512 MiB | Trim or compress the local file. |
| Duration | 600 seconds | Split it into smaller recordings. |
| Source dimensions | 33,177,600 pixels | Export a smaller recording. |
| Sampled frames | 18,000 | Lower `fps` or shorten the recording. |
| `fps` | Whole number 1–30, default 12 | Use 12 for a smaller cache. |
| Decode `width` | Whole number 160–1920, default 1600 | Lower the width. |
| One decoded frame | 16 MiB | Lower the decode width. |
| Prepared cache, per recording | 2 GiB | Lower width/fps or split the recording. |
| Retained decoded-frame budget | 64 MiB | Lower the width; this is not a total process-memory bound. |
| Remap keys / named regions | 256 / 128 | Use fewer keys or targets. |
| Active preparations, shared across kit factories | 2 per process | Let a preparation finish before starting more. |
| Active plus queued preparation requests | 32 | Compile fewer recorded shots together. |
| Local media-tool deadline | 120 seconds | Trim or reduce the recording before retrying. |

These are refusal thresholds, not measured speed or memory promises. The benchmark and rendered example report
their own inputs and results; do not extrapolate them to every recording or machine.
The media-tool deadline starts after acquiring a preparation slot, before admission. Queue waiting is separate;
filesystem hashing/reads are not interrupted by the deadline and can take longer. It is not a wall-clock limit on
the whole compile or every filesystem operation.

## What the record does not prove

The kit does not read screen text or establish the truth of recorded claims. Reading and claim checks apply to
their own recipe/caption text, not to words or numbers baked into the video. Check a still at the target size and
watch a small rendered part. A recorded failure, storage receipt or empty impact list does not by itself establish
a root cause or absence of impact.

Read `film.preparation` (also `making-of.json.preparation`) for the world's `source`, `bounds` and `remap` decision
narratives. These are the reasons for preparing/reusing frames and for each hold or rate decision, not an analysis
of the screen's contents. The engine detaches the report after readiness; unsupported or excessive report data is
refused rather than silently dropped.

Click logs, automatic click-following zooms, device frames and running a recording script belong to later work.
Use the [main README](../../../README.md#recorded-video-as-a-shot) for a complete clock/remap example.
