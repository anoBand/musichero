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
  await ev('Store.data.xp = 1000; Store.save()');

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

  // practice
  await page.click('#m-practice');
  await page.click('#p-play');
  await page.waitForTimeout(3000);
  check(await ev('playing && current.kit === state.kit'), 'practice plays');
  await page.click('#p-keygrid [data-k="5"]');
  await page.waitForTimeout(200);
  check(await ev("playing && document.querySelector('#p-chart .sym').textContent === 'F'"), 'changing key keeps playing');
  check(await fits(), 'practice fits one phone screen');
  await page.click('#p-quit');
  check(await ev('!playing'), 'leaving stops the sound');

  // records, theme, persistence
  await page.click('#cal');
  check(await ev("document.querySelectorAll('#heat button').length") === 17 * 7, 'activity grid');
  await page.click('#rec-back');
  await page.click('#theme');
  await page.reload();
  await page.waitForTimeout(300);
  check(await ev("document.documentElement.dataset.theme === 'dark' && Store.data.days[today()].q >= 3"), 'theme and progress survive a reload');
} catch (e) {
  failed++;
  console.log('FAIL ' + e.message);
}
check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
