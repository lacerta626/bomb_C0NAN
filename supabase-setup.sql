-- AFTER 11:07: Supabase SQL Editor에서 한 번 실행하세요.
create extension if not exists pgcrypto;
create table if not exists public.participant_codes (
 code text primary key check (code ~ '^[0-9]{4}$'),
 easy_used integer not null default 0 check (easy_used between 0 and 2),
 hard_used integer not null default 0 check (hard_used between 0 and 2),
 disabled boolean not null default false,
 created_at timestamptz not null default now()
);
create table if not exists public.game_launches (
 token uuid primary key default gen_random_uuid(),
 code text not null references public.participant_codes(code),
 mode text not null check(mode in ('easy','hard')),
 expires_at timestamptz not null default (now()+interval '3 minutes'),
 verified_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.guestbook (
 id bigint generated always as identity primary key,
 nickname text not null check(char_length(nickname) between 1 and 20),
 message text not null check(char_length(message) between 1 and 500),
 created_at timestamptz not null default now()
);
create table if not exists public.admin_users (user_id uuid primary key references auth.users(id));
alter table public.participant_codes enable row level security;
alter table public.game_launches enable row level security;
alter table public.guestbook enable row level security;
alter table public.admin_users enable row level security;
revoke all on public.participant_codes,public.game_launches,public.guestbook,public.admin_users from anon,authenticated;
-- RPC만 노출, 원본 테이블에 직접 접근 불가
create or replace function public.check_code(p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.participant_codes%rowtype;
begin
 if p_code !~ '^[0-9]{4}$' then raise exception '4자리 숫자를 입력해 주세요.'; end if;
 select * into r from public.participant_codes where code=p_code and not disabled;
 if not found then raise exception '등록되지 않았거나 차단된 코드입니다.'; end if;
 return jsonb_build_object('easy',2-r.easy_used,'hard',2-r.hard_used);
end $$;
create or replace function public.start_game(p_code text,p_mode text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.participant_codes%rowtype; t uuid; ex timestamptz;
begin
 if p_code !~ '^[0-9]{4}$' or p_mode not in ('easy','hard') then raise exception '코드 또는 모드가 올바르지 않습니다.'; end if;
 select * into r from public.participant_codes where code=p_code for update;
 if not found or r.disabled then raise exception '사용할 수 없는 코드입니다.'; end if;
 if p_mode='easy' then
  if r.easy_used>=2 then raise exception 'Easy 기회를 모두 사용했습니다.'; end if;
  update public.participant_codes set easy_used=easy_used+1 where code=p_code;
 else
  if r.hard_used>=2 then raise exception 'Hard 기회를 모두 사용했습니다.'; end if;
  update public.participant_codes set hard_used=hard_used+1 where code=p_code;
 end if;
 insert into public.game_launches(code,mode) values(p_code,p_mode) returning token,expires_at into t,ex;
 return jsonb_build_object('token',t,'expires_at',ex);
end $$;
create or replace function public.verify_launch(p_token uuid,p_mode text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.game_launches set verified_at=now() where token=p_token and mode=p_mode and verified_at is null and expires_at>now();
 if not found then raise exception '유효하지 않거나 이미 사용한 입장권입니다.'; end if;
 return true;
end $$;
create or replace function public.list_guestbook(p_offset integer default 0) returns table(nickname text,message text,created_at timestamptz) language sql security definer set search_path='' as $$
 select g.nickname,g.message,g.created_at from public.guestbook g order by g.id desc limit 20 offset greatest(0,least(p_offset,10000));
$$;
create or replace function public.post_guestbook(p_nickname text,p_message text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if char_length(trim(p_nickname)) not between 1 and 20 or char_length(trim(p_message)) not between 1 and 500 then raise exception '닉네임 또는 메시지 길이를 확인하세요.'; end if;
 insert into public.guestbook(nickname,message) values(trim(p_nickname),trim(p_message));return true;
end $$;
create or replace function public.is_event_admin() returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from public.admin_users where user_id=(select auth.uid()));
$$;
create or replace function public.admin_create_codes(p_amount integer default 100) returns text[] language plpgsql security definer set search_path='' as $$
declare codes text[]:=array[]::text[]; c text; tries integer:=0;
begin
 if not public.is_event_admin() then raise exception '관리자 권한이 없습니다.'; end if;
 if p_amount<1 or p_amount>100 then raise exception '1~100개만 생성할 수 있습니다.'; end if;
 while cardinality(codes)<p_amount loop
  tries:=tries+1; if tries>100000 then raise exception '남은 코드가 부족합니다.'; end if;
  c:=lpad((floor(random()*10000)::integer)::text,4,'0');
  insert into public.participant_codes(code) values(c) on conflict do nothing;
  if found then codes:=array_append(codes,c); end if;
 end loop;
 return codes;
end $$;
create or replace function public.admin_list_codes() returns table(code text,easy_used integer,hard_used integer,disabled boolean) language plpgsql security definer set search_path='' as $$
begin
 if not public.is_event_admin() then raise exception '관리자 권한이 없습니다.'; end if;
 return query select p.code,p.easy_used,p.hard_used,p.disabled from public.participant_codes p order by p.code;
end $$;
create or replace function public.admin_update_code(p_code text,p_reset boolean default false,p_disabled boolean default null) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not public.is_event_admin() then raise exception '관리자 권한이 없습니다.'; end if;
 update public.participant_codes set easy_used=case when p_reset then 0 else easy_used end,hard_used=case when p_reset then 0 else hard_used end,disabled=coalesce(p_disabled,disabled) where code=p_code;
 if not found then raise exception '해당 코드가 없습니다.'; end if;
 return true;
end $$;
revoke execute on function public.is_event_admin() from public,anon;
revoke execute on function public.admin_create_codes(integer),public.admin_list_codes(),public.admin_update_code(text,boolean,boolean) from public,anon;
grant execute on function public.check_code(text),public.start_game(text,text),public.verify_launch(uuid,text),public.list_guestbook(integer),public.post_guestbook(text,text) to anon,authenticated;
grant execute on function public.admin_create_codes(integer),public.admin_list_codes(),public.admin_update_code(text,boolean,boolean) to authenticated;
