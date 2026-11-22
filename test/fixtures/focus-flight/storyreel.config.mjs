// A project for the focus flights' tests (test/flight.test.mjs): a flat picture of two named boxes, its focus a camera
// that frames the red one, then the blue one, then the whole frame — each flight between two shots planned by
// footprint-story (footprint-story/shot · planCameraMove).
// --short: the blue key lands before the flight to red has arrived (reel:cut-short, a finding to fix). --accept: the same,
// its key accepting it ("accept": ["reel:cut-short"]). --cut: the blue key asks for a cut. --plain: no focus at all.
const storyboard = {title: 'Two boxes', scenes: [
  {id: 'a', narration: 'First the red square sits here, quietly, in its corner of the page, for a while longer still.'},
  {id: 'b', narration: 'Then the blue one waits down there, and then back to all of it, the whole page at once, slowly.'},
]};
const flat = {name: 'flat', story: {compile: () => ({hang: 1,
  draw: (c) => { c.fillStyle = '#f3eee3'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#c0392b'; c.fillRect(500, 300, 200, 150); c.fillStyle = '#1f4f9c'; c.fillRect(900, 450, 240, 160); },
  regionsAt: () => [{box: [500, 300, 700, 450], path: 'red', label: 'red', name: 'red'}, {box: [900, 450, 1140, 610], path: 'blue', label: 'blue', name: 'blue'}],
})}};

export default {
  film: (flags) => {
    const blue = {at: ['b', 'the blue one'], on: 'blue', size: 'medium'};
    if (flags.short || flags.accept) blue.at = ['a', 'sits here'];
    const red = {at: ['a', 'red square'], on: 'red', size: 'medium', ...(flags.accept ? {accept: ['reel:cut-short']} : {})};
    if (flags.cut) blue.do = 'cut';
    const focus = {strategy: 'camera', keys: [red, blue, {at: ['b', 'at once'], on: 'wide'}]};
    return {storyboard, recipe: {story: {kit: 'flat'}, ...(flags.plain ? {} : {focus})}, kits: [flat], out: flags.out ?? 'out'};
  },
};
