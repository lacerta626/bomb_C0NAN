-- AFTER 11:07 / 독립 일반 공개 게임 전용 설치 SQL
-- 기존 이벤트 테이블, 함수, 정책을 조회·수정·삭제하지 않습니다.
-- DROP, TRUNCATE, DELETE 없음. 동일 정의로 중복 실행해도 안전합니다.
begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.public_game_open_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  token uuid not null unique default extensions.gen_random_uuid(),
  player_hash text not null,
  nickname text not null check (char_length(nickname) between 2 and 12),
  difficulty text not null check (difficulty in ('easy','hard')),
  time_limit_seconds integer not null check (time_limit_seconds in (90,120)),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '3 minutes',
  verified_at timestamptz,
  deadline_at timestamptz,
  submitted_at timestamptz
);

create table if not exists public.public_game_open_records (
  id bigint generated always as identity primary key,
  session_id uuid not null unique references public.public_game_open_sessions(id),
  player_hash text not null,
  nickname text not null,
  difficulty text not null check (difficulty in ('easy','hard')),
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  time_limit_seconds integer not null,
  remaining_seconds numeric(8,2) not null default 0,
  elapsed_seconds numeric(8,2) not null default 0,
  success boolean not null,
  is_valid boolean not null default true,
  invalid_reason text,
  created_at timestamptz not null default now()
);

create index if not exists public_game_open_sessions_rate_idx
  on public.public_game_open_sessions(player_hash, created_at desc);
create index if not exists public_game_open_records_rank_idx
  on public.public_game_open_records(difficulty, success, is_valid, remaining_seconds desc, created_at);

alter table public.public_game_open_sessions enable row level security;
alter table public.public_game_open_records enable row level security;
revoke all on public.public_game_open_sessions, public.public_game_open_records from anon, authenticated;

