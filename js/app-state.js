/* Device storage, shared state, and the chord chart. */
/* ---- storage: this device only for now. The log document (ledger.js) is what will be synced;
   Store.data is worked out from it and is what the screens read. Nothing else touches localStorage. ---- */
const Store = {
  KEY: 'musichero-log-v2',
  OLD_KEY: 'chord-backing-progress-v1',
  ok: true,
  doc: null,
  data: null,
  load() {
    let doc = null;
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) doc = cleanDoc(JSON.parse(raw));
      else {
        /* first start after the update: the old records become this device's base; the old copy stays as a backup */
        const old = localStorage.getItem(this.OLD_KEY);
        if (old) { const d = JSON.parse(old); if (d && d.v === 1) doc = docFromV1(d, Date.now()); }
      }
    } catch (e) { this.ok = false; }
    this.doc = doc || freshDoc();
    this.data = derive(this.doc);
    if (doc && !localStorage.getItem(this.KEY)) this.save();
  },
  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.doc)); } catch (e) { this.ok = false; }
  },
  /* records one answer; returns the quests it completed */
  answer(a) {
    const k = today();
    const day = this.data.days[k];
    a.goal = day && day.goal ? day.goal : GOAL_Q;
    const e = logAnswer(this.doc, k, a, Date.now());
    const done = applyEvent(this.data, e);
    this.save();
    this.changed();
    return done;
  },
  setPref(key, value) { setPref(this.doc, key, value, Date.now()); this.save(); this.changed(); },
  /* 기록 초기화: settings stay */
  reset() { resetDoc(this.doc, Date.now()); this.data = derive(this.doc); this.save(); this.changed(); },
  /* takes in what a sync brought back (sync.js) */
  merge(remote, sync) {
    this.doc = mergeDocs(this.doc, remote);
    if (sync) this.doc.sync = sync;
    this.data = derive(this.doc);
    this.save();
  },
  /* signing out: the records live on in the account, so this device starts over (settings stay) */
  forget() {
    const doc = freshDoc();
    doc.pref = this.doc.pref;
    doc.prefAt = this.doc.prefAt;
    this.doc = doc;
    this.data = derive(doc);
    this.save();
  },
  /* set by cloud.js: called after anything that should be uploaded */
  changed() {}
};
Store.load();
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
