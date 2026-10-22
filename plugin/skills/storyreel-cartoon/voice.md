# A voice: word times, pacing, numbers

Pictures follow the words, not the clock: every beat names a phrase, so when the voice is recorded again (slower, or
in another language) the film follows, and a phrase that is not in the script refuses the recipe instead of
drifting. What a film needs from a voice is **when each word is said**.

## Silent, or a first draft: even timings

`evenTimings(storyboard)` spaces the words evenly (0.38 s a word) and times a silent scene's directions by their
seconds. A silent film uses it for good; a voiced film uses it until the voice exists, and nothing else changes when
the voice arrives. `makeFilm({…, timings: evenTimings(storyboard)})`.

## A recorded voice

Any text-to-speech or recording works, as long as each word gets its time (forced alignment gives them for any
voice). The voice folder holds each scene's audio and a `timings.json` beside it: one entry per spoken scene,
`{id, duration, words: [{text, start, end}], alignment: {status: 'available'}, audio}` (seconds from the scene's
start; `audio` is a file inside the folder). Pass the folder: `makeFilm({…, narrationDir: 'voice'})` and, for the
command line, `narrationDir` in `storyreel.config.mjs`'s `film()`. Voice what `spokenText(scene)` returns, not the
narration as written (they differ where a number is said in words, and where the narration has marks: below). A
silent scene needs no entry: its directions are timed for you.

`makeFilm` never writes into the voice folder: it paces a copy and leaves it as `<out folder>/narration`, so an out
folder that overlaps the voice folder is refused. `footprint-narration/voice` (installed with StoryReel) is a
voice port with a clip cache keyed by what is said; any engine fits it.

## Pacing: room for the pictures to land

`pacing: {voiceSpeed, sceneTail, holds: [{scene, after, seconds}], tails?}` inserts silence after a phrase so a
drawing can land, and at each scene's end. `voiceSpeed` is 0.8–1.1 (1 for a silent cut), `sceneTail` 0.3–3 s, a hold
0.1–6 s, `tails: {scene: seconds}` overrides one scene's tail. With a voice the silence is cut into the audio; in a
silent cut `paceTimings` shifts the word times the same way, and a film with no voice at all is paced too: `makeFilm`
paces the `timings` it is given, and the CLI paces its even timings by the config's `pacing`. `sceneTail` and `holds`
are required (`holds: []` for none). A silent scene takes no hold: lengthen its direction.

```js run
import assert from 'node:assert/strict';
import {evenTimings, paceTimings, makeClock, spokenText, unsaidNumbers} from 'footprint-storyreel';

const storyboard = {title: 'Frames', scenes: [
  {id: 'open', silent: [['the screen lights up', 2]]},
  {id: 'frame', narration: 'One frame takes 16.67 ms at 60 Hz. That is fast.',
   say: [['16.67 ms', 'sixteen point six seven milliseconds'], ['60 Hz', 'sixty hertz']]},
  {id: 'more', narration: 'A film has 24 frames a second.'}]};
assert.equal(spokenText(storyboard.scenes[1]),     // what the voice must say: the numbers in words
  'One frame takes sixteen point six seven milliseconds at sixty hertz. That is fast.');
assert.deepEqual(unsaidNumbers(storyboard), [{scene: 'more', text: '24'}]);   // digits with no say slot yet
const even = evenTimings(storyboard);              // the timings.json shape a voice folder holds
assert.deepEqual(Object.keys(even.scenes[1]), ['id', 'duration', 'words', 'alignment']);
assert.equal(even.scenes[0].duration, 2.8);        // a silent scene: its directions' seconds, plus the 0.8 s tail
const paced = paceTimings(storyboard, even, {voiceSpeed: 1, sceneTail: .8, holds: [{scene: 'frame', after: 'at 60 Hz', seconds: 1.5}]});
const at = (timings, phrase) => makeClock(storyboard, timings).at(['frame', phrase]);
assert.equal(+(at(paced, 'That is fast') - at(even, 'That is fast')).toFixed(3), 1.5);   // the hold moved it 1.5 s later
```

