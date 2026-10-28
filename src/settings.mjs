/**
 * Settings, the one reader: footprint-story/motion's, shared with a deck. A transition's settings (an entrance's
 * `enter.<name>`) and a thought frame's (`frame.<name>`) are written the same way — {oneOf: [words]}, {point: true},
 * {color: true}, {number: [min, max]}, {box: true} or {name: true}, each with its default — and read there, on the
 * 1600×900 frame unless told otherwise.
 */
export {readSettings, isBox} from 'footprint-story/motion';
