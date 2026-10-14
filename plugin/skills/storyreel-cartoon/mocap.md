# Motion from a video

A walk planned by numbers looks like a walk; a child's wave filmed on a phone looks like that child. Real people
hesitate, lean, overshoot and settle, and that timing is hard to key by hand. `footprint-storyreel/mocap` copies it
from a video onto the 2D cartoon figure: the person's keypoints, frame by frame, become a **motion source** any kit
draws. No 3D body model, no GPU, and the video never leaves the machine.

## 1. Keypoints from the video (optional Python tool)

The package ships `node_modules/footprint-storyreel/tools/pose-from-video.py` (MediaPipe Pose, Apache-2.0). Nothing
installs or runs it for you:

```sh
python3 -m venv .venv && . .venv/bin/activate
pip install mediapipe        # it brings OpenCV; do not add opencv-python beside it
python node_modules/footprint-storyreel/tools/pose-from-video.py wave.mp4 wave.pose.json   # --model lite|full|heavy, --fps 30
```

- **It downloads a model on first use**: MediaPipe's pose landmarker (lite about 6 MB, full about 9 MB, heavy about
  30 MB) from Google's model storage into `~/.cache/storyreel` (`--models DIR`), checks its SHA-256 against the hashes
  recorded in the script, and reuses it after that. `--trust-download` is only for pinning a new model version.
- **Heavy is the default** because lighter models trade the left and right feet more often.
- **Film for it**: one person, a steady phone, the whole body in view, moving across the frame (walking toward the
  camera changes their size; the floor is taken as flat).
- Any COCO-17 detector's output fits too: `{"scheme": "coco-17" | "mediapipe-33", "fps", "coordinates": "pixels" |
  "normalised", "width", "height", "frames"}`, each frame the scheme's points as `[x, y, confidence]` (in order, or by
  name such as `left_ankle`), or `null` where nobody was found.

## 2. A motion source

`fromPose(keypoints, {x, size, start?, from?, to?, loop?, minConfidence?, …})` makes it once, before `compileFilm`:
`x` is where the figure stands at the clip's first frame, `size` its height in px, `start` the film second it plays
from, `from`/`to` the stretch of the video to use. It returns `{poseAt(t), start, end, record}`: the same pose shape a
planned walk gives, so `drawFigure` draws either, and a kit never asks where a pose came from.

```js run
import assert from 'node:assert/strict';
import {fromPose} from 'footprint-storyreel/mocap';
import {walkSource} from 'footprint-storyreel/pose';

// One second of a person standing and raising the right arm, as a detector writes it (COCO-17 names, pixels).
const frames = Array.from({length: 30}, (_, k) => {
  const up = k / 29;
  return {nose: [640, 200, .99], left_shoulder: [610, 260, .99], right_shoulder: [670, 260, .99],
    left_elbow: [600, 330, .99], right_elbow: [690 + 30 * up, 330 - 90 * up, .99], left_wrist: [595, 395, .99], right_wrist: [700 + 60 * up, 395 - 200 * up, .99],
    left_hip: [620, 420, .99], right_hip: [660, 420, .99], left_knee: [618, 520, .99], right_knee: [662, 520, .99], left_ankle: [616, 620, .99], right_ankle: [664, 620, .99]};
});
const wave = await fromPose({scheme: 'coco-17', fps: 30, coordinates: 'pixels', width: 1280, height: 720, frames}, {x: 900, size: 420, start: 6});
const enter = walkSource({from: 100, to: 900, start: 0, size: 420});   // walks in first, then waves as the person did
const poseAt = t => (t < wave.start ? enter : wave).poseAt(t);          // in a kit: drawFigure(ctx, poseAt(t), {floor, size})
assert.ok(poseAt(6.9).joints.arms[1].shoulder > 1.5);                   // the raised arm, radians from hanging
assert.ok(Math.abs(poseAt(6).joints.arms[1].shoulder) < .3);            // … where it started, down
assert.deepEqual(wave.record.contacts.map(c => c.how), ['planted', 'planted']);   // each foot planted …
assert.match(wave.record.contacts[0].why, /^still long enough, on the floor/);    // … and why
```

## 3. What it decides, and why (read the record)

The conversion is a footprintjs flowchart: read the keypoints → fill gaps → smooth → normalise → joint angles →
plant feet → close loop → retime → motion source. `source.record` keeps each verdict with its evidence: `contacts`
(each still stretch of a foot: planted, aloft or passing), `gaps` (bridged, held or refused), `facing`, `loop`,
`timing`, and the `narrative`. A planted foot is locked to its spot, so it never slides.

A refusal names the joint, the frames and the fixes, and carries `error.record`:

- **A gap too long to fill** (more than `maxGap`, 0.2 s): trim the clip past it (`from`, `to`), film again with the
  whole body in view, or (for points the detector saw but was unsure of, as a side-on walker's far arm) lower
  `minConfidence` (0.5).
- **A loop that would jump** (`loop: true`): it loops only where the feet meet; the refusal gives the `from`–`to`
  that does, or play it once (`loop: false`).

`node node_modules/footprint-storyreel/examples/mocap/strip.mjs wave.pose.json strip.png` draws eight moments of a
clip on one picture and prints what was found: a quick look before the clip goes into a film.

What it cannot see: depth (the turn is read from how wide the shoulders look), and the foot's roll (the ankle stands
for the foot, so a copied foot's `angle` is 0).
