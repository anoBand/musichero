/* ================= audio engine =================
   Nothing is synthesized while playing. For each set of chords the four bars are mixed once from recorded
   instrument samples into plain audio buffers (one per part), and those buffers are looped. Playback is then
   only "play this buffer", which a phone can do without dropouts. Switching chords, keys or tempo mixes new
   buffers (a few milliseconds) and crossfades to them at the same spot in the loop. */
const KITS = {
  piano:  { label: '피아노', chord: 'acoustic_grand_piano', melody: 'acoustic_grand_piano', bass: 'electric_bass_finger', strum: 0, level: 1 },
  guitar: { label: '기타', chord: 'acoustic_guitar_steel', melody: 'acoustic_guitar_steel', bass: 'electric_bass_finger', strum: 0.016, level: 0.85 },
  synth:  { label: '신스', chord: 'electric_piano_2', melody: 'electric_piano_2', bass: 'synth_bass_1', strum: 0, level: 0.6 }
};
/* one recorded note every three semitones; notes in between are the nearest recording shifted by a semitone */
const HI_NOTES = [48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81, 84];
const LO_NOTES = [39, 42, 45, 48, 51];
const NOTE_FILE = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const RELEASE = 0.25;
/* overall brightness: high shelf (Hz, dB) on everything, plus a low-pass on the drums */
const TONE = { shelfHz: 2800, shelfDb: -7, drumLowpassHz: 6500 };
let ctx = null;
let bus = null;
let current = null;          /* what is sounding: { t0, when, dur, bars, tempo, tonal, drum, preview } */
let oneShots = [];
let drumVoices = null;
let drumCache = null;
let retimeTimer = null;
let ctxGen = 0;
const sampleCache = {};
const kitLoaded = {};

function ensureAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    /* Output buffer size trades response time against dropouts and the right point differs per phone:
       'interactive' = smallest buffer, 'balanced' = middle, 'playback' = largest. 'balanced' tested well on a phone
       (about 76ms reported output latency, no dropouts); a value saved while testing is still honoured. */
    ctx = new AC({ latencyHint: audioMode() });
    const out = ctx.createDynamicsCompressor();
    out.threshold.value = -12; out.knee.value = 10; out.ratio.value = 4; out.attack.value = 0.005; out.release.value = 0.15;
    out.connect(ctx.destination);
    /* tone: everything passes a high shelf that takes the edge off the top end */
    const tone = ctx.createBiquadFilter();
    tone.type = 'highshelf';
    tone.frequency.value = TONE.shelfHz;
    tone.gain.value = TONE.shelfDb;
    tone.connect(out);
    bus = { master: ctx.createGain(), intro: ctx.createGain(), layer: {}, tone: tone };
    bus.master.gain.value = 0.66;
    bus.master.connect(tone);
    bus.intro.gain.value = 0.7;
    bus.intro.connect(tone);
    Object.keys(layers).forEach((k) => {
      const g = ctx.createGain();
      g.gain.value = layers[k] ? 1 : 0;
      if (k === 'drums') {
        /* the generated hi-hat and cymbal are the brightest thing in the mix: roll them off further */
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = TONE.drumLowpassHz;
        lp.Q.value = 0.5;
        g.connect(lp);
        lp.connect(bus.master);
      } else {
        g.connect(bus.master);
      }
      bus.layer[k] = g;
    });
  }
  if (ctx.state === 'suspended') ctx.resume();
  return true;
}
function audioMode() {
  const m = Store.data.pref.lat;
  return m === 'interactive' || m === 'playback' ? m : 'balanced';
}
function currentKit() { return KITS[state.kit] || KITS.piano; }
function decodeAudio(ab) { return new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)); }
/* mono, cut to start at the first audible sample: MP3 files begin with a few milliseconds of padding */
function trimSample(buf) {
  const n = buf.length;
  const a = buf.getChannelData(0);
  const b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a;
  const mono = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) { const v = (a[i] + b[i]) * 0.5; mono[i] = v; if (v > peak) peak = v; else if (-v > peak) peak = -v; }
  const th = peak * 0.02;
  let start = 0;
  while (start < n && Math.abs(mono[start]) < th) start++;
  return mono.subarray(Math.max(0, start - 24));
}
function loadInstrument(name, midis) {
  if (!sampleCache[name]) {
    sampleCache[name] = Promise.all(midis.map(async (m) => {
      const res = await fetch('samples/' + name + '/' + NOTE_FILE[m % 12] + (Math.floor(m / 12) - 1) + '.mp3');
      if (!res.ok) throw new Error('sample ' + name + ' ' + m);
      return [m, trimSample(await decodeAudio(await res.arrayBuffer()))];
    })).then((pairs) => {
      const inst = { name: name, midis: midis.slice(), data: {}, buf: {} };
      /* the recordings are quiet; bring the whole instrument up by one factor so its loudest note peaks near full scale */
      let peak = 0;
      pairs.forEach((p) => { const d = p[1]; for (let i = 0; i < d.length; i++) { const v = d[i] < 0 ? -d[i] : d[i]; if (v > peak) peak = v; } });
      const k = peak > 0 ? 0.9 / peak : 1;
      pairs.forEach((p) => { const d = p[1]; for (let i = 0; i < d.length; i++) d[i] *= k; inst.data[p[0]] = d; });
      return inst;
    }).catch((e) => { delete sampleCache[name]; throw e; });
  }
  return sampleCache[name];
}
async function loadKit() {
  const id = KITS[state.kit] ? state.kit : 'piano';
  const k = KITS[id];
  const parts = await Promise.all([loadInstrument(k.chord, HI_NOTES), loadInstrument(k.melody, HI_NOTES), loadInstrument(k.bass, LO_NOTES)]);
  kitLoaded[id] = true;
  return { id: id, chord: parts[0], melody: parts[1], bass: parts[2], strum: k.strum, level: k.level };
}

