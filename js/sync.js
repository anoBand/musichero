/* One round of syncing the answer log (ledger.js) with the server. No DOM, no Firebase: the server is any
   object with these async methods (cloud.js has the Firestore one, the tests an in-memory one):
     getUser() -> { pref, prefAt, resetAt } | null      setUser({ pref, prefAt, resetAt })
     getBases() -> { dev: base }                       setBase(dev, base)
     eventsSince(ms) -> [{ e, st }]  (st: server time the event arrived)
     putEvents([event])
   Safe to repeat or interrupt at any point: events are keyed by their ids, and merging is a union. */
if (typeof module !== 'undefined') Object.assign(globalThis, require('./progress.js'), require('./ledger.js'));

/* settings that describe this device, not the person */
const LOCAL_PREFS = ['lat'];
/* look back a little before the last pull, in case an upload landed just behind it; repeats are dropped */
const PULL_OVERLAP = 2 * 60 * 1000;

function syncState(doc) { return Object.assign({ uid: null, pushedSeq: 0, pulledSt: 0, basePushed: false }, doc.sync || {}); }
function seqOf(dev, e) { const p = dev + '.'; return e.id.indexOf(p) === 0 ? parseInt(e.id.slice(p.length), 36) || 0 : 0; }
function sharedPref(pref, prefAt) {
  const p = Object.assign({}, pref), at = Object.assign({}, prefAt);
  LOCAL_PREFS.forEach((k) => { delete p[k]; delete at[k]; });
  return { pref: p, prefAt: at };
}
/* compares two plain objects regardless of key order */
function sameJson(a, b) {
  const sortDeep = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? Object.keys(v).sort().reduce((o, k) => { o[k] = sortDeep(v[k]); return o; }, {}) : v;
  return JSON.stringify(sortDeep(a)) === JSON.stringify(sortDeep(b));
}

/* Pulls what is new on the server, uploads this device's new answers, settings and old records.
   Returns { remote, sync, pushed }: merge `remote` into the current document (mergeDocs) and store `sync`
   as doc.sync. It does not touch doc, so answers given while it runs are kept and go up next time. */
async function syncOnce(doc, server) {
  const s = syncState(doc);
  const user = (await server.getUser()) || {};
  const bases = (await server.getBases()) || {};
  const pulled = await server.eventsSince(Math.max(0, s.pulledSt - PULL_OVERLAP));
  const remote = { events: pulled.map((p) => p.e), bases: bases, resetAt: user.resetAt || 0, pref: user.pref || {}, prefAt: user.prefAt || {} };
  const both = mergeDocs(doc, remote);

  const upTo = doc.seq;
  const out = both.events.filter((e) => { const n = seqOf(doc.dev, e); return n > s.pushedSeq && n <= upTo; });
  if (out.length) await server.putEvents(out);
  const mine = both.bases[doc.dev];
  if (mine && !s.basePushed && !bases[doc.dev]) await server.setBase(doc.dev, mine);
  const shared = sharedPref(both.pref, both.prefAt);
  const next = { pref: shared.pref, prefAt: shared.prefAt, resetAt: both.resetAt };
  const prev = { pref: remote.pref, prefAt: remote.prefAt, resetAt: remote.resetAt };
  if (!user.pref || !sameJson(next, prev)) await server.setUser(next);

  pulled.forEach((p) => { if (p.st > s.pulledSt) s.pulledSt = p.st; });
  s.pushedSeq = Math.max(s.pushedSeq, upTo);
  s.basePushed = true;
  return { remote: remote, sync: s, pushed: out.length };
}
/* answers on this device not yet uploaded */
function unsentCount(doc) {
  const s = syncState(doc);
  return doc.events.filter((e) => seqOf(doc.dev, e) > s.pushedSeq).length;
}

if (typeof module !== 'undefined') module.exports = { syncOnce, unsentCount, syncState, LOCAL_PREFS };
