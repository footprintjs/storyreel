// A project for the map records' tests (test/map-record.test.mjs): the iso-world example as a project — its story's
// blocks placed from their wires on a fitted grid, its desk's placed by hand on a grid written in numbers.
// --plain: the same film with no isometric world (the story drawn by a kit that draws nothing), so no map is built.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {isometricKit} from '../../../src/kits/isometric/index.mjs';

const example = fileURLToPath(new URL('../../../examples/iso-world/', import.meta.url));
const read = (file) => JSON.parse(readFileSync(example + file, 'utf8'));
const blank = {name: 'blank', story: {compile: () => ({hang: 1, draw: (c) => { c.fillStyle = '#f3eee3'; c.fillRect(0, 0, 1600, 900); }})}};

export default {
  film: (flags) => ({
    storyboard: read('storyboard.json'),
    recipe: flags.plain ? {story: {kit: 'blank'}} : read('recipe.json'),
    kits: [isometricKit, blank], root: example, out: flags.out ?? 'out',
  }),
};
