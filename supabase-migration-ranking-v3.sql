-- AFTER 11:07 / 기존 데이터를 보존하는 증분 마이그레이션
-- 적용 전: supabase-diagnostic-v3.sql 실행 및 DB 백업 권장
-- 금지 작업: DROP TABLE, TRUNCATE, DROP ... CASCADE

begin;

-- Supabase installs extensions in the `extensions` schema.  The RPCs below
-- use a restricted search_path, so pgcrypto calls are schema-qualified.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- 1. 기존 테이블 확장 (행 삭제 없음)
alter table public.participant_codes add column if not exists nickname text;
alter table public.participant_codes add column if not exists participant_token_hash text;
alter table public.participant_codes add column if not exists token_issued_at timestamptz;
alter table public.participant_codes add column if not exists nickname_changed_at timestamptz;

alter table public.game_launches add column if not exists session_id uuid default gen_random_uuid();
alter table public.game_launches add column if not exists nickname text;
alter table public.game_launches add column if not exists time_limit_seconds integer;
alter table public.game_launches add column if not exists attempt_number integer;
alter table public.game_launches add column if not exists game_deadline_at timestamptz;
alter table public.game_launches add column if not exists finished_at timestamptz;

update public.game_launches
set session_id = gen_random_uuid()
where session_id is null;

create unique index if not exists game_launches_session_id_key
  on public.game_launches(session_id);

create table if not exists public.game_results (
  id bigint generated always as identity primary key,
  session_id uuid not null unique,
  participant_code text not null references public.participant_codes(code),
  nickname text not null,
  difficulty text not null check (difficulty in ('easy', 'hard')),
  attempt_number integer not null check (attempt_number between 1 and 3),
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  time_limit_seconds integer not null check (time_limit_seconds > 0),
  remaining_seconds numeric(8,2) not null default 0,
  elapsed_seconds numeric(8,2) not null default 0,
  success boolean not null,
  is_valid boolean not null default true,
  created_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'participant_nickname_length') then
    alter table public.participant_codes
      add constraint participant_nickname_length
      check (nickname is null or char_length(nickname) between 2 and 12) not valid;
  end if;
end $$;

alter table public.participant_codes enable row level security;
alter table public.game_launches enable row level security;
alter table public.game_results enable row level security;

revoke all on public.participant_codes, public.game_launches, public.game_results
  from anon, authenticated;

-- 2. 반환형/컬럼 변경이 있는 기존 함수만 정확한 시그니처로 제거
-- CASCADE를 쓰지 않으므로 예상치 못한 종속성이 있으면 안전하게 중단됩니다.
drop function if exists public.verify_launch(uuid, text);
drop function if exists public.start_game(text, text);
drop function if exists public.start_game(text, text, text);
drop function if exists public.admin_list_codes();
drop function if exists public.finish_game(uuid, boolean, numeric, numeric);
drop function if exists public.public_leaderboard(text);
drop function if exists public.admin_list_results();

-- 3. 공통 검증 함수
create or replace function public.is_valid_participant_token(p_code text, p_token text)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  select p_token is not null
    and exists (
      select 1
      from public.participant_codes p
      where p.code = p_code
        and not p.disabled
        and p.participant_token_hash = encode(
          extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'),
          'hex'
        )
    );
$$;

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
end $$;

