-- AFTER 11:07 / 관리자 계정 1회 등록
-- 1. Supabase Dashboard > Authentication > Users에서 관리자 계정을 먼저 생성합니다.
-- 2. 아래 YOUR_ADMIN_EMAIL을 실제 관리자 이메일로 바꿉니다.
-- 3. Supabase SQL Editor에서 이 파일 전체를 실행합니다.

do $$
declare
  target_email text := lower(trim('YOUR_ADMIN_EMAIL'));
  target_user_id uuid;
begin
  if target_email = 'your_admin_email' or target_email = '' then
    raise exception 'YOUR_ADMIN_EMAIL을 실제 관리자 이메일로 변경해 주세요.';
  end if;

  select u.id
    into target_user_id
  from auth.users u
  where lower(u.email) = target_email
  order by u.created_at asc
  limit 1;

  if target_user_id is null then
    raise exception 'Authentication > Users에서 이메일 % 계정을 찾을 수 없습니다.', target_email;
  end if;

  insert into public.admin_users(user_id)
  values (target_user_id)
  on conflict (user_id) do nothing;

  raise notice '관리자 등록 완료: % / %', target_email, target_user_id;
end
$$;

select
  a.user_id,
  u.email,
  u.created_at
from public.admin_users a
join auth.users u on u.id = a.user_id
order by u.created_at;
