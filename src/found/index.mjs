/**
 * Found sounds: recorded sound effects a film keeps beside it. `npx storyreel sounds add` fetches each ONCE (sounds/,
 * through a sound source such as sounds/openverse.mjs) into the film's sounds/ folder as <name>.<ext>, described in
 * sounds/sounds.json; from then on a film reads them offline, and a render never touches the network.
 *
 * This folder is the library's offline half, one module per rule behind this facade:
 *   name.mjs      a found sound's name and the 'found' event type (a leaf: what sound.mjs checks a shape by)
 *   text.mjs      text from a source made plain and capped, wherever it is written, read or shown
 *   licences.mjs  the licence gate: one table, one verdict
 *   record.mjs    the record sounds.json keeps, every field checked; a record never names a path
 *   library.mjs   the library read from a film's root, a sound checked for use, its file checked again at render
 *   credits.mjs   the credit lines CREDITS.txt gets
 *
 * Threat model. Every field of a record came over the network, and sounds.json sits in a folder anyone may edit: all
 * of it is untrusted. Text is made plain and capped before a terminal, CREDITS.txt or an agent sees it. The gate reads
 * the stored record's own licence at every use (add, build, render), and the sha256 ties the file to the record, so a
 * swapped file refuses; a hand-edited licence field is believed offline (nothing local can prove it false). A file
 * name is never the record's to choose: it is <name>.<ext>, the name a strict slug, the extension one ffprobe found.
 */
export {FOUND, isFoundName, checkFoundName} from './name.mjs';
export {plainText, shown} from './text.mjs';
export {LICENCES, usableLicences, licenceName, licenceUrl, licenceVersion, licenceVerdict} from './licences.mjs';
export {FOUND_LIMITS, AUDIO_EXTENSIONS, AUDIO_ONLY, TEXT, foundRecord, addCommand} from './record.mjs';
export {SOUNDS_FOLDER, LIBRARY_FILE, readLibrary, libraryText, sha256Of, useFound, checkFoundFile} from './library.mjs';
export {creditLines} from './credits.mjs';
