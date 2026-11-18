/* Event wiring and start-up. Loaded last. */
/* ---- wiring ---- */
$('#m-prog').addEventListener('click', () => openSetup('prog'));
$('#m-key').addEventListener('click', () => openSetup('key'));
$('#m-qual').addEventListener('click', () => openSetup('qual'));
$('#m-review').addEventListener('click', () => startSession('review'));
$('#setup-back').addEventListener('click', showHome);
$('#rec-back').addEventListener('click', showHome);
$('#cal').addEventListener('click', openRecords);
$('#heat').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-k]');
  if (!b) return;
  $$('#heat .sel').forEach((x) => x.classList.remove('sel'));
  b.classList.add('sel');
  $('#heat-detail').textContent = dayDetail(b.dataset.k);
});
$('#levels').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]');
  if (!b) return;
  state.level = b.dataset.v;
  Store.setPref('level', state.level);
  clearTimeout(beatTimer);
  if (playing) stop(null, true);
  renderLevel();
});

/* 4. dark mode: follows the system until the button is used, then remembers the choice */
function currentTheme() {
  const t = document.documentElement.dataset.theme;
  if (t) return t;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t;
  const dark = currentTheme() === 'dark';
  $('#theme').setAttribute('aria-pressed', String(dark));
  $$('meta[name="theme-color"]').forEach((m) => { if (t) { m.removeAttribute('media'); m.setAttribute('content', dark ? '#0D1518' : '#EDF0F2'); } });
}
$('#theme').addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  Store.setPref('theme', next);
  applyTheme(next);
});
applyTheme(Store.data.pref.theme || null);
$('#start').addEventListener('click', () => startSession(state.session.kind));
$('#quit').addEventListener('click', showHome);
$('#next').addEventListener('click', () => { nextQuestion(); });
$('#confirm').addEventListener('click', () => {
  if (state.q && state.q.type === 'prog' && state.q.free) submitWritten();
  else if (state.sel >= 0) answer(state.sel);
});
$('#opts').addEventListener('click', (e) => {
  const b = e.target.closest('button.pal-btn');
  if (b) choose(Number(b.dataset.p));
});
function renderAmode() {
  $$('#amode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.a === state.amode)));
  $('#amode-note').textContent = state.amode === 'free'
    ? (state.session.kind === 'key' ? '12음 중에서 으뜸음을 직접 골라요. 경험치 1.5배.' : '마디마다 코드를 직접 골라 네 마디를 채워요. 경험치 1.5배.')
    : '보기 4개 중에서 골라요.';
}
$('#amode').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-a]');
  if (!b) return;
  state.amode = b.dataset.a;
  Store.setPref('amode', state.amode);
  renderAmode();
});
if (Store.data.pref.amode === 'free') state.amode = 'free';
/* Notes in the key quiz sound on touch-down, not on release (a click arrives only when the finger lifts).
   The click that follows is ignored; a click with no touch-down before it (keyboard) still works. */
let downHandled = false;
$('#opts').addEventListener('pointerdown', (e) => {
  const b = e.target.closest('button.opt');
  if (!b || !state.q || state.q.type !== 'key') return;
  const i = Number(b.dataset.i);
  downHandled = true;
  if (state.phase === 'asking') pick(i); else if (state.phase === 'answered') audition(i);
});
$('#opts').addEventListener('click', (e) => {
  const b = e.target.closest('button.opt');
  if (!b) return;
  if (downHandled) { downHandled = false; return; }
  const i = Number(b.dataset.i);
  const isKey = state.q && state.q.type === 'key';
  if (state.phase === 'asking') { if (isKey) pick(i); else answer(i); }
  else if (state.phase === 'answered') { if (isKey) audition(i); else switchTo(i); }
});
$('#play').addEventListener('click', () => { if (playing) stop(); else start(); });
$('#modes').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-m]');
  if (!b) return;
  state.setting = b.dataset.m;
  $$('#modes button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
});
$('#bpmmodes').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-b]');
  if (!b) return;
  state.bpmMode = b.dataset.b;
  $$('#bpmmodes button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  $('#bpm-manual').hidden = state.bpmMode !== 'fixed';
  $('#bpm-note').hidden = state.bpmMode === 'fixed';
  if (state.bpmMode === 'fixed') previewBeat(); else { clearTimeout(beatTimer); if (playing) stop(null, true); }
});
$('#layers').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-l]');
  if (!b) return;
  setLayer(b.dataset.l, !layers[b.dataset.l]);
});
$$('.layer-btn').forEach((b) => b.addEventListener('click', () => setLayer(b.dataset.l, !layers[b.dataset.l])));
function setFixedBpm(v) {
  fixedBpm = Math.max(60, Math.min(160, v));
  $('#bpm').value = String(fixedBpm);
  $('#bpm-out').firstChild.nodeValue = String(fixedBpm);
  previewBeat();
}
$('#bpm').addEventListener('input', (e) => setFixedBpm(Number(e.target.value)));
$('#bpm-down').addEventListener('click', () => setFixedBpm(fixedBpm - 1));
$('#bpm-up').addEventListener('click', () => setFixedBpm(fixedBpm + 1));

