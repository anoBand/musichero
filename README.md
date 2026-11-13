# Music Hero

배킹을 듣고 코드 진행과 키를 맞히는 귀 훈련 웹앱(PWA)입니다.

- 코드 진행 퀴즈, 키 맞추기, 솔로 연습(배킹 + 타이머), 복습
- 연속 일수, 오늘 목표, 퀘스트, 기록 (이 기기에만 저장)
- 설치 없이 브라우저에서 열고, "홈 화면에 추가"로 앱처럼 사용

## 구조

- `index.html` 앱 전체 (화면, 스타일, 로직)
- `sw.js` 오프라인 캐시. 파일을 바꾼 뒤 예전 캐시를 버려야 하면 `VERSION`을 올립니다.
- `manifest.webmanifest`, `icons/` 설치 정보와 아이콘
- `vendor/tone-14.8.49.js` [Tone.js](https://tonejs.github.io/) (MIT)

빌드 과정은 없습니다. 로컬에서 볼 때는 `python3 -m http.server` 후 브라우저로 엽니다.
