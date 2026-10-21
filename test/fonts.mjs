/**
 * The test run's generic font families, pinned (loaded before every test file: package.json · test, and
 * scripts/temp-hygiene.mjs). A theme's font stack ends in a generic family ("Menlo,monospace", "\"Avenir Next\",Arial,
 * sans-serif"); on a machine without its named fonts, @napi-rs/canvas falls back to a default face of its own choosing,
 * picked by its scan of the system's fonts. That pick is not stable across machines: GitHub's ubuntu-24.04 image
 * 20261012 gave DejaVu Sans, 20261018 another face, and the word gaps the reading and claims checks measure moved with
 * it (four tests failed on one image and passed on the other, with the same code). So where DejaVu Sans is installed,
 * it is registered under the generic families, regular and bold: the face those tests' expected values were taken on
 * there. Where it is not (macOS: Menlo and Avenir Next are found first), nothing changes.
 */
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';

const {GlobalFonts} = createRequire(import.meta.url)('@napi-rs/canvas');
const DEJAVU = '/usr/share/fonts/truetype/dejavu';
for (const face of ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf']) {
  const file = `${DEJAVU}/${face}`;
  if (existsSync(file)) for (const family of ['sans-serif', 'monospace', 'serif']) GlobalFonts.registerFromPath(file, family);
}
