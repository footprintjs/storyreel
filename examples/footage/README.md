# A local recorded interaction

WHY: the recording stays the same while its edit is small data: a held frame, a faster wait, a named camera move,
a circle around the full validation message, captions, and a fade between worlds. No model or voice service is used.
The local page includes an explicitly labeled moving playback marker so a held frame and a faster wait are visible.

1. With already-installed local Playwright and its browser/recording tools, explicitly run `capture.mjs`.
   Set `PLAYWRIGHT_MODULE` to that module's local entry point and, when needed, `BROWSER_EXECUTABLE` to its local browser.
   The script opens only the included `interface.html`. It records about two minutes and writes `capture.json` binding
   the file hash, viewport, and approximate observation times. These times are not frame-accurate. The library never
   runs that script on its own. No event-log ingestion or automatic click zooms are part of Phase 1.
2. Run `node examples/footage/make.mjs`. Installed FFmpeg and ffprobe must support `fd`; `FFMPEG_BIN` selects a local
   FFmpeg executable, and its neighbouring ffprobe is used. The script renders an 88-second silent example, then
   changes only the end card's ground color and renders again into the same piece store. It writes both recipes,
   timings, `out/proof.json`, making-of records, and caption files. Generated recordings/caches/outputs stay local.
3. Run `node src/cli.mjs breakdown examples/footage/out/edited/recorded-shot.mp4 --out examples/footage/out/breakdown`
   to inspect the actual rendered cuts and still spans. Breakdown is a visual measurement; a held, already-static
   source may make a longer still span than the remap's deliberate hold. Compare the record's explicit keys and the
   measured cuts rather than interpreting a static frame as proof of a particular remap rule.

The recording is a generic local fixture, not proof about a deployed application. The original source audio is never
copied into the film; later narration can use the normal `timings.json`/voice workflow. The default footage cache is
inside this project in `.storyreel-footage/`; a cache that a prior failure left incomplete must be removed explicitly
before preparing that same recording again.
