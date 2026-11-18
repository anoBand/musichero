/* Records kept as an append-only log, ready for syncing between devices.
   No DOM: also loaded by the unit tests in Node. Needs progress.js.

   The saved document:
     { v: 2, dev, seq,            this device's id and event counter (never synced)
       events: [ev],              one per answer, never edited
       bases: { dev: { at, data } }, records a device had before the log existed (old aggregate format)
       resetAt,                   '기록 초기화' time: older events and bases are ignored
       pref, prefAt }             settings, newest change per key wins
   An event: { id, at, k, t, q, m, ok, r, x, g } = unique id, time (ms), day key, quiz type, item id, mode,
   right (1/0), review (1/0), XP for a right answer, daily goal at the time.

   Everything shown (XP, days, streaks, quests, reviews) is worked out by replaying bases + events, so merging
   two copies is just a union, and doing it twice changes nothing. */
if (typeof module !== 'undefined') Object.assign(globalThis, require('./progress.js'));

function newDeviceId() {
  const c = typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(2)) : [Math.random() * 4294967296, Math.random() * 4294967296];
  return Array.from(c, (n) => (n >>> 0).toString(36)).join('').slice(0, 10);
}
function freshDoc() {
  return { v: 2, dev: newDeviceId(), seq: 0, events: [], bases: {}, resetAt: 0, pref: { acc: 'flat' }, prefAt: {} };
}
/* turns the old single-device format (v1) into a log document; its totals become this device's base */
function docFromV1(old, now) {
  const doc = freshDoc();
  const data = Object.assign(freshData(), old);
  doc.pref = Object.assign({ acc: 'flat' }, data.pref || {});
  delete data.pref;
  if (Object.keys(data.days).length || data.xp) doc.bases[doc.dev] = { at: now, data: data };
  return doc;
}
function cleanDoc(d) {
  const doc = Object.assign(freshDoc(), d);
  if (!Array.isArray(doc.events)) doc.events = [];
  if (!doc.bases || typeof doc.bases !== 'object') doc.bases = {};
  if (!doc.pref) doc.pref = { acc: 'flat' };
  if (!doc.prefAt) doc.prefAt = {};
  return doc;
}

/* adds one base's totals into data (several bases happen when two devices that both had old records sync) */
function addBase(data, b) {
  data.xp += b.xp || 0;
  Object.keys(b.days || {}).forEach((k) => {
    const s = b.days[k];
    const d = data.days[k];
    if (!d) { data.days[k] = Object.assign({}, s); return; }
    d.q += s.q || 0; d.right += s.right || 0; d.practice = (d.practice || 0) + (s.practice || 0);
    d.best = Math.max(d.best || 0, s.best || 0); d.cur = Math.max(d.cur || 0, s.cur || 0);
    if (s.goal) d.goal = Math.max(d.goal || 0, s.goal);
  });
  (b.review || []).forEach((r) => {
    const i = data.review.findIndex((x) => x.t === r.t && x.id === r.id && x.mode === r.mode);
    if (i < 0) data.review.push(Object.assign({}, r));
    else if (r.due > data.review[i].due) data.review[i].due = r.due;
  });
  Object.keys(b.prog || {}).forEach((id) => {
    const p = data.prog[id] || (data.prog[id] = { seen: 0, right: 0 });
    p.seen += b.prog[id].seen || 0; p.right += b.prog[id].right || 0;
  });
  Object.keys(b.quests || {}).forEach((k) => {
    const have = data.quests[k] || (data.quests[k] = []);
    b.quests[k].forEach((q) => { if (have.indexOf(q) < 0) have.push(q); });
  });
  Object.keys(b.weeks || {}).forEach((w) => { if (b.weeks[w]) data.weeks[w] = true; });
}
function eventOrder(a, b) { return a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); }
function applyEvent(data, e) {
  return recordAnswer(data, e.k, { type: e.t, id: e.q, mode: e.m, ok: !!e.ok, review: !!e.r, xp: e.x, goal: e.g });
}
/* the plain progress data every screen reads */
function derive(doc) {
  const data = freshData();
  Object.keys(doc.bases).sort().forEach((dev) => {
    const b = doc.bases[dev];
    if (b && b.at >= doc.resetAt) addBase(data, b.data || {});
  });
  doc.events.filter((e) => e.at >= doc.resetAt).sort(eventOrder).forEach((e) => applyEvent(data, e));
  data.pref = doc.pref;
  return data;
}
/* makes the event for an answer and adds it to the document; returns the event */
function logAnswer(doc, k, a, now) {
  doc.seq += 1;
  const e = { id: doc.dev + '.' + doc.seq.toString(36), at: now, k: k, t: a.type, q: a.id, m: a.mode, ok: a.ok ? 1 : 0, r: a.review ? 1 : 0, x: a.xp || XP_RIGHT, g: a.goal || GOAL_Q };
  doc.events.push(e);
  return e;
}
function setPref(doc, key, value, now) {
  doc.pref[key] = value;
  doc.prefAt[key] = now;
}
/* 기록 초기화: drops this copy's events and bases; on another device, the newer reset time hides the old ones too */
function resetDoc(doc, now) {
  doc.resetAt = now;
  doc.events = [];
  doc.bases = {};
}
/* combines another copy (e.g. from the server) into doc; keeps doc's own device id and counter */
function mergeDocs(doc, other) {
  const out = cleanDoc(JSON.parse(JSON.stringify(doc)));
  other = cleanDoc(other);
  out.resetAt = Math.max(out.resetAt, other.resetAt);
  const seen = new Set(out.events.map((e) => e.id));
  other.events.forEach((e) => { if (!seen.has(e.id)) { seen.add(e.id); out.events.push(e); } });
  out.events = out.events.filter((e) => e.at >= out.resetAt).sort(eventOrder);
  Object.keys(other.bases).forEach((dev) => { if (!out.bases[dev]) out.bases[dev] = other.bases[dev]; });
  Object.keys(out.bases).forEach((dev) => { if (out.bases[dev].at < out.resetAt) delete out.bases[dev]; });
  Object.keys(other.pref).forEach((key) => {
    if ((other.prefAt[key] || 0) > (out.prefAt[key] || 0) || !(key in out.pref)) {
      out.pref[key] = other.pref[key];
      out.prefAt[key] = other.prefAt[key] || 0;
    }
  });
  return out;
}

if (typeof module !== 'undefined') {
  module.exports = { freshDoc, docFromV1, cleanDoc, derive, logAnswer, setPref, resetDoc, mergeDocs };
}
