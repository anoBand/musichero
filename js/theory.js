/* Music theory and question making: chords, keys, progressions, difficulty presets, voicing.
   No DOM, no audio: also loaded by the unit tests in Node. */
const NOTE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITIES = {
  '': [0, 4, 7], 'm': [0, 3, 7], '7': [0, 4, 7, 10], 'maj7': [0, 4, 7, 11], 'M7': [0, 4, 7, 11],
  'm7': [0, 3, 7, 10], 'dim': [0, 3, 6], 'aug': [0, 4, 8], 'sus4': [0, 5, 7], 'sus2': [0, 2, 7],
  '6': [0, 4, 7, 9], 'm6': [0, 3, 7, 9], 'add9': [0, 4, 7, 14],
  'm7b5': [0, 3, 6, 10], 'dim7': [0, 3, 6, 9], '7sus4': [0, 5, 7, 10], '9': [0, 4, 7, 10, 14],
  'm9': [0, 3, 7, 10, 14], 'maj9': [0, 4, 7, 11, 14], 'mmaj7': [0, 3, 7, 11], '5': [0, 7]
};
/* other ways people write the same chord */
const QUALITY_ALIAS = { 'min': 'm', '-': 'm', 'M': '', 'maj': '', 'Δ': 'maj7', 'Δ7': 'maj7', 'ma7': 'maj7', 'min7': 'm7', '-7': 'm7',
  'ø': 'm7b5', 'ø7': 'm7b5', 'o': 'dim', 'o7': 'dim7', '°': 'dim', '°7': 'dim7', '+': 'aug', 'sus': 'sus4', 'mM7': 'mmaj7' };
