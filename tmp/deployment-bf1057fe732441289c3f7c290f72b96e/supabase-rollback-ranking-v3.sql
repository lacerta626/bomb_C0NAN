-- AFTER 11:07 / v3 롤백 가이드
-- 데이터 보존을 위해 컬럼/테이블은 삭제하지 않습니다.
-- 아래 작업은 v3 RPC 노출만 회수합니다. 운영 적용 전 반드시 백업하세요.
-- 주의: v3 마이그레이션이 ERROR로 끝났다면 BEGIN~COMMIT 전체가 자동 롤백되므로
-- 이 파일을 실행할 필요 없이 수정된 마이그레이션을 다시 실행하면 됩니다.

begin;

-- REVOKE에는 IF EXISTS 문법이 없습니다. 마이그레이션이 중간에 실패해
-- 함수가 생성되지 않은 상태에서도 롤백 자체가 실패하지 않도록 확인 후 회수합니다.
do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.register_participant(text,text,text)',
    'public.change_participant_nickname(text,text,text)',
    'public.start_game(text,text,text)',
    'public.verify_launch(uuid,text)',
    'public.finish_game(uuid,boolean,numeric,numeric)',
    'public.public_leaderboard(text)'
  ] loop
    if to_regprocedure(signature) is not null then
      execute format(
        'revoke execute on function %s from anon, authenticated',
        signature
      );
    end if;
  end loop;

  foreach signature in array array[
    'public.admin_status()',
    'public.admin_list_codes()',
    'public.admin_list_results()',
    'public.admin_update_nickname(text,text)',
    'public.admin_set_result_valid(bigint,boolean)'
  ] loop
    if to_regprocedure(signature) is not null then
      execute format(
        'revoke execute on function %s from authenticated',
        signature
      );
    end if;
  end loop;
end
$$;

commit;

-- 이전 함수 본문 복구는 backup-pre-integration-20261106.zip의
-- supabase-setup.sql을 검토한 후 필요한 함수만 명시적 시그니처로 재생성하세요.
-- DROP TABLE / TRUNCATE / DROP CASCADE는 사용하지 마세요.