## One script: moments and speakers

A beat keyed to a phrase breaks when its line is reworded. For new work, write the moments into the narration: marks
are never spoken and never shown, and a rewording keeps each on its word. `{name}` is a moment: when the scene's next
spoken word starts (with none after it, when its last word ends). A beat names it as a phrase (`plus` as usual; no
`nth` or `edge`), and a hold puts its silence in the pause at the mark. `{@who}` gives the quoted line right after it
a speaker. Anything else in braces refuses, naming the fix; so does a mark in a silent scene. A voice step in any
language reads `npx storyreel script`, the spoken scenes as JSON (what is said, who says each line, each moment), and
never copies the grammar.

```js run
import assert from 'node:assert/strict';
import {said, momentsOf, linesOf, evenTimings, paceTimings, makeClock} from 'footprint-storyreel';

const storyboard = {title: 'Tens', scenes: [{id: 'today', narration: "Ten ones {dots} make a ten {hop}. Mom walks in. {@mom}'What are you two up to?'"}]};
const {narration} = storyboard.scenes[0];
assert.equal(said(narration), "Ten ones make a ten. Mom walks in. 'What are you two up to?'");   // voiced and captioned
assert.deepEqual(momentsOf(narration), [{name: 'dots', offset: 9}, {name: 'hop', offset: 21}]);   // where in what is said each next word starts: "make", "Mom"
assert.deepEqual(linesOf(narration), [{by: 'mom', say: 'What are you two up to?', offset: 36}]);
const even = evenTimings(storyboard), clock = makeClock(storyboard, even);
assert.equal(clock.at(['today', '{dots}']), clock.at(['today', 'make']));                // the moment is the word after the mark
const paced = paceTimings(storyboard, even, {voiceSpeed: 1, sceneTail: .8, holds: [{scene: 'today', after: '{dots}', seconds: 1.5}]});
assert.equal(+(makeClock(storyboard, paced).at(['today', '{dots}']) - clock.at(['today', '{dots}'])).toFixed(3), 1.5);   // the hold is at the mark
```

## Numbers: shown in digits, said in words

A voice drops or garbles digits. A **say slot** writes a number once for each side: `"say": [["16.67 ms", "sixteen
point six seven milliseconds"]]`; the captions show `16.67 ms`, the voice says the words, and a beat may name the
phrase either way. Each shown text must appear in the narration, in order. `unsaidNumbers(storyboard)` lists the
digits left without a slot, so a voice step can refuse them before it speaks.

## Listening back

Forced alignment places every script word somewhere, even one the voice dropped. A voice tool's word check
(`word-check.json` in the voice folder) lists the words not heard; `makeFilm` copies it into `making-of.json`
(`voice`), and `voiceCheck: 'refuse'` refuses a film with a word not heard.

## Who speaks

A scene may name its speaker (`"speaker": "robot"`), and a word in `timings.json` its own (`"speaker": "amaira"`).
A kit asks `clock.speaking(t)` (who is saying a word now), `clock.gaze(t, who)` (where a listener looks) and
`footprint-storyreel/acting` · `mouthAt` (how open a mouth is: only while its owner talks). A kit that draws mouths
says so with `mouthsAt(t)`, and the check on the finished file holds lip sync to it.

## One film, another language or place

`cast: {hero: {name: 'Amaira'}}` turns `{{hero}}` in the storyboard, the recipe and the strings into the name before
anything reads it (voice the storyboard after `withCast`). On-screen words can come from a string table:
`{"$string": "key"}` in the recipe and `makeFilm({…, strings, lang})`. Give the film its language (`lang`) so its
numbers are read as that language writes them ([checks.md](checks.md#every-number-has-a-source)).