function accOf(s) { return s === '#' ? 1 : s === 'b' ? -1 : 0; }
function accGlyph(s) { return s === '#' ? '♯' : s === 'b' ? '♭' : ''; }
function parseChord(raw) {
  const token = (raw.charAt(0).toUpperCase() + raw.slice(1)).replace(/\/([a-g])/, (m, l) => '/' + l.toUpperCase());
  const m = /^([A-G])([#b]?)([^/]*)(?:\/([A-G])([#b]?))?$/.exec(token);
  if (!m) return null;
  const quality = QUALITIES[m[3]] ? m[3] : QUALITY_ALIAS[m[3]];
  const intervals = quality === undefined ? null : QUALITIES[quality];
  if (!intervals) return null;
  m[3] = quality;
  const pc = (NOTE_PC[m[1]] + accOf(m[2]) + 12) % 12;
  const bassPc = m[4] ? (NOTE_PC[m[4]] + accOf(m[5]) + 12) % 12 : pc;
  return {
    token: token,
    root: m[1] + accGlyph(m[2]),
    quality: m[3],
    slash: m[4] ? m[4] + accGlyph(m[5]) : '',
    pc: pc, bassPc: bassPc, intervals: intervals
  };
}

/* Common progressions. steps = [semitones above the tonic, chord quality]. */
const POOL = [
  /* major, starting on I */
  { id: 'axis',     mode: 'major', roman: 'I–V–vi–IV',        name: '팝 진행',                 steps: [[0, ''], [7, ''], [9, 'm'], [5, '']] },
  { id: 'fifties',  mode: 'major', roman: 'I–vi–IV–V',        name: '50년대 진행',             steps: [[0, ''], [9, 'm'], [5, ''], [7, '']] },
  { id: 'turn',     mode: 'major', roman: 'I–vi–ii–V',        name: '턴어라운드',              steps: [[0, ''], [9, 'm'], [2, 'm'], [7, '']] },
  { id: 'three',    mode: 'major', roman: 'I–IV–V–I',         name: '기본 3코드',              steps: [[0, ''], [5, ''], [7, ''], [0, '']] },
  { id: 'mixo',     mode: 'major', roman: 'I–♭VII–IV–I',      name: '믹솔리디안 록 진행',      steps: [[0, ''], [10, ''], [5, ''], [0, '']] },
  /* major, starting elsewhere */
  { id: 'axis2',    mode: 'major', roman: 'vi–IV–I–V',        name: '팝 진행 (6도 시작)',      steps: [[9, 'm'], [5, ''], [0, ''], [7, '']] },
  { id: 'axis4',    mode: 'major', roman: 'IV–I–V–vi',        name: '팝 진행 (4도 시작)',      steps: [[5, ''], [0, ''], [7, ''], [9, 'm']] },
  { id: 'royal',    mode: 'major', roman: 'IV–V–iii–vi',      name: '4536 진행 (로열 로드)',   steps: [[5, ''], [7, ''], [4, 'm'], [9, 'm']] },
  { id: 'circle6',  mode: 'major', roman: 'vi–ii–V–I',        name: '5도권 진행',              steps: [[9, 'm'], [2, 'm'], [7, ''], [0, '']] },
  { id: 'aeol',     mode: 'major', roman: 'vi–V–IV–V',        name: '',                        steps: [[9, 'm'], [7, ''], [5, ''], [7, '']] },
  { id: 'twofive',  mode: 'major', roman: 'ii7–V7–Imaj7–Imaj7', name: '재즈 투파이브원',       steps: [[2, 'm7'], [7, '7'], [0, 'maj7'], [0, 'maj7']] },
  { id: 'desc-vi',  mode: 'major', roman: 'vi–V–IV–I',        name: '순차 하행 진행',          steps: [[9, 'm'], [7, ''], [5, ''], [0, '']] },
  { id: 'min-plagal', mode: 'major', roman: 'IV–iv–I–I',      name: '마이너 플래걸 진행',      steps: [[5, ''], [5, 'm'], [0, ''], [0, '']] },
  { id: 'sec-dom',  mode: 'major', roman: 'I–III7–vi–IV',     name: '세컨더리 도미넌트 진행',  steps: [[0, ''], [4, '7'], [9, 'm'], [5, '']] },
  /* minor, starting on i */
  { id: 'andalus',  mode: 'minor', roman: 'i–♭VII–♭VI–V',     name: '안달루시안 진행',         steps: [[0, 'm'], [10, ''], [8, ''], [7, '']] },
  { id: 'min-145',  mode: 'minor', roman: 'i–iv–V–i',         name: '마이너 기본 진행',        steps: [[0, 'm'], [5, 'm'], [7, ''], [0, 'm']] },
  { id: 'min-6375', mode: 'minor', roman: 'i–♭VI–♭III–♭VII',  name: '팝 진행의 마이너판',        steps: [[0, 'm'], [8, ''], [3, ''], [10, '']] },
  { id: 'min-67',   mode: 'minor', roman: 'i–♭VI–♭VII–i',     name: '',                        steps: [[0, 'm'], [8, ''], [10, ''], [0, 'm']] },
  { id: 'min-3',    mode: 'minor', roman: 'i–♭III–♭VII–♭VI',  name: '',                        steps: [[0, 'm'], [3, ''], [10, ''], [8, '']] },
  /* minor, starting elsewhere */
  { id: 'epic',     mode: 'minor', roman: '♭VI–♭VII–i–i',     name: '에픽 진행',               steps: [[8, ''], [10, ''], [0, 'm'], [0, 'm']] },
  { id: 'min-circ', mode: 'minor', roman: 'iv–♭VII–♭III–♭VI', name: '마이너 5도권 진행',         steps: [[5, 'm'], [10, ''], [3, ''], [8, '']] },
  { id: 'min-6371', mode: 'minor', roman: '♭VI–♭III–♭VII–i',  name: '',                        steps: [[8, ''], [3, ''], [10, ''], [0, 'm']] },
  { id: 'min-iv',   mode: 'minor', roman: 'iv–i–♭VII–♭VI',    name: '',                        steps: [[5, 'm'], [0, 'm'], [10, ''], [8, '']] }
];
/* Backing styles. One bar on a grid of sixteenths, repeated for every chord.
   chord:  [step, length, velocity, voice]  voice 'all' = the whole chord, a number = that note of the voicing
           (from the bottom; -1 = top), for arpeggios
   bass, melody: [step, length, velocity, note]  note 'r' root, 'f' fifth, 'o' octave, '6' sixth
   drums: kick / snare / rim / hat: [step, velocity]
   swing: how far off-beat eighths are pushed late, in sixteenths (0.667 = triplet shuffle) */
const STYLES = {
  pop: { label: '팝', swing: 0,
    chord: [[0, 8, 0.85, 'all'], [8, 8, 0.62, 'all']],
    bass: [[0, 8, 0.5, 'r'], [8, 8, 0.42, 'r']],
    melody: [[0, 3, 0.9, 'r'], [6, 2, 0.7, 'r'], [8, 3, 0.8, 'f'], [12, 2, 0.7, 'r']],
    drums: { kick: [[0, 0.55], [8, 0.55]], snare: [[4, 0.5], [12, 0.5]], rim: [],
             hat: [[0, 0.55], [2, 0.3], [4, 0.55], [6, 0.3], [8, 0.55], [10, 0.3], [12, 0.55], [14, 0.3]] } },
  ballad: { label: '발라드', swing: 0,
    chord: [[0, 6, 0.7, 0], [2, 6, 0.5, 1], [4, 6, 0.55, 2], [6, 6, 0.5, -1], [8, 6, 0.62, 0], [10, 6, 0.5, 1], [12, 6, 0.55, 2], [14, 4, 0.48, 1]],
    bass: [[0, 15, 0.5, 'r']],
    melody: [[0, 6, 0.6, 'o'], [8, 6, 0.5, 'f']],
    drums: { kick: [[0, 0.45], [10, 0.28]], snare: [[4, 0.3], [12, 0.3]], rim: [], hat: [[0, 0.3], [4, 0.25], [8, 0.3], [12, 0.25]] } },
  rock: { label: '록', swing: 0,
    chord: [[0, 2, 0.7, 'all'], [2, 2, 0.48, 'all'], [4, 2, 0.6, 'all'], [6, 2, 0.48, 'all'], [8, 2, 0.7, 'all'], [10, 2, 0.48, 'all'], [12, 2, 0.6, 'all'], [14, 2, 0.48, 'all']],
    bass: [[0, 2, 0.5, 'r'], [2, 2, 0.4, 'r'], [4, 2, 0.45, 'r'], [6, 2, 0.4, 'r'], [8, 2, 0.5, 'r'], [10, 2, 0.4, 'r'], [12, 2, 0.45, 'r'], [14, 2, 0.4, 'r']],
    melody: [[0, 4, 0.8, 'r'], [6, 2, 0.6, 'o'], [8, 4, 0.75, 'f'], [14, 2, 0.6, 'r']],
    drums: { kick: [[0, 0.6], [6, 0.45], [8, 0.6]], snare: [[4, 0.6], [12, 0.6]], rim: [],
             hat: [[0, 0.5], [2, 0.38], [4, 0.5], [6, 0.38], [8, 0.5], [10, 0.38], [12, 0.5], [14, 0.38]] } },
  funk: { label: '펑크', swing: 0,
    chord: [[2, 1, 0.6, 'all'], [3, 1, 0.45, 'all'], [6, 1, 0.6, 'all'], [10, 1, 0.6, 'all'], [11, 1, 0.45, 'all'], [14, 1, 0.6, 'all']],
    bass: [[0, 2, 0.6, 'r'], [3, 1, 0.45, 'o'], [6, 2, 0.5, 'r'], [8, 1, 0.55, 'f'], [10, 2, 0.5, 'r'], [13, 1, 0.45, 'o'], [14, 2, 0.5, 'r']],
    melody: [[0, 2, 0.7, 'o'], [7, 1, 0.6, 'f'], [12, 2, 0.6, 'o']],
    drums: { kick: [[0, 0.6], [7, 0.4], [10, 0.5]], snare: [[4, 0.6], [12, 0.6], [15, 0.18]], rim: [],
             hat: [[0, 0.4], [1, 0.18], [2, 0.3], [3, 0.18], [4, 0.4], [5, 0.18], [6, 0.3], [7, 0.18], [8, 0.4], [9, 0.18], [10, 0.3], [11, 0.18], [12, 0.4], [13, 0.18], [14, 0.3], [15, 0.18]] } },
  bossa: { label: '보사노바', swing: 0,
    chord: [[0, 3, 0.5, 'all'], [3, 3, 0.42, 'all'], [6, 2, 0.42, 'all'], [10, 3, 0.48, 'all'], [13, 3, 0.42, 'all']],
    bass: [[0, 6, 0.5, 'r'], [6, 2, 0.38, 'f'], [8, 6, 0.48, 'f'], [14, 2, 0.38, 'r']],
    melody: [[0, 4, 0.55, 'o'], [8, 4, 0.5, 'f']],
    drums: { kick: [[0, 0.4], [6, 0.28], [8, 0.4], [14, 0.28]], snare: [], rim: [[0, 0.4], [3, 0.4], [6, 0.4], [10, 0.4], [13, 0.4]],
             hat: [[0, 0.25], [2, 0.2], [4, 0.25], [6, 0.2], [8, 0.25], [10, 0.2], [12, 0.25], [14, 0.2]] } },
  shuffle: { label: '셔플', swing: 0.667,
    chord: [[4, 3, 0.55, 'all'], [12, 3, 0.55, 'all'], [10, 1, 0.38, 'all']],
    bass: [[0, 2, 0.55, 'r'], [2, 2, 0.4, 'r'], [4, 2, 0.5, 'f'], [6, 2, 0.4, 'f'], [8, 2, 0.5, '6'], [10, 2, 0.4, '6'], [12, 2, 0.5, 'f'], [14, 2, 0.4, 'f']],
    melody: [],
    drums: { kick: [[0, 0.55], [8, 0.55]], snare: [[4, 0.55], [12, 0.55]], rim: [],
             hat: [[0, 0.5], [2, 0.35], [4, 0.5], [6, 0.35], [8, 0.5], [10, 0.35], [12, 0.5], [14, 0.35]] } }
};
const STYLE_IDS = Object.keys(STYLES);
/* Chord-quality quiz: one chord, name its kind. The sets grow with the difficulty preset. */
const QUAL_NAMES = { '': '메이저', 'm': '마이너', '7': '도미넌트 7', 'maj7': '메이저 7', 'm7': '마이너 7',
  'dim': '디미니시', 'aug': '오그먼트', 'sus4': '서스 4', 'm7b5': '하프 디미니시' };
const QUAL_FORMULA = { '': '1 3 5', 'm': '1 ♭3 5', '7': '1 3 5 ♭7', 'maj7': '1 3 5 7', 'm7': '1 ♭3 5 ♭7',
  'dim': '1 ♭3 ♭5', 'aug': '1 3 ♯5', 'sus4': '1 4 5', 'm7b5': '1 ♭3 ♭5 ♭7' };
const QUAL_SETS = { easy: ['', 'm'], mid: ['', 'm', '7', 'maj7', 'm7'], hard: ['', 'm', '7', 'maj7', 'm7', 'dim', 'aug', 'sus4', 'm7b5'] };
/* levelId picks the set (anything else: the full set); forced asks for one quality (review) */
function makeQualQuestion(levelId, last, forced) {
  const set = QUAL_SETS[levelId] || QUAL_SETS.hard;
  const has = forced !== undefined && forced !== null;
  const all = has && set.indexOf(forced) < 0 ? set.concat([forced]) : set;
  const quality = has ? forced : pickOther(set, (x) => last && x === last.id);
  const key = keyObj('major', Math.floor(Math.random() * 12));
  const make = (qq) => parseChord(key.name + qq);
  const options = all.map((qq) => ({ id: qq, label: QUAL_NAMES[qq], sub: QUAL_FORMULA[qq], chords: [make(qq)] }));
  return { type: 'qual', mode: 'major', key: key, quality: quality, prog: null, answerId: quality, itemId: quality,
    options: options, chords: [make(quality)] };
}
function startsOnTonic(p) { return p.steps[0][0] === 0; }
/* Per-progression survey: d = how hard it is to tell by ear (1 easy – 5 hard), which builds the presets; keys
   (pitch classes of the tonic) and bpm are where it commonly turns up. Kept for reference only: tying a quiz key
   or tempo to one progression would give the answer away. */
const PROG_INFO = {
  axis: { d: 1, keys: [0, 11, 4], bpm: [72, 150] },        fifties: { d: 1, keys: [9, 3, 11], bpm: [116, 138] },
  turn: { d: 2, keys: [8, 2], bpm: [70, 102] },             three: { d: 1, keys: [0, 2, 9], bpm: [116, 150] },
  mixo: { d: 3, keys: [1, 2, 7], bpm: [85, 140] },          axis2: { d: 2, keys: [9, 7, 11], bpm: [84, 130] },
  axis4: { d: 2, keys: [0, 3], bpm: [78, 119] },            royal: { d: 3, keys: [2, 8, 3], bpm: [92, 116] },
  circle6: { d: 3, keys: [0, 7, 5], bpm: [70, 119] },       aeol: { d: 2, keys: [4, 3, 1], bpm: [105, 128] },
  twofive: { d: 2, keys: [0, 1], bpm: [88, 104] },          'desc-vi': { d: 2 }, 'min-plagal': { d: 2 }, 'sec-dom': { d: 3 },
  andalus: { d: 1, keys: [8, 6, 4], bpm: [114, 125] },      'min-145': { d: 1, keys: [9, 2, 11], bpm: [95, 130] },
  'min-6375': { d: 2, keys: [5, 11], bpm: [83, 116] },      'min-67': { d: 2, keys: [2, 3], bpm: [80, 129] },
  'min-3': { d: 3, keys: [11, 5, 4], bpm: [79, 140] },      epic: { d: 2, keys: [4, 1, 5], bpm: [99, 150] },
  'min-circ': { d: 3, keys: [9, 5, 4], bpm: [98, 126] },    'min-6371': { d: 3, keys: [0, 3], bpm: [90, 120] },
  'min-iv': { d: 4, keys: [9, 2], bpm: [96, 135] }
};
function progDifficulty(id) { return (PROG_INFO[id] && PROG_INFO[id].d) || 3; }
/* Difficulty presets: which progressions, which keys, which tempo range, and which notes compete with the tonic
   in the key quiz (scale degrees).
   하수: major only, progressions built from I, IV, V and vi; common keys; a steady medium tempo.
   중수: every progression rated 1–2, major and minor; more keys; a wider tempo range.
   고수: everything, in all twelve keys. */
const LEVELS = {
  easy: { label: '하수', setting: 'major', ids: ['axis', 'fifties', 'three', 'axis2', 'axis4'],
          keys: { major: [0, 7, 2, 5, 9], minor: [9, 4, 2] }, bpm: [80, 100], probe: [2, 4, 7], xp: 10 },
  mid:  { label: '중수', setting: 'mixed', ids: POOL.filter((p) => progDifficulty(p.id) <= 2).map((p) => p.id),
          keys: { major: [0, 2, 4, 5, 7, 9, 10, 3], minor: [9, 4, 2, 11, 7, 0] }, bpm: [75, 120], probe: [2, 4, 5], xp: 15 },
  hard: { label: '고수', setting: 'mixed', ids: null, keys: null, bpm: [70, 140], probe: [3, 5, 6], xp: 20 }
};
/* Roman numeral of a chord given as [semitones above the tonic, quality]: lower case for minor chords. */
const ROMAN = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♯IV', 'V', '♭VI', 'VI', '♭VII', 'VII'];
function romanOf(step) {
  const q = step[1];
  const minor = q.charAt(0) === 'm' && q.indexOf('maj') !== 0;
  const base = minor ? ROMAN[step[0]].toLowerCase() : ROMAN[step[0]];
  return base + (minor ? q.slice(1) : q);
}
/* Written answers: every distinct chord used by the progressions that can come up, in this key, ordered by degree. */
function paletteFor(q, cfg) {
  const seen = {};
  const steps = [];
  poolFor(q.mode, cfg).forEach((p) => p.steps.forEach((st) => {
    const k = st[0] + '|' + st[1];
    if (!seen[k]) { seen[k] = true; steps.push(st); }
  }));
  steps.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
  return steps.map((st) => {
    const token = rootName(q.key, q.mode, st[0]) + st[1];
    const c = parseChord(token);
    return { step: st, token: token, label: c.root + c.quality, roman: romanOf(st) };
  });
}
function sameSteps(a, b) { return a.length === b.length && a.every((st, i) => st[0] === b[i][0] && st[1] === b[i][1]); }
const DEGREE_SHORT = ['1도', '♭2도', '2도', '♭3도', '3도', '4도', '♭5도', '5도', '♭6도', '6도', '♭7도', '7도'];
function poolFor(mode, cfg) { return POOL.filter((p) => p.mode === mode && (!cfg || !cfg.ids || cfg.ids.indexOf(p.id) >= 0)); }
function keyChoices(mode, cfg) { return keysFor(mode).filter((k) => !cfg || !cfg.keys || cfg.keys[mode].indexOf(k.pc) >= 0); }
function randomIn(range) { return range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1)); }
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/* How the five black-key keys are named: 'flat' (D♭) or 'sharp' (C♯). Set from the home screen. */
let ACCIDENTAL = 'flat';
/* white-key keys whose chords are written with flats by convention (F major; C, D, F, G minor) */
const WHITE_FLAT = { major: { 5: true }, minor: { 0: true, 2: true, 5: true, 7: true } };
/* Chords follow the key: a key named with a flat uses flats, one named with a sharp uses sharps, and
   white-key keys use their usual signature (E major -> C#m, F major -> Bb). id never changes with the setting. */
