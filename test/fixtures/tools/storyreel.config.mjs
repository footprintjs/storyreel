// A project for the tools' tests: one kit that draws words — two of them over each other from 2 s to 4 s.
const words = {name: 'words', story: {compile: () => ({hang: 1, draw: (c, t) => {
  c.fillStyle = '#f3eee3'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#222'; c.font = '40px sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'left';
  c.fillText('TITLE', 700, 100);
  if (t >= 2 && t < 4) { c.fillText('Alpha', 400, 400); c.fillText('Beta', 430, 405); }
  c.fillRect(100 + t * 40, 600, 40, 40);
}})}};
export default {
  film: flags => ({
    storyboard: {title: 'Tools', scenes: [{id: 'one', title: 'One', narration: 'A first scene with a few words in it, said slowly.'}, {id: 'two', narration: 'And a second scene, a little shorter.'}]},
    recipe: {story: {kit: 'words'}}, kits: [words], layout: {format: 'landscape', captions: true}, out: flags.out ?? 'out',
  }),
};
