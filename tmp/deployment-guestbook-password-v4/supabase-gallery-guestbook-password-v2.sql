-- AFTER 11:07 / 갤러리 방명록 작성자 수정·삭제 v2
-- 적용 전 변경 사항
-- 1) gallery_guestbook에 nullable password_hash와 updated_at을 추가합니다.
-- 2) 기존 행은 password_hash=NULL로 유지되어 관리자만 삭제할 수 있습니다.
-- 3) 새 글은 4~8자리 숫자 비밀번호를 bcrypt로만 저장합니다.
-- 4) 일반 사용자의 직접 UPDATE/DELETE 권한은 계속 차단합니다.
-- 5) 전용 RPC에서 비밀번호를 검증하며 15분 동안 5회 실패 시 잠급니다.
-- 기존 게임·랭킹·관리자 인증 테이블과 함수는 변경하지 않습니다.

begin;

alter table public.gallery_guestbook
  add column if not exists password_hash text;
alter table public.gallery_guestbook
  add column if not exists updated_at timestamptz;

create table if not exists public.gallery_guestbook_password_attempts (
  entry_id uuid not null references public.gallery_guestbook(id) on delete cascade,
  client_hash text not null,
  window_started_at timestamptz not null default now(),
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  primary key (entry_id, client_hash)
);

alter table public.gallery_guestbook_password_attempts enable row level security;
revoke all on public.gallery_guestbook_password_attempts from anon, authenticated;

-- 이전 3개 인자 작성 RPC를 제거해 비밀번호 없는 새 글 작성을 차단합니다.
drop function if exists public.post_gallery_guestbook(text, text, text);

create or replace function public.post_gallery_guestbook(
  p_nickname text,
  p_message text,
  p_password text,
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
  if p_password !~ '^[0-9]{4,8}$' then
    raise exception '작성자 비밀번호는 4~8자리 숫자로 입력해 주세요.';
  end if;
  if p_client_token is null or char_length(p_client_token) not between 32 and 128 then
    raise exception '방명록 작성 인증값이 올바르지 않습니다.';
  end if;

  token_hash := encode(extensions.digest(convert_to(p_client_token, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtext(token_hash));
  if exists (
    select 1 from public.gallery_guestbook_rate_limits r
    where r.client_hash = token_hash
      and r.last_created_at > now() - interval '30 seconds'
  ) then
    raise exception '방명록은 30초에 한 번 작성할 수 있습니다.';
  end if;

  insert into public.gallery_guestbook(nickname, message, password_hash)
  values (
    clean_nickname,
    clean_message,
    extensions.crypt(p_password, extensions.gen_salt('bf', 12))
  )
  returning id, created_at into new_id, created;

  insert into public.gallery_guestbook_rate_limits(client_hash, last_created_at)
  values (token_hash, now())
  on conflict (client_hash) do update set last_created_at = excluded.last_created_at;

  return jsonb_build_object('id', new_id, 'created_at', created);
end
$$;

-- 내부 전용 검증기입니다. 실패 시 예외를 발생시키지 않아 시도 횟수가 롤백되지 않습니다.
create or replace function public.verify_gallery_guestbook_password_internal(
  p_id uuid,
  p_password text,
  p_client_token text
) returns text
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  stored_hash text;
  token_hash text;
  attempt public.gallery_guestbook_password_attempts%rowtype;
begin
  select g.password_hash into stored_hash
  from public.gallery_guestbook g
  where g.id = p_id
  for update;
  if not found then return 'not_found'; end if;
  if stored_hash is null then return 'legacy'; end if;
  if p_client_token is null or char_length(p_client_token) not between 32 and 128 then
    return 'invalid';
  end if;

  token_hash := encode(extensions.digest(convert_to(p_client_token, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtext(p_id::text || token_hash));

  select * into attempt
  from public.gallery_guestbook_password_attempts a
  where a.entry_id = p_id and a.client_hash = token_hash
  for update;

  if found and attempt.window_started_at > now() - interval '15 minutes'
      and attempt.failed_attempts >= 5 then
    return 'locked';
  end if;

  if p_password !~ '^[0-9]{4,8}$'
      or extensions.crypt(p_password, stored_hash) <> stored_hash then
    insert into public.gallery_guestbook_password_attempts(
      entry_id, client_hash, window_started_at, failed_attempts
    ) values (p_id, token_hash, now(), 1)
    on conflict (entry_id, client_hash) do update set
      window_started_at = case
        when public.gallery_guestbook_password_attempts.window_started_at <= now() - interval '15 minutes'
        then now() else public.gallery_guestbook_password_attempts.window_started_at end,
      failed_attempts = case
        when public.gallery_guestbook_password_attempts.window_started_at <= now() - interval '15 minutes'
        then 1 else least(5, public.gallery_guestbook_password_attempts.failed_attempts + 1) end;
    return 'invalid';
  end if;

  delete from public.gallery_guestbook_password_attempts
  where entry_id = p_id and client_hash = token_hash;
  return 'ok';
end
$$;

create or replace function public.check_gallery_guestbook_password(
  p_id uuid,
  p_password text,
  p_client_token text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare state text;
begin
  state := public.verify_gallery_guestbook_password_internal(p_id, p_password, p_client_token);
  return jsonb_build_object('ok', state = 'ok', 'reason', state);
end
$$;

create or replace function public.update_gallery_guestbook(
  p_id uuid,
  p_password text,
  p_nickname text,
  p_message text,
  p_client_token text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  state text;
  clean_nickname text := trim(p_nickname);
  clean_message text := trim(p_message);
begin
  if char_length(clean_nickname) not between 1 and 20
      or char_length(clean_message) not between 1 and 500 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_content');
  end if;
  state := public.verify_gallery_guestbook_password_internal(p_id, p_password, p_client_token);
  if state <> 'ok' then return jsonb_build_object('ok', false, 'reason', state); end if;

  update public.gallery_guestbook
  set nickname = clean_nickname, message = clean_message, updated_at = now()
  where id = p_id;
  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.delete_gallery_guestbook(
  p_id uuid,
  p_password text,
  p_client_token text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare state text;
begin
  state := public.verify_gallery_guestbook_password_internal(p_id, p_password, p_client_token);
  if state <> 'ok' then return jsonb_build_object('ok', false, 'reason', state); end if;
  delete from public.gallery_guestbook where id = p_id;
  return jsonb_build_object('ok', true);
end
$$;

revoke execute on function public.verify_gallery_guestbook_password_internal(uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.post_gallery_guestbook(text, text, text, text),
  public.check_gallery_guestbook_password(uuid, text, text),
  public.update_gallery_guestbook(uuid, text, text, text, text),
  public.delete_gallery_guestbook(uuid, text, text)
  from public;

grant execute on function public.post_gallery_guestbook(text, text, text, text),
  public.check_gallery_guestbook_password(uuid, text, text),
  public.update_gallery_guestbook(uuid, text, text, text, text),
  public.delete_gallery_guestbook(uuid, text, text)
  to anon, authenticated;

commit;

notify pgrst, 'reload schema';