function keyObj(mode, pc) {
  const black = [1, 3, 6, 8, 10].indexOf(pc) >= 0;
  const flat = black ? ACCIDENTAL === 'flat' : !!WHITE_FLAT[mode][pc];
  return { name: (black && ACCIDENTAL === 'sharp' ? SHARP_NAMES : FLAT_NAMES)[pc], pc: pc, flat: flat, id: FLAT_NAMES[pc] };
}
function keysFor(mode) { return FLAT_NAMES.map((n, pc) => keyObj(mode, pc)); }
/* accepts either spelling, including ids saved earlier ('F#' and 'Gb' are the same key) */
function keyByName(name, mode) { return keyObj(mode, (NOTE_PC[name.charAt(0)] + accOf(name.charAt(1)) + 12) % 12); }
const SOLFEGE = { C: '도', D: '레', E: '미', F: '파', G: '솔', A: '라', B: '시' };
const BPM_MIN = 70, BPM_MAX = 130;

function keyLabel(k) { return k.name.charAt(0) + (k.name.length > 1 ? accGlyph(k.name.charAt(1)) : ''); }
function solfege(k) { return SOLFEGE[k.name.charAt(0)] + (k.name.length > 1 ? accGlyph(k.name.charAt(1)) : ''); }
function modeWord(mode) { return mode === 'major' ? '메이저' : '마이너'; }
function randomBpm() { return BPM_MIN + Math.floor(Math.random() * (BPM_MAX - BPM_MIN + 1)); }
/* Root name for a chord degree. Borrowed degrees (♭II, ♭III, ♭VI, ♭VII) in a major key are written with flats
   whatever the key: C major's ♭VII is B♭, not A♯. */
