// A project for the tools' tests: one kit that draws words — two of them over each other from 2 s to 4 s.
// (Its spec's beats are resolved as a kit resolves its beats: what the anchors check reads.)
const words = {name: 'words', story: {compile: (spec, clock) => { for (const b of spec.beats ?? []) clock.at(b); return {hang: 1, draw: (c, t) => {
  c.fillStyle = '#f3eee3'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#222'; c.font = '40px sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'left';
  c.fillText('TITLE', 700, 100);
  if (t >= 2 && t < 4) { c.fillText('Alpha', 400, 400); c.fillText('Beta', 430, 405); }
  c.fillRect(100 + t * 40, 600, 40, 40);
}}; }}};
export default {
  film: flags => ({
    storyboard: {title: 'Tools', scenes: [{id: 'one', title: 'One', narration: 'A first scene with a few words in it, said slowly.'}, {id: 'two', narration: 'And a second scene, a little shorter.'}]},
    // --anchors: beats and holds as an edit to the narration leaves them — one not said, one said twice, an nth past the
    // last place, an unknown scene, a hold not said — beside two that are fine.
    recipe: {story: {kit: 'words', ...(flags.anchors ? {beats: [['one', 'a few words'], ['one', 'a lot of words'], ['one', 'a'], {scene: 'two', phrase: 'scene', nth: 2}, ['three', 'hello'], ['two', 'a little shorter']]} : {})}},
    kits: [words], layout: {format: 'landscape', captions: true}, out: flags.out ?? 'out',
    // --paced: a film with no voice, paced (a 2 s hold, a 1.5 s tail); --paced notail: the holds without their sceneTail.
    ...(flags.paced ? {pacing: {...(flags.paced === 'notail' ? {} : {sceneTail: 1.5}), holds: [{scene: 'one', after: 'a few words', seconds: 2}]}} : {}),
    ...(flags.anchors ? {pacing: {sceneTail: 1, holds: [{scene: 'one', after: 'a few words', seconds: 1}, {scene: 'two', after: 'much shorter', seconds: 1}]}} : {}),
  }),
};
