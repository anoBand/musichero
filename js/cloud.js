/* Google sign-in and syncing with Firestore. Loaded last.
   Signed out, nothing here changes how the app works; the records stay on this device as before.
   Signed in, the answer log (ledger.js) is synced by sync.js: right after start, a few seconds after each
   answer or setting change, when the connection comes back, and when the app goes to the background.
   Firestore layout (rules: firestore.rules):
     users/{uid}                 { pref, prefAt, resetAt, updated }
     users/{uid}/events/{id}     one answer, plus st = server time it arrived
     users/{uid}/bases/{dev}     records a device had before the log existed
   The Android app needs a native sign-in (Google blocks it inside app web views), so the account panel is
   hidden there for now. */
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAIFF_kK9DJWV1cOmQIeHsRWA2hJhUAxVY',
  authDomain: 'quiz-algernon.firebaseapp.com',
  projectId: 'quiz-algernon',
  storageBucket: 'quiz-algernon.firebasestorage.app',
  messagingSenderId: '589831874225',
  appId: '1:589831874225:web:9d7ad0221530cde468e490'
};
const SDK_URL = new URL('vendor/firebase.js', document.currentScript.src).href;

const Cloud = {
  fb: null, auth: null, db: null,
  user: null,
  busy: false, again: false, timer: null,
  lastOk: 0, error: '',
  ready: null,
  /* loads the SDK once; resolves when the saved sign-in (if any) is known */
  load() {
    if (this.ready) return this.ready;
    this.ready = import(SDK_URL).then((fb) => new Promise((resolve) => {
      this.fb = fb;
      const app = fb.initializeApp(FIREBASE_CONFIG);
      this.auth = fb.getAuth(app);
      this.db = fb.initializeFirestore(app, { ignoreUndefinedProperties: true });
      let first = true;
      fb.onAuthStateChanged(this.auth, (user) => {
        this.signedIn(user);
        if (first) { first = false; resolve(); }
      });
    }));
    this.ready.catch(() => { this.ready = null; });
    return this.ready;
  },
  signedIn(user) {
    this.user = user;
    if (user) {
      const prev = Store.doc.sync && Store.doc.sync.uid;
      /* records on this device belong to another account: start over before taking this one's */
      if (prev && prev !== user.uid) Store.forget();
      if (prev !== user.uid) { Store.doc.sync = Object.assign(syncState(Store.doc), { uid: user.uid }); Store.save(); }
      Store.changed = () => this.soon();
      this.syncNow();
    } else {
      Store.changed = () => {};
    }
    renderAccount();
  },
  /* the Firestore side of sync.js */
  server(uid) {
    const fb = this.fb, db = this.db;
    const userRef = fb.doc(db, 'users', uid);
    const evCol = fb.collection(userRef, 'events');
    return {
      async getUser() { const d = await fb.getDoc(userRef); return d.exists() ? d.data() : null; },
      async setUser(u) { await fb.setDoc(userRef, Object.assign({}, u, { updated: fb.serverTimestamp() }), { merge: true }); },
      async getBases() {
        const out = {};
        (await fb.getDocs(fb.collection(userRef, 'bases'))).forEach((d) => { out[d.id] = d.data(); });
        return out;
      },
      async setBase(dev, b) { await fb.setDoc(fb.doc(userRef, 'bases', dev), b); },
      async eventsSince(ms) {
        const snap = await fb.getDocs(fb.query(evCol, fb.where('st', '>', fb.Timestamp.fromMillis(ms)), fb.orderBy('st')));
        const out = [];
        snap.forEach((d) => {
          const e = d.data();
          const st = e.st ? e.st.toMillis() : 0;
          delete e.st;
          out.push({ e: e, st: st });
        });
        return out;
      },
      async putEvents(list) {
        for (let i = 0; i < list.length; i += 400) {
          const batch = fb.writeBatch(db);
          list.slice(i, i + 400).forEach((e) => batch.set(fb.doc(evCol, e.id), Object.assign({}, e, { st: fb.serverTimestamp() })));
          await batch.commit();
        }
      }
    };
  },
  soon(ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.syncNow(), ms || 3000);
  },
  async syncNow() {
    if (!this.user) return false;
    if (this.busy) { this.again = true; return false; }
    clearTimeout(this.timer);
    this.busy = true;
    let ok = false;
    try {
      const prefBefore = JSON.stringify(Store.doc.pref);
      const r = await syncOnce(Store.doc, this.server(this.user.uid));
      if (!this.user) return false;
      Store.merge(r.remote, r.sync);
      if (JSON.stringify(Store.doc.pref) !== prefBefore) applyPrefs();
      this.lastOk = Date.now();
      this.error = '';
      ok = true;
    } catch (e) {
      this.error = navigator.onLine === false ? 'offline' : (e && e.code) || 'error';
    } finally {
      this.busy = false;
    }
    if (state.view === 'home') renderHome();
    renderAccount();
    if (this.again) { this.again = false; return this.syncNow(); }
    return ok;
  },
  async signIn() {
    await this.load();
    const fb = this.fb;
    await fb.signInWithPopup(this.auth, new fb.GoogleAuthProvider());
  },
  async signOut() {
    await this.syncNow();
    if (unsentCount(Store.doc)) return false;
    await this.fb.signOut(this.auth);
    Store.forget();
    renderHome();
    renderAccount();
    return true;
  }
};

