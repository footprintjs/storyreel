# Music: cut on the beat

A cut that lands just off the beat feels late even when nobody can say why, so an editor cuts on the beat. But an
automatic beat grid can be half or double the real tempo, so StoryReel measures the song, says how sure it is and
what else the tempo could be, and moves the film only where you ask, never further than you allow. A film without
`music` renders exactly as before.

## Read the song first

```sh
npx storyreel beats music/theme.mp3
npx storyreel beats music/theme.mp3 --bpm 95
```

`beats` needs no project (and FFmpeg to read the song). It prints the verdict, the candidate tempi with their scores,
and every level of the beat it tried with the tests each failed. The verdict is `tempo-measured`, `tempo-faster`,
`tempo-slower` (sure), `tempo-close` (unsure: more than one tempo fits), or `tempo-given`. `--bpm 95` checks the
tempo you hear: the map is then sure. A wrong option exits 2, a song it cannot read exits 1.

## Settle an unsure tempo

An unsure map lets a film cut only on the beats **every** candidate tempo shares, and only where the song actually
hits: few cuts snap (about 4% in the measured corpus, against 45% for a sure map). The fix is one number: listen,
pick the tempo you hear from the candidates (`likelyTempi(map)` lists those scoring 0.5 or more), and give it as
`music.bpm`. Do not guess a tempo for the person: when nobody can listen, keep the unsure map, which cuts only where
every candidate agrees and the song hits. The thresholds were calibrated on synthetic songs; on a real mix, read the
verdict and the levels.

## In code

`footprint-storyreel/beats` · `beatMap(file, {bpm?, drop?, range?, ffmpeg?})` reads a song file;
`beatMapOf(samples, 22050)` maps mono samples already in hand. The map: `bpm`, `beats` (seconds), `bars`, `drop` (or
null), `confidence`, `verdict`, `sure`, `alternatives` (each tempo with its grid), `levels` (each level tried and why
it is not sure), `record` (the flowchart's narrative, every verdict with its `decide()` evidence), and
`nearestBeat(t)`, `nextBeat(t)`, `onBeat(t, tolerance)`. `safeBeats(map)` is what a film may cut on.

```js run
import {beatMapOf, safeBeats, likelyTempi, beatMapText} from 'footprint-storyreel/beats';

// Twelve seconds of a kick drum at 120 BPM, made sample by sample (a song file goes to beatMap(file) instead).
const rate = 22050, song = new Float32Array(rate * 12);
for (let beat = 0; beat < 24; beat++) {
  const at = Math.round(beat * .5 * rate);
  for (let i = 0; i < rate * .12; i++) song[at + i] += Math.sin(2 * Math.PI * 60 * i / rate) * Math.exp(-i / (rate * .03)) + (i < 40 ? .25 * Math.sin(i * 12.9898) : 0);
}
const map = await beatMapOf(song, rate);
console.log(map.bpm, map.verdict, map.sure);           // 120 'tempo-measured' true
console.log(safeBeats(map).grid, likelyTempi(map));    // 'every beat' [ 120 ]
console.log(beatMapText(map, {source: 'kick.wav'}));   // what `npx storyreel beats` prints
```

A wrong option throws with `code: 'BEAT_OPTIONS'` (fix the call); an error about the sound carries no code (fix the
file). A sound with no steady beat (speech, noise, music with a free tempo, a held tone or pad) is refused, saying
which, unless you give `bpm`. A beat counts only where music is playing (a heard hit within one beat), so no cut snaps
onto a beat in a silent gap, before the music starts or after it stops. A long ambient intro can leave a clear song
unsure: give `bpm`, or trim the intro.

## Into a film

```js
await makeFilm({storyboard, recipe, kits, narrationDir: 'voice', pacing, out: 'out/film.mp4',
  music: {file: 'music/theme.mp3', gain: .2, bpm: 95,       // bpm: the tempo you settled on (left out: measured)
    snap: {tolerance: .15},                                 // scene starts onto a beat, each scene's length changed by at most 0.15 s
    dropOn: ['story', 'came home']},                        // the song starts so its drop lands on this phrase
  render: {soundAt: 'peak'}});                              // each sound effect's loudest moment on its moment
```

- **Snapping** moves each scene start (a cut, and the transition on it) to the nearest beat it may cut on, within
  `tolerance`, by changing only the silence after a scene's last word. No word, drawing or caption moves inside its
  scene, and no scene gets shorter than its last word or keyed moment. A cut with no beat near enough stays, saying why.
- **The drop.** `dropOn` starts the song so its drop lands on that phrase; a song with no drop the map can find
  refuses with the fix (`music.drop`, the second it drops).
- **The mix.** The song plays under the voice at `gain` (0..1), fading over the last `fadeOut` seconds (1.5); a song
  less than 10 LU under the voice is a listening finding. `music` takes `file`, `gain`, `snap`, `dropOn`, `bpm`,
  `drop`, `fadeOut`; anything else refuses.
- **The record.** `making-of.json` gets `music`: the beat map (tempo, verdict, the levels tried), the grid the cuts
  used, every cut's verdict, and `findings`: an unsure map that snapped says which tempi to choose from.
- `peakOf(file)` gives a sound file's loudest moment, in seconds from its start.
