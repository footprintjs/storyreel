#!/usr/bin/env python3
"""
pose-from-video.py: write StoryReel's keypoint JSON from a video, with MediaPipe Pose (Apache-2.0).

    pip install mediapipe                        # once, in a virtual environment of your own (it brings OpenCV;
                                                 # do not add opencv-python beside it: two cv2 packages break each other)
    python tools/pose-from-video.py walk.mp4 walk.pose.json [--model full] [--fps 30] [--min-visibility 0]

The model. On first use it downloads MediaPipe's pose landmarker model (lite about 6 MB, full about 9 MB, heavy
about 30 MB) from Google's model storage, at a pinned version (MODELS), into ~/.cache/storyreel (or --models DIR),
and checks its SHA-256 against MODEL_SHA256 before using it. A model whose hash is not recorded yet is refused
unless you pass --trust-download: then its hash is printed, for you to record in MODEL_SHA256 so every later
download is checked. The video itself never leaves the machine.

Time. A phone films at a variable frame rate, so each frame's own timestamp is read (CAP_PROP_POS_MSEC) and the
points are resampled onto a steady --fps (default: the video's own rate, as the file states it), the rate written
in the JSON. A moment between two frames takes the points of both, drawn straight between them; a moment beside a
frame where nobody was found takes the nearer frame (null when that is the empty one).

Visibility. Every point is written with MediaPipe's visibility as its confidence, so footprint-storyreel/mocap
(fromPose, minConfidence) decides what is seen, and its gap rules decide what is filled. A side-on walker's far
limbs often read under 0.5: give fromPose a lower minConfidence for such a clip. --min-visibility V writes points
under V as null here instead (0, the default, writes every point).

It writes {"scheme": "mediapipe-33", "fps", "coordinates": "normalised", "width", "height", "frames"}: per frame the
33 points as [x, y, confidence] (x and y shares of the width and the height), or null where nobody was found.
One person: the landmarker gives one pose a frame. Film from a steady phone, across the frame, the whole body in view.
"""
import argparse
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

# The pose landmarker models, at a pinned version (not 'latest': a model that changes under a film changes its motion).
MODELS = {
    name: f'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_{name}/float16/1/pose_landmarker_{name}.task'
    for name in ('lite', 'full', 'heavy')
}
# Each model's SHA-256, recorded from the pinned download on 2026-10-13 (--trust-download prints a new one to record).
MODEL_SHA256 = {
    'lite': '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a',
    'full': '5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1',
    'heavy': '64437af838a65d18e5ba7a0d39b465540069bc8aae8308de3e318aad31fcbc7b',
}


def read_args():
    p = argparse.ArgumentParser(description="Write StoryReel's keypoint JSON (mediapipe-33) from a video.")
    p.add_argument('video', help='the video to read (mp4, mov, ...)')
    p.add_argument('out', help='the JSON to write')
    p.add_argument('--model', choices=sorted(MODELS), default='full', help='lite is fastest, heavy is surest (default: full)')
    p.add_argument('--models', default=str(Path.home() / '.cache' / 'storyreel'), help='where the downloaded model is kept')
    p.add_argument('--fps', type=float, default=None, help='the steady rate to write (default: the video\'s own, as the file states it)')
    p.add_argument('--min-visibility', type=float, default=0.0, help='write points under this visibility as null (default 0: every point)')
    p.add_argument('--trust-download', action='store_true', help='use a model whose SHA-256 is not recorded yet, and print it to record')
    return p.parse_args()


