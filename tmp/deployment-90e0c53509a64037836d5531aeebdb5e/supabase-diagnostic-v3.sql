-- AFTER 11:07 / 운영 DB 진단 전용 (데이터 변경 없음)

-- pgcrypto가 설치된 스키마와 v3에서 사용하는 함수 시그니처를 먼저 확인합니다.
select
  e.extname,
  n.nspname as extension_schema,
  e.extversion
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
where e.extname = 'pgcrypto';

select
  to_regprocedure('extensions.digest(bytea,text)') as digest_function,
  to_regprocedure('extensions.gen_random_bytes(integer)') as random_bytes_function;

select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_result(p.oid) as return_type,
  pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as security_definer,
  p.proconfig as function_settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'check_code', 'register_participant', 'change_participant_nickname',
    'start_game', 'verify_launch', 'finish_game', 'public_leaderboard',
    'admin_list_codes', 'admin_list_results', 'admin_status'
  )
order by p.proname, identity_arguments;

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('participant_codes', 'game_launches', 'game_results')
order by table_name, ordinal_position;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('participant_codes', 'game_launches', 'game_results');

select
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name in (
    'check_code', 'register_participant', 'change_participant_nickname',
    'start_game', 'verify_launch', 'finish_game', 'public_leaderboard',
    'admin_list_codes', 'admin_list_results', 'admin_status'
  )
order by routine_name, grantee;
