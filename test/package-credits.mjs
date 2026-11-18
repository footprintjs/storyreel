import assert from 'node:assert/strict';

// Test oracle: exact installed package metadata, independent of version syntax.
export function assertPackageCredits(credits, {title, own, engine}) {
  assert.deepEqual(credits.split('\n').slice(0, 5), [
    `Credits — ${title}`,
    '',
    'Made with',
    `- ${own.name} ${own.version} (${own.license}) — the film, drawn in code`,
    `- ${engine.name} ${engine.version} (${engine.license}) — the making-of pipeline and its record`,
  ]);
}
