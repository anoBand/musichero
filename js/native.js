/* Android app only (Capacitor). In a browser none of this runs and the reminder settings stay hidden.
   Plugins are reached through window.Capacitor.Plugins, so no bundler is needed. */
const Native = {
  on: !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()),
  cache: {},
  /* npm plugins and the app's own (UpdaterPlugin.java) alike; registered once */
  plugin(name) {
    if (!this.on) return null;
    if (this.cache[name]) return this.cache[name];
    const C = window.Capacitor;
    return (this.cache[name] = (C.Plugins && C.Plugins[name]) || (C.registerPlugin ? C.registerPlugin(name) : null));
  }
};

function reminderPref() {
  const r = Store.data.pref.remind || {};
  return { on: !!r.on, h: Number.isInteger(r.h) ? r.h : 20, m: Number.isInteger(r.m) ? r.m : 0 };
}
/* Replace whatever is scheduled with the plan for the next seven days. Called on start, on leaving the app,
   and whenever the setting changes, so a goal met today removes today's reminder. */
async function refreshReminders() {
  const LN = Native.plugin('LocalNotifications');
  if (!LN) return;
  try {
    const pending = await LN.getPending();
    if (pending.notifications.length) await LN.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    const r = reminderPref();
    if (!r.on) return;
    const plan = reminderPlan(Store.data, new Date(), r.h, r.m, 7);
    if (plan.length) {
      await LN.schedule({
        notifications: plan.map((p) => ({ id: p.id, title: p.title, body: p.body, schedule: { at: p.at }, smallIcon: 'ic_stat_note' }))
      });
    }
  } catch (e) {}
}
async function setReminder(on) {
  const LN = Native.plugin('LocalNotifications');
  if (!LN) return;
  if (on) {
    let perm = { display: 'denied' };
    try { perm = await LN.requestPermissions(); } catch (e) {}
    if (perm.display !== 'granted') {
      $('#remind-note').textContent = '알림 권한이 꺼져 있어요. 폰 설정 > 앱 > Music Hero > 알림에서 켜 주세요.';
      on = false;
    }
  }
  Store.setPref('remind', Object.assign(reminderPref(), { on: on }));
  renderReminder();
  refreshReminders();
}
function renderReminder() {
  const r = reminderPref();
  $$('#remind button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.r === 'on') === r.on)));
  $('#remind-time').value = String(r.h).padStart(2, '0') + ':' + String(r.m).padStart(2, '0');
  $('#remind-time').disabled = !r.on;
  if (r.on) $('#remind-note').textContent = '매일 이 시각에 알려드려요. 그날 목표를 이미 채웠으면 보내지 않아요.';
  else if (!$('#remind-note').textContent.startsWith('알림 권한')) $('#remind-note').textContent = '';
}

if (Native.on) {
  $('#remind-panel').hidden = false;
  renderReminder();
  $('#remind').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-r]');
    if (b) setReminder(b.dataset.r === 'on');
  });
  $('#remind-time').addEventListener('change', (e) => {
    const t = /^(\d{2}):(\d{2})$/.exec(e.target.value);
    if (!t) return;
    Store.setPref('remind', Object.assign(reminderPref(), { h: Number(t[1]), m: Number(t[2]) }));
    refreshReminders();
  });
  const App = Native.plugin('App');
  if (App) {
    /* hardware back: go home, then leave the app */
    App.addListener('backButton', () => {
      if (state.view !== 'home') showHome();
      else App.exitApp();
    });
    App.addListener('appStateChange', (s) => {
      const cloud = typeof Cloud !== 'undefined' ? Cloud : null;
      if (s.isActive) { if (cloud && Date.now() - cloud.lastOk > 60000) cloud.syncNow(); return; }
      if (playing) stop(null, true);
      if (cloud) cloud.syncNow();
      refreshReminders();
    });
  }
  refreshReminders();
}

/* ---- updates for the APK from GitHub Releases (a Play Store install updates through the store) ---- */
const Updater = { found: null, checkedAt: 0, busy: false };
async function checkUpdate() {
  const U = Native.plugin('Updater'), App = Native.plugin('App');
  if (!U || !App || Updater.busy || Date.now() - Updater.checkedAt < 6 * 3600 * 1000) return;
  Updater.checkedAt = Date.now();
  try {
    const info = await U.info();
    if (info.installer === 'com.android.vending') return;
    const app = await App.getInfo();
    const res = await fetch(RELEASES_URL, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return;
    Updater.found = pickUpdate(await res.json(), app.build);
    if (Updater.found) showUpdate('새 버전 ' + Updater.found.version + '이 나왔어요', '업데이트');
  } catch (e) { Updater.checkedAt = 0; }
}
function showUpdate(text, button) {
  $('#update-bar').hidden = false;
  $('#update-text').textContent = text;
  $('#update-btn').hidden = !button;
  if (button) $('#update-btn').textContent = button;
}
async function installUpdate() {
  const U = Native.plugin('Updater');
  if (!U || !Updater.found || Updater.busy) return;
  const info = await U.info();
  if (!info.canInstall) {
    showUpdate('설정에서 \'이 출처의 앱 허용\'을 켠 뒤 돌아와서 다시 눌러 주세요.', '다시 시도');
    await U.allowInstall();
    return;
  }
  Updater.busy = true;
  showUpdate('내려받는 중 0%', '');
  /* records go up first, so nothing waits on this device during the update */
  if (typeof Cloud !== 'undefined') { try { await Cloud.syncNow(); } catch (e) {} }
  const sub = await U.addListener('progress', (p) => showUpdate('내려받는 중 ' + p.percent + '%', ''));
  try {
    await U.install({ url: Updater.found.url });
    showUpdate('설치 화면에서 \'업데이트\'를 눌러 주세요.', '다시 설치');
  } catch (e) {
    showUpdate('내려받지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.', '다시 시도');
  } finally {
    Updater.busy = false;
    sub.remove();
  }
}
if (Native.on) {
  $('#update-btn').addEventListener('click', installUpdate);
  const App = Native.plugin('App');
  if (App) App.addListener('appStateChange', (s) => { if (s.isActive) checkUpdate(); });
  checkUpdate();
}
