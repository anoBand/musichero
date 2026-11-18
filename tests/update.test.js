// Unit tests for js/update.js: picking an app update from a GitHub release.  Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../js/update.js');

const rel = (names, extra) => Object.assign({ tag_name: 'v0.5.0', draft: false, prerelease: false,
  assets: names.map((n) => ({ name: n, browser_download_url: 'https://github.com/anoband/musichero/releases/download/v0.5.0/' + n })) }, extra || {});

test('a newer build is offered', () => {
  const u = U.pickUpdate(rel(['musichero-v0.5.0-build40.apk']), '31');
  assert.deepEqual(u, { version: 'v0.5.0', build: 40, url: 'https://github.com/anoband/musichero/releases/download/v0.5.0/musichero-v0.5.0-build40.apk' });
});
test('the same or an older build is not', () => {
  assert.equal(U.pickUpdate(rel(['musichero-v0.5.0-build40.apk']), '40'), null);
  assert.equal(U.pickUpdate(rel(['musichero-v0.5.0-build40.apk']), 52), null, 'a newer test build stays');
});
test('releases from before build numbers, drafts and pre-releases are ignored', () => {
  assert.equal(U.pickUpdate(rel(['musichero-v0.4.0.apk']), 1), null);
  assert.equal(U.pickUpdate(rel(['musichero-v0.5.0-build40.apk'], { draft: true }), 1), null);
  assert.equal(U.pickUpdate(rel(['musichero-v0.5.0-build40.apk'], { prerelease: true }), 1), null);
  assert.equal(U.pickUpdate(null, 1), null);
  assert.equal(U.pickUpdate({ message: 'API rate limit exceeded' }, 1), null);
});
