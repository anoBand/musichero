// Unit tests for js/sync.js against an in-memory server: offline answers, two devices, settings, reset.  Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/progress.js');
const L = require('../js/ledger.js');
const S = require('../js/sync.js');

/* stands in for Firestore: one user's documents, with a server clock */
function fakeServer() {
  let clock = 1000;
  const db = { user: null, bases: {}, events: {} };
  return {
    db: db,
    offline: false,
    writes: 0,
    check() { if (this.offline) throw new Error('offline'); },
    async getUser() { this.check(); return db.user && JSON.parse(JSON.stringify(db.user)); },
    async setUser(u) { this.check(); this.writes++; db.user = JSON.parse(JSON.stringify(u)); },
    async getBases() { this.check(); return JSON.parse(JSON.stringify(db.bases)); },
    async setBase(dev, b) { this.check(); this.writes++; db.bases[dev] = JSON.parse(JSON.stringify(b)); },
    async eventsSince(ms) { this.check(); return Object.values(db.events).filter((x) => x.st > ms).sort((a, b) => a.st - b.st).map((x) => ({ e: x.e, st: x.st })); },
    async putEvents(list) { this.check(); list.forEach((e) => { this.writes++; db.events[e.id] = { e: e, st: (clock += 10) }; }); }
  };
}
/* a device: its own document, synced the way the app does it */
function device(server, doc) {
  const d = { doc: doc || L.freshDoc(), server: server };
  d.answer = (k, ok, at) => L.logAnswer(d.doc, k, { type: 'prog', id: 'axis', mode: 'major', ok: ok, xp: 10 }, at);
  d.sync = async () => {
    const r = await S.syncOnce(d.doc, server);
    d.doc = L.mergeDocs(d.doc, r.remote);
    d.doc.sync = r.sync;
    return r;
  };
  d.data = () => L.derive(d.doc);
  return d;
}
const T = Date.UTC(2026, 10, 18, 3);

test('answers made before logging in go up on the first sync', async () => {
  const server = fakeServer();
  const phone = device(server);
  for (let i = 0; i < 4; i++) phone.answer('2026-11-18', true, T + i);
  assert.equal(S.unsentCount(phone.doc), 4);
  const r = await phone.sync();
  assert.equal(r.pushed, 4);
  assert.equal(S.unsentCount(phone.doc), 0);
  assert.equal((await phone.sync()).pushed, 0, 'nothing is sent twice');
});

test('offline on both devices, then both sync: every answer counts once', async () => {
  const server = fakeServer();
  const phone = device(server), web = device(server);
  await phone.sync(); await web.sync();
  server.offline = true;
  for (let i = 0; i < 6; i++) phone.answer('2026-11-18', true, T + i * 10);
  await assert.rejects(phone.sync());
  assert.equal(S.unsentCount(phone.doc), 6, 'a failed sync keeps the answers waiting');
  server.offline = false;
  for (let i = 0; i < 4; i++) web.answer('2026-11-18', true, T + i * 10 + 5);
  await web.sync();
  await phone.sync();
  await web.sync();
  for (const d of [phone, web]) {
    const data = d.data();
    assert.equal(data.days['2026-11-18'].q, 10);
    assert.ok(P.goalMet(data.days['2026-11-18']));
    assert.equal(data.quests['2026-11-18'].length, 2, 'each quest pays once');
  }
  assert.deepEqual(phone.data(), web.data(), 'both devices show the same records');
});

test('answers given while a sync is running are not lost', async () => {
  const server = fakeServer();
  const phone = device(server);
  phone.answer('2026-11-18', true, T);
  const running = S.syncOnce(phone.doc, server);
  phone.answer('2026-11-18', true, T + 1);
  const r = await running;
  phone.doc = L.mergeDocs(phone.doc, r.remote);
  phone.doc.sync = r.sync;
  assert.equal(phone.doc.events.length, 2);
  assert.equal(Object.keys(server.db.events).length + S.unsentCount(phone.doc), 2, 'each answer is either uploaded or still waiting');
  /* one more given in the middle of an upload */
  phone.answer('2026-11-18', true, T + 1.5);
  const put = server.putEvents.bind(server);
  server.putEvents = async (list) => { phone.answer('2026-11-18', false, T + 2); return put(list); };
  const r2 = await S.syncOnce(phone.doc, server);
  server.putEvents = put;
  phone.doc = L.mergeDocs(phone.doc, r2.remote);
  phone.doc.sync = r2.sync;
  assert.equal(phone.doc.events.length, 4);
  assert.equal(S.unsentCount(phone.doc), 1, 'the answer from the middle of the upload waits for the next round');
  await phone.sync();
  assert.equal(S.unsentCount(phone.doc), 0);
  assert.equal(Object.keys(server.db.events).length, 4);
});

test('a new device gets everything; old records from before the log go up once', async () => {
  const server = fakeServer();
  const old = P.freshData();
  for (let i = 0; i < 5; i++) P.recordAnswer(old, '2026-11-17', { type: 'prog', id: 'axis', mode: 'major', ok: true });
  Object.keys(old.days).forEach((k) => delete old.days[k].goal);
  const phone = device(server, L.docFromV1(old, T));
  phone.answer('2026-11-18', true, T + 5);
  await phone.sync();
  await phone.sync();
  assert.equal(Object.keys(server.db.bases).length, 1);
  const tablet = device(server);
  await tablet.sync();
  assert.equal(tablet.data().xp, phone.data().xp);
  assert.equal(P.streakCount(tablet.data(), '2026-11-17'), 1);
});

test('settings follow the latest change, except this device\'s audio timing', async () => {
  const server = fakeServer();
  const phone = device(server), web = device(server);
  L.setPref(phone.doc, 'lat', 0.08, T);
  L.setPref(phone.doc, 'kit', 'guitar', T + 1);
  await phone.sync();
  L.setPref(web.doc, 'acc', 'sharp', T + 2);
  await web.sync();
  await phone.sync();
  assert.equal(web.doc.pref.kit, 'guitar');
  assert.equal(phone.doc.pref.acc, 'sharp');
  assert.equal(web.doc.pref.lat, undefined, 'latency stays on the phone');
  assert.equal(server.db.user.pref.lat, undefined);
  const w = server.writes;
  await phone.sync();
  assert.equal(server.writes, w, 'no writes when nothing changed');
});

test('a reset on one device clears the other; later answers stay', async () => {
  const server = fakeServer();
  const phone = device(server), web = device(server);
  phone.answer('2026-11-17', true, T);
  await phone.sync(); await web.sync();
  assert.equal(web.data().days['2026-11-17'].q, 1);
  L.resetDoc(phone.doc, T + 100);
  await phone.sync();
  web.answer('2026-11-18', true, T + 200);
  await web.sync();
  await phone.sync();
  for (const d of [phone, web]) {
    assert.equal(d.data().days['2026-11-17'], undefined);
    assert.equal(d.data().days['2026-11-18'].q, 1);
  }
});
