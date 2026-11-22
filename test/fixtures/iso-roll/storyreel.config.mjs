// A project for the rolling, sliding and tumbling moves' tests (test/iso-roll.test.mjs): the iso-roll example as a
// project — a ball rolls, a crate slides, a cube tumbles off a shelf, each move decided by footprint-story.
// --still: the same film with no motion, so nothing is planned.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {isometricKit} from '../../../src/kits/isometric/index.mjs';

const example = fileURLToPath(new URL('../../../examples/iso-roll/', import.meta.url));
const read = (file) => JSON.parse(readFileSync(example + file, 'utf8'));

export default {
  film: (flags) => {
    const recipe = read('recipe.json');
    if (flags.still) delete recipe.story.motion;
    return {storyboard: read('storyboard.json'), recipe, kits: [isometricKit], root: example, out: flags.out ?? 'out'};
  },
};
