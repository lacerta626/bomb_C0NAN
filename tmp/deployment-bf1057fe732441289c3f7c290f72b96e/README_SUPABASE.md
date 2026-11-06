# AFTER 11:07 — Supabase 운영 안내

## 운영 DB 적용 순서

기존 데이터베이스에는 `supabase-setup.sql` 전체를 다시 실행하지 않습니다.

1. Supabase Dashboard에서 데이터베이스 백업을 생성합니다.
2. `supabase-diagnostic-v3.sql`을 실행해 기존 함수 시그니처와 RLS 상태를 확인합니다.
3. 결과에 예상하지 못한 함수 종속성이 없는지 확인합니다.
4. `supabase-migration-ranking-v3.sql`을 실행합니다.
5. 마이그레이션 마지막의 검증 쿼리에서 다음 결과를 확인합니다.
   - `start_game(text, text, text)` → `jsonb`
   - `verify_launch(uuid, text)` → `jsonb`
   - `admin_list_codes()` → 닉네임 포함 테이블
6. 다시 `supabase-diagnostic-v3.sql`을 실행해 권한과 반환형을 비교합니다.

신규 Supabase 프로젝트만 `supabase-setup.sql` 실행 후 `supabase-migration-ranking-v3.sql`을 실행합니다.

## 오류 원인과 해결

기존 SQL은 `verify_launch(uuid,text)`를 먼저 `boolean`, 뒤에서 다시 `jsonb`로 선언했습니다. PostgreSQL은 `create or replace function`으로 반환형을 변경할 수 없어 `42P13` 오류가 발생했습니다.

증분 마이그레이션은 정확한 시그니처만 `DROP FUNCTION`하고 즉시 재생성합니다. `CASCADE`, `DROP TABLE`, `TRUNCATE`는 사용하지 않습니다. 예상하지 못한 종속성이 있으면 삭제가 실패하고 트랜잭션 전체가 롤백됩니다.

## 관리자 계정

Authentication → Users에서 관리자 계정을 생성한 다음
`supabase-register-admin.sql`의 `YOUR_ADMIN_EMAIL`을 실제 이메일로 바꾸고
SQL Editor에서 전체 실행합니다. 이메일을 기준으로 정확한 Auth UUID가 등록됩니다.

```sql
insert into public.admin_users(user_id)
values ('관리자-auth-user-uuid')
on conflict do nothing;
```

관리자 페이지는 로그인 성공과 `admin_users` 권한 확인 결과를 별도로 표시합니다. 모든 관리자 변경 작업은 서버 RPC에서 다시 권한을 검증합니다.

`permission denied for function admin_status`가 나오면 함수 실행 권한이 회수된
상태이므로 `supabase-repair-admin-access.sql` 전체를 실행한 뒤 다시 로그인합니다.

## 갤러리 방명록

`supabase-gallery-guestbook.sql` 전체를 SQL Editor에서 한 번 실행합니다.
이 SQL은 게임·랭킹 데이터에 손대지 않고 `gallery_guestbook`과 전용 RPC만 추가합니다.
공개 작성은 직접 INSERT가 아니라 30초 서버 제한이 적용된 RPC를 사용합니다.
Supabase Dashboard의 Realtime 설정에서 `gallery_guestbook`이 활성화되어 있는지
확인하세요. SQL이 publication 등록도 시도하며, 연결 실패 시 화면의 수동 새로고침을
사용할 수 있습니다. CAPTCHA가 필요한 운영 환경은 Edge Function에서 CAPTCHA를
검증한 뒤 `post_gallery_guestbook`을 호출하도록 확장하세요.

## 참가자 닉네임

- 참가자는 이메일 회원가입 없이 4자리 코드와 2~12자 닉네임을 사용합니다.
- 최초 등록은 `register_participant` RPC에서 처리하며 시도 횟수를 차감하지 않습니다.
- 브라우저에는 무작위 참가자 토큰만 저장되고 DB에는 SHA-256 해시만 저장됩니다.
- 닉네임 변경은 참가자 토큰을 요구하며 10분에 한 번만 가능합니다.
- 새 기기에서는 코드와 기존 닉네임이 모두 일치해야 토큰을 재발급합니다.
- 코드가 사실상 참가자의 비밀번호 역할을 하므로 코드 공유·유출까지 완전히 방어할 수는 없습니다.
- 랭킹과 관리자 기록은 참가 코드로 연결하고 표시할 때 최신 닉네임을 조인합니다.

