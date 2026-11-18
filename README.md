# Music Hero

배킹을 듣고 코드 진행과 키를 맞히는 귀 훈련 웹앱(PWA)입니다.

- 코드 진행 퀴즈, 키 맞추기, 코드 종류 맞추기, 복습
- 배킹 악기 3종(피아노, 기타, 신스)과 스타일 6종(팝, 발라드, 록, 펑크, 보사노바, 셔플)
- 연속 일수, 오늘 목표(10문제), 퀘스트, 기록
- 구글 로그인으로 여러 기기 동기화 (웹은 팝업, 앱은 안드로이드 기본 구글 로그인; 오프라인에서 푼 문제도 연결되면 올라감). 로그인하지 않으면 이 기기에만 저장
- 설치 없이 브라우저에서 열고, "홈 화면에 추가"로 앱처럼 사용

## 구조

- `index.html` 화면 마크업
- `css/app.css` 스타일
- `js/` 스크립트. 아래 순서로 불러옵니다.
  - `theory.js` 코드, 키, 진행, 난이도, 보이싱, 문제 만들기 (DOM 없음, 테스트 대상)
  - `progress.js` 연속 일수, 퀘스트, 복습, 경험치, 레벨 (DOM 없음, 테스트 대상)
  - `sync.js` 서버와 한 번 동기화하는 규칙 (Firebase 모름, DOM 없음, 테스트 대상)
  - `cloud.js` 구글 로그인, Firestore 연결, 자동 동기화, 계정 칸
  - `vendor/firebase.js` Firebase SDK 묶음 (`scripts/firebase-entry.mjs`에서 생성)
  - `ledger.js` 기록 저장 형식: 답 하나하나를 고유 ID가 붙은 이벤트로 쌓고, 화면에 보이는 값은 다시 계산. 두 기기 기록을 합쳐도 빠지거나 겹치지 않음 (동기화 준비, DOM 없음, 테스트 대상)
  - `app-state.js` 기기 저장, 공용 상태, 코드 칸
  - `audio.js` 샘플 기반 오디오 엔진
  - `views.js` 홈, 기록, 퀴즈 설정 화면
  - `quiz.js` 퀴즈 진행과 채점
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


## 웹 배포 (자기 서버)

웹 버전은 빌드가 필요 없는 정적 파일입니다. 저장소 폴더를 그대로 웹 서버(Nginx, Caddy 등)로 내보내면 됩니다.

- 서버는 **가장 높은 `vX.Y.Z` 태그**만 받아갑니다. `v1.0.0-beta` 같은 태그는 건너뜁니다.
- 배포 스크립트는 **배포 폴더 밖에 복사해서** 실행합니다. 배포 폴더는 버전이 바뀔 때마다 통째로 바뀌기 때문입니다.

```
cp scripts/deploy.sh ~/musichero-deploy.sh
~/musichero-deploy.sh ~/musichero          # 처음: 저장소를 받아 최신 릴리스로, 이후: 새 릴리스가 있을 때만 바꿈
crontab -e                                 # 10분마다:
*/10 * * * * $HOME/musichero-deploy.sh $HOME/musichero >> $HOME/musichero-deploy.log 2>&1
```

- 웹 서버는 이 폴더를 그대로 내보내되, `.git`과 웹에 필요 없는 폴더(`android`, `tests`, `scripts`, `.github`, `package*.json`)는 막아 둡니다.
- 서버에서 파일을 직접 고치지 않습니다. 수정은 모두 저장소에 push합니다.
- 오프라인 동작(서비스 워커)은 HTTPS에서만 됩니다.

배포 순서: main에 push → GitHub Pages(main을 그대로 따라감)에서 확인 → 테스트 통과 확인 → 릴리스

릴리스: `package.json`의 `version`을 올린 뒤 같은 커밋을 `release` 브랜치에 push합니다.
Actions가 `v<version>` 태그와 Releases(APK 첨부)를 만들고, 서버는 그 태그를 가져갑니다.

```
git push origin main:release
```

(태그를 직접 push해도 됩니다: `git tag v1.0.0 && git push origin v1.0.0`)

## 안드로이드 앱 (Capacitor)

- 앱 ID: `io.github.anoband.musichero`, 같은 웹 파일을 `www/`로 복사해 앱에 넣습니다(`npm run sync`).
- 안드로이드 스튜디오 없이 GitHub Actions가 빌드합니다(`.github/workflows/android.yml`).
  - main에 push: Actions 탭의 해당 실행 > Artifacts에서 APK
  - 릴리스(`release` 브랜치 push 또는 `v*` 태그): Releases에 APK가 첨부되어 폰에서 바로 받을 수 있음
- 테스트용 APK는 저장소의 고정 키(`android/app/test-signing.keystore`)로 서명합니다. 그래서 새 APK를 지우지 않고 덮어 설치할 수 있습니다. 플레이스토어 출시용 키는 별도로 만들어 저장소 밖에 둡니다.
- 앱에서만 보이는 기능: 매일 알림(그날 목표를 채웠으면 보내지 않음), 하드웨어 뒤로 가기

## Firebase

- 프로젝트 `quiz-algernon` (Auth: Google, Firestore: 서울)
- 보안 규칙은 `firestore.rules`. 바꾸면 Firebase 콘솔 > Firestore Database > 규칙에 붙여 넣고 게시
- 로그인할 수 있는 주소는 콘솔 > Authentication > 설정 > 승인된 도메인에 있어야 함
- 안드로이드 앱: `android/app/google-services.json`, 서명 키 SHA-1이 Firebase 안드로이드 앱에 등록돼 있어야 로그인됨 (서명 키를 바꾸면 새 SHA-1 추가)
