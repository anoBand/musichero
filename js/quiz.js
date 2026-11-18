/* Quiz flow: asking, answering (multiple choice and written), switching between options. */
/* ---- quiz ---- */
const LETTERS = 'ABCDEFGHIJKL';
function updateScore() {
  const el = $('#score');
  el.textContent = '';
  const parts = [];
  if (state.session.kind === 'review') parts.push(['복습', '남은 ' + dueReviews(Store.data, today()).length + '개']);
  parts.push(['문제', String(state.phase === 'answered' ? state.asked : state.asked + 1)]);
  parts.push(['정답', state.right + '/' + state.asked]);
  parts.push(['연속', String(state.streak)]);
  parts.forEach((p) => {
    const span = document.createElement('span');
    span.append(p[0] + ' ');
    const b = document.createElement('b'); b.textContent = p[1];
    span.appendChild(b);
    el.appendChild(span);
  });
}
/* written progression answer: the chords to choose from */
function renderPalette() {
  const el = $('#opts');
  el.textContent = '';
  el.className = 'opts pal';
  state.q.palette.forEach((pc, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pal-btn'; b.dataset.p = String(i);
    const c = document.createElement('span'); c.className = 'c'; c.textContent = pc.label;
    const r = document.createElement('span'); r.className = 'r'; r.textContent = pc.roman;
    b.append(c, r);
    el.appendChild(b);
  });
}
/* the masked chart doubles as the answer sheet: each bar shows the chord picked for it */
function renderSlots() {
  const bars = $('#chart').children;
  for (let i = 0; i < bars.length; i++) {
    const pick = state.mine[i];
    bars[i].querySelector('.qm').textContent = pick === null ? '?' : state.q.palette[pick].label;
    bars[i].classList.toggle('slot', i === state.slot);
  }
  $('#confirm').disabled = state.mine.some((x) => x === null);
}
function choose(pi) {
  if (state.phase !== 'asking') return;
  state.mine[state.slot] = pi;
  const empty = state.mine.indexOf(null);
  if (empty >= 0) state.slot = empty;
  else if (state.slot < state.mine.length - 1) state.slot += 1;
  renderSlots();
}
/* grade a written progression: every bar must match. The answer and (if wrong) the entered progression become
   two rows that can be switched between by ear, like the options of a multiple-choice question. */