/* key pickers: one tap per key, flat spellings */
function buildKeyGrid(el, withRandom, onPick) {
  (withRandom ? [['random', '랜덤']] : []).concat(keysFor('major').map((k) => [String(k.pc), keyLabel(k)])).forEach((it) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.dataset.k = it[0]; b.textContent = it[1];
    b.setAttribute('aria-pressed', 'false');
    el.appendChild(b);
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (!b) return;
    markKeyGrid(el, b.dataset.k);
    onPick(b.dataset.k);
  });
}
function relabelKeyGrids() {
  $$('#keygrid .chip').forEach((b) => {
    if (b.dataset.k !== 'random') b.textContent = keyLabel(keyObj('major', Number(b.dataset.k)));
  });
}
function markKeyGrid(el, value) {
  Array.from(el.children).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === value)));
}
buildKeyGrid($('#keygrid'), true, (v) => {
  state.keyPc = v === 'random' ? null : Number(v);
  if (state.keyPc !== null) previewTonic(state.keyPc);
});
markKeyGrid($('#keygrid'), 'random');
/* chord blocks are tappable: playback restarts from that bar */
$('#chart').addEventListener('pointerdown', (e) => {
  const bar = e.target.closest('.bar');
  if (!bar) return;
  const idx = Array.prototype.indexOf.call(bar.parentNode.children, bar);
  /* written answer: the tapped bar is also the one the next chord goes into */
  if (state.q && state.q.free && state.q.type === 'prog' && state.phase === 'asking') { state.slot = idx; renderSlots(); }
  jumpTo(idx);
});

/* 1. key naming, chosen on the home screen and remembered on this device */
function markAcc() { $$('#acc button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.a === ACCIDENTAL))); }
$('#acc').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-a]');
  if (!b) return;
  ACCIDENTAL = b.dataset.a;
  Store.setPref('acc', ACCIDENTAL);
  markAcc();
  relabelKeyGrids();
  renderLevel();
});
markAcc();

/* backing style ('random': a new style each question) */
const STYLE_CHOICES = STYLE_IDS.concat(['random']);
STYLE_CHOICES.forEach((id) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip'; b.dataset.s = id;
  b.textContent = id === 'random' ? '랜덤' : STYLES[id].label;
  $('#styles').appendChild(b);
});
function renderStyles() {
  $$('#styles button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.s === state.style)));
}
$('#styles').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-s]');
  if (!b) return;
  state.style = b.dataset.s;
  Store.setPref('style', state.style);
  renderStyles();
  if (state.bpmMode === 'fixed' && !LEVELS[state.level]) previewBeat();
});
if (STYLE_CHOICES.indexOf(Store.data.pref.style) >= 0) state.style = Store.data.pref.style;
renderStyles();

/* backing instrument */
if (KITS[Store.data.pref.kit]) state.kit = Store.data.pref.kit;
$('#kits').addEventListener('click', (e) => { const b = e.target.closest('button[data-k]'); if (b) setKit(b.dataset.k); });
renderKit();

/* reset asks twice; the viewer has no confirm dialog */
let resetArmed = null;
$('#reset').addEventListener('click', () => {
  const b = $('#reset');
  if (resetArmed) {
    clearTimeout(resetArmed); resetArmed = null;
    Store.reset();
    b.textContent = '기록 초기화';
    renderHome();
    return;
  }
  b.textContent = '한 번 더 누르면 모두 지워져요';
  resetArmed = setTimeout(() => { resetArmed = null; b.textContent = '기록 초기화'; }, 4000);
});

renderHome();

/* offline + installable */
const insideApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
if ('serviceWorker' in navigator && !insideApp) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
