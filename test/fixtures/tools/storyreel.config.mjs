import {fileURLToPath} from 'node:url';
// A project for the tools' tests: one kit that draws words — two of them over each other from 2 s to 4 s.
// (Its spec's beats are resolved as a kit resolves its beats: what the anchors check reads. `ordered`: the beats must
// come in order, as many a kit's do — a stand-in time out of order stops its compile.)
const words = {name: 'words', story: {compile: (spec, clock) => {
  let last = -Infinity;
  for (const b of spec.beats ?? []) { const t = clock.at(b); if (spec.ordered && t < last) throw new Error('words: the beats come in order: give them as they are said'); last = t; }
  return {hang: 1, draw: (c, t) => {
  c.fillStyle = '#f3eee3'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#222'; c.font = '40px sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'left';
  c.fillText('TITLE', 700, 100);
  if (t >= 2 && t < 4) { c.fillText('Alpha', 400, 400); c.fillText('Beta', 430, 405); }
  c.fillRect(100 + t * 40, 600, 40, 40);
}}; }}};
// The story's beats, by flag (none by default).
// --anchors: beats and holds as an edit to the narration leaves them — one not said, one said twice, an nth past the
// last place, an unknown scene, a hold not said — beside two that are fine.
// --anchors stop: beats a kit must have in order, one not said standing out of order — the compile stops there, before
// the beats after it.
// --keyed: beats each said once — one near the end of scene one (in the handles before scene two), a phrase, a moment
// written in scene two's narration ({turn}, 0.2 s after it) and a last word; --keyed many: beats at 35 times in scene
// one, more than a still holds, the first time keyed twice — each 7 ms past a hundredth, as a voice's times are, so a
// time printed to the hundredth is not the beat's own.
const beatsOf = flags => (flags.anchors === 'stop' ? {ordered: true, beats: [['two', 'a little shorter'], ['one', 'a lot of words in it'], ['two', 'much shorter'], ['one', 'a']]}
  : flags.anchors && flags.anchors !== 'twice' ? {beats: [['one', 'a few words'], ['one', 'a lot of words'], ['one', 'a'], {scene: 'two', phrase: 'scene', nth: 2}, ['three', 'hello'], ['two', 'a little shorter']]}
  : flags.keyed === 'many' ? {beats: [['one', 'A first scene', .007], ...Array.from({length: 35}, (_, k) => ['one', 'A first', k / 10 + .007])]}
  : flags.keyed ? {beats: [['one', 'slowly'], ['two', 'a second scene'], ['two', '{turn}', .2], ['two', 'shorter']]} : {});
export default {
  film: flags => ({
    // --voiced: a voice (voiced/timings.json) that leaves out a silent scene between the two, as a voice does.
    storyboard: {title: 'Tools', scenes: [{id: 'one', title: 'One', narration: 'A first scene with a few words in it, said slowly.'},
      ...(flags.voiced ? [{id: 'quiet', silent: [['a pause', 1]]}] : []), {id: 'two', narration: `And a second scene, ${flags.keyed ? '{turn} ' : ''}a little shorter.`}]},
    ...(flags.voiced ? {narrationDir: fileURLToPath(new URL('./voiced/', import.meta.url))} : {}),
    recipe: {story: {kit: 'words', ...beatsOf(flags)}},
    kits: [words], layout: {format: 'landscape', captions: true}, out: flags.out ?? 'out',
    // --paced: a film with no voice, paced (a 2 s hold, a 1.5 s tail); --paced notail: the holds without their sceneTail.
    ...(flags.paced ? {pacing: {...(flags.paced === 'notail' ? {} : {sceneTail: 1.5}), holds: [{scene: 'one', after: 'a few words', seconds: 2}]}} : {}),
    // --anchors twice: a hold after a word said twice (it is timed by its end: the fixes add words before it).
    ...(flags.anchors === 'twice' ? {pacing: {sceneTail: 1, holds: [{scene: 'one', after: 'a', seconds: 1}]}}
      : flags.anchors ? {pacing: {sceneTail: 1, holds: [{scene: 'one', after: 'a few words', seconds: 1}, {scene: 'two', after: 'much shorter', seconds: 1}]}} : {}),
  }),
};
