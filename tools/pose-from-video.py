#!/usr/bin/env python3
"""
pose-from-video.py: write StoryReel's keypoint JSON from a video, with MediaPipe Pose (Apache-2.0).

    pip install mediapipe                        # once, in a virtual environment of your own (it brings OpenCV;
                                                 # do not add opencv-python beside it: two cv2 packages break each other)
    python tools/pose-from-video.py walk.mp4 walk.pose.json [--model heavy] [--fps 30] [--min-visibility 0] [--logs]

The model. Heavy, unless you ask for another: on a clean side-on walk, full traded the left and right ankles in 15
of 78 frames and the copied feet slid 45–135 px while planted; heavy traded them in 1 and slid at most 19.5 px. On
first use it downloads MediaPipe's pose landmarker model (lite about 6 MB, full about 9 MB, heavy about 30 MB) from
Google's model storage, at a pinned version (MODELS), into ~/.cache/storyreel (or --models DIR),
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

Logs. MediaPipe writes INFO and WARNING lines to stderr on every run; they are filtered out as they come, and every
other line it writes (an error, a fatal one too) is passed on at once. --logs shows them all.

A damaged file. A decoder stops at a damaged stretch, so the clip it gives can end early with no error. The time the
frames read span is held against the video's real duration, from FFprobe (FFmpeg's, on PATH): the video stream's own,
or its Matroska DURATION tag; the file's duration only when the video is its one stream (beside audio it is usually
the audio's), else none. Frames that span it are whole, however many the file's header states (a trimmed file states
the frames its edit list hides). A file that states a duration or frames yet decodes not one is damaged at its start. Frames that end
early, or start late, are reported, and written into the JSON ("unread": {frames, why: "damaged", read, duration}) so
fromPose's record says so; frames spanning less than half of it are refused. Without FFprobe there is no duration to
hold them against: frames fewer than the header states are reported (why: "unknown"), never refused.

It writes {"scheme": "mediapipe-33", "fps", "coordinates": "normalised", "width", "height", "frames"}: per frame the
33 points as [x, y, confidence] (x and y shares of the width and the height), or null where nobody was found.
One person: the landmarker gives one pose a frame. Film from a steady phone, across the frame, the whole body in view.
"""
import argparse
import contextlib
import hashlib
import json
import os
import re
import subprocess
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
    p.add_argument('--model', choices=sorted(MODELS), default='heavy', help='lite is fastest, heavy is surest (default: heavy)')
    p.add_argument('--models', default=str(Path.home() / '.cache' / 'storyreel'), help='where the downloaded model is kept')
    p.add_argument('--fps', type=float, default=None, help='the steady rate to write (default: the video\'s own, as the file states it)')
    p.add_argument('--min-visibility', type=float, default=0.0, help='write points under this visibility as null (default 0: every point)')
    p.add_argument('--logs', action='store_true', help='show all of MediaPipe\'s log lines (INFO and WARNING are held back)')
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
    try:
        folder.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        sys.exit(f'pose-from-video: the models folder {folder} cannot be used ({e.strerror or e}): give --models a folder')
    path = folder / f'pose_landmarker_{name}.task'
    if not path.exists():
        print(f'pose-from-video: downloading the {name} pose model (first use) from {MODELS[name]} to {path}', file=sys.stderr)
        part = path.with_suffix('.part')
        try:
            urllib.request.urlretrieve(MODELS[name], part)
        except OSError as e:
            sys.exit(f'pose-from-video: the {name} model could not be downloaded from {MODELS[name]} ({e}): check the connection, or put the file at {path}')
        part.replace(path)
    try:
        found = sha256_of(path)
    except OSError as e:
        sys.exit(f'pose-from-video: the {name} model at {path} cannot be read ({e.strerror or e}): remove it to download it again, or give --models another folder')
    recorded = MODEL_SHA256[name]
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


# MediaPipe's own log lines that are not errors: absl INFO and WARNING, TensorFlow Lite's INFO.
NOISE = rb'^(I\d{4} |W\d{4} |INFO: )'
# The relay: a process of its own, so a line written just before a native abort still reaches the screen (a thread
# would die with the process before it read it). It reads stderr's lines as they come and passes on all but NOISE.
RELAY = ('import re, signal, sys\n'
         'signal.signal(signal.SIGINT, signal.SIG_IGN)\n'   # Ctrl-C stops the tool, not the relay: it drains to the end
         'for line in sys.stdin.buffer:\n'
         f'    if not re.match({NOISE!r}, line):\n'
         '        sys.stderr.buffer.write(line)\n'
         '        sys.stderr.buffer.flush()\n')


