/**
 * Footprint StoryReel: films from a storyboard (narration by scene) and a recipe (what is drawn
 * on which spoken phrase). See README.md.
 */
export {compileFilm} from './film.mjs';
export {makeClock, ramp, speechIndex, phraseMatches, evenTimings, directionTimings, withDirections, sceneText} from './clock.mjs';
export {renderFilm} from './render.mjs';
export {makeFilm} from './pipeline.mjs';
export {applyPacing, validatePacing, tailFor, paceTimings} from './pacing.mjs';
export {withStrings} from './strings.mjs';
export {createMotionSound as createSound} from './sound.mjs';
export {loadTheme, validateTheme} from './theme.mjs';
export {whiteboardKit} from './kits/whiteboard/index.mjs';
export {cartoonKit} from './kits/cartoon/index.mjs';
export {frameHashes, changedFrames} from './pins.mjs';
export {contactSheet} from './sheet.mjs';
