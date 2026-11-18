import assert from 'node:assert/strict';
import test from 'node:test';
import {assertPackageCredits} from './package-credits.mjs';

const own = {name: 'footprint-storyreel', version: '0.29.1', license: 'MIT AND Apache-2.0'};
const engine = version => ({name: 'footprintjs', version, license: 'MIT'});
const credits = version => `Credits — Pebbles

Made with
- footprint-storyreel 0.29.1 (MIT AND Apache-2.0) — the film, drawn in code
- footprintjs ${version} (MIT) — the making-of pipeline and its record
- Caveat (SIL OFL 1.1) — handwriting font
`;

test('credits retain exact stable, prerelease and build-metadata package versions', () => {
  for (const version of ['13.0.0', '14.0.0-rc.0', '14.0.0-rc.0+build.7']) {
    assertPackageCredits(credits(version), {title: 'Pebbles', own, engine: engine(version)});
  }
});

test('wrong version, package, licence or role detail is still refused', () => {
  const actual = credits('14.0.0-rc.0'), metadata = {title: 'Pebbles', own, engine: engine('14.0.0-rc.0')};
  for (const changed of [
    actual.replace('14.0.0-rc.0', '14.0.0'),
    actual.replace('footprintjs', 'other-package'),
    actual.replace('MIT AND Apache-2.0', 'MIT'),
    actual.replace('(MIT)', '(GPL-3.0)'),
    actual.replace('the making-of pipeline and its record', 'some tool'),
  ]) assert.throws(() => assertPackageCredits(changed, metadata), {code: 'ERR_ASSERTION'});
});