@contextlib.contextmanager
def quiet_logs(show):
    """
    MediaPipe's native stderr, filtered as it comes: every line that is not INFO or WARNING is passed on at once. With
    stderr closed (run with 2>&-) there is nothing to filter, and nothing is relayed.
    """
    if show or sys.stderr is None or not open_fd(2):
        yield
        return
    sys.stderr.flush()
    saved = os.dup(2)
    read_end, write_end = os.pipe()
    # (A session of its own: a terminal's Ctrl-C goes to the tool's process group, never the relay's, even while the
    # relay is still starting; it ends when the pipe closes, however the tool ends.)
    relay = subprocess.Popen([sys.executable, '-I', '-c', RELAY], stdin=read_end, stderr=saved, start_new_session=True)
    os.close(read_end)
    os.dup2(write_end, 2)
    os.close(write_end)
    try:
        yield
    finally:
        sys.stderr.flush()
        os.dup2(saved, 2)   # the pipe's last writer closes: the relay passes on what is left, and ends
        relay.wait()
        os.close(saved)


def open_fd(fd):
    """Whether a file descriptor is open."""
    try:
        os.fstat(fd)
        return True
    except OSError:
        return False


def clock_seconds(text):
    """A Matroska DURATION tag ('HH:MM:SS.nnnnnnnnn') in seconds; None when it is not one."""
    try:
        hours, minutes, seconds = str(text).strip().split(':')
        total = int(hours) * 3600 + int(minutes) * 60 + float(seconds)
        return total if total > 0 else None
    except ValueError:
        return None


def positive_seconds(text):
    """A duration FFprobe gives ('4.000000') in seconds; None when it is missing, not a number, or not above 0."""
    try:
        found = float(text)
        return found if found > 0 else None
    except (TypeError, ValueError):
        return None


def video_duration(info):
    """
    The video stream's own duration (seconds) in FFprobe's JSON for a file (every stream, its tags, the format): the
    stream's duration, or its Matroska DURATION tag (Matroska gives the stream no duration of its own). The format's
    duration counts only when the video is the file's one stream: beside an audio stream it is usually the audio's.
    Returns (duration, why): why is None when found, else 'no video duration'.
    """
    streams = info.get('streams') or []
    video = next((st for st in streams if st.get('codec_type') == 'video'), None)
    if video is not None:
        found = positive_seconds(video.get('duration'))
        tags = {str(k).upper(): v for k, v in (video.get('tags') or {}).items()}
        found = found or clock_seconds(tags.get('DURATION', ''))
        if found:
            return found, None
    if video is not None and len(streams) == 1:
        found = positive_seconds((info.get('format') or {}).get('duration'))
        if found:
            return found, None
    return None, 'no video duration'


def real_time(path):
    """
    The video stream's real duration (seconds), after any edit list, from FFprobe: (duration, why). why is None when
    found, 'not found' when FFprobe is not on PATH (or fails), 'no video duration' when it gives none for the video.
    """
    try:
        out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,duration:stream_tags:format=duration',
                              '-of', 'json', path], capture_output=True, text=True, timeout=60)
        info = json.loads(out.stdout or '{}')
    except (OSError, subprocess.SubprocessError, ValueError):
        return None, 'not found'
    return video_duration(info)


def too_few_frames(path, read, duration, stated):
    """
    The refusal for a video that gave fewer than 2 frames, or None. One that states a duration or frames, yet gave not
    one, is damaged at its start (a decoder cannot begin); otherwise it is too short.
    """
    if read >= 2:
        return None
    if read == 0 and (duration or (stated and stated > 0)):
        states = f'{duration:g} s of video' if duration else f'{int(round(stated))} frames'
        return (f'pose-from-video: {path} states {states}, and not one frame could be decoded: its first frames are likely damaged; '
                f'export or copy the video again')
    return f'pose-from-video: {path} gave {read} frame{"" if read == 1 else "s"}: give a longer video'


# Why a duration could not be had, as the warning says it.
UNKNOWN_BECAUSE = {'not found': 'FFprobe, not found, would tell which',
                   'no video duration': 'FFprobe gives no duration for the video stream to tell which'}


