# Camera moves by name

Directors name camera work (*dolly in on the shepherd*, *a slow orbit*, *rack focus to the hills*) and the name gets
the effect. A recipe does the same in its top-level `camera` list: each move by name, on a phrase. The film places
every move, checks it against the rest of the film before anything renders, and records how each one played.

```json
"camera": [
  {"move": "dolly-in", "at": ["farm", "shepherd"], "until": ["farm", "his sheep"], "on": "shepherd", "amount": 1.4},
  {"move": "orbit", "at": ["farm", "at the gate"], "seconds": 2, "amount": 140},
  {"move": "rack-focus", "at": ["farm", "the hills"], "from": "shepherd", "on": "hills"},
  {"move": "dutch", "at": ["turn", "something is wrong"], "amount": 6, "feel": "heavy"}
]
```

- `at`: a phrase (or seconds on the film clock). The end: `until` (a phrase or seconds), or `seconds`, or the
  move's own length. List the moves in the order they start (out of order refuses).
- `ease`: a name from the ease table or `"cubic-bezier(…)"` (`inOut` by default); or `feel`: a spring (`heavy`,
  `snappy`, `default`, `playful`, or `{k, d}`). Time and texture moves take neither.
- `on`: a thing the kit names in `regionsAt` (`name`). A name nothing has refuses, listing the names there.

## The moves

| family | move | what it does | settings (default) | length |
|---|---|---|---|---|
| view | `pan` | looks across (at most 600 px from the middle) | `amount`: px, + right (240) | 2 s |
| | `tilt` | looks up or down (at most 337 px) | `amount`: px, + down (140) | 2 s |
| | `dolly-in` | moves closer, toward a named thing as far as the edges allow | `amount`: times closer (1.3), `on` | 2 s |
| | `dolly-out` | moves back, never past the whole frame | `amount` (1.3), `on` | 2 s |
| | `crane` | rises (or descends) and comes a little closer | `amount`: px, − descends (120), `scale` (1.12) | 2.5 s |
| | `dutch` | rolls the frame to an angle; 0 levels it | `amount`: degrees (8) | 1.5 s |
| follow | `truck` | follows a named thing sideways | `on` (required) | 2 s |
| | `track` | follows a named thing wherever it goes | `on` (required) | 2 s |
| depth | `orbit` | circles the subject: far layers slide one way, near ones the other | `amount`: px (120) | 3 s |
| | `dolly-zoom` | the subject keeps its size while the background grows | `amount` (0.35) | 3 s |
| | `rack-focus` | pulls focus from one layer to another | `on` (required), `from`, `amount`: px of blur (8) | 1.5 s |
| texture | `handheld` | a small, slow drift, the same every time for its `seed` | `amount`: px (6), `seed` (1) | to the film's end |
| time | `speed-ramp` | runs slow in the middle and catches up either side | `amount`: speed half way (0.3) | 2 s |
| | `freeze` | holds the picture while the voice goes on, then jumps to it | – | 1.5 s |

The catalog is `footprint-storyreel/camera` · `CAMERA_MOVES` (also on the main entry), and a whip pan is not in it:
it is a transition between shots (`"enter": "whip"`). A dolly aims where its thing is when the move starts and stays
on that place; a thing that walks on is followed with `truck` or `track`.

## The rules, and why

- **The frame stays covered.** There is nothing past the picture's edge, so a pan, a dutch or a follow scales the
  picture up just enough (`covers` in the record), and any move that would need more than ×4<!-- MAX_ZOOM --> refuses.
- **One picture.** A move stays inside one shot: one that runs across an entrance, a hand-over or a cut refuses.
  Its framing holds until the picture changes, then eases back to the whole frame, so every new shot opens wide.
- **One camera.** Two moves cannot move the same thing at once (a pan and a dutch may share a moment; a dolly-in and
  a dolly-out may not), and moves take turns with a moving focus, a director's push note, a spotlight and a kit's own
  camera (`cameraMoves`). The refusal names both and the times:
  `camera[1] (dolly-out) starts at 1.44 s while camera[0] (dolly-in) still moves the camera's left–right (until 3.68 s)`.

## Depth layers

`orbit`, `dolly-zoom` and `rack-focus` move a world's layers by their depth, so the kit gives them:
`layers: [{name, depth}]` back to front, and `drawLayer(ctx, t, name, spot)` drawing one layer on a clear sheet. Depth
is distance from the camera as a multiple of the subject's: 1 is the subject's plane, 6 far behind, 0.6 in front. A
depth move on a kit with no layers refuses and says what to add.