## 게임 세션

- Easy와 Hard는 각각 3회입니다.
- `start_game`에서 참가자 토큰 검증과 시도 차감을 한 트랜잭션으로 처리합니다.
- 3분 `expires_at`은 최초 게임 페이지 진입권의 만료 시간입니다.
- 최초 검증 시 `game_deadline_at`이 Easy 90초, Hard 120초로 별도 설정됩니다.
- 새로고침 시 같은 세션을 재사용하며 서버가 남은 시간을 다시 계산합니다.
- 완료되거나 제한 시간이 지난 세션은 재사용할 수 없습니다.
- 결과는 `session_id unique` 제약과 행 잠금으로 중복 저장을 막습니다.
- 네트워크 오류 시 브라우저 저장소의 세션을 유지하고 서버에서 재검증할 수 있습니다.

## 랭킹

- 성공하고 `is_valid=true`인 기록만 표시합니다.
- 참가 코드별 최고 기록 하나만 선택합니다.
- 남은 시간이 많은 순서, 동일 점수는 먼저 등록된 순서입니다.
- 공개 RPC는 순위, 최신 닉네임, 남은 시간만 반환합니다.
- 참가 코드와 세션 ID는 공개 응답에 포함하지 않습니다.

## 관리자 기능

- 참가 코드 100개 생성 및 CSV
- 코드·닉네임 검색
- 관리자 닉네임 수정
- Easy/Hard 사용 횟수 확인 및 초기화
- 코드 차단/활성화
- 성공/실패 기록 조회 및 필터
- 기록 유효/무효 전환
- 전체 결과 CSV
- 5초 간격 자동 갱신

## 수동 테스트 절차

실제 Supabase 연결 후 다음을 순서대로 확인합니다.

1. 미사용 코드에 닉네임 등록 후 횟수가 차감되지 않는지 확인
2. 같은 코드로 재접속 시 닉네임과 잔여 횟수 확인
3. 참가자 닉네임 변경 후 10분 제한 확인
4. 관리자 닉네임 변경 후 기존 결과와 랭킹 유지 확인
5. Easy 4회째와 Hard 4회째 시작 거부 확인
6. 게임 중 새로고침 후 서버 기준 남은 시간 감소 확인
7. 같은 세션을 두 탭에서 열어 추가 차감과 중복 결과가 없는지 확인
8. 성공/실패 자동 저장과 공개 랭킹 반영 확인
9. 일반 Auth 사용자로 관리자 RPC 거부 확인
10. 관리자 목록 5초 자동 갱신 확인
11. 모바일에서 코드 입력, 모달, 게임 실행 화면 확인

## 배포

1. 변경 파일을 GitHub Pages 배포 브랜치/디렉터리에 반영합니다.
2. `supabase-config.js`에는 publishable/anon key만 둡니다.
3. service role/secret key와 SQL 파일은 공개 배포에서 제외하는 것을 권장합니다.
4. 배포 후 `Ctrl+Shift+R`로 캐시를 갱신합니다.
5. 다음 파일 응답에 `v=20261106-3`가 반영됐는지 확인합니다.
   - `/minigame/minigame-access.js`
   - `/minigame/game-runner-auth.js`
   - `/admin-supabase.js`
   - `/leaderboard.js`

## 롤백

`supabase-rollback-ranking-v3.sql`은 v3 RPC 권한만 회수하며 데이터와 컬럼을 삭제하지 않습니다. 완전한 함수 복구가 필요하면 백업 ZIP의 이전 SQL에서 필요한 함수만 명시적 시그니처로 재생성합니다.

## 보안 한계

게임은 GitHub Pages의 클라이언트 JavaScript에서 실행됩니다. 서버가 세션 시작 시각, 마감 시각, 중복 저장, 점수 상한을 검증하지만 브라우저에서 성공 이벤트 자체를 조작하는 행위를 완전히 막을 수는 없습니다. 완전한 판정 무결성이 필요하면 게임 판정 로직을 신뢰 가능한 서버로 옮겨야 합니다.
