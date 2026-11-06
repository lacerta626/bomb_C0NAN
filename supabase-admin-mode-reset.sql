-- AFTER 11:07 / 관리자 Easy·Hard 시도 횟수 개별 초기화
-- 기존 코드, 결과, 게임 세션은 삭제하지 않습니다.
-- Supabase SQL Editor에서 이 파일 전체를 한 번 실행하세요.

begin;

create or replace function public.admin_reset_code_attempts(
  p_code text,
  p_mode text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_event_admin() then
    raise exception '관리자 권한이 없습니다.';
  end if;
  if p_mode not in ('easy', 'hard') then
    raise exception '초기화할 난이도가 올바르지 않습니다.';
  end if;

  if p_mode = 'easy' then
    update public.participant_codes set easy_used = 0 where code = p_code;
  else
    update public.participant_codes set hard_used = 0 where code = p_code;
  end if;

  if not found then
    raise exception '해당 코드가 없습니다.';
  end if;
  return true;
end
$$;

revoke execute on function public.admin_reset_code_attempts(text, text)
  from public, anon;
grant execute on function public.admin_reset_code_attempts(text, text)
  to authenticated;

commit;

notify pgrst, 'reload schema';

select
  has_function_privilege('authenticated', 'public.admin_reset_code_attempts(text,text)', 'EXECUTE')
    as authenticated_execute,
  has_function_privilege('anon', 'public.admin_reset_code_attempts(text,text)', 'EXECUTE')
    as anon_execute;
