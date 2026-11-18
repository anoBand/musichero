/* Progress rules: days, streaks, quests, reviews, XP and levels. Plain data in, plain data out.
   No DOM: also loaded by the unit tests in Node. */
/* ---- progress: plain data in, plain data out, so the storage behind it can change later ---- */
/* GOAL_PRACTICE: solo practice was removed; days that met the goal by 10 minutes of it still count */
const GOAL_Q = 5, GOAL_PRACTICE = 600;
const XP_RIGHT = 10, XP_WRONG = 2;
/* Each level needs 50 XP more than the one before: 100, 150, 200, ... */
function levelInfo(xp) {
  let level = 1, need = 100, into = xp;
  while (into >= need) { into -= need; level++; need += 50; }
  return { level: level, into: into, need: need };
}
const TITLES = [[1, '입문자'], [3, '연습생'], [5, '세션맨'], [8, '밴드마스터'], [12, '뮤직 히어로']];
function titleFor(level) {
  let t = TITLES[0][1];
  TITLES.forEach((x) => { if (level >= x[0]) t = x[1]; });
  return t;
}
/* difficulty unlocks: the level at which each setup choice opens */
const UNLOCK = { easy: 1, mid: 3, custom: 3, hard: 5 };
const UNLOCK_LABEL = { mid: '중수', custom: '상세 설정', hard: '고수' };
function unlockedAt(level) { return Object.keys(UNLOCK_LABEL).filter((k) => UNLOCK[k] === level).map((k) => UNLOCK_LABEL[k]); }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function dayKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function keyToDate(k) { const p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function addDays(k, n) { const d = keyToDate(k); d.setDate(d.getDate() + n); return dayKey(d); }
function weekStart(k) { const d = keyToDate(k); return addDays(k, -((d.getDay() + 6) % 7)); }
function freshData() { return { v: 1, xp: 0, days: {}, review: [], prog: {}, quests: {}, weeks: {}, pref: { acc: 'flat' } }; }
function getDay(data, k) { return data.days[k] || (data.days[k] = { q: 0, right: 0, practice: 0, best: 0, cur: 0 }); }
function goalMet(day) { return !!day && (day.q >= GOAL_Q || (day.practice || 0) >= GOAL_PRACTICE); }
function goalRatio(day) { return day ? Math.min(1, Math.max(day.q / GOAL_Q, (day.practice || 0) / GOAL_PRACTICE)) : 0; }
/* consecutive days with the goal met; today counts once met, and an unmet today doesn't break yesterday's run */
function streakCount(data, k) {
  let c = goalMet(data.days[k]) ? k : addDays(k, -1);
  let n = 0;
  while (goalMet(data.days[c])) { n++; c = addDays(c, -1); }
  return n;
}
function weekGoalDays(data, k) {
  const s = weekStart(k);
  let n = 0;
  for (let i = 0; i < 7; i++) if (goalMet(data.days[addDays(s, i)])) n++;
  return n;
}
function questList(data, k) {
  const d = data.days[k] || { q: 0, right: 0, practice: 0, best: 0, cur: 0 };
  const claimed = data.quests[k] || [];
  const list = [
    { id: 'q5', scope: 'day', label: '문제 5개 풀기', cur: d.q, max: 5, unit: '문제', xp: 20 },
    { id: 's3', scope: 'day', label: '3문제 연속으로 맞히기', cur: d.best, max: 3, unit: '연속', xp: 20 },
    { id: 'w3', scope: 'week', label: '이번 주 3일 목표 달성', cur: weekGoalDays(data, k), max: 3, unit: '일', xp: 50 }
  ];
  list.forEach((q) => {
    q.cur = Math.min(q.cur, q.max);
    q.done = q.scope === 'week' ? !!data.weeks[weekStart(k)] : claimed.indexOf(q.id) >= 0;
  });
  return list;
}
/* pays out quests that just got completed; returns their labels */
function settleQuests(data, k) {
  const out = [];
  questList(data, k).forEach((q) => {
    if (q.done || q.cur < q.max) return;
    if (q.scope === 'week') data.weeks[weekStart(k)] = true;
    else (data.quests[k] || (data.quests[k] = [])).push(q.id);
    data.xp += q.xp;
    out.push(q.label);
  });
  return out;
}
/* a: { type: 'prog'|'key', id, mode, ok, review, xp } — xp is what a right answer earns (preset dependent) — a wrong answer comes back for review the next day */
function recordAnswer(data, k, a) {
  const d = getDay(data, k);
  d.q++;
  if (a.ok) { d.right++; d.cur++; d.best = Math.max(d.best, d.cur); data.xp += a.xp || XP_RIGHT; }
  else { d.cur = 0; data.xp += XP_WRONG; }
  if (a.type === 'prog') {
    const ps = data.prog[a.id] || (data.prog[a.id] = { seen: 0, right: 0 });
    ps.seen++;
    if (a.ok) ps.right++;
  }
  const idx = data.review.findIndex((r) => r.t === a.type && r.id === a.id && r.mode === a.mode);
  if (a.ok) { if (a.review && idx >= 0) data.review.splice(idx, 1); }
  else if (idx >= 0) data.review[idx].due = addDays(k, 1);
  else data.review.push({ t: a.type, id: a.id, mode: a.mode, due: addDays(k, 1) });
  return settleQuests(data, k);
}
function activityLevel(day) {
  if (!day) return 0;
  const r = Math.max(day.q / GOAL_Q, (day.practice || 0) / GOAL_PRACTICE);
  return r <= 0 ? 0 : r < 0.5 ? 1 : r < 1 ? 2 : r < 2 ? 3 : 4;
}
function longestStreak(data) {
  let best = 0;
  Object.keys(data.days).filter((k) => goalMet(data.days[k])).forEach((k) => {
    if (goalMet(data.days[addDays(k, -1)])) return;
    let n = 0, c = k;
    while (goalMet(data.days[c])) { n++; c = addDays(c, 1); }
    best = Math.max(best, n);
  });
  return best;
}
/* Daily reminders for the next `days` days at hour:minute local time. Today is skipped when its goal is already
   met or the time has passed, so a reminder only goes out when there is still something to do.
   Returns [{ id, at: Date, title, body }]; ids stay the same day to day so rescheduling replaces them. */
function reminderPlan(data, now, hour, minute, days) {
  const out = [];
  const todayKey = dayKey(now);
  const streak = streakCount(data, todayKey);
  for (let i = 0; i < (days || 7); i++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hour, minute, 0, 0);
    if (i === 0 && (at <= now || goalMet(data.days[todayKey]))) continue;
    const body = i === 0 && streak > 0
      ? streak + '일 연속 기록이 이어지도록 오늘 5문제만 풀어볼까요?'
      : '오늘 목표: 5문제 풀기';
    out.push({ id: 100 + i, at: at, title: 'Music Hero', body: body });
  }
  return out;
}
function dueReviews(data, k) { return data.review.filter((r) => r.due <= k); }
function totals(data) {
  let q = 0, right = 0, practice = 0;
  Object.keys(data.days).forEach((k) => { q += data.days[k].q; right += data.days[k].right; practice += data.days[k].practice; });
  let weak = null;
  Object.keys(data.prog).forEach((id) => {
    const s = data.prog[id];
    if (s.seen < 3) return;
    const acc = s.right / s.seen;
    if (!weak || acc < weak.acc) weak = { id: id, acc: acc, seen: s.seen };
  });
  return { q: q, right: right, practice: practice, weak: weak };
}

if (typeof module !== 'undefined') {
  module.exports = {
    GOAL_Q, GOAL_PRACTICE, XP_RIGHT, XP_WRONG, dayKey, addDays, weekStart, freshData, goalMet, streakCount,
    weekGoalDays, questList, settleQuests, recordAnswer, dueReviews, totals, levelInfo, titleFor,
    unlockedAt, activityLevel, longestStreak, reminderPlan
  };
}