def sha256_of(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def model_file(name, folder, trust):
    """The model's file: downloaded on first use, its SHA-256 checked against MODEL_SHA256 every time it is used."""
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f'pose_landmarker_{name}.task'
    if not path.exists():
        print(f'pose-from-video: downloading the {name} pose model (first use) from {MODELS[name]} to {path}', file=sys.stderr)
        part = path.with_suffix('.part')
        urllib.request.urlretrieve(MODELS[name], part)
        part.replace(path)
    found, recorded = sha256_of(path), MODEL_SHA256[name]
    if recorded is None:
        if not trust:
            sys.exit(f'pose-from-video: the {name} model\'s SHA-256 is not recorded yet ({path} is {found}): check it, then run again with '
                     f'--trust-download, and record it in MODEL_SHA256 so every later download is checked')
        print(f'pose-from-video: the {name} model\'s SHA-256 is {found}: record it in MODEL_SHA256', file=sys.stderr)
    elif found != recorded:
        path.unlink()
        sys.exit(f'pose-from-video: the {name} model downloaded is not the one recorded (SHA-256 {found}, not {recorded}); it was removed: '
                 f'check MODELS and MODEL_SHA256, then run again')
    return path


def points_of(result, floor):
    """One frame's 33 points as [x, y, visibility] (under `floor`: null), or None where nobody was found."""
    if not result.pose_landmarks:
        return None
    out = []
    for p in result.pose_landmarks[0]:
        v = round(max(0.0, min(1.0, p.visibility if p.visibility is not None else 0.0)), 4)
        out.append(None if v < floor else [round(p.x, 6), round(p.y, 6), v])
    return out


def between(a, b, u):
    """Two frames' points drawn straight between, u of the way (0..1): a point either frame lacks takes the nearer."""
    if a is None or b is None:
        return a if u < 0.5 else b
    out = []
    for p, q in zip(a, b):
        if p is None or q is None:
            out.append(p if u < 0.5 else q)
        else:
            out.append([round(p[0] + (q[0] - p[0]) * u, 6), round(p[1] + (q[1] - p[1]) * u, 6), round(p[2] + (q[2] - p[2]) * u, 4)])
    return out


def resampled(seen, fps):
    """The frames as seen ([(ms, points)], in time order) at a steady fps, from the first frame's time to the last's."""
    t0, last = seen[0][0], seen[-1][0]
    frames, i = [], 0
    for k in range(int((last - t0) * fps / 1000 + 1e-6) + 1):
        t = t0 + k * 1000 / fps
        while i + 2 < len(seen) and seen[i + 1][0] <= t:
            i += 1
        (ta, a), (tb, b) = seen[i], seen[min(i + 1, len(seen) - 1)]
        frames.append(a if tb <= ta else between(a, b, max(0.0, min(1.0, (t - ta) / (tb - ta)))))
    return frames


def main():
    args = read_args()
    try:
        import cv2
        import mediapipe as mp
        from mediapipe.tasks import python as tasks
        from mediapipe.tasks.python import vision
    except ImportError:
        sys.exit('pose-from-video needs MediaPipe (it brings OpenCV): pip install mediapipe')
    video = cv2.VideoCapture(args.video)
    if not video.isOpened():
        sys.exit(f'pose-from-video: cannot open {args.video}: give a video file (mp4, mov, ...)')
    fps = args.fps or video.get(cv2.CAP_PROP_FPS)
    if not fps or fps <= 0:
        sys.exit('pose-from-video: the video does not say its frame rate: give --fps')
    options = vision.PoseLandmarkerOptions(
        base_options=tasks.BaseOptions(model_asset_path=str(model_file(args.model, args.models, args.trust_download))),
        running_mode=vision.RunningMode.VIDEO, num_poses=1)
    seen, size, last_ms = [], None, -1
    with vision.PoseLandmarker.create_from_options(options) as landmarker:
        while True:
            ok, bgr = video.read()
            if not ok:
                break
            ms = max(seen[-1][0] if seen else 0.0, video.get(cv2.CAP_PROP_POS_MSEC))   # this frame's own time (a phone's rate varies), never back
            stamp = max(last_ms + 1, int(round(ms)))  # the landmarker needs times that only go forward
            last_ms = stamp
            size = size or bgr.shape[1::-1]   # (width, height) as decoded: a phone's rotation is already applied
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
            seen.append((ms, points_of(landmarker.detect_for_video(image, stamp), args.min_visibility)))
    video.release()
    if len(seen) < 2:
        sys.exit(f'pose-from-video: {args.video} gave {len(seen)} frame: give a longer video')
    if seen[-1][0] <= seen[0][0]:   # a file whose frames carry no times: they are taken as steady at fps
        print('pose-from-video: the video\'s frames carry no times; they are taken as steady at the stated rate', file=sys.stderr)
        seen = [(i * 1000 / fps, points) for i, (_, points) in enumerate(seen)]
    frames = resampled(seen, fps)
    doc = {'scheme': 'mediapipe-33', 'fps': fps, 'coordinates': 'normalised', 'width': size[0], 'height': size[1], 'frames': frames}
    Path(args.out).write_text(json.dumps(doc, separators=(',', ':'), allow_nan=False) + '\n')
    found = sum(f is not None for _, f in seen)
    print(f'pose-from-video: {len(seen)} frames read, a person in {found}; {len(frames)} written at a steady {fps:g} fps to {args.out}', file=sys.stderr)


if __name__ == '__main__':
    main()
