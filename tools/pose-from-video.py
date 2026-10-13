#!/usr/bin/env python3
"""
pose-from-video.py: write StoryReel's keypoint JSON from a video, with MediaPipe Pose (Apache-2.0).

    pip install mediapipe opencv-python          # once, in a virtual environment of your own
    python tools/pose-from-video.py walk.mp4 walk.pose.json [--model full] [--fps 30]

On first use it downloads MediaPipe's pose landmarker model (lite about 6 MB, full about 9 MB, heavy about 30 MB)
from Google's model storage into ~/.cache/storyreel (or --models DIR), and reuses it after that. The video itself
never leaves the machine.

It writes {"scheme": "mediapipe-33", "fps", "coordinates": "normalised", "width", "height", "frames"}: per frame
the 33 points as [x, y, confidence] (x and y shares of the width and the height; confidence is MediaPipe's
visibility, 0..1), or null where nobody was found. footprint-storyreel/mocap reads it (fromPose), and trims it
there (from, to), so the whole video is written.

One person: the landmarker gives one pose a frame. Film from a steady phone, across the frame, the whole body in view.
"""
import argparse
import json
import sys
import urllib.request
from pathlib import Path

MODELS = {
    name: f'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_{name}/float16/latest/pose_landmarker_{name}.task'
    for name in ('lite', 'full', 'heavy')
}


def read_args():
    p = argparse.ArgumentParser(description="Write StoryReel's keypoint JSON (mediapipe-33) from a video.")
    p.add_argument('video', help='the video to read (mp4, mov, ...)')
    p.add_argument('out', help='the JSON to write')
    p.add_argument('--model', choices=sorted(MODELS), default='full', help='lite is fastest, heavy is surest (default: full)')
    p.add_argument('--models', default=str(Path.home() / '.cache' / 'storyreel'), help='where the downloaded model is kept')
    p.add_argument('--fps', type=float, default=None, help="the video's frames a second, when the file does not say")
    return p.parse_args()


def model_file(name, folder):
    """The model's file: downloaded on first use, then reused."""
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f'pose_landmarker_{name}.task'
    if not path.exists():
        print(f'pose-from-video: downloading the {name} pose model (first use) to {path}', file=sys.stderr)
        part = path.with_suffix('.part')
        urllib.request.urlretrieve(MODELS[name], part)
        part.replace(path)
    return path


def confidence(point):
    """MediaPipe's visibility (0..1); a point without one counts as unseen (0), so fromPose refuses rather than guesses."""
    v = point.visibility if point.visibility is not None else 0.0
    return round(max(0.0, min(1.0, v)), 4)


def points_of(result):
    """One frame's 33 points, or None where nobody was found."""
    if not result.pose_landmarks:
        return None
    return [[round(p.x, 6), round(p.y, 6), confidence(p)] for p in result.pose_landmarks[0]]


def main():
    args = read_args()
    try:
        import cv2
        import mediapipe as mp
        from mediapipe.tasks import python as tasks
        from mediapipe.tasks.python import vision
    except ImportError:
        sys.exit('pose-from-video needs MediaPipe and OpenCV: pip install mediapipe opencv-python')
    video = cv2.VideoCapture(args.video)
    if not video.isOpened():
        sys.exit(f'pose-from-video: cannot open {args.video}: give a video file (mp4, mov, ...)')
    fps = args.fps or video.get(cv2.CAP_PROP_FPS)
    if not fps or fps <= 0:
        sys.exit('pose-from-video: the video does not say its frame rate: give --fps')
    options = vision.PoseLandmarkerOptions(
        base_options=tasks.BaseOptions(model_asset_path=str(model_file(args.model, args.models))),
        running_mode=vision.RunningMode.VIDEO, num_poses=1)
    frames, size = [], None
    with vision.PoseLandmarker.create_from_options(options) as landmarker:
        while True:
            ok, bgr = video.read()
            if not ok:
                break
            size = size or bgr.shape[1::-1]   # (width, height) as decoded: a phone's rotation is already applied
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
            frames.append(points_of(landmarker.detect_for_video(image, round(len(frames) * 1000 / fps))))
    video.release()
    if len(frames) < 2:
        sys.exit(f'pose-from-video: {args.video} gave {len(frames)} frame: give a longer video')
    doc = {'scheme': 'mediapipe-33', 'fps': fps, 'coordinates': 'normalised', 'width': size[0], 'height': size[1], 'frames': frames}
    Path(args.out).write_text(json.dumps(doc, separators=(',', ':'), allow_nan=False) + '\n')
    found = sum(f is not None for f in frames)
    print(f'pose-from-video: {len(frames)} frames at {fps:g} fps, a person in {found}; wrote {args.out}', file=sys.stderr)


if __name__ == '__main__':
    main()
