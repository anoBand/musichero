// Browser smoke test: serves the site locally and walks through every screen with real audio.
// Run: npm run smoke   (needs Playwright's Chromium: npx playwright install chromium)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.mp3': 'audio/mpeg',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.md': 'text/plain' };
const server = http.createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/musichero/, '') || '/';
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));
const URL_ = `http://localhost:${server.address().port}/musichero/`;

let failed = 0;
const check = (cond, name) => { console.log((cond ? 'ok   ' : 'FAIL ') + name); if (!cond) failed++; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const ev = (fn) => page.evaluate(fn);
const fits = async () => { const [h, w] = await ev('[document.documentElement.scrollHeight, document.documentElement.scrollWidth]'); return h <= 640 && w <= 360; };
const answerIdx = () => ev('state.q.options.findIndex((o) => o.id === state.q.answerId)');

try {
  await page.goto(URL_);
  await page.waitForTimeout(300);
  check(await ev("document.querySelector('h1').textContent") === 'Music Hero', 'home renders');
  check(await ev("document.querySelectorAll('#home .mode').length") === 4, 'home lists the three quizzes and review');
  /* unlock 중수: extra XP goes in as a base so it survives reloads like real records */
  await ev("Store.doc.bases.test = { at: Date.now(), data: { xp: 1000 } }; Store.data.xp += 1000; Store.save()");

  // progression quiz, multiple choice
  await page.click('#m-prog');
  await page.click('#levels [data-v="mid"]');
  await page.click('#start');
  await page.waitForTimeout(2500);
  check(await ev('playing && !!current'), 'progression quiz plays');
  check(await fits(), 'quiz fits one phone screen');
  await page.click('#chart .bar >> nth=2');
  await page.waitForTimeout(150);
  check(await ev("Array.from(document.querySelectorAll('#chart .bar')).findIndex((e) => e.classList.contains('on'))") === 2, 'tapping a bar jumps there');
  const a = await answerIdx();
  await page.click(`.opt >> nth=${a}`);
  check(await ev("state.phase === 'answered' && document.querySelector('#status').textContent.startsWith('정답')"), 'right answer is graded');
  await page.click(`.opt >> nth=${(a + 1) % 4}`);
  await page.waitForTimeout(150);
  check(await ev('playing && state.nowIdx >= 0'), 'switching options keeps playing');
  await page.click('#next');
  await page.waitForTimeout(400);
  check(await ev("state.phase === 'asking'"), 'next question');
  await page.click('#quit');

  // progression quiz, written
  await page.click('#m-prog');
  await page.click('#amode [data-a="free"]');
  await page.click('#start');
  await page.waitForTimeout(400);
  const picks = await ev('state.q.prog.steps.map((st) => state.q.palette.findIndex((x) => x.step[0] === st[0] && x.step[1] === st[1]))');
  for (const i of picks) await page.click(`.pal-btn >> nth=${i}`);
  await page.click('#confirm');
  check(await ev("document.querySelector('#status').textContent.startsWith('정답')"), 'written progression answer is graded');
  check(await fits(), 'written answer fits one phone screen');
  await page.click('#quit');
  await page.click('#m-prog');
  await page.click('#amode [data-a="choice"]');
  await page.click('#setup-back');

  // key quiz
  await page.click('#m-key');
  await page.click('#start');
  await page.waitForTimeout(2500);
  const k = await answerIdx();
  await page.click(`.opt >> nth=${k}`);
  check(await ev('state.sel') === k && await ev('oneShots.length > 0'), 'tapping a note sounds it');
  await page.click('#confirm');
  check(await ev("document.querySelector('#status').textContent.startsWith('정답')"), 'key answer is graded');
  await page.click('#quit');

  // every backing style renders sound in every part, and the quiz shows the style
  const levels = await ev(`(async () => {
    const kit = await loadKit();
    const q = makeProgQuestion('major', null, 0, 'axis');
    prepareVoicing(q.chords);
    const peak = (b) => { const d = b.getChannelData(0); let m = 0; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); return m; };
    const out = {};
    for (const id of STYLE_IDS) {
      const st = renderStems(q.chords, 100, kit, id);
      out[id] = Math.min(peak(st.bufs.chord), peak(st.bufs.bass), STYLES[id].melody.length ? peak(st.bufs.melody) : 1, peak(drumsFor(4, 100, id)));
    }
    return out;
  })()`);
  check(Object.values(levels).every((v) => v > 0.02 && v < 4), 'every style makes sound ' + JSON.stringify(levels));
  await page.click('#m-prog');
  await page.click('#styles [data-s="bossa"]');
  await page.click('#start');
  await page.waitForTimeout(400);
  check(await ev("document.querySelector('#bpmv').textContent.endsWith('보사노바') && currentStyle() === 'bossa'"), 'quiz uses the chosen style');
  await page.click('#quit');
  await page.click('#m-prog');
  await page.click('#styles [data-s="pop"]');
  await page.click('#setup-back');

  // chord-quality quiz
  await page.click('#m-qual');
  check(await ev("document.querySelector('#amode').closest('.field').hidden && document.querySelector('#levels [data-v=custom]').hidden"), 'quality quiz setup hides what does not apply');
  await page.click('#levels [data-v="hard"]');
  await page.click('#start');
  await page.waitForTimeout(300);
  check(await ev("document.querySelectorAll('.opt').length === 9 && oneShots.length >= 3"), 'quality quiz plays the chord and offers nine kinds');
  check(await fits(), 'quality quiz fits one phone screen');
  const qa = await answerIdx();
  await page.click(`.opt >> nth=${qa}`);
  check(await ev("document.querySelector('#status').textContent.startsWith('정답') && /^[A-G]/.test(document.querySelector('#key').textContent)"), 'quality answer is graded and the chord named');
  await page.click(`.opt >> nth=${(qa + 1) % 9}`);
  await page.waitForTimeout(150);
  check(await ev("chords[0].quality === state.q.options[state.nowIdx].id && oneShots.length >= 3"), 'other kinds can be heard after answering');
  await page.click('#next');
  await page.waitForTimeout(200);
  const wrongQ = await answerIdx();
  await page.click(`.opt >> nth=${(wrongQ + 1) % 9}`);
  check(await ev("Store.data.review.some((r) => r.t === 'qual')"), 'a wrong kind goes to review');
  await page.click('#quit');

  // records, theme, persistence
  await page.click('#cal');
  check(await ev("document.querySelectorAll('#heat button').length") === 17 * 7, 'activity grid');
  await page.click('#rec-back');
  await page.click('#theme');
  await page.reload();
  await page.waitForTimeout(300);
  check(await ev("document.documentElement.dataset.theme === 'dark' && Store.data.days[today()].q >= 3"), 'theme and progress survive a reload');
  check(await ev("Store.data.xp >= 1000 && Store.doc.events.length === Store.data.days[today()].q"), 'answers are kept as log events');

  // account: the Firebase SDK loads from the app's own files; sign-in and sync run against a stand-in server
  await page.click('#rec-back').catch(() => {});
  check(await ev("!document.querySelector('#account-panel').hidden && document.querySelector('#account-btn').textContent === '구글로 로그인'"), 'account panel offers Google sign-in');
  check(await ev("Cloud.load().then(() => !!Cloud.auth && Cloud.user === null)"), 'Firebase SDK loads; nobody signed in');
  await ev(`(() => {
    const db = { user: null, bases: {}, events: {} };
    let clock = 1;
    window.fakeDb = db;
    Cloud.server = () => ({
      async getUser() { return db.user; }, async setUser(u) { db.user = JSON.parse(JSON.stringify(u)); },
      async getBases() { return db.bases; }, async setBase(d, b) { db.bases[d] = b; },
      async eventsSince(ms) { return Object.values(db.events).filter((x) => x.st > ms).map((x) => ({ e: x.e, st: x.st })); },
      async putEvents(l) { l.forEach((e) => { db.events[e.id] = { e: e, st: clock++ }; }); }
    });
    Cloud.signedIn({ uid: 'u1', displayName: '테스트' });
  })()`);
  await page.waitForTimeout(300);
  check(await ev("Object.keys(fakeDb.events).length === Store.doc.events.length && Store.doc.events.length > 0 && /^테스트 · 동기화됨/.test(document.querySelector('#account-text').textContent) && document.querySelector('#account-btn').textContent === '로그아웃'"), 'signing in uploads the records made before');
  await ev("fakeDb.events['other.1'] = { e: { id: 'other.1', at: Date.now(), k: today(), t: 'key', q: 'C', m: 'major', ok: 1, r: 0, x: 10, g: 10 }, st: 999 }; fakeDb.user.pref.acc = 'sharp'; fakeDb.user.prefAt.acc = Date.now() + 1000");
  const before = await ev('Store.data.days[today()].q');
  await ev('Cloud.syncNow()');
  check(await ev(`Store.data.days[today()].q === ${before} + 1 && ACCIDENTAL === 'sharp' && document.querySelector('#acc [data-a=sharp]').getAttribute('aria-pressed') === 'true'`), 'answers and settings from another device arrive');
  await ev("Cloud.fb = { signOut: async () => {} }; Cloud.signOut()");
  check(await ev("Store.doc.events.length === 0 && !Store.doc.sync && Store.data.xp === 0"), 'signing out leaves this device empty');

  // Android app (Capacitor stubbed): a newer GitHub release shows a banner; tapping it downloads and installs
  const app = await ctx.newPage();
  app.on('pageerror', (e) => errors.push(String(e)));
  await app.route('https://api.github.com/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({
    tag_name: 'v9.0.0', draft: false, prerelease: false,
    assets: [{ name: 'musichero-v9.0.0-build900.apk', browser_download_url: 'https://github.com/anoband/musichero/releases/download/v9.0.0/musichero-v9.0.0-build900.apk' }]
  }) }));
  await app.addInitScript(() => {
    const listeners = {};
    const on = (name) => ({ addListener: async (ev, fn) => { (listeners[name + ev] = listeners[name + ev] || []).push(fn); return { remove() {} }; } });
    window.installed = [];
    window.Capacitor = { isNativePlatform: () => true, Plugins: {
      App: Object.assign(on('App'), { getInfo: async () => ({ build: '12', version: 'dev-12' }), exitApp() {} }),
      LocalNotifications: { getPending: async () => ({ notifications: [] }), cancel: async () => {}, schedule: async () => {}, requestPermissions: async () => ({ display: 'granted' }) },
      Updater: Object.assign(on('Updater'), {
        info: async () => ({ installer: 'com.google.android.packageinstaller', canInstall: true }),
        allowInstall: async () => {},
        install: async (o) => { (listeners.Updaterprogress || []).forEach((f) => f({ percent: 50 })); window.installed.push(o.url); }
      })
    } };
  });
  await app.goto(URL_);
  await app.waitForTimeout(500);
  check(await app.evaluate("!document.querySelector('#update-bar').hidden && document.querySelector('#update-text').textContent.includes('v9.0.0')"), 'app: a newer release shows the update banner');
  await app.click('#update-btn');
  await app.waitForTimeout(200);
  check(await app.evaluate("installed.length === 1 && installed[0].endsWith('build900.apk') && document.querySelector('#update-text').textContent.startsWith('설치 화면')"), 'app: tapping it downloads and opens the installer');
  check(await app.evaluate("!document.querySelector('#remind-panel').hidden && !document.querySelector('#account-panel').hidden"), 'app: reminder and account panels show');
  await app.close();

  // records saved by an earlier version move into the log on first start
  const old = await ctx.newPage();
  old.on('pageerror', (e) => errors.push(String(e)));
  await old.goto(URL_);
  await old.evaluate(() => {
    localStorage.clear();
    const y = addDays(today(), -1);
    const days = {};
    days[y] = { q: 5, right: 4, practice: 0, best: 3, cur: 1 };
    localStorage.setItem('chord-backing-progress-v1', JSON.stringify({ v: 1, xp: 320, days: days, review: [], prog: {}, quests: {}, weeks: {}, pref: { acc: 'sharp', kit: 'guitar' } }));
  });
  await old.reload();
  await old.waitForTimeout(300);
  check(await old.evaluate("Store.data.xp === 320 && document.querySelector('#streak-n').textContent === '1' && ACCIDENTAL === 'sharp' && state.kit === 'guitar'"), 'old records, streak and settings carry over');
  check(await old.evaluate("document.querySelector('#goal-detail').textContent === '문제 0/10' && !!localStorage.getItem('musichero-log-v2')"), 'new daily goal is 10 and the log is saved');
} catch (e) {
  failed++;
  console.log('FAIL ' + e.message);
}
check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