/* drums are generated: a pitched thump, a noise burst over a tone, and filtered noise for the cymbals */
function makeDrums(sr) {
  const noise = (n) => { const a = new Float32Array(n); let prev = 0; for (let i = 0; i < n; i++) { const x = Math.random() * 2 - 1; a[i] = x - prev * 0.85; prev = x; } return a; };
  const kick = new Float32Array(Math.round(sr * 0.32));
  let ph = 0;
  for (let i = 0; i < kick.length; i++) { const t = i / sr; ph += 2 * Math.PI * (48 + 120 * Math.exp(-t * 30)) / sr; kick[i] = Math.sin(ph) * Math.exp(-t * 10) * 0.95; }
  const sn = noise(Math.round(sr * 0.2));
  const snare = new Float32Array(sn.length);
  for (let i = 0; i < snare.length; i++) { const t = i / sr; snare[i] = sn[i] * Math.exp(-t * 24) * 0.42 + Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 34) * 0.4; }
  const hn = noise(Math.round(sr * 0.05));
  const hat = new Float32Array(hn.length);
  for (let i = 1; i < hat.length; i++) hat[i] = (hn[i] - hn[i - 1]) * Math.exp(-(i / sr) * 90) * 0.16;
  const cn = noise(Math.round(sr * 1.3));
  const crash = new Float32Array(cn.length);
  for (let i = 1; i < crash.length; i++) crash[i] = (cn[i] - cn[i - 1]) * Math.exp(-(i / sr) * 3.4) * 0.11;
  /* rim click: a short bright knock */
  const rim = new Float32Array(Math.round(sr * 0.04));
  for (let i = 0; i < rim.length; i++) { const t = i / sr; rim[i] = (Math.sin(2 * Math.PI * 1650 * t) * 0.5 + Math.sin(2 * Math.PI * 520 * t) * 0.4) * Math.exp(-t * 110) * 0.5; }
  return { kick: kick, snare: snare, hat: hat, crash: crash, rim: rim };
}

