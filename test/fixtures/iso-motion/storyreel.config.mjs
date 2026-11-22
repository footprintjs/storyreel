// A project for the motion records' tests (test/iso-motion.test.mjs): the iso-motion example as a project — a box that
// falls and a ball thrown onto the server, each move decided by footprint-story.
// --straight: one more move, the box reached back across the floor in a straight line (min-jerk with no bow), which
// footprint-story's arc critic finds wrong: what the check's reply says of a critic's finding. --accept: the same move,
// its entry accepting the arc critic ("accept": ["arc"]): the straight slide is meant, and the check reads clean.
// --plain: the same film with no motion, so nothing is planned.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {isometricKit} from '../../../src/kits/isometric/index.mjs';

const example = fileURLToPath(new URL('../../../examples/iso-motion/', import.meta.url));
const read = (file) => JSON.parse(readFileSync(example + file, 'utf8'));
const straight = {piece: 'box', do: 'reach', to: [1, 1], at: ['drop', 'timed by hand'], model: {name: 'min-jerk', bend: 0}};

export default {
  film: (flags) => {
    const recipe = read('recipe.json');
    if (flags.straight) recipe.story.motion.push(straight);
    if (flags.accept) recipe.story.motion.push({...straight, accept: ['arc']});
    if (flags.plain) delete recipe.story.motion;
    return {storyboard: read('storyboard.json'), recipe, kits: [isometricKit], root: example, out: flags.out ?? 'out'};
  },
};