```js run
import assert from 'node:assert/strict';
import {compileFilm, evenTimings} from 'footprint-storyreel';

const paint = {hills: c => { c.fillStyle = '#9cc29a'; c.fillRect(0, 0, 1600, 900); },
  shepherd: c => { c.fillStyle = '#8a5a2b'; c.fillRect(700, 380, 200, 420); },
  gate: c => { c.fillStyle = '#5b4636'; for (let x = 1100; x < 1560; x += 70) c.fillRect(x, 560, 26, 340); }};
const farm = {name: 'farm', story: {compile: () => ({hang: 1,
  draw: c => Object.values(paint).forEach(layer => layer(c)),
  layers: [{name: 'hills', depth: 6}, {name: 'shepherd', depth: 1}, {name: 'gate', depth: .6}],   // back to front
  drawLayer: (c, t, name) => paint[name](c),
  regionsAt: () => [{box: [700, 380, 900, 800], path: 'shepherd', label: 'the shepherd', name: 'shepherd'}]})}};

const storyboard = {scenes: [{id: 'farm', narration: 'The shepherd counts his sheep at the gate, and the hills go quiet behind him.'}]};
const recipe = {story: {kit: 'farm'}, camera: [
  {move: 'dolly-in', at: ['farm', 'shepherd'], until: ['farm', 'his sheep'], on: 'shepherd', amount: 1.4},
  {move: 'orbit', at: ['farm', 'at the gate'], seconds: 2, amount: 140},
  {move: 'rack-focus', at: ['farm', 'the hills'], from: 'shepherd', on: 'hills'}]};
const played = async reducedMotion => {
  const film = await compileFilm({storyboard, timings: evenTimings(storyboard), recipe, kits: [farm], reducedMotion});
  return [film.camera.motion, ...film.camera.moves.map(m => `${m.move} ${m.at}–${m.until} s: ${m.played}`)];
};
assert.deepEqual(await played(false), ['moves', 'dolly-in 0.68–1.44 s: move', 'orbit 2.2–4.2 s: move', 'rack-focus 3.72–5.22 s: move']);
assert.deepEqual(await played(true), ['cuts', 'dolly-in 0.68–1.44 s: cut', 'orbit 2.2–4.2 s: cut', 'rack-focus 3.72–5.22 s: cut']);
// One camera: a dolly-out while the dolly-in still moves refuses, naming both and the times.
const both = {story: {kit: 'farm'}, camera: [{move: 'dolly-in', at: ['farm', 'shepherd'], seconds: 3, on: 'shepherd'}, {move: 'dolly-out', at: ['farm', 'his sheep']}]};
await assert.rejects(compileFilm({storyboard, timings: evenTimings(storyboard), recipe: both, kits: [farm]}),
  {message: /^camera\[1\] \(dolly-out\) starts at 1\.44 s while camera\[0\] \(dolly-in\) still moves the camera's left–right \(until 3\.68 s\)/});
```

## Reduced motion

`compileFilm({…, reducedMotion: true})` (and `makeFilm`) is the version for a viewer who asks for less motion: each
move cuts to its end framing on its first moment, except a `truck` or a `track`, which cuts at its last moment (to
where its thing then is); the return over a change of picture cuts at its start; handheld is off; a speed ramp plays
in step with the voice; a freeze is kept. It changes only the recipe's camera moves (transitions and what kits animate
play as written). The same recipes are accepted and refused either way. When the recipe has camera moves, the film's
inputs carry `reducedMotion: true`, so an approval of the moving film does not cover it; a film without them is the
same either way.

## The record

The plan is a footprintjs flowchart, so `film.camera` says how the film was played and why: `motion` (`moves` or
`cuts`), `decision` (the reduced-motion rule and its evidence), and each move as placed: `at`, `until`, its settings,
`played` (`move`, `cut`, `off` or `kept`), `covers` (when it scaled the picture up), `ends` (the framing it resolved to, `{x, y, z, r}`).
`film.cameraAt(t)` is the framing at any second. `making-of.json` keeps `camera`.

## Other camera words

- **Director's notes** (`"notes"`, each with its words and one camera word): `{"note": "the zooms feel rushed",
  "speed": 0.7}`, `{"note": "hard cut into the loop", "cut": "loop"}`, and a push framing a named thing as a crew
  does, `{"note": "close on her", "push": {"on": "walker", "size": "close", "from": [scene, phrase], "to": [scene, phrase]}}`
  (`medium`, `close` or `insert`). A `speed` note needs every world's kit to follow it (`motion: ['cameraSpeed']`
  beside its `compile`); one that does not refuses the note.
- **Focus** (`"focus": {"strategy": "camera", "keys": [{"at": [scene, phrase], "on": "walker", "size": "medium"}]}`)
  moves the camera to whatever the voice is about; `spotlight`, `dim` and `none` show it other ways.
- **The automatic director** (`"director": "on"`) proposes the framing and the moods from the script itself, so you
  write only the exceptions — restrained: the establishing shot first, a close-up for the first question or exclamation
  of a turn (two a scene: `closeUps`), a two-shot when the other answers, an insert on a thing the narrator names
  (`aliases` map the narration's words to region names). A kit takes the keys by saying where (`direction: {camera:
  'camera', acting: 'acting', moods, rest, groups}` beside its `compile`); otherwise they land in the film's `focus`. Keys you
  write always win; `film.director` lists every proposal with its rule and why it did or did not land. Rules with
  words are data you pass (`strategies: {director: {en: table}}`); `footprint-storyreel/director` · `direct` shows the
  proposals without compiling.
- **Transitions** between shots: a stage's `enter` (see [kits.md](kits.md#three-ways-a-kit-draws)).