-- 닉네임 등록은 시도 횟수를 차감하지 않습니다.
create or replace function public.register_participant(
  p_code text,
  p_nickname text,
  p_access_token text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r public.participant_codes%rowtype;
  clean_nickname text := regexp_replace(trim(p_nickname), '\s+', ' ', 'g');
  issued_token text;
begin
  if p_code !~ '^[0-9]{4}$' then raise exception '4자리 숫자를 입력해 주세요.'; end if;
  if char_length(clean_nickname) not between 2 and 12 then raise exception '닉네임은 2~12자로 입력해 주세요.'; end if;

  select * into r from public.participant_codes where code = p_code for update;
  if not found or r.disabled then raise exception '사용할 수 없는 코드입니다.'; end if;

  if r.nickname is null then
    issued_token := encode(extensions.gen_random_bytes(32), 'hex');
    update public.participant_codes
      set nickname = clean_nickname,
          participant_token_hash = encode(
            extensions.digest(convert_to(issued_token, 'UTF8'), 'sha256'),
            'hex'
          ),
          token_issued_at = now(),
          nickname_changed_at = now()
      where code = p_code;
    return jsonb_build_object('nickname', clean_nickname, 'access_token', issued_token, 'created', true);
  end if;

  if public.is_valid_participant_token(p_code, p_access_token) then
    return jsonb_build_object('nickname', r.nickname, 'access_token', p_access_token, 'created', false);
  end if;

  -- 새 기기 복구: 코드와 기존 닉네임이 모두 일치할 때 토큰을 회전합니다.
  if r.nickname = clean_nickname then
    issued_token := encode(extensions.gen_random_bytes(32), 'hex');
    update public.participant_codes
      set participant_token_hash = encode(
            extensions.digest(convert_to(issued_token, 'UTF8'), 'sha256'),
            'hex'
          ),
          token_issued_at = now()
      where code = p_code;
    return jsonb_build_object('nickname', r.nickname, 'access_token', issued_token, 'created', false);
  end if;

  raise exception '등록된 닉네임과 일치하지 않습니다. 관리자에게 문의하세요.';
end $$;

create or replace function public.change_participant_nickname(
  p_code text,
  p_access_token text,
  p_nickname text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r public.participant_codes%rowtype;
  clean_nickname text := regexp_replace(trim(p_nickname), '\s+', ' ', 'g');
begin
  if char_length(clean_nickname) not between 2 and 12 then raise exception '닉네임은 2~12자로 입력해 주세요.'; end if;
  select * into r from public.participant_codes where code = p_code for update;
  if not found or r.disabled or not public.is_valid_participant_token(p_code, p_access_token) then
    raise exception '참가자 인증이 만료되었거나 올바르지 않습니다.';
  end if;
  if r.nickname = clean_nickname then return jsonb_build_object('nickname', r.nickname, 'changed', false); end if;
  if r.nickname_changed_at is not null and r.nickname_changed_at > now() - interval '10 minutes' then
    raise exception '닉네임은 10분에 한 번만 변경할 수 있습니다.';
  end if;
  update public.participant_codes
    set nickname = clean_nickname, nickname_changed_at = now()
    where code = p_code;
  return jsonb_build_object('nickname', clean_nickname, 'changed', true);
end $$;

-- 4. 게임 시작: 참가자 토큰 검증과 횟수 차감을 하나의 트랜잭션에서 처리
create function public.start_game(p_code text, p_mode text, p_access_token text)
returns jsonb
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
  if p_code !~ '^[0-9]{4}$' or p_mode not in ('easy','hard') then raise exception '코드 또는 난이도가 올바르지 않습니다.'; end if;
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

  insert into public.game_launches(code, mode, nickname, time_limit_seconds, attempt_number)
  values(p_code, p_mode, r.nickname, limit_seconds, attempt)
  returning token, session_id, expires_at into t, sid, ex;

  return jsonb_build_object('token', t, 'session_id', sid, 'expires_at', ex);
end $$;

-- 입장권 만료(3분)는 최초 검증에만 사용합니다.
-- 검증 후에는 game_deadline_at이 실제 게임 제한 시간을 결정합니다.
create function public.verify_launch(p_token uuid, p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare r public.game_launches%rowtype;
begin
  select * into r from public.game_launches where token = p_token and mode = p_mode for update;
  if not found or r.finished_at is not null then raise exception '완료되었거나 존재하지 않는 게임 세션입니다.'; end if;

  if r.verified_at is null then
    if r.expires_at <= now() then raise exception '게임 입장권이 만료되었습니다.'; end if;
    update public.game_launches
      set verified_at = now(),
          game_deadline_at = now() + make_interval(secs => time_limit_seconds)
      where token = p_token
      returning * into r;
  elsif r.game_deadline_at is null then
    update public.game_launches
      set game_deadline_at = r.verified_at + make_interval(secs => r.time_limit_seconds)
      where token = p_token
      returning * into r;
  end if;

  if r.game_deadline_at <= now() then raise exception '게임 제한 시간이 만료되었습니다.'; end if;

  return jsonb_build_object(
    'session_id', r.session_id,
    'nickname', r.nickname,
    'time_limit_seconds', r.time_limit_seconds,
    'remaining_seconds', greatest(0, extract(epoch from (r.game_deadline_at-now()))),
    'deadline_at', r.game_deadline_at
  );
end $$;

create or replace function public.finish_game(
  p_token uuid,
  p_success boolean,
  p_remaining_seconds numeric,
  p_elapsed_seconds numeric
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r public.game_launches%rowtype;
  safe_remaining numeric;
  safe_elapsed numeric;
  server_remaining numeric;
  player_rank bigint;
  recorded_success boolean;
begin
  select * into r from public.game_launches where token = p_token for update;
  if not found or r.verified_at is null then raise exception '검증되지 않은 게임 세션입니다.'; end if;

  if r.finished_at is not null then
    select g.success, g.remaining_seconds into recorded_success, safe_remaining
    from public.game_results g where g.session_id = r.session_id;
  else
    server_remaining := greatest(0, extract(epoch from (r.game_deadline_at-now())));
    recorded_success := p_success and server_remaining > 0;
    safe_remaining := case when recorded_success
      then greatest(0, least(coalesce(p_remaining_seconds,0), server_remaining + 1, r.time_limit_seconds))
      else 0 end;
    safe_elapsed := greatest(0, r.time_limit_seconds-safe_remaining);

    update public.game_launches set finished_at = now() where token = p_token;
    insert into public.game_results(
      session_id, participant_code, nickname, difficulty, attempt_number,
      started_at, finished_at, time_limit_seconds, remaining_seconds,
      elapsed_seconds, success
    ) values (
      r.session_id, r.code, r.nickname, r.mode, r.attempt_number,
      r.verified_at, now(), r.time_limit_seconds, round(safe_remaining,2),
      round(safe_elapsed,2), recorded_success
    ) on conflict (session_id) do nothing;
  end if;

  with best as (
    select distinct on (g.participant_code)
      g.participant_code, g.remaining_seconds, g.created_at
    from public.game_results g
    where g.difficulty = r.mode and g.success and g.is_valid
    order by g.participant_code, g.remaining_seconds desc, g.created_at asc
  ), ranked as (
    select participant_code,
      row_number() over(order by remaining_seconds desc, created_at asc) rank_no
    from best
  )
  select rank_no into player_rank from ranked where participant_code = r.code;

  return jsonb_build_object(
    'nickname', (select p.nickname from public.participant_codes p where p.code = r.code),
    'success', recorded_success,
    'remaining_seconds', coalesce(safe_remaining,0),
    'rank', player_rank
  );
end $$;

-- 5. 공개 랭킹: 참가 코드/세션 ID를 반환하지 않음
create or replace function public.public_leaderboard(p_mode text)
returns table(rank_no bigint, nickname text, remaining_seconds numeric)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  with best as (
    select distinct on (g.participant_code)
      g.participant_code, g.remaining_seconds, g.created_at
    from public.game_results g
    where g.difficulty = p_mode and g.success and g.is_valid
    order by g.participant_code, g.remaining_seconds desc, g.created_at asc
  )
  select
    row_number() over(order by b.remaining_seconds desc, b.created_at asc),
    p.nickname,
    b.remaining_seconds
  from best b
  join public.participant_codes p on p.code = b.participant_code
  order by b.remaining_seconds desc, b.created_at asc;
$$;

-- 6. 관리자 RPC
create or replace function public.admin_status()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'authenticated', auth.uid() is not null,
    'is_admin', public.is_event_admin(),
    'user_id', auth.uid()
  );
$$;

create function public.admin_list_codes()
returns table(code text, nickname text, easy_used integer, hard_used integer, disabled boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_event_admin() then raise exception '관리자 권한이 없습니다.'; end if;
  return query
    select p.code, p.nickname, p.easy_used, p.hard_used, p.disabled
    from public.participant_codes p order by p.code;
end $$;

create or replace function public.admin_list_results()
returns table(
  id bigint, participant_code text, nickname text, difficulty text,
  attempt_number integer, remaining_seconds numeric, elapsed_seconds numeric,
  success boolean, is_valid boolean, started_at timestamptz, finished_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_event_admin() then raise exception '관리자 권한이 없습니다.'; end if;
  return query
    select g.id, g.participant_code, p.nickname, g.difficulty,
      g.attempt_number, g.remaining_seconds, g.elapsed_seconds,
      g.success, g.is_valid, g.started_at, g.finished_at
    from public.game_results g
    join public.participant_codes p on p.code = g.participant_code
    order by g.created_at desc;
end $$;

create or replace function public.admin_update_nickname(p_code text, p_nickname text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare clean_nickname text := regexp_replace(trim(p_nickname), '\s+', ' ', 'g');
begin
  if not public.is_event_admin() then raise exception '관리자 권한이 없습니다.'; end if;
  if char_length(clean_nickname) not between 2 and 12 then raise exception '닉네임은 2~12자여야 합니다.'; end if;
  update public.participant_codes
    set nickname = clean_nickname, nickname_changed_at = now()
    where code = p_code;
  if not found then raise exception '해당 참가 코드가 없습니다.'; end if;
  return true;
end $$;

create or replace function public.admin_set_result_valid(p_id bigint, p_valid boolean)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_event_admin() then raise exception '관리자 권한이 없습니다.'; end if;
  update public.game_results set is_valid = p_valid where id = p_id;
  return found;
end $$;

-- 7. 최소 권한 복구
revoke execute on function public.is_valid_participant_token(text,text) from public, anon, authenticated;
revoke execute on function public.is_event_admin() from public, anon;
revoke execute on function public.admin_status(), public.admin_list_codes(),
  public.admin_list_results(), public.admin_update_nickname(text,text),
  public.admin_set_result_valid(bigint,boolean)
  from public, anon;
revoke execute on function public.admin_create_codes(integer),
  public.admin_update_code(text,boolean,boolean)
  from public, anon;

grant execute on function public.check_code(text),
  public.register_participant(text,text,text),
  public.change_participant_nickname(text,text,text),
  public.start_game(text,text,text), public.verify_launch(uuid,text),
  public.finish_game(uuid,boolean,numeric,numeric), public.public_leaderboard(text)
  to anon, authenticated;

grant execute on function public.admin_status(), public.admin_list_codes(),
  public.admin_list_results(), public.admin_update_nickname(text,text),
  public.admin_set_result_valid(bigint,boolean),
  public.admin_create_codes(integer),
  public.admin_update_code(text,boolean,boolean)
  to authenticated;

commit;

-- 적용 후 검증
select p.proname, pg_get_function_identity_arguments(p.oid) arguments,
  pg_get_function_result(p.oid) return_type
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public'
  and p.proname in ('start_game','verify_launch','admin_list_codes')
order by p.proname, arguments;