def unread_frames(times, stated, fps, duration):
    """
    Whether the frames read cover the video. times: each decoded frame's time (ms, from the stream's start); stated: the
    count its header states; fps: its rate; duration: its real duration (seconds, from FFprobe) or None. Returns
    (verdict, unread):
      'whole'   the frames span the real duration, within two frames — however many the header states (a trimmed
                file states the frames its edit list hides, and a variable rate's count is only an estimate)
      'short'   they start late or end early by more: damaged; unread = {frames, why: 'damaged', read: [from, to], duration}
      'refuse'  they span less than half of it
      'unsure'  no duration to hold them against, and the header states more frames than were read: unread = {frames,
                why: 'unknown'} — a trimmed file states more than it shows, a damaged one ends early; never refused
    """
    step = 1 / fps
    if duration:
        first, last = times[0] / 1000, times[-1] / 1000 + step
        gap = max(0.0, first) + max(0.0, duration - last)
        if gap <= 2 * step + 1e-6:
            return 'whole', None
        unread = {'frames': int(round(gap * fps)), 'why': 'damaged', 'read': [round(first, 3), round(last, 3)], 'duration': round(duration, 3)}
        return ('refuse' if last - first < duration / 2 else 'short'), unread
    missing = int(round(stated)) - len(times) if stated and stated > 0 else 0
    return ('whole', None) if missing <= 2 else ('unsure', {'frames': missing, 'why': 'unknown'})


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


@contextlib.contextmanager
def landmarker_from(vision, options, model):
    """The pose landmarker for a model file; one MediaPipe cannot load ends in a message, not a traceback."""
    try:
        landmarker = vision.PoseLandmarker.create_from_options(options)
    except (RuntimeError, ValueError, OSError) as e:
        sys.exit(f'pose-from-video: MediaPipe could not load the model {model} ({e}): remove it to download it again')
    with landmarker:
        yield landmarker


def main():
    args = read_args()
    if not args.logs:   # (builds that log through glog or TensorFlow honour these; the rest are held back by quiet_logs)
        os.environ.setdefault('GLOG_minloglevel', '2')
        os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '2')
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
    native = video.get(cv2.CAP_PROP_FPS)
    fps = args.fps or native
    if not fps or fps <= 0:
        sys.exit('pose-from-video: the video does not say its frame rate: give --fps')
    stated = video.get(cv2.CAP_PROP_FRAME_COUNT)
    model = model_file(args.model, args.models, args.trust_download)
    options = vision.PoseLandmarkerOptions(base_options=tasks.BaseOptions(model_asset_path=str(model)), running_mode=vision.RunningMode.VIDEO, num_poses=1)
    seen, size, last_ms = [], None, -1
    with quiet_logs(args.logs), landmarker_from(vision, options, model) as landmarker:
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
    duration, probed = real_time(args.video)
    too_few = too_few_frames(args.video, len(seen), duration, stated)
    if too_few:
        sys.exit(too_few)
    if seen[-1][0] <= seen[0][0]:   # a file whose frames carry no times: they are taken as steady at fps
        print('pose-from-video: the video\'s frames carry no times; they are taken as steady at the stated rate', file=sys.stderr)
        seen = [(i * 1000 / fps, points) for i, (_, points) in enumerate(seen)]
    verdict, unread = unread_frames([ms for ms, _ in seen], stated, native if native and native > 0 else fps, duration)
    if verdict == 'refuse':
        sys.exit(f'pose-from-video: {args.video} lasts {unread["duration"]} s, and the frames read span only {unread["read"][0]}–{unread["read"][1]} s '
                 f'({unread["frames"]} frames could not be read): the file is likely damaged; export or copy the video again')
    if verdict == 'short':
        print(f'pose-from-video: {args.video} lasts {unread["duration"]} s, and the frames read span {unread["read"][0]}–{unread["read"][1]} s: '
              f'{unread["frames"]} frames could not be read, so it is likely damaged; the JSON says so ("unread")', file=sys.stderr)
    if verdict == 'unsure':
        print(f'pose-from-video: {args.video} states {int(round(stated))} frames and {len(seen)} were read: a trimmed file states more than it '
              f'shows; a damaged one ends early ({UNKNOWN_BECAUSE[probed]}); the JSON says so ("unread")', file=sys.stderr)
    frames = resampled(seen, fps)
    doc = {'scheme': 'mediapipe-33', 'fps': fps, 'coordinates': 'normalised', 'width': size[0], 'height': size[1], 'frames': frames,
           **({'unread': unread} if unread else {})}
    Path(args.out).write_text(json.dumps(doc, separators=(',', ':'), allow_nan=False) + '\n')
    found = sum(f is not None for _, f in seen)
    print(f'pose-from-video: {len(seen)} frames read, a person in {found}; {len(frames)} written at a steady {fps:g} fps to {args.out}', file=sys.stderr)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:   # Ctrl-C: one line, not a traceback
        print('pose-from-video: stopped; nothing written', file=sys.stderr)
        sys.exit(130)