create or replace function public.public_game_start(p_nickname text, p_mode text, p_player_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  clean_name text := regexp_replace(trim(p_nickname), '\s+', ' ', 'g');
  hashed_player text;
  created public.public_game_open_sessions%rowtype;
begin
  if char_length(clean_name) not between 2 and 12
     or clean_name !~ '^[가-힣A-Za-z0-9 ]+$' then
    raise exception '닉네임은 한글, 영문, 숫자로 2~12자 입력해 주세요.';
  end if;
  if p_mode not in ('easy','hard') then raise exception '난이도가 올바르지 않습니다.'; end if;
  if p_player_id is null or char_length(p_player_id) not between 16 and 128 then raise exception '플레이어 식별자가 올바르지 않습니다.'; end if;

  hashed_player := encode(extensions.digest(convert_to(p_player_id,'UTF8'),'sha256'),'hex');
  if (select count(*) from public.public_game_open_sessions where created_at>now()-interval '1 minute') >= 300 then
    raise exception '현재 요청이 많습니다. 잠시 후 다시 시도해 주세요.';
  end if;
  if (select count(*) from public.public_game_open_sessions where player_hash=hashed_player and created_at>now()-interval '1 minute') >= 8 then
    raise exception '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  end if;

  insert into public.public_game_open_sessions(player_hash,nickname,difficulty,time_limit_seconds)
  values(hashed_player,clean_name,p_mode,case when p_mode='easy' then 90 else 120 end)
  returning * into created;
  return jsonb_build_object('token',created.token,'session_id',created.id,'expires_at',created.expires_at);
end $$;

create or replace function public.public_game_verify(p_token uuid, p_mode text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare session_row public.public_game_open_sessions%rowtype;
begin
  select * into session_row from public.public_game_open_sessions
  where token=p_token and difficulty=p_mode for update;
  if not found or session_row.submitted_at is not null then raise exception '완료되었거나 존재하지 않는 게임 세션입니다.'; end if;
  if session_row.verified_at is null then
    if session_row.expires_at<=now() then raise exception '게임 입장권이 만료되었습니다.'; end if;
    update public.public_game_open_sessions
      set verified_at=now(), deadline_at=now()+make_interval(secs=>time_limit_seconds)
      where token=p_token returning * into session_row;
  end if;
  if session_row.deadline_at<=now() then raise exception '게임 제한 시간이 만료되었습니다.'; end if;
  return jsonb_build_object('nickname',session_row.nickname,'time_limit_seconds',session_row.time_limit_seconds,
    'remaining_seconds',greatest(0,extract(epoch from(session_row.deadline_at-now()))),'deadline_at',session_row.deadline_at);
end $$;

create or replace function public.public_game_submit(p_token uuid,p_success boolean,p_remaining_seconds numeric,p_elapsed_seconds numeric)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  session_row public.public_game_open_sessions%rowtype;
  server_elapsed numeric; safe_remaining numeric; accepted boolean; minimum_elapsed integer;
  player_rank bigint; top_rows jsonb;
begin
  select * into session_row from public.public_game_open_sessions where token=p_token for update;
  if not found or session_row.verified_at is null then raise exception '검증되지 않은 게임 세션입니다.'; end if;
  if session_row.submitted_at is not null then raise exception '이미 제출된 게임 세션입니다.'; end if;

  server_elapsed:=extract(epoch from(now()-session_row.verified_at));
  minimum_elapsed:=case when session_row.difficulty='easy' then 8 else 15 end;
  accepted:=p_success and now()<session_row.deadline_at and server_elapsed>=minimum_elapsed;
  safe_remaining:=case when accepted then greatest(0,least(coalesce(p_remaining_seconds,0),
    extract(epoch from(session_row.deadline_at-now()))+1,session_row.time_limit_seconds-server_elapsed+1)) else 0 end;

  update public.public_game_open_sessions set submitted_at=now() where token=p_token;
  insert into public.public_game_open_records(session_id,player_hash,nickname,difficulty,started_at,finished_at,
    time_limit_seconds,remaining_seconds,elapsed_seconds,success,is_valid,invalid_reason)
  values(session_row.id,session_row.player_hash,session_row.nickname,session_row.difficulty,session_row.verified_at,now(),
    session_row.time_limit_seconds,round(safe_remaining,2),round(server_elapsed,2),accepted,accepted,
    case when p_success and server_elapsed<minimum_elapsed then 'too_fast' when p_success and now()>=session_row.deadline_at then 'expired' end);

  with best as (
    select distinct on(player_hash) player_hash,nickname,remaining_seconds,created_at
    from public.public_game_open_records where difficulty=session_row.difficulty and success and is_valid
    order by player_hash,remaining_seconds desc,created_at
  ), ranked as (
    select *,row_number() over(order by remaining_seconds desc,created_at) rank_no from best
  ) select rank_no into player_rank from ranked where player_hash=session_row.player_hash;

  with best as (
    select distinct on(player_hash) player_hash,nickname,remaining_seconds,created_at
    from public.public_game_open_records where difficulty=session_row.difficulty and success and is_valid
    order by player_hash,remaining_seconds desc,created_at
  ), ranked as (
    select nickname,remaining_seconds,created_at,row_number() over(order by remaining_seconds desc,created_at) rank_no from best
  ) select coalesce(jsonb_agg(jsonb_build_object('rank',rank_no,'nickname',nickname,
      'remaining_seconds',remaining_seconds,'achieved_at',created_at) order by rank_no),'[]'::jsonb)
    into top_rows from ranked where rank_no<=10;

  return jsonb_build_object('nickname',session_row.nickname,'success',accepted,
    'remaining_seconds',safe_remaining,'rank',player_rank,'top10',top_rows);
end $$;

create or replace function public.public_game_leaderboard(p_mode text,p_limit integer default 10)
returns table(rank_no bigint,nickname text,remaining_seconds numeric,achieved_at timestamptz)
language sql security definer set search_path = pg_catalog, public stable
as $$
  with best as (
    select distinct on(player_hash) player_hash,nickname,remaining_seconds,created_at
    from public.public_game_open_records
    where difficulty=p_mode and success and is_valid
    order by player_hash,remaining_seconds desc,created_at
  ), ranked as (
    select row_number() over(order by remaining_seconds desc,created_at) rank_no,nickname,remaining_seconds,created_at
    from best
  ) select rank_no,nickname,remaining_seconds,created_at from ranked
    where rank_no<=least(greatest(coalesce(p_limit,10),1),100) order by rank_no;
$$;

create or replace function public.public_game_ranking_page(p_mode text,p_limit integer default 10,p_player_id text default null)
returns table(rank_no bigint,nickname text,remaining_seconds numeric,achieved_at timestamptz,is_current_player boolean)
language sql security definer set search_path = pg_catalog, public stable
as $$
  with identity as (
    select case when p_player_id is not null and char_length(p_player_id) between 16 and 128
      then encode(extensions.digest(convert_to(p_player_id,'UTF8'),'sha256'),'hex') end player_hash
  ), best as (
    select distinct on(r.player_hash) r.player_hash,r.nickname,r.remaining_seconds,r.created_at
    from public.public_game_open_records r
    where r.difficulty=p_mode and r.success and r.is_valid
    order by r.player_hash,r.remaining_seconds desc,r.created_at
  ), ranked as (
    select row_number() over(order by b.remaining_seconds desc,b.created_at) rank_no,
      b.player_hash,b.nickname,b.remaining_seconds,b.created_at
    from best b
  )
  select r.rank_no,r.nickname,r.remaining_seconds,r.created_at,
    coalesce(r.player_hash=(select player_hash from identity),false)
  from ranked r
  where r.rank_no<=least(greatest(coalesce(p_limit,10),1),5000)
     or r.player_hash=(select player_hash from identity)
  order by r.rank_no;
$$;

revoke execute on function public.public_game_start(text,text,text),public.public_game_verify(uuid,text),
  public.public_game_submit(uuid,boolean,numeric,numeric),public.public_game_leaderboard(text,integer),
  public.public_game_ranking_page(text,integer,text) from public;
grant execute on function public.public_game_start(text,text,text),public.public_game_verify(uuid,text),
  public.public_game_submit(uuid,boolean,numeric,numeric),public.public_game_leaderboard(text,integer),
  public.public_game_ranking_page(text,integer,text) to anon,authenticated;
commit;
