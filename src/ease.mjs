/**
 * The ease table: how a change speeds up and settles. It lives in footprint-story/motion, the one table a film and a deck
 * both read, so a curve is named, never copied; this module is StoryReel's door to it (and `footprint-storyreel/ease`).
 * The names, the curves and the refusals are footprint-story's: see its src/motion/ease.js.
 */
export {EASES, EASE_NAMES, bezier, easeNamed, overshoots, inOut} from 'footprint-story/motion';
