// A project for the motion records' tests (test/iso-motion.test.mjs): the iso-motion example as a project — a box that
// falls and a ball thrown onto the server, each move decided by footprint-story.
// --straight: one more move, the ball reached back off the server in a straight line (min-jerk with no bow), which
// footprint-story's arc critic finds wrong: what the check's reply says of a critic's finding.
// --plain: the same film with no motion, so nothing is planned.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {isometricKit} from '../../../src/kits/isometric/index.mjs';

const example = fileURLToPath(new URL('../../../examples/iso-motion/', import.meta.url));
const read = (file) => JSON.parse(readFileSync(example + file, 'utf8'));
const straight = {piece: 'ball', do: 'reach', to: [3, 6], at: ['drop', 'timed by hand'], model: {name: 'min-jerk', bend: 0}};

export default {
  film: (flags) => {
    const recipe = read('recipe.json');
    if (flags.straight) recipe.story.motion.push(straight);
    if (flags.plain) delete recipe.story.motion;
    return {storyboard: read('storyboard.json'), recipe, kits: [isometricKit], root: example, out: flags.out ?? 'out'};
  },
};
