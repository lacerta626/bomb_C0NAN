-- AFTER 11:07 / 관리자 RPC 권한 복구
-- 테이블이나 데이터를 변경하지 않습니다.
-- Supabase SQL Editor에서 이 파일 전체를 실행하세요.

begin;

-- PostgREST의 로그인 사용자 역할이 public 스키마의 관리자 RPC를 호출하도록 복구합니다.
grant usage on schema public to authenticated;

grant execute on function public.admin_status() to authenticated;
grant execute on function public.admin_list_codes() to authenticated;
grant execute on function public.admin_list_results() to authenticated;
grant execute on function public.admin_update_nickname(text, text) to authenticated;
grant execute on function public.admin_set_result_valid(bigint, boolean) to authenticated;
grant execute on function public.admin_create_codes(integer) to authenticated;
grant execute on function public.admin_update_code(text, boolean, boolean) to authenticated;

-- 비로그인 사용자는 관리자 RPC를 실행할 수 없어야 합니다.
revoke execute on function public.admin_status() from anon;
revoke execute on function public.admin_list_codes() from anon;
revoke execute on function public.admin_list_results() from anon;
revoke execute on function public.admin_update_nickname(text, text) from anon;
revoke execute on function public.admin_set_result_valid(bigint, boolean) from anon;
revoke execute on function public.admin_create_codes(integer) from anon;
revoke execute on function public.admin_update_code(text, boolean, boolean) from anon;

commit;

-- PostgREST가 변경된 함수 권한과 시그니처를 즉시 다시 읽도록 요청합니다.
notify pgrst, 'reload schema';

-- authenticated에는 EXECUTE=true, anon에는 EXECUTE=false가 나와야 정상입니다.
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'admin_status',
    'admin_list_codes',
    'admin_list_results',
    'admin_update_nickname',
    'admin_set_result_valid',
    'admin_create_codes',
    'admin_update_code'
  )
order by p.proname, arguments;