/* settings changed on another device: show them here (only on the home screen, never mid-question) */
function applyPrefs() {
  const p = Store.data.pref;
  ACCIDENTAL = p.acc === 'sharp' ? 'sharp' : 'flat';
  markAcc(); relabelKeyGrids();
  if (p.theme) applyTheme(p.theme);
  if (KITS[p.kit]) { state.kit = p.kit; renderKit(); }
  if (STYLE_CHOICES.indexOf(p.style) >= 0) { state.style = p.style; renderStyles(); }
  if (state.view === 'home' || state.view === 'records') {
    if (LEVELS[p.level] || p.level === 'custom') state.level = p.level;
    if (p.amode === 'free' || p.amode === 'choice') state.amode = p.amode;
  }
}

function syncText() {
  const n = unsentCount(Store.doc);
  if (Cloud.busy) return '동기화하는 중…';
  if (Cloud.error) return (Cloud.error === 'offline' ? '오프라인' : '동기화하지 못했어요') + (n ? ' · 올리지 못한 기록 ' + n + '개' : '');
  if (Cloud.lastOk) { const d = new Date(Cloud.lastOk); return '동기화됨 ' + d.getHours() + ':' + pad2(d.getMinutes()); }
  return '';
}
function renderAccount() {
  const u = Cloud.user;
  const text = $('#account-text'), btn = $('#account-btn');
  if (u) {
    text.textContent = (u.displayName || u.email || 'Google 계정') + (syncText() ? ' · ' + syncText() : '');
    btn.textContent = '로그아웃';
  } else {
    text.textContent = '로그인하면 기록이 여러 기기에서 이어져요.';
    btn.textContent = '구글로 로그인';
  }
}
function accountNote(msg) {
  $('#account-note').textContent = msg || '';
  $('#account-note').hidden = !msg;
}
const AUTH_ERRORS = {
  'auth/popup-blocked': '팝업이 막혔어요. 브라우저에서 이 사이트의 팝업을 허용한 뒤 다시 눌러 주세요.',
  'auth/unauthorized-domain': '이 주소에서는 아직 로그인할 수 없어요. (Firebase 승인된 도메인에 추가 필요)',
  'auth/network-request-failed': '인터넷에 연결된 뒤 다시 눌러 주세요.',
  'auth/operation-not-supported-in-this-environment': '이 브라우저에서는 로그인할 수 없어요.'
};

if (Native.on) {
  $('#account-panel').hidden = true;
} else {
  $('#account-btn').addEventListener('click', async () => {
    accountNote('');
    const btn = $('#account-btn');
    btn.disabled = true;
    try {
      if (Cloud.user) {
        if (!(await Cloud.signOut())) accountNote('아직 올리지 못한 기록이 있어요. 인터넷에 연결된 뒤 다시 눌러 주세요.');
        else accountNote('로그아웃했어요. 기록은 계정에 남아 있어서 다시 로그인하면 돌아와요.');
      } else {
        await Cloud.signIn();
      }
    } catch (e) {
      const code = e && e.code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        accountNote(AUTH_ERRORS[code] || (navigator.onLine === false ? AUTH_ERRORS['auth/network-request-failed'] : '로그인하지 못했어요. 잠시 뒤 다시 해 주세요.'));
      }
    } finally {
      btn.disabled = false;
    }
  });
  /* load the SDK early, so the sign-in popup opens straight from the tap (browsers block late popups) */
  const signedInBefore = !!(Store.doc.sync && Store.doc.sync.uid);
  const start = () => Cloud.load().catch(() => {});
  if (signedInBefore) start();
  else if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 4000 });
  else setTimeout(start, 1500);
  window.addEventListener('online', () => Cloud.syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') Cloud.syncNow();
    else if (Date.now() - Cloud.lastOk > 60000) Cloud.syncNow();
  });
  renderAccount();
}
