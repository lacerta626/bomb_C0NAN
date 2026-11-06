-- AFTER 11:07 / Easy·Hard 각각 3회로 확장
-- 기존 코드, 사용 횟수, 게임 기록은 그대로 보존됩니다.
-- 운영 DB의 Supabase SQL Editor에서 이 파일 전체를 한 번 실행하세요.

begin;

-- 기존 0~2 제약을 0~3으로 교체합니다.
alter table public.participant_codes
  drop constraint if exists participant_codes_easy_used_check;
alter table public.participant_codes
  drop constraint if exists participant_codes_hard_used_check;
alter table public.participant_codes
  add constraint participant_codes_easy_used_check
    check (easy_used between 0 and 3);
alter table public.participant_codes
  add constraint participant_codes_hard_used_check
    check (hard_used between 0 and 3);

-- 세 번째 시도의 결과도 저장될 수 있도록 확장합니다.
alter table public.game_results
  drop constraint if exists game_results_attempt_number_check;
alter table public.game_results
  add constraint game_results_attempt_number_check
    check (attempt_number between 1 and 3);

create or replace function public.check_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare r public.participant_codes%rowtype;
begin
  if p_code !~ '^[0-9]{4}$' then raise exception '4자리 숫자를 입력해 주세요.'; end if;
  select * into r from public.participant_codes where code = p_code and not disabled;
  if not found then raise exception '등록되지 않았거나 차단된 코드입니다.'; end if;
  return jsonb_build_object(
    'easy', 3-r.easy_used,
    'hard', 3-r.hard_used,
    'nickname', r.nickname,
    'registered', r.nickname is not null
  );
end
$$;

create or replace function public.start_game(
  p_code text,
  p_mode text,
  p_access_token text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r public.participant_codes%rowtype;
  t uuid;
  sid uuid;
  ex timestamptz;
  attempt integer;
  limit_seconds integer := case when p_mode = 'easy' then 90 else 120 end;
begin
  if p_code !~ '^[0-9]{4}$' or p_mode not in ('easy','hard') then
    raise exception '코드 또는 난이도가 올바르지 않습니다.';
  end if;

  select * into r from public.participant_codes where code = p_code for update;
  if not found or r.disabled or not public.is_valid_participant_token(p_code, p_access_token) then
    raise exception '참가자 인증이 필요합니다.';
  end if;

  if p_mode = 'easy' then
    if r.easy_used >= 3 then raise exception 'Easy 기회를 모두 사용했습니다.'; end if;
    attempt := r.easy_used + 1;
    update public.participant_codes set easy_used = attempt where code = p_code;
  else
    if r.hard_used >= 3 then raise exception 'Hard 기회를 모두 사용했습니다.'; end if;
    attempt := r.hard_used + 1;
    update public.participant_codes set hard_used = attempt where code = p_code;
  end if;

  insert into public.game_launches(
    code, mode, nickname, time_limit_seconds, attempt_number
  ) values (
    p_code, p_mode, r.nickname, limit_seconds, attempt
  )
  returning token, session_id, expires_at into t, sid, ex;

  return jsonb_build_object('token', t, 'session_id', sid, 'expires_at', ex);
end
$$;

-- CREATE OR REPLACE 후에도 명시적으로 호출 권한을 다시 고정합니다.
revoke execute on function public.check_code(text) from public;
revoke execute on function public.start_game(text, text, text) from public;
grant execute on function public.check_code(text) to anon, authenticated;
grant execute on function public.start_game(text, text, text) to anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- 두 값이 모두 3이면 적용 완료입니다.
select
  3 - easy_used as easy_remaining,
  3 - hard_used as hard_remaining
from public.participant_codes
order by created_at desc
limit 10;
