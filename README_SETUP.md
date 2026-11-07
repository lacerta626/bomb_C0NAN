# AFTER 11:07 PUBLIC 설치 안내

이 폴더는 원본 이벤트 프로젝트와 별개의 일반 공개용 정적 사이트다. 기존 참가 코드, 이벤트 랭킹, `verify_launch`, `admin_list_codes` 및 기존 RLS를 사용하거나 변경하지 않는다.

## 1. Supabase SQL 적용

1. Supabase Dashboard에서 기존 DB 백업을 생성한다.
2. SQL Editor에서 새 쿼리를 연다.
3. `sql/PUBLIC_SUPABASE_SETUP.sql` 전체를 붙여 넣고 실행한다.
4. Table Editor에서 빈 `public_game_open_sessions`, `public_game_open_records`가 생성됐는지 확인한다.
5. Database Functions에서 `public_game_start`, `public_game_verify`, `public_game_submit`, `public_game_leaderboard`, `public_game_ranking_page`를 확인한다.

SQL은 새 이름의 객체만 생성한다. 기존 이벤트 테이블/함수/정책에 대한 DROP, DELETE, TRUNCATE 또는 ALTER가 없다. 같은 SQL을 동일 정의로 다시 실행해도 안전하다.

## 2. 연결 정보

`public-supabase-config.js` 한 파일에서 다음 값을 설정한다. 일반 공개 게임 클라이언트와 갤러리 방명록 공용 클라이언트가 모두 이 파일을 읽는다.

```js
export const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR_PUBLISHABLE_OR_ANON_KEY';
```

현재 원본 프로젝트의 publishable URL/key를 별도 파일에 복사해 두었다. 다른 프로젝트를 사용할 때만 교체한다. service_role 또는 secret 키는 절대 브라우저 파일에 넣지 않는다.

## 3. 로컬 테스트

1. `START_LOCAL_TEST.cmd`를 더블클릭한다.
2. `http://127.0.0.1:4173/`에서 사이트를 연다.
3. 명령창은 테스트 중 유지하고 종료 시 `Ctrl+C`를 누른다.
4. Node.js/Python 설치는 필요 없다. HTML 파일을 `file:///`로 직접 열면 ES module이 차단되므로 사용하지 않는다.
5. 미니게임에서 Easy/Hard를 선택하고 닉네임을 입력해 실행한다.

## 4. GitHub Pages 배포

1. `AFTER_1107_PUBLIC` 내용만 새 저장소 또는 새 Pages 배포 브랜치 루트에 업로드한다.
2. Pages 설정에서 배포 브랜치와 `/ (root)`를 선택한다.
3. 커스텀 도메인을 사용하지 않으면 `CNAME`을 배포 전에 제거한다. 기존 도메인을 그대로 사용할 때만 유지한다.
4. 배포 후 `home.html`, `minigame/`, Easy/Hard 실행과 결과 TOP 10을 확인한다.
5. `public-ranking.html`에서 TOP 10/전체, Easy/Hard, 본인 순위를 확인한다.
6. `START_LOCAL_TEST.*`, `tests/`, `sql/`은 보안 비밀을 포함하지 않지만 원하면 Pages 배포 대상에서 제외할 수 있다.

## 5. 동작 및 보안

- 참가 코드와 횟수 제한이 없다.
- 닉네임은 한글/영문/숫자/내부 공백으로 2~12자다.
- 동일 닉네임을 허용하며 브라우저별 UUID의 SHA-256 해시로 플레이어 최고 기록을 구분한다.
- 테이블 직접 권한은 회수되고 쓰기는 SECURITY DEFINER RPC만 사용한다.
- 서버가 세션 시작/마감, 행 잠금, 세션당 1회 제출, 점수 상한, 최소 소요시간, 분당 세션 생성량을 검사한다.
- 공개 랭킹은 성공하고 유효한 새 기록만 사용하며 기존 이벤트 테이블을 조회하지 않는다.

클라이언트에서 게임 정답을 판정하는 정적 사이트 특성상 성공 신호 자체를 완전히 위조 불가능하게 만들 수는 없다. 완전한 판정 무결성이 필요하면 퍼즐 상태와 정답 판정을 Supabase Edge Function 등 신뢰 서버로 이전해야 한다.

## 6. 오류 확인

- `function public_game_start does not exist`: `PUBLIC_SUPABASE_SETUP.sql` 미실행 또는 잘못된 Supabase 프로젝트다.
- 빈 게임 화면: `file:///`로 열지 말고 로컬 서버 또는 GitHub Pages URL을 사용한다.
- CORS/네트워크 오류: URL/key, 브라우저 네트워크, Supabase 프로젝트 상태를 확인한다.
- 게임 입장권 만료: 선택 화면으로 돌아가 새 세션을 시작한다.
- 요청이 너무 많음: 1분 후 다시 시도한다.
- 구버전 화면: 강력 새로고침하고 HTML의 `v=public-1`을 확인한다.
