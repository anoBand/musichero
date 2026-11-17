# Music Hero

배킹을 듣고 코드 진행과 키를 맞히는 귀 훈련 웹앱(PWA)입니다.

- 코드 진행 퀴즈, 키 맞추기, 솔로 연습(배킹 + 타이머), 복습
- 연속 일수, 오늘 목표, 퀘스트, 기록 (이 기기에만 저장)
- 설치 없이 브라우저에서 열고, "홈 화면에 추가"로 앱처럼 사용

## 구조

- `index.html` 화면 마크업
- `css/app.css` 스타일
- `js/` 스크립트. 아래 순서로 불러옵니다.
  - `theory.js` 코드, 키, 진행, 난이도, 보이싱, 문제 만들기 (DOM 없음, 테스트 대상)
  - `progress.js` 연속 일수, 퀘스트, 복습, 경험치, 레벨 (DOM 없음, 테스트 대상)
  - `app-state.js` 기기 저장, 공용 상태, 코드 칸
  - `audio.js` 샘플 기반 오디오 엔진
  - `views.js` 홈, 기록, 퀴즈 설정 화면
  - `quiz.js` 퀴즈 진행과 채점
  - `practice.js` 솔로 연습
  - `main.js` 이벤트 연결과 시작
- `sw.js` 오프라인 캐시. 파일을 추가하면 `SHELL`에 넣고, 예전 캐시를 버려야 하면 `VERSION`을 올립니다.
- `manifest.webmanifest`, `icons/`, `screenshots/` 설치 정보
- `samples/` 악기 샘플 (FluidR3_GM, CC BY 3.0 — `samples/LICENSE.md` 참고)

## 테스트

```
npm install
npm test                              # 단위 테스트 (theory, progress)
npx playwright install chromium
npm run smoke                         # 브라우저로 모든 화면 확인
```

push하면 GitHub Actions에서 두 테스트가 자동으로 돌아갑니다.

빌드 과정은 없습니다. 로컬에서 볼 때는 `python3 -m http.server` 후 `/musichero/`가 아닌 저장소 폴더 경로로 엽니다.
