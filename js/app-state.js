/* Device storage, shared state, and the chord chart. */
/* ---- storage: this device only. Swap load/save for a server call later; nothing else reads localStorage. ---- */
const Store = {
  KEY: 'chord-backing-progress-v1',
  ok: true,
  data: null,
  load() {
    let d = null;
    try { const raw = localStorage.getItem(this.KEY); if (raw) d = JSON.parse(raw); } catch (e) { this.ok = false; }
    this.data = d && d.v === 1 ? Object.assign(freshData(), d) : freshData();
  },
  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { this.ok = false; }
  },
  reset() { this.data = freshData(); this.save(); }
};
Store.load();
if (!Store.data.pref) Store.data.pref = { acc: 'flat' };
ACCIDENTAL = Store.data.pref.acc === 'sharp' ? 'sharp' : 'flat';
function today() { return dayKey(new Date()); }

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
let chords = [];
let bpm = 100;
let fixedBpm = 100;
let playing = false;
let wakeLock = null;
let playToken = 0;
let beatTimer = null;
const layers = { chord: true, bass: true, melody: true, drums: true };
const state = {
  view: 'home', session: { kind: 'prog' }, phase: 'idle',
  kit: 'piano', style: 'pop', qStyle: null, amode: 'choice', level: 'easy', setting: 'major', keyPc: null, bpmMode: 'random',
  q: null, asked: 0, right: 0, streak: 0, last: null, nowIdx: -1
};
if (LEVELS[Store.data.pref.level] || Store.data.pref.level === 'custom') state.level = Store.data.pref.level;

function prepareVoicing(chs) {
  const voiced = voiceLeading(chs);
  chs.forEach((c, i) => {
    c.midi = voiced[i];
    c.bassMidi = 40 + ((c.bassPc - 4 + 12) % 12);
  });
}
function jit(v) { return Math.min(1, v * (0.9 + Math.random() * 0.2)); }
function chartEl() { return $('#chart'); }

/* chart: tiles hold the real symbols; the quiz chart stays masked until the answer */
function renderChart() {
  const el = chartEl();
  el.textContent = '';
  el.classList.toggle('many', chords.length > 4);
  el.classList.toggle('single', chords.length === 1);
  chords.forEach((c) => {
    const bar = document.createElement('div');
    bar.className = 'bar';
    const sym = document.createElement('span'); sym.className = 'sym';
    const root = document.createElement('span'); root.textContent = c.root; sym.appendChild(root);
    if (c.quality) { const q = document.createElement('span'); q.className = 'q'; q.textContent = c.quality; sym.appendChild(q); }
    if (c.slash) { const sl = document.createElement('span'); sl.className = 'sl'; sl.textContent = '/' + c.slash; sym.appendChild(sl); }
    const qm = document.createElement('span'); qm.className = 'qm'; qm.textContent = '?';
    const beats = document.createElement('span'); beats.className = 'beats';
    for (let b = 0; b < 4; b++) beats.appendChild(document.createElement('i'));
    bar.append(sym, qm, beats);
    el.appendChild(bar);
  });
  if (current) current.lastE = -1;
}
function setActive(barIdx, beatIdx) {
  const bars = chartEl().children;
  for (let i = 0; i < bars.length; i++) {
    const on = i === barIdx;
    bars[i].classList.toggle('on', on);
    const dots = bars[i].querySelectorAll('.beats i');
    dots.forEach((d, j) => d.classList.toggle('on', on && j === beatIdx));
  }
}
