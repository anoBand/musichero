// Unit tests for js/ledger.js: the answer log, the old-format migration, and merging copies.  Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/progress.js');
const L = require('../js/ledger.js');

const ans = (ok, extra) => Object.assign({ type: 'prog', id: 'axis', mode: 'major', ok: ok, xp: 10 }, extra || {});
const T0 = Date.UTC(2026, 10, 18, 3);
/* saved records from before this version have no per-day goal */
const legacy = (d) => { Object.keys(d.days).forEach((k) => delete d.days[k].goal); return d; };

test('the log replays to the same records as answering directly', () => {
  const doc = L.freshDoc();
  const direct = P.freshData();
  for (let i = 0; i < 12; i++) {
    const a = ans(i % 4 !== 0);
    L.logAnswer(doc, '2026-11-18', a, T0 + i);
    P.recordAnswer(direct, '2026-11-18', Object.assign({ goal: P.GOAL_Q }, a));
  }
  const d = L.derive(doc);
  assert.equal(d.xp, direct.xp);
  assert.deepEqual(d.days, direct.days);
  assert.deepEqual(d.review, direct.review);
  assert.deepEqual(d.quests, direct.quests);
  assert.equal(new Set(doc.events.map((e) => e.id)).size, 12, 'event ids are unique');
});

test('old records move in as a base and keep their streak', () => {
  const old = P.freshData();
  for (let i = 0; i < 5; i++) P.recordAnswer(old, '2026-11-17', ans(true));
  old.pref = { acc: 'sharp', kit: 'epiano' };
  const doc = L.docFromV1(legacy(old), T0);
  assert.equal(doc.pref.acc, 'sharp');
  const before = L.derive(doc);
  assert.equal(before.xp, old.xp);
  assert.equal(P.streakCount(before, '2026-11-18'), 1, 'yesterday met the old 5-question goal');
  for (let i = 0; i < 9; i++) L.logAnswer(doc, '2026-11-18', ans(true), T0 + i);
  assert.equal(P.goalMet(L.derive(doc).days['2026-11-18']), false, 'today needs 10');
  L.logAnswer(doc, '2026-11-18', ans(true), T0 + 9);
  assert.equal(P.streakCount(L.derive(doc), '2026-11-18'), 2);
});

test('merging: offline answers on two devices all count, once', () => {
  const phone = L.freshDoc(), web = L.freshDoc();
  for (let i = 0; i < 6; i++) L.logAnswer(phone, '2026-11-18', ans(true), T0 + i * 10);
  for (let i = 0; i < 6; i++) L.logAnswer(web, '2026-11-18', ans(true), T0 + i * 10 + 5);
  const m = L.mergeDocs(phone, web);
  assert.equal(m.events.length, 12);
  assert.equal(m.dev, phone.dev, 'keeps its own device id');
  const d = L.derive(m);
  assert.equal(d.days['2026-11-18'].q, 12);
  assert.ok(P.goalMet(d.days['2026-11-18']), 'six on each device reach the goal together');
  assert.equal(d.quests['2026-11-18'].length, 2, 'quests pay once, not once per device');
  const again = L.mergeDocs(L.mergeDocs(m, web), phone);
  assert.deepEqual(L.derive(again), d, 'merging twice changes nothing');
  assert.deepEqual(L.derive(L.mergeDocs(web, phone)), d, 'order does not matter');
});

test('merging: both devices had old records', () => {
  const a = P.freshData(), b = P.freshData();
  for (let i = 0; i < 5; i++) P.recordAnswer(a, '2026-11-16', ans(true));
  for (let i = 0; i < 5; i++) P.recordAnswer(b, '2026-11-17', ans(true));
  const d = L.derive(L.mergeDocs(L.docFromV1(legacy(a), T0), L.docFromV1(legacy(b), T0)));
  assert.equal(d.xp, a.xp + b.xp);
  assert.equal(P.streakCount(d, '2026-11-17'), 2);
});

test('settings: the newest change wins', () => {
  const a = L.freshDoc(), b = L.freshDoc();
  L.setPref(a, 'kit', 'piano', T0);
  L.setPref(b, 'kit', 'epiano', T0 + 1);
  L.setPref(a, 'acc', 'sharp', T0 + 2);
  const m = L.mergeDocs(a, b);
  assert.equal(m.pref.kit, 'epiano');
  assert.equal(m.pref.acc, 'sharp');
  assert.equal(L.mergeDocs(b, a).pref.kit, 'epiano');
});

test('reset reaches the other copy, later answers survive', () => {
  const a = L.freshDoc(), b = L.freshDoc();
  L.logAnswer(a, '2026-11-17', ans(true), T0);
  const shared = L.mergeDocs(b, a);
  L.resetDoc(a, T0 + 100);
  L.logAnswer(a, '2026-11-18', ans(true), T0 + 200);
  L.logAnswer(shared, '2026-11-18', ans(false), T0 + 300);
  const m = L.mergeDocs(shared, a);
  assert.equal(m.events.length, 2);
  assert.equal(L.derive(m).days['2026-11-17'], undefined);
  assert.equal(L.derive(m).xp, 10 + P.XP_WRONG);
});
