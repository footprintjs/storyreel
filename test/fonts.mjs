/**
 * The test run's generic font families, pinned (loaded before every test file: package.json · test, and
 * scripts/temp-hygiene.mjs, which npm run test:temp and test:skills:render use). A theme's font stack ends in a
 * generic family ("Menlo,monospace", "\"Avenir Next\",Arial,sans-serif"); on a machine without its named fonts,
 * @napi-rs/canvas falls back to a default face of its own choosing, picked by its scan of the system's fonts. That pick
 * is not stable across machines: GitHub's ubuntu-24.04 image 20261012 gave DejaVu Sans, 20261018 another face, and
 * the word gaps the reading and claims checks measure moved with it (four tests failed on one image and passed on the
 * other, with the same code).
 *
 * So where DejaVu Sans is installed at Debian/Ubuntu's path, it is registered, regular and bold, under the generic
 * families: a stack's named fonts still win where they are found, and a family found nowhere (generic or not) now
 * resolves to DejaVu Sans, as every one did on the earlier image those tests' expected values were taken on. Where the
 * path is absent (macOS, Windows, other Linux layouts) nothing is registered. A face that is there but will not load
 * refuses, so a broken pin is never mistaken for a broken test.
 *
 * Not pinned: a single file run directly (node --test test/x.test.mjs: add --import ./test/fonts.mjs), and Node programs
 * the tests spawn (the CLI, a skill's make.mjs). None of those measures text today; a test that comes to depend on the
 * fallback face imports this module itself.
 */
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';

const {GlobalFonts} = createRequire(import.meta.url)('@napi-rs/canvas');
const DEJAVU = '/usr/share/fonts/truetype/dejavu';
for (const face of ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf']) {
  const file = `${DEJAVU}/${face}`;
  if (!existsSync(file)) continue;
  for (const family of ['sans-serif', 'monospace', 'serif']) {
    if (!GlobalFonts.registerFromPath(file, family)) throw new Error(`test/fonts.mjs: ${file} is there but did not load as a font: reinstall DejaVu (fonts-dejavu-core), or remove it so the tests run unpinned`);
  }
}