function rootName(key, mode, step) {
  const borrowed = mode === 'major' && [1, 3, 8, 10].indexOf(step) >= 0;
  return (key.flat || borrowed ? FLAT_NAMES : SHARP_NAMES)[(key.pc + step) % 12];
}
function chordsFor(prog, key) {
  return prog.steps.map((s) => parseChord(rootName(key, prog.mode, s[0]) + s[1]));
}
function chordText(chs) { return chs.map((c) => c.root + c.quality).join(' '); }
function shuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = r[i]; r[i] = r[j]; r[j] = t;
  }
  return r;
}
function pickOther(list, isSame) {
  const rest = list.filter((x) => !isSame(x));
  const from = rest.length ? rest : list;
  return from[Math.floor(Math.random() * from.length)];
}
function pickMode(setting) { return setting === 'mixed' ? (Math.random() < 0.65 ? 'major' : 'minor') : setting; }

/* Which progression is this? setting: 'major' | 'minor' | 'mixed'. keyPc fixes the tonic. forcedId asks for one progression (review). */
function makeProgQuestion(setting, last, keyPc, forcedId, cfg) {
  const mode = pickMode(setting);
  const pool = poolFor(mode, cfg);
  let answer = forcedId ? pool.find((p) => p.id === forcedId) : null;
  if (!answer) {
    /* half the answers start on the tonic, half elsewhere, whatever the pool sizes */
    const tonicFirst = Math.random() < 0.5;
    const group = pool.filter((p) => startsOnTonic(p) === tonicFirst);
    answer = pickOther(group.length ? group : pool, (p) => last && p.id === last.id);
  }
  const key = (keyPc === null || keyPc === undefined)
    ? pickOther(keyChoices(mode, cfg), (k) => last && last.key === mode + k.id)
    : keyObj(mode, keyPc);
  /* at least one wrong choice opens on the same chord as the answer, so the first bar alone doesn't give it away */
  const others = pool.filter((p) => p.id !== answer.id);
  const sameStart = shuffle(others.filter((p) => p.steps[0][0] === answer.steps[0][0] && p.steps[0][1].charAt(0) === answer.steps[0][1].charAt(0)));
  const wrong = sameStart.slice(0, 1);
  shuffle(others.filter((p) => wrong.indexOf(p) < 0)).slice(0, 3 - wrong.length).forEach((p) => wrong.push(p));
  const options = shuffle([answer].concat(wrong)).map((p) => {
    const chs = chordsFor(p, key);
    return { id: p.id, label: chordText(chs), sub: p.roman, chords: chs };
  });
  return { type: 'prog', mode: mode, key: key, prog: answer, answerId: answer.id, itemId: answer.id, options: options, chords: chordsFor(answer, key) };
}
/* Where is home? The backing plays in a hidden key and four notes are offered: the tonic and three other scale
   degrees. The listener tries each note over the backing and picks the one that sounds like home.
   forcedKey asks for one key (review). cfg.probe names the competing degrees. */
