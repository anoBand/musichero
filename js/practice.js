/* Solo practice: backing loop, timer, progression and key pickers. */
/* ---- solo practice ---- */
function practiceProg() { return POOL.find((p) => p.id === practice.progId); }
function applyPractice(live) {
  if (practice.custom) {
    chords = parseProgressionText(practice.custom).chords;
  } else {
    const p = practiceProg();
    chords = chordsFor(p, keyObj(p.mode, practice.keyPc));
  }
  prepareVoicing(chords);
  renderChart();
  if (live && playing) morph();
}
function renderPracticeClock() {
  const target = practice.minutes * 60;
  const el = $('#p-time');
  el.textContent = fmtTime(practice.sec);
  if (target) { const sm = document.createElement('small'); sm.textContent = '/ ' + fmtTime(target); el.appendChild(sm); }
}
function flushPractice() {
  if (!practice.unsaved) return;
  addPractice(Store.data, today(), practice.unsaved);
  practice.unsaved = 0;
  Store.save();
}
function openPractice() {
  if (playing) stop();
  show('practice');
  practice.sec = 0; practice.unsaved = 0;
  bpm = practice.bpm;
  $('#p-loops').textContent = '';
  setStatus('재생 중에 진행이나 키를 바꿔도 이어지고, 코드 칸을 누르면 그 마디부터 재생돼요.');
  applyPractice(false);
  renderPracticeClock();
}
setInterval(() => {
  if (!playing || !inPractice()) return;
  practice.sec += 1;
  practice.unsaved += 1;
  if (practice.unsaved >= 10) flushPractice();
  renderPracticeClock();
  if (practice.minutes && practice.sec >= practice.minutes * 60) {
    stop('설정한 ' + practice.minutes + '분이 끝났어요. 수고했어요.');
    practice.sec = 0;
  }
}, 1000);
