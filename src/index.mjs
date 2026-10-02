/**
 * Footprint StoryReel: films from a storyboard (narration by scene) and a recipe (what is drawn
 * on which spoken phrase). See README.md.
 */
export {compileFilm} from './film.mjs';
export {makeClock, ramp, speechIndex, phraseMatches, evenTimings, directionTimings, withDirections, sceneText, spokenText, unsaidNumbers} from './clock.mjs';
export {renderFilm, wholeVideo} from './render.mjs';
export {segmentedVideo, folderStore, ffmpegJoin, planSegments, segmentKey, codeFingerprint} from './segments.mjs';
export {makeFilm} from './pipeline.mjs';
export {approveFilm, checkApproval, filmHashes} from './approval.mjs';
export {applyPacing, validatePacing, tailFor, paceTimings} from './pacing.mjs';
export {withStrings} from './strings.mjs';
export {createMotionSound as createSound} from './sound.mjs';
export {loadTheme, validateTheme} from './theme.mjs';
export {whiteboardKit} from './kits/whiteboard/index.mjs';
export {cartoonKit} from './kits/cartoon/index.mjs';
export {frameHashes, changedFrames} from './pins.mjs';
export {contactSheet, transitionSheet} from './sheet.mjs';
export {compileLayout, FORMAT_NAMES} from './layout.mjs';
export {captionChunks, captionFile} from './captions.mjs';
export {TRANSITIONS, TRANSITION_NAMES, transitionCatalog} from './transitions.mjs';