/* ---- mixing: add one recorded note into a loop buffer, wrapping at the end so the loop has no seam ---- */
function mixSample(out, startIdx, data, ratio, durN, relN, gain) {
  const L = out.length;
  const n = Math.min(durN + relN, Math.floor((data.length - 2) / ratio));
  const fadeFrom = Math.min(durN, Math.max(0, n - relN));
  let k = startIdx % L;
  for (let i = 0; i < n; i++) {
    const pos = i * ratio;
    const j = pos | 0;
    const v = data[j] + (data[j + 1] - data[j]) * (pos - j);
    out[k] += (i < fadeFrom ? v : v * (1 - (i - fadeFrom) / (n - fadeFrom))) * gain;
    if (++k === L) k = 0;
  }
}
function nearestSample(inst, midi) {
  let best = inst.midis[0];
  for (let i = 1; i < inst.midis.length; i++) if (Math.abs(inst.midis[i] - midi) < Math.abs(best - midi)) best = inst.midis[i];
  return best;
}
function mixNote(out, sr, startIdx, inst, midi, durSec, gain, rel) {
  const m = nearestSample(inst, midi);
  mixSample(out, startIdx, inst.data[m], Math.pow(2, (midi - m) / 12), Math.round(durSec * sr), Math.round((rel || RELEASE) * sr), gain);
}
function toBuffer(arr) {
  const b = ctx.createBuffer(1, arr.length, ctx.sampleRate);
  b.getChannelData(0).set(arr);
  return b;
}
/* chords: beats 1 and 3, held for half a bar. bass: the root on beats 1 and 3. melody: root, root, fifth, root an octave up. */
function currentStyle() {
  const id = inPractice() ? practice.style : (state.qStyle || (state.style === 'random' ? 'pop' : state.style));
  return STYLES[id] ? id : 'pop';
}
/* sample index of a sixteenth step inside a bar, with off-beat eighths pushed late by the style's swing */
function stepAt(step, barN, swing) {
  const s16 = barN / 16;
  return Math.round(step * s16 + (swing && step % 4 === 2 ? swing * s16 : 0));
}
function lineNote(base, c, which) {
  if (which === 'f') return c.bassPc === c.pc ? base + 7 : base;
  if (which === 'o') return base + 12;
  if (which === '6') return base + 9;
  return base;
}
function renderStems(chs, tempo, kit, styleId) {
  const sr = ctx.sampleRate;
  const st16 = STYLES[styleId] || STYLES.pop;
  const barN = Math.round(240 / tempo * sr);
  const L = barN * chs.length;
  const s16sec = 15 / tempo;
  const dur = (len) => Math.max(0.06, len * s16sec - 0.03);
  const st = { chord: new Float32Array(L), bass: new Float32Array(L), melody: new Float32Array(L) };
  chs.forEach((c, b) => {
    const base = b * barN;
    st16.chord.forEach((e) => {
      const at = base + stepAt(e[0], barN, st16.swing);
      const vel = jit(e[2]) * 0.62 * kit.level;
      const rel = e[1] <= 1 ? 0.07 : RELEASE;
      if (e[3] === 'all') {
        c.midi.forEach((m, j) => mixNote(st.chord, sr, at + Math.round(j * kit.strum * sr), kit.chord, m, dur(e[1]), vel, rel));
      } else {
        const m = e[3] < 0 ? c.midi[c.midi.length - 1] : c.midi[e[3] % c.midi.length];
        mixNote(st.chord, sr, at, kit.chord, m, dur(e[1]), vel * 1.15, rel);
      }
    });
    st16.bass.forEach((e) => {
      mixNote(st.bass, sr, base + stepAt(e[0], barN, st16.swing), kit.bass, lineNote(c.bassMidi, c, e[3]), dur(e[1]), e[2], e[1] <= 1 ? 0.07 : RELEASE);
    });
    st16.melody.forEach((e) => {
      mixNote(st.melody, sr, base + stepAt(e[0], barN, st16.swing), kit.melody, lineNote(c.bassMidi + 12, c, e[3]), dur(e[1]), e[2] * 0.5 * kit.level, e[1] <= 1 ? 0.07 : RELEASE);
    });
  });
  return { dur: L / sr, bufs: { chord: toBuffer(st.chord), bass: toBuffer(st.bass), melody: toBuffer(st.melody) } };
}
function stemsFor(chs, tempo, kit) {
  const style = currentStyle();
  if (!chs._st || chs._st.tempo !== tempo || chs._st.kit !== kit.id || chs._st.style !== style || chs._st.gen !== ctxGen) {
    const r = renderStems(chs, tempo, kit, style);
    chs._st = { tempo: tempo, kit: kit.id, style: style, gen: ctxGen, dur: r.dur, bufs: r.bufs };
  }
  return chs._st;
}
function drumsFor(bars, tempo, styleId) {
  const style = styleId || currentStyle();
  const key = bars + ':' + tempo + ':' + style;
  if (drumCache && drumCache.key === key) return drumCache.buf;
  const sr = ctx.sampleRate;
  if (!drumVoices) drumVoices = makeDrums(sr);
  const pat = STYLES[style].drums;
  const sw = STYLES[style].swing;
  const barN = Math.round(240 / tempo * sr);
  const out = new Float32Array(barN * bars);
  const hit = (voice, at, vel) => mixSample(out, at, drumVoices[voice], 1, drumVoices[voice].length, 1, vel);
  for (let b = 0; b < bars; b++) {
    const base = b * barN;
    if (b === 0 && bars > 1) hit('crash', base, 0.5);
    ['kick', 'snare', 'rim'].forEach((v) => pat[v].forEach((e) => hit(v, base + stepAt(e[0], barN, sw), e[1])));
    pat.hat.forEach((e) => hit('hat', base + stepAt(e[0], barN, sw), jit(e[1])));
  }
  drumCache = { key: key, buf: toBuffer(out) };
  return drumCache.buf;
}

