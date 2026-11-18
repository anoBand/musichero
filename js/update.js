/* Which GitHub release, if any, is an update for this app. No DOM: also loaded by the unit tests in Node.
   Release APKs are named musichero-v<version>-build<versionCode>.apk (see .github/workflows/android.yml);
   the build number is what decides, so test builds from main (dev-N, built by the same workflow) compare too. */
const RELEASES_URL = 'https://api.github.com/repos/anoband/musichero/releases/latest';
const APK_NAME = /^musichero-(v\d+\.\d+\.\d+)-build(\d+)\.apk$/;

/* release: GitHub's release JSON; build: this app's versionCode. Returns { version, build, url } or null. */
function pickUpdate(release, build) {
  if (!release || release.draft || release.prerelease || !Array.isArray(release.assets)) return null;
  let best = null;
  release.assets.forEach((a) => {
    const m = APK_NAME.exec(a.name || '');
    if (!m) return;
    const b = Number(m[2]);
    if (b > Number(build || 0) && (!best || b > best.build)) best = { version: m[1], build: b, url: a.browser_download_url };
  });
  return best;
}

if (typeof module !== 'undefined') module.exports = { pickUpdate, APK_NAME };
