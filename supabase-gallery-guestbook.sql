-- AFTER 11:07 / 갤러리 방명록 전용 설치
-- 기존 게임, 랭킹, 참가 코드 테이블과 함수는 변경하지 않습니다.
-- Supabase SQL Editor에서 검토 후 이 파일 전체를 한 번 실행하세요.

begin;

create table if not exists public.gallery_guestbook (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  message text not null,
  created_at timestamptz not null default now(),
  constraint gallery_guestbook_nickname_length
    check (char_length(trim(nickname)) between 1 and 20),
  constraint gallery_guestbook_message_length
    check (char_length(trim(message)) between 1 and 500)
);

create index if not exists gallery_guestbook_created_at_idx
  on public.gallery_guestbook(created_at desc, id desc);

-- 익명 작성의 짧은 시간 내 반복 등록을 서버에서 제한하기 위한 내부 테이블입니다.
create table if not exists public.gallery_guestbook_rate_limits (
  client_hash text primary key,
  last_created_at timestamptz not null
);

alter table public.gallery_guestbook enable row level security;
alter table public.gallery_guestbook_rate_limits enable row level security;

revoke all on public.gallery_guestbook from anon, authenticated;
revoke all on public.gallery_guestbook_rate_limits from anon, authenticated;

drop policy if exists gallery_guestbook_public_read on public.gallery_guestbook;
create policy gallery_guestbook_public_read
  on public.gallery_guestbook
  for select
  to anon, authenticated
  using (true);

-- 직접 INSERT는 허용하지 않습니다. 아래 보안 정의자 RPC만 INSERT할 수 있어
-- 길이 검증과 30초 서버 제한을 우회할 수 없습니다.
grant select (id, nickname, message, created_at)
  on public.gallery_guestbook to anon, authenticated;

create or replace function public.list_gallery_guestbook(
  p_offset integer default 0,
  p_limit integer default 20
) returns table(id uuid, nickname text, message text, created_at timestamptz)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select g.id, g.nickname, g.message, g.created_at
  from public.gallery_guestbook g
  order by g.created_at desc, g.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 20))
  offset greatest(0, least(coalesce(p_offset, 0), 10000));
$$;

create or replace function public.post_gallery_guestbook(
  p_nickname text,
  p_message text,
  p_client_token text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  clean_nickname text := trim(p_nickname);
  clean_message text := trim(p_message);
  token_hash text;
  new_id uuid;
  created timestamptz;
begin
  if char_length(clean_nickname) not between 1 and 20 then
    raise exception '닉네임은 공백을 제외하고 1~20자로 입력해 주세요.';
  end if;
  if char_length(clean_message) not between 1 and 500 then
    raise exception '방명록 내용은 공백을 제외하고 1~500자로 입력해 주세요.';
  end if;
  if p_client_token is null or char_length(p_client_token) not between 32 and 128 then
    raise exception '방명록 작성 인증값이 올바르지 않습니다.';
  end if;

  token_hash := encode(
    extensions.digest(convert_to(p_client_token, 'UTF8'), 'sha256'),
    'hex'
  );
  perform pg_advisory_xact_lock(hashtext(token_hash));

  if exists (
    select 1 from public.gallery_guestbook_rate_limits r
    where r.client_hash = token_hash
      and r.last_created_at > now() - interval '30 seconds'
  ) then
    raise exception '방명록은 30초에 한 번 작성할 수 있습니다.';
  end if;

  insert into public.gallery_guestbook(nickname, message)
  values (clean_nickname, clean_message)
  returning id, created_at into new_id, created;

  insert into public.gallery_guestbook_rate_limits(client_hash, last_created_at)
  values (token_hash, now())
  on conflict (client_hash) do update
    set last_created_at = excluded.last_created_at;

  return jsonb_build_object('id', new_id, 'created_at', created);
end
$$;

create or replace function public.admin_list_gallery_guestbook()
returns table(id uuid, nickname text, message text, created_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_event_admin() then
    raise exception '관리자 권한이 없습니다.';
  end if;
  return query
    select g.id, g.nickname, g.message, g.created_at
    from public.gallery_guestbook g
    order by g.created_at desc, g.id desc;
end
$$;

create or replace function public.admin_delete_gallery_guestbook(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_event_admin() then
    raise exception '관리자 권한이 없습니다.';
  end if;
  delete from public.gallery_guestbook where id = p_id;
  return found;
end
$$;

revoke execute on function public.list_gallery_guestbook(integer, integer),
  public.post_gallery_guestbook(text, text, text),
  public.admin_list_gallery_guestbook(),
  public.admin_delete_gallery_guestbook(uuid)
  from public;

grant execute on function public.list_gallery_guestbook(integer, integer),
  public.post_gallery_guestbook(text, text, text)
  to anon, authenticated;

grant execute on function public.admin_list_gallery_guestbook(),
  public.admin_delete_gallery_guestbook(uuid)
  to authenticated;

-- Realtime 구독 대상에 한 번만 추가합니다.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'gallery_guestbook'
  ) then
    alter publication supabase_realtime add table public.gallery_guestbook;
  end if;
end
$$;

commit;

notify pgrst, 'reload schema';

-- CAPTCHA를 추가하려면 Edge Function에서 CAPTCHA 토큰을 검증한 뒤
-- post_gallery_guestbook RPC를 호출하도록 프런트엔드 호출 지점만 교체하면 됩니다.
