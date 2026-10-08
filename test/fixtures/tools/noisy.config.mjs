// The tools' project, printing on stdout before the tool does — as a kit, or a library's logger, might.
import project from './storyreel.config.mjs';

export default {
  film: flags => {
    console.log('TREE PIPELINE: executeNodeChildren - Error for id: loop {');
    console.log('/nowhere/frame.png · a path on a line before the picture\'s, not the picture');
    console.log('}');
    return project.film(flags);
  },
};