const DEGREE_SEMIS = { 2: [2, 2], 3: [4, 3], 4: [5, 5], 5: [7, 7], 6: [9, 8], 7: [11, 10] };
function makeKeyQuestion(setting, last, forcedKey, cfg, free) {
  const mode = pickMode(setting);
  const pool = poolFor(mode, cfg);
  const prog = pickOther(pool, (p) => last && p.id === last.id);
  let key = forcedKey ? keyByName(forcedKey, mode) : null;
  if (!key) key = pickOther(keyChoices(mode, cfg), (k) => last && last.key === mode + k.id);
  const chs = chordsFor(prog, key);
  const names = key.flat ? FLAT_NAMES : SHARP_NAMES;
  const degrees = cfg && cfg.probe ? cfg.probe : shuffle([2, 3, 4, 5, 6, 7]).slice(0, 3);
  const options = shuffle([1].concat(degrees)).map((deg) => {
    const pc = (key.pc + (deg === 1 ? 0 : DEGREE_SEMIS[deg][mode === 'major' ? 0 : 1])) % 12;
    return {
      id: FLAT_NAMES[pc], pc: pc, label: names[pc].charAt(0) + accGlyph(names[pc].charAt(1)), sub: '눌러서 들어보기',
      degree: deg === 1 ? '으뜸음 (1도)' : deg + '도', chords: chs
    };
  });
  /* written answer: all twelve notes instead of four candidates */
  const all = FLAT_NAMES.map((id, pc) => ({
    id: id, pc: pc, label: names[pc].charAt(0) + accGlyph(names[pc].charAt(1)), sub: '',
    degree: DEGREE_SHORT[(pc - key.pc + 12) % 12], chords: chs
  }));
  return { type: 'key', mode: mode, key: key, prog: prog, answerId: key.id, itemId: key.id, options: free ? all : options, free: !!free, chords: chs };
}

