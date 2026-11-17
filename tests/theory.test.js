// Unit tests for js/theory.js: question making, spelling, presets, voicing.  Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/theory.js');

const RUNS = 400;
const presets = [null, T.LEVELS.easy, T.LEVELS.mid, T.LEVELS.hard];

test('every progression parses in every key and both spellings', () => {
  for (const acc of ['flat', 'sharp']) {
    T.setAccidental(acc);
    for (const p of T.POOL) for (const k of T.keysFor(p.mode)) {
      const chs = T.chordsFor(p, k);
      assert.equal(chs.length, p.steps.length);
      chs.forEach((c) => assert.ok(c, `${p.id} in ${k.name}`));
    }
  }
  T.setAccidental('flat');
});

test('no duplicate progressions, every one has survey data', () => {
  const sig = T.POOL.map((p) => p.mode + JSON.stringify(p.steps));
  assert.equal(new Set(sig).size, T.POOL.length);
  T.POOL.forEach((p) => assert.ok(T.PROG_INFO[p.id], p.id));
});

test('spelling: key names follow the setting, chords follow convention', () => {
  const axis = T.POOL.find((p) => p.id === 'axis');
  const mixo = T.POOL.find((p) => p.id === 'mixo');
  T.setAccidental('flat');
  assert.equal(T.keysFor('major').map(T.keyLabel).join(' '), 'C D♭ D E♭ E F G♭ G A♭ A B♭ B');
  assert.equal(T.chordText(T.chordsFor(axis, T.keyObj('major', 4))), 'E B C♯m A');
  assert.equal(T.chordText(T.chordsFor(axis, T.keyObj('major', 1))), 'D♭ A♭ B♭m G♭');
  assert.equal(T.chordText(T.chordsFor(mixo, T.keyObj('major', 0))), 'C B♭ F C');
  T.setAccidental('sharp');
  assert.equal(T.chordText(T.chordsFor(axis, T.keyObj('major', 1))), 'C♯ G♯ A♯m F♯');
  assert.equal(T.chordText(T.chordsFor(axis, T.keyObj('major', 5))), 'F C Dm B♭');
  assert.equal(T.keyByName('Gb', 'major').name, 'F#');
  T.setAccidental('flat');
  assert.equal(T.keyByName('F#', 'major').id, 'Gb');
});

test('progression questions: four distinct options inside the preset, answer included', () => {
  for (const lv of presets) {
    const setting = lv ? lv.setting : 'mixed';
    for (let i = 0; i < RUNS; i++) {
      const q = T.makeProgQuestion(setting, null, null, null, lv);
      const ids = q.options.map((o) => o.id);
      assert.equal(new Set(ids).size, 4);
      assert.ok(ids.includes(q.answerId));
      if (lv && lv.ids) ids.forEach((id) => assert.ok(lv.ids.includes(id), id));
      if (lv && lv.keys) assert.ok(lv.keys[q.mode].includes(q.key.pc));
      const tonic = q.chords.find((c, j) => q.prog.steps[j][0] === 0);
      if (tonic) assert.equal(tonic.root, T.keyLabel(q.key));
    }
  }
});

test('progression questions: about half start on the tonic', () => {
  let tonic = 0;
  for (let i = 0; i < 2000; i++) if (T.startsOnTonic(T.makeProgQuestion('mixed', null, null, null, null).prog)) tonic++;
  assert.ok(tonic > 850 && tonic < 1150, String(tonic));
});

test('key questions: multiple choice has one tonic among four, written has all twelve', () => {
  for (const lv of presets) {
    const setting = lv ? lv.setting : 'mixed';
    for (let i = 0; i < RUNS; i++) {
      const q = T.makeKeyQuestion(setting, null, null, lv);
      assert.equal(new Set(q.options.map((o) => o.id)).size, 4);
      assert.equal(q.options.filter((o) => o.pc === q.key.pc).length, 1);
      const w = T.makeKeyQuestion(setting, null, null, lv, true);
      assert.equal(w.options.length, 12);
      assert.equal(w.options.find((o) => o.id === w.answerId).degree, '1도');
    }
  }
});

test('written progression answers: the palette always contains the answer', () => {
  for (const lv of presets) {
    for (let i = 0; i < RUNS; i++) {
      const q = T.makeProgQuestion(lv ? lv.setting : 'mixed', null, null, null, lv);
      const pal = T.paletteFor(q, lv);
      assert.ok(pal.length <= 12);
      assert.equal(new Set(pal.map((x) => x.label)).size, pal.length);
      q.prog.steps.forEach((st) => assert.ok(pal.some((x) => T.sameSteps([x.step], [st]))));
    }
  }
});

test('presets: enough progressions, tempo range is respected', () => {
  for (const id of Object.keys(T.LEVELS)) {
    const lv = T.LEVELS[id];
    for (const m of lv.setting === 'major' ? ['major'] : ['major', 'minor']) assert.ok(T.poolFor(m, lv).length >= 4, id + m);
    for (let i = 0; i < 200; i++) { const b = T.randomIn(lv.bpm); assert.ok(b >= lv.bpm[0] && b <= lv.bpm[1]); }
  }
});

test('voicing: right notes, ascending, in range, small moves between chords', () => {
  for (const p of T.POOL) for (const k of T.keysFor(p.mode)) {
    const chs = T.chordsFor(p, k);
    const v = T.voiceLeading(chs);
    v.forEach((notes, i) => {
      const c = chs[i];
      assert.deepEqual(new Set(notes.map((n) => n % 12)), new Set(c.intervals.map((x) => (c.pc + x) % 12)));
      notes.forEach((n, j) => { if (j) assert.ok(n > notes[j - 1]); });
      assert.ok(notes[0] >= 50 && notes[notes.length - 1] <= 80);
    });
    for (let i = 1; i < v.length; i++) {
      const move = Math.max(...v[i].map((n) => Math.min(...v[i - 1].map((m) => Math.abs(m - n)))));
      assert.ok(move <= 4, `${p.id} ${k.name} move ${move}`);
    }
  }
});

test('assign: distinct targets first, then doubling', () => {
  assert.deepEqual(T.assign([60, 64, 67], [60, 64, 69]), [60, 64, 69]);
  const a = T.assign([60, 64, 67], [62, 65, 69, 72]);
  assert.equal(new Set(a).size, 3);
  assert.equal(T.assign([60, 64, 67, 72], [60, 64, 67]).length, 4);
});