/* ---- playback ---- */
function startSources(bufs, when, offset, fadeIn) {
  return Object.keys(bufs).map((layer) => {
    const src = ctx.createBufferSource();
    src.buffer = bufs[layer];
    src.loop = true;
    const g = ctx.createGain();
    if (fadeIn) { g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(1, when + 0.03); }
    src.connect(g);
    g.connect(bus.layer[layer]);
    src.start(when, offset % src.buffer.duration);
    return { src: src, g: g };
  });
}
function killSources(list, at) {
  list.forEach((n) => {
    try {
      n.g.gain.cancelScheduledValues(at);
      n.g.gain.setValueAtTime(1, at);
      n.g.gain.linearRampToValueAtTime(0, at + 0.04);
      n.src.stop(at + 0.06);
    } catch (e) {}
  });
}
/* a single recorded note, outside the loop: key preview, tonic on the count-in, notes tried in the key quiz */
function playOne(inst, midi, when, dur, gain) {
  const m = nearestSample(inst, midi);
  if (!inst.buf[m]) inst.buf[m] = toBuffer(inst.data[m]);
  const src = ctx.createBufferSource();
  src.buffer = inst.buf[m];
  src.playbackRate.value = Math.pow(2, (midi - m) / 12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, when);
  g.gain.setValueAtTime(gain, when + dur);
  g.gain.linearRampToValueAtTime(0, when + dur + RELEASE);
  src.connect(g);
  g.connect(bus.intro);
  src.start(when);
  src.stop(when + dur + RELEASE + 0.02);
  const node = { src: src, g: g };
  oneShots.push(node);
  src.onended = () => { oneShots = oneShots.filter((x) => x !== node); };
}
function click(when, accent) {
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = accent ? 1046.5 : 784;
  const g = ctx.createGain();
  g.gain.setValueAtTime(accent ? 0.4 : 0.28, when);
  g.gain.exponentialRampToValueAtTime(0.0008, when + 0.06);
  osc.connect(g);
  g.connect(bus.intro);
  osc.start(when);
  osc.stop(when + 0.08);
  const node = { src: osc, g: g };
  oneShots.push(node);
  osc.onended = () => { oneShots = oneShots.filter((x) => x !== node); };
}
function haltSound() {
  if (!ctx) return;
  const at = ctx.currentTime;
  if (current) { killSources(current.tonal.concat(current.drum), at); current = null; }
  oneShots.forEach((n) => {
    try { n.g.gain.cancelScheduledValues(at); n.g.gain.setValueAtTime(0, at + 0.03); n.src.stop(at + 0.04); } catch (e) {}
  });
  oneShots = [];
}