/* Voice leading: pick the inversion/octave of each chord that moves least from the previous one. */
function voicingCandidates(c) {
  const pcs = c.intervals.map((i) => (c.pc + i) % 12);
  const out = [];
  for (let k = 0; k < pcs.length; k++) {
    const rot = pcs.slice(k).concat(pcs.slice(0, k));
    for (let low = 52; low <= 64; low++) {
      if (low % 12 !== rot[0]) continue;
      const notes = [low];
      for (let j = 1; j < rot.length; j++) {
        let n = notes[j - 1] + 1;
        while (n % 12 !== rot[j]) n++;
        notes.push(n);
      }
      out.push(notes);
    }
  }
  return out;
}
function voicingCost(prev, cand) {
  const top = cand[cand.length - 1];
  const bottom = cand[0];
  let pen = 0;
  if (top > 76) pen += (top - 76) * 3;
  if (bottom < 52) pen += (52 - bottom) * 3;
  if (!prev) {
    const mean = cand.reduce((a, b) => a + b, 0) / cand.length;
    return Math.abs(mean - 63) + pen;
  }
  let d = 0;
  cand.forEach((n) => { d += Math.min.apply(null, prev.map((p) => Math.abs(p - n))); });
  prev.forEach((p) => { d += Math.min.apply(null, cand.map((n) => Math.abs(p - n))); });
  return d + pen;
}
function voiceLeading(chs) {
  let best = null;
  voicingCandidates(chs[0]).forEach((first) => {
    const seq = [first];
    let total = voicingCost(null, first);
    for (let i = 1; i < chs.length; i++) {
      let pick = null, pc = Infinity;
      voicingCandidates(chs[i]).forEach((cd) => {
        const cost = voicingCost(seq[i - 1], cd);
        if (cost < pc) { pc = cost; pick = cd; }
      });
      seq.push(pick);
      total += pc;
    }
    total += voicingCost(seq[seq.length - 1], first) * 0.5;
    if (!best || total < best.total) best = { total: total, seq: seq };
  });
  return best.seq;
}
/* closest assignment of voices to target notes; every target is used once before any is doubled */
function assign(from, targets) {
  let best = null, bestCost = Infinity;
  const pick = [];
  const used = targets.map(() => 0);
  (function rec(i, cost) {
    if (cost >= bestCost) return;
    if (i === from.length) { bestCost = cost; best = pick.slice(); return; }
    const allUsed = used.every((u) => u > 0);
    for (let j = 0; j < targets.length; j++) {
      if (used[j] && !allUsed) continue;
      used[j]++;
      pick[i] = targets[j];
      rec(i + 1, cost + Math.abs(from[i] - targets[j]));
      used[j]--;
    }
  })(0, 0);
  return best;
}

if (typeof module !== 'undefined') {
  module.exports = {
    NOTE_PC, QUALITIES, POOL, FLAT_NAMES, SHARP_NAMES, LEVELS, PROG_INFO, ROMAN,
    parseChord, keyObj, keysFor, keyByName, keyLabel, solfege, modeWord, chordsFor, chordText, rootName,
    startsOnTonic, poolFor, keyChoices, randomIn, randomBpm, makeProgQuestion, makeKeyQuestion,
    paletteFor, sameSteps, romanOf, voiceLeading, assign, progDifficulty, STYLES, STYLE_IDS, makeQualQuestion, QUAL_SETS, QUAL_NAMES,
    setAccidental: (a) => { ACCIDENTAL = a; }
  };
}
