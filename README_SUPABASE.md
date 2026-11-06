# AFTER 11:07 — Supabase 무료 간편 버전

## 1. Supabase 설정 (약 10~20분)
1. https://supabase.com/dashboard 에서 New project 생성 (Free).
2. SQL Editor > New query > `supabase-setup.sql` 전체 붙여넣기 > Run.
3. Project Settings > API (또는 Connect)에서 Project URL과 publishable/anon key 확인.
4. 최상위 `supabase-config.js`에 URL과 키 입력. **service_role/secret key는 절대 웹에 넣지 마세요.**
5. Authentication > Providers > Email 활성화. 관리자만 사용할 이메일 계정은 Authentication > Users에서 생성하거나 가입합니다.
6. 관리자 계정이 생성되면 Authentication > Users에서 UUID를 복사하여 SQL Editor에서 아래 명령을 실행하세요.

```sql
insert into public.admin_users(user_id) values ('5bf4b645-135c-4893-bc12-0a0fd6645516');
```

7. `admin-supabase.html`에 관리자 이메일/비밀번호로 로그인하여 코드 100개 생성, CSV 저장.
8. GitHub Pages 저장소 루트에 웹사이트 파일 업로드. `supabase-setup.sql`은 업로드하지 않아도 됩니다.

## 동작
- 게임 선택 페이지에서 4자리 코드를 입력하고 Easy/Hard 선택 후 확인을 누르면 DB에서 해당 난이도 1회 차감.
- 난이도별 2회, 합계 4회. 새로고침이나 재접속으로 복구되지 않음.
- 게임 실행용 3분짜리 일회용 입장 토큰 사용, 내부 재시작 UI 비활성화.
- 공지사항의 방명록은 DB에 기록되며 모든 방문자가 조회 가능.
- 관리자 화면은 인증된 관리자 UUID만 RPC를 호출할 수 있음.

## 주의사항
- 이 버전은 소규모 신뢰 기반 행사에 맞춘 간편 버전입니다. **4자리 코드는 추측 가능**하며 코드별 인증 시도 제한이 없습니다.
- 공개 GitHub Pages의 정적 게임 파일은 개발자 도구 등으로 직접 실행할 수 있으므로 **완전한 게임 실행 차단이나 결과 위변조 방지는 불가능**합니다. DB의 게임 시작 횟수는 트랜잭션으로 제한합니다.
- 방명록은 로그인 없이 등록할 수 있어 스팸 방지가 없습니다. 행사 기간 중 관리자 모니터링을 권장합니다.
- 무료 Supabase 프로젝트는 활동이 없으면 일시 중지될 수 있습니다.
- 공개 페이지의 키는 publishable/anon 키만 사용하세요. RLS를 끄거나 service_role 키를 넣으면 안 됩니다.
- 기존 Firebase 코드는 배포 파일에서 제거했습니다.