function submitWritten() {
  const q = state.q;
  if (state.phase !== 'asking' || state.mine.some((x) => x === null)) return;
  const picks = state.mine.map((i) => q.palette[i]);
  const ok = sameSteps(picks.map((x) => x.step), q.prog.steps);
  q.options = [{ id: q.answerId, label: chordText(q.chords), sub: q.prog.roman, chords: q.chords }];
  if (!ok) {
    const mine = picks.map((x) => parseChord(x.token));
    q.options.push({ id: '(mine)', label: chordText(mine), sub: picks.map((x) => x.roman).join('–'), chords: mine });
  }
  const bars = $('#chart').children;
  picks.forEach((x, i) => {
    bars[i].classList.remove('slot');
    bars[i].classList.toggle('miss', !(x.step[0] === q.prog.steps[i][0] && x.step[1] === q.prog.steps[i][1]));
  });
  $('#chart').classList.remove('filling');
  renderOptions();
  answer(ok ? 0 : 1);
}
function renderOptions() {
  const el = $('#opts');
  el.textContent = '';
  el.className = 'opts' + (state.q.type === 'key' && state.q.free ? ' notes' : '') + (state.q.type === 'qual' ? ' qual' : '');
  state.q.options.forEach((o, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt';
    b.dataset.i = String(i);
    const ltr = document.createElement('span'); ltr.className = 'ltr'; ltr.textContent = LETTERS.charAt(i);
    const body = document.createElement('span');
    const chs = document.createElement('span'); chs.className = 'chs';
    (state.q.type === 'prog' ? o.chords.map((c) => c.root + c.quality) : [o.label]).forEach((txt) => {
      const s = document.createElement('span'); s.textContent = txt; chs.appendChild(s);
    });
    const rm = document.createElement('span'); rm.className = 'rm'; rm.textContent = o.sub;
    body.append(chs, rm);
    const tag = document.createElement('span'); tag.className = 'tag';
    b.append(ltr, body, tag);
    el.appendChild(b);
  });
}
async function nextQuestion() {
  if (playing) stop();
  const s = state.session;
  const free = state.amode === 'free' && s.kind !== 'review';
  let q;
  if (s.kind === 'review') {
    const due = dueReviews(Store.data, today());
    if (!due.length) { showHome(); return; }
    const it = due[0];
    s.item = it;
    q = it.t === 'key' ? makeKeyQuestion(it.mode, null, it.id)
      : it.t === 'qual' ? makeQualQuestion('hard', null, it.id)
      : makeProgQuestion(it.mode, null, null, it.id);
  } else {
    const lv = LEVELS[state.level] || null;
    const setting = lv ? lv.setting : state.setting;
    q = s.kind === 'key' ? makeKeyQuestion(setting, state.last, null, lv, free)
      : s.kind === 'qual' ? makeQualQuestion(state.level, state.last)
      : makeProgQuestion(setting, state.last, lv ? null : state.keyPc, null, lv);
    if (free && q.type === 'prog') { q.free = true; q.palette = paletteFor(q, lv); }
  }
  state.q = q;
  state.phase = 'asking';
  state.last = { id: q.prog ? q.prog.id : q.quality, key: q.mode + q.key.id };
  state.qStyle = state.style === 'random' ? STYLE_IDS[Math.floor(Math.random() * STYLE_IDS.length)] : state.style;
  chords = q.chords;
  prepareVoicing(chords);
  const lvNow = s.kind === 'review' ? null : LEVELS[state.level];
  bpm = lvNow ? randomIn(lvNow.bpm) : (s.kind === 'review' || state.bpmMode === 'random' ? randomBpm() : fixedBpm);
  const isQual = q.type === 'qual';
  $('#key').textContent = q.type === 'key' ? '키 ?' : isQual ? keyLabel(q.key) + ' 코드 · 어떤 종류?' : keyLabel(q.key) + ' ' + modeWord(q.mode);
  $('#bpmv').textContent = isQual ? '' : bpm + ' BPM · ' + STYLES[currentStyle()].label;
  /* a single chord has no bass or melody part to switch */
  $$('#quiz .layer-btn').forEach((b) => { b.hidden = isQual; });
  $('#quiz').classList.toggle('qual', isQual);
  renderChart();
  $('#chart').classList.add('masked');
  const isKey = q.type === 'key';
  const writing = q.type === 'prog' && !!q.free;
  state.sel = -1;
  state.mine = chords.map(() => null);
  state.slot = 0;
  $('#chart').classList.toggle('filling', writing);
  if (writing) { renderPalette(); renderSlots(); } else renderOptions();
  $('#quiz').classList.remove('answered');
  $('#quiz').classList.toggle('picking', isKey || writing);
  $('#confirm').hidden = !(isKey || writing);
  $('#confirm').disabled = true;
  $('#confirm').textContent = writing ? '이 진행으로 답하기' : '이 음으로 답하기';
  $('#switch-hint').hidden = !(isKey || writing);
  $('#switch-hint').textContent = writing
    ? '마디를 누르면 그 마디부터 들려요. 아래에서 코드를 골라 네 마디를 채우세요.'
    : (q.free ? '음을 눌러 얹어 들어보고, 12음 중에서 으뜸음을 고르세요.' : '보기를 눌러 음을 얹어 들어보고, 가장 집처럼 들리는 음을 고르세요.');
  state.nowIdx = -1;
  $('#next').hidden = true;
  setStatus('');
  updateScore();
  await start();
}
function answer(i) {
  if (state.phase !== 'asking') return;
  state.phase = 'answered';
  const q = state.q;
  const isKey = q.type === 'key';
  const ok = q.options[i].id === q.answerId;
  state.asked += 1;
  if (ok) { state.right += 1; state.streak += 1; } else { state.streak = 0; }
  const inReview = state.session.kind === 'review';
  /* a right answer earns more on harder presets: 하수 10, 중수 15, 고수 20 (상세 설정 and review: 10) */
  const baseGain = !inReview && LEVELS[state.level] ? LEVELS[state.level].xp : XP_RIGHT;
  /* written answers earn half as much again, rounded to 5 */
  const gain = q.free ? Math.round(baseGain * 1.5 / 5) * 5 : baseGain;
  const levelBefore = levelInfo(Store.data.xp).level;
  const doneQuests = Store.answer({
    type: q.type, id: inReview && state.session.item ? state.session.item.id : q.itemId, mode: q.mode, ok: ok, review: inReview, xp: gain
  });

  const btns = $('#opts').children;
  let correctLetter = '';
  q.options.forEach((o, j) => {
    const b = btns[j];
    const tag = b.querySelector('.tag');
    b.classList.remove('sel');
    if (isKey) b.querySelector('.rm').textContent = o.degree;
    if (o.id === q.answerId) { b.classList.add('correct'); if (ok) b.classList.add('fx-pop'); tag.textContent = '정답'; correctLetter = q.free || q.type === 'qual' ? o.label : LETTERS.charAt(j); }
    else if (j === i) { b.classList.add('wrong', 'fx-shake'); tag.textContent = '내 선택'; }
    else { b.classList.add('dim'); }
  });
  $('#chart').classList.remove('masked');
  const isQual = q.type === 'qual';
  const keyText = keyLabel(q.key) + ' ' + modeWord(q.mode);
  const chordName = q.chords[0].root + q.chords[0].quality;
  $('#key').textContent = isQual ? chordName : keyText;

  const detail = isKey
    ? '으뜸음 ' + keyLabel(q.key) + ' · ' + keyText + ' · ' + q.prog.roman
    : isQual ? chordName + ' · ' + QUAL_FORMULA[q.quality]
    : q.prog.roman + (q.prog.name ? ' · ' + q.prog.name : '');
  let msg = ok ? '정답입니다 +' + gain + ' XP · ' + detail : '아쉬워요 +' + XP_WRONG + ' XP · 정답은 ' + correctLetter + ' (' + detail + ')';
  if (doneQuests.length) msg += ' · 퀘스트 완료: ' + doneQuests.join(', ');
  const levelAfter = levelInfo(Store.data.xp).level;
  if (levelAfter > levelBefore) {
    msg += ' · 레벨 ' + levelAfter + ' 달성';
    const opened = [];
    for (let l = levelBefore + 1; l <= levelAfter; l++) unlockedAt(l).forEach((x) => opened.push(x));
    if (opened.length) msg += ' (' + opened.join(', ') + ' 해금)';
  }
  setStatus(msg, ok ? 'ok' : 'bad');
  $('#quiz').classList.remove('picking');
  $('#quiz').classList.add('answered');
  $('#confirm').hidden = true;
  const reviewDone = inReview && !dueReviews(Store.data, today()).length;
  $('#next').textContent = reviewDone ? '복습 끝내기' : '다음 문제';
  $('#next').hidden = false;
  $('#switch-hint').textContent = isKey
    ? '보기를 누르면 그 음을 다시 들어볼 수 있어요.'
    : isQual ? '다른 보기를 누르면 같은 근음의 그 종류 코드를 들어볼 수 있어요.'
    : '다른 보기를 누르면 바로 바꿔 들을 수 있고, 코드 칸을 누르면 그 마디부터 재생돼요.';
  $('#switch-hint').hidden = false;
  state.nowIdx = isKey ? -1 : q.options.findIndex((o) => o.id === q.answerId);
  if (!isKey) markNow();
  updateScore();
}
/* key quiz: tapping a note plays it and marks it as the current pick; the answer is given with the button */
function pick(i) {
  state.sel = i;
  Array.from($('#opts').children).forEach((b, j) => b.classList.toggle('sel', j === i));
  $('#confirm').disabled = false;
  audition(i);
}
function markNow() {
  const btns = $('#opts').children;
  for (let j = 0; j < btns.length; j++) {
    const on = j === state.nowIdx;
    btns[j].classList.toggle('now', on);
    if (on) btns[j].setAttribute('aria-current', 'true'); else btns[j].removeAttribute('aria-current');
    btns[j].querySelector('.ltr').textContent = on ? '▶' : LETTERS.charAt(j);
  }
}
function switchTo(i) {
  if (i === state.nowIdx) { if (!playing) start(); return; }
  const o = state.q.options[i];
  prepareVoicing(o.chords);
  state.nowIdx = i;
  markNow();
  chords = o.chords;
  renderChart();
  if (!playing) { start(); return; }
  morph();
}