/* What you see runs ahead of what you hear by the device's audio output delay; shift the visuals back by it. */
function visualLag() {
  return ctx ? Math.min(0.5, (ctx.outputLatency || 0) + (ctx.baseLatency || 0)) : 0;
}
function visualLoop() {
  if (!playing || !current) return;
  const cur = current;
  if (!cur.preview) {
    const t = ctx.currentTime - visualLag();
    if (t >= cur.when) {
      const pos = (((t - cur.t0) % cur.dur) + cur.dur) % cur.dur;
      const e = Math.floor(pos / cur.dur * cur.bars * 8);
      if (e !== cur.lastE) {
        if (cur.lastE === undefined) playbackStatus(inPractice() ? '재생 중' : '재생 중 · 4마디 반복');
        cur.lastE = e;
        setActive(Math.floor(e / 8), Math.floor((e % 8) / 2));
        if (inPractice()) $('#p-loops').textContent = (Math.floor((t - cur.t0) / cur.dur) + 1) + '번째 반복';
      }
    }
  }
  requestAnimationFrame(visualLoop);
}

/* status line: in the quiz, playback messages only show while asking, so the result stays visible after answering */
function setStatus(t, cls) {
  const el = inPractice() ? $('#p-status') : $('#status');
  el.textContent = t;
  el.className = 'status' + (cls ? ' ' + cls : '');
}
function playbackStatus(t) { if (inPractice() || state.phase !== 'answered') setStatus(t); }
function setPlayUi(on) {
  ['#play', '#p-play'].forEach((sel) => {
    const b = $(sel);
    b.querySelector('.ico-play').toggleAttribute('hidden', on);
    b.querySelector('.ico-stop').toggleAttribute('hidden', !on);
    b.querySelector('.lbl-play').textContent = on ? '정지' : (sel === '#play' ? '다시 듣기' : '재생');
  });
}
async function lockScreen() {
  try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { wakeLock = null; }
}
function unlockScreen() {
  try { if (wakeLock) wakeLock.release(); } catch (e) {}
  wakeLock = null;
}

/* A short count-in at the new tempo (2 beats in a quiz, 4 in practice), then the loop from the given bar. */
async function start(opts) {
  opts = opts || {};
  const token = ++playToken;
  if (!ensureAudio()) { playbackStatus('이 브라우저에서는 소리를 낼 수 없어요.'); return; }
  let kit;
  try {
    if (!kitLoaded[state.kit]) playbackStatus('악기 소리를 불러오는 중이에요');
    kit = await loadKit();
  } catch (e) {
    if (token === playToken) playbackStatus('악기 소리를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.');
    return;
  }
  if (token !== playToken) return;
  haltSound();
  const tempo = bpm;
  const stems = stemsFor(chords, tempo, kit);
  const drum = drumsFor(chords.length, tempo);
  const beats = opts.countIn === false ? 0 : (inPractice() ? 4 : 2);
  const beatSec = 60 / tempo;
  const t0c = ctx.currentTime + (beats ? 0.05 : 0.008);
  const when = t0c + beats * beatSec;
  const offset = (opts.bar || 0) * stems.dur / chords.length;
  current = {
    t0: when - offset, when: when, dur: stems.dur, bars: chords.length, tempo: tempo, kit: kit.id, style: currentStyle(),
    tonal: startSources(stems.bufs, when, offset, false), drum: startSources({ drums: drum }, when, offset, false)
  };
  for (let i = 0; i < beats; i++) click(t0c + i * beatSec, i === 0);
  /* progression quiz: the tonic rings on the first count-in beat, so the chords can be heard against home */
  const tonic = beats && !inPractice() && state.q && state.q.type === 'prog';
  if (tonic) playOne(kit.chord, 60 + state.q.key.pc, t0c, beatSec * 0.9, 0.7);
  playing = true;
  setPlayUi(true);
  lockScreen();
  if (beats) playbackStatus(tonic ? '으뜸음을 듣고 곧 시작해요' : '곧 시작해요');
  requestAnimationFrame(visualLoop);
}
function stop(msg, quiet) {
  playToken++;
  const was = playing;
  playing = false;
  haltSound();
  setActive(-1, -1);
  setPlayUi(false);
  if (!quiet) playbackStatus(msg || '정지됨');
  unlockScreen();
  if (was && inPractice()) flushPractice();
}
/* tap a chord block: playback restarts from that bar, without a count-in */
function jumpTo(bar) {
  if (!chords.length || bar < 0 || bar >= chords.length) return;
  if (!inPractice() && state.phase === 'idle') return;
  if (playing) stop(null, true);
  start({ bar: bar, countIn: false });
}
/* The chords, key, tempo or instrument changed while playing: mix the new four bars and crossfade to them at
   the same spot in the loop, so the music carries on instead of starting over. */
