/* Screens: home, records, quiz setup. */
/* ---- views ---- */
function show(view) {
  state.view = view;
  ['home', 'records', 'setup', 'quiz', 'practice'].forEach((v) => { $('#' + v).hidden = v !== view; });
  document.body.classList.toggle('quizzing', view === 'quiz' || view === 'practice');
  window.scrollTo(0, 0);
}
function fmtTime(sec) { return Math.floor(sec / 60) + ':' + pad2(sec % 60); }
function fmtDuration(sec) {
  const m = Math.floor(sec / 60);
  return m >= 60 ? Math.floor(m / 60) + '시간 ' + (m % 60) + '분' : m + '분';
}
function renderHome() {
  const data = Store.data;
  const k = today();
  const day = data.days[k] || { q: 0, right: 0, practice: 0 };
  const met = goalMet(day);
  $('#streak-n').textContent = String(streakCount(data, k));
  $('#goal-title').textContent = met ? '오늘 목표를 달성했어요' : '오늘 목표: 5문제 또는 연습 10분';
  $('#goal-bar').style.width = Math.round(goalRatio(day) * 100) + '%';
  $('#goal-detail').textContent = '문제 ' + Math.min(day.q, GOAL_Q) + '/' + GOAL_Q + ' · 연습 ' + Math.min(Math.floor(day.practice / 60), GOAL_PRACTICE / 60) + '/' + (GOAL_PRACTICE / 60) + '분';
  const li = levelInfo(data.xp);
  $('#level-n').textContent = '레벨 ' + li.level + ' · ' + titleFor(li.level);
  $('#level-bar').style.width = Math.round(li.into / li.need * 100) + '%';
  $('#level-xp').textContent = li.into + '/' + li.need + ' XP';

  const due = dueReviews(data, k).length;
  const later = data.review.length - due;
  $('#m-review').disabled = due === 0;
  $('#review-desc').textContent = due ? '틀렸던 문제 ' + due + '개 다시 풀기' : (later ? '내일 다시 풀 문제 ' + later + '개' : '틀린 문제는 다음 날 여기에 나와요');

  const ql = $('#quests');
  ql.textContent = '';
  questList(data, k).forEach((q) => {
    const li = document.createElement('li');
    li.className = 'quest' + (q.done ? ' done' : '');
    const t = document.createElement('span'); t.className = 'q'; t.textContent = q.label + (q.scope === 'week' ? '' : ' (오늘)');
    const p = document.createElement('span'); p.className = 'p';
    p.textContent = q.done ? '완료 +' + q.xp + ' XP' : q.cur + '/' + q.max + q.unit + ' · +' + q.xp + ' XP';
    const m = document.createElement('div'); m.className = 'meter';
    const bar = document.createElement('i'); bar.style.width = Math.round(q.cur / q.max * 100) + '%';
    m.appendChild(bar);
    li.append(t, p, m);
    ql.appendChild(li);
  });

  $('#store-note').hidden = Store.ok;
}
/* ---- records: activity calendar (17 weeks) and detailed stats ---- */
const HEAT_WEEKS = 17;
function dayDetail(k) {
  const d = Store.data.days[k];
  const dt = keyToDate(k);
  const head = (dt.getMonth() + 1) + '월 ' + dt.getDate() + '일';
  if (!d || (!d.q && !d.practice)) return head + ' · 기록 없음';
  return head + ' · 문제 ' + d.q + '개 (정답 ' + d.right + ') · 연습 ' + Math.floor(d.practice / 60) + '분' + (goalMet(d) ? ' · 목표 달성' : '');
}
function renderRecords() {
  const data = Store.data;
  const k = today();
  $('#rec-lead').textContent = '지금 ' + streakCount(data, k) + '일 연속 · 최장 ' + longestStreak(data) + '일 연속';
  const first = addDays(weekStart(k), -7 * (HEAT_WEEKS - 1));
  const heat = $('#heat'), months = $('#heat-months');
  heat.textContent = ''; months.textContent = '';
  const weekMonth = [];
  for (let w = 0; w < HEAT_WEEKS; w++) weekMonth.push(keyToDate(addDays(first, w * 7 + 6)).getMonth());
  for (let w = 0; w < HEAT_WEEKS; w++) {
    const m = document.createElement('span');
    const wk = addDays(first, w * 7);
    const mo = weekMonth[w];
    /* label a month where it starts, if it has room (at least two columns) */
    if ((w === 0 || weekMonth[w - 1] !== mo) && weekMonth[w + 1] === mo) m.textContent = (mo + 1) + '월';
    months.appendChild(m);
    for (let d = 0; d < 7; d++) {
      const dk = addDays(wk, d);
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.k = dk;
      b.dataset.l = String(activityLevel(data.days[dk]));
      b.setAttribute('aria-label', dayDetail(dk));
      if (dk > k) b.className = 'future';
      else if (dk === k) b.className = 'today sel';
      heat.appendChild(b);
    }
  }
  $('#heat-detail').textContent = dayDetail(k);

  const tot = totals(data);
  const st = $('#stats');
  st.textContent = '';
  const active = Object.keys(data.days).filter((dk) => data.days[dk].q || data.days[dk].practice).length;
  [
    ['푼 문제', tot.q + '문제'],
    ['정답률', tot.q ? Math.round(tot.right / tot.q * 100) + '%' : '-'],
    ['연습 시간', fmtDuration(tot.practice)],
    ['연습한 날', active + '일'],
    ['레벨', levelInfo(data.xp).level + ' · ' + titleFor(levelInfo(data.xp).level)],
    ['누적 XP', String(data.xp)]
  ].forEach((r) => {
    const div = document.createElement('div');
    const dt = document.createElement('dt'); dt.textContent = r[0];
    const dd = document.createElement('dd'); dd.textContent = r[1];
    div.append(dt, dd);
    st.appendChild(div);
  });

  const list = $('#acc-list');
  list.textContent = '';
  const rows = POOL.filter((p) => data.prog[p.id] && data.prog[p.id].seen).map((p) => ({ p: p, s: data.prog[p.id] }))
    .sort((a, b) => a.s.right / a.s.seen - b.s.right / b.s.seen);
  if (!rows.length) {
    const li = document.createElement('li');
    const t = document.createElement('span'); t.className = 'p'; t.textContent = '코드 진행 퀴즈를 풀면 진행별 정답률이 여기에 쌓여요.';
    li.appendChild(t); list.appendChild(li);
  }
  rows.forEach((r) => {
    const li = document.createElement('li');
    const t = document.createElement('span'); t.className = 'r'; t.textContent = r.p.roman;
    const sm = document.createElement('small'); sm.textContent = (r.p.name ? r.p.name + ' · ' : '') + modeWord(r.p.mode); t.appendChild(sm);
    const pc = document.createElement('span'); pc.className = 'p'; pc.textContent = Math.round(r.s.right / r.s.seen * 100) + '% · ' + r.s.right + '/' + r.s.seen;
    const m = document.createElement('div'); m.className = 'meter';
    const bar = document.createElement('i'); bar.style.width = Math.round(r.s.right / r.s.seen * 100) + '%'; m.appendChild(bar);
    li.append(t, pc, m);
    list.appendChild(li);
  });
}
function openRecords() { show('records'); renderRecords(); }
function showHome() {
  clearTimeout(beatTimer);
  if (playing) stop();
  closeSheet();
  state.phase = 'idle';
  show('home');
  renderHome();
}
function openSetup(kind) {
  state.session = { kind: kind };
  $('#setup-title').textContent = kind === 'key' ? '키 맞추기' : kind === 'qual' ? '코드 종류 맞추기' : '코드 진행 퀴즈';
  $('#setup-lead').textContent = kind === 'key'
    ? '배킹이 도는 동안 보기의 음을 눌러 들어보고, 가장 집처럼 들리는 으뜸음을 고르세요.'
    : kind === 'qual' ? '코드 하나를 한 번에, 한 음씩, 다시 한 번에 들려줘요. 어떤 종류의 코드인지 고르세요.'
    : '배킹을 듣고 어떤 코드 진행인지 4개 보기 중에서 맞춰보세요.';
  $('#key-field').hidden = kind === 'key';
  /* one chord, no backing: tempo, style, answer mode and parts don't apply */
  const qual = kind === 'qual';
  ['#amode', '#styles', '#layers'].forEach((sel) => { $(sel).closest('.field').hidden = qual; });
  $('#levels [data-v="custom"]').hidden = qual;
  if (qual && state.level === 'custom') state.level = 'hard';
  renderLevel();
  renderAmode();
  show('setup');
}
/* 5. difficulty: a preset fixes range, keys and tempo; 상세 설정 opens the individual controls */
function renderLevel() {
  const myLevel = levelInfo(Store.data.xp).level;
  if (UNLOCK[state.level] > myLevel) state.level = 'easy';
  const names = { easy: '하수', mid: '중수', hard: '고수', custom: '상세 설정' };
  $$('#levels button').forEach((b) => {
    const locked = UNLOCK[b.dataset.v] > myLevel;
    b.disabled = locked;
    b.textContent = names[b.dataset.v] + (locked ? ' · Lv ' + UNLOCK[b.dataset.v] : '');
    b.setAttribute('aria-pressed', String(b.dataset.v === state.level));
  });
  const lv = LEVELS[state.level];
  const note = $('#level-note');
  if (state.session.kind === 'qual') {
    $('#custom-fields').hidden = true;
    note.hidden = false;
    note.textContent = (QUAL_SETS[state.level] || QUAL_SETS.hard).map((x) => QUAL_NAMES[x]).join(', ') + ' · 정답마다 ' + (lv ? lv.xp : XP_RIGHT) + ' XP';
    return;
  }
  $('#custom-fields').hidden = !!lv;
  note.hidden = !lv;
  if (!lv) return;
  const count = (mode) => poolFor(mode, lv).length;
  const range = lv.setting === 'major' ? '메이저 진행 ' + count('major') + '개' : '메이저 ' + count('major') + '개 · 마이너 ' + count('minor') + '개 진행';
  const keys = lv.keys ? '키 ' + lv.keys.major.map((pc) => keyLabel(keyObj('major', pc))).join(' ') + (lv.setting === 'major' ? '' : ' / ' + lv.keys.minor.map((pc) => keyLabel(keyObj('minor', pc)) + 'm').join(' ')) : '12개 키 전부';
  note.textContent = range + ' · ' + keys + ' · ' + lv.bpm[0] + '–' + lv.bpm[1] + ' BPM · 정답마다 ' + lv.xp + ' XP';
}
function startSession(kind) {
  clearTimeout(beatTimer);
  state.session = { kind: kind };
  state.asked = 0; state.right = 0; state.streak = 0; state.last = null;
  show('quiz');
  nextQuestion();
}
