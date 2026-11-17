/* Android app only (Capacitor). In a browser none of this runs and the reminder settings stay hidden.
   Plugins are reached through window.Capacitor.Plugins, so no bundler is needed. */
const Native = {
  on: !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()),
  plugin(name) { return this.on && window.Capacitor.Plugins ? window.Capacitor.Plugins[name] : null; }
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
  Store.data.pref.remind = Object.assign(reminderPref(), { on: on });
  Store.save();
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
    Store.data.pref.remind = Object.assign(reminderPref(), { h: Number(t[1]), m: Number(t[2]) });
    Store.save();
    refreshReminders();
  });
  const App = Native.plugin('App');
  if (App) {
    /* hardware back: close the sheet, then go home, then leave the app */
    App.addListener('backButton', () => {
      if (!$('#sheet').hidden) closeSheet();
      else if (state.view !== 'home') showHome();
      else App.exitApp();
    });
    App.addListener('appStateChange', (s) => {
      if (s.isActive) return;
      if (playing) stop(null, true);
      flushPractice();
      refreshReminders();
    });
  }
  refreshReminders();
}
