// Unit tests for js/progress.js: streaks, quests, reviews, XP and levels.  Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/progress.js');

const day = (q, practice) => ({ q: q, right: 0, practice: practice || 0, best: 0, cur: 0 });

test('dates', () => {
  assert.equal(P.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(P.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(P.weekStart('2026-11-10'), '2026-11-09');
  assert.equal(P.weekStart('2026-11-15'), '2026-11-09');
});

test('goal and streak', () => {
  const D = P.freshData();
  const t = '2026-11-10';
  for (let i = 0; i < 4; i++) P.recordAnswer(D, t, { type: 'prog', id: 'axis', mode: 'major', ok: true });
  assert.equal(P.goalMet(D.days[t]), false);
  assert.equal(P.streakCount(D, t), 0);
  P.recordAnswer(D, t, { type: 'prog', id: 'royal', mode: 'major', ok: false });
  assert.equal(P.goalMet(D.days[t]), true);
  assert.equal(P.streakCount(D, t), 1);
  assert.equal(P.streakCount(D, '2026-11-11'), 1, 'an unmet today keeps yesterday');
  assert.equal(P.streakCount(D, '2026-11-12'), 0, 'a missed day breaks it');
  P.addPractice(D, '2026-11-11', 600);
  assert.equal(P.streakCount(D, '2026-11-11'), 2, '10 minutes of practice meets the goal');
});

test('quests pay once', () => {
  const D = P.freshData();
  const t = '2026-11-10';
  let done = [];
  for (let i = 0; i < 5; i++) done = done.concat(P.recordAnswer(D, t, { type: 'prog', id: 'axis', mode: 'major', ok: true }));
  assert.ok(done.includes('문제 5개 풀기'));
  assert.ok(done.includes('3문제 연속으로 맞히기'));
  assert.equal(P.settleQuests(D, t).length, 0);
  assert.equal(D.xp, 5 * 10 + 20 + 20);
});

test('xp per answer can be set by the caller', () => {
  const D = P.freshData();
  P.recordAnswer(D, '2026-11-10', { type: 'prog', id: 'axis', mode: 'major', ok: true, xp: 25 });
  P.recordAnswer(D, '2026-11-10', { type: 'prog', id: 'axis', mode: 'major', ok: false, xp: 25 });
  assert.equal(D.xp, 25 + P.XP_WRONG);
});

test('reviews: wrong answers come back tomorrow and leave when answered right', () => {
  const D = P.freshData();
  P.recordAnswer(D, '2026-11-10', { type: 'key', id: 'Gb', mode: 'major', ok: false });
  assert.equal(P.dueReviews(D, '2026-11-10').length, 0);
  assert.equal(P.dueReviews(D, '2026-11-11').length, 1);
  P.recordAnswer(D, '2026-11-11', { type: 'key', id: 'Gb', mode: 'major', ok: false, review: true });
  assert.equal(D.review[0].due, '2026-11-12');
  P.recordAnswer(D, '2026-11-12', { type: 'key', id: 'Gb', mode: 'major', ok: true, review: true });
  assert.equal(D.review.length, 0);
});

test('levels: each needs 50 XP more than the last', () => {
  const cases = [[0, 1, 0, 100], [99, 1, 99, 100], [100, 2, 0, 150], [250, 3, 0, 200], [700, 5, 0, 300]];
  for (const [xp, level, into, need] of cases) assert.deepEqual(P.levelInfo(xp), { level, into, need });
  assert.equal(P.titleFor(1), '입문자');
  assert.equal(P.titleFor(5), '세션맨');
  assert.equal(P.unlockedAt(3).join(), '중수,상세 설정');
  assert.equal(P.unlockedAt(5).join(), '고수');
});

test('records: activity levels and longest streak', () => {
  assert.deepEqual([null, day(0), day(1), day(3), day(5), day(0, 1200)].map(P.activityLevel), [0, 0, 1, 2, 3, 4]);
  const D = P.freshData();
  ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05'].forEach((k) => { D.days[k] = day(5); });
  assert.equal(P.longestStreak(D), 3);
});