async function morph() {
  if (!playing || !current || current.preview) return;
  const token = playToken;
  let kit;
  try { kit = await loadKit(); } catch (e) { return; }
  if (token !== playToken || !current) return;
  const cur = current;
  const tempo = bpm;
  const stems = stemsFor(chords, tempo, kit);
  const now = ctx.currentTime;
  let at, offset;
  if (now + 0.03 < cur.when) {
    at = cur.when;
    offset = (cur.when - cur.t0) / cur.dur * stems.dur;
  } else {
    at = now + 0.03;
    offset = ((((at - cur.t0) % cur.dur) + cur.dur) % cur.dur) / cur.dur * stems.dur;
  }
  killSources(cur.tonal, at);
  cur.tonal = startSources(stems.bufs, at, offset, true);
  if (tempo !== cur.tempo || chords.length !== cur.bars || currentStyle() !== cur.style) {
    killSources(cur.drum, at);
    cur.drum = startSources({ drums: drumsFor(chords.length, tempo) }, at, offset, true);
  }
  cur.t0 = at - offset;
  cur.when = Math.min(cur.when, at);
  cur.dur = stems.dur;
  cur.bars = chords.length;
  cur.tempo = tempo;
  cur.style = currentStyle();
  cur.lastE = -1;
}
/* tempo slider in practice: wait until it settles, then swap */
function retime() {
  clearTimeout(retimeTimer);
  retimeTimer = setTimeout(() => { if (playing) morph(); }, 120);
}
/* a single note of the chosen instrument, 0.7s */
async function previewTonic(pc) {
  if (!ensureAudio()) return;
  let kit;
  try { kit = await loadKit(); } catch (e) { return; }
  clearTimeout(beatTimer);
  if (playing) stop(null, true);
  playOne(kit.chord, 60 + pc, ctx.currentTime + 0.004, 0.7, 0.8);
}
/* about three seconds of drums at the chosen tempo, shortly after the tempo control settles */
function previewBeat() {
  clearTimeout(beatTimer);
  beatTimer = setTimeout(() => {
    if (state.view !== 'setup' || state.bpmMode !== 'fixed' || LEVELS[state.level]) return;
    if (!ensureAudio()) return;
    if (playing) stop(null, true);
    bpm = fixedBpm;
    const token = ++playToken;
    const beats = Math.max(4, Math.round(3 * bpm / 60));
    const when = ctx.currentTime + 0.05;
    current = { preview: true, t0: when, when: when, dur: 240 / bpm, bars: 1, tempo: bpm, tonal: [], drum: startSources({ drums: drumsFor(1, bpm, state.style === 'random' ? 'pop' : state.style) }, when, 0, false) };
    playing = true;
    setTimeout(() => { if (token === playToken) stop(null, true); }, (beats * 60 / bpm + 0.05) * 1000);
  }, 250);
}
/* key quiz: sound one of the offered notes over the backing, an octave above the chords so it stands out */
async function audition(i) {
  if (!ensureAudio()) return;
  let kit;
  try { kit = await loadKit(); } catch (e) { return; }
  playOne(kit.chord, 72 + state.q.options[i].pc, ctx.currentTime + 0.004, 90 / bpm, 0.9);
}
/* get the audio ready on the first touch, so the first sound doesn't wait for it */
document.addEventListener('pointerdown', () => { if (ensureAudio()) loadKit().catch(() => {}); }, { once: true });

/* part on/off, kept in sync across screens */
function setLayer(key, on) {
  layers[key] = on;
  $$('button[data-l="' + key + '"]').forEach((b) => b.setAttribute('aria-pressed', String(on)));
  if (ctx) bus.layer[key].gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.012);
}
/* backing instrument, remembered on this device */
function setKit(id) {
  if (!KITS[id]) return;
  state.kit = id;
  Store.data.pref.kit = id;
  Store.save();
  renderKit();
  if (playing && current && !current.preview) morph();
  else if (ctx) loadKit().catch(() => {});
}
function renderKit() {
  $$('#kits button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === state.kit)));
  $('#p-kit').textContent = '악기: ' + currentKit().label;
}
